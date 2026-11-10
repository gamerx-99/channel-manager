import { useEffect, useState, type FormEvent } from 'react';
import { hasHotelPermission } from '@shared/authorization';
import HotelClosureSettings from '@/components/HotelClosureSettings';
import { useTranslation } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { HotelDataTransfer } from './HotelDataTransfer';

type Hotel = { id: string; name: string; slug: string; public_enabled: boolean };

export default function HotelGeneralOperations({ hotel }: { hotel: Hotel }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const auth = trpc.auth.me.useQuery();
  const canClose = hasHotelPermission(auth.data?.roles ?? [], auth.data?.memberships ?? [], hotel.id, 'property.close_hotel');
  const timeout = trpc.slipok.getBookingRequestTimeout.useQuery({ hotel_id: hotel.id });
  const [hours, setHours] = useState('24');
  const [timeoutError, setTimeoutError] = useState<string | null>(null);
  const [timeoutSaved, setTimeoutSaved] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    if (timeout.data) setHours(String(timeout.data.booking_request_timeout_hours));
  }, [timeout.data]);

  const saveTimeout = trpc.slipok.saveBookingRequestTimeout.useMutation({
    onSuccess: async () => {
      setTimeoutError(null);
      setTimeoutSaved(true);
      await utils.slipok.getBookingRequestTimeout.invalidate({ hotel_id: hotel.id });
    },
    onError: error => setTimeoutError(error.message),
  });
  const setPublished = trpc.channelManager.setHotelPublished.useMutation({
    onSuccess: async () => {
      setPublishError(null);
      await Promise.all([utils.channelManager.hotel.invalidate(hotel.id), utils.channelManager.hotels.invalidate(), utils.channelManager.dashboard.invalidate()]);
    },
    onError: error => setPublishError(error.message),
  });

  function submitTimeout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTimeoutSaved(false);
    const value = Number(hours);
    if (!Number.isInteger(value) || value < 1 || value > 168) {
      setTimeoutError(t('hotelSettings.timeoutValidation'));
      return;
    }
    setTimeoutError(null);
    saveTimeout.mutate({ hotel_id: hotel.id, booking_request_timeout_hours: value });
  }

  return <>
    <section className="panel"><div className="panel-heading"><div><div className="eyebrow">{t('sidebar.generalSettings')}</div><h2>{t('hotelSettings.webBookings')}</h2></div></div>
      <p className="subtle-block">{t('hotelSettings.timeoutDescription')}</p>
      <form onSubmit={submitTimeout} className="form-grid">
        <label>{t('hotelSettings.timeoutLabel')}<input type="number" min={1} max={168} step={1} required value={hours} onChange={event => setHours(event.target.value)} /></label>
        {timeoutError && <p className="form-error form-span-two" role="alert">{timeoutError}</p>}
        {timeoutSaved && <p className="field-help form-span-two" role="status">{t('hotelSettings.saved')}</p>}
        <div className="form-submit form-span-two"><button className="button button-primary" type="submit" disabled={saveTimeout.isPending || timeout.isLoading}>{saveTimeout.isPending ? t('hotelDetail.savingProfile') : t('common.save')}</button></div>
      </form>
    </section>
    <section className="panel"><div className="panel-heading"><div><div className="eyebrow">{t('sidebar.generalSettings')}</div><h2>{t('hotelSettings.publicSite')}</h2></div></div>
      <p className="subtle-block">{hotel.public_enabled ? t('hotelDetail.unpublishHint', { slug: hotel.slug }) : t('hotelDetail.publishHint', { slug: hotel.slug })}</p>
      <button id="hotel-publish-toggle" className={`button ${hotel.public_enabled ? 'button-quiet' : 'button-primary'}`} type="button" disabled={setPublished.isPending} onClick={() => {
        if (hotel.public_enabled && !window.confirm(t('hotelDetail.confirmUnpublish'))) return;
        setPublished.mutate({ hotel_id: hotel.id, public_enabled: !hotel.public_enabled });
      }}>{setPublished.isPending ? t('hotelDetail.publishSaving') : hotel.public_enabled ? t('hotelDetail.unpublish') : t('hotelDetail.publish')}</button>
      {publishError && <p className="form-error" role="alert">{publishError}</p>}
    </section>
    <HotelDataTransfer hotelId={hotel.id} slug={hotel.slug} />
    {canClose && <HotelClosureSettings hotelId={hotel.id} hotelName={hotel.name} />}
  </>;
}

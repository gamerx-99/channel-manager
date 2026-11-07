import { lazy, Suspense } from 'react';
import { Link } from 'wouter';
import { PageState } from '@/components/PageState';
import { useTranslation } from '@/lib/i18n';
import { useHotelProfileForm, type HotelProfileForm } from '@/components/hotel/useHotelProfileForm';
import './HotelProfile.css';

const HotelMapPicker = lazy(() => import('@/components/hotel/HotelMapPicker'));

export default function HotelProfile({ id }: { id: string }) {
  const { t } = useTranslation();
  const { hotelQuery, authLoading, canManage, form, change, submit, error, saved, isPending, retry } = useHotelProfileForm(id);
  const intro = <section className="page-intro intro-split"><div><div className="eyebrow">{t('hotelProfile.eyebrow')}</div><h1>{t('hotelProfile.title')}<span className="title-mark">.</span></h1><p className="lede">{t('hotelProfile.lede')}</p></div></section>;
  if (hotelQuery.isLoading || authLoading) return <div className="page-content hotel-profile-page">{intro}<section className="panel empty-state"><PageState tone="loading" title={t('hotelDetail.loadingTitle')} description={t('hotelDetail.loadingDesc')} /></section></div>;
  if (!canManage) return <div className="page-content hotel-profile-page">{intro}<section className="panel empty-state"><PageState tone="error" title={t('accessRestricted.title')} description={t('accessRestricted.permissionRequired')} /></section></div>;
  if (hotelQuery.error || !hotelQuery.data) return <div className="page-content hotel-profile-page">{intro}<section className="panel empty-state"><PageState tone="error" title={t('hotelDetail.errorTitle')} description={hotelQuery.error?.message ?? t('hotelDetail.errorDescFallback')} actionLabel={t('hotelDetail.retryButton')} onAction={retry} /></section></div>;

  const channels: { field: keyof Pick<HotelProfileForm, 'public_phone' | 'facebook_url' | 'line_url' | 'instagram_url' | 'x_url'>; show: keyof Pick<HotelProfileForm, 'show_public_phone' | 'show_facebook' | 'show_line' | 'show_instagram' | 'show_x'>; label: string; showLabel: string; placeholder: string; type: string; maxLength: number }[] = [
    { field: 'public_phone', show: 'show_public_phone', label: t('hotelDetail.publicPhoneLabel'), showLabel: t('hotelDetail.showPhoneOnSite'), placeholder: t('hotelProfile.phonePlaceholder'), type: 'tel', maxLength: 80 },
    { field: 'facebook_url', show: 'show_facebook', label: t('hotelProfile.facebookLabel'), showLabel: t('hotelDetail.showFacebookOnSite'), placeholder: 'https://facebook.com/yourhotel', type: 'url', maxLength: 500 },
    { field: 'line_url', show: 'show_line', label: t('hotelProfile.lineLabel'), showLabel: t('hotelDetail.showLineOnSite'), placeholder: t('hotelProfile.linePlaceholder'), type: 'url', maxLength: 500 },
    { field: 'instagram_url', show: 'show_instagram', label: t('hotelProfile.instagramLabel'), showLabel: t('hotelDetail.showInstagramOnSite'), placeholder: 'https://instagram.com/yourhotel', type: 'url', maxLength: 500 },
    { field: 'x_url', show: 'show_x', label: t('hotelProfile.xLabel'), showLabel: t('hotelDetail.showXOnSite'), placeholder: 'https://x.com/yourhotel', type: 'url', maxLength: 500 },
  ];
  return <div className="page-content hotel-profile-page">{intro}
    <form onSubmit={submit}>
      <section className="panel"><div className="panel-heading"><div><div className="eyebrow">{t('hotelProfile.basicEyebrow')}</div><h2>{t('hotelProfile.basicHeading')}</h2></div></div>
        <div data-tour="hotel-settings-fields" className="form-grid hotel-profile-fields">
          <label>{t('hotelDetail.hotelNameLabel')}<input required maxLength={160} value={form.name} onChange={event => change('name', event.target.value)} /></label>
          <label>{t('hotelDetail.contactLabel')}<input required maxLength={180} autoComplete="tel" value={form.owner_contact} onChange={event => change('owner_contact', event.target.value)} /></label>
          <label className="form-span-two">{t('hotelDetail.addressLabel')}<input required maxLength={500} autoComplete="street-address" value={form.address} onChange={event => change('address', event.target.value)} /></label>
        </div>
      </section>
      <section className="panel"><div className="panel-heading"><div><div className="eyebrow">{t('hotelProfile.locationEyebrow')}</div><h2>{t('hotelDetail.locationHeading')}</h2></div></div>
        <div className="hotel-profile-map"><Suspense fallback={<p className="hotel-profile-map-loading">{t('hotelProfile.mapLoading')}</p>}><HotelMapPicker latitude={form.latitude} longitude={form.longitude} onChange={({ latitude, longitude }) => { change('latitude', latitude); change('longitude', longitude); }} disabled={isPending} /></Suspense></div>
      </section>
      <section className="panel"><div className="panel-heading"><div><div className="eyebrow">{t('hotelProfile.channelsEyebrow')}</div><h2>{t('hotelDetail.contactChannelsHeading')}</h2></div></div>
        <div className="form-grid hotel-profile-channels">{channels.map(channel => <div className="hotel-profile-channel" key={channel.field}>
          <label>{channel.label}<input type={channel.type} maxLength={channel.maxLength} placeholder={channel.placeholder} value={form[channel.field]} onChange={event => change(channel.field, event.target.value)} /></label>
          <label className="hotel-profile-checkbox"><input type="checkbox" checked={form[channel.show]} onChange={event => change(channel.show, event.target.checked)} /><span>{channel.showLabel}</span></label>
        </div>)}</div>
      </section>
      <div className="hotel-profile-savebar">{error && <p className="form-error" role="alert">{error}</p>}{saved && <p className="hotel-profile-success" role="status">{t('hotelProfile.saved')}</p>}<div className="form-submit"><Link href={`/hotels/${id}`} className="button button-quiet">{t('hotelProfile.back')}</Link><button className="button button-primary" type="submit" disabled={isPending}>{isPending ? t('hotelDetail.savingProfile') : t('hotelDetail.saveProfile')}</button></div></div>
    </form>
  </div>;
}

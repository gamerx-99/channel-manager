import { hasHotelPermission } from '@shared/authorization';
import HotelInvoiceSettings from '@/components/hotel/HotelInvoiceSettings';
import HotelPaymentSettings from '@/components/hotel/HotelPaymentSettings';
import { PageState } from '@/components/PageState';
import { useTranslation } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Link } from 'wouter';

export default function HotelFinanceSettings({ id }: { id: string }) {
  const { t, language } = useTranslation();
  const auth = trpc.auth.me.useQuery();
  const hotel = trpc.channelManager.hotel.useQuery(id);
  const canManage = hasHotelPermission(auth.data?.roles ?? [], auth.data?.memberships ?? [], id, 'property.manage_profile');
  const ownerBilling = auth.data?.memberships?.find(item => item.hotelId === id && item.role === 'hotel_owner' && item.permissions.includes('property.manage_billing'));
  const planState = trpc.subscriptionBilling.state.useQuery({ hotelId: id }, { enabled: Boolean(ownerBilling) });

  if (auth.isLoading || hotel.isLoading) return <PageState tone="loading" title={t('hotelDetail.loadingTitle')} />;
  if (!canManage) return <PageState tone="error" title={t('accessRestricted.title')} description={t('accessRestricted.permissionRequired')} />;
  if (!hotel.data) return <PageState tone="error" title={t('hotelDetail.errorTitle')} description={hotel.error?.message ?? t('hotelDetail.errorDescFallback')} />;

  return <div className="page-content">
    <section className="page-intro intro-split"><div><div className="eyebrow">{t('sidebar.hotelSettings')}</div><h1>{t('sidebar.financeSettings')}<span className="title-mark">.</span></h1><p className="lede">{t('hotelSettings.financeDescription')}</p></div></section>
    <HotelPaymentSettings hotelId={id} />
    <HotelInvoiceSettings hotelId={id} hotelName={hotel.data.name} hotelAddress={hotel.data.address ?? ''} />
    {ownerBilling && <section className="panel home-plan-card"><div className="panel-heading"><div><div className="eyebrow">{t('subscription.currentPlan')}</div><h2>{planState.data ? t(`subscription.${planState.data.plan}`) : t('common.loading')}</h2></div><span className="status-pill live">{planState.data?.daysLeft ? t('subscription.daysLeft', { days: planState.data.daysLeft }) : ''}</span></div><p>{planState.data?.endsAt ? t('subscription.endsAt', { date: new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium' }).format(new Date(planState.data.endsAt)) }) : t('subscription.freeNoExpiry')}</p><Link href={`/hotels/${id}/billing`} className="button button-primary">{t('subscription.changePlan')}</Link></section>}
  </div>;
}

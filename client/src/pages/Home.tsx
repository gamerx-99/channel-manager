import { ArrowUpRight, BedDouble, CalendarCheck2, ChevronRight, CircleAlert, ClipboardCheck, CreditCard, Hotel, MoreHorizontal, Sparkles, Users } from 'lucide-react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import OtaSyncStatusWidget from '@/components/OtaSyncStatusWidget';
import DashboardCalendarView from '@/components/DashboardCalendarView';
import { useState } from 'react';
import { formatIsoToDisplayDate } from '@shared/dateUtils';
import { isPlatformRole, ROLE_LABELS, hasHotelPermission } from '@shared/authorization';
import PageState from '@/components/PageState';
import { useTranslation } from '@/lib/i18n';
import { otaSyncEnabled } from '@/lib/featureFlags';
import { useHotel } from '@/contexts/HotelContext';
import { dashboardFigures, isRevenueStatus } from '@shared/finance';

const formatCurrency = (value: number | string) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(Number(value));

export default function Home() {
  const { t, language } = useTranslation();
  const { selectedHotel } = useHotel();
  const { data, isLoading, error, refetch: refetchDashboard } = trpc.channelManager.dashboard.useQuery();
  const { data: otaSummary, isLoading: otaLoading, error: otaError, refetch: refetchOta } = trpc.channelManager.ota.summary.useQuery(undefined, { enabled: otaSyncEnabled });
  const { data: authMe } = trpc.auth.me.useQuery();
  const triggerSync = trpc.channelManager.ota.triggerSync.useMutation();
  const utils = trpc.useUtils();
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const statusLabel: Record<string, string> = {
    confirmed: t('home.statusConfirmed'),
    checked_in: t('home.statusCheckedIn'),
    checked_out: t('home.statusCheckedOut'),
    cancelled: t('home.statusCancelled'),
  };

  const isPlatformAdmin = isPlatformRole(authMe?.role);
  const canEditCalendar = authMe?.role === 'super_admin' || authMe?.role === 'hotel_owner' || authMe?.role === 'revenue_manager';
  const ownerBilling = authMe?.memberships?.find(item => item.hotelId === selectedHotel?.id && item.role === 'hotel_owner' && item.permissions.includes('property.manage_billing'));
  const planState = trpc.subscriptionBilling.state.useQuery({ hotelId: selectedHotel?.id ?? '' }, { enabled: Boolean(ownerBilling && selectedHotel?.id) });
  const primaryHotel = data?.hotels?.[0];
  const primaryHotelHref = primaryHotel ? `/hotels/${primaryHotel.id}` : '/hotels';
  const summary = data?.summary;
  const retryDashboard = () => {
    void refetchDashboard();
    void refetchOta();
  };

  const handleSync = async (hotelId: string, provider: string, hotelName: string) => {
    const syncKey = `${hotelId}:${provider}`;
    setSyncingId(syncKey);
    try {
      await triggerSync.mutateAsync({ hotelId, provider });
      await utils.channelManager.ota.summary.invalidate();
      toast.success(t('home.syncSuccess', { provider, hotelName }));
    } catch (err: any) {
      toast.error(t('home.syncFailed', { provider, error: err.message || 'Unknown error' }), {
        action: {
          label: t('home.retry'),
          onClick: () => handleSync(hotelId, provider, hotelName),
        },
      });
    } finally {
      setSyncingId(null);
    }
  };

  if (isLoading) return <div className="page-content"><PageState tone="loading" title={t('home.loadingTitle')} description={t('home.loadingDesc')} /></div>;
  if (error || !data) return <div className="page-content"><PageState tone="error" title={t('home.errorTitle')} description={error?.message ?? t('home.errorDescFallback')} actionLabel={t('home.retryButton')} onAction={retryDashboard} actionPending={isLoading} /></div>;

  // Hotel-scoped overview: focus on the selected hotel (fall back to the first managed hotel).
  const selectedHotelId = selectedHotel?.id ?? data?.hotels?.[0]?.id;
  const selectedHotelData = data?.hotels?.find(h => h.id === selectedHotelId) ?? data?.hotels?.[0];
  const hotelRooms = selectedHotelData?.rooms ?? [];
  const hotelBookings = (selectedHotelData?.bookings ?? []).map((b: any) => ({ ...b, source: b.source as any, status: b.status as any }));
  // One shared definition of revenue, arrivals and "today" (Thailand time); see shared/finance.ts.
  const confirmedBookings = hotelBookings.filter((b: any) => isRevenueStatus(b.status));
  const figures = dashboardFigures(hotelBookings);
  // Rooms free tonight are computed on the server from the bookings (rooms.status is not kept current).
  const roomsAvailableToday = (selectedHotelData as any)?.roomsAvailableToday ?? 0;
  const totalRooms = hotelRooms.length;
  const checkInsToday = figures.arrivalsToday;
  const checkOutsToday = figures.departuresToday;
  const revenueToday = figures.revenueToday;
  const revenueThisMonth = figures.revenueThisMonth;

  const roles = authMe?.roles ?? [];
  const memberships = authMe?.memberships ?? [];
  const canViewRooms = Boolean(selectedHotelId) && (isPlatformAdmin || hasHotelPermission(roles, memberships, selectedHotelId!, 'property.view'));
  const canViewBookings = Boolean(selectedHotelId) && (isPlatformAdmin || hasHotelPermission(roles, memberships, selectedHotelId!, 'operations.view_bookings'));
  const canViewRevenue = Boolean(selectedHotelId) && hasHotelPermission(roles, memberships, selectedHotelId!, 'property.view_financials');
  const recentBookings = confirmedBookings.sort((a: any, b: any) => (b.check_in ?? '').localeCompare(a.check_in ?? '')).slice(0, 6);
  const revenue = recentBookings.reduce((total: number, booking: any) => total + Number(booking.price ?? 0), 0);

  return <div className="page-content dashboard-page">
    <section className="page-intro intro-split"><div><div className="eyebrow">{t('home.eyebrowPerformance')} <span className="date-stamp">{t('home.propertyPrefix', { name: selectedHotelData?.name ?? primaryHotel?.name ?? t('home.yourProperty') })}</span></div><h1>{t('home.overview')}<span className="title-mark">.</span></h1><p className="lede">{t('home.ledeSingle')}</p></div></section>

    {/* Operations cards sit together and money cards sit together, so the last row never has one card on its own. */}
    <section className="metric-row metric-groups" aria-label={t('home.metricAriaLabel')}>
      {(canViewRooms || canViewBookings) && <div className="metric-group metric-group-operations">
        {canViewRooms && <article className="metric-card"><div className="metric-icon muted"><BedDouble size={18} /></div><div className="metric-label">{t('home.roomsAvailableToday')}</div><div className="metric-value">{roomsAvailableToday} <small>/ {totalRooms}</small></div><div className="metric-meta"><span className="dot ok" /> {t('home.currentInventory')}</div></article>}
        {canViewBookings && <article className="metric-card"><div className="metric-icon muted"><CalendarCheck2 size={18} /></div><div className="metric-label">{t('home.arrivalsToday')}</div><div className="metric-value">{checkInsToday}</div><div className="metric-meta positive"><ArrowUpRight size={14} /> {t('home.confirmedStays')}</div></article>}
        {canViewBookings && <article className="metric-card"><div className="metric-icon muted"><CalendarCheck2 size={18} /></div><div className="metric-label">{t('home.checkOutsToday')}</div><div className="metric-value">{checkOutsToday}</div><div className="metric-meta">{t('home.confirmedStays')}</div></article>}
      </div>}
      {canViewRevenue && <div className="metric-group metric-group-money">
        <article className="metric-card metric-primary"><div className="metric-icon"><CreditCard size={18} /></div><div className="metric-label">{t('home.revenueToday')}</div><div className="metric-value">{formatCurrency(revenueToday)}</div></article>
        <article className="metric-card"><div className="metric-icon muted"><CreditCard size={18} /></div><div className="metric-label">{t('home.revenueThisMonth')}</div><div className="metric-value">{formatCurrency(revenueThisMonth)}</div></article>
      </div>}
    </section>

    <DashboardCalendarView canEditAvailability={canEditCalendar} />

    {recentBookings.length > 0 && <section className="content-grid lower-grid"><div className="panel bookings-panel"><div className="panel-heading"><div><div className="eyebrow">{t('home.latestActivity', { count: recentBookings.length })}</div><h2>{t('home.recentBookings')}</h2></div><Link href={selectedHotelId ? `/hotels/${selectedHotelId}/bookings` : '/hotels'} className="text-link">{t('home.openBookings')} <ArrowUpRight size={14} /></Link></div><div className="table-wrap"><table className="data-table compact-table"><thead><tr><th>{t('home.bookingCol')}</th><th>{t('home.stayCol')}</th><th>{t('home.sourceCol')}</th><th>{t('home.statusCol')}</th><th className="align-right">{t('home.valueCol')}</th></tr></thead><tbody>{recentBookings.map((booking: any) => <tr key={booking.id}><td><span className="booking-id">{booking.id.slice(0, 8)}</span><small>{t('home.confirmedRecord')}</small></td><td><span>{formatIsoToDisplayDate(booking.check_in)}</span><small>{t('home.to')} {formatIsoToDisplayDate(booking.check_out)}</small></td><td><span className="source-tag">{booking.source}</span></td><td><span className={`status-text ${booking.status}`}>{statusLabel[booking.status] ?? booking.status}</span></td><td className="align-right"><strong>{booking.price == null ? '—' : formatCurrency(booking.price)}</strong></td></tr>)}</tbody></table></div></div><div className="panel insight-panel"><div className="eyebrow">{t('home.latestConfirmedBookings')}</div><div className="insight-number">{formatCurrency(revenue)}</div><h3>{t('home.recordedBookingValue')}</h3><p>{t('home.bookingValueDesc')}</p><div className="sparkline"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div><div className="insight-footer"><span><i className="dot pine" /> {t('home.supabaseData')}</span><strong>{t('home.live')}</strong></div></div></section>}

    {otaSyncEnabled && <OtaSyncStatusWidget
      items={otaSummary ?? []}
      isLoading={otaLoading}
      errorMessage={otaError?.message}
      onRetry={() => void refetchOta()}
      onSync={(item) => handleSync(item.hotel_id, item.provider, item.hotel_name)}
      syncingId={syncingId}
      manageHref={selectedHotelId ? `/hotels/${selectedHotelId}/ota` : '/hotels'}
    />}
    <div className="page-content-footer">{t('shell.privateWorkspaceFooter')}</div>
  </div>;
}
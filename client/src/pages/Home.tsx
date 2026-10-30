import { ArrowUpRight, BedDouble, CalendarCheck2, ChevronRight, CircleAlert, ClipboardCheck, Hotel, MoreHorizontal, Sparkles, Users } from 'lucide-react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import OtaSyncStatusWidget from '@/components/OtaSyncStatusWidget';
import DashboardCalendarView from '@/components/DashboardCalendarView';
import { useState } from 'react';
import { formatIsoToDisplayDate } from '@shared/dateUtils';
import { isPlatformRole, ROLE_LABELS } from '@shared/authorization';
import PageState from '@/components/PageState';
import { useTranslation } from '@/lib/i18n';

const formatCurrency = (value: number | string) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(Number(value));

export default function Home() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch: refetchDashboard } = trpc.channelManager.dashboard.useQuery();
  const { data: otaSummary, isLoading: otaLoading, error: otaError, refetch: refetchOta } = trpc.channelManager.ota.summary.useQuery();
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

  // Global-access copy and links follow the platform roles; edit rights deliberately do not,
  // because `admin` is a read-only platform role.
  const isPlatformAdmin = isPlatformRole(authMe?.role);
  const canEditCalendar = authMe?.role === 'super_admin' || authMe?.role === 'hotel_owner' || authMe?.role === 'revenue_manager';
  const primaryHotel = data?.hotels[0];
  const primaryHotelHref = primaryHotel ? `/hotels/${primaryHotel.id}` : '/hotels';
  const summary = data?.summary;
  const revenue = summary?.recentBookings.reduce((total, booking) => total + Number(booking.price), 0) ?? 0;
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

  return <div className="page-content dashboard-page">
    <section className="page-intro intro-split"><div><div className="eyebrow">{t('home.eyebrowPerformance')} <span className="date-stamp">{isPlatformAdmin ? t('home.portfolioProperties') : t('home.propertyPrefix', { name: primaryHotel?.name ?? t('home.yourProperty') })}</span></div><h1>{t('home.overview')}<span className="title-mark">.</span></h1><p className="lede">{isPlatformAdmin ? t('home.ledePlatform') : t('home.ledeSingle')}</p></div><div className="intro-note"><Sparkles size={16} /><span><strong>{t('home.lastSynced')}</strong> {t('home.liveFromDatabase')}</span></div></section>

    <section className="metric-row" aria-label={t('home.metricAriaLabel')}><article className="metric-card metric-primary"><div className="metric-icon"><Hotel size={18} /></div><div className="metric-label">{t('home.totalProperties')}</div><div className="metric-value">{summary?.hotelCount ?? 0}</div><div className="metric-meta positive"><ArrowUpRight size={14} /> {isPlatformAdmin ? t('home.allSystemHotels') : t('home.yourManagedProperty')}</div></article><article className="metric-card"><div className="metric-icon muted"><BedDouble size={18} /></div><div className="metric-label">{t('home.roomsAvailableToday')}</div><div className="metric-value">{summary?.availableRoomCount ?? 0} <small>/ {summary?.roomCount ?? 0}</small></div><div className="metric-meta"><span className="dot pine" /> {t('home.currentInventory')}</div></article><article className="metric-card"><div className="metric-icon muted"><CalendarCheck2 size={18} /></div><div className="metric-label">{t('home.arrivalsToday')}</div><div className="metric-value">{summary?.arrivalsToday ?? 0}</div><div className="metric-meta positive"><ArrowUpRight size={14} /> {t('home.confirmedStays')}</div></article><article className="metric-card metric-alert"><div className="metric-icon amber"><CircleAlert size={18} /></div><div className="metric-label">{t('home.latestBookingsSummary')}</div><div className="metric-value">{summary?.recentBookings.length ?? 0}</div><div className="metric-meta amber-text">{t('home.activeRecordsReady')}</div></article></section>

    {/* Widget สรุปข้อมูลเบื้องต้นทันทีที่เข้าสู่ระบบ */}
    <section className="panel dashboard-summary-panel">
      <div className="panel-heading dashboard-summary-heading">
        <div>
          <div className="eyebrow">{t('home.quickPulse')}</div>
          <h2>{t('home.systemOverviewSummary')}</h2>
        </div>
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {t('home.liveSyncActive')}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="p-4 rounded-lg bg-muted/30 border border-border/60 flex flex-col justify-between">
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t('home.totalHotelsManaged')}</div>
            <div className="text-2xl font-bold mt-1 text-foreground">{summary?.hotelCount ?? 0} <span className="text-xs font-normal text-muted-foreground">{t('home.propertiesCount')}</span></div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('home.roleLabel', { role: authMe?.role ? ROLE_LABELS[authMe.role] : t('home.defaultRole') })}</span>
            <Link href={isPlatformAdmin ? "/hotels" : primaryHotelHref} className="text-primary hover:underline font-medium">{t('home.viewDetails')}</Link>
          </div>
        </div>
        <div className="p-4 rounded-lg bg-muted/30 border border-border/60 flex flex-col justify-between">
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t('home.latestBookingsRecorded')}</div>
            <div className="text-2xl font-bold mt-1 text-foreground">{summary?.recentBookings.length ?? 0} <span className="text-xs font-normal text-muted-foreground">{t('home.confirmedCount')}</span></div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('home.totalRevenue', { amount: formatCurrency(revenue) })}</span>
            <Link href={data?.hotels[0] ? `/hotels/${data.hotels[0].id}/bookings` : '/hotels'} className="text-primary hover:underline font-medium">{t('home.openBookings')}</Link>
          </div>
        </div>
        <div className="p-4 rounded-lg bg-muted/30 border border-border/60 flex flex-col justify-between">
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t('home.roomInventoryStatus')}</div>
            <div className="text-2xl font-bold mt-1 text-foreground">{summary?.availableRoomCount ?? 0} <span className="text-xs font-normal text-muted-foreground">{t('home.availableCount', { total: summary?.roomCount ?? 0 })}</span></div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('home.todayArrivals', { count: summary?.arrivalsToday ?? 0 })}</span>
            <Link href={data?.hotels[0] ? `/hotels/${data.hotels[0].id}/calendar` : '/hotels'} className="text-primary hover:underline font-medium">{t('home.viewCalendar')}</Link>
          </div>
        </div>
      </div>
    </section>

    <DashboardCalendarView canEditAvailability={canEditCalendar} />

    <section className="content-grid overview-grid"><div className="panel portfolio-panel"><div className="panel-heading"><div><div className="eyebrow">{t('home.managedProperties', { count: summary?.hotelCount ?? 0 })}</div><h2>{t('home.propertyOverview')}</h2></div><Link href={isPlatformAdmin ? "/hotels" : primaryHotelHref} className="text-link">{isPlatformAdmin ? t('home.viewAllHotels') : t('home.openProperty')} <ArrowUpRight size={14} /></Link></div><div className="hotel-list">{data?.hotels.length ? data.hotels.map(hotel => { const occupied = hotel.rooms.filter(room => room.status !== 'available').length; const occupancy = hotel.rooms.length ? Math.round((occupied / hotel.rooms.length) * 100) : 0; return <Link href={`/hotels/${hotel.id}`} key={hotel.id} className="hotel-row"><div className="hotel-thumb hotel-thumb-initial" aria-hidden="true">{hotel.name.slice(0, 1)}</div><div className="hotel-row-main"><div className="hotel-row-title"><strong>{hotel.name}</strong><span className={`status-pill ${hotel.public_enabled ? 'live' : 'setup'}`}><i />{hotel.public_enabled ? t('home.livePill') : t('home.privatePill')}</span></div><span className="hotel-location">{hotel.address} · {t('home.roomsCount', { count: hotel.rooms.length })}</span></div><div className="hotel-occupancy"><span>{occupancy}%</span><small>{t('home.occupied')}</small></div><div className="mini-progress"><span style={{ width: `${occupancy}%` }} /></div><ChevronRight size={16} className="row-arrow" /></Link>; }) : <div className="empty-inline">{t('home.noHotelsVisible')}</div>}</div></div>
      <aside className="panel task-panel"><div className="panel-heading"><div><div className="eyebrow">{t('home.quickAccess')}</div><h2>{t('home.keepThingsMoving')}</h2></div>          <button className="icon-button" aria-label={t('home.moreQuickActions')} onClick={() => toast.info(t('home.moreQuickActionsToast'))}><MoreHorizontal size={17} /></button></div><div className="task-list">
        <Link href={data?.hotels[0] ? `/hotels/${data.hotels[0].id}/bookings` : '/hotels'} className="task-item" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', width: '100%', cursor: 'pointer' }}>
          <div className="task-marker"><ClipboardCheck size={14} /></div>
          <div style={{ flex: 1 }}><strong>{t('home.reviewBookingsTitle')}</strong><span>{t('home.reviewBookingsDesc')}</span></div>
          <ChevronRight size={15} />
        </Link>
        <Link href={data?.hotels[0] ? `/hotels/${data.hotels[0].id}/bookings` : '/hotels'} className="task-item" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', width: '100%', cursor: 'pointer' }}>
          <div className="task-marker"><CircleAlert size={14} /></div>
          <div style={{ flex: 1 }}><strong>{t('home.completeGuestTitle')}</strong><span>{t('home.completeGuestDesc')}</span></div>
          <ChevronRight size={15} />
        </Link>
        <Link href={isPlatformAdmin ? '/settings/admin-users' : primaryHotelHref} className="task-item" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', width: '100%', cursor: 'pointer' }}>
          <div className="task-marker"><Users size={14} /></div>
          <div style={{ flex: 1 }}><strong>{isPlatformAdmin ? t('home.reviewAccessTitle') : t('home.openWorkspaceTitle')}</strong><span>{isPlatformAdmin ? t('home.reviewAccessDesc') : t('home.openWorkspaceDesc')}</span></div>
          <ChevronRight size={15} />
        </Link>
      </div><div className="task-footer"><span>{t('home.connectedToDatabase')}</span><span className="signal-text"><i /> {t('home.liveQuery')}</span></div></aside></section>

    <section className="content-grid lower-grid"><div className="panel bookings-panel"><div className="panel-heading"><div><div className="eyebrow">{t('home.latestActivity', { count: summary?.recentBookings.length ?? 0 })}</div><h2>{t('home.recentBookings')}</h2></div><Link href={data?.hotels[0] ? `/hotels/${data.hotels[0].id}/bookings` : '/hotels'} className="text-link">{t('home.openBookings')} <ArrowUpRight size={14} /></Link></div><div className="table-wrap"><table className="data-table compact-table"><thead><tr><th>{t('home.bookingCol')}</th><th>{t('home.stayCol')}</th><th>{t('home.sourceCol')}</th><th>{t('home.statusCol')}</th><th className="align-right">{t('home.valueCol')}</th></tr></thead><tbody>{summary?.recentBookings.length ? summary.recentBookings.map(booking => <tr key={booking.id}><td><span className="booking-id">{booking.id.slice(0, 8)}</span><small>{t('home.confirmedRecord')}</small></td><td><span>{formatIsoToDisplayDate(booking.check_in)}</span><small>{t('home.to')} {formatIsoToDisplayDate(booking.check_out)}</small></td><td><span className="source-tag">{booking.source}</span></td><td><span className={`status-text ${booking.status}`}>{statusLabel[booking.status] ?? booking.status}</span></td><td className="align-right"><strong>{booking.price == null ? '—' : formatCurrency(booking.price)}</strong></td></tr>) : <tr><td colSpan={5} className="empty-cell">{t('home.noConfirmedBookings')}</td></tr>}</tbody></table></div></div><div className="panel insight-panel"><div className="eyebrow">{t('home.latestConfirmedBookings')}</div><div className="insight-number">{formatCurrency(revenue)}</div><h3>{t('home.recordedBookingValue')}</h3><p>{t('home.bookingValueDesc')}</p><div className="sparkline"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div><div className="insight-footer"><span><i className="dot pine" /> {t('home.liveData')}</span><strong>{t('home.live')}</strong></div></div></section>

    <OtaSyncStatusWidget
      items={otaSummary ?? []}
      isLoading={otaLoading}
      errorMessage={otaError?.message}
      onRetry={() => void refetchOta()}
      onSync={(item) => handleSync(item.hotel_id, item.provider, item.hotel_name)}
      syncingId={syncingId}
      manageHref={primaryHotel ? `/hotels/${primaryHotel.id}/ota` : '/hotels'}
    />
  </div>;
}

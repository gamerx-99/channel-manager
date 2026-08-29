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

const statusLabel = { confirmed: 'Confirmed', checked_in: 'Checked in', checked_out: 'Checked out', cancelled: 'Cancelled' };
const formatCurrency = (value: number | string) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(Number(value));

export default function Home() {
  const { data, isLoading, error, refetch: refetchDashboard } = trpc.channelManager.dashboard.useQuery();
  const { data: otaSummary, isLoading: otaLoading, error: otaError, refetch: refetchOta } = trpc.channelManager.ota.summary.useQuery();
  const { data: authMe } = trpc.auth.me.useQuery();
  const triggerSync = trpc.channelManager.ota.triggerSync.useMutation();
  const utils = trpc.useUtils();
  const [syncingId, setSyncingId] = useState<string | null>(null);
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
  const formatSyncDate = (value: string | null) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'Never';

  const handleSync = async (hotelId: string, provider: string, hotelName: string) => {
    const syncKey = `${hotelId}:${provider}`;
    setSyncingId(syncKey);
    try {
      await triggerSync.mutateAsync({ hotelId, provider });
      await utils.channelManager.ota.summary.invalidate();
      toast.success(`Calendar sync completed for ${provider} (${hotelName})`);
    } catch (err: any) {
      toast.error(`Calendar sync failed for ${provider}: ${err.message || 'Unknown error'}`, {
        action: {
          label: 'Retry',
          onClick: () => handleSync(hotelId, provider, hotelName),
        },
      });
    } finally {
      setSyncingId(null);
    }
  };

  if (isLoading) return <div className="page-content"><PageState tone="loading" title="กำลังโหลดภาพรวมโรงแรม" description="กำลังอ่านสถานะการดำเนินงานจริงจาก Supabase…" /></div>;
  if (error || !data) return <div className="page-content"><PageState tone="error" title="โหลดภาพรวมโรงแรมไม่สำเร็จ" description={error?.message ?? 'ไม่พบข้อมูลโรงแรมหรือไม่มีสิทธิ์เข้าถึงข้อมูลนี้'} actionLabel="ลองใหม่" onAction={retryDashboard} actionPending={isLoading} /></div>;

  return <div className="page-content dashboard-page">
    <section className="page-intro intro-split"><div><div className="eyebrow">System performance <span className="date-stamp">{isPlatformAdmin ? 'Portfolio / Your properties' : `Property / ${primaryHotel?.name ?? 'Your property'}`}</span></div><h1>Overview<span className="title-mark">.</span></h1><p className="lede">Live operational signals from the {isPlatformAdmin ? 'properties available' : 'property available'} to your account.</p></div><div className="intro-note"><Sparkles size={16} /><span><strong>Last synced:</strong> Live from Supabase</span></div></section>

    <section className="metric-row" aria-label="สรุปสถานะ"><article className="metric-card metric-primary"><div className="metric-icon"><Hotel size={18} /></div><div className="metric-label">Total Properties</div><div className="metric-value">{summary?.hotelCount ?? 0}</div><div className="metric-meta positive"><ArrowUpRight size={14} /> {isPlatformAdmin ? 'All system hotels' : 'Your managed property'}</div></article><article className="metric-card"><div className="metric-icon muted"><BedDouble size={18} /></div><div className="metric-label">Rooms available today</div><div className="metric-value">{summary?.availableRoomCount ?? 0} <small>/ {summary?.roomCount ?? 0}</small></div><div className="metric-meta"><span className="dot pine" /> Current inventory</div></article><article className="metric-card"><div className="metric-icon muted"><CalendarCheck2 size={18} /></div><div className="metric-label">Arrivals today</div><div className="metric-value">{summary?.arrivalsToday ?? 0}</div><div className="metric-meta positive"><ArrowUpRight size={14} /> Confirmed stays</div></article><article className="metric-card metric-alert"><div className="metric-icon amber"><CircleAlert size={18} /></div><div className="metric-label">Latest Bookings Summary</div><div className="metric-value">{summary?.recentBookings.length ?? 0}</div><div className="metric-meta amber-text">Active records ready</div></article></section>

    {/* Widget สรุปข้อมูลเบื้องต้นทันทีที่เข้าสู่ระบบ */}
    <section className="panel dashboard-summary-panel">
      <div className="panel-heading dashboard-summary-heading">
        <div>
          <div className="eyebrow">Quick Property & Booking Pulse</div>
          <h2>System Overview Summary</h2>
        </div>
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Sync Active
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="p-4 rounded-lg bg-muted/30 border border-border/60 flex flex-col justify-between">
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Total Hotels Managed</div>
            <div className="text-2xl font-bold mt-1 text-foreground">{summary?.hotelCount ?? 0} <span className="text-xs font-normal text-muted-foreground">properties</span></div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Role: {authMe?.role ? ROLE_LABELS[authMe.role] : 'Hotel Owner'}</span>
            <Link href={isPlatformAdmin ? "/hotels" : primaryHotelHref} className="text-primary hover:underline font-medium">View details &rarr;</Link>
          </div>
        </div>
        <div className="p-4 rounded-lg bg-muted/30 border border-border/60 flex flex-col justify-between">
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Latest Bookings Recorded</div>
            <div className="text-2xl font-bold mt-1 text-foreground">{summary?.recentBookings.length ?? 0} <span className="text-xs font-normal text-muted-foreground">confirmed</span></div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total Revenue: {formatCurrency(revenue)}</span>
            <Link href={data?.hotels[0] ? `/hotels/${data.hotels[0].id}/bookings` : '/hotels'} className="text-primary hover:underline font-medium">Open bookings &rarr;</Link>
          </div>
        </div>
        <div className="p-4 rounded-lg bg-muted/30 border border-border/60 flex flex-col justify-between">
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Room Inventory Status</div>
            <div className="text-2xl font-bold mt-1 text-foreground">{summary?.availableRoomCount ?? 0} <span className="text-xs font-normal text-muted-foreground">/ {summary?.roomCount ?? 0} available</span></div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Today Arrivals: {summary?.arrivalsToday ?? 0}</span>
            <Link href={data?.hotels[0] ? `/hotels/${data.hotels[0].id}/calendar` : '/hotels'} className="text-primary hover:underline font-medium">View calendar &rarr;</Link>
          </div>
        </div>
      </div>
    </section>

    <DashboardCalendarView canEditAvailability={canEditCalendar} />

    <section className="content-grid overview-grid"><div className="panel portfolio-panel"><div className="panel-heading"><div><div className="eyebrow">Managed properties / {summary?.hotelCount ?? 0}</div><h2>Property overview</h2></div><Link href={isPlatformAdmin ? "/hotels" : primaryHotelHref} className="text-link">{isPlatformAdmin ? 'View all hotels' : 'Open property'} <ArrowUpRight size={14} /></Link></div><div className="hotel-list">{data?.hotels.length ? data.hotels.map(hotel => { const occupied = hotel.rooms.filter(room => room.status !== 'available').length; const occupancy = hotel.rooms.length ? Math.round((occupied / hotel.rooms.length) * 100) : 0; return <Link href={`/hotels/${hotel.id}`} key={hotel.id} className="hotel-row"><div className="hotel-thumb hotel-thumb-initial" aria-hidden="true">{hotel.name.slice(0, 1)}</div><div className="hotel-row-main"><div className="hotel-row-title"><strong>{hotel.name}</strong><span className={`status-pill ${hotel.public_enabled ? 'live' : 'setup'}`}><i />{hotel.public_enabled ? 'Live' : 'Private'}</span></div><span className="hotel-location">{hotel.address} · {hotel.rooms.length} rooms</span></div><div className="hotel-occupancy"><span>{occupancy}%</span><small>occupied</small></div><div className="mini-progress"><span style={{ width: `${occupancy}%` }} /></div><ChevronRight size={16} className="row-arrow" /></Link>; }) : <div className="empty-inline">No hotels are visible to this account yet.</div>}</div></div>
              <aside className="panel task-panel"><div className="panel-heading"><div><div className="eyebrow">Quick access</div><h2>Keep things moving</h2></div>          <button className="icon-button" aria-label="More quick actions" onClick={() => toast.info("All property operations are backed by Supabase RLS and real-time database queries.")}><MoreHorizontal size={17} /></button></div><div className="task-list">
          <Link href={data?.hotels[0] ? `/hotels/${data.hotels[0].id}/bookings` : '/hotels'} className="task-item" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', width: '100%', cursor: 'pointer' }}>
            <div className="task-marker"><ClipboardCheck size={14} /></div>
            <div style={{ flex: 1 }}><strong>Review today&apos;s bookings</strong><span>Use the Bookings workspace to check guest records.</span></div>
            <ChevronRight size={15} />
          </Link>
          <Link href={data?.hotels[0] ? `/hotels/${data.hotels[0].id}/bookings` : '/hotels'} className="task-item" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', width: '100%', cursor: 'pointer' }}>
            <div className="task-marker"><CircleAlert size={14} /></div>
            <div style={{ flex: 1 }}><strong>Complete guest details</strong><span>TM.30 export includes only persisted guest data.</span></div>
            <ChevronRight size={15} />
          </Link>
          <Link href={isPlatformAdmin ? '/settings/admin-users' : primaryHotelHref} className="task-item" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', width: '100%', cursor: 'pointer' }}>
            <div className="task-marker"><Users size={14} /></div>
            <div style={{ flex: 1 }}><strong>{isPlatformAdmin ? 'Review hotel access' : 'Open property workspace'}</strong><span>{isPlatformAdmin ? 'Membership is enforced by Supabase RLS.' : 'Manage rooms, bookings, and calendar for this property.'}</span></div>
            <ChevronRight size={15} />
          </Link>
        </div><div className="task-footer"><span>Connected to Supabase</span><span className="signal-text"><i /> Live query</span></div></aside></section>

    <section className="content-grid lower-grid"><div className="panel bookings-panel"><div className="panel-heading"><div><div className="eyebrow">Latest activity / {summary?.recentBookings.length ?? 0}</div><h2>Recent bookings</h2></div><Link href={data?.hotels[0] ? `/hotels/${data.hotels[0].id}/bookings` : '/hotels'} className="text-link">Open bookings <ArrowUpRight size={14} /></Link></div><div className="table-wrap"><table className="data-table compact-table"><thead><tr><th>Booking</th><th>Stay</th><th>Source</th><th>Status</th><th className="align-right">Value</th></tr></thead><tbody>{summary?.recentBookings.length ? summary.recentBookings.map(booking => <tr key={booking.id}><td><span className="booking-id">{booking.id.slice(0, 8)}</span><small>Confirmed record</small></td><td><span>{formatIsoToDisplayDate(booking.check_in)}</span><small>to {formatIsoToDisplayDate(booking.check_out)}</small></td><td><span className="source-tag">{booking.source}</span></td><td><span className={`status-text ${booking.status}`}>{statusLabel[booking.status]}</span></td><td className="align-right"><strong>{formatCurrency(booking.price)}</strong></td></tr>) : <tr><td colSpan={5} className="empty-cell">No confirmed bookings yet.</td></tr>}</tbody></table></div></div><div className="panel insight-panel"><div className="eyebrow">Latest confirmed bookings</div><div className="insight-number">{formatCurrency(revenue)}</div><h3>Recorded booking value</h3><p>Calculated from the latest RLS-visible confirmed booking records.</p><div className="sparkline"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div><div className="insight-footer"><span><i className="dot pine" /> Supabase data</span><strong>Live</strong></div></div></section>

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

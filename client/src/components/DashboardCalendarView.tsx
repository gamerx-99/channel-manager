import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, CloudDownload, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import PageState from '@/components/PageState';

type CalendarViewProps = {
  defaultDays?: number;
  canEditAvailability?: boolean;
};

type CalendarDay = {
  date: string;
  bookings: number;
  roomTypes: Array<{
    roomTypeId: string;
    available: number;
    totalRooms: number;
    price: number;
    status: 'healthy' | 'low' | 'closed';
  }>;
  syncEvents: Array<{
    provider: string;
    status: string;
    createdAt: string;
    updatedItemCount: number;
    message: string;
  }>;
};

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function shiftIsoDate(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(isoDate: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-GB', options).format(new Date(`${isoDate}T00:00:00.000Z`));
}

function formatSyncTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function rangeLabel(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short' });
  return sameMonth
    ? `${start.getUTCDate()}–${end.getUTCDate()} ${month.format(start)} ${start.getUTCFullYear()}`
    : `${start.getUTCDate()} ${month.format(start)} – ${end.getUTCDate()} ${month.format(end)} ${end.getUTCFullYear()}`;
}

function statusLabel(status: CalendarDay['roomTypes'][number]['status']) {
  if (status === 'closed') return 'Full / closed';
  if (status === 'low') return 'Low availability';
  return 'Healthy availability';
}

function statusColorName(status: CalendarDay['roomTypes'][number]['status']) {
  if (status === 'closed') return 'red';
  if (status === 'low') return 'yellow';
  return 'green';
}

export default function DashboardCalendarView({ defaultDays = 14, canEditAvailability = false }: CalendarViewProps) {
  const [startDate, setStartDate] = useState(isoToday);
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(isoToday);
  const [draftAvailability, setDraftAvailability] = useState<Record<string, number>>({});
  const [savedRoomTypeId, setSavedRoomTypeId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const calendarQuery = trpc.channelManager.dashboardCalendar.useQuery({ startDate, days: defaultDays });
  const updateAvailability = trpc.channelManager.updateAvailability.useMutation({
    onSuccess: async () => {
      await calendarQuery.refetch();
    },
  });

  const hotels = calendarQuery.data?.hotels ?? [];
  const activeHotel = hotels.find(hotel => hotel.hotel.id === selectedHotelId) ?? hotels[0];
  const days = activeHotel?.days ?? [];

  const activeDay = useMemo<CalendarDay | null>(() => {
    return days.find(day => day.date === selectedDate) ?? days[0] ?? null;
  }, [days, selectedDate]);

  const availabilitySummary = useMemo(() => {
    if (!activeDay) return { available: 0, total: 0, booked: 0 };
    return activeDay.roomTypes.reduce((summary, roomType) => ({
      available: summary.available + roomType.available,
      total: summary.total + roomType.totalRooms,
      booked: summary.booked,
    }), { available: 0, total: 0, booked: activeDay.bookings });
  }, [activeDay]);

  const retry = () => void calendarQuery.refetch();
  const moveWindow = (amount: number) => {
    const nextStart = shiftIsoDate(startDate, amount);
    setStartDate(nextStart);
    setSelectedDate(nextStart);
    setDraftAvailability({});
    setSavedRoomTypeId(null);
    setActionError(null);
  };

  const draftValue = (roomTypeId: string, fallback: number) => draftAvailability[roomTypeId] ?? fallback;

  const saveAvailability = async (roomType: CalendarDay['roomTypes'][number]) => {
    if (!activeHotel || !activeDay || !canEditAvailability) return;
    setActionError(null);
    setSavedRoomTypeId(null);
    try {
      await updateAvailability.mutateAsync({
        hotel_id: activeHotel.hotel.id,
        room_type_id: roomType.roomTypeId,
        date: activeDay.date,
        price: roomType.price,
        rooms_available: draftValue(roomType.roomTypeId, roomType.available),
        action: 'allotment',
      });
      setDraftAvailability(current => {
        const next = { ...current };
        delete next[roomType.roomTypeId];
        return next;
      });
      setSavedRoomTypeId(roomType.roomTypeId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to save availability.');
    }
  };

  const toggleStopSell = async (roomType: CalendarDay['roomTypes'][number]) => {
    if (!activeHotel || !activeDay || !canEditAvailability) return;
    setActionError(null);
    setSavedRoomTypeId(null);
    const nextAvailable = roomType.available === 0 ? roomType.totalRooms : 0;
    try {
      await updateAvailability.mutateAsync({
        hotel_id: activeHotel.hotel.id,
        room_type_id: roomType.roomTypeId,
        date: activeDay.date,
        price: roomType.price,
        rooms_available: nextAvailable,
        action: 'stop_sell',
      });
      setDraftAvailability(current => {
        const next = { ...current };
        delete next[roomType.roomTypeId];
        return next;
      });
      setSavedRoomTypeId(roomType.roomTypeId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to update stop-sell status.');
    }
  };

  if (calendarQuery.isLoading) {
    return <section className="panel dashboard-calendar-panel"><PageState tone="loading" title="กำลังโหลดปฏิทินการดำเนินงาน" description="กำลังอ่าน availability และสถานะการซิงก์ iCal ตามสิทธิ์ของคุณ…" /></section>;
  }

  if (calendarQuery.error || !calendarQuery.data) {
    return <section className="panel dashboard-calendar-panel"><PageState tone="error" title="โหลดปฏิทินการดำเนินงานไม่สำเร็จ" description={calendarQuery.error?.message ?? 'ไม่พบข้อมูลปฏิทินสำหรับโรงแรมที่เข้าถึงได้'} actionLabel="ลองใหม่" onAction={retry} actionPending={calendarQuery.isFetching} /></section>;
  }

  if (!activeHotel) {
    return <section className="panel dashboard-calendar-panel"><PageState tone="empty" title="ยังไม่มีข้อมูลปฏิทิน" description="เพิ่มโรงแรม ห้องพัก หรือการเชื่อมต่อ iCal เพื่อเริ่มติดตามสถานะบน Dashboard" /></section>;
  }

  return (
    <section className="panel dashboard-calendar-panel" aria-labelledby="dashboard-calendar-title">
      <div className="panel-heading dashboard-calendar-heading">
        <div>
          <div className="eyebrow">Availability & iCal activity</div>
          <h2 id="dashboard-calendar-title">Operations calendar</h2>
          <p className="dashboard-calendar-subtitle">ดูห้องว่าง การจองที่ใช้ห้อง และสัญญาณการซิงก์ iCal ในมุมมองเดียว</p>
        </div>
        <div className="dashboard-calendar-heading-actions">
          <span className="calendar-live-status"><i /> Live RLS data</span>
          <button className="icon-button" type="button" onClick={retry} disabled={calendarQuery.isFetching} aria-label="Refresh operations calendar" title="Refresh calendar">
            <RefreshCw size={16} className={calendarQuery.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="dashboard-calendar-toolbar">
        <div className="calendar-window-controls">
          <button className="icon-button bordered" type="button" onClick={() => moveWindow(-defaultDays)} aria-label="Previous calendar window"><ChevronLeft size={16} /></button>
          <div className="calendar-window-label"><strong>{rangeLabel(calendarQuery.data.startDate, calendarQuery.data.endDate)}</strong><span>{defaultDays} days · Thailand time</span></div>
          <button className="icon-button bordered" type="button" onClick={() => moveWindow(defaultDays)} aria-label="Next calendar window"><ChevronRight size={16} /></button>
          <button className="button button-quiet small-button" type="button" onClick={() => { setStartDate(isoToday()); setSelectedDate(isoToday()); }}>Today</button>
        </div>
        {hotels.length > 1 && <label className="calendar-property-filter"><span>Property</span><select value={activeHotel.hotel.id} onChange={event => { setSelectedHotelId(event.target.value); setSelectedDate(startDate); }} aria-label="Select property for calendar"><option value="">Select property</option>{hotels.map(hotel => <option value={hotel.hotel.id} key={hotel.hotel.id}>{hotel.hotel.name}</option>)}</select></label>}
      </div>

      <div className="calendar-legend dashboard-calendar-legend" aria-label="Calendar status legend">
        <span className="calendar-legend-item calendar-legend-healthy"><i className="calendar-status-swatch" aria-hidden="true" /> Healthy availability</span>
        <span className="calendar-legend-item calendar-legend-low"><i className="calendar-status-swatch" aria-hidden="true" /> Low availability</span>
        <span className="calendar-legend-item calendar-legend-closed"><i className="calendar-status-swatch" aria-hidden="true" /> Full / closed</span>
        <span className="calendar-legend-item calendar-legend-sync"><CloudDownload size={14} aria-hidden="true" /> iCal sync marker</span>
      </div>

      <p className="mobile-scroll-hint dashboard-calendar-scroll-hint" role="note">เลื่อนตารางในแนวนอนเพื่อดูวันทั้งหมด แตะวันที่เพื่อดูรายละเอียดด้านล่าง</p>
      <div className="dashboard-calendar-scroll">
        <table className="dashboard-calendar-table">
          <thead>
            <tr>
              <th className="dashboard-calendar-room-heading"><span>{activeHotel.hotel.name}</span><small>Room type</small></th>
              {days.map(day => <th key={day.date} className={day.date === selectedDate ? 'is-selected' : ''}><button type="button" onClick={() => setSelectedDate(day.date)} aria-label={`View ${formatDayLabel(day.date, { day: 'numeric', month: 'long', year: 'numeric' })}`}><span>{formatDayLabel(day.date, { day: '2-digit' })}</span><small>{formatDayLabel(day.date, { weekday: 'short' })}</small></button></th>)}
            </tr>
          </thead>
          <tbody>
            {activeHotel.roomTypes.length ? activeHotel.roomTypes.map((roomType, index) => <tr key={roomType.id}>
              <th><div className="dashboard-calendar-room-label"><span className={`room-type-bar ${index % 3 === 0 ? 'pine' : index % 3 === 1 ? 'slate' : 'amber'}`} /><strong>{roomType.name}</strong><small>{roomType.totalRooms} rooms</small></div></th>
              {days.map(day => {
                const cell = day.roomTypes.find(item => item.roomTypeId === roomType.id);
                const syncCount = day.syncEvents.length;
                const status = cell?.status ?? 'closed';
                const statusText = statusLabel(status);
                return <td key={`${roomType.id}:${day.date}`} className={day.date === selectedDate ? 'is-selected' : ''}><button className={`dashboard-calendar-cell ${status}`} type="button" onClick={() => setSelectedDate(day.date)} aria-label={`${roomType.name}, ${formatDayLabel(day.date, { day: 'numeric', month: 'long' })}: ${cell?.available ?? 0} of ${cell?.totalRooms ?? 0} rooms available, ${statusText}`} title={`${statusText} · ${cell?.available ?? 0} of ${cell?.totalRooms ?? 0} rooms available`}><span className="dashboard-calendar-status-badge" aria-hidden="true"><i className={`dashboard-calendar-status-dot status-${statusColorName(status)}`} />{statusText}</span><strong>{cell?.available ?? 0}<small>/{cell?.totalRooms ?? 0}</small></strong><span>฿{(cell?.price ?? 0).toLocaleString()}</span>{syncCount > 0 && <i className="calendar-sync-marker" title={`${syncCount} iCal sync event${syncCount > 1 ? 's' : ''}`}><CloudDownload size={11} /></i>}</button></td>;
              })}
            </tr>) : <tr><td colSpan={days.length + 1} className="empty-cell">No room types configured yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="dashboard-calendar-details" aria-live="polite">
        <div className="dashboard-calendar-day-summary">
          <div className="eyebrow">Selected day</div>
          <h3>{activeDay ? formatDayLabel(activeDay.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'No date selected'}</h3>
          <div className="dashboard-calendar-summary-stats"><span><strong>{availabilitySummary.available}</strong>/{availabilitySummary.total} rooms available</span><span><strong>{availabilitySummary.booked}</strong> active bookings</span></div>
        </div>
        <div className="dashboard-calendar-sync-details">
          <div className="eyebrow">iCal sync activity</div>
          {activeDay?.syncEvents.length ? <div className="dashboard-calendar-sync-list">{activeDay.syncEvents.map((event, index) => <div className={`dashboard-calendar-sync-item ${event.status === 'failed' ? 'is-error' : ''}`} key={`${event.provider}:${event.createdAt}:${index}`}><span className="dashboard-calendar-sync-icon">{event.status === 'failed' ? <CircleAlert size={14} /> : <CloudDownload size={14} />}</span><div><strong>{event.provider} · {event.status === 'success' ? 'Synced' : 'Failed'}</strong><small>{formatSyncTime(event.createdAt)} · {event.updatedItemCount} updated item{event.updatedItemCount === 1 ? '' : 's'}</small></div><span className="dashboard-calendar-sync-message">{event.message}</span></div>)}</div> : <p className="dashboard-calendar-empty-sync">No iCal sync activity recorded for this day.</p>}
        </div>
        <div className="dashboard-calendar-quick-actions" aria-labelledby="dashboard-calendar-quick-actions-title">
          <div className="dashboard-calendar-quick-actions-heading">
            <div><div className="eyebrow">Daily inventory controls</div><h4 id="dashboard-calendar-quick-actions-title">แก้ไขห้องว่างของวันที่เลือก</h4></div>
            {!canEditAvailability && <span className="calendar-view-only-note">View only · Revenue Manager or Hotel Admin can edit</span>}
          </div>
          {actionError && <p className="dashboard-calendar-action-error" role="alert">{actionError}</p>}
          {activeDay?.roomTypes.length ? <div className="dashboard-calendar-quick-action-list">{activeDay.roomTypes.map(roomType => {
            const value = draftValue(roomType.roomTypeId, roomType.available);
            const isClosed = roomType.available === 0;
            const isSaved = savedRoomTypeId === roomType.roomTypeId;
            return <div className="dashboard-calendar-quick-action-row" key={roomType.roomTypeId}>
              <div className="dashboard-calendar-quick-action-label"><strong>{activeHotel.roomTypes.find(item => item.id === roomType.roomTypeId)?.name ?? 'Room type'}</strong><small>{roomType.totalRooms} total rooms · {statusLabel(roomType.status)}</small></div>
              <div className="dashboard-calendar-quick-action-controls">
                <label><span className="sr-only">Available rooms</span><input type="number" min="0" max={roomType.totalRooms} value={value} disabled={!canEditAvailability || updateAvailability.isPending} onChange={event => setDraftAvailability(current => ({ ...current, [roomType.roomTypeId]: Math.min(roomType.totalRooms, Math.max(0, Number(event.target.value) || 0)) }))} aria-label={`Available rooms for ${activeHotel.roomTypes.find(item => item.id === roomType.roomTypeId)?.name ?? 'room type'}`} /><small>/ {roomType.totalRooms}</small></label>
                <button className="button button-quiet small-button" type="button" disabled={!canEditAvailability || updateAvailability.isPending || value === roomType.available} onClick={() => void saveAvailability(roomType)}>Save</button>
                <button className={`button small-button ${isClosed ? 'button-primary' : 'button-quiet'}`} type="button" disabled={!canEditAvailability || updateAvailability.isPending} onClick={() => void toggleStopSell(roomType)} title={isClosed ? 'Resume selling this room type' : 'Stop selling this room type'}>{isClosed ? 'Resume sale' : 'Stop Sell'}</button>
                {isSaved && <span className="dashboard-calendar-saved-state" role="status">Saved</span>}
              </div>
            </div>;
          })}</div> : <p className="dashboard-calendar-empty-sync">ไม่มี room type สำหรับแก้ไขในวันนี้</p>}
        </div>
      </div>
      <div className="calendar-footer"><span>Availability and sync markers are limited to properties visible under Supabase RLS.</span><span className="signal-text"><i /> {calendarQuery.data.generatedAt ? `Updated ${formatSyncTime(calendarQuery.data.generatedAt)}` : 'Live query'}</span></div>
    </section>
  );
}

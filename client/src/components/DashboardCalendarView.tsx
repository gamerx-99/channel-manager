import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, CloudDownload, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import PageState from '@/components/PageState';
import { formatDateDDMMYYYY } from '@/lib/formatDate';
import { useTranslation } from '@/lib/i18n';
import { otaSyncEnabled } from '@/lib/featureFlags';
import { bangkokDate } from '@shared/finance';

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
  price: number | null;
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
  return bangkokDate();
}

function shiftIsoDate(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(isoDate: string, options: Intl.DateTimeFormatOptions, language: 'en' | 'th') {
  const locale = language === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB';
  return new Intl.DateTimeFormat(locale, options).format(new Date(`${isoDate}T00:00:00.000Z`));
}

function formatNumericDate(isoDate: string) {
  return formatDateDDMMYYYY(isoDate);
}

function formatSyncTime(value: string, language: 'en' | 'th') {
  const locale = language === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB';
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function rangeLabel(startDate: string, endDate: string) {
  return `${formatNumericDate(startDate)} – ${formatNumericDate(endDate)}`;
}

function statusColorName(status: CalendarDay['roomTypes'][number]['status']) {
  if (status === 'closed') return 'red';
  if (status === 'low') return 'yellow';
  return 'green';
}

// The daily controls below (rooms available, stop sell) write the `availability` table, which the
// guest booking flow does not read (server/d1/bookingService.ts counts rooms minus bookings and
// prices from rate_overrides). A hotel could press "stop sale" and still receive bookings, so the
// controls stay hidden until the two are connected. The calendar itself remains read-only.
const DASHBOARD_CALENDAR_EDITING_ENABLED = false;

export default function DashboardCalendarView({ defaultDays = 14, canEditAvailability = false }: CalendarViewProps) {
  const { t, language } = useTranslation();
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
        price: roomType.price ?? 0,
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
      setActionError(error instanceof Error ? error.message : t('dashboardCalendar.saveFailed'));
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
        price: roomType.price ?? 0,
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
      setActionError(error instanceof Error ? error.message : t('dashboardCalendar.stopSaleFailed'));
    }
  };

  if (calendarQuery.isLoading) {
    return <section className="panel dashboard-calendar-panel"><PageState tone="loading" title={t('dashboardCalendar.loadingTitle')} description={t(otaSyncEnabled ? 'dashboardCalendar.loadingDesc' : 'dashboardCalendar.loadingDescNoOta')} /></section>;
  }

  if (calendarQuery.error || !calendarQuery.data) {
    return <section className="panel dashboard-calendar-panel"><PageState tone="error" title={t('dashboardCalendar.errorTitle')} description={calendarQuery.error?.message ?? t('dashboardCalendar.errorDescFallback')} actionLabel={t('dashboardCalendar.retry')} onAction={retry} actionPending={calendarQuery.isFetching} /></section>;
  }

  if (!activeHotel) {
    return <section className="panel dashboard-calendar-panel"><PageState tone="empty" title={t('dashboardCalendar.emptyTitle')} description={t(otaSyncEnabled ? 'dashboardCalendar.emptyDesc' : 'dashboardCalendar.emptyDescNoOta')} /></section>;
  }

  return (
    <section className="panel dashboard-calendar-panel" aria-labelledby="dashboard-calendar-title">
      <div className="panel-heading dashboard-calendar-heading">
        <div>
          <div className="eyebrow">{t(otaSyncEnabled ? 'dashboardCalendar.eyebrow' : 'dashboardCalendar.eyebrowNoOta')}</div>
          <h2 id="dashboard-calendar-title">{t('dashboardCalendar.title')}</h2>
          <p className="dashboard-calendar-subtitle">{t(otaSyncEnabled ? 'dashboardCalendar.subtitle' : 'dashboardCalendar.subtitleNoOta')}</p>
        </div>
        <div className="dashboard-calendar-heading-actions">
          <span className="calendar-live-status"><i /> {t('dashboardCalendar.liveData')}</span>
          <button className="icon-button" type="button" onClick={retry} disabled={calendarQuery.isFetching} aria-label={t('dashboardCalendar.refreshAria')} title={t('dashboardCalendar.refreshTitle')}>
            <RefreshCw size={16} className={calendarQuery.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="dashboard-calendar-toolbar">
        <div className="calendar-window-controls">
          <button className="icon-button bordered" type="button" onClick={() => moveWindow(-defaultDays)} aria-label={t('dashboardCalendar.previousWindowAria')}><ChevronLeft size={16} /></button>
          <div className="calendar-window-label"><strong>{rangeLabel(calendarQuery.data.startDate, calendarQuery.data.endDate)}</strong><span>{t('dashboardCalendar.windowDescription', { count: defaultDays })}</span></div>
          <button className="icon-button bordered" type="button" onClick={() => moveWindow(defaultDays)} aria-label={t('dashboardCalendar.nextWindowAria')}><ChevronRight size={16} /></button>
          <button className="button button-quiet small-button" type="button" onClick={() => { setStartDate(isoToday()); setSelectedDate(isoToday()); }}>{t('dashboardCalendar.today')}</button>
        </div>
        {hotels.length > 1 && <label className="calendar-property-filter"><span>{t('dashboardCalendar.property')}</span><select value={activeHotel.hotel.id} onChange={event => { setSelectedHotelId(event.target.value); setSelectedDate(startDate); }} aria-label={t('dashboardCalendar.selectProperty')}><option value="">{t('dashboardCalendar.selectProperty')}</option>{hotels.map(hotel => <option value={hotel.hotel.id} key={hotel.hotel.id}>{hotel.hotel.name}</option>)}</select></label>}
      </div>

      <div className="calendar-legend dashboard-calendar-legend" aria-label={t('dashboardCalendar.legendAria')}>
        <span className="calendar-legend-item calendar-legend-healthy"><i className="calendar-status-swatch" aria-hidden="true" /> {t('dashboardCalendar.healthyAvailability')}</span>
        <span className="calendar-legend-item calendar-legend-low"><i className="calendar-status-swatch" aria-hidden="true" /> {t('dashboardCalendar.lowAvailability')}</span>
        <span className="calendar-legend-item calendar-legend-closed"><i className="calendar-status-swatch" aria-hidden="true" /> {t('dashboardCalendar.fullOrClosed')}</span>
        {otaSyncEnabled && <span className="calendar-legend-item calendar-legend-sync"><CloudDownload size={14} aria-hidden="true" /> {t('dashboardCalendar.syncMarker')}</span>}
      </div>

      <p className="mobile-scroll-hint dashboard-calendar-scroll-hint" role="note">{t('dashboardCalendar.scrollHint')}</p>
      <div className="dashboard-calendar-scroll">
        <table className="dashboard-calendar-table">
          <thead>
            <tr>
              <th className="dashboard-calendar-room-heading"><span>{activeHotel.hotel.name}</span><small>{t('dashboardCalendar.roomType')}</small></th>
              {days.map(day => {
                const dateLabel = formatDayLabel(day.date, { day: 'numeric', month: 'long', year: 'numeric' }, language);
                return <th key={day.date} className={day.date === selectedDate ? 'is-selected' : ''}><button type="button" onClick={() => setSelectedDate(day.date)} aria-label={t('dashboardCalendar.viewDateAria', { date: dateLabel })}><span>{formatDayLabel(day.date, { day: '2-digit' }, language)}</span><small>{formatDayLabel(day.date, { weekday: 'short' }, language)}</small></button></th>;
              })}
            </tr>
          </thead>
          <tbody>
            {activeHotel.roomTypes.length ? activeHotel.roomTypes.map((roomType, index) => <tr key={roomType.id}>
              <th><div className="dashboard-calendar-room-label"><span className={`room-type-bar ${index % 3 === 0 ? 'pine' : index % 3 === 1 ? 'slate' : 'amber'}`} /><strong>{roomType.name}</strong><small>{t('dashboardCalendar.rooms', { count: roomType.totalRooms })}</small></div></th>
              {days.map(day => {
                const cell = day.roomTypes.find(item => item.roomTypeId === roomType.id);
                const syncCount = otaSyncEnabled ? day.syncEvents.length : 0;
                const status = cell?.status ?? 'closed';
                const statusText = status === 'closed' ? t('dashboardCalendar.fullOrClosed') : status === 'low' ? t('dashboardCalendar.lowAvailability') : t('dashboardCalendar.healthyAvailability');
                const dayLabel = formatDayLabel(day.date, { day: 'numeric', month: 'long' }, language);
                const available = cell?.available ?? 0;
                const total = cell?.totalRooms ?? 0;
                return <td key={`${roomType.id}:${day.date}`} className={day.date === selectedDate ? 'is-selected' : ''}><button className={`dashboard-calendar-cell ${status}`} type="button" onClick={() => setSelectedDate(day.date)} aria-label={t('dashboardCalendar.cellAria', { roomType: roomType.name, date: dayLabel, available, total, status: statusText })} title={t('dashboardCalendar.cellTitle', { status: statusText, available, total })}><span className="dashboard-calendar-status-badge" aria-hidden="true"><i className={`dashboard-calendar-status-dot status-${statusColorName(status)}`} />{statusText}</span><strong>{available}<small>/{total}</small></strong>{cell?.price !== null && cell?.price !== undefined && <span>฿{cell.price.toLocaleString()}</span>}{syncCount > 0 && <i className="calendar-sync-marker" title={t('dashboardCalendar.syncEvents', { count: syncCount })}><CloudDownload size={11} /></i>}</button></td>;
              })}
            </tr>) : <tr><td colSpan={days.length + 1} className="empty-cell">{t("availability.noRoomTypesCalendar")}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="dashboard-calendar-details" aria-live="polite">
        <div className="dashboard-calendar-day-summary">
          <div className="eyebrow">{t('dashboardCalendar.selectedDay')}</div>
          <h3>{activeDay ? formatDayLabel(activeDay.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, language) : t('dashboardCalendar.noDateSelected')}</h3>
          <div className="dashboard-calendar-summary-stats"><span><strong>{availabilitySummary.available}</strong>/{availabilitySummary.total} {t('dashboardCalendar.roomsAvailable')}</span><span><strong>{availabilitySummary.booked}</strong> {t('dashboardCalendar.activeBookings')}</span></div>
        </div>
        {otaSyncEnabled && <div className="dashboard-calendar-sync-details">
          <div className="eyebrow">{t('dashboardCalendar.syncActivity')}</div>
          {activeDay?.syncEvents.length ? <div className="dashboard-calendar-sync-list">{activeDay.syncEvents.map((event, index) => <div className={`dashboard-calendar-sync-item ${event.status === 'failed' ? 'is-error' : ''}`} key={`${event.provider}:${event.createdAt}:${index}`}><span className="dashboard-calendar-sync-icon">{event.status === 'failed' ? <CircleAlert size={14} /> : <CloudDownload size={14} />}</span><div><strong>{event.provider} · {event.status === 'success' ? t('dashboardCalendar.synced') : t('dashboardCalendar.failed')}</strong><small>{formatSyncTime(event.createdAt, language)} · {t('dashboardCalendar.updatedItems', { count: event.updatedItemCount })}</small></div><span className="dashboard-calendar-sync-message">{event.message}</span></div>)}</div> : <p className="dashboard-calendar-empty-sync">{t('dashboardCalendar.noSyncActivity')}</p>}
        </div>}
        {DASHBOARD_CALENDAR_EDITING_ENABLED && <div className="dashboard-calendar-quick-actions" aria-labelledby="dashboard-calendar-quick-actions-title">
          <div className="dashboard-calendar-quick-actions-heading">
            <div><div className="eyebrow">{t('dashboardCalendar.dailyControls')}</div><h4 id="dashboard-calendar-quick-actions-title">{t('dashboardCalendar.editSelectedDay')}</h4></div>
            {!canEditAvailability && <span className="calendar-view-only-note">{t('dashboardCalendar.viewOnly')}</span>}
          </div>
          {actionError && <p className="dashboard-calendar-action-error" role="alert">{actionError}</p>}
          {activeDay?.roomTypes.length ? <div className="dashboard-calendar-quick-action-list">{activeDay.roomTypes.map(roomType => {
            const value = draftValue(roomType.roomTypeId, roomType.available);
            const isClosed = roomType.available === 0;
            const isSaved = savedRoomTypeId === roomType.roomTypeId;
            const roomTypeName = activeHotel.roomTypes.find(item => item.id === roomType.roomTypeId)?.name ?? t('dashboardCalendar.roomTypeFallback');
            const roomStatus = roomType.status === 'closed' ? t('dashboardCalendar.fullOrClosed') : roomType.status === 'low' ? t('dashboardCalendar.lowAvailability') : t('dashboardCalendar.healthyAvailability');
            return <div className="dashboard-calendar-quick-action-row" key={roomType.roomTypeId}>
              <div className="dashboard-calendar-quick-action-label"><strong>{roomTypeName}</strong><small>{t('dashboardCalendar.totalRooms', { count: roomType.totalRooms, status: roomStatus })}</small></div>
              <div className="dashboard-calendar-quick-action-controls">
                <label><span className="sr-only">{t('dashboardCalendar.availableRooms')}</span><input type="number" min="0" max={roomType.totalRooms} value={value} disabled={!canEditAvailability || updateAvailability.isPending} onChange={event => setDraftAvailability(current => ({ ...current, [roomType.roomTypeId]: Math.min(roomType.totalRooms, Math.max(0, Number(event.target.value) || 0)) }))} aria-label={t('dashboardCalendar.availableRoomsFor', { roomType: roomTypeName })} /><small>/ {roomType.totalRooms}</small></label>
                <button className="button button-quiet small-button" type="button" disabled={!canEditAvailability || updateAvailability.isPending || value === roomType.available} onClick={() => void saveAvailability(roomType)}>{t('dashboardCalendar.save')}</button>
                <button className={`button small-button ${isClosed ? 'button-primary' : 'button-quiet'}`} type="button" disabled={!canEditAvailability || updateAvailability.isPending} onClick={() => void toggleStopSell(roomType)} title={isClosed ? t('dashboardCalendar.resumeSellingTitle') : t('dashboardCalendar.stopSellingTitle')}>{isClosed ? t('dashboardCalendar.resumeSale') : t('dashboardCalendar.stopSale')}</button>
                {isSaved && <span className="dashboard-calendar-saved-state" role="status">{t('dashboardCalendar.saved')}</span>}
              </div>
            </div>;
          })}</div> : <p className="dashboard-calendar-empty-sync">{t('dashboardCalendar.noRoomsToEdit')}</p>}
        </div>}
      </div>
      <div className="calendar-footer"><span>{t('dashboardCalendar.accessFooter')}</span><span className="signal-text"><i /> {calendarQuery.data.generatedAt ? t('dashboardCalendar.updatedAt', { time: formatSyncTime(calendarQuery.data.generatedAt, language) }) : t('dashboardCalendar.latestData')}</span></div>
    </section>
  );
}

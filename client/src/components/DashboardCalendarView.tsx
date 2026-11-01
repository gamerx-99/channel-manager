import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, CloudDownload, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import PageState from '@/components/PageState';
import { useTranslation, type TranslationKey } from '@/lib/i18n';

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
    /** null when the viewer may not see rates */
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
  return new Date().toISOString().slice(0, 10);
}

function shiftIsoDate(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

// Gregorian years in Thai too, matching the rest of the app (TM.30 uses A.D.).
const dateLocale = (language: string) => language === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB';

function formatDayLabel(isoDate: string, options: Intl.DateTimeFormatOptions, language = 'en') {
  return new Intl.DateTimeFormat(dateLocale(language), { timeZone: 'UTC', ...options }).format(new Date(`${isoDate}T00:00:00.000Z`));
}

function formatSyncTime(value: string, language = 'en') {
  return new Intl.DateTimeFormat(dateLocale(language), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function rangeLabel(startDate: string, endDate: string, language = 'en') {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const month = new Intl.DateTimeFormat(dateLocale(language), { month: 'short', timeZone: 'UTC' });
  return sameMonth
    ? `${start.getUTCDate()}–${end.getUTCDate()} ${month.format(start)} ${start.getUTCFullYear()}`
    : `${start.getUTCDate()} ${month.format(start)} – ${end.getUTCDate()} ${month.format(end)} ${end.getUTCFullYear()}`;
}

function statusLabelKey(status: CalendarDay['roomTypes'][number]['status']): TranslationKey {
  if (status === 'closed') return 'dashboardCalendar.statusClosed';
  if (status === 'low') return 'dashboardCalendar.statusLow';
  return 'dashboardCalendar.statusHealthy';
}

function statusColorName(status: CalendarDay['roomTypes'][number]['status']) {
  if (status === 'closed') return 'red';
  if (status === 'low') return 'yellow';
  return 'green';
}

export default function DashboardCalendarView({ defaultDays = 14, canEditAvailability = false }: CalendarViewProps) {
  const { t, language } = useTranslation();
  const statusLabel = (status: CalendarDay['roomTypes'][number]['status']) => t(statusLabelKey(status));
  const dayLabel = (isoDate: string, options: Intl.DateTimeFormatOptions) => formatDayLabel(isoDate, options, language);
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
    if (!activeHotel || !activeDay || !canEditAvailability || roomType.price === null) return;
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
      setActionError(error instanceof Error ? error.message : t('dashboardCalendar.saveError'));
    }
  };

  const toggleStopSell = async (roomType: CalendarDay['roomTypes'][number]) => {
    if (!activeHotel || !activeDay || !canEditAvailability || roomType.price === null) return;
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
      setActionError(error instanceof Error ? error.message : t('dashboardCalendar.stopSellError'));
    }
  };

  if (calendarQuery.isLoading) {
    return <section className="panel dashboard-calendar-panel"><PageState tone="loading" title={t('dashboardCalendar.loadingTitle')} description={t('dashboardCalendar.loadingDesc')} /></section>;
  }

  if (calendarQuery.error || !calendarQuery.data) {
    return <section className="panel dashboard-calendar-panel"><PageState tone="error" title={t('dashboardCalendar.errorTitle')} description={calendarQuery.error?.message ?? t('dashboardCalendar.errorFallback')} actionLabel={t('dashboardCalendar.retry')} onAction={retry} actionPending={calendarQuery.isFetching} /></section>;
  }

  if (!activeHotel) {
    return <section className="panel dashboard-calendar-panel"><PageState tone="empty" title={t('dashboardCalendar.emptyTitle')} description={t('dashboardCalendar.emptyDesc')} /></section>;
  }

  return (
    <section className="panel dashboard-calendar-panel" aria-labelledby="dashboard-calendar-title">
      <div className="panel-heading dashboard-calendar-heading">
        <div>
          <div className="eyebrow">{t('dashboardCalendar.eyebrow')}</div>
          <h2 id="dashboard-calendar-title">{t('dashboardCalendar.title')}</h2>
          <p className="dashboard-calendar-subtitle">{t('dashboardCalendar.subtitle')}</p>
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
          <button className="icon-button bordered" type="button" onClick={() => moveWindow(-defaultDays)} aria-label={t('dashboardCalendar.previousAria')}><ChevronLeft size={16} /></button>
          <div className="calendar-window-label"><strong>{rangeLabel(calendarQuery.data.startDate, calendarQuery.data.endDate, language)}</strong><span>{t('dashboardCalendar.daysThailandTime', { count: defaultDays })}</span></div>
          <button className="icon-button bordered" type="button" onClick={() => moveWindow(defaultDays)} aria-label={t('dashboardCalendar.nextAria')}><ChevronRight size={16} /></button>
          <button className="button button-quiet small-button" type="button" onClick={() => { setStartDate(isoToday()); setSelectedDate(isoToday()); }}>{t('dashboardCalendar.today')}</button>
        </div>
        {hotels.length > 1 && <label className="calendar-property-filter"><span>{t('dashboardCalendar.property')}</span><select value={activeHotel.hotel.id} onChange={event => { setSelectedHotelId(event.target.value); setSelectedDate(startDate); }} aria-label={t('dashboardCalendar.selectPropertyAria')}><option value="">{t('dashboardCalendar.selectProperty')}</option>{hotels.map(hotel => <option value={hotel.hotel.id} key={hotel.hotel.id}>{hotel.hotel.name}</option>)}</select></label>}
      </div>

      <div className="calendar-legend dashboard-calendar-legend" aria-label={t('dashboardCalendar.legendAria')}>
        <span className="calendar-legend-item calendar-legend-healthy"><i className="calendar-status-swatch" aria-hidden="true" /> {t('dashboardCalendar.statusHealthy')}</span>
        <span className="calendar-legend-item calendar-legend-low"><i className="calendar-status-swatch" aria-hidden="true" /> {t('dashboardCalendar.statusLow')}</span>
        <span className="calendar-legend-item calendar-legend-closed"><i className="calendar-status-swatch" aria-hidden="true" /> {t('dashboardCalendar.statusClosed')}</span>
        <span className="calendar-legend-item calendar-legend-sync"><CloudDownload size={14} aria-hidden="true" /> {t('dashboardCalendar.syncMarker')}</span>
      </div>

      <p className="mobile-scroll-hint dashboard-calendar-scroll-hint" role="note">{t('dashboardCalendar.scrollHint')}</p>
      <div className="dashboard-calendar-scroll">
        <table className="dashboard-calendar-table">
          <thead>
            <tr>
              <th className="dashboard-calendar-room-heading"><span>{activeHotel.hotel.name}</span><small>{t('dashboardCalendar.roomType')}</small></th>
              {days.map(day => <th key={day.date} className={day.date === selectedDate ? 'is-selected' : ''}><button type="button" onClick={() => setSelectedDate(day.date)} aria-label={t('dashboardCalendar.viewDayAria', { date: dayLabel(day.date, { day: 'numeric', month: 'long', year: 'numeric' }) })}><span>{dayLabel(day.date, { day: '2-digit' })}</span><small>{dayLabel(day.date, { weekday: 'short' })}</small></button></th>)}
            </tr>
          </thead>
          <tbody>
            {activeHotel.roomTypes.length ? activeHotel.roomTypes.map((roomType, index) => <tr key={roomType.id}>
              <th><div className="dashboard-calendar-room-label"><span className={`room-type-bar ${index % 3 === 0 ? 'pine' : index % 3 === 1 ? 'slate' : 'amber'}`} /><strong>{roomType.name}</strong><small>{t('dashboardCalendar.roomsCount', { count: roomType.totalRooms })}</small></div></th>
              {days.map(day => {
                const cell = day.roomTypes.find(item => item.roomTypeId === roomType.id);
                const syncCount = day.syncEvents.length;
                const status = cell?.status ?? 'closed';
                const statusText = statusLabel(status);
                return <td key={`${roomType.id}:${day.date}`} className={day.date === selectedDate ? 'is-selected' : ''}><button className={`dashboard-calendar-cell ${status}`} type="button" onClick={() => setSelectedDate(day.date)} aria-label={t('dashboardCalendar.cellAria', { room: roomType.name, date: dayLabel(day.date, { day: 'numeric', month: 'long' }), available: cell?.available ?? 0, total: cell?.totalRooms ?? 0, status: statusText })} title={t('dashboardCalendar.cellTitle', { status: statusText, available: cell?.available ?? 0, total: cell?.totalRooms ?? 0 })}><span className="dashboard-calendar-status-badge" aria-hidden="true"><i className={`dashboard-calendar-status-dot status-${statusColorName(status)}`} />{statusText}</span><strong>{cell?.available ?? 0}<small>/{cell?.totalRooms ?? 0}</small></strong>{cell?.price != null && <span>฿{cell.price.toLocaleString()}</span>}{syncCount > 0 && <i className="calendar-sync-marker" title={t('dashboardCalendar.syncEventsTitle', { count: syncCount })}><CloudDownload size={11} /></i>}</button></td>;
              })}
            </tr>) : <tr><td colSpan={days.length + 1} className="empty-cell">{t('dashboardCalendar.noRoomTypes')}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="dashboard-calendar-details" aria-live="polite">
        <div className="dashboard-calendar-day-summary">
          <div className="eyebrow">{t('dashboardCalendar.selectedDay')}</div>
          <h3>{activeDay ? dayLabel(activeDay.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : t('dashboardCalendar.noDateSelected')}</h3>
          <div className="dashboard-calendar-summary-stats"><span><strong>{availabilitySummary.available}</strong>/{availabilitySummary.total} {t('dashboardCalendar.roomsAvailable')}</span><span><strong>{availabilitySummary.booked}</strong> {t('dashboardCalendar.activeBookings')}</span></div>
        </div>
        <div className="dashboard-calendar-sync-details">
          <div className="eyebrow">{t('dashboardCalendar.syncActivity')}</div>
          {activeDay?.syncEvents.length ? <div className="dashboard-calendar-sync-list">{activeDay.syncEvents.map((event, index) => <div className={`dashboard-calendar-sync-item ${event.status === 'failed' ? 'is-error' : ''}`} key={`${event.provider}:${event.createdAt}:${index}`}><span className="dashboard-calendar-sync-icon">{event.status === 'failed' ? <CircleAlert size={14} /> : <CloudDownload size={14} />}</span><div><strong>{event.provider} · {event.status === 'success' ? t('dashboardCalendar.synced') : t('dashboardCalendar.failed')}</strong><small>{formatSyncTime(event.createdAt, language)} · {t('dashboardCalendar.updatedItems', { count: event.updatedItemCount })}</small></div><span className="dashboard-calendar-sync-message">{event.message}</span></div>)}</div> : <p className="dashboard-calendar-empty-sync">{t('dashboardCalendar.noSyncActivity')}</p>}
        </div>
        <div className="dashboard-calendar-quick-actions" aria-labelledby="dashboard-calendar-quick-actions-title">
          <div className="dashboard-calendar-quick-actions-heading">
            <div><div className="eyebrow">{t('dashboardCalendar.dailyControls')}</div><h4 id="dashboard-calendar-quick-actions-title">{t('dashboardCalendar.editSelectedDay')}</h4></div>
            {!canEditAvailability && <span className="calendar-view-only-note">{t('dashboardCalendar.viewOnly')}</span>}
          </div>
          {actionError && <p className="dashboard-calendar-action-error" role="alert">{actionError}</p>}
          {activeDay?.roomTypes.length ? <div className="dashboard-calendar-quick-action-list">{activeDay.roomTypes.map(roomType => {
            const value = draftValue(roomType.roomTypeId, roomType.available);
            const isClosed = roomType.available === 0;
            const isSaved = savedRoomTypeId === roomType.roomTypeId;
            return <div className="dashboard-calendar-quick-action-row" key={roomType.roomTypeId}>
              <div className="dashboard-calendar-quick-action-label"><strong>{activeHotel.roomTypes.find(item => item.id === roomType.roomTypeId)?.name ?? t('dashboardCalendar.roomType')}</strong><small>{t('dashboardCalendar.totalRoomsStatus', { count: roomType.totalRooms, status: statusLabel(roomType.status) })}</small></div>
              <div className="dashboard-calendar-quick-action-controls">
                <label><span className="sr-only">{t('dashboardCalendar.availableRooms')}</span><input type="number" min="0" max={roomType.totalRooms} value={value} disabled={!canEditAvailability || updateAvailability.isPending} onChange={event => setDraftAvailability(current => ({ ...current, [roomType.roomTypeId]: Math.min(roomType.totalRooms, Math.max(0, Number(event.target.value) || 0)) }))} aria-label={t('dashboardCalendar.availableRoomsFor', { room: activeHotel.roomTypes.find(item => item.id === roomType.roomTypeId)?.name ?? t('dashboardCalendar.roomType') })} /><small>/ {roomType.totalRooms}</small></label>
                <button className="button button-quiet small-button" type="button" disabled={!canEditAvailability || updateAvailability.isPending || value === roomType.available} onClick={() => void saveAvailability(roomType)}>{t('dashboardCalendar.save')}</button>
                <button className={`button small-button ${isClosed ? 'button-primary' : 'button-quiet'}`} type="button" disabled={!canEditAvailability || updateAvailability.isPending} onClick={() => void toggleStopSell(roomType)} title={isClosed ? t('dashboardCalendar.resumeTitle') : t('dashboardCalendar.stopTitle')}>{isClosed ? t('dashboardCalendar.resume') : t('dashboardCalendar.stopSell')}</button>
                {isSaved && <span className="dashboard-calendar-saved-state" role="status">{t('dashboardCalendar.saved')}</span>}
              </div>
            </div>;
          })}</div> : <p className="dashboard-calendar-empty-sync">{t('dashboardCalendar.noRoomTypesToEdit')}</p>}
        </div>
      </div>
      <div className="calendar-footer"><span>{t('dashboardCalendar.footer')}</span><span className="signal-text"><i /> {calendarQuery.data.generatedAt ? t('dashboardCalendar.updatedAt', { time: formatSyncTime(calendarQuery.data.generatedAt, language) }) : t('dashboardCalendar.liveData')}</span></div>
    </section>
  );
}

import { ChevronLeft, ChevronRight, Edit3, Info, Save, SlidersHorizontal } from "lucide-react";
import { Link } from "wouter";
import React, { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import PageState from "@/components/PageState";
import { useTranslation } from "@/lib/i18n";

type CalendarDraft = Record<string, { available: number; price: number }>;
type CalendarViewMode = "week" | "month";

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function weekLabel(days: Date[]) {
  const first = days[0];
  const last = days[days.length - 1];
  const month = new Intl.DateTimeFormat("en-GB", { month: "long" });
  return first.getMonth() === last.getMonth()
    ? `${first.getDate()}–${last.getDate()} ${month.format(first)} ${first.getFullYear()}`
    : `${first.getDate()} ${month.format(first)}–${last.getDate()} ${month.format(last)} ${last.getFullYear()}`;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(date);
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getMonthDays(monthAnchor: Date): Array<{ date: Date; isCurrentMonth: boolean }> {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];

  // Leading days from previous month (starting on Sunday)
  const leadingCount = firstDay.getDay();
  for (let i = leadingCount; i > 0; i--) {
    days.push({ date: new Date(year, month, 1 - i), isCurrentMonth: false });
  }

  // Days of current month
  const totalDaysInMonth = lastDay.getDate();
  for (let d = 1; d <= totalDaysInMonth; d++) {
    days.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }

  // Trailing days from next month to complete the week row
  const trailingCount = 6 - lastDay.getDay();
  for (let i = 1; i <= trailingCount; i++) {
    days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
  }

  return days;
}

const MONTH_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Calendar({ id }: { id: string }) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [weekStart, setWeekStart] = useState(() => new Date());
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CalendarDraft>({});
  const utils = trpc.useUtils();
  const hotelQuery = trpc.channelManager.hotel.useQuery(id);
  const availabilityQuery = trpc.channelManager.availability.useQuery(id);
  const updateAvailability = trpc.channelManager.updateAvailability.useMutation({
    onSuccess: async () => {
      await utils.channelManager.availability.invalidate(id);
    },
  });

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const monthDays = useMemo(() => getMonthDays(monthAnchor), [monthAnchor]);
  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const availabilityByKey = useMemo(() => {
    const records = availabilityQuery.data ?? [];
    const lookup = new Map<string, (typeof records)[number]>();
    records.forEach(row => lookup.set(`${row.room_type_id}:${row.date}`, row));
    return lookup;
  }, [availabilityQuery.data]);

  const retryAvailability = () => {
    void hotelQuery.refetch();
    void availabilityQuery.refetch();
  };

  if (hotelQuery.isLoading || availabilityQuery.isLoading) {
    return <div className="page-content"><PageState tone="loading" title={t("availability.loadingTitle")} description={t("availability.loadingDesc")} /></div>;
  }

  if (hotelQuery.error || availabilityQuery.error || !hotelQuery.data) {
    return <div className="page-content"><PageState tone="error" title={t("availability.errorTitle")} description={hotelQuery.error?.message ?? availabilityQuery.error?.message ?? t("availability.errorDescFallback")} actionLabel={t("availability.retryButton")} onAction={retryAvailability} actionPending={hotelQuery.isFetching || availabilityQuery.isFetching} /></div>;
  }

  const hotel = hotelQuery.data;
  const roomCountByType = hotel.rooms.reduce<Record<string, number>>((counts, room) => {
    counts[room.room_type_id] = (counts[room.room_type_id] ?? 0) + 1;
    return counts;
  }, {});

  function draftCell(roomTypeId: string, date: string, fallbackAvailable: number, fallbackPrice: number) {
    return draft[`${roomTypeId}:${date}`] ?? { available: fallbackAvailable, price: fallbackPrice };
  }

  function updateDraft(roomTypeId: string, date: string, update: Partial<{ available: number; price: number }>, fallbackAvailable: number, fallbackPrice: number) {
    const key = `${roomTypeId}:${date}`;
    setDraft(current => ({ ...current, [key]: { ...draftCell(roomTypeId, date, fallbackAvailable, fallbackPrice), ...update } }));
  }

  async function saveCalendar() {
    const changes = Object.entries(draft);
    if (!changes.length) {
      setEditing(false);
      return;
    }

    setSaveError(null);
    setSaved(false);
    try {
      await Promise.all(changes.map(([key, value]) => {
        const [room_type_id, date] = key.split(":");
        return updateAvailability.mutateAsync({ room_type_id, date, price: value.price, rooms_available: value.available });
      }));
      setDraft({});
      setEditing(false);
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("availability.saveErrorFallback"));
    }
  }

  const handlePrev = () => {
    if (viewMode === "week") {
      setWeekStart(current => addDays(current, -7));
    } else {
      setMonthAnchor(current => new Date(current.getFullYear(), current.getMonth() - 1, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === "week") {
      setWeekStart(current => addDays(current, 7));
    } else {
      setMonthAnchor(current => new Date(current.getFullYear(), current.getMonth() + 1, 1));
    }
  };

  const handleToday = () => {
    const now = new Date();
    setWeekStart(now);
    setMonthAnchor(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const handleMonthDayClick = (dayDate: Date) => {
    const monday = getMonday(dayDate);
    setWeekStart(monday);
    setViewMode("week");
  };

  const getDayAggregate = (dayDate: Date) => {
    const dateStr = toIsoDate(dayDate);
    let dayTotalAvailable = 0;
    let dayTotalRooms = 0;
    let dayMinPrice: number | null = null;

    for (const roomType of hotel.room_types) {
      const total = roomCountByType[roomType.id] ?? 0;
      const savedCell = availabilityByKey.get(`${roomType.id}:${dateStr}`);
      const fallbackAvailable = savedCell?.rooms_available ?? total;
      const fallbackPrice = Number(savedCell?.price ?? roomType.base_price);
      const cell = draftCell(roomType.id, dateStr, fallbackAvailable, fallbackPrice);

      dayTotalRooms += total;
      dayTotalAvailable += cell.available;
      if (cell.price > 0 && (dayMinPrice === null || cell.price < dayMinPrice)) {
        dayMinPrice = cell.price;
      }
    }

    const status: "healthy" | "low" | "closed" =
      dayTotalAvailable <= 0
        ? "closed"
        : dayTotalAvailable <= Math.max(1, Math.ceil(dayTotalRooms * 0.25))
        ? "low"
        : "healthy";

    return {
      dateStr,
      totalAvailable: dayTotalAvailable,
      totalRooms: dayTotalRooms,
      minPrice: dayMinPrice,
      status,
    };
  };

  return (
    <div className="page-content calendar-page">
      <div className="detail-back"><Link href={`/hotels/${hotel.id}`}>{hotel.name}</Link><span>/</span><strong>{t("availability.title")}</strong></div>
      <section className="page-intro intro-split">
        <div><div className="eyebrow">{t("availability.eyebrow")}</div><h1>{t("availability.title")}<span className="title-mark">.</span></h1><p className="lede">{t("availability.lede")}</p></div>
        <div className="intro-actions">
          <button className="button button-quiet" type="button" disabled title={t("availability.viewSettingsTooltip")}><SlidersHorizontal size={15} /> {t("availability.viewSettings")}</button>
          {editing ? (
            <button className="button button-primary" type="button" disabled={updateAvailability.isPending} onClick={() => void saveCalendar()}>
              <Save size={15} /> {updateAvailability.isPending ? t("availability.saving") : t("availability.saveChanges")}
            </button>
          ) : (
            <button
              className="button button-primary"
              type="button"
              onClick={() => {
                if (viewMode === "month") setViewMode("week");
                setEditing(true);
                setSaved(false);
                setSaveError(null);
              }}
            >
              <Edit3 size={15} /> {t("availability.editCalendar")}
            </button>
          )}
        </div>
      </section>
      {saved && <div className="save-toast"><span className="check-circle">✓</span> {t("availability.savedToast")}</div>}
      {(saveError || updateAvailability.error) && <div className="save-toast error-state" role="alert">{saveError || updateAvailability.error?.message}<button className="text-link" type="button" onClick={() => void saveCalendar()}>{t("availability.retrySave")}</button></div>}

      <section className="calendar-toolbar">
        <div className="calendar-nav-group">
          <button
            className="icon-button bordered"
            type="button"
            onClick={handlePrev}
            aria-label={viewMode === "week" ? "Previous week" : "Previous month"}
            title={viewMode === "week" ? "Previous week" : "Previous month"}
          >
            <ChevronLeft size={16} />
          </button>
          <div>
            <strong>{viewMode === "week" ? weekLabel(days) : monthLabel(monthAnchor)}</strong>
            <span>{viewMode === "week" ? t("availability.liveInventoryNote") : t("availability.monthOverviewNote")}</span>
          </div>
          <button
            className="icon-button bordered"
            type="button"
            onClick={handleNext}
            aria-label={viewMode === "week" ? "Next week" : "Next month"}
            title={viewMode === "week" ? "Next week" : "Next month"}
          >
            <ChevronRight size={16} />
          </button>
          <button className="button button-quiet small-button" type="button" onClick={handleToday}>
            {t("availability.today")}
          </button>
        </div>

        <div className="view-mode-toggle" role="group" aria-label={t("availability.viewModeAria")}>
          <button
            type="button"
            className={`view-mode-option ${viewMode === "week" ? "view-mode-option--active" : ""}`}
            onClick={() => setViewMode("week")}
            aria-pressed={viewMode === "week"}
          >
            {t("availability.weekView")}
          </button>
          <span className="view-mode-divider" aria-hidden="true" />
          <button
            type="button"
            className={`view-mode-option ${viewMode === "month" ? "view-mode-option--active" : ""}`}
            onClick={() => setViewMode("month")}
            aria-pressed={viewMode === "month"}
          >
            {t("availability.monthView")}
          </button>
        </div>
      </section>

      <section className="panel calendar-panel">
        <div className="calendar-legend">
          <span><i className="dot pine" /> {t("availability.healthyInventory")}</span>
          <span><i className="dot amber" /> {t("availability.lowInventory")}</span>
          <span><i className="dot slate" /> {t("availability.closedInventory")}</span>
          <span className="calendar-info"><Info size={14} /> {t("availability.pricesInThb")}</span>
        </div>

        {viewMode === "week" ? (
          <>
            <p className="mobile-scroll-hint" role="note">{t("availability.mobileScrollHint")}</p>
            <div className="calendar-scroll">
              <table className="availability-table">
                <thead>
                  <tr>
                    <th className="room-type-heading">{t("availability.roomTypeHeading")}</th>
                    {days.map(day => (
                      <th key={toIsoDate(day)}>
                        <span>{day.getDate()}</span>
                        <small>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(day)}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hotel.room_types.length ? hotel.room_types.map((roomType, index) => (
                    <tr className="sub-row" key={roomType.id}>
                      <td>
                        <div className="calendar-room-label">
                          <span className={`room-type-bar ${index % 3 === 0 ? "pine" : index % 3 === 1 ? "slate" : "amber"}`} />
                          <strong>{roomType.name}</strong>
                          <small>{roomCountByType[roomType.id] ?? 0} rooms</small>
                        </div>
                      </td>
                      {days.map(day => {
                        const date = toIsoDate(day);
                        const savedCell = availabilityByKey.get(`${roomType.id}:${date}`);
                        const fallbackAvailable = savedCell?.rooms_available ?? roomCountByType[roomType.id] ?? 0;
                        const fallbackPrice = Number(savedCell?.price ?? roomType.base_price);
                        const cell = draftCell(roomType.id, date, fallbackAvailable, fallbackPrice);
                        return (
                          <td key={date}>
                            <AvailabilityCell
                              available={cell.available}
                              price={cell.price}
                              editing={editing}
                              onChange={update => updateDraft(roomType.id, date, update, fallbackAvailable, fallbackPrice)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8} className="empty-cell">No room types configured yet. Add a room type before editing availability.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="calendar-month-scroll">
            <div className="calendar-month-grid">
              {MONTH_WEEKDAYS.map(weekday => (
                <div className="calendar-month-header" key={weekday}>
                  {weekday}
                </div>
              ))}
              {monthDays.map(cell => {
                const agg = getDayAggregate(cell.date);
                const isToday = agg.dateStr === todayIso;
                const statusDotClass = agg.status === "closed" ? "slate" : agg.status === "low" ? "amber" : "pine";
                const statusLabelText = agg.status === "closed" ? "Closed / Full" : agg.status === "low" ? "Low inventory" : "Healthy";

                return (
                  <button
                    key={agg.dateStr}
                    type="button"
                    className={`calendar-month-cell ${cell.isCurrentMonth ? "" : "is-outside"} ${isToday ? "is-today" : ""}`}
                    onClick={() => handleMonthDayClick(cell.date)}
                    aria-label={`${agg.dateStr}: ${agg.totalAvailable} of ${agg.totalRooms} rooms available, ${statusLabelText}${agg.minPrice !== null ? `, starting from ฿${agg.minPrice.toLocaleString()}` : ""}. Click to edit in week view.`}
                    title={`${agg.dateStr} · ${statusLabelText} · ${agg.totalAvailable}/${agg.totalRooms} rooms available · Click to edit`}
                  >
                    <div className="month-cell-top">
                      <span className="month-cell-day">{cell.date.getDate()}</span>
                      <span className="month-cell-hint">{t("availability.monthViewHint")}</span>
                    </div>
                    <span className="month-cell-status">
                      <i className={`dot ${statusDotClass}`} aria-hidden="true" />
                      <strong>{agg.totalAvailable}</strong>/{agg.totalRooms}
                    </span>
                    {agg.minPrice !== null ? (
                      <strong className="month-cell-price">฿{agg.minPrice.toLocaleString()}</strong>
                    ) : (
                      <span className="month-cell-empty">—</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="calendar-footer">
          <span>{t("availability.inventoryFooter")}</span>
          <span className="signal-text"><i /> {t("availability.rlsProtected")}</span>
        </div>
      </section>

      <section className="calendar-notes">
        <div>
          <div className="eyebrow">{t("availability.howItWorks")}</div>
          <p>
            {viewMode === "week"
              ? t("availability.howItWorksWeek")
              : t("availability.howItWorksMonth")}
          </p>
        </div>
        <Link href={`/hotels/${hotel.id}/bookings`} className="text-link">{t("availability.goToBookings")} <ChevronRight size={14} /></Link>
      </section>
    </div>
  );
}

function AvailabilityCell({ available, price, editing, onChange }: { available: number; price: number; editing: boolean; onChange: (update: Partial<{ available: number; price: number }>) => void }) {
  const { t } = useTranslation();
  const isLow = available <= 2;
  if (editing) {
    return <div className={`availability-cell ${isLow ? "low" : ""}`}><input className="cell-input" value={available} min="0" type="number" aria-label={t("availability.availableInputAria")} onChange={event => onChange({ available: Math.max(0, Number(event.target.value)) })} /><input className="cell-price-input" value={price} min="0" type="number" aria-label={t("availability.priceInputAria")} onChange={event => onChange({ price: Math.max(0, Number(event.target.value)) })} /></div>;
  }
  return <div className={`availability-cell ${isLow ? "low" : ""}`}><span className="cell-available"><i className={`dot ${available === 0 ? "slate" : isLow ? "amber" : "pine"}`} />{t("availability.roomsCount", { count: available })}</span><strong>฿{price.toLocaleString()}</strong></div>;
}

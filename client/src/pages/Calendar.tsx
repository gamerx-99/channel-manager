import { ChevronLeft, ChevronRight, Edit3, Info, Save, SlidersHorizontal } from "lucide-react";
import { Link } from "wouter";
import React, { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import PageState from "@/components/PageState";
import { useTranslation } from "@/lib/i18n";
import { countRoomsByType, getAvailableRoomCount, getBookedRoomCountForDate, getBookingPlatform, getBookingsForRoomTypeAndDate } from "./calendarAvailability";

type CalendarDraft = Record<string, { available: number; price: number }>;

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

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(date);
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

const MONTH_WEEKDAY_KEYS = ["weekdaySun", "weekdayMon", "weekdayTue", "weekdayWed", "weekdayThu", "weekdayFri", "weekdaySat"];

export default function Calendar({ id }: { id: string }) {
  const { t } = useTranslation();
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [inDate, setInDate] = useState<string | null>(null);
  const [outDate, setOutDate] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CalendarDraft>({});
  const utils = trpc.useUtils();
  const hotelQuery = trpc.channelManager.hotel.useQuery(id);
  const availabilityQuery = trpc.channelManager.availability.useQuery(id);
  const monthDays = useMemo(() => getMonthDays(monthAnchor), [monthAnchor]);
  const selectedDates = useMemo(() => {
    if (!inDate) return [];
    if (!outDate || outDate === inDate) return [inDate];
    const dates: string[] = [];
    for (let date = inDate; date < outDate; date = toIsoDate(addDays(new Date(`${date}T12:00:00`), 1))) dates.push(date);
    return dates;
  }, [inDate, outDate]);
  const occupancyDates = monthDays.map(day => day.date);
  const occupancyRange = {
    hotel_id: id,
    check_in: toIsoDate(occupancyDates[0]),
    check_out: toIsoDate(addDays(occupancyDates[occupancyDates.length - 1], 1)),
  };
  const bookingOccupancyQuery = trpc.channelManager.bookingOccupancy.useQuery(occupancyRange);
  const updateAvailability = trpc.channelManager.updateAvailability.useMutation({
    onSuccess: async () => {
      await utils.channelManager.availability.invalidate(id);
    },
  });

  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const availabilityByKey = useMemo(() => {
    const records = availabilityQuery.data ?? [];
    const lookup = new Map<string, (typeof records)[number]>();
    records.forEach(row => lookup.set(`${row.roomTypeId}:${row.date}`, row));
    return lookup;
  }, [availabilityQuery.data]);

  const retryAvailability = () => {
    void hotelQuery.refetch();
    void availabilityQuery.refetch();
    void bookingOccupancyQuery.refetch();
  };

  if (hotelQuery.isLoading || availabilityQuery.isLoading || bookingOccupancyQuery.isLoading) {
    return <div className="page-content"><PageState tone="loading" title={t("availability.loadingTitle")} description={t("availability.loadingDesc")} /></div>;
  }

  if (hotelQuery.error || availabilityQuery.error || bookingOccupancyQuery.error || !hotelQuery.data) {
    return <div className="page-content"><PageState tone="error" title={t("availability.errorTitle")} description={hotelQuery.error?.message ?? availabilityQuery.error?.message ?? bookingOccupancyQuery.error?.message ?? t("availability.errorDescFallback")} actionLabel={t("availability.retryButton")} onAction={retryAvailability} actionPending={hotelQuery.isFetching || availabilityQuery.isFetching || bookingOccupancyQuery.isFetching} /></div>;
  }

  const hotel = hotelQuery.data as any;
  const roomCountByType = countRoomsByType(hotel.rooms);
  const occupancy = bookingOccupancyQuery.data ?? [];

  function getAllotment(roomTypeId: string, date: string, totalRooms: number) {
    return availabilityByKey.get(`${roomTypeId}:${date}`)?.roomsAvailable ?? totalRooms;
  }

  function getEffectiveAvailability(roomTypeId: string, date: string, totalRooms: number) {
    const booked = getBookedRoomCountForDate(roomTypeId, date, hotel.rooms, occupancy as any);
    return getAvailableRoomCount(totalRooms, getAllotment(roomTypeId, date, totalRooms), booked);
  }

  function draftCell(roomTypeId: string, date: string, fallbackAvailable: number, fallbackPrice: number) {
    return draft[`${roomTypeId}:${date}`] ?? { available: fallbackAvailable, price: fallbackPrice };
  }

  function updateDraft(roomTypeId: string, date: string, update: Partial<{ available: number; price: number }>, fallbackAvailable: number, fallbackPrice: number) {
    const key = `${roomTypeId}:${date}`;
    setDraft(current => ({ ...current, [key]: { ...draftCell(roomTypeId, date, fallbackAvailable, fallbackPrice), ...update } }));
  }

  function setInventoryForScope(roomTypeId: string | null, isIn: boolean) {
    const targetTypes = hotel.room_types.filter((roomType: any) => roomTypeId === null || roomType.id === roomTypeId);
    setDraft(current => {
      const next = { ...current };
      for (const roomType of targetTypes) {
        const totalRooms = roomCountByType[roomType.id] ?? 0;
        for (const date of selectedDates) {
          const key = `${roomType.id}:${date}`;
          const savedCell = availabilityByKey.get(key);
          const currentDraft = next[key];
          next[key] = {
            available: isIn ? totalRooms : 0,
            price: currentDraft?.price ?? Number(savedCell?.price ?? roomType.base_price),
          };
        }
      }
      return next;
    });
    setSaved(false);
    setSaveError(null);
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
        // The server checks the permission for the kind of change on this hotel.
        const savedAllotment = getAllotment(room_type_id, date, roomCountByType[room_type_id] ?? 0);
        const action = value.available === savedAllotment ? "rate" : value.available === 0 ? "stop_sell" : "allotment";
        return updateAvailability.mutateAsync({ hotel_id: id, room_type_id, date, price: value.price, rooms_available: value.available, action });
      }));
      setDraft({});
      setEditing(false);
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("availability.saveErrorFallback"));
    }
  }

  const handlePrev = () => {
    const previous = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1);
    setMonthAnchor(previous);
  };

  const handleNext = () => {
    const next = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1);
    setMonthAnchor(next);
  };

  const handleToday = () => {
    const now = new Date();
    setMonthAnchor(new Date(now.getFullYear(), now.getMonth(), 1));
    setInDate(toIsoDate(now));
    setOutDate(null);
  };

  const handleMonthDayClick = (dayDate: Date) => {
    const date = toIsoDate(dayDate);
    if (!inDate || outDate) {
      setInDate(date);
      setOutDate(null);
    } else if (date < inDate) {
      setInDate(date);
      setOutDate(null);
    } else {
      setOutDate(date);
    }
    if (dayDate.getMonth() !== monthAnchor.getMonth() || dayDate.getFullYear() !== monthAnchor.getFullYear()) {
      setMonthAnchor(new Date(dayDate.getFullYear(), dayDate.getMonth(), 1));
    }
  };

  const getDayAggregate = (dayDate: Date) => {
    const dateStr = toIsoDate(dayDate);
    let dayTotalAvailable = 0;
    let dayTotalRooms = 0;
    let dayMinPrice: number | null = null;
    const bookingPlatforms = new Set<string>();

    for (const roomType of hotel.room_types) {
      const total = roomCountByType[roomType.id] ?? 0;
      const savedCell = availabilityByKey.get(`${roomType.id}:${dateStr}`);
      const allotment = savedCell?.roomsAvailable ?? total;
      const fallbackAvailable = editing ? allotment : getEffectiveAvailability(roomType.id, dateStr, total);
      const fallbackPrice = Number(savedCell?.price ?? roomType.base_price);
      const cell = draftCell(roomType.id, dateStr, fallbackAvailable, fallbackPrice);

      for (const booking of getBookingsForRoomTypeAndDate(roomType.id, dateStr, hotel.rooms, occupancy as any)) {
        bookingPlatforms.add(getBookingPlatform(booking));
      }

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
      bookingPlatforms: Array.from(bookingPlatforms),
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
            <button className="button button-primary" type="button" disabled={updateAvailability.isPending || !selectedDates.length} onClick={() => void saveCalendar()}>
              <Save size={15} /> {updateAvailability.isPending ? t("availability.saving") : t("availability.saveChanges")}
            </button>
          ) : (
            <button
              className="button button-primary"
              type="button"
              disabled={!selectedDates.length}
              onClick={() => {
                setEditing(true);
                setSaved(false);
                setSaveError(null);
              }}
            >
              <Edit3 size={15} /> {t("availability.editPrices")}
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
            aria-label="Previous month"
            title="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <div>
            <strong>{monthLabel(monthAnchor)}</strong>
            <span>{t("availability.monthOverviewNote")}</span>
          </div>
          <button
            className="icon-button bordered"
            type="button"
            onClick={handleNext}
            aria-label="Next month"
            title="Next month"
          >
            <ChevronRight size={16} />
          </button>
          <button className="button button-quiet small-button" type="button" onClick={handleToday}>
            {t("availability.today")}
          </button>
        </div>

      </section>

      <section className="panel calendar-panel">
      <div className="calendar-legend">
          <span><i className="dot pine" /> {t("availability.healthyInventory")}</span>
          <span><i className="dot amber" /> {t("availability.lowInventory")}</span>
          <span><i className="dot slate" /> {t("availability.closedInventory")}</span>
          <span><i className="calendar-booking-legend" /> {t("availability.bookedLegend")}</span>
          <span className="calendar-info"><Info size={14} /> {t("availability.pricesInThb")}</span>
        </div>

        <div className="calendar-month-scroll">
            <div className="calendar-month-grid">
              {MONTH_WEEKDAY_KEYS.map(weekdayKey => (
                <div className="calendar-month-header" key={weekdayKey}>
                  {t(`availability.${weekdayKey}`)}
                </div>
              ))}
              {monthDays.map(cell => {
                const agg = getDayAggregate(cell.date);
                const isToday = agg.dateStr === todayIso;
                const statusDotClass = agg.bookingPlatforms.length > 0 || agg.status === "closed" ? "slate" : agg.status === "low" ? "amber" : "pine";
                const statusLabelText = agg.status === "closed" ? t("availability.statusClosed") : agg.status === "low" ? t("availability.statusLow") : t("availability.statusHealthy");
                const priceSuffix = agg.minPrice !== null ? t("availability.startingFromPrice", { price: "฿" + agg.minPrice.toLocaleString() }) : "";

                return (
                  <button
                    key={agg.dateStr}
                    type="button"
                    className={`calendar-month-cell ${cell.isCurrentMonth ? "" : "is-outside"} ${isToday ? "is-today" : ""} ${agg.dateStr === inDate || agg.dateStr === outDate || (inDate && outDate && agg.dateStr > inDate && agg.dateStr < outDate) ? "is-selected" : ""} ${agg.bookingPlatforms.length > 0 ? "has-booking" : ""}`}
                    onClick={() => handleMonthDayClick(cell.date)}
                    aria-label={t("availability.monthCellAriaLabel", { date: agg.dateStr, available: String(agg.totalAvailable), total: String(agg.totalRooms), status: statusLabelText }) + priceSuffix}
                    title={t("availability.monthCellTitle", { date: agg.dateStr, status: statusLabelText, available: String(agg.totalAvailable), total: String(agg.totalRooms) })}
                  >
                    <div className="month-cell-top">
                      <span className="month-cell-day">{cell.date.getDate()}</span>
                      <span className="month-cell-hint">{agg.dateStr === inDate ? "IN" : agg.dateStr === outDate ? "OUT" : t("availability.monthViewHint")}</span>
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
                    {agg.bookingPlatforms.length > 0 && <span className="month-cell-platforms" title={agg.bookingPlatforms.join(", ")}>{agg.bookingPlatforms.join(", ")}</span>}
                  </button>
                );
              })}
            </div>
        </div>

        <div className="calendar-selected-day">
            <div className="calendar-selected-day-heading">
            <div>
              <div className="eyebrow">{t("availability.selectedDates")}</div>
              <h2>{inDate ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${inDate}T12:00:00`)) : t("availability.selectStartDate")}{outDate ? ` – ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${outDate}T12:00:00`))}` : ""}</h2>
              <p>{outDate ? t("availability.rangeSelected", { count: String(selectedDates.length) }) : t("availability.clickForOut")}</p>
            </div>
            <div className="calendar-range-actions">
              <button className="button button-quiet small-button" type="button" disabled={!selectedDates.length} onClick={() => setInventoryForScope(null, true)}>{t("availability.setAllIn")}</button>
              <button className="button button-quiet small-button" type="button" disabled={!selectedDates.length} onClick={() => setInventoryForScope(null, false)}>{t("availability.setAllOut")}</button>
            </div>
          </div>
          {hotel.room_types.length ? hotel.room_types.map((roomType: any, index: number) => {
            const totalRooms = roomCountByType[roomType.id] ?? 0;
            const selectedDay = inDate ?? todayIso;
            const savedCell = availabilityByKey.get(`${roomType.id}:${selectedDay}`);
            const allotment = Math.min(totalRooms, draft[`${roomType.id}:${selectedDay}`]?.available ?? savedCell?.roomsAvailable ?? totalRooms);
            const fallbackAvailable = getEffectiveAvailability(roomType.id, selectedDay, totalRooms);
            const fallbackPrice = Number(draft[`${roomType.id}:${selectedDay}`]?.price ?? savedCell?.price ?? roomType.base_price);
            const cell = draftCell(roomType.id, selectedDay, fallbackAvailable, fallbackPrice);
            const bookings = getBookingsForRoomTypeAndDate(roomType.id, selectedDay, hotel.rooms, occupancy as any);
            const platforms = Array.from(new Set(bookings.map(getBookingPlatform)));
            return <div className="calendar-selected-room" key={roomType.id}>
              <div className="calendar-room-label">
                <span className={`room-type-bar ${index % 3 === 0 ? "pine" : index % 3 === 1 ? "slate" : "amber"}`} />
                <strong>{roomType.name}</strong>
                <small>{totalRooms} rooms</small>
              </div>
              <div className="calendar-room-controls">
                <span className={`calendar-booked-state ${bookings.length ? "is-booked" : ""}`}>
                  {bookings.length ? `${t("availability.bookedFrom")}: ${platforms.join(", ")}` : `${t("availability.availableRoomsLabel")}: ${fallbackAvailable}/${totalRooms}`}
                </span>
                <div className="calendar-room-actions">
                  <button className={`calendar-inout-button ${allotment > 0 ? "is-active" : ""}`} type="button" disabled={!selectedDates.length} onClick={() => setInventoryForScope(roomType.id, allotment === 0)}>{allotment > 0 ? "IN" : "OUT"}</button>
                  <AvailabilityCell
                    available={fallbackAvailable}
                    price={cell.price}
                    editing={editing}
                    onChange={update => {
                      for (const date of selectedDates) updateDraft(roomType.id, date, update, getAllotment(roomType.id, date, totalRooms), Number(availabilityByKey.get(`${roomType.id}:${date}`)?.price ?? roomType.base_price));
                    }}
                  />
                </div>
              </div>
            </div>;
          }) : <p className="empty-cell">No room types configured yet. Add a room type before editing availability.</p>}
        </div>

        <div className="calendar-footer">
          <span>{t("availability.inventoryFooter")}</span>
          <span className="signal-text"><i /> {t("availability.rlsProtected")}</span>
        </div>
      </section>

      <section className="calendar-notes">
        <div>
          <div className="eyebrow">{t("availability.howItWorks")}</div>
          <p>
            {t("availability.howItWorksMonth")}
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
    return <div className={`availability-cell ${isLow ? "low" : ""}`}><span className="cell-available">{t("availability.roomsCount", { count: available })}</span><label className="calendar-price-edit"><span>{t("availability.priceInputAria")}</span><input className="cell-price-input" value={price} min="0" type="number" aria-label={t("availability.priceInputAria")} onChange={event => onChange({ price: Math.max(0, Number(event.target.value)) })} /></label></div>;
  }
  return <div className={`availability-cell ${isLow ? "low" : ""}`}><span className="cell-available"><i className={`dot ${available === 0 ? "slate" : isLow ? "amber" : "pine"}`} />{t("availability.roomsCount", { count: available })}</span><strong>฿{price.toLocaleString()}</strong></div>;
}

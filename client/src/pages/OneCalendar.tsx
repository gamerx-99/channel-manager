import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { useHotel } from "@/contexts/HotelContext";
import { useTranslation } from "@/lib/i18n";
import PageState from "@/components/PageState";
import { useOneCalendar } from "./useOneCalendar";
import { formatBuddhistDate, isDateSelected, selectCalendarDate } from "./oneCalendarRules";
import "./oneCalendar.css";

type CalendarMode = "month" | "timeline";

type CalendarRoomType = { id: string; name: string; totalRooms: number };

function formatMonth(month: Date, language: "en" | "th") {
  const locale = language === "th" ? "th-TH-u-ca-buddhist" : "en-US-u-ca-buddhist";
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month);
}

export default function OneCalendar({ id }: { id: string }) {
  const { t, language } = useTranslation();
  const { selectedHotelId } = useHotel();
  const [, navigate] = useLocation();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [mode, setMode] = useState<CalendarMode>("month");
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [range, setRange] = useState<[string | null, string | null]>([null, null]);
  const [rooms, setRooms] = useState("");
  const [price, setPrice] = useState("");
  const [minimum, setMinimum] = useState("");
  const [useBase, setUseBase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = useOneCalendar(id, month);
  const { dates } = data;
  const roomTypes = data.roomTypes as CalendarRoomType[];
  const selectedTypes = selectedRoomTypes.length ? roomTypes.filter((type: CalendarRoomType) => selectedRoomTypes.includes(type.id)) : roomTypes;
  const rows = data.calendar.data?.rows ?? [];
  const rowMap = useMemo(() => new Map(rows.map((row: any) => [`${row.roomTypeId}:${row.date}`, row])), [rows]);
  const weekdays = ["weekdaySun", "weekdayMon", "weekdayTue", "weekdayWed", "weekdayThu", "weekdayFri", "weekdaySat"];
  const leading = dates.length ? new Date(`${dates[0]}T12:00:00`).getDay() : 0;

  if (selectedHotelId && selectedHotelId !== id) {
    return <PageState tone="loading" title={t("common.loading")} description={t("oneCalendar.description")} />;
  }
  if (data.hotel.isLoading || data.calendar.isLoading) return <div className="page-content"><PageState tone="loading" title={t("availability.loadingTitle")} description={t("availability.loadingDesc")} /></div>;
  if (data.hotel.error || data.calendar.error || !data.hotel.data) return <div className="page-content"><PageState tone="error" title={t("availability.errorTitle")} description={data.hotel.error?.message ?? data.calendar.error?.message ?? t("availability.errorDescFallback")} actionLabel={t("availability.retryButton")} onAction={() => { void data.hotel.refetch(); void data.calendar.refetch(); }} /></div>;

  const chooseDay = (date: string) => {
    const next = selectCalendarDate(range[0], range[1], date);
    setRange(next);
    setError(null);
    if (next[1]) {
      setRooms(""); setPrice(""); setMinimum(""); setUseBase(false);
    }
  };

  const save = async () => {
    if (!range[0] || !range[1]) return;
    if (!selectedTypes.length) { setError(t("oneCalendar.chooseRoomTypes")); return; }
    const input: Record<string, unknown> = {
      hotel_id: id,
      room_type_ids: selectedTypes.map((roomType: CalendarRoomType) => roomType.id),
      start_date: range[0],
      end_date: range[1],
    };
    if (data.canManageAllotment && rooms !== "") input.rooms_available = Number(rooms);
    if (data.canManageRates && price !== "" && !useBase) input.price = Number(price);
    if (data.canManageRates && minimum !== "") input.min_stay_nights = Number(minimum);
    if (useBase && data.canManageRates) input.base = true;
    if (!("rooms_available" in input) && !("price" in input) && !("min_stay_nights" in input) && !("base" in input)) {
      setError(t("oneCalendar.saveError")); return;
    }
    setError(null);
    try {
      await data.save.mutateAsync(input as any);
      setRooms(""); setPrice(""); setMinimum(""); setUseBase(false);
    } catch (cause) {
      void cause;
      setError(t("oneCalendar.saveError"));
    }
  };

  const toggleRoomType = (roomTypeId: string) => setSelectedRoomTypes(current =>
    current.includes(roomTypeId) ? current.filter(id => id !== roomTypeId) : [...current, roomTypeId]);

  const panel = range[0] && range[1] ? <aside className="one-calendar-panel panel" aria-label={t("oneCalendar.selectedRange")}>
    <div className="panel-heading"><div><div className="eyebrow">{t("oneCalendar.selectedRange")}</div><h2>{formatBuddhistDate(range[0])} – {formatBuddhistDate(range[1])}</h2></div></div>
    {!data.canManageRates && <p className="field-help">{t("oneCalendar.frontDeskHint")}</p>}
    {!selectedTypes.length ? <p>{t("oneCalendar.chooseRoomTypes")}</p> : selectedTypes.map((roomType: any) => {
      const current = rowMap.get(`${roomType.id}:${range[0]}`) as any;
      return <section className="one-calendar-room-card" key={roomType.id}>
        <h3>{roomType.name}</h3>
        {data.canManageAllotment && <div className="one-calendar-control-grid">
          <label>{t("oneCalendar.rooms")}<input type="number" min="0" max={roomType.totalRooms} value={rooms} placeholder={String(current?.roomsAvailable ?? roomType.totalRooms)} onChange={event => setRooms(event.target.value)} /></label>
          <div className="one-calendar-sale-actions"><button type="button" className="button button-quiet button-small" onClick={() => setRooms(String(roomType.totalRooms))}>{t("oneCalendar.openSales")}</button><button type="button" className="button button-quiet button-small" onClick={() => setRooms("0")}>{t("oneCalendar.closeSales")}</button></div>
        </div>}
        {data.canManageRates && <div className="one-calendar-control-grid">
          <label>{t("oneCalendar.price")}<input type="number" min="0" step="0.01" value={price} placeholder={current?.price ?? ""} onChange={event => { setPrice(event.target.value); setUseBase(false); }} /></label>
          <label>{t("oneCalendar.minStay")}<input type="number" min="1" step="1" value={minimum} onChange={event => setMinimum(event.target.value)} /></label>
          <button type="button" className={`button button-quiet button-small ${useBase ? "is-active" : ""}`} onClick={() => { setUseBase(value => !value); setPrice(""); }}>{t("oneCalendar.basePrice")}</button>
        </div>}
      </section>;
    })}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-submit"><button className="button button-primary" type="button" onClick={() => void save()} disabled={data.save.isPending || !selectedTypes.length}>{data.save.isPending ? t("oneCalendar.saving") : t("oneCalendar.save")}</button></div>
  </aside> : null;

  return <div className="page-content one-calendar-page">
    <section className="page-intro intro-split"><div><div className="eyebrow">{t("oneCalendar.eyebrow")}</div><h1>{t("oneCalendar.title")}<span className="title-mark">.</span></h1><p className="lede">{t("oneCalendar.description")}</p></div></section>
    <section className="panel one-calendar-room-filter"><div className="panel-heading"><div><h2>{t("oneCalendar.selectRooms")}</h2></div></div><div className="one-calendar-room-pills">{roomTypes.map((roomType: any) => <button key={roomType.id} type="button" aria-pressed={!selectedRoomTypes.length || selectedRoomTypes.includes(roomType.id)} aria-label={t("oneCalendar.roomTypeAria", { name: roomType.name })} className={`one-calendar-room-pill ${!selectedRoomTypes.length || selectedRoomTypes.includes(roomType.id) ? "is-selected" : ""}`} onClick={() => toggleRoomType(roomType.id)}>{roomType.name}</button>)}</div>
    {roomTypes.length === 0 && <p className="empty-state">{t("oneCalendar.noRoomTypes")}</p>}</section>
    <section className="panel one-calendar-calendar-panel">
      <div className="one-calendar-toolbar"><div className="one-calendar-month-nav"><button className="icon-button" aria-label={t("oneCalendar.previousMonth")} onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft size={18} /></button><h2>{formatMonth(month, language)}</h2><button className="icon-button" aria-label={t("oneCalendar.nextMonth")} onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight size={18} /></button><button type="button" className="button button-quiet button-small" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>{t("oneCalendar.today")}</button></div>
        <div className="one-calendar-mode" role="group" aria-label={t("oneCalendar.title")}><button type="button" aria-pressed={mode === "month"} onClick={() => setMode("month")}>{t("oneCalendar.month")}</button><button type="button" aria-pressed={mode === "timeline"} onClick={() => setMode("timeline")}>{t("oneCalendar.timeline")}</button></div>
      </div>
      {mode === "month" ? <div className="one-calendar-month-grid">
        {weekdays.map(key => <div key={key} className="one-calendar-weekday">{t(`oneCalendar.${key}`)}</div>)}
        {Array.from({ length: leading }, (_, index) => <div className="one-calendar-blank" key={`blank-${index}`} />)}
        {dates.map(date => <button type="button" key={date} onClick={() => chooseDay(date)} className={`one-calendar-day ${isDateSelected(date, range[0], range[1]) ? "is-selected" : ""}`} aria-label={t("oneCalendar.dayAria", { date: formatBuddhistDate(date), available: String(selectedTypes.reduce((sum: number, roomType: any) => sum + ((rowMap.get(`${roomType.id}:${date}`) as any)?.roomsAvailable ?? roomType.totalRooms), 0)), total: String(selectedTypes.reduce((sum: number, roomType: any) => sum + roomType.totalRooms, 0)), price: "" })}>
          <span className="one-calendar-day-number">{Number(date.slice(-2))}</span><span className="one-calendar-day-room-count">{selectedTypes.map((roomType: any) => { const row = rowMap.get(`${roomType.id}:${date}`) as any; const roomsForSale = row?.roomsAvailable ?? roomType.totalRooms; return <small key={roomType.id}>{roomsForSale === 0 ? t("oneCalendar.closed") : `${roomsForSale}/${roomType.totalRooms}`}</small>; })}</span>
          {data.calendar.data?.canSeePrice && <span className="one-calendar-day-price">{selectedTypes.map((roomType: any) => { const row = rowMap.get(`${roomType.id}:${date}`) as any; return row?.price == null ? null : <small key={roomType.id}>฿{Number(row.price).toLocaleString()}</small>; })}</span>}
        </button>)}
      </div> : <div className="one-calendar-timeline-scroll"><table className="one-calendar-timeline"><thead><tr><th>{t("oneCalendar.selectRooms")}</th>{dates.map(date => <th key={date}>{Number(date.slice(-2))}</th>)}</tr></thead><tbody>{selectedTypes.map((roomType: any) => <tr key={roomType.id}><th>{roomType.name}</th>{dates.map(date => { const row = rowMap.get(`${roomType.id}:${date}`) as any; const open = !row?.closed && (row?.availableRooms ?? roomType.totalRooms) > 0; return <td key={date}><button type="button" className={`one-calendar-timeline-cell ${open ? "is-open" : "is-closed"}`} onClick={() => chooseDay(date)} aria-label={t("oneCalendar.timelineAria", { name: roomType.name, date: formatBuddhistDate(date), status: t(open ? "oneCalendar.available" : "oneCalendar.unavailable") })}>{t(open ? "oneCalendar.available" : "oneCalendar.unavailable")}</button></td>; })}</tr>)}</tbody></table></div>}
      <p className="field-help">{t("oneCalendar.chooseRange")}{range[0] && ` · ${formatBuddhistDate(range[0])}${range[1] ? ` – ${formatBuddhistDate(range[1])}` : ""}`}</p>
    </section>
    {panel}
  </div>;
}

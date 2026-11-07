import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { useHotel } from "@/contexts/HotelContext";
import { useTranslation } from "@/lib/i18n";
import PageState from "@/components/PageState";
import { useOneCalendar } from "./useOneCalendar";
import OneCalendarTimeline from "./OneCalendarTimeline";
import OneCalendarSidePanel from "./OneCalendarSidePanel";
import { buildCalendarSaveInputs, useCalendarEdits } from "./useCalendarEdits";
import { formatBuddhistDate, getCalendarNightSelection, isCheckoutDate, isDateSelected, selectCalendarDate } from "./oneCalendarRules";
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
  const selection = getCalendarNightSelection(range[0], range[1]);
  const { edits, updateEdit, clearEdit, clearAll } = useCalendarEdits();
  const [saveResults, setSaveResults] = useState<Record<string, "saved" | "failed">>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = useOneCalendar(id, month);
  useEffect(() => {
    if (selectedHotelId && selectedHotelId !== id) navigate(`/hotels/${selectedHotelId}/calendar`);
  }, [id, navigate, selectedHotelId]);
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
    setSaveResults({});
    if (next[1]) {
      clearAll();
    }
  };

  const save = async () => {
    if (!range[0] || !range[1] || !selection.lastNight) return;
    if (!selectedTypes.length) { setError(t("oneCalendar.chooseRoomTypes")); return; }
    const inputs = buildCalendarSaveInputs(selectedTypes.map(type => type.id), edits, id, range[0], selection.lastNight, data.canManageRates, data.canManageAllotment);
    if (!inputs.length) {
      setError(t("oneCalendar.saveError")); return;
    }
    setError(null);
    setSaveResults({});
    setSaving(true);
    const results: Record<string, "saved" | "failed"> = {};
    for (const input of inputs) {
      const roomTypeId = input.room_type_ids[0]!;
      try {
        await data.save.mutateAsync(input);
        results[roomTypeId] = "saved";
        clearEdit(roomTypeId);
      } catch {
        results[roomTypeId] = "failed";
      }
    }
    setSaveResults(results);
    const failedNames = selectedTypes.filter(type => results[type.id] === "failed").map(type => type.name);
    if (failedNames.length) setError(`${t("oneCalendar.saveError")} ${failedNames.join(", ")}`);
    try {
      await data.calendar.refetch();
    } catch {
      setError(current => current ?? t("oneCalendar.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const toggleRoomType = (roomTypeId: string) => setSelectedRoomTypes(current =>
    current.includes(roomTypeId) ? current.filter(id => id !== roomTypeId) : [...current, roomTypeId]);
  const changeRoomTypeEdit = (roomTypeId: string, change: Parameters<typeof updateEdit>[1]) => {
    updateEdit(roomTypeId, change);
    setSaveResults(current => {
      const next = { ...current };
      delete next[roomTypeId];
      return next;
    });
  };

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
        {dates.map(date => <button type="button" key={date} onClick={() => chooseDay(date)} className={`one-calendar-day ${isDateSelected(date, range[0], range[1]) ? "is-selected" : ""} ${isCheckoutDate(date, range[0], range[1]) ? "is-checkout" : ""}`} aria-label={`${t("oneCalendar.dayAria", { date: formatBuddhistDate(date), available: String(selectedTypes.reduce((sum: number, roomType: any) => sum + ((rowMap.get(`${roomType.id}:${date}`) as any)?.roomsAvailable ?? roomType.totalRooms), 0)), total: String(selectedTypes.reduce((sum: number, roomType: any) => sum + roomType.totalRooms, 0)), price: "" })}${isCheckoutDate(date, range[0], range[1]) ? ` · ${t("oneCalendar.checkoutDay")}` : ""}`}>
          <span className="one-calendar-day-number">{Number(date.slice(-2))}</span><span className="one-calendar-day-room-count">{selectedTypes.map((roomType: any) => { const row = rowMap.get(`${roomType.id}:${date}`) as any; const roomsForSale = row?.roomsAvailable ?? roomType.totalRooms; return <small key={roomType.id}>{roomsForSale === 0 ? t("oneCalendar.closed") : `${roomsForSale}/${roomType.totalRooms}`}</small>; })}</span>
          {data.calendar.data?.canSeePrice && <span className="one-calendar-day-price">{selectedTypes.map((roomType: any) => { const row = rowMap.get(`${roomType.id}:${date}`) as any; return row?.price == null ? null : <small key={roomType.id}>฿{Number(row.price).toLocaleString()}</small>; })}</span>}
        </button>)}
      </div> : <OneCalendarTimeline dates={dates} roomTypes={selectedTypes} rowMap={rowMap} selectedStart={range[0]} checkoutDate={range[1]} t={t} onChooseDay={chooseDay} />}
      <p className="field-help">{t("oneCalendar.chooseRange")}</p>
    </section>
    {range[0] && range[1] && <OneCalendarSidePanel startDate={range[0]} checkoutDate={range[1]} lastNight={selection.lastNight!} nightCount={selection.nightCount} language={language} roomTypes={selectedTypes} rowMap={rowMap} canManageRates={data.canManageRates} canManageAllotment={data.canManageAllotment} edits={edits} saveResults={saveResults} saving={saving} error={error} t={t} onEditChange={changeRoomTypeEdit} onSave={() => void save()} />}
  </div>;
}

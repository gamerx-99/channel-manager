import React from "react";
import { formatBuddhistDate } from "./oneCalendarRules";
import { emptyRoomTypeEdit, type RoomTypeEdit, type RoomTypeEdits } from "./useCalendarEdits";

type RoomType = { id: string; name: string; totalRooms: number };
type CalendarRow = { roomsAvailable: number; price: string | null };

type Props = {
  startDate: string;
  checkoutDate: string;
  lastNight: string;
  nightCount: number;
  language: "th" | "en";
  roomTypes: RoomType[];
  rowMap: Map<string, CalendarRow>;
  canManageRates: boolean;
  canManageAllotment: boolean;
  canManageStopSell: boolean;
  edits: RoomTypeEdits;
  saveResults: Record<string, "saved" | "failed">;
  saving: boolean;
  error: string | null;
  t: (key: any, values?: any) => string;
  onEditChange: (roomTypeId: string, change: Partial<RoomTypeEdit>) => void;
  onSave: () => void;
};

export default function OneCalendarSidePanel(props: Props) {
  const { startDate, checkoutDate, lastNight, nightCount, language, roomTypes, rowMap, canManageRates, canManageAllotment, canManageStopSell, edits, saveResults, saving, error, t } = props;
  const formatDate = (date: string) => formatBuddhistDate(date, language === "th" ? "th-TH" : "en-US-u-ca-gregory");
  return <aside className="one-calendar-panel panel" aria-label={t("oneCalendar.selectedRange")}>
    <div className="panel-heading"><div><div className="eyebrow">{t("oneCalendar.selectedRange")}</div><h2>{nightCount === 1
      ? t("oneCalendar.editOneNight", { date: formatDate(startDate) })
      : t("oneCalendar.editNights", { count: nightCount, start: formatDate(startDate), last: formatDate(lastNight), checkout: formatDate(checkoutDate) })}</h2></div></div>
    {!canManageRates && <p className="field-help">{t("oneCalendar.frontDeskHint")}</p>}
    {!roomTypes.length ? <p>{t("oneCalendar.chooseRoomTypes")}</p> : roomTypes.map(roomType => {
      const current = rowMap.get(`${roomType.id}:${startDate}`);
      const { rooms, price, minimum, useBase } = edits[roomType.id] ?? emptyRoomTypeEdit;
      return <section className="one-calendar-room-card" key={roomType.id}>
        <h3>{roomType.name}</h3>
        {saveResults[roomType.id] === "saved" && <p role="status">{t("oneCalendar.saved")}</p>}
        {saveResults[roomType.id] === "failed" && <p className="form-error">{t("oneCalendar.saveError")}</p>}
        {(canManageAllotment || canManageStopSell) && <div className="one-calendar-control-grid">
          {canManageAllotment && <label>{t("oneCalendar.rooms")}<input type="number" min="1" max={roomType.totalRooms} value={rooms} placeholder={String(current?.roomsAvailable ?? roomType.totalRooms)} onChange={event => props.onEditChange(roomType.id, { rooms: event.target.value, roomsAction: "allotment" })} /></label>}
          {canManageStopSell && <div className="one-calendar-sale-actions"><button type="button" className="button button-quiet button-small" onClick={() => props.onEditChange(roomType.id, { rooms: String(roomType.totalRooms), roomsAction: "stop_sell" })}>{t("oneCalendar.openSales")}</button><button type="button" className="button button-quiet button-small" onClick={() => props.onEditChange(roomType.id, { rooms: "0", roomsAction: "stop_sell" })}>{t("oneCalendar.closeSales")}</button></div>}
        </div>}
        {canManageRates && <div className="one-calendar-control-grid">
          <label>{t("oneCalendar.price")}<input type="number" min="0" step="0.01" value={price} placeholder={current?.price ?? ""} onChange={event => props.onEditChange(roomType.id, { price: event.target.value, useBase: false })} /></label>
          <label>{t("oneCalendar.minStay")}<input type="number" min="1" step="1" value={minimum} onChange={event => props.onEditChange(roomType.id, { minimum: event.target.value })} /></label>
          <button type="button" className={`button button-quiet button-small ${useBase ? "is-active" : ""}`} onClick={() => props.onEditChange(roomType.id, { useBase: !useBase, price: "" })}>{t("oneCalendar.basePrice")}</button>
        </div>}
      </section>;
    })}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-submit"><button className="button button-primary" type="button" onClick={props.onSave} disabled={saving || !roomTypes.length}>{saving ? t("oneCalendar.saving") : t("oneCalendar.save")}</button></div>
  </aside>;
}

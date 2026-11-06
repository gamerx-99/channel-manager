import { formatBuddhistDate } from "./oneCalendarRules";

type RoomType = { id: string; name: string; totalRooms: number };
type CalendarRow = { roomsAvailable: number; price: string | null };

type Props = {
  startDate: string;
  endDate: string;
  roomTypes: RoomType[];
  rowMap: Map<string, CalendarRow>;
  canManageRates: boolean;
  canManageAllotment: boolean;
  rooms: string;
  price: string;
  minimum: string;
  useBase: boolean;
  saving: boolean;
  error: string | null;
  t: (key: any, values?: any) => string;
  onRoomsChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onMinimumChange: (value: string) => void;
  onUseBaseChange: (value: boolean) => void;
  onSave: () => void;
};

export default function OneCalendarSidePanel(props: Props) {
  const { startDate, endDate, roomTypes, rowMap, canManageRates, canManageAllotment, rooms, price, minimum, useBase, saving, error, t } = props;
  return <aside className="one-calendar-panel panel" aria-label={t("oneCalendar.selectedRange")}>
    <div className="panel-heading"><div><div className="eyebrow">{t("oneCalendar.selectedRange")}</div><h2>{formatBuddhistDate(startDate)} – {formatBuddhistDate(endDate)}</h2></div></div>
    {!canManageRates && <p className="field-help">{t("oneCalendar.frontDeskHint")}</p>}
    {!roomTypes.length ? <p>{t("oneCalendar.chooseRoomTypes")}</p> : roomTypes.map(roomType => {
      const current = rowMap.get(`${roomType.id}:${startDate}`);
      return <section className="one-calendar-room-card" key={roomType.id}>
        <h3>{roomType.name}</h3>
        {canManageAllotment && <div className="one-calendar-control-grid">
          <label>{t("oneCalendar.rooms")}<input type="number" min="0" max={roomType.totalRooms} value={rooms} placeholder={String(current?.roomsAvailable ?? roomType.totalRooms)} onChange={event => props.onRoomsChange(event.target.value)} /></label>
          <div className="one-calendar-sale-actions"><button type="button" className="button button-quiet button-small" onClick={() => props.onRoomsChange(String(roomType.totalRooms))}>{t("oneCalendar.openSales")}</button><button type="button" className="button button-quiet button-small" onClick={() => props.onRoomsChange("0")}>{t("oneCalendar.closeSales")}</button></div>
        </div>}
        {canManageRates && <div className="one-calendar-control-grid">
          <label>{t("oneCalendar.price")}<input type="number" min="0" step="0.01" value={price} placeholder={current?.price ?? ""} onChange={event => { props.onPriceChange(event.target.value); props.onUseBaseChange(false); }} /></label>
          <label>{t("oneCalendar.minStay")}<input type="number" min="1" step="1" value={minimum} onChange={event => props.onMinimumChange(event.target.value)} /></label>
          <button type="button" className={`button button-quiet button-small ${useBase ? "is-active" : ""}`} onClick={() => { props.onUseBaseChange(!useBase); props.onPriceChange(""); }}>{t("oneCalendar.basePrice")}</button>
        </div>}
      </section>;
    })}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-submit"><button className="button button-primary" type="button" onClick={props.onSave} disabled={saving || !roomTypes.length}>{saving ? t("oneCalendar.saving") : t("oneCalendar.save")}</button></div>
  </aside>;
}

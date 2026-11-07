import { formatBuddhistDate, isCheckoutDate, isDateSelected } from "./oneCalendarRules";

type RoomType = { id: string; name: string; totalRooms: number };
type TimelineRow = { roomTypeId: string; date: string; availableRooms: number; roomsAvailable: number; closed: boolean };

type Props = {
  dates: string[];
  roomTypes: RoomType[];
  rowMap: Map<string, TimelineRow>;
  selectedStart: string | null;
  checkoutDate: string | null;
  t: (key: any, values?: any) => string;
  onChooseDay: (date: string) => void;
};

export default function OneCalendarTimeline({ dates, roomTypes, rowMap, selectedStart, checkoutDate, t, onChooseDay }: Props) {
  return <div className="one-calendar-timeline-scroll">
    <table className="one-calendar-timeline"><thead><tr><th>{t("oneCalendar.selectRooms")}</th>{dates.map(date => <th key={date}>{Number(date.slice(-2))}</th>)}</tr></thead><tbody>{roomTypes.map(roomType => <tr key={roomType.id}><th>{roomType.name}</th>{dates.map(date => {
      const row = rowMap.get(`${roomType.id}:${date}`);
      const open = !row?.closed && (row?.availableRooms ?? roomType.totalRooms) > 0;
      return <td key={date}><button type="button" className={`one-calendar-timeline-cell ${open ? "is-open" : "is-closed"} ${isDateSelected(date, selectedStart, checkoutDate) ? "is-selected" : ""} ${isCheckoutDate(date, selectedStart, checkoutDate) ? "is-checkout" : ""}`} onClick={() => onChooseDay(date)} aria-label={`${t("oneCalendar.timelineAria", { name: roomType.name, date: formatBuddhistDate(date), status: t(open ? "oneCalendar.available" : "oneCalendar.unavailable") })}${isCheckoutDate(date, selectedStart, checkoutDate) ? ` · ${t("oneCalendar.checkoutDay")}` : ""}`}>{t(open ? "oneCalendar.available" : "oneCalendar.unavailable")}</button></td>;
    })}</tr>)}</tbody></table>
  </div>;
}

import { ChevronLeft, ChevronRight, Edit3, Info, Save, SlidersHorizontal } from "lucide-react";
import { Link } from "wouter";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import PageState from "@/components/PageState";

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

function weekLabel(days: Date[]) {
  const first = days[0];
  const last = days[days.length - 1];
  const month = new Intl.DateTimeFormat("en-GB", { month: "long" });
  return first.getMonth() === last.getMonth()
    ? `${first.getDate()}–${last.getDate()} ${month.format(first)} ${first.getFullYear()}`
    : `${first.getDate()} ${month.format(first)}–${last.getDate()} ${month.format(last)} ${last.getFullYear()}`;
}

import { useHotel } from '@/contexts/HotelContext';

export default function Calendar() {
  const { selectedHotelId } = useHotel();
  const id = selectedHotelId ?? '';
  const [weekStart, setWeekStart] = useState(() => new Date());
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CalendarDraft>({});
  const utils = trpc.useUtils();
  const hotelQuery = trpc.channelManager.hotel.useQuery(id, { enabled: Boolean(id) });
  const availabilityQuery = trpc.channelManager.availability.useQuery(id, { enabled: Boolean(id) });
  const updateAvailability = trpc.channelManager.updateAvailability.useMutation({
    onSuccess: async () => {
      await utils.channelManager.availability.invalidate(id);
    },
  });

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
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
    return <div className="page-content"><PageState tone="loading" title="กำลังโหลดปฏิทินห้องพัก" description="กำลังอ่าน availability และราคาแบบ live จาก Supabase…" /></div>;
  }

  if (hotelQuery.error || availabilityQuery.error || !hotelQuery.data) {
    return <div className="page-content"><PageState tone="error" title="โหลดปฏิทินไม่สำเร็จ" description={hotelQuery.error?.message ?? availabilityQuery.error?.message ?? "ไม่พบโรงแรมหรือไม่มีสิทธิ์เข้าถึงข้อมูลนี้"} actionLabel="ลองใหม่" onAction={retryAvailability} actionPending={hotelQuery.isFetching || availabilityQuery.isFetching} /></div>;
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
      setSaveError(error instanceof Error ? error.message : "Unable to save availability changes.");
    }
  }

  return (
    <div className="page-content calendar-page">
      <div className="detail-back"><Link href={`/hotels/${hotel.id}`}>{hotel.name}</Link><span>/</span><strong>Availability</strong></div>
      <section className="page-intro intro-split">
        <div><div className="eyebrow">Operations / Daily controls</div><h1>Availability<span className="title-mark">.</span></h1><p className="lede">Rooms available and public rates, one day at a time.</p></div>
        <div className="intro-actions">
          <button className="button button-quiet" type="button" disabled title="Availability settings will be added with the room operations workflow"><SlidersHorizontal size={15} /> View settings</button>
          {editing ? <button className="button button-primary" type="button" disabled={updateAvailability.isPending} onClick={() => void saveCalendar()}><Save size={15} /> {updateAvailability.isPending ? "Saving…" : "Save changes"}</button> : <button className="button button-primary" type="button" onClick={() => { setEditing(true); setSaved(false); setSaveError(null); }}><Edit3 size={15} /> Edit calendar</button>}
        </div>
      </section>
      {saved && <div className="save-toast"><span className="check-circle">✓</span> Availability changes saved to Supabase.</div>}
      {(saveError || updateAvailability.error) && <div className="save-toast error-state" role="alert">{saveError || updateAvailability.error?.message}<button className="text-link" type="button" onClick={() => void saveCalendar()}>ลองบันทึกอีกครั้ง</button></div>}
      <section className="calendar-toolbar">
        <button className="icon-button bordered" type="button" onClick={() => setWeekStart(current => addDays(current, -7))} aria-label="Previous week"><ChevronLeft size={16} /></button>
        <div><strong>{weekLabel(days)}</strong><span>Live inventory · Thailand time</span></div>
        <button className="icon-button bordered" type="button" onClick={() => setWeekStart(current => addDays(current, 7))} aria-label="Next week"><ChevronRight size={16} /></button>
        <button className="button button-quiet small-button" type="button" onClick={() => setWeekStart(new Date())}>Today</button>
      </section>
      <section className="panel calendar-panel">
        <div className="calendar-legend"><span><i className="dot pine" /> Healthy inventory</span><span><i className="dot amber" /> Low inventory</span><span><i className="dot slate" /> Closed / unavailable</span><span className="calendar-info"><Info size={14} /> Prices shown in THB</span></div>
        <p className="mobile-scroll-hint" role="note">เลื่อนตารางในแนวนอนเพื่อดูวันถัดไปและอัตราของห้องทุกประเภท</p>
        <div className="calendar-scroll">
          <table className="availability-table">
            <thead><tr><th className="room-type-heading">Room type</th>{days.map(day => <th key={toIsoDate(day)}><span>{day.getDate()}</span><small>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(day)}</small></th>)}</tr></thead>
            <tbody>
              {hotel.room_types.length ? hotel.room_types.map((roomType, index) => <tr className="sub-row" key={roomType.id}>
                <td><div className="calendar-room-label"><span className={`room-type-bar ${index % 3 === 0 ? "pine" : index % 3 === 1 ? "slate" : "amber"}`} /><strong>{roomType.name}</strong><small>{roomCountByType[roomType.id] ?? 0} rooms</small></div></td>
                {days.map(day => {
                  const date = toIsoDate(day);
                  const savedCell = availabilityByKey.get(`${roomType.id}:${date}`);
                  const fallbackAvailable = savedCell?.rooms_available ?? roomCountByType[roomType.id] ?? 0;
                  const fallbackPrice = Number(savedCell?.price ?? roomType.base_price);
                  const cell = draftCell(roomType.id, date, fallbackAvailable, fallbackPrice);
                  return <td key={date}><AvailabilityCell available={cell.available} price={cell.price} editing={editing} onChange={update => updateDraft(roomType.id, date, update, fallbackAvailable, fallbackPrice)} /></td>;
                })}
              </tr>) : <tr><td colSpan={8} className="empty-cell">No room types configured yet. Add a room type before editing availability.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="calendar-footer"><span>Inventory is loaded under your Supabase hotel membership.</span><span className="signal-text"><i /> RLS protected</span></div>
      </section>
      <section className="calendar-notes"><div><div className="eyebrow">How it works</div><p>Availability changes are saved to Supabase and can be surfaced on the public hotel page without exposing hotel-owner contact data.</p></div><Link href={`/hotels/${hotel.id}/bookings`} className="text-link">Go to bookings <ChevronRight size={14} /></Link></section>
    </div>
  );
}

function AvailabilityCell({ available, price, editing, onChange }: { available: number; price: number; editing: boolean; onChange: (update: Partial<{ available: number; price: number }>) => void }) {
  const isLow = available <= 2;
  if (editing) {
    return <div className={`availability-cell ${isLow ? "low" : ""}`}><input className="cell-input" value={available} min="0" type="number" aria-label="จำนวนห้องว่าง" onChange={event => onChange({ available: Math.max(0, Number(event.target.value)) })} /><input className="cell-price-input" value={price} min="0" type="number" aria-label="ราคา" onChange={event => onChange({ price: Math.max(0, Number(event.target.value)) })} /></div>;
  }
  return <div className={`availability-cell ${isLow ? "low" : ""}`}><span className="cell-available"><i className={`dot ${available === 0 ? "slate" : isLow ? "amber" : "pine"}`} />{available} rooms</span><strong>฿{price.toLocaleString()}</strong></div>;
}

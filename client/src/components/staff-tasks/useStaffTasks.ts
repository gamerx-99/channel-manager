import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useHotel } from "@/contexts/HotelContext";
import { hasHotelPermission } from "@shared/authorization";
import { useTranslation } from "@/lib/i18n";

function thaiToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function useStaffTasks() {
  const { selectedHotelId } = useHotel(); const { t, language } = useTranslation(); const auth = trpc.auth.me.useQuery();
  const [date, setDate] = useState(thaiToday); const [editing, setEditing] = useState<any | null>(null);
  const canManage = Boolean(selectedHotelId && hasHotelPermission(auth.data?.roles ?? [], auth.data?.memberships ?? [], selectedHotelId, "staff.manage_tasks"));
  const canViewOwn = Boolean(selectedHotelId && hasHotelPermission(auth.data?.roles ?? [], auth.data?.memberships ?? [], selectedHotelId, "staff.view_own_tasks"));
  const utils = trpc.useUtils(); const invalidate = async () => { await Promise.all([utils.staffTasks.list.invalidate(), utils.staffTasks.myTasks.invalidate()]); };
  const staff = trpc.staffShifts.list.useQuery({ hotel_id: selectedHotelId ?? "", month: date.slice(0, 7) }, { enabled: Boolean(selectedHotelId && canManage) });
  const hotel = trpc.channelManager.hotel.useQuery(selectedHotelId ?? "", { enabled: Boolean(selectedHotelId && canManage) });
  const list = trpc.staffTasks.list.useQuery({ hotel_id: selectedHotelId ?? "", from: date, to: date }, { enabled: Boolean(selectedHotelId && canManage) });
  const mine = trpc.staffTasks.myTasks.useQuery({ hotel_id: selectedHotelId ?? "" }, { enabled: Boolean(selectedHotelId && canViewOwn && !canManage) });
  const create = trpc.staffTasks.create.useMutation({ onSuccess: async () => { setEditing(null); await invalidate(); } });
  const update = trpc.staffTasks.update.useMutation({ onSuccess: async () => { setEditing(null); await invalidate(); } });
  const remove = trpc.staffTasks.delete.useMutation({ onSuccess: invalidate }); const setDone = trpc.staffTasks.setDone.useMutation({ onSuccess: invalidate });
  const grouped = useMemo(() => (list.data ?? []).reduce<Record<string, typeof list.data>>((groups, item) => { (groups[item.assigned_to] ??= []).push(item); return groups; }, {}), [list.data]);
  return { t, language, selectedHotelId, date, setDate, editing, setEditing, canManage, canViewOwn, staff, rooms: hotel.data?.rooms ?? [], list, mine, create, update, remove, setDone, grouped };
}

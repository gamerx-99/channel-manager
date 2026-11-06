import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useHotel } from "@/contexts/HotelContext";
import { hasHotelPermission } from "@shared/authorization";
import { useTranslation } from "@/lib/i18n";
function monthShiftHours(shifts: readonly { start_time: string; end_time: string; break_minutes: number }[]) {
  return shifts.reduce((total, shift) => { const start = Number(shift.start_time.slice(0, 2)) * 60 + Number(shift.start_time.slice(3)); let end = Number(shift.end_time.slice(0, 2)) * 60 + Number(shift.end_time.slice(3)); if (end < start) end += 1440; return total + Math.max(0, end - start - shift.break_minutes); }, 0) / 60;
}

export function useStaffShifts() {
  const { selectedHotelId } = useHotel();
  const { t, language } = useTranslation();
  const locale = language;
  const auth = trpc.auth.me.useQuery();
  const today = new Date();
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [editing, setEditing] = useState<any | null>(null);
  const query = trpc.staffShifts.list.useQuery({ hotel_id: selectedHotelId ?? "", month }, { enabled: Boolean(selectedHotelId) });
  const utils = trpc.useUtils();
  const invalidate = async () => { await utils.staffShifts.list.invalidate(); };
  const add = trpc.staffShifts.add.useMutation({ onSuccess: invalidate });
  const edit = trpc.staffShifts.edit.useMutation({ onSuccess: invalidate });
  const remove = trpc.staffShifts.delete.useMutation({ onSuccess: invalidate });
  const updateMember = trpc.staffShifts.updateMember.useMutation({ onSuccess: invalidate });
  const canManage = Boolean(selectedHotelId && hasHotelPermission(auth.data?.roles ?? [], auth.data?.memberships ?? [], selectedHotelId, "staff.manage_shifts"));
  const days = useMemo(() => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }, [month]);
  function moveMonth(amount: number) { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + amount); setMonth(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`); }
  function monthLabel() { const [y, m] = month.split("-").map(Number); return new Intl.DateTimeFormat(locale === "th" ? "th-TH-u-ca-buddhist" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1))); }
  function totalFor(memberId: string) { return monthShiftHours((query.data?.shifts ?? []).filter(s => s.hotel_user_id === memberId)); }
  return { t, locale, month, moveMonth, monthLabel, days, query, canManage, editing, setEditing, add, edit, remove, updateMember, totalFor };
}

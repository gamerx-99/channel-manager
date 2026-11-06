import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { getMonthDates } from "./oneCalendarRules";

export function useOneCalendar(hotelId: string, month: Date) {
  const utils = trpc.useUtils();
  const hotel = trpc.channelManager.hotel.useQuery(hotelId, { enabled: Boolean(hotelId) });
  const auth = trpc.auth.me.useQuery();
  const dates = useMemo(() => getMonthDates(month), [month.getFullYear(), month.getMonth()]);
  const startDate = dates[0]!;
  const endDate = dates[dates.length - 1]!;
  const calendar = trpc.channelManager.listCalendar.useQuery(
    { hotel_id: hotelId, start_date: startDate, end_date: endDate },
    { enabled: Boolean(hotelId) },
  );
  const save = trpc.channelManager.saveCalendarRange.useMutation({
    onSuccess: async () => utils.channelManager.listCalendar.invalidate({ hotel_id: hotelId, start_date: startDate, end_date: endDate }),
  });
  const roomTypes = useMemo(() => {
    const detail = hotel.data as any;
    return (detail?.room_types ?? []).map((roomType: any) => ({
      id: roomType.id,
      name: roomType.name,
      totalRooms: (detail?.rooms ?? []).filter((room: any) => (room.room_type_id ?? room.roomTypeId) === roomType.id).length,
    }));
  }, [hotel.data]);
  const permissions = auth.data?.memberships?.find((membership: any) => membership.hotelId === hotelId)?.permissions ?? [];
  return {
    hotel,
    calendar,
    save,
    roomTypes,
    dates,
    canManageRates: permissions.includes("revenue.manage_rates"),
    canManageAllotment: permissions.includes("revenue.manage_allotment"),
  };
}

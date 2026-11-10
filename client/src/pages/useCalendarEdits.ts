import { useState } from "react";

export type RoomTypeEdit = { rooms: string; roomsAction: "allotment" | "stop_sell"; price: string; minimum: string; useBase: boolean };
export type RoomTypeEdits = Record<string, RoomTypeEdit>;
export const emptyRoomTypeEdit: RoomTypeEdit = { rooms: "", roomsAction: "allotment", price: "", minimum: "", useBase: false };

export function buildCalendarSaveInputs(
  roomTypeIds: string[], edits: RoomTypeEdits, hotelId: string, startDate: string, lastNight: string,
  canManageRates: boolean, canManageAllotment: boolean, canManageStopSell = false,
) {
  return roomTypeIds.flatMap(roomTypeId => {
    const edit = edits[roomTypeId] ?? emptyRoomTypeEdit;
    const input: {
      hotel_id: string; room_type_ids: string[]; start_date: string; end_date: string;
      rooms_available?: number; availability_action?: "allotment" | "stop_sell"; price?: number; min_stay_nights?: number; base?: boolean;
    } = { hotel_id: hotelId, room_type_ids: [roomTypeId], start_date: startDate, end_date: lastNight };
    if (edit.rooms !== "" && ((edit.roomsAction === "allotment" && canManageAllotment) || (edit.roomsAction === "stop_sell" && canManageStopSell))) {
      input.rooms_available = Number(edit.rooms);
      input.availability_action = edit.roomsAction;
    }
    if (canManageRates && edit.price !== "" && !edit.useBase) input.price = Number(edit.price);
    if (canManageRates && edit.minimum !== "") input.min_stay_nights = Number(edit.minimum);
    if (canManageRates && edit.useBase) input.base = true;
    return Object.keys(input).length > 4 ? [input] : [];
  });
}

export function useCalendarEdits() {
  const [edits, setEdits] = useState<RoomTypeEdits>({});
  const updateEdit = (roomTypeId: string, change: Partial<RoomTypeEdit>) => setEdits(current => ({
    ...current,
    [roomTypeId]: { ...(current[roomTypeId] ?? emptyRoomTypeEdit), ...change },
  }));
  const clearEdit = (roomTypeId: string) => setEdits(current => {
    const next = { ...current };
    delete next[roomTypeId];
    return next;
  });
  return { edits, updateEdit, clearEdit, clearAll: () => setEdits({}) };
}

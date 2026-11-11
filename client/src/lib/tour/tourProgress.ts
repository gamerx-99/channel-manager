export type TourProgressInput = {
  hotel: { name: string | null; address: string | null; ownerContact: string | null } | null;
  roomTypes: Array<{ id: string }>;
  rooms: Array<{ roomTypeId: string }>;
  skippedAt: number | null;
  completedAt: number | null;
  /** Optional so older callers keep working; true means PromptPay and SlipOK are both saved. */
  financeDone?: boolean;
};

/** The step the tour opens at when nothing was remembered: the first one still to do (0 hotel, 1 rooms, 2 finance). */
export function tourStartStep(progress: { hotelSettingsDone: boolean; roomsDone: boolean }): number {
  if (!progress.hotelSettingsDone) return 0;
  return progress.roomsDone ? 2 : 1;
}

export function getTourProgress(input: TourProgressInput) {
  const hotelSettingsDone = Boolean(input.hotel?.name?.trim() && input.hotel.address?.trim() && input.hotel.ownerContact?.trim());
  const roomsDone = input.roomTypes.some(type => input.rooms.some(room => room.roomTypeId === type.id));
  // The finance step is shown in the tour but never decides whether the tour starts by itself.
  return { hotelSettingsDone, roomsDone, financeDone: input.financeDone ?? true, shouldAutoStart: !(hotelSettingsDone && roomsDone) && input.skippedAt == null && input.completedAt == null };
}

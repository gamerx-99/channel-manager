export type TourProgressInput = {
  hotel: { name: string | null; address: string | null; ownerContact: string | null } | null;
  roomTypes: Array<{ id: string }>;
  rooms: Array<{ roomTypeId: string }>;
  skippedAt: number | null;
  completedAt: number | null;
};

export function getTourProgress(input: TourProgressInput) {
  const hotelSettingsDone = Boolean(input.hotel?.name?.trim() && input.hotel.address?.trim() && input.hotel.ownerContact?.trim());
  const roomsDone = input.roomTypes.some(type => input.rooms.some(room => room.roomTypeId === type.id));
  return { hotelSettingsDone, roomsDone, shouldAutoStart: !(hotelSettingsDone && roomsDone) && input.skippedAt == null && input.completedAt == null };
}

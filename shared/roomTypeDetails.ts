/** Details supplied by the hotel for a room type. Empty fields stay empty. */
export type RoomTypeDetails = {
  description: string | null;
  bed_type: string | null;
  size_sqm: number | null;
  amenities: string[];
};

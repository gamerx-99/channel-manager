import type { SupabaseClient } from "@supabase/supabase-js";
import { throwOnError } from "./utils";
import type { HotelRecord, RoomTypeRecord, BookingRecord, CreateHotelInput, CreateRoomTypeInput, UpdateRoomTypeInput, DeleteRoomTypeInput } from "./types";

/** Lists only hotels visible to the authenticated caller under RLS. */
export async function listManagedHotels(client: SupabaseClient) {
  const { data, error } = await client
    .from("hotels")
    .select("id,name,slug,address,public_enabled,created_at,room_types(id),rooms(id,status),bookings(id,source,status,check_in,check_out,price)")
    .order("created_at", { ascending: false });
  throwOnError(error);
  return (data ?? []) as Array<HotelRecord & {
    room_types: Array<{ id: string }>;
    rooms: Array<{ id: string; status: string }>;
    bookings: Array<{
      id: string;
      source: BookingRecord["source"];
      status: BookingRecord["status"];
      check_in: string;
      check_out: string;
      price: number | string;
    }>;
  }>;
}

/** Lists RLS-visible hotels with bookings joined to their room type name, for revenue reporting. */
export async function listManagedHotelsForFinancials(client: SupabaseClient) {
  const { data, error } = await client
    .from("hotels")
    .select("id,bookings(id,status,check_in,check_out,price,rooms(room_types(name)))")
    .order("created_at", { ascending: false });
  throwOnError(error);
  return (data ?? []) as unknown as Array<{
    id: string;
    bookings: Array<{
      id: string;
      status: BookingRecord["status"];
      check_in: string;
      check_out: string;
      price: number | string;
      rooms: { room_types: { name: string } | null } | null;
    }>;
  }>;
}

export async function getManagedHotel(client: SupabaseClient, hotelId: string) {
  const { data, error } = await client
    .from("hotels")
    .select("id,name,slug,address,public_enabled,created_at,room_types(id,hotel_id,name,capacity,base_price),rooms(id,room_type_id,room_number,status)")
    .eq("id", hotelId)
    .maybeSingle();
  throwOnError(error);
  if (!data) return null;
  return data as HotelRecord & {
    room_types: RoomTypeRecord[];
    rooms: Array<{ id: string; room_type_id: string; room_number: string; status: string }>;
  };
}

/** Inserts with the authenticated caller's JWT-scoped client; the database RLS policy remains authoritative. */
export async function createManagedHotel(client: SupabaseClient, input: CreateHotelInput) {
  const { data, error } = await client
    .from("hotels")
    .insert(input)
    .select("id,name,slug,address,public_enabled,created_at")
    .single();
  throwOnError(error);
  if (!data) throw new Error("Hotel insert did not return a record.");
  return data as HotelRecord;
}

/** Inserts after the router has checked that the caller can read the target hotel under RLS. */
export async function createManagedRoomType(client: SupabaseClient, input: CreateRoomTypeInput) {
  const { quantity, ...roomTypeInput } = input;
  const { data: roomType, error: typeError } = await client
    .from("room_types")
    .insert(roomTypeInput)
    .select("id,hotel_id,name,capacity,base_price")
    .single();
  throwOnError(typeError);
  if (!roomType) throw new Error("Room type insert did not return a record.");

  const rooms = Array.from({ length: quantity }, (_, i) => ({
    hotel_id: input.hotel_id,
    room_type_id: roomType.id,
    room_number: `${String(i + 1).padStart(3, "0")}`,
  }));
  const { error: roomsError } = await client.from("rooms").insert(rooms);
  throwOnError(roomsError);

  return roomType as RoomTypeRecord;
}

/** Updates only mutable room type fields while constraining the write to the selected hotel. */
export async function updateManagedRoomType(client: SupabaseClient, input: UpdateRoomTypeInput) {
  const { data, error } = await client
    .from("room_types")
    .update({ name: input.name, capacity: input.capacity, base_price: input.base_price })
    .eq("id", input.room_type_id)
    .eq("hotel_id", input.hotel_id)
    .select("id,hotel_id,name,capacity,base_price")
    .maybeSingle();
  throwOnError(error);
  return (data ?? null) as RoomTypeRecord | null;
}

/** Deletes a room type through the authenticated caller's RLS client and hotel scope. */
export async function deleteManagedRoomType(client: SupabaseClient, input: DeleteRoomTypeInput) {
  const { data, error } = await client
    .from("room_types")
    .delete()
    .eq("id", input.room_type_id)
    .eq("hotel_id", input.hotel_id)
    .select("id")
    .maybeSingle();
  throwOnError(error);
  return data?.id ? { id: data.id as string } : null;
}

export async function getPublicHotel(client: SupabaseClient, slug: string) {
  const { data, error } = await client.rpc("get_public_hotel", { target_slug: slug }).single();
  throwOnError(error);

  const hotel = data as Pick<HotelRecord, "id" | "name" | "slug" | "address" | "created_at">;
  const [{ data: roomTypes, error: roomTypeError }, { data: media, error: mediaError }] = await Promise.all([
    client.from("room_types").select("id,hotel_id,name,capacity,base_price").eq("hotel_id", hotel.id).order("base_price"),
    client.from("hotel_media").select("id,url,caption,is_hero,display_order").eq("hotel_id", hotel.id).order("display_order"),
  ]);
  throwOnError(roomTypeError);
  throwOnError(mediaError);
  return { hotel, roomTypes: (roomTypes ?? []) as RoomTypeRecord[], media: media ?? [] };
}

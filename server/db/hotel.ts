import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultChildRateConfig, defaultOccupancyPricing } from "@shared/occupancyPricing";
import { throwOnError } from "./utils";
import type { HotelRecord, RoomTypeRecord, BookingRecord, CreateHotelInput, CreateRoomTypeInput, UpdateRoomTypeInput, DeleteRoomTypeInput, HotelServiceRecord, CreateHotelServiceInput, UpdateHotelServiceInput, DeleteHotelServiceInput } from "./types";

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
    .select("id,name,slug,address,public_enabled,created_at,room_types(id,hotel_id,name,capacity,base_price,base_occupancy,max_occupancy,occupancy_pricing,child_rule,child_rule_limit,child_rates,children_count_toward_max),rooms(id,room_type_id,room_number,status)")
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
  const configuration = {
    base_occupancy: input.base_occupancy ?? Math.min(2, input.capacity),
    max_occupancy: input.max_occupancy ?? input.capacity,
    occupancy_pricing: input.occupancy_pricing ?? defaultOccupancyPricing(input.base_occupancy ?? Math.min(2, input.capacity), input.max_occupancy ?? input.capacity),
    child_rule: input.child_rule ?? 'age',
    child_rule_limit: input.child_rule_limit ?? null,
    child_rates: input.child_rates ?? defaultChildRateConfig(),
    children_count_toward_max: input.children_count_toward_max ?? true,
  };
  const { data: roomType, error: typeError } = await client
    .from("room_types")
    .insert({ ...roomTypeInput, ...configuration, capacity: configuration.max_occupancy })
    .select("id,hotel_id,name,capacity,base_price,base_occupancy,max_occupancy,occupancy_pricing,child_rule,child_rule_limit,child_rates,children_count_toward_max")
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
  const configurationPatch = Object.fromEntries(
    (['base_occupancy', 'max_occupancy', 'occupancy_pricing', 'child_rule', 'child_rule_limit', 'child_rates', 'children_count_toward_max'] as const)
      .filter(key => input[key] !== undefined)
      .map(key => [key, input[key]]),
  );
  const { data, error } = await client.rpc('update_room_type_with_occupancy_config', {
    target_hotel_id: input.hotel_id,
    target_room_type_id: input.room_type_id,
    target_name: input.name,
    target_capacity: input.max_occupancy ?? input.capacity,
    target_base_price: input.base_price,
    target_occupancy_config: configurationPatch,
  }).maybeSingle();
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

export async function createHotelService(client: SupabaseClient, input: CreateHotelServiceInput) {
  const { data, error } = await client
    .from('hotel_services')
    .insert(input)
    .select('id,hotel_id,name,pricing_model,unit_price,is_active,created_at,updated_at')
    .single();
  throwOnError(error);
  return data as HotelServiceRecord;
}

export async function updateHotelService(client: SupabaseClient, input: UpdateHotelServiceInput) {
  const { data, error } = await client
    .from('hotel_services')
    .update({ name: input.name, pricing_model: input.pricing_model, unit_price: input.unit_price, is_active: input.is_active })
    .eq('id', input.service_id)
    .eq('hotel_id', input.hotel_id)
    .select('id,hotel_id,name,pricing_model,unit_price,is_active,created_at,updated_at')
    .maybeSingle();
  throwOnError(error);
  return (data ?? null) as HotelServiceRecord | null;
}

export async function deleteHotelService(client: SupabaseClient, input: DeleteHotelServiceInput) {
  const { data, error } = await client
    .from('hotel_services')
    .delete()
    .eq('id', input.service_id)
    .eq('hotel_id', input.hotel_id)
    .select('id')
    .maybeSingle();
  throwOnError(error);
  return data?.id ? { id: data.id as string } : null;
}

/** All services for a hotel (active and inactive) — staff/admin view. */
export async function listHotelServices(client: SupabaseClient, hotelId: string) {
  const { data, error } = await client
    .from('hotel_services')
    .select('id,hotel_id,name,pricing_model,unit_price,is_active,created_at,updated_at')
    .eq('hotel_id', hotelId)
    .order('created_at');
  throwOnError(error);
  return (data ?? []) as HotelServiceRecord[];
}

/** Active-only services for a hotel, looked up by slug — public booking wizard view. */
export async function listActiveHotelServicesBySlug(client: SupabaseClient, slug: string) {
  const { data: hotelData, error: hotelError } = await client.rpc('get_public_hotel', { target_slug: slug }).single();
  throwOnError(hotelError);
  if (!hotelData) return [];
  const hotel = hotelData as { id: string };
  const { data, error } = await client
    .from('hotel_services')
    .select('id,hotel_id,name,pricing_model,unit_price,is_active,created_at,updated_at')
    .eq('hotel_id', hotel.id)
    .eq('is_active', true)
    .order('created_at');
  throwOnError(error);
  return (data ?? []) as HotelServiceRecord[];
}

export async function getPublicHotel(client: SupabaseClient, slug: string) {
  const { data, error } = await client.rpc("get_public_hotel", { target_slug: slug }).single();
  throwOnError(error);

  const hotel = data as Pick<HotelRecord, "id" | "name" | "slug" | "address" | "created_at">;
  const [{ data: roomTypes, error: roomTypeError }, { data: media, error: mediaError }] = await Promise.all([
    client.from("room_types").select("id,hotel_id,name,capacity,base_price,base_occupancy,max_occupancy,occupancy_pricing,child_rule,child_rule_limit,child_rates,children_count_toward_max").eq("hotel_id", hotel.id).order("base_price"),
    client.from("hotel_media").select("id,url,caption,is_hero,display_order").eq("hotel_id", hotel.id).order("display_order"),
  ]);
  throwOnError(roomTypeError);
  throwOnError(mediaError);
  return { hotel, roomTypes: (roomTypes ?? []) as RoomTypeRecord[], media: media ?? [] };
}

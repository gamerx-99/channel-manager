import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createManagedHotel, createManagedRoomType, updateManagedRoomType, deleteManagedRoomType } from './db';

describe('createManagedHotel', () => {
  it('inserts only the supplied hotel fields through the request-scoped client', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'hotel-created',
        name: 'Little Bro',
        slug: 'little-bro',
        address: 'Bangkok',
        public_enabled: false,
        created_at: '2026-08-18T00:00:00.000Z',
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const client = { from } as unknown as SupabaseClient;
    const input = {
      name: 'Little Bro',
      slug: 'little-bro',
      address: 'Bangkok',
      owner_contact: 'owner@example.com',
      public_enabled: false,
    };

    await expect(createManagedHotel(client, input)).resolves.toMatchObject({ id: 'hotel-created' });
    expect(from).toHaveBeenCalledWith('hotels');
    expect(insert).toHaveBeenCalledWith(input);
    expect(select).toHaveBeenCalledWith('id,name,slug,address,public_enabled,created_at');
    expect(single).toHaveBeenCalledOnce();
  });
});

describe('createManagedRoomType', () => {
  it('inserts the target hotel id and room type values through the request-scoped client', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'room-type-created',
        hotel_id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4',
        name: 'Deluxe King',
        capacity: 2,
        base_price: 2500,
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const client = { from } as unknown as SupabaseClient;
    const input = {
      hotel_id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4',
      name: 'Deluxe King',
      capacity: 2,
      base_price: 2500,
    };

    await expect(createManagedRoomType(client, input)).resolves.toMatchObject({ id: 'room-type-created' });
    expect(from).toHaveBeenCalledWith('room_types');
    expect(insert).toHaveBeenCalledWith({ ...input, base_occupancy: 2, max_occupancy: 2, extra_guest_mode: 'per_person', extra_guest_amount: 0, extra_guest_tier_percents: [], child_rule: 'age', child_rule_limit: null, child_price_mode: 'free', child_price_value: 0, children_count_toward_max: true });
    expect(select).toHaveBeenCalledWith('id,hotel_id,name,capacity,base_price,base_occupancy,max_occupancy,extra_guest_mode,extra_guest_amount,extra_guest_tier_percents,child_rule,child_rule_limit,child_price_mode,child_price_value,children_count_toward_max');
    expect(single).toHaveBeenCalledOnce();
  });
});

describe('updateManagedRoomType', () => {
  it('updates mutable fields with both room type and hotel filters', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'room-type-updated',
        hotel_id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4',
        name: 'Suite',
        capacity: 3,
        base_price: 3200,
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const hotelFilter = vi.fn().mockReturnValue({ select });
    const roomFilter = vi.fn().mockReturnValue({ eq: hotelFilter });
    const update = vi.fn().mockReturnValue({ eq: roomFilter });
    const from = vi.fn().mockReturnValue({ update });
    const client = { from } as unknown as SupabaseClient;
    const input = {
      hotel_id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4',
      room_type_id: 'f1a1b1c1-d1e1-41f1-81f1-111111111111',
      name: 'Suite',
      capacity: 3,
      base_price: 3200,
    };

    await expect(updateManagedRoomType(client, input)).resolves.toMatchObject({ id: 'room-type-updated' });
    expect(from).toHaveBeenCalledWith('room_types');
    expect(update).toHaveBeenCalledWith({ name: 'Suite', capacity: 3, base_price: 3200, max_occupancy: 3 });
    expect(roomFilter).toHaveBeenCalledWith('id', input.room_type_id);
    expect(hotelFilter).toHaveBeenCalledWith('hotel_id', input.hotel_id);
    expect(select).toHaveBeenCalledWith('id,hotel_id,name,capacity,base_price,base_occupancy,max_occupancy,extra_guest_mode,extra_guest_amount,extra_guest_tier_percents,child_rule,child_rule_limit,child_price_mode,child_price_value,children_count_toward_max');
    expect(maybeSingle).toHaveBeenCalledOnce();
  });
});

describe('deleteManagedRoomType', () => {
  it('deletes only the selected room type inside the selected hotel', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'room-type-deleted' }, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const hotelFilter = vi.fn().mockReturnValue({ select });
    const roomFilter = vi.fn().mockReturnValue({ eq: hotelFilter });
    const deleteMethod = vi.fn().mockReturnValue({ eq: roomFilter });
    const from = vi.fn().mockReturnValue({ delete: deleteMethod });
    const client = { from } as unknown as SupabaseClient;
    const input = {
      hotel_id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4',
      room_type_id: 'f1a1b1c1-d1e1-41f1-81f1-111111111111',
    };

    await expect(deleteManagedRoomType(client, input)).resolves.toEqual({ id: 'room-type-deleted' });
    expect(from).toHaveBeenCalledWith('room_types');
    expect(deleteMethod).toHaveBeenCalledOnce();
    expect(roomFilter).toHaveBeenCalledWith('id', input.room_type_id);
    expect(hotelFilter).toHaveBeenCalledWith('hotel_id', input.hotel_id);
    expect(select).toHaveBeenCalledWith('id');
    expect(maybeSingle).toHaveBeenCalledOnce();
  });
});

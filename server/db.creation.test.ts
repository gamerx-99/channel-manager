import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    expect(insert).toHaveBeenCalledWith({ ...input, base_occupancy: 2, max_occupancy: 2, occupancy_pricing: { '1': { enabled: false, mode: 'percent', value: 0 }, '2': { enabled: true, mode: 'percent', value: 0 } }, child_rule: 'age', child_rule_limit: null, child_rates: { infant: { mode: 'free', value: 0 }, age_groups: [], height: { mode: 'free', value: 0 } }, children_count_toward_max: true });
    expect(select).toHaveBeenCalledWith('id,hotel_id,name,capacity,base_price,base_occupancy,max_occupancy,occupancy_pricing,child_rule,child_rule_limit,child_rates,children_count_toward_max');
    expect(single).toHaveBeenCalledOnce();
  });
});

describe('updateManagedRoomType', () => {
  it('updates mutable fields through the atomic occupancy-config RPC', async () => {
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
    const rpc = vi.fn().mockReturnValue({ maybeSingle });
    const client = { rpc } as unknown as SupabaseClient;
    const input = {
      hotel_id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4',
      room_type_id: 'f1a1b1c1-d1e1-41f1-81f1-111111111111',
      name: 'Suite',
      capacity: 3,
      base_price: 3200,
    };

    await expect(updateManagedRoomType(client, input)).resolves.toMatchObject({ id: 'room-type-updated' });
    expect(rpc).toHaveBeenCalledWith('update_room_type_with_occupancy_config', {
      target_hotel_id: input.hotel_id,
      target_room_type_id: input.room_type_id,
      target_name: input.name,
      target_capacity: 3,
      target_base_price: 3200,
      target_occupancy_config: {},
    });
    expect(maybeSingle).toHaveBeenCalledOnce();
  });

  it('sends the chosen child rule and the edited room type limit to the atomic RPC', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const rpc = vi.fn().mockReturnValue({ maybeSingle });
    const client = { rpc } as unknown as SupabaseClient;
    const input = {
      hotel_id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4',
      room_type_id: 'f1a1b1c1-d1e1-41f1-81f1-111111111111',
      name: 'Suite',
      capacity: 3,
      base_price: 3200,
      child_rule: 'height' as const,
      child_rule_limit: 160,
    };

    await updateManagedRoomType(client, input);
    expect(rpc).toHaveBeenCalledWith('update_room_type_with_occupancy_config', expect.objectContaining({
      target_occupancy_config: { child_rule: 'height', child_rule_limit: 160 },
    }));
  });

  it('resets hotel-wide child limits only when the measurement rule changes and preserves the submitted limit', () => {
    const migration = readFileSync(resolve(process.cwd(), '20261009_room_type_occupancy_pricing.sql'), 'utf8');
    expect(migration).toMatch(/IF next_child_rule IS DISTINCT FROM current_child_rule THEN[\s\S]*?child_rule_limit = NULL/);
    expect(migration).toMatch(/WHEN target_occupancy_config \? 'child_rule_limit'[\s\S]*?THEN NULLIF\(target_occupancy_config->>'child_rule_limit', ''\)::numeric/);
  });

  it('requires pricing fields when the migration RPC changes room capacity', () => {
    const migration = readFileSync(resolve(process.cwd(), '20261009_room_type_occupancy_pricing.sql'), 'utf8');
    expect(migration).toMatch(/target_capacity IS DISTINCT FROM current_capacity[\s\S]*?occupancy_pricing[\s\S]*?child_rates/);
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

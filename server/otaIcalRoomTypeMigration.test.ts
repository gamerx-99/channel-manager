import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), '20261026_ota_ical_room_type_mode.sql'), 'utf8');
const verify = readFileSync(resolve(process.cwd(), 'verify_20261026_ota_ical_room_type_mode.sql'), 'utf8');

function functionBody(name: string) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = migration.indexOf('$$;', start);
  return migration.slice(start, end);
}

describe('20261026_ota_ical_room_type_mode migration contract', () => {
  it('is additive: no DROP TABLE, no DELETE, no TRUNCATE', () => {
    expect(migration).not.toMatch(/DROP\s+TABLE/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('maps a connection to a room OR a room type, never both, within the same hotel', () => {
    expect(migration).toContain('REFERENCES public.room_types(id) ON DELETE SET NULL');
    expect(migration).toContain('CHECK (num_nonnulls(room_id, room_type_id) <= 1)');
    expect(functionBody('ota_connection_room_same_hotel')).toContain('rt.hotel_id = NEW.hotel_id');
    expect(migration).toContain('UPDATE OF room_id, room_type_id, hotel_id');
  });

  it('places room-type events on the first free room and reports a conflict when none fits', () => {
    const body = functionBody('sync_ota_ical_blocks');
    expect(body).toContain("r.status IS DISTINCT FROM 'maintenance'");
    expect(body).toContain('FOREACH candidate IN ARRAY candidates');
    expect(body).toContain('EXCEPTION WHEN exclusion_violation');
    expect(body).toContain("conflicts := conflicts || jsonb_build_object('uid', event_uid");
  });

  it('keeps the single-room safeguards: authorization, row lock, front-desk stays untouched', () => {
    const body = functionBody('sync_ota_ical_blocks');
    expect(body).toContain("auth.role(), '') <> 'service_role' AND NOT public.can_manage_ical(conn.hotel_id)");
    expect(body).toContain('FOR UPDATE');
    expect(body).toContain("existing.status IN ('checked_in', 'checked_out')");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.sync_ota_ical_blocks(uuid, jsonb) FROM anon;');
  });

  it('exports a room type as closed only on days when every room is occupied, without guest data', () => {
    const body = functionBody('get_ota_ical_export');
    expect(body).toContain('HAVING count(DISTINCT b.room_id) >= (SELECT count(*) FROM type_rooms)');
    expect(body).toContain("export_token !~ '^[0-9a-f]{64}$'");
    expect(body).toContain('b.ota_connection_id IS DISTINCT FROM conn.id');
    expect(body).not.toContain('guest_name');
    expect(body).not.toContain('price');
  });

  it('ships a verify script for the new constraint, trigger and RPCs', () => {
    expect(verify).toContain('ota_connections_single_target');
    expect(verify).toContain('sync_ota_ical_blocks(uuid,jsonb)');
    expect(verify).toContain('get_ota_ical_export(text)');
  });
});

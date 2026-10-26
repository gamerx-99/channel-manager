import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), '20261026_ota_ical_room_sync.sql'), 'utf8');
const verify = readFileSync(resolve(process.cwd(), 'verify_20261026_ota_ical_room_sync.sql'), 'utf8');
const cron = readFileSync(resolve(process.cwd(), 'ota_ical_sync_cron_setup.sql'), 'utf8');

function functionBody(name: string) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = migration.indexOf('$$;', start);
  return migration.slice(start, end);
}

describe('20261026_ota_ical_room_sync migration contract', () => {
  it('is additive: no DROP TABLE, no DELETE, no TRUNCATE', () => {
    expect(migration).not.toMatch(/DROP\s+TABLE/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('stores OTA blocks as bookings protected by the existing double-booking constraint', () => {
    expect(migration).toContain("CHECK (source IN ('manual', 'walk-in', 'phone', 'ota_ical'))");
    expect(migration).toContain('ON public.bookings (ota_connection_id, external_uid)');
    expect(functionBody('sync_ota_ical_blocks')).toContain("'ota_ical', 'confirmed'");
    expect(functionBody('sync_ota_ical_blocks')).toContain('EXCEPTION WHEN exclusion_violation');
  });

  it('authorizes sync for hotel owners or the scheduler only, and hides it from anon', () => {
    const body = functionBody('sync_ota_ical_blocks');
    expect(body).toContain('SECURITY DEFINER');
    expect(body).toContain("auth.role(), '') <> 'service_role' AND NOT public.can_manage_ical(conn.hotel_id)");
    expect(body).toContain('FOR UPDATE');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.sync_ota_ical_blocks(uuid, jsonb) FROM anon;');
  });

  it('never rewrites a stay the front desk already checked in or out', () => {
    expect(functionBody('sync_ota_ical_blocks')).toContain("existing.status IN ('checked_in', 'checked_out')");
  });

  it('exports token-gated date ranges without guest data or echoing the OTA\'s own blocks', () => {
    const body = functionBody('get_ota_ical_export');
    expect(body).toContain("export_token !~ '^[0-9a-f]{64}$'");
    expect(body).toContain('b.ota_connection_id IS DISTINCT FROM conn.id');
    expect(body).not.toContain('guest_name');
    expect(body).not.toContain('price');
  });

  it('ships a verify script covering the new constraints, RPCs and grants', () => {
    expect(verify).toContain('sync_ota_ical_blocks(uuid,jsonb)');
    expect(verify).toContain('get_ota_ical_export(text)');
    expect(verify).toContain('prevent_double_booking');
    expect(verify).toContain("NOT has_function_privilege('anon'");
  });

  it('keeps the cron secret out of the repository', () => {
    expect(cron).toContain("vault.decrypted_secrets WHERE name = 'ota_ical_cron_secret'");
    expect(cron).toContain('/api/cron/ota-ical-sync');
    expect(cron).not.toMatch(/Bearer [A-Za-z0-9]{16,}/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  assertNoOverlappingOverride,
  findOverlappingOverrides,
  hasOverlappingOverride,
  resolveEffectiveRate,
  type RateOverride,
} from './pricing';

const roomType = { id: 'rt-1', base_price: 100 };
const otherRoomType = { id: 'rt-2', base_price: 200 };

function override(partial: Partial<RateOverride> & Pick<RateOverride, 'start_date' | 'end_date' | 'override_price'>): RateOverride {
  return {
    id: `ov-${Math.random().toString(36).slice(2, 6)}`,
    room_type_id: roomType.id,
    created_at: '2026-08-10T00:00:00.000Z',
    ...partial,
  } as RateOverride;
}

describe('resolveEffectiveRate', () => {
  it('falls back to base_price when no overrides exist', () => {
    expect(resolveEffectiveRate(roomType, '2026-08-15', [])).toBe(100);
  });

  it('falls back to base_price when overrides are for a different room type', () => {
    const ov: RateOverride = {
      id: 'ov-1',
      room_type_id: otherRoomType.id,
      start_date: '2026-08-10',
      end_date: '2026-08-20',
      override_price: 300,
      created_at: '2026-08-10T00:00:00.000Z',
    };
    expect(resolveEffectiveRate(roomType, '2026-08-15', [ov])).toBe(100);
  });

  it('handles base_price as string', () => {
    expect(resolveEffectiveRate({ id: 'rt-1', base_price: '150' }, '2026-08-15', [])).toBe(150);
  });

  it('returns matching override price when date is inside range (inclusive start)', () => {
    const ov = override({ id: 'ov-1', start_date: '2026-08-10', end_date: '2026-08-20', override_price: 180, created_at: '2026-08-01T00:00:00.000Z' });
    expect(resolveEffectiveRate(roomType, '2026-08-10', [ov])).toBe(180);
  });

  it('returns matching override price when date is inside range (inclusive end)', () => {
    const ov = override({ id: 'ov-1', start_date: '2026-08-10', end_date: '2026-08-20', override_price: 180, created_at: '2026-08-01T00:00:00.000Z' });
    expect(resolveEffectiveRate(roomType, '2026-08-20', [ov])).toBe(180);
  });

  it('returns base_price when date is outside any override range', () => {
    const ov = override({ id: 'ov-1', start_date: '2026-08-10', end_date: '2026-08-20', override_price: 180, created_at: '2026-08-01T00:00:00.000Z' });
    expect(resolveEffectiveRate(roomType, '2026-08-09', [ov])).toBe(100);
    expect(resolveEffectiveRate(roomType, '2026-08-21', [ov])).toBe(100);
  });

  it('returns override with middle date', () => {
    const ov = override({ id: 'ov-1', start_date: '2026-08-10', end_date: '2026-08-20', override_price: 250, created_at: '2026-08-01T00:00:00.000Z' });
    expect(resolveEffectiveRate(roomType, '2026-08-15', [ov])).toBe(250);
  });

  it('prefers most specific (narrowest) override when multiple match', () => {
    const broad = override({ id: 'ov-broad', start_date: '2026-08-01', end_date: '2026-08-31', override_price: 180, created_at: '2026-08-01T00:00:00.000Z' });
    const narrow = override({ id: 'ov-narrow', start_date: '2026-08-14', end_date: '2026-08-16', override_price: 300, created_at: '2026-08-02T00:00:00.000Z' });
    // both match 2026-08-15, narrow (3 days) should win over broad (31 days)
    expect(resolveEffectiveRate(roomType, '2026-08-15', [broad, narrow])).toBe(300);
    expect(resolveEffectiveRate(roomType, '2026-08-15', [narrow, broad])).toBe(300);
  });

  it('falls back to last-created when spans are equal', () => {
    const first = override({ id: 'ov-1', start_date: '2026-08-10', end_date: '2026-08-15', override_price: 180, created_at: '2026-08-01T00:00:00.000Z' });
    const second = override({ id: 'ov-2', start_date: '2026-08-12', end_date: '2026-08-17', override_price: 250, created_at: '2026-08-05T00:00:00.000Z' });
    // Both spans = 6 days, both include 2026-08-13, last-created (ov-2) wins
    expect(resolveEffectiveRate(roomType, '2026-08-13', [first, second])).toBe(250);
    expect(resolveEffectiveRate(roomType, '2026-08-13', [second, first])).toBe(250);
  });

  it('handles override_price as string', () => {
    const ov = override({ id: 'ov-1', start_date: '2026-08-10', end_date: '2026-08-20', override_price: '199', created_at: '2026-08-01T00:00:00.000Z' });
    expect(resolveEffectiveRate(roomType, '2026-08-15', [ov])).toBe(199);
  });
});

describe('hasOverlappingOverride / assertNoOverlappingOverride', () => {
  const existing: RateOverride[] = [
    { id: 'ov-1', room_type_id: 'rt-1', start_date: '2026-08-10', end_date: '2026-08-15', override_price: 180, created_at: '2026-08-01T00:00:00.000Z' },
    { id: 'ov-2', room_type_id: 'rt-1', start_date: '2026-08-20', end_date: '2026-08-25', override_price: 200, created_at: '2026-08-01T00:00:00.000Z' },
  ];

  it('detects overlapping range (partial overlap)', () => {
    expect(hasOverlappingOverride(existing, { room_type_id: 'rt-1', start_date: '2026-08-12', end_date: '2026-08-18' })).toBe(true);
  });

  it('detects overlapping at exact boundary (inclusive)', () => {
    // candidate starts on existing end date -> overlapping because inclusive
    expect(hasOverlappingOverride(existing, { room_type_id: 'rt-1', start_date: '2026-08-15', end_date: '2026-08-18' })).toBe(true);
    expect(hasOverlappingOverride(existing, { room_type_id: 'rt-1', start_date: '2026-08-08', end_date: '2026-08-10' })).toBe(true);
  });

  it('does not flag adjacent non-overlapping ranges', () => {
    expect(hasOverlappingOverride(existing, { room_type_id: 'rt-1', start_date: '2026-08-16', end_date: '2026-08-19' })).toBe(false);
  });

  it('does not flag when room_type_id differs', () => {
    expect(hasOverlappingOverride(existing, { room_type_id: 'rt-2', start_date: '2026-08-12', end_date: '2026-08-18' })).toBe(false);
  });

  it('detects candidate fully containing existing', () => {
    expect(hasOverlappingOverride(existing, { room_type_id: 'rt-1', start_date: '2026-08-09', end_date: '2026-08-26' })).toBe(true);
  });

  it('detects existing fully containing candidate', () => {
    expect(hasOverlappingOverride(existing, { room_type_id: 'rt-1', start_date: '2026-08-11', end_date: '2026-08-12' })).toBe(true);
  });

  it('ignores self when candidate has same id (update scenario)', () => {
    expect(hasOverlappingOverride(existing, { id: 'ov-1', room_type_id: 'rt-1', start_date: '2026-08-10', end_date: '2026-08-15' })).toBe(false);
  });

  it('assertNoOverlappingOverride throws with CONFLICT prefix when overlapping', () => {
    expect(() =>
      assertNoOverlappingOverride(existing, { room_type_id: 'rt-1', start_date: '2026-08-12', end_date: '2026-08-18' }),
    ).toThrow(/CONFLICT/);
  });

  it('assertNoOverlappingOverride does not throw when not overlapping', () => {
    expect(() =>
      assertNoOverlappingOverride(existing, { room_type_id: 'rt-1', start_date: '2026-08-16', end_date: '2026-08-19' }),
    ).not.toThrow();
  });

  it('findOverlappingOverrides returns matching records', () => {
    const overlaps = findOverlappingOverrides(existing, { room_type_id: 'rt-1', start_date: '2026-08-12', end_date: '2026-08-22' });
    expect(overlaps).toHaveLength(2);
  });

  it('returns false when no existing overrides', () => {
    expect(hasOverlappingOverride([], { room_type_id: 'rt-1', start_date: '2026-08-10', end_date: '2026-08-15' })).toBe(false);
  });
});

/**
 * Pure pricing helpers — no I/O, no Supabase.
 * Follows the same shape as server/financials.ts: take plain data in, return plain data out.
 */

export type RateOverrideInput = {
  id: string;
  room_type_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD (inclusive)
  override_price: number | string;
  min_stay_nights: number | null;
  created_at?: string;
};

export type RateOverride = RateOverrideInput;

export type RoomTypeInput = {
  id: string;
  base_price: number | string;
};

function toNumber(value: number | string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function dateRangeDays(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00.000Z`);
  const b = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000) + 1; // inclusive
}

/**
 * Precedence rule (documented): narrowest (fewest days inclusive) matching range wins.
 * If two ranges have equal narrowness, the later created_at wins; if created_at is
 * missing/equal, later lexical id wins — deterministic.
 */
export function resolveEffectiveRate(
  roomType: RoomTypeInput,
  dateIso: string,
  overrides: RateOverrideInput[],
): number {
  const base = toNumber(roomType.base_price);
  const matching = overrides.filter(
    o => o.room_type_id === roomType.id && dateIso >= o.start_date && dateIso <= o.end_date,
  );
  if (matching.length === 0) return base;

  let winner = matching[0];
  let winnerWidth = dateRangeDays(winner.start_date, winner.end_date);
  for (let i = 1; i < matching.length; i += 1) {
    const candidate = matching[i];
    const w = dateRangeDays(candidate.start_date, candidate.end_date);
    if (w < winnerWidth) {
      winner = candidate;
      winnerWidth = w;
      continue;
    }
    if (w === winnerWidth) {
      const aTime = winner.created_at ? Date.parse(winner.created_at) : 0;
      const bTime = candidate.created_at ? Date.parse(candidate.created_at) : 0;
      if (bTime > aTime || (bTime === aTime && candidate.id > winner.id)) {
        winner = candidate;
        winnerWidth = w;
      }
    }
  }
  return toNumber(winner.override_price);
}

export function calcNights(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00.000Z`);
  const b = Date.parse(`${checkOut}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Returns the maximum min_stay_nights among overrides that overlap the booking stay
 * [checkIn, checkOut). If no overlapping override has a min_stay set, returns null.
 * ASSUMPTION: overlapping is defined as override.start_date < checkOut && override.end_date >= checkIn
 * (inclusive start/end per spec). Most restrictive (max) wins.
 */
export function getRequiredMinStayNights(
  checkIn: string,
  checkOut: string,
  overrides: RateOverrideInput[],
): number | null {
  let max: number | null = null;
  const nights = calcNights(checkIn, checkOut);
  for (const o of overrides) {
    if (o.min_stay_nights == null) continue;
    // overlap if override touches any night of stay
    let overlapsStay: boolean;
    if (nights === 0) {
      // zero-night stay (checkIn === checkOut) — booking validation will reject separately,
      // but for pure-helper tests we treat it as occupying checkIn so min_stay is exercised.
      overlapsStay = o.start_date <= checkIn && o.end_date >= checkIn;
    } else {
      overlapsStay = o.start_date < checkOut && o.end_date >= checkIn;
    }
    if (overlapsStay) {
      if (max == null || o.min_stay_nights > max) max = o.min_stay_nights;
    }
  }
  return max;
}

export function assertMinStayOrThrow(
  checkIn: string,
  checkOut: string,
  overrides: RateOverrideInput[],
): void {
  const required = getRequiredMinStayNights(checkIn, checkOut, overrides);
  if (required == null) return;
  const nights = calcNights(checkIn, checkOut);
  if (nights < required) {
    throw new Error(
      `Booking must be at least ${required} night${required === 1 ? '' : 's'} (minimum stay for selected dates is ${required} night${required === 1 ? '' : 's'}).`,
    );
  }
}

export type OverlapCandidate = {
  id?: string;
  room_type_id: string;
  start_date: string;
  end_date: string;
};

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function findOverlappingOverrides(
  existing: RateOverrideInput[],
  candidate: OverlapCandidate,
): RateOverrideInput[] {
  return existing.filter(
    (o) =>
      o.room_type_id === candidate.room_type_id &&
      (candidate.id == null || o.id !== candidate.id) &&
      rangesOverlap(o.start_date, o.end_date, candidate.start_date, candidate.end_date),
  );
}

export function hasOverlappingOverride(
  existing: RateOverrideInput[],
  candidate: OverlapCandidate,
): boolean {
  return findOverlappingOverrides(existing, candidate).length > 0;
}

export function assertNoOverlappingOverride(
  existing: RateOverrideInput[],
  candidate: OverlapCandidate,
): void {
  if (hasOverlappingOverride(existing, candidate)) {
    throw new Error(
      `CONFLICT: An overlapping rate override already exists for room type ${candidate.room_type_id} in range ${candidate.start_date} → ${candidate.end_date}.`,
    );
  }
}

// Back-compat alias — some older tests import assertNoOverlap
export const assertNoOverlap = assertNoOverlappingOverride;

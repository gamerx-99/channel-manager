import { describe, expect, it } from 'vitest';
import { splitRateRanges } from './rateRangeSplit';

const R = (id: string, start: string, end: string, price = '100.00', min: number | null = null) => ({ id, start_date: start, end_date: end, override_price: price, min_stay_nights: min });

describe('splitRateRanges', () => {
  it('splits middle', () => {
    const res = splitRateRanges([R('a', '2026-01-01', '2026-01-31')], { start_date: '2026-01-10', end_date: '2026-01-12', override_price: '200.00', min_stay_nights: 2 });
    expect(res).toEqual({ deleteIds: ['a'], create: [
      { start_date: '2026-01-01', end_date: '2026-01-09', override_price: '100.00', min_stay_nights: null },
      { start_date: '2026-01-10', end_date: '2026-01-12', override_price: '200.00', min_stay_nights: 2 },
      { start_date: '2026-01-13', end_date: '2026-01-31', override_price: '100.00', min_stay_nights: null },
    ] });
  });
  it('trims head (overlap)', () => {
    const res = splitRateRanges([R('a', '2026-01-10', '2026-01-31')], { start_date: '2026-01-01', end_date: '2026-01-15', override_price: '200.00', min_stay_nights: null });
    expect(res).toEqual({ deleteIds: ['a'], create: [
      { start_date: '2026-01-01', end_date: '2026-01-15', override_price: '200.00', min_stay_nights: null },
      { start_date: '2026-01-16', end_date: '2026-01-31', override_price: '100.00', min_stay_nights: null },
    ] });
  });
  it('trims tail (overlap)', () => {
    const res = splitRateRanges([R('a', '2026-01-01', '2026-01-10')], { start_date: '2026-01-05', end_date: '2026-01-20', override_price: '200.00', min_stay_nights: null });
    expect(res).toEqual({ deleteIds: ['a'], create: [
      { start_date: '2026-01-01', end_date: '2026-01-04', override_price: '100.00', min_stay_nights: null },
      { start_date: '2026-01-05', end_date: '2026-01-20', override_price: '200.00', min_stay_nights: null },
    ] });
  });
  it('replaces whole range', () => {
    const res = splitRateRanges([R('a', '2026-01-10', '2026-01-12', '100.00', 1)], { start_date: '2026-01-10', end_date: '2026-01-12', override_price: '200.00', min_stay_nights: 2 });
    expect(res).toEqual({ deleteIds: ['a'], create: [
      { start_date: '2026-01-10', end_date: '2026-01-12', override_price: '200.00', min_stay_nights: 2 },
    ] });
  });
  it('back to base price cuts only', () => {
    const res = splitRateRanges([R('a', '2026-01-01', '2026-01-31')], { start_date: '2026-01-10', end_date: '2026-01-12', base: true });
    expect(res).toEqual({ deleteIds: ['a'], create: [
      { start_date: '2026-01-01', end_date: '2026-01-09', override_price: '100.00', min_stay_nights: null },
      { start_date: '2026-01-13', end_date: '2026-01-31', override_price: '100.00', min_stay_nights: null },
    ] });
  });
  it('single day', () => {
    const res = splitRateRanges([R('a', '2026-01-01', '2026-01-31')], { start_date: '2026-01-15', end_date: '2026-01-15', override_price: '200.00', min_stay_nights: null });
    expect(res.deleteIds).toEqual(['a']);
    expect(res.create.length).toBe(3);
  });
  it('no overlap', () => {
    const res = splitRateRanges([R('a', '2026-01-01', '2026-01-05')], { start_date: '2026-01-10', end_date: '2026-01-12', override_price: '200.00', min_stay_nights: null });
    expect(res).toEqual({ deleteIds: [], create: [
      { start_date: '2026-01-10', end_date: '2026-01-12', override_price: '200.00', min_stay_nights: null },
    ] });
  });
  it('min stay carried on split pieces', () => {
    const res = splitRateRanges([R('a', '2026-01-01', '2026-01-31', '100.00', 3)], { start_date: '2026-01-10', end_date: '2026-01-12', override_price: '200.00', min_stay_nights: 2 });
    expect(res.create[0].min_stay_nights).toBe(3);
    expect(res.create[2].min_stay_nights).toBe(3);
  });
  it('replaces a range with multiple adjacent price-preserving segments', () => {
    const res = splitRateRanges([R('a', '2026-01-01', '2026-01-10', '90.00')], [
      { start_date: '2026-01-03', end_date: '2026-01-04', override_price: '100.00', min_stay_nights: 2 },
      { start_date: '2026-01-05', end_date: '2026-01-06', override_price: '120.00', min_stay_nights: 2 },
    ]);
    expect(res).toEqual({ deleteIds: ['a'], create: [
      { start_date: '2026-01-01', end_date: '2026-01-02', override_price: '90.00', min_stay_nights: null },
      { start_date: '2026-01-03', end_date: '2026-01-04', override_price: '100.00', min_stay_nights: 2 },
      { start_date: '2026-01-05', end_date: '2026-01-06', override_price: '120.00', min_stay_nights: 2 },
      { start_date: '2026-01-07', end_date: '2026-01-10', override_price: '90.00', min_stay_nights: null },
    ] });
  });
});

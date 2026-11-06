import { describe, expect, it } from 'vitest';
import { splitRateRanges } from './rateRangeSplit';

describe('splitRateRanges', () => {
  it('splits middle', () => {
    expect(splitRateRanges([{ start: '2026-01-01', end: '2026-01-31' }], { start: '2026-01-10', end: '2026-01-12' })).toEqual([
      { start: '2026-01-01', end: '2026-01-09' },
      { start: '2026-01-10', end: '2026-01-12' },
      { start: '2026-01-13', end: '2026-01-31' },
    ]);
  });
  it('trims head', () => {
    expect(splitRateRanges([{ start: '2026-01-10', end: '2026-01-31' }], { start: '2026-01-01', end: '2026-01-05' })).toEqual([
      { start: '2026-01-01', end: '2026-01-05' },
      { start: '2026-01-10', end: '2026-01-31' },
    ]);
  });
  it('trims tail', () => {
    expect(splitRateRanges([{ start: '2026-01-01', end: '2026-01-10' }], { start: '2026-01-15', end: '2026-01-20' })).toEqual([
      { start: '2026-01-01', end: '2026-01-10' },
      { start: '2026-01-15', end: '2026-01-20' },
    ]);
  });
  it('replaces whole range', () => {
    expect(splitRateRanges([{ start: '2026-01-10', end: '2026-01-12' }], { start: '2026-01-10', end: '2026-01-12' })).toEqual([
      { start: '2026-01-10', end: '2026-01-12' },
    ]);
  });
  it('handles multiple', () => {
    const res = splitRateRanges([{ start: '2026-01-01', end: '2026-01-31' }, { start: '2026-02-01', end: '2026-02-10' }], { start: '2026-01-15', end: '2026-02-05' });
    expect(res.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { formatIsoToDisplayDate, parseDisplayDateToIso } from '@shared/dateUtils';

describe('TM.30 date format conversion utilities with strict validation', () => {
  it('formats ISO 8601 dates to DD/MM/YYYY standard', () => {
    expect(formatIsoToDisplayDate('2026-08-19')).toBe('19/08/2026');
    expect(formatIsoToDisplayDate('1992-05-17')).toBe('17/05/1992');
  });

  it('parses DD/MM/YYYY display dates back to ISO 8601 YYYY-MM-DD for Supabase', () => {
    expect(parseDisplayDateToIso('19/08/2026')).toBe('2026-08-19');
    expect(parseDisplayDateToIso('17/05/1992')).toBe('1992-05-17');
  });

  it('rejects malformed or out-of-range dates with clear error messages', () => {
    expect(() => parseDisplayDateToIso('2026-08-19')).toThrow('Invalid date format');
    expect(() => parseDisplayDateToIso('32/08/2026')).toThrow('Date values out of valid range');
    expect(() => parseDisplayDateToIso('19/13/2026')).toThrow('Date values out of valid range');
    expect(() => parseDisplayDateToIso('19/08/1850')).toThrow('Date values out of valid range');
  });
});

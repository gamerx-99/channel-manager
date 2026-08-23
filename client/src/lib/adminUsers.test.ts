import { describe, expect, it } from 'vitest';
import { canLoadAdminHotels, formatAdminDate } from './adminUsers';

describe('Admin Users helpers', () => {
  it('renders empty or malformed auth dates safely', () => {
    expect(formatAdminDate(null)).toBe('—');
    expect(formatAdminDate(undefined)).toBe('—');
    expect(formatAdminDate('not-a-date')).toBe('—');
  });

  it('formats valid auth dates without throwing', () => {
    expect(formatAdminDate('2026-08-18T00:00:00.000Z')).toMatch(/2026/);
  });

  it('only enables the hotel options query after admin access succeeds', () => {
    expect(canLoadAdminHotels(false, null)).toBe(false);
    expect(canLoadAdminHotels(true, new Error('FORBIDDEN'))).toBe(false);
    expect(canLoadAdminHotels(true, null)).toBe(true);
  });
});

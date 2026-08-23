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

  it('stays on the Gregorian calendar instead of the Buddhist Era a th-TH host would otherwise render', () => {
    // Demonstrates the failure mode the fix avoids: Intl.DateTimeFormat(undefined, ...)
    // on a th-TH host renders the Buddhist-era year (พ.ศ.), e.g. "2569" instead of "2026".
    const buddhistEraOutput = new Intl.DateTimeFormat('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date('2026-08-18T00:00:00.000Z'));
    expect(buddhistEraOutput).toMatch(/2569/);

    // formatAdminDate must not reproduce that behavior — it pins a Gregorian
    // locale to match the DD/MM/YYYY (A.D.) convention used across TM.30.
    expect(formatAdminDate('2026-08-18T00:00:00.000Z')).toMatch(/2026/);
    expect(formatAdminDate('2026-08-18T00:00:00.000Z')).not.toMatch(/2569/);
  });

  it('only enables the hotel options query after admin access succeeds', () => {
    expect(canLoadAdminHotels(false, null)).toBe(false);
    expect(canLoadAdminHotels(true, new Error('FORBIDDEN'))).toBe(false);
    expect(canLoadAdminHotels(true, null)).toBe(true);
  });
});

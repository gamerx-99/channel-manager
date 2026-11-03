import { describe, expect, it } from 'vitest';
import { canAccessPlatformSummary, canLoadAdminHotels, formatAdminDate, shouldShowPlatformHotelEmptyState } from './adminUsers';

describe('Admin Users helpers', () => {
  it('renders empty or malformed auth dates safely', () => {
    expect(formatAdminDate(null)).toBe('—');
    expect(formatAdminDate(undefined)).toBe('—');
    expect(formatAdminDate('not-a-date')).toBe('—');
  });

  it('formats valid auth dates without throwing', () => {
    expect(formatAdminDate('2026-08-18T00:00:00.000Z')).toMatch(/2026/);
  });

  it('uses the Buddhist year in Thai and Gregorian dates in English', () => {
    const createdAt = '2026-08-18T00:00:00.000Z';
    expect(formatAdminDate(createdAt, 'en')).toMatch(/2026/);
    expect(formatAdminDate(createdAt, 'th')).toMatch(/2569/);
  });

  it('only enables the hotel options query after admin access succeeds', () => {
    expect(canLoadAdminHotels(false, null)).toBe(false);
    expect(canLoadAdminHotels(true, new Error('FORBIDDEN'))).toBe(false);
    expect(canLoadAdminHotels(true, null)).toBe(true);
  });

  it('shows the hotel-access empty state for platform roles without hotel memberships', () => {
    const base = { memberships: [], hotelCount: 0, isLoading: false, hasError: false };
    expect(shouldShowPlatformHotelEmptyState({ ...base, roles: ['super_admin'] })).toBe(true);
    expect(shouldShowPlatformHotelEmptyState({ ...base, roles: ['admin'] })).toBe(true);
    expect(shouldShowPlatformHotelEmptyState({ ...base, roles: ['hotel_owner'] })).toBe(false);
    expect(shouldShowPlatformHotelEmptyState({ ...base, roles: ['admin'], memberships: [{ role: 'hotel_owner' }] })).toBe(false);
    expect(shouldShowPlatformHotelEmptyState({ ...base, roles: ['admin'], isLoading: true })).toBe(false);
  });

  it('links to the platform summary only for accounts with its permission', () => {
    expect(canAccessPlatformSummary(['super_admin'])).toBe(true);
    expect(canAccessPlatformSummary(['admin'])).toBe(false);
    expect(canAccessPlatformSummary(['support'])).toBe(false);
  });
});

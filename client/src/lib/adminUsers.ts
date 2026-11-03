import { hasAnyPermission, isPlatformRole, type AppRole } from '@shared/authorization';
import type { Language } from '@/contexts/LanguageContext';

export function formatAdminDate(value: string | Date | null | undefined, language: Language = 'en') {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(language === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function canLoadAdminHotels(adminUsersReady: boolean, adminUsersError: unknown) {
  return adminUsersReady && !adminUsersError;
}

export function shouldShowPlatformHotelEmptyState(input: {
  roles: readonly AppRole[];
  memberships: readonly { role: string }[];
  hotelCount: number;
  isLoading: boolean;
  hasError: boolean;
}) {
  return hasAnyPermission(input.roles, 'platform.view_all_hotels')
    && !input.memberships.some(membership => !isPlatformRole(membership.role))
    && input.hotelCount === 0
    && !input.isLoading
    && !input.hasError;
}

export function canAccessPlatformSummary(roles: readonly AppRole[]) {
  return hasAnyPermission(roles, 'platform.view_system_logs');
}

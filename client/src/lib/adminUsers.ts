export function formatAdminDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function canLoadAdminHotels(adminUsersReady: boolean, adminUsersError: unknown) {
  return adminUsersReady && !adminUsersError;
}

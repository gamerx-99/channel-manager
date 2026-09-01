export function throwOnError(error: { message: string; code?: string } | null) {
  if (error) throw new Error(error.code ? `${error.code}: ${error.message}` : error.message);
}

export function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isMissingTableError(tablePattern: string | RegExp, error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code === '42P01') return true;
  const message = (error as { message?: string }).message ?? '';
  const re = typeof tablePattern === 'string'
    ? new RegExp(`${escapeRegExp(tablePattern)}.*does not exist`, 'i')
    : tablePattern;
  return re.test(message);
}

export function isCommunicationsEnabled(value: string | undefined): boolean {
  return value === 'true';
}

export const communicationsEnabled = isCommunicationsEnabled(
  import.meta.env.VITE_FEATURE_COMMUNICATIONS,
);

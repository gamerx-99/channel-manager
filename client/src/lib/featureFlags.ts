export function isCommunicationsEnabled(value: string | undefined): boolean {
  return value === 'true';
}

export const communicationsEnabled = isCommunicationsEnabled(
  import.meta.env.VITE_FEATURE_COMMUNICATIONS,
);

export function isOtaSyncEnabled(value: string | undefined) {
  return value === 'true';
}

export const otaSyncEnabled = isOtaSyncEnabled(import.meta.env.VITE_FEATURE_OTA_SYNC);

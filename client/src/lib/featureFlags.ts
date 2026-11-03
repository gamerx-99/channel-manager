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

// 2FA setup is paused until it is reworked (owner decision 2026-11-03). Off unless VITE_FEATURE_MFA is "true".
// Read on each call so tests can switch it with vi.stubEnv.
export function isMfaEnabled(value: string | undefined = import.meta.env.VITE_FEATURE_MFA) {
  return value === 'true';
}

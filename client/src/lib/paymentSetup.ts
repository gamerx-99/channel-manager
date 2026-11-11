export type PaymentSetupStatus = { promptpay_configured: boolean; slipok_configured: boolean };
export type MissingPaymentSetup = "promptpay" | "slipok";

/** The SlipOK sign-up guide the owner is writing; the reminder shows its link only once this is set. */
export const SLIPOK_GUIDE_URL: string | null = null;

export function financeSettingsPath(hotelId: string) {
  return `/hotels/${hotelId}/settings/finance`;
}

/** What the hotel still has to save. An unknown status (loading, error) lists nothing, so a hiccup never nags. */
export function missingPaymentSetup(status: PaymentSetupStatus | null | undefined): MissingPaymentSetup[] {
  if (!status) return [];
  return [
    ...(status.promptpay_configured ? [] : (["promptpay"] as const)),
    ...(status.slipok_configured ? [] : (["slipok"] as const)),
  ];
}

/**
 * The reminder pops up on every page change (owner decision, 2026-11-11): closing it only hides it on the page
 * where it was closed. It stays away from the finance settings page, where the fix is, and while it is switched off.
 */
export function shouldShowPaymentReminder(input: {
  enabled: boolean;
  hotelId: string | null;
  missing: readonly MissingPaymentSetup[];
  location: string;
  dismissedAt: string | null;
}): boolean {
  if (!input.enabled || !input.hotelId || input.missing.length === 0) return false;
  if (input.location === financeSettingsPath(input.hotelId)) return false;
  return input.dismissedAt !== input.location;
}

export type SlipOkProblem = "package_expired" | "quota_exceeded" | "credentials_rejected";
export type PaymentSetupStatus = { promptpay_configured: boolean; slipok_configured: boolean; slipok_problem?: SlipOkProblem | null };
export type MissingPaymentSetup = "promptpay" | "slipok";

/** The owner's SlipOK sign-up guide (an image in client/public/guides); set to null to hide every link to it. */
export const SLIPOK_GUIDE_URL: string | null = "/guides/slipok-guide.jpg";

/** SlipOK's own user manual (a document and a video) in a shared Google Drive folder, given by the owner on 2026-11-12. */
export const SLIPOK_MANUAL_URL = "https://drive.google.com/drive/folders/1Ui4lT4H8Nlj2KqGPHLabN3MiIoSAQiTM";

/** SlipOK's management page. Hotels usually open it from LINE; it lands on their own brand after sign-in. */
export const SLIPOK_APP_URL = "https://app.slipok.com";

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
 * A SlipOK account problem (expired package, used-up quota, rejected key) shows it too, because slips stop being
 * checked automatically until the hotel fixes it in SlipOK.
 */
export function shouldShowPaymentReminder(input: {
  enabled: boolean;
  hotelId: string | null;
  missing: readonly MissingPaymentSetup[];
  problem?: SlipOkProblem | null;
  location: string;
  dismissedAt: string | null;
}): boolean {
  if (!input.enabled || !input.hotelId || (input.missing.length === 0 && !input.problem)) return false;
  if (input.location === financeSettingsPath(input.hotelId)) return false;
  return input.dismissedAt !== input.location;
}

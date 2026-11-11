/** Whether this browser can create or use a passkey at all. */
export function passkeySupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

/** Whether the browser can offer saved passkeys in the email field's autofill list. */
export async function passkeyAutofillSupported(): Promise<boolean> {
  if (!passkeySupported()) return false;
  const credential = window.PublicKeyCredential as unknown as { isConditionalMediationAvailable?: () => Promise<boolean> };
  try {
    return (await credential.isConditionalMediationAvailable?.()) === true;
  } catch {
    return false;
  }
}

export type PasskeyFailure = "cancelled" | "alreadyAdded" | "failed";

/** Closing the system prompt is a choice, not an error, so it must not show a red message. */
export function classifyPasskeyError(error: { code?: string; message?: string } | null | undefined): PasskeyFailure {
  const code = error?.code ?? "";
  if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return "alreadyAdded";
  if (
    code === "AUTH_CANCELLED" ||
    code === "ERROR_CEREMONY_ABORTED" ||
    code === "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY" ||
    /NotAllowedError|AbortError/i.test(error?.message ?? "")
  ) return "cancelled";
  return "failed";
}

/** A short device label so the list tells passkeys apart without the owner typing a name. */
export function defaultPasskeyName(userAgent: string): string {
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "Mac";
  if (/CrOS/i.test(userAgent)) return "Chromebook";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Passkey";
}

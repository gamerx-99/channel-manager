import type { TranslationKey } from "@/lib/i18n";

/** Sign-in provider ids the server may return, and how each is shown. Better Auth stores email + password as "credential". */
const KNOWN_PROVIDERS: Record<string, { label: string } | { key: TranslationKey }> = {
  credential: { key: "account.methodPassword" },
  google: { label: "Google" },
  facebook: { label: "Facebook" },
  line: { label: "LINE" },
};

export function signInMethod(providerId: string): { label: string } | { key: TranslationKey } {
  return KNOWN_PROVIDERS[providerId] ?? { label: providerId };
}

/** Text for a value the account may not have filled in. */
export function valueOrEmpty(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

export type PlanName = "trial" | "pro" | "free";

/** Translation key of a hotel's plan name, reusing the subscription page wording. */
export function planNameKey(plan: PlanName): TranslationKey {
  return `subscription.${plan}` as TranslationKey;
}

/** Only a plan that runs out has a days-left and an end date to show; Free does not. */
export function planHasEnd(plan: PlanName, endsAt: Date | string | null | undefined): boolean {
  return plan !== "free" && Boolean(endsAt);
}

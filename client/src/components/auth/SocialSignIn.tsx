import React, { useState } from "react";
import type { SocialProviderId } from "@shared/socialAuth";
import { authClient } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

export const PROVIDER_LABELS: Record<SocialProviderId, string> = { google: "Google", facebook: "Facebook", line: "LINE" };

export const PROVIDER_ICONS: Record<SocialProviderId, React.ReactNode> = {
  google: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8.1z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.2a11 11 0 0 0 0 9.9l3.6-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#1877F2" d="M23 12a11 11 0 1 0-12.7 10.9v-7.7H7.5V12h2.8V9.6c0-2.8 1.6-4.3 4.2-4.3 1.2 0 2.5.2 2.5.2v2.7h-1.4c-1.4 0-1.8.9-1.8 1.7V12h3.1l-.5 3.2h-2.6v7.7A11 11 0 0 0 23 12z" />
    </svg>
  ),
  line: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#06C755" d="M12 2C6 2 1.2 5.9 1.2 10.8c0 4.4 3.8 8 9 8.7.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5s6-3.5 8.1-6c1.5-1.6 2.2-3.3 2.2-5.1C22.8 5.9 18 2 12 2z" />
    </svg>
  ),
};

/** Maps the `?error=` code Better Auth redirects back with to our own message. */
export function socialErrorKey(code: string | null) {
  if (!code) return null;
  if (code === "account_not_linked") return "socialAuth.accountExists";
  if (code === "access_denied") return "socialAuth.cancelled";
  if (code.toLowerCase() === "account_already_linked_to_different_user") return "socialAuth.alreadyLinked";
  return "socialAuth.failed";
}

export function readSocialError() {
  return socialErrorKey(new URLSearchParams(window.location.search).get("error"));
}

type SocialSignInProps = {
  /** Where the person lands after the provider sends them back. */
  callbackURL: string;
  /** Page to return to with `?error=` when the sign-in fails. */
  errorCallbackURL: string;
  mode: "login" | "signup";
};

export function SocialSignIn({ callbackURL, errorCallbackURL, mode }: SocialSignInProps) {
  const { t } = useTranslation();
  const providers = trpc.auth.socialProviders.useQuery(undefined, { retry: false });
  const [pending, setPending] = useState<SocialProviderId | null>(null);
  const [failed, setFailed] = useState(false);

  async function start(provider: SocialProviderId) {
    setPending(provider);
    setFailed(false);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL,
      newUserCallbackURL: callbackURL,
      errorCallbackURL,
    });
    if (error) {
      setPending(null);
      setFailed(true);
    }
  }

  if (!providers.data?.length) return null;

  return (
    <div className="social-sign-in" data-testid="social-sign-in">
      {providers.data.map(provider => (
        <button
          key={provider}
          type="button"
          className="social-button"
          data-provider={provider}
          disabled={pending !== null}
          onClick={() => void start(provider)}
        >
          {PROVIDER_ICONS[provider]}
          <span>{t(mode === "login" ? "socialAuth.signInWith" : "socialAuth.signUpWith", { provider: PROVIDER_LABELS[provider] })}</span>
        </button>
      ))}
      {failed ? <p className="form-error" role="alert">{t("socialAuth.failed")}</p> : null}
      <div className="social-divider"><span>{t(mode === "login" ? "socialAuth.orEmailSignIn" : "socialAuth.orEmailSignUp")}</span></div>
    </div>
  );
}

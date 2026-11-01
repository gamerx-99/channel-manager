import React, { useEffect, useState } from "react";
import type { SocialProviderId } from "@shared/socialAuth";
import { authClient } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { PROVIDER_ICONS, PROVIDER_LABELS, readSocialError } from "@/components/auth/SocialSignIn";

/** Joins a provider that cannot be matched by email: LINE and Facebook, or an unverified account. */
export default function LinkedAccountsSettings() {
  const { t } = useTranslation();
  const providers = trpc.auth.socialProviders.useQuery(undefined, { retry: false });
  const [linked, setLinked] = useState<string[]>([]);
  const [pending, setPending] = useState<SocialProviderId | null>(null);
  const [error, setError] = useState<string | null>(() => {
    const socialError = readSocialError();
    return socialError ? t(socialError) : null;
  });

  useEffect(() => {
    void authClient.listAccounts().then(({ data }) => setLinked((data ?? []).map(row => row.providerId)));
  }, []);

  async function connect(provider: SocialProviderId) {
    setPending(provider);
    setError(null);
    const path = window.location.pathname;
    const { error: linkError } = await authClient.linkSocial({ provider, callbackURL: path, errorCallbackURL: path });
    if (linkError) {
      setPending(null);
      setError(t("socialAuth.failed"));
    }
  }

  if (!providers.data?.length) return null;

  return (
    <section className="panel linked-accounts" aria-labelledby="linked-accounts-heading" data-testid="linked-accounts">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">{t("socialAuth.linkedEyebrow")}</div>
          <h2 id="linked-accounts-heading">{t("socialAuth.linkedTitle")}</h2>
          <p className="lede" style={{ marginTop: 8 }}>{t("socialAuth.linkedLede")}</p>
        </div>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <ul className="linked-accounts-list">
        {providers.data.map(provider => (
          <li key={provider}>
            <span className="linked-accounts-name">{PROVIDER_ICONS[provider]}{PROVIDER_LABELS[provider]}</span>
            {linked.includes(provider)
              ? <span className="status-pill live"><i />{t("socialAuth.linked")}</span>
              : (
                <button type="button" className="button button-quiet" disabled={pending !== null} onClick={() => void connect(provider)}>
                  {t("socialAuth.connect")}
                </button>
              )}
          </li>
        ))}
      </ul>
    </section>
  );
}

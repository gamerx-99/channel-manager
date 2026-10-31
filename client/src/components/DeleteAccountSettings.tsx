import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { Link } from "wouter";
import { signOutCurrentSession } from "@/_core/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

const SUPPORT_EMAIL = "support@hayhostth.com";
const errorCode = (error: unknown) => (error as { data?: { code?: string } | null })?.data?.code;

export default function DeleteAccountSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: authMe } = trpc.auth.me.useQuery();
  const status = trpc.auth.accountDeletionStatus.useQuery();
  const verifyMfa = trpc.auth.verifyMfaStepUp.useMutation();
  const deleteAccount = trpc.auth.deleteAccount.useMutation();

  const [confirming, setConfirming] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeAccepted, setCodeAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountEmail = authMe?.email ?? "";
  const needsCode = Boolean(authMe?.twoFactorEnabled) && !codeAccepted;
  const busy = verifyMfa.isPending || deleteAccount.isPending;
  const canSubmit = !busy && email.trim().toLowerCase() === accountEmail.toLowerCase() && password.length > 0 && (!needsCode || code.length === 6);

  function reset() {
    setConfirming(false);
    setEmail("");
    setPassword("");
    setCode("");
    setCodeAccepted(false);
    setError(null);
  }

  async function handleDelete() {
    setError(null);
    if (needsCode) {
      try {
        await verifyMfa.mutateAsync({ code });
        // A code works once, so a wrong password must not make the person enter another.
        setCodeAccepted(true);
      } catch (caught) {
        setError(t(errorCode(caught) === "TOO_MANY_REQUESTS" ? "accountDeletion.errorTooManyCodes" : "accountDeletion.errorCode"));
        return;
      }
    }

    try {
      await deleteAccount.mutateAsync({ password, confirmEmail: email });
    } catch (caught) {
      const reason = errorCode(caught);
      setPassword("");
      if (reason === "CONFLICT") {
        reset();
        await status.refetch();
      } else if (reason === "PRECONDITION_FAILED") {
        setCodeAccepted(false);
        setCode("");
        setError(t("accountDeletion.errorCodeExpired"));
      } else if (reason === "BAD_REQUEST") {
        setError(t("accountDeletion.errorPassword"));
      } else if (reason === "TOO_MANY_REQUESTS") {
        setError(t("accountDeletion.errorTooManyPasswords"));
      } else {
        setError(t("accountDeletion.errorGeneric"));
      }
      return;
    }

    // The server already removed the session; this clears the cookie and cached hotel data.
    await signOutCurrentSession();
    queryClient.clear();
    window.location.assign("/login");
  }

  const ownedHotels = status.data?.ownedHotels ?? [];
  const blocked = ownedHotels.length > 0 || Boolean(status.data?.lastPlatformAdmin);

  return (
    <section className="panel" aria-labelledby="delete-account-heading" data-testid="delete-account" style={{ marginTop: 18 }}>
      <div className="panel-heading">
        <div>
          <div className="eyebrow">{t("accountDeletion.eyebrow")}</div>
          <h2 id="delete-account-heading">{t("accountDeletion.title")}</h2>
        </div>
      </div>

      <div className="form-error" role="note" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <TriangleAlert size={15} aria-hidden="true" style={{ flex: "0 0 auto" }} />
        <span>{t("accountDeletion.warning")}</span>
      </div>

      <h3 style={{ marginTop: 14 }}>{t("accountDeletion.goesTitle")}</h3>
      <ul className="lede" style={{ margin: "6px 0 0", paddingLeft: 18, listStyle: "disc" }}>
        <li>{t("accountDeletion.goesAccount")}</li>
        <li>{t("accountDeletion.goesAccess")}</li>
        <li>{t("accountDeletion.goesInvites")}</li>
      </ul>
      <h3 style={{ marginTop: 14 }}>{t("accountDeletion.staysTitle")}</h3>
      <p className="lede" style={{ marginTop: 6 }}>{t("accountDeletion.staysRecords")}</p>

      {status.isLoading && <p role="status" className="lede" style={{ marginTop: 12 }}>{t("accountDeletion.loading")}</p>}
      {status.isError && <div className="form-error" role="alert">{t("accountDeletion.loadFailed")}</div>}

      {ownedHotels.length > 0 && (
        <div data-testid="delete-account-blocked" style={{ marginTop: 14 }}>
          <p>{t("accountDeletion.blockedOwner")}</p>
          <ul style={{ margin: "8px 0", padding: 0, listStyle: "none" }}>
            {ownedHotels.map(hotel => (
              <li key={hotel.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "4px 0" }}>
                <strong>{hotel.name}</strong>
                <Link href={`/hotels/${hotel.id}/staff`} className="button button-quiet button-small">{t("accountDeletion.manageStaff")}</Link>
              </li>
            ))}
          </ul>
          <p className="lede">{t("accountDeletion.blockedHowTo", { email: SUPPORT_EMAIL })}</p>
        </div>
      )}
      {status.data?.lastPlatformAdmin && <p data-testid="delete-account-last-admin" style={{ marginTop: 14 }}>{t("accountDeletion.blockedLastAdmin")}</p>}

      {status.isSuccess && !blocked && !confirming && (
        <button type="button" className="button button-quiet" style={{ marginTop: 14, color: "var(--clay)" }} onClick={() => setConfirming(true)}>
          {t("accountDeletion.start")}
        </button>
      )}

      {status.isSuccess && !blocked && confirming && (
        <form
          className="panel"
          style={{ marginTop: 14, padding: 12, display: "grid", gap: 10 }}
          data-testid="delete-account-confirm"
          onSubmit={event => { event.preventDefault(); if (canSubmit) void handleDelete(); }}
        >
          <h3>{t("accountDeletion.confirmTitle")}</h3>
          {error && <div className="form-error" role="alert" style={{ margin: 0 }}>{error}</div>}
          <label style={{ display: "grid", gap: 6 }}>
            {t("accountDeletion.emailLabel", { email: accountEmail })}
            <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="off" />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            {t("accountDeletion.passwordLabel")}
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          {needsCode && (
            <label style={{ display: "grid", gap: 6 }}>
              {t("accountDeletion.codeLabel")}
              <input
                value={code}
                onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
              />
            </label>
          )}
          {authMe?.twoFactorEnabled && codeAccepted && <p className="lede" role="status">{t("accountDeletion.codeVerified")}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" className="button button-primary" disabled={!canSubmit}>
              {busy ? t("accountDeletion.deleting") : t("accountDeletion.confirm")}
            </button>
            <button type="button" className="button button-quiet" disabled={busy} onClick={reset}>
              {t("accountDeletion.cancel")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

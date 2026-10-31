import React, { FormEvent, useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { PageState } from "@/components/PageState";
import { useTranslation } from "@/lib/i18n";

export default function AcceptInvite() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();

  // Support trpc.staff.acceptStaffInvite or trpc.channelManager.acceptStaffInvite
  const acceptInviteMutation = (trpc.staff?.acceptStaffInvite ?? trpc.channelManager.acceptStaffInvite).useMutation();

  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [token, setToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acceptedExistingAccount, setAcceptedExistingAccount] = useState(false);

  useEffect(() => {
    const search = typeof window !== "undefined" && window.location.search ? window.location.search : "";
    const hash = typeof window !== "undefined" && window.location.hash ? window.location.hash.substring(1) : "";
    const searchParams = new URLSearchParams(search);
    const hashParams = new URLSearchParams(hash);

    const errorDesc =
      searchParams.get("error_description") ||
      hashParams.get("error_description") ||
      searchParams.get("error") ||
      hashParams.get("error");

    if (errorDesc) {
      setError(errorDesc);
      setAuthStatus("unauthenticated");
      return;
    }

    const inviteToken = searchParams.get("token") || hashParams.get("token");
    if (!inviteToken) {
      setError(t("acceptInvite.invalidDesc") || "Missing invitation token.");
      setAuthStatus("unauthenticated");
      return;
    }

    setToken(inviteToken);
    const emailParam = searchParams.get("email") || hashParams.get("email");
    if (emailParam) {
      setUserEmail(emailParam);
    }
    setAuthStatus("authenticated");
  }, [t]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t("acceptInvite.passwordTooShort"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("acceptInvite.passwordMismatch"));
      return;
    }

    if (!token) {
      setError(t("acceptInvite.invalidDesc") || "Invitation token is missing.");
      setAuthStatus("unauthenticated");
      return;
    }

    setSubmitting(true);
    try {
      const result = await acceptInviteMutation.mutateAsync({
        token,
        password,
      });

      if (result.signInRequired) {
        setSubmitting(false);
        setAcceptedExistingAccount(true);
        return;
      }

      const email = result.user?.email || userEmail;
      if (email) {
        await authClient.signIn.email({
          email,
          password,
        });
      }

      setSubmitting(false);
      navigate("/dashboard");
    } catch (err) {
      setSubmitting(false);
      const message = err instanceof Error ? err.message : t("acceptInvite.invalidDesc");
      setError(message);
    }
  }

  return (
    <div className="login-page">
      <div className="login-aside">
        <div className="login-brand">
          <span className="brand-mark"><span /></span>
          <strong>hay<em>host</em></strong>
        </div>
        <div className="login-aside-copy">
          <div className="eyebrow">{t("acceptInvite.eyebrowAside")}</div>
          <h1>{t("acceptInvite.headlineAside1")}<br /><i>{t("acceptInvite.headlineAside2")}</i></h1>
          <p>{t("acceptInvite.descAside")}</p>
        </div>
        <div className="login-aside-foot">
          <span>{t("login.privateOperations")}</span>
          <span className="signal-text"><i /> {t("login.secureWorkspace")}</span>
        </div>
      </div>

      <main className="login-main">
        {authStatus === "loading" && (
          <PageState
            tone="loading"
            title={t("acceptInvite.verifyingInvite")}
            description={t("acceptInvite.verifyingDesc")}
          />
        )}

        {authStatus === "unauthenticated" && (
          <PageState
            tone="error"
            title={t("acceptInvite.invalidTitle")}
            description={error || t("acceptInvite.invalidDesc")}
            actionLabel={t("acceptInvite.backToLogin")}
            onAction={() => navigate("/login")}
          />
        )}

        {acceptedExistingAccount && (
          <PageState
            tone="empty"
            title={t("acceptInvite.existingAccountTitle")}
            description={t("acceptInvite.existingAccountDesc")}
            actionLabel={t("acceptInvite.backToLogin")}
            onAction={() => navigate("/login")}
          />
        )}

        {authStatus === "authenticated" && !acceptedExistingAccount && (
          <form className="login-card" onSubmit={handleSubmit}>
            <div className="eyebrow">{t("acceptInvite.eyebrowCard")}</div>
            <h2>{t("acceptInvite.titleCard")}</h2>
            <p>
              {t("acceptInvite.descCard")}
              {userEmail ? ` (${userEmail})` : ""}.
            </p>
            <label>
              {t("acceptInvite.passwordLabel")}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label>
              {t("acceptInvite.confirmPasswordLabel")}
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="button button-primary login-button" type="submit" disabled={submitting}>
              {submitting ? t("acceptInvite.savingPassword") : t("acceptInvite.setPassword")} <ArrowRight size={16} />
            </button>
            <div className="login-security">
              <ShieldCheck size={15} />
              <span>{t("login.securityNote")}</span>
            </div>
          </form>
        )}

        <div className="login-footer">
          <span><LockKeyhole size={13} /> {t("login.privateWorkspace")}</span>
          <span>{t("login.needHelp")}</span>
        </div>
      </main>
    </div>
  );
}

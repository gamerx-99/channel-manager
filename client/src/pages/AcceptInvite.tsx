import React, { FormEvent, useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { PageState } from "@/components/PageState";
import { useTranslation } from "@/lib/i18n";

export default function AcceptInvite() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();

  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Check if URL has error parameters from Supabase (e.g. #error=access_denied&error_description=...)
    const hash = typeof window !== "undefined" && window.location.hash ? window.location.hash.substring(1) : "";
    const search = typeof window !== "undefined" && window.location.search ? window.location.search.substring(1) : "";
    const hashParams = new URLSearchParams(hash);
    const searchParams = new URLSearchParams(search);

    const errorDesc =
      hashParams.get("error_description") ||
      searchParams.get("error_description") ||
      hashParams.get("error") ||
      searchParams.get("error");

    if (errorDesc) {
      setError(errorDesc);
      setAuthStatus("unauthenticated");
      return;
    }

    let isMounted = true;

    // Listen to auth state changes (e.g. SIGNED_IN from detectSessionInUrl)
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        setUserEmail(session.user.email ?? null);
        setAuthStatus("authenticated");
      }
    });

    // Also check current session directly
    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (!isMounted) return;
      if (sessionError) {
        setError(sessionError.message);
        setAuthStatus("unauthenticated");
        return;
      }
      if (session?.user) {
        setUserEmail(session.user.email ?? null);
        setAuthStatus("authenticated");
      }
    });

    // Timeout fallback: if no session detected after 4 seconds, mark as unauthenticated
    const timer = setTimeout(() => {
      if (!isMounted) return;
      setAuthStatus((current) => (current === "loading" ? "unauthenticated" : current));
    }, 4000);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      authListener?.subscription?.unsubscribe();
    };
  }, []);

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

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setSubmitting(false);
      setError(updateError.message);
      return;
    }

    setSubmitting(false);
    navigate("/dashboard");
  }

  return (
    <div className="login-page">
      <div className="login-aside">
        <div className="login-brand">
          <span className="brand-mark"><span /></span>
          <strong>channel<em>manager</em></strong>
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

        {authStatus === "authenticated" && (
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

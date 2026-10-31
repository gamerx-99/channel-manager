import React, { FormEvent, useState } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck, KeyRound } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { authClient } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { MFA_ENROLL_PATH, shouldEnforceMfaForRoles } from '@/lib/mfa';
import { useTranslation } from '@/lib/i18n';

export default function Login() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [isTwoFactor, setIsTwoFactor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Safely resolve tRPC utils (handling environments rendered outside trpc.Provider)
  let trpcUtils: ReturnType<typeof trpc.useUtils> | null = null;
  try {
    trpcUtils = trpc.useUtils();
  } catch {
    // Graceful fallback when rendered outside trpc.Provider in unit tests
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const { data, error: signInError } = await authClient.signIn.email({
        email,
        password,
      });

      if (signInError) {
        setSubmitting(false);
        // Better Auth's own message is English; a wrong email or password gets ours.
        const wrongCredentials = signInError.code === "INVALID_EMAIL_OR_PASSWORD" || signInError.status === 401;
        setError(wrongCredentials || !signInError.message ? t("login.invalidCredentials") : signInError.message);
        return;
      }

      // Check if user has 2FA enabled and server requested 2FA challenge
      if (data && "twoFactorRedirect" in data && (data as { twoFactorRedirect?: boolean }).twoFactorRedirect) {
        setSubmitting(false);
        setIsTwoFactor(true);
        return;
      }

      // Blocking MFA enrollment check for platform roles (T09-04)
      try {
        let roles: string[] = [];
        let twoFactorEnabled = false;

        if (trpcUtils) {
          try {
            const me = await trpcUtils.auth.me.fetch();
            if (me) {
              roles = (me.roles?.length ? me.roles : me.role ? [me.role] : []) as string[];
              twoFactorEnabled = Boolean(me.twoFactorEnabled);
            }
          } catch {
            // Ignore tRPC fetch errors — fail open
          }
        }

        if (!twoFactorEnabled && shouldEnforceMfaForRoles(roles)) {
          setSubmitting(false);
          navigate(MFA_ENROLL_PATH);
          return;
        }
      } catch {
        // Ignore role resolution errors — allow navigation to dashboard
      }

      setSubmitting(false);
      navigate('/dashboard');
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Sign in failed");
    }
  }

  async function handleTotpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (totpCode.trim().length !== 6) return;

    setSubmitting(true);
    setError(null);

    try {
      const { error: verifyError } = await authClient.twoFactor.verifyTotp({
        code: totpCode.trim(),
      });

      if (verifyError) {
        setSubmitting(false);
        const msg = verifyError.message?.toLowerCase().includes("invalid")
          ? t("mfaEnroll.errorIncorrectCode") || "Incorrect code — please wait for the next 6-digit code and try again"
          : verifyError.message || "Verification failed";
        setError(msg);
        return;
      }

      setSubmitting(false);
      navigate('/dashboard');
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Verification failed");
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
          <div className="eyebrow">{t("login.eyebrowAside")}</div>
          <h1>{t("login.headlineAside1")}<br /><i>{t("login.headlineAside2")}</i></h1>
          <p>{t("login.descAside")}</p>
        </div>
        <div className="login-aside-foot">
          <span>{t("login.privateOperations")}</span>
          <span className="signal-text"><i /> {t("login.secureWorkspace")}</span>
        </div>
      </div>
      <main className="login-main">
        {isTwoFactor ? (
          <form className="login-card" onSubmit={handleTotpSubmit} data-testid="login-totp-form">
            <div className="eyebrow">{t("mfaEnroll.eyebrow") || "Two-Factor Authentication"}</div>
            <h2>{t("mfaEnroll.title") || "Enter Authenticator Code"}</h2>
            <p>{t("mfaEnroll.lede") || "Enter the 6-digit verification code from your authenticator app."}</p>
            <label>
              {t("mfaEnroll.codeInputLabel") || "Verification code"}
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={t("mfaEnroll.codePlaceholder") || "123456"}
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                autoFocus
                required
              />
            </label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button
              className="button button-primary login-button"
              type="submit"
              disabled={submitting || totpCode.trim().length !== 6}
            >
              {submitting ? t("mfaEnroll.verifying") || "Verifying…" : t("login.continue")} <ArrowRight size={16} />
            </button>
            <button
              className="button button-quiet"
              type="button"
              onClick={() => {
                setIsTwoFactor(false);
                setTotpCode('');
                setError(null);
              }}
              disabled={submitting}
              style={{ marginTop: 8, width: '100%' }}
            >
              {t("common.back") || "Back to sign in"}
            </button>
            <div className="login-security">
              <KeyRound size={15} />
              <span>{t("login.securityNote")}</span>
            </div>
          </form>
        ) : (
          <form className="login-card" onSubmit={handlePasswordSubmit}>
            <div className="eyebrow">{t("login.eyebrowCard")}</div>
            <h2>{t("login.titleCard")}</h2>
            <p>{t("login.descCard")}</p>
            <label>
              {t("login.emailLabel")}
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              {t("login.passwordLabel")}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <Link href="/forgot-password" className="text-link" data-testid="forgot-password-link">{t("login.forgotPassword")}</Link>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="button button-primary login-button" type="submit" disabled={submitting}>
              {submitting ? t("login.signingIn") : t("login.continue")} <ArrowRight size={16} />
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

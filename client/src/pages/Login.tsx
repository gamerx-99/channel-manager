import React, { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Fingerprint, LockKeyhole, ShieldCheck, KeyRound } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { authClient } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { classifyPasskeyError, passkeyAutofillSupported, passkeySupported } from '@/lib/passkey';
import { useTranslation } from '@/lib/i18n';
import { readSocialError, SocialSignIn } from '@/components/auth/SocialSignIn';
import { CheckEmail } from '@/components/auth/CheckEmail';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { AuthLogo } from "@/components/AuthLogo";

/** Only an owner signup link may be resumed here, so 
ext cannot send anyone off the site. */
function returnPath(search: string) {
  const next = new URLSearchParams(search).get('next');
  return next && /^\/signup\/[^/?#\\]+$/.test(next) ? next : null;
}

export default function Login() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [emailVerified] = useState(() => new URLSearchParams(window.location.search).get('verified') === '1');
  const [next] = useState(() => returnPath(window.location.search));
  const [totpCode, setTotpCode] = useState('');
  // A social sign-in on a 2FA account comes back here with the challenge already started.
  const [socialTwoFactor] = useState(() => new URLSearchParams(window.location.search).get("two_factor") === "1");
  const [isTwoFactor, setIsTwoFactor] = useState(socialTwoFactor);
  const [error, setError] = useState<string | null>(() => {
    const socialError = readSocialError();
    return socialError ? t(socialError) : null;
  });
  const [submitting, setSubmitting] = useState(false);

  // Safely resolve tRPC utils (handling environments rendered outside trpc.Provider)
  let trpcUtils: ReturnType<typeof trpc.useUtils> | null = null;
  try {
    trpcUtils = trpc.useUtils();
  } catch {
    // Graceful fallback when rendered outside trpc.Provider in unit tests
  }

  const canUsePasskey = passkeySupported();

  // Offer saved passkeys in the email field's autofill list; picking one signs in without a click.
  useEffect(() => {
    if (isTwoFactor) return;
    let cancelled = false;
    void passkeyAutofillSupported().then(available => {
      if (available && !cancelled) void signInWithPasskey(true);
    });
    return () => { cancelled = true; };
    // Once per visit to the password form; the handler reads the latest state when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTwoFactor]);

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
        // The server has just sent a fresh link to this address.
        if (signInError.code === "EMAIL_NOT_VERIFIED") {
          setPendingVerification(true);
          return;
        }
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

      await finishSignIn();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Sign in failed");
    }
  }

  /** Same next step for every way in: the page the person came for. */
  async function finishSignIn() {
    // 2FA is optional (owner, 2026-11-11): nobody is sent to enrol; people turn it on in security settings.
    try {
      let signedInWithoutRole = false;

      if (trpcUtils) {
        try {
          const me = await trpcUtils.auth.me.fetch();
          if (me) {
            const roles = (me.roles?.length ? me.roles : me.role ? [me.role] : []) as string[];
            signedInWithoutRole = roles.length === 0;
          }
        } catch {
          // Ignore tRPC fetch errors — fail open
        }
      }

      // Confirming an email comes before the hotel step, so a new owner resumes it here.
      if (signedInWithoutRole) {
        setSubmitting(false);
        navigate(next ?? '/dashboard');
        return;
      }
    } catch {
      // Ignore role resolution errors — allow navigation to dashboard
    }

    setSubmitting(false);
    navigate('/dashboard');
  }

  async function signInWithPasskey(autoFill = false) {
    setError(null);
    if (!autoFill) setSubmitting(true);
    const { error: passkeyError } = await authClient.signIn.passkey({ autoFill });
    if (passkeyError) {
      if (autoFill) return;
      setSubmitting(false);
      // Closing the system prompt is a choice, so only a real failure shows a message.
      if (classifyPasskeyError(passkeyError) !== "cancelled") setError(t("passkey.signInFailed"));
      return;
    }
    await finishSignIn();
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
      navigate(next ?? '/dashboard');
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Verification failed");
    }
  }

  return (
    <div className="login-page auth-login-page">
      <div className="login-aside">
        <div className="login-header"><AuthLogo /><LanguageSwitcher /></div>
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
        {pendingVerification ? (
          <CheckEmail email={email} onBack={() => setPendingVerification(false)} />
        ) : isTwoFactor ? (
          <form className="login-card" onSubmit={handleTotpSubmit} data-testid="login-totp-form">
            <div className="eyebrow">{t("mfaEnroll.eyebrow") || "Two-Factor Authentication"}</div>
            <h2>{socialTwoFactor ? t("socialAuth.twoFactorTitle") : t("mfaEnroll.title") || "Enter Authenticator Code"}</h2>
            <p>{socialTwoFactor ? t("socialAuth.twoFactorRequired") : t("mfaEnroll.lede") || "Enter the 6-digit verification code from your authenticator app."}</p>
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
            {emailVerified ? <p role="status">{t("verifyEmail.verified")}</p> : null}
            {/* /signup sends people with a hotel on to the dashboard, and finishes setup for those without one. */}
            <SocialSignIn callbackURL="/signup" errorCallbackURL="/login" mode="login" />
            <label>
              {t("login.emailLabel")}
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username webauthn"
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
            {canUsePasskey ? (
              <button className="button button-quiet login-button" type="button" disabled={submitting} onClick={() => void signInWithPasskey()} data-testid="passkey-sign-in">
                <Fingerprint size={16} aria-hidden="true" /> {t("passkey.signInButton")}
              </button>
            ) : null}
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
        {!isTwoFactor ? (
          <div className="login-signup-prompt">
            <span>{t("login.noAccount")}</span>
            <Link href="/signup" className="button button-quiet">{t("login.signUp")}</Link>
          </div>
        ) : null}
      </main>
    </div>
  );
}

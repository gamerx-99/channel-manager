import React, { FormEvent, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Link, Redirect, useLocation } from "wouter";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";
import { CheckEmail } from "@/components/auth/CheckEmail";
import { readSocialError, SocialSignIn } from "@/components/auth/SocialSignIn";

export default function Signup() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(() => {
    const socialError = readSocialError();
    return socialError ? t(socialError) : null;
  });
  const [submitting, setSubmitting] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("signup.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("signup.passwordMismatch"));
      return;
    }

    setSubmitting(true);
    let data: Awaited<ReturnType<typeof authClient.signUp.email>>["data"];
    let signUpError: Awaited<ReturnType<typeof authClient.signUp.email>>["error"];
    try {
      ({ data, error: signUpError } = await authClient.signUp.email({
        email: email.trim(), password, name: `${firstName.trim()} ${lastName.trim()}`,
        firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(),
      }));
    } catch {
      setSubmitting(false);
      setError(t("signup.accountFailed"));
      return;
    }
    if (signUpError || !data?.user) {
      setSubmitting(false);
      setError(t("signup.accountFailed"));
      return;
    }
    if (data.token === null) {
      setSubmitting(false);
      setAwaitingVerification(true);
      return;
    }
    await utils.auth.me.invalidate();
    navigate("/dashboard");
  }

  // A signed-in account never needs this form again; /dashboard shows hotel setup to an account without one.
  if (me.data) return <Redirect to="/dashboard" />;

  return (
    <div className="login-page signup-page">
      <div className="login-aside">
        <Link href="/" className="login-brand"><span className="brand-mark"><span /></span><strong>hay<em>host</em></strong></Link>
        <div className="login-aside-copy">
          <div className="eyebrow">{t("signup.eyebrow")}</div>
          <h1>{t("signup.asideTitle")}</h1>
          <p>{t("signup.asideLede")}</p>
        </div>
      </div>
      <main className="login-main">
        {awaitingVerification ? <CheckEmail email={email} /> : (
          <form className="login-card signup-card" onSubmit={handleSubmit}>
            <div className="eyebrow">{t("signup.eyebrow")}</div>
            <h2>{t("signup.title")}</h2>
            <p>{t("signup.lede")}</p>
            <SocialSignIn callbackURL="/signup" errorCallbackURL="/signup" mode="signup" />
            <label>{t("signup.firstName")}<input type="text" value={firstName} onChange={event => setFirstName(event.target.value)} maxLength={100} autoComplete="given-name" required /></label>
            <label>{t("signup.lastName")}<input type="text" value={lastName} onChange={event => setLastName(event.target.value)} maxLength={100} autoComplete="family-name" required /></label>
            <label>{t("signup.phone")}<input type="tel" value={phone} onChange={event => setPhone(event.target.value)} maxLength={40} autoComplete="tel" required /></label>
            <label>{t("signup.email")}<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label>
            <label>{t("signup.password")}<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
            <label>{t("signup.confirmPassword")}<input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="button button-primary login-button" type="submit" disabled={submitting}>
              {submitting ? t("signup.creating") : t("signup.createAccount")} <ArrowRight size={16} />
            </button>
            <p className="signup-legal-notice">{t("signup.legalNoticePrefix")} <a href="/terms" target="_blank" rel="noreferrer">{t("signup.termsLink")}</a> {t("signup.legalNoticeAnd")} <a href="/privacy" target="_blank" rel="noreferrer">{t("signup.privacyLink")}</a>.</p>
            <div className="login-security"><ShieldCheck size={15} /><span>{t("signup.securityNote")}</span></div>
          </form>
        )}
        <div className="login-footer signup-footer"><span>{t("signup.haveAccount")}</span><Link href="/login" className="button button-quiet">{t("signup.signIn")}</Link></div>
      </main>
    </div>
  );
}

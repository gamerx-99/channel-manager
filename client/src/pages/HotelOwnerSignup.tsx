import React, { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { PageState } from "@/components/PageState";
import { CheckEmail } from "@/components/auth/CheckEmail";
import { readSocialError, SocialSignIn } from "@/components/auth/SocialSignIn";
import { useTranslation } from "@/lib/i18n";
import { AuthLogo } from "@/components/AuthLogo";

type HotelOwnerSignupProps = { token: string };

export default function HotelOwnerSignup({ token }: HotelOwnerSignupProps) {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const validation = trpc.channelManager.validateSignupLink.useQuery({ token });
  const completeSignup = trpc.channelManager.completeHotelOwnerSignup.useMutation();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(() => {
    const socialError = readSocialError();
    return socialError ? t(socialError) : null;
  });
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmailConfirmation, setPendingEmailConfirmation] = useState(false);

  const signedIn = Boolean(me.data);
  const hotelName = validation.data?.hotelName ?? "";
  const verifiedPath = `/login?verified=1&next=${encodeURIComponent(`/signup/${encodeURIComponent(token)}`)}`;

  async function finishSetup() {
    await completeSignup.mutateAsync({ token });
  }

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await finishSetup();
    } catch {
      setSubmitting(false);
      setError(t("ownerSignup.finishFailed"));
      return;
    }
    navigate("/dashboard");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("ownerSignup.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("ownerSignup.passwordMismatch"));
      return;
    }
    setSubmitting(true);
    const name = email.split("@")[0] || "Hotel Owner";
    const { data, error: signUpError } = await authClient.signUp.email({ email, password, name, callbackURL: verifiedPath });
    if (signUpError || !data?.user) {
      setSubmitting(false);
      setError(signUpError?.message ?? t("ownerSignup.accountFailed"));
      return;
    }
    // No session until the email is confirmed; signing in afterwards returns to this link.
    if (data.token === null) {
      setSubmitting(false);
      setPendingEmailConfirmation(true);
      return;
    }
    try {
      await finishSetup();
    } catch (mutationError) {
      setSubmitting(false);
      setError(mutationError instanceof Error ? mutationError.message : t("ownerSignup.finishFailed"));
      return;
    }
    setSubmitting(false);
    navigate("/dashboard");
  }

  if (validation.isLoading) {
    return <div className="login-page"><main className="login-main"><PageState tone="loading" title={t("ownerSignup.checkingLink")} /></main></div>;
  }

  if (!validation.data?.valid) {
    return (
      <div className="login-page">
        <main className="login-main">
          <PageState
            tone="error"
            title={t("ownerSignup.invalidTitle")}
            description={t("ownerSignup.invalidDesc")}
          />
        </main>
      </div>
    );
  }

  if (pendingEmailConfirmation) {
    return (
      <div className="login-page">
        <main className="login-main">
          <CheckEmail email={email} callbackURL={verifiedPath} />
        </main>
      </div>
    );
  }

  const signupPath = `/signup/${encodeURIComponent(token)}`;

  return (
    <div className="login-page">
      <div className="login-aside">
        <AuthLogo />
        <div className="login-aside-copy">
          <div className="eyebrow">{t("ownerSignup.eyebrowAside")}</div>
          <h1>{t("ownerSignup.headlineAside")}<br /><i>{hotelName}.</i></h1>
          <p>{t("ownerSignup.descAside")}</p>
        </div>
        <div className="login-aside-foot"><span>{t("ownerSignup.privateOperations")}</span><span className="signal-text"><i /> {t("ownerSignup.secureWorkspace")}</span></div>
      </div>
      <main className="login-main">
        {signedIn ? (
          <form className="login-card" onSubmit={handleConnect} data-testid="owner-signup-connect">
            <div className="eyebrow">{t("ownerSignup.eyebrowCard")}</div>
            <h2>{t("ownerSignup.finishTitle")}</h2>
            <p>{t("ownerSignup.finishDesc", { hotel: hotelName })}</p>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="button button-primary login-button" type="submit" disabled={submitting}>
              {submitting ? t("ownerSignup.finishing") : t("ownerSignup.finish")} <ArrowRight size={16} />
            </button>
          </form>
        ) : (
          <form className="login-card" onSubmit={handleSubmit}>
            <div className="eyebrow">{t("ownerSignup.eyebrowCard")}</div>
            <h2>{t("ownerSignup.titleCard")}</h2>
            <p>{t("ownerSignup.descCard", { hotel: hotelName })}</p>
            <SocialSignIn callbackURL={signupPath} errorCallbackURL={signupPath} mode="signup" />
            <label>{t("ownerSignup.emailLabel")}<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label>
            <label>{t("ownerSignup.passwordLabel")}<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
            <label>{t("ownerSignup.confirmPasswordLabel")}<input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="button button-primary login-button" type="submit" disabled={submitting}>
              {submitting ? t("ownerSignup.creating") : t("ownerSignup.create")} <ArrowRight size={16} />
            </button>
            <div className="login-security"><ShieldCheck size={15} /><span>{t("ownerSignup.securityNote")}</span></div>
          </form>
        )}
        <div className="login-footer"><span><LockKeyhole size={13} /> {t("ownerSignup.privateWorkspace")}</span><span>{t("ownerSignup.needHelp")}</span></div>
      </main>
    </div>
  );
}

import React, { FormEvent, useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function Signup() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const registerHotel = trpc.channelManager.registerOwnHotel.useMutation();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const signedIn = Boolean(me.data);
  const hasRole = Boolean(me.data?.roles?.length || me.data?.role);

  useEffect(() => {
    if (hasRole) navigate("/dashboard");
  }, [hasRole, navigate]);

  function registrationError(mutationError: unknown) {
    const code = (mutationError as { data?: { code?: string } } | null)?.data?.code;
    if (code === "CONFLICT") return t("signup.slugTaken");
    if (code === "BAD_REQUEST") return t("signup.slugReserved");
    if (code === "TOO_MANY_REQUESTS") return t("signup.tooManyRequests");
    return t("signup.createFailed");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!SLUG_PATTERN.test(slug)) {
      setError(t("signup.slugInvalid"));
      return;
    }
    if (!signedIn) {
      if (password.length < 8) {
        setError(t("signup.passwordTooShort"));
        return;
      }
      if (password !== confirmPassword) {
        setError(t("signup.passwordMismatch"));
        return;
      }
    }

    setSubmitting(true);
    if (!signedIn) {
      const { data, error: signUpError } = await authClient.signUp.email({ email, password, name: email.split("@")[0] || name });
      if (signUpError || !data?.user) {
        setSubmitting(false);
        setError(t("signup.accountFailed"));
        return;
      }
    }

    try {
      await registerHotel.mutateAsync({ name, slug, address, owner_contact: contact });
      await utils.auth.me.invalidate();
      navigate("/dashboard");
    } catch (mutationError) {
      // The account exists by now, so the retry must only send the hotel details.
      await me.refetch();
      setError(registrationError(mutationError));
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page signup-page">
      <div className="login-aside">
        <Link href="/" className="login-brand"><span className="brand-mark"><span /></span><strong>hay<em>host</em></strong></Link>
        <div className="login-aside-copy">
          <div className="eyebrow">{t("landing.heroEyebrow")}</div>
          <h1>{t("landing.heroHeadline")}</h1>
          <p>{t("landing.heroLede")}</p>
        </div>
      </div>
      <main className="login-main">
        <form className="login-card signup-card" onSubmit={handleSubmit}>
          <div className="eyebrow">{t("signup.eyebrow")}</div>
          <h2>{t("signup.title")}</h2>
          <p>{signedIn ? t("signup.continueLede") : t("signup.lede")}</p>
          <label>{t("signup.hotelName")}<input type="text" value={name} onChange={event => setName(event.target.value)} maxLength={160} required /></label>
          <label>
            {t("signup.slug")}
            <span className="signup-slug"><span>{window.location.host}/</span><input type="text" value={slug} onChange={event => setSlug(event.target.value.toLowerCase())} maxLength={100} aria-describedby="signup-slug-help" autoCapitalize="none" spellCheck={false} required /></span>
          </label>
          <small id="signup-slug-help">{t("signup.slugHelp")}</small>
          <label>{t("signup.address")}<input type="text" value={address} onChange={event => setAddress(event.target.value)} maxLength={500} autoComplete="street-address" required /></label>
          <label>{t("signup.contact")}<input type="tel" value={contact} onChange={event => setContact(event.target.value)} maxLength={180} autoComplete="tel" required /></label>
          {!signedIn && (
            <>
              <label>{t("signup.email")}<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label>
              <label>{t("signup.password")}<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
              <label>{t("signup.confirmPassword")}<input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
            </>
          )}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary login-button" type="submit" disabled={submitting}>
            {submitting ? t("signup.creating") : t("signup.create")} <ArrowRight size={16} />
          </button>
          <div className="login-security"><ShieldCheck size={15} /><span>{t("signup.securityNote")}</span></div>
        </form>
        {!signedIn && <div className="login-footer"><span>{t("signup.haveAccount")}</span><Link href="/login">{t("signup.signIn")}</Link></div>}
      </main>
    </div>
  );
}

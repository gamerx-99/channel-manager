// Public self-signup: register an account, create the hotel, land in onboarding.
import React, { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "@/lib/i18n";

export default function Signup() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const createHotel = trpc.signup.createHotel.useMutation({
    onSuccess: () => navigate("/dashboard"),
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (password.length < 8) {
      setError(t("signup.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("signup.passwordMismatch"));
      return;
    }

    setSubmitting(true);
    // 1. Account. Supabase creates it or reports that it already exists.
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError && !/already registered|already exists/i.test(signUpError.message)) {
      setSubmitting(false);
      setError(signUpError.message);
      return;
    }

    let session = data?.session ?? null;
    if (!session) {
      // Email confirmation is required: sign in so the session exists for the
      // hotel-creation call, which is authenticated.
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setSubmitting(false);
        setNotice(t("signup.confirmEmailFirst"));
        return;
      }
      session = signInData.session;
    }
    if (!session) {
      setSubmitting(false);
      setNotice(t("signup.confirmEmailFirst"));
      return;
    }

    // 2. Hotel + owner membership + trial, server-side.
    try {
      await createHotel.mutateAsync({
        name,
        address,
        owner_contact: contact,
      });
    } catch (mutationError) {
      setSubmitting(false);
      setError(mutationError instanceof Error ? mutationError.message : t("signup.createFailed"));
    }
  }

  return (
    <div className="login-page">
      <main className="login-main">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="eyebrow">{t("signup.eyebrow")}</div>
          <h2>{t("signup.title")}</h2>
          <p>{t("signup.lede")}</p>

          <label>
            {t("signup.hotelName")}
            <input
              type="text"
              value={name}
              onChange={event => setName(event.target.value)}
              required
              minLength={2}
              maxLength={160}
            />
          </label>
          <label>
            {t("signup.address")}
            <input
              type="text"
              value={address}
              onChange={event => setAddress(event.target.value)}
              required
              maxLength={500}
            />
          </label>
          <label>
            {t("signup.contact")}
            <input
              type="text"
              value={contact}
              onChange={event => setContact(event.target.value)}
              required
              maxLength={180}
            />
          </label>
          <label>
            {t("signup.email")}
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              required
              autoComplete="email"
              maxLength={320}
            />
          </label>
          <label>
            {t("signup.password")}
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
            />
          </label>
          <label>
            {t("signup.confirmPassword")}
            <input
              type="password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
            />
          </label>

          {notice && <p className="form-note" role="status">{notice}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}

          <button className="button button-primary login-button" type="submit" disabled={submitting}>
            {submitting ? t("signup.creating") : t("signup.create")} <ArrowRight size={16} />
          </button>
          <div className="login-security">
            <LockKeyhole size={15} />
            <span>{t("signup.trialNote", { days: 14 })}</span>
          </div>
        </form>

        <div className="login-footer">
          <span>{t("signup.haveAccount")}</span>
          <a href="/login">{t("signup.signIn")}</a>
        </div>
      </main>
    </div>
  );
}
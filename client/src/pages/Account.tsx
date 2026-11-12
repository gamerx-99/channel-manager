import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import PageState from "@/components/PageState";
import { authClient } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { planHasEnd, planNameKey, signInMethod } from "./accountProfile";
import type { SocialProviderId } from "@shared/socialAuth";

export default function Account() {
  const { t, language } = useTranslation();
  const profileQuery = trpc.auth.profile.useQuery(undefined, { retry: false });
  const providersQuery = trpc.auth.socialProviders.useQuery(undefined, { retry: false });
  const [connecting, setConnecting] = useState<SocialProviderId | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const dateFormat = new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", { dateStyle: "medium" });

  if (profileQuery.isLoading) {
    return <div className="page-content"><PageState tone="loading" title={t("account.loadingTitle")} description={t("account.loadingDesc")} /></div>;
  }
  if (profileQuery.error || !profileQuery.data) {
    return <div className="page-content"><PageState tone="error" title={t("account.errorTitle")} description={profileQuery.error?.message ?? t("account.errorDesc")} actionLabel={t("account.retry")} onAction={() => void profileQuery.refetch()} actionPending={profileQuery.isFetching} /></div>;
  }

  const profile = profileQuery.data;
  const unlinkedProviders = (providersQuery.data ?? []).filter(provider => !profile.linkedAccounts.includes(provider));

  async function connect(provider: SocialProviderId) {
    setConnecting(provider);
    setConnectError(null);
    const path = window.location.pathname;
    const { error } = await authClient.linkSocial({ provider, callbackURL: path, errorCallbackURL: path });
    if (error) {
      setConnecting(null);
      setConnectError(t("socialAuth.failed"));
    }
  }

  return (
    <div className="page-content account-page">
      <section className="page-intro intro-split">
        <div>
          <div className="eyebrow">{t("account.eyebrow")}</div>
          <h1>{t("account.title")}<span className="title-mark">.</span></h1>
          <p className="lede">{t("account.lede")}</p>
        </div>
      </section>

      <section className="panel" aria-labelledby="account-details-heading">
        <div className="panel-heading"><div><h2 id="account-details-heading">{t("account.detailsTitle")}</h2></div></div>
        <AccountProfileEditor profile={profile} onSaved={() => void profileQuery.refetch()} />
      </section>

      <section className="panel" aria-labelledby="account-signin-heading">
        <div className="panel-heading">
          <div><h2 id="account-signin-heading">{t("account.signInTitle")}</h2></div>
          <Link href="/settings/security" className="text-link">{t("account.manageSignIn")}</Link>
        </div>
        {connectError ? <p className="form-error" role="alert">{connectError}</p> : null}
        {profile.linkedAccounts.length || unlinkedProviders.length ? (
          <ul className="account-list">
            {profile.linkedAccounts.map(providerId => {
              const method = signInMethod(providerId);
              return (
                <li key={providerId}>
                  <span className="account-hotel-name">{"key" in method ? t(method.key) : method.label}</span>
                  <span className="status-pill live"><i />{t("socialAuth.linked")}</span>
                </li>
              );
            })}
            {/* Providers this hotel can use but the account has not joined yet (for example LINE), with a connect button. */}
            {unlinkedProviders.map(provider => {
              const method = signInMethod(provider);
              return (
                <li key={provider} data-testid={`account-connect-${provider}`}>
                  <span className="account-hotel-name">{"key" in method ? t(method.key) : method.label}</span>
                  <button type="button" className="button button-quiet button-small" disabled={connecting !== null} onClick={() => void connect(provider)}>
                    {t("socialAuth.connect")}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="account-note">{t("account.noSignIn")}</p>}
      </section>

      <section className="panel" aria-labelledby="account-hotels-heading">
        <div className="panel-heading"><div><h2 id="account-hotels-heading">{t("account.hotelsTitle")}</h2></div></div>
        <p className="account-note">{t("account.hotelsNote")}</p>
        {profile.ownedHotels.length ? (
          <ul className="account-list">
            {profile.ownedHotels.map(hotel => (
              <li key={hotel.id}>
                <div>
                  <Link href={`/hotels/${hotel.id}`} className="account-hotel-name">{hotel.name}</Link>
                  <div className="account-hotel-meta"><span>/{hotel.slug}</span></div>
                </div>
                <div className="account-hotel-meta">
                  <span className={`status-pill ${hotel.plan === "pro" ? "live" : hotel.plan === "trial" ? "pending" : "done"}`}><i />{t(planNameKey(hotel.plan))}</span>
                  {planHasEnd(hotel.plan, hotel.planEndsAt) && hotel.planEndsAt ? <span>{t("subscription.daysLeft", { days: hotel.daysLeft })} · {t("subscription.endsAt", { date: dateFormat.format(new Date(hotel.planEndsAt)) })}</span> : null}
                  <Link href={`/hotels/${hotel.id}/billing`} className="text-link">{t("subscription.changePlan")}</Link>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="account-note">{t("account.noHotels")}</p>}
      </section>
    </div>
  );
}

function AccountProfileEditor({ profile, onSaved }: { profile: { firstName: string | null; lastName: string | null; phone: string | null; email: string; emailVerified: boolean }; onSaved: () => void }) {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState(profile.firstName ?? "");
  const [lastName, setLastName] = useState(profile.lastName ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const first = firstName.trim();
    const last = lastName.trim();
    const number = phone.trim();
    if (!first || !last) {
      setError(t("account.nameRequired"));
      setSaved(false);
      return;
    }
    if (number && !/^[0-9+()\-\s]{7,24}$/.test(number)) {
      setError(t("account.phoneInvalid"));
      setSaved(false);
      return;
    }

    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const result = await authClient.updateUser({ name: `${first} ${last}`, firstName: first, lastName: last, phone: number });
      if (result.error) throw new Error(result.error.message || t("account.saveFailed"));
      setFirstName(first);
      setLastName(last);
      setPhone(number);
      setSaved(true);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("account.saveFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="account-edit-form" onSubmit={event => void save(event)}>
      <label>{t("account.firstName")}<input className="account-edit-input" autoComplete="given-name" maxLength={100} required placeholder={firstName ? undefined : t("account.notProvided")} value={firstName} onChange={event => setFirstName(event.target.value)} /></label>
      <label>{t("account.lastName")}<input className="account-edit-input" autoComplete="family-name" maxLength={100} required placeholder={lastName ? undefined : t("account.notProvided")} value={lastName} onChange={event => setLastName(event.target.value)} /></label>
      <label>{t("account.phone")}<input className="account-edit-input" autoComplete="tel" inputMode="tel" maxLength={24} placeholder={phone ? undefined : t("account.notProvided")} value={phone} onChange={event => setPhone(event.target.value)} /></label>
      <div className="account-edit-static"><span>{t("account.displayName")}</span><strong>{[firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || t("account.notProvided")}</strong></div>
      <div className="account-edit-static"><span>{t("account.email")}</span><strong>{profile.email}</strong><span className={`status-pill ${profile.emailVerified ? "live" : "pending"}`}><i />{profile.emailVerified ? t("account.emailVerified") : t("account.emailNotVerified")}</span></div>
      <div className="account-edit-actions">
        {error && <p className="form-error" role="alert">{error}</p>}
        {saved && <p className="account-edit-success" role="status">{t("account.saveSuccess")}</p>}
        <button className="button button-primary" type="submit" disabled={pending}>{pending ? t("account.saving") : t("account.save")}</button>
      </div>
    </form>
  );
}

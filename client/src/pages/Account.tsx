import { Link } from "wouter";
import PageState from "@/components/PageState";
import { useTranslation } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { planHasEnd, planNameKey, signInMethod, valueOrEmpty } from "./accountProfile";

export default function Account() {
  const { t, language } = useTranslation();
  const profileQuery = trpc.auth.profile.useQuery(undefined, { retry: false });
  const dateFormat = new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", { dateStyle: "medium" });

  if (profileQuery.isLoading) {
    return <div className="page-content"><PageState tone="loading" title={t("account.loadingTitle")} description={t("account.loadingDesc")} /></div>;
  }
  if (profileQuery.error || !profileQuery.data) {
    return <div className="page-content"><PageState tone="error" title={t("account.errorTitle")} description={profileQuery.error?.message ?? t("account.errorDesc")} actionLabel={t("account.retry")} onAction={() => void profileQuery.refetch()} actionPending={profileQuery.isFetching} /></div>;
  }

  const profile = profileQuery.data;
  const details: Array<[string, string | null]> = [
    [t("account.firstName"), valueOrEmpty(profile.firstName)],
    [t("account.lastName"), valueOrEmpty(profile.lastName)],
    [t("account.displayName"), valueOrEmpty(profile.name)],
    [t("account.phone"), valueOrEmpty(profile.phone)],
  ];

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
        <dl className="account-details">
          {details.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value ?? <span className="account-empty">{t("account.notProvided")}</span>}</dd></div>
          ))}
          <div>
            <dt>{t("account.email")}</dt>
            <dd>
              {profile.email}
              <span className={`status-pill ${profile.emailVerified ? "live" : "pending"}`}><i />{profile.emailVerified ? t("account.emailVerified") : t("account.emailNotVerified")}</span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel" aria-labelledby="account-signin-heading">
        <div className="panel-heading">
          <div><h2 id="account-signin-heading">{t("account.signInTitle")}</h2></div>
          <Link href="/settings/security" className="text-link">{t("account.manageSignIn")}</Link>
        </div>
        {profile.linkedAccounts.length ? (
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

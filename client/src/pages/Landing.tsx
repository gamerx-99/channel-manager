// Public marketing + pricing page for Good Hotel. Sits at /, ahead of the
// per-hotel slug route, and is the entry point for self-signup.
import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, CheckCircle2, Menu, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";

export default function Landing() {
  const [, navigate] = useLocation();
  const { t, language } = useTranslation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");

  const plansQuery = trpc.billing.plans.useQuery(undefined, { staleTime: 300_000 });

  return (
    <div className="public-page">
      <a className="public-skip-link" href="#landing-main">{t("landing.skipToContent")}</a>

      <header className="public-nav">
        <Link href="/" className="public-brand">
          <span className="brand-mark"><span /></span>
          <strong>Good Hotel</strong>
        </Link>
        <nav className="public-nav-links" aria-label={t("landing.navAriaLabel")}>
          <a href="#features">{t("landing.navFeatures")}</a>
          <a href="#pricing">{t("landing.navPricing")}</a>
          <a href="#faq">{t("landing.navFaq")}</a>
        </nav>
        <div className="public-nav-actions">
          <Link href="/login" className="button button-quiet">{t("landing.signIn")}</Link>
          <button
            type="button"
            className="button button-primary"
            onClick={() => navigate("/signup")}
          >
            {t("landing.startTrial")} <ArrowRight size={16} />
          </button>
        </div>
        <button
          type="button"
          className="icon-button public-nav-toggle"
          aria-expanded={mobileNavOpen}
          aria-label={t("landing.toggleNav")}
          onClick={() => setMobileNavOpen(open => !open)}
        >
          {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        {mobileNavOpen && (
          <div className="public-nav-mobile">
            <a href="#features" onClick={() => setMobileNavOpen(false)}>{t("landing.navFeatures")}</a>
            <a href="#pricing" onClick={() => setMobileNavOpen(false)}>{t("landing.navPricing")}</a>
            <a href="#faq" onClick={() => setMobileNavOpen(false)}>{t("landing.navFaq")}</a>
            <Link href="/login" onClick={() => setMobileNavOpen(false)}>{t("landing.signIn")}</Link>
          </div>
        )}
      </header>

      <main id="landing-main">
        <section className="public-hero">
          <div className="public-hero-copy">
            <div className="eyebrow">{t("landing.heroEyebrow")}</div>
            <h1>{t("landing.heroHeadline")}</h1>
            <p>{t("landing.heroLede")}</p>
            <div className="public-hero-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={() => navigate("/signup")}
              >
                {t("landing.startTrial")} <ArrowRight size={16} />
              </button>
              <a href="#pricing" className="button button-quiet">{t("landing.seePricing")}</a>
            </div>
            <p className="public-hero-note">{t("landing.trialNote", { days: 14 })}</p>
          </div>
        </section>

        <section id="features" className="public-section">
          <h2>{t("landing.featuresHeading")}</h2>
          <div className="public-feature-grid">
            {[
              { key: "directBooking", title: t("landing.featureDirectTitle"), body: t("landing.featureDirectBody") },
              { key: "calendarSync", title: t("landing.featureSyncTitle"), body: t("landing.featureSyncBody") },
              { key: "statutory", title: t("landing.featureStatutoryTitle"), body: t("landing.featureStatutoryBody") },
              { key: "payments", title: t("landing.featurePaymentsTitle"), body: t("landing.featurePaymentsBody") },
            ].map(feature => (
              <div key={feature.key} className="public-feature-card">
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="public-section">
          <h2>{t("landing.pricingHeading")}</h2>
          <p className="public-section-lede">{t("landing.pricingLede")}</p>

          <div className="public-cycle-toggle" role="group" aria-label={t("landing.cycleAriaLabel")}>
            <button
              type="button"
              className={cycle === "monthly" ? "is-active" : ""}
              aria-pressed={cycle === "monthly"}
              onClick={() => setCycle("monthly")}
            >
              {t("landing.cycleMonthly")}
            </button>
            <button
              type="button"
              className={cycle === "yearly" ? "is-active" : ""}
              aria-pressed={cycle === "yearly"}
              onClick={() => setCycle("yearly")}
            >
              {t("landing.cycleYearly")}
            </button>
          </div>

          {plansQuery.isLoading ? (
            <p className="public-section-note">{t("landing.pricingLoading")}</p>
          ) : plansQuery.error ? (
            <p className="form-error" role="alert">{t("landing.pricingError")}</p>
          ) : (
            <div className="public-plan-grid">
              {(plansQuery.data ?? []).map(plan => {
                const price = Number(
                  cycle === "yearly" ? plan.price_yearly : plan.price_monthly,
                );
                const rooms = plan.max_rooms;
                return (
                  <article key={plan.code} className="public-plan-card">
                    <h3>{language === "th" ? plan.name_th : plan.name_en}</h3>
                    <p className="public-plan-rooms">
                      {rooms == null ? t("landing.roomsUnlimited") : t("landing.roomsUpTo", { count: rooms })}
                    </p>
                    <p className="public-plan-price">
                      <span className="public-plan-amount">฿{price.toLocaleString()}</span>
                      <span className="public-plan-cycle">
                        {cycle === "yearly" ? t("landing.perYear") : t("landing.perMonth")}
                      </span>
                    </p>
                    <ul className="public-plan-features">
                      <li><CheckCircle2 size={14} /> {t("landing.featureDirectTitle")}</li>
                      <li><CheckCircle2 size={14} /> {t("landing.featureSyncTitle")}</li>
                      <li><CheckCircle2 size={14} /> {t("landing.featureStatutoryTitle")}</li>
                    </ul>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => navigate("/signup")}
                    >
                      {t("landing.startTrial")}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section id="faq" className="public-section">
          <h2>{t("landing.faqHeading")}</h2>
          <dl className="public-faq">
            <div>
              <dt>{t("landing.faqCostQ")}</dt>
              <dd>{t("landing.faqCostA")}</dd>
            </div>
            <div>
              <dt>{t("landing.faqTrialQ")}</dt>
              <dd>{t("landing.faqTrialA", { days: 14 })}</dd>
            </div>
            <div>
              <dt>{t("landing.faqMoneyQ")}</dt>
              <dd>{t("landing.faqMoneyA")}</dd>
            </div>
            <div>
              <dt>{t("landing.faqOtaQ")}</dt>
              <dd>{t("landing.faqOtaA")}</dd>
            </div>
          </dl>
        </section>

        <section className="public-cta">
          <h2>{t("landing.ctaHeading")}</h2>
          <p>{t("landing.ctaLede")}</p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => navigate("/signup")}
          >
            {t("landing.startTrial")} <ArrowRight size={16} />
          </button>
        </section>
      </main>

      <footer className="public-footer">
        <span>{t("landing.footerTagline")}</span>
        <nav aria-label={t("landing.footerNavAriaLabel")}>
          <Link href="/login">{t("landing.signIn")}</Link>
        </nav>
      </footer>
    </div>
  );
}
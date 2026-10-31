import React from "react";
import { ArrowRight, CalendarDays, Check, CreditCard, FileText, Globe, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";

const FEATURES = [
  { key: "Website", icon: Globe },
  { key: "Bookings", icon: CalendarDays },
  { key: "Payment", icon: CreditCard },
  { key: "Tm30", icon: FileText },
  { key: "Housekeeping", icon: Sparkles },
  { key: "Staff", icon: ShieldCheck },
] as const;

const STEPS = ["Signup", "Rooms", "Publish"] as const;

export default function Landing() {
  const { t } = useTranslation();
  const { toggleLanguage } = useLanguage();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const primaryHref = me.data ? "/dashboard" : "/signup";
  const primaryLabel = me.data ? t("landing.goToDashboard") : t("landing.signUp");

  return (
    <div className="landing-page">
      <a className="landing-skip-link" href="#landing-main">{t("landing.skipToContent")}</a>

      <header className="landing-nav">
        <Link href="/" className="login-brand"><span className="brand-mark"><span /></span><strong>hay<em>host</em></strong></Link>
        <nav className="landing-nav-links" aria-label={t("landing.navAriaLabel")}>
          <a href="#features">{t("landing.navFeatures")}</a>
          <a href="#how">{t("landing.navHow")}</a>
          <a href="#faq">{t("landing.navFaq")}</a>
        </nav>
        <div className="landing-nav-actions">
          <button type="button" className="landing-language" aria-label={t("landing.switchLanguageAria")} onClick={toggleLanguage}>{t("landing.switchLanguage")}</button>
          {!me.data && <Link href="/login" className="button button-quiet landing-sign-in">{t("landing.signIn")}</Link>}
          <Link href={primaryHref} className="button button-primary">{primaryLabel}</Link>
        </div>
      </header>

      <main id="landing-main">
        <section className="landing-hero">
          <div>
            <div className="eyebrow">{t("landing.heroEyebrow")}</div>
            <h1>{t("landing.heroHeadline")}</h1>
            <p>{t("landing.heroLede")}</p>
            <div className="landing-hero-actions">
              <Link href={primaryHref} className="button button-primary">{primaryLabel} <ArrowRight size={16} /></Link>
              <a href="#features" className="button button-quiet">{t("landing.heroSecondary")}</a>
            </div>
          </div>
          <aside className="landing-flow" aria-label={t("landing.flowLabel")}>
            <div className="eyebrow">{t("landing.flowLabel")}</div>
            <ol>
              {(["flowBook", "flowPay", "flowStay", "flowTm30"] as const).map(step => (
                <li key={step}><span><Check size={14} /></span>{t(`landing.${step}`)}</li>
              ))}
            </ol>
          </aside>
        </section>

        <section id="features" className="landing-section">
          <h2>{t("landing.featuresHeading")}</h2>
          <div className="landing-feature-grid">
            {FEATURES.map(({ key, icon: Icon }) => (
              <article key={key}>
                <Icon size={20} aria-hidden="true" />
                <h3>{t(`landing.feature${key}Title`)}</h3>
                <p>{t(`landing.feature${key}Body`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className="landing-section">
          <h2>{t("landing.howHeading")}</h2>
          <ol className="landing-steps">
            {STEPS.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                <h3>{t(`landing.how${step}Title`)}</h3>
                <p>{t(`landing.how${step}Body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="faq" className="landing-section">
          <h2>{t("landing.faqHeading")}</h2>
          <dl className="landing-faq">
            {(["Money", "Tech", "Public"] as const).map(item => (
              <div key={item}>
                <dt>{t(`landing.faq${item}Q`)}</dt>
                <dd>{t(`landing.faq${item}A`)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="landing-cta">
          <h2>{t("landing.ctaHeading")}</h2>
          <p>{t("landing.ctaLede")}</p>
          <Link href={primaryHref} className="button">{primaryLabel} <ArrowRight size={16} /></Link>
        </section>
      </main>

      <footer className="landing-footer">
        <span>{t("landing.footerTagline")}</span>
        <nav aria-label={t("landing.footerNavAriaLabel")}>
          <a href="mailto:support@hayhostth.com">support@hayhostth.com</a>
          <Link href="/login">{t("landing.signIn")}</Link>
        </nav>
      </footer>
    </div>
  );
}

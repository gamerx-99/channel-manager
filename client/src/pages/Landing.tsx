import React from "react";
import { ArrowRight, CalendarDays, Check, CreditCard, FileText, Globe, House, LockKeyhole, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";
import "./landingImages.css";

const VALUES = ["Website", "Direct", "Backoffice"] as const;
const FEATURES = [
  { key: "Calendar", icon: CalendarDays }, { key: "PromptPay", icon: CreditCard },
  { key: "Tm30", icon: FileText }, { key: "Housekeeping", icon: Sparkles },
  { key: "Staff", icon: Users }, { key: "Income", icon: ShieldCheck },
] as const;
const STEPS = ["Signup", "Rooms", "Publish"] as const;
const FAQS = ["Tech", "Money", "Mobile", "Cancel", "Privacy"] as const;
const TEMPLATES = ["minimal-white", "lanna-teak", "cafe-homestay"] as const;

function ProductMock() {
  const { t } = useTranslation();
  return <div className="landing-product" role="img" aria-label={t("landing.mockAria")} inert>
    <div className="landing-browser">
      <div className="landing-browser-bar"><span /><span /><span /><div><LockKeyhole size={13} /> hayhostth.com/your-stay</div></div>
      <div className="landing-site-preview">
        <img src="/landing/hero-theme-preview.jpg" alt="" width={1600} height={800} loading="eager" fetchPriority="high" />
      </div>
    </div>
    <div className="landing-admin-preview"><div className="landing-admin-top"><span><i />{t("landing.mockAvailability")}</span><span>{t("landing.mockMonth")}</span></div><div className="landing-calendar"><span>{t("landing.mockDay1")}<b>{t("landing.mockBooked")}</b></span><span>{t("landing.mockDay2")}<b>{t("landing.mockBooked")}</b></span><span>{t("landing.mockDay3")}<b>{t("landing.mockOpen")}</b></span><span>{t("landing.mockDay4")}<b>{t("landing.mockOpen")}</b></span></div><div className="landing-admin-note"><Check size={14}/>{t("landing.mockReady")}</div></div>
  </div>;
}

export default function Landing() {
  const { t } = useTranslation();
  const { toggleLanguage } = useLanguage();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const primaryHref = me.data ? "/dashboard" : "/signup";
  const primaryLabel = me.data ? t("landing.goToDashboard") : t("landing.signUp");
  const year = new Date().getFullYear();

  return <div className="landing-page landing-craft">
    <a className="landing-skip-link" href="#landing-main">{t("landing.skipToContent")}</a>
    <header className="landing-nav">
      <Link href="/" className="landing-logo"><img src="/logo-wide.png" alt="hayhost" /></Link>
      <nav className="landing-nav-links" aria-label={t("landing.navAriaLabel")}><a href="#features">{t("landing.navFeatures")}</a><a href="#pricing">{t("landing.navPricing")}</a><a href="#faq">{t("landing.navFaq")}</a></nav>
      <div className="landing-nav-actions">
        <button type="button" className="landing-language" aria-label={t("landing.switchLanguageAria")} onClick={toggleLanguage}>{t("landing.switchLanguage")}</button>
        {!me.isLoading && !me.data && <Link href="/login" className="landing-sign-in">{t("landing.signIn")}</Link>}
        <Link href={primaryHref} className="landing-nav-cta">{primaryLabel}</Link>
      </div>
    </header>
    <main id="landing-main">
      <section className="landing-hero landing-section-hero">
        <div className="landing-hero-copy"><div className="landing-kicker"><i />{t("landing.heroEyebrow")}</div><h1>{t("landing.heroHeadline")}</h1><p>{t("landing.heroLede")}</p><div className="landing-hero-actions"><Link href={primaryHref} className="landing-button landing-button-brick">{primaryLabel}<ArrowRight size={17}/></Link>{/* The demo button scrolls to the template previews; there is no public demo hotel since 2026-11-04. */}<a href="#templates" className="landing-button landing-button-outline">{t("landing.heroSecondary")}</a></div></div>
        <ProductMock />
      </section>
      <section className="landing-values" aria-label={t("landing.valueAria")}><div className="landing-value-grid">{VALUES.map((key, i) => { const Icon = [Globe, CreditCard, House][i]; return <article className="landing-value-card" key={key}><span className="landing-icon"><Icon size={23}/></span><h2>{t(`landing.value${key}Title`)}</h2><p>{t(`landing.value${key}Body`)}</p></article>; })}</div></section>
      <section id="templates" className="landing-section landing-template-section"><div className="landing-section-heading"><span className="landing-kicker">{t("landing.templatesEyebrow")}</span><h2>{t("landing.templatesHeading")}</h2><p>{t("landing.templatesLede")}</p></div><div className="landing-template-grid">{TEMPLATES.map((theme, i) => <article className="landing-template-card" key={theme}><img className="landing-template-shot" src={`/landing/theme-${theme}.jpg`} alt={t(`landing.template${i + 1}`)} width={960} height={600} loading="lazy" /><div><h3>{t(`landing.template${i + 1}`)}</h3><span>{t("landing.templateTag")}</span></div></article>)}</div></section>
      <section id="how" className="landing-section landing-steps-section"><div className="landing-section-heading"><span className="landing-kicker">{t("landing.stepsEyebrow")}</span><h2>{t("landing.howHeading")}</h2></div><ol className="landing-steps">{STEPS.map((step, index) => <li key={step}><span className="landing-step-number">0{index + 1}</span><h3>{t(`landing.how${step}Title`)}</h3></li>)}</ol></section>
      <section id="features" className="landing-section"><div className="landing-section-heading"><span className="landing-kicker">{t("landing.featuresEyebrow")}</span><h2>{t("landing.featuresHeading")}</h2></div><div className="landing-feature-grid">{FEATURES.map(({key, icon: Icon}) => <article key={key}><span className="landing-icon"><Icon size={21} aria-hidden="true"/></span><h3>{t(`landing.feature${key}Title`)}</h3><p>{t(`landing.feature${key}Body`)}</p></article>)}</div></section>
      <section id="pricing" className="landing-section landing-pricing-section"><div className="landing-section-heading"><span className="landing-kicker">{t("landing.pricingEyebrow")}</span><h2>{t("landing.pricingHeading")}</h2><p>{t("landing.pricingLede")}</p></div><div className="landing-pricing-grid">{(["Free", "Pro"] as const).map(plan => <article className={`landing-price-card landing-price-${plan.toLowerCase()}`} key={plan}><span className="landing-plan-name">{t(`landing.plan${plan}`)}</span><div className="landing-price">{plan === "Free" ? <><strong>0</strong><span>{t("landing.baht")}</span></> : <><strong>299</strong><span>{t("landing.bahtPerMonth")}</span></>}</div><ul>{(["Feature1", "Feature2", "Feature3", ...(plan === "Free" ? ["Feature4"] : [])] as string[]).map((item, i) => <li key={item}><Check size={17}/>{t(`landing.plan${plan}${item}`)}</li>)}</ul><Link href={primaryHref} className={plan === "Pro" ? "landing-button landing-button-brick" : "landing-button landing-button-outline"}>{primaryLabel}</Link></article>)}<article className="landing-price-card landing-price-business"><span className="landing-plan-name">{t("landing.planBusiness")}</span><div className="landing-price"><strong className="landing-price-contact">{t("landing.planBusinessPrice")}</strong></div><a href="mailto:contact@hayhostth.com" className="landing-button landing-button-outline">{t("landing.planBusinessCta")}</a></article></div></section>
      <section id="faq" className="landing-section landing-faq-section"><div className="landing-section-heading"><span className="landing-kicker">{t("landing.faqEyebrow")}</span><h2>{t("landing.faqHeading")}</h2></div><div className="landing-faq">{FAQS.map(item => <details key={item}><summary>{t(`landing.faq${item}Q`)}<span>+</span></summary><div>{t(`landing.faq${item}A`)}{item === "Privacy" && <> <Link href="/privacy">{t("landing.privacyLink")}</Link></>}</div></details>)}</div></section>
      <section className="landing-cta"><span className="landing-kicker">hayhost</span><h2>{t("landing.ctaHeading")}</h2><p>{t("landing.ctaLede")}</p><Link href={primaryHref} className="landing-button landing-button-light">{primaryLabel}<ArrowRight size={17}/></Link></section>
    </main>
    <footer className="landing-footer"><Link href="/" className="landing-logo"><img src="/logo-wide.png" alt="hayhost" /></Link><a href="mailto:contact@hayhostth.com">contact@hayhostth.com</a><nav aria-label={t("landing.footerNavAriaLabel")}><Link href="/terms">{t("legal.termsTitle")}</Link><Link href="/privacy">{t("legal.privacyTitle")}</Link><Link href="/dpa">{t("legal.dpaTitle")}</Link></nav><span>© {year} hayhost</span></footer>
  </div>;
}

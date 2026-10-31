import { escapeHtml } from "../../shared/escapeHtml";
import th from "../src/lib/i18n/th";

const SITE_URL = "https://www.hayhostth.com/";
const FEATURES = ["Website", "Bookings", "Payment", "Tm30", "Housekeeping", "Staff"] as const;
const STEPS = ["Signup", "Rooms", "Publish"] as const;
const FAQS = ["Money", "Tech", "Public"] as const;

type LandingCopy = typeof th.landing;

/**
 * The landing page as plain HTML for crawlers that do not run JavaScript.
 * React replaces it on mount, so it reuses the classes from Landing.tsx.
 */
export function renderLandingHtml(copy: LandingCopy = th.landing) {
  const text = (key: keyof LandingCopy) => escapeHtml(copy[key]);
  const features = FEATURES.map(key => `<article><h3>${text(`feature${key}Title`)}</h3><p>${text(`feature${key}Body`)}</p></article>`).join("");
  const steps = STEPS.map((step, index) => `<li><span>${index + 1}</span><h3>${text(`how${step}Title`)}</h3><p>${text(`how${step}Body`)}</p></li>`).join("");
  const faqs = FAQS.map(key => `<div><dt>${text(`faq${key}Q`)}</dt><dd>${text(`faq${key}A`)}</dd></div>`).join("");

  return `<div class="landing-page" id="static-landing"><main>
<section class="landing-hero"><div><div class="eyebrow">${text("heroEyebrow")}</div><h1>${text("heroHeadline")}</h1><p>${text("heroLede")}</p><div class="landing-hero-actions"><a class="button button-primary" href="/signup">${text("signUp")}</a></div></div></section>
<section class="landing-section"><h2>${text("featuresHeading")}</h2><div class="landing-feature-grid">${features}</div></section>
<section class="landing-section"><h2>${text("howHeading")}</h2><ol class="landing-steps">${steps}</ol></section>
<section class="landing-section"><h2>${text("faqHeading")}</h2><dl class="landing-faq">${faqs}</dl></section>
</main><footer class="landing-footer"><span>${text("footerTagline")}</span><nav><a href="mailto:support@hayhostth.com">support@hayhostth.com</a></nav></footer></div>`;
}

export function renderStructuredData(copy: LandingCopy = th.landing) {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "hayhost", url: SITE_URL, email: "support@hayhostth.com" },
      {
        "@type": "SoftwareApplication",
        name: "hayhost",
        url: SITE_URL,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: "th",
        areaServed: "TH",
        description: copy.footerTagline,
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map(key => ({
          "@type": "Question",
          name: copy[`faq${key}Q`],
          acceptedAnswer: { "@type": "Answer", text: copy[`faq${key}A`] },
        })),
      },
    ],
  };
  // "<" cannot appear raw, or a value could close the script element.
  return `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, "\\u003c")}</script>`;
}

import type { Language } from "@/contexts/LanguageContext";

/**
 * The Intl locale for showing dates in the UI language. Thai uses the Buddhist year
 * (พ.ศ.), as docs/thai-glossary.md requires; English uses day-month order.
 */
export function dateLocale(language: Language) {
  return language === "th" ? "th-TH" : "en-GB";
}

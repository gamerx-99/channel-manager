import React from "react";
import { useTranslation } from "@/lib/i18n";

/**
 * Language Toggle Switch — EN | TH
 * Sits in the topbar actions area (top-right).
 * Styled as a pill toggle: left side = EN, right side = TH.
 */
export default function LanguageSwitcher() {
  const { language, toggleLanguage } = useTranslation();
  const isEN = language === "en";

  return (
    <button
      type="button"
      className="lang-toggle"
      onClick={toggleLanguage}
      aria-label={isEN ? "Switch to Thai" : "Switch to English"}
      title={isEN ? "Switch to Thai" : "Switch to English"}
    >
      <span className={`lang-option ${isEN ? "lang-option--active" : ""}`}>EN</span>
      <span className="lang-divider" aria-hidden="true" />
      <span className={`lang-option ${!isEN ? "lang-option--active" : ""}`}>TH</span>
    </button>
  );
}

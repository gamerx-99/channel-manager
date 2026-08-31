import { Languages } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function LanguageSwitcher() {
  const { language, toggleLanguage } = useLanguage();
  return <button type="button" className="language-switcher" onClick={toggleLanguage} aria-label={language === "en" ? "เปลี่ยนเป็นภาษาไทย" : "Switch to English"} title={language === "en" ? "ภาษาไทย" : "English"}><Languages size={15} aria-hidden="true" /><span>{language === "en" ? "ไทย" : "EN"}</span></button>;
}

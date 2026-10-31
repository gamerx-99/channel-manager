import { createContext, useContext, useEffect, useState } from "react";

export type Language = "en" | "th";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
};

/**
 * Language before the visitor picks one (a stored choice always wins).
 * ASSUMPTION: the landing and signup pages are Thai; any other page follows the
 * browser's first language, Thai for th-*, otherwise English.
 */
export function pickInitialLanguage(pathname: string, browserLanguages: readonly (string | undefined)[]): Language {
  if (pathname === "/" || pathname === "/signup") return "th";
  return browserLanguages.find(Boolean)?.toLowerCase().startsWith("th") ? "th" : "en";
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children, defaultLanguage = "en" }: { children: React.ReactNode; defaultLanguage?: Language }) {
  const [language, setLanguage] = useState<Language>(() => {
    const stored = localStorage.getItem("language");
    return stored === "th" || stored === "en" ? stored : defaultLanguage;
  });

  useEffect(() => {
    localStorage.setItem("language", language);
    document.documentElement.lang = language;
  }, [language]);

  return <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage: () => setLanguage(current => current === "en" ? "th" : "en") }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}

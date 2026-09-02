import { useLanguage, type Language } from "@/contexts/LanguageContext";
import en, { type TranslationDictionary } from "./en";
import th from "./th";

const dictionaries: Record<Language, TranslationDictionary> = {
  en,
  th,
};

type NestedKeyOf<T, Prefix extends string = ""> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? NestedKeyOf<T[K], Prefix extends "" ? K : `${Prefix}.${K}`>
        : Prefix extends ""
        ? K
        : `${Prefix}.${K}`;
    }[keyof T & string]
  : never;

export type TranslationKey = NestedKeyOf<TranslationDictionary>;

function getNestedValue(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function translate(
  language: Language,
  key: string,
  params?: Record<string, string | number>
): string {
  const dict = dictionaries[language] || dictionaries.en;
  let text = getNestedValue(dict, key);

  if (text === undefined) {
    text = getNestedValue(dictionaries.en, key);
    if (text === undefined) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[i18n] Missing translation key: "${key}" for language "${language}"`);
      }
      return key;
    }
  }

  if (params) {
    return Object.entries(params).reduce(
      (acc, [paramKey, paramValue]) =>
        acc.replace(new RegExp(`\\{\\{${paramKey}\\}\\}|\\{${paramKey}\\}`, "g"), String(paramValue)),
      text
    );
  }

  return text;
}

export function useTranslation() {
  let language: Language = "en";
  let setLanguage: ((language: Language) => void) | undefined;
  let toggleLanguage: (() => void) | undefined;

  try {
    const langContext = useLanguage();
    language = langContext.language;
    setLanguage = langContext.setLanguage;
    toggleLanguage = langContext.toggleLanguage;
  } catch {
    // Graceful fallback if rendered outside LanguageProvider (e.g. in standalone test runs)
  }

  const t = (key: TranslationKey | (string & {}), params?: Record<string, string | number>) => {
    return translate(language, key, params);
  };

  return {
    t,
    language,
    setLanguage: setLanguage ?? (() => {}),
    toggleLanguage: toggleLanguage ?? (() => {}),
  };
}

export { en, th };
export type { TranslationDictionary };

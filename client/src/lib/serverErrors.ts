import { en, translate } from "./i18n";
import type { Language } from "@/contexts/LanguageContext";

// Server messages are English. Each `serverErrors` entry's English text is the exact
// server message, so translating one needs only a dictionary entry.
const keyByMessage = new Map<string, string>(Object.entries(en.serverErrors).map(([key, text]) => [text, `serverErrors.${key}`]));

/** The message in the viewer's language when it is a known server message; otherwise unchanged. */
export function localizeServerMessage(message: string, language: Language): string {
  const key = keyByMessage.get(message.trim());
  return key ? translate(language, key) : message;
}

/** The language the app shows, read the way LanguageProvider stores it. */
export function storedLanguage(): Language {
  try {
    return localStorage.getItem("language") === "th" ? "th" : "en";
  } catch {
    return "en";
  }
}

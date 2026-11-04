import type { Language } from "@/contexts/LanguageContext";
import { dateLocale } from "@/lib/dateLocale";

export type PlatformPlan = "trial" | "pro" | "free";

export function filterCrmRows<T extends { plan: string; province: string | null }>(rows: T[], plan: PlatformPlan | "all", province: string): T[] {
  const search = province.trim().toLocaleLowerCase();
  return rows.filter(row => (plan === "all" || row.plan === plan)
    && (!search || (row.province ?? "").toLocaleLowerCase().includes(search)));
}

export function formatPlatformDate(value: Date | string | null, language: Language) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(dateLocale(language), { dateStyle: "medium" }).format(new Date(value));
}

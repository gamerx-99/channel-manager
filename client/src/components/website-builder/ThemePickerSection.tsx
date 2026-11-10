import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HOTEL_THEMES, themeDisplay, type HotelThemeId } from "@shared/hotelThemes";
import TemplateCardPreview from "@/components/hotel-themes/TemplateCardPreview";

interface ThemePickerSectionProps {
  currentTheme?: HotelThemeId | string | null;
  canManage: boolean;
  isPending: boolean;
  previewHotelName?: string;
  selectedHotelHeroImage?: string | null;
  heroObjectPosition?: string | null;
  error?: string | null;
  onSelectTheme: (themeId: HotelThemeId) => void;
}

export function ThemePickerSection({
  currentTheme,
  canManage,
  isPending,
  previewHotelName = "",
  selectedHotelHeroImage = null,
  heroObjectPosition = null,
  error = null,
  onSelectTheme,
}: ThemePickerSectionProps) {
  const { t, language } = useTranslation();

  return (
    <Card className="overflow-hidden border-[var(--rule)] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
      <CardHeader className="border-b border-[var(--rule)] pb-4">
        <CardTitle className="text-lg text-[var(--ink)]">{t("websiteBuilder.themePickerTitle")}</CardTitle>
        <CardDescription>{t("websiteBuilder.themePickerDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label={t("websiteBuilder.themePickerTitle")}>
          {HOTEL_THEMES.map(theme => {
            const selected = currentTheme === theme.id;
            const display = themeDisplay(theme, language);
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => onSelectTheme(theme.id)}
                disabled={!canManage || isPending}
                aria-pressed={selected}
                data-theme-id={theme.id}
                className={`min-w-0 overflow-hidden rounded-xl border text-left transition ${selected ? "border-[var(--pine)] ring-2 ring-[var(--pine)]/20" : "border-[var(--rule)] hover:border-[var(--rule-strong)]"}`}
              >
                <TemplateCardPreview
                  theme={theme.id}
                  hotelName={previewHotelName}
                  photo={selectedHotelHeroImage}
                  objectPosition={heroObjectPosition}
                />
                <div className="space-y-1 p-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <span className="font-semibold text-[var(--ink)]">{display.brand}</span>
                      {theme.tier === "premium" ? (
                        <span className="rounded-full bg-[#f5eadf] px-2 py-0.5 text-[10px] font-semibold text-[#795548]">Pro</span>
                      ) : null}
                    </span>
                    {display.reading ? <span className="whitespace-nowrap text-xs text-[var(--ink-muted)]">{display.reading}</span> : null}
                  </div>
                  <p className="text-xs leading-5 text-[var(--ink-muted)]">{display.description}</p>
                  <p className="text-xs leading-5 text-[var(--ink-muted)]">{t("websiteBuilder.themeSuits")}: {display.suits}</p>
                  {selected ? (
                    <span className="text-xs font-semibold text-[var(--pine)]">{t("websiteBuilder.currentTheme")}</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

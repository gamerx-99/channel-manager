import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HOTEL_THEMES, type HotelThemeId } from "@shared/hotelThemes";
import TemplateCardPreview from "@/components/hotel-themes/TemplateCardPreview";

interface ThemePickerSectionProps {
  currentTheme?: HotelThemeId | string | null;
  canManage: boolean;
  isPending: boolean;
  previewHotelName?: string;
  selectedHotelHeroImage?: string | null;
  heroObjectPosition?: string | null;
  onSelectTheme: (themeId: HotelThemeId) => void;
}

export function ThemePickerSection({
  currentTheme,
  canManage,
  isPending,
  previewHotelName = "",
  selectedHotelHeroImage = null,
  heroObjectPosition = null,
  onSelectTheme,
}: ThemePickerSectionProps) {
  const { t } = useTranslation();

  return (
    <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
      <CardHeader className="border-b border-[#edf2ee] pb-4">
        <CardTitle className="text-lg text-[#263b31]">{t("websiteBuilder.themePickerTitle")}</CardTitle>
        <CardDescription>{t("websiteBuilder.themePickerDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label={t("websiteBuilder.themePickerTitle")}>
          {HOTEL_THEMES.map(theme => {
            const selected = currentTheme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => onSelectTheme(theme.id)}
                disabled={!canManage || isPending}
                aria-pressed={selected}
                data-theme-id={theme.id}
                className={`min-w-0 overflow-hidden rounded-xl border text-left transition ${selected ? "border-[#1d6b56] ring-2 ring-[#1d6b56]/20" : "border-[#e6eee9] hover:border-[#91b3a5]"}`}
              >
                <TemplateCardPreview
                  theme={theme.id}
                  hotelName={previewHotelName}
                  photo={selectedHotelHeroImage}
                  objectPosition={heroObjectPosition}
                />
                <div className="space-y-1 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#263b31]">{theme.name}</span>
                    {theme.tier === "premium" ? (
                      <span className="shrink-0 rounded-full bg-[#f5eadf] px-2 py-0.5 text-[10px] font-semibold text-[#795548]">Pro</span>
                    ) : null}
                  </div>
                  <p className="text-xs leading-5 text-[#6c7e75]">{theme.description}</p>
                  {selected ? (
                    <span className="text-xs font-semibold text-[#1d6b56]">{t("websiteBuilder.currentTheme")}</span>
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

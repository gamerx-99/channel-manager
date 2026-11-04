import { useTranslation } from "@/lib/i18n";
import { Eye } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getContrastText } from "@/lib/contrastText";
import type { SiteConfig } from "@/components/website-builder/websiteBuilderRules";
import type { CSSProperties } from "react";

interface PreviewSectionProps {
  config: SiteConfig;
  draft: SiteConfig;
  canManage: boolean;
  hotelName?: string;
  hotelAddress?: string | null;
  roomTypesCount?: number;
  heroImage?: string | null;
  previewAccentColor: string;
}

export function PreviewSection({
  config,
  draft,
  canManage,
  hotelName,
  hotelAddress,
  roomTypesCount = 0,
  heroImage,
  previewAccentColor,
}: PreviewSectionProps) {
  const { t } = useTranslation();

  if (!canManage) return null;

  const currentAccent = draft.accentColor || previewAccentColor;
  const currentHeroCopy = draft.heroCopy || config.heroCopy;

  return (
    <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
      <CardHeader className="border-b border-[#edf2ee] pb-4">
        <CardTitle className="flex items-center gap-2 text-lg text-[#263b31]">
          <Eye size={18} aria-hidden="true" /> {t("websiteBuilder.publicPreviewTitle")}
        </CardTitle>
        <CardDescription>{t("websiteBuilder.publicPreviewDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="overflow-hidden rounded-xl border border-[#e6eee9] bg-white">
          {config?.visibleSections?.hero ? (
            <div className="relative h-[220px] overflow-hidden bg-[#f6faf7]">
              {heroImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroImage}
                  alt={`Preview for ${hotelName ?? "hotel"}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-[#7a8c83]">
                  {t("websiteBuilder.noHeroImagePreview")}
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" aria-hidden="true" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h3 className="text-lg font-semibold text-white">{hotelName ?? "Your hotel preview"}</h3>
                <p className="mt-1 max-w-xl text-sm leading-6 text-white/90">{currentHeroCopy}</p>
                <span
                  className="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold wb-preview-accent"
                  style={{
                    "--wb-accent": currentAccent,
                    "--wb-accent-contrast": getContrastText(currentAccent),
                  } as CSSProperties}
                >
                  {t("websiteBuilder.viewRooms")}
                </span>
              </div>
            </div>
          ) : (
            <div className="px-4 py-3 text-xs text-[#7a8c83]">{t("websiteBuilder.heroSectionHidden")}</div>
          )}

          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {config?.visibleSections?.story ? (
              <div className="rounded-lg border border-[#e6eee9] bg-[#fbfdfb] p-3">
                <p className="text-xs font-semibold text-[#263b31]">{t("websiteBuilder.theHotel")}</p>
                <p className="mt-1 text-xs leading-5 text-[#6c7e75]">
                  {t("websiteBuilder.stayAt", { hotelName: hotelName ?? "this hotel" })}
                </p>
              </div>
            ) : null}
            {config?.visibleSections?.rooms ? (
              <div className="rounded-lg border border-[#e6eee9] bg-[#fbfdfb] p-3">
                <p className="text-xs font-semibold text-[#263b31]">{t("websiteBuilder.rooms")}</p>
                <p className="mt-1 text-xs leading-5 text-[#6c7e75]">
                  {t("websiteBuilder.roomsPreviewHint", { count: roomTypesCount })}
                </p>
              </div>
            ) : null}
            {config?.visibleSections?.booking ? (
              <div className="rounded-lg border border-[#e6eee9] bg-[#fbfdfb] p-3">
                <p className="text-xs font-semibold text-[#263b31]">{t("websiteBuilder.yourStay")}</p>
                <p className="mt-1 text-xs leading-5 text-[#6c7e75]">{t("websiteBuilder.bookingCardPreviewHint")}</p>
                <span
                  className="mt-2 inline-flex rounded-md px-2.5 py-1 text-xs font-semibold wb-preview-accent"
                  style={{
                    "--wb-accent": currentAccent,
                    "--wb-accent-contrast": getContrastText(currentAccent),
                  } as CSSProperties}
                >
                  {t("websiteBuilder.planVisit")}
                </span>
              </div>
            ) : null}
            {config?.visibleSections?.location ? (
              <div className="rounded-lg border border-[#e6eee9] bg-[#fbfdfb] p-3">
                <p className="text-xs font-semibold text-[#263b31]">{t("websiteBuilder.location")}</p>
                <p className="mt-1 text-xs leading-5 text-[#6c7e75]">{hotelAddress ?? t("websiteBuilder.addressFallback")}</p>
              </div>
            ) : null}
            {!Object.values(draft.visibleSections).some(Boolean) && (
              <div className="col-span-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t("websiteBuilder.allSectionsHidden")}
              </div>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-[#667a70]">
          {t("websiteBuilder.publicHotelFallbackNote")}
        </p>
      </CardContent>
    </Card>
  );
}

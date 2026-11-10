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
  heroObjectPosition?: string | null;
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
  heroObjectPosition,
  previewAccentColor,
}: PreviewSectionProps) {
  const { t } = useTranslation();

  // View-only users still see the preview; only editing is disabled elsewhere on the page.
  const name = hotelName?.trim() || t("websiteBuilder.yourHotelName");
  // The preview follows the switches the owner is changing now (the draft), not the saved config.
  const sections = draft.visibleSections;

  // previewAccentColor is already checked as a full hex colour; the raw draft value can be
  // half-typed (for example "#1"), and getContrastText throws on that, blanking the page.
  const currentAccent = previewAccentColor;
  const currentHeroCopy = draft.heroCopy || config.heroCopy;

  return (
    <Card className="overflow-hidden border-[var(--rule)] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
      <CardHeader className="border-b border-[var(--rule)] pb-4">
        <CardTitle className="flex items-center gap-2 text-lg text-[var(--ink)]">
          <Eye size={18} aria-hidden="true" /> {t("websiteBuilder.publicPreviewTitle")}
        </CardTitle>
        <CardDescription>{t("websiteBuilder.publicPreviewDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="overflow-hidden rounded-xl border border-[var(--rule)] bg-white">
          {sections.hero ? (
            <div className="relative h-[220px] overflow-hidden bg-[var(--paper)]">
              {heroImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroImage}
                  alt={name}
                  className="h-full w-full object-cover wb-object-position"
                  style={heroObjectPosition ? ({ "--wb-object-position": heroObjectPosition } as CSSProperties) : undefined}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-[var(--ink-muted)]">
                  {t("websiteBuilder.noHeroImagePreview")}
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" aria-hidden="true" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h3 className="text-lg font-semibold text-white">{name}</h3>
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
            <div className="px-4 py-3 text-xs text-[var(--ink-muted)]">{t("websiteBuilder.heroSectionHidden")}</div>
          )}

          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {sections.story ? (
              <div className="rounded-lg border border-[var(--rule)] bg-[var(--white)] p-3">
                <p className="text-xs font-semibold text-[var(--ink)]">{t("websiteBuilder.theHotel")}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">
                  {t("websiteBuilder.stayAt", { hotelName: name })}
                </p>
              </div>
            ) : null}
            {sections.rooms ? (
              <div className="rounded-lg border border-[var(--rule)] bg-[var(--white)] p-3">
                <p className="text-xs font-semibold text-[var(--ink)]">{t("websiteBuilder.rooms")}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">
                  {t("websiteBuilder.roomsPreviewHint", { count: roomTypesCount })}
                </p>
              </div>
            ) : null}
            {sections.booking ? (
              <div className="rounded-lg border border-[var(--rule)] bg-[var(--white)] p-3">
                <p className="text-xs font-semibold text-[var(--ink)]">{t("websiteBuilder.yourStay")}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{t("websiteBuilder.bookingCardPreviewHint")}</p>
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
            {sections.location ? (
              <div className="rounded-lg border border-[var(--rule)] bg-[var(--white)] p-3">
                <p className="text-xs font-semibold text-[var(--ink)]">{t("websiteBuilder.location")}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{hotelAddress ?? t("websiteBuilder.addressFallback")}</p>
              </div>
            ) : null}
            {!Object.values(sections).some(Boolean) && (
              <div className="col-span-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t("websiteBuilder.allSectionsHidden")}
              </div>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--ink-soft)]">
          {t("websiteBuilder.publicHotelFallbackNote")}
        </p>
      </CardContent>
    </Card>
  );
}

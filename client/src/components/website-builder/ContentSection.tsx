import { useTranslation } from "@/lib/i18n";
import { Palette } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SiteConfig } from "@/components/website-builder/websiteBuilderRules"
import { SectionsToggleSection } from "@/components/website-builder/SectionsToggleSection";

interface ContentSectionProps {
  draft: SiteConfig;
  setDraft: React.Dispatch<React.SetStateAction<SiteConfig>>;
  canManage: boolean;
  formError: string | null;
  saveNote: string | null;
  sectionLabels: Record<keyof SiteConfig["visibleSections"], { label: string; hint: string }>;
}

export function ContentSection({
  draft,
  setDraft,
  canManage,
  formError,
  saveNote,
  sectionLabels,
}: ContentSectionProps) {
  const { t } = useTranslation();

  return (
    <Card className="border-[var(--rule)] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
      <CardHeader className="border-b border-[var(--rule)] pb-4">
        <CardTitle className="flex items-center gap-2 text-lg text-[var(--ink)]">
          <Palette size={18} aria-hidden="true" /> {t("websiteBuilder.siteConfigTitle")}
        </CardTitle>
        <CardDescription>{t("websiteBuilder.siteConfigDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="form-grid pt-5">
        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
            {formError}
          </div>
        )}
        {saveNote && (
          <div className="rounded-lg border border-[var(--rule-strong)] bg-[var(--pine-soft)] px-3 py-2 text-xs text-[var(--pine)]" role="status">
            {saveNote}
          </div>
        )}
        {!canManage && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t("websiteBuilder.requiresManageProfile")}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="wb-hero-copy" className="text-xs text-[var(--ink-soft)]">
            {t("websiteBuilder.heroCopyLabel")}
          </Label>
          <Textarea
            id="wb-hero-copy"
            value={draft.heroCopy}
            onChange={e => setDraft(p => ({ ...p, heroCopy: e.target.value }))}
            disabled={!canManage}
            className="min-h-[96px] border-[var(--rule)]"
            placeholder={t("websiteBuilder.heroCopyPlaceholder")}
            maxLength={500}
            aria-label="hero_copy"
          />
          <p className="text-[11px] text-[var(--ink-muted)]">{draft.heroCopy.length} / 500</p>
        </div>

        <div className="space-y-3">
          <Label className="text-xs text-[var(--ink-soft)]">{t("websiteBuilder.visibleSectionsLabel")}</Label>
          <SectionsToggleSection
            visibleSections={draft.visibleSections}
            sectionLabels={sectionLabels}
            canManage={canManage}
            onToggle={(key, v) => setDraft(p => ({ ...p, visibleSections: { ...p.visibleSections, [key]: v } }))}
          />
          <p className="text-[11px] text-[var(--ink-muted)]">{t("websiteBuilder.visibleSectionsHint")}</p>
        </div>

      </CardContent>
    </Card>
  );
}

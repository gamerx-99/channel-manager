import { useTranslation } from "@/lib/i18n";
import { Palette, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isValidHexColor, type SiteConfig } from "@/components/website-builder/websiteBuilderRules";
import { SectionsToggleSection } from "@/components/website-builder/SectionsToggleSection";

interface ContentSectionProps {
  draft: SiteConfig;
  setDraft: React.Dispatch<React.SetStateAction<SiteConfig>>;
  canManage: boolean;
  formError: string | null;
  saveNote: string | null;
  sectionLabels: Record<keyof SiteConfig["visibleSections"], { label: string; hint: string }>;
  isSavePending: boolean;
  isPublishPending: boolean;
  isDiscardPending: boolean;
  hasStoredDraft: boolean;
  onSave: () => void;
  onPublish: () => void;
  onDiscard: () => void;
}

export function ContentSection({
  draft,
  setDraft,
  canManage,
  formError,
  saveNote,
  sectionLabels,
  isSavePending,
  isPublishPending,
  isDiscardPending,
  hasStoredDraft,
  onSave,
  onPublish,
  onDiscard,
}: ContentSectionProps) {
  const { t } = useTranslation();

  return (
    <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
      <CardHeader className="border-b border-[#edf2ee] pb-4">
        <CardTitle className="flex items-center gap-2 text-lg text-[#263b31]">
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
          <div className="rounded-lg border border-[#cfe3d8] bg-[#edf7f1] px-3 py-2 text-xs text-[#1d6b56]" role="status">
            {saveNote}
          </div>
        )}
        {!canManage && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t("websiteBuilder.requiresManageProfile")}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="wb-hero-copy" className="text-xs text-[#52655b]">
            {t("websiteBuilder.heroCopyLabel")}
          </Label>
          <Textarea
            id="wb-hero-copy"
            value={draft.heroCopy}
            onChange={e => setDraft(p => ({ ...p, heroCopy: e.target.value }))}
            disabled={!canManage}
            className="min-h-[96px] border-[#dce4df]"
            placeholder={t("websiteBuilder.heroCopyPlaceholder")}
            maxLength={500}
            aria-label="hero_copy"
          />
          <p className="text-[11px] text-[#778a80]">{draft.heroCopy.length} / 500</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wb-accent-color" className="text-xs text-[#52655b]">
            {t("websiteBuilder.accentColorLabel")}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="wb-accent-color"
              type="color"
              value={isValidHexColor(draft.accentColor) ? draft.accentColor : "#1d6b56"}
              onChange={e => setDraft(p => ({ ...p, accentColor: e.target.value }))}
              disabled={!canManage}
              className="h-9 w-14 border-[#dce4df] p-1"
              aria-label="accent_color picker"
            />
            <Input
              placeholder="#1d6b56"
              value={draft.accentColor}
              onChange={e => setDraft(p => ({ ...p, accentColor: e.target.value }))}
              disabled={!canManage}
              className="flex-1 border-[#dce4df] font-mono text-sm"
              aria-label="accent_color"
            />
          </div>
          <p className="text-[11px] text-[#778a80]">{t("websiteBuilder.accentColorHint")}</p>
        </div>

        <div className="space-y-3">
          <Label className="text-xs text-[#52655b]">{t("websiteBuilder.visibleSectionsLabel")}</Label>
          <SectionsToggleSection
            visibleSections={draft.visibleSections}
            sectionLabels={sectionLabels}
            canManage={canManage}
            onToggle={(key, v) => setDraft(p => ({ ...p, visibleSections: { ...p.visibleSections, [key]: v } }))}
          />
          <p className="text-[11px] text-[#778a80]">{t("websiteBuilder.visibleSectionsHint")}</p>
        </div>

        <Button
          type="button"
          onClick={onSave}
          disabled={!canManage || isSavePending}
          className="form-submit button button-primary w-full"
        >
          <Save size={15} /> {t("websiteBuilder.saveDraft")}
        </Button>
        <Button
          type="button"
          onClick={onPublish}
          disabled={!canManage || !hasStoredDraft || isPublishPending}
          className="button button-primary w-full"
        >
          {t("websiteBuilder.publishChanges")}
        </Button>
        {/* ASSUMPTION: explicit confirmation is sufficient protection for discarding the saved draft. */}
        {hasStoredDraft && (
          <Button
            type="button"
            variant="outline"
            disabled={!canManage || isDiscardPending}
            onClick={onDiscard}
            className="w-full"
          >
            {t("websiteBuilder.discardDraft")}
          </Button>
        )}
        <p className="text-xs leading-5 text-[#778a80]">
          {t("websiteBuilder.publishNote")}
        </p>
      </CardContent>
    </Card>
  );
}

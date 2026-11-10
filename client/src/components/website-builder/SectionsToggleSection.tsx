import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SiteConfig } from "@/components/website-builder/websiteBuilderRules";

interface SectionsToggleSectionProps {
  visibleSections: SiteConfig["visibleSections"];
  sectionLabels: Record<keyof SiteConfig["visibleSections"], { label: string; hint: string }>;
  canManage: boolean;
  onToggle: (key: keyof SiteConfig["visibleSections"], value: boolean) => void;
}

export function SectionsToggleSection({
  visibleSections,
  sectionLabels,
  canManage,
  onToggle,
}: SectionsToggleSectionProps) {
  const sectionKeys: Array<keyof SiteConfig["visibleSections"]> = ["hero", "story", "rooms", "booking", "location"];

  return (
    <div className="space-y-2 rounded-xl border border-[var(--rule)] bg-[var(--white)] p-3">
      {sectionKeys.map(key => (
        <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--rule)] bg-white px-3 py-2.5">
          <span>
            <span className="text-sm font-medium text-[var(--ink)]">{sectionLabels[key]?.label ?? key}</span>
            <span className="ml-2 text-xs text-[var(--ink-muted)]">{sectionLabels[key]?.hint ?? ""}</span>
          </span>
          <Switch
            checked={Boolean(visibleSections[key])}
            onCheckedChange={v => onToggle(key, v)}
            disabled={!canManage}
            aria-label={`visible_sections ${key}`}
          />
        </label>
      ))}
    </div>
  );
}

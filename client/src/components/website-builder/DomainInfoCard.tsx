import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DomainInfoCard() {
  const { t } = useTranslation();

  return (
    <Card className="border-[var(--rule)] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
      <CardHeader className="border-b border-[var(--rule)] pb-4">
        <CardTitle className="text-sm text-[var(--ink)]">{t("websiteBuilder.aboutDomainsTitle")}</CardTitle>
        <CardDescription>{t("websiteBuilder.aboutDomainsDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <p className="text-xs leading-5 text-[var(--ink-muted)]">
          {t("websiteBuilder.aboutDomainsBody")}
        </p>
        {/* Custom domain management (hotel_domains table integration) is deferred per DECISIONS.md */}
      </CardContent>
    </Card>
  );
}

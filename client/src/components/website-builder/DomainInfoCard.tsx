import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DomainInfoCard() {
  const { t } = useTranslation();

  return (
    <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
      <CardHeader className="border-b border-[#edf2ee] pb-4">
        <CardTitle className="text-sm text-[#263b31]">{t("websiteBuilder.aboutDomainsTitle")}</CardTitle>
        <CardDescription>{t("websiteBuilder.aboutDomainsDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <p className="text-xs leading-5 text-[#6c7e75]">
          {t("websiteBuilder.aboutDomainsBody")}
        </p>
        {/* Custom domain management (hotel_domains table integration) is deferred per DECISIONS.md */}
      </CardContent>
    </Card>
  );
}

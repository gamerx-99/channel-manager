import { ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n";

// Slips are checked with one central SlipOK account (spec 14-05), so a hotel
// never enters a SlipOK key. The only payment setting a hotel owns is its
// PromptPay ID, which lives on the Financials page.
export default function SlipOkSettings() {
  const { t } = useTranslation();
  return (
    <section aria-label={t("slipOk.title")} className="border-t border-[#dce4df] pt-7">
      <div className="mb-4">
        <p className="eyebrow">{t("slipOk.eyebrow")}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#1b2c25]">{t("slipOk.title")}</h2>
      </div>
      <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
        <CardContent className="flex items-start gap-3 p-6">
          <span className="rounded-xl bg-[#edf7f1] p-2 text-[#1d6b56]"><ShieldCheck size={18} aria-hidden="true" /></span>
          <div className="text-sm text-[#456156]">
            <p id="slipok-central-note">{t("slipOk.centralNote")}</p>
            <p className="mt-2">
              {t("slipOk.promptPayHint")}{" "}
              <Link href="/dashboard/financials" className="text-[#1d6b56] underline">{t("slipOk.openFinancials")}</Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

import DeleteAccountSettings from "@/components/DeleteAccountSettings";
import MfaSettings from "@/components/MfaSettings";
import SlipOkSettings from "@/components/SlipOkSettings";
import { useTranslation } from "@/lib/i18n";

export default function SecuritySettings() {
  const { t } = useTranslation();

  return (
    <div className="page-content">
      <section className="page-intro intro-split">
        <div>
          <div className="eyebrow">{t("securitySettings.eyebrow")}</div>
          <h1>
            {t("securitySettings.title")}<span className="title-mark">.</span>
          </h1>
          <p className="lede">{t("securitySettings.lede")}</p>
        </div>
      </section>
      <MfaSettings />
      <SlipOkSettings />
      <DeleteAccountSettings />
    </div>
  );
}

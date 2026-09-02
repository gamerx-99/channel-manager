import { useParams } from "wouter";
import MfaSettings from "@/components/MfaSettings";
import SlipOkSettings from "@/components/SlipOkSettings";
import { useHotel } from "@/contexts/HotelContext";
import { useTranslation } from "@/lib/i18n";

export default function SecuritySettings() {
  const { t } = useTranslation();
  const { selectedHotel } = useHotel();
  const hotelId = useParams<{ hotelId?: string }>().hotelId || selectedHotel?.id;

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
      {hotelId && <SlipOkSettings hotelId={hotelId} />}
    </div>
  );
}

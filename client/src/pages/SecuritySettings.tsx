import { hasHotelPermission } from "@shared/authorization";
import DeleteAccountSettings from "@/components/DeleteAccountSettings";
import LinkedAccountsSettings from "@/components/LinkedAccountsSettings";
import MfaSettings from "@/components/MfaSettings";
import PasskeySettings from "@/components/PasskeySettings";
import { useHotel } from "@/contexts/HotelContext";
import { useTranslation } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import "./security-page.css";

export default function SecuritySettings() {
  const { t } = useTranslation();
  const { selectedHotel } = useHotel();
  const authMeQuery = trpc.auth.me.useQuery();
  const hotelId = selectedHotel?.id;
  const canManageSlipOk = Boolean(hotelId) && hasHotelPermission(authMeQuery.data?.roles ?? [], authMeQuery.data?.memberships ?? [], hotelId!, "property.manage_profile");

  return (
    <div className="page-content security-page">
      <section className="page-intro intro-split">
        <div>
          <div className="eyebrow">{t("securitySettings.eyebrow")}</div>
          <h1>
            {t("securitySettings.title")}<span className="title-mark">.</span>
          </h1>
          <p className="lede">{t("securitySettings.lede")}</p>
        </div>
      </section>
      <PasskeySettings />
      <MfaSettings />
      <LinkedAccountsSettings />
      {/* Slip checking moved to the hotel's finance settings; a card, not a stray line between cards. */}
      {hotelId && canManageSlipOk && (
        <section className="panel" aria-label={t("hotelPaymentSettings.manageLink")}>
          <div className="panel-body security-payment-link">
            <p className="field-help">{t("securitySettings.paymentMoved")}</p>
            <Link href={`/hotels/${hotelId}/settings/finance`} className="button button-quiet">{t("hotelPaymentSettings.manageLink")}</Link>
          </div>
        </section>
      )}
      <DeleteAccountSettings />
    </div>
  );
}

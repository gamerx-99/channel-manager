import { hasHotelPermission } from "@shared/authorization";
import DeleteAccountSettings from "@/components/DeleteAccountSettings";
import LinkedAccountsSettings from "@/components/LinkedAccountsSettings";
import { useHotel } from "@/contexts/HotelContext";
import { useTranslation } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

export default function SecuritySettings() {
  const { t } = useTranslation();
  const { selectedHotel } = useHotel();
  const authMeQuery = trpc.auth.me.useQuery();
  const hotelId = selectedHotel?.id;
  const canManageSlipOk = Boolean(hotelId) && hasHotelPermission(authMeQuery.data?.roles ?? [], authMeQuery.data?.memberships ?? [], hotelId!, "property.manage_profile");

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
      <LinkedAccountsSettings />
      {hotelId && canManageSlipOk && <p className="field-help"><Link href={`/hotels/${hotelId}/settings/finance`}>{t("hotelPaymentSettings.manageLink")}</Link></p>}
      <DeleteAccountSettings />
    </div>
  );
}

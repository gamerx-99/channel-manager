import { hasHotelPermission } from "@shared/authorization";
import DeleteAccountSettings from "@/components/DeleteAccountSettings";
import HotelClosureSettings from "@/components/HotelClosureSettings";
import MfaSettings from "@/components/MfaSettings";
import SlipOkSettings from "@/components/SlipOkSettings";
import { useHotel } from "@/contexts/HotelContext";
import { useTranslation } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

export default function SecuritySettings() {
  const { t } = useTranslation();
  const { selectedHotel } = useHotel();
  const authMeQuery = trpc.auth.me.useQuery();
  const hotelId = selectedHotel?.id;
  const canManageSlipOk = Boolean(hotelId) && hasHotelPermission(authMeQuery.data?.roles ?? [], authMeQuery.data?.memberships ?? [], hotelId!, "property.manage_profile");
  const canCloseHotel = Boolean(hotelId) && hasHotelPermission(authMeQuery.data?.roles ?? [], authMeQuery.data?.memberships ?? [], hotelId!, "property.close_hotel");

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
      {hotelId && canManageSlipOk && <SlipOkSettings hotelId={hotelId} />}
      {hotelId && canCloseHotel && <HotelClosureSettings hotelId={hotelId} hotelName={selectedHotel!.name} />}
      <DeleteAccountSettings />
    </div>
  );
}

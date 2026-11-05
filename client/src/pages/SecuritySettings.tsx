import { hasHotelPermission } from "@shared/authorization";
import DeleteAccountSettings from "@/components/DeleteAccountSettings";
import LinkedAccountsSettings from "@/components/LinkedAccountsSettings";
import HotelClosureSettings from "@/components/HotelClosureSettings";
import SlipOkSettings from "@/components/SlipOkSettings";
import { useHotel } from "@/contexts/HotelContext";
import { useTranslation } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

export default function SecuritySettings() {
  const { t, language } = useTranslation();
  const { selectedHotel } = useHotel();
  const authMeQuery = trpc.auth.me.useQuery();
  const hotelId = selectedHotel?.id;
  const canManageSlipOk = Boolean(hotelId) && hasHotelPermission(authMeQuery.data?.roles ?? [], authMeQuery.data?.memberships ?? [], hotelId!, "property.manage_profile");
  const canCloseHotel = Boolean(hotelId) && hasHotelPermission(authMeQuery.data?.roles ?? [], authMeQuery.data?.memberships ?? [], hotelId!, "property.close_hotel");
  const ownerBilling = authMeQuery.data?.memberships?.find(item => item.hotelId === hotelId && item.role === 'hotel_owner' && item.permissions.includes('property.manage_billing'));
  const planState = trpc.subscriptionBilling.state.useQuery({ hotelId: hotelId ?? '' }, { enabled: Boolean(ownerBilling && hotelId) });

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
      {hotelId && canManageSlipOk && <SlipOkSettings hotelId={hotelId} />}
      {ownerBilling && selectedHotel && <section className="panel home-plan-card"><div className="panel-heading"><div><div className="eyebrow">{t('subscription.currentPlan')}</div><h2>{planState.data ? t(`subscription.${planState.data.plan}`) : t('common.loading')}</h2></div><span className="status-pill live">{planState.data?.daysLeft ? t('subscription.daysLeft', { days: planState.data.daysLeft }) : ''}</span></div><p>{planState.data?.endsAt ? t('subscription.endsAt', { date: new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium' }).format(new Date(planState.data.endsAt)) }) : t('subscription.freeNoExpiry')}</p><Link href={`/hotels/${selectedHotel.id}/billing`} className="button button-primary">{t('subscription.changePlan')}</Link></section>}
      {hotelId && canCloseHotel && <HotelClosureSettings hotelId={hotelId} hotelName={selectedHotel!.name} />}
      <DeleteAccountSettings />
    </div>
  );
}

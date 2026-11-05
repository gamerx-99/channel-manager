import { useTranslation } from "@/lib/i18n";
import { Link } from "wouter";
import { useHotel } from "@/contexts/HotelContext";
import { trpc } from "@/lib/trpc";
import { hasHotelPermission } from "@shared/authorization";
import "./gettingStarted.css";

export default function GettingStarted() {
  const { t } = useTranslation();
  const { selectedHotelId } = useHotel();
  const { data: me } = trpc.auth.me.useQuery();
  const canManageSupport = Boolean(selectedHotelId && me && hasHotelPermission(me.roles ?? [], me.memberships ?? [], selectedHotelId, "property.manage_support_access"));
  return <main className="page-content getting-started"><section className="page-intro"><div><div className="eyebrow">{t("guidedTour.helpEyebrow")}</div><h1>{t("guidedTour.helpTitle")}<span className="title-mark">.</span></h1><p className="lede">{t("guidedTour.helpLede")}</p></div></section>
    <section className="panel"><div className="panel-heading"><h2>{t("guidedTour.hotelTitle")}</h2></div><p>{t("guidedTour.hotelBody")}</p><p>{t("guidedTour.hotelAction")}</p></section>
    <section className="panel"><div className="panel-heading"><h2>{t("guidedTour.roomTitle")}</h2></div><p>{t("guidedTour.roomBody")}</p><p>{t("guidedTour.roomAction")}</p></section>
    <section className="panel"><div className="panel-heading"><h2>{t("guidedTour.problemsTitle")}</h2></div><ul><li>{t("guidedTour.problemHotel")}</li><li>{t("guidedTour.problemRoom")}</li><li>{t("guidedTour.problemPublish")}</li></ul></section>
    <section className="panel"><div className="panel-heading"><h2>{t("guidedTour.askHelpTitle")}</h2></div><p>{t("guidedTour.askHelpBody")} <a href="mailto:support@hayhostth.com">support@hayhostth.com</a></p>{canManageSupport && selectedHotelId && <p>{t("guidedTour.supportAccessHint")} <Link href={`/hotels/${selectedHotelId}/support-access`}>{t("guidedTour.supportAccessLink")}</Link></p>}</section>
  </main>;
}

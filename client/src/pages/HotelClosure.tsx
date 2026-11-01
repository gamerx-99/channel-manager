import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import HotelDataExportButton from "@/components/HotelDataExportButton";
import { useTranslation } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

export const HOTEL_CLOSURE_PATH = "/hotel-closure";
const SEEN_KEY = "hotel-closure-seen";

/** The owner answers once per sign-in session; signing in alone never cancels a closure. */
export function HotelClosureRedirect() {
  const [location, navigate] = useLocation();
  const closures = trpc.hotelClosure.mine.useQuery();
  const waiting = closures.data?.some(closure => closure.can_cancel) ?? false;
  useEffect(() => {
    if (waiting && location !== HOTEL_CLOSURE_PATH && sessionStorage.getItem(SEEN_KEY) !== "1") navigate(HOTEL_CLOSURE_PATH);
  }, [waiting, location, navigate]);
  return null;
}

export default function HotelClosure() {
  const { t, language } = useTranslation();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const closures = trpc.hotelClosure.mine.useQuery();
  const cancel = trpc.hotelClosure.cancel.useMutation({ onSuccess: () => queryClient.invalidateQueries() });
  const formatDate = (value: Date | string) => new Date(value).toLocaleDateString(language === "th" ? "th-TH" : "en-GB", { dateStyle: "long" });

  function continueClosing() {
    sessionStorage.setItem(SEEN_KEY, "1");
    navigate("/dashboard");
  }

  return (
    <div className="page-content" data-testid="hotel-closure-page">
      <section className="page-intro">
        <div className="eyebrow">{t("hotelClosure.eyebrow")}</div>
        <h1>{t("hotelClosure.statusTitle")}<span className="title-mark">.</span></h1>
      </section>
      {closures.isError && <div className="form-error" role="alert">{t("hotelClosure.loadFailed")}</div>}
      {closures.data?.length === 0 && <p className="lede">{t("hotelClosure.none")} <Link href="/dashboard">{t("hotelClosure.back")}</Link></p>}
      {closures.data?.map(closure => (
        <section key={closure.id} className="panel" data-testid="hotel-closure-row" style={{ marginTop: 18, padding: 22 }}>
          <h2>{closure.name}</h2>
          <p>{closure.can_cancel ? t("hotelClosure.waiting", { date: formatDate(closure.serviceEndsAt) }) : t("hotelClosure.ended", { date: formatDate(closure.serviceEndsAt) })}</p>
          <p>{closure.can_export ? t("hotelClosure.exportUntil", { date: formatDate(closure.exportEndsAt) }) : t("hotelClosure.exportOver")}</p>
          <p>{t("hotelClosure.purgeOn", { date: formatDate(closure.purgeAt) })}</p>
          {closure.can_export && <HotelDataExportButton hotelId={closure.id} hotelName={closure.name} />}
          {closure.can_cancel && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              <button type="button" className="button button-primary" disabled={cancel.isPending} onClick={() => cancel.mutate({ hotel_id: closure.id })}>{t("hotelClosure.cancel")}</button>
              <button type="button" className="button button-quiet" onClick={continueClosing}>{t("hotelClosure.continue")}</button>
            </div>
          )}
          {cancel.isError && <div className="form-error" role="alert">{t("hotelClosure.errorCancel")}</div>}
        </section>
      ))}
    </div>
  );
}

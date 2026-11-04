import { Link, useParams } from "wouter";
import { useMemo, useState } from "react";
import { generateQrDataUrl } from "@/lib/qr";
import { ArrowLeft, CheckCircle2, QrCode } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";
import { dateLocale } from "@/lib/dateLocale";
import { billingErrorKey, useSubscriptionPlan } from "./useSubscriptionPlan";
import "./subscriptionPlan.css";

// Drawn locally from the EMVCo payload, like the guest booking QR (PaymentQR.tsx):
// the PromptPay ID and amount never go to an outside QR image service.
function PromptPayQr({ value }: { value: string }) {
  const src = useMemo(() => generateQrDataUrl(value), [value]);
  return <img className="subscription-qr-image" src={src} width={260} height={260} alt="QR Code สำหรับชำระเงินผ่าน PromptPay" />;
}

export default function SubscriptionPlan() {
  const { id: hotelId = "" } = useParams<{ id: string }>();
  const { t, language } = useTranslation();
  const state = trpc.subscriptionBilling.state.useQuery({ hotelId }, { enabled: Boolean(hotelId) });
  const billing = useSubscriptionPlan(hotelId);
  const [slip, setSlip] = useState<File | null>(null);
  const formatDate = (date: Date | string | null) => date ? new Intl.DateTimeFormat(dateLocale(language), { dateStyle: "long" }).format(new Date(date)) : "—";
  return <div className="page-content subscription-page">
    <section className="page-intro intro-split"><div><div className="eyebrow">{t("subscription.eyebrow")}</div><h1>{t("subscription.title")}<span className="title-mark">.</span></h1><p className="lede">{t("subscription.lede")}</p></div><Link href="/dashboard" className="button button-quiet"><ArrowLeft size={16}/>{t("subscription.back")}</Link></section>
    <section className="subscription-columns">
      <article className="panel subscription-plan-card"><div className="panel-heading"><div><div className="eyebrow">{t("subscription.currentPlan")}</div><h2>{state.data ? t(`subscription.${state.data.plan}`) : t("common.loading")}</h2></div><span className="status-pill live">{state.data?.plan === "pro" ? t("subscription.pro") : t("subscription.activePlan")}</span></div>
        {state.data && <><p>{t("subscription.daysLeft", { days: state.data.daysLeft })}</p><p className="subscription-end">{t("subscription.endsAt", { date: formatDate(state.data.endsAt) })}</p></>}
        <div className="subscription-price"><strong>299</strong><span>{t("subscription.bahtPerMonth")}</span></div><p className="field-help">{t("subscription.priceNote")}</p>
      </article>
      <section className="panel subscription-checkout"><div className="panel-heading"><div><div className="eyebrow">{t("subscription.checkout")}</div><h2>{t("subscription.chooseDuration")}</h2></div></div>
        <div className="form-grid"><label>{t("subscription.months")}<select value={billing.months} onChange={event => billing.selectMonths(event.target.value)}>{[1, 3, 6, 12].map(month => <option key={month} value={month}>{t("subscription.monthOption", { count: month })}</option>)}</select></label>
          <label>{t("subscription.coupon")}<input value={billing.couponCode} onChange={event => billing.applyCoupon(event.target.value)} placeholder={t("subscription.couponPlaceholder")}/></label></div>
        {billing.quote.data && <div className="subscription-quote" aria-live="polite"><span>{t("subscription.listPrice")}</span><strong>{billing.quote.data.listAmount.toFixed(2)} ฿</strong><span>{t("subscription.discount")}</span><strong>−{billing.quote.data.discountAmount.toFixed(2)} ฿</strong><span>{t("subscription.amountDue")}</span><strong>{billing.quote.data.amount.toFixed(2)} ฿</strong></div>}
        {billing.error && <p className="form-error" role="alert">{billingErrorKey(billing.error) ? t(`subscription.${billingErrorKey(billing.error)}`) : billing.error}</p>}
        {billing.payment?.status === "pending" && billing.payment.qr && <div className="subscription-qr"><PromptPayQr value={billing.payment.qr}/><p>{t("subscription.scanQr")}</p><label>{t("subscription.uploadSlip")}<input type="file" accept="image/*" onChange={event => setSlip(event.target.files?.[0] ?? null)}/></label><button className="button button-primary" disabled={!slip || billing.verifyPending} onClick={() => slip && void billing.uploadSlip(slip)}>{t("subscription.verifySlip")}</button></div>}
        {billing.payment?.status === "verified" && <p className="subscription-success"><CheckCircle2/>{t("subscription.paymentVerified")}</p>}
        {!billing.payment && <button className="button button-primary" disabled={!billing.quote.data || billing.createPending} onClick={() => void billing.makePayment()}><QrCode size={16}/>{t("subscription.confirmPayment")}</button>}
      </section>
    </section>
  </div>;
}

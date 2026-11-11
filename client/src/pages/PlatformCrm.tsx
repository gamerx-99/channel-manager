import React, { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";
import { filterCrmRows, formatPlatformDate, type PlatformPlan } from "./platformBilling";
import "./platformBilling.css";

export default function PlatformCrm() {
  const { t, language } = useTranslation();
  const query = trpc.access.billingCrm.useQuery();
  const utils = trpc.useUtils();
  const [plan, setPlan] = useState<PlatformPlan | "all">("all");
  const [province, setProvince] = useState("");
  const updateProvince = trpc.access.updateHotelProvince.useMutation({ onSuccess: () => utils.access.billingCrm.invalidate() });
  const setHotelPlan = trpc.access.setHotelPlan.useMutation({ onSuccess: () => utils.access.billingCrm.invalidate() });
  const rows = useMemo(() => filterCrmRows(query.data ?? [], plan, province), [query.data, plan, province]);
  return <main className="page-content platform-billing-page">
    <section className="page-intro intro-split"><div><div className="eyebrow">{t("platformCrm.eyebrow")}</div><h1>{t("platformCrm.title")}<span className="title-mark">.</span></h1><p className="lede">{t("platformCrm.lede")}</p></div></section>
    <section className="panel"><div className="panel-heading"><div><div className="eyebrow">{t("platformCrm.section")}</div><h2>{t("platformCrm.title")}</h2></div></div>
      <div className="form-grid crm-filters"><label>{t("platformCrm.planFilter")}<select value={plan} onChange={event => setPlan(event.target.value as PlatformPlan | "all")}><option value="all">{t("platformCrm.allPlans")}</option><option value="trial">{t("platformCrm.trial")}</option><option value="pro">Pro</option><option value="free">Free</option></select></label><label>{t("platformCrm.provinceFilter")}<input value={province} onChange={event => setProvince(event.target.value)} /></label></div>
      {query.isLoading && <p role="status">{t("platformCrm.loading")}</p>}{query.error && <p role="alert" className="form-error">{query.error.message}</p>}
      <div className="table-wrap"><table className="data-table"><thead><tr>{["hotel", "owner", "termsAccepted", "province", "plan", "created", "lastPayment", "coupon", "actions"].map(key => <th key={key}>{t(`platformCrm.${key}`)}</th>)}</tr></thead><tbody>
        {rows.map(row => <tr key={row.id}><td>{row.name}<small>{row.slug}</small></td><td>{row.ownerEmail}<small>{row.ownerContact}</small></td><td>{row.ownerTermsAcceptedAt ? formatPlatformDate(row.ownerTermsAcceptedAt, language) : t("platformCrm.termsNotAccepted")}</td><td><input aria-label={t("platformCrm.province")} defaultValue={row.province ?? ""} onBlur={event => { const value = event.target.value.trim() || null; if (value !== row.province) updateProvince.mutate({ hotelId: row.id, province: value }); }} /></td><td>{t(`platformCrm.${row.plan}`)}<small>{row.daysLeft ? t("platformCrm.daysLeft", { days: row.daysLeft }) : ""}</small></td><td>{formatPlatformDate(row.accountCreatedAt, language)}</td><td>{formatPlatformDate(row.lastPaymentAt, language)}</td><td>{row.couponUsed ?? "—"}</td><td><div className="crm-actions"><button className="button button-quiet button-small" type="button" onClick={() => { const raw = window.prompt(t("platformCrm.extendPrompt")); const months = Number(raw); const reason = window.prompt(t("platformCrm.reasonPrompt")); if (Number.isInteger(months) && months > 0 && reason?.trim()) setHotelPlan.mutate({ hotelId: row.id, action: "extend", months, reason }); }}>{t("platformCrm.extend")}</button><button className="button button-quiet button-small" type="button" onClick={() => { const reason = window.prompt(t("platformCrm.endReasonPrompt")); if (reason?.trim()) setHotelPlan.mutate({ hotelId: row.id, action: "end", reason }); }}>{t("platformCrm.end")}</button></div></td></tr>)}
      </tbody></table></div>{!query.isLoading && rows.length === 0 && <p className="empty-state">{t("platformCrm.empty")}</p>}
    </section>
  </main>;
}

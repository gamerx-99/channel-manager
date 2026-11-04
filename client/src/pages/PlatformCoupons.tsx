import React from "react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformDate } from "./platformBilling";
import "./platformBilling.css";

type CouponForm = { code: string; percentOff: number; discountMonths: number; maxRedemptions: number | ""; expiresAt: string; note: string };

export default function PlatformCoupons() {
  const { t, language } = useTranslation();
  const query = trpc.access.coupons.useQuery();
  const utils = trpc.useUtils();
  const [values, setValues] = useState<CouponForm>({ code: "", percentOff: 50, discountMonths: 1, maxRedemptions: "", expiresAt: "", note: "" });
  const create = trpc.access.createCoupon.useMutation({ onSuccess: () => { void utils.access.coupons.invalidate(); setValues({ code: "", percentOff: 50, discountMonths: 1, maxRedemptions: "", expiresAt: "", note: "" }); } });
  const deactivate = trpc.access.deactivateCoupon.useMutation({ onSuccess: () => void utils.access.coupons.invalidate() });
  const onSubmit = (event: React.FormEvent) => { event.preventDefault(); create.mutate({ code: values.code, percentOff: Number(values.percentOff), discountMonths: Number(values.discountMonths), maxRedemptions: values.maxRedemptions === "" ? null : Number(values.maxRedemptions), expiresAt: values.expiresAt ? new Date(`${values.expiresAt}T23:59:59`) : null, note: values.note || null }); };
  const bind = (key: keyof CouponForm) => ({ value: values[key], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValues(previous => ({ ...previous, [key]: key === "percentOff" || key === "discountMonths" ? Number(event.target.value) : key === "maxRedemptions" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value })) });
  return <main className="page-content platform-billing-page"><section className="page-intro intro-split"><div><div className="eyebrow">{t("platformCoupons.eyebrow")}</div><h1>{t("platformCoupons.title")}<span className="title-mark">.</span></h1><p className="lede">{t("platformCoupons.lede")}</p></div></section>
    <form className="panel" onSubmit={onSubmit}><div className="panel-heading"><h2>{t("platformCoupons.create")}</h2></div><div className="form-grid"><label>{t("platformCoupons.code")}<input required maxLength={64} {...bind("code")} /></label><label>{t("platformCoupons.percent")}<input type="number" min={1} max={100} required {...bind("percentOff")} /></label><label>{t("platformCoupons.months")}<input type="number" min={1} required {...bind("discountMonths")} /></label><label>{t("platformCoupons.maxRedemptions")}<input type="number" min={1} {...bind("maxRedemptions")} /></label><label>{t("platformCoupons.expiry")}<input type="date" {...bind("expiresAt")} /></label><label>{t("platformCoupons.note")}<input {...bind("note")} /></label></div><div className="form-submit"><button className="button button-primary" disabled={create.isPending}>{t("platformCoupons.create")}</button></div>{create.error && <p className="form-error" role="alert">{create.error.message}</p>}</form>
    <section className="panel"><div className="panel-heading"><h2>{t("platformCoupons.list")}</h2></div><div className="table-wrap"><table className="data-table"><thead><tr>{["code", "percent", "months", "redemptions", "expiry", "status", "actions"].map(key => <th key={key}>{t(`platformCoupons.${key}`)}</th>)}</tr></thead><tbody>{query.data?.map(coupon => <tr key={coupon.id}><td>{coupon.code}</td><td>{coupon.percentOff}%</td><td>{coupon.discountMonths}</td><td>{coupon.redemptionCount}{coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ""}</td><td>{coupon.expiresAt ? formatPlatformDate(coupon.expiresAt, language) : "—"}</td><td>{t(coupon.active ? "platformCoupons.active" : "platformCoupons.inactive")}</td><td>{coupon.active && <button type="button" className="button button-quiet button-small" onClick={() => deactivate.mutate({ id: coupon.id })}>{t("platformCoupons.deactivate")}</button>}</td></tr>)}</tbody></table></div>{query.error && <p className="form-error" role="alert">{query.error.message}</p>}</section>
  </main>;
}

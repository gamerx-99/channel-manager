import React from "react";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";

export default function PlatformOverview() {
  const { t } = useTranslation();
  const query = trpc.access.billingSummary.useQuery();
  return <div className="page-content">
    <section className="page-intro intro-split"><div><div className="eyebrow">{t("platformOverview.eyebrow")}</div><h1>{t("platformOverview.title")}<span className="title-mark">.</span></h1><p className="lede">{t("platformOverview.lede")}</p></div></section>
    <nav className="platform-links"><a href="/platform/crm">{t("platformCrm.nav")}</a><a href="/platform/coupons">{t("platformCoupons.nav")}</a></nav>
    {query.isLoading && <p role="status">{t("platformOverview.loading")}</p>}
    {query.error && <section className="panel empty-state" role="alert"><p>{query.error.message}</p><button className="button button-quiet" type="button" onClick={() => void query.refetch()}>{t("platformOverview.retry")}</button></section>}
    {!!query.data && <section className="platform-metrics">{([["hotels", query.data.hotelCount], ["users", query.data.userCount], ["paidPro", query.data.paidProCount], ["trial", query.data.trialCount], ["revenueMonth", query.data.revenueMonth], ["revenueTotal", query.data.revenueTotal]] as const).map(([key, value]) => <article className="panel" key={key}><div className="eyebrow">{t(`platformOverview.${key}`)}</div><strong>{key.startsWith("revenue") ? `${Number(value).toFixed(2)} ฿` : value}</strong></article>)}</section>}
  </div>;
}

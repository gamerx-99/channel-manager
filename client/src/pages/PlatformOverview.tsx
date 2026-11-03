import React from "react";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";

export default function PlatformOverview() {
  const { t } = useTranslation();
  const query = trpc.access.platformSummary.useQuery();
  return <div className="page-content">
    <section className="page-intro"><div className="eyebrow">{t("platformOverview.eyebrow")}</div><h1>{t("platformOverview.title")}<span className="title-mark">.</span></h1><p className="lede">{t("platformOverview.lede")}</p></section>
    {query.isLoading && <p role="status">{t("platformOverview.loading")}</p>}
    {query.error && <section className="panel empty-state" role="alert"><p>{query.error.message}</p><button className="button button-quiet" type="button" onClick={() => void query.refetch()}>{t("platformOverview.retry")}</button></section>}
    {!query.isLoading && !query.error && (!query.data || query.data.length === 0) && <section className="panel empty-state"><div className="panel-heading"><div><div className="eyebrow">{t("platformOverview.eyebrow")}</div><h2>{t("platformOverview.emptyTitle")}</h2></div></div><p>{t("platformOverview.emptyDescription")}</p></section>}
    {!!query.data?.length && <section className="panel"><div className="panel-heading"><div><div className="eyebrow">{t("platformOverview.eyebrow")}</div><h2>{t("platformOverview.title")}</h2></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>{t("platformOverview.hotel")}</th><th>{t("platformOverview.plan")}</th><th>{t("platformOverview.paymentStatus")}</th><th>{t("platformOverview.rooms")}</th><th>{t("platformOverview.syncStatus")}</th></tr></thead>
      <tbody>{query.data.map((hotel, index) => <tr key={index}><td>{hotel.hotelName}</td><td>{hotel.plan ?? t("platformOverview.unavailable")}</td><td>{hotel.paymentStatus ?? t("platformOverview.unavailable")}</td><td>{hotel.roomCount}</td><td>{hotel.syncStatus}</td></tr>)}</tbody>
    </table></div></section>}
  </div>;
}

import React from "react";
import { Download, ExternalLink, FileSpreadsheet } from "lucide-react";
import { Link } from "wouter";
import { PageState } from "@/components/PageState";
import { useTranslation } from "@/lib/i18n";
import { TM30_PORTAL_URL, useTm30Arrivals } from "./useTm30Arrivals";
import "./Tm30.css";

const PROBLEM_KEYS = {
  name: "tm30Page.problemName",
  passport: "tm30Page.problemPassport",
  gender: "tm30Page.problemGender",
  nationality: "tm30Page.problemNationality",
  birth_date: "tm30Page.problemBirthDate",
} as const;

export default function Tm30({ id }: { id: string }) {
  const { t } = useTranslation();
  const { arrivals, guests, shownDate, readyCount, incompleteCount, pickDate, download, downloading, downloadFailed } = useTm30Arrivals(id);

  return <div className="page-content tm30-page">
    <section className="page-intro intro-split"><div>
      <div className="eyebrow">{t("tm30Page.eyebrow")}</div>
      <h1>{t("tm30Page.title")}<span className="title-mark">.</span></h1>
      <p className="lede">{t("tm30Page.lede")}</p>
    </div></section>

    <section className="panel" aria-labelledby="tm30-guests-heading">
      <div className="panel-heading">
        <div><div className="eyebrow">{t("tm30Page.eyebrow")}</div><h2 id="tm30-guests-heading">{t("tm30Page.listTitle")}</h2></div>
        <label className="tm30-date">{t("tm30Page.dateLabel")}<input type="date" value={shownDate} onChange={event => pickDate(event.target.value)} /></label>
      </div>
      <p className="tm30-note">{t("tm30Page.deadline")}</p>
      <div className="tm30-actions">
        <button type="button" className="button button-primary" disabled={downloading || readyCount === 0} onClick={download} data-testid="tm30-download">
          <Download size={15} aria-hidden="true" /> {downloading ? t("tm30Page.downloading") : t("tm30Page.download")}
        </button>
        <a className="button button-quiet" href={TM30_PORTAL_URL} target="_blank" rel="noopener noreferrer" data-testid="tm30-portal">
          <ExternalLink size={15} aria-hidden="true" /> {t("tm30Page.openPortal")}
        </a>
      </div>
      <p className="tm30-note">{t("tm30Page.howTo")}</p>
      {downloadFailed ? <p className="form-error tm30-message" role="alert">{t("tm30Page.downloadFailed")}</p> : null}
      {incompleteCount > 0 ? <p className="form-error tm30-message" role="note">{t("tm30Page.incompleteNote", { count: incompleteCount })} <Link href={`/hotels/${id}/bookings`} className="text-link">{t("tm30Page.goBookings")}</Link></p> : null}

      {arrivals.isLoading ? <PageState tone="loading" title={t("hotelDetail.loadingTitle")} /> : null}
      {arrivals.error ? <PageState tone="error" title={t("tm30Page.loadFailed")} description={arrivals.error.message} /> : null}
      {!arrivals.isLoading && !arrivals.error && guests.length === 0 ? <div className="empty-state tm30-empty"><FileSpreadsheet size={20} aria-hidden="true" /><strong>{t("tm30Page.empty")}</strong></div> : null}
      {guests.length > 0 ? <div className="table-wrap tm30-table-wrap">
        <table className="data-table">
          <thead><tr><th>{t("tm30Page.colName")}</th><th>{t("tm30Page.colPassport")}</th><th>{t("tm30Page.colNationality")}</th><th>{t("tm30Page.colRoom")}</th><th>{t("tm30Page.colStatus")}</th><th>{t("tm30Page.colData")}</th></tr></thead>
          <tbody>{guests.map((guest, index) => <tr key={`${guest.booking_id}-${index}`}>
            <td><strong>{guest.name || "—"}</strong></td>
            <td>{guest.passport_no || "—"}</td>
            <td>{guest.nationality_code || "—"}</td>
            <td>{guest.room_number ?? "—"}</td>
            <td>{guest.status === "checked_in" ? t("bookings.statusCheckedIn") : t("bookings.statusConfirmed")}</td>
            <td>{guest.problem ? <span className="status-pill setup"><i />{t(PROBLEM_KEYS[guest.problem])}</span> : <span className="status-pill live"><i />{t("tm30Page.dataReady")}</span>}</td>
          </tr>)}</tbody>
        </table>
      </div> : null}
    </section>
  </div>;
}

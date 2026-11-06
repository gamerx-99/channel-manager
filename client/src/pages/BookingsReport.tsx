import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import PageState from '@/components/PageState';
import { useTranslation } from '@/lib/i18n';
import { dateLocale } from '@/lib/dateLocale';
import { formatReportDate, formatReportMoney, formatReportMonth, formatReportNumber, useBookingsReport } from './useBookingsReport';
import './BookingsReport.css';

export default function BookingsReport() {
  const { t, language } = useTranslation();
  const locale = dateLocale(language);
  const report = useBookingsReport();
  const { data, isLoading, isError, refetch } = report.query;
  if (!report.selectedHotelId) return <div className="page-content"><PageState tone="empty" title={t('bookingsReport.noHotel')} /></div>;
  if (isLoading && !data) return <div className="page-content"><PageState tone="loading" title={t('bookingsReport.loading')} /></div>;
  if (isError || !data) return <div className="page-content"><PageState tone="error" title={t('bookingsReport.error')} actionLabel={t('financials.tryAgain')} onAction={() => void refetch()} /></div>;
  const hasMoney = 'adr' in data.totals;
  const csvHeaders = [t('bookingsReport.reference'), t('bookingsReport.guest'), t('bookingsReport.roomType'), t('bookingsReport.checkIn'), t('bookingsReport.checkOut'), t('bookingsReport.nights'), t('bookingsReport.status'), ...(hasMoney ? [t('bookingsReport.amount')] : [])];
  const metrics = [
    [t('bookingsReport.bookings'), formatReportNumber(data.totals.bookings)],
    [t('bookingsReport.roomNights'), formatReportNumber(data.totals.roomNights)],
    [t('bookingsReport.occupancy'), `${formatReportNumber(data.totals.occupancy, 1)}%`],
    ...(hasMoney && data.totals.adr !== undefined ? [[t('bookingsReport.adr'), formatReportMoney(data.totals.adr)]] : []),
    [t('bookingsReport.cancelled'), formatReportNumber(data.totals.cancelledBookings)],
    [t('bookingsReport.averageStay'), formatReportNumber(data.totals.averageStay, 1)],
    [t('bookingsReport.averageLead'), formatReportNumber(data.totals.averageLead, 1)],
  ];
  return <div className="page-content bookings-report-page">
    <section className="page-intro intro-split"><div><div className="eyebrow">{t('bookingsReport.eyebrow')}</div><h1>{t('bookingsReport.title')}<span className="title-mark">.</span></h1><p className="lede">{t('bookingsReport.lede')}</p></div></section>
    <section className="panel"><div className="panel-heading"><div><div className="eyebrow">{t('bookingsReport.eyebrow')}</div><h2>{t('bookingsReport.period')}</h2></div></div>
      <div className="bookings-report-controls"><div className="financials-period-picker" role="group" aria-label={t('bookingsReport.period')}>
        <button className="button button-quiet" type="button" onClick={() => report.chooseMonth(-1)} aria-label={t('financials.periodPreviousMonth')}><ChevronLeft size={16} /></button>
        <strong>{report.choice.kind === 'month' ? formatReportMonth(report.choice.month, locale) : t('bookingsReport.customRange')}</strong>
        <button className="button button-quiet" type="button" onClick={() => report.chooseMonth(1)} aria-label={t('financials.periodNextMonth')}><ChevronRight size={16} /></button>
        <button className="button button-quiet" type="button" onClick={report.chooseCurrentMonth}>{t('financials.periodThisMonth')}</button>
      </div><div className="bookings-report-range"><label>{t('bookingsReport.from')}<input type="date" value={report.rangeDraft.from} onChange={event => report.setRangeDraft({ ...report.rangeDraft, from: event.target.value })} /></label><label>{t('bookingsReport.to')}<input type="date" value={report.rangeDraft.to} onChange={event => report.setRangeDraft({ ...report.rangeDraft, to: event.target.value })} /></label><button className="button button-quiet" type="button" onClick={report.applyRange}>{t('bookingsReport.apply')}</button></div>
      <label className="bookings-report-basis"><input type="checkbox" checked={report.basis === 'created'} onChange={event => report.setBasis(event.target.checked ? 'created' : 'stay')} /> {t('bookingsReport.createdBasis')}</label></div>
      <p className="field-help">{t('financials.periodRange', { start: formatReportDate(data.periodStart, locale), end: formatReportDate(data.periodEnd, locale) })}</p>
    </section>
    <section className="panel"><div className="panel-heading"><h2>{t('bookingsReport.summary')}</h2></div><div className="bookings-report-metrics">{metrics.map(([label, value]) => <div className="bookings-report-metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
    <div className="bookings-report-grid">{([[t('bookingsReport.byRoomType'), data.roomTypes, false], [t('bookingsReport.bySource'), data.sources, true]] as const).map(([title, rows, isSource]) => <section className="panel" key={title}><div className="panel-heading"><h2>{title}</h2></div><div className="table-wrap"><table className="data-table"><thead><tr><th>{title}</th><th>{t('bookingsReport.bookings')}</th><th>{t('bookingsReport.nights')}</th>{hasMoney && <><th>{t('bookingsReport.revenue')}</th><th>{t('bookingsReport.share')}</th></>}</tr></thead><tbody>{rows.map(row => <tr key={row.name}><td>{isSource ? t(`bookingsReport.source_${row.name}`) : row.name || t('bookings.unassigned')}</td><td>{row.bookings}</td><td>{row.nights}</td>{hasMoney && <><td>{formatReportMoney(row.revenue ?? 0)}</td><td>{formatReportNumber(row.share ?? 0, 1)}%</td></>}</tr>)}</tbody></table></div></section>)}</div>
    <div className="bookings-report-grid"><section className="panel"><div className="panel-heading"><h2>{t('bookingsReport.byStatus')}</h2></div><div className="table-wrap"><table className="data-table"><thead><tr><th>{t('bookingsReport.status')}</th><th>{t('bookingsReport.bookings')}</th></tr></thead><tbody>{data.statuses.map(row => <tr key={row.name}><td>{t(`bookingsReport.status_${row.name}`)}</td><td>{row.count}</td></tr>)}</tbody></table></div></section>
    <section className="panel"><div className="panel-heading"><h2>{t('bookingsReport.daily')}</h2></div><div className="table-wrap bookings-report-daily"><table className="data-table"><thead><tr><th>{t('bookingsReport.date')}</th><th>{t('bookingsReport.nights')}</th></tr></thead><tbody>{data.daily.map(row => <tr key={row.date}><td>{formatReportDate(row.date, locale)}</td><td>{row.nights}</td></tr>)}</tbody></table></div></section></div>
    <section className="panel"><div className="panel-heading"><h2>{t('bookingsReport.table')}</h2><button className="button button-quiet" type="button" disabled={!data.rows.length} onClick={() => report.exportCsv(csvHeaders)}><Download size={15} /> {t('bookingsReport.exportCsv')}</button></div><div className="table-wrap"><table className="data-table bookings-report-table"><thead><tr>{csvHeaders.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row.id}><td>{row.id}</td><td>{row.guestName}</td><td>{row.roomType || t('bookings.unassigned')}</td><td>{formatReportDate(row.checkIn, locale)}</td><td>{formatReportDate(row.checkOut, locale)}</td><td>{row.nights}</td><td>{t(`bookingsReport.status_${row.status}`)}</td>{hasMoney && <td>{formatReportMoney(row.amount ?? 0)}</td>}</tr>)}</tbody></table></div>{!data.rows.length && <p className="field-help">{t('bookingsReport.empty')}</p>}</section>
  </div>;
}

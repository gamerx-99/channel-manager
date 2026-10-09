import { Download, FileSpreadsheet, Filter, MessageCircle, MoreHorizontal, Plus, Search, UserRoundPlus, X } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { formatIsoToDisplayDate, parseDisplayDateToIso } from '@shared/dateUtils';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import PageState from '@/components/PageState';
import BookingWizard from '@/components/BookingWizard';
import { useTranslation } from '@/lib/i18n';
import { communicationsEnabled } from '@/lib/featureFlags';
import { hasHotelPermission } from '@shared/authorization';

type BookingStatus = 'held' | 'pending_payment' | 'pending_verification' | 'confirmed' | 'expired' | 'payment_rejected' | 'cancelled' | 'refund_pending' | 'refunded' | 'checked_in' | 'checked_out';

const formatCurrency = (value: number | string) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(Number(value));

function displayDay(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function downloadBase64Xlsx(base64: string, filename: string, contentType: string) {
  const binary = window.atob(base64);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function Bookings({ id }: { id: string }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const hotelQuery = trpc.channelManager.hotel.useQuery(id, { enabled: Boolean(id) });
  const bookingsQuery = trpc.channelManager.bookings.useQuery(id, { enabled: Boolean(id) });
  const authMeQuery = trpc.auth.me.useQuery();
  const canManageCheckInOut = hasHotelPermission(
    authMeQuery.data?.roles ?? [],
    authMeQuery.data?.memberships ?? [],
    id,
    'operations.manage_checkin_checkout',
  );
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | BookingStatus>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const previewQuery = trpc.channelManager.previewTm30.useQuery(id, { enabled: showPreview && Boolean(id) });
  const [formError, setFormError] = useState<string | null>(null);

  const statusLabel: Record<BookingStatus, string> = {
    held: t('bookings.statusHeld'),
    pending_payment: t('bookings.statusPendingPayment'),
    pending_verification: t('bookings.statusPendingVerification'),
    confirmed: t('bookings.statusConfirmed'),
    expired: t('bookings.statusExpired'),
    payment_rejected: t('bookings.statusPaymentRejected'),
    refund_pending: t('bookings.statusRefundPending'),
    refunded: t('bookings.statusRefunded'),
    checked_in: t('bookings.statusCheckedIn'),
    checked_out: t('bookings.statusCheckedOut'),
    cancelled: t('bookings.statusCancelled'),
  };

  const createBooking = trpc.channelManager.createBooking.useMutation({
    onSuccess: async () => {
      await utils.channelManager.bookings.invalidate(id);
      await utils.channelManager.dashboard.invalidate();
      await utils.channelManager.bookingOccupancy.invalidate();
      setShowAdd(false);
    },
    onError: error => console.error(error.message),
  });

  const manualVerify = trpc.payment.manualVerify.useMutation({
    onSuccess: async () => {
      await utils.channelManager.bookings.invalidate(id);
      await utils.channelManager.dashboard.invalidate();
    },
    onError: error => console.error(error.message),
  });

  const transitionBooking = trpc.channelManager.transitionBookingStatus.useMutation({
    onSuccess: async () => {
      setFormError(null);
      await Promise.all([
        utils.channelManager.bookings.invalidate(id),
        utils.channelManager.dashboard.invalidate(),
        utils.channelManager.bookingOccupancy.invalidate(),
      ]);
    },
    onError: error => setFormError(error.message),
  });

  const exportTm30 = trpc.channelManager.exportTm30.useMutation({
    onSuccess: result => {
      downloadBase64Xlsx(result.base64, result.filename, result.contentType);
      setShowExport(false);
    },
  });

  const downloadCsvPreview = () => {
    if (!previewQuery.data || !hotel) return;
    const { headers, rows } = previewQuery.data;
    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const csvContent = [
      headers.map(h => escapeCsv(h.replace(/\n/g, ' '))).join(','),
      ...rows.map(row => row.map(cell => escapeCsv(String(cell ?? ''))).join(','))
    ].join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tm30-preview-${hotel.slug || id}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const downloadPdfPreview = () => {
    if (!previewQuery.data || !hotel) return;
    const { headers, rows } = previewQuery.data;
    const html = `
      <!DOCTYPE html>
      <html lang="th">
      <head>
        <meta charset="utf-8">
        <title>TM.30 Report - ${hotel.name}</title>
        <style>
          body { font-family: sans-serif; padding: 20px; color: #111; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          p { font-size: 12px; color: #555; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
          th { background: #f4f4f4; }
        </style>
      </head>
      <body>
        <h1>TM.30 Immigration Report: ${hotel.name}</h1>
        <p>Generated: ${new Date().toLocaleString()} | Format: DD/MM/YYYY (A.D.)</p>
        <table>
          <thead><tr>${headers.map(h => `<th>${h.replace(/\n/g, ' ')}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') : '<tr><td colspan="9">No records</td></tr>'}
          </tbody>
        </table>
        <script>window.print();</script>
      </body>
      </html>
    `;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  const hotel = hotelQuery.data;
  const bookings = bookingsQuery.data ?? [];
  const filtered = useMemo(
    () => bookings.filter(booking =>
      booking.guest_name.toLowerCase().includes(query.trim().toLowerCase()) &&
      (status === 'all' || booking.status === status),
    ),
    [bookings, query, status],
  );

  const retryBookings = () => {
    void hotelQuery.refetch();
    void bookingsQuery.refetch();
  };

  if (hotelQuery.isLoading || bookingsQuery.isLoading) {
    return <div className="page-content"><PageState tone="loading" title={t('bookings.loadingTitle')} description={t('bookings.loadingDesc')} /></div>;
  }
  if (hotelQuery.error || bookingsQuery.error || !hotel) {
    const error = hotelQuery.error ?? bookingsQuery.error;
    return <div className="page-content"><PageState tone="error" title={t('bookings.errorTitle')} description={error?.message ?? t('bookings.errorDescFallback')} actionLabel={t('bookings.retryButton')} onAction={retryBookings} actionPending={hotelQuery.isFetching || bookingsQuery.isFetching} /></div>;
  }

  const roomTypeName = (roomTypeId: string) => hotel.room_types.find(roomType => roomType.id === roomTypeId)?.name ?? t('bookings.unassignedRoomType');

  return (
    <div className="page-content bookings-page">
      <div className="detail-back"><Link href={`/hotels/${hotel.id}`}>{hotel.name}</Link><span>/</span><strong>{t('bookings.title')}</strong></div>
      <section className="page-intro intro-split">
        <div><div className="eyebrow">{t('bookings.eyebrow')}</div><h1>{t('bookings.title')}<span className="title-mark">.</span></h1><p className="lede">{t('bookings.lede')}</p></div>
        <div className="intro-actions">
          <button className="button button-quiet" onClick={() => setShowPreview(true)} disabled={!bookings.length}><FileSpreadsheet size={15} /> {t('bookings.previewTm30')}</button>
          <button className="button button-quiet" onClick={() => setShowExport(true)} disabled={!bookings.length}><Download size={15} /> {t('bookings.exportTm30')}</button>
          <button className="button button-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> {t('bookings.addBooking')}</button>
        </div>
      </section>
      <div className="tm30-callout"><div className="callout-icon"><FileSpreadsheet size={17} /></div><div><strong>{t('bookings.tm30CalloutTitle')}</strong><span>{t('bookings.tm30CalloutDesc')}</span></div><button className="text-link" onClick={() => setShowExport(true)} disabled={!bookings.length}>{t('bookings.reviewExport')} <Download size={14} /></button></div>
      <section className="panel table-panel">
        <div className="list-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('bookings.searchPlaceholder')} aria-label={t('bookings.searchAriaLabel')} /></div><div className="toolbar-actions"><select className="select-control" value={status} onChange={event => setStatus(event.target.value as 'all' | BookingStatus)} aria-label={t('bookings.filterStatusAriaLabel')}><option value="all">{t('bookings.allStatuses')}</option><option value="held">{t('bookings.statusHeld')}</option><option value="pending_payment">{t('bookings.statusPendingPayment')}</option><option value="pending_verification">{t('bookings.statusPendingVerification')}</option><option value="confirmed">{t('bookings.statusConfirmed')}</option><option value="checked_in">{t('bookings.statusCheckedIn')}</option><option value="checked_out">{t('bookings.statusCheckedOut')}</option><option value="cancelled">{t('bookings.statusCancelled')}</option><option value="expired">{t('bookings.statusExpired')}</option><option value="payment_rejected">{t('bookings.statusPaymentRejected')}</option><option value="refund_pending">{t('bookings.statusRefundPending')}</option><option value="refunded">{t('bookings.statusRefunded')}</option></select><button className="filter-button" type="button" disabled><Filter size={14} /> {t('bookings.moreFilters')}</button></div></div>
        {formError && <div className="form-error" role="alert">{formError}</div>}
        <p className="mobile-scroll-hint" role="note">{t('bookings.mobileScrollHint')}</p>
        <div className="table-wrap"><table className="data-table bookings-table"><thead><tr><th>{t('bookings.bookingCol')}</th><th>{t('bookings.guestCol')}</th><th>{t('bookings.stayDatesCol')}</th><th>{t('bookings.roomCol')}</th><th>{t('bookings.sourceCol')}</th><th>{t('bookings.statusCol')}</th><th className="align-right">{t('bookings.valueCol')}</th><th /></tr></thead><tbody>{filtered.length ? filtered.map(booking => {
          const tm30Ready = booking.guests.length > 0 && booking.guests.every(guest => Boolean(guest.passport_no && guest.nationality_code && guest.birth_date));
          const childMeasurements = (booking.child_measurements ?? []).map(measurement => 'age' in measurement
            ? `${measurement.age} ${t('publicHotel.childAgeUnit')}`
            : `${measurement.height_cm} ${t('publicHotel.childHeightUnit')}`);
          return <tr key={booking.id}><td><span className="booking-id">{booking.id.slice(0, 8)}</span><small>{t('bookings.created', { date: formatIsoToDisplayDate(booking.created_at?.slice(0, 10)) })}</small></td><td><strong>{booking.guest_name}</strong><small className="booking-occupancy">{booking.adults} {t('publicHotel.adultsLabel')} · {booking.children} {t('publicHotel.childrenLabel')}{childMeasurements.length ? ` · ${childMeasurements.join(', ')}` : ''}</small><small><span className={tm30Ready ? 'guest-complete' : 'guest-incomplete'}><i /> {tm30Ready ? t('bookings.tm30DataComplete') : t('bookings.tm30DataNeeded')}</span></small></td><td><span>{formatIsoToDisplayDate(booking.check_in)}</span><small>{t('bookings.to')} {formatIsoToDisplayDate(booking.check_out)}</small></td><td><strong>{booking.rooms?.room_number ?? '—'}</strong><small>{booking.rooms?.room_types?.name ?? t('bookings.unassigned')}</small></td><td><span className="source-tag">{booking.source}</span></td><td><span className={`status-text ${booking.status}`}>{statusLabel[booking.status]}</span></td><td className="align-right"><strong>{formatCurrency(booking.price)}</strong></td><td><div className="flex items-center justify-end gap-1">{communicationsEnabled && <Link href={`/communications?bookingId=${booking.id}`} className="icon-button" aria-label={t('bookings.messagesAria', { id: booking.id })} title={t('bookings.messagesTooltip')}><MessageCircle size={16} /></Link>}{booking.status === 'pending_verification' ? (<><button className="button button-primary" type="button" disabled={manualVerify.isPending} onClick={() => manualVerify.mutate({ booking_id: booking.id, hotel_id: id, approved: true })}>{t('bookings.approveVerification')}</button><button className="button button-quiet" type="button" disabled={manualVerify.isPending} onClick={() => manualVerify.mutate({ booking_id: booking.id, hotel_id: id, approved: false })}>{t('bookings.rejectVerification')}</button></>) : booking.status === 'confirmed' && canManageCheckInOut ? (<button className="button button-primary" type="button" disabled={transitionBooking.isPending} onClick={() => { setFormError(null); transitionBooking.mutate({ booking_id: booking.id, hotel_id: id, to_status: 'checked_in' }); }}>{t('bookings.checkInAction')}</button>) : booking.status === 'checked_in' && canManageCheckInOut ? (<button className="button button-quiet" type="button" disabled={transitionBooking.isPending} onClick={() => { setFormError(null); transitionBooking.mutate({ booking_id: booking.id, hotel_id: id, to_status: 'checked_out' }); }}>{t('bookings.checkOutAction')}</button>) : (<button className="icon-button" type="button" aria-label={t('bookings.moreActionsAria', { id: booking.id })} disabled><MoreHorizontal size={16} /></button>)}</div></td></tr>;
        }) : <tr><td colSpan={8} className="empty-cell">{bookings.length ? t('bookings.noMatch') : t('bookings.emptyBookings')}</td></tr>}</tbody></table></div>
        <div className="table-footer"><span>{t('bookings.showingCount', { filtered: filtered.length, total: bookings.length })}</span></div>
      </section>
      {showAdd && <BookingWizard hotel={{ ...hotel, bookings }} onClose={() => setShowAdd(false)} onSuccess={() => {
        utils.channelManager.bookings.invalidate(id);
        utils.channelManager.dashboard.invalidate();
        setShowAdd(false);
      }} />}
      {showExport && <div className="modal-backdrop" onMouseDown={() => setShowExport(false)}><div className="modal-card export-modal" onMouseDown={event => event.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">{t('bookings.modalPreflightEyebrow')}</div><h2>{t('bookings.prepareGuestFile')}</h2></div><button className="icon-button" onClick={() => setShowExport(false)}><X size={17} /></button></div><p className="modal-lede">{t('bookings.modalLede')}</p>{exportTm30.error && <p className="form-error" role="alert">{exportTm30.error.message}</p>}<div className="preflight-list"><div className="preflight-item done"><i>✓</i><div><strong>{t('bookings.scopeSelected')}</strong><span>{t('bookings.scopeSelectedDesc', { count: bookings.length })}</span></div></div><div className="preflight-item done"><i>✓</i><div><strong>{t('bookings.templateEnforced')}</strong><span>{t('bookings.templateEnforcedDesc')}</span></div></div><div className="preflight-item warning"><i>!</i><div><strong>{t('bookings.uploadManually')}</strong><span>{t('bookings.uploadManuallyDesc')}</span></div></div></div><div className="template-note"><FileSpreadsheet size={17} /><span><strong>{t('bookings.templateOfficial')}</strong><small>{t('bookings.templateSupplied')}</small></span><span className="template-tag">{t('bookings.templateMapped')}</span></div><div className="modal-actions"><button className="button button-quiet" onClick={() => setShowExport(false)}>{t('bookings.cancel')}</button><button className="button button-primary" disabled={exportTm30.isPending || !bookings.length} onClick={() => exportTm30.mutate(id)}><Download size={15} /> {exportTm30.isPending ? t('bookings.preparing') : t('bookings.downloadXlsx')}</button></div></div></div>}
      {showPreview && <div className="modal-backdrop" onMouseDown={() => setShowPreview(false)}><div className="modal-card preview-modal" style={{ maxWidth: '960px', width: '95vw' }} onMouseDown={event => event.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">{t('bookings.previewEyebrow')}</div><h2>{t('bookings.previewTitle')}</h2></div><button className="icon-button" onClick={() => setShowPreview(false)}><X size={17} /></button></div><p className="modal-lede">{t('bookings.previewLede')}</p>{previewQuery.isLoading ? <div className="panel page-state">{t('bookings.loadingPreview')}</div> : previewQuery.error ? <p className="form-error">{t('bookings.failedPreview', { error: previewQuery.error.message })}</p> : <div className="table-wrap" style={{ maxHeight: '420px', overflowY: 'auto', marginTop: '1rem' }}><table className="data-table"><thead><tr>{previewQuery.data?.headers.map((h, i) => <th key={i} style={{ whiteSpace: 'pre-line', fontSize: '0.8rem' }}>{h}</th>)}</tr></thead><tbody>{previewQuery.data?.rows.length ? previewQuery.data.rows.map((row, rIdx) => <tr key={rIdx}>{row.map((cell, cIdx) => <td key={cIdx}>{cell}</td>)}</tr>) : <tr><td colSpan={9} className="empty-cell">{t('bookings.noRecordsPreview')}</td></tr>}</tbody></table></div>}<div className="modal-actions" style={{ marginTop: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ display: 'flex', gap: '0.5rem' }}><button className="button button-quiet" onClick={downloadCsvPreview} disabled={!previewQuery.data || !previewQuery.data.rows.length}><Download size={15} /> {t('bookings.downloadCsv')}</button><button className="button button-quiet" onClick={downloadPdfPreview} disabled={!previewQuery.data || !previewQuery.data.rows.length}><Download size={15} /> {t('bookings.exportPdf')}</button></div><div style={{ display: 'flex', gap: '0.5rem' }}><button className="button button-quiet" onClick={() => setShowPreview(false)}>{t('bookings.close')}</button><button className="button button-primary" onClick={() => { setShowPreview(false); setShowExport(true); }}><Download size={15} /> {t('bookings.officialExcel')}</button></div></div></div></div>}
    </div>
  );
}

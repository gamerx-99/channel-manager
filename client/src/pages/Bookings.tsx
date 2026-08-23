import { Download, FileSpreadsheet, Filter, MoreHorizontal, Plus, Search, UserRoundPlus, X } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { formatIsoToDisplayDate, parseDisplayDateToIso } from '@shared/dateUtils';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import PageState from '@/components/PageState';

type BookingStatus = 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';

const statusLabel: Record<BookingStatus, string> = {
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
};

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
  const utils = trpc.useUtils();
  const hotelQuery = trpc.channelManager.hotel.useQuery(id, { enabled: Boolean(id) });
  const bookingsQuery = trpc.channelManager.bookings.useQuery(id, { enabled: Boolean(id) });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | BookingStatus>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const previewQuery = trpc.channelManager.previewTm30.useQuery(id, { enabled: showPreview && Boolean(id) });
  const [formError, setFormError] = useState<string | null>(null);
  const [bookingForm, setBookingForm] = useState({
    room_id: '',
    guest_name: '',
    check_in: displayDay(1),
    check_out: displayDay(2),
    price: '',
    source: 'manual' as 'manual' | 'walk-in' | 'phone',
    first_name: '',
    last_name: '',
    passport_no: '',
    nationality_code: '',
    gender: '' as '' | 'M' | 'F',
    birth_date: '',
    phone_no: '',
  });

  const createBooking = trpc.channelManager.createBooking.useMutation({
    onSuccess: async () => {
      await utils.channelManager.bookings.invalidate(id);
      await utils.channelManager.dashboard.invalidate();
      setShowAdd(false);
      setFormError(null);
      setBookingForm({
        room_id: '', guest_name: '', check_in: displayDay(1), check_out: displayDay(2), price: '', source: 'manual',
        first_name: '', last_name: '', passport_no: '', nationality_code: '', gender: '', birth_date: '', phone_no: '',
      });
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
    return <div className="page-content"><PageState tone="loading" title="กำลังโหลดการจอง" description="กำลังอ่านข้อมูลการจองจริงจาก Supabase…" /></div>;
  }
  if (hotelQuery.error || bookingsQuery.error || !hotel) {
    const error = hotelQuery.error ?? bookingsQuery.error;
    return <div className="page-content"><PageState tone="error" title="โหลดข้อมูลการจองไม่สำเร็จ" description={error?.message ?? 'ไม่พบโรงแรมหรือไม่มีสิทธิ์เข้าถึงข้อมูลนี้'} actionLabel="ลองใหม่" onAction={retryBookings} actionPending={hotelQuery.isFetching || bookingsQuery.isFetching} /></div>;
  }

  const roomTypeName = (roomTypeId: string) => hotel.room_types.find(roomType => roomType.id === roomTypeId)?.name ?? 'Unassigned room type';

  function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const hasGuestDetails = Boolean(
      bookingForm.first_name || bookingForm.last_name || bookingForm.passport_no || bookingForm.nationality_code || bookingForm.gender || bookingForm.birth_date,
    );
    const requiredGuestFields = [bookingForm.first_name, bookingForm.last_name, bookingForm.passport_no, bookingForm.nationality_code, bookingForm.gender, bookingForm.birth_date];
    if (hasGuestDetails && requiredGuestFields.some(value => !value.trim())) {
      setFormError('Enter all TM.30 identity fields, or leave the entire guest identity section blank for now.');
      return;
    }
    createBooking.mutate({
      hotel_id: id,
      room_id: bookingForm.room_id || null,
      guest_name: bookingForm.guest_name,
      check_in: parseDisplayDateToIso(bookingForm.check_in),
      check_out: parseDisplayDateToIso(bookingForm.check_out),
      price: Number(bookingForm.price),
      source: bookingForm.source,
      status: 'confirmed',
      guests: hasGuestDetails
        ? [{
            first_name: bookingForm.first_name,
            last_name: bookingForm.last_name,
            passport_no: bookingForm.passport_no,
            nationality_code: bookingForm.nationality_code,
            gender: bookingForm.gender as 'M' | 'F',
            birth_date: parseDisplayDateToIso(bookingForm.birth_date),
            phone_no: bookingForm.phone_no || null,
          }]
        : [],
    });
  }

  return (
    <div className="page-content bookings-page">
      <div className="detail-back"><Link href={`/hotels/${hotel.id}`}>{hotel.name}</Link><span>/</span><strong>Bookings</strong></div>
      <section className="page-intro intro-split">
        <div><div className="eyebrow">Operations / Live Supabase data</div><h1>Bookings<span className="title-mark">.</span></h1><p className="lede">Manual stays, arrivals, departures, and guest records in one place.</p></div>
        <div className="intro-actions">
          <button className="button button-quiet" onClick={() => setShowPreview(true)} disabled={!bookings.length}><FileSpreadsheet size={15} /> Preview TM.30</button>
          <button className="button button-quiet" onClick={() => setShowExport(true)} disabled={!bookings.length}><Download size={15} /> Export TM.30</button>
          <button className="button button-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Add booking</button>
        </div>
      </section>
      <div className="tm30-callout"><div className="callout-icon"><FileSpreadsheet size={17} /></div><div><strong>TM.30 export uses persisted records</strong><span>The server validates guest details and writes the supplied Immigration template before download. The hotel uploads it manually.</span></div><button className="text-link" onClick={() => setShowExport(true)} disabled={!bookings.length}>Review export <Download size={14} /></button></div>
      <section className="panel table-panel">
        <div className="list-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search guest name" aria-label="ค้นหาการจอง" /></div><div className="toolbar-actions"><select className="select-control" value={status} onChange={event => setStatus(event.target.value as 'all' | BookingStatus)} aria-label="กรองตามสถานะ"><option value="all">All statuses</option><option value="confirmed">Confirmed</option><option value="checked_in">Checked in</option><option value="checked_out">Checked out</option><option value="cancelled">Cancelled</option></select><button className="filter-button" type="button" disabled><Filter size={14} /> More filters</button></div></div>
        <p className="mobile-scroll-hint" role="note">เลื่อนตารางในแนวนอนเพื่อดูห้อง สถานะ และมูลค่าการจอง</p>
        <div className="table-wrap"><table className="data-table bookings-table"><thead><tr><th>Booking</th><th>Guest</th><th>Stay dates</th><th>Room</th><th>Source</th><th>Status</th><th className="align-right">Value</th><th /></tr></thead><tbody>{filtered.length ? filtered.map(booking => {
          const tm30Ready = booking.guests.length > 0 && booking.guests.every(guest => Boolean(guest.passport_no && guest.nationality_code && guest.birth_date));
          return <tr key={booking.id}><td><span className="booking-id">{booking.id.slice(0, 8)}</span><small>Created {formatIsoToDisplayDate(booking.created_at?.slice(0, 10))}</small></td><td><strong>{booking.guest_name}</strong><small><span className={tm30Ready ? 'guest-complete' : 'guest-incomplete'}><i /> {tm30Ready ? 'TM.30 data complete' : 'TM.30 data needed'}</span></small></td><td><span>{formatIsoToDisplayDate(booking.check_in)}</span><small>to {formatIsoToDisplayDate(booking.check_out)}</small></td><td><strong>{booking.rooms?.room_number ?? '—'}</strong><small>{booking.rooms?.room_types?.name ?? 'Unassigned'}</small></td><td><span className="source-tag">{booking.source}</span></td><td><span className={`status-text ${booking.status}`}>{statusLabel[booking.status]}</span></td><td className="align-right"><strong>{formatCurrency(booking.price)}</strong></td><td><button className="icon-button" type="button" aria-label={`More actions for booking ${booking.id}`} disabled><MoreHorizontal size={16} /></button></td></tr>;
        }) : <tr><td colSpan={8} className="empty-cell">{bookings.length ? 'No bookings match this filter.' : 'ยังไม่มีรายการจองในโรงแรมนี้'}</td></tr>}</tbody></table></div>
        <div className="table-footer"><span>Showing {filtered.length} of {bookings.length} live booking records</span></div>
      </section>
      {showAdd && <div className="modal-backdrop" onMouseDown={() => setShowAdd(false)}><form className="modal-card" onSubmit={submitBooking} onMouseDown={event => event.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">Manual entry / Stored in Supabase</div><h2>Add a booking</h2></div><button className="icon-button" type="button" onClick={() => setShowAdd(false)}><X size={17} /></button></div>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="form-grid"><label>Guest name<input required value={bookingForm.guest_name} onChange={event => setBookingForm({ ...bookingForm, guest_name: event.target.value })} placeholder="Full name" /></label><label>Room<select value={bookingForm.room_id} onChange={event => setBookingForm({ ...bookingForm, room_id: event.target.value })}><option value="">No room assigned</option>{hotel.rooms.filter(room => room.status !== 'out_of_service').map(room => <option key={room.id} value={room.id}>{room.room_number} · {roomTypeName(room.room_type_id)}</option>)}</select></label><label>Check-in (DD/MM/YYYY)<span className="field-hint" title="รูปแบบมาตรฐาน สตม.: วัน/เดือน/ปี ค.ศ. (เช่น 19/08/2026)">📅 วัน/เดือน/ปี ค.ศ. (DD/MM/YYYY)</span><input required placeholder="DD/MM/YYYY" value={bookingForm.check_in} onChange={event => setBookingForm({ ...bookingForm, check_in: event.target.value })} /></label><label>Check-out (DD/MM/YYYY)<span className="field-hint" title="รูปแบบมาตรฐาน สตม.: วัน/เดือน/ปี ค.ศ. (เช่น 20/08/2026)">📅 วัน/เดือน/ปี ค.ศ. (DD/MM/YYYY)</span><input required placeholder="DD/MM/YYYY" value={bookingForm.check_out} onChange={event => setBookingForm({ ...bookingForm, check_out: event.target.value })} /></label><label>Price (THB)<input required min="0" type="number" value={bookingForm.price} onChange={event => setBookingForm({ ...bookingForm, price: event.target.value })} /></label><label>Source<select value={bookingForm.source} onChange={event => setBookingForm({ ...bookingForm, source: event.target.value as typeof bookingForm.source })}><option value="manual">Manual</option><option value="walk-in">Walk-in</option><option value="phone">Phone</option></select></label></div><div className="guest-form-divider"><UserRoundPlus size={16} /><span>Guest identity for TM.30</span><small>Optional now · required before export</small></div><div className="form-grid"><label>First name<input value={bookingForm.first_name} onChange={event => setBookingForm({ ...bookingForm, first_name: event.target.value })} placeholder="Given name" /></label><label>Last name<input value={bookingForm.last_name} onChange={event => setBookingForm({ ...bookingForm, last_name: event.target.value })} placeholder="Surname" /></label><label>Passport no.<input value={bookingForm.passport_no} onChange={event => setBookingForm({ ...bookingForm, passport_no: event.target.value })} placeholder="Passport number" /></label><label>Nationality code<input value={bookingForm.nationality_code} onChange={event => setBookingForm({ ...bookingForm, nationality_code: event.target.value.toUpperCase() })} placeholder="ISO country code" maxLength={3} /></label><label>Birth date (DD/MM/YYYY)<span className="field-hint" title="รูปแบบมาตรฐาน สตม.: วัน/เดือน/ปี ค.ศ. (เช่น 17/05/1992)">📅 วัน/เดือน/ปี ค.ศ. (DD/MM/YYYY)</span><input placeholder="DD/MM/YYYY" value={bookingForm.birth_date} onChange={event => setBookingForm({ ...bookingForm, birth_date: event.target.value })} /></label><label>Phone no.<input value={bookingForm.phone_no} onChange={event => setBookingForm({ ...bookingForm, phone_no: event.target.value })} placeholder="Optional" /></label></div><div className="modal-actions"><button className="button button-quiet" type="button" onClick={() => setShowAdd(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={createBooking.isPending}>{createBooking.isPending ? 'Saving…' : 'Save booking'}</button></div></form></div>}
      {showExport && <div className="modal-backdrop" onMouseDown={() => setShowExport(false)}><div className="modal-card export-modal" onMouseDown={event => event.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">TM.30 / Server export preflight</div><h2>Prepare guest file</h2></div><button className="icon-button" onClick={() => setShowExport(false)}><X size={17} /></button></div><p className="modal-lede">The server reads the current hotel&apos;s persisted booking and guest records under RLS, validates them, and writes the official Immigration template.</p>{exportTm30.error && <p className="form-error" role="alert">{exportTm30.error.message}</p>}<div className="preflight-list"><div className="preflight-item done"><i>✓</i><div><strong>Booking scope selected</strong><span>{bookings.length} stored booking records in this hotel</span></div></div><div className="preflight-item done"><i>✓</i><div><strong>Template mapping enforced server-side</strong><span>ICAO nationality codes and required guest fields are validated before the file is created</span></div></div><div className="preflight-item warning"><i>!</i><div><strong>Upload manually after download</strong><span>TM.30 portal connection remains intentionally out of scope</span></div></div></div><div className="template-note"><FileSpreadsheet size={17} /><span><strong>Template-InformAccom-ImportExcel.xls</strong><small>Official template supplied for this project</small></span><span className="template-tag">Mapped</span></div><div className="modal-actions"><button className="button button-quiet" onClick={() => setShowExport(false)}>Cancel</button><button className="button button-primary" disabled={exportTm30.isPending || !bookings.length} onClick={() => exportTm30.mutate(id)}><Download size={15} /> {exportTm30.isPending ? 'Preparing…' : 'Download .xlsx'}</button></div></div></div>}
      {showPreview && <div className="modal-backdrop" onMouseDown={() => setShowPreview(false)}><div className="modal-card preview-modal" style={{ maxWidth: '960px', width: '95vw' }} onMouseDown={event => event.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">TM.30 / Immigration Bureau standard format</div><h2>TM.30 Export Preview</h2></div><button className="icon-button" onClick={() => setShowPreview(false)}><X size={17} /></button></div><p className="modal-lede">Review the exact tabular structure, DD/MM/YYYY dates, and guest fields prior to downloading the official Excel/CSV template.</p>{previewQuery.isLoading ? <div className="panel page-state">Loading preview data…</div> : previewQuery.error ? <p className="form-error">Failed to load preview: {previewQuery.error.message}</p> : <div className="table-wrap" style={{ maxHeight: '420px', overflowY: 'auto', marginTop: '1rem' }}><table className="data-table"><thead><tr>{previewQuery.data?.headers.map((h, i) => <th key={i} style={{ whiteSpace: 'pre-line', fontSize: '0.8rem' }}>{h}</th>)}</tr></thead><tbody>{previewQuery.data?.rows.length ? previewQuery.data.rows.map((row, rIdx) => <tr key={rIdx}>{row.map((cell, cIdx) => <td key={cIdx}>{cell}</td>)}</tr>) : <tr><td colSpan={9} className="empty-cell">No valid guest records found for TM.30 preview. Ensure guests have full name, passport, nationality code, and birth date.</td></tr>}</tbody></table></div>}<div className="modal-actions" style={{ marginTop: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ display: 'flex', gap: '0.5rem' }}><button className="button button-quiet" onClick={downloadCsvPreview} disabled={!previewQuery.data || !previewQuery.data.rows.length}><Download size={15} /> Download CSV</button><button className="button button-quiet" onClick={downloadPdfPreview} disabled={!previewQuery.data || !previewQuery.data.rows.length}><Download size={15} /> Export PDF / Print</button></div><div style={{ display: 'flex', gap: '0.5rem' }}><button className="button button-quiet" onClick={() => setShowPreview(false)}>Close</button><button className="button button-primary" onClick={() => { setShowPreview(false); setShowExport(true); }}><Download size={15} /> Official Excel (.xlsx)</button></div></div></div></div>}
    </div>
  );
}

import { useState } from 'react';
import { useHotel } from '@/contexts/HotelContext';
import { trpc } from '@/lib/trpc';
import { bangkokMonth } from '@shared/finance';
import { shiftMonth } from './financialsPeriod';
import type { buildBookingsReport } from '@/../../server/bookingsReport';

type Report = ReturnType<typeof buildBookingsReport>;
export type PeriodChoice = { kind: 'month'; month: string } | { kind: 'range'; from: string; to: string };
export const formatReportNumber = (value: number, digits = 0) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
export const formatReportMoney = (value: number) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(value);
export const formatReportDate = (value: string, locale: string) => new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
export const formatReportMonth = (value: string, locale: string) => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function reportBookingsCsv(rows: Report['rows'], headers: readonly string[]) {
  return [headers.map(csvCell).join(','), ...rows.map(row => [row.id, row.guestName, row.roomType, row.checkIn, row.checkOut, row.nights, row.status, ...('amount' in row && row.amount !== undefined ? [row.amount.toFixed(2)] : [])].map(csvCell).join(','))].join('\n');
}
export function useBookingsReport() {
  const { selectedHotelId } = useHotel();
  const currentMonth = bangkokMonth();
  const [choice, setChoice] = useState<PeriodChoice>({ kind: 'month', month: currentMonth });
  const [basis, setBasis] = useState<'stay' | 'created'>('stay');
  const [rangeDraft, setRangeDraft] = useState({ from: `${currentMonth}-01`, to: `${currentMonth}-01` });
  const query = trpc.channelManager.bookingsReport.useQuery({
    hotelId: selectedHotelId ?? '00000000-0000-0000-0000-000000000000',
    period: choice.kind === 'month' ? { month: choice.month } : { from: choice.from, to: choice.to },
    basis,
  }, { enabled: Boolean(selectedHotelId), placeholderData: previous => previous });
  const chooseMonth = (delta: number) => setChoice({ kind: 'month', month: shiftMonth(choice.kind === 'month' ? choice.month : currentMonth, delta) });
  const chooseCurrentMonth = () => setChoice({ kind: 'month', month: currentMonth });
  const applyRange = () => { if (rangeDraft.from && rangeDraft.to && rangeDraft.from <= rangeDraft.to) setChoice({ kind: 'range', ...rangeDraft }); };
  const exportCsv = (headers: readonly string[]) => {
    if (!query.data) return;
    const blob = new Blob(['\uFEFF' + reportBookingsCsv(query.data.rows, headers)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `bookings-report-${query.data.periodStart}_${query.data.periodEnd}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };
  return { selectedHotelId, currentMonth, choice, basis, setBasis, rangeDraft, setRangeDraft, query, chooseMonth, chooseCurrentMonth, applyRange, exportCsv };
}

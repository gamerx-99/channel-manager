import { BarChart3, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Download, Percent, QrCode, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { PageState } from "@/components/PageState";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { FinancialsBookingRow, FinancialsRoomTypeBreakdown } from "@/../../server/financials";
import { useState } from "react";
import { useHotel } from "@/contexts/HotelContext";
import { hasHotelPermission } from "@shared/authorization";
import { Link } from "wouter";
import { useTranslation } from "@/lib/i18n";
import { dateLocale } from "@/lib/dateLocale";
import { bangkokMonth } from "@shared/finance";
import { CSV_BOM, bookingsCsv, financialsQueryInput, shiftMonth, type FinancialsChoice } from "./financialsPeriod";

const chartConfig = {
  bookings: { label: "Bookings", color: "#1d6b56" },
  revenue: { label: "Revenue", color: "#d48a3a" },
} satisfies ChartConfig;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDateLabel(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(new Date(`${value}T00:00:00.000Z`));
}

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCsvFile(fileName: string, csvContent: string) {
  const blob = new Blob([CSV_BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function periodFileTag(periodStart: string, periodEnd: string) {
  return `${periodStart}_${periodEnd}`;
}

function downloadRoomTypeCsv(rows: FinancialsRoomTypeBreakdown[], periodStart: string, periodEnd: string) {
  const headers = ["Room type", "Bookings", "Revenue", "Average booking value"];
  const csvContent = [
    headers.map(escapeCsv).join(","),
    ...rows.map(row => [row.name, String(row.bookings), row.revenue.toFixed(2), row.averageBookingValue.toFixed(2)].map(escapeCsv).join(",")),
  ].join("\n");
  downloadCsvFile(`financials-revenue-by-room-type-${periodFileTag(periodStart, periodEnd)}.csv`, csvContent);
}

function downloadBookingsCsv(rows: FinancialsBookingRow[], periodStart: string, periodEnd: string) {
  downloadCsvFile(`financials-bookings-${periodFileTag(periodStart, periodEnd)}.csv`, bookingsCsv(rows));
}

function formatMonthLabel(month: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00.000Z`));
}

/** Chooses the period of the report: the last 30 days, or a Thai calendar month with previous / next / this month. */
export function PeriodPicker({ choice, onChange, locale, currentMonth }: { choice: FinancialsChoice; onChange: (choice: FinancialsChoice) => void; locale: string; currentMonth: string }) {
  const { t } = useTranslation();
  const month = choice.kind === "month" ? choice.month : currentMonth;
  return (
    <div className="financials-period-picker" role="group" aria-label={t("financials.periodPickerAria")}>
      <button type="button" className={cn("button button-quiet", choice.kind === "last30" && "is-active")} aria-pressed={choice.kind === "last30"} onClick={() => onChange({ kind: "last30" })}>
        {t("financials.periodLast30")}
      </button>
      <button type="button" className="button button-quiet" aria-label={t("financials.periodPreviousMonth")} onClick={() => onChange({ kind: "month", month: shiftMonth(month, -1) })}>
        <ChevronLeft size={14} aria-hidden="true" />
      </button>
      <span className="financials-period-label" aria-live="polite">{choice.kind === "month" ? formatMonthLabel(choice.month, locale) : t("financials.periodPickMonth")}</span>
      <button type="button" className="button button-quiet" aria-label={t("financials.periodNextMonth")} disabled={choice.kind === "month" && choice.month >= currentMonth} onClick={() => onChange({ kind: "month", month: shiftMonth(month, 1) })}>
        <ChevronRight size={14} aria-hidden="true" />
      </button>
      <button type="button" className={cn("button button-quiet", choice.kind === "month" && choice.month === currentMonth && "is-active")} aria-pressed={choice.kind === "month" && choice.month === currentMonth} onClick={() => onChange({ kind: "month", month: currentMonth })}>
        {t("financials.periodThisMonth")}
      </button>
    </div>
  );
}

function LoadingDashboard() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label={t("financials.loadingAriaLabel")}>
      <div className="flex items-center gap-3 rounded-xl border border-[#dce4df] bg-[#f6faf7] px-4 py-3 text-sm text-[#456156]">
        <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-[#9bbcae] border-t-[#1d6b56]" aria-hidden="true" />
        <span>{t("financials.loadingData")}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {["revenue", "average", "occupancy", "properties"].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-2xl border border-[#e5ebe7] bg-white" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="h-[360px] animate-pulse rounded-2xl border border-[#e5ebe7] bg-white" />
        <div className="h-[360px] animate-pulse rounded-2xl border border-[#e5ebe7] bg-white" />
      </div>
    </div>
  );
}

export default function Financials() {
  const { t, language } = useTranslation();
  const locale = dateLocale(language);
  const { hotels, selectedHotelId } = useHotel();
  const hotelId = selectedHotelId ?? hotels[0]?.id;
  const authMeQuery = trpc.auth.me.useQuery();
  const canManagePaymentSettings = Boolean(hotelId) && hasHotelPermission(authMeQuery.data?.roles ?? [], authMeQuery.data?.memberships ?? [], hotelId!, "property.manage_profile");
  const currentMonth = bangkokMonth();
  const [choice, setChoice] = useState<FinancialsChoice>({ kind: "last30" });
  // Keep the previous figures on screen while the next period loads, so the page does not flash.
  const { data, isLoading, isError, refetch, isFetching } = trpc.channelManager.financials.useQuery(financialsQueryInput(choice), { placeholderData: previous => previous });
  if (isLoading) return <LoadingDashboard />;

  if (isError || !data) {
    return (
      <PageState
        tone="error"
        title={t("financials.unableToLoadTitle")}
        description={t("financials.unableToLoadDesc")}
        actionLabel={t("financials.tryAgain")}
        onAction={() => void refetch()}
      />
    );
  }

  return (
    <div className="page-content financials-page">
      <section className="page-intro intro-split">
        <div>
          <div className="eyebrow">{t("financials.eyebrow")}</div>
          <h1>{t("financials.title")}<span className="title-mark">.</span></h1>
          <p className="lede">{t("financials.lede")}</p>
        </div>
        <div className="field-help flex items-center gap-2">
          <Clock3 size={14} aria-hidden="true" />
          <span>{t("financials.periodRange", { start: formatDateLabel(data.periodStart, locale), end: formatDateLabel(data.periodEnd, locale) })}</span>
          {isFetching && <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#b7c9c0] border-t-[#1d6b56]" aria-label={t("financials.updatingDataAriaLabel")} />}
        </div>
      </section>

      <section className="panel financials-period-panel">
        <div className="panel-heading"><div><div className="eyebrow">{t("financials.eyebrow")}</div><h2>{t("financials.periodTitle")}</h2></div></div>
        <PeriodPicker choice={choice} onChange={setChoice} locale={locale} currentMonth={currentMonth} />
      </section>

      <section className="panel financials-summary-panel">
        <div className="panel-heading"><div><div className="eyebrow">{t("financials.eyebrow")}</div><h2>{t("financials.summaryAria")}</h2></div></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("financials.summaryAria")}>
        <MetricCard label={t("financials.totalRevenue")} value={formatCurrency(data.totals.revenue)} detail={t("financials.cancelledCount", { count: data.totals.cancelledBookings })} icon={CircleDollarSign} tone="amber" />
        <MetricCard label={t("financials.avgBookingValue")} value={formatCurrency(data.totals.averageBookingValue)} detail={t("financials.activeBookingsCount", { count: data.totals.bookings })} icon={TrendingUp} tone="pine" />
        <MetricCard label={t("financials.occupiedNights")} value={formatCompactNumber(data.totals.occupancyNights)} detail={t("financials.periodRange", { start: formatDateLabel(data.periodStart, locale), end: formatDateLabel(data.periodEnd, locale) })} icon={Percent} tone="slate" />
        <MetricCard label={t("financials.properties")} value={formatCompactNumber(data.totals.hotelCount)} detail={t("financials.includedInReport")} icon={BarChart3} tone="pine" />
        </div>
      </section>

      <section className="panel financials-summary-panel">
        <div className="panel-heading"><div><div className="eyebrow">{t("financials.eyebrow")}</div><h2>{t("financials.paymentCollectionAria")}</h2></div></div>
        <div className="grid gap-4 sm:grid-cols-3" aria-label={t("financials.paymentCollectionAria")}>
        <MetricCard label={t("financials.collectedRevenue")} value={formatCurrency(data.totals.collectedRevenue ?? 0)} detail={t("financials.collectedRevenueDetail")} icon={CircleDollarSign} tone="pine" />
        <MetricCard label={t("financials.outstandingRevenue")} value={formatCurrency(data.totals.outstandingRevenue ?? 0)} detail={t("financials.outstandingRevenueDetail")} icon={Clock3} tone="amber" />
        <MetricCard label={t("financials.pendingRevenue")} value={formatCurrency(data.totals.pendingRevenue ?? 0)} detail={t("financials.pendingRevenueDetail")} icon={QrCode} tone="slate" />
        </div>
      </section>

      <section className="panel financials-charts-panel">
        <div className="panel-heading"><div><div className="eyebrow">{t("financials.eyebrow")}</div><h2>{t("financials.revenueTrendTitle")}</h2></div></div>
        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardHeader className="border-b border-[#edf2ee] pb-4">
            <CardTitle className="text-lg text-[#263b31]">{t("financials.revenueTrendTitle")}</CardTitle>
            <CardDescription>{t("financials.revenueTrendDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            <ChartContainer config={chartConfig} className="h-[300px] w-full aspect-auto">
              <AreaChart data={data.trend} margin={{ left: 4, right: 10, top: 8, bottom: 4 }}>
                <defs>
                  <linearGradient id="financialsRevenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#e8efea" />
                <XAxis dataKey="date" tickFormatter={(value) => formatDateLabel(String(value), locale)} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => formatDateLabel(String(value), locale)} formatter={(value) => <><span className="text-muted-foreground">{t("financials.revenue")}</span><span className="font-mono font-medium">{formatCurrency(Number(value))}</span></>} />} />
                <Area type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={2.5} fill="url(#financialsRevenueFill)" activeDot={{ r: 5 }} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-[#edf2ee] pb-4">
            <div>
              <CardTitle className="text-lg text-[#263b31]">{t("financials.revenueByRoomTypeTitle")}</CardTitle>
              <CardDescription>{t("financials.revenueByRoomTypeDesc")}</CardDescription>
            </div>
            {data.roomTypeBreakdown.length > 0 && (
              <button
                type="button"
                onClick={() => downloadRoomTypeCsv(data.roomTypeBreakdown, data.periodStart, data.periodEnd)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#cfe0d6] bg-[#f6faf7] px-2.5 py-1.5 text-xs font-medium text-[#39715c] hover:bg-[#edf7f1]"
              >
                <Download size={13} aria-hidden="true" /> {t("financials.downloadCsv")}
              </button>
            )}
          </CardHeader>
          <CardContent className="pt-5">
            {data.roomTypeBreakdown.length ? (
              <ChartContainer config={chartConfig} className="h-[270px] w-full aspect-auto">
                <BarChart data={data.roomTypeBreakdown} layout="vertical" margin={{ left: 8, right: 18, top: 5, bottom: 5 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="4 4" stroke="#e8efea" />
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis type="category" dataKey="name" width={104} tickLine={false} axisLine={false} tick={{ fill: "#62766b", fontSize: 12 }} />
                  <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(value) => <><span className="text-muted-foreground">{t("financials.revenue")}</span><span className="font-mono font-medium">{formatCurrency(Number(value))}</span></>} />} />
                  <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[0, 5, 5, 0]} barSize={24} />
                </BarChart>
              </ChartContainer>
            ) : (
              <PageState tone="empty" title={t("financials.noRoomTypeRevenueTitle")} description={t("financials.noRoomTypeRevenueDesc")} />
            )}
          </CardContent>
        </Card>
        </div>
      </section>

      <section className="panel financials-bookings-panel">
        <div className="panel-heading">
          <div><div className="eyebrow">{t("financials.eyebrow")}</div><h2>{t("financials.bookingsExportTitle")}</h2></div>
          {data.bookings.length > 0 && (
            <button type="button" id="financials-bookings-csv" className="button button-quiet" onClick={() => downloadBookingsCsv(data.bookings, data.periodStart, data.periodEnd)}>
              <Download size={13} aria-hidden="true" /> {t("financials.downloadBookingsCsv")}
            </button>
          )}
        </div>
        <p className="field-help financials-bookings-help">{data.bookings.length > 0 ? t("financials.bookingsExportDesc", { count: data.bookings.length }) : t("financials.bookingsExportEmpty")}</p>
      </section>
      {hotelId && canManagePaymentSettings && <p className="field-help"><Link href={`/hotels/${hotelId}/settings/finance`}>{t("hotelPaymentSettings.manageLink")}</Link></p>}
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof TrendingUp; tone: "pine" | "amber" | "slate" }) {
  const toneClass = {
    pine: "bg-[#edf7f1] text-[#1d6b56]",
    amber: "bg-[#fff4e7] text-[#a86520]",
    slate: "bg-[#eef2f5] text-[#556a7b]",
  }[tone];
  return (
    <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">{label}</p>
          <span className={cn("rounded-xl p-2", toneClass)}><Icon size={17} aria-hidden="true" /></span>
        </div>
        <p className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[#263b31]">{value}</p>
        <p className="mt-1 text-xs text-[#778a80]">{detail}</p>
      </CardContent>
    </Card>
  );
}

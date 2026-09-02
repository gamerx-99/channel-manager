import { BarChart3, CircleDollarSign, Clock3, Download, Percent, QrCode, TrendingUp } from "lucide-react";
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
import type { FinancialsRoomTypeBreakdown } from "@/../../server/financials";
import { useState } from "react";
import { useHotel } from "@/contexts/HotelContext";
import { useTranslation } from "@/lib/i18n";

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

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(`${value}T00:00:00.000Z`));
}

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadRoomTypeCsv(rows: FinancialsRoomTypeBreakdown[]) {
  const headers = ["Room type", "Bookings", "Revenue", "Average booking value"];
  const csvContent = [
    headers.map(escapeCsv).join(","),
    ...rows.map(row => [row.name, String(row.bookings), row.revenue.toFixed(2), row.averageBookingValue.toFixed(2)].map(escapeCsv).join(",")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `financials-revenue-by-room-type-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
  const { t } = useTranslation();
  const { hotels, selectedHotelId } = useHotel();
  const hotelId = selectedHotelId ?? hotels[0]?.id;
  const { data, isLoading, isError, refetch, isFetching } = trpc.channelManager.financials.useQuery();

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
    <div className="space-y-7 pb-8">
      <section className="flex flex-col gap-5 border-b border-[#dce4df] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">{t("financials.eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#1b2c25] sm:text-4xl">{t("financials.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6c7e75]">
            {t("financials.lede")}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#70837a]">
          <Clock3 size={14} aria-hidden="true" />
          <span>{t("financials.last30Days", { start: formatDateLabel(data.periodStart), end: formatDateLabel(data.periodEnd) })}</span>
          {isFetching && <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#b7c9c0] border-t-[#1d6b56]" aria-label={t("financials.updatingDataAriaLabel")} />}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("financials.summaryAria")}>
        <MetricCard label={t("financials.totalRevenue")} value={formatCurrency(data.totals.revenue)} detail={t("financials.cancelledCount", { count: data.totals.cancelledBookings })} icon={CircleDollarSign} tone="amber" />
        <MetricCard label={t("financials.avgBookingValue")} value={formatCurrency(data.totals.averageBookingValue)} detail={t("financials.activeBookingsCount", { count: data.totals.bookings })} icon={TrendingUp} tone="pine" />
        <MetricCard label={t("financials.occupiedNights")} value={formatCompactNumber(data.totals.occupancyNights)} detail={t("financials.last30DaysDetail")} icon={Percent} tone="slate" />
        <MetricCard label={t("financials.properties")} value={formatCompactNumber(data.totals.hotelCount)} detail={t("financials.includedInReport")} icon={BarChart3} tone="pine" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
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
                <XAxis dataKey="date" tickFormatter={formatDateLabel} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => formatDateLabel(String(value))} formatter={(value) => <><span className="text-muted-foreground">{t("financials.revenue")}</span><span className="font-mono font-medium">{formatCurrency(Number(value))}</span></>} />} />
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
                onClick={() => downloadRoomTypeCsv(data.roomTypeBreakdown)}
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
      </section>

      {hotelId && <PromptPaySettings hotelId={hotelId} />}
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

// ─── Phase 12B: PromptPay QR Settings (per-hotel) ────────────────────────────

function PromptPaySettings({ hotelId }: { hotelId: string }) {
  const { t } = useTranslation();
  const [promptPayId, setPromptPayId] = useState("");
  const [timeoutMin, setTimeoutMin] = useState(15);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const savePromptPay = trpc.slipok.savePromptPayId.useMutation({
    onSuccess() {
      setSaved(true);
      setSaveError(null);
      setPromptPayId("");
      setTimeout(() => setSaved(false), 3000);
    },
    onError(err) {
      setSaveError(err.message);
    },
  });

  function handleSave() {
    setSaveError(null);
    setSaved(false);
    savePromptPay.mutate({
      hotel_id: hotelId,
      promptpay_id: promptPayId.replace(/\D/g, ""),
      payment_timeout_minutes: timeoutMin,
    });
  }

  return (
    <section aria-labelledby="promptpay-settings-heading">
      <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-[#edf7f1] p-2 text-[#1d6b56]">
              <QrCode size={18} aria-hidden="true" />
            </span>
            <div>
              <CardTitle id="promptpay-settings-heading" className="text-base font-semibold text-[#1b2c25]">
                {t("financials.promptPayTitle")}
              </CardTitle>
              <CardDescription className="text-xs text-[#6c7e75]">
                {t("financials.promptPayDesc")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="promptpay-id-input" className="mb-1 block text-xs font-medium text-[#456156]">
                {t("financials.promptPayIdLabel")}
              </label>
              <input
                id="promptpay-id-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={promptPayId}
                onChange={(e) => setPromptPayId(e.target.value.replace(/\D/g, ""))}
                placeholder="0812345678"
                maxLength={13}
                className="w-full rounded-lg border border-[#dce4df] px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1d6b56]"
              />
            </div>
            <div className="w-44">
              <label htmlFor="promptpay-timeout" className="mb-1 block text-xs font-medium text-[#456156]">
                {t("financials.timeoutLabel")}
              </label>
              <select
                id="promptpay-timeout"
                value={timeoutMin}
                onChange={(e) => setTimeoutMin(Number(e.target.value))}
                className="w-full rounded-lg border border-[#dce4df] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d6b56]"
              >
                {[5, 10, 15, 20, 30, 60].map((m) => (
                  <option key={m} value={m}>{t("financials.minutes", { count: m })}</option>
                ))}
              </select>
            </div>
          </div>

          {saveError && <p className="text-xs text-red-600" role="alert">{saveError}</p>}
          {saved && <p className="text-xs text-[#1d6b56]" role="status">{t("financials.savedSuccess")}</p>}

          <button
            id="promptpay-save-btn"
            type="button"
            disabled={promptPayId.replace(/\D/g, "").length < 10 || savePromptPay.isPending}
            onClick={handleSave}
            className="w-max rounded-lg border border-[#1d6b56] bg-[#1d6b56] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a5e4c] disabled:opacity-50 transition-colors"
          >
            {savePromptPay.isPending ? t("financials.saving") : t("financials.savePromptPayId")}
          </button>

          <p className="text-xs text-[#789087]">
            {t("financials.promptPayDisclaimer")}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

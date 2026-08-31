import { BarChart3, CircleDollarSign, Clock3, Download, KeyRound, Percent, QrCode, ShieldCheck, TrendingUp, Trash2 } from "lucide-react";
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
import { useMfaStepUp } from "@/lib/mfa";
import { useHotel } from "@/contexts/HotelContext";

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
  const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
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
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="กำลังโหลดข้อมูลรายได้">
      <div className="flex items-center gap-3 rounded-xl border border-[#dce4df] bg-[#f6faf7] px-4 py-3 text-sm text-[#456156]">
        <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-[#9bbcae] border-t-[#1d6b56]" aria-hidden="true" />
        <span>Loading financials data…</span>
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
  const { hotels, selectedHotelId } = useHotel();
  const hotelId = selectedHotelId ?? hotels[0]?.id;
  const { data, isLoading, isError, refetch, isFetching } = trpc.channelManager.financials.useQuery();

  if (isLoading) return <LoadingDashboard />;

  if (isError || !data) {
    return (
      <PageState
        tone="error"
        title="Unable to load financials"
        description="The revenue report could not be retrieved for the properties visible to your account."
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-7 pb-8">
      <section className="flex flex-col gap-5 border-b border-[#dce4df] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Financials / Revenue</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#1b2c25] sm:text-4xl">Financials</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6c7e75]">
            Revenue collected from bookings across the properties you own, private to your account.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#70837a]">
          <Clock3 size={14} aria-hidden="true" />
          <span>Last 30 days &middot; {formatDateLabel(data.periodStart)} &ndash; {formatDateLabel(data.periodEnd)}</span>
          {isFetching && <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#b7c9c0] border-t-[#1d6b56]" aria-label="กำลังอัปเดตข้อมูล" />}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Financials summary">
        <MetricCard label="Total revenue" value={formatCurrency(data.totals.revenue)} detail={`${data.totals.cancelledBookings} cancelled`} icon={CircleDollarSign} tone="amber" />
        <MetricCard label="Avg. booking value" value={formatCurrency(data.totals.averageBookingValue)} detail={`${data.totals.bookings} active bookings`} icon={TrendingUp} tone="pine" />
        <MetricCard label="Occupied nights" value={formatCompactNumber(data.totals.occupancyNights)} detail="Last 30 days" icon={Percent} tone="slate" />
        <MetricCard label="Properties" value={formatCompactNumber(data.totals.hotelCount)} detail="Included in this report" icon={BarChart3} tone="pine" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardHeader className="border-b border-[#edf2ee] pb-4">
            <CardTitle className="text-lg text-[#263b31]">Revenue trend</CardTitle>
            <CardDescription>Revenue collected by check-in date.</CardDescription>
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
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => formatDateLabel(String(value))} formatter={(value) => <><span className="text-muted-foreground">Revenue</span><span className="font-mono font-medium">{formatCurrency(Number(value))}</span></>} />} />
                <Area type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={2.5} fill="url(#financialsRevenueFill)" activeDot={{ r: 5 }} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-[#edf2ee] pb-4">
            <div>
              <CardTitle className="text-lg text-[#263b31]">Revenue by room type</CardTitle>
              <CardDescription>Which room types earned the most.</CardDescription>
            </div>
            {data.roomTypeBreakdown.length > 0 && (
              <button
                type="button"
                onClick={() => downloadRoomTypeCsv(data.roomTypeBreakdown)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#cfe0d6] bg-[#f6faf7] px-2.5 py-1.5 text-xs font-medium text-[#39715c] hover:bg-[#edf7f1]"
              >
                <Download size={13} aria-hidden="true" /> CSV
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
                  <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(value) => <><span className="text-muted-foreground">Revenue</span><span className="font-mono font-medium">{formatCurrency(Number(value))}</span></>} />} />
                  <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[0, 5, 5, 0]} barSize={24} />
                </BarChart>
              </ChartContainer>
            ) : (
              <PageState tone="empty" title="No room type revenue yet" description="Bookings will appear here once check-ins fall within the last 30 days." />
            )}
          </CardContent>
        </Card>
      </section>

      {hotelId && <SlipOkSettings hotelId={hotelId} />}
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

// ─── Phase 01: SlipOK Payment Settings (per-hotel, MFA-gated) ────────────────

function SlipOkSettings({ hotelId }: { hotelId: string }) {
  const { mfaState, triggerStepUp, submitTotp, reset } = useMfaStepUp();
  const [apiKey, setApiKey] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  // We can't fetch settings until MFA is verified (server enforces it too)
  const settingsQuery = trpc.slipok.getSettings.useQuery(
    { hotel_id: hotelId },
    { enabled: mfaState.status === "verified", retry: false },
  );
  const saveKey = trpc.slipok.saveKey.useMutation();
  const removeKey = trpc.slipok.removeKey.useMutation();

  async function handleOpenSettings() {
    setSaveError(null);
    const result = await triggerStepUp();
    if (result === "needs_enroll") {
      window.location.href = "/mfa/enroll";
    }
  }

  async function handleSaveKey(hotelId: string) {
    setSaveError(null);
    try {
      await saveKey.mutateAsync({ hotel_id: hotelId, api_key: apiKey });
      setApiKey("");
      void settingsQuery.refetch();
      reset();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save key.");
    }
  }

  async function handleRemoveKey(hotelId: string) {
    setSaveError(null);
    const result = await triggerStepUp();
    if (result === "needs_enroll") { window.location.href = "/mfa/enroll"; return; }
    if (result === "verified" || mfaState.status === "verified") {
      try {
        await removeKey.mutateAsync({ hotel_id: hotelId });
        void settingsQuery.refetch();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Failed to remove key.");
      }
    }
  }

  return (
    <section aria-label="Payment Settings" className="border-t border-[#dce4df] pt-7">
      <div className="mb-4">
        <p className="eyebrow">Payment Integration</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#1b2c25]">SlipOK Settings</h2>
        <p className="mt-1 text-sm text-[#6c7e75]">
          Connect your hotel's SlipOK API key to enable bank-transfer slip verification for guest payments.
          Your key is encrypted and never visible after saving.
        </p>
      </div>

      <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
        <CardContent className="p-6">
          {/* Idle / prompt to unlock */}
          {(mfaState.status === "idle" || mfaState.status === "error") && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-[#edf7f1] p-2 text-[#1d6b56]"><ShieldCheck size={18} aria-hidden="true" /></span>
                <div>
                  <p className="text-sm font-medium text-[#263b31]">MFA verification required</p>
                  <p className="text-xs text-[#6c7e75]">Verify your authenticator code to access payment settings.</p>
                </div>
              </div>
              <button
                id="slipok-unlock-btn"
                type="button"
                onClick={handleOpenSettings}
                className="inline-flex items-center gap-2 rounded-lg border border-[#1d6b56] bg-[#1d6b56] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a5e4c] transition-colors"
              >
                <KeyRound size={15} aria-hidden="true" /> Unlock settings
              </button>
              {mfaState.status === "error" && (
                <p className="text-xs text-red-600">{mfaState.message}</p>
              )}
            </div>
          )}

          {/* TOTP challenge input */}
          {mfaState.status === "needs_challenge" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-[#263b31]">Enter your 6-digit authenticator code</p>
              <div className="flex gap-2">
                <input
                  id="slipok-totp-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  className="w-32 rounded-lg border border-[#dce4df] px-3 py-2 text-center font-mono text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1d6b56]"
                />
                <button
                  id="slipok-totp-submit"
                  type="button"
                  onClick={async () => {
                    const ok = await submitTotp(totpCode);
                    if (ok) setTotpCode("");
                  }}
                  disabled={totpCode.length !== 6}
                  className="rounded-lg border border-[#1d6b56] bg-[#1d6b56] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a5e4c] disabled:opacity-50 transition-colors"
                >
                  Verify
                </button>
                <button type="button" onClick={() => { reset(); setTotpCode(""); }} className="rounded-lg border border-[#dce4df] px-3 py-2 text-sm text-[#6c7e75] hover:bg-[#f6faf7]">Cancel</button>
              </div>
            </div>
          )}

          {mfaState.status === "pending" && (
            <div className="flex items-center gap-2 text-sm text-[#6c7e75]">
              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-[#b7c9c0] border-t-[#1d6b56]" aria-hidden="true" />
              Verifying&hellip;
            </div>
          )}

          {mfaState.status === "needs_enroll" && (
            <div className="text-sm text-[#6c7e75]">
              No MFA factor enrolled. <a href="/mfa/enroll" className="text-[#1d6b56] underline">Set up authenticator app</a> first.
            </div>
          )}

          {/* Verified — show settings */}
          {mfaState.status === "verified" && settingsQuery.data !== undefined && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <span className={cn("rounded-xl p-2", settingsQuery.data.configured ? "bg-[#edf7f1] text-[#1d6b56]" : "bg-[#f5f7f6] text-[#789087]")}>
                  <KeyRound size={18} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium text-[#263b31]">
                    {settingsQuery.data.configured ? "SlipOK key configured" : "No SlipOK key configured"}
                  </p>
                  <p className="text-xs text-[#6c7e75]">
                    {settingsQuery.data.configured
                      ? "Your API key is stored encrypted. It cannot be retrieved or displayed."
                      : "Enter your SlipOK API key below to enable slip verification."}
                  </p>
                </div>
              </div>

              {!settingsQuery.data.configured && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label htmlFor="slipok-api-key" className="mb-1 block text-xs font-medium text-[#456156]">
                      SlipOK API Key
                    </label>
                    <input
                      id="slipok-api-key"
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-…"
                      className="w-full rounded-lg border border-[#dce4df] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d6b56]"
                    />
                  </div>
                  <button
                    id="slipok-save-btn"
                    type="button"
                    disabled={apiKey.length < 8 || saveKey.isPending}
                    onClick={() => void handleSaveKey(hotelId)}
                    className="rounded-lg border border-[#1d6b56] bg-[#1d6b56] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a5e4c] disabled:opacity-50 transition-colors"
                  >
                    {saveKey.isPending ? "Saving…" : "Save key"}
                  </button>
                </div>
              )}

              {settingsQuery.data.configured && (
                <button
                  id="slipok-remove-btn"
                  type="button"
                  onClick={() => void handleRemoveKey(hotelId)}
                  disabled={removeKey.isPending}
                  className="inline-flex w-max items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  <Trash2 size={14} aria-hidden="true" />
                  {removeKey.isPending ? "Removing…" : "Remove SlipOK key"}
                </button>
              )}

              {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ─── Phase 12B: PromptPay QR Settings (per-hotel) ────────────────────────────

function PromptPaySettings({ hotelId }: { hotelId: string }) {
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
                PromptPay Settings
              </CardTitle>
              <CardDescription className="text-xs text-[#6c7e75]">
                ตั้งค่า PromptPay ID เพื่อสร้าง QR Code สำหรับรับชำระเงินจากลูกค้าโดยตรง
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="promptpay-id-input" className="mb-1 block text-xs font-medium text-[#456156]">
                PromptPay ID (เบอร์โทร 10 หลัก หรือ บัตรประชาชน/Tax ID 13 หลัก)
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
                หมดเวลาใน (นาที)
              </label>
              <select
                id="promptpay-timeout"
                value={timeoutMin}
                onChange={(e) => setTimeoutMin(Number(e.target.value))}
                className="w-full rounded-lg border border-[#dce4df] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d6b56]"
              >
                {[5, 10, 15, 20, 30, 60].map((m) => (
                  <option key={m} value={m}>{m} นาที</option>
                ))}
              </select>
            </div>
          </div>

          {saveError && <p className="text-xs text-red-600" role="alert">{saveError}</p>}
          {saved && <p className="text-xs text-[#1d6b56]" role="status">บันทึกสำเร็จ ✓</p>}

          <button
            id="promptpay-save-btn"
            type="button"
            disabled={promptPayId.replace(/\D/g, "").length < 10 || savePromptPay.isPending}
            onClick={handleSave}
            className="w-max rounded-lg border border-[#1d6b56] bg-[#1d6b56] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a5e4c] disabled:opacity-50 transition-colors"
          >
            {savePromptPay.isPending ? "กำลังบันทึก…" : "บันทึก PromptPay ID"}
          </button>

          <p className="text-xs text-[#789087]">
            PromptPay ID ใช้สำหรับสร้าง QR Code เท่านั้น ลูกค้าจ่ายตรงเข้าบัญชีของที่พัก แพลตฟอร์มไม่รับหรือถือเงิน
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

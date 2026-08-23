import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Wifi,
  XCircle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { PageState } from "@/components/PageState";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { ChannelPerformanceChannel } from "@/../../server/channelPerformance";
import { filterChannelPerformanceChannels, type ChannelFilter } from "./ChannelPerformance.utils";

const FILTERS: Array<{ value: ChannelFilter; label: string }> = [
  { value: "all", label: "All channels" },
  { value: "booking", label: "Booking sources" },
  { value: "ota", label: "OTA calendars" },
  { value: "issues", label: "Needs attention" },
];

const chartConfig = {
  bookings: { label: "Bookings", color: "#1d6b56" },
  revenue: { label: "Revenue", color: "#d48a3a" },
} satisfies ChartConfig;

const channelColors = ["#1d6b56", "#d48a3a", "#6c7f95", "#9f6b85", "#4b8f8c", "#c16d4a"];

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

function formatSyncDate(value: string | null) {
  if (!value) return "No sync recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusMeta(status: ChannelPerformanceChannel["syncStatus"]) {
  if (status === "healthy") return { label: "Healthy", icon: CheckCircle2, className: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (status === "error") return { label: "Sync error", icon: XCircle, className: "text-red-700 bg-red-50 border-red-200" };
  if (status === "warning") return { label: "Needs attention", icon: AlertTriangle, className: "text-amber-800 bg-amber-50 border-amber-200" };
  return { label: "Booking source", icon: Activity, className: "text-slate-600 bg-slate-50 border-slate-200" };
}

function LoadingDashboard() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="กำลังโหลดสถิติช่องทาง">
      <div className="flex items-center gap-3 rounded-xl border border-[#dce4df] bg-[#f6faf7] px-4 py-3 text-sm text-[#456156]">
        <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-[#9bbcae] border-t-[#1d6b56]" aria-hidden="true" />
        <span>Loading channel performance data…</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {["bookings", "revenue", "occupancy", "ota"].map((item) => (
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

export default function ChannelPerformance() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ChannelFilter>("all");
  const { data, isLoading, isError, refetch, isFetching } = trpc.channelManager.channelPerformance.useQuery();

  const filteredChannels = useMemo(
    () => filterChannelPerformanceChannels(data?.channels ?? [], search, filter),
    [data?.channels, filter, search],
  );

  const bookingChannels = filteredChannels.filter(channel => channel.kind === "booking");
  const otaChannels = filteredChannels.filter(channel => channel.kind === "ota");
  const bookingPieData = bookingChannels.filter(channel => channel.bookings > 0).map(channel => ({
    name: channel.label,
    value: channel.bookings,
  }));

  if (isLoading) return <LoadingDashboard />;

  if (isError || !data) {
    return (
      <PageState
        tone="error"
        title="Unable to load channel performance"
        description="The dashboard could not retrieve the current property-scoped channel statistics."
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-7 pb-8">
      <section className="flex flex-col gap-5 border-b border-[#dce4df] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Performance / Channel mix</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#1b2c25] sm:text-4xl">Channel performance</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6c7e75]">
            Compare booking sources and monitor OTA calendar health across the properties visible to your role.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#70837a]">
          <Clock3 size={14} aria-hidden="true" />
          <span>Last 30 days · {formatDateLabel(data.periodStart)} – {formatDateLabel(data.periodEnd)}</span>
          {isFetching && <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#b7c9c0] border-t-[#1d6b56]" aria-label="กำลังอัปเดตข้อมูล" />}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Channel performance summary">
        <MetricCard label="Active bookings" value={formatCompactNumber(data.totals.bookings)} detail={`${data.totals.confirmedBookings} confirmed`} icon={TrendingUp} tone="pine" />
        <MetricCard label="Booking revenue" value={formatCurrency(data.totals.revenue)} detail={`${data.totals.cancelledBookings} cancelled`} icon={CircleDollarSign} tone="amber" />
        <MetricCard label="Occupied nights" value={formatCompactNumber(data.totals.occupancyNights)} detail={`${data.totals.hotelCount} visible propert${data.totals.hotelCount === 1 ? "y" : "ies"}`} icon={BarChart3} tone="slate" />
        <MetricCard label="OTA calendar health" value={`${Math.max(0, data.totals.otaChannelCount - data.totals.otaChannelsWithIssues)} / ${data.totals.otaChannelCount}`} detail={data.totals.otaChannelsWithIssues ? `${data.totals.otaChannelsWithIssues} need attention` : "All connected calendars healthy"} icon={Wifi} tone={data.totals.otaChannelsWithIssues ? "rose" : "pine"} />
      </section>

      <section className="rounded-2xl border border-[#dce4df] bg-white p-4 shadow-[0_12px_35px_rgba(30,65,49,0.05)] sm:p-5" aria-label="Channel filters">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#263b31]"><SlidersHorizontal size={16} aria-hidden="true" /> Filter channels</div>
            <p className="mt-1 text-xs text-[#788a81]">Search by channel name or narrow the view to booking and OTA sources.</p>
          </div>
          <label className="relative block w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#91a199]" size={16} aria-hidden="true" />
            <span className="sr-only">Search channels</span>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search channels…" className="h-10 border-[#dce4df] bg-[#fbfdfb] pl-9" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Channel type filter">
          {FILTERS.map(option => (
            <Button
              key={option.value}
              type="button"
              variant={filter === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(option.value)}
              className={filter === option.value ? "bg-[#1d6b56] text-white hover:bg-[#155442]" : "border-[#dce4df] bg-white text-[#52655b] hover:bg-[#f3f8f5]"}
              aria-pressed={filter === option.value}
            >
              {option.label}
            </Button>
          ))}
          {(search || filter !== "all") && <Button type="button" variant="ghost" size="sm" className="text-[#6c7e75]" onClick={() => { setSearch(""); setFilter("all"); }}>Clear</Button>}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardHeader className="border-b border-[#edf2ee] pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg text-[#263b31]">Booking activity</CardTitle>
                <CardDescription>Confirmed booking volume and revenue by check-in date.</CardDescription>
              </div>
              <Badge variant="outline" className="border-[#cfe0d6] bg-[#f6faf7] text-[#39715c]">30 days</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <ChartContainer config={chartConfig} className="h-[300px] w-full aspect-auto">
              <AreaChart data={data.trend} margin={{ left: 4, right: 10, top: 8, bottom: 4 }}>
                <defs>
                  <linearGradient id="channelBookingsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-bookings)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--color-bookings)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#e8efea" />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => formatDateLabel(String(value))} formatter={(value, name) => <><span className="text-muted-foreground">{name === "bookings" ? "Bookings" : "Revenue"}</span><span className="font-mono font-medium">{name === "revenue" ? formatCurrency(Number(value)) : Number(value).toLocaleString()}</span></>} />} />
                <Area type="monotone" dataKey="bookings" stroke="var(--color-bookings)" strokeWidth={2.5} fill="url(#channelBookingsFill)" activeDot={{ r: 5 }} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardHeader className="border-b border-[#edf2ee] pb-4">
            <CardTitle className="text-lg text-[#263b31]">Booking source mix</CardTitle>
            <CardDescription>Share of active bookings in the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            {bookingPieData.length ? (
              <ChartContainer config={chartConfig} className="h-[300px] w-full aspect-auto">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(value, name) => <><span className="text-muted-foreground">{name}</span><span className="font-mono font-medium">{Number(value).toLocaleString()} bookings</span></>} />} />
                  <Pie data={bookingPieData} dataKey="value" nameKey="name" innerRadius={65} outerRadius={95} paddingAngle={3} strokeWidth={2} stroke="#fff">
                    {bookingPieData.map((entry, index) => <Cell key={entry.name} fill={channelColors[index % channelColors.length]} />)}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center"><PageState tone="empty" title="No booking source data" description="Try clearing the current search or filter." /></div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardHeader>
            <CardTitle className="text-lg text-[#263b31]">Channel volume</CardTitle>
            <CardDescription>Active booking volume by persisted booking source.</CardDescription>
          </CardHeader>
          <CardContent>
            {bookingChannels.length ? (
              <ChartContainer config={chartConfig} className="h-[270px] w-full aspect-auto">
                <BarChart data={bookingChannels} layout="vertical" margin={{ left: 8, right: 18, top: 5, bottom: 5 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="4 4" stroke="#e8efea" />
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis type="category" dataKey="label" width={104} tickLine={false} axisLine={false} tick={{ fill: "#62766b", fontSize: 12 }} />
                  <Tooltip cursor={{ fill: "#f5f9f6" }} content={<ChartTooltipContent hideLabel formatter={(value) => <><span className="text-muted-foreground">Active bookings</span><span className="font-mono font-medium">{Number(value).toLocaleString()}</span></>} />} />
                  <Bar dataKey="bookings" fill="var(--color-bookings)" radius={[0, 5, 5, 0]} barSize={24} />
                </BarChart>
              </ChartContainer>
            ) : (
              <PageState tone="empty" title="No booking channels match" description="Try another search term or filter." />
            )}
          </CardContent>
        </Card>

        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardHeader>
            <CardTitle className="text-lg text-[#263b31]">Channel detail</CardTitle>
            <CardDescription>Revenue, booking value, and OTA sync health.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredChannels.length ? filteredChannels.map(channel => <ChannelDetailRow key={channel.id} channel={channel} />) : <PageState tone="empty" title="No channels match" description="Try clearing the current filters." />}
          </CardContent>
        </Card>
      </section>

      {filter === "all" && !search && otaChannels.length > 0 && (
        <section className="rounded-2xl border border-[#dce4df] bg-[#f7faf8] p-4 sm:p-5" aria-label="OTA calendar note">
          <div className="flex gap-3">
            <Wifi className="mt-0.5 shrink-0 text-[#1d6b56]" size={18} aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-[#263b31]">OTA channels are shown as calendar health</p>
              <p className="mt-1 text-xs leading-5 text-[#667a70]">This release tracks OTA iCal synchronization and updated calendar items. OTA booking revenue is not inferred until a live booking API integration is enabled.</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Activity; tone: "pine" | "amber" | "slate" | "rose" }) {
  const toneClass = {
    pine: "bg-[#edf7f1] text-[#1d6b56]",
    amber: "bg-[#fff4e7] text-[#a86520]",
    slate: "bg-[#eef2f5] text-[#556a7b]",
    rose: "bg-[#fbeeee] text-[#ae4f54]",
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

function ChannelDetailRow({ channel }: { channel: ChannelPerformanceChannel }) {
  const meta = statusMeta(channel.syncStatus);
  const StatusIcon = meta.icon;
  return (
    <div className="rounded-xl border border-[#e6eee9] bg-[#fbfdfb] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#2a4035]">{channel.label}</p>
          <p className="mt-1 text-xs text-[#7a8c83]">{channel.kind === "ota" ? `${channel.hotelCount} propert${channel.hotelCount === 1 ? "y" : "ies"} · Updated items ${channel.updatedItemCount}` : `${channel.bookings} active bookings · ${channel.occupancyNights} nights`}</p>
        </div>
        <Badge variant="outline" className={cn("shrink-0 gap-1 text-[11px]", meta.className)}><StatusIcon size={12} aria-hidden="true" />{meta.label}</Badge>
      </div>
      {channel.kind === "booking" ? (
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#edf2ee] pt-3 text-xs">
          <div><p className="text-[#87978f]">Revenue</p><p className="mt-1 font-semibold text-[#334a3e]">{formatCurrency(channel.revenue)}</p></div>
          <div><p className="text-[#87978f]">Avg. booking</p><p className="mt-1 font-semibold text-[#334a3e]">{formatCurrency(channel.averageBookingValue)}</p></div>
        </div>
      ) : (
        <p className="mt-3 border-t border-[#edf2ee] pt-3 text-xs text-[#71847a]">Last sync: <span className="font-medium text-[#40574a]">{formatSyncDate(channel.lastSyncAt)}</span></p>
      )}
    </div>
  );
}

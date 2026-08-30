import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageState } from "@/components/PageState";
import { trpc } from "@/lib/trpc";

type RateOverride = {
  id: string;
  room_type_id: string;
  start_date: string;
  end_date: string;
  override_price: number;
  min_stay_nights: number | null;
};

function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addMonths(date: Date, amount: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(date);
}

function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date);
}

function isDateInRange(dateStr: string, start: string, end: string) {
  return dateStr >= start && dateStr <= end;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
}

function LoadingPricing() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="กำลังโหลดข้อมูลราคาขั้นสูง">
      <div className="flex items-center gap-3 rounded-xl border border-[#dce4df] bg-[#f6faf7] px-4 py-3 text-sm text-[#456156]">
        <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-[#9bbcae] border-t-[#1d6b56]" aria-hidden="true" />
        <span>Loading pricing data…</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl border border-[#e5ebe7] bg-white" />
        ))}
      </div>
      <div className="h-[420px] animate-pulse rounded-2xl border border-[#e5ebe7] bg-white" />
    </div>
  );
}

export default function AdvancedPricing() {
  const utils = trpc.useUtils();
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>("");
  const [form, setForm] = useState({ start_date: "", end_date: "", override_price: "", min_stay_nights: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const { data: hotels, isLoading, isError, refetch, isFetching } = trpc.channelManager.hotels.useQuery();

  const roomTypes = useMemo(() => {
    const all = (hotels ?? []).flatMap((h: any) => h.room_types.map((rt: any) => ({ ...rt, hotelName: h.name, hotelId: h.id }))) as Array<any>;
    return all;
  }, [hotels]);

  const effectiveRoomTypeId = selectedRoomTypeId || roomTypes[0]?.id || "";
  const selectedRoomType: any = roomTypes.find((rt) => rt.id === effectiveRoomTypeId) ?? null;

  const overridesQuery = trpc.channelManager.listRateOverrides.useQuery(
    { hotel_id: selectedRoomType?.hotelId, room_type_id: effectiveRoomTypeId },
    { enabled: Boolean(selectedRoomType?.hotelId && effectiveRoomTypeId) },
  );
  const overrides: RateOverride[] = useMemo(
    () => (overridesQuery.data ?? []).map((o: any) => ({ ...o, override_price: Number(o.override_price) })),
    [overridesQuery.data],
  );

  const createMutation = trpc.channelManager.createRateOverride.useMutation({
    onSuccess: async () => {
      setForm({ start_date: "", end_date: "", override_price: "", min_stay_nights: "" });
      await utils.channelManager.listRateOverrides.invalidate({ hotel_id: selectedRoomType?.hotelId, room_type_id: effectiveRoomTypeId });
    },
    onError: (error) => setFormError(error.message),
  });
  const deleteMutation = trpc.channelManager.deleteRateOverride.useMutation({
    onSuccess: async () => {
      await utils.channelManager.listRateOverrides.invalidate({ hotel_id: selectedRoomType?.hotelId, room_type_id: effectiveRoomTypeId });
    },
    onError: (error) => setFormError(error.message),
  });

  useEffect(() => setFormError(null), [effectiveRoomTypeId]);

  const monthDays = useMemo(() => {
    const start = startOfMonth(monthCursor);
    const total = daysInMonth(monthCursor);
    const leading = start.getDay(); // 0 Sun
    // render Monday-first calendar: adjust so Monday=0
    const mondayOffset = (leading + 6) % 7;
    const cells: Array<Date | null> = [];
    for (let i = 0; i < mondayOffset; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthCursor]);

  const overridesForRoom = useMemo(
    () => overrides.filter((o) => o.room_type_id === effectiveRoomTypeId),
    [overrides, effectiveRoomTypeId],
  );

  function resolveEffectiveRate(dateStr: string): { price: number; source: "base" | "override"; overrideId?: string } {
    if (!selectedRoomType) return { price: 0, source: "base" };
    const matching = overridesForRoom.filter((o) => isDateInRange(dateStr, o.start_date, o.end_date));
    if (!matching.length) return { price: Number(selectedRoomType.base_price), source: "base" };
    // precedence: narrowest range wins (overlapping ranges are rejected server-side,
    // so in practice at most one override matches any given date; the narrowest-wins
    // rule is a defensive tie-break for any residual ambiguity, not the primary guard)
    let best = matching[0];
    let bestSpan = parseIsoDate(best.end_date).getTime() - parseIsoDate(best.start_date).getTime();
    for (const candidate of matching.slice(1)) {
      const span = parseIsoDate(candidate.end_date).getTime() - parseIsoDate(candidate.start_date).getTime();
      if (span < bestSpan) {
        best = candidate;
        bestSpan = span;
      }
    }
    return { price: best.override_price, source: "override", overrideId: best.id };
  }

  function handleCreate() {
    setFormError(null);
    if (!selectedRoomType) {
      setFormError("Select a room type first.");
      return;
    }
    const start_date = form.start_date.trim();
    const end_date = form.end_date.trim();
    const override_price = Number(form.override_price);
    const minStayRaw = form.min_stay_nights.trim();
    const min_stay_nights = minStayRaw === "" ? null : Number(minStayRaw);

    if (!start_date || !end_date || !form.override_price.trim()) {
      setFormError("Enter start date, end date, and override price.");
      return;
    }
    if (start_date > end_date) {
      setFormError("Start date must be on or before end date.");
      return;
    }
    if (!Number.isFinite(override_price) || override_price <= 0) {
      setFormError("Override price must be a positive number.");
      return;
    }
    if (min_stay_nights !== null && (!Number.isInteger(min_stay_nights) || min_stay_nights < 1)) {
      setFormError("Minimum stay must be a whole number of nights (≥ 1) or left empty.");
      return;
    }
    // reject overlapping ranges for same room type client-side for immediate feedback;
    // the server enforces this authoritatively via the prevent_rate_override_overlap
    // EXCLUDE constraint and returns CONFLICT if this check is somehow bypassed.
    const hasOverlap = overridesForRoom.some((o) => overlaps(start_date, end_date, o.start_date, o.end_date));
    if (hasOverlap) {
      setFormError("An overlapping rate override already exists for this room type and date range.");
      return;
    }

    createMutation.mutate({
      hotel_id: selectedRoomType.hotelId,
      room_type_id: effectiveRoomTypeId,
      start_date,
      end_date,
      override_price,
      min_stay_nights,
    });
  }

  function handleDelete(id: string) {
    if (!selectedRoomType) return;
    deleteMutation.mutate({ hotel_id: selectedRoomType.hotelId, rate_override_id: id });
  }

  if (isLoading) return <LoadingPricing />;

  if (isError || !hotels) {
    return (
      <PageState
        tone="error"
        title="Unable to load pricing"
        description="The pricing workspace could not be loaded for the properties visible to your account."
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  if (roomTypes.length === 0) {
    return (
      <PageState
        tone="empty"
        title="No room types configured"
        description="Create a room type inside a hotel before managing seasonal rate overrides."
      />
    );
  }

  return (
    <div className="space-y-7 pb-8">
      <section className="flex flex-col gap-5 border-b border-[#dce4df] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Revenue / Rate overrides</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#1b2c25] sm:text-4xl">Advanced Pricing</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6c7e75]">
            Calendar-style editor for seasonal rate overrides and minimum-stay rules per room type. Overrides resolve by
            narrowest matching date range.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#70837a]">
          <Clock3 size={14} aria-hidden="true" />
          <span>Thailand time · {formatMonthLabel(monthCursor)}</span>
          {isFetching && <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#b7c9c0] border-t-[#1d6b56]" aria-label="กำลังอัปเดตข้อมูล" />}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Pricing summary">
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">Base price</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#263b31]">
              {selectedRoomType ? formatCurrency(Number(selectedRoomType.base_price)) : "—"}
            </p>
            <p className="mt-1 text-xs text-[#778a80]">{selectedRoomType?.name ?? "Select a room type"}</p>
          </CardContent>
        </Card>
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">Rate overrides</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#263b31]">{overridesForRoom.length}</p>
            <p className="mt-1 text-xs text-[#778a80]">Active rules for this room type</p>
          </CardContent>
        </Card>
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">Min stay enforcement</p>
            <p className="mt-3 text-sm font-semibold text-[#263b31]">Checked at booking creation</p>
            <p className="mt-1 text-xs text-[#778a80]">min_stay_nights is enforced server-side</p>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Room type selector">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#263b31]">
          <Tag size={16} aria-hidden="true" /> Room type
        </div>
        <div className="w-full sm:max-w-sm">
          <Select value={effectiveRoomTypeId} onValueChange={setSelectedRoomTypeId}>
            <SelectTrigger className="border-[#dce4df] bg-white">
              <SelectValue placeholder="Select room type" />
            </SelectTrigger>
            <SelectContent>
              {roomTypes.map((rt) => (
                <SelectItem key={rt.id} value={rt.id}>
                  {rt.name} · {rt.hotelName} · {formatCurrency(Number(rt.base_price))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.6fr_0.9fr]">
        <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-[#edf2ee] pb-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-[#263b31]">
                <CalendarDays size={18} aria-hidden="true" /> Pricing calendar
              </CardTitle>
              <CardDescription>Effective rate per night — base_price or matching override.</CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8 border-[#dce4df]" onClick={() => setMonthCursor((d) => addMonths(d, -1))} aria-label="Previous month">
                <ChevronLeft size={16} />
              </Button>
              <span className="min-w-[140px] text-center text-sm font-semibold text-[#263b31]">{formatMonthLabel(monthCursor)}</span>
              <Button variant="outline" size="icon" className="h-8 w-8 border-[#dce4df]" onClick={() => setMonthCursor((d) => addMonths(d, 1))} aria-label="Next month">
                <ChevronRight size={16} />
              </Button>
              <Button variant="ghost" size="sm" className="ml-1 text-[#6c7e75]" onClick={() => setMonthCursor(startOfMonth(new Date()))}>
                Today
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="mb-3 flex flex-wrap gap-3 text-xs text-[#6c7e75]">
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#1d6b56]" aria-hidden="true" /> Override active</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#dce4df]" aria-hidden="true" /> Base price</span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase tracking-[0.08em] text-[#789087]">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {monthDays.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} className="h-[72px] rounded-xl border border-dashed border-[#e5ebe7] bg-[#fbfdfb]" />;
                const iso = toIsoDate(day);
                const resolved = resolveEffectiveRate(iso);
                const isOverride = resolved.source === "override";
                const matchingOverride = isOverride ? overridesForRoom.find((o) => o.id === resolved.overrideId) : null;
                return (
                  <div
                    key={iso}
                    className={`flex h-[72px] flex-col rounded-xl border p-2 text-left ${isOverride ? "border-[#b7d8c8] bg-[#edf7f1]" : "border-[#e5ebe7] bg-white"}`}
                    title={isOverride ? `Override ${formatCurrency(resolved.price)} (${matchingOverride?.start_date} → ${matchingOverride?.end_date})` : `Base ${formatCurrency(resolved.price)}`}
                  >
                    <span className="text-xs font-semibold text-[#263b31]">{day.getDate()}</span>
                    <span className="mt-1 text-[11px] text-[#6c7e75]">{formatDayLabel(day)}</span>
                    <span className={`mt-auto text-xs font-semibold ${isOverride ? "text-[#1d6b56]" : "text-[#4a6359]"}`}>{formatCurrency(resolved.price)}</span>
                    {isOverride && matchingOverride?.min_stay_nights ? (
                      <span className="text-[10px] text-[#6c7e75]">min {matchingOverride.min_stay_nights} nights</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-xs leading-5 text-[#667a70]">Precedence: narrowest matching date range wins. Overlapping create requests are rejected.</p>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
            <CardHeader className="border-b border-[#edf2ee] pb-4">
              <CardTitle className="text-lg text-[#263b31]">Create rate override</CardTitle>
              <CardDescription>Date-range override for the selected room type.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="override-start" className="text-xs text-[#52655b]">
                    Start date
                  </Label>
                  <Input id="override-start" type="date" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} className="border-[#dce4df]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="override-end" className="text-xs text-[#52655b]">
                    End date
                  </Label>
                  <Input id="override-end" type="date" value={form.end_date} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} className="border-[#dce4df]" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="override-price" className="text-xs text-[#52655b]">
                  Override price (THB)
                </Label>
                <Input
                  id="override-price"
                  type="number"
                  min="0"
                  placeholder="e.g. 3500"
                  value={form.override_price}
                  onChange={(e) => setForm((p) => ({ ...p, override_price: e.target.value }))}
                  className="border-[#dce4df]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="override-minstay" className="text-xs text-[#52655b]">
                  Min stay nights (optional)
                </Label>
                <Input
                  id="override-minstay"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 2"
                  value={form.min_stay_nights}
                  onChange={(e) => setForm((p) => ({ ...p, min_stay_nights: e.target.value }))}
                  className="border-[#dce4df]"
                />
              </div>
              <Button type="button" onClick={handleCreate} disabled={createMutation.isPending} className="w-full bg-[#1d6b56] hover:bg-[#155442]">
                <Plus size={15} /> {createMutation.isPending ? "Adding…" : "Add override"}
              </Button>
              <p className="text-xs leading-5 text-[#778a80]">Fields: room_type_id, start_date, end_date, override_price, min_stay_nights. Overlapping ranges are rejected with CONFLICT.</p>
            </CardContent>
          </Card>

          <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
            <CardHeader className="border-b border-[#edf2ee] pb-4">
              <CardTitle className="text-lg text-[#263b31]">Rate overrides</CardTitle>
              <CardDescription>{overridesForRoom.length ? `${overridesForRoom.length} rule${overridesForRoom.length === 1 ? "" : "s"} for ${selectedRoomType?.name}` : "No overrides yet"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-5">
              {overridesForRoom.length ? (
                overridesForRoom.map((o) => (
                  <div key={o.id} className="flex items-start justify-between gap-3 rounded-xl border border-[#e6eee9] bg-[#fbfdfb] p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#2a4035]">{formatCurrency(o.override_price)} · {o.start_date} → {o.end_date}</p>
                      <p className="mt-1 text-xs text-[#7a8c83]">{o.min_stay_nights ? `min_stay_nights: ${o.min_stay_nights} nights` : "No minimum stay"} · id {o.id.slice(0, 8)}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-[#8a9a93] hover:text-red-600" disabled={deleteMutation.isPending} onClick={() => handleDelete(o.id)} aria-label={`Delete override ${o.start_date} to ${o.end_date}`}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))
              ) : (
                <PageState tone="empty" title="No rate overrides" description="Add a date-range rule to override the base price for this room type." />
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

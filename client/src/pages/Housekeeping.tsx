import { useMemo, useState } from "react";
import { BedDouble, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageState } from "@/components/PageState";
import { trpc } from "@/lib/trpc";
import { hasAnyPermission, type AppRole } from "@shared/authorization";
import { useTranslation } from "@/lib/i18n";

type HousekeepingStatus = "pending" | "in_progress" | "done";

type HousekeepingTask = {
  id: string;
  room: string;
  room_id: string;
  status: HousekeepingStatus;
  assignee: string | null;
  assigned_to: string | null;
  due_date: string;
  booking_id?: string | null;
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

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDayLabel(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(`${iso}T00:00:00.000Z`),
  );
}

const STATUS_TONE: Record<HousekeepingStatus, string> = {
  pending: "bg-[#fff4e7] text-[#8a5a22] border-[#f0d9b8]",
  in_progress: "bg-[#e6f0ff] text-[#2b5da8] border-[#c2d6f5]",
  done: "bg-[#edf7f1] text-[#1d6b56] border-[#c2e0d0]",
};

function LoadingHousekeeping() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label={t("housekeeping.loadingAriaLabel")}>
      <div className="flex items-center gap-3 rounded-xl border border-[#dce4df] bg-[#f6faf7] px-4 py-3 text-sm text-[#456156]">
        <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-[#9bbcae] border-t-[#1d6b56]" aria-hidden="true" />
        <span>{t("housekeeping.loadingBoard")}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-[#e5ebe7] bg-white" />
        ))}
      </div>
      <div className="h-[360px] animate-pulse rounded-2xl border border-[#e5ebe7] bg-white" />
    </div>
  );
}

export default function Housekeeping() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [selectedDate, setSelectedDate] = useState(() => toIsoDate(new Date()));
  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [form, setForm] = useState({ room_id: "", assigned_to: "", due_date: "", booking_id: "", status: "pending" as HousekeepingStatus });
  const [formError, setFormError] = useState<string | null>(null);

  const statusLabel: Record<HousekeepingStatus, string> = {
    pending: t("housekeeping.statusPending"),
    in_progress: t("housekeeping.statusInProgress"),
    done: t("housekeeping.statusDone"),
  };

  const { data: hotels, isLoading, isError, refetch, isFetching } = trpc.channelManager.hotels.useQuery();
  const { data: authMe } = trpc.auth.me.useQuery();
  const authRoles = (authMe?.roles?.length ? authMe.roles : authMe?.role ? [authMe.role] : []) as AppRole[];
  const canView = hasAnyPermission(authRoles, "housekeeping.view_room_status");
  const canUpdate = hasAnyPermission(authRoles, "housekeeping.update_room_status");

  const effectiveHotelId = selectedHotelId || hotels?.[0]?.id || "";

  const hotelDetailQuery = trpc.channelManager.hotel.useQuery(effectiveHotelId, { enabled: Boolean(effectiveHotelId) });
  const staffQuery = trpc.channelManager.hotelStaff.useQuery({ hotel_id: effectiveHotelId }, { enabled: Boolean(effectiveHotelId) });
  const tasksQuery = trpc.channelManager.listHousekeepingTasks.useQuery({ hotel_id: effectiveHotelId }, { enabled: Boolean(effectiveHotelId) });

  const roomsFromHotel = useMemo(() => {
    const rooms = (hotelDetailQuery.data as any)?.rooms ?? [];
    const roomTypes = (hotelDetailQuery.data as any)?.room_types ?? [];
    return rooms.map((room: any) => {
      const roomType = roomTypes.find((rt: any) => rt.id === room.room_type_id);
      return { id: room.id, label: room.room_number ? `${room.room_number}${roomType ? ` — ${roomType.name}` : ""}` : `Room ${room.id.slice(0, 8)}` };
    }) as Array<{ id: string; label: string }>;
  }, [hotelDetailQuery.data]);

  const staffById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of (staffQuery.data as any)?.staff ?? []) {
      map.set(member.user_id, member.email ?? member.user_id);
    }
    return map;
  }, [staffQuery.data]);

  const tasks: HousekeepingTask[] = useMemo(
    () => ((tasksQuery.data as any[]) ?? []).map(t => ({
      id: t.id,
      room: roomsFromHotel.find(r => r.id === t.room_id)?.label ?? `Room ${String(t.room_id).slice(0, 8)}`,
      room_id: t.room_id,
      status: t.status,
      assignee: t.assigned_to ? staffById.get(t.assigned_to) ?? t.assigned_to : null,
      assigned_to: t.assigned_to,
      due_date: t.due_date,
      booking_id: t.booking_id,
    })),
    [tasksQuery.data, roomsFromHotel, staffById],
  );

  const dayTasks = useMemo(() => tasks.filter(t => t.due_date === selectedDate), [tasks, selectedDate]);

  const groupedByRoom = useMemo(() => {
    const map = new Map<string, HousekeepingTask[]>();
    for (const task of dayTasks) {
      const key = task.room;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    // sort rooms alphabetically, tasks by status priority
    const order: Record<HousekeepingStatus, number> = { pending: 0, in_progress: 1, done: 2 };
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([room, list]) => [room, list.sort((a, b) => order[a.status] - order[b.status])] as const);
  }, [dayTasks]);

  const effectiveDueDate = form.due_date || selectedDate;

  const invalidateTasks = () => utils.channelManager.listHousekeepingTasks.invalidate({ hotel_id: effectiveHotelId });

  const createMutation = trpc.channelManager.createHousekeepingTask.useMutation({
    onSuccess: async () => {
      setForm({ room_id: "", assigned_to: "", due_date: "", booking_id: "", status: "pending" });
      await invalidateTasks();
    },
    onError: (error) => setFormError(error.message),
  });
  const updateMutation = trpc.channelManager.updateHousekeepingTaskStatus.useMutation({
    onSuccess: () => invalidateTasks(),
    onError: (error) => setFormError(error.message),
  });

  function handleCreate() {
    setFormError(null);
    if (!canUpdate) {
      setFormError(t("housekeeping.errorNoPermission"));
      return;
    }
    if (!form.room_id) {
      setFormError(t("housekeeping.errorSelectRoom"));
      return;
    }
    const due_date = effectiveDueDate;
    if (!due_date && !form.booking_id.trim()) {
      setFormError(t("housekeeping.errorSelectDueDate"));
      return;
    }

    createMutation.mutate({
      hotel_id: effectiveHotelId,
      room_id: form.room_id,
      booking_id: form.booking_id.trim() || null,
      assigned_to: form.assigned_to || null,
      due_date: due_date || null,
      status: form.status,
    });
  }

  function handleStatusChange(taskId: string, nextStatus: HousekeepingStatus) {
    if (!canUpdate) return;
    const task = tasks.find(t => t.id === taskId);
    setFormError(null);
    updateMutation.mutate({ hotel_id: effectiveHotelId, task_id: taskId, status: nextStatus, assigned_to: task?.assigned_to ?? null });
  }

  function handleAssign(taskId: string, assignedTo: string) {
    if (!canUpdate) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    setFormError(null);
    updateMutation.mutate({ hotel_id: effectiveHotelId, task_id: taskId, status: task.status, assigned_to: assignedTo || null });
  }

  if (isLoading) return <LoadingHousekeeping />;

  if (isError || !hotels) {
    return (
      <PageState
        tone="error"
        title={t("housekeeping.unableToLoadTitle")}
        description={t("housekeeping.unableToLoadDesc")}
        actionLabel={t("housekeeping.tryAgain")}
        onAction={() => void refetch()}
      />
    );
  }

  if (!canView) {
    return (
      <PageState
        tone="error"
        title={t("housekeeping.accessRestrictedTitle")}
        description={t("housekeeping.accessRestrictedDesc")}
      />
    );
  }

  return (
    <div className="space-y-7 pb-8">
      <section className="flex flex-col gap-5 border-b border-[#dce4df] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">{t("housekeeping.eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#1b2c25] sm:text-4xl">{t("housekeeping.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6c7e75]">{t("housekeeping.lede")}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#70837a]">
          <Clock3 size={14} aria-hidden="true" />
          <span>{t("housekeeping.dayView", { date: formatDayLabel(selectedDate) })}</span>
          {isFetching && <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#b7c9c0] border-t-[#1d6b56]" aria-label={t("housekeeping.updatingDataAriaLabel")} />}
        </div>
      </section>

      {(hotels ?? []).length > 1 && (
        <section className="flex items-center gap-2 text-sm" aria-label={t("housekeeping.hotelSelectorAria")}>
          <span className="text-[#52655b]">{t("housekeeping.property")}</span>
          <Select value={effectiveHotelId} onValueChange={setSelectedHotelId}>
            <SelectTrigger className="w-full max-w-sm border-[#dce4df] bg-white">
              <SelectValue placeholder={t("housekeeping.selectHotelPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {(hotels ?? []).map((hotel: any) => (
                <SelectItem key={hotel.id} value={hotel.id}>{hotel.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>
      )}

      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" aria-label={t("housekeeping.daySelectorAria")}>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 border-[#dce4df]" onClick={() => setSelectedDate(toIsoDate(addDays(parseIsoDate(selectedDate), -1)))} aria-label={t("housekeeping.prevDayAria")}>
            <ChevronLeft size={16} />
          </Button>
          <label className="flex items-center gap-2">
            <CalendarDays size={16} className="text-[#6c7e75]" aria-hidden="true" />
            <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="border-[#dce4df] w-[160px]" />
          </label>
          <Button variant="outline" size="icon" className="h-8 w-8 border-[#dce4df]" onClick={() => setSelectedDate(toIsoDate(addDays(parseIsoDate(selectedDate), 1)))} aria-label={t("housekeeping.nextDayAria")}>
            <ChevronRight size={16} />
          </Button>
          <Button variant="ghost" size="sm" className="ml-1 text-[#6c7e75]" onClick={() => setSelectedDate(toIsoDate(new Date()))}>
            {t("housekeeping.today")}
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#6c7e75]">
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full bg-[#fff4e7] border border-[#f0d9b8]" aria-hidden="true" /> {t("housekeeping.statusPending")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full bg-[#e6f0ff] border border-[#c2d6f5]" aria-hidden="true" /> {t("housekeeping.statusInProgress")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full bg-[#edf7f1] border border-[#c2e0d0]" aria-hidden="true" /> {t("housekeeping.statusDone")}
          </span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label={t("housekeeping.summaryAria")}>
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">{t("housekeeping.tasksForDay")}</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#263b31]">{dayTasks.length}</p>
            <p className="mt-1 text-xs text-[#778a80]">{t("housekeeping.groupedByRoom")}</p>
          </CardContent>
        </Card>
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">{t("housekeeping.pendingInProgress")}</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#263b31]">
              {dayTasks.filter(t => t.status !== "done").length}
            </p>
            <p className="mt-1 text-xs text-[#778a80]">{t("housekeeping.awaitingCompletion")}</p>
          </CardContent>
        </Card>
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">{t("housekeeping.unassigned")}</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#263b31]">{dayTasks.filter(t => !t.assignee).length}</p>
            <p className="mt-1 text-xs text-[#778a80]">{t("housekeeping.needAssignee")}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.7fr_0.85fr]">
        <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardHeader className="border-b border-[#edf2ee] pb-4">
            <CardTitle className="flex items-center gap-2 text-lg text-[#263b31]">
              <BedDouble size={18} aria-hidden="true" /> {t("housekeeping.dayViewGroupedByRoom")}
            </CardTitle>
            <CardDescription>
              {t("housekeeping.dayViewGroupedByRoomDesc", { date: formatDayLabel(selectedDate) })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            {!canUpdate && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="note">
                {t("housekeeping.viewOnlyNotice")}
              </div>
            )}
            {groupedByRoom.length ? (
              groupedByRoom.map(([room, roomTasks]) => (
                <div key={room} className="rounded-xl border border-[#e6eee9] bg-[#fbfdfb] p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-[#263b31]">
                    <BedDouble size={14} aria-hidden="true" /> {room}
                    <span className="text-xs font-normal text-[#7a8c83]">
                      {roomTasks.length === 1
                        ? t("housekeeping.tasksCount", { count: roomTasks.length })
                        : t("housekeeping.tasksCountPlural", { count: roomTasks.length })}
                    </span>
                  </h3>
                  <div className="mt-3 space-y-2">
                    {roomTasks.map(task => (
                      <div key={task.id} className="flex flex-col gap-2 rounded-lg border border-[#e5ebe7] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_TONE[task.status]}`}>
                              {task.status === "done" && <Check size={12} aria-hidden="true" />} {statusLabel[task.status]}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-[#6c7e75]">
                              <Users size={12} aria-hidden="true" /> {t("housekeeping.assigneeLabel", { name: task.assignee ?? t("housekeeping.unassigned") })}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#7a8c83]">
                            {t("housekeeping.dueDetail", { due: task.due_date, status: task.status, assignee: task.assignee ?? "—" })}
                            {task.booking_id ? t("housekeeping.bookingDetail", { id: task.booking_id }) : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Select value={task.status} onValueChange={v => handleStatusChange(task.id, v as HousekeepingStatus)} disabled={!canUpdate}>
                            <SelectTrigger className="h-8 w-[150px] border-[#dce4df] bg-white" aria-label={t("housekeeping.updateStatusAria", { room })}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">{t("housekeeping.statusPending")}</SelectItem>
                              <SelectItem value="in_progress">{t("housekeeping.statusInProgress")}</SelectItem>
                              <SelectItem value="done">{t("housekeeping.statusDone")}</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select value={task.assigned_to ?? "__unassigned"} onValueChange={v => handleAssign(task.id, v === "__unassigned" ? "" : v)} disabled={!canUpdate}>
                            <SelectTrigger className="h-8 w-[160px] border-[#dce4df] bg-white" aria-label={t("housekeeping.assignTaskAria", { id: task.id })}>
                              <SelectValue placeholder={t("housekeeping.unassigned")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__unassigned">{t("housekeeping.unassigned")}</SelectItem>
                              {Array.from(staffById.entries()).map(([userId, email]) => (
                                <SelectItem key={userId} value={userId}>{email}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <PageState tone="empty" title={t("housekeeping.noTasksForDayTitle")} description={t("housekeeping.noTasksForDayDesc")} />
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
            <CardHeader className="border-b border-[#edf2ee] pb-4">
              <CardTitle className="text-lg text-[#263b31]">{t("housekeeping.createAssignTaskTitle")}</CardTitle>
              <CardDescription>{t("housekeeping.createAssignTaskDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                  {formError}
                </div>
              )}
              {!canUpdate && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("housekeeping.requiresUpdatePermission")}</div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="hk-room" className="text-xs text-[#52655b]">
                  {t("housekeeping.room")}
                </Label>
                <Select value={form.room_id} onValueChange={v => setForm(p => ({ ...p, room_id: v }))} disabled={!canUpdate || !roomsFromHotel.length}>
                  <SelectTrigger id="hk-room" className="border-[#dce4df] bg-white">
                    <SelectValue placeholder={roomsFromHotel.length ? t("housekeeping.selectRoomPlaceholder") : t("housekeeping.noRoomsConfigured")} />
                  </SelectTrigger>
                  <SelectContent>
                    {roomsFromHotel.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hk-assignee" className="text-xs text-[#52655b]">
                  {t("housekeeping.assignee")}
                </Label>
                <Select value={form.assigned_to || "__unassigned"} onValueChange={v => setForm(p => ({ ...p, assigned_to: v === "__unassigned" ? "" : v }))} disabled={!canUpdate}>
                  <SelectTrigger id="hk-assignee" className="border-[#dce4df] bg-white">
                    <SelectValue placeholder={t("housekeeping.unassigned")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned">{t("housekeeping.unassigned")}</SelectItem>
                    {Array.from(staffById.entries()).map(([userId, email]) => (
                      <SelectItem key={userId} value={userId}>{email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hk-due" className="text-xs text-[#52655b]">
                  {t("housekeeping.dueDate")}
                </Label>
                <Input id="hk-due" type="date" value={effectiveDueDate} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} disabled={!canUpdate} className="border-[#dce4df]" />
                <p className="text-[11px] text-[#778a80]">{t("housekeeping.dueDateHint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hk-booking" className="text-xs text-[#52655b]">
                  {t("housekeeping.bookingIdOptional")}
                </Label>
                <Input id="hk-booking" placeholder={t("housekeeping.bookingIdPlaceholder")} value={form.booking_id} onChange={e => setForm(p => ({ ...p, booking_id: e.target.value }))} disabled={!canUpdate} className="border-[#dce4df]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#52655b]">{t("housekeeping.status")}</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as HousekeepingStatus }))} disabled={!canUpdate}>
                  <SelectTrigger className="border-[#dce4df] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t("housekeeping.statusPending")}</SelectItem>
                    <SelectItem value="in_progress">{t("housekeeping.statusInProgress")}</SelectItem>
                    <SelectItem value="done">{t("housekeeping.statusDone")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={handleCreate} disabled={!canUpdate || createMutation.isPending} className="w-full bg-[#1d6b56] hover:bg-[#155442] disabled:opacity-50">
                <Plus size={15} /> {createMutation.isPending ? t("housekeeping.creating") : t("housekeeping.createTask")}
              </Button>
              <p className="text-xs leading-5 text-[#778a80]">{t("housekeeping.permissionsFootnote")}</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

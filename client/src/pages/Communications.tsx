import { useEffect, useMemo, useState } from "react";
import { Clock3, MessageCircle, MessageSquarePlus, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageState } from "@/components/PageState";
import { trpc } from "@/lib/trpc";
import { hasAnyPermission, type AppRole } from "@shared/authorization";

type CommThread = {
  id: string;
  booking_id: string | null;
  hotel_id: string;
  hotel_name: string;
  guest_name: string;
  created_at: string;
};

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function LoadingCommunications() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="กำลังโหลดข้อความสื่อสาร">
      <div className="flex items-center gap-3 rounded-xl border border-[#dce4df] bg-[#f6faf7] px-4 py-3 text-sm text-[#456156]">
        <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-[#9bbcae] border-t-[#1d6b56]" aria-hidden="true" />
        <span>Loading communications…</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.4fr]">
        <div className="h-[420px] animate-pulse rounded-2xl border border-[#e5ebe7] bg-white" />
        <div className="h-[420px] animate-pulse rounded-2xl border border-[#e5ebe7] bg-white" />
      </div>
    </div>
  );
}

export default function Communications() {
  const utils = trpc.useUtils();
  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [composer, setComposer] = useState("");
  const [composerBookingId, setComposerBookingId] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);

  const { data: hotels, isLoading, isError, refetch, isFetching } = trpc.channelManager.hotels.useQuery();
  const { data: authMe } = trpc.auth.me.useQuery();
  const authRoles = (authMe?.roles?.length ? authMe.roles : authMe?.role ? [authMe.role] : []) as AppRole[];
  const canView = hasAnyPermission(authRoles, "operations.view_bookings");
  const canPost = hasAnyPermission(authRoles, "operations.manage_bookings");

  const effectiveHotelId = selectedHotelId || hotels?.[0]?.id || "";

  const bookingOptions = useMemo(() => {
    const opts: Array<{ booking_id: string; guest_name: string; hotel_name: string; hotel_id: string }> = [];
    for (const hotel of hotels ?? []) {
      for (const booking of (hotel as any).bookings ?? []) {
        opts.push({ booking_id: booking.id, guest_name: booking.guest_name, hotel_name: (hotel as any).name, hotel_id: (hotel as any).id });
      }
    }
    return opts;
  }, [hotels]);

  const threadsQuery = trpc.channelManager.listThreads.useQuery({ hotel_id: effectiveHotelId }, { enabled: Boolean(effectiveHotelId) });
  const staffQuery = trpc.channelManager.hotelStaff.useQuery({ hotel_id: effectiveHotelId }, { enabled: Boolean(effectiveHotelId) });

  const staffById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of (staffQuery.data as any)?.staff ?? []) {
      map.set(member.user_id, member.email ?? member.user_id);
    }
    return map;
  }, [staffQuery.data]);

  const threads: CommThread[] = useMemo(
    () => ((threadsQuery.data as any[]) ?? []).map(t => {
      const booking = bookingOptions.find(b => b.booking_id === t.booking_id);
      return {
        id: t.id,
        booking_id: t.booking_id,
        hotel_id: t.hotel_id,
        hotel_name: booking?.hotel_name ?? (hotels ?? []).find((h: any) => h.id === t.hotel_id)?.name ?? "Unknown hotel",
        guest_name: booking?.guest_name ?? (t.booking_id ? `Booking ${String(t.booking_id).slice(0, 8)}` : "General thread"),
        created_at: t.created_at,
      };
    }),
    [threadsQuery.data, bookingOptions, hotels],
  );

  const createThreadMutation = trpc.channelManager.createThread.useMutation({
    onSuccess: async (thread) => {
      await utils.channelManager.listThreads.invalidate({ hotel_id: effectiveHotelId });
      setSelectedThreadId(thread.id);
      setComposerBookingId("");
    },
    onError: (error) => setComposerError(error.message),
  });
  const messagesQuery = trpc.channelManager.listMessages.useQuery(
    { hotel_id: effectiveHotelId, thread_id: selectedThreadId },
    { enabled: Boolean(effectiveHotelId && selectedThreadId) },
  );
  const sendMessageMutation = trpc.channelManager.sendMessage.useMutation({
    onSuccess: async () => {
      setComposer("");
      await utils.channelManager.listMessages.invalidate({ hotel_id: effectiveHotelId, thread_id: selectedThreadId });
    },
    onError: (error) => setComposerError(error.message),
  });

  const messages = useMemo(
    () => ((messagesQuery.data as any[]) ?? []).map(m => ({
      id: m.id,
      body: m.body,
      created_at: m.created_at,
      sender_label: m.sender_user_id === authMe?.id ? "You" : m.sender_user_id ? (staffById.get(m.sender_user_id) ?? m.sender_user_id) : "System",
    })),
    [messagesQuery.data, staffById, authMe?.id],
  );

  // Pre-select thread from ?bookingId= query param (entry from Bookings.tsx)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get("bookingId") ?? params.get("booking_id");
    if (!bookingId) return;
    const byBooking = threads.find(t => t.booking_id === bookingId);
    if (byBooking) {
      setSelectedThreadId(byBooking.id);
      return;
    }
    const match = bookingOptions.find(b => b.booking_id === bookingId);
    if (match) {
      setSelectedHotelId(match.hotel_id);
      setComposerBookingId(bookingId);
    }
  }, [threads, bookingOptions]);

  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(t =>
      t.guest_name.toLowerCase().includes(q) ||
      (t.booking_id ?? "").toLowerCase().includes(q) ||
      t.hotel_name.toLowerCase().includes(q)
    );
  }, [threads, query]);

  const selectedThread = useMemo(() => threads.find(t => t.id === selectedThreadId) ?? null, [threads, selectedThreadId]);

  function handleSend() {
    setComposerError(null);
    if (!canPost) {
      setComposerError("You do not have permission to post messages (requires operations.manage_bookings).");
      return;
    }
    const body = composer.trim();
    if (!body) {
      setComposerError("Enter a message body.");
      return;
    }
    if (!selectedThread) {
      setComposerError("Select a booking thread first, or create one by booking ID.");
      return;
    }
    sendMessageMutation.mutate({ hotel_id: effectiveHotelId, thread_id: selectedThread.id, body });
  }

  function handleCreateThread() {
    setComposerError(null);
    if (!canPost) {
      setComposerError("You do not have permission to create threads (requires operations.manage_bookings).");
      return;
    }
    const bookingId = composerBookingId.trim();
    if (threads.some(t => bookingId && t.booking_id === bookingId)) {
      setComposerError("A thread for this booking already exists — select it from the list.");
      return;
    }
    createThreadMutation.mutate({ hotel_id: effectiveHotelId, booking_id: bookingId || null });
  }

  if (isLoading) return <LoadingCommunications />;

  if (isError || !hotels) {
    return (
      <PageState
        tone="error"
        title="Unable to load communications"
        description="The communications workspace could not be loaded for the properties visible to your account."
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  if (!canView) {
    return (
      <PageState
        tone="error"
        title="Access restricted"
        description="Your current role does not have permission to view guest communications (requires operations.view_bookings)."
      />
    );
  }

  return (
    <div className="space-y-7 pb-8">
      <section className="flex flex-col gap-5 border-b border-[#dce4df] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Operations / Communications</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#1b2c25] sm:text-4xl">Communications</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6c7e75]">Thread list attached to booking — view and post messages per booking. View requires operations.view_bookings, posting requires operations.manage_bookings.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#70837a]">
          <Clock3 size={14} aria-hidden="true" />
          <span>Per-booking threads</span>
          {isFetching && <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#b7c9c0] border-t-[#1d6b56]" aria-label="กำลังอัปเดตข้อมูล" />}
        </div>
      </section>

      {(hotels ?? []).length > 1 && (
        <section className="flex items-center gap-2 text-sm" aria-label="Hotel selector">
          <span className="text-[#52655b]">Property</span>
          <Select value={effectiveHotelId} onValueChange={(v) => { setSelectedHotelId(v); setSelectedThreadId(""); }}>
            <SelectTrigger className="w-full max-w-sm border-[#dce4df] bg-white">
              <SelectValue placeholder="Select hotel" />
            </SelectTrigger>
            <SelectContent>
              {(hotels ?? []).map((hotel: any) => (
                <SelectItem key={hotel.id} value={hotel.id}>{hotel.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Communications summary">
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">Threads</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#263b31]">{threads.length}</p>
            <p className="mt-1 text-xs text-[#778a80]">Attached to booking</p>
          </CardContent>
        </Card>
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">Selected thread</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#263b31]">{messages.length}</p>
            <p className="mt-1 text-xs text-[#778a80]">Messages in this thread</p>
          </CardContent>
        </Card>
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">Your access</p>
            <p className="mt-3 text-sm font-semibold text-[#263b31]">{canPost ? "View + Post" : "View only"}</p>
            <p className="mt-1 text-xs text-[#778a80]">operations.view_bookings / operations.manage_bookings</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.4fr]">
        <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardHeader className="border-b border-[#edf2ee] pb-4">
            <CardTitle className="flex items-center gap-2 text-lg text-[#263b31]"><MessageCircle size={18} aria-hidden="true" /> Thread list</CardTitle>
            <CardDescription>Threads are attached to booking — select one to view/post messages.</CardDescription>
            <div className="pt-3">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a8a0]" aria-hidden="true" />
                <Input placeholder="Search guest, booking, hotel" value={query} onChange={e => setQuery(e.target.value)} className="border-[#dce4df] pl-9" aria-label="ค้นหาหัวข้อข้อความ" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            {!canView && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="note">
                View requires operations.view_bookings.
              </div>
            )}
            {filteredThreads.length ? (
              filteredThreads.map(thread => {
                const active = thread.id === selectedThread?.id;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSelectedThreadId(thread.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${active ? "border-[#1d6b56] bg-[#edf7f1]" : "border-[#e6eee9] bg-[#fbfdfb] hover:border-[#cfe3d8]"}`}
                  >
                    <p className="text-sm font-semibold text-[#263b31]">{thread.guest_name} <span className="text-xs font-normal text-[#7a8c83]">· {thread.hotel_name}</span></p>
                    <p className="mt-1 text-xs text-[#6c7e75]">{thread.booking_id ? `Booking ${thread.booking_id.slice(0, 8)}` : "General thread"} · Thread list attached to booking</p>
                    <p className="mt-1 text-xs text-[#7a8c83]">{formatTime(thread.created_at)}</p>
                  </button>
                );
              })
            ) : (
              <PageState tone="empty" title="No threads" description="Create a thread for a booking to start messaging." />
            )}

            <div className="rounded-xl border border-[#e6eee9] bg-white p-3">
              <Label className="text-xs text-[#52655b]">Start new thread by booking ID</Label>
              {bookingOptions.length ? (
                <div className="mt-2">
                  <Select value={composerBookingId} onValueChange={setComposerBookingId} disabled={!canPost}>
                    <SelectTrigger className="border-[#dce4df] bg-white"><SelectValue placeholder="Select booking (or type ID below)" /></SelectTrigger>
                    <SelectContent>
                      {bookingOptions.map(b => (
                        <SelectItem key={b.booking_id} value={b.booking_id}>{b.guest_name} · {b.booking_id.slice(0, 8)} · {b.hotel_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <Input placeholder="Or enter booking ID (e.g. bk-1003)" value={composerBookingId} onChange={e => setComposerBookingId(e.target.value)} disabled={!canPost} className="mt-2 border-[#dce4df]" aria-label="Booking ID for new thread" />
              <Button type="button" onClick={handleCreateThread} disabled={!canPost || createThreadMutation.isPending} className="mt-2 w-full bg-[#1d6b56] hover:bg-[#155442] disabled:opacity-50"><MessageSquarePlus size={15} /> {createThreadMutation.isPending ? "Creating…" : "New thread"}</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardHeader className="border-b border-[#edf2ee] pb-4">
            <CardTitle className="flex items-center gap-2 text-lg text-[#263b31]"><MessageCircle size={18} aria-hidden="true" /> {selectedThread ? `${selectedThread.guest_name}${selectedThread.booking_id ? ` — ${selectedThread.booking_id.slice(0, 8)}` : ""}` : "Select a thread"}</CardTitle>
            <CardDescription>{selectedThread ? `Hotel: ${selectedThread.hotel_name}${selectedThread.booking_id ? ` · Booking ${selectedThread.booking_id}` : ""}` : "Choose a thread from the list."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {!canPost && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="note">
                View-only — posting requires operations.manage_bookings.
              </div>
            )}
            {composerError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{composerError}</div>
            )}
            {selectedThread ? (
              <>
                <div className="max-h-[380px] space-y-3 overflow-y-auto rounded-xl border border-[#e6eee9] bg-[#fbfdfb] p-3" aria-label="Message thread" aria-live="polite">
                  {messages.length ? messages.map(m => (
                    <div key={m.id} className="rounded-lg border border-[#e5ebe7] bg-white px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-xs font-semibold text-[#2a4035]">{m.sender_label}</span>
                        <span className="shrink-0 text-[11px] text-[#7a8c83]">{formatTime(m.created_at)}</span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-[#263b31]">{m.body}</p>
                    </div>
                  )) : (
                    <PageState tone="empty" title="No messages yet" description="Post the first message to this booking thread." />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="comm-body" className="text-xs text-[#52655b]">Message</Label>
                  <Textarea id="comm-body" placeholder={canPost ? "Type a message for this booking…" : "View-only — posting requires operations.manage_bookings"} value={composer} onChange={e => setComposer(e.target.value)} disabled={!canPost} className="min-h-[84px] border-[#dce4df]" aria-label="Message body" />
                  <Button type="button" onClick={handleSend} disabled={!canPost || sendMessageMutation.isPending} className="w-full bg-[#1d6b56] hover:bg-[#155442] disabled:opacity-50"><Send size={15} /> {sendMessageMutation.isPending ? "Sending…" : "Send message"}</Button>
                  <p className="text-xs leading-5 text-[#778a80]">Permissions: operations.view_bookings to view threads/messages, operations.manage_bookings to post.</p>
                </div>
              </>
            ) : (
              <PageState tone="empty" title="No thread selected" description="Pick a booking thread on the left, or create one by booking ID." />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

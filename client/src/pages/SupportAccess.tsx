import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { SUPPORT_GRANT_DURATION_HOURS, isSupportGrantActive } from "@shared/permissions";
import { hasHotelPermission } from "@shared/authorization";

export default function SupportAccess({ hotelId }: { hotelId: string }) {
  const { data: me } = trpc.auth.me.useQuery();
  const allowed = Boolean(me && hasHotelPermission(me.roles ?? [], me.memberships ?? [], hotelId, "property.manage_support_access"));
  const access = trpc.access.supportAccess.useQuery({ hotelId }, { enabled: allowed, refetchInterval: 15000 });
  const [supportEmail, setSupportEmail] = useState("");
  const [durationHours, setDurationHours] = useState<(typeof SUPPORT_GRANT_DURATION_HOURS)[number]>(1);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const refresh = async () => { await Promise.all([access.refetch(), utils.auth.me.invalidate(), utils.channelManager.hotels.invalidate()]); setError(null); };
  const grant = trpc.access.grantSupport.useMutation({ onSuccess: refresh, onError: e => setError(e.message) });
  const revoke = trpc.access.revokeSupport.useMutation({ onSuccess: refresh, onError: e => setError(e.message) });
  const supportLabel = (id: string) => access.data?.supportEmails?.[id] ?? id;
  if (!allowed) return <div role="alert">Only the hotel owner can approve support access.</div>;
  return <div className="page-content">
    <section className="page-intro"><h1>Support access</h1><p>Approve access for a support account. You can revoke a key at any time. Staff management is always excluded.</p></section>
    {(error || access.error) && <div role="alert">{error ?? access.error?.message}</div>}
    <form className="panel" onSubmit={e => { e.preventDefault(); grant.mutate({ hotelId, supportEmail, durationHours, mode }); }}>
      <label>Support email<input required type="email" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} /></label>
      <label>Duration<select value={durationHours} onChange={e => setDurationHours(Number(e.target.value) as typeof durationHours)}>{SUPPORT_GRANT_DURATION_HOURS.map(hours => <option key={hours} value={hours}>{hours} hours</option>)}</select></label>
      <label>Access mode<select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="view">View only</option><option value="edit">Edit</option></select></label>
      <button className="button button-primary" disabled={grant.isPending || revoke.isPending || access.isLoading} type="submit">Approve support key</button>
    </form>
    {access.isLoading && <p role="status">Loading support keys…</p>}
    <section className="panel"><h2>Support keys</h2>
      {access.data?.grants.length === 0 && <p>No support keys issued.</p>}
      {access.data?.grants.map(key => <article key={key.id}><strong>{supportLabel(key.supportUserId)}</strong><p>{key.mode === "edit" ? "Edit" : "View only"} · expires {new Date(key.expiresAt).toLocaleString()} · {key.revokedAt ? "Revoked" : isSupportGrantActive({ ...key, canEdit: key.mode === "edit" }) ? "Active" : "Expired"}</p>
        {!key.revokedAt && <button type="button" className="button button-quiet" disabled={revoke.isPending} onClick={() => revoke.mutate({ hotelId, grantId: key.id })}>Revoke key</button>}
      </article>)}
    </section>
    <section className="panel"><h2>Support access history</h2><p>Who accessed what, including denied attempts.</p>
      {access.data?.log.length === 0 && <p>No support access recorded.</p>}
      {access.data?.log.map(entry => <p key={entry.id}>{new Date(entry.createdAt).toLocaleString()} · {supportLabel(entry.supportUserId)} · {entry.action} · key {entry.grantId ?? "none"}</p>)}
    </section>
  </div>;
}

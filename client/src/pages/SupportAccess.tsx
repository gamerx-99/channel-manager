import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";
import { DELETED_USER_ID } from "@shared/accountDeletion";
import { SUPPORT_GRANT_DURATION_HOURS, isSupportGrantActive } from "@shared/permissions";
import { hasHotelPermission } from "@shared/authorization";

export default function SupportAccess({ hotelId }: { hotelId: string }) {
  const { t } = useTranslation();
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
  const supportLabel = (id: string) => id === DELETED_USER_ID ? t("accountDeletion.deletedUser") : access.data?.supportEmails?.[id] ?? id;
  const modeLabel = (value: string) => value === "edit" ? t("supportAccess.modeEdit") : t("supportAccess.modeView");
  if (!allowed) return <div role="alert">{t("supportAccess.ownerOnly")}</div>;
  return <div className="page-content">
    <section className="page-intro"><h1>{t("supportAccess.title")}</h1><p>{t("supportAccess.lede")}</p></section>
    {(error || access.error) && <div role="alert">{error ?? access.error?.message}</div>}
    <form className="panel" onSubmit={e => { e.preventDefault(); grant.mutate({ hotelId, supportEmail, durationHours, mode }); }}>
      <label>{t("supportAccess.emailLabel")}<input required type="email" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} /></label>
      <label>{t("supportAccess.durationLabel")}<select value={durationHours} onChange={e => setDurationHours(Number(e.target.value) as typeof durationHours)}>{SUPPORT_GRANT_DURATION_HOURS.map(hours => <option key={hours} value={hours}>{t("supportAccess.hours", { count: hours })}</option>)}</select></label>
      <label>{t("supportAccess.modeLabel")}<select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="view">{t("supportAccess.modeView")}</option><option value="edit">{t("supportAccess.modeEdit")}</option></select></label>
      <button className="button button-primary" disabled={grant.isPending || revoke.isPending || access.isLoading} type="submit">{t("supportAccess.approve")}</button>
    </form>
    {access.isLoading && <p role="status">{t("supportAccess.loading")}</p>}
    <section className="panel"><h2>{t("supportAccess.keysTitle")}</h2>
      {access.data?.grants.length === 0 && <p>{t("supportAccess.noKeys")}</p>}
      {access.data?.grants.map(key => <article key={key.id}><strong>{supportLabel(key.supportUserId)}</strong><p>{modeLabel(key.mode)} · {t("supportAccess.expires", { date: new Date(key.expiresAt).toLocaleString() })} · {key.revokedAt ? t("supportAccess.statusRevoked") : isSupportGrantActive({ ...key, canEdit: key.mode === "edit" }) ? t("supportAccess.statusActive") : t("supportAccess.statusExpired")}</p>
        {!key.revokedAt && <button type="button" className="button button-quiet" disabled={revoke.isPending} onClick={() => revoke.mutate({ hotelId, grantId: key.id })}>{t("supportAccess.revoke")}</button>}
      </article>)}
    </section>
    <section className="panel"><h2>{t("supportAccess.historyTitle")}</h2><p>{t("supportAccess.historyDesc")}</p>
      {access.data?.log.length === 0 && <p>{t("supportAccess.noHistory")}</p>}
      {access.data?.log.map(entry => <p key={entry.id}>{new Date(entry.createdAt).toLocaleString()} · {supportLabel(entry.supportUserId)} · {entry.action} · {t("supportAccess.keyRef", { key: entry.grantId ?? t("supportAccess.noKeyRef") })}</p>)}
    </section>
  </div>;
}

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
  const actionLabel = (action: string) => {
    const known = action.startsWith("access.grantSupport") ? "supportAccess.actionGranted" : action.startsWith("access.revokeSupport") ? "supportAccess.actionRevoked" : null;
    return known ? t(known) : null;
  };
  if (!allowed) return <div className="page-content"><section role="alert" className="panel empty-state">{t("supportAccess.ownerOnly")}</section></div>;
  return <div className="page-content">
    <section className="page-intro"><div className="eyebrow">{t("supportAccess.eyebrow")}</div><h1 aria-label={t("supportAccess.title")}>{t("supportAccess.title")}<span className="title-mark" aria-hidden="true">.</span></h1><p className="lede">{t("supportAccess.lede")}</p></section>
    {(error || access.error) && <div role="alert" className="panel empty-state form-error">{error ?? access.error?.message}</div>}
    <form className="panel mb-5" onSubmit={e => { e.preventDefault(); grant.mutate({ hotelId, supportEmail, durationHours, mode }); }}>
      <div className="panel-heading"><div><div className="eyebrow">{t("supportAccess.eyebrow")}</div><h2>{t("supportAccess.formTitle")}</h2></div></div>
      <div className="form-grid"><label>{t("supportAccess.emailLabel")}<input required type="email" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} /></label>
        <label>{t("supportAccess.durationLabel")}<select value={durationHours} onChange={e => setDurationHours(Number(e.target.value) as typeof durationHours)}>{SUPPORT_GRANT_DURATION_HOURS.map(hours => <option key={hours} value={hours}>{t("supportAccess.hours", { count: hours })}</option>)}</select></label>
        <label>{t("supportAccess.modeLabel")}<select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="view">{t("supportAccess.modeView")}</option><option value="edit">{t("supportAccess.modeEdit")}</option></select></label>
      </div><div className="form-submit"><button className="button button-primary" disabled={grant.isPending || revoke.isPending || access.isLoading} type="submit">{t("supportAccess.approve")}</button></div>
    </form>
    {access.isLoading && <p role="status">{t("supportAccess.loading")}</p>}
    <section className="panel mb-5"><div className="panel-heading"><div><div className="eyebrow">{t("supportAccess.eyebrow")}</div><h2>{t("supportAccess.keysTitle")}</h2></div></div>
      {access.data?.grants.length === 0 && <div className="empty-state">{t("supportAccess.noKeys")}</div>}
      {!!access.data?.grants.length && <ul className="task-list">{access.data.grants.map(key => {
        const status = key.revokedAt ? "revoked" : isSupportGrantActive({ ...key, canEdit: key.mode === "edit" }) ? "active" : "expired";
        const statusText = status === "revoked" ? t("supportAccess.statusRevoked") : status === "active" ? t("supportAccess.statusActive") : t("supportAccess.statusExpired");
        return <li key={key.id} className="task-item"><div><strong>{supportLabel(key.supportUserId)}</strong> <span className={`status-pill ${status === "active" ? "live" : "setup"}`}>{statusText}</span><p className="field-help">{modeLabel(key.mode)} · {t("supportAccess.expires", { date: new Date(key.expiresAt).toLocaleString() })}</p></div>{!key.revokedAt && <button type="button" className="button button-quiet" disabled={revoke.isPending} onClick={() => revoke.mutate({ hotelId, grantId: key.id })}>{t("supportAccess.revoke")}</button>}</li>;
      })}</ul>}
    </section>
    <section className="panel"><div className="panel-heading"><div><div className="eyebrow">{t("supportAccess.eyebrow")}</div><h2>{t("supportAccess.historyTitle")}</h2><p className="lede">{t("supportAccess.historyDesc")}</p></div></div>
      {access.data?.log.length === 0 && <div className="empty-state">{t("supportAccess.noHistory")}</div>}
      {!!access.data?.log.length && <div className="table-wrap"><table className="data-table"><thead><tr><th>{t("supportAccess.historyDate")}</th><th>{t("supportAccess.historyUser")}</th><th>{t("supportAccess.historyAction")}</th><th>{t("supportAccess.historyKey")}</th></tr></thead><tbody>{access.data.log.map(entry => <tr key={entry.id}><td>{new Date(entry.createdAt).toLocaleString()}</td><td>{supportLabel(entry.supportUserId)}</td><td>{actionLabel(entry.action) ?? <code className="source-tag">{entry.action}</code>}</td><td>{t("supportAccess.keyRef", { key: entry.grantId ?? t("supportAccess.noKeyRef") })}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}

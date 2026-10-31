import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";

/** Super admin only: a support account works once its invitee accepts by email. */
export function SupportAccountsPanel() {
  const { t } = useTranslation();
  const accounts = trpc.access.supportAccounts.useQuery();
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invite = trpc.access.inviteSupportAccount.useMutation({
    onSuccess: async result => { setNotice(t("adminUsers.supportInviteSent", { email: result.email })); setError(null); setEmail(""); await accounts.refetch(); },
    onError: e => { setError(e.message); setNotice(null); },
  });
  const disable = trpc.access.disableSupportAccount.useMutation({
    onSuccess: async () => { setError(null); await accounts.refetch(); },
    onError: e => setError(e.message),
  });
  const statusOf = (account: { acceptedAt: Date | string | null; disabledAt: Date | string | null }) =>
    t(account.disabledAt ? "adminUsers.supportDisabled" : account.acceptedAt ? "adminUsers.supportActive" : "adminUsers.supportPending");

  return (
    <section className="panel">
      <div className="panel-heading"><div><div className="eyebrow">{t("adminUsers.supportEyebrow")}</div><h2>{t("adminUsers.supportTitle")}</h2></div></div>
      <p className="field-help">{t("adminUsers.supportLede")}</p>
      {(error || accounts.error) && <div role="alert">{error ?? accounts.error?.message}</div>}
      {notice && <p role="status">{notice}</p>}
      <form onSubmit={e => { e.preventDefault(); invite.mutate({ email }); }}>
        <label>{t("adminUsers.supportEmailLabel")}<input required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <button className="button button-primary" disabled={invite.isPending} type="submit">{t("adminUsers.supportInvite")}</button>
      </form>
      {accounts.data?.length === 0 && <p>{t("adminUsers.supportEmpty")}</p>}
      {accounts.data?.map(account => <article key={account.id}>
        <strong>{account.email}</strong> · {statusOf(account)}
        {!account.disabledAt && <button type="button" className="button button-quiet" disabled={disable.isPending} onClick={() => disable.mutate({ id: account.id })}>{t("adminUsers.supportDisable")}</button>}
      </article>)}
    </section>
  );
}

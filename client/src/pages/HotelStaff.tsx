import { FormEvent, useMemo, useState } from "react";
import React from "react";
import { Link } from "wouter";
import { ArrowRightLeft, Check, Copy, Link2, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { ASSIGNABLE_STAFF_ROLES, ROLE_LABELS, isPlatformRole, type AssignableStaffRole, type HumanRole } from "@shared/authorization";
import { useTranslation } from "@/lib/i18n";

type HotelStaffProps = { id: string };

type InviteForm = {
  email: string;
  role: AssignableStaffRole;
};

type StaffConfirmation =
  | {
      kind: "remove";
      membershipId: string;
      email: string | null;
      currentRole: AssignableStaffRole;
    }
  | {
      kind: "role";
      membershipId: string;
      email: string | null;
      currentRole: AssignableStaffRole;
      nextRole: AssignableStaffRole;
    }
  | {
      kind: "transfer";
      currentMembershipId: string;
      currentEmail: string | null;
      targetMembershipId: string;
      targetEmail: string | null;
    };

const STAFF_ROLES = ASSIGNABLE_STAFF_ROLES;

const emptyInvite: InviteForm = { email: "", role: "front_desk" };

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function roleLabel(role: HumanRole) {
  return ROLE_LABELS[role];
}

export default function HotelStaff({ id: hotelId }: HotelStaffProps) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const { data: authMe } = trpc.auth.me.useQuery();
  const isSuperAdmin = authMe?.role === "super_admin";
  const staffQuery = trpc.channelManager.hotelStaff.useQuery(
    { hotel_id: hotelId },
    { enabled: Boolean(hotelId) },
  );
  const auditQuery = trpc.channelManager.listHotelAdminAuditLogs.useQuery(
    { hotel_id: hotelId, limit: 50 },
    { enabled: Boolean(hotelId) },
  );
  const [auditDetailId, setAuditDetailId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [inviteForm, setInviteForm] = useState<InviteForm>(emptyInvite);
  const [confirmation, setConfirmation] = useState<StaffConfirmation | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [signupLinkOpen, setSignupLinkOpen] = useState(false);
  const [signupLinkHours, setSignupLinkHours] = useState(72);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const inviteStaff = trpc.channelManager.inviteHotelStaff.useMutation({
    onSuccess: async () => {
      await staffQuery.refetch();
      setInviteOpen(false);
      setInviteForm(emptyInvite);
      setFormError(null);
    },
    onError: error => setFormError(error.message),
  });
  const updateRole = trpc.channelManager.updateHotelStaffRole.useMutation({
    onSuccess: async () => {
      await staffQuery.refetch();
      setConfirmation(null);
      setFormError(null);
    },
    onError: error => setFormError(error.message),
  });
  const removeStaff = trpc.channelManager.removeHotelStaff.useMutation({
    onSuccess: async () => {
      await Promise.all([
        staffQuery.refetch(),
        utils.channelManager.hotels.invalidate(),
        utils.channelManager.dashboard.invalidate(),
      ]);
      setConfirmation(null);
      setFormError(null);
    },
    onError: error => setFormError(error.message),
  });
  const signupLinksQuery = trpc.channelManager.listSignupLinks.useQuery(
    { hotel_id: hotelId },
    { enabled: Boolean(hotelId) && isSuperAdmin },
  );
  const createSignupLink = trpc.channelManager.createSignupLink.useMutation({
    onSuccess: async data => {
      setGeneratedLink(`${window.location.origin}/signup/${data.token}`);
      setLinkCopied(false);
      await signupLinksQuery.refetch();
    },
    onError: error => setFormError(error.message),
  });
  const transferAdmin = trpc.channelManager.transferHotelAdmin.useMutation({
    onSuccess: async () => {
      await Promise.all([
        staffQuery.refetch(),
        auditQuery.refetch(),
        utils.channelManager.hotels.invalidate(),
        utils.channelManager.dashboard.invalidate(),
      ]);
      setConfirmation(null);
      setTransferOpen(false);
      setTransferTargetId("");
      setFormError(null);
    },
    onError: error => setFormError(error.message),
  });

  const staff = staffQuery.data?.staff ?? [];
  const isPending = inviteStaff.isPending || updateRole.isPending || removeStaff.isPending || transferAdmin.isPending;
  const activeStaffCount = useMemo(
    () => staff.filter(member => Boolean(member.confirmed_at || member.last_sign_in_at)).length,
    [staff],
  );
  const currentHotelAdmin = staff.find(member => member.role === "hotel_owner");
  const hotelAdminAlreadyAssigned = Boolean(currentHotelAdmin);
  const auditUserLabel = (userId: string) => staff.find(member => member.user_id === userId)?.email ?? userId;
  const transferCandidates = staff.filter(member => member.role !== "hotel_owner" && !isPlatformRole(member.role));
  const hotelAdminRestrictionText = t("hotelStaff.hotelAdminRestrictionText");

  async function copyGeneratedLink() {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setLinkCopied(true);
    } catch {
      setFormError(t("hotelStaff.errorCopyLink"));
    }
  }

  function closeSignupLinkModal() {
    setSignupLinkOpen(false);
    setGeneratedLink(null);
    setLinkCopied(false);
    setSignupLinkHours(72);
  }

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const email = inviteForm.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setFormError(t("hotelStaff.errorValidEmail"));
      return;
    }
    inviteStaff.mutate({ hotel_id: hotelId, email, role: inviteForm.role });
  }

  function requestRoleChange(
    membershipId: string,
    email: string | null,
    currentRole: HumanRole,
    nextRole: AssignableStaffRole,
  ) {
    if (isPending || isPlatformRole(currentRole) || currentRole === nextRole) return;
    setFormError(null);
    setConfirmation({
      kind: "role",
      membershipId,
      email,
      currentRole: currentRole as AssignableStaffRole,
      nextRole,
    });
  }

  function requestRemoveMember(
    membershipId: string,
    email: string | null,
    currentRole: HumanRole,
  ) {
    if (isPending || isPlatformRole(currentRole)) return;
    setFormError(null);
    setConfirmation({
      kind: "remove",
      membershipId,
      email,
      currentRole: currentRole as AssignableStaffRole,
    });
  }

  function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    const target = transferCandidates.find(member => member.id === transferTargetId);
    if (!currentHotelAdmin || !target) {
      setFormError(t("hotelStaff.errorChooseTransferTarget"));
      return;
    }
    setFormError(null);
    setTransferOpen(false);
    setConfirmation({
      kind: "transfer",
      currentMembershipId: currentHotelAdmin.id,
      currentEmail: currentHotelAdmin.email,
      targetMembershipId: target.id,
      targetEmail: target.email,
    });
  }

  function confirmStaffAction() {
    if (!confirmation || isPending) return;
    setFormError(null);
    if (confirmation.kind === "role") {
      updateRole.mutate({
        hotel_id: hotelId,
        membership_id: confirmation.membershipId,
        role: confirmation.nextRole,
      });
      return;
    }
    if (confirmation.kind === "transfer") {
      transferAdmin.mutate({ hotel_id: hotelId, target_membership_id: confirmation.targetMembershipId });
      return;
    }
    removeStaff.mutate({ hotel_id: hotelId, membership_id: confirmation.membershipId });
  }

  return (
    <div className="page-content">
      <section className="page-intro intro-split">
        <div>
          <div className="eyebrow">{t("hotelStaff.eyebrow")}</div>
          <h1>{t("hotelStaff.title")}<span className="title-mark">.</span></h1>
          <p className="lede">{t("hotelStaff.lede")}</p>
        </div>
        <div className="page-intro-actions" style={{ display: "flex", gap: "0.5rem" }}>
          {isSuperAdmin && !hotelAdminAlreadyAssigned && (
            <button className="button button-quiet" type="button" onClick={() => { setFormError(null); setSignupLinkOpen(true); }}>
              <Link2 size={16} /> {t("hotelStaff.generateSignupLink")}
            </button>
          )}
          <button className="button button-primary" type="button" onClick={() => { setFormError(null); setInviteOpen(true); }}>
            <UserPlus size={16} /> {t("hotelStaff.inviteStaff")}
          </button>
        </div>
      </section>

      {formError && (
        <div className="form-error page-alert" role="alert">
          {formError}
          <button type="button" className="icon-button" onClick={() => setFormError(null)} aria-label={t("hotelStaff.dismissErrorAria")}><X size={15} /></button>
        </div>
      )}

      {staffQuery.isLoading && <section className="panel empty-state" role="status" aria-live="polite"><Users size={20} /><strong>{t("hotelStaff.loadingStaffTitle")}</strong><span>{t("hotelStaff.loadingStaffDesc")}</span></section>}
      {staffQuery.error && <section className="panel empty-state" role="alert"><ShieldCheck size={20} /><strong>{t("hotelStaff.staffAccessUnavailable")}</strong><span>{staffQuery.error.message}</span><Link href="/dashboard" className="button button-quiet">{t("hotelStaff.returnToOverview")}</Link></section>}

      {!staffQuery.isLoading && !staffQuery.error && (
        <>
          <section className="summary-strip">
            <div><span className="strip-label">{t("hotelStaff.summaryHotelStaff")}</span><strong>{staff.length}</strong></div>
            <div><span className="strip-label">{t("hotelStaff.summaryActiveAccounts")}</span><strong>{activeStaffCount}</strong></div>
            <div className="strip-caption"><ShieldCheck size={16} /> {t("hotelStaff.summaryCaption")}</div>
            {currentHotelAdmin && transferCandidates.length > 0 && (
              <button
                className="button button-quiet button-small"
                type="button"
                onClick={() => { setFormError(null); setTransferTargetId(transferCandidates[0]?.id ?? ""); setTransferOpen(true); }}
                disabled={isPending}
              >
                <ArrowRightLeft size={15} /> {t("hotelStaff.transferHotelAdmin")}
              </button>
            )}
          </section>

          <section className="panel list-panel">
            <div className="panel-heading">
              <div><div className="eyebrow">{t("hotelStaff.membershipLedgerEyebrow")}</div><h2>{t("hotelStaff.teamTitle", { hotelName: staffQuery.data?.hotel.name ?? "Hotel" })}</h2></div>
              <span className="status-pill live"><i /> {t("hotelStaff.recordsPill", { count: staff.length })}</span>
            </div>
            <p className="mobile-scroll-hint staff-scroll-hint" role="note">{t("hotelStaff.tableScrollHint")}</p>
            <div className="table-wrap staff-table-wrap">
              <table className="data-table staff-table">
                <thead><tr><th>{t("hotelStaff.colEmail")}</th><th>{t("hotelStaff.colRole")}</th><th>{t("hotelStaff.colActivity")}</th><th>{t("hotelStaff.colAdded")}</th><th /></tr></thead>
                <tbody>
                  {staff.length === 0 ? (
                    <tr><td colSpan={5}><div className="table-empty"><Users size={18} /><strong>{t("hotelStaff.noStaffYetTitle")}</strong><span>{t("hotelStaff.noStaffYetDesc")}</span></div></td></tr>
                  ) : staff.map(member => (
                    <tr key={member.id}>
                      <td><strong>{member.email ?? t("hotelStaff.noEmail")}</strong><small>{member.user_id}</small></td>
                      <td>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="role-select-tooltip-trigger"
                                title={hotelAdminAlreadyAssigned && member.role !== "hotel_owner" ? hotelAdminRestrictionText : undefined}
                              >
                                <select
                                  aria-label={t("hotelStaff.roleForUserAria", { user: member.email ?? member.user_id })}
                                  aria-describedby={hotelAdminAlreadyAssigned && member.role !== "hotel_owner" ? `hotel-admin-role-help-${member.id}` : undefined}
                                  value={isPlatformRole(member.role) ? "hotel_owner" : member.role}
                                  onChange={event => requestRoleChange(
                                    member.id,
                                    member.email,
                                    member.role as HumanRole,
                                    event.target.value as AssignableStaffRole,
                                  )}
                                  disabled={isPending || isPlatformRole(member.role)}
                                >
                                  {STAFF_ROLES.map(role => {
                                    const hotelAdminOptionDisabled = role === "hotel_owner" && hotelAdminAlreadyAssigned && member.role !== "hotel_owner";
                                    return <option value={role} key={role} disabled={hotelAdminOptionDisabled}>{roleLabel(role)}{hotelAdminOptionDisabled ? t("hotelStaff.alreadyAssignedSuffix") : ""}</option>;
                                  })}
                                </select>
                              </span>
                            </TooltipTrigger>
                            {hotelAdminAlreadyAssigned && member.role !== "hotel_owner" && (
                              <TooltipContent side="top">{hotelAdminRestrictionText}</TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                        {hotelAdminAlreadyAssigned && member.role !== "hotel_owner" && (
                          <span id={`hotel-admin-role-help-${member.id}`} className="sr-only">{hotelAdminRestrictionText}</span>
                        )}
                      </td>
                      <td>{member.last_sign_in_at ? t("hotelStaff.lastSignIn", { date: formatDate(member.last_sign_in_at) }) : member.confirmed_at ? t("hotelStaff.confirmed", { date: formatDate(member.confirmed_at) }) : t("hotelStaff.invitationPending")}</td>
                      <td>{formatDate(String(member.created_at))}</td>
                      <td className="align-right"><button className="button button-quiet button-small" type="button" onClick={() => requestRemoveMember(member.id, member.email, member.role as HumanRole)} disabled={isPending || isPlatformRole(member.role)}>{removeStaff.isPending ? t("hotelStaff.removing") : t("hotelStaff.remove")}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel list-panel audit-log-panel" aria-labelledby="hotel-admin-audit-title">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">{t("hotelStaff.securityHistoryEyebrow")}</div>
                <h2 id="hotel-admin-audit-title">{t("hotelStaff.auditLogTitle")}</h2>
              </div>
              <span className="status-pill"><i /> {t("hotelStaff.eventsPill", { count: auditQuery.data?.length ?? 0 })}</span>
            </div>
            {auditQuery.isLoading ? (
              <div className="audit-empty" role="status">{t("hotelStaff.loadingPermissionHistory")}</div>
            ) : auditQuery.error ? (
              <div className="audit-empty" role="alert">{t("hotelStaff.auditHistoryUnavailable", { error: auditQuery.error.message })}</div>
            ) : auditQuery.data?.length ? (
              <div className="audit-log-list">
                {auditQuery.data.map(event => (
                  <article className="audit-log-row" key={event.id}>
                    <div className="audit-log-marker" aria-hidden="true"><ShieldCheck size={15} /></div>
                    <div className="audit-log-main">
                      <div className="audit-log-title"><strong>{t("hotelStaff.adminTransferredTitle")}</strong><time dateTime={String(event.createdAt)}>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}</time></div>
                      <p>{t("hotelStaff.transferredAccessSummary", {
                        actor: auditUserLabel(event.actorUserId),
                        previous: auditUserLabel(event.previousAdminUserId),
                        next: auditUserLabel(event.newAdminUserId),
                      })}</p>
                      <small>{t("hotelStaff.eventId", { id: event.id })}</small>
                    </div>
                    <button className="button button-quiet button-small" type="button" onClick={() => setAuditDetailId(event.id)}>{t("hotelStaff.viewDetails")}</button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="audit-empty"><ShieldCheck size={18} /><strong>{t("hotelStaff.noPermissionChangesTitle")}</strong><span>{t("hotelStaff.noPermissionChangesDesc")}</span></div>
            )}
          </section>

          <p className="page-footnote"><span className="dot pine" /> {t("hotelStaff.pageFootnote")}</p>
        </>
      )}

      {confirmation && (
        <div className="admin-modal-backdrop" role="presentation">
          <div
            className="panel admin-modal confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-confirmation-title"
            aria-describedby="staff-confirmation-description"
            tabIndex={-1}
            onKeyDown={event => {
              if (event.key === "Escape" && !isPending) setConfirmation(null);
            }}
          >
            <div className="panel-heading">
              <div>
                <div className="eyebrow">{t("hotelStaff.confirmActionEyebrow")}</div>
                <h2 id="staff-confirmation-title">
                  {confirmation.kind === "remove" ? t("hotelStaff.confirmTitleRemove") : confirmation.kind === "transfer" ? t("hotelStaff.confirmTitleTransfer") : t("hotelStaff.confirmTitleRole")}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setConfirmation(null)}
                disabled={isPending}
                aria-label={t("hotelStaff.closeConfirmationAria")}
              >
                <X size={17} />
              </button>
            </div>
            <div className="confirmation-body">
              <p className="modal-lede" id="staff-confirmation-description">
                {confirmation.kind === "remove"
                  ? t("hotelStaff.confirmLedeRemove", { email: confirmation.email ?? t("hotelStaff.thisStaffMember"), hotelName: staffQuery.data?.hotel.name ?? t("hotelStaff.thisHotel") })
                  : confirmation.kind === "transfer"
                    ? t("hotelStaff.confirmLedeTransfer", { hotelName: staffQuery.data?.hotel.name ?? t("hotelStaff.thisHotel"), currentAdmin: confirmation.currentEmail ?? t("hotelStaff.theCurrentAdmin"), targetStaff: confirmation.targetEmail ?? t("hotelStaff.theSelectedStaff") })
                    : t("hotelStaff.confirmLedeRole", { email: confirmation.email ?? t("hotelStaff.thisStaffMember"), hotelName: staffQuery.data?.hotel.name ?? t("hotelStaff.thisHotel") })}
              </p>
              {confirmation.kind === "role" && (
                <div className="role-change-summary" aria-label={t("hotelStaff.roleChangeSummaryAria")}>
                  <div><span>{t("hotelStaff.currentRole")}</span><strong>{roleLabel(confirmation.currentRole)}</strong></div>
                  <span className="role-change-arrow" aria-hidden="true">→</span>
                  <div><span>{t("hotelStaff.newRole")}</span><strong>{roleLabel(confirmation.nextRole)}</strong></div>
                </div>
              )}
              {confirmation.kind === "transfer" && (
                <div className="role-change-summary" aria-label={t("hotelStaff.transferSummaryAria")}>
                  <div><span>{t("hotelStaff.currentHotelAdminLabel")}</span><strong>{confirmation.currentEmail ?? t("hotelStaff.unknownAccount")}</strong></div>
                  <span className="role-change-arrow" aria-hidden="true">→</span>
                  <div><span>{t("hotelStaff.newHotelAdminLabel")}</span><strong>{confirmation.targetEmail ?? t("hotelStaff.selectedStaffMember")}</strong></div>
                </div>
              )}
              {confirmation.kind === "role" && confirmation.nextRole === "hotel_owner" && (
                <p className="form-error" role="alert">
                  {t("hotelStaff.warnOneAdminAllowed")}
                </p>
              )}
              {confirmation.kind === "remove" && confirmation.currentRole === "hotel_owner" && (
                <p className="form-error" role="alert">
                  {t("hotelStaff.warnRemoveAdmin")}
                </p>
              )}
              {confirmation.kind === "transfer" && (
                <p className="form-error" role="alert">
                  {t("hotelStaff.warnTransferRetention")}
                </p>
              )}
              <div className="modal-actions">
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => setConfirmation(null)}
                  disabled={isPending}
                >
                  {t("hotelStaff.cancel")}
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  onClick={confirmStaffAction}
                  disabled={isPending}
                >
                  {isPending
                    ? confirmation.kind === "remove" ? t("hotelStaff.removing") : confirmation.kind === "transfer" ? t("hotelStaff.transferring") : t("hotelStaff.saving")
                    : confirmation.kind === "remove" ? t("hotelStaff.confirmButtonRemove") : confirmation.kind === "transfer" ? t("hotelStaff.confirmButtonTransfer") : t("hotelStaff.confirmButtonRole")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {auditDetailId && auditQuery.data?.find(event => event.id === auditDetailId) && (
        (() => {
          const event = auditQuery.data.find(item => item.id === auditDetailId)!;
          return (
            <div className="admin-modal-backdrop" role="presentation">
              <div className="panel admin-modal audit-detail-modal" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" aria-describedby="audit-detail-description">
                <div className="panel-heading">
                  <div><div className="eyebrow">{t("hotelStaff.auditDetailEyebrow")}</div><h2 id="audit-detail-title">{t("hotelStaff.auditDetailTitle")}</h2></div>
                  <button type="button" className="icon-button" onClick={() => setAuditDetailId(null)} aria-label={t("hotelStaff.closeAuditDetailAria")}><X size={17} /></button>
                </div>
                <div className="confirmation-body" id="audit-detail-description">
                  <p className="modal-lede">{t("hotelStaff.recordedBy", {
                    actor: auditUserLabel(event.actorUserId),
                    date: new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short" }).format(new Date(event.createdAt)),
                  })}</p>
                  <div className="audit-detail-grid">
                    <div><span>{t("hotelStaff.previousHotelAdmin")}</span><strong>{auditUserLabel(event.previousAdminUserId)}</strong></div>
                    <div><span>{t("hotelStaff.newHotelAdminLabel")}</span><strong>{auditUserLabel(event.newAdminUserId)}</strong></div>
                    <div><span>{t("hotelStaff.hotel")}</span><strong>{staffQuery.data?.hotel.name ?? event.hotelId}</strong></div>
                    <div><span>{t("hotelStaff.action")}</span><strong>{event.action}</strong></div>
                  </div>
                  <details className="audit-payload"><summary>{t("hotelStaff.viewFullPayload")}</summary><pre>{JSON.stringify(event.details, null, 2)}</pre></details>
                  <div className="modal-actions"><button className="button button-primary" type="button" onClick={() => setAuditDetailId(null)}>{t("hotelStaff.close")}</button></div>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {transferOpen && (
        <div className="admin-modal-backdrop" role="presentation">
          <div className="panel admin-modal" role="dialog" aria-modal="true" aria-labelledby="transfer-staff-title" aria-describedby="transfer-staff-description">
            <div className="panel-heading">
              <div><div className="eyebrow">{t("hotelStaff.transferModalEyebrow")}</div><h2 id="transfer-staff-title">{t("hotelStaff.transferHotelAdmin")}</h2></div>
              <button type="button" className="icon-button" onClick={() => setTransferOpen(false)} disabled={isPending} aria-label={t("hotelStaff.closeTransferAria")}><X size={17} /></button>
            </div>
            <form className="admin-form" onSubmit={submitTransfer}>
              <p className="modal-lede" id="transfer-staff-description">{t("hotelStaff.transferModalLede")}</p>
              <label>{t("hotelStaff.newHotelAdminLabel")}
                <select aria-label={t("hotelStaff.newHotelAdminLabel")} value={transferTargetId} onChange={event => setTransferTargetId(event.target.value)} autoFocus required>
                  <option value="" disabled>{t("hotelStaff.chooseStaffMemberPlaceholder")}</option>
                  {transferCandidates.map(member => (
                    <option value={member.id} key={member.id}>{member.email ?? t("hotelStaff.unnamedStaffMember")} — {roleLabel(member.role as HumanRole)}</option>
                  ))}
                </select>
              </label>
              <p className="field-help">{t("hotelStaff.transferFieldHelp")}</p>
              <div className="modal-actions"><button className="button button-quiet" type="button" onClick={() => setTransferOpen(false)} disabled={isPending}>{t("hotelStaff.cancel")}</button><button className="button button-primary" type="submit" disabled={isPending || !transferTargetId}>{t("hotelStaff.reviewTransfer")}</button></div>
            </form>
          </div>
        </div>
      )}

      {inviteOpen && (
        <div className="admin-modal-backdrop" role="presentation">
          <div className="panel admin-modal" role="dialog" aria-modal="true" aria-labelledby="invite-staff-title">
            <div className="panel-heading"><div><div className="eyebrow">{t("hotelStaff.inviteModalEyebrow")}</div><h2 id="invite-staff-title">{t("hotelStaff.inviteStaffTitle")}</h2></div><button type="button" className="icon-button" onClick={() => setInviteOpen(false)} aria-label={t("hotelStaff.closeInviteAria")}><X size={17} /></button></div>
            <form className="admin-form" onSubmit={submitInvite}>
              <p className="modal-lede">{t("hotelStaff.inviteModalLede")}</p>
              <label>{t("hotelStaff.emailAddressLabel")}<input type="email" autoFocus value={inviteForm.email} onChange={event => setInviteForm({ ...inviteForm, email: event.target.value })} placeholder={t("hotelStaff.emailAddressPlaceholder")} required /></label>
              <label>{t("hotelStaff.hotelRoleLabel")}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="role-select-tooltip-trigger" title={hotelAdminAlreadyAssigned ? hotelAdminRestrictionText : undefined}>
                        <select
                          aria-label={t("hotelStaff.hotelRoleLabel")}
                          aria-describedby={hotelAdminAlreadyAssigned ? "hotel-admin-role-help" : undefined}
                          value={inviteForm.role}
                          onChange={event => setInviteForm({ ...inviteForm, role: event.target.value as InviteForm["role"] })}
                        >
                          {STAFF_ROLES.map(role => {
                            const hotelAdminOptionDisabled = role === "hotel_owner" && hotelAdminAlreadyAssigned;
                            return <option value={role} key={role} disabled={hotelAdminOptionDisabled}>{roleLabel(role)}{hotelAdminOptionDisabled ? t("hotelStaff.alreadyAssignedSuffix") : ""}</option>;
                          })}
                        </select>
                      </span>
                    </TooltipTrigger>
                    {hotelAdminAlreadyAssigned && (
                      <TooltipContent side="top">{hotelAdminRestrictionText}</TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                {hotelAdminAlreadyAssigned && <span className="field-help" id="hotel-admin-role-help">{t("hotelStaff.hotelAdminUnavailableHelp")}</span>}
              </label>
              <div className="modal-actions"><button className="button button-quiet" type="button" onClick={() => setInviteOpen(false)} disabled={isPending}>{t("hotelStaff.cancel")}</button><button className="button button-primary" type="submit" disabled={isPending}>{inviteStaff.isPending ? t("hotelStaff.sendingInvite") : t("hotelStaff.sendInvitation")}</button></div>
            </form>
          </div>
        </div>
      )}

      {signupLinkOpen && (
        <div className="admin-modal-backdrop" role="presentation">
          <div className="panel admin-modal" role="dialog" aria-modal="true" aria-labelledby="signup-link-title">
            <div className="panel-heading">
              <div><div className="eyebrow">{t("hotelStaff.signupLinkEyebrow")}</div><h2 id="signup-link-title">{t("hotelStaff.signupLinkTitle")}</h2></div>
              <button type="button" className="icon-button" onClick={closeSignupLinkModal} aria-label={t("hotelStaff.closeSignupLinkAria")}><X size={17} /></button>
            </div>
            <div className="admin-form">
              <p className="modal-lede">{t("hotelStaff.signupLinkLede")}</p>

              {!generatedLink ? (
                <>
                  <label>{t("hotelStaff.linkExpiresIn")}
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={signupLinkHours}
                      onChange={event => setSignupLinkHours(Math.max(1, Math.min(720, Number(event.target.value) || 1)))}
                    />
                  </label>
                  <div className="modal-actions">
                    <button className="button button-quiet" type="button" onClick={closeSignupLinkModal} disabled={createSignupLink.isPending}>{t("hotelStaff.cancel")}</button>
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={createSignupLink.isPending}
                      onClick={() => createSignupLink.mutate({ hotel_id: hotelId, expiresInHours: signupLinkHours })}
                    >
                      {createSignupLink.isPending ? t("hotelStaff.generating") : t("hotelStaff.generateLink")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label>{t("hotelStaff.signupLinkLabel")}
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <input type="text" readOnly value={generatedLink} className="font-mono" style={{ flex: 1 }} onFocus={event => event.target.select()} />
                      <button type="button" className="button button-quiet" onClick={copyGeneratedLink} aria-label={t("hotelStaff.copySignupLinkAria")}>
                        {linkCopied ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  </label>
                  <p className="field-help">{signupLinkHours === 1 ? t("hotelStaff.signupLinkHelp", { hours: signupLinkHours }) : t("hotelStaff.signupLinkHelpPlural", { hours: signupLinkHours })}</p>
                  <div className="modal-actions"><button className="button button-primary" type="button" onClick={closeSignupLinkModal}>{t("hotelStaff.done")}</button></div>
                </>
              )}

              {signupLinksQuery.data && signupLinksQuery.data.length > 0 && (
                <div className="signup-links-history">
                  <p className="field-help" style={{ marginTop: "1rem" }}>{t("hotelStaff.previouslyGeneratedLinks")}</p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {signupLinksQuery.data.map(link => (
                      <li key={link.id} style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", padding: "0.35rem 0" }}>
                        <span className="font-mono" style={{ fontSize: "0.75rem" }}>{link.token.slice(0, 10)}…</span>
                        <span className={`badge badge-${link.status === "active" ? "success" : link.status === "used" ? "info" : "muted"}`}>{link.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



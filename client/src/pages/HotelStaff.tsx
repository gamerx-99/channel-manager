import { FormEvent, useMemo, useState } from "react";
import React from "react";
import { Link } from "wouter";
import { ArrowRightLeft, Check, Copy, Link2, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { ASSIGNABLE_STAFF_ROLES, ROLE_LABELS, isPlatformRole, type AssignableStaffRole, type HumanRole } from "@shared/authorization";

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
  const hotelAdminRestrictionText = "Only one Hotel Admin is allowed per hotel. Reassign or remove the current Hotel Admin before assigning this role.";

  async function copyGeneratedLink() {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setLinkCopied(true);
    } catch {
      setFormError("Could not copy the link automatically. Select and copy it manually.");
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
      setFormError("Enter a valid email address.");
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
      setFormError("Choose a hotel staff member to receive Hotel Admin access.");
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
          <div className="eyebrow">Property / Team access</div>
          <h1>Hotel staff<span className="title-mark">.</span></h1>
          <p className="lede">Invite staff and assign only the hotel-level role they need. Platform roles and service identities stay outside this workspace.</p>
        </div>
        <div className="page-intro-actions" style={{ display: "flex", gap: "0.5rem" }}>
          {isSuperAdmin && !hotelAdminAlreadyAssigned && (
            <button className="button button-quiet" type="button" onClick={() => { setFormError(null); setSignupLinkOpen(true); }}>
              <Link2 size={16} /> Generate signup link
            </button>
          )}
          <button className="button button-primary" type="button" onClick={() => { setFormError(null); setInviteOpen(true); }}>
            <UserPlus size={16} /> Invite staff
          </button>
        </div>
      </section>

      {formError && (
        <div className="form-error page-alert" role="alert">
          {formError}
          <button type="button" className="icon-button" onClick={() => setFormError(null)} aria-label="Dismiss error"><X size={15} /></button>
        </div>
      )}

      {staffQuery.isLoading && <section className="panel empty-state" role="status" aria-live="polite"><Users size={20} /><strong>Loading hotel staff…</strong><span>Checking the current RLS-scoped team list.</span></section>}
      {staffQuery.error && <section className="panel empty-state" role="alert"><ShieldCheck size={20} /><strong>Staff access unavailable</strong><span>{staffQuery.error.message}</span><Link href="/dashboard" className="button button-quiet">Return to overview</Link></section>}

      {!staffQuery.isLoading && !staffQuery.error && (
        <>
          <section className="summary-strip">
            <div><span className="strip-label">Hotel staff</span><strong>{staff.length}</strong></div>
            <div><span className="strip-label">Active accounts</span><strong>{activeStaffCount}</strong></div>
            <div className="strip-caption"><ShieldCheck size={16} /> Access is limited to this hotel and protected by the property staff permission.</div>
            {currentHotelAdmin && transferCandidates.length > 0 && (
              <button
                className="button button-quiet button-small"
                type="button"
                onClick={() => { setFormError(null); setTransferTargetId(transferCandidates[0]?.id ?? ""); setTransferOpen(true); }}
                disabled={isPending}
              >
                <ArrowRightLeft size={15} /> Transfer Hotel Admin
              </button>
            )}
          </section>

          <section className="panel list-panel">
            <div className="panel-heading">
              <div><div className="eyebrow">RLS membership ledger</div><h2>{staffQuery.data?.hotel.name ?? "Hotel"} team</h2></div>
              <span className="status-pill live"><i /> {staff.length} records</span>
            </div>
            <p className="mobile-scroll-hint staff-scroll-hint" role="note">เลื่อนตารางในแนวนอนเพื่อดูบทบาท กิจกรรม และการจัดการพนักงาน</p>
            <div className="table-wrap staff-table-wrap">
              <table className="data-table staff-table">
                <thead><tr><th>Email</th><th>Role</th><th>Account activity</th><th>Added</th><th /></tr></thead>
                <tbody>
                  {staff.length === 0 ? (
                    <tr><td colSpan={5}><div className="table-empty"><Users size={18} /><strong>No hotel staff yet.</strong><span>Invite the first property team member to begin.</span></div></td></tr>
                  ) : staff.map(member => (
                    <tr key={member.id}>
                      <td><strong>{member.email ?? "No email"}</strong><small>{member.user_id}</small></td>
                      <td>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="role-select-tooltip-trigger"
                                title={hotelAdminAlreadyAssigned && member.role !== "hotel_owner" ? hotelAdminRestrictionText : undefined}
                              >
                                <select
                                  aria-label={`Role for ${member.email ?? member.user_id}`}
                                  aria-describedby={hotelAdminAlreadyAssigned && member.role !== "hotel_owner" ? `hotel-admin-role-help-${member.id}` : undefined}
                                  value={isPlatformRole(member.role) ? "hotel_owner" : member.role}
                                  onChange={event => requestRoleChange(
                                    member.id,
                                    member.email,
                                    member.role,
                                    event.target.value as AssignableStaffRole,
                                  )}
                                  disabled={isPending || isPlatformRole(member.role)}
                                >
                                  {STAFF_ROLES.map(role => {
                                    const hotelAdminOptionDisabled = role === "hotel_owner" && hotelAdminAlreadyAssigned && member.role !== "hotel_owner";
                                    return <option value={role} key={role} disabled={hotelAdminOptionDisabled}>{roleLabel(role)}{hotelAdminOptionDisabled ? " — already assigned" : ""}</option>;
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
                      <td>{member.last_sign_in_at ? `Last sign-in ${formatDate(member.last_sign_in_at)}` : member.confirmed_at ? `Confirmed ${formatDate(member.confirmed_at)}` : "Invitation pending"}</td>
                      <td>{formatDate(member.created_at)}</td>
                      <td className="align-right"><button className="button button-quiet button-small" type="button" onClick={() => requestRemoveMember(member.id, member.email, member.role)} disabled={isPending || isPlatformRole(member.role)}>{removeStaff.isPending ? "Removing…" : "Remove"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel list-panel audit-log-panel" aria-labelledby="hotel-admin-audit-title">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">Security history</div>
                <h2 id="hotel-admin-audit-title">Hotel Admin audit log</h2>
              </div>
              <span className="status-pill"><i /> {auditQuery.data?.length ?? 0} events</span>
            </div>
            {auditQuery.isLoading ? (
              <div className="audit-empty" role="status">Loading permission history…</div>
            ) : auditQuery.error ? (
              <div className="audit-empty" role="alert">Audit history unavailable: {auditQuery.error.message}</div>
            ) : auditQuery.data?.length ? (
              <div className="audit-log-list">
                {auditQuery.data.map(event => (
                  <article className="audit-log-row" key={event.id}>
                    <div className="audit-log-marker" aria-hidden="true"><ShieldCheck size={15} /></div>
                    <div className="audit-log-main">
                      <div className="audit-log-title"><strong>Hotel Admin transferred</strong><time dateTime={event.created_at}>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</time></div>
                      <p><b>{auditUserLabel(event.actor_user_id)}</b> transferred access from <b>{auditUserLabel(event.previous_admin_user_id)}</b> to <b>{auditUserLabel(event.new_admin_user_id)}</b>.</p>
                      <small>Event ID: {event.id}</small>
                    </div>
                    <button className="button button-quiet button-small" type="button" onClick={() => setAuditDetailId(event.id)}>View details</button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="audit-empty"><ShieldCheck size={18} /><strong>No permission changes recorded.</strong><span>Future Hotel Admin transfers will appear here with actor and timestamp details.</span></div>
            )}
          </section>

          <p className="page-footnote"><span className="dot pine" /> Hotel Admin can manage property staff only. Super Admin and API / Service Role assignments require platform-level controls.</p>
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
                <div className="eyebrow">Access control / Confirm action</div>
                <h2 id="staff-confirmation-title">
                  {confirmation.kind === "remove" ? "Remove staff member?" : confirmation.kind === "transfer" ? "Transfer Hotel Admin?" : "Confirm role change"}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setConfirmation(null)}
                disabled={isPending}
                aria-label="Close confirmation"
              >
                <X size={17} />
              </button>
            </div>
            <div className="confirmation-body">
              <p className="modal-lede" id="staff-confirmation-description">
                {confirmation.kind === "remove"
                  ? `You are about to remove ${confirmation.email ?? "this staff member"} from ${staffQuery.data?.hotel.name ?? "this hotel"}. They will no longer have access to this property.`
                  : confirmation.kind === "transfer"
                    ? `You are about to transfer Hotel Admin access for ${staffQuery.data?.hotel.name ?? "this hotel"} from ${confirmation.currentEmail ?? "the current admin"} to ${confirmation.targetEmail ?? "the selected staff member"}.`
                    : `You are about to change ${confirmation.email ?? "this staff member"}'s access for ${staffQuery.data?.hotel.name ?? "this hotel"}. Review the new role before continuing.`}
              </p>
              {confirmation.kind === "role" && (
                <div className="role-change-summary" aria-label="Role change summary">
                  <div><span>Current role</span><strong>{roleLabel(confirmation.currentRole)}</strong></div>
                  <span className="role-change-arrow" aria-hidden="true">→</span>
                  <div><span>New role</span><strong>{roleLabel(confirmation.nextRole)}</strong></div>
                </div>
              )}
              {confirmation.kind === "transfer" && (
                <div className="role-change-summary" aria-label="Hotel Admin transfer summary">
                  <div><span>Current Hotel Admin</span><strong>{confirmation.currentEmail ?? "Unknown account"}</strong></div>
                  <span className="role-change-arrow" aria-hidden="true">→</span>
                  <div><span>New Hotel Admin</span><strong>{confirmation.targetEmail ?? "Selected staff member"}</strong></div>
                </div>
              )}
              {confirmation.kind === "role" && confirmation.nextRole === "hotel_owner" && (
                <p className="form-error" role="alert">
                  One hotel can have only one Hotel Admin. If this hotel already has a Hotel Admin, this promotion will be blocked; reassign the existing Hotel Admin first.
                </p>
              )}
              {confirmation.kind === "remove" && confirmation.currentRole === "hotel_owner" && (
                <p className="form-error" role="alert">
                  This is the Hotel Admin account. Removing it may leave the hotel without an administrator and is blocked by the server if it is the last Hotel Admin.
                </p>
              )}
              {confirmation.kind === "transfer" && (
                <p className="form-error" role="alert">
                  The current administrator will be retained as Front Desk, and the transfer is applied atomically so this hotel keeps exactly one Hotel Admin.
                </p>
              )}
              <div className="modal-actions">
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => setConfirmation(null)}
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  onClick={confirmStaffAction}
                  disabled={isPending}
                >
                  {isPending
                    ? confirmation.kind === "remove" ? "Removing…" : confirmation.kind === "transfer" ? "Transferring…" : "Saving…"
                    : confirmation.kind === "remove" ? "Remove staff member" : confirmation.kind === "transfer" ? "Transfer Hotel Admin" : "Confirm role change"}
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
                  <div><div className="eyebrow">Security history / Event detail</div><h2 id="audit-detail-title">Hotel Admin transfer details</h2></div>
                  <button type="button" className="icon-button" onClick={() => setAuditDetailId(null)} aria-label="Close audit detail"><X size={17} /></button>
                </div>
                <div className="confirmation-body" id="audit-detail-description">
                  <p className="modal-lede">Recorded by <b>{auditUserLabel(event.actor_user_id)}</b> on {new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short" }).format(new Date(event.created_at))}.</p>
                  <div className="audit-detail-grid">
                    <div><span>Previous Hotel Admin</span><strong>{auditUserLabel(event.previous_admin_user_id)}</strong></div>
                    <div><span>New Hotel Admin</span><strong>{auditUserLabel(event.new_admin_user_id)}</strong></div>
                    <div><span>Hotel</span><strong>{staffQuery.data?.hotel.name ?? event.hotel_id}</strong></div>
                    <div><span>Action</span><strong>{event.action}</strong></div>
                  </div>
                  <details className="audit-payload"><summary>View full event payload</summary><pre>{JSON.stringify(event.details, null, 2)}</pre></details>
                  <div className="modal-actions"><button className="button button-primary" type="button" onClick={() => setAuditDetailId(null)}>Close</button></div>
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
              <div><div className="eyebrow">Property team / Ownership</div><h2 id="transfer-staff-title">Transfer Hotel Admin</h2></div>
              <button type="button" className="icon-button" onClick={() => setTransferOpen(false)} disabled={isPending} aria-label="Close transfer form"><X size={17} /></button>
            </div>
            <form className="admin-form" onSubmit={submitTransfer}>
              <p className="modal-lede" id="transfer-staff-description">Choose an existing human staff member in this hotel. The current Hotel Admin will be changed to Front Desk after the transfer.</p>
              <label>New Hotel Admin
                <select aria-label="New Hotel Admin" value={transferTargetId} onChange={event => setTransferTargetId(event.target.value)} autoFocus required>
                  <option value="" disabled>Choose a staff member</option>
                  {transferCandidates.map(member => (
                    <option value={member.id} key={member.id}>{member.email ?? "Unnamed staff member"} — {roleLabel(member.role)}</option>
                  ))}
                </select>
              </label>
              <p className="field-help">The transfer is restricted to this property and preserves exactly one Hotel Admin.</p>
              <div className="modal-actions"><button className="button button-quiet" type="button" onClick={() => setTransferOpen(false)} disabled={isPending}>Cancel</button><button className="button button-primary" type="submit" disabled={isPending || !transferTargetId}>Review transfer</button></div>
            </form>
          </div>
        </div>
      )}

      {inviteOpen && (
        <div className="admin-modal-backdrop" role="presentation">
          <div className="panel admin-modal" role="dialog" aria-modal="true" aria-labelledby="invite-staff-title">
            <div className="panel-heading"><div><div className="eyebrow">Property team / Invite</div><h2 id="invite-staff-title">Invite hotel staff</h2></div><button type="button" className="icon-button" onClick={() => setInviteOpen(false)} aria-label="Close invite form"><X size={17} /></button></div>
            <form className="admin-form" onSubmit={submitInvite}>
              <p className="modal-lede">The user receives a secure Supabase invitation and is added only to this hotel.</p>
              <label>Email address<input type="email" autoFocus value={inviteForm.email} onChange={event => setInviteForm({ ...inviteForm, email: event.target.value })} placeholder="Enter staff email" required /></label>
              <label>Hotel role
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="role-select-tooltip-trigger" title={hotelAdminAlreadyAssigned ? hotelAdminRestrictionText : undefined}>
                        <select
                          aria-label="Hotel role"
                          aria-describedby={hotelAdminAlreadyAssigned ? "hotel-admin-role-help" : undefined}
                          value={inviteForm.role}
                          onChange={event => setInviteForm({ ...inviteForm, role: event.target.value as InviteForm["role"] })}
                        >
                          {STAFF_ROLES.map(role => {
                            const hotelAdminOptionDisabled = role === "hotel_owner" && hotelAdminAlreadyAssigned;
                            return <option value={role} key={role} disabled={hotelAdminOptionDisabled}>{roleLabel(role)}{hotelAdminOptionDisabled ? " — already assigned" : ""}</option>;
                          })}
                        </select>
                      </span>
                    </TooltipTrigger>
                    {hotelAdminAlreadyAssigned && (
                      <TooltipContent side="top">{hotelAdminRestrictionText}</TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                {hotelAdminAlreadyAssigned && <span className="field-help" id="hotel-admin-role-help">Hotel Admin is unavailable because this hotel already has one administrator.</span>}
              </label>
              <div className="modal-actions"><button className="button button-quiet" type="button" onClick={() => setInviteOpen(false)} disabled={isPending}>Cancel</button><button className="button button-primary" type="submit" disabled={isPending}>{inviteStaff.isPending ? "Sending invite…" : "Send invitation"}</button></div>
            </form>
          </div>
        </div>
      )}

      {signupLinkOpen && (
        <div className="admin-modal-backdrop" role="presentation">
          <div className="panel admin-modal" role="dialog" aria-modal="true" aria-labelledby="signup-link-title">
            <div className="panel-heading">
              <div><div className="eyebrow">Property team / Self-service</div><h2 id="signup-link-title">Generate signup link</h2></div>
              <button type="button" className="icon-button" onClick={closeSignupLinkModal} aria-label="Close signup link form"><X size={17} /></button>
            </div>
            <div className="admin-form">
              <p className="modal-lede">Anyone who opens this link before it expires can create their own login and becomes the Hotel Admin for this property. It can be used once.</p>

              {!generatedLink ? (
                <>
                  <label>Link expires in (hours)
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={signupLinkHours}
                      onChange={event => setSignupLinkHours(Math.max(1, Math.min(720, Number(event.target.value) || 1)))}
                    />
                  </label>
                  <div className="modal-actions">
                    <button className="button button-quiet" type="button" onClick={closeSignupLinkModal} disabled={createSignupLink.isPending}>Cancel</button>
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={createSignupLink.isPending}
                      onClick={() => createSignupLink.mutate({ hotel_id: hotelId, expiresInHours: signupLinkHours })}
                    >
                      {createSignupLink.isPending ? "Generating…" : "Generate link"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label>Signup link
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <input type="text" readOnly value={generatedLink} className="font-mono" style={{ flex: 1 }} onFocus={event => event.target.select()} />
                      <button type="button" className="button button-quiet" onClick={copyGeneratedLink} aria-label="Copy signup link">
                        {linkCopied ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  </label>
                  <p className="field-help">Send this link to the new hotel owner. It expires in {signupLinkHours} hour{signupLinkHours === 1 ? "" : "s"} and can only be used once.</p>
                  <div className="modal-actions"><button className="button button-primary" type="button" onClick={closeSignupLinkModal}>Done</button></div>
                </>
              )}

              {signupLinksQuery.data && signupLinksQuery.data.length > 0 && (
                <div className="signup-links-history">
                  <p className="field-help" style={{ marginTop: "1rem" }}>Previously generated links</p>
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

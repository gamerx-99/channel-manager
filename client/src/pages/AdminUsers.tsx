import { FormEvent, useMemo, useState } from 'react';
import { ShieldCheck, UserPlus, UserRound, Users, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { canLoadAdminHotels, formatAdminDate } from '@/lib/adminUsers';
import { HUMAN_ROLES, ROLE_LABELS, isPlatformRole, type HumanRole } from '@shared/authorization';
import { useTranslation } from '@/lib/i18n';

type AdminRole = HumanRole;
type InviteForm = { email: string; hotel_id: string; role: AdminRole };
type AssignForm = { user_id: string; hotel_id: string; role: AdminRole };

const emptyInviteForm: InviteForm = { email: '', hotel_id: '', role: 'hotel_owner' };
const emptyAssignForm: AssignForm = { user_id: '', hotel_id: '', role: 'hotel_owner' };

export default function AdminUsers() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const adminQuery = trpc.channelManager.adminUsers.useQuery();
  const hotelsQuery = trpc.channelManager.adminHotels.useQuery(undefined, {
    enabled: canLoadAdminHotels(Boolean(adminQuery.data), adminQuery.error),
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState(emptyInviteForm);
  const [assignForm, setAssignForm] = useState(emptyAssignForm);
  const [formError, setFormError] = useState<string | null>(null);

  function roleLabel(role: AdminRole | null) {
    return role ? ROLE_LABELS[role] : t('adminUsers.unassigned');
  }

  const inviteUser = trpc.channelManager.inviteAdminUser.useMutation({
    onSuccess: async () => {
      await adminQuery.refetch();
      setInviteOpen(false);
      setInviteForm(emptyInviteForm);
      setFormError(null);
    },
    onError: error => setFormError(error.message),
  });
  const assignUser = trpc.channelManager.assignAdminUser.useMutation({
    onSuccess: async () => {
      await adminQuery.refetch();
      setAssignForm(emptyAssignForm);
      setFormError(null);
    },
    onError: error => setFormError(error.message),
  });
  const removeMembership = trpc.channelManager.removeAdminMembership.useMutation({
    onSuccess: async () => {
      await Promise.all([
        adminQuery.refetch(),
        utils.channelManager.hotels.invalidate(),
        utils.channelManager.dashboard.invalidate(),
      ]);
      setFormError(null);
    },
    onError: error => setFormError(error.message),
  });

  const users = adminQuery.data?.users ?? [];
  const assignments = adminQuery.data?.assignments ?? [];
  const hotels = hotelsQuery.data ?? [];
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);
  const roleByUser = useMemo(() => {
    const map = new Map<string, AdminRole>();
    assignments.forEach(assignment => {
      if (isPlatformRole(assignment.role) || !map.has(assignment.user_id)) {
        map.set(assignment.user_id, assignment.role);
      }
    });
    return map;
  }, [assignments]);
  const isPending = inviteUser.isPending || assignUser.isPending || removeMembership.isPending;

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const email = inviteForm.email.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setFormError(t('adminUsers.errorValidEmail'));
      return;
    }
    if (!inviteForm.hotel_id) {
      setFormError(t('adminUsers.errorSelectHotel'));
      return;
    }
    inviteUser.mutate({ email, hotel_id: inviteForm.hotel_id, role: inviteForm.role });
  }

  function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!assignForm.user_id || !assignForm.hotel_id) {
      setFormError(t('adminUsers.errorSelectUserAndHotel'));
      return;
    }
    assignUser.mutate(assignForm);
  }

  function removeAssignment(membershipId: string) {
    if (isPending) return;
    if (window.confirm(t('adminUsers.confirmRemoveMembership'))) {
      setFormError(null);
      removeMembership.mutate({ membership_id: membershipId });
    }
  }

  return (
    <div className="page-content">
      <section className="page-intro intro-split">
        <div>
          <div className="eyebrow">{t('adminUsers.eyebrow')}</div>
          <h1>{t('adminUsers.title')}<span className="title-mark">.</span></h1>
          <p className="lede">{t('adminUsers.lede')}</p>
        </div>
        <button className="button button-primary" type="button" onClick={() => { setFormError(null); setInviteOpen(true); }}>
          <UserPlus size={16} /> {t('adminUsers.inviteUser')}
        </button>
      </section>

      {formError && <div className="form-error page-alert" role="alert">{formError}<button type="button" className="icon-button" onClick={() => setFormError(null)} aria-label={t('adminUsers.dismissErrorAria')}><X size={15} /></button></div>}
      {adminQuery.error && <section className="panel empty-state"><ShieldCheck size={20} /><strong>{t('adminUsers.adminAccessRequired')}</strong><span>{adminQuery.error.message}</span><small>{t('adminUsers.adminAccessHint')}</small></section>}
      {!adminQuery.error && hotelsQuery.error && <section className="panel empty-state"><ShieldCheck size={20} /><strong>{t('adminUsers.hotelOptionsUnavailable')}</strong><span>{hotelsQuery.error.message}</span></section>}
      {!adminQuery.error && (
        <>
          <section className="summary-strip">
            <div><span className="strip-label">{t('adminUsers.summaryAuthUsers')}</span><strong>{users.length}</strong></div>
            <div><span className="strip-label">{t('adminUsers.summaryHotelMemberships')}</span><strong>{assignments.length}</strong></div>
            <div><span className="strip-label">{t('adminUsers.summaryHotelsAvailable')}</span><strong>{hotels.length}</strong></div>
            <div className="strip-caption"><ShieldCheck size={16} /> {t('adminUsers.summaryCaption')}</div>
          </section>

          <div className="content-grid lower-grid">
            <section className="panel">
              <div className="panel-heading"><div><div className="eyebrow">{t('adminUsers.identityDirectoryEyebrow')}</div><h2>{t('adminUsers.existingUsersTitle')}</h2></div><span className="status-pill live"><i /> {t('adminUsers.recordsPill', { count: users.length })}</span></div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>{t('adminUsers.colEmail')}</th><th>{t('adminUsers.colRole')}</th><th>{t('adminUsers.colMemberships')}</th><th>{t('adminUsers.colCreated')}</th></tr></thead>
                  <tbody>
                    {adminQuery.isLoading ? <tr><td colSpan={4}>{t('adminUsers.loadingAuthUsers')}</td></tr> : users.length === 0 ? <tr><td colSpan={4}>{t('adminUsers.noAuthUsersFound')}</td></tr> : users.map(user => {
                      const membershipCount = assignments.filter(assignment => assignment.user_id === user.id).length;
                      return <tr key={user.id}><td><strong>{user.email ?? t('adminUsers.noEmail')}</strong><small>{user.id}</small></td><td><span className={`status-pill ${roleByUser.get(user.id) ? 'live' : 'setup'}`}><i />{roleLabel(roleByUser.get(user.id) ?? null)}</span></td><td>{membershipCount}</td><td>{formatAdminDate(user.created_at)}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading"><div><div className="eyebrow">{t('adminUsers.accessGrantEyebrow')}</div><h2>{t('adminUsers.assignExistingUserTitle')}</h2></div><Users size={19} className="muted-icon" /></div>
              <form className="admin-form" onSubmit={submitAssignment}>
                <label>{t('adminUsers.userLabel')}<select value={assignForm.user_id} onChange={event => setAssignForm({ ...assignForm, user_id: event.target.value })} required><option value="">{t('adminUsers.selectUserPlaceholder')}</option>{users.map(user => <option value={user.id} key={user.id}>{user.email ?? user.id}</option>)}</select></label>
                <label>{t('adminUsers.hotelLabel')}<select value={assignForm.hotel_id} onChange={event => setAssignForm({ ...assignForm, hotel_id: event.target.value })} required><option value="">{t('adminUsers.selectHotelPlaceholder')}</option>{hotels.map(hotel => <option value={hotel.id} key={hotel.id}>{hotel.name}</option>)}</select></label>
                <fieldset><legend>{t('adminUsers.roleLegend')}</legend>{HUMAN_ROLES.map(role => <label className="radio-option" key={`assign-${role}`}><input type="radio" name="assign-role" value={role} checked={assignForm.role === role} onChange={() => setAssignForm({ ...assignForm, role })} /> {ROLE_LABELS[role]}</label>)}</fieldset>
                <button className="button button-primary form-submit" type="submit" disabled={isPending}>{assignUser.isPending ? t('adminUsers.assigning') : t('adminUsers.assignMembership')}</button>
              </form>
            </section>
          </div>

          <section className="panel list-panel admin-memberships">
            <div className="panel-heading"><div><div className="eyebrow">{t('adminUsers.membershipLedgerEyebrow')}</div><h2>{t('adminUsers.userHotelAssignmentsTitle')}</h2></div><span className="intro-note"><ShieldCheck size={15} /> {t('adminUsers.databasePolicyAudited')}</span></div>
            <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('adminUsers.colEmail')}</th><th>{t('adminUsers.hotelLabel')}</th><th>{t('adminUsers.colRole')}</th><th>{t('adminUsers.colAdded')}</th><th /></tr></thead><tbody>{assignments.length === 0 ? <tr><td colSpan={5}>{t('adminUsers.noMembershipsFound')}</td></tr> : assignments.map(assignment => <tr key={assignment.id}><td><strong>{userById.get(assignment.user_id)?.email ?? assignment.user_id}</strong><small>{assignment.user_id}</small></td><td>{assignment.hotels?.name ?? assignment.hotel_id}</td><td><span className="status-pill live"><i />{roleLabel(assignment.role)}</span></td><td>{formatAdminDate(assignment.created_at)}</td><td className="align-right"><button className="button button-quiet button-small" type="button" onClick={() => removeAssignment(assignment.id)} disabled={isPending}>{removeMembership.isPending ? t('adminUsers.removing') : t('adminUsers.remove')}</button></td></tr>)}</tbody></table></div>
          </section>

          <p className="page-footnote"><span className="dot pine" /> {t('adminUsers.pageFootnote')}</p>
        </>
      )}

      {inviteOpen && <div className="admin-modal-backdrop" role="presentation"><div className="panel admin-modal" role="dialog" aria-modal="true" aria-labelledby="invite-user-title"><div className="panel-heading"><div><div className="eyebrow">{t('adminUsers.inviteModalEyebrow')}</div><h2 id="invite-user-title">{t('adminUsers.inviteUserTitle')}</h2></div><button type="button" className="icon-button" onClick={() => setInviteOpen(false)} aria-label={t('adminUsers.closeInviteAria')}><X size={17} /></button></div><form className="admin-form" onSubmit={submitInvite}><p className="modal-lede">{t('adminUsers.inviteModalLede')}</p><label>{t('adminUsers.emailAddressLabel')}<input type="email" autoFocus value={inviteForm.email} onChange={event => setInviteForm({ ...inviteForm, email: event.target.value })} placeholder={t('adminUsers.emailAddressPlaceholder')} required /></label><label>{t('adminUsers.hotelLabel')}<select value={inviteForm.hotel_id} onChange={event => setInviteForm({ ...inviteForm, hotel_id: event.target.value })} required><option value="">{t('adminUsers.selectHotelPlaceholder')}</option>{hotels.map(hotel => <option value={hotel.id} key={hotel.id}>{hotel.name}</option>)}</select></label><fieldset><legend>{t('adminUsers.roleLegend')}</legend>{HUMAN_ROLES.map(role => <label className="radio-option" key={`invite-${role}`}><input type="radio" name="invite-role" value={role} checked={inviteForm.role === role} onChange={() => setInviteForm({ ...inviteForm, role })} /> {ROLE_LABELS[role]}</label>)}</fieldset><div className="modal-actions"><button className="button button-quiet" type="button" onClick={() => setInviteOpen(false)} disabled={isPending}>{t('adminUsers.cancel')}</button><button className="button button-primary" type="submit" disabled={isPending}>{inviteUser.isPending ? t('adminUsers.sendingInvite') : t('adminUsers.sendInvitation')}</button></div></form></div></div>}
    </div>
  );
}

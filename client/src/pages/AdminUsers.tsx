import { ShieldCheck, Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { canLoadAdminHotels, formatAdminDate } from '@/lib/adminUsers';
import { HUMAN_ROLES, ROLE_LABELS, isPlatformRole, type HumanRole } from '@shared/authorization';
import { useTranslation } from '@/lib/i18n';

type AdminRole = HumanRole;

export default function AdminUsers() {
  const { t } = useTranslation();
  const adminQuery = trpc.channelManager.adminUsers.useQuery();
  const hotelsQuery = trpc.channelManager.adminHotels.useQuery(undefined, {
    enabled: canLoadAdminHotels(Boolean(adminQuery.data), adminQuery.error),
  });

  const adminData = adminQuery.data as any;
  const users = adminData?.users ?? [];
  const assignments = adminData?.assignments ?? [];
  const hotels = hotelsQuery.data ?? [];

  const roleByUser = new Map<string, AdminRole>();
  assignments.forEach((assignment: any) => {
    if (isPlatformRole(assignment.role) || !roleByUser.has(assignment.user_id)) {
      roleByUser.set(assignment.user_id, assignment.role as AdminRole);
    }
  });

  function roleLabel(role: AdminRole | null) {
    return role ? ROLE_LABELS[role] : t('adminUsers.unassigned');
  }

  return (
    <div className="page-content">
      <section className="page-intro intro-split">
        <div>
          <div className="eyebrow">{t('adminUsers.eyebrow')}</div>
          <h1>{t('adminUsers.title')}<span className="title-mark">.</span></h1>
          <p className="lede">{t('adminUsers.lede')}</p>
        </div>
      </section>

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
                    {adminQuery.isLoading ? <tr><td colSpan={4}>{t('adminUsers.loadingAuthUsers')}</td></tr> : users.length === 0 ? <tr><td colSpan={4}>{t('adminUsers.noAuthUsersFound')}</td></tr> : users.map((user: any) => {
                      const membershipCount = assignments.filter((assignment: any) => assignment.user_id === user.id).length;
                      return <tr key={user.id}><td><strong>{user.email ?? t('adminUsers.noEmail')}</strong><small>{user.id}</small></td><td><span className={`status-pill ${roleByUser.get(user.id) ? 'live' : 'setup'}`}><i />{roleLabel(roleByUser.get(user.id) ?? null)}</span></td><td>{membershipCount}</td><td>{formatAdminDate(user.created_at)}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading"><div><div className="eyebrow">{t('adminUsers.accessGrantEyebrow')}</div><h2>{t('adminUsers.assignExistingUserTitle')}</h2></div><Users size={19} className="muted-icon" /></div>
              <p className="field-help">{t('adminUsers.lede')}</p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

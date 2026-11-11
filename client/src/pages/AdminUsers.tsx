import { ShieldCheck, Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { canLoadAdminHotels, formatAdminDate } from '@/lib/adminUsers';
import { type AppRole, type HumanRole } from '@shared/authorization';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import { SupportAccountsPanel } from '@/components/SupportAccountsPanel';

type AdminRole = HumanRole;

const ROLE_LABEL_KEYS: Record<AppRole, TranslationKey> = {
  super_admin: 'adminUsers.roleSuperAdmin', admin: 'adminUsers.roleAdmin', support: 'adminUsers.roleSupport',
  hotel_owner: 'adminUsers.roleHotelOwner', revenue_manager: 'adminUsers.roleRevenueManager', front_desk: 'adminUsers.roleFrontDesk',
  housekeeping: 'adminUsers.roleHousekeeping', api_service: 'adminUsers.roleApiService',
};

export default function AdminUsers() {
  const { t, language } = useTranslation();
  const adminQuery = trpc.channelManager.adminUsers.useQuery();
  const hotelsQuery = trpc.channelManager.adminHotels.useQuery(undefined, {
    enabled: canLoadAdminHotels(Boolean(adminQuery.data), adminQuery.error),
  });

  const adminData = adminQuery.data as any;
  const users = adminData?.users ?? [];
  const hotels = hotelsQuery.data ?? [];

  function roleLabel(role: AdminRole | null) {
    return role ? t(ROLE_LABEL_KEYS[role]) : t('adminUsers.unassigned');
  }

  return (
    <div className="page-content admin-users-page">
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
          <div className="content-grid lower-grid">
            <section className="panel">
              <div className="panel-heading"><div><div className="eyebrow">{t('adminUsers.identityDirectoryEyebrow')}</div><h2>{t('adminUsers.existingUsersTitle')}</h2></div><span className="status-pill live"><i /> {t('adminUsers.recordsPill', { count: users.length })}</span></div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>{t('adminUsers.colEmail')}</th><th>{t('adminUsers.colRole')}</th><th>{t('adminUsers.colMemberships')}</th><th>{t('adminUsers.colCreated')}</th></tr></thead>
                  <tbody>
                    {adminQuery.isLoading ? <tr><td colSpan={4}>{t('adminUsers.loadingAuthUsers')}</td></tr> : users.length === 0 ? <tr><td colSpan={4}>{t('adminUsers.noAuthUsersFound')}</td></tr> : users.map((user: any) => {
                      const membershipCount = (user.roles ?? []).filter((role: any) => role.hotel_id).length;
                      const accountRoles = Array.from(new Set<AdminRole>(((user.roles ?? []) as Array<{ role: AdminRole }>).map(entry => entry.role)));
                      const displayRoles = accountRoles;
                      return <tr key={user.id}><td><strong>{user.email ?? t('adminUsers.noEmail')}</strong><small>{user.name ?? user.id}</small></td><td><span className={`status-pill ${displayRoles.length ? 'live' : 'setup'}`}><i />{displayRoles.length ? displayRoles.map(roleLabel).join(', ') : roleLabel(null)}</span></td><td>{membershipCount}</td><td>{formatAdminDate(user.created_at, language)}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <SupportAccountsPanel />

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

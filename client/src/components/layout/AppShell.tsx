// Quiet Ledger reminder: global shell uses rail-and-canvas navigation, charcoal ink, warm paper, and pine signal color.
import React, { useState } from "react";
import { hasAnyPermission, isPlatformRole, type AppRole, type Permission } from "@shared/authorization";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ children, userName, userEmail, onLogout, roles }: { children: React.ReactNode; userName: string; userEmail: string | null; onLogout: () => void; roles: readonly AppRole[] }) {
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const can = (permission: Permission) => hasAnyPermission(roles, permission);
  const isSuperAdmin = roles.includes("super_admin");
  const isPlatformAdmin = roles.some(role => isPlatformRole(role));
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "U";

  return (
    <div className="app-shell">
      <Sidebar
        open={open}
        onClose={() => setOpen(false)}
        can={can}
        isSuperAdmin={isSuperAdmin}
        isPlatformAdmin={isPlatformAdmin}
        userName={userName}
        userEmail={userEmail}
        initials={initials}
        onLogout={onLogout}
        workspaceMenuOpen={workspaceMenuOpen}
        onToggleWorkspaceMenu={() => { setWorkspaceMenuOpen(prev => !prev); setAddMenuOpen(false); setUserMenuOpen(false); }}
        onCloseWorkspaceMenu={() => setWorkspaceMenuOpen(false)}
      />

      {open && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}

      <main className="main-canvas">
        <Topbar
          onOpenMenu={() => setOpen(true)}
          can={can}
          isSuperAdmin={isSuperAdmin}
          isPlatformAdmin={isPlatformAdmin}
          userName={userName}
          userEmail={userEmail}
          initials={initials}
          onLogout={onLogout}
          roles={roles}
          addMenuOpen={addMenuOpen}
          onToggleAddMenu={() => { setAddMenuOpen(prev => !prev); setUserMenuOpen(false); setWorkspaceMenuOpen(false); }}
          onCloseAddMenu={() => setAddMenuOpen(false)}
          userMenuOpen={userMenuOpen}
          onToggleUserMenu={() => { setUserMenuOpen(prev => !prev); setAddMenuOpen(false); setWorkspaceMenuOpen(false); }}
          onCloseUserMenu={() => setUserMenuOpen(false)}
        />
        <div className="page-wrap">{children}</div>
      </main>
    </div>
  );
}

// Quiet Ledger reminder: global shell uses rail-and-canvas navigation, charcoal ink, warm paper, and pine signal color.
import { Route, Switch, Link, useLocation } from "wouter";
import React, { useState, useEffect } from "react";
import {
  BarChart3,
  Bell,
  BedDouble,
  CalendarDays,
  ChevronDown,
  FileSpreadsheet,
  Globe,
  Hotel,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import Dashboard from "./pages/Home";
import ChannelPerformance from "./pages/ChannelPerformance";
import Financials from "./pages/Financials";
import AdvancedPricing from "./pages/AdvancedPricing";
import Housekeeping from "./pages/Housekeeping";
import Communications from "./pages/Communications";
import Login from "./pages/Login";
import MfaEnroll from "./pages/MfaEnroll";
import HotelOwnerSignup from "./pages/HotelOwnerSignup";
import Hotels from "./pages/Hotels";
import HotelDetail from "./pages/HotelDetail";
import Bookings from "./pages/Bookings";
import Calendar from "./pages/Calendar";
import PublicHotel from "./pages/PublicHotel";
import AdminUsers from "./pages/AdminUsers";
import SecuritySettings from "./pages/SecuritySettings";
import HotelStaff from "./pages/HotelStaff";
import OtaSync from "./pages/OtaSync";
import WebsiteBuilder from "./pages/WebsiteBuilder";
import NotFound from "./pages/NotFound";
import { trpc } from "./lib/trpc";
import { supabase } from "@/lib/supabase";
import { shouldRedirectToMfaEnroll, MFA_ENROLL_PATH } from "@/lib/mfa";
import { WorkspaceMenu } from "./components/WorkspaceMenu";
import ProfileMenu from "./components/ProfileMenu";
import NotificationBell from "./components/NotificationBell";
import LanguageSwitcher from "./components/LanguageSwitcher";
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { HotelProvider, useHotel } from "./contexts/HotelContext";
import { getRouteScopeDecision } from "./lib/routeScope";
import { hasAnyPermission, isPlatformRole, ROLE_LABELS, type AppRole, type Permission } from "@shared/authorization";

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
    </span>
  );
}

function AppShell({ children, userName, userEmail, onLogout, roles }: { children: React.ReactNode; userName: string; userEmail: string | null; onLogout: () => void; roles: readonly AppRole[] }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const { hotels: visibleHotels, selectedHotelId, selectedHotel, setSelectedHotelId } = useHotel();
  const can = (permission: Permission) => hasAnyPermission(roles, permission);
  const selectedHotelName = selectedHotel?.name;
  const hotelNavItems = selectedHotelId
    ? [
      ...(can("property.manage_room_structure") ? [{ href: `/hotels/${selectedHotelId}`, label: "Room operations", icon: BedDouble }] : []),
      ...(can("operations.view_bookings") ? [{ href: `/hotels/${selectedHotelId}/bookings`, label: "Bookings", icon: Users }] : []),
      ...(can("property.view") ? [{ href: `/hotels/${selectedHotelId}/calendar`, label: "Availability", icon: CalendarDays }] : []),
      ...(can("ota.view_status") ? [{ href: `/hotels/${selectedHotelId}/ota`, label: "OTA Sync", icon: Globe }] : []),
      ...(can("property.manage_staff") ? [{ href: `/hotels/${selectedHotelId}/staff`, label: "Hotel Staff", icon: ShieldCheck }] : []),
    ]
    : [];
  const isSuperAdmin = roles.includes("super_admin");
  const isPlatformAdmin = roles.some(role => isPlatformRole(role));
  const navItems = [
    { href: "/dashboard", label: isPlatformAdmin ? "Overview" : "Overview", icon: LayoutDashboard },
    ...(can("property.view_reports") ? [{ href: "/dashboard/channels", label: "Channel analytics", icon: BarChart3 }] : []),
    ...(can("platform.view_all_hotels") ? [{ href: "/hotels", label: "Hotels Management", icon: Hotel }] : []),
    ...(can("platform.manage_users") ? [{ href: "/settings/admin-users", label: "Admin Users", icon: ShieldCheck }] : []),
    ...hotelNavItems,
  ];
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "U";
  const activePath = selectedHotelId && location.startsWith(`/hotels/${selectedHotelId}/bookings`)
    ? `/hotels/${selectedHotelId}/bookings`
    : selectedHotelId && location.startsWith(`/hotels/${selectedHotelId}/calendar`)
      ? `/hotels/${selectedHotelId}/calendar`
      : selectedHotelId && location.startsWith(`/hotels/${selectedHotelId}/ota`)
        ? `/hotels/${selectedHotelId}/ota`
        : selectedHotelId && location.startsWith(`/hotels/${selectedHotelId}/staff`)
          ? `/hotels/${selectedHotelId}/staff`
          : selectedHotelId && location.startsWith(`/hotels/${selectedHotelId}`)
            ? `/hotels/${selectedHotelId}`
            : location;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="sidebar-head">
          <Link href="/dashboard" className="brand-lockup" onClick={() => setOpen(false)}>
            <BrandMark />
            <span>
              <strong>channel</strong>
              <em>manager</em>
            </span>
          </Link>
          <button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={17} />
          </button>
        </div>

        <WorkspaceMenu
          hotels={visibleHotels}
          open={workspaceMenuOpen}
          onToggle={() => { setWorkspaceMenuOpen(prev => !prev); setAddMenuOpen(false); setUserMenuOpen(false); }}
          onClose={() => setWorkspaceMenuOpen(false)}
          isPlatformAdmin={isPlatformAdmin}
          activeHotelName={selectedHotelName}
          onSelectHotelId={setSelectedHotelId}
        />

        <nav className="nav-list" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = Boolean(item.href && activePath === item.href);
            if (!item.href) {
              return (
                <span key={item.label} className="nav-link" aria-disabled="true" title="Select a hotel from Hotels page first" style={{ opacity: 0.48, cursor: "not-allowed" }}>
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </span>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${isActive ? "active" : ""}`}
                onClick={() => setOpen(false)}
              >
                <Icon size={17} strokeWidth={isActive ? 2.3 : 1.8} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <p className="nav-label nav-label-spaced">Operations & Modules</p>
          {can("property.view_financials") && (
            <Link
              href="/dashboard/financials"
              className={`nav-link ${location === "/dashboard/financials" ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <BarChart3 size={17} strokeWidth={location === "/dashboard/financials" ? 2.3 : 1.8} />
              <span>Financials</span>
            </Link>
          )}
          {isSuperAdmin && <button type="button" className="nav-link w-full text-left bg-transparent border-0 cursor-pointer" onClick={() => toast.info("Payments & Gateway module is coming soon in future releases.")}>
            <FileSpreadsheet size={17} strokeWidth={1.8} />
            <span>Payments</span>
          </button>}
          {can("operations.view_bookings") && (
            <Link
              href="/communications"
              className={`nav-link ${location === "/communications" || location.startsWith("/communications") ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <Bell size={17} strokeWidth={location.startsWith("/communications") ? 2.3 : 1.8} />
              <span>Communications</span>
            </Link>
          )}
          {can("housekeeping.view_room_status") && (
            <Link
              href="/housekeeping"
              className={`nav-link ${location === "/housekeeping" || location.startsWith("/housekeeping/") ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <Users size={17} strokeWidth={location === "/housekeeping" ? 2.3 : 1.8} />
              <span>Housekeeping</span>
            </Link>
          )}
          <Link
            href="/website-builder"
            className={`nav-link ${location === "/website-builder" ? "active" : ""}`}
            onClick={() => setOpen(false)}
          >
            <Globe size={17} strokeWidth={location === "/website-builder" ? 2.3 : 1.8} />
            <span>Website Builder</span>
          </Link>
          <button
            type="button"
            className="nav-link w-full text-left bg-transparent border-0 cursor-pointer"
            onClick={() => {
              const hotel = visibleHotels?.find(h => h.id === selectedHotelId) || visibleHotels?.[0];
              if (hotel?.slug) {
                window.open(`/${hotel.slug}#book`, '_blank');
              } else {
                toast.info("Select or add a hotel first to open its live booking engine.");
              }
            }}
          >
            <CalendarDays size={17} strokeWidth={1.8} />
            <span>Booking Engines</span>
          </button>
          {can("revenue.manage_pricing_rules") && (
            <Link
              href="/dashboard/pricing"
              className={`nav-link ${location === "/dashboard/pricing" ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <BarChart3 size={17} strokeWidth={location === "/dashboard/pricing" ? 2.3 : 1.8} />
              <span>Advanced Pricing</span>
            </Link>
          )}
          <p className="nav-label nav-label-spaced">System</p>
          {can("operations.export_tm30") && <a className="nav-link" href="#" onClick={(event) => { event.preventDefault(); toast.info("TM.30 and report exports are available directly inside each hotel's Bookings workspace."); }}>
            <FileSpreadsheet size={17} strokeWidth={1.8} />
            <span>Exports</span>
          </a>}
          {can("platform.manage_users") && (
            <Link
              href="/settings/admin-users"
              className={`nav-link ${location === "/settings/admin-users" ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <Settings2 size={17} strokeWidth={1.8} />
              <span>Settings</span>
            </Link>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="support-note">
            <ShieldCheck size={16} />
            <div>
              <strong>Support mode</strong>
              <span>Read, guide, resolve</span>
            </div>
          </div>
          <div className="user-chip">
            <div className="user-avatar">{initials}</div>
            <div>
              <strong>{userName}</strong>
              <span>{userEmail ?? "Supabase user"}</span>
            </div>
            <button
              className="icon-button"
              onClick={onLogout}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {open && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}

      <main className="main-canvas">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={19} />
          </button>
          <Link href="/dashboard" className="topbar-brand">
            <BrandMark />
            <span>channel <em>manager</em></span>
          </Link>
          <div className="topbar-rule" />
          <div className="breadcrumbs">
            <span>Operating ledger</span>
            <span className="crumb-slash">/</span>
            <span className="current-crumb">{location === "/dashboard" ? "Overview" : location.startsWith("/dashboard/channels") ? "Channel analytics" : location.startsWith("/dashboard/pricing") ? "Advanced Pricing" : location.startsWith("/dashboard/financials") ? "Financials" : location.startsWith("/housekeeping") ? "Housekeeping" : location.startsWith("/communications") ? "Communications" : location.includes("admin-users") ? "Admin users" : location.includes("staff") ? "Hotel staff" : location.includes("bookings") ? "Bookings" : location.includes("calendar") ? "Availability" : location.includes("ota") ? "OTA Sync" : "Hotels"}</span>
          </div>
          <div className="topbar-actions">
            <label className="topbar-search">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Search system</span>
              <input placeholder="Search system..." aria-label="Search system" />
            </label>
            {isSuperAdmin && (
              <div className="dropdown-anchor">
                <button
                  className="button button-primary topbar-add"
                  onClick={() => { setAddMenuOpen(prev => !prev); setUserMenuOpen(false); setWorkspaceMenuOpen(false); }}
                  aria-expanded={addMenuOpen}
                >
                  <Plus size={15} /> <span>Add new</span> <ChevronDown size={14} />
                </button>
                {addMenuOpen && (
                  <div className="menu-surface menu-surface--compact menu-surface--topbar" role="menu" aria-label="Add new menu">
                    <Link href="/hotels" className="menu-surface-item" onClick={() => setAddMenuOpen(false)}>
                      Add new hotel / property
                    </Link>
                    <Link href="/settings/admin-users" className="menu-surface-item" onClick={() => setAddMenuOpen(false)}>
                      Invite team member
                    </Link>
                  </div>
                )}
              </div>
            )}
            {isSuperAdmin && <NotificationBell hotelId={selectedHotelId} />}
            <LanguageSwitcher />
            <span className="sync-status"><i /> Synced 2 min ago</span>
            <div className="topbar-divider" />
            <div className="dropdown-anchor">
              <button
                className="user-mini"
                onClick={() => { setUserMenuOpen(prev => !prev); setAddMenuOpen(false); setWorkspaceMenuOpen(false); }}
                aria-expanded={userMenuOpen}
                aria-label="Account menu"
              >
                <span className="user-avatar small">{initials}</span>
                <ChevronDown size={14} />
              </button>
              {userMenuOpen && (
                <ProfileMenu
                  isPlatformAdmin={isPlatformAdmin}
                  canManageUsers={can("platform.manage_users")}
                  roleLabel={roles[0] ? ROLE_LABELS[roles[0]] : "Authorized user"}
                  userEmail={userEmail}
                  userName={userName}
                  propertyName={selectedHotelName}
                  initials={initials}
                  onClose={() => setUserMenuOpen(false)}
                  onLogout={onLogout}
                />
              )}
            </div>
          </div>
        </header>
        <div className="page-wrap">{children}</div>
      </main>
    </div>
  );
}

export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [location, navigate] = useLocation();
  const { data: authMe, isLoading: roleLoading, isError: roleError } = trpc.auth.me.useQuery();
  const authRoles = (authMe?.roles?.length ? authMe.roles : authMe?.role ? [authMe.role] : []) as AppRole[];
  const {
    data: visibleHotels,
    isLoading: hotelsLoading,
    isError: hotelsError,
  } = trpc.channelManager.hotels.useQuery(undefined, { enabled: Boolean(isAuthenticated && user) });

  // T09-04's blocking MFA gate previously only ran once, inline in Login.tsx's
  // submit handler — an already-open tab, a refreshed page, or Supabase silently
  // restoring a persisted session never re-ran it, so a platform admin without a
  // verified factor was never redirected or signed out. Re-check on every mount
  // of a protected route instead, so the gate actually holds for the life of the
  // session, not just the moment of sign-in.
  const authRolesKey = authRoles.join(",");
  const [mfaChecked, setMfaChecked] = useState(false);
  const [needsMfaEnroll, setNeedsMfaEnroll] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user || roleLoading) return;
    let cancelled = false;
    setMfaChecked(false);
    (async () => {
      try {
        const { data: factorData } = await supabase.auth.mfa.listFactors();
        if (cancelled) return;
        setNeedsMfaEnroll(shouldRedirectToMfaEnroll(authRolesKey ? authRolesKey.split(",") : [], factorData));
      } catch {
        // Fail open, matching Login.tsx's existing behavior — a transient MFA
        // check failure shouldn't lock a user out of their own dashboard.
        if (!cancelled) setNeedsMfaEnroll(false);
      } finally {
        if (!cancelled) setMfaChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, user, roleLoading, authRolesKey]);

  if (loading || roleLoading || hotelsLoading || !mfaChecked) return <main className="auth-loading">Checking your secure session…</main>;
  if (!isAuthenticated || !user) return null;
  if (roleError || hotelsError) {
    return <main className="auth-loading">Unable to verify your property access. Please try again.</main>;
  }
  if (needsMfaEnroll) {
    navigate(MFA_ENROLL_PATH);
    return null;
  }

  const decision = getRouteScopeDecision({
    role: authMe?.role,
    roles: authRoles,
    pathname: location,
    visibleHotelIds: (visibleHotels ?? []).map(hotel => hotel.id),
  });

  if (!decision.allowed) {
    const message = decision.reason === "hotel_not_visible"
      ? "This property is outside your assigned hotel workspace."
      : decision.reason === "permission_required"
        ? "Your current role does not have permission to open this workspace."
        : "This area is available only to platform administrators.";
    return (
      <main className="auth-loading">
        <h1>Access restricted</h1>
        <p>{message}</p>
        <Link href="/dashboard" className="button primary">Return to dashboard</Link>
      </main>
    );
  }

  return (
    <HotelProvider hotels={visibleHotels} isLoading={hotelsLoading} isError={hotelsError}>
      <AppShell userName={user.name ?? user.email ?? "Supabase user"} userEmail={user.email} roles={authRoles} onLogout={() => void logout()}>
        {children}
      </AppShell>
    </HotelProvider>
  );
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/mfa/enroll" component={MfaEnroll} />
      <Route path="/signup/:token">
        {(params) => <HotelOwnerSignup token={params.token} />}
      </Route>
      <Route path="/dashboard/channels">
        <PrivateRoute><ChannelPerformance /></PrivateRoute>
      </Route>
      <Route path="/dashboard/financials">
        <PrivateRoute><Financials /></PrivateRoute>
      </Route>
      <Route path="/dashboard/pricing">
        <PrivateRoute><AdvancedPricing /></PrivateRoute>
      </Route>
      <Route path="/housekeeping">
        <PrivateRoute><Housekeeping /></PrivateRoute>
      </Route>
      <Route path="/communications">
        <PrivateRoute><Communications /></PrivateRoute>
      </Route>
      <Route path="/dashboard">
        <PrivateRoute><Dashboard /></PrivateRoute>
      </Route>
      <Route path="/hotels">
        <PrivateRoute><Hotels /></PrivateRoute>
      </Route>
      <Route path="/settings/admin-users">
        <PrivateRoute><AdminUsers /></PrivateRoute>
      </Route>
      <Route path="/settings/security">
        <PrivateRoute><SecuritySettings /></PrivateRoute>
      </Route>
      <Route path="/hotels/:id/bookings">
        {(params) => <PrivateRoute><Bookings id={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/hotels/:id/calendar">
        {(params) => <PrivateRoute><Calendar id={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/hotels/:id/ota">
        {(params) => <PrivateRoute><OtaSync hotelId={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/hotels/:id/staff">
        {(params) => <PrivateRoute><HotelStaff id={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/hotels/:id">
        {(params) => <PrivateRoute><HotelDetail id={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/website-builder">
        <PrivateRoute><WebsiteBuilder /></PrivateRoute>
      </Route>
      <Route path="/:slug">
        {(params) => <PublicHotel slug={params.slug} />}
      </Route>
      <Route path="/" component={() => <RedirectToDashboard />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function RedirectToDashboard() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/dashboard");
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

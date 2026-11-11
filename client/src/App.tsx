import { trpc } from "./lib/trpc";
import { hasAnyPermission } from "@shared/authorization";
// Quiet Ledger reminder: global shell uses rail-and-canvas navigation, charcoal ink, warm paper, and pine signal color.
import { Redirect, Route, Switch } from "wouter";
import React from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { PrivateRoute } from "./components/auth/PrivateRoute";
import { ThemeProvider } from "./contexts/ThemeContext";
const Dashboard = React.lazy(() => import("./pages/Home"));
const Financials = React.lazy(() => import("./pages/Financials"));
const BookingsReport = React.lazy(() => import("./pages/BookingsReport"));
const Housekeeping = React.lazy(() => import("./pages/Housekeeping"));
const StaffShifts = React.lazy(() => import("./pages/StaffShifts"));
const StaffTasks = React.lazy(() => import("./pages/StaffTasks"));
const Communications = React.lazy(() => import("./pages/Communications"));
const Login = React.lazy(() => import("./pages/Login"));
const ForgotPassword = React.lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = React.lazy(() => import("./pages/ResetPassword"));
const HotelOwnerSignup = React.lazy(() => import("./pages/HotelOwnerSignup"));
const Landing = React.lazy(() => import("./pages/Landing"));
const Signup = React.lazy(() => import("./pages/Signup"));
const AccountOnboarding = React.lazy(() => import("./pages/AccountOnboarding"));
const AcceptInvite = React.lazy(() => import("./pages/AcceptInvite"));
const Hotels = React.lazy(() => import("./pages/Hotels"));
const HotelDetail = React.lazy(() => import("./pages/HotelDetail"));
const HotelFinanceSettings = React.lazy(() => import("./pages/HotelFinanceSettings"));
const Bookings = React.lazy(() => import("./pages/Bookings"));
const Tm30 = React.lazy(() => import("./pages/Tm30"));
const OneCalendar = React.lazy(() => import("./pages/OneCalendar"));
import { useHotel } from "./contexts/HotelContext";
const PublicHotel = React.lazy(() => import("./pages/PublicHotel"));
const PublicBooking = React.lazy(() => import("./pages/PublicBooking"));
const AdminUsers = React.lazy(() => import("./pages/AdminUsers"));
const SecuritySettings = React.lazy(() => import("./pages/SecuritySettings"));
const Account = React.lazy(() => import("./pages/Account"));
import HotelClosure from "./pages/HotelClosure";
const SupportAccess = React.lazy(() => import("./pages/SupportAccess"));
const PlatformOverview = React.lazy(() => import("./pages/PlatformOverview"));
const PlatformCrm = React.lazy(() => import("./pages/PlatformCrm"));
const PlatformCoupons = React.lazy(() => import("./pages/PlatformCoupons"));
const SubscriptionPlan = React.lazy(() => import("./pages/SubscriptionPlan"));
const HotelStaff = React.lazy(() => import("./pages/HotelStaff"));
const HotelProfile = React.lazy(() => import("./pages/HotelProfile"));
const HotelServices = React.lazy(() => import("./pages/HotelServices"));
const OtaSync = React.lazy(() => import("./pages/OtaSync"));
import { otaConnectivityEnabled } from "@shared/otaAvailability";
const WebsiteBuilder = React.lazy(() => import("./pages/WebsiteBuilder"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
import { LanguageProvider, pickInitialLanguage } from "./contexts/LanguageContext";
import { communicationsEnabled, otaSyncEnabled } from "./lib/featureFlags";
import { useTranslation } from "./lib/i18n";
const LegalPage = React.lazy(() => import("./pages/LegalPage"));
const GettingStarted = React.lazy(() => import("./pages/GettingStarted"));
const GuestBooking = React.lazy(() => import("./pages/GuestBooking"));
const ConfirmEmailLink = React.lazy(() => import("./pages/ConfirmEmailLink"));
const HotelPrivacy = React.lazy(() => import("./pages/HotelPrivacy"));

function RouteLoading() {
  const { t } = useTranslation();
  return <main className="auth-loading" role="status" aria-live="polite">{t("common.loading")}</main>;
}

function PricingRedirect() {
  const { selectedHotelId } = useHotel();
  return <Redirect to={selectedHotelId ? `/hotels/${selectedHotelId}/calendar` : "/hotels"} />;
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <React.Suspense fallback={<RouteLoading />}>
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/signup" component={Signup} />
      <Route path="/terms"><LegalPage kind="terms" /></Route>
      <Route path="/privacy"><LegalPage kind="privacy" /></Route>
      <Route path="/dpa"><LegalPage kind="dpa" /></Route>
      <Route path="/signup/:token">
        {(params) => <HotelOwnerSignup token={params.token} />}
      </Route>
      <Route path="/accept-invite" component={AcceptInvite} />
      <Route path="/confirm-email" component={ConfirmEmailLink} />
      <Route path="/help/getting-started"><PrivateRoute><GettingStarted /></PrivateRoute></Route>
      <Route path="/dashboard/financials">
        <PrivateRoute><Financials /></PrivateRoute>
      </Route>
      <Route path="/reports/bookings"><PrivateRoute><BookingsReport /></PrivateRoute></Route>
      <Route path="/hotels/:id/billing"><PrivateRoute><SubscriptionPlan /></PrivateRoute></Route>
      <Route path="/dashboard/pricing">
        <PrivateRoute><PricingRedirect /></PrivateRoute>
      </Route>
      <Route path="/housekeeping">
        <Redirect to="/staff-shifts" />
      </Route>
      <Route path="/staff-shifts"><PrivateRoute><StaffShifts /></PrivateRoute></Route>
      <Route path="/staff-tasks"><PrivateRoute><StaffTasks /></PrivateRoute></Route>
      {communicationsEnabled && <Route path="/communications">
        <PrivateRoute><Communications /></PrivateRoute>
      </Route>}
      <Route path="/platform"><PrivateRoute><PlatformOverview /></PrivateRoute></Route>
      <Route path="/platform/crm"><PrivateRoute><PlatformCrm /></PrivateRoute></Route>
      <Route path="/platform/coupons"><PrivateRoute><PlatformCoupons /></PrivateRoute></Route>
      <Route path="/hotels/:id/billing"><PrivateRoute><SubscriptionPlan /></PrivateRoute></Route>
      <Route path="/hotels/:id/support-access">
        {(params) => <PrivateRoute><SupportAccess hotelId={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/dashboard">
        <PrivateRoute><DashboardEntry /></PrivateRoute>
      </Route>
      <Route path="/hotels">
        <PrivateRoute><Hotels /></PrivateRoute>
      </Route>
      <Route path="/settings/admin-users">
        <PrivateRoute><AdminUsers /></PrivateRoute>
      </Route>
      <Route path="/settings/account">
        <PrivateRoute><Account /></PrivateRoute>
      </Route>
      <Route path="/settings/security">
        <PrivateRoute><SecuritySettings /></PrivateRoute>
      </Route>
      <Route path="/hotel-closure">
        <PrivateRoute><HotelClosure /></PrivateRoute>
      </Route>
      <Route path="/hotels/:id/tm30">
        {(params) => <PrivateRoute><Tm30 id={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/hotels/:id/bookings">
        {(params) => <PrivateRoute><Bookings id={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/hotels/:id/calendar">
        {(params) => <PrivateRoute><OneCalendar id={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/hotels/:id/ota">
        {(params) => otaSyncEnabled && otaConnectivityEnabled ? <PrivateRoute><OtaSync hotelId={params.id} /></PrivateRoute> : <Redirect to={`/hotels/${params.id}`} />}
      </Route>
      <Route path="/hotels/:id/staff">
        {(params) => <PrivateRoute><HotelStaff id={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/hotels/:id/services">
        {(params) => <PrivateRoute><HotelServices id={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/hotels/:id/profile">
        {(params) => <PrivateRoute><HotelProfile id={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/hotels/:id/settings/general">
        {(params) => <PrivateRoute><HotelProfile id={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/hotels/:id/settings/finance">
        {(params) => <PrivateRoute><HotelFinanceSettings id={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/hotels/:id">
        {(params) => <PrivateRoute><HotelDetail id={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/website-builder">
        <PrivateRoute><WebsiteBuilder /></PrivateRoute>
      </Route>
      <Route path="/booking/:id" component={GuestBooking} />
      <Route path="/:slug/privacy">
        {(params) => <HotelPrivacy slug={params.slug} />}
      </Route>
      <Route path="/:slug/book">
        {(params) => <PublicBooking slug={params.slug} />}
      </Route>
      <Route path="/:slug">
        {(params) => <PublicHotel slug={params.slug} />}
      </Route>
      <Route path="/" component={Landing} />
      <Route component={NotFound} />
    </Switch>
    </React.Suspense>
  );
}

function DashboardEntry() {
  const { t } = useTranslation();
  const { data: me, isLoading } = trpc.auth.me.useQuery();
  if (isLoading) return <main className="auth-loading">{t("common.checkingAccount")}</main>;
  if (me && !me.roles?.length && !me.role && !me.memberships?.length) return <AccountOnboarding />;
  return hasAnyPermission(me?.roles ?? [], "platform.view_system_logs") ? <PlatformOverview /> : <Dashboard />;
}

// Hotel owners are sold to in Thai; elsewhere respect the browser language.
const initialLanguage = pickInitialLanguage(window.location.pathname, navigator.languages ?? [navigator.language]);

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <LanguageProvider defaultLanguage={initialLanguage}>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

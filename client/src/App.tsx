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
import Dashboard from "./pages/Home";
import Financials from "./pages/Financials";
import Housekeeping from "./pages/Housekeeping";
import Communications from "./pages/Communications";
import Login from "./pages/Login";
import MfaEnroll from "./pages/MfaEnroll";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import HotelOwnerSignup from "./pages/HotelOwnerSignup";
import Landing from "./pages/Landing";
import Signup from "./pages/Signup";
import AccountOnboarding from "./pages/AccountOnboarding";
import AcceptInvite from "./pages/AcceptInvite";
import Hotels from "./pages/Hotels";
import HotelDetail from "./pages/HotelDetail";
import Bookings from "./pages/Bookings";
import OneCalendar from "./pages/OneCalendar";
import { useHotel } from "./contexts/HotelContext";
import PublicHotel from "./pages/PublicHotel";
import PublicBooking from "./pages/PublicBooking";
import AdminUsers from "./pages/AdminUsers";
import SecuritySettings from "./pages/SecuritySettings";
import Account from "./pages/Account";
import HotelClosure from "./pages/HotelClosure";
import SupportAccess from "./pages/SupportAccess";
import PlatformOverview from "./pages/PlatformOverview";
import PlatformCrm from "./pages/PlatformCrm";
import PlatformCoupons from "./pages/PlatformCoupons";
import SubscriptionPlan from "./pages/SubscriptionPlan";
import HotelStaff from "./pages/HotelStaff";
import HotelServices from "./pages/HotelServices";
import OtaSync from "./pages/OtaSync";
import { otaConnectivityEnabled } from "@shared/otaAvailability";
import WebsiteBuilder from "./pages/WebsiteBuilder";
import NotFound from "./pages/NotFound";
import { LanguageProvider, pickInitialLanguage } from "./contexts/LanguageContext";
import { communicationsEnabled, otaSyncEnabled } from "./lib/featureFlags";
import { useTranslation } from "./lib/i18n";
import LegalPage from "./pages/LegalPage";
import GettingStarted from "./pages/GettingStarted";

function PricingRedirect() {
  const { selectedHotelId } = useHotel();
  return <Redirect to={selectedHotelId ? `/hotels/${selectedHotelId}/calendar` : "/hotels"} />;
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/mfa/enroll" component={MfaEnroll} />
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
      <Route path="/help/getting-started"><PrivateRoute><GettingStarted /></PrivateRoute></Route>
      <Route path="/dashboard/financials">
        <PrivateRoute><Financials /></PrivateRoute>
      </Route>
      <Route path="/hotels/:id/billing"><PrivateRoute><SubscriptionPlan /></PrivateRoute></Route>
      <Route path="/dashboard/pricing">
        <PrivateRoute><PricingRedirect /></PrivateRoute>
      </Route>
      <Route path="/housekeeping">
        <PrivateRoute><Housekeeping /></PrivateRoute>
      </Route>
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
      <Route path="/hotels/:id">
        {(params) => <PrivateRoute><HotelDetail id={params.id} /></PrivateRoute>}
      </Route>
      <Route path="/website-builder">
        <PrivateRoute><WebsiteBuilder /></PrivateRoute>
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

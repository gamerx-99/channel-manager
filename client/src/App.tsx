import { trpc } from "./lib/trpc";
import { hasAnyPermission } from "@shared/authorization";
// Quiet Ledger reminder: global shell uses rail-and-canvas navigation, charcoal ink, warm paper, and pine signal color.
import { Route, Switch } from "wouter";
import React from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { PrivateRoute } from "./components/auth/PrivateRoute";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Home";
import Financials from "./pages/Financials";
import AdvancedPricing from "./pages/AdvancedPricing";
import Housekeeping from "./pages/Housekeeping";
import Communications from "./pages/Communications";
import Login from "./pages/Login";
import MfaEnroll from "./pages/MfaEnroll";
import HotelOwnerSignup from "./pages/HotelOwnerSignup";
import Landing from "./pages/Landing";
import Signup from "./pages/Signup";
import AcceptInvite from "./pages/AcceptInvite";
import Hotels from "./pages/Hotels";
import HotelDetail from "./pages/HotelDetail";
import Bookings from "./pages/Bookings";
import Calendar from "./pages/Calendar";
import PublicHotel from "./pages/PublicHotel";
import AdminUsers from "./pages/AdminUsers";
import SecuritySettings from "./pages/SecuritySettings";
import SupportAccess from "./pages/SupportAccess";
import PlatformOverview from "./pages/PlatformOverview";
import HotelStaff from "./pages/HotelStaff";
import HotelServices from "./pages/HotelServices";
import OtaSync from "./pages/OtaSync";
import WebsiteBuilder from "./pages/WebsiteBuilder";
import NotFound from "./pages/NotFound";
import { LanguageProvider } from "./contexts/LanguageContext";
import { communicationsEnabled } from "./lib/featureFlags";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/mfa/enroll" component={MfaEnroll} />
      <Route path="/signup" component={Signup} />
      <Route path="/signup/:token">
        {(params) => <HotelOwnerSignup token={params.token} />}
      </Route>
      <Route path="/accept-invite" component={AcceptInvite} />
      <Route path="/dashboard/financials">
        <PrivateRoute><Financials /></PrivateRoute>
      </Route>
      <Route path="/dashboard/pricing">
        <PrivateRoute><AdvancedPricing /></PrivateRoute>
      </Route>
      <Route path="/housekeeping">
        <PrivateRoute><Housekeeping /></PrivateRoute>
      </Route>
      {communicationsEnabled && <Route path="/communications">
        <PrivateRoute><Communications /></PrivateRoute>
      </Route>}
      <Route path="/platform"><PrivateRoute><PlatformOverview /></PrivateRoute></Route>
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
      <Route path="/hotels/:id/services">
        {(params) => <PrivateRoute><HotelServices id={params.id} /></PrivateRoute>}
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
      <Route path="/" component={Landing} />
      <Route component={NotFound} />
    </Switch>
  );
}

function DashboardEntry() {
  const { data: me } = trpc.auth.me.useQuery();
  return hasAnyPermission(me?.roles ?? [], "platform.view_system_logs") ? <PlatformOverview /> : <Dashboard />;
}

// Hotel owners are sold to in Thai; every other page keeps the existing default.
const initialLanguage = ["/", "/signup"].includes(window.location.pathname) ? "th" : "en";

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

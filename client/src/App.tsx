import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Login from "@/pages/login";
import TrailerDetail from "@/pages/trailer-detail";
import Jobs from "@/pages/jobs";
import Apply from "@/pages/apply";
import ServicesPage from "@/pages/services";
import LegalPage from "@/pages/legal";

// Loaded on demand: only renters, admins or people following a token link reach these,
// so the public bundle stays small and nothing in them runs on public pages
// (@stripe/stripe-js, for one, injects Stripe.js the moment it is imported).
const Dashboard = lazy(() => import("@/pages/dashboard"));
const AdminPortal = lazy(() => import("@/pages/admin/index"));
const AdminInventory = lazy(() => import("@/pages/admin/inventory"));
const TrailerFormPage = lazy(() => import("@/pages/admin/trailer-form"));
const AdminRequests = lazy(() => import("@/pages/admin/requests"));
const AdminRequestDetail = lazy(() => import("@/pages/admin/request-detail"));
const Signup = lazy(() => import("@/pages/signup"));
const ApplicationRespond = lazy(() => import("@/pages/application-respond"));
const Register = lazy(() => import("@/pages/register"));
const AgreementPage = lazy(() => import("@/pages/agreement"));
const AdminRentals = lazy(() => import("@/pages/admin/rentals"));
const AdminRentalDetail = lazy(() => import("@/pages/admin/rental-detail"));
const PaymentPage = lazy(() => import("@/pages/payment"));
const EngineHoursPage = lazy(() => import("@/pages/engine-hours"));
const PickupConfirmPage = lazy(() => import("@/pages/pickup-confirm"));
const ReturnConfirmPage = lazy(() => import("@/pages/return-confirm"));
const AdminFMCSAPage = lazy(() => import("@/pages/admin/fmcsa"));
const AdminDriverApplications = lazy(() => import("@/pages/admin/driver-applications"));
const AdminAuditPage = lazy(() => import("@/pages/admin/audit"));
const AdminUsersPage = lazy(() => import("@/pages/admin/users"));
const AdminContactsPage = lazy(() => import("@/pages/admin/contacts"));
const AdminContentPage = lazy(() => import("@/pages/admin/content"));
const RegisterAdmin = lazy(() => import("@/pages/register-admin"));
const ForgotPasswordPage = lazy(() => import("@/pages/forgot-password"));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password"));
const AdminEmailLogsPage = lazy(() => import("@/pages/admin/email-logs"));
const AdminJobsPage = lazy(() => import("@/pages/admin/jobs"));

function RouteFallback() {
  return <div className="min-h-screen bg-background" aria-busy="true" />;
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/admin" component={AdminPortal} />
      <Route path="/admin/inventory" component={AdminInventory} />
      <Route path="/admin/inventory/new" component={TrailerFormPage} />
      <Route path="/admin/inventory/:id" component={TrailerFormPage} />
      <Route path="/admin/requests" component={AdminRequests} />
      <Route path="/admin/requests/:id" component={AdminRequestDetail} />
      <Route path="/admin/rentals" component={AdminRentals} />
      <Route path="/admin/rentals/:id" component={AdminRentalDetail} />
      <Route path="/trailers/:id" component={TrailerDetail} />
      <Route path="/jobs" component={Jobs} />
      <Route path="/signup" component={Signup} />
      <Route path="/apply/:trailerId" component={Apply} />
      <Route path="/applications/respond/:renterToken" component={ApplicationRespond} />
      <Route path="/register/admin/:inviteToken" component={RegisterAdmin} />
      <Route path="/register/:inviteToken" component={Register} />
      <Route path="/dashboard/sign-agreement/:rentalId" component={AgreementPage} />
      <Route path="/dashboard/payment/:rentalId" component={PaymentPage} />
      <Route path="/dashboard/engine-hours/:rentalId" component={EngineHoursPage} />
      <Route path="/agreement/:rentalId" component={AgreementPage} />
      <Route path="/pickup/:token" component={PickupConfirmPage} />
      <Route path="/return/:token" component={ReturnConfirmPage} />
      <Route path="/admin/fmcsa" component={AdminFMCSAPage} />
      <Route path="/admin/driver-applications" component={AdminDriverApplications} />
      <Route path="/admin/audit" component={AdminAuditPage} />
      <Route path="/admin/users" component={AdminUsersPage} />
      <Route path="/admin/contacts" component={AdminContactsPage} />
      <Route path="/admin/content" component={AdminContentPage} />
      <Route path="/services" component={ServicesPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password/:token" component={ResetPasswordPage} />
      <Route path="/admin/email-logs" component={AdminEmailLogsPage} />
      <Route path="/admin/jobs" component={AdminJobsPage} />
      <Route path="/legal" component={LegalPage} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

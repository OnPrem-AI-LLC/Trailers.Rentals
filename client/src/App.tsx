import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import AdminPortal from "@/pages/admin/index";
import AdminInventory from "@/pages/admin/inventory";
import TrailerFormPage from "@/pages/admin/trailer-form";
import AdminRequests from "@/pages/admin/requests";
import AdminRequestDetail from "@/pages/admin/request-detail";
import TrailerDetail from "@/pages/trailer-detail";
import Jobs from "@/pages/jobs";
import Signup from "@/pages/signup";
import Apply from "@/pages/apply";
import ApplicationRespond from "@/pages/application-respond";
import Register from "@/pages/register";
import AgreementPage from "@/pages/agreement";
import AdminRentals from "@/pages/admin/rentals";
import AdminRentalDetail from "@/pages/admin/rental-detail";
import PaymentPage from "@/pages/payment";
import EngineHoursPage from "@/pages/engine-hours";
import PickupConfirmPage from "@/pages/pickup-confirm";
import ReturnConfirmPage from "@/pages/return-confirm";
import AdminFMCSAPage from "@/pages/admin/fmcsa";
import AdminDriverApplications from "@/pages/admin/driver-applications";
import AdminAuditPage from "@/pages/admin/audit";
import AdminUsersPage from "@/pages/admin/users";
import RegisterAdmin from "@/pages/register-admin";

function Router() {
  return (
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
      <Route component={NotFound} />
    </Switch>
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

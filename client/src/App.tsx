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
      <Route path="/trailers/:id" component={TrailerDetail} />
      <Route path="/jobs" component={Jobs} />
      <Route path="/signup" component={Signup} />
      <Route path="/apply/:id" component={Apply} />
      <Route path="/applications/:id/respond" component={ApplicationRespond} />
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

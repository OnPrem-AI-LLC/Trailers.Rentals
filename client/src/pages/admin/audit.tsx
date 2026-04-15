import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft, Search, Shield, Clock, User, Filter, ChevronRight, RefreshCcw, CalendarRange,
} from "lucide-react";

interface AuditLog {
  id: string;
  userId: string | null;
  actorName: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  description: string;
  metadata: string | null;
  ipAddress: string | null;
  isAdminEntry: boolean;
  createdAt: string;
}

interface AuditResponse {
  logs: AuditLog[];
  total: number;
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  create_trailer: "Create Trailer",
  update_trailer: "Update Trailer",
  retire_trailer: "Retire Trailer",
  restore_trailer: "Restore Trailer",
  application_submitted: "Application Submitted",
  application_approved: "Application Approved",
  application_rejected: "Application Rejected",
  application_needs_info: "More Info Requested",
  rental_created: "Rental Created",
  rental_activated: "Rental Activated",
  rental_status_changed: "Status Changed",
  rental_cancelled: "Rental Cancelled",
  rental_completed: "Rental Completed",
  company_edited_by_admin: "Company Edited",
  deposit_finalized_webhook: "Deposit Confirmed (webhook)",
  deposit_finalized_client_callback: "Deposit Confirmed (callback)",
  deposit_finalized_admin_manual: "Deposit Confirmed (admin)",
  agreement_signed: "Agreement Signed",
  pickup_confirmed: "Pickup Confirmed",
  return_confirmed: "Return Confirmed",
  engine_hour_entry_submitted: "Engine Hours Submitted",
  engine_hour_entry_admin: "Engine Hours (admin)",
  note_added: "Note Added",
  rental_message_sent: "Message Sent",
  subscription_creation_failed: "Subscription Failed",
  admin_user_invited: "User Invited",
  admin_user_deactivated: "User Deactivated",
  admin_user_reactivated: "User Reactivated",
  safer_refreshed: "FMCSA SAFER Refreshed",
};

const ENTITY_COLORS: Record<string, string> = {
  trailer: "bg-blue-500/15 text-blue-400",
  rental: "bg-green-500/15 text-green-400",
  rental_application: "bg-amber-500/15 text-amber-400",
  company: "bg-purple-500/15 text-purple-400",
  user: "bg-cyan-500/15 text-cyan-400",
};

const PAGE_SIZE = 50;

export default function AdminAuditPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterEntity, setFilterEntity] = useState("all");
  const [filterActor, setFilterActor] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);

  if (!user || user.role !== "admin") {
    navigate("/login");
    return null;
  }

  const { data, isLoading, refetch, isFetching } = useQuery<AuditResponse>({
    queryKey: ["/api/admin/audit"],
    queryFn: async () => {
      const res = await fetch("/api/admin/audit?limit=500");
      if (!res.ok) throw new Error("Failed to load audit logs");
      return res.json();
    },
    staleTime: 30000,
  });

  const uniqueActions = useMemo(() => [...new Set((data?.logs ?? []).map(l => l.actionType))].sort(), [data]);
  const uniqueEntities = useMemo(() => [...new Set((data?.logs ?? []).map(l => l.entityType).filter(Boolean))].sort() as string[], [data]);

  // Build unique actor list (userId + name pairs)
  const uniqueActors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of data?.logs ?? []) {
      if (l.userId && !seen.has(l.userId)) {
        seen.set(l.userId, l.actorName);
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const filtered = useMemo(() => {
    let logs = data?.logs ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      logs = logs.filter(l =>
        l.description.toLowerCase().includes(q) ||
        l.actionType.toLowerCase().includes(q) ||
        (l.entityType?.toLowerCase().includes(q)) ||
        (l.entityId?.toLowerCase().includes(q)) ||
        l.actorName.toLowerCase().includes(q)
      );
    }
    if (filterAction !== "all") logs = logs.filter(l => l.actionType === filterAction);
    if (filterEntity !== "all") logs = logs.filter(l => l.entityType === filterEntity);
    if (filterActor !== "all") logs = logs.filter(l => l.userId === filterActor);
    if (fromDate) {
      const from = new Date(fromDate);
      logs = logs.filter(l => new Date(l.createdAt) >= from);
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      logs = logs.filter(l => new Date(l.createdAt) <= to);
    }
    return logs;
  }, [data, search, filterAction, filterEntity, filterActor, fromDate, toDate]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageLogs = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const resetPage = () => setPage(0);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <ChevronLeft className="w-4 h-4" />Back
            </Button>
          </Link>
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Audit Log</h1>
          <span className="text-sm text-muted-foreground">({data?.total ?? 0} total entries)</span>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching} className="ml-auto gap-1.5 text-muted-foreground">
            <RefreshCcw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-xl p-4 mb-5 space-y-3">
          {/* Row 1: search + action + entity */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => { setSearch(e.target.value); resetPage(); }}
                placeholder="Search description, action, entity, actor..."
                className="pl-9 h-8 text-sm"
              />
            </div>
            <Select value={filterAction} onValueChange={v => { setFilterAction(v); resetPage(); }}>
              <SelectTrigger className="w-[220px] h-8 text-sm">
                <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {uniqueActions.map(a => (
                  <SelectItem key={a} value={a}>{ACTION_TYPE_LABELS[a] ?? a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterEntity} onValueChange={v => { setFilterEntity(v); resetPage(); }}>
              <SelectTrigger className="w-[160px] h-8 text-sm">
                <SelectValue placeholder="Entity type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                {uniqueEntities.map(e => (
                  <SelectItem key={e} value={e}>{e.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Row 2: actor + date range */}
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={filterActor} onValueChange={v => { setFilterActor(v); resetPage(); }}>
              <SelectTrigger className="w-[200px] h-8 text-sm">
                <User className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Filter by admin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {uniqueActors.map(([uid, name]) => (
                  <SelectItem key={uid} value={uid}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <CalendarRange className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <Input
                type="date"
                value={fromDate}
                onChange={e => { setFromDate(e.target.value); resetPage(); }}
                className="h-8 text-sm w-[140px]"
                placeholder="From"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="date"
                value={toDate}
                onChange={e => { setToDate(e.target.value); resetPage(); }}
                className="h-8 text-sm w-[140px]"
                placeholder="To"
              />
              {(fromDate || toDate || filterActor !== "all" || filterAction !== "all" || filterEntity !== "all" || search) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => {
                    setSearch(""); setFilterAction("all"); setFilterEntity("all");
                    setFilterActor("all"); setFromDate(""); setToDate(""); setPage(0);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length !== (data?.total ?? 0) ? `${filtered.length} of ${data?.total ?? 0} shown` : `${filtered.length} entries`}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left p-3 text-xs text-muted-foreground font-medium w-36">Timestamp</th>
                  <th className="text-left p-3 text-xs text-muted-foreground font-medium w-32">Actor</th>
                  <th className="text-left p-3 text-xs text-muted-foreground font-medium">Action</th>
                  <th className="text-left p-3 text-xs text-muted-foreground font-medium">Description</th>
                  <th className="text-left p-3 text-xs text-muted-foreground font-medium w-28">Entity</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="p-3"><Skeleton className="h-4 w-28" /></td>
                      <td className="p-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="p-3"><Skeleton className="h-4 w-32" /></td>
                      <td className="p-3"><Skeleton className="h-4 w-64" /></td>
                      <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                    </tr>
                  ))
                ) : pageLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-muted-foreground">
                      No audit log entries match your filters
                    </td>
                  </tr>
                ) : pageLogs.map(log => (
                  <tr key={log.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        <span className="text-[11px] tabular-nums">
                          {new Date(log.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                          {new Date(log.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs truncate max-w-[110px]" title={log.actorName}>
                          {log.actorName}
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-[11px] text-foreground/70 bg-secondary/40 px-1.5 py-0.5 rounded whitespace-nowrap">
                        {ACTION_TYPE_LABELS[log.actionType] ?? log.actionType}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-xs text-foreground/90">{log.description}</span>
                    </td>
                    <td className="p-3">
                      {log.entityType && (
                        <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${ENTITY_COLORS[log.entityType] ?? "bg-secondary text-muted-foreground"}`}>
                          {log.entityType.replace(/_/g, " ")}
                        </span>
                      )}
                      {log.isAdminEntry && (
                        <Badge variant="outline" className="text-[10px] border-primary/40 text-primary px-1.5 py-0.5 ml-1">
                          Admin
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs flex items-center px-2 text-muted-foreground">{page + 1} / {totalPages}</span>
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

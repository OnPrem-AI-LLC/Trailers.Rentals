import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Mail, CheckCircle, XCircle, SkipForward, Search } from "lucide-react";
import type { EmailLog } from "@shared/schema";

export default function AdminEmailLogsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) navigate("/login");
  }, [authLoading, user, navigate]);

  const { data: logs = [], isLoading } = useQuery<EmailLog[]>({
    queryKey: ["/api/admin/email-logs"],
    enabled: !!user && user.role === "admin",
  });

  if (authLoading || !user) return <div className="min-h-screen bg-background flex items-center justify-center"><Skeleton className="h-8 w-48" /></div>;
  if (user.role !== "admin") return null;

  const filtered = search
    ? logs.filter((l) =>
        l.recipient.toLowerCase().includes(search.toLowerCase()) ||
        l.subject.toLowerCase().includes(search.toLowerCase()) ||
        l.template.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const statusIcon = (status: string) => {
    if (status === "sent") return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-red-500" />;
    return <SkipForward className="w-4 h-4 text-muted-foreground" />;
  };

  const statusBadge = (status: string) => {
    if (status === "sent") return <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950">Sent</Badge>;
    if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
    return <Badge variant="secondary">Skipped</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-6">
          <Mail className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Email Logs</h1>
            <p className="text-sm text-muted-foreground">All outbound emails sent by the system</p>
          </div>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search recipient, subject, or template..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Mail className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{search ? "No emails match your search" : "No email logs yet"}</p>
            <p className="text-sm mt-1">{!search && "Emails will appear here once the system starts sending them."}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Recipient</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Template</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Subject</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Entity</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sent At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {statusIcon(log.status)}
                        {statusBadge(log.status)}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[180px]">{log.recipient}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="font-mono text-xs">{log.template}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell truncate max-w-[200px]">{log.subject}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {log.entityType ? (
                        <span className="text-xs text-muted-foreground">
                          {log.entityType}: <span className="font-mono">{log.entityId?.slice(-8) ?? "—"}</span>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(log.sentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length >= 200 && (
              <div className="px-4 py-3 text-xs text-muted-foreground bg-muted/30 border-t border-border">
                Showing latest 200 email logs.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

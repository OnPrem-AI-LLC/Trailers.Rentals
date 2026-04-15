import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ChevronLeft, Mail, Phone, MessageSquare, Clock, CheckCheck } from "lucide-react";
import type { Contact } from "@shared/schema";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-primary/15 text-primary border-primary/30",
  read: "bg-secondary text-muted-foreground border-border",
  replied: "bg-green-500/15 text-green-600 border-green-500/30 dark:text-green-400",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  read: "Read",
  replied: "Replied",
};

export default function AdminContactsPage() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "admin") navigate("/login");
  }, [user, authLoading, navigate]);

  const isAdmin = !!user && user.role === "admin";

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/admin/contacts", filterStatus],
    queryFn: async () => {
      const params = filterStatus !== "all" ? `?status=${filterStatus}` : "";
      const res = await fetch(`/api/admin/contacts${params}`);
      if (!res.ok) throw new Error("Failed to load contacts");
      return res.json();
    },
    enabled: isAdmin,
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/admin/contacts/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contacts"] });
      toast({ title: "Status updated" });
    },
  });

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  const newCount = contacts.filter((c) => c.status === "new").length;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <ChevronLeft className="w-4 h-4" />Back
            </Button>
          </Link>
          <Mail className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Contact Inquiries</h1>
          {newCount > 0 && (
            <Badge className="bg-primary/15 text-primary border-primary/30 text-xs">
              {newCount} new
            </Badge>
          )}
          <div className="ml-auto">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All contacts</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-xl">
            <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No contact inquiries yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {contacts.map((contact) => (
              <div key={contact.id} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Summary row */}
                <button
                  className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-secondary/30 transition-colors"
                  onClick={() => setExpanded(expanded === contact.id ? null : contact.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-semibold text-sm">{contact.name}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[contact.status]}`}>
                        {STATUS_LABELS[contact.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{contact.subject}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(contact.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>

                {/* Expanded detail */}
                {expanded === contact.id && (
                  <div className="px-5 pb-5 border-t border-border">
                    <div className="grid sm:grid-cols-2 gap-4 py-4 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-3.5 h-3.5" />
                        <a href={`mailto:${contact.email}`} className="hover:text-primary transition-colors">
                          {contact.email}
                        </a>
                      </div>
                      {contact.phone && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="w-3.5 h-3.5" />
                          <a href={`tel:${contact.phone}`} className="hover:text-primary transition-colors">
                            {contact.phone}
                          </a>
                        </div>
                      )}
                    </div>
                    <div className="bg-background border border-border rounded-lg p-4 mb-4">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{contact.message}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Mark as:</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => statusMut.mutate({ id: contact.id, status: "read" })}
                        disabled={contact.status === "read" || statusMut.isPending}
                      >
                        Read
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => statusMut.mutate({ id: contact.id, status: "replied" })}
                        disabled={contact.status === "replied" || statusMut.isPending}
                      >
                        <CheckCheck className="w-3 h-3" /> Replied
                      </Button>
                      <a href={`mailto:${contact.email}?subject=Re: ${encodeURIComponent(contact.subject)}`} className="ml-auto">
                        <Button size="sm" className="h-7 text-xs gap-1 bg-primary hover:bg-primary/90 text-white">
                          <Mail className="w-3 h-3" /> Reply via Email
                        </Button>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

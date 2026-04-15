import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft, Users, UserPlus, UserX, UserCheck, Mail, Shield, AlertTriangle,
} from "lucide-react";

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const inviteSchema = z.object({
  email: z.string().email("Valid email required"),
  firstName: z.string().min(1, "First name required"),
  lastName: z.string().min(1, "Last name required"),
  role: z.enum(["admin", "renter"]),
});
type InviteForm = z.infer<typeof inviteSchema>;

export default function AdminUsersPage() {
  const [, navigate] = useLocation();
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser || currentUser.role !== "admin") navigate("/login");
  }, [currentUser, authLoading, navigate]);

  const isAdmin = !!currentUser && currentUser.role === "admin";

  const { data: users, isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
    enabled: isAdmin,
  });

  const inviteMut = useMutation({
    mutationFn: (data: InviteForm) => apiRequest("POST", "/api/admin/users/invite", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Invitation sent", description: "The user will receive a setup email." });
      setShowInvite(false);
      form.reset();
    },
    onError: async (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to send invitation";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/users/${id}/deactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Account updated" });
    },
    onError: async (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update account";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const form = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", firstName: "", lastName: "", role: "admin" },
  });

  const admins = users?.filter(u => u.role === "admin") ?? [];
  const renters = users?.filter(u => u.role === "renter") ?? [];

  if (authLoading || !currentUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

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
          <Users className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">User Management</h1>
          <Button
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => setShowInvite(!showInvite)}
          >
            <UserPlus className="w-3.5 h-3.5" />
            {showInvite ? "Cancel" : "Invite User"}
          </Button>
        </div>

        {/* Invite form */}
        {showInvite && (
          <div className="bg-card border border-border rounded-xl p-5 mb-6">
            <h2 className="font-bold text-sm mb-4 uppercase tracking-wider">Invite New User</h2>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(data => inviteMut.mutate(data))} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl><Input {...field} placeholder="Jane" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl><Input {...field} placeholder="Smith" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input {...field} type="email" placeholder="jane@deluxelogistics.com" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="renter">Renter</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={inviteMut.isPending} className="gap-2">
                    <Mail className="w-4 h-4" />
                    {inviteMut.isPending ? "Sending…" : "Send Invitation"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    The invited user will receive an email with a 7-day setup link.
                  </p>
                </div>
              </form>
            </Form>
          </div>
        )}

        {/* Admin accounts */}
        <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
          <div className="flex items-center gap-2 p-4 border-b border-border">
            <Shield className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-sm uppercase tracking-wider">Admin Accounts</h2>
            <span className="text-xs text-muted-foreground ml-1">({admins.length})</span>
          </div>
          <div className="divide-y divide-border/50">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1"><Skeleton className="h-4 w-40 mb-1" /><Skeleton className="h-3 w-28" /></div>
                  <Skeleton className="h-7 w-20" />
                </div>
              ))
            ) : admins.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No admin accounts found</div>
            ) : admins.map(u => (
              <div key={u.id} className="flex items-center gap-4 p-4">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary">
                    {u.firstName[0]}{u.lastName[0]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{u.firstName} {u.lastName}</span>
                    {u.id === currentUser.id && (
                      <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">You</Badge>
                    )}
                    {!u.isActive && (
                      <Badge variant="outline" className="text-[10px] border-red-800 text-red-400">Inactive</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Mail className="w-3 h-3" />
                    <span>{u.email}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-muted-foreground hidden sm:block">
                    Added {new Date(u.createdAt).toLocaleDateString()}
                  </span>
                  {u.id !== currentUser.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className={`h-7 text-xs gap-1.5 ${u.isActive ? "border-red-800 text-red-400 hover:bg-red-950" : "border-green-800 text-green-400 hover:bg-green-950"}`}
                      disabled={deactivateMut.isPending}
                      onClick={() => deactivateMut.mutate(u.id)}
                    >
                      {u.isActive ? <><UserX className="w-3 h-3" />Deactivate</> : <><UserCheck className="w-3 h-3" />Reactivate</>}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Renter accounts */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 p-4 border-b border-border">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Renter Accounts</h2>
            <span className="text-xs text-muted-foreground ml-1">({renters.length})</span>
          </div>
          <div className="divide-y divide-border/50">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1"><Skeleton className="h-4 w-40 mb-1" /><Skeleton className="h-3 w-28" /></div>
                  <Skeleton className="h-7 w-20" />
                </div>
              ))
            ) : renters.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No renter accounts yet</div>
            ) : renters.map(u => (
              <div key={u.id} className="flex items-center gap-4 p-4">
                <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-muted-foreground">
                    {u.firstName?.[0]}{u.lastName?.[0]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{u.firstName} {u.lastName}</span>
                    {!u.isActive && (
                      <Badge variant="outline" className="text-[10px] border-amber-800 text-amber-400">
                        <AlertTriangle className="w-2.5 h-2.5 mr-1" />Pending
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Mail className="w-3 h-3" /><span>{u.email}</span>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground hidden sm:block flex-shrink-0">
                  {new Date(u.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

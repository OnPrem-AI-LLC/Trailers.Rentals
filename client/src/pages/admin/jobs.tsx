import { useState } from "react";
import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Briefcase,
  MapPin,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  Loader2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import type { JobListing } from "@shared/schema";

const formSchema = z.object({
  title: z.string().min(1, "Title required"),
  location: z.string().min(1, "Location required"),
  description: z.string().min(1, "Description required"),
  type: z.enum(["full-time", "part-time", "contract"]),
  status: z.enum(["active", "inactive"]),
  displayOrder: z.coerce.number().int().min(0).default(0),
});

type FormValues = z.infer<typeof formSchema>;

const TYPE_LABEL: Record<string, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  "contract": "Contract",
};

function JobForm({
  initialValues,
  onSave,
  onCancel,
  isPending,
}: {
  initialValues?: Partial<FormValues>;
  onSave: (values: FormValues) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      location: "Martinsburg, WV",
      description: "",
      type: "full-time",
      status: "active",
      displayOrder: 0,
      ...initialValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField control={form.control} name="title" render={({ field }) => (
            <FormItem>
              <FormLabel>Job Title *</FormLabel>
              <FormControl><Input placeholder="e.g. Class A CDL Driver — OTR" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="location" render={({ field }) => (
            <FormItem>
              <FormLabel>Location *</FormLabel>
              <FormControl><Input placeholder="e.g. Martinsburg, WV" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <FormField control={form.control} name="type" render={({ field }) => (
            <FormItem>
              <FormLabel>Position Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="full-time">Full-time</SelectItem>
                  <SelectItem value="part-time">Part-time</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="displayOrder" render={({ field }) => (
            <FormItem>
              <FormLabel>Display Order</FormLabel>
              <FormControl><Input type="number" min={0} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem>
            <FormLabel>Description *</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Describe the position, responsibilities, pay structure, home time, etc."
                className="min-h-[140px] resize-none"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isPending} className="bg-primary hover:bg-primary/90 text-white font-bold">
            {isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : "Save Listing"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export default function AdminJobsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<JobListing | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) navigate("/login");
  }, [authLoading, user, navigate]);

  const { data: listings = [], isLoading } = useQuery<JobListing[]>({
    queryKey: ["/api/admin/jobs"],
    enabled: !!user && user.role === "admin",
  });

  const createMut = useMutation({
    mutationFn: (data: FormValues) => apiRequest("POST", "/api/admin/jobs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      setDialogOpen(false);
      toast({ title: "Job listing created" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FormValues> }) =>
      apiRequest("PATCH", `/api/admin/jobs/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      setDialogOpen(false);
      setEditing(null);
      toast({ title: "Job listing updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/jobs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      setDeleteConfirm(null);
      toast({ title: "Listing deleted" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(listing: JobListing) {
    setEditing(listing);
    setDialogOpen(true);
  }

  function handleSave(values: FormValues) {
    if (editing) {
      updateMut.mutate({ id: editing.id, data: values });
    } else {
      createMut.mutate(values);
    }
  }

  function toggleStatus(listing: JobListing) {
    const newStatus = listing.status === "active" ? "inactive" : "active";
    updateMut.mutate({ id: listing.id, data: { status: newStatus } });
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }
  if (user.role !== "admin") return null;

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="min-h-screen bg-background px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Admin
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Briefcase className="w-6 h-6 text-primary" /> Job Listings
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage open driving positions shown on the Jobs page</p>
          </div>
          <Button onClick={openNew} className="bg-primary hover:bg-primary/90 text-white font-bold gap-2">
            <Plus className="w-4 h-4" /> Add Listing
          </Button>
        </div>

        {/* Listings */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
            <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No job listings yet</p>
            <p className="text-sm mt-1 mb-4">Create your first listing to start attracting drivers.</p>
            <Button onClick={openNew} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" /> Create First Listing
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map((listing) => (
              <div
                key={listing.id}
                className={`bg-card border rounded-xl p-5 transition-colors ${
                  listing.status === "inactive" ? "border-border opacity-60" : "border-border"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-foreground">{listing.title}</span>
                      <Badge
                        variant="outline"
                        className={listing.status === "active"
                          ? "text-green-600 border-green-300 bg-green-50 dark:bg-green-950"
                          : "text-muted-foreground"}
                      >
                        {listing.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">{TYPE_LABEL[listing.type] ?? listing.type}</Badge>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                      <MapPin className="w-3.5 h-3.5" />
                      {listing.location}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{listing.description}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleStatus(listing)}
                      title={listing.status === "active" ? "Deactivate" : "Activate"}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {listing.status === "active"
                        ? <ToggleRight className="w-5 h-5 text-green-500" />
                        : <ToggleLeft className="w-5 h-5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(listing)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(listing.id)}
                      className="text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Job Listing" : "New Job Listing"}</DialogTitle>
          </DialogHeader>
          <JobForm
            initialValues={editing ? {
              title: editing.title,
              location: editing.location,
              description: editing.description,
              type: editing.type as "full-time" | "part-time" | "contract",
              status: editing.status as "active" | "inactive",
              displayOrder: editing.displayOrder,
            } : undefined}
            onSave={handleSave}
            onCancel={() => { setDialogOpen(false); setEditing(null); }}
            isPending={isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Job Listing?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove this listing from the jobs page. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteConfirm && deleteMut.mutate(deleteConfirm)}
            >
              {deleteMut.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Deleting…</> : "Delete Listing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

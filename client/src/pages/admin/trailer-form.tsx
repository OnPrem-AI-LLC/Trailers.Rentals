import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  Star,
  StarOff,
  Loader2,
  ImageOff,
  QrCode,
  Link as LinkIcon,
  Shield,
  Clock,
} from "lucide-react";
import type { TrailerWithPhotos } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────
interface AuditLogEntry {
  id: string;
  actorName?: string;
  actionType: string;
  description: string;
  isAdminEntry: boolean;
  createdAt: string;
}

interface PhotoState {
  id?: string;
  url: string;
  isPrimary: boolean;
  displayOrder: number;
  uploading?: boolean;
  local?: boolean;
}

interface TrailerFormData {
  vin: string;
  type: string;
  make: string;
  model: string;
  year: string;
  priceMonthly: string;
  engineHourRate: string;
  status: string;
  description: string;
  location: string;
}

const DEFAULT_FORM: TrailerFormData = {
  vin: "", type: "dry_van", make: "", model: "", year: "",
  priceMonthly: "", engineHourRate: "", status: "available", description: "", location: "",
};

const TRAILER_TYPES = [
  { value: "dry_van", label: "Dry Van" },
  { value: "reefer", label: "Reefer (Refrigerated)" },
  { value: "flatbed", label: "Flatbed" },
  { value: "chassis", label: "Chassis" },
  { value: "specialized", label: "Specialized" },
];

const STATUSES = [
  { value: "available", label: "Available" },
  { value: "maintenance", label: "Maintenance" },
  { value: "inactive", label: "Inactive" },
];

// ── Main Component ─────────────────────────────────────────────────────────
export default function TrailerForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id && id !== "new";
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [form, setForm] = useState<TrailerFormData>(DEFAULT_FORM);
  const [features, setFeatures] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState("");
  const [photos, setPhotos] = useState<PhotoState[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load all admin trailers, then find the one we want to edit
  const { data: allTrailers, isLoading: loadingTrailers } = useQuery<TrailerWithPhotos[]>({
    queryKey: ["/api/admin/trailers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/trailers", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load trailers");
      return res.json();
    },
    enabled: isEdit && !!user && user.role === "admin",
  });

  const trailerData = isEdit ? allTrailers?.find(t => t.id === id) : undefined;

  // Audit trail (edit mode only)
  const { data: auditLogs } = useQuery<AuditLogEntry[]>({
    queryKey: ["/api/admin/audit", "trailer", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/audit/trailer/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load audit log");
      return res.json();
    },
    enabled: isEdit && !!user && user.role === "admin",
  });

  // Initialize form state once trailer data is available
  useEffect(() => {
    if (trailerData && !initialized) {
      setForm({
        vin: trailerData.vin ?? "",
        type: trailerData.type ?? "dry_van",
        make: trailerData.make ?? "",
        model: trailerData.model ?? "",
        year: trailerData.year ?? "",
        priceMonthly: trailerData.priceMonthly ? String(trailerData.priceMonthly / 100) : "",
        engineHourRate: trailerData.engineHourRate ? String(trailerData.engineHourRate / 100) : "",
        status: trailerData.status ?? "available",
        description: trailerData.description ?? "",
        location: trailerData.location ?? "",
      });
      try {
        setFeatures(trailerData.features ? JSON.parse(trailerData.features) : []);
      } catch {
        setFeatures([]);
      }
      setPhotos(
        [...trailerData.photos]
          .sort((a, b) => {
            if (a.isPrimary) return -1;
            if (b.isPrimary) return 1;
            return a.displayOrder - b.displayOrder;
          })
          .map((p) => ({
            id: p.id,
            url: p.url,
            isPrimary: p.isPrimary,
            displayOrder: p.displayOrder,
          }))
      );
      setInitialized(true);
    }
  }, [trailerData, initialized]);

  // ── Photo upload via file ────────────────────────────────────────────────
  const uploadFile = useCallback(async (file: File, slotOrder: number) => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error((body as { message?: string }).message ?? "Upload failed");
      }
      const { url } = await res.json() as { url: string };
      setPhotos(prev => {
        const next = [...prev];
        const idx = next.findIndex(p => p.uploading && p.displayOrder === slotOrder);
        if (idx !== -1) next[idx] = { ...next[idx], url, uploading: false };
        return next;
      });
    } catch (err: unknown) {
      setPhotos(prev => prev.filter(p => !(p.uploading && p.displayOrder === slotOrder)));
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPhotos(prev => {
      const baseOrder = prev.length;
      const newSlots: PhotoState[] = files.map((_, i) => ({
        url: "",
        isPrimary: prev.length === 0 && i === 0,
        displayOrder: baseOrder + i,
        uploading: true,
        local: true,
      }));
      // Kick off uploads
      files.forEach((f, i) => uploadFile(f, baseOrder + i));
      return [...prev, ...newSlots];
    });
    e.target.value = "";
  };

  const addPhotoByUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    try { new URL(trimmed); } catch { toast({ title: "Invalid URL", variant: "destructive" }); return; }
    setPhotos(prev => [
      ...prev,
      { url: trimmed, isPrimary: prev.length === 0, displayOrder: prev.length, local: true }
    ]);
    setUrlInput("");
  };

  const removePhoto = async (idx: number) => {
    const photo = photos[idx];
    if (photo.id && isEdit) {
      try {
        await apiRequest("DELETE", `/api/admin/photos/${photo.id}`);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/trailers"] });
      } catch {
        toast({ title: "Error", description: "Failed to delete photo.", variant: "destructive" });
        return;
      }
    }
    setPhotos(prev => {
      const next = prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, displayOrder: i }));
      if (next.length > 0 && !next.some(p => p.isPrimary)) next[0].isPrimary = true;
      return next;
    });
  };

  const setPrimary = (idx: number) => {
    setPhotos(prev => prev.map((p, i) => ({ ...p, isPrimary: i === idx })));
  };

  // ── Form submit ──────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vin.trim()) { toast({ title: "VIN is required", variant: "destructive" }); return; }
    if (!form.priceMonthly || isNaN(parseFloat(form.priceMonthly))) {
      toast({ title: "Valid monthly price is required", variant: "destructive" }); return;
    }

    setSubmitting(true);
    try {
      const payload = {
        vin: form.vin.trim().toUpperCase(),
        type: form.type,
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        year: form.year.trim() || null,
        priceMonthly: Math.round(parseFloat(form.priceMonthly) * 100),
        engineHourRate: form.engineHourRate ? Math.round(parseFloat(form.engineHourRate) * 100) : null,
        status: form.status,
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        features: features.length > 0 ? JSON.stringify(features) : null,
      };

      let trailerId: string;

      if (isEdit) {
        await apiRequest("PATCH", `/api/admin/trailers/${id}`, payload);
        trailerId = id!;
      } else {
        const res = await apiRequest("POST", `/api/admin/trailers`, payload);
        const created = await res.json() as { id: string };
        trailerId = created.id;
      }

      // Sync new (local, unsaved) photos
      const unsavedPhotos = photos.filter(p => !p.id && p.url && !p.uploading);
      for (const p of unsavedPhotos) {
        await apiRequest("POST", `/api/admin/trailers/${trailerId}/photos`, {
          url: p.url,
          isPrimary: p.isPrimary,
          displayOrder: p.displayOrder,
        });
      }

      // Persist primary/order changes for already-saved photos
      const savedPhotos = photos.filter(p => !!p.id);
      for (const p of savedPhotos) {
        await apiRequest("PATCH", `/api/admin/photos/${p.id}`, {
          isPrimary: p.isPrimary,
          displayOrder: p.displayOrder,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/admin/trailers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trailers"] });

      toast({ title: isEdit ? "Trailer updated" : "Trailer created", description: "Changes saved." });
      navigate("/admin/inventory");
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Guards ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Skeleton className="h-8 w-48" /></div>;
  }
  if (!user || user.role !== "admin") { navigate("/login"); return null; }
  if (isEdit && loadingTrailers && !initialized) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-3xl mx-auto w-full px-4 py-12 space-y-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-8">
          <Link href="/admin/inventory">
            <Button variant="ghost" size="sm" className="text-muted-foreground gap-2 -ml-1">
              <ArrowLeft className="w-4 h-4" />
              Inventory
            </Button>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm font-semibold">{isEdit ? "Edit Trailer" : "Add Trailer"}</span>
        </div>

        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-black tracking-tight">
            {isEdit ? "Edit Trailer" : "Add New Trailer"}
          </h1>
          {isEdit && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                const a = document.createElement("a");
                a.href = `/api/admin/trailers/${id}/qr`;
                a.download = `trailer-${form.vin || id}-qr.png`;
                a.click();
              }}
            >
              <QrCode className="w-4 h-4" />
              Download QR
            </Button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* ── Basic Info ─────────────────────────────────────────────── */}
          <section className="bg-card border border-border rounded-xl p-6 space-y-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Basic Info</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="vin">VIN *</Label>
                <Input
                  id="vin"
                  value={form.vin}
                  onChange={e => setForm(f => ({ ...f, vin: e.target.value }))}
                  placeholder="1XPBDP9X0ND123456"
                  className="font-mono"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="type">Type *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRAILER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="make">Make</Label>
                <Input
                  id="make"
                  value={form.make}
                  onChange={e => setForm(f => ({ ...f, make: e.target.value }))}
                  placeholder="Utility, Wabash, Great Dane…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={form.model}
                  onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  placeholder="3000R, Duraplate…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  value={form.year}
                  onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                  placeholder="2022"
                  maxLength={4}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* ── Pricing ────────────────────────────────────────────────── */}
          <section className="bg-card border border-border rounded-xl p-6 space-y-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Pricing</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="priceMonthly">Monthly Rate (USD) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    id="priceMonthly"
                    value={form.priceMonthly}
                    onChange={e => setForm(f => ({ ...f, priceMonthly: e.target.value }))}
                    placeholder="2500"
                    className="pl-6"
                    required
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              {form.type === "reefer" && (
                <div className="space-y-1.5">
                  <Label htmlFor="engineHourRate">Engine Hour Rate (USD, optional)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      id="engineHourRate"
                      value={form.engineHourRate}
                      onChange={e => setForm(f => ({ ...f, engineHourRate: e.target.value }))}
                      placeholder="0.85"
                      className="pl-6"
                      type="number"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Per engine hour for reefer unit operation</p>
                </div>
              )}
            </div>
          </section>

          {/* ── Description & Features ─────────────────────────────────── */}
          <section className="bg-card border border-border rounded-xl p-6 space-y-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Description & Features</h2>

            <div className="space-y-1.5">
              <Label htmlFor="location">Yard / Location</Label>
              <Input
                id="location"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Martinsburg, WV"
              />
              <p className="text-xs text-muted-foreground">The yard or city where this trailer is based.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="One or two factual lines: length, reefer unit, floor, doors, build date…"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Shown under the headline on the public card. Keep it to specs a renter can verify; skip condition
                adjectives ("clean", "good condition"), branding notes, plate numbers and anything the headline or
                status already says.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Features</Label>
              <p className="text-xs text-muted-foreground">
                One spec per entry, e.g. "53 ft", "Thermo King reefer unit", "Aluminum T-floor", "Roll-up rear door".
              </p>
              <div className="flex gap-2">
                <Input
                  value={newFeature}
                  onChange={e => setNewFeature(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const v = newFeature.trim();
                      if (v && !features.includes(v)) setFeatures(f => [...f, v]);
                      setNewFeature("");
                    }
                  }}
                  placeholder="e.g. Thermo King unit, E-track flooring…"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1 flex-shrink-0"
                  onClick={() => {
                    const v = newFeature.trim();
                    if (v && !features.includes(v)) setFeatures(f => [...f, v]);
                    setNewFeature("");
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Add
                </Button>
              </div>
              {features.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {features.map((feat, i) => (
                    <li key={i} className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2 text-sm">
                      <span>{feat}</span>
                      <button
                        type="button"
                        onClick={() => setFeatures(f => f.filter((_, fi) => fi !== i))}
                        className="text-muted-foreground hover:text-destructive ml-2"
                        aria-label="Remove feature"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* ── Photos ─────────────────────────────────────────────────── */}
          <section className="bg-card border border-border rounded-xl p-6 space-y-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Photos</h2>
            <p className="text-xs text-muted-foreground">
              Upload files (requires Cloudinary) or paste image URLs. Hover a photo to set it as primary (★) or remove it.
            </p>

            {/* Upload + URL row */}
            <div className="flex flex-wrap gap-3">
              <input
                type="file"
                ref={fileRef}
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-4 h-4" />
                Upload File
              </Button>

              <div className="flex flex-1 min-w-[200px] gap-2">
                <Input
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPhotoByUrl(); }}}
                  placeholder="Or paste image URL…"
                  className="flex-1"
                />
                <Button type="button" variant="outline" className="gap-2 flex-shrink-0" onClick={addPhotoByUrl}>
                  <LinkIcon className="w-4 h-4" />
                  Add
                </Button>
              </div>
            </div>

            {/* Photo grid */}
            {photos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((photo, idx) => (
                  <div
                    key={idx}
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-colors ${
                      photo.isPrimary ? "border-primary" : "border-border"
                    }`}
                  >
                    {photo.uploading ? (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : photo.url ? (
                      <img src={photo.url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <ImageOff className="w-6 h-6 text-muted-foreground/30" />
                      </div>
                    )}

                    {/* Overlay controls */}
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/50 transition-colors flex items-center justify-center gap-2 opacity-0 hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setPrimary(idx)}
                        className="p-1.5 rounded-full bg-black/70 text-white hover:bg-primary transition-colors"
                        title={photo.isPrimary ? "Primary photo" : "Set as primary"}
                      >
                        {photo.isPrimary ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="p-1.5 rounded-full bg-black/70 text-white hover:bg-destructive transition-colors"
                        title="Remove photo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {photo.isPrimary && (
                      <div className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded uppercase tracking-wide pointer-events-none">
                        Primary
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-border rounded-xl py-10 flex flex-col items-center gap-3 text-muted-foreground cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-8 h-8 opacity-40" />
                <p className="text-sm">Click to upload or paste a URL above</p>
                <p className="text-xs opacity-60">PNG, JPG, WebP up to 10 MB</p>
              </div>
            )}
          </section>

          {/* ── Submit ────────────────────────────────────────────────── */}
          <div className="flex items-center gap-4">
            <Button
              type="submit"
              size="lg"
              className="bg-primary hover:bg-primary/90 text-white font-bold gap-2 h-12 px-8"
              disabled={submitting || photos.some(p => p.uploading)}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Trailer"}
            </Button>
            <Link href="/admin/inventory">
              <Button variant="ghost" size="lg" type="button" className="text-muted-foreground">
                Cancel
              </Button>
            </Link>
          </div>

          {/* ── Audit Trail (edit mode only) ───────────────────────────── */}
          {isEdit && (
            <section className="pt-2">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Trailer Audit Trail</h3>
                <span className="text-xs text-muted-foreground">({auditLogs?.length ?? 0} entries)</span>
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {!auditLogs ? (
                  <div className="p-4 space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-4 w-full" />)}
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    No audit events recorded for this trailer yet.
                  </div>
                ) : (
                  <div className="divide-y divide-border/50 max-h-72 overflow-y-auto">
                    {auditLogs.map(log => (
                      <div key={log.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-secondary/20 transition-colors">
                        <div className="flex items-center gap-1 text-muted-foreground min-w-[120px] pt-0.5">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          <span className="text-[10px] tabular-nums">
                            {new Date(log.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                            {" "}
                            {new Date(log.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] bg-secondary/40 px-1.5 py-0.5 rounded text-foreground/70 whitespace-nowrap">
                          {log.actionType}
                        </span>
                        <span className="text-xs text-foreground/90 flex-1">{log.description}</span>
                        {log.actorName && (
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{log.actorName}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </form>
      </div>
    </div>
  );
}

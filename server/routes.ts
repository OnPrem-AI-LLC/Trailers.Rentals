import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import QRCode from "qrcode";
import { storage, type UpdateRental } from "./storage";
import type Stripe from 'stripe';
import { getUncachableStripeClient, getStripePublishableKey, getStripeSecretKey } from "./stripeClient";
import {
  insertRentalApplicationSchema,
  insertTrailerSchema,
  insertTrailerPhotoSchema,
  loginSchema,
  insertUserSchema,
  insertAdminNoteSchema,
  insertContactSchema,
  insertTestimonialSchema,
  type RentalApplication,
  type Rental,
} from "@shared/schema";
import { requireAuth, requireAdmin, requireRenter } from "./auth";
import { uploadToCloudinary, uploadRawToCloudinary, isCloudinaryConfigured } from "./cloudinary";
import {
  sendAdminApplicationAlert,
  sendRenterAcknowledgment,
  sendRejectionEmail,
  sendCOIRequest,
  sendMoreInfoRequest,
  sendInviteEmail,
  sendAgreementSignedEmails,
  sendContactFormEmail,
  sendPasswordResetEmail,
} from "./email-service";
import { lookupByDot, lookupByMc } from "./safer";
import { logAuditEvent } from "./audit-service";
import { COMPANY } from "@shared/constants";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function getBaseUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ── Auth ────────────────────────────────────────────────────────────
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(username);
      if (!user || !user.isActive) return res.status(401).json({ message: "Invalid credentials" });
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ message: "Invalid credentials" });
      const payload = { id: user.id, email: user.username, firstName: user.firstName, lastName: user.lastName, role: user.role };
      req.session.regenerate((err) => {
        if (err) { console.error("[session] regenerate error:", err); return res.status(500).json({ message: "Session error" }); }
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.save((err) => {
          if (err) { console.error("[session] save error:", err); return res.status(500).json({ message: "Session error" }); }
          return res.json(payload);
        });
      });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => res.json({ success: true }));
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    return res.json({ id: user.id, email: user.username, firstName: user.firstName, lastName: user.lastName, role: user.role, companyId: user.companyId });
  });

  app.get("/api/my/company", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session!.userId!);
    if (!user?.companyId) return res.status(404).json({ message: "No company on file" });
    const company = await storage.getCompany(user.companyId);
    if (!company) return res.status(404).json({ message: "Company not found" });
    return res.json(company);
  });

  // ── Signup ──────────────────────────────────────────────────────────
  const signupSchema = insertUserSchema.pick({ username: true, password: true, firstName: true, lastName: true }).extend({
    username: z.string().email("Valid email required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
  });

  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const { username, password, firstName, lastName } = signupSchema.parse(req.body);
      const existing = await storage.getUserByEmail(username);
      if (existing) return res.status(409).json({ message: "An account with this email already exists" });
      const hashed = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ username, password: hashed, firstName, lastName, role: "renter", isActive: true });
      req.session.regenerate((err) => {
        if (err) { console.error("[session] regenerate error:", err); return res.status(500).json({ message: "Session error" }); }
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.save((err) => {
          if (err) { console.error("[session] save error:", err); return res.status(500).json({ message: "Session error" }); }
          return res.status(201).json({ id: user.id, email: user.username, firstName: user.firstName, lastName: user.lastName, role: user.role });
        });
      });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── File upload (Cloudinary) ─────────────────────────────────────────
  app.post("/api/admin/upload", requireAdmin, upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file provided" });
      if (!isCloudinaryConfigured()) {
        return res.status(503).json({
          message: "Image storage is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in environment variables."
        });
      }
      const url = await uploadToCloudinary(req.file.buffer);
      return res.json({ url });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Upload failed" });
    }
  });

  // ── Trailers (public) ───────────────────────────────────────────────
  app.get("/api/trailers", async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const filter = status ?? "public";
      const trailerList = await storage.getTrailers(filter === "public" ? undefined : filter, filter === "public");
      return res.json(trailerList);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/trailers/:id", async (req: Request, res: Response) => {
    try {
      const trailer = await storage.getTrailer(req.params.id);
      if (!trailer || trailer.status === "inactive") return res.status(404).json({ message: "Trailer not found" });
      return res.json(trailer);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Trailers (admin) ────────────────────────────────────────────────
  app.get("/api/admin/trailers", requireAdmin, async (req: Request, res: Response) => {
    try {
      const trailerList = await storage.getTrailers(undefined, false);
      return res.json(trailerList);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/trailers", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertTrailerSchema.parse(req.body);
      const trailer = await storage.createTrailer(data);
      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "create_trailer",
        entityType: "trailer",
        entityId: trailer.id,
        description: `Created trailer: ${trailer.vin} (${trailer.type})`,
        isAdminEntry: true,
      });
      return res.json(trailer);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/trailers/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const allowed = insertTrailerSchema.partial().parse(req.body);
      const before = await storage.getTrailer(req.params.id);
      if (!before) return res.status(404).json({ message: "Trailer not found" });
      const trailer = await storage.updateTrailer(req.params.id, allowed);
      if (!trailer) return res.status(404).json({ message: "Trailer not found" });
      const changedFields = Object.keys(allowed) as (keyof typeof allowed)[];
      const beforeSnapshot: Record<string, unknown> = {};
      const afterSnapshot: Record<string, unknown> = {};
      for (const k of changedFields) {
        beforeSnapshot[k] = (before as Record<string, unknown>)[k];
        afterSnapshot[k] = (allowed as Record<string, unknown>)[k];
      }
      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "update_trailer",
        entityType: "trailer",
        entityId: trailer.id,
        description: `Updated trailer: ${trailer.vin}`,
        metadata: { before: beforeSnapshot, after: afterSnapshot, fields: changedFields },
        isAdminEntry: true,
      });
      return res.json(trailer);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/trailers/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const trailer = await storage.updateTrailer(req.params.id, { status: "inactive" });
      if (!trailer) return res.status(404).json({ message: "Trailer not found" });
      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "retire_trailer",
        entityType: "trailer",
        entityId: trailer.id,
        description: `Retired trailer: ${trailer.vin}`,
        isAdminEntry: true,
      });
      return res.json({ success: true });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/trailers/:id/restore", requireAdmin, async (req: Request, res: Response) => {
    try {
      const trailer = await storage.updateTrailer(req.params.id, { status: "available" });
      if (!trailer) return res.status(404).json({ message: "Trailer not found" });
      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "restore_trailer",
        entityType: "trailer",
        entityId: trailer.id,
        description: `Restored trailer: ${trailer.vin}`,
        isAdminEntry: true,
      });
      return res.json(trailer);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Trailer Photos ───────────────────────────────────────────────────
  app.post("/api/admin/trailers/:id/photos", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { url, isPrimary, displayOrder } = insertTrailerPhotoSchema.omit({ trailerId: true }).parse(req.body);
      const photo = await storage.addTrailerPhoto({ trailerId: req.params.id, url, isPrimary: isPrimary ?? false, displayOrder: displayOrder ?? 0 });
      return res.json(photo);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/photos/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const updateSchema = z.object({ isPrimary: z.boolean().optional(), displayOrder: z.number().int().optional() });
      const data = updateSchema.parse(req.body);
      const photo = await storage.updateTrailerPhoto(req.params.id, data);
      if (!photo) return res.status(404).json({ message: "Photo not found" });
      return res.json(photo);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/photos/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const photo = await storage.getTrailerPhoto(req.params.id);
      if (photo?.url) {
        const { deleteFromCloudinary } = await import("./cloudinary");
        await deleteFromCloudinary(photo.url);
      }
      await storage.deleteTrailerPhoto(req.params.id);
      return res.json({ success: true });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── QR Code (trailer-level — resolves active rental's pickup token) ─────
  app.get("/api/admin/trailers/:id/qr", requireAdmin, async (req: Request, res: Response) => {
    try {
      const trailer = await storage.getTrailer(req.params.id);
      if (!trailer) return res.status(404).json({ message: "Trailer not found" });

      const rentals = await storage.listRentals();
      const activeRental = rentals.find(
        (r: { trailerId: string; pickupToken: string | null; status: string }) =>
          r.trailerId === trailer.id && r.pickupToken && ["active", "active_in_use"].includes(r.status)
      );
      if (!activeRental?.pickupToken) {
        return res.status(404).json({ message: "No active rental with a pickup token found for this trailer" });
      }

      const domainUrl = process.env.APP_URL || "https://deluxelogistics.com";
      const pickupUrl = `${domainUrl}/pickup/${activeRental.pickupToken}`;

      const qrBuffer = await QRCode.toBuffer(pickupUrl, {
        type: "png",
        width: 400,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `attachment; filename="trailer-${trailer.vin}-pickup-qr.png"`);
      return res.send(qrBuffer);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── QR Code download for rental (pickup or return) ────────────────────
  app.get("/api/admin/rentals/:id/qr/:type", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });

      const qrType = req.params.type;
      if (qrType !== "pickup" && qrType !== "return") {
        return res.status(400).json({ message: "Invalid QR type. Must be 'pickup' or 'return'" });
      }
      const token = qrType === "return" ? rental.returnToken : rental.pickupToken;
      if (!token) return res.status(404).json({ message: `No ${qrType} token generated for this rental` });

      const domainUrl = process.env.APP_URL || "https://deluxelogistics.com";
      const path = qrType === "return" ? "return" : "pickup";
      const url = `${domainUrl}/${path}/${token}`;

      const qrBuffer = await QRCode.toBuffer(url, {
        type: "png",
        width: 400,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `attachment; filename="rental-${rental.id.slice(-8)}-${qrType}-qr.png"`);
      return res.send(qrBuffer);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin Notes ──────────────────────────────────────────────────────
  app.get("/api/admin/notes/:entityType/:entityId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const notes = await storage.getAdminNotes(req.params.entityType, req.params.entityId);
      return res.json(notes);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/notes", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertAdminNoteSchema.parse({ ...req.body, authorId: req.session.userId });
      const note = await storage.createAdminNote(data);

      // Audit log for note creation on rental applications
      if (data.entityType === "rental_application") {
        await logAuditEvent({
          req,
          userId: req.session.userId!,
          actionType: "note_added",
          entityType: "rental_application",
          entityId: data.entityId,
          description: `Admin added an internal note`,
          isAdminEntry: true,
        });
      }

      return res.json(note);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/notes/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteAdminNote(req.params.id);
      return res.json({ success: true });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Renter/Admin Message Thread (admin notes scoped to rental) ───────
  // Renters can view messages on their own rentals; admin can post from admin UI

  app.get("/api/rentals/:id/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      // Admins can see any rental; renters can only see their own
      if (user.role !== "admin" && user.companyId !== rental.companyId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const notes = await storage.getAdminNotes("rental", req.params.id);
      return res.json(notes);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/rentals/:id/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const bodySchema = z.object({ body: z.string().min(1, "Message cannot be empty").max(1000) });
      const { body } = bodySchema.parse(req.body);
      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      // Renters can only post on their own rentals
      if (user.role !== "admin" && user.companyId !== rental.companyId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const note = await storage.createAdminNote({
        authorId: user.id,
        entityType: "rental",
        entityId: req.params.id,
        body,
        isPinned: false,
      });
      await logAuditEvent({
        req,
        userId: user.id,
        actionType: "rental_message_sent",
        entityType: "rental",
        entityId: req.params.id,
        description: `${user.role === "admin" ? "Admin" : "Renter"} sent message on rental ${req.params.id}`,
        isAdminEntry: user.role === "admin",
      });
      return res.status(201).json(note);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Also expose note authors (so we can show names in thread) via admin notes author lookup
  app.get("/api/admin/notes/author/:userId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      return res.json({ id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Rental Applications — public submission ──────────────────────────
  app.post("/api/applications", async (req: Request, res: Response) => {
    try {
      const data = insertRentalApplicationSchema.parse(req.body);
      const adminToken = randomBytes(32).toString("hex");
      const renterToken = randomBytes(32).toString("hex");
      const application = await storage.createRentalApplication({ ...data, adminToken, renterToken, status: "pending" });

      // Fetch trailer for email context
      let trailerVin: string | undefined;
      let trailerType: string | undefined;
      let trailerName: string | undefined;
      let priceMonthly: number | undefined;
      try {
        const trailer = await storage.getTrailer(application.trailerId);
        trailerVin = trailer?.vin ?? undefined;
        trailerType = trailer?.type;
        priceMonthly = trailer?.priceMonthly;
        if (trailer) {
          const typeLabels: Record<string, string> = {
            dry_van: "Dry Van", reefer: "Refrigerated", flatbed: "Flatbed",
            chassis: "Chassis", specialized: "Specialized", tractor: "Tractor",
            box_truck: "Box Truck", trailer_jockey: "Trailer Jockey",
          };
          trailerName = trailer.make && trailer.model
            ? `${trailer.year || ""} ${trailer.make} ${trailer.model}`.trim()
            : `${typeLabels[trailer.type] || trailer.type} Trailer`;
        }
      } catch { /* non-fatal */ }

      const appData = {
        id: application.id,
        adminToken: application.adminToken,
        renterToken: application.renterToken,
        companyName: application.companyName,
        ownerName: application.ownerName,
        email: application.email,
        phone: application.phone,
        dotNumber: application.dotNumber,
        mcNumber: application.mcNumber,
        intendedUse: application.intendedUse,
        intendedUseDetails: application.intendedUseDetails,
        authorizedUser: application.authorizedUser,
        trailerVin,
        trailerType,
        trailerName,
        priceMonthly,
      };

      // Fire emails — non-fatal if SendGrid fails
      await Promise.allSettled([
        sendAdminApplicationAlert(appData),
        sendRenterAcknowledgment(appData),
      ]);

      await logAuditEvent({
        req,
        actionType: "application_submitted",
        entityType: "rental_application",
        entityId: application.id,
        description: `New rental application from ${application.companyName} (DOT: ${application.dotNumber})`,
        isAdminEntry: false,
      });

      return res.json({ success: true, id: application.id });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin token magic-link: read-only application view (no session needed) ──
  app.get("/api/applications/admin-token/:adminToken", async (req: Request, res: Response) => {
    try {
      let application = await storage.getRentalApplicationByToken(req.params.adminToken);
      if (!application) return res.status(404).json({ message: "Invalid or expired token" });

      // Auto-trigger SAFER lookup on first visit (same behaviour as session-based endpoint)
      if (!application.saferData && application.dotNumber) {
        try {
          let saferResult = await lookupByDot(application.dotNumber);
          // MC fallback: if DOT lookup failed and an MC number is on file, try by MC
          if (!saferResult.success && application.mcNumber) {
            const mcResult = await lookupByMc(application.mcNumber);
            if (mcResult.success) saferResult = mcResult;
          }
          const updated = await storage.updateRentalApplication(application.id, {
            saferData: JSON.stringify(saferResult),
          });
          if (updated) application = updated;
        } catch { /* non-fatal */ }
      }

      // Fetch associated data
      const [notes, auditLogs] = await Promise.all([
        storage.getAdminNotes("rental_application", application.id),
        storage.getAuditLogs("rental_application", application.id),
      ]);

      // Omit sensitive tokens from response
      const { adminToken: _a, renterToken: _r, ...safeApp } = application;
      return res.json({ application: safeApp, notes, auditLogs });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Public: renter response info (keyed by renterToken, not bare ID) ──
  app.get("/api/applications/respond/:renterToken/info", async (req: Request, res: Response) => {
    try {
      const application = await storage.getRentalApplicationByRenterToken(req.params.renterToken);
      if (!application) return res.status(404).json({ message: "Application not found" });
      return res.json({
        id: application.id,
        companyName: application.companyName,
        ownerName: application.ownerName,
        status: application.status,
      });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Public: get questions for renter response page (keyed by renterToken) ──
  app.get("/api/applications/respond/:renterToken/questions", async (req: Request, res: Response) => {
    try {
      const application = await storage.getRentalApplicationByRenterToken(req.params.renterToken);
      if (!application || application.status !== "needs_info") {
        return res.json([]);
      }
      const notes = await storage.getAdminNotes("rental_application", application.id);
      const questions = notes
        .filter((n) => n.body.startsWith("[More Info Request]"))
        .map((n) => ({ body: n.body, createdAt: n.createdAt }));
      return res.json(questions);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Public: renter submits response (keyed by renterToken) ──────────
  const renterResponseSchema = z.object({ response: z.string().min(1, "Response required") });

  app.post("/api/applications/respond/:renterToken", async (req: Request, res: Response) => {
    try {
      const { response } = renterResponseSchema.parse(req.body);
      const application = await storage.getRentalApplicationByRenterToken(req.params.renterToken);
      if (!application) return res.status(404).json({ message: "Application not found" });
      if (application.status !== "needs_info") {
        return res.status(400).json({ message: "No additional information is currently required for this application." });
      }

      await storage.createAdminNote({
        authorId: "renter", // explicit external-responder marker (no portal user on renter side)
        entityType: "rental_application",
        entityId: application.id,
        body: `[Renter Reply] ${response}`,
        isPinned: false,
      });

      await logAuditEvent({
        req,
        actionType: "renter_replied",
        entityType: "rental_application",
        entityId: application.id,
        description: `Renter (${application.companyName}) submitted a response to more-info request`,
        isAdminEntry: false,
      });

      return res.json({ success: true });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: list applications ─────────────────────────────────────────
  app.get("/api/admin/applications", requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const applications = await storage.listRentalApplications(status);
      const enriched = await Promise.all(
        applications.map(async (app) => {
          const trailer = await storage.getTrailer(app.trailerId).catch(() => undefined);
          return {
            ...app,
            trailerType: trailer?.type ?? null,
            trailerName: trailer
              ? (trailer.make && trailer.model
                  ? `${trailer.year || ""} ${trailer.make} ${trailer.model}`.trim()
                  : trailer.type)
              : null,
            trailerVin: trailer?.vin ?? null,
          };
        })
      );
      return res.json(enriched);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: get single application (auto-runs SAFER lookup) ──────────
  app.get("/api/admin/applications/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const application = await storage.getRentalApplication(req.params.id);
      if (!application) return res.status(404).json({ message: "Application not found" });

      const trailer = await storage.getTrailer(application.trailerId).catch(() => undefined);
      const trailerInfo = {
        trailerType: trailer?.type ?? null,
        trailerName: trailer
          ? (trailer.make && trailer.model
              ? `${trailer.year || ""} ${trailer.make} ${trailer.model}`.trim()
              : trailer.type)
          : null,
        trailerVin: trailer?.vin ?? null,
        trailerPriceMonthly: trailer?.priceMonthly ?? null,
        trailerLocation: trailer?.location ?? null,
        trailerPrimaryPhoto: trailer?.photos?.find(p => p.isPrimary)?.url ?? trailer?.photos?.[0]?.url ?? null,
      };

      // Auto-run SAFER if not cached (DOT first, MC fallback)
      if (!application.saferData && application.dotNumber) {
        try {
          let safer = await lookupByDot(application.dotNumber);
          if (!safer.success && application.mcNumber) {
            const mcResult = await lookupByMc(application.mcNumber);
            if (mcResult.success) safer = mcResult;
          }
          const saferJson = JSON.stringify(safer);
          await storage.updateRentalApplication(application.id, { saferData: saferJson });
          return res.json({ ...application, ...trailerInfo, saferData: saferJson });
        } catch { /* non-fatal: return without SAFER */ }
      }

      return res.json({ ...application, ...trailerInfo });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: general update ────────────────────────────────────────────
  const applicationUpdateSchema = z.object({
    status: z.enum(["pending", "approved", "rejected", "needs_info"]).optional(),
    adminNotes: z.string().optional(),
    saferData: z.string().optional(),
  });

  app.patch("/api/admin/applications/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const updates = applicationUpdateSchema.parse(req.body);
      const application = await storage.updateRentalApplication(req.params.id, updates);
      if (!application) return res.status(404).json({ message: "Application not found" });
      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: `application_${updates.status ?? "updated"}`,
        entityType: "rental_application",
        entityId: application.id,
        description: `Application ${updates.status ? `status → ${updates.status}` : "updated"}`,
        metadata: updates as Record<string, unknown>,
        isAdminEntry: true,
      });
      return res.json(application);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: approve ───────────────────────────────────────────────────
  app.post("/api/admin/applications/:id/approve", requireAdmin, async (req: Request, res: Response) => {
    try {
      const application = await storage.getRentalApplication(req.params.id);
      if (!application) return res.status(404).json({ message: "Application not found" });

      // Create or find company record
      let company = application.companyId ? await storage.getCompany(application.companyId) : undefined;
      if (!company) {
        company = await storage.createCompany({
          name: application.companyName,
          ownerName: application.ownerName,
          authorizedUser: application.authorizedUser ?? undefined,
          email: application.email,
          mcNumber: application.mcNumber ?? undefined,
          dotNumber: application.dotNumber,
          phone: application.phone,
        });
      }

      // Create or update stub user for renter invite
      // Guard: if user is already active (registered), do not deactivate or re-send invite
      let renterUser = await storage.getUserByEmail(application.email);
      let inviteToken: string;
      const inviteExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

      if (!renterUser) {
        inviteToken = randomBytes(32).toString("hex");
        renterUser = await storage.createUser({
          username: application.email,
          password: "", // placeholder until registration complete
          firstName: application.ownerName.split(" ")[0] || application.ownerName,
          lastName: application.ownerName.split(" ").slice(1).join(" ") || "",
          role: "renter",
          isActive: false,
          companyId: company.id,
          inviteToken,
          inviteExpiry,
        });
      } else if (!renterUser.isActive) {
        // User exists but hasn't completed registration — re-issue invite token safely
        inviteToken = randomBytes(32).toString("hex");
        renterUser = await storage.updateUser(renterUser.id, {
          companyId: company.id,
          isActive: false,
          inviteToken,
          inviteExpiry,
        }) ?? renterUser;
      } else {
        // User is already active — do not deactivate or overwrite their token
        // Just ensure company linkage is correct
        inviteToken = renterUser.inviteToken ?? randomBytes(32).toString("hex");
        if (renterUser.companyId !== company.id) {
          await storage.updateUser(renterUser.id, { companyId: company.id });
        }
      }

      // Update application status and link company
      const updated = await storage.updateRentalApplication(application.id, {
        status: "approved",
        companyId: company.id,
      });

      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "application_approved",
        entityType: "rental_application",
        entityId: application.id,
        description: `Application approved for ${application.companyName} — invite sent to ${application.email}`,
        metadata: { companyId: company.id, userId: renterUser.id },
        isAdminEntry: true,
      });

      // Send invite email (non-fatal)
      sendInviteEmail(application.email, application.ownerName, inviteToken, application.id)
        .catch((e: unknown) => console.warn("[email] invite send failed:", e));

      return res.json(updated);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: reject ────────────────────────────────────────────────────
  const rejectSchema = z.object({ reason: z.string().optional() });

  app.post("/api/admin/applications/:id/reject", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { reason } = rejectSchema.parse(req.body);
      const application = await storage.getRentalApplication(req.params.id);
      if (!application) return res.status(404).json({ message: "Application not found" });

      const updated = await storage.updateRentalApplication(application.id, {
        status: "rejected",
        adminNotes: reason || application.adminNotes,
      });

      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "application_rejected",
        entityType: "rental_application",
        entityId: application.id,
        description: `Application rejected for ${application.companyName}${reason ? `: ${reason}` : ""}`,
        isAdminEntry: true,
      });

      await sendRejectionEmail({
        id: application.id,
        companyName: application.companyName,
        ownerName: application.ownerName,
        email: application.email,
        phone: application.phone,
        dotNumber: application.dotNumber,
        mcNumber: application.mcNumber,
        intendedUse: application.intendedUse,
      }, reason).catch((e: unknown) => console.warn("[email] rejection send failed:", e));

      return res.json(updated);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: request more info ─────────────────────────────────────────
  const needsInfoSchema = z.object({ message: z.string().min(1, "Message required") });

  app.post("/api/admin/applications/:id/needs-info", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { message } = needsInfoSchema.parse(req.body);
      const application = await storage.getRentalApplication(req.params.id);
      if (!application) return res.status(404).json({ message: "Application not found" });

      const updated = await storage.updateRentalApplication(application.id, { status: "needs_info" });

      // Store as admin note for the thread
      await storage.createAdminNote({
        authorId: req.session.userId!,
        entityType: "rental_application",
        entityId: application.id,
        body: `[More Info Request] ${message}`,
        isPinned: false,
      });

      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "application_needs_info",
        entityType: "rental_application",
        entityId: application.id,
        description: `More info requested from ${application.companyName}`,
        metadata: { message },
        isAdminEntry: true,
      });

      await sendMoreInfoRequest({
        id: application.id,
        renterToken: application.renterToken,
        companyName: application.companyName,
        ownerName: application.ownerName,
        email: application.email,
        phone: application.phone,
        dotNumber: application.dotNumber,
        mcNumber: application.mcNumber,
        intendedUse: application.intendedUse,
      }, message).catch((e: unknown) => console.warn("[email] more-info send failed:", e));

      return res.json(updated);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: send COI request ──────────────────────────────────────────
  app.post("/api/admin/applications/:id/coi-request", requireAdmin, async (req: Request, res: Response) => {
    try {
      const application = await storage.getRentalApplication(req.params.id);
      if (!application) return res.status(404).json({ message: "Application not found" });

      await storage.createAdminNote({
        authorId: req.session.userId!,
        entityType: "rental_application",
        entityId: application.id,
        body: "[COI Request] Certificate of Insurance request sent to renter.",
        isPinned: false,
      });

      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "application_coi_requested",
        entityType: "rental_application",
        entityId: application.id,
        description: `COI request sent to ${application.companyName}`,
        isAdminEntry: true,
      });

      await sendCOIRequest({
        id: application.id,
        companyName: application.companyName,
        ownerName: application.ownerName,
        email: application.email,
        phone: application.phone,
        dotNumber: application.dotNumber,
        mcNumber: application.mcNumber,
        intendedUse: application.intendedUse,
      }).catch((e: unknown) => console.warn("[email] COI send failed:", e));

      return res.json({ success: true });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: re-run SAFER lookup ───────────────────────────────────────
  app.post("/api/admin/applications/:id/safer-refresh", requireAdmin, async (req: Request, res: Response) => {
    try {
      const application = await storage.getRentalApplication(req.params.id);
      if (!application) return res.status(404).json({ message: "Application not found" });
      if (!application.dotNumber) return res.status(400).json({ message: "No DOT number on application" });

      let safer = await lookupByDot(application.dotNumber);
      // MC fallback: if DOT lookup failed and an MC number is on file, try by MC
      if (!safer.success && application.mcNumber) {
        const mcResult = await lookupByMc(application.mcNumber);
        if (mcResult.success) safer = mcResult;
      }
      const saferJson = JSON.stringify(safer);
      await storage.updateRentalApplication(application.id, { saferData: saferJson });

      await logAuditEvent({
        req,
        userId: req.session.userId,
        actionType: "safer_refreshed",
        entityType: "rental_application",
        entityId: application.id,
        description: `Admin manually refreshed FMCSA SAFER data (${safer.success ? "success" : "failed"})`,
        isAdminEntry: true,
      });

      return res.json({ saferData: saferJson, parsed: safer });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: global audit log — server-side filtered + paginated + enriched ──
  app.get("/api/admin/audit", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { entityType, entityId, actionType, userId, from, to, search, limit, offset } = req.query as Record<string, string | undefined>;

      const pageSize = Math.min(parseInt(limit ?? "50", 10), 500);
      const pageOffset = parseInt(offset ?? "0", 10);

      const fromDate = from ? new Date(from) : undefined;
      const toDate = to ? (() => { const d = new Date(to); d.setHours(23, 59, 59, 999); return d; })() : undefined;

      const [{ logs, total }, allUsers] = await Promise.all([
        storage.getAuditLogsFiltered({
          entityType,
          entityId,
          actionType,
          userId,
          from: fromDate,
          to: toDate,
          search: search?.trim() || undefined,
          limit: pageSize,
          offset: pageOffset,
        }),
        storage.listUsers().catch(() => []),
      ]);

      const userMap = new Map<string, string>(
        allUsers.map(u => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.username])
      );

      const enriched = logs.map(l => ({
        ...l,
        actorName: l.userId ? (userMap.get(l.userId) ?? "Unknown User") : "System",
      }));

      return res.json({ logs: enriched, total });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: audit logs for an entity (enriched with actor name) ───────
  app.get("/api/admin/audit/:entityType/:entityId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const logs = await storage.getAuditLogs(req.params.entityType, req.params.entityId);
      const allUsers = await storage.listUsers().catch(() => []);
      const userMap = new Map<string, string>(
        allUsers.map(u => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.username])
      );
      const enriched = logs.map(l => ({
        ...l,
        actorName: l.userId ? (userMap.get(l.userId) ?? "Unknown User") : "System",
      }));
      return res.json(enriched);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: user management ───────────────────────────────────────────
  app.get("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const all = await storage.listUsers();
      return res.json(all.map(u => ({
        id: u.id,
        email: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
      })));
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/invite", requireAdmin, async (req: Request, res: Response) => {
    try {
      const inviteSchema = z.object({
        email: z.string().email("Valid email required"),
        firstName: z.string().min(1, "First name required"),
        lastName: z.string().min(1, "Last name required"),
        role: z.enum(["admin", "renter"]).default("admin"),
      });
      const { email, firstName, lastName, role } = inviteSchema.parse(req.body);
      const existing = await storage.getUserByEmail(email);
      if (existing) return res.status(409).json({ message: "User with this email already exists" });
      const inviteToken = randomBytes(32).toString("hex");
      const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const user = await storage.createUser({
        username: email,
        password: randomBytes(32).toString("hex"), // placeholder; set on accept
        firstName,
        lastName,
        role,
        isActive: false, // activated when they set password
        inviteToken,
        inviteExpiry,
      });
      if (role === "admin") {
        const { sendAdminSetupEmail } = await import("./email-service");
        await sendAdminSetupEmail({ email, firstName, lastName, inviteToken }).catch(console.error);
      } else {
        const { sendInviteEmail } = await import("./email-service");
        await sendInviteEmail(email, `${firstName} ${lastName}`, inviteToken).catch(console.error);
      }
      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "admin_user_invited",
        entityType: "user",
        entityId: user.id,
        description: `Admin invited ${role} user: ${email} (${firstName} ${lastName})`,
        metadata: { role, email },
        isAdminEntry: true,
      });
      return res.status(201).json({ id: user.id, email, firstName, lastName, role, isActive: false });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/users/:id/deactivate", requireAdmin, async (req: Request, res: Response) => {
    try {
      if (req.params.id === req.session.userId) {
        return res.status(400).json({ message: "You cannot deactivate your own account" });
      }
      const target = await storage.getUser(req.params.id);
      if (!target) return res.status(404).json({ message: "User not found" });
      const newActive = !target.isActive;
      if (newActive && target.inviteToken) {
        return res.status(400).json({ message: "Cannot reactivate an account with a pending invite. The user must complete registration first." });
      }
      const updated = await storage.updateUser(req.params.id, { isActive: newActive });
      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: newActive ? "admin_user_reactivated" : "admin_user_deactivated",
        entityType: "user",
        entityId: req.params.id,
        description: `Admin ${newActive ? "reactivated" : "deactivated"} user: ${target.username}`,
        metadata: { targetEmail: target.username, newState: newActive ? "active" : "inactive" },
        isAdminEntry: true,
      });
      return res.json({ id: updated!.id, email: updated!.username, isActive: updated!.isActive });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin dashboard ─────────────────────────────────────────────────
  app.get("/api/admin/dashboard", requireAdmin, async (req: Request, res: Response) => {
    try {
      const allTrailers = await storage.getTrailers(undefined, false);
      const pendingApps = await storage.listRentalApplications("pending");
      const allRentals = await storage.listRentals();
      const activeRentals = allRentals.filter(r => r.status === "active" || r.status === "active_in_use");
      const mrr = activeRentals.reduce((sum, r) => sum + r.monthlyRate, 0);
      const pendingPickups = activeRentals.filter(r => !r.pickupConfirmedAt).length;
      return res.json({
        totalTrailers: allTrailers.filter(t => t.status !== "inactive").length,
        availableTrailers: allTrailers.filter(t => t.status === "available").length,
        rentedTrailers: allTrailers.filter(t => t.status === "rented").length,
        pendingApplications: pendingApps.length,
        activeRentals: activeRentals.length,
        mrr,
        pendingPickups,
        utilizationRate: allTrailers.filter(t => t.status !== "inactive").length > 0
          ? Math.round((allTrailers.filter(t => t.status === "rented").length / allTrailers.filter(t => t.status !== "inactive").length) * 100)
          : 0,
      });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/admin/fmcsa — standalone FMCSA SAFER lookup for admin portal
  app.get("/api/admin/fmcsa", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { dot, mc } = req.query as { dot?: string; mc?: string };
      if (!dot && !mc) return res.status(400).json({ message: "Provide dot or mc query param" });
      let result = null;
      if (dot) result = await lookupByDot(dot.trim());
      if ((!result || !result.success) && mc) result = await lookupByMc(mc.trim());
      return res.json(result ?? { success: false, error: "No result found" });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "FMCSA lookup failed" });
    }
  });

  // ── Renter dashboard ────────────────────────────────────────────────
  app.get("/api/dashboard", requireRenter, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      const [userRentals, userDocs, company, rawApplications] = await Promise.all([
        user.companyId ? storage.listRentals(user.companyId) : Promise.resolve([] as Rental[]),
        user.companyId ? storage.getDocuments(user.companyId) : Promise.resolve([]),
        user.companyId ? storage.getCompany(user.companyId) : Promise.resolve(undefined),
        storage.listRentalApplicationsByEmail(user.username),
      ]);

      // Enrich each application with trailer info, renter-visible notes, and audit history
      const applications = await Promise.all(
        rawApplications.map(async (app) => {
          const [trailer, notes, auditLogs] = await Promise.all([
            storage.getTrailer(app.trailerId).catch(() => undefined),
            storage.getAdminNotes("rental_application", app.id),
            storage.getAuditLogs("rental_application", app.id),
          ]);
          return {
            ...app,
            // Strip sensitive server-only fields
            adminToken: undefined,
            saferData: undefined,
            trailer: trailer
              ? {
                  id: trailer.id,
                  vin: trailer.vin,
                  type: trailer.type,
                  make: trailer.make,
                  model: trailer.model,
                  year: trailer.year,
                  priceMonthly: trailer.priceMonthly,
                  location: trailer.location,
                  primaryPhoto: trailer.photos?.find(p => p.isPrimary)?.url ?? trailer.photos?.[0]?.url ?? null,
                }
              : null,
            notes: notes,
            auditHistory: auditLogs.filter(l => !l.isAdminEntry).map(l => ({
              id: l.id,
              actionType: l.actionType,
              description: l.description,
              createdAt: l.createdAt,
            })),
          };
        })
      );

      return res.json({
        user: { id: user.id, email: user.username, firstName: user.firstName, lastName: user.lastName, role: user.role, companyId: user.companyId },
        rentals: userRentals,
        documents: userDocs.filter(d => !d.isAdminOnly),
        company: company ?? null,
        applications,
      });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin invite token lookup (public) ─────────────────────────────
  app.get("/api/admin-invite/:token", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByInviteToken(req.params.token);
      if (!user) return res.status(404).json({ message: "Invalid or expired invite link" });
      if (user.inviteExpiry && user.inviteExpiry < new Date()) {
        return res.status(410).json({ message: "This invite link has expired. Contact the admin for a new one." });
      }
      if (user.role !== "admin") {
        return res.status(403).json({ message: "This link is not for an admin invite." });
      }
      return res.json({ email: user.username, firstName: user.firstName, lastName: user.lastName });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Activate admin account via invite (public) ───────────────────────
  const adminActivateSchema = z.object({
    inviteToken: z.string().min(1),
    password: z.string().min(8, "Password must be at least 8 characters"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
  });

  app.post("/api/auth/admin-activate", async (req: Request, res: Response) => {
    try {
      const { inviteToken, password, firstName, lastName } = adminActivateSchema.parse(req.body);
      const user = await storage.getUserByInviteToken(inviteToken);
      if (!user) return res.status(404).json({ message: "Invalid or expired invite link" });
      if (user.inviteExpiry && user.inviteExpiry < new Date()) {
        return res.status(410).json({ message: "This invite link has expired." });
      }
      if (user.role !== "admin") {
        return res.status(403).json({ message: "This link is not for an admin invite." });
      }

      const hashed = await bcrypt.hash(password, 10);
      const updated = await storage.updateUser(user.id, {
        password: hashed,
        firstName,
        lastName,
        isActive: true,
        inviteToken: null,
        inviteExpiry: null,
      });
      if (!updated) return res.status(500).json({ message: "Failed to activate account" });

      await logAuditEvent({
        req,
        userId: updated.id,
        actionType: "admin_account_activated",
        entityType: "user",
        entityId: updated.id,
        description: `Admin account activated for ${updated.username}`,
        isAdminEntry: true,
      });

      const adminPayload = { id: updated.id, email: updated.username, firstName: updated.firstName, lastName: updated.lastName, role: updated.role };
      req.session.regenerate((err) => {
        if (err) { console.error("[session] regenerate error:", err); return res.status(500).json({ message: "Session error" }); }
        req.session.userId = updated.id;
        req.session.userRole = updated.role;
        req.session.save((err) => {
          if (err) { console.error("[session] save error:", err); return res.status(500).json({ message: "Session error" }); }
          return res.json(adminPayload);
        });
      });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Invite validation (public) ──────────────────────────────────────
  app.get("/api/invite/:token", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByInviteToken(req.params.token);
      if (!user) return res.status(404).json({ message: "Invalid or expired invite link" });
      if (user.inviteExpiry && user.inviteExpiry < new Date()) {
        return res.status(410).json({ message: "This invite link has expired. Please contact Deluxe Logistics for a new invite." });
      }
      // Return just enough info for pre-filling the registration form
      const company = user.companyId ? await storage.getCompany(user.companyId) : null;
      return res.json({
        email: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        companyName: company?.name ?? "",
      });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Complete registration via invite (public) ───────────────────────
  const registerInviteSchema = z.object({
    inviteToken: z.string().min(1),
    password: z.string().min(8, "Password must be at least 8 characters"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    driverLicenseNumber: z.string().min(1, "Driver's license number is required"),
  });

  app.post("/api/auth/register-invite", async (req: Request, res: Response) => {
    try {
      const { inviteToken, password, firstName, lastName, driverLicenseNumber } = registerInviteSchema.parse(req.body);
      const user = await storage.getUserByInviteToken(inviteToken);
      if (!user) return res.status(404).json({ message: "Invalid or expired invite link" });
      if (user.inviteExpiry && user.inviteExpiry < new Date()) {
        return res.status(410).json({ message: "This invite link has expired. Please contact Deluxe Logistics for a new invite." });
      }

      const hashed = await bcrypt.hash(password, 10);
      const updatedUser = await storage.updateUser(user.id, {
        password: hashed,
        firstName,
        lastName,
        isActive: true,
        inviteToken: null,
        inviteExpiry: null,
      });
      if (!updatedUser) return res.status(500).json({ message: "Failed to activate account" });

      // Save driver's license number to company
      if (user.companyId) {
        await storage.updateCompany(user.companyId, { driverLicenseNumber }).catch(() => { /* non-fatal */ });
      }

      await logAuditEvent({
        req,
        userId: updatedUser.id,
        actionType: "account_registered",
        entityType: "user",
        entityId: updatedUser.id,
        description: `Renter account activated for ${updatedUser.username}`,
        isAdminEntry: false,
      });

      // Auto log in with session regeneration
      const invitePayload = { id: updatedUser.id, email: updatedUser.username, firstName: updatedUser.firstName, lastName: updatedUser.lastName, role: updatedUser.role };
      req.session.regenerate((err) => {
        if (err) { console.error("[session] regenerate error:", err); return res.status(500).json({ message: "Session error" }); }
        req.session.userId = updatedUser.id;
        req.session.userRole = updatedUser.role;
        req.session.save((err) => {
          if (err) { console.error("[session] save error:", err); return res.status(500).json({ message: "Session error" }); }
          return res.json(invitePayload);
        });
      });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Documents — renter ───────────────────────────────────────────────
  app.get("/api/documents", requireRenter, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.companyId) return res.json([]);
      const docs = await storage.getDocuments(user.companyId);
      return res.json(docs.filter(d => !d.isAdminOnly));
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  const docUploadSchema = z.object({
    type: z.enum(["coi", "certificate_of_authority", "drivers_license"]),
  });

  app.post("/api/documents/upload", requireRenter, upload.single("file"), async (req: Request, res: Response) => {
    try {
      const { type } = docUploadSchema.parse(req.body);
      if (!req.file) return res.status(400).json({ message: "No file provided" });

      let url: string;
      if (isCloudinaryConfigured()) {
        url = await uploadToCloudinary(req.file.buffer, `documents/${type}`);
      } else {
        return res.status(503).json({ message: "Document storage not configured. Please set Cloudinary environment variables." });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user?.companyId) return res.status(400).json({ message: "No company account linked. Please contact admin." });

      const doc = await storage.createDocument({
        companyId: user.companyId,
        type,
        url,
        fileName: req.file.originalname,
        isAdminOnly: false,
        uploadedBy: user.id,
      });

      await logAuditEvent({
        req,
        userId: user.id,
        actionType: "document_uploaded",
        entityType: "company",
        entityId: user.companyId,
        description: `Document uploaded: ${type} (${req.file.originalname})`,
        isAdminEntry: false,
      });

      return res.json(doc);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Upload failed" });
    }
  });

  app.delete("/api/documents/:id", requireRenter, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const doc = await storage.getDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (doc.companyId !== user?.companyId) return res.status(403).json({ message: "Not authorized" });
      if (doc.isAdminOnly) return res.status(403).json({ message: "Cannot delete admin-only document" });
      await storage.deleteDocument(doc.id);
      return res.json({ success: true });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: company profile ───────────────────────────────────────────
  app.get("/api/admin/companies/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) return res.status(404).json({ message: "Company not found" });
      const docs = await storage.getDocuments(req.params.id);
      return res.json({ company, documents: docs });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  const updateCompanySchema = z.object({
    name: z.string().min(1).optional(),
    ownerName: z.string().optional(),
    authorizedUser: z.string().optional().nullable(),
    email: z.string().email().optional(),
    mcNumber: z.string().optional().nullable(),
    dotNumber: z.string().optional().nullable(),
    phone: z.string().optional(),
    address: z.string().optional().nullable(),
    driverLicenseNumber: z.string().optional().nullable(),
  });

  app.patch("/api/admin/companies/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const updates = updateCompanySchema.parse(req.body);

      // Track which fields were admin-entered at the field level
      const existing = await storage.getCompany(req.params.id);
      if (!existing) return res.status(404).json({ message: "Company not found" });
      const prevOverrides: Record<string, boolean> = JSON.parse(existing.adminOverrideFields ?? "{}");
      const newOverrides = { ...prevOverrides };
      for (const key of Object.keys(updates)) {
        if (updates[key as keyof typeof updates] !== undefined) {
          newOverrides[key] = true;
        }
      }

      const company = await storage.updateCompany(req.params.id, {
        ...updates,
        adminOverrideFields: JSON.stringify(newOverrides),
      });
      if (!company) return res.status(404).json({ message: "Company not found" });
      const changedFields = Object.keys(updates);
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const key of changedFields) {
        before[key] = (existing as Record<string, unknown>)[key] ?? null;
        after[key] = (updates as Record<string, unknown>)[key] ?? null;
      }
      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "company_edited_by_admin",
        entityType: "company",
        entityId: req.params.id,
        description: `Admin updated company profile for ${company.name}: ${changedFields.join(", ")}`,
        metadata: { fields: changedFields, before, after },
        isAdminEntry: true,
      });
      return res.json(company);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: upload document for company ──────────────────────────────
  app.post("/api/admin/companies/:id/documents", requireAdmin, upload.single("file"), async (req: Request, res: Response) => {
    try {
      // Note: "registration" is trailer-bound (trailers.registrationUrl), not a company document type
      const typeSchema = z.object({ type: z.enum(["coi", "certificate_of_authority", "drivers_license", "agreement"]), isAdminOnly: z.string().optional() });
      const { type, isAdminOnly } = typeSchema.parse(req.body);
      if (!req.file) return res.status(400).json({ message: "No file provided" });

      let url: string;
      if (isCloudinaryConfigured()) {
        url = await uploadToCloudinary(req.file.buffer, `documents/${type}`);
      } else {
        return res.status(503).json({ message: "Document storage not configured." });
      }

      const doc = await storage.createDocument({
        companyId: req.params.id,
        type,
        url,
        fileName: req.file.originalname,
        isAdminOnly: isAdminOnly === "true",
        uploadedBy: req.session.userId,
      });

      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "document_uploaded_by_admin",
        entityType: "company",
        entityId: req.params.id,
        description: `Admin uploaded document: ${type} (${req.file.originalname})`,
        isAdminEntry: true,
      });

      return res.json(doc);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Upload failed" });
    }
  });

  // ── Agreements ──────────────────────────────────────────────────────────
  // GET /api/agreements/:rentalId — renter views their agreement
  app.get("/api/agreements/:rentalId", requireRenter, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const rental = await storage.getRental(req.params.rentalId);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      if (rental.companyId !== user?.companyId) return res.status(403).json({ message: "Not authorized" });

      const trailer = await storage.getTrailer(rental.trailerId);
      const company = rental.companyId ? await storage.getCompany(rental.companyId) : null;

      return res.json({ rental, trailer: trailer ?? null, company: company ?? null });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/agreements/:rentalId/sign — renter signs agreement
  const signAgreementSchema = z.object({
    signedByName: z.string().min(2, "Please enter your full legal name"),
    agreed: z.boolean().refine(v => v === true, "You must agree to the terms"),
    signatureImage: z.string().min(1, "A signature is required").max(200000, "Signature image too large"), // base64 PNG data URL — required
    pickupDate: z.string().datetime("Please select a valid pickup date and time"), // ISO datetime — required
  });

  app.post("/api/agreements/:rentalId/sign", requireRenter, async (req: Request, res: Response) => {
    try {
      const { signedByName, agreed, signatureImage, pickupDate } = signAgreementSchema.parse(req.body);
      if (!agreed) return res.status(400).json({ message: "Agreement not accepted" });

      const user = await storage.getUser(req.session.userId!);
      const rental = await storage.getRental(req.params.rentalId);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      if (rental.companyId !== user?.companyId) return res.status(403).json({ message: "Not authorized" });
      if (rental.status !== "pending_agreement") {
        return res.status(409).json({ message: "This agreement has already been signed or is no longer pending." });
      }

      const trailer = await storage.getTrailer(rental.trailerId).catch(() => null);
      const company = rental.companyId ? await storage.getCompany(rental.companyId).catch(() => null) : null;

      // Upload signature image — required artifact; fail the transaction if Cloudinary is configured but upload fails
      let signatureUrl: string | undefined;
      if (isCloudinaryConfigured()) {
        const base64Data = signatureImage.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");
        signatureUrl = await uploadToCloudinary(imageBuffer, `signatures/${req.params.rentalId}`);
        // ↑ Throws on failure — intentionally propagates to catch block, preventing status advancement
      } else {
        // Cloudinary not configured (dev/test mode) — log warning but continue without persisted URL
        console.warn("[signature] Cloudinary not configured — signature not persisted to storage");
      }

      const signedAt = new Date();
      const signedAtStr = signedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const monthlyRateStr = `$${(rental.monthlyRate / 100).toLocaleString()}`;
      const depositStr = `$${((rental.monthlyRate * 2) / 100).toLocaleString()}`;

      // HTML escape helper — prevents injection when interpolating user-controlled values into agreement document
      const he = (s: string | null | undefined) =>
        String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

      // Generate signed agreement HTML document and upload — propagates on failure to prevent status advancement
      let agreementUrl: string | undefined;
      if (isCloudinaryConfigured()) {
          const agreementHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Rental Agreement — Deluxe Logistics Inc.</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
  h1 { font-size: 22px; border-bottom: 2px solid #e63946; padding-bottom: 10px; }
  h2 { font-size: 16px; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  td { padding: 8px 12px; border: 1px solid #ddd; font-size: 14px; }
  td:first-child { background: #f5f5f5; font-weight: bold; width: 35%; }
  .sig-block { border: 2px solid #1a1a1a; border-radius: 4px; padding: 16px; margin-top: 32px; }
  .sig-img { max-width: 300px; height: 80px; display: block; margin: 8px 0; border-bottom: 1px solid #333; }
  .footer { margin-top: 40px; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 16px; }
  .watermark { font-size: 11px; color: #999; text-align: center; margin-top: 20px; }
</style>
</head>
<body>
<h1>TRAILER RENTAL AGREEMENT</h1>
<p><strong>${COMPANY.name}</strong><br>${COMPANY.fullAddress}<br>${COMPANY.email}</p>

<h2>Rental Details</h2>
<table>
  <tr><td>Agreement ID</td><td>${he(req.params.rentalId)}</td></tr>
  <tr><td>Date Signed</td><td>${he(signedAtStr)}</td></tr>
  <tr><td>Equipment Type</td><td>${he(trailer?.type ?? "Trailer")}</td></tr>
  <tr><td>VIN</td><td>${he(trailer?.vin ?? "N/A")}</td></tr>
  ${trailer?.make ? `<tr><td>Make / Model / Year</td><td>${he(trailer.make)}${trailer.model ? " " + he(trailer.model) : ""}${trailer.year ? " (" + he(trailer.year) + ")" : ""}</td></tr>` : ""}
  <tr><td>Monthly Rental Rate</td><td>${he(monthlyRateStr)}/month</td></tr>
  <tr><td>Security Deposit</td><td>${he(depositStr)} (2 months — fully refundable)</td></tr>
  <tr><td>Mileage</td><td>UNLIMITED — No mileage fees</td></tr>
  <tr><td>Requested Pickup Date &amp; Time</td><td>${he(new Date(pickupDate).toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }))}</td></tr>
</table>

<h2>Renter Information</h2>
<table>
  <tr><td>Company Name</td><td>${he(company?.name ?? "N/A")}</td></tr>
  <tr><td>Owner / Contact</td><td>${he(company?.ownerName ?? "N/A")}</td></tr>
  <tr><td>DOT Number</td><td>${he(company?.dotNumber ?? "N/A")}</td></tr>
  ${company?.mcNumber ? `<tr><td>MC Number</td><td>${he(company.mcNumber)}</td></tr>` : ""}
  <tr><td>Address</td><td>${he(company?.address ?? "N/A")}</td></tr>
  <tr><td>Phone</td><td>${he(company?.phone ?? "N/A")}</td></tr>
  <tr><td>Email</td><td>${he(user!.username)}</td></tr>
</table>

<h2>Terms &amp; Conditions Summary</h2>
<ol style="font-size:13px;line-height:1.7;">
  <li><strong>Payment Terms:</strong> Monthly rental fee of ${monthlyRateStr} due on the same calendar day each month. A 2-month refundable security deposit of ${depositStr} is required before pickup.</li>
  <li><strong>No Mileage Restrictions:</strong> This agreement includes unlimited mileage — no per-mile charges whatsoever.</li>
  <li><strong>No Hidden Fees:</strong> Only the monthly rate and refundable deposit. No setup, origination, or administrative fees.</li>
  <li><strong>Term:</strong> Month-to-month with 30 days written notice required to terminate.</li>
  <li><strong>Condition &amp; Return:</strong> Equipment must be returned in the same condition as received, accounting for normal wear and tear.</li>
  <li><strong>Insurance:</strong> Renter must maintain commercial auto insurance (minimum $1,000,000 liability) naming Deluxe Logistics Inc. as additional insured at all times.</li>
  <li><strong>Permitted Use:</strong> Equipment may only be used for lawful commercial transportation in compliance with all applicable Federal Motor Carrier Safety Administration (FMCSA) regulations.</li>
  <li><strong>Maintenance:</strong> Renter is responsible for routine maintenance (tires, lights, brakes). Major structural repairs will be addressed by Deluxe Logistics upon timely notice.</li>
  <li><strong>Breach &amp; Default:</strong> Failure to make timely payment or breach of any material term gives Deluxe Logistics the right to repossess the equipment with 3 days notice.</li>
  <li><strong>Indemnification:</strong> Renter agrees to indemnify and hold harmless Deluxe Logistics Inc. from any claims, damages, or liabilities arising from renter's use of the equipment.</li>
  <li><strong>Governing Law:</strong> This agreement shall be governed by the laws of the State of West Virginia. Disputes will be resolved in Berkeley County, WV.</li>
</ol>

<div class="sig-block">
  <p style="margin:0 0 8px;font-size:14px;"><strong>Electronic Signature</strong></p>
  <p style="margin:0 0 4px;font-size:13px;">Signed by: <strong>${he(signedByName)}</strong></p>
  <p style="margin:0 0 8px;font-size:13px;">Date: ${he(signedAtStr)}</p>
  ${signatureUrl ? `<img src="${he(signatureUrl)}" alt="Signature" class="sig-img" />` : `<p style="font-style:italic;color:#666;font-size:12px;">Signature captured electronically (typed)</p>`}
  <p style="margin:8px 0 0;font-size:12px;color:#555;">
    By signing this agreement electronically, the renter confirms they have read, understand, and agree to all terms and conditions set forth herein.
    IP Address: ${he(req.ip ?? "recorded")} · Timestamp: ${he(signedAt.toISOString())}
  </p>
</div>

<div class="footer">
  <p>This document was generated electronically by Deluxe Logistics Inc. Agreement ID: ${req.params.rentalId}</p>
</div>
<div class="watermark">EXECUTED COPY — Deluxe Logistics Inc. · ${signedAtStr}</div>
</body>
</html>`;
          agreementUrl = await uploadRawToCloudinary(
            Buffer.from(agreementHtml, "utf8"),
            "agreements",
            `agreement_${req.params.rentalId}`
          );
          // ↑ Throws on failure — intentionally propagates, preventing status advancement without stored artifact
      } else {
        console.warn("[agreement] Cloudinary not configured — agreement document not persisted");
      }

      const updatePayload: UpdateRental = {
        status: "pending_payment",
        agreementSignedAt: signedAt,
        signedByName,
        ...(signatureUrl ? { signatureUrl } : {}),
        ...(agreementUrl ? { agreementUrl } : {}),
        ...(pickupDate ? { pickupDate: new Date(pickupDate) } : {}),
      };
      const updated = await storage.updateRental(req.params.rentalId, updatePayload);

      await logAuditEvent({
        req,
        userId: user!.id,
        actionType: "agreement_signed",
        entityType: "rental",
        entityId: req.params.rentalId,
        description: `Rental agreement signed by ${signedByName} for rental ${req.params.rentalId} — pickup: ${new Date(pickupDate).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
        metadata: { signatureUrl: signatureUrl ?? null, agreementUrl: agreementUrl ?? null, pickupDate },
        isAdminEntry: false,
      });

      // Send emails (non-blocking)
      sendAgreementSignedEmails({
        rentalId: req.params.rentalId,
        companyName: company?.name ?? "Unknown Company",
        renterEmail: user!.username,
        renterName: `${user!.firstName} ${user!.lastName}`,
        trailerVin: trailer?.vin ?? "N/A",
        trailerType: trailer?.type ?? "Trailer",
        monthlyRate: rental.monthlyRate,
        signedAt,
        signedByName,
        pickupDate: new Date(pickupDate),
      }).catch(e => console.error("[email] agreement signed email failed:", e));

      return res.json({ success: true, rental: updated });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/admin/rentals/:id/send-agreement — admin triggers "please sign" email to renter
  app.post("/api/admin/rentals/:id/send-agreement", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });

      // Find the renter user linked to this rental's company
      const company = rental.companyId ? await storage.getCompany(rental.companyId) : null;
      if (!company) return res.status(400).json({ message: "No company linked to this rental" });

      const trailer = await storage.getTrailer(rental.trailerId).catch(() => null);

      const { sendAgreementRequestEmail } = await import("./email-service");
      await sendAgreementRequestEmail({
        rentalId: rental.id,
        companyName: company.name,
        renterEmail: company.email,
        renterName: company.ownerName,
        trailerVin: trailer?.vin ?? "N/A",
        trailerType: trailer?.type ?? "Trailer",
        monthlyRate: rental.monthlyRate,
      });

      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "agreement_email_sent",
        entityType: "rental",
        entityId: rental.id,
        description: `Admin sent agreement signing request to ${company.email}`,
        isAdminEntry: true,
      });

      return res.json({ success: true });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Failed to send agreement email" });
    }
  });

  // ── Admin: rentals ────────────────────────────────────────────────────────
  app.get("/api/admin/rentals", requireAdmin, async (req: Request, res: Response) => {
    try {
      const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const all = await storage.listRentals(companyId);
      const enriched = await Promise.all(
        all.map(async (r) => {
          const [company, trailer] = await Promise.all([
            storage.getCompany(r.companyId).catch(() => null),
            storage.getTrailer(r.trailerId).catch(() => null),
          ]);
          return {
            ...r,
            companyName: company?.name ?? "Unknown",
            companyEmail: company?.email ?? "",
            trailerVin: trailer?.vin ?? "Unknown",
            trailerType: trailer?.type ?? "Unknown",
            trailerMake: trailer?.make ?? null,
            trailerYear: trailer?.year ?? null,
          };
        })
      );
      return res.json(enriched);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/rentals/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      const [company, trailer, docs, logs] = await Promise.all([
        storage.getCompany(rental.companyId).catch(() => null),
        storage.getTrailer(rental.trailerId).catch(() => null),
        storage.getDocuments(undefined, rental.id).catch(() => []),
        storage.getAuditLogs("rental", rental.id).catch(() => []),
      ]);
      return res.json({ rental, company, trailer, docs, auditLogs: logs });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: create rental ─────────────────────────────────────────────
  const createRentalSchema = z.object({
    applicationId: z.string().optional(),
    trailerId: z.string(),
    companyId: z.string(),
    monthlyRate: z.number().positive(),
  });

  app.post("/api/admin/rentals", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { applicationId, trailerId, companyId, monthlyRate } = createRentalSchema.parse(req.body);

      // Validate trailer exists
      const trailer = await storage.getTrailer(trailerId);
      if (!trailer) return res.status(404).json({ message: "Trailer not found" });

      // Validate company exists
      const company = await storage.getCompany(companyId);
      if (!company) return res.status(404).json({ message: "Company not found" });

      const rental = await storage.createRental({
        applicationId: applicationId ?? null,
        trailerId,
        companyId,
        monthlyRate,
        status: "pending_agreement",
        depositPaid: false,
      });

      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "create_rental",
        entityType: "rental",
        entityId: rental.id,
        description: `Created rental for ${company.name} — trailer ${trailer.vin} (${trailer.type}) at $${(monthlyRate / 100).toFixed(2)}/mo`,
        isAdminEntry: true,
      });

      return res.status(201).json(rental);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      // Catch unique constraint violation (double-booking)
      if (err instanceof Error && err.message?.includes("idx_rentals_one_active_per_trailer")) {
        return res.status(409).json({ message: "This trailer already has an active rental. It cannot be rented again until the current rental is completed or cancelled." });
      }
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/rentals/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const updateSchema = z.object({
        status: z.enum(["pending_agreement", "pending_payment", "active", "active_in_use", "completed", "cancelled"]).optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        pickupDate: z.string().nullable().optional(),
        monthlyRate: z.number().positive().optional(),
        depositPaid: z.boolean().optional(),
        agreementSignedAt: z.string().nullable().optional(),
        stripeSubscriptionId: z.string().nullable().optional(),
      });
      const body = updateSchema.parse(req.body);
      const existingRental = await storage.getRental(req.params.id);
      if (!existingRental) return res.status(404).json({ message: "Rental not found" });

      // Enforce rental status state machine
      if (body.status) {
        const VALID_TRANSITIONS: Record<string, string[]> = {
          pending_agreement: ["pending_payment", "cancelled"],
          pending_payment: ["active", "cancelled"],
          active: ["active_in_use", "completed", "cancelled"],
          active_in_use: ["active", "completed", "cancelled"],
          completed: [],
          cancelled: [],
        };
        const allowed = VALID_TRANSITIONS[existingRental.status] ?? [];
        if (!allowed.includes(body.status)) {
          return res.status(400).json({ message: `Cannot transition from '${existingRental.status}' to '${body.status}'` });
        }
      }
      const payload: UpdateRental = {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.monthlyRate !== undefined ? { monthlyRate: body.monthlyRate } : {}),
        ...(body.depositPaid !== undefined ? { depositPaid: body.depositPaid } : {}),
        ...(body.stripeSubscriptionId !== undefined ? { stripeSubscriptionId: body.stripeSubscriptionId } : {}),
        ...(body.startDate !== undefined ? { startDate: body.startDate ? new Date(body.startDate) : null } : {}),
        ...(body.endDate !== undefined ? { endDate: body.endDate ? new Date(body.endDate) : null } : {}),
        ...(body.pickupDate !== undefined ? { pickupDate: body.pickupDate ? new Date(body.pickupDate) : null } : {}),
        ...(body.agreementSignedAt !== undefined ? { agreementSignedAt: body.agreementSignedAt ? new Date(body.agreementSignedAt) : null } : {}),
      };
      const rental = await storage.updateRental(req.params.id, payload);
      if (!rental) return res.status(404).json({ message: "Rental not found" });

      // Side effects for terminal status transitions
      if (body.status === "completed" || body.status === "cancelled") {
        // Set trailer to maintenance (completed) or available (cancelled)
        const trailerStatus = body.status === "completed" ? "maintenance" : "available";
        await storage.updateTrailer(existingRental.trailerId, { status: trailerStatus }).catch(
          (e: unknown) => console.error(`[admin] Failed to update trailer status:`, e)
        );

        // Cancel Stripe subscription if active
        if (existingRental.stripeSubscriptionId) {
          try {
            const stripe = await getUncachableStripeClient();
            await stripe.subscriptions.cancel(existingRental.stripeSubscriptionId);
            await storage.updateRental(rental.id, { stripeSubscriptionId: null });
          } catch (subErr) {
            console.error(`[admin] Failed to cancel subscription ${existingRental.stripeSubscriptionId}:`, subErr);
          }
        }

        // Flag deposit refund if rental was completed and deposit was paid
        if (body.status === "completed" && existingRental.depositPaid) {
          await logAuditEvent({
            req,
            userId: null,
            actionType: "deposit_refund_needed",
            entityType: "rental",
            entityId: rental.id,
            description: `ACTION REQUIRED: Security deposit refund needed for completed rental. Process via Stripe dashboard.`,
            isAdminEntry: true,
          });
        }
      }

      const changedFields = Object.keys(body);
      const rentalBefore: Record<string, unknown> = {};
      const rentalAfter: Record<string, unknown> = {};
      for (const key of changedFields) {
        rentalBefore[key] = (existingRental as Record<string, unknown>)[key] ?? null;
        rentalAfter[key] = (body as Record<string, unknown>)[key] ?? null;
      }
      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "rental_updated_by_admin",
        entityType: "rental",
        entityId: rental.id,
        description: `Admin updated rental fields: ${changedFields.join(", ")}`,
        metadata: { fields: changedFields, before: rentalBefore, after: rentalAfter },
        isAdminEntry: true,
      });
      return res.json(rental);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin: create one-off invoice for a rental customer
  app.post("/api/admin/rentals/:id/create-invoice", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { amount, description } = z.object({
        amount: z.number().int().min(100, "Minimum $1.00"),
        description: z.string().min(3).max(200),
      }).parse(req.body);

      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      if (!rental.stripeCustomerId) {
        return res.status(400).json({ message: "No Stripe customer on file for this rental" });
      }

      const stripe = await getUncachableStripeClient();

      // Create an invoice item then invoice, and finalize+send
      await stripe.invoiceItems.create({
        customer: rental.stripeCustomerId,
        amount,
        currency: "usd",
        description,
        metadata: { rentalId: rental.id, type: "admin_invoice" },
      });

      const invoice = await stripe.invoices.create({
        customer: rental.stripeCustomerId,
        collection_method: "send_invoice",
        days_until_due: 7,
        metadata: { rentalId: rental.id },
      });

      await stripe.invoices.finalizeInvoice(invoice.id);
      await stripe.invoices.sendInvoice(invoice.id);

      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "admin_invoice_created",
        entityType: "rental",
        entityId: rental.id,
        description: `Admin created one-off invoice $${(amount / 100).toFixed(2)} — "${description}" (Stripe invoice: ${invoice.id})`,
        isAdminEntry: true,
      });

      return res.json({ success: true, invoiceId: invoice.id });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error("Admin create-invoice error:", err);
      return res.status(500).json({ message: err instanceof Error ? err.message : "Failed to create invoice" });
    }
  });

  // Admin: retry/create subscription for a rental (if auto-creation failed)
  app.post("/api/admin/rentals/:id/create-subscription", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      if (!rental.stripeCustomerId) {
        return res.status(400).json({ message: "No Stripe customer on file for this rental" });
      }
      if (rental.stripeSubscriptionId) {
        return res.status(400).json({ message: "Subscription already exists" });
      }

      const stripe = await getUncachableStripeClient();
      // Idempotency keys prevent duplicate price/subscription on concurrent admin retries
      const price = await stripe.prices.create(
        {
          unit_amount: rental.monthlyRate,
          currency: "usd",
          recurring: { interval: "month" },
          product_data: {
            name: `Trailer Rental — monthly (rental ${rental.id.slice(-8).toUpperCase()})`,
          },
          metadata: { rentalId: rental.id },
        },
        { idempotencyKey: `price_rental_${rental.id}` },
      );

      // Calculate trial_end based on rental start date: first month is already covered by deposit.
      // If rental started more than 30 days ago, begin billing immediately (no trial).
      const startedAt = rental.startDate ? new Date(rental.startDate).getTime() : Date.now();
      const daysSinceStart = (Date.now() - startedAt) / (1000 * 60 * 60 * 24);
      const remainingTrialDays = Math.max(0, 30 - Math.floor(daysSinceStart));
      const trialEnd = remainingTrialDays > 0
        ? Math.floor(Date.now() / 1000) + remainingTrialDays * 24 * 60 * 60
        : undefined;

      const subscription = await stripe.subscriptions.create(
        {
          customer: rental.stripeCustomerId,
          items: [{ price: price.id }],
          metadata: { rentalId: rental.id, type: "monthly_rental" },
          payment_settings: {
            payment_method_types: ["card"],
            save_default_payment_method: "on_subscription",
          },
          proration_behavior: "none",
          ...(trialEnd ? { trial_end: trialEnd } : {}),
        } as Parameters<typeof stripe.subscriptions.create>[0],
        { idempotencyKey: `sub_create_rental_${rental.id}` },
      );

      await storage.updateRental(rental.id, { stripeSubscriptionId: subscription.id });

      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "subscription_created_by_admin",
        entityType: "rental",
        entityId: rental.id,
        description: `Admin manually created monthly subscription ${subscription.id} (retry)`,
        isAdminEntry: true,
      });

      return res.json({ success: true, subscriptionId: subscription.id });
    } catch (err: unknown) {
      console.error("Admin create-subscription error:", err);
      return res.status(500).json({ message: err instanceof Error ? err.message : "Failed to create subscription" });
    }
  });

  // Admin: cancel subscription for a rental
  app.post("/api/admin/rentals/:id/cancel-subscription", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      if (!rental.stripeSubscriptionId) {
        return res.status(400).json({ message: "No active subscription for this rental" });
      }

      const stripe = await getUncachableStripeClient();
      await stripe.subscriptions.cancel(rental.stripeSubscriptionId);

      await storage.updateRental(rental.id, { stripeSubscriptionId: null });

      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "subscription_cancelled",
        entityType: "rental",
        entityId: rental.id,
        description: `Admin cancelled Stripe subscription ${rental.stripeSubscriptionId}`,
        isAdminEntry: true,
      });

      return res.json({ success: true });
    } catch (err: unknown) {
      console.error("Cancel subscription error:", err);
      return res.status(500).json({ message: err instanceof Error ? err.message : "Failed to cancel subscription" });
    }
  });

  // ── Stripe Payment Routes ────────────────────────────────────────────

  // Get Stripe publishable key (for frontend)
  app.get("/api/stripe/config", requireAuth, async (_req: Request, res: Response) => {
    try {
      const publishableKey = await getStripePublishableKey();
      return res.json({ publishableKey });
    } catch (err: unknown) {
      return res.status(503).json({ message: "Stripe not configured" });
    }
  });

  // Create PaymentIntent for deposit (Stripe Elements flow)
  app.post("/api/stripe/create-deposit-intent", requireRenter, async (req: Request, res: Response) => {
    try {
      const { rentalId } = z.object({ rentalId: z.string() }).parse(req.body);
      const rental = await storage.getRental(rentalId);
      if (!rental) return res.status(404).json({ message: "Rental not found" });

      const user = await storage.getUser(req.session.userId!);
      if (!user || user.companyId !== rental.companyId) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (rental.status !== "pending_payment") {
        return res.status(400).json({ message: "Rental is not awaiting payment" });
      }
      if (rental.depositPaid) {
        return res.status(400).json({ message: "Deposit already paid" });
      }
      if (!rental.monthlyRate || rental.monthlyRate <= 0) {
        return res.status(400).json({ message: "Monthly rate not set on this rental. Contact admin." });
      }

      const company = await storage.getCompany(rental.companyId);
      const stripe = await getUncachableStripeClient();

      let customerId = rental.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.username,
          name: company?.name ?? `${user.firstName} ${user.lastName}`,
          metadata: { rentalId, companyId: rental.companyId, userId: user.id },
        });
        customerId = customer.id;
        await storage.updateRental(rentalId, { stripeCustomerId: customerId });
      }

      const depositAmount = rental.monthlyRate * 2; // 2-month deposit in cents
      const trailer = await storage.getTrailer(rental.trailerId);
      const trailerLabel = trailer ? `${trailer.year ?? ""} ${trailer.make ?? ""} ${trailer.type}`.trim() : "Trailer";

      // Reuse existing open PaymentIntent to prevent duplicate charges on page reload/retry
      const REUSABLE_STATUSES = ["requires_payment_method", "requires_confirmation", "requires_action"];
      let paymentIntent: Awaited<ReturnType<typeof stripe.paymentIntents.create>>;
      if (rental.stripeDepositIntentId) {
        try {
          // Retrieve and cast to Stripe.PaymentIntent (single narrowing cast from Response<PaymentIntent>)
          const existing = await stripe.paymentIntents.retrieve(rental.stripeDepositIntentId) as Stripe.PaymentIntent;
          if (REUSABLE_STATUSES.includes(existing.status) && existing.amount === depositAmount) {
            paymentIntent = existing as typeof paymentIntent;
          } else {
            // PI is either consumed, wrong amount, or not reusable — create new one
            throw new Error(`PI not reusable (status: ${existing.status}, amount match: ${existing.amount === depositAmount})`);
          }
        } catch {
          // Existing PI is cancelled/consumed — fall through to create new one
          paymentIntent = await stripe.paymentIntents.create({
            amount: depositAmount,
            currency: "usd",
            customer: customerId,
            description: `2-month security deposit — ${trailerLabel} ($${(rental.monthlyRate / 100).toFixed(2)}/mo × 2)`,
            metadata: { rentalId, type: "deposit", companyId: rental.companyId },
            setup_future_usage: "off_session",
            automatic_payment_methods: { enabled: true },
          });
          await storage.updateRental(rentalId, { stripeDepositIntentId: paymentIntent.id });
        }
      } else {
        paymentIntent = await stripe.paymentIntents.create({
          amount: depositAmount,
          currency: "usd",
          customer: customerId,
          description: `2-month security deposit — ${trailerLabel} ($${(rental.monthlyRate / 100).toFixed(2)}/mo × 2)`,
          metadata: { rentalId, type: "deposit", companyId: rental.companyId },
          // Save payment method for off-session recurring billing (monthly subscription)
          setup_future_usage: "off_session",
          automatic_payment_methods: { enabled: true },
        });
        await storage.updateRental(rentalId, { stripeDepositIntentId: paymentIntent.id });
      }

      return res.json({
        clientSecret: paymentIntent.client_secret,
        amount: depositAmount,
        trailerLabel,
        monthlyRate: rental.monthlyRate,
      });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input" });
      console.error("PaymentIntent error:", err);
      return res.status(500).json({ message: err instanceof Error ? err.message : "Failed to create payment intent" });
    }
  });

  // Confirm deposit after successful payment (client-side fallback after Stripe Elements confirms)
  app.post("/api/stripe/payment-succeeded", requireRenter, async (req: Request, res: Response) => {
    try {
      const { rentalId, paymentIntentId } = z.object({
        rentalId: z.string(),
        paymentIntentId: z.string(),
      }).parse(req.body);

      const rental = await storage.getRental(rentalId);
      if (!rental) return res.status(404).json({ message: "Rental not found" });

      const user = await storage.getUser(req.session.userId!);
      if (!user || user.companyId !== rental.companyId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Verify the payment with Stripe
      const stripe = await getUncachableStripeClient();
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.status !== "succeeded") {
        return res.status(400).json({ message: `Payment not yet completed (status: ${intent.status})` });
      }
      if (intent.metadata?.rentalId !== rentalId) {
        return res.status(400).json({ message: "Payment intent does not match this rental" });
      }

      // Use shared finalize service (idempotent — safe to call even if webhook already ran)
      const { finalizeDepositPayment } = await import("./deposit-service");
      const result = await finalizeDepositPayment({
        rentalId,
        paymentIntentId,
        stripeCustomerId: typeof intent.customer === "string" ? intent.customer : undefined,
        paymentMethodId: typeof intent.payment_method === "string" ? intent.payment_method : undefined,
        triggeredBy: "client_callback",
        userId: user.id,
        ipAddress: req.ip,
      });

      return res.json({ success: true, status: "active", ...result });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input" });
      console.error("Payment succeeded handler error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create deposit checkout session (2-month security deposit as one-time payment)
  app.post("/api/stripe/create-deposit-session", requireRenter, async (req: Request, res: Response) => {
    try {
      const { rentalId } = z.object({ rentalId: z.string() }).parse(req.body);
      const rental = await storage.getRental(rentalId);
      if (!rental) return res.status(404).json({ message: "Rental not found" });

      // Ensure this renter owns this rental
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.companyId !== rental.companyId) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (rental.status !== "pending_payment") {
        return res.status(400).json({ message: "Rental is not awaiting payment" });
      }
      if (rental.depositPaid) {
        return res.status(400).json({ message: "Deposit already paid" });
      }
      if (!rental.monthlyRate || rental.monthlyRate <= 0) {
        return res.status(400).json({ message: "Monthly rate not set on this rental. Contact admin." });
      }

      const trailer = await storage.getTrailer(rental.trailerId);
      const company = await storage.getCompany(rental.companyId);

      const stripe = await getUncachableStripeClient();

      // Create or get Stripe customer tied to this rental
      let customerId = rental.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.username,
          name: company?.name ?? user.firstName + " " + user.lastName,
          metadata: { rentalId, companyId: rental.companyId, userId: user.id },
        });
        customerId = customer.id;
        await storage.updateRental(rentalId, { stripeCustomerId: customerId });
      }

      const depositAmount = rental.monthlyRate * 2; // 2-month deposit in cents
      const trailerLabel = trailer ? `${trailer.year ?? ""} ${trailer.make ?? ""} ${trailer.type}`.trim() : "Trailer";
      const baseUrl = getBaseUrl(req);

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: depositAmount,
              product_data: {
                name: `Security Deposit — ${trailerLabel}`,
                description: `2-month refundable security deposit for trailer rental. Monthly rate: $${(rental.monthlyRate / 100).toFixed(2)}/mo`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: { rentalId, type: "deposit" },
        payment_intent_data: {
          metadata: { rentalId, type: "deposit" },
        },
        success_url: `${baseUrl}/dashboard?payment=success&rentalId=${rentalId}`,
        cancel_url: `${baseUrl}/dashboard?payment=cancelled`,
      });

      return res.json({ url: session.url, sessionId: session.id });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error("Stripe deposit session error:", err);
      return res.status(500).json({ message: err instanceof Error ? err.message : "Failed to create payment session" });
    }
  });

  // Create monthly subscription checkout session
  app.post("/api/stripe/create-subscription-session", requireRenter, async (req: Request, res: Response) => {
    try {
      const { rentalId } = z.object({ rentalId: z.string() }).parse(req.body);
      const rental = await storage.getRental(rentalId);
      if (!rental) return res.status(404).json({ message: "Rental not found" });

      const user = await storage.getUser(req.session.userId!);
      if (!user || user.companyId !== rental.companyId) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!rental.depositPaid) {
        return res.status(400).json({ message: "Deposit must be paid first" });
      }

      const trailer = await storage.getTrailer(rental.trailerId);
      const company = await storage.getCompany(rental.companyId);
      const stripe = await getUncachableStripeClient();

      let customerId = rental.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.username,
          name: company?.name ?? user.firstName + " " + user.lastName,
          metadata: { rentalId, companyId: rental.companyId, userId: user.id },
        });
        customerId = customer.id;
        await storage.updateRental(rentalId, { stripeCustomerId: customerId });
      }

      const trailerLabel = trailer ? `${trailer.year ?? ""} ${trailer.make ?? ""} ${trailer.type}`.trim() : "Trailer";
      const baseUrl = getBaseUrl(req);

      // Create a recurring price on-the-fly
      const price = await stripe.prices.create({
        currency: "usd",
        unit_amount: rental.monthlyRate,
        recurring: { interval: "month" },
        product_data: {
          name: `Monthly Rental — ${trailerLabel}`,
          metadata: { rentalId },
        },
      });

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        mode: "subscription",
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: { rentalId, type: "subscription" },
        success_url: `${baseUrl}/dashboard?subscription=success&rentalId=${rentalId}`,
        cancel_url: `${baseUrl}/dashboard?subscription=cancelled`,
      });

      return res.json({ url: session.url, sessionId: session.id });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error("Stripe subscription session error:", err);
      return res.status(500).json({ message: err instanceof Error ? err.message : "Failed to create subscription session" });
    }
  });

  // Mark deposit as paid (called after Stripe webhook or manual admin override)
  // Side-effects: trailer → "rented", rental → "active", confirmation email sent
  app.post("/api/stripe/confirm-deposit", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { rentalId } = z.object({ rentalId: z.string() }).parse(req.body);
      const rental = await storage.getRental(rentalId);
      if (!rental) return res.status(404).json({ message: "Rental not found" });

      const { finalizeDepositPayment } = await import("./deposit-service");
      const result = await finalizeDepositPayment({
        rentalId,
        triggeredBy: "admin_manual",
        userId: req.session.userId!,
        ipAddress: req.ip,
      });

      return res.json({ ...result, rentalId });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input" });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get payment status for a rental (renter-facing)
  app.get("/api/rentals/:id/payment-status", requireRenter, async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.companyId !== rental.companyId) {
        return res.status(403).json({ message: "Access denied" });
      }
      return res.json({
        rentalId: rental.id,
        status: rental.status,
        depositPaid: rental.depositPaid,
        stripeCustomerId: rental.stripeCustomerId,
        stripeSubscriptionId: rental.stripeSubscriptionId,
        monthlyRate: rental.monthlyRate,
      });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get Stripe charges + invoices for a rental (renter or admin)
  app.get("/api/rentals/:id/invoices", requireAuth, async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role !== "admin" && user.companyId !== rental.companyId) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!rental.stripeCustomerId) {
        return res.json({ charges: [], invoices: [], nextBillingDate: null, stripeCustomerUrl: null, stripeSubscriptionUrl: null });
      }
      const stripe = await getUncachableStripeClient();
      // Fetch charges and invoices in parallel.
      // Subscription invoices are fetched by subscription ID (no `subscription` field
      // access needed — avoids Stripe SDK version type divergence).
      const [chargesResult, invoicesResult, subInvoicesResult] = await Promise.all([
        stripe.charges.list({ customer: rental.stripeCustomerId, limit: 50 }),
        stripe.invoices.list({ customer: rental.stripeCustomerId, limit: 50 }),
        rental.stripeSubscriptionId
          ? stripe.invoices.list({ subscription: rental.stripeSubscriptionId, limit: 50 })
          : Promise.resolve({ data: [] as Stripe.Invoice[] }),
      ]);

      // Compute next billing date from rental start date (monthly cycle).
      // Avoids an extra Stripe API call and sidesteps SDK version type divergence.
      let nextBillingDate: string | null = null;
      if (rental.stripeSubscriptionId && rental.startDate) {
        const startMs = new Date(rental.startDate).getTime();
        const now = Date.now();
        // Average month ≈ 30.44 days; find how many complete months have elapsed
        const avgMonthMs = 30.44 * 24 * 60 * 60 * 1000;
        const monthsElapsed = Math.max(0, Math.floor((now - startMs) / avgMonthMs));
        const nextBilling = new Date(rental.startDate);
        nextBilling.setMonth(nextBilling.getMonth() + monthsElapsed + 1);
        nextBillingDate = nextBilling.toISOString();
      }

      // Stripe dashboard links — admin-only to prevent leaking internal Stripe IDs to renters
      let stripeCustomerUrl: string | null = null;
      let stripeSubscriptionUrl: string | null = null;
      if (user.role === "admin") {
        const stripeKey = await getStripeSecretKey();
        const isTestMode = !stripeKey.startsWith('sk_live_');
        const stripeDash = `https://dashboard.stripe.com${isTestMode ? '/test' : ''}`;
        stripeCustomerUrl = rental.stripeCustomerId
          ? `${stripeDash}/customers/${rental.stripeCustomerId}`
          : null;
        stripeSubscriptionUrl = rental.stripeSubscriptionId
          ? `${stripeDash}/subscriptions/${rental.stripeSubscriptionId}`
          : null;
      }

      // Filter charges to those linked to this rental by metadata.
      // Cast list items to Stripe.Charge for proper metadata typing.
      const rentalCharges = (chargesResult.data as Stripe.Charge[]).filter((c) => {
        return (c.metadata ?? {})['rentalId'] === rental.id;
      });

      // Merge subscription invoices + one-off invoices tagged with rentalId metadata;
      // deduplicate by invoice ID in case of overlap.
      const metadataInvoices = (invoicesResult.data as Stripe.Invoice[]).filter(
        (inv) => (inv.metadata ?? {})['rentalId'] === rental.id,
      );
      const subscriptionInvoices = subInvoicesResult.data as Stripe.Invoice[];
      const seenIds = new Set<string>();
      const rentalInvoices: Stripe.Invoice[] = [];
      for (const inv of [...metadataInvoices, ...subscriptionInvoices]) {
        if (!seenIds.has(inv.id)) { seenIds.add(inv.id); rentalInvoices.push(inv); }
      }

      return res.json({
        nextBillingDate,
        stripeCustomerUrl,
        stripeSubscriptionUrl,
        charges: rentalCharges.map((c) => ({
          id: c.id,
          amount: c.amount,
          currency: c.currency,
          status: c.status,
          description: c.description,
          createdAt: new Date(c.created * 1000).toISOString(),
          receiptUrl: c.receipt_url,
        })),
        invoices: rentalInvoices.map((inv) => ({
          id: inv.id,
          amount: inv.status === "paid" ? inv.amount_paid : inv.amount_due,
          currency: inv.currency,
          status: inv.status,
          description: inv.lines?.data?.[0]?.description ?? "Monthly rental",
          createdAt: new Date(inv.created * 1000).toISOString(),
          invoiceUrl: inv.hosted_invoice_url,
          pdfUrl: inv.invoice_pdf,
        })),
      });
    } catch (err: unknown) {
      console.error("Invoice fetch error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/rentals/:id/info — rental + trailer details for renter (own company) or admin
  app.get("/api/rentals/:id/info", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      if (user.role !== "admin" && user.companyId !== rental.companyId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const trailer = await storage.getTrailer(rental.trailerId);
      return res.json({
        rental,
        trailer: trailer ? {
          id: trailer.id,
          vin: trailer.vin,
          type: trailer.type,
          make: trailer.make,
          year: trailer.year,
          engineHourRate: trailer.engineHourRate,
        } : null,
      });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Engine Hours Tracking ─────────────────────────────────────────────────

  // GET /api/rentals/:id/engine-hours — list entries (admin: any; renter: own company)
  app.get("/api/rentals/:id/engine-hours", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      if (user.role !== "admin" && user.companyId !== rental.companyId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const entries = await storage.getEngineHourEntries(req.params.id);
      return res.json(entries);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/rentals/:id/engine-hours — renter submits a reading
  app.post("/api/rentals/:id/engine-hours", requireRenter, async (req: Request, res: Response) => {
    try {
      const { insertEngineHourEntrySchema } = await import("@shared/schema");
      const { currentReading, notes } = insertEngineHourEntrySchema
        .pick({ currentReading: true, notes: true })
        .parse(req.body);

      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      if (user.companyId !== rental.companyId) return res.status(403).json({ message: "Access denied" });

      // Get trailer for engine hour rate — only trailers with a configured rate are eligible
      const trailer = await storage.getTrailer(rental.trailerId);
      const rateAtTime = trailer?.engineHourRate ?? null;
      if (!rateAtTime || rateAtTime <= 0) {
        return res.status(400).json({ message: "Engine hour tracking is not enabled for this trailer." });
      }

      // Get previous reading and enforce monotonically increasing readings
      const prev = await storage.getLatestEngineHourEntry(req.params.id);
      const previousReading = prev?.currentReading ?? null;
      if (currentReading > 100_000) {
        return res.status(400).json({ message: "Reading exceeds maximum allowed value (100,000 hrs)." });
      }
      if (previousReading != null && currentReading <= previousReading) {
        return res.status(400).json({
          message: `Reading must be greater than the previous reading (${previousReading} hrs). New reading: ${currentReading} hrs.`,
        });
      }
      if (previousReading != null && (currentReading - previousReading) > 1000) {
        return res.status(400).json({ message: `Jump of ${currentReading - previousReading} hours seems too large. Max 1,000 hours per submission. Contact admin if correct.` });
      }
      const hoursUsed = previousReading != null ? currentReading - previousReading : null;
      const calculatedCharge = (hoursUsed != null && rateAtTime != null) ? hoursUsed * rateAtTime : null;

      const entry = await storage.createEngineHourEntry({
        rentalId: req.params.id,
        currentReading,
        previousReading,
        hoursUsed,
        rateAtTime,
        calculatedCharge,
        entryType: "renter_submitted",
        enteredBy: user.id,
        notes: notes ?? null,
      });

      // Audit log
      await logAuditEvent({
        req,
        userId: user.id,
        actionType: "engine_hours_submitted",
        entityType: "rental",
        entityId: req.params.id,
        description: `Renter submitted engine hour reading: ${currentReading} hrs${hoursUsed != null ? ` (${hoursUsed} hrs used)` : ""}${calculatedCharge != null ? `, $${(calculatedCharge / 100).toFixed(2)} charge` : ""}`,
        isAdminEntry: false,
      });

      // Notify admin via email
      const { sendEngineHoursReceivedAdmin } = await import("./email-service");
      const company = await storage.getCompany(rental.companyId).catch(() => null);
      await sendEngineHoursReceivedAdmin({
        rentalId: req.params.id,
        companyName: company?.name ?? "Unknown Company",
        trailerVin: trailer?.vin ?? "N/A",
        trailerType: trailer?.type ?? "trailer",
        currentReading,
        hoursUsed,
        calculatedCharge,
      }).catch((e: unknown) => console.error("[email] engine hours notify failed:", e));

      return res.status(201).json(entry);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/admin/rentals/:id/engine-hours/manual — admin manual entry
  app.post("/api/admin/rentals/:id/engine-hours/manual", requireAdmin, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        currentReading: z.number().int().min(0),
        notes: z.string().max(500).optional(),
      });
      const { currentReading, notes } = schema.parse(req.body);

      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });

      const trailer = await storage.getTrailer(rental.trailerId);
      const rateAtTime = trailer?.engineHourRate ?? null;
      if (!rateAtTime || rateAtTime <= 0) {
        return res.status(400).json({ message: "Engine hour tracking is not enabled for this trailer." });
      }

      const prev = await storage.getLatestEngineHourEntry(req.params.id);
      const previousReading = prev?.currentReading ?? null;
      if (currentReading > 100_000) {
        return res.status(400).json({ message: "Reading exceeds maximum allowed value (100,000 hrs)." });
      }
      if (previousReading != null && currentReading <= previousReading) {
        return res.status(400).json({
          message: `Reading must be greater than the previous reading (${previousReading} hrs). New reading: ${currentReading} hrs.`,
        });
      }
      const hoursUsed = previousReading != null ? currentReading - previousReading : null;
      const calculatedCharge = (hoursUsed != null && rateAtTime != null) ? hoursUsed * rateAtTime : null;

      const entry = await storage.createEngineHourEntry({
        rentalId: req.params.id,
        currentReading,
        previousReading,
        hoursUsed,
        rateAtTime,
        calculatedCharge,
        entryType: "admin_manual",
        enteredBy: req.session.userId!,
        notes: notes ?? null,
      });

      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "engine_hours_manual_entry",
        entityType: "rental",
        entityId: req.params.id,
        description: `Admin entered engine hours manually: ${currentReading} hrs${hoursUsed != null ? ` (${hoursUsed} hrs used)` : ""}${calculatedCharge != null ? `, $${(calculatedCharge / 100).toFixed(2)} charge` : ""}`,
        isAdminEntry: true,
      });

      return res.status(201).json(entry);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/admin/rentals/:id/request-engine-hours — send email request to renter
  app.post("/api/admin/rentals/:id/request-engine-hours", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });

      const company = await storage.getCompany(rental.companyId).catch(() => null);
      if (!company?.email) return res.status(400).json({ message: "Company email not on file" });

      const trailer = await storage.getTrailer(rental.trailerId);
      if (!trailer?.engineHourRate || trailer.engineHourRate <= 0) {
        return res.status(400).json({ message: "Engine hour tracking is not enabled for this trailer. Set an engine hour rate first." });
      }

      const prev = await storage.getLatestEngineHourEntry(req.params.id);

      const { sendEngineHoursRequest } = await import("./email-service");
      await sendEngineHoursRequest({
        rentalId: req.params.id,
        renterEmail: company.email,
        renterName: company.ownerName,
        companyName: company.name,
        trailerVin: trailer?.vin ?? "N/A",
        trailerType: trailer?.type ?? "trailer",
        previousReading: prev?.currentReading ?? null,
      });

      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "engine_hours_requested",
        entityType: "rental",
        entityId: req.params.id,
        description: `Admin requested engine hour reading from ${company.name}`,
        isAdminEntry: true,
      });

      return res.json({ success: true });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/admin/rentals/:rentalId/engine-hours/:entryId/bill — bill via Stripe
  app.post("/api/admin/rentals/:rentalId/engine-hours/:entryId/bill", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRental(req.params.rentalId);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      if (!rental.stripeCustomerId) return res.status(400).json({ message: "No Stripe customer on file" });

      const entries = await storage.getEngineHourEntries(req.params.rentalId);
      const entry = entries.find((e) => e.id === req.params.entryId);
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      if (!entry.calculatedCharge || entry.calculatedCharge <= 0) {
        return res.status(400).json({ message: "No billable amount on this entry" });
      }
      if (entry.stripeInvoiceItemId) {
        return res.status(400).json({ message: "This entry has already been billed" });
      }

      const trailer = await storage.getTrailer(rental.trailerId);
      const trailerLabel = trailer ? `${trailer.type} — VIN ${trailer.vin}` : "Trailer";
      const hoursLabel = entry.hoursUsed != null ? `${entry.hoursUsed} engine hrs` : "engine hours";

      const stripe = await getUncachableStripeClient();

      // Create a pending invoice item attached to the subscription so it is
      // collected on the customer's next billing cycle invoice (not billed immediately).
      const invoiceItemPayload: Parameters<typeof stripe.invoiceItems.create>[0] = {
        customer: rental.stripeCustomerId,
        amount: entry.calculatedCharge,
        currency: "usd",
        description: `Engine hour surcharge — ${hoursLabel} on ${trailerLabel}`,
        metadata: { rentalId: rental.id, engineHourEntryId: entry.id, type: "engine_hours" },
      };
      // If the rental has an active subscription, attach directly to that subscription
      // so Stripe picks it up on the next renewal invoice.
      if (rental.stripeSubscriptionId) {
        invoiceItemPayload.subscription = rental.stripeSubscriptionId;
      }
      const invoiceItem = await stripe.invoiceItems.create(invoiceItemPayload);

      // Save invoice item ID to mark as queued for billing
      await storage.updateEngineHourEntry(entry.id, { stripeInvoiceItemId: invoiceItem.id });

      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "engine_hours_billed",
        entityType: "rental",
        entityId: req.params.rentalId,
        description: `Engine hour surcharge of $${(entry.calculatedCharge / 100).toFixed(2)} added to next invoice (item ${invoiceItem.id})`,
        metadata: { invoiceItemId: invoiceItem.id, entryId: entry.id },
        isAdminEntry: true,
      });

      return res.json({ success: true, invoiceItemId: invoiceItem.id, queuedForNextInvoice: true });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: err instanceof Error ? err.message : "Failed to bill engine hours" });
    }
  });

  // ── QR Code Pickup / Return System ────────────────────────────────────────

  // POST /api/admin/rentals/:id/generate-pickup-qr
  app.post("/api/admin/rentals/:id/generate-pickup-qr", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      let token = rental.pickupToken;
      if (!token) {
        token = randomBytes(24).toString("hex");
        await storage.updateRental(rental.id, { pickupToken: token });
      }
      const url = `${getBaseUrl(req)}/pickup/${token}`;
      return res.json({ token, url });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/admin/rentals/:id/generate-return-qr
  app.post("/api/admin/rentals/:id/generate-return-qr", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRental(req.params.id);
      if (!rental) return res.status(404).json({ message: "Rental not found" });
      let token = rental.returnToken;
      if (!token) {
        token = randomBytes(24).toString("hex");
        await storage.updateRental(rental.id, { returnToken: token });
      }
      const url = `${getBaseUrl(req)}/return/${token}`;
      return res.json({ token, url });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/pickup/:token — returns rental info; requiresLogin flag if not authenticated
  app.get("/api/pickup/:token", async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRentalByPickupToken(req.params.token);
      if (!rental) return res.status(404).json({ message: "Invalid or expired pickup link" });
      const eligibleStatuses = ["active", "active_in_use"];
      if (!eligibleStatuses.includes(rental.status)) {
        return res.status(400).json({ message: "This rental is not currently eligible for pickup" });
      }
      const trailer = await storage.getTrailer(rental.trailerId);
      const company = rental.companyId ? await storage.getCompany(rental.companyId) : null;
      const isLoggedIn = !!req.session?.userId;
      let isAuthorized = false;
      if (isLoggedIn) {
        const user = await storage.getUser(req.session.userId!);
        if (user) {
          isAuthorized = user.role === "admin" || user.companyId === rental.companyId;
        }
      }
      let existingPhotos: { id: string; url: string; label: string | null }[] = [];
      if (isLoggedIn && isAuthorized) {
        const photos = await storage.getCheckinPhotos(rental.id);
        existingPhotos = photos.map(p => ({ id: p.id, url: p.url, label: p.label }));
      }
      return res.json({
        rentalId: rental.id,
        alreadyConfirmed: !!rental.pickupConfirmedAt,
        confirmedAt: rental.pickupConfirmedAt,
        trailerVin: trailer?.vin ?? "Unknown",
        trailerType: trailer?.type ?? "",
        trailerMake: trailer?.make ?? "",
        trailerYear: trailer?.year ?? "",
        companyName: company?.name ?? "",
        startDate: rental.startDate,
        requiresLogin: !isLoggedIn,
        isAuthorized,
        existingPhotos,
      });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/pickup/:token/photos — upload pre-inspection photos (requires auth)
  app.post("/api/pickup/:token/photos", requireAuth, upload.single("photo"), async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRentalByPickupToken(req.params.token);
      if (!rental) return res.status(404).json({ message: "Invalid pickup link" });
      const photoEligible = ["active", "active_in_use"];
      if (!photoEligible.includes(rental.status)) {
        return res.status(400).json({ message: "This rental is not currently eligible for pickup" });
      }
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      if (user.role !== "admin" && user.companyId !== rental.companyId) {
        return res.status(403).json({ message: "You are not authorized for this rental" });
      }
      if (rental.pickupConfirmedAt) return res.status(400).json({ message: "Pickup already confirmed" });
      if (!req.file) return res.status(400).json({ message: "No photo provided" });
      if (!isCloudinaryConfigured()) {
        return res.status(503).json({ message: "Image storage is not configured. Ask admin to set up Cloudinary." });
      }
      const url = await uploadToCloudinary(req.file.buffer, "deluxe-checkin");
      const label = typeof req.body.label === "string" ? req.body.label : null;
      const photo = await storage.createCheckinPhoto({
        rentalId: rental.id,
        url,
        label,
        uploadedBy: user.id,
      });
      return res.json({ id: photo.id, url: photo.url, label: photo.label });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Upload failed" });
    }
  });

  // POST /api/pickup/:token/confirm — requires auth, verifies renter owns the rental
  app.post("/api/pickup/:token/confirm", requireAuth, async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRentalByPickupToken(req.params.token);
      if (!rental) return res.status(404).json({ message: "Invalid or expired pickup link" });
      const confirmEligible = ["active", "active_in_use"];
      if (!confirmEligible.includes(rental.status)) {
        return res.status(400).json({ message: "This rental is not currently eligible for pickup" });
      }
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      if (user.role !== "admin" && user.companyId !== rental.companyId) {
        return res.status(403).json({ message: "You are not authorized for this rental" });
      }
      if (rental.pickupConfirmedAt) {
        return res.json({ success: true, alreadyConfirmed: true, confirmedAt: rental.pickupConfirmedAt });
      }
      const photos = await storage.getCheckinPhotos(rental.id);
      if (photos.length < 2) {
        return res.status(400).json({ message: "At least 2 pre-inspection photos are required before confirming pickup" });
      }
      const now = new Date();
      await storage.updateRental(rental.id, {
        pickupConfirmedAt: now,
        status: "active_in_use",
        pickupDate: now,
      });
      await logAuditEvent({
        req,
        userId: user.id,
        actionType: "pickup_confirmed",
        entityType: "rental",
        entityId: rental.id,
        description: `Pickup confirmed via QR check-in with ${photos.length} pre-inspection photos`,
        metadata: { method: "qr_scan", photoCount: photos.length },
        isAdminEntry: false,
      });
      // Fire-and-forget: pickup emails + registration delivery
      const pickupTrailer = await storage.getTrailer(rental.trailerId);
      const pickupCompany = rental.companyId ? await storage.getCompany(rental.companyId) : null;
      if (pickupCompany) {
        const { sendPickupConfirmedEmails, sendRegistrationEmail } = await import("./email-service");
        sendPickupConfirmedEmails({
          rentalId: rental.id,
          companyName: pickupCompany.name,
          renterEmail: pickupCompany.email,
          renterName: pickupCompany.ownerName,
          trailerVin: pickupTrailer?.vin ?? "Unknown",
          trailerType: pickupTrailer?.type ?? "",
          confirmedAt: now,
        }).catch(console.error);
        if (pickupTrailer?.registrationUrl) {
          sendRegistrationEmail({
            renterEmail: pickupCompany.email,
            renterName: pickupCompany.ownerName,
            companyName: pickupCompany.name,
            trailerVin: pickupTrailer.vin ?? '',
            trailerType: pickupTrailer.type,
            registrationUrl: pickupTrailer.registrationUrl,
          }).catch(console.error);
        }
      }
      return res.json({ success: true, confirmedAt: now });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/admin/rentals/:id/checkin-photos — admin view of pre-inspection photos
  app.get("/api/admin/rentals/:id/checkin-photos", requireAdmin, async (req: Request, res: Response) => {
    try {
      const photos = await storage.getCheckinPhotos(req.params.id);
      return res.json(photos);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/return/:token — public
  app.get("/api/return/:token", async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRentalByReturnToken(req.params.token);
      if (!rental) return res.status(404).json({ message: "Invalid or expired return link" });
      const trailer = await storage.getTrailer(rental.trailerId);
      const company = rental.companyId ? await storage.getCompany(rental.companyId) : null;
      return res.json({
        rentalId: rental.id,
        alreadyConfirmed: !!rental.returnConfirmedAt,
        confirmedAt: rental.returnConfirmedAt,
        trailerVin: trailer?.vin ?? "Unknown",
        trailerType: trailer?.type ?? "",
        trailerMake: trailer?.make ?? "",
        companyName: company?.name ?? "",
        startDate: rental.startDate,
      });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/return/:token/confirm — authenticated (renter or admin)
  app.post("/api/return/:token/confirm", requireAuth, async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRentalByReturnToken(req.params.token);
      if (!rental) return res.status(404).json({ message: "Invalid or expired return link" });

      // Verify caller is admin or belongs to the rental's company
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role !== "admin" && user.companyId !== rental.companyId) {
        return res.status(403).json({ message: "You are not authorized to confirm this return" });
      }

      if (rental.returnConfirmedAt) {
        return res.json({ success: true, alreadyConfirmed: true, confirmedAt: rental.returnConfirmedAt });
      }

      // Only allow return on active rentals
      if (!["active", "active_in_use"].includes(rental.status)) {
        return res.status(400).json({ message: `Cannot confirm return for a rental in '${rental.status}' status` });
      }

      const now = new Date();
      await storage.updateRental(rental.id, {
        returnConfirmedAt: now,
        status: "completed",
      });

      // Set trailer to maintenance — admin reactivates after processing
      await storage.updateTrailer(rental.trailerId, { status: "maintenance" });

      // Cancel Stripe subscription if active
      if (rental.stripeSubscriptionId) {
        try {
          const stripe = await getUncachableStripeClient();
          await stripe.subscriptions.cancel(rental.stripeSubscriptionId);
          await storage.updateRental(rental.id, { stripeSubscriptionId: null });
        } catch (subErr) {
          console.error(`[return] Failed to cancel subscription ${rental.stripeSubscriptionId}:`, subErr);
        }
      }

      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "return_confirmed",
        entityType: "rental",
        entityId: rental.id,
        description: `Return confirmed via QR code scan. Trailer set to maintenance. ${rental.stripeSubscriptionId ? "Subscription cancelled." : ""} Deposit refund requires admin action.`,
        metadata: { method: "qr_scan", confirmedBy: user.username },
        isAdminEntry: false,
      });

      // Flag deposit refund needed (only if deposit was actually paid)
      if (rental.depositPaid) {
        await logAuditEvent({
          req,
          userId: null,
          actionType: "deposit_refund_needed",
          entityType: "rental",
          entityId: rental.id,
          description: `ACTION REQUIRED: Security deposit refund needed for completed rental. Process via Stripe dashboard.`,
          isAdminEntry: true,
        });
      }

      // Send return confirmation emails (fire and forget)
      const trailer2 = await storage.getTrailer(rental.trailerId);
      const company2 = rental.companyId ? await storage.getCompany(rental.companyId) : null;
      if (company2) {
        const { sendReturnConfirmedEmails } = await import("./email-service");
        sendReturnConfirmedEmails({
          rentalId: rental.id,
          companyName: company2.name,
          renterEmail: company2.email,
          renterName: company2.ownerName,
          trailerVin: trailer2?.vin ?? "Unknown",
          trailerType: trailer2?.type ?? "",
          confirmedAt: now,
        }).catch(console.error);
      }
      return res.json({ success: true, confirmedAt: now });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Job Listings ─────────────────────────────────────────────────────

  // GET /api/jobs — public list of active listings
  app.get("/api/jobs", async (req: Request, res: Response) => {
    try {
      const listings = await storage.listJobListings(true);
      return res.json(listings);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/admin/jobs — admin list (all)
  app.get("/api/admin/jobs", requireAdmin, async (req: Request, res: Response) => {
    try {
      const listings = await storage.listJobListings(false);
      return res.json(listings);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/admin/jobs — create listing
  app.post("/api/admin/jobs", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { insertJobListingSchema } = await import("@shared/schema");
      const data = insertJobListingSchema.parse(req.body);
      const listing = await storage.createJobListing(data);
      return res.status(201).json(listing);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/admin/jobs/:id — update listing
  app.patch("/api/admin/jobs/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { insertJobListingSchema } = await import("@shared/schema");
      const data = insertJobListingSchema.partial().parse(req.body);
      const listing = await storage.updateJobListing(req.params.id, data);
      if (!listing) return res.status(404).json({ message: "Job listing not found" });
      return res.json(listing);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // DELETE /api/admin/jobs/:id — delete listing
  app.delete("/api/admin/jobs/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const existing = await storage.getJobListing(req.params.id);
      if (!existing) return res.status(404).json({ message: "Job listing not found" });
      await storage.deleteJobListing(req.params.id);
      return res.json({ success: true });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Driver Applications ──────────────────────────────────────────────

  // POST /api/driver-applications — public submit
  app.post("/api/driver-applications", async (req: Request, res: Response) => {
    try {
      const { insertDriverApplicationSchema } = await import("@shared/schema");
      const parsed = insertDriverApplicationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: parsed.error.errors });
      const data = parsed.data;
      const app2 = await storage.createDriverApplication({
        ...data,
        freightTypes: data.freightTypes ?? null,
        desiredPosition: data.desiredPosition ?? null,
        references: data.references ?? null,
        coverLetter: data.coverLetter ?? null,
        jobListingId: data.jobListingId ?? null,
        jobListingTitle: data.jobListingTitle ?? null,
      });
      await logAuditEvent({
        req,
        actionType: "driver_application_submitted",
        entityType: "driver_application",
        entityId: app2.id,
        description: `Driver application submitted by ${app2.fullName} (${app2.email})`,
      });

      // Fire-and-forget emails
      const { sendDriverApplicationConfirmation, sendDriverApplicationAdmin } = await import("./email-service");
      const emailPayload = {
        applicationId: app2.id,
        fullName: app2.fullName,
        email: app2.email,
        phone: app2.phone,
        cdlNumber: app2.cdlNumber ?? undefined,
        cdlClass: app2.cdlClass,
        cdlState: app2.cdlState,
        yearsExperience: app2.yearsExperience,
        desiredPosition: app2.desiredPosition,
        hasTwic: app2.hasTwic,
        hasHazmat: app2.hasHazmat,
        hasTanker: app2.hasTanker,
        coverLetter: app2.coverLetter,
        jobListingTitle: app2.jobListingTitle ?? undefined,
      };
      sendDriverApplicationConfirmation(emailPayload).catch(console.error);
      sendDriverApplicationAdmin(emailPayload).catch(console.error);
      return res.status(201).json({ success: true, id: app2.id });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/admin/driver-applications — admin list
  app.get("/api/admin/driver-applications", requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const apps = await storage.listDriverApplications(status);
      return res.json(apps);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/admin/driver-applications/:id — admin single
  app.get("/api/admin/driver-applications/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const app2 = await storage.getDriverApplication(req.params.id);
      if (!app2) return res.status(404).json({ message: "Application not found" });
      return res.json(app2);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/admin/driver-applications/:id — admin update status/notes
  app.patch("/api/admin/driver-applications/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status, adminNotes } = req.body as { status?: string; adminNotes?: string };
      const allowed = ["pending", "reviewed", "interview", "hired", "rejected"];
      if (status && !allowed.includes(status)) return res.status(400).json({ message: "Invalid status" });
      if (adminNotes !== undefined && adminNotes.length > 2000) return res.status(400).json({ message: "Admin notes too long (max 2000 chars)" });
      const updated = await storage.updateDriverApplication(req.params.id, { ...(status ? { status } : {}), ...(adminNotes !== undefined ? { adminNotes } : {}) });
      if (!updated) return res.status(404).json({ message: "Not found" });
      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "driver_application_updated",
        entityType: "driver_application",
        entityId: req.params.id,
        description: `Driver application updated${status ? ` — status → ${status}` : ""}`,
        isAdminEntry: true,
      });
      return res.json(updated);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Contact Form ─────────────────────────────────────────────────────
  app.post("/api/contact", async (req: Request, res: Response) => {
    try {
      const data = insertContactSchema.parse(req.body);
      const contact = await storage.createContact(data);
      sendContactFormEmail(data).catch(() => {});
      await logAuditEvent({
        req,
        actionType: "contact_form_submitted",
        entityType: "contact",
        entityId: contact.id,
        description: `Contact form submitted by ${data.name} (${data.email}): ${data.subject}`,
      });
      return res.status(201).json({ id: contact.id });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input" });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/contacts", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status } = req.query as { status?: string };
      const list = await storage.listContacts(status);
      return res.json(list);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/contacts/:id/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status } = req.body as { status: string };
      const allowed = ["new", "read", "replied"];
      if (!allowed.includes(status)) return res.status(400).json({ message: "Invalid status" });
      const updated = await storage.updateContactStatus(req.params.id, status);
      if (!updated) return res.status(404).json({ message: "Not found" });
      await logAuditEvent({
        req,
        userId: req.session.userId!,
        actionType: "contact_status_updated",
        entityType: "contact",
        entityId: req.params.id,
        description: `Contact status → ${status}`,
        isAdminEntry: true,
      });
      return res.json(updated);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Testimonials ──────────────────────────────────────────────────────
  app.get("/api/testimonials", async (_req: Request, res: Response) => {
    try {
      const list = await storage.listTestimonials(true);
      return res.json(list);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/testimonials", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const list = await storage.listTestimonials(false);
      return res.json(list);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/testimonials", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertTestimonialSchema.parse(req.body);
      const item = await storage.createTestimonial(data);
      await logAuditEvent({
        req, userId: req.session.userId!, actionType: "testimonial_created",
        entityType: "testimonial", entityId: item.id,
        description: `Testimonial created for ${data.customerName}`, isAdminEntry: true,
      });
      return res.status(201).json(item);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/testimonials/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertTestimonialSchema.partial().parse(req.body);
      const updated = await storage.updateTestimonial(req.params.id, data);
      if (!updated) return res.status(404).json({ message: "Not found" });
      await logAuditEvent({
        req, userId: req.session.userId!, actionType: "testimonial_updated",
        entityType: "testimonial", entityId: req.params.id,
        description: `Testimonial updated: ${Object.keys(data).join(", ")}`, isAdminEntry: true,
      });
      return res.json(updated);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/testimonials/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteTestimonial(req.params.id);
      await logAuditEvent({
        req, userId: req.session.userId!, actionType: "testimonial_deleted",
        entityType: "testimonial", entityId: req.params.id,
        description: `Testimonial deleted`, isAdminEntry: true,
      });
      return res.json({ ok: true });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Site Content ──────────────────────────────────────────────────────
  app.get("/api/site-content", async (_req: Request, res: Response) => {
    try {
      const all = await storage.getAllSiteContent();
      const map: Record<string, string> = {};
      for (const item of all) map[item.key] = item.value;
      return res.json(map);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/site-content", requireAdmin, async (req: Request, res: Response) => {
    try {
      const updates = req.body as Record<string, string>;
      for (const [key, value] of Object.entries(updates)) {
        if (typeof value === "string") await storage.setSiteContent(key, value);
      }
      return res.json({ ok: true });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Password Reset ───────────────────────────────────────────────────
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const user = await storage.getUserByEmail(email);
      // Always respond 200 to avoid user enumeration
      if (!user || !user.isActive) return res.json({ message: "If that email is registered, you will receive a reset link." });
      const token = randomBytes(32).toString("hex");
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await storage.updateUser(user.id, { passwordResetToken: token, passwordResetExpiry: expiry });
      sendPasswordResetEmail({ email: user.username, firstName: user.firstName, resetToken: token }).catch((e: unknown) =>
        console.error("[forgot-password] email error:", e)
      );
      return res.json({ message: "If that email is registered, you will receive a reset link." });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Valid email required" });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, password } = z.object({
        token: z.string().min(1),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }).parse(req.body);
      const user = await storage.getUserByResetToken(token);
      if (!user || !user.passwordResetExpiry || new Date() > user.passwordResetExpiry) {
        return res.status(400).json({ message: "Reset link is invalid or has expired." });
      }
      const hashed = await bcrypt.hash(password, 10);
      await storage.updateUser(user.id, { password: hashed, passwordResetToken: null, passwordResetExpiry: null });
      return res.json({ message: "Password updated successfully." });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Email Logs ────────────────────────────────────────────────────────
  app.get("/api/admin/email-logs", requireAdmin, async (req: Request, res: Response) => {
    try {
      const entityType = req.query.entityType as string | undefined;
      const entityId = req.query.entityId as string | undefined;
      const logs = await storage.getEmailLogs({ entityType, entityId, limit: 200 });
      return res.json(logs);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

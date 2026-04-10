import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import QRCode from "qrcode";
import { storage } from "./storage";
import {
  insertRentalApplicationSchema,
  insertTrailerSchema,
  insertTrailerPhotoSchema,
  loginSchema,
  insertUserSchema,
  insertAdminNoteSchema,
  type RentalApplication,
  type Rental,
} from "@shared/schema";
import { requireAuth, requireAdmin, requireRenter } from "./auth";
import { uploadToCloudinary, isCloudinaryConfigured } from "./cloudinary";
import {
  sendAdminApplicationAlert,
  sendRenterAcknowledgment,
  sendRejectionEmail,
  sendCOIRequest,
  sendMoreInfoRequest,
} from "./email-service";
import { lookupByDot } from "./safer";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export async function registerRoutes(app: Express): Promise<Server> {
  // ── Auth ────────────────────────────────────────────────────────────
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(username);
      if (!user || !user.isActive) return res.status(401).json({ message: "Invalid credentials" });
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ message: "Invalid credentials" });
      req.session.userId = user.id;
      req.session.userRole = user.role;
      return res.json({ id: user.id, email: user.username, firstName: user.firstName, lastName: user.lastName, role: user.role });
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
      req.session.userId = user.id;
      req.session.userRole = user.role;
      return res.status(201).json({ id: user.id, email: user.username, firstName: user.firstName, lastName: user.lastName, role: user.role });
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
      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "create_trailer",
        entityType: "trailer",
        entityId: trailer.id,
        description: `Created trailer: ${trailer.vin} (${trailer.type})`,
        isAdminEntry: true,
        ipAddress: req.ip,
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
      const trailer = await storage.updateTrailer(req.params.id, allowed);
      if (!trailer) return res.status(404).json({ message: "Trailer not found" });
      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "update_trailer",
        entityType: "trailer",
        entityId: trailer.id,
        description: `Updated trailer: ${trailer.vin}`,
        metadata: JSON.stringify(allowed),
        isAdminEntry: true,
        ipAddress: req.ip,
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
      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "retire_trailer",
        entityType: "trailer",
        entityId: trailer.id,
        description: `Retired trailer: ${trailer.vin}`,
        isAdminEntry: true,
        ipAddress: req.ip,
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
      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "restore_trailer",
        entityType: "trailer",
        entityId: trailer.id,
        description: `Restored trailer: ${trailer.vin}`,
        isAdminEntry: true,
        ipAddress: req.ip,
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

  // ── QR Code ─────────────────────────────────────────────────────────
  app.get("/api/admin/trailers/:id/qr", requireAdmin, async (req: Request, res: Response) => {
    try {
      const trailer = await storage.getTrailer(req.params.id);
      if (!trailer) return res.status(404).json({ message: "Trailer not found" });

      const domainUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "https://deluxelogistics.com";
      const pickupUrl = `${domainUrl}/pickup/${trailer.id}`;

      const qrBuffer = await QRCode.toBuffer(pickupUrl, {
        type: "png",
        width: 400,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `attachment; filename="trailer-${trailer.vin}-qr.png"`);
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
      let priceMonthly: number | undefined;
      try {
        const trailer = await storage.getTrailer(application.trailerId);
        trailerVin = trailer?.vin;
        trailerType = trailer?.type;
        priceMonthly = trailer?.priceMonthly;
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
        trailerVin,
        trailerType,
        priceMonthly,
      };

      // Fire emails — non-fatal if SendGrid fails
      await Promise.allSettled([
        sendAdminApplicationAlert(appData),
        sendRenterAcknowledgment(appData),
      ]);

      await storage.createAuditLog({
        actionType: "application_submitted",
        entityType: "rental_application",
        entityId: application.id,
        description: `New rental application from ${application.companyName} (DOT: ${application.dotNumber})`,
        ipAddress: req.ip,
        isAdminEntry: false,
      });

      return res.json({ success: true, id: application.id, renterToken: application.renterToken });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin token magic-link: read-only application view (no session needed) ──
  app.get("/api/applications/admin-token/:adminToken", async (req: Request, res: Response) => {
    try {
      const application = await storage.getRentalApplicationByToken(req.params.adminToken);
      if (!application) return res.status(404).json({ message: "Invalid or expired token" });

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

      await storage.createAuditLog({
        actionType: "renter_replied",
        entityType: "rental_application",
        entityId: application.id,
        description: `Renter (${application.companyName}) submitted a response to more-info request`,
        isAdminEntry: false,
        ipAddress: req.ip,
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
      return res.json(applications);
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

      // Auto-run SAFER if not cached
      if (!application.saferData && application.dotNumber) {
        try {
          const safer = await lookupByDot(application.dotNumber);
          const saferJson = JSON.stringify(safer);
          await storage.updateRentalApplication(application.id, { saferData: saferJson });
          return res.json({ ...application, saferData: saferJson });
        } catch { /* non-fatal: return without SAFER */ }
      }

      return res.json(application);
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
      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: `application_${updates.status ?? "updated"}`,
        entityType: "rental_application",
        entityId: application.id,
        description: `Application ${updates.status ? `status → ${updates.status}` : "updated"}`,
        metadata: JSON.stringify(updates),
        isAdminEntry: true,
        ipAddress: req.ip,
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
      const updated = await storage.updateRentalApplication(application.id, { status: "approved" });
      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "application_approved",
        entityType: "rental_application",
        entityId: application.id,
        description: `Application approved for ${application.companyName}`,
        isAdminEntry: true,
        ipAddress: req.ip,
      });
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

      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "application_rejected",
        entityType: "rental_application",
        entityId: application.id,
        description: `Application rejected for ${application.companyName}${reason ? `: ${reason}` : ""}`,
        isAdminEntry: true,
        ipAddress: req.ip,
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

      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "application_needs_info",
        entityType: "rental_application",
        entityId: application.id,
        description: `More info requested from ${application.companyName}`,
        metadata: JSON.stringify({ message }),
        isAdminEntry: true,
        ipAddress: req.ip,
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

      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "application_coi_requested",
        entityType: "rental_application",
        entityId: application.id,
        description: `COI request sent to ${application.companyName}`,
        isAdminEntry: true,
        ipAddress: req.ip,
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

      const safer = await lookupByDot(application.dotNumber);
      const saferJson = JSON.stringify(safer);
      await storage.updateRentalApplication(application.id, { saferData: saferJson });
      return res.json({ saferData: saferJson, parsed: safer });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: audit logs for an entity ─────────────────────────────────
  app.get("/api/admin/audit/:entityType/:entityId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const logs = await storage.getAuditLogs(req.params.entityType, req.params.entityId);
      return res.json(logs);
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
      return res.json({
        totalTrailers: allTrailers.filter(t => t.status !== "inactive").length,
        availableTrailers: allTrailers.filter(t => t.status === "available").length,
        rentedTrailers: allTrailers.filter(t => t.status === "rented").length,
        pendingApplications: pendingApps.length,
        activeRentals: allRentals.filter(r => r.status === "active" || r.status === "active_in_use").length,
      });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Renter dashboard ────────────────────────────────────────────────
  interface DashboardResponse {
    user: { id: string; email: string; firstName: string; lastName: string; role: string; companyId: string | null | undefined };
    rentals: Rental[];
  }

  app.get("/api/dashboard", requireRenter, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      const userRentals = user.companyId ? await storage.listRentals(user.companyId) : ([] as Rental[]);
      const response: DashboardResponse = {
        user: { id: user.id, email: user.username, firstName: user.firstName, lastName: user.lastName, role: user.role, companyId: user.companyId },
        rentals: userRentals,
      };
      return res.json(response);
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

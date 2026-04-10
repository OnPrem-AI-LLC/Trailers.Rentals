import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import QRCode from "qrcode";
import { storage, type UpdateRental } from "./storage";
import { getUncachableStripeClient, getStripePublishableKey, getStripeSecretKey } from "./stripeClient";
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
import { uploadToCloudinary, uploadRawToCloudinary, isCloudinaryConfigured } from "./cloudinary";
import {
  sendAdminApplicationAlert,
  sendRenterAcknowledgment,
  sendRejectionEmail,
  sendCOIRequest,
  sendMoreInfoRequest,
  sendInviteEmail,
  sendAgreementSignedEmails,
} from "./email-service";
import { lookupByDot, lookupByMc } from "./safer";
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

      // Audit log for note creation on rental applications
      if (data.entityType === "rental_application") {
        await storage.createAuditLog({
          actionType: "note_added",
          entityType: "rental_application",
          entityId: data.entityId,
          description: `Admin added an internal note`,
          isAdminEntry: true,
          ipAddress: req.ip,
        }).catch(() => { /* non-fatal */ });
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
      await storage.createAuditLog({
        userId: user.id,
        actionType: "rental_message_sent",
        entityType: "rental",
        entityId: req.params.id,
        description: `${user.role === "admin" ? "Admin" : "Renter"} sent message on rental ${req.params.id}`,
        isAdminEntry: user.role === "admin",
        ipAddress: req.ip,
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
        authorizedUser: application.authorizedUser,
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

      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "application_approved",
        entityType: "rental_application",
        entityId: application.id,
        description: `Application approved for ${application.companyName} — invite sent to ${application.email}`,
        metadata: JSON.stringify({ companyId: company.id, userId: renterUser.id }),
        isAdminEntry: true,
        ipAddress: req.ip,
      });

      // Send invite email (non-fatal)
      sendInviteEmail(application.email, application.ownerName, inviteToken)
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

      let safer = await lookupByDot(application.dotNumber);
      // MC fallback: if DOT lookup failed and an MC number is on file, try by MC
      if (!safer.success && application.mcNumber) {
        const mcResult = await lookupByMc(application.mcNumber);
        if (mcResult.success) safer = mcResult;
      }
      const saferJson = JSON.stringify(safer);
      await storage.updateRentalApplication(application.id, { saferData: saferJson });

      await storage.createAuditLog({
        actionType: "safer_refreshed",
        entityType: "rental_application",
        entityId: application.id,
        description: `Admin manually refreshed FMCSA SAFER data (${safer.success ? "success" : "failed"})`,
        isAdminEntry: true,
        ipAddress: req.ip,
      }).catch(() => { /* non-fatal */ });

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
  app.get("/api/dashboard", requireRenter, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      const [userRentals, userDocs, company] = await Promise.all([
        user.companyId ? storage.listRentals(user.companyId) : Promise.resolve([] as Rental[]),
        user.companyId ? storage.getDocuments(user.companyId) : Promise.resolve([]),
        user.companyId ? storage.getCompany(user.companyId) : Promise.resolve(undefined),
      ]);
      return res.json({
        user: { id: user.id, email: user.username, firstName: user.firstName, lastName: user.lastName, role: user.role, companyId: user.companyId },
        rentals: userRentals,
        documents: userDocs.filter(d => !d.isAdminOnly), // Never expose admin-only docs to renters
        company: company ?? null,
      });
    } catch (err: unknown) {
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

      await storage.createAuditLog({
        userId: updatedUser.id,
        actionType: "account_registered",
        entityType: "user",
        entityId: updatedUser.id,
        description: `Renter account activated for ${updatedUser.username}`,
        isAdminEntry: false,
        ipAddress: req.ip,
      });

      // Auto log in
      req.session.userId = updatedUser.id;
      req.session.userRole = updatedUser.role;
      return res.json({ id: updatedUser.id, email: updatedUser.username, firstName: updatedUser.firstName, lastName: updatedUser.lastName, role: updatedUser.role });
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

      await storage.createAuditLog({
        userId: user.id,
        actionType: "document_uploaded",
        entityType: "company",
        entityId: user.companyId,
        description: `Document uploaded: ${type} (${req.file.originalname})`,
        isAdminEntry: false,
        ipAddress: req.ip,
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
      const company = await storage.updateCompany(req.params.id, updates);
      if (!company) return res.status(404).json({ message: "Company not found" });
      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "company_edited_by_admin",
        entityType: "company",
        entityId: req.params.id,
        description: `Admin manually updated company profile for ${company.name}`,
        metadata: JSON.stringify(updates),
        isAdminEntry: true,
        ipAddress: req.ip,
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

      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "document_uploaded_by_admin",
        entityType: "company",
        entityId: req.params.id,
        description: `Admin uploaded document: ${type} (${req.file.originalname})`,
        isAdminEntry: true,
        ipAddress: req.ip,
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
    signatureImage: z.string().min(1, "A signature is required"), // base64 PNG data URL — required
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
<p><strong>Deluxe Logistics Inc.</strong><br>818 Corning Way, Martinsburg, WV 25401<br>info@deluxelogistics.com</p>

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

      await storage.createAuditLog({
        userId: user!.id,
        actionType: "agreement_signed",
        entityType: "rental",
        entityId: req.params.rentalId,
        description: `Rental agreement signed by ${signedByName} for rental ${req.params.rentalId} — pickup: ${new Date(pickupDate).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
        metadata: JSON.stringify({ signatureUrl: signatureUrl ?? null, agreementUrl: agreementUrl ?? null, pickupDate }),
        isAdminEntry: false,
        ipAddress: req.ip,
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

      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "agreement_email_sent",
        entityType: "rental",
        entityId: rental.id,
        description: `Admin sent agreement signing request to ${company.email}`,
        isAdminEntry: true,
        ipAddress: req.ip,
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
      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "rental_updated_by_admin",
        entityType: "rental",
        entityId: rental.id,
        description: `Admin updated rental fields: ${Object.keys(body).join(", ")}`,
        metadata: JSON.stringify(body),
        isAdminEntry: true,
        ipAddress: req.ip,
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

      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "admin_invoice_created",
        entityType: "rental",
        entityId: rental.id,
        description: `Admin created one-off invoice $${(amount / 100).toFixed(2)} — "${description}" (Stripe invoice: ${invoice.id})`,
        isAdminEntry: true,
        ipAddress: req.ip,
      });

      return res.json({ success: true, invoiceId: invoice.id });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error("Admin create-invoice error:", err);
      return res.status(500).json({ message: err.message || "Failed to create invoice" });
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
      const price = await stripe.prices.create({
        unit_amount: rental.monthlyRate,
        currency: "usd",
        recurring: { interval: "month" },
        product_data: {
          name: `Trailer Rental — monthly (rental ${rental.id.slice(-8).toUpperCase()})`,
        },
        metadata: { rentalId: rental.id },
      });

      // Calculate trial_end based on rental start date: first month is already covered by deposit.
      // If rental started more than 30 days ago, begin billing immediately (no trial).
      const startedAt = rental.startDate ? new Date(rental.startDate).getTime() : Date.now();
      const daysSinceStart = (Date.now() - startedAt) / (1000 * 60 * 60 * 24);
      const remainingTrialDays = Math.max(0, 30 - Math.floor(daysSinceStart));
      const trialEnd = remainingTrialDays > 0
        ? Math.floor(Date.now() / 1000) + remainingTrialDays * 24 * 60 * 60
        : undefined;

      const subscription = await stripe.subscriptions.create({
        customer: rental.stripeCustomerId,
        items: [{ price: price.id }],
        metadata: { rentalId: rental.id, type: "monthly_rental" },
        payment_settings: {
          payment_method_types: ["card"],
          save_default_payment_method: "on_subscription",
        },
        proration_behavior: "none",
        ...(trialEnd ? { trial_end: trialEnd } : {}),
      } as Parameters<typeof stripe.subscriptions.create>[0]);

      await storage.updateRental(rental.id, { stripeSubscriptionId: subscription.id });

      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "subscription_created_by_admin",
        entityType: "rental",
        entityId: rental.id,
        description: `Admin manually created monthly subscription ${subscription.id} (retry)`,
        isAdminEntry: true,
        ipAddress: req.ip,
      });

      return res.json({ success: true, subscriptionId: subscription.id });
    } catch (err: any) {
      console.error("Admin create-subscription error:", err);
      return res.status(500).json({ message: err.message || "Failed to create subscription" });
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

      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "subscription_cancelled",
        entityType: "rental",
        entityId: rental.id,
        description: `Admin cancelled Stripe subscription ${rental.stripeSubscriptionId}`,
        isAdminEntry: true,
        ipAddress: req.ip,
      });

      return res.json({ success: true });
    } catch (err: any) {
      console.error("Cancel subscription error:", err);
      return res.status(500).json({ message: err.message || "Failed to cancel subscription" });
    }
  });

  // ── Stripe Payment Routes ────────────────────────────────────────────

  // Get Stripe publishable key (for frontend)
  app.get("/api/stripe/config", requireAuth, async (_req: Request, res: Response) => {
    try {
      const publishableKey = await getStripePublishableKey();
      return res.json({ publishableKey });
    } catch (err: any) {
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

      const paymentIntent = await stripe.paymentIntents.create({
        amount: depositAmount,
        currency: "usd",
        customer: customerId,
        description: `2-month security deposit — ${trailerLabel} ($${(rental.monthlyRate / 100).toFixed(2)}/mo × 2)`,
        metadata: { rentalId, type: "deposit", companyId: rental.companyId },
        // Save payment method for off-session recurring billing (monthly subscription)
        setup_future_usage: "off_session",
        automatic_payment_methods: { enabled: true },
      });

      return res.json({
        clientSecret: paymentIntent.client_secret,
        amount: depositAmount,
        trailerLabel,
        monthlyRate: rental.monthlyRate,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input" });
      console.error("PaymentIntent error:", err);
      return res.status(500).json({ message: err.message || "Failed to create payment intent" });
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
    } catch (err: any) {
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
      const baseUrl = `${req.protocol}://${req.get("host")}`;

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
        success_url: `${baseUrl}/dashboard?payment=success&rentalId=${rentalId}`,
        cancel_url: `${baseUrl}/dashboard?payment=cancelled`,
      });

      return res.json({ url: session.url, sessionId: session.id });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error("Stripe deposit session error:", err);
      return res.status(500).json({ message: err.message || "Failed to create payment session" });
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
      const baseUrl = `${req.protocol}://${req.get("host")}`;

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
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error("Stripe subscription session error:", err);
      return res.status(500).json({ message: err.message || "Failed to create subscription session" });
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
    } catch (err: any) {
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
    } catch (err: any) {
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
      // Fetch charges and invoices; we filter client-side by rentalId/subscriptionId
      // to prevent mixing charges across multiple rentals on the same Stripe customer.
      const [chargesResult, invoicesResult] = await Promise.all([
        stripe.charges.list({ customer: rental.stripeCustomerId, limit: 50 }),
        stripe.invoices.list({ customer: rental.stripeCustomerId, limit: 50 }),
      ]);

      // Fetch next billing date from subscription if available
      let nextBillingDate: string | null = null;
      if (rental.stripeSubscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(rental.stripeSubscriptionId) as unknown as { current_period_end?: number };
          if (sub.current_period_end) {
            nextBillingDate = new Date(sub.current_period_end * 1000).toISOString();
          }
        } catch (e) {
          console.warn('[invoices] Could not fetch subscription for next billing date:', e);
        }
      }

      // Build Stripe dashboard links using connector key to detect test vs live mode
      const stripeKey = await getStripeSecretKey();
      const isTestMode = !stripeKey.startsWith('sk_live_');
      const stripeDash = `https://dashboard.stripe.com${isTestMode ? '/test' : ''}`;
      const stripeCustomerUrl = rental.stripeCustomerId
        ? `${stripeDash}/customers/${rental.stripeCustomerId}`
        : null;
      const stripeSubscriptionUrl = rental.stripeSubscriptionId
        ? `${stripeDash}/subscriptions/${rental.stripeSubscriptionId}`
        : null;

      // Filter charges to those linked to this rental by metadata (deposit) or
      // subscription invoices that generated a charge.
      const rentalCharges = chargesResult.data.filter((c) => {
        const meta = (c as unknown as { metadata?: Record<string, string> }).metadata ?? {};
        return meta.rentalId === rental.id;
      });

      // Filter invoices to those linked to this rental's subscription or
      // one-off invoices that have rentalId metadata.
      const rentalInvoices = invoicesResult.data.filter((inv) => {
        const raw = inv as unknown as { subscription?: string | null; metadata?: Record<string, string> };
        if (rental.stripeSubscriptionId && raw.subscription === rental.stripeSubscriptionId) return true;
        return (raw.metadata ?? {}).rentalId === rental.id;
      });

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

  const httpServer = createServer(app);
  return httpServer;
}

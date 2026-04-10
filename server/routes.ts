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
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: error.errors });
      console.error(error);
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
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: error.errors });
      console.error(error);
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
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Upload failed" });
    }
  });

  // ── Trailers (public) ───────────────────────────────────────────────
  app.get("/api/trailers", async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      // Public: exclude inactive unless status explicitly requested
      const filter = status ?? "public";
      const trailerList = await storage.getTrailers(filter === "public" ? undefined : filter, filter === "public");
      return res.json(trailerList);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/trailers/:id", async (req: Request, res: Response) => {
    try {
      const trailer = await storage.getTrailer(req.params.id);
      if (!trailer) return res.status(404).json({ message: "Trailer not found" });
      return res.json(trailer);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Trailers (admin) ────────────────────────────────────────────────
  app.get("/api/admin/trailers", requireAdmin, async (req: Request, res: Response) => {
    try {
      const trailerList = await storage.getTrailers(undefined, false); // include inactive
      return res.json(trailerList);
    } catch (error) {
      console.error(error);
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
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: error.errors });
      console.error(error);
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
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: error.errors });
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Soft-delete (set status to inactive)
  app.delete("/api/admin/trailers/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const trailer = await storage.updateTrailer(req.params.id, { status: "inactive" });
      if (!trailer) return res.status(404).json({ message: "Trailer not found" });
      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "retire_trailer",
        entityType: "trailer",
        entityId: trailer.id,
        description: `Retired (soft-deleted) trailer: ${trailer.vin}`,
        isAdminEntry: true,
        ipAddress: req.ip,
      });
      return res.json({ success: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Restore retired trailer to available
  app.post("/api/admin/trailers/:id/restore", requireAdmin, async (req: Request, res: Response) => {
    try {
      const trailer = await storage.updateTrailer(req.params.id, { status: "available" });
      if (!trailer) return res.status(404).json({ message: "Trailer not found" });
      await storage.createAuditLog({
        userId: req.session.userId!,
        actionType: "restore_trailer",
        entityType: "trailer",
        entityId: trailer.id,
        description: `Restored trailer to available: ${trailer.vin}`,
        isAdminEntry: true,
        ipAddress: req.ip,
      });
      return res.json(trailer);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Trailer Photos ───────────────────────────────────────────────────
  app.post("/api/admin/trailers/:id/photos", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { url, isPrimary, displayOrder } = insertTrailerPhotoSchema.omit({ trailerId: true }).parse(req.body);
      const photo = await storage.addTrailerPhoto({ trailerId: req.params.id, url, isPrimary: isPrimary ?? false, displayOrder: displayOrder ?? 0 });
      return res.json(photo);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: error.errors });
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/photos/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteTrailerPhoto(req.params.id);
      return res.json({ success: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── QR Code ─────────────────────────────────────────────────────────
  app.get("/api/admin/trailers/:id/qr", requireAdmin, async (req: Request, res: Response) => {
    try {
      const trailer = await storage.getTrailer(req.params.id);
      if (!trailer) return res.status(404).json({ message: "Trailer not found" });

      const domain = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "https://deluxelogistics.com";
      const pickupUrl = `${domain}/pickup/${trailer.id}`;

      const qrBuffer = await QRCode.toBuffer(pickupUrl, {
        type: "png",
        width: 400,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `attachment; filename="trailer-${trailer.vin}-qr.png"`);
      return res.send(qrBuffer);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin Notes ──────────────────────────────────────────────────────
  app.get("/api/admin/notes/:entityType/:entityId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const notes = await storage.getAdminNotes(req.params.entityType, req.params.entityId);
      return res.json(notes);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/notes", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertAdminNoteSchema.parse({ ...req.body, authorId: req.session.userId });
      const note = await storage.createAdminNote(data);
      return res.json(note);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: error.errors });
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/notes/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteAdminNote(req.params.id);
      return res.json({ success: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Rental Applications ─────────────────────────────────────────────
  app.post("/api/applications", async (req: Request, res: Response) => {
    try {
      const data = insertRentalApplicationSchema.parse(req.body);
      const adminToken = randomBytes(32).toString("hex");
      const application = await storage.createRentalApplication({ ...data, adminToken, status: "pending" });
      return res.json({ success: true, id: application.id });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: error.errors });
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/applications", requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const applications = await storage.listRentalApplications(status);
      return res.json(applications);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/applications/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const application = await storage.getRentalApplication(req.params.id);
      if (!application) return res.status(404).json({ message: "Application not found" });
      return res.json(application);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

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
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: error.errors });
      console.error(error);
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
    } catch (error) {
      console.error(error);
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
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

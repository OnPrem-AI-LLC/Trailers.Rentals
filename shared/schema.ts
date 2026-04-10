import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Users ──────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(), // stores email address
  password: text("password").notNull(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  role: text("role").notNull().default("renter"), // "admin" | "renter"
  companyId: varchar("company_id"),
  isActive: boolean("is_active").notNull().default(true),
  inviteToken: varchar("invite_token"),
  inviteExpiry: timestamp("invite_expiry"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Companies ──────────────────────────────────────────────────────────
export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ownerName: text("owner_name").notNull(),
  authorizedUser: text("authorized_user"),
  email: text("email").notNull(),
  mcNumber: text("mc_number"),
  dotNumber: text("dot_number"),
  phone: text("phone").notNull(),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Trailers ───────────────────────────────────────────────────────────
export const trailers = pgTable("trailers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vin: text("vin").notNull().unique(),
  type: text("type").notNull(), // "reefer" | "dry_van" | "flatbed" | "chassis" | "specialized"
  make: text("make"),
  model: text("model"),
  year: text("year"),
  priceMonthly: integer("price_monthly").notNull(), // in cents
  engineHourRate: integer("engine_hour_rate"), // cents per hour, reefers only
  status: text("status").notNull().default("available"), // "available" | "rented" | "maintenance" | "inactive"
  description: text("description"),
  features: text("features"), // JSON array of feature strings
  registrationUrl: text("registration_url"), // admin-only document
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Trailer Photos ─────────────────────────────────────────────────────
export const trailerPhotos = pgTable("trailer_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trailerId: varchar("trailer_id").notNull(),
  url: text("url").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Rental Applications ────────────────────────────────────────────────
export const rentalApplications = pgTable("rental_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trailerId: varchar("trailer_id").notNull(),
  companyName: text("company_name").notNull(),
  ownerName: text("owner_name").notNull(),
  authorizedUser: text("authorized_user"),
  email: text("email").notNull(),
  mcNumber: text("mc_number"),
  dotNumber: text("dot_number").notNull(),
  phone: text("phone").notNull(),
  intendedUse: text("intended_use").notNull(),
  intendedUseDetails: text("intended_use_details"),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected" | "needs_info"
  adminNotes: text("admin_notes"),
  saferData: text("safer_data"), // JSON string from FMCSA
  adminToken: varchar("admin_token").unique(), // one-time email link token
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Rentals ────────────────────────────────────────────────────────────
export const rentals = pgTable("rentals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar("application_id"),
  trailerId: varchar("trailer_id").notNull(),
  companyId: varchar("company_id").notNull(),
  userId: varchar("user_id"),
  status: text("status").notNull().default("pending_agreement"),
  // "pending_agreement" | "pending_payment" | "active" | "active_in_use" | "completed" | "cancelled"
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  pickupDate: timestamp("pickup_date"),
  agreementSignedAt: timestamp("agreement_signed_at"),
  agreementUrl: text("agreement_url"),
  signatureUrl: text("signature_url"),
  pickupToken: varchar("pickup_token").unique(),
  monthlyRate: integer("monthly_rate").notNull(), // in cents
  depositPaid: boolean("deposit_paid").notNull().default(false),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Documents ──────────────────────────────────────────────────────────
export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id"),
  rentalId: varchar("rental_id"),
  type: text("type").notNull(), // "coi" | "certificate_of_authority" | "drivers_license" | "registration" | "agreement"
  url: text("url").notNull(),
  fileName: text("file_name").notNull(),
  isAdminOnly: boolean("is_admin_only").notNull().default(false),
  uploadedBy: varchar("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Audit Logs ─────────────────────────────────────────────────────────
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  actionType: text("action_type").notNull(),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  description: text("description").notNull(),
  metadata: text("metadata"), // JSON string
  ipAddress: text("ip_address"),
  isAdminEntry: boolean("is_admin_entry").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Relations ──────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ one }) => ({
  company: one(companies, { fields: [users.companyId], references: [companies.id] }),
}));

export const trailersRelations = relations(trailers, ({ many }) => ({
  photos: many(trailerPhotos),
}));

export const trailerPhotosRelations = relations(trailerPhotos, ({ one }) => ({
  trailer: one(trailers, { fields: [trailerPhotos.trailerId], references: [trailers.id] }),
}));

// ── Insert Schemas ─────────────────────────────────────────────────────
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  inviteToken: true,
  inviteExpiry: true,
});

export const loginSchema = z.object({
  username: z.string().email("Valid email required"),
  password: z.string().min(1, "Password required"),
});

export const insertTrailerSchema = createInsertSchema(trailers).omit({
  id: true,
  createdAt: true,
}).extend({
  vin: z.string().min(1, "VIN is required"),
  type: z.string().min(1, "Trailer type is required"),
  priceMonthly: z.number().min(1, "Price is required"),
});

export const insertTrailerPhotoSchema = createInsertSchema(trailerPhotos).omit({
  id: true,
  createdAt: true,
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
});

export const insertRentalApplicationSchema = createInsertSchema(rentalApplications).omit({
  id: true,
  createdAt: true,
  status: true,
  adminNotes: true,
  saferData: true,
  adminToken: true,
}).extend({
  companyName: z.string().min(1, "Company name is required"),
  ownerName: z.string().min(1, "Owner name is required"),
  email: z.string().email("Valid email required"),
  dotNumber: z.string().min(1, "DOT number is required"),
  phone: z.string().min(1, "Phone number is required"),
  intendedUse: z.string().min(1, "Intended use is required"),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

// ── Types ──────────────────────────────────────────────────────────────
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertTrailer = z.infer<typeof insertTrailerSchema>;
export type Trailer = typeof trailers.$inferSelect;
export type InsertTrailerPhoto = z.infer<typeof insertTrailerPhotoSchema>;
export type TrailerPhoto = typeof trailerPhotos.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;
export type InsertRentalApplication = z.infer<typeof insertRentalApplicationSchema>;
export type RentalApplication = typeof rentalApplications.$inferSelect;
export type Rental = typeof rentals.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Trailer with photos joined
export type TrailerWithPhotos = Trailer & { photos: TrailerPhoto[] };

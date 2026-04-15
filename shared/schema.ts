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
  passwordResetToken: varchar("password_reset_token"),
  passwordResetExpiry: timestamp("password_reset_expiry"),
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
  driverLicenseNumber: text("driver_license_number"),
  adminOverrideFields: text("admin_override_fields"),
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
  location: text("location"), // yard/city location e.g. "Martinsburg, WV"
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
  companyId: varchar("company_id"), // set after approval, links to companies table
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
  adminToken: varchar("admin_token").unique(), // one-time admin email link token
  renterToken: varchar("renter_token").unique(), // token used for renter response page
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
  signedByName: text("signed_by_name"),
  pickupToken: varchar("pickup_token").unique(),
  pickupConfirmedAt: timestamp("pickup_confirmed_at"),
  returnToken: varchar("return_token").unique(),
  returnConfirmedAt: timestamp("return_confirmed_at"),
  monthlyRate: integer("monthly_rate").notNull(), // in cents
  depositPaid: boolean("deposit_paid").notNull().default(false),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeDepositIntentId: text("stripe_deposit_intent_id"), // active deposit PaymentIntent (reused to prevent duplicates)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Engine Hour Entries ────────────────────────────────────────────────
export const engineHourEntries = pgTable("engine_hour_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rentalId: varchar("rental_id").notNull(),
  currentReading: integer("current_reading").notNull(),
  previousReading: integer("previous_reading"),
  hoursUsed: integer("hours_used"),
  rateAtTime: integer("rate_at_time"),
  calculatedCharge: integer("calculated_charge"),
  entryType: text("entry_type").notNull().default("renter_submitted"),
  enteredBy: varchar("entered_by"),
  notes: text("notes"),
  stripeInvoiceItemId: text("stripe_invoice_item_id"),
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

// ── Admin Notes ────────────────────────────────────────────────────────
// Structured notes attached to applications, rentals, or companies by admin staff
export const adminNotes = pgTable("admin_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  authorId: varchar("author_id").notNull(), // admin user who wrote it
  entityType: text("entity_type").notNull(), // "rental_application" | "rental" | "company" | "trailer"
  entityId: varchar("entity_id").notNull(),
  body: text("body").notNull(),
  isPinned: boolean("is_pinned").notNull().default(false),
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

// ── Check-in Photos ───────────────────────────────────────────────────
export const checkinPhotos = pgTable("checkin_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rentalId: varchar("rental_id").notNull(),
  url: text("url").notNull(),
  label: text("label"), // e.g. "front", "rear", "left", "right"
  uploadedBy: varchar("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Driver Applications ────────────────────────────────────────────────
export const driverApplications = pgTable("driver_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  cdlNumber: text("cdl_number").notNull(),
  cdlState: text("cdl_state").notNull(),
  cdlClass: text("cdl_class").notNull(), // "A" | "B" | "C"
  yearsExperience: integer("years_experience").notNull(),
  freightTypes: text("freight_types"), // JSON string array
  desiredPosition: text("desired_position"), // "otr" | "regional" | "local"
  hasTwic: boolean("has_twic").notNull().default(false),
  hasHazmat: boolean("has_hazmat").notNull().default(false),
  hasTanker: boolean("has_tanker").notNull().default(false),
  references: text("refs"), // free-form text (column is named "refs" to avoid SQL reserved word)
  coverLetter: text("cover_letter"),
  resumeUrl: text("resume_url"),
  status: text("status").notNull().default("pending"), // "pending" | "reviewed" | "interview" | "hired" | "rejected"
  adminNotes: text("admin_notes"),
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

export const insertAdminNoteSchema = createInsertSchema(adminNotes).omit({
  id: true,
  createdAt: true,
}).extend({
  body: z.string().min(1, "Note body is required"),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  authorId: z.string().min(1),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertDriverApplicationSchema = createInsertSchema(driverApplications).omit({
  id: true,
  createdAt: true,
  status: true,
  adminNotes: true,
  resumeUrl: true,
}).extend({
  fullName: z.string().min(2, "Full name required"),
  email: z.string().email("Valid email required"),
  phone: z.string().min(7, "Phone required"),
  cdlNumber: z.string().min(1, "CDL number required"),
  cdlState: z.string().length(2, "2-letter state code required"),
  cdlClass: z.enum(["A", "B", "C"]),
  yearsExperience: z.number().int().min(0).max(60),
  desiredPosition: z.enum(["otr", "regional", "local"]).optional(),
  coverLetter: z.string().max(2000).optional(),
  references: z.string().max(1000).optional(),
});

export const insertEngineHourEntrySchema = createInsertSchema(engineHourEntries).omit({
  id: true,
  createdAt: true,
  previousReading: true,
  hoursUsed: true,
  rateAtTime: true,
  calculatedCharge: true,
  stripeInvoiceItemId: true,
}).extend({
  currentReading: z.number().int().min(0, "Reading must be 0 or greater"),
  notes: z.string().max(500).optional(),
});

// ── Contacts ───────────────────────────────────────────────────────────
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"), // "new" | "read" | "replied"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertContactSchema = createInsertSchema(contacts).omit({ id: true, status: true, createdAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

// ── Testimonials ────────────────────────────────────────────────────────
export const testimonials = pgTable("testimonials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerName: text("customer_name").notNull(),
  companyName: text("company_name"),
  quote: text("quote").notNull(),
  videoUrl: text("video_url"),
  rating: integer("rating").default(5),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertTestimonialSchema = createInsertSchema(testimonials).omit({ id: true, createdAt: true });
export type InsertTestimonial = z.infer<typeof insertTestimonialSchema>;
export type Testimonial = typeof testimonials.$inferSelect;

// ── Site Content ────────────────────────────────────────────────────────
export const siteContent = pgTable("site_content", {
  key: varchar("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type SiteContent = typeof siteContent.$inferSelect;

// ── Email Logs ───────────────────────────────────────────────────────────
export const emailLogs = pgTable("email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  template: text("template").notNull(),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  status: text("status").notNull().default("sent"), // "sent" | "failed" | "skipped"
  error: text("error"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});
export type EmailLog = typeof emailLogs.$inferSelect;

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
export type InsertAdminNote = z.infer<typeof insertAdminNoteSchema>;
export type AdminNote = typeof adminNotes.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertEngineHourEntry = z.infer<typeof insertEngineHourEntrySchema>;
export type EngineHourEntry = typeof engineHourEntries.$inferSelect;
export type InsertDriverApplication = z.infer<typeof insertDriverApplicationSchema>;
export type DriverApplication = typeof driverApplications.$inferSelect;
export type CheckinPhoto = typeof checkinPhotos.$inferSelect;

// Trailer with photos joined
export type TrailerWithPhotos = Trailer & { photos: TrailerPhoto[] };

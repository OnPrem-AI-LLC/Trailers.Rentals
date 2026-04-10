import {
  type User,
  type InsertUser,
  type Trailer,
  type InsertTrailer,
  type TrailerPhoto,
  type InsertTrailerPhoto,
  type TrailerWithPhotos,
  type Company,
  type InsertCompany,
  type RentalApplication,
  type Rental,
  type Document,
  type InsertDocument,
  type AuditLog,
  type InsertAuditLog,
  type AdminNote,
  type InsertAdminNote,
  type EngineHourEntry,
  type DriverApplication,
  users,
  trailers,
  trailerPhotos,
  companies,
  rentalApplications,
  rentals,
  documents,
  auditLogs,
  adminNotes,
  engineHourEntries,
  driverApplications,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, ne } from "drizzle-orm";

// Inferred insert types from Drizzle (include all columns, auto-gen fields are optional)
type InsertRentalApplication = typeof rentalApplications.$inferInsert;
type UpdateRentalApplication = Partial<Omit<InsertRentalApplication, "id" | "createdAt">>;
type InsertRental = Omit<typeof rentals.$inferInsert, "id" | "createdAt">;
export type UpdateRental = Partial<Omit<typeof rentals.$inferInsert, "id" | "createdAt">>;
// Full Drizzle insert type for users (includes inviteToken / inviteExpiry)
type InsertUserFull = typeof users.$inferInsert;

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByInviteToken(token: string): Promise<User | undefined>;
  createUser(user: typeof users.$inferInsert): Promise<User>;
  updateUser(id: string, data: Partial<typeof users.$inferInsert>): Promise<User | undefined>;

  // Trailers
  getTrailers(status?: string, excludeInactive?: boolean): Promise<TrailerWithPhotos[]>;
  getTrailer(id: string): Promise<TrailerWithPhotos | undefined>;
  createTrailer(trailer: InsertTrailer): Promise<Trailer>;
  updateTrailer(id: string, data: Partial<InsertTrailer>): Promise<Trailer | undefined>;

  // Trailer Photos
  addTrailerPhoto(photo: InsertTrailerPhoto): Promise<TrailerPhoto>;
  updateTrailerPhoto(id: string, data: Partial<Pick<TrailerPhoto, "isPrimary" | "displayOrder">>): Promise<TrailerPhoto | undefined>;
  getTrailerPhoto(id: string): Promise<TrailerPhoto | undefined>;
  deleteTrailerPhoto(id: string): Promise<void>;

  // Companies
  getCompany(id: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined>;

  // Rental Applications
  createRentalApplication(app: InsertRentalApplication): Promise<RentalApplication>;
  getRentalApplication(id: string): Promise<RentalApplication | undefined>;
  getRentalApplicationByToken(token: string): Promise<RentalApplication | undefined>;
  getRentalApplicationByRenterToken(renterToken: string): Promise<RentalApplication | undefined>;
  listRentalApplications(status?: string): Promise<RentalApplication[]>;
  updateRentalApplication(id: string, data: UpdateRentalApplication): Promise<RentalApplication | undefined>;

  // Rentals
  getRental(id: string): Promise<Rental | undefined>;
  getRentalBySubscriptionId(subscriptionId: string): Promise<Rental | undefined>;
  getRentalByPickupToken(token: string): Promise<Rental | undefined>;
  getRentalByReturnToken(token: string): Promise<Rental | undefined>;
  listRentals(companyId?: string): Promise<Rental[]>;
  createRental(rental: InsertRental): Promise<Rental>;
  updateRental(id: string, data: UpdateRental): Promise<Rental | undefined>;

  // Documents
  createDocument(doc: InsertDocument): Promise<Document>;
  getDocument(id: string): Promise<Document | undefined>;
  getDocuments(companyId?: string, rentalId?: string): Promise<Document[]>;
  deleteDocument(id: string): Promise<void>;

  // Admin Notes
  createAdminNote(note: InsertAdminNote): Promise<AdminNote>;
  getAdminNotes(entityType: string, entityId: string): Promise<AdminNote[]>;
  deleteAdminNote(id: string): Promise<void>;

  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(entityType?: string, entityId?: string): Promise<AuditLog[]>;

  // Engine Hour Entries
  createEngineHourEntry(entry: typeof engineHourEntries.$inferInsert): Promise<EngineHourEntry>;
  getEngineHourEntries(rentalId: string): Promise<EngineHourEntry[]>;
  getLatestEngineHourEntry(rentalId: string): Promise<EngineHourEntry | undefined>;
  updateEngineHourEntry(id: string, data: Partial<typeof engineHourEntries.$inferInsert>): Promise<EngineHourEntry | undefined>;

  // Driver Applications
  createDriverApplication(data: typeof driverApplications.$inferInsert): Promise<DriverApplication>;
  getDriverApplication(id: string): Promise<DriverApplication | undefined>;
  listDriverApplications(status?: string): Promise<DriverApplication[]>;
  updateDriverApplication(id: string, data: Partial<typeof driverApplications.$inferInsert>): Promise<DriverApplication | undefined>;
}

export class DatabaseStorage implements IStorage {
  // ── Users ──────────────────────────────────────────────────────────
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ?? undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, email));
    return user ?? undefined;
  }

  async getUserByInviteToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.inviteToken, token));
    return user ?? undefined;
  }

  async createUser(insertUser: InsertUserFull): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUserFull>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user ?? undefined;
  }

  // ── Trailers ───────────────────────────────────────────────────────
  async getTrailers(status?: string, excludeInactive = false): Promise<TrailerWithPhotos[]> {
    let rows: Trailer[];
    if (status) {
      rows = await db.select().from(trailers).where(eq(trailers.status, status)).orderBy(desc(trailers.createdAt));
    } else if (excludeInactive) {
      rows = await db.select().from(trailers).where(ne(trailers.status, "inactive")).orderBy(desc(trailers.createdAt));
    } else {
      rows = await db.select().from(trailers).orderBy(desc(trailers.createdAt));
    }

    const photos = await db.select().from(trailerPhotos);
    return rows.map((t) => ({
      ...t,
      photos: photos
        .filter((p) => p.trailerId === t.id)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    }));
  }

  async getTrailer(id: string): Promise<TrailerWithPhotos | undefined> {
    const [trailer] = await db.select().from(trailers).where(eq(trailers.id, id));
    if (!trailer) return undefined;
    const photos = await db
      .select()
      .from(trailerPhotos)
      .where(eq(trailerPhotos.trailerId, id))
      .orderBy(trailerPhotos.displayOrder);
    return { ...trailer, photos };
  }

  async createTrailer(insertTrailer: InsertTrailer): Promise<Trailer> {
    const [trailer] = await db.insert(trailers).values(insertTrailer).returning();
    return trailer;
  }

  async updateTrailer(id: string, data: Partial<InsertTrailer>): Promise<Trailer | undefined> {
    const [trailer] = await db.update(trailers).set(data).where(eq(trailers.id, id)).returning();
    return trailer ?? undefined;
  }

  // ── Trailer Photos ─────────────────────────────────────────────────
  async addTrailerPhoto(photo: InsertTrailerPhoto): Promise<TrailerPhoto> {
    const [row] = await db.insert(trailerPhotos).values(photo).returning();
    return row;
  }

  async updateTrailerPhoto(
    id: string,
    data: Partial<Pick<TrailerPhoto, "isPrimary" | "displayOrder">>
  ): Promise<TrailerPhoto | undefined> {
    const [row] = await db.update(trailerPhotos).set(data).where(eq(trailerPhotos.id, id)).returning();
    return row ?? undefined;
  }

  async getTrailerPhoto(id: string): Promise<TrailerPhoto | undefined> {
    const [row] = await db.select().from(trailerPhotos).where(eq(trailerPhotos.id, id));
    return row ?? undefined;
  }

  async deleteTrailerPhoto(id: string): Promise<void> {
    await db.delete(trailerPhotos).where(eq(trailerPhotos.id, id));
  }

  // ── Companies ──────────────────────────────────────────────────────
  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company ?? undefined;
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const [company] = await db.insert(companies).values(insertCompany).returning();
    return company;
  }

  async updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined> {
    const [company] = await db.update(companies).set(data).where(eq(companies.id, id)).returning();
    return company ?? undefined;
  }

  // ── Rental Applications ────────────────────────────────────────────
  async createRentalApplication(app: InsertRentalApplication): Promise<RentalApplication> {
    const [row] = await db.insert(rentalApplications).values(app).returning();
    return row;
  }

  async getRentalApplication(id: string): Promise<RentalApplication | undefined> {
    const [row] = await db.select().from(rentalApplications).where(eq(rentalApplications.id, id));
    return row ?? undefined;
  }

  async getRentalApplicationByToken(token: string): Promise<RentalApplication | undefined> {
    const [row] = await db
      .select()
      .from(rentalApplications)
      .where(eq(rentalApplications.adminToken, token));
    return row ?? undefined;
  }

  async getRentalApplicationByRenterToken(renterToken: string): Promise<RentalApplication | undefined> {
    const [row] = await db
      .select()
      .from(rentalApplications)
      .where(eq(rentalApplications.renterToken, renterToken));
    return row ?? undefined;
  }

  async listRentalApplications(status?: string): Promise<RentalApplication[]> {
    if (status) {
      return db
        .select()
        .from(rentalApplications)
        .where(eq(rentalApplications.status, status))
        .orderBy(desc(rentalApplications.createdAt));
    }
    return db.select().from(rentalApplications).orderBy(desc(rentalApplications.createdAt));
  }

  async updateRentalApplication(
    id: string,
    data: UpdateRentalApplication
  ): Promise<RentalApplication | undefined> {
    const [row] = await db
      .update(rentalApplications)
      .set(data)
      .where(eq(rentalApplications.id, id))
      .returning();
    return row ?? undefined;
  }

  // ── Rentals ────────────────────────────────────────────────────────
  async getRental(id: string): Promise<Rental | undefined> {
    const [row] = await db.select().from(rentals).where(eq(rentals.id, id));
    return row ?? undefined;
  }

  async getRentalBySubscriptionId(subscriptionId: string): Promise<Rental | undefined> {
    const [row] = await db.select().from(rentals).where(eq(rentals.stripeSubscriptionId, subscriptionId));
    return row ?? undefined;
  }

  async getRentalByPickupToken(token: string): Promise<Rental | undefined> {
    const [row] = await db.select().from(rentals).where(eq(rentals.pickupToken, token));
    return row ?? undefined;
  }

  async getRentalByReturnToken(token: string): Promise<Rental | undefined> {
    const [row] = await db.select().from(rentals).where(eq(rentals.returnToken, token));
    return row ?? undefined;
  }

  async listRentals(companyId?: string): Promise<Rental[]> {
    if (companyId) {
      return db
        .select()
        .from(rentals)
        .where(eq(rentals.companyId, companyId))
        .orderBy(desc(rentals.createdAt));
    }
    return db.select().from(rentals).orderBy(desc(rentals.createdAt));
  }

  async createRental(rental: InsertRental): Promise<Rental> {
    const [row] = await db.insert(rentals).values(rental).returning();
    return row;
  }

  async updateRental(id: string, data: UpdateRental): Promise<Rental | undefined> {
    const [row] = await db.update(rentals).set(data).where(eq(rentals.id, id)).returning();
    return row ?? undefined;
  }

  // ── Documents ──────────────────────────────────────────────────────
  async createDocument(doc: InsertDocument): Promise<Document> {
    const [row] = await db.insert(documents).values(doc).returning();
    return row;
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [row] = await db.select().from(documents).where(eq(documents.id, id));
    return row ?? undefined;
  }

  async getDocuments(companyId?: string, rentalId?: string): Promise<Document[]> {
    if (companyId) {
      return db
        .select()
        .from(documents)
        .where(eq(documents.companyId, companyId))
        .orderBy(desc(documents.createdAt));
    }
    if (rentalId) {
      return db
        .select()
        .from(documents)
        .where(eq(documents.rentalId, rentalId))
        .orderBy(desc(documents.createdAt));
    }
    return db.select().from(documents).orderBy(desc(documents.createdAt));
  }

  // ── Admin Notes ────────────────────────────────────────────────────
  async createAdminNote(note: InsertAdminNote): Promise<AdminNote> {
    const [row] = await db.insert(adminNotes).values(note).returning();
    return row;
  }

  async getAdminNotes(entityType: string, entityId: string): Promise<AdminNote[]> {
    return db
      .select()
      .from(adminNotes)
      .where(
        and(eq(adminNotes.entityType, entityType), eq(adminNotes.entityId, entityId))
      )
      .orderBy(desc(adminNotes.createdAt));
  }

  async deleteAdminNote(id: string): Promise<void> {
    await db.delete(adminNotes).where(eq(adminNotes.id, id));
  }

  async deleteDocument(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  // ── Audit Logs ─────────────────────────────────────────────────────
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [row] = await db.insert(auditLogs).values(log).returning();
    return row;
  }

  async getAuditLogs(entityType?: string, entityId?: string): Promise<AuditLog[]> {
    if (entityType && entityId) {
      return db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityType, entityType),
            eq(auditLogs.entityId, entityId)
          )
        )
        .orderBy(desc(auditLogs.createdAt));
    }
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));
  }

  // ── Engine Hour Entries ────────────────────────────────────────────
  async createEngineHourEntry(entry: typeof engineHourEntries.$inferInsert): Promise<EngineHourEntry> {
    const [row] = await db.insert(engineHourEntries).values(entry).returning();
    return row;
  }

  async getEngineHourEntries(rentalId: string): Promise<EngineHourEntry[]> {
    return db
      .select()
      .from(engineHourEntries)
      .where(eq(engineHourEntries.rentalId, rentalId))
      .orderBy(desc(engineHourEntries.createdAt));
  }

  async getLatestEngineHourEntry(rentalId: string): Promise<EngineHourEntry | undefined> {
    const [row] = await db
      .select()
      .from(engineHourEntries)
      .where(eq(engineHourEntries.rentalId, rentalId))
      .orderBy(desc(engineHourEntries.createdAt))
      .limit(1);
    return row ?? undefined;
  }

  async updateEngineHourEntry(id: string, data: Partial<typeof engineHourEntries.$inferInsert>): Promise<EngineHourEntry | undefined> {
    const [row] = await db
      .update(engineHourEntries)
      .set(data)
      .where(eq(engineHourEntries.id, id))
      .returning();
    return row ?? undefined;
  }

  // ── Driver Applications ─────────────────────────────────────────────
  async createDriverApplication(data: typeof driverApplications.$inferInsert): Promise<DriverApplication> {
    const [row] = await db.insert(driverApplications).values(data).returning();
    return row;
  }

  async getDriverApplication(id: string): Promise<DriverApplication | undefined> {
    const [row] = await db.select().from(driverApplications).where(eq(driverApplications.id, id));
    return row ?? undefined;
  }

  async listDriverApplications(status?: string): Promise<DriverApplication[]> {
    if (status) {
      return db
        .select()
        .from(driverApplications)
        .where(eq(driverApplications.status, status))
        .orderBy(desc(driverApplications.createdAt));
    }
    return db.select().from(driverApplications).orderBy(desc(driverApplications.createdAt));
  }

  async updateDriverApplication(id: string, data: Partial<typeof driverApplications.$inferInsert>): Promise<DriverApplication | undefined> {
    const [row] = await db
      .update(driverApplications)
      .set(data)
      .where(eq(driverApplications.id, id))
      .returning();
    return row ?? undefined;
  }
}

export const storage = new DatabaseStorage();

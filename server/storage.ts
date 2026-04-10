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
  type InsertRentalApplication,
  type Rental,
  type Document,
  type InsertDocument,
  type AuditLog,
  type InsertAuditLog,
  users,
  trailers,
  trailerPhotos,
  companies,
  rentalApplications,
  rentals,
  documents,
  auditLogs,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;

  // Trailers
  getTrailers(status?: string): Promise<TrailerWithPhotos[]>;
  getTrailer(id: string): Promise<TrailerWithPhotos | undefined>;
  createTrailer(trailer: InsertTrailer): Promise<Trailer>;
  updateTrailer(id: string, data: Partial<InsertTrailer>): Promise<Trailer | undefined>;

  // Trailer Photos
  addTrailerPhoto(photo: InsertTrailerPhoto): Promise<TrailerPhoto>;
  deleteTrailerPhoto(id: string): Promise<void>;

  // Companies
  getCompany(id: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined>;

  // Rental Applications
  createRentalApplication(app: InsertRentalApplication): Promise<RentalApplication>;
  getRentalApplication(id: string): Promise<RentalApplication | undefined>;
  getRentalApplicationByToken(token: string): Promise<RentalApplication | undefined>;
  listRentalApplications(status?: string): Promise<RentalApplication[]>;
  updateRentalApplication(id: string, data: Partial<RentalApplication>): Promise<RentalApplication | undefined>;

  // Rentals
  getRental(id: string): Promise<Rental | undefined>;
  listRentals(companyId?: string): Promise<Rental[]>;
  createRental(rental: Omit<Rental, "id" | "createdAt">): Promise<Rental>;
  updateRental(id: string, data: Partial<Rental>): Promise<Rental | undefined>;

  // Documents
  createDocument(doc: InsertDocument): Promise<Document>;
  getDocuments(companyId?: string, rentalId?: string): Promise<Document[]>;

  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(entityType?: string, entityId?: string): Promise<AuditLog[]>;
}

export class DatabaseStorage implements IStorage {
  // ── Users ──────────────────────────────────────────────────────────
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  // ── Trailers ───────────────────────────────────────────────────────
  async getTrailers(status?: string): Promise<TrailerWithPhotos[]> {
    const rows = status
      ? await db.select().from(trailers).where(eq(trailers.status, status)).orderBy(desc(trailers.createdAt))
      : await db.select().from(trailers).orderBy(desc(trailers.createdAt));

    const photos = await db.select().from(trailerPhotos);
    return rows.map((t) => ({
      ...t,
      photos: photos.filter((p) => p.trailerId === t.id).sort((a, b) => a.displayOrder - b.displayOrder),
    }));
  }

  async getTrailer(id: string): Promise<TrailerWithPhotos | undefined> {
    const [trailer] = await db.select().from(trailers).where(eq(trailers.id, id));
    if (!trailer) return undefined;
    const photos = await db.select().from(trailerPhotos)
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
    return trailer || undefined;
  }

  // ── Trailer Photos ─────────────────────────────────────────────────
  async addTrailerPhoto(photo: InsertTrailerPhoto): Promise<TrailerPhoto> {
    const [row] = await db.insert(trailerPhotos).values(photo).returning();
    return row;
  }

  async deleteTrailerPhoto(id: string): Promise<void> {
    await db.delete(trailerPhotos).where(eq(trailerPhotos.id, id));
  }

  // ── Companies ──────────────────────────────────────────────────────
  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company || undefined;
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const [company] = await db.insert(companies).values(insertCompany).returning();
    return company;
  }

  async updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined> {
    const [company] = await db.update(companies).set(data).where(eq(companies.id, id)).returning();
    return company || undefined;
  }

  // ── Rental Applications ────────────────────────────────────────────
  async createRentalApplication(app: InsertRentalApplication): Promise<RentalApplication> {
    const [row] = await db.insert(rentalApplications).values(app).returning();
    return row;
  }

  async getRentalApplication(id: string): Promise<RentalApplication | undefined> {
    const [row] = await db.select().from(rentalApplications).where(eq(rentalApplications.id, id));
    return row || undefined;
  }

  async getRentalApplicationByToken(token: string): Promise<RentalApplication | undefined> {
    const [row] = await db.select().from(rentalApplications).where(eq(rentalApplications.adminToken, token));
    return row || undefined;
  }

  async listRentalApplications(status?: string): Promise<RentalApplication[]> {
    if (status) {
      return db.select().from(rentalApplications)
        .where(eq(rentalApplications.status, status))
        .orderBy(desc(rentalApplications.createdAt));
    }
    return db.select().from(rentalApplications).orderBy(desc(rentalApplications.createdAt));
  }

  async updateRentalApplication(id: string, data: Partial<RentalApplication>): Promise<RentalApplication | undefined> {
    const [row] = await db.update(rentalApplications).set(data as any).where(eq(rentalApplications.id, id)).returning();
    return row || undefined;
  }

  // ── Rentals ────────────────────────────────────────────────────────
  async getRental(id: string): Promise<Rental | undefined> {
    const [row] = await db.select().from(rentals).where(eq(rentals.id, id));
    return row || undefined;
  }

  async listRentals(companyId?: string): Promise<Rental[]> {
    if (companyId) {
      return db.select().from(rentals).where(eq(rentals.companyId, companyId)).orderBy(desc(rentals.createdAt));
    }
    return db.select().from(rentals).orderBy(desc(rentals.createdAt));
  }

  async createRental(rental: Omit<Rental, "id" | "createdAt">): Promise<Rental> {
    const [row] = await db.insert(rentals).values(rental as any).returning();
    return row;
  }

  async updateRental(id: string, data: Partial<Rental>): Promise<Rental | undefined> {
    const [row] = await db.update(rentals).set(data as any).where(eq(rentals.id, id)).returning();
    return row || undefined;
  }

  // ── Documents ──────────────────────────────────────────────────────
  async createDocument(doc: InsertDocument): Promise<Document> {
    const [row] = await db.insert(documents).values(doc).returning();
    return row;
  }

  async getDocuments(companyId?: string, rentalId?: string): Promise<Document[]> {
    if (companyId) {
      return db.select().from(documents).where(eq(documents.companyId, companyId)).orderBy(desc(documents.createdAt));
    }
    if (rentalId) {
      return db.select().from(documents).where(eq(documents.rentalId, rentalId)).orderBy(desc(documents.createdAt));
    }
    return db.select().from(documents).orderBy(desc(documents.createdAt));
  }

  // ── Audit Logs ─────────────────────────────────────────────────────
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [row] = await db.insert(auditLogs).values(log).returning();
    return row;
  }

  async getAuditLogs(entityType?: string, entityId?: string): Promise<AuditLog[]> {
    if (entityType && entityId) {
      return db.select().from(auditLogs)
        .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
        .orderBy(desc(auditLogs.createdAt));
    }
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));
  }
}

export const storage = new DatabaseStorage();

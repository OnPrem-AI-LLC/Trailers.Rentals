import {
  type User,
  type InsertUser,
  type ContactRequest,
  type InsertContactRequest,
  type Location,
  type InsertLocation,
  type Benefit,
  type InsertBenefit,
  type Feature,
  type InsertFeature,
  type Testimonial,
  type InsertTestimonial,
  users,
  contactRequests,
  locations,
  benefits,
  features,
  testimonials,
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createContactRequest(request: InsertContactRequest): Promise<ContactRequest>;
  getContactRequests(): Promise<ContactRequest[]>;
  getLocations(): Promise<Location[]>;
  getBenefits(): Promise<Benefit[]>;
  getFeatures(): Promise<Feature[]>;
  getTestimonials(): Promise<Testimonial[]>;
  createLocation(location: InsertLocation): Promise<Location>;
  createBenefit(benefit: InsertBenefit): Promise<Benefit>;
  createFeature(feature: InsertFeature): Promise<Feature>;
  createTestimonial(testimonial: InsertTestimonial): Promise<Testimonial>;
}

// Remove MemStorage - using DatabaseStorage instead

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async createContactRequest(insertRequest: InsertContactRequest): Promise<ContactRequest> {
    const [request] = await db
      .insert(contactRequests)
      .values({
        ...insertRequest,
        newsletter: insertRequest.newsletter ?? "false",
      })
      .returning();
    return request;
  }

  async getContactRequests(): Promise<ContactRequest[]> {
    return await db.select().from(contactRequests);
  }

  async getLocations(): Promise<Location[]> {
    return await db.select().from(locations);
  }

  async getBenefits(): Promise<Benefit[]> {
    return await db.select().from(benefits);
  }

  async getFeatures(): Promise<Feature[]> {
    return await db.select().from(features);
  }

  async getTestimonials(): Promise<Testimonial[]> {
    return await db.select().from(testimonials);
  }

  async createLocation(insertLocation: InsertLocation): Promise<Location> {
    const [location] = await db
      .insert(locations)
      .values(insertLocation)
      .returning();
    return location;
  }

  async createBenefit(insertBenefit: InsertBenefit): Promise<Benefit> {
    const [benefit] = await db
      .insert(benefits)
      .values(insertBenefit)
      .returning();
    return benefit;
  }

  async createFeature(insertFeature: InsertFeature): Promise<Feature> {
    const [feature] = await db
      .insert(features)
      .values(insertFeature)
      .returning();
    return feature;
  }

  async createTestimonial(insertTestimonial: InsertTestimonial): Promise<Testimonial> {
    const [testimonial] = await db
      .insert(testimonials)
      .values(insertTestimonial)
      .returning();
    return testimonial;
  }
}

export const storage = new DatabaseStorage();

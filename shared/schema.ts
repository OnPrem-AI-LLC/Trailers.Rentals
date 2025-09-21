import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const contactRequests = pgTable("contact_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  businessEmail: text("business_email").notNull(),
  companyName: text("company_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  dotNumber: text("dot_number").notNull(),
  primaryLocation: text("primary_location").notNull(),
  currentCustomer: text("current_customer").notNull(),
  interests: text("interests").array().notNull().default(sql`'{}'::text[]`),
  message: text("message"),
  newsletter: text("newsletter").default("false"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertContactRequestSchema = createInsertSchema(contactRequests).omit({
  id: true,
  createdAt: true,
}).extend({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  businessEmail: z.string().email("Valid business email is required"),
  companyName: z.string().min(1, "Company name is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  dotNumber: z.string().min(1, "DOT number is required"),
  primaryLocation: z.string().min(1, "Primary location is required"),
  currentCustomer: z.enum(["yes", "no", "unknown"]),
  interests: z.array(z.string()).min(1, "Please select at least one interest"),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertContactRequest = z.infer<typeof insertContactRequestSchema>;
export type ContactRequest = typeof contactRequests.$inferSelect;

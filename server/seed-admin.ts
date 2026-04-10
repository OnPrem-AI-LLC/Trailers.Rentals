import bcrypt from "bcrypt";
import { storage } from "./storage";

export async function seedAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@deluxelogistics.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "DeluxeAdmin2024!";

  try {
    const existing = await storage.getUserByEmail(adminEmail);
    if (existing) return; // already seeded

    const hashed = await bcrypt.hash(adminPassword, 10);
    await storage.createUser({
      username: adminEmail,
      password: hashed,
      firstName: "Deluxe",
      lastName: "Admin",
      role: "admin",
      isActive: true,
    });
    console.log(`[seed] Admin user created: ${adminEmail}`);
  } catch (err) {
    console.error("[seed] Failed to seed admin user:", err);
  }
}

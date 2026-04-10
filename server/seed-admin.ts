import bcrypt from "bcrypt";
import { storage } from "./storage";

export async function seedAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[seed] WARNING: ADMIN_EMAIL and ADMIN_PASSWORD env vars are not set. " +
        "Admin account will not be seeded in production."
      );
      return;
    }
    // Dev fallback — log a clear warning
    console.warn(
      "[seed] ADMIN_EMAIL/ADMIN_PASSWORD not set — using development defaults. " +
      "Set these env vars before going to production."
    );
  }

  const email = adminEmail ?? "admin@deluxelogistics.com";
  const password = adminPassword ?? "DeluxeAdmin2024!";

  try {
    const existing = await storage.getUserByEmail(email);
    if (existing) return;

    const hashed = await bcrypt.hash(password, 10);
    await storage.createUser({
      username: email,
      password: hashed,
      firstName: "Deluxe",
      lastName: "Admin",
      role: "admin",
      isActive: true,
    });
    console.log(`[seed] Admin user created: ${email}`);
  } catch (err) {
    console.error("[seed] Failed to seed admin user:", err);
  }
}

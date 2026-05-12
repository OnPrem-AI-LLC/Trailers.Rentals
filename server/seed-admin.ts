import bcrypt from "bcrypt";
import { storage } from "./storage";

export async function seedAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn(
      "[seed] ADMIN_EMAIL and ADMIN_PASSWORD env vars are not set. " +
      "Skipping admin seed. Set these env vars to create an admin account."
    );
    return;
  }

  const email = adminEmail;
  const password = adminPassword;

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

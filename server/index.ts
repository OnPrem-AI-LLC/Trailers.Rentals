import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import cron from "node-cron";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedAdminUser } from "./seed-admin";
import { runDataFixes } from "./data-fixes";
import { WebhookHandlers } from "./webhookHandlers";

const PgSession = connectPgSimple(session);

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret && process.env.NODE_ENV !== "development") {
  throw new Error("SESSION_SECRET environment variable is required (set NODE_ENV=development to use a dev fallback)");
}

const app = express();
app.set("trust proxy", 1); // Required for Railway / reverse-proxy environments

// Canonical host: send www.* to the bare domain (trailers.rentals)
app.use((req, res, next) => {
  const host = req.hostname;
  if (host && host.startsWith("www.")) {
    return res.redirect(301, `${req.protocol}://${host.slice(4)}${req.originalUrl}`);
  }
  next();
});
// Helmet's default CSP only allows same-origin scripts, frames and images.
// The deposit page mounts Stripe Elements, which needs Stripe.js and its
// iframes, and photos uploaded through the admin form live on Cloudinary.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "https://js.stripe.com"],
        "frame-src": ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
        "connect-src": ["'self'", "https://api.stripe.com", "https://r.stripe.com"],
        "img-src": ["'self'", "data:", "https://res.cloudinary.com", "https://*.stripe.com"],
      },
    },
  }),
);

// ── Stripe webhook MUST be registered BEFORE express.json() ─────────────
// Webhook needs raw Buffer, not parsed JSON
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) return res.status(400).json({ error: "Missing stripe-signature" });
    const sig = Array.isArray(signature) ? signature[0] : signature;
    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      return res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("Stripe webhook error:", err.message);
      return res.status(400).json({ error: "Webhook processing error" });
    }
  }
);

// ── Serve attached_assets (seed photos) as static files ──────────────────
app.use("/attached_assets", express.static(path.resolve(import.meta.dirname, "..", "attached_assets")));

// ── Body parsing (after webhook route) ──────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Session middleware ───────────────────────────────────────────────────
app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: sessionSecret ?? "deluxe-dev-only-not-for-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// ── Rate limiting on auth endpoints ──────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);

// ── CSRF protection: require JSON content-type on state-changing API requests ─
app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.path.startsWith("/api/")) {
    // Skip webhook (raw body) and file uploads (multipart)
    if (req.path === "/api/stripe/webhook") return next();
    if (req.is("multipart/form-data")) return next();
    // Logout has no body — allow empty requests
    if (req.path === "/api/auth/logout") return next();
    const ct = req.headers["content-type"] || "";
    if (!ct.includes("application/json")) {
      return res.status(415).json({ message: "Content-Type must be application/json" });
    }
  }
  next();
});

// ── Rate limiting on public form endpoints ──────────────────────────────
const publicFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 submissions per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many submissions. Please try again later." },
});
app.use("/api/applications", publicFormLimiter);
app.use("/api/driver-applications", publicFormLimiter);
app.use("/api/contact", publicFormLimiter);
// Unsubscribe is public and must keep working for every recipient (CAN-SPAM),
// and mail providers send RFC 8058 one-click POSTs from shared egress IPs, so
// this limit is deliberately loose: it only stops a flood.
app.use("/unsubscribe", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests. Please try again in a few minutes.",
}));

// ── Request logging ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });

  next();
});

// ── Stripe initialization ────────────────────────────────────────────────
async function initStripe() {
  try {
    const { getStripeClient } = await import("./stripeClient");
    getStripeClient(); // validate keys are set
    log("Stripe client ready");
  } catch (err: any) {
    log(`WARNING: Stripe initialization failed: ${err.message}`);
    // Non-fatal — app continues without Stripe
  }
}

async function runReturnReminders() {
  try {
    const { storage } = await import("./storage");
    const { sendReturnReminderEmail } = await import("./email-service");
    const rentals = await storage.listRentals();
    const now = new Date();
    const targets = [7, 1];

    for (const rental of rentals) {
      if (!["active", "active_in_use"].includes(rental.status)) continue;
      if (!rental.endDate) continue;
      const endDate = new Date(rental.endDate);
      // Compare calendar dates (midnight UTC) to avoid fractional-day drift
      const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      const endUtc = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      const daysUntil = (endUtc - todayUtc) / (1000 * 60 * 60 * 24);
      if (!targets.includes(daysUntil)) continue;

      try {
        const company = rental.companyId ? await storage.getCompany(rental.companyId) : null;
        const trailer = await storage.getTrailer(rental.trailerId);
        const user = rental.userId ? await storage.getUser(rental.userId) : null;
        if (!company || !trailer || !user) continue;

        await sendReturnReminderEmail({
          renterEmail: user.username,
          renterName: `${user.firstName} ${user.lastName}`.trim() || user.username,
          companyName: company.name,
          trailerVin: trailer.vin ?? '',
          trailerType: trailer.type,
          endDate,
          daysUntilReturn: daysUntil,
          rentalId: rental.id,
        });
        log(`[return-reminder] Sent ${daysUntil}-day reminder for rental ${rental.id}`);
      } catch (e: unknown) {
        log(`[return-reminder] Error for rental ${rental.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e: unknown) {
    log(`[return-reminder] Scheduler error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

(async () => {
  await seedAdminUser();
  await runDataFixes();
  await initStripe();

  // Run return reminders daily at 8:00 AM
  cron.schedule("0 8 * * *", () => {
    log("[return-reminder] Running daily return reminder check...");
    runReturnReminders();
  });
  log("[return-reminder] Scheduler registered (daily 8:00 AM)");

  const server = await registerRoutes(app);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof err === "object" && err !== null && "status" in err
      ? (err as { status: number }).status
      : 500;
    const message = typeof err === "object" && err !== null && "message" in err
      ? (err as { message: string }).message
      : "Internal Server Error";
    console.error("[error-handler]", err);
    res.status(status).json({ message });
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT ?? "5000", 10);
  server.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
  });
})();

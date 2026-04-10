# Deluxe Logistics Inc. — Trailer Rental Management Platform

## Project Overview

Full-stack trailer rental management platform for Deluxe Logistics Inc. Rebuilt from a static marketing page into a complete operations platform.

**Design ethos:** Inventory front and center, dark/bold non-cookie-cutter aesthetic.  
**Value props:** NO BS FEES · No mileage fees · Simple / fast / transparent

## Stack

- **Frontend:** React + Vite + Wouter + TanStack Query + Tailwind CSS + shadcn/ui
- **Backend:** Express.js + TypeScript
- **Database:** PostgreSQL via Drizzle ORM
- **Auth:** express-session + connect-pg-simple + bcrypt
- **File storage:** Cloudinary (requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET env vars; degrades gracefully if not set — URL input still works)
- **QR codes:** `qrcode` npm package (generates PNG for pickup codes)
- **Payments:** Stripe (via Replit connector `conn_stripe_01KNWDD4NMZHY2VJ4PNGMJJP97`) — deposit + monthly subscription checkout sessions
- **Email:** SendGrid (SENDGRID_API_KEY set)
- **E-signature:** Built-in typed-name e-signature on `/agreement/:rentalId`

## Architecture

```
client/src/
  pages/
    home.tsx              # Dark homepage with trailer inventory grid
    login.tsx             # Login page (session auth)
    dashboard.tsx         # Renter portal
    trailer-detail.tsx    # Single trailer view + photo carousel + apply CTA
    jobs.tsx              # Driver hiring page
    admin/
      index.tsx           # Admin portal dashboard
      inventory.tsx       # Trailer inventory list (filter/status/retire/restore/QR)
      trailer-form.tsx    # Add/edit trailer form (Cloudinary upload + URL paste)
  components/
    header.tsx            # Sticky nav with auth-aware links
    footer.tsx            # Minimal footer
    trailer-card.tsx      # Trailer inventory card component
  hooks/
    use-auth.tsx          # Auth context provider + useAuth hook

server/
  index.ts                # Express app entry — Stripe webhook registered BEFORE express.json(), then session middleware, then Stripe init
  routes.ts               # All API routes (auth, trailers, applications, rentals, docs, admin, Stripe payments)
  storage.ts              # DatabaseStorage class (all CRUD)
  auth.ts                 # requireAuth / requireAdmin middleware
  cloudinary.ts           # Cloudinary upload/delete helpers
  seed-admin.ts           # Seeds initial admin account on startup
  db.ts                   # Drizzle DB connection
  stripeClient.ts         # Stripe SDK client (via Replit connector, never cache)
  webhookHandlers.ts      # Stripe webhook processing (delegates to stripe-replit-sync)
  email-service.ts        # SendGrid email helpers
  safer.ts                # FMCSA SAFER API lookups

scripts/
  seed-stripe-products.ts # Stripe product seeder (placeholder; pricing is dynamic per-rental)

shared/
  schema.ts               # Drizzle schema + Zod schemas + TypeScript types
```

## Database Schema

Tables: `users`, `companies`, `trailers`, `trailer_photos`, `rental_applications`, `rentals`, `documents`, `audit_logs`

Note: `users.username` stores the email address (original field repurposed).

## Admin Account

The admin account is seeded on first startup.

- **Production:** Requires `ADMIN_EMAIL` and `ADMIN_PASSWORD` env vars to be set. No admin is seeded without them.
- **Development only:** Falls back to `admin@deluxelogistics.com` / `DeluxeAdmin2024!` if env vars are unset. These defaults must never be used in production.

## Color System (Dark Theme)

- Background: `hsl(240 10% 5%)` — very dark charcoal
- Card: `hsl(240 8% 9%)`
- Primary: `hsl(352 65% 32%)` — burgundy red
- Border: `hsl(240 6% 17%)`
- All custom CSS in `client/src/index.css`

## Current Progress (Task Tracker)

### Completed
- [x] Task 1: Foundation & Homepage Rebuild
  - Database schema (9 tables via raw SQL + CHECK constraints)
  - Auth middleware (session-based), bcrypt, admin/renter roles
  - All API routes (trailers, auth, applications, admin, dashboard)
  - Dark homepage with hero + inventory grid + how-it-works
  - Login, signup, admin portal, renter dashboard, trailer detail, jobs pages
  - Header + Footer, admin seeded on startup (env var driven)

- [x] Task 2: Inventory Management System
  - Cloudinary integration with graceful degradation (photo URL paste fallback)
  - QR code PNG generation per trailer (encodes pickup URL)
  - Admin inventory list: filter tabs, stats, status management (retire/restore/maintenance)
  - Trailer add/edit form: all fields, dynamic features list, photo upload + URL paste, primary photo selection
  - Photo carousel on trailer detail page (prev/next arrows, dot indicators, thumbnail strip)
  - Inactive trailers excluded from public homepage/API; visible to admin only
  - Audit log entries on all admin trailer actions

- [x] Task 3: Rental Application Flow — multi-step form, FMCSA SAFER lookup, admin review, invite email
- [x] Task 4: Renter Accounts & Company Profiles — invite token registration, dashboard, document CRUD, company profile panel
- [x] Task 5: Rental Agreements & E-Signature — /agreement/:rentalId, typed-name e-sig, emails, audit logging
- [x] Task 6: Payments / Stripe
  - Stripe connected via Replit OAuth connector
  - stripe + stripe-replit-sync + @stripe/react-stripe-js + @stripe/stripe-js installed
  - Stripe schema migrations run on startup; managed webhook at /api/stripe/webhook
  - POST /api/stripe/create-deposit-intent — creates Stripe PaymentIntent (2-month deposit)
  - POST /api/stripe/payment-succeeded — confirms deposit, activates rental, marks trailer rented, sends email
  - POST /api/stripe/create-deposit-session — legacy Stripe Checkout (kept for fallback)
  - POST /api/stripe/create-subscription-session — monthly rental subscription Checkout
  - POST /api/stripe/confirm-deposit — admin manual deposit override
  - GET /api/rentals/:id/payment-status — renter payment status
  - GET /api/stripe/config — returns publishable key for frontend
  - /dashboard/payment/:rentalId — Stripe Elements card form page (dark theme, shows breakdown)
  - Dashboard "Pay Security Deposit" navigates to Stripe Elements page (not Checkout redirect)
  - Dashboard "Set Up Monthly Billing" button for post-deposit subscription
  - sendDepositConfirmedEmail() added to email-service.ts (email #8)
  - Admin rentals list + detail page with status controls, Stripe payment history, audit log

### Pending
- [ ] Task 7: Engine Hour Tracking (reefer units)
- [ ] Task 8: QR Code Pickup System
- [ ] Task 9: Admin Tools (audit logs, FMCSA, document management)
- [ ] Task 10: Email Automation (SendGrid)
- [ ] Task 11: Driver Hiring (full application form)

## Key Notes

- Prices stored in **cents** (integer) in the database
- Features stored as JSON string in `trailers.features`
- `adminToken` on rental applications is a 32-byte hex token for one-time admin review links
- Engine hour rate only applies to reefer trailers
- Security deposit = 2 months rent (first month + deposit)
- Old marketing tables (`contact_requests`, `locations`, `benefits`, `features`, `testimonials`) remain in DB as orphaned

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
- **Payments (planned):** Stripe
- **File storage (planned):** Cloudinary
- **Email (planned):** SendGrid
- **E-sig (planned):** draw/type built-in + DocuSign scaffold

## Architecture

```
client/src/
  pages/
    home.tsx              # Dark homepage with trailer inventory grid
    login.tsx             # Login page (session auth)
    dashboard.tsx         # Renter portal
    trailer-detail.tsx    # Single trailer view + apply CTA
    jobs.tsx              # Driver hiring page
    admin/
      index.tsx           # Admin portal dashboard
  components/
    header.tsx            # Sticky nav with auth-aware links
    footer.tsx            # Minimal footer
    trailer-card.tsx      # Trailer inventory card component
  hooks/
    use-auth.tsx          # Auth context provider + useAuth hook

server/
  index.ts                # Express app entry, session middleware
  routes.ts               # All API routes
  storage.ts              # DatabaseStorage class (all CRUD)
  auth.ts                 # requireAuth / requireAdmin middleware
  seed-admin.ts           # Seeds initial admin account on startup
  db.ts                   # Drizzle DB connection

shared/
  schema.ts               # Drizzle schema + Zod schemas + TypeScript types
```

## Database Schema

Tables: `users`, `companies`, `trailers`, `trailer_photos`, `rental_applications`, `rentals`, `documents`, `audit_logs`

Note: `users.username` stores the email address (original field repurposed).

## Admin Account

The admin account is seeded automatically on first startup.

- **Default email:** `admin@deluxelogistics.com` (override with `ADMIN_EMAIL` env var)
- **Default password:** `DeluxeAdmin2024!` (override with `ADMIN_PASSWORD` env var)

## Color System (Dark Theme)

- Background: `hsl(240 10% 5%)` — very dark charcoal
- Card: `hsl(240 8% 9%)`
- Primary: `hsl(352 65% 32%)` — burgundy red
- Border: `hsl(240 6% 17%)`
- All custom CSS in `client/src/index.css`

## Current Progress (Task Tracker)

### Completed
- [x] Task 1: Foundation & Homepage Rebuild
  - Database schema (all 8 tables created via raw SQL)
  - Auth middleware (session-based)
  - All API routes (trailers, auth, applications, admin, dashboard)
  - Dark homepage with hero + inventory grid + how-it-works
  - Login page
  - Admin portal stub
  - Renter dashboard stub
  - Trailer detail page
  - Jobs/hiring page
  - Header + Footer
  - Admin seeded on startup

### Pending
- [ ] Task 2: Trailer Inventory Management (admin CRUD, Cloudinary upload)
- [ ] Task 3: Rental Application Flow (multi-step form, FMCSA SAFER lookup)
- [ ] Task 4: Renter Accounts & Company Profiles (invite flow)
- [ ] Task 5: Rental Agreements & E-Signature
- [ ] Task 6: Payments (Stripe deposits + monthly subscriptions)
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

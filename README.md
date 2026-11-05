# trailers.rentals

Trailer rental platform for [Deluxe Logistics Inc.](https://trailers.rentals). Pickup yard in Inwood, WV, just off I-81 at exit 5 south of Martinsburg.
Carriers and owner-operators browse available reefers and dry vans, apply online, get checked
against FMCSA SAFER, e-sign the agreement, pay the deposit, and pick up with a QR code.

## Stack

- **Client:** React 18, Vite, Tailwind, shadcn/ui, wouter, TanStack Query (`client/`)
- **Server:** Express, Drizzle ORM on Postgres, express-session (`server/`)
- **Shared:** schema, constants, FAQ and display helpers used by both (`shared/`)
- **Services:** Stripe (deposit + monthly subscription), Resend (email), Cloudinary (photos), FMCSA SAFER lookup
- **Hosting:** Railway (Nixpacks, `npm run build` then `npm run start`)

## Run locally

```bash
cp .env.example .env   # fill in DATABASE_URL, SESSION_SECRET, Stripe/Resend keys
npm ci
npm run db:push        # push shared/schema.ts to the database
npm run dev            # http://localhost:5000
```

`npm run check` typechecks. `npm run build` produces `dist/` (client in `dist/public`, server in `dist/index.js`).

## What the public sees

Only trailers with status `available` are public. Rented and in-service units disappear from the
site, the JSON API, the sitemap and `llms.txt` automatically; an admin brings a unit back with
**Publish to site** on the inventory page (`/admin/inventory`).

Public endpoints never include the full VIN or the registration document
(see `server/public-trailers.ts`).

| URL | What it is |
|---|---|
| `/` | Listings. The server pre-renders inventory, FAQ and JSON-LD into the HTML, so agents and crawlers that don't run JavaScript still get the catalog (`server/seo.ts`). |
| `/trailers/:id` | One unit, with its own title, Open Graph tags and Product/Offer JSON-LD. Unlisted units return 404. |
| `/api/trailers` | Available units as JSON. |
| `/sitemap.xml`, `/llms.txt` | Generated from live inventory. |

## Pricing and inventory data

Prices are per unit (`trailers.price_monthly`, in cents) and edited in the admin inventory form; the
list prices per type (reefers $1,790/month, dry vans $1,390/month), the optional Service Plan
($250/month: tires, brakes, reefer oil changes) and the included-items copy live in
`shared/pricing.ts`. The home page, the server-rendered head and `llms.txt` quote the rates read from
listed inventory (`listedRates`), so a unit repriced in admin changes the headline with it; the FAQ,
the services page and the outreach copy quote the list prices, so reprice with a data fix rather
than only in the admin form. The security deposit is two months' rent. Reefer
engine hours are included in the monthly rate; the per-hour billing path only applies to a unit that
has `engine_hour_rate` set, and none does.

A renter picks the Service Plan on the application (`rental_applications.service_plan`); the admin's
Create Rental dialog carries it onto the rental (`rentals.service_plan_monthly`, cents), where it
appears on the agreement, is collected for the first month with the deposit, and bills as its own
line on the monthly Stripe subscription. New columns ship in `server/schema-sync.ts`, which adds
them idempotently at startup (there is no migration runner in this deploy).

One-time production data fixes ship as code in `server/data-fixes.ts`. Each runs once per database
(keyed in `site_content`) and logs the unit numbers it touched.

## Environment

See `.env.example`. Production requires `ADMIN_EMAIL` and `ADMIN_PASSWORD` to seed the first admin;
there is no default account.

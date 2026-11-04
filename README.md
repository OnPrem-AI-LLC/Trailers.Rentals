# trailers.rentals

Trailer rental platform for [Deluxe Logistics Inc.](https://trailers.rentals), Martinsburg, WV.
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

Prices are per unit (`trailers.price_monthly`, in cents) and edited in the admin inventory form.
The security deposit is two months' rent. Reefer engine hours are billed separately when a unit has
`engine_hour_rate` set.

One-time production data fixes ship as code in `server/data-fixes.ts`. Each runs once per database
(keyed in `site_content`) and logs the unit numbers it touched.

## Environment

See `.env.example`. Production requires `ADMIN_EMAIL` and `ADMIN_PASSWORD` to seed the first admin;
there is no default account.

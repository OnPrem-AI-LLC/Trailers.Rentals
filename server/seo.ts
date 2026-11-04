// What agents and crawlers read without executing JavaScript.
//
// The React app is a client-rendered SPA, so the raw HTML used to contain
// nothing but a title. This module gives every public listing page a real
// <head> (title, description, Open Graph, JSON-LD) and a pre-rendered body
// inside #root that React replaces on mount, and it builds sitemap.xml and
// llms.txt from live inventory. Everything here is derived from the same
// PublicTrailer shape the JSON API serves, so the three never disagree.

import type { PublicTrailer } from "@shared/schema";
import { COMPANY } from "@shared/constants";
import { FAQ } from "@shared/faq";
import { formatTrailerName, formatTypeLabel, formatPrice } from "@shared/trailer-format";
import { getPublicTrailers, getPublicTrailer } from "./public-trailers";

const SITE = COMPANY.siteUrl;
const BRAND = COMPANY.name;
const DEPOSIT = "Security deposit equals two months' rent, billed with the first month.";
const REVIEW = "Applications are typically reviewed within 24 hours.";
const HOME_TITLE = "Deluxe Logistics | Trailer Rentals — Reefers, Dry Vans, No BS Fees | Martinsburg WV";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

export function absUrl(p: string): string {
  if (/^https?:\/\//i.test(p)) return p;
  return `${SITE}${p.startsWith("/") ? "" : "/"}${p}`;
}

export function trailerPath(t: Pick<PublicTrailer, "id">): string {
  return `/trailers/${t.id}`;
}

export function photoUrls(t: PublicTrailer): string[] {
  const sorted = [...t.photos].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.displayOrder - b.displayOrder;
  });
  return sorted.map((p) => absUrl(p.url));
}

// "$1,699/month, no mileage fees, reefer engine hours billed separately"
export function priceSentence(t: PublicTrailer): string {
  const base = `${formatPrice(t.priceMonthly)}/month, no mileage fees`;
  if (t.type === "reefer") {
    return t.engineHourRate
      ? `${base}, plus ${formatPrice(t.engineHourRate)} per reefer engine hour`
      : `${base}, reefer engine hours billed separately`;
  }
  return `${base}, no hidden costs`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

function fmtDate(d: Date | string | null | undefined): string {
  const date = d ? new Date(d) : new Date();
  return (Number.isNaN(date.getTime()) ? new Date() : date).toISOString().slice(0, 10);
}

// ── <head> ────────────────────────────────────────────────────────────────

interface Meta {
  title: string;
  description: string;
  canonical: string;
  image?: string | null;
}

function metaTags(m: Meta): string {
  const lines = [
    `<title>${escapeHtml(m.title)}</title>`,
    `<meta name="description" content="${escapeHtml(m.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(m.canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Deluxe Logistics" />`,
    `<meta property="og:title" content="${escapeHtml(m.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(m.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(m.canonical)}" />`,
    `<meta name="twitter:card" content="${m.image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapeHtml(m.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(m.description)}" />`,
  ];
  if (m.image) {
    lines.push(`<meta property="og:image" content="${escapeHtml(m.image)}" />`);
    lines.push(`<meta name="twitter:image" content="${escapeHtml(m.image)}" />`);
  }
  return lines.join("\n    ");
}

function jsonLd(obj: unknown): string {
  // "<" is escaped so a description can never close the script tag.
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
}

function businessLd(trailers: PublicTrailer[]) {
  const prices = trailers.map((t) => t.priceMonthly);
  const n = trailers.length;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${SITE}/#business`,
    name: BRAND,
    url: SITE,
    email: COMPANY.email,
    description:
      "Deluxe Logistics rents reefer trailers and dry vans to carriers and owner-operators at flat monthly rates with no mileage fees. Based in Martinsburg, WV.",
    address: {
      "@type": "PostalAddress",
      streetAddress: COMPANY.address,
      addressLocality: COMPANY.city,
      addressRegion: COMPANY.state,
      postalCode: COMPANY.zip,
      addressCountry: "US",
    },
    openingHours: COMPANY.hoursSchema,
    areaServed: "United States",
    priceRange: "$$",
    ...(n > 0
      ? {
          makesOffer: {
            "@type": "AggregateOffer",
            priceCurrency: "USD",
            offerCount: n,
            lowPrice: (Math.min(...prices) / 100).toFixed(2),
            highPrice: (Math.max(...prices) / 100).toFixed(2),
            description: "Monthly trailer rentals at a flat rate with no mileage fees. Security deposit equals two months' rent.",
          },
        }
      : {}),
  };
}

function faqLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

function itemListLd(trailers: PublicTrailer[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Trailers available to rent",
    numberOfItems: trailers.length,
    itemListElement: trailers.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: absUrl(trailerPath(t)),
      name: formatTrailerName(t),
    })),
  };
}

function productLd(t: PublicTrailer) {
  const url = absUrl(trailerPath(t));
  const price = (t.priceMonthly / 100).toFixed(2);
  const additionalProperty = [
    { "@type": "PropertyValue", name: "Equipment type", value: formatTypeLabel(t.type) },
    ...(t.year ? [{ "@type": "PropertyValue", name: "Year", value: t.year }] : []),
    ...(t.location ? [{ "@type": "PropertyValue", name: "Location", value: t.location }] : []),
    ...(t.type === "reefer" && t.engineHourRate
      ? [{ "@type": "PropertyValue", name: "Reefer engine hour rate (USD)", value: (t.engineHourRate / 100).toFixed(2) }]
      : []),
  ];
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: formatTrailerName(t),
    description: `${priceSentence(t)}. ${DEPOSIT}${t.description ? ` ${t.description}` : ""}`,
    image: photoUrls(t),
    sku: t.unitNumber ?? undefined,
    brand: t.make ? { "@type": "Brand", name: t.make } : undefined,
    category: "Trailer rental",
    url,
    additionalProperty,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "USD",
      price,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price,
        priceCurrency: "USD",
        unitCode: "MON",
        unitText: "month",
      },
      availability: "https://schema.org/InStock",
      businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
      areaServed: "US",
      seller: { "@type": "LocalBusiness", "@id": `${SITE}/#business`, name: BRAND, url: SITE },
    },
  };
}

export function homeHead(trailers: PublicTrailer[]): string {
  const n = trailers.length;
  const low = n ? formatPrice(Math.min(...trailers.map((t) => t.priceMonthly))) : null;
  const description = n
    ? `Rent a reefer or dry van in Martinsburg, WV from ${low}/month. Flat monthly rate, no mileage fees. ${n} unit${n === 1 ? "" : "s"} available now. Apply online in minutes.`
    : "Reefer and dry van rentals in Martinsburg, WV at flat monthly rates with no mileage fees. Apply online in minutes.";
  const image = trailers.map((t) => photoUrls(t)[0]).find(Boolean) ?? null;
  return [
    metaTags({ title: HOME_TITLE, description, canonical: `${SITE}/`, image }),
    jsonLd(businessLd(trailers)),
    jsonLd(faqLd()),
    ...(n ? [jsonLd(itemListLd(trailers))] : []),
  ].join("\n    ");
}

export function trailerHead(t: PublicTrailer): string {
  const name = formatTrailerName(t);
  const title = `${name} for Rent | ${formatPrice(t.priceMonthly)}/mo | Deluxe Logistics, Martinsburg WV`;
  const description = truncate(
    `${name} available now from ${BRAND} in ${COMPANY.city}, ${COMPANY.state}. ${priceSentence(t)}. ${DEPOSIT}${t.description ? ` ${t.description}` : ""}`,
    300,
  );
  return [
    metaTags({ title, description, canonical: absUrl(trailerPath(t)), image: photoUrls(t)[0] ?? null }),
    jsonLd(productLd(t)),
  ].join("\n    ");
}

// ── Pre-rendered body (visible until React mounts; the whole content for agents) ──

const PRERENDER_CSS = `<style>#ssr{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0a0a0b;color:#e7e7ea;min-height:100vh;padding:32px 20px;line-height:1.55;max-width:960px;margin:0 auto}#ssr a{color:#ff7b7b}#ssr h1{font-size:30px;line-height:1.15;margin:0 0 10px}#ssr h2{font-size:19px;margin:28px 0 8px}#ssr ul,#ssr ol{padding-left:20px}#ssr li{margin:7px 0}#ssr dt{font-weight:700;margin-top:12px}#ssr dd{margin:2px 0 0}#ssr p{margin:6px 0}#ssr .muted{color:#a1a1aa;font-size:14px}</style>`;

function unitLine(t: PublicTrailer): string {
  const name = escapeHtml(formatTrailerName(t));
  const unit = t.unitNumber ? ` (Unit ${escapeHtml(t.unitNumber)})` : "";
  const desc = t.description ? ` ${escapeHtml(t.description)}` : "";
  return `<li><a href="${trailerPath(t)}">${name}</a>${unit} — ${escapeHtml(priceSentence(t))}.${desc} <a href="/apply/${t.id}">Apply</a></li>`;
}

function contactLines(): string {
  return `<p class="muted">${escapeHtml(BRAND)} · ${escapeHtml(COMPANY.fullAddress)} · ${escapeHtml(COMPANY.hours)} · <a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p>
<p class="muted">For agents and developers: JSON inventory at <a href="/api/trailers">/api/trailers</a>, <a href="/sitemap.xml">sitemap.xml</a>, <a href="/llms.txt">llms.txt</a>.</p>`;
}

export function homeBody(trailers: PublicTrailer[]): string {
  const n = trailers.length;
  const units = n
    ? `<ul>\n${trailers.map(unitLine).join("\n")}\n</ul>`
    : `<p>No units are listed right now. Email <a href="mailto:${COMPANY.email}">${COMPANY.email}</a> to ask about upcoming availability.</p>`;
  return `<div id="ssr">
${PRERENDER_CSS}
<h1>Trailer rentals in Martinsburg, WV. No mileage fees.</h1>
<p>${escapeHtml(BRAND)} rents reefers and dry vans to carriers and owner-operators at a flat monthly rate. No mileage fees. Reefer engine hours billed separately. ${escapeHtml(DEPOSIT)} ${escapeHtml(REVIEW)}</p>
<h2>Available now: ${n} unit${n === 1 ? "" : "s"}</h2>
${units}
<h2>How it works</h2>
<ol>
<li>Pick a unit above and open its page.</li>
<li>Submit the online application: company and contact details, DOT number (MC if you have one), intended use. Applicants must be 18 or older.</li>
<li>Sign the rental agreement online, pay the deposit and first month, and pick up at ${escapeHtml(COMPANY.fullAddress)}.</li>
</ol>
<h2>Frequently asked questions</h2>
<dl>
${FAQ.map(({ q, a }) => `<dt>${escapeHtml(q)}</dt><dd>${escapeHtml(a)}</dd>`).join("\n")}
</dl>
${contactLines()}
</div>`;
}

export function trailerBody(t: PublicTrailer): string {
  const name = escapeHtml(formatTrailerName(t));
  const features = t.features.length
    ? `<h2>Features</h2><ul>${t.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`
    : "";
  const photos = t.photos.length ? `<p class="muted">${t.photos.length} photo${t.photos.length === 1 ? "" : "s"} on the listing.</p>` : "";
  return `<div id="ssr">
${PRERENDER_CSS}
<p class="muted"><a href="/">← All available trailers</a></p>
<h1>${name}${t.unitNumber ? ` <span class="muted">(Unit ${escapeHtml(t.unitNumber)})</span>` : ""}</h1>
<p><strong>${escapeHtml(formatPrice(t.priceMonthly))}/month</strong> — ${escapeHtml(priceSentence(t).replace(/^[^,]+,\s*/, ""))}. ${escapeHtml(DEPOSIT)}</p>
${t.location ? `<p class="muted">Location: ${escapeHtml(t.location)}</p>` : ""}
${t.vinLast6 ? `<p class="muted">VIN ending in ${escapeHtml(t.vinLast6)}</p>` : ""}
${t.description ? `<p>${escapeHtml(t.description)}</p>` : ""}
${features}
${photos}
<p><a href="/apply/${t.id}">Apply to rent this unit</a> — ${escapeHtml(REVIEW)}</p>
${contactLines()}
</div>`;
}

// ── sitemap.xml and llms.txt ─────────────────────────────────────────────

export function buildSitemap(trailers: PublicTrailer[]): string {
  const newest = trailers.reduce<Date | null>((acc, t) => {
    const d = new Date(t.createdAt);
    return !acc || d > acc ? d : acc;
  }, null);
  const url = (loc: string, lastmod: string, changefreq: string, priority: string) =>
    `  <url><loc>${escapeHtml(loc)}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    url(`${SITE}/`, fmtDate(newest), "daily", "1.0"),
    url(`${SITE}/services`, fmtDate(newest), "monthly", "0.6"),
    url(`${SITE}/jobs`, fmtDate(newest), "monthly", "0.4"),
    url(`${SITE}/legal`, fmtDate(newest), "yearly", "0.2"),
    ...trailers.map((t) => url(absUrl(trailerPath(t)), fmtDate(t.createdAt), "weekly", "0.8")),
    `</urlset>`,
  ];
  return lines.join("\n");
}

export function buildLlmsTxt(trailers: PublicTrailer[]): string {
  const n = trailers.length;
  const prices = trailers.map((t) => t.priceMonthly);
  const range = n
    ? Math.min(...prices) === Math.max(...prices)
      ? `${formatPrice(prices[0])}/month`
      : `${formatPrice(Math.min(...prices))} to ${formatPrice(Math.max(...prices))}/month`
    : "see unit pages";
  const unitBlock = n
    ? trailers
        .map((t) => {
          const bits = [
            `- ${formatTrailerName(t)}${t.unitNumber ? ` (Unit ${t.unitNumber})` : ""} — ${priceSentence(t)}`,
            t.vinLast6 ? `VIN ending ${t.vinLast6}` : null,
            `${t.photos.length} photo${t.photos.length === 1 ? "" : "s"}`,
            t.description ?? null,
          ].filter(Boolean);
          return `${bits.join(" — ")}\n  Listing: ${absUrl(trailerPath(t))}\n  Apply: ${absUrl(`/apply/${t.id}`)}`;
        })
        .join("\n")
    : "- No units are listed right now. Email us about upcoming availability.";

  return `# ${BRAND} — trailers.rentals

> Reefer and dry van trailer rentals in ${COMPANY.city}, ${COMPANY.state} for freight carriers and owner-operators. Flat monthly rate, no mileage fees. Apply online; ${REVIEW.charAt(0).toLowerCase()}${REVIEW.slice(1)}

## Pricing (as of ${fmtDate(null)})

- Monthly rate: ${range}, listed per unit below
- Mileage fees: none
- Security deposit: two months' rent, billed with the first month when you are approved
- Reefer engine hours: billed separately on refrigerated units (hourly rate shown on the unit when set)
- Application fee: none

## Available units (${n})

${unitBlock}

## How to rent

1. Open a unit's listing page and click Apply.
2. Submit the application: company name, owner/officer name, email, phone, DOT number (MC number if you have one), intended use. Applicants must be 18 or older.
3. ${REVIEW} Once approved you sign the rental agreement online, pay the deposit plus first month, and pick up at our yard.

## Location and contact

- ${BRAND}, ${COMPANY.fullAddress}
- Hours: ${COMPANY.hours}
- Email: ${COMPANY.email}
- Web: ${SITE}

## Machine-readable

- Available units as JSON: ${SITE}/api/trailers
- One unit: ${SITE}/api/trailers/{id}
- Sitemap: ${SITE}/sitemap.xml
- Fields: id, unitNumber, type (reefer | dry_van), make, model, year, priceMonthly (USD cents), engineHourRate (USD cents per hour, null when not set), features[], location, vinLast6, photos[].url (relative to ${SITE})
`;
}

// ── Template injection ──────────────────────────────────────────────────

const HEAD_START = "<!--seo:head-->";
const HEAD_END = "<!--/seo:head-->";

export function injectHead(template: string, head: string): string {
  const start = template.indexOf(HEAD_START);
  const end = template.indexOf(HEAD_END);
  if (start !== -1 && end > start) {
    return `${template.slice(0, start)}${HEAD_START}\n    ${head}\n    ${template.slice(end)}`;
  }
  // Fallback if the markers were stripped: at least swap the title.
  return template.replace(/<title>[\s\S]*?<\/title>/, head);
}

export function injectBody(template: string, body: string): string {
  return template.replace(/<div id="root"><\/div>/, `<div id="root">${body}</div>`);
}

export async function renderIndexHtml(pathname: string, template: string): Promise<{ html: string; status: number }> {
  try {
    if (pathname === "/" || pathname === "/index.html") {
      const trailers = await getPublicTrailers();
      return { html: injectBody(injectHead(template, homeHead(trailers)), homeBody(trailers)), status: 200 };
    }
    const m = pathname.match(/^\/trailers\/([0-9a-f-]{8,})\/?$/i);
    if (m) {
      const t = await getPublicTrailer(m[1]);
      if (t) return { html: injectBody(injectHead(template, trailerHead(t)), trailerBody(t)), status: 200 };
      // Unknown or unlisted unit: the SPA shows its "not listed" state; crawlers get a 404.
      return { html: template, status: 404 };
    }
  } catch (err) {
    console.error("[seo] pre-render failed, serving the plain template:", err);
  }
  return { html: template, status: 200 };
}

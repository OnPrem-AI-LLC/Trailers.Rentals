// Pricing and plan terms, shared by the public site, the application form,
// the rental agreement, Stripe billing and every email, so no page can quote a
// number another page disagrees with.
//
// Prices are per unit in the database (trailers.price_monthly, cents) and are
// edited in the admin inventory form. LIST_PRICE_CENTS is the list price per
// trailer type: what the startup data fixes set units to, and what static copy
// (FAQ, services page, outreach) quotes. Pages that have live inventory derive
// the rates from it with listedRates() so they can never contradict the cards.
// Keep the two in step: reprice via a data fix, not only in the admin form.
// The Service Plan is priced here only.

export const LIST_PRICE_CENTS = {
  reefer: 179000, // $1,790/month, reefer engine hours included (Nov 2026)
  dry_van: 139000, // $1,390/month (Nov 2026)
} as const;

export type RentableType = keyof typeof LIST_PRICE_CENTS;

// How copy names each type when it quotes the rate, in display order.
export const RATE_LABELS: { type: RentableType; plural: string; singular: string }[] = [
  { type: "reefer", plural: "Reefers", singular: "Reefer" },
  { type: "dry_van", plural: "Dry vans", singular: "Dry van" },
];

export interface ListedRate {
  type: RentableType;
  plural: string;
  singular: string;
  cents: number;
}

/**
 * The rate each trailer type rents for, read from listed inventory: a type is
 * included only when it has listed units and they all share one price, so a
 * headline never quotes a number some card disagrees with. Empty when nothing
 * is listed (or prices are mixed), and callers fall back to generic copy.
 */
export function listedRates(units: { type: string; priceMonthly: number }[]): ListedRate[] {
  const out: ListedRate[] = [];
  for (const label of RATE_LABELS) {
    const ofType = units.filter((u) => u.type === label.type);
    if (!ofType.length) continue;
    const first = ofType[0].priceMonthly;
    if (ofType.every((u) => u.priceMonthly === first)) out.push({ ...label, cents: first });
  }
  return out;
}

/**
 * "Reefers $1,790 a month, dry vans $1,390" for prose, or null when no rate
 * can be quoted. By default the unit follows the first price only and the
 * second is read in the same unit; `each` puts it on every price ("reefers
 * $1,790/month and dry vans $1,390/month" with unit "/month", joiner " and ").
 * The phrase starts with a capital for a sentence start; `lower` for mid-sentence.
 */
export function ratesPhrase(
  rates: ListedRate[],
  opts: { unit?: string; each?: boolean; joiner?: string; lower?: boolean } = {},
): string | null {
  if (!rates.length) return null;
  const { unit = " a month", each = false, joiner = ", ", lower = false } = opts;
  return rates
    .map((r, i) => `${i === 0 && !lower ? r.plural : r.plural.toLowerCase()} ${formatCents(r.cents)}${i === 0 || each ? unit : ""}`)
    .join(joiner);
}

// Every refrigerated trailer in the fleet runs this reefer unit.
export const REEFER_UNIT = "Thermo King Precedent";
export const REEFER_UNIT_NOTE = "Thermo King's current trailer platform, EPA Tier 4 Final.";

// The optional maintenance add-on: chosen on the application, carried on the
// rental as service_plan_monthly (cents) and billed with the rent.
export const SERVICE_PLAN = {
  name: "Service Plan",
  monthlyCents: 25000, // $250/month
  covers: ["Tires", "Brakes", "Reefer engine oil changes"],
  // One line for cards, rows and emails.
  summary: "Tires, brakes and reefer engine oil changes, on us.",
  // Where the plan stops, stated wherever it is offered.
  scope:
    "Regular maintenance for normal wear. Damage from accidents, road hazards or misuse is repaired at the renter's cost, as under any rental.",
} as const;

// What the flat rate covers, in the order the site lists it.
export const RATE_INCLUDES = [
  "Reefer engine hours: no hour allowance, no meter charge",
  "Unlimited miles",
  "Month to month, 30 days' notice to end",
  "No fleet minimum. One truck is enough",
  "Application typically answered within 24 hours, no fee",
] as const;

// What never shows up on the invoice.
export const NEVER_BILLED = [
  "Mileage charges",
  "Reefer engine-hour charges",
  "Setup, origination or admin fees",
  "Fuel surcharges",
  "A multi-year commitment",
] as const;

// The whole list of what a renter still pays, so "no surprise fees" is a
// promise and not a slogan. Mirrors the rental agreement.
export const RENTER_PAYS =
  "Reefer fuel, your own insurance, damage beyond normal wear, and a 5% late fee on a payment more than 10 days late. That is the whole list.";

export interface PricedRental {
  monthlyRate: number;
  servicePlanMonthly?: number | null;
}

export function servicePlanCents(r: PricedRental): number {
  return Math.max(0, r.servicePlanMonthly ?? 0);
}

/** Rent plus the Service Plan: what the monthly subscription bills. */
export function monthlyTotalCents(r: PricedRental): number {
  return r.monthlyRate + servicePlanCents(r);
}

/** The security deposit: two months' rent. The plan is not part of it. */
export function depositCents(r: PricedRental): number {
  return r.monthlyRate * 2;
}

/** Due before pickup: the deposit plus the first month of the plan, when taken. */
export function firstPaymentCents(r: PricedRental): number {
  return depositCents(r) + servicePlanCents(r);
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

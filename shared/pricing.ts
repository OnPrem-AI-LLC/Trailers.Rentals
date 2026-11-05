// Pricing and plan terms, shared by the public site, the application form,
// the rental agreement, Stripe billing and every email, so no page can quote a
// number another page disagrees with.
//
// Prices are per unit in the database (trailers.price_monthly, cents) and are
// edited in the admin inventory form; LIST_PRICE_CENTS is what repriced units
// get and what copy quotes when every listed unit shares one price. The
// Service Plan is priced here only.

export const LIST_PRICE_CENTS = 179000; // $1,790/month, every reefer and dry van (Nov 2026)

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

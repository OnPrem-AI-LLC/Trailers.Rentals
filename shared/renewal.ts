/**
 * The automatic-renewal terms a renter agrees to before monthly billing
 * starts. One copy, shown next to the consent checkbox on the deposit
 * payment page and in the dashboard, echoed on the Stripe Checkout page and
 * in the confirmation emails, and recorded by version against the rental as
 * proof of consent. Change the wording and bump the version together: the
 * version is what gets stored.
 */
export const RENEWAL_TERMS_VERSION = "2026-11-05";

/**
 * The cancellation policy, reconciled with the signed rental agreement
 * (month-to-month, 30 days written notice to terminate). An online request is
 * immediate and binding; billing stops at the later of the current period end
 * and 30 days from the request. Used verbatim in the dashboard and emails.
 */
export const CANCELLATION_POLICY =
  "Cancel any time from your dashboard. Monthly rent stops after the later of the end of " +
  "the current billing month and 30 days from your request; the trailer must be returned " +
  "by that date under your rental agreement. A monthly renewal that falls within those " +
  "30 days is billed in full and is not prorated. Amounts owed under the agreement, such as " +
  "late fees or damage, may still apply. Your security deposit is " +
  "handled as described in your rental agreement.";

/** Days of notice the agreement requires; the server uses the same number. */
export const CANCELLATION_NOTICE_DAYS = 30;

export function formatMonthly(monthlyRateCents: number): string {
  return `$${(monthlyRateCents / 100).toLocaleString("en-US")}`;
}

// With a Service Plan the renewal amount is rent plus the plan, and the terms
// say so, since the consent must name the amount that is actually billed.
export function renewalTerms(monthlyRateCents: number, servicePlanCents = 0): string {
  const total = formatMonthly(monthlyRateCents + servicePlanCents);
  const breakdown = servicePlanCents > 0
    ? ` (${formatMonthly(monthlyRateCents)} rent plus ${formatMonthly(servicePlanCents)} Service Plan)`
    : "";
  return (
    `Monthly billing renews automatically on the same day each month at ${total}${breakdown} ` +
    `until you cancel. ${CANCELLATION_POLICY}`
  );
}

/** The short form for a button's neighbourhood and for Stripe's submit text. */
export function renewalSummary(monthlyRateCents: number, servicePlanCents = 0): string {
  const total = formatMonthly(monthlyRateCents + servicePlanCents);
  const note = servicePlanCents > 0 ? " (rent plus Service Plan)" : "";
  return `Renews monthly at ${total}${note} until cancelled. Cancel any time from your dashboard; 30 days notice applies.`;
}

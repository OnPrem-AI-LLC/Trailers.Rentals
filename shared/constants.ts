// Company contact info — single source of truth
export const COMPANY = {
  name: "Deluxe Logistics Inc.",
  address: "818 Corning Way",
  city: "Martinsburg",
  state: "WV",
  zip: "25401",
  email: "info@trailers.rentals",
  // Telephone number for the DMCA designated-agent block on /legal.
  // 17 U.S.C. 512(c)(2) requires it; the page hides the line while this is
  // empty. Sam must supply it before relying on the safe harbour.
  phone: "" as string,
  // Mailbox for notices of claimed infringement. Must be one the business
  // controls: deluxelogistics.com is NOT the owner's domain.
  dmcaEmail: "info@trailers.rentals",
  fullAddress: "818 Corning Way, Martinsburg, WV 25401",
  hours: "Mon–Fri 8am–5pm",
  // Every customer-facing date (billing end dates in emails, the dashboard,
  // invoice periods) is rendered in this zone so a renter never sees two
  // different days for the same instant.
  timeZone: "America/New_York",
} as const;

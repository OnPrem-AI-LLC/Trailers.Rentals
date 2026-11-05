// The FAQ shown on the home page. The server emits the same list as FAQPage
// JSON-LD, so the structured data can never say something the page doesn't.
import { YARD } from "./constants";
import { REEFER_UNIT, REEFER_UNIT_NOTE, RENTER_PAYS, SERVICE_PLAN, formatCents } from "./pricing";

const PLAN_PRICE = formatCents(SERVICE_PLAN.monthlyCents);

export const FAQ: { q: string; a: string }[] = [
  {
    q: "What does the monthly rate include?",
    a: "The trailer, unlimited miles and, on a reefer, the engine hours. The rate is month to month with 30 days' notice to end, and there is no fleet minimum. The number on the listing is the number on the invoice.",
  },
  {
    q: "Are there mileage fees?",
    a: "No. Every unit rents at a flat monthly rate with no mileage charges. Drive as far as your loads take you.",
  },
  {
    q: "How are reefer engine hours handled?",
    a: "They're included. There is no hour allowance and no meter charge, so run the unit the way the load needs. Dry vans have no reefer unit, so nothing to meter.",
  },
  {
    q: `What does the ${PLAN_PRICE}/month ${SERVICE_PLAN.name} cover?`,
    a: `Regular maintenance on your rental: tires, brakes and reefer engine oil changes, for normal wear. It's optional. Add it when you apply and it's billed with your rent. Without it, routine maintenance is yours, as under any trailer lease. ${SERVICE_PLAN.scope}`,
  },
  {
    q: "What do I still pay for?",
    a: RENTER_PAYS,
  },
  {
    q: "What reefer units are on the trailers?",
    a: `Every refrigerated trailer runs a ${REEFER_UNIT} unit. ${REEFER_UNIT_NOTE}`,
  },
  {
    q: "What does a rental cost up front?",
    a: `When you're approved, a security deposit equal to two months' rent is billed together with the first month. If you add the ${SERVICE_PLAN.name}, its first month is due at the same time. Applying is free.`,
  },
  {
    q: "What do I need to apply?",
    a: "An active DOT number (plus your MC number if you have one), your company and contact details, and you must be 18 or older. Applications are typically reviewed within 24 hours.",
  },
  {
    q: "Where do I pick up the trailer?",
    a: `At our yard in ${YARD.cityState}, ${YARD.landmark}, Monday through Friday, 8am to 5pm. Pickup is coordinated online once your rental agreement is signed.`,
  },
];

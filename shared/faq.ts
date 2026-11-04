// The FAQ shown on the home page. The server emits the same list as FAQPage
// JSON-LD, so the structured data can never say something the page doesn't.
import { YARD } from "./constants";

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Are there mileage fees?",
    a: "No. Every unit rents at a flat monthly rate with no mileage charges. Drive as far as your loads take you.",
  },
  {
    q: "What does a rental cost up front?",
    a: "Each unit lists its flat monthly rate. When you're approved, a security deposit equal to two months' rent is billed together with the first month. Applying is free.",
  },
  {
    q: "How are reefer engine hours handled?",
    a: "Refrigerated units bill reefer engine hours separately, on top of the monthly rate. Dry vans have no engine-hour charge.",
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

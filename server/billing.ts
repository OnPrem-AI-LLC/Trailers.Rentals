// The recurring Stripe prices a rental's monthly subscription bills: the
// trailer rent, plus the Service Plan as its own line when the rental carries
// one, so the renter's invoice itemizes the two.

import type Stripe from "stripe";
import { SERVICE_PLAN } from "@shared/pricing";

export interface BillableRental {
  id: string;
  monthlyRate: number;
  servicePlanMonthly?: number | null;
}

export interface MonthlyPriceOptions {
  // Idempotency keys make the webhook and client-callback paths (and admin
  // retries) converge on one price per rental. The dashboard's Checkout path
  // never used them and still does not.
  idempotent: boolean;
  rentName?: string;
}

export async function monthlyPriceItems(
  stripe: Stripe,
  rental: BillableRental,
  opts: MonthlyPriceOptions,
): Promise<{ price: string; quantity: number }[]> {
  const ref = rental.id.slice(-8).toUpperCase();
  const key = (k: string) => (opts.idempotent ? { idempotencyKey: `${k}_${rental.id}` } : undefined);

  const rent = await stripe.prices.create(
    {
      unit_amount: rental.monthlyRate,
      currency: "usd",
      recurring: { interval: "month" },
      product_data: { name: opts.rentName ?? `Trailer Rental — monthly (rental ${ref})` },
      metadata: { rentalId: rental.id },
    },
    key("price_rental"),
  );
  const items = [{ price: rent.id, quantity: 1 }];

  const plan = rental.servicePlanMonthly ?? 0;
  if (plan > 0) {
    const planPrice = await stripe.prices.create(
      {
        unit_amount: plan,
        currency: "usd",
        recurring: { interval: "month" },
        product_data: { name: `${SERVICE_PLAN.name} — monthly (rental ${ref})` },
        metadata: { rentalId: rental.id, type: "service_plan" },
      },
      key("price_plan"),
    );
    items.push({ price: planPrice.id, quantity: 1 });
  }
  return items;
}

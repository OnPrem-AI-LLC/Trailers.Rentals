import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;
const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

if (!secretKey && process.env.NODE_ENV === 'production') {
  throw new Error('STRIPE_SECRET_KEY environment variable is required in production');
}

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set');
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2025-06-30.basil' as Stripe.LatestApiVersion,
    });
  }
  return stripeClient;
}

// Keep the old name as an alias so callers don't need to change
export async function getUncachableStripeClient(): Promise<Stripe> {
  return getStripeClient();
}

export async function getStripePublishableKey(): Promise<string> {
  if (!publishableKey) throw new Error('STRIPE_PUBLISHABLE_KEY is not set');
  return publishableKey;
}

export async function getStripeSecretKey(): Promise<string> {
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set');
  return secretKey;
}

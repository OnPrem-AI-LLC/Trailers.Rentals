/**
 * Seed Stripe products for Deluxe Logistics trailer rentals.
 * Note: For this platform, pricing is created dynamically per-rental
 * using price_data in checkout sessions, so no global products are needed.
 * This script is a placeholder for future product/catalog seeding.
 *
 * Run with: npx tsx scripts/seed-stripe-products.ts
 */
import { getUncachableStripeClient } from '../server/stripeClient';

async function main() {
  const stripe = await getUncachableStripeClient();

  // Check what's already in Stripe
  const products = await stripe.products.list({ limit: 10 });
  console.log('Existing Stripe products:');
  if (products.data.length === 0) {
    console.log('  (none)');
  } else {
    for (const p of products.data) {
      console.log(`  - ${p.name} (${p.id})`);
    }
  }

  console.log('\nNote: Deluxe Logistics creates prices dynamically per-rental.');
  console.log('Security deposits (2x monthly rate) and subscriptions use price_data in checkout sessions.');
  console.log('No seeding needed for the current pricing model.\n');
}

main().catch(console.error);

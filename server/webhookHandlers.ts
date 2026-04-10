import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';

// ── Activate a rental after confirmed deposit (idempotent) ──────────────────
async function handleDepositSucceeded(
  rentalId: string,
  paymentIntentId: string,
  customerId: string | null,
): Promise<void> {
  const rental = await storage.getRental(rentalId);
  if (!rental) {
    console.warn(`[webhook] Rental ${rentalId} not found — skipping deposit activation`);
    return;
  }
  if (rental.depositPaid) {
    console.log(`[webhook] Rental ${rentalId} already activated — skipping`);
    return;
  }

  // Activate the rental
  await storage.updateRental(rentalId, {
    depositPaid: true,
    status: 'active',
    startDate: new Date(),
    ...(customerId ? { stripeCustomerId: customerId } : {}),
  });

  // Mark trailer as rented
  try {
    await storage.updateTrailer(rental.trailerId, { status: 'rented' });
  } catch (err) {
    console.error(`[webhook] Could not mark trailer ${rental.trailerId} as rented:`, err);
  }

  // Write audit log
  try {
    await storage.createAuditLog({
      userId: null,
      actionType: 'deposit_paid_webhook',
      entityType: 'rental',
      entityId: rentalId,
      description: `Security deposit confirmed via Stripe webhook (PI: ${paymentIntentId}) — rental activated`,
      isAdminEntry: false,
      ipAddress: null,
    });
  } catch (err) {
    console.error('[webhook] Audit log write failed:', err);
  }

  // Auto-create a monthly subscription for ongoing billing
  if (customerId && rental.monthlyRate > 0) {
    try {
      const stripe = await getUncachableStripeClient();

      // Create a recurring price ad-hoc for this rental
      const price = await stripe.prices.create({
        unit_amount: rental.monthlyRate,
        currency: 'usd',
        recurring: { interval: 'month' },
        product_data: {
          name: `Trailer Rental — monthly (rental ${rentalId.slice(-8).toUpperCase()})`,
        },
        metadata: { rentalId },
      });

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: price.id }],
        metadata: { rentalId, type: 'monthly_rental' },
        payment_settings: { payment_method_types: ['card'] },
        billing_cycle_anchor_config: { day_of_month: new Date().getDate() },
        proration_behavior: 'none',
      });

      await storage.updateRental(rentalId, { stripeSubscriptionId: subscription.id });
      console.log(`[webhook] Monthly subscription ${subscription.id} created for rental ${rentalId}`);
    } catch (err) {
      console.error(`[webhook] Could not create monthly subscription for rental ${rentalId}:`, err);
    }
  }

  // Send renter activation email + admin notification (non-fatal)
  try {
    const company = await storage.getCompany(rental.companyId);
    const trailer = await storage.getTrailer(rental.trailerId);
    if (company && trailer) {
      const { sendDepositConfirmedEmail, sendDepositReceivedAdminEmail } = await import('./email-service');
      // Renter email
      await sendDepositConfirmedEmail({
        rentalId,
        companyName: company.name,
        renterEmail: company.email,
        renterName: company.ownerName,
        trailerVin: trailer.vin,
        trailerType: trailer.type,
        monthlyRate: rental.monthlyRate,
      }).catch(e => console.error('[webhook] Renter email failed:', e));
      // Admin notification
      await sendDepositReceivedAdminEmail({
        rentalId,
        companyName: company.name,
        trailerVin: trailer.vin,
        trailerType: trailer.type,
        monthlyRate: rental.monthlyRate,
        paymentIntentId,
      }).catch(e => console.error('[webhook] Admin email failed:', e));
    }
  } catch (err) {
    console.error('[webhook] Deposit emails failed:', err);
  }
}

// ── Handle subscription payment events ──────────────────────────────────────
async function handleInvoicePaid(invoiceId: string, subscriptionId: string | null): Promise<void> {
  if (!subscriptionId) return;
  console.log(`[webhook] Invoice paid for subscription ${subscriptionId}`);
  // Future: log to rental payment history, send receipt email, etc.
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'This usually means express.json() parsed the body before this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    // Let stripe-replit-sync verify signature + sync data first
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // Parse the event payload for business logic (verification already done above)
    let event: { type: string; data: { object: Record<string, unknown> } };
    try {
      event = JSON.parse(payload.toString('utf8')) as typeof event;
    } catch {
      console.warn('[webhook] Could not parse event payload as JSON');
      return;
    }

    try {
      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object as {
          id: string;
          customer: string | null;
          metadata: Record<string, string>;
        };
        if (pi.metadata?.type === 'deposit' && pi.metadata?.rentalId) {
          await handleDepositSucceeded(
            pi.metadata.rentalId,
            pi.id,
            pi.customer ?? null,
          );
        }
      } else if (event.type === 'invoice.paid') {
        const inv = event.data.object as {
          id: string;
          subscription: string | null;
        };
        await handleInvoicePaid(inv.id, inv.subscription);
      }
    } catch (err) {
      console.error(`[webhook] Business logic error for ${event.type}:`, err);
      // Non-fatal — stripe-replit-sync already responded 200 to Stripe
    }
  }
}

/**
 * Unified deposit finalization service.
 *
 * This is the SINGLE source of truth for what happens after a deposit is confirmed.
 * Both the Stripe webhook and the client-callback fallback call this function.
 * Every step is idempotent — it is safe to call twice.
 *
 * Sequence:
 *  1. Verify rental exists
 *  2. Activate rental (if not already active)
 *  3. Mark trailer as rented (if not already)
 *  4. Create monthly Stripe subscription (if not already created)
 *  5. Write audit log
 *  6. Send renter confirmation email (once)
 *  7. Send admin notification email
 */

import { storage } from './storage';
import { getUncachableStripeClient } from './stripeClient';

export interface FinalizeDepositOptions {
  rentalId: string;
  paymentIntentId?: string;
  stripeCustomerId?: string;   // if provided, will be persisted if not already set
  paymentMethodId?: string;    // from payment_intent.succeeded; saved as customer default PM for recurring billing
  triggeredBy: 'webhook' | 'client_callback' | 'admin_manual';
  userId?: string; // for audit log; nullable for webhook path
  ipAddress?: string | null;
}

export async function finalizeDepositPayment(opts: FinalizeDepositOptions): Promise<{
  activated: boolean;
  subscriptionCreated: boolean;
  alreadyDone: boolean;
}> {
  const { rentalId, paymentIntentId, triggeredBy, userId, ipAddress } = opts;

  const rental = await storage.getRental(rentalId);
  if (!rental) throw new Error(`Rental ${rentalId} not found`);

  // Resolve Stripe customer ID — prefer what's on the rental already
  const customerId = rental.stripeCustomerId ?? opts.stripeCustomerId ?? null;

  // ── 1. Activate rental (idempotent) ────────────────────────────────────────
  const wasAlreadyActive = rental.depositPaid;
  if (!wasAlreadyActive) {
    await storage.updateRental(rentalId, {
      depositPaid: true,
      status: 'active',
      startDate: new Date(),
      ...(customerId && !rental.stripeCustomerId ? { stripeCustomerId: customerId } : {}),
    });

    // Mark trailer as rented
    try {
      await storage.updateTrailer(rental.trailerId, { status: 'rented' });
    } catch (err) {
      console.error(`[deposit] Could not mark trailer ${rental.trailerId} as rented:`, err);
    }
  } else if (customerId && !rental.stripeCustomerId) {
    // Rental already active but missing customer ID — patch it
    await storage.updateRental(rentalId, { stripeCustomerId: customerId });
  }

  // ── 2. Ensure monthly subscription exists (idempotent) ────────────────────
  let subscriptionCreated = false;
  const freshRental = await storage.getRental(rentalId);
  const effectiveCustomerId = freshRental?.stripeCustomerId ?? customerId;

  // Always ensure the payment method is set as the customer default — decoupled from
  // subscription creation so it works regardless of which finalization path ran first.
  if (opts.paymentMethodId && effectiveCustomerId) {
    try {
      const stripe = await getUncachableStripeClient();
      await stripe.customers.update(effectiveCustomerId, {
        invoice_settings: { default_payment_method: opts.paymentMethodId },
      });
      console.log(`[deposit] Set default payment method ${opts.paymentMethodId} for customer ${effectiveCustomerId}`);
    } catch (pmErr) {
      console.warn('[deposit] Could not set default payment method:', pmErr);
    }
  }

  if (!freshRental?.stripeSubscriptionId && effectiveCustomerId && rental.monthlyRate > 0) {
    try {
      const stripe = await getUncachableStripeClient();

      // Idempotency key ensures both webhook + client-callback paths produce the same
      // Stripe Price so duplicate concurrent calls don't create multiple prices.
      const price = await stripe.prices.create(
        {
          unit_amount: rental.monthlyRate,
          currency: 'usd',
          recurring: { interval: 'month' },
          product_data: {
            name: `Trailer Rental — monthly (rental ${rentalId.slice(-8).toUpperCase()})`,
          },
          metadata: { rentalId },
        },
        { idempotencyKey: `price_rental_${rentalId}` },
      );

      // trial_end = 30 days from now: the deposit covers the first month,
      // so recurring billing should not start until the next billing cycle.
      const trialEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

      // Idempotency key ensures webhook + callback race produces only one subscription.
      // Stripe returns the cached result if the same key is replayed within 24 h.
      const subscription = await stripe.subscriptions.create(
        {
          customer: effectiveCustomerId,
          items: [{ price: price.id }],
          metadata: { rentalId, type: 'monthly_rental' },
          payment_settings: {
            payment_method_types: ['card'],
            save_default_payment_method: 'on_subscription',
          },
          proration_behavior: 'none',
          trial_end: trialEnd, // first month already covered by deposit
        } as Parameters<typeof stripe.subscriptions.create>[0],
        { idempotencyKey: `sub_create_rental_${rentalId}` },
      );

      await storage.updateRental(rentalId, { stripeSubscriptionId: subscription.id });
      console.log(`[deposit] Monthly subscription ${subscription.id} created for rental ${rentalId}`);
      subscriptionCreated = true;
    } catch (err) {
      console.error(`[deposit] Subscription creation failed for rental ${rentalId}:`, err);
      // Surface to audit log so admin can see the failure and retry via billing controls
      try {
        await storage.createAuditLog({
          userId: null,
          actionType: 'subscription_creation_failed',
          entityType: 'rental',
          entityId: rentalId,
          description: `Auto-subscription creation failed after deposit: ${err instanceof Error ? err.message : String(err)}. Admin can retry via billing controls.`,
          isAdminEntry: false,
          ipAddress: null,
        });
      } catch (logErr) {
        console.error('[deposit] Could not write subscription failure audit log:', logErr);
      }
    }
  }

  // ── 3. Audit log ────────────────────────────────────────────────────────────
  try {
    const verb = wasAlreadyActive ? 'subscription ensured after prior activation' : 'rental activated';
    await storage.createAuditLog({
      userId: userId ?? null,
      actionType: `deposit_finalized_${triggeredBy}`,
      entityType: 'rental',
      entityId: rentalId,
      description: `Deposit finalized (${triggeredBy})${paymentIntentId ? ` — PI: ${paymentIntentId}` : ''} — ${verb}${subscriptionCreated ? ', subscription created' : ''}`,
      isAdminEntry: triggeredBy === 'admin_manual',
      ipAddress: ipAddress ?? null,
    });
  } catch (err) {
    console.error('[deposit] Audit log write failed:', err);
  }

  // ── 4. Emails ───────────────────────────────────────────────────────────────
  try {
    const company = await storage.getCompany(rental.companyId);
    const trailer = await storage.getTrailer(rental.trailerId);
    if (company && trailer) {
      const { sendDepositConfirmedEmail, sendDepositReceivedAdminEmail } = await import('./email-service');
      const emailJobs: Promise<void>[] = [
        sendDepositReceivedAdminEmail({
          rentalId,
          companyName: company.name,
          trailerVin: trailer.vin,
          trailerType: trailer.type,
          monthlyRate: rental.monthlyRate,
          paymentIntentId,
        }),
      ];
      // Only send renter email on first activation to avoid duplicate
      if (!wasAlreadyActive) {
        emailJobs.push(
          sendDepositConfirmedEmail({
            rentalId,
            companyName: company.name,
            renterEmail: company.email,
            renterName: company.ownerName,
            trailerVin: trailer.vin,
            trailerType: trailer.type,
            monthlyRate: rental.monthlyRate,
          })
        );
      }
      await Promise.allSettled(emailJobs);
    }
  } catch (err) {
    console.error('[deposit] Email dispatch failed:', err);
  }

  return {
    activated: !wasAlreadyActive,
    subscriptionCreated,
    alreadyDone: wasAlreadyActive && !subscriptionCreated,
  };
}

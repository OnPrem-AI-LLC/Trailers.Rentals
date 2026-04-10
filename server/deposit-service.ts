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
  stripeCustomerId?: string; // if provided, will be persisted if not already set
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

  if (!freshRental?.stripeSubscriptionId && effectiveCustomerId && rental.monthlyRate > 0) {
    try {
      const stripe = await getUncachableStripeClient();

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
        customer: effectiveCustomerId,
        items: [{ price: price.id }],
        metadata: { rentalId, type: 'monthly_rental' },
        payment_settings: { payment_method_types: ['card'] },
        proration_behavior: 'none',
      });

      await storage.updateRental(rentalId, { stripeSubscriptionId: subscription.id });
      console.log(`[deposit] Monthly subscription ${subscription.id} created for rental ${rentalId}`);
      subscriptionCreated = true;
    } catch (err) {
      // Non-fatal — admin can manually retry via admin billing controls
      console.error(`[deposit] Subscription creation failed for rental ${rentalId}:`, err);
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

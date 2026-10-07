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
 *  4. Create monthly Stripe subscription (if not already created AND the
 *     rental carries renewal consent; without consent the rental stays active
 *     and the dashboard consent path starts billing later)
 *  5. Write audit log
 *  6. Send renter confirmation email (once)
 *  7. Send admin notification email
 */

import { storage } from './storage';
import { db } from './db';
import { rentals, trailers } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { getUncachableStripeClient } from './stripeClient';
import { randomBytes } from 'crypto';

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
  subscriptionBlockedNoConsent: boolean;
  alreadyDone: boolean;
  needsSubscriptionRetry: boolean;
}> {
  const { rentalId, paymentIntentId, triggeredBy, userId, ipAddress } = opts;

  const rental = await storage.getRental(rentalId);
  if (!rental) throw new Error(`Rental ${rentalId} not found`);

  // Resolve Stripe customer ID — prefer what's on the rental already
  const customerId = rental.stripeCustomerId ?? opts.stripeCustomerId ?? null;

  // ── 1. Activate rental (compare-and-set, transactional) ────────────────────
  // The webhook and the client callback usually arrive within the same second
  // and both read deposit_paid = false. The WHERE clause lets exactly one of
  // them flip it, and only that caller sends the activation emails.
  let activatedNow = false;
  if (!rental.depositPaid) {
    const pickupToken = rental.pickupToken ?? randomBytes(32).toString('hex');
    const returnToken = rental.returnToken ?? randomBytes(32).toString('hex');

    await db.transaction(async (tx) => {
      const won = await tx.update(rentals).set({
        depositPaid: true,
        status: 'active',
        startDate: new Date(),
        ...(customerId && !rental.stripeCustomerId ? { stripeCustomerId: customerId } : {}),
        ...(!rental.pickupToken ? { pickupToken } : {}),
        ...(!rental.returnToken ? { returnToken } : {}),
      }).where(and(eq(rentals.id, rentalId), eq(rentals.depositPaid, false))).returning({ id: rentals.id });
      if (won.length === 0) return; // the other caller activated first
      activatedNow = true;
      await tx.update(trailers).set({ status: 'rented' }).where(eq(trailers.id, rental.trailerId));
    });
  }
  const wasAlreadyActive = !activatedNow;
  if (wasAlreadyActive && customerId && !rental.stripeCustomerId) {
    // Rental already active but missing customer ID — patch it
    await storage.updateRental(rentalId, { stripeCustomerId: customerId });
  }

  // ── 2. Ensure monthly subscription exists (idempotent) ────────────────────
  let subscriptionCreated = false;
  let subscriptionBlockedNoConsent = false;
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

  const wantsSubscription = !freshRental?.stripeSubscriptionId && !!effectiveCustomerId && rental.monthlyRate > 0;

  // Consent is recorded when the renter ticks the box on the payment page,
  // before the PaymentIntent exists, so a record on file is bound to a card
  // payment only if that payment actually succeeded. The webhook and client
  // callback paths carry a succeeded deposit PaymentIntent by construction. An
  // admin confirming by hand (check, wire, a repaired webhook) does not, so
  // Stripe is asked whether the rental's deposit intent succeeded; if it did
  // not, the consent came from an abandoned payment page and is discarded,
  // and monthly billing can only start from the renter's dashboard, which
  // collects consent and a card together.
  let consentBoundToPayment = triggeredBy !== 'admin_manual';
  if (!consentBoundToPayment && wantsSubscription && freshRental?.renewalConsentAt) {
    if (freshRental.stripeDepositIntentId) {
      try {
        const stripe = await getUncachableStripeClient();
        const pi = await stripe.paymentIntents.retrieve(freshRental.stripeDepositIntentId);
        consentBoundToPayment = pi.status === 'succeeded' && pi.metadata?.rentalId === rentalId;
      } catch (piErr) {
        console.warn(`[deposit] Rental ${rentalId}: could not verify deposit intent ${freshRental.stripeDepositIntentId}:`, piErr);
      }
    }
    if (!consentBoundToPayment) {
      await storage.updateRental(rentalId, { renewalConsentAt: null, renewalTermsVersion: null });
      console.warn(`[deposit] Rental ${rentalId}: manual confirmation; stale renewal consent (no succeeded deposit payment) discarded.`);
    }
  }

  if (wantsSubscription && (!freshRental?.renewalConsentAt || !consentBoundToPayment)) {
    // No usable consent to automatic renewal: never enroll silently. The
    // rental stays active without a subscription; the dashboard consent path
    // (create-subscription-session) records consent and starts billing.
    subscriptionBlockedNoConsent = true;
    console.warn(`[deposit] Rental ${rentalId}: deposit confirmed but no renewal consent on file; subscription NOT created.`);
    try {
      await storage.createAuditLog({
        userId: userId ?? null,
        actionType: 'subscription_blocked_no_consent',
        entityType: 'rental',
        entityId: rentalId,
        description: triggeredBy === 'admin_manual' && freshRental?.renewalConsentAt
          ? `Deposit confirmed manually (${triggeredBy}); the renewal consent on file was not tied to a successful card payment, so it was discarded and no monthly subscription was created. Renter must start billing from the dashboard.`
          : `Deposit finalized (${triggeredBy}) but the rental has no renewal consent recorded; monthly subscription not created. Renter must start billing from the dashboard.`,
        isAdminEntry: triggeredBy === 'admin_manual',
        ipAddress: ipAddress ?? null,
      });
    } catch (logErr) {
      console.error('[deposit] Could not write no-consent audit log:', logErr);
    }
    // Only alert the admin once, on first activation; replays would duplicate it.
    if (!wasAlreadyActive) {
      try {
        const company = await storage.getCompany(rental.companyId);
        const trailer = await storage.getTrailer(rental.trailerId);
        const { sendSubscriptionBlockedNoConsentAdminEmail } = await import('./email-service');
        await sendSubscriptionBlockedNoConsentAdminEmail({
          rentalId,
          companyName: company?.name ?? rental.companyId,
          trailerType: trailer?.type ?? 'Trailer',
          trailerVin: trailer?.vin ?? '',
          monthlyRate: rental.monthlyRate,
        });
      } catch (emailErr) {
        console.error('[deposit] Could not send no-consent admin email:', emailErr);
      }
    }
  } else if (wantsSubscription && effectiveCustomerId) {
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
          metadata: {
            rentalId,
            type: 'monthly_rental',
            renewalTermsVersion: freshRental?.renewalTermsVersion ?? '',
          },
          payment_settings: {
            payment_method_types: ['card'],
            save_default_payment_method: 'on_subscription',
          },
          proration_behavior: 'none',
          trial_end: trialEnd, // first month already covered by deposit
        } as Parameters<typeof stripe.subscriptions.create>[0],
        { idempotencyKey: `sub_create_rental_${rentalId}` },
      );

      // A fresh subscription has no pending cancellation; clear any stale schedule.
      await storage.updateRental(rentalId, {
        stripeSubscriptionId: subscription.id,
        subscriptionCancelRequestedAt: null,
        subscriptionEndsAt: null,
      });
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
      description: `Deposit finalized (${triggeredBy})${paymentIntentId ? ` — PI: ${paymentIntentId}` : ''} — ${verb}${subscriptionCreated ? ', subscription created' : ''}${subscriptionBlockedNoConsent ? ', subscription withheld (no renewal consent)' : ''}`,
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
      const emailJobs: Promise<void>[] = [];
      // Only send emails on first activation — skip on idempotent replays to prevent duplicates
      if (!wasAlreadyActive) {
        emailJobs.push(
          sendDepositReceivedAdminEmail({
            rentalId,
            companyName: company.name,
            trailerVin: trailer.vin ?? '',
            trailerType: trailer.type,
            monthlyRate: rental.monthlyRate,
            paymentIntentId,
          })
        );
      }
      // Only send renter email on first activation to avoid duplicate
      if (!wasAlreadyActive) {
        const latest = await storage.getRental(rentalId);
        emailJobs.push(
          sendDepositConfirmedEmail({
            rentalId,
            companyName: company.name,
            renterEmail: company.email,
            renterName: company.ownerName,
            trailerVin: trailer.vin ?? '',
            trailerType: trailer.type,
            monthlyRate: rental.monthlyRate,
            subscriptionStarted: !!latest?.stripeSubscriptionId,
          })
        );
      }
      await Promise.allSettled(emailJobs);
    }
  } catch (err) {
    console.error('[deposit] Email dispatch failed:', err);
  }

  // Flag if rental is active but subscription failed — needs admin attention.
  // The no-consent case is not a failure: the renter's dashboard path resolves it.
  const needsSubscriptionRetry = !wasAlreadyActive && !subscriptionCreated && !subscriptionBlockedNoConsent && rental.monthlyRate > 0;
  if (needsSubscriptionRetry) {
    console.warn(`[deposit] ALERT: Rental ${rentalId} activated but subscription NOT created. Needs admin intervention.`);
  }

  return {
    activated: !wasAlreadyActive,
    subscriptionCreated,
    subscriptionBlockedNoConsent,
    alreadyDone: wasAlreadyActive && !subscriptionCreated,
    needsSubscriptionRetry,
  };
}

/**
 * Attaching a Stripe subscription to a rental.
 *
 * Shared by the checkout.session.completed webhook, the dashboard's
 * return-from-Checkout call and create-subscription-session's "already live
 * in Stripe" lookup, so every path records the same consent and refuses the
 * same duplicates. Consent to automatic renewal travels in the Checkout
 * session's metadata (the renter ticked the box before Stripe's page opened)
 * and is written to the rental here, in the same update that attaches the
 * subscription: a subscription can never be attached without its consent
 * record, and an abandoned Checkout leaves no consent behind.
 */

import type Stripe from 'stripe';
import type { Rental } from '@shared/schema';
import { storage } from './storage';
import { getUncachableStripeClient } from './stripeClient';

export type AttachSource = 'webhook' | 'client_return' | 'stripe_lookup';

export interface AttachInput {
  rental: Rental;
  subscriptionId: string;
  customerId?: string | null;
  /** Terms version from the Checkout session or subscription metadata. */
  renewalTermsVersion: string | null;
  /** When the renter agreed: session metadata, else the Stripe object's creation time. */
  renewalConsentAt: Date;
  source: AttachSource;
  checkoutSessionId?: string | null;
}

export type AttachResult =
  | { outcome: 'attached' }
  | { outcome: 'already_attached' }
  | { outcome: 'duplicate_kept_existing'; existingSubscriptionId: string };

/** Stripe statuses under which a subscription can still invoice the customer. */
const ENDED_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set<Stripe.Subscription.Status>(['canceled', 'incomplete_expired']);

export function isLiveSubscription(sub: Stripe.Subscription): boolean {
  return !ENDED_STATUSES.has(sub.status);
}

/**
 * The moment the renter agreed, as recorded in metadata by
 * create-subscription-session, else the Stripe object's own creation time.
 */
export function consentAtFromMetadata(metadata: Stripe.Metadata | null | undefined, createdSec: number): Date {
  const iso = metadata?.renewalConsentAt;
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(createdSec * 1000);
}

/**
 * A subscription for this rental that Stripe still considers live, whatever
 * created it (deposit-service, Checkout, or an admin retry). Stripe, not the
 * rental row, is the source of truth for "already billing": the row is only
 * written once a webhook or return call lands.
 */
export async function findLiveSubscriptionForRental(
  stripe: Stripe,
  customerId: string,
  rentalId: string,
): Promise<Stripe.Subscription | null> {
  const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
  return list.data.find((s) => isLiveSubscription(s) && s.metadata?.rentalId === rentalId) ?? null;
}

/**
 * Expire every open subscription Checkout session for this rental so that a
 * session left in another tab cannot be completed after a new one is created.
 * A session that is being completed concurrently refuses to expire; that is
 * fine, the new one is the duplicate then and attach() keeps the first.
 */
export async function expireOpenCheckoutSessions(stripe: Stripe, customerId: string, rentalId: string): Promise<number> {
  const open = await stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 20 });
  let expired = 0;
  for (const s of open.data) {
    if (s.mode !== 'subscription' || s.metadata?.rentalId !== rentalId) continue;
    try {
      await stripe.checkout.sessions.expire(s.id);
      expired++;
    } catch (err) {
      console.warn(`[subscription] could not expire Checkout session ${s.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return expired;
}

export async function attachSubscriptionToRental(input: AttachInput): Promise<AttachResult> {
  const { rental, subscriptionId: subId, source } = input;
  if (rental.stripeSubscriptionId === subId) return { outcome: 'already_attached' };

  const stripe = await getUncachableStripeClient();

  if (rental.stripeSubscriptionId && rental.stripeSubscriptionId !== subId) {
    // Never silently replace a live subscription: the one dropped from the
    // rental would keep invoicing with nothing pointing at it. Only a
    // subscription Stripe says has ended may be replaced (its .deleted
    // webhook was missed).
    let existingLive = false;
    try {
      const existing = await stripe.subscriptions.retrieve(rental.stripeSubscriptionId);
      existingLive = isLiveSubscription(existing);
    } catch (err) {
      if ((err as { code?: string }).code !== 'resource_missing') throw err;
    }
    if (existingLive) {
      const where = `${source}${input.checkoutSessionId ? `, Checkout session ${input.checkoutSessionId}` : ''}`;
      console.error(`[subscription] rental ${rental.id}: duplicate subscription ${subId} (${where}); keeping ${rental.stripeSubscriptionId}`);
      await storage.createAuditLog({
        userId: rental.userId ?? null,
        actionType: 'duplicate_subscription_detected',
        entityType: 'rental',
        entityId: rental.id,
        description: `ACTION REQUIRED: Stripe subscription ${subId} (${where}) was created for a rental that already has live subscription ${rental.stripeSubscriptionId}. The existing one was kept; ${subId} is NOT attached and must be cancelled, and any charge refunded, in the Stripe dashboard.`,
        isAdminEntry: false,
        ipAddress: null,
      });
      try {
        const company = await storage.getCompany(rental.companyId);
        const { sendDuplicateSubscriptionAdminEmail } = await import('./email-service');
        await sendDuplicateSubscriptionAdminEmail({
          rentalId: rental.id,
          companyName: company?.name ?? rental.companyId,
          keptSubscriptionId: rental.stripeSubscriptionId,
          duplicateSubscriptionId: subId,
        });
      } catch (emailErr) {
        console.error('[subscription] duplicate-subscription admin email failed:', emailErr);
      }
      return { outcome: 'duplicate_kept_existing', existingSubscriptionId: rental.stripeSubscriptionId };
    }
  }

  const termsVersion = input.renewalTermsVersion ?? rental.renewalTermsVersion ?? null;
  await storage.updateRental(rental.id, {
    stripeSubscriptionId: subId,
    ...(input.customerId && !rental.stripeCustomerId ? { stripeCustomerId: input.customerId } : {}),
    renewalConsentAt: input.renewalConsentAt,
    renewalTermsVersion: termsVersion,
    // A fresh subscription has no pending cancellation and no past end.
    subscriptionCancelRequestedAt: null,
    subscriptionEndsAt: null,
  });
  await storage.createAuditLog({
    userId: rental.userId ?? null,
    actionType: 'subscription_created_by_checkout',
    entityType: 'rental',
    entityId: rental.id,
    description: `Monthly subscription ${subId} attached (${source}${input.checkoutSessionId ? `, Checkout session ${input.checkoutSessionId}` : ''}); renewal consent ${input.renewalConsentAt.toISOString()}, terms version ${termsVersion ?? 'unknown'}.`,
    isAdminEntry: false,
    ipAddress: null,
  });

  try {
    const user = rental.userId ? await storage.getUser(rental.userId) : null;
    const trailer = await storage.getTrailer(rental.trailerId);
    const company = await storage.getCompany(rental.companyId);
    const renterEmail = user?.username ?? company?.email ?? null;
    if (renterEmail) {
      const displayName = user
        ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username
        : company?.ownerName ?? company?.name ?? renterEmail;
      const { sendSubscriptionStartedEmail } = await import('./email-service');
      await sendSubscriptionStartedEmail({
        rentalId: rental.id,
        renterEmail,
        renterName: displayName,
        companyName: company?.name ?? displayName,
        trailerType: trailer?.type ?? 'Trailer',
        trailerVin: trailer?.vin ?? '',
        monthlyRate: rental.monthlyRate,
        renewalTermsVersion: termsVersion,
      });
    } else {
      console.warn(`[subscription] rental ${rental.id}: no recipient for the subscription-started email`);
    }
  } catch (emailErr) {
    console.error('[subscription] subscription-started email failed:', emailErr);
  }

  return { outcome: 'attached' };
}

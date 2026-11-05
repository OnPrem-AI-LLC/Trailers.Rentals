import { getStripeClient } from './stripeClient';
import { finalizeDepositPayment } from './deposit-service';
import { storage } from './storage';
import { sendMonthlyInvoiceEmail } from './email-service';
import { attachSubscriptionToRental, consentAtFromMetadata, markSubscriptionEnded } from './subscription-service';
import { COMPANY } from '@shared/constants';
import type Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

/** Extract subscription ID from an Invoice (Stripe v20+ moved it to parent.subscription_details) */
function getInvoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  const sub = inv.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

/**
 * The date a subscription is scheduled to stop, read from Stripe's own object.
 * cancel_at covers both our 30-day-notice path (explicit cancel_at) and
 * cancel_at_period_end (Stripe fills cancel_at in); the item period end is
 * the fallback. Null means no cancellation is scheduled.
 */
function scheduledEnd(sub: Stripe.Subscription): Date | null {
  if (!sub.cancel_at && !sub.cancel_at_period_end) return null;
  const sec = sub.cancel_at ?? sub.items.data[0]?.current_period_end ?? null;
  return sec ? new Date(sec * 1000) : null;
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

    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    }

    // Verify signature and parse event using Stripe SDK
    const stripe = getStripeClient();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      // ── Deposit finalization ─────────────────────────────────────────────────
      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.metadata?.type === 'deposit' && pi.metadata?.rentalId) {
          const result = await finalizeDepositPayment({
            rentalId: pi.metadata.rentalId,
            paymentIntentId: pi.id,
            stripeCustomerId: typeof pi.customer === 'string' ? pi.customer : undefined,
            paymentMethodId: typeof pi.payment_method === 'string' ? pi.payment_method : undefined,
            triggeredBy: 'webhook',
          });
          console.log(
            `[webhook] finalizeDepositPayment for rental ${pi.metadata.rentalId}:`,
            result,
          );
        }

      // ── Subscription set up from the dashboard (Checkout, mode=subscription) ──
      } else if (event.type === 'checkout.session.completed') {
        // The dashboard's return call may already have attached this
        // subscription; attach() is idempotent and refuses duplicates. Consent
        // (time and terms version) comes from the session metadata that
        // create-subscription-session wrote when the renter ticked the box.
        const session = event.data.object as Stripe.Checkout.Session;
        const rentalId = session.metadata?.rentalId;
        if (session.mode === 'subscription' && rentalId) {
          const subId = idOf(session.subscription);
          const rental = await storage.getRental(rentalId);
          if (!rental) {
            console.warn(`[webhook] checkout.session.completed: rental ${rentalId} not found`);
          } else if (!subId) {
            console.warn(`[webhook] checkout.session.completed: session ${session.id} has no subscription`);
          } else {
            const result = await attachSubscriptionToRental({
              rental,
              subscriptionId: subId,
              customerId: idOf(session.customer),
              renewalTermsVersion: session.metadata?.renewalTermsVersion ?? null,
              renewalConsentAt: consentAtFromMetadata(session.metadata, session.created),
              source: 'webhook',
              checkoutSessionId: session.id,
            });
            console.log(`[webhook] checkout.session.completed: rental ${rentalId}, subscription ${subId}: ${result.outcome}`);
          }
        }

      // ── Recurring invoice paid ───────────────────────────────────────────────
      } else if (event.type === 'invoice.paid') {
        const inv = event.data.object as Stripe.Invoice;
        const subId = getInvoiceSubscriptionId(inv);
        console.log(`[webhook] Invoice ${inv.id} paid (subscription: ${subId ?? 'none'})`);

        if (!subId) {
          console.log(`[webhook] Skipping non-subscription invoice ${inv.id}`);
          return;
        }
        const rental = subId ? await storage.getRentalBySubscriptionId(subId) : null;

        if (rental) {
          const periodEnd = inv.period_end
            ? new Date(inv.period_end * 1000)
            : new Date();
          const billingPeriod = periodEnd.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: COMPANY.timeZone });

          await storage.createAuditLog({
            userId: null,
            actionType: 'recurring_payment_received',
            entityType: 'rental',
            entityId: rental.id,
            description: `Recurring monthly invoice paid: $${(inv.amount_paid / 100).toLocaleString()} for ${billingPeriod}. Invoice: ${inv.id}`,
            isAdminEntry: false,
            ipAddress: null,
          });
        } else {
          console.warn(`[webhook] invoice.paid: no rental found for subscription ${subId}`);
        }

      // ── Invoice finalized ──────────────────────────────────────────────────
      } else if (event.type === 'invoice.finalized') {
        const inv = event.data.object as Stripe.Invoice;
        const subId = getInvoiceSubscriptionId(inv);
        if (subId) {
          const rental = await storage.getRentalBySubscriptionId(subId);
          if (rental) {
            const periodEnd = inv.period_end ? new Date(inv.period_end * 1000) : new Date();
            const billingPeriod = periodEnd.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: COMPANY.timeZone });

            await storage.createAuditLog({
              userId: null,
              actionType: 'invoice_finalized',
              entityType: 'rental',
              entityId: rental.id,
              description: `Monthly invoice finalized: $${(inv.amount_due / 100).toLocaleString()} for ${billingPeriod}. Invoice: ${inv.id}`,
              isAdminEntry: false,
              ipAddress: null,
            });

            try {
              const user = rental.userId ? await storage.getUser(rental.userId) : null;
              const trailer = await storage.getTrailer(rental.trailerId);
              const company = rental.companyId ? await storage.getCompany(rental.companyId) : null;
              const renterEmail = user?.username ?? company?.email ?? null;
              if (trailer && renterEmail) {
                const displayName = user
                  ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username
                  : company?.name ?? renterEmail;
                await sendMonthlyInvoiceEmail({
                  rentalId: rental.id,
                  renterEmail,
                  renterName: displayName,
                  companyName: company?.name ?? displayName,
                  trailerType: trailer.type,
                  trailerVin: trailer.vin ?? '',
                  amount: inv.amount_due,
                  monthlyRate: rental.monthlyRate,
                  servicePlanMonthly: rental.servicePlanMonthly,
                  invoiceUrl: inv.hosted_invoice_url ?? null,
                  pdfUrl: inv.invoice_pdf ?? null,
                  billingPeriod,
                });
              } else {
                console.warn(`[webhook] invoice.finalized: no recipient for rental ${rental.id} — skipping email`);
              }
            } catch (emailErr) {
              console.error('[webhook] Failed to send invoice finalized email:', emailErr);
            }
          }
        }

      // ── Invoice payment failed ───────────────────────────────────────────────
      } else if (event.type === 'invoice.payment_failed') {
        const inv = event.data.object as Stripe.Invoice;
        const subId = getInvoiceSubscriptionId(inv);
        console.warn(`[webhook] Invoice payment FAILED: ${inv.id} (subscription: ${subId ?? 'none'})`);
        const rental = subId ? await storage.getRentalBySubscriptionId(subId) : null;

        if (rental) {
          await storage.createAuditLog({
            userId: null,
            actionType: 'recurring_payment_failed',
            entityType: 'rental',
            entityId: rental.id,
            description: `Recurring payment FAILED: $${(inv.amount_due / 100).toLocaleString()}, invoice ${inv.id}, attempt #${inv.attempt_count ?? 1}. Check Stripe dashboard.`,
            isAdminEntry: false,
            ipAddress: null,
          });
        }

      // ── Subscription lifecycle ───────────────────────────────────────────────
      } else if (event.type === 'customer.subscription.deleted') {
        // This is the only event that means billing has actually ended. For a
        // renter-requested cancellation Stripe sends it at the scheduled end,
        // after the earlier .updated event that merely scheduled it.
        const sub = event.data.object as Stripe.Subscription;
        const rental = await storage.getRentalBySubscriptionId(sub.id);
        if (rental) {
          const endedAt = sub.ended_at ? new Date(sub.ended_at * 1000) : new Date();
          // Same end state as every app-initiated cancellation: id cleared,
          // actual end kept for the dashboard, renewal consent revoked.
          await markSubscriptionEnded(rental, { subscriptionId: sub.id, endedAt, how: 'webhook event' });
        }

      } else if (event.type === 'customer.subscription.updated') {
        const stale = event.data.object as Stripe.Subscription;
        const rental = await storage.getRentalBySubscriptionId(stale.id);
        if (rental) {
          // Webhooks can arrive out of order, so the event payload may describe
          // an older state. Re-fetch and mirror cancel state only from the
          // fresh object. If the subscription is gone, .deleted owns the update.
          let sub: Stripe.Subscription;
          try {
            sub = await stripe.subscriptions.retrieve(stale.id);
          } catch (fetchErr) {
            console.warn(`[webhook] customer.subscription.updated: could not re-fetch ${stale.id}; skipping`, fetchErr);
            return;
          }
          if (sub.status === 'canceled') {
            console.log(`[webhook] customer.subscription.updated: ${sub.id} already canceled; leaving to .deleted`);
            return;
          }

          // A scheduled cancellation keeps the subscription (and the rental)
          // active until the end date; only .deleted ends it. Mirroring here
          // also covers cancellations made in the Stripe dashboard, and clears
          // a schedule that was reversed before it took effect.
          const endsAt = scheduledEnd(sub);
          let scheduleNote = '';
          if (endsAt) {
            await storage.updateRental(rental.id, {
              subscriptionCancelRequestedAt: rental.subscriptionCancelRequestedAt ?? new Date(),
              subscriptionEndsAt: endsAt,
            });
            scheduleNote = ` Scheduled to end ${endsAt.toISOString()}; billing continues until then.`;
          } else if (sub.cancel_at_period_end || sub.cancel_at) {
            // Scheduled, but Stripe gave no usable date; keep what we have.
            scheduleNote = ' Scheduled to end at period end.';
          } else if (rental.subscriptionCancelRequestedAt || rental.subscriptionEndsAt) {
            await storage.updateRental(rental.id, {
              subscriptionCancelRequestedAt: null,
              subscriptionEndsAt: null,
            });
            scheduleNote = ' Pending cancellation was reversed; billing continues.';
          }
          await storage.createAuditLog({
            userId: null,
            actionType: 'subscription_updated',
            entityType: 'rental',
            entityId: rental.id,
            description: `Stripe subscription ${sub.id} updated — status: ${sub.status}.${scheduleNote}`,
            isAdminEntry: false,
            ipAddress: null,
          });
        }
      }
    } catch (err) {
      console.error(`[webhook] Business logic error for ${event.type}:`, err);
    }
  }
}

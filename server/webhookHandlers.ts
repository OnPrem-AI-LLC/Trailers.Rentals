import { getStripeClient } from './stripeClient';
import { finalizeDepositPayment } from './deposit-service';
import { storage } from './storage';
import { sendMonthlyInvoiceEmail } from './email-service';
import type Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

/** Extract subscription ID from an Invoice (Stripe v20+ moved it to parent.subscription_details) */
function getInvoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  const sub = inv.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
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
          const billingPeriod = periodEnd.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

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
            const billingPeriod = periodEnd.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

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
                  renterEmail,
                  renterName: displayName,
                  companyName: company?.name ?? displayName,
                  trailerType: trailer.type,
                  trailerVin: trailer.vin ?? '',
                  amount: inv.amount_due,
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
        const sub = event.data.object as Stripe.Subscription;
        const rental = await storage.getRentalBySubscriptionId(sub.id);
        if (rental) {
          await storage.updateRental(rental.id, { stripeSubscriptionId: null });
          await storage.createAuditLog({
            userId: null,
            actionType: 'subscription_cancelled',
            entityType: 'rental',
            entityId: rental.id,
            description: `Stripe subscription ${sub.id} was cancelled/deleted (webhook event).`,
            isAdminEntry: false,
            ipAddress: null,
          });
        }

      } else if (event.type === 'customer.subscription.updated') {
        const sub = event.data.object as Stripe.Subscription;
        const rental = await storage.getRentalBySubscriptionId(sub.id);
        if (rental) {
          await storage.createAuditLog({
            userId: null,
            actionType: 'subscription_updated',
            entityType: 'rental',
            entityId: rental.id,
            description: `Stripe subscription ${sub.id} updated — status: ${sub.status}.`,
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

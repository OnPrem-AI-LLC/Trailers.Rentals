import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { finalizeDepositPayment } from './deposit-service';
import { storage } from './storage';
import { sendMonthlyInvoiceEmail } from './email-service';

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
      // ── Deposit finalization ─────────────────────────────────────────────────
      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object as {
          id: string;
          customer: string | null;
          metadata: Record<string, string>;
        };
        if (pi.metadata?.type === 'deposit' && pi.metadata?.rentalId) {
          const result = await finalizeDepositPayment({
            rentalId: pi.metadata.rentalId,
            paymentIntentId: pi.id,
            stripeCustomerId: pi.customer ?? undefined,
            triggeredBy: 'webhook',
          });
          console.log(
            `[webhook] finalizeDepositPayment for rental ${pi.metadata.rentalId}:`,
            result,
          );
        }

      // ── Recurring invoice paid ───────────────────────────────────────────────
      } else if (event.type === 'invoice.paid') {
        const inv = event.data.object as {
          id: string;
          subscription: string | null;
          amount_paid: number;
          currency: string;
          hosted_invoice_url: string | null;
          invoice_pdf: string | null;
          customer: string | null;
          period_end?: number;
          lines?: { data: { description: string | null }[] };
        };
        console.log(`[webhook] Invoice ${inv.id} paid (subscription: ${inv.subscription ?? 'none'})`);

        // Skip deposit invoices — they are already handled by payment_intent.succeeded
        if (!inv.subscription) {
          console.log(`[webhook] Skipping non-subscription invoice ${inv.id}`);
          return;
        }

        // Find the rental by subscriptionId
        const rental = inv.subscription
          ? await storage.getRentalBySubscriptionId(inv.subscription)
          : null;

        if (rental) {
          // Determine billing period label
          const periodEnd = inv.period_end
            ? new Date(inv.period_end * 1000)
            : new Date();
          const billingPeriod = periodEnd.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

          // Write audit log entry
          await storage.createAuditLog({
            userId: null,
            actionType: 'recurring_payment_received',
            entityType: 'rental',
            entityId: rental.id,
            description: `Recurring monthly invoice paid: $${(inv.amount_paid / 100).toLocaleString()} for ${billingPeriod}. Invoice: ${inv.id}`,
            isAdminEntry: false,
            ipAddress: null,
          });

          // Send renter email
          try {
            const user = rental.userId ? await storage.getUser(rental.userId) : null;
            const trailer = await storage.getTrailer(rental.trailerId);
            if (user && trailer) {
              const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
              await sendMonthlyInvoiceEmail({
                renterEmail: user.username,
                renterName: displayName,
                companyName: displayName,
                trailerType: trailer.type,
                trailerVin: trailer.vin,
                amount: inv.amount_paid,
                invoiceUrl: inv.hosted_invoice_url,
                pdfUrl: inv.invoice_pdf,
                billingPeriod,
              });
            }
          } catch (emailErr) {
            console.error('[webhook] Failed to send monthly invoice email:', emailErr);
          }
        } else {
          console.warn(`[webhook] invoice.paid: no rental found for subscription ${inv.subscription}`);
        }

      // ── Invoice payment failed ───────────────────────────────────────────────
      } else if (event.type === 'invoice.payment_failed') {
        const inv = event.data.object as {
          id: string;
          subscription: string | null;
          amount_due: number;
          attempt_count?: number;
        };
        console.warn(`[webhook] Invoice payment FAILED: ${inv.id} (subscription: ${inv.subscription ?? 'none'})`);

        const rental = inv.subscription
          ? await storage.getRentalBySubscriptionId(inv.subscription)
          : null;

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
        const sub = event.data.object as { id: string; metadata?: Record<string, string> };
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
        const sub = event.data.object as { id: string; status: string };
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
      // Non-fatal — stripe-replit-sync already responded 200 to Stripe
    }
  }
}

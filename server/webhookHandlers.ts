import { getStripeSync } from './stripeClient';
import { finalizeDepositPayment } from './deposit-service';

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
      } else if (event.type === 'invoice.paid') {
        const inv = event.data.object as { id: string; subscription: string | null };
        console.log(`[webhook] Invoice ${inv.id} paid (subscription: ${inv.subscription ?? 'none'})`);
        // Future: log receipt to payment history, send invoice email, etc.
      }
    } catch (err) {
      console.error(`[webhook] Business logic error for ${event.type}:`, err);
      // Non-fatal — stripe-replit-sync already responded 200 to Stripe
    }
  }
}

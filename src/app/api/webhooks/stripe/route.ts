import { verifyStripeWebhookSignature } from "@/integrations/stripe-webhooks";
import {
  createStripeSubscriptionLifecycle,
  parseVerifiedStripeEvent,
  StripeLifecycleValidationError,
} from "@/integrations/stripe-lifecycle";
import { createStripePersistence } from "@/integrations/stripe-persistence";

const testLifecycle = createStripeSubscriptionLifecycle();

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();
  if (!secret || !signature || !verifyStripeWebhookSignature(payload, signature, secret)) {
    return Response.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  try {
    const event = parseVerifiedStripeEvent(payload);
    if ((!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) && !process.env.VITEST) return Response.json({ error: "Webhook persistence is not configured" }, { status: 503 });
    const result = (process.env.VITEST ? testLifecycle : createStripeSubscriptionLifecycle()).processVerifiedEvent(event);
    if (result.decision === "processed") {
      const persistence = createStripePersistence({ supabaseUrl: process.env.SUPABASE_URL, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY });
      if (!persistence && !process.env.VITEST) return Response.json({ error: "Webhook persistence is not configured" }, { status: 503 });
      if (!persistence) return Response.json({ received: true, processed: true, duplicate: false, ...result });
      const firstDelivery = await persistence.recordEvent(result.eventId, event.type, result.subscription.tenantId);
      if (!firstDelivery) return Response.json({ received: true, processed: false, duplicate: true, eventId: result.eventId });
      await persistence.upsertSubscription(result.subscription);
    }
    return Response.json({
      received: true,
      processed: result.decision === "processed",
      duplicate: result.decision === "duplicate",
      ...result,
    });
  } catch (error) {
    if (error instanceof StripeLifecycleValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
}


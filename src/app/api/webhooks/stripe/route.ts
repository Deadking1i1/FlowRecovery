import { verifyStripeWebhookSignature } from "@/integrations/stripe-webhooks";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();
  if (!secret || !signature || !verifyStripeWebhookSignature(payload, signature, secret)) {
    return Response.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  // Webhook persistence and entitlement reconciliation are intentionally gated behind the database milestone.
  return Response.json({ received: true, processed: false, reason: "persistence_not_configured" });
}


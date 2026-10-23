import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { POST } from "../../src/app/api/webhooks/stripe/route";
import {
  createStripeSubscriptionLifecycle,
  mapStripeSubscriptionStatus,
  parseVerifiedStripeEvent,
} from "../../src/integrations/stripe-lifecycle";

const secret = "whsec_test_secret";
const timestamp = 1_750_000_000;

function signatureFor(body: string, signedAt = timestamp): string {
  const digest = createHmac("sha256", secret).update(`${signedAt}.${body}`).digest("hex");
  return `t=${signedAt},v1=${digest}`;
}

function subscriptionEvent(
  id: string,
  status = "active",
  metadata: Record<string, string | undefined> = { tenant_id: "tenant-a" },
) {
  return {
    id,
    livemode: false,
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_test_123",
        status,
        customer: "cus_test_123",
        metadata,
        items: { data: [{ price: { id: "price_test_123" } }] },
        cancel_at_period_end: false,
      },
    },
  };
}

describe("Stripe subscription lifecycle", () => {
  it.each([
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ])("maps Stripe status %s deterministically", (status) => {
    expect(mapStripeSubscriptionStatus(status)).toBe(status);
  });

  it("stores a verified subscription event under its tenant", () => {
    const lifecycle = createStripeSubscriptionLifecycle();

    const result = lifecycle.processVerifiedEvent(parseVerifiedStripeEvent(JSON.stringify(subscriptionEvent("evt_1"))));

    expect(result).toMatchObject({ decision: "processed", eventId: "evt_1" });
    expect(lifecycle.getSubscription("tenant-a")).toMatchObject({
      tenantId: "tenant-a",
      subscriptionId: "sub_test_123",
      customerId: "cus_test_123",
      priceId: "price_test_123",
      status: "active",
    });
  });

  it("acknowledges a duplicate event ID without applying it twice", () => {
    const lifecycle = createStripeSubscriptionLifecycle();
    const first = parseVerifiedStripeEvent(JSON.stringify(subscriptionEvent("evt_duplicate", "active")));
    const duplicate = parseVerifiedStripeEvent(JSON.stringify(subscriptionEvent("evt_duplicate", "canceled")));

    expect(lifecycle.processVerifiedEvent(first)).toMatchObject({ decision: "processed" });
    expect(lifecycle.processVerifiedEvent(duplicate)).toMatchObject({ decision: "duplicate", eventId: "evt_duplicate" });
    expect(lifecycle.getSubscription("tenant-a")?.status).toBe("active");
  });

  it.each([
    {},
    { tenant_id: "" },
    { tenant_id: "   " },
  ])("rejects missing or blank tenant metadata: %j", (metadata) => {
    const lifecycle = createStripeSubscriptionLifecycle();

    expect(() => lifecycle.processVerifiedEvent(parseVerifiedStripeEvent(JSON.stringify(subscriptionEvent("evt_metadata", "active", metadata))))).toThrow(
      "tenant_id",
    );
  });

  it("rejects live-mode events before lifecycle processing", () => {
    const event = subscriptionEvent("evt_live");
    event.livemode = true;

    expect(() => parseVerifiedStripeEvent(JSON.stringify(event))).toThrow("test mode");
  });

  it("does not parse an invalid payload when its signature is invalid", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    const response = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": signatureFor("not-json", timestamp - 301) },
        body: "not-json",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid webhook signature" });
  });

  it("processes a verified test-mode webhook and returns duplicate on retry", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    const body = JSON.stringify(subscriptionEvent("evt_route"));
    const signedAt = Math.floor(Date.now() / 1000);
    const request = () =>
      POST(
        new Request("http://localhost/api/webhooks/stripe", {
          method: "POST",
          headers: { "stripe-signature": signatureFor(body, signedAt) },
          body,
        }),
      );

    const first = await request();
    const duplicate = await request();

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ received: true, processed: true });
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({ received: true, processed: false, duplicate: true });
  });
});

import { describe, expect, it, vi } from "vitest";
import { createCheckoutSession, StripeBillingConfigurationError } from "@/integrations/stripe-billing";

describe("Stripe test billing", () => {
  it("creates a test-mode subscription checkout request", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    vi.stubEnv("STRIPE_PRICE_ID", "price_test");
    const fetcher = vi.fn<typeof fetch>(async (...args) => { void args; return new Response(JSON.stringify({ url: "https://checkout.stripe.test/session" }), { status: 200, headers: { "content-type": "application/json" } }); });
    const result = await createCheckoutSession({ tenantId: "tenant-1", customerEmail: "owner@example.com", appUrl: "https://flowrecovery.test" }, fetcher);
    expect(result.url).toContain("stripe.test");
    expect(fetcher).toHaveBeenCalledWith("https://api.stripe.com/v1/checkout/sessions", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer sk_test_example" }) }));
  });

  it("rejects a live key", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_example");
    vi.stubEnv("STRIPE_PRICE_ID", "price_test");
    await expect(createCheckoutSession({ tenantId: "tenant-1", customerEmail: "owner@example.com", appUrl: "https://flowrecovery.test" }, vi.fn())).rejects.toBeInstanceOf(StripeBillingConfigurationError);
  });
});


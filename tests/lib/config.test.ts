import { describe, expect, it, vi } from "vitest";
import { runtimeConfig } from "@/lib/config";

describe("runtimeConfig", () => {
  it("fails closed by default", () => {
    vi.stubEnv("BILLING_MODE", "test");
    vi.stubEnv("REMINDER_DELIVERY", "disabled");
    vi.stubEnv("ALLOW_EXTERNAL_SEND", "false");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    expect(runtimeConfig()).toMatchObject({ externalSendAllowed: false, readyForLiveBilling: false });
  });
});


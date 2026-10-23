import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeWebhookSignature } from "../../src/integrations/stripe-webhooks";

const payload = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
const secret = "whsec_test_secret";
const timestamp = 1_750_000_000;

function signatureFor(body: string, signingSecret = secret, signedAt = timestamp): string {
  const digest = createHmac("sha256", signingSecret).update(`${signedAt}.${body}`).digest("hex");
  return `t=${signedAt},v1=${digest}`;
}

describe("verifyStripeWebhookSignature", () => {
  it("accepts a valid signature within the five-minute tolerance", () => {
    expect(verifyStripeWebhookSignature(payload, signatureFor(payload), secret, timestamp + 300)).toBe(true);
  });

  it("rejects a changed payload or secret", () => {
    const header = signatureFor(payload);

    expect(verifyStripeWebhookSignature(`${payload}!`, header, secret, timestamp)).toBe(false);
    expect(verifyStripeWebhookSignature(payload, header, "wrong-secret", timestamp)).toBe(false);
  });

  it.each([
    "",
    `t=${timestamp}`,
    `v1=${"a".repeat(64)}`,
    `t=not-a-timestamp,v1=${"a".repeat(64)}`,
    `t=${timestamp},v1=not-hex`,
    `t=${timestamp},v1=${"a".repeat(62)}`,
  ])("rejects malformed signature header %s", (header) => {
    expect(verifyStripeWebhookSignature(payload, header, secret, timestamp)).toBe(false);
  });

  it("rejects signatures older than five minutes", () => {
    expect(verifyStripeWebhookSignature(payload, signatureFor(payload), secret, timestamp + 301)).toBe(false);
  });

  it("rejects signatures more than five minutes in the future", () => {
    expect(verifyStripeWebhookSignature(payload, signatureFor(payload, secret, timestamp + 301), secret, timestamp)).toBe(false);
  });
});

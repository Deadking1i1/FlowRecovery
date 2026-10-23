export type StripeBillingMode = "test";

export type StripeSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export interface CreateCheckoutSessionInput {
  readonly tenantId: string;
  readonly priceId: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
}

export interface BillingSession {
  readonly mode: StripeBillingMode;
  readonly sessionId: string;
  readonly url: string;
}

export interface BillingPortalInput {
  readonly tenantId: string;
  readonly returnUrl: string;
}

export interface BillingSubscription {
  readonly tenantId: string;
  readonly customerId: string;
  readonly subscriptionId: string;
  readonly status: StripeSubscriptionStatus;
  readonly priceId: string;
}

export interface StripeBillingProvider {
  readonly mode: StripeBillingMode;
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<BillingSession>;
  createPortalSession(input: BillingPortalInput): Promise<BillingSession>;
  getSubscription(tenantId: string): Promise<BillingSubscription | undefined>;
}

/** Deterministic test adapter; it never contacts Stripe and has no credential path. */
export class MockStripeBillingProvider implements StripeBillingProvider {
  readonly mode = "test" as const;
  private readonly subscriptions = new Map<string, BillingSubscription>();

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<BillingSession> {
    const sessionId = `cs_test_${stableId(input.tenantId, input.priceId)}`;
    return {
      mode: this.mode,
      sessionId,
      url: `https://checkout.stripe.test/${sessionId}`,
    };
  }

  async createPortalSession(input: BillingPortalInput): Promise<BillingSession> {
    const sessionId = `bps_test_${stableId(input.tenantId, input.returnUrl)}`;
    return {
      mode: this.mode,
      sessionId,
      url: `https://billing.stripe.test/${sessionId}`,
    };
  }

  async getSubscription(tenantId: string): Promise<BillingSubscription | undefined> {
    return this.subscriptions.get(tenantId);
  }

  setSubscription(subscription: BillingSubscription): void {
    this.subscriptions.set(subscription.tenantId, subscription);
  }
}

function stableId(...parts: string[]): string {
  return parts.join("_").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

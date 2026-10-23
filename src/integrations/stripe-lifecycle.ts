const SUPPORTED_EVENT_TYPES = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

const STATUS_MAP = {
  incomplete: "incomplete",
  incomplete_expired: "incomplete_expired",
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "unpaid",
  paused: "paused",
} as const;

export type StripeLifecycleSubscriptionStatus = keyof typeof STATUS_MAP;

export interface VerifiedStripeEvent {
  readonly id: string;
  readonly livemode: false;
  readonly type: string;
  readonly data: { readonly object: unknown };
}

export interface StripeSubscriptionRecord {
  readonly tenantId: string;
  readonly customerId: string;
  readonly subscriptionId: string;
  readonly status: StripeLifecycleSubscriptionStatus;
  readonly priceId: string;
  readonly cancelAtPeriodEnd: boolean;
}

export type StripeLifecycleResult =
  | { readonly decision: "processed"; readonly eventId: string; readonly subscription: StripeSubscriptionRecord }
  | { readonly decision: "duplicate"; readonly eventId: string }
  | { readonly decision: "ignored"; readonly eventId: string; readonly reason: "unsupported_event" };

export class StripeLifecycleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeLifecycleValidationError";
  }
}

export function parseVerifiedStripeEvent(payload: string): VerifiedStripeEvent {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    throw new StripeLifecycleValidationError("Invalid webhook payload");
  }

  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.type) || value.livemode !== false || !isRecord(value.data) || !("object" in value.data)) {
    throw new StripeLifecycleValidationError("Stripe test mode only");
  }

  return value as unknown as VerifiedStripeEvent;
}

export function mapStripeSubscriptionStatus(status: unknown): StripeLifecycleSubscriptionStatus {
  if (typeof status !== "string" || !(status in STATUS_MAP)) {
    throw new StripeLifecycleValidationError("Unsupported Stripe subscription status");
  }
  return STATUS_MAP[status as keyof typeof STATUS_MAP];
}

export class StripeSubscriptionLifecycle {
  private readonly processedEventIds = new Set<string>();
  private readonly subscriptions = new Map<string, StripeSubscriptionRecord>();

  processVerifiedEvent(event: VerifiedStripeEvent): StripeLifecycleResult {
    if (this.processedEventIds.has(event.id)) {
      return { decision: "duplicate", eventId: event.id };
    }

    if (!SUPPORTED_EVENT_TYPES.has(event.type)) {
      this.processedEventIds.add(event.id);
      return { decision: "ignored", eventId: event.id, reason: "unsupported_event" };
    }

    const subscription = readSubscription(event.data.object, event.type);
    this.processedEventIds.add(event.id);
    this.subscriptions.set(subscription.tenantId, subscription);
    return { decision: "processed", eventId: event.id, subscription };
  }

  getSubscription(tenantId: string): StripeSubscriptionRecord | undefined {
    return this.subscriptions.get(tenantId);
  }
}

export function createStripeSubscriptionLifecycle(): StripeSubscriptionLifecycle {
  return new StripeSubscriptionLifecycle();
}

function readSubscription(value: unknown, eventType: string): StripeSubscriptionRecord {
  if (!isRecord(value)) {
    throw new StripeLifecycleValidationError("Invalid Stripe subscription payload");
  }

  const metadata = value.metadata;
  const tenantId = isRecord(metadata) && typeof metadata.tenant_id === "string" ? metadata.tenant_id : undefined;
  if (!tenantId?.trim()) {
    throw new StripeLifecycleValidationError("Stripe subscription tenant_id metadata is required");
  }

  const customerId = readId(value.customer);
  const subscriptionId = typeof value.id === "string" ? value.id : undefined;
  const status = mapStripeSubscriptionStatus(value.status);
  const priceId = readPriceId(value.items);
  if (!customerId || !subscriptionId?.trim() || !priceId || typeof value.cancel_at_period_end !== "boolean") {
    throw new StripeLifecycleValidationError("Invalid Stripe subscription payload");
  }

  return {
    tenantId,
    customerId,
    subscriptionId,
    status: eventType === "customer.subscription.deleted" ? "canceled" : status,
    priceId,
    cancelAtPeriodEnd: value.cancel_at_period_end,
  };
}

function readId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  return isRecord(value) && typeof value.id === "string" && value.id.trim() ? value.id : undefined;
}

function readPriceId(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.data) || !value.data.length) return undefined;
  const firstItem = value.data[0];
  return isRecord(firstItem) && isRecord(firstItem.price) && typeof firstItem.price.id === "string" && firstItem.price.id.trim()
    ? firstItem.price.id
    : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import type { StripeSubscriptionRecord } from "./stripe-lifecycle";

export interface StripePersistence {
  recordEvent(eventId: string, eventType: string, tenantId: string): Promise<boolean>;
  upsertSubscription(subscription: StripeSubscriptionRecord): Promise<void>;
}

export function createStripePersistence(options: { supabaseUrl?: string; serviceRoleKey?: string; fetcher?: typeof fetch }): StripePersistence | null {
  if (!options.supabaseUrl || !options.serviceRoleKey) return null;
  const baseUrl = options.supabaseUrl.replace(/\/$/, "");
  const fetcher = options.fetcher ?? fetch;
  const headers = { apikey: options.serviceRoleKey, authorization: `Bearer ${options.serviceRoleKey}`, "content-type": "application/json" };
  async function request(path: string, init: RequestInit) {
    const response = await fetcher(`${baseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
    if (!response.ok) throw new Error(`Supabase request failed with status ${response.status}.`);
    return response;
  }
  return {
    async recordEvent(eventId, eventType, tenantId) {
      const response = await fetcher(`${baseUrl}/rest/v1/stripe_webhook_events`, { method: "POST", headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ event_id: eventId, event_type: eventType, tenant_id: tenantId }) });
      if (!response.ok) throw new Error(`Supabase request failed with status ${response.status}.`);
      return (await response.json() as unknown[]).length > 0;
    },
    async upsertSubscription(subscription) {
      await request("subscriptions?on_conflict=tenant_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ tenant_id: subscription.tenantId, provider: "stripe", provider_customer_id: subscription.customerId, provider_subscription_id: subscription.subscriptionId, price_id: subscription.priceId, status: subscription.status, cancel_at_period_end: subscription.cancelAtPeriodEnd }) });
    },
  };
}


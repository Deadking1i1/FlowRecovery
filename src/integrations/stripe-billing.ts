export class StripeBillingConfigurationError extends Error {}

function testSecret(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) throw new StripeBillingConfigurationError("Test-mode Stripe key is required");
  return key;
}

async function stripeRequest<T>(path: string, params: URLSearchParams, fetcher = fetch): Promise<T> {
  const response = await fetcher(`https://api.stripe.com/v1/${path}`, { method: "POST", headers: { authorization: `Bearer ${testSecret()}`, "content-type": "application/x-www-form-urlencoded" }, body: params });
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "Stripe request failed");
  return body;
}

export function createCheckoutSession(input: { tenantId: string; customerEmail: string; appUrl: string }, fetcher?: typeof fetch) {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new StripeBillingConfigurationError("Stripe Price ID is required");
  const params = new URLSearchParams({ mode: "subscription", "line_items[0][price]": priceId, "line_items[0][quantity]": "1", customer_email: input.customerEmail, success_url: `${input.appUrl}/dashboard?billing=success`, cancel_url: `${input.appUrl}/dashboard?billing=cancelled`, "subscription_data[metadata][tenant_id]": input.tenantId });
  return stripeRequest<{ url: string }>("checkout/sessions", params, fetcher);
}

export function createBillingPortalSession(input: { customerId: string; appUrl: string }, fetcher?: typeof fetch) {
  return stripeRequest<{ url: string }>("billing_portal/sessions", new URLSearchParams({ customer: input.customerId, return_url: `${input.appUrl}/dashboard` }), fetcher);
}


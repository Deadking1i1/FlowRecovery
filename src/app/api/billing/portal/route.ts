import { requireTenant, AuthenticationRequiredError, TenantAccessError } from "@/lib/auth";
import { createBillingPortalSession } from "@/integrations/stripe-billing";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { tenant_id?: unknown };
    if (typeof body.tenant_id !== "string") return Response.json({ error: "tenant_id is required" }, { status: 400 });
    const { supabase, tenantId } = await requireTenant(body.tenant_id);
    const { data, error } = await supabase.from("subscriptions").select("provider_customer_id").eq("tenant_id", tenantId).maybeSingle();
    if (error || !data?.provider_customer_id) return Response.json({ error: "No billing account exists" }, { status: 404 });
    const session = await createBillingPortalSession({ customerId: data.provider_customer_id, appUrl: process.env.APP_URL ?? new URL(request.url).origin });
    return Response.json({ url: session.url });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof TenantAccessError) return Response.json({ error: "Tenant access denied" }, { status: 403 });
    return Response.json({ error: "Unable to open billing portal" }, { status: 502 });
  }
}


import { requireTenant, AuthenticationRequiredError, TenantAccessError } from "@/lib/auth";
import { createCheckoutSession, StripeBillingConfigurationError } from "@/integrations/stripe-billing";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { tenant_id?: unknown };
    if (typeof body.tenant_id !== "string") return Response.json({ error: "tenant_id is required" }, { status: 400 });
    const { user, tenantId } = await requireTenant(body.tenant_id);
    const session = await createCheckoutSession({ tenantId, customerEmail: user.email ?? "", appUrl: process.env.APP_URL ?? new URL(request.url).origin });
    return Response.json({ url: session.url });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof TenantAccessError) return Response.json({ error: "Tenant access denied" }, { status: 403 });
    if (error instanceof StripeBillingConfigurationError) return Response.json({ error: error.message }, { status: 503 });
    return Response.json({ error: "Unable to start checkout" }, { status: 502 });
  }
}


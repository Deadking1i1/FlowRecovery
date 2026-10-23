import { requireUser, AuthenticationRequiredError } from "@/lib/auth";

export async function GET(): Promise<Response> {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.from("memberships").select("tenant_id, role, tenants(id, name)").eq("user_id", user.id);
    if (error) return Response.json({ error: "Unable to load tenants" }, { status: 500 });
    return Response.json({ tenants: data ?? [] });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "Authentication required" }, { status: 401 });
    return Response.json({ error: "Unable to load tenants" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { name?: unknown };
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120) return Response.json({ error: "A valid tenant name is required" }, { status: 400 });
    const { supabase, user } = await requireUser();
    const { data: tenant, error: tenantError } = await supabase.from("tenants").insert({ name: body.name.trim(), created_by: user.id }).select("id, name").single();
    if (tenantError || !tenant) return Response.json({ error: "Unable to create tenant" }, { status: 500 });
    const { error: membershipError } = await supabase.from("memberships").insert({ tenant_id: tenant.id, user_id: user.id, role: "owner" });
    if (membershipError) return Response.json({ error: "Unable to create tenant membership" }, { status: 500 });
    return Response.json({ tenant }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "Authentication required" }, { status: 401 });
    return Response.json({ error: "Unable to create tenant" }, { status: 500 });
  }
}


import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export class AuthenticationRequiredError extends Error {
  readonly status = 401;

  constructor() {
    super("Authentication required");
  }
}

export class TenantAccessError extends Error {
  readonly status = 403;

  constructor() {
    super("Tenant access denied");
  }
}

export type AuthContext = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  user: User;
};

export async function requireUser(): Promise<AuthContext> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new AuthenticationRequiredError();
  return { supabase, user: data.user };
}

export async function requireTenant(tenantId: string): Promise<AuthContext & { tenantId: string }> {
  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId || normalizedTenantId.length > 128) throw new TenantAccessError();

  const context = await requireUser();
  const { data, error } = await context.supabase
    .from("memberships")
    .select("tenant_id")
    .eq("tenant_id", normalizedTenantId)
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (error || !data) throw new TenantAccessError();
  return { ...context, tenantId: normalizedTenantId };
}

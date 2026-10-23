import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser }, from })),
}));

import { AuthenticationRequiredError, TenantAccessError, requireTenant, requireUser } from "@/lib/auth";

describe("auth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a verified Supabase user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireUser()).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });

  it("returns the authenticated user and server client", async () => {
    const user = { id: "user-1", email: "user@example.test" };
    getUser.mockResolvedValue({ data: { user }, error: null });
    await expect(requireUser()).resolves.toMatchObject({ user });
  });

  it("requires membership for the requested tenant", async () => {
    const user = { id: "user-1" };
    getUser.mockResolvedValue({ data: { user }, error: null });
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
        }),
      }),
    });

    await expect(requireTenant("tenant-a")).rejects.toBeInstanceOf(TenantAccessError);
    expect(from).toHaveBeenCalledWith("memberships");
  });

  it("does not authorize a tenant when the membership query fails", async () => {
    const user = { id: "user-1" };
    getUser.mockResolvedValue({ data: { user }, error: null });
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error("RLS failure") }) }),
        }),
      }),
    });

    await expect(requireTenant("tenant-a")).rejects.toBeInstanceOf(TenantAccessError);
  });

  it("returns the tenant scope only after membership succeeds", async () => {
    const user = { id: "user-1" };
    getUser.mockResolvedValue({ data: { user }, error: null });
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { tenant_id: "tenant-a" }, error: null }) }),
        }),
      }),
    });

    await expect(requireTenant(" tenant-a ")).resolves.toMatchObject({ user, tenantId: "tenant-a" });
  });
});

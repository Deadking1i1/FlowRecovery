import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getCron } from "@/app/api/cron/recovery/route";
import { GET as getHealth } from "@/app/api/health/route";

afterEach(() => vi.unstubAllEnvs());

describe("release smoke", () => {
  it("reports the fail-closed deployment defaults through health", async () => {
    vi.stubEnv("BILLING_MODE", "test");
    vi.stubEnv("REMINDER_DELIVERY", "disabled");
    vi.stubEnv("ALLOW_EXTERNAL_SEND", "false");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");

    const response = await getHealth();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "flowrecovery",
      mode: "test",
      reminderDelivery: "disabled",
      externalSendAllowed: false,
      liveBillingConfigured: false,
    });
  });

  it("protects and safely reports the recovery cron endpoint", async () => {
    vi.stubEnv("CRON_SECRET", "release-smoke-secret");

    const unauthorized = await getCron(new Request("http://localhost/api/cron/recovery"));
    expect(unauthorized.status).toBe(401);

    const authorized = await getCron(
      new Request("http://localhost/api/cron/recovery", {
        headers: { authorization: "Bearer release-smoke-secret" },
      }),
    );

    expect(authorized.status).toBe(200);
    await expect(authorized.json()).resolves.toMatchObject({
      status: "safe",
      evaluated: 0,
      createdReminders: 0,
      externalSendAllowed: false,
      reason: "durable_worker_not_configured",
    });
  });
});

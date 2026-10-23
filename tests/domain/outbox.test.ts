import { describe, expect, it, vi } from "vitest";
import {
  createReminderOutboxRepository,
  runRecoveryCron,
  type RecoveryInvoice,
  type ReminderOutboxRepository,
} from "../../src/domain/outbox";
import { GET } from "../../src/app/api/cron/recovery/route";

const invoice = (overrides: Partial<RecoveryInvoice> = {}): RecoveryInvoice => ({
  id: "tenant-a-invoice-1",
  tenantId: "tenant-a",
  invoiceNumber: "INV-1",
  customerName: "Example Ltd",
  customerEmail: "accounts@example.test",
  dueDate: "2026-01-01",
  amountMinor: 10000,
  currency: "GBP",
  status: "open",
  lastReminderStage: "none",
  ...overrides,
});

describe("reminder outbox repository", () => {
  it("uses the Supabase RPC boundary for idempotent enqueueing", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ created: true, id: "outbox-1" }]))) as typeof fetch;
    const repository = createReminderOutboxRepository({
      supabaseUrl: "https://example.supabase.co/",
      serviceRoleKey: "service-role",
      fetcher,
    });

    await expect(repository.enqueueReminder({
      tenantId: "tenant-a",
      invoiceId: "invoice-a",
      stage: "first",
      scheduledFor: "2026-01-04T00:00:00.000Z",
    })).resolves.toEqual({ created: true, id: "outbox-1" });

    expect(fetcher).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/rpc/enqueue_reminder_outbox",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer service-role" }),
        body: JSON.stringify({
          p_tenant_id: "tenant-a",
          p_invoice_id: "invoice-a",
          p_stage: "first",
          p_scheduled_for: "2026-01-04T00:00:00.000Z",
        }),
      }),
    );
  });

  it("maps leased rows without changing their database values", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      id: "outbox-1",
      tenant_id: "tenant-a",
      invoice_id: "invoice-a",
      stage: "first",
      status: "leased",
      scheduled_for: "2026-01-04T00:00:00.000Z",
      available_at: "2026-01-04T00:00:00.000Z",
      attempts: 1,
      lease_token: "worker-1",
      lease_expires_at: "2026-01-04T00:05:00.000Z",
    }]))) as typeof fetch;
    const repository = createReminderOutboxRepository({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      fetcher,
    });

    await expect(repository.leaseDue("worker-1", 10, 300)).resolves.toEqual([{
      id: "outbox-1",
      tenantId: "tenant-a",
      invoiceId: "invoice-a",
      stage: "first",
      status: "leased",
      scheduledFor: "2026-01-04T00:00:00.000Z",
      availableAt: "2026-01-04T00:00:00.000Z",
      attempts: 1,
      leaseToken: "worker-1",
      leaseExpiresAt: "2026-01-04T00:05:00.000Z",
    }]);
  });
});

describe("recovery cron service", () => {
  it("evaluates deterministic rules and enqueues only new eligible reminders", async () => {
    const enqueued: string[] = [];
    const repository: ReminderOutboxRepository = {
      listInvoices: async () => [
        invoice(),
        invoice({ id: "tenant-a-invoice-2", invoiceNumber: "INV-2", lastReminderStage: "first" }),
        invoice({ id: "tenant-a-invoice-3", invoiceNumber: "INV-3", status: "paid" }),
      ],
      enqueueReminder: async ({ invoiceId, stage }) => {
        enqueued.push(`${invoiceId}:${stage}`);
        return { created: true, id: "outbox-1" };
      },
    };

    await expect(runRecoveryCron(repository, "2026-01-04", {
      gracePeriodDays: 2,
      firstReminderAfterDays: 3,
      secondReminderAfterDays: 14,
      finalReminderAfterDays: 30,
    })).resolves.toMatchObject({
      evaluated: 3,
      createdReminders: 1,
      externalSendAllowed: false,
    });
    expect(enqueued).toEqual(["tenant-a:INV-1:first"]);
  });
});

describe("recovery cron route", () => {
  it("fails closed when CRON_SECRET is missing or incorrect", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    await expect(GET(new Request("http://localhost/api/cron/recovery"))).resolves.toMatchObject({ status: 401 });
    await expect(GET(new Request("http://localhost/api/cron/recovery", { headers: { authorization: "Bearer wrong" } }))).resolves.toMatchObject({ status: 401 });
  });
});


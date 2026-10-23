import { describe, expect, it } from "vitest";
import { evaluateRecovery, invoiceKey, type Invoice, type RecoveryPolicy } from "../../src/domain/recovery";

const policy: RecoveryPolicy = {
  gracePeriodDays: 2,
  firstReminderAfterDays: 3,
  secondReminderAfterDays: 14,
  finalReminderAfterDays: 30,
};

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    tenantId: "tenant-a",
    invoiceNumber: "INV-1",
    customerName: "Example Ltd",
    customerEmail: "accounts@example.test",
    dueDate: "2026-01-01",
    amountMinor: 10000,
    currency: "GBP",
    status: "open",
    ...overrides,
  };
}

describe("recovery rules", () => {
  it("keeps an invoice open before its due date", () => {
    expect(evaluateRecovery(invoice(), "2025-12-31", policy)).toMatchObject({ status: "open", shouldCreateReminder: false });
  });

  it("creates the first reminder after the grace period", () => {
    expect(evaluateRecovery(invoice(), "2026-01-04", policy)).toMatchObject({ status: "overdue", reminderStage: "first", shouldCreateReminder: true });
  });

  it("does not repeat a recorded reminder stage", () => {
    expect(evaluateRecovery(invoice({ lastReminderStage: "first" }), "2026-01-04", policy).shouldCreateReminder).toBe(false);
  });

  it.each(["paid", "disputed", "paused", "written_off"] as const)("stops reminders for %s invoices", (status) => {
    expect(evaluateRecovery(invoice({ status }), "2026-02-01", policy).shouldCreateReminder).toBe(false);
  });

  it("includes the tenant in the invoice identity", () => {
    expect(invoiceKey(invoice())).toBe("tenant-a:INV-1");
    expect(invoiceKey(invoice({ tenantId: "tenant-b" }))).not.toBe(invoiceKey(invoice()));
  });
});

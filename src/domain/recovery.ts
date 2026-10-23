export type InvoiceStatus =
  | "open"
  | "overdue"
  | "promised"
  | "disputed"
  | "paused"
  | "paid"
  | "written_off";

export type ReminderStage = "none" | "first" | "second" | "final";

export interface Invoice {
  readonly tenantId: string;
  readonly invoiceNumber: string;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly dueDate: string;
  readonly amountMinor: number;
  readonly currency: "GBP";
  readonly status: InvoiceStatus;
  readonly lastReminderStage?: ReminderStage;
}

export interface RecoveryPolicy {
  readonly gracePeriodDays: number;
  readonly firstReminderAfterDays: number;
  readonly secondReminderAfterDays: number;
  readonly finalReminderAfterDays: number;
}

export interface RecoveryDecision {
  readonly invoiceKey: string;
  readonly status: InvoiceStatus;
  readonly overdueDays: number;
  readonly reminderStage: ReminderStage;
  readonly shouldCreateReminder: boolean;
  readonly reason: string;
}

export function invoiceKey(invoice: Pick<Invoice, "tenantId" | "invoiceNumber">): string {
  return `${invoice.tenantId}:${invoice.invoiceNumber}`;
}

export function evaluateRecovery(
  invoice: Invoice,
  today: string,
  policy: RecoveryPolicy,
): RecoveryDecision {
  const due = parseDate(invoice.dueDate);
  const now = parseDate(today);
  const overdueDays = Math.max(0, daysBetween(due, now));

  if (["paid", "disputed", "paused", "written_off"].includes(invoice.status)) {
    return {
      invoiceKey: invoiceKey(invoice),
      status: invoice.status,
      overdueDays,
      reminderStage: invoice.lastReminderStage ?? "none",
      shouldCreateReminder: false,
      reason: `Reminder stopped because invoice is ${invoice.status}.`,
    };
  }

  if (overdueDays <= policy.gracePeriodDays) {
    return {
      invoiceKey: invoiceKey(invoice),
      status: overdueDays === 0 ? "open" : "overdue",
      overdueDays,
      reminderStage: "none",
      shouldCreateReminder: false,
      reason: overdueDays === 0 ? "Invoice is not due." : "Invoice is within the grace period.",
    };
  }

  const stage = selectReminderStage(overdueDays, policy);
  return {
    invoiceKey: invoiceKey(invoice),
    status: "overdue",
    overdueDays,
    reminderStage: stage,
    shouldCreateReminder: stage !== "none" && stage !== invoice.lastReminderStage,
    reason: stage === invoice.lastReminderStage ? "This reminder stage was already recorded." : "Invoice is eligible for the next reminder.",
  };
}

function selectReminderStage(overdueDays: number, policy: RecoveryPolicy): ReminderStage {
  if (overdueDays >= policy.finalReminderAfterDays) return "final";
  if (overdueDays >= policy.secondReminderAfterDays) return "second";
  if (overdueDays >= policy.firstReminderAfterDays) return "first";
  return "none";
}

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return date;
}

function daysBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

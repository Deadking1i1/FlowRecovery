import { evaluateRecovery, type Invoice, type RecoveryPolicy, type ReminderStage } from "./recovery";

export type StoredInvoice = Invoice & { readonly id: string };
export type RecoveryInvoice = StoredInvoice;
export type ScheduledReminderStage = Exclude<ReminderStage, "none">;

export interface EnqueueReminderInput {
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly stage: ScheduledReminderStage;
  readonly scheduledFor: string;
  readonly idempotencyKey?: string;
  readonly payload?: Record<string, unknown>;
  readonly status?: "pending";
}

export interface LeasedReminder {
  readonly id: string;
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly stage: ScheduledReminderStage;
  readonly status: "leased";
  readonly scheduledFor: string;
  readonly idempotencyKey: string;
  readonly attempts: number;
  readonly leaseToken: string;
  readonly leasedUntil: string;
  readonly payload: Record<string, unknown>;
}

export interface LegacyLeasedReminder {
  readonly id: string;
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly stage: ScheduledReminderStage;
  readonly status: "leased";
  readonly scheduledFor: string;
  readonly availableAt: string;
  readonly attempts: number;
  readonly leaseToken: string;
  readonly leaseExpiresAt: string;
}

export interface ReminderOutboxRepository {
  listInvoices(): Promise<StoredInvoice[]>;
  enqueueReminder(input: EnqueueReminderInput): Promise<{ created: boolean; id: string | null }>;
  leaseDue?(workerId: string, limit?: number, leaseSeconds?: number): Promise<LegacyLeasedReminder[]>;
  leaseDueReminders?(limit?: number, leaseSeconds?: number): Promise<LeasedReminder[]>;
}

export interface RecoveryScheduleResult {
  readonly evaluated: number;
  readonly createdReminders: number;
  readonly duplicateReminders: number;
  readonly externalSendAllowed: false;
}

const recoveryPolicy: RecoveryPolicy = {
  gracePeriodDays: 2,
  firstReminderAfterDays: 3,
  secondReminderAfterDays: 14,
  finalReminderAfterDays: 30,
};

export function reminderIdempotencyKey(tenantId: string, invoiceId: string, stage: ScheduledReminderStage): string {
  return `${tenantId}:${invoiceId}:${stage}`;
}

export async function scheduleRecovery(
  repository: ReminderOutboxRepository,
  today: string,
  policy: RecoveryPolicy = recoveryPolicy,
): Promise<RecoveryScheduleResult> {
  const invoices = await repository.listInvoices();
  let createdReminders = 0;
  let duplicateReminders = 0;

  for (const invoice of invoices) {
    const decision = evaluateRecovery(invoice, today, policy);
    if (!decision.shouldCreateReminder || decision.reminderStage === "none") continue;

    const stage = decision.reminderStage;
    const result = await repository.enqueueReminder({
      tenantId: invoice.tenantId,
      invoiceId: /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(invoice.id) ? invoice.id : `${invoice.tenantId}:${invoice.invoiceNumber}`,
      stage,
      scheduledFor: `${today}T00:00:00.000Z`,
      idempotencyKey: reminderIdempotencyKey(invoice.tenantId, invoice.id, stage),
      payload: { reminderStage: stage },
      status: "pending",
    });
    if (result.created) createdReminders += 1;
    else duplicateReminders += 1;
  }

  return { evaluated: invoices.length, createdReminders, duplicateReminders, externalSendAllowed: false };
}

export const runRecoveryCron = scheduleRecovery;

interface RepositoryOptions {
  readonly baseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetcher?: typeof fetch;
}

interface InvoiceRow {
  id: unknown;
  tenant_id: unknown;
  invoice_number: unknown;
  customer_name: unknown;
  customer_email: unknown;
  due_date: unknown;
  amount_minor: unknown;
  currency: unknown;
  status: unknown;
  last_reminder_stage: unknown;
}

interface OutboxRow {
  id: unknown;
  tenant_id: unknown;
  invoice_id: unknown;
  stage: unknown;
  status: unknown;
  scheduled_for: unknown;
  idempotency_key: unknown;
  attempts: unknown;
  lease_token: unknown;
  leased_until: unknown;
  payload: unknown;
}

interface LegacyLeaseRow {
  id: unknown;
  tenant_id: unknown;
  invoice_id: unknown;
  stage: unknown;
  status: unknown;
  scheduled_for: unknown;
  available_at?: unknown;
  attempts: unknown;
  lease_token: unknown;
  lease_expires_at?: unknown;
  leased_until?: unknown;
}

export function createSupabaseOutboxRepository(options: RepositoryOptions): ReminderOutboxRepository | null {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  if (!baseUrl || !options.serviceRoleKey) return null;
  return createReminderOutboxRepository({ supabaseUrl: baseUrl, serviceRoleKey: options.serviceRoleKey, fetcher: options.fetcher });
}

type SupabaseReminderOutboxRepository = ReminderOutboxRepository & {
  leaseDue: (workerId: string, limit?: number, leaseSeconds?: number) => Promise<LegacyLeasedReminder[]>;
  leaseDueReminders: (limit?: number, leaseSeconds?: number) => Promise<LeasedReminder[]>;
};

export function createReminderOutboxRepository(options: {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetcher?: typeof fetch;
}): SupabaseReminderOutboxRepository {
  const baseUrl = options.supabaseUrl.replace(/\/$/, "");
  const fetcher = options.fetcher ?? globalThis.fetch;
  const headers = {
    apikey: options.serviceRoleKey,
    authorization: `Bearer ${options.serviceRoleKey}`,
    "content-type": "application/json",
  };

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetcher(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
    });
    if (!response.ok) throw new Error(`Supabase request failed with status ${response.status}.`);
    return (await response.json()) as T;
  }

  return {
    async listInvoices() {
      const query = new URLSearchParams({
        select: "id,tenant_id,invoice_number,customer_name,customer_email,due_date,amount_minor,currency,status,last_reminder_stage",
        order: "tenant_id.asc,invoice_number.asc",
      });
      const rows = await request<InvoiceRow[]>(`invoices?${query}`);
      return rows.map(toStoredInvoice);
    },

    async enqueueReminder(input) {
      if (!input.idempotencyKey && !input.payload && !input.status) {
        const result = await request<Array<{ created: boolean; id: string | null }>>("rpc/enqueue_reminder_outbox", {
          method: "POST",
          body: JSON.stringify({
            p_tenant_id: input.tenantId,
            p_invoice_id: input.invoiceId,
            p_stage: input.stage,
            p_scheduled_for: input.scheduledFor,
          }),
        });
        return result[0] ?? { created: false, id: null };
      }

      const query = new URLSearchParams({ on_conflict: "tenant_id,invoice_id,stage" });
      const rows = await request<Array<{ id: string }>>(`reminder_outbox?${query}`, {
        method: "POST",
        headers: { Prefer: "resolution=ignore,return=representation" },
        body: JSON.stringify({
          tenant_id: input.tenantId,
          invoice_id: input.invoiceId,
          stage: input.stage,
          scheduled_for: input.scheduledFor,
          available_at: input.scheduledFor,
          idempotency_key: input.idempotencyKey ?? reminderIdempotencyKey(input.tenantId, input.invoiceId, input.stage),
          payload: input.payload ?? {},
          status: input.status ?? "pending",
        }),
      });
      if (rows[0]?.id) return { created: true, id: rows[0].id };

      const existingQuery = new URLSearchParams({
        select: "id",
        idempotency_key: `eq.${input.idempotencyKey ?? reminderIdempotencyKey(input.tenantId, input.invoiceId, input.stage)}`,
        limit: "1",
      });
      const existing = await request<Array<{ id: string }>>(`reminder_outbox?${existingQuery}`);
      return { created: false, id: existing[0]?.id ?? null };
    },

    async leaseDue(workerId, limit = 50, leaseSeconds = 300) {
      const rows = await request<LegacyLeaseRow[]>("rpc/lease_reminder_outbox", {
        method: "POST",
        body: JSON.stringify({ p_worker_id: workerId, p_limit: limit, p_lease_seconds: leaseSeconds }),
      });
      return rows.map(toLegacyLeasedReminder);
    },

    async leaseDueReminders(limit = 50, leaseSeconds = 300) {
      const rows = await request<OutboxRow[]>("rpc/lease_reminder_outbox", {
        method: "POST",
        body: JSON.stringify({ p_limit: limit, p_lease_seconds: leaseSeconds }),
      });
      return rows.map(toLeasedReminder);
    },
  };
}

function toStoredInvoice(row: InvoiceRow): StoredInvoice {
  if (
    typeof row.id !== "string" || typeof row.tenant_id !== "string" || typeof row.invoice_number !== "string" ||
    typeof row.customer_name !== "string" || typeof row.customer_email !== "string" || typeof row.due_date !== "string" ||
    typeof row.amount_minor !== "number" || !Number.isSafeInteger(row.amount_minor) || row.currency !== "GBP" ||
    typeof row.status !== "string" || !["open", "overdue", "promised", "disputed", "paused", "paid", "written_off"].includes(row.status) ||
    (row.last_reminder_stage !== null && row.last_reminder_stage !== undefined &&
      (typeof row.last_reminder_stage !== "string" || !["none", "first", "second", "final"].includes(row.last_reminder_stage)))
  ) throw new Error("Supabase returned an invalid invoice row.");

  return {
    id: row.id,
    tenantId: row.tenant_id,
    invoiceNumber: row.invoice_number,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    dueDate: row.due_date,
    amountMinor: row.amount_minor,
    currency: "GBP",
    status: row.status as Invoice["status"],
    lastReminderStage: (row.last_reminder_stage ?? "none") as ReminderStage,
  };
}

function toLeasedReminder(row: OutboxRow): LeasedReminder {
  if (
    typeof row.id !== "string" || typeof row.tenant_id !== "string" || typeof row.invoice_id !== "string" ||
    typeof row.stage !== "string" || !["first", "second", "final"].includes(row.stage) || row.status !== "leased" ||
    typeof row.scheduled_for !== "string" || typeof row.idempotency_key !== "string" || typeof row.attempts !== "number" ||
    !Number.isSafeInteger(row.attempts) || typeof row.lease_token !== "string" || typeof row.leased_until !== "string" ||
    typeof row.payload !== "object" || row.payload === null || Array.isArray(row.payload)
  ) throw new Error("Supabase returned an invalid reminder lease.");

  return {
    id: row.id,
    tenantId: row.tenant_id,
    invoiceId: row.invoice_id,
    stage: row.stage as ScheduledReminderStage,
    status: "leased",
    scheduledFor: row.scheduled_for,
    idempotencyKey: row.idempotency_key,
    attempts: row.attempts,
    leaseToken: row.lease_token,
    leasedUntil: row.leased_until,
    payload: row.payload as Record<string, unknown>,
  };
}

function toLegacyLeasedReminder(row: LegacyLeaseRow): LegacyLeasedReminder {
  if (
    typeof row.id !== "string" || typeof row.tenant_id !== "string" || typeof row.invoice_id !== "string" ||
    typeof row.stage !== "string" || !["first", "second", "final"].includes(row.stage) || row.status !== "leased" ||
    typeof row.scheduled_for !== "string" || typeof row.attempts !== "number" ||
    !Number.isSafeInteger(row.attempts) || typeof row.lease_token !== "string" ||
    (typeof row.lease_expires_at !== "string" && typeof row.leased_until !== "string")
  ) throw new Error("Supabase returned an invalid reminder lease.");

  return {
    id: row.id,
    tenantId: row.tenant_id,
    invoiceId: row.invoice_id,
    stage: row.stage as ScheduledReminderStage,
    status: "leased",
    scheduledFor: row.scheduled_for,
    availableAt: typeof row.available_at === "string" ? row.available_at : row.scheduled_for,
    attempts: row.attempts,
    leaseToken: row.lease_token,
    leaseExpiresAt: typeof row.lease_expires_at === "string" ? row.lease_expires_at : row.leased_until as string,
  };
}

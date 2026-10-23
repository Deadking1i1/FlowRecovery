import type { InvoicePage, ProviderInvoice } from "./types";

export interface ListInvoicesInput {
  readonly tenantId: string;
  readonly cursor?: string;
}

export interface GetInvoiceInput {
  readonly tenantId: string;
  readonly providerInvoiceId: string;
}

export interface AcknowledgeWebhookInput {
  readonly tenantId: string;
  readonly eventId: string;
}

export interface AccountingProvider {
  listInvoices(input: ListInvoicesInput): Promise<InvoicePage>;
  getInvoice(input: GetInvoiceInput): Promise<ProviderInvoice | undefined>;
  acknowledgeWebhook(input: AcknowledgeWebhookInput): Promise<void>;
}

/** Deterministic in-memory adapter; it never contacts Xero and has no credential path. */
export class MockXeroAccountingProvider implements AccountingProvider {
  private readonly invoices = new Map<string, ProviderInvoice>();
  private readonly acknowledgedEvents = new Set<string>();

  addInvoice(tenantId: string, invoice: ProviderInvoice): void {
    this.invoices.set(`${tenantId}:${invoice.providerInvoiceId}`, invoice);
  }

  async listInvoices(input: ListInvoicesInput): Promise<InvoicePage> {
    const prefix = `${input.tenantId}:`;
    const invoices = [...this.invoices.entries()]
      .filter(([key, invoice]) => key.startsWith(prefix) && invoice.provider === "xero")
      .map(([, invoice]) => invoice);
    return { invoices };
  }

  async getInvoice(input: GetInvoiceInput): Promise<ProviderInvoice | undefined> {
    const invoice = this.invoices.get(`${input.tenantId}:${input.providerInvoiceId}`);
    return invoice?.provider === "xero" ? invoice : undefined;
  }

  async acknowledgeWebhook(input: AcknowledgeWebhookInput): Promise<void> {
    this.acknowledgedEvents.add(`${input.tenantId}:${input.eventId}`);
  }

  hasAcknowledgedWebhook(input: AcknowledgeWebhookInput): boolean {
    return this.acknowledgedEvents.has(`${input.tenantId}:${input.eventId}`);
  }
}

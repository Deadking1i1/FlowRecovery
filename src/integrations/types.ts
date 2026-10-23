/** Provider-neutral invoice data exchanged at integration boundaries. */
export interface ProviderInvoice {
  readonly provider: string;
  readonly providerInvoiceId: string;
  readonly invoiceNumber: string;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: "open" | "paid" | "void";
}

export interface InvoicePage {
  readonly invoices: readonly ProviderInvoice[];
  readonly nextCursor?: string;
}

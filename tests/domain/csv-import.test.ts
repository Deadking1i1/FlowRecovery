import { describe, expect, it } from "vitest";
import { parseInvoiceCsv } from "../../src/domain/csv";

const header = "invoice_number,customer_name,customer_email,due_date,amount_gbp";

describe("invoice CSV import", () => {
  it("accepts valid invoices with tenant scope and minor-unit amounts", () => {
    const result = parseInvoiceCsv(
      `${header}\nINV-1,Example Ltd,accounts@example.test,2026-01-31,100.50`,
      "tenant-a",
    );

    expect(result.errors).toEqual([]);
    expect(result.invoices).toEqual([
      {
        tenantId: "tenant-a",
        invoiceNumber: "INV-1",
        customerName: "Example Ltd",
        customerEmail: "accounts@example.test",
        dueDate: "2026-01-31",
        amountMinor: 10050,
        currency: "GBP",
        status: "open",
      },
    ]);
  });

  it("supports quoted commas and escaped quotes", () => {
    const result = parseInvoiceCsv(
      `${header}\nINV-2,"Example, ""Ltd""","billing@example.test",2026-02-01,25`,
      "tenant-a",
    );

    expect(result.errors).toEqual([]);
    expect(result.invoices[0]?.customerName).toBe('Example, "Ltd"');
  });

  it("returns row errors while accepting other valid rows", () => {
    const result = parseInvoiceCsv(
      `${header}\nINV-1,Good Ltd,good@example.test,2026-01-31,10\nINV-2,Bad Ltd,not-an-email,2026-02-31,free\nINV-3,Another Ltd,another@example.test,2026-02-01,20`,
      "tenant-a",
    );

    expect(result.invoices.map((invoice) => invoice.invoiceNumber)).toEqual(["INV-1", "INV-3"]);
    expect(result.errors).toEqual([{ row: 3, message: "customer_email is invalid; due_date is invalid; amount_gbp is invalid" }]);
  });

  it("rejects missing headers and duplicate invoice numbers", () => {
    expect(parseInvoiceCsv("invoice_number,customer_name\nINV-1,Example", "tenant-a")).toMatchObject({
      invoices: [],
      errors: [{ row: 1, message: "invalid headers" }],
    });

    const result = parseInvoiceCsv(
      `${header}\nINV-1,Example Ltd,one@example.test,2026-01-31,10\nINV-1,Other Ltd,two@example.test,2026-02-01,20`,
      "tenant-a",
    );
    expect(result.invoices).toHaveLength(1);
    expect(result.errors).toEqual([{ row: 3, message: "duplicate invoice_number" }]);
  });

  it("requires a tenant ID", () => {
    expect(() => parseInvoiceCsv(`${header}\nINV-1,Example Ltd,one@example.test,2026-01-31,10`, " ")).toThrow(
      "tenantId is required",
    );
  });
});

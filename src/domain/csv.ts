import type { Invoice } from "./recovery";

const HEADERS = ["invoice_number", "customer_name", "customer_email", "due_date", "amount_gbp"] as const;

export interface CsvRowError {
  readonly row: number;
  readonly message: string;
}

export interface InvoiceImportResult {
  readonly invoices: Invoice[];
  readonly errors: CsvRowError[];
}

interface CsvRecord {
  readonly row: number;
  readonly values: string[];
  readonly error?: string;
}

export function parseInvoiceCsv(csv: string, tenantId: string): InvoiceImportResult {
  if (!tenantId.trim()) throw new Error("tenantId is required");

  const records = parseCsv(csv);
  const header = records[0];
  if (!header || header.error || header.values.map((value) => value.trim().replace(/^\uFEFF/, "")).join(",") !== HEADERS.join(",")) {
    return { invoices: [], errors: [{ row: header?.row ?? 1, message: "invalid headers" }] };
  }

  const invoices: Invoice[] = [];
  const errors: CsvRowError[] = [];
  const seen = new Set<string>();

  for (const record of records.slice(1)) {
    if (record.values.every((value) => !value.trim()) && !record.error) continue;
    if (record.error) {
      errors.push({ row: record.row, message: record.error });
      continue;
    }

    if (record.values.length !== HEADERS.length) {
      errors.push({ row: record.row, message: `expected ${HEADERS.length} columns` });
      continue;
    }

    const [invoiceNumber, customerName, customerEmail, dueDate, amount] = record.values.map((value) => value.trim());
    const rowErrors: string[] = [];
    if (!invoiceNumber) rowErrors.push("invoice_number is required");
    if (!customerName) rowErrors.push("customer_name is required");
    if (!isEmail(customerEmail)) rowErrors.push("customer_email is invalid");
    if (!isDate(dueDate)) rowErrors.push("due_date is invalid");
    const amountMinor = parseAmount(amount);
    if (amountMinor === undefined) rowErrors.push("amount_gbp is invalid");
    if (invoiceNumber && seen.has(invoiceNumber)) rowErrors.push("duplicate invoice_number");

    if (rowErrors.length) {
      errors.push({ row: record.row, message: rowErrors.join("; ") });
      continue;
    }

    seen.add(invoiceNumber);
    invoices.push({
      tenantId,
      invoiceNumber,
      customerName,
      customerEmail,
      dueDate,
      amountMinor: amountMinor as number,
      currency: "GBP",
      status: "open",
    });
  }

  return { invoices, errors };
}

function parseCsv(csv: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let row = 1;
  let recordRow = 1;

  const finishRecord = () => {
    fields.push(field);
    records.push({ row: recordRow, values: fields });
    fields = [];
    field = "";
    recordRow = row + 1;
  };

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      fields.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      finishRecord();
      row += 1;
    } else {
      field += character;
    }
  }

  if (quoted) {
    fields.push(field);
    records.push({ row: recordRow, values: fields, error: "unterminated quoted field" });
  } else if (field || fields.length) {
    finishRecord();
  }
  return records;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseAmount(value: string): number | undefined {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [pounds, pence = ""] = value.split(".");
  const amountMinor = Number(pounds) * 100 + Number((pence + "00").slice(0, 2));
  return amountMinor > 0 && Number.isSafeInteger(amountMinor) ? amountMinor : undefined;
}

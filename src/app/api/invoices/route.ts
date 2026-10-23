import { requireTenant, AuthenticationRequiredError, TenantAccessError } from "@/lib/auth";
import { parseInvoiceCsv } from "@/domain/csv";

const MAX_CSV_BYTES = 1_000_000;

export async function GET(request: Request): Promise<Response> {
  try {
    const tenantId = new URL(request.url).searchParams.get("tenant_id");
    if (!tenantId) return Response.json({ error: "tenant_id is required" }, { status: 400 });
    const { supabase } = await requireTenant(tenantId);
    const { data, error } = await supabase.from("invoices").select("id,tenant_id,invoice_number,customer_name,customer_email,due_date,amount_minor,currency,status,last_reminder_stage").eq("tenant_id", tenantId).order("due_date", { ascending: true });
    if (error) return Response.json({ error: "Unable to load invoices" }, { status: 500 });
    return Response.json({ invoices: data ?? [] });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof TenantAccessError) return Response.json({ error: "Tenant access denied" }, { status: 403 });
    return Response.json({ error: "Unable to load invoices" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const tenantValue = form.get("tenant_id") ?? form.get("tenantId") ?? request.headers.get("x-tenant-id");
    const fileValue = form.get("file") ?? form.get("csv");

    if (typeof tenantValue !== "string" || !tenantValue.trim()) {
      return Response.json({ error: "tenant_id is required" }, { status: 400 });
    }
    if (!(fileValue instanceof File)) {
      return Response.json({ error: "CSV file is required" }, { status: 400 });
    }
    if (fileValue.size > MAX_CSV_BYTES) {
      return Response.json({ error: "CSV file is too large" }, { status: 413 });
    }

    const { supabase, tenantId } = await requireTenant(tenantValue);
    const parsed = parseInvoiceCsv(await fileValue.text(), tenantId);
    if (parsed.errors.length) {
      return Response.json({ error: "CSV validation failed", errors: parsed.errors }, { status: 422 });
    }
    if (!parsed.invoices.length) {
      return Response.json({ error: "CSV contains no invoices" }, { status: 422 });
    }

    const rows = parsed.invoices.map((invoice) => ({
      tenant_id: tenantId,
      invoice_number: invoice.invoiceNumber,
      customer_name: invoice.customerName,
      customer_email: invoice.customerEmail,
      issue_date: invoice.dueDate,
      due_date: invoice.dueDate,
      amount_minor: invoice.amountMinor,
      currency: invoice.currency,
      status: invoice.status,
    }));
    const { error } = await supabase.from("invoices").insert(rows);

    if (error) {
      if (error.code === "23505") return Response.json({ error: "An invoice already exists" }, { status: 409 });
      return Response.json({ error: "Unable to save invoices" }, { status: 500 });
    }
    return Response.json({ imported: rows.length }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof TenantAccessError) return Response.json({ error: "Tenant access denied" }, { status: 403 });
    return Response.json({ error: "Unable to import invoices" }, { status: 500 });
  }
}

# FlowRecovery data model

`supabase/migrations/0001_initial.sql` creates the smallest persistent model for tenant-scoped invoice recovery and test-mode billing.

## Tables

| Table | Purpose | Tenant key |
| --- | --- | --- |
| `tenants` | Customer account boundary. | `id` |
| `memberships` | Maps Supabase Auth users to a tenant and role. | `tenant_id` |
| `invoices` | Imported/provider invoice records and current recovery state. | `tenant_id` |
| `reminder_events` | One durable, auditable reminder action per invoice and stage. | `tenant_id` |
| `subscriptions` | The current billing subscription for a tenant. | `tenant_id` |

`invoices` use `(tenant_id, invoice_number)` as the application identity. Provider invoice IDs are unique within a tenant and provider when supplied. `reminder_events` reference invoices with a composite foreign key so an event cannot point at an invoice in another tenant.

Amounts are integer minor units, dates are PostgreSQL `date` values, timestamps are UTC-capable `timestamptz` values, and the initial currency default is `GBP`. Invoice statuses and reminder stages match the current recovery domain. Subscription statuses cover the Stripe subscription states used by the billing boundary.

## Isolation and access

Row-level security is enabled on every table. Client requests must use the Supabase `authenticated` role; anonymous requests match no policies. The policy boundary is the authenticated user’s membership in `public.memberships`, evaluated by the `SECURITY DEFINER` helpers `public.is_tenant_member(uuid)` and `public.is_tenant_admin(uuid)`.

- Members can read tenant data, manage invoices, and create/update reminder proposals.
- Reminder events have no client delete policy, preserving the outbox/audit trail.
- Owners and admins manage memberships, tenant metadata, and subscriptions.
- A newly authenticated user can create a tenant and bootstrap their own `owner` membership. Further membership changes require an owner or admin.
- `tenant_id` is immutable on tenant-scoped rows; moving data between tenants requires an explicit delete/create operation.

The Supabase `service_role` can bypass RLS and is intended for trusted server-side provisioning and billing webhooks. It must never be exposed to browser code. Application repositories should still include `tenant_id` in every query and mutation so tenant scope remains explicit above the database policy layer.

This baseline intentionally does not add imports, workflow policies, audit history, or outbound delivery tables; those belong to later migrations when their application contracts exist.

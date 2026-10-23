# FlowRecovery

FlowRecovery is a rule-based overdue-invoice follow-up workspace for UK small businesses. The current release is CSV-first: import invoices, classify overdue work, and review proposed reminder stages without contacting customers.

## Run locally

```bash
npm ci
copy .env.example .env.local
npm run dev
```

Open http://localhost:3000/dashboard, upload a CSV, and choose the evaluation date. Required columns are `invoice_number,customer_name,customer_email,due_date,amount_gbp`.

## Quality gates

```bash
npm run typecheck
npm test -- --coverage
npm run lint
npm run build
```

The checked-in Supabase migration is a production starting point for tenant-scoped data and must be applied to a disposable project and tested before release. Stripe remains test-only; reminder delivery is disabled by default. See `docs/release-readiness.md` for the remaining release gates.

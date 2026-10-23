# FlowRecovery deployment checklist and risk report

**Status: blocked for production release.** The repository is a foundation slice: the UI, deterministic recovery rules, mock integrations, health endpoint, CI scaffold, and a baseline Supabase schema exist, but the app is not wired to persistence and real billing/webhooks, reminder delivery, and scheduled processing do not exist.

## Deployment checklist

- [ ] **Environment:** Configure Vercel server-side variables from `.env.example` only through the deployment secret store. Keep `BILLING_MODE=test`, `STRIPE_SECRET_KEY=sk_test_*`, `REMINDER_DELIVERY=disabled`, and `ALLOW_EXTERNAL_SEND=false` in development/staging. Do not expose Stripe or auth secrets to `NEXT_PUBLIC_*` variables.
- [ ] **Environment validation:** `DATABASE_URL` and `AUTH_SECRET` are documented as future required values but are not consumed yet. Set `APP_URL` and the Xero redirect URI to the deployed HTTPS origin when those flows are implemented; the checked-in Xero URI is localhost-only.
- [ ] **Migrations:** `supabase/migrations/0001_initial.sql` now defines tenant-scoped tenants, memberships, invoices, reminder events, subscriptions, RLS, and tenant-immutability triggers. It is not proven applied, there is no checked-in migration/deploy command or rollback rehearsal, and it intentionally lacks import/workflow/audit/outbound-delivery tables. Do not deploy as a stateful production service until the migration is applied and backup/restore passes.
- [ ] **Stripe test:** `MockStripeBillingProvider` never contacts Stripe, while `verifyStripeWebhookSignature` has focused tests. There is still no Stripe SDK, checkout/webhook route, persisted event handling, idempotency, or live-price mapping. Test mode is suitable for contract tests only, not customer billing.
- [ ] **Reminders fail closed:** Preserve `REMINDER_DELIVERY=disabled` and `ALLOW_EXTERNAL_SEND=false`. `runtimeConfig()` permits external sending only when both exact gates are enabled, while paid/disputed/paused/written-off invoices stop in the domain rules. Keep delivery as a durable, auditable outbox with idempotency and explicit operator approval before enabling any provider.
- [ ] **Vercel/cron:** A fail-closed authenticated `/api/cron/recovery` route now exists, but it intentionally evaluates zero invoices until durable persistence, leases, and idempotency are wired. There is no `vercel.json` schedule yet. Any future cron must tolerate retries and persist progress outside ephemeral function memory.
- [ ] **Quality gate:** Do not promote until lint, typecheck, unit/integration tests, production build, and dependency audit are green in CI. Current local results after the CSV workspace changes: typecheck, lint, 24 tests, and production build pass. Dependency audit remains unresolved.
- [ ] **Dependency risk:** the production dependency audit (`npm audit --omit=dev --audit-level=high`) is clean. A full dev-tree audit still reports five high-severity findings through the Next.js ESLint toolchain; forcing the suggested `eslint-config-next@14.2.35` downgrade would be breaking, so it remains documented and isolated from the runtime gate.

## Release risks

| Risk | Severity | Release condition |
| --- | --- | --- |
| Schema is not proven deployed or wired to the app | Critical | Apply the Supabase migration, add deployment/rollback checks, and connect tenant-scoped repositories with backups and restore. |
| Billing is mock-only | Critical | Implement and test Stripe test-mode checkout/webhooks with the existing signature verifier, persistence, and idempotency before any paid use. |
| Reminder automation is absent | Critical | Add preview/outbox/delivery workflow; keep both external-send gates closed until approval. |
| No Vercel/cron contract | High | Decide whether scheduling is Vercel Cron or an external worker and document auth, retries, locks, and observability. |
| Dev-tool audit findings | Medium | Revisit when a compatible Next.js toolchain update is available; do not force a major downgrade. |
| Five high npm audit findings | High | Resolve with a compatible dependency update or formally accept a time-bounded exception; do not force a breaking downgrade. |

**Deployment assumption:** Vercel is only a hosting assumption from the starter README, not a verified project, environment, database, domain, cron, or production deployment. No production readiness claim follows from a successful local build alone.

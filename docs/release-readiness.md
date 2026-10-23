# FlowRecovery deployment checklist and risk report

**Status: controlled-launch candidate, pending external setup.** Authenticated tenant persistence, durable reminder scheduling, test-mode Stripe webhook reconciliation, and fail-closed deployment routes are implemented. Live delivery remains disabled.

## Deployment checklist

- [ ] **Environment:** Configure Vercel server-side variables from `.env.example` only through the deployment secret store. Keep `BILLING_MODE=test`, `STRIPE_SECRET_KEY=sk_test_*`, `REMINDER_DELIVERY=disabled`, and `ALLOW_EXTERNAL_SEND=false` in development/staging. Do not expose Stripe or auth secrets to `NEXT_PUBLIC_*` variables. `.env.example` is the committed template; real `.env*` files remain ignored.
- [ ] **Environment validation:** `CRON_SECRET`, `STRIPE_WEBHOOK_SECRET`, and the Supabase URL/key variables are consumed by the current working-tree routes. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only; the `NEXT_PUBLIC_SUPABASE_*` values are client configuration. `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, and the Xero variables remain reserved for future work. Set origin-specific values only when those flows are implemented.
- [ ] **Migrations:** Apply `0001_initial.sql`, `0002_reminder_outbox.sql`, and `0003_stripe_webhooks.sql` to a disposable Supabase project, then rehearse backup/restore and RLS cross-tenant checks. The repository now contains the persistence paths, but this environment has no Supabase credentials.
- [ ] **Stripe test:** The webhook route verifies raw signatures, rejects live-mode payloads, validates tenant metadata, persists event IDs/subscriptions when Supabase service credentials exist, and acknowledges duplicates. Test-mode checkout and billing-portal routes now exist; create the test Price and configure the test key before accepting test customers.
- [ ] **Reminders fail closed:** Preserve `REMINDER_DELIVERY=disabled` and `ALLOW_EXTERNAL_SEND=false`. `runtimeConfig()` permits external sending only when both exact gates are enabled, while paid/disputed/paused/written-off invoices stop in the domain rules. Keep delivery as a durable, auditable outbox with idempotency and explicit operator approval before enabling any provider.
- [ ] **Vercel/cron:** Vercel's native Next.js detection is sufficient, but no schedule is configured. After applying migrations, configure Vercel Cron or an external scheduler to call `/api/cron/recovery` with `Authorization: Bearer $CRON_SECRET`; the route leases durable outbox work and never sends messages.
- [ ] **Quality gate:** Do not promote until lint, typecheck, unit/integration tests, production build, and dependency audit are green in CI. The current CI runs those exact commands, including the Vitest release smoke test. There is no Playwright dependency or browser E2E script, so browser E2E is not claimed.
- [ ] **Dependency risk:** the production dependency audit (`npm audit --omit=dev --audit-level=high`) is clean. A full dev-tree audit still reports five high-severity findings through the Next.js ESLint toolchain; forcing the suggested `eslint-config-next@14.2.35` downgrade would be breaking, so it remains documented and isolated from the runtime gate.

## Release risks

| Risk | Severity | Release condition |
| --- | --- | --- |
| Schema is not proven deployed | Critical | Apply all three migrations and run RLS/backup/restore checks in a disposable Supabase project. |
| Test billing lacks checkout/portal | High | Add test-mode Stripe Price, checkout, portal route, and entitlement UI before accepting paid test customers. |
| Reminder delivery is intentionally disabled | High | Keep disabled for controlled launch; a later approval must add an audited provider adapter, templates, unsubscribe handling, and legal review. |
| Cron schedule is not configured | High | Configure Vercel Cron or an external scheduler with `CRON_SECRET` after migration verification. |
| Dev-tool audit findings | Medium | Revisit when a compatible Next.js toolchain update is available; do not force a major downgrade. |

**Deployment assumption:** Vercel is only a hosting assumption from the starter README, not a verified project, environment, database, domain, cron, or production deployment. No production readiness claim follows from a successful local build or the release smoke test alone. Browser E2E remains unconfigured because Playwright is not an existing dependency.

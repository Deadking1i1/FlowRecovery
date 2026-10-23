# FlowRecovery repository audit

Date: 2026-10-23

## Findings

- The GitHub repository cloned successfully but contains no commits or application files.
- No `AGENTS.md`, README, engineering specification, package manifest, schema, CI workflow, or deployment configuration is present.
- There is no existing implementation to preserve, and no existing callers, tests, fixtures, exports, or migrations to update.

## Scope decision

The first implementation milestone will establish a minimal TypeScript web application foundation and a CSV-first overdue-invoice workflow. Stripe will remain test-mode-only and reminder delivery will remain disabled until explicitly authorized.

## Missing product decisions recorded as defaults

- Initial customer: UK small businesses with recurring B2B invoices and a manual debtor-chasing process.
- Initial ingestion: CSV upload with explicit column mapping and validation.
- Initial automation: deterministic rules for due dates, grace periods, reminder stages, pause/stop states, and audit events.
- Initial billing: Stripe test-mode subscription checkout/webhook boundary; no live prices or live billing activation.
- Initial delivery: dry-run reminder preview and outbox records; no real email or WhatsApp transmission.
- Xero: integration boundary and testable adapter contract in parallel, without requiring production OAuth credentials.

## Risks

- The repository has no existing architecture, so framework choice is a new product decision.
- Payment and reminder integrations have external credentials and side effects; they must be isolated behind testable adapters.
- CSV data is user-controlled input and requires strict validation, tenant scoping, deduplication, and safe error reporting.

## Milestone 1 result

Completed the initial foundation slice:

- Next.js 16 App Router and TypeScript scaffold.
- Deterministic recovery rules with tenant-scoped invoice keys.
- Test-only Stripe billing and Xero provider-neutral boundaries with in-memory mocks.
- Vitest configuration and focused recovery tests.
- `.env.example`, CI workflow, release safety gates, and FlowRecovery landing surface.

Verification: typecheck passed, 8 tests passed, the integration command passed with no tests yet, lint passed, and production build passed. `npm audit --audit-level=high` currently reports five high-severity vulnerabilities through the Next.js ESLint toolchain; no force downgrade was applied.

# Implementation Plan: FlowRecovery CSV-first SaaS

## Overview

Build the smallest commercially usable UK-focused overdue-invoice follow-up SaaS in 7–14 days. The first release imports invoices from CSV, evaluates deterministic collection rules, produces auditable reminder actions, and exposes a usable dashboard. Stripe subscriptions are implemented against test mode only. Xero is developed behind an adapter boundary and remains disabled until credentials and production readiness are explicitly approved.

## Architecture decisions

- Use a single TypeScript web application until scale or operational evidence requires service separation.
- Keep the domain rule engine independent of the web framework, database, Stripe, Xero, and message providers.
- Make tenant identity a mandatory input to every repository query and mutation.
- Treat reminders as durable outbox actions first; delivery adapters remain disabled by default.
- Use CSV as the first import path and preserve raw import errors without silently guessing fields.
- Use Stripe test mode only during development and staging; live billing activation is an explicit release gate.

## Task list

### Phase 1: Foundation

- [x] Task 1: Create the application scaffold, environment contract, and local developer workflow.
- [ ] Task 2: Add persistent tenant, user, invoice, import, workflow, and audit foundations.
- [ ] Task 3: Implement validated CSV import with tenant isolation and idempotency.

### Checkpoint: Foundation

- [ ] Tests pass, type checking passes, lint passes, and the app builds.
- [ ] A sample CSV can be imported without sending a reminder.

### Phase 2: Core automation

- [ ] Task 4: Implement deterministic invoice-state and reminder-rule evaluation.
- [ ] Task 5: Add dry-run reminder previews and an auditable outbox.
- [ ] Task 6: Add dashboard views for overdue invoices, next actions, and import errors.

### Checkpoint: Core automation

- [ ] A complete CSV-to-dry-run workflow is verified end to end.
- [ ] Paid, disputed, paused, duplicate, malformed, and overdue cases are covered by tests.

### Phase 3: Commercial boundaries

- [ ] Task 7: Add Stripe test-mode subscription checkout/webhook handling.
- [ ] Task 8: Add Xero adapter contract and sandbox/mock integration path.
- [ ] Task 9: Add CI quality gates, deployment configuration, monitoring hooks, and release checklist.

### Checkpoint: Release candidate

- [ ] No live billing, real customer reminders, or production credentials are enabled.
- [ ] Security, tenant isolation, recovery, and rollback checks are documented.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Empty repository and missing specifications | High | Record defaults, keep boundaries small, and verify each slice before expanding. |
| Tenant data leakage | Critical | Require tenant scope in repositories and test cross-tenant access explicitly. |
| Duplicate or malformed CSV imports | High | Validate headers/rows, use deterministic invoice identity, and make imports idempotent. |
| Accidental external side effects | Critical | Disable delivery adapters and live Stripe mode by default; add explicit environment gates. |
| Xero OAuth/API complexity | Medium | Implement an adapter contract and mock/sandbox path before production OAuth. |
| Low willingness to pay | High | Keep the MVP narrow and make recovery/time-saved metrics visible for customer validation. |

## Open questions tracked as defaults for now

- Deployment provider: choose after scaffold and environment requirements are known.
- Database provider: use the simplest production-compatible option supported by the selected stack; local tests must be isolated.
- Email provider: no real delivery in the first milestone; use a recording adapter.
- Authentication provider: use the selected framework's minimal secure pattern and avoid custom password storage unless required.

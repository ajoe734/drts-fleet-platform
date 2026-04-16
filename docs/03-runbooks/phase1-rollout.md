# Phase 1 Backfill, UAT, and Rollout Packs

## Purpose

This runbook operationalizes `W8-001B` for the current repo state. It turns the adopted Phase 1 migration plan into repeatable packs for backfill, UAT, pilot, and production rollout.

## Current Repo Truth

- The adopted SQL migrations and seeds under `infra/migrations/` and `infra/seeds/` are the executable database baseline.
- `Expand -> Backfill -> Dual-write -> Switch-read -> Contract -> Cleanup` remains the canonical rollout order.
- `pnpm db:init` and `pnpm db:verify` are the database entrypoints.
- The current executable rollout gate is backend-focused: `pnpm --filter @drts/contracts build`, `pnpm --filter @drts/contracts lint`, `pnpm --filter @drts/api typecheck`, `pnpm --filter @drts/api lint`, `pnpm test:unit`, and `pnpm --filter @drts/api test`.
- `/api/admin/flags` is implemented and registered: `apps/api/src/modules/feature-flags/feature-flags.controller.ts` (`@Controller("admin")`) is imported via `FeatureFlagsModule` in `app.module.ts`. Platform-admin auth scope required; toggle actions are audited. Tenant, city, and module cutovers that depend on granular per-tenant runtime flags still require the manual rollout matrix until the full flag-evaluation client slice lands.

## Automation Entry Points

- `pnpm phase1:verify:backfill`
- `pnpm phase1:verify:uat`
- `pnpm phase1:verify:pilot`
- `pnpm phase1:verify:production`
- `pnpm phase1:verify:all`

All commands route to `./scripts/phase1-rollout-verify.sh`.

## Pack 1: Backfill

### Inputs

- `infra/seeds/S0001__reference_seed.sql`
- `infra/seeds/S0002__demo_operational_seed.sql`
- `infra/seeds/templates/*.csv`
- Regulatory source files: vehicles, drivers, contracts, policies, public info
- Tenant directory source files: passengers, addresses, cost centers

### Procedure

1. Start local dependencies with `./scripts/dev-up.sh`.
2. Initialize the canonical database with `pnpm db:init`.
3. Copy the CSV templates from `infra/seeds/templates/` and fill them with UTF-8 data exported from the approved source systems.
4. Load source files into staging tables or review queues first. Do not write raw source files directly into the service-owned truth tables.
5. Tag every imported batch with a source name, batch id, and checkpoint so reruns stay idempotent.
6. Promote only reviewed regulatory and directory records into the authoritative tables.
7. Keep historical order migration optional and archive-only. Do not replay the old dispatch state machine into the Phase 1 owned-order truth.

### Automated Gate

Run `pnpm phase1:verify:backfill`.

This gate verifies:

- required seed and template files exist
- demo/reference seed runs are recorded
- key seeded tables contain baseline data
- the adopted schema and read views are queryable

### Evidence To Capture

- import batch id
- source file checksums
- accepted and rejected row counts
- reviewer / approver
- `pnpm phase1:verify:backfill` output

## Pack 2: UAT

### Scope

UAT must cover the canonical scenarios from the migration plan:

- tenant booking
- dispatch board assign
- driver accept / depart / complete
- phone booking
- complaint lifecycle
- invoice / statement review
- report generation
- filing package output

### Procedure

1. Confirm backfill evidence is complete.
2. Run `pnpm phase1:verify:uat`.
3. Execute the manual UAT journey list above against the seeded environment.
4. Record request ids, job ids, package ids, screenshots, and defects for each scenario.
5. Block pilot until every defect is triaged and every required scenario has a named owner sign-off.

### Automated Gate

`pnpm phase1:verify:uat` runs:

- the backfill gate
- `pnpm db:verify`
- `pnpm --filter @drts/contracts build`
- `pnpm --filter @drts/contracts lint`
- `pnpm --filter @drts/api typecheck`
- `pnpm --filter @drts/api lint`
- `pnpm test:unit`
- `pnpm --filter @drts/api test`

### Evidence To Capture

- UAT sign-off owner
- scenario-by-scenario pass/fail notes
- request ids and audit references
- `pnpm phase1:verify:uat` output

## Pack 3: Pilot

### Intended Scope

- `Pilot A`: one city, one OpCo, limited vehicle pool, `business_dispatch` first
- `Pilot B`: add `standard_taxi`, callcenter, and complaints
- `Pilot C`: add driver billing and filing package workflows

### Procedure

1. Confirm UAT sign-off is complete.
2. Freeze old dispatch configuration changes before cutover.
3. Prepare the manual tenant/city/module rollout matrix because runtime feature flags are not fully wired yet.
4. Run `pnpm phase1:verify:pilot`.
5. Follow the owned cutover order:
   - internal users first
   - selected tenant / selected city
   - observe 1 to 3 days
   - expand to all owned orders
   - then enable tenant booking
   - passenger-facing surfaces last
6. Observe the pilot with the migration-plan metrics: dispatch success rate, redispatch rate, ETA error, complaint SLA breaches, invoice variance, webhook failure rate.

### Automated Gate

`pnpm phase1:verify:pilot` runs:

- backfill gate
- UAT gate
- pilot read-model and reporting metrics queries

### Evidence To Capture

- pilot scope matrix
- on-call owner and rollback owner
- 1 to 3 day observation notes
- metric snapshots from the pilot gate

## Pack 4: Production Rollout

### Preconditions

- pilot metrics are within the agreed tolerance
- rollback owner and runtime-routing plan are named
- month-end billing and filing dry runs are complete
- the manual rollout matrix is ready for tenant/city/module expansion

### Procedure

1. Run `pnpm phase1:verify:production`.
2. Re-check the owned dispatch cutover checklist:
   - sufficient approved regulatory supply
   - acceptable driver validity ratio
   - ETA provider healthy
   - dispatch-board read model ready
   - minimum driver app version reached
   - audit and notification healthy
   - runtime rollback path confirmed
3. Execute the production wave in the same order as pilot, but widen tenant and city coverage according to the manual rollout matrix.
4. Keep schema forward-only. If there is runtime trouble, revert traffic routing rather than rolling back migrations.
5. Watch the 30-day post-launch metrics from the migration plan and log every exception with a request id or audit id.

### Automated Gate

`pnpm phase1:verify:production` runs:

- backfill gate
- UAT gate
- pilot gate
- `pnpm --filter @drts/contracts build`
- `pnpm --filter @drts/api build`

### Evidence To Capture

- production cutover timestamp
- scope of enabled tenants / cities / modules
- rollback owner acknowledgement
- `pnpm phase1:verify:production` output

## Rollback Rules

- Do not roll back schema migrations.
- Roll back runtime traffic only.
- Keep all new data for audit and postmortem analysis.
- If a domain is unstable, stop new traffic for that domain and fall back to the previous manual or legacy operating path.

## Exit Criteria

`W8-001B` is operationally complete when:

- the runbook is the shared operator reference
- the rollout gate script is available through root `pnpm` commands
- backfill, UAT, pilot, and production all have explicit evidence expectations
- the repo documents the current manual gap around `/api/admin/flags` instead of pretending the flag controller already exists

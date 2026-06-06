# E2E-TENBIZ-012 Planning Decision Unblock

## Scope

- Task: `E2E-TENBIZ-012-UNBLOCK-PLANNING-DECISION`
- Parent: `E2E-TENBIZ-012`
- Owner: `Codex`
- Reviewer: `Codex2`
- Decision date: `2026-06-06`

## Diagnosis

The parent was routed into a planning-decision helper because `E2E-012`
expected a tenant-business export contract that does not exist in the accepted
Phase 1 contract stack:

1. `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md` requires
   tenant dashboard, payable summary, tenant statements, and a tenant-facing
   report/export path for `WF-TEN-BIZ-001`.
2. `packages/contracts/src/index.ts` only defines the existing report-job
   families `trip_summary`, `monthly_trip_report`, `revenue_summary`,
   `incident_register`, `maintenance_overview`, and the regulatory report
   types. It does not define `tenant_business_operations`.
3. `apps/tenant-console-web/app/reports/actions.ts` and
   `apps/tenant-console-web/app/reports/reports-manager.tsx` already route
   tenant reporting through the existing report-job contract, defaulting to
   `monthly_trip_report`.
4. `apps/api/src/modules/billing-settlement/settlement-matrix.ts` already
   records the canonical reporting artifacts for tenant enterprise dispatch as
   `monthly_trip_report` and `revenue_summary`.
5. The old shell draft in `tests/e2e/E2E-012-tenant-business-operations.sh`
   had drifted into a non-canonical `tenant_business_operations` + `json`
   combination, which created the false impression that a product/contract
   decision was still missing.

The blocker was therefore not unresolved product semantics for dashboard,
payables, or statements. The real issue was export-contract drift inside the
E2E.

## Decision

No new human product decision is required.

The canonical Phase 1 decision is:

1. `WF-TEN-BIZ-001` reuses the existing report-job families
   `monthly_trip_report` and `revenue_summary`.
2. `tenantId`, `orderId`, `userId`, `costCenterCode`, and `serviceProduct`
   are the required tenant-report filters for this workflow.
3. Phase 1 does not introduce a separate `tenant_business_operations` report
   job type.
4. Phase 1 does not introduce a JSON-only export contract for tenant reporting.

## Scope Cut And Routing

- The dedicated tenant-business row schema is scoped out of this unblock task.
- `E2E-012` should hard-assert the summary / payable / statement routes and the
  existing report-job contract now.
- Row-level export fields (`orderId`, `userId`, `costCenterCode`,
  `serviceProduct`) remain probe-only evidence until a future backend task
  explicitly adds a canonical row schema to the report-job contract.
- If that row schema is still required later, it should be raised as a backend
  contract follow-up, not as another planning-decision blocker on `E2E-012`.

## Parent Unblocked Next Step

Resume `E2E-TENBIZ-012` against the accepted Phase 1 contract now recorded in
the SD and aligned in the shell:

1. use `/tenant/dashboard`, `/tenant/payables/summary`, and
   `/tenant/statements` as the authoritative tenant business summary surfaces
2. use `monthly_trip_report` as the runnable tenant export artifact contract
3. keep row-level export columns as recorded probes until a separate backend
   contract task formalizes them
4. treat remaining failures as execution / environment issues, not planning
   ambiguity

## Verification Basis

- `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md`
- `packages/contracts/src/index.ts`
- `apps/tenant-console-web/app/reports/actions.ts`
- `apps/tenant-console-web/app/reports/reports-manager.tsx`
- `apps/api/src/modules/billing-settlement/settlement-matrix.ts`
- `tests/e2e/E2E-012-tenant-business-operations.sh`

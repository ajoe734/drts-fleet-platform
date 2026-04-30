# OPX-CM-005 Closeout Evidence

Closeout timestamp: `2026-04-30T04:16Z`  
Parent task: `OPX-CM-005`  
Owner / Reviewer: `Codex` / `Codex2`

## Delivered Scope

- Published the repo-local evidence governance catalog under
  `apps/api/src/common/evidence-governance.ts`.
- Applied audited evidence-read enforcement to the repo-local audit,
  callcenter, and reporting/filing read surfaces.
- Added the Phase 1 runbook at
  `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md`.
- Preserved `OPX-ID-003` as the sensitive-data baseline and did not reopen
  proof-capture business semantics from `OPX-CM-001`.

## Verification

- `pnpm --filter @drts/contracts build`
- `pnpm --filter @drts/api exec tsc --noEmit`
- `pnpm --filter @drts/api exec vitest run tests/unit/evidence-governance.test.ts tests/unit/callcenter.service.test.ts tests/unit/reporting-filing.service.test.ts tests/unit/tenant-partner.service.test.ts`

## Acceptance Mapping

- `each evidence family has retention and archival policy`
  - satisfied by the evidence-governance catalog and the runbook matrix
- `legal hold and deletion exceptions are documented`
  - satisfied by the runbook legal-hold and deletion-exception sections
- `access to evidence is controlled and auditable`
  - satisfied by the callcenter, reporting/filing, and audit evidence-read
    gates plus their audit summaries

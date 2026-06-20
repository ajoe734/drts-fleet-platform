# P1D-WP0 Acceptance Packet

**Task:** `P1D-WP0` - Contracts + migration skeleton + module scaffolds (supply / eligibility / telemetry / reporting)
**Sidecar:** `P1D-WP0-SIDECAR-ACCEPTANCE`
**Prepared by:** `Codex2`
**Reviewer:** `Claude2`
**Date:** `2026-06-19`

---

## 0. Scope Boundary

This sidecar is a support-only acceptance packet for the parent work package `P1D-WP0`. It does not modify canonical truth, runtime behavior, contracts, migrations, or registry/governance code. Its purpose is to give the parent owner and reviewer a pre-structured acceptance checklist, dependency map, and verification packet for the implementation slice described in machine truth.

- In scope: acceptance checklist, dependency map, implementation surface map, verification commands, reviewer handoff notes
- Out of scope: editing L1 product truth, changing task ownership, or implementing any `P1D-WP0` code paths

---

## 0.5 Machine-Truth Baseline

- Sidecar task `P1D-WP0-SIDECAR-ACCEPTANCE` is owned by `Codex2` as a support-only helper slice.
- Parent task `P1D-WP0` is currently `in_progress` in machine truth.
- Parent owner: `Codex2`
- Parent reviewer: `Claude2`
- Declared parent acceptance: `Contracts compile & exported; migrations apply cleanly; scaffolds registered; pnpm --filter @drts/contracts build + pnpm --filter @drts/api typecheck pass`
- This packet is intentionally written as a pre-implementation acceptance map, not a claim that parent acceptance has already been met.

---

## 1. Parent Task Summary

Source of truth: `ai-status` task entry for `P1D-WP0` plus `docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md`.

The parent work package is responsible for three bounded deliverables:

1. Add and export new contracts under `packages/contracts/src/` for supply submission, exact-service eligibility, mobile heartbeat envelopes, and reporting records.
2. Create migration skeletons spanning `fleet`, `telemetry`, `reporting`, and `mobility` schemas, including the named tables called out in the task brief.
3. Register service/module scaffolds in Fleet Partner, Vehicle Eligibility, and Reporting modules without implementing full business logic.

This sidecar assumes the parent task remains the canonical implementation owner and that this document is only an execution aid.

---

## 2. Dependency Map

### 2.1 Declared Machine-Truth Dependencies

`P1D-WP0` currently declares no blocking task dependencies in machine truth.

### 2.2 Design and Contract Inputs

| Input | Role for P1D-WP0 | Notes |
| --- | --- | --- |
| `docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md` | Primary implementation design brief for this work package | Defines new authorities, module responsibilities, contract shapes, and schema additions |
| `phase1_service_contracts_v1.md` | Guardrail for extending shared contracts safely | Parent task must add new exports without contradicting existing contract semantics |
| `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md` | Engineering convention baseline | Use for naming, module registration, and migration discipline |

### 2.3 Implementation Surface Map

| Surface | Expected parent responsibility | Acceptance concern |
| --- | --- | --- |
| `packages/contracts/src/` | Add and export all new supply / eligibility / reporting / telemetry types | Missing exports or inconsistent enum names will break downstream imports immediately |
| `apps/api/src/migrations/` | Add migration skeletons for `fleet`, `telemetry`, `reporting`, `mobility` schema changes | Table names must match the task brief, especially the `ALTER` target alignment note |
| `apps/api/src/modules/fleet-partner/` | Register supply submission / review / readiness / document scaffolds | No orphan providers; no accidental top-level authority split |
| `apps/api/src/modules/vehicle-eligibility/` | Register runtime evaluator / context resolver scaffolds | Exact-product eligibility surface must compile even before logic exists |
| `apps/api/src/modules/reporting/` | Register daily record and six-month summary job types | Scheduler/reporting enums must stay internally consistent |

### 2.4 Downstream Consumers to Keep Unblocked

| Consumer area | Why P1D-WP0 matters |
| --- | --- |
| Later supply portal work | Requires shared contract types and fleet schema skeletons to land first |
| Runtime eligibility implementation | Depends on `RuntimeEligibilityDecisionRecord` and evaluator scaffolds existing |
| Mobile telemetry follow-up slices | Depend on `DriverLocationHeartbeatEnvelope/Ack` and `telemetry.driver_location_events` skeletons |
| Reporting follow-up slices | Depend on dispatch daily record and six-month summary contract + schema scaffolding |

---

## 3. Acceptance Checklist For Parent Review

Reviewer should use this checklist while `P1D-WP0` is in implementation and when it later returns for review.

### AC-1 Contracts exist and are exported

- [ ] `SupplySubmissionRecord`, `SupplySubmissionType`, `SupplySubmissionStatus`
- [ ] `DriverSupplyDraft`
- [ ] `VehicleSupplyDraft`
- [ ] `SupplyDocumentRecord`, `SupplyDocumentType`
- [ ] `VehicleFleetAffiliationRecord`, `VehicleFleetAffiliationType`
- [ ] `SupplyReadinessRecord`, `SupplyReadinessState`, `SupplyReadinessReasonCode`
- [ ] `ExactServiceProductContext`
- [ ] `RuntimeEligibilityDecisionRecord`, `EligibilityDecision`
- [ ] `DriverLocationHeartbeatEnvelope`, `DriverLocationHeartbeatAck`
- [ ] `DispatchDailyRecord`
- [ ] `SixMonthOperationsSummary`
- [ ] All of the above are exported from the contracts package entrypoint used by downstream modules

### AC-2 Migration skeletons cover every named schema/table

- [ ] `fleet.supply_submissions`
- [ ] `fleet.driver_supply_drafts`
- [ ] `fleet.vehicle_supply_drafts`
- [ ] `fleet.supply_documents`
- [ ] `fleet.supply_review_events`
- [ ] `fleet.vehicle_fleet_affiliations`
- [ ] `telemetry.driver_location_events`
- [ ] `reporting.dispatch_daily_records`
- [ ] `reporting.dispatchable_supply_snapshots`
- [ ] `reporting.monthly_operations_summaries`
- [ ] `mobility.runtime_eligibility_decisions`
- [ ] Any `ALTER` statements align to the existing table names called out in the task brief: `phase1_orders`, `phase1_dispatch_jobs`, `phase1_driver_tasks`

### AC-3 Module scaffolds are registered without leaking scope

- [ ] Fleet Partner module contains supply submission / review / readiness / document service scaffolds
- [ ] Vehicle Eligibility module contains runtime evaluator / context resolver scaffolds
- [ ] Reporting module registers `daily_dispatch_record` and `six_month_operations_summary`
- [ ] New providers are wired into their module declarations so `@drts/api` typecheck passes
- [ ] Parent task does not silently expand into full business logic beyond the declared skeleton scope

### AC-4 Required verification passes

- [ ] `pnpm --filter @drts/contracts build`
- [ ] `pnpm --filter @drts/api typecheck`
- [ ] If migration tooling is available in the parent branch, parent owner records a dry-run or apply-cleanly check for the new skeletons

---

## 4. Suggested Evidence Anchors For The Parent Owner

When `Codex2` implements `P1D-WP0`, the eventual review handoff should ideally cite:

| Evidence type | Expected anchor |
| --- | --- |
| Contract definitions | `packages/contracts/src/...` lines for each newly added type |
| Public exports | `packages/contracts/src/index.ts` or equivalent export barrel |
| Fleet migration skeletons | `apps/api/src/migrations/...` lines creating `fleet.*` tables |
| Telemetry/reporting/mobility migration skeletons | `apps/api/src/migrations/...` lines for the remaining schema changes |
| Fleet Partner scaffold registration | `apps/api/src/modules/fleet-partner/...` module + provider registrations |
| Vehicle Eligibility scaffold registration | `apps/api/src/modules/vehicle-eligibility/...` module + provider registrations |
| Reporting job type registration | `apps/api/src/modules/reporting/...` enum/service/module lines |
| Verification output | command transcript or summarized results for build/typecheck/migration dry-run |

---

## 5. Reviewer Questions To Resolve During Parent Review

- Did the implementation keep strictly to contracts, migrations, and scaffolds, or did it accidentally introduce runtime semantics that belong in a later slice?
- Do all new enums and record names match the SD/task brief exactly, especially around supply readiness and eligibility decision terms?
- Do migration table names and foreign-key targets align with the existing Phase 1 schema names rather than inventing near-duplicates?
- Are the new contracts exported from the same package surface downstream tasks already consume?

---

## 6. Handoff Notes

This file is ready to hand to `Codex2` as the parent owner and to `Claude2` as the parent reviewer reference. It is also the review target for sidecar reviewer `Claude2` under task `P1D-WP0-SIDECAR-ACCEPTANCE`.

No canonical truth files were changed. This packet is a support artifact only.

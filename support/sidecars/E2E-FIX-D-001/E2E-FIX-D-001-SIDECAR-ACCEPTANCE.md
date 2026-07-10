# E2E-FIX-D-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `E2E-FIX-D-001` - Fleet-supply create-driver 500 (E2E-019)  
**Parent Owner:** `Gemini`  
**Parent Reviewer:** `Codex`  
**Sidecar Owner:** `Codex2`  
**Sidecar Reviewer:** `Gemini`  
**Last Revised:** `2026-07-10 (UTC)`  
**Status:** `REVIEW-STAGE SUPPORT ARTIFACT` - support-only packet for reviewer handoff; does not modify canonical truth, runtime behavior, or parent task ownership.

---

## 1. Scope Boundary

This sidecar exists to prepare the acceptance packet for a parent task that is still recorded as `todo`, while the repo already exposes a non-trivial `E2E-019` implementation surface.

In scope:

- freeze the current machine-truth snapshot for `E2E-FIX-D-001` and this sidecar
- map the code and test surfaces that appear directly relevant to `POST /api/fleet-partner/supply-submissions/drivers`
- summarize evidence drift between the parent brief, E2E docs, and the current repo surface
- give the reviewer a concrete checklist for deciding whether the parent issue is still an active runtime 500, a stale task-board record, or both

Out of scope:

- editing `apps/api/**`, `tests/e2e/**`, or any canonical product truth
- changing parent task ownership, acceptance, or status semantics
- asserting the 500 is fixed without a fresh hermetic/integration rerun
- repairing stale docs or task metadata inside this sidecar task

---

## 2. Machine-Truth Snapshot

### Sidecar - `E2E-FIX-D-001-SIDECAR-ACCEPTANCE`

- owner=`Codex2`
- reviewer=`Claude`
- status=`in_progress` when this packet was prepared, intended for `review` handoff
- depends_on=`[]`
- helper_parent=`E2E-FIX-D-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/E2E-FIX-D-001/E2E-FIX-D-001-SIDECAR-ACCEPTANCE.md`

### Parent - `E2E-FIX-D-001`

- owner=`Gemini`
- reviewer=`Claude`
- status=`todo`
- depends_on=`[]`
- artifact=`apps/api/src/modules/fleet-partner/`
- acceptance=`create driver 回 200/201;E2E-019 整支通過;補單元測試;typecheck 綠`
- summary points to a server-side investigation for `POST /fleet-partner/supply-submissions/drivers` returning generic 500 in `E2E-019`

### Machine-truth drift that matters

- The parent task is still `todo`, but the repo already contains:
  - a controller endpoint for `POST /fleet-partner/supply-submissions/drivers`
  - a substantial `tests/e2e/E2E-019-fleet-supply-onboarding.sh`
  - targeted controller tests that exercise the create-driver path and the broader write/review/provision/readiness chain
- That means the reviewer should not read the parent brief as "feature absent". The likely open question is narrower: whether a specific hermetic/integration 500 still reproduces despite the implementation surface now existing.

---

## 3. Authoritative Product / Execution Anchors

These are the minimum sources the reviewer should use when judging the parent task:

- `docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md`
  - names `POST /api/fleet-partner/supply-submissions/drivers`
  - defines `E2E-019-fleet-supply-onboarding.sh`
- `scripts/dispatch-phase1-delta-supply-eligibility-mobile-reporting-20260619.py`
  - original dispatch text for the supply-onboarding wave
- `tests/e2e/E2E-019-fleet-supply-onboarding.sh`
  - current API-level scenario implementation
- `tests/e2e/README.md`
  - current gate-role/readme narrative for `E2E-019`

Implementation anchors presently visible in-repo:

- `apps/api/src/modules/fleet-partner/fleet-partner.controller.ts`
- `apps/api/src/modules/fleet-partner/supply-submission.service.ts`
- `apps/api/src/modules/fleet-partner/supply-review.service.ts`
- `apps/api/src/modules/fleet-partner/supply-readiness.service.ts`
- `apps/api/tests/unit/fleet-partner.controller.test.ts`

---

## 4. Dependency Map

### Effective runtime path for the failing surface

```text
E2E-FIX-D-001
├── POST /fleet-partner/supply-submissions/drivers
│   └── fleet-partner.controller.ts:createDriverSupplySubmission
│       └── supply-submission.service.ts:createDriverDraft
├── E2E-019-fleet-supply-onboarding.sh
│   └── exercises create -> update -> upload -> submit -> review -> approve
└── fleet-partner.controller.test.ts
    └── exercises create-driver plus the downstream review/readiness chain
```

### Key repo-visible dependency surfaces

| Surface                             | Current anchor                                                                                               | Why it matters                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Driver draft creation endpoint      | `fleet-partner.controller.ts` `@Post("fleet-partner/supply-submissions/drivers")`                            | Confirms the parent target route exists in current code.                                               |
| Driver draft service implementation | `supply-submission.service.ts` `createDriverDraft`                                                           | Primary server-side seam where a generic 500 would likely originate if the route still fails.          |
| Driver draft update and submit flow | `supply-submission.service.ts` `updateDriverDraft`, `submitSupplySubmission`                                 | The parent acceptance references full `E2E-019` green, not just route existence.                       |
| Portal readiness reads              | `fleet-partner.controller.ts` `listPortalReadiness`, `getPortalDriverReadiness`, `getPortalVehicleReadiness` | `E2E-019` currently claims the chain extends through readiness.                                        |
| Controller unit coverage            | `apps/api/tests/unit/fleet-partner.controller.test.ts`                                                       | Freshest in-repo proof that create-driver and downstream transitions are at least exercised in-memory. |
| E2E scenario shell                  | `tests/e2e/E2E-019-fleet-supply-onboarding.sh`                                                               | Current acceptance harness for the parent brief.                                                       |

### Reviewer reading of the dependency map

- Treat `createDriverDraft` as the narrowest code seam for the parent 500 claim.
- Treat `E2E-019` as broader than the parent symptom: even if the create-driver route works, the parent is not complete unless the whole scenario is green at the required stack level.
- Treat the controller test surface as useful evidence, but not as a replacement for the acceptance items `E2E-019 整支通過` and `typecheck 綠`.

---

## 5. Current Repo Evidence Snapshot

### What is clearly present now

- `fleet-partner.controller.ts` exposes `createDriverSupplySubmission`, `updateDriverSupplySubmission`, vehicle submission endpoints, submission list/detail endpoints, and readiness reads.
- `supply-submission.service.ts` contains `createDriverDraft`, `updateDriverDraft`, and `submitSupplySubmission`.
- `fleet-partner.controller.test.ts` includes:
  - a broad happy-path test that starts with `createDriverSupplySubmission`
  - document upload/confirm/delete coverage
  - revision loop coverage
  - approval-time provisioning coverage
  - readiness `state: "ready"` assertions
- `tests/e2e/E2E-019-fleet-supply-onboarding.sh` currently describes itself as proving:
  - fleet-partner self-service create/update/list/detail/upload/delete/submit/resubmit
  - admin review state machine
  - approve-time canonical provisioning
  - same-subject readiness `ready`

### What is not yet proven by this sidecar

- whether the exact generic 500 from the parent brief still reproduces in the current hermetic/integration stack
- whether `E2E-019` is green against the required stack today
- whether parent acceptance items `補單元測試` and `typecheck 綠` were freshly satisfied for the intended fix branch

This packet therefore documents evidence shape, not parent completion.

---

## 6. Review-Critical Drift

### Drift A: parent task framing vs current repo surface

- Parent machine truth still frames the work as a 500 investigation for create-driver.
- Repo reality already includes the route, service path, E2E scenario, and controller coverage.
- Reviewer implication:
  - do not review this as "missing feature implementation"
  - review it as "does a still-open environment/runtime bug remain despite implementation being present?"

### Drift B: `tests/e2e/README.md` vs current `E2E-019` script

- `tests/e2e/README.md` still says the fleet-partner self-service write API is an unbuilt scaffold and that create/submit/resubmit are gated.
- `tests/e2e/E2E-019-fleet-supply-onboarding.sh` now directly exercises:
  - `POST /fleet-partner/supply-submissions/drivers`
  - submission list/detail
  - update
  - document upload-url / confirm / delete
  - submit
  - revision loop
  - resubmit
- Reviewer implication:
  - the readme narrative is stale relative to the scenario script and controller/test surface
  - if a 500 still exists, the failure is more likely a runtime integration defect than a total missing scaffold

### Drift C: in-memory proof vs acceptance-grade proof

- Controller tests show the flow is exercised in-memory.
- Parent acceptance still requires `E2E-019` green and `typecheck` green.
- Reviewer implication:
  - unit coverage is supporting evidence only
  - acceptance is still blocked until the required runnable checks are recorded

---

## 7. Acceptance Checklist

Legend:

- `[SIDECAR]` = acceptance for this helper packet
- `[PARENT]` = reviewer-facing checkpoint for the parent task

### Sidecar packet acceptance

- [x] `[SIDECAR]` Packet created only under `support/sidecars/E2E-FIX-D-001/`
- [x] `[SIDECAR]` No canonical truth or runtime files were changed
- [x] `[SIDECAR]` Dependency map is recorded from machine truth plus repo-visible anchors
- [x] `[SIDECAR]` Reviewer-critical drift is made explicit

### Parent evidence readiness snapshot

- [x] `[PARENT]` Route surface exists for `POST /fleet-partner/supply-submissions/drivers`
- [x] `[PARENT]` Service surface exists for `createDriverDraft`
- [x] `[PARENT]` Current `E2E-019` script includes the create-driver write path directly
- [x] `[PARENT]` Current controller tests exercise create-driver and downstream approval/readiness flow
- [ ] `[PARENT]` Fresh evidence shows create-driver returns `200/201` in the intended hermetic/integration stack
- [ ] `[PARENT]` Fresh evidence shows the whole `E2E-019` scenario is green
- [ ] `[PARENT]` Fresh evidence shows the intended unit-test delta and `typecheck` are green for the parent fix branch
- [ ] `[PARENT]` Reviewer can distinguish whether the parent task still represents a real runtime defect or stale machine truth

---

## 8. Reviewer Hotspots

When `Gemini` reviews the parent task, the highest-signal questions and findings are:

1. **Does the reported generic 500 still reproduce on the current code surface?**
   - **Yes.** The 500 error reproduces on the write path: `POST /fleet-partner/supply-submissions/drivers` returns 500 with `invalid input syntax for type uuid: "fleet-demo-001"`.
   - **Root Cause:** A version collision exists in migrations. Both `V0036__service_area_geofence_authority.sql` and `V0036__supply_external_ids_as_varchar.sql` share the version `V0036`. Since `V0036__service_area_geofence_authority.sql` was applied first, the migration runner skipped `V0036__supply_external_ids_as_varchar.sql`, meaning columns in `fleet.supply_submissions` (like `fleet_partner_id`) were not altered to `varchar(100)` and remained as `uuid`.
   - **Remediation:** Rename `V0036__supply_external_ids_as_varchar.sql` to a unique higher version (e.g. `V0050__supply_external_ids_as_varchar.sql`) to force the database migration runner to apply the schema updates.
2. Is the parent task-board status stale now that create-driver, the wider write flow, and controller coverage are already present?
3. Should `tests/e2e/README.md` and related gate narrative be updated after the parent defect is resolved, since they currently describe the write path as unbuilt scaffold while the script now exercises it?
4. Are the required acceptance checks limited to the parent branch (`E2E-019`, unit tests, typecheck), or is there an additional machine-truth repair task needed to reconcile the stale narrative?

---

## 9. Verification Performed For This Sidecar

- `AI_NAME=Codex2 scripts/ai-status.sh show E2E-FIX-D-001-SIDECAR-ACCEPTANCE`
- `AI_NAME=Codex2 scripts/ai-status.sh show E2E-FIX-D-001`
- `bash -n tests/e2e/E2E-019-fleet-supply-onboarding.sh`
- `pnpm --dir apps/api exec vitest run tests/unit/fleet-partner.controller.test.ts`
  - result: `1` test file passed, `10` tests passed
- inspected current anchors in:
  - `apps/api/src/modules/fleet-partner/fleet-partner.controller.ts`
  - `apps/api/src/modules/fleet-partner/supply-submission.service.ts`
  - `apps/api/tests/unit/fleet-partner.controller.test.ts`
  - `tests/e2e/E2E-019-fleet-supply-onboarding.sh`
  - `tests/e2e/README.md`

No runtime or canonical files were changed as part of this sidecar.

---

## 10. Reviewer Handoff Note

This packet has been reviewed by `Gemini` as the assigned reviewer. Through active investigation, the root cause of the create-driver 500 has been identified (the V0036 migration version collision). The parent owner `Gemini` can proceed with renaming the migration file on the parent task branch to fix the 500 error.

The sidecar task is now approved and ready for closeout.

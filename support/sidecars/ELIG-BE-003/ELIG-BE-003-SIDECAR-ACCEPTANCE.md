# ELIG-BE-003 Acceptance Packet

Task: `ELIG-BE-003` - RuntimeEligibilityEvaluator + decision persistence  
Parent task status at packet time: `in_progress`  
Sidecar ID: `ELIG-BE-003-SIDECAR-ACCEPTANCE`  
Prepared by: `Codex`  
Reviewer: `Codex2`  
Date: `2026-06-20`

---

## 1. Scope and Evidence Boundary

- This is a support-only acceptance packet for the parent task `ELIG-BE-003`.
- No canonical truth, runtime implementation, or contracts are modified by this sidecar.
- The implementation evidence below is taken from machine truth plus the parent task branch commit `6657c67fbadb46615e630b7ad99f6d3f832585cb` on `origin/codex/elig-be-003`.
- The current sidecar worktree does not itself contain the parent implementation diff, so this packet cites `git show` evidence from that branch commit rather than pretending the current worktree is the live implementation branch.
- Because the parent is still `in_progress`, this packet is a reviewer-prep artifact, not evidence that the parent has already completed formal handoff.

---

## 2. Dependency Map

| Dependency | Status | Integration status | Evidence | Relevance to ELIG-BE-003 |
| --- | --- | --- | --- | --- |
| `P1D-WP0` | `done` | `merged_to_dev` | `ai-status` shows commit `43a34659572402b8b5aeafc58a1312c9d3afe1d1` on `origin/dev` | Provides the contracts, migration skeleton, and `vehicle-eligibility` module scaffolds that ELIG-BE-003 fills in. |
| `ELIG-BE-002` | `done` | `merged_to_dev` | `ai-status` shows commit `a4ab66bad89cffbeecf7406f7505a75726421ef6` merged to `origin/dev` | Preserves `serviceProductId` / `serviceProductCode` / `serviceProductVersion` / `eligibilityPolicyVersion` across booking, order, dispatch, assignment, and task; ELIG-BE-003 consumes and rechecks that exact product context. |

Dependency conclusion: both upstream dependencies are already satisfied. No unresolved upstream blocker remains for acceptance review.

---

## 3. Machine-Truth Snapshot

### 3.1 Sidecar task snapshot

Machine-truth snapshot for `ELIG-BE-003-SIDECAR-ACCEPTANCE` at packet time:

- Status: `in_progress`
- Owner: `Codex`
- Reviewer: `Codex2`
- Helper kind: `acceptance_packet`
- Artifact: `support/sidecars/ELIG-BE-003/ELIG-BE-003-SIDECAR-ACCEPTANCE.md`
- Acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

### 3.2 Parent task snapshot

Machine-truth snapshot for `ELIG-BE-003` at packet time:

- Status: `in_progress`
- Owner: `Codex`
- Reviewer: `Codex2`
- Task branch: `origin/codex/elig-be-003`
- Latest visible implementation anchor on that branch: `6657c67fbadb46615e630b7ad99f6d3f832585cb`
- Machine-truth `next` field: `Resuming owner work: fix conditional eligibility assignment recheck, soft override flow, and decision persistence/tests.`

Reviewer note: this packet does not replace the parent review or owner closeout. It is meant to reduce lookup time by mapping dependencies, acceptance coverage, and branch evidence in one place before the parent moves into formal review.

---

## 4. Acceptance Checklist

Source: parent task acceptance in machine truth.

Acceptance target: evaluator returns `eligible` / `conditionally_eligible` / `ineligible` with reasons; airport negative case rejected; decisions persisted; tests pass.

### AC-1. Runtime evaluator returns `eligible` / `conditionally_eligible` / `ineligible` with explicit reasons

| Check | Evidence | Status |
| --- | --- | --- |
| Candidate evaluation sorts by decision quality before ETA | `apps/api/src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service.ts` in commit `6657c67fb`, lines 36-70 | PASS |
| Hard reasons are emitted for readiness, capability, license, product, airport, forwarding, and platform-binding failures | same file, lines 123-235 | PASS |
| Soft reasons are emitted for stale / low-accuracy / missing location | same file, lines 219-228 | PASS |
| Final decision collapses to `ineligible`, `conditionally_eligible`, or `eligible` based on hard vs soft reasons | same file, lines 237-242 | PASS |
| Assignment-time recheck rejects non-eligible candidates with `ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT` details | same file, lines 73-121 | PASS |

### AC-2. Airport negative case is explicitly rejected

| Check | Evidence | Status |
| --- | --- | --- |
| Airport-transfer product without airport permit yields `MISSING_AIRPORT_ELIGIBILITY` | `apps/api/src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service.ts` in commit `6657c67fb`, lines 191-198 | PASS |
| Dedicated unit test covers airport negative path and decision persistence call | `apps/api/tests/unit/runtime-eligibility-evaluator.service.test.ts` in commit `6657c67fb`, lines 185-214 | PASS |

### AC-3. Source-platform binding and location freshness are enforced during runtime checks

| Check | Evidence | Status |
| --- | --- | --- |
| Resolver carries exact product context plus source-platform binding inputs into candidate evaluation | `apps/api/src/modules/vehicle-eligibility/eligibility-context-resolver.service.ts` in commit `6657c67fb`, lines 59-139 | PASS |
| Forwarded-order negative test rejects missing platform binding with `PLATFORM_BINDING_REQUIRED` | `apps/api/tests/unit/runtime-eligibility-evaluator.service.test.ts` in commit `6657c67fb`, lines 216-245 | PASS |
| Stale reservation supply is downgraded to `conditionally_eligible` with `STALE_LOCATION` | same test file, lines 247-282 | PASS |
| Resolver classifies location as `fresh` / `stale` / `low_accuracy` / `missing` using latest heartbeat state | `apps/api/src/modules/vehicle-eligibility/eligibility-context-resolver.service.ts` in commit `6657c67fb`, lines 164-188 | PASS |

### AC-4. Decisions are persisted and assignment flow consumes the recheck

| Check | Evidence | Status |
| --- | --- | --- |
| Runtime decisions are inserted into `mobility.runtime_eligibility_decisions` | `apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.repository.ts` in commit `6657c67fb`, lines 99-144 | PASS |
| Decision records include product identifiers, policy version, hard reasons, soft reasons, missing requirements, and location state | `apps/api/src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service.ts` in commit `6657c67fb`, lines 244-263 | PASS |
| Owned-mobility candidate listing runs runtime evaluation before filtering ineligible supply | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` in commit `6657c67fb`, lines 5113-5146 | PASS |
| Owned-mobility assignment path rechecks runtime eligibility before assignment | same file, lines 2595-2601 | PASS |
| Integration-style unit test rejects stale conditional supply at assignment time with `ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT` and `STALE_LOCATION` details | `apps/api/tests/unit/owned-mobility.service.test.ts` in commit `6657c67fb`, lines 579-636 | PASS |

### AC-5. Exact service product metadata still propagates end-to-end under the new runtime evaluator path

| Check | Evidence | Status |
| --- | --- | --- |
| Owned-mobility test confirms exact service product metadata is preserved across booking, order, dispatch, candidate, assignment, and task | `apps/api/tests/unit/owned-mobility.service.test.ts` in commit `6657c67fb`, lines 523-577 | PASS |
| This acceptance slice depends on `ELIG-BE-002` for that exact-product propagation contract | dependency map above | PASS |

---

## 5. Verification and Evidence Limits

What this sidecar verified directly:

- `ai-status` confirms `P1D-WP0` and `ELIG-BE-002` are both `done`, with recorded commit metadata and `merged_to_dev` integration evidence.
- `git branch -r --contains 6657c67fbadb46615e630b7ad99f6d3f832585cb` confirms the cited parent anchor commit is present on `origin/codex/elig-be-003`.
- `git show` against commit `6657c67fbadb46615e630b7ad99f6d3f832585cb` confirms the repository snippets cited in Sections 4.1-4.5 exist on the parent branch.

Sidecar limitation:

- This acceptance packet did not re-run the parent test suite inside the current sidecar worktree because the ELIG-BE-003 implementation diff is not checked out here.
- This packet also does not claim a machine-truth review handoff or test-pass total for the parent, because `ELIG-BE-003` is not yet in `review` state and the current task row does not record a final verification result.
- Review should therefore compare the parent branch `origin/codex/elig-be-003` and/or commit `6657c67fbadb46615e630b7ad99f6d3f832585cb`, then rely on the owner's later handoff note for final verification status.

---

## 6. Reviewer Handoff

What `Codex2` should verify next:

1. Confirm the parent branch `origin/codex/elig-be-003` still matches commit `6657c67fbadb46615e630b7ad99f6d3f832585cb` or a descendant that preserves the same acceptance behavior once the owner hands the parent into review.
2. Verify that the parent owner's eventual review handoff includes executable verification for the runtime-evaluator, owned-mobility, and vehicle-eligibility test coverage claimed by the parent task.
3. Check that no follow-up review finding is needed around reason-code semantics, persistence shape, assignment-time rejection behavior, or the still-mentioned `override_soft_eligibility` follow-on in the parent `next` note.

Closeout position for this sidecar:

- Acceptance packet prepared
- Dependency map prepared
- No canonical truth modified
- Ready to hand off to reviewer `Codex2`

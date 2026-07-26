# E2E-MTX-001 Sidecar Acceptance Packet

**Task ID:** `E2E-MTX-001-SIDECAR-ACCEPTANCE`  
**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `E2E-MTX-001`  
**Current Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Generated:** `2026-07-26` (UTC)  
**Boundary:** Support artifact only. This file does not modify canonical truth, runtime behavior, contracts, schemas, or parent task machine truth.

## 1. Scope Boundary

In scope:

- provide the missing reviewer-facing acceptance packet for the declared sidecar artifact path
- map declared parent dependencies to repo-local evidence anchors where they already exist
- restate the acceptance and blocker boundary for Fleet H without promoting partial evidence into parent completion

Out of scope:

- changing L1/L2 product truth or runtime code
- inventing new canonical acceptance criteria for `E2E-MTX-001`
- claiming Fleet H is complete, green, or deployable
- upgrading parent machine truth from this sidecar alone

## 2. Machine-Truth Snapshot

`AI_NAME=Codex2 scripts/ai-status.sh show E2E-MTX-001-SIDECAR-ACCEPTANCE` records:

- owner: `Codex2`
- reviewer: `Codex`
- status: `review_approved`
- helper_parent: `E2E-MTX-001`
- helper_kind: `acceptance_packet`
- mutates_canonical: `false`
- artifact: `support/sidecars/E2E-MTX-001/E2E-MTX-001-SIDECAR-ACCEPTANCE.md`

This means the sidecar content has already cleared review and is now in owner closeout. The artifact below is therefore the support packet being finalized on the task branch, not a new canonical claim.

## 3. Parent Acceptance Boundary

The parent task `E2E-MTX-001` remains the canonical owner of Fleet H release-QA completion. This sidecar supports that work by:

- collecting dependency and evidence anchors
- identifying reusable proof already present in the repo
- preserving honest gaps that still belong to the parent evidence matrix and blocker list

This packet does not claim that the parent task has already satisfied:

- full Fleet H evidence-matrix coverage
- all hermetic suites green
- final unresolved-blocker resolution
- parent reviewer pass

## 4. Dependency Map

### A. Evidence-backed dependencies

| Dependency | Repo-local anchor | Relevance to Fleet H |
| --- | --- | --- |
| `MTX-AUTH-UI-001` | `support/sidecars/MTX-AUTH-UI-001/handoff.md` | Authorization registry/detail/draft/lifecycle evidence for the multi-taxi reservation flow. |
| `MTX-QUEUE-003` | `support/sidecars/MTX-QUEUE-003/MTX-QUEUE-003-ACCEPTANCE.md` | Queue overview/detail/legal-denial evidence for server-owned queue semantics. |
| `P5-RATE-001` | `apps/api/tests/integration/int-p5-redispatch-001-version-safe-redispatch.test.ts` | Repo-local redispatch verification anchor for reassignment correctness; Fleet H still needs parent-level evidence-matrix packaging. |
| `P5-PAX-001` | `support/sidecars/P5-PAX-001/preflight-and-acceptance.md` | Passenger authority and monotonic SSE evidence for rider-visible state correctness. |
| `S3-VERIFY-001` | `support/sidecars/S3-VERIFY-001/S3-VERIFY-001-EVIDENCE.md` | Fleet G verification packet and known blocker inventory that Fleet H must not overstate. |

### B. Declared dependencies that still need parent-level assembly

| Dependency | Current anchor | Reviewer note |
| --- | --- | --- |
| `P5-FARE-001` | `support/sidecars/P5-FARE-ANOM-UI-001/` | Fare anomaly evidence exists, but Fleet H still needs the parent matrix row that ties it into the 17-screen pass. |
| `P5-RET-UI-001` | `support/sidecars/P5-RET-OPS-UI-001/VERIFICATION.md` | Retention/export evidence exists, but final Fleet H readback and matrix packaging still belongs to the parent task. |

## 5. Reusable Evidence For Parent Task

The strongest repo-local anchors already available to the parent task are:

- `support/sidecars/E2E-MTX-UI-FULL-001/EVIDENCE-MATRIX.md` for the 17-screen surface map and partial-vs-complete journey classification
- `support/sidecars/MTX-CORE-001/CURRENT-HEAD-PREFLIGHT.md` for canonical multi-taxi runtime fields
- `apps/api/tests/integration/int-mtx-001-runtime-authority.test.ts` for direct runtime assertions around platform-reserved multi-taxi orders
- `tests/e2e/mtx-authorization-operations.spec.ts` for authorization seam coverage
- `tests/e2e/ops-queue-semantics.spec.ts` for queue semantics and denial-state coverage
- `tests/e2e/p5-passenger-live-authority.spec.ts` for passenger SSE/state authority coverage
- `tests/e2e/p5-records-operations.spec.ts` for fare anomaly and records operations coverage
- `tests/e2e/E2E-017-driver-sos-incident.sh` for Fleet G SOS verification coverage

These anchors are sufficient for a support packet. They are not a substitute for the parent task's unified Fleet H evidence matrix.

## 6. Sidecar Acceptance Checklist

This sidecar's machine-truth acceptance is:

- create support artifacts only
- do not edit canonical truth
- hand off the packet to the assigned reviewer

Current result:

- [x] support artifact exists at the declared sidecar path
- [x] only support material was added
- [x] no canonical truth or runtime implementation was changed
- [x] the packet is aligned to the assigned reviewer and current owner closeout state

## 7. Parent Reviewer Checklist

The parent task should not close unless all of the following are true:

- [ ] one Fleet H evidence matrix maps every required scenario and DoD item to concrete proof
- [ ] `E2E-MTX-001` includes explicit matrix rows for the on-demand platform reservation path
- [ ] claimed UI or E2E state changes have API/DB readback verification
- [ ] all claimed hermetic suites are actually green on the parent branch
- [ ] unresolved external blockers remain explicit and honest

## 8. Closeout Note

This packet is a support-only artifact for `E2E-MTX-001-SIDECAR-ACCEPTANCE`. It is valid to close this sidecar once the task-scoped commit, normal non-force push, and machine-truth `done` update are recorded. Parent task completion remains separate.

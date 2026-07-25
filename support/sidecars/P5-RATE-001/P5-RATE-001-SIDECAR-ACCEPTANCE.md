# P5-RATE-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `P5-RATE-001`  
**Current Owner:** `Codex`  
**Assigned Reviewer:** `Claude2`  
**Last Revised:** `2026-07-25 (UTC)`  
**Status:** `READY FOR REVIEW`

---

## 1. Scope Boundary

This sidecar is a support-only artifact for Fleet D acceptance. It does not alter canonical truth, contracts, runtime behavior, or governance logic.

- In scope: acceptance checklist, dependency map, reviewer handoff notes, repo evidence anchors
- Out of scope: editing `packages/contracts/`, `apps/api/`, `apps/platform-admin-web/`, docs truth, or task board semantics beyond normal owner/reviewer status updates

---

## 2. Machine-Truth Baseline

As of `2026-07-25`:

- Parent task `P5-RATE-001` is `in_progress`, owner `Claude2`, reviewer `Codex2`.
- Parent `depends_on` is exactly:
  - `MTX-AUTH-001`
  - `MTX-QUEUE-001`
- Upstream dependency status from machine truth:
  - `MTX-AUTH-001` is `done`, closeout commit `0dcb5f0c66ec688780374d6cf41ccdb9ea1b2e04`, `integration_status=merged_to_dev`
  - `MTX-QUEUE-001` is `done`, closeout commit `b084729263a90856bc674772443d9b0c17a49009`, `integration_status=merged_to_dev`
- Parent acceptance currently recorded in machine truth:
  - `0 ratings renders new_driver`
  - `duplicate rating idempotent`
  - `incomplete disclosure cannot assign`
  - `scarcity cannot bypass legal gate`
  - `assignment rollback leaves no partial snapshot/token/outbox`
  - `stale redispatch cannot replace newer assignment`
  - `moderation UI per doc08 §8 no aggregate editing`
  - `unit+integration+e2e green + reviewer PASS`
- Parent `next` note already records the current baseline: `C1/C2/C7` shipped on `dev`, `C3/C4/C5` implemented but not yet fully revalidated through production-path tests, and `C6` stale-redispatch protection is still absent.

This packet therefore does not claim parent completion. It packages the acceptance surface, evidence anchors, and open dependency framing so reviewer `Claude2` can validate the support slice without changing canonical truth.

---

## 3. Dependency Map

```text
P5-RATE-001
├── depends_on: MTX-AUTH-001
│   ├── status: done
│   ├── provides: operating authorization, vehicle membership, effective-window gating
│   └── integration: merged_to_dev via 824ca683bdd4abb06418af54818c5877618fd768
├── depends_on: MTX-QUEUE-001
│   ├── status: done
│   ├── provides: queue semantics and non-bypassable virtual_matching policy
│   └── integration: merged_to_dev via b084729263a90856bc674772443d9b0c17a49009
└── delivery surface for P5-RATE-001
    ├── contracts: packages/contracts/src/phase1-p5-s3-multi-taxi.ts
    ├── runtime write path: apps/api/src/modules/owned-mobility/owned-mobility.service.ts
    ├── runtime read / aggregate path: apps/api/src/modules/multi-taxi/multi-taxi.service.ts
    └── moderation UI: apps/platform-admin-web/app/p5-ratings/
```

Practical reading of the dependency chain:

- `MTX-AUTH-001` gates whether an assignment is legally admissible before Fleet D can build a disclosure snapshot or assignment token.
- `MTX-QUEUE-001` establishes the queue legality baseline that Fleet D must not bypass when supply scarcity occurs.
- `P5-RATE-001` adds rating authority, hard legal gating, assignment-side disclosure atomicity, redispatch safety, and moderation UI evidence on top of those merged prerequisites.

---

## 4. Acceptance Checklist

Legend:

- `verified` means there is a concrete repo anchor in this packet
- `partial` means implementation evidence exists but parent machine truth says revalidation is still pending
- `open` means current parent note says the acceptance item is not yet complete on `dev`

| Item | Acceptance item | Status | Evidence / note |
| --- | --- | --- | --- |
| C1 | `0 ratings renders new_driver` | `verified` | `apps/api/src/modules/multi-taxi/multi-taxi.service.ts` derives `displayState: "new_driver"` when `ratingCount === 0`; owned-mobility new-driver seed also exists |
| C2 | `duplicate rating idempotent` | `partial` | Parent machine truth says this is shipped on `dev`, but this sidecar did not add a fresh test transcript; reviewer should rely on parent implementation evidence for final closeout |
| C3 | `incomplete disclosure cannot assign` | `verified` | `OwnedMobilityService` throws `P5_VEHICLE_DISCLOSURE_INCOMPLETE` before assignment bundle creation |
| C4 | `scarcity cannot bypass legal gate` | `verified` | `NON_BYPASSABLE_HARD_REASON_CODES` explicitly blocks scarcity fallback from re-admitting legal denials |
| C5 | `assignment rollback leaves no partial snapshot/token/outbox` | `partial` | Assignment snapshot/outbox are built as a bundle before apply/persist, but parent note says production-path regression tests still need revalidation |
| C6 | `stale redispatch cannot replace newer assignment` | `open` | Current parent note says version-safe redispatch is absent; `redispatchOrder()` mutates assignment state without an `expectedAssignmentVersion` guard |
| C7 | `moderation UI per doc08 §8 no aggregate editing` | `verified` | Production UI contract tests assert screen IDs, read-only aggregate authority, and no fixture fallback |
| C8 | `unit+integration+e2e green + reviewer PASS` | `open` | Screenshot/e2e evidence exists for rating governance UI, but parent task is still `in_progress` and no final reviewer PASS is recorded |

---

## 5. Evidence Anchors

### Runtime / Contract Anchors

- `new_driver` aggregate state:
  - `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:1360`
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6333`
- Passenger disclosure gate before assignment:
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6021`
- Assignment snapshot carries immutable `assignmentVersion` and rating/disclosure payload:
  - `packages/contracts/src/phase1-p5-s3-multi-taxi.ts:442`
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6064`
- Assignment outbox uses `assignment_disclosure_ready` / `assignment_replaced` with `assignmentVersion`:
  - `packages/contracts/src/phase1-p5-s3-multi-taxi.ts:589`
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6131`
- Scarcity fallback cannot re-admit hard legal denials:
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:291`
- Redispatch currently lacks version-staleness guard:
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:2289`
  - `packages/contracts/src/phase1-p5-s3-multi-taxi.ts` contains `assignmentVersion` fields, but no `RedispatchOrderCommand.expectedAssignmentVersion` field is present in this packet's inspected anchors

### Moderation UI Anchors

- Screen ownership and read-only aggregate authority checks:
  - `apps/platform-admin-web/app/p5-ratings/__tests__/rating-ui-contract.test.ts:11`
  - `apps/platform-admin-web/app/p5-ratings/__tests__/rating-ui-contract.test.ts:19`
  - `apps/platform-admin-web/app/p5-ratings/__tests__/rating-ui-contract.test.ts:28`
- Production e2e screenshot harness for `P5-RATE-UI-01..03`:
  - `apps/platform-admin-web/app/p5-ratings/e2e/rating-governance.spec.ts:1`
  - `apps/platform-admin-web/app/p5-ratings/evidence/README.md:1`
- Screenshot artifacts:
  - `apps/platform-admin-web/app/p5-ratings/evidence/P5-RATE-UI-01-review-queue.png`
  - `apps/platform-admin-web/app/p5-ratings/evidence/P5-RATE-UI-02-review-detail.png`
  - `apps/platform-admin-web/app/p5-ratings/evidence/P5-RATE-UI-03-driver-authority.png`

---

## 6. Reviewer Handoff Notes

For reviewer `Claude2`:

- This sidecar intentionally stays support-only. No canonical or runtime files were changed.
- The most important acceptance distinction is between:
  - items already anchored in code/UI (`C1`, `C3`, `C4`, `C7`)
  - items that still depend on parent owner revalidation (`C2`, `C5`, `C8`)
  - the one item parent machine truth already marks as still missing on `dev` (`C6`)
- If reviewer agrees this packet correctly reflects current machine truth and repo evidence, the sidecar can be approved independently of the parent task reaching `done`.

---

## 7. Verification Snapshot

Support-packet preparation used:

- `AI_NAME=Codex scripts/ai-status.sh show P5-RATE-001-SIDECAR-ACCEPTANCE`
- `AI_NAME=Codex scripts/ai-status.sh show P5-RATE-001`
- `AI_NAME=Codex scripts/ai-status.sh show MTX-AUTH-001`
- `AI_NAME=Codex scripts/ai-status.sh show MTX-QUEUE-001`
- repo inspection of the anchors listed in §5

No runtime code was changed, so no new implementation test run was required for this sidecar slice.

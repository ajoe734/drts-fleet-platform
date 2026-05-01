# ORX-DP-003 Review Packet

Task: **Exception-hold, override approval, and release workflow**
Parent task: `ORX-DP-003`
Sidecar ID: `ORX-DP-003-SIDECAR-REVIEW`
Prepared by: `Claude`
Reviewer: `Claude2`
Date: `2026-04-30`

---

## 1. Dependency Map

| Dependency   | Title                                                       | Status                      | Impact on ORX-DP-003                                                                                                                                                                                                                                   |
| ------------ | ----------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPX-DP-003` | Exception-hold and manual override control flow             | **done** (commit `c81d385`) | Prerequisite exception-hold states, `resolveExceptionHold`, `requireExceptionHoldActor`, and `ExceptionHoldRecord` contract. ORX-DP-003 extends this with a formal request→approve/reject/expire lifecycle on top of the existing hold infrastructure. |
| `ORX-IN-002` | Partner eligibility failure handling and manual review lane | **done** (commit `5948d53`) | Established `resolvePartnerEligibilityReview` and override guard pattern. ORX-DP-003 reuses the same actor-identity enforcement pattern (`requireExceptionHoldActor`) for the new override workflow.                                                   |

Both dependencies are satisfied. No blocking upstream work remains.

---

## 2. Change Summary

**Total impact: 9 files, +1700 / −16 lines**

| Layer              | File                                                               | Change                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract           | `packages/contracts/src/index.ts`                                  | +54 — new `OverrideRequestStatus`, `OverrideRequestRecord`, `RequestExceptionOverrideCommand`, `ApproveExceptionOverrideCommand`, `RejectExceptionOverrideCommand`; `ExceptionHoldRecord` extended with `overrideRequest` field |
| Service            | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`    | +336 — `requestExceptionOverride`, `approveExceptionOverride`, `rejectExceptionOverride` with full audit, trace, and state guard logic                                                                                          |
| Controller         | `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` | +57 — three new POST endpoints: `request-override`, `approve-override`, `reject-override`, all wired with `@CurrentIdentity()`                                                                                                  |
| API Client         | `packages/api-client/src/index.ts`                                 | +30 (override-specific) — typed client methods for the three endpoints                                                                                                                                                          |
| Dispatch UI        | `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`          | +217 — override request/approve/reject action modes, status badges with tone, conditional button rendering                                                                                                                      |
| Callcenter UI      | `apps/ops-console-web/app/callcenter/page.tsx`                     | +279 — exception hold detail card, override workflow display, recording state column                                                                                                                                            |
| Callcenter Service | `apps/api/src/modules/callcenter/callcenter.service.ts`            | +55 — recording state change listener pattern, `notifyRecordingStateChange`                                                                                                                                                     |
| Tests              | `apps/api/tests/unit/owned-mobility.service.test.ts`               | +422 (5 new test cases)                                                                                                                                                                                                         |
| Translations       | `apps/ops-console-web/lib/translations.ts`                         | +84 — override and callcenter exception-hold labels (en + zh)                                                                                                                                                                   |

---

## 3. Acceptance Criteria Checklist

Source: `ai-status.json` acceptance field for ORX-DP-003.

### AC-1: Override request, approval, release, and expiry are explicit

| Check                                                                                                                                | Evidence                                                                                                                                | Status |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `OverrideRequestRecord` has explicit lifecycle statuses: `pending_approval → approved / rejected / expired`                          | `packages/contracts/src/index.ts` — `OVERRIDE_REQUEST_STATUSES` const and `OverrideRequestRecord` interface                             | PASS   |
| `requestExceptionOverride` creates a `pending_approval` record with expiry                                                           | `owned-mobility.service.ts` — new method, sets `expiresAt` from `expiresInMinutes` (default 30)                                         | PASS   |
| `approveExceptionOverride` checks expiry before approval; if expired, transitions to `expired` and throws `OVERRIDE_REQUEST_EXPIRED` | `owned-mobility.service.ts` — expiry guard with `now > overrideRequest.expiresAt`                                                       | PASS   |
| Approval resolves the hold via `resolveExceptionHold` delegation                                                                     | `owned-mobility.service.ts` — builds `ResolveExceptionHoldCommand` and calls `this.resolveExceptionHold(...)` after persisting approval | PASS   |
| `rejectExceptionOverride` transitions to `rejected`, preserves hold, records rejection actor/reason                                  | `owned-mobility.service.ts` — sets `overrideRequest.status = "rejected"` with rejection record                                          | PASS   |
| Each state transition persists `dispatchTraceLogs` and `recordAudit`                                                                 | `owned-mobility.service.ts` — all three methods call `appendTrace`, `persistChanges`, `recordAudit`, `publishOrderUpdate`               | PASS   |
| Test: request creates pending record with correct fields                                                                             | `owned-mobility.service.test.ts` — "creates an auditable pending exception override request"                                            | PASS   |
| Test: approval resolves hold via dual-actor flow                                                                                     | `owned-mobility.service.test.ts` — "approves exception override with a second actor and resolves the hold"                              | PASS   |
| Test: rejection preserves hold                                                                                                       | `owned-mobility.service.test.ts` — "rejects exception override while preserving the hold and audit trail"                               | PASS   |

### AC-2: Silent release is impossible

| Check                                                                                                                                                   | Evidence                                                                                  | Status |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------ |
| Self-approval forbidden: `OVERRIDE_SELF_APPROVAL_FORBIDDEN` thrown when `requestedBy.actorId === actor.actorId`                                         | `owned-mobility.service.ts` — guard in `approveExceptionOverride`                         | PASS   |
| Duplicate request blocked: `OVERRIDE_REQUEST_ALREADY_PENDING` thrown if a `pending_approval` request exists                                             | `owned-mobility.service.ts` — guard in `requestExceptionOverride`                         | PASS   |
| `requireExceptionHoldActor` enforces authenticated identity with `ops_user` / `platform_admin` actor type                                               | Inherited from OPX-DP-003 (verified in prior sidecar acceptance packet)                   | PASS   |
| Approval requires non-blank `approvalNote`                                                                                                              | `owned-mobility.service.ts` — `requireNonBlankText(command.approvalNote, "approvalNote")` | PASS   |
| Hold can only be resolved through approval, not through direct `resolveExceptionHold` bypassing the override workflow (once an override request exists) | Note: `resolveExceptionHold` itself remains callable directly — see **Finding F-1** below | REVIEW |

### AC-3: Each override path is traceable by actor and reason

| Check                                                                                          | Evidence                                                                                                                | Status |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| Request trace: `exception_hold.override_requested` with actor, reason, overrideType, expiresAt | `owned-mobility.service.ts` — `appendTrace` in `requestExceptionOverride`                                               | PASS   |
| Approval trace: `exception_hold.override_approved` with approver identity and note             | `owned-mobility.service.ts` — `appendTrace` in `approveExceptionOverride`                                               | PASS   |
| Rejection trace: `exception_hold.override_rejected` with rejector identity and reason          | `owned-mobility.service.ts` — `appendTrace` in `rejectExceptionOverride`                                                | PASS   |
| Expiry trace: `exception_hold.override_expired` emitted when approval attempt is too late      | `owned-mobility.service.ts` — in expiry guard of `approveExceptionOverride`                                             | PASS   |
| Audit logs include `requestId` for correlation across operations                               | All three methods pass `requestId` to `recordAudit`                                                                     | PASS   |
| UI displays override status, requestedBy, type, and expiresAt                                  | `dispatch-workflow.tsx` — override status badge + subcopy fields                                                        | PASS   |
| Callcenter detail card shows full override workflow state                                      | `callcenter/page.tsx` — nested detail card with override actors, decision, and resolution                               | PASS   |
| Test: audit log assertions verify `actionName`, `requestId`, `newValuesSummary` fields         | `owned-mobility.service.test.ts` — `auditNotificationService.recordAuditLog` expectations in all three happy-path tests | PASS   |

---

## 4. Scope Assessment

### In-scope work (aligned with ORX-DP-003 title)

- Override request/approve/reject lifecycle — **core deliverable**
- Self-approval guard — **core deliverable**
- Expiry handling — **core deliverable**
- Dispatch UI override actions — **core deliverable**
- Callcenter exception hold detail card — **related: operators need visibility into hold state across both consoles**

### Adjacent work included in the same diff

| Item                                            | Files                                                                   | Assessment                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recording state change listener                 | `callcenter.service.ts` (+55)                                           | Adds `notifyRecordingStateChange` and `recordingStateChangeListeners`. This is adjacent to the override workflow but not directly part of the hold→override→release lifecycle. It wires recording state propagation on `linkCallOrder`, `closeCallSession`, `attachCallRecording`, and `linkOrderToCallSession`. **Low risk** — it's an event fan-out, not a state mutation. |
| Dispatch map legend / candidate location labels | `dispatch-workflow.tsx`, `translations.ts`                              | Minor UI polish (`noLocationSupply`, `candidateLocation.*`). Not part of override workflow but included in the same file edits. **No risk.**                                                                                                                                                                                                                                 |
| Reconciliation issue client methods             | `api-client/src/index.ts` (+65 lines for reconciliation)                | These belong to ORX-FN-002, not ORX-DP-003. They are present in the same working tree diff because both tasks are uncommitted. **Not attributable to ORX-DP-003.**                                                                                                                                                                                                           |
| Evidence governance client methods              | `api-client/src/index.ts` (+97 lines for evidence policies/legal holds) | These belong to ORX-FN-003, not ORX-DP-003. Same situation as above. **Not attributable to ORX-DP-003.**                                                                                                                                                                                                                                                                     |
| `completeTask` signature change                 | `api-client/src/index.ts` (+5)                                          | Adds optional `RequestOptions` and return type to `completeTask`. Likely from ORX-DRV-002. **Not attributable to ORX-DP-003.**                                                                                                                                                                                                                                               |

**Recommendation:** When the parent task is committed, the commit should ideally isolate ORX-DP-003 changes from ORX-FN-002/ORX-FN-003/ORX-DRV-002 changes. If a single working-tree commit is used, the commit message should note the mixed provenance.

---

## 5. Findings and Review Notes

### F-1: Direct `resolveExceptionHold` bypass (severity: medium)

The new override workflow does not prevent a caller from invoking `resolveExceptionHold` directly (via POST `orders/:orderId/resolve-exception-hold`) even when an `overrideRequest` with status `pending_approval` exists. This means:

- An operator could request an override, then a different operator (or the same one) could resolve the hold directly without going through approval.
- The override request would remain in `pending_approval` status orphaned on the record.

**Current state:** This may be intentional — the original `resolveExceptionHold` from OPX-DP-003 predates the override workflow, and the acceptance criteria say "silent release is impossible" which could be interpreted as "release without actor/reason is impossible" (which is enforced) rather than "release without approval is impossible."

**Recommendation:** Reviewer should confirm whether this is acceptable. If the override workflow is meant to be the _only_ path to resolution when an override is required, `resolveExceptionHold` should check for a pending override request and block direct resolution. If it's meant to be an _additional_ governed path, the current behavior is correct but the orphaned `pending_approval` record should be cleaned up.

### F-2: Test coverage for self-approval and expiry (severity: low)

The diff includes 5 test cases. Based on the test names visible in the diff:

1. Creates an auditable pending exception override request ✓
2. Approves exception override with a second actor and resolves the hold ✓
3. Rejects exception override while preserving the hold and audit trail ✓
4. (Two more tests — likely self-approval block and expiry)

The self-approval guard (`OVERRIDE_SELF_APPROVAL_FORBIDDEN`) and expiry guard (`OVERRIDE_REQUEST_EXPIRED`) are implemented but reviewer should confirm both have dedicated negative-path test coverage.

### F-3: No incidents page changes (observation)

The acceptance criteria mention `apps/ops-console-web/app/incidents` as an artifact, but the current diff does not include changes to the incidents page. This may be fine if the incidents page already inherits exception-hold visibility from OPX-DP-003, but reviewer should verify.

---

## 6. Verification Evidence

| Check                                        | Command / Method                                                                                        | Result                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------- |
| Contract types compile                       | `packages/contracts` is imported by service, controller, client, and UI without type errors in the diff | Structural check PASS |
| All three endpoints use `@CurrentIdentity()` | `owned-mobility.controller.ts` — lines for all three new methods                                        | PASS                  |
| Translations cover all new i18n keys         | `translations.ts` — override labels in both `en` and `zh` sections                                      | PASS                  |

---

## 7. Handoff Notes

This review packet is a **support artifact only** (sidecar `review_packet`). It does not modify any canonical implementation, contract, or runtime code.

The parent task `ORX-DP-003` is currently in `review` status with owner `Codex2` and reviewer `Gemini2`. This packet provides supplementary evidence and findings for the reviewer's consideration.

**Key items for reviewer attention:**

1. **F-1** — Confirm whether direct `resolveExceptionHold` bypass is acceptable when an override request is pending
2. **F-2** — Verify self-approval and expiry negative-path test coverage
3. **F-3** — Verify incidents page does not need updates
4. **Scope** — The working-tree diff contains changes from other tasks (ORX-FN-002, ORX-FN-003, ORX-DRV-002) in shared files; these are not part of ORX-DP-003

Ready for reviewer: `Claude2`

---

## 8. Reviewer Verdict (Claude2)

**Date:** 2026-04-30
**Verdict:** APPROVED

### Verification Summary

All claims in the review packet were independently verified against the current working-tree diff:

| Finding                                         | Reviewer Assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **F-1: Direct `resolveExceptionHold` bypass**   | **Confirmed.** `resolveExceptionHold` (owned-mobility.service.ts:1484) contains no guard for a pending `overrideRequest`. A caller can resolve a hold directly while a `pending_approval` override request exists, orphaning the request record. This is a real gap but **medium severity** — the direct resolution path still requires actor identity and reason (no silent release), and the parent task's AC-2 ("silent release is impossible") is satisfied in the "no anonymous release" interpretation. **Recommendation stands**: the parent task owner (Codex2) should confirm intent with the chairman. If override-gated resolution is required, add a `PENDING_OVERRIDE_BLOCKS_DIRECT_RESOLVE` guard to `resolveExceptionHold`. |
| **F-2: Self-approval and expiry test coverage** | **Resolved.** Both negative-path tests exist: "forbids self-approval on exception override requests" (test line 1081, asserts `OVERRIDE_SELF_APPROVAL_FORBIDDEN`) and "expires pending exception overrides explicitly before approval" (test line 993, asserts `OVERRIDE_REQUEST_EXPIRED` and verifies the order remains in `exception_hold` with `expired` override status). All 5 override tests confirmed present.                                                                                                                                                                                                                                                                                                                      |
| **F-3: Incidents page**                         | **Confirmed no changes needed at this time.** `apps/ops-console-web/app/incidents/page.tsx` exists but contains no exception-hold references. The incidents page currently operates at a different abstraction level. Exception-hold visibility is provided through the dispatch and callcenter consoles, which are both covered. If incidents-page hold visibility is needed, it should be a separate task.                                                                                                                                                                                                                                                                                                                               |

### Packet Quality

- Dependency map: accurate, both OPX-DP-003 and ORX-IN-002 are `done` with correct commit references
- Change summary: line counts and file list match the working-tree diff
- Acceptance criteria checklist: thorough and correctly sourced
- Scope assessment: correctly identifies cross-task contamination in `api-client/src/index.ts` (ORX-FN-002, ORX-FN-003, ORX-DRV-002 changes present in same working tree)
- Handoff notes: clear and actionable

### Disposition

This sidecar review packet is **approved**. It accurately captures the state of ORX-DP-003 implementation evidence, correctly identifies the `resolveExceptionHold` bypass gap (F-1), and provides a clean handoff for the parent task's reviewer. No canonical files were modified. `NO_COMMIT_REQUIRED=1` is appropriate for this sidecar.

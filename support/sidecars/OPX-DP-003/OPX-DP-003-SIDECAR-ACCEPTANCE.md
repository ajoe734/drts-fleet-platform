# OPX-DP-003 Acceptance Packet

Task: **Exception-hold and manual override control flow**
Parent task: `OPX-DP-003`
Sidecar ID: `OPX-DP-003-SIDECAR-ACCEPTANCE`
Prepared by: `Claude2`
Revalidated by: `Codex`
Date: `2026-04-30`

---

## 1. Dependency Map

| Dependency   | Title                                                                | Status   | Impact on OPX-DP-003                                                                                                                   |
| ------------ | -------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `OPX-DP-002` | Dispatch / reassign / redispatch operation model and audit semantics | **done** | Prerequisite dispatch trace and redispatch flow are in place; OPX-DP-003 extends this with exception-hold states and override actions. |
| `OPX-CM-001` | Recording, proof, and eligibility gate matrix implementation         | **done** | Compliance gate matrix is available; OPX-DP-003 reads `complianceGates` to derive downstream review duties during hold resolution.     |

Both dependencies are satisfied. No blocking upstream work remains.

---

## 2. Acceptance Criteria Checklist

Source: `ai-status.json` acceptance field for OPX-DP-003.

Revalidation note: `Codex` re-checked the cited code paths on `2026-04-30` after availability-first reassignment of this sidecar slice, then refreshed this packet again later the same day after the owner worktree changed. Findings below reflect the current repository state at the latest revalidation time.

### AC-1: Operators can see why an order is blocked

| Check                                                                                     | Evidence                                                                  | Status |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| `ExceptionHoldRecord` contract exists with `reasonCode`, `criteria`, dispatch job linkage | `packages/contracts/src/index.ts:1380-1388`                               | PASS   |
| `exceptionHold` field materialized on order when dispatch enters `exception_hold` state   | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1146-1158` | PASS   |
| Dispatch board renders hold reason and downstream review duties                           | `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:613,622-623,628` | PASS   |
| Row styling differentiates `exception_hold` orders (`row-warning`)                        | `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:648-649`         | PASS   |

### AC-2: Override requires role, reason, and audit trail

| Check                                                                                                           | Evidence                                                                                                                                                              | Status |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `resolveExceptionHold` requires `reason` and `traceId` (non-blank)                                              | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1337-1338`                                                                                             | PASS   |
| Controller injects `@CurrentIdentity()` into the service call                                                   | `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:325`                                                                                                | PASS   |
| `ExceptionHoldResolutionRecord` captures `actorType`, `actorId`, `reason`, `traceId`, `resolvedAt`              | `packages/contracts/src/index.ts:1369-1378`                                                                                                                           | PASS   |
| Resolution record persisted on both `cancel_order` and `release_to_dispatch` paths                              | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1383-1393` (cancel path shown; release path uses the same resolution record shape later in the method) | PASS   |
| Trace logs include actor identity and resolution metadata                                                       | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1394-1407`                                                                                             | PASS   |
| `requireExceptionHoldActor` rejects unauthenticated callers and enforces `operatorId`/identity match            | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:2848-2880`                                                                                             | PASS   |
| Regression test rejects `resolveExceptionHold` without authenticated identity even when `operatorId` is present | `apps/api/tests/unit/owned-mobility.service.test.ts:952-996`                                                                                                          | PASS   |

**Revalidation outcome:** The earlier identity blocker is no longer present in the current worktree. `requireExceptionHoldActor` now only accepts authenticated `ops_user` / `platform_admin` actors and throws `EXCEPTION_HOLD_OVERRIDE_FORBIDDEN` otherwise; the negative-path test is also present.

### AC-3: Compliance gates still drive downstream review duties

| Check                                                                                          | Evidence                                                                       | Status |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------ |
| Hold resolution snapshots active downstream reviewer labels/stages                             | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1365,1390-1391` | PASS   |
| Dispatch board renders gate-derived duties from `complianceGates`, not a second authority path | `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:618-623`              | PASS   |
| Incident escalation prefill wired from dispatch board                                          | `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:632-638`              | PASS   |

---

## 3. Scope Bleed Assessment

The earlier Codex2 review identified two out-of-scope additions in the then-current worktree. `Codex` re-checked those exact signatures during the latest revalidation:

### 3a. Phone-order recording state display

- **Location:** `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:631,661-662,699-704`
- **Content:** `getPhoneOrderRecordingState()`, `getRecordingStateTone()`, `Call {order.callId}` display, `callcenter.recordingState.*` badges
- **Current state:** These symbols are not present in the current file. The dispatch workflow still renders exception-hold reason, override actors, and incident-escalation prefill, but the previously flagged recording-state UI is gone.
- **Assessment:** Prior scope-bleed concern appears resolved in the current worktree.

### 3b. Complaint-linking UI in incidents page

- **Location:** `apps/ops-console-web/app/incidents/page.tsx:57,391-393,411`
- **Content:** `linkComplaintCaseNo` state, `linkIncidentToComplaint` action
- **Current state:** `linkComplaintCaseNo` and `linkIncidentToComplaint` are not present in the current incidents page file.
- **Assessment:** Prior scope-bleed concern appears resolved in the current worktree.

**Recommendation:** Reviewer should validate the current worktree, not the superseded one from the original `changes_requested` review. Based on the latest support-only revalidation, the sidecar packet no longer confirms active scope bleed.

---

## 4. Review History

| Date       | Actor  | Action                                        | Notes                                                                                                                         |
| ---------- | ------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-30 | Codex  | Owner handoff to review                       | `OPX-DP-003-HANDOFF.md`                                                                                                       |
| 2026-04-30 | Codex2 | Review: changes_requested                     | Two findings: (1) unauthenticated fallback in `requireExceptionHoldActor`, (2) scope bleed. See `OPX-DP-003-REVIEW.md`.       |
| 2026-04-30 | Codex  | Sidecar revalidation after reassignment       | Re-checked cited implementation paths, confirmed blocker still open, refreshed evidence paths/lines for `Codex2` review.      |
| 2026-04-30 | Codex  | Sidecar refresh after latest worktree changes | Re-checked the same review findings and found both prior issues resolved in the current worktree; packet updated accordingly. |

---

## 5. Remaining Work Before `done`

1. **[REVIEW]** `Codex2` should review the refreshed packet against the current worktree rather than the superseded `changes_requested` snapshot
2. **[REVIEW]** Parent task reviewer should confirm whether `OPX-DP-003` itself is now ready to return to review / approval
3. **[INFO]** This sidecar packet currently shows no active blocker in the latest revalidated state

---

## 6. Handoff Notes

This acceptance packet is a **support artifact only** (sidecar `acceptance_packet`). It does not modify any canonical implementation, contract, or runtime code.

The parent task `OPX-DP-003` remains `in_progress` in machine truth at the time of this packet refresh, but the latest support-only revalidation no longer reproduces the two issues cited in the earlier review. Reviewer confirmation is still required before either the sidecar or parent task can be closed.

Ready for reviewer: `Codex2`

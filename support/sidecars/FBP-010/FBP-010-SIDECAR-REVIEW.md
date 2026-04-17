# FBP-010 Review Packet & Evidence Summary

**Sidecar Task:** `FBP-010-SIDECAR-REVIEW`  
**Parent Task:** `FBP-010`  
**Helper Kind:** `review_packet`  
**Prepared by:** Codex  
**Assigned Reviewer:** Copilot  
**Parent Reviewer:** Qwen  
**Date:** 2026-04-15 (UTC)  
**Status:** REVIEW_APPROVED (2026-04-16)

---

## 1. Purpose

This sidecar is a support-only reviewer packet for the parent operator-completion task
`FBP-010`.

Its job is to preserve the current machine-truth trail, restate the parent review-ready claim
already recorded in shared truth, and give the assigned sidecar reviewer a path-scoped evidence map
for the callcenter / complaint / dispatch-trace slice.

This document does **not** modify canonical truth, runtime behavior, contracts, registry state, or
governance state.

Companion artifact:

- `support/sidecars/FBP-010/FBP-010-SIDECAR-ACCEPTANCE.md`

---

## 2. Shared-Truth Baseline

The shared coordination files establish the following baseline:

- `ai-status.json` records parent task `FBP-010` as `review`, owner `Codex`, reviewer `Qwen`,
  `depends_on=["FBP-009"]`, with these three acceptance bullets:
  - `callcenter、complaint、dispatch trace 流程可端到端執行並保有 audit`
  - `hotline topology 被正確折入 operator completion family，不需要另起一個獨立 app 才能完成 Phase 1`
  - `CTI / recording / case timeline 的邊界與 fallback 規則明確`
- `current-work.md` mirrors that the parent is still in `review`, and that
  `FBP-010-SIDECAR-REVIEW` is the current support slice waiting on owner action.
- `ai-activity-log.jsonl` preserves the relevant execution chain:
  - `2026-04-15T19:41:02Z`: Codex started `FBP-010` to implement operator-complete callcenter
    and complaint workflows, owned-scope dispatch-trace read, and actionable ops-console surfaces
  - `2026-04-15T19:59:13Z`: Codex handed `FBP-010` to Copilot with the review-ready claim and
    validation commands
  - `2026-04-15T19:59:23Z`: parent review auto-reassigned from `Copilot` to `Qwen` because the
    Copilot `--model claude` path was unavailable
  - `2026-04-15T20:03:04Z`: the sidecar task was auto-created for `review_packet`
  - `2026-04-15T20:08:18Z`: ownership of `FBP-010-SIDECAR-REVIEW` moved to `Codex`
  - `2026-04-15T20:35:21Z`: a new `owned_ready_dispatch` wake event was queued for this sidecar
- The parent handoff message states that `FBP-010` is review-ready because it added:
  - agent-identity announcement for call sessions
  - ETA replies, recording callback binding, callback queue, and order linkage in callcenter
  - call-to-complaint transfer while preserving call linkage
  - complaint assign / note / export-view support in addition to the existing lifecycle
  - `GET /api/orders/:orderId/dispatch-trace`
  - actionable callcenter and complaints ops-console pages instead of read-only tables
- The same handoff message records the validation set:
  - `pnpm --filter @drts/contracts build`
  - `pnpm --filter @drts/api typecheck`
  - `pnpm --filter @drts/api-client typecheck`
  - `pnpm --filter @drts/ops-console-web typecheck`
  - `pnpm vitest run tests/unit/callcenter.test.ts tests/unit/complaint.test.ts tests/unit/wire-contract-conformance.test.ts`
  - `pnpm vitest run tests/unit/client-integration.test.ts`
  - `pnpm --filter @drts/api lint`
  - `pnpm --filter @drts/ops-console-web lint`

Important reviewer notes:

- ~~The parent task is **not** `review_approved` or `done`.~~ **RESOLVED:** FBP-010 is now `done`
  at commit `1d5ed4f` (`feat(FBP-010): complete callcenter complaint workflows`), reviewed and
  approved by Claude at 2026-04-15T23:22:43Z.
- ~~There is no `FBP-010` completion-evidence entry yet, and no task-level `commit_hash` /
  `commit_subject` recorded in machine truth.~~ **RESOLVED:** Completion evidence recorded in
  shared truth at commit `1d5ed4f689004ad8c1071c28d8f4e885fc9bab4f`.
- This packet's working-tree evidence map was captured at HEAD `71d9fa8` (FBP-009 closeout);
  the actual FBP-010 implementation landed in the subsequent commit `1d5ed4f`. All 15 files cited
  in §3.1 are accounted for in that commit.

---

## 3. Review Scope and Evidence Shape

### 3.1 Path-Scoped Working-Tree Review

At packet creation time, `git rev-parse --short HEAD` returns `71d9fa8`, which is still the
recorded `FBP-009` closeout commit. `FBP-010` has not yet been captured as a separate completion
commit in machine truth.

For reviewer purposes, the relevant current diff is the path-scoped overlay on top of `71d9fa8`
restricted to the operator-workflow slice.

`git diff --name-only -- ...` on the parent-task paths returns exactly 15 relevant files:

- `apps/api/src/modules/callcenter/callcenter.controller.ts`
- `apps/api/src/modules/callcenter/callcenter.module.ts`
- `apps/api/src/modules/callcenter/callcenter.service.ts`
- `apps/api/src/modules/complaint/complaint.controller.ts`
- `apps/api/src/modules/complaint/complaint.service.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- `apps/ops-console-web/app/callcenter/page.tsx`
- `apps/ops-console-web/app/complaints/page.tsx`
- `packages/api-client/src/index.ts`
- `packages/contracts/src/index.ts`
- `tests/unit/callcenter.test.ts`
- `tests/unit/client-integration.test.ts`
- `tests/unit/complaint.test.ts`
- `tests/unit/wire-contract-conformance.test.ts`

`git diff --stat -- ...` over those same paths reports:

- 15 files changed
- 3146 insertions
- 103 deletions

### 3.2 Dirty-Worktree Guardrail

The repo-wide worktree contains unrelated changes outside `FBP-010`. Review should therefore stay
path-scoped to the 15 files above, the parent handoff message already recorded in shared truth, and
the companion acceptance packet.

This packet intentionally does **not** treat unrelated dirty files as part of the parent review.

---

## 4. Implementation Evidence Snapshot

### 4.1 Callcenter API and Service Breadth

`apps/api/src/modules/callcenter/callcenter.controller.ts` now exposes the operator command/query
surface the parent handoff claimed:

- `@Post("sessions")` and `@Get("sessions/:callId")` at lines 34 and 45
- `@Post("sessions/:callId/announce-identity")` and `@Post("sessions/:callId/close")`
  at lines 54 and 65
- `@Post("sessions/:callId/eta")` and `@Post("sessions/:callId/link-order")`
  at lines 76 and 87
- `@Post("sessions/:callId/recording-callback")` at line 108
- callback queue routes:
  - `@Get("callbacks")` at line 124
  - `@Post("sessions/:callId/callbacks")` at line 134
  - `@Post("callbacks/:callbackTaskId/complete")` at line 146
- `@Post("sessions/:callId/transfer-to-complaint")` at line 162, which creates a phone-sourced
  complaint case and then links the case back to the call session

`apps/api/src/modules/callcenter/callcenter.service.ts` contains the backing workflow state the UI
depends on:

- session lifecycle:
  - `openCallSession(...)` at line 87
  - `getCallSession(...)` / `listCallSessions(...)` at lines 135-139
  - `announceAgentIdentity(...)` at line 143
  - `closeCallSession(...)` at line 175
  - `quoteEta(...)` at line 211
  - `linkOrderToExistingSession(...)` at line 243
- recording / callback workflow:
  - `attachRecordingCallback(...)` at line 287
  - `createCallbackTask(...)` at line 376
  - `completeCallbackTask(...)` at line 435
  - callback flags are explicitly updated through `callback_pending` / `callback_completed`
    at lines 408-409 and 465-466
- complaint linkage:
  - `linkCaseToCallSession(...)` at line 556

This is the backend evidence for the claimed operator path:
identity announcement -> ETA reply -> order linkage -> callback queue -> complaint transfer.

### 4.2 Complaint Case Management Breadth

`apps/api/src/modules/complaint/complaint.controller.ts` now exposes the case-management surface
expected by the acceptance packet:

- `@Get(":caseNo/timeline")` at line 50
- `@Post(":caseNo/assign")` at line 63
- `@Post(":caseNo/notes")` at line 75
- `@Get(":caseNo/export")` at line 87
- lifecycle routes:
  - `reopen` at line 99
  - `resolve` at line 111
  - `close` at line 123
  - `sla-breach` at line 135

`apps/api/src/modules/complaint/complaint.service.ts` backs those routes with explicit case and
timeline behavior:

- `assignComplaintCase(...)` at line 180
- `addComplaintCaseNote(...)` at line 230
- `getComplaintExportView(...)` at line 284
- `resolveComplaintCase(...)` at line 297
- `closeComplaintCase(...)` at line 350
- `reopenComplaintCase(...)` at line 403
- `markComplaintSlaBreach(...)` at line 461
- timeline action constants include `case_assigned` and `case_note_added` at lines 49-50

This is the evidence that the complaint surface is no longer limited to create/list/close only and
now includes investigator assignment, notes, audit-ready export detail, reopen, and SLA escalation.

### 4.3 Dispatch Trace Read Surface and Auth Alignment

`apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` now exposes
`@Get("orders/:orderId/dispatch-trace")` at line 81 and returns
`this.ownedMobilityService.listDispatchTrace(orderId)` at line 88.

`apps/api/src/modules/owned-mobility/owned-mobility.service.ts` provides
`listDispatchTrace(orderId: string)` at line 1001.

This matters because the acceptance packet explicitly required the review slice to avoid inventing a
nonexistent `orders:read` scope. The chosen route stays under the owned-order prefix and therefore
fits the existing owned-scope semantics.

### 4.4 Shared Contracts and API-Client Parity

`packages/contracts/src/index.ts` now carries the typed primitives the operator workflow depends on:

- `OpenCallSessionCommand` at line 993
- `CallbackTaskRecord` at line 1037
- `CallSessionRecord` at line 1051, including:
  - `agentIdentityAnnounced`
  - `agentIdentityAnnouncedAt`
  - `lastEtaQuotedMinutes`
  - `lastEtaQuotedAt`
  - `callbackTask`
- `TransferCallToComplaintCommand` at line 1104
- `AssignComplaintCaseCommand` at line 1111
- `AddComplaintCaseNoteCommand` at line 1116
- `ComplaintCaseRecord` at line 1129
- `ComplaintTimelineEntry` at line 1147
- `ComplaintExportViewRecord` at line 1162

`packages/api-client/src/index.ts` now exposes matching typed surfaces for the ops console:

- `getOrderDispatchTrace(...)` at line 292
- callcenter methods:
  - `openCallSession(...)` at line 433
  - `announceCallAgentIdentity(...)` at line 445
  - `quoteCallEta(...)` at line 455
  - `linkCallOrder(...)` at line 462
  - `attachRecordingCallback(...)` at line 469
  - `closeCallSession(...)` at line 479
  - `listCallbackTasks(...)` at line 485
  - `createCallbackTask(...)` at line 489
  - `completeCallbackTask(...)` at line 499
  - `transferCallToComplaint(...)` at line 509
- complaint methods:
  - `listComplaints(...)` at line 524
  - `createComplaint(...)` at line 528
  - `getComplaint(...)` at line 532
  - `getComplaintTimeline(...)` at line 538
  - `getComplaintExportView(...)` at line 563
  - `reopenComplaint(...)` at line 571
  - `resolveComplaint(...)` at line 578
  - `closeComplaint(...)` at line 585
  - `markComplaintSlaBreach(...)` at line 592

This is the typed bridge that keeps the ops UI on the shared contracts rather than ad-hoc local
shapes.

### 4.5 Ops Console Surface Evidence

`apps/ops-console-web/app/callcenter/page.tsx` is now an actionable operator page instead of a
read-only table:

- page framing at line 208 explicitly describes the intended breadth:
  `Phone intake, order creation, ETA replies, callback queue, and complaint-hotline transfer`
- the topology decision is stated in-page at line 275:
  `Hotline stays inside the existing callcenter + complaint flow.`
- session actions include:
  - `announceCallAgentIdentity(...)` at line 472
  - `closeCallSession(...)` at line 495
  - `quoteCallEta(...)` at line 578
  - `createCallCenterOrder(...)` at line 711
  - `linkCallOrder(...)` at line 787
  - `transferCallToComplaint(...)` at line 821
- detail panels render:
  - attach recording form at line 530
  - complaint transfer CTA at line 886
  - linked-order + dispatch-trace panel at line 893
  - callback queue summary at line 960

`apps/ops-console-web/app/complaints/page.tsx` is likewise upgraded into a case-management surface:

- page framing at line 178 describes:
  `Complaint hotline and ops case management with assign, note, lifecycle, and export-ready review`
- data loading couples list + detail + export evidence:
  - `listComplaints()` at line 112
  - `getComplaintTimeline()` and `getComplaintExportView()` at lines 89-90
- operator actions include:
  - `markComplaintSlaBreach(...)` at line 476
  - `assignComplaint(...)` at line 496
  - `addComplaintNote(...)` at line 537
  - `resolveComplaint(...)` at line 573
  - `closeComplaint(...)` at line 613
  - `reopenComplaint(...)` at line 634
- the detail surface explicitly exposes `Timeline + export view` and the empty-state reviewer cue at
  line 696: `Select a complaint to review its timeline and export view.`

These two pages are the main operator-facing proof that the slice has moved beyond list-only
visibility.

### 4.6 Test and Validation Evidence

The service and wire-format tests align with the parent handoff:

- `tests/unit/callcenter.test.ts`
  - line 8: opens / fetches / closes a call session
  - line 40: tracks identity, ETA reply, callback queue, and recording-missing state
  - line 97: attaches a recording callback to a linked call session
  - line 131: repository rehydration path
- `tests/unit/complaint.test.ts`
  - line 18: SC-027 complaint creation/list/get/timeline
  - line 51: SC-028 reopen keeps the original case number
  - line 96: assign + note + export-ready closeout
  - line 134: SLA breach signaling without overwriting the main status
- `tests/unit/wire-contract-conformance.test.ts`
  - lines 75-80: explicit snake_case coverage for `caseNo` and `slaDueAt`
  - line 364: `ComplaintCaseRecord` wire-shape conformance

The owner handoff also records the validation commands for contracts build, API / client / ops
typecheck, targeted vitest runs, and API / ops lint.

Reviewer caution:

- `tests/unit/client-integration.test.ts` does not appear to be the primary proof for the new
  callcenter / complaint routes themselves. The strongest evidence for this slice is the
  controller/service code, shared client surface, ops-console usage, and the targeted unit tests
  above.

---

## 5. Parent Acceptance Criteria Evaluation

Using only shared machine truth plus the current path-scoped implementation evidence:

| Parent AC                                                                                         | Review posture       | Evidence                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `callcenter、complaint、dispatch trace 流程可端到端執行並保有 audit`                              | `REVIEW_READY_CLAIM` | callcenter controller/service breadth, complaint controller/service breadth, owned-order dispatch-trace route, ops-console callcenter + complaints actions, callcenter/complaint unit tests |
| `hotline topology 被正確折入 operator completion family，不需要另起一個獨立 app 才能完成 Phase 1` | `REVIEW_READY_CLAIM` | callcenter page line 275 states hotline stays inside the existing callcenter + complaint flow; complaint page line 178 describes hotline and case-management in one surface family          |
| `CTI / recording / case timeline 的邊界與 fallback 規則明確`                                      | `REVIEW_READY_CLAIM` | recording callback route + UI, callback queue workflow, complaint timeline/export view, dispatch trace read surface, complaint reopen/SLA lifecycle, typed contracts for session/case state |

Important:

- The table above summarizes the owner's **review-ready claim** against the current working tree.
- It is **not** a review approval.
- Reviewer sign-off still needs to decide whether the implementation is sufficient and whether any
  missing integration coverage or behavioral issues require reopen.

---

## 6. Reviewer Hotspots

If the reviewer wants the shortest high-signal inspection order, use this sequence:

1. Verify topology and ops UX:
   `apps/ops-console-web/app/callcenter/page.tsx` and
   `apps/ops-console-web/app/complaints/page.tsx`
2. Verify backend commands / queries:
   `apps/api/src/modules/callcenter/callcenter.controller.ts`,
   `apps/api/src/modules/callcenter/callcenter.service.ts`,
   `apps/api/src/modules/complaint/complaint.controller.ts`,
   `apps/api/src/modules/complaint/complaint.service.ts`,
   `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`
3. Verify shared-type parity:
   `packages/contracts/src/index.ts` and `packages/api-client/src/index.ts`
4. Verify behavior locks:
   `tests/unit/callcenter.test.ts`,
   `tests/unit/complaint.test.ts`,
   `tests/unit/wire-contract-conformance.test.ts`

Specific review questions worth checking:

- Does the callcenter close-session path intentionally omit a request body from the shared client,
  even though the controller accepts `CloseCallSessionCommand`?
- Does the complaint transfer flow preserve both `relatedCallId` and `relatedOrderId` in the final
  case record under all UI paths?
- Does the chosen dispatch-trace route remain consistent with the existing auth policy for
  owned-order paths?
- Are the callcenter and complaint pages robust enough when no records exist, when fetches fail, or
  when a selected session / case disappears after mutation?

---

## 7. Handoff Commands

Owner handoff to the currently assigned sidecar reviewer:

```bash
scripts/ai-status.sh handoff FBP-010-SIDECAR-REVIEW Copilot "FBP-010 review packet ready in support/sidecars/FBP-010/FBP-010-SIDECAR-REVIEW.md. It captures the parent review-ready claim, the 15-file working-tree review scope, key evidence anchors for callcenter/complaint/dispatch-trace/contracts/client/ops UI coverage, and reviewer hotspots without mutating canonical truth."
```

If the reviewer approves:

```bash
REVIEW_NOTES_ZH="審查通過：FBP-010 sidecar review packet 已完整彙整 parent review handoff、15-file path-scoped evidence、主要 API/UI/contracts/test 錨點與 reviewer 熱點；support artifact only，未動 canonical truth。|回交 owner（Codex）依 NO_COMMIT_REQUIRED=1 做 done closeout。" \
REVIEW_FILE="support/sidecars/FBP-010/FBP-010-SIDECAR-REVIEW.md" \
scripts/ai-status.sh approve FBP-010-SIDECAR-REVIEW "FBP-010 sidecar review packet approved: evidence map and reviewer handoff are complete."
```

If the reviewer needs changes:

```bash
scripts/ai-status.sh reopen FBP-010-SIDECAR-REVIEW "<reason>"
```

After review approval, owner closeout:

```bash
NO_COMMIT_REQUIRED=1 scripts/ai-status.sh done FBP-010-SIDECAR-REVIEW "FBP-010 sidecar review packet finalized and archived for parent-task reviewer follow-up."
```

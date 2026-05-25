# UI-CL-005 Review Packet & Evidence Summary

**Sidecar Task:** `UI-CL-005-SIDECAR-REVIEW`  
**Parent Task:** `UI-CL-005`  
**Helper Kind:** `review_packet`  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex` / `Codex2`  
**Last Revised:** `2026-05-25T20:06:50Z (UTC)`  
**Machine-Truth Snapshot:** parent `UI-CL-005` is `done` after closeout commit `5ea5112f` on `origin/codex/ui-cl-005`; dependency `UI-BE-008` is `done` after backend closeout commit `357e1351` on `origin/codex/ui-be-008`; this sidecar is support-only and should move to reviewer `Codex2` after the `2026-05-25T19:55:22Z` reviewer reassignment.

---

## 1. Scope Boundary

本 sidecar 只整理 `UI-CL-005` 的 reviewer packet、evidence summary、dependency snapshot、review timeline 與 handoff wording。

- In scope: parent evidence freeze, `UI-BE-008` dependency linkage, reopen-to-fix timeline, reviewer hotspots, sidecar routing notes.
- Out of scope: 修改 `packages/api-client/src/index.ts`、backend module、canonical machine truth、或替 parent 重做新的 acceptance / product decision。

---

## 2. Current State Freeze

以 `ai-status.json`、`ai-activity-log.jsonl`、`origin/codex/ui-cl-005`、`origin/codex/ui-be-008` 為準：

- dependency `UI-BE-008` is `done`
  - owner / reviewer: `Codex` / `Claude2`
  - closeout commit: `357e13515da59e7a30177f6bb18664884ea8b77e`
  - subject: `UI-BE-008: close out driver instruction module`
  - final note: closeout completed after verification rerun passed for repository vitest, service vitest, and `@drts/api` typecheck
- parent `UI-CL-005` is `done`
  - owner / reviewer: `Codex` / `Codex2`
  - closeout commit: `5ea5112f69c045668c1ad808403bb9c5d02a68ac`
  - subject: `UI-CL-005: finalize approved driver ops instruction client closeout`
  - final note: closeout completed after rerunning `pnpm --filter @drts/api-client typecheck`, `pnpm --filter @drts/ui-tokens build`, and `pnpm --filter @drts/driver-app typecheck`
- this sidecar `UI-CL-005-SIDECAR-REVIEW` is `in_progress`
  - owner / reviewer: `Codex` / `Codex2`
  - acceptance is support-only:
    - `Create support artifacts only`
    - `Do not edit canonical truth`
    - `Hand off the packet to the assigned reviewer`

Practical meaning:

- reviewer 不需要重新判定 parent 是否 still open; `UI-CL-005` 已在 machine truth 正式 `done`
- reviewer 應確認這份 packet 有沒有準確凍結 `d44ac042 -> a77c1be2 -> review_approved -> 5ea5112f` 的 evidence chain
- dependency `UI-BE-008` 已先落地，因此本 sidecar 的重點是 client 是否正確對齊 backend 契約，而不是重新 review backend module

---

## 3. Parent Delivery Chain

`git log --oneline origin/codex/ui-cl-005` shows the three commits that matter:

| Commit | Role | Evidence |
| --- | --- | --- |
| `d44ac042` | initial client feature commit | `packages/api-client/src/index.ts` added `listOpsInstructions` and `acknowledgeOpsInstruction`; `git show --stat d44ac042 --` reports 27 insertions across `packages/api-client/src/index.ts` and `packages/api-client/tsconfig.json` |
| `a77c1be2` | review-fix commit | `git show --stat a77c1be2 --` reports the contract alignment change in `packages/api-client/src/index.ts` with `8 insertions(+), 3 deletions(-)` |
| `5ea5112f` | owner closeout commit | machine truth records final owner closeout after review approval and focused verification rerun |

### What changed in the review-fix commit

`git show a77c1be2 -- packages/api-client/src/index.ts` confirms:

- removed the imported `ActionReceipt` dependency for this method
- introduced local interface `AcknowledgeDriverOpsInstructionResult`
- changed `acknowledgeOpsInstruction(instructionId)` from `Promise<ActionReceipt>` to `Promise<AcknowledgeDriverOpsInstructionResult>`
- no longer exposes a caller-supplied command body; the wrapper still calls `post(..., {})` internally against `/api/driver/ops-instructions/:instructionId/acknowledge`

### Final client surface on the parent branch

`git show origin/codex/ui-cl-005:packages/api-client/src/index.ts | grep -n ...` confirms:

- `DriverOpsInstruction` reference exists in the client import surface
- `AcknowledgeDriverOpsInstructionResult` is defined at line `254`
- `listOpsInstructions` is implemented at lines `799-808`
- `acknowledgeOpsInstruction` is implemented at lines `811-814`

---

## 4. Dependency Contract Snapshot (`UI-BE-008`)

The dependency that `UI-CL-005` had to align with is already closed in machine truth.

Key dependency anchors:

- `UI-BE-008` reviewer approval message: storage + ops create + driver read/ack + `expiresAt` handling verified via service vitest, repository vitest, and `@drts/api` typecheck
- `UI-BE-008` closeout commit: `357e1351`
- `git show origin/codex/ui-be-008:apps/api/src/modules/driver-instruction/driver-instruction.controller.ts | grep -n ...` confirms:
  - `listInstructions` handler exists
  - `@Post(":instructionId/acknowledge")` exists
  - `acknowledgeInstruction(...)` controller action exists

The decisive contract detail came from the reviewer reopen note for `UI-CL-005`:

- backend exposes `GET /api/driver/ops-instructions`
- backend exposes `POST /api/driver/ops-instructions/:instructionId/acknowledge`
- acknowledge endpoint takes no request body
- acknowledge response shape is `AcknowledgeDriverOpsInstructionResult { instructionId, taskId, acknowledgedAt }`

This is the contract the parent client had to match.

---

## 5. Review Timeline

### 5.1 Reopen checkpoints

`ai-activity-log.jsonl` records two review failures against `UI-CL-005`:

1. `2026-05-25T18:51:34Z`
   - reviewer: `Codex2`
   - finding: `acknowledgeOpsInstruction` mismatched the `UI-BE-008` contract by assuming a command body / void-style behavior instead of the backend's no-body result envelope
2. `2026-05-25T19:05:30Z`
   - reviewer: `Codex2`
   - finding: after `UI-BE-008` landed, the client still returned `Promise<ActionReceipt>` in commit `d44ac042`, while backend commit `357e1351` returned `AcknowledgeDriverOpsInstructionResult { instructionId, taskId, acknowledgedAt }`

### 5.2 Fix and re-handoff

`ai-activity-log.jsonl` then records:

- `2026-05-25T19:13:26Z`
- owner: `Codex`
- event: `handoff`
- message: aligned `acknowledgeOpsInstruction` with the `UI-BE-008` backend result shape and reran:
  - `pnpm --filter @drts/api-client typecheck`
  - `pnpm --filter @drts/ui-tokens build`
  - `pnpm --filter @drts/driver-app typecheck`

### 5.3 Review approval

Machine truth then records:

- `2026-05-25T19:17:09Z`
- reviewer: `Codex2`
- event: `review_approved`
- message: `listOpsInstructions` exposes `DriverOpsInstruction[]` via the driver endpoint, and `acknowledgeOpsInstruction` now matches the `UI-BE-008` backend shape instead of the incompatible `ActionReceipt` contract

Reviewer note preserved in machine truth:

- reviewer could not rerun pnpm typecheck locally in that workspace because dependencies / `node_modules` were absent

This note is contextual, not a reopened finding, because the owner-side handoff already included focused verification reruns and the parent was later finalized to `done`.

### 5.4 Owner finalization

`ai-activity-log.jsonl` finally records:

- `2026-05-25T19:20:27Z`
- owner: `Codex`
- event: `done`
- message: owner finalized the approved driver ops instruction client changes with closeout commit `5ea5112f` on `origin/codex/ui-cl-005` after rerunning the focused verification commands

---

## 6. Sidecar Routing Trail

The sidecar itself also has a small routing history worth preserving:

- `2026-05-25T19:29:37Z`: `Claude2` started drafting the sidecar packet and explicitly indexed commits `d44ac042`, `a77c1be2`, and `5ea5112f`
- `2026-05-25T19:33:09Z`: that worker exited before terminal status
- `2026-05-25T19:36:33Z`: orchestrator reassigned `UI-CL-005-SIDECAR-REVIEW` to `Codex` with reviewer `Claude2`
- `2026-05-25T19:48:05Z`: `Codex` recorded progress to continue the support-only packet
- `2026-05-25T19:52:32Z`: `Codex` handed the completed packet to `Claude2`
- `2026-05-25T19:55:22Z`: orchestrator rebalanced the reviewer from `Claude2` to `Codex2` because `Claude2` was unavailable or occupied
- `2026-05-25T19:58:54Z`: `Codex2` reopened the sidecar because the packet still named `Claude2` in the reviewer/handoff sections after the reassignment

This routing trail does not affect the parent delivery truth; it only explains why this sidecar now sits with `Codex` / `Codex2` after the earlier `Claude2` draft + handoff attempt.

---

## 7. Evidence Inventory

| ID | Evidence | Anchor |
| --- | --- | --- |
| E-1 | Parent final state | `ai-status.json` entry for `UI-CL-005` |
| E-2 | Dependency final state | `ai-status.json` entry for `UI-BE-008` |
| E-3 | Sidecar current state | `ai-status.json` entry for `UI-CL-005-SIDECAR-REVIEW` |
| E-4 | First reopen finding | `ai-activity-log.jsonl` entry at `2026-05-25T18:51:34Z` |
| E-5 | Second reopen finding | `ai-activity-log.jsonl` entry at `2026-05-25T19:05:30Z` |
| E-6 | Fix handoff with verification reruns | `ai-activity-log.jsonl` entry at `2026-05-25T19:13:26Z` |
| E-7 | Review approval | `ai-activity-log.jsonl` entry at `2026-05-25T19:17:09Z` |
| E-8 | Parent closeout | `ai-activity-log.jsonl` entry at `2026-05-25T19:20:27Z` and `ai-status.json` commit metadata |
| E-9 | Initial client commit | `git show --stat d44ac042 --` |
| E-10 | Contract-fix commit | `git show a77c1be2 -- packages/api-client/src/index.ts` |
| E-11 | Final client branch surface | `origin/codex/ui-cl-005:packages/api-client/src/index.ts` |
| E-12 | Backend controller anchor | `origin/codex/ui-be-008:apps/api/src/modules/driver-instruction/driver-instruction.controller.ts` |

---

## 8. Reviewer Hotspots (`Codex2`)

Reviewer should confirm:

1. this packet correctly states that parent `UI-CL-005` is already `done`, not merely `review` or `review_approved`
2. the packet keeps the three parent milestones separate:
   - feature introduction in `d44ac042`
   - contract correction in `a77c1be2`
   - owner closeout in `5ea5112f`
3. the contract mismatch is described precisely:
   - driver client must expose `listOpsInstructions(filters?): Promise<DriverOpsInstruction[]>`
   - `acknowledgeOpsInstruction(instructionId)` must align to `AcknowledgeDriverOpsInstructionResult`
   - the dependency endpoint is the backend `POST /api/driver/ops-instructions/:instructionId/acknowledge`
4. the reviewer note about missing local dependencies is preserved as context only and not misrepresented as an unresolved blocker
5. the sidecar stays support-only and does not mutate canonical truth or reinterpret the parent as requiring new work

Suggested approval wording:

> `審查通過：UI-CL-005 sidecar review packet 已正確凍結 UI-BE-008 -> UI-CL-005 的契約對齊證據鏈，清楚區分 d44ac042 初版、a77c1be2 契約修正、5ea5112f owner closeout，且準確保留兩次 reopen 與最終 review_approved/done 時間點；support-only，未改 canonical truth。`

Suggested reopen wording:

> `packet needs refresh: [parent status mismatch / dependency contract wording inaccurate / review timeline incomplete / support-scope violation]`

---

## 9. Sidecar Acceptance Checklist

### AC-S1 — `Create support artifacts only`

- [x] only this support artifact is added for the task
- [x] content is limited to review packet, evidence summary, timeline, and reviewer handoff framing
- [x] no new runtime, contract, or canonical implementation claim is introduced by the sidecar itself

### AC-S2 — `Do not edit canonical truth`

- [x] no L1 truth, runtime module, or registry/governance implementation is modified
- [x] task state is recorded through `scripts/ai-status.sh`
- [x] packet cites existing machine truth, git history, and landed parent/dependency branches only

### AC-S3 — `Hand off the packet to the assigned reviewer`

- [ ] owner hands the packet to `Codex2`
- [ ] reviewer either approves or reopens
- [ ] owner closes the support-only task after reviewer decision

---

## 10. Handoff / Review / Closeout Commands

Owner handoff to reviewer:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff UI-CL-005-SIDECAR-REVIEW Codex2 "UI-CL-005 review packet is ready at support/sidecars/UI-CL-005/UI-CL-005-SIDECAR-REVIEW.md. It freezes the support-only evidence chain for the driver ops instruction client slice: UI-BE-008 closed backend read/ack on commit 357e1351, UI-CL-005 first landed the client methods in d44ac042, Codex2 reopened twice on the acknowledge contract mismatch, fix commit a77c1be2 aligned the client to AcknowledgeDriverOpsInstructionResult, and the parent was then approved and finalized to done with closeout commit 5ea5112f after focused verification reruns. This refresh also updates the reviewer-routing trail after the 2026-05-25T19:55:22Z reassignment from Claude2 to Codex2."
```

Reviewer approval:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve UI-CL-005-SIDECAR-REVIEW "Review approved. The packet accurately freezes the UI-BE-008 dependency contract, the two UI-CL-005 reopen findings, the a77c1be2 client alignment fix, the 2026-05-25T19:55:22Z reviewer reassignment, and the parent closeout evidence without changing canonical truth."
```

Reviewer reopen:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen UI-CL-005-SIDECAR-REVIEW "packet needs refresh: [parent status mismatch / dependency contract wording inaccurate / reviewer routing drift / review timeline incomplete / support-scope violation]"
```

Owner support-only closeout after approval:

```bash
AI_NAME=Codex NO_COMMIT_REQUIRED=1 scripts/ai-status.sh done UI-CL-005-SIDECAR-REVIEW "Completed the support-only review packet for UI-CL-005 after reviewer approval. The packet freezes the UI-BE-008 dependency linkage, the UI-CL-005 reopen-to-fix timeline, and the parent closeout evidence without altering canonical truth."
```

---

Prepared by: `Codex`  
For reviewer: `Codex2`

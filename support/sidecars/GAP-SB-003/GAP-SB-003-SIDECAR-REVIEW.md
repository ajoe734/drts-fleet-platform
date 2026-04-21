# GAP-SB-003 Review Packet & Evidence Summary

**Sidecar Task:** `GAP-SB-003-SIDECAR-REVIEW`  
**Parent Task:** `GAP-SB-003`  
**Helper Kind:** `review_packet`  
**Current Owner:** `Codex2`  
**Assigned Reviewer:** `Claude`  
**Parent Owner / Reviewer:** `Claude` / `Codex2`  
**Last Revised:** `2026-04-19 (UTC)`  
**Status:** `REVIEW APPROVED; READY FOR DONE CLOSEOUT`

---

## 1. Purpose

This sidecar is support-only.

- In scope: package the parent review trail, current machine-truth snapshot, reviewer hotspots, and closeout commands.
- Out of scope: changing API/runtime behavior, editing contracts, or reopening parent implementation scope.

Important shared-truth note:

- `.orchestrator/task-briefs/GAP-SB-003.md` still says the parent is `review_approved`.
- Current machine truth in `ai-status.json` already records parent `GAP-SB-003` as `done` at commit `8a84f71`.
- This packet follows `ai-status.json` as the higher-precedence control-plane source.

---

## 2. Shared-Truth Snapshot

Using `ai-status.json` plus the recent routing entries in the activity stream, the current baseline is:

- Parent task `GAP-SB-003` is `done`.
- Parent owner / reviewer are `Claude` / `Codex2`.
- Parent closeout is recorded at commit `8a84f71` with subject:
  - `test(GAP-SB-003): add unit tests for deleteDraftPublicInfoVersion`
- Parent `next` says the finalized outcome is:
  - `DELETE /platform-admin/public-info/:versionId` endpoint implemented
  - Delete draft UI button implemented
  - targeted tests completed
- This sidecar task `GAP-SB-003-SIDECAR-REVIEW` is currently:
  - owner: `Codex2`
  - reviewer: `Claude`
  - status: `review_approved`
- Sidecar `next` says ownership was auto-reassigned from `Codex` to `Codex2` after repeated worker exits before terminal status.

Practical meaning:

- the parent task is no longer waiting on a product/code review decision
- reviewer acknowledgment on the support packet is already recorded
- the only remaining lifecycle step is owner `done` closeout with `NO_COMMIT_REQUIRED=1`
- the reviewer judged packet accuracy against current machine truth, not the stale parent task brief

---

## 3. Parent Review / Delivery Summary

The finalized parent outcome recorded in machine truth is:

- draft public-info versions can be deleted through `DELETE /api/platform-admin/public-info/:versionId`
- the delete path is draft-only
- controller and service thread verified actor identity into audit logging for delete
- the switchboard draft row exposes a task-scoped `Delete draft` action
- the shared API client exposes `deletePublicInfoVersion(versionId)`

Relevant review history that shaped the accepted scope:

1. Initial reopen findings required:
   - wiring `@CurrentIdentity()` through the delete endpoint so `delete_draft_public_info_version` audit logs no longer record `actorId=null`
   - removing unrelated switchboard changes from the GAP-SB-003 review surface
2. Re-review then confirmed:
   - delete actor attribution is wired through controller and service
   - the switchboard delete action is task-scoped
   - targeted verification passed
3. Parent was approved and later finalized in machine truth.

This sidecar does not reopen those findings. It preserves them for reviewer context.

---

## 4. Evidence Surface

| ID  | Evidence                                                        | Anchor                                                                                                                                        |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| E-1 | Parent machine-truth closeout                                   | `ai-status.json` task entry `GAP-SB-003`                                                                                                      |
| E-2 | Reopen and approval routing trail                               | `ai-status.json` handoff/activity entries around `2026-04-18T15:38:10Z` to `2026-04-19T16:07:30Z`                                             |
| E-3 | Delete endpoint requires verified identity and forwards actorId | `apps/api/src/modules/platform-admin/platform-admin.controller.ts:75`                                                                         |
| E-4 | Service enforces draft-only delete and records audit actorId    | `apps/api/src/modules/platform-admin/platform-admin.service.ts:381`                                                                           |
| E-5 | Typed client exposes DELETE route                               | `packages/api-client/src/index.ts:930`                                                                                                        |
| E-6 | Switchboard draft rows expose `Delete draft` action             | `apps/platform-admin-web/app/switchboard/page.tsx:643`                                                                                        |
| E-7 | Controller/service/client regression coverage                   | `tests/unit/platform-admin.test.ts:115`, `apps/api/tests/unit/platform-admin.service.test.ts:27`, `tests/unit/client-integration.test.ts:309` |

### 4.1 Controller / Service Anchor

`platform-admin.controller.ts` now exposes:

- `@Delete("public-info/:versionId")`
- `@CurrentIdentity()` on the delete action
- `this.requireActorId(identity)` passed into `deleteDraftPublicInfoVersion(...)`

`platform-admin.service.ts` now:

- rejects non-draft deletes with `PUBLIC_INFO_VERSION_NOT_DRAFT`
- persists `deletedPublicInfoVersionIds`
- records `delete_draft_public_info_version`
- writes `actorId: this.normalizeNullableText(deleteActorId)` into the audit payload

### 4.2 Client / UI Anchor

`packages/api-client/src/index.ts` now exposes:

- `deletePublicInfoVersion(versionId)` -> `DELETE /api/platform-admin/public-info/:versionId`

`apps/platform-admin-web/app/switchboard/page.tsx` now:

- keeps a dedicated `deletingVersionId` loading state
- calls `client.deletePublicInfoVersion(versionId)`
- renders `Delete draft` only on draft rows
- disables publish/delete buttons while the sibling mutation is active

### 4.3 Regression Coverage Anchor

The accepted verification surface is:

- `tests/unit/platform-admin.test.ts`
  - controller forwards verified actorId to delete-draft service call
- `apps/api/tests/unit/platform-admin.service.test.ts`
  - draft delete succeeds, persists removal, and records actorId in the audit log
  - published version delete is rejected
- `tests/unit/client-integration.test.ts`
  - typed client targets `/api/platform-admin/public-info/:versionId` with `DELETE`

---

## 5. Scope Caveat For Reviewer

The shared working tree still contains unrelated parallel switchboard changes for neighboring tasks, including files such as:

- `apps/platform-admin-web/app/switchboard/placard-source.ts`
- `apps/platform-admin-web/app/switchboard/placard-version-code.ts`
- additional switchboard logic for placard/source/version-code behavior

Reviewer `Claude` should evaluate this packet against the parent machine-truth closeout and the delete-flow evidence anchors above, not assume the whole current `switchboard/page.tsx` diff belongs to GAP-SB-003.

Put differently:

- GAP-SB-003 parent truth is already closed
- this packet documents the accepted delete-flow scope
- neighboring switchboard work belongs to other task IDs unless the parent owner explicitly absorbs it elsewhere

---

## 6. Reviewer Focus

Reviewer `Claude` should confirm:

1. This packet stays support-only and does not mutate canonical truth.
2. It correctly notes that parent `GAP-SB-003` is already `done` in `ai-status.json`, even though the task brief still says `review_approved`.
3. The packet preserves the two substantive review findings:
   - delete audit actor attribution had to be fixed
   - the switchboard patch had to be re-scoped to the delete flow
4. The final evidence anchors actually show the accepted delete-flow surface:
   - controller identity threading
   - service draft-only guard + audit actor
   - typed client delete method
   - UI delete button
   - targeted tests
5. The packet clearly separates current shared-worktree noise from the already-closed parent outcome.

Suggested approval wording:

> `審查通過：GAP-SB-003 sidecar review packet 已對齊最新 machine truth（parent GAP-SB-003 在 ai-status.json 已是 done，commit 8a84f71；task brief 的 review_approved 已過時），並正確保留 reopen->approve->finalize 的關鍵結論：DELETE draft flow 已補上 verified actorId audit attribution、switchboard review 面已收斂到 task-scoped Delete draft action、typed client DELETE route 與 targeted tests 均有錨點。support artifact only；可回到 owner（Codex2）以 NO_COMMIT_REQUIRED=1 做 done closeout。`

Suggested reopen wording:

> `packet needs refresh: [machine-truth mismatch / stale parent status / wrong evidence anchor / support-scope violation]`

---

## 7. Handoff / Review / Closeout Commands

Owner handoff to Claude:

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff GAP-SB-003-SIDECAR-REVIEW Claude "GAP-SB-003 sidecar review packet is ready at support/sidecars/GAP-SB-003/GAP-SB-003-SIDECAR-REVIEW.md. It matches current machine truth: parent GAP-SB-003 is already done at commit 8a84f71 even though the older task brief still says review_approved, and this support-only packet preserves the accepted delete-draft review trail (verified actorId audit attribution, task-scoped Delete draft UI/client surface, and targeted controller/service/client test anchors) without changing canonical truth."
```

Reviewer approval:

```bash
AI_NAME=Claude \
REVIEW_FILE=support/sidecars/GAP-SB-003/GAP-SB-003-SIDECAR-REVIEW.md \
REVIEW_NOTES_ZH='審查通過：GAP-SB-003 sidecar review packet 已對齊最新 machine truth（parent GAP-SB-003 在 ai-status.json 已是 done，commit 8a84f71；task brief 的 review_approved 已過時），並正確保留 reopen->approve->finalize 的關鍵結論：DELETE draft flow 已補上 verified actorId audit attribution、switchboard review 面已收斂到 task-scoped Delete draft action、typed client DELETE route 與 targeted tests 均有錨點。support artifact only。|回到 owner（Codex2）以 NO_COMMIT_REQUIRED=1 做 done closeout。' \
python3 scripts/ai_status.py approve GAP-SB-003-SIDECAR-REVIEW \
  "Review approved. The packet matches the current parent done snapshot, preserves the accepted delete-flow review findings, and keeps unrelated switchboard work explicitly out of scope."
```

Reviewer reopen:

```bash
AI_NAME=Claude python3 scripts/ai_status.py reopen GAP-SB-003-SIDECAR-REVIEW \
  "packet needs refresh: [machine-truth mismatch / stale parent status / wrong evidence anchor / support-scope violation]"
```

Owner closeout after approval:

```bash
AI_NAME=Codex2 NO_COMMIT_REQUIRED=1 python3 scripts/ai_status.py done GAP-SB-003-SIDECAR-REVIEW \
  "Done: GAP-SB-003 sidecar review packet recorded the parent done snapshot at commit 8a84f71, preserved the delete-draft actor-attribution and task-scope review trail, and handed off the support-only reviewer packet without changing canonical truth."
```

---

## 8. Change Log

- 2026-04-19 - Initial sidecar packet created after repeated worker exits left the helper task without its required support artifact.
- 2026-04-19 - Packet aligned to current machine truth where parent `GAP-SB-003` is already `done`, and the stale `review_approved` task-brief snapshot is explicitly called out as superseded.
- 2026-04-19 - Reviewer approval recorded; lifecycle wording updated so the packet now reflects `review_approved` and pending owner closeout.

---

_This document is a support artifact only. It does not alter `ai-status.json`, `current-work.md`, L1 canonical truth, or the parent GAP-SB-003 runtime implementation._

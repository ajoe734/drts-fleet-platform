# BUG-002 Review Packet & Evidence Summary

**Sidecar Task:** `BUG-002-SIDECAR-REVIEW`  
**Parent Task:** `BUG-002`  
**Helper Kind:** `review_packet`  
**Current Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Codex2` / `Codex`  
**Last Revised:** `2026-04-17 (UTC)`  
**Status:** `REVIEW-APPROVED SUPPORT ARTIFACT — parent BUG-002 is already done; sidecar BUG-002-SIDECAR-REVIEW is approved and awaiting owner closeout`

---

## 1. Scope Boundary

This sidecar is support-only.

- In scope: review packet, evidence summary, reviewer hotspots, handoff commands.
- Out of scope: canonical truth edits, runtime behavior changes, contract/governance updates, or reopening the parent fix semantics.

The only shared truth used here is:

- `ai-status.json`
- `current-work.md`
- `ai-activity-log.jsonl`
- `docs-site/index.html`

---

## 2. Shared-Truth Snapshot

Using the shared files above, the current machine-truth baseline is:

- Parent task `BUG-002` is `done`.
- Parent owner / reviewer are `Codex2` / `Codex`.
- Parent commit metadata is already recorded:
  - commit: `17f88955ffa0dc414841591be1d4327d840e1ff6`
  - subject: `fix(BUG-002): require explicit dispatch trigger in E2E-001`
- Parent acceptance remains exactly:
  - `E2E-001 的 dispatch/tasks poll 在 booking 建立後能拿到至少一筆 dispatch job`
  - `修正方向記錄在 sidecar evidence 中（test fix vs service auto-dispatch）`
- Parent `next` explicitly says the final fix was:
  - `E2E-001` now performs `POST /orders/:orderId/dispatch` before polling `dispatch/tasks`
  - regression coverage keeps reservation bookings behind an explicit dispatch step
  - evidence is recorded in `support/sidecars/BUG-002/BUG-002-DISPATCH-SEMANTICS-EVIDENCE.md`
- This sidecar task `BUG-002-SIDECAR-REVIEW` is currently `review_approved`, owner `Codex2`, reviewer `Codex`.
- `ai-activity-log.jsonl` records the routing trail for this sidecar:
  - `2026-04-17T00:49:22Z` Qwen worker started on `owned_ready_dispatch`
  - `2026-04-17T00:49:36Z` task auto-reassigned from `Qwen` back to `Codex2` after repeated `401 invalid access token or token expired`
  - `2026-04-17T00:51:54Z` task was briefly rebalanced to `Codex`
  - `2026-04-17T00:52:14Z` ownership returned to `Codex2`
  - `2026-04-17T00:52:17Z` current `Codex2` worker was started for `owned_ready_dispatch`
  - `2026-04-17T00:54:12Z` `Codex2` recorded the reviewer handoff to `Codex`
  - `2026-04-17T00:54:14Z` Orchestrator queued `review_ready_dispatch` and started the reviewer worker for `Codex`
  - `2026-04-17T00:56:33Z` `Codex` recorded `review_approved`
  - `2026-04-17T00:56:36Z` Orchestrator queued `owned_finalize_dispatch` back to owner `Codex2`
- `docs-site/index.html` is only the dashboard shell and contributes no conflicting task truth.

Practical meaning:

- the parent bug is already closed and should not be re-scoped here
- the sidecar review should only verify the evidence chain and the decision rationale
- the review step is complete and only owner closeout remains
- the review packet must stay consistent with the already-recorded parent closeout

---

## 3. Parent Fix Summary

`BUG-002` resolved an incorrect E2E assumption, not a runtime dispatch contract gap.

The closed parent position is:

- enterprise reservation bookings created through `POST /tenant/bookings` do **not** auto-enter the dispatch queue on create
- `E2E-001` must explicitly trigger dispatch through `POST /orders/:orderId/dispatch`
- reservation semantics in owned mobility remain unchanged

That position matches the current code anchors:

- [`tests/e2e/E2E-001-enterprise-dispatch.sh`](/home/edna/workspace/drts-fleet-platform/tests/e2e/E2E-001-enterprise-dispatch.sh:73) reads back `orderId` after booking creation
- [`tests/e2e/E2E-001-enterprise-dispatch.sh`](/home/edna/workspace/drts-fleet-platform/tests/e2e/E2E-001-enterprise-dispatch.sh:96) explicitly calls `POST /orders/:orderId/dispatch`
- [`tests/e2e/E2E-001-enterprise-dispatch.sh`](/home/edna/workspace/drts-fleet-platform/tests/e2e/E2E-001-enterprise-dispatch.sh:118) only then polls `/dispatch/tasks` for the matching `orderId`
- [`tests/unit/owned-mobility.test.ts`](/home/edna/workspace/drts-fleet-platform/tests/unit/owned-mobility.test.ts:378) locks the regression: reservation bookings require an explicit dispatch step before appearing in `listDispatchJobs()`
- [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:418) still creates tenant bookings with `dispatchSemantics: "reservation"` and status `created`
- [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:779) still generates dispatch jobs only when `dispatchOrder()` is explicitly invoked

---

## 4. Evidence Inventory

| ID  | Evidence                                        | Anchor                                                            |
| --- | ----------------------------------------------- | ----------------------------------------------------------------- |
| E-1 | Parent machine-truth closeout                   | `ai-status.json`, `current-work.md`                               |
| E-2 | Decision memo: test fix vs auto-dispatch        | `support/sidecars/BUG-002/BUG-002-DISPATCH-SEMANTICS-EVIDENCE.md` |
| E-3 | E2E trigger step and queue poll ordering        | `tests/e2e/E2E-001-enterprise-dispatch.sh`                        |
| E-4 | Regression lock for explicit dispatch semantics | `tests/unit/owned-mobility.test.ts`                               |
| E-5 | Runtime reservation semantics anchor            | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`   |
| E-6 | Sidecar routing / reassignment trail            | `ai-activity-log.jsonl`                                           |

---

## 5. Reviewer Hotspots

Reviewer `Codex` should confirm:

1. This packet stays support-only and does not reinterpret parent scope.
2. The packet correctly states that parent `BUG-002` is already `done`, while sidecar `BUG-002-SIDECAR-REVIEW` is the item sitting in `review`.
3. The evidence chain consistently supports the same decision: fix the E2E harness, do not auto-dispatch on booking creation.
4. The E2E script now reads back `orderId`, triggers dispatch explicitly, and only then polls the queue.
5. The unit regression proves the queue remains empty before `dispatchOrder()` and populated after it.
6. The runtime anchor still reflects reservation semantics, so the parent fix did not mutate Phase 1 dispatch contract truth.
7. The routing trail includes the final `2026-04-17T00:54:12Z` owner handoff and `2026-04-17T00:54:14Z` reviewer dispatch.

Suggested approval wording:

> `審查通過：BUG-002 sidecar review packet 已正確對齊 shared truth（parent BUG-002=done、sidecar BUG-002-SIDECAR-REVIEW=review，owner handoff 2026-04-17T00:54:12Z，review_ready_dispatch 00:54:14Z），並清楚彙整 test-fix vs auto-dispatch 的既定結論、E2E-001 顯式 POST /orders/:orderId/dispatch 錨點、reservation queue regression 鎖點，以及 sidecar 改派軌跡；support artifact only，未改 canonical truth。回到 owner（Codex2）以 NO_COMMIT_REQUIRED=1 做 done closeout。`

Suggested reopen wording:

> `packet needs refresh: [machine-truth mismatch / stale evidence anchor / routing mismatch / support-scope violation]`

---

## 6. Handoff / Review / Closeout Commands

Current queue state already has the owner handoff recorded; the commands below remain the rerunnable reference.

Owner handoff to reviewer:

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff BUG-002-SIDECAR-REVIEW Codex "BUG-002 sidecar review packet is ready at support/sidecars/BUG-002/BUG-002-SIDECAR-REVIEW.md. It matches current shared truth: parent BUG-002 is already done at commit 17f88955 with the explicit-dispatch E2E correction, the decision memo remains support/sidecars/BUG-002/BUG-002-DISPATCH-SEMANTICS-EVIDENCE.md, and this packet summarizes the reviewer hotspots, routing trail, and evidence anchors without changing canonical truth."
```

Reviewer approval:

```bash
AI_NAME=Codex \
REVIEW_FILE=support/sidecars/BUG-002/BUG-002-SIDECAR-REVIEW.md \
REVIEW_NOTES_ZH='審查通過：BUG-002 sidecar review packet 已正確對齊 shared truth（parent BUG-002=done, commit 17f88955），並清楚彙整 test-fix vs auto-dispatch 的既定結論、E2E-001 顯式 POST /orders/:orderId/dispatch 錨點、reservation queue regression 鎖點，以及 sidecar 改派軌跡；support artifact only，未改 canonical truth。|回到 owner（Codex2）以 NO_COMMIT_REQUIRED=1 做 done closeout。' \
python3 scripts/ai_status.py approve BUG-002-SIDECAR-REVIEW \
  "Review approved. The packet matches the closed BUG-002 machine truth, the explicit-dispatch evidence chain, and the sidecar routing history without changing canonical truth."
```

Reviewer reopen:

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen BUG-002-SIDECAR-REVIEW \
  "packet needs refresh: [machine-truth mismatch / stale evidence anchor / routing mismatch / support-scope violation]"
```

Owner closeout after approval:

```bash
AI_NAME=Codex2 NO_COMMIT_REQUIRED=1 python3 scripts/ai_status.py done BUG-002-SIDECAR-REVIEW \
  "Done: BUG-002 sidecar review packet recorded the closed parent evidence chain, the explicit-dispatch decision rationale, the E2E and regression anchors, and the support-only reviewer handoff without changing canonical truth."
```

---

## 7. Change Log

- 2026-04-17 - Initial packet created for `BUG-002-SIDECAR-REVIEW` after shared-truth confirmation that parent `BUG-002` was already done.
- 2026-04-17 - Packet anchored reviewer attention to the closed explicit-dispatch decision, the E2E trigger step, the reservation queue regression test, and the sidecar reassignment trail.
- 2026-04-17 - Packet refreshed to match the current `review` state, including the final `00:54:12Z` owner handoff and `00:54:14Z` reviewer dispatch events.
- 2026-04-17 - Packet refreshed again after reviewer approval so the support artifact now reflects `review_approved` plus the `00:56:33Z` approval and `00:56:36Z` owner-finalize dispatch.

# TEST-DISPATCH-PROBE-20260625 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `TEST-DISPATCH-PROBE-20260625` — Supervisor/auto-worker dispatch health probe  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Claude`  
**Parent Owner:** `Claude` (reviewer `Claude2`)  
**Sidecar Task ID:** `TEST-DISPATCH-PROBE-20260625-SIDECAR-ACCEPTANCE`  
**Last Revised:** `2026-06-25T14:49:04Z (UTC)`  
**Status:** `ready_for_handoff`

---

## 1) Scope Boundary

本 sidecar 只整理 `TEST-DISPATCH-PROBE-20260625` 的 acceptance checklist、dependency map 與 reviewer handoff packet；不改 canonical truth，也不代替 parent 任務實作任何 supervisor / runtime / governance 變更。

- **In scope:** support-only packet、machine-truth 切片摘要、依賴與交接關係圖、reviewer checklist、evidence anchors。
- **Out of scope:** 修改 `ai-status.json` 結構、改寫 parent task 定義、變更 `.orchestrator/` 邏輯、變更 `docs/**` canonical 材料、補寫不存在於 machine truth 的 parent acceptance。
- 本檔是 advisory support artifact；是否吸收進主線由 parent owner `Claude` 決定。

---

## 2) Machine-Truth Snapshot

以下內容以 `scripts/ai-status.sh show` 於 `2026-06-25T14:48Z` 左右讀取的切片為準：

### Parent task: `TEST-DISPATCH-PROBE-20260625`

- `status=backlog`
- `owner=Claude`
- `reviewer=Claude2`
- `depends_on=[]`
- `artifacts=[]`
- `acceptance=[]`
- `next="Assignment created"`

### Sidecar task: `TEST-DISPATCH-PROBE-20260625-SIDECAR-ACCEPTANCE`

- `status=in_progress`
- `owner=Codex`
- `reviewer=Claude`
- `depends_on=[]`
- artifact target:
  `support/sidecars/TEST-DISPATCH-PROBE-20260625/TEST-DISPATCH-PROBE-20260625-SIDECAR-ACCEPTANCE.md`
- acceptance (from machine truth):
  1. `Create support artifacts only`
  2. `Do not edit canonical truth`
  3. `Hand off the packet to the assigned reviewer`

**Interpretation:** parent task 目前沒有額外 recorded acceptance / artifacts / dependencies；因此本 packet 不能替 parent 發明新的產品語意，只能把 sidecar 本身的 support deliverable 做完整並交給 reviewer。

---

## 3) Dependency Map

Machine truth 對 parent 與 sidecar 都記錄為 `depends_on=[]`。目前沒有 upstream blockers，也沒有已登記的 downstream task 依賴這份 packet。

```text
TEST-DISPATCH-PROBE-20260625
  status: backlog
  owner: Claude
  reviewer: Claude2
  depends_on: []
        |
        | helper_parent / support-only advisory
        v
TEST-DISPATCH-PROBE-20260625-SIDECAR-ACCEPTANCE
  status: in_progress
  owner: Codex
  reviewer: Claude
  depends_on: []
        |
        | produces
        v
support/sidecars/TEST-DISPATCH-PROBE-20260625/
  TEST-DISPATCH-PROBE-20260625-SIDECAR-ACCEPTANCE.md
```

### Dependency notes

- **Recorded task dependencies:** none.
- **Operational dependency:** owner `Codex` must hand this packet to reviewer `Claude` through `scripts/ai-status.sh handoff ...`.
- **Integration dependency:** none; `INTEGRATION_STATUS=not_applicable` for this sidecar because it creates support material only.
- **Canonical truth dependency:** machine-truth status changes must still flow through `scripts/ai-status.sh` / `python3 scripts/ai_status.py`, not manual edits.

---

## 4) Owner-Side Acceptance Checklist

This checklist expands the sidecar acceptance already present in machine truth. It does not add product semantics to the parent task.

| # | Owner acceptance item | Status | Evidence target |
| --- | --- | --- | --- |
| 1 | Support artifact exists at the exact recorded artifact path | PASS | This file at `support/sidecars/TEST-DISPATCH-PROBE-20260625/TEST-DISPATCH-PROBE-20260625-SIDECAR-ACCEPTANCE.md` |
| 2 | Packet stays support-only and does not edit canonical truth | PASS | Repo diff limited to this sidecar artifact; no L1/L2/runtime/governance files touched |
| 3 | Dependency map is recorded without inventing nonexistent blockers | PASS | `depends_on=[]` preserved for both parent and sidecar; helper-parent relationship documented only as advisory context |
| 4 | Reviewer handoff instructions are included for the assigned reviewer | PASS | See §6 reviewer checklist and §8 handoff |

**Owner close condition:** after branch commit + push, record `handoff` to reviewer `Claude` with a concise verification summary.

---

## 5) Readiness Summary

| Gate | Status | Notes |
| --- | --- | --- |
| Support packet drafted | READY | This file captures scope, dependencies, checklist, and reviewer instructions |
| Canonical truth preserved | READY | No canonical product/runtime files are part of this sidecar |
| Reviewer route clear | READY | Assigned reviewer is `Claude`; sidecar should move from `in_progress` to `review` via `handoff` |
| Parent task semantic expansion | BLOCKED BY DESIGN | Parent task has no recorded acceptance/artifacts yet; this packet intentionally does not invent them |

---

## 6) Reviewer Checklist (`Claude`)

- [ ] Confirm the diff is limited to `support/sidecars/TEST-DISPATCH-PROBE-20260625/TEST-DISPATCH-PROBE-20260625-SIDECAR-ACCEPTANCE.md`.
- [ ] Confirm §2 matches `scripts/ai-status.sh show TEST-DISPATCH-PROBE-20260625` and `... show TEST-DISPATCH-PROBE-20260625-SIDECAR-ACCEPTANCE`.
- [ ] Confirm §3 keeps `depends_on=[]` and does not fabricate upstream/downstream blockers.
- [ ] Confirm the packet does not change canonical truth and does not claim the parent probe itself is complete.
- [ ] Approve with `AI_NAME=Claude scripts/ai-status.sh approve TEST-DISPATCH-PROBE-20260625-SIDECAR-ACCEPTANCE "<review conclusion>"` if accurate; otherwise `reopen` or `blocker`.

---

## 7) Evidence Anchors

- Machine truth, parent:
  `AI_NAME=Codex scripts/ai-status.sh show TEST-DISPATCH-PROBE-20260625`
- Machine truth, sidecar:
  `AI_NAME=Codex scripts/ai-status.sh show TEST-DISPATCH-PROBE-20260625-SIDECAR-ACCEPTANCE`
- Artifact existence:
  `test -f support/sidecars/TEST-DISPATCH-PROBE-20260625/TEST-DISPATCH-PROBE-20260625-SIDECAR-ACCEPTANCE.md`
- Section presence:
  `grep -n '^## ' support/sidecars/TEST-DISPATCH-PROBE-20260625/TEST-DISPATCH-PROBE-20260625-SIDECAR-ACCEPTANCE.md`
- Diff scope:
  `git status --short`
  `git diff -- support/sidecars/TEST-DISPATCH-PROBE-20260625/TEST-DISPATCH-PROBE-20260625-SIDECAR-ACCEPTANCE.md`

---

## 8) Handoff

- Owner `Codex` should hand this packet to reviewer `Claude` after creating a task-scoped branch commit and normal push.
- Reviewer approval closes the sidecar review lane only; it does **not** imply the parent `TEST-DISPATCH-PROBE-20260625` probe is implemented or done.
- Recommended owner handoff summary:
  `Support-only acceptance packet created at recorded artifact path; dependency map confirms no recorded depends_on edges; diff limited to sidecar artifact; INTEGRATION_STATUS=not_applicable.`

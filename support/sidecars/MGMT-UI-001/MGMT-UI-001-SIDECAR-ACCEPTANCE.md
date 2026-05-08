# MGMT-UI-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `MGMT-UI-001` - Shared Desktop Management Primitive Alignment  
**Prepared By:** `Codex2`  
**Sidecar Reviewer:** `Gemini2`  
**Generated:** `2026-05-08` (UTC)  
**Status:** `REVIEW APPROVED SUPPORT ARTIFACT` - parent `MGMT-UI-001` is already `done` in machine truth, and this sidecar remains support-only with no canonical truth or runtime changes.

---

## 1) Scope Boundary

本 sidecar 只整理 `MGMT-UI-001` 的 acceptance framing、dependency map、repo evidence anchors、以及 closeout packet。它不修改 L1 canonical truth，也不代替 parent 任務改寫 Platform Admin / Ops Console 頁面。

- In scope: support packet, parent acceptance framing, formal dependency map, downstream impact summary, repo evidence anchors, closeout references.
- Out of scope: canonical truth edits, runtime code changes, design-source reinterpretation, or downstream page-family implementation.

---

## 2) Current Machine-Truth Baseline

### Parent task: `MGMT-UI-001`

Source: `ai-status.json`

- status=`done`
- owner=`Codex2`
- reviewer=`Codex`
- depends_on=`[]`
- artifact=`packages/ui-web/src/index.tsx`
- acceptance:
  - `pnpm --filter @drts/ui-web typecheck`
  - `pnpm --filter @drts/platform-admin-web typecheck`
  - `pnpm --filter @drts/ops-console-web typecheck`
- commit_hash=`c9a51fd3c6cfd7ddc5c3d290dd4cbeae2be27833`
- commit_subject=`MGMT-UI-001 Extract shared management primitives`
- push_ref=`origin/codex/dev-deploy-backend-android`

Interpretation:

- `MGMT-UI-001` is already closed as the shared primitive baseline.
- This packet does not reopen or redefine the parent task.

### Sidecar task: `MGMT-UI-001-SIDECAR-ACCEPTANCE`

Source: `ai-status.json`

- status=`review_approved`
- owner=`Codex2`
- reviewer=`Gemini2`
- helper_parent=`MGMT-UI-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/MGMT-UI-001/MGMT-UI-001-SIDECAR-ACCEPTANCE.md`

Interpretation:

- Reviewer approval is complete.
- Remaining owner work is formal closeout: preserve the support artifact, create the task-scoped commit, push normally, then mark the task `done`.

---

## 3) Parent Acceptance Frame

The parent task's formal acceptance remains exactly what machine truth records:

| Parent acceptance                                  | Evidence anchors                                                                                    | Acceptance meaning                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm --filter @drts/ui-web typecheck`             | `packages/ui-web/src/index.tsx` and the shared management primitive exports under `packages/ui-web` | The shared primitive surface compiles as a package-level API.       |
| `pnpm --filter @drts/platform-admin-web typecheck` | existing Platform Admin consumers of `@drts/ui-web`                                                 | The shared package change did not break platform-admin compilation. |
| `pnpm --filter @drts/ops-console-web typecheck`    | existing Ops Console consumers of `@drts/ui-web`                                                    | The shared package change did not break ops-console compilation.    |

Acceptance interpretation notes:

1. `MGMT-UI-001` is a foundation slice, not a page rewrite slice.
2. Parent completion means the shared desktop-management primitive layer landed and passed the three recorded typecheck gates.
3. Downstream page materialization remains the responsibility of dependent tasks such as `ADM-UI-*` and `OPS-UI-*`.

---

## 4) Dependency Map

### Formal upstream dependencies

`MGMT-UI-001.depends_on=[]`

- formal prerequisite: none
- implication: the parent task was allowed to land directly as the primitive baseline

### Formal downstream tasks that depend on `MGMT-UI-001`

The following tasks currently declare `MGMT-UI-001` as a dependency in machine truth:

| Task         | Why it depends on `MGMT-UI-001`                                             |
| ------------ | --------------------------------------------------------------------------- |
| `ADM-UI-002` | Needs shared dense management-shell, header, filter, and status primitives. |
| `ADM-UI-003` | Needs shared KPI, workflow, detail-list, and status patterns.               |
| `ADM-UI-004` | Needs shared governance-surface density and authority-safe status patterns. |
| `OPS-UI-002` | Needs shared dashboard, dispatch, timeline, and status primitives.          |
| `OPS-UI-003` | Needs shared incident/callcenter workflow and metadata patterns.            |
| `OPS-UI-004` | Needs shared reporting KPI, filter, and dense-table primitives.             |
| `OPS-UI-005` | Needs shared registry/detail/status primitives.                             |

### Ordering guidance vs. formal blockers

The execution packet also treats `MGMT-UI-001` as the already-landed primitive baseline for the wider management-console rollout. That rollout ordering is guidance for downstream work; it is not an extra upstream dependency added to this sidecar.

Normative sources:

- `ai-status.json`
- `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`
- `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`

---

## 5) Evidence Anchors

Support reviewers or parent owners can use these anchors to trace the accepted baseline without treating this packet as canonical truth:

- `ai-status.json -> MGMT-UI-001`
- `ai-status.json -> MGMT-UI-001-SIDECAR-ACCEPTANCE`
- `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`
- `packages/ui-web/src/index.tsx`
- `support/sidecars/MGMT-UI-001/MGMT-UI-001-SIDECAR-REVIEW.md`

Parent closeout evidence already recorded in machine truth:

- commit subject `MGMT-UI-001 Extract shared management primitives`
- commit hash `c9a51fd3c6cfd7ddc5c3d290dd4cbeae2be27833`
- push target `origin/codex/dev-deploy-backend-android`

---

## 6) Sidecar Acceptance Checklist

- [x] Create support artifacts only.
- [x] Do not edit canonical truth.
- [x] Hand off the packet to the assigned reviewer.
- [x] Keep the dependency map aligned with current machine truth.
- [x] Keep the packet scoped to support-only acceptance framing and closeout evidence.

---

## 7) Notes

- No upstream blockers are recorded for `MGMT-UI-001`.
- The parent task is already `done`; this packet exists only to preserve acceptance framing and downstream dependency visibility.
- This artifact does not claim ownership over any runtime file outside the support path.

---

## 8) Change Log

- `2026-05-08T14:31:41Z` - Initial support-only acceptance packet created for `MGMT-UI-001`.
- `2026-05-08T15:07:52Z` - Sidecar reviewer advanced `MGMT-UI-001-SIDECAR-ACCEPTANCE` to `review_approved`.
- `2026-05-08T15:12:37Z` - Packet refreshed by `Codex2` to match current machine truth: parent=`done`, sidecar=`review_approved`, with preserved support-only dependency mapping.

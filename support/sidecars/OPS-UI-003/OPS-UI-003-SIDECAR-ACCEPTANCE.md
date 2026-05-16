# OPS-UI-003 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `OPS-UI-003` - Ops Callcenter Complaints And Incident Workflow Materialization
**Prepared By:** `Codex2`
**Generated:** `2026-05-08` (UTC)
**Status:** `SUPPORT-ONLY ACCEPTANCE PACKET` - parent `OPS-UI-003` is already `done` in machine truth with commit and push evidence recorded; this packet remains support-only with no canonical truth or runtime changes. Live sidecar task state is authoritative in `ai-status.json`.

---

## 1) Scope Boundary

本 sidecar 只整理 `OPS-UI-003` 的 acceptance framing、dependency map、repo evidence anchors、以及 reviewer handoff packet。它不改寫 L1 canonical truth，也不代替 parent 任務修改 `apps/ops-console-web` 的主線實作。

- In scope: support packet, parent acceptance framing, formal dependency map, evidence anchors, downstream impact notes, reviewer handoff summary.
- Out of scope: canonical truth edits, runtime code changes, design reinterpretation, or approval on behalf of the assigned reviewer.

---

## 2) Current Machine-Truth Baseline

### Parent task: `OPS-UI-003`

Source: `ai-status.json`

- status=`done`
- owner=`Codex2`
- reviewer=`Codex`
- depends_on=`MGMT-UI-001`, `MGMT-UI-003`, `MGMT-UI-004`, `MGMT-UI-005`
- artifacts:
  - `apps/ops-console-web/app/callcenter/page.tsx`
  - `apps/ops-console-web/app/complaints/page.tsx`
  - `apps/ops-console-web/app/incidents/page.tsx`
- acceptance:
  - `pnpm --filter @drts/ops-console-web typecheck`
- closeout evidence recorded in machine truth at `2026-05-08T21:01:57Z`:
  - verification:
    - `pnpm --filter @drts/ops-console-web typecheck PASS`
    - `git diff --check -- apps/ops-console-web/app/callcenter/page.tsx apps/ops-console-web/app/complaints/page.tsx apps/ops-console-web/app/incidents/page.tsx PASS`
  - commit:
    - hash=`f7a9bc1f3fda6baf3b4b0c3ca3ce10e9bfef14d1`
    - subject=`OPS-UI-003 Materialize ops incident workflow pages`
  - push:
    - remote=`origin`
    - branch=`codex/dev-deploy-backend-android`
    - ref=`origin/codex/dev-deploy-backend-android`

Interpretation:

- The parent task is no longer awaiting review; it is already closed as `done` in machine truth.
- This sidecar packet is support material that summarizes the parent acceptance story and dependency posture after the parent closeout was recorded.

### Sidecar task: `OPS-UI-003-SIDECAR-ACCEPTANCE`

Source: `ai-status.json`

- owner=`Codex2`
- helper_parent=`OPS-UI-003`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/OPS-UI-003/OPS-UI-003-SIDECAR-ACCEPTANCE.md`

Interpretation:

- The sidecar exists only to support review and acceptance clarity.
- This packet intentionally does not restate the sidecar's transient live status or owner note, because those fields change across `progress`, `handoff`, `reopen`, and `approve` transitions.
- Readers should treat `ai-status.json -> OPS-UI-003-SIDECAR-ACCEPTANCE` as the only live source for the sidecar's current owner, reviewer, status, latest note, and last-update timestamp.
- Historical lifecycle checkpoints are preserved only in the change log below so the reviewer can trace why this refresh exists.

---

## 3) Parent Acceptance Frame

The parent task's formal acceptance remains exactly what machine truth records:

| Parent acceptance                               | Evidence anchors                                                                                                                              | Acceptance meaning                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm --filter @drts/ops-console-web typecheck` | `apps/ops-console-web/app/callcenter/page.tsx`, `apps/ops-console-web/app/complaints/page.tsx`, `apps/ops-console-web/app/incidents/page.tsx` | The three operational workflow pages compile together under the current Ops Console surface. |

Acceptance interpretation notes:

1. `OPS-UI-003` is a workflow-depth page materialization slice, not a shared-foundation slice.
2. Parent closeout evidence shows the slice passed its formal typecheck gate and the target page files were whitespace-clean at handoff time.
3. The recorded closeout note explicitly preserves the final complaint-to-incident and incident-to-complaint deep-link behavior as part of the reviewer-facing acceptance story.

---

## 4) Dependency Map

### Formal upstream dependencies

The parent task depends on four already-landed shared-management tasks:

| Dependency    | Machine-truth status | Why it matters to `OPS-UI-003`                                                                               |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `MGMT-UI-001` | `done`               | Provides shared management primitives used across the dense ops workflow pages.                              |
| `MGMT-UI-003` | `done`               | Provides shared shell and surface-token hardening needed for management-console parity.                      |
| `MGMT-UI-004` | `done`               | Provides shared table, filter, and status-system patterns used in complaint and incident queues.             |
| `MGMT-UI-005` | `done`               | Provides stepper, timeline, and detail metadata patterns used in incident recovery and case-detail surfaces. |

Interpretation:

- No upstream dependency remains open in machine truth.
- Reviewer attention can stay on workflow correctness and design alignment rather than prerequisite readiness.

### Formal downstream tasks that depend on `OPS-UI-003`

The following tasks currently declare `OPS-UI-003` as an upstream dependency in machine truth:

| Task          | Status    | Why it depends on `OPS-UI-003`                                                                                   |
| ------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| `MGMT-UI-002` | `todo`    | The management-console verification packet needs this workflow slice closed to assemble route-by-route evidence. |
| `OPS-UI-008`  | `backlog` | Callcenter session workspace hardening extends the callcenter patterns established by this task.                 |

### Ordering guidance vs. formal blockers

The execution packet positions `OPS-UI-003` as part of the Ops Console workflow-depth rollout, but the only formal blockers are the dependencies recorded in `ai-status.json`. This sidecar does not introduce extra prerequisites beyond machine truth.

Normative sources:

- `ai-status.json`
- `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`
- `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`

---

## 5) Reviewer Evidence Anchors

Support reviewers or the parent reviewer can use these anchors to validate the handoff without treating this packet as canonical truth:

- `ai-status.json -> OPS-UI-003`
- `ai-status.json -> OPS-UI-003-SIDECAR-ACCEPTANCE`
- `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`
- `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
- `apps/ops-console-web/app/callcenter/page.tsx`
- `apps/ops-console-web/app/complaints/page.tsx`
- `apps/ops-console-web/app/incidents/page.tsx`

Reviewer-focused implementation checkpoints based on the parent brief and recorded closeout:

- `callcenter/page.tsx` should present the session-workspace framing rather than a flat intake list.
- `complaints/page.tsx` should prioritize SLA, escalation, and complaint-to-incident linking.
- `incidents/page.tsx` should reflect service-recovery workflow and preserve linked complaint navigation.
- Cross-workspace deep-link behavior should follow the linked record identifier instead of opening a default list state.

---

## 6) Sidecar Acceptance Checklist

- [x] Create support artifacts only.
- [x] Do not edit canonical truth.
- [x] Keep the packet scoped to acceptance framing, dependency mapping, and reviewer support.
- [x] Keep the dependency map aligned with current machine truth.
- [x] Refresh the packet to reflect parent `done` state and recorded closeout evidence.
- [x] Record sidecar handoff and review lifecycle in the packet while treating `ai-status.json` as the live status source.

---

## 7) Handoff Notes For The Assigned Reviewer

- Parent `OPS-UI-003` is already `done`; this sidecar is a support packet for auditability, not a gate on parent closure.
- All formal upstream dependencies for `OPS-UI-003` are `done`.
- Parent closeout evidence was recorded at `2026-05-08T21:01:57Z` with commit `f7a9bc1f3fda6baf3b4b0c3ca3ce10e9bfef14d1` pushed to `origin/codex/dev-deploy-backend-android`.
- Immediate downstream impact is limited to the verification packet (`MGMT-UI-002`) and follow-on callcenter hardening (`OPS-UI-008`).
- Current machine-truth sidecar reviewer is `Claude2` after the `2026-05-08T22:45:40Z` availability-first reassignment.
- This refresh removes transient sidecar-state snapshots from the header and baseline sections so future reviewer handoffs do not go stale when `ai-status.json` advances.

---

## 8) Change Log

- `2026-05-08T20:57:22Z` - Sidecar task moved to `in_progress` in machine truth by `Codex2`.
- `2026-05-08T21:00:00Z` - Initial support-only acceptance packet created for `OPS-UI-003` with parent acceptance framing, dependency map, and reviewer evidence anchors.
- `2026-05-08T22:26:09Z` - Owner note refreshed in machine truth to align this sidecar with the stale-packet review failure.
- `2026-05-08T22:27:21Z` - Packet refreshed against current `ai-status.json`: parent baseline updated from `review` to `done`, parent closeout commit/push evidence added, sidecar checklist corrected, and trailing whitespace removed.
- `2026-05-08T22:27:46Z` - Refreshed packet was handed off to `Codex` and the sidecar entered `review`.
- `2026-05-08T22:30:53Z` - Reviewer returned the sidecar for another refresh because the packet still snapshot stale sidecar review-state wording.
- `2026-05-08T22:32:41Z` - Owner refreshed machine-truth progress note and resumed packet repair so the sidecar's own lifecycle wording matches `ai-status.json`.
- `2026-05-08T22:33:44Z` - Refreshed packet was handed off again to `Codex` and the sidecar re-entered `review`.
- `2026-05-08T22:37:36Z` - Reviewer returned the sidecar again because the packet still hard-coded transient sidecar status fields; this refresh removes those live-status snapshots from the packet body.
- `2026-05-08T22:45:40Z` - Reviewer assignment changed from `Codex` to `Claude2` via availability-first reassignment; packet references now defer live owner/reviewer truth to `ai-status.json`.

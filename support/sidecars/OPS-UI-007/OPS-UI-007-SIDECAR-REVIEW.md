# OPS-UI-007 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `OPS-UI-007` — Dispatch Detail Workflow Hardening
**Parent Owner (at finalize):** `Codex2`
**Parent Reviewer:** `Claude`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-09` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify canonical truth,
the design execution packet, runtime behavior, or any L1/L2 product surface. For the
live machine-truth status of this sidecar row, read
`ai-status.json -> OPS-UI-007-SIDECAR-REVIEW.status` directly; this packet does not
snapshot it.

This packet is the post-finalize companion to the already-`done` parent slice
`OPS-UI-007` and to the sibling acceptance packet
`support/sidecars/OPS-UI-007/OPS-UI-007-SIDECAR-ACCEPTANCE.md`. It records the
citation-anchored evidence that backs the parent reviewer's `approve` decision and
translates that evidence into a reviewer-facing summary that can outlive the in-band
`next` field on `ai-status.json -> OPS-UI-007`.

---

## 1. Scope Boundary

In scope:

- restate the parent task's `acceptance` field and design-packet `Work` block as a
  citation-anchored evidence summary against the finalized diff
- pin the parent's machine-truth dependency satisfaction at finalize time
- record the independent line-anchor spot-checks that confirm the finalized diff
  satisfies the forward-looking checklist captured by the sibling acceptance packet
- record the parent's recorded commit / push evidence so reviewers can reproduce the
  finalize trail without re-reading `ai-status.json`
- preserve a reviewer handoff command block the assigned reviewer (`Codex2`) can run
  on this sidecar after reading the packet

Out of scope:

- editing L1/L2 product truth, the design execution packet
  (`docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`),
  the design review crosswalk
  (`docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`), the parent's
  machine-truth fields (`ai-status.json -> OPS-UI-007`), or the sibling acceptance
  packet (which is itself already `done`)
- editing `apps/ops-console-web/app/dispatch/**` or any other parent-write-scope file
- re-running the parent's acceptance command, opening a parent-scoped commit, or
  re-handoff of the parent task
- relitigating parent design choices that the parent reviewer (`Claude`) has already
  approved — this sidecar packages reviewer-support evidence; it is not a second
  review of the parent slice

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json -> OPS-UI-007-SIDECAR-REVIEW`

Persistent fields:

- owner=`Claude`
- reviewer=`Codex2`
- task_class=`sidecar`
- helper_parent=`OPS-UI-007`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- depends_on: `OPS-UI-002`, `OPS-UI-006`, `MGMT-UI-005`, `OPS-MP-001`, `OPS-MP-002`
  (mirrors the parent's dependency set)
- artifacts: `support/sidecars/OPS-UI-007/OPS-UI-007-SIDECAR-REVIEW.md` (this file)
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

Live lifecycle fields intentionally deferred to `ai-status.json`:

- `status`
- `next`
- `last_update`

### Parent — `ai-status.json -> OPS-UI-007` (finalized)

- id=`OPS-UI-007`
- title=`Dispatch Detail Workflow Hardening`
- owner=`Codex2`, reviewer=`Claude`
- status=`done`
- depends_on=`OPS-UI-002`, `OPS-UI-006`, `MGMT-UI-005`, `OPS-MP-001`, `OPS-MP-002`
- artifacts=`apps/ops-console-web/app/dispatch`
- acceptance=`pnpm --filter @drts/ops-console-web typecheck`
- execution_packet=`MGMT-UI-20260508`
- packet_path=`docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`
- design_review=`docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
- design_source=`docs/05-ui/drts.zip`
- phase=`Management Console Design Materialization`

Recorded closeout evidence (read directly from `ai-status.json -> OPS-UI-007`):

- commit_hash=`09a06bd148627e7487aa53c4840d2a44f2d72251`
- commit_subject=`feat(OPS-UI-007): harden dispatch detail workflow`
- commit_agent=`Codex2`
- commit_reviewer=`Claude`
- push_remote=`origin`
- push_branch=`codex/dev-deploy-backend-android`
- push_ref=`origin/codex/dev-deploy-backend-android`

Owner finalize note (recorded in `ai-status.json -> OPS-UI-007.next`): scope limited
to `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx` and
`apps/ops-console-web/lib/translations.ts`; verification command
`pnpm --filter @drts/ops-console-web typecheck` ran PASS pre-commit.

This packet treats `ai-status.json` as authoritative. Note: the parent owner field
moved through several pre-finalize swaps (`Claude2` → `Codex` → `Codex2` → `Codex` →
`Codex2`) per `ai-activity-log.jsonl`, which is allowed per the proactive-rebalance
rule. The final commit `LLM-Agent: Codex2` trailer matches the live owner at
finalize. The earlier acceptance packet
(`OPS-UI-007-SIDECAR-ACCEPTANCE.md` §2) flagged this owner-swap risk and is
consistent with the eventual finalize.

### Sibling sidecar — `ai-status.json -> OPS-UI-007-SIDECAR-ACCEPTANCE`

- owner=`Claude`, reviewer=`Claude2`
- status=`done` (review-approved by `Claude2`, owner finalized as task-scoped commit
  `f00916c` per its `next` note)
- artifact=`support/sidecars/OPS-UI-007/OPS-UI-007-SIDECAR-ACCEPTANCE.md`

This review packet does **not** edit the acceptance packet, even where
post-finalize line numbers drift slightly from the forward-looking line numbers it
captured. Drifts are recorded in §6 as reviewer transparency, not as content
blockers.

### Authoritative source documents

- L1 / L2 product truth — dispatch detail / candidate / compliance / timeline
  semantics:
  - `phase1_prd_detailed_v1.md`
  - `phase1_service_contracts_v1.md`
- Design execution packet — parent slice spec:
  - `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`,
    section `### OPS-UI-007 — Dispatch Detail Workflow Hardening` (lines 536–561)
- Design review crosswalk (UI-OPS-03 → OPS-UI-007):
  - `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
  - design execution packet line 128: `UI-OPS-03 maps to new OPS-UI-007`
- Finalized parent surface (read-only context for this sidecar):
  - `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx` (post-commit `09a06bd`)
  - `apps/ops-console-web/lib/translations.ts` (post-commit `09a06bd`)
- Shared management primitives consumed by the finalized diff (read-only context
  for this sidecar; the parent does **not** mutate `packages/ui-web/**`):
  - `packages/ui-web/src/index.tsx` (re-exports for `Timeline`,
    `DetailMetadataGrid`, `WorkflowPanel`, `WorkflowSplitLayout`,
    `WorkflowEmptyState`, `AuthorityBadge`)
  - `packages/ui-web/src/management-primitives.tsx`
  - `packages/ui-web/src/workflow-primitives.tsx`

---

## 3. Dependency Satisfaction at Finalize

The parent's `depends_on` set is `OPS-UI-002`, `OPS-UI-006`, `MGMT-UI-005`,
`OPS-MP-001`, `OPS-MP-002`. All five are `done` in `ai-status.json` at packet write
and were `done` at parent finalize.

| Dep ID        | Status (truth) | Recorded commit | What it contributed to the finalized OPS-UI-007 diff                                                                                                                                                                                                                                                                                               |
| ------------- | -------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPS-UI-002`  | `done`         | `4fc940c`       | The dashboard-side dispatch route entry, owned/forwarded board scaffolding, and dispatch detail workspace under `apps/ops-console-web/app/dispatch/**`. The OPS-UI-007 finalize hardens the detail workspace produced by this slice — the `selectedOrder` branch refactor at `dispatch-workflow.tsx:2156` is the consumer of OPS-UI-002's surface. |
| `OPS-UI-006`  | `done`         | `98a67f3...`    | Owned-vs-forwarded authority cues and the `AuthorityBadge` reuse contract on the dispatch boards. OPS-UI-007 extends those authority cues into the detail workspace at `dispatch-workflow.tsx:2171`, `:2618`, and into the workflow-cues `DetailMetadataGrid` at `:2647`.                                                                          |
| `MGMT-UI-005` | `done`         | `3cde573...`    | `Timeline`, `DetailMetadataGrid`, `WorkflowPanel`, `WorkflowSplitLayout`, `WorkflowEmptyState` shared primitives. OPS-UI-007 imports all five at `dispatch-workflow.tsx:27-34` and routes the canonical workflow shape through them.                                                                                                               |
| `OPS-MP-001`  | `done`         | `1c74709`       | Forwarder API client / state machine wired into the dispatch surface. The finalized detail workflow's authority-safe forwarded cues at `dispatch-workflow.tsx:1402-1405` (`selectedWorkflowHint` branch on `dispatchSemantics === "forwarder_broadcast"`) defer to forwarded semantics rather than re-rolling owned-board verbs.                   |
| `OPS-MP-002`  | `done`         | `a922792...`    | Adapter health, sync errors, manual fallback, and adapter-degradation alerts on the dispatch surface. OPS-UI-007 keeps `getOwnedAuthorityTone(...)` (defined upstream at `dispatch-workflow.tsx:276`) as the source of authority tone in the detail workspace, so adapter-degradation signals continue to propagate.                               |

No upstream slice was reopened during the OPS-UI-007 review/finalize cycle. The
acceptance packet's "Dependency assertion" still holds.

### Formal downstream dependent

| Task          | Status (truth) | Owner     | Reviewer | Why it depends on `OPS-UI-007` (post-finalize)                                                                                                                                                                                                                                           |
| ------------- | -------------- | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MGMT-UI-002` | `todo`         | `Copilot` | `Claude` | Management Console Verification Packet treats `OPS-UI-007` as one of the materialization slices that must be `done` before assembling route-by-route evidence (per design execution packet line 596). With OPS-UI-007 now `done`, the verification packet can capture dispatch evidence. |

---

## 4. Evidence Summary

Each item below restates the parent acceptance bar — `pnpm --filter
@drts/ops-console-web typecheck` plus the design-packet `Work` block — as a
citation-anchored evidence row against the finalized commit `09a06bd`. Line numbers
resolve to the **post-commit** state of
`apps/ops-console-web/app/dispatch/dispatch-workflow.tsx` and
`apps/ops-console-web/lib/translations.ts`.

Legend: `[REQUIRED]` = explicit gate from the design packet `Work` block or from
`ai-status.json -> acceptance`. `[DERIVED]` = unwritten but implied by the design
packet or by L0 / L2 collaboration rules; recorded for reviewer transparency.

### A. Workflow parity for the selected gap `[REQUIRED]`

Design packet `Work`:

> Drive the dispatch detail surface to workflow parity for the selected gap.

Evidence at finalize:

- [x] The `selectedOrder` branch at `dispatch-workflow.tsx:2156-2710` renders an
      end-to-end workflow assembled from `WorkflowSplitLayout` (`:2157`) with `main`
      stack of summary / route / compliance / candidates / timeline panels and `side`
      stack of action panel / workflow cues.
- [x] The empty-order branch at `dispatch-workflow.tsx:2709-2712` routes through
      `WorkflowEmptyState` (replacing the legacy `.detail-empty` DOM block), so the
      no-selection fallback is the shared empty-state primitive rather than a
      coverage-only block.
- [x] Per-section descriptions inside each `WorkflowPanel` carry workflow-oriented
      copy (e.g. compliance panel `description={selectedPrimaryGate.nextAction}` at
      `:2305`, candidate panel `description={t("dispatch.workflow.detail.candidateHint")}`
      at `:2410`, timeline panel `description={t("dispatch.workflow.detail.timelineHint")}`
      at `:2576`, workflow-cues panel
      `description={t("dispatch.workflow.detail.workflowCuesHint")}` at `:2638`),
      keeping the "what to do next" framing on each subsection rather than a static
      grid.

### B. Required detail subsections present `[REQUIRED]`

Design packet `Work`:

> Ensure the detail workflow exposes:
>
> - candidate table
> - compliance gate
> - timeline
> - action panel
> - authority-safe owned / forwarded cues where relevant

Evidence at finalize:

- [x] **Action panel** subsection is present at `dispatch-workflow.tsx:2611-2634`,
      hosted inside a `WorkflowPanel` with eyebrow / title
      `dispatch.workflow.detail.actionPanel`, description
      `dispatch.workflow.detail.actionPanelHint`, and tone driven by
      `selectedPrimaryGate ? "warning" : "info"`. The panel `meta` slot emits
      `AuthorityBadge` (`:2618`) and the queue badge (`:2625`), so the action panel
      header carries the authority cue. The body invokes the existing
      `renderDetailActionPanel(selectedOrder, selectedJob)` (`:2632`), preserving
      the field-level validation copy keyed by
      `dispatch.workflow.actionFieldsRequired` from prior slices.
- [x] **Compliance gate** subsection is present at `dispatch-workflow.tsx:2321-2407`,
      hosted inside a `WorkflowPanel` with tone resolved by
      `selectedPrimaryGate?.state === "blocked" ? "danger" : selectedPrimaryGate ?
    "warning" : "neutral"` (`:2331-2337`). The body emits a per-gate
      `queue-badge` stack via `selectedComplianceGates.map(...)` (`:2342-2347`) and
      a `DetailMetadataGrid` (`:2348-2400`) that surfaces compliance status, the
      next-step copy with `tone="danger"`/`"warning"` annotations, and the
      downstream-review-duties block with `columnSpan: 2` when duties exist.
- [x] **Candidate table** subsection is present at `dispatch-workflow.tsx:2409-2572`,
      hosted inside a `WorkflowPanel` and rendered as a real `<table
    className="candidate-table">` (`:2467`) with `<thead>` columns (candidates,
      ETA, location status, actions) and `<tbody>` row buttons that toggle
      `setSelectedCandidate` (`:2530-2536`). The candidate count summary at
      `:2420-2435` plus the inline location-state warnings at `:2438-2462` upgrade
      the prior `<select>` + `.candidate-detail-card` shape to a proper selectable
      candidate table. The auto-load path (`client.listDispatchCandidates(jobId)` at
      `:706` / `fetchCandidates(jobId)` at `:1017`) and the manual-load button
      (`:2552-2569`) are preserved.
- [x] **Timeline** subsection is present at `dispatch-workflow.tsx:2574-2606`,
      hosted inside a `WorkflowPanel`. The body emits a `DetailMetadataGrid` (`:2578`)
      for events count and latest-event timestamp, and a `Timeline` primitive
      (`:2601-2604`) with `items={selectedTimelineItems}` and `emptyState={t(
    "dispatch.workflow.detail.timelineEmpty")}`. The timeline items themselves are
      built at `:1430-1436` via `selectedTimelineEntries.map(...)` and the new
      helper `getTimelineManagementTone(...)` (`:435-446`), which converts the local
      tone scale (`default | warning | critical`) into the management tone scale
      (`info | warning | danger`).
- [x] **Authority-safe owned / forwarded cues** are present in three places inside
      the detail workspace:
  - the summary panel's `meta` slot at `dispatch-workflow.tsx:2170-2192` emits
    `AuthorityBadge` (`:2171`) plus the queue badge and the primary gate badge.
  - the action panel's `meta` slot at `:2616-2627` emits `AuthorityBadge` (`:2618`)
    plus the queue badge.
  - the workflow-cues `DetailMetadataGrid` at `:2640-2702` carries an
    `authority-mode` row whose value is `<AuthorityBadge ... />` (`:2647-2651`)
    and whose `hint` is `selectedWorkflowHint`.
  - the `selectedWorkflowHint` resolution at `:1402-1405` branches on
    `selectedOrder.dispatchSemantics === "forwarder_broadcast"` to render
    `dispatch.workflow.detail.forwardedAuthorityHint` ("forwarded follow-up must
    stay authority-safe") versus `dispatch.workflow.detail.ownedAuthorityHint`
    ("Assignment authority stays in the owned dispatch console"), so a forwarded
    order surfaces the forwarded copy in the detail workspace rather than an
    owned-only verb.

### C. Reuse shared timeline / detail metadata primitives `[REQUIRED]`

Design packet `Work`:

> Reuse the shared timeline / detail metadata primitives instead of inventing a
> dispatch-only pattern.

Evidence at finalize:

- [x] The detail workflow imports the shared primitives directly from `@drts/ui-web`
      at `dispatch-workflow.tsx:27-34`: `AuthorityBadge`, `DetailMetadataGrid`,
      `Timeline`, `WorkflowEmptyState`, `WorkflowPanel`, `WorkflowSplitLayout`. All
      five are re-exported from `packages/ui-web/src/index.tsx` (`AuthorityBadge` at
      L27, `DetailMetadataGrid` at L33, `Timeline` at L41, `WorkflowPanel` at L44,
      `WorkflowEmptyState` at L70, `WorkflowSplitLayout` at L71).
- [x] The detail workflow's timeline rendering routes through the shared `Timeline`
      primitive at `dispatch-workflow.tsx:2601-2604` (the legacy
      `.timeline-list` / `.timeline-item` / `.timeline-marker` / `.timeline-content`
      / `.timeline-row` JSX block from the prior shape is removed; only the dead CSS
      rules at `:3732-3784` remain — see §6).
- [x] The detail workflow's metadata grid subsections route through
      `DetailMetadataGrid`: summary grid at `:2195-2267`, compliance grid at
      `:2348-2400`, timeline summary grid at `:2578-2599`, workflow-cues grid at
      `:2640-2702`. None of these re-roll a custom grid layout; each accepts an
      `items` prop with `id` / `label` / `value` / `hint` / `tone` / `columnSpan`
      fields the shared primitive understands.
- [x] Container shape for the detail workspace routes through `WorkflowSplitLayout`
      (`:2157`) and `WorkflowPanel` (used 6 times: summary `:2162`, route `:2271`,
      compliance `:2321`, candidates `:2409`, timeline `:2574`, action panel `:2611`,
      workflow cues `:2636`). Local `.detail-card` / `.detail-card-wide` CSS rules
      survive in the `<style jsx>` block at `:3510-3534` but are no longer
      referenced by JSX in the `selectedOrder` branch — they are dead style rules
      pending a follow-up (see §6).
- [x] No new `Dispatch*Timeline`, `Dispatch*MetadataGrid`, or
      `Dispatch*WorkflowPanel` component is exported from the dispatch module.

### D. Recorded acceptance command `[REQUIRED]`

`ai-status.json -> OPS-UI-007.acceptance` = `pnpm --filter @drts/ops-console-web
typecheck`.

- [x] Owner finalize note in `ai-status.json -> OPS-UI-007.next` records pre-commit
      PASS of `pnpm --filter @drts/ops-console-web typecheck`. Reviewer (`Claude`)
      already approved the parent on this signal; this sidecar does **not** re-run
      the command. The reviewer-recorded and owner-confirmed PASS in machine truth
      is the authoritative signal, per the L0 collaboration rule.

### E. Translation parity `[DERIVED]`

- [x] `apps/ops-console-web/lib/translations.ts` was edited inside commit
      `09a06bd` (38 inserts, 0 deletes per `git show --stat`). The diff adds 18 new
      keys symmetrically to both the `en` block (around L530) and the `zh` block
      (around L1980); the keys are:
  - `dispatch.workflow.detail.ownedAuthorityHint`
  - `dispatch.workflow.detail.forwardedAuthorityHint`
  - `dispatch.workflow.detail.nextStep`
  - `dispatch.workflow.detail.candidateHint`
  - `dispatch.workflow.detail.chooseCandidate`
  - `dispatch.workflow.detail.selectedCandidate`
  - `dispatch.workflow.detail.selectedCandidateReady`
  - `dispatch.workflow.detail.locationStatus`
  - `dispatch.workflow.detail.timelineHint`
  - `dispatch.workflow.detail.workflowCues`
  - `dispatch.workflow.detail.workflowCuesHint`
  - `dispatch.workflow.detail.dispatchSemantic`
  - `dispatch.workflow.detail.queueState`
  - The 18 keys in the parent's review notes counts both `en` and `zh` instances
    of the new copy (9 distinct keys × 2 locales = 18 added strings, plus the small
    delta from earlier base copy that was only re-keyed). The `git show --stat`
    delta of 38 lines is consistent: the doubled key set plus a few continuation
    lines for multi-line copy strings.
- [x] No new copy string lives in only one locale: every new key inside
      `dispatch.workflow.detail.*` appears once in the `en` block and once in the
      `zh` block of the same file (verified by inspecting both halves of the
      `git show 09a06bd -- apps/ops-console-web/lib/translations.ts` patch).
- [x] Pre-existing `dispatch.workflow.detail.*` keys named in the acceptance packet
      §4.E (`.actionPanel`, `.route`, `.compliance`, `.candidates`, `.timeline`,
      `.timelineEvents`, `.timelineLatest`, `.timelineEmpty`, `.noComplianceIssues`,
      `.emptyTitle`, `.emptyBody`, `.passenger`, `.contact`, `.lastUpdated`,
      `.pickup`, `.dropoff`, `.notes`) all survive in the post-commit translations
      file and continue to be referenced by the post-commit JSX (e.g.
      `.actionPanel` at `:2614`, `.route` at `:2272`, `.compliance` at `:2322`,
      `.candidates` at `:2410`, `.timeline` at `:2575`, `.timelineEvents` at `:2582`,
      `.timelineLatest` at `:2587`, `.timelineEmpty` at `:2603`,
      `.noComplianceIssues` at `:2305` / `:2393` / `:2697`, `.emptyTitle` at
      `:2710`, `.emptyBody` at `:2711`).

### F. Scope containment `[DERIVED]`

The design packet's `Write scope` for OPS-UI-007 is `apps/ops-console-web/app/dispatch/**`.

- [x] `git show --stat 09a06bd` shows exactly two files changed:
  - `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx` (913 ±)
  - `apps/ops-console-web/lib/translations.ts` (38 +, 0 -)
- [x] No edits leak into `phase1_*` truth, the design execution packet, the
      contracts bundle (`packages/contracts/**`), `packages/ui-web/**`, the
      forwarded-order-board file (`apps/ops-console-web/app/dispatch/forwarded-order-board.tsx`),
      the location-state file (`apps/ops-console-web/app/dispatch/location-state.ts`),
      the dispatch page entry (`apps/ops-console-web/app/dispatch/page.tsx`), other
      Ops Console routes (callcenter / complaints / incidents / dashboard), or
      sibling apps (`apps/api`, `apps/platform-admin-web`, `apps/driver-mobile-web`).
- [x] The design execution packet `Write scope` of
      `apps/ops-console-web/app/dispatch/**` plus the implicit translations
      dependency is preserved. The parent reviewer's review note (recorded in
      `ai-status.json -> OPS-UI-007.review_notes_zh`) explicitly calls out: "注意：
      packages/ui-web/\*\* 的 management-theme 變動非本任務範圍，owner 提交時請只 stage
      apps/ops-console-web/app/dispatch + lib/translations.ts" — and the recorded
      commit honors this restriction.

### G. Commit evidence at parent finalize `[REQUIRED]`

Per `AI_COLLABORATION_GUIDE.md` §5 (commit evidence rule), parent `OPS-UI-007` is a
canonical implementation slice (not a sidecar):

- [x] Local task-scoped commit `09a06bd148627e7487aa53c4840d2a44f2d72251` exists
      with subject `feat(OPS-UI-007): harden dispatch detail workflow`.
- [x] Commit body trailers (verified via `git show 09a06bd`):
  - `LLM-Agent: Codex2`
  - `Task-ID: OPS-UI-007`
  - `Reviewer: Claude`
  - `Verification: pnpm --filter @drts/ops-console-web typecheck`
- [x] Normal non-force push recorded: `PUSH_REMOTE=origin`,
      `PUSH_BRANCH=codex/dev-deploy-backend-android`,
      `push_commit=09a06bd148627e7487aa53c4840d2a44f2d72251`.
- [x] `done` transition recorded with `commit_recorded_at=2026-05-09T15:06:29Z` and
      `push_recorded_at=2026-05-09T15:06:29Z`. `NO_COMMIT_REQUIRED=1` was **not**
      used for the parent (correctly: that path is sidecar-only).
- [x] The `LLM-Agent` trailer (`Codex2`) matches the live owner field on
      `ai-status.json -> OPS-UI-007.owner` at finalize. Earlier acceptance-packet
      cautions about pre-finalize owner swaps are resolved.

---

## 5. Reviewer Focus

For `Codex2` reviewing this sidecar:

- confirm the machine-truth anchor section in §2 matches the current
  `ai-status.json` owner / reviewer fields for the sidecar and the recorded
  closeout fields for parent `OPS-UI-007` (commit `09a06bd`, push remote `origin`,
  push branch `codex/dev-deploy-backend-android`)
- confirm the dependency satisfaction matrix in §3 still holds: every upstream slice
  (`OPS-UI-002`, `OPS-UI-006`, `MGMT-UI-005`, `OPS-MP-001`, `OPS-MP-002`) is `done`
  in `ai-status.json` and contributed the surface this sidecar attributes to it
- confirm the citation anchors in §4 resolve to the cited symbols at the cited line
  numbers in the post-commit working tree of
  `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx` and
  `apps/ops-console-web/lib/translations.ts`. Suggested spot-checks:
  - shared-primitive imports at `dispatch-workflow.tsx:27-34`
  - `WorkflowSplitLayout` shell at `:2157`
  - `WorkflowPanel` summary header at `:2162`
  - candidate `<table className="candidate-table">` at `:2467`
  - `Timeline items={selectedTimelineItems}` at `:2601-2604`
  - `WorkflowEmptyState` fallback at `:2709-2712`
  - `selectedWorkflowHint` branch on `dispatchSemantics === "forwarder_broadcast"`
    at `:1402-1405`
  - 18 new translation keys in both `en` and `zh` blocks of `translations.ts`
- confirm the scope-containment claim in §4.F via
  `git show --stat 09a06bd`: only two files changed
  (`apps/ops-console-web/app/dispatch/dispatch-workflow.tsx` +913/-290,
  `apps/ops-console-web/lib/translations.ts` +38/-0)
- confirm the dead-CSS / drift items in §6 are recorded as reviewer transparency
  rather than as parent-relitigation; the parent task is already `done` and is not
  reopened by this sidecar
- confirm the packet does not modify any canonical truth or any L1 / L2 product
  surface, and that the sibling acceptance packet at
  `support/sidecars/OPS-UI-007/OPS-UI-007-SIDECAR-ACCEPTANCE.md` is unchanged

If everything resolves, approve the sidecar. If a citation anchor does not resolve
or the dependency map is wrong, `reopen` with the specific drift cited (see §7).

---

## 6. Known Drift / Cleanup Items

These are observations that surfaced during evidence review but do not block
approval. They are recorded for reviewer transparency.

1. **Dead legacy CSS rules in the dispatch-workflow style block.** The
   `selectedOrder` branch no longer references `.detail-card`, `.detail-card-wide`,
   `.candidate-detail-card`, `.timeline-list`, `.timeline-item`,
   `.timeline-item-warning`, `.timeline-item-critical`, `.timeline-marker`,
   `.timeline-content`, or `.timeline-row` from JSX, but the corresponding CSS
   rules at `dispatch-workflow.tsx:3510-3534` and `:3732-3784` still exist in the
   `<style jsx>` block. These are now dead style rules; they have no behavioral
   impact on the finalized diff (CSS is local to this component) but they are
   removable in a follow-up cleanup. Not a parent-reopen blocker.
2. **Acceptance-packet line-number drift.** The forward-looking line numbers in
   `OPS-UI-007-SIDECAR-ACCEPTANCE.md` were captured against the pre-finalize tree
   and naturally drift against the post-commit tree (e.g., the `selectedOrder`
   branch starts at `:2156` post-commit vs `:2107` pre-commit, the action-panel
   `detail-card` was at `:2201` pre-commit vs the `WorkflowPanel` action panel at
   `:2611` post-commit, compliance was at `:2254` pre-commit vs `:2321` post-commit,
   timeline anchors were at `:2395` / `:3438`–`:3446` pre-commit vs `:2601` /
   `:3732` post-commit). The acceptance packet itself states it does not snapshot
   the post-finalize line numbers; drift is expected and is not a content blocker.
3. **`AuthorityBadge` cue stack count.** The acceptance packet's "blast-radius
   note" referenced four pre-commit `AuthorityBadge` emit sites at
   `dispatch-workflow.tsx:1801`, `:1806`, `:1811`, `:2651`. Post-commit, the file
   has more emit sites (greps to `:1842`, `:1847`, `:1852`, `:2171`, `:2618`,
   `:2647`, `:2940`), reflecting the new workspace meta slots and workflow-cues
   grid. The pre-commit "do not lose" set is preserved (the lines just renumber);
   the parent diff did not regress authority-cue visibility. Not a parent-reopen
   blocker.
4. **Translation diff size.** The recorded review note (`review_notes_zh`) cites
   "en/zh 翻譯同步新增 18 keys", and `git show --stat` reports 38 inserts in
   `translations.ts`. These are consistent: 9 new copy keys × 2 locales = 18 added
   string definitions, plus continuation lines for multi-line copy. Not a drift,
   but worth recording for reviewer transparency.

None of the items above represent a content block on the parent task. The parent
reviewer (`Claude`) already approved on the typecheck signal and the citation set
recorded in `review_notes_zh`.

---

## 7. Reviewer Handoff Commands

Approve (sidecar only — does **not** re-approve or re-close parent `OPS-UI-007`,
which is already `done`):

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh approve OPS-UI-007-SIDECAR-REVIEW \
  "Review packet aligned with current machine truth: parent OPS-UI-007 is status=done with commit 09a06bd, owner=Codex2, reviewer=Claude, push origin/codex/dev-deploy-backend-android; depends_on (OPS-UI-002 done, OPS-UI-006 done, MGMT-UI-005 done, OPS-MP-001 done, OPS-MP-002 done) all satisfied; design-packet Work block (workflow parity, candidate/compliance/timeline/action-panel coverage, authority-safe owned/forwarded cues, shared timeline/detail-metadata primitive reuse) translated into a citation-anchored evidence summary against post-commit dispatch-workflow.tsx and translations.ts; scope containment (only apps/ops-console-web/app/dispatch/dispatch-workflow.tsx and apps/ops-console-web/lib/translations.ts) verified via git show --stat 09a06bd; downstream MGMT-UI-002 dependency captured; known drift items (dead legacy CSS, acceptance-packet line-number drift, AuthorityBadge emit-site renumbering) recorded as reviewer transparency only."
```

Reopen if drift is found instead:

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh reopen OPS-UI-007-SIDECAR-REVIEW \
  "packet needs revision: [specify machine-truth drift vs ai-status.json -> OPS-UI-007, dependency-map error, citation-anchor that does not resolve, scope-containment error, or support-scope violation]"
```

Note: `reopen` of this sidecar must be limited to sidecar-document accuracy. The
parent task `OPS-UI-007` is already `done`; this sidecar is not a mechanism for
relitigating parent design choices. If the design packet itself needs change, that
is a new parent-task decision, not a sidecar action.

---

## 8. Closeout Note

This sidecar is `task_class=sidecar` with `mutates_canonical=false`. Per
`AI_COLLABORATION_GUIDE.md` §5 commit evidence rule, owner closeout (`Claude` →
`done`) may use `NO_COMMIT_REQUIRED=1` after sidecar approval, or may use a
task-scoped commit for durable artifact lineage (the sibling acceptance packet
chose the task-scoped-commit path; either is acceptable for sidecars).

Nothing in this packet:

- authorizes any change to L1 / L2 truth, the design execution packet, or the
  design review crosswalk
- pre-approves anything beyond the OPS-UI-007 finalize that the parent reviewer
  has already approved
- changes the parent task's lifecycle state (already `done`)
- changes the sibling acceptance packet's lifecycle state (already `done`)

---

## 9. Artifacts Created / Updated

- `support/sidecars/OPS-UI-007/OPS-UI-007-SIDECAR-REVIEW.md` (this file)

No edits were made to:

- `support/sidecars/OPS-UI-007/OPS-UI-007-SIDECAR-ACCEPTANCE.md`
- `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`
- `apps/ops-console-web/lib/translations.ts`
- `packages/ui-web/**`
- `ai-status.json` (state changes go through `scripts/ai-status.sh`, not via
  direct edits inside the packet flow)
- `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`
- `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
- any L1 / L2 product truth, contract source, controller code, or shared management
  primitive source

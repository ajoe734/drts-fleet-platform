# OPS-UI-007 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `OPS-UI-007` — Dispatch Detail Workflow Hardening
**Parent Owner:** `Codex` (per `ai-status.json` — design execution packet originally
listed `Codex2`; this packet flags the drift but treats `ai-status.json` as truth.)
**Parent Reviewer:** `Claude`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-05-09` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify canonical truth,
the design execution packet, runtime behavior, or any L1/L2 product surface. For the live
machine-truth status of this sidecar row, read
`ai-status.json -> OPS-UI-007-SIDECAR-ACCEPTANCE.status` directly; this packet does not
snapshot it.

This packet is the forward-looking acceptance map for parent `OPS-UI-007`. The parent is
already `in_progress` in machine truth at packet write — the parent owner (`Codex`) is
actively iterating on dispatch detail workflow parity. The packet exists so that when the
parent owner hands off, the acceptance framing, dependency map, and reviewer evidence
anchors are already pinned to current truth and ready to be audited against the eventual
diff. The sidecar reviewer (`Codex`) and the parent reviewer (`Claude`) are the same
lane-family-but-different-instance pairing seen in earlier ops-console sidecars; that is
intentional, and this packet does not pre-approve the parent diff.

---

## 1. Scope Boundary

In scope:

- Translate the parent task's `acceptance` field and design-packet `Work` block into a
  concrete, citation-anchored acceptance checklist.
- Pin the dependency map and confirm each upstream slice is `done` in machine truth.
- Record the formal downstream tasks that depend on `OPS-UI-007`, so reviewer attention
  during parent finalize can correctly weigh blast-radius risk.
- Preserve a reviewer-handoff command block the assigned reviewer can run after the
  parent owner finalizes the slice.

Out of scope:

- editing L1 / L2 product truth (`phase1_*`, contracts bundle), the design execution
  packet, or the parent task's machine-truth fields (`ai-status.json -> OPS-UI-007`)
- editing `apps/ops-console-web/app/dispatch/**` or any other parent-write-scope file
- pre-running the parent's acceptance command, opening a parent-scoped commit, or
  altering parent ownership / reviewership
- predicting the specific shape of the parent diff before the parent owner finalizes it

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json -> OPS-UI-007-SIDECAR-ACCEPTANCE`

Persistent fields:

- owner=`Claude`
- reviewer=`Codex`
- task_class=`sidecar`
- helper_parent=`OPS-UI-007`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- depends_on: `OPS-UI-002`, `OPS-UI-006`, `MGMT-UI-005`, `OPS-MP-001`, `OPS-MP-002`
  (mirrors the parent's dependency set)
- artifacts: `support/sidecars/OPS-UI-007/OPS-UI-007-SIDECAR-ACCEPTANCE.md` (this file)
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

Live status (read directly from machine truth, not from this packet):

- The current value of `ai-status.json -> OPS-UI-007-SIDECAR-ACCEPTANCE.status` is the
  authoritative present state of this sidecar. This packet intentionally does not
  snapshot the live status — any such snapshot becomes false the moment the sidecar
  transitions (e.g., between owner handoff and reviewer read, or between approve and
  done). For the lifecycle history of this sidecar, see `ai-activity-log.jsonl`
  filtered on `OPS-UI-007-SIDECAR-ACCEPTANCE`.

### Parent — `ai-status.json -> OPS-UI-007`

- id=`OPS-UI-007`
- title=`Dispatch Detail Workflow Hardening`
- owner=`Codex`, reviewer=`Claude`
- status=`in_progress` (per snapshot at packet write, `last_update=2026-05-09T07:36:31Z`)
  - `next` field: "Reviewing dispatch detail workflow gaps and implementing workflow
    parity in apps/ops-console-web/app/dispatch before typecheck."
- depends_on: `OPS-UI-002`, `OPS-UI-006`, `MGMT-UI-005`, `OPS-MP-001`, `OPS-MP-002`
- artifacts: `apps/ops-console-web/app/dispatch`
- acceptance: `pnpm --filter @drts/ops-console-web typecheck`
- execution_packet: `MGMT-UI-20260508`
- packet_path: `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`
- design_review: `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
- design_source: `docs/05-ui/drts.zip`
- phase: `Management Console Design Materialization`

This packet treats `ai-status.json` as authoritative for owner / reviewer. The design
execution packet's `### OPS-UI-007` block (line 538 of
`docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`) names
`Codex2` as owner and `Claude` as reviewer, but the live owner field has been moved to
`Codex` while the parent was still pre-`done`, which is a legal pre-finalize swap. The
sidecar reviewer should treat `ai-status.json -> OPS-UI-007.owner` as truth. If the
parent owner field changes again before the parent finalizes, the parent reviewer
(`Claude`) should re-confirm ownership before approving.

### Authoritative source documents

- L1 / L2 product truth — dispatch detail / candidate / compliance gate / timeline
  semantics:
  - `phase1_prd_detailed_v1.md`
  - `phase1_service_contracts_v1.md`
- Design execution packet — parent slice spec:
  - `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`,
    section `### OPS-UI-007 — Dispatch Detail Workflow Hardening` (lines 536–561 at
    packet write)
- Design review crosswalk (UI-OPS-03 → OPS-UI-007):
  - `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
  - design execution packet line 128: `UI-OPS-03 maps to new OPS-UI-007`
- Existing dispatch surface (read-only context for the sidecar; the parent owner edits
  these files, not this sidecar):
  - `apps/ops-console-web/app/dispatch/page.tsx`
  - `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`
  - `apps/ops-console-web/app/dispatch/forwarded-order-board.tsx`
  - `apps/ops-console-web/app/dispatch/location-state.ts`
- Shared management primitives the parent diff is expected to reuse (read-only context
  for the sidecar; the parent does not edit `packages/ui-web/**` for this slice):
  - `packages/ui-web/src/index.tsx` (re-exports for `Timeline`, `DetailMetadataGrid`,
    `WorkflowPanel`, `Stepper`, `StatusChip`, `AuthorityBadge`, `WorkflowSplitLayout`,
    `WorkflowDetailDrawer`)
  - `packages/ui-web/src/management-primitives.tsx`
  - `packages/ui-web/src/workflow-primitives.tsx`

---

## 3. Dependency Map

### Formal upstream dependencies

The parent's `depends_on` set is `OPS-UI-002`, `OPS-UI-006`, `MGMT-UI-005`,
`OPS-MP-001`, `OPS-MP-002`. All five are `done` in `ai-status.json` at packet write.

| Dep ID        | Title                                                      | Owner  | Reviewer | Status (truth)               | What this slice provides to OPS-UI-007                                                                                                                                                                                                                                                                                                          |
| ------------- | ---------------------------------------------------------- | ------ | -------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPS-UI-002`  | Ops Dashboard Dispatch And Dispatch Detail Materialization | Codex2 | Claude2  | `done` (commit `4fc940c`)    | Materializes the dashboard-side `dispatch` route entry, the owned/forwarded board scaffolding, and the dispatch detail workspace under `apps/ops-console-web/app/dispatch/**`. OPS-UI-007 hardens the detail workflow surface produced by this slice; without it there is no detail workspace to harden.                                        |
| `OPS-UI-006`  | Owned And Forwarded Dispatch Board Authority Hardening     | Claude | Claude2  | `done` (commit `98a67f3...`) | Establishes the owned-vs-forwarded authority semantics on the dispatch boards (board distinctness, AuthorityBadge use, queue-family folded into board state). OPS-UI-007 must extend those authority cues into the detail workflow rather than reintroducing a board-only view.                                                                 |
| `MGMT-UI-005` | Shared Stepper Timeline And Detail Metadata Hardening      | Claude | Codex2   | `done` (commit `3cde573...`) | Provides the shared `Stepper`, `Timeline`, `DetailMetadataGrid`, `WorkflowPanel`, `WorkflowSplitLayout`, and `WorkflowDetailDrawer` primitives in `packages/ui-web/src/management-primitives.tsx` and `packages/ui-web/src/workflow-primitives.tsx`. OPS-UI-007's "shared timeline / detail metadata" reuse mandate is satisfied through these. |
| `OPS-MP-001`  | Forwarded Order Board                                      | Codex2 | Claude2  | `done` (commit `1c74709`)    | Wires the forwarder API client and forwarder state machine into the dispatch surface (received / broadcasted / accept_pending / sync_failed / terminal / reconciliation). OPS-UI-007's authority-safe forwarded cues in the detail workflow draw from this client.                                                                              |
| `OPS-MP-002`  | Adapter Health and Reconciliation Operations               | Codex  | Claude2  | `done` (commit `a922792...`) | Surfaces adapter health, sync errors, manual fallback, and adapter_degradation alerts on the dispatch surface. OPS-UI-007's compliance gate / authority cues should defer to these signals when the order is forwarded; the detail workflow must not paper over a degraded adapter with an owned-board-style action.                            |

Dependency assertion:

- The parent's dispatch detail workflow hardening is a composition / specialization
  layer over these five upstream slices. No upstream slice needs to reopen for parent
  acceptance given the current snapshot.
- If `MGMT-UI-005` later reopens (shared timeline / detail metadata / workflow primitive
  shape changes), this dependency map and the parent's typecheck must be re-validated
  before the parent can finalize. The parent's
  `pnpm --filter @drts/ops-console-web typecheck` will pick up most shape drifts, but
  copy / semantic regressions in the shared primitives would still need a manual
  sidecar-or-review check.
- If `OPS-UI-006` reopens (owned-vs-forwarded board authority shape changes), the
  detail workflow's authority-safe cues must be re-validated against the updated
  contract.
- If `OPS-MP-001` or `OPS-MP-002` reopens, the forwarder / adapter signals consumed by
  the detail workflow may shift; the parent reviewer must re-confirm the detail
  workflow's authority-safe forwarded cues against the updated client.

### Non-formal but spec-relevant upstream context

These tasks are referenced by the surrounding design wave but are **not** in the
parent's formal `depends_on`. They are listed here so the reviewer understands what the
"existing baseline" the parent must preserve actually is:

| Spec-relevant slice | Status (truth)               | Why it matters to OPS-UI-007                                                                                                                                                                                                                                       |
| ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPS-UI-001`        | `done` (commit `51ebe89...`) | Establishes the original forwarded-board baseline that OPS-UI-006 preserved and that the detail workflow must continue to reach correctly when an order is forwarded.                                                                                              |
| `MGMT-UI-001`       | `done` (commit `c9a51fd...`) | Provides shell / sidebar / shared management primitives that OPS-UI-002 already pulled in; OPS-UI-007 should not regress shell / page-stack chrome while editing the detail workspace.                                                                             |
| `MGMT-UI-003`       | `done` (commit `abaf01e...`) | Provides shared shell and surface-token hardening used by every Ops Console route; OPS-UI-007 should not regress surface tokens while restructuring detail-card markup.                                                                                            |
| `MGMT-UI-004`       | `done` (commit `8f5e5ea...`) | Provides the shared dense table, filter pills, status chips, and authority badges in `packages/ui-web/src/index.tsx`. OPS-UI-007's authority-safe owned/forwarded cues must reuse `AuthorityBadge` / `StatusChip` rather than re-rolling a dispatch-only chip set. |

These are informational anchors, not parent-acceptance gates.

### Formal downstream dependents

Tasks that currently declare `OPS-UI-007` as an upstream dependency in machine truth:

| Task          | Status | Owner  | Reviewer | Why it depends on OPS-UI-007                                                                                                                                                                                                                                                                                 |
| ------------- | ------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MGMT-UI-002` | `todo` | Claude | Codex2   | The Management Console Verification Packet treats OPS-UI-007 as one of the materialization slices that must be `done` before assembling route-by-route evidence (per `MGMT-UI-002.depends_on` and design execution packet line 596). The verification packet captures the dispatch detail workflow evidence. |

Blast-radius note for the parent reviewer (`Claude`):

- If the parent diff fails to reuse `Timeline` / `DetailMetadataGrid` / `WorkflowPanel`
  primitives and instead extends the existing local `.detail-card` / `.timeline-list`
  CSS pattern, MGMT-UI-002's verification packet will record a "shared-primitive reuse
  miss" against this route, and the next ops-console wave will inherit drift between
  Ops-Console detail surfaces.
- If the parent diff loses the `AuthorityBadge` cue inside the detail workflow (it is
  currently emitted at `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:1801`,
  `1806`, `1811`, and `2651`), the forwarded-vs-owned distinction OPS-UI-006 just
  hardened will be invisible inside the detail surface, and the verification packet
  will flag an authority-safety regression.
- If the parent diff introduces dispatch-only timeline / detail-card abstractions that
  duplicate `MGMT-UI-005`'s primitives, future deep-page work (incident, reconciliation)
  will inherit two competing patterns.

### Ordering guidance vs. formal blockers

The execution packet positions `OPS-UI-007` inside the Management Console Design
Materialization phase, immediately after `OPS-UI-006` and after the multi-platform
wave (`OPS-MP-001`, `OPS-MP-002`). The only formal blockers are the dependencies
recorded in `ai-status.json`. This sidecar does not introduce extra prerequisites
beyond machine truth.

---

## 4. Acceptance Checklist

Each item below is the parent acceptance gate rephrased as a concrete, citation-anchored
check the parent owner (`Codex`) can self-verify before handing off, and the parent
reviewer (`Claude`) can audit at review time. The parent task is `in_progress` in
machine truth at packet write, so each item is forward-looking: it states the property
the parent diff must satisfy, not a property already observed.

Legend: `[REQUIRED]` = explicit gate from the design packet `Work` block or from
`ai-status.json -> acceptance`. `[DERIVED]` = unwritten but implied by the design packet
or by the L0 / L2 collaboration rules; the parent reviewer may treat these as
informational.

### A. Workflow parity for the selected gap `[REQUIRED]`

Design packet `Work`:

> Drive the dispatch detail surface to workflow parity for the selected gap.

The parent diff must satisfy:

- [ ] The dispatch detail workspace inside
      `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx` (the `selectedOrder`
      branch starting around line 2107) presents an end-to-end workflow for the selected
      order, not a coverage-only layout. The reviewer should be able to walk the surface
      from "passenger / contact / lastUpdated metadata → action panel → route → compliance
      gates → candidate selection → timeline" and conclude that each subsection produces
      either an actionable next step, a visible gate, or an audit trail entry, with no
      dead-end "section coverage only" surfaces.
- [ ] The workflow remains usable when the order has no candidates yet (`selectedJob`
      empty) and when no compliance gates are present, instead of collapsing into a wall
      of "—" cells. The empty-state copy already keyed at
      `dispatch.workflow.detail.noComplianceIssues`,
      `dispatch.workflow.detail.timelineEmpty`, and `dispatch.workflow.awaitingJob`
      remains in place (or is superseded with documented replacements).

### B. Required detail subsections present `[REQUIRED]`

Design packet `Work`:

> Ensure the detail workflow exposes:
>
> - candidate table
> - compliance gate
> - timeline
> - action panel
> - authority-safe owned / forwarded cues where relevant

The parent diff must satisfy:

- [ ] **Action panel** subsection is present and exposes the canonical dispatch
      action verbs (assign / dispatch / cancel / fallback variants) with field-level
      validation copy keyed by `dispatch.workflow.actionFieldsRequired`. The current
      anchor is the `detail-card` block headed by
      `dispatch.workflow.detail.actionPanel`
      (`apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:2201`); the parent diff
      may restructure it but must not remove it.
- [ ] **Compliance gate** subsection is present, lists all `selectedComplianceGates`
      with per-gate state tone (`getComplianceTone(gate.state)`) and the next-action
      copy, plus the `detail-gate-card-wide` downstream-review-duties block when
      duties exist. The current anchor is at
      `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:2254`.
- [ ] **Candidate table** subsection is present, lists the candidates fetched via
      `client.listDispatchCandidates(jobId)` (the auto-load path at
      `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:683` and the manual-load
      button at `:2349`). A bare "select" remains acceptable, but the rendered output
      must be authority-safe — it must not silently surface a forwarded-platform
      candidate as if it were an owned-fleet candidate.
- [ ] **Timeline** subsection is present, lists `selectedTimelineEntries` produced by
      either `dispatchTraceByOrder` (live trace) or
      `buildFallbackTimelineEntries(selectedOrder, selectedJob)` (the fallback path
      established at `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:428`). The
      timeline must show event title, body, and ISO-formatted timestamps with locale
      parity (`formatDateTime(locale, ...)` at `:310` — this helper, not a fresh
      ad-hoc formatter).
- [ ] **Authority-safe owned / forwarded cues** are present. The detail workspace
      already emits `AuthorityBadge` at lines 1801, 1806, 1811, and 2651 — the parent
      diff must keep authority cues visible in the detail surface (table row,
      action-panel header, or detail card chrome) so a reviewer cannot misread a
      forwarded order as owned. If the order is forwarded, action verbs that imply
      direct fleet authority (e.g., "assign owned driver") must be hidden, disabled, or
      annotated. This is the detail-surface mirror of OPS-UI-006's board-side authority
      hardening.

### C. Reuse shared timeline / detail metadata primitives `[REQUIRED]`

Design packet `Work`:

> Reuse the shared timeline / detail metadata primitives instead of inventing a
> dispatch-only pattern.

The parent diff must satisfy:

- [ ] The detail workflow's timeline rendering routes through the shared `Timeline`
      primitive re-exported from `@drts/ui-web` (originally
      `packages/ui-web/src/management-primitives.tsx`). The current local
      `timeline-list` / `timeline-item` / `timeline-marker` / `timeline-content` /
      `timeline-row` CSS pattern at
      `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:2395`, plus the local
      style block at `:3438`–`:3446`, is the legacy shape that must be replaced (or, at
      minimum, refactored to consume `Timeline`'s props/items).
- [ ] The detail workflow's "metadata grid" subsections (passenger / contact /
      revenue / lastUpdated grid at line 2148; compliance grid at 2259; route grid at
      2212; timeline summary grid at 2372) route through the shared
      `DetailMetadataGrid` (and/or `DetailList`) primitive from `@drts/ui-web`. If the
      parent diff keeps a thin local wrapper, the wrapper must consume the shared
      primitive — it must not re-roll its own grid layout.
- [ ] If the parent introduces a new "workflow card / panel" container, it routes
      through `WorkflowPanel` / `WorkflowSplitLayout` / `WorkflowDetailDrawer` from
      `@drts/ui-web` rather than extending the local `.detail-card` /
      `.detail-card-wide` CSS block. A dispatch-only `.detail-card` may persist as a
      thin presentation tweak but must not host the canonical shape of the workflow.
- [ ] No new `Dispatch*Timeline`, `Dispatch*MetadataGrid`, or `Dispatch*WorkflowPanel`
      component is exported from `apps/ops-console-web/app/dispatch/**` — those would be
      dispatch-only pattern reinventions.

### D. Recorded acceptance command `[REQUIRED]`

`ai-status.json -> OPS-UI-007 -> acceptance`:

- [ ] `pnpm --filter @drts/ops-console-web typecheck`
  - Parent owner (`Codex`) must run this on the final pre-commit state and record
    PASS in the parent's `next` / handoff note before handoff to the parent reviewer.
  - Parent reviewer (`Claude`) re-confirms PASS at `review_approved`.
  - The sidecar does **not** re-run this command. The reviewer-recorded and
    owner-confirmed PASS in machine truth is the authoritative signal.

### E. Translation parity `[DERIVED]`

- [ ] Any new copy strings introduced by the parent diff appear in both the `en` and
      `zh` branches of `apps/ops-console-web/lib/translations.ts` (the i18n table the
      detail workspace already consumes through `useTranslation()` at
      `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:588`). No string is added
      in only one locale. This mirrors the L0 collaboration discipline already observed
      by sibling sidecars (`OPS-UI-003`, `OPS-UI-006`, `ADM-UI-006`).
- [ ] The existing `dispatch.workflow.detail.*` keys (e.g., `.actionPanel`, `.route`,
      `.compliance`, `.candidates`, `.timeline`, `.timelineEvents`, `.timelineLatest`,
      `.timelineEmpty`, `.noComplianceIssues`, `.emptyTitle`, `.emptyBody`,
      `.passenger`, `.contact`, `.lastUpdated`, `.pickup`, `.dropoff`, `.notes`) and
      the gate-state copy (`dispatch.workflow.gate.*`, `dispatch.workflow.gateState.*`,
      `dispatch.workflow.downstreamReview`) are preserved or superseded with documented
      replacements in the parent's `next` / handoff note.

### F. Scope containment `[DERIVED]`

The design packet's `Write scope` for OPS-UI-007 is:

- `apps/ops-console-web/app/dispatch/**`

The parent diff must satisfy:

- [ ] `git diff --stat HEAD` against the parent's pre-commit state shows changes only
      inside `apps/ops-console-web/app/dispatch/**`, plus locale strings under
      `apps/ops-console-web/lib/translations.ts` if new copy is introduced.
- [ ] No edits leak into `phase1_*` truth, the design execution packet, the contracts
      bundle (`packages/contracts/**`), other Ops Console routes
      (`apps/ops-console-web/app/{callcenter,complaints,incidents,dashboard}/**`), or
      other apps (`apps/api/**`, `apps/platform-admin-web/**`,
      `apps/driver-mobile-web/**`).
- [ ] If shared primitives in `packages/ui-web/**` need to change to support the
      dispatch detail surface, that work belongs in a sibling `MGMT-UI-*` task (most
      likely a follow-up to `MGMT-UI-005`), not in `OPS-UI-007`. The parent reviewer
      should reject shared-primitive edits sneaking into this slice. The parent diff is
      a **consumer** of the MGMT-UI-005 primitives, not a mutator of them.

### G. Commit evidence at parent finalize `[REQUIRED]`

Per `AI_COLLABORATION_GUIDE.md` §5 (commit evidence rule), parent `OPS-UI-007` is a
canonical implementation slice (not a sidecar), so `done` requires:

- [ ] Local task-scoped commit whose subject includes `OPS-UI-007`.
- [ ] Commit body trailers:
  - `LLM-Agent: Codex`
  - `Task-ID: OPS-UI-007`
  - `Reviewer: Claude`
- [ ] A normal non-force push, with `PUSH_REMOTE` / `PUSH_BRANCH` recorded in the
      `done` transition (current branch is `codex/dev-deploy-backend-android` per recent
      sibling slices).
- [ ] `done` transition runs through `scripts/ai-status.sh done OPS-UI-007` with
      `COMMIT_HASH` / `COMMIT_SUBJECT` / `PUSH_REMOTE` / `PUSH_BRANCH` set —
      `NO_COMMIT_REQUIRED=1` is **not** acceptable for the parent (only for sidecars
      like this one).
- [ ] If the parent owner field shifts back to `Codex2` before finalize, the commit
      `LLM-Agent` trailer must reflect the live owner at finalize time, not the owner
      named in this packet at packet-write time.

---

## 5. Reviewer Evidence Anchors

The sidecar reviewer (`Codex`) and, later, the parent reviewer (`Claude`) can use these
anchors to validate the eventual parent handoff without treating this packet as
canonical truth:

- `ai-status.json -> OPS-UI-007`
- `ai-status.json -> OPS-UI-007-SIDECAR-ACCEPTANCE`
- `ai-activity-log.jsonl` (filter on either id)
- `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`,
  section `### OPS-UI-007 — Dispatch Detail Workflow Hardening` (lines 536–561)
- `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md` (UI-OPS-03
  crosswalk)
- `apps/ops-console-web/app/dispatch/page.tsx`
- `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`
- `apps/ops-console-web/app/dispatch/forwarded-order-board.tsx`
- `apps/ops-console-web/app/dispatch/location-state.ts`
- `apps/ops-console-web/lib/translations.ts` (locale parity for any new dispatch copy)
- `packages/ui-web/src/index.tsx` (re-exports for the shared workflow primitives)
- `packages/ui-web/src/management-primitives.tsx` (shape of `Timeline`,
  `DetailMetadataGrid`, `WorkflowPanel`, `Stepper`, `StatusChip`, `AuthorityBadge`)
- `packages/ui-web/src/workflow-primitives.tsx` (shape of `WorkflowSplitLayout`,
  `WorkflowDetailDrawer`, `WorkflowEmptyState`, `ArtifactChipList`)

Reviewer-focused implementation checkpoints, derived from the parent design packet:

- The detail workspace must read as a workflow, not a static information panel. A
  reviewer who skims the diff should be able to walk action panel → compliance →
  candidate → timeline as a sequence of actionable steps (or visible gates), not as a
  set of decoupled widgets.
- The forwarded-vs-owned authority cues established by `OPS-UI-006` must remain visible
  inside the detail surface, with action verbs that imply fleet-internal authority
  hidden / disabled / annotated when the order is forwarded.
- Shared `Timeline` / `DetailMetadataGrid` / `WorkflowPanel` primitives (and friends)
  from `@drts/ui-web` must be the canonical shape of the workflow; local
  `.detail-card` / `.timeline-list` CSS may persist as a presentation tweak but must
  not host the canonical workflow shape.
- Locale parity for all new copy keys is non-negotiable.

---

## 6. Sidecar Acceptance Checklist

Mirrors `ai-status.json -> OPS-UI-007-SIDECAR-ACCEPTANCE.acceptance`:

- [x] Create support artifacts only.
- [x] Do not edit canonical truth.
- [x] Keep the packet scoped to acceptance framing, dependency mapping, and reviewer
      support.
- [x] Keep the dependency map aligned with current machine truth.
- [ ] Hand off the packet to the assigned reviewer (executed via
      `scripts/ai-status.sh handoff` after the packet is committed-equivalent in the
      working tree; sidecars use `NO_COMMIT_REQUIRED=1` at sidecar-`done` per L0 §5).

---

## 7. Reviewer Handoff Commands

Approve (sidecar only — does not approve or close parent `OPS-UI-007`, which still
needs to go through its own in_progress → review → review_approved → done lifecycle
under owner `Codex` and reviewer `Claude`):

```bash
AI_NAME=Codex ./scripts/ai-status.sh approve OPS-UI-007-SIDECAR-ACCEPTANCE \
  "Acceptance packet aligned with current machine truth: parent OPS-UI-007 is status=in_progress with owner=Codex reviewer=Claude; depends_on (OPS-UI-002 done, OPS-UI-006 done, MGMT-UI-005 done, OPS-MP-001 done, OPS-MP-002 done) is correct; design-packet Work block (workflow parity, candidate/compliance/timeline/action-panel coverage, authority-safe owned/forwarded cues, shared timeline/detail-metadata primitive reuse) is translated into a forward-looking acceptance checklist; downstream impact on MGMT-UI-002 is captured; reviewer evidence anchors point at apps/ops-console-web/app/dispatch/** and packages/ui-web/src/{management,workflow}-primitives.tsx without editing them."
```

Reopen if drift is found instead:

```bash
AI_NAME=Codex ./scripts/ai-status.sh reopen OPS-UI-007-SIDECAR-ACCEPTANCE \
  "packet needs revision: [specify machine-truth drift vs ai-status.json -> OPS-UI-007, dependency-map error, missing acceptance gate, or support-scope violation]"
```

Note: `reopen` of this sidecar must be limited to sidecar-document accuracy; it is not
a mechanism for litigating parent design choices. If the design packet itself needs
change, that is an `OPS-UI-007` parent-task decision, not a sidecar action. If the
parent task transitions while this sidecar is in `review` (e.g., parent moves from
`in_progress` to `review` or `review_approved`), the reviewer should treat that as
expected — this packet is forward-looking and intentionally does not snapshot transient
parent status (see §2).

---

## 8. Closeout Note

This sidecar is `task_class=sidecar` with `mutates_canonical=false`, so per
`AI_COLLABORATION_GUIDE.md` §5 commit evidence rule, owner closeout (`Claude` → `done`)
may use `NO_COMMIT_REQUIRED=1` after sidecar approval. The parent task `OPS-UI-007` is
**not** a sidecar — it is a canonical implementation slice that, when finalized, must go
through the full local-commit + push + done sequence with `COMMIT_HASH` /
`COMMIT_SUBJECT` / `PUSH_REMOTE` / `PUSH_BRANCH` recorded. Nothing in this packet
authorizes the parent owner to skip that sequence, nothing in this packet authorizes any
change to L1 / L2 truth or the design execution packet, and nothing in this packet
pre-approves the parent diff — the parent reviewer (`Claude`) remains the sole approver
of `OPS-UI-007`.

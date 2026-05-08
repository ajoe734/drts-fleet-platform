# OPS-UI-006 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `OPS-UI-006` — Owned And Forwarded Dispatch Board Authority Hardening
**Parent Owner:** `Codex2` (per `ai-status.json` — design execution packet originally
listed `Claude2`; this packet flags the drift but treats `ai-status.json` as truth.)
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-08` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify canonical truth,
the design execution packet, runtime behavior, or any L1/L2 product surface. For the live
machine-truth status of this sidecar row, read
`ai-status.json -> OPS-UI-006-SIDECAR-ACCEPTANCE.status` directly; this packet does not
snapshot it.

This packet is the forward-looking acceptance map for parent `OPS-UI-006`. The parent is
`todo` in machine truth at packet write — implementation has not started yet. The packet
exists so that when `Codex2` picks the parent up, the acceptance framing, dependency map,
and reviewer evidence anchors are already pinned to current truth and ready to be audited
against the eventual diff.

---

## 1. Scope Boundary

In scope:

- Translate the parent task's `acceptance` field and design-packet `Work` block into a
  concrete, citation-anchored acceptance checklist.
- Pin the dependency map and confirm each upstream slice is `done` in machine truth.
- Record the formal downstream tasks that depend on `OPS-UI-006`, so reviewer attention
  during parent finalize can correctly weigh blast-radius risk.
- Preserve a reviewer-handoff command block the assigned reviewer can run after the
  parent owner finalizes the slice.

Out of scope:

- editing L1 / L2 product truth (`phase1_*`, contracts bundle), the design execution
  packet, or the parent task's machine-truth fields (`ai-status.json -> OPS-UI-006`)
- editing `apps/ops-console-web/app/dispatch/**` or any other parent-write-scope file
- pre-running the parent's acceptance command, opening a parent-scoped commit, or
  altering parent ownership / reviewership
- predicting the specific shape of the parent diff before the parent owner writes it

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json -> OPS-UI-006-SIDECAR-ACCEPTANCE`

Persistent fields:

- owner=`Claude`
- reviewer=`Codex2`
- task_class=`sidecar`
- helper_parent=`OPS-UI-006`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- depends_on: `OPS-UI-002`, `MGMT-UI-004` (mirrors the parent's dependency set)
- artifacts: `support/sidecars/OPS-UI-006/OPS-UI-006-SIDECAR-ACCEPTANCE.md` (this file)
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

Live status (read directly from machine truth, not from this packet):

- The current value of `ai-status.json -> OPS-UI-006-SIDECAR-ACCEPTANCE.status` is the
  authoritative present state of this sidecar. This packet intentionally does not
  snapshot the live status — any such snapshot becomes false the moment the sidecar
  transitions (e.g., between owner handoff and reviewer read, or between approve and
  done). For the lifecycle history of this sidecar, see `ai-activity-log.jsonl`
  filtered on `OPS-UI-006-SIDECAR-ACCEPTANCE`.

### Parent — `ai-status.json -> OPS-UI-006`

- id=`OPS-UI-006`
- title=`Owned And Forwarded Dispatch Board Authority Hardening`
- owner=`Codex2`, reviewer=`Codex`
- status=`todo` (per snapshot at packet write, `last_update=2026-05-08T18:08:57Z`)
  - `next` field: chairman reassigned owner from `Claude2` to `Codex2` because the task
    is `backlog` (now `todo`), `Claude2` is exact-capacity-paused, and this ops-wave root
    is a dependency of `MGMT-UI-002`.
- depends_on: `OPS-UI-002`, `MGMT-UI-004`
- artifacts: `apps/ops-console-web/app/dispatch`
- acceptance: `pnpm --filter @drts/ops-console-web typecheck`
- execution_packet: `MGMT-UI-20260508`
- packet_path: `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`
- design_review: `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
- design_source: `docs/05-ui/drts.zip`
- phase: `Management Console Design Materialization`

This packet treats `ai-status.json` as authoritative for owner / reviewer. The design
execution packet's `### OPS-UI-006` block names `Claude2` as owner and `Codex` as
reviewer, but the chairman reassignment (recorded in the parent `next` field) moved the
owner to `Codex2` while the parent was still `backlog`, which is a legal pre-execution
swap. The sidecar reviewer should treat `ai-status.json -> OPS-UI-006.owner` as truth.

### Authoritative source documents

- L1 / L2 product truth — dispatch authority semantics (owned vs forwarded):
  - `phase1_prd_detailed_v1.md`
  - `phase1_service_contracts_v1.md`
- Design execution packet — parent slice spec:
  - `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`,
    section `### OPS-UI-006 — Owned And Forwarded Dispatch Board Authority Hardening`
    (lines 511–534 at packet write)
- Design review crosswalk (UI-OPS-02 → OPS-UI-006):
  - `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
  - design execution packet line 127: `UI-OPS-02 maps to new OPS-UI-006`
- Existing dispatch surface (read-only context for the sidecar; the parent owner edits
  these files, not this sidecar):
  - `apps/ops-console-web/app/dispatch/page.tsx`
  - `apps/ops-console-web/app/dispatch/forwarded-order-board.tsx`
  - `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`

---

## 3. Dependency Map

### Formal upstream dependencies

The parent's `depends_on` set is `OPS-UI-002`, `MGMT-UI-004`. Both are `done` in
`ai-status.json` at packet write.

| Dep ID        | Title                                                      | Owner  | Reviewer | Status (truth)               | What this slice provides to OPS-UI-006                                                                                                                                                                                                                                                     |
| ------------- | ---------------------------------------------------------- | ------ | -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPS-UI-002`  | Ops Dashboard Dispatch And Dispatch Detail Materialization | Codex2 | Claude2  | `done` (commit `4fc940c`)    | Materializes the dashboard-side `dispatch` route entry, owned/forwarded board scaffolding, and dispatch detail workspace under `apps/ops-console-web/app/dispatch/**`. OPS-UI-006 hardens the authority semantics on top of this surface; without it there is no dispatch route to harden. |
| `MGMT-UI-004` | Shared Table Filter And Status System Hardening            | Codex2 | Codex    | `done` (commit `8f5e5ea...`) | Provides the shared dense table, filter pills, status chips, and owned/forwarded authority badges in `packages/ui-web/src/index.tsx`. OPS-UI-006 must reuse these primitives for the owned vs forwarded board distinction instead of inventing a dispatch-only badge or status set.        |

Dependency assertion:

- The parent's owned-vs-forwarded hardening is a composition / specialization layer
  over the two upstream slices. No upstream slice needs to reopen for parent acceptance
  given the current snapshot.
- If `MGMT-UI-004` later reopens (shared authority-badge or status-chip shape changes),
  this dependency map and the parent's typecheck must be re-validated before the parent
  can finalize. The parent's `pnpm --filter @drts/ops-console-web typecheck` will pick
  up most shape drifts, but copy / semantic regressions in the shared badges would still
  need a manual sidecar-or-review check.

### Non-formal but spec-relevant upstream context

These tasks are referenced by the parent's design `Work` block but are **not** in the
parent's formal `depends_on`. They are listed here so the reviewer understands what the
"existing baseline" the parent must preserve actually is:

| Spec-relevant slice | Status (truth)               | Why it matters to OPS-UI-006                                                                                                                                                                    |
| ------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPS-UI-001`        | `done` (commit `51ebe89...`) | Establishes the original forwarded-board baseline that the design packet says OPS-UI-006 must "preserve and extend, not replace."                                                               |
| `MGMT-UI-001`       | `done` (commit `c9a51fd...`) | Provides shell / sidebar / shared management primitives that OPS-UI-002 already pulled in; OPS-UI-006 inherits this through `apps/ops-console-web` and should not re-skin sidebar-level chrome. |
| `MGMT-UI-003`       | `done` (commit `abaf01e...`) | Provides shared shell and surface-token hardening used by every Ops Console route; OPS-UI-006 should not regress shell tokens while editing the dispatch route.                                 |

These are informational anchors, not parent-acceptance gates.

### Formal downstream dependents

Tasks that currently declare `OPS-UI-006` as an upstream dependency in machine truth:

| Task          | Status    | Owner  | Reviewer | Why it depends on OPS-UI-006                                                                                                                                                                          |
| ------------- | --------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPS-UI-007`  | `backlog` | Codex2 | Claude   | Dispatch detail workflow hardening builds on the owned/forwarded authority cues OPS-UI-006 establishes (`Depends on: OPS-UI-002, OPS-UI-006, MGMT-UI-005, OPS-MP-001, OPS-MP-002` per design packet). |
| `MGMT-UI-002` | `todo`    | Codex  | Codex2   | The Management Console Verification Packet treats OPS-UI-006 as one of the materialization slices that must be `done` before assembling route-by-route evidence.                                      |

Blast-radius note for the parent reviewer (`Codex`):

- If the parent diff flattens the two boards into one generic order-board (the explicit
  anti-goal in the design packet's `Work` block), `OPS-UI-007` will inherit that flatness
  when it later builds the dispatch detail surface.
- If the parent introduces new owned-vs-forwarded authority badges or copy that diverge
  from `MGMT-UI-004`'s shared status / authority system, both `OPS-UI-007` and
  `MGMT-UI-002`'s evidence packet will need rework.

### Ordering guidance vs. formal blockers

The execution packet positions `OPS-UI-006` inside the Management Console Design
Materialization phase, immediately after `OPS-UI-002`, but the only formal blockers are
the dependencies recorded in `ai-status.json`. This sidecar does not introduce extra
prerequisites beyond machine truth.

---

## 4. Acceptance Checklist

Each item below is the parent acceptance gate rephrased as a concrete, citation-anchored
check the parent owner (`Codex2`) can self-verify before handing off, and the parent
reviewer (`Codex`) can audit at review time. The parent task is `todo` in machine truth
at packet write, so each item is forward-looking: it states the property the parent diff
must satisfy, not a property already observed.

Legend: `[REQUIRED]` = explicit gate from the design packet `Work` block or from
`ai-status.json -> acceptance`. `[DERIVED]` = unwritten but implied by the design packet
or by the L0 / L2 collaboration rules; the parent reviewer may treat these as
informational.

### A. Board distinctness `[REQUIRED]`

Design packet `Work`:

> Make the `Owned` and `Forwarded` dispatch boards explicitly distinct in board
> structure, table schema, badge language, and queue semantics.

The parent diff must satisfy:

- [ ] Two visibly separate boards (or two clearly differentiated views toggled by an
      authority-aware control), each with its own header / framing copy in
      `apps/ops-console-web/app/dispatch/page.tsx` or sibling files under
      `apps/ops-console-web/app/dispatch/**`.
- [ ] Distinct **table schemas** between owned and forwarded — owned-board columns may
      not be a subset/superset relabel of forwarded-board columns. The owned board carries
      fleet-internal authority columns (e.g., assigned driver / vehicle); the forwarded
      board carries platform-handoff columns (e.g., upstream platform, manual fallback,
      sync state). The exact column names live in the parent diff; the rule is they must
      reflect different authority surfaces.
- [ ] Distinct **badge language**. Owned-board badges express fleet-side authority
      (e.g., `owned`, in-house dispatcher cues). Forwarded-board badges express
      platform-handoff authority (e.g., `forwarded`, `awaiting platform`, `manual
fallback`). Both sets must come from the shared `StatusChip` / authority-badge
      primitives in `packages/ui-web/src/index.tsx` introduced by `MGMT-UI-004`, not from
      a new dispatch-only badge variant.
- [ ] Distinct **queue semantics**. The two boards do not share an internal data shape
      that flattens both into one generic order list — the implementation maintains an
      explicit branching point (e.g., the existing `view === "owned"` vs `view ===
"forwarded"` split at `apps/ops-console-web/app/dispatch/page.tsx:27,45,98`) rather
      than a single homogenized board feed.

### B. Forwarded-board baseline preservation `[REQUIRED]`

Design packet `Work`:

> Preserve the already-completed forwarded-board baseline from `OPS-UI-001` and extend
> it instead of replacing it.

The parent diff must satisfy:

- [ ] The forwarded-order-board surface (`apps/ops-console-web/app/dispatch/forwarded-order-board.tsx`,
      introduced/extended by `OPS-UI-001` and reused by `OPS-UI-002`) is **extended, not
      replaced**. New owned-board work goes in a sibling component or a clearly partitioned
      section of `page.tsx`; it does not delete or fold `forwarded-order-board.tsx` into a
      generic surface.
- [ ] Forwarded-board KPIs already established by `OPS-UI-002` — `dispatch.forwarded.kpi.awaitingPlatform`,
      `dispatch.forwarded.kpi.syncFailed`, `dispatch.forwarded.kpi.manualFallback` (visible
      at `apps/ops-console-web/app/dispatch/page.tsx:144,150,156` and the surrounding
      block) — are preserved. Any rename or removal must be deliberately recorded in the
      parent's `next` / handoff note.
- [ ] Existing forwarded-board copy keys in the i18n table
      (`apps/ops-console-web/lib/translations.ts`, used at
      `apps/ops-console-web/app/dispatch/page.tsx:80,84,130-156`) are preserved or
      superseded with both `en` and `zh` parity. No string is dropped from one locale and
      kept in the other.

### C. Anti-flattening guardrail `[REQUIRED]`

Design packet `Work`:

> Do not allow local UI abstraction to flatten both boards into one generic
> order-board surface.

The parent diff must satisfy:

- [ ] No new `OrderBoard` / `GenericDispatchBoard` / similar abstraction is introduced
      that hosts both owned and forwarded data behind a single rendering pass and a thin
      variant prop. If a shared internal helper is introduced, it must be a presentation
      primitive (e.g., a row renderer for the dense table) and must not collapse the
      owned/forwarded **business semantics**.
- [ ] The owned vs forwarded branch in the route handler stays explicit and reads
      authority intent from URL / query state (the existing
      `view === "owned"` / `view === "forwarded"` split at lines 27, 45, 98 of
      `apps/ops-console-web/app/dispatch/page.tsx` is the current expression of this; the
      parent may reshape it, but the explicit branch must remain).
- [ ] Server-side data loaders for the two boards remain authority-distinct: the
      forwarded board's loader (already pulling forwarded orders, adapter health,
      reconciliation issues at `apps/ops-console-web/app/dispatch/page.tsx:99`) is not
      merged with an owned-board loader into a single `getDispatchBoards()` that erases
      the authority boundary.

### D. Recorded acceptance command `[REQUIRED]`

`ai-status.json -> OPS-UI-006 -> acceptance`:

- [ ] `pnpm --filter @drts/ops-console-web typecheck`
  - Parent owner (`Codex2`) must run this on the final pre-commit state and record
    PASS in the parent's `next` / handoff note before handoff to the parent reviewer.
  - Parent reviewer (`Codex`) re-confirms PASS at `review_approved`.
  - The sidecar does **not** re-run this command. The reviewer-recorded and
    owner-confirmed PASS in machine truth is the authoritative signal.

### E. Translation parity `[DERIVED]`

- [ ] Any new copy strings introduced by the parent diff appear in both the `en` and
      `zh` branches of `apps/ops-console-web/lib/translations.ts` (or, if introduced as
      inline component copy, in both locale branches of the local copy map). No string is
      added in only one locale. This mirrors the L0 collaboration discipline already
      observed by sibling sidecars (`OPS-UI-003`, `ADM-UI-006`).

### F. Scope containment `[DERIVED]`

The design packet's `Write scope` for OPS-UI-006 is:

- `apps/ops-console-web/app/dispatch/page.tsx`
- `apps/ops-console-web/app/dispatch/**`

The parent diff must satisfy:

- [ ] `git diff --stat HEAD` against the parent's pre-commit state shows changes only
      inside `apps/ops-console-web/app/dispatch/**`, plus locale strings under
      `apps/ops-console-web/lib/translations.ts` if new copy is introduced.
- [ ] No edits leak into `phase1_*` truth, the design execution packet, the contracts
      bundle (`packages/contracts/**`), other Ops Console routes
      (`apps/ops-console-web/app/{callcenter,complaints,incidents,dashboard}/**`), or other
      apps (`apps/api/**`, `apps/platform-admin-web/**`, `apps/driver-mobile-web/**`).
- [ ] If shared primitives in `packages/ui-web/**` need to change, that work belongs
      in a sibling `MGMT-UI-*` task, not in `OPS-UI-006`. The parent reviewer should reject
      shared-primitive edits sneaking into this slice.

### G. Commit evidence at parent finalize `[REQUIRED]`

Per `AI_COLLABORATION_GUIDE.md` §5 (commit evidence rule), parent `OPS-UI-006` is a
canonical implementation slice (not a sidecar), so `done` requires:

- [ ] Local task-scoped commit whose subject includes `OPS-UI-006`.
- [ ] Commit body trailers:
  - `LLM-Agent: Codex2`
  - `Task-ID: OPS-UI-006`
  - `Reviewer: Codex`
- [ ] A normal non-force push, with `PUSH_REMOTE` / `PUSH_BRANCH` recorded in the
      `done` transition (current branch is `codex/dev-deploy-backend-android` per recent
      sibling slices).
- [ ] `done` transition runs through `scripts/ai-status.sh done OPS-UI-006` with
      `COMMIT_HASH` / `COMMIT_SUBJECT` / `PUSH_REMOTE` / `PUSH_BRANCH` set — `NO_COMMIT_REQUIRED=1`
      is **not** acceptable for the parent (only for sidecars like this one).

---

## 5. Reviewer Evidence Anchors

The sidecar reviewer (`Codex2`) and, later, the parent reviewer (`Codex`) can use these
anchors to validate the eventual parent handoff without treating this packet as
canonical truth:

- `ai-status.json -> OPS-UI-006`
- `ai-status.json -> OPS-UI-006-SIDECAR-ACCEPTANCE`
- `ai-activity-log.jsonl` (filter on either id)
- `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`,
  section `### OPS-UI-006 — Owned And Forwarded Dispatch Board Authority Hardening`
- `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md` (UI-OPS-02
  crosswalk)
- `apps/ops-console-web/app/dispatch/page.tsx`
- `apps/ops-console-web/app/dispatch/forwarded-order-board.tsx`
- `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`
- `apps/ops-console-web/lib/translations.ts` (locale parity for any new dispatch copy)
- `packages/ui-web/src/index.tsx` (shared `StatusChip` / authority-badge primitives the
  parent diff must reuse, sourced from `MGMT-UI-004`)

Reviewer-focused implementation checkpoints, derived from the parent design packet:

- The two-board distinction must read as authority-aware, not just visual. A reviewer
  who skims the diff should be able to identify which board is owned and which is
  forwarded from the schema and badge copy alone.
- The forwarded-board baseline established by `OPS-UI-001` and extended by `OPS-UI-002`
  must still be present and functional after the parent diff.
- Any shared abstraction introduced inside `apps/ops-console-web/app/dispatch/**` must
  be presentation-only; business semantics for owned vs forwarded must remain explicit
  in the route.
- Locale parity for all new copy keys is non-negotiable.

---

## 6. Sidecar Acceptance Checklist

Mirrors `ai-status.json -> OPS-UI-006-SIDECAR-ACCEPTANCE.acceptance`:

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

Approve (sidecar only — does not approve or close parent `OPS-UI-006`, which still
needs to go through its own backlog → todo → in_progress → review → review_approved →
done lifecycle under owner `Codex2` and reviewer `Codex`):

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh approve OPS-UI-006-SIDECAR-ACCEPTANCE \
  "Acceptance packet aligned with current machine truth: parent OPS-UI-006 is status=todo with owner=Codex2 reviewer=Codex; depends_on (OPS-UI-002 done, MGMT-UI-004 done) is correct; design-packet Work block (board distinctness, OPS-UI-001 baseline preservation, anti-flattening guardrail) is translated into a forward-looking acceptance checklist; downstream impact on OPS-UI-007 and MGMT-UI-002 is captured; reviewer evidence anchors point at apps/ops-console-web/app/dispatch/** and packages/ui-web/src/index.tsx without editing them."
```

Reopen if drift is found instead:

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh reopen OPS-UI-006-SIDECAR-ACCEPTANCE \
  "packet needs revision: [specify machine-truth drift vs ai-status.json -> OPS-UI-006, dependency-map error, missing acceptance gate, or support-scope violation]"
```

Note: `reopen` of this sidecar must be limited to sidecar-document accuracy; it is not a
mechanism for litigating parent design choices. If the design packet itself needs
change, that is an `OPS-UI-006` parent-task decision, not a sidecar action. If the
parent task transitions while this sidecar is in `review` (e.g., parent moves from
`todo` to `in_progress`), the reviewer should treat that as expected — this packet is
forward-looking and intentionally does not snapshot transient parent status (see §2).

---

## 8. Closeout Note

This sidecar is `task_class=sidecar` with `mutates_canonical=false`, so per
`AI_COLLABORATION_GUIDE.md` §5 commit evidence rule, owner closeout (`Claude` → `done`)
may use `NO_COMMIT_REQUIRED=1` after sidecar approval. The parent task `OPS-UI-006` is
**not** a sidecar — it is a canonical implementation slice that, when picked up, must go
through the full local-commit + push + done sequence with `COMMIT_HASH` /
`COMMIT_SUBJECT` / `PUSH_REMOTE` / `PUSH_BRANCH` recorded. Nothing in this packet
authorizes the parent owner to skip that sequence, nothing in this packet authorizes any
change to L1 / L2 truth or the design execution packet, and nothing in this packet
pre-approves the parent diff — the parent reviewer (`Codex`) remains the sole approver
of `OPS-UI-006`.

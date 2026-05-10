# ADM-UI-RD-007 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `ADM-UI-RD-007` - Wave 3 platform-admin Pricing redesign
(includes publish flow)
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Codex`
**Sidecar Reviewer:** `Gemini2`
**Generated:** `2026-05-10` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify
canonical truth, runtime behavior, the parent implementation, or
`ai-status.json`.

This packet is the reviewer-facing acceptance companion for the Wave 3
platform-admin slice that redesigns `PA_Pricing` and keeps the publish
workflow visible inside the same `/pricing` governance surface. The
parent task ships its implementation under
`apps/platform-admin-web/app/pricing/page.tsx`; this packet pins the
machine-truth anchors, dependency map, and reviewer checklist that the
parent reviewer (`Codex`) is expected to apply against that work.

Transient parent lifecycle truth (`status`, `next`, `last_update`, and
eventual `commit_*` / `push_*` fields) remains authoritative only in
`ai-status.json`. This packet intentionally does not snapshot those
fields.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar
  (`pnpm --filter @drts/platform-admin-web typecheck / build / test`
  plus `Storybook 對照對應 PA_* artboard`) as a concrete reviewer
  checklist for the `/pricing` surface
- pin the machine-truth dependency on `ADM-UI-RD-002` + `OPS-UI-RD-009`,
  with `ADM-UI-RD-001` recorded as a transitive shell prerequisite
- enumerate the verifiable anchors the parent implementation must hit:
  `Platform Admin.html#pricing`, `PA_Pricing`, the shared shell
  composition, and a pricing Storybook target that also covers the
  publish flow
- make explicit that "publish flow" is part of the `PA_Pricing`
  surface, not a separate artboard or separate hard acceptance bar
- record the structural shape of the parent task so the reviewer can
  audit it without re-deriving the same context from planning docs and
  dependency tasks

Out of scope:

- editing L1/L2 product truth, the platform-admin app source, the
  planning ref, the design canvas, Storybook sources, or `ai-status.json`
- re-running parent acceptance commands; those belong to the parent
  review cycle, not this sidecar packet
- recording `commit_hash`, `commit_subject`, `push_remote`, or
  `push_branch` evidence for the parent task; that is the parent
  owner's responsibility after parent review approval
- inventing a new formal dependency or a new acceptance target such as
  `Platform Admin.html#publish` or `platform-publish.stories.tsx`
- mutating or "absorbing" the parent task; absorption remains the
  parent owner's decision

---

## 2. Machine Truth Anchors

### Sidecar (this task) - `ai-status.json -> ADM-UI-RD-007-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Gemini2`
- depends_on=`ADM-UI-RD-002`, `OPS-UI-RD-009`
- task_class=`sidecar`
- helper_parent=`ADM-UI-RD-007`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/ADM-UI-RD-007/ADM-UI-RD-007-SIDECAR-ACCEPTANCE.md`
- live lifecycle fields intentionally deferred to `ai-status.json`:
  - `status`
  - `next`
  - `last_update`

### Parent - `ai-status.json -> ADM-UI-RD-007`

- owner=`Codex2`
- reviewer=`Codex`
- phase=`Wave 3`
- depends_on=`ADM-UI-RD-002`, `OPS-UI-RD-009`
- acceptance=
  - `pnpm --filter @drts/platform-admin-web typecheck / build / test`
  - `Storybook 對照對應 PA_* artboard`
- artifact root=`apps/platform-admin-web/`
- planning_ref=`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- planning summary=`Pricing redesign (含 publish flow)`
- active Wave 3 branch context already carrying the parent prerequisites=
  `origin/feat/claude2-ui-redesign-foundation`

### Upstream dependencies (all `done` in `ai-status.json`)

| Dep ID          | Status | Reviewer of record | Approved (UTC)         | Shipped commit | Primary artifact root                                                                    |
| --------------- | ------ | ------------------ | ---------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `ADM-UI-RD-002` | `done` | `Codex`            | `2026-05-10T20:50:01Z` | `edcf7e0`      | `apps/platform-admin-web/app/globals.css` plus the admin CSS hook removal baseline       |
| `OPS-UI-RD-009` | `done` | `Claude`           | `2026-05-10T20:44:49Z` | `acaf6ab`      | `docs/05-ui/ops-console-redesign-closeout-20260510.md` as the Wave 2 acceptance template |

Transitive shell prerequisite (not in the parent's explicit `depends_on`
but load-bearing for any Wave 3 platform-admin redesign slice):

| Dep ID          | Status | Reviewer of record | Approved (UTC)         | Shipped commit | Primary artifact root                                                              |
| --------------- | ------ | ------------------ | ---------------------- | -------------- | ---------------------------------------------------------------------------------- |
| `ADM-UI-RD-001` | `done` | `Codex2`           | `2026-05-10T18:53:13Z` | `516321d`      | `apps/platform-admin-web/components/platform-shell.tsx` adopting `ManagementShell` |

Branch presence assertion:

- every commit hash above resolves on
  `origin/feat/claude2-ui-redesign-foundation` at packet generation
  time (verified via `git branch -r --contains <sha>`)

### Authoritative supporting documents

- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
  (Wave 3 task list; line 435 names `ADM-UI-RD-007` as
  `Pricing redesign (含 publish flow)`)
- `docs/05-ui/drts-design-canvas/Platform Admin.html`
  (design source of truth; line 82 binds `id="pricing"` to
  `<PA_Pricing />`)
- `docs/05-ui/drts-design-canvas/platform-screens.jsx`
  (`PA_Pricing` definition begins at line 361 and remains exported at
  line 633)
- `apps/platform-admin-web/app/pricing/page.tsx`
  (parent surface target; the current implementation already treats the
  publish workflow as part of the pricing page and renders it through
  `WorkflowPanel` + `Stepper`)
- `apps/platform-admin-web/app/layout.tsx`
  and `apps/platform-admin-web/components/platform-shell.tsx`
  (shared shell composition path: `PlatformShell -> ManagementShell`)
- `packages/ui-web/src/platform-pricing.stories.tsx`
  (existing pricing parity target on the current Wave 3 working branch;
  its canvas link points at `Platform Admin.html#pricing` and it
  includes publish-flow content inside the same story)
- `packages/ui-web/src/platform-shell.stories.tsx`
  (shell baseline; useful when reviewing whether `/pricing` stays on
  the shared platform-admin shell)

Repository shape assertion at packet generation time:

- `apps/platform-admin-web/app/pricing/page.tsx` exists
- no separate `apps/platform-admin-web/app/publish/*` route exists
- no separate `Platform Admin.html#publish` or `PA_Publish` anchor
  exists in the design canvas
- no separate `platform-publish.stories.tsx` story exists under
  `packages/ui-web/src/`

---

## 3. Dependency Map

### A. Upstream machine-truth dependencies

| Dep ID          | What it contributes to `ADM-UI-RD-007`                                                                                                                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-002` | Removes legacy `.admin-*` styling hooks (`edcf7e0`), which is the precondition for redesigning `/pricing` onto shared `@drts/ui-web` primitives without reintroducing ad-hoc platform-admin chrome.                                                                                                                   |
| `OPS-UI-RD-009` | Provides the accepted Wave 2 closeout template (`acaf6ab` over `5696358`): surface -> reviewer -> approved-at -> commit -> canvas/story anchor. `ADM-UI-RD-007` mirrors that evidence discipline for its own pricing redesign acceptance. It is a structural sibling / template dependency, not a runtime dependency. |

Transitive (shell):

| Dep ID          | What it contributes to `ADM-UI-RD-007`                                                                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ADM-UI-RD-001` | Adopts `ManagementShell` in `PlatformShell` (`516321d`), which is what makes the pricing redesign mechanically able to live inside the new shared shell. The publish flow in this task is therefore a workflow panel inside `/pricing`, not a legacy standalone admin surface. |

Assertions:

- the parent task is not introducing a third acceptance bar beyond
  `pnpm --filter @drts/platform-admin-web typecheck / build / test`
  and `Storybook 對照對應 PA_* artboard`
- the phrase "含 publish flow" in the planning ref describes a sub-flow
  of the pricing surface, not a second canonical artboard or separate
  route that would need its own machine-truth dependency edge
- no new hard `depends_on` edge is asserted in this packet beyond the
  two already recorded in `ai-status.json`
- `ADM-UI-RD-001` is recorded only as transitive/load-bearing context,
  not as a proposed machine-truth dependency change

### B. Downstream consumer map

`ADM-UI-RD-007` is a mid-wave platform-admin redesign slice. Its direct
machine-truth dependencies are upstream only; downstream consumers are
review and closeout artifacts that will cite its eventual evidence.

| Consumer                            | Relationship                    | Why `ADM-UI-RD-007` matters                                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-008`                     | adjacent Wave 3 surface         | Payments / reconciliation is the other half of the "Pricing & Settlement" navigation cluster. Reviewers will expect the pricing governance language and fee-plan publication cues to stay visually coherent across the pair. |
| `ADM-UI-RD-010`                     | Wave 3 platform closeout packet | The eventual closeout row for pricing will cite this task's reviewer, approval timestamp, commit hash, canvas anchor, and parity-story evidence the same way Wave 2 cited each ops slice.                                    |
| Future platform-admin redesign work | reference baseline              | Later slices can reference this packet to avoid re-litigating whether publish flow belongs inside `PA_Pricing` or as a separate acceptance target.                                                                           |

Dispatch interpretation:

- no `ai-status.json` task currently records a hard machine-truth
  `depends_on` edge to `ADM-UI-RD-007`
- the consumers above are review/closeout/reference consumers, not
  formal dependency edges, and should not be promoted into machine
  truth without an explicit decision

---

## 4. Acceptance Checklist

This checklist restates the parent acceptance bar -
`pnpm --filter @drts/platform-admin-web typecheck / build / test`
plus `Storybook 對照對應 PA_* artboard` - as concrete review items for
the pricing surface. The intent is to make the reviewer check the real
target: `/pricing` aligned with `PA_Pricing`, where the publish flow is
part of the same composed surface.

Legend: `[REQUIRED]` = explicit parent acceptance bar. `[DERIVED]` =
reviewer support gate for this packet.

### A. Build / typecheck / test `[REQUIRED]`

- [ ] `pnpm --filter @drts/platform-admin-web typecheck` passes locally
      at the parent's review commit, with no new errors attributable to
      the pricing redesign or its publish-flow controls.
- [ ] `pnpm --filter @drts/platform-admin-web build` passes locally at
      the parent's review commit. `next-env.d.ts` regeneration noise is
      tolerable; substantive build failures are not.
- [ ] `pnpm --filter @drts/platform-admin-web test` passes locally at
      the parent's review commit. If the package still has no test
      target, the reviewer records that explicitly rather than silently
      skipping the bar.

### B. Storybook parity vs. `PA_Pricing` `[REQUIRED]`

- [ ] The redesigned `/pricing` page composes the shared shell
      (`PlatformShell -> ManagementShell`) and renders with
      `@drts/ui-web` primitives rather than reintroducing legacy
      platform-admin chrome or stripped `.admin-*` hooks.
- [ ] The surface remains anchored to the single pricing artboard
      `Platform Admin.html#pricing`, not to a new implicit "publish"
      artboard. Publish flow may be prominent, but it remains part of
      the pricing governance page.
- [ ] A Storybook target exists under `packages/ui-web/src/` that
      mirrors `PA_Pricing` and includes the same publish-flow emphasis.
      At packet generation time the working branch already contains
      `platform-pricing.stories.tsx`, which is the expected parity
      target unless the parent owner intentionally replaces it and cites
      the replacement in the handoff note.
- [ ] The parity target covers the structural zones visible in
      `PA_Pricing`: page header, authority / guardrail framing,
      publish-flow `WorkflowPanel` + `Stepper`, pricing rules table,
      fee-plan publication/snapshot panel, and release posture summary.
- [ ] If the parent task splits the pricing story into multiple stories
      or introduces an additional composed target, the handoff note must
      cite the exact file path(s) and explain how they still map back to
      the single `#pricing` artboard.

### C. Canvas anchor existence `[REQUIRED]`

- [ ] `Platform Admin.html#pricing` exists in
      `docs/05-ui/drts-design-canvas/Platform Admin.html` (verified at
      packet time: line 82 binds `id="pricing"` to `<PA_Pricing />`).
- [ ] `PA_Pricing` remains defined and exported from
      `docs/05-ui/drts-design-canvas/platform-screens.jsx`
      (verified at packet time: definition at line 361, export at line
      633).
- [ ] No separate `#publish` / `PA_Publish` anchor exists in the design
      canvas at packet generation time. Review should not fail by
      looking for one unless the parent task explicitly adds it and
      records that design change elsewhere.

### D. Machine-truth consistency `[REQUIRED]`

- [ ] The parent task's eventual `commit_hash` resolves on the branch
      recorded in machine truth (`push_remote` / `push_branch`). If the
      parent owner lands the work somewhere other than
      `origin/feat/claude2-ui-redesign-foundation`, that divergence must
      be captured in `ai-status.json` rather than silently assumed.
- [ ] The parent's commit subject contains `ADM-UI-RD-007` and the
      commit body includes the required trailers
      (`LLM-Agent`, `Task-ID`, `Reviewer`), per
      `AI_COLLABORATION_GUIDE.md` section 5.
- [ ] The parent's `review_approved` event records the reviewer of
      record (`Codex`) and an approval UTC timestamp.
- [ ] The parent handoff / closeout note cites the exact Storybook file
      or files used for `PA_Pricing` parity, especially if they differ
      from `packages/ui-web/src/platform-pricing.stories.tsx`.

### E. Sidecar handoff readiness `[DERIVED]`

- [ ] This packet matches the current machine-truth owner / reviewer
      assignment for both the sidecar (`Codex` / `Gemini2`) and the
      parent task (`Codex2` / `Codex`).
- [ ] This packet does not snapshot live parent `status` / `next` /
      `last_update` / eventual `commit_*` values; those remain
      authoritative in `ai-status.json`.
- [ ] This packet does not edit canonical truth - the planning ref, the
      design canvas, the platform-admin app source, Storybook sources,
      and `ai-status.json` all remain untouched by this sidecar.
- [ ] This packet does not record `done` evidence for the parent task;
      that step remains the parent owner's responsibility after parent
      review approval.

---

## 5. Reviewer Focus

For `Gemini2` reviewing this sidecar:

- confirm the machine-truth anchor section matches current
  `ai-status.json` fields for both `ADM-UI-RD-007-SIDECAR-ACCEPTANCE`
  and `ADM-UI-RD-007`, with mutable lifecycle truth deferred to
  `ai-status.json`
- confirm the upstream dependency table matches the two `done`
  dependencies' `commit_hash` / `commit_recorded_at` /
  `commit_reviewer` values, and that `ADM-UI-RD-001` is recorded only
  as transitive shell context
- confirm the packet treats publish flow as part of the pricing surface
  (`/pricing`, `PA_Pricing`, `platform-pricing.stories.tsx`) rather
  than inventing a separate artboard/story requirement
- confirm the downstream map does not assert any hard machine-truth
  `depends_on` edges that do not exist in `ai-status.json`
- confirm the packet remains support-only and does not modify the
  planning ref, the design canvas, platform-admin source, Storybook
  files, or `ai-status.json`

---

## 6. Handoff Summary

This sidecar packet is stable reviewer support material for
`ADM-UI-RD-007` (platform-admin Pricing redesign including publish flow).
The parent task remains the canonical implementation slice; this packet
is a reviewer companion that:

- pins the two upstream `done` evidence pairs plus the transitive shell
  prerequisite in one place
- restates the parent acceptance bar as an auditable checklist against
  `/pricing`
- clarifies the real parity target: `PA_Pricing` /
  `Platform Admin.html#pricing`, with publish flow embedded inside that
  surface rather than split out as a second acceptance target
- defers all live lifecycle truth and eventual commit evidence to
  `ai-status.json`

After sidecar review approval the packet is intended to remain under
`support/sidecars/ADM-UI-RD-007/` as a stable reviewer reference. It is
not absorbed into canonical truth and does not change any other
artifact.

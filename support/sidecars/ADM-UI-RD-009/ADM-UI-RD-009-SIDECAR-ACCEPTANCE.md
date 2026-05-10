# ADM-UI-RD-009 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `ADM-UI-RD-009` - Wave 3 platform-admin
Notices + Audit + Flags + Adapters redesign
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-10` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify
canonical truth, runtime behavior, the parent implementation, or
`ai-status.json`.

This packet is the reviewer-facing acceptance companion for the Wave 3
platform-admin slice that redesigns the four sibling surfaces grouped
under canvas section `07 · 平台層治理`: `PA_Notices`, `PA_Audit`,
`PA_Flags`, and `PA_Adapters`. The parent task ships its implementation
across the four platform-admin routes `/notices`, `/audit`,
`/feature-flags`, and `/adapter-registry`; this packet pins the
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
  checklist for the four sibling surfaces `/notices`, `/audit`,
  `/feature-flags`, and `/adapter-registry`
- pin the machine-truth dependency on `ADM-UI-RD-002` + `OPS-UI-RD-009`,
  with `ADM-UI-RD-001` recorded as a transitive shell prerequisite
- enumerate the verifiable anchors the parent implementation must hit:
  `Platform Admin.html#notices`, `Platform Admin.html#audit`,
  `Platform Admin.html#flags`, `Platform Admin.html#adapters`, the
  corresponding `PA_Notices`, `PA_Audit`, `PA_Flags`, `PA_Adapters`
  definitions, the shared shell composition, and Storybook parity
  targets for each artboard
- record the route ↔ anchor mapping explicitly, because two of the four
  app routes use longer English names than their canvas anchors
  (`/feature-flags` ↔ `#flags`, `/adapter-registry` ↔ `#adapters`)
- make explicit that `ADM-UI-RD-009` is one combined slice covering all
  four sibling artboards in canvas section `platform-layer`, not four
  separate canonical tasks
- record the structural shape of the parent task so the reviewer can
  audit it without re-deriving the same context from planning docs and
  dependency tasks

Out of scope:

- editing L1/L2 product truth, the platform-admin app source, the
  planning ref, the design canvas, Storybook sources, or
  `ai-status.json`
- re-running parent acceptance commands; those belong to the parent
  review cycle, not this sidecar packet
- recording `commit_hash`, `commit_subject`, `push_remote`, or
  `push_branch` evidence for the parent task; that is the parent
  owner's responsibility after parent review approval
- promoting `ADM-UI-RD-001` from transitive context to a hard
  machine-truth `depends_on` edge
- renaming the app routes to align with the canvas anchors, or renaming
  the canvas anchors to align with the app routes; either change would
  be a separate design / contract decision outside this packet's scope
- splitting `ADM-UI-RD-009` into four separate canonical tasks or
  inventing extra acceptance bars beyond what the parent task already
  records
- mutating or "absorbing" the parent task; absorption remains the
  parent owner's decision

---

## 2. Machine Truth Anchors

### Sidecar (this task) - `ai-status.json -> ADM-UI-RD-009-SIDECAR-ACCEPTANCE`

- owner=`Claude`
- reviewer=`Codex2`
- depends_on=`ADM-UI-RD-002`, `OPS-UI-RD-009`
- task_class=`sidecar`
- helper_parent=`ADM-UI-RD-009`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- artifacts=`support/sidecars/ADM-UI-RD-009/ADM-UI-RD-009-SIDECAR-ACCEPTANCE.md`
- live lifecycle fields intentionally deferred to `ai-status.json`:
  - `status`
  - `next`
  - `last_update`

### Parent - `ai-status.json -> ADM-UI-RD-009`

- title=`Notices + Audit + Flags + Adapters redesign`
- summary_zh=`PA_Notices + PA_Audit + PA_Flags + PA_Adapters。`
- phase=`Wave 3`
- owner=`Codex2`
- reviewer=`Codex`
- depends_on=`ADM-UI-RD-002`, `OPS-UI-RD-009`
- acceptance:
  - `pnpm --filter @drts/platform-admin-web typecheck / build / test`
  - `Storybook 對照對應 PA_* artboard`
- artifact root=`apps/platform-admin-web/`
- planning_ref=`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- active Wave 3 branch context already carrying the parent
  prerequisites=`origin/feat/claude2-ui-redesign-foundation`

Volatile parent lifecycle fields are not pinned here:

- `status`
- `next`
- `last_update`
- any future `commit_*` / `push_*` fields

### Upstream dependencies (all `done` in `ai-status.json`)

| Dep ID          | Status | Reviewer of record | Approved (UTC)         | Shipped commit | Primary artifact root                                                                    |
| --------------- | ------ | ------------------ | ---------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `ADM-UI-RD-002` | `done` | `Codex`            | `2026-05-10T20:50:01Z` | `edcf7e0`      | `apps/platform-admin-web/app/globals.css` plus the admin CSS hook removal baseline       |
| `OPS-UI-RD-009` | `done` | `Claude`           | `2026-05-10T20:44:49Z` | `acaf6ab`      | `docs/05-ui/ops-console-redesign-closeout-20260510.md` as the Wave 2 acceptance template |

Transitive shell prerequisite (not in the parent's explicit
`depends_on`, but load-bearing for any Wave 3 platform-admin redesign
slice):

| Dep ID          | Status | Reviewer of record | Approved (UTC)         | Shipped commit | Primary artifact root                                                              |
| --------------- | ------ | ------------------ | ---------------------- | -------------- | ---------------------------------------------------------------------------------- |
| `ADM-UI-RD-001` | `done` | `Codex2`           | `2026-05-10T18:53:13Z` | `516321d`      | `apps/platform-admin-web/components/platform-shell.tsx` adopting `ManagementShell` |

Branch presence assertion:

- every commit hash above resolves on
  `origin/feat/claude2-ui-redesign-foundation` at packet generation
  time (verified via `git branch -r --contains <sha>`)

### Authoritative supporting documents

- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
  (Wave 3 task list; line 437 names `ADM-UI-RD-009` as
  `Notices + Audit + Flags + Adapters redesign`)
- `docs/05-ui/drts-design-canvas/Platform Admin.html`
  (design source of truth; the canvas section
  `id="platform-layer"` titled `07 · 平台層治理` groups the four
  sibling artboards; line 91 binds `id="notices"` to `<PA_Notices />`,
  line 92 binds `id="audit"` to `<PA_Audit />`, line 93 binds
  `id="flags"` to `<PA_Flags />`, line 94 binds `id="adapters"` to
  `<PA_Adapters />`)
- `docs/05-ui/drts-design-canvas/platform-screens.jsx`
  (`PA_Notices` defined at line 527, `PA_Audit` defined at line 562,
  `PA_Flags` defined at line 590, `PA_Adapters` defined at line 610;
  all four remain jointly exported at line 634)
- `apps/platform-admin-web/app/notices/page.tsx`
  (parent surface target for `PA_Notices`; current implementation
  imports `@drts/ui-web` primitives)
- `apps/platform-admin-web/app/audit/page.tsx`
  (parent surface target for `PA_Audit`; current implementation imports
  `@drts/ui-web` primitives)
- `apps/platform-admin-web/app/feature-flags/page.tsx`
  (parent surface target for `PA_Flags`; current implementation imports
  `@drts/ui-web` primitives)
- `apps/platform-admin-web/app/adapter-registry/page.tsx` plus
  `apps/platform-admin-web/app/adapter-registry/components/`
  (parent surface target for `PA_Adapters`; current implementation
  imports `@drts/ui-web` primitives such as `PageHeader` and composes
  `AdapterList` + `EditAdapterModal` helpers)
- `apps/platform-admin-web/app/layout.tsx`
  and `apps/platform-admin-web/components/platform-shell.tsx`
  (shared shell composition path: `PlatformShell -> ManagementShell`;
  the shell already names the four sibling routes `/notices`,
  `/audit`, `/feature-flags`, `/adapter-registry` with both English and
  Chinese governance copy)

Repository shape assertion at packet generation time:

- `apps/platform-admin-web/app/notices/page.tsx` exists
- `apps/platform-admin-web/app/audit/page.tsx` exists
- `apps/platform-admin-web/app/feature-flags/page.tsx` exists
- `apps/platform-admin-web/app/adapter-registry/page.tsx` exists
- the only subtree under these four routes that contains a co-located
  helper bundle is `apps/platform-admin-web/app/adapter-registry/components/`
  with `AdapterList.tsx` and `EditAdapterModal.tsx`; the other three
  routes are flat single-page surfaces
- no platform-admin parity story targeting `PA_Notices`, `PA_Audit`,
  `PA_Flags`, or `PA_Adapters` currently exists under
  `packages/ui-web/src/`; the package-level platform-admin stories
  present today are `platform-home-health.stories.tsx`,
  `platform-pricing.stories.tsx`, `platform-shell.stories.tsx`, and
  `platform-tenants.stories.tsx`

### Route ↔ canvas anchor ↔ component mapping

| App route           | Canvas anchor                  | Canvas component | Notes                                                                    |
| ------------------- | ------------------------------ | ---------------- | ------------------------------------------------------------------------ |
| `/notices`          | `Platform Admin.html#notices`  | `PA_Notices`     | exact match between route segment and anchor id                          |
| `/audit`            | `Platform Admin.html#audit`    | `PA_Audit`       | exact match between route segment and anchor id                          |
| `/feature-flags`    | `Platform Admin.html#flags`    | `PA_Flags`       | route uses long form (`feature-flags`); canvas anchor uses short form    |
| `/adapter-registry` | `Platform Admin.html#adapters` | `PA_Adapters`    | route uses long form (`adapter-registry`); canvas anchor uses short form |

The route↔anchor name divergence is pre-existing repository state at
packet generation time. The packet records it so reviewer audits do not
fail by looking for `#feature-flags` / `#adapter-registry` in the
canvas or `/flags` / `/adapters` in the app router. Renaming either
side is out of scope for `ADM-UI-RD-009`.

---

## 3. Dependency Map

### A. Upstream machine-truth dependencies

| Dep ID          | What it contributes to `ADM-UI-RD-009`                                                                                                                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-002` | Removes legacy `.admin-*` styling hooks (`edcf7e0`), which is the precondition for redesigning `/notices`, `/audit`, `/feature-flags`, and `/adapter-registry` onto shared `@drts/ui-web` primitives without reintroducing ad-hoc platform-admin chrome.                                                       |
| `OPS-UI-RD-009` | Provides the accepted Wave 2 closeout template (`acaf6ab` over `5696358`): surface -> reviewer -> approved-at -> commit -> canvas/story anchor. `ADM-UI-RD-009` mirrors that evidence discipline across its four sibling surfaces. It is a structural sibling / template dependency, not a runtime dependency. |

Transitive (shell):

| Dep ID          | What it contributes to `ADM-UI-RD-009`                                                                                                                                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-001` | Adopts `ManagementShell` in `PlatformShell` (`516321d`), which is what makes the notices/audit/flags/adapters redesign mechanically able to live inside the new shared shell. Without this baseline the four surfaces would still wrap themselves in `admin-nav` rather than the shared chrome that the canvas artboards already display. |

Assertions:

- the parent task is not introducing a third acceptance bar beyond
  `pnpm --filter @drts/platform-admin-web typecheck / build / test`
  and `Storybook 對照對應 PA_* artboard`
- the planning ref names this slice as a single combined entry
  (`Notices + Audit + Flags + Adapters redesign`); the four surfaces
  share the same acceptance bar and the same parent task, not four
  separate canonical rows in `ai-status.json`
- no new hard `depends_on` edge is asserted in this packet beyond the
  two already recorded in `ai-status.json`
- `ADM-UI-RD-001` is recorded only as transitive/load-bearing context,
  not as a proposed machine-truth dependency change

### B. Downstream consumer map

`ADM-UI-RD-009` is a late-wave platform-admin redesign slice. Its
direct machine-truth dependencies are upstream only; downstream
consumers are review and closeout artifacts that will cite its eventual
evidence.

| Consumer                            | Relationship                    | Why `ADM-UI-RD-009` matters                                                                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ADM-UI-RD-006`                     | adjacent Wave 3 surface         | Users/Fleet/Switchboard governance UI sits next to Notices/Audit/Flags/Adapters in the platform-admin navigation. Reviewers will expect shared chrome, status pills, and table primitives to remain consistent across these governance clusters.             |
| `ADM-UI-RD-010`                     | Wave 3 platform closeout packet | The eventual closeout rows for `/notices`, `/audit`, `/feature-flags`, and `/adapter-registry` will cite this task's reviewer, approval timestamp, commit hash, canvas anchors, and parity-story evidence the same way Wave 2 cited each ops slice.          |
| Future platform-admin redesign work | reference baseline              | Later slices can reference this packet to avoid re-litigating whether the four sibling artboards belong inside one combined task or whether the route↔anchor name divergence (`/feature-flags`↔`#flags`, `/adapter-registry`↔`#adapters`) needs to be fixed. |

Dispatch interpretation:

- no `ai-status.json` task currently records a hard machine-truth
  `depends_on` edge to `ADM-UI-RD-009`
- the consumers above are review/closeout/reference consumers, not
  formal dependency edges, and should not be promoted into machine
  truth without an explicit decision

---

## 4. Acceptance Checklist

This checklist restates the parent acceptance bar -
`pnpm --filter @drts/platform-admin-web typecheck / build / test`
plus `Storybook 對照對應 PA_* artboard` - as concrete review items for
the four sibling surfaces. The intent is to make the reviewer check
the real targets: `/notices` aligned with `PA_Notices`, `/audit`
aligned with `PA_Audit`, `/feature-flags` aligned with `PA_Flags`, and
`/adapter-registry` aligned with `PA_Adapters`, inside the shared
platform-admin shell.

Legend: `[REQUIRED]` = explicit parent acceptance bar. `[DERIVED]` =
reviewer support gate for this packet.

### A. Build / typecheck / test `[REQUIRED]`

- [ ] `pnpm --filter @drts/platform-admin-web typecheck` passes locally
      at the parent's review commit, with no new errors attributable to
      the notices / audit / feature-flags / adapter-registry redesign.
- [ ] `pnpm --filter @drts/platform-admin-web build` passes locally at
      the parent's review commit. `next-env.d.ts` regeneration noise is
      tolerable; substantive build failures are not.
- [ ] `pnpm --filter @drts/platform-admin-web test` passes locally at
      the parent's review commit. If the package still has no test
      target, the reviewer records that explicitly rather than silently
      skipping the bar.

### B. Storybook parity vs. `PA_Notices` / `PA_Audit` / `PA_Flags` / `PA_Adapters` `[REQUIRED]`

- [ ] Each of the four redesigned pages (`/notices`, `/audit`,
      `/feature-flags`, `/adapter-registry`) composes the shared shell
      (`PlatformShell -> ManagementShell`) and renders with
      `@drts/ui-web` primitives rather than reintroducing legacy
      platform-admin chrome or stripped `.admin-*` hooks.
- [ ] Each surface remains anchored to its single matching artboard:
      `/notices` -> `Platform Admin.html#notices`, `/audit` ->
      `Platform Admin.html#audit`, `/feature-flags` ->
      `Platform Admin.html#flags`, `/adapter-registry` ->
      `Platform Admin.html#adapters`. The parent task should not
      silently introduce a fifth implicit artboard.
- [ ] A Storybook parity target exists under `packages/ui-web/src/` for
      each of the four artboards, or the parent handoff explicitly
      cites how an existing combined story provides parity coverage for
      all four. At packet generation time no `platform-notices`,
      `platform-audit`, `platform-flags`, or `platform-adapters` parity
      story exists under `packages/ui-web/src/`, so the parent task is
      expected to add them; if the parent chooses a different parity
      vehicle, the handoff note must spell that out.
- [ ] The `PA_Notices` parity target reflects the maintenance-windows
      / operator-notices / platform-wide incident communication
      surface visible in the canvas.
- [ ] The `PA_Audit` parity target reflects the immutable audit
      evidence, download review, and retention-sensitive operations
      surface visible in the canvas.
- [ ] The `PA_Flags` parity target reflects the feature-flag
      governance surface visible in the canvas.
- [ ] The `PA_Adapters` parity target reflects the adapter-registry
      surface visible in the canvas, including the
      `AdapterList` + `EditAdapterModal` interaction shape that the
      current app implementation already composes under
      `apps/platform-admin-web/app/adapter-registry/components/`.

### C. Canvas anchor existence `[REQUIRED]`

- [ ] `Platform Admin.html#notices` exists in
      `docs/05-ui/drts-design-canvas/Platform Admin.html` (verified at
      packet time: line 91 binds `id="notices"` to `<PA_Notices />`).
- [ ] `Platform Admin.html#audit` exists (line 92 binds `id="audit"`
      to `<PA_Audit />`).
- [ ] `Platform Admin.html#flags` exists (line 93 binds `id="flags"`
      to `<PA_Flags />`). Note: the matching app route is
      `/feature-flags`, not `/flags`.
- [ ] `Platform Admin.html#adapters` exists (line 94 binds
      `id="adapters"` to `<PA_Adapters />`). Note: the matching app
      route is `/adapter-registry`, not `/adapters`.
- [ ] `PA_Notices`, `PA_Audit`, `PA_Flags`, and `PA_Adapters` remain
      defined and exported from
      `docs/05-ui/drts-design-canvas/platform-screens.jsx`
      (verified at packet time: definitions at lines 527 / 562 / 590
      / 610 and joint export at line 634).
- [ ] The grouping section `id="platform-layer"` is not mistaken for a
      fifth artboard. It is a canvas section heading
      (`07 · 平台層治理`), not an acceptance target.

### D. Machine-truth consistency `[REQUIRED]`

- [ ] The parent task's eventual `commit_hash` resolves on the branch
      recorded in machine truth (`push_remote` / `push_branch`). If
      the parent owner lands the work somewhere other than
      `origin/feat/claude2-ui-redesign-foundation`, that divergence
      must be captured in `ai-status.json` rather than silently
      assumed.
- [ ] The parent's commit subject contains `ADM-UI-RD-009` and the
      commit body includes the required trailers
      (`LLM-Agent`, `Task-ID`, `Reviewer`), per
      `AI_COLLABORATION_GUIDE.md` section 5.
- [ ] The parent's `review_approved` event records the reviewer of
      record (`Codex`) and an approval UTC timestamp.
- [ ] The parent handoff / closeout note cites the exact Storybook
      file or files used for `PA_Notices`, `PA_Audit`, `PA_Flags`, and
      `PA_Adapters` parity, especially if any of them reuse an
      existing combined story instead of adding a new dedicated one.

### E. Sidecar handoff readiness `[DERIVED]`

- [ ] This packet matches the current machine-truth owner / reviewer
      assignment for both the sidecar (`Claude` / `Codex2`) and the
      parent task (`Codex2` / `Codex`).
- [ ] This packet does not snapshot live parent `status` / `next` /
      `last_update` / eventual `commit_*` values; those remain
      authoritative in `ai-status.json`.
- [ ] This packet does not edit canonical truth - the planning ref,
      the design canvas, the platform-admin app source, Storybook
      sources, and `ai-status.json` all remain untouched by this
      sidecar.
- [ ] This packet does not record `done` evidence for the parent task;
      that step remains the parent owner's responsibility after parent
      review approval.

---

## 5. Reviewer Focus

For `Codex2` reviewing this sidecar:

- confirm the machine-truth anchor section matches current
  `ai-status.json` fields for both `ADM-UI-RD-009-SIDECAR-ACCEPTANCE`
  and `ADM-UI-RD-009`, with mutable lifecycle truth deferred to
  `ai-status.json`
- confirm the upstream dependency table matches the two `done`
  dependencies' `commit_hash` / `commit_recorded_at` /
  `commit_reviewer` values, and that `ADM-UI-RD-001` is recorded only
  as transitive shell context (not promoted to machine truth)
- confirm the packet treats the four surfaces as one combined parent
  slice (`/notices` + `/audit` + `/feature-flags` +
  `/adapter-registry`) rather than inventing four separate canonical
  tasks or extra acceptance bars
- confirm the route↔anchor mapping table records the existing
  `/feature-flags` ↔ `#flags` and `/adapter-registry` ↔ `#adapters`
  divergence accurately, and that the packet does not propose
  renaming either side as part of `ADM-UI-RD-009`
- confirm the canvas-anchor and Storybook-parity assertions describe
  the repo state at packet generation time honestly (no platform-admin
  parity story exists yet for these four artboards under
  `packages/ui-web/src/`, so the parent task is expected to add them
  rather than rely on already-existing parity)
- confirm the packet remains support-only and does not modify the
  planning ref, the design canvas, platform-admin source, Storybook
  files, or `ai-status.json`

---

## 6. Handoff Summary

This sidecar packet is stable reviewer support material for
`ADM-UI-RD-009` (platform-admin Notices + Audit + Flags + Adapters
redesign). The parent task remains the canonical implementation slice;
this packet is a reviewer companion that:

- pins the two upstream `done` evidence pairs plus the transitive shell
  prerequisite in one place
- restates the parent acceptance bar as an auditable checklist against
  four sibling surfaces (`/notices`, `/audit`, `/feature-flags`,
  `/adapter-registry`)
- clarifies the real parity targets: `PA_Notices` /
  `Platform Admin.html#notices`, `PA_Audit` /
  `Platform Admin.html#audit`, `PA_Flags` /
  `Platform Admin.html#flags`, and `PA_Adapters` /
  `Platform Admin.html#adapters`, each composed inside the shared
  platform-admin shell rather than a private chrome
- records the pre-existing route↔anchor name divergence
  (`/feature-flags` ↔ `#flags`, `/adapter-registry` ↔ `#adapters`) so
  reviewer audits do not fail by looking up names that do not exist on
  either side
- records that no platform-admin parity story exists yet for these
  four artboards at packet generation time, so the parent task is
  expected to add the parity stories (or cite an alternate parity
  vehicle in its handoff note)
- defers all live lifecycle truth and eventual commit evidence to
  `ai-status.json`

After sidecar review approval the packet is intended to remain under
`support/sidecars/ADM-UI-RD-009/` as a stable reviewer reference. It
is not absorbed into canonical truth and does not change any other
artifact.

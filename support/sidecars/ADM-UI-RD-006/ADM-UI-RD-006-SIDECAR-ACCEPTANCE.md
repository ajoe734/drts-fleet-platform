# ADM-UI-RD-006 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `ADM-UI-RD-006` - Wave 3 platform-admin Users + Fleet

- Switchboard redesign
  **Parent Owner:** `Codex2`
  **Parent Reviewer:** `Codex`
  **Sidecar Owner:** `Claude`
  **Sidecar Reviewer:** `Codex2`
  **Generated:** `2026-05-10` (UTC)
  **Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify
  canonical truth, runtime behavior, the parent implementation, or
  `ai-status.json`.

This packet is the reviewer-facing acceptance companion for the Wave 3
platform-admin slice that redesigns the three sibling surfaces under
the canvas section `04 · 平台人員 / 車隊與法遵`: `PA_Users`, `PA_Fleet`,
and `PA_Switchboard`. The parent task ships its implementation across
the three platform-admin routes `/users`, `/fleet`, and `/switchboard`;
this packet pins the machine-truth anchors, dependency map, and reviewer
checklist that the parent reviewer (`Codex`) is expected to apply
against that work.

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
  checklist for the three sibling surfaces `/users`, `/fleet`, and
  `/switchboard`
- pin the machine-truth dependency on `ADM-UI-RD-002` + `OPS-UI-RD-009`,
  with `ADM-UI-RD-001` recorded as a transitive shell prerequisite
- enumerate the verifiable anchors the parent implementation must hit:
  `Platform Admin.html#users`, `Platform Admin.html#fleet`,
  `Platform Admin.html#switchboard`, the corresponding `PA_Users`,
  `PA_Fleet`, `PA_Switchboard` definitions, the shared shell
  composition, and Storybook parity targets for each artboard
- make explicit that `ADM-UI-RD-006` is one combined slice covering all
  three sibling artboards in canvas section `users-fleet`, not three
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
- splitting `ADM-UI-RD-006` into three separate canonical tasks or
  inventing extra acceptance bars beyond what the parent task already
  records
- mutating or "absorbing" the parent task; absorption remains the
  parent owner's decision

---

## 2. Machine Truth Anchors

### Sidecar (this task) - `ai-status.json -> ADM-UI-RD-006-SIDECAR-ACCEPTANCE`

- owner=`Claude`
- reviewer=`Codex2`
- depends_on=`ADM-UI-RD-002`, `OPS-UI-RD-009`
- task_class=`sidecar`
- helper_parent=`ADM-UI-RD-006`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- artifacts=`support/sidecars/ADM-UI-RD-006/ADM-UI-RD-006-SIDECAR-ACCEPTANCE.md`
- live lifecycle fields intentionally deferred to `ai-status.json`:
  - `status`
  - `next`
  - `last_update`

### Parent - `ai-status.json -> ADM-UI-RD-006`

- title=`Users + Fleet + Switchboard redesign`
- summary_zh=`PA_Users + PA_Fleet + PA_Switchboard。`
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
  (Wave 3 task list; line 434 names `ADM-UI-RD-006` as
  `Users + Fleet + Switchboard redesign`)
- `docs/05-ui/drts-design-canvas/Platform Admin.html`
  (design source of truth; the canvas section
  `id="users-fleet"` at line 75 groups the three sibling artboards;
  line 76 binds `id="users"` to `<PA_Users />`, line 77 binds
  `id="fleet"` to `<PA_Fleet />`, line 78 binds `id="switchboard"` to
  `<PA_Switchboard />`)
- `docs/05-ui/drts-design-canvas/platform-screens.jsx`
  (`PA_Users` defined at line 257, `PA_Fleet` defined at line 292,
  `PA_Switchboard` defined at line 322; all three remain exported at
  lines 632-633)
- `apps/platform-admin-web/app/users/page.tsx`
  (parent surface target for `PA_Users`; the current implementation
  imports `@drts/ui-web` primitives such as `DataTable`, `DataViewCard`,
  `KpiCard`, `PageHeader`, `WorkflowPanel`, `CalloutBanner`, and
  `StatusChip`)
- `apps/platform-admin-web/app/fleet/page.tsx`
  (parent surface target for `PA_Fleet`; the current implementation
  covers Drivers/Vehicles/Contracts/Exclusivity/Offboarding subsurfaces
  that the canvas tabs describe)
- `apps/platform-admin-web/app/switchboard/page.tsx`
  (parent surface target for `PA_Switchboard`; the current
  implementation handles public info versions and placard generation
  via `PublicInfoVersionRecord` / `PlacardVersionRecord`)
- `apps/platform-admin-web/app/layout.tsx`
  and `apps/platform-admin-web/components/platform-shell.tsx`
  (shared shell composition path: `PlatformShell -> ManagementShell`)

Repository shape assertion at packet generation time:

- `apps/platform-admin-web/app/users/page.tsx` exists
- `apps/platform-admin-web/app/fleet/page.tsx` exists
- `apps/platform-admin-web/app/switchboard/page.tsx` exists
- no separate sub-routes `apps/platform-admin-web/app/users/[id]/*`,
  `apps/platform-admin-web/app/fleet/*/`, or
  `apps/platform-admin-web/app/switchboard/*` other than the listed
  helper files (`datetime-local.ts`, `placard-source.ts`,
  `placard-version-code.ts`) exist at packet generation time
- no platform-admin parity story targeting `PA_Users`, `PA_Fleet`, or
  `PA_Switchboard` currently exists under `packages/ui-web/src/`; the
  packages-level platform-admin stories present today are
  `platform-home-health.stories.tsx`, `platform-pricing.stories.tsx`,
  and `platform-shell.stories.tsx`

---

## 3. Dependency Map

### A. Upstream machine-truth dependencies

| Dep ID          | What it contributes to `ADM-UI-RD-006`                                                                                                                                                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-002` | Removes legacy `.admin-*` styling hooks (`edcf7e0`), which is the precondition for redesigning `/users`, `/fleet`, and `/switchboard` onto shared `@drts/ui-web` primitives without reintroducing ad-hoc platform-admin chrome.                                                                                 |
| `OPS-UI-RD-009` | Provides the accepted Wave 2 closeout template (`acaf6ab` over `5696358`): surface -> reviewer -> approved-at -> commit -> canvas/story anchor. `ADM-UI-RD-006` mirrors that evidence discipline across its three sibling surfaces. It is a structural sibling / template dependency, not a runtime dependency. |

Transitive (shell):

| Dep ID          | What it contributes to `ADM-UI-RD-006`                                                                                                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-001` | Adopts `ManagementShell` in `PlatformShell` (`516321d`), which is what makes the users/fleet/switchboard redesign mechanically able to live inside the new shared shell. Without this baseline the three surfaces would still wrap themselves in `admin-nav` rather than the shared chrome that the canvas artboards already display. |

Assertions:

- the parent task is not introducing a third acceptance bar beyond
  `pnpm --filter @drts/platform-admin-web typecheck / build / test`
  and `Storybook 對照對應 PA_* artboard`
- the planning ref names this slice as a single combined entry
  (`Users + Fleet + Switchboard redesign`); the three surfaces share
  the same acceptance bar and the same parent task, not three separate
  canonical rows in `ai-status.json`
- no new hard `depends_on` edge is asserted in this packet beyond the
  two already recorded in `ai-status.json`
- `ADM-UI-RD-001` is recorded only as transitive/load-bearing context,
  not as a proposed machine-truth dependency change

### B. Downstream consumer map

`ADM-UI-RD-006` is a mid-wave platform-admin redesign slice. Its direct
machine-truth dependencies are upstream only; downstream consumers are
review and closeout artifacts that will cite its eventual evidence.

| Consumer                            | Relationship                    | Why `ADM-UI-RD-006` matters                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-009`                     | adjacent Wave 3 surface         | Notices/Audit/Flags/Adapters governance UI should stay visually coherent with the platform-people / fleet-compliance / public-info trio. Reviewers will expect shared chrome, status pills, and table primitives to remain consistent across these governance surfaces. |
| `ADM-UI-RD-010`                     | Wave 3 platform closeout packet | The eventual closeout rows for `/users`, `/fleet`, and `/switchboard` will cite this task's reviewer, approval timestamp, commit hash, canvas anchors, and parity-story evidence the same way Wave 2 cited each ops slice.                                              |
| Future platform-admin redesign work | reference baseline              | Later slices can reference this packet to avoid re-litigating whether the three sibling artboards belong inside one combined task or whether `PA_Switchboard` warrants its own dependency edge.                                                                         |

Dispatch interpretation:

- no `ai-status.json` task currently records a hard machine-truth
  `depends_on` edge to `ADM-UI-RD-006`
- the consumers above are review/closeout/reference consumers, not
  formal dependency edges, and should not be promoted into machine
  truth without an explicit decision

---

## 4. Acceptance Checklist

This checklist restates the parent acceptance bar -
`pnpm --filter @drts/platform-admin-web typecheck / build / test`
plus `Storybook 對照對應 PA_* artboard` - as concrete review items for
the three sibling surfaces. The intent is to make the reviewer check
the real targets: `/users` aligned with `PA_Users`, `/fleet` aligned
with `PA_Fleet`, and `/switchboard` aligned with `PA_Switchboard`,
inside the shared platform-admin shell.

Legend: `[REQUIRED]` = explicit parent acceptance bar. `[DERIVED]` =
reviewer support gate for this packet.

### A. Build / typecheck / test `[REQUIRED]`

- [ ] `pnpm --filter @drts/platform-admin-web typecheck` passes locally
      at the parent's review commit, with no new errors attributable to
      the users / fleet / switchboard redesign.
- [ ] `pnpm --filter @drts/platform-admin-web build` passes locally at
      the parent's review commit. `next-env.d.ts` regeneration noise is
      tolerable; substantive build failures are not.
- [ ] `pnpm --filter @drts/platform-admin-web test` passes locally at
      the parent's review commit. If the package still has no test
      target, the reviewer records that explicitly rather than silently
      skipping the bar.

### B. Storybook parity vs. `PA_Users` / `PA_Fleet` / `PA_Switchboard` `[REQUIRED]`

- [ ] Each of the three redesigned pages (`/users`, `/fleet`,
      `/switchboard`) composes the shared shell
      (`PlatformShell -> ManagementShell`) and renders with
      `@drts/ui-web` primitives rather than reintroducing legacy
      platform-admin chrome or stripped `.admin-*` hooks.
- [ ] Each surface remains anchored to its single matching artboard:
      `/users` -> `Platform Admin.html#users`, `/fleet` ->
      `Platform Admin.html#fleet`, `/switchboard` ->
      `Platform Admin.html#switchboard`. The parent task should not
      silently introduce a fourth implicit artboard.
- [ ] A Storybook parity target exists under `packages/ui-web/src/` for
      each of the three artboards, or the parent handoff explicitly
      cites how an existing combined story provides parity coverage for
      all three. At packet generation time no `platform-users`,
      `platform-fleet`, or `platform-switchboard` parity story exists
      under `packages/ui-web/src/`, so the parent task is expected to
      add them; if the parent chooses a different parity vehicle, the
      handoff note must spell that out.
- [ ] The `PA_Fleet` parity target reflects the tabbed structure
      visible in the canvas (`Drivers` / `Vehicles` / `Contracts` /
      `Exclusivity` / `Offboarding`) and at least represents the active
      `Drivers` tab.
- [ ] The `PA_Switchboard` parity target reflects the dual public-info
      versions + placard panes visible in the canvas
      (`版本` / `牌貼` / `公開聯絡` / `歷史`).
- [ ] The `PA_Users` parity target reflects the platform-internal user
      and role table visible in the canvas (name / email / role /
      status / 更新 columns).

### C. Canvas anchor existence `[REQUIRED]`

- [ ] `Platform Admin.html#users` exists in
      `docs/05-ui/drts-design-canvas/Platform Admin.html` (verified at
      packet time: line 76 binds `id="users"` to `<PA_Users />`).
- [ ] `Platform Admin.html#fleet` exists (line 77 binds `id="fleet"` to
      `<PA_Fleet />`).
- [ ] `Platform Admin.html#switchboard` exists (line 78 binds
      `id="switchboard"` to `<PA_Switchboard />`).
- [ ] `PA_Users`, `PA_Fleet`, and `PA_Switchboard` remain defined and
      exported from `docs/05-ui/drts-design-canvas/platform-screens.jsx`
      (verified at packet time: definitions at lines 257 / 292 / 322
      and joint export at lines 632-633).
- [ ] The grouping section `id="users-fleet"` (line 75) is not
      mistaken for a fourth artboard. It is a canvas section heading,
      not an acceptance target.

### D. Machine-truth consistency `[REQUIRED]`

- [ ] The parent task's eventual `commit_hash` resolves on the branch
      recorded in machine truth (`push_remote` / `push_branch`). If the
      parent owner lands the work somewhere other than
      `origin/feat/claude2-ui-redesign-foundation`, that divergence
      must be captured in `ai-status.json` rather than silently
      assumed.
- [ ] The parent's commit subject contains `ADM-UI-RD-006` and the
      commit body includes the required trailers
      (`LLM-Agent`, `Task-ID`, `Reviewer`), per
      `AI_COLLABORATION_GUIDE.md` section 5.
- [ ] The parent's `review_approved` event records the reviewer of
      record (`Codex`) and an approval UTC timestamp.
- [ ] The parent handoff / closeout note cites the exact Storybook
      file or files used for `PA_Users`, `PA_Fleet`, and
      `PA_Switchboard` parity, especially if any of them reuse an
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
  `ai-status.json` fields for both `ADM-UI-RD-006-SIDECAR-ACCEPTANCE`
  and `ADM-UI-RD-006`, with mutable lifecycle truth deferred to
  `ai-status.json`
- confirm the upstream dependency table matches the two `done`
  dependencies' `commit_hash` / `commit_recorded_at` /
  `commit_reviewer` values, and that `ADM-UI-RD-001` is recorded only
  as transitive shell context (not promoted to machine truth)
- confirm the packet treats the three surfaces as one combined parent
  slice (`/users` + `/fleet` + `/switchboard`) rather than inventing
  three separate canonical tasks or extra acceptance bars
- confirm the canvas-anchor and Storybook-parity assertions describe
  the repo state at packet generation time honestly (no platform-admin
  parity story exists yet for these three artboards under
  `packages/ui-web/src/`, so the parent task is expected to add them
  rather than rely on already-existing parity)
- confirm the packet remains support-only and does not modify the
  planning ref, the design canvas, platform-admin source, Storybook
  files, or `ai-status.json`

---

## 6. Handoff Summary

This sidecar packet is stable reviewer support material for
`ADM-UI-RD-006` (platform-admin Users + Fleet + Switchboard redesign).
The parent task remains the canonical implementation slice; this packet
is a reviewer companion that:

- pins the two upstream `done` evidence pairs plus the transitive shell
  prerequisite in one place
- restates the parent acceptance bar as an auditable checklist against
  three sibling surfaces (`/users`, `/fleet`, `/switchboard`)
- clarifies the real parity targets: `PA_Users` /
  `Platform Admin.html#users`, `PA_Fleet` /
  `Platform Admin.html#fleet`, and `PA_Switchboard` /
  `Platform Admin.html#switchboard`, each composed inside the shared
  platform-admin shell rather than a private chrome
- records that no platform-admin parity story exists yet for these
  three artboards at packet generation time, so the parent task is
  expected to add the parity stories (or cite an alternate parity
  vehicle in its handoff note)
- defers all live lifecycle truth and eventual commit evidence to
  `ai-status.json`

After sidecar review approval the packet is intended to remain under
`support/sidecars/ADM-UI-RD-006/` as a stable reviewer reference. It is
not absorbed into canonical truth and does not change any other
artifact.

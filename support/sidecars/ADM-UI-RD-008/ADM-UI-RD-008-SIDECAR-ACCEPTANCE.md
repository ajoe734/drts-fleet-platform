# ADM-UI-RD-008 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `ADM-UI-RD-008` - Wave 3 platform-admin Payments +
Reconciliation Detail redesign
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-10` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify
canonical truth, runtime behavior, the parent implementation, or
`ai-status.json`.

This packet is the reviewer-facing acceptance companion for the Wave 3
platform-admin slice that redesigns `PA_Payments` (the settlement /
reconciliation governance overview) **and** `PA_ReconDetail` (the
single-issue detail screen). Unlike the prior pricing slice
(`ADM-UI-RD-007`), `ADM-UI-RD-008` covers **two** design canvas artboards
sitting in the same `06 · 結算與對帳流程` design section, with one
overview surface (`/payments`) and one drill-down surface
(`/payments/reconciliation/[issueId]`). This packet pins the
machine-truth anchors, dependency map, and reviewer checklist that the
parent reviewer (`Codex`) is expected to apply against the parent's
work.

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
  checklist for the **two** PA\_\* artboards in scope
- pin the machine-truth dependency on `ADM-UI-RD-002` + `OPS-UI-RD-009`,
  with `ADM-UI-RD-001` recorded as a transitive shell prerequisite
- enumerate the verifiable anchors the parent implementation must hit
  for both surfaces:
  `Platform Admin.html#payments` + `PA_Payments` (overview), and
  `Platform Admin.html#recon-detail` + `PA_ReconDetail` (drill-down),
  the shared shell composition, and Storybook parity targets for both
- record the existing route shape so the reviewer can audit the parent
  work without re-deriving it from planning docs and dependency tasks:
  `apps/platform-admin-web/app/payments/page.tsx` (overview) and
  `apps/platform-admin-web/app/payments/reconciliation/[issueId]/page.tsx`
  (issue detail)
- make explicit that `ADM-UI-RD-008` is a **two-artboard** slice and
  that both artboards must be exercised in parity evidence, not just
  one (`PA_Payments` alone is not sufficient acceptance)

Out of scope:

- editing L1/L2 product truth, the platform-admin app source, the
  planning ref, the design canvas, Storybook sources, or `ai-status.json`
- re-running parent acceptance commands; those belong to the parent
  review cycle, not this sidecar packet
- recording `commit_hash`, `commit_subject`, `push_remote`, or
  `push_branch` evidence for the parent task; that is the parent
  owner's responsibility after parent review approval
- inventing new formal dependency edges, new acceptance bars, or new
  artboards (e.g. a separate `#reconciliation` overview anchor or a
  separate `PA_SettlementMatrix` artboard)
- mutating or "absorbing" the parent task; absorption remains the
  parent owner's decision

---

## 2. Machine Truth Anchors

### Sidecar (this task) - `ai-status.json -> ADM-UI-RD-008-SIDECAR-ACCEPTANCE`

- owner=`Claude2`
- reviewer=`Codex2`
- depends_on=`ADM-UI-RD-002`, `OPS-UI-RD-009`
- task_class=`sidecar`
- helper_parent=`ADM-UI-RD-008`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/ADM-UI-RD-008/ADM-UI-RD-008-SIDECAR-ACCEPTANCE.md`
- live lifecycle fields intentionally deferred to `ai-status.json`:
  - `status`
  - `next`
  - `last_update`

### Parent - `ai-status.json -> ADM-UI-RD-008`

- owner=`Codex2`
- reviewer=`Codex`
- phase=`Wave 3`
- depends_on=`ADM-UI-RD-002`, `OPS-UI-RD-009`
- acceptance=
  - `pnpm --filter @drts/platform-admin-web typecheck / build / test`
  - `Storybook 對照對應 PA_* artboard`
- artifact root=`apps/platform-admin-web/`
- planning_ref=`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- planning summary=`Payments + Reconciliation Detail redesign`
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
  (Wave 3 task list; line 436 names `ADM-UI-RD-008` as
  `Payments + Reconciliation Detail redesign`)
- `docs/05-ui/drts-design-canvas/Platform Admin.html`
  (design source of truth; lines 85-88 bind the
  `06 · 結算與對帳流程` section to two artboards:
  `id="payments"` -> `<PA_Payments />` and
  `id="recon-detail"` -> `<PA_ReconDetail />`)
- `docs/05-ui/drts-design-canvas/platform-screens.jsx`
  (`PA_Payments` defined at line 400; `PA_ReconDetail` defined at line
  431; both exported in the platform-admin barrel at line 633)
- `apps/platform-admin-web/app/payments/page.tsx`
  (parent overview surface target; current implementation exposes the
  finance console with settlement matrix, tenant invoices, driver
  statements, reimbursements, and reconciliation issues as the same
  scope captured by `PA_Payments` tabs)
- `apps/platform-admin-web/app/payments/reconciliation/[issueId]/page.tsx`
  (parent drill-down surface target; current implementation already
  imports `WorkflowPanel`, `WorkflowSplitLayout`, `KpiRow`, `Timeline`,
  and other `@drts/ui-web` primitives, matching the `PA_ReconDetail`
  card / timeline / resolution layout)
- `apps/platform-admin-web/app/layout.tsx`
  and `apps/platform-admin-web/components/platform-shell.tsx`
  (shared shell composition path: `PlatformShell -> ManagementShell`)
- `packages/ui-web/src/platform-shell.stories.tsx`
  (shell baseline; useful when reviewing whether `/payments` and
  `/payments/reconciliation/[issueId]` stay on the shared
  platform-admin shell)

Repository shape assertion at packet generation time:

- `apps/platform-admin-web/app/payments/page.tsx` exists
- `apps/platform-admin-web/app/payments/reconciliation/[issueId]/page.tsx`
  exists (drill-down route)
- no separate `apps/platform-admin-web/app/recon*` or
  `apps/platform-admin-web/app/reconciliation*` route exists outside
  the `/payments/reconciliation/[issueId]` path
- the design canvas exposes exactly two payments-section artboards
  (`#payments` and `#recon-detail`); no additional `#settlement`,
  `#matrix`, or sibling anchors are expected
- no parity Storybook target for `PA_Payments` or `PA_ReconDetail`
  exists yet under `packages/ui-web/src/` at packet generation time
  (the existing `platform-*.stories.tsx` files cover home/health,
  pricing, shell, and tenants; payments + recon-detail parity is the
  parent task's responsibility to land)

---

## 3. Dependency Map

### A. Upstream machine-truth dependencies

| Dep ID          | What it contributes to `ADM-UI-RD-008`                                                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ADM-UI-RD-002` | Removes legacy `.admin-*` styling hooks (`edcf7e0`), which is the precondition for redesigning the payments overview and reconciliation drill-down onto shared `@drts/ui-web` primitives without reintroducing ad-hoc platform-admin chrome.                                                           |
| `OPS-UI-RD-009` | Provides the accepted Wave 2 closeout template (`acaf6ab` over `5696358`): surface -> reviewer -> approved-at -> commit -> canvas/story anchor. `ADM-UI-RD-008` mirrors that evidence discipline for both of its surfaces. It is a structural sibling / template dependency, not a runtime dependency. |

Transitive (shell):

| Dep ID          | What it contributes to `ADM-UI-RD-008`                                                                                                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-001` | Adopts `ManagementShell` in `PlatformShell` (`516321d`), which is what makes both the payments overview and the reconciliation detail page mechanically able to live inside the new shared shell rather than a legacy standalone admin chrome. |

Assertions:

- the parent task is not introducing a third acceptance bar beyond
  `pnpm --filter @drts/platform-admin-web typecheck / build / test`
  and `Storybook 對照對應 PA_* artboard`
- the parent task covers **two** artboards (`PA_Payments` overview and
  `PA_ReconDetail` drill-down) and the parity evidence must exercise
  both; the planning summary `Payments + Reconciliation Detail
redesign` and the design canvas section `06 · 結算與對帳流程`
  encode the pair as a single coherent slice
- no new hard `depends_on` edge is asserted in this packet beyond the
  two already recorded in `ai-status.json`
- `ADM-UI-RD-001` is recorded only as transitive/load-bearing context,
  not as a proposed machine-truth dependency change
- the existing `WorkflowPanel` / `WorkflowSplitLayout` / `KpiRow` /
  `Timeline` imports already used by the reconciliation detail page
  show that this surface has already begun the migration onto
  `@drts/ui-web`; whether that pre-existing scaffolding satisfies the
  parity bar is a parent-review judgment, not a sidecar judgment

### B. Downstream consumer map

`ADM-UI-RD-008` is a mid-wave platform-admin redesign slice. Its direct
machine-truth dependencies are upstream only; downstream consumers are
review and closeout artifacts that will cite its eventual evidence.

| Consumer                            | Relationship                    | Why `ADM-UI-RD-008` matters                                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-007`                     | adjacent Wave 3 surface         | Pricing publish flow is the other half of the "Pricing & Settlement" navigation cluster. Reviewers will expect the settlement governance language, KPI framing, and reconciliation cues to stay visually coherent across the pair.       |
| `ADM-UI-RD-009`                     | adjacent Wave 3 surface         | Notices / Audit / Flags / Adapters share the platform-admin shell and govern operational truth alongside settlement governance. Visual + behavioural parity across these surfaces matters at closeout.                                   |
| `ADM-UI-RD-010`                     | Wave 3 platform closeout packet | The eventual closeout rows for `/payments` and `/payments/reconciliation/[issueId]` will cite this task's reviewer, approval timestamp, commit hash, canvas anchors, and parity-story evidence the same way Wave 2 cited each ops slice. |
| Future platform-admin redesign work | reference baseline              | Later slices that need to expose drill-down detail screens (issue, ticket, instance) can reference this packet to see how a paired overview/detail artboard set should be evidenced inside the platform-admin redesign cadence.          |

Dispatch interpretation:

- no `ai-status.json` task currently records a hard machine-truth
  `depends_on` edge to `ADM-UI-RD-008`
- the consumers above are review/closeout/reference consumers, not
  formal dependency edges, and should not be promoted into machine
  truth without an explicit decision

---

## 4. Acceptance Checklist

This checklist restates the parent acceptance bar -
`pnpm --filter @drts/platform-admin-web typecheck / build / test`
plus `Storybook 對照對應 PA_* artboard` - as concrete review items for
the **paired** surfaces. The intent is to make the reviewer check the
real targets: `/payments` aligned with `PA_Payments`, **and**
`/payments/reconciliation/[issueId]` aligned with `PA_ReconDetail`.

Legend: `[REQUIRED]` = explicit parent acceptance bar. `[DERIVED]` =
reviewer support gate for this packet.

### A. Build / typecheck / test `[REQUIRED]`

- [ ] `pnpm --filter @drts/platform-admin-web typecheck` passes locally
      at the parent's review commit, with no new errors attributable to
      either the payments overview redesign or the reconciliation
      detail redesign.
- [ ] `pnpm --filter @drts/platform-admin-web build` passes locally at
      the parent's review commit. `next-env.d.ts` regeneration noise is
      tolerable; substantive build failures are not.
- [ ] `pnpm --filter @drts/platform-admin-web test` passes locally at
      the parent's review commit. If the package still has no test
      target, the reviewer records that explicitly rather than silently
      skipping the bar.

### B. Storybook parity vs. `PA_Payments` `[REQUIRED]`

- [ ] The redesigned `/payments` page composes the shared shell
      (`PlatformShell -> ManagementShell`) and renders with
      `@drts/ui-web` primitives rather than reintroducing legacy
      platform-admin chrome or stripped `.admin-*` hooks.
- [ ] The surface remains anchored to the single overview artboard
      `Platform Admin.html#payments`.
- [ ] A Storybook target exists under `packages/ui-web/src/` that
      mirrors `PA_Payments`. At packet generation time no such file
      exists yet, so the parent task is expected to introduce one
      (e.g. `packages/ui-web/src/platform-payments.stories.tsx`); the
      handoff note must cite the exact file path.
- [ ] The `PA_Payments` parity target covers the structural zones
      visible in the artboard: page header (`結算治理`) with the
      five-tab governance row (`Settlement matrix`, `Tenant invoices`,
      `Driver statements`, `Reimbursements`, `Reconciliation issues`),
      the four-KPI summary row (outstanding count, accumulated diff,
      average resolution time, reopen rate), and the reconciliation
      issues table with `ISSUE / SOURCE / TYPE / TENANT / EXTERNAL
    ORDER / AMOUNT / OWNER / STATUS / UPDATED` columns.

### C. Storybook parity vs. `PA_ReconDetail` `[REQUIRED]`

- [ ] The redesigned `/payments/reconciliation/[issueId]` page composes
      the shared shell and renders with `@drts/ui-web` primitives. The
      pre-existing imports (`WorkflowPanel`, `WorkflowSplitLayout`,
      `KpiRow`, `Timeline`) are evidence the surface is already on the
      shared primitive set; the parent task should preserve that posture.
- [ ] The surface remains anchored to the drill-down artboard
      `Platform Admin.html#recon-detail`.
- [ ] A Storybook target exists under `packages/ui-web/src/` that
      mirrors `PA_ReconDetail`. At packet generation time no such file
      exists yet; the parent task may either introduce a dedicated
      story (e.g. `packages/ui-web/src/platform-recon-detail.stories.tsx`)
      or extend a paired payments parity story to cover both artboards.
      Either choice must be cited explicitly in the handoff note.
- [ ] The `PA_ReconDetail` parity target covers the structural zones
      visible in the artboard: breadcrumb back into `Reconciliation
    issues`, page header with issue id + type and the trio of actions
      (`指派 / 補 evidence / 標記 resolved`), the two-column body with
      `Issue summary` (DL grid) + `Timeline` on the left, and `Linked
    references` (DL list) + `Resolution` (resolution code select +
      summary input + resolve button) on the right.

### D. Canvas anchor existence `[REQUIRED]`

- [ ] `Platform Admin.html#payments` exists in
      `docs/05-ui/drts-design-canvas/Platform Admin.html` (verified at
      packet time: line 86 binds `id="payments"` to `<PA_Payments />`).
- [ ] `Platform Admin.html#recon-detail` exists in the same file
      (verified at packet time: line 87 binds `id="recon-detail"` to
      `<PA_ReconDetail />`).
- [ ] `PA_Payments` remains defined and exported from
      `docs/05-ui/drts-design-canvas/platform-screens.jsx`
      (verified at packet time: definition at line 400, export at line
      633).
- [ ] `PA_ReconDetail` remains defined and exported from the same file
      (verified at packet time: definition at line 431, export at line
      633).
- [ ] No additional anchors (e.g. `#settlement`, `#matrix`,
      `#reconciliation` overview separate from `#payments`) are
      introduced or expected; the slice is exactly the
      `#payments` + `#recon-detail` pair.

### E. Machine-truth consistency `[REQUIRED]`

- [ ] The parent task's eventual `commit_hash` resolves on the branch
      recorded in machine truth (`push_remote` / `push_branch`). If the
      parent owner lands the work somewhere other than
      `origin/feat/claude2-ui-redesign-foundation`, that divergence must
      be captured in `ai-status.json` rather than silently assumed.
- [ ] The parent's commit subject contains `ADM-UI-RD-008` and the
      commit body includes the required trailers
      (`LLM-Agent`, `Task-ID`, `Reviewer`), per
      `AI_COLLABORATION_GUIDE.md` section 5.
- [ ] The parent's `review_approved` event records the reviewer of
      record (`Codex`) and an approval UTC timestamp.
- [ ] The parent handoff / closeout note cites the exact Storybook file
      or files used for `PA_Payments` and `PA_ReconDetail` parity, and
      explicitly states whether they are split into one or two stories.

### F. Sidecar handoff readiness `[DERIVED]`

- [ ] This packet matches the current machine-truth owner / reviewer
      assignment for both the sidecar (`Claude2` / `Codex2`) and the
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

For `Codex2` reviewing this sidecar:

- confirm the machine-truth anchor section matches current
  `ai-status.json` fields for both `ADM-UI-RD-008-SIDECAR-ACCEPTANCE`
  and `ADM-UI-RD-008`, with mutable lifecycle truth deferred to
  `ai-status.json`
- confirm the upstream dependency table matches the two `done`
  dependencies' `commit_hash` / `commit_recorded_at` /
  `commit_reviewer` values, and that `ADM-UI-RD-001` is recorded only
  as transitive shell context
- confirm the packet treats `ADM-UI-RD-008` as a **two-artboard** slice
  (`PA_Payments` overview at `#payments`, `PA_ReconDetail` drill-down
  at `#recon-detail`) and does not collapse the pair into a single
  surface or invent a third artboard
- confirm the downstream map does not assert any hard machine-truth
  `depends_on` edges that do not exist in `ai-status.json`
- confirm the packet remains support-only and does not modify the
  planning ref, the design canvas, platform-admin source, Storybook
  files, or `ai-status.json`

---

## 6. Handoff Summary

This sidecar packet is stable reviewer support material for
`ADM-UI-RD-008` (platform-admin Payments + Reconciliation Detail
redesign). The parent task remains the canonical implementation slice;
this packet is a reviewer companion that:

- pins the two upstream `done` evidence pairs plus the transitive shell
  prerequisite in one place
- restates the parent acceptance bar as an auditable checklist against
  both `/payments` and `/payments/reconciliation/[issueId]`
- clarifies the real parity targets: `PA_Payments` /
  `Platform Admin.html#payments` for the overview, **and**
  `PA_ReconDetail` / `Platform Admin.html#recon-detail` for the
  drill-down, with the parent task expected to land Storybook parity
  for both
- defers all live lifecycle truth and eventual commit evidence to
  `ai-status.json`

After sidecar review approval the packet is intended to remain under
`support/sidecars/ADM-UI-RD-008/` as a stable reviewer reference. It is
not absorbed into canonical truth and does not change any other
artifact.

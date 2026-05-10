# ADM-UI-RD-003 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `ADM-UI-RD-003` — Wave 3 platform-admin Home + Health redesign
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-10` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, runtime behavior, the parent task's implementation, or
`ai-status.json`.

This packet is the reviewer-facing acceptance companion for the Wave 3
platform-admin redesign slice that brings `PA_Home` and `PA_Health` onto
the shared `ManagementShell` + `@drts/ui-web` primitives. The parent task
ships the implementation under `apps/platform-admin-web/app/` (Home `/`
and `/health`); this packet pins the machine-truth anchors, the
dependency map, and the acceptance checklist that the parent reviewer
(`Codex`) is expected to apply against that implementation.

Transient parent lifecycle truth (`status`, `next`, `last_update`, and
eventual `commit_*` fields) remains authoritative only in
`ai-status.json`. This packet does not snapshot those fields, by design.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar
  (`pnpm --filter @drts/platform-admin-web typecheck / build / test`
  - Storybook 對照 `PA_*` artboard) as a concrete reviewer checklist
    against the Home (`/`) and Health (`/health`) surfaces
- pin the machine-truth dependency on `ADM-UI-RD-002` + `OPS-UI-RD-009`
  (with `ADM-UI-RD-001` recorded as a transitive shell prerequisite)
- enumerate the verifiable anchors the parent implementation must hit
  (PA_Home / PA_Health canvas anchors, expected parity story files,
  shared shell composition)
- record the parent task's structural shape so `Codex` can audit the
  redesign without re-deriving the Wave-2 acceptance template

Out of scope:

- editing L1/L2 product truth, the platform-admin app source, the
  workbreakdown planning ref, or `ai-status.json`
- editing the design canvas
  (`docs/05-ui/drts-design-canvas/Platform Admin.html`,
  `docs/05-ui/drts-design-canvas/platform-screens.jsx`) or any parity
  story under `packages/ui-web/src/platform-*.stories.tsx`
- re-running per-task acceptance commands; those execute against the
  parent's implementation at parent review time, not in this packet
- recording `commit_hash` / `push_remote` / `push_branch` evidence for
  the parent task; that step is the parent owner's responsibility after
  parent review approval
- mutating or "absorbing" the parent task; absorption is the parent
  owner's decision, not the sidecar's

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json → ADM-UI-RD-003-SIDECAR-ACCEPTANCE`

- owner=`Claude2`
- reviewer=`Codex2`
- depends_on=`ADM-UI-RD-002`, `OPS-UI-RD-009`
- task_class=`sidecar`
- helper_parent=`ADM-UI-RD-003`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/ADM-UI-RD-003/ADM-UI-RD-003-SIDECAR-ACCEPTANCE.md`
- live lifecycle fields intentionally deferred to `ai-status.json`:
  - `status`
  - `next`
  - `last_update`

### Parent — `ai-status.json → ADM-UI-RD-003`

- owner=`Codex2`
- reviewer=`Codex`
- phase=`Wave 3`
- depends_on=`ADM-UI-RD-002`, `OPS-UI-RD-009`
- acceptance=
  - `pnpm --filter @drts/platform-admin-web typecheck / build / test`
  - `Storybook 對照對應 PA_* artboard`
- artifact root=`apps/platform-admin-web/`
- planning_ref=`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- branch on which the parent implementation is expected to land=
  `feat/claude2-ui-redesign-foundation` (active Wave 3 branch; same
  branch that already carries `ADM-UI-RD-001`, `ADM-UI-RD-002`, and
  `OPS-UI-RD-009`)

### Upstream dependencies (all `done` in `ai-status.json`)

| Dep ID          | Status | Reviewer of record | Approved (UTC)       | Shipped commit | Primary artifact root                                                                        |
| --------------- | ------ | ------------------ | -------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-002` | `done` | `Codex`            | 2026-05-10T20:50:01Z | `edcf7e0`      | `apps/platform-admin-web/app/globals.css` + admin CSS hooks stripped                         |
| `OPS-UI-RD-009` | `done` | `Claude`           | 2026-05-10T20:44:49Z | `acaf6ab`      | `docs/05-ui/ops-console-redesign-closeout-20260510.md` (Wave 2 closeout, structural sibling) |

Transitive shell prerequisite (not in the parent's explicit `depends_on`
but load-bearing for "redesign onto the new shell"):

| Dep ID          | Status | Reviewer of record | Approved (UTC)       | Shipped commit | Primary artifact root                                                              |
| --------------- | ------ | ------------------ | -------------------- | -------------- | ---------------------------------------------------------------------------------- |
| `ADM-UI-RD-001` | `done` | `Codex2`           | 2026-05-10T18:53:13Z | `516321d`      | `apps/platform-admin-web/components/platform-shell.tsx` adopting `ManagementShell` |

Branch presence assertion:

- every commit hash above resolves on
  `origin/feat/claude2-ui-redesign-foundation` at packet generation
  time (verified via `git branch -r --contains <sha>`)

### Authoritative supporting documents

- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` (planning ref —
  Wave 3 platform-admin section, line 431 lists `ADM-UI-RD-003`)
- `docs/05-ui/drts-design-canvas/Platform Admin.html` (design source of
  truth — `#home` artboard line 61, `#health` artboard line 62)
- `docs/05-ui/drts-design-canvas/platform-screens.jsx`
  (canvas components — `PA_Home` line 27, `PA_Health` line 488)
- `apps/platform-admin-web/app/page.tsx` (current platform-admin Home)
- `apps/platform-admin-web/app/health/page.tsx`
  (current platform-admin Health)
- `apps/platform-admin-web/app/layout.tsx`
  (composes `PlatformShell` → `ManagementShell`)
- `apps/platform-admin-web/components/platform-shell.tsx`
  (composes `ManagementShell` from `@drts/ui-web/client`)
- existing platform-admin parity stories on this branch:
  - `packages/ui-web/src/platform-shell.stories.tsx`
  - `packages/ui-web/src/platform-pricing.stories.tsx`
    (no `platform-home.stories.tsx` or `platform-health.stories.tsx` exist
    at packet generation time; the parent task is expected to add the
    Storybook target(s) it needs in order to satisfy
    `Storybook 對照對應 PA_* artboard`)

---

## 3. Dependency Map

### A. Upstream machine-truth dependencies

| Dep ID          | What it contributes to `ADM-UI-RD-003`                                                                                                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-002` | Strips ad-hoc admin CSS hooks (`edcf7e0`), so Home + Health can be redesigned without re-introducing the legacy admin token surface. Direct precondition for the redesign to land on shared tokens.                                                                           |
| `OPS-UI-RD-009` | Wave 2 closeout (`acaf6ab` over `5696358`) — defines the matrix shape (surface · reviewer · approved-at · before · after · canvas · parity story) that Wave 3 platform-admin tasks mirror, including this one. Not a code dependency; it is the acceptance template baseline. |

Transitive (shell):

| Dep ID          | What it contributes to `ADM-UI-RD-003`                                                                                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-001` | Adopts `ManagementShell` in `PlatformShell` (`516321d`). This is what makes "redesign onto new shell" mechanically possible for `/` and `/health`. Recorded here even though it is not in the parent's explicit `depends_on`, because the redesign cannot satisfy `PA_*` artboard parity without it in place. |

Assertion:

- The parent task is not introducing new acceptance bars beyond
  `pnpm --filter @drts/platform-admin-web typecheck / build / test` and
  `Storybook 對照對應 PA_* artboard`. Every checklist item in §4 is a
  faithful expansion of one of those two bars.
- No new hard `depends_on` edge is being asserted in this packet beyond
  the two already in `ai-status.json` (`ADM-UI-RD-002`, `OPS-UI-RD-009`).
  The `ADM-UI-RD-001` row is recorded as transitive/load-bearing
  context, not as a proposed machine-truth dependency change.

### B. Downstream consumer map

`ADM-UI-RD-003` is the first surface-redesign slice of the Wave 3
platform-admin section. Its downstream consumers are the rest of the
Wave 3 platform-admin queue and the eventual Wave 3 platform closeout.

| Consumer                             | Relationship                                | Why `ADM-UI-RD-003` matters                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-004`..`ADM-UI-RD-009`     | sibling Wave 3 platform-admin surface tasks | Establishes the Home + Health baseline that later surfaces (Tenants, Partners, Users/Fleet/Switchboard, Pricing, Payments, Notices/Audit/Flags/Adapters) will mirror — same shell, same primitives, same parity-story discipline. |
| `ADM-UI-RD-010`                      | Wave 3 platform closeout packet             | Wave 3 platform closeout row for "Home + Health" will cite this task's reviewer + approved-at + commit triple, the same way Wave 2 cited each of `OPS-UI-RD-001..008`.                                                            |
| Future redesign waves (driver, etc.) | reference baseline                          | The eventual `ADM-UI-RD-010` closeout will reuse the Wave-2 matrix shape (`OPS-UI-RD-009`); this task's row is one of the inputs.                                                                                                 |

Dispatch interpretation:

- No `ai-status.json` task records a hard machine-truth `depends_on`
  edge to `ADM-UI-RD-003` at packet time. The consumers above are
  sibling / template consumers, not formal dependencies, and should not
  be promoted to hard dependencies in machine truth without an explicit
  decision.

---

## 4. Acceptance Checklist

This checklist restates the parent acceptance bar —
`pnpm --filter @drts/platform-admin-web typecheck / build / test`

- `Storybook 對照對應 PA_* artboard` — as a reviewable line-item list
  against the parent implementation that will land under
  `apps/platform-admin-web/app/{page.tsx,health/page.tsx}` (and any
  parity stories the parent adds under
  `packages/ui-web/src/platform-{home,health}.stories.tsx`).

Legend: `[REQUIRED]` = explicit parent acceptance bar. `[DERIVED]` =
reviewer support gate for this packet.

### A. Build / typecheck / test `[REQUIRED]`

- [ ] `pnpm --filter @drts/platform-admin-web typecheck` passes locally
      at the parent's review commit, with no new errors attributable to
      the Home or Health redesign.
- [ ] `pnpm --filter @drts/platform-admin-web build` passes locally at
      the parent's review commit. `next-env.d.ts` regeneration noise
      from Next.js is tolerable; substantive build failures are not.
- [ ] `pnpm --filter @drts/platform-admin-web test` passes locally at
      the parent's review commit. If the package has no test target,
      the reviewer records that explicitly rather than silently
      skipping the bar.

### B. Storybook parity vs. `PA_*` artboard `[REQUIRED]`

- [ ] The redesigned `/` page composes the shared shell
      (`PlatformShell` → `ManagementShell` from `@drts/ui-web/client`)
      and renders the Home surface using `@drts/ui-web` primitives —
      not the pre-strip ad-hoc admin chrome that `ADM-UI-RD-002`
      removed.
- [ ] The redesigned `/health` page composes the same shared shell and
      renders the Health surface using `@drts/ui-web` primitives.
- [ ] A Storybook target exists under `packages/ui-web/src/` that
      mirrors `PA_Home` (e.g. `platform-home.stories.tsx` or an
      equivalent composed story). The target renders against the same
      canvas anchor (`Platform Admin.html#home`) and exercises the same
      structural elements (page header, governance KPIs, banners,
      module shortcut grid, audit table).
- [ ] A Storybook target exists under `packages/ui-web/src/` that
      mirrors `PA_Health` (e.g. `platform-health.stories.tsx` or an
      equivalent composed story). The target renders against the same
      canvas anchor (`Platform Admin.html#health`) and exercises the
      same structural elements (tabs, dispatch / webhook / eligibility
      / reporting KPIs, active-alerts list, adapter inventory table).
- [ ] If the parent task elects not to add new parity stories but to
      cover Home + Health through an existing composed story
      (analogous to how `OPS-UI-RD-001` shell coverage rolls up
      through `platform-shell.stories.tsx` / `tenant-shell.stories.tsx`
      per the OPS-UI-RD-009 lesson), the parent records that decision
      in its closeout / handoff note so `ADM-UI-RD-010` can cite the
      same anchor without re-deriving it.

### C. Canvas anchor existence `[REQUIRED]`

- [ ] `Platform Admin.html#home` exists in
      `docs/05-ui/drts-design-canvas/Platform Admin.html` (verified at
      packet time: line 61 binds `id="home"` to `<PA_Home />`).
- [ ] `Platform Admin.html#health` exists in the same file (verified
      at packet time: line 62 binds `id="health"` to `<PA_Health />`).
- [ ] `PA_Home` and `PA_Health` are still exported from
      `docs/05-ui/drts-design-canvas/platform-screens.jsx`
      (verified at packet time: definitions at lines 27 and 488; both
      re-exported at line 632–633).

### D. Machine-truth consistency `[REQUIRED]`

- [ ] The parent task's eventual `commit_hash` resolves on
      `origin/feat/claude2-ui-redesign-foundation` (the active Wave 3
      branch). If the parent owner pushes to a different branch, that
      divergence is captured in machine truth (`push_branch`) and is
      not silently absorbed into the closeout.
- [ ] The parent's commit subject contains `ADM-UI-RD-003` and the
      commit body includes the required trailers
      (`LLM-Agent`, `Task-ID`, `Reviewer`), per
      `AI_COLLABORATION_GUIDE.md` §5 commit evidence rule.
- [ ] The parent's `review_approved` event names a reviewer of record
      (expected: `Codex`) and an approval UTC timestamp.

### E. Sidecar handoff readiness `[DERIVED]`

- [ ] This packet matches the current machine-truth owner / reviewer
      assignment for both the sidecar (`Claude2` / `Codex2`) and the
      parent task (`Codex2` / `Codex`).
- [ ] This packet does not snapshot live parent `status` / `next` /
      `last_update` / `commit_*` values; those remain authoritative in
      `ai-status.json`.
- [ ] This packet does not edit canonical truth — the planning ref,
      the design canvas, the platform-admin app source, the parity
      stories, and `ai-status.json` all remain untouched by this
      sidecar.
- [ ] This packet does not record `done` evidence for the parent task;
      that step is the parent owner's responsibility after parent
      review approval.

---

## 5. Reviewer Focus

For `Codex2` reviewing this sidecar:

- confirm the machine-truth anchor section matches the current
  `ai-status.json` fields for both `ADM-UI-RD-003-SIDECAR-ACCEPTANCE`
  and `ADM-UI-RD-003`, with mutable parent lifecycle truth deferred to
  `ai-status.json`
- confirm the upstream dependency table matches the two `done`
  entries' `commit_hash` / `commit_recorded_at` / `commit_reviewer`
  values, and that `ADM-UI-RD-001` is recorded only as a transitive
  prerequisite (not as a proposed new `depends_on` edge)
- confirm the downstream map does not assert any hard machine-truth
  `depends_on` edges that do not exist in `ai-status.json`
- confirm the acceptance checklist remains a faithful expansion of
  the parent acceptance bar and does not invent new bars
- confirm the packet remains support-only and does not modify the
  workbreakdown planning ref, the design canvas, any parity story,
  the platform-admin app source, or `ai-status.json`

---

## 6. Handoff Summary

This sidecar packet is scoped as stable reviewer support material for
`ADM-UI-RD-003` (platform-admin Home + Health redesign). The parent
task itself remains the canonical implementation slice; this packet is
a reviewer companion that:

- pins the two upstream `done` evidence pairs (and the transitive
  shell prerequisite) in one place
- restates the parent acceptance bar
  (`pnpm typecheck / build / test` + `PA_*` Storybook parity) as an
  auditable checklist against `/` and `/health`
- maps the canvas + parity-story anchors that the redesign must hit
- defers all transient parent lifecycle truth (`status`, `next`,
  `last_update`, eventual `commit_*` fields) to `ai-status.json`

After sidecar review approval the packet is intended to remain in
`support/sidecars/ADM-UI-RD-003/` as a stable reference; it is not
absorbed into the parent's implementation or into the eventual
`ADM-UI-RD-010` Wave 3 platform closeout, and it does not change any
other artifact.

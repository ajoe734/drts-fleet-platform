# ADM-UI-RD-004 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `ADM-UI-RD-004` - Tenants list + Tenant Detail / Rollout redesign
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Gemini2`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-10` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical
truth, runtime behavior, parent implementation, or `ai-status.json`.

This packet exists to support the future review of parent `ADM-UI-RD-004`.
It pins the stable machine-truth anchors, upstream dependency baseline,
design / route anchors, and a reviewer-facing checklist for the
`/tenants` and `/tenants/[tenantId]` redesign slice. Volatile lifecycle
truth for both parent and sidecar remains authoritative only in
`ai-status.json`; this document intentionally does not freeze `status`,
`next`, `last_update`, or any eventual parent `commit_*` / `push_*`
fields.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar
  (`pnpm --filter @drts/platform-admin-web typecheck / build / test`
  plus `Storybook 對照對應 PA_* artboard`) as concrete review checks
  for the tenants list and tenant detail / rollout surfaces
- pin the hard machine-truth dependency baseline on
  `ADM-UI-RD-002` and `OPS-UI-RD-009`
- record the current route, canvas, and component anchors already present
  in the repo so the parent reviewer does not need to rediscover them
- make explicit that "Tenant Detail / Rollout" is a single detail surface
  aligned to `PA_TenantDetail`, not a separate `/rollout` route or a new
  canonical dependency edge

Out of scope:

- editing L1/L2 truth, planning refs, the design canvas, Storybook, or
  any runtime file under `apps/**` or `packages/**`
- asserting that the parent implementation is already complete; the
  parent task is still lifecycle-owned by its own row in `ai-status.json`
- inventing new machine-truth dependencies, acceptance bars, or new
  canonical artboards
- recording parent closeout evidence (`commit_hash`, `commit_subject`,
  `push_remote`, `push_branch`) before the parent owner actually ships it
- mutating or absorbing the parent task; that remains the parent
  owner/reviewer workflow

---

## 2. Machine-Truth Anchors

### Sidecar - `ADM-UI-RD-004-SIDECAR-ACCEPTANCE`

Stable fields from `ai-status.json`:

- owner=`Gemini2`
- reviewer=`Codex2`
- task_class=`sidecar`
- helper_parent=`ADM-UI-RD-004`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- depends_on=`ADM-UI-RD-002`, `OPS-UI-RD-009`
- artifact=`support/sidecars/ADM-UI-RD-004/ADM-UI-RD-004-SIDECAR-ACCEPTANCE.md`

Live sidecar lifecycle fields are intentionally deferred to
`ai-status.json`:

- `status`
- `next`
- `last_update`

### Parent - `ADM-UI-RD-004`

Stable fields from `ai-status.json`:

- title=`Tenants list + Tenant Detail / Rollout redesign`
- summary_zh=`PA_Tenants + PA_TenantDetail。Stepper / DL / Roles & invites table 視覺對齊。`
- phase=`Wave 3`
- owner=`Codex2`
- reviewer=`Codex`
- depends_on=`ADM-UI-RD-002`, `OPS-UI-RD-009`
- artifacts=`apps/platform-admin-web/`
- acceptance:
  - `pnpm --filter @drts/platform-admin-web typecheck / build / test`
  - `Storybook 對照對應 PA_* artboard`
- planning_ref=`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`

Volatile parent lifecycle fields are not pinned here:

- `status`
- `next`
- `last_update`
- any future `commit_*` / `push_*` fields

### Upstream dependencies (machine truth)

| Dep ID          | Status | Recorded reviewer | Recorded commit | Why it matters to `ADM-UI-RD-004`                                                                                                                                                      |
| --------------- | ------ | ----------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-002` | `done` | `Codex`           | `edcf7e0`       | Establishes the post-legacy Platform Admin styling baseline so the tenants surfaces can align to shared `ui-web` / platform primitives instead of reintroducing `.admin-*` era chrome. |
| `OPS-UI-RD-009` | `done` | `Claude`          | `acaf6ab`       | Provides the accepted Wave 2 closeout / reviewer-evidence discipline that Wave 3 redesign slices are expected to mirror when they later hand off for review and closeout.              |

Transitive context worth remembering, but not a new hard dependency edge:

| Dep ID          | Status | Recorded reviewer | Recorded commit | Context for this slice                                                                                                    |
| --------------- | ------ | ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-001` | `done` | `Codex2`          | `516321d`       | The shared PlatformShell / ManagementShell adoption is the shell prerequisite under the tenants list and detail surfaces. |

---

## 3. Evidence Anchors Already Present In Repo

Planning / task naming:

- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
  line 432 names `ADM-UI-RD-004` as
  `Tenants list + Tenant Detail / Rollout redesign`

Design-canvas anchors:

- `docs/05-ui/drts-design-canvas/Platform Admin.html#tenants`
  maps to `PA_Tenants`
- `docs/05-ui/drts-design-canvas/Platform Admin.html#tenant-detail`
  maps to `PA_TenantDetail`
- `docs/05-ui/drts-design-canvas/platform-screens.jsx`
  defines `PA_Tenants` and `PA_TenantDetail`

Current platform-admin route targets:

- `apps/platform-admin-web/app/tenants/page.tsx`
- `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx`

Current route-shape observations at packet generation time:

- the repo contains `/tenants` and `/tenants/[tenantId]`
- no separate `apps/platform-admin-web/app/rollout/*` route exists
- the detail page already imports and composes rollout-oriented UI such
  as `Stepper`, `WorkflowPanel`, and `WorkflowSplitLayout`, which matches
  the parent naming of "Tenant Detail / Rollout" as one combined surface

Storybook parity baseline at packet generation time:

- `packages/ui-web/src/platform-shell.stories.tsx`
- `packages/ui-web/src/platform-pricing.stories.tsx`
- no obvious platform-admin tenant-specific parity story exists yet under
  `packages/ui-web/src/`

Reviewer implication:

- the parent acceptance bar still requires Storybook parity against the
  relevant `PA_*` artboards
- if the parent work adds a new tenant-specific parity story, the parent
  handoff should cite the exact file path(s)
- if the parent relies on an existing shared story instead, the reviewer
  should require an explicit explanation of how that story maps to both
  `PA_Tenants` and `PA_TenantDetail`

---

## 4. Dependency Map

### Hard upstream dependencies

| Dependency      | Contribution to the redesign slice                                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-002` | Supplies the accepted post-legacy UI baseline for Platform Admin. `ADM-UI-RD-004` should not regress into ad-hoc CSS hooks or pre-primitive layout patterns that 002 removed. |
| `OPS-UI-RD-009` | Supplies the accepted reviewer-evidence template for UI redesign closeout. This is a structural / process dependency, not a runtime import dependency.                        |

### Transitive / contextual dependency

| Dependency      | Contribution to the redesign slice                                                                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-001` | Provides the shared shell adoption baseline that the tenants pages should continue to render within. This packet records it for reviewer orientation only and does not propose adding it to machine truth. |

### Downstream consumer view

`ADM-UI-RD-004` is a Wave 3 platform-admin redesign slice. Its primary
downstream consumers are later review / closeout artifacts rather than
runtime tasks:

- the parent reviewer handoff for `ADM-UI-RD-004`
- later Wave 3 closeout work that will need tenant-surface evidence
- adjacent Platform Admin redesign slices that should stay visually
  coherent with the tenants governance surface

This packet does not promote any downstream consumer into a formal
`depends_on` edge.

---

## 5. Reviewer Acceptance Checklist

This checklist translates the parent acceptance bar into concrete checks
for the tenants list and tenant detail / rollout surfaces.

Legend:

- `[REQUIRED]` = directly derived from the parent acceptance bar
- `[DERIVED]` = support check this packet expects the reviewer to verify

### A. Build / typecheck / test `[REQUIRED]`

- [ ] `pnpm --filter @drts/platform-admin-web typecheck` passes on the
      parent review commit, with no new errors attributable to the
      tenants redesign.
- [ ] `pnpm --filter @drts/platform-admin-web build` passes on the parent
      review commit.
- [ ] `pnpm --filter @drts/platform-admin-web test` passes on the parent
      review commit, or the handoff explicitly records the package's
      current no-tests posture rather than silently skipping the bar.

### B. Canvas / route parity `[REQUIRED]`

- [ ] The list surface maps to
      `docs/05-ui/drts-design-canvas/Platform Admin.html#tenants`
      (`PA_Tenants`).
- [ ] The detail surface maps to
      `docs/05-ui/drts-design-canvas/Platform Admin.html#tenant-detail`
      (`PA_TenantDetail`).
- [ ] The shipped runtime targets remain the platform-admin routes
      `/tenants` and `/tenants/[tenantId]`; the parent task should not
      silently introduce a separate canonical `/rollout` route unless the
      planning truth is updated elsewhere first.
- [ ] The detail page keeps rollout controls as part of the tenant detail
      governance surface rather than splitting them into an undocumented
      second acceptance target.

### C. Storybook parity `[REQUIRED]`

- [ ] The parent handoff cites the exact Storybook file or files that
      serve as parity proof for `PA_Tenants` and `PA_TenantDetail`.
- [ ] If a new tenant-specific platform story is added, it should live
      under `packages/ui-web/src/` and clearly map back to the two
      design-canvas anchors above.
- [ ] If no new tenant-specific story is added, the handoff note must
      explicitly justify how an existing story provides parity coverage
      for both surfaces.

### D. UI-structure expectations `[DERIVED]`

- [ ] `/tenants` remains a governance list surface, not just a raw table:
      header, filters, summary/KPI framing, and tenant lifecycle cues
      should align with `PA_Tenants`.
- [ ] `/tenants/[tenantId]` preserves the combined detail + rollout
      nature of `PA_TenantDetail`, including rollout progression framing
      (`Stepper` / workflow controls), metadata / detail-list style
      sections, and role / invite / acknowledgement visibility.
- [ ] The redesign continues to render inside the shared Platform Admin
      shell baseline established by `ADM-UI-RD-001` and the styling /
      primitive baseline established by `ADM-UI-RD-002`.
- [ ] The task does not reintroduce legacy `.admin-*` era patterns or
      drift into a different visual system than the accepted Wave 3
      platform-admin direction.

### E. Evidence / handoff hygiene `[DERIVED]`

- [ ] The parent owner cites the final touched runtime files for this
      slice, especially the list page, detail page, and any new story or
      shared tenant-governance helper touched by the redesign.
- [ ] The parent owner states whether tenant detail rollout behavior was
      only visual/compositional or whether any control-plane command
      wiring changed; if behavior changed, the reviewer should expect that
      to remain within the task's existing runtime boundaries rather than
      silently expand canonical truth.
- [ ] Any verification limitations are stated explicitly in the parent
      handoff note.

---

## 6. Review Outcome For This Sidecar

This packet is acceptable only if it stays a support artifact and does
not claim parent completion that `ai-status.json` has not recorded yet.

Packet-level conclusion after reviewer cleanup:

- shared truth now aligns with the sidecar's purpose
- parent `ADM-UI-RD-004` remains lifecycle-owned by its own row in
  `ai-status.json`
- dependency mapping is restricted to the recorded machine-truth edges
  plus clearly marked transitive context
- no canonical truth, runtime source, or parent task fields were edited

The parent owner may now continue using this packet as a reviewer-facing
acceptance companion when `ADM-UI-RD-004` itself reaches implementation
and handoff.

# ADM-UI-RD-005 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `ADM-UI-RD-005` - Partners list + Partner Detail redesign
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-10` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical
truth, runtime behavior, parent implementation, or `ai-status.json`.

This packet exists to support the future review of parent `ADM-UI-RD-005`.
It pins the stable machine-truth anchors, upstream dependency baseline,
design / route anchors, and a reviewer-facing checklist for the
`/partners` and `/partners/[entrySlug]` redesign slice. Volatile lifecycle
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
  for the partners list and partner detail surfaces
- pin the hard machine-truth dependency baseline on
  `ADM-UI-RD-002` and `OPS-UI-RD-009`
- record the current route, canvas, and component anchors already
  present in the repo so the parent reviewer does not need to rediscover
  them
- make explicit that "Partner Detail" is the single detail surface
  aligned to `PA_PartnerDetail`, governed from the platform side
  (auth / eligibility / credentials / readiness) and not a tenant-owned
  configuration surface

Out of scope:

- editing L1/L2 truth, planning refs, the design canvas, Storybook, or
  any runtime file under `apps/**` or `packages/**`
- asserting that the parent implementation is already complete; the
  parent task is still lifecycle-owned by its own row in `ai-status.json`
- inventing new machine-truth dependencies, acceptance bars, or new
  canonical artboards beyond `PA_Partners` and `PA_PartnerDetail`
- recording parent closeout evidence (`commit_hash`, `commit_subject`,
  `push_remote`, `push_branch`) before the parent owner actually ships it
- mutating or absorbing the parent task; that remains the parent
  owner/reviewer workflow
- reshaping the partner credentials / auth contract; this packet only
  observes that the existing detail page already surfaces those
  controls and expects the redesign to preserve them

---

## 2. Machine-Truth Anchors

### Sidecar - `ADM-UI-RD-005-SIDECAR-ACCEPTANCE`

Stable fields from `ai-status.json`:

- owner=`Claude2`
- reviewer=`Codex2`
- task_class=`sidecar`
- helper_parent=`ADM-UI-RD-005`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- depends_on=`ADM-UI-RD-002`, `OPS-UI-RD-009`
- artifact=`support/sidecars/ADM-UI-RD-005/ADM-UI-RD-005-SIDECAR-ACCEPTANCE.md`

Live sidecar lifecycle fields are intentionally deferred to
`ai-status.json`:

- `status`
- `next`
- `last_update`

### Parent - `ADM-UI-RD-005`

Stable fields from `ai-status.json`:

- title=`Partners list + Partner Detail redesign`
- summary_zh=`PA_Partners + PA_PartnerDetail。`
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

| Dep ID          | Status | Recorded reviewer | Recorded commit | Why it matters to `ADM-UI-RD-005`                                                                                                                                                       |
| --------------- | ------ | ----------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-002` | `done` | `Codex`           | `edcf7e0`       | Establishes the post-legacy Platform Admin styling baseline so the partners surfaces can align to shared `ui-web` / platform primitives instead of reintroducing `.admin-*` era chrome. |
| `OPS-UI-RD-009` | `done` | `Claude`          | `acaf6ab`       | Provides the accepted Wave 2 closeout / reviewer-evidence discipline that Wave 3 redesign slices are expected to mirror when they later hand off for review and closeout.               |

Transitive context worth remembering, but not a new hard dependency edge:

| Dep ID          | Status | Recorded reviewer | Recorded commit | Context for this slice                                                                                                                                                                   |
| --------------- | ------ | ----------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-001` | `done` | `Codex2`          | `516321d`       | The shared PlatformShell / ManagementShell adoption is the shell prerequisite under the partners list and detail surfaces; the redesign should keep rendering inside that adopted shell. |

---

## 3. Evidence Anchors Already Present In Repo

Planning / task naming:

- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
  line 433 names `ADM-UI-RD-005` as
  `Partners list + Partner Detail redesign`

Design-canvas anchors:

- `docs/05-ui/drts-design-canvas/Platform Admin.html#partners`
  maps to `PA_Partners`
- `docs/05-ui/drts-design-canvas/Platform Admin.html#partner-detail`
  maps to `PA_PartnerDetail`
- `docs/05-ui/drts-design-canvas/platform-screens.jsx`
  defines `PA_Partners` (function declared near line 169) and
  `PA_PartnerDetail` (function declared near line 201); both are
  re-exported alongside the rest of the `PA_*` artboards near line 632

Current platform-admin route targets:

- `apps/platform-admin-web/app/partners/page.tsx`
- `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`

Current route-shape observations at packet generation time:

- the repo already serves `/partners` and `/partners/[entrySlug]`
- the list page already composes `PageHeader`, `KpiRow` / `KpiCard`,
  `CalloutBanner`, `DataViewCard`, `DataFilterBar`, `DataTable`, and
  `StatusChip` from `@drts/ui-web`, plus the shared
  `partner-governance-shared` helpers from
  `apps/platform-admin-web/components/`
- the detail page already composes `PageHeader`, `KpiRow` / `KpiCard`,
  `CalloutBanner`, `DetailMetadataGrid`, `WorkflowPanel`,
  `WorkflowSplitLayout`, and `StatusChip` from `@drts/ui-web`, alongside
  the shared partner-governance form / readiness helpers
- no separate `apps/platform-admin-web/app/partner/*` or
  `apps/platform-admin-web/app/credentials/*` route exists; credentials
  and readiness live inside the entry detail surface, matching
  `PA_PartnerDetail` rather than introducing a sibling canonical route

Storybook parity baseline at packet generation time:

- `packages/ui-web/src/platform-shell.stories.tsx`,
  `packages/ui-web/src/platform-home-health.stories.tsx`, and
  `packages/ui-web/src/platform-pricing.stories.tsx` reference
  `/partners` only as a nav target, not as a partner-specific parity
  surface
- no obvious partner-specific platform parity story exists yet under
  `packages/ui-web/src/` (no `platform-partners*.stories.tsx` or
  similar at packet generation time)

Reviewer implication:

- the parent acceptance bar still requires Storybook parity against
  `PA_Partners` and `PA_PartnerDetail`
- if the parent work adds a new partner-specific parity story, the
  parent handoff should cite the exact file path(s) under
  `packages/ui-web/src/`
- if the parent relies on an existing shared story (for example a
  generalized data-table or workflow-split story) instead, the
  reviewer should require an explicit explanation of how that story
  provides parity coverage for both `PA_Partners` and
  `PA_PartnerDetail`

---

## 4. Dependency Map

### Hard upstream dependencies

| Dependency      | Contribution to the redesign slice                                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-002` | Supplies the accepted post-legacy UI baseline for Platform Admin. `ADM-UI-RD-005` should not regress into ad-hoc CSS hooks or pre-primitive layout patterns that 002 removed. |
| `OPS-UI-RD-009` | Supplies the accepted reviewer-evidence template for UI redesign closeout. This is a structural / process dependency, not a runtime import dependency.                        |

### Transitive / contextual dependency

| Dependency      | Contribution to the redesign slice                                                                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-001` | Provides the shared shell adoption baseline that the partners pages should continue to render within. This packet records it for reviewer orientation only and does not propose adding it to machine truth. |

Adjacent redesign slices (not dependencies, but coherence anchors):

| Sibling slice   | Why it matters                                                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-RD-003` | Home + Health redesign sets the platform-admin home tone and KPI framing that the partners list KPIs should remain visually consistent with.                                                                |
| `ADM-UI-RD-004` | Tenants list + Tenant Detail / Rollout redesign sets the governance-list pattern (header / filters / KPI / status chips / detail panels) that the partners surfaces should look and behave coherently with. |

### Downstream consumer view

`ADM-UI-RD-005` is a Wave 3 platform-admin redesign slice. Its primary
downstream consumers are later review / closeout artifacts rather than
runtime tasks:

- the parent reviewer handoff for `ADM-UI-RD-005`
- later Wave 3 closeout work that will need partner-surface evidence
- adjacent Platform Admin redesign slices that should stay visually
  coherent with the partner-governance surface

This packet does not promote any downstream consumer into a formal
`depends_on` edge.

---

## 5. Reviewer Acceptance Checklist

This checklist translates the parent acceptance bar into concrete
checks for the partners list and partner detail surfaces.

Legend:

- `[REQUIRED]` = directly derived from the parent acceptance bar
- `[DERIVED]` = support check this packet expects the reviewer to verify

### A. Build / typecheck / test `[REQUIRED]`

- [ ] `pnpm --filter @drts/platform-admin-web typecheck` passes on the
      parent review commit, with no new errors attributable to the
      partners redesign.
- [ ] `pnpm --filter @drts/platform-admin-web build` passes on the parent
      review commit.
- [ ] `pnpm --filter @drts/platform-admin-web test` passes on the parent
      review commit, or the handoff explicitly records the package's
      current no-tests posture rather than silently skipping the bar.

### B. Canvas / route parity `[REQUIRED]`

- [ ] The list surface maps to
      `docs/05-ui/drts-design-canvas/Platform Admin.html#partners`
      (`PA_Partners`).
- [ ] The detail surface maps to
      `docs/05-ui/drts-design-canvas/Platform Admin.html#partner-detail`
      (`PA_PartnerDetail`).
- [ ] The shipped runtime targets remain the platform-admin routes
      `/partners` and `/partners/[entrySlug]`; the parent task should
      not silently introduce a separate canonical `/partner/*` or
      `/credentials/*` route unless the planning truth is updated
      elsewhere first.
- [ ] The detail page keeps partner-governance controls (auth mode,
      eligibility, branding, readiness checks, lifecycle actions,
      credentials) co-located on `PA_PartnerDetail` rather than splitting
      them into an undocumented secondary canonical surface.

### C. Storybook parity `[REQUIRED]`

- [ ] The parent handoff cites the exact Storybook file or files that
      serve as parity proof for `PA_Partners` and `PA_PartnerDetail`.
- [ ] If a new partner-specific platform story is added, it should live
      under `packages/ui-web/src/` and clearly map back to the two
      design-canvas anchors above.
- [ ] If no new partner-specific story is added, the handoff note must
      explicitly justify how an existing story provides parity coverage
      for both surfaces — recognizing that the current Storybook
      baseline (`platform-shell`, `platform-home-health`,
      `platform-pricing`) only references `/partners` as a nav target.

### D. UI-structure expectations `[DERIVED]`

- [ ] `/partners` remains a governance list surface, not just a raw
      table: header, filter bar (all / active / inactive / attention /
      revoked), KPI framing for total / attention / revoked, and a
      readiness-gap call-out should align with `PA_Partners`.
- [ ] `/partners/[entrySlug]` preserves the combined detail nature of
      `PA_PartnerDetail`, including overview / branding / auth /
      eligibility / readiness / credentials / audit content, rendered
      with `DetailMetadataGrid`, `WorkflowPanel`, and
      `WorkflowSplitLayout` (or accepted successors) rather than legacy
      ad-hoc layout.
- [ ] Status chips for partner entry states (`active`, `inactive`,
      `revoked`, attention) are driven through the shared
      `StatusChip` / `partnerStatusTone` helpers rather than open-coded
      inline styling.
- [ ] Readiness gating remains explicit: incomplete readiness should
      block silent promotion, mirroring the existing
      `buildPartnerReadinessItems` posture.
- [ ] The redesign continues to render inside the shared Platform Admin
      shell baseline established by `ADM-UI-RD-001` and the styling /
      primitive baseline established by `ADM-UI-RD-002`.
- [ ] The task does not reintroduce legacy `.admin-*` era patterns or
      drift into a different visual system than the accepted Wave 3
      platform-admin direction.

### E. Evidence / handoff hygiene `[DERIVED]`

- [ ] The parent owner cites the final touched runtime files for this
      slice, especially the list page, detail page, the shared partner
      governance helpers under
      `apps/platform-admin-web/components/partner-governance-shared.tsx`,
      and any new story or shared partner helper touched by the
      redesign.
- [ ] The parent owner states whether partner detail behavior was only
      visual / compositional or whether any control-plane command
      wiring changed (`activatePlatformPartnerEntry`,
      `deactivatePlatformPartnerEntry`, `revokePlatformPartnerEntry`,
      `createPlatformPartnerEntry`, credential issue / revoke). If
      behavior changed, the reviewer should expect that to remain
      within the task's existing runtime boundaries rather than
      silently expand canonical truth.
- [ ] Any verification limitations are stated explicitly in the parent
      handoff note.

---

## 6. Review Outcome For This Sidecar

This packet is acceptable only if it stays a support artifact and does
not claim parent completion that `ai-status.json` has not recorded yet.

Packet-level conclusion at first hand-off:

- shared truth aligns with the sidecar's stated purpose
- parent `ADM-UI-RD-005` remains lifecycle-owned by its own row in
  `ai-status.json`
- dependency mapping is restricted to the recorded machine-truth edges
  plus clearly marked transitive / sibling context
- no canonical truth, runtime source, or parent task fields were edited

The parent owner may now use this packet as a reviewer-facing
acceptance companion when `ADM-UI-RD-005` itself reaches implementation
and handoff.

# XS-UI-002 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `XS-UI-002` - Missing Backend Endpoint Gap Inventory
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Codex2`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-05-08` (UTC) - original draft lineage retained
**Last Refresh:** `2026-05-08` (UTC) - refreshed to stop snapshotting transient sidecar review-cycle fields inside the packet
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or the parent gap inventory itself.

This packet is the reviewer-facing acceptance companion to
`support/sidecars/XS-UI-002/backend-gap-inventory.md`. The parent inventory remains the evidence
file; this packet summarizes the stable machine-truth anchors, acceptance checklist, dependency
map, and what the reviewer should validate before accepting this sidecar handoff. Transient sidecar
lifecycle fields such as live `status`, `next`, and `last_update` remain authoritative only in
`ai-status.json`.

---

## 1. Scope Boundary

In scope:

- translate the parent task's acceptance bar into a concrete reviewer checklist
- pin the machine-truth dependency on `XS-UI-001`
- map the downstream tenant slices that consume `XS-UI-002`
- record the parent task's current closeout state so the sidecar does not preserve stale blocker language

Out of scope:

- editing L1/L2 product truth, execution packet truth, or `ai-status.json`
- changing the parent inventory's backend conclusions, route authority decisions, or probable ownership calls
- reopening or re-litigating the already recorded parent closeout evidence

---

## 2. Machine Truth Anchors

### Sidecar (this task) - `ai-status.json -> XS-UI-002-SIDECAR-ACCEPTANCE`

- owner=`Codex2`
- reviewer=`Codex`
- depends_on=`XS-UI-001`
- task_class=`sidecar`
- helper_parent=`XS-UI-002`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/XS-UI-002/XS-UI-002-SIDECAR-ACCEPTANCE.md`
- live lifecycle fields intentionally deferred to `ai-status.json`:
  - `status`
  - `next`
  - `last_update`

Refresh note:

- Earlier drafts preserved obsolete sidecar review snapshots and became stale each time the sidecar
  moved between `in_progress`, `review`, and reopen cycles.
- This refresh keeps the stable sidecar assignment and scope in the packet while deferring mutable
  review-cycle truth to `ai-status.json`, which is the canonical machine record.

### Parent - `ai-status.json -> XS-UI-002`

- owner=`Codex2`
- reviewer=`Codex`
- status=`done`
- depends_on=`XS-UI-001`
- acceptance=`backend-gap inventory filed`
- artifact root=`support/sidecars/XS-UI-002`
- recorded closeout evidence:
  - commit=`0df70c384d41563d6a6f74c953f1df66c38678b0`
  - subject=`XS-UI-002 backend gap inventory`
  - push remote=`origin`
  - push branch=`codex/dev-deploy-backend-android`
- current `next` note records owner finalization evidence:
  the parent inventory matches the recorded commit, the normal non-force push exists on
  `origin/codex/dev-deploy-backend-android`, and the whitespace check passed before commit.

### Upstream dependency already satisfied

- `XS-UI-001` is `done` in `ai-status.json`
- recorded closeout commit=`ac44883ab24395efae49061152d8949c2b8c51c7`
- artifact=`support/sidecars/XS-UI-001/route-to-endpoint-map.md`

### Authoritative supporting documents

- `support/sidecars/XS-UI-001/route-to-endpoint-map.md`
- `support/sidecars/XS-UI-002/backend-gap-inventory.md`
- `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
- `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`

---

## 3. Dependency Map

### A. Upstream machine-truth dependency

| Dep ID      | Status (truth) | What it contributes to `XS-UI-002`                                                                                                                                                                                                                                                                                                              |
| ----------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `XS-UI-001` | `done`         | Establishes the tenant route-to-endpoint baseline and the authority seams that `XS-UI-002` turns into concrete backend-gap findings: booking timeline/driver/invoice linkage, approval-impact framing, re-invite gap, webhook delivery/replay boundaries, integration-governance/report-availability drift, and tenant feature-visibility gaps. |

Assertion:

- The parent inventory does not invent new tenant endpoint names. It refines unresolved or
  incomplete rows already partitioned to `XS-UI-002` by `XS-UI-001`.

### B. Downstream consumer map

| Consumer     | Relationship            | Why `XS-UI-002` matters                                                                                                                                                                                                                     |
| ------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-004` | evidence consumer       | Booking detail work needs `BD-1`, `BD-2`, and `BD-3` before it can safely ship timeline, driver/fulfillment summary, and invoice context.                                                                                                   |
| `TEN-UI-005` | evidence consumer       | New-booking policy framing depends on `CC-1`..`CC-3` and `RL-3` so the UI does not invent cost-center catalog or approval semantics.                                                                                                        |
| `TEN-UI-006` | hard dependency         | The execution packet formally lists `XS-UI-002` in `depends_on`; webhook/API-key productization must consume `WH-1`, `WH-2`, and `WH-3`, especially the rule that retry/replay affordances stay hidden unless backend support is confirmed. |
| `TEN-UI-007` | evidence consumer       | Audit/users/settings/roles work overlaps `ST-1`..`ST-4` and `TU-1`..`TU-4`, even though the current machine-truth dependency set does not formally list `XS-UI-002`.                                                                        |
| `TEN-UI-008` | indirect gate           | Identity/RBAC cutover remains constrained by role/governance clarity; `TU-3`, `TU-4`, `ST-2`, and `ST-3` contribute to that readiness.                                                                                                      |
| `TEN-UI-009` | final evidence consumer | The tenant-wave verification packet formally depends on `XS-UI-002` and must carry these accepted backend-gap constraints forward.                                                                                                          |

Dispatch interpretation:

- The execution packet expects `XS-UI-002`, `XS-UI-003`, and `XS-UI-004` to land before
  finalizing tenant workflow implementation that depends on endpoint, command, or query truth.
- `TEN-UI-006` is the only currently recorded hard machine-truth child that explicitly depends on
  `XS-UI-002`; the other listed slices are evidence consumers or indirect gates, not newly asserted
  formal dependencies.

---

## 4. Acceptance Checklist

This checklist restates the parent acceptance bar -
`backend-gap inventory filed with clear "exists / missing / unclear" status per surface` - as a
reviewable checklist against `support/sidecars/XS-UI-002/backend-gap-inventory.md`.

Legend: `[REQUIRED]` = explicit parent acceptance/work item. `[DERIVED]` = reviewer support gate
for this packet.

### A. Required surface coverage `[REQUIRED]`

- [x] Booking detail richness assessed: `BD-1`, `BD-2`, `BD-3`
- [x] Webhook delivery-log visibility assessed: `WH-1`, `WH-2`, `WH-3`
- [x] Tenant settings surface assessed: `ST-1`, `ST-2`, `ST-3`, `ST-4`
- [x] Formal roles / invite management assessed: `TU-1`, `TU-2`, `TU-3`, `TU-4`
- [x] Topology-specific gaps from `TEN-UI-001` assessed: `CC-1`..`CC-3`, `RL-1`..`RL-3`

### B. Status clarity and normalization `[REQUIRED]`

- [x] Every top-level surface in the executive summary has an explicit status.
- [x] Every detailed sub-gap in the decision table has an explicit status and probable owner.
- [x] The inventory preserves the required `exists / missing / unclear` intent while using two
      narrower derived states where needed:
  - `partial`
  - `exists-backend / missing-client`

Review note:

- The parent acceptance language requires clear status per surface. The current inventory satisfies
  that bar because every surface is explicitly classified and the derived statuses are more
  specific, not looser.

### C. Evidence quality `[REQUIRED]`

- [x] Product/topology evidence is cited: route topology, tenant-console product spec, execution packet
- [x] Implementation evidence is cited: `tenant-partner`, `owned-mobility`, `platform-admin`,
      `auth.constants`, `@drts/contracts`, and `@drts/api-client`
- [x] Ownership routing is captured inline and in the consolidated decision table

### D. Sidecar handoff readiness `[DERIVED]`

- [x] This packet now matches the current machine-truth owner/reviewer assignment for both the
      sidecar and the parent task.
- [x] This packet no longer snapshots live sidecar `status` / `next` / `last_update` values that
      can go stale during review loops; those fields are explicitly deferred to `ai-status.json`.
- [x] This packet no longer preserves the obsolete parent whitespace blocker narrative; it reflects
      the current parent `done` state and recorded commit/push evidence.
- [x] The packet remains support-only and does not alter the parent inventory or canonical truth.

---

## 5. Reviewer Focus

For `Codex` reviewing this sidecar:

- confirm the machine-truth anchor section matches the current `ai-status.json` fields for both
  `XS-UI-002-SIDECAR-ACCEPTANCE` and `XS-UI-002`, with mutable sidecar lifecycle truth deferred to
  `ai-status.json`
- confirm the sidecar anchor no longer preserves the earlier availability-reassignment note or any
  stale review snapshot
- confirm the downstream map does not overstate hard dependencies; only `TEN-UI-006` is formal
- confirm the acceptance checklist still matches the current gap IDs and section coverage in
  `backend-gap-inventory.md`
- confirm the refresh removed stale blocker/reopen language and stale live-sidecar fields without
  changing the substance of the dependency map or reviewer checklist

---

## 6. Handoff Summary

This sidecar packet is scoped as stable reviewer support material, not as a second copy of the
sidecar's live workflow state. The parent task is already closed in machine truth, so the remaining
purpose of this file is narrow: provide a clean acceptance packet that preserves the dependency map,
acceptance checklist, and parent closeout evidence while leaving transient sidecar lifecycle truth
to `ai-status.json`.

# TEN-UI-RD-013 Sidecar Acceptance Packet

This document is the parallel support packet for **TEN-UI-RD-013**
(`Cost Center route 新增` / `TN_CostCenter`). It records the acceptance
checklist, dependency map, and contract-gap anchors that a reviewer needs
in order to either (a) accept a narrowed, authority-safe shipment of the
parent task or (b) confirm the parent should stay `blocked` until the
missing tenant cost-center contracts are added.

It does **not** modify canonical truth. It only consolidates anchors that
already exist in `ai-status.json`,
`docs/05-ui/tenant-console-parity-decisions-20260510.md`,
`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`, the design canvas
(`docs/05-ui/drts-design-canvas/`), and the published tenant contracts
(`packages/contracts/src/index.ts`, `packages/api-client/src/index.ts`,
`apps/api/src/modules/tenant-partner/`).

## §1 Scope & Boundary

- **Task ID:** `TEN-UI-RD-013-SIDECAR-ACCEPTANCE`
- **Parent Task:** `TEN-UI-RD-013` — `Cost Center route 新增`
- **Helper Kind:** `acceptance_packet`
- **Owner:** `Claude`
- **Reviewer:** `Codex2`
- **Mutates Canonical:** `false`
- **Objective:** Hand the parent-task owner (`Codex`) and parent reviewer
  (`Codex2`) a single, citation-anchored checklist that distinguishes
  which acceptance gates can be satisfied today vs. which require a
  supervisor decision before reopening, and pins the upstream evidence
  for `TEN-UI-RD-001`.

Guardrails for this packet:

- Add no new tenant contract claims; cite only what is already published.
- Do not edit `apps/tenant-console-web/**`, `packages/contracts/**`,
  `packages/api-client/**`, `apps/api/src/modules/tenant-partner/**`,
  `docs/05-ui/drts-design-canvas/**`, or any L1/L2 truth.
- All output is confined to `support/sidecars/TEN-UI-RD-013/`.
- Do not edit `ai-status.json` from this packet — the sidecar lifecycle
  is driven through `scripts/ai-status.sh`.

## §2 Machine-Truth Anchors (as of 2026-05-12)

### Parent Task: `TEN-UI-RD-013`

| Field        | Value                                                   |
| ------------ | ------------------------------------------------------- |
| Title        | Cost Center route 新增                                  |
| Phase        | Wave 3                                                  |
| Owner        | `Codex`                                                 |
| Reviewer     | `Codex2`                                                |
| Status       | `blocked`                                               |
| Depends on   | `TEN-UI-RD-001`                                         |
| Planning ref | `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` |
| Last update  | `2026-05-10T20:20:33Z`                                  |
| Waiting for  | `Claude`                                                |

Recorded `next` (verbatim, machine truth):

> Missing canonical tenant cost-center contract: product route map has
> no /cost-centers module, and backend only exposes costCenter as
> booking metadata with no tenant cost-center list, quota, usage,
> owner, or approval-rule endpoints. Recorded analysis in
> docs/05-ui/tenant-console-parity-decisions-20260510.md; return to
> discussion_planning before UI implementation.

Recorded acceptance bar (verbatim, machine truth):

- `pnpm --filter @drts/tenant-console-web typecheck / build / test`
- `Storybook 對照對應 TN_* artboard`
- `若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`

The parent has not yet been started for implementation; it transitioned
to `blocked` on the first dispatch
(`2026-05-10T20:20:33Z`) after the owner verified the missing tenant
cost-center contract surface. No `commit_hash` / `push_*` evidence is
expected from the parent task while the contract gap remains.

### Sidecar Task: `TEN-UI-RD-013-SIDECAR-ACCEPTANCE`

| Field               | Value                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| Owner               | `Claude`                                                                  |
| Reviewer            | `Codex2`                                                                  |
| Status              | `review` (lifecycle field; authoritative in `ai-status.json`)             |
| `task_class`        | `sidecar`                                                                 |
| `helper_parent`     | `TEN-UI-RD-013`                                                           |
| `helper_kind`       | `acceptance_packet`                                                       |
| `mutates_canonical` | `false`                                                                   |
| `auto_generated`    | `true` (created by supervisor-underutilization at `2026-05-12T15:54:36Z`) |
| Depends on          | `TEN-UI-RD-001`                                                           |
| Artifacts           | `support/sidecars/TEN-UI-RD-013/TEN-UI-RD-013-SIDECAR-ACCEPTANCE.md`      |

Reviewer ownership for this sidecar was rebalanced from `Codex` to
`Codex2` at `2026-05-12T16:13:46Z` via the recorded
availability-first reassignment in `ai-status.json`.

Live lifecycle fields are deferred to `ai-status.json` (this packet does
not snapshot transient `status` / `next` / `last_update` beyond the
generation timestamp above).

## §3 Dependency Map

### Upstream Dependencies

#### `TEN-UI-RD-001` — Adopt new shell + strip ad-hoc CSS

- **Status:** `done`
- **Owner:** `Claude2` • **Reviewer:** `Codex`
- **Anchor commit:** `515f271395a583fe25be16c110dbf232f4ebcf87` —
  `feat(TEN-UI-RD-001): finish CSS strip + add tenant-shell Storybook target`
- **commit_recorded_at:** `2026-05-10T16:34:46Z`
- **Push:** `origin/feat/claude2-ui-redesign-foundation`
- **Branch presence assertion:** `515f271` resolves on
  `origin/feat/claude2-ui-redesign-foundation` at packet-generation time
  (verified via `git branch -r --contains 515f271…`).
- **What it provides to `TEN-UI-RD-013`:**
  - The new tenant shell + `page-primitives` (`PageHero`, `SurfaceCard`,
    `CalloutPanel`) that any future `/cost-centers` route would render
    inside without reintroducing ad-hoc CSS.
  - The `globals.css` strip means TN_CostCenter parity would rely on
    canvas-aligned primitives instead of bespoke class lists.
  - The Storybook parity baseline
    (`packages/ui-web/src/tenant-shell.stories.tsx`) is the artboard
    regression baseline; any TN_CostCenter parity story would slot
    alongside as a sibling Wave 3 parity surface.

### Transitive (informational, not blocking this sidecar)

- `DSY-UI-003` is `TEN-UI-RD-001`'s upstream; already satisfied. No
  further design-token gate.

### Cross-task contract gaps (block parent, not this packet)

These are **not** dependencies in the `ai-status.json` sense, but the
parent's `blocked` rationale cannot clear until at least one of them is
resolved at the contract layer:

- Tenant cost-center directory read model (currently absent — see §5).
- Tenant cost-center quota / current-usage read model.
- Tenant cost-center owner / approver / default approval-policy metadata.
- Tenant cost-center create / update / disable command surface.

The peer tasks that share the same contract gap and are also blocked:

- `TEN-UI-RD-010` (TN_NewBooking) — `blocked`, same root cause; sibling
  sidecar acceptance packet exists at
  `support/sidecars/TEN-UI-RD-010/TEN-UI-RD-010-SIDECAR-ACCEPTANCE.md`.
- `TEN-UI-RD-014` (TN_Rules) — `blocked`, same root cause (approval-rule
  read/evaluation model also missing).

Reopening `TEN-UI-RD-013` should be sequenced with at least one of:

- (a) canonical tenant cost-center read/write contracts land, **or**
- (b) a supervisor decision narrows the parent's UI acceptance to an
  authority-safe informational scope (see §4.A / §6).

### Downstream consumer map

`TEN-UI-RD-013` is a single-route tenant directory slice within Wave 3.
At packet-generation time it has no hard machine-truth dependants
recorded in `ai-status.json`. The following are reference / template
consumers and must not be promoted to hard `depends_on` edges in machine
truth without an explicit supervisor decision:

| Consumer                        | Relationship       | Why `TEN-UI-RD-013` matters                                                                                                                                                                                                                   |
| ------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave 3 tenant closeout          | reference baseline | The closeout row for `TN_CostCenter` is the artifact pair (reviewer + approved-at + shipped commit + canvas/parity anchors); it stays empty while the parent is `blocked`.                                                                    |
| `TEN-UI-RD-010` (TN_NewBooking) | contract sibling   | TN_NewBooking's narrowed delegate-booking scope expects free-text `costCenter`. A future authoritative cost-center directory shipped here would expand that route's selector UX — but until then, both routes hold the free-text framing.     |
| `TEN-UI-RD-014` (TN_Rules)      | contract sibling   | TN_Rules' approval logic references `cost_center.owner` as an approver token; that token only becomes meaningful once `TEN-UI-RD-013` (or the underlying contract) publishes per-cost-center owner metadata.                                  |
| Design canvas maintenance       | anchor inventory   | The `TN_CostCenter` artboard (`Tenant Console.html#costcenter`) and the `TN_NAV` `costcenter` entry would become load-bearing once a runtime route ships; canvas refactors must preserve those anchors regardless of when the parent reopens. |

## §4 Acceptance Checklist for Parent Task (`TEN-UI-RD-013`)

This checklist restates the parent's three-line acceptance bar
(`pnpm --filter @drts/tenant-console-web typecheck / build / test`,
`Storybook 對照對應 TN_* artboard`,
`若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`)
as a reviewable line-item list. It is split into "satisfiable today
(narrowed scope)" and "requires contract / supervisor decision".
Reviewer `Codex2` must not accept the parent task with §4.B unchecked
unless the supervisor has explicitly approved the narrowed scope in
§4.A.

### A. Satisfiable today — narrowed authority-safe scope

If the supervisor chooses option **(2)** in `docs/05-ui/tenant-console-parity-decisions-20260510.md`
("Narrow the UI acceptance so the route ships only after a revised,
authority-safe informational scope is explicitly approved"), the
authority-safe gates would look like the list below. Until that explicit
supervisor approval is recorded, this section is **not** a license to
ship.

- [ ] Route shell `apps/tenant-console-web/app/cost-centers/page.tsx`
      (new — does not exist yet at packet-generation time) uses the
      shared `page-primitives` and tenant shell from `TEN-UI-RD-001`
      (no ad-hoc CSS classes reintroduced).
- [ ] The route renders only **non-authoritative**, free-text
      cost-center references already observable in the published
      contract (e.g., the historical `costCenter` strings on
      `OwnedOrderRecord` / `BookingRecord` /
      `CreateTenantBookingCommand` / `UpdateTenantBookingCommand`). It
      must not claim to be a canonical cost-center directory.
- [ ] No UI affordance is rendered for: authoritative cost-center
      directory list with `CODE` / `NAME` / `OWNER` typed columns;
      monthly quota cell; this-month usage cell; default approval-rule
      cell; create / update / disable controls. These are explicitly
      out of the narrowed scope because they require the missing
      contract.
- [ ] No new client method is added in
      `packages/api-client/src/index.ts` (no `listCostCenters`,
      `upsertCostCenter`, `getCostCenter`, or quota/usage helper).
      The route only consumes already-published tenant helpers.
- [ ] No new endpoint is added under
      `apps/api/src/modules/tenant-partner/` (no
      `tenant/cost-centers` controller/service).
- [ ] No new field or record type is added to
      `packages/contracts/src/index.ts` (no
      `TenantCostCenterRecord`, `UpsertTenantCostCenterCommand`,
      `CostCenterQuotaSnapshot`, etc.).
- [ ] Tenant runtime navigation
      (`apps/tenant-console-web/lib/navigation.ts`) either (i) does
      **not** add a `Cost Centers` entry, or (ii) adds an entry whose
      `note` copy explicitly describes the narrowed scope (no
      directory authority, no quota authority, no approver authority).
      Note ordering must match `TN_NAV`
      (`docs/05-ui/drts-design-canvas/tenant-screens.jsx:3-23`):
      Directory group is `passengers → addresses → costcenter →
    rules` (lines `:9-:12`), with `costcenter` between `addresses`
      and `rules`, after `addresses` and before `rules`. If the
      narrowed scope ships without a runtime entry, that is also
      acceptable as long as the design canvas anchor is preserved
      (see §4.C).
- [ ] Storybook parity story at
      `packages/ui-web/src/tenant-cost-centers.stories.tsx` (new
      file) exists only if the runtime route ships, renders only the
      narrowed-scope columns, and binds to
      `anchor="costcenter"` (the canonical
      `Tenant Console.html#costcenter` artboard id;
      `Tenant Console.html:73`).
- [ ] Standard technical gates pass against the parent's working tree:
  - [ ] `pnpm --filter @drts/tenant-console-web typecheck`
  - [ ] `pnpm --filter @drts/tenant-console-web build`
  - [ ] `pnpm --filter @drts/tenant-console-web test`
  - [ ] `pnpm --filter @drts/ui-web build-storybook` (regression for
        the new parity story, if shipped)
- [ ] Commit subject contains `TEN-UI-RD-013`; trailers include
      `LLM-Agent`, `Task-ID`, `Reviewer` per
      `AI_COLLABORATION_GUIDE.md` §5.
- [ ] Push recorded as a normal, non-force push to
      `origin/feat/claude2-ui-redesign-foundation` (or current
      redesign branch).

### B. Requires contract decision before reopen (currently blocked)

These are gates that **cannot** be satisfied with today's contracts.
Mark each one explicitly. Acceptance must not "pencil-whip" these:

- [ ] Cost-center directory list rendered against an authoritative
      tenant `listCostCenters` read model with typed `code`, `name`,
      `owner` fields.
- [ ] Monthly quota column populated from an authoritative
      `quota` / `remainingQuota` read model per cost center.
- [ ] This-month usage column populated from an authoritative
      `currentUsage` / `usedThisMonth` read model per cost center.
- [ ] Default approval-rule column populated from an authoritative
      per-cost-center approval-policy / approver-token model. This
      one cross-couples with `TEN-UI-RD-014` (TN_Rules).
- [ ] Create / update / disable controls backed by a published
      `upsertTenantCostCenter` / `disableTenantCostCenter` command
      surface.

Each unchecked gate in §4.B must reference the supervisor decision
(`docs/05-ui/tenant-console-parity-decisions-20260510.md`
§ `TEN-UI-RD-013 — TN_CostCenter contract validation` → "Required
follow-up") that either added the missing contract or accepted the
narrower scope.

### C. Canvas anchor existence — must all hold regardless of reopen path

- [ ] `Tenant Console.html#costcenter` exists in
      `docs/05-ui/drts-design-canvas/Tenant Console.html`. Verified at
      packet-generation time: line `73` binds `id="costcenter"` to
      `<TN_CostCenter theme={th} />`.
- [ ] `TN_CostCenter` is still exported from
      `docs/05-ui/drts-design-canvas/tenant-screens.jsx`. Verified at
      packet-generation time: definition at line `235`; re-exported at
      line `468` alongside `TN_Passengers`, `TN_Addresses`, `TN_Rules`,
      etc.
- [ ] `TN_NAV` ordering at
      `docs/05-ui/drts-design-canvas/tenant-screens.jsx:9-12`
      preserves the Directory group as
      `passengers → addresses → costcenter → rules`. This anchor is
      what drives any future runtime + story-shell nav-order
      acceptance lines for `TEN-UI-RD-013` and the sibling
      `TEN-UI-RD-014`.

### D. Guardrails — must all hold

- [ ] No new fields added to `packages/contracts/src/index.ts` from
      this task. (See `costCenter?: string` /
      `costCenter?: string | null` references on
      `CreateTenantBookingCommand` / `UpdateTenantBookingCommand` /
      `OwnedOrderRecord` / `BookingRecord` — these remain the only
      cost-center surface in the contract.)
- [ ] No new endpoints added to
      `apps/api/src/modules/tenant-partner/**` or any other backend
      module from this task.
- [ ] No new client methods added to
      `packages/api-client/src/index.ts` from this task.
- [ ] No new artboard added to
      `docs/05-ui/drts-design-canvas/tenant-screens.jsx` and no
      canvas anchor renamed; the existing `TN_CostCenter` component
      (`tenant-screens.jsx:235`) and `id="costcenter"` artboard
      (`Tenant Console.html:73`) remain the parity target.
- [ ] No inferred client-local directory semantics, fake quota
      gates, or invented approver tokens. If the supervisor picks
      narrowed scope (§4.A), the UI copy must explicitly describe
      that boundary.
- [ ] No `--no-verify`, no `--force` push, no commit amend on
      previously-pushed history.

### E. Machine-truth consistency — must all hold for parent `done`

- [ ] The parent's eventual `commit_hash` resolves on
      `origin/feat/claude2-ui-redesign-foundation` (the active Wave 3
      branch). If the parent owner pushes to a different branch, that
      divergence is captured in machine truth (`push_branch`) and is
      not silently absorbed into the Wave 3 closeout.
- [ ] The parent's commit subject contains `TEN-UI-RD-013` and the
      commit body includes the required trailers (`LLM-Agent`,
      `Task-ID`, `Reviewer`) per
      `AI_COLLABORATION_GUIDE.md` §5 commit evidence rule.
- [ ] The parent's `review_approved` event names a reviewer of record
      (expected: `Codex2`) and an approval UTC timestamp, taken after
      the supervisor decision is recorded and the parent has executed
      against either §4.A (narrowed scope) or against the
      newly-published canonical contracts (§4.B).

## §5 Contract-Gap Evidence (anchors only, no new claims)

The parent `blocked` rationale is anchored by the following
already-recorded sources. This packet adds no new contract claims; it
only consolidates pointers.

- **Decision record** (canonical for this blocker):
  - `docs/05-ui/tenant-console-parity-decisions-20260510.md`
    § `TEN-UI-RD-013 — TN_CostCenter contract validation`.
- **Published booking surfaces that mention `costCenter` as free-text
  metadata only (allowed scope):**
  - `packages/contracts/src/index.ts`:
    - `CreateTenantBookingCommand.costCenter?: string` (line `1543`).
    - `UpdateTenantBookingCommand.costCenter?: string | null` (line
      `1576`).
    - `OwnedOrderRecord.costCenter: string | null` (line `1740`).
    - `BookingRecord.costCenter: string | null` (line `1805`).
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
    (creates/updates bookings carrying free-text `costCenter`).
- **Absent surfaces — what the design target needs but the contract
  does not publish:**
  - No `TenantCostCenterRecord` / `TenantCostCenterDirectory` record
    type in `packages/contracts/src/index.ts`.
  - No `listCostCenters` / `upsertCostCenter` /
    `disableCostCenter` / quota helper in
    `packages/api-client/src/index.ts` (the tenant client publishes
    `listPassengers`, `upsertPassenger`, `listAddresses`,
    `upsertAddress`, billing, invoice, report, API-key, and webhook
    helpers only — no cost-center entry).
  - No `tenant/cost-centers` controller, service, or route file under
    `apps/api/src/modules/tenant-partner/`.
- **Published product-rule catalog (pricing authority only, not
  approval rules):**
  - `packages/contracts/src/index.ts` → `ProductRuleCatalog`.
  - `apps/api/src/modules/product-rule/product-rule.controller.ts`.
- **Design target (richer than current contract):**
  - `docs/05-ui/drts-design-canvas/tenant-screens.jsx` →
    `TN_CostCenter` (line `235`), table columns: `CODE` / `NAME` /
    `OWNER` / `月配額` / `本月使用` / `審批` (lines `241-247`).
  - `docs/05-ui/drts-design-canvas/Tenant Console.html` →
    `id="costcenter"` (line `73`).
- **Redesign backlog instruction (block instead of invent contract):**
  - `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md:464`
    (`TEN-UI-RD-013 Cost Center route 新增` row in Wave 3 tenant
    section).
  - `ai-status.json` → task `TEN-UI-RD-013`.
- **Current tenant runtime navigation (mirror state):**
  - `apps/tenant-console-web/lib/navigation.ts` — Directory group
    currently lists Passengers (line `38`) and Addresses (line `43`)
    only; no `Cost Centers` runtime entry exists. This matches the
    parent's `blocked` status.
- **Sibling tasks with the same root contract gap:**
  - `ai-status.json` → `TEN-UI-RD-010` (TN_NewBooking) — `blocked`.
  - `ai-status.json` → `TEN-UI-RD-014` (TN_Rules) — `blocked`.

## §6 Reviewer Handoff Notes (for `Codex2`)

1. **Truth-anchor check.** Confirm that `ai-status.json` still records
   `TEN-UI-RD-013.status = blocked`, `depends_on = [TEN-UI-RD-001]`,
   and that `TEN-UI-RD-001` is `done` with commit `515f271`. If those
   drifted, the dependency map in §3 needs a refresh before this
   packet is approved.
2. **Parity-decision freshness.** Re-read
   `docs/05-ui/tenant-console-parity-decisions-20260510.md`
   § `TEN-UI-RD-013 — TN_CostCenter contract validation`. If a
   supervisor decision has since landed (option 1 — add contracts,
   or option 2 — narrow scope), call it out in the approval note so
   the parent owner knows which branch of §4 to execute against.
3. **Cross-task coupling.** TN_CostCenter (`TEN-UI-RD-013`),
   TN_NewBooking (`TEN-UI-RD-010`), and TN_Rules (`TEN-UI-RD-014`)
   share the same contract gap. Approving a narrowed §4.A path here
   should not implicitly unblock the sibling routes; flag if you see
   scope leakage into selector UX on TN_NewBooking or approver-token
   resolution on TN_Rules.
4. **No canonical edits.** Verify that the only changed/added path
   under this task is
   `support/sidecars/TEN-UI-RD-013/TEN-UI-RD-013-SIDECAR-ACCEPTANCE.md`.
5. **Sidecar closure.** This is a support-only artifact. After review
   approval the parent owner closes with `NO_COMMIT_REQUIRED=1` (see
   `AI_COLLABORATION_GUIDE.md` §5 → "For sidecar or explicit
   non-canonical closeout tasks").
6. **Do not absorb.** This packet is intended to remain in
   `support/sidecars/TEN-UI-RD-013/` as a stable reference. Absorption
   into the parent's implementation is the parent owner's decision
   once `TEN-UI-RD-013` reopens; until then this packet's content is
   the reviewer's authoritative checklist.

## §7 Open Questions / Notes

- If the supervisor picks option (2) and the narrowed scope still
  needs **some** runtime page (e.g., for booking-history grouping by
  the existing free-text `costCenter`), reviewer should call out
  whether that grouping crosses into "implied directory authority"
  territory — the boundary is whether the UI presents a list as
  canonical reference vs. surfaces only what was already typed into
  bookings.
- If the supervisor picks option (1) and the cost-center contracts
  land, this acceptance packet's §4.A vs. §4.B split is no longer the
  right shape — a new sidecar revision (not an in-place mutation)
  should re-issue the checklist against the new contract surface so
  the audit trail of the prior `blocked` rationale stays intact.
- The redesign branch (`feat/claude2-ui-redesign-foundation`) is
  currently shared across multiple Wave 3/4 tasks. When `TEN-UI-RD-013`
  eventually reopens, the parent owner should rebase or sequence the
  commit so cost-center changes are isolable for review.
- The sibling packet
  `support/sidecars/TEN-UI-RD-010/TEN-UI-RD-010-SIDECAR-ACCEPTANCE.md`
  already records the same upstream evidence pair (`TEN-UI-RD-001` /
  `515f271`); the two packets agree by design and neither implies a
  hard machine-truth `depends_on` edge between `TEN-UI-RD-010` and
  `TEN-UI-RD-013`.

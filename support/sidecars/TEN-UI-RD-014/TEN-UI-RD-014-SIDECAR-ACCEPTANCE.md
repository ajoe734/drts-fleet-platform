# TEN-UI-RD-014 Sidecar Acceptance Packet

This document is the parallel support packet for **TEN-UI-RD-014**
(`Rules route 新增` / `TN_Rules` — 審批與配額). It records the acceptance
checklist, dependency map, and contract-gap anchors that a reviewer needs
in order to either (a) accept a narrowed, authority-safe shipment of the
parent task or (b) confirm the parent should stay `blocked` until the
missing tenant approval-rule and quota contracts are added.

It does **not** modify canonical truth. It only consolidates anchors that
already exist in `ai-status.json`,
`docs/05-ui/tenant-console-parity-decisions-20260510.md`,
`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`, the design
canvas (`docs/05-ui/drts-design-canvas/`), and the published tenant
contracts (`packages/contracts/src/index.ts`,
`packages/api-client/src/index.ts`,
`apps/api/src/modules/tenant-partner/`).

## §1 Scope & Boundary

- **Task ID:** `TEN-UI-RD-014-SIDECAR-ACCEPTANCE`
- **Parent Task:** `TEN-UI-RD-014` — `Rules route 新增`
- **Helper Kind:** `acceptance_packet`
- **Owner:** `Claude`
- **Reviewer:** `Codex`
- **Mutates Canonical:** `false`
- **Objective:** Hand the parent-task owner (`Codex`) and parent reviewer
  (`Codex2`) a single, citation-anchored checklist that distinguishes
  which acceptance gates can be satisfied today vs. which require a
  supervisor decision before reopening, and pins the upstream evidence
  for `TEN-UI-RD-001`.

Guardrails for this packet:

- Add no new tenant contract claims; cite only what is already
  published.
- Do not edit `apps/tenant-console-web/**`, `packages/contracts/**`,
  `packages/api-client/**`, `apps/api/src/modules/tenant-partner/**`,
  `apps/api/src/modules/product-rule/**`,
  `docs/05-ui/drts-design-canvas/**`, or any L1/L2 truth.
- All output is confined to `support/sidecars/TEN-UI-RD-014/`.
- Do not edit `ai-status.json` from this packet — the sidecar
  lifecycle is driven through `scripts/ai-status.sh`.

## §2 Machine-Truth Anchors (as of 2026-05-12)

### Parent Task: `TEN-UI-RD-014`

| Field        | Value                                                   |
| ------------ | ------------------------------------------------------- |
| Title        | Rules route 新增                                        |
| Phase        | Wave 3                                                  |
| Owner        | `Codex`                                                 |
| Reviewer     | `Codex2`                                                |
| Status       | `blocked`                                               |
| Depends on   | `TEN-UI-RD-001`                                         |
| Planning ref | `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` |
| Last update  | `2026-05-10T20:42:56Z`                                  |
| Waiting for  | `Claude`                                                |

Recorded `next` (verbatim, machine truth):

> Missing tenant approval-rule/quota contract for TN_Rules; see
> docs/05-ui/tenant-console-parity-decisions-20260510.md and route
> back to discussion_planning for contract or scope decision.

Recorded acceptance bar (verbatim, machine truth):

- `pnpm --filter @drts/tenant-console-web typecheck / build / test`
- `Storybook 對照對應 TN_* artboard`
- `若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`

The parent has not been started for implementation; it transitioned to
`blocked` on the first dispatch (`2026-05-10T20:42:56Z`) after the owner
verified the missing tenant approval-rule and quota contract surface.
No `commit_hash` / `push_*` evidence is expected from the parent task
while the contract gap remains.

### Sidecar Task: `TEN-UI-RD-014-SIDECAR-ACCEPTANCE`

| Field               | Value                                                                |
| ------------------- | -------------------------------------------------------------------- |
| Owner               | `Claude`                                                             |
| Reviewer            | `Codex`                                                              |
| Status              | `in_progress` (lifecycle field; authoritative in `ai-status.json`)   |
| `task_class`        | `sidecar`                                                            |
| `helper_parent`     | `TEN-UI-RD-014`                                                      |
| `helper_kind`       | `acceptance_packet`                                                  |
| `mutates_canonical` | `false`                                                              |
| `auto_generated`    | `true` (`auto_created_by = supervisor-underutilization`)             |
| Depends on          | `TEN-UI-RD-001`                                                      |
| Artifacts           | `support/sidecars/TEN-UI-RD-014/TEN-UI-RD-014-SIDECAR-ACCEPTANCE.md` |

Owner ownership for this sidecar was reassigned from `Claude2` to
`Claude` at packet-generation time (Chairman lane-wide
`dispatch_pause` on `Claude2` at `2026-05-12T16:19:39Z`, resets
`2026-05-13T17:00Z`); since the task was backlog with reviewer
`Codex`, the reassignment reopens it as todo on this lane. Live
lifecycle fields are deferred to `ai-status.json` (this packet does
not snapshot transient `status` / `next` / `last_update` beyond the
sidecar's `in_progress` snapshot above).

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
  (verified via `git branch -r --contains 515f271`).
- **What it provides to `TEN-UI-RD-014`:**
  - The new tenant shell + `page-primitives` (`PageHero`, `SurfaceCard`,
    `CalloutPanel`) that any future `/rules` route would render inside
    without reintroducing ad-hoc CSS.
  - The `globals.css` strip means TN_Rules parity would rely on
    canvas-aligned primitives instead of bespoke class lists.
  - The Storybook parity baseline
    (`packages/ui-web/src/tenant-shell.stories.tsx`) is the artboard
    regression baseline; any TN_Rules parity story would slot alongside
    as a sibling Wave 3 parity surface.

### Transitive (informational, not blocking this sidecar)

- `DSY-UI-003` is `TEN-UI-RD-001`'s upstream; already satisfied. No
  further design-token gate.

### Cross-task contract gaps (block parent, not this packet)

These are **not** dependencies in the `ai-status.json` sense, but the
parent's `blocked` rationale cannot clear until at least one of them is
resolved at the contract layer:

- Tenant approval-rule list/read model (priority, condition, action,
  approver, active state).
- Tenant-visible quota and usage summary that can drive rule
  conditions (e.g., `monthly_quota_remaining < 10%`).
- Approver resolution semantics for values such as `cost_center.owner`
  or dual-sign approval.
- Create / update / pause / reorder command surface for tenant rules,
  or an explicitly approved read-only alternative scope.

The peer tasks that share the same root contract gap and are also
blocked:

- `TEN-UI-RD-010` (TN_NewBooking) — `blocked`, same root cause;
  sibling sidecar acceptance packet at
  `support/sidecars/TEN-UI-RD-010/TEN-UI-RD-010-SIDECAR-ACCEPTANCE.md`.
- `TEN-UI-RD-013` (TN_CostCenter) — `blocked`, sibling sidecar
  acceptance packet at
  `support/sidecars/TEN-UI-RD-013/TEN-UI-RD-013-SIDECAR-ACCEPTANCE.md`.
  TN_Rules' approval logic references `cost_center.owner` as an
  approver token (`tenant-screens.jsx:275-277`); that token only
  becomes meaningful once `TEN-UI-RD-013` (or its underlying contract)
  publishes per-cost-center owner metadata.

Reopening `TEN-UI-RD-014` should be sequenced with at least one of:

- (a) canonical tenant approval-rule and quota read/write contracts
  land (option 1 in the parity decision), **or**
- (b) a supervisor decision narrows the parent's UI acceptance to an
  authority-safe informational scope (option 2 — see §4.A / §6).

### Downstream consumer map

`TEN-UI-RD-014` is a single-route tenant governance slice within
Wave 3. At packet-generation time it has no hard machine-truth
dependants recorded in `ai-status.json`. The following are reference /
template consumers and must not be promoted to hard `depends_on` edges
in machine truth without an explicit supervisor decision:

| Consumer                        | Relationship       | Why `TEN-UI-RD-014` matters                                                                                                                                                                                              |
| ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wave 3 tenant closeout          | reference baseline | The closeout row for `TN_Rules` is the artifact pair (reviewer + approved-at + shipped commit + canvas/parity anchors); it stays empty while the parent is `blocked`.                                                    |
| `TEN-UI-RD-010` (TN_NewBooking) | contract sibling   | TN_NewBooking's narrowed delegate-booking scope already framed approval as out-of-scope until a canonical approval-rule contract exists; a future TN_Rules shipment would feed the approval-aware variant of that route. |
| `TEN-UI-RD-013` (TN_CostCenter) | contract sibling   | TN_Rules' approval logic uses `cost_center.owner` as an approver token; that token only becomes meaningful once TN_CostCenter publishes per-cost-center owner metadata (see `TEN-UI-RD-013-SIDECAR-ACCEPTANCE.md` §3).   |
| Design canvas maintenance       | anchor inventory   | The `TN_Rules` artboard (`Tenant Console.html#rules`) and the `TN_NAV` `rules` entry become load-bearing once a runtime route ships; canvas refactors must preserve those anchors regardless of when the parent reopens. |

## §4 Acceptance Checklist for Parent Task (`TEN-UI-RD-014`)

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

If the supervisor chooses option **(2)** in
`docs/05-ui/tenant-console-parity-decisions-20260510.md`
("Narrow the UI acceptance so the route ships only after an
authority-safe, explicitly approved informational scope is defined"),
the authority-safe gates would look like the list below. Until that
explicit supervisor approval is recorded, this section is **not** a
license to ship.

- [ ] Route shell `apps/tenant-console-web/app/rules/page.tsx` (new —
      does not exist yet at packet-generation time) uses the shared
      `page-primitives` and tenant shell from `TEN-UI-RD-001` (no
      ad-hoc CSS classes reintroduced).
- [ ] The route renders only **non-authoritative**, explanatory content
      that documents the parity decision and contract gap. It must not
      claim to be a canonical approval-rule list, approver registry,
      or tenant quota dashboard.
- [ ] No UI affordance is rendered for: prioritized approval-rule
      table with condition, action, approver, and active state; quota
      remaining / quota-usage cells; create / update / pause / reorder
      controls; approver-token autocomplete (e.g., `cost_center.owner`,
      `cc.owner + finance`). These are explicitly out of the narrowed
      scope because they require the missing contract.
- [ ] No new client method is added in
      `packages/api-client/src/index.ts` (no `listApprovalRules`,
      `upsertApprovalRule`, `pauseApprovalRule`, `reorderApprovalRule`,
      `listTenantQuotas`, or approver-token helper). The route only
      consumes already-published tenant helpers.
- [ ] No new endpoint is added under
      `apps/api/src/modules/tenant-partner/` (no `tenant/rules`,
      `tenant/approval-rules`, or `tenant/quotas` controller/service).
      `apps/api/src/modules/product-rule/**` is platform pricing
      authority, not tenant approval rules — do not repurpose it.
- [ ] No new field or record type is added to
      `packages/contracts/src/index.ts` (no `TenantApprovalRuleRecord`,
      `UpsertTenantApprovalRuleCommand`, `TenantQuotaSnapshot`,
      `ApproverToken`, etc.). `PlatformPricingRuleRecord` and
      `ProductRuleCatalog` are platform pricing authority surfaces —
      not approval rules and not tenant-scoped.
- [ ] Tenant runtime navigation
      (`apps/tenant-console-web/lib/navigation.ts`) either (i) does
      **not** add a `Rules` entry, or (ii) adds an entry whose `note`
      copy explicitly describes the narrowed scope (no rule authority,
      no quota authority, no approver authority). Note ordering must
      match `TN_NAV`
      (`docs/05-ui/drts-design-canvas/tenant-screens.jsx:3-23`):
      Directory group is `passengers → addresses → costcenter →
    rules` (lines `:9-:12`), with `rules` after `costcenter` and
      before the `帳務` divider. If the narrowed scope ships without
      a runtime entry, that is also acceptable as long as the design
      canvas anchor is preserved (see §4.C).
- [ ] Storybook parity story at
      `packages/ui-web/src/tenant-rules.stories.tsx` (new file) exists
      only if the runtime route ships, renders only the narrowed-scope
      explanatory content, and binds to `anchor="rules"` (the
      canonical `Tenant Console.html#rules` artboard id;
      `Tenant Console.html:74`).
- [ ] Standard technical gates pass against the parent's working tree:
  - [ ] `pnpm --filter @drts/tenant-console-web typecheck`
  - [ ] `pnpm --filter @drts/tenant-console-web build`
  - [ ] `pnpm --filter @drts/tenant-console-web test`
  - [ ] `pnpm --filter @drts/ui-web build-storybook` (regression for
        the new parity story, if shipped)
- [ ] Commit subject contains `TEN-UI-RD-014`; trailers include
      `LLM-Agent`, `Task-ID`, `Reviewer` per
      `AI_COLLABORATION_GUIDE.md` §5.
- [ ] Push recorded as a normal, non-force push to
      `origin/feat/claude2-ui-redesign-foundation` (or current
      redesign branch).

### B. Requires contract decision before reopen (currently blocked)

These are gates that **cannot** be satisfied with today's contracts.
Mark each one explicitly. Acceptance must not "pencil-whip" these:

- [ ] Prioritized approval-rule table rendered against an
      authoritative tenant `listApprovalRules` read model with typed
      `priority`, `condition`, `action`, `approver`, and `active`
      fields.
- [ ] Approver column populated from an authoritative approver
      resolution model (tokens such as `cost_center.owner`,
      `cc.owner + finance`, `finance` resolve to identifiable
      actors).
- [ ] STATE column reflects an authoritative active / paused state
      from a published rule lifecycle model (not a UI-local toggle).
- [ ] Quota-aware condition support (e.g.,
      `monthly_quota_remaining < 10%`) backed by a tenant-visible
      quota and usage read model. This cross-couples with the
      missing tenant quota contract surface called out in
      `docs/05-ui/tenant-console-parity-decisions-20260510.md`
      § `TEN-UI-RD-014`.
- [ ] Cost-center-bound condition support (e.g.,
      `cost_center = CC-EXEC-01`) backed by an authoritative
      cost-center directory. This cross-couples with `TEN-UI-RD-013`
      and its sidecar packet.
- [ ] Create / update / pause / reorder controls backed by a
      published command surface (e.g.,
      `upsertTenantApprovalRule`, `pauseTenantApprovalRule`,
      `reorderTenantApprovalRules`).

Each unchecked gate in §4.B must reference the supervisor decision
(`docs/05-ui/tenant-console-parity-decisions-20260510.md`
§ `TEN-UI-RD-014 — TN_Rules contract validation` → "Required
follow-up") that either added the missing contract or accepted the
narrower scope.

### C. Canvas anchor existence — must all hold regardless of reopen path

- [ ] `Tenant Console.html#rules` exists in
      `docs/05-ui/drts-design-canvas/Tenant Console.html`. Verified at
      packet-generation time: line `74` binds `id="rules"` to
      `<TN_Rules theme={th} />`.
- [ ] `TN_Rules` is still exported from
      `docs/05-ui/drts-design-canvas/tenant-screens.jsx`. Verified at
      packet-generation time: definition at line `262`; re-exported at
      line `468` alongside `TN_Passengers`, `TN_Addresses`,
      `TN_CostCenter`, etc.
- [ ] `TN_NAV` ordering at
      `docs/05-ui/drts-design-canvas/tenant-screens.jsx:9-12`
      preserves the Directory group as
      `passengers → addresses → costcenter → rules`. This anchor is
      what drives any future runtime + story-shell nav-order
      acceptance lines for `TEN-UI-RD-014` and the sibling
      `TEN-UI-RD-013`.
- [ ] `TN_Rules` breadcrumb at
      `docs/05-ui/drts-design-canvas/tenant-screens.jsx:264` remains
      `['通訊錄', '審批與配額']`; any runtime breadcrumb mirror must
      preserve that two-segment structure.

### D. Guardrails — must all hold

- [ ] No new fields added to `packages/contracts/src/index.ts` from
      this task. (The only existing rule-like surfaces are
      `ProductRuleCatalog` (line `548`) — platform pricing/dispatch
      semantics, not tenant approval — and `PlatformPricingRuleRecord`
      (line `4304`) — platform-admin pricing authority. Neither is a
      tenant approval-rule contract.)
- [ ] No new endpoints added to
      `apps/api/src/modules/tenant-partner/**` or any other backend
      module from this task. `apps/api/src/modules/product-rule/**`
      stays platform-pricing-only — do not repurpose its handlers
      for tenant approval rules.
- [ ] No new client methods added to
      `packages/api-client/src/index.ts` from this task.
- [ ] No new artboard added to
      `docs/05-ui/drts-design-canvas/tenant-screens.jsx` and no
      canvas anchor renamed; the existing `TN_Rules` component
      (`tenant-screens.jsx:262`) and `id="rules"` artboard
      (`Tenant Console.html:74`) remain the parity target.
- [ ] No inferred client-local rule semantics, fake quota gates,
      invented approver tokens (`cost_center.owner`,
      `cc.owner + finance`, etc.), or hard-coded sample-row content
      from `tenant-screens.jsx:275-279` shipped as runtime truth.
      If the supervisor picks narrowed scope (§4.A), the UI copy
      must explicitly describe that boundary.
- [ ] No `--no-verify`, no `--force` push, no commit amend on
      previously-pushed history.

### E. Machine-truth consistency — must all hold for parent `done`

- [ ] The parent's eventual `commit_hash` resolves on
      `origin/feat/claude2-ui-redesign-foundation` (the active Wave 3
      branch). If the parent owner pushes to a different branch, that
      divergence is captured in machine truth (`push_branch`) and is
      not silently absorbed into the Wave 3 closeout.
- [ ] The parent's commit subject contains `TEN-UI-RD-014` and the
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
    § `TEN-UI-RD-014 — TN_Rules contract validation` (lines
    `279-351`).
- **Absent surfaces — what the design target needs but the contract
  does not publish:**
  - No `TenantApprovalRuleRecord` /
    `UpsertTenantApprovalRuleCommand` / `PauseTenantApprovalRuleCommand`
    / `ReorderTenantApprovalRulesCommand` in
    `packages/contracts/src/index.ts`.
  - No `listApprovalRules`, `upsertApprovalRule`, `pauseApprovalRule`,
    `reorderApprovalRules`, or tenant-quota helper in
    `packages/api-client/src/index.ts` (the tenant client publishes
    `listPassengers`, `listAddresses`, `getBillingProfile`,
    `listInvoices`, `listApiKeys`, `listWebhooks`, etc., only — no
    approval-rule or tenant-quota entry).
  - No `tenant/rules`, `tenant/approval-rules`, or `tenant/quotas`
    controller, service, or route file under
    `apps/api/src/modules/tenant-partner/`.
  - No tenant-visible quota/usage read model. `PlatformTenantQuotaSummary`
    (`packages/contracts/src/index.ts:3953`) is platform-admin
    authority on `PlatformAdminTenantRecord` (line `4031`), not a
    tenant-visible read model.
- **Pricing-authority surfaces that are NOT approval rules (do not
  repurpose):**
  - `ProductRuleCatalog` (`packages/contracts/src/index.ts:548`) —
    service buckets, dispatch semantics, order domains, and pricing
    authority hints.
  - `PlatformPricingRuleRecord` /
    `CreatePlatformPricingRuleCommand` /
    `PublishPlatformPricingRuleCommand`
    (`packages/contracts/src/index.ts:4304-4335`) — platform-admin
    pricing rule authority, surfaced via
    `apps/api/src/modules/product-rule/product-rule.controller.ts`
    and `POST /api/platform-admin/pricing-rules` in
    `packages/api-client/src/index.ts:1771-1793`. These are
    platform-pricing surfaces, not tenant approval rules.
- **Design target (richer than current contract):**
  - `docs/05-ui/drts-design-canvas/tenant-screens.jsx` →
    `TN_Rules` (line `262`), table columns: `PRI` / `條件` / `動作` /
    `審批者` / `STATE` (lines `269-273`), with sample rows that
    reference quota and cost-center semantics (lines `275-279`).
  - `docs/05-ui/drts-design-canvas/Tenant Console.html` →
    `id="rules"` (line `74`).
  - `TN_NAV` entry: `{ key: 'rules', icon: 'flags', label: '審批與配額' }`
    (`docs/05-ui/drts-design-canvas/tenant-screens.jsx:12`).
- **Redesign backlog instruction (block instead of invent contract):**
  - `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md:465`
    (`TEN-UI-RD-014 Rules route 新增` row in Wave 3 tenant
    section).
  - `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md:473-474`
    (rules contract gating instruction).
  - `ai-status.json` → task `TEN-UI-RD-014`.
- **Current tenant runtime navigation (mirror state):**
  - `apps/tenant-console-web/lib/navigation.ts` — Directory group
    currently lists Passengers (line `37`) and Addresses (line `42`)
    only; no `Cost Centers` and no `Rules` runtime entry exists. This
    matches the parent's `blocked` status alongside the sibling
    `TEN-UI-RD-013`.
- **Sibling tasks with the same root contract gap:**
  - `ai-status.json` → `TEN-UI-RD-010` (TN_NewBooking) — `blocked`.
  - `ai-status.json` → `TEN-UI-RD-013` (TN_CostCenter) — `blocked`.

## §6 Reviewer Handoff Notes (for `Codex`)

1. **Truth-anchor check.** Confirm that `ai-status.json` still records
   `TEN-UI-RD-014.status = blocked`, `depends_on = [TEN-UI-RD-001]`,
   and that `TEN-UI-RD-001` is `done` with commit `515f271`. If those
   drifted, the dependency map in §3 needs a refresh before this
   packet is approved.
2. **Parity-decision freshness.** Re-read
   `docs/05-ui/tenant-console-parity-decisions-20260510.md`
   § `TEN-UI-RD-014 — TN_Rules contract validation`. If a supervisor
   decision has since landed (option 1 — add contracts, or option 2 —
   narrow scope), call it out in the approval note so the parent owner
   knows which branch of §4 to execute against.
3. **Cross-task coupling.** TN_NewBooking (`TEN-UI-RD-010`),
   TN_CostCenter (`TEN-UI-RD-013`), and TN_Rules (`TEN-UI-RD-014`)
   share an overlapping contract gap. Approving a narrowed §4.A path
   here should not implicitly unblock the sibling routes; flag if you
   see scope leakage into approver-token resolution on TN_Rules or
   into selector UX on TN_NewBooking.
4. **No platform/tenant blur.** `ProductRuleCatalog` and
   `PlatformPricingRuleRecord` are platform pricing authority — they
   must not be repurposed as a tenant approval-rule contract.
   Similarly, `PlatformTenantQuotaSummary` lives on
   `PlatformAdminTenantRecord` (platform-admin governance) and is not
   a tenant-visible quota read model. Flag any proposed implementation
   that imports those types into the tenant console.
5. **No canonical edits.** Verify that the only changed/added path
   under this task is
   `support/sidecars/TEN-UI-RD-014/TEN-UI-RD-014-SIDECAR-ACCEPTANCE.md`.
6. **Sidecar closure.** This is a support-only artifact. After review
   approval the parent owner closes with `NO_COMMIT_REQUIRED=1` (see
   `AI_COLLABORATION_GUIDE.md` §5 → "For sidecar or explicit
   non-canonical closeout tasks").
7. **Do not absorb.** This packet is intended to remain in
   `support/sidecars/TEN-UI-RD-014/` as a stable reference. Absorption
   into the parent's implementation is the parent owner's decision
   once `TEN-UI-RD-014` reopens; until then this packet's content is
   the reviewer's authoritative checklist.

## §7 Open Questions / Notes

- If the supervisor picks option (2) and the narrowed scope still
  needs **some** runtime page (e.g., to document the parity gap or
  surface a "rules deferred until contract lands" notice), reviewer
  should call out whether that page crosses into "implied rule
  authority" territory — the boundary is whether the UI presents the
  table shape as canonical reference vs. surfaces only an explanatory
  pointer to the parity decision record.
- If the supervisor picks option (1) and the tenant approval-rule and
  quota contracts land, this acceptance packet's §4.A vs. §4.B split
  is no longer the right shape — a new sidecar revision (not an
  in-place mutation) should re-issue the checklist against the new
  contract surface so the audit trail of the prior `blocked`
  rationale stays intact.
- The TN_Rules approver-token vocabulary (`cost_center.owner`,
  `cc.owner + finance`, `finance`) cross-couples with `TEN-UI-RD-013`
  (TN_CostCenter) and with whatever finance-actor model lives in the
  tenant billing surface. Reopening TN_Rules ahead of TN_CostCenter
  risks publishing approver tokens that have no resolvable referent.
- The redesign branch (`feat/claude2-ui-redesign-foundation`) is
  currently shared across multiple Wave 3/4 tasks. When
  `TEN-UI-RD-014` eventually reopens, the parent owner should rebase
  or sequence the commit so rule-route changes are isolable for
  review.
- The sibling packets
  `support/sidecars/TEN-UI-RD-010/TEN-UI-RD-010-SIDECAR-ACCEPTANCE.md`
  and
  `support/sidecars/TEN-UI-RD-013/TEN-UI-RD-013-SIDECAR-ACCEPTANCE.md`
  already record the same upstream evidence pair (`TEN-UI-RD-001` /
  `515f271`); the three packets agree by design and neither this
  packet nor the siblings imply a hard machine-truth `depends_on`
  edge between them.

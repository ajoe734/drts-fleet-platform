# TEN-UI-RD-018 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `TEN-UI-RD-018` - Webhooks 完整化  
**Parent Owner:** `Codex2`  
**Parent Reviewer:** `Codex`  
**Sidecar Owner:** `Codex`  
**Sidecar Reviewer:** `Codex2`  
**Generated:** `2026-05-12` (UTC)  
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify
canonical truth, runtime behavior, or the parent task's machine-truth fields.

This packet is the reviewer-facing acceptance companion for the Wave 3 tenant
`Webhooks` parity-fill slice. It pins the machine-truth dependency on
`TEN-UI-RD-001`, the selected-shell baseline, the `TN_Webhooks` design target,
the current backend and api-client constraints, and the concrete checklist the
parent reviewer (`Codex`) should apply when `TEN-UI-RD-018` is handed off.

Transient lifecycle truth remains authoritative only in `ai-status.json`. At
packet generation time:

- `TEN-UI-RD-018` is `in_progress`, owner=`Codex2`, reviewer=`Codex`
- `TEN-UI-RD-018-SIDECAR-ACCEPTANCE` is `in_progress`, owner=`Codex`,
  reviewer=`Codex2`
- `TEN-UI-RD-001` is `done` with commit
  `515f271395a583fe25be16c110dbf232f4ebcf87` on
  `origin/feat/claude2-ui-redesign-foundation`

At packet refresh time, the parent review surface is visible locally as:

- modified route:
  `apps/tenant-console-web/app/webhooks/page.tsx`
- new parity story:
  `packages/ui-web/src/tenant-webhooks.stories.tsx`

This packet therefore anchors review on the currently visible route-and-story
pair, while still preserving the backend/client gap guardrails that limit what
the UI may truthfully claim.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar from `ai-status.json` and the Wave 3
  planning ref as a concrete reviewer checklist
- pin the hard dependency on `TEN-UI-RD-001`
- map the product target across:
  - selected-shell nav / route anchors
  - `TN_Webhooks` design-canvas artboard
  - existing legacy tenant-portal webhook management surface
  - existing backend and api-client capability limits
- pin the current local review surface so the parent reviewer can judge the
  visible route-and-story pair against both design parity and contract limits

Out of scope:

- editing L1/L2 product truth, `ai-status.json`, `current-work.md`, or the
  parent implementation files
- changing backend contracts, inventing new webhook commands, or prescribing
  code fixes for the parent owner
- pre-approving the parent diff or recording parent commit/push evidence
- treating legacy `apps/tenant-portal-web` behavior as the selected-shell truth;
  it is evidence and migration context, not the target delivery surface

---

## 2. Machine Truth Anchors

### Sidecar row — `TEN-UI-RD-018-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress` at packet generation time
- depends_on=`TEN-UI-RD-001`
- helper_parent=`TEN-UI-RD-018`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/TEN-UI-RD-018/TEN-UI-RD-018-SIDECAR-ACCEPTANCE.md`

### Parent row — `TEN-UI-RD-018`

- owner=`Codex2`
- reviewer=`Codex`
- status=`in_progress`
- depends_on=`TEN-UI-RD-001`
- artifacts=`apps/tenant-console-web/app/`
- acceptance:
  - `pnpm --filter @drts/tenant-console-web typecheck / build / test`
  - `Storybook 對照對應 TN_* artboard`
  - `若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`
- `next` at packet generation time:
  - `Review current tenant webhooks surface, compare against TN_Webhooks target, and implement missing UI within existing contracts.`

### Upstream dependency — `TEN-UI-RD-001`

- status=`done`
- owner=`Claude2`
- reviewer=`Codex`
- commit=`515f271395a583fe25be16c110dbf232f4ebcf87`
- subject=`feat(TEN-UI-RD-001): finish CSS strip + add tenant-shell Storybook target`
- push target=`origin/feat/claude2-ui-redesign-foundation`
- branch presence check at packet generation time:
  - `git branch -r --contains 515f271395a583fe25be16c110dbf232f4ebcf87`
    resolves `origin/feat/claude2-ui-redesign-foundation`

### Current selected-shell baseline and worktree state

- planning ref:
  `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md:459-475`
  records `TEN-UI-RD-018` as a Wave 3 parity-fill route and repeats the
  "contract missing -> blocker" rule
- selected-shell nav baseline:
  `apps/tenant-console-web/lib/navigation.ts:63-76` keeps `/webhooks` under
  `Integrations`
- Storybook shell baseline:
  `packages/ui-web/src/tenant-story-support.tsx:33-49` mirrors the same
  `Integrations -> Webhooks` navigation slot
- current local review surface:
  - `apps/tenant-console-web/app/webhooks/page.tsx:30-505`
    renders the selected-shell webhook route
  - `packages/ui-web/src/tenant-webhooks.stories.tsx:83-344`
    renders a dedicated side-by-side parity story
- local status at packet refresh:
  - `M apps/tenant-console-web/app/webhooks/page.tsx`
  - `?? packages/ui-web/src/tenant-webhooks.stories.tsx`

### Authoritative supporting documents

- `docs/05-ui/drts-design-canvas/tenant-screens.jsx:3-23`
  (`TN_NAV`, including `webhooks`)
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx:362-386`
  (`TN_Webhooks` artboard: endpoint table + recent deliveries table + tabs)
- `packages/contracts/src/index.ts:852-901`
  (`CreateTenantWebhookEndpointCommand`,
  `TenantWebhookEndpoint`, `UpdateTenantWebhookEndpointCommand`,
  `WebhookDeliveryRecord`)
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:544-679`
  (existing create, test, update, delete, rotate-secret, tenant-wide
  deliveries, and per-endpoint deliveries routes)
- `packages/api-client/src/index.ts:1273-1294`
  (existing selected shared client helpers: list/create/update/delete
  webhooks plus per-endpoint deliveries only)
- `apps/tenant-console-web/app/webhooks/page.tsx:30-505`
  (current parent review surface: endpoint inventory, policy posture,
  recent-deliveries aggregate, and explicit no-fabricated-mutation guardrail)
- `packages/ui-web/src/tenant-webhooks.stories.tsx:83-344`
  (current parent parity story for side-by-side `TN_Webhooks` review)
- `support/sidecars/XS-UI-002/backend-gap-inventory.md:109-123`
  (`WH-1`, `WH-2`, `WH-3` gap inventory)
- `apps/tenant-portal-web/app/webhooks/page.tsx:111-156`
  (legacy portal data-loading surface)
- `apps/tenant-portal-web/app/webhooks/page.tsx:173-419`
  (legacy portal runtime UI: metrics, policy snapshot, RBAC gating,
  endpoint list, per-endpoint delivery view, notifications)
- `apps/tenant-portal-web/app/webhooks/page.tsx:935-1048`
  (legacy portal server actions: create, update, delete)

---

## 3. Dependency Map

### A. Hard upstream dependency

| Dep ID          | Status | Why it matters to `TEN-UI-RD-018`                                                                                                                                                 |
| --------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-RD-001` | `done` | Supplies the selected tenant shell, final navigation grouping, and Storybook tenant-shell baseline that `/webhooks` must plug into rather than re-centering on the sunset portal. |

`TEN-UI-RD-018` declares no other hard `depends_on` edges in machine truth.
This packet does not add any new hard dependency.

### B. Product-shape and contract dependencies the reviewer must read

These are not extra machine-truth `depends_on` edges, but the parent reviewer
cannot evaluate the slice correctly without them.

| Surface                        | Anchor                                                                                                  | Review implication                                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selected-shell IA target       | `apps/tenant-console-web/lib/navigation.ts:63-76`, `packages/ui-web/src/tenant-story-support.tsx:33-49` | `/webhooks` must remain in the `Integrations` group in both runtime and parity-story chrome.                                                                                                                                                         |
| Design target                  | `docs/05-ui/drts-design-canvas/tenant-screens.jsx:362-386`                                              | The route should align to `TN_Webhooks` endpoint-and-deliveries layout, but must adapt honestly where the design implies unsupported replay semantics.                                                                                               |
| Current selected-shell route   | `apps/tenant-console-web/app/webhooks/page.tsx:30-505`                                                  | The visible parent route is now a real selected-shell surface showing endpoint inventory, policy posture, and inline recent deliveries. Reviewer should verify whether that is sufficient parity, especially around mutation controls and CTA depth. |
| Current parity story           | `packages/ui-web/src/tenant-webhooks.stories.tsx:83-344`                                                | A dedicated parity story now exists. Reviewer should confirm its `anchor=\"webhooks\"` mapping and compare built-vs-canvas drift explicitly.                                                                                                         |
| Existing shared client helpers | `packages/api-client/src/index.ts:1273-1294`                                                            | Create/update/delete/per-endpoint deliveries are already available. Tenant-wide deliveries, send-test, and rotate-secret are not.                                                                                                                    |
| Existing backend routes        | `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:544-679`                              | Backend already supports create, test, update, delete, rotate-secret, tenant-wide deliveries, and per-endpoint deliveries. UI may use only what the shared client exposes unless it extends the client in the same diff.                             |
| Gap inventory                  | `support/sidecars/XS-UI-002/backend-gap-inventory.md:109-123`                                           | `WH-1`: no retry/replay command. `WH-2`: tenant-wide deliveries exist in backend but not client. `WH-3`: send-test and rotate-secret exist in backend but not client.                                                                                |
| Legacy depth                   | `apps/tenant-portal-web/app/webhooks/page.tsx:111-156,173-419,935-1048`                                 | Useful migration evidence for endpoint list, policy summary, RBAC gating, notifications, and CRUD flow, but not selected-shell truth.                                                                                                                |

### C. Downstream consumer

| Consumer        | Relationship                    | Why it matters                                                                                                                                                                                |
| --------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-RD-099` | eventual Wave 3 tenant closeout | The closeout packet will need reviewer-approved evidence that `/webhooks` moved from IA slot to real parity-fill surface, with honest documentation of any still-deferred webhook operations. |

---

## 4. Baseline And Known Gaps

### Current selected-shell review surface

The locally visible parent route now does more than the original IA shell:

- `apps/tenant-console-web/app/webhooks/page.tsx:30-83`
  loads `listWebhooks()` and `getTenantIntegrationGovernancePackage()`, then
  fans out `listWebhookDeliveries(webhookId)` across returned endpoints
- `apps/tenant-console-web/app/webhooks/page.tsx:185-317`
  summarizes endpoint count, active endpoints, delivery failures, baseline
  event coverage, retry posture, and rotation count
- `apps/tenant-console-web/app/webhooks/page.tsx:319-497`
  renders endpoint inventory and recent-deliveries tables directly on the route
- `apps/tenant-console-web/app/webhooks/page.tsx:499-502`
  explicitly restates the guardrail that replay buttons, secret mutation flows,
  and enable/disable semantics must not be invented beyond existing contract

The corresponding parity story is now present at
`packages/ui-web/src/tenant-webhooks.stories.tsx:83-344`.

### Design target

`TN_Webhooks` expects:

- endpoint inventory with URL, subscribed events, state, and recent activity
- recent-deliveries visibility adjacent to endpoint management
- top-level affordances for schema docs and adding endpoints
- a visual tabs model (`Endpoints`, `Deliveries`, `Replay`)

The key acceptance nuance is that the design's `Replay` tab cannot become a real
retry/replay workflow unless the backend grows a real delivery replay command.
Today it does not, and the visible parent route currently keeps that boundary
explicit.

### Legacy tenant-portal depth already available as migration evidence

The sunset portal already demonstrates several product behaviors that the parent
can port or reinterpret inside `apps/tenant-console-web`:

- loads `listWebhooks()`, `listTenantNotificationFeed()`,
  `getTenantIntegrationGovernancePackage()`, and optional
  `listWebhookDeliveries(webhookId)` per endpoint
- surfaces endpoint metrics, policy snapshot, delivery disclaimer, and
  webhook-specific notifications
- gates create/edit/delete behind tenant webhook write capability
- implements create, update, and delete server actions against the shared
  api-client helpers

It does **not** currently prove selected-shell parity. It is only context.

### Current backend and client gaps that must stay explicit

- `WH-1`: no backend retry or replay command exists for a delivery
- `WH-2`: backend has a tenant-wide deliveries feed
  (`GET /api/tenant/webhooks/deliveries`), but `@drts/api-client` only exposes
  per-endpoint `listWebhookDeliveries(webhookId)`
- `WH-3`: backend has send-test and rotate-secret routes, but
  `@drts/api-client` has no helpers for them yet
- a parity story now exists, but reviewer still needs to confirm that its
  `anchor="webhooks"` canvas comparison is sufficient and that it does not hide
  any selected-shell/runtime drift

---

## 5. Acceptance Checklist

Legend:

- `[READY]` = already true before parent handoff
- `[TO VERIFY]` = the parent reviewer checklist

### A. Dependency and placement readiness `[READY]`

- [x] `TEN-UI-RD-001` is `done` and shipped on
      `origin/feat/claude2-ui-redesign-foundation`.
- [x] `/webhooks` already exists as a selected-shell navigation slot under
      `Integrations` in both runtime and Storybook shell support.
- [x] Backend webhook CRUD and delivery read surfaces already exist.
- [x] This sidecar is support-only and does not alter canonical truth.

### B. Selected-shell placement and parity `[TO VERIFY]`

- [ ] The parent implementation lands on `apps/tenant-console-web`, not by
      re-centering the task on `apps/tenant-portal-web`.
- [ ] The owner handoff names the final `/webhooks` route and story files
      explicitly: - `apps/tenant-console-web/app/webhooks/page.tsx` - `packages/ui-web/src/tenant-webhooks.stories.tsx`
- [ ] Runtime nav still exposes `/webhooks` under `Integrations`, and any
      nav-label or grouping change is mirrored in
      `packages/ui-web/src/tenant-story-support.tsx`.
- [ ] Storybook parity evidence exists for the webhook surface and cites the
      `TN_Webhooks` artboard, with the dedicated story's
      `anchor="webhooks"` mapping verified.

### C. Contract-backed behavior `[TO VERIFY]`

- [ ] Endpoint list uses real `TenantWebhookEndpoint` fields
      (`webhookId`, `url`, `events`, `status`, `secretPreview`,
      `secretVersion`, `createdAt`, `updatedAt`, optional `retryPolicy` /
      `runtimeMetadata`) instead of browser-local placeholder truth.
- [ ] Delivery visibility is backed by real `WebhookDeliveryRecord` data.
      If the UI stays per-endpoint, `listWebhookDeliveries(webhookId)` is
      sufficient. If the UI introduces a tenant-wide feed, the same diff must
      add the missing shared api-client helper rather than page-local fetch
      logic.
- [ ] If create/update/delete controls ship, they map only to the existing
      shared helpers and routes: - `createWebhookEndpoint(command)` -> `POST /api/tenant/webhooks` - `updateWebhookEndpoint(webhookId, command)` ->
      `POST /api/tenant/webhooks/:webhookId` - `deleteWebhookEndpoint(webhookId)` ->
      `DELETE /api/tenant/webhooks/:webhookId`
- [ ] If mutation controls do **not** ship in this cycle, the owner handoff
      states that explicitly and explains the remaining selected-shell parity
      delta against the `TN_Webhooks` CTA model.
- [ ] Tenant webhook write actions remain hidden or disabled when the caller
      lacks tenant webhook write capability.
- [ ] If the surface shows webhook policy or delivery-failure framing, it uses
      existing governance data (`getTenantIntegrationGovernancePackage()`) or
      backend delivery records rather than invented product rules.

### D. Guardrails and non-negotiables `[TO VERIFY]`

- [ ] No retry or replay button ships unless the handoff cites a new backend
      delivery command. The design-canvas `Replay` tab is not enough.
- [ ] No rotate-secret or send-test control ships unless the same diff extends
      `@drts/api-client` for: - `POST /api/tenant/webhooks/test` - `POST /api/tenant/webhooks/:webhookId/rotate-secret`
- [ ] No browser-local secret lifecycle or simulated delivery actions are
      introduced to paper over missing shared helpers.
- [ ] If the parent discovers a missing contract beyond the already-known
      `WH-*` gaps, it opens a blocker instead of silently widening the contract
      surface.

### E. Verification and owner handoff evidence `[TO VERIFY]`

- [ ] The owner handoff states the exact `pnpm --filter @drts/tenant-console-web`
      commands that passed for this slice.
- [ ] The handoff states how Storybook parity was checked against
      `TN_Webhooks`.
- [ ] If `packages/api-client/src/index.ts` changed, the handoff names each new
      webhook helper added and why it was required.
- [ ] If the parent ports behavior from the legacy tenant portal, the handoff
      distinguishes: - what moved into the selected shell now - what remains intentionally deferred because the shared client or backend
      still does not support it
- [ ] Reviewer evidence is sufficient to separate "selected-shell parity-fill
      completed" from "legacy portal still has richer depth".

---

## 6. Reviewer Focus Notes

The highest-value review questions for `TEN-UI-RD-018` are:

1. Did the parent actually deliver a selected-shell `/webhooks` route, or only
   move placeholder text around?
2. Did the parent stay inside existing contracts, especially around replay,
   tenant-wide deliveries, rotate-secret, and send-test?
3. Did the parent create truthful Storybook parity evidence for
   `TN_Webhooks`, and does the story expose the real selected-shell drift
   instead of smoothing it over?
4. Does the handoff clearly explain whether mutation controls are delivered now
   or intentionally deferred, given that the visible route currently centers on
   read posture plus delivery evidence?

If those four questions are answered cleanly, the rest of the checklist becomes
routine.

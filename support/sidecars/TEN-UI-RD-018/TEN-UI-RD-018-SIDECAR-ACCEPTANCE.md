# TEN-UI-RD-018 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Task ID:** `TEN-UI-RD-018-SIDECAR-ACCEPTANCE`  
**Parent Task:** `TEN-UI-RD-018`  
**Sidecar Owner:** `Codex2`  
**Sidecar Reviewer:** `Codex`  
**Generated:** `2026-05-12` (UTC)  
**Scope:** support-only artifact; does not edit canonical truth or runtime code.

This packet is the reviewer-facing acceptance companion for `TEN-UI-RD-018`
(`Webhooks 完整化`). It refreshes the old placeholder/stale packet against the
current machine truth, the live route/story review surface, and the currently
published webhook contracts. The parent task is now in `review`, not
`in_progress`.

## 1. Machine Truth Snapshot

### Sidecar row — `TEN-UI-RD-018-SIDECAR-ACCEPTANCE`

- owner=`Codex2`
- reviewer=`Codex`
- status=`in_progress`
- depends_on=`TEN-UI-RD-001`
- artifact=`support/sidecars/TEN-UI-RD-018/TEN-UI-RD-018-SIDECAR-ACCEPTANCE.md`
- acceptance=`Create support artifacts only` / `Do not edit canonical truth` /
  `Hand off the packet to the assigned reviewer`

### Parent row — `TEN-UI-RD-018`

- owner=`Codex2`
- reviewer=`Codex`
- status=`review`
- depends_on=`TEN-UI-RD-001`
- acceptance:
  - `pnpm --filter @drts/tenant-console-web typecheck / build / test`
  - `Storybook 對照對應 TN_* artboard`
  - `若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`
- latest machine-truth note:
  - `apps/tenant-console-web/app/webhooks/page.tsx` was rebuilt around a new
    client manager.
  - `/webhooks` now exposes contract-backed
    `create/update/delete/send-test/rotate-secret`.
  - unknown governance state is preserved as unknown instead of silently
    falling back to false/zero.
  - verification already recorded in `ai-status.json`:
    - `pnpm --filter @drts/tenant-console-web typecheck`
    - `pnpm --filter @drts/tenant-console-web build`
    - `pnpm --filter @drts/tenant-console-web test`
    - `pnpm --filter @drts/ui-web typecheck`
    - `pnpm --filter @drts/ui-web exec storybook build`

### Hard dependency — `TEN-UI-RD-001`

- status=`done`
- owner=`Claude2`
- reviewer=`Codex`
- commit=`515f271395a583fe25be16c110dbf232f4ebcf87`
- subject=`feat(TEN-UI-RD-001): finish CSS strip + add tenant-shell Storybook target`
- push target=`origin/feat/claude2-ui-redesign-foundation`
- why it matters:
  - `/webhooks` must ship inside the selected tenant shell, not the legacy
    portal.
  - Storybook parity must use the tenant shell support already established by
    `TEN-UI-RD-001`.

## 2. Current Review Surface

The current parent review surface is no longer a deleted placeholder. Review
the visible route/story pair below.

| Surface                | Source                                                             | What it now does                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime route loader   | `apps/tenant-console-web/app/webhooks/page.tsx:23-89`              | Loads webhook inventory, governance package, and per-endpoint deliveries with explicit partial-failure capture before rendering `WebhookManager`.                                |
| Runtime route UI       | `apps/tenant-console-web/app/webhooks/webhook-manager.tsx:233-787` | Renders the real selected-shell `Webhooks` page: KPI row, endpoint inventory, recent deliveries, create/manage forms, policy posture, coverage summary, and explicit guardrails. |
| Server actions         | `apps/tenant-console-web/app/webhooks/actions.ts:66-260`           | Wires create, update, delete, send-test, and rotate-secret through published backend/client paths only.                                                                          |
| Storybook parity story | `packages/ui-web/src/tenant-webhooks.stories.tsx:83-344`           | Renders a dedicated side-by-side `TN_Webhooks` review story with `anchor="webhooks"`.                                                                                            |
| Selected-shell nav     | `apps/tenant-console-web/lib/navigation.ts:63-76`                  | Keeps `/webhooks` in `Integrations`.                                                                                                                                             |
| Story shell nav        | `packages/ui-web/src/tenant-story-support.tsx:33-39`               | Mirrors the same `Integrations -> Webhooks` slot in Storybook.                                                                                                                   |

## 3. Design and Contract Anchors

### Design target

- `docs/05-ui/drts-design-canvas/tenant-screens.jsx:362-390`
  - `TN_Webhooks` expects:
    - `Webhook` page header
    - endpoint inventory first
    - recent deliveries table adjacent
    - tabs `Endpoints / Deliveries / Replay`
- Reviewer note:
  - the built route may acknowledge the replay concept, but it must not invent
    replay behavior without contract support.

### Published webhook contracts

- `packages/contracts/src/index.ts:852-901`
  - endpoint create/update models
  - status enum: `active | test_pending | disabled`
  - delivery record shape
- `packages/contracts/src/index.ts:1109-1127`
  - governance package and webhook policy contract
- `packages/api-client/src/index.ts:1274-1330`
  - selected client helpers now include:
    - `listWebhooks`
    - `createWebhookEndpoint`
    - `updateWebhookEndpoint`
    - `deleteWebhookEndpoint`
    - `sendTestWebhook`
    - `rotateWebhookSecret`
    - `listWebhookDeliveries(webhookId)`
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:544-679`
  - backend authority currently exposes:
    - `POST tenant/webhooks`
    - `POST tenant/webhooks/test`
    - `POST tenant/webhooks/:webhookId`
    - `DELETE tenant/webhooks/:webhookId`
    - `POST tenant/webhooks/:webhookId/rotate-secret`
    - `GET tenant/webhooks/deliveries`
    - `GET tenant/webhooks/:webhookId/deliveries`

## 4. Dependency / Gap Map

These are reviewer-relevant dependencies, not new machine-truth `depends_on`
edges.

| Item                                        | Status                                          | Reviewer implication                                                                                                                    |
| ------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-RD-001` shell baseline              | `done`                                          | `/webhooks` must remain inside the selected tenant shell and Storybook shell.                                                           |
| `TN_Webhooks` artboard                      | design target                                   | Expect endpoint-first layout plus nearby delivery evidence.                                                                             |
| `WH-1` replay/retry command gap             | `missing`                                       | No manual replay/retry button should be implied as functional.                                                                          |
| `WH-2` tenant-wide deliveries client gap    | `exists-backend / missing-client`               | The route may aggregate per-endpoint deliveries, but it must not pretend the shared client already exposes tenant-wide delivery fetch.  |
| `WH-3` send-test / rotate-secret client gap | `resolved in current worktree for parent slice` | Parent review should confirm the new client helpers match the already-published backend routes rather than extending backend semantics. |

Reference: `support/sidecars/XS-UI-002/backend-gap-inventory.md:109-123,269-271`.

## 5. Reviewer Checklist For `TEN-UI-RD-018`

Use this checklist when reviewing the parent task.

1. Verify machine truth first.
   - Parent row must still be `status=review` with the recorded verification
     commands in `ai-status.json`.

2. Verify route/story parity against the current visible pair.
   - Runtime route is `apps/tenant-console-web/app/webhooks/page.tsx` +
     `webhook-manager.tsx`, not a placeholder.
   - Storybook parity surface is
     `packages/ui-web/src/tenant-webhooks.stories.tsx`.
   - `/webhooks` remains under `Integrations` in both runtime and story shell.

3. Verify the built surface matches the accepted product shape closely enough.
   - Header, endpoint inventory, and nearby delivery evidence should align with
     `TN_Webhooks`.
   - Coverage/policy side panels may refine the artboard, but they must not
     contradict it.

4. Verify mutations are contract-backed only.
   - Create/update/delete/send-test/rotate-secret must route through published
     server actions and existing backend endpoints.
   - No invented replay/manual retry command should appear.

5. Verify governance fallback is honest.
   - Partial-load handling must keep unknown values explicitly unknown.
   - No false `0`, `no`, or `not required` placeholders should be fabricated
     when the governance package fails to load.
   - The runtime warning path should match
     `webhook-manager.tsx:345-357` and the unknown-state rendering branches in
     the policy/coverage cards.

6. Verify delivery evidence remains contract-safe.
   - Current implementation may aggregate per-endpoint deliveries into a recent
     list.
   - It must not claim the selected shared client already has a tenant-wide
     deliveries helper.

7. Respect blocker policy.
   - If review discovers a missing contract beyond the already-known gap map,
     parent must be blocked or reopened back through discussion planning rather
     than patched with invented semantics.

## 6. Expected Reviewer Conclusion Shape

If parent acceptance passes, the reviewer handoff should mention:

- contract-backed route + story pair verified
- unknown governance fallback remains explicit
- no replay/manual retry contract invented
- recorded verification commands in `ai-status.json` accepted

If parent acceptance fails, the reopen/blocker should point to one of these
classes:

- design parity drift against `TN_Webhooks`
- mutation path exceeds published contracts
- governance fallback regressed into fabricated posture
- delivery feed claims exceed current client/backend truth

## 7. Sidecar Delivery Summary

This sidecar refresh replaces the stale packet framing that still described:

- parent `TEN-UI-RD-018` as `in_progress`
- the route as a deleted or placeholder review surface
- `packages/ui-web/src/tenant-webhooks.stories.tsx` as absent
- `WH-3` as unresolved even though the parent worktree now adds the necessary
  api-client helpers

Current packet stance:

- support-only artifact
- anchored to live machine truth and visible source
- ready to hand off to `Codex` for sidecar review

## 8. Closeout Readiness

- reviewer approval recorded in machine truth at `2026-05-12T17:01:16Z`
- closeout owner remains `Codex2`
- no additional canonical, contract, or runtime edits are required for this
  sidecar; owner closeout only needs task-scoped commit/push evidence plus the
  `done` state transition

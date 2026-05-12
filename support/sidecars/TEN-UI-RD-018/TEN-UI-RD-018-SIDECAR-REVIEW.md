# TEN-UI-RD-018 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `TEN-UI-RD-018` — Webhooks 完整化
**Parent Owner:** `Codex2` (post-`2026-05-11T02:43:55Z` availability-first
reassignment from `Codex`)
**Parent Reviewer:** `Codex` (post-`2026-05-11T02:43:55Z` reassignment from
`Codex2`)
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-12` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, runtime behavior, or the parent task's implementation files.

This packet is a reviewer-facing companion to the parent task
`TEN-UI-RD-018`, which converts `apps/tenant-console-web/app/webhooks` from
an IA shell into a contract-backed surface that surfaces endpoint inventory,
governance posture, retry policy, and inline delivery evidence against the
published tenant integration contract. The parent task is the canonical
implementation slice; this packet pins the machine-truth lifecycle, the
current parent review surface (one reopen against the working tree), the
file-level evidence map, the explicit governance-fallback finding Codex
flagged, and the acceptance checklist the parent reviewer (`Codex`) should
re-apply once the parent owner (`Codex2`) re-handoffs.

At packet generation time the parent task is **in `in_progress`** after a
single `reopen` event at `2026-05-12T14:40:59Z`; no commit has been recorded
for this slice yet. The companion acceptance packet at
`support/sidecars/TEN-UI-RD-018/TEN-UI-RD-018-SIDECAR-ACCEPTANCE.md` is the
acceptance-side counterpart. This packet does not perform the parent's
review approval or `done` closeout — those remain Codex and Codex2 steps
respectively.

Transient parent lifecycle truth (`status`, `next`, `last_update`, future
`commit_hash` / `push_*` fields) remains authoritative only in
`ai-status.json`. This packet snapshots the most recent values for reviewer
convenience but does not replace machine truth.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar from `ai-status.json` and the Wave 3
  planning ref as a concrete reviewer checklist against the parent's
  current working-tree changes
- pin the machine-truth dependency on `TEN-UI-RD-001`
- enumerate the verifiable anchors the parent's implementation cites
  (file paths, contract surfaces, design-canvas artboard, governance
  package, backend routes, api-client helpers)
- record the file-level shape of the current parent review surface so the
  parent reviewer can audit it without re-deriving it from scratch
- record the parent owner's handoff verification and the parent reviewer's
  reopen finding, anchored to the exact lines in the working tree
- summarize the governance-fallback class of bug the reopen flagged, so the
  parent owner has a precise rework target

Out of scope:

- editing L1/L2 product truth, the parent task entry in `ai-status.json`,
  the parent's implementation files
  (`apps/tenant-console-web/app/webhooks/page.tsx`,
  `packages/ui-web/src/tenant-webhooks.stories.tsx`), or any shared design
  canvas / contract / api-client / backend file
- expanding tenant webhook contracts under
  `apps/api/src/modules/tenant-partner/` or `packages/api-client/src/`;
  the parent stays on existing read surfaces and must blocker rather than
  smuggle contract widening into this slice
- pre-approving the parent diff; the parent reviewer (`Codex`) re-runs
  acceptance once the parent owner re-handoffs after the governance
  fallback rework
- recording parent commit / push evidence; no commit exists for this slice
  yet

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json → TEN-UI-RD-018-SIDECAR-REVIEW`

- owner=`Claude2`
- reviewer=`Codex2`
- depends_on=`TEN-UI-RD-001`
- task_class=`sidecar`
- helper_parent=`TEN-UI-RD-018`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/TEN-UI-RD-018/TEN-UI-RD-018-SIDECAR-REVIEW.md`
- live lifecycle fields (`status`, `next`, `last_update`) deferred to
  `ai-status.json`

### Parent — `ai-status.json → TEN-UI-RD-018` (snapshot)

- status=`in_progress` (at `2026-05-12T14:40:59Z`, after Codex's reopen)
- owner=`Codex2`
- reviewer=`Codex`
- phase=`Wave 3`
- depends_on=`TEN-UI-RD-001`
- artifacts=`apps/tenant-console-web/app/`
- acceptance:
  - `pnpm --filter @drts/tenant-console-web typecheck / build / test`
  - `Storybook 對照對應 TN_* artboard`
  - `若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`
- planning_ref=`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- branch the parent's working tree currently sits on=`feat/claude2-ui-redesign-foundation`
- commit/push metadata: none recorded yet for this slice; the parent's
  changes are uncommitted at packet generation time
- `next` at packet generation time (verbatim):
  > Review failed: partial governance-load handling still fabricates
  > contract posture. In apps/tenant-console-web/app/webhooks/page.tsx,
  > governance-derived coverage metrics fall back to 0 when the
  > integration package is unavailable (baseline events/checklist at
  > current lines 150-155 and 217-255), and policy booleans fall back to
  > 'no' when governance read fails (lines 289-308). That contradicts the
  > warning callout and turns unknown transport gaps into false
  > negatives. Please preserve explicit unknown/unavailable state for
  > governance-backed counts and booleans, then re-handoff. Re-verified
  > acceptance commands all pass: pnpm --filter @drts/tenant-console-web
  > typecheck; build; test; pnpm --filter @drts/ui-web typecheck; pnpm
  > --filter @drts/ui-web exec storybook build.

### Parent lifecycle log — `ai-activity-log.jsonl`

All timestamps are UTC and copied verbatim from `ai-activity-log.jsonl`.
The parent's lifecycle is unusually long for a single tenant route slice
because owner and reviewer have moved across `Claude2`, `Gemini2`,
`Codex`, and `Codex2` through `assign`, `chair_reassignment_applied`, and
`task_proactive_rebalanced` events before the first owner actually
implemented the slice.

| Event                       | Timestamp UTC          | Agent        | Outcome                                                                                                                                                                                                                                                                            |
| --------------------------- | ---------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assign` #1                 | `2026-05-10T06:31:45Z` | `Codex`      | Initial assignment: owner `Claude2` / reviewer `Codex`.                                                                                                                                                                                                                            |
| `assign` #2                 | `2026-05-10T10:41:44Z` | `Codex`      | Re-assignment: owner `Gemini2` / reviewer `Codex2`.                                                                                                                                                                                                                                |
| `chair_reassign`            | `2026-05-10T12:20:11Z` | Orchestrator | Owner moved `Gemini2` → `Codex`; rationale: Gemini2 should not receive new backlog while TOK-UI-001 is in repeated terminal degradation.                                                                                                                                           |
| `proactive_rebal` #1        | `2026-05-10T19:12:37Z` | Orchestrator | Owner moved `Codex` → `Codex2`; reviewer moved `Codex2` → `Codex` (availability-first claim).                                                                                                                                                                                      |
| `proactive_rebal` #2        | `2026-05-11T01:45:45Z` | Orchestrator | Owner moved `Codex2` → `Codex`; reviewer moved `Codex` → `Codex2` (availability-first claim while Codex2 unavailable).                                                                                                                                                             |
| `worker_started` (Codex)    | `2026-05-11T02:00:49Z` | Orchestrator | Codex dispatched on `owned_ready_dispatch`.                                                                                                                                                                                                                                        |
| `worker_superseded` (Codex) | `2026-05-11T02:01:14Z` | Orchestrator | Codex worker superseded to prioritize higher-priority review/finalize work.                                                                                                                                                                                                        |
| `start`                     | `2026-05-11T02:22:54Z` | `Codex`      | Codex started: reviewing tenant-console webhooks shell against `TN_Webhooks` artboard and tenant webhook contracts before implementation.                                                                                                                                          |
| `progress`                  | `2026-05-11T02:25:59Z` | `Codex`      | Codex still reviewing artboard / contracts before implementing the page.                                                                                                                                                                                                           |
| `worker_superseded` (Codex) | `2026-05-11T02:32:57Z` | Orchestrator | Codex worker again superseded; second `owned_in_progress_dispatch` cycle interrupted.                                                                                                                                                                                              |
| `worker_failed` (Codex)     | `2026-05-11T02:34:23Z` | Orchestrator | Codex worker exited before reaching a terminal status (raw evidence at `.orchestrator/evidence/codex-20260511T022505Z-3df863ce.json`).                                                                                                                                             |
| `proactive_rebal` #3        | `2026-05-11T02:43:55Z` | Orchestrator | Owner moved `Codex` → `Codex2`; reviewer moved `Codex2` → `Codex` (availability-first claim; Codex unavailable). Current ownership setting.                                                                                                                                        |
| `worker_started` (Codex2)   | `2026-05-12T14:18:31Z` | Orchestrator | Codex2 dispatched on `owned_in_progress_dispatch`.                                                                                                                                                                                                                                 |
| `start`                     | `2026-05-12T14:19:27Z` | `Codex2`     | Codex2 started: review current tenant webhooks surface, compare against `TN_Webhooks` target, and implement missing UI within existing contracts.                                                                                                                                  |
| `progress`                  | `2026-05-12T14:27:24Z` | `Codex2`     | Implemented contract-backed tenant webhooks route and added `TN_Webhooks` parity story; running tenant-console-web and ui-web verification.                                                                                                                                        |
| `handoff` #1                | `2026-05-12T14:29:18Z` | `Codex2`     | First handoff to `Codex`: contract-backed endpoint inventory, governance posture, inline delivery log on `page.tsx`; `TN_Webhooks` parity story added; tenant-console-web typecheck/build/test green; ui-web typecheck + storybook build green; no backend-contract blocker found. |
| `reopen` #1                 | `2026-05-12T14:40:59Z` | `Codex`      | Failure: partial governance-load handling fabricates contract posture (see §4.6 for full quote and line anchors).                                                                                                                                                                  |

No `review_approved` events have fired for `TEN-UI-RD-018` yet at packet
generation time. No commit metadata exists. The parent owner is expected
to rework the governance-fallback handling and re-handoff.

### Upstream dependency — `ai-status.json → TEN-UI-RD-001`

- status=`done`
- shipped commit=`515f271395a583fe25be16c110dbf232f4ebcf87`
- commit subject=`feat(TEN-UI-RD-001): finish CSS strip + add tenant-shell Storybook target`
- commit_recorded_at=`2026-05-10T16:34:46Z`
- push target=`origin/feat/claude2-ui-redesign-foundation`
- contribution to `TEN-UI-RD-018`: tenant console shell adoption baseline +
  `apps/tenant-console-web/app/globals.css` cleanup, so the redesigned
  `/webhooks` route renders inside the post-shell tenant chrome and shares
  `PageHero`, `SurfaceCard`, `CalloutPanel` primitives plus the residual
  `globals.css` token set with Wave 3 sibling routes (e.g.
  `apps/tenant-console-web/app/api-keys`).

### Authoritative supporting documents

- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md:469` — records
  `TEN-UI-RD-018 Webhooks 完整化 (現為 IA shell)` as a Wave 3 parity-fill
  task with the "do not extend contract; open blocker if missing"
  guardrail.
- `docs/05-ui/drts-design-canvas/Tenant Console.html:84` — declares
  `<DCArtboard id="webhooks" label="Webhook + 投遞" …><TN_Webhooks /></DCArtboard>`;
  parity anchor for the redesigned route.
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx:3-23` — `TN_NAV`
  ordering; the `整合` divider precedes `apikeys` (`:17`) which precedes
  `webhooks` (`:18`).
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx:362-390` —
  `TN_Webhooks` artboard with `PageHeader(title='Webhook',
subtitle='端點 · 事件訂閱 · 投遞紀錄 · 重試政策',
tabs=['Endpoints','Deliveries','Replay'])`, endpoint table (URL, EVENTS,
  STATE, LAST), and "近 24h 投遞" delivery table (DLV, WH, EVENT, CODE,
  TRIES, AT, DUR). The `Replay` tab is canvas intent only — backend has
  no replay command.
- `packages/contracts/src/index.ts:811-817` —
  `WebhookRetryPolicyRecord`.
- `packages/contracts/src/index.ts:819-824` —
  `TENANT_WEBHOOK_DISABLE_REASONS` / `TenantWebhookDisableReason`.
- `packages/contracts/src/index.ts:826-831` —
  `TenantWebhookSecretRotationRecord`.
- `packages/contracts/src/index.ts:833-850` —
  `TenantWebhookRuntimeMetadata` (carries `deliveryCount`,
  `failedDeliveryCount`, `lastDeliveredAt`, `nextAttemptAt`,
  `retryPolicy`, and nested `secretRotation.{currentVersion, rotatedAt,
rotationCount, history}`).
- `packages/contracts/src/index.ts:852-879` —
  `CreateTenantWebhookEndpointCommand`,
  `TENANT_WEBHOOK_ENDPOINT_STATUSES` /
  `TenantWebhookEndpointStatus` (`active` / `test_pending` /
  `disabled`), `TenantWebhookEndpoint` (`webhookId`, `tenantId`, `url`,
  `events`, `status`, `secretVersion`, `secretPreview`, `createdAt`,
  `updatedAt`, optional `retryPolicy` / `runtimeMetadata` /
  `secretHistory`).
- `packages/contracts/src/index.ts:881-901` —
  `UpdateTenantWebhookEndpointCommand`, `SendTestWebhookCommand`,
  `WebhookDeliveryRecord` (`deliveryId`, `webhookId`, `tenantId`,
  `eventType`, `attempt`, `status` ∈ `queued`/`delivered`/`delivery_failed`,
  `httpStatus`, `signature`, `createdAt`).
- `packages/contracts/src/index.ts:1109-1117` —
  `TenantWebhookGovernancePolicy` (`testEventType`,
  `autoDisableAfterConsecutiveFailures`,
  `revalidationRequiredOnCreate`,
  `revalidationRequiredOnEndpointMutation`,
  `revalidationRequiredOnSecretRotation`,
  `deliveryFailureNotificationChannel`, nested `retryPolicy`).
- `packages/contracts/src/index.ts:1119-1127` —
  `TenantIntegrationGovernancePackage` (`tenantId`, `generatedAt`,
  `apiKeyPolicy`, `webhookPolicy`, `baselineWebhookEvents`,
  `baselineNotificationSubscriptions`, `onboardingChecklist`); this is
  what `getTenantIntegrationGovernancePackage()` returns.
- `packages/api-client/src/index.ts:1273-1295` —
  `listWebhooks` / `createWebhookEndpoint` / `updateWebhookEndpoint` /
  `deleteWebhookEndpoint` / `listWebhookDeliveries(webhookId, …)` client
  methods (per-endpoint deliveries only; no tenant-wide delivery helper).
- `packages/api-client/src/index.ts:1316` —
  `getTenantIntegrationGovernancePackage()` client method.
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:544-679`
  — the backend routes the client targets:
  - `POST tenant/webhooks` (`:544`)
  - `POST tenant/webhooks/test` (`:560`)
  - `POST tenant/webhooks/:webhookId` (`:580`)
  - `DELETE tenant/webhooks/:webhookId` (`:598`)
  - `POST tenant/webhooks/:webhookId/rotate-secret` (`:616`)
  - `GET tenant/webhooks/deliveries` (`:649`, tenant-wide)
  - `GET tenant/webhooks/:webhookId/deliveries` (`:664`, per-endpoint)
- `apps/tenant-console-web/lib/navigation.ts:63-76` — runtime nav still
  exposes `/webhooks` under the `Integrations` group, adjacent to
  `/api-keys`.
- `packages/ui-web/src/tenant-story-support.tsx:33-40` — Storybook shell
  support mirrors the same `Integrations → Webhooks` slot for parity
  rendering.
- `support/sidecars/XS-UI-002/backend-gap-inventory.md:109-123,269-271`
  — recorded webhook gaps:
  - `WH-1` `missing`: no backend retry/replay command endpoint.
  - `WH-2` `exists-backend / missing-client`: tenant-wide deliveries feed
    exists in backend (`GET tenant/webhooks/deliveries`) but
    `@drts/api-client` only exposes per-endpoint
    `listWebhookDeliveries(webhookId)`.
  - `WH-3` `exists-backend / missing-client`: send-test and
    rotate-secret backend routes exist but `@drts/api-client` has no
    helpers for them yet.

---

## 3. Dependency Map

### A. Upstream machine-truth dependencies

The parent task formally depends only on `TEN-UI-RD-001`. That dependency
is already `done` and shipped on the active branch.

| Dep ID          | Status | Reviewer of record | Approved (UTC)       | Shipped commit | What it contributes to `TEN-UI-RD-018`                                                                                                                                                                                                                       |
| --------------- | ------ | ------------------ | -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TEN-UI-RD-001` | `done` | `Codex`            | 2026-05-10T16:34:46Z | `515f271`      | Tenant console shell + `globals.css` cleanup + `tenant-shell.stories.tsx` parity baseline; required so the `/webhooks` route renders post-shell and shares `PageHero` / `SurfaceCard` / `CalloutPanel` with Wave 3 sibling tenant routes (e.g. `/api-keys`). |

Branch presence assertion:

- `515f271` is recorded as `push_commit` / `push_ref` for `TEN-UI-RD-001`
  on `origin/feat/claude2-ui-redesign-foundation` in `ai-status.json` at
  packet generation time.

The parent does not declare any other hard `depends_on` in machine truth.
There is no contract-side `depends_on` row because the parent explicitly
reuses existing tenant integration APIs (per the planning ref's
"do not extend contract" guardrail) and adds no new contract surface.

### B. Product-shape and contract dependencies the reviewer must read

These are not extra machine-truth `depends_on` edges, but the parent
reviewer cannot evaluate the slice correctly without them.

| Surface                        | Anchor                                                                                                             | Review implication                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selected-shell IA target       | `apps/tenant-console-web/lib/navigation.ts:63-76`, `packages/ui-web/src/tenant-story-support.tsx:33-40`            | `/webhooks` must remain in the `Integrations` group in both runtime and parity-story chrome.                                                                                                                                          |
| Design target                  | `docs/05-ui/drts-design-canvas/Tenant Console.html:84`, `docs/05-ui/drts-design-canvas/tenant-screens.jsx:362-390` | Endpoint table + 24h deliveries layout is the parity target; `Replay` tab is canvas intent only — backend has no replay command.                                                                                                      |
| Current selected-shell route   | `apps/tenant-console-web/app/webhooks/page.tsx:1-505`                                                              | The visible parent route shows endpoint inventory, governance posture (`apiKeyPolicy`/`webhookPolicy`-derived), and an inline delivery log. The reopen finding targets the way this route renders posture when governance read fails. |
| Current parity story           | `packages/ui-web/src/tenant-webhooks.stories.tsx:1-345`                                                            | A dedicated `TN_Webhooks` parity story (`anchor="webhooks"`) now exists; reviewer should confirm both side-by-side panels render and that the story does not hide selected-shell drift.                                               |
| Tenant webhook contract types  | `packages/contracts/src/index.ts:811-901, 1109-1127`                                                               | The route may only use the fields enumerated here; no invented status, retry, or governance shape.                                                                                                                                    |
| Existing shared client helpers | `packages/api-client/src/index.ts:1273-1316`                                                                       | Create/update/delete/per-endpoint deliveries + governance read are available. Tenant-wide deliveries, send-test, and rotate-secret are not exposed by the client.                                                                     |
| Existing backend routes        | `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:544-679`                                         | Backend already supports create, test, update, delete, rotate-secret, tenant-wide deliveries, and per-endpoint deliveries. UI may use only what the shared client exposes unless the same diff extends the client.                    |
| Gap inventory                  | `support/sidecars/XS-UI-002/backend-gap-inventory.md:109-123,269-271`                                              | `WH-1`: no retry/replay command. `WH-2`: tenant-wide deliveries exist in backend but not client. `WH-3`: send-test and rotate-secret exist in backend but not client.                                                                 |
| Sidecar acceptance packet      | `support/sidecars/TEN-UI-RD-018/TEN-UI-RD-018-SIDECAR-ACCEPTANCE.md`                                               | Companion acceptance-side support packet generated by `Codex` (sidecar owner) / `Codex2` (sidecar reviewer); restates the parent acceptance bar as a forward-looking checklist.                                                       |
| Sibling parity slice           | `support/sidecars/TEN-UI-RD-017/TEN-UI-RD-017-SIDECAR-REVIEW.md`                                                   | API Keys lives next to Webhooks in the `整合` band; the `CalloutPanel` at `api-key-manager.tsx:487-490` explicitly anchors that adjacency. Pattern reference, not a hard dependency.                                                  |

### C. Downstream consumer map

`TEN-UI-RD-018` is a single-route tenant parity-fill slice. Its downstream
consumers are not other `ai-status.json` tasks with explicit `depends_on`
edges, but the Wave 3 tenant closeout and the parity-decisions doc.

| Consumer                                                     | Relationship       | Why `TEN-UI-RD-018` matters                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-RD-099` Wave 3 tenant closeout packet                | reference baseline | The Wave 3 closeout matrix needs a row for the `Webhooks` surface with reviewer + approved-at + shipped commit + canvas anchor; this task will eventually provide those values.                                                                      |
| `TEN-UI-RD-017` API Keys 完整化                              | structural sibling | Webhooks lives next to API Keys in the `整合` nav band; the closing `CalloutPanel` on `api-keys/api-key-manager.tsx` explicitly anchors that adjacency. The Webhooks slice should keep the inverse adjacency clean (no API-key vocabulary leaking).  |
| Design canvas maintenance (`docs/05-ui/drts-design-canvas/`) | anchor inventory   | The `TN_Webhooks` artboard at `Tenant Console.html#webhooks` will become load-bearing for a shipped route once approved; canvas refactors must preserve `id="webhooks"`.                                                                             |
| Tenant parity decisions doc                                  | documentation      | `docs/05-ui/tenant-console-parity-decisions-20260510.md` is the parity-fill log; the Webhooks route's "no contract expansion + governance-driven posture + replay deferred to backend" stance should land in Wave 3 closeout writing once approved.  |
| Reviewers of `apps/tenant-console-web`                       | review boundary    | The `/webhooks` route is a server-rendered surface with `dynamic="force-dynamic"`; reviewers should treat error handling and governance-fallback semantics as part of the tenant-portal review surface, including the reopen finding addressed here. |

Dispatch interpretation:

- No `ai-status.json` task currently records a hard machine-truth
  `depends_on` edge **to** `TEN-UI-RD-018` at packet time. The consumers
  above are reference / template consumers, not formal dependencies, and
  should not be promoted to hard dependencies in machine truth without an
  explicit decision.

---

## 4. Implementation Evidence Map

The parent's working tree currently touches two files (no shared contract,
api-client, backend, canvas, or shell file is modified). At packet
generation time `git status` reports:

- `M apps/tenant-console-web/app/webhooks/page.tsx`
  (`+484 / -19` per `git diff --stat HEAD`)
- `?? packages/ui-web/src/tenant-webhooks.stories.tsx` (new file)

No other path is touched by this slice in the working tree. This section
records what each file contributes and where the parent reviewer can find
the load-bearing lines.

### 4.1 `apps/tenant-console-web/app/webhooks/page.tsx` (rewritten — 505 lines)

- declares `export const dynamic = "force-dynamic"` (`page.tsx:16`) so each
  visit reloads the contract data from `listWebhooks()` and
  `getTenantIntegrationGovernancePackage()` rather than serving cached
  posture.
- module-level type aliases `DeliveryGroup` (`:18-21`) and
  `WebhooksPageData` (`:23-28`) describe the route's input shape:
  `webhooks: TenantWebhookEndpoint[]`,
  `governance: TenantIntegrationGovernancePackage | null`,
  `deliveries: DeliveryGroup[]`, `errors: string[]`. The `governance: …
| null` shape is the part the reopen finding interacts with.
- `loadWebhooksPageData()` (`:30-84`) uses `Promise.allSettled` over
  `client.listWebhooks()` and
  `client.getTenantIntegrationGovernancePackage()` (`:34-37`); a rejected
  promise becomes a user-facing error string rather than a 5xx, so the
  UI shell stays renderable when one integration read fails. Per-endpoint
  delivery reads fan out via `client.listWebhookDeliveries(webhookId)`
  (`:60-81`) and are aggregated through their own `Promise.allSettled`
  pass.
- imports `TenantIntegrationGovernancePackage`, `TenantWebhookEndpoint`,
  `TenantWebhookEndpointStatus`, `WebhookDeliveryRecord`,
  `WebhookRetryPolicyRecord` from `@drts/contracts` (`:1-7`) — no local
  shape extension.
- helper functions stay scoped to the route file:
  - `getStatusClassName(status)` (`:86-96`) — maps endpoint status to a
    `status-chip` variant.
  - `getDeliveryStatusClassName(status)` (`:98-108`) — maps delivery
    status to a `status-chip` variant.
  - `formatRetryPolicy(policy)` (`:110-118`) — explicit
    `"Policy unavailable"` fallback when `policy` is missing.
  - `normalizeEventCount(webhooks)` (`:120-122`) — set size over
    `webhook.events`.
  - `collectRecentDeliveries(deliveries)` (`:124-135`) — flatten + sort
    delivery rows newest first.
- KPI grid (`:185-209`):
  - `Endpoints` = `data.webhooks.length`.
  - `Active` = endpoints with `status === "active"` (`:147-149`).
  - `Recent deliveries` = `recentDeliveries.length` post-`.slice(0, 20)`
    (`:139-143`).
  - `Failures` = recent rows with `delivery.status === "delivery_failed"`
    (`:144-146`).
  - These four cards do not depend on `governance`, so they are not part
    of the reopen finding.
- coverage card (`:211-257`):
  - reads `baselineEvents` from `data.governance?.baselineWebhookEvents ?? []`
    (`:150`).
  - computes `subscribedEvents` from `data.webhooks` (`:151-153`).
  - computes `uncoveredEvents` as `baselineEvents.filter(…)`
    (`:154-156`).
  - the definition list shows:
    - `Baseline events` = `formatCount(baselineEvents.length)` (`:220`).
    - `Subscribed events` = `formatCount(normalizeEventCount(data.webhooks))`
      (`:224`).
    - `Uncovered baseline events` = `formatCount(uncoveredEvents.length)`
      (`:228`).
    - `Checklist items` =
      `formatCount(data.governance?.onboardingChecklist.length ?? 0)`
      (`:233`).
  - the chip row only renders when `baselineEvents.length > 0`
    (`:237-256`); otherwise it shows the muted copy "Governance baseline
    events were not returned for this tenant."
  - **This block is the first half of the reopen finding** — when
    governance read fails, `baselineEvents` and `onboardingChecklist`
    collapse to `[]` and `0` respectively, so the surface reads as
    "fully covered" / "no checklist remaining" rather than "unknown".
- policy card (`:259-316`):
  - reads `data.governance?.webhookPolicy.testEventType ?? "Unknown"`
    (`:268`).
  - reads `data.governance?.webhookPolicy.autoDisableAfterConsecutiveFailures ?? "Unknown"`
    (`:274-275`).
  - reads `data.governance?.webhookPolicy.retryPolicy` via
    `formatRetryPolicy(…)` (`:281`); this path already has a
    `Policy unavailable` branch (`:113-115`), so it carries unknown
    state correctly.
  - reads `formatCount(rotationCount)` (`:286`) where `rotationCount`
    is derived from each endpoint's runtime metadata (`:157-161`) — not
    governance-dependent.
  - the `panel-list` then renders four booleans as plain text:
    - `Create validation required` (`:290-294`):
      `data.governance?.webhookPolicy.revalidationRequiredOnCreate ? "yes" : "no"`.
    - `Endpoint mutation revalidation` (`:296-301`):
      `… revalidationRequiredOnEndpointMutation ? "yes" : "no"`.
    - `Secret rotation revalidation` (`:303-308`):
      `… revalidationRequiredOnSecretRotation ? "yes" : "no"`.
    - `Failure notifications` (`:310-313`):
      `data.governance?.webhookPolicy.deliveryFailureNotificationChannel ?? "Unknown"`.
  - **This block is the second half of the reopen finding** — the
    first three lines collapse silently to `"no"` when governance read
    fails (because `undefined` is falsy under the ternary). The fourth
    line already carries `"Unknown"` correctly. The first three need
    parity with the fourth: distinct unknown / unavailable copy when
    `data.governance` is `null`.
- endpoint inventory table (`:319-428`):
  - columns `Endpoint / Events / Status / Secret / Runtime / Retry` map to
    the `TN_Webhooks` artboard's endpoint table.
  - reads only fields from `TenantWebhookEndpoint` and
    `TenantWebhookRuntimeMetadata`; runtime fallbacks use literal text
    (`"not available"`, `"none queued"`, `"none"`) rather than `0`/`no`.
  - no mutation controls (no create, update, delete, rotate-secret, or
    send-test buttons) — consistent with the planning ref's
    "do not extend contract" rule and with the closing guardrail panel.
- recent-deliveries table (`:430-497`):
  - columns `Delivery / Endpoint / Event / Status / HTTP / Attempt /
Created` map to the `TN_Webhooks` artboard's "近 24h 投遞" table.
  - reads only fields from `WebhookDeliveryRecord`; no synthesized data.
- closing `CalloutPanel` (`:499-502`):
  > This route intentionally stops at the published webhook read models
  > plus governance posture. It does not invent replay buttons, secret
  > mutation flows, or disable/enable semantics beyond what the backend
  > already contracts.

### 4.2 `packages/ui-web/src/tenant-webhooks.stories.tsx` (new — 344 lines)

- imports `Meta` / `StoryObj` from `@storybook/nextjs-vite` (`:1`) and a
  fixed set of `@drts/ui-web` primitives plus the shared
  `tenant-story-support` helpers (`:2-16`).
- static fixtures:
  - `endpointRows` (`:32-51`) — two `TN_Webhooks`-shaped endpoint
    rows (`webhookId`, `url`, `events`, `status`, `secret`, `runtime`,
    `retry`); not loaded from contracts.
  - `deliveryRows` (`:53-81`) — three delivery rows with `deliveryId`,
    `webhookId`, `eventType`, `status`, `httpStatus`, `attempt`,
    `createdAt`.
- `WebhooksBuiltView()` (`:83-316`):
  - renders inside `TenantStoryShell currentPath="/webhooks"
breadcrumb="Webhooks"` so the chrome matches the runtime nav slot.
  - shows `PageHeader` with eyebrow `Integrations`, title `Webhooks`,
    subtitle anchored to "Endpoint inventory, event coverage, and
    delivery evidence stay together…" and KPI meta `Endpoints/Active/
Recent deliveries`, plus `Payload schema` and `Add endpoint` chips as
    visual affordances (no live behavior).
  - includes a `CalloutBanner` "Mutation semantics stay backend-owned"
    (`:130-135`) that mirrors the runtime closing guardrail.
  - `WorkflowSplitLayout` (`:137-313`) with:
    - main `DataViewCard` "Endpoint inventory" + nested "Recent
      deliveries" `DataViewCard` (matches the runtime stacked layout in
      `page.tsx:319-497`).
    - side `DataViewCard`s "Policy posture" and "Coverage" rendering
      `DetailMetadataGrid` and `StatusChip` rows.
- `meta` (`:318-329`) declares
  `title: "Tenant Console/Webhooks"`,
  `parameters.layout: "fullscreen"`, and a docs `description.component`
  that states the parity story renders Built vs. Canvas side-by-side
  using `Tenant Console.html#webhooks`.
- `Webhooks` story (`:335-344`) wraps the built view in `StoryChrome`
  with `anchor="webhooks"`, matching the canvas artboard id.

### 4.3 Contract-boundary evidence

- consuming surfaces:
  - `packages/api-client/src/index.ts:1273` — existing `listWebhooks()`.
  - `:1277` — existing `createWebhookEndpoint(command)`.
  - `:1281` — existing `updateWebhookEndpoint(webhookId, command)`.
  - `:1290` — existing `deleteWebhookEndpoint(webhookId)`.
  - `:1294` — existing `listWebhookDeliveries(webhookId, …)`
    (per-endpoint only).
  - `:1316` — existing `getTenantIntegrationGovernancePackage()`.
- backend routes:
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:544`
    — `POST tenant/webhooks`.
  - `:560` — `POST tenant/webhooks/test`.
  - `:580` — `POST tenant/webhooks/:webhookId`.
  - `:598` — `DELETE tenant/webhooks/:webhookId`.
  - `:616` — `POST tenant/webhooks/:webhookId/rotate-secret`.
  - `:649` — `GET tenant/webhooks/deliveries` (tenant-wide; backend has
    it, client does not).
  - `:664` — `GET tenant/webhooks/:webhookId/deliveries` (per-endpoint;
    what the parent route uses).
- contract record types relevant to the slice:
  - `packages/contracts/src/index.ts:811-817` —
    `WebhookRetryPolicyRecord`.
  - `:833-850` — `TenantWebhookRuntimeMetadata`.
  - `:852-879` — `CreateTenantWebhookEndpointCommand`,
    `TENANT_WEBHOOK_ENDPOINT_STATUSES`,
    `TenantWebhookEndpointStatus`, `TenantWebhookEndpoint`.
  - `:881-901` — `UpdateTenantWebhookEndpointCommand`,
    `SendTestWebhookCommand`, `WebhookDeliveryRecord`.
  - `:1109-1117` — `TenantWebhookGovernancePolicy`.
  - `:1119-1127` — `TenantIntegrationGovernancePackage`.
- there are no `git diff` lines under `packages/contracts/`,
  `packages/api-client/src/`, `apps/api/src/modules/tenant-partner/`, or
  `docs/05-ui/drts-design-canvas/` attributable to this task in the
  parent's current working tree — consistent with the planning ref's
  "no contract expansion" guardrail and verifiable via
  `git diff --stat HEAD`.

### 4.4 Selected-shell IA evidence

- `apps/tenant-console-web/lib/navigation.ts:64-75` keeps `/webhooks`
  under the `Integrations` group, directly after `/api-keys`.
- `packages/ui-web/src/tenant-story-support.tsx:33-40` mirrors the same
  `Integrations → Webhooks` shell slot so Storybook chrome matches
  runtime chrome.
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx:17-18` shows the
  same nav ordering on the canvas side (`apikeys` then `webhooks`).
- The runtime route file does not modify `navigation.ts` or any shell
  helper, so the IA placement remains an inherited contract from
  `TEN-UI-RD-001`.

### 4.5 Canvas anchor

- `docs/05-ui/drts-design-canvas/Tenant Console.html:84` —
  `<DCArtboard id="webhooks" label="Webhook + 投遞" width={W} height={H}><Bare><TN_Webhooks theme={th} /></Bare></DCArtboard>`.
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx:362-390` —
  `TN_Webhooks` artboard:
  - `Shell theme={th} nav={TN_NAV} active="webhooks" breadcrumb={['整合', 'Webhook']}` (`:364`).
  - `PageHeader theme={th} title="Webhook" subtitle="端點 · 事件訂閱 · 投遞紀錄 · 重試政策" tabs={['Endpoints','Deliveries','Replay']} activeTab="Endpoints"` (`:365`).
  - actions `payload schema` + `新增端點` (`:366`).
  - endpoint table columns `URL / EVENTS / STATE / LAST`, fed by
    `FX_WEBHOOKS` fixtures (`:369-374`).
  - "近 24h 投遞" table columns `DLV / WH / EVENT / CODE / TRIES / AT /
DUR`, fed by `FX_WEBHOOK_DELIVERIES` fixtures (`:376-386`).
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx:18` — `TN_NAV` entry
  for `webhooks`; the runtime nav at
  `apps/tenant-console-web/lib/navigation.ts:71-75` matches with
  `href: "/webhooks"`, `label: "Webhooks"`, sitting after `api-keys`
  (`:66-70`) inside the `Integrations` group — same order as the canvas.

### 4.6 Review-failure history (verbatim from `ai-activity-log.jsonl`)

For audit trail, the single `reopen` event the parent currently sits on.
Each finding is anchored to the working-tree code it targets so the
parent owner has a precise rework target.

1. **Reopen #1 (`2026-05-12T14:40:59Z`, by `Codex`):**

   > Review failed: partial governance-load handling still fabricates
   > contract posture. In apps/tenant-console-web/app/webhooks/page.tsx,
   > governance-derived coverage metrics fall back to 0 when the
   > integration package is unavailable (baseline events/checklist at
   > current lines 150-155 and 217-255), and policy booleans fall back
   > to 'no' when governance read fails (lines 289-308). That
   > contradicts the warning callout and turns unknown transport gaps
   > into false negatives. Please preserve explicit unknown/unavailable
   > state for governance-backed counts and booleans, then re-handoff.
   > Re-verified acceptance commands all pass: pnpm --filter
   > @drts/tenant-console-web typecheck; build; test; pnpm --filter
   > @drts/ui-web typecheck; pnpm --filter @drts/ui-web exec storybook
   > build.

   Working-tree anchors for this finding (current line numbers, parent
   has not yet reworked):
   - **Coverage metrics fall back to 0** — three concrete locations:
     - `page.tsx:150` —
       `const baselineEvents = data.governance?.baselineWebhookEvents ?? [];`
       silently collapses to `[]` when governance is null.
     - `page.tsx:154-156` — `uncoveredEvents` is `baselineEvents.filter(…)`,
       which inherits the same `[]` collapse and produces an empty
       "uncovered" list.
     - `page.tsx:220, :228, :233` — the definition list renders
       `formatCount(baselineEvents.length)`,
       `formatCount(uncoveredEvents.length)`, and
       `formatCount(data.governance?.onboardingChecklist.length ?? 0)`
       — three counters that show `0` indistinguishably from a real
       zero when governance read fails.
   - **Policy booleans fall back to `'no'`** — three concrete locations,
     all inside the `panel-list` block (`page.tsx:289-309`):
     - `page.tsx:292-294` — `revalidationRequiredOnCreate ? "yes" : "no"`
       collapses to `"no"` when `data.governance` is `null` because
       `undefined` is falsy.
     - `page.tsx:298-301` —
       `revalidationRequiredOnEndpointMutation ? "yes" : "no"`.
     - `page.tsx:304-308` —
       `revalidationRequiredOnSecretRotation ? "yes" : "no"`.

   Reference for the correct pattern already in the file:
   - `page.tsx:267-269` — `testEventType ?? "Unknown"` keeps unknown
     state distinct from a real value.
   - `page.tsx:272-276` — `autoDisableAfterConsecutiveFailures ?? "Unknown"`
     does the same.
   - `page.tsx:310-314` — `deliveryFailureNotificationChannel ?? "Unknown"`
     does the same.
   - `page.tsx:110-118` — `formatRetryPolicy(policy)` already returns
     `"Policy unavailable"` when `policy` is missing.

   Why the warning callout makes the silent fallback worse: the route
   already renders a `CalloutPanel` "Webhook data loaded partially"
   (`page.tsx:171-183`) when `data.errors.length > 0`, which says
   missing rows reflect transport gaps rather than hidden UI state.
   But the same governance failure that populates `errors` also makes
   the coverage block read as `0 / 0 / 0 / 0` and the policy block as
   three `"no"`s; that contradicts the callout and converts unknown
   transport gaps into false negatives. The rework needs to preserve
   explicit unknown / unavailable state for both the four governance
   counts and the three governance booleans, matching how
   `testEventType` / `autoDisableAfterConsecutiveFailures` /
   `deliveryFailureNotificationChannel` / retry policy already behave.

   Acceptance-script verification recorded by `Codex` in the same
   reopen note:
   - `pnpm --filter @drts/tenant-console-web typecheck` — passes
   - `pnpm --filter @drts/tenant-console-web build` — passes
   - `pnpm --filter @drts/tenant-console-web test` — passes
   - `pnpm --filter @drts/ui-web typecheck` — passes
   - `pnpm --filter @drts/ui-web exec storybook build` — passes

   The lint/typecheck/build/test gate is therefore green at the moment
   of the reopen; the finding is purely a contract-honesty issue in
   the UI rendering layer.

No additional `reopen` or `review_approved` events have fired for this
task at packet generation time. The parent owner (`Codex2`) is expected
to rework the four coverage counts (`baselineEvents.length`,
`normalizeEventCount(data.webhooks)` reading is fine, `uncoveredEvents.length`,
`onboardingChecklist.length`) and the three policy booleans, then
re-handoff to `Codex`.

### 4.7 Things the parent intentionally does not change

These boundaries are part of the slice's correctness story and the
reviewer should not look for changes here:

- no file under `packages/contracts/`, `packages/api-client/src/`, or
  `apps/api/src/modules/tenant-partner/` is modified by this task.
- no canvas file under `docs/05-ui/drts-design-canvas/` is modified.
- no shell file under `apps/tenant-console-web/lib/` or
  `packages/ui-web/src/tenant-story-support.tsx` is modified.
- `apps/tenant-portal-web/app/webhooks/page.tsx` (legacy portal) is not
  modified; it remains migration evidence only and is not the
  selected-shell truth.
- no new server actions, server functions, or client islands are added;
  the route is a single server component with no mutation surface.

---

## 5. Acceptance Checklist

This checklist restates the parent acceptance bar as auditable line
items. The parent reviewer (`Codex`) will re-apply it after the parent
owner re-handoffs from the governance-fallback rework. Items below
reflect the current working-tree state at packet generation time.

Legend: `[REQUIRED]` = explicit parent acceptance bar. `[DERIVED]` =
sidecar support gate for this packet. `[x]` = passed at the most recent
reviewer pass (`2026-05-12T14:40:59Z` reopen note). `[OPEN]` = will
remain open until the parent owner reworks the governance-fallback
handling and `Codex` re-approves. `[N/A]` = explicitly waived; reason
recorded inline.

### A. Tenant-console build/test gate `[REQUIRED]`

Parent acceptance line:
`pnpm --filter @drts/tenant-console-web typecheck / build / test`

- [x] `pnpm --filter @drts/tenant-console-web typecheck` — passed per the
      parent owner's handoff (`2026-05-12T14:29:18Z`) and re-verified by
      the parent reviewer at the reopen (`2026-05-12T14:40:59Z`).
- [x] `pnpm --filter @drts/tenant-console-web build` — passed at both
      events above.
- [x] `pnpm --filter @drts/tenant-console-web test` — passed at both
      events above.
- [x] `pnpm --filter @drts/ui-web typecheck` (for the parity story) —
      passed at both events above.
- [x] `pnpm --filter @drts/ui-web exec storybook build` — passed at
      both events above.

### B. Storybook parity gate `[REQUIRED]`

Parent acceptance line: `Storybook 對照對應 TN_* artboard`

- [x] `packages/ui-web/src/tenant-webhooks.stories.tsx` exists and
      renders a side-by-side parity view with `anchor="webhooks"`
      mapping to `Tenant Console.html#webhooks` (file body
      `:335-344`, canvas anchor at `Tenant Console.html:84`).
- [x] `pnpm --filter @drts/ui-web exec storybook build` passes against
      the new story (verified at the parent owner's handoff and re-run
      at the reopen).
- [OPEN] Parent reviewer to confirm that the parity story's Built panel
  still mirrors the runtime route after the governance-fallback
  rework lands (e.g. if the rework introduces additional KPI rows
  or relabels existing fields, the story must follow). At packet
  generation time the story's static fixtures do not depend on
  governance posture, so a rework targeting only the runtime
  fallback strings should not need story edits.

### C. Contract-boundary gate `[REQUIRED]`

Parent acceptance line:
`若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`

- [x] Route reads only via existing `client.listWebhooks()`,
      `client.getTenantIntegrationGovernancePackage()`, and
      `client.listWebhookDeliveries(webhookId)` (per-endpoint)
      (`page.tsx:34-37, 60-67`); no new client method is introduced.
- [x] No mutation server actions, mutation buttons, secret-rotation
      controls, send-test controls, or replay controls are introduced
      in the runtime route (`page.tsx:319-497` table cells; closing
      guardrail callout `:499-502`).
- [x] No file under `packages/contracts/`, `packages/api-client/src/`,
      or `apps/api/src/modules/tenant-partner/` is modified by this
      task — verifiable via `git diff --stat HEAD`, which only lists
      `apps/tenant-console-web/app/webhooks/page.tsx` and new
      `packages/ui-web/src/tenant-webhooks.stories.tsx`.
- [x] The route uses the canonical `TenantWebhookEndpoint`,
      `TenantWebhookRuntimeMetadata`, `WebhookDeliveryRecord`, and
      `WebhookRetryPolicyRecord` shapes from `@drts/contracts:811-901`
      verbatim (`page.tsx:1-7` import block).
- [x] No blocker ticket was opened against discussion_planning,
      consistent with the parent owner's handoff note "No
      backend-contract blocker found; UI stayed within existing tenant
      webhook and governance contracts."
- [OPEN] Governance-fallback honesty: the route currently violates the
  "do not invent contract posture" guarantee by silently
  rendering `0` for four governance-derived counts (`page.tsx:
220, :228, :233` + the chip row branch at `:237`) and `"no"` for
  three governance-derived booleans (`page.tsx:289-309`) when
  `data.governance` is `null`. The parent owner must rework
  these seven sites to preserve explicit unknown / unavailable
  state, matching the existing `?? "Unknown"` pattern used by
  `testEventType` (`:268`),
  `autoDisableAfterConsecutiveFailures` (`:274-275`),
  `deliveryFailureNotificationChannel` (`:312-313`), and the
  `"Policy unavailable"` branch in `formatRetryPolicy()`
  (`:113-115`). This is the substantive open item for this
  review cycle.
- [OPEN] Once the rework lands, the parent reviewer re-runs the build
  gate (§A) and the contract-boundary gate against the new diff.

### D. Sidecar handoff readiness `[DERIVED]`

- [x] This packet matches the current machine-truth owner/reviewer
      assignment for both the sidecar
      (`owner=Claude2`, `reviewer=Codex2`) and the parent task
      (`owner=Codex2`, `reviewer=Codex`).
- [x] This packet does not snapshot live parent `status` / `next` /
      `last_update` values as a replacement for `ai-status.json`; it
      records the most recent values as of generation only.
- [x] This packet records the parent owner's handoff verification and
      the parent reviewer's single reopen finding with explicit
      working-tree line anchors so the parent owner has a precise
      rework target.
- [x] This packet does not edit canonical truth — the parent's
      working-tree files, the design canvas, the contract surfaces,
      the api-client, the backend routes, the shell helpers, and
      `ai-status.json` remain untouched by this sidecar.
- [x] This packet does not record `done` evidence for the parent task
      and does not pre-approve the parent diff; both belong to the
      parent reviewer (`Codex`) and the parent owner (`Codex2`) after
      the governance-fallback rework.

---

## 6. Reviewer Focus

For `Codex2` reviewing this sidecar:

- confirm the machine-truth anchor section (§2) matches the current
  `ai-status.json` fields for both `TEN-UI-RD-018-SIDECAR-REVIEW` and
  `TEN-UI-RD-018`, including the parent's `in_progress` state after
  Codex's reopen at `2026-05-12T14:40:59Z` and the latest
  reviewer/owner pairing of `Codex2 → Codex`.
- confirm the upstream dependency table (§3.A) matches
  `TEN-UI-RD-001`'s recorded `commit_hash` / `commit_recorded_at` /
  `commit_reviewer` and the branch presence assertion holds.
- confirm the implementation evidence map (§4) faithfully describes the
  two working-tree files (`apps/tenant-console-web/app/webhooks/
page.tsx`, `packages/ui-web/src/tenant-webhooks.stories.tsx`) without
  smuggling in changes the parent did not make.
- confirm §4.6 reproduces the single reopen finding verbatim and that
  each anchored line in the current working tree
  (`page.tsx:150, :154-156, :220, :228, :233, :237, :289-309`) still
  reads as described at sidecar handoff time.
- confirm the acceptance checklist (§5) is a faithful expansion of the
  parent acceptance bar, with the governance-fallback honesty item
  explicitly tagged `[OPEN]` rather than treated as already accepted.
- confirm the packet remains support-only and does not modify the
  parent's implementation files, the design canvas, the contract
  surfaces, the api-client, the backend routes, the shell helpers, or
  `ai-status.json`.

For `Codex` (the parent reviewer) — this packet is **not** the
canonical review of the parent task. Codex's reopen at
`2026-05-12T14:40:59Z` already documents the substantive finding; the
final approval (or any additional reopen) will run against the parent
owner's next handoff and will be recorded directly in `ai-status.json`
via `scripts/ai-status.sh approve` (or `reopen`).

For `Codex2` (the parent owner) — this packet is **not** the
rework target itself. The rework target is
`apps/tenant-console-web/app/webhooks/page.tsx:150-156, :217-256,
:289-309`. The packet's §4.6 anchors are intended to make that rework
unambiguous.

---

## 7. Handoff Summary

This sidecar packet is scoped as stable reviewer support material for
the Wave 3 tenant `Webhooks` parity-fill slice. The parent task
`TEN-UI-RD-018` itself remains canonical; this packet is a reviewer
companion that:

- pins the two working-tree files
  (`apps/tenant-console-web/app/webhooks/page.tsx`,
  `packages/ui-web/src/tenant-webhooks.stories.tsx`) and the contract /
  api-client / backend / canvas / shell anchors they consume but do
  not modify.
- records the parent owner's handoff verification (typecheck/build/
  test + ui-web typecheck + storybook build, all green) and the
  parent reviewer's single reopen finding with verbatim wording and
  explicit working-tree line anchors so the audit story stays
  traceable.
- restates the three-line parent acceptance bar as an auditable
  checklist, including the governance-fallback `[OPEN]` item that
  blocks approval until the parent owner reworks the four
  governance-derived counts and three governance-derived booleans to
  preserve explicit unknown / unavailable state.
- maps the parent's structural anchors (canvas artboard `TN_Webhooks`,
  `TN_NAV` order, `Integrations` nav group, the published
  `TenantIntegrationGovernancePackage`, the `WebhookDeliveryRecord` /
  `TenantWebhookEndpoint` / `TenantWebhookRuntimeMetadata` shapes).
- defers all transient parent lifecycle truth (`status`, `next`,
  `last_update`, future `commit_hash` / `push_*` fields) to
  `ai-status.json`.

The packet is consistent with the current pre-approval machine truth:
the parent is in `in_progress` after a single reopen, no commit exists
for this slice yet, and the parent owner is expected to rework
governance-fallback handling before re-handoff. After sidecar review
approval this packet is intended to remain in
`support/sidecars/TEN-UI-RD-018/` as a stable reference; it is not
absorbed into any other artifact and does not change canonical truth.
When the parent owner re-handoffs and the parent reviewer approves, the
packet's §4.6 anchors will need an addendum referencing the rework
landing lines (or a brief note that the rework subsumed those lines
verbatim); §4 and §5 otherwise remain accurate.

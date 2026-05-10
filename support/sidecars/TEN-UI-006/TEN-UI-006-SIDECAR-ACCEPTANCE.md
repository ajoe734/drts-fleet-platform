# TEN-UI-006 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `TEN-UI-006` - API Key And Webhook Productization
**Parent Owner:** `Claude2`
**Parent Reviewer:** `Codex2`
**Sidecar Owner:** `Codex`
**Sidecar Reviewer:** `Claude2`
**Generated:** `2026-05-09` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or the parent implementation itself.

This packet is the reviewer-facing acceptance companion for the in-flight tenant
integration slice. It preserves the current machine-truth anchors, dependency
map, productization checklist, and known guardrails so the parent task can be
reviewed without re-deriving the route, endpoint, and command constraints from
scratch.

---

## 1. Scope Boundary

In scope:

- capture the current `TEN-UI-006` machine-truth envelope and its formal
  dependencies
- convert the selected execution packet, product spec, upstream route map,
  backend-gap inventory, command matrix, and UAT scenarios into a reviewer
  checklist
- record the current tenant-shell baseline and `@drts/api-client` helper
  coverage for API keys and webhooks
- flag machine-truth metadata drift that the parent owner/reviewer should keep
  explicit during handoff

Out of scope:

- editing canonical L1/L2 product truth or the parent task record
- changing runtime code, endpoint contracts, or `@drts/api-client`
- reopening upstream dependency tasks; this packet only consumes their accepted
  conclusions
- claiming unsupported retry/replay, cross-tenant access, or client-owned
  credential truth as acceptable implementation paths

---

## 2. Machine Truth Anchors

### Sidecar - `ai-status.json -> TEN-UI-006-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Claude2`
- depends_on=`TEN-UI-002`, `XS-UI-001`, `XS-UI-002`, `XS-UI-003`
- task_class=`sidecar`
- helper_parent=`TEN-UI-006`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/TEN-UI-006/TEN-UI-006-SIDECAR-ACCEPTANCE.md`
- live lifecycle fields intentionally deferred to `ai-status.json`:
  - `status`
  - `next`
  - `last_update`

### Parent - `ai-status.json -> TEN-UI-006`

- owner=`Claude2`
- reviewer=`Codex2`
- status=`in_progress`
- depends_on=`TEN-UI-002`, `XS-UI-001`, `XS-UI-002`, `XS-UI-003`
- execution packet=`docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
- design review=`docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
- source spec=`docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
- recorded artifacts currently still point to:
  - `apps/tenant-portal-web/app/api-keys/page.tsx`
  - `apps/tenant-portal-web/app/webhooks/page.tsx`
  - `packages/api-client`
- recorded acceptance currently still says:
  - `pnpm --filter @drts/tenant-portal-web typecheck`

Known record-only drift:

- `TEN-UI-002` already established `apps/tenant-console-web` as the formal
  in-repo tenant-console landing zone.
- The current shell placeholders for this slice live at:
  - `apps/tenant-console-web/app/api-keys/page.tsx`
  - `apps/tenant-console-web/app/webhooks/page.tsx`
- This packet documents the drift between the selected tenant target and the
  still-legacy parent artifact/acceptance fields, but it does not edit machine
  truth on its own.

---

## 3. Dependency Map

| Dependency   | Status | What `TEN-UI-006` inherits                                                                                                                                        | Review consequence                                                                                    |
| ------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `TEN-UI-002` | `done` | The new `apps/tenant-console-web` shell already exposes stable `/api-keys` and `/webhooks` navigation slots and placeholder routes.                               | `TEN-UI-006` should deepen those routes, not invent a new IA target or reactivate the sunset shell.   |
| `XS-UI-001`  | `done` | Route-to-endpoint truth for API-key issue/rotate/revoke plus webhook CRUD, secret rotation, test event, and delivery feeds.                                       | Parent UI and any api-client additions must use the recorded endpoint names and authority boundaries. |
| `XS-UI-002`  | `done` | Backend-gap inventory says webhook retry/replay is missing, while tenant-wide deliveries, test webhook, and rotate-secret are backend-present but client-missing. | Review must reject fabricated browser-only actions and distinguish backend gaps from api-client gaps. |
| `XS-UI-003`  | `done` | Command matrix locks API-key issue/rotate/revoke as supported, webhook enable/disable as update-command overloads, and partner-mode governance as forbidden.      | Review must reject unsupported buttons, split-endpoint inventions, and partner-mode admin leakage.    |

Assertion:

- All four formal dependencies are already `done` in `ai-status.json`.
- This packet does not reopen or mutate any dependency edge.

Downstream note:

- `TEN-UI-009` depends on `TEN-UI-006`; this packet is meant to leave a clean
  acceptance trail for that later verification slice without altering the
  parent implementation task.

---

## 4. Productization Target For Review

### A. API key surface

Source anchors:

- execution packet `TEN-UI-006` work definition
- product spec §9.6.9 and §9.7.6
- UAT scenarios `TP-015`, `TP-016`, `TP-017`
- command matrix rows for `/api-keys`

Required data model:

- key name
- key prefix / masked suffix
- scopes
- last used
- `expiresAt`
- `revokedAt`

Required actions:

- issue key
- rotate key
- revoke key

Guardrails:

- full plaintext key material is shown once at issue/rotate confirmation, then
  subsequent views stay masked
- scopes must stay inside the backend-owned allowed scope set
- revoked keys are a backend auth concern; the UI must not fake revocation by
  local hiding alone
- no client-side credential truth or long-lived secret persistence

### B. Webhook surface

Source anchors:

- execution packet `TEN-UI-006` work definition
- product spec §9.6.8 and §9.7.7
- UAT scenarios `TP-018`, `TP-019`, `TP-020`
- route map §3.10 and command matrix rows for `/webhooks`

Required data model:

- endpoint URL
- event list
- secret metadata
- status
- delivery logs
- related notification visibility where already supported

Required actions:

- create endpoint
- update endpoint
- delete endpoint
- view deliveries

Conditional actions:

- enable / disable only through `UpdateTenantWebhookEndpointCommand.status`
- rotate signing secret only if the implementation also exposes the supported
  backend command through `@drts/api-client`
- send test event only if the implementation also exposes the supported backend
  command through `@drts/api-client`
- retry / replay only if a real backend command is added and cited; today it is
  still a backend gap

Guardrails:

- do not fake retry or replay from the browser
- do not invent a dedicated enable/disable endpoint when the backend uses the
  update command overload
- delivery visibility may be read-only, but it must stay aligned to real
  backend delivery records

---

## 5. Current Baseline And Known Gaps

Current shell baseline from `TEN-UI-002`:

- `apps/tenant-console-web/app/api-keys/page.tsx`
  - still a placeholder route that says detailed lifecycle presentation is left
    to `TEN-UI-006`
- `apps/tenant-console-web/app/webhooks/page.tsx`
  - still a placeholder route that reserves endpoint, events, and delivery
    visibility for `TEN-UI-006`

Current `@drts/api-client` coverage already present:

- API keys:
  - `listApiKeys()`
  - `issueApiKey()`
  - `rotateApiKey()`
  - `revokeApiKey()`
- Webhooks:
  - `listWebhooks()`
  - `createWebhookEndpoint()`
  - `updateWebhookEndpoint()`
  - `deleteWebhookEndpoint()`
  - `listWebhookDeliveries(webhookId)`

Known client-side gaps that remain acceptable only if handled honestly:

- tenant-wide delivery feed helper for `GET /api/tenant/webhooks/deliveries`
  does not exist yet
- `rotateWebhookSecret` helper does not exist yet
- `sendTestWebhook` helper does not exist yet

Review implication:

- If the parent handoff exposes any of the three missing client helpers above,
  it should show the `packages/api-client` additions explicitly.
- If the parent handoff keeps those controls hidden, that is acceptable only if
  it does not substitute unsupported browser-local behavior.

---

## 6. Acceptance Checklist

Legend: `[READY]` = already satisfied before parent review. `[TO VERIFY]` =
reviewer checklist for the parent handoff.

### A. Dependency and scope readiness `[READY]`

- [x] `TEN-UI-002`, `XS-UI-001`, `XS-UI-002`, and `XS-UI-003` are all `done`
      in machine truth.
- [x] The selected tenant target already has `/api-keys` and `/webhooks` route
      slots in `apps/tenant-console-web`.
- [x] This packet is support-only and does not modify canonical truth or runtime
      code.

### B. Parent implementation gates `[TO VERIFY]`

- [ ] The parent implementation lands on the selected tenant target app routes
      and does not re-center the work on the sunset `apps/tenant-portal-web`
      shell.
- [ ] API-key UI shows masked display plus scope, expiry, and last-used
      metadata.
- [ ] Issue and rotate flows reveal plaintext key material once, then return to
      masked display on subsequent views.
- [ ] Revoke flow maps to `POST /api/tenant/api-keys/:apiKeyId/revoke` and the
      handoff explains revoked-key behavior clearly enough for review.
- [ ] Webhook CRUD maps only to the recorded create/update/delete endpoints.
- [ ] Enable/disable is implemented as an update-command status change, not a
      fabricated dedicated endpoint.
- [ ] Delivery visibility uses real backend delivery records. If a tenant-wide
      delivery surface is added, the handoff shows the new api-client helper
      instead of page-local fetch logic.
- [ ] Rotate-secret and send-test controls are only shown if the parent task
      also wires the required api-client helpers.
- [ ] No retry/replay button ships unless a new backend command is cited in the
      parent handoff.
- [ ] Partner mode and non-authorized tenant contexts do not leak API-key or
      webhook governance controls that the command matrix marks forbidden.

### C. Verification and handoff evidence `[TO VERIFY]`

- [ ] Parent handoff states exactly which typecheck command(s) were run.
- [ ] If the parent keeps the legacy `tenant-portal-web` acceptance line in
      machine truth, the handoff also explains how the actual
      `tenant-console-web` changes were verified.
- [ ] If `packages/api-client` changed, the handoff names the new helper
      coverage it added for supported actions.
- [ ] Reviewer evidence is sufficient to distinguish "backend missing" from
      "backend exists but client helper was not added".

---

## 7. Evidence Anchors

Primary design and task-definition anchors:

- `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
- `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
- `docs/04-uat/phase1-uat-checklist.md`
- `docs/04-uat/phase1-uat-scenarios.md`

Upstream dependency anchors:

- `support/sidecars/XS-UI-001/route-to-endpoint-map.md`
- `support/sidecars/XS-UI-002/backend-gap-inventory.md`
- `support/sidecars/XS-UI-003/command-action-matrix.md`
- `support/sidecars/TEN-UI-002/TEN-UI-002-SIDECAR-ACCEPTANCE.md`

Current implementation anchors:

- `apps/tenant-console-web/app/api-keys/page.tsx`
- `apps/tenant-console-web/app/webhooks/page.tsx`
- `apps/tenant-console-web/app/page.tsx`
- `packages/api-client/src/index.ts`

Machine-truth anchors:

- `ai-status.json -> TEN-UI-006`
- `ai-status.json -> TEN-UI-006-SIDECAR-ACCEPTANCE`

---

## 8. Reviewer Focus

For `Claude2` reviewing this sidecar packet:

- confirm the packet stays support-only and does not mutate canonical truth
- confirm the dependency map accurately separates backend gaps from api-client
  gaps
- confirm the checklist preserves the selected `tenant-console-web` target while
  honestly recording the parent task's current legacy artifact/acceptance
  metadata
- confirm the packet rejects unsupported webhook retry/replay and partner-mode
  governance leakage

---

## 9. Handoff Summary

`TEN-UI-006` is reviewable as an API-key and webhook productization slice only
if the parent handoff stays anchored to the selected `tenant-console-web`
target, consumes the `XS-UI-001` endpoint names and `XS-UI-003` command rules,
and treats `XS-UI-002` gaps honestly. The main reviewer risks are:
legacy machine-truth path drift, missing api-client helpers for otherwise
supported webhook actions, and any attempt to ship retry/replay or other
unsupported browser-local controls.

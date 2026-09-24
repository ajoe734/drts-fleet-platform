# Partner Notification Screen Contract (UI17-NOTIFY-CANVAS-20260924)

## Per-State Formal Contract Matrix

| UI Component/State | API State/Field (`partner-passenger-notification.ts`) | UI Condition/Action | Formal Backend Route Availability |
| :--- | :--- | :--- | :--- |
| **Binding: `ready`** | `state: "ready"` | Shows active. Enable action hidden/disabled. | `GET /api/platform-admin/partner-entries/:entrySlug/notification-binding` (Available) |
| **Binding: `test_pending`** | `state: "test_pending"` | Requires `test` before `enable`. | `GET .../notification-binding` (Available) |
| **Binding: `disabled`** | `state: "disabled"` | Disable action disabled. Resume triggers enable directly if fingerprint valid, otherwise needs `test` first. | `GET .../notification-binding` (Available) |
| **Validation** | `validatedEndpointFingerprint` | Matched against current fingerprint. Stale validation disables `enable`. | The Platform Admin screen must authorize via `tenant:webhooks:read` (with realm constraints and `x-tenant-id` header derived from entry) to fetch safe details from `GET /api/tenant/webhooks` (`url`, `secretPreview`, `secretVersion`, `ownerRef`/`ownerName`/`ownerType`, `availableActions`). |
| **Action: `test`** | Request: empty body. | Initiates test delivery. Preserves state/version. | `POST /api/platform-admin/partner-entries/:entrySlug/notification-binding/test` (Available). Returns `{kind: "accepted", ack}` or `{kind: "failed", failure}`. |
| **Action: `resume`** | View-model operation | Shows "恢復通知" when `disabled`. If current validation is passed, calls `enable` directly. Otherwise requires `test` then `enable`. | UI orchestration only; no distinct `/resume` route. |
| **Action: `enable`** | Request: `{ expectedVersion }` | Transitions to `ready`, increments version. | `POST /api/platform-admin/partner-entries/:entrySlug/notification-binding/enable` (Available). Returns advanced version. |
| **Action: `disable`** | Request: `{ expectedVersion }` | Transitions to `disabled`, increments version. | `POST /api/platform-admin/partner-entries/:entrySlug/notification-binding/disable` (Available). Returns advanced version. |
| **Action: `save` (Edit)** | Request: `{ webhookId, eventTypes, expectedVersion }` | Resets `state: "test_pending"`, increments `version`, clears validation. | `PUT /api/platform-admin/partner-entries/:entrySlug/notification-binding` (Available) |
| **Delivery Map: Pending** | `status: "queued"` | Shows '排隊中' | Outbox state mapped to view; requires same outboxId/deliveryId. |
| **Delivery Map: Accepted** | `status: "accepted"` | Shows '端點已接受，但裝置未知' | Exact ack conditions: matching `notification_id`/`delivery_id`/`partner_entry_slug`, `accepted|duplicate`, real nonempty `receipt_id`. |
| **Delivery Map: Failed** | `status: "failed"` | Shows '失敗' | Local failure mapped to view. |
| **Delivery Map: Expired** | `status: "expired"`, `failureReason: "EVENT_EXPIRED"` | Shows '已過期' | |
| **Delivery Map: Exhausted** | `status: "exhausted"`, `failureReason: "RETRY_EXHAUSTED"` | Shows '重試次數耗盡' | Distinct from disabled endpoint. |
| **Delivery Map: Superseded**| `status: "superseded"`, `failureReason: "SUPERSEDED"` | Shows '已被新通知取代' | |
| **Retry Admission: Active** | `admission: "LEASE_ACTIVE"` | Disables retry, shows '另一重送進行中' | Admission denial precedes local failure. |
| **Retry: Config Blocked**   | `disposition: "configuration_blocked"` | Disables retry, shows '綁定未就緒' (BINDING_NOT_READY) | |
| **Retry: Terminal**         | `disposition: "terminal"` | Disables retry, shows terminal reason | |
| **Retry Action Request** | `POST .../:outboxId/retry` | Initiates manual resend. Maps `outboxId`, not `deliveryId`. | `POST /api/platform-admin/partner-entries/:entrySlug/notification-deliveries/:outboxId/retry` (Design-only route) |
| **Retry Action Result** | `202 Accepted` | Returns same outbox immutable context. | Design proposal: Rejection/recovery maps to 409 (budget/lease) or 202 (pending). |
| **Ack 202/201/200** | `stage: "partner_accepted", downstreamStatus: "unknown"` | Shows partner accepted, unknown device. | Design proposal: matching notification_id/delivery_id/partner_entry_slug, accepted|duplicate, nonempty receipt_id. |
| **Error: 403** | `PARTNER_NOTIFICATION_BINDING_TENANT_SCOPE_DENIED` (Scope rejection) | Requires `foundation:read/write` and `tenant:webhooks:read` for endpoint list | Mapped to Access Denied board. |
| **Error: 404** | `PARTNER_NOTIFICATION_BINDING_NOT_FOUND` | Missing Binding. | Mapped to creation prompt. |
| **Error: 404** | `PARTNER_NOTIFICATION_BINDING_WEBHOOK_NOT_FOUND` | Missing Webhook. | Mapped to Webhook setup. |
| **Error: 409** | `PARTNER_NOTIFICATION_BINDING_VERSION_CONFLICT` | Version Conflict. | Mapped to refresh prompt. |
| **Error: 409** | `PARTNER_NOTIFICATION_BINDING_NOT_VALIDATED` | Validation Conflict. | Mapped to retest prompt. |
| **Error: 409** | `PARTNER_NOTIFICATION_BINDING_ENTRY_INACTIVE` | Entry Inactive. | Mapped to entry requirement UI. |
| **Error: 409** | `PARTNER_NOTIFICATION_BINDING_ENDPOINT_EVENTS_MISSING` | Endpoint Events Missing. | Mapped to authorized webhook management. |

## Backend Route Disclosure
While the UI states are modeled against the formal contracts (`packages/contracts/src/partner-passenger-notification.ts`), the following backend routes are **currently unavailable (not implemented in this PR)** and integration is limited to design-canvas mocks:
- `GET /api/platform-admin/partner-entries/:entrySlug/notification-deliveries`
- `POST /api/platform-admin/partner-entries/:entrySlug/notification-deliveries/:outboxId/retry`

The binding routes (`GET`, `PUT`, `POST .../test`, `POST .../enable`, `POST .../disable` on `/api/platform-admin/partner-entries/:entrySlug/notification-binding`) **ARE implemented** in the backend.

The canvas must use the immutable per-delivery target for history, not the current binding URL, and must not add another CRUD surface for tenant endpoint/secret access. Authorized tenant endpoint listing is in `tenant-partner.controller.ts` and tenant UI `/webhooks`.

This task scope is purely the design canvas.

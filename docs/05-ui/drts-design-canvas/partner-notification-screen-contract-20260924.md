# Partner Notification Screen Contract (UI17-NOTIFY-CANVAS-20260924)

## Per-State Formal Contract Matrix

| UI Component/State | API State/Field (`partner-passenger-notification.ts`) | UI Condition/Action | Formal Backend Route Availability |
| :--- | :--- | :--- | :--- |
| **Binding: `ready`** | `state: "ready"` | Shows active. Enable action hidden/disabled. | `GET /api/platform-admin/partner-entries/:entrySlug/notification-binding` (Available) |
| **Binding: `test_pending`** | `state: "test_pending"` | Requires `test` before `enable`. | `GET .../notification-binding` (Available) |
| **Binding: `disabled`** | `state: "disabled"` | Disable action disabled. Enable needs `test`. | `GET .../notification-binding` (Available) |
| **Validation** | `validatedEndpointFingerprint` | Matched against current fingerprint. Stale validation disables `enable`. | Current fingerprint computed using `url`, sorted `events`, `secretVersion`, and `ownerRef`. The Platform Admin screen must authorize via `tenant:webhooks:read` to fetch safe details from `GET /api/tenant/webhooks` (`URL`, `secretPreview`, `secretVersion`, `owner`), and must NOT expose updater identity. |
| **Action: `test`** | Request: empty body. | Initiates test delivery. | `POST /api/platform-admin/partner-entries/:entrySlug/notification-binding/test` (Available). Returns accepted or failed result. |
| **Action: `enable`** | Request: `{ expectedVersion }` | Transitions to `ready` | `POST /api/platform-admin/partner-entries/:entrySlug/notification-binding/enable` (Available) |
| **Action: `disable`** | Request: `{ expectedVersion }` | Transitions to `disabled` | `POST /api/platform-admin/partner-entries/:entrySlug/notification-binding/disable` (Available) |
| **Action: `save` (Edit)** | Request: `{ webhookId, eventTypes, expectedVersion }` | Returns to `test_pending` state. | `PUT /api/platform-admin/partner-entries/:entrySlug/notification-binding` (Available) |
| **Deliveries: Pending** | `outbox.status: "pending"` | Shows '待送' (Pending) | `GET /api/platform-admin/partner-entries/:entrySlug/notification-deliveries` (Design-only missing route) |
| **Deliveries: Failed** | `outbox.status: "failed"` | Check `retryDisposition` for retry UI. | `GET .../notification-deliveries` (Design-only missing route) |
| **Retry: `automatic`** | `disposition: "automatic"` | Resend button is enabled. | Evaluated via `deliveryContext.retryDisposition` |
| **Retry: `manual_only`** | `disposition: "manual_only"` | Resend button is enabled. | Evaluated via `deliveryContext.retryDisposition` |
| **Retry: `terminal`** | `disposition: "terminal"` | Resend button is disabled. | Evaluated via `deliveryContext.retryDisposition` |
| **Retry: `configuration_blocked`**| `disposition: "configuration_blocked"` | Resend button is disabled. | Evaluated via `deliveryContext.retryDisposition` |
| **Retry Action** | Emits retry | Initiates manual resend. | `POST /api/platform-admin/partner-entries/:entrySlug/notification-deliveries/:outboxId/retry` (Design-only missing route) |
| **Ack 202/201/200** | `stage: "partner_accepted", downstreamStatus: "unknown"` | Shows partner accepted, unknown device. | `GET .../notification-deliveries` (Design-only missing route) |
| **Error: 403** | Scope rejection | Requires `foundation:read/write` and `tenant:webhooks:read` for endpoint list | Mapped to Access Denied board. |
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

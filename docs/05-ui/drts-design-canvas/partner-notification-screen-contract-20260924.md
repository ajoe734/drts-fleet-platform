# Partner Notification Screen Contract (UI17-NOTIFY-CANVAS-20260924)

## Per-State Formal Contract Matrix

| UI Component/State | API State/Field (`partner-passenger-notification.ts`) | UI Condition/Action | Formal Backend Route Availability |
| :--- | :--- | :--- | :--- |
| **Binding: `ready`** | `state: "ready"` | Shows active. Enable action hidden/disabled. | `GET /tenants/:id/partner-entries/:slug/notification-binding` (Available) |
| **Binding: `test_pending`** | `state: "test_pending"` | Requires `test` before `enable`. | `GET .../notification-binding` (Available) |
| **Binding: `disabled`** | `state: "disabled"` | Disable action disabled. Enable needs `test`. | `GET .../notification-binding` (Available) |
| **Validation** | `validatedAt` / `validatedEndpointFingerprint` | If stale or null, `enable` is disabled. | Evaluated client-side from GET response. |
| **Action: `test`** | Emits `passenger.notification.test.v1` | Initiates test delivery. | `POST .../notification-binding/test` (Not available yet) |
| **Action: `enable`** | `expectedVersion` matches | Transitions to `ready` | `POST .../notification-binding/enable` (Not available yet) |
| **Action: `disable`** | `expectedVersion` matches | Transitions to `disabled` | `POST .../notification-binding/disable` (Not available yet) |
| **Action: `save` (Edit)** | Updates `webhookId` & `eventTypes` | Returns to `test_pending` state. | `PUT .../notification-binding` (Not available yet) |
| **Deliveries: Pending** | `outbox.status: "pending"` | Shows '待送' (Pending) | `GET .../notification-binding/deliveries` (Available) |
| **Deliveries: Failed** | `outbox.status: "failed"` | Check `retryDisposition` for retry UI. | `GET .../deliveries` (Available) |
| **Retry: `automatic`** | `disposition: "automatic"` | Resend button is enabled. | Evaluated via `deliveryContext.retryDisposition` |
| **Retry: `manual_only`** | `disposition: "manual_only"` | Resend button is enabled. | Evaluated via `deliveryContext.retryDisposition` |
| **Retry: `terminal`** | `disposition: "terminal"` | Resend button is disabled. | Evaluated via `deliveryContext.retryDisposition` |
| **Retry: `configuration_blocked`**| `disposition: "configuration_blocked"` | Resend button is disabled. | Evaluated via `deliveryContext.retryDisposition` |
| **Ack 202 (Unknown device)** | `stage: "partner_accepted", downstreamStatus: "unknown"` | Shows accepted, unknown device. | `GET .../deliveries` |
| **Error: 403** | Scope rejection | Requires `foundation:read/write` | Integration complete |
| **Error: 404** | Missing Binding | Prompt to create. | Integration complete |
| **Error: 409** | Version/Validation Conflict | Prompt to refresh/test. | Integration complete |

## Backend Route Disclosure
While the UI states are modeled against the formal contracts (`packages/contracts/src/partner-passenger-notification.ts`), the following backend routes are **currently unavailable (not implemented in this PR)** and integration is limited to design-canvas mocks:
- `POST /tenants/:id/partner-entries/:slug/notification-binding/test`
- `POST /tenants/:id/partner-entries/:slug/notification-binding/enable`
- `POST /tenants/:id/partner-entries/:slug/notification-binding/disable`
- `PUT /tenants/:id/partner-entries/:slug/notification-binding`

This task scope is purely the design canvas; API and runtime implementation remain in the original parent tasks.

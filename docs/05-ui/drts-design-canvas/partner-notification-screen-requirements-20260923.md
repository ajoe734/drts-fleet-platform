# Partner Notification Screen Requirements

Based on UI17-NOTIFY-CANVAS-20260924 audit findings D1-D6.

## D1: Binding State & Events
- Use `test_pending` instead of `pending_test`.
- Use `webhookId` for binding reference.
- 5 canonical internal events: `assignment_disclosure_ready`, `assignment_replaced`, `eta_changed`, `driver_arrived`, `receipt_ready`.

## D2: Edit Form
- Endpoint URL, signature secret, timeout, and retry policies are managed in webhook management, not binding.
- The PUT binding endpoint requires `webhookId + eventTypes + expectedVersion`.

## D3: Lifecycle
- Distinguish between "untested", "tested and ready to enable", and "disabled".
- Require successful endpoint fingerprint test before enabling.
- "Disable" can be recovered by re-testing or just enabling if tested.
- Ongoing `test_pending` / actions must disable buttons while pending.

## D4: Delivery Status
- HTTP 200, 201, 202 are treated as `partner_accepted` with `downstreamStatus: "unknown"`, ONLY IF accompanied by a valid, matching ack (notification_id, delivery_id, etc.).
- Missing, invalid, or mismatched ack is treated as failed (`manual_only`), regardless of HTTP status.
- `delivered` is the formal enum status in the outbox for accepted notifications. The product-facing claim is strictly "夥伴端接受且裝置未知" (Partner accepted, device unknown).

## D5: Retry Outcomes
- Must show `notification_expired`, `notification_superseded`, `budget_exhausted` (exhausted attempt budget), `lease_active`, `binding_not_ready` (`configuration_blocked`, distinct from exhausted budget) as reasons for failure.
- Active lease must refuse/suppress retry, not present an enabled action.
- Requeue outcome must return the row to `pending` status, not invent an `enqueued` API enum.
- Requeue is controlled by `retryDisposition` (`automatic`, `manual_only`, `terminal`, `configuration_blocked`).

## D6: Error States
- 403 means no read/write access (requires `foundation:read/write` resource scope for binding and `tenant:webhooks:read` for endpoint list).
- 404 means `PARTNER_NOTIFICATION_BINDING_NOT_FOUND` or `WEBHOOK_NOT_FOUND`.
- 409 includes `PARTNER_NOTIFICATION_BINDING_VERSION_CONFLICT`, `PARTNER_NOTIFICATION_BINDING_NOT_VALIDATED` (stale validation), `PARTNER_NOTIFICATION_BINDING_ENTRY_INACTIVE`, and `PARTNER_NOTIFICATION_BINDING_ENDPOINT_EVENTS_MISSING`.

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

## D4: Delivery Status
- HTTP 200, 201, 202 are all treated as `accepted_unknown_device`.
- Valid ack means the partner endpoint accepted it; the device delivery is unknown.

## D5: Retry Outcomes
- Must show `expired`, `superseded`, `budget_exhausted`, `lease_active`, `binding_not_ready` as reasons for failure.
- Must show `enqueued` status for requeued notifications.
- Requeue is controlled.

## D6: Error States
- 403 means no read access (not just no edit access).
- 404 means no binding exists.
- 409 means version conflict (expectedVersion mismatch).

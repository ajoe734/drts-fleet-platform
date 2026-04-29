# Tenant API Key And Webhook Governance Runbook

Last updated: 2026-04-29
Task ref: `OPX-IN-003`

This runbook defines the canonical governance package for tenant API access and
webhook delivery. It turns existing authority endpoints into a repeatable
integration handoff instead of a case-by-case operator memory exercise.

## Scope

- Authority module: `apps/api/src/modules/tenant-partner/`
- Consumer plane: `tenant-commute-hub` integration pages
- Machine-readable package: `GET /api/tenant/integration-governance`

## API Key Policy

Canonical tenant API key scopes:

- `audit:read`
- `reports:read`
- `reports:write`
- `tenant:read`
- `tenant:write`
- `tenant:billing:read`
- `tenant:billing:write`
- `tenant:sla:read`
- `tenant:sla:write`
- `tenant:webhooks:read`
- `tenant:webhooks:write`

Compatibility aliases accepted by the authority:

- `tenant:bookings:write` -> `tenant:write`
- `tenant:reports:read` -> `reports:read`

Lifecycle rules:

- Every issued or rotated tenant API key receives an explicit expiry.
- If the caller omits `expiresAt`, the authority defaults the key to a
  60-day lifetime.
- `expiresAt` may not exceed 90 days from issuance or rotation time.
- Revocation is immediate and irreversible.
- Break-glass access is not self-service. Any exceptional production override
  requires manual platform-admin approval instead of a special tenant scope.

Operational rules:

- Use sandbox keys for pre-production validation.
- Rotate production keys on or before the 60-day cadence; 90 days is the hard
  maximum, not the target.
- Capture the integration owner and rollback owner before handing over a
  production key.

## Webhook Policy

Webhook endpoint states:

- `test_pending`: endpoint exists but must pass validation before it is trusted
  for live event delivery
- `active`: endpoint is validated and receives live tenant webhook events
- `disabled`: endpoint was manually paused or auto-disabled after final
  delivery failure and must be revalidated before reuse

Retry contract:

- Initial attempt plus up to 4 retries, capped by `maxAttempts = 5`
- Backoff: `30s`, `60s`, `120s`, `240s`, `480s`
- Retryable HTTP statuses: `408`, `429`, `500`, `502`, `503`, `504`
- Network failures are retried under the same policy

Validation and disable rules:

- New endpoints start in `test_pending`
- Editing endpoint URL or subscribed events forces the endpoint back to
  `test_pending`
- Rotating the webhook secret forces the endpoint back to `test_pending`
- A successful `tenant.webhook.test` delivery promotes `test_pending` to
  `active`
- A final delivery failure auto-disables the endpoint and records an authority
  notification for the tenant
- Disabled endpoints do not receive live tenant events until they are tested
  again

Observable fields exposed by the authority:

- retry policy snapshot
- runtime delivery counters
- `lastAttemptAt`
- `lastDeliveredAt`
- `lastValidatedAt`
- `disabledAt`
- `disableReason`
- secret rotation history with preview only, never plaintext

## Tenant Integration Handoff Packet

Every tenant integration handoff should include:

1. Tenant ID, environment, integration owner, and rollback owner.
2. Issued sandbox API key scope set and planned production scope set.
3. Planned key rotation date and immediate revoke procedure.
4. Webhook URL, event bundle, and secret handoff confirmation.
5. Successful `tenant.webhook.test` evidence with delivery ID and HTTP status.
6. Confirmation that authority delivery logs and notification feed were
   reviewed after the test.
7. Production cutover date plus rollback trigger conditions.

## Verification

- `pnpm --filter @drts/api exec vitest run tests/unit/tenant-partner.service.test.ts`
- `pnpm --filter @drts/api typecheck`
- `pnpm --filter @drts/api-client typecheck`

# Tenant API Key And Webhook Governance Runbook

Last updated: 2026-09-13
Task ref: `OPX-IN-003`, `SR-QA-WEBHOOK-001-FIX-API-KEY-USAGE-TRACKING` (`C111`)

This runbook defines the canonical governance package for tenant API access,
credential usage tracking, and webhook delivery. It turns authority endpoints
and consumer write paths into a repeatable integration handoff instead of a
case-by-case operator memory exercise.

## Scope

- Authority module: `apps/api/src/modules/tenant-partner/`
- Service plane authority: `TenantPartnerService.authenticateTenantApiKey`
- Consumer guard plane: `TenantApiKeyAuthGuard`
- Authoritative HTTP endpoints:
  - `POST /api/tenant/api-keys/authenticate` (direct credential verification & usage tracking)
  - `POST /api/tenant/api-keys/exchange` (M2M session exchange)
  - `GET /api/tenant/api-keys` (reads inventory with inline credential usage recording)
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

### Authoritative Consumer & Guard Architecture

Tenant API keys are issued with a `tk_` prefix and hashed via SHA-256 (`sha256:...`).
Raw secret material is never stored or returned after initial creation.

Transport options supported by the consumer plane:
1. `Authorization: Bearer tk_...`
2. `x-api-key: tk_...`
3. `x-tenant-api-key: tk_...`

`TenantApiKeyAuthGuard` validates the header format, resolves the key against
`TenantPartnerService.authenticateTenantApiKey`, and injects both `request.identity`
(`realm: "tenant"`, `actorType: "tenant_admin"`, granted scopes) and
`request.authenticatedApiKey`.

Dedicated authoritative endpoints:
- `POST /api/tenant/api-keys/authenticate`: Accepts `{ apiKey, requiredScopes }` in
  body or header, records usage, and returns `{ authenticated: true, apiKey, identity }`.
- `POST /api/tenant/api-keys/exchange`: M2M exchange returning scoped session token
  payload `{ tokenType: "Bearer", apiKeyId, tenantId, scopes, identity }`.
- `GET /api/tenant/api-keys`: Accepts incoming tenant API key headers, immediately
  updates `lastUsedAt` on the presented key, and returns the refreshed key inventory.

### Usage Tracking Write Path & DB Readback Contract

Every successful authentication through `TenantPartnerService.authenticateTenantApiKey`:
1. **Timestamp Update**: Mutates `lastUsedAt` to the current ISO-8601 timestamp.
2. **Workload Attribution**: Updates `lastUsedWorkload` to identify the consumer
   workload (e.g. `tenant_api`, `tenant_api_authenticate`, `tenant_api_list`,
   `tenant_api_guard`, `tenant_api_exchange`).
3. **Signal Recalculation**: Recomputes `signals` including `approachingExpiry`,
   `expired`, and `dormantUse`.
4. **Dormant Credential Detection**: If the credential has not been used for
   `CREDENTIAL_DORMANT_THRESHOLD_DAYS` (45 days), triggers an `ops_notice`
   notification to tenant admins.
5. **Audit Logging**: Emits an authoritative `use_api_key` tenant audit log entry
   with `resourceType: "tenant_api_key"` and updated values summary.
6. **Database Persistence**: Writes changes via `TenantPartnerRepository.persistChanges`
   into `admin.phase1_tenant_api_keys` JSONB `record` column, guaranteeing that
   `lastUsedAt` and `lastUsedWorkload` survive instance restarts and are reflected in
   all subsequent readback queries.

### Minimal Product Scope & Error Contract

All requests must satisfy tenant isolation and requested scope boundaries:
- `TENANT_API_KEY_REQUIRED` (`401`): API key was omitted from headers and payload.
- `TENANT_API_KEY_INVALID` (`401`): Secret hash could not be matched with any key.
- `TENANT_API_KEY_EXPIRED` (`401`): Key has exceeded its `expiresAt` timestamp.
- `TENANT_API_KEY_REVOKED` (`401`): Key has been manually revoked.
- `TENANT_API_KEY_AUTO_REVOKED` (`401`): Key was auto-revoked after rotation overlap elapsed.
- `TENANT_API_KEY_TENANT_MISMATCH` (`403`): Key is valid but belongs to a different tenant.
- `INSUFFICIENT_SCOPE` (`403`): Key does not grant all required scopes.

## Webhook Policy

Webhook endpoint states:

- `test_pending`: endpoint exists but must pass validation before it is trusted
  for live event delivery
- `active`: endpoint is validated and receives live tenant webhook events
- `disabled`: endpoint was manually paused or auto-disabled after final
  delivery failure and must be revalidated before reuse

### Transport Deadline Contract

- **Per-attempt timeout deadline**: Default `10,000` ms (`10s`). Bounded to the
  integer range `[1, 60,000]` ms (`1ms` to `60s`). Non-integer, non-finite,
  or out-of-range configurations reject with an explicit validation error on startup.
- **Configuration boundary**: Platform-level environment variable
  `WEBHOOK_DISPATCH_TIMEOUT_MS` (with optional `@Inject(WEBHOOK_DISPATCH_TIMEOUT_MS)`
  token override for testing/scaffolding).
- **Tenant-level override boundary**: Per-tenant timeout overrides are
  **PROHIBITED** in Phase 1. Allowing tenant-controlled request deadlines introduces
  denial-of-service risks where a stalled tenant receiver could exhaust shared
  dispatch worker threads and connection pools.
- **Response body read time boundary**: The transport deadline strictly bounds
  connection handshake and initial HTTP response headers receipt (`fetch` promise settlement).
  The dispatch client does not buffer or stream large response bodies; the HTTP
  status code determines delivery or retry eligibility immediately, preventing slow-read
  connection holds.
- **Timeout failure classification**: A transport timeout triggers an `AbortController.abort()`
  with `webhook_dispatch_transport_timeout` / `AbortError`, captured and classified
  as a network failure (`httpStatus: null`). It falls into standard retry evaluation
  (`shouldRetry(retryPolicy, attempt, null)`).
- **Retry & backoff on timeout**: If attempts remain (`attempt < maxAttempts`),
  the delivery is persisted as `queued` with an exponentially backed-off
  `nextAttemptAt` and an in-process retry timer is scheduled. Once attempts are
  exhausted (`attempt >= maxAttempts`), the status transitions to `delivery_failed`,
  `nextAttemptAt: null`, and the endpoint increments its failed delivery counter
  toward auto-disablement.
- **Process restart & pending attempt recovery**:
  - Deliveries are durably persisted in the repository before timers are set.
  - On process boot (`onModuleInit()`), `TenantPartnerService.schedulePersistedWebhookRetries()`
    scans all deliveries in `status === 'queued'` with non-null `nextAttemptAt`.
  - Overdue attempts (`nextAttemptAt <= now`) are scheduled with `delayMs = 0` to
    re-dispatch on the immediate next tick.
  - Future attempts are scheduled with the remaining difference (`nextAttemptAt - now`).
  - In-flight attempts interrupted by a sudden process termination remain recorded
    as `queued` (since the database write occurs upon attempt completion), ensuring
    zero dropped webhook delivery attempts across server restarts.

### Retry contract

- Initial attempt plus up to 4 retries, capped by `maxAttempts = 5`
- Backoff: `30s`, `60s`, `120s`, `240s`, `480s`
- Retryable HTTP statuses: `408`, `429`, `500`, `502`, `503`, `504`
- Network failures (including transport timeouts) are retried under the same policy

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
- `pnpm --filter @drts/api exec vitest run tests/unit/tenant-partner.controller.test.ts`
- `pnpm --filter @drts/api exec vitest run tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts`
- `pnpm --filter @drts/api typecheck`
- `pnpm --filter @drts/api-client typecheck`

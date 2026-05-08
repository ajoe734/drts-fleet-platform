# Forwarder Production Adapter Rollout Runbook

Last updated: 2026-05-08
Task ref: `API-MP-003`

This runbook defines the minimum production baseline for external forwarder
adapters before a platform can be treated as live traffic capable.

## Scope

- Backend module: `apps/api/src/modules/forwarder`
- Canonical contracts: `packages/contracts`
- Applies to all external forwarded-order adapters, including webhook and
  outbound accept/reject relays

## Required Contract Baseline

Every production-capable adapter must declare:

- adapter mode: `api`, `webhook`, or `hybrid`
- production status: `production_ready`
- whether inbound webhooks are supported
- whether outbound driver actions are supported
- supported webhook event names
- operator notes for rollout caveats

Stub adapters are allowed only for local scaffolding and must stay marked
`productionStatus = stub`. A stub adapter must never be used as proof that a
platform is production ready.

## Health Baseline

`AdapterHealthRecord` is the operational source of truth for forwarder adapter
readiness. Review these fields before production cutover:

- `status`: overall severity, one of `healthy`, `degraded`, `down`
- `reason`: why the adapter is degraded or special-cased
- `credentialStatus`
- `authStatus`
- `webhookStatus`
- `rateLimitStatus`
- `capabilitySummary.productionStatus`
- `lastError`
- `lastWebhookReceivedAt`
- `lastRateLimitAt`
- `lastAuthFailureAt`

Expected production-ready target state:

- `status = healthy`
- `reason = none`
- `capabilitySummary.productionStatus = production_ready`
- `credentialStatus = valid`
- `authStatus = authenticated`
- `webhookStatus = healthy` for webhook-capable adapters
- `rateLimitStatus = ok`

## Webhook Readiness Rules

- Inbound webhook adapters must verify signatures before ingesting payloads.
- Failed verification must update adapter health with `reason = webhook` and
  `webhookStatus = failing`.
- Successful verification should stamp `lastWebhookReceivedAt`.
- If a platform does not use inbound webhooks, set
  `webhookStatus = not_applicable`.

## Auth And Credential Rules

- Credential rotation or revocation must be reflected through
  `credentialStatus`.
- Relay failures caused by expired or invalid auth must move the adapter into
  `reason = auth` or `reason = credential`.
- Reauth-required failures should set `authStatus = reauth_required`.
- Expired secrets or tokens should set `credentialStatus = expired`.

## Rate-Limit Rules

- Any `429` or equivalent provider rate-limit response must update
  `reason = rate_limit`.
- Rate-limited adapters should set `rateLimitStatus = limited` and capture
  `lastRateLimitAt`.
- Do not hide sustained rate limiting behind generic `degraded` copy.

## Inbound Idempotency Rule

- Forwarded order ingestion must be idempotent on
  `(platformCode, externalOrderId)`.
- Replayed inbound payloads for the same platform order must reuse the existing
  mirror order instead of creating duplicates.

## Rollout Checklist

1. Confirm the adapter no longer reports `productionStatus = stub`.
2. Verify credential handoff, storage, and rotation owner.
3. Verify webhook secret exchange and one successful signed delivery.
4. Confirm a healthy outbound accept relay using a non-test order path.
5. Confirm adapter health returns the expected component states.
6. Trigger or simulate a rate-limit path and verify health updates.
7. Confirm replayed webhook/order delivery does not create a duplicate mirror
   order.

## Verification

- `pnpm --filter @drts/api typecheck`
- `pnpm --filter @drts/api test -- --run tests/unit/forwarder.service.test.ts`

# Forwarder Sandbox Provider

Last updated: 2026-05-19  
Task ref: `FWD-SBX-001`

## Purpose

`apps/api/src/modules/forwarder/sandbox.adapter.ts` and
`apps/api/src/modules/forwarder/sandbox.fixtures.ts` provide a deterministic
forwarder sandbox harness so `FWD-E2E-001` can exercise the forwarded-order
path without any real partner credential, webhook secret, or settlement feed.

The current runtime binding stays on the existing
`/api/forwarder/webhooks/grab-taiwan` entrypoint. `GrabTaiwanAdapter` is now a
named binding over the shared sandbox harness rather than a one-off stub
implementation.

## Non-Production Guardrails

- `capabilitySummary.productionStatus` stays `stub`.
- Adapter health remains `reason=stub` with `credential/auth/webhook/rateLimit`
  all marked `stub`.
- Sandbox webhook verification only checks for a non-empty signature header plus
  provider/platform consistency. It is not cryptographic proof.
- `fetchEarnings()` returns a deterministic settlement sample from fixtures. It
  is not evidence of real payout, partner ledger, or settlement readiness.
- This harness is valid for local/unit/E2E verification only. It must not be
  cited as production rollout evidence.

## Fixture Map

| Scenario          | Fixture                                                          | Runtime path                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| inbound order     | `inboundWebhookPayload`, `webhookHeaders`, `inboundOrderCommand` | `POST /api/forwarder/webhooks/grab-taiwan` or `POST /api/forwarder/orders/inbound`                                                                 |
| broadcast         | `broadcastCommand`                                               | `POST /api/forwarder/orders/:orderId/broadcast`                                                                                                    |
| accept relay      | `relayAcceptCommand`, `adapterAcceptInput`                       | `POST /api/driver/forwarded-orders/:taskId/accept` or `POST /api/forwarder/orders/:orderId/accept`                                                 |
| lost race         | `lostRaceStatusCommand`                                          | `POST /api/forwarder/orders/:orderId/sync-status`                                                                                                  |
| cancel            | `cancelledStatusCommand`                                         | `POST /api/forwarder/orders/:orderId/sync-status`                                                                                                  |
| complete sample   | `adapterCompleteInput`, `completeReconciliationCommand`          | Sandbox sample only; current forwarder runtime still closes local authority through native sync / reconciliation instead of a new completion state |
| settlement sample | `settlementSample.rows`, `settlementSample.csv`                  | Evidence fixture for finance/reporting assertions; local ledger remains `shadow_only`                                                              |

## Recommended Binding

`apps/api/src/modules/forwarder/grab-taiwan.adapter.ts` exports
`GRAB_TAIWAN_SANDBOX_FIXTURES`, which is the default binding for current
forwarder acceptance and E2E work:

```ts
import { GRAB_TAIWAN_SANDBOX_FIXTURES } from "./grab-taiwan.adapter";
```

For future partner-specific sandboxes, create a new binding with
`buildForwarderSandboxFixtures({...})` and pass it into
`new ForwarderSandboxAdapter(fixtures)`.

## FWD-E2E-001 Handoff Notes

1. Import `GRAB_TAIWAN_SANDBOX_FIXTURES` or build an equivalent fixture set.
2. Post `inboundWebhookPayload` with `webhookHeaders` to
   `/api/forwarder/webhooks/grab-taiwan`.
3. Use the returned `mirrorOrderId` with `broadcastCommand`.
4. Accept through the driver-safe endpoint to verify task visibility,
   `routeLocked`, and no owned dispatch assignment creation.
5. Drive `confirmedStatusCommand`, `lostRaceStatusCommand`, or
   `cancelledStatusCommand` through `/api/forwarder/orders/:orderId/sync-status`
   depending on the scenario under test.
6. Use `settlementSample.csv` only as sandbox evidence for external-platform
   settlement rows. Do not upgrade workflow gates using this file alone without
   the corresponding E2E assertions.

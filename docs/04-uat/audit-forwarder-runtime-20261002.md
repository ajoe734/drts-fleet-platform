# AUDIT-FORWARDER-RUNTIME-20261002 UAT Notes

## Blockers
- **Grab Taiwan Provider Contract Missing**: The `GrabTaiwanAdapter` currently lacks actual upstream API credentials and approved contracts to authenticate webhooks and send real actions (accept, reject, complete). The fake acknowledged stub semantics have been removed. The provider must remain in an "unavailable" and degraded state, returning `acknowledged: false` and `accepted: false` for all operations until a real transport is configured.

## Missing Prerequisites
- A valid Grab Taiwan API contract and production account.
- Upstream credentials for authentication and webhook signatures.
- Re-verification of correlation ID and idempotency tokens with real Grab Taiwan testing endpoints.

## Review Reopen R1
* **F1**: Invalid health/auth contract literals prevented compilation (TS2322/TS2820). Fixed by using valid enums (`credential`, `not_configured`, `unknown`).
* **F2**: Unused input parameters in `grab-taiwan.adapter.ts` caused lint failures. Fixed by dropping the unused optional parameters entirely.

## Review Reopen R2
* **F3**: `ForwarderService` incorrectly cleared degraded health state after failures (e.g. rejected webhooks, relay failure) when receiving successful ingest events. Fixed by ensuring `buildHealthyAdapterHealthPatch`, `buildFailureAdapterHealthPatch`, and webhook verifications all preserve the baseline `configuration_required` unavailable contract, instead of pinning mutable transient labels.
* **F5**: Fixed `prefer-const` lint error in unit test.
* **F6**: Updated `apps/api/tests/unit/forwarder.service.test.ts` to expect `GrabTaiwanAdapter` to be `configuration_required` instead of `stub`.
* **F4**: Added durable regression tests for rejected webhooks (`FORWARDER_WEBHOOK_VERIFICATION_FAILED`), preserved `sync_failed` driver outcomes, missing credentials in webhooks, rejected webhook replay creating zero orders, and invariant preservation for unavailable `GrabTaiwanAdapter` in `tests/unit/audit-forwarder-runtime-20261002.test.ts`.

## §0.7 Candidate Evidence Table

| Property | Value |
| --- | --- |
| Old Candidate SHA | `6ce5abe3ddee55950c2a2a26f13c256f77c6b381` |
| New Candidate SHA | `408beb5c8a88d106faead298c0aabc398082d082` |
| Validation Command | `pnpm exec vitest run tests/unit/audit-forwarder-runtime-20261002.test.ts tests/unit/forwarder.test.ts apps/api/tests/unit/forwarder.service.test.ts apps/api/tests/unit/forwarder.controller.test.ts` |
| Validation Exit Code | `0` |
| Evidence Location | Log task `task-135` / Task Artifacts |
| Unverified Limits | Live signed provider verification and real callback lifecycle are blocked pending EXT-002-BLK-001/007 upstream account readiness. Do not run hosted integration endpoints. |

## Acceptance Evidence
* **no_fake_provider_ack**: Confirmed by `GrabTaiwanAdapter` regressions verifying `accept`, `reject`, `complete`, `heartbeat` return `acknowledged: false`, and `verifyWebhook` returns `accepted: false`. Confirmed driver sync outcomes evaluate to `sync_failed`.
* **confirmed_transport_or_explicit_blocker**: Confirmed by the blockers and missing prerequisites listed above (reusing EXT-002-FORWARDER-ADAPTER-GATE.md blockers context) and explicit `MISSING_PROVIDER_CONTRACT` return messages. Health readiness correctly defaults to `degraded/credential/not_configured` from the unavailable capabilities.
* **callback_auth_and_idempotency**: Verified in `tests/unit/audit-forwarder-runtime-20261002.test.ts`, showing repeated rejected callbacks return `FORWARDER_WEBHOOK_VERIFICATION_FAILED` and create zero orders. The direct ingest test verifies that repeated calls with same external order ID produce the exact same mirror order ID.
* **same_sha_review_ci**: Local unit, typecheck, and lint pass natively on the final candidate SHA. Hosted checks are pending on CI integration bus.

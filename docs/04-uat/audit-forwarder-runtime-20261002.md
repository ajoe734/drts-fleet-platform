# AUDIT-FORWARDER-RUNTIME-20261002 UAT Notes

## Blockers
- **Grab Taiwan Provider Contract Missing**: The `GrabTaiwanAdapter` currently lacks actual upstream API credentials and approved contracts to authenticate webhooks and send real actions (accept, reject, complete). The fake acknowledged stub semantics have been removed. The provider must remain in an "unavailable" and degraded state, returning `acknowledged: false` and `accepted: false` for all operations until a real transport is configured.

## Missing Prerequisites
- A valid Grab Taiwan API contract and production account.
- Upstream credentials for authentication and webhook signatures.
- Re-verification of correlation ID and idempotency tokens with real Grab Taiwan testing endpoints.

## Review Reopen R1 & R2
* **F1**: Invalid health/auth contract literals prevented compilation (TS2322/TS2820). Fixed by using valid enums (`credential`, `not_configured`, `unknown`).
* **F2**: Unused input parameters in `grab-taiwan.adapter.ts` caused lint failures. Fixed by dropping the unused optional parameters entirely.
* **F3**: `ForwarderService` incorrectly cleared degraded health state after failures (e.g. rejected webhooks, relay failure) when receiving successful ingest events. Fixed by ensuring `buildHealthyAdapterHealthPatch`, `buildFailureAdapterHealthPatch`, and webhook verifications all preserve the baseline `configuration_required` unavailable contract, instead of pinning mutable transient labels.
* **F5**: Fixed `prefer-const` lint error in unit test.

## Review Reopen R3
* **F6**: Updated `apps/api/tests/unit/forwarder.service.test.ts` to expect `GrabTaiwanAdapter` to have `authStatus: "unknown"` and `rateLimitStatus: "unknown"` instead of `not_configured`, to align with valid contract enums.
* **F4**: Strengthened durable regression tests: asserted rejection code `401`/`FORWARDER_WEBHOOK_VERIFICATION_FAILED` unconditionally on the real `ingestGrabTaiwanWebhook` path, and added action correlation assertions (`platformCode`/`externalOrderId`) to the existing real-adapter tests (`accept`, `complete`, `reject`).
* **F7**: Fixed `normalizeAdapterHealthRecord` in `forwarder.service.ts` to prioritize the registered runtime adapter capability baseline over the old persisted record capability summary. Added F7 regression test.

## §0.7 Candidate Evidence Table

| Property | Value |
| --- | --- |
| Old Candidate SHA (R2 handoff) | `641fd949823ea1d0b686251ac7065cd062c5f16e` |
| Tested Implementation SHA | `6641844759b0e92a803c1afa4e8928cf2b48f093` |
| New Candidate SHA | `1e697fe4623f1e10a6de02a3f27432e196cf946a` |
| Validation Command (API) | `pnpm --filter @drts/api exec vitest run tests/unit/forwarder.service.test.ts tests/unit/forwarder.controller.test.ts` |
| Validation Exit Code (API) | `0` |
| Validation Command (UAT root) | `pnpm exec vitest run tests/unit/audit-forwarder-runtime-20261002.test.ts tests/unit/forwarder.test.ts tests/unit/system-remediation/sr-qa-governance-001/c108-health-observability-forwarders.test.ts` |
| Validation Exit Code (UAT root) | `0` |
| Evidence Location | Task Artifacts log for `task-135` |
| Unverified Limits | Live signed provider verification and real callback lifecycle are blocked pending EXT-002-BLK-001/007 upstream account readiness. Do not run hosted integration endpoints. |

## Acceptance Evidence
* **no_fake_provider_ack**: Confirmed by `GrabTaiwanAdapter` regressions verifying `accept`, `reject`, `complete`, `heartbeat` return `acknowledged: false` with specific `platformCode` and `externalOrderId` correlations, and `verifyWebhook` returns `accepted: false`. Confirmed driver sync outcomes evaluate to `sync_failed`.
* **confirmed_transport_or_explicit_blocker**: Confirmed by the blockers and missing prerequisites listed above and explicit `MISSING_PROVIDER_CONTRACT` return messages. Health readiness correctly defaults to `degraded/credential/not_configured` from the unavailable capabilities. Capability summary is authoritative from registered adapter over persisted history.
* **callback_auth_and_idempotency**: Verified in `tests/unit/audit-forwarder-runtime-20261002.test.ts`, showing repeated rejected callbacks unconditionally assert `401` `FORWARDER_WEBHOOK_VERIFICATION_FAILED` and create zero orders. The direct ingest test verifies that repeated calls with same external order ID produce the exact same mirror order ID.
* **same_sha_review_ci**: Local unit tests pass on API and root tests. Hosted checks are pending on CI integration bus.

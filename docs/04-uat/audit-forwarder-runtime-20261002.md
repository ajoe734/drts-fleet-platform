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
* **F3**: `ForwarderService` incorrectly rehydrated the stub adapter to `healthy` when loading from the DB, obscuring the degraded state. Fixed by applying snapshots during `seedRegisteredAdapters` and updating `buildHealthyAdapterHealthPatch` to respect static `credential` degraded state.
* **F4**: Added durable regression tests for explicitly rejected operations, preserved `sync_failed` fail-closed driver outcomes, missing credentials in webhooks, and correct rehydration. Tests available at `tests/unit/audit-forwarder-runtime-20261002.test.ts`.

## Acceptance Evidence
* **no_fake_provider_ack**: Confirmed by `GrabTaiwanAdapter` regressions verifying `accept`, `reject`, `complete`, `heartbeat` return `acknowledged: false`, and `verifyWebhook` returns `accepted: false`.
* **confirmed_transport_or_explicit_blocker**: Confirmed by the blockers and missing prerequisites listed above (reusing EXT-002-FORWARDER-ADAPTER-GATE.md blockers context) and explicit `MISSING_PROVIDER_CONTRACT` return messages.
* **callback_auth_and_idempotency**: Verified in `tests/unit/audit-forwarder-runtime-20261002.test.ts`, showing ingest with same external order ID produces the exact same mirror order ID, preserving idempotency without relying on real signature verification since transport is unavailable.
* **same_sha_review_ci**: All typecheck, lint, and unit test suites exit 0 natively on the final candidate SHA.

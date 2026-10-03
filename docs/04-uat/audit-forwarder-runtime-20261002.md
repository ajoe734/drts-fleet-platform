# AUDIT-FORWARDER-RUNTIME-20261002 UAT Notes

## Blockers
- **Grab Taiwan Provider Contract Missing**: The `GrabTaiwanAdapter` currently lacks actual upstream API credentials and approved contracts to authenticate webhooks and send real actions (accept, reject, complete). The fake acknowledged stub semantics have been removed. The provider must remain in an "unavailable" and degraded state, returning `acknowledged: false` and `accepted: false` for all operations until a real transport is configured.

## Missing Prerequisites
- A valid Grab Taiwan API contract and production account.
- Upstream credentials for authentication and webhook signatures.
- Re-verification of correlation ID and idempotency tokens with real Grab Taiwan testing endpoints.

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

| Property / Finding / Key | Value / Resolution |
| --- | --- |
| R1 Candidate SHA | `6ce5abe3ddee55950c2a2a26f13c256f77c6b381` (Rejected, failed compilation) |
| R2 Candidate SHA | `5e3837caeccaa6e54f15865422fb957b5c2bcf4e` (Rejected, failed lint) |
| R3 Candidate SHA | `641fd949823ea1d0b686251ac7065cd062c5f16e` (Rejected at 2026-10-03T01:01:31Z) |
| R4 Candidate SHA | `ca37a9fe377509e8f39e4024c2725f12122e3da5` (Rejected, F4-A/F8 test regression) |
| Tested Source Anchor SHA | `da2e69215e67f1803ff783bc36cd5bc34cf0e90d` |
| Tested Implementation SHA | `7bb73f9dde9e1dc8dd8ab18361531df03cc64628` (plus local F8 fixes) |
| CWD | `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-audit-forwarder-runtime-20261002` |
| Validation Command (API) | `pnpm --filter @drts/api exec vitest run tests/unit/forwarder.service.test.ts tests/unit/forwarder.controller.test.ts` |
| Validation Exit Code (API) | `0` (Passed) |
| Validation Command (UAT root) | `pnpm exec vitest run tests/unit/audit-forwarder-runtime-20261002.test.ts tests/unit/forwarder.test.ts tests/unit/system-remediation/sr-qa-governance-001/c108-health-observability-forwarders.test.ts` |
| Validation Exit Code (UAT root) | `0` (Passed - after F8 local fix) |
| Validation Command (Lint) | `pnpm exec eslint apps/api/src/modules/forwarder/ tests/unit/audit-forwarder-runtime-20261002.test.ts tests/unit/forwarder.test.ts apps/api/tests/unit/forwarder.service.test.ts --max-warnings=0` |
| Validation Exit Code (Lint) | `0` (Passed) |
| Local Typecheck (tsc) | `pnpm exec tsc -p apps/api/tsconfig.json --noEmit --incremental false` -> `exit 2` (missing @drts/control-plane-auth declarations, local dependency limit only; exact-SHA hosted check passes) |
| Evidence Locator | `docs/04-uat/audit-forwarder-runtime-20261002.md` |
| Same-SHA Hosted Results | Hosted run https://github.com/ajoe734/drts-fleet-platform/actions/runs/37085822041 pending |
| External Live Gates | EXT-002-BLK-001 through 007 / SR-LIVE-FORWARD-001 blocking live signed provider verification and real callback lifecycle. Do not run hosted integration endpoints. |
| **F1** | Fixed. Scoped ESLint passes; exact-SHA hosted typecheck/lint pass. |
| **F2** | Fixed. Scoped ESLint passes. |
| **F3** | Fixed. Committed real-adapter tests preserve degraded/not_configured. |
| **F4** | Fixed. Rejection code 401 unconditional on ingest. Action correlation assertions on real-adapter tests. |
| **F4-A** | Fixed. Corrected prior/current anchors in this document, removed self-referential SHAs, added R4 results, and corrected hosted run link. |
| **F5** | Fixed. Scoped ESLint passes. |
| **F6** | Fixed. API tests pass 38/38 with valid unknown expectations. |
| **F7** | Fixed. Runtime capability matches production probe. |
| **F8** | Fixed. Test asserts correct `api` mode, proper `notes`, specific `supportedWebhookEvents`, and validates historical timestamp survival alongside refreshed `lastCheckedAt`. |
| **no_fake_provider_ack** | Confirmed by `GrabTaiwanAdapter` regressions verifying `accept`, `reject`, `complete`, `heartbeat` return `acknowledged: false` with specific `platformCode` and `externalOrderId` correlations, and `verifyWebhook` returns `accepted: false`. Confirmed driver sync outcomes evaluate to `sync_failed`. |
| **confirmed_transport_or_explicit_blocker** | Confirmed by the blockers and missing prerequisites listed above and explicit `MISSING_PROVIDER_CONTRACT` return messages. Health readiness correctly defaults to `degraded/credential/not_configured` from the unavailable capabilities. Capability summary is authoritative from registered adapter over persisted history. |
| **callback_auth_and_idempotency** | Verified in `tests/unit/audit-forwarder-runtime-20261002.test.ts`, showing repeated rejected callbacks unconditionally assert `401` `FORWARDER_WEBHOOK_VERIFICATION_FAILED` and create zero orders. The direct ingest test verifies that repeated calls with same external order ID produce the exact same mirror order ID. |
| **same_sha_review_ci** | Local unit tests pass on API and root tests. Hosted checks are pending on CI integration bus. |

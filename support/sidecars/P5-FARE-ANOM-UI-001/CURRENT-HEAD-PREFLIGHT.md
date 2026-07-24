# P5-FARE-ANOM-UI-001 Current-Head Preflight

- Task-ID: `P5-FARE-ANOM-UI-001`
- Branch: `codex/p5-fare-anom-ui-001-final`
- Merged requirements base: `c5df24a41ba8ed9c790649719dd731b560cde6fd`
- Clean integration base: `54675de25`
- Status: `FEATURE VERIFIED — EXTERNAL INTEGRATION BLOCKERS RECORDED`
- Date: `2026-07-24`

## Scope

Implement the production fare-anomaly queue/detail flow for
`P5-COM-UI-01`, `P5-FARE-ANOM-001`, and `P5-FARE-ANOM-UI-001`.

The implementation must:

- expose the five canonical anomaly reasons from server authority;
- fail closed when data, permission, or action authority is unavailable;
- prohibit direct or manually entered fare-number correction;
- expose recovery controls only from server-provided `availableActions`;
- include permission, error, loading, empty-state, and behavior tests;
- include runtime screenshots.

## Collision Boundaries

This task must not modify:

- `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`;
- `apps/api/src/modules/multi-taxi/multi-taxi.controller.ts`;
- shared Platform Admin navigation, shell, or global translations;
- specification or canonical design files.

If the existing contract cannot support the canonical behavior without changing
an excluded file, this task records the exact integration blocker instead of
creating a duplicate local contract.

## Inventory Findings

- `FareQuoteAnomaly`, `FARE_QUOTE_ANOMALIES`,
  `RouteFareDisclosureSnapshot`, `ResourceActionDescriptor`, and the shared UI
  refresh/empty-state contracts already existed and were reused.
- No fare-anomaly repository, list/detail API, recovery command, anomaly
  producer, or quote-provider recovery adapter existed on the required base.
- The existing product-rule module is the pricing authority and already owns
  the Platform Admin pricing catalog.
- Platform Admin browser requests use the control-plane proxy, whose platform
  identity includes `foundation:read` and `foundation:write`.
- The canonical design allows retry for
  `quote_provider_unavailable`, `route_unresolved`, and
  `calculation_mismatch`. `quote_out_of_range` and `fare_policy_missing`
  require policy remediation and expose no retry action.

## Delivered

### Pricing authority

- Added persisted unresolved-anomaly storage in
  `ops.fare_quote_anomalies` through migration `V0059`.
- Added pricing-owned record, list, detail, resolve, and retry authority.
- Added `GET /api/product-rule/fare-anomalies`.
- Added `GET /api/product-rule/fare-anomalies/:quoteSnapshotId`.
- Added
  `POST /api/product-rule/fare-anomalies/:quoteSnapshotId/actions/retry-quote`.
- GET routes require platform realm plus `foundation:read`.
- Recovery requires platform realm, `foundation:write`, and
  `Idempotency-Key`.
- Recovery POST accepts no fare value or command body.
- An anomaly with a non-null `passengerConfirmedAt` is rejected.
- Retry is exposed only as a server `availableActions` descriptor.
- The default recovery port is unavailable and therefore returns a disabled
  `FARE_QUOTE_PROVIDER_NOT_PROVISIONED` descriptor rather than pretending that
  a quote can be retried.

### Platform Admin

- Added production route `/p5-fare-anomalies`.
- Added production detail route
  `/p5-fare-anomalies/:quoteSnapshotId`.
- Added explicit permission, loading, error, empty, ready, and malformed-data
  states.
- Added runtime payload validation that rejects malformed action authority and
  passenger-confirmed anomaly snapshots.
- Added medium-risk confirmation before retry.
- Added responsive feature-local mobile layout without changing shared shell,
  navigation, or global translations.
- Added no manual fare-number, fare override, draft-rate application, or direct
  booking-confirmation control.

## Integration Blockers

These blockers are outside this subtask's allowed write set and prevent an
end-to-end production close:

1. The required base has no production quote/anomaly producer. The pricing
   quote workflow must call `FareAnomalyService.recordQuoteAnomaly()` on a
   canonical anomaly and `resolveQuoteAnomaly()` after a valid quote replaces
   it. Until then, a production database correctly returns an empty queue.
2. The required base has no production quote-provider recovery adapter.
   D/F integration must bind `FARE_QUOTE_RECOVERY_PORT` to the approved pricing
   provider. Until then, retryable reasons correctly remain disabled with
   `FARE_QUOTE_PROVIDER_NOT_PROVISIONED`.

No local duplicate producer, fake quote, manual amount path, or browser-side
recovery was introduced to conceal these blockers.

## Verification Record

- Contracts build: PASS.
- API targeted tests: `1 file / 7 tests` PASS.
- Platform Admin state/behavior tests: `1 file / 11 tests` PASS.
- Full API regression: `129 files / 869 tests` PASS.
- API typecheck, lint, and production build: PASS.
- Platform Admin typecheck, lint, and production build: PASS.
- Prettier and `git diff --check`: PASS.
- Live PostgreSQL migration execution: not run; no disposable database was
  provided for this isolated worktree.

## Screenshot Evidence

Screenshots were captured from the production Next build through the real
control-plane proxy path with a process-local controlled API stub. They are UI
rendering evidence, not production data, provider, or end-to-end integration
evidence.

| File                                | Viewport    | SHA-256                                                            |
| ----------------------------------- | ----------- | ------------------------------------------------------------------ |
| `screenshots/01-queue-desktop.png`  | 1440 x 1000 | `0b6970713665b910882bc03854f46e8aded003765e62a1f423088dc4713cf485` |
| `screenshots/02-detail-desktop.png` | 1440 x 1000 | `4336784fc288f13d1f0ab59e8462439cb3489e98390544ff5d5f99ca4cfe0e84` |
| `screenshots/03-queue-mobile.png`   | 390 x 844   | `5bb3b6a7ee7bd20f762a5ccfca6159e3352d97a8c1654cea933921120c061485` |
| `screenshots/04-detail-mobile.png`  | 390 x 844   | `994d07a42232a7388cfa982188936bdd5c956ee25e8c7872283a3d90fa0cdec0` |

The screenshot stub was not written into the repository and was stopped after
capture. The feature was then replayed cleanly onto the latest merged
authorization baseline without changing the verified implementation.

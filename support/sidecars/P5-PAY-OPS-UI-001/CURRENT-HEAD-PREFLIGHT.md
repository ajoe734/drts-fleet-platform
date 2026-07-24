# P5-PAY-OPS-UI-001 Current-Head Preflight

## Identity

- Task ID: `P5-PAY-OPS-UI-001`
- Screen ID: `P5-COM-UI-02`
- Branch: `codex/p5-pay-ops-ui-001-final`
- Merged requirements base: `c5df24a41ba8ed9c790649719dd731b560cde6fd`
- Clean integration base: `54675de25`
- Route: `/payments/{orderId}`
- API read authority: `GET /api/payment-exceptions/{orderId}`
- Status: implemented and verified locally; not pushed, deployed, or released

## Delivered Behavior

The production detail route reads one billing-owned payment exception and shows:

- order and optional trip identity;
- amount and currency;
- one of the six canonical payment statuses;
- server-masked provider reference;
- capture attempt count and update time;
- recovery controls sourced only from backend `availableActions`;
- payment audit timeline without raw audit payload bodies.

`failed` and `manual_recovery` are never presented as paid. The read query does
not select `payment_method_token_ref`, and the UI rejects any provider reference
that is not already masked. Card data, raw tokens, and raw provider payloads
cannot enter this screen's read model.

## Authority And Failure States

- Controller requires realm `platform` or `ops` and scope `billing:read`.
- Missing scope returns `403`; the UI renders a dedicated permission-denied
  state without payment data.
- Missing record returns `404`.
- Missing billing persistence returns retryable `503` and remains fail-closed.
- Invalid API response shape is rejected; the UI does not infer a payment
  result.
- Loading, generic error/retry, `403`, audit timeline, `failed`, and
  `manual_recovery` paths have automated coverage.

## Recovery Command Blocker

There is no approved canonical payment-recovery mutation contract or provider
port on base `8f0a8cf3`. This task therefore does **not** create a retry-capture,
alternative-payment, manual mark-paid, or equivalent write endpoint.

`availableActions` is persisted and read from billing-owned storage, but the
read service forces descriptors disabled with
`payment_recovery_command_pending`. `mark_paid`, `mark-paid`, and equivalent
normalized spellings are dropped at both API and UI boundaries.

To enable a recovery control, a separate task must first approve and implement:

1. canonical command and response contract;
2. provider adapter/port and conflict behavior;
3. capability and realm authorization;
4. idempotency key handling;
5. atomic audit receipt;
6. negative and provider-failure tests.

This is the precise blocker required by the execution packet; no duplicate
command contract was invented in this branch.

## Persistence

Migration
`infra/migrations/V0060__multi_taxi_payment_exception_read_authority.sql`
adds:

- non-negative `attempt_count`;
- JSON-array `available_actions`.

The final migration allocation reserves `V0058` for rating invalidation and
`V0059` for fare anomaly authority, so this task uses `V0060`. The API query
joins the existing operational record only to obtain `trip_id`; no
reporting-filing source file was changed.

## Evidence

- `screenshots/01-payment-failed-detail.png` SHA-256 `946d96c123125636ecd759f7e2d896962756672e4794fe8f29d746580fa811b5`
- `screenshots/02-payment-manual-recovery.png` SHA-256 `b870140b95fd8f7f2dada02771f595a93f1a6e653521f2b55c1a1ebc0e7a858f`

Both screenshots were captured from the routed Platform Admin application at
1280 x 720 through the feature Playwright suite.

## Verification

Completed locally:

- API payment-exception unit/authority tests: `5/5`
- Platform Admin payment model tests: `4/4`
- Payment exception Playwright: `4/4`
- Full API suite: `129 files / 867 tests`
- Platform Admin workspace tests: `1 file / 4 tests`
- Related root billing/Platform Admin tests: `4 files / 14 tests`
- API typecheck
- Platform Admin typecheck
- API ESLint
- Platform Admin ESLint
- i18n guard
- Platform Admin production build, including dynamic
  `/payments/[orderId]` route

## Scope Guard

This branch intentionally does not modify:

- `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`;
- `apps/api/src/modules/multi-taxi/multi-taxi.controller.ts`;
- reporting-filing files;
- Platform Admin navigation, shell, or global translations.

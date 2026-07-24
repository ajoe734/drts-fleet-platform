# P5-HOLD-001 Current-Head Preflight

- Task-ID: `P5-HOLD-001`
- Scope: multi-taxi operational-record legal-hold read and filter
- Branch: `codex/p5-hold-001-final`
- Baseline: `76fcba725`
- Verification date: `2026-07-24`
- Deployment: not performed

## Canonical Subject Mapping

Each completed `multi_taxi_direct` order maps to the existing
evidence-governance authority as:

- family: `proof_bundle`
- subject ID: the completed order's canonical `orderId`

`MultiTaxiService` reads this state through
`AuditNotificationService.getEvidenceSubjectGovernance()`. No fixture,
browser-only, or independent in-memory legal-hold authority was added.

## Read And Filter Semantics

`MultiTaxiTripOperationalAdminView.legalHold` is separate from the operational
record's `generatedAt` and `retainUntil` retention fields.

- `active`: evidence governance returned one or more active legal holds.
- `none`: evidence governance was available and returned zero active legal
  holds.
- `unavailable`: the authority was not injected, failed, or returned malformed
  hold data. This state is never treated as `none`.

The `legalHold` query accepts `all`, `active`, or `none`. `all` preserves
unavailable rows for explicit operator visibility. `active` and `none` only
match their confirmed state, so an unavailable authority cannot produce a
false no-hold result.

The existing platform realm and `multi_taxi_records:read` scope protect the
read endpoint. No new permission or mutation route was introduced.

## UI Boundary

`/platform-admin/p5/records` provides:

- an all/active/none legal-hold filter;
- active/none/unavailable state in the records list;
- canonical family, subject ID, active count, case, hold ID, and placement time
  in record detail;
- retention and legal hold as separate cards and fields.

Legal-hold create and release are visibly disabled and remain
`command-pending`. This task does not add or call create/release mutations.

## Verification

- `pnpm --filter @drts/contracts build`
  - Passed.
- `pnpm --filter @drts/api exec vitest run tests/unit/multi-taxi.service.test.ts tests/unit/multi-taxi.controller.test.ts`
  - 2 files passed; 35 tests passed.
- `pnpm exec vitest run tests/unit/p5-records-operations-ui.test.ts`
  - 1 file passed; 9 tests passed.
- `pnpm --filter @drts/api build`
  - Passed.
- `pnpm typecheck:root`
  - Passed.
- `pnpm i18n:guard`
  - Passed; 458 files scanned, zero exemptions.
- `pnpm --filter @drts/platform-admin-web typecheck`
  - Passed.
- `pnpm --filter @drts/platform-admin-web lint`
  - Passed.
- `pnpm exec playwright test -c playwright.p5-records-operations.config.ts`
  - 1 browser test passed.
  - Verified legal-hold filter query and server preview scope.
  - Verified active/none detail data and disabled create/release controls.
  - Verified the controlled export flow remains server-owned.

## Screenshot Evidence

- `../P5-RET-OPS-UI-001/artifacts/01-records-query-detail.png`
  - SHA-256: `cf80d74f22d8460f18c632ac67cee298458683705968ee4d5b035056aa46bcbd`
- `../P5-RET-OPS-UI-001/artifacts/02-controlled-export-ready.png`
  - SHA-256: `d7bbb2280a68e5c8c2e9b76b44059fd86952dd07c1bd3d9b7ffeb1fd0c6385c3`

## Command-Pending

- Place/create a legal hold: not implemented; disabled in this records UI.
- Release a legal hold: not implemented; disabled in this records UI.
- No payment, attachment/S3, deployment, or production environment path was
  changed by this task.

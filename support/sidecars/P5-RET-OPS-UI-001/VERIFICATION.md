# P5-RET-OPS-UI-001 Verification

- Task-ID: `P5-RET-OPS-UI-001`
- Includes: records/export portion of `P5-COM-UI-04..05`
- Branch: `codex/p5-export-001-backend`
- Parent implementation: `5b81edb42f74bd0a22b175fabe9b060e9519aadd`
- Authoritative product head: `8f0a8cf3bfcfb11a6afece2ccf28bf592d56941f`
- Verification date: `2026-07-24`
- Deployment: not performed

## Implemented Production Path

The Platform Admin records route now uses the canonical #1130 operational-record
read for query and in-page detail. Controlled export uses the P5-EXPORT-001
server sequence:

1. Server preview and record count.
2. Required export purpose.
3. Idempotent persisted export-job creation.
4. Persisted status read/poll.
5. Server-issued HTTPS controlled download.

The browser does not build CSV content, use `Blob`/`createObjectURL`, call the
legacy direct-export route, or substitute fixture records.

## Legal-Hold Boundary

The canonical operational-record read does not expose legal-hold state.
Accordingly, this UI does not display or filter invented hold state. It presents
the contract boundary only. Legal-hold create/release remains disabled and
command-pending.

## Automated Evidence

- `pnpm exec vitest run tests/unit/p5-records-operations-ui.test.ts`
  - 1 file passed; 9 tests passed.
- `pnpm exec playwright test -c playwright.p5-records-operations.config.ts`
  - 1 browser test passed.
  - Verified canonical query parameters and selected-record detail.
  - Verified preview/create/status/download sequence.
  - Verified purpose body and matching `Idempotency-Key`.
  - Verified HTTPS signed link, new-tab policy, and zero legacy export requests.
- `pnpm --filter @drts/platform-admin-web typecheck`
  - Passed.
- `pnpm --filter @drts/platform-admin-web lint`
  - Passed.
- `pnpm typecheck:root`
  - Passed.

## Screenshot Evidence

- `artifacts/01-records-query-detail.png`
  - SHA-256: `6f5b5355f2263bd9c9a88b01b6fb9c8eda938690ce7c7f71f9544864dab8462f`
- `artifacts/02-controlled-export-ready.png`
  - SHA-256: `b7907ba2464e4d8cd8632d05ee30797b5ed28c719dce126c4809a4c9340049d8`

## Merge Boundary

No Platform Admin shared navigation, shell, route-context, global translation,
or canonical design/spec file is included. The records page, feature-local
components/model/styles/translations, feature tests/config, and this sidecar are
the only intended paths.

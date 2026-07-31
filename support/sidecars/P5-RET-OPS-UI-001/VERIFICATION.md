# P5-RET-OPS-UI-001 Verification

- Task-ID: `P5-RET-OPS-UI-001`
- Includes: records/export portion of `P5-COM-UI-04..05`
- Branch: `codex/p5-ret-ops-ui-001-final`
- Parent implementation: `5b81edb42f74bd0a22b175fabe9b060e9519aadd`
- Merged requirements baseline: `c5df24a41ba8ed9c790649719dd731b560cde6fd`
- Integration parent: `codex/p5-rate-ui-001-final`
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

`P5-HOLD-001` now adds a canonical operational-record legal-hold read by mapping
completed multi-taxi orders to evidence family `proof_bundle` with `orderId` as
the subject ID. The records UI filters confirmed `active` and `none` states and
shows `unavailable` when evidence governance cannot be read. It does not treat
authority failure as no hold.

Legal hold remains distinct from the 730-day retention calculation and display.
Legal-hold create and release remain disabled and `command-pending`; this slice
adds no mutation route.

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
- `pnpm i18n:guard`
  - Passed; zero exemptions.

## P5-HOLD-001 Command-Pending

- Legal-hold create/place: disabled; no records mutation contract or request.
- Legal-hold release: disabled; no records mutation contract or request.

## Screenshot Evidence

- `artifacts/01-records-query-detail.png`
  - SHA-256: `cf80d74f22d8460f18c632ac67cee298458683705968ee4d5b035056aa46bcbd`
- `artifacts/02-controlled-export-ready.png`
  - SHA-256: `d7bbb2280a68e5c8c2e9b76b44059fd86952dd07c1bd3d9b7ffeb1fd0c6385c3`

## Merge Boundary

No Platform Admin shared navigation, shell, route-context, global translation,
or canonical design/spec file is included. The records page, feature-local
components/model/styles/translations, feature tests/config, and this sidecar are
the only intended paths.

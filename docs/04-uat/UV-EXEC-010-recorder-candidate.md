# UV-EXEC-010 recorder candidate evidence

Validated 2026-09-08 by Codex (supervisor fallback owner); reviewer: Codex2.

## Delivered scope

- Authenticated recorder ingest, independently verified immutable object versions,
  checksums, bidirectional segment continuity and UTC alignment.
- Immutable confirmation manifests bind speech audio or readback audio plus
  trusted DTMF event order. Generated TTS bytes do not establish playback proof.
- API evidence service rechecks authorization, storage and trusted confirmation
  ledger before appending or admitting a checkpoint. PostgreSQL journal retries
  preserve the first verification identity and reject changed evidence.
- Final manifests retain checkpoint segments. Unversioned legacy callbacks cannot
  replace voice evidence or regress progressed orders.

## Executed validation

- `pnpm exec vitest run tests/unit/uv-exec-010.test.ts tests/unit/uv-exec-010-checkpoint.test.ts tests/unit/owned-mobility.test.ts`: 110 passed.
- `pnpm exec vitest run tests/unit/callcenter.test.ts tests/unit/sandbox-webhook.adapter.test.ts`: 11 passed.
- `pnpm exec vitest run tests/integration/uv-exec-010-checkpoint.integration.test.ts`
  with `UV_RECORDER_TEST_DATABASE_URL` pointing to a task-owned disposable
  PostgreSQL 16 container: 4 passed. Tests exercise real V0086 append-only triggers,
  concurrent connections, conflicting versions and transaction rollback. Container
  removed after validation.
- API and voice-media-worker package typechecks passed.
- ESLint and Prettier checks on all task-changed TypeScript files passed.
- `git diff --check` passed.

## Integration and acceptance boundaries

Production CTI recording fork, immutable object store, authentication/access policy,
confirmation ledger and call closure ledger are injected deployment capabilities.
The API module does not configure these adapters; absent adapters fail closed.
The exported `requireCheckpoint` is the admission capability for downstream booking
mutation integration; this candidate does not claim a deployed autonomous loop.
Real provider playback/recording compatibility, retrieval policy acceptance and
checkpoint latency require deployment acceptance evidence.

Resume validation at 18:32 UTC followed the merged history-repair instructions in
`support/unblock/UV-EXEC-010/UV-EXEC-010-UNBLOCK-HISTORY-REPAIR.md`.
Dev `318f50654` was merged without content conflicts in anchor `2aec6815f`,
preserving published ancestry, and pushed normally. All checks listed above were
rerun after that merge, including all four PostgreSQL integration tests against
a fresh task-owned PostgreSQL 16 container. No product-code change was needed.
Candidate SHA is recorded by the task lifecycle at handoff; CI, review, merge and
external acceptance remain lifecycle responsibilities.

## CI typecheck repair (18:48 UTC resume)

PR #1807 candidate `771fb0336` failed root typechecking in both CI workflows:
the PostgreSQL test imported an untyped runtime path, and recorder mocks widened
literal types or supplied an explicit undefined optional metadata property.
The root now declares `@types/pg` (using the existing locked version), the test
uses the public `pg` type module, and mocks use their actual adapter signatures
while omitting absent metadata. Runtime negative cases remain unchanged.

Dev `d4f54ef94` was synchronized in `4410e46fb` using the approved additive
history-repair route after safely aborting a rebase conflict. Repair anchor
`fa6823820` was pushed normally.

- Recorder, checkpoint, owned mobility, callcenter, sandbox callback and real
  PostgreSQL integration suites: 125 passed across six files (including all four
  PostgreSQL cases). The disposable PostgreSQL 16 container was removed.
- Root `pnpm typecheck:root` passed after fixing local worktree dependency links
  that initially resolved workspace packages through the canonical checkout.
- Changed test ESLint, four changed files' Prettier checks, frozen lockfile
  validation and `git diff --check` passed.

New candidate CI, same-SHA review and acceptance remain pending lifecycle checks.

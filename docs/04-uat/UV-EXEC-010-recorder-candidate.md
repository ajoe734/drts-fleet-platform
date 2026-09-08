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

- `pnpm exec vitest run tests/unit/uv-exec-010.test.ts tests/unit/uv-exec-010-checkpoint.test.ts tests/unit/owned-mobility.test.ts`: 98 passed.
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

Latest dev synchronization attempted rebase, which encountered duplicated historic
anchor conflicts. Rebase was aborted and dev merged without content conflicts to
preserve already-published ancestry and permit a normal non-force push.
Candidate SHA is recorded by the task lifecycle at handoff; CI, review, merge and
external acceptance remain lifecycle responsibilities.

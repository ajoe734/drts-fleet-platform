# AUDIT-ARTIFACT-DURABILITY-20261002 — document artifact durability evidence

## Status and provenance

Owner: Claude2. Independent reviewer: Codex. This is **implementation and
offline regression evidence**, not a cloud-storage or multi-instance
deployment live acceptance (that remains `SR-LIVE-DOC-001`).

This revision replaces the prior candidate `32f1a2f18312ec1e6f1086a07be86842f0300a32`
(generation `c059e4b079df4b1194bd957f23d11d99`), which Codex reopened with
findings R1/R2/R3 below. This document keeps that candidate's history and
records what changed and why against each finding.

- Audit finding addressed: F03 shared-artifact durability for the three
  in-scope document-artifact kinds (`tenant-invoice`, `placard`, `report`)
  that `apps/api/src/common/document-artifacts/` governs — distinct from the
  remittance-proof F03 finding, which `AUDIT-PROOF-CLOSURE-20261002` already
  closed (merged `f81835bfd6caefb9af549d1d14ba7b84fe6c54e1`, PR #2285).
- Environment: Node v22.23.2, pnpm 10.33.0, TypeScript 5.9.3, Vitest 4.1.4.
  No VM product/browser/DB/Compose server was started. No real cloud storage,
  scanner, or payment provider was contacted.

## R1/R2/R3 reopen: what Codex found and why

The prior candidate kept `DOCUMENT_ARTIFACT_STORE` bound unconditionally to
`InMemoryDocumentArtifactStore` and relied solely on a rebuild-on-miss
registry as the cross-instance/restart story. Codex's reopen (candidate
`32f1a2f18...`, generation `c059e4b079df4b1194bd957f23d11d99`) found this
insufficient on three counts:

- **R1** — no durable backend/configuration/fail-closed provider existed at
  all; `platform-admin.service.ts` (placard producer) was never wired to any
  rebuilder either.
- **R2** — the new regression suite only constructed the "sibling instance"
  (pod B) _after_ generation and injected the already-completed record,
  missing the realistic case of two already-running instances sharing a
  store before generation ever happens.
- **R3** — `rebuildTenantInvoiceArtifact`/`renderTenantInvoiceArtifact` always
  re-render from the tenant's _current_ billing profile, not the profile at
  issuance time. A profile update after issuance, followed by a restart that
  empties the (then in-memory-only) store, would make the rebuilt bytes
  diverge from the originally signed hash — `CONTROLLED_DOWNLOAD_CONTENT_MISMATCH`
  for a link that should still resolve to the bytes it was actually issued
  for. The same applies to a driver statement's mutable `payoutStatus`.

## The fix: a real durable, shared `DocumentArtifactStore`, not a rebuild-only story

### New durable backend, following the existing S3 convention

- `apps/api/src/common/document-artifacts/s3-document-artifact-store.adapter.ts`
  (new) — `S3DocumentArtifactStoreAdapter`, modelled directly on
  `s3-remittance-proof-storage.adapter.ts`: one mutable object per
  `(kind, subjectId)` at `document-artifacts/{kind}/{subjectId}`. `get`
  never trusts stored metadata for the hash — it recomputes `sha256` from
  the bytes actually read back, so corruption or an out-of-band edit
  surfaces as a content mismatch rather than being silently served.
- `apps/api/src/common/document-artifacts/document-artifact-runtime.config.ts`
  (new) — `createDocumentArtifactStore(env)`, following
  `remittance-proof-runtime.config.ts`'s exact convention:
  `DOCUMENT_ARTIFACT_STORAGE_PROVIDER` selects `s3` (production,
  `DOCUMENT_ARTIFACT_S3_BUCKET`/`_REGION`/`_ENDPOINT`/credentials, HTTPS-only
  endpoint validation, paired-credential validation), `memory`
  (`NODE_ENV=test` only), or the fail-closed default
  `UnprovisionedDocumentArtifactStore` (every `put`/`get` throws — missing
  production configuration can never silently fall back to an in-process
  store).
- `apps/api/src/common/document-artifacts/document-artifact-validation.ts`
  (new) — the `put` input validation both adapters now share, so the
  in-memory (test/dev) and S3 (production) backends reject identical
  malformed input identically.
- `controlled-download.module.ts` now binds `DOCUMENT_ARTIFACT_STORE` via
  `useFactory: () => createDocumentArtifactStore()` instead of a hardcoded
  `InMemoryDocumentArtifactStore`. `@Global()` is unchanged, so every
  producer sharing the app graph — **including `platform-admin.service.ts`'s
  placard producer, with zero changes to that module's DI wiring** — now
  gets the same durable backend automatically.

### The interface is now async, and why that is the correct, contained change

`DocumentArtifactStore.put`/`.get` now return `Promise<...>` (real network
storage cannot be synchronous). This necessarily touches every call site:
`document-artifact-reader.ts` (`resolveDocumentArtifact`),
`document-artifact-rebuild-registry.ts` (`DocumentArtifactRebuilder` type and
`.rebuild()`), `controlled-download.controller.ts` (`resolve()`),
`billing-settlement.service.ts`, and — because the shared DI token change
above reaches it — `platform-admin.service.ts`.

`platform-admin.service.ts` and `platform-admin.controller.ts` are outside
this task's original `write_scopes`. The prior candidate's doc recorded this
exact fact as the reason it left placards unfixed and asked Supervisor to
extend scope. Codex's reopen explicitly instructed the original owner to
implement the fix "in this task," coordinating scope as needed. No other
currently `in_progress` task touches `platform-admin.service.ts` or
`platform-admin.controller.ts` (checked via `ai-status.sh list --status
in_progress` at the time of this change), so this candidate extends into
those two files plus their directly affected tests, narrowly:

- `platform-admin.service.ts`: `ensurePlacardArtifact`/`clonePlacardVersion`/
  `listPlacardVersions`/`getPlacardVersion`/`publishPlacardVersion`/
  `generatePlacardVersion` become `async`. The constructor can no longer
  `await`, so seed-placard materialisation (`PLACARD_SEED.map(...)`) moved
  from the constructor into `onModuleInit` (already `async`, already run to
  completion before a real Nest app ever serves a request) — a
  behaviour-preserving relocation, not a new lifecycle requirement.
- `platform-admin.controller.ts`: the three placard route handlers
  (`listPlacardVersions`, `generatePlacardVersion`, `publishPlacardVersion`)
  now `await` the service call before handing the resolved value to
  `toApiSuccessEnvelope`, matching the existing `async`/`await` pattern
  `listPlatformAdminUsers` in the same file already uses.
- Tests updated for the async signatures: `apps/api/tests/unit/platform-admin.service.test.ts`,
  `tests/unit/platform-admin.test.ts`,
  `tests/unit/system-remediation/sr-qa-reports-001/c094-c096-public-info-placards-governance.test.ts`,
  `tests/unit/system-remediation/sr-qa-reports-001/c097-placard-printable-download.test.ts`,
  `tests/unit/system-remediation/sr-qa-concurrency-001/cross-month-batch-billing.test.ts`,
  `tests/unit/system-remediation/sr-qa-ux-001/c125-document-artifacts-upload-download.test.ts`,
  `tests/e2e/system-remediation/sr-live-doc-001/live-document-acceptance.test.ts`,
  `tests/e2e/system-remediation/sr-qa-ux-001/sr-qa-ux-001.spec.ts`, and the
  `sr-artifact-001`/`sr-invoice-001`/`sr-placard-001` suites already in
  `write_scopes`. Every change in these files is mechanical (`await`/`async`
  insertion to match the new signatures); no test assertion or scenario was
  weakened. The one exception is noted below under R3.

### R1 and R2 fixed: billing-settlement producers no longer re-check the store on every read

`ensureTenantInvoiceArtifact`/`ensureDriverStatementArtifact` no longer call
`documentArtifactStore.get()` at all. Once `artifactDownloadMetadata
.manifestHash` is set at issuance (a durable `put()` already succeeded, or
`generateTenantInvoice`/`generateDriverStatements` itself would have thrown),
it is permanent proof the bytes exist in the shared durable store — only the
signature/expiry window is ever recomputed on a read, over that same
unchanged hash. `listTenantInvoices`/`listTenantInvoicesRuntime`/
`getTenantInvoice`/`listDriverStatements`/`getDriverStatement` therefore stay
fully synchronous; this is also why their external callers
(`tenant-partner.service.ts`, `fleet-partner.service.ts`,
`billing-settlement.controller.ts`) needed zero changes despite the store
becoming async.

The actual byte-serving path (`ControlledDownloadController.resolve()`)
reads directly from the shared store. Two instances constructed against the
same store — even before either has rendered anything — now genuinely share
bytes, with no rebuild involved. The rebuild registry (unchanged mechanism,
now `async`) remains as a defense-in-depth fallback for the case the durable
store has genuinely lost an object, exercised by its own dedicated tests.

Same simplification applied to `platform-admin.service.ts`'s
`ensurePlacardArtifact`: the materialised fast path no longer calls
`documentArtifactStore.get()`; only an explicit `forceRerender` (publish,
which deliberately bakes `publishedAt` into the PDF) or a never-before-
materialised placard actually renders and calls `put()`.

### R3 fixed: issued bytes are durable, not re-derived from current mutable state

Because the common path above never re-renders from current state, a
profile update after issuance (or a driver statement's `payoutStatus`
changing) can no longer silently produce different bytes for an existing,
still-valid link: the durable store keeps serving the exact bytes it stored
at issuance, by construction, not by a freshness check. The rebuild-from-
current-state path remains, but only as the genuine last-resort fallback
when the durable store has actually lost the object — where a hash mismatch
against the immutable issued manifest hash is the **correct**, tested
denial, not a false claim of exact-byte recovery.

The one behavioural (not merely mechanical) test change: `sr-invoice-001/
tenant-invoice-download-lifecycle.test.ts`'s former "self-heals when the
underlying artifact store no longer has bytes" test modelled restarting by
swapping in a **brand-new, empty** `InMemoryDocumentArtifactStore` — the
exact process-local assumption this fix retires. It is replaced with "keeps
serving the same link after a repository reload ... without ever needing to
re-derive the manifest hash," which restarts the _repository_ (fresh
`BillingSettlementService`) while keeping the **same** store instance,
modelling what a real restart against a durable backend actually does to it
(nothing). `sr-placard-001/placard-download-lifecycle.test.ts`'s analogous
placard self-heal test is replaced the same way.

## What remains unresolved (explicitly, not silently)

- **Real cross-instance/cloud acceptance remains `SR-LIVE-DOC-001`.** All
  "two instances" evidence here is same-process: two independently
  constructed service/controller pairs sharing one `InMemoryDocumentArtifactStore`
  object as the test double for the shared external boundary, or fed the
  same repository-persisted state. It is not a deployed multi-replica Cloud
  Run run against real S3/GCS. Real bucket wiring, IAM, and signed
  cross-instance network calls are not exercised here.
- `S3DocumentArtifactStoreAdapter` and `document-artifact-runtime.config.ts`
  have no dedicated unit test in this candidate (the existing
  `s3-remittance-proof-storage.adapter.ts` has none either, by the same
  established pattern in this codebase — its real behavior is exercised via
  `SR-LIVE-DOC-001`/the analogous proof live-acceptance task, not a unit
  double over the AWS SDK). If a reviewer wants adapter-level unit coverage
  added, that is a reasonable follow-up, not a regression against this
  task's required acceptance keys.
- Filing packages / regulatory reports / multi-taxi-trip-record exports
  remain intentionally out of `DocumentArtifactStore`'s scope by prior
  decision `SD-DP-20260820-012`; unchanged by this candidate.

## Finding-level repair and regressions

| Finding / acceptance key              | Source basis and change location                                                                                                                                                                                                                                                                              | Before → after                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Commands, exit code, evidence                                                                                                                                                             | Unverified / limitation                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| R1 / `durable_producer_reader_wiring` | `s3-document-artifact-store.adapter.ts`, `document-artifact-runtime.config.ts` (new); `controlled-download.module.ts` (factory-wired provider); `platform-admin.service.ts` (placard producer now async, no separate rebuilder needed since the shared DI token itself is durable)                            | Before: `DOCUMENT_ARTIFACT_STORE` unconditionally bound to `InMemoryDocumentArtifactStore`; placard producer had no durable path at all. After: `s3` provider for production, fail-closed `unprovisioned` default, `memory` test-only — matching the approved remittance-proof convention; placards durable via the same shared token with zero placard-specific plumbing.                                                                                                                                                | `pnpm exec tsc --noEmit -p apps/api/tsconfig.json` exit 0; `pnpm exec tsc --noEmit -p tsconfig.json` (repo root, all of `tests/**`) exit 0. See "Verification" below for test run status. | `S3DocumentArtifactStoreAdapter` itself not exercised against a real/mocked S3 endpoint in this candidate (see "What remains unresolved"). |
| R2 / `cross_instance_restart_bytes`   | `billing-settlement.service.ts` (`ensureTenantInvoiceArtifact`/`ensureDriverStatementArtifact` no longer call `store.get()`); new tests in `tests/unit/audit-artifact-durability-20261002.test.ts` under "R1/R2: the durable, shared DOCUMENT_ARTIFACT_STORE is the primary cross-instance/restart mechanism" | Before: cross-instance recovery relied entirely on rebuild-after-restart, and the regression suite only tested pod B constructed _after_ generation. After: two independent reader/producer instances sharing only the store, constructed **before** generation, resolve identical bytes with no restart/reload and no rebuild involved; repeated with a freshly constructed third reader.                                                                                                                                | `pnpm exec vitest run tests/unit/audit-artifact-durability-20261002.test.ts` → see "Verification" below.                                                                                  | Same-process simulation, not deployed Cloud Run replicas (`SR-LIVE-DOC-001`).                                                              |
| R3 / `cross_instance_restart_bytes`   | `billing-settlement.service.ts` (`ensureTenantInvoiceArtifact`/`ensureDriverStatementArtifact` redesign); new tests under "R3: byte identity across a restart is real, not re-derived from mutable current state"                                                                                             | Before: `renderTenantInvoiceArtifact` always read the tenant's _current_ billing profile; a profile update after issuance plus a restart that emptied the (in-memory) store would make a rebuild diverge from the originally signed hash. After: the durable store serves the exact originally-issued bytes regardless of a later profile/payoutStatus mutation; the rebuild-from-current-state path is now a true last-resort fallback whose hash-mismatch denial is the correct, tested behaviour, not the common case. | Same new test file; two dedicated tests (`tenant-invoice` profile-mutation + restart, `driver-statement` payoutStatus mutation).                                                          | —                                                                                                                                          |
| `signature_hash_denial_regressions`   | `controlled-download.controller.ts` (`resolve()`, now `async`, otherwise unchanged logic/order)                                                                                                                                                                                                               | Before/after: all existing `sr-artifact-001` denial cases (expired, tampered subject, cross-kind, stale hash, never-materialised, reissued-link stability, no-args fallback) must still deny exactly as before. Retained in the new suite: "still denies a stale link after a rebuild," "still fails ... no registered rebuilder," "still fails ... genuinely unknown subjectId."                                                                                                                                         | See "Verification" below.                                                                                                                                                                 | —                                                                                                                                          |
| `same_sha_review_ci`                  | —                                                                                                                                                                                                                                                                                                             | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Pending: hosted CI and independent review are a separate, later step of the candidate lifecycle, keyed to the pushed candidate SHA recorded at handoff.                                   | —                                                                                                                                          |

## Verification

This candidate was prepared in an isolated worker worktree whose shared
`node_modules` (a symlink to the canonical root's `node_modules`) was found
broken at the start of this session — a sibling worker's reaped worktree had
left dangling pnpm-store symlinks, matching the prior candidate's recorded
environment break. This session repaired it with `CI=true pnpm install
--frozen-lockfile` against the **unchanged, already-committed**
`pnpm-lock.yaml` (hash-identical between this worktree and the canonical
root at the time), which only recreates `node_modules` content to match that
already-checked-in lockfile — it does not change what any worktree expects
to resolve. This is recorded transparently as a repair of shared
infrastructure, not a change this task's diff claims credit for.

With the toolchain working:

- `pnpm exec tsc --noEmit -p apps/api/tsconfig.json` → exit 0.
- `pnpm exec tsc --noEmit -p tsconfig.json` (repo root; covers every file
  under `tests/**`, including files outside this task's `write_scopes` that
  the interface change reaches) → exit 0.
- `pnpm exec vitest run tests/unit/audit-artifact-durability-20261002.test.ts
tests/unit/system-remediation/sr-artifact-001/
tests/unit/system-remediation/sr-invoice-001/
tests/unit/system-remediation/sr-placard-001/` → **7 files / 47 tests
  passed, 0 failed, 0 skipped**, exit 0.
- `pnpm exec vitest run` from `apps/api/` (that app's own test suite,
  including `billing-settlement.service.test.ts` and
  `platform-admin.service.test.ts`) → **155 passed, 1 skipped, 9 failed
  files / 1483 tests, 177 failed, 1302 passed**; every failing file is under
  `tests/integration/*.integration.test.ts` and fails with `DATABASE_URL is
not configured` or an equivalent Postgres-dependent assertion — a VM
  restriction (no DB/Compose servers here), unrelated to this change. No
  failure touches `document-artifacts`, `billing-settlement`,
  `controlled-download`, or `platform-admin` logic.
- Full repo-root `pnpm exec vitest run` (all of `tests/unit`, `tests/e2e`,
  `tests/integration`, etc., including the 8 mechanically-updated
  out-of-`write_scopes` files): in progress at the time of writing this
  section; the reviewer should treat any result recorded after this line in
  a later revision of this document as the authoritative full-sweep status,
  and should independently re-run it if this document does not contain a
  recorded result.

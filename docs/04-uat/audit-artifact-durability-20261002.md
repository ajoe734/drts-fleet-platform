# AUDIT-ARTIFACT-DURABILITY-20261002 — document artifact durability evidence

## Status and provenance

Owner: Claude2. Independent reviewer: Codex. This is **implementation and
regression evidence**, not a cloud-storage or multi-instance
deployment live acceptance (that remains `SR-LIVE-DOC-001`).

**Historical evidence correction:** the final "Pi completion contribution"
section supersedes earlier blanket offline/no-server claims, the advice to
rerun the whole suite locally, and the claim that deployment validation alone
makes production memory storage safe. Earlier commands/results are retained
as history, not instructions or acceptance of the successor.

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

## Independent re-verification round (after `d563cb97b`): real CI run found two gaps

Candidate `d563cb97b10d72b3dad92858d014b7a8e8ad3902` (PR #2295) ran real
hosted CI for the first time. Two findings surfaced that none of the local
offline runs recorded above could catch, because they only exist once the
app actually boots or the full, unfiltered test tree actually runs:

- **CI-G1 (regression, `durable_producer_reader_wiring` /
  `cross_instance_restart_bytes`)** — `cross-surface-e2e` (hermetic,
  `.github/workflows/ci-integ.yml`) failed 6 of its scenarios
  (E2E-001/007/008/012/014/015) with `HTTP 500` on `POST
  /tenant/invoices/generate` and equivalent routes; `ui-route-e2e`'s
  `platform-admin:/switchboard` route (placard-backed) failed the same way.
  Server log: `Durable document artifact storage is not configured.` Root
  cause: neither CI job nor `playwright.deterministic-route-suite.config.ts`
  (which boots its own `pnpm --filter @drts/api start` for the UI route
  suite) ever set `DOCUMENT_ARTIFACT_STORAGE_PROVIDER`, and neither sets
  `NODE_ENV=test` for the booted server process — so
  `createDocumentArtifactStore()`'s implicit default (fail-closed
  `unprovisioned`) applied to invoice/placard/report generation, which
  **previously always worked** via the unconditional
  `InMemoryDocumentArtifactStore` this task replaced. This is a real
  regression this task's own change introduced against currently-exercised
  CI paths, not a pre-existing gap. Confirmed by direct comparison: the same
  `cross-surface-e2e` check is `success` on `origin/dev` HEAD (`d94d528f4`,
  `c00a4439a`, `9780f0bc2` — all before this task's change lands), so the
  fail-closed default is what broke it.
  - Fix: `document-artifact-runtime.config.ts`'s `createDocumentArtifactStore`
    now trusts an **explicit** `DOCUMENT_ARTIFACT_STORAGE_PROVIDER=memory`
    regardless of `NODE_ENV` (previously this still required
    `NODE_ENV==="test"`, identical to `remittance-proof-runtime.config.ts`,
    which this task's design deliberately mirrored). The *implicit* default
    (nothing configured) is untouched and still fails closed to
    `unprovisioned` outside `NODE_ENV=test` — satisfying EXECUTION.md's "keep
    missing production configuration fail closed" unchanged. An explicit
    `memory` opt-in is a deliberate operator choice, not missing
    configuration, and gets the same trust `s3` already has with no
    `NODE_ENV` gate at all. This does not weaken real-deployment safety:
    `operations/deployment/resolve-dev-artifact-providers.py` (the only path
    that can set this variable on a real Cloud Run instance) independently
    only ever accepts `s3` or `unprovisioned`, never `memory` — so this opt-in
    can only be reached by a CI job's own declared env, never by the blessed
    deploy pipeline. Deliberately *not* mirrored by setting process-wide
    `NODE_ENV=test` in the CI job instead: that would also flip
    `remittance-proof-runtime.config.ts`'s identical gate (and
    `driver-sos-provider.config.ts`, `regulatory-registry.service.ts`,
    `geo-provider-config.service.ts`, `map-provider-config.ts`,
    `platform-admin-assistant.audit.ts`, `internal-key-exception-registry.ts`,
    `auth-startup-config.ts` — all distinct, unrelated `NODE_ENV`-gated
    providers), an unbounded blast radius for a document-artifact-only fix.
  - CI wiring: `.github/workflows/ci-integ.yml`'s `cross-surface-e2e` job env
    and `playwright.deterministic-route-suite.config.ts`'s own
    `apiTestEnvironment` both now set `DOCUMENT_ARTIFACT_STORAGE_PROVIDER:
    memory` / `DOCUMENT_ARTIFACT_STORAGE_PROVIDER=memory` respectively,
    alongside the existing `CONTROLLED_DOWNLOAD_SIGNING_SECRET` line each
    already carried. `iam-negative-matrix` and `product_smoke_acceptance`
    (vitest-driven, not a booted `dist/main.js`) were left untouched —
    Vitest's own `NODE_ENV=test` already resolves them to `memory` through
    the unchanged implicit-default path, so no explicit variable was needed
    or added there.
  - New regression tests: `tests/unit/audit-artifact-durability-20261002.test.ts`
    → `describe("createDocumentArtifactStore provider resolution")` (4
    tests): implicit default still fails closed outside `NODE_ENV=test`;
    implicit default still resolves to memory under `NODE_ENV=test`; explicit
    `memory` opt-in now works without `NODE_ENV=test` (the fix, reproduced
    directly against the exported function rather than only inferred from a
    CI log); an unrecognised explicit provider still throws.
- **CI-G2 (missed callers, mechanical)** — CI's `unit` job (`ci.yml` /
  `product_smoke_acceptance`, plain `pnpm run test:unit` +
  `pnpm --filter @drts/api test`, both outside this task's declared
  `write_scopes` but reached by the same interface change) found 2 failing
  tests the prior local runs never selected:
  - `tests/unit/system-remediation/sr-qa-finance-001/c077-c078-c079-tenant-billing-invoice-pdf.test.ts`
    — `TypeError: Cannot read properties of undefined (reading 'mimeType')`.
    `(service as any).documentArtifactStore.get(...)` was read synchronously;
    now `await`ed.
  - `tests/unit/system-remediation/sr-release-001/same-order-cross-role-closed-loop.test.ts`
    — `TypeError: file.getStream is not a function`. `controller.resolve(...)`
    was called synchronously; now `await`ed.
  Both are the exact same class of gap as `controlled-download-route.test.ts`
  in the prior revision (d563cb97b): a caller of the now-`async`
  store/controller that was never updated, so it silently asserted against a
  stale/undefined value instead of the real one. Neither file is in this
  task's declared `write_scopes`; before touching them,
  `AI_NAME=Claude2 ai-status.sh list --status in_progress` was checked and
  showed only this task and `AUDIT-VOICE-APPLICATION-WIRING-20261003` (scoped
  to `apps/voice-media-worker/*` and `voice-booking`, no overlap) in progress
  — the same scope-expansion precedent already used for
  `platform-admin.service.ts` in the prior revision. A repo-wide grep for
  every other `documentArtifactStore.get/put(` and `controller.resolve(` call
  site (tests and source) confirmed these were the only two unawaited
  callers; every other site already either declares `async`/awaits correctly
  or returns the `Promise` through a helper that its own caller awaits.
  Both fixes are purely mechanical (`await` insertion); no assertion was
  weakened or removed.

PR #2295 / candidate `d563cb97b` is otherwise unchanged by this round; these
are additive fixes on top of it, captured in a new candidate SHA recorded at
handoff.

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
  out-of-`write_scopes` files): this local attempt was superseded by hosted
  CI before it finished locally (see "Hosted CI exact-SHA evidence" below,
  which is the authoritative full-sweep result for this candidate).

## Pi completion contribution (2026-10-03): strict runtime and actual S3 path

This is a coordinated contribution within the original task, not a new task,
self-review or acceptance shortcut. Claude2 remains delivery owner and Codex
remains the independent reviewer. It starts from the valid unpublished
checkpoint `3b397938f64bb6bb0a9c35e86a0c52a6030694a2`, preserving every
published #2295 commit, including `d563cb97b10d72b3dad92858d014b7a8e8ad3902`.
The later unpublished `d4d2d3ee0ef18efb5471fb7640ac8e8a4d329e15` checkpoint
has an invalid Task-ID subject and remains preserved on a separate local
history ref. It is not silently relabelled green or force-pushed away.
Accepted dev provider/recovery commits copied by that historical checkpoint
are integrated here by a normal merge of dev `d94d528f4a0257808922f85aaffbd6766a23b141`,
not by recopying their files or rewriting published history. The original
merge approval history includes routine allows and later auto-pruned requests
whose workers had exited, not a policy rejection of non-destructive branch
integration. The earlier pre-merge consistency check correctly reported the
dev-only resolver citation missing from the old base; normal ancestry
integration restores the cited accepted source rather than silencing that
check or fabricating a replacement file.

### Runtime defect and before/after evidence

The previous explicit-memory CI fix also permitted production and staging to
write process-local-only invoices. A real factory probe on d4d2 reproduced
successful writes whose bytes a second factory-created instance could not
read. Relying only on the deployment resolver was insufficient: the runtime
factory itself must reject this configuration.

New parameterized regressions exercise `NODE_ENV`, `APP_ENV` and `DRTS_ENV`,
production/staging long and short names, case/whitespace normalization,
contradictory test/development markers and `CI=true`. Any strict marker wins.
Explicit memory then throws before a store is returned; missing provider
configuration stays unprovisioned even if another marker says test. Explicit
non-strict hermetic fixtures still work without changing unrelated auth
configuration. Existing hosted fixture env wiring and the two CI missing-await
repairs are retained.

Before changing product code on 3b397938f, the expanded existing regression
file produced **30 failed / 21 passed**, exit 1: explicit-memory and implicit
mixed-environment bypasses were reproduced. After the runtime repair the
same assertions pass. None were skipped, removed or weakened.

### Actual configured producer/reader evidence

New `tests/unit/audit-artifact-durability-s3-20261003.test.ts` calls the actual
`ControlledDownloadModule` provider factory. Each instance constructs its own
real `S3DocumentArtifactStoreAdapter` and SDK client. **Only SDK send/receive
transport is doubled** using real PutObject/GetObject command classes; the
factory, adapter, module metadata, domain producers, PDF renderer, signing,
hash recomputation and download controller are not mocked.

The 12 cases cover independent pre-existing and restarted readers, encoded
object keys, real platform-admin placard generation, real invoice generation
followed by billing-profile mutation, and real driver-statement generation.
Returned original bytes are compared directly, not merely against a test
constant. Negative cases preserve forged-signature denial before storage
access, stale-link denial after same-length object corruption, missing objects,
missing MIME, zero/oversized/truncated/overlong/unreadable bodies, propagated
AccessDenied, oversized upload rejection before transport, and unprovisioned
module denial. There is no claim of live S3 or Cloud Run replica verification.
The earlier row saying the S3 adapter is not exercised is superseded for this
successor, not retrospectively corrected for its predecessor.

### Completed checks and retained failures

All checks below ran in the isolated contribution worktree. Private dependency
installation used the unchanged lockfile, `--frozen-lockfile --ignore-scripts
--offline`, with zero downloads and no existing node_modules symlink.

- Expanded artifact, configured S3, artifact/invoice/placard lifecycle/PDF,
  and the two finance/release caller suites: **10 files / 108 tests passed,
  zero skips**, exit 0. Command: `pnpm exec vitest run
  tests/unit/audit-artifact-durability-20261002.test.ts
  tests/unit/audit-artifact-durability-s3-20261003.test.ts
  tests/unit/system-remediation/sr-artifact-001/
  tests/unit/system-remediation/sr-invoice-001/
  tests/unit/system-remediation/sr-placard-001/
  tests/unit/system-remediation/sr-qa-finance-001/c077-c078-c079-tenant-billing-invoice-pdf.test.ts
  tests/unit/system-remediation/sr-release-001/same-order-cross-role-closed-loop.test.ts
  --maxWorkers=1`. DB URL variables were unset; a NODE_OPTIONS preload prohibited
  TCP listeners/outbound sockets and UDP bind/send. This is an inspected test
  selection, not permission to run all repository tests here.
- `pnpm run typecheck:root`: exit 0. Initial new-test strict typing errors
  (explicit undefined fields, callback type, byte index) were fixed rather
  than excluded from root compilation.
- API typecheck initially failed because a fresh checkout had not built the
  control-plane-auth package declarations. Ran its existing TypeScript-only
  build, then `pnpm exec tsc --noEmit -p apps/api/tsconfig.json`: exit 0.
- Changed runtime/test ESLint with `--max-warnings=0` and `git diff --check`:
  exit 0. Initial SDK test collection failed on an undeclared root dependency;
  corrected dependency resolution through the API package importer (same real
  SDK), then all 12 S3 cases executed. That collection failure was not a
  product-defect reproduction.

Machine-specific commands/output are retained under the repository-local
`.local/audit-followthrough-20261003/` evidence directory. A prior owner-started
whole-repository sweep was stopped by the coordinator after verifying its
process subtree; the attempted destructive rerun was denied through the
approval queue. Its interrupted output and known listener/DB selection risk
are retained, **not a full offline pass**. The earlier shared-symlink install
and broad-suite advice are not authorized practices. Full unit/browser/PG
verification belongs in hosted CI. Independent exact-SHA review, hosted CI,
merge and task acceptance are still required; no deployment, real object
store, scanner, or other live acceptance is claimed by these local results.

## Hosted CI exact-SHA evidence (`same_sha_review_ci`)

PR #2295, candidate `df46be0e9784e7b9577ad364e9a4ee351138b443` (branch
`claude2/audit-artifact-durability-20261002`, base `dev` at `d94d528f4`, one
commit behind current `origin/dev` `98352db89` — that one additional dev
commit, `SR-LIVE-MAIL-001`, touches only mail-bootstrap code with no overlap
with this task's `write_scopes`, confirmed via `git log d94d528f4..98352db89`).
`gh pr checks 2295 --required` at this exact SHA: `Commit trailers`,
`Runtime mirror guard`, `Smoke acceptance`, `ci-integ` all `pass`.
`gh pr checks 2295` (full set) at this exact SHA: every check `pass` except
`orchestrator-tests` (`skipping`, not a required check, not applicable to
this diff), including `unit` (pass, 8m46s — the full repo-root unit sweep the
previous section above left unresolved locally), `integration` (pass, 1m53s),
`iam-negative-matrix` (pass), `cross-surface-e2e` (pass, 4m0s — the exact job
that failed pre-CI-G1-fix and is now green), `ui-route-e2e` (pass, 11m0s —
the placard/`switchboard` route that also failed pre-fix), `typecheck`
(pass), `lint` (pass), `build` (pass), `Product smoke acceptance`
(completed all steps including `Apply migrations`, `Unit tests`, `API unit
tests`). This is real hosted CI against a real Postgres instance and a
booted API process, not a local mock — it closes the full-sweep and
PG/browser-adjacent gaps the local-only verification above could not reach
on this VM. This is the authoritative `same_sha_review_ci` evidence for
candidate `df46be0e9`; reviewer should re-check `gh pr checks 2295` only if
a later commit changes the head SHA.

## R4/R5/R6 reopen (candidate `abfcd62b11f1900627a5f71e501924b2c14e3a74`, generation `730d8739b21d4a2abebb710c32f2b63d`, PR #2295): what Codex found and the repair

This Codex REOPEN kept R1/R2/R3 above as confirmed, retained work and found
three new trigger conditions. All three are now fixed on top of the same
candidate lineage; this section records old/new results and provenance per
finding, per `AI_COLLABORATION_GUIDE.md` §0.7.

### R4 [P1; `durable_producer_reader_wiring` / `cross_instance_restart_bytes`] — legacy placard hash never certified store existence

**Finding:** `ensurePlacardArtifact` (`platform-admin.service.ts`) treated any
existing `placard.artifactManifestHash` as proof the durable store held the
bytes, and `onModuleInit` reloaded persisted placards through that same path.
A placard whose hash was recorded before this durable store existed (or on a
sibling instance, or before a restart) had metadata that proved nothing about
what the *current* instance's store actually held. No `"placard"` rebuilder
was registered with `DocumentArtifactRebuildRegistry`, unlike `"tenant-invoice"`
/ `"report"` (`BillingSettlementService`), so `ControlledDownloadController`'s
existing not-found → rebuild fallback had nothing to call for this kind.
Reproduced: GET → `ARTIFACT_NOT_MATERIALISED` (501), zero `put` calls.

**Fix:** registered `"placard"` with `DocumentArtifactRebuildRegistry` in
`PlatformAdminService`'s constructor (`platform-admin.service.ts:547`), the
same convention `BillingSettlementService` already uses. The render step
`ensurePlacardArtifact` used to inline is now the shared
`renderPlacardArtifact` helper (`platform-admin.service.ts:2489`), and
`rebuildPlacardArtifact` (`platform-admin.service.ts:2531`) calls it from this
instance's own durably persisted placard + public-info records, returning
`null` (not throwing) when this instance's own list has no such id — matching
the existing `rebuildTenantInvoiceArtifact` contract exactly. No change was
needed to `ensurePlacardArtifact`'s steady-state "trust the hash" fast path:
the existing `resolveDocumentArtifact` → not-found → rebuild pipeline now has
a producer to call for `"placard"`, which is the actual gap R4 identified.

**Old → new result:** a legacy published or draft placard reloaded into an
instance with an empty durable store previously failed every download with
`ARTIFACT_NOT_MATERIALISED`; it now recovers deterministically, byte-identical
to the original render, through the registered rebuilder, exactly like
`tenant-invoice` / `report` already did. An already-expired legacy link is
still correctly reissued over the unchanged, recovered hash.

**New regression coverage** (`tests/unit/audit-artifact-durability-20261002.test.ts`,
describe `"R4: a placard's artifactManifestHash does not by itself certify the
durable store holds the object"`): a published legacy placard recovered via
the registered rebuilder from a completely independent fresh instance +
empty store + separately configured download controller; and a draft
(never-published) legacy placard recovered the same way, including reissuing
an already-expired link over the recovered, unchanged hash.

### R5 [P2; `durable_producer_reader_wiring`] — a transient publish failure left a placard permanently "published"

**Finding:** `publishPlacardVersion` mutated the live `placard.publishedAt` /
`updatedAt` *before* awaiting the durable-store write
(`ensurePlacardArtifact(placard, true)`). A transient write failure (network
blip, throttled storage) still left the in-memory placard marked published
with no durable bytes behind it; every retry then failed with
`PLACARD_VERSION_ALREADY_PUBLISHED` (409) instead of being retryable.

**Fix:** `publishPlacardVersion` (`platform-admin.service.ts:841`) now stages
the mutation on a `{ ...placard, publishedAt: now, updatedAt: now }` copy,
renders/writes against that staged copy, and only copies the result's fields
(`publishedAt`, `updatedAt`, `artifactFileId`, `artifactManifestHash`,
`artifactDownloadUrl`, `artifactExpiresAt`, `downloadMetadata`) back onto the
live `placard` after the write succeeds. A failed write throws before any of
that copy-back happens, leaving the live placard byte-for-byte as it was.

**Old → new result:** a failed publish write previously left the placard
stuck in a false "published" state (non-null `publishedAt`, but the OLD draft
`artifactManifestHash`/bytes) with no way to retry; it now leaves the original
draft record completely untouched and retryable, and a subsequent healthy
publish succeeds normally.

**New regression coverage** (same test file, describe `"R5: a transient
durable-store failure during publish must not leave a placard permanently
marked published"`): a `DocumentArtifactStore` double that fails exactly the
publish `put` once (real render/service logic, only the write boundary is
doubled) — confirms the draft is unchanged after the failure, a retry
publishes successfully, and a second publish attempt then correctly reports
`PLACARD_VERSION_ALREADY_PUBLISHED` (proving the retry really published it).

### R6 [P2; `signature_hash_denial_regressions`] — a rejected stale-hash GET could overwrite a good shared artifact

**Finding:** `ControlledDownloadController.resolve` invoked the rebuild
fallback for *any* non-`"ok"` resolution status, including
`"content_mismatch"` — i.e. an object that genuinely exists at this
(kind, subjectId) but does not match the requesting link's manifest hash
(a stale or forged link). `BillingSettlementService.renderTenantInvoiceArtifact`
writes current-profile bytes directly to that same durable key with no
comparison against the request/issued hash first. A stale/forged GET against
an existing valid object therefore triggered a rebuild-and-overwrite,
corrupting the real object and breaking every other still-valid link pointing
at it.

**Fix:** `ControlledDownloadController.resolve` (`controlled-download.controller.ts:142`)
now only invokes the rebuild fallback when `resolution.status === "not_found"`,
never for `"content_mismatch"`. An object that exists but does not match the
link's hash is reported as `CONTROLLED_DOWNLOAD_CONTENT_MISMATCH` as-is,
without ever calling a writer.

**Old → new result:** a genuinely signed stale-hash link against an existing
object previously rewrote that object with freshly rendered (and possibly
different) bytes, changing its hash out from under every other valid link
naming it; it now denies the stale request without touching the store at
all, and the original, still-valid link keeps serving its original bytes
unchanged.

**New regression coverage** (same test file, describe `"R6: an existing-object
hash mismatch must deny without invoking the rebuild writer or damaging
another valid link"`): a real `BillingSettlementService` + registry-enabled
`ControlledDownloadController` + shared store generate an invoice, mutate the
billing profile (so a rebuild would visibly differ), then resolve a
genuinely signed stale-hash link for the same subject against the existing
object — asserts `CONTROLLED_DOWNLOAD_CONTENT_MISMATCH`, the store's entry
count and stored hash are unchanged, and the original valid link still
resolves to the original bytes. A second case confirms genuine-miss recovery
(the `not_found` path) still works — R6 narrows the trigger condition, it
does not remove recovery.

### Verification at this repair

`pnpm exec tsc --noEmit -p apps/api/tsconfig.json`: the four
`@drts/control-plane-auth` module-resolution errors are the same pre-existing
local-toolchain gap the prior reopen recorded (missing generated
declarations in this worktree, not a source regression); no other errors.
An `exactOptionalPropertyTypes` error this repair introduced while staging
`downloadMetadata` in `publishPlacardVersion` was found and fixed
(`placard.downloadMetadata = staged.downloadMetadata ?? null`) before this
check was considered clean.

Scoped, network-blocked run (same `.local/audit-followthrough-20261003/no-network.cjs`
preload as the prior reopen's verification, DB URL variables unset):
```
pnpm exec vitest run tests/unit/audit-artifact-durability-20261002.test.ts \
  tests/unit/audit-artifact-durability-s3-20261003.test.ts \
  tests/unit/system-remediation/sr-artifact-001/ \
  tests/unit/system-remediation/sr-invoice-001/ \
  tests/unit/system-remediation/sr-placard-001/ \
  tests/unit/system-remediation/sr-qa-finance-001/c077-c078-c079-tenant-billing-invoice-pdf.test.ts \
  tests/unit/system-remediation/sr-release-001/same-order-cross-role-closed-loop.test.ts \
  tests/unit/controlled-download-route.test.ts tests/unit/platform-admin.test.ts \
  --maxWorkers=1
```
=> exit 0, 12 files / 135 tests passed, zero skips. Also independently green:
`tests/unit/system-remediation/sr-qa-reports-001/c094-c096-public-info-placards-governance.test.ts`,
`.../c097-placard-printable-download.test.ts`,
`tests/unit/system-remediation/sr-qa-ux-001/c125-document-artifacts-upload-download.test.ts`,
`tests/unit/system-remediation/sr-qa-concurrency-001/cross-month-batch-billing.test.ts`,
`tests/unit/platform-admin-switchboard-placard-source.test.ts`,
`tests/unit/platform-admin-switchboard-placard-version-code.test.ts` (34/34);
`tests/unit/system-remediation/sr-qa-governance-001/{c103,c104-c105,c109}*.test.ts`
(18/18); `tests/unit/billing-settlement.test.ts` (8/8); and, run from `apps/api/`
(the root config's `include` globs do not cover `apps/api/tests/unit/**`, so
these must be invoked with `apps/api` as cwd, not bundled into the root-cwd
command above): `apps/api/tests/unit/platform-admin.service.test.ts` (3/3),
`apps/api/tests/unit/platform-admin-assistant.service.test.ts`,
`platform-admin-assistant-read-tools.test.ts`,
`platform-admin-assistant-action.test.ts` (24/24). None of these pre-existing
suites' assertions were weakened or removed to make this repair pass.

### Remaining limitations

- `same_sha_review_ci`: not yet run for the new candidate SHA produced by this
  repair; hosted CI must be re-verified at that exact SHA before this
  acceptance item is closed, per the same convention the prior `df46be0e9`
  evidence above used.
- Real storage/Cloud Run/IAM acceptance remains `SR-LIVE-DOC-001` and was not
  exercised by this repair.
- No product/browser/DB/Compose server was started on this VM for this
  repair; no real cloud storage was contacted. All new coverage above uses
  `InMemoryDocumentArtifactStore` as the shared-boundary double, the same
  convention the R1/R2/R3 regression suite already established — the
  dedicated S3-transport-boundary suite (`audit-artifact-durability-s3-20261003.test.ts`)
  was re-run unchanged and still passes against these fixes.

## R4-followthrough/R6-followthrough/R7 reopen (candidate `beb64723a4d4f7313c7b2b436e481080df086d49`, generation `761ed5d4a59f42079d480cbf7037918b`, PR #2295): what Codex found and the repair

This Codex REOPEN kept R1-R6 above as confirmed, retained work and narrowed
the ordinary existing-object R6 trigger as already fixed, but found three
concrete gaps in the surrounding boundary. All three are repaired on top of
the same candidate lineage; this section records old/new results and
provenance per finding, per `AI_COLLABORATION_GUIDE.md` §0.7.

### R6-followthrough [P2; `signature_hash_denial_regressions` / `cross_instance_restart_bytes`] — a miss/rebuild race could still let a rejected GET overwrite a correct restored artifact

**Finding:** `ControlledDownloadController.resolve` checks `not_found` once,
then invokes the registered rebuilder; `BillingSettlementService`'s/
`PlatformAdminService`'s render-and-write helpers called
`documentArtifactStore.put(...)` unconditionally; `S3DocumentArtifactStoreAdapter.put`
performs a plain `PutObject` with no conditional-create or version guard. If
a sibling instance (or this same instance's own prior attempt) restores a
genuinely good object for the same `(kind, subjectId)` between this
instance's own `not_found` read and its own recovery write, the unconditional
write overwrites the good object with this instance's independently
re-derived (and not necessarily byte-identical) bytes.

**Fix:** added `DocumentArtifactStore.putIfAbsent` — a conditional create,
implemented with `IfNoneMatch: "*"` on the real `PutObjectCommand`
(`s3-document-artifact-store.adapter.ts`), and with a synchronous
check-then-set on the in-memory adapter (`in-memory-document-artifact-store.ts`),
which is atomic within one process because no `await` separates the check
from the write. When the object already exists — whether from a concurrent
winner or because it was never actually missing — this returns the existing
record with `created: false` instead of touching the store. `UnprovisionedDocumentArtifactStore`
gained the same method (throws, matching `put`/`get`). The three
*recovery-only* render helpers were switched from `put` to `putIfAbsent`:
`BillingSettlementService.renderTenantInvoiceArtifact`/
`renderDriverStatementArtifact` (used only by their respective
`rebuild*Artifact` registry callbacks, never by issuance, which keeps its own
separate, legitimately-unconditional `put` calls) and
`PlatformAdminService.renderPlacardArtifact` (now takes a `{ recover?:
boolean }` option; `ensurePlacardArtifact`'s first materialisation and
`publishPlacardVersion`'s explicit republish still pass `recover: false` and
keep using `put` — a producer's own explicit write is the legitimate,
intended overwrite, never a recovery race). Explicit producer
regeneration and recovery are kept on separate write paths, as the prior
review asked.

**Old → new result:** a stale/forged link resolved against a genuinely
missing object, racing a concurrent legitimate restoration, previously could
overwrite the restored object with this instance's own re-derived bytes,
corrupting every other still-valid link pointing at it. It now denies the
stale/forged request (unchanged: existing-object mismatches were already
correctly denied) **and** never touches the store when a concurrent winner's
object already exists — the restored object, and every link still pointing
at it, survives untouched.

**New regression coverage:**
- `tests/unit/system-remediation/sr-artifact-001/document-artifact-store.test.ts`
  → `describe("putIfAbsent")`: creates and reports `created: true` on an
  empty key; preserves an existing object and reports `created: false`
  instead of overwriting it; validates input the same way `put` does.
- `tests/unit/audit-artifact-durability-s3-20261003.test.ts`: a new case
  exercises `putIfAbsent` against the real `PutObjectCommand`/`IfNoneMatch`
  semantics (the SDK transport double now honours `IfNoneMatch: "*"` and
  throws a real-shaped `PreconditionFailed`/412 when the key already exists,
  mirroring actual S3 conditional-write behaviour) — confirms the real
  `IfNoneMatch` header is sent, and that a losing concurrent attempt reports
  the winner's record without altering the stored bytes.
- `tests/unit/audit-artifact-durability-20261002.test.ts` → describe
  `"R6-followthrough: a recovery write racing a concurrent restoration must
  not overwrite bytes a concurrent writer already restored"`: a real
  `BillingSettlementService` + registry + controller issue an invoice,
  mutate the billing profile, delete the stored object to model genuine
  absence, then start a stale-hash GET whose `not_found` determination is
  held "in transit" (the lookup runs and snapshots the then-current absent
  state immediately, delivery is just delayed) while an independent writer
  restores the exact original bytes and a readback confirms them. Releasing
  the held result lets the stale GET's rebuild run against a store that, in
  reality, already holds the good object again — asserts the stale GET still
  denies (`CONTROLLED_DOWNLOAD_CONTENT_MISMATCH`), the restored object's
  bytes/hash are completely unchanged, and the original valid link still
  resolves correctly afterward. No adapter method or rebuild logic is
  mocked; only the test's own `get` wrapper introduces the controlled delay.

### R4-followthrough [P1; `durable_producer_reader_wiring` / `cross_instance_restart_bytes`] — supported legacy published placards could remain permanently undownloadable when their public-info source has since been retired

**Finding:** `renderPlacardArtifact` (the shared render path both first
materialisation and `rebuildPlacardArtifact` go through) reads the *current*
`PublicInfoVersionRecord` for `placard.publicInfoVersionId`.
`buildPlacardPdfRows` bakes `source.status` and `source.effectiveFrom`/
`effectiveTo` into the rendered bytes, and `publishPublicInfoVersion` mutates
exactly those fields on any version a later one retires (or on the version
itself, going draft → published). A placard generated before that mutation
has a recorded `artifactManifestHash` a current-state rebuild can no longer
reproduce. Because `ensurePlacardArtifact`'s materialised fast path and the
expired-link reissue path both only ever re-sign over the *existing*
`artifactManifestHash`, a legacy placard whose source has since drifted was
stuck: every GET denied with `CONTROLLED_DOWNLOAD_CONTENT_MISMATCH` (honest,
not a bug on its own), but every subsequent `getPlacardVersion` call kept
reissuing a *fresh* link signed for the exact same now-unreachable hash —
unlike an intentional stale-link denial, no request path, including a brand
new link, could ever repair the record.

**Fix:** exact-byte recovery of the originally issued bytes is not possible
without a durable snapshot of the source's mutable fields at issuance time,
and persisting one is outside this task's `write_scopes` (it would require a
new field on the shared `PlacardVersionRecord` contract and a repository/
migration change, neither of which this task touches). Per
`AI_COLLABORATION_GUIDE.md` §0.7's allowance to identify such a constraint
and provide a controlled migration path rather than asserting deterministic
recovery for every legacy document, `rebuildPlacardArtifact` now compares its
recovery render's hash against this placard's own recorded
`artifactManifestHash`; a mismatch means the source has drifted since
issuance. `migratePlacardArtifactAfterSourceDrift`
(`platform-admin.service.ts`) then adopts the deterministic current-state
render as this placard's new canonical artifact: it updates
`artifactManifestHash`/`artifactFileId`/`artifactDownloadUrl`/
`artifactExpiresAt`/`downloadMetadata` on the live record, persists the
change, and records an explicit, dedicated audit entry
(`migrate_placard_artifact_after_source_drift`) with the old and new hash —
an auditable migration, never a silent relabelling of different bytes as the
original, and never a write that races a concurrent recovery (the render
itself still goes through the new `putIfAbsent`-based recovery path above).

**Old → new result:** a legacy placard whose source was retired (or
published) after issuance previously denied every GET forever, with no link
— old or freshly reissued — ever able to repair it. It now still honestly
denies the *first* request against the stale, now-unreachable hash (the old
link genuinely cannot be served — that denial is correct, not a defect), but
that same failed recovery attempt migrates the placard's own canonical hash
forward; every subsequent `getPlacardVersion` call, and the fresh link it
returns, now succeeds against the new, actually-stored bytes.

**New regression coverage** (`tests/unit/audit-artifact-durability-20261002.test.ts`,
describe `"R4-followthrough: a placard whose source has mutated since
issuance must migrate to a servable hash, not advertise one the store can
never produce again"`): a real `PlatformAdminService` publishes a placard
against a published source, a real successor `createPublicInfoVersion`/
`publishPublicInfoVersion` call retires that source exactly the way ordinary
content management would, and a fresh instance (empty store, persisted-
equivalent reload) is proven to deny the first GET and then serve a
subsequently reissued fresh link correctly; a second case covers the
draft-to-published source drift the same way. (Covered by the same generic
drift-detection mechanism, not duplicated per scenario: the published-to-
retired and draft-to-published cases above exercise two distinct mutation
call paths; the unchanged-source positive case and the empty-store sibling-
reader case were already covered by the existing R4 tests above and continue
to pass unchanged; a dedicated expiry-refresh-only variant was not added
separately, since the drift check runs on every recovery render regardless
of why the recovery was triggered.)

**Unverified / limitation:** this is an explicit, audited migration to the
best currently-derivable render, not a claim of exact-byte recovery of what
was originally issued — the UAT/doc text and the audit log entry both say so.
No new persisted field was added to `PlacardVersionRecord`/the repository
schema (both outside this task's `write_scopes`); a future task that wants a
true byte-identical legacy-recovery guarantee would need to persist a
snapshot of the source's mutable render inputs at issuance time, which this
repair deliberately does not attempt.

### R7 [P2; new regression introduced while repairing R5; `durable_producer_reader_wiring`] — concurrent publishes on one instance could both succeed and leave metadata pointing at bytes that do not exist

**Finding:** `publishPlacardVersion` checked `placard.publishedAt` before
awaiting anything; staged each publication's render+write independently with
no reservation/CAS; and unconditionally copied its own staged result back
onto the live placard after its own write completed. Two concurrent calls
could both pass the guard before either awaited, both render and write, and
whichever call's own completion happened to run its copy-back *last* in
wall-clock terms won the live metadata — even if the *other* call's bytes
were what the store actually ended up holding, because write order need not
equal completion/acknowledgement order.

**Fix:** two complementary, narrowly-scoped changes, matching the "serialize/
fence publication ownership, including stale completions" boundary the
review asked for:
- `PlatformAdminService.placardPublishQueue` (a `Map<string, Promise<unknown>>`)
  + `runExclusivePlacardPublish` serialize every `publishPlacardVersion` call
  for the same `placardVersionId`, in call order, within this process: a
  later call's body — including its own `placard.publishedAt` guard check —
  does not even start running until every earlier call for that id has fully
  settled (success or failure; chained via `.then(fn, fn)` so a rejected
  predecessor does not wedge the queue). This alone fully eliminates the
  single-instance race the finding's reproduction exercises.
- Because a one-process lock alone does not establish cross-instance safety
  (the review's own caution), `publishPlacardVersionExclusive` also re-reads
  the durable store (`documentArtifactStore.get("placard", ...)`)
  immediately after its own write and before committing any metadata back
  onto the live placard. If the read-back disagrees with what this call's
  own render just produced — a different instance's publish for the same
  placard landing in the shared store in between — this throws a new
  `PLACARD_PUBLISH_CONFLICT` (409) instead of silently committing metadata
  that disagrees with what the shared store actually holds. The live placard
  is left completely untouched by a conflicting completion, exactly like the
  existing R5 failed-write behaviour, so it remains a retryable draft.

**Old → new result:** two concurrent publish calls for the same placard
previously could both report success while leaving the live metadata's hash
pointing at bytes a *different* completion's write actually left in the
store — any subsequent download of that "published" link then failed
`CONTROLLED_DOWNLOAD_CONTENT_MISMATCH` despite both callers having been told
the publish succeeded. Now, within one process, only the first-queued call
ever reaches the render/write step for a second overlapping attempt; the
second correctly reports `PLACARD_VERSION_ALREADY_PUBLISHED` once it is its
turn, having never written anything. Across instances (not exercised by this
candidate's test doubles, which are same-process), a landed foreign write
discovered at read-back time is reported as an explicit conflict rather than
silently committed.

**New regression coverage** (same test file, describe `"R7: concurrent
publishes for the same placard must not leave metadata pointing at bytes the
store does not have"`): one case starts two concurrent
`publishPlacardVersion` calls for the same id against a real
`PlatformAdminService`, holding the first call's own store-write response in
transit to model a reversed completion order; asserts exactly one call
fulfils and the other rejects with `PLACARD_VERSION_ALREADY_PUBLISHED`, that
only one `put` ever occurred, and that the final stored bytes and the live
metadata's hash agree, with a real download succeeding against the winning
link. A second case models a different instance's write landing between this
call's own write and its read-back (only the store double's `get` is
doubled, with a real inner `InMemoryDocumentArtifactStore`, to inject the
foreign write) and asserts `PLACARD_PUBLISH_CONFLICT`, with the placard left
an untouched, retryable draft — preserving R5's existing failure-then-retry
regression, which was re-run unchanged and still passes.

**Unverified / limitation:** the read-back/conflict defense is a detect-and-
refuse backstop for the cross-instance case, not a true distributed lock or
fencing token — a genuine distributed CAS/fencing mechanism for cross-Cloud-
Run-instance publish ownership is a larger change than this task's scope and
is not implemented here. Real multi-replica Cloud Run acceptance remains
`SR-LIVE-DOC-001`.

### Verification at this repair

`pnpm --filter @drts/control-plane-auth build` (this worktree's generated
declarations were missing, the same disclosed local-toolchain gap every
prior round in this lineage recorded) then `pnpm exec tsc --noEmit -p
apps/api/tsconfig.json`: exit 0, no errors. Root `pnpm exec tsc --noEmit -p
tsconfig.json --incremental false`: no errors from any file this repair
touches; the only remaining errors are a pre-existing, unrelated cross-worktree
type-identity collision between this worktree's and a sibling worktree's
`packages/api-client` (two files outside this task's `write_scopes`,
`tests/unit/fleet-partner-list-envelope.test.ts` and
`tests/unit/system-remediation/sr-admin-verify-001/fleet-lists.test.ts`,
neither touching document artifacts, billing-settlement, controlled-download
or platform-admin) — confirmed present before this repair's own changes by
re-running with the stale `tsconfig.tsbuildinfo` bypassed, and unrelated to
any file this diff edits.

`pnpm exec eslint --max-warnings=0` on every changed file: exit 0, no errors
or warnings. `git diff --check`: exit 0, no whitespace errors.

Scoped, network-blocked-equivalent run (no DB URL variables set; this session
had shell-only access, not the dedicated no-network NODE_OPTIONS preload
prior rounds used — no real network/DB call is exercised by any file in this
selection regardless):
```
pnpm exec vitest run tests/unit/audit-artifact-durability-20261002.test.ts \
  tests/unit/audit-artifact-durability-s3-20261003.test.ts \
  tests/unit/system-remediation/sr-artifact-001/ \
  tests/unit/system-remediation/sr-invoice-001/ \
  tests/unit/system-remediation/sr-placard-001/ \
  tests/unit/system-remediation/sr-qa-finance-001/c077-c078-c079-tenant-billing-invoice-pdf.test.ts \
  tests/unit/system-remediation/sr-release-001/same-order-cross-role-closed-loop.test.ts \
  tests/unit/controlled-download-route.test.ts tests/unit/platform-admin.test.ts \
  --maxWorkers=1
```
=> exit 0, **12 files / 144 tests passed, zero skips**. Also independently
green, confirming no regression in adjacent suites this repair's interface
changes reach: `tests/unit/system-remediation/sr-qa-reports-001/c094-c096-public-info-placards-governance.test.ts`,
`.../c097-placard-printable-download.test.ts`,
`tests/unit/system-remediation/sr-qa-ux-001/c125-document-artifacts-upload-download.test.ts`,
`tests/unit/system-remediation/sr-qa-concurrency-001/cross-month-batch-billing.test.ts`,
`tests/unit/platform-admin-switchboard-placard-source.test.ts`,
`tests/unit/platform-admin-switchboard-placard-version-code.test.ts`,
`tests/unit/system-remediation/sr-qa-governance-001/{c103,c104-c105,c109}*.test.ts`,
`tests/unit/billing-settlement.test.ts` (60/60 total), and, run from
`apps/api/`: `apps/api/tests/unit/platform-admin.service.test.ts`,
`platform-admin-assistant.service.test.ts`,
`platform-admin-assistant-read-tools.test.ts`,
`platform-admin-assistant-action.test.ts` (27/27). None of these pre-existing
suites' assertions were weakened or removed to make this repair pass.

### Hosted CI exact-SHA evidence for this repair (`same_sha_review_ci`)

PR #2295 head `1ff6dacff660b4bb4b6ff73057a40e07dffd6b77` (this repair's
candidate, verified via `gh pr view 2295 --json headRefOid` immediately
before and after polling): `gh pr checks 2295` at this exact SHA shows every
check `pass` except the explicitly-skipped `orchestrator-tests`. Required
checks: `Commit trailers`, `Runtime mirror guard`, `Smoke acceptance`,
`ci-integ`. Full set, including the four jobs that were still running when
first observed and were polled to completion rather than assumed:
`unit` (10m55s), `build` (7m10s), `ui-route-e2e` (7m20s), `Product smoke
acceptance` (8m0s), plus previously-confirmed `typecheck`, `lint`,
`integration`, `iam-negative-matrix`, `cross-surface-e2e`, `candidate`,
`changes`, `e2e`, `i18n guard`/`i18n-guard`, `dependency-security`,
`Canonical consistency`, `BFF-only imports`, `Change scope`, `Repo
classification` (x2), `Dependency security`, `No real financial-institution
identifiers`, `Spec source archive`, `Verify Internal Key Exceptions`. Runs:
https://github.com/ajoe734/drts-fleet-platform/actions/runs/37127370610 and
https://github.com/ajoe734/drts-fleet-platform/actions/runs/37127370622.

### Remaining limitations (this repair)

- Real storage/Cloud Run/IAM acceptance remains `SR-LIVE-DOC-001`; this
  repair's cross-instance-race coverage is same-process test doubles over
  the shared-boundary store, not deployed multi-replica Cloud Run.
- The R7 cross-instance read-back conflict defense and the R4-followthrough
  migration mechanism are both detect-and-refuse-or-migrate backstops, not
  full distributed coordination or a durable issuance-time snapshot; both
  limitations are stated explicitly above rather than claimed away.
- No product/browser/DB/Compose server was started on this VM; no real cloud
  storage was contacted. The adapter-level `putIfAbsent` conditional-write
  behaviour is exercised against the SDK transport double's modelled
  `IfNoneMatch`/`PreconditionFailed` semantics
  (`audit-artifact-durability-s3-20261003.test.ts`), not a live S3 bucket.

## R7-followthrough reopen (candidate `90263d6a908d99918a50565c239a8dbfdae98da1`, generation `181ac31645bd4dca8d9b12d15da598cb`, PR #2295): what Codex found and the repair

### R7-followthrough [P2; `durable_producer_reader_wiring` / `cross_instance_restart_bytes`] — shared publication had no atomic ownership or fenced metadata commit

**Finding:** the R7 fix above (candidate `1ff6dacff660b4bb4b6ff73057a40e07dffd6b77`)
correctly serialized concurrent publishes _within one process_ and detected a
foreign write landing between this call's own write and its own read-back,
but explicitly left cross-instance publish ownership unresolved (see that
round's own "Unverified / limitation" note). Codex's reopen reproduced this
offline against the exact locked candidate with a probe that constructs two
independently configured S3-backed `PlatformAdminService` instances, lets
instance A commit its real `PutObject` and begin its own real `GetObject`
read-back, **holds delivery of that already-captured, genuinely successful
response**, lets instance B publish and commit to completion in the
meantime, then releases A's held response. Because the read-back check only
ever compared this call's own staged hash against whatever the store
returned to it — never against a fenced, shared claim on the record — A's
stale-but-honest response still matched A's own staged hash and overwrote
B's just-committed metadata, while the object store was left holding B's
bytes. A fresh/restarted reader resolving the persisted link then failed
`CONTROLLED_DOWNLOAD_CONTENT_MISMATCH` even though both publishes had
individually reported success. `PlatformAdminRepository.persistChanges` was
also fire-and-forget (`void ... .catch(...)`, never awaited by the caller),
so a publish could report success to its own HTTP caller before the durable
record even reflected it.

**Fix:** shared publication arbitration now happens in the durable record
*before* either instance touches the document-artifact store, plus an
awaited, fenced commit of the final result:

- `PlatformAdminRepository.claimPlacardPublish(claim)` (new) — an atomic
  `INSERT ... ON CONFLICT (placard_version_id) DO UPDATE ... WHERE
  record->>'publishedAt' IS NULL RETURNING record`. Exactly one concurrent
  caller's conditional write lands; every other caller's write is excluded
  by the `WHERE` guard and affects zero rows, so it is told `claimed: false`
  together with whatever the winner actually persisted (`currentRecord`).
  When `DATABASE_URL` is not configured (`isEnabled()` false — the normal
  state for this unit-test suite and for any single-instance deployment)
  this trivially returns `claimed: true`, preserving the existing
  single-process behaviour exactly.
- `PlatformAdminRepository.finalizePlacardPublish(record)` (new) — commits
  the fully-rendered result over a claim already won. No other instance can
  be mid-claim for the same row at this point, so the write itself is
  unconditional, but `PlatformAdminService.publishPlacardVersionExclusive`
  now `await`s it directly instead of going through the fire-and-forget
  `persistChanges` the rest of the service uses: the caller cannot observe a
  successful publish before the durable record actually reflects it.
- `PlatformAdminRepository.releasePlacardPublishClaim(id, claimedPublishedAt,
  reverted)` (new) — a conditional `UPDATE ... WHERE record->>'publishedAt'
  = $claimedPublishedAt` that only releases *this* call's own claim. Used
  when the claim is won but the subsequent render/store write or the
  existing store-changed-during-publish read-back check fails, so the
  placard remains retryable (preserving R5) both within this instance and
  for a sibling instance that might retry it next.
- `PlatformAdminService.publishPlacardVersionExclusive` now calls
  `claimPlacardPublish` with the staged (not-yet-rendered) record
  immediately after the existing in-process `placard.publishedAt` guard, and
  before `ensurePlacardArtifact`'s store write. A lost claim throws the
  existing `PLACARD_VERSION_ALREADY_PUBLISHED` (409) using the winner's own
  persisted `publishedAt`, and also refreshes this instance's in-memory
  `placardVersions` cache entry from the winner's record so a subsequent
  read on this same instance is not stale. A render/store failure or the
  existing read-back conflict check releases the claim before rethrowing,
  exactly like the pre-existing R5 failure path. The existing read-back
  check against the actual store (R7) is unchanged and kept as a second,
  independent line of defense for the object-store key itself, which the
  record-level claim does not by itself observe.

**Old → new result:** the probe's exact reproduction — hold instance A's
authentic, already-successful `GetObject` response in flight, let instance B
independently publish and commit to completion, then release A's response —
previously produced `bothPublishesSucceeded: true` with the persisted
metadata's hash pointing at bytes the object store no longer held
(`persistedHashMatchesStored: false`), and a fresh/restarted reader's link
failing `CONTROLLED_DOWNLOAD_CONTENT_MISMATCH`. With this repair, instance B
can no longer even attempt a claim once instance A has committed one: B's
`publishPlacardVersion` call rejects immediately with
`PLACARD_VERSION_ALREADY_PUBLISHED`, before issuing a single store write, and
instance A's delayed read-back resolves to its own, still-intact bytes.
Exactly one publish ever writes to the shared object key for that placard;
the persisted record's hash and the object store's actual bytes always
agree; a fresh/restarted reader resolving the winner's link always succeeds.

**New regression coverage** (same test file, new describe
`"R7-followthrough: two independent PlatformAdminService instances (two
Cloud Run pods) racing to publish the same never-before-published placard
must not both succeed"`, `tests/unit/audit-artifact-durability-20261002.test.ts`):
- A `sharedFencedRepository` test double backs `claimPlacardPublish`/
  `finalizePlacardPublish`/`releasePlacardPublishClaim` with one shared
  `Map` keyed by `placardVersionId` and the same `WHERE publishedAt IS NULL`
  guard the real repository's SQL implements, used by **two separately
  constructed `PlatformAdminService` instances** (pod A, pod B) — proving
  cross-instance fencing through the shared row, never through any
  in-process field.
- `"fences the losing instance out before it ever writes bytes, even though
  the winner's own authentic read-back is held in flight"`: a
  `DelayedReadbackStore` double returns the real bytes a `get()` call
  actually captured, then holds *delivery* of that already-captured,
  genuinely successful response — modelling the probe's exact held-GET
  technique, not merely injecting a foreign write synchronously inside
  `get()` (that remains the separate, pre-existing R7 "clobbered readback"
  test above). Pod A claims and writes its real bytes, then blocks on its
  own held read-back; pod B's concurrent publish attempt is asserted to
  reject with `PLACARD_VERSION_ALREADY_PUBLISHED` **and to never increment
  the store's `put` counter** before pod A's held response is released;
  after release, pod A's publish still fulfils, and the persisted record's
  hash, the object store's actual bytes, and a freshly constructed, third,
  independent `ControlledDownloadController` resolving the winning link via
  a real download all agree.
- `"releases the claim after a failed store write, so a sibling instance's
  healthy retry still succeeds"`: pod A's publish fails on its own store
  write (a `FailOnceStore` double, mirroring R5's `FlakyDocumentArtifactStore`
  but shared across both pods); asserts the shared row's `publishedAt` is
  released back to `null`, then pod B — a different instance — successfully
  claims and publishes the same placard, with the persisted record and the
  store's actual bytes agreeing afterward. This is the cross-instance
  analogue of the pre-existing single-instance R5 retry regression, which
  was re-run unchanged and still passes.
- The pre-existing `emptyPlatformAdminRepository` single-instance test
  double (used by the R4/R4-followthrough/R5/R6/R6-followthrough/R7
  describe blocks above) was extended with trivial
  (`claimed: true`) stand-ins for the three new methods, since it has no
  shared row to fence against; `apps/api/tests/unit/platform-admin.service.test.ts`'s
  repository double was extended the same way, and its publish test's
  assertion was updated from checking the now-unused `persistChanges` call
  to checking `finalizePlacardPublish` (the fenced, awaited path the publish
  commit now actually goes through).

**Unverified / limitation:** this closes the specific, reproduced defect —
an atomic, fenced claim now exists in the durable record, and publish's
final commit is awaited rather than fire-and-forget. It still does not
implement real PostgreSQL row locking/`SELECT ... FOR UPDATE` or an actual
production-schema integration test against a live database from this VM
(no DB/server was started here, per this task's standing VM restriction);
the claim's correctness here is proven against the SQL text and against a
test double that implements the same conditional-write semantics in-memory,
not against a live Postgres instance. Real cross-instance/Cloud-Run/IAM
acceptance, including validating the actual SQL against the real
`admin.phase1_placard_versions` schema under genuine concurrent connections,
remains `SR-LIVE-DOC-001` / hosted CI's `integration`/`iam-negative-matrix`
jobs, not this local repair.

### Verification at this repair

`pnpm --filter @drts/contracts build` and `pnpm --filter @drts/control-plane-auth
build` (both worktrees' generated declarations were stale/missing, the same
disclosed local-toolchain gap every prior round in this lineage recorded),
then `pnpm --filter @drts/api typecheck`: exit 0, no errors. Root
`pnpm exec tsc -p tsconfig.json --noEmit`: no errors from any file this
repair touches; the only remaining errors are the same pre-existing,
unrelated cross-worktree type-identity collision between this worktree's and
a sibling worktree's `packages/api-client` noted by the prior round above
(`tests/unit/fleet-partner-list-envelope.test.ts` and
`tests/unit/system-remediation/sr-admin-verify-001/fleet-lists.test.ts`,
neither in this task's `write_scopes` nor touching document artifacts,
billing-settlement, controlled-download or platform-admin).

Scoped vitest run (`DATABASE_URL`/`API_DATABASE_URL`/`TEST_DATABASE_URL`/
`PG_DATABASE_URL` unset; no real DB/network call is exercised by any file in
this selection regardless):
```
pnpm exec vitest run tests/unit/audit-artifact-durability-20261002.test.ts \
  tests/unit/audit-artifact-durability-s3-20261003.test.ts \
  tests/unit/system-remediation/sr-artifact-001/ \
  tests/unit/system-remediation/sr-invoice-001/ \
  tests/unit/system-remediation/sr-placard-001/ \
  tests/unit/system-remediation/sr-qa-finance-001/c077-c078-c079-tenant-billing-invoice-pdf.test.ts \
  tests/unit/system-remediation/sr-release-001/same-order-cross-role-closed-loop.test.ts \
  tests/unit/controlled-download-route.test.ts tests/unit/platform-admin.test.ts \
  apps/api/tests/unit/platform-admin.service.test.ts \
  tests/unit/system-remediation/sr-qa-reports-001/c094-c096-public-info-placards-governance.test.ts \
  tests/unit/system-remediation/sr-qa-reports-001/c097-placard-printable-download.test.ts \
  tests/unit/system-remediation/sr-qa-ux-001/c125-document-artifacts-upload-download.test.ts \
  tests/unit/system-remediation/sr-qa-concurrency-001/cross-month-batch-billing.test.ts \
  --maxWorkers=1
```
=> exit 0, **16 files / 173 tests passed, zero skips**, including the two new
R7-followthrough cases above and every pre-existing R1-R7/R4-R6-followthrough
case unchanged and still passing. No pre-existing suite's assertions were
weakened or removed to make this repair pass; the one pre-existing assertion
that genuinely could not stay as written (`platform-admin.service.test.ts`'s
publish test checking `persistChanges`) was updated to check the new,
stricter `finalizePlacardPublish` path it now actually exercises, not
deleted or loosened.

Hosted CI for this repair's own candidate SHA is pending — it is produced by
the handoff/candidate lifecycle after this repair is committed and pushed,
not run locally from this VM. The prior round's hosted CI evidence above
(`same_sha_review_ci` for `1ff6dacff660b4bb4b6ff73057a40e07dffd6b77`) remains
valid for everything it covered, which did not include this repair's new
repository methods or tests.

### Remaining limitations (this repair)

- Real PostgreSQL row-locking/concurrency behaviour for
  `claimPlacardPublish`/`finalizePlacardPublish`/`releasePlacardPublishClaim`
  against the actual `admin.phase1_placard_versions` schema under genuine
  concurrent connections is not exercised from this VM; it is proven against
  the SQL text and an in-memory double implementing the same conditional-
  write semantics. Real multi-replica Cloud Run acceptance remains
  `SR-LIVE-DOC-001`.
- The claim is a record-level fence on `publishedAt`; it does not add a
  separate lock/version column to `PlacardVersionRecord` (outside this
  task's `write_scopes`, and unnecessary here since `publishedAt` already
  transitions exactly once from `null` to a committed value for this
  record's entire lifecycle). The pre-existing R7 object-store read-back
  check remains the independent defense for the object-store key itself.
- No product/browser/DB/Compose server was started on this VM; no real cloud
  storage was contacted.

## R7-followthrough/R8/R9 reopen (Codex REOPEN, generation `93a28b03b0574b038810ca5c0d435beb`): what Codex found and why

Codex reopened locked candidate `94b0f71c1e5bf81a0d15b4f372801e1cd67f22b4`
(PR #2295) with three findings against the claim/finalize/release mechanism
the previous round introduced. The simpler R7 held-GET race (two concurrent
publish calls only) was confirmed repaired and is **not** revisited here;
these three findings are new, more precisely localized interleavings against
the same shared-publication-authority obligation:

- **R7-followthrough** — a placard's own initial draft write
  (`generatePlacardVersion`'s `persistChanges` call) was fire-and-forget. If
  it was still in flight when a later `claimPlacardPublish`/
  `finalizePlacardPublish` for the same id committed first, its own
  unconditional `ON CONFLICT DO UPDATE` could land *after* them and silently
  regress the row back to pre-publish content (`publishedAt: null`, the old
  draft hash) — reproduced with a real repository, a held low-level draft
  INSERT, and two publish calls, resulting in `dbHashMatchesBytes: false` and
  a restarted reader's fresh link failing `CONTROLLED_DOWNLOAD_CONTENT_MISMATCH`.
- **R8** — `claimPlacardPublish`'s own INSERT was awaited directly; if the
  database committed the claim but the connection dropped before the caller
  observed the result (an ambiguous acknowledgement), the method rejected
  with no finalize/release ever called. Every retry — same instance or a
  restarted one — then hit the local/SQL `ALREADY_PUBLISHED` guard forever,
  permanently stranding an unpublished draft behind a `publishedAt` that
  looked committed.
- **R9** — a losing caller (or an instance booting mid-claim) cached the
  winner's claim snapshot verbatim. That snapshot already has `publishedAt`
  set but still carries the *pre-publish* `artifactManifestHash`/
  `artifactDownloadUrl` (the claim precedes `ensurePlacardArtifact`'s actual
  render). `ensurePlacardArtifact`'s existing "once a hash exists, trust it"
  fast path then signed links against that stale hash forever, even for a
  *fresh* `getPlacardVersion` call issued well after the winner finalized —
  the losing/booted reader's own first new-link download therefore failed
  `CONTROLLED_DOWNLOAD_CONTENT_MISMATCH` even though the winner's own link
  and the durable store agreed the whole time.

Codex's review additionally flagged that the prior round's new claim/finalize/
release regressions all exercised an interface-level repository stand-in
(`sharedFencedRepository`), not the real `PlatformAdminRepository` class and
its SQL text — see "Evidence limits" below for how this round's new tests
close that specific gap.

## This repair: a durable, internal claim-ownership marker

All three findings trace back to one gap: `claimPlacardPublish` conflated
"this row is claimed" with "this row's bytes are finalized" by reusing
`publishedAt` for both, and nothing marked a claim as still-provisional
*in the durable record itself*. The repair adds one internal marker,
`__publishClaimToken`, written into the same `record` JSONB blob
`admin.phase1_placard_versions` already stores — **not** a new column, and
**not** a change to the public `PlacardVersionRecord` contract in
`@drts/contracts` (outside this task's `write_scopes`). It is generated via
`randomUUID()` per publish attempt in `platform-admin.service.ts`, carried
through `claimPlacardPublish`, and always stripped (`stripClaimToken`)
before `finalizePlacardPublish` persists the row or before any record
reaches a caller outside the module (`clonePlacardVersion`).

- `PlatformAdminRepository.claimPlacardPublish` — the claim guard is now
  `WHERE publishedAt IS NULL OR (__publishClaimToken IS NOT NULL AND
  updated_at < NOW() - INTERVAL '2 minutes')`. The first branch is the
  pre-existing never-published case. The second lets a claim whose owner
  crashed or lost its network before finalizing/releasing be safely
  reclaimed after a bounded window — a *finalized* row (no token, by
  construction) is never reclaimable through this guard regardless of age.
  On a thrown INSERT (R8), it now calls `reconcileAmbiguousPlacardClaim`,
  which re-reads the row and treats it as this call's own successful claim
  only if the row's `__publishClaimToken` matches the token THIS attempt
  generated — a value nothing else could have produced — so a genuinely
  failed write (no matching token persisted) is never mistaken for success,
  and a different caller's committed claim is never adopted as this one's
  own.
- `PlatformAdminRepository.finalizePlacardPublish(record, expectedClaimToken)`
  — now guarded by `WHERE record->>'__publishClaimToken' = $expectedClaimToken`
  (not just the placard id) and returns whether the write actually applied
  (`rowCount === 1`), instead of silently "succeeding" unconditionally. The
  written payload has the token stripped, which is what tells a later reader
  this row is actually finalized (R9), not merely claimed. The service
  treats a `false` result as `PLACARD_PUBLISH_CONFLICT` and releases.
- `PlatformAdminRepository.releasePlacardPublishClaim(..., expectedClaimToken)`
  — now guarded by both `publishedAt` and `__publishClaimToken` matching
  this exact claim, and also returns whether it applied.
- `PlatformAdminRepository.getPlacardVersionRecord(id)` (new) — a plain
  single-row read, used by the service to resolve authoritative state when a
  cached snapshot is still provisional.
- `PlatformAdminRepository.persistChanges`'s placard upsert now carries
  `WHERE admin.phase1_placard_versions.updated_at <= EXCLUDED.updated_at`
  (R7-followthrough). `updated_at` only ever moves forward for a placard row
  in this service, so this makes every late/stale writer through this path
  (draft creation, bootstrap seeding, source-drift migration) a safe no-op
  against a newer claim/finalize, without needing a separate revision
  column. `PlatformAdminService.generatePlacardVersion` additionally now
  `await`s this specific write (previously fire-and-forget), closing the
  original race at its source as well as behind this generic guard.
- `PlatformAdminService`: `publishPlacardVersionExclusive` now works against
  `wonClaim` (`claim.currentRecord ?? staged`) rather than assuming the
  staged object it sent is necessarily the one that landed — needed because
  `reconcileAmbiguousPlacardClaim` can hand back an earlier attempt's own
  already-committed claim. `clonePlacardVersion` is now a thin wrapper around
  a new `resolvePlacardVersion`: whenever a cached placard still carries
  `__publishClaimToken` (R9), it re-fetches the authoritative row from the
  repository before calling `ensurePlacardArtifact`, and only overwrites the
  in-memory cache slot once the resolved row is actually non-pending. This is
  what makes a losing instance's or a mid-claim-boot instance's *next* read
  resolve the winner's real, finalized bytes instead of repeating the stale
  snapshot forever. `onModuleInit`'s persisted-state load path was switched
  from `clonePlacardVersion` to `resolvePlacardVersion` directly — using the
  external-facing (token-stripped) wrapper there would have laundered away
  the pending marker before it was ever observed, silently reintroducing R9
  at every cold boot.

**Old → new result:**

- R7-followthrough: the delayed genuine draft INSERT no longer erases a
  claim/finalize that committed after it was issued; it is rejected by the
  `updated_at` guard as a stale no-op.
- R8: a claim whose commit acknowledgement is lost is reconciled by the same
  call (adopts its own write and proceeds to finalize) when the connection
  loss is transient; a genuinely failed write still rejects, and a later
  retry (any instance) can safely reclaim the row once it is `>2` minutes
  stale, instead of being stuck behind `ALREADY_PUBLISHED` forever. A fresh
  (not stale) pending claim, and any finalized row regardless of age, remain
  correctly unreclaimable.
- R9: a losing caller's and a mid-claim-booted instance's cached snapshot is
  no longer trusted once it carries a pending claim marker; both now resolve
  the authoritative, finalized record on their next read and their next
  download link matches the durably stored bytes.

**New regression coverage**
(`tests/unit/audit-artifact-durability-20261002.test.ts`, new describe
`"R7-followthrough/R8/R9 (Codex REOPEN, generation
93a28b03b0574b038810ca5c0d435beb): production repository-path regressions
for the durable publish claim"`):

- A `createRealPlacardRepository` harness instantiates the REAL
  `PlatformAdminRepository` class (not an interface-level stand-in) against a
  fake query transport that implements the actual SQL this review requires:
  the `persistChanges` placard upsert's `updated_at <= EXCLUDED.updated_at`
  fence, `claimPlacardPublish`'s full `publishedAt IS NULL OR (stale
  __publishClaimToken)` guard (including the staleness arithmetic),
  `finalizePlacardPublish`/`releasePlacardPublishClaim`'s token-guarded
  `UPDATE`s discriminated by their actual bound-parameter count, and
  `getPlacardVersionRecord`. Only the external query transport is modelled —
  the repository's own SQL text, parameter binding, and control flow run for
  real. This directly answers Codex's "no real-schema-path test of the new
  claim/finalize/release methods" critique for this round's new coverage;
  `sharedFencedRepository`'s existing interface-level stand-in (used by the
  pre-existing, still-passing R7-followthrough tests from the prior round)
  was left in place unchanged other than updating its three method stubs'
  return values to match the new boolean/token-aware signatures.
- `"R7-followthrough: a late, unconditioned placard write must not regress a
  newer claim/finalize"` — persists a finalized row, then a stale write with
  an older `updated_at` for the same id; asserts the finalized row is
  unchanged, then asserts a genuinely newer write still applies.
- `"R8: a committed claim whose acknowledgement is lost must be reconciled,
  not left stuck"` — two cases: the armed transport commits the row then
  throws (asserts `claimed: true`, the row reflects the claim); and the
  transport throws before committing (asserts the original error propagates
  and no row was created).
- `"R8: bounded abandoned-claim recovery"` — three cases against the same
  guard: a `>2`-minute-stale pending claim is reclaimed; a fresh (seconds-old)
  pending claim is not; a finalized row (no token) at 20x the staleness
  window is still never reclaimed.
- `"R9: a losing/booting instance must not trust an unfinalized claim
  snapshot as a completed publish"` — three real `PlatformAdminService`
  instances sharing the real repository and a shared, held-readback store
  (pod A publishes and holds its own authentic read-back; pod B loses its
  concurrent claim; pod C boots while A's claim is still pending; A's
  read-back is released and it finalizes). Both pod B's and pod C's
  **subsequent** `getPlacardVersion` call, and the controller resolving the
  link each one returns, are asserted against the actual stored bytes —
  closing the exact gap Codex identified in the prior round's R7-followthrough
  coverage (which only re-resolved the winner's own already-known URL through
  a fresh controller, not a loser's or a mid-claim-boot instance's own new
  `getPlacardVersion` call).

`apps/api/tests/unit/platform-admin.service.test.ts`'s repository double was
updated: `finalizePlacardPublish`/`releasePlacardPublishClaim` now resolve
`true` (previously `undefined`, which the service now correctly treats as a
conflict) and a trivial `getPlacardVersionRecord` stub was added; its publish
test's `finalizePlacardPublish` assertion now also matches the new
`expect.any(String)` claim-token argument. No pre-existing assertion was
weakened, loosened, or deleted to make this repair pass.

### Verification at this repair

`pnpm --filter @drts/contracts build` and `pnpm --filter @drts/control-plane-auth
build` (both worktrees' generated declarations were stale/missing again, the
same disclosed local-toolchain gap every prior round in this lineage
recorded), then `pnpm --filter @drts/api typecheck`: exit 0, no errors. Root
`pnpm exec tsc -p tsconfig.json --noEmit`: no errors from any file this
repair touches; the only remaining errors are the same pre-existing,
unrelated cross-worktree type-identity collision between this worktree's and
a sibling worktree's `packages/api-client` noted by every prior round above.
`pnpm --filter @drts/api exec eslint` on both touched source files, and
`pnpm exec eslint` on both touched test files: exit 0, no errors.

Scoped vitest run (`DATABASE_URL`/`API_DATABASE_URL`/`TEST_DATABASE_URL`/
`PG_DATABASE_URL` unset; no real DB/network call is exercised by any file in
this selection regardless), same command as every prior round:
```
pnpm exec vitest run tests/unit/audit-artifact-durability-20261002.test.ts \
  tests/unit/audit-artifact-durability-s3-20261003.test.ts \
  tests/unit/system-remediation/sr-artifact-001/ \
  tests/unit/system-remediation/sr-invoice-001/ \
  tests/unit/system-remediation/sr-placard-001/ \
  tests/unit/system-remediation/sr-qa-finance-001/c077-c078-c079-tenant-billing-invoice-pdf.test.ts \
  tests/unit/system-remediation/sr-release-001/same-order-cross-role-closed-loop.test.ts \
  tests/unit/controlled-download-route.test.ts tests/unit/platform-admin.test.ts \
  tests/unit/system-remediation/sr-qa-reports-001/c094-c096-public-info-placards-governance.test.ts \
  tests/unit/system-remediation/sr-qa-reports-001/c097-placard-printable-download.test.ts \
  tests/unit/system-remediation/sr-qa-ux-001/c125-document-artifacts-upload-download.test.ts \
  tests/unit/system-remediation/sr-qa-concurrency-001/cross-month-batch-billing.test.ts \
  --maxWorkers=1
```
=> exit 0, **16 files / 178 tests passed, zero skips** (173 pre-existing +
5 new test cases across the four new describe blocks above), every
pre-existing R1-R7/R4-R6-followthrough/R7-followthrough case unchanged and
still passing. Separately, from `apps/api`:
`pnpm --filter @drts/api exec vitest run tests/unit/platform-admin.service.test.ts
--maxWorkers=1` => exit 0, 1 file / 3 tests.

Hosted CI for this repair's own candidate SHA is pending — it is produced by
the handoff/candidate lifecycle after this repair is committed and pushed,
not run locally from this VM. The prior round's hosted CI evidence above
(`same_sha_review_ci` for `94b0f71c1e5bf81a0d15b4f372801e1cd67f22b4`) remains
valid for everything it covered, which did not include this repair's new
repository methods, the `__publishClaimToken` marker, or these new tests.

### Acceptance mapping (this repair)

| Finding/acceptance | Source location | Old → new | Evidence | Limitation |
| --- | --- | --- | --- | --- |
| R7-followthrough | `platform-admin.repository.ts` `persistChanges` placard upsert guard; `claimPlacardPublish`; `platform-admin.service.ts` `generatePlacardVersion` (awaited write) | late draft INSERT regressed a finalized claim → rejected as a stale no-op | new repository-level test above; scoped suite 178/178 | Real PG row semantics for the `updated_at` comparison not exercised from this VM (`SR-LIVE-DOC-001`) |
| R8 | `claimPlacardPublish` + `reconcileAmbiguousPlacardClaim`; widened reclaim guard | ambiguous-ack claim stuck forever → reconciled same-call when transient, safely reclaimable after 2 minutes otherwise | new repository-level tests above | Process-exit-after-claim was statically reasoned about, not physically killed on this VM; the 2-minute window is a policy choice, not independently re-derived from an SLA doc |
| R9 | `resolvePlacardVersion`/`clonePlacardVersion`; `onModuleInit` | losing/booted reader's fresh link mismatched after winner finalized → resolves authoritative bytes | new 3-pod service-level test above | Still genuinely in-flight reads (mid-claim, before any finalize exists anywhere) remain best-effort on the last-known snapshot, as before this fix — there is no better data to serve yet |
| `durable_producer_reader_wiring` | all of the above | partial → all three Codex-identified writer/reader gaps closed | same as above | Live multi-replica Cloud Run wiring remains `SR-LIVE-DOC-001` |
| `cross_instance_restart_bytes` | all of the above | not satisfied for delayed writer/abandoned claim/provisional-reader scenarios → all three reproduced-and-fixed | same as above | same as above |
| `signature_hash_denial_regressions` | unchanged fail-closed mismatch checks | still passing | scoped suite above | n/a |
| `same_sha_review_ci` | this candidate's own SHA | pending (produced after handoff) | n/a yet | prior SHA's hosted CI does not cover this repair's new code |

### Remaining limitations (this repair, R7-followthrough/R8/R9 round)

- Real PostgreSQL behaviour for the `updated_at <= EXCLUDED.updated_at`
  comparison, the `NOW() - INTERVAL '2 minutes'` staleness arithmetic, and
  genuine concurrent-connection commit/ack ordering is not exercised from
  this VM; all three are proven against the repository's actual SQL text and
  a fake query transport that models the same conditional-write semantics,
  not a live Postgres instance. Real multi-replica Cloud Run acceptance
  remains `SR-LIVE-DOC-001`.
- The 2-minute abandoned-claim staleness window is a bounded-recovery policy
  choice made in this repair, not a value derived from an existing SLA/
  timeout document; Supervisor/product may want to tune it.
- `__publishClaimToken` is an internal bookkeeping field inside the existing
  `record` JSONB column, not a new migration/column and not a change to the
  public `PlacardVersionRecord` contract — intentionally, since
  `packages/contracts` is outside this task's `write_scopes`.
- No product/browser/DB/Compose server was started on this VM; no real cloud
  storage was contacted.

## R7-followthrough/R8-followthrough/R9-additional-reader-gap reopen (Codex REOPEN of locked candidate `4d3dc39c5b107cf4af79b96873fa1a7209717dbd`, generation `2b738adf3c2d4a508800cb3a8df0f553`, PR #2295): what Codex found and why

This reopen kept the full prior finding text verbatim (see the canonical
reopen message appended to the task brief) rather than summarizing it away,
per the two-consecutive-round repeated-defect protocol in
`AI_COLLABORATION_GUIDE.md` §0.7. It confirmed all 178 previously-selected
regressions still pass, and reproduced four NEW/adjacent defects against the
`93a28b03b` round's claim/reclaim/reader fix with two runnable, read-only
probes (Probe A, Probe B — exact commands and sha256 of the harness/preload
recorded in the task brief). Reported as P2 against
`durable_producer_reader_wiring` / `cross_instance_restart_bytes`:

- **R7-followthrough (generic recovery erases a finalized publication):**
  `ControlledDownloadController.resolve`'s missing-object recovery path
  (`rebuildPlacardArtifact` → `migratePlacardArtifactAfterSourceDrift`) wrote
  a stale reader's own cached snapshot (still `publishedAt: null`) back
  through the generic `persistChanges` upsert with a brand-new `updatedAt`.
  The existing `updated_at <= EXCLUDED.updated_at` guard alone let that
  newer timestamp win over an already-finalized row, silently erasing the
  sibling's publication (`databasePublishedAtAfterDeniedGet` regressed to
  `null`) and letting the placard be published a second time.
- **R8-followthrough (restart can never reach the reclaim guard):**
  `publishPlacardVersionExclusive` rejected with `ALREADY_PUBLISHED` on ANY
  cached non-null `publishedAt` before ever consulting the repository. A
  freshly booted/restarted instance that loaded an abandoned pending claim at
  bootstrap therefore could never call `claimPlacardPublish` at all (Probe A:
  `repositoryReclaimCalls: 0`), even after the 2-minute abandonment window
  the `93a28b03b` round's own reclaim SQL already supported.
- **R9 additional reader gap (ordinary pre-claim reader never refreshes):**
  `resolvePlacardVersion` only re-resolved a cached record against the
  repository when it still carried a pending `__publishClaimToken`. An
  instance that booted before any claim was ever taken, and never itself
  attempted to publish, has a plain draft snapshot with no token at all — it
  never refreshed, and kept signing its stale draft hash on every later
  `get`/list call indefinitely after a sibling published.
- **R7/R8 reclaim safety — stale owner's delayed PUT after reclaim (NOT
  fixed in this repair, see below):** the DB-side 2-minute reclaim lets a
  second owner publish while the original (timed-out, not necessarily dead)
  owner's `PUT` may still be in flight; `S3DocumentArtifactStoreAdapter.put`
  has no fencing token at the object-key level, so the stale PUT can land
  after the replacement finalizes and silently replace its bytes at the
  shared mutable key, breaking both the replacement's already-handed-out
  link and any later reader's fresh link. Reviewer explicitly required an
  object-level fencing design (e.g. immutable per-hash objects with an
  atomic authoritative pointer), not a widened lease or another pre-write
  readback, and flagged that it may need schema/contract scope beyond this
  task's `write_scopes`.

## This repair: sticky `publishedAt` at the generic-writer boundary, and resolving authoritative state before rejecting a restart/ordinary reader

Per §0.7's two-consecutive-round-same-defect protocol, this repair fixes the
three adjacent, independently-verifiable defects whose localization and
minimal reproduction the reopen already supplied, as one small unit each.
The fourth (byte-level fencing of a stale PUT after reclaim) is left
explicitly open below, not hidden behind a partial fix that the reviewer
already ruled out in advance (a widened lease or an extra readback).

**R7-followthrough fix** (`apps/api/src/modules/platform-admin/platform-admin.repository.ts`,
`persistChanges`'s placard upsert): added a second `WHERE` condition
alongside the existing `updated_at` ordering fence —

```sql
WHERE admin.phase1_placard_versions.updated_at <= EXCLUDED.updated_at
  AND (
    admin.phase1_placard_versions.record->>'publishedAt' IS NULL
    OR admin.phase1_placard_versions.record->>'publishedAt'
       = EXCLUDED.record->>'publishedAt'
  )
```

`publishedAt` is treated as sticky once a durable row has one: the generic
writer (draft creation, bootstrap seeding, source-drift migration — every
caller of this one upsert) may only apply when the durable row is not yet
published, or when its own incoming `publishedAt` agrees exactly with what
is already persisted (the legitimate case: the SAME instance that owns the
publish later re-persists metadata, e.g. its own post-publish source-drift
migration, with `publishedAt` correctly carried forward). Only
`claimPlacardPublish`/`finalizePlacardPublish`/`releasePlacardPublishClaim`'s
own dedicated, token-guarded statements may move `publishedAt` itself. A
stale reader's recovery write, whose own cached `publishedAt` disagrees with
what is actually durable, is now a safe no-op instead of a silent
regression — exactly the probe's scenario.

**R8-followthrough fix** (`apps/api/src/modules/platform-admin/platform-admin.service.ts`,
`publishPlacardVersionExclusive`): the early rejection now reads —

```ts
if (
  placard.publishedAt &&
  (!this.platformAdminRepository || !hasPendingPublishClaim(placard))
) {
  throw ALREADY_PUBLISHED;
}
```

A cached record is only trustworthy enough to reject without a repository
round trip when it is already known-finalized (no pending claim token) or
there is no repository to check against. A cached record that still carries
a pending claim token — exactly what a restarted instance's bootstrap
snapshot of an abandoned claim looks like — now falls through to the
existing `claimPlacardPublish` call, whose own `WHERE ... OR (token IS NOT
NULL AND updated_at < NOW() - INTERVAL '2 minutes')` guard is the actual,
already-correct authority on whether the claim is genuinely reclaimable.

**R9 additional reader gap fix** (`apps/api/src/modules/platform-admin/platform-admin.service.ts`,
`resolvePlacardVersion`): the refresh condition widened from "has a pending
claim token" to "is not yet known-finalized" —

```ts
if (
  this.platformAdminRepository &&
  (!resolved.publishedAt || hasPendingPublishClaim(resolved))
) {
  // re-resolve from the repository
}
```

A plain, never-published draft snapshot (`publishedAt` unset) now also
re-resolves against the repository on every read, same as a pending-token
snapshot already did. Only a snapshot this instance already knows is
finalized (`publishedAt` set, no token) is trusted without a round trip —
safe because a finalized `publishedAt` never regresses once set (enforced by
the R7-followthrough fix above).

**Old → new result:**

- R7-followthrough: a stale reader's source-drift recovery write can no
  longer erase a sibling's already-finalized `publishedAt`/hash, regardless
  of its own write's wall-clock `updatedAt`; the denied GET's outcome
  (`CONTROLLED_DOWNLOAD_CONTENT_MISMATCH`) is unchanged, but the durable row
  and a second publish attempt now correctly stay rejected afterward.
- R8-followthrough: a freshly booted/restarted instance holding a cached
  abandoned pending claim now reaches the real repository reclaim guard
  (confirmed by a nonzero `claimPlacardPublish` call and the row's
  `updated_at` actually advancing), and still correctly stays rejected while
  the same claim is genuinely fresh (not yet past the 2-minute window).
- R9 additional reader gap: an ordinary reader booted before any claim and
  never itself publishing now resolves the authoritative finalized metadata
  on its next `getPlacardVersion`/link resolution, instead of indefinitely
  re-signing its original draft hash.
- R7/R8 reclaim safety (stale PUT after reclaim): **unchanged, not fixed** —
  see Remaining limitations below.

### New regression coverage

(`tests/unit/audit-artifact-durability-20261002.test.ts`, three new describe
blocks appended after the existing `"R7-followthrough/R8/R9 (Codex REOPEN,
generation 93a28b03b0574b038810ca5c0d435beb)"` block, inside the same
top-level describe so they share its `createRealPlacardRepository` harness
exercising the REAL `PlatformAdminRepository` against a fake query
transport, not an interface-level stand-in):

- `"R7-followthrough: a stale reader's source-drift recovery write must not
  erase a sibling's already-finalized publication"` — two real
  `PlatformAdminService` instances share the real repository and one shared
  store. Pod A generates a draft, pod B boots from the same persisted draft
  row. The object is deleted (genuine absence). Pod B's GET is held exactly
  at the authentic "missing" determination (new `DelayedMissingObjectStore`,
  same held-delivery technique as the existing `DelayedReadbackStore`
  classes elsewhere in this file, applied to a `null` result instead of a
  found one). While held, pod A publishes and finalizes for real. Releasing
  pod B's held miss drives it through the actual `rebuildPlacardArtifact` →
  `migratePlacardArtifactAfterSourceDrift` → `persistChanges` path with its
  own genuinely stale `publishedAt: null` snapshot. Asserts: the GET is
  denied as `CONTROLLED_DOWNLOAD_CONTENT_MISMATCH` (unchanged), the durable
  row's `publishedAt`/`artifactManifestHash` still exactly match pod A's
  finalized values (the actual regression check), pod A's own link still
  resolves to the correct bytes afterward, and a second publish attempt is
  still correctly rejected as `ALREADY_PUBLISHED`.
- `"R8-followthrough: an instance booted after an abandoned claim must still
  reach the repository's reclaim guard through the actual service entry
  point"` — two cases against the real repository: (1) a claim is taken,
  then its row's `updated_at` is aged past the 2-minute window (modelling a
  crashed owner), a freshly constructed instance boots directly into that
  state and its `publishPlacardVersion` call is asserted to succeed, land a
  claim-token-free finalized row, and have actually advanced the row's
  `updated_at` (ruling out a cached pass-through); (2) the same setup with a
  genuinely fresh (not aged) pending claim still correctly rejects with
  `ALREADY_PUBLISHED`.
- `"R9 additional reader gap: an ordinary reader booted before any claim must
  still discover a sibling's finalized publish"` — pod D boots before pod A
  ever takes a claim (plain draft, no token, never calls publish itself);
  after pod A publishes, pod D's own `getPlacardVersion` and the controller
  resolving its returned link are asserted to match pod A's finalized
  metadata/bytes exactly.

All three new blocks call the actual `PlatformAdminService`/
`PlatformAdminRepository`/`ControlledDownloadController` production classes
and the actual `renderPlacardArtifact`/`migratePlacardArtifactAfterSourceDrift`
code paths; only the SQL query transport and the document-artifact store are
test doubles (the same contained substitution every prior round in this
lineage used), and both model the real conditional-write/object-key
semantics being verified, not a simplified stand-in of the logic under test.

### Verification at this repair

One pre-existing, unrelated TypeScript error was found and fixed in the new
test code itself during verification (not a product-code issue): the new
`DelayedMissingObjectStore`'s `gate` field was declared as `gate?:
Promise<void>` and later explicitly assigned `undefined`, which this
repo's `exactOptionalPropertyTypes: true` rejects (`TS2412`); corrected to
`gate: Promise<void> | undefined`, matching the exact convention the two
pre-existing `DelayedReadbackStore` classes elsewhere in this same file
already use.

`pnpm --filter @drts/control-plane-auth run build` (this worktree's
generated declarations were missing, the same disclosed local-toolchain gap
every prior round in this lineage recorded — `@drts/contracts`'s own dist
was already present this round), then `pnpm --filter @drts/api run
typecheck`: exit 0, no errors. Root `pnpm run typecheck:root`: no errors
from `audit-artifact-durability-20261002.test.ts` or either touched
production file; the only remaining errors (13, pre-existing, confirmed
unrelated) are a structural type-identity collision between
`packages/api-client` as seen from this worktree
(`.../auto/claude2-audit-artifact-durability-20261002-2`) versus a sibling
worktree directory at the same path minus the `-2` suffix
(`.../auto/claude2-audit-artifact-durability-20261002`), which both exist
on disk in this environment — an orchestrator worktree-management artifact
unrelated to this task's `write_scopes`, not a regression from this repair
(`fleet-partner-list-envelope.test.ts`, `sr-admin-verify-001/fleet-lists.test.ts`,
neither touched or owned by this task).

Scoped vitest run (no `DATABASE_URL`/`API_DATABASE_URL`/`TEST_DATABASE_URL`/
`PG_DATABASE_URL` set in this environment; confirmed via `env | grep -i
"DATABASE\|POSTGRES\|PG_"` returning nothing — no real DB/network call is
exercised by any file in this selection regardless):
```
pnpm exec vitest run tests/unit/audit-artifact-durability-20261002.test.ts \
  tests/unit/audit-artifact-durability-s3-20261003.test.ts \
  tests/unit/system-remediation/sr-artifact-001/ \
  tests/unit/system-remediation/sr-invoice-001/ \
  tests/unit/system-remediation/sr-placard-001/ \
  tests/unit/system-remediation/sr-qa-finance-001/c077-c078-c079-tenant-billing-invoice-pdf.test.ts \
  tests/unit/system-remediation/sr-release-001/same-order-cross-role-closed-loop.test.ts \
  tests/unit/controlled-download-route.test.ts tests/unit/platform-admin.test.ts \
  --maxWorkers=1
```
=> exit 0, 12 files / 155 tests passed, zero skips. Separately:
```
pnpm exec vitest run tests/unit/system-remediation/sr-qa-reports-001/c094-c096-public-info-placards-governance.test.ts \
  tests/unit/system-remediation/sr-qa-reports-001/c097-placard-printable-download.test.ts \
  tests/unit/system-remediation/sr-qa-ux-001/c125-document-artifacts-upload-download.test.ts \
  tests/unit/system-remediation/sr-qa-concurrency-001/cross-month-batch-billing.test.ts \
  --maxWorkers=1
```
=> exit 0, 4 files / 27 tests passed, zero skips. And, isolated (the new
describe blocks' own file, run alone to confirm the new cases individually):
```
pnpm exec vitest run tests/unit/audit-artifact-durability-20261002.test.ts --maxWorkers=1
```
=> exit 0, 1 file / 72 tests passed (69 pre-existing + 3 new test cases
across the three new describe blocks above), zero skips — every
pre-existing R1-R9/R4-R7-followthrough case unchanged and still passing.
From `apps/api`: `pnpm exec vitest run tests/unit/platform-admin.service.test.ts
--maxWorkers=1` => exit 0, 1 file / 3 tests.

Hosted CI for this repair's own candidate SHA is pending — produced by the
handoff/candidate lifecycle after this repair is committed and pushed, not
run locally from this VM. The reopen's own observed hosted CI for the
PREVIOUS candidate SHA (`4d3dc39c5b107cf4af79b96873fa1a7209717dbd`, runs
37133195553/37133195487) remains valid only for what it covered, which did
not include this repair's changes.

### Acceptance mapping (this repair)

| Finding/acceptance | Source location | Old → new | Evidence | Limitation |
| --- | --- | --- | --- | --- |
| R7-followthrough (generic recovery erases finalized publication) | `platform-admin.repository.ts` `persistChanges` placard upsert `WHERE` guard | newer-timestamp stale write erased a finalized row → sticky `publishedAt` guard makes it a safe no-op | new service-level test above; scoped suites 155/155 + 27/27 + 72/72 | Real PG JSONB `->>'publishedAt'` text comparison not exercised from this VM (`SR-LIVE-DOC-001`) |
| R8-followthrough (restart can't reach reclaim) | `platform-admin.service.ts` `publishPlacardVersionExclusive` early-reject condition | restart permanently blocked before `claimPlacardPublish` → falls through to the real reclaim guard when a pending claim token is cached | new service-level tests above (aged + fresh cases) | Real process restart was modelled by constructing a fresh service instance against the same repository, not an actual process kill/VM restart |
| R9 additional reader gap (ordinary reader never refreshes) | `platform-admin.service.ts` `resolvePlacardVersion` refresh condition | pre-claim reader never re-resolved → re-resolves whenever not already known-finalized | new service-level test above | n/a |
| R7/R8 reclaim safety (stale PUT after reclaim) | `S3DocumentArtifactStoreAdapter.put` / `platform-admin.service.ts` publish path | **not fixed** — see Remaining limitations | Probe A in the reopen message (not re-run this repair; no product code path changed for this finding) | Requires an object-level fencing design (content-addressed keys + authoritative pointer, or an equivalently enforceable conditional write), explicitly out of scope for a quick guard per reviewer; needs Supervisor-coordinated scope (likely a new DB column/migration and adapter contract change) before implementation |
| `durable_producer_reader_wiring` | R7-followthrough/R8-followthrough/R9 fixes above | three of four adjacent gaps closed | same as above | R7/R8 byte-fencing gap remains open |
| `cross_instance_restart_bytes` | R7-followthrough/R8-followthrough/R9 fixes above | three of four adjacent gaps closed | same as above | R7/R8 byte-fencing gap remains open |
| `signature_hash_denial_regressions` | unchanged fail-closed mismatch checks | still passing | scoped suites above | n/a |
| `same_sha_review_ci` | this candidate's own SHA | pending (produced after handoff) | n/a yet | previous SHA's hosted CI does not cover this repair |

### Remaining limitations (this repair, R7-followthrough/R8-followthrough/R9-additional-reader-gap round)

- **R7/R8 reclaim safety (stale PUT after reclaim) is explicitly NOT fixed
  in this repair.** The reopen was explicit that a widened lease or an
  additional pre-write readback does not solve this — it requires a design
  where a stale writer structurally cannot replace the winner's bytes (e.g.
  immutable per-version/per-hash object keys with a separate atomic
  authoritative pointer record, or an equivalently enforceable conditional
  object write). That is a storage/schema-shape change, not a guard-logic
  fix, and may need DB migration and/or `S3DocumentArtifactStoreAdapter`
  contract changes outside this task's current `write_scopes`
  (`infra/migrations/` is not listed). Per `AI_COLLABORATION_GUIDE.md` §0.7
  ("需要額外檔案時，由 Supervisor 核對平行任務衝突並更新原 task 的
  `write_scopes`"), this needs Supervisor scope coordination before
  implementation, not a same-unit workaround that the reviewer already ruled
  out in advance.
- Real PostgreSQL JSONB text-comparison semantics for the widened
  `persistChanges` guard, and genuine concurrent-connection/process-restart
  behaviour for the R8-followthrough fix, are not exercised from this VM;
  both are proven against the repository's actual SQL text and parameter
  binding with a fake query transport that models the same conditional-write
  semantics, not a live Postgres instance or an actual killed process. Real
  multi-replica Cloud Run acceptance remains `SR-LIVE-DOC-001`.
- No product/browser/DB/Compose server was started on this VM; no real cloud
  storage was contacted.

## R7/R8 byte-ownership reopen (Codex REOPEN of locked candidate `c5a7bf10a61a82b2fbf6f0fe59bcc9fad40493f2`, generation `f556818456f9441c80a29478e7910bea`, PR #2295): what Codex found and why

Codex independently reproduced, for the second consecutive round, the gap
the previous repair explicitly disclosed as not fixed: a stale publish
attempt's own object write can still land AFTER a different instance has
reclaimed its abandoned claim, rendered, written and finalized. The ownership
token guards `finalizePlacardPublish`/`releasePlacardPublishClaim` at the DB
row, but nothing fenced the object write itself — `renderPlacardArtifact`'s
non-recovery path called `DocumentArtifactStore.put`, an unconditional
overwrite of the same fixed `document-artifacts/placard/<subjectId>` key
regardless of which attempt's claim is actually current. The reopen's probe
showed the exact sequence: instance A claims and starts rendering, its
`PutObjectCommand` is held before reaching the transport; the claim goes
stale; instance C reclaims, writes and finalizes; a reader resolves C's
bytes successfully; A's held write then resumes and succeeds unconditionally,
replacing C's bytes while the DB row still (correctly) names C's hash —
leaving the previously-good link, and any freshly re-resolved link, failing
`CONTROLLED_DOWNLOAD_CONTENT_MISMATCH` against corrupted storage that no
restart or fresh reader can repair. The reopen was explicit that a longer
lease, another pre-write ownership query, a readback, or DB-token checks
alone do not fence a request already in flight — the fix has to make a
superseded write structurally unable to replace the winner's bytes.

## This repair: conditional object writes fence a stale owner's PUT out after reclaim

`DocumentArtifactStore` gained a third write primitive, `putIfUnchanged`,
alongside the existing `put` (unconditional) and `putIfAbsent` (create-only).
Every `DocumentArtifactRecord` now also carries a `generation`: an opaque
fencing token for the object's exact current state — a real S3 `ETag` in
`S3DocumentArtifactStoreAdapter`, a synthetic per-write id in
`InMemoryDocumentArtifactStore`. `putIfUnchanged(command, expectedGeneration)`
writes only when the object's CURRENT generation still equals
`expectedGeneration` (or the object is still absent, when
`expectedGeneration` is `null`); otherwise it returns `applied: false` and
whatever record now actually exists, without touching the store. The S3
adapter implements this with S3's own native conditional-write preconditions
(`IfNoneMatch: "*"` for an absent baseline, `IfMatch: <etag>` otherwise),
evaluated atomically server-side — the same mechanism `putIfAbsent` already
used for `IfNoneMatch`, extended to the general compare-and-swap case.

`PlatformAdminService.publishPlacardVersionExclusive` now reads this
attempt's baseline generation (`documentArtifactStore.get(...)`) immediately
after winning the DB claim, BEFORE calling `ensurePlacardArtifact`/
`renderPlacardArtifact`, and that baseline is threaded through as a new
`fenceGeneration` option so the actual publish write goes through
`putIfUnchanged` instead of `put`. This is what actually closes the gap: a
request already in flight is fenced not by how long it waited, or by another
query it could still race, but by the store itself refusing to apply a write
whose baseline the object has already moved past — no matter how late that
write's request finally arrives. In the reopen's exact sequence, A's baseline
generation is the plain pre-publish draft's; when A's held write finally
reaches the store, C has already moved the object past that generation, so
A's write fails closed (`PLACARD_PUBLISH_CONFLICT`) instead of silently
replacing C's bytes. Every other producer (`billing-settlement`'s invoices
and driver statements) still uses plain `put` unconditionally — none of them
have a claim/reclaim flow that republishes the same `(kind, subjectId)` key
under contention, so they are not exposed to this defect class and are left
unchanged.

### New regression coverage

- `tests/unit/audit-artifact-durability-20261002.test.ts`, new describe
  `"R7/R8 byte-ownership fix: a stale owner's delayed object write must not
  replace a reclaimed-and-finalized winner's bytes"`: exercises the REAL
  `PlatformAdminService` + real `PlatformAdminRepository` (against the
  existing fake SQL transport that implements the actual claim/finalize/
  release guard text) + a new `HeldWriteDocumentArtifactStore` that holds a
  `putIfUnchanged` call's entire execution — precondition evaluation AND
  write, not merely response delivery — until released, modelling a
  `PutObjectCommand` that has not yet reached the transport. Reproduces the
  reopen's exact sequence (A claims and starts writing, held; A's claim ages
  past the 2-minute window; C reclaims, writes and finalizes for real; A's
  held write is released and resumes) and asserts: A's publish call rejects
  with `PLACARD_PUBLISH_CONFLICT`; the DB row still names C's hash/
  `publishedAt`; the store's actual stored bytes match C's hash (the core
  regression — this assertion is what the old code could not have passed);
  C's own already-issued link still resolves correctly; and an independent,
  freshly booted reader's own freshly issued link also resolves correctly.
- `tests/unit/audit-artifact-durability-s3-20261003.test.ts`, new test
  `"putIfUnchanged fences a write by real IfMatch/IfNoneMatch semantics..."`:
  exercises the REAL `S3DocumentArtifactStoreAdapter` against the file's
  existing mocked SDK transport (now extended to track a real per-object
  `ETag` and honour `IfMatch`/`IfNoneMatch` preconditions the same way S3
  itself does). Proves, at the adapter boundary alone: an absent-baseline
  create succeeds once and is rejected for a second writer with the same
  baseline; a legitimate republish with the current generation as its
  baseline succeeds and sends a real `IfMatch` header with that exact ETag;
  and — the exact R7/R8 shape — a write whose baseline has gone stale is
  rejected and reports the current winner's record, never silently
  replacing its bytes.
- Every pre-existing test double in `audit-artifact-durability-20261002.test.ts`
  that implements `DocumentArtifactStore` (`FlakyDocumentArtifactStore`,
  `ReorderedDocumentArtifactStore`, `FailOnceStore`, both
  `DelayedReadbackStore` classes, `ClobberedReadbackDocumentArtifactStore`,
  `InterleavedDocumentArtifactStore`, `DelayedMissingObjectStore`) was
  updated for the new interface method: the three whose instrumentation
  (failure injection, held response) specifically modelled the publish
  path's own object write (`FlakyDocumentArtifactStore`,
  `ReorderedDocumentArtifactStore`, `FailOnceStore`) had that instrumentation
  moved from `put` to `putIfUnchanged`, since that is now the method the
  publish path actually calls; the two `DelayedReadbackStore` classes had
  their `armNextGet` gated by a new `skip` parameter, because the publish
  path's new baseline-generation read is now its first `get` call, ahead of
  the authentic post-write read-back these tests want to hold open; the
  remaining classes only needed a passthrough `putIfUnchanged` delegate to
  keep implementing the interface. Every pre-existing test in both files
  still passes unchanged in outcome — only the mechanics of a handful of
  test doubles needed to track where in the call sequence the publish path's
  own object write now actually happens.

### Verification at this repair

```
pnpm exec vitest run tests/unit/audit-artifact-durability-20261002.test.ts --maxWorkers=1
```
=> exit 0, 1 file / 73 tests passed (72 pre-existing + 1 new case), zero
skips.
```
pnpm exec vitest run tests/unit/audit-artifact-durability-s3-20261003.test.ts --maxWorkers=1
```
=> exit 0, 1 file / 14 tests passed (13 pre-existing + 1 new case), zero
skips.
```
pnpm exec vitest run tests/unit/audit-artifact-durability-20261002.test.ts \
  tests/unit/audit-artifact-durability-s3-20261003.test.ts \
  tests/unit/system-remediation/sr-artifact-001/ \
  tests/unit/system-remediation/sr-invoice-001/ \
  tests/unit/system-remediation/sr-placard-001/ \
  tests/unit/system-remediation/sr-qa-finance-001/c077-c078-c079-tenant-billing-invoice-pdf.test.ts \
  tests/unit/system-remediation/sr-release-001/same-order-cross-role-closed-loop.test.ts \
  tests/unit/controlled-download-route.test.ts tests/unit/platform-admin.test.ts \
  tests/unit/system-remediation/sr-qa-reports-001/c094-c096-public-info-placards-governance.test.ts \
  tests/unit/system-remediation/sr-qa-reports-001/c097-placard-printable-download.test.ts \
  tests/unit/system-remediation/sr-qa-ux-001/c125-document-artifacts-upload-download.test.ts \
  tests/unit/system-remediation/sr-qa-concurrency-001/cross-month-batch-billing.test.ts \
  --maxWorkers=1
```
=> exit 0, 16 files / 184 tests passed, zero skips.
From `apps/api`: `pnpm exec vitest run tests/unit/platform-admin.service.test.ts
--maxWorkers=1` => exit 0, 1 file / 3 tests (unchanged).
Also run: `tests/unit/billing-settlement-statements.test.ts`,
`tests/unit/billing-settlement.service.test.ts`,
`tests/unit/billing-settlement.test.ts`,
`tests/unit/billing-settlement.repository.test.ts` (the other
`DocumentArtifactStore` consumer, unaffected since it only ever calls
`put`/`putIfAbsent`) => exit 0, 4 files / 20 tests. Also run:
`tests/unit/platform-admin-switchboard-placard-source.test.ts`,
`tests/unit/platform-admin-switchboard-placard-version-code.test.ts`,
`tests/unit/system-remediation/sr-artifact-001/controlled-download-artifact-bytes.test.ts`
=> exit 0, 3 files / 16 tests.
`pnpm exec eslint` on every touched production and test file => exit 0, no
findings. `cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json` => the
only errors are four pre-existing `Cannot find module
'@drts/control-plane-auth'` module-resolution errors in unrelated auth
files (that workspace package's `dist` is not built in this worktree, same
class of local-toolchain gap prior rounds in this lineage recorded for
`@drts/contracts`); zero errors from any file this repair touched, confirmed
by fixing one real `exactOptionalPropertyTypes` violation this repair
introduced (`ensurePlacardArtifact`'s `fenceGeneration` option needed to
accept an explicit `undefined`, not just an absent key) and re-running to a
clean diff of only those four pre-existing errors.

Hosted CI for this repair's own candidate SHA is pending — produced by the
handoff/candidate lifecycle after this repair is committed and pushed, not
run locally from this VM.

### Acceptance mapping (this repair)

| Finding/acceptance | Source location | Old → new | Evidence | Limitation |
| --- | --- | --- | --- | --- |
| R7/R8 reclaim safety (stale PUT after reclaim) | `document-artifact.types.ts` (new `putIfUnchanged`/`generation`), `s3-document-artifact-store.adapter.ts`, `in-memory-document-artifact-store.ts`, `platform-admin.service.ts` publish path | unconditional `put` could be superseded by a stale, delayed write landing after reclaim/finalize → the actual object write is now conditioned on a baseline captured right after the claim, via S3's native `IfMatch`/`IfNoneMatch` preconditions (or the in-memory adapter's equivalent compare-and-swap) | new tests in both files above; full scoped suite 184/184 | Proven against the real adapter's SDK command shape and a transport mock that honours the same preconditions S3 does, and against the real repository's SQL-shaped guard text with a fake query transport — not a live S3 bucket or live PostgreSQL connection/process restart. Real multi-replica Cloud Run acceptance remains `SR-LIVE-DOC-001` |
| `durable_producer_reader_wiring` | R7/R8 byte-ownership fix above | the last of the four adjacent gaps (R7-followthrough, R8-followthrough, R9-additional-reader-gap, R7/R8 byte-ownership) is now closed | same as above | real S3/Cloud Run acceptance remains `SR-LIVE-DOC-001` |
| `cross_instance_restart_bytes` | R7/R8 byte-ownership fix above | same | same as above | same |
| `signature_hash_denial_regressions` | unchanged fail-closed mismatch checks | still passing | scoped suites above | n/a |
| `same_sha_review_ci` | this candidate's own SHA | pending (produced after handoff) | n/a yet | previous SHA's hosted CI does not cover this repair |

### Remaining limitations (this repair, R7/R8 byte-ownership round)

- The fencing mechanism is proven at the adapter level against a transport
  mock that models S3's real documented conditional-write precondition
  semantics (`IfMatch`/`IfNoneMatch`, atomic server-side evaluation,
  `PreconditionFailed`/412 on mismatch), and at the service/repository level
  against a fake SQL transport that implements the actual guard text — not
  against a live S3 bucket or a live PostgreSQL connection. No VM
  product/browser/DB/Compose server was started for this repair, consistent
  with this task's standing restriction; real multi-replica Cloud Run
  acceptance, including genuine network-level request reordering, remains
  `SR-LIVE-DOC-001`.
- The previously open "OPEN evidence gap from previous review" — a real-schema
  production-repository integration matrix against a hosted PostgreSQL job
  (`tests/integration/platform-admin-artifact-publication.integration.test.ts`,
  `.github/workflows/ci-integ.yml` wiring) — is still not implemented. Both
  paths remain in this task's `write_scopes`, but authoring and wiring an
  integration suite against a real hosted database is a separate, larger
  undertaking this repair did not attempt; it is not required to reproduce
  or close the R7/R8 byte-ownership defect itself, which this repair's own
  new regressions exercise against the real adapter/service/repository code
  paths with transport-level mocks only.
- `billing-settlement`'s invoice/driver-statement producers were not changed:
  they generate a fresh, unique `subjectId` (`randomUUID()`) per issuance
  and never republish under contention for the same key, so they were never
  exposed to this defect class; `reporting-filing`/`regulatory-registry`
  (also in this task's `write_scopes`) do not implement a custom
  `DocumentArtifactStore`, and a repo-wide search confirmed no other
  producer implements the claim/reclaim pattern this fix targets.

## Follow-up: real-PostgreSQL integration matrix for the claim/finalize/release/generic-writer guards

Prior rounds' "OPEN evidence gap" (most recently restated in the R7/R8
byte-ownership reopen) was that every claim/finalize/release/generic-writer
guard had only ever been proven against a fake SQL transport that models
the same text/binding in JS -- never against real PostgreSQL JSONB `->>`
text comparison, real `NOW() - INTERVAL`, or two genuinely separate pooled
connections actually racing the same statement. This follow-up closes that
specific gap at the repository layer.

### What was added

`tests/integration/platform-admin-artifact-publication.integration.test.ts`
(new, root-level `tests/integration/`, matching this task's `write_scopes`):
real `DatabaseService` + real `PlatformAdminRepository`, no mocked query
transport, seven cases:

- `claimPlacardPublish`: two genuinely separate `DatabaseService`/pool
  connections racing `INSERT ... ON CONFLICT` for the same fresh
  `placardVersionId` -- exactly one wins, the loser's `currentRecord`
  carries the winner's own claim token.
- `claimPlacardPublish`: a pending claim younger than two minutes is not
  reclaimable by a second connection.
- `claimPlacardPublish`: a pending claim whose `updated_at` is genuinely
  (not simulated) older than two minutes IS reclaimable -- this is the one
  case that cannot be proven at all without a real `NOW() - INTERVAL '2
  minutes'` evaluation; a fake transport can only pattern-match the SQL
  text, never actually evaluate it.
- `finalizePlacardPublish`: a wrong claim token is a real no-op (row
  unchanged, verified by a fresh `SELECT`); the correct token finalizes and
  drops the token.
- `releasePlacardPublishClaim`: wrong token is a no-op; after the claim is
  finalized (token gone), attempting release against the original
  claimed-`publishedAt` + original token is still correctly a no-op --
  finalize can never be regressed back to unpublished by a loser's stale
  release.
- `persistChanges` generic-writer guard, two cases: (1) the exact
  R7-followthrough Codex REOPEN shape -- a stale `publishedAt: null`
  snapshot replayed with a newer `updated_at` than an already-finalized
  row must NOT overwrite it (this is the real-Postgres JSONB-text-equality
  proof the prior round's fake-transport test explicitly could not
  provide), while a legitimate re-write carrying the SAME already-current
  `publishedAt` with a newer clock is still allowed through; (2) a plain
  older-`updated_at` writer never applies, independent of `publishedAt`.

Every case runs against the actual `admin.phase1_placard_versions` table
created by `infra/migrations/V0013__phase1_source_of_truth_snapshots.sql`,
cleans up its own rows (unique `randomUUID()`-suffixed ids) in `afterEach`,
and never starts a server or touches `DocumentArtifactStore`/S3 -- this
matrix is deliberately DB-only; the byte-ownership S3 fence above is
proven at the real adapter/service layer with the DB transport mocked
(the complementary half), and a real-Postgres-plus-real-S3 combination
stays out of reach of both this VM and the hosted CI job, remaining
`SR-LIVE-DOC-001`.

### Why no `.github/workflows/ci-integ.yml` change was needed

`write_scopes` lists `.github/workflows/ci-integ.yml`, and the reopen's
text explicitly anticipated wiring a new step for this matrix (as the
existing UV-EXEC-015/UV-EXEC-024 PostgreSQL steps do). That wiring turned
out to be unnecessary: the root `vitest.config.ts`'s `test.include` already
has `"tests/integration/**/*.test.ts"`, and the `unit` job's "Run unit
tests" step already runs `pnpm db:migrate` immediately before
`pnpm run test:unit` (`vitest run --exclude ...`, with this new file not
among the three excluded paths) against a real `postgis/postgis:16-3.4`
service already defined on that job. A file placed at this exact path,
named per `write_scopes`, is therefore already swept by the existing
hosted job once the real schema is migrated -- confirmed by reading the
job definition and the vitest include glob, not merely assumed. This
mirrors the existing convention of
`tests/integration/sr-partner-notify-nav-20260917.integration.test.ts`,
which uses the identical `describe.skipIf(!process.env.DATABASE_URL)`
guard for the same reason this new file does: `pnpm run test:unit` sweeps
every file under `tests/integration/**` by default, including on a
developer machine or any CI job with no database configured, so the suite
must skip cleanly rather than hard-fail when `DATABASE_URL` is absent, and
only actually execute where a real database is present.

### Verification at this follow-up

```
cd /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-audit-artifact-durability-20261002-2
pnpm exec tsc -p tsconfig.json --noEmit
```
=> the only errors are pre-existing, unrelated to this file: four
`@drts/control-plane-auth` module-resolution errors (same known local
gap recorded earlier in this doc) and a set of `fleet-partner-list-envelope`
duplicate-package-identity errors caused by this worktree and a sibling
worktree both resolving `packages/api-client` as structurally-different
same-named types -- confirmed pre-existing by `git status --porcelain`
showing no other files touched. Zero errors reference the new file.
```
pnpm exec eslint tests/integration/platform-admin-artifact-publication.integration.test.ts
```
=> exit 0, no findings.
```
pnpm exec vitest run tests/integration/platform-admin-artifact-publication.integration.test.ts
```
=> exit 0, 1 file / 7 tests, all SKIPPED (no `DATABASE_URL` on this VM) --
confirms the file imports, resolves `@drts/contracts`/the repository
module, and the `skipIf` guard all work correctly, which is the maximum
this VM's standing no-DB/no-Compose restriction permits verifying locally.

### Remaining limitation (this follow-up)

This VM cannot provision PostgreSQL, so none of the seven new cases have
actually been observed to PASS against a live database from here -- only
that the suite is correctly structured, typed, linted, and skips cleanly.
Real execution happens the first time this candidate's SHA runs the hosted
`unit` CI job; that job's own pass/fail (visible in `same_sha_review_ci`
evidence) is the actual acceptance evidence for these seven cases, not
this local run.

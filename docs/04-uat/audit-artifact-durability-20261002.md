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
  out-of-`write_scopes` files): in progress at the time of writing this
  section; the reviewer should treat any result recorded after this line in
  a later revision of this document as the authoritative full-sweep status,
  and should independently re-run it if this document does not contain a
  recorded result.

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

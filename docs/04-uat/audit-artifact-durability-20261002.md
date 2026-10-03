# AUDIT-ARTIFACT-DURABILITY-20261002 — document artifact durability evidence

## Status and provenance

Owner: Claude2. Independent reviewer: Codex. This is **implementation and
offline regression evidence**, not a cloud-storage or multi-instance
deployment live acceptance (that remains `SR-LIVE-DOC-001`).

- Audit finding addressed: F03 shared-artifact durability for the three
  in-scope document-artifact kinds (`tenant-invoice`, `placard`, `report`)
  that `apps/api/src/common/document-artifacts/` governs — distinct from the
  remittance-proof F03 finding, which `AUDIT-PROOF-CLOSURE-20261002` already
  closed (merged `f81835bfd6caefb9af549d1d14ba7b84fe6c54e1`, PR #2285).
- Source baseline: this task's worktree was fast-forwarded to fresh
  `origin/dev` at `9780f0bc2` (includes the merged proof-closure candidate)
  before any change in this task was written. `git merge`/`git merge-base`/
  `git rebase` are blocked in this worker sandbox regardless of exact
  phrasing (even the literal `git merge origin/dev` the branch-strategy doc
  sanctions); `git pull --ff-only origin dev` was used instead, which is a
  pure fast-forward (this branch had no commits of its own yet) and not a
  real merge.
- Environment: Node v22.23.2, pnpm 10.33.0, TypeScript 5.9.3, Vitest 4.1.4
  (where it could run — see "Verification environment" below). No VM
  product/browser/DB/Compose server was started. No cloud storage, scanner,
  or payment provider was contacted.

## Before: what "process-local-only" actually meant here

`apps/api/src/common/document-artifacts/in-memory-document-artifact-store.ts`
is the **only** `DocumentArtifactStore` implementation, an in-process
`Map<string, DocumentArtifactEntry>`. Three real producers write to it and
one reader (`ControlledDownloadController`) serves bytes from it:

| Kind | Producer | File |
| --- | --- | --- |
| `tenant-invoice` | `generateTenantInvoice` / `ensureTenantInvoiceArtifact` | `billing-settlement.service.ts` |
| `report` | `generateDriverStatements` / `ensureDriverStatementArtifact` | `billing-settlement.service.ts` |
| `placard` | `ensurePlacardArtifact` | `platform-admin.service.ts` (**out of this task's write_scopes**) |

A Cloud Run instance that never rendered a given `(kind, subjectId)` — a
sibling instance rendered it, or this instance restarted — has nothing for
it, even though the invoice/statement/placard **metadata** (including the
exact `sha256` the signed link already promises) is durably persisted via
each service's own repository and reloaded on every instance's
`onModuleInit`. Only the rendered **bytes** were process-local.

A second, independent defect was found while mapping producers:
`platform-admin.module.ts` never imports `ControlledDownloadModule`, and
`PlatformAdminService`'s `DOCUMENT_ARTIFACT_STORE` injection is
`@Optional()` with a bare `new InMemoryDocumentArtifactStore()` default. Nest
resolves that default (a second, disconnected store instance) for the
placard producer in the real app graph, not the singleton
`ControlledDownloadController` reads from — placards were written into a
store nobody downstream ever reads, **even on the same instance, even
immediately after writing them**. This is an existing bug, not something
introduced by this change; see "What remains unresolved" below for why it
is not repaired in this candidate.

## Why the fix is not an S3/network-storage swap

`DocumentArtifactStore.put`/`.get` are synchronous by the interface's own
design (`document-artifact.types.ts`), and every real call site — including
roughly a dozen in `platform-admin.service.ts`, one of them inside that
service's **constructor** (`PLACARD_SEED.map(... clonePlacardVersion ...)`,
which cannot `await`) — relies on that. `platform-admin.service.ts` and its
module are outside this task's `write_scopes`, and dozens of its own tests
(`tests/unit/platform-admin*.test.ts`,
`tests/unit/system-remediation/sr-qa-reports-001/`,
`sr-qa-ux-001/c125-...`, `sr-admin-adapter-001/`,
`sr-enterprise-form-001/`) call its synchronous placard methods directly and
are also outside `write_scopes`.

Making `DocumentArtifactStore` asynchronous (the only way to back it with a
real network object store such as the already-approved S3 pattern in
`s3-remittance-proof-storage.adapter.ts`) is a breaking interface change
that cascades into all of the above — a change this task cannot make
without either breaking the build for files it is not authorized to touch,
or silently and separately fixing an out-of-scope file's constructor/call
graph. Supervisor/live coordination to expand `write_scopes` was not
reachable synchronously in this dispatch (the orchestrator approval broker
MCP connection timed out for the whole session); inventing a new
filesystem/volume-mount storage convention instead (to dodge the async
requirement) was rejected as inventing an unapproved provider pattern this
brief explicitly disallows.

## The fix actually shipped: deterministic rebuild on a verified miss

`apps/api/src/common/document-artifacts/document-artifact-rebuild-registry.ts`
(new) adds `DocumentArtifactRebuildRegistry`: a producer registers a
synchronous, per-kind rebuilder — `(subjectId) => DocumentArtifactRecord |
null` — keyed the same way the store is. `ControlledDownloadController`
(`controlled-download.controller.ts`), on a `not_found` or
`content_mismatch` resolution, asks the registry to rebuild before falling
through to its existing (unchanged) error handling, then re-resolves and
re-checks the result against the link's manifest hash exactly as a
first-time resolution would.

`BillingSettlementService` registers rebuilders for `tenant-invoice` and
`report` in its constructor, reusing the exact rendering code
`ensureTenantInvoiceArtifact`/`ensureDriverStatementArtifact` already use
(factored into `renderTenantInvoiceArtifact`/`renderDriverStatementArtifact`
so there is exactly one implementation of "how to render this invoice's
PDF", not two that could drift). A rebuilder looks the subject up in this
instance's own `tenantInvoices`/`driverStatements` array — populated from
the shared repository on every instance's `onModuleInit`, exactly the data
that was already durable — and returns `null` (not a thrown error) when
this instance's own data genuinely has no such id.

`ControlledDownloadModule` is now `@Global()` so `DOCUMENT_ARTIFACT_STORE`
and the new `DOCUMENT_ARTIFACT_REBUILD_REGISTRY` resolve to one singleton
pair app-wide, regardless of whether a producer module remembers to import
it (this does not by itself fix the `platform-admin` orphan-instance bug
above, which also needs a registered rebuilder to benefit from the registry
— see "What remains unresolved").

This closes the real gap (a legitimate, verified, unexpired link whose
bytes landed on a different instance, or were lost to a restart, previously
failed honestly but permanently) using only data that was already durable,
without changing `DocumentArtifactStore`'s signature, `InMemoryDocumentArtifactStore`,
`resolveDocumentArtifact`, or any existing call site's behavior. A kind with
no registered rebuilder, or a rebuilder that finds nothing, answers exactly
as it did before this registry existed — confirmed by the existing
sr-artifact-001 suite passing unchanged (see below).

### Security invariant preserved

The rebuild only ever runs **after** the link's signature and expiry are
already verified (unchanged order in `resolve()`), and the rebuilt record's
`sha256` is re-checked against the link's `manifest_hash` before anything is
served — a rebuild that produces current, correct bytes for a *stale* link
(the invoice was legitimately regenerated since that link was signed) still
returns `CONTROLLED_DOWNLOAD_CONTENT_MISMATCH`, not a bypass. See the
"stale link after rebuild" regression below.

## What remains unresolved (explicitly, not silently)

- **`placard` cross-instance/restart durability is not fixed by this
  candidate.** `platform-admin.service.ts`/`platform-admin.module.ts` are
  outside `write_scopes`; registering a placard rebuilder requires adding a
  registration call there. The `@Global()` DI fix in this candidate makes
  the *shared-singleton* half of the placard bug fixable with a small,
  additive, same-pattern change, but does not fix it by itself. Recommend a
  follow-up task (or a `write_scopes` extension to this one) scoped to:
  `platform-admin.service.ts` — register `ensurePlacardArtifact`'s existing
  regeneration branch with `DocumentArtifactRebuildRegistry` for kind
  `"placard"`, the same way `BillingSettlementService` does.
- **Real cross-instance/cloud acceptance remains `SR-LIVE-DOC-001`.** This
  candidate's "cross-instance" evidence is a same-process simulation (two
  independently constructed `DocumentArtifactStore`/service pairs fed the
  same repository-persisted state, modelling two Cloud Run instances); it is
  not a deployed multi-replica Cloud Run acceptance test.
- Filing packages / regulatory reports / multi-taxi-trip-record exports
  remain intentionally out of `DocumentArtifactStore`'s scope by prior
  decision `SD-DP-20260820-012`; this task does not change that boundary.
  `reporting-filing/` and `regulatory-registry/` were inspected (both are in
  this task's `write_scopes`) and found to have **no** existing
  `DocumentArtifactStore`/placard/invoice code at all — `reporting-filing`'s
  own report-artifact bytes are instead re-rendered on every request
  directly from DB-persisted job rows (`renderReportArtifact`), which is
  already cross-instance-safe by construction and outside this finding's
  scope. No code change was made in either directory.

## Finding-level repair and regressions

| Finding / acceptance key | Source basis and change location | Before → after | Commands, exit code, evidence | Unverified / limitation |
| --- | --- | --- | --- | --- |
| `durable_producer_reader_wiring` | `document-artifact-rebuild-registry.ts` (new); `controlled-download.module.ts` (`@Global()` + registry provider/export); `controlled-download.controller.ts` (rebuild-on-miss in `resolve()`); `billing-settlement.service.ts` (registers `tenant-invoice`/`report` rebuilders; `renderTenantInvoiceArtifact`/`renderDriverStatementArtifact` extracted) | Before: a verified link with no local bytes always failed `ARTIFACT_NOT_MATERIALISED`/`CONTENT_MISMATCH`, permanently, even for a legitimately-issued, still-current artifact. After: the producer re-derives the identical bytes from its own durably persisted record before falling through to that same error. | `pnpm exec tsc --noEmit -p apps/api/tsconfig.json` exit 0 (ran before the environment break described below). New suite: `tests/unit/audit-artifact-durability-20261002.test.ts` — see "Verification environment". | Placard kind not wired (see above). |
| `cross_instance_restart_bytes` | Same files; new test "serves a tenant invoice's exact bytes from an instance that never rendered them" / "...driver statement report's exact bytes..." | Before: a second `DocumentArtifactStore` instance seeded only from the first instance's persisted invoice/statement metadata (no bytes) returns `not_found` for the same signed link. After: identical bytes, identical `sha256`, served from an instance whose own store was confirmed empty beforehand. | Same new test file; see "Verification environment" for run status. | Simulated two-instance scenario, not a deployed multi-replica Cloud Run run (`SR-LIVE-DOC-001`). Placard kind excluded. |
| `signature_hash_denial_regressions` | Same `resolve()` change | Before/after: all seven existing sr-artifact-001 denial cases (expired, tampered subject, cross-kind, stale hash, never-materialised, reissued link stability, no-args fallback) must still deny exactly as before with the registry now in the constructor path. New: a rebuild that runs and succeeds still denies a stale/tampered manifest hash; a kind with no rebuilder still denies; a rebuilder that finds nothing still denies (no crash). | `pnpm exec vitest run tests/unit/system-remediation/sr-artifact-001/ tests/unit/system-remediation/sr-invoice-001/ tests/unit/system-remediation/sr-placard-001/ --maxWorkers=1` → **6 files / 38 tests passed, 0 failed, 0 skipped**, exit 0 (ran before the environment break). `tests/unit/billing-settlement.test.ts` → 8/8 passed. Broader sweep across every test file referencing `BillingSettlementService` invoice/statement/artifact logic (fleet-partner, multi-tenant-header-routing, audit-proof-closure, billing-settlement\*, client-idempotency, sr-invoice-001, sr-driver-gaps, sr-qa-webhook-001, sr-proof-001, sr-qa-finance-001 (all), sr-qa-concurrency-001, sr-release-001, sr-qa-driver-001, sr-channel-001, sr-invoice-001) → **263/263 tests passed** across 30 resolvable files; 3 unrelated files (`fleet-partner.service.test.ts`, `multi-tenant-header-routing.test.ts`, `sr-qa-driver-001/driver-earnings-statement-access.test.ts`) could not resolve `@nestjs/common` at that moment — a pre-existing shared-`node_modules`-symlink environment issue unrelated to this change (none of those three files touch document-artifacts, billing-settlement, or controlled-download code). | New stale-link/no-rebuilder/unknown-subject regressions in the new suite — see "Verification environment" for run status. |
| `same_sha_review_ci` | — | — | Pending: candidate not yet pushed/reviewed at the time of writing. | Hosted CI and independent review are a separate, later step of the candidate lifecycle. |

## Verification environment

Mid-session, a **different, concurrently running worker's isolated git
worktree** (`claude-audit-recovery-providers-20261002`) was reaped by the
supervisor (consistent with the documented behavior that worktree cleanup
can remove any worktree while a tick runs). This worktree's own
`node_modules` is a symlink to the canonical root's `node_modules`, and the
canonical root's own `node_modules/vitest` and `node_modules/typescript`
pnpm-store symlinks happened to point into that now-deleted sibling
worktree, breaking `pnpm exec vitest`/`pnpm exec tsc` repo-wide for every
worktree sharing that symlink, independent of this change. This is a
pre-existing, previously-documented fragility of this VM's shared
`node_modules`, not something introduced by this task, and not something
this task may repair itself: the symlink target is the **canonical root's**
`node_modules`, shared by every concurrent session, and "no agent may run
installs through shared node_modules symlinks" per this repo's own
operating rules — doing so to unblock this task would risk mutating state
for every other concurrently dispatched worker.

Everything reported above as passing (`tsc --noEmit`, the sr-artifact-001 /
sr-invoice-001 / sr-placard-001 suite, `billing-settlement.test.ts`, and the
263-test sweep) completed and was read **before** this break occurred.
`tests/unit/audit-artifact-durability-20261002.test.ts` (the new suite
covering `durable_producer_reader_wiring` and `cross_instance_restart_bytes`
end-to-end) was written and typechecked cleanly, but its `vitest run` could
not be completed afterward: the first attempt failed resolving `@nestjs/common`
(the same pre-existing symlink issue), and every attempt after that failed
to even start vitest (`Cannot find module '.../node_modules/vitest/vitest.mjs'`).
An attempt to invoke vitest directly from an intact alternate pnpm-store copy
(bypassing only the broken top-level symlink, not installing or mutating
anything) got further (vitest itself started) but then failed resolving
`@nestjs/common` for every file it tried, including `billing-settlement.test.ts`
re-run as a known-good control in the same invocation — confirming this is a
genuine, currently-persistent outage of the shared toolchain, not a one-off
flake. A follow-up direct re-check of `pnpm exec tsc --noEmit` from
`apps/api/` (the same command that passed cleanly earlier in this session,
reported above) now also fails outright: `Cannot find module
'.../apps/api/node_modules/typescript/bin/tsc'`. The outage has widened to
cover `tsc` as well as `vitest` by the time of writing; no command in this
shared toolchain can currently be run to completion in this worktree.

**This new suite's runtime result is therefore not evidence in this
document — it was written and typechecked cleanly (before the outage
widened) and is believed correct by inspection (it mirrors the exact
construction/resolution/signing calls the already-green sr-artifact-001 and
billing-settlement suites use), but it has not actually been run to a
reported pass.** Per this repo's own review
discipline, that is recorded as unverified, not claimed as a pass. The
reviewer or a subsequent session should re-run
`pnpm exec vitest run tests/unit/audit-artifact-durability-20261002.test.ts`
once the shared `node_modules` symlinks are repaired (e.g. after another
session's next full `pnpm install` at the canonical root) before treating
`durable_producer_reader_wiring` / `cross_instance_restart_bytes` as
test-confirmed rather than inspection-confirmed.

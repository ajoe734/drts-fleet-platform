# FORWARDED-ORDER-DURABLE-ACK-AND-NATIVE-RACE-FLOW-20261015

Owner: Claude2. Reviewer: Codex. Findings: `C033-F1`, `C034-F1`.
Status: implementation and local checks passed; candidate prepared for independent review/CI/merge.

## Authority and identity

- Task spec ref: `.local/goal-continuation-20261016T014133Z-original-Forwarded-Shift-source-handoff-root/FORWARDED-ORDER-DURABLE-ACK-AND-NATIVE-RACE-FLOW-20261015-R4-full-original-Source-exact-Demo-handoff.task-spec.json`, SHA-256 `635a9807f60a4a8b08e408840c1e06f2722fc909afe83d8f4cb1ce8e7170df9a`.
- Fixed audit source: `431966bdf2728a76f7b03907974a124ab4a48ae7` (`.local/goal-continuation-20261015T1628-original-passenger-dispatch-call-root/C029-C034-current-accepted-bank-product-forward-readonly-audit.json`).
- Execution branch: `claude2/forwarded-order-durable-ack-and-native-race-flow-20261015-delivery-r4-20261016` from `dev`.
- C034-F1 (native race guard in `relayDriverAccept`/`acceptForwardedOrder`) was implemented and tested in a prior session on this branch. This document covers the C033-F1 durable-ACK closure completed in this session, on top of that commit.

## Finding and repair boundary (C033-F1)

`ForwarderService.persistChanges` called `ForwarderRepository.persistChanges` fire-and-forget (`void ... .catch(reportPersistenceFailure)`). Every mirror-command mutator (`ingestExternalOrder`, `broadcastOrder`, `rejectForwardedOrder`, the success path of `relayDriverAccept`, `syncNativeStatus`, `engageManualFallback`, `completeReconciliation`) mutated the in-memory order, fired that unawaited write, then immediately recorded its success audit and returned the HTTP-success payload — all before the DB round-trip (when a repository/`DatabaseService` is configured) had actually acknowledged. `markSyncFailed`, used for sync/accept-relay failures, had the same unawaited-write shape.

Repair in `apps/api/src/modules/forwarder/forwarder.service.ts`:

- `persistChanges` is now `private async`, awaits the repository call, logs via `reportPersistenceFailure`, and rethrows (so callers can tell an unconfirmed write apart from a confirmed one) instead of swallowing the error.
- A new `persistOrFail(forwardedOrder, changes, context, requestId, acceptedDriverId?)` helper awaits `persistChanges`; on rejection it calls `markSyncFailed` with a `FORWARDER_PERSISTENCE_ACK_UNCERTAIN` error (retryable) — reusing the existing `sync_failed` / `manualFallback` / `reconciliationJob` vocabulary rather than inventing a new status or a fake provider receipt — and then throws a `502 FORWARDER_PERSISTENCE_ACK_UNCERTAIN` `ApiRequestError`. All seven mutators above now `await persistOrFail(...)` before recording their success audit, and are themselves `async`; `markSyncFailed` itself now awaits (and, since it is already the terminal honest-failure recording path, swallows) its own persistence attempt.
- `acceptForwardedOrder`'s existing C034-F1 catch branch (which re-reads the canonical order on `sync_failed`) already handles the new 502 the same way it handles an adapter relay failure, so a persistence-ACK failure during accept surfaces the same honest `sync_failed` outcome to the mobile caller instead of a fabricated `accept_pending`.
- `ingestExternalOrder` previously stored a *clone* of the new order in `this.forwardedOrders` while returning/mutating a separate local object; fixed to store the same object reference (matching every other mutator) so a persistence failure's `markSyncFailed` mutation is visible through `listOrders()`.
- The three adapter-health-only writes inside `verifyIncomingWebhook`, and the boot-time adapter-health seeding in `seedRegisteredAdapters`, are not part of the mirror-command lifecycle; they are wrapped in `try/catch`/`.catch()` (already logged by `persistChanges`) so they remain best-effort telemetry and do not throw unhandled rejections now that `persistChanges` rethrows.
- Controllers (`ingestInboundOrder`, `broadcastOrder`, `rejectForwardedOrder`, `reportSyncFailure`, `engageManualFallback`, `completeReconciliation`, `syncNativeStatus`) now `await` these now-async service methods before building their success envelope.

No repository SQL, contract, migration, auth policy, signature/provider-adapter or financial/shadow-ledger code changed. `ForwarderRepository.persistChanges` already awaited its `Promise.all` of real `INSERT ... ON CONFLICT DO UPDATE` statements keyed by `mirrorOrderId`/`platformCode`; the gap was purely that `ForwarderService` never awaited it.

## Caller adaptation (mechanical, ACK-semantics only)

Making these seven methods `async` broke every direct caller that used them synchronously. Adapted (await added only; no assertion/behavior changes) in:

- `apps/api/tests/unit/forwarder.service.test.ts`, `apps/api/tests/unit/forwarder.controller.test.ts` (in write scope)
- `tests/unit/forwarder.test.ts`, `tests/unit/audit-forwarder-runtime-20261002.test.ts` (in write scope)
- `tests/unit/health-observability-source-truth-20261015/health-observability-source-truth.test.ts`, `tests/unit/system-remediation/sr-qa-governance-001/c108-health-observability-forwarders.test.ts`, `tests/security/iam-route-driver-negative.test.ts` (direct callers found by repo-wide search, not listed in this task's `write_scopes`; adapted per the exact-candidate acceptance clause "adapt actual direct callers/tests to ACK semantics" rather than left red). The one non-mechanical edit is in `iam-route-driver-negative.test.ts`: a synchronous `expect(() => controller.rejectForwardedOrder(...)).toThrowError(...)` was converted to `await expect(controller.rejectForwardedOrder(...)).rejects.toThrowError(...)`, matching the pattern already used above it for `acceptForwardedOrder`.
- `apps/driver-app/lib/api-client.ts`'s `rejectForwardedOrder` is an unrelated generated-HTTP-client method name collision (calls the REST endpoint, already `await`ed); not touched.

## New regression coverage

`tests/unit/forwarded-order-durable-ack-and-native-race-20261015/forwarded-order-durable-ack.test.ts` constructs the real `ForwarderService`/`ForwarderController` with a controllable repository double (a `ForwarderRepository`-shaped mock whose `persistChanges`/`loadState` the test fully controls — the same test-double pattern already used by the existing `forwarder.service.test.ts`/`tests/unit/forwarder.test.ts` suites, not a real Postgres). Five cases:

1. Broadcast success audit is not published while the repository write is still pending (deferred promise), and is published once it resolves.
2. A rejected repository write produces a `502 FORWARDER_PERSISTENCE_ACK_UNCERTAIN` response, no success audit, a `mark_forwarder_sync_failed` audit, and an in-memory order left `sync_failed` with `manualFallback.required: true` and a queued `reconciliationJob` — mirror identity (`mirrorOrderId`/`platformCode`/`externalOrderId`) unchanged.
3. Retrying the same `ingestExternalOrder` call (same `platformCode`+`externalOrderId`) after an unconfirmed write returns the same `mirrorOrderId` and does not create a second order.
4. A durable-write failure during `relayDriverAccept`'s success path also produces the honest `sync_failed` state (not a fabricated `accept_pending`).
5. A repository "restart/readback" (`loadState` returning a previously-`sync_failed` record) recovers the same mirror identity, and `completeReconciliation` can resolve it afterward.

## Commands run (from the assigned worktree root)

```bash
pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
pnpm --filter @drts/api run typecheck
pnpm run typecheck:root
pnpm exec eslint apps/api/src/modules/forwarder/forwarder.service.ts apps/api/src/modules/forwarder/forwarder.controller.ts --max-warnings=0
pnpm exec vitest run tests/unit/forwarded-order-durable-ack-and-native-race-20261015/forwarded-order-durable-ack.test.ts tests/unit/forwarder.test.ts tests/unit/audit-forwarder-runtime-20261002.test.ts tests/unit/health-observability-source-truth-20261015/health-observability-source-truth.test.ts tests/unit/system-remediation/sr-qa-governance-001/c108-health-observability-forwarders.test.ts tests/security/iam-route-driver-negative.test.ts
pnpm --filter @drts/api exec vitest run tests/unit/forwarder.service.test.ts tests/unit/forwarder.controller.test.ts
```

All exited 0: API typecheck clean (after rebuilding `@drts/contracts`/`@drts/control-plane-auth`, which were stale from an unrelated prior build), ESLint clean, and 83 tests passed across the eight affected files (42 in `apps/api/tests/unit/forwarder.{service,controller}.test.ts`, 5 new in the C033-F1 regression file, 36 across the other five adapted root-level test files). Root `pnpm run typecheck:root` has pre-existing failures in files I did not touch (`tests/unit/fleet-partner-list-envelope.test.ts`, `tests/unit/system-remediation/sr-admin-verify-001/fleet-lists.test.ts`, tenant-console-web auth-constants mismatches, a cross-worktree duplicate-`ApiClient`-type artifact) — confirmed unrelated by `git diff --stat`, which shows no changes to any of those files.

## Remaining boundary

No VM product/dev/preview/HTTP/browser/E2E/PG/Docker runtime was started. No provider adapter, credential policy, signature scheme, financial policy, legal period or new migration was added. Owner does not call `done`; independent Codex review, exact-candidate mandatory CI and protected merge remain required before any acceptance credit.

## Round 2: reopen `7e24d35545bc442bb331fc56a30e6877` — R1-R4 fixes

Codex rejected candidate `10060a430ffd56a66086ce7f03eb9ba48c42fbb2` with four findings. All four were architectural gaps in the round-1 fix, not just missing tests: the round-1 code awaited the repository call, but every mutator still mutated the **shared live `this.forwardedOrders` entry in place** before/independent of that await, so (a) readers could observe the mutation immediately regardless of ACK timing, and (b) two concurrent commands on the same order could clobber each other's fields with no ordering guarantee. Fixed by reworking `ForwarderService` (`apps/api/src/modules/forwarder/forwarder.service.ts`) around two new primitives:

- `withLock(key, fn)` — a per-identity (mirrorOrderId, or `ingress:<platformCode>:<externalOrderId>` pre-creation) promise-chained mutex. Every mutating command now runs its "read canonical → build a clone draft → await durable ACK → commit" critical section inside this lock, so two commands on the same order can never interleave their persistence writes, and a later-queued command always observes whatever the earlier one actually committed. The lock is held **only** around this local section — never around an external adapter call — so a slow/stuck forwarder adapter can never block a native-authority sync on the same order.
- `commitOrder(order)` — the only place that writes into the live `this.forwardedOrders` array (insert or replace-by-`mirrorOrderId`), called only after a durable ACK (or, for the terminal best-effort `sync_failed` recording, after that write has been attempted). Every mutator (`ingestExternalOrder`/`createNewForwardedOrder`/`reconcileExistingIngest`, `broadcastOrder`, `rejectForwardedOrder`, `relayDriverAccept`, `reportSyncFailure`, `engageManualFallback`, `syncNativeStatus`, `completeReconciliation`, `markSyncFailed`) now builds its next state via `this.cloneOrder(canonical)` and never mutates the array entry directly.

### [P1 R1 / C033-F1] ACK-before-cache-publish

- Old `10060a4`: mutators (e.g. `broadcastOrder` line 542) mutated the object already sitting in `this.forwardedOrders` (obtained via `requireOrder`), then `await persistOrFail(...)`. `listOrders`/`getOrder`/driver task views read that mutation immediately, before the repository write landed.
- Fixed: every mutator builds a clone (`draft`) and only `commitOrder(draft)` — called from inside `persistOrFail`/`markSyncFailed` after the write is attempted — replaces the live entry. Readers cannot observe a draft ahead of its ACK.
- Repro/evidence: new test `does not let a driver-visible read (getOrder/listOrders/driver task view) observe the broadcast before its durable ACK resolves` in `tests/unit/forwarded-order-durable-ack-and-native-race-20261015/forwarded-order-durable-ack.test.ts` — asserts `getOrder`, `listOrders`, and `listDriverTaskViewsForRead` all still show `"received"`/not-visible while the repository write is a pending (unresolved) promise, then show `"broadcasted"`/visible once it resolves. Fails against old `10060a4` (reads would already show `"broadcasted"`), passes against the new candidate.

### [P1 R2 / C033-F1] `reportSyncFailure` honest durable-ACK

- Old `10060a4`: `reportSyncFailure` called `markSyncFailed`, which swallowed its own `persistChanges` rejection in a bare `catch {}` and kept the original error's code/message as if it had been durably recorded; `reportSyncFailure` then unconditionally returned a 200 success envelope.
- Fixed: `markSyncFailed` now returns `{ order, persisted }`. On its own persistence failure it overwrites `lastSyncError.code` to `FORWARDER_PERSISTENCE_ACK_UNCERTAIN` (message records both the original cause and the new failure) so the degraded record is distinguishable from a durably-recorded one. `reportSyncFailure` (the only *top-level* durable-ACK command built on `markSyncFailed`) checks `persisted` and throws the same `502 FORWARDER_PERSISTENCE_ACK_UNCERTAIN` `ApiRequestError` contract as `persistOrFail` when it is `false`, instead of returning success. Internal best-effort callers (`persistOrFail`'s own catch, `relayDriverAccept`'s adapter-unavailable/accept-relay-failed branches) are unchanged in throwing behavior — they already throw their own primary error regardless of `persisted`, matching the existing "no further fallback" terminal-recording contract.
- Repro/evidence: two new tests under `describe("C033-F1 reportSyncFailure: honest durable-ACK command")`. The failure-path test rejects `persistChanges` once and asserts `reportSyncFailure` **rejects** with `FORWARDER_PERSISTENCE_ACK_UNCERTAIN` (old `10060a4` would have resolved 200 with `data.status === "sync_failed"` here); the success-path test is new positive coverage (zero prior coverage existed for this command).

### [P1 R3 / C033-F1] Ingress retry: readback before re-attempting a write

- Old `10060a4`: a repeat `ingestExternalOrder` for the same `platformCode`+`externalOrderId` returned the cached entry unconditionally (`if (existing) return this.cloneOrder(existing)`), even when that cached entry's own creation write was never durably ACKed (`lastSyncError.code === "FORWARDER_PERSISTENCE_ACK_UNCERTAIN"`) — no readback, no retry write.
- Fixed: `ForwarderRepository.findOrderByIdentity(platformCode, externalOrderId)` (new method, same existing `ops.phase1_forwarded_orders` table/columns as `loadState`/`persistChanges` — no new migration) added. `reconcileExistingIngest` now: if the cached entry is confirmed (or no repository is configured — noDB mode unchanged), returns it as before; if uncertain, reads back the real row first and adopts it (via `commitOrder`, no re-write) if found; otherwise re-attempts the *same* write (same `mirrorOrderId`/`platformCode`/`externalOrderId`, status reset to `received`) through `persistOrFail`, preserving mirror identity either way.
- Repro/evidence: two new tests under `describe("C033-F1 ingest retry: readback before re-attempting a write")`. One configures `findOrderByIdentity` to return a persisted row and asserts the service adopts it without issuing another `persistChanges` call. The other leaves the default "nothing found" double and asserts a genuine new `persistChanges` call happens on retry (`persistChanges.mock.calls.length` increases) and succeeds, landing `status: "received"` — old `10060a4` would have returned the stale cached `sync_failed` envelope with zero new repository calls in both cases.

### [P1 R4 / C034-F1] Real repository-level race: accept vs. native authority

- Old `10060a4`: the in-memory "still broadcasted" guard in `relayDriverAccept` was checked only once, before the (now-awaited) `persistOrFail` call; the actual array mutation still happened on the shared live object with no lock, so a concurrent `syncNativeStatus` committing between that guard check and the accept write's repository round-trip (or vice versa) could land out of order — either clobbering an already-ACKed native result with a stale `sync_failed`, or leaving the durable row at `accept_pending` after a native cancellation had already been ACKed in memory.
- Fixed: `relayDriverAccept` calls the external `adapter.accept()` **outside** any lock (so it never blocks a concurrent native sync), then re-reads the canonical order **inside** `withLock(orderId, ...)` immediately before building/committing its own draft — for both the adapter-failure branch and the adapter-success branch. Because `syncNativeStatus` also runs its whole critical section inside the same per-order lock, the two commands can never interleave their repository writes for the same order: whichever reaches the lock first fully commits (success or `markSyncFailed` degraded-commit) before the other is even allowed to read canonical state, eliminating the out-of-order durable write rather than just papering over one interleaving.
- Repro/evidence: new `describe("C034-F1 real repository-level race: accept vs. native authority")` block builds a **real** `DatabaseService`-shaped double (`createGatedDatabaseService`) wired into a **real** `ForwarderRepository` and `ForwarderService`/`ForwarderController` (no repository-level fake, no duplicated SQL — the double only controls the `query()` promise for the specific `INSERT ... status = 'accept_pending'` call and records its real parameters). Driven through the actual mounted `controller.acceptForwardedOrder(taskId, driverIdentity("driver-dbrace-001"), {})` caller. Both the late-rejection and late-success branches are exercised by holding that one write open while a concurrent `service.syncNativeStatus(..., "cancelled_by_platform")` is issued, then resolving/rejecting the held write; both assert the final `service.listOrders()[0].status` is `"cancelled_by_platform"` (never a restored/clobbered `accept_pending` or a spurious `sync_failed` over an already-ACKed cancellation) and `acceptedDriverId` is preserved for dispatch follow-up. These fail against old `10060a4` (no lock existed, so the two writes could land in either order independent of the guard check) and pass against the new candidate.

### Verification run (this round)

```bash
pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
pnpm --filter @drts/api exec tsc --noEmit -p tsconfig.json
pnpm exec eslint apps/api/src/modules/forwarder/forwarder.service.ts apps/api/src/modules/forwarder/forwarder.repository.ts apps/api/src/modules/forwarder/forwarder.controller.ts tests/unit/forwarded-order-durable-ack-and-native-race-20261015/forwarded-order-durable-ack.test.ts apps/api/tests/unit/forwarder.service.test.ts --max-warnings=0
pnpm exec vitest run tests/unit/forwarded-order-durable-ack-and-native-race-20261015/forwarded-order-durable-ack.test.ts tests/unit/forwarder.test.ts tests/unit/audit-forwarder-runtime-20261002.test.ts tests/unit/health-observability-source-truth-20261015/health-observability-source-truth.test.ts tests/unit/system-remediation/sr-qa-governance-001/c108-health-observability-forwarders.test.ts tests/security/iam-route-driver-negative.test.ts
pnpm --filter @drts/api exec vitest run tests/unit/forwarder.service.test.ts tests/unit/forwarder.controller.test.ts
```

All exited 0. API `tsc --noEmit` clean (after rebuilding `@drts/contracts`/`@drts/control-plane-auth`, stale from an unrelated prior build). ESLint clean. 43 tests passed across the six root-level files (36 pre-existing + 7 new: 1 for R1 direct-cache-read coverage, 2 for R2, 2 for R3, 2 for R4), 42 pre-existing tests passed unchanged in `apps/api/tests/unit/forwarder.{service,controller}.test.ts` — total 85. Root `pnpm exec tsc --noEmit -p tsconfig.json` was also run; its only errors are the same pre-existing, unrelated ones noted above in files this task does not touch (confirmed by `git diff --stat` showing no changes to them), plus a cross-worktree duplicate-`ApiClient`-type artifact from running `tsc` inside an isolated worktree against packages resolved from the canonical root — not a regression from this change. No VM product/dev/browser/PG/Docker runtime was started.

Acceptance status after this round: `forwarded_complete_commands_durable_ACK_and_honest_recovery` and `forwarded_native_authority_inflight_accept_race_and_identity` — all four R1-R4 findings have before/after repro evidence above; `forwarded_original_stub_signature_idempotence_task_and_receipt_boundaries` — unchanged, existing regressions for signature refusal/stub readiness/sequential idempotence/noDB mode/driver-safe responses/native task closure continue to pass unmodified. `forwarded_exact_candidate_independent-review-ci-merge` is for reviewer/CI/merge to determine; this candidate does not call `done`.

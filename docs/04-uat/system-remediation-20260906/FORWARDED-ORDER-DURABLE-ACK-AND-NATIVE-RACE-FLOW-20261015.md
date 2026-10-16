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

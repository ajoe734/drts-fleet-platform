# FWD-VERIF-001 Verification

- Task: `FWD-VERIF-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Date: `2026-05-13`
- Mutates canonical: `false`
- Scope: support-only verification of the forwarder mirror/status-sync chain on current `HEAD`, using the established Grab Taiwan mock/test-double path because repo machine truth still marks real third-party forwarder proof as external-gated.

## Result

Verdict: `blocked`

- No repo-tracked live sandbox proof exists for Grab Taiwan or another forwarder. `WF-FWD-001` remains `EXTERNAL-GATED`, `EXT-002-BLK-001` to `EXT-002-BLK-007` remain open, the platform registry still marks Grab Taiwan as `forwarder_stub`, and the shipped adapter remains stub-only.
- Current `HEAD` again has executable repo-local forwarder evidence for the module-scoped Grab Taiwan mock path. `pnpm --filter @drts/contracts build` passes, `pnpm --filter @drts/api exec vitest run tests/unit/forwarder.service.test.ts tests/unit/forwarder.controller.test.ts` passes with `35/35` tests, and `pnpm --filter @drts/api typecheck` passes.
- The repo-root forwarder harness is still not fully reproducible. `pnpm exec vitest run tests/unit/forwarder.test.ts` fails `2/4` tests because `tests/unit/forwarder.test.ts` constructs `RegulatoryRegistryService` without the now-required `AuditNotificationService` and `DriverProfileService`, then `decorateDriver()` dereferences `driverProfileService.findProfileForDriver(...)`: `tests/unit/forwarder.test.ts:17-21`, `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:329-335`, `1843-1846`.
- Static source inspection still shows the intended repo-local chain for webhook ingest -> mirror order -> driver forwarded-task view -> accept relay -> native status sync -> reconciliation closeout.
- Settlement / earnings mirror is still missing from runtime orchestration. The adapter interface defines `complete()` and `fetchEarnings()`, and the stub adapter implements them, but `ForwarderService` does not call them and forwarded finance remains `external_platform` + `shadow_only`.

## Acceptance Mapping

### 1. Identify which third-party platform has a usable sandbox (or use an established mock if none); document choice

Status: `pass_with_scope_limits`

Chosen verification target:

- Established mock: Grab Taiwan forwarder path exercised by the existing source/test-double seam in `apps/api/src/modules/forwarder/*` and `apps/api/tests/unit/forwarder.service.test.ts`.

Why this is a mock fallback rather than a live sandbox pass:

- The platform registry still marks Grab Taiwan as `forwarder_stub`: `packages/contracts/src/platform-codes.ts:53`.
- `GrabTaiwanAdapter` advertises stub capability only (`supportsInboundWebhook: true`, but production readiness is not claimed): `apps/api/src/modules/forwarder/grab-taiwan.adapter.ts:24-40`.
- The workflow gate keeps `WF-FWD-001` at `EXTERNAL-GATED`: `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md:65`, `117`.
- The external blocker packet keeps real forwarder proof open on contract, credentials, signature/replay, live seed, callback lifecycle, duplicate/lost-race, and no-owned-assignment evidence: `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md:34-40`.

Conclusion:

- No repo-tracked machine truth supports a usable live sandbox today.
- This verification therefore uses the established Grab Taiwan mock/test-double path and treats all live-platform claims as blocked.

### 2. Run mirror flow: incoming order -> forwarder mirror -> driver platform task created -> accept relay -> status sync -> completion sync -> earnings mirror

Status: `blocked`

Current `HEAD` executable state:

- `pnpm --filter @drts/contracts build` passes.
- `pnpm --filter @drts/api exec vitest run tests/unit/forwarder.service.test.ts tests/unit/forwarder.controller.test.ts` passes with `35/35` tests and exercises the current Grab Taiwan mock-backed mirror/status-sync path.
- `pnpm exec vitest run tests/unit/forwarder.test.ts` fails `2/4` tests before SC-015 / SC-016 complete because the repo-root fixture under-injects `RegulatoryRegistryService` dependencies, causing `driverProfileService.findProfileForDriver(...)` to throw: `tests/unit/forwarder.test.ts:17-21`, `59-82`, `111-122`; `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:329-335`, `1843-1846`.

Static/source evidence map:

1. Incoming order -> forwarder mirror
   - `ForwarderController.ingestGrabTaiwanWebhook()` receives `POST /forwarder/webhooks/grab-taiwan`: `apps/api/src/modules/forwarder/forwarder.controller.ts:68`.
   - `ForwarderService.ingestGrabTaiwanWebhook()` resolves the external order id and forwards into `ingestExternalOrder()`: `apps/api/src/modules/forwarder/forwarder.service.ts:219`, `231`.
   - `ingestExternalOrder()` creates or reuses the mirror order and stamps forwarded-finance authority metadata: `apps/api/src/modules/forwarder/forwarder.service.ts:134`.

2. Driver platform task created
   - The mirrored order is surfaced through `listDriverTaskViews()` / `getDriverTaskView()` as a forwarded task view rather than an owned dispatch assignment: `apps/api/src/modules/forwarder/forwarder.service.ts:249`, `275`.

3. Accept relay
   - `relayDriverAccept()` is the runtime seam that calls the adapter accept action and moves the mirror into accept-pending flow: `apps/api/src/modules/forwarder/forwarder.service.ts:514`.
   - Driver-safe controller entrypoint: `apps/api/src/modules/forwarder/forwarder.controller.ts:123`.

4. Status sync
   - `syncNativeStatus()` maps native provider status back into the mirrored order and closes mirrored tasks for terminal forwarded outcomes: `apps/api/src/modules/forwarder/forwarder.service.ts:737`.

5. Completion sync
   - `completeReconciliation()` finalizes a queued reconciliation job and propagates the terminal forwarded state: `apps/api/src/modules/forwarder/forwarder.service.ts:804`.

6. Earnings mirror / settlement mirror
   - `ForwarderAdapterInterface` defines `fetchEarnings()`: `apps/api/src/modules/forwarder/forwarder-adapter.interface.ts:100`.
   - `GrabTaiwanAdapter` implements stub `complete()` and `fetchEarnings()`: `apps/api/src/modules/forwarder/grab-taiwan.adapter.ts:73`, `98`.
   - I did not find any runtime call site for adapter completion or earnings mirroring in `apps/api/src/modules/forwarder/forwarder.service.ts`; forwarded finance remains modeled as `external_platform` + `shadow_only`: `apps/api/src/modules/forwarder/forwarder.service.ts:68-73`, `packages/contracts/src/index.ts:3957-3961`.

Important scope limit:

- The module-scoped forwarder tests now execute on current `HEAD`, including webhook ingest at `234`, signature failure at `262`, idempotent replay at `301`, accept relay at `323`, sync-failure reconciliation at `416`, native status resolution at `539`, terminal `lost_race` at `643`, terminal `cancelled_by_platform` at `673`, and reconciliation closeout at `723` in `apps/api/tests/unit/forwarder.service.test.ts`.
- Acceptance remains blocked because there is still no live sandbox proof, the repo-root forwarder harness has drifted, and runtime settlement / earnings mirroring is absent.

### 3. Capture webhook signature validation evidence + retry/idempotency evidence

Status: `partial_pass`

Webhook verification evidence:

- `ForwarderService` has an explicit verification gate that calls `adapter.verifyWebhook(...)`, degrades adapter health on failure, records webhook receipt on success, and throws `FORWARDER_WEBHOOK_VERIFICATION_FAILED` when verification rejects: `apps/api/src/modules/forwarder/forwarder.service.ts:1451-1534`.
- The forwarder service unit file executes the failed-signature path on current `HEAD`: `apps/api/tests/unit/forwarder.service.test.ts:262`.
- The shipped adapter implementation is still a stub: `GrabTaiwanAdapter.verifyWebhook()` always returns `accepted: true` with stub auth/credential/webhook state, so there is no live HMAC, timestamp-window, or replay-proof algorithm in repo today: `apps/api/src/modules/forwarder/grab-taiwan.adapter.ts:112-119`.

Idempotency evidence:

- The forwarder service unit file still contains explicit inbound replay coverage keyed by `(platformCode, externalOrderId)`: `apps/api/tests/unit/forwarder.service.test.ts:301`.
- The current `35/35` pass confirms that idempotency coverage still executes on `HEAD`.

Retry evidence:

- The forwarder service unit file still contains explicit sync-failure / queued-reconciliation coverage for adapter accept failures: `apps/api/tests/unit/forwarder.service.test.ts:416`.
- `syncNativeStatus()` and `completeReconciliation()` still contain the recovery path for queued reconciliation jobs: `apps/api/src/modules/forwarder/forwarder.service.ts:737`, `804`.
- The current `35/35` pass confirms those retry/reconciliation paths still execute on `HEAD`.

Important scope limits:

- This is executable mock-path evidence plus source-level review on current `HEAD`, not a live sandbox proof.
- The repo still shows retry classification and reconciliation queuing, not an autonomous background retry worker.

### 4. Document gaps where real platform behaviour does not match adapter assumptions

Status: `pass`

Confirmed gaps:

- Real sandbox proof is absent. Machine truth still marks Grab Taiwan real-adapter proof as external-gated: `docs/03-runbooks/cross-repo-gap-matrix-20260424.md:45`, `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md:34-40`.
- The shipped adapter is stub-only, but the unit-test seam models a more capable in-memory adapter. That is valid for mock-path design verification, but it is not live platform evidence: `apps/api/tests/unit/forwarder.service.test.ts:10-68`, `apps/api/src/modules/forwarder/grab-taiwan.adapter.ts:24-40`.
- `E2E-002` remains an external-gated scaffold; a graceful skip there is not proof of real adapter readiness: `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md:65`, `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md:37-40`.
- Completion / settlement / earnings mirror is still missing from runtime orchestration even though the adapter seam exists.
- The repo-root forwarder harness has drifted behind the current `RegulatoryRegistryService` dependency shape, so cross-package forwarder examples are not fully reproducible without fixture repair: `tests/unit/forwarder.test.ts:17-21`, `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:329-335`, `1843-1846`.

### 5. Verification report is support-only (mutates_canonical=false); no production code change

Status: `pass`

- This slice only updates this support artifact.

## Executed Verification Commands

Executed on current `HEAD` (`2026-05-13`):

```bash
pnpm --filter @drts/contracts build
pnpm --filter @drts/api exec vitest run tests/unit/forwarder.service.test.ts tests/unit/forwarder.controller.test.ts
pnpm exec vitest run tests/unit/forwarder.test.ts
pnpm --filter @drts/api typecheck
```

Results:

- `pnpm --filter @drts/contracts build`
  - PASS

- `pnpm --filter @drts/api exec vitest run tests/unit/forwarder.service.test.ts tests/unit/forwarder.controller.test.ts`
  - PASS
  - `2` passed files, `35` passed tests
  - Current executable evidence includes webhook ingest, signature rejection, idempotent replay, accept relay, sync-failure reconciliation, native status sync, terminal closeout, and reconciliation completion.

- `pnpm exec vitest run tests/unit/forwarder.test.ts`
  - FAIL
  - `1` failed file, `2` failed tests, `2` passed tests
  - `TypeError: Cannot read properties of undefined (reading 'findProfileForDriver')`
  - Failure trace points to `RegulatoryRegistryService.decorateDriver()` after `tests/unit/forwarder.test.ts` instantiates `RegulatoryRegistryService` without the currently required collaborators.

- `pnpm --filter @drts/api typecheck`
  - PASS

## Overall Conclusion

`FWD-VERIF-001` again has a reproducible module-scoped mock command matrix on current `HEAD`: the contracts build passes, the API forwarder service/controller suites pass `35/35`, and API typecheck passes. The earlier duplicate-contract blocker should no longer be cited.

Even with that recovery, this task remains `blocked` as a real-platform verification closeout because:

- live third-party forwarder proof is still external-gated and stub-only in repo machine truth
- the repo-root forwarder harness still has a fixture regression around `RegulatoryRegistryService` dependency injection
- the intended repo-local mirror / task-view / accept / status-sync / reconciliation seams are present and executable in the API module tests
- settlement / earnings mirroring remains unimplemented in runtime orchestration

This report therefore records current `HEAD` as executable for module-scoped mock verification but still `blocked` for live sandbox closure and earnings-mirror completeness.

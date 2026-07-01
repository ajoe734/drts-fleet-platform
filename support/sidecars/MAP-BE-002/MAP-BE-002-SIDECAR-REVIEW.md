# MAP-BE-002 Sidecar Review Packet

- Sidecar task: `MAP-BE-002-SIDECAR-REVIEW`
- Sidecar owner / reviewer: `Codex` / `Codex2`
- Sidecar status: `review_approved`
- Parent task: `MAP-BE-002`
- Parent status / owner / reviewer: `review` / `Codex` / `Claude2`
- Last revised: `2026-07-01` (UTC)
- Scope guardrail: support-only review packet; no canonical truth, runtime, contract, or test edits

## 1. Scope Boundary

This sidecar exists only to package reviewer-facing evidence for `MAP-BE-002`
and to preserve the reviewer handoff / approval context for owner closeout.

- In scope: machine-truth snapshot, integrated repo evidence map, reviewer
  hotspots, review outcome, and owner closeout notes.
- Out of scope: changing the parent implementation, rewriting parent
  acceptance, or closing the parent task from this packet.

## 2. Machine-Truth Snapshot

Current task state from `scripts/ai-status.sh show` and the activity log:

- `MAP-BE-002-SIDECAR-REVIEW` is `review_approved` under `Codex` / `Codex2`
  with `last_update=2026-07-01T03:26:18Z`.
- `MAP-BE-002` remains `review` under `Codex` / `Claude2` with
  `last_update=2026-06-30T14:45:24Z`.
- `MAP-INFRA-001` is still referenced as a dependency in planning and task
  metadata, but `AI_NAME=Codex scripts/ai-status.sh show MAP-INFRA-001`
  currently returns `Task not found: MAP-INFRA-001`.

Reviewer approval already recorded in machine truth:

> Reviewed support-only packet. Corrected packet ownership metadata to match
> machine truth, verified artifact remains limited to
> `support/sidecars/MAP-BE-002/MAP-BE-002-SIDECAR-REVIEW.md`, committed as
> `53b8a1494` (`wip(MAP-BE-002-SIDECAR-REVIEW): align packet ownership
> metadata`), and pushed to `origin/codex2/map-be-002-sidecar-review`.
> Verification: `git diff --check`.

Practical interpretation for owner closeout:

- reviewer `Codex2` approved the sidecar scope
- parent `MAP-BE-002` is still not closed from this helper slice
- any remaining owner work must stay limited to this support artifact plus
  closeout commit / push / status evidence

## 3. Parent Scope And Recorded Verification

Parent `MAP-BE-002` machine truth currently records this completed scope in its
`next` field:

- provider-neutral `GeoModule` gateway
- `GeoProvider` interface
- deterministic `MockGeoProvider` fixtures
- `GET /api/geo/search`
- `POST /api/geo/resolve`
- `POST /api/geo/reverse`
- input validation
- provider error normalization
- address provenance support
- controller envelope tests

Recorded parent verification in machine truth:

- `pnpm exec prettier --check` on the contracts + geo module files
- `pnpm --filter @drts/api typecheck`
- `pnpm --filter @drts/api lint`
- `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/geo.service.test.ts`
- `pnpm --filter @drts/contracts typecheck`
- `pnpm --filter @drts/contracts lint`
- `pnpm exec vitest run tests/unit/contracts-geo-provenance.test.ts`

Dependency note:

- treat `MAP-INFRA-001` as planning / integration context rather than a live
  task slice the reviewer can inspect from machine truth

## 4. Current Repo Evidence Map

### Contracts

`packages/contracts/src/index.ts:116-261` defines the shared geo contract
surface the gateway must honor:

- `GEO_RESOLUTION_SURFACES`
- `GeoCoordinateProvenance`
- `SearchGeoQuery`
- `ResolveAddressCommand`
- `ReverseGeocodeCommand`
- `GeoSearchResponse`
- `GeoResolveResponse`
- `GeoReverseResponse`
- `GeoProviderHealthResponse`

This is the core evidence that callers should receive contract-owned shapes,
not provider-native payloads.

### Provider Boundary And Gateway

`apps/api/src/modules/geo/geo.provider.ts:10-27` defines the narrow
provider-neutral interface:

- `search(...)`
- `resolve(...)`
- `reverse(...)`
- `GeoProviderError` for normalized provider-failure metadata

`apps/api/src/modules/geo/geo.controller.ts:11-51` exposes the runtime routes:

- `GET /api/geo/health`
- `GET /api/geo/search`
- `POST /api/geo/resolve`
- `POST /api/geo/reverse`

`apps/api/src/modules/geo/geo.service.ts:47-119` and `149-253` contain the
gateway behavior the reviewer should validate:

- HTTP query parsing for `search`
- validation of required text, coordinate shape, result limit, and surface enum
- provider-neutral delegation through `GeoProvider`
- `GeoProviderError` -> `ApiRequestError` normalization

### Deterministic Mock Provider

`apps/api/src/modules/geo/mock-geo.provider.ts:27-132` defines stable fixtures
for:

- `Taipei City Hall`
- `Taipei Station`
- `Xinyi Hospital Access`
- `Taoyuan Airport Terminal 1`
- `Taichung Station`

`apps/api/src/modules/geo/mock-geo.provider.ts:138-257` then exercises those
fixtures through deterministic `search`, `resolve`, and `reverse` behavior,
including:

- provider-unavailable sentinel handling
- provider-candidate resolution
- manual pin fallback
- nearest-fixture reverse geocode
- out-of-area fixture coverage via Taichung

### Dependency Seam From Infra / Later Integration

`apps/api/src/modules/geo/geo-provider-config.service.ts:21-148` is the
runtime health / fail-closed dependency seam now consumed by the gateway:

- provider mode validation (`mock` / `external` / `disabled`)
- production guard against mock provider use
- missing-secret detection
- quota / key restriction reporting
- unhealthy / degraded / healthy operational status

`apps/api/src/modules/geo/geo.service.ts:43-45` and `125-143` show the gateway
using that config seam for `/geo/health` and fail-closed runtime checks before
provider calls proceed.

### Unit Coverage

`apps/api/tests/unit/geo.service.test.ts:21-292` covers:

- mock provider health reporting
- deterministic search results
- serviceable Taipei fixture coverage
- candidate resolution into provenance-bearing address payloads
- manual pin fallback with override reason
- reverse geocode behavior
- provider outage normalization to retryable API errors
- fail-closed behavior for invalid mode and missing external-provider secrets
- controller envelope wrapping

## 5. Branch And Integration Reality

The parent geo gateway evidence is already visible on the integrated file
surface reachable from `origin/dev`; this sidecar branch is not a private parent
implementation branch.

Relevant branch evidence:

- `deb5e1d366f1789c29bd26818b14ffcb801a43a3`
  (`MAP-BE-004: finalize service-area booking creation enforcement`) introduced
  the initial `apps/api/src/modules/geo/*` gateway files, the geo unit test,
  and the geo contract additions.
- `ceecb45a08b71ea39e5932c2e1aa1a9d88536191`
  (`MAP-BE-006: integrate service-area governance on dev`) later added
  `geo-provider-config.service.ts` and updated `geo.service.ts` so the gateway
  uses fail-closed provider-health checks.
- owner handoff for this sidecar was recorded from commit `8d1428bdf`
  (`wip(MAP-BE-002-SIDECAR-REVIEW): anchor review packet`) on
  `origin/codex/map-be-002-sidecar-review`.
- reviewer approval was recorded from commit `53b8a1494`
  (`wip(MAP-BE-002-SIDECAR-REVIEW): align packet ownership metadata`) on
  `origin/codex2/map-be-002-sidecar-review`.

Practical consequence:

- reviewer validation should inspect the current integrated geo file surface,
  not assume a single task-scoped `MAP-BE-002` implementation commit exists in
  this sidecar worktree
- owner closeout for this sidecar must remain support-only and branch-scoped

## 6. Drift / Hotspots To Reconcile During Parent Review

1. Parent machine truth cites
   `pnpm exec vitest run tests/unit/contracts-geo-provenance.test.ts`, but the
   current tracked repo does not contain
   `tests/unit/contracts-geo-provenance.test.ts`.
2. Parent acceptance names the three geo endpoints, but the integrated module
   also exposes `GET /api/geo/health` through the `MAP-INFRA-001` seam. Treat
   `/geo/health` as dependency context, not `MAP-BE-002` scope creep.
3. No cache layer is visible in the current gateway file set. If the parent
   reviewer expected cache hooks from planning text, that gap should be handled
   as an explicit current-state question.

## 7. Reviewer Outcome And Owner Closeout Handoff

Reviewer `Codex2` has already approved the packet as support-only and confirmed
the artifact boundary stayed limited to this markdown file.

Owner closeout still needs to provide:

1. a task-scoped closeout commit on `codex/map-be-002-sidecar-review`
2. a normal non-force push of that closeout commit
3. a `done` status update carrying `COMMIT_HASH`, `COMMIT_SUBJECT`,
   `PUSH_REMOTE`, `PUSH_BRANCH`, and `INTEGRATION_STATUS`

Because this is a support-only sidecar with no deploy target, the expected
integration status for `done` is `not_applicable`.

## 8. Scope Compliance

- [x] Support artifact only
- [x] No canonical truth edits
- [x] Reviewer approval recorded in machine truth
- [x] Owner closeout remains limited to task-scoped artifact + status evidence

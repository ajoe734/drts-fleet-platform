# Review Packet: MAP-BE-001-SIDECAR-REVIEW

- **Sidecar Kind:** `review_packet`
- **Parent Task:** `MAP-BE-001` - Geo contracts and coordinate provenance
- **Parent Owner / Reviewer:** `Codex` / `Claude2`
- **Sidecar Owner / Reviewer:** `Codex` / `Codex2`
- **Planning Anchor:** `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- **Machine-Truth Basis:** sidecar status refreshed through `2026-06-30T21:03:20Z`; parent status refreshed through `2026-06-30T14:38:09Z`
- **Workflow Position:** support-only review packet for the assigned sidecar reviewer. This file does not change canonical truth, parent implementation files, or the parent lifecycle state.

This packet summarizes the current `MAP-BE-001` evidence for reviewer handoff.
The parent task is still `review` in machine truth. The current checkout is an
integrated tree that already includes downstream consumers from later map tasks,
so the anchors below cite the current code snapshot plus the machine-truth
parent summary rather than a standalone `MAP-BE-001` branch diff.

## 1. Scope Boundary

Allowed:

- summarize reviewer-facing evidence for `MAP-BE-001`
- map parent acceptance items to concrete code and test anchors
- record fresh verification runs on the current integrated tree
- flag review points where the integrated snapshot diverges from the original
  parent handoff wording

Not allowed:

- editing L1/L2 product truth
- editing parent implementation/runtime files through this sidecar
- changing the parent `review` / `review_approved` / `done` lifecycle
- changing machine truth except through `scripts/ai-status.sh`

## 2. Machine-Truth Anchors

### 2.1 Sidecar task

- `id`: `MAP-BE-001-SIDECAR-REVIEW`
- `owner`: `Codex`
- `reviewer`: `Codex2`
- `status`: `in_progress`
- `helper_parent`: `MAP-BE-001`
- `helper_kind`: `review_packet`
- `mutates_canonical`: `false`
- artifact path: `support/sidecars/MAP-BE-001/MAP-BE-001-SIDECAR-REVIEW.md`

### 2.2 Parent task

- `id`: `MAP-BE-001`
- `owner`: `Codex`
- `reviewer`: `Claude2`
- `status`: `review`
- `depends_on`: `MAP-PROD-000`
- `planning_ref`: `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- current machine-truth handoff summary:
  - provider-neutral geo contracts landed
  - coordinate provenance fields landed on `AddressPayload`
  - `ResolvedAddressPayload` and service-area definition envelopes landed
  - verification reported as contracts/API typecheck, lint, and geo/service-area tests

### 2.3 Integrated snapshot note

The current tree includes later consumers that depend on the `MAP-BE-001`
contract surface:

- `MAP-BE-004`: `deb5e1d366f1789c29bd26818b14ffcb801a43a3`
- `MAP-BE-006`: `ceecb45a08b71ea39e5932c2e1aa1a9d88536191`

Reviewer implication:

- judge `MAP-BE-001` against its declared acceptance and contract anchors
- treat later booking/governance usage as supporting evidence that the contract
  shape is actually consumed, not as extra acceptance scope for the parent

## 3. Acceptance-To-Evidence Matrix

| Parent acceptance item | Evidence |
| --- | --- |
| legacy `AddressPayload` compatible | `packages/contracts/src/index.ts:2542` keeps `lat` / `lng` optional and additive, while new provenance fields (`placeId`, `geocodeProvider`, `geocodeConfidence`, `coordinateSource`, `coordinateAccuracyM`, actor/timestamp metadata, `coordinateProvenance`) are all optional. `packages/contracts/src/index.ts:2566` defines `ResolvedAddressPayload` as the stricter post-resolution shape instead of breaking the legacy payload. |
| provenance fields support provider/manual/saved/reverse/external sources | `packages/contracts/src/index.ts:96` defines `GEO_COORDINATE_SOURCES` as `provider_candidate`, `manual_pin`, `saved_address`, `reverse_geocode`, `external_platform`, and `legacy_text`. `packages/contracts/src/index.ts:131` defines `GeoCoordinateProvenance`. `packages/contracts/src/index.ts:146`, `172`, and `183` add provider-neutral candidate/search/resolve/reverse contracts. `apps/api/tests/unit/geo.service.test.ts:74`, `100`, and `122` exercise provider-candidate, manual-pin, and reverse-geocode flows. `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6268` preserves top-level provenance and defaults coordinate-bearing legacy flows into auditable `manual_pin` / `legacy_text` snapshots without narrowing the enum. |
| coordinate validation tested | `packages/contracts/src/index.ts:263` and `272` define latitude/longitude validators; `packages/contracts/src/index.ts:289` and `295` define coordinate and provenance completeness helpers. `apps/api/tests/unit/geo.service.test.ts:245` rejects invalid search/coordinate input before provider access. `apps/api/tests/unit/service-area.service.test.ts:161` asserts a `400` `INVALID_COORDINATE` error for out-of-range pickup coordinates. `apps/api/tests/unit/owned-mobility.service.test.ts:390` proves text-only legacy orders are routed into explicit manual review with `legacy_text` provenance instead of silently becoming dispatchable coordinates. |
| contracts typecheck and tests pass | Fresh reruns in §5 passed for `pnpm --filter @drts/contracts typecheck`, `pnpm --filter @drts/contracts lint`, `pnpm --filter @drts/api typecheck`, `pnpm --filter @drts/api lint`, and targeted geo/service-area/owned-mobility Vitest coverage. Current note: `pnpm --filter @drts/contracts test` exits `0` with `No test files found`, so current executable evidence for geo/provenance behavior lives in API unit tests rather than colocated contracts tests. |

## 4. Downstream Consumption Anchors

These are not extra parent acceptance items, but they show the `MAP-BE-001`
surface is actively consumed by later map tasks:

- `packages/contracts/src/index.ts:395` and `406` attach `geometryVersionRefs`
  to service-area stop/result envelopes.
- `packages/contracts/src/index.ts:417` exposes `ServiceAreaDefinitionsResponse`
  for downstream admin/list flows.
- `apps/api/tests/unit/service-area.service.test.ts:48`, `84`, and `111`
  exercise serviceable, deny, and manual-review outcomes while asserting the
  geometry-version evidence carried by the contract.
- `apps/api/tests/unit/owned-mobility.service.test.ts:289` verifies booking
  spatial audit snapshots preserve provider-candidate and manual-pin
  provenance.
- `apps/api/tests/unit/owned-mobility.service.test.ts:390` verifies text-only
  legacy bookings retain explicit `legacy_text` provenance and manual-review
  dispatch gating.

## 5. Fresh Verification

Rerun by this sidecar on `2026-06-30` UTC:

| Command | Result |
| --- | --- |
| `pnpm exec prettier --check packages/contracts/src/index.ts apps/api/src/modules/geo/geo.service.ts apps/api/src/modules/geo/mock-geo.provider.ts apps/api/src/modules/service-area/service-area.service.ts apps/api/tests/unit/geo.service.test.ts apps/api/tests/unit/service-area.service.test.ts apps/api/tests/unit/owned-mobility.service.test.ts` | PASS |
| `pnpm --filter @drts/contracts typecheck` | PASS |
| `pnpm --filter @drts/contracts lint` | PASS |
| `pnpm --filter @drts/contracts test` | PASS with `No test files found` |
| `pnpm --filter @drts/api typecheck` | PASS |
| `pnpm --filter @drts/api lint` | PASS |
| `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/geo.service.test.ts apps/api/tests/unit/service-area.service.test.ts apps/api/tests/unit/owned-mobility.service.test.ts` | PASS, but current script wiring expanded to the full API suite: `111` files / `795` tests passed |
| `pnpm --dir apps/api exec vitest run tests/unit/geo.service.test.ts tests/unit/service-area.service.test.ts tests/unit/owned-mobility.service.test.ts` | PASS - `3` files / `100` tests passed |

Notes:

- the API test runs emitted existing debug/log noise from unrelated services,
  but both runs finished green
- the direct `vitest run` command is the better reviewer rerun command when the
  intent is to verify only the geo/service-area/provenance slice

## 6. Reviewer Focus

Recommended focus for `Codex2` reviewing this sidecar packet:

1. Confirm the parent acceptance wording "`contracts typecheck and tests pass`"
   is satisfied by the current evidence split: contracts package typecheck/lint
   is green, but executable geo/provenance tests now live in API unit tests
   rather than colocated `@drts/contracts` tests.
2. Confirm enum-level support for `saved_address` and `external_platform` is
   sufficient for `MAP-BE-001`, given the fresh reruns explicitly exercise
   `provider_candidate`, `manual_pin`, `reverse_geocode`, and `legacy_text`
   more directly than those two source variants.
3. Confirm it is acceptable that the cited anchors come from the integrated
   tree, where later tasks already consume the `MAP-BE-001` contract surface,
   rather than from an isolated parent-only branch snapshot.

## 7. Reviewer Handoff

This sidecar now satisfies its support-only acceptance:

- the support artifact exists at the declared path
- no canonical truth or parent implementation file was changed by this sidecar
- machine-truth status was updated through `scripts/ai-status.sh`
- the assigned reviewer gets a direct map from acceptance item to code anchors,
  downstream usage evidence, and fresh rerun verification

Recommended next lifecycle step: hand this packet to `Codex2` through
`scripts/ai-status.sh handoff` while the parent task remains in `review` with
reviewer `Claude2`.

# Review Packet: MAP-BE-001-SIDECAR-REVIEW

- **Sidecar Kind:** `review_packet`
- **Parent Task:** `MAP-BE-001` - Geo contracts and coordinate provenance
- **Parent Owner / Reviewer:** `Codex` / `Claude2`
- **Sidecar Owner / Reviewer:** `Codex` / `Codex2`
- **Planning Anchor:** `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- **Machine-Truth Basis:** sidecar `in_progress` as of `2026-07-01T03:05:43Z`; parent `review` as of `2026-06-30T14:38:09Z`
- **Integrated Snapshot:** current branch `codex/map-be-001-sidecar-review` on a `dev`-based integrated tree that already includes later map consumers

This refresh replaces an older draft of the same artifact that described the
sidecar as already `review_approved`. The current dispatch restarted
`MAP-BE-001-SIDECAR-REVIEW` on `2026-07-01`; this file is the reviewer handoff
packet for the current run and should be judged against current machine truth,
current code anchors, and fresh verification captured below.

## 1. Scope Boundary

Allowed:

- summarize reviewer-facing evidence for `MAP-BE-001`
- map parent acceptance items to concrete code and test anchors
- record fresh verification runs on the current integrated tree
- explain where the integrated snapshot goes beyond the original parent-only
  diff without expanding parent acceptance

Not allowed:

- editing L1/L2 canonical truth
- editing parent implementation/runtime files through this sidecar
- changing the parent `MAP-BE-001` lifecycle through this packet
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
  - `ResolvedAddressPayload` plus service-area evaluation envelopes landed
  - contracts/API typecheck, lint, and geo/service-area tests were reported
    green by the parent owner

### 2.3 Reviewer transport

The sidecar review source of truth is this branch after the owner pushes the
refresh commit:

```bash
git fetch origin codex/map-be-001-sidecar-review
git show origin/codex/map-be-001-sidecar-review:support/sidecars/MAP-BE-001/MAP-BE-001-SIDECAR-REVIEW.md | sed -n '1,260p'
```

Machine-truth spot checks for the reviewer:

```bash
AI_NAME=Codex2 scripts/ai-status.sh show MAP-BE-001-SIDECAR-REVIEW
AI_NAME=Codex2 scripts/ai-status.sh show MAP-BE-001
```

### 2.4 Integrated snapshot note

The current tree includes later consumers that depend on the `MAP-BE-001`
contract surface:

- `MAP-BE-004`: `deb5e1d366f1789c29bd26818b14ffcb801a43a3`
- `MAP-BE-006`: `ceecb45a08b71ea39e5932c2e1aa1a9d88536191`

Reviewer implication:

- judge `MAP-BE-001` against its declared acceptance and parent machine-truth
  summary
- treat later booking/governance usage as supporting evidence that the contract
  shape is consumed, not as extra parent acceptance scope

## 3. Acceptance-To-Evidence Matrix

| Parent acceptance item | Evidence |
| --- | --- |
| legacy `AddressPayload` compatible | `packages/contracts/src/index.ts:2542` keeps `lat` / `lng` optional and additive, while provenance fields (`placeId`, `geocodeProvider`, `geocodeConfidence`, `coordinateSource`, `coordinateAccuracyM`, actor/timestamp metadata, `coordinateProvenance`) all remain optional. `packages/contracts/src/index.ts:2566` defines `ResolvedAddressPayload` as the stricter post-resolution shape instead of breaking the legacy payload. |
| provenance fields support provider/manual/saved/reverse/external sources | `packages/contracts/src/index.ts:96` defines `GEO_COORDINATE_SOURCES` as `provider_candidate`, `manual_pin`, `saved_address`, `reverse_geocode`, `external_platform`, and `legacy_text`. `packages/contracts/src/index.ts:131` defines `GeoCoordinateProvenance`. `packages/contracts/src/index.ts:146`, `172`, and `183` add provider-neutral candidate/search/resolve/reverse contracts. `apps/api/tests/unit/geo.service.test.ts:74`, `100`, and `122` directly exercise provider-candidate, manual-pin, and reverse-geocode flows. `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6268` preserves top-level provenance and defaults coordinate-bearing legacy flows into auditable `manual_pin` / `legacy_text` snapshots without narrowing the enum. |
| coordinate validation tested | `packages/contracts/src/index.ts:263` and `272` define latitude/longitude validators; `packages/contracts/src/index.ts:289` and `295` define coordinate/provenance-detection helpers. `apps/api/tests/unit/geo.service.test.ts:245` rejects invalid search/coordinate input before provider access. `apps/api/tests/unit/service-area.service.test.ts:161` asserts a `400` `INVALID_COORDINATE` error for out-of-range pickup coordinates. `apps/api/tests/unit/owned-mobility.service.test.ts:390` proves text-only legacy orders stay in explicit manual review with `legacy_text` provenance instead of becoming dispatchable coordinates. |
| contracts typecheck and tests pass | Fresh reruns in §5 passed for `pnpm --filter @drts/contracts typecheck`, `pnpm --filter @drts/contracts lint`, `pnpm --filter @drts/contracts test`, `pnpm --filter @drts/api typecheck`, `pnpm --filter @drts/api lint`, and targeted API Vitest coverage. Current nuance: `pnpm --filter @drts/contracts test` exits `0` with `No test files found`, so executable geo/provenance behavior currently lives in API unit tests rather than colocated contracts tests. |

## 4. Downstream Consumption Anchors

These are not extra parent acceptance items, but they show the `MAP-BE-001`
surface is actively consumed on the current integrated tree:

- `packages/contracts/src/index.ts:395` and `406` attach
  `geometryVersionRefs` to service-area stop/result envelopes
- `packages/contracts/src/index.ts:417` exposes
  `ServiceAreaDefinitionsResponse` for downstream admin/list flows
- `apps/api/tests/unit/service-area.service.test.ts:48`, `84`, and `111`
  exercise serviceable, deny, and manual-review outcomes while asserting
  geometry-version evidence
- `apps/api/tests/unit/owned-mobility.service.test.ts:289` verifies booking
  spatial audit snapshots preserve provider-candidate and manual-pin
  provenance
- `apps/api/tests/unit/owned-mobility.service.test.ts:390` verifies text-only
  legacy bookings retain explicit `legacy_text` provenance and manual-review
  dispatch gating

## 5. Fresh Verification

Rerun on `2026-07-01` UTC from the current integrated tree:

| Command | Result |
| --- | --- |
| `pnpm exec prettier --check packages/contracts/src/index.ts apps/api/src/modules/geo/geo.service.ts apps/api/src/modules/geo/mock-geo.provider.ts apps/api/src/modules/service-area/service-area.service.ts apps/api/tests/unit/geo.service.test.ts apps/api/tests/unit/service-area.service.test.ts apps/api/tests/unit/owned-mobility.service.test.ts` | PASS |
| `pnpm --filter @drts/contracts typecheck` | PASS |
| `pnpm --filter @drts/contracts lint` | PASS |
| `pnpm --filter @drts/contracts test` | PASS with `No test files found` |
| `pnpm --filter @drts/api typecheck` | PASS |
| `pnpm --filter @drts/api lint` | PASS |
| `pnpm --dir apps/api exec vitest run tests/unit/geo.service.test.ts tests/unit/service-area.service.test.ts tests/unit/owned-mobility.service.test.ts` | PASS - `3` files / `100` tests passed |
| `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/geo.service.test.ts apps/api/tests/unit/service-area.service.test.ts apps/api/tests/unit/owned-mobility.service.test.ts` | PASS - `111` files / `795` tests passed because current package script wiring still expands to the full API suite |

Notes:

- the direct `vitest run` command is the cleaner reviewer rerun command for the
  geo/service-area/provenance slice
- the package-script test invocation remains green but emits large amounts of
  unrelated log noise because it expands to the full API suite

## 6. Reviewer Focus

Recommended focus for `Codex2` reviewing this sidecar packet:

1. Confirm the parent acceptance wording "`contracts typecheck and tests pass`"
   is still satisfied by the current evidence split: contracts package
   typecheck/lint is green, but executable geo/provenance tests live in API
   unit tests rather than in `@drts/contracts`.
2. Confirm enum-level support for `saved_address` and `external_platform` is
   sufficient for `MAP-BE-001`, given the fresh reruns more directly exercise
   `provider_candidate`, `manual_pin`, `reverse_geocode`, and `legacy_text`.
3. Confirm it is acceptable that the cited anchors come from the current
   integrated tree, where later tasks already consume the `MAP-BE-001`
   contract surface, rather than from an isolated parent-only branch snapshot.

## 7. Reviewer Commands

Approve if the packet and machine truth align after owner handoff places the
task in `review`:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve MAP-BE-001-SIDECAR-REVIEW \
  "MAP-BE-001 sidecar review packet approved: machine truth, reviewer transport, acceptance evidence map, and support-only scope are aligned."
```

Reopen if the packet drifted or if the support-only boundary was violated:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen MAP-BE-001-SIDECAR-REVIEW \
  "packet needs refresh: [machine-truth mismatch / stale evidence anchor / branch transport mismatch / support-scope violation]"
```

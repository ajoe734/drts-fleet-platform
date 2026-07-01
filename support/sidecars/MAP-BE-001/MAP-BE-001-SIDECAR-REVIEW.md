# Review Packet: MAP-BE-001-SIDECAR-REVIEW

- **Sidecar Kind:** `review_packet`
- **Parent Task:** `MAP-BE-001` - Geo contracts and coordinate provenance
- **Parent Owner / Reviewer:** `Codex` / `Claude2`
- **Sidecar Owner / Reviewer:** `Claude` / `Codex`
- **Planning Anchor:** `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md`
- **Gap Inventory:** `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md`
- **Machine-Truth Basis:** sidecar packet prepared from `in_progress` as of `2026-07-01T15:45Z` dispatch; parent `MAP-BE-001` in `review` (last update `2026-07-01T07:45:31Z`)
- **Code Basis:** current task worktree branch `claude/map-be-001-sidecar-review`, base `dev@f452f019f`, which already includes later map consumers (MAP-BE-004/006)

This is a fresh reviewer handoff for the current `MAP-BE-001-SIDECAR-REVIEW`
dispatch on `claude/map-be-001-sidecar-review`. It supersedes an earlier run of
the same artifact that lived on `codex/map-be-001-sidecar-review` (sidecar owner
`Codex` / reviewer `Codex2`). The current dispatch re-created the sidecar with
owner `Claude` / reviewer `Codex`; judge it against current machine truth,
current code anchors, and the fresh verification captured in §5.

## 1. Scope Boundary

Allowed:

- summarize reviewer-facing evidence for `MAP-BE-001`
- map parent acceptance items to concrete code and test anchors
- record fresh verification runs on the current integrated tree
- explain where the integrated snapshot goes beyond the original parent-only
  diff without expanding parent acceptance

Not allowed:

- editing L1/L2 canonical truth
- editing parent implementation/runtime/contract files through this sidecar
- changing the parent `MAP-BE-001` lifecycle through this packet
- changing machine truth except through `scripts/ai-status.sh`

## 2. Machine-Truth Anchors

### 2.1 Sidecar task

- `id`: `MAP-BE-001-SIDECAR-REVIEW`
- `owner`: `Claude`
- `reviewer`: `Codex`
- `status`: `in_progress` -> handoff to `review` on packet completion
- `helper_parent`: `MAP-BE-001`
- `helper_kind`: `review_packet`
- `mutates_canonical`: `false`
- `depends_on`: `MAP-PROD-000`
- artifact path: `support/sidecars/MAP-BE-001/MAP-BE-001-SIDECAR-REVIEW.md`

### 2.2 Parent task

- `id`: `MAP-BE-001`
- `title`: Geo contracts and coordinate provenance
- `owner`: `Codex`
- `reviewer`: `Claude2`
- `status`: `review`
- `depends_on`: `MAP-PROD-000`
- `mutates_canonical`: `true`
- `artifacts`: `packages/contracts/src/index.ts`, `packages/contracts/`
- `planning_ref`: `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md`
- declared acceptance:
  1. legacy `AddressPayload` compatible
  2. provenance fields support provider/manual/saved/reverse/external sources
  3. coordinate validation tested
  4. contracts typecheck and tests pass

### 2.3 Reviewer transport

The sidecar review source of truth is this artifact after the owner pushes the
packet commit and hands off:

```bash
git fetch origin claude/map-be-001-sidecar-review
git show origin/claude/map-be-001-sidecar-review:support/sidecars/MAP-BE-001/MAP-BE-001-SIDECAR-REVIEW.md | sed -n '1,260p'
```

Machine-truth spot checks for the reviewer:

```bash
AI_NAME=Codex scripts/ai-status.sh show MAP-BE-001-SIDECAR-REVIEW
AI_NAME=Codex scripts/ai-status.sh show MAP-BE-001
```

### 2.4 Integrated snapshot note

The current tree already includes later consumers of the `MAP-BE-001` contract
surface:

- `MAP-BE-004`: booking/service-area consumer
- `MAP-BE-006`: `ceecb45a08b71ea39e5932c2e1aa1a9d88536191` (service-area governance)

Reviewer implication:

- judge `MAP-BE-001` against its declared acceptance and parent machine-truth
  summary
- treat later booking/governance usage as supporting evidence that the contract
  shape is consumed, not as extra parent acceptance scope

## 3. Acceptance-To-Evidence Matrix

All line anchors verified against the current worktree (`packages/contracts/src/index.ts`
and `apps/api/tests/unit/*`) on `2026-07-01`.

| Parent acceptance item | Evidence |
| --- | --- |
| legacy `AddressPayload` compatible | `packages/contracts/src/index.ts:2542` keeps `AddressPayload` with the legacy `lat`/`lng` shape and adds all provenance fields as optional/additive: `geocodeProvider` (`:2552`), `geocodeConfidence` (`:2553`), `coordinateSource` (`:2554`), `coordinateAccuracyM` (`:2555`), and `coordinateProvenance` (`:2563`). The stricter post-resolution shape is a separate `ResolvedAddressPayload extends AddressPayload` at `:2566`, so resolution tightening does not break legacy payloads. |
| provenance fields support provider/manual/saved/reverse/external sources | `packages/contracts/src/index.ts:96` defines `GEO_COORDINATE_SOURCES` as `provider_candidate`, `manual_pin`, `saved_address`, `reverse_geocode`, `external_platform`, `legacy_text` (`:97`-`:102`). `GeoCoordinateProvenance` is defined at `:131`. Provider-neutral commands `ResolveAddressCommand` (`:172`) and `ReverseGeocodeCommand` (`:183`) plus `GeoSearchResponse` (`:190`) carry the surface. Tests exercise `provider_candidate` (`apps/api/tests/unit/geo.service.test.ts:91`), `manual_pin` (`:117`), and `reverse_geocode` (`:133`). |
| coordinate validation tested | Validators `isValidLatitude` (`packages/contracts/src/index.ts:263`), `isValidLongitude` (`:272`), `hasAddressCoordinates` (`:289`), and `hasAddressCoordinateProvenance` (`:295`). `apps/api/tests/unit/geo.service.test.ts:245` rejects invalid search/coordinate input before hitting the provider; `apps/api/tests/unit/geo.service.test.ts:188` fails closed on invalid provider mode; `apps/api/tests/unit/service-area.service.test.ts:179` asserts an `INVALID_COORDINATE` error for out-of-range coordinates; `apps/api/tests/unit/owned-mobility.service.test.ts:433` keeps text-only legacy orders in `legacy_text` manual review rather than dispatchable coordinates. |
| contracts typecheck and tests pass | Fresh reruns in §5 pass: `@drts/contracts` typecheck/lint/test and `@drts/api` typecheck/lint are green, and the targeted geo/service-area/owned-mobility Vitest slice passes `3` files / `100` tests. Nuance for the reviewer: `pnpm --filter @drts/contracts test` exits `0` with `No test files found`, so executable geo/provenance behavior currently lives in `apps/api` unit tests rather than colocated `@drts/contracts` tests. |

## 4. Downstream Consumption Anchors

Not extra parent acceptance, but evidence the `MAP-BE-001` surface is actively
consumed on the current integrated tree:

- `apps/api/tests/unit/service-area.service.test.ts:60` / `:96` / `:123` assert
  `geometryVersionRefs` evidence on serviceable/deny/manual-review outcomes
- `apps/api/tests/unit/owned-mobility.service.test.ts:303` / `:315` verify
  booking spatial audit snapshots preserve `provider_candidate` and `manual_pin`
  provenance
- `apps/api/tests/unit/owned-mobility.service.test.ts:415` / `:433` verify
  text-only legacy bookings retain explicit `legacy_text` provenance and stay in
  manual-review dispatch gating

## 5. Fresh Verification

All commands rerun on `2026-07-01` UTC from this task worktree
(`claude/map-be-001-sidecar-review`, base `dev@f452f019f`):

| Command | Result |
| --- | --- |
| `pnpm --filter @drts/contracts typecheck` | PASS (exit 0) |
| `pnpm --filter @drts/contracts lint` | PASS (exit 0) |
| `pnpm --filter @drts/contracts test` | PASS (exit 0), `No test files found` |
| `pnpm --filter @drts/api typecheck` | PASS (exit 0) |
| `pnpm --filter @drts/api lint` | PASS (exit 0) |
| `pnpm --dir apps/api exec vitest run tests/unit/geo.service.test.ts tests/unit/service-area.service.test.ts tests/unit/owned-mobility.service.test.ts` | PASS - `3` files / `100` tests passed (~1.8s) |

Notes:

- the direct `vitest run` command is the cleanest reviewer rerun for the
  geo/service-area/provenance slice
- `@drts/api` typecheck builds `@drts/contracts` first, so a green API typecheck
  also confirms the contracts build emits cleanly

## 6. Reviewer Focus

Recommended focus for `Codex` reviewing this sidecar packet:

1. Confirm parent acceptance wording "`contracts typecheck and tests pass`" is
   satisfied by the current evidence split: contracts package typecheck/lint is
   green, but executable geo/provenance tests live in `apps/api` unit tests
   rather than in `@drts/contracts`.
2. Confirm enum-level support for `saved_address` and `external_platform` is
   sufficient for `MAP-BE-001`, given the fresh reruns more directly exercise
   `provider_candidate`, `manual_pin`, `reverse_geocode`, and `legacy_text`.
3. Confirm it is acceptable that cited anchors come from the current integrated
   tree (`dev@f452f019f` with later MAP consumers) rather than an isolated
   parent-only branch snapshot.

## 7. Reviewer Commands

Approve if the packet and machine truth align after the owner handoff places the
sidecar in `review`:

```bash
AI_NAME=Codex scripts/ai-status.sh approve MAP-BE-001-SIDECAR-REVIEW \
  "MAP-BE-001 sidecar review packet approved: machine truth, reviewer transport, acceptance evidence map, and support-only scope are aligned on origin/claude/map-be-001-sidecar-review."
```

Reopen if the packet drifted or the support-only boundary was violated:

```bash
AI_NAME=Codex scripts/ai-status.sh reopen MAP-BE-001-SIDECAR-REVIEW \
  "packet needs refresh: [machine-truth mismatch / stale evidence anchor / branch transport mismatch / support-scope violation]"
```

## 8. Owner Closeout Snapshot

- lifecycle for this artifact: `in_progress` -> handoff `review` -> reviewer
  `approve` -> `review_approved` -> owner closeout `done`
- required closeout evidence: task-scoped commit, normal non-force push, and
  `INTEGRATION_STATUS=not_applicable` because this sidecar only ships support
  material (`mutates_canonical=false`, sidecar §11.6 `commit_required=false`)
- canonical/runtime implication: none; parent owner `Codex` / parent reviewer
  `Claude2` decide separately whether to absorb this packet into the mainline
  `MAP-BE-001` review history

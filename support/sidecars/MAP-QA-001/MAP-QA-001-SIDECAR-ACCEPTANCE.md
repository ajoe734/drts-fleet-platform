# MAP-QA-001 SIDECAR ACCEPTANCE

Status: refreshed for review handoff to `Codex2`
Owner: Codex
Reviewer: Codex2
Last Update: 2026-07-01

## 0. Scope Boundary

This sidecar is a support-only acceptance packet for parent task `MAP-QA-001`.
It does not modify canonical truth, runtime code, contracts, or execution docs.
Its purpose is to package the current acceptance checklist, dependency map, and
live evidence snapshot for reviewer consumption.

This refresh supersedes the earlier Gemini-targeted draft after reviewer
reassignment and the failed review cycle that reported the sidecar packet as
missing on the reviewer branch snapshot.

- In scope: acceptance checklist, dependency map, live artifact inventory,
  reviewer-facing evidence anchors, residual blockers
- Out of scope: writing `tests/e2e/*`, `packages/shared-test-fixtures/*`,
  `apps/api/*`, or changing execution/gap documents

## 1. Machine-Truth Baseline

- Sidecar task: `MAP-QA-001-SIDECAR-ACCEPTANCE` is owned by `Codex`, reviewer
  `Codex2`, and exists to create support artifacts only.
- Parent task: `MAP-QA-001` is currently `in_progress` under owner `Gemini`,
  reviewer `Codex2`.
- Parent declared dependencies in machine truth:
  - `MAP-BE-002` (`in_progress`)
  - `MAP-UI-001` (`in_progress`)
- Parent acceptance in machine truth:
  - mock fixtures cover all service decisions
  - CI runs offline
  - test helpers documented
  - targeted harness tests pass

Practical note: the parent `planning_ref` / `gap_ref` in machine truth point to
`20260701` filenames that are not present in this worktree. For this packet, the
nearest live repo anchors are:

- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`

This packet treats those two files as the read-only documentary anchors and does
not rewrite machine truth.

## 2. Parent Intent Snapshot

The execution packet describes `MAP-QA-001` as the L4 task that should make map
flows testable in CI without external provider calls, with explicit coverage for
serviceable, not-serviceable, no-pickup, manual-review, provider-unavailable,
and no-geocode states.

Read-only anchors:

- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:164`
  registers `MAP-QA-001` as the mocked-provider fixture / E2E harness task.
- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:793-838`
  defines the intended work, acceptance, and claimed implementation/verification
  surface for `MAP-QA-001`.
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:331-339`
  records the remaining callcenter/backend E2E coverage that still has to close
  before Gate A is safe.
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:452-459`
  records the need for deterministic Playwright map mocks in observability/tests.

## 3. Dependency Map

### Hard prerequisites

| Task | Status | Why it matters |
| --- | --- | --- |
| `MAP-BE-002` | `in_progress` | Owns the provider-neutral geo gateway and deterministic mock provider used by any offline map harness. Current review findings still say the gateway is not fully swappable and direct-service invalid-limit handling is missing. |
| `MAP-UI-001` | `in_progress` | Owns the shared web `AddressMapPicker` surface that `MAP-QA-001` is supposed to exercise offline. Without the picker contract and degraded/manual states landing, a full acceptance harness cannot prove the intended UI paths. |

### Live read-only anchors behind those prerequisites

| Anchor | Location | Why it matters now |
| --- | --- | --- |
| D-1 | `apps/api/src/modules/geo/mock-geo.provider.ts:27-114` | Mock provider already contains deterministic Taipei/airport/manual-review-friendly place records including `mock-taipei-city-hall`, `mock-taipei-station`, `mock-xinyi-hospital`, and `mock-taoyuan-airport-t1`. |
| D-2 | `apps/api/tests/unit/geo.service.test.ts:37-186` | Backend unit tests already verify deterministic search/resolve/reverse behavior, manual pin fallback, provider-unavailable normalization, and fail-closed runtime behavior. |
| D-3 | `tests/e2e/map-geofence-harness.ts:1-16` | The only currently visible E2E harness helper in this worktree is a mock map-tile route installer. |
| D-4 | `packages/shared-test-fixtures/src/index.ts:1-103` | Shared test fixtures package exists, but the currently visible exports are generic scenario/Tesla helpers rather than the map/geofence fixture module named in the execution packet. |

## 4. Acceptance Checklist

This checklist separates sidecar completion from parent readiness.

### Sidecar deliverables

- [x] Create a support-only acceptance packet under `support/sidecars/MAP-QA-001/`
- [x] Capture the parent/dependency machine-truth snapshot without editing canonical truth
- [x] Build a reviewer-facing dependency map
- [x] Build a live artifact inventory against the current worktree
- [x] Hand off the packet to the assigned reviewer through `scripts/ai-status.sh`

### Parent readiness snapshot at this review handoff

- [x] Backend mock provider exposes deterministic search fixtures for Taipei core,
  Taipei Station, Xinyi/manual-review-friendly location, and Taoyuan airport
- [x] Backend geo unit tests cover deterministic search, resolve, reverse,
  manual pin fallback, provider-unavailable, and fail-closed behavior
- [x] A basic Playwright mock map tile helper exists
- [ ] `packages/shared-test-fixtures/src/map-geofence-fixtures.ts` exists in this worktree
- [ ] `packages/shared-test-fixtures/tests/unit/map-geofence-fixtures.test.ts` exists in this worktree
- [ ] `tests/e2e/map-geofence-harness.spec.ts` exists in this worktree
- [ ] `playwright.map-geofence-harness.config.ts` exists in this worktree
- [ ] `support/sidecars/MAP-QA-001/MAP-QA-001-MOCK-PROVIDER-HARNESS.md` exists in this worktree
- [ ] Offline CI harness verification can be revalidated from the currently visible repo snapshot

## 5. Expected Artifact Inventory Vs. Live Snapshot

The execution packet names a set of artifacts and verification steps. The table
below records what is directly observable in this worktree at the time of this
sidecar handoff.

| Expected from parent packet | Current observable state | Evidence |
| --- | --- | --- |
| `packages/shared-test-fixtures/src/map-geofence-fixtures.ts` | Missing | direct existence check in this worktree returned `missing` |
| `packages/shared-test-fixtures/tests/unit/map-geofence-fixtures.test.ts` | Missing | direct existence check in this worktree returned `missing` |
| `tests/e2e/map-geofence-harness.ts` with geo/service-area/proxy stubs | Present, but currently only installs `**/mock-map-tiles/**` route | `tests/e2e/map-geofence-harness.ts:1-16` |
| `tests/e2e/map-geofence-harness.spec.ts` | Missing | direct existence check in this worktree returned `missing` |
| `playwright.map-geofence-harness.config.ts` | Missing | direct existence check in this worktree returned `missing` |
| `support/sidecars/MAP-QA-001/MAP-QA-001-MOCK-PROVIDER-HARNESS.md` | Missing | direct existence check in this worktree returned `missing` |
| documented verification bundle for `MAP-QA-001` | Not directly reproducible from the current visible file set | execution packet claims commands at `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:831-838`, but several named harness artifacts are absent here |

Interpretation: this sidecar does not claim the parent acceptance is complete.
It records that some backend/mock-provider groundwork is present, but the full
fixture package, harness spec/config, and parent support documentation named by
the execution packet are not visible in this worktree snapshot.

## 6. Evidence Anchors

| Evidence | Anchor |
| --- | --- |
| Parent task registration and declared dependencies | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:164` |
| Parent work/acceptance/verification contract | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:793-838` |
| Gap plan still requiring map-aware callcenter/E2E closure | `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:331-339` |
| Gap plan calling for deterministic Playwright map mocks | `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:452-459` |
| Current harness helper scope | `tests/e2e/map-geofence-harness.ts:1-16` |
| Current shared-test-fixtures exports | `packages/shared-test-fixtures/src/index.ts:1-103` |
| Deterministic mock provider place records | `apps/api/src/modules/geo/mock-geo.provider.ts:27-114` |
| Deterministic backend geo tests | `apps/api/tests/unit/geo.service.test.ts:37-186` |

## 7. Residual Blockers And Review Focus

1. `MAP-BE-002` is still `in_progress` with live review findings recorded in
   machine truth. That means the geo gateway dependency is not yet acceptance
   clean even though the mock provider and geo tests exist.
2. `MAP-UI-001` is still `in_progress`, so the shared picker surface that the
   QA harness should exercise is not yet closed out either.
3. The parent task's `planning_ref` / `gap_ref` filenames in machine truth do
   not match the live `20260630` docs present in this worktree. This packet
   worked from the live docs and leaves machine truth untouched.
4. The execution packet's "Implementation status as of 2026-06-30" lists
   artifact paths that are not all present in this worktree snapshot. Reviewer
   should treat that section as intended/claimed state, not as independently
   revalidated evidence from this branch.

## 8. Reviewer Handoff Notes

This sidecar packet is ready for `Codex2` review as a support artifact. It does
not certify parent `MAP-QA-001` as done; it packages the current acceptance
surface, dependency states, and live inventory so the reviewer and parent owner
can see exactly what is already evidenced versus what still depends on parent
implementation landing.

Suggested reviewer actions:

- Approve if this packet accurately reflects the current machine-truth snapshot
  and live repo inventory without mutating canonical truth.
- Reopen if any dependency state, artifact inventory, or evidence anchor needs
  correction.

Approval command:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve MAP-QA-001-SIDECAR-ACCEPTANCE \
  "Reviewed MAP-QA-001 acceptance packet: dependency map and live artifact inventory align to current parent snapshot, and the sidecar stays support-only."
```

Reopen command:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen MAP-QA-001-SIDECAR-ACCEPTANCE \
  "<reason>"
```

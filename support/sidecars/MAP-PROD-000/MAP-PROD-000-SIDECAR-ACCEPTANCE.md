# MAP-PROD-000 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `MAP-PROD-000` - Map provider and rollout decision  
**Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Claude`  
**Parent Owner / Reviewer (current snapshot):** `Claude` / `Codex`  
**Generated:** `2026-06-30T14:48:57Z` (UTC)  
**Snapshot Status:** Parent `MAP-PROD-000` remains `backlog` in machine truth (`last_update: 2026-06-30T14:32:44Z`). No parent owner `start` / `progress` / `handoff` event is present yet. This sidecar is support-only and does not claim parent implementation, review, or closeout.

> **Provenance.** Repo HEAD at packet generation is `dea23760c` (`P2-V9-UI-VERIFY-001: replay verify evidence on clean branch (#1007)`) on branch `codex/map-prod-000-sidecar-acceptance`.

## 1) Scope Boundary

This sidecar only prepares reviewer-facing acceptance framing, dependency mapping, repo baseline, and handoff notes for `MAP-PROD-000`.

- In scope: support-only acceptance checklist, dependency map, artifact-path audit, feature-flag baseline, provider-lock-in scan notes, reviewer hotspots, and handoff wording.
- Out of scope: editing canonical docs under `docs/`, changing runtime or contract code, deciding the map provider on behalf of the parent owner, or inventing rollout truth not already recorded in machine state.

## 2) Current State Baseline

### 2.1 Parent machine truth

- `ai-status.json` records `MAP-PROD-000` as:
  - `status=backlog`
  - `owner=Claude`
  - `reviewer=Codex`
  - `depends_on=[]`
- Parent acceptance is explicitly:
  - `provider strategy recorded`
  - `mock provider required for CI`
  - `coordinate-less booking policy recorded`
  - `feature flags defined`
  - `no UI hard-codes provider before decision`
- Parent summary also names the expected decision surfaces:
  - web/native map + geocode strategy
  - mock provider
  - quota/key/authorization/data-retention requirements
  - coordinate-less booking policy
  - feature flags `geoProviderEnabled`, `addressMapPickerEnabled`, `serviceAreaGateEnforced`, `opsRealMapEnabled`, `platformGeometryEditorEnabled`, `driverTripMapEnabled`
- Parent `production_gates` are already declared in machine truth:
  - `Gate A: Callcenter safe to dispatch`
  - `Gate B: Governance safe to publish`
  - `Gate C: Ops safe to operate`
  - `Gate D: Driver safe to navigate`
  - `Gate E: Degraded safe`

### 2.2 Declared parent artifacts are not present on this branch

Machine truth points to these parent artifacts:

- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`

Current repo snapshot does not contain either file:

- `find docs -type f | grep 'map-geofence|geofence|address-pinning'` returns no matching canonical doc paths.
- `git ls-tree -r --name-only HEAD | grep 'map-geofence|geofence-gap|address-pinning'` returns no tracked match.

Assessment:

- The parent task has named artifact destinations in machine truth, but the actual canonical files are not yet present on this branch.
- Reviewer should treat those files as required future deliverables, not as already-existing evidence.
- This sidecar therefore frames `MAP-PROD-000` as a preflight acceptance packet for a backlog task, not as a post-implementation review packet.

### 2.3 Existing feature-flag infrastructure already exists

The repo already has a usable rollout-control plane that the parent task can reuse:

- `apps/api/src/common/auth/feature-gate.guard.ts:24-57` resolves a `flagKey`, derives tenant scope from authenticated identity or `x-tenant-id`, and rejects disabled routes with `FEATURE_FLAG_DISABLED`.
- `apps/api/src/modules/feature-flags/feature-flags.controller.ts:20-87` exposes admin flag listing, single-flag reads, platform toggle, tenant override upsert, and enabled-state checks.
- `apps/platform-admin-web/app/feature-flags/page.tsx:416-518,563-589,680-760` already provides a platform-admin feature-flag registry UI with rollout-state filters, tenant-scope inspection, toggle actions, and audit-receipt framing.
- `apps/api/tests/unit/feature-gate.guard.test.ts:21-27,103-158,160-203,206-220` shows the guard is already tested against explicit feature-gated keys and tenant scoping.

Assessment:

- `MAP-PROD-000` does not need to invent a new feature-flag framework.
- The missing work is the map/geofence-specific flag definition and rollout policy, not the underlying flag transport or admin surface.

### 2.4 Map/provider-specific keys and docs are not yet defined

Repo-wide scans in the current snapshot show:

- No match for the task-specific flag names:
  - `geoProviderEnabled`
  - `addressMapPickerEnabled`
  - `serviceAreaGateEnforced`
  - `opsRealMapEnabled`
  - `platformGeometryEditorEnabled`
  - `driverTripMapEnabled`
- No canonical map/geofence decision doc currently tracked under `docs/02-architecture` or `docs/03-runbooks`.
- No current in-repo `apps/` / `packages/` hit for `mapbox`, `Google Maps`, `Leaflet`, `OpenStreetMap`, `react-native-maps`, `maps.googleapis`, or `google-map-react`.

Assessment:

- There is no current monorepo evidence that these six map/geofence flag keys have already been defined.
- There is also no active in-repo map SDK choice recorded in `apps/` or `packages/`, so the monorepo itself does not currently appear hard-locked to a provider.
- That makes the missing parent decision artifact even more important: the decision still needs to be recorded, not inferred.

### 2.5 Historical cross-repo provider precedent exists and must be classified

One repo-visible historical support artifact references an external map implementation:

- `support/sidecars/OPX-DP-004/OPX-DP-004-SIDECAR-ACCEPTANCE.md:39-49` states that `tenant-commute-hub/src/components/MapPicker.tsx` used `mapbox-gl` with a configurable token from `localStorage`, not a hardcoded token.

Assessment:

- This does not prove the current state of repo B or any live product surface in this monorepo.
- It does prove there is a prior cross-repo Mapbox-based pattern that the parent owner should explicitly classify:
  - keep as accepted baseline
  - replace
  - gate behind rollout flags
  - or mark out of current scope
- Reviewer should not let a historical sidecar note silently become the provider decision.

### 2.6 Activity baseline

The task activity log currently shows:

- `2026-06-30T14:32:44Z` - parent `MAP-PROD-000` assigned to `Claude` with reviewer `Codex`
- `2026-06-30T14:45:51Z` - this sidecar assigned to `Codex` with reviewer `Claude`
- `2026-06-30T14:46:18Z` - sidecar moved to `in_progress`

No parent owner `start`, `progress`, `handoff`, or `review` event is visible yet.

Assessment:

- The parent task is still at pre-implementation / pre-decision stage.
- This sidecar should be read as a reviewer-ready acceptance frame for future parent work, not as evidence that the parent is reviewable today.

## 3) Parent Acceptance Framing

This section expands the parent task's exact acceptance bullets into reviewer-facing checks without adding new product semantics.

### AC-1 - `provider strategy recorded`

- [ ] Not yet satisfied in the current snapshot.
- The two parent artifact paths that should plausibly record this decision are not present on the branch (§2.2).
- Parent closeout should explicitly name:
  - web map provider strategy
  - native map provider strategy
  - geocoding / reverse-geocoding strategy
  - whether one provider serves all surfaces or the solution is intentionally split by surface

### AC-2 - `mock provider required for CI`

- [ ] Not yet satisfied in the current snapshot.
- No map-specific mock-provider policy or CI decision artifact is currently tracked under the declared parent docs (§2.2, §2.4).
- Parent closeout should state:
  - whether CI uses a pure mock provider, a fixture-based adapter, or a fake geocoder
  - which tests rely on it
  - how the mock avoids real key / quota dependency

### AC-3 - `coordinate-less booking policy recorded`

- [ ] Not yet satisfied in the current snapshot.
- No canonical doc currently records what happens when booking flows lack coordinates but still need address entry, dispatch gating, map preview, or service-area enforcement.
- Parent closeout should make the degraded / fallback policy explicit across at least:
  - callcenter booking entry
  - tenant address entry or address-map pinning
  - ops dispatch review
  - service-area gate evaluation

### AC-4 - `feature flags defined`

- [ ] Not yet satisfied in the current snapshot.
- The flag infrastructure exists (§2.3), but the six map/geofence-specific keys named in the task summary do not appear in the repo scan (§2.4).
- Parent closeout should define at minimum:
  - ownership of each flag
  - default state
  - tenant/global scope expectations
  - whether each flag gates UI only, backend enforcement only, or both
- Reviewer should prefer reuse of the existing feature-flag plane over ad hoc env-var-only rollout.

### AC-5 - `no UI hard-codes provider before decision`

- [~] No current monorepo hard-coded provider reference was found in `apps/` / `packages/` for common map SDK signatures (§2.4).
- [ ] This is still not fully closable yet, because the parent decision artifact is missing and a historical cross-repo Mapbox precedent exists (§2.5).
- Reviewer should require the parent owner to explicitly state whether any external or adjacent UI surface already depends on a provider and how that posture relates to the new decision.

## 4) Dependency Map

### 4.1 Formal machine dependencies

`MAP-PROD-000.depends_on=[]`.

There are no formal upstream blockers recorded in machine truth today.

### 4.2 Practical decision dependencies

| Dep ID | Anchor | Why It Matters |
| ------ | ------ | -------------- |
| D-P-1 | `ai-status.json` entry for `MAP-PROD-000` | Defines the exact parent acceptance bullets, production gates, artifact paths, and expected flag names. |
| D-P-2 | Missing artifact paths in §2.2 | Parent cannot satisfy "strategy recorded" or "policy recorded" acceptance until the declared docs exist or machine truth is corrected. |
| D-P-3 | `apps/api/src/common/auth/feature-gate.guard.ts:24-57` | Existing route-gating mechanism the parent should reuse for map/geofence rollout flags. |
| D-P-4 | `apps/api/src/modules/feature-flags/feature-flags.controller.ts:20-87` | Existing admin API for platform defaults, tenant overrides, and enabled-state checks. |
| D-P-5 | `apps/platform-admin-web/app/feature-flags/page.tsx:416-518,563-589,680-760` | Existing operator-facing flag registry UI; useful for map/geofence rollout governance. |
| D-P-6 | `apps/api/tests/unit/feature-gate.guard.test.ts:103-158,160-203,206-220` | Existing test pattern for named feature-gated routes with tenant scoping. |
| D-P-7 | repo-wide scan for `geoProviderEnabled|addressMapPickerEnabled|serviceAreaGateEnforced|opsRealMapEnabled|platformGeometryEditorEnabled|driverTripMapEnabled` | Confirms the task-specific flags are not yet defined in the current snapshot. |
| D-P-8 | repo-wide scan for `mapbox|Google Maps|Leaflet|OpenStreetMap|react-native-maps` across `apps/` and `packages/` | Confirms no current monorepo provider lock-in was found in the tracked app/package code. |
| D-P-9 | `support/sidecars/OPX-DP-004/OPX-DP-004-SIDECAR-ACCEPTANCE.md:39-49` | Historical cross-repo Mapbox precedent that must be explicitly classified by the parent decision. |

### 4.3 Downstream consumer map

| Consumer / Gate | Current status | Why It Matters |
| --------------- | -------------- | -------------- |
| Parent owner `Claude` | `backlog` | Must produce or correct the canonical decision artifacts before acceptance can move beyond framing. |
| Parent reviewer `Codex` | `pending future review` | Should review the eventual decision packet against the exact five parent acceptance bullets, not against inferred provider preferences. |
| Sidecar reviewer `Claude` | `assigned` | Reviews whether this packet accurately captures the current preflight state without mutating canonical truth. |
| `Gate A: Callcenter safe to dispatch` | `pending decision` | Needs address capture, service-area policy, and coordinate-less fallback posture. |
| `Gate B: Governance safe to publish` | `pending decision` | Needs quota/key/auth/data-retention requirements plus rollout/governance control. |
| `Gate C: Ops safe to operate` | `pending decision` | Needs real-map vs degraded policy and service-area enforcement posture. |
| `Gate D: Driver safe to navigate` | `pending decision` | Needs driver-trip map strategy and degraded behavior. |
| `Gate E: Degraded safe` | `pending decision` | Needs explicit fallback behavior when coordinates, provider access, or map rendering are unavailable. |

## 5) Evidence Inventory

| ID | Evidence | Location / Source |
| -- | -------- | ----------------- |
| E-1 | Parent task machine state | `ai-status.json` entry for `MAP-PROD-000` via `scripts/ai-status.sh show MAP-PROD-000` |
| E-2 | Sidecar task machine state | `ai-status.json` entry for `MAP-PROD-000-SIDECAR-ACCEPTANCE` via `scripts/ai-status.sh show MAP-PROD-000-SIDECAR-ACCEPTANCE` |
| E-3 | Parent has no `start`/`progress`/`handoff` activity yet | `ai-activity-log.jsonl` lines matching `MAP-PROD-000` |
| E-4 | Declared parent artifact paths | `MAP-PROD-000.artifacts` in machine truth |
| E-5 | Missing canonical map/geofence docs on current branch | repo scans in §2.2 |
| E-6 | Existing feature-gate infra | `apps/api/src/common/auth/feature-gate.guard.ts:24-57` |
| E-7 | Existing feature-flags admin API | `apps/api/src/modules/feature-flags/feature-flags.controller.ts:20-87` |
| E-8 | Existing feature-flags admin UI | `apps/platform-admin-web/app/feature-flags/page.tsx:416-518,563-589,680-760` |
| E-9 | Existing feature-gate test posture | `apps/api/tests/unit/feature-gate.guard.test.ts:103-158,160-203,206-220` |
| E-10 | Task-specific map/geofence keys currently absent | repo-wide scan in §2.4 |
| E-11 | No current monorepo map-SDK lock-in found | repo-wide scan in §2.4 |
| E-12 | Historical Mapbox-based cross-repo precedent | `support/sidecars/OPX-DP-004/OPX-DP-004-SIDECAR-ACCEPTANCE.md:39-49` |

## 6) Reviewer Hotspots (`Claude`)

Reviewer should verify:

1. The packet preserves machine truth: parent `MAP-PROD-000` is still `backlog`, not `in_progress`, `review`, or `done`.
2. The packet does not pretend the two declared parent artifact paths already exist on this branch.
3. The acceptance framing stays faithful to the parent's exact five bullets and the six named feature flags from the task summary.
4. The packet correctly distinguishes "feature-flag infrastructure exists" from "map/geofence-specific flags are already defined" - only the former is true today.
5. The packet does not overclaim provider neutrality: it notes no current monorepo lock-in, but it also preserves the historical cross-repo Mapbox precedent as an explicit classification task for the parent owner.
6. The packet does not edit canonical docs, runtime code, contracts, or the parent task object beyond sidecar status updates.

## 7) Sidecar Acceptance Checklist

### AC-S1 - `Create support artifacts only`

- [x] Output limited to `support/sidecars/MAP-PROD-000/MAP-PROD-000-SIDECAR-ACCEPTANCE.md`.
- [x] Content is limited to acceptance framing, dependency mapping, evidence anchors, and reviewer guidance.

### AC-S2 - `Do not edit canonical truth`

- [x] No runtime, contract, or canonical doc file was modified.
- [x] Sidecar machine-state updates were recorded through `scripts/ai-status.sh`.

### AC-S3 - `Hand off the packet to the assigned reviewer`

- [x] Handed off to `Claude` in machine truth at `2026-06-30T14:50:45Z`.
- [x] Review is now pending on the sidecar task; parent `MAP-PROD-000` remains `backlog`.

## 8) Handoff Command

Owner (`Codex`) -> Reviewer (`Claude`)

```bash
AI_NAME=Codex scripts/ai-status.sh handoff MAP-PROD-000-SIDECAR-ACCEPTANCE Claude \
  "Prepared support-only MAP-PROD-000 acceptance packet at support/sidecars/MAP-PROD-000/MAP-PROD-000-SIDECAR-ACCEPTANCE.md. Parent MAP-PROD-000 remains backlog under Claude/Codex with no owner start/handoff activity yet; packet freezes the five parent acceptance bullets, records that the declared canonical artifact paths are not yet present on this branch, confirms existing feature-flag infrastructure is available for reuse, notes that the six map/geofence flag keys named in machine truth are not yet defined in the repo, and preserves the historical cross-repo Mapbox precedent as an explicit reviewer hotspot rather than an implicit provider decision. No canonical truth modified."
```

## 9) Notes For Parent Owner (`Claude`)

These are support observations, not new acceptance criteria:

1. The fastest way to unblock acceptance is to either create the two declared canonical artifact files or correct the machine-truth artifact paths if the decision docs will land elsewhere.
2. The parent task already names six rollout flags in its machine-truth summary; those names are currently absent from the repo, so the parent should either adopt them as-is or explicitly revise the naming in machine truth before review.
3. Existing feature-flag infra is already strong enough for tenant/global rollout and route gating. Parent work should reuse that plane rather than introduce map-specific ad hoc toggles.
4. The historical `tenant-commute-hub` Mapbox note should be explicitly classified in the parent decision packet so reviewer does not have to infer whether it is baseline, debt, or out of scope.
5. `Gate E: Degraded safe` should not be left implicit. The parent packet should directly say what happens when coordinates are unavailable, provider quota is exhausted, auth/key provisioning fails, or map rendering is intentionally disabled.

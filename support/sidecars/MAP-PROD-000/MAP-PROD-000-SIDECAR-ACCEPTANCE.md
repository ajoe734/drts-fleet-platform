# MAP-PROD-000 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `MAP-PROD-000` - Map provider and rollout decision  
**Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer (snapshot):** `Codex2` / `Codex`  
**Generated:** `2026-06-30T15:19:25Z` (UTC)  
**Snapshot Status:** `MAP-PROD-000-SIDECAR-ACCEPTANCE` is `in_progress`, and parent `MAP-PROD-000` is also `in_progress`. This packet is support-only; it does not claim parent closeout, canonical review completion, or provider selection.

> **Snapshot note.** This refresh supersedes an older packet draft that referenced an earlier `Claude`-owned snapshot. The current machine-truth owner/reviewer assignments above are authoritative.

## 1) Scope Boundary

This sidecar only prepares reviewer-facing acceptance framing, dependency mapping, and evidence pointers for `MAP-PROD-000`.

- In scope: support-only checklist expansion, dependency map, artifact-path audit, provider-scan notes, existing rollout-infrastructure evidence, and reviewer handoff notes.
- Out of scope: editing canonical docs under `docs/`, changing runtime or contract code, deciding the provider on behalf of the parent owner, or inventing rollout truth not already present in machine state or tracked repo evidence.

## 2) Current Snapshot

### 2.1 Sidecar machine truth

`scripts/ai-status.sh show MAP-PROD-000-SIDECAR-ACCEPTANCE` currently records:

- `status=in_progress`
- `owner=Codex`
- `reviewer=Codex2`
- `artifacts=["support/sidecars/MAP-PROD-000/MAP-PROD-000-SIDECAR-ACCEPTANCE.md"]`
- `next="Validating existing acceptance packet content, dependency map, and handoff readiness in the assigned sidecar worktree."`

Assessment:

- The sidecar is correctly assigned to this lane and still expects a fresh reviewer handoff.
- Any older in-file reference to reviewer `Claude` or a completed handoff is stale and should be ignored.

### 2.2 Parent machine truth

`scripts/ai-status.sh show MAP-PROD-000` currently records:

- `status=in_progress`
- `owner=Codex2`
- `reviewer=Codex`
- `depends_on=[]`
- `artifacts`:
  - `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
  - `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
- `acceptance`:
  - `provider strategy recorded`
  - `mock provider required for CI`
  - `coordinate-less booking policy recorded`
  - `feature flags defined`
  - `no UI hard-codes provider before decision`
- `production_gates`:
  - `Gate A: Callcenter safe to dispatch`
  - `Gate B: Governance safe to publish`
  - `Gate C: Ops safe to operate`
  - `Gate D: Driver safe to navigate`
  - `Gate E: Degraded safe`

Assessment:

- The parent task is active and no longer a backlog-only placeholder.
- This sidecar must therefore support an active implementation lane, while still avoiding canonical edits.

### 2.3 Declared parent artifact paths are still absent on this branch

The parent task declares two canonical deliverables, but tracked-file checks currently return no match:

- `git ls-files docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- `git ls-files docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`

Assessment:

- The parent task's declared canonical artifact destinations are known in machine truth.
- Those files are not yet present in the assigned branch snapshot used for this packet.
- Reviewer should treat this packet as preflight acceptance support, not as evidence that the parent's canonical decision docs are already reviewable.

### 2.4 Existing feature-flag infrastructure already exists

The repo already contains rollout infrastructure the parent task can reuse:

- `apps/api/src/common/auth/feature-gate.guard.ts:24-57`
  - route-level flag lookup
  - tenant derivation from identity or `x-tenant-id`
  - `FEATURE_FLAG_DISABLED` enforcement
- `apps/api/src/modules/feature-flags/feature-flags.controller.ts:20-87`
  - admin flag listing
  - single-flag reads
  - platform toggle
  - tenant override upsert
  - enabled-state checks
- `apps/platform-admin-web/app/feature-flags/page.tsx:416-518`
  - current flag loading and rollout-state grouping
- `apps/platform-admin-web/app/feature-flags/page.tsx:563-589`
  - rollout filters for all / mid-rollout / rolled-out / deprecated / tenant-overrides
- `apps/platform-admin-web/app/feature-flags/page.tsx:680-800`
  - operator-facing table with flag key, scope, state, and actions
- `apps/api/tests/unit/feature-gate.guard.test.ts:103-158`
  - decorated-route success case with tenant identity
- `apps/api/tests/unit/feature-gate.guard.test.ts:160-203`
  - header-based tenant fallback case
- `apps/api/tests/unit/feature-gate.guard.test.ts:206-260`
  - disabled-flag rejection case with structured error details

Assessment:

- `MAP-PROD-000` does not need a new flag framework.
- The missing work is map/geofence-specific flag definition and rollout policy, not transport or admin-plane invention.

### 2.5 Task-specific flag names are not yet defined in tracked repo files

Tracked-file scans across `apps/`, `packages/`, `support/`, and `docs/` currently show no match for:

- `geoProviderEnabled`
- `addressMapPickerEnabled`
- `serviceAreaGateEnforced`
- `opsRealMapEnabled`
- `platformGeometryEditorEnabled`
- `driverTripMapEnabled`

Assessment:

- The six flag names declared in the parent task summary are not yet materialized in tracked files on this branch.
- Reviewer should distinguish "flag infrastructure exists" from "map/geofence rollout keys are already defined." Only the former is currently true.

### 2.6 Current monorepo provider lock-in is not evident, but historical precedent exists

Tracked-file provider-string scans across `apps/`, `packages/`, `support/`, and `docs/` did not find a current app/package implementation hit for:

- `mapbox`
- `Google Maps`
- `Leaflet`
- `OpenStreetMap`
- `react-native-maps`
- `maps.googleapis`
- `google-map-react`

One historical support artifact still matters:

- `support/sidecars/OPX-DP-004/OPX-DP-004-SIDECAR-ACCEPTANCE.md:39-49`
  - cites a `MapPicker` precedent using `mapbox-gl`
  - notes token governance through `localStorage`, not a hardcoded token

Assessment:

- No current tracked monorepo provider lock-in was found in app/package code.
- A historical cross-repo Mapbox precedent exists and should be explicitly classified by the parent owner rather than silently inherited as the decision.

## 3) Parent Acceptance Framing

This section expands the parent's exact acceptance bullets into reviewer-facing checks without adding new product semantics.

### AC-1 - `provider strategy recorded`

- [ ] Not satisfied in this branch snapshot.
- The two declared canonical artifact paths are absent (§2.3).
- Parent closeout should explicitly state:
  - web map provider strategy
  - native map provider strategy
  - geocoding / reverse-geocoding strategy
  - whether the solution is unified or intentionally split by surface

### AC-2 - `mock provider required for CI`

- [ ] Not satisfied in this branch snapshot.
- No tracked canonical doc or test artifact currently records a map-specific CI mock strategy.
- Parent closeout should state:
  - whether CI uses a pure mock provider, adapter fake, or fixture-based geocoder
  - which tests rely on it
  - how the mock avoids real key and quota dependence

### AC-3 - `coordinate-less booking policy recorded`

- [ ] Not satisfied in this branch snapshot.
- No tracked canonical artifact currently records fallback behavior when booking flows lack coordinates.
- Parent closeout should make the degraded policy explicit for at least:
  - callcenter booking entry
  - tenant address capture / address-map pinning
  - ops dispatch review
  - service-area evaluation

### AC-4 - `feature flags defined`

- [ ] Not satisfied in this branch snapshot.
- The reusable flag plane exists (§2.4), but the six task-specific keys are not yet present in tracked files (§2.5).
- Parent closeout should define at minimum:
  - owner of each flag
  - default state
  - platform vs tenant scope
  - whether the flag gates UI only, backend only, or both

### AC-5 - `no UI hard-codes provider before decision`

- [~] No current tracked app/package provider hit was found in this branch snapshot (§2.6).
- [ ] This is still not fully closable from repo evidence alone because the decision artifact is missing and a historical Mapbox precedent exists (§2.6).
- Reviewer should require explicit parent-language on whether any adjacent surface already depends on a provider and how that posture relates to the new decision.

## 4) Dependency Map

### 4.1 Formal machine dependencies

`MAP-PROD-000.depends_on=[]`

There are no formally recorded upstream blockers in machine truth.

### 4.2 Practical dependencies

| Dep ID | Anchor | Why It Matters |
| ------ | ------ | -------------- |
| D-P-1 | `scripts/ai-status.sh show MAP-PROD-000` | Defines the exact parent acceptance bullets, artifact paths, and production gates. |
| D-P-2 | `scripts/ai-status.sh show MAP-PROD-000-SIDECAR-ACCEPTANCE` | Defines the current sidecar owner/reviewer pairing and required artifact path. |
| D-P-3 | Missing tracked canonical docs from §2.3 | Parent cannot satisfy recorded-strategy acceptance until those files exist or machine truth changes. |
| D-P-4 | `apps/api/src/common/auth/feature-gate.guard.ts:24-57` | Existing backend enforcement plane for named rollout flags. |
| D-P-5 | `apps/api/src/modules/feature-flags/feature-flags.controller.ts:20-87` | Existing admin API for platform defaults, tenant overrides, and enabled-state checks. |
| D-P-6 | `apps/platform-admin-web/app/feature-flags/page.tsx:416-518,563-589,680-800` | Existing operator-facing registry UI for rollout governance. |
| D-P-7 | `apps/api/tests/unit/feature-gate.guard.test.ts:103-158,160-203,206-260` | Existing test pattern for named feature-gated routes and tenant scoping. |
| D-P-8 | Absence scan for `geoProviderEnabled|addressMapPickerEnabled|serviceAreaGateEnforced|opsRealMapEnabled|platformGeometryEditorEnabled|driverTripMapEnabled` | Confirms map/geofence-specific keys are not yet defined in tracked files. |
| D-P-9 | Provider scan baseline from §2.6 | Confirms no current tracked app/package provider lock-in was found on this branch. |
| D-P-10 | `support/sidecars/OPX-DP-004/OPX-DP-004-SIDECAR-ACCEPTANCE.md:39-49` | Historical Mapbox precedent that the parent owner should classify explicitly. |

### 4.3 Downstream consumer map

| Consumer / Gate | Current status | Why It Matters |
| --------------- | -------------- | -------------- |
| Parent owner `Codex2` | `in_progress` | Owns the canonical provider decision and rollout-policy docs that are still absent on this branch. |
| Parent reviewer `Codex` | `future parent review` | Will review the eventual canonical packet against the exact five parent acceptance bullets. |
| Sidecar reviewer `Codex2` | `pending after handoff` | Reviews whether this packet accurately captures current machine truth and repo evidence without mutating canonical files. |
| `Gate A: Callcenter safe to dispatch` | `decision pending` | Needs address capture, coordinate fallback, and service-area posture. |
| `Gate B: Governance safe to publish` | `decision pending` | Needs provider/key/quota/retention and rollout-governance posture. |
| `Gate C: Ops safe to operate` | `decision pending` | Needs real-map vs degraded ops posture and geometry/service-area handling. |
| `Gate D: Driver safe to navigate` | `decision pending` | Needs driver-facing map/navigation strategy and degraded behavior. |
| `Gate E: Degraded safe` | `decision pending` | Needs explicit fallback behavior when coordinates, provider access, or rendering are unavailable. |

## 5) Reviewer Handoff (`Codex2`)

Reviewer should verify:

1. The packet matches current machine truth:
   - sidecar `owner=Codex`, `reviewer=Codex2`, `status=in_progress`
   - parent `owner=Codex2`, `reviewer=Codex`, `status=in_progress`
2. The packet does not pretend the parent's two declared canonical docs already exist on this branch.
3. The packet keeps the parent's five acceptance bullets intact and does not invent provider truth beyond tracked evidence.
4. The packet correctly distinguishes:
   - existing reusable feature-flag infrastructure
   - missing map/geofence-specific flag definitions
5. The packet preserves the historical Mapbox precedent as a classification input, not as a silently accepted provider decision.
6. The only repo content changed for this task is the support artifact under `support/sidecars/MAP-PROD-000/`.

## 6) Sidecar Acceptance Checklist

### AC-S1 - `Create support artifacts only`

- [x] Output is limited to `support/sidecars/MAP-PROD-000/MAP-PROD-000-SIDECAR-ACCEPTANCE.md`.
- [x] Content is limited to support framing, dependency mapping, evidence anchors, and reviewer guidance.

### AC-S2 - `Do not edit canonical truth`

- [x] No runtime, contract, or canonical doc file was modified.
- [x] Task-state updates are recorded through `scripts/ai-status.sh`, not by editing status files directly.

### AC-S3 - `Hand off the packet to the assigned reviewer`

- [ ] Satisfied by machine-truth handoff, not by this file alone.
- [ ] Reviewer should confirm `scripts/ai-status.sh show MAP-PROD-000-SIDECAR-ACCEPTANCE` reflects `reviewer=Codex2` and the latest handoff note accompanying this packet.

# MAP-PROD-000 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `MAP-PROD-000` - Map provider and rollout decision  
**Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer (snapshot):** `Codex2` / `Codex`  
**Generated:** `2026-06-30T15:26:20Z` (UTC)  
**Machine-Truth Snapshot Scope:** Owner/reviewer/status bullets in this packet are capture-time snapshots collected between `2026-06-30T15:24:34Z` and `2026-06-30T15:26:20Z`. Live task state may advance after this file is committed or handed off; re-run `scripts/ai-status.sh show ...` for current machine truth.

> **Refresh reason.** This packet supersedes an earlier draft that treated mutable task status as a live assertion. This refresh makes task-state claims explicitly historical and records the split between the parent review commit and this isolated sidecar branch snapshot.

## 1) Scope Boundary

This sidecar only prepares reviewer-facing acceptance framing, dependency mapping, and evidence pointers for `MAP-PROD-000`.

- In scope: support-only checklist expansion, dependency map, branch-split notes, existing rollout-infrastructure evidence, parent review-commit pointers, and reviewer handoff notes.
- Out of scope: editing canonical docs under `docs/`, changing runtime or contract code, deciding the provider on behalf of the parent owner, or inventing rollout truth not already present in machine state or tracked repo evidence.

## 2) Captured Snapshot And Branch Split

### 2.1 Sidecar machine-truth snapshot

At refresh time, `AI_NAME=Codex scripts/ai-status.sh show MAP-PROD-000-SIDECAR-ACCEPTANCE` returned:

- `status=in_progress`
- `owner=Codex`
- `reviewer=Codex2`
- `artifacts=["support/sidecars/MAP-PROD-000/MAP-PROD-000-SIDECAR-ACCEPTANCE.md"]`
- `next="Refreshing sidecar acceptance packet so mutable task-status claims align with current machine truth before re-handoff."`

Assessment:

- This snapshot was correct when captured.
- After the refreshed handoff, the live sidecar state is expected to move to `review` or later; that transition does not invalidate the packet.
- Reviewer should judge whether the packet scopes the snapshot correctly, not whether the captured `in_progress` value remains live forever.

### 2.2 Parent machine-truth snapshot

At refresh time, `AI_NAME=Codex scripts/ai-status.sh show MAP-PROD-000` returned:

- `status=review`
- `owner=Codex2`
- `reviewer=Codex`
- `artifacts`:
  - `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
  - `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
- `acceptance`:
  - `provider strategy recorded`
  - `mock provider required for CI`
  - `coordinate-less booking policy recorded`
  - `feature flags defined`
  - `no UI hard-codes provider before decision`
- `next` cites the canonical docs above, seeded flag work in `apps/api`, verification commands, and commit `0a2a845a2` on `origin/codex2/map-prod-000`

Assessment:

- Parent machine truth has already advanced beyond the older `in_progress` snapshot referenced by the failed review.
- This sidecar must not claim the parent is still pre-review.
- The authoritative parent review payload is now a specific commit on another branch, not this sidecar branch snapshot.

### 2.3 Parent review commit exists, but this sidecar branch does not contain it

Refresh evidence:

- `git show --name-only --format=fuller --stat 0a2a845a2 -- docs/03-runbooks/map-geofence-production-execution-packet-20260630.md docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md apps/api/tests/unit/feature-flags.service.test.ts apps/api/src/modules/feature-flags`
  - confirms commit `0a2a845a2a4573d1f1b47dbe31d03aeefa62f9d4`
  - shows the parent review payload added:
    - `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
    - `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
    - `apps/api/src/modules/feature-flags/feature-flags.service.ts`
    - `apps/api/tests/unit/feature-flags.service.test.ts`
- `git ls-files docs/03-runbooks/map-geofence-production-execution-packet-20260630.md docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
  - returns no match on this isolated sidecar branch snapshot

Assessment:

- The parent review evidence exists as a concrete commit and branch reference.
- This isolated sidecar worktree still lacks those canonical files in its tracked snapshot.
- Reviewer should treat this packet as a branch-split map, not as a substitute for inspecting the parent review commit directly.

### 2.4 Existing feature-flag infrastructure already exists in this branch

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
- The reusable branch-local baseline is still present even though the parent review commit carries the task-specific map/geofence definitions elsewhere.

### 2.5 Task-specific flag keys are absent in this sidecar branch snapshot

Refresh evidence:

- `git grep -n -E 'geoProviderEnabled|addressMapPickerEnabled|serviceAreaGateEnforced|opsRealMapEnabled|platformGeometryEditorEnabled|driverTripMapEnabled' -- apps packages support docs`
  - returns hits only in this sidecar packet

Assessment:

- This sidecar branch snapshot does not materialize the six task-specific keys outside support text.
- Parent machine truth says those flags were seeded in commit `0a2a845a2`; the absence here should therefore be interpreted as branch isolation, not necessarily parent incompleteness.

### 2.6 Provider scan baseline for this sidecar branch snapshot

Refresh evidence:

- `git grep -n -E 'mapbox|Google Maps|Leaflet|OpenStreetMap|react-native-maps|maps.googleapis|google-map-react' -- apps packages support docs`
  - returns support-artifact hits only:
    - `support/sidecars/MAP-PROD-000/MAP-PROD-000-SIDECAR-ACCEPTANCE.md`
    - `support/sidecars/OPX-DP-004/OPX-DP-004-SIDECAR-ACCEPTANCE.md`
- `support/sidecars/OPX-DP-004/OPX-DP-004-SIDECAR-ACCEPTANCE.md:43-49`
  - cites a `MapPicker` precedent using `mapbox-gl`
  - notes token governance through `localStorage`, not a hardcoded token

Assessment:

- No current app/package provider lock-in was found on this sidecar branch snapshot.
- A historical Mapbox precedent exists and should be explicitly classified by the parent owner rather than silently inherited as the decision.

## 3) Parent Acceptance Framing

This section expands the parent's exact acceptance bullets into reviewer-facing checks without adding new product semantics.

### AC-1 - `provider strategy recorded`

- [~] Parent machine truth says the canonical provider decision is already recorded and under review in commit `0a2a845a2`.
- [ ] This sidecar branch cannot independently verify the canonical docs because they are absent here (`§2.3`).
- Reviewer should inspect the two parent docs in commit `0a2a845a2` to confirm:
  - web map provider strategy
  - native map provider strategy
  - geocoding / reverse-geocoding strategy
  - whether the solution is unified or intentionally split by surface

### AC-2 - `mock provider required for CI`

- [~] Parent machine truth says the review payload includes canonical docs and a new unit test in commit `0a2a845a2`.
- [ ] This sidecar branch snapshot cannot prove the CI/mock-provider requirement is fully satisfied from local tracked files alone.
- Reviewer should inspect the parent review docs for explicit CI/mock-provider language and verify whether the added test coverage is sufficient evidence for the chosen approach.

### AC-3 - `coordinate-less booking policy recorded`

- [~] Parent machine truth says the rollout-policy docs are already in review in commit `0a2a845a2`.
- [ ] This sidecar branch snapshot cannot independently confirm the degraded booking policy because the canonical docs are absent here.
- Reviewer should verify the parent review docs make the fallback policy explicit for at least:
  - callcenter booking entry
  - tenant address capture / address-map pinning
  - ops dispatch review
  - service-area evaluation

### AC-4 - `feature flags defined`

- [~] Parent machine truth says the six task-specific keys were seeded in `apps/api` in commit `0a2a845a2`.
- [ ] This sidecar branch snapshot still lacks those keys outside this support file (`§2.5`).
- Reviewer should verify the parent review commit records, at minimum:
  - owner of each flag
  - default state
  - platform vs tenant scope
  - whether the flag gates UI only, backend only, or both

### AC-5 - `no UI hard-codes provider before decision`

- [~] This sidecar branch snapshot still shows no current tracked app/package provider lock-in (`§2.6`).
- [~] The parent decision is already under review on another branch (`§2.2`-`§2.3`).
- [ ] This packet does not replace direct inspection of commit `0a2a845a2`; reviewer should still confirm the new review payload does not introduce premature provider hard-coding.

## 4) Dependency Map

### 4.1 Formal machine dependencies

`MAP-PROD-000.depends_on=[]`

There are no formally recorded upstream blockers in machine truth.

### 4.2 Practical dependencies

| Dep ID | Anchor | Why It Matters |
| ------ | ------ | -------------- |
| D-P-1 | `AI_NAME=Codex scripts/ai-status.sh show MAP-PROD-000-SIDECAR-ACCEPTANCE` | Defines the latest sidecar owner/reviewer pairing, artifact path, and re-handoff requirement. |
| D-P-2 | `AI_NAME=Codex scripts/ai-status.sh show MAP-PROD-000` | Defines the latest parent acceptance bullets, review status, and cited review commit. |
| D-P-3 | `git show --name-only --format=fuller --stat 0a2a845a2 -- docs/03-runbooks/map-geofence-production-execution-packet-20260630.md docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md apps/api/tests/unit/feature-flags.service.test.ts apps/api/src/modules/feature-flags` | Confirms the parent review payload exists and names the exact files added on the parent branch. |
| D-P-4 | `git ls-files docs/03-runbooks/map-geofence-production-execution-packet-20260630.md docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md` | Confirms those parent review docs are absent from this isolated sidecar branch snapshot. |
| D-P-5 | `apps/api/src/common/auth/feature-gate.guard.ts:24-57` | Existing backend enforcement plane for named rollout flags. |
| D-P-6 | `apps/api/src/modules/feature-flags/feature-flags.controller.ts:20-87` | Existing admin API for platform defaults, tenant overrides, and enabled-state checks. |
| D-P-7 | `apps/platform-admin-web/app/feature-flags/page.tsx:416-518,563-589,680-800` | Existing operator-facing registry UI for rollout governance. |
| D-P-8 | `apps/api/tests/unit/feature-gate.guard.test.ts:103-158,160-203,206-260` | Existing test pattern for named feature-gated routes and tenant scoping. |
| D-P-9 | `git grep -n -E 'geoProviderEnabled|addressMapPickerEnabled|serviceAreaGateEnforced|opsRealMapEnabled|platformGeometryEditorEnabled|driverTripMapEnabled' -- apps packages support docs` | Confirms the six map/geofence-specific keys are absent from this sidecar branch snapshot outside support text. |
| D-P-10 | `git grep -n -E 'mapbox|Google Maps|Leaflet|OpenStreetMap|react-native-maps|maps.googleapis|google-map-react' -- apps packages support docs` | Confirms no current app/package provider lock-in on this sidecar branch snapshot and surfaces the historical support-artifact precedent. |
| D-P-11 | `support/sidecars/OPX-DP-004/OPX-DP-004-SIDECAR-ACCEPTANCE.md:43-49` | Historical Mapbox precedent that the parent owner should classify explicitly rather than inherit silently. |

### 4.3 Downstream consumer map

| Consumer / Gate | Current status | Why It Matters |
| --------------- | -------------- | -------------- |
| Parent owner `Codex2` | `review` | Owns the canonical provider decision and rollout-policy docs cited in commit `0a2a845a2`. |
| Parent reviewer `Codex` | `review` | Reviews the canonical parent packet on the parent branch, not in this sidecar worktree. |
| Sidecar reviewer `Codex2` | `pending after refreshed handoff` | Reviews whether this packet accurately maps the machine-truth snapshot and branch split without mutating canonical files. |
| `Gate A: Callcenter safe to dispatch` | `carried by parent review` | Needs coordinate-less booking and service-area posture from the parent review docs. |
| `Gate B: Governance safe to publish` | `carried by parent review` | Needs provider/key/quota/retention and rollout-governance posture from the parent review docs. |
| `Gate C: Ops safe to operate` | `carried by parent review` | Needs real-map vs degraded ops posture and geometry/service-area handling from the parent review docs. |
| `Gate D: Driver safe to navigate` | `carried by parent review` | Needs driver-facing map/navigation strategy and degraded behavior from the parent review docs. |
| `Gate E: Degraded safe` | `carried by parent review` | Needs explicit fallback behavior when coordinates, provider access, or rendering are unavailable. |

## 5) Reviewer Handoff (`Codex2`)

Reviewer should verify:

1. The packet labels owner/reviewer/status bullets as timestamped snapshots, not live assertions.
2. The packet reflects the latest captured machine truth:
   - sidecar snapshot `status=in_progress`, `owner=Codex`, `reviewer=Codex2`
   - parent snapshot `status=review`, `owner=Codex2`, `reviewer=Codex`
   - parent `next` cites commit `0a2a845a2` on `origin/codex2/map-prod-000`
3. The packet explains the branch split accurately:
   - the parent review payload exists in commit `0a2a845a2`
   - this isolated sidecar branch still lacks the parent canonical docs and the six task-specific flag keys
4. The packet keeps the parent's five acceptance bullets intact and does not invent provider truth beyond tracked evidence.
5. The packet correctly distinguishes:
   - reusable branch-local feature-flag infrastructure
   - task-specific map/geofence definitions now claimed by the parent review commit
6. The packet preserves the historical Mapbox precedent as a classification input, not as a silently accepted provider decision.
7. The only repo content changed for this task is the support artifact under `support/sidecars/MAP-PROD-000/`.

## 6) Sidecar Acceptance Checklist

### AC-S1 - `Create support artifacts only`

- [x] Output is limited to `support/sidecars/MAP-PROD-000/MAP-PROD-000-SIDECAR-ACCEPTANCE.md`.
- [x] Content is limited to support framing, dependency mapping, branch-split evidence, and reviewer guidance.

### AC-S2 - `Do not edit canonical truth`

- [x] No runtime, contract, or canonical doc file was modified in this sidecar branch.
- [x] Task-state updates are recorded through `scripts/ai-status.sh`, not by editing status files directly.

### AC-S3 - `Hand off the packet to the assigned reviewer`

- [ ] Satisfied only after `AI_NAME=Codex scripts/ai-status.sh handoff MAP-PROD-000-SIDECAR-ACCEPTANCE Codex2 "<refresh summary and verification>"`.
- [ ] Once handed off, the live sidecar state should move away from the snapshot's `in_progress` value to `review`; that transition is expected and should not be treated as packet drift.

# MAP-UI-001 Sidecar Acceptance Packet

- Sidecar Task: `MAP-UI-001-SIDECAR-ACCEPTANCE`
- Sidecar Owner / Reviewer: `Codex` / `Codex2`
- Parent Task: `MAP-UI-001` - Shared AddressMapPicker
- Parent Owner / Reviewer: `Claude2` / `Codex2`
- Helper Kind: `acceptance_packet`
- Snapshot Captured At: `2026-07-01T15:33:33Z`
- Snapshot Status At Capture: sidecar `in_progress`; parent `in_progress`
- Class: support-only; no canonical-truth mutation

## Purpose

This packet is a sidecar-only support artifact for `MAP-UI-001`. It does not
change runtime code, canonical truth, or the parent task status. It packages:

1. a reviewer-ready acceptance checklist for the parent `AddressMapPicker`
   primitive;
2. a dependency map covering the official upstream dependency plus the
   transitive contract and gateway blockers that still control acceptance
   timing; and
3. a current-state evidence snapshot that separates canonical planned anchors
   from what is actually inspectable in this worktree.

The last point matters here because the June 30 runbook and gap inventory claim
shared picker artifacts that are not yet inspectable in this branch snapshot.
This packet records that mismatch instead of flattening it into a false
"complete" story.

## Scope Boundary

- Allowed: support material under `support/sidecars/MAP-UI-001/`.
- Not allowed: edits to `packages/ui-web`, `packages/api-client`,
  `packages/contracts`, `apps/ops-console-web`, `docs/03-runbooks`,
  `docs/02-architecture`, `docs/05-ui`, or machine-truth control-plane files.
- This packet does not approve the parent task. Parent acceptance remains with
  parent reviewer `Codex2` after parent owner `Claude2` lands inspectable code
  and verification evidence.

## Machine-Truth Snapshot

- Sidecar task `MAP-UI-001-SIDECAR-ACCEPTANCE` is `in_progress` with next step:
  `Preparing acceptance packet, dependency map, and reviewer handoff artifact for MAP-UI-001 sidecar support.`
- Parent task `MAP-UI-001` is `in_progress`, owned by `Claude2`, reviewed by
  `Codex2`, and officially depends on `MAP-BE-003`.
- Parent recorded acceptance in machine truth:
  `picker emits contract payload`, `service-area preview supported`,
  `provider outage state visible`, `keyboard/manual fallback covered`,
  `ui-web checks pass`.
- `MAP-BE-003` remains `in_progress`. Its own machine-truth status explicitly
  says it is still blocked by `MAP-BE-001=review` and `MAP-BE-002=in_progress`.
- `MAP-QA-001` also remains `in_progress` and depends on both `MAP-BE-002` and
  `MAP-UI-001`, so mock-provider CI proof is not yet a settled downstream gate.

## Canonical Parent Acceptance Decomposition

Canonical sources:

- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:516-554`
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:308-317`
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:529-579`

Taken together, the parent `MAP-UI-001` acceptance decomposes into these
reviewable items:

1. A reusable web `AddressMapPicker` exists with search, candidate list, pinned
   marker, drag/adjust pin, confidence display, and service-area preview.
2. The shared picker supports degraded and exception states:
   provider unavailable, no match, manual coordinate entry, out of service, and
   manual review.
3. The picker emits `AddressPayload` compatible with the `MAP-BE-001`
   coordinate/provenance contract rather than inventing a UI-only shape.
4. Service-area evaluation can be triggered once the required point set exists.
5. Keyboard and screen-reader affordances exist for degraded/manual mode.
6. Verification for the shared package is recorded via
   `pnpm --filter @drts/ui-web typecheck`,
   `pnpm --filter @drts/ui-web test`, and
   `pnpm --filter @drts/ui-web lint`.
7. CI proof uses a mock provider only; live map/geocode provider evidence is
   not acceptable for this acceptance line.

Reviewer note: item 7 is both an acceptance condition and a dependency
condition, because `MAP-QA-001` is still in progress.

## Current Inspectable Evidence In This Worktree

### Inspectable contract and backend seams

- `packages/contracts/src/index.ts:131-144`
  defines `GeoCoordinateProvenance`, including coordinate source, provider,
  confidence, candidate/place ids, accuracy, actor/time fields, manual override
  reason, and surface.
- `packages/contracts/src/index.ts:295-307`
  defines `hasAddressCoordinateProvenance(...)`, which requires coordinates plus
  at least one provenance marker.
- `packages/contracts/src/index.ts:2542-2572`
  shows `AddressPayload` and `ResolvedAddressPayload` already carry the fields
  the parent picker is expected to emit.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6254-6317`
  shows backend spatial audit snapshots already consume coordinate provenance
  when present and synthesize a fallback provenance record from top-level fields
  when necessary.

### Inspectable mismatches and missing anchors

- `packages/ui-web/src/client.tsx:1-16`
  currently exports only management-shell and theme-context helpers in this
  worktree. No `AddressMapPicker` or `AddressMapPairPicker` export is
  inspectable here.
- `packages/api-client/src/index.ts`
  is the only repo-local file currently present under `packages/api-client/src`
  in this worktree, and `git grep` at packet capture time found no geo or
  service-area client symbols there.
- `apps/ops-console-web/app/callcenter/page.tsx:2640-2750`
  currently renders recording-queue, dispatch-trace, and session-history UI at
  the line range cited by the June 30 gap inventory for map picker evidence.
  That means the canonical document's specific callcenter anchor does not match
  this worktree snapshot.
- `apps/ops-console-web/app/callcenter/map-booking.ts`
  is not present in this worktree.
- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:551-554`
  says a design-canvas requirements note was added because the canvas does not
  yet define a final picker screen, but
  `find docs/05-ui -type f | grep address-map-picker`
  returned no matching file at packet capture time.

Inference from the canonical runbook plus the missing requirements note:
parent reviewers may be able to clear contract/state-machine behavior later,
but they should not claim final visual sign-off for the picker until a concrete
canvas-backed screen requirement or final canvas screen is actually present in
the branch under review.

## Dependency Map

### Upstream and gate dependencies

| Dependency | Status at capture | Why MAP-UI-001 needs it | Reviewer implication |
| --- | --- | --- | --- |
| `MAP-BE-003` | `in_progress` | Official parent dependency. Supplies typed geo/service-area API-client methods and endpoint documentation the shared picker should consume instead of ad hoc fetch code. | Do not approve the parent as complete while this dependency remains open in machine truth. |
| `MAP-BE-001` | `review` | Transitive contract dependency. Defines the `AddressPayload` / provenance shape the picker must emit. | Parent reviewer should compare any picker payload helpers against `packages/contracts/src/index.ts:131-144,295-307,2542-2572`. |
| `MAP-BE-002` | `in_progress` | Transitive geo gateway dependency. Owns provider-neutral search/resolve/reverse behavior plus deterministic mock behavior. | Parent verification must stay mock-provider-only while this remains open; machine truth also records unresolved gateway findings. |
| `MAP-QA-001` | `in_progress` | Downstream acceptance gate. Owns the deterministic mock-provider fixtures and E2E harness needed by the parent acceptance line. | Treat "CI uses a mock provider" as pending evidence until this task lands or equivalent proof is linked in parent review. |

### Downstream consumers waiting on MAP-UI-001

Canonical downstream map from
`docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:156-164,934-938`:

- `MAP-FE-CALL-001`
- `MAP-FE-TEN-001`
- `MAP-FE-CON-001`
- `MAP-FE-OPS-001`
- `MAP-QA-001`

The parent primitive therefore has fan-out beyond a single surface. Review
should prefer shared export and contract evidence over one-off callcenter-only
behavior, because a local patch that bypasses `@drts/ui-web` would still leave
the other consumer tasks blocked.

## Reviewer Focus

For sidecar reviewer `Codex2`, the useful checks are:

1. Confirm this packet stays within sidecar scope and only adds support
   material under `support/sidecars/MAP-UI-001/`.
2. Confirm the acceptance decomposition matches the canonical runbook and gap
   inventory rather than inventing new requirements.
3. Confirm the packet explicitly records the current evidence mismatch:
   canonical docs describe shared picker artifacts that are not inspectable in
   this worktree snapshot.
4. Confirm the packet does not over-claim parent readiness while
   `MAP-BE-003` and `MAP-QA-001` are still open in machine truth.
5. If the parent branch later gains the missing picker exports, requirements
   note, or mock-provider evidence, reopen or refresh this packet instead of
   silently treating this snapshot as evergreen.

## Sidecar Acceptance Checklist

- [x] Create support artifacts only.
- [x] Do not edit canonical truth.
- [x] Keep the packet MAP-UI-001-specific instead of drifting into generic map
      program commentary.
- [x] Record both dependency state and reviewer-relevant evidence anchors.
- [ ] Hand off the packet to the assigned reviewer (`Codex2`).

## Reviewer Handoff

Owner handoff command:
`AI_NAME=Codex scripts/ai-status.sh handoff MAP-UI-001-SIDECAR-ACCEPTANCE Codex2 "Prepared MAP-UI-001 acceptance packet with parent acceptance decomposition, dependency map, and current worktree evidence snapshot. Packet records that MAP-BE-003 and MAP-QA-001 remain open and that the June 30 runbook's shared picker anchors are not yet inspectable in this branch snapshot. Verified git diff --check for support/sidecars/MAP-UI-001/MAP-UI-001-SIDECAR-ACCEPTANCE.md; no canonical truth files changed."`

Reviewer approval command:
`AI_NAME=Codex2 scripts/ai-status.sh approve MAP-UI-001-SIDECAR-ACCEPTANCE "Reviewed: packet stays sidecar-only, decomposes MAP-UI-001 acceptance correctly, and accurately records dependency/evidence gaps without over-claiming parent completion."`

## Local Verification For This Sidecar Slice

- Confirm only `support/sidecars/MAP-UI-001/MAP-UI-001-SIDECAR-ACCEPTANCE.md`
  changed for this task.
- Run
  `git diff --check -- support/sidecars/MAP-UI-001/MAP-UI-001-SIDECAR-ACCEPTANCE.md`.
- Re-run machine-truth snapshots with:
  `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-001-SIDECAR-ACCEPTANCE`,
  `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-001`,
  `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-003`,
  `AI_NAME=Codex scripts/ai-status.sh show MAP-QA-001`.
- Re-run the evidence-gap probes:
  `git grep -n "AddressMapPicker\\|AddressMapPairPicker" packages/ui-web apps/ops-console-web docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
  and
  `find docs/05-ui -type f | grep address-map-picker`.

# MAP-FE-TEN-001 SIDECAR ACCEPTANCE

Snapshot Type: machine-truth + repo-visible acceptance packet
Snapshot Captured At: 2026-07-01T14:59:45Z
Snapshot Status At Capture: in_progress
Owner: Codex
Reviewer: Codex2
Parent Task: MAP-FE-TEN-001
Parent Title: Tenant address and booking map alignment

## Purpose

This packet is a support-only artifact for `MAP-FE-TEN-001`. It does not change
canonical truth or runtime code. It gives the reviewer a tenant-specific
acceptance checklist, a dependency map, and evidence anchors so the parent task
can be reviewed without re-deriving the map/geofence rollout context.

This packet also records an important visibility fact: at snapshot time,
`codex2/map-fe-ten-001` resolves to the same commit as `origin/dev`
(`f452f019f`). The parent task status describes map-pin and Playwright evidence
that is not visible on that branch tip yet, so the reviewer must distinguish
between machine-truth claims and repo-visible baseline.

## Scope Boundary

- Allowed: support material for the tenant portal address book and tenant
  console booking form acceptance review.
- Not allowed: edits to `apps/tenant-portal-web`, `apps/tenant-console-web`,
  `packages/ui-web`, `tests/e2e`, contracts, machine truth, or runtime
  behavior.

## Machine-Truth Snapshot

- Sidecar task `MAP-FE-TEN-001-SIDECAR-ACCEPTANCE` is `in_progress` with
  artifact target
  `support/sidecars/MAP-FE-TEN-001/MAP-FE-TEN-001-SIDECAR-ACCEPTANCE.md`.
- Parent task `MAP-FE-TEN-001` is `in_progress` and depends on
  `MAP-UI-001`, `MAP-BE-004`, and `MAP-BE-005`.
- `MAP-BE-004` is `done`; backend service-area booking enforcement is the
  closed dependency this tenant UI slice must rely on.
- `MAP-UI-001` is still `in_progress`; the shared picker is not yet recorded as
  done in machine truth.
- `MAP-BE-005` is still `in_progress`; final persisted spatial-audit evidence
  is not closed yet in machine truth.
- Parent task `next` says rereview should happen after visible coordinate inputs
  are replaced by pin-confirmation flows and tenant Playwright evidence is
  attached. On the repo-visible snapshot branch, those claimed evidence files
  are not present yet, so the reviewer should require them in the owner
  handoff.

## Packet Checklist

- [x] Sidecar output is limited to `support/sidecars/MAP-FE-TEN-001/`.
- [x] Parent acceptance is restated using the tenant-specific map/geofence plan.
- [x] Dependencies are mapped to the actual shared-picker and backend-gate
  surfaces.
- [x] Repo-visible baseline vs machine-truth claims are called out explicitly.
- [x] Reviewer instructions stay within support-only scope.

## Dependency Map

### Planning and acceptance authority

- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:625-649`
  defines `MAP-FE-TEN-001` as tenant address and booking map alignment, with
  acceptance around coordinate presence, consistent payloads, and backend gate
  non-bypass.
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:308-317`
  defines the shared `AddressMapPicker` dependency: emit `AddressPayload`, call
  service-area evaluate, and expose outage/manual fallback states.

### Direct parent dependencies

- `MAP-UI-001` (`in_progress`)
  Owns the shared picker contract and degraded/manual mode required by the
  tenant surfaces. On current `HEAD`, `packages/ui-web/src/index.tsx:1-173`
  exports canvas, management, and partner-booking primitives but no shared
  address-map picker export, so the reviewer should expect parent handoff
  evidence to point at newly added or newly consumed picker APIs.
- `MAP-BE-004` (`done`)
  Owns backend service-area enforcement. The tenant UI acceptance bar explicitly
  depends on this because the frontend must not become a second authority for
  serviceability decisions.
- `MAP-BE-005` (`in_progress`)
  Owns persisted spatial-audit snapshots. Parent acceptance is not fully closed
  until tenant-created bookings can be tied to that backend evidence.

### Current repo-visible tenant baseline

- `apps/tenant-portal-web/app/addresses/page.tsx:65-159`
  The address create/edit flow still exposes visible `Latitude` and `Longitude`
  fields in the normal form path on snapshot `HEAD`.
- `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx:1513-1687`
  The tenant booking form still exposes visible pickup/dropoff address text
  fields plus four raw coordinate inputs in the main pickup/dropoff card.
- `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form-utils.ts:318-370`
  Validation and command building still serialize pickup/dropoff `lat` and
  `lng` directly from form draft strings.
- `tests/e2e/map-geofence-harness.ts:1-16`
  The repo has a mock map-tile harness, so a tenant-specific Playwright spec can
  use the shared map test infrastructure once the parent branch supplies it.

### Owner-claimed evidence not visible on snapshot branch

At snapshot time, the tree rooted at `f452f019f` does not contain the following
parent-task evidence paths referenced by machine truth:

- `support/sidecars/MAP-FE-TEN-001/MAP-FE-TEN-001-REVIEW-EVIDENCE-20260701.md`
- `tests/e2e/tenant-map-booking-ui.spec.ts`
- `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-tenant-ui-20260701T1050Z.json`
- `support/sidecars/MAP-QA-002/artifacts/vitest-owned-mobility-provider-unavailable-20260701T0924Z.json`
- `support/sidecars/MAP-QA-002/artifacts/vitest-owned-mobility-entry-provider-unavailable-20260701T0941Z.json`

That absence does not invalidate the parent task, but it means the reviewer
must review the owner's handoff branch/evidence directly rather than assuming
`origin/dev` already contains the claimed tenant-map implementation.

## Parent Acceptance Checklist

The parent reviewer should confirm the following against the owner handoff tree,
not against snapshot `HEAD` alone:

- [ ] Tenant Portal address create/edit no longer requires raw lat/lng entry in
  the normal path; missing coordinates are surfaced as explicit warning or
  advanced fallback only.
- [ ] Tenant Console booking create replaces visible pickup/dropoff coordinate
  entry with pin confirmation for both saved-address and manual-address flows.
- [ ] The booking submit payload remains consistent: saved-address flows retain
  address ids, while dispatchable bookings still send authoritative coordinates
  and provenance to the backend gate.
- [ ] Tenant-safe serviceability copy exists for provider outage,
  not-serviceable, and manual-review states.
- [ ] Parent verification includes
  `pnpm --filter @drts/tenant-portal-web typecheck`,
  `pnpm --filter @drts/tenant-console-web typecheck`, and relevant touched test
  or lint commands.
- [ ] Parent handoff includes the tenant Playwright or equivalent evidence named
  in machine truth, plus any required MAP-BE-005 spatial-audit evidence.

## What The Reviewer Should Confirm About This Packet

- The packet reflects the tenant-specific plan at
  `map-geofence-production-execution-packet-20260630.md:625-649`.
- The dependency map keeps shared-picker ownership with `MAP-UI-001`, backend
  gate ownership with `MAP-BE-004`, and spatial-audit ownership with
  `MAP-BE-005`.
- The packet does not over-claim repo-visible completion: it explicitly records
  that the current branch tip still shows manual lat/lng tenant forms and lacks
  the owner-claimed review artifacts.
- The sidecar remains support-only and does not modify canonical or runtime
  files.

## Evidence Index

- Machine truth commands used for this packet:
  - `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-TEN-001-SIDECAR-ACCEPTANCE`
  - `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-TEN-001`
  - `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-004`
  - `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-001`
  - `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-005`
- Branch visibility commands used for this packet:
  - `git rev-parse --short HEAD`
  - `git rev-parse --short codex2/map-fe-ten-001`
  - `git ls-tree -r --name-only HEAD | grep 'tenant-map-booking-ui.spec.ts\|MAP-FE-TEN-001-REVIEW-EVIDENCE-20260701.md\|playwright-map-geofence-tenant-ui-20260701T1050Z.json'`
- Code and plan anchors:
  - `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:625-649`
  - `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:308-317`
  - `packages/ui-web/src/index.tsx:1-173`
  - `apps/tenant-portal-web/app/addresses/page.tsx:65-159`
  - `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx:1513-1687`
  - `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form-utils.ts:318-370`
  - `tests/e2e/map-geofence-harness.ts:1-16`

## Reviewer Handoff

Owner handoff command:
`AI_NAME=Codex scripts/ai-status.sh handoff MAP-FE-TEN-001-SIDECAR-ACCEPTANCE Codex2 "Prepared tenant acceptance packet in support/sidecars/MAP-FE-TEN-001/MAP-FE-TEN-001-SIDECAR-ACCEPTANCE.md. Packet captures MAP-FE-TEN-001 acceptance checklist, dependency map, and the current divergence between machine-truth parent claims and repo-visible HEAD/codex2-map-fe-ten-001 snapshot f452f019f. Verified sidecar diff only and git diff --check for the artifact."`

Reviewer approval command:
`AI_NAME=Codex2 scripts/ai-status.sh approve MAP-FE-TEN-001-SIDECAR-ACCEPTANCE "Reviewed: packet stays support-only, maps MAP-FE-TEN-001 dependencies correctly, and clearly distinguishes repo-visible tenant baseline from owner-claimed handoff evidence."`

## Local Verification For This Sidecar Slice

- Confirm only
  `support/sidecars/MAP-FE-TEN-001/MAP-FE-TEN-001-SIDECAR-ACCEPTANCE.md`
  changed for this task.
- Run
  `git diff --check -- support/sidecars/MAP-FE-TEN-001/MAP-FE-TEN-001-SIDECAR-ACCEPTANCE.md`.
- Spot-check the machine-truth commands and file anchors listed above.

# MAP-UI-001-SIDECAR-REVIEW: Review Packet and Evidence Summary

## Scope

This sidecar packet refreshes reviewer-facing evidence for `MAP-UI-001` as of
`2026-07-01`. It creates support material only and does not modify canonical
runtime or product truth.

## Snapshot Provenance

- Worktree reviewed: `codex/map-ui-001-sidecar-review` at `e458f3865`
- Sidecar machine truth: `MAP-UI-001-SIDECAR-REVIEW` owner `Codex`, reviewer
  `Claude2`, status `in_progress`
- Parent machine truth: `MAP-UI-001` owner `Claude2`, reviewer `Codex`, status
  `in_progress`
- This file supersedes an older packet revision that still claimed sidecar
  reviewer `Codex2`, sidecar status `review_approved`, and parent status
  `review`. Those values are stale against current machine truth on
  `2026-07-01`.

## Machine-Truth / Repo Drift

- `MAP-UI-001` machine truth currently points to:
  - `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md`
  - `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md`
- Neither path exists in this worktree.
- The nearest tracked planning/spec packet visible here remains:
  - `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
  - `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`

Implication: reviewer comments should distinguish between live machine-truth
metadata and repo-visible documents. The `20260701` references may exist on a
different branch or may need metadata repair.

## Canonical Expectations Still Visible In Tracked Docs

From `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:36-41`:

- `MAP-UI-001` is described as having added provider-neutral
  `AddressMapPicker` / `AddressMapPairPicker` primitives in
  `@drts/ui-web/client`.
- The same section says helper functions, component tests, and a design-canvas
  requirements note were added.
- The same note says the current canvas still only shows text pickup/dropoff
  fields.

From `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:522-554`:

- `MAP-UI-001` acceptance still expects a reusable picker with provider
  search, pinned marker, manual fallback, service-area preview, and
  lat/lng/provenance payload emission.
- Verification still points at:
  - `pnpm --filter @drts/ui-web typecheck`
  - `pnpm --filter @drts/ui-web test`
  - `pnpm --filter @drts/ui-web lint`
- The implementation-status note dated `2026-06-30` claims the picker
  primitives, helper tests, and
  `docs/05-ui/drts-design-canvas/address-map-picker-screen-requirements-20260630.md`
  already exist.

## Repo-Visible Evidence In This Worktree

1. `packages/ui-web/src/client.tsx:3-16` exports only `ManagementShell` and
   management-theme helpers. No `AddressMapPicker` or `AddressMapPairPicker`
   export is present.
2. `packages/ui-web/tests/` currently contains only
   `packages/ui-web/tests/unit/management-shell.test.ts`.
3. `git grep -n "AddressMapPicker|AddressMapPairPicker" -- packages/ui-web apps docs/05-ui`
   returns no matches in the current worktree.
4. `docs/05-ui/drts-design-canvas/ops-screens-1.jsx:440-446` still renders
   plain `pickup` and `drop` text inputs plus adjacent form fields. That matches
   the documented caveat that the canvas does not yet define a final map-picker
   screen.
5. No tracked file matching
   `docs/05-ui/drts-design-canvas/address-map-picker*` exists in this worktree,
   despite the `2026-06-30` runbook claim that such a requirements note was
   added.
6. Local ref discovery does not reveal an obvious current-owner implementation
   branch for review:
   - no visible non-sidecar `claude2/*map-ui-001*` branch is present locally
   - the only visible non-sidecar `map-ui-001` branch is `codex/map-ui-001`
   - `git grep -n "AddressMapPicker|AddressMapPairPicker" codex/map-ui-001 -- packages/ui-web apps docs/05-ui support/sidecars/MAP-UI-001`
     also returns no matches

## Reviewer Implications

- The parent `MAP-UI-001` is currently `in_progress`, not `review`. This packet
  should be treated as a pre-review evidence baseline and drift report, not as
  proof that the implementation is ready for approval.
- The strongest current mismatch is:
  - tracked docs say picker primitives/tests/design note exist
  - repo-visible `ui-web` and design-canvas files in this worktree do not show
    them
- Before a real parent-task review can proceed, the reviewer should require:
  1. the exact owner branch or commit containing the claimed picker primitives
     and helper tests
  2. verification output from the same snapshot for `typecheck`, `test`, and
     `lint`
  3. the promised design-canvas requirements note, or an explicit "canvas lacks
     screen, stop here" artifact that matches the UI design contract
- If the owner cannot produce a reviewable snapshot, either the parent task
  should remain/revert to a non-review state or the narrative docs/machine
  truth should be corrected so reviewers are not asked to validate invisible
  work.

## Reviewer Entry Points

- Machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-001-SIDECAR-REVIEW`
  - `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-001`
- Tracked narrative/spec docs:
  - `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
  - `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- Repo-visible surface checks:
  - `packages/ui-web/src/client.tsx`
  - `packages/ui-web/tests/`
  - `docs/05-ui/drts-design-canvas/ops-screens-1.jsx`
- Drift checks:
  - confirm the missing `20260701` refs above
  - confirm no `address-map-picker*` design note exists in this worktree

## Sidecar Verification

- Recorded owner progress with `AI_NAME=Codex scripts/ai-status.sh start`.
- Rechecked current sidecar and parent task slices with `scripts/ai-status.sh show`.
- Re-read the tracked docs and repo-visible file surfaces cited above.
- Edited only this support artifact.
- No automated tests were run because this sidecar slice changes reviewer
  material only.

## Handoff

Prepared for sidecar reviewer `Claude2`.

Recommended disposition:

1. Approve this sidecar packet only if it accurately captures the current
   machine-truth/doc/worktree mismatch.
2. Do not treat the parent `MAP-UI-001` as implementation-reviewable from this
   worktree alone.
3. Require the parent owner to provide the exact implementation snapshot and
   verification evidence before any parent-task approval attempt.

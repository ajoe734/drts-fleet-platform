# MAP-UI-001-SIDECAR-REVIEW: Review Packet and Evidence Summary

## Scope

This sidecar packet supports `MAP-UI-001` without editing canonical truth. It
is limited to reviewer-facing evidence, review entry points, and risk notes for
the current `MAP-UI-001` implementation handoff.

## Machine-Truth Snapshot

- Sidecar task: `MAP-UI-001-SIDECAR-REVIEW`
- Sidecar owner/reviewer: `Codex` -> `Codex2`
- Parent task: `MAP-UI-001`
- Parent owner/reviewer: `Codex` -> `Claude2`
- Parent task status at capture time: `review`
- Parent task last update: `2026-06-30T16:01:21Z`

Parent task summary from machine truth:

> Implemented provider-neutral `AddressMapPicker`/`AddressMapPairPicker`
> primitives and contract helpers in `@drts/ui-web/client`. Review payload
> provenance helpers, manual fallback, provider outage visibility, service-area
> preview readiness, test coverage, and the design-canvas requirements note
> clarifying that final surface visual sign-off still needs canvas
> update/approval.

## Canonical Review Expectations

From
`docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`:

- Goal: prevent each web surface from inventing different map/address
  semantics.
- Acceptance:
  - Picker can produce pickup and dropoff payloads with lat/lng/provenance.
  - Picker can call service-area evaluation after required points exist.
  - CI uses a mock provider, not a live provider.
- Verification command baseline:
  - `pnpm --filter @drts/ui-web typecheck`
  - `pnpm --filter @drts/ui-web test`
  - `pnpm --filter @drts/ui-web lint`

From
`docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`:

- The repo-level narrative says `MAP-UI-001` added shared provider-neutral
  picker primitives, payload helpers, manual coordinate fallback helpers,
  service-area preview command construction, and mock-provider-friendly tests.
- The same document says a design-canvas requirements note was added because
  the current design canvas still only shows text pickup/dropoff fields.

## Evidence Inventory

Evidence captured from the current sidecar worktree:

1. Machine-truth state confirms `MAP-UI-001` is in `review` and claims the
   implementation/verification summary above.
2. The task execution packet contains the expected acceptance and command
   baseline for reviewer validation.
3. The current tracked `packages/ui-web` tree does not expose visible
   `AddressMapPicker` or `AddressMapPairPicker` symbols in this worktree.
4. `packages/ui-web/src/client.tsx` currently exports only the management shell
   and theme helpers, not a visible address-map picker surface.
5. `packages/ui-web/tests` currently contains `tests/unit/management-shell.test.ts`
   only; no visible address-map picker test file is present in this worktree.
6. No tracked
   `docs/05-ui/drts-design-canvas/address-map-picker-screen-requirements-20260630.md`
   file is present in this worktree.

## Reviewer Entry Points

Use these as the first-pass review anchors:

- Machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-001`
- Expected acceptance contract:
  - `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- Repo-level implementation narrative:
  - `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
- Current shared UI export surface:
  - `packages/ui-web/src/client.tsx`
- Current shared UI test inventory:
  - `packages/ui-web/tests/`

## Review Risk Note

The current sidecar worktree shows a material gap between the repo-level
implementation narrative and the visible tracked artifacts:

- The docs and task status describe shared `AddressMapPicker` /
  `AddressMapPairPicker` primitives, helper functions, tests, and a design
  requirements note.
- The current baseline visible from this worktree does not show those symbols,
  those tests, or that design note as tracked files.

That means this packet cannot prove the parent task solely from the current
baseline. The reviewer should confirm one of these before approval:

1. The owner has an unmerged branch or commit containing the claimed picker
   primitives/tests/design note.
2. The implementation landed under different file/symbol names and should be
   mapped explicitly during review.
3. The parent task status/docs overstate what is currently reviewable and
   should be reopened if the missing artifacts cannot be produced.

## Suggested Reviewer Checklist

1. Verify the owner's actual commit or branch for the claimed `@drts/ui-web`
   picker primitives.
2. Confirm contract payload provenance, manual fallback, provider outage state,
   and service-area preview command logic against the owner diff, not just repo
   narrative docs.
3. Confirm the claimed `ui-web` verification commands were run against the same
   implementation snapshot being reviewed.
4. Confirm the design-canvas requirement note exists on the reviewed snapshot,
   or reopen if the visual-sign-off caveat is undocumented.

## Sidecar Verification

Checks performed for this sidecar task:

- Confirmed the sidecar task started from `backlog` and was moved to
  `in_progress` via `scripts/ai-status.sh`.
- Confirmed this sidecar creates support material only and does not edit
  canonical runtime/product truth files.
- Confirmed the packet is limited to
  `support/sidecars/MAP-UI-001/MAP-UI-001-SIDECAR-REVIEW.md`.

## Handoff

Prepared for sidecar reviewer `Codex2`.

Recommended disposition for the parent `MAP-UI-001` review: require the owner
to provide the exact reviewable branch/commit or reopen if the claimed picker
artifacts are not actually present on the reviewed snapshot.

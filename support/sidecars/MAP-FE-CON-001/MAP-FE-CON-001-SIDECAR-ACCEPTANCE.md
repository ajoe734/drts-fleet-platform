# MAP-FE-CON-001 Sidecar Acceptance Packet

- Task: `MAP-FE-CON-001-SIDECAR-ACCEPTANCE`
- Parent Task: `MAP-FE-CON-001` (Concierge and partner map alignment)
- Helper Kind: `acceptance_packet`
- Owner: `Claude`
- Reviewer: `Codex2`
- Phase: `map-geofence-production-20260630`
- Parent Owner -> Reviewer: `Codex2` -> `Codex`
- Scope Guardrail: support artifact only; no L1/L2 canonical truth, runtime, registry contract, or governance edits
- Machine-Truth Status When Authored: parent `in_progress` (last review failed 2026-07-01T14:52Z), sidecar `in_progress`

## Purpose

Parallel support for `MAP-FE-CON-001`. This packet consolidates the parent's
acceptance criteria, a dependency readiness map, and the currently-verified
implementation gaps into one reviewer-facing checklist. It is a support-only
cross-check; the parent owner decides what to absorb into the mainline
implementation and review flow. It does not alter machine truth or code.

## Acceptance Mapping (this sidecar)

| Brief Acceptance                             | Packet Coverage                                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Create support artifacts only                | This file is the only task artifact; limited to acceptance/dependency/support material.                           |
| Do not edit canonical truth                  | No product spec (L1), execution rules (L2), runtime, registry, or governance file is modified by this packet.      |
| Hand off the packet to the assigned reviewer | Owner hands off to reviewer `Codex2` via `scripts/ai-status.sh handoff`; approval recorded in `ai-status.json`.    |

## Parent Acceptance Checklist

Source of truth for the parent's acceptance is the execution packet detailed
brief `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
(section `MAP-FE-CON-001 - Concierge And Partner Entry Map Alignment`) and the
`ai-status.json` acceptance list for `MAP-FE-CON-001`.

### A1. Concierge booking submits coordinates when dispatchable

- [ ] Concierge booking integrates the shared `AddressMapPicker` (from `MAP-UI-001`) for pickup and dropoff.
- [ ] A dispatchable booking sends structured coordinates (lat/lng + provenance), not address text only.
- [ ] When coordinates are present, the booking creation call reaches the backend service-area evaluation path landed in `MAP-BE-004`.
- [ ] Text-only legacy entry remains possible but is explicitly routed to manual review per policy (no silent normal dispatch).

Current gap (verified live on this branch): `apps/concierge-portal-web/app/bookings/new/page.tsx` submits `pickup: { address }` / `dropoff: { address }` with no coordinate fields (createCallCenterOrder call near lines 348-356). Picker not yet wired.

### A2. Partner/assisted entry shows consistent serviceability reason codes

- [ ] Partner booking and related assisted-entry surfaces are audited for text-only address paths.
- [ ] Serviceability preview and backend gate error rendering are wired so block/manual-review reasons surface consistently.
- [ ] Reason presentation is consistent across concierge and partner surfaces (same vocabulary, same states).
- [ ] End-user copy does not expose internal policy jargon or raw backend codes (see Guardrail below).

Current gap (verified live): `apps/partner-booking-web/components/partner-booking-form.tsx` renders text-only pickup/dropoff fields (near lines 513-522) with a local success banner and no serviceability/gate-error rendering; `apps/partner-booking-web/lib/partner-booking-form.ts` has no backend gate/outage handling.

### A3. Provider outage creates manual-review/degraded state, not silent normal order

- [ ] Provider/geocoding outage is surfaced as a degraded state on both surfaces.
- [ ] An outage cannot produce a silently-created normal order; the booking is held for manual review or explicitly degraded.
- [ ] Degraded/manual-review copy is user-safe and actionable.

### A4. Package checks pass

- [ ] `pnpm --filter @drts/concierge-portal-web typecheck`
- [ ] `pnpm --filter @drts/partner-booking-web typecheck`
- [ ] Relevant test/lint commands for touched packages (e.g. the concierge/partner map booking e2e specs listed in the parent artifacts).

## Dependency Map

### Upstream (parent `depends_on`)

- `MAP-BE-004` - Booking creation service-area enforcement -- **READY (done, merged)**.
  - Machine truth: `status=done`, `commit_hash=deb5e1d366f1789c29bd26818b14ffcb801a43a3`, pushed `origin/dev`.
  - Provides the backend gate the concierge/partner surfaces must reach: `resolveServiceAreaBlockCode` and stable result/reason codes in `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`.
  - Frontend impact: A1/A2/A3 depend on this evaluate-on-create path. It is available now.
- `MAP-UI-001` - Shared `AddressMapPicker` web component -- **NOT READY (in_progress)**.
  - Owner `Claude2`, reviewer `Codex2`. No component file present on this branch yet (`AddressMapPicker` not found in tree).
  - Frontend impact: A1 (coordinate emit) and A2 (serviceability preview + outage state) are blocked on this shared component's contract payload.
- `MAP-BE-005` - Persist service-area snapshot and spatial audit -- **NOT READY (in_progress)**.
  - Owner `Claude2`, reviewer `Codex2`.
  - Frontend impact: not on the critical path for FE submit wiring, but coordinate provenance/audit expectations (A1 provenance) should match this task's persistence model to avoid contract drift.

### Stable backend anchors available now (from `MAP-BE-004`)

Reason/result codes the FE should render via user-safe copy, never raw:

- `PICKUP_NOT_ALLOWED`
- `SERVICE_AREA_NOT_SERVICEABLE`
- `SERVICE_AREA_NOT_FOUND`
- `PROVIDER_UNAVAILABLE` (provider outage / degraded path)

### Downstream consumers / cross-checks

- `MAP-QA-002` - cross-surface E2E suite (depends on all L3 including this task). The concierge/partner map booking specs listed in the parent artifacts feed this.
- `MAP-FE-OPS-001`, `MAP-MOB-DRV-001` - sibling L3 surfaces sharing the same coordinate/serviceability vocabulary; keep reason-code presentation aligned.

## Guardrail: outward copy vs internal policy

The parent brief requires that partner/concierge copy does not expose internal
policy jargon. Backend codes such as `PICKUP_NOT_ALLOWED`,
`SERVICE_AREA_NOT_SERVICEABLE`, and `PROVIDER_UNAVAILABLE` are stable machine
contracts, not user strings. The FE must map them to user-safe, localized
messages. This packet flags the mapping requirement; it does not define the copy.

## Readiness Summary For Parent Owner

- Backend gate (`MAP-BE-004`) is merged and available -- A1/A2/A3 backend path is unblocked.
- Shared picker (`MAP-UI-001`) is still `in_progress` -- A1 coordinate emit and A2 serviceability preview remain blocked on it. Coordinate-first FE work should either land behind the picker contract or track `MAP-UI-001` closely.
- `MAP-BE-005` is `in_progress` -- align coordinate provenance/audit fields with it before finalizing A1 provenance to avoid rework.
- The last parent review (2026-07-01T14:52Z) failed because the worktree was still at `origin/dev` with no task diff and the required evidence/spec paths were absent; concierge/partner surfaces remain text-only. This packet's checklist mirrors those exact gaps so re-review can be driven line by line.

## Verification Notes

- Acceptance source-verified against `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` (`MAP-FE-CON-001` brief) and the `ai-status.json` task slice.
- Dependency states read from `ai-status.json` task slices for `MAP-UI-001`, `MAP-BE-004`, `MAP-BE-005` at authoring time.
- Current-gap statements verified live against `apps/concierge-portal-web/app/bookings/new/page.tsx`, `apps/partner-booking-web/components/partner-booking-form.tsx`, and `apps/partner-booking-web/lib/partner-booking-form.ts` on branch `claude/map-fe-con-001-sidecar-acceptance`.
- Backend stable codes verified in `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` (`resolveServiceAreaBlockCode`).
- No runtime validation or typecheck was run for this sidecar because the scope is support material only; the A4 commands above are the parent owner's to execute.

## Closeout Guidance For Parent Owner

- Treat this file as a support-only acceptance checklist and dependency reference, not canonical truth.
- Absorb the relevant checklist items into the parent implementation/review flow.
- If parent scope, the picker contract, or the backend reason vocabulary changes, regenerate this packet instead of treating it as authoritative.

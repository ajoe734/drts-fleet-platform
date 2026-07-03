# AddressMapPicker — Screen Requirements

**Date:** 2026-06-30
**Feature:** shared `AddressMapPicker` / `AddressMapPairPicker` primitive
**Status:** functional requirements only; no final canvas artboard yet
**Author lane:** Codex
**Authority for behaviour/data/API:** `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md` · `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` · `packages/contracts/src/index.ts`

> This note exists because the current design canvas does not yet define a
> dedicated map-picker screen for any web lane. Engineering may implement the
> shared state machine and token-safe primitive, but no downstream surface may
> claim final visual sign-off from this primitive alone.

## 1. Canvas gap confirmed

Current canvas artboards still show text entry fields rather than a finalized
map-picker layout:

- `docs/05-ui/drts-design-canvas/ops-screens-1.jsx`
  Call Center intake shows `pickup` / `drop` text inputs only.
- `docs/05-ui/drts-design-canvas/tenant-screens-1.jsx`
  tenant booking create shows `pickup` / `drop` inputs with address-book hints.
- `docs/05-ui/drts-design-canvas/ent-screens-1.jsx`
  enterprise booking create shows pin-icon address inputs only.

Implication:

- `MAP-UI-001` may land a shared primitive and accessibility-safe degraded
  states.
- `MAP-FE-*` consumer tasks must still align their final visual composition to
  an app-specific canvas response before claiming design parity.

## 2. Shared primitive scope

The shared primitive must cover behavior and reusable structure only:

1. Search field with deterministic candidate results.
2. Candidate list with address text, provider label, and confidence.
3. Preview surface with pinned location and adjustable marker.
4. Manual coordinate fallback with explicit warning and required reason.
5. Service-area preview summary for pickup-only or pickup+dropoff flows.
6. Exception states for provider unavailable, no match, manual review, and out
   of service.
7. Keyboard adjustment and screen-reader text for manual/degraded mode.

This primitive is intentionally provider-neutral and must not depend on live map
tiles or live geocode SDK rendering for CI.

## 3. Visual constraints

Until a dedicated artboard exists, the primitive must stay within these limits:

- Use `@drts/ui-tokens` / canvas theme ramps only; no raw hex palette.
- Reuse existing canvas form language: bordered fields, compact list rows,
  inline status banners, and low-ornament preview framing.
- Do not invent a branded map shell, decorative illustration, or app-specific
  chrome.
- Treat the preview surface as a neutral utility plane, not as a final
  production map visual.

## 4. Required states

The primitive must make these states visible:

- Empty
- Searching
- Candidates available
- Selected / pinned
- Manual coordinate entry
- Provider unavailable
- No match
- Manual review
- Out of service

Each state must preserve operator-readable next action. No silent fallthrough
from provider outage or missing coordinates into a normal dispatchable state.

## 5. Downstream adoption rule

Any consumer app integrating this primitive must provide:

- realm-appropriate copy and theme selection;
- surface-specific CTA placement inside its own canvas layout; and
- evidence for the serviceable / manual-review / blocked / provider-degraded
  flows that belong to that app.

If a downstream lane still lacks a canvas screen for the integrated picker, that
lane must stop at a screen-requirements artifact or get a new design response
before claiming final UI completion.

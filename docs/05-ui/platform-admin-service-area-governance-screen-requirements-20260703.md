# Platform Admin Service-Area Governance — Screen Requirements

**Date:** 2026-07-03  
**Feature:** platform-admin service-area boundaries / stop policies / geofence governance  
**Recipient team:** Visual design / UX  
**Status:** Hand-off input. **No visual decisions in this document.**  
**Author lane:** Codex2  
**Authority for behaviour/data/API:** `MAP-FE-ADM-001` · `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` · `docs/04-api/map-geofence-openapi-delta-20260630.md` · `packages/contracts/src/index.ts` · `apps/api/src/modules/service-area/service-area.controller.ts`

> This packet exists because `docs/05-ui/drts-design-canvas/Platform Admin.html` and `platform-screens-*.jsx` do **not** contain source screens for normal taxi `service-area governance`. The canvas only covers the separate Phase 2 sandbox operating-area/route surface in `platform-sandbox.jsx`. Engineering must not invent a new governance UI for taxi geofences, so this note defines the required behavior and scope for later canonical canvas publication.

---

## 1. Why this packet exists

- `MAP-FE-ADM-001` requires a Platform Admin surface that can manage:
  - service-area boundaries
  - stop policies such as no-pickup / no-dropoff / manual-review zones
  - draft / review / publish / retire lifecycle
  - effective dates and publish/retire reasons
  - geometry editing via the shared `GeometryEditor`
  - affected sample preview against backend evaluation
  - audit visibility for actor, version, effect, direction, and effective date
- The current Platform Admin canvas does **not** define a route or artboard for this surface.
- The current backend/service contract already supports the governance lifecycle; the blocker is missing canonical visual source, not missing authority semantics.
- The canvas **does** define `platform-sandbox.jsx` for Phase 2 sandbox operating areas and approved routes, but that is a different authority boundary and must not be reused as the canonical taxi-geofence screen.
- Dispatch rule for this task: if the canvas lacks the screen, stop visual implementation and write a screen-requirements note instead of inventing UI.

## 2. Scope and authority split

- **In scope here:** normal taxi service-area boundaries and stop policies under `/api/service-area/admin/*`.
- **Explicitly out of scope here:** Phase 2 sandbox ODD operating areas, approved routes, experiment jurisdictions, and sandbox suspend/resume.
- Shared primitives are allowed:
  - `@drts/ui-web` canvas primitives
  - shared `GeometryEditor`
  - shared service-area GeoJSON / evaluation contracts
- Authority lifecycle must remain separate:
  - taxi service areas use `draft | review | active | retired`
  - sandbox geometry uses its own records and lifecycle
- Geometry types on this taxi surface are limited to contract-backed `polygon` and `circle`. Route corridor authoring belongs to sandbox governance and must remain absent here.

## 3. Backend-authoritative actions and records

These actions already exist in accepted contract/API surfaces and should drive CTA posture once designed.

| Capability | Endpoint / contract | Notes |
| --- | --- | --- |
| Read definitions | `GET /api/service-area/definitions` | list service-area and stop-policy records plus freshness timestamp |
| Read GeoJSON overlay | `GET /api/service-area/admin/geojson` | combined overlay for boundaries + stop policies |
| Create service-area boundary | `POST /api/service-area/admin/service-areas` | draft starts here |
| Update service-area boundary | `POST /api/service-area/admin/service-areas/{id}/update` | draft/review only |
| Submit service-area boundary for review | `POST /api/service-area/admin/service-areas/{id}/submit-review` | draft -> review |
| Publish service-area boundary | `POST /api/service-area/admin/service-areas/{id}/publish` | review/draft -> active |
| Retire service-area boundary | `POST /api/service-area/admin/service-areas/{id}/retire` | active -> retired |
| Create stop policy | `POST /api/service-area/admin/stop-policies` | direction + effect + geometry |
| Update stop policy | `POST /api/service-area/admin/stop-policies/{id}/update` | draft/review only |
| Submit stop policy for review | `POST /api/service-area/admin/stop-policies/{id}/submit-review` | draft -> review |
| Publish stop policy | `POST /api/service-area/admin/stop-policies/{id}/publish` | review/draft -> active |
| Retire stop policy | `POST /api/service-area/admin/stop-policies/{id}/retire` | active -> retired |
| Evaluate affected sample | `POST /api/service-area/evaluate` | preview only; backend remains authority |

Binding behaviour constraints once the screen exists:

- `active` and `retired` records are not inline-editable; the UI must steer operators toward creating a new version instead of implying direct mutation.
- Publish is allowed from `draft` or `review`.
- Retire stamps `effectiveUntil` and changes lifecycle to `retired`.
- Records with the same code must not have overlapping active effective windows.
- Contract-backed validation includes invalid coordinates, self-intersecting polygons, and invalid `effectiveUntil <= effectiveFrom`.

## 4. Route to design

| Screen | Route | Purpose |
| --- | --- | --- |
| Service-area governance | `/service-area-governance` | manage service-area boundaries and stop policies without SQL |

The screen may later split into child routes if the visual team needs them, but current engineering only needs one canonical governance entry route.

## 5. Required page regions

The canonical screen needs these regions. The final layout is a design decision, not an engineering decision.

### 5.1 Header and route identity

- Title naming should distinguish this from sandbox governance.
- Subtitle should clarify scope such as service-area boundaries, stop policies, publish lifecycle, and backend-governed evaluation.
- High-risk publish/retire actions must visually follow the existing Platform Admin confirmation model: reason required + audit receipt.

### 5.2 Record-type switcher

- Operator must be able to switch between:
  - service-area boundaries
  - stop policies
- The switcher must make the semantic difference obvious:
  - boundary answers "is this area serviceable?"
  - stop policy answers "pickup/dropoff allowed, denied, or manual review?"

### 5.3 Map / geometry workspace

- Use shared `GeometryEditor` for:
  - polygon service areas
  - circle service areas
  - polygon/circle stop-policy zones
- The screen should show existing published overlays and the current draft/review target.
- The design must keep sandbox route-corridor editing visually distinct or absent on this taxi surface.

### 5.4 Record list / version stack

- For each record show at minimum:
  - name
  - status (`draft`, `review`, `active`, `retired`)
  - version / version ref
  - effective start
  - effective end or open-ended state
  - updated at
  - updated by
- Stop policies also need:
  - direction (`pickup`, `dropoff`, `both`)
  - effect (`allow`, `deny`, `manual_review`)

### 5.5 Review / publish panel

- Publish flow must make these fields explicit:
  - effective from
  - effective to
  - required publish reason
  - current active record that will be superseded or coexist
- Retire flow must show:
  - retire effective date
  - required retire reason
  - runtime impact on evaluator

### 5.6 Affected sample preview

- The page must support a backend-evaluated preview using sample pickup/dropoff coordinates.
- Minimum preview cases:
  - serviceable
  - not serviceable
  - no-pickup
  - no-dropoff
  - manual review
- Preview must clearly state that backend evaluation is authoritative and the page is only surfacing the result.
- Preview scope is operator-entered sample evaluation only. No batch affected-order preview should be implied without a separate backend capability.

### 5.7 Audit visibility

- Operators need audit-derived visibility for:
  - actor
  - request / audit id
  - version
  - direction
  - effect
  - effective date
  - publish or retire reason
- This may be a dedicated panel or integrated detail region, but it must be legible on the route.

## 6. Primary user flows that the design must support

### 6.1 Publish a no-pickup zone

1. Open service-area governance.
2. Switch to stop policies.
3. Create a draft zone with `direction=pickup` and `effect=deny`.
4. Draw geometry in the shared editor.
5. Submit for review.
6. Publish with effective date and reason.
7. Observe audit receipt and updated active overlay.

### 6.2 Validate backend impact before closeout

1. Open the affected sample preview.
2. Run a sample pickup inside the new zone.
3. Confirm backend result is blocked with the expected policy.
4. Run a control sample outside the zone.
5. Confirm evaluator still returns serviceable where appropriate.

### 6.3 Retire or replace an active policy safely

1. Open the active record.
2. Review current effective window and downstream impact.
3. Retire with explicit reason and cutoff date, or publish the replacement draft.
4. Confirm audit fields and active-history transition.

## 7. Empty, error, and degraded states

The final design must include at least:

- loading
- no configured boundaries/policies yet
- permission denied
- fetch failed
- geometry validation failure
- publish blocked by invalid lifecycle or effective window
- evaluate-preview failure
- degraded overlay/data freshness state

## 8. Open visual questions for design

- How should this route sit in Platform Admin IA relative to `fleet`, `pricing`, `audit`, and `sandbox`?
- What is the clearest visual split between normal taxi geofence governance and Phase 2 sandbox geometry governance without duplicating shell metaphors?
- Should the screen be map-first with detail side panels, or governance-list-first with embedded geometry drilldown?
- What is the best visual treatment for superseding active records when a new version publishes with future effective dates?
- How should preview results distinguish area-level serviceability from stop-policy denial/manual-review logic?

## 9. Out of scope

- No visual reuse that implies sandbox and taxi geofence authority are the same workflow.
- No product-semantic changes to the accepted service-area contracts.
- No direct SQL/operator-console fallback as a first-class UX.
- No driver or ops map design in this packet.

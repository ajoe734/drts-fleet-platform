# Map / Geofence Gap Inventory And Remediation Plan

Last updated: 2026-06-30
Task ref: `MAP-PROD-000`
Planning ref: `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`

## Scope

This document records the current repository gap inventory for map, geocode,
and geofence productionization, then fixes the missing provider decision with a
single implementation direction.

## Canonical inputs

- `phase1_service_contracts_v1.md` §8.2
- `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md`
- `docs/02-architecture/phase1-role-scenario-and-negative-flow-matrix-20260430.md`
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `packages/contracts/src/index.ts`

## Current repo inventory

### Product constraints already in force

- Formal booking creation requires successful geocode.
- Service area / operating area eligibility remains a dispatch truth check.
- Call center may recover from provider degradation with a manually pinned
  coordinate, but the booking must be marked `manual_geocode`.
- Map input is an address-entry aid, not a second source of dispatch truth.

### Gaps found on 2026-06-30

1. The task-brief artifacts did not yet exist at the canonical paths.
2. The repo has geocode-related contract fields (`provider`, `manual`, `none`,
   `missing_geocode`) but no recorded production provider decision.
3. There is no recorded rollout policy for quota, key restrictions, attribution,
   or retention.
4. CI has no declared mock map/geocode provider requirement.
5. The UI packages and app manifests currently do not hard-code a map provider
   SDK. That is good, but it was not previously written down as a guardrail.

### Repo evidence for current behavior

- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts` defaults
  coordinate-bearing manual entries to `geocodeSource = "manual"` and emits
  `missing_geocode` when coordinates are absent.
- `packages/contracts/src/index.ts` already exposes the geocode source and
  address quality issue enums needed for provider-backed and manual flows.
- `apps/*/package.json` and `packages/*/package.json` do not currently declare
  Google Maps, Mapbox, Leaflet, or other map SDK dependencies.

## Provider decision

### Selected production provider family

- Primary production map, geocode, and route provider: Google Maps Platform
- Web map surface: Google Maps JavaScript API, loaded only behind a shared
  adapter boundary
- Native map surface: `react-native-maps` with Google provider configuration in
  the Expo prebuild path, also behind the same adapter boundary
- Geocoding and routing authority: backend proxy to Google Geocoding API and
  Google Routes API

### Why this is the chosen path

1. The product needs one vendor family for map rendering, geocoding, and ETA so
   licensing and attribution stay coherent.
2. Google documents official support for web maps, Android, iOS, geocoding, and
   routes in the same platform family.
3. Google explicitly allows Geocoding API and Routes API content to be used
   without a corresponding Google map, but its terms also prohibit using Google
   Maps content together with a non-Google map. Choosing Google for both map and
   geocode avoids a split-vendor compliance trap.
4. The current repo has no pre-existing map SDK dependency, so this decision can
   still be implemented cleanly through a provider abstraction instead of a
   rewrite.

## Required architecture guardrails

### Provider abstraction

- UI surfaces must consume a repo-owned adapter or shared component boundary,
  not import vendor SDKs directly in page-level code.
- Backend geocode, reverse-geocode, autocomplete, route, and service-area
  checks must run through a single provider interface so CI can swap in a mock.
- Provider request identifiers must be surfaced through backend logs/audit
  records where the contract requires ETA traceability.

### No hard-coded provider in UI

- The current repo state is intentionally provider-agnostic at the dependency
  layer.
- Preserve that property until the dedicated shared adapter package lands.
- Do not add direct vendor imports to `apps/*/app/**` or route files; the
  provider boundary must live in a shared map module or backend proxy.

## Coordinate-less booking policy

### Formal rule

- A dispatchable booking must have coordinates before it is accepted as a formal
  booking record.

### Surface-specific policy

- Tenant, partner, and public/self-service flows: reject submission when address
  resolution fails or coordinates are missing.
- Call center degraded flow: allow the agent to continue only if they manually
  pin coordinates; persist `geocodeSource = "manual"` and retain the original
  entered address text.
- If provider geocode fails and no manual pin is provided, the record may be
  saved only as intake/draft workflow data, not as a dispatchable booking.

## Data, licensing, and retention constraints

- Store only the minimum durable fields needed by the domain model: normalized
  address text, lat/lng, optional provider place identifier, geocode source,
  quality issues, and provider request/correlation id.
- Do not persist raw provider payloads as durable business data.
- If Google-derived lat/lng or route content is cached outside the booking
  record, enforce a maximum 30-day cache window.
- Any Google-derived map or geocode content shown without an embedded Google map
  still requires attribution handling per provider documentation.
- Do not render Google route or geocode content on top of a non-Google map.

## CI and local-dev requirement

- A deterministic mock provider is mandatory for unit tests, integration tests,
  Playwright, and CI smoke paths.
- The mock must cover:
  - forward geocode
  - reverse geocode
  - autocomplete/session behavior
  - route ETA
  - service-area / polygon containment checks
- CI must not depend on live provider keys, live billing, or external rate
  limits.

## Remediation plan

1. Land the provider decision and rollout policy in canonical docs.
2. Seed the rollout feature flags in the API control plane with safe defaults
   set to disabled.
3. Build a shared provider abstraction before any UI imports a real map SDK.
4. Implement the mock provider first, then wire live provider adapters behind
   feature flags.
5. Enable service-area enforcement only after polygon data, observability, and
   degraded-mode operator handling are verified.

## External references

- Google Geocoding usage and billing:
  `https://developers.google.com/maps/documentation/geocoding/usage-and-billing`
- Google Maps Platform service specific terms:
  `https://cloud.google.com/maps-platform/terms/maps-service-terms`
- Google Maps pricing:
  `https://developers.google.com/maps/billing-and-pricing/pricing`
- Mapbox Geocoding API:
  `https://docs.mapbox.com/api/search/geocoding-v6/`
- Mapbox pricing:
  `https://docs.mapbox.com/accounts/guides/pricing/`

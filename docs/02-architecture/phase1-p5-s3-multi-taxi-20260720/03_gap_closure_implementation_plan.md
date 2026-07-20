# P-5 / S-3 Gap-Closure Implementation Plan

**Date:** 2026-07-20 · **Base:** `dev` · **Author:** system-design pass

This plan audits the spec against the **live** codebase, reconciles the spec's
assumptions with what actually exists, and sequences the work as
dependency-ordered waves mapped to the §31 work-package codes.

---

## R. Reconciliation with the live system (read this first)

The spec was written as if greenfield. Several primitives already exist and must
be **extended, not rebuilt**; several names in the spec don't match the repo.

| Spec assumption | Live reality | Action |
|---|---|---|
| Schema `registry.*` | Repo uses **`reg`** (`reg.drivers`, `reg.vehicle_reg_profiles`, `reg.driver_reg_profiles`) | Put new vehicle/driver disclosure tables in **`reg`**, not `registry`. |
| Schema `safety.*` | **Does not exist** | New migration must `CREATE SCHEMA safety`. |
| Schema `mobility.*`, `reporting.*` | Exist ✓ | Use as-is. |
| Vehicle field `make` | Draft/canonical use **`brand`** | Map `make → brand`; **add `door_count`, `color`** (both currently absent from `fleet.vehicle_supply_drafts`). |
| Vehicle draft has model/year | `fleet.vehicle_supply_drafts.model / model_year` exist (nullable) | Tighten to required for `multi_taxi_direct`; add disclosure profile. |
| Driver registration is greenfield | `reg.driver_reg_profiles.taxi_registration_no / taxi_registration_expiry / certificate_status` exist | Extend: add `registration_area`, `masked_display`, public credential lifecycle status + `version`; **do not** trust `certificate_status='valid'` as `verified_active`. |
| Eligibility engine is new | `mobility.runtime_eligibility_decisions` exists with `hard_reason_codes / soft_reason_codes / missing_requirements / location_state` | **Extend** with P-5 reasons + runtime-profile check; reuse decision shape. |
| Assignment versioning is new | `ops.dispatch_assignments.version_no` + `(dispatch_job_id, version_no)` unique exists; lifecycle timestamps (accepted/arrived/trip_started/completed) exist | Reuse `version_no` as `assignmentVersion`; add snapshot keyed to it. |
| Redispatch is new | `POST owned-mobility …/orders/:orderId/redispatch` exists | Wrap with snapshot-supersede transaction. |
| Passenger SSE is new | owned-mobility already has `@Sse("driver/task-events")` + `@Sse("ops/dispatch-events")` | Reuse the SSE plumbing/event bus for the passenger + ops-SOS streams. |
| Geo/route is new | `geo` module has provider abstraction (`geo.provider.ts`, `mock-geo.provider.ts`) emitting `distanceMeters` | Reuse for route/ETA; add polyline + duration + fare-quote snapshot. |
| Passenger cancel is new | `POST owned-mobility …/passenger/orders/:orderId/cancel` exists (order-id keyed, internal) | Front with opaque-token authority; keep internal path for ops. |
| SOS is new | `incident` module is a **generic** incident/complaint/service-recovery form (categories incl. `safety`, escalation targets incl. `safety_officer`, `roc_duty`); driver-app has `app/incident.tsx` | Build **dedicated** SOS aggregate; SOS create txn resolves/creates exactly one `incident` row (correlation, not replacement). |

**Net conclusion:** the *supply/registry/dispatch/eligibility/geo/SSE* spine already
exists and is high-quality. The genuinely-missing surface is: **passenger
disclosure data authority, rating authority, disclosure snapshot, passenger
token surface + consumer outbox, fare-disclosure snapshot + public fare version,
the adjacent consumer capabilities (call/seatbelt/pay/cert/2yr-record), and the
entire S-3 SOS domain.**

---

## Current-state audit (EXISTS ✓ / MISSING ✗)

### P-5
| Capability | Status | Evidence |
|---|---|---|
| Vehicle supply draft (brand/model/year) | ✓ partial | `fleet.vehicle_supply_drafts` — no door_count/color |
| Vehicle **disclosure profile** (canonical, versioned, missing-codes) | ✗ | no `*_disclosure_profiles` table |
| Driver reg no/expiry | ✓ partial | `reg.driver_reg_profiles` — no area/masked/lifecycle/version |
| Driver **public registration credential** (masked, human-verified lifecycle) | ✗ | — |
| Eligibility engine (hard/soft/missing) | ✓ | `mobility.runtime_eligibility_decisions` |
| P-5 disclosure **hard gate** + runtime profile enforcement | ✗ | `multi_taxi_direct` grep = 0 hits |
| Assignment + `version_no` (redispatch versioning) | ✓ | `ops.dispatch_assignments` |
| Immutable **disclosure snapshot** | ✗ | no snapshot table |
| Passenger **rating authority** | ✗ | no rating tables (grep hits are audit-log noise) |
| Route/ETA provider | ✓ | `geo` module |
| **Route/fare disclosure snapshot** + public fare version + anomalies | ✗ | billing-settlement has statements, not passenger quote snapshot |
| Passenger **opaque ride token** + `/api/passenger-rides/*` | ✗ | only order-id cancel exists |
| Passenger SSE | ✓ infra | reuse owned-mobility `@Sse` |
| **Consumer notification outbox** | ✗ | — |
| Masked calling / seatbelt / payment / ride certificate / 2yr record | ✗ | — |

### S-3
| Capability | Status | Evidence |
|---|---|---|
| Generic incident domain | ✓ | `incident` module (open/investigating/resolved/closed, service recovery) |
| Dedicated **DriverSosEvent** aggregate/API/DB, `safety` schema | ✗ | no safety schema; incident is generic |
| Driver-app SOS button / 110·119 dial / offline outbox / attachments | ✗ | `app/incident.tsx` is the generic form; no SOS/dial/SQLite outbox |
| Ops SOS alert / queue / ack / SLO | ✗ | ops-console has dispatch/callcenter, no SOS surface |
| SSE plumbing to reuse for ops SOS stream | ✓ | owned-mobility `@Sse("ops/dispatch-events")` |

---

## P-5 workstream (dependency-ordered)

### Wave P5-1 — Data authority foundations  *(blocks everything)*
- **P1-MTX-PROFILE-001** Runtime profile `multi_taxi_direct` + canonical config + enforcement hooks at booking-create / candidate-eval / assignment / passenger-read / driver-projection / SOS-context / ops-read. Reservation-only guard → `409 MULTI_TAXI_RESERVATION_ONLY`.
- **P5-SUP-001** Add `door_count` (CHECK 3..6) + `color` to `fleet.vehicle_supply_drafts` and to `VehicleSupplyDraft` contract; extend supply submission/review to capture them; on submission-approve, upsert canonical vehicle + **`reg.vehicle_passenger_disclosure_profiles`** in one txn.
- **P5-DRV-001** New **`reg.driver_public_registration_credentials`** (registrationNo/area/effectiveFrom/effectiveUntil/status/maskedDisplay/version). Server-side masking; human-review lifecycle (never auto-`verified_active`).
- **P5-BACKFILL-001** Migration V0038+: backfill make/model/year from approved submissions; door_count/color → correction queue (no fake defaults); backfill registration no/area/expiry; unreviewed → `unverified`.
- Migration: `V0038__p5_vehicle_disclosure_and_driver_credentials.sql`.
- Contracts: `P5-CON-001` (shared `@drts/contracts` types for all §3–§15 shapes).

### Wave P5-2 — Rating authority  *(parallel with P5-1)*
- **P5-RATE-001..004** `mobility.passenger_trip_ratings` (unique `(trip_id, passenger_subject_ref)`) + `mobility.driver_rating_summaries`; submit (completed-trip only), aggregate recompute, invalidation-with-audit-and-rebuild, display-state logic (rated / new_driver / unavailable — **no fake 5.0**).

### Wave P5-3 — Eligibility hard gate + assignment recheck  *(needs P5-1, P5-2)*
- **P5-CAN-001 / P5-GATE-001..002** Extend `runtime_eligibility_decisions` producer with P-5 hard reasons (`P5_VEHICLE_*`, `P5_DRIVER_REGISTRATION_*`, `P5_RATING_STATE_UNINITIALIZED`, `P5_RUNTIME_PROFILE_MISMATCH`). `new_driver` = allowed; `unavailable` = hard block.
- **P5-ASSIGN-001** Assignment transaction re-reads profile/credential/rating/service-product/availability/profile-code versions → `409 PASSENGER_DISCLOSURE_CHANGED_BEFORE_ASSIGNMENT` on drift.

### Wave P5-4 — Disclosure snapshot + redispatch  *(needs P5-3)*
- **P5-SNAP-001** `mobility.passenger_dispatch_disclosure_snapshots` (immutable, unique `(order_id, assignment_version)`), built **inside** the assign txn — never best-effort after commit.
- **P5-REDISPATCH-001** Wrap existing redispatch: lock active assignment → new assignment (`version_no+1`) → supersede old snapshot → create N+1 snapshot → `assignment_replaced` outbox → commit.
- Tests: `INT-P5-001` atomicity, `INT-P5-002` redispatch-version.

### Wave P5-5 — Route / fare disclosure  *(parallel with P5-4)*
- **P5-ROUTE-001 / P5-FARE-001** `RouteFareDisclosureSnapshot` at booking confirmation (persist polyline/distance/duration + `farePolicyVersion` + `fareChangeRule*` + confirm timestamp), sourced from `geo` + pricing.
- **P5-FARE-PUB-001** `MultiTaxiPublicFareVersion` (draft/filed/active/retired) + public `/fares` route; booking uses `active` only; activation/retirement audited.
- **P5-FARE-ANOM-001** Quote anomalies (provider_unavailable/out_of_range/route_unresolved/policy_missing/calculation_mismatch) → no auto-confirm of fixed fare.

### Wave P5-6 — Passenger authority surface  *(needs P5-4, P5-5)*
- **P5-PAX-001..003** `PassengerRideAccessToken` (opaque, one order, scoped, revocable, rate-limited, no PII) + `/api/passenger-rides/{token}/{disclosure,events,cancel,ratings,receipt,driver-contact-session}`. Response strips raw phone / full registration / external-platform / mirror / sandbox·AV fields.
- **P5-PUSH-001 / P5-CON-001** `ConsumerNotificationOutboxRecord` + passenger SSE (reuse owned-mobility `@Sse` bus); events carry `assignmentVersion` + `eventVersion`; version-safe (silently ignore stale versions).
- Test: `INT-P5-003` rating idempotency; `E2E-023` passenger disclosure.

### Wave P5-7 — Adjacent consumer capabilities  *(port-first; provider deferred)*
Each ships as **port + state machine + audit**, with mock/unprovisioned states that
**cannot** stand as production closure evidence:
- **P5-CALL-001** Masked calling port → `not_provisioned` ⇒ `supportPhoneFallback` (never raw phone).
- **P5-SEAT-001** Seatbelt reminder event (trigger arrived_pickup/trip_started).
- **P5-PAY-001** Passenger payment state machine (tokenized; no raw card; capture on completion; failure recovery).
- **P5-RCT-001** Electronic ride certificate (HTML/PDF/share).
- **P5-RET-001..005** `reporting.multi_taxi_trip_operational_records` + 730-day retention + admin list/export endpoints; `INT-P5-004` retention; `E2E-024`.

---

## S-3 workstream (dependency-ordered)

### Wave S3-1 — Contract + DB  *(blocks S-3)*
- **S3-CON-001** SOS contract types (status/type/severity/record) in `@drts/contracts`.
- **S3-DB-001** Migration `V0039__s3_driver_sos.sql`: `CREATE SCHEMA safety` + `safety.driver_sos_events` (unique `(driver_id, client_event_id)`, unique `event_no`), `driver_sos_timeline`, `driver_sos_attachments`.

### Wave S3-2 — Server authority + incident correlation  *(needs S3-1)*
- **S3-CTX-001** Server-authoritative context resolver: from driver bearer derive driverId/active-task/vehicle/plate/order/latest-server-location(+device fallback)/runtime-profile — **ignore** client-claimed identity. `INT-S3-001` spoof protection.
- **S3-BE-001** `POST /api/driver/sos-events` (+ read, supplements, false-alarm-dismiss).
- **S3-INC-001** SOS create txn: create SOS → resolve/create **exactly one** `incident` (reuse incident module) → timeline → urgent-alert outbox → commit. `INT-S3-002` correlation.

### Wave S3-3 — Ops alert + SLO  *(needs S3-2)*
- **S3-ALERT-001** Urgent-alert outbox (pending→sending→delivered→acknowledged), retry/idempotent; `INT-S3-003`.
- **S3-OPS-001** Ops APIs: `GET /api/ops/sos-events`, `…/stream` (reuse owned-mobility SSE), get, acknowledge (first-writer-wins), investigate, resolve, close.
- **S3-METRIC-001** SLO: p95 `fleetReportConfirmedAt → opsAlertRenderedAt` ≤ 5s; observability metrics + criticals.
- **S3-FALSE-001** False-alarm lifecycle (dismiss+confirm, retained+audited, ops still acknowledges); `INT-S3-004`.
- **S3-SUPP-001** Supplements + attachments confirm.

### Wave S3-4 — Driver app  *(needs S3-2; UI per visual team)*
- **S3-MOB-001..003** SOS home + persistent entry + press-and-hold (2s).
- **S3-DIAL-001** Native `tel:110`/`tel:119`, log `dial_action_invoked`, no data dependency.
- **S3-OFF-001** SQLite durable offline outbox (metadata-first, restart-resume, original-timestamp, no Incident duplication). `E2E-026` offline replay.
- **S3-ATT-001** Attachment upload (pre-signed, checksum, malware scan, per-item retry).
- `E2E-025` online alert.

> The driver-app currently ships `app/incident.tsx` (generic). S-3 is a **new,
> independent full-screen SOS surface** — do not overload the incident screen.

---

## Cross-cutting

### Forbidden-term guard
Add a CI scan (extend the existing docs-site/i18n guard pattern) asserting that
P-5 passenger read model, S-3 SOS projection, and their UI copy never emit:
`FSD / 自駕 / 無人駕駛 / 安全員 / 接管 / sandbox / Tesla / AV / forwarded / mirror /
native status / external platform badge`. The `forwarder` and
`sandbox-governance` modules must not be imported by the P-5/S-3 read paths.

### UI ownership (standing rule)
LLM does **not** design UI. Deliver flows + field/state/error mapping (doc 03) +
screen-requirement inputs to the visual team; check
`docs/05-ui/drts-design-canvas/` first. Backend closes contracts, then hands the
"Development-Ready-for-Design" gate (doc 03 §6).

### Migration safety
No fake defaults (no `5.0` rating, no synthetic door_count/color). Post-rollout:
100% two-year record coverage is a **critical** alert; assignment-without-snapshot
is **critical**.

### Suggested migration/PR sequencing
1. `V0038` (P5-1 data authority) + contracts → 2. rating (P5-2) → 3. gate+snapshot
(P5-3/4) → 4. route/fare (P5-5) → 5. passenger surface (P5-6) → 6. adjacents (P5-7).
S-3: `V0039` → BE → ops → driver-app, independently of P-5.

### Definition of Done
Track against system spec §33 (P-5 1–11, S-3 1–9) and UI DoD §31. Release gate:
UI reads live API (no fixtures), system E2E green, forbidden-word scan green.

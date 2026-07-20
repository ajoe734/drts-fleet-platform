# Source Specs — Normative Index (P-5 / S-3)

Catalogue of the three inbound handoff documents and the **normative machine
artifacts** they define. Code/DDL/enum/route/WP blocks below are reproduced
verbatim from the source ASCII (which arrived uncorrupted); Chinese prose is
summarized, not reproduced.

---

## Doc 1 — `01_system_development_team_spec_20260720.md` (v2.0)

Scope: domain authority, contracts, API, DB, transactional boundary, state
machine, RBAC, masking, offline/idempotency, events/outbox, retention/audit,
observability, migration, tests, UAT, release gate. **Does not** decide visual
design.

### Runtime profile (§2)
```ts
export type PassengerServiceRuntimeProfileCode = "multi_taxi_direct";
```
```yaml
code: multi_taxi_direct
displayName: 多元計程車
orderDomains: [owned]
allowedServiceProducts: [taxi_reservation]
reservationOnly: true
passengerSurface: direct_ride
driverSurface: multi_taxi_driver
opsSurface: multi_taxi_ops
forbiddenCapabilities:
  - forwarded_order_ui
  - external_platform_badge
  - sandbox_disclosure
  - av_fulfillment
  - safety_operator
  - remote_takeover
```
Reservation-only guard: `serviceProductType=taxi_reservation ∧ reservationTime!=null ∧ orderDomain=owned`, else `409 MULTI_TAXI_RESERVATION_ONLY`.

### Core types
- `VehiclePassengerDisclosureProfile` (§3.1): make, model, modelYear, doorCount(3..6), color(nullable), status ∈ complete|incomplete|suspended, missingFieldCodes[], version.
- `DriverPublicRegistrationCredential` (§3.2): registrationNo, registrationArea, effectiveFrom, effectiveUntil, status ∈ verified_active|expired|suspended|revoked|unverified|missing, maskedDisplay (server-generated), version. Rule: `licensesValid=true` alone ≠ `verified_active` (human review required).
- `PassengerTripRatingRecord` (§4.1): unique `(tripId, passengerSubjectRef)`, score 1..5, status active|invalidated|under_review; completed trips only.
- `DriverRatingSummary` (§4.2): displayState ∈ rated|new_driver|unavailable; 0 ratings → new_driver; uninit/failure → unavailable (no fake 5.0).
- `PassengerDispatchDisclosureSnapshot` (§6): immutable per `(orderId, assignmentVersion)`, embeds vehicle/driver/rating/eta/routeFare.
- `RouteFareDisclosureSnapshot` (§7): pickup/dropoff, distance/duration/polyline, chargingMode meter_estimate|fixed_quote, farePolicyVersion + fareChangeRule*, confirmed-at. Anomalies: quote_provider_unavailable, quote_out_of_range, route_unresolved, fare_policy_missing, calculation_mismatch.
- `PassengerRideAccessToken` (§8.1): opaque, one order, scopes ride:read|cancel|rate|contact + receipt:read; URL `/ride/{opaqueToken}`.
- `ConsumerNotificationOutboxRecord` (§9), `PassengerDriverContactPort` (§10, not_provisioned→supportPhoneFallback), `SeatbeltReminderEvent` (§11), `PassengerPaymentStatus` (§12), `ElectronicRideCertificate` (§13), `MultiTaxiTripOperationalRecord` (§14, retain 730d), `MultiTaxiPublicFareVersion` (§15, booking uses `active` only).

### P-5 eligibility hard reasons (§5)
```
P5_VEHICLE_MAKE_MISSING | P5_VEHICLE_MODEL_MISSING | P5_VEHICLE_YEAR_MISSING |
P5_VEHICLE_DOOR_COUNT_MISSING | P5_DRIVER_REGISTRATION_MISSING |
P5_DRIVER_REGISTRATION_EXPIRED | P5_DRIVER_REGISTRATION_UNVERIFIED |
P5_RATING_STATE_UNINITIALIZED | P5_RUNTIME_PROFILE_MISMATCH
```
Assignment recheck re-reads vehicle profile / credential / rating aggregate /
service product / availability / profile code versions → `409 PASSENGER_DISCLOSURE_CHANGED_BEFORE_ASSIGNMENT` on drift.

### Passenger API (§8.2) & SSE (§8.3)
```
GET  /api/passenger-rides/{token}/disclosure
GET  /api/passenger-rides/{token}/events
POST /api/passenger-rides/{token}/cancel
POST /api/passenger-rides/{token}/ratings
GET  /api/passenger-rides/{token}/receipt
POST /api/passenger-rides/{token}/driver-contact-session
```
SSE: assignment_disclosure_ready, assignment_replaced, driver_location_updated, eta_changed, driver_arrived, trip_started, trip_completed, trip_cancelled, receipt_ready (each carries assignmentVersion + eventVersion).

### S-3 (§16-25)
- `DriverSosStatus`: local_triggered|queued_offline|submitted|duty_alerted|acknowledged|false_alarm_dismissed|investigating|resolved|closed.
- `DriverSosEventType`: traffic_accident|security_incident|passenger_medical|other. Severity: major|normal.
- `DriverSosEventRecord` (§16.1) unique `(driverId, clientEventId)`; server resolves driverId/task/vehicle/plate/order/location from bearer (§17).
- API (§18):
```
POST /api/driver/sos-events
GET  /api/driver/sos-events/{id}
POST /api/driver/sos-events/{id}/attachments/upload-url
POST /api/driver/sos-events/{id}/attachments/confirm
POST /api/driver/sos-events/{id}/supplements
POST /api/driver/sos-events/{id}/false-alarm-dismiss
GET  /api/ops/sos-events
GET  /api/ops/sos-events/stream
GET  /api/ops/sos-events/{id}
POST /api/ops/sos-events/{id}/acknowledge|investigate|resolve|close
```
- Native dial (§19): `tel:110` / `tel:119`, logs `dial_action_invoked`, no data-network dependency.
- Offline outbox (§20): SQLite durable, metadata-first, restart-resume, original-timestamp preserved, no Incident duplication.
- Attachments (§21): image/jpeg,png ≤10MB×10; audio/m4a,aac ≤5min/25MB; pre-signed, checksum, malware scan.
- SOS create txn (§23): create SOS → resolve/create exactly one Incident → timeline → urgent-alert outbox → commit.
- Ops urgent alert (§24): outbox pending→sending→delivered→acknowledged; first-ack-wins; SLO p95 ≤5s from `fleetReportConfirmedAt` to `opsAlertRenderedAt`.

### DDL (§26) — target schemas
`registry.vehicle_passenger_disclosure_profiles`, `registry.driver_public_registration_credentials`,
`mobility.passenger_trip_ratings`, `mobility.driver_rating_summaries`,
`mobility.passenger_dispatch_disclosure_snapshots`,
`safety.driver_sos_events` / `driver_sos_timeline` / `driver_sos_attachments`,
`reporting.multi_taxi_trip_operational_records`.
> ⚠️ **Schema-name reconciliation required** — see plan §R. Repo uses `reg` (not
> `registry`); `safety` schema does not yet exist; `mobility`/`reporting` match.

### Work packages (§31)
```
P-5: P1-MTX-PROFILE-001, P5-CON-001, P5-CAN-001, P5-DRV-001, P5-SUP-001,
     P5-BACKFILL-001, P5-RATE-001..004, P5-GATE-001..002, P5-SNAP-001,
     P5-ASSIGN-001, P5-REDISPATCH-001, P5-ROUTE-001, P5-FARE-001,
     P5-FARE-PUB-001, P5-FARE-ANOM-001, P5-PAX-001..003, P5-PUSH-001,
     P5-CALL-001, P5-SEAT-001, P5-PAY-001, P5-RCT-001, P5-RET-001..005
S-3: S3-CON-001, S3-DB-001, S3-CTX-001, S3-BE-001, S3-INC-001, S3-ALERT-001,
     S3-OPS-001, S3-METRIC-001, S3-MOB-001..003, S3-DIAL-001, S3-OFF-001,
     S3-ATT-001, S3-FALSE-001, S3-SUPP-001
```

### Tests (§32)
E2E-023 passenger-disclosure, E2E-024 rating-receipt-retention, E2E-025 sos-online-alert,
E2E-026 sos-offline-replay; INT-P5-001..004, INT-S3-001..004.

---

## Doc 2 — `02_ui_visual_design_team_brief_20260720.md` (v2.0)

Scope: user tasks, IA, screen list, visual hierarchy, component inventory, state
variations, interaction, copy, a11y, responsive, prototype, Figma handoff,
screenshots, design QA. **Does not** define DB/API/txn/SQL/tests.

- Screens: P5-01..12 + P5-A01..A05 (passenger + back-office); S3-01..11 (driver) + S3-O01..O06 (ops).
- Forbidden on-screen vocabulary (§1.3): FSD/自駕/無人駕駛/安全員/接管/ROC/sandbox/Tesla/外部平台名稱/forwarded/mirror/native status/平台聚合媒合器/外部平台 badge.
- Components (§22): RideStatusHeader, LiveMapCard, EtaHero, VehicleIdentityCard, DriverCredentialBadge, DriverRatingDisplay, RouteFareDisclosureCard, CancelWindowIndicator, ContactDriverButton, SeatbeltReminder, RatingInput, ElectronicRideCertificate, DisclosureErrorState; PersistentSosEntry, HoldToActivateButton, EmergencyDialButton, FleetReportButton, SosContextCard, SosDeliveryStatus, AttachmentUploader, AudioRecorder, FalseAlarmSlider, SosTimeline; CriticalSosAlert, SosSoundHealth, SosQueueTable, SosAcknowledgementChip, SosMapPanel, SosTimelinePanel.
- Uses existing DRTS design tokens (§23); no P-5/S-3 private palette. Screenshots: `P5_dispatch_disclosure.png`, `S3_sos_fullscreen.png`.

## Doc 3 — `03_cross_team_handoff_matrix_20260720.md`

Ownership matrix (system-dev owns fields/state/API/error/E2E; UI owns
layout/copy/visual-QA; release sign-off shared) + field/state/error mapping
tables + three gates: *Development-Ready-for-Design*, *Design-Ready-for-Impl*,
*Release-Ready*.

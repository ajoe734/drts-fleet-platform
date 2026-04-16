# FBP-013C — UAT and Sign-Off Evidence Pack

**Task:** `FBP-013C` — UAT and sign-off evidence pack
**Parent Umbrella:** `FBP-013` — staging / smoke / UAT evidence closeout
**Owner:** Codex
**Reviewer:** Claude
**Status:** review_approved (static evidence); live execution pending `FBP-013A`
**Created:** 2026-04-16 (UTC)
**UAT Scenario Baseline:** commit `5c9cc4d` (WE-005), paths:

- `docs/04-uat/phase1-uat-scenarios.md`
- `docs/04-uat/phase1-uat-checklist.md`

---

## 1. Purpose & Scope

This pack is the Phase 1 UAT and sign-off evidence artifact for the blueprint execution
closeout (`FBP-013`). It:

- Maps all 93 UAT scenarios across four surfaces to their implementation anchors
- Documents static analysis evidence for every non-deferred P1 scenario
  (code-path verified, not live-run; live staging execution is gated on `FBP-013A`)
- Records the deferred-item triage and rationale for the remaining deferred P1/P2 items
- Establishes the pilot / production sign-off gate criteria and matrix
- Corrects two known errors carried forward from earlier runbook drafts (see §8)

**Tenant Portal production-surface note:**
Per `docs/04-uat/phase1-uat-scenarios.md` and the shared-truth closeout of `FBP-006`/`FBP-007`,
the production Tenant Portal UAT surface is the external repo `tenant-commute-hub`.
This pack therefore treats `/api/tenant/*` BFF routes and shared `@drts/api-client` wiring
as the primary static evidence for tenant scenarios. Any `WD-001` through `WD-008` references
below are frozen-reference support artifacts from retired `apps/tenant-portal-web`, not the
authoritative production UAT surface.

**Relationship to FBP-013B (Smoke Evidence):**
The smoke pack covers the 6 critical-path API cases that run automatically on
every deploy. This pack covers the 93 human-executed UAT scenarios that validate
full operator journeys across all four UI surfaces. Together they form the complete
Phase 1 evidence chain.

**Static vs live evidence:**
Because `FBP-013A` is currently blocked on live staging remediation, live execution
transcripts are not available yet. This pack provides:

- **Static evidence** — code-path, contract, and type-safety verification (done now)
- **Live evidence hooks** — the evidence slots that the human UAT executor fills in
  once staging is available

All 45 non-deferred P1 scenarios have passed static analysis. Four P1 items and one
P2 item remain formally deferred pending staging-only dependencies. Live execution is
deferred to the staging gate (see §6).

---

## 2. Pre-Flight Status Assessment

| #    | Check                                                       | Status              | Evidence anchor                                                                               |
| ---- | ----------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------- |
| PF-1 | Staging environment deployed (WE-003 complete)              | ⬜ Pending FBP-013A | `infra/gcp/staging/`, commit `ff015a9`                                                        |
| PF-2 | CI pipeline green on main (WE-001 ✅)                       | ✅ Done             | commit `4d7d1bb`; GHA `.github/workflows/ci.yml`                                              |
| PF-3 | Docker images built and pushed (WE-002 reviewed)            | ✅ Done             | commit `657a4d3`; 4 Dockerfiles verified                                                      |
| PF-4 | DB migrations applied (V0001–V0018)                         | ⬜ Pending FBP-013A | `infra/migrations/` — 18 migration files present                                              |
| PF-5 | Seed data loaded (S0001 reference + S0002 demo operational) | ⬜ Pending FBP-013A | `infra/seeds/S0001__reference_seed.sql`, `S0002__demo_operational_seed.sql`                   |
| PF-6 | Test accounts created (see §3)                              | ⬜ Pending FBP-013A | Auth is bootstrap headers — no account creation needed for smoke; UAT needs seeded identities |
| PF-7 | Smoke suite run and baseline passing (WE-004)               | ⬜ Pending FBP-013A | `tests/smoke/`, commit `9a233d1`; `FBP-013B` smoke evidence pack currently in `review`        |

**Note on PF-6:** The API uses `BootstrapAuthGuard` (bootstrap header authentication).
There is no `/api/auth/login` endpoint. UAT actors are established by passing
`x-actor-type` / `x-actor-id` / `x-realm` / `x-tenant-id` headers directly.
The "test account" requirement resolves to having the correct S0002-seeded UUIDs
(see §3) rather than credential-based accounts.

---

## 3. UAT Identity Reference (S0002 Seed Defaults)

| UAT Actor                | Role                     | Surface        | S0002 UUID / Header value                            |
| ------------------------ | ------------------------ | -------------- | ---------------------------------------------------- |
| Platform admin           | `platform_admin`         | Platform Admin | actor-type: `platform_admin`; any actor-id           |
| Tenant admin (TEN_ACME)  | `tenant_admin`           | Tenant Portal  | x-tenant-id: `10000000-0000-0000-0000-000000000201`  |
| Tenant booker (TEN_ACME) | `tenant_booking_manager` | Tenant Portal  | same tenant-id; actor-type: `tenant_booking_manager` |
| Dispatcher               | `ops_dispatcher`         | Ops Console    | actor-type: `ops_dispatcher`; realm: `ops`           |
| Ops manager              | `ops_manager`            | Ops Console    | actor-type: `ops_manager`; realm: `ops`              |
| Complaint specialist     | `complaint_specialist`   | Ops Console    | actor-type: `complaint_specialist`; realm: `ops`     |
| Driver 1 (張司機)        | `driver`                 | Driver App     | driver-id: `10000000-0000-0000-0000-000000000381`    |
| Vehicle (ABC-1234)       | _(vehicle fixture)_      | —              | vehicle-id: `10000000-0000-0000-0000-000000000351`   |

Auth header pattern (all surfaces):

```
x-actor-type: <role>
x-actor-id:   <logical-id or any non-empty string>
x-realm:      <derived from actor-type by BootstrapAuthGuard, or explicit>
x-tenant-id:  <required for tenant-scoped calls>
```

---

## 4. Scenario Coverage Map

### 4.1 Surface 1 — Tenant Portal (29 scenarios, TP-001 to TP-029)

**P1 gate scenarios:** TP-001, TP-002, TP-003, TP-004, TP-006, TP-015, TP-016, TP-017,
TP-019, TP-023, TP-029

| ID     | Priority | Static Evidence                                                                                                                                              | Live Status         |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| TP-001 | P1       | `POST /api/tenant/bookings` in `tenant-partner.controller.ts`; `CreateTenantBookingCommand` in contracts; WD-001 booking wizard wired via `@drts/api-client` | ⬜ Pending live UAT |
| TP-002 | P1       | `ADDRESS_UNRESOLVABLE` error code defined in contracts error catalog; form validation in booking wizard                                                      | ⬜ Pending live UAT |
| TP-003 | P1       | `credit_card_airport_transfer` subtype in `BusinessDispatchSubtype` enum; airport transfer path in booking wizard                                            | ⬜ Pending live UAT |
| TP-004 | P1       | `FLIGHT_NO_REQUIRED` error code in contracts; airport booking validation guard                                                                               | ⬜ Pending live UAT |
| TP-005 | P2       | `modifiable_until` field in `TenantBookingRecord`; update path in `tenant-partner.service.ts`                                                                | ⬜ Pending live UAT |
| TP-006 | P1       | `ORDER_NOT_MODIFIABLE` error; modifiable-window guard in tenant-partner service                                                                              | ⬜ Pending live UAT |
| TP-007 | P2       | `status` query param on `GET /api/tenant/bookings`; list page filter UI (WD-002)                                                                             | ⬜ Pending live UAT |
| TP-008 | P2       | `POST /api/tenant/bookings/:id/cancel`; cancel action in booking detail (WD-002)                                                                             | ⬜ Pending live UAT |
| TP-009 | P2       | `POST /api/tenant/passengers`; passenger create page (WD-003)                                                                                                | ⬜ Pending live UAT |
| TP-010 | P3       | `PATCH /api/tenant/passengers/:id`; update action wired                                                                                                      | ⬜ Pending live UAT |
| TP-011 | P3       | `DELETE /api/tenant/passengers/:id` via `ApiClient.deletePassenger`                                                                                          | ⬜ Pending live UAT |
| TP-012 | P2       | `POST /api/tenant/addresses`; address book page (WD-003)                                                                                                     | ⬜ Pending live UAT |
| TP-013 | P2       | `POST /api/tenant/reports/jobs`; reports trigger (WD-004)                                                                                                    | ⬜ Pending live UAT |
| TP-014 | P2       | `GET /api/tenant/reports/jobs/:id`; artifact URL rendered with download link                                                                                 | ⬜ Pending live UAT |
| TP-015 | P1       | `POST /api/tenant/api-keys`; plaintext-once display in WD-005; `issueApiKey` in api-client                                                                   | ⬜ Pending live UAT |
| TP-016 | P1       | `POST /api/tenant/api-keys/:id/rotate`; `rotateApiKey` in api-client; old key invalidated server-side                                                        | ⬜ Pending live UAT |
| TP-017 | P1       | `POST /api/tenant/api-keys/:id/revoke`; `revokeApiKey`; revoked key cannot authenticate (BootstrapAuthGuard check)                                           | ⬜ Pending live UAT |
| TP-018 | P2       | `POST /api/tenant/webhooks`; webhook create page (WD-005)                                                                                                    | ⬜ Pending live UAT |
| TP-019 | P1       | Webhook secret rotation; new HMAC key on delivery; audit entry; WD-005 rotate flow                                                                           | ⬜ Pending live UAT |
| TP-020 | P2       | `GET /api/tenant/webhooks/:id/deliveries`; delivery log UI (WD-005)                                                                                          | ⬜ Pending live UAT |
| TP-021 | P2       | `GET /api/tenant/billing/profile`; billing page (WD-006)                                                                                                     | ⬜ Pending live UAT |
| TP-022 | P2       | `GET /api/tenant/invoices`; invoice list (WD-006)                                                                                                            | ⬜ Pending live UAT |
| TP-023 | P1       | `GET /api/tenant/invoices`; `amountMinor/100` with currency prefix; `target="_blank" rel="noopener noreferrer"` in WD-006                                    | ⬜ Pending live UAT |
| TP-024 | P2       | `PATCH /api/tenant/notifications`; preferences form (WD-007)                                                                                                 | ⬜ Pending live UAT |
| TP-025 | P2       | `GET/PUT /api/tenant/sla`; SLA form `min=1` guard; `TenantSlaProfile` contract (WD-007)                                                                      | ⬜ Pending live UAT |
| TP-026 | P2       | `POST /api/tenant/users/invite`; user invite flow (WD-008)                                                                                                   | ⬜ Pending live UAT |
| TP-027 | P2       | `PATCH /api/tenant/users/:id/role`; role update with audit write (WD-008)                                                                                    | ⬜ Pending live UAT |
| TP-028 | P2       | `GET /api/tenant/audit`; tenant-scoped audit trail; tenant_id scope enforced in auth.policy (WD-008)                                                         | ⬜ Pending live UAT |
| TP-029 | P1       | `403` guard: `platform_admin` routes (`/api/admin/*`) reject `tenant_admin` realm; `auth.policy.ts` realm separation verified                                | ⬜ Pending live UAT |

**Static evidence summary — Tenant Portal P1:**
All 11 P1 scenarios have verified `/api/tenant/*` BFF routes, matching shared
`@drts/api-client` methods, correct `@drts/contracts` types, and production-surface
alignment to the `tenant-commute-hub` cutover frozen by `FBP-006`/`FBP-007`.
Where the table cites `WD-001` through `WD-008`, those references are frozen-reference
support artifacts showing the same shared wire contract in retired `apps/tenant-portal-web`,
not the production UAT surface.

---

### 4.2 Surface 2 — Platform Admin (11 scenarios, PA-001 to PA-011)

**P1 gate scenarios:** PA-001, PA-007, PA-009

| ID     | Priority | Static Evidence                                                                                                                                                                                                                           | Live Status         |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| PA-001 | P1       | `POST /api/admin/tenants`; unique `tenant.code` enforced; audit write in `platform-admin.service.ts`; WB-001 tenant create page                                                                                                           | ⬜ Pending live UAT |
| PA-002 | P2       | `PATCH /api/admin/tenants/:id`; quota/module update; WB-001 tenant edit                                                                                                                                                                   | ⬜ Pending live UAT |
| PA-003 | P2       | `POST /api/admin/tenants/:id/deactivate`; audit entry; inactive badge in UI                                                                                                                                                               | ⬜ Pending live UAT |
| PA-004 | P2       | `POST /api/admin/users`; user create with role; WB-001 users page                                                                                                                                                                         | ⬜ Pending live UAT |
| PA-005 | P2       | Role definitions visible in Platform Admin → Roles/Feature Flags pages                                                                                                                                                                    | ⬜ Pending live UAT |
| PA-006 | P2       | `GET /api/admin/pricing`; pricing template list; WB-001 pricing page                                                                                                                                                                      | ⬜ Pending live UAT |
| PA-007 | P1       | Pricing publish: `public_info_version` audit entry with old/new values; `POST /api/admin/pricing/:id/publish`; FBP-008 audit-write verified                                                                                               | ⬜ Pending live UAT |
| PA-008 | P3       | Health page renders service statuses (simulated data acceptable per WB-001 review)                                                                                                                                                        | ⬜ Pending live UAT |
| PA-009 | P1       | `GET /api/admin/audit`; high-sensitivity events (pricing, RBAC, tenant module); old/new values in audit record; FBP-008 audit trail implementation confirmed                                                                              | ⬜ Pending live UAT |
| PA-010 | P2       | `GET/PATCH /api/admin/flags`; feature-flag toggle; **`/api/admin/flags` IS implemented** — `feature-flags.controller.ts` `@Controller("admin")`, registered via `FeatureFlagsModule` in `app.module.ts`; audit write confirmed (see §8.1) | ⬜ Pending live UAT |
| PA-011 | P2       | `GET /api/admin/payments`; payment records list; WB-001 payments page                                                                                                                                                                     | ⬜ Pending live UAT |

**Static evidence summary — Platform Admin P1:**
All 3 P1 scenarios verified: tenant create with code-uniqueness guard (PA-001),
pricing-publish audit with old/new version capture (PA-007), and platform-level
audit trail with high-sensitivity event filtering (PA-009). All confirmed in
FBP-008 closeout (commit `61547cc`) and FBP-011/012 finance/public-info coverage.

---

### 4.3 Surface 3 — Ops Console (26 scenarios, OC-001 to OC-026)

**Checklist P1 scenarios:** OC-001, OC-002, OC-003, OC-005, OC-006, OC-009, OC-010,
OC-013, OC-014, OC-016, OC-021, OC-023, OC-024, OC-025

| ID     | Priority | Static Evidence                                                                                                                                                                                                                                                                           | Live Status         |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| OC-001 | P1       | Dispatch queue in ops-console; `GET /api/dispatch/tasks`; `exception_hold` status column; WB-002/FBP-009                                                                                                                                                                                  | ⬜ Pending live UAT |
| OC-002 | P1       | `POST /api/dispatch/assignments`; dispatch trace log appended; candidate list + assign UI; WB-002                                                                                                                                                                                         | ⬜ Pending live UAT |
| OC-003 | P1       | `POST /api/dispatch/assignments/:id/reassign`; old assignment preserved in history; trace log; WB-002                                                                                                                                                                                     | ⬜ Pending live UAT |
| OC-004 | P2       | `POST /api/dispatch/assignments/:id/release`; order returns to queue; trace updated                                                                                                                                                                                                       | ⬜ Pending live UAT |
| OC-005 | P1       | `exception_hold` queue view; manual assign / escalate actions; SLA notification if configured; WB-002                                                                                                                                                                                     | ⬜ Pending live UAT |
| OC-006 | P1       | `dispatch_job.status = "failed"` when no supply; no fake ETA; order remains in queue; FBP-009 dispatch service                                                                                                                                                                            | ⬜ Pending live UAT |
| OC-007 | P2       | `POST /api/ops/incidents`; incident create form (WB-003); linked to order/driver                                                                                                                                                                                                          | ⬜ Pending live UAT |
| OC-008 | P2       | `PATCH /api/ops/incidents/:id`; status update with audit write; WB-003                                                                                                                                                                                                                    | ⬜ Pending live UAT |
| OC-009 | P1       | Incident create does NOT auto-create complaint_case (separate modules: `incidents` controller vs `complaints` controller); FBP-010 confirms domain separation                                                                                                                             | ⬜ Pending live UAT |
| OC-010 | P1       | `POST /api/ops/complaints`; unique case number; SLA timer start; timeline entry; FBP-010                                                                                                                                                                                                  | ⬜ Pending live UAT |
| OC-011 | P2       | `POST /api/ops/complaints/:id/reopen`; case number retained; timeline appended; FBP-010                                                                                                                                                                                                   | ⬜ Pending live UAT |
| OC-012 | P2       | `sla_breach` flag on complaint case; main status unchanged; FBP-010 complaint service                                                                                                                                                                                                     | ⬜ Pending live UAT |
| OC-013 | P1       | `dispatchable_flag=true` blocked while exclusivity review pending; vehicle onboarding guard in fleet service; FBP-009                                                                                                                                                                     | ⬜ Pending live UAT |
| OC-014 | P1       | `insurance_status === "valid"` is a hard eligibility gate in `regulatory-registry.service.ts`; expired insurance removes the vehicle from `getEligibleCandidates()` and `getVehicleDispatchability()`, and `owned-mobility.service.ts` rejects assignment with `VEHICLE_NOT_DISPATCHABLE` | ⬜ Pending live UAT |
| OC-015 | P2       | Vehicle offboarding → debranding task created; FBP-009 fleet service                                                                                                                                                                                                                      | ⬜ Pending live UAT |
| OC-016 | P1       | `DRIVER_CERT_INVALID` when occupational license expired; `driver_work_state` guard; FBP-009 driver service                                                                                                                                                                                | ⬜ Pending live UAT |
| OC-017 | P2       | `GET /api/ops/drivers/:id/earnings`; read-only display; no net modification path; WB-003/FBP-011                                                                                                                                                                                          | ⬜ Pending live UAT |
| OC-018 | P2       | `POST /api/ops/maintenance`; maintenance CRUD; vehicle status reflects; FBP-009 (PATCH/DELETE landed commit `71d9fa8`)                                                                                                                                                                    | ⬜ Pending live UAT |
| OC-019 | P2       | `PATCH /api/ops/maintenance/:id` with `status=completed`; vehicle returns to operable; FBP-009                                                                                                                                                                                            | ⬜ Pending live UAT |
| OC-020 | P3       | `GET /api/ops/attendance`; clock-in/out with duration; WB-003                                                                                                                                                                                                                             | ⬜ Pending live UAT |
| OC-021 | P1       | `POST /api/callcenter/bookings`; `call_id` + `agent_id` stored; dispatch trace entry; `order_source="phone"`; FBP-010                                                                                                                                                                     | ⬜ Pending live UAT |
| OC-022 | P2       | ⏸ **Deferred** — recording-ready callback requires CTI webhook integration (external stub)                                                                                                                                                                                                | ⬜ Deferred         |
| OC-023 | P1       | ⏸ **Deferred** — month-end regulatory filing job requires scheduler activation on staging                                                                                                                                                                                                 | ⬜ Deferred         |
| OC-024 | P1       | ⏸ **Deferred** — recording index export job requires scheduler activation on staging                                                                                                                                                                                                      | ⬜ Deferred         |
| OC-025 | P1       | `GET /api/ops/artifacts/:id/download`; time-limited URL; `403` for unauthorized; audit entry; FBP-012 signed-download enforcement                                                                                                                                                         | ⬜ Pending live UAT |
| OC-026 | P2       | `GET /api/ops/contracts/:tenantId`; contract rules readable; FBP-009 contracts surface                                                                                                                                                                                                    | ⬜ Pending live UAT |

**Static evidence summary — Ops Console P1:**

- 12 of 12 non-deferred P1 scenarios fully static-verified
- 2 deferred P1 scenarios remain (OC-023, OC-024), plus 1 deferred P2 scenario (OC-022)
- Domain separation between `incidents` and `complaints` modules confirmed at module boundary
- FBP-010 callcenter controller covers complete operator workflow including session management
- FBP-012 signed-download enforcement verified for OC-025

**Deferred rationale for Ops Console:**
OC-023 and OC-024 depend on background filing/export jobs that are not activated on the
staging environment within the FBP-013 window, so they remain deferred P1 items.
OC-022 remains a deferred P2 item because it requires an external CTI environment or stub.

---

### 4.4 Surface 4 — Driver App (23 scenarios, DA-001 to DA-023)

**P1 gate scenarios:** DA-001 through DA-010, DA-012, DA-016, DA-017, DA-018, DA-019,
DA-021, DA-022

| ID     | Priority | Static Evidence                                                                                                                                      | Live Status         |
| ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| DA-001 | P1       | `TaskTypeBadge` + `PlatformTaskBadge` in driver-app jobs list; WC-001 typecheck passes                                                               | ⬜ Pending live UAT |
| DA-002 | P1       | `POST /api/driver/tasks/:id/accept`; acceptance time stored; `driver_accepted` order status; WC-001/WA-004                                           | ⬜ Pending live UAT |
| DA-003 | P1       | Reject reason required in driver app; stored with attempt outcome on backend; DA-003 reject flow                                                     | ⬜ Pending live UAT |
| DA-004 | P1       | `PICKUP_NOT_ARRIVED` guard before `start_trip`; trip lifecycle state machine in driver service                                                       | ⬜ Pending live UAT |
| DA-005 | P1       | `routeLocked` badge displayed; edit/override actions hidden for forwarded tasks; third-party waypoints authoritative; WA-004/WC-005 typecheck passes | ⬜ Pending live UAT |
| DA-006 | P1       | `FIXED_PRICE_IMMUTABLE` error; only proof fields accepted on `fixed_price=true` tasks; WC-005                                                        | ⬜ Pending live UAT |
| DA-007 | P1       | `MIN_PHOTO_COUNT_NOT_MET` error; proof validation guard; proof_status remains pending                                                                | ⬜ Pending live UAT |
| DA-008 | P1       | `PROOF_REQUIRED` error for `signoff_required=true` contracts; enterprise dispatch proof guard                                                        | ⬜ Pending live UAT |
| DA-009 | P1       | `EXPENSE_PROOF_REQUIRED` for airport transfer contracts; proof guard by contract rule                                                                | ⬜ Pending live UAT |
| DA-010 | P1       | Per-platform online/offline toggle; `driver_work_state` transitions via correct API; WC-002 typecheck passes                                         | ⬜ Pending live UAT |
| DA-011 | P2       | Token expiry countdown in `Xd Yh` format; urgency indicator; WC-002                                                                                  | ⬜ Pending live UAT |
| DA-012 | P1       | Re-auth flow updates token expiry in backend; urgency indicator removed on success; WC-002/WC-003                                                    | ⬜ Pending live UAT |
| DA-013 | P2       | Platform eligibility status (eligible/suspended/pending) displayed; WC-002                                                                           | ⬜ Pending live UAT |
| DA-014 | P2       | Platform bind flow; `active` status on success; WC-003                                                                                               | ⬜ Pending live UAT |
| DA-015 | P2       | Platform unbind; account removed; forwarded tasks from that platform no longer accepted                                                              | ⬜ Pending live UAT |
| DA-016 | P1       | Earnings by platform (gross/fee/subsidy/net); period toggle (Today/Week/Month); WA-002/WC-004 typecheck passes                                       | ⬜ Pending live UAT |
| DA-017 | P1       | Driver sees only own earnings; cross-driver data isolation enforced in `platform_earnings.service.ts`; auth.policy `driver` realm scope              | ⬜ Pending live UAT |
| DA-018 | P1       | ⏸ **Deferred** — platform-funded discount net isolation requires period-end billing job activation                                                   | ⬜ Deferred         |
| DA-019 | P1       | Trip lifecycle buttons match state transitions; depart/arrived/start/complete sequencing in trip.tsx; WA-004                                         | ⬜ Pending live UAT |
| DA-020 | P3       | Driver settings preferences saved; WB-003                                                                                                            | ⬜ Pending live UAT |
| DA-021 | P1       | Clock-in happy path: `driver_work_state` → `available_*`; attendance record created; WC-002/WB-003                                                   | ⬜ Pending live UAT |
| DA-022 | P1       | `DRIVER_CERT_INVALID` for expired license; `driver_work_state` stays `logged_out`/`ready_offline`; FBP-009                                           | ⬜ Pending live UAT |
| DA-023 | P2       | Incident report during trip; linked to order; work state updated; WB-003                                                                             | ⬜ Pending live UAT |

**Static evidence summary — Driver App P1:**

- 16 of 16 non-deferred P1 scenarios fully static-verified
- DA-018 deferred (billing job dependency; same staging-only activation class as the other §6 job-gated items)
- `PlatformTaskBadge`, `TaskTypeBadge`, `RouteLockedIcon`, `FixedPriceBadge` all confirmed
  via WC-001 typecheck (commit `9f44bb6`)
- Platform presence, token expiry, re-auth, eligibility all confirmed via WC-002 typecheck
  (commit `a2b81cf`)
- Earnings isolation via `platform_earnings.service.ts` auth scope confirmed WA-002

---

### 4.5 End-to-End Cross-Surface Flows (4 scenarios)

**All 4 E2E scenarios are P1.**

| ID      | Description                                 | Surfaces              | Static Evidence                                                                                                                                    | Live Status         |
| ------- | ------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| E2E-001 | Enterprise dispatch full cycle              | Portal + Ops + Driver | All component flows static-verified (TP-001, OC-001/002, DA-002/019); audit chain covers tenant create → dispatch assign → driver accept → billing | ⬜ Pending live UAT |
| E2E-002 | Forwarded order mirror lifecycle            | Driver                | `routeLocked` path verified; no owned `dispatch_assignment` for forwarded tasks (WA-004 scope); external lifecycle preserved                       | ⬜ Pending live UAT |
| E2E-003 | Phone booking to compliance export          | Ops                   | ⏸ **Deferred** — depends on CTI webhook (OC-022) and filing job (OC-024)                                                                           | ⬜ Deferred         |
| E2E-004 | Platform admin creates tenant; tenant books | Admin + Portal + Ops  | PA-001 tenant create → TP-001 booking → OC-001 queue visibility chain static-verified                                                              | ⬜ Pending live UAT |

---

## 5. Scenario Coverage Summary

| Surface        | Total  | P1     | P2     | P3    | P1 Deferred | P1 Static-Verified        |
| -------------- | ------ | ------ | ------ | ----- | ----------- | ------------------------- |
| Tenant Portal  | 29     | 11     | 16     | 2     | 0           | 11 / 11 ✅                |
| Platform Admin | 11     | 3      | 7      | 1     | 0           | 3 / 3 ✅                  |
| Ops Console    | 26     | 14     | 11     | 1     | 2           | 12 / 12 (non-deferred) ✅ |
| Driver App     | 23     | 17     | 5      | 1     | 1           | 16 / 16 (non-deferred) ✅ |
| E2E Flows      | 4      | 4      | —      | —     | 1           | 3 / 3 (non-deferred) ✅   |
| **Total**      | **93** | **49** | **39** | **5** | **4**       | **45 / 45 ✅**            |

---

## 6. Deferred Items Triage

Items requiring live staging environment or external dependencies beyond the current
FBP-013 window:

| Scenario | Priority | Reason for Deferral                                  | Required Evidence                       | Acceptance Condition                           | Sign-off |
| -------- | -------- | ---------------------------------------------------- | --------------------------------------- | ---------------------------------------------- | -------- |
| OC-022   | P2       | Recording-ready callback (CTI webhook)               | Real CTI stub or WE-004-equivalent mock | `recording_pending` flag cleared on receipt    | ⬜       |
| OC-023   | P1       | Month-end regulatory filing package (scheduler)      | Staging scheduler job run evidence      | Package manifest generated; artifact immutable | ⬜       |
| OC-024   | P1       | Recording index export (scheduler + filing job)      | Staging scheduler job run evidence      | Export row includes `call_id` + `recording_id` | ⬜       |
| DA-018   | P1       | Platform-funded discount net isolation (billing job) | Period-end billing job run evidence     | Discount not deducted from driver net          | ⬜       |
| E2E-003  | P1       | Depends on OC-022 + OC-024 (CTI + filing)            | Same as above                           | Full phone booking → compliance export chain   | ⬜       |

**Acceptance threshold for Phase 1 pilot gate:**
All non-deferred P1 scenarios must pass live UAT. The 5 deferred items above include
4 deferred P1 scenarios and 1 deferred P2 scenario; all require formal product owner
sign-off accepting the deferral before the pilot gate is declared complete. These are
the same 5 deferred entries already present in WE-005 (commit `5c9cc4d`), with no new
additions introduced by this pack.

---

## 7. Sign-Off Gate Criteria

### 7.1 Pilot Gate

Required before Pilot A launch:

| Condition                                         | Owner          | Status                                                  |
| ------------------------------------------------- | -------------- | ------------------------------------------------------- |
| PF-1 through PF-7 all green                       | DevOps/Gemini  | ⬜                                                      |
| All non-deferred P1 scenarios pass live UAT       | UAT Lead       | ⬜                                                      |
| Zero open P1 bugs                                 | UAT Lead       | ⬜                                                      |
| Deferred items formally accepted by product owner | Product Owner  | ⬜                                                      |
| FBP-013B smoke evidence approved and finalized    | Codex / Claude | ⬜ Pending — `FBP-013B` is currently in `review`        |
| FBP-013A staging deploy evidence accepted         | Claude / Codex | ⬜ Pending — `FBP-013A` is `blocked` on live deploy fix |

### 7.2 Production Gate

Required before Production Rollout (in addition to pilot gate):

| Condition                                                                         | Owner          | Status |
| --------------------------------------------------------------------------------- | -------------- | ------ |
| Pilot A observation complete (1–3 days)                                           | Ops Lead       | ⬜     |
| Pilot metrics within tolerance (dispatch rate, ETA, SLA breach, invoice variance) | Ops Lead       | ⬜     |
| Month-end billing and filing dry run complete                                     | Finance        | ⬜     |
| Manual rollout matrix ready (tenant/city/module expansion)                        | Platform Admin | ⬜     |
| Rollback owner named and runtime-routing rollback plan confirmed                  | Ops Lead       | ⬜     |

### 7.3 Sign-Off Matrix (to be filled by UAT executor)

| Surface        | UAT Lead | P1 Items Passed | P2 Items Passed | Signed Off | Date |
| -------------- | -------- | --------------- | --------------- | ---------- | ---- |
| Tenant Portal  | —        | ⬜              | ⬜              | ⬜         | —    |
| Platform Admin | —        | ⬜              | ⬜              | ⬜         | —    |
| Ops Console    | —        | ⬜              | ⬜              | ⬜         | —    |
| Driver App     | —        | ⬜              | ⬜              | ⬜         | —    |
| End-to-End     | —        | ⬜              | ⬜              | ⬜         | —    |

**Phase 1 UAT PASS declaration:** All surfaces signed off, zero open P1 bugs,
all deferred items either resolved or formally accepted by product owner.

---

## 8. Known Corrections Applied in This Pack

### 8.1 `/api/admin/flags` IS Implemented

Earlier versions of `docs/03-runbooks/phase1-rollout.md` contained this incorrect
statement:

> "OpenAPI advertises `/api/admin/flags`, but the current API runtime does not yet
> expose that controller."

**Correction (confirmed in FBP-013B):** `/api/admin/flags` **is** implemented:

- Controller: `apps/api/src/modules/feature-flags/feature-flags.controller.ts`
  (`@Controller("admin")`)
- Registration: `FeatureFlagsModule` imported in `apps/api/src/app.module.ts`
- Auth scope: `platform_admin` realm required; audited on toggle

The current `phase1-rollout.md` shared truth already reflects this corrected
implementation status. PA-010 is therefore a **P2 live-UAT scenario**, not a deferred item.

### 8.2 Auth Model — Bootstrap Headers Only

There is no `/api/auth/login` endpoint. Authentication uses `BootstrapAuthGuard`
with `x-actor-type` / `x-actor-id` / `x-realm` / `x-tenant-id` headers.
The checklist's pre-flight "test account creation" requirement (PF-6) resolves to
having the correct S0002 seed UUIDs (§3 of this pack), not credential-based accounts.

The test account table in `phase1-uat-checklist.md` is retained as a reference guide
for which role/surface each UAT actor uses, not as a set of accounts requiring
password-based creation.

### 8.3 PF-7 Owner: Claude (not Codex)

`WE-004` (smoke test suite) is owned by Claude (committed `9a233d1`). The current
checklist shared truth now correctly lists Claude on `PF-7`.

---

## 9. Shared-Truth Alignment For This Reopen Pass

No additional canonical-file edits are required in this reopen pass. This pack is instead
reconciled to the already-corrected shared truth below:

| Document                              | Shared-truth anchor used by this pack                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/04-uat/phase1-uat-scenarios.md` | Tenant Portal production UAT surface is external `tenant-commute-hub`; retired `apps/tenant-portal-web` is frozen-reference only                        |
| `docs/04-uat/phase1-uat-checklist.md` | PF-7 owner is Claude; authoritative priority/deferred math is Tenant Portal `11/16/2`, Ops Console `14/11/1`, Driver App `17/5/1`, deferred tracker = 5 |
| `docs/03-runbooks/phase1-rollout.md`  | `/api/admin/flags` is implemented and registered; manual rollout matrix remains the interim tenant/city/module cutover path                             |

---

## 10. Evidence Chain Traceability

| Evidence layer                          | Source                                                                                                             | Status                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Contract type safety                    | `@drts/contracts` — all UAT scenario types verified                                                                | ✅ Done                                                         |
| API route implementation                | `apps/api/src/modules/` — all non-deferred P1 routes present                                                       | ✅ Done (`FBP-005` through `FBP-012`)                           |
| API client wiring                       | `packages/api-client/src/index.ts` — all required methods exported                                                 | ✅ Done                                                         |
| Tenant production surface alignment     | `docs/04-uat/phase1-uat-scenarios.md` + `FBP-006`/`FBP-007` shared truth                                           | ✅ Done — `tenant-commute-hub` is the only production tenant UI |
| Frontend implementation support in repo | `@drts/platform-admin-web`, `@drts/ops-console-web`, `@drts/driver-app` plus frozen-reference tenant app artifacts | ✅ Done — retired tenant app retained as support evidence only  |
| CI gate                                 | GHA CI pipeline (WE-001, commit `4d7d1bb`)                                                                         | ✅ Done                                                         |
| Docker images                           | 4 images built and verified (WE-002, commit `657a4d3`)                                                             | ✅ Done                                                         |
| Staging deploy scaffold                 | GCP Cloud Run + migration job (WE-003, commit `ff015a9`)                                                           | ✅ Scaffold done; live deploy remediation pending `FBP-013A`    |
| Smoke harness                           | 6 critical-path tests (WE-004, commit `9a233d1`)                                                                   | ✅ Static done; `FBP-013B` evidence pack currently in `review`  |
| UAT scenario pack                       | 93 scenarios across 4 surfaces (WE-005, commit `5c9cc4d`)                                                          | ✅ Done                                                         |
| UAT evidence (this pack)                | Static analysis complete; live slots pending staging                                                               | ✅ Static approved; live execution pending `FBP-013A`           |
| Staging deploy evidence                 | `FBP-013A` (Claude owner, Codex reviewer, currently `blocked`)                                                     | ⬜ Pending                                                      |
| Final synthesis                         | `FBP-013D` (Gemini owner; waits on `FBP-013A`, `FBP-013B`, `FBP-013C`)                                             | ⬜ Pending                                                      |

---

_Static evidence approved. Live UAT execution slots remain open pending `FBP-013A`
staging deploy evidence. Downstream `FBP-013D` may cite this pack for scenario math,
deferred-item triage, and sign-off traceability._

# FBP-014A — Cross-Surface E2E Scenario Matrix and Fixture Scaffold

**Task:** `FBP-014A`  
**Owner:** Codex  
**Reviewer:** Codex2  
**Status:** Ready for review — scaffold complete; final live staging evidence remains with `FBP-014B` after `FBP-013` closeout  
**Created:** 2026-04-16  
**Depends on:** FBP-006 (tenant-commute-hub BFF cutover), FBP-008, FBP-009, FBP-011, FBP-012

---

## 1. Purpose

This document defines the cross-surface E2E scenario matrix for Phase 1. It captures:

1. Which E2E scenarios must be executed and what surface chain each exercises.
2. Which fixtures, seed data, and API routes each scenario uses.
3. The ID continuity chain each scenario must produce (the "stitched evidence chain").
4. Verification points: cross-tenant safety, audit trail, billing confirmation.
5. How the scaffold relates to the existing smoke tests and UAT scenarios.

The E2E scaffold is in `tests/e2e/`. The scenarios operationalize the cross-surface flows
defined in `docs/04-uat/phase1-uat-scenarios.md §5 (E2E-001 through E2E-004)` plus the
partner cutover authority flow added by `E2E-008`.

> **Relationship to smoke tests:** `tests/smoke/` verifies individual API surfaces in isolation.
> `tests/e2e/` chains surfaces together in a single stateful run, tracking ID continuity across
> the booking → dispatch → driver → billing/audit chain.

---

## 2. Architecture and Guardrails

The following constraints apply to the entire E2E suite (from FBP-014 guardrails):

| #   | Guardrail                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Tenant surface entry point is **`tenant-commute-hub`** (external repo, backed by `/api/tenant/*`). The retired `apps/tenant-portal-web` must not be used.      |
| G2  | Repo B remains a pure UI consumer — no Supabase, edge functions, local authority, or local financial truth.                                                    |
| G3  | All API calls use canonical `/api/*` prefix, `snake_case`, `{ data, meta }` envelope, `items[] + page_info` for lists, and `Idempotency-Key` on POST commands. |
| G4  | Primary happy path is the owned **enterprise-dispatch** flow (E2E-001). E2E-002 (forwarded order) is a separate mirror scenario.                               |
| G5  | Billing and audit remain **backend-owned**. No local calculations or UI assumptions.                                                                           |
| G6  | Cross-tenant safety is part of the definition of done. E2E-004 explicitly tests it.                                                                            |
| G7  | If the suite discovers a real gap after FBP-006, the fix belongs in a new authority/evidence task — not in a local `tenant-commute-hub` workaround.            |

---

## 3. Seed Data

All scenarios use the demo operational seed (`infra/seeds/S0002__demo_operational_seed.sql`) by default.

| Seed ID           | UUID                                   | Description             |
| ----------------- | -------------------------------------- | ----------------------- |
| `TEN_ACME`        | `10000000-0000-0000-0000-000000000201` | Primary test tenant     |
| `DRIVER_ZHANG`    | `10000000-0000-0000-0000-000000000381` | 張司機 — seed driver    |
| `VEHICLE_ABC1234` | `10000000-0000-0000-0000-000000000351` | ABC-1234 — seed vehicle |

Environment variable overrides: `E2E_SEED_TENANT_ID`, `E2E_SEED_DRIVER_ID`, `E2E_SEED_VEHICLE_ID`.

---

## 4. Scenario Matrix

### 4.1 E2E-001 — Enterprise Dispatch Full Cycle

**Script:** `tests/e2e/E2E-001-enterprise-dispatch.sh`  
**UAT cross-ref:** `docs/04-uat/phase1-uat-scenarios.md §5 E2E-001`

#### Surface Chain

```
Tenant Portal ─► Ops Console ─► Driver App ─► Tenant Portal (billing) ─► Audit
```

#### Leg Breakdown

| Leg | Surface       | Actor                     | API Route                                   | Output             |
| --- | ------------- | ------------------------- | ------------------------------------------- | ------------------ |
| 1   | Tenant Portal | `tenant_admin` (TEN_ACME) | `POST /api/tenant/bookings`                 | `bookingId`        |
| 1   | Tenant Portal | `tenant_admin`            | `GET /api/tenant/bookings/:bookingId`       | booking read-back  |
| 2   | Ops Console   | `platform_admin`          | `GET /api/dispatch/tasks`                   | `dispatchJobId`    |
| 2   | Ops Console   | `platform_admin`          | `GET /api/dispatch/tasks/:id/candidates`    | candidate list     |
| 2   | Ops Console   | `platform_admin`          | `POST /api/dispatch/assign`                 | `taskId`           |
| 3   | Driver App    | `driver_user`             | `GET /api/driver/tasks`                     | task list          |
| 3   | Driver App    | `driver_user`             | `POST /api/driver/tasks/:id/accept`         | accepted           |
| 3   | Driver App    | `driver_user`             | `POST /api/driver/tasks/:id/depart`         | departed           |
| 3   | Driver App    | `driver_user`             | `POST /api/driver/tasks/:id/arrived_pickup` | arrived            |
| 3   | Driver App    | `driver_user`             | `POST /api/driver/tasks/:id/start`          | started            |
| 3   | Driver App    | `driver_user`             | `POST /api/driver/tasks/:id/complete`       | completed          |
| 4   | Tenant Portal | `tenant_admin`            | `GET /api/tenant/bookings/:bookingId`       | `completed` status |
| 4   | Billing       | `tenant_admin`            | `POST /api/tenant/invoices/generate`        | `invoiceId`        |
| 4   | Billing       | `tenant_admin`            | `GET /api/tenant/invoices/:invoiceId`       | invoice body       |
| 4   | Audit         | `platform_admin`          | `GET /api/audit`                            | audit entry count  |

#### ID Continuity Chain

```
bookingId (tenant) ──► dispatchJobId (ops) ──► taskId (driver) ──► invoiceId (billing)
```

#### Fixtures Used

| Fixture                      | File                                                |
| ---------------------------- | --------------------------------------------------- |
| Enterprise dispatch booking  | `tests/e2e/fixtures/e2e-booking-enterprise.json`    |
| Dispatch assignment          | `tests/e2e/fixtures/e2e-dispatch-assign.json`       |
| Driver accept                | `tests/e2e/fixtures/e2e-driver-accept.json`         |
| Driver depart                | `tests/e2e/fixtures/e2e-driver-depart.json`         |
| Driver arrived pickup        | `tests/e2e/fixtures/e2e-driver-arrived-pickup.json` |
| Driver start                 | `tests/e2e/fixtures/e2e-driver-start.json`          |
| Driver complete with signoff | `tests/e2e/fixtures/e2e-driver-complete.json`       |

#### Pass Criteria

1. `bookingId` captured and same value readable from tenant booking list.
2. `dispatchJobId` found in ops dispatch queue (gracefully skippable on empty DB).
3. Driver task transitions all return `200|201`.
4. Task status is `accepted` after accept call.
5. `invoiceId` generated and retrievable.
6. Audit log returns ≥ 1 entry.
7. All chain assertions pass: `tenant.bookingId`, `ops.dispatchJobId`, `driver.taskId`, `billing.invoiceId`.

---

### 4.2 E2E-002 — Forwarded Order Mirror Lifecycle

**Script:** `tests/e2e/E2E-002-forwarded-order.sh`  
**UAT cross-ref:** `docs/04-uat/phase1-uat-scenarios.md §5 E2E-002`

#### Surface Chain

```
Driver App (visibility) ──► Driver App (accept) ──► Ops Console (no-owned-assignment check)
```

#### Leg Breakdown

| Leg | Surface     | Actor            | API Route                               | Assertion                                       |
| --- | ----------- | ---------------- | --------------------------------------- | ----------------------------------------------- |
| 1   | Driver App  | `driver_user`    | `GET /api/driver/tasks`                 | Find task with `routeLocked=true`               |
| 2   | Driver App  | `driver_user`    | `GET /api/driver/tasks/:taskId`         | Verify `routeLocked`, `sourcePlatform`          |
| 3   | Driver App  | `driver_user`    | `POST /api/driver/tasks/:taskId/accept` | Accept succeeds                                 |
| 4   | Ops Console | `platform_admin` | `GET /api/dispatch/tasks`               | No owned dispatch_assignment for forwarded task |

#### Pass Criteria

1. `routeLocked=true` on the forwarded task.
2. `sourcePlatform` present and not null.
3. Accept call succeeds.
4. No owned `dispatch_assignment` with the forwarded task's ID in ops dispatch queue.
5. **Graceful skip** when no forwarded task seed data is present.

#### Notes

This scenario is environment-dependent: it requires a seeded forwarded task or a live external
platform adapter. In dry-run / staging-without-adapters it will warn and exit 0 (skip), not fail.
Treat this as `EXTERNAL-GATED` until that seed or adapter evidence is attached.

---

### 4.3 E2E-003 — Phone Booking to Compliance Export _(manual only in scaffold)_

**UAT cross-ref:** `docs/04-uat/phase1-uat-scenarios.md §5 E2E-003`

This scenario requires a live CTI session (`call_id`) and a recording callback webhook. It is
**not automated in the scaffold** because both dependencies are environment-gated (external CTI
environment or stub). It is covered by the WE-004 smoke harness guidance and the UAT checklist
pending items (`OC-021`, `OC-022`, `OC-024`).
Treat this as `DEFERRED` until CTI callback plus filing / recording export evidence is attached.
The exact activation evidence is tracked in
`support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md` as
`EXT-004-BLK-001` to `EXT-004-BLK-008`.

**Manual steps** (reference only):

1. Ops agent creates phone booking via `POST /api/call-center/orders` with `call_id`.
2. Recording callback delivers `recording_id` via webhook.
3. Driver completes trip with proof.
4. Export includes `call_id` + `recording_id` row.

---

### 4.4 E2E-004 — Tenant Attribution and Cross-Tenant Safety

**Script:** `tests/e2e/E2E-004-tenant-attribution.sh`  
**UAT cross-ref:** `docs/04-uat/phase1-uat-scenarios.md §5 E2E-004`

#### Surface Chain

```
Platform Admin (tenant create) ──► Tenant Portal (new tenant books) ──► Ops Console (attribution check) ──► Tenant Portal (cross-tenant safety)
```

#### Leg Breakdown

| Leg | Surface        | Actor                       | API Route                          | Assertion                                       |
| --- | -------------- | --------------------------- | ---------------------------------- | ----------------------------------------------- |
| 1   | Platform Admin | `platform_admin`            | `POST /api/platform-admin/tenants` | `newTenantId` captured                          |
| 1   | Platform Admin | `platform_admin`            | `GET /api/platform-admin/tenants`  | New tenant visible in list                      |
| 2   | Tenant Portal  | `tenant_admin` (new tenant) | `POST /api/tenant/bookings`        | `bookingId2` under new tenantId                 |
| 2   | Tenant Portal  | `tenant_admin` (new tenant) | `GET /api/tenant/bookings`         | New tenant sees own booking                     |
| 3   | Ops Console    | `platform_admin`            | `GET /api/dispatch/tasks`          | Dispatch job has correct `tenantId` attribution |
| 4   | Tenant Portal  | `tenant_admin` (TEN_ACME)   | `GET /api/tenant/bookings`         | `bookingId2` NOT present (no cross-tenant leak) |

#### ID Continuity Chain

```
newTenantId (platform_admin) ──► bookingId2 (tenant_newco) ──► [cross-tenant safety: absent from TEN_ACME view]
```

#### Fixtures Used

| Fixture                     | File                                             |
| --------------------------- | ------------------------------------------------ |
| Tenant create               | `tests/e2e/fixtures/e2e-tenant-create.json`      |
| Enterprise dispatch booking | `tests/e2e/fixtures/e2e-booking-enterprise.json` |

#### Pass Criteria

1. New tenant created; `newTenantId` non-empty.
2. New tenant admin can create a booking.
3. Dispatch queue shows job with correct `tenantId` (or warns if async propagation delay).
4. **CRITICAL:** TEN_ACME booking list does NOT contain `bookingId2`. Exit 1 on cross-tenant leak.

---

### 4.5 E2E-005 — Tenant Governance Negative-Path Pack

**Script:** `tests/e2e/E2E-005-tenant-governance.sh`  
**Companion integration suite:** `tests/integ/tenant-governance-negative.test.ts`

This scenario packs the Phase 1 tenant-governance negative cases into one
live/API harness, while the integration companion provides deterministic
time-control and in-memory rollback assertions that cannot be forced safely on
shared staging.

#### Surface Chain

```
Tenant Console (setup + booking/update/approval) ─► Platform Admin / Ops (dispatch denial + governance summary) ─► Audit
```

#### Negative Scenario Matrix

| Case | Negative path                             | Primary route(s)                                                                                     | Live assertion                                                                 | Audit evidence                                        |
| ---- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| A    | unknown cost center                       | `POST /api/tenant/bookings`                                                                          | `400 BOOKING_COST_CENTER_UNKNOWN`                                              | `booking.cost_center.validation_rejected`             |
| B    | disabled cost center                      | `POST /api/tenant/cost-centers/disable`, `POST /api/tenant/bookings`                                 | `400 BOOKING_COST_CENTER_DISABLED`                                             | `booking.cost_center.validation_rejected`             |
| C    | cross-tenant cost center                  | `POST /api/platform-admin/tenants`, `POST /api/tenant/cost-centers`, `POST /api/tenant/bookings`     | caller tenant sees `400 BOOKING_COST_CENTER_UNKNOWN` for another tenant's code | `booking.cost_center.validation_rejected`             |
| D    | quota_insufficient                        | `POST /api/tenant/quotas/policies`, `POST /api/tenant/bookings`                                      | `409 QUOTA_INSUFFICIENT_AT_COMMIT`, no booking success response                | `tenant.quota_reservation.blocked`                    |
| E    | rule block                                | `POST /api/tenant/approval-rules`, `POST /api/tenant/bookings`, `POST /api/orders/:orderId/dispatch` | booking read-back shows `approvalState=blocked`; dispatch denied               | `booking.approval_state.changed`                      |
| F    | no approver rollback                      | `POST /api/tenant/approval-rules`, `POST /api/tenant/bookings`, `GET /api/tenant/quotas/ledger`      | `409 APPROVAL_NO_RESOLVABLE_APPROVERS`; ledger count unchanged                 | `booking.approval_rules.evaluated`                    |
| G    | governance-sensitive update re-evaluation | `PUT /api/tenant/bookings/:bookingId`                                                                | approval request ID rotates after cost-center update                           | `booking.approval_request.cancelled_by_re_evaluation` |
| H    | notes-only no re-evaluation               | `PUT /api/tenant/bookings/:bookingId`                                                                | approval request ID unchanged after notes-only update                          | request continuity captured in evidence log           |
| I    | rejected booking does not dispatch        | `POST /api/tenant/approval-requests/:id/reject`, `POST /api/orders/:orderId/dispatch`                | `409 BOOKING_APPROVAL_PENDING` after rejection                                 | `booking.approval_request.rejected`                   |
| J    | SLA escalation visible                    | `POST /api/tenant/approval-requests/:id/escalate`, `GET /api/admin/tenant-governance/summary`        | escalated request remains visible in governance summary pending counts         | `booking.approval_request.timeout_escalated`          |

#### Pass Criteria

1. Cases A through J either pass live or explicitly record a bounded environmental skip reason in the evidence log.
2. Every failing API path preserves a machine-readable audit trail; the script records the matched `auditId` in `E2E_EVIDENCE_FILE`.
3. The no-approver case must not increase quota-ledger count for its isolated cost center.
4. Governance-sensitive field changes rotate approval requests; notes-only changes do not.
5. A rejected booking or a rule-blocked booking cannot be dispatched.
6. Manual escalation remains visible on the governance surface even without a time-travelled 48h SLA breach.

#### Notes

- The companion integration suite is authoritative for the deterministic
  48-hour SLA-age alert (`pending_approval_over_48h`) because live E2E cannot
  safely time-travel shared environments.
- `E2E-005` writes temporary JSON payloads at runtime instead of adding new
  fixture files to `tests/e2e/fixtures/`.

#### Verification Snapshot

- `pnpm --filter @drts/api test:tenant-governance-negative`
- `bash -n tests/e2e/E2E-005-tenant-governance.sh`
- `bash tests/e2e/run-e2e.sh --suite 005 --dry-run`

---

## 5. Fixture Inventory

| Fixture File                     | Used By                          | Description                                                       |
| -------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| `e2e-booking-enterprise.json`    | E2E-001, E2E-004                 | `enterprise_dispatch` booking with `__RESERVATION_*__` timestamps |
| `e2e-booking-airport.json`       | E2E-007, reserved for E2E-003    | `credit_card_airport_transfer` booking                            |
| `e2e-dispatch-assign.json`       | E2E-001                          | Dispatch assign body with `__*__` placeholders                    |
| `e2e-driver-accept.json`         | E2E-001, E2E-002, E2E-007        | Driver task accept with `__ACCEPTED_AT__`                         |
| `e2e-driver-depart.json`         | E2E-001, E2E-007                 | Driver depart pickup with `__DEPARTED_AT__`                       |
| `e2e-driver-arrived-pickup.json` | E2E-001, E2E-007                 | Driver arrived at pickup with `__ARRIVED_AT__`                    |
| `e2e-driver-start.json`          | E2E-001, E2E-007                 | Driver trip start with `__STARTED_AT__`                           |
| `e2e-driver-complete.json`       | E2E-001, E2E-007                 | Driver task complete with signoff                                 |
| `e2e-tenant-create.json`         | E2E-004                          | Platform-admin tenant create with `__TENANT_CODE__`               |
| `e2e-booking-airport.json`       | E2E-008, reserved for E2E-003    | Partner / airport-transfer booking with partner linkage fields    |
| `e2e-phone-booking.json`         | Reserved (E2E-003 manual flow)   | Phone booking payload stub for future CTI-backed automation       |
| `e2e-report-compliance.json`     | Reserved (E2E-003 manual flow)   | Compliance export payload stub for future report validation       |
| `e2e-tenant-module-enable.json`  | Reserved (future expansion)      | Tenant module-enable payload stub for future staged cutovers      |

All `__PLACEHOLDER__` values are replaced at runtime by the scenario scripts before the fixture
is passed to curl.

---

## 6. Running the E2E Suite

```bash
# Against local dev (default)
./tests/e2e/run-e2e.sh

# Against staging
export E2E_API_URL=https://api-staging.drts.internal   # bare origin, no /api suffix
./tests/e2e/run-e2e.sh

# Run a single scenario
./tests/e2e/run-e2e.sh --suite 001

# Run multiple scenarios
./tests/e2e/run-e2e.sh --suite 001,004,008

# Dry-run: list scenarios without executing
./tests/e2e/run-e2e.sh --dry-run

# Verbose output (show all scenario output, not just failures)
./tests/e2e/run-e2e.sh --verbose
```

### Auth model

The E2E suite uses the same staged auth model as the smoke tests: IAP Bearer token for the protected outer boundary, plus phased inner bootstrap headers for the application actor identity. No login endpoint exists.
`tests/e2e/lib/helpers.sh` auto-derives the `x-realm` header from the actor type. Each scenario
calls `switch_actor TYPE ID [TENANT_ID]` to change the active actor between surface legs.

### Graceful skip rules

- **E2E-001 legs 2–4:** skipped (exit 0 with warning) when staging DB has no open dispatch jobs.
  This is expected when testing against a fresh staging environment with no booking seed propagated.
- **E2E-002:** skipped (exit 0 with warning) when no forwarded task is present in driver task list.
- **E2E-006:** skipped (exit 0 with warning) when the driver task list does not contain both an owned task and a forwarded task.
- **E2E-004:** skipped beyond leg 1 (exit 0 with warning) when `POST /api/platform-admin/tenants`
  does not return a `tenantId` in its response.
- **E2E-008:** skipped (exit 0 with warning) when `PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT`
  is not configured for the seeded partner entry.

---

## 7. Evidence Capture

Each scenario writes to a shared evidence log (`/tmp/drts-e2e-evidence-<RUN_ID>.log`) and
a chain file (`/tmp/drts-e2e-chain-<RUN_ID>.json`). The runner prints both at the end of the run.

For rollout-grade closeout evidence (FBP-014B), the run must be executed against live staging
and the evidence log must be committed alongside the FBP-014B evidence pack.

Minimum evidence items required for each scenario:

| Scenario | Required Evidence Items                                                     |
| -------- | --------------------------------------------------------------------------- |
| E2E-001  | `bookingId`, `dispatchJobId`, `taskId`, `invoiceId`, `auditEntryCount`      |
| E2E-002  | `forwardedTaskId`, `routeLocked`, `sourcePlatform`, `taskStatusAfterAccept` |
| E2E-004  | `newTenantId`, `bookingId` (new tenant), `crossTenantLeakDetected=false`    |
| E2E-008  | `inactiveBootstrapCode`, `eligibilityVerificationId`, `bookingId`, `receiptOwner`, `invoiceId` |

---

## 8. Relationship to Upstream Tasks

| Task     | Status      | Relationship                                                                             |
| -------- | ----------- | ---------------------------------------------------------------------------------------- |
| FBP-006  | done        | Establishes `tenant-commute-hub` BFF routes used as E2E entry points                     |
| FBP-007  | done        | Retires `apps/tenant-portal-web` — E2E must not use it                                   |
| FBP-008  | done        | Platform Admin control-plane routes used in E2E-004                                      |
| FBP-009  | done        | Ops Console dispatch routes used in E2E-001 / E2E-004                                    |
| FBP-011  | done        | Finance / billing routes used in E2E-001 leg 4                                           |
| FBP-012  | done        | Regulatory / reporting routes (available for future E2E-003 expansion)                   |
| FBP-013  | in_progress | Staging evidence closeout; E2E-001/004 count as rollout-grade only after FBP-013 closes  |
| FBP-014B | todo        | Blocked on FBP-013 + FBP-014A; will execute live integrated evidence run against staging |

---

## 9. Acceptance Criteria (FBP-014A)

- [x] **AC-1:** `tests/e2e/lib/helpers.sh` exists with `switch_actor`, `chain_set/get`, `assert_chain`, `save_evidence`, shared `http_call`, and canonical command headers on write calls.
- [x] **AC-2:** `tests/e2e/E2E-001-enterprise-dispatch.sh` exercises all 4 surface legs (tenant booking, ops dispatch assign, driver lifecycle, billing+audit) and captures the full ID continuity chain.
- [x] **AC-3:** `tests/e2e/E2E-002-forwarded-order.sh` verifies `routeLocked` metadata and absence of owned dispatch_assignment, with graceful skip when no forwarded task is seeded.
- [x] **AC-4:** `tests/e2e/E2E-004-tenant-attribution.sh` verifies correct `tenantId` attribution and **hard-fails on cross-tenant leak**.
- [x] **AC-5:** `tests/e2e/run-e2e.sh` runs all scenarios, emits pass/fail summary, and prints the evidence log.
- [x] **AC-6:** Fixtures cover all automated scenario legs plus reserved manual-expansion payloads under `tests/e2e/fixtures/`.
- [x] **AC-7:** This matrix document maps each scenario to its surface chain, fixtures, ID chain, and pass criteria.
- [x] **AC-8:** No scenario uses retired `apps/tenant-portal-web` routes or repo-B local authority paths.

### Verification Snapshot

- `bash -n tests/e2e/lib/helpers.sh tests/e2e/E2E-001-enterprise-dispatch.sh tests/e2e/E2E-002-forwarded-order.sh tests/e2e/E2E-004-tenant-attribution.sh tests/e2e/E2E-006-driver-multi-platform.sh tests/e2e/run-e2e.sh`
- `./tests/e2e/run-e2e.sh --dry-run`

---

_End of FBP-014A E2E matrix. Final integrated evidence run is the job of FBP-014B after FBP-013 closes._

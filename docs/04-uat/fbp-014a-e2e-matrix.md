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
Ops Console (sandbox mirror) ──► Driver App (visibility + accept) ──► Ops Console (status sync + cancel) ──► Finance/Ops (settlement row + no-owned-assignment)
```

#### Leg Breakdown

| Leg | Surface       | Actor            | API Route                                          | Assertion                                                            |
| --- | ------------- | ---------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Ops Console   | `platform_admin` | `POST /api/forwarder/orders/inbound`               | Create deterministic `forwarder_sandbox` mirror order                |
| 1   | Ops Console   | `platform_admin` | `POST /api/forwarder/orders/:orderId/broadcast`    | Mirror is broadcast to seeded local driver                           |
| 1   | Ops Console   | `platform_admin` | `GET /api/forwarder/orders`                        | Mirror row visible with `status=broadcasted`                         |
| 2   | Driver App    | `driver_user`    | `GET /api/driver/task-views`                       | Sandbox forwarded task visible to the seeded driver                  |
| 2   | Driver App    | `driver_user`    | `GET /api/driver/task-views/:taskId`               | Verify `routeLocked`, `sourcePlatform`, and action state             |
| 3   | Driver App    | `driver_user`    | `POST /api/driver/forwarded-orders/:taskId/accept` | Accept relay returns `accept_pending`                                |
| 3   | Ops Console   | `platform_admin` | `POST /api/forwarder/orders/:orderId/sync-status`  | Sync to `confirmed_by_platform`, then `completed`                    |
| 3   | Driver App    | `driver_user`    | `GET /api/driver/task-views/:taskId`               | Driver view reflects `confirmed_by_platform` then `completed_synced` |
| 4   | Ops Console   | `platform_admin` | `POST /api/forwarder/orders/:orderId/sync-status`  | Second sandbox order syncs to `cancelled_by_platform`                |
| 4   | Driver App    | `driver_user`    | `GET /api/driver/task-views/:taskId`               | Driver view reflects cancelled mirror state                          |
| 5   | Finance / Ops | `platform_admin` | `GET /api/settlement/matrix`                       | `forwarded_shadow` row remains `shadow_only`                         |
| 5   | Ops Console   | `platform_admin` | `GET /api/dispatch/tasks`                          | No owned dispatch_assignment for either sandbox mirror               |

#### Pass Criteria

1. Sandbox inbound order yields a non-empty `mirrorOrderId` and becomes `broadcasted`.
2. Driver sees the sandbox forwarded task with `routeLocked=true` and `sourcePlatform=forwarder_sandbox`.
3. Accept relay succeeds with `outcome=accept_pending`.
4. Status sync advances the primary mirror to `confirmed_by_platform` and then `completed_synced`, both reflected in driver task views.
5. A second sandbox mirror can be accepted and later reflected as `cancelled_by_platform`.
6. Settlement matrix exposes the canonical `forwarded_shadow` row with `localLedgerMode=shadow_only`.
7. No owned `dispatch_assignment` exists for either sandbox mirror.

#### Notes

This scenario now uses the `forwarder_sandbox` provider from `FWD-SBX-001`.
It is deterministic and executable without partner credentials, but it remains
**sandbox evidence only**. Do not restate it as live Grab Taiwan or other
partner-adapter proof.

---

### 4.3 E2E-003 — Phone Recording Filing _(sandbox-proven automation)_

**UAT cross-ref:** `docs/04-uat/phase1-uat-scenarios.md §5 E2E-003`

This scenario is now automated by
`tests/e2e/E2E-003-phone-recording-filing.sh` against the repo-local sandbox
authority. It proves the end-to-end chain for call session creation, phone
order linkage, `recording_pending` to `ready` transition, dispatch recording
index export, filing package generation, retention-policy lookup, and audited
signed-download issuance.

This is still **not** a claim that live CTI/provider media, staging scheduler
activation, or external retention execution are closed. Those activation gates
remain tracked in `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md`
as `EXT-004-BLK-001` to `EXT-004-BLK-008`.

**Automated steps**:

1. Ops agent opens `POST /api/callcenter/sessions`, captures `callId`.
2. Ops agent creates `POST /api/call-center/orders` from that call, order stays `recording_pending`.
3. Recording callback binds `recording_id` via `POST /api/callcenter/sessions/:callId/recording-callback`.
4. Order and session both clear `recording_pending` and move to recording-bound / ready state.
5. `POST /api/reports/jobs` exports `dispatch_recording_index`; row includes masked call/recording refs.
6. `POST /api/filing-packages/generate` yields immutable manifest plus signed ZIP/PDF downloads.
7. `GET /api/audit/evidence-policies/*` and `GET /api/audit` prove retention metadata and audited issuance.

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

### 4.6 E2E-006 — Driver Multi-Platform Workbench

**Script:** `tests/e2e/E2E-006-driver-multi-platform.sh`
**Workflow family:** `WF-DRV-MP-001`
**Closure driver:** `PH1GC-DRV-MP-001` (E2E hardening) + `PH1GC-DRV-MP-002` (device evidence sidecar)

#### Surface Chain

```
Forwarder sandbox inbound (mixed owned + forwarded seed)
  ─► Driver app inbox (owned task visible alongside forwarded task with sourcePlatform metadata)
  ─► Trip surface (route-locked forwarded task; no owned dispatch assignment created)
  ─► Earnings surface (by-platform earnings split)
```

#### Pass Criteria

1. Default environment (no mixed owned+forwarded seed) **hard-fails** with descriptive exit code — no silent passes.
2. `E2E_ALLOW_MISSING_FORWARDER_SEED=true` is the only way to warning-skip; without it, missing seed is a release blocker.
3. Seeded execution asserts:
   - one owned task and one forwarded task present in the same driver inbox
   - forwarded task carries `sourcePlatform` metadata and `routeLocked = true`
   - **no owned dispatch assignment is created for the forwarded task**
   - per-platform earnings split is visible
4. The directive-§C device packet at `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/` (Android + iOS install / signing / push / permission / weak network / forwarded display / earnings) is required to uplift the gate read from sandbox to sandbox + device evidence.

#### ⚠ Risk — warning-skip is not hard proof

Prior to `PH1GC-DRV-MP-001`, `E2E-006` allowed a warning-skip exit-0 on missing seed by default. That behavior is now an opt-in through `E2E_ALLOW_MISSING_FORWARDER_SEED=true`. **Any release closeout that cites `E2E-006` must confirm the deterministic seed mode ran**; a warning-skipped run does not count as `WF-DRV-MP-001` proof.

#### Verification Snapshot

- `bash -n tests/e2e/E2E-006-driver-multi-platform.sh`
- `bash tests/e2e/run-e2e.sh --suite 006 --dry-run`
- (with seed) `bash tests/e2e/E2E-006-driver-multi-platform.sh` exits 0
- (without seed, default) `bash tests/e2e/E2E-006-driver-multi-platform.sh` exits non-zero

---

### 4.7 E2E-007 — Partner Airport Transfer

**Script:** `tests/e2e/E2E-007-partner-airport-transfer.sh`
**Workflow family:** `WF-PARTNER-001` (formerly `WF-PRT-001`; renamed per release-truth runbook §1.2 — no alias)
**Spec:** `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md` (driven by `PH1GC-PARTNER-001`)
**Sandbox evidence:** `support/sidecars/PARTNER-ELIG-LIVE-001/` (driven by `PH1GC-PARTNER-002`)

#### Surface Chain

```
Partner entry page ([tenantSlug]/[entrySlug])
  ─► Eligibility verification (eligible | ineligible | manual_review)
  ─► Authenticated booking (carries eligibilityVerificationId + referenceHash; cardLast4 only)
  ─► Driver dispatch → trip → completion
  ─► Receipt / partner record + governance-aware billing row (cross-references WF-FIN-GOV-001)
```

#### Pass Criteria

1. Eligibility verification produces a terminal state (`eligible` / `ineligible` / `manual_review`) within the 2-retry timeout budget per spec §4.3.
2. Refused bookings (ineligible or rejected manual_review) do not enter the billing pipeline.
3. `referenceToken` appears only in masked form (`maskOpaqueToken(value, 8, 4)`) in every persistence boundary.
4. Subsidy line item is applied at billing time per published partner-program pricing (`WF-ADM-001` pricing version).
5. Sandbox uplift requires the 7 directive-§E proof items in `PARTNER-ELIG-LIVE-001/`.

---

### 4.8 E2E-008 — Partner Booking Pilot Cutover Authority

**Script:** `tests/e2e/E2E-008-partner-booking-cutover.sh`
**Workflow family:** `WF-PBK-001`
**Plan:** `docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md` (driven by `PH1GC-PBK-001`)
**Pilot sidecar:** `support/sidecars/PBK-PILOT-001/` (driven by `PH1GC-PBK-001`)

#### Surface Chain

```
Partner entry resolution ([tenantSlug]/[entrySlug])
  ─► Eligibility-bound booking
  ─► Trip + tracking
  ─► Receipt + partner record
  ─► Negative paths + rollback retention proof (≥ 14 calendar days)
```

#### Pass Criteria

1. Partner entry routes resolve with brand + eligibility-mode visible.
2. Cutover proof includes: target slug, cutover owner, rollback owner, rollback route / host, support hotline, branding metadata, eligibility mode, pilot time window, ≥ 14-day rollback retention demonstrated.
3. Repo-local UI coverage alone is NOT pilot evidence; gate-read uplift to `PASS (pilot evidence)` requires a real partner entry cutover.

---

### 4.9 E2E-009 — Production Rail Dry-Run

**Script:** `tests/e2e/E2E-009-prod-rail-dry-run.sh`
**Workflow family:** `WF-PROD-001`
**Closeout driver:** `PH1GC-PROD-001` (live-execution readiness packet)

#### Pass Criteria

1. `.github/workflows/deploy-prod.yml` validates the full graph: validate-config → build-push → migrate → deploy → health-check.
2. Dry-run rehearsal confirms the rail's structure without making external Cloud Run / Cloud SQL calls.
3. Live-execution uplift requires `vars.PROD_GCP_*` + `secrets.PROD_WIF_*` configured in repo Settings, GCP project provisioned (WIF / Cloud SQL / Artifact Registry / Secret Manager), GitHub Environment `production` reviewer rule, and the `PH1GC-PROD-001` rollback drill packet at `support/sidecars/WF-PROD-001-LIVE-EXEC/`.
4. **Non-claim:** dry-run rehearsal is NOT production-launched proof. Do not state otherwise without an actual deploy + rollback drill + monitoring + human approval gate.

---

### 4.10 E2E-010 — Governance-Aware Billing / Reporting

**Script:** `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` (driven by `PH1GC-E2E-010`)
**Workflow family:** `WF-FIN-GOV-001`
**Spec:** `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` (driven by `PH1GC-FIN-GOV-001`)
**UAT:** `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`

#### Surface Chain

```
Tenant Console (cost-center + quota + require_approval rule)
  ─► Tenant Console (governed booking with costCenterCode → pending approval)
  ─► Tenant Console (quota summary + ledger, filtered by bookingId)
  ─► Tenant Console (approval snapshot for the booking)
  ─► Tenant Console (approve approval request as tenant_admin)
  ─► Ops Console (dispatch → candidates → assign vehicle/driver)
  ─► Driver App (accept → depart → arrived_pickup → start → complete)
  ─► Tenant Console (invoice generation for today's UTC window)
  ─► Tenant Console (invoice line MUST carry the governed orderId)
  ─► Tenant / Platform reporting (report job + governance column probe)
  ─► Platform Admin (settlement matrix + platform-earnings by-platform)
  ─► Platform Admin (audit MUST contain generate_tenant_invoice for invoiceId)
  ─► Tenant Console (cost-center coverage / legacy_unmapped probe)
  ─► Tenant Admin (cross-tenant fetch of invoiceId MUST return 4xx)
```

#### Sub-Case Matrix

| Case    | Probe                                                                 | Primary route(s)                                                                                                                                                                                                                                              | Probe outcome                                                                                                                                                                                                                                                                                                              |
| ------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FG-01` | Booking → invoice carries cost-center attribution and binds to the governed `orderId` | `POST /api/tenant/bookings`, `GET /api/tenant/bookings/:id`, `POST /api/tenant/approval-requests/:id/approve`, `POST /api/orders/:orderId/dispatch`, driver accept/depart/arrived_pickup/start/complete, `POST /api/tenant/invoices/generate`, `GET /api/tenant/invoices/:id` | Hard-fails if `costCenter` is dropped from the booking read-back, if the driver lifecycle cannot reach `complete` after dispatch+assign accepted, or if the generated invoice does **not** contain a line whose `orderId` matches the governed booking; records per-line `costCenterCode/Name/ownerUserId/approvalState/activeFlag/legacy_unmapped` presence as soft enrichment evidence |
| `FG-02` | Quota reservation + ledger continuity (filtered by `bookingId`)       | `GET /api/tenant/cost-centers/:code/quota`, `GET /api/tenant/quotas/ledger?costCenterCode=…&bookingId=…`                                                                                                                                                    | Records usage/limit and ledger entry count; missing endpoints recorded as `NOT_POPULATED`                                                                                                                                                                                                                                  |
| `FG-03` | Approval evaluation snapshot + governed approval                      | `GET /api/tenant/approval-requests?bookingId=…`, `POST /api/tenant/approval-requests/:id/approve`                                                                                                                                                           | Records `approvalRequestId`, `state`, `evaluatedAt`, `decision` from the booking's approval request; sets `APPROVED=true` so the dispatch leg can proceed                                                                                                                                                                 |
| `FG-04` | Governance-aware report export                                        | `POST /api/tenant/reports/jobs` (fallback `POST /api/reports/jobs`), `GET /api/(tenant/)reports/:jobId`                                                                                                                                                     | Records presence of `costCenterCode/Name/ownerUserId/approvalState/quotaImpacts/partnerProgramId/legacy_unmapped` in the job row                                                                                                                                                                                          |
| `FG-05` | Partner-program reconciliation references                             | `GET /api/settlement/matrix`                                                                                                                                                                                                                                  | Records partner-row count and any observed `programId`; pairs with invoice-level `partnerId/partnerProgramId` recording                                                                                                                                                                                                    |
| `FG-06` | Platform earnings separation by `platformCode`                        | `GET /api/platform-earnings/by-platform`                                                                                                                                                                                                                      | Records platform item count and joined `platformCode` list                                                                                                                                                                                                                                                                  |
| `FG-07` | Legacy unmapped cost-center labelling                                 | `GET /api/tenant/cost-centers/coverage`                                                                                                                                                                                                                       | Records `totalBookings`, `resolvedCount`, `unresolvedCount`, `disabledHits`, first `unresolvedSamples[]` entry                                                                                                                                                                                                             |
| `FG-08` | Sensitive invoice/report download audit (bound to invoiceId)          | `GET /api/audit`                                                                                                                                                                                                                                              | **Hard-fails** if no audit entry has `actionName == generate_tenant_invoice` and `resourceId == <invoiceId>` — that is the FG-08 audit chain regression named in `FIN-GOV-SPEC-001` §5                                                                                                                                   |
| `FG-09` | Cross-tenant scope on the governed invoice                            | `GET /api/tenant/invoices/:invoiceId` with a probe tenant id distinct from the seed tenant                                                                                                                                                                   | **Hard-fails** if the cross-tenant fetch returns 2xx; expects 4xx (typically 404 NOT_FOUND, per `billing-settlement.service.ts:550-565`)                                                                                                                                                                                  |

#### Pass Criteria

1. Booking creation with `costCenterCode` must round-trip through booking read-back — a dropped cost-center is a hard fail.
2. The approval request for the booking must be approvable as `tenant_admin`; if approval is granted the script drives the driver lifecycle to `complete`. If the environment cannot accept dispatch or assign in the first place, the lifecycle leg is skipped cleanly. If dispatch+assign are accepted but `/driver/tasks/:id/complete` then refuses, that is treated as a WF-DRV-001 coupling regression and hard-fails.
3. The invoice generated for today's UTC window must contain a `lines[*]` entry whose `orderId` matches the just-completed governed booking. A missing line is a hard fail — the prior implementation could pass on unrelated historical invoice data, which the review specifically called out.
4. The audit chain must contain an entry with `actionName == generate_tenant_invoice` and `resourceId == <ourInvoiceId>` (FG-08). A missing audit entry is a hard fail per `FIN-GOV-SPEC-001` §5.
5. A cross-tenant fetch of the governed invoice must return 4xx. A 2xx response is a hard fail (FG-09 tenant-scope widening).
6. Enrichment fields the spec still marks as runtime gaps (`costCenterName`, `ownerUserId`, explicit `approvalState` on invoice/report lines, `legacy_unmapped`, partner/program/platform aggregations) are recorded in `E2E_EVIDENCE_FILE` as either `<value>` or `NOT_POPULATED`, so the field-presence delta is the reviewable evidence as runtime enrichment lands.

#### Notes

- This script is a **shell**: per `FIN-GOV-UAT-001` the live promotion for `WF-FIN-GOV-001` is currently `BLOCKED FOR LIVE`. The script's `record_field` helper marks each unpopulated governance field as `NOT_POPULATED` so the field-presence delta becomes the reviewable evidence as enrichment lands incrementally.
- Hard failures are reserved for contract regressions named in `FIN-GOV-SPEC-001`: cost-center dropped from booking, driver lifecycle cannot reach completion after dispatch accepted, invoice does not include the governed `orderId`, audit chain broken (FG-08), and cross-tenant scope widened (FG-09). All other shape probes are recorded as field-presence evidence so the test does not "pass on unrelated historical invoice data" — a regression flagged in the prior review round and now closed by the orderId-binding rule above.
- Negative-path governance assertions (unknown / disabled / cross-tenant cost centers, rule block, rejected booking, escalation visibility) remain owned by `E2E-005-tenant-governance.sh` and `tests/integ/tenant-governance-negative.test.ts`. The deterministic invoice-line ↔ governed-orderId binding asserted here mirrors `apps/api/tests/integration/tenant-governance-e2e.test.ts:573-579`.

#### Verification Snapshot

- `bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh`
- `bash tests/e2e/run-e2e.sh --suite 010 --dry-run`

---

### 4.11 E2E-011 — Platform Admin Control Plane

**Script:** `tests/e2e/E2E-011-platform-admin-control-plane.sh` (driven by `PH1GC-E2E-011`)
**Workflow family:** `WF-ADM-001`
**UAT:** `docs/04-uat/platform-admin-control-plane-uat-20260519.md` (driven by `PH1GC-ADM-001`)

#### Surface Chain

```
Platform admin login
  ─► Tenant create → module enablement → tenant quotas
  ─► Partner entry → partner credential issue/revoke
  ─► Adapter / switchboard health
  ─► Pricing publish (with version)
  ─► Feature flag toggle
  ─► Rollout stage promotion
  ─► Rollback hold set → blocks production promote
  ─► Audit verification (every mutation produces an audit row)
```

#### Pass Criteria (per `PH1GC-E2E-011` acceptance)

1. All 11 happy-path scenarios from `docs/04-uat/platform-admin-control-plane-uat-20260519.md` §2 pass.
2. ≥ 2 RBAC negative paths verified (e.g., `UAT-ADM-N01` non-admin tenant create blocked, `UAT-ADM-N02` non-admin pricing publish blocked).
3. Pricing publish carries a non-null `version` field.
4. Rollback hold blocks production promote with `production_rollback_hold_active` reason code.
5. Audit log contains an entry for every mutation **and** for every rejected attempt.
6. Hard-fail on missing seed; no silent pass.

---

## 5. Fixture Inventory

| Fixture File                     | Used By                             | Description                                                       |
| -------------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| `e2e-booking-enterprise.json`    | E2E-001, E2E-004                    | `enterprise_dispatch` booking with `__RESERVATION_*__` timestamps |
| `e2e-booking-airport.json`       | (reserved for future E2E expansion) | `credit_card_airport_transfer` booking                            |
| `e2e-dispatch-assign.json`       | E2E-001                             | Dispatch assign body with `__*__` placeholders                    |
| `e2e-driver-accept.json`         | E2E-001, E2E-002                    | Driver task accept with `__ACCEPTED_AT__`                         |
| `e2e-driver-depart.json`         | E2E-001                             | Driver depart pickup with `__DEPARTED_AT__`                       |
| `e2e-driver-arrived-pickup.json` | E2E-001                             | Driver arrived at pickup with `__ARRIVED_AT__`                    |
| `e2e-driver-start.json`          | E2E-001                             | Driver trip start with `__STARTED_AT__`                           |
| `e2e-driver-complete.json`       | E2E-001                             | Driver task complete with signoff                                 |
| `e2e-tenant-create.json`         | E2E-004                             | Platform-admin tenant create with `__TENANT_CODE__`               |
| `e2e-phone-booking.json`         | E2E-003                             | Phone booking payload for call-center order creation              |
| `e2e-report-compliance.json`     | E2E-003                             | Dispatch recording index report-job payload                       |
| `e2e-tenant-module-enable.json`  | Reserved (future expansion)         | Tenant module-enable payload stub for future staged cutovers      |

All `__PLACEHOLDER__` values are replaced at runtime by the scenario scripts before the fixture
is passed to curl.

`E2E-002` now builds its `forwarder_sandbox` inbound / broadcast / accept /
sync payloads as deterministic runtime JSON instead of relying on static fixture
files, so the mirror order IDs remain unique per run.

`E2E-005` and `E2E-010` likewise build their tenant-governance payloads
(cost-center, quota policy, approval rule, governed booking, invoice period,
report job filter) as deterministic runtime JSON under `/tmp/drts-e2e-005-*` /
`/tmp/drts-e2e-010-*` so the suffix-scoped fixtures stay unique per run and
nothing is committed under `tests/e2e/fixtures/`.

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
- **E2E-002:** deterministic via `forwarder_sandbox`; not a live partner-adapter claim.
- **E2E-004:** skipped beyond leg 1 (exit 0 with warning) when `POST /api/platform-admin/tenants`
  does not return a `tenantId` in its response.
- **E2E-006:** since `PH1GC-DRV-MP-001`, default behavior is to **hard-fail** on missing mixed
  owned+forwarded seed. Warning-skip is opt-in via `E2E_ALLOW_MISSING_FORWARDER_SEED=true`.
  A warning-skipped run does **not** count as `WF-DRV-MP-001` release proof — release
  closeouts must confirm the deterministic seed mode ran.
- **E2E-008:** skipped (exit 0 with warning) when `PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT`
  is not configured for the seeded partner entry.
- **E2E-009:** dry-run rehearsal only; live production execution requires `vars.PROD_GCP_*` +
  `secrets.PROD_WIF_*` configured per `PH1GC-PROD-001`. A dry-run pass is NOT a
  production-launched claim.
- **E2E-010, E2E-011:** hard-fail on missing seed by directive design (`PH1GC-E2E-010` /
  `PH1GC-E2E-011` acceptance). No silent-pass paths.

---

## 7. Evidence Capture

Each scenario writes to a shared evidence log (`/tmp/drts-e2e-evidence-<RUN_ID>.log`) and
a chain file (`/tmp/drts-e2e-chain-<RUN_ID>.json`). The runner prints both at the end of the run.

For rollout-grade closeout evidence (FBP-014B), the run must be executed against live staging
and the evidence log must be committed alongside the FBP-014B evidence pack.

Minimum evidence items required for each scenario:

| Scenario | Required Evidence Items                                                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2E-001  | `bookingId`, `dispatchJobId`, `taskId`, `invoiceId`, `auditEntryCount`                                                                                               |
| E2E-002  | `primaryMirrorOrderId`, `forwardedTaskId`, `routeLocked`, `sourcePlatform`, `primaryDriverCompletedStatus`, `secondaryDriverCancelledStatus`, `settlementLedgerMode` |
| E2E-004  | `newTenantId`, `bookingId` (new tenant), `crossTenantLeakDetected=false`                                                                                             |
| E2E-008  | `inactiveBootstrapCode`, `eligibilityVerificationId`, `bookingId`, `receiptOwner`, `invoiceId`                                                                       |
| E2E-010  | `bookingId`, `costCenter`, `orderId`, `approvalState`, `quotaBookingCountUsed`, `approvalRequestId`, `approvalStateAfterApprove`, `completedAt`, `invoiceId`, `invoiceLineForGovernedOrderId`, `lineCostCenterCode`, `lineApprovalState`, `reportJobId`, `platformCodes`, `coverageUnresolvedCount`, `invoiceAuditId`, `crossTenantStatus` — each enrichment field recorded with the literal value or the `NOT_POPULATED` marker, while the orderId/audit/cross-tenant bindings are hard-failed when contract is broken |

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
| FIN-GOV-SPEC-001 | done | Defines the governance-aware billing/reporting field expectations consumed by `E2E-010` |
| FIN-GOV-UAT-001  | done | Defines sub-cases `FG-01`..`FG-09` and the conservative `BLOCKED FOR LIVE` read enforced by the `E2E-010` shell |
| WF-FIN-GOV-001-MATRIX | done | Registers the `WF-FIN-GOV-001` row in the release-gate matrix; `E2E-010` is the companion automated shell |

---

## 9. Acceptance Criteria (FBP-014A)

- [x] **AC-1:** `tests/e2e/lib/helpers.sh` exists with `switch_actor`, `chain_set/get`, `assert_chain`, `save_evidence`, shared `http_call`, and canonical command headers on write calls.
- [x] **AC-2:** `tests/e2e/E2E-001-enterprise-dispatch.sh` exercises all 4 surface legs (tenant booking, ops dispatch assign, driver lifecycle, billing+audit) and captures the full ID continuity chain.
- [x] **AC-3:** `tests/e2e/E2E-002-forwarded-order.sh` verifies sandbox mirror creation, driver visibility, accept/status sync, cancel propagation, forwarded settlement row, and absence of owned dispatch_assignment.
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

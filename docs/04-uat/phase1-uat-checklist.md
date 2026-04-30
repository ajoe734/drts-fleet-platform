# Phase 1 UAT Execution Checklist

**Status:** Baseline execution checklist — final evidence interpretation now lives in `support/sidecars/FBP-013C/FBP-013C-UAT-EVIDENCE-PACK.md` and `support/sidecars/FBP-013D/FBP-013D-FINAL-EVIDENCE-CLOSEOUT.md`
**Owner:** Claude (WE-005 baseline)
**Task:** WE-005 baseline; consumed by `FBP-013C` and `FBP-013D` for final closeout
**Created:** 2026-04-14  
**Scenario source:** `docs/04-uat/phase1-uat-scenarios.md`

This file remains the canonical row-by-row checklist inventory. Use the `FBP-013C` evidence
pack for current deferred-item math, static verification coverage, and sign-off framing, and
use `FBP-013D` for the final release / pilot / production decision read.

---

## How to Use This Checklist

1. Work through each surface section with a test account that has the required role.
2. Mark each row: ✅ Pass / ❌ Fail / ⏸ Deferred / 🔄 Retest
3. For any Fail, open a bug entry with: scenario ID, steps to reproduce, actual result,
   expected result, severity (`P1-Critical` / `P2-Major` / `P3-Minor`).
4. **All P1 items must pass before Phase 1 can ship.**
5. Deferred items require sign-off from the supervisor that the deferral is acceptable.

## Release-Gate Family Map

This checklist is still the row-by-row inventory, but release conclusions should
be read through `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`.

| Workflow family | Checklist rows that feed it                                                       | Negative-path rows (ORX-GV-001)                                        | Primary companion path                                                                           |
| --------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `WF-RLS-001`    | `PF-1` to `PF-7`                                                                  | —                                                                      | `docs/03-runbooks/phase1-rollout.md`, `support/sidecars/FBP-013A/`, `support/sidecars/FBP-013D/` |
| `WF-TEN-001`    | `PA-001`, `TP-029` to `TP-032`, `E2E-004`                                         | `NP-AUTH-001`, `NP-AUTH-002`, `NP-AUTH-003`                            | `tests/e2e/E2E-004-tenant-attribution.sh`                                                        |
| `WF-ORD-001`    | `TP-001` to `TP-006`, `E2E-001`, `E2E-004`                                        | (covered by `TP-002`, `TP-004`, `TP-006`)                              | `tests/smoke/02-booking-create.sh`, `tests/e2e/E2E-001-enterprise-dispatch.sh`                   |
| `WF-DSP-001`    | `OC-001` to `OC-006`, `E2E-001`                                                   | `NP-DSP-001`, `NP-DSP-002`, `NP-DSP-003`, `NP-OVR-001` to `NP-OVR-003` | `tests/smoke/03-dispatch-assign.sh`, `tests/e2e/E2E-001-enterprise-dispatch.sh`                  |
| `WF-DRV-001`    | `DA-001` to `DA-017`, `DA-019`, `DA-021`, `DA-022`, `DA-024`, `DA-025`, `E2E-001` | (covered by `DA-003` to `DA-009`, `DA-022` to `DA-025`)                | `tests/smoke/04-driver-task-accept.sh`, `tests/e2e/E2E-001-enterprise-dispatch.sh`               |
| `WF-FWD-001`    | `DA-005`, `E2E-002`                                                               | `NP-FWD-001`, `NP-FWD-002`, `NP-FWD-003`                               | `tests/e2e/E2E-002-forwarded-order.sh`                                                           |
| `WF-COM-001`    | `OC-021` to `OC-024`, `DA-007` to `DA-009`, `E2E-003`                             | `NP-COM-001`, `NP-COM-002`                                             | manual-only in baseline; live/negative expansion stays explicit                                  |
| `WF-FIN-001`    | `TP-013`, `TP-014`, `TP-021` to `TP-023`, `OC-017`, `OC-025`, `E2E-001`           | `NP-FIN-001` to `NP-FIN-004`                                           | `tests/smoke/05-billing-invoice.sh`, `tests/smoke/06-report-export.sh`                           |

Do not summarize this checklist as "UAT green" without naming the exact
workflow-family gate reads from the release matrix.

---

## Pre-flight

Before starting UAT, confirm:

| #    | Pre-flight check                                                      | Owner  | Status |
| ---- | --------------------------------------------------------------------- | ------ | ------ |
| PF-1 | Staging environment is deployed (WE-003 complete)                     | Gemini | ⬜     |
| PF-2 | CI pipeline green on main (WE-001 ✅)                                 | Codex  | ✅     |
| PF-3 | Docker images built and pushed to registry (WE-002 reviewed)          | Claude | ⬜     |
| PF-4 | DB migrations applied to staging (V0001–V0018)                        | DevOps | ⬜     |
| PF-5 | Seed data loaded: 1 tenant, 2 drivers, 2 vehicles, 1 pricing template | DevOps | ⬜     |
| PF-6 | Test accounts created (see §Test Accounts below)                      | DevOps | ⬜     |
| PF-7 | Smoke suite run and baseline passing (WE-004)                         | Claude | ⬜     |

---

## Test Accounts (minimum required)

| Account                     | Role                     | Surface        |
| --------------------------- | ------------------------ | -------------- |
| `platform_admin@drts.test`  | `platform_admin`         | Platform Admin |
| `tenant_admin@drts.test`    | `tenant_admin`           | Tenant Portal  |
| `tenant_booker@drts.test`   | `tenant_booking_manager` | Tenant Portal  |
| `dispatcher@drts.test`      | `ops_dispatcher`         | Ops Console    |
| `ops_manager@drts.test`     | `ops_manager`            | Ops Console    |
| `driver1@drts.test`         | `driver`                 | Driver App     |
| `driver2@drts.test`         | `driver`                 | Driver App     |
| `complaint_agent@drts.test` | `complaint_specialist`   | Ops Console    |

---

## Surface 1 — Tenant Portal

| ID     | Scenario                                        | Role                     | Priority | Pass/Fail | Notes                                      |
| ------ | ----------------------------------------------- | ------------------------ | -------- | --------- | ------------------------------------------ |
| TP-001 | Enterprise dispatch booking — happy path        | `tenant_booking_manager` | P1       | ⬜        |                                            |
| TP-002 | Booking wizard — address unresolvable           | `tenant_booking_manager` | P1       | ⬜        | Error message: `ADDRESS_UNRESOLVABLE`      |
| TP-003 | Airport transfer booking — happy path           | `tenant_booking_manager` | P1       | ⬜        |                                            |
| TP-004 | Airport pickup — missing flight number          | `tenant_booking_manager` | P1       | ⬜        | Error: `FLIGHT_NO_REQUIRED`                |
| TP-005 | Modify booking before deadline                  | `tenant_booking_manager` | P2       | ⬜        |                                            |
| TP-006 | Modify booking after `modifiable_until`         | `tenant_booking_manager` | P1       | ⬜        | Error: `ORDER_NOT_MODIFIABLE`              |
| TP-007 | Booking list — filter by status                 | `tenant_admin`           | P2       | ⬜        |                                            |
| TP-008 | Cancel booking                                  | `tenant_booking_manager` | P2       | ⬜        | Audit entry written                        |
| TP-009 | Create passenger                                | `tenant_admin`           | P2       | ⬜        |                                            |
| TP-010 | Update passenger name                           | `tenant_admin`           | P3       | ⬜        |                                            |
| TP-011 | Delete passenger                                | `tenant_admin`           | P3       | ⬜        |                                            |
| TP-012 | Create address entry                            | `tenant_admin`           | P2       | ⬜        |                                            |
| TP-013 | Trigger report export                           | `tenant_admin`           | P2       | ⬜        |                                            |
| TP-014 | Download report artifact                        | `tenant_admin`           | P2       | ⬜        | Audit entry written                        |
| TP-015 | Issue API key — shown once                      | `tenant_admin`           | P1       | ⬜        | Plaintext only on first view               |
| TP-016 | Rotate API key                                  | `tenant_admin`           | P1       | ⬜        | Old key invalidated                        |
| TP-017 | Revoke API key                                  | `tenant_admin`           | P1       | ⬜        |                                            |
| TP-018 | Create webhook endpoint                         | `tenant_admin`           | P2       | ⬜        |                                            |
| TP-019 | Webhook secret rotation                         | `tenant_admin`           | P1       | ⬜        | New deliveries use new secret              |
| TP-020 | View webhook delivery log                       | `tenant_admin`           | P2       | ⬜        |                                            |
| TP-021 | View billing profile                            | `tenant_admin`           | P2       | ⬜        |                                            |
| TP-022 | View invoice list                               | `tenant_admin`           | P2       | ⬜        |                                            |
| TP-023 | Download invoice PDF                            | `tenant_admin`           | P1       | ⬜        | Amount: `amountMinor/100`, currency prefix |
| TP-024 | Update notification preferences                 | `tenant_admin`           | P2       | ⬜        |                                            |
| TP-025 | View and update SLA profile                     | `tenant_admin`           | P2       | ⬜        |                                            |
| TP-026 | Invite tenant user                              | `tenant_admin`           | P2       | ⬜        |                                            |
| TP-027 | Change user role                                | `tenant_admin`           | P2       | ⬜        | Audit entry written                        |
| TP-028 | View audit trail (tenant scope)                 | `tenant_admin`           | P2       | ⬜        | Only own tenant events visible             |
| TP-029 | RBAC — tenant admin blocked from pricing engine | `tenant_admin`           | P1       | ⬜        | `403 Forbidden`                            |
| TP-030 | Tenant bootstrap rejects wrong tenant scope     | `tenant_admin`           | P1       | ⬜        | `TENANT_SCOPE_MISMATCH`; no session issued |
| TP-031 | Suspended tenant user cannot bootstrap session  | `tenant_admin`           | P1       | ⬜        | `TENANT_USER_SUSPENDED`                    |
| TP-032 | Inactive partner entry cannot bootstrap         | `partner_api_client`     | P1       | ⬜        | `PARTNER_ENTRY_INACTIVE`; audit written    |

**Tenant Portal P1 pass gate:** TP-001, TP-002, TP-003, TP-004, TP-006, TP-015, TP-016, TP-017, TP-019, TP-023, TP-029, TP-030, TP-031, TP-032

---

## Surface 2 — Platform Admin

| ID     | Scenario                                     | Role             | Priority | Pass/Fail | Notes                                        |
| ------ | -------------------------------------------- | ---------------- | -------- | --------- | -------------------------------------------- |
| PA-001 | Create tenant                                | `platform_admin` | P1       | ⬜        | Unique `tenant.code` enforced; audit written |
| PA-002 | Edit tenant quotas and modules               | `platform_admin` | P2       | ⬜        |                                              |
| PA-003 | Deactivate tenant                            | `platform_admin` | P2       | ⬜        | Audit written                                |
| PA-004 | Create platform user and assign role         | `platform_admin` | P2       | ⬜        |                                              |
| PA-005 | Roles page — RBAC tiers visible              | `platform_admin` | P2       | ⬜        |                                              |
| PA-006 | View pricing template list                   | `platform_admin` | P2       | ⬜        |                                              |
| PA-007 | Pricing write is audited (version published) | `platform_admin` | P1       | ⬜        | old/new version in audit                     |
| PA-008 | Health dashboard                             | `platform_admin` | P3       | ⬜        | May use simulated data                       |
| PA-009 | Platform-level audit trail                   | `platform_admin` | P1       | ⬜        | High-sensitivity events present              |
| PA-010 | Feature flag toggle                          | `platform_admin` | P2       | ⬜        | Audit written                                |
| PA-011 | View payment records                         | `platform_admin` | P2       | ⬜        |                                              |

**Platform Admin P1 pass gate:** PA-001, PA-007, PA-009

---

## Surface 3 — Ops Console

| ID     | Scenario                                             | Role                   | Priority | Pass/Fail | Notes                                      |
| ------ | ---------------------------------------------------- | ---------------------- | -------- | --------- | ------------------------------------------ |
| OC-001 | Dispatch queue visible — correct columns             | `ops_dispatcher`       | P1       | ⬜        | `exception_hold` orders distinguished      |
| OC-002 | Assign driver to ready-for-dispatch order            | `ops_dispatcher`       | P1       | ⬜        | Trace log appended                         |
| OC-003 | Reassign assigned order                              | `ops_dispatcher`       | P1       | ⬜        | Old assignment preserved                   |
| OC-004 | Release assignment                                   | `ops_dispatcher`       | P2       | ⬜        |                                            |
| OC-005 | Handle exception_hold order                          | `ops_dispatcher`       | P1       | ⬜        | SLA notification if configured             |
| OC-006 | Dispatch fails — no eligible supply                  | `ops_dispatcher`       | P1       | ⬜        | No fake ETA returned                       |
| OC-007 | Create incident                                      | `ops_manager`          | P2       | ⬜        |                                            |
| OC-008 | Update incident status                               | `ops_manager`          | P2       | ⬜        | Audit written                              |
| OC-009 | Incident ≠ complaint case (conceptual guard)         | `ops_manager`          | P1       | ⬜        | Verify no auto complaint creation          |
| OC-010 | Create complaint case                                | `complaint_specialist` | P1       | ⬜        | Unique case number; SLA timer starts       |
| OC-011 | Reopen closed complaint                              | `complaint_specialist` | P2       | ⬜        | Case number retained; timeline updated     |
| OC-012 | SLA breach flag visible (non-destructive)            | `complaint_specialist` | P2       | ⬜        | Main status unchanged                      |
| OC-013 | Vehicle onboarding — exclusivity review gate         | `ops_manager`          | P1       | ⬜        | Cannot set dispatchable before approval    |
| OC-014 | Insurance expiry makes vehicle ineligible            | `ops_manager`          | P1       | ⬜        | Alert generated; dispatch excludes vehicle |
| OC-015 | Vehicle offboarding — debranding task created        | `ops_manager`          | P2       | ⬜        |                                            |
| OC-016 | Driver expired license blocks clock-in               | `ops_manager`          | P1       | ⬜        | `DRIVER_CERT_INVALID`                      |
| OC-017 | View driver earnings statement (read-only)           | `ops_manager`          | P2       | ⬜        | Cannot modify net                          |
| OC-018 | Create maintenance record                            | `ops_manager`          | P2       | ⬜        |                                            |
| OC-019 | Close maintenance record                             | `ops_manager`          | P2       | ⬜        |                                            |
| OC-020 | View driver attendance                               | `ops_manager`          | P3       | ⬜        |                                            |
| OC-021 | Phone booking with call linkage                      | `ops_dispatcher`       | P1       | ⬜        | `call_id`, `agent_id` stored               |
| OC-022 | Recording pending flag cleared by callback           | `ops_dispatcher`       | P2       | ⬜        | ⏸ Deferred pending CTI stub                |
| OC-023 | Monthly regulatory filing package                    | `ops_manager`          | P1       | ⬜        | ⏸ Deferred pending job activation          |
| OC-024 | Recording index export with call references          | `ops_manager`          | P1       | ⬜        | ⏸ Deferred pending job activation          |
| OC-025 | Sensitive artifact download — permissioned + audited | `ops_manager`          | P1       | ⬜        | Unauthorized = `403`                       |
| OC-026 | View tenant contract rules                           | `ops_manager`          | P2       | ⬜        |                                            |

**Ops Console P1 pass gate:** OC-001, OC-002, OC-003, OC-005, OC-006, OC-009, OC-010, OC-013, OC-014, OC-016, OC-021, OC-025

---

## Surface 4 — Driver App

| ID     | Scenario                                           | Role     | Priority | Pass/Fail | Notes                                                     |
| ------ | -------------------------------------------------- | -------- | -------- | --------- | --------------------------------------------------------- |
| DA-001 | Jobs list — platform badge per task                | `driver` | P1       | ⬜        | TaskTypeBadge, PlatformBadge                              |
| DA-002 | Accept task before timeout                         | `driver` | P1       | ⬜        | Acceptance time stored                                    |
| DA-003 | Reject task — reason required                      | `driver` | P1       | ⬜        | Reason stored with attempt                                |
| DA-004 | Cannot start trip before arrived_pickup            | `driver` | P1       | ⬜        | `PICKUP_NOT_ARRIVED`                                      |
| DA-005 | Forwarded task — routeLocked hides override        | `driver` | P1       | ⬜        | Third-party waypoints authoritative                       |
| DA-006 | Fixed-price task — fare modification rejected      | `driver` | P1       | ⬜        | `FIXED_PRICE_IMMUTABLE`                                   |
| DA-007 | Completion — min photo count                       | `driver` | P1       | ⬜        | `MIN_PHOTO_COUNT_NOT_MET`                                 |
| DA-008 | Enterprise dispatch — signoff required             | `driver` | P1       | ⬜        | `PROOF_REQUIRED`                                          |
| DA-009 | Airport transfer — expense proof required          | `driver` | P1       | ⬜        | `EXPENSE_PROOF_REQUIRED`                                  |
| DA-010 | Per-platform online/offline toggle                 | `driver` | P1       | ⬜        | Correct API called                                        |
| DA-011 | Token expiry warning with countdown                | `driver` | P2       | ⬜        | Xd Yh format                                              |
| DA-012 | Re-auth flow updates token                         | `driver` | P1       | ⬜        | Urgency indicator removed after                           |
| DA-013 | Platform eligibility status displayed              | `driver` | P2       | ⬜        |                                                           |
| DA-014 | Bind new platform account                          | `driver` | P2       | ⬜        |                                                           |
| DA-015 | Unbind platform account                            | `driver` | P2       | ⬜        |                                                           |
| DA-016 | Earnings summary by platform                       | `driver` | P1       | ⬜        | gross / fee / subsidy / net                               |
| DA-017 | Driver only sees own earnings                      | `driver` | P1       | ⬜        | No cross-driver data                                      |
| DA-018 | Platform discount NOT deducted from driver net     | `driver` | P1       | ⬜        | ⏸ Deferred pending billing job                            |
| DA-019 | Trip lifecycle buttons match state                 | `driver` | P1       | ⬜        |                                                           |
| DA-020 | Settings — update preference                       | `driver` | P3       | ⬜        |                                                           |
| DA-021 | Clock in — happy path                              | `driver` | P1       | ⬜        | work*state → `available*\*`                               |
| DA-022 | Clock in — blocked by expired license              | `driver` | P1       | ⬜        | `DRIVER_CERT_INVALID`                                     |
| DA-023 | Driver reports incident during trip                | `driver` | P2       | ⬜        |                                                           |
| DA-024 | Driver device registration denied by auth gate     | `driver` | P1       | ⬜        | `DRIVER_AUTH_SUSPENDED` or `DRIVER_CERT_INVALID`          |
| DA-025 | Revoked or suspended driver session cannot re-auth | `driver` | P1       | ⬜        | `DRIVER_DEVICE_SESSION_INVALID` / `DRIVER_AUTH_SUSPENDED` |

**Driver App P1 pass gate:** DA-001 through DA-010, DA-012, DA-016, DA-017, DA-019, DA-021, DA-022, DA-024, DA-025

---

## End-to-End Flows

| ID      | Scenario                                    | Surfaces              | Priority | Pass/Fail | Notes                                   |
| ------- | ------------------------------------------- | --------------------- | -------- | --------- | --------------------------------------- |
| E2E-001 | Enterprise dispatch full cycle              | Portal + Ops + Driver | P1       | ⬜        | All audit entries; no cross-tenant leak |
| E2E-002 | Forwarded order mirror lifecycle            | Driver                | P1       | ⬜        | No owned assignment created             |
| E2E-003 | Phone booking to compliance export          | Ops                   | P1       | ⬜        | ⏸ Deferred pending CTI + filing jobs    |
| E2E-004 | Platform admin creates tenant; tenant books | Admin + Portal + Ops  | P1       | ⬜        |                                         |

---

## Deferred Items Tracker

Items marked ⏸ require explicit sign-off before Phase 1 is declared complete.

| Scenario | Reason for Deferral                           | Required Evidence            | Sign-off |
| -------- | --------------------------------------------- | ---------------------------- | -------- |
| OC-022   | CTI webhook integration not in staging        | Real CTI stub or WE-004 mock | ⬜       |
| OC-023   | Month-end filing job not activated on staging | Staging job run evidence     | ⬜       |
| OC-024   | Filing + recording export job not activated   | Staging job run evidence     | ⬜       |
| DA-018   | Period-end billing job not activated          | Billing job run evidence     | ⬜       |
| E2E-003  | Depends on OC-022 + OC-024                    | Same as above                | ⬜       |

---

## Negative-Path and Permission/Audit Scenarios (ORX-GV-001)

Added: 2026-04-30 | Owner: Claude2 | Reviewer: Claude

These rows fill the gaps identified by ORX-GV-001 so that every workflow family
has at least one positive, one negative, and one permission/audit test in the
checklist. Rows reference the full scenario definitions in
`docs/04-uat/phase1-uat-scenarios.md §9`.

### Dispatch Negative-Path

| ID         | Scenario                                              | Role             | Priority | Pass/Fail | Notes                                     |
| ---------- | ----------------------------------------------------- | ---------------- | -------- | --------- | ----------------------------------------- |
| NP-DSP-001 | Read-only dispatcher cannot assign                    | `ops_viewer`     | P1       | ⬜        | `403 Forbidden`; access attempt audited   |
| NP-DSP-002 | Reassign to ineligible driver rejected                | `ops_dispatcher` | P1       | ⬜        | `DRIVER_NOT_ELIGIBLE`; original preserved |
| NP-DSP-003 | Dispatch timeout triggers escalation, not silent fail | `ops_dispatcher` | P1       | ⬜        | Ops notification created                  |

**Dispatch negative-path P1 gate:** NP-DSP-001, NP-DSP-002, NP-DSP-003

### Finance Negative-Path

| ID         | Scenario                                             | Role              | Priority | Pass/Fail | Notes                                      |
| ---------- | ---------------------------------------------------- | ----------------- | -------- | --------- | ------------------------------------------ |
| NP-FIN-001 | Invoice generation with no eligible trips            | `tenant_admin`    | P2       | ⬜        | No phantom charges                         |
| NP-FIN-002 | Unauthorized user cannot download financial artifact | (no finance role) | P1       | ⬜        | `403 Forbidden`; audited                   |
| NP-FIN-003 | Driver cannot view another driver's earnings         | `driver`          | P1       | ⬜        | Self-scoped only; cross-driver = forbidden |
| NP-FIN-004 | Non-finance role cannot open reconciliation dispute  | `ops_dispatcher`  | P1       | ⬜        | `403 Forbidden`; audited                   |

**Finance negative-path P1 gate:** NP-FIN-002, NP-FIN-003, NP-FIN-004

### Forwarder Negative-Path

| ID         | Scenario                                         | Role          | Priority | Pass/Fail | Notes                             |
| ---------- | ------------------------------------------------ | ------------- | -------- | --------- | --------------------------------- |
| NP-FWD-001 | Accept cancelled forwarded order rejected        | `driver`      | P1       | ⬜        | `TASK_CANCELLED_BY_PLATFORM`      |
| NP-FWD-002 | Route override on forwarded order blocked        | `driver`      | P1       | ⬜        | `ROUTE_LOCKED_IMMUTABLE`; audited |
| NP-FWD-003 | Forwarder sync failure surfaced in ops dashboard | `ops_manager` | P2       | ⬜        | Adapter failure state visible     |

**Forwarder negative-path P1 gate:** NP-FWD-001, NP-FWD-002

### Compliance and Recording Negative-Path

| ID         | Scenario                                              | Role                     | Priority | Pass/Fail | Notes                               |
| ---------- | ----------------------------------------------------- | ------------------------ | -------- | --------- | ----------------------------------- |
| NP-COM-001 | Regulatory filing flags missing recordings            | `ops_manager`            | P1       | ⬜        | Incomplete orders listed separately |
| NP-COM-002 | Non-compliance user cannot access recording artifacts | `tenant_booking_manager` | P1       | ⬜        | `403 Forbidden`; audited            |

**Compliance negative-path P1 gate:** NP-COM-001, NP-COM-002

### Identity and Auth Negative-Path

| ID          | Scenario                                           | Role                 | Priority | Pass/Fail | Notes                           |
| ----------- | -------------------------------------------------- | -------------------- | -------- | --------- | ------------------------------- |
| NP-AUTH-001 | Revoked API key cannot authenticate                | `partner_api_client` | P1       | ⬜        | `401 Unauthorized`; audited     |
| NP-AUTH-002 | Cross-tenant API key cannot access other resources | `tenant_admin`       | P1       | ⬜        | No cross-tenant data leakage    |
| NP-AUTH-003 | Device rebind invalidates old session              | `driver`             | P1       | ⬜        | `DRIVER_DEVICE_SESSION_INVALID` |

**Auth negative-path P1 gate:** NP-AUTH-001, NP-AUTH-002, NP-AUTH-003

### Override and Exception-Hold Negative-Path

| ID         | Scenario                                    | Role             | Priority | Pass/Fail | Notes                               |
| ---------- | ------------------------------------------- | ---------------- | -------- | --------- | ----------------------------------- |
| NP-OVR-001 | Override release without reason rejected    | `ops_dispatcher` | P1       | ⬜        | `OVERRIDE_REASON_REQUIRED`          |
| NP-OVR-002 | Non-manager cannot approve override release | `ops_dispatcher` | P1       | ⬜        | `403 Forbidden`; audited            |
| NP-OVR-003 | Expired override is auto-revoked            | (system)         | P1       | ⬜        | Order returns to pre-override state |

**Override negative-path P1 gate:** NP-OVR-001, NP-OVR-002, NP-OVR-003

### Vehicle and Master Data Negative-Path

| ID         | Scenario                                   | Role          | Priority | Pass/Fail | Notes                            |
| ---------- | ------------------------------------------ | ------------- | -------- | --------- | -------------------------------- |
| NP-VEH-001 | Offboarding vehicle cannot be redispatched | `ops_manager` | P1       | ⬜        | Debranding task must close first |
| NP-VEH-002 | Duplicate vehicle plate number rejected    | `ops_manager` | P2       | ⬜        | Uniqueness enforced              |

**Vehicle negative-path P1 gate:** NP-VEH-001

---

## Bug Triage Severity Guide

| Severity          | Criteria                                                                                                | Example                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **P1 — Critical** | Core business flow broken; data incorrect; security/RBAC violation; audit missing on required operation | Tenant sees another tenant's bookings; API key shown multiple times |
| **P2 — Major**    | Feature functionally broken but workaround exists; wrong error code returned; partial data shown        | Booking list not filtering correctly                                |
| **P3 — Minor**    | UI/UX issue; non-critical copy or display glitch; optional feature degraded                             | Wrong date format in audit table                                    |

---

## Sign-off Matrix

| Surface        | UAT Lead | P1 Items Passed | P2 Items Passed | Signed Off | Date |
| -------------- | -------- | --------------- | --------------- | ---------- | ---- |
| Tenant Portal  | —        | ⬜              | ⬜              | ⬜         | —    |
| Platform Admin | —        | ⬜              | ⬜              | ⬜         | —    |
| Ops Console    | —        | ⬜              | ⬜              | ⬜         | —    |
| Driver App     | —        | ⬜              | ⬜              | ⬜         | —    |
| End-to-End     | —        | ⬜              | ⬜              | ⬜         | —    |

**Phase 1 UAT PASS:** All surfaces signed off, zero open P1 bugs, deferred items either resolved
or formally accepted by the product owner.

---

_End of WE-005 UAT Checklist draft._

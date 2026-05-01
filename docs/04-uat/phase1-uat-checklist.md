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

## Classification Legend

`Pass/Fail` is the human UAT execution result. `Classification` is the release-evidence state and
must not be read as a pass mark while the row is still unchecked.

| Classification        | Meaning                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `LIVE`                | Live staging evidence exists or the row is covered by a live gate.       |
| `STATIC EVIDENCE`     | Repo/static evidence exists, but no fresh human UAT pass is implied.     |
| `REPO-LOCAL VERIFIED` | Repo-local smoke/unit/manual verification exists; no live proof implied. |
| `SIGN-OFF`            | Human/business sign-off is required before release claim.                |
| `EXTERNAL-GATED`      | Requires partner, CTI, app-store, credential, or other external input.   |
| `DEFERRED`            | Explicitly deferred with owner/evidence requirement.                     |
| `INVENTORY`           | Listed for coverage inventory; not yet release evidence.                 |

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

| ID     | Scenario                                        | Role                     | Priority | Pass/Fail | Notes                                      | Classification  |
| ------ | ----------------------------------------------- | ------------------------ | -------- | --------- | ------------------------------------------ | --------------- |
| TP-001 | Enterprise dispatch booking — happy path        | `tenant_booking_manager` | P1       | ⬜        |                                            | LIVE            |
| TP-002 | Booking wizard — address unresolvable           | `tenant_booking_manager` | P1       | ⬜        | Error message: `ADDRESS_UNRESOLVABLE`      | LIVE            |
| TP-003 | Airport transfer booking — happy path           | `tenant_booking_manager` | P1       | ⬜        |                                            | LIVE            |
| TP-004 | Airport pickup — missing flight number          | `tenant_booking_manager` | P1       | ⬜        | Error: `FLIGHT_NO_REQUIRED`                | LIVE            |
| TP-005 | Modify booking before deadline                  | `tenant_booking_manager` | P2       | ⬜        |                                            | INVENTORY       |
| TP-006 | Modify booking after `modifiable_until`         | `tenant_booking_manager` | P1       | ⬜        | Error: `ORDER_NOT_MODIFIABLE`              | LIVE            |
| TP-007 | Booking list — filter by status                 | `tenant_admin`           | P2       | ⬜        |                                            | INVENTORY       |
| TP-008 | Cancel booking                                  | `tenant_booking_manager` | P2       | ⬜        | Audit entry written                        | STATIC EVIDENCE |
| TP-009 | Create passenger                                | `tenant_admin`           | P2       | ⬜        |                                            | INVENTORY       |
| TP-010 | Update passenger name                           | `tenant_admin`           | P3       | ⬜        |                                            | INVENTORY       |
| TP-011 | Delete passenger                                | `tenant_admin`           | P3       | ⬜        |                                            | INVENTORY       |
| TP-012 | Create address entry                            | `tenant_admin`           | P2       | ⬜        |                                            | INVENTORY       |
| TP-013 | Trigger report export                           | `tenant_admin`           | P2       | ⬜        |                                            | STATIC EVIDENCE |
| TP-014 | Download report artifact                        | `tenant_admin`           | P2       | ⬜        | Audit entry written                        | STATIC EVIDENCE |
| TP-015 | Issue API key — shown once                      | `tenant_admin`           | P1       | ⬜        | Plaintext only on first view               | STATIC EVIDENCE |
| TP-016 | Rotate API key                                  | `tenant_admin`           | P1       | ⬜        | Old key invalidated                        | STATIC EVIDENCE |
| TP-017 | Revoke API key                                  | `tenant_admin`           | P1       | ⬜        |                                            | STATIC EVIDENCE |
| TP-018 | Create webhook endpoint                         | `tenant_admin`           | P2       | ⬜        |                                            | STATIC EVIDENCE |
| TP-019 | Webhook secret rotation                         | `tenant_admin`           | P1       | ⬜        | New deliveries use new secret              | STATIC EVIDENCE |
| TP-020 | View webhook delivery log                       | `tenant_admin`           | P2       | ⬜        |                                            | STATIC EVIDENCE |
| TP-021 | View billing profile                            | `tenant_admin`           | P2       | ⬜        |                                            | STATIC EVIDENCE |
| TP-022 | View invoice list                               | `tenant_admin`           | P2       | ⬜        |                                            | STATIC EVIDENCE |
| TP-023 | Download invoice PDF                            | `tenant_admin`           | P1       | ⬜        | Amount: `amountMinor/100`, currency prefix | STATIC EVIDENCE |
| TP-024 | Update notification preferences                 | `tenant_admin`           | P2       | ⬜        |                                            | DEFERRED        |
| TP-025 | View and update SLA profile                     | `tenant_admin`           | P2       | ⬜        |                                            | DEFERRED        |
| TP-026 | Invite tenant user                              | `tenant_admin`           | P2       | ⬜        |                                            | LIVE            |
| TP-027 | Change user role                                | `tenant_admin`           | P2       | ⬜        | Audit entry written                        | LIVE            |
| TP-028 | View audit trail (tenant scope)                 | `tenant_admin`           | P2       | ⬜        | Only own tenant events visible             | STATIC EVIDENCE |
| TP-029 | RBAC — tenant admin blocked from pricing engine | `tenant_admin`           | P1       | ⬜        | `403 Forbidden`                            | LIVE            |
| TP-030 | Tenant bootstrap rejects wrong tenant scope     | `tenant_admin`           | P1       | ⬜        | `TENANT_SCOPE_MISMATCH`; no session issued | LIVE            |
| TP-031 | Suspended tenant user cannot bootstrap session  | `tenant_admin`           | P1       | ⬜        | `TENANT_USER_SUSPENDED`                    | LIVE            |
| TP-032 | Inactive partner entry cannot bootstrap         | `partner_api_client`     | P1       | ⬜        | `PARTNER_ENTRY_INACTIVE`; audit written    | LIVE            |

**Tenant Portal P1 pass gate:** TP-001, TP-002, TP-003, TP-004, TP-006, TP-015, TP-016, TP-017, TP-019, TP-023, TP-029, TP-030, TP-031, TP-032

---

## Surface 2 — Platform Admin

| ID     | Scenario                                     | Role             | Priority | Pass/Fail | Notes                                        | Classification  |
| ------ | -------------------------------------------- | ---------------- | -------- | --------- | -------------------------------------------- | --------------- |
| PA-001 | Create tenant                                | `platform_admin` | P1       | ⬜        | Unique `tenant.code` enforced; audit written | LIVE            |
| PA-002 | Edit tenant quotas and modules               | `platform_admin` | P2       | ⬜        |                                              | LIVE            |
| PA-003 | Deactivate tenant                            | `platform_admin` | P2       | ⬜        | Audit written                                | LIVE            |
| PA-004 | Create platform user and assign role         | `platform_admin` | P2       | ⬜        |                                              | LIVE            |
| PA-005 | Roles page — RBAC tiers visible              | `platform_admin` | P2       | ⬜        |                                              | LIVE            |
| PA-006 | View pricing template list                   | `platform_admin` | P2       | ⬜        |                                              | STATIC EVIDENCE |
| PA-007 | Pricing write is audited (version published) | `platform_admin` | P1       | ⬜        | old/new version in audit                     | STATIC EVIDENCE |
| PA-008 | Health dashboard                             | `platform_admin` | P3       | ⬜        | May use simulated data                       | LIVE            |
| PA-009 | Platform-level audit trail                   | `platform_admin` | P1       | ⬜        | High-sensitivity events present              | STATIC EVIDENCE |
| PA-010 | Feature flag toggle                          | `platform_admin` | P2       | ⬜        | Audit written                                | LIVE            |
| PA-011 | View payment records                         | `platform_admin` | P2       | ⬜        |                                              | STATIC EVIDENCE |

**Platform Admin P1 pass gate:** PA-001, PA-007, PA-009

---

## Surface 3 — Ops Console

| ID     | Scenario                                             | Role                   | Priority | Pass/Fail | Notes                                      | Classification  |
| ------ | ---------------------------------------------------- | ---------------------- | -------- | --------- | ------------------------------------------ | --------------- |
| OC-001 | Dispatch queue visible — correct columns             | `ops_dispatcher`       | P1       | ⬜        | `exception_hold` orders distinguished      | LIVE            |
| OC-002 | Assign driver to ready-for-dispatch order            | `ops_dispatcher`       | P1       | ⬜        | Trace log appended                         | LIVE            |
| OC-003 | Reassign assigned order                              | `ops_dispatcher`       | P1       | ⬜        | Old assignment preserved                   | LIVE            |
| OC-004 | Release assignment                                   | `ops_dispatcher`       | P2       | ⬜        |                                            | INVENTORY       |
| OC-005 | Handle exception_hold order                          | `ops_dispatcher`       | P1       | ⬜        | SLA notification if configured             | LIVE            |
| OC-006 | Dispatch fails — no eligible supply                  | `ops_dispatcher`       | P1       | ⬜        | No fake ETA returned                       | LIVE            |
| OC-007 | Create incident                                      | `ops_manager`          | P2       | ⬜        |                                            | INVENTORY       |
| OC-008 | Update incident status                               | `ops_manager`          | P2       | ⬜        | Audit written                              | STATIC EVIDENCE |
| OC-009 | Incident ≠ complaint case (conceptual guard)         | `ops_manager`          | P1       | ⬜        | Verify no auto complaint creation          | LIVE            |
| OC-010 | Create complaint case                                | `complaint_specialist` | P1       | ⬜        | Unique case number; SLA timer starts       | STATIC EVIDENCE |
| OC-011 | Reopen closed complaint                              | `complaint_specialist` | P2       | ⬜        | Case number retained; timeline updated     | STATIC EVIDENCE |
| OC-012 | SLA breach flag visible (non-destructive)            | `complaint_specialist` | P2       | ⬜        | Main status unchanged                      | STATIC EVIDENCE |
| OC-013 | Vehicle onboarding — exclusivity review gate         | `ops_manager`          | P1       | ⬜        | Cannot set dispatchable before approval    | LIVE            |
| OC-014 | Insurance expiry makes vehicle ineligible            | `ops_manager`          | P1       | ⬜        | Alert generated; dispatch excludes vehicle | LIVE            |
| OC-015 | Vehicle offboarding — debranding task created        | `ops_manager`          | P2       | ⬜        |                                            | INVENTORY       |
| OC-016 | Driver expired license blocks clock-in               | `ops_manager`          | P1       | ⬜        | `DRIVER_CERT_INVALID`                      | LIVE            |
| OC-017 | View driver earnings statement (read-only)           | `ops_manager`          | P2       | ⬜        | Cannot modify net                          | STATIC EVIDENCE |
| OC-018 | Create maintenance record                            | `ops_manager`          | P2       | ⬜        |                                            | INVENTORY       |
| OC-019 | Close maintenance record                             | `ops_manager`          | P2       | ⬜        |                                            | INVENTORY       |
| OC-020 | View driver attendance                               | `ops_manager`          | P3       | ⬜        |                                            | INVENTORY       |
| OC-021 | Phone booking with call linkage                      | `ops_dispatcher`       | P1       | ⬜        | `call_id`, `agent_id` stored               | STATIC EVIDENCE |
| OC-022 | Recording pending flag cleared by callback           | `ops_dispatcher`       | P2       | ⬜        | ⏸ Deferred pending CTI stub                | EXTERNAL-GATED  |
| OC-023 | Monthly regulatory filing package                    | `ops_manager`          | P1       | ⬜        | ⏸ Deferred pending job activation          | DEFERRED        |
| OC-024 | Recording index export with call references          | `ops_manager`          | P1       | ⬜        | ⏸ Deferred pending job activation          | DEFERRED        |
| OC-025 | Sensitive artifact download — permissioned + audited | `ops_manager`          | P1       | ⬜        | Unauthorized = `403`                       | STATIC EVIDENCE |
| OC-026 | View tenant contract rules                           | `ops_manager`          | P2       | ⬜        |                                            | STATIC EVIDENCE |

**Ops Console P1 pass gate:** OC-001, OC-002, OC-003, OC-005, OC-006, OC-009, OC-010, OC-013, OC-014, OC-016, OC-021, OC-025

---

## Surface 4 — Driver App

| ID     | Scenario                                           | Role     | Priority | Pass/Fail | Notes                                                     | Classification  |
| ------ | -------------------------------------------------- | -------- | -------- | --------- | --------------------------------------------------------- | --------------- |
| DA-001 | Jobs list — platform badge per task                | `driver` | P1       | ⬜        | TaskTypeBadge, PlatformBadge                              | STATIC EVIDENCE |
| DA-002 | Accept task before timeout                         | `driver` | P1       | ⬜        | Acceptance time stored                                    | STATIC EVIDENCE |
| DA-003 | Reject task — reason required                      | `driver` | P1       | ⬜        | Reason stored with attempt outcome                        | STATIC EVIDENCE |
| DA-004 | Cannot start trip before arrived_pickup            | `driver` | P1       | ⬜        | `PICKUP_NOT_ARRIVED`                                      | STATIC EVIDENCE |
| DA-005 | Forwarded task — routeLocked flag hides override   | `driver` | P1       | ⬜        | Third-party waypoints authoritative                       | EXTERNAL-GATED  |
| DA-006 | Fixed-price task — fare modification rejected      | `driver` | P1       | ⬜        | `FIXED_PRICE_IMMUTABLE`                                   | STATIC EVIDENCE |
| DA-007 | Completion — min photo count                       | `driver` | P1       | ⬜        | `MIN_PHOTO_COUNT_NOT_MET`                                 | STATIC EVIDENCE |
| DA-008 | Enterprise dispatch — signoff required             | `driver` | P1       | ⬜        | `PROOF_REQUIRED`                                          | SIGN-OFF        |
| DA-009 | Airport transfer — expense proof required          | `driver` | P1       | ⬜        | `EXPENSE_PROOF_REQUIRED`                                  | STATIC EVIDENCE |
| DA-010 | Per-platform online/offline toggle                 | `driver` | P1       | ⬜        | Correct API called                                        | STATIC EVIDENCE |
| DA-011 | Token expiry warning with countdown                | `driver` | P2       | ⬜        | Xd Yh format                                              | INVENTORY       |
| DA-012 | Re-auth flow updates token                         | `driver` | P1       | ⬜        | Urgency indicator removed after                           | STATIC EVIDENCE |
| DA-013 | Platform eligibility status displayed              | `driver` | P2       | ⬜        |                                                           | INVENTORY       |
| DA-014 | Bind new platform account                          | `driver` | P2       | ⬜        |                                                           | INVENTORY       |
| DA-015 | Unbind platform account                            | `driver` | P2       | ⬜        |                                                           | INVENTORY       |
| DA-016 | Earnings summary by platform                       | `driver` | P1       | ⬜        | gross / fee / subsidy / net                               | STATIC EVIDENCE |
| DA-017 | Driver only sees own earnings                      | `driver` | P1       | ⬜        | No cross-driver data                                      | STATIC EVIDENCE |
| DA-018 | Platform discount NOT deducted from driver net     | `driver` | P1       | ⬜        | ⏸ Deferred pending billing job                            | DEFERRED        |
| DA-019 | Trip lifecycle buttons match state                 | `driver` | P1       | ⬜        |                                                           | STATIC EVIDENCE |
| DA-020 | Settings — update preference                       | `driver` | P3       | ⬜        |                                                           | INVENTORY       |
| DA-021 | Clock in — happy path                              | `driver` | P1       | ⬜        | work*state → `available*\*`                               | LIVE            |
| DA-022 | Clock in — blocked by expired license              | `driver` | P1       | ⬜        | `DRIVER_CERT_INVALID`                                     | STATIC EVIDENCE |
| DA-023 | Driver reports incident during trip                | `driver` | P2       | ⬜        |                                                           | INVENTORY       |
| DA-024 | Driver device registration denied by auth gate     | `driver` | P1       | ⬜        | `DRIVER_AUTH_SUSPENDED` or `DRIVER_CERT_INVALID`          | STATIC EVIDENCE |
| DA-025 | Revoked or suspended driver session cannot re-auth | `driver` | P1       | ⬜        | `DRIVER_DEVICE_SESSION_INVALID` / `DRIVER_AUTH_SUSPENDED` | STATIC EVIDENCE |

**Driver App P1 pass gate:** DA-001 through DA-010, DA-012, DA-016, DA-017, DA-019, DA-021, DA-022, DA-024, DA-025

---

## End-to-End Flows

| ID      | Scenario                                    | Surfaces              | Priority | Pass/Fail | Notes                                   | Classification |
| ------- | ------------------------------------------- | --------------------- | -------- | --------- | --------------------------------------- | -------------- |
| E2E-001 | Enterprise dispatch full cycle              | Portal + Ops + Driver | P1       | ⬜        | All audit entries; no cross-tenant leak | LIVE           |
| E2E-002 | Forwarded order mirror lifecycle            | Driver                | P1       | ⬜        | No owned assignment created             | EXTERNAL-GATED |
| E2E-003 | Phone booking to compliance export          | Ops                   | P1       | ⬜        | ⏸ Deferred pending CTI + filing jobs    | DEFERRED       |
| E2E-004 | Platform admin creates tenant; tenant books | Admin + Portal + Ops  | P1       | ⬜        |                                         | LIVE           |

---

## 6. MVP Regression Reference

Minimum set of scenarios to automate first (aligns with `02_acceptance_scenarios_gherkin.md §2.12`):

| Scenario ID | UAT ID     | Description                                       | Priority | Classification  |
| ----------- | ---------- | ------------------------------------------------- | -------- | --------------- |
| SC-001      | —          | Owned standard_taxi immediate booking (owned app) | P1       | LIVE            |
| SC-003      | OC-021     | Phone booking with recording linkage              | P1       | STATIC EVIDENCE |
| SC-005      | OC-002     | Standard dispatch assignment                      | P1       | LIVE            |
| SC-008      | TP-001     | Enterprise dispatch booking                       | P1       | LIVE            |
| SC-010      | TP-004     | Airport pickup — missing flight number            | P1       | LIVE            |
| SC-013      | DA-008     | Enterprise dispatch — signoff required            | P1       | SIGN-OFF        |
| SC-015      | DA-001/005 | Forwarded order accepted + confirmed              | P1       | EXTERNAL-GATED  |
| SC-020      | DA-004     | Cannot start trip before arrived_pickup           | P1       | STATIC EVIDENCE |
| SC-023      | OC-013     | Vehicle — exclusivity review gate                 | P1       | LIVE            |
| SC-024      | OC-014     | Vehicle — insurance expiry auto-suspend           | P1       | LIVE            |
| SC-027      | OC-010     | Complaint case creation (not incident)            | P1       | STATIC EVIDENCE |
| SC-033      | OC-023     | Regulatory monthly filing package                 | P1       | DEFERRED        |

---

## 7. Pending Evidence Gates

The following items are blocked until WE-004 (smoke harness) produces evidence:

| Gate                             | Description                                          | Unblocked by                     | Classification  |
| -------------------------------- | ---------------------------------------------------- | -------------------------------- | --------------- |
| **Recording callback**           | Real CTI webhook integration (OC-022)                | External CTI environment or stub | EXTERNAL-GATED  |
| **Insurance expiry trigger**     | Automated job that marks vehicle ineligible (OC-014) | Backend job activation           | LIVE            |
| **SLA breach monitor**           | Complaint SLA job (OC-012)                           | Scheduler activation on staging  | STATIC EVIDENCE |
| **Billing statement generation** | Period-end job (DA-016/017)                          | Staging billing job config       | STATIC EVIDENCE |
| **Regulatory filing**            | Month-end snapshot job (OC-023)                      | Staging reporting job config     | DEFERRED        |

Rows marked `DEFERRED` or `EXTERNAL-GATED` stay blocked until the named evidence exists. Rows
marked `STATIC EVIDENCE` or `LIVE` still require their own `Pass/Fail` execution result before
human UAT pass language is allowed.

---

## Deferred Items Tracker

Items marked `DEFERRED` or `EXTERNAL-GATED` require explicit sign-off before Phase 1 is declared
complete. This table is intentionally separate from `Pass/Fail`: a row can have static evidence
and still require live UAT before production language is allowed.

| Scenario | Classification | Reason for Deferral / Gate                      | Required Evidence                           | Sign-off |
| -------- | -------------- | ----------------------------------------------- | ------------------------------------------- | -------- |
| DA-005   | EXTERNAL-GATED | Forwarded task behavior needs live adapter/seed | Forwarder credential, seed, or sandbox run  | ⬜       |
| OC-022   | EXTERNAL-GATED | CTI webhook integration not in staging          | `EXT-004-BLK-001` to `EXT-004-BLK-004`      | ⬜       |
| OC-023   | DEFERRED       | Month-end filing job not activated on staging   | `EXT-004-BLK-005` filing run evidence       | ⬜       |
| OC-024   | DEFERRED       | Filing + recording export job not activated     | `EXT-004-BLK-006` recording export evidence | ⬜       |
| DA-018   | DEFERRED       | Period-end billing job not activated            | Billing job run evidence                    | ⬜       |
| E2E-002  | EXTERNAL-GATED | Depends on forwarded task seed/live adapter     | Graceful-skip log or live adapter proof     | ⬜       |
| E2E-003  | DEFERRED       | Depends on OC-022 + OC-024                      | `EXT-004-BLK-001` to `EXT-004-BLK-008`      | ⬜       |

---

## Negative-Path and Permission/Audit Scenarios (ORX-GV-001)

Added: 2026-04-30 | Owner: Claude2 | Reviewer: Claude

These rows fill the gaps identified by ORX-GV-001 so that every workflow family
has at least one positive, one negative, and one permission/audit test in the
checklist. Rows reference the full scenario definitions in
`docs/04-uat/phase1-uat-scenarios.md §9`.

### Dispatch Negative-Path

| ID         | Scenario                                              | Role             | Priority | Pass/Fail | Notes                                     | Classification      |
| ---------- | ----------------------------------------------------- | ---------------- | -------- | --------- | ----------------------------------------- | ------------------- |
| NP-DSP-001 | Read-only dispatcher cannot assign                    | `ops_viewer`     | P1       | ⬜        | `403 Forbidden`; access attempt audited   | REPO-LOCAL VERIFIED |
| NP-DSP-002 | Reassign to ineligible driver rejected                | `ops_dispatcher` | P1       | ⬜        | `DRIVER_NOT_ELIGIBLE`; original preserved | REPO-LOCAL VERIFIED |
| NP-DSP-003 | Dispatch timeout triggers escalation, not silent fail | `ops_dispatcher` | P1       | ⬜        | Ops notification created                  | REPO-LOCAL VERIFIED |

**Dispatch negative-path P1 gate:** NP-DSP-001, NP-DSP-002, NP-DSP-003

### Finance Negative-Path

| ID         | Scenario                                             | Role              | Priority | Pass/Fail | Notes                                      | Classification  |
| ---------- | ---------------------------------------------------- | ----------------- | -------- | --------- | ------------------------------------------ | --------------- |
| NP-FIN-001 | Invoice generation with no eligible trips            | `tenant_admin`    | P2       | ⬜        | No phantom charges                         | STATIC EVIDENCE |
| NP-FIN-002 | Unauthorized user cannot download financial artifact | (no finance role) | P1       | ⬜        | `403 Forbidden`; audited                   | STATIC EVIDENCE |
| NP-FIN-003 | Driver cannot view another driver's earnings         | `driver`          | P1       | ⬜        | Self-scoped only; cross-driver = forbidden | STATIC EVIDENCE |
| NP-FIN-004 | Non-finance role cannot open reconciliation dispute  | `ops_dispatcher`  | P1       | ⬜        | `403 Forbidden`; audited                   | STATIC EVIDENCE |

**Finance negative-path P1 gate:** NP-FIN-002, NP-FIN-003, NP-FIN-004

### Forwarder Negative-Path

| ID         | Scenario                                         | Role          | Priority | Pass/Fail | Notes                             | Classification |
| ---------- | ------------------------------------------------ | ------------- | -------- | --------- | --------------------------------- | -------------- |
| NP-FWD-001 | Accept cancelled forwarded order rejected        | `driver`      | P1       | ⬜        | `TASK_CANCELLED_BY_PLATFORM`      | EXTERNAL-GATED |
| NP-FWD-002 | Route override on forwarded order blocked        | `driver`      | P1       | ⬜        | `ROUTE_LOCKED_IMMUTABLE`; audited | EXTERNAL-GATED |
| NP-FWD-003 | Forwarder sync failure surfaced in ops dashboard | `ops_manager` | P2       | ⬜        | Adapter failure state visible     | EXTERNAL-GATED |

**Forwarder negative-path P1 gate:** NP-FWD-001, NP-FWD-002

### Compliance and Recording Negative-Path

| ID         | Scenario                                              | Role                     | Priority | Pass/Fail | Notes                               | Classification  |
| ---------- | ----------------------------------------------------- | ------------------------ | -------- | --------- | ----------------------------------- | --------------- |
| NP-COM-001 | Regulatory filing flags missing recordings            | `ops_manager`            | P1       | ⬜        | Incomplete orders listed separately | DEFERRED        |
| NP-COM-002 | Non-compliance user cannot access recording artifacts | `tenant_booking_manager` | P1       | ⬜        | `403 Forbidden`; audited            | STATIC EVIDENCE |

**Compliance negative-path P1 gate:** NP-COM-001, NP-COM-002

### Identity and Auth Negative-Path

| ID          | Scenario                                           | Role                 | Priority | Pass/Fail | Notes                           | Classification  |
| ----------- | -------------------------------------------------- | -------------------- | -------- | --------- | ------------------------------- | --------------- |
| NP-AUTH-001 | Revoked API key cannot authenticate                | `partner_api_client` | P1       | ⬜        | `401 Unauthorized`; audited     | STATIC EVIDENCE |
| NP-AUTH-002 | Cross-tenant API key cannot access other resources | `tenant_admin`       | P1       | ⬜        | No cross-tenant data leakage    | STATIC EVIDENCE |
| NP-AUTH-003 | Device rebind invalidates old session              | `driver`             | P1       | ⬜        | `DRIVER_DEVICE_SESSION_INVALID` | STATIC EVIDENCE |

**Auth negative-path P1 gate:** NP-AUTH-001, NP-AUTH-002, NP-AUTH-003

### Override and Exception-Hold Negative-Path

| ID         | Scenario                                    | Role             | Priority | Pass/Fail | Notes                               | Classification      |
| ---------- | ------------------------------------------- | ---------------- | -------- | --------- | ----------------------------------- | ------------------- |
| NP-OVR-001 | Override release without reason rejected    | `ops_dispatcher` | P1       | ⬜        | `OVERRIDE_REASON_REQUIRED`          | REPO-LOCAL VERIFIED |
| NP-OVR-002 | Non-manager cannot approve override release | `ops_dispatcher` | P1       | ⬜        | `403 Forbidden`; audited            | REPO-LOCAL VERIFIED |
| NP-OVR-003 | Expired override is auto-revoked            | (system)         | P1       | ⬜        | Order returns to pre-override state | REPO-LOCAL VERIFIED |

**Override negative-path P1 gate:** NP-OVR-001, NP-OVR-002, NP-OVR-003

### Vehicle and Master Data Negative-Path

| ID         | Scenario                                   | Role          | Priority | Pass/Fail | Notes                            | Classification |
| ---------- | ------------------------------------------ | ------------- | -------- | --------- | -------------------------------- | -------------- |
| NP-VEH-001 | Offboarding vehicle cannot be redispatched | `ops_manager` | P1       | ⬜        | Debranding task must close first | INVENTORY      |
| NP-VEH-002 | Duplicate vehicle plate number rejected    | `ops_manager` | P2       | ⬜        | Uniqueness enforced              | INVENTORY      |

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

**Phase 1 UAT PASS:** All surfaces signed off, zero open P1 bugs, deferred/external-gated
items either resolved or formally accepted by the product owner.

---

_End of WE-005 UAT Checklist draft._

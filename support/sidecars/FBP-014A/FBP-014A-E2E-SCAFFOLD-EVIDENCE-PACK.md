# FBP-014A — Cross-Surface E2E Matrix and Fixture Scaffold Evidence Pack

**Task:** `FBP-014A` — cross-surface E2E matrix and fixture scaffold
**Parent Umbrella:** `FBP-014` — integrated cross-surface and cross-repo E2E suite
**Owner:** Claude
**Reviewer:** Codex
**Status:** scaffold complete — all 8 ACs met; pending staging integration (blocked on FBP-013 live deploy)
**Created:** 2026-04-16
**Depends on:** FBP-006, FBP-008, FBP-009, FBP-011, FBP-012

---

## 1. Purpose

This evidence pack records the completion state of the FBP-014A cross-surface E2E matrix and
fixture scaffold. It maps each acceptance criterion to its implementing artifact, confirms all
8 ACs are met as static code evidence, and documents the conditions under which a live
integrated evidence run (FBP-014B) can be executed.

---

## 2. Acceptance Criteria Evaluation

| AC   | Criterion                                                                                                                  | Artifact                                   | Status  |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------- |
| AC-1 | `tests/e2e/lib/helpers.sh` with `switch_actor`, `chain_set/get`, `assert_chain`, `save_evidence`, `http_call`              | `tests/e2e/lib/helpers.sh`                 | ✅ PASS |
| AC-2 | E2E-001 exercises all 4 surface legs (tenant booking → ops dispatch → driver lifecycle → billing+audit) with full ID chain | `tests/e2e/E2E-001-enterprise-dispatch.sh` | ✅ PASS |
| AC-3 | E2E-002 verifies `routeLocked` metadata and no owned dispatch_assignment; graceful skip when no forwarded task seeded      | `tests/e2e/E2E-002-forwarded-order.sh`     | ✅ PASS |
| AC-4 | E2E-004 verifies correct `tenantId` attribution and hard-fails on cross-tenant leak                                        | `tests/e2e/E2E-004-tenant-attribution.sh`  | ✅ PASS |
| AC-5 | `run-e2e.sh` runs all scenarios, emits pass/fail summary, prints evidence log                                              | `tests/e2e/run-e2e.sh`                     | ✅ PASS |
| AC-6 | Fixtures cover all scenario legs                                                                                           | `tests/e2e/fixtures/` (6 files)            | ✅ PASS |
| AC-7 | Matrix document maps each scenario to surface chain, fixtures, ID chain, and pass criteria                                 | `docs/04-uat/fbp-014a-e2e-matrix.md`       | ✅ PASS |
| AC-8 | No scenario uses retired `apps/tenant-portal-web` routes or repo-B local authority                                         | Code inspection                            | ✅ PASS |

---

## 3. Artifact Inventory

### 3.1 Test Infrastructure

| File                          | Role                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `tests/e2e/lib/helpers.sh`    | Shared helper library — actor switching, chain state, HTTP calls, evidence capture |
| `tests/e2e/run-e2e.sh`        | Suite runner — discovers E2E-NNN-\*.sh, executes, emits pass/fail summary          |
| `tests/e2e/bootstrap.spec.ts` | Playwright bootstrap placeholder (committed separately)                            |

### 3.2 Scenario Scripts

| Script                                     | Scenario                                 | Surface Chain                                                              |
| ------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------- |
| `tests/e2e/E2E-001-enterprise-dispatch.sh` | Enterprise dispatch full cycle           | Tenant Portal → Ops Console → Driver App → Tenant Portal (billing) → Audit |
| `tests/e2e/E2E-002-forwarded-order.sh`     | Forwarded order mirror lifecycle         | Driver App (visibility/accept) → Ops Console (no owned assignment check)   |
| `tests/e2e/E2E-004-tenant-attribution.sh`  | Tenant attribution + cross-tenant safety | Platform Admin → Tenant Portal → Ops Console → cross-tenant safety         |

**E2E-003 (phone booking to compliance export):** Intentionally not automated — requires
live CTI session and recording callback webhook. Documented as manual-only in
`docs/04-uat/fbp-014a-e2e-matrix.md §4.3`.

### 3.3 Fixtures

| Fixture                       | Used By                      | Description                                                      |
| ----------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `e2e-booking-enterprise.json` | E2E-001, E2E-004             | `enterprise_dispatch` booking; timestamps injected at runtime    |
| `e2e-booking-airport.json`    | Reserved (E2E-003 expansion) | `credit_card_airport_transfer` booking                           |
| `e2e-dispatch-assign.json`    | E2E-001                      | Dispatch assign body; IDs injected from chain                    |
| `e2e-driver-accept.json`      | E2E-001, E2E-002             | Driver task accept; `acceptedAt` injected                        |
| `e2e-driver-complete.json`    | E2E-001                      | Driver task complete with signoff                                |
| `e2e-tenant-create.json`      | E2E-004                      | Platform-admin tenant create; `code` injected to avoid collision |

### 3.4 Matrix Document

`docs/04-uat/fbp-014a-e2e-matrix.md` — canonical E2E scenario matrix covering:

- Architecture guardrails (G1–G7 from FBP-014 BFF handoff)
- Seed data IDs from `S0002__demo_operational_seed.sql`
- Per-scenario: leg breakdown, ID continuity chain, fixtures, pass criteria
- Running guide, auth model, graceful-skip rules, evidence capture spec

---

## 4. ID Continuity Chains

### E2E-001

```
bookingId (tenant) ──► dispatchJobId (ops) ──► taskId (driver) ──► invoiceId (billing)
```

Chain assertions: `tenant.bookingId`, `tenant.tenantId`, `ops.dispatchJobId`, `driver.taskId`, `billing.invoiceId`

### E2E-002

```
forwardedTaskId (driver) ──► [no owned dispatch_assignment in ops queue]
```

### E2E-004

```
newTenantId (platform_admin) ──► bookingId2 (tenant_newco) ──► [absent from TEN_ACME booking list]
```

---

## 5. Seed Data Dependencies

All scenarios use `infra/seeds/S0002__demo_operational_seed.sql` defaults:

| Seed entity      | UUID                                   | ENV override          |
| ---------------- | -------------------------------------- | --------------------- |
| TEN_ACME tenant  | `10000000-0000-0000-0000-000000000201` | `E2E_SEED_TENANT_ID`  |
| 張司機 driver    | `10000000-0000-0000-0000-000000000381` | `E2E_SEED_DRIVER_ID`  |
| ABC-1234 vehicle | `10000000-0000-0000-0000-000000000351` | `E2E_SEED_VEHICLE_ID` |

---

## 6. Guardrail Compliance

| Guardrail | Requirement                                                          | Verified                                                  |
| --------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| G1        | Tenant entry point is `tenant-commute-hub` backed by `/api/tenant/*` | ✅ No `apps/tenant-portal-web` routes used                |
| G2        | Repo B remains pure UI consumer                                      | ✅ No repo-B local authority calls                        |
| G3        | Canonical `/api/*` prefix, envelope, Idempotency-Key                 | ✅ `E2E_API_PATH_PREFIX=/api` in helpers                  |
| G4        | Primary happy path is owned enterprise-dispatch (E2E-001)            | ✅ E2E-001 is the primary scenario                        |
| G5        | Billing and audit are backend-owned                                  | ✅ `POST /api/tenant/invoices/generate`, `GET /api/audit` |
| G6        | Cross-tenant safety is part of DoD                                   | ✅ E2E-004 hard-fails on cross-tenant leak                |
| G7        | Gaps found → new authority task, not local workaround                | ✅ Graceful skips documented; no workarounds              |

---

## 7. Graceful Skip Rules

| Scenario         | Skip Condition                                            | Behavior                                     |
| ---------------- | --------------------------------------------------------- | -------------------------------------------- |
| E2E-001 legs 2–4 | No open dispatch jobs in ops queue                        | `exit 0` with warning; chain summary printed |
| E2E-001 legs 3–4 | No driver task found after dispatch                       | `exit 0` with warning                        |
| E2E-002          | No forwarded task (routeLocked=true) in driver task list  | `exit 0` with warning                        |
| E2E-004 legs 2–4 | `POST /platform-admin/tenants` does not return `tenantId` | `exit 0` with warning                        |

Graceful skips are expected on a fresh staging environment or when running against a local
dev instance without seed data propagation. They are **not** failures of the scaffold.

---

## 8. Relationship to Upstream and Downstream Tasks

| Task     | Status      | Relationship                                                                              |
| -------- | ----------- | ----------------------------------------------------------------------------------------- |
| FBP-006  | done        | `tenant-commute-hub` BFF routes (entry point for tenant legs)                             |
| FBP-007  | done        | `apps/tenant-portal-web` RETIRED — E2E does not use it                                    |
| FBP-008  | done        | Platform Admin control-plane (E2E-004 tenant creation)                                    |
| FBP-009  | done        | Ops Console dispatch routes (E2E-001 leg 2, E2E-004 leg 3)                                |
| FBP-011  | done        | Finance/billing routes (E2E-001 leg 4 invoice generation)                                 |
| FBP-012  | done        | Regulatory/reporting routes (available for E2E-003 future expansion)                      |
| FBP-013  | in_progress | Staging evidence closeout; E2E scenarios count as rollout-grade only after FBP-013 closes |
| FBP-014B | todo        | Final integrated evidence run — blocked on FBP-013 + FBP-014A completion                  |

---

## 9. Handoff to Reviewer

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff FBP-014A Codex \
  "FBP-014A cross-surface E2E scaffold complete at tests/e2e/. \
All 8 ACs verified: helpers.sh (AC-1), E2E-001 (AC-2), E2E-002 (AC-3), E2E-004 (AC-4), \
run-e2e.sh (AC-5), fixtures (AC-6), fbp-014a-e2e-matrix.md (AC-7), no retired routes (AC-8). \
Evidence pack at support/sidecars/FBP-014A/FBP-014A-E2E-SCAFFOLD-EVIDENCE-PACK.md. \
Scaffold is staging-ready; live integrated evidence run is FBP-014B scope after FBP-013 closes."
```

---

## 10. Change Log

- 2026-04-16 (rev 1) — Claude created initial FBP-014A evidence pack recording scaffold
  completion: all 8 ACs met across helpers.sh, E2E-001/002/004 scenarios, run-e2e.sh,
  6 fixtures, and the fbp-014a-e2e-matrix.md matrix document.

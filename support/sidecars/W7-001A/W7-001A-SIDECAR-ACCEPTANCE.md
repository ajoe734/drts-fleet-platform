# W7-001A Sidecar Acceptance Packet

> **Parent Task:** W7-001A — Persistence and migration alignment
> **Owner:** Codex | **Reviewer:** Claude
> **Sidecar Owner:** Qwen | **Sidecar Reviewer:** Codex
> **Helper Kind:** acceptance_packet
> **Mutates Canonical:** false
> **Created:** 2026-04-11T11:04:00Z

This packet is a **support artifact** only. It does not modify L1 canonical truth, core contracts, or runtime implementations. It was prepared for Codex review; the parent owner (Codex) decides whether to absorb findings into the mainline implementation.

---

## 1. Dependency Map

### 1.1 Upstream Dependencies (must be `done` before W7-001A can complete)

| ID      | Title                                       | Status | Relevance to W7-001A                                                                                                                                                       |
| ------- | ------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1-004A | Phase 1 foundation audit-notification slice | done   | Provides the audit-log module; the only module already backed by Postgres. W7-001A must generalize this pattern to all other modules.                                      |
| W2-002A | Owned order-dispatch-driver execution loop  | done   | In-memory state: orders, bookings, dispatch_jobs, dispatch_attempts, dispatch_assignments, driver_tasks, dispatch_trace_logs. All need repository implementations.         |
| W3-001A | Callcenter and CTI correlation baseline     | done   | In-memory state: call_sessions. Needs repository for `crm.call_sessions` and `crm.call_recordings`.                                                                        |
| W3-001B | Complaint case lifecycle baseline           | done   | In-memory state: complaint_cases, complaint_timelines. Need repositories for `crm.complaint_cases` and `crm.complaint_timelines`.                                          |
| W4-001A | Billing and settlement baseline             | done   | In-memory state: tenant_invoices, driver_fee_plans, driver_statements, reimbursement_batches. Need repositories for all billing tables.                                    |
| W5-001A | Reporting and filing baseline               | done   | In-memory state: report_jobs, filing_packages. Need repositories for `admin.report_jobs`, `admin.report_artifacts`, `admin.filing_packages`, `admin.filing_package_items`. |
| W6-001A | Forwarder mirror and relay baseline         | done   | In-memory state: forwarded_orders, adapter_health. Need repositories for `ops.external_service_mappings` and forwarder-related tables.                                     |

### 1.2 Downstream Dependents (blocked on W7-001A completion)

| ID      | Title                                                    | Reason                                                                                             |
| ------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| W8-001A | Client integration and feature-flag rollout              | Requires persisted read models and stable data sources for tenant portal, ops console, driver app. |
| W8-001B | Backfill, UAT, and rollout packs                         | Requires validated persistence layer to run UAT scripts against real Postgres.                     |
| W8-001C | Dispatch and booking target-state completion             | Reservation scheduler and booking update/cancel require persistent state for correctness.          |
| W8-001D | Tenant, regulatory, and admin source-of-truth completion | Master data management requires the registry to be Postgres-backed, not in-memory.                 |
| W8-001E | Ops and driver domain completion                         | Incident, maintenance, shift/attendance, driver earnings all need persistent storage.              |

### 1.3 Lateral Wave-7 Tasks

| ID      | Title                                   | Relationship                                                                                                        |
| ------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| W7-001B | Auth and RBAC hardening                 | **done**. Independent lane; no direct persistence dependency.                                                       |
| W7-001C | Webhook and artifact runtime hardening  | **done**. Independent lane; webhook_delivery already has partial persistence alignment.                             |
| W7-001D | Wire contract and async job conformance | **in_progress**. Will validate snake_case serialization against persistence layer once repository wiring is active. |

---

## 2. Acceptance Checklist

### 2.1 Migration & Schema

| #    | Criterion                                                                                                                            | Status      | Evidence                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------- |
| M-01 | All 11 migration files (V0001–V0011) exist in `infra/migrations/` and are forward-only                                               | ✅ VERIFIED | Files V0001–V0011 present; `db-apply.sh` uses SHA-256 checksums in `admin.schema_migrations`. |
| M-02 | All seed files (S0001–S0002) exist in `infra/seeds/` with CSV templates                                                              | ✅ VERIFIED | S0001 (reference), S0002 (demo), 6 CSV templates in `infra/seeds/templates/`.                 |
| M-03 | Migration execution scripts (`db-apply.sh`, `db-seed.sh`, `db-init-local.sh`, `db-verify.sh`, `db-common.sh`) exist under `scripts/` | ✅ VERIFIED | All 5 scripts present and functional.                                                         |
| M-04 | Docker Compose dev environment includes PostgreSQL 16                                                                                | ✅ VERIFIED | `docker-compose.dev.yml` defines `drts-postgres` service with Postgres 16 Alpine.             |
| M-05 | `DATABASE_URL` environment variable drives connection; graceful degradation when missing                                             | ✅ VERIFIED | `DatabaseService` reads `DATABASE_URL`, `isEnabled()` returns false if absent.                |
| M-06 | Schema covers all Phase 1 tables across 6 schemas: core, reg, ops, crm, billing, admin                                               | ✅ VERIFIED | V0003–V0009 define ~40+ tables; V0010 adds triggers, materialized views, and indexes.         |

### 2.2 Persistence Layer (Current State Audit)

| #    | Criterion                                                                       | Status      | Notes                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | `admin.audit_logs` has Postgres write-through via `AuditLogRepository.append()` | ✅ VERIFIED | INSERT with ON CONFLICT DO NOTHING; fire-and-forget from service.                                                                                                                                                            |
| P-02 | `AuditNotificationService.onModuleInit()` loads audit logs from DB on startup   | ✅ VERIFIED | Bootstrap seed sync implemented; graceful fallback if DB unavailable.                                                                                                                                                        |
| P-03 | `DatabaseService` provides `pg.Pool` with `query<T>()` and lifecycle management | ✅ VERIFIED | `OnModuleDestroy` closes pool; raw SQL execution supported.                                                                                                                                                                  |
| P-04 | `regulatory-registry` — **NOT YET persisted**                                   | ⚠️ GAP      | In-memory arrays: `vehicles`, `drivers`, `supplyPairs`. Needs repository for `reg.*` tables (V0004).                                                                                                                         |
| P-05 | `owned-mobility` — **repository stub exists, runtime still in-memory**          | ⚠️ GAP      | `owned-mobility.repository.ts` reads/writes `ops.phase1_*` snapshot tables from V0011, but `OwnedMobilityModule` does not import `DatabaseModule` and `OwnedMobilityService` does not inject the repository.                 |
| P-06 | `callcenter` — **repository stub exists, runtime still in-memory**              | ⚠️ GAP      | `callcenter.repository.ts` targets `crm.phase1_call_sessions` from V0011, but `CallcenterModule` does not import `DatabaseModule` and `CallcenterService` still mutates in-memory `callSessions`.                            |
| P-07 | `complaint` — **repository stub exists, runtime still in-memory**               | ⚠️ GAP      | `complaint.repository.ts` targets `crm.phase1_complaint_cases` and `crm.phase1_complaint_timelines` from V0011, but `ComplaintModule` does not import `DatabaseModule` and `ComplaintService` still mutates in-memory state. |
| P-08 | `billing-settlement` — **NOT YET persisted**                                    | ⚠️ GAP      | In-memory arrays: `tenantInvoices`, `driverFeePlans`, `driverStatements`, `reimbursementBatches`. Needs repository for `billing.*` tables (V0008).                                                                           |
| P-09 | `reporting-filing` — **NOT YET persisted**                                      | ⚠️ GAP      | In-memory arrays: `reportJobs`, `filingPackages`. Needs repository for `admin.report_jobs`, `admin.report_artifacts`, `admin.filing_packages`, `admin.filing_package_items` (V0009).                                         |
| P-10 | `forwarder` — **NOT YET persisted**                                             | ⚠️ GAP      | In-memory arrays: `forwardedOrders`, `adapterHealth`. Needs repository for `ops.external_service_mappings` (V0005).                                                                                                          |
| P-11 | `tenant-partner` — **NOT YET persisted**                                        | ⚠️ GAP      | In-memory arrays: `webhookEndpoints`, `webhookDeliveries`, `slaProfiles`. Needs repository for `admin.webhook_endpoints`, `admin.webhook_deliveries` (V0009).                                                                |
| P-12 | `product-rule` — **not a persistence target for W7-001A**                       | ✅ VERIFIED | `ProductRuleController` serves a static catalog derived from foundation constants; there is no mutable runtime state or DB responsibility here.                                                                              |

### 2.3 Contract Alignment

| #    | Criterion                                                           | Status      | Notes                                                                                          |
| ---- | ------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| C-01 | `packages/contracts/src/index.ts` exports all TypeScript interfaces | ✅ VERIFIED | Canonical contract definitions used across services.                                           |
| C-02 | Repository read/write shapes must match contract interfaces         | ⏳ PENDING  | Requires W7-001D (wire contract conformance) to finalize snake_case serialization.             |
| C-03 | `AuditLogRecord` interface aligns with `admin.audit_logs` schema    | ✅ VERIFIED | Columns match interface fields: audit_id, actor_id, actor_type, module_name, action_name, etc. |

### 2.4 Runtime & Integration

| #    | Criterion                                                                 | Status      | Notes                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | `DatabaseModule` is imported by `AuditNotificationModule`                 | ✅ VERIFIED | NestJS module wiring confirmed.                                                                                                                                                                                                                            |
| R-02 | Other modules do NOT import `DatabaseModule` yet                          | ⚠️ GAP      | `callcenter`, `complaint`, and `owned-mobility` already have repository files, but none of their modules wire `DatabaseModule`; `regulatory-registry`, `billing-settlement`, `reporting-filing`, `forwarder`, and `tenant-partner` remain fully in-memory. |
| R-03 | Local Postgres is reachable and migration/seed pipeline runs end-to-end   | ✅ VERIFIED | Codex confirmed: "live API smoke verification against local Postgres" for audit_logs.                                                                                                                                                                      |
| R-04 | `db-verify.sh` validates 9 key tables/views + row counts                  | ✅ VERIFIED | Script exists and targets canonical tables.                                                                                                                                                                                                                |
| R-05 | Materialized views in V0010 are refreshed as part of operational pipeline | ⚠️ GAP      | 4 materialized views defined (`reg.v_vehicle_dispatch_readiness`, `ops.v_dispatch_board_pending`, `crm.v_complaint_export`, `admin.v_filing_vehicle_roster`); no REFRESH logic in services yet.                                                            |

### 2.5 Acceptance Gates (for W7-001A to reach `done`)

| #    | Gate                                                                                        | Current State                                   | Target State                           |
| ---- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------- |
| G-01 | All 9 persistence-targeted runtime modules have repository implementations                  | 1/9 live (audit-log only)                       | 9/9 complete                           |
| G-02 | All modules import `DatabaseModule` and inject repositories                                 | 1/9 live, plus 3 repository stubs not yet wired | All persistence-targeted modules wired |
| G-03 | End-to-end smoke tests pass against Postgres for all module APIs                            | audit_logs only                                 | All modules                            |
| G-04 | `db-init-local.sh` runs clean (apply + seed + verify)                                       | ✅ Verified for audit scope                     | Must pass with all repositories active |
| G-05 | No data loss on service restart (reads come from DB, not stale memory)                      | ⚠️ In-memory arrays reset on restart            | All state persisted                    |
| G-06 | Append-only semantics preserved (no destructive updates to audit, complaint timeline, etc.) | ✅ Verified for audit_logs                      | All append-only tables verified        |

---

## 3. Risk Register

| ID   | Risk                                                                                                          | Impact | Likelihood | Mitigation                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | In-memory → Postgres migration is large (8 remaining runtime-backed modules, plus partial repo stubs to wire) | High   | Certain    | Incremental per-service migration, following the audit-log pattern as template and promoting existing stubs before creating new repositories. |
| R-02 | Race conditions during dual-read (in-memory + DB) transition                                                  | Medium | Likely     | Implement feature flags per module to toggle persistence source; start with write-through, then switch reads.                                 |
| R-03 | Contract serialization mismatch (camelCase vs snake_case)                                                     | Medium | Possible   | Coordinate with W7-001D; repositories should serialize to canonical snake_case for DB, transform to camelCase for API responses.              |
| R-04 | `phase1_db_migration_extracted/` directory contains duplicate scripts that may diverge                        | Low    | Likely     | Mark as reference-only; canonical execution path is `infra/migrations/` + `scripts/db-*.sh`.                                                  |
| R-05 | No ORM layer; raw `pg.Pool` queries increase SQL injection risk                                               | Medium | Possible   | Add parameterized query enforcement; consider adding a lightweight ORM (e.g., Kysely) in a later task.                                        |
| R-06 | Materialized views (V0010) are never refreshed                                                                | Medium | Certain    | Add REFRESH MATERIALIZED VIEW calls to relevant service write paths or a scheduled job.                                                       |

---

## 4. Recommended Execution Order for Remaining Persistence Work

Based on dependency analysis and complexity:

| Priority | Service               | Tables                                                                                                                                                               | Estimated Complexity | Rationale                                                                                                                          |
| -------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1        | `regulatory-registry` | reg.vehicles, reg.drivers, reg.vehicle_contracts, reg.insurance_policies, reg.dispatch_exclusivities                                                                 | Medium               | Master data; low write frequency; good next target after audit-log.                                                                |
| 2        | `tenant-partner`      | admin.webhook_endpoints, admin.webhook_deliveries                                                                                                                    | Medium               | Already has partial persistence alignment from W7-001C; small surface area.                                                        |
| 3        | `callcenter`          | crm.call_sessions, crm.call_recordings                                                                                                                               | Medium               | Follows audit-log pattern (append-heavy, read-light).                                                                              |
| 4        | `complaint`           | crm.complaint_cases, crm.complaint_timelines                                                                                                                         | Medium               | SLA breach append-only semantics already validated; straightforward repository mapping.                                            |
| 5        | `billing-settlement`  | billing.\* (8 tables)                                                                                                                                                | High                 | Complex relationships (invoices ↔ lines, statements ↔ lines, reimbursements); needs careful transaction handling.                  |
| 6        | `reporting-filing`    | admin.report_jobs, admin.report_artifacts, admin.filing_packages, admin.filing_package_items                                                                         | Medium               | Job-based; mostly append-only; materialized view dependencies.                                                                     |
| 7        | `forwarder`           | ops.external_service_mappings                                                                                                                                        | Low                  | Smallest surface area; 2 tables; good candidate for last to minimize risk.                                                         |
| 8        | `owned-mobility`      | ops.orders, ops.bookings, ops.dispatch_jobs, ops.dispatch_attempts, ops.dispatch_assignments, ops.driver_tasks, ops.dispatch_trace_log, ops.trips, ops.proof_bundles | Very High            | Largest and most complex; high write frequency; many foreign keys; should be tackled after simpler services establish the pattern. |

---

## 5. Handoff Notes

### For Reviewer (Codex)

This packet documents the **current state** of W7-001A as of 2026-04-11T11:04:00Z. Key findings:

1. **Migration & seed infrastructure is solid.** All 11 V-migrations and 2 S-seeds are in place, with execution scripts and verification pipeline.
2. **Audit-log is the proof-of-concept.** It demonstrates the forward-only, write-through pattern that all other modules should follow.
3. **The remaining gap is split into two buckets.** `callcenter`, `complaint`, and `owned-mobility` already have repository stubs against V0011 snapshot tables but are not wired into Nest modules/services; `regulatory-registry`, `billing-settlement`, `reporting-filing`, `forwarder`, and `tenant-partner` are still fully in-memory.
4. **`product-rule` is out of persistence scope.** It is a static catalog controller and should not be counted as unresolved W7-001A runtime state.
5. **W7-001D is already in progress.** Wire contract conformance remains a coordination dependency for final serialization cleanup, not a not-started blocker.
6. **No canonical files were modified.** This remains a support-only artifact.

### Questions for Parent Owner

- Q1: Should persistence migration be done incrementally (one service at a time) or as a single batch?
- Q2: Is raw `pg.Pool` the intended long-term approach, or should an ORM be introduced?
- Q3: Should materialized view refresh be handled by services or a separate scheduled job?

## 6. Reviewer Closeout

- Reviewer sweep corrected the migration count from 10 to 11 (`V0011__phase1_runtime_snapshots.sql` is live in `infra/migrations/`).
- Reviewer sweep reclassified `callcenter`, `complaint`, and `owned-mobility` from "no repository yet" to "repository stub exists but is not wired into runtime".
- Reviewer sweep removed `product-rule` from the unresolved persistence backlog because it is a static catalog endpoint, not mutable runtime state.
- Packet is acceptable as a support artifact for parent-task planning and handoff.

---

_End of acceptance packet. Reviewer sweep complete; ready for owner finalize._

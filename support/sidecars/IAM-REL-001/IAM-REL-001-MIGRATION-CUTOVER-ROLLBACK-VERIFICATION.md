# Stage 1.5 IAM Database Migration Cutover & Rollback Verification (`IAM-REL-001`)

- **Task**: `IAM-REL-001`
- **Component**: Database Migrations & Schema Engine (V0001–V0076)
- **Owner**: `Gemini2`
- **Reviewer**: `Claude`
- **Verification Date**: `2026-08-13`

---

## 1. Migration Sequence & Backward Compatibility

Stage 1.5 IAM hardening incorporates 76 canonical schema migrations (V0001 through V0076) managed via `./scripts/db-apply.sh` and PostgreSQL Flyway-compatible versioning.

### Key IAM Schema Extensions (V0060–V0076):

1. **Append-Only Audit Events (`admin.security_events`)**:
   - Implements PostgreSQL triggers enforcing `BEFORE UPDATE OR DELETE ON admin.security_events` to raise exceptions.
   - Tested & verified in `tests/unit/db-apply.test.ts` (`creates append-only security events that reject update and delete`).
2. **Session Outbox & Revocation (`ops.driver_completion_outbox`, `core.user_sessions`)**:
   - Foreign key & cascade safety checks ensure session invalidation outbox entries remain durable across order/task events.
   - Tested & verified in `tests/unit/db-apply.test.ts` (`keeps driver-completion outbox durable across task or order deletes`).
3. **Internal & Partner Credential Storage**:
   - Enforces hash-only storage (`sha256`) for API keys, secret tokens, and webhook secrets. No raw credentials persisted.
4. **Service Area & Geofence Authority Replay (V0048–V0050 Replay Safety)**:
   - Validated migration ledger replay for legacy database instances without data loss or column ambiguity.

---

## 2. Empirical Verification Evidence

### 2.1 Schema Verification Command (`pnpm db:verify`)

```
[info] DATABASE_URL defaulting to postgresql://postgres:postgres@localhost:5432/drts_fleet_platform
DO
      metric       | value
-------------------+-------
 complaints        |     1
 drivers           |     3
 driver_statements |     1
 orders            |     3
 schema_migrations |    76
 seed_runs         |     2
 tenants           |     2
 vehicles          |     3
(8 rows)

[done] schema verification passed
```

### 2.2 Replay & Triggers Unit Test (`tests/unit/db-apply.test.ts`)

- Replays renamed and re-numbered service-area migrations for legacy ledgers: **PASSED (93.1s)**
- Keeps driver-completion outbox durable across task or order deletes: **PASSED (65.2s)**
- Creates append-only security events that reject update and delete: **PASSED (65.0s)**

---

## 3. Cutover & Rollback Drill Plan

### 3.1 Expand-Contract Migration Safety

1. **Expand Phase**: New columns (e.g. `masked_context`, `realm`, `auth_methods`) are added as nullable or with backward-compatible defaults. Old service instances continue functioning without interruption.
2. **Backfill Phase**: Seeds `S0001__reference_seed` and `S0002__demo_operational_seed` ensure reference accounts, permissions, and initial keyrings are present.
3. **Cutover Phase**: API and Worker runbooks switch read/write paths to new IAM endpoints. Session revocation outbox listeners activate.
4. **Contract Phase**: Deprecated email-only auth routes are disabled. Startup guard (`AuthStartupConfigService`) fails closed if strict IAM environment variables are absent.

### 3.2 Rollback Safety & Hold Verification

- If a deployment failure occurs during Cutover, the system falls back to `origin/dev` base image without database rollback required (all schema additions are strictly additive).
- In the event of data corruption or emergency containment, `admin.security_events` records full audit lineage, and `scripts/iam-incident-response-drill.py` can be executed to freeze tenant sessions and place affected accounts on `rollback_hold`.

# Audit Log Immutability & Privileged Retention Archival Runbook

**Reference:** GAP-CONF-03 / Gate C1 / PRD 13.3 & 14.2.7 / Contracts §3.13  
**Status:** Active  
**Author:** Codex  
**Reviewer:** Claude

---

## 1. Overview and Threat Model

The DRTS Fleet Platform requires an append-only, tamper-evident audit trail for governance, compliance, and regulatory traceability (`admin.audit_logs`).

The primary threat model addressed by GAP-CONF-03 is an authorized insider or compromised application connection attempting to mutate or conceal historical audit records after the fact (e.g. via direct SQL `UPDATE`, `DELETE`, or `TRUNCATE` statements).

### Security Architecture & Control Hierarchy

1. **Primary Control A — Engine-Level Row Trigger (`BEFORE UPDATE OR DELETE`):**
   - Implemented via migration `V0080__audit_log_immutability.sql`.
   - The trigger `trg_audit_logs_append_only` on `admin.audit_logs` executes `admin.raise_audit_logs_append_only()`.
   - Any `UPDATE` statement is unconditionally rejected with exception `'admin.audit_logs is append-only'`.
   - Any direct `DELETE` statement without verified retention privileges is rejected with exception `'admin.audit_logs is append-only'`.
   - Because PostgreSQL triggers execute for table owners and superusers alike, this constraint binds the connection user regardless of its administrative standing.

2. **Primary Control B — Engine-Level Statement Trigger (`BEFORE TRUNCATE`):**
   - In PostgreSQL, `TRUNCATE` operations bypass row-level triggers entirely (`FOR EACH ROW` triggers never fire on TRUNCATE).
   - To eliminate this bypass vector, migration `V0080` installs `trg_audit_logs_prevent_truncate` as a `BEFORE TRUNCATE ON admin.audit_logs FOR EACH STATEMENT` trigger executing `admin.raise_audit_logs_append_only()`.
   - Any `TRUNCATE` attempt is unconditionally rejected with exception `'admin.audit_logs is append-only'`, even if retention archival flags are present.

3. **Defence in Depth — Role Permissions (`REVOKE`):**
   - `REVOKE UPDATE, DELETE, TRUNCATE ON admin.audit_logs FROM PUBLIC;`
   - _Role Justification:_ In development, CI, and current Cloud SQL staging environments, `DATABASE_URL` connects as `postgres` or the table-owning database principal. Because table owners bypass standard SQL `GRANT`/`REVOKE` DAC checks, `REVOKE` alone is inert against table-owner connections. The database triggers are the indispensable primary controls. `REVOKE` is retained as defence-in-depth for auxiliary non-owner roles.

4. **Privileged Archival Path & Privilege Gating:**
   - Lawful regulatory data retention policies (e.g., 7-year / 2555-day retention) require pruning aged records.
   - Crucially, lawful archival must **never require removing, disabling, or modifying the trigger protection** (i.e. no `DROP TRIGGER` or `ALTER TABLE ... DISABLE TRIGGER`).
   - The trigger checks both:
     1. Transaction-scoped configuration: `current_setting('audit.allow_retention_archival', true) = 'on'`
     2. Privilege verification: `session_user = 'postgres'` OR `pg_has_role(session_user, 'audit_retention_operator', 'USAGE' | 'MEMBER')`
   - Only a transaction meeting both conditions within its transaction boundary is permitted to delete aged rows during an authorized retention sweep.

5. **Accepted Residual Risk in Phase 1 & Future Hardening:**
   - In Phase 1 environments, application services, database migrations, and operational maintenance scripts connect using the shared database owner role (`postgres` via `DATABASE_URL`).
   - *Residual Risk:* Any process possessing the direct `postgres` connection string can technically execute `SET LOCAL audit.allow_retention_archival = 'on'` prior to a `DELETE`.
   - *Mitigation in Phase 1:* The engine triggers unconditionally eliminate all unintentional, ORM-generated, query-builder, and ad-hoc mutations (`UPDATE` and `TRUNCATE` have no bypass whatsoever; `DELETE` requires explicit multi-step intent).
   - *Future Hardening:* When production least-privilege role separation is provisioned (e.g. creating distinct application roles such as `drts_api_app` without membership in `audit_retention_operator` and granting only `SELECT, INSERT` on `admin.audit_logs`), the database engine will strictly prevent application connections from executing the retention bypass even if they attempt to set the session flag.

---

## 2. Privileged Archival Procedure

The privileged archival script `./operations/database/audit-log-retention-archival.sh` automates export and deletion of aged records.

### Dry-Run Verification

Inspect candidate records without modifying any data:

```bash
./operations/database/audit-log-retention-archival.sh --dry-run --retention-days 2555
```

### Execution (Apply Mode)

Execute archival export to JSON Lines and purge aged records in an atomic transaction:

```bash
./operations/database/audit-log-retention-archival.sh --apply --retention-days 2555 --export-dir /var/log/drts/audit-archives
```

### Execution Mechanism

Inside `audit-log-retention-archival.sh`, the purge runs in an isolated transaction:

```sql
BEGIN;
-- Enable privileged retention bypass only for this specific transaction:
SET LOCAL audit.allow_retention_archival = 'on';

-- Purge records older than the retention threshold:
DELETE FROM admin.audit_logs
WHERE created_at < (now() - interval '2555 days');

COMMIT;
```

Once the transaction ends (commit or rollback), `audit.allow_retention_archival` immediately reverts to unset, ensuring subsequent queries in any session remain strictly blocked from modifying or deleting audit records.

---

## 3. Negative Verification & Automated Tests

Automated regression and negative tests verify that:

1. Direct `UPDATE admin.audit_logs` throws an exception and alters 0 rows.
2. Direct `DELETE FROM admin.audit_logs` throws an exception and alters 0 rows.
3. Direct `TRUNCATE admin.audit_logs` throws an exception and alters 0 rows (even with archival flag).
4. Normal `INSERT` and `SELECT` queries continue to operate seamlessly.
5. Privileged archival deletion succeeds only when authorized with `SET LOCAL audit.allow_retention_archival = 'on'` by an operator role.

Test suites:

- `tests/security/audit-log-immutability-negative.test.ts`
- `tests/unit/db-apply.test.ts`

# Audit Log Immutability & Privileged Retention Archival Runbook

**Reference:** GAP-CONF-03 / Gate C1 / PRD 13.3 & 14.2.7 / Contracts §3.13  
**Status:** Active  
**Author:** Codex  
**Reviewer:** Claude

---

## 1. Overview and Threat Model

The DRTS Fleet Platform requires an append-only, tamper-evident audit trail for governance, compliance, and regulatory traceability (`admin.audit_logs`).

The primary threat model addressed by GAP-CONF-03 is an authorized insider or compromised application connection attempting to mutate or conceal historical audit records after the fact (e.g. by running direct SQL `UPDATE` or `DELETE` statements).

### Security Architecture & Control Hierarchy

1. **Primary Control — Engine-Level Trigger (`BEFORE UPDATE OR DELETE`):**
   - Implemented via migration `V0080__audit_log_immutability.sql`.
   - The trigger `trg_audit_logs_append_only` on `admin.audit_logs` executes `admin.raise_audit_logs_append_only()`.
   - Any `UPDATE` statement is unconditionally rejected with exception `'admin.audit_logs is append-only'`.
   - Any direct `DELETE` statement is rejected with exception `'admin.audit_logs is append-only'`.
   - Because PostgreSQL row-level triggers execute for table owners and superusers alike, this constraint binds the connection user regardless of its administrative standing.

2. **Defence in Depth — Role Permissions (`REVOKE`):**
   - `REVOKE UPDATE, DELETE ON admin.audit_logs FROM PUBLIC;`
   - _Role Justification:_ In development, CI, and current Cloud SQL staging environments, `DATABASE_URL` connects as `postgres` or the table-owning database principal. Because table owners bypass standard SQL `GRANT`/`REVOKE` DAC checks, `REVOKE` alone is inert against table-owner connections. The database trigger is the indispensable primary control. `REVOKE` is retained as defence-in-depth for auxiliary non-owner roles.

3. **Privileged Archival Path:**
   - Lawful regulatory data retention policies (e.g., 7-year / 2555-day retention) require pruning aged records.
   - Crucially, lawful archival must **never require removing, disabling, or modifying the trigger protection** (i.e. no `DROP TRIGGER` or `ALTER TABLE ... DISABLE TRIGGER`).
   - The trigger checks `current_setting('audit.allow_retention_archival', true) = 'on'`.
   - Only a transaction that explicitly executes `SET LOCAL audit.allow_retention_archival = 'on'` within its transaction boundary is permitted to delete aged rows during an authorized retention sweep.

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
3. Normal `INSERT` and `SELECT` queries continue to operate seamlessly.
4. Privileged archival deletion succeeds only with `SET LOCAL audit.allow_retention_archival = 'on'`.

Test suites:

- `tests/security/audit-log-immutability-negative.test.ts`
- `tests/unit/db-apply.test.ts`

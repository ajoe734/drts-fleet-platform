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
   - Lawful regulatory data retention policies (e.g., the existing 730-day audit retention baseline) require pruning aged records.
   - Crucially, lawful archival must **never require removing, disabling, or modifying the trigger protection** (i.e. no `DROP TRIGGER` or `ALTER TABLE ... DISABLE TRIGGER`).
   - The trigger checks both:
     1. Transaction-scoped configuration: `current_setting('audit.allow_retention_archival', true) = 'on'`
     2. Privilege verification: `pg_has_role(current_user, 'audit_retention_operator', 'USAGE')` OR the corresponding `'MEMBER'` check, exactly as published in V0080
   - Only a transaction meeting both conditions within its transaction boundary is permitted to delete aged rows during an authorized retention sweep.

5. **Accepted Residual Risk in Phase 1 & Future Hardening:**
   - In Phase 1 environments, application services, database migrations, and operational maintenance scripts connect using the shared database owner role (`postgres` via `DATABASE_URL`).
   - _Residual Risk:_ Any process possessing the direct `postgres` connection string can technically execute `SET LOCAL audit.allow_retention_archival = 'on'` prior to a `DELETE`.
   - _Mitigation in Phase 1:_ The engine triggers unconditionally eliminate all unintentional, ORM-generated, query-builder, and ad-hoc mutations (`UPDATE` and `TRUNCATE` have no bypass whatsoever; `DELETE` requires explicit multi-step intent).
   - _Future Hardening:_ When production least-privilege role separation is provisioned (e.g. creating distinct application roles such as `drts_api_app` without membership in `audit_retention_operator` and granting only `SELECT, INSERT` on `admin.audit_logs`), the database engine will strictly prevent application connections from executing the retention bypass even if they attempt to set the session flag.

---

## 2. Privileged Archival Procedure

The privileged archival script `./operations/database/audit-log-retention-archival.sh` automates export and deletion of aged records.

### Dry-Run Verification

Inspect candidate records without modifying any data:

```bash
./operations/database/audit-log-retention-archival.sh --dry-run --retention-days 730
```

### Execution (Apply Mode)

Execute archival export to JSON Lines and purge aged records in an atomic transaction:

```bash
./operations/database/audit-log-retention-archival.sh --apply --retention-days 730 --export-dir /var/log/drts/audit-archives
```

### Execution Mechanism

The Operator owns execution. Do not run these commands on the worker VM. Use
only the separately authorized operational environment, with the existing
retention role, source backup, sufficient local disk space and a reviewed sweep
window. This change neither provisions roles nor verifies current deployment
permissions.

The script passes `-X -qAt -v ON_ERROR_STOP=1` to its actual `run_psql` invocation.
Apply uses one connection and transaction:

1. `BEGIN` and `LOCK TABLE admin.audit_logs IN SHARE ROW EXCLUSIVE MODE` serialize
   the sweep with audit/governance inserts and other sweeps. Writers wait until
   completion; plan the operational window for this lock and local file I/O.
2. `audit-log-retention-governance.sql` materializes a temporary candidate table.
   The cutoff uses the transaction's `CURRENT_TIMESTAMP` and the unchanged
   operator-selected retention threshold (default 730 days). Latest persisted
   hold/exception events suppress active subjects, manifests and source
   references, with their tenant associations. A known physical `tenant_id`
   determines the audit row's tenant even if `new_value.tenantId` disagrees.
   Only a NULL physical tenant falls back to the payload tenant (including
   non-UUID logical tenants normalized away by the repository). Expired or
   resolved exceptions and released holds follow the existing rules. Unknown normalized physical
   tenants do not justify purging an otherwise matching protected reference.
3. Active protection history stays in the source. Closed/expired entity history
   leaves only when its whole event chain is old enough and otherwise eligible,
   so deleting a terminal event cannot resurrect a retained active event during
   replay. No new retention duration or permanent-storage policy is introduced.
4. Client-side `\copy` writes the fixed candidates as the existing JSONL objects
   to a unique `audit_logs_archived_<UTC>_<suffix>.jsonl` file. Control-character
   CSV delimiters preserve JSON backslashes without adding CSV quoting to valid
   JSON text. The client reads that file back into a temporary JSONB table.
5. A bidirectional `EXCEPT ALL` compares the entire archived row multiset with
   the selected rows. Only after equality is proven does the script execute:

   ```sql
   SET LOCAL audit.allow_retention_archival = 'on';
   DELETE FROM admin.audit_logs target
   USING audit_retention_candidates archived
   WHERE target.audit_id = archived.audit_id;
   COMMIT;
   ```

The DELETE has no independently reevaluated age predicate. Rows that cross the
cutoff or become visible after selection cannot enter this deletion set.
V0080 still requires both role membership and the local flag, and still rejects
ordinary UPDATE/DELETE/TRUNCATE.

A file open/write/readback/mismatch or SQL/permission/trigger/transaction error
exits nonzero, disconnecting and rolling back before any successful purge
receipt. A partial or uncommitted archive may remain for diagnosis: file
creation is not a purge receipt. Success prints only after confirmed COMMIT.
An empty lawful set is a clean no-op and its empty reserved file is removed.
Dry-run executes the same selection without the apply lock, export or DELETE;
its transaction only materializes a temporary inspection set.

Paths with spaces are supported; quotes, backslashes and newlines in the
resolved export directory are rejected before connecting, since `\copy` uses
literal client-side filenames. Each apply creates a distinct private archive
file rather than overwriting a prior sweep in the same second.

### Archived identity and recoverability boundary

Each JSONL row includes the original `audit_id`, `actor_id`, `actor_type`,
`tenant_id`, `module_name`, `action_name`, `resource_type`, `resource_id`,
`old_value`, `new_value`, `request_id`, `ip_address` (host text), `user_agent`,
`hash_value` and `created_at`. It preserves the persisted row identity and
values; it cannot reconstruct actor/tenant identifiers that were normalized
away before persistence. Keep successful archives under the existing Operator
custody and retention policy. Files are local to the selected operational
client; this script does not upload them to a cloud store.

The readback proves that the selected file held the complete selected row
values before purge. It is not a backup durability guarantee or an executed
restore rehearsal. An authorized restore would need to preserve these original
IDs, times and values through the normal INSERT path and handle existing IDs;
this runbook provides no automatic restore command. Deployed-role verification,
archive custody and actual recovery rehearsal remain separate Operator work.

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

Socket-free Source regressions also exercise the production controller,
repository serialization and shell entry point:

- `tests/unit/evidence-retention-legal-hold-canonical-flow-20261015/`

The shell client double evaluates the actual candidate SELECT with a SQLite
projection over V0009's columns, translating only casts and clock arithmetic;
it controls COPY and transaction failures. These tests do not establish
PostgreSQL parser/lock/trigger/role behavior or a live archive/delete/restore.

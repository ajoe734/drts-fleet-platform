import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");
const adminUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/drts_fleet_platform";

function bash(command: string, env: NodeJS.ProcessEnv = {}) {
  return execFileSync("bash", ["-lc", command], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
    stdio: "pipe",
  });
}

function psqlCommand(databaseUrl: string, sql: string) {
  return [
    "if command -v psql >/dev/null 2>&1; then",
    `  PGPASSWORD=postgres psql "${databaseUrl}" -v ON_ERROR_STOP=1 -At <<'SQL'`,
    sql,
    "SQL",
    "else",
    "  docker compose -f docker-compose.dev.yml exec -T -e PGPASSWORD=postgres postgres \\",
    `    psql "${databaseUrl}" -v ON_ERROR_STOP=1 -At <<'SQL'`,
    sql,
    "SQL",
    "fi",
  ].join("\n");
}

function applyV0080(databaseUrl: string) {
  return bash(
    [
      "if command -v psql >/dev/null 2>&1; then",
      `  PGPASSWORD=postgres psql "${databaseUrl}" -v ON_ERROR_STOP=1 -f "infra/migrations/V0080__audit_log_immutability.sql"`,
      "else",
      "  docker compose -f docker-compose.dev.yml exec -T -e PGPASSWORD=postgres postgres \\",
      `    psql "${databaseUrl}" -v ON_ERROR_STOP=1 < "infra/migrations/V0080__audit_log_immutability.sql"`,
      "fi",
    ].join("\n"),
  );
}

describe("Audit Log Immutability Negative Tests (GAP-CONF-03 / Gate C1)", () => {
  it("enforces database-level append-only protection: rejects UPDATE, rejects DELETE, rejects TRUNCATE, allows INSERT/SELECT, and allows privileged archival", () => {
    const auditId = randomUUID();
    const requestId = `req-sec-audit-immutability-${randomUUID().slice(0, 8)}`;
    // 1. Ensure migrations (including V0080) are applied
    bash("./operations/database/db-apply.sh", {
      DATABASE_URL: adminUrl,
    });
    applyV0080(adminUrl);

    // 2. Insert test audit log row directly
    bash(
      psqlCommand(
        adminUrl,
        `
INSERT INTO admin.audit_logs (
  audit_id,
  actor_id,
  actor_type,
  module_name,
  action_name,
  resource_type,
  resource_id,
  request_id,
  created_at,
  new_value
) VALUES (
  '${auditId}',
  gen_random_uuid(),
  'ops_user',
  'audit-security-test',
  'test_action',
  'test_resource',
  'res-001',
  '${requestId}',
  now(),
  '{"status":"initial"}'::jsonb
) ON CONFLICT (audit_id) DO NOTHING;
        `,
      ),
    );

    // 3. Verify INSERT and SELECT succeed and row exists
    const initialRow = bash(
      psqlCommand(
        adminUrl,
        `
SELECT count(*)::text || '|' || min(action_name)
FROM admin.audit_logs
WHERE audit_id = '${auditId}';
        `,
      ),
    ).trim();
    expect(initialRow).toBe("1|test_action");

    // 4. NEGATIVE TEST 1: Direct UPDATE must raise exception and fail
    let updateError: Error | null = null;
    try {
      bash(
        psqlCommand(
          adminUrl,
          `
UPDATE admin.audit_logs
SET action_name = 'tampered_action'
WHERE audit_id = '${auditId}';
          `,
        ),
      );
    } catch (error) {
      updateError = error as Error;
    }
    expect(updateError).not.toBeNull();
    expect(String(updateError?.message)).toContain(
      "admin.audit_logs is append-only",
    );

    // 5. Verify row was not mutated by UPDATE
    const rowAfterUpdateAttempt = bash(
      psqlCommand(
        adminUrl,
        `
SELECT count(*)::text || '|' || min(action_name)
FROM admin.audit_logs
WHERE audit_id = '${auditId}';
        `,
      ),
    ).trim();
    expect(rowAfterUpdateAttempt).toBe("1|test_action");

    // 6. NEGATIVE TEST 2: Direct DELETE must raise exception and fail
    let deleteError: Error | null = null;
    try {
      bash(
        psqlCommand(
          adminUrl,
          `
DELETE FROM admin.audit_logs
WHERE audit_id = '${auditId}';
          `,
        ),
      );
    } catch (error) {
      deleteError = error as Error;
    }
    expect(deleteError).not.toBeNull();
    expect(String(deleteError?.message)).toContain(
      "admin.audit_logs is append-only",
    );

    // 7. Verify row was not deleted by DELETE
    const rowAfterDeleteAttempt = bash(
      psqlCommand(
        adminUrl,
        `
SELECT count(*)::text || '|' || min(action_name)
FROM admin.audit_logs
WHERE audit_id = '${auditId}';
        `,
      ),
    ).trim();
    expect(rowAfterDeleteAttempt).toBe("1|test_action");

    // 8. NEGATIVE TEST 3: Direct TRUNCATE must raise exception and fail (statement-level trigger)
    let truncateError: Error | null = null;
    try {
      bash(
        psqlCommand(
          adminUrl,
          `
TRUNCATE admin.audit_logs;
          `,
        ),
      );
    } catch (error) {
      truncateError = error as Error;
    }
    expect(truncateError).not.toBeNull();
    expect(String(truncateError?.message)).toContain(
      "admin.audit_logs is append-only",
    );

    // 9. NEGATIVE TEST 4: TRUNCATE even with archival flag must raise exception and fail
    let truncateWithFlagError: Error | null = null;
    try {
      bash(
        psqlCommand(
          adminUrl,
          `
BEGIN;
SET LOCAL audit.allow_retention_archival = 'on';
TRUNCATE admin.audit_logs;
COMMIT;
          `,
        ),
      );
    } catch (error) {
      truncateWithFlagError = error as Error;
    }
    expect(truncateWithFlagError).not.toBeNull();
    expect(String(truncateWithFlagError?.message)).toContain(
      "admin.audit_logs is append-only",
    );

    // 10. Verify rows persist after failed TRUNCATE attempts
    const rowAfterTruncateAttempts = bash(
      psqlCommand(
        adminUrl,
        `
SELECT count(*)::text || '|' || min(action_name)
FROM admin.audit_logs
WHERE audit_id = '${auditId}';
        `,
      ),
    ).trim();
    expect(rowAfterTruncateAttempts).toBe("1|test_action");

    // 11. PRIVILEGE GATING TEST: An unprivileged role with bypass flag cannot DELETE
    const unprivilegedRole = `unprivileged_test_user_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    let unprivilegedDeleteError: Error | null = null;
    try {
      bash(
        psqlCommand(
          adminUrl,
          `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${unprivilegedRole}') THEN
    CREATE ROLE ${unprivilegedRole} LOGIN;
  END IF;
  GRANT USAGE ON SCHEMA admin TO ${unprivilegedRole};
  GRANT SELECT, DELETE ON admin.audit_logs TO ${unprivilegedRole};
END $$;

SET ROLE ${unprivilegedRole};
BEGIN;
SET LOCAL audit.allow_retention_archival = 'on';
DELETE FROM admin.audit_logs WHERE audit_id = '${auditId}';
COMMIT;
RESET ROLE;
          `,
        ),
      );
    } catch (error) {
      unprivilegedDeleteError = error as Error;
    } finally {
      bash(
        psqlCommand(
          adminUrl,
          `
RESET ROLE;
DROP OWNED BY ${unprivilegedRole};
DROP ROLE IF EXISTS ${unprivilegedRole};
          `,
        ),
      );
    }
    expect(unprivilegedDeleteError).not.toBeNull();
    expect(String(unprivilegedDeleteError?.message)).toContain(
      "admin.audit_logs is append-only",
    );

    // 12. Verify row still exists after unprivileged delete attempt
    const rowAfterUnprivilegedAttempt = bash(
      psqlCommand(
        adminUrl,
        `
SELECT count(*)::text || '|' || min(action_name)
FROM admin.audit_logs
WHERE audit_id = '${auditId}';
        `,
      ),
    ).trim();
    expect(rowAfterUnprivilegedAttempt).toBe("1|test_action");

    // 13. PRIVILEGED ARCHIVAL TEST: With SET LOCAL audit.allow_retention_archival = 'on' as postgres/operator, deletion succeeds
    bash(
      psqlCommand(
        adminUrl,
        `
BEGIN;
SET LOCAL audit.allow_retention_archival = 'on';
DELETE FROM admin.audit_logs WHERE audit_id = '${auditId}';
COMMIT;
        `,
      ),
    );

    // 14. Verify row is deleted after lawful privileged archival sweep
    const rowAfterArchival = bash(
      psqlCommand(
        adminUrl,
        `
SELECT count(*)::text
FROM admin.audit_logs
WHERE audit_id = '${auditId}';
        `,
      ),
    ).trim();
    expect(rowAfterArchival).toBe("0");
  }, 180_000);

  it("verifies migration V0080 idempotency on repeated execution and direct replay", () => {
    // 1. Re-applying all migrations skips already applied V0080 cleanly
    const applyOutput = bash("./operations/database/db-apply.sh", {
      DATABASE_URL: adminUrl,
    });
    expect(applyOutput).toContain("[skip] V0080 already applied");
    expect(applyOutput).toContain(
      "[done] migrations applied from infra/migrations",
    );

    // 2. Direct replay of V0080 SQL script executes idempotently
    const directReplay = applyV0080(adminUrl);
    expect(directReplay).toContain("CREATE FUNCTION");
    expect(directReplay).toContain("CREATE TRIGGER");
    expect(directReplay).toContain("REVOKE");
  }, 120_000);
});

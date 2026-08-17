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

describe("Audit Log Immutability Negative Tests (GAP-CONF-03 / Gate C1)", () => {
  it("enforces database-level append-only protection: rejects UPDATE, rejects DELETE, allows INSERT/SELECT, and allows privileged archival", () => {
    const auditId = randomUUID();
    const requestId = `req-sec-audit-immutability-${randomUUID().slice(0, 8)}`;
    // 1. Ensure migrations (including V0080) are applied
    bash("./operations/database/db-apply.sh", {
      DATABASE_URL: adminUrl,
    });

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

    // 8. PRIVILEGED ARCHIVAL TEST: With SET LOCAL audit.allow_retention_archival = 'on', deletion succeeds
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

    // 9. Verify row is deleted after lawful privileged archival sweep
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
    const directReplay = bash(
      [
        "if command -v psql >/dev/null 2>&1; then",
        `  PGPASSWORD=postgres psql "${adminUrl}" -v ON_ERROR_STOP=1 -f "infra/migrations/V0080__audit_log_immutability.sql"`,
        "else",
        "  docker compose -f docker-compose.dev.yml exec -T -e PGPASSWORD=postgres postgres \\",
        `    psql "${adminUrl}" -v ON_ERROR_STOP=1 < "infra/migrations/V0080__audit_log_immutability.sql"`,
        "fi",
      ].join("\n"),
    );
    expect(directReplay).toContain("CREATE FUNCTION");
    expect(directReplay).toContain("CREATE TRIGGER");
    expect(directReplay).toContain("REVOKE");
  }, 120_000);
});

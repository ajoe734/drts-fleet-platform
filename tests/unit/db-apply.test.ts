import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");
const adminUrl = "postgresql://postgres:postgres@localhost:5432/postgres";
const toolDir = mkdtempSync(path.join(os.tmpdir(), "db-apply-test-"));
const localPsqlPath = (() => {
  const candidate = execFileSync("bash", ["-lc", "command -v psql || true"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();

  if (!candidate) {
    return "";
  }

  try {
    execFileSync(
      candidate,
      [adminUrl, "-v", "ON_ERROR_STOP=1", "-c", "SELECT 1;"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: "pipe",
        env: {
          ...process.env,
          PGPASSWORD: "postgres",
        },
      },
    );
    return candidate;
  } catch {
    return "";
  }
})();

function bash(command: string, env: NodeJS.ProcessEnv = {}) {
  return execFileSync("bash", ["-lc", command], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${toolDir}:${process.env.PATH ?? ""}`,
      ...env,
    },
    encoding: "utf8",
    stdio: "pipe",
  });
}

function checksum(relativePath: string) {
  return createHash("sha256")
    .update(readFileSync(path.join(repoRoot, relativePath)))
    .digest("hex");
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

describe("db-apply legacy migration canonicalization", () => {
  const dbName = `drts_e2e_fix_d_${process.pid}_${Date.now()}`;
  const databaseUrl = `postgresql://postgres:postgres@localhost:5432/${dbName}`;

  beforeAll(() => {
    writeFileSync(
      path.join(toolDir, "psql"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        "file=''",
        "args=()",
        "while [[ $# -gt 0 ]]; do",
        '  case "$1" in',
        "    -f)",
        '      file="$2"',
        "      shift 2",
        "      ;;",
        "    *)",
        '      args+=("$1")',
        "      shift",
        "      ;;",
        "  esac",
        "done",
        `if [[ -n "${localPsqlPath}" ]]; then`,
        '  if [[ -n "$file" ]]; then',
        `    exec "${localPsqlPath}" "\${args[@]}" -f "$file"`,
        "  fi",
        `  exec "${localPsqlPath}" "\${args[@]}"`,
        "fi",
        'if [[ -n "$file" ]]; then',
        `  exec docker compose -f "${repoRoot}/docker-compose.dev.yml" exec -T -e PGPASSWORD="\${PGPASSWORD:-postgres}" postgres psql "\${args[@]}" < "$file"`,
        "fi",
        `exec docker compose -f "${repoRoot}/docker-compose.dev.yml" exec -T -e PGPASSWORD="\${PGPASSWORD:-postgres}" postgres psql "\${args[@]}"`,
      ].join("\n"),
      { mode: 0o755 },
    );
  });

  afterAll(() => {
    bash(
      [
        "if command -v psql >/dev/null 2>&1; then",
        `  PGPASSWORD=postgres psql "${adminUrl}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${dbName};"`,
        "else",
        "  docker compose -f docker-compose.dev.yml exec -T -e PGPASSWORD=postgres postgres \\",
        `    psql "${adminUrl}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${dbName};"`,
        "fi",
      ].join("\n"),
    );
    rmSync(toolDir, { force: true, recursive: true });
  });

  it("uses unique migration versions in the repo ledger", () => {
    const versions = readdirSync(path.join(repoRoot, "infra/migrations"))
      .filter((file) => /^V[0-9A-Z]+__.+\.sql$/.test(file))
      .map((file) => file.split("__", 1)[0]);
    const duplicates = versions.filter(
      (version, index) => versions.indexOf(version) !== index,
    );

    expect(duplicates).toEqual([]);
  });

  it("replays renamed and re-numbered service-area migrations for legacy ledgers", () => {
    const v0050Checksum = checksum(
      "infra/migrations/V0050__supply_external_ids_as_varchar.sql",
    );
    const v0048Checksum = checksum(
      "infra/migrations/V0048__service_area_review_lifecycle.sql",
    );
    const v0049Checksum = checksum(
      "infra/migrations/V0049__service_area_baseline_seed.sql",
    );

    bash(
      [
        "if command -v psql >/dev/null 2>&1; then",
        `  PGPASSWORD=postgres psql "${adminUrl}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${dbName};" -c "CREATE DATABASE ${dbName};"`,
        "else",
        "  docker compose -f docker-compose.dev.yml exec -T -e PGPASSWORD=postgres postgres \\",
        `    psql "${adminUrl}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${dbName};" -c "CREATE DATABASE ${dbName};"`,
        "fi",
      ].join("\n"),
    );

    bash("./operations/database/db-apply.sh", {
      DATABASE_URL: databaseUrl,
    });

    bash(
      psqlCommand(
        databaseUrl,
        `
DELETE FROM admin.schema_migrations
WHERE version IN ('V0036', 'V0037', 'V0047', 'V0048', 'V0049', 'V0050');

INSERT INTO admin.schema_migrations(version, file_name, checksum)
VALUES
  ('V0036', 'V0036__supply_external_ids_as_varchar.sql', '${v0050Checksum}'),
  ('V0037', 'V0037__service_area_review_lifecycle.sql', '${v0048Checksum}'),
  ('V0047', 'V0047__service_area_baseline_seed.sql', '${v0049Checksum}');

DROP TABLE IF EXISTS ops.stop_policies;
DROP TABLE IF EXISTS ops.service_area_boundaries;
          `,
      ),
    );

    bash("./operations/database/db-apply.sh", {
      DATABASE_URL: databaseUrl,
    });

    const migrationRows = bash(
      psqlCommand(
        databaseUrl,
        `
SELECT version || '|' || file_name
FROM admin.schema_migrations
WHERE version IN ('V0036', 'V0037', 'V0047', 'V0048', 'V0049', 'V0050')
ORDER BY version;
          `,
      ),
    )
      .trim()
      .split("\n");

    expect(migrationRows).toEqual([
      "V0036|V0036__service_area_geofence_authority.sql",
      "V0037|V0037__phase2_av_sandbox_evidence_skeleton.sql",
      "V0048|V0048__service_area_review_lifecycle.sql",
      "V0049|V0049__service_area_baseline_seed.sql",
      "V0050|V0050__supply_external_ids_as_varchar.sql",
    ]);

    const serviceAreaTable = bash(
      psqlCommand(
        databaseUrl,
        `
SELECT to_regclass('ops.service_area_boundaries');
          `,
      ),
    ).trim();
    const stopPolicyTable = bash(
      psqlCommand(
        databaseUrl,
        `
SELECT to_regclass('ops.stop_policies');
          `,
      ),
    ).trim();
    const serviceAreaColumnCount = Number(
      bash(
        psqlCommand(
          databaseUrl,
          `
SELECT count(*)
FROM information_schema.columns
WHERE table_schema = 'ops'
  AND table_name = 'service_area_boundaries';
            `,
        ),
      ).trim(),
    );
    const stopPolicyColumnCount = Number(
      bash(
        psqlCommand(
          databaseUrl,
          `
SELECT count(*)
FROM information_schema.columns
WHERE table_schema = 'ops'
  AND table_name = 'stop_policies';
            `,
        ),
      ).trim(),
    );

    expect(serviceAreaTable).toBe("ops.service_area_boundaries");
    expect(stopPolicyTable).toBe("ops.stop_policies");
    expect(serviceAreaColumnCount).toBeGreaterThan(0);
    expect(stopPolicyColumnCount).toBeGreaterThan(0);
  }, 180_000);

  it("keeps driver-completion outbox durable across task or order deletes", () => {
    bash(
      [
        "if command -v psql >/dev/null 2>&1; then",
        `  PGPASSWORD=postgres psql "${adminUrl}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${dbName};" -c "CREATE DATABASE ${dbName};"`,
        "else",
        "  docker compose -f docker-compose.dev.yml exec -T -e PGPASSWORD=postgres postgres \\",
        `    psql "${adminUrl}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${dbName};" -c "CREATE DATABASE ${dbName};"`,
        "fi",
      ].join("\n"),
    );

    bash("./operations/database/db-apply.sh", {
      DATABASE_URL: databaseUrl,
    });

    const foreignKeys = bash(
      psqlCommand(
        databaseUrl,
        `
SELECT conname || '|' || pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'ops.driver_completion_outbox'::regclass
  AND contype = 'f'
ORDER BY conname;
        `,
      ),
    )
      .trim()
      .split("\n");

    expect(foreignKeys).toEqual([
      "driver_completion_outbox_order_fk|FOREIGN KEY (order_id) REFERENCES ops.phase1_owned_orders(order_id)",
      "driver_completion_outbox_task_order_fk|FOREIGN KEY (task_id, order_id) REFERENCES ops.phase1_driver_tasks(task_id, order_id)",
    ]);

    const checkConstraints = bash(
      psqlCommand(
        databaseUrl,
        `
SELECT conname
FROM pg_constraint
WHERE conrelid = 'ops.driver_completion_outbox'::regclass
  AND contype = 'c'
ORDER BY conname;
        `,
      ),
    )
      .trim()
      .split("\n");

    expect(checkConstraints).toEqual(
      expect.arrayContaining([
        "driver_completion_outbox_attempt_count_chk",
        "driver_completion_outbox_dead_letter_state_chk",
        "driver_completion_outbox_delivery_state_chk",
        "driver_completion_outbox_effect_type_chk",
        "driver_completion_outbox_payload_object_chk",
        "driver_completion_outbox_processing_lease_chk",
        "driver_completion_outbox_status_chk",
      ]),
    );

    const taskOrderUnique = bash(
      psqlCommand(
        databaseUrl,
        `
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'ops.phase1_driver_tasks'::regclass
  AND conname = 'phase1_driver_tasks_task_order_unique';
        `,
      ),
    ).trim();

    expect(taskOrderUnique).toBe("UNIQUE (task_id, order_id)");

    const recoveryIndex = bash(
      psqlCommand(
        databaseUrl,
        `
SELECT indexdef
FROM pg_indexes
WHERE schemaname = 'ops'
  AND tablename = 'driver_completion_outbox'
  AND indexname = 'driver_completion_outbox_recovery_idx';
        `,
      ),
    ).trim();

    expect(recoveryIndex).toContain(
      "ON ops.driver_completion_outbox USING btree (next_attempt_at, created_at, task_id, outbox_id)",
    );
    expect(recoveryIndex).toContain("WHERE ((delivered_at IS NULL)");
    expect(recoveryIndex).toContain(
      "(status = ANY (ARRAY['pending'::text, 'processing'::text]))",
    );
  }, 180_000);

  it("creates append-only security events that reject update and delete", () => {
    const eventId = "33333333-3333-4333-8333-333333333333";

    bash(
      [
        "if command -v psql >/dev/null 2>&1; then",
        `  PGPASSWORD=postgres psql "${adminUrl}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${dbName};" -c "CREATE DATABASE ${dbName};"`,
        "else",
        "  docker compose -f docker-compose.dev.yml exec -T -e PGPASSWORD=postgres postgres \\",
        `    psql "${adminUrl}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${dbName};" -c "CREATE DATABASE ${dbName};"`,
        "fi",
      ].join("\n"),
    );

    bash("./operations/database/db-apply.sh", {
      DATABASE_URL: databaseUrl,
    });

    bash(
      psqlCommand(
        databaseUrl,
        `
INSERT INTO admin.security_events (
  event_id,
  occurred_at,
  event_type,
  event_family,
  outcome,
  severity,
  actor_type,
  realm,
  tenant_id,
  auth_methods,
  masked_context
) VALUES (
  '${eventId}',
  '2026-08-01T00:00:00.000Z',
  'tenant_api_key.issued',
  'credential',
  'success',
  'high',
  'tenant_admin',
  'tenant',
  'tenant-demo-001',
  ARRAY['jwt_bearer'],
  '{"keyName":"Ops Key"}'::jsonb
);
        `,
      ),
    );

    expect(() =>
      bash(
        psqlCommand(
          databaseUrl,
          `
UPDATE admin.security_events
SET outcome = 'failure'
WHERE event_id = '${eventId}';
          `,
        ),
      ),
    ).toThrow();

    expect(() =>
      bash(
        psqlCommand(
          databaseUrl,
          `
DELETE FROM admin.security_events
WHERE event_id = '${eventId}';
          `,
        ),
      ),
    ).toThrow();

    const persisted = bash(
      psqlCommand(
        databaseUrl,
        `
SELECT count(*)::text || '|' || min(outcome)
FROM admin.security_events
WHERE event_id = '${eventId}';
        `,
      ),
    ).trim();

    expect(persisted).toBe("1|success");
  }, 180_000);
});

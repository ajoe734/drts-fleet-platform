import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");
const adminUrl = "postgresql://postgres:postgres@localhost:5432/postgres";
const toolDir = mkdtempSync(path.join(os.tmpdir(), "db-apply-test-"));

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
        "  case \"$1\" in",
        "    -f)",
        "      file=\"$2\"",
        "      shift 2",
        "      ;;",
        "    *)",
        "      args+=(\"$1\")",
        "      shift",
        "      ;;",
        "  esac",
        "done",
        "if [[ -n \"$file\" ]]; then",
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

  it(
    "replays renamed and re-numbered service-area migrations for legacy ledgers",
    () => {
      const v0036aChecksum = checksum(
        "infra/migrations/V0036A__supply_external_ids_as_varchar.sql",
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

      bash("./scripts/db-apply.sh", {
        DATABASE_URL: databaseUrl,
      });

      bash(
        psqlCommand(
          databaseUrl,
          `
DELETE FROM admin.schema_migrations
WHERE version IN ('V0036A', 'V0036', 'V0037', 'V0047', 'V0048', 'V0049');

INSERT INTO admin.schema_migrations(version, file_name, checksum)
VALUES
  ('V0036', 'V0036__supply_external_ids_as_varchar.sql', '${v0036aChecksum}'),
  ('V0037', 'V0037__service_area_review_lifecycle.sql', '${v0048Checksum}'),
  ('V0047', 'V0047__service_area_baseline_seed.sql', '${v0049Checksum}');

DROP TABLE IF EXISTS ops.stop_policies;
DROP TABLE IF EXISTS ops.service_area_boundaries;
          `,
        ),
      );

      bash("./scripts/db-apply.sh", {
        DATABASE_URL: databaseUrl,
      });

      const migrationRows = bash(
        psqlCommand(
          databaseUrl,
          `
SELECT version || '|' || file_name
FROM admin.schema_migrations
WHERE version IN ('V0036', 'V0036A', 'V0037', 'V0047', 'V0048', 'V0049')
ORDER BY version;
          `,
        ),
      )
        .trim()
        .split("\n");

      expect(migrationRows).toEqual([
        "V0036|V0036__service_area_geofence_authority.sql",
        "V0036A|V0036A__supply_external_ids_as_varchar.sql",
        "V0037|V0037__phase2_av_sandbox_evidence_skeleton.sql",
        "V0048|V0048__service_area_review_lifecycle.sql",
        "V0049|V0049__service_area_baseline_seed.sql",
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
    },
    180_000,
  );
});

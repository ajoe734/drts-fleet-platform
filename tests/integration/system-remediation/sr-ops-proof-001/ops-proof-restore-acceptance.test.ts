import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Real, GitHub-hosted-only acceptance for SR-OPS-PROOF-001 capability C122
// (snapshot backup/restore + trip/billing/audit reconciliation). This VM never
// hosts Postgres, so both env vars are unset locally and the test skips; the
// dedicated ops-proof-acceptance.yml workflow supplies two disposable, migrated
// loopback databases (drts_ops_proof_source seeded, drts_ops_proof_isolated
// empty) and this test performs a real pg_dump, an independently exported
// manifest, and a real pg_restore + readback via the production ops-proof.sh
// and reconcile.mjs tools -- it never touches a shared or production database.

type PgPoolLike = {
  query: <R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: R[]; rowCount: number | null }>;
  end: () => Promise<void>;
};

const require = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as {
  Pool: new (options?: { connectionString?: string | undefined }) => PgPoolLike;
};

const OPS_PROOF_ROOT = resolve(
  __dirname,
  "../../../../tools/system-remediation/ops-proof",
);

const sourceUrl = process.env.DRTS_OPS_PROOF_SOURCE_DATABASE_URL;
const isolatedUrl = process.env.DRTS_OPS_PROOF_ISOLATED_DATABASE_URL;
const isConfigured = Boolean(sourceUrl && isolatedUrl);

describe("SR-OPS-PROOF-001 real snapshot restore + business readback acceptance", () => {
  it.skipIf(!isConfigured)(
    "restores a real pg_dump snapshot into an isolated disposable database and reconciles trip/billing/audit rows byte-for-byte",
    async () => {
      const pool = new Pool({ connectionString: sourceUrl });
      const directory = mkdtempSync(resolve(tmpdir(), "ops-proof-acceptance-"));
      try {
        const tableCheck = await pool.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = 'ops' AND table_name = 'phase1_owned_orders'`,
        );
        if (tableCheck.rowCount === 0) {
          throw new Error(
            "ops.phase1_owned_orders does not exist on the source database. Migrations must be applied before this test.",
          );
        }

        await pool.query(
          `DELETE FROM ops.phase1_owned_orders WHERE order_id LIKE 'opsproof-order-%'`,
        );
        await pool.query(
          `DELETE FROM billing.phase1_driver_statements WHERE statement_id LIKE 'opsproof-stmt-%'`,
        );
        // admin.audit_logs is append-only (V0080__audit_log_immutability.sql
        // rejects UPDATE/DELETE/TRUNCATE at the database level), so seeded
        // audit rows are never cleaned up; the run tag keeps each run's rows
        // distinguishable without needing deletion.
        const runTag = `opsproof-run-${Date.now()}`;

        const now = new Date().toISOString();
        for (const [index, orderId] of ["opsproof-order-1", "opsproof-order-2"].entries()) {
          await pool.query(
            `INSERT INTO ops.phase1_owned_orders (
              order_id, order_no, status, order_source, service_bucket,
              dispatch_semantics, created_at, updated_at, record
            ) VALUES ($1, $2, 'requested', 'enterprise', 'tenant_booking', 'scheduled', $3, $3, $4)`,
            [
              orderId,
              `OPSPROOF-ORD-${index + 1}`,
              now,
              JSON.stringify({ orderId, seededBy: "sr-ops-proof-001-acceptance" }),
            ],
          );
        }
        for (const [index, statementId] of ["opsproof-stmt-1", "opsproof-stmt-2"].entries()) {
          await pool.query(
            `INSERT INTO billing.phase1_driver_statements (
              statement_id, driver_id, period_month, payout_status, created_at, updated_at, record
            ) VALUES ($1, $2, '2026-09', 'pending', $3, $3, $4)`,
            [
              statementId,
              `opsproof-driver-${index + 1}`,
              now,
              JSON.stringify({ statementId, seededBy: "sr-ops-proof-001-acceptance" }),
            ],
          );
        }
        for (const orderId of ["opsproof-order-1", "opsproof-order-2"]) {
          await pool.query(
            `INSERT INTO admin.audit_logs (
              actor_type, module_name, action_name, resource_type, resource_id
            ) VALUES ('system', 'sr-ops-proof-001', 'seed_acceptance_fixture', 'owned_order', $1)`,
            [`${runTag}-${orderId}`],
          );
        }

        const snapshot = resolve(directory, "source.dump");
        const dump = spawnSync(
          "pg_dump",
          ["--format=custom", "--no-owner", "--no-privileges", "--dbname", sourceUrl as string, "--file", snapshot],
          { encoding: "utf8" },
        );
        expect(dump.status, dump.stderr).toBe(0);

        const manifest = resolve(directory, "manifest.json");
        const exportRun = spawnSync(
          "node",
          [
            resolve(OPS_PROOF_ROOT, "reconcile.mjs"),
            "export",
            manifest,
            snapshot,
            sourceUrl as string,
            `vitest-integration-${Date.now()}`,
          ],
          { encoding: "utf8" },
        );
        expect(exportRun.status, exportRun.stderr).toBe(0);
        const manifestJson = JSON.parse(readFileSync(manifest, "utf8"));
        expect(manifestJson.tables["ops.phase1_owned_orders"].count).toBeGreaterThanOrEqual(2);

        const restoreReceipt = resolve(directory, "restore-receipt.json");
        const restore = spawnSync(
          "bash",
          [
            resolve(OPS_PROOF_ROOT, "ops-proof.sh"),
            "restore",
            "--snapshot",
            snapshot,
            "--expected-manifest",
            manifest,
            "--isolated-database-url",
            isolatedUrl as string,
            "--output",
            restoreReceipt,
          ],
          { encoding: "utf8" },
        );
        expect(restore.status, `${restore.stdout}\n${restore.stderr}`).toBe(0);

        const receipt = JSON.parse(readFileSync(restoreReceipt, "utf8"));
        expect(receipt.kind).toBe("isolated_restore");
        expect(receipt.readback.matched).toBe(true);
        for (const comparison of receipt.readback.comparisons) {
          expect(comparison.matched).toBe(true);
        }

        await pool.query(
          `DELETE FROM ops.phase1_owned_orders WHERE order_id LIKE 'opsproof-order-%'`,
        );
        await pool.query(
          `DELETE FROM billing.phase1_driver_statements WHERE statement_id LIKE 'opsproof-stmt-%'`,
        );
      } finally {
        rmSync(directory, { recursive: true, force: true });
        await pool.end();
      }
    },
  );
});

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const helper = resolve(
  __dirname,
  "../../../../tools/system-remediation/ops-proof/reconcile.mjs",
);
const tables = [
  "ops.phase1_owned_orders",
  "billing.phase1_driver_statements",
  "admin.audit_logs",
];
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

describe("snapshot-bound runtime reconciliation (command spies, not restore acceptance)", () => {
  it.each([
    "match",
    "same-count-change",
    "wrong-snapshot",
    "missing-audit",
    "readback-failure",
    "unsafe-target",
  ])("handles %s", (scenario) => {
    const directory = mkdtempSync(resolve(tmpdir(), "ops-reconcile-"));
    try {
      const snapshot = resolve(directory, "dump");
      const manifest = resolve(directory, "expected.json");
      writeFileSync(snapshot, "unit-test-dump");
      const expectedTables = Object.fromEntries(
        tables.map((table) => [
          table,
          { count: 1, sha256: digest('{"amount":100}\n') },
        ]),
      );
      if (scenario === "missing-audit")
        delete expectedTables["admin.audit_logs"];
      writeFileSync(
        manifest,
        JSON.stringify({
          version: 1,
          algorithm: "psql-jsonb-lines-sha256-v1",
          exportReference: "unit-test-only",
          snapshotSha256: digest(
            scenario === "wrong-snapshot" ? "different-dump" : "unit-test-dump",
          ),
          tables: expectedTables,
        }),
      );
      writeFileSync(
        resolve(directory, "psql"),
        scenario === "readback-failure"
          ? "#!/bin/sh\nexit 7\n"
          : `#!/bin/sh\nprintf '%s\\n' '{"amount":${scenario === "same-count-change" ? 999 : 100}}'\n`,
        { mode: 0o755 },
      );
      if (scenario === "match" || scenario === "same-count-change") {
        writeFileSync(resolve(directory, "pg_restore"), "#!/bin/sh\nexit 0\n", {
          mode: 0o755,
        });
        writeFileSync(
          resolve(directory, "psql"),
          `#!/bin/sh
case "$*" in
  *pg_class*) echo 0 ;;
  *) printf '%s\\n' '{"amount":${scenario === "same-count-change" ? 999 : 100}}' ;;
esac
`,
          { mode: 0o755 },
        );
        const output = resolve(directory, "restore.json");
        const restore = spawnSync(
          "bash",
          [
            resolve(helper, "../ops-proof.sh"),
            "restore",
            "--snapshot",
            snapshot,
            "--expected-manifest",
            manifest,
            "--isolated-database-url",
            "postgresql://127.0.0.1/drts_ops_proof_test",
            "--output",
            output,
          ],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              PATH: `${directory}:${process.env.PATH}`,
              PGSERVICE: "",
              PGOPTIONS: "",
            },
          },
        );
        expect(restore.status, restore.stderr).toBe(
          scenario === "match" ? 0 : 1,
        );
        expect(JSON.parse(readFileSync(output, "utf8")).readback.matched).toBe(
          scenario === "match",
        );
      }
      const result = spawnSync(
        "node",
        [
          helper,
          "verify",
          manifest,
          snapshot,
          scenario === "unsafe-target"
            ? "postgresql://production.invalid/drts_ops_proof_test"
            : "postgresql://127.0.0.1/drts_ops_proof_test",
        ],
        {
          encoding: "utf8",
          env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
        },
      );
      if (scenario === "match" || scenario === "same-count-change") {
        expect(result.status).toBe(scenario === "match" ? 0 : 1);
        const receipt = JSON.parse(result.stdout);
        expect(receipt.matched).toBe(scenario === "match");
        expect(
          receipt.comparisons.map((item: { table: string }) => item.table),
        ).toEqual(tables);
        expect(receipt.comparisons[0].actual.count).toBe(1);
      } else {
        expect(result.status).toBe(2);
        expect(result.stdout).toBe("");
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("independent manifest export (command spies, not a real pg_dump/psql run)", () => {
  it("writes a manifest whose fingerprints the verify path accepts, and rejects a missing exportReference", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "ops-reconcile-export-"));
    try {
      const snapshot = resolve(directory, "dump");
      writeFileSync(snapshot, "unit-test-dump");
      writeFileSync(
        resolve(directory, "psql"),
        `#!/bin/sh\nprintf '%s\\n' '{"amount":100}'\n`,
        { mode: 0o755 },
      );
      const manifestOut = resolve(directory, "exported.json");
      const exported = spawnSync(
        "node",
        [
          helper,
          "export",
          manifestOut,
          snapshot,
          "postgresql://127.0.0.1/drts_ops_proof_source",
          "unit-test-export-ref",
        ],
        {
          encoding: "utf8",
          env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
        },
      );
      expect(exported.status, exported.stderr).toBe(0);
      const manifest = JSON.parse(readFileSync(manifestOut, "utf8"));
      expect(manifest.version).toBe(1);
      expect(manifest.algorithm).toBe("psql-jsonb-lines-sha256-v1");
      expect(manifest.exportReference).toBe("unit-test-export-ref");
      expect(manifest.snapshotSha256).toBe(digest("unit-test-dump"));
      for (const table of tables) {
        expect(manifest.tables[table].count).toBe(1);
        expect(manifest.tables[table].sha256).toBe(digest('{"amount":100}\n'));
      }

      const verified = spawnSync(
        "node",
        [
          helper,
          "verify",
          manifestOut,
          snapshot,
          "postgresql://127.0.0.1/drts_ops_proof_source",
        ],
        {
          encoding: "utf8",
          env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
        },
      );
      expect(verified.status, verified.stderr).toBe(0);
      expect(JSON.parse(verified.stdout).matched).toBe(true);

      const missingReference = spawnSync(
        "node",
        [helper, "export", resolve(directory, "unused.json"), snapshot, "postgresql://127.0.0.1/drts_ops_proof_source", ""],
        {
          encoding: "utf8",
          env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
        },
      );
      expect(missingReference.status).toBe(2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

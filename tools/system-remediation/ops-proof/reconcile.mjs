import { createHash } from "node:crypto";
import { readFileSync, createReadStream } from "node:fs";
import { spawn } from "node:child_process";

// Fixed runtime tables: never interpolate operator-supplied SQL identifiers.
export const tables = [
  "ops.phase1_owned_orders",
  "billing.phase1_driver_statements",
  "admin.audit_logs",
];

export async function snapshotHash(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export function validateManifest(manifest, digest) {
  if (manifest.version !== 1 || manifest.algorithm !== "psql-jsonb-lines-sha256-v1" ||
      manifest.snapshotSha256 !== digest ||
      typeof manifest.exportReference !== "string" || !manifest.exportReference.trim()) {
    throw new Error("Expected manifest must identify the same snapshot and its export reference");
  }
  for (const table of tables) {
    const value = manifest.tables?.[table];
    if (!value || !Number.isSafeInteger(value.count) || value.count < 0 ||
        !/^[a-f0-9]{64}$/.test(value.sha256)) {
      throw new Error(`Invalid expected fingerprint: ${table}`);
    }
  }
  return manifest;
}

export function compare(expected, actual) {
  return tables.map((table) => ({
    table, expected: expected.tables[table], actual: actual[table],
    matched: expected.tables[table].count === actual[table]?.count &&
      expected.tables[table].sha256 === actual[table]?.sha256,
  }));
}

export async function fingerprint(database, table) {
  if (!tables.includes(table)) throw new Error("Unknown runtime table");
  // One JSONB row per line, including every persisted column. Stable sort and
  // session settings are part of the export protocol. No row data is retained.
  const child = spawn("psql", ["-X", database, "--quiet", "--no-align", "--tuples-only",
    "--set", "ON_ERROR_STOP=1", "-c",
    `BEGIN READ ONLY; SET LOCAL timezone='UTC'; SET LOCAL datestyle='ISO, YMD'; SET LOCAL extra_float_digits=3; SELECT to_jsonb(t)::text FROM ${table} t ORDER BY to_jsonb(t)::text COLLATE "C"; COMMIT;`,
  ], { stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, PGCLIENTENCODING: "UTF8" } });
  const completion = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Readback failed for ${table}: psql exit ${code}`)));
  });
  // Attach rejection handling while stdout is still draining.
  completion.catch(() => {});
  const hash = createHash("sha256");
  let count = 0;
  for await (const chunk of child.stdout) {
    hash.update(chunk);
    for (const byte of chunk) if (byte === 10) count++;
  }
  await completion;
  return { count, sha256: hash.digest("hex") };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const [mode, manifestPath, snapshot, database] = process.argv.slice(2);
    const expected = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")), await snapshotHash(snapshot));
    if (mode === "validate") process.exit(0);
    if (mode !== "verify") throw new Error("Expected validate or verify command");
    const actual = {};
    for (const table of tables) actual[table] = await fingerprint(database, table);
    const comparisons = compare(expected, actual);
    const matched = comparisons.every((item) => item.matched);
    console.log(JSON.stringify({ matched, exportReference: expected.exportReference, comparisons }));
    process.exitCode = matched ? 0 : 1;
  } catch (error) {
    console.error(`[ops-proof] ${error.message}`);
    process.exitCode = 2;
  }
}

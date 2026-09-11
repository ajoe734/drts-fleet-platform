// Executed only by the GitHub-hosted runner after it replaces the API process.
// This verifier opens no listener and performs no database writes.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { request } from "@playwright/test";
import {
  TenantAcceptance,
  required,
  type Readback,
} from "./acceptance-context";

async function main(): Promise<void> {
  const directory = path.resolve(
    ".artifacts/tenant-uat-acceptance/restart-readbacks",
  );
  const client = await request.newContext();
  const context = new TenantAcceptance(client);
  const report: {
    candidate_sha: string;
    status: string;
    verified: number;
    tables: string[];
  } = {
    candidate_sha: required("CANDIDATE_SHA"),
    status: "failed",
    verified: 0,
    tables: [],
  };
  try {
    const files = readdirSync(directory).filter((name) =>
      name.endsWith(".json"),
    );
    if (!files.length)
      throw new Error("No pre-restart same-ID readback manifest exists");
    const tables = new Set<string>();
    for (const file of files) {
      const readback = JSON.parse(
        readFileSync(path.join(directory, file), "utf8"),
      ) as Readback;
      await context.checkpoint(readback);
      report.verified += 1;
      const table = readback.sql.match(
        /\bFROM\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/i,
      )?.[1];
      if (table) tables.add(table);
    }
    const requiredTables = [
      "admin.phase1_platform_tenants",
      "admin.phase1_tenant_user_roles",
      "admin.phase1_tenant_sla_profiles",
      "admin.feature_flags",
      "core.phase1_tenant_passengers",
      "core.phase1_tenant_addresses",
      "core.phase1_tenant_cost_centers",
      "core.phase1_tenant_quota_policies",
      "core.phase1_tenant_quota_ledger",
      "core.phase1_tenant_approval_rules",
      "core.phase1_tenant_approval_requests",
      "ops.phase1_owned_orders",
    ];
    for (const table of requiredTables) {
      if (!tables.has(table))
        throw new Error(`Restart durability matrix missing ${table}`);
    }
    report.tables = [...tables].sort();
    report.status = "passed";
  } finally {
    writeFileSync(
      ".artifacts/tenant-uat-acceptance/restart-report.json",
      `${JSON.stringify(report, null, 2)}\n`,
    );
    await context.db.end();
    await client.dispose();
  }
}
main().catch((error: unknown) => {
  // Assertion messages contain resource IDs and states, never bearer/invitation tokens.
  console.error(error);
  process.exitCode = 1;
});

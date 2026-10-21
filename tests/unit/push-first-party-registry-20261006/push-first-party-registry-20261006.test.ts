import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");

describe("PUSH-FIRST-PARTY-REGISTRY-20261006: migration matches the allocated contract", () => {
  const allocationPath = path.join(
    repoRoot,
    "docs/04-uat/system-remediation-20260906/schema-allocation.json",
  );
  const allocation = JSON.parse(fs.readFileSync(allocationPath, "utf8"))
    .passenger_push_channel_allocations[0];
  const migrationPath = path.join(
    repoRoot,
    "infra/migrations",
    allocation.migration_filename,
  );

  it("uses the exact filename reserved by schema-allocation.json (V0107)", () => {
    expect(allocation.version).toBe("V0107");
    expect(allocation.migration_filename).toBe(
      "V0107__push_channel_first_party_registry_and_routing.sql",
    );
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  const sql = fs.readFileSync(migrationPath, "utf8");

  it("creates iam.phase1_passenger_push_devices with every D4 column and CHECK", () => {
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS iam.phase1_passenger_push_devices",
    );
    expect(sql).toContain("device_id uuid PRIMARY KEY DEFAULT gen_random_uuid()");
    expect(sql).toContain("drts_passenger_id varchar(100) NOT NULL");
    expect(sql).toMatch(/platform varchar\(10\) NOT NULL\s*\n?\s*CHECK \(platform IN \('ios', 'android'\)\)/);
    expect(sql).toMatch(
      /provider varchar\(20\) NOT NULL DEFAULT 'fcm_v1'\s*\n?\s*CHECK \(provider = 'fcm_v1'\)/,
    );
    expect(sql).toContain("app_id varchar(150) NOT NULL");
    expect(sql).toContain("app_version varchar(50) NOT NULL");
    expect(sql).toContain("token text NOT NULL");
    expect(sql).toContain("token_sha256 varchar(64) NOT NULL");
    expect(sql).toMatch(
      /status varchar\(10\) NOT NULL DEFAULT 'active'\s*\n?\s*CHECK \(status IN \('active', 'revoked', 'invalid'\)\)/,
    );
    expect(sql).toContain("status_reason text NULL");
    expect(sql).toContain("notification_consent_version varchar(50) NOT NULL");
    expect(sql).toContain("registered_at timestamptz NOT NULL DEFAULT now()");
    expect(sql).toContain("last_seen_at timestamptz NULL");
    expect(sql).toContain("invalidated_at timestamptz NULL");
  });

  it("enforces active-token uniqueness with a partial index, not a table-wide UNIQUE", () => {
    expect(sql).toContain("token_sha256 varchar(64) NOT NULL,");
    expect(sql).not.toMatch(/UNIQUE\s*\(provider,\s*token_sha256\)/);
    expect(sql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS phase1_passenger_push_devices_active_token_uq",
    );
    expect(sql).toContain("ON iam.phase1_passenger_push_devices (provider, token_sha256)");
    expect(sql).toContain("WHERE status = 'active';");
  });

  it("indexes drts_passenger_id + status for resolveActiveDevices lookups", () => {
    expect(sql).toContain(
      "CREATE INDEX IF NOT EXISTS idx_phase1_passenger_push_devices_passenger",
    );
    expect(sql).toContain("ON iam.phase1_passenger_push_devices (drts_passenger_id, status)");
  });

  it("creates mobility.phase1_order_first_party_notification_routes per D5, independent of the partner route table", () => {
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS mobility.phase1_order_first_party_notification_routes",
    );
    expect(sql).toContain("order_id varchar(255) PRIMARY KEY");
    expect(sql).toContain("tenant_id varchar(100) NOT NULL");
    expect(sql).toContain("drts_passenger_id varchar(100) NOT NULL");
    expect(sql).toContain("passenger_subject_ref varchar(255) NOT NULL");
    expect(sql).toContain("app_id varchar(150) NOT NULL");
    expect(sql).toMatch(
      /notification_policy_version varchar\(50\) NOT NULL DEFAULT 'first_party_notification_v1'\s*\n?\s*CHECK \(notification_policy_version = 'first_party_notification_v1'\)/,
    );
    expect(sql).toContain("consent_version varchar(50) NOT NULL");
    expect(sql).toContain("ride_ref varchar(255) NOT NULL");
    expect(sql).toMatch(/UNIQUE \(ride_ref\)/);
    expect(sql).not.toContain("REFERENCES mobility.phase1_order_partner_notification_routes");
    expect(sql).not.toContain("REFERENCES mobility.phase1_order_first_party_notification_routes");
  });

  it("does not modify any already-applied migration file", () => {
    const migrationsDir = path.join(repoRoot, "infra/migrations");
    const existingUnrelated = fs
      .readdirSync(migrationsDir)
      .filter((file) => /^V010[1-6]__.+\.sql$/.test(file));
    expect(existingUnrelated.length).toBeGreaterThan(0);
    for (const file of existingUnrelated) {
      expect(file).not.toBe(allocation.migration_filename);
    }
  });
});

describe("PUSH-FIRST-PARTY-REGISTRY-20261006: no external surface, no multi-taxi rewiring", () => {
  const moduleDir = path.join(
    repoRoot,
    "apps/api/src/modules/passenger-push-devices",
  );

  it("adds no controller and no HTTP route under the new module", () => {
    const files = fs.readdirSync(moduleDir);
    expect(files.some((file) => file.includes("controller"))).toBe(false);
    for (const file of files) {
      const content = fs.readFileSync(path.join(moduleDir, file), "utf8");
      expect(content).not.toContain("@Controller");
      expect(content).not.toContain("@Get(");
      expect(content).not.toContain("@Post(");
      expect(content).not.toContain("@Delete(");
    }
  });

  it("leaves multi-taxi.module.ts's existing PASSENGER_PUSH_TRANSPORT/PASSENGER_PUSH_PORT binding untouched", () => {
    const multiTaxiModulePath = path.join(
      repoRoot,
      "apps/api/src/modules/multi-taxi/multi-taxi.module.ts",
    );
    const content = fs.readFileSync(multiTaxiModulePath, "utf8");
    expect(content).not.toContain("passenger-push-devices");
    expect(content).toContain("PASSENGER_PUSH_TRANSPORT");
    expect(content).toMatch(/transportMode:\s*"partner_webhook"/);
  });

  it("registers PassengerPushDevicesModule in app.module.ts as a bare module import, nothing else", () => {
    const appModulePath = path.join(repoRoot, "apps/api/src/app.module.ts");
    const content = fs.readFileSync(appModulePath, "utf8");
    expect(content).toContain(
      'import { PassengerPushDevicesModule } from "./modules/passenger-push-devices/passenger-push-devices.module";',
    );
    const importOccurrences = content.split("PassengerPushDevicesModule").length - 1;
    // Exactly two references: the import statement and the imports[] entry.
    expect(importOccurrences).toBe(2);
  });

  it("exports a resolver provider token for a future injector, without this module importing multi-taxi", () => {
    const modulePath = path.join(moduleDir, "passenger-push-devices.module.ts");
    const content = fs.readFileSync(modulePath, "utf8");
    expect(content).toContain("FIRST_PARTY_PUSH_DEVICE_RESOLVER");
    expect(content).not.toMatch(/from\s+["'].*multi-taxi/);
  });
});

describe("PUSH-FIRST-PARTY-REGISTRY-20261006: token privacy boundary in source", () => {
  it("never formats or logs the raw token field anywhere in the new module", () => {
    const moduleDir = path.join(
      repoRoot,
      "apps/api/src/modules/passenger-push-devices",
    );
    for (const file of fs.readdirSync(moduleDir)) {
      const content = fs.readFileSync(path.join(moduleDir, file), "utf8");
      expect(content).not.toMatch(/Logger|console\.(log|warn|error)/);
    }
  });
});

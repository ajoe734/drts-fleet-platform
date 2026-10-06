import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { DriverRegistryRecord } from "@drts/contracts";
import { DatabaseService } from "../../../../apps/api/src/common/db";
import { DriverDeviceSessionRepository } from "../../../../apps/api/src/modules/auth/driver-device-session.repository";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryRepository } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

const apiRequire = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = apiRequire("pg") as typeof import("pg");
const repoRoot = path.resolve(__dirname, "../../../..");
const driverId = "drv-demo-002";

// Only the existing hosted CI unit job owns this PostgreSQL check. In that
// job a missing connection/migration is a failure, never a skipped DB pass.
// No VM PostgreSQL server, browser, or product process is started by this file.
const hostedUnit =
  process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_JOB === "unit";
describe.skipIf(!hostedUnit)(
  "C114 fixture on official PostgreSQL migrations",
  () => {
    const dbName = `c114_fixture_${randomUUID().replaceAll("-", "")}`;
    let admin: InstanceType<typeof Pool> | undefined;
    let database: DatabaseService | undefined;
    let repository: RegulatoryRegistryRepository;
    let created = false;

    beforeAll(async () => {
      expect(
        process.env.DATABASE_URL,
        "hosted unit job requires DATABASE_URL",
      ).toBeTruthy();
      const url = new URL(process.env.DATABASE_URL!);
      expect(["localhost", "127.0.0.1", "postgres"]).toContain(url.hostname);
      url.pathname = "/postgres";
      admin = new Pool({ connectionString: url.toString(), max: 1 });
      await admin.query(`CREATE DATABASE "${dbName}"`);
      created = true;
      url.pathname = `/${dbName}`;
      // Replay the full canonical migration ledger, not hand-built lookalike
      // tables. Only this suite's randomly named database is migrated/dropped.
      execFileSync("./operations/database/db-apply.sh", [], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: url.toString() },
        stdio: "pipe",
        timeout: 180_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      vi.stubEnv("DATABASE_URL", url.toString());
      vi.stubEnv("DRTS_E2E_PROVISIONING", "true");
      vi.stubEnv("DRTS_ENV", "development");
      vi.stubEnv("ENABLE_EXPIRY_RECONCILIATION_LOOP", "false");
      database = new DatabaseService();
      repository = new RegulatoryRegistryRepository(database);
    }, 240_000);

    afterAll(async () => {
      try {
        await database?.onModuleDestroy();
        if (created)
          await admin!.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
      } finally {
        await admin?.end();
        vi.unstubAllEnvs();
      }
    }, 30_000);

    beforeEach(async () => {
      for (const table of [
        "iam.driver_refresh_families",
        "iam.driver_device_bindings",
        "iam.driver_device_invitations",
        "ops.phase1_driver_profiles",
        "reg.phase1_registry_supply_pairs",
        "telemetry.driver_location_events",
        "reg.phase1_registry_drivers",
      ]) {
        await database!.query(`DELETE FROM ${table} WHERE driver_id = $1`, [
          driverId,
        ]);
      }
    });

    async function stored() {
      return (
        await database!.query<{
          record: DriverRegistryRecord;
          work_state: string;
          updated_at: Date;
        }>(
          "SELECT record, work_state, updated_at FROM reg.phase1_registry_drivers WHERE driver_id = $1",
          [driverId],
        )
      ).rows;
    }

    it("serializes concurrent startup and persists exactly one unchanged isolated fixture", async () => {
      const second = new RegulatoryRegistryRepository(database);
      const results = await Promise.all([
        repository.ensureLiveMapTestDriver(),
        second.ensureLiveMapTestDriver(),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([
        "created",
        "unchanged",
      ]);
      const before = await stored();
      expect(before).toHaveLength(1);
      expect(before[0]).toMatchObject({
        work_state: "offline",
        record: { driverId, dispatchEligible: false, deviceBindings: [] },
      });
      await expect(second.ensureLiveMapTestDriver()).resolves.toEqual({
        status: "unchanged",
      });
      expect(await stored()).toEqual(before);
    });

    it("hydrates the created row through real module startup without a fallback vehicle pair", async () => {
      await repository.ensureLiveMapTestDriver();
      const [fixture] = await stored();
      const other = {
        ...fixture!.record,
        driverId: "drv-c114-other",
        name: "Other test fixture",
      };
      await repository.persistChanges({ drivers: [other] });
      await database!.query(
        "DELETE FROM reg.phase1_registry_drivers WHERE driver_id = $1",
        [driverId],
      );
      const audit = new AuditNotificationService();
      const events = {
        publishDriverLocationUpdated: vi.fn(),
        publishSupplyLifecycleUpdated: vi.fn(),
      };
      const service = new RegulatoryRegistryService(
        events as never,
        audit,
        new DriverProfileService(audit),
        repository,
      );
      try {
        await service.onModuleInit();
        expect(service.listDrivers()).toContainEqual(
          expect.objectContaining({
            driverId,
            workState: "offline",
            dispatchEligible: false,
            deviceBindings: [],
          }),
        );
        expect(
          service.listSupplyPairs().some((pair) => pair.driverId === driverId),
        ).toBe(false);
        expect((await stored())[0]?.record.driverId).toBe(driverId);
        expect(events.publishSupplyLifecycleUpdated).not.toHaveBeenCalled();
      } finally {
        await service.onModuleDestroy();
      }
    });

    it("refuses an online existing row without changing its JSON or timestamp", async () => {
      await repository.ensureLiveMapTestDriver();
      const [fixture] = await stored();
      await repository.persistChanges({
        drivers: [
          {
            ...fixture!.record,
            workState: "available",
            dispatchEligible: true,
          },
        ],
      });
      const before = await stored();
      await expect(repository.ensureLiveMapTestDriver()).resolves.toEqual({
        status: "refused",
        reason: "LIVE_MAP_FIXTURE_DRIVER_UNSAFE",
      });
      expect(await stored()).toEqual(before);
    });

    it("does not create a missing driver already referenced by a durable vehicle pair", async () => {
      await repository.persistChanges({
        supplyPairs: [
          { driverId, vehicleId: "veh-c114-isolation", etaMinutes: 0 },
        ],
      });
      await expect(repository.ensureLiveMapTestDriver()).resolves.toEqual({
        status: "refused",
        reason: "LIVE_MAP_FIXTURE_ASSIGNED",
      });
      expect(await stored()).toEqual([]);
      const pair = await database!.query(
        "SELECT record FROM reg.phase1_registry_supply_pairs WHERE driver_id = $1",
        [driverId],
      );
      expect(pair.rows).toHaveLength(1);
    });

    it("consults the active IAM binding even without a registry/profile snapshot", async () => {
      const now = new Date().toISOString();
      const sessions = new DriverDeviceSessionRepository(database);
      await sessions.saveBinding({
        bindingId: "c114-existing-binding",
        driverId,
        deviceId: "c114-existing-device",
        deviceLabel: null,
        status: "active",
        issuedAt: now,
        refreshedAt: now,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const before = await database!.query(
        "SELECT record FROM iam.driver_device_bindings WHERE driver_id = $1",
        [driverId],
      );
      expect(before.rows).toHaveLength(1); // No in-memory repository fallback counts.
      await expect(repository.ensureLiveMapTestDriver()).resolves.toEqual({
        status: "refused",
        reason: "LIVE_MAP_FIXTURE_BOUND",
      });
      expect(await stored()).toEqual([]);
      expect(
        (
          await database!.query(
            "SELECT record FROM iam.driver_device_bindings WHERE driver_id = $1",
            [driverId],
          )
        ).rows,
      ).toEqual(before.rows);
    });

    it("resets only the fixture's own binding, invitation and supply pair, leaving another driver untouched", async () => {
      const now = new Date().toISOString();
      const otherDriverId = "drv-c114-other-untouched";
      const sessions = new DriverDeviceSessionRepository(database);
      await sessions.saveBinding({
        bindingId: "c114-fixture-binding",
        driverId,
        deviceId: "c114-fixture-device",
        deviceLabel: null,
        status: "active",
        issuedAt: now,
        refreshedAt: now,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await sessions.saveBinding({
        bindingId: "c114-other-binding",
        driverId: otherDriverId,
        deviceId: "c114-other-device",
        deviceLabel: null,
        status: "active",
        issuedAt: now,
        refreshedAt: now,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await repository.persistChanges({
        supplyPairs: [
          {
            driverId: otherDriverId,
            vehicleId: "veh-c114-other-untouched",
            etaMinutes: 0,
          },
        ],
      });
      try {
        await expect(repository.resetLiveMapTestDriver()).resolves.toEqual({
          status: "reset",
        });

        expect(
          (
            await database!.query(
              "SELECT record FROM iam.driver_device_bindings WHERE driver_id = $1",
              [driverId],
            )
          ).rows,
        ).toHaveLength(0);
        expect(await stored()).toEqual([]);

        const otherBinding = await database!.query(
          "SELECT record FROM iam.driver_device_bindings WHERE driver_id = $1",
          [otherDriverId],
        );
        expect(otherBinding.rows).toHaveLength(1);
        const otherPair = await database!.query(
          "SELECT record FROM reg.phase1_registry_supply_pairs WHERE driver_id = $1",
          [otherDriverId],
        );
        expect(otherPair.rows).toHaveLength(1);

        await expect(repository.ensureLiveMapTestDriver()).resolves.toEqual({
          status: "created",
        });
      } finally {
        await database!.query(
          "DELETE FROM reg.phase1_registry_supply_pairs WHERE driver_id = $1",
          [otherDriverId],
        );
        await database!.query(
          "DELETE FROM iam.driver_device_bindings WHERE driver_id = $1",
          [otherDriverId],
        );
      }
    });
  },
);

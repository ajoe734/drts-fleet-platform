import { Logger } from "@nestjs/common";
import type { DriverRegistryRecord } from "@drts/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryRepository } from "../../src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";

beforeEach(() => {
  vi.stubEnv("DRTS_E2E_PROVISIONING", "true");
  vi.stubEnv("DRTS_ENV", "development");
  vi.stubEnv("APP_ENV", undefined);
  vi.stubEnv("NODE_ENV", "test");
  vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function storedFixture(): DriverRegistryRecord {
  const audit = new AuditNotificationService();
  const service = new RegulatoryRegistryService(
    { publishSupplyLifecycleUpdated: vi.fn() } as never,
    audit,
    new DriverProfileService(audit),
  );
  return service
    .listDrivers()
    .find((driver) => driver.driverId === "drv-demo-002")!;
}

const clearContext = {
  has_supply_pair: false,
  has_task: false,
  has_binding: false,
  has_profile_binding: false,
  has_pending_invitation: false,
  has_tracking_context: false,
};

function fixtureRepository(
  options: {
    driver?: DriverRegistryRecord | undefined;
    storedWorkState?: string;
    context?: Record<string, unknown>;
    raceDriver?: DriverRegistryRecord;
    failAt?: string;
    enabled?: boolean;
  } = {},
) {
  let driver = options.driver;
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (options.failAt && sql.includes(options.failAt))
      throw new Error("private database connection detail");
    if (sql.includes("SELECT record, work_state")) {
      return {
        rows: driver
          ? [
              {
                record: driver,
                work_state: options.storedWorkState ?? driver.workState,
              },
            ]
          : [],
      };
    }
    if (sql.includes("AS has_supply_pair"))
      return { rows: [options.context ?? clearContext] };
    if (sql.includes("INSERT INTO reg.phase1_registry_drivers")) {
      if (options.raceDriver) {
        driver = options.raceDriver;
        return { rows: [] };
      }
      driver = JSON.parse(String(values[5])) as DriverRegistryRecord;
      return { rows: [{ record: driver }] };
    }
    return { rows: [] };
  });
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const repository = new RegulatoryRegistryRepository({
    isEnabled: () => options.enabled !== false,
    connect,
    query,
  } as never);
  return { repository, query, connect, release, getDriver: () => driver };
}

describe("durable live-map fixture safeguards", () => {
  it.each([
    {
      failAt: "FROM reg.phase1_registry_vehicles",
      reason: "LIVE_MAP_FIXTURE_PERSISTENCE_FAILED",
    },
    { reason: "LIVE_MAP_FIXTURE_READBACK_UNSAFE" },
  ])(
    "refuses an unavailable or missing durable readback after ensure: $reason",
    async ({ reason, ...options }) => {
      const db = fixtureRepository(options);
      const audit = new AuditNotificationService();
      const service = new RegulatoryRegistryService(
        { publishSupplyLifecycleUpdated: vi.fn() } as never,
        audit,
        new DriverProfileService(audit),
        db.repository,
      );
      await expect(service.onModuleInit()).rejects.toThrow(reason);
    },
  );
  it.each([
    {
      context: { ...clearContext, has_binding: true },
      reason: "LIVE_MAP_FIXTURE_BOUND",
    },
    {
      context: { ...clearContext, has_supply_pair: true },
      reason: "LIVE_MAP_FIXTURE_ASSIGNED",
    },
    {
      failAt: "AS has_supply_pair",
      reason: "LIVE_MAP_FIXTURE_PERSISTENCE_FAILED",
    },
  ])(
    "stops opted-in startup rather than using fallback seeds: $reason",
    async ({ reason, ...options }) => {
      const db = fixtureRepository(options);
      const audit = new AuditNotificationService();
      const service = new RegulatoryRegistryService(
        { publishSupplyLifecycleUpdated: vi.fn() } as never,
        audit,
        new DriverProfileService(audit),
        db.repository,
      );
      await expect(service.onModuleInit()).rejects.toThrow(reason);
      expect(
        db.query.mock.calls.some(([sql]) =>
          sql.includes("INSERT INTO reg.phase1_registry_drivers"),
        ),
      ).toBe(false);
    },
  );
  it("creates once and leaves the complete existing isolated record unchanged on restart", async () => {
    const db = fixtureRepository();
    await expect(db.repository.ensureLiveMapTestDriver()).resolves.toEqual({
      status: "created",
    });
    const before = structuredClone(db.getDriver());
    await expect(db.repository.ensureLiveMapTestDriver()).resolves.toEqual({
      status: "unchanged",
    });
    expect(db.getDriver()).toEqual(before);
    const inserts = db.query.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO"),
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]![0]).toContain("ON CONFLICT (driver_id) DO NOTHING");
    expect(db.getDriver()).toMatchObject({
      driverId: "drv-demo-002",
      workState: "offline",
      dispatchEligible: false,
      deviceBindings: [],
    });
    expect(
      db.query.mock.calls.some(([sql]) => /UPDATE\s+|DELETE\s+/i.test(sql)),
    ).toBe(false);
    expect(db.release).toHaveBeenCalledTimes(2);
  });

  it("preserves all fields of an existing isolated driver, including revoked binding history", async () => {
    const driver = storedFixture();
    driver.name = "Existing fixture name";
    driver.deviceBindings = [
      {
        bindingId: "old-binding",
        deviceId: "old-device",
        deviceLabel: null,
        status: "revoked",
        issuedAt: driver.createdAt,
        refreshedAt: driver.createdAt,
        revokedAt: driver.updatedAt,
      },
    ];
    const original = structuredClone(driver);
    const db = fixtureRepository({ driver });
    await expect(db.repository.ensureLiveMapTestDriver()).resolves.toEqual({
      status: "unchanged",
    });
    expect(driver).toEqual(original);
    expect(
      db.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO")),
    ).toBe(false);
  });

  it.each(["available", "reserved", "on_trip", "suspended"])(
    "refuses existing %s driver without modifying it",
    async (workState) => {
      const driver = { ...storedFixture(), workState } as DriverRegistryRecord;
      const before = structuredClone(driver);
      const db = fixtureRepository({ driver });
      await expect(db.repository.ensureLiveMapTestDriver()).resolves.toEqual({
        status: "refused",
        reason: "LIVE_MAP_FIXTURE_DRIVER_UNSAFE",
      });
      expect(driver).toEqual(before);
      expect(
        db.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO")),
      ).toBe(false);
    },
  );

  it.each([
    ["has_supply_pair", "LIVE_MAP_FIXTURE_ASSIGNED"],
    ["has_task", "LIVE_MAP_FIXTURE_ASSIGNED"],
    ["has_tracking_context", "LIVE_MAP_FIXTURE_ASSIGNED"],
    ["has_binding", "LIVE_MAP_FIXTURE_BOUND"],
    ["has_profile_binding", "LIVE_MAP_FIXTURE_BOUND"],
    ["has_pending_invitation", "LIVE_MAP_FIXTURE_INVITATION_PENDING"],
  ])(
    "refuses %s both for an existing driver and an orphaned identity",
    async (field, reason) => {
      for (const driver of [undefined, storedFixture()]) {
        const before = structuredClone(driver);
        const db = fixtureRepository({
          driver,
          context: { ...clearContext, [field]: true },
        });
        await expect(db.repository.ensureLiveMapTestDriver()).resolves.toEqual({
          status: "refused",
          reason,
        });
        expect(driver).toEqual(before);
        expect(
          db.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO")),
        ).toBe(false);
      }
    },
  );

  it("refuses a denormalized work-state conflict or dispatch eligibility", async () => {
    for (const options of [
      { driver: storedFixture(), storedWorkState: "available" },
      { driver: { ...storedFixture(), dispatchEligible: true } },
    ]) {
      const db = fixtureRepository(options);
      await expect(
        db.repository.ensureLiveMapTestDriver(),
      ).resolves.toMatchObject({
        status: "refused",
        reason: "LIVE_MAP_FIXTURE_DRIVER_UNSAFE",
      });
      expect(
        db.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO")),
      ).toBe(false);
    }
  });

  it("refuses a registry-snapshot binding even if the separate binding query is empty", async () => {
    const driver = storedFixture();
    driver.deviceBindings = [
      {
        bindingId: "private-binding",
        deviceId: "private-device",
        deviceLabel: null,
        status: "active",
        issuedAt: driver.createdAt,
        refreshedAt: driver.createdAt,
        revokedAt: null,
      },
    ];
    const db = fixtureRepository({ driver });
    await expect(
      db.repository.ensureLiveMapTestDriver(),
    ).resolves.toMatchObject({
      status: "refused",
      reason: "LIVE_MAP_FIXTURE_DRIVER_UNSAFE",
    });
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      "LIVE_MAP_FIXTURE_DRIVER_UNSAFE",
    );
    expect(
      JSON.stringify(vi.mocked(Logger.prototype.warn).mock.calls),
    ).not.toMatch(/private-/);
  });

  it.each([{}, { ...clearContext, has_binding: "false" }])(
    "fails closed for missing or malformed context flags",
    async (context) => {
      const db = fixtureRepository({ context });
      await expect(db.repository.ensureLiveMapTestDriver()).resolves.toEqual({
        status: "refused",
        reason: "LIVE_MAP_FIXTURE_CONTEXT_UNAVAILABLE",
      });
      expect(
        db.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO")),
      ).toBe(false);
    },
  );

  it.each([undefined, "false", "TRUE", "1"])(
    "requires the literal provisioning flag, got %s",
    async (flag) => {
      vi.stubEnv("DRTS_E2E_PROVISIONING", flag);
      const db = fixtureRepository();
      await expect(db.repository.ensureLiveMapTestDriver()).resolves.toEqual({
        status: "disabled",
      });
      expect(db.connect).not.toHaveBeenCalled();
    },
  );

  it.each(["DRTS_ENV", "APP_ENV", "NODE_ENV"])(
    "refuses staging/prod selected through %s before database access",
    async (key) => {
      vi.stubEnv("DRTS_ENV", undefined);
      vi.stubEnv("APP_ENV", undefined);
      vi.stubEnv("NODE_ENV", undefined);
      for (const value of [
        "staging",
        "stage",
        "production",
        "prod",
        " PRODUCTION ",
      ]) {
        vi.stubEnv(key, value);
        const db = fixtureRepository();
        await expect(db.repository.ensureLiveMapTestDriver()).resolves.toEqual({
          status: "refused",
          reason: "LIVE_MAP_FIXTURE_ENVIRONMENT_FORBIDDEN",
        });
        expect(db.connect).not.toHaveBeenCalled();
      }
    },
  );

  it("honors the documented shared-dev environment with a production Node build", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const db = fixtureRepository();
    await expect(db.repository.ensureLiveMapTestDriver()).resolves.toEqual({
      status: "created",
    });
  });

  it("does not pretend a fixture was persisted without a database", async () => {
    const db = fixtureRepository({ enabled: false });
    await expect(db.repository.ensureLiveMapTestDriver()).resolves.toEqual({
      status: "refused",
      reason: "LIVE_MAP_FIXTURE_DATABASE_REQUIRED",
    });
    expect(db.connect).not.toHaveBeenCalled();
  });

  it("re-reads and preserves a concurrent writer rather than replacing its unsafe row", async () => {
    const raced = {
      ...storedFixture(),
      workState: "available",
    } as DriverRegistryRecord;
    const original = structuredClone(raced);
    const db = fixtureRepository({ raceDriver: raced });
    await expect(db.repository.ensureLiveMapTestDriver()).resolves.toEqual({
      status: "refused",
      reason: "LIVE_MAP_FIXTURE_DRIVER_UNSAFE",
    });
    expect(db.getDriver()).toEqual(original);
    expect(
      db.query.mock.calls.filter(([sql]) =>
        sql.includes("SELECT record, work_state"),
      ),
    ).toHaveLength(2);
  });

  it.each(["AS has_supply_pair", "INSERT INTO", "COMMIT"])(
    "rolls back %s failure and reports only a fixed error",
    async (failAt) => {
      const db = fixtureRepository({ failAt });
      await expect(db.repository.ensureLiveMapTestDriver()).rejects.toThrow(
        "LIVE_MAP_FIXTURE_PERSISTENCE_FAILED",
      );
      expect(db.query).toHaveBeenCalledWith("ROLLBACK");
      expect(db.release).toHaveBeenCalledOnce();
      expect(
        JSON.stringify(vi.mocked(Logger.prototype.warn).mock.calls),
      ).not.toContain("private");
    },
  );
});

describe("dev live-map fixture provisioning", () => {
  it("creates the missing reserved driver in an already populated registry without a seed-only vehicle pair", async () => {
    vi.stubEnv("DRTS_E2E_PROVISIONING", "true");
    vi.stubEnv("DRTS_ENV", "development");
    const audit = new AuditNotificationService();
    const profile = new DriverProfileService(audit);
    const events = {
      publishDriverLocationUpdated: vi.fn(),
      publishSupplyLifecycleUpdated: vi.fn(),
    };
    const seedService = new RegulatoryRegistryService(
      events as never,
      audit,
      profile,
    );
    const otherDriver = seedService
      .listDrivers()
      .find((driver) => driver.driverId === "drv-demo-001")!;
    // Mock only PostgreSQL I/O. The startup, repository and fixture decisions
    // execute production code; this is not a PostgreSQL/live acceptance test.
    const drivers = [otherDriver];
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("INSERT INTO reg.phase1_registry_drivers")) {
        const driver = JSON.parse(String(values[5]));
        drivers.push(driver);
        return { rows: [{ record: driver }], rowCount: 1 };
      }
      if (sql.includes("FROM reg.phase1_registry_drivers")) {
        return {
          rows: drivers
            .filter(
              (driver) =>
                !sql.includes("WHERE driver_id = $1") ||
                driver.driverId === values[0],
            )
            .map((record) => ({ record, work_state: record.workState })),
        };
      }
      if (sql.includes("AS has_supply_pair")) {
        return {
          rows: [
            {
              has_supply_pair: false,
              has_task: false,
              has_binding: false,
              has_profile_binding: false,
              has_pending_invitation: false,
              has_tracking_context: false,
            },
          ],
        };
      }
      return { rows: [] };
    });
    const client = { query, release: vi.fn() };
    const repository = new RegulatoryRegistryRepository({
      isEnabled: () => true,
      query,
      connect: async () => client,
    } as never);
    const service = new RegulatoryRegistryService(
      events as never,
      audit,
      profile,
      repository,
    );

    await service.onModuleInit();

    expect(service.listDrivers()).toContainEqual(
      expect.objectContaining({
        driverId: "drv-demo-002",
        workState: "offline",
        dispatchEligible: false,
        deviceBindings: [],
      }),
    );
    expect(
      service
        .listSupplyPairs()
        .some((pair) => pair.driverId === "drv-demo-002"),
    ).toBe(false);
    expect(
      drivers.find((driver) => driver.driverId === otherDriver.driverId),
    ).toEqual(otherDriver);
    expect(events.publishSupplyLifecycleUpdated).not.toHaveBeenCalled();
  });
});

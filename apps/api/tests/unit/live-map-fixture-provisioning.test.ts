import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryRepository } from "../../src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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

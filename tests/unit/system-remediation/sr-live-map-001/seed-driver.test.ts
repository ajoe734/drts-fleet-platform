import { expect, it, vi } from "vitest";
import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { SEEDED_MAP_DRIVER_ID } from "../../../e2e/system-remediation/sr-live-map-001/live-map-config";

it("audits the actual offline registry seed without contacting any notification transport", () => {
  const emit = vi.fn();
  const audit = new AuditNotificationService();
  const registry = new RegulatoryRegistryService(
    new OpsDispatchEventsService({ emit } as never),
    audit,
    new DriverProfileService(audit),
  );
  expect(
    registry
      .listDrivers()
      .find((driver) => driver.driverId === SEEDED_MAP_DRIVER_ID),
  ).toMatchObject({
    name: "Driver Demo Two",
    workState: "offline",
    dispatchEligible: false,
    lifecycleStatus: "active",
  });
  expect(() =>
    registry.assertDriverAuthEligible(SEEDED_MAP_DRIVER_ID),
  ).not.toThrow();
  expect(registry.listLatestDriverLocations()).toEqual([]);
  expect(emit).not.toHaveBeenCalled();
  // A static demo supply pair exists. It is not an active assignment; the
  // hosted runner must still read current registry, tasks and telemetry.
  expect(registry.listSupplyPairs()).toContainEqual(
    expect.objectContaining({
      driverId: SEEDED_MAP_DRIVER_ID,
      vehicleId: "veh-demo-002",
    }),
  );
});

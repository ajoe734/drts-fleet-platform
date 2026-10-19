import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";

// This is the production reader against all formal migrations, including
// V0004's UUID master key and V0012's textual runtime snapshot key. No SQL,
// schema, registry or database result is substituted.
describe.skipIf(!hostedPaymentEnabled)(
  "dispatch supply authority with textual and normalized vehicle IDs",
  () => {
    const h = new PaymentPostgresHarness();
    beforeAll(async () => {
      await h.open();
      await h.reset();
    }, 240000);
    afterAll(() => h.close(), 30000);

    it("reads synthetic IDs and normalized license metadata in the same bucket snapshot", async () => {
      const audit = new AuditNotificationService();
      const registry = new RegulatoryRegistryService(
        new OpsDispatchEventsService(new EventEmitter() as never),
        audit,
        new DriverProfileService(audit),
      );
      const store = new RegulatoryRegistryRepository(h.database);
      const base = registry.listVehicles()[0]!;
      const driver = registry.listDrivers()[0]!;
      const normalizedId = randomUUID();
      const textualId = "review-schema-textual-vehicle";
      // Insert only fixture data into the official normalized table. The
      // snapshot deliberately omits licenseType to exercise its real fallback.
      await h.pool!.query(
        `INSERT INTO reg.vehicles
           (vehicle_id, plate_no, vin, vehicle_form, license_class)
         VALUES ($1, $2, $3, 'sedan', 'multi_taxi')`,
        [normalizedId, "SCHEMA-UUID", `schema-${normalizedId}`],
      );
      await store.persistChanges({
        vehicles: [
          {
            ...base,
            vehicleId: textualId,
            plateNo: "SCHEMA-TEXT",
            supportedServiceBuckets: ["standard_taxi"],
            licenseType: "multi_purpose_taxi",
          },
          {
            ...base,
            vehicleId: normalizedId,
            plateNo: "SCHEMA-UUID",
            supportedServiceBuckets: ["standard_taxi"],
            licenseType: null,
          },
          {
            ...base,
            vehicleId: "review-schema-other-bucket",
            plateNo: "SCHEMA-OTHER",
            supportedServiceBuckets: ["business_dispatch"],
          },
        ],
        drivers: [driver],
        supplyPairs: [
          { vehicleId: textualId, driverId: driver.driverId, etaMinutes: 4 },
        ],
      });
      const { state } = await store.findDispatchSupplyContext("standard_taxi");
      expect(state.vehicles).toHaveLength(2);
      expect(state.vehicles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            vehicleId: textualId,
            licenseType: "multi_purpose_taxi",
          }),
          expect.objectContaining({
            vehicleId: normalizedId,
            licenseType: "multi_purpose_taxi",
          }),
        ]),
      );
      expect(state.supplyPairs).toEqual([
        { vehicleId: textualId, driverId: driver.driverId, etaMinutes: 4 },
      ]);
      expect(state.drivers).toEqual([
        expect.objectContaining({ driverId: driver.driverId }),
      ]);
    }, 30000);
  },
);

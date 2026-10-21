import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import { MemoryMailOutbox } from "../system-remediation/sr-credential-expiry-20260913/test-helpers";
import { ReminderSqlTransport, gate } from "./sql-transport";
import { enabledRegistryRepository } from "../registry-driver-master-durable-ack-20261014/storage-fixture";

const asOf = "2030-06-01T00:00:00.000Z";
const future = (days: number) =>
  new Date(Date.parse(asOf) + days * 86400000).toISOString();
function setup(
  db = new ReminderSqlTransport(),
  notification?: NotificationDeliveryService,
) {
  const audit = new AuditNotificationService();
  const repository = new RegulatoryRegistryRepository(db as never);
  const service = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter() as never),
    audit,
    new DriverProfileService(audit),
    repository,
    notification,
  );
  return {
    db,
    audit,
    repository,
    service,
    controller: new RegulatoryRegistryController(service),
  };
}
async function prepared(notification?: NotificationDeliveryService) {
  vi.stubEnv(
    "REGULATORY_ALERT_RECIPIENT_EMAIL",
    "approved-registry@example.test",
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(asOf);
  const f = setup(new ReminderSqlTransport(), notification);
  const driver = f.service
    .listDrivers()
    .find((d) => d.driverId === "drv-demo-001")!;
  f.db.drivers.set(driver.driverId, {
    ...driver,
    licenseExpiry: future(30),
    professionalDriverLicenseExpiry: future(100),
    taxiDriverRegistrationExpiry: future(100),
  });
  await f.controller.reconcileExpiry({ asOf });
  return f;
}
const renewal = () => ({
  licenseExpiry: future(100),
  professionalDriverLicenseExpiry: future(100),
  taxiDriverRegistrationExpiry: future(100),
});
const flushDetached = () =>
  new Promise<void>((resolve) => setImmediate(resolve));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("R1 actual detached renewal rejection and canonical rescan recovery", () => {
  it.each(["connect", "COMMIT"] as const)(
    "observes %s rejection after the real driver master ACK without claiming reminder supersession, then recovers through a fresh canonical scan",
    async (phase) => {
      const f = await prepared();
      const event = structuredClone([...f.db.events.values()][0]!);
      const intent = structuredClone([...f.db.intents.values()][0]!);
      const failure = Object.assign(
        new Error(`SIM renewal ${phase} rejected`),
        { code: "08006" },
      );
      const entered = gate(),
        release = gate();
      const actualConnect = f.db.connect.bind(f.db);
      vi.spyOn(f.db, "connect").mockImplementationOnce(async () => {
        if (phase === "connect") {
          entered.resolve();
          await release.promise;
          throw failure;
        }
        const client = await actualConnect();
        return {
          ...client,
          query: async <T extends Record<string, unknown>>(
            sql: string,
            values: readonly unknown[] = [],
          ) => {
            if (sql === "COMMIT") {
              entered.resolve();
              await release.promise;
              throw failure;
            }
            return client.query<T>(sql, values);
          },
        };
      });
      const errors = vi.spyOn(f.repository, "reportPersistenceFailure");
      const saved = await f.service.updateDriverLicenses(
        "drv-demo-001",
        renewal(),
      );
      await entered.promise;
      expect(saved.licenseExpiry).toBe(future(100));
      expect(f.db.drivers.get(saved.driverId)!.licenseExpiry).toBe(future(100));
      expect(saved.licensesValid).toBe(true);
      expect(saved.dispatchEligible).toBe(true);
      expect(
        f.audit
          .getAuditLogsSnapshot()
          .filter((log) => log.actionName === "update_driver_licenses"),
      ).toHaveLength(1);
      expect(errors).not.toHaveBeenCalled();
      release.resolve();
      await flushDetached();
      expect(errors).toHaveBeenCalledExactlyOnceWith(
        failure,
        "driver_license_renewal_reconciliation",
      );
      expect(f.db.events.get(event.event_id)).toEqual(event);
      expect(f.db.intents.get(intent.intent_id)).toEqual(intent);
      expect(event.status).toBe("pending");
      expect(intent.delivery_status).toBe("pending");
      expect(intent.outbox_delivery_id).toBeNull();
      const fresh = setup(f.db);
      await fresh.controller.reconcileExpiry({ asOf });
      expect(f.db.events.size).toBe(1);
      expect(f.db.intents.size).toBe(1);
      expect((await fresh.service.getExpiryEvent(event.event_id))?.status).toBe(
        "superseded",
      );
      expect(f.db.intents.get(intent.intent_id)).toMatchObject({
        ...intent,
        delivery_status: "superseded",
        updated_at: expect.any(String),
      });
      await fresh.controller.reconcileExpiry({ asOf });
      expect(f.db.events.size).toBe(1);
      expect(f.db.drivers.get(saved.driverId)!.licenseExpiry).toBe(future(100));
    },
  );
  it("retains the real accepted outbox identity/history while failed renewal cleanup waits for ordinary rescan", async () => {
    const outbox = new MemoryMailOutbox(),
      notification = new NotificationDeliveryService(outbox);
    const f = await prepared(notification);
    const original = structuredClone([...f.db.intents.values()][0]!);
    const receipt = await notification.get(
      "default",
      original.outbox_delivery_id!,
    );
    expect(receipt?.status).toBe("queued");
    const failure = Object.assign(new Error("SIM renewal pool unavailable"), {
      code: "ECONNREFUSED",
    });
    vi.spyOn(f.db, "connect").mockRejectedValueOnce(failure);
    const errors = vi.spyOn(f.repository, "reportPersistenceFailure");
    await f.service.updateDriverLicenses("drv-demo-001", renewal());
    await flushDetached();
    expect(errors).toHaveBeenCalledExactlyOnceWith(
      failure,
      "driver_license_renewal_reconciliation",
    );
    expect(f.db.intents.get(original.intent_id)).toEqual(original);
    expect(f.db.events.get(original.event_id)!.status).toBe("completed");
    await setup(f.db, notification).controller.reconcileExpiry({ asOf });
    const recovered = f.db.intents.get(original.intent_id)!;
    expect(recovered.delivery_status).toBe("superseded");
    expect(recovered.outbox_delivery_id).toBe(original.outbox_delivery_id);
    expect(
      await notification.get("default", recovered.outbox_delivery_id!),
    ).toEqual(receipt);
    expect(Object.values(outbox.state.deliveries)).toHaveLength(1);
  });
  it("executes the original shared fixture's real repository transaction contract without reporting a hidden callback failure", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(asOf);
    const repository = enabledRegistryRepository();
    const errors = vi.spyOn(repository, "reportPersistenceFailure");
    const transactions = vi.spyOn(repository, "withTransaction");
    const audit = new AuditNotificationService();
    const service = new RegulatoryRegistryService(
      new OpsDispatchEventsService(new EventEmitter() as never),
      audit,
      new DriverProfileService(audit),
      repository,
    );
    const saved = await service.updateDriverLicenses("drv-demo-001", renewal());
    await flushDetached();
    expect(saved.licenseExpiry).toBe(future(100));
    expect(saved.licensesValid).toBe(true);
    expect(transactions).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
    expect(
      service.listDrivers().find((d) => d.driverId === saved.driverId)
        ?.licenseExpiry,
    ).toBe(saved.licenseExpiry);
    expect(
      audit
        .getAuditLogsSnapshot()
        .filter((log) => log.actionName === "update_driver_licenses"),
    ).toHaveLength(1);
  });
  it("keeps explicitly awaited renewal failure observable to its actual caller", async () => {
    const f = await prepared();
    const failure = new Error("SIM directly awaited renewal rejected");
    vi.spyOn(f.db, "connect").mockRejectedValueOnce(failure);
    await expect(
      f.service.handleDriverLicenseRenewal("drv-demo-001", renewal()),
    ).rejects.toBe(failure);
    expect([...f.db.events.values()][0]!.status).toBe("pending");
  });
});

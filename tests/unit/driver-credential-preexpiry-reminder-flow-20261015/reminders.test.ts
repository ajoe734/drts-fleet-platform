import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import { ReminderSqlTransport, gate } from "./sql-transport";
import { MemoryMailOutbox } from "../system-remediation/sr-credential-expiry-20260913/test-helpers";
import type {
  OutboxState,
  MailTransport,
  ProviderAcknowledgement,
} from "../../../apps/api/src/modules/notification-delivery/notification-delivery.types";

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
    repository,
    service,
    controller: new RegulatoryRegistryController(service),
  };
}
function seed(days: number, notification?: NotificationDeliveryService) {
  const f = setup(new ReminderSqlTransport(), notification);
  const driver = f.service
    .listDrivers()
    .find((d) => d.driverId === "drv-demo-001")!;
  f.db.drivers.set(driver.driverId, {
    ...driver,
    licenseExpiry: future(days),
    professionalDriverLicenseExpiry: future(100),
    taxiDriverRegistrationExpiry: future(100),
  });
  return f;
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("original T30/T7 actual Registry producer and real SQL boundary (socketfree SIM transport)", () => {
  it.each([
    [30, 1],
    [7, 2],
  ])(
    "creates distinct canonical milestone reminders for a future credential at day %s",
    async (days, expected) => {
      vi.stubEnv(
        "REGULATORY_ALERT_RECIPIENT_EMAIL",
        "approved-registry@example.test",
      );
      const f = seed(days);
      const result = await f.controller.reconcileExpiry({ asOf });
      expect(result.data.expiredEventsCreated).toBe(0);
      expect(
        [...f.db.events.values()].filter((e) =>
          e.credential_type.includes("preexpiry"),
        ),
      ).toHaveLength(expected);
      expect(f.db.intents.size).toBe(expected);
      expect(
        [...f.db.intents.values()].every(
          (i) => i.recipient_email === "approved-registry@example.test",
        ),
      ).toBe(true);
    },
  );
  it("retains the actual expired producer positive without relabeling its fingerprint", async () => {
    vi.stubEnv(
      "REGULATORY_ALERT_RECIPIENT_EMAIL",
      "approved-registry@example.test",
    );
    const f = seed(-1);
    const result = await f.controller.reconcileExpiry({ asOf });
    expect(result.data.expiredEventsCreated).toBe(1);
    expect([...f.db.events.values()].map((e) => e.credential_type)).toEqual([
      "driver_license",
    ]);
  });
});

class ObservedOutbox extends MemoryMailOutbox {
  rejectNext = false;
  loseAck = false;
  accepted: ReturnType<typeof gate<void>> | undefined;
  releaseAck: ReturnType<typeof gate<void>> | undefined;
  override async transaction<T>(
    operation: (state: OutboxState) => T,
  ): Promise<T> {
    if (this.rejectNext) {
      this.rejectNext = false;
      throw Object.assign(new Error("SIM outbox rejected"), { code: "EIO" });
    }
    const value = await super.transaction(operation);
    if (this.loseAck) {
      this.loseAck = false;
      throw Object.assign(new Error("SIM outbox stored, ACK lost"), {
        code: "ECONNRESET",
      });
    }
    if (this.releaseAck) {
      this.accepted?.resolve();
      const wait = this.releaseAck;
      this.releaseAck = undefined;
      await wait.promise;
    }
    return value;
  }
}
const recipient = () =>
  vi.stubEnv(
    "REGULATORY_ALERT_RECIPIENT_EMAIL",
    "approved-registry@example.test",
  );
const ids = (db: ReminderSqlTransport) =>
  [...db.events.values()].map((e) => e.event_id).sort();

describe("complete original reminder immutable handoff and recovery", () => {
  it("crosses the exact T30 boundary without clock equality and freezes actual source/recipient/payload across replay/config changes", async () => {
    recipient();
    const f = seed(30);
    await f.controller.reconcileExpiry({
      asOf: new Date(Date.parse(asOf) - 1).toISOString(),
    });
    expect(f.db.events.size).toBe(0);
    await f.controller.reconcileExpiry({ asOf });
    const event = [...f.db.events.values()][0]!;
    const intent = [...f.db.intents.values()][0]!;
    expect(event.credential_type).toBe("preexpiry:driver_license:30");
    expect(intent.body).toContain(future(30));
    expect(intent.body).toContain("drv-demo-001");
    expect(intent.idempotency_key.length).toBeLessThanOrEqual(255);
    vi.stubEnv(
      "REGULATORY_ALERT_RECIPIENT_EMAIL",
      "later-approved@example.test",
    );
    await setup(f.db).controller.reconcileExpiry({
      asOf: future(1),
      recipientEmail: "foreign-request@example.test",
    } as never);
    expect(ids(f.db)).toEqual([event.event_id]);
    expect([...f.db.intents.values()]).toEqual([intent]);
    const scan = f.db.calls.find((c) =>
      c.sql.includes("/* preexpiry-source */"),
    )!;
    expect(scan.values).toEqual([
      new Date(Date.parse(asOf) - 1).toISOString(),
      100,
      null,
      "drv-demo-001",
      new Date(Date.parse(future(30)) - 1).toISOString(),
    ]);
    expect(scan.sql).toContain("ORDER BY d.driver_id ASC LIMIT $2");
    expect(scan.sql).toContain("::timestamptz > $1");
    expect(scan.sql).toContain("::timestamptz <= $5");
  });
  it.each([undefined, "invalid address"])(
    "keeps missing/invalid approved recipient %s pending without a placeholder and recovers its same source",
    async (configured) => {
      if (configured === undefined)
        vi.stubEnv("REGULATORY_ALERT_RECIPIENT_EMAIL", undefined);
      else vi.stubEnv("REGULATORY_ALERT_RECIPIENT_EMAIL", configured);
      const f = seed(7);
      const response = await f.controller.reconcileExpiry({ asOf });
      const original = ids(f.db);
      expect(response.data.preexpiry?.recipientStatus).toBe("unavailable");
      expect(f.db.events.size).toBe(2);
      expect(f.db.intents.size).toBe(0);
      expect(
        [...f.db.events.values()].every((e) => e.status === "pending"),
      ).toBe(true);
      recipient();
      await setup(f.db).controller.reconcileExpiry({ asOf });
      expect(ids(f.db)).toEqual(original);
      expect(f.db.intents.size).toBe(2);
      expect(
        [...f.db.intents.values()].every(
          (i) =>
            i.recipient_email === "approved-registry@example.test" &&
            i.delivery_status === "pending",
        ),
      ).toBe(true);
    },
  );
  it("does not create outside-window reminders, supersedes a cleared source, and preserves healthy preexpiry availability", async () => {
    recipient();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(asOf);
    const f = seed(31);
    await f.service.updateDriverLicenses("drv-demo-001", {
      licenseExpiry: future(31),
      professionalDriverLicenseExpiry: future(100),
      taxiDriverRegistrationExpiry: future(100),
    });
    expect(
      f.service.getDriverAvailability("drv-demo-001", "standard_taxi"),
    ).toBe(true);
    await f.controller.reconcileExpiry({ asOf });
    expect(f.db.events.size).toBe(0);
    await f.service.updateDriverLicenses("drv-demo-001", {
      licenseExpiry: future(7),
    });
    await f.controller.reconcileExpiry({ asOf });
    expect(
      f.service.getDriverAvailability("drv-demo-001", "standard_taxi"),
    ).toBe(true);
    expect(f.db.drivers.get("drv-demo-001")!.licenseExpiry).toBe(future(7));
    f.db.drivers.get("drv-demo-001")!.licenseExpiry = null;
    await f.controller.reconcileExpiry({ asOf });
    expect(
      [...f.db.events.values()].every((e) => e.status === "superseded"),
    ).toBe(true);
  });
  it("deduplicates all three credential fields and both milestones across101 sources, bounded pages, restart and competing ordinary instances", async () => {
    recipient();
    const f = seed(7);
    const driver = f.db.drivers.get("drv-demo-001")!;
    for (let i = 1; i <= 101; i++) {
      const driverId = `driver-${String(i).padStart(3, "0")}`;
      f.db.drivers.set(driverId, {
        ...driver,
        driverId,
        professionalDriverLicenseExpiry: future(7),
        taxiDriverRegistrationExpiry: future(7),
      });
    }
    f.db.drivers.delete("drv-demo-001");
    await Promise.all([
      f.controller.reconcileExpiry({ asOf, limit: 20 }),
      setup(f.db).controller.reconcileExpiry({ asOf, limit: 20 }),
    ]);
    expect(f.db.events.size).toBe(606);
    expect(f.db.intents.size).toBe(606);
    const original = ids(f.db);
    await setup(f.db).controller.reconcileExpiry({ asOf, limit: 20 });
    expect(ids(f.db)).toEqual(original);
    expect(
      new Set([...f.db.events.values()].map((e) => e.source_fingerprint)).size,
    ).toBe(606);
    const pages = f.db.calls.filter((c) =>
      c.sql.includes("/* preexpiry-source */"),
    );
    expect(
      pages.every((c) => c.values[1] === 20 && c.values[3] === "driver-101"),
    ).toBe(true);
    expect(pages.some((c) => c.values[2] === "driver-100")).toBe(true);
    expect(
      [...f.db.events.values()].every(
        (e) =>
          e.entity_type === "driver" &&
          e.credential_type.startsWith("preexpiry:"),
      ),
    ).toBe(true);
  });
  it("waits for actual canonical COMMIT and leaves no partial event/intent on rejection before a lawful retry", async () => {
    recipient();
    const f = seed(30);
    const entered = gate(),
      release = gate();
    f.db.commitEntered = entered;
    f.db.commitGate = release;
    let settled = false;
    const call = f.controller.reconcileExpiry({ asOf }).finally(() => {
      settled = true;
    });
    await entered.promise;
    expect(settled).toBe(false);
    expect(f.db.events.size).toBe(0);
    expect(f.db.intents.size).toBe(0);
    f.db.rejectCommit = true;
    release.resolve();
    await expect(call).rejects.toThrow(
      "SIM commit rejected before application",
    );
    expect(f.db.events.size).toBe(0);
    expect(f.db.intents.size).toBe(0);
    f.db.commitGate = undefined;
    await setup(f.db).controller.reconcileExpiry({ asOf });
    expect(f.db.events.size).toBe(1);
    expect(f.db.intents.size).toBe(1);
  });
  it("recovers a real applied canonical COMMIT with lost ACK using the same persisted identities", async () => {
    recipient();
    const f = seed(7);
    f.db.loseCommitAck = true;
    await expect(f.controller.reconcileExpiry({ asOf })).rejects.toThrow(
      "SIM commit applied, ACK lost",
    );
    const original = ids(f.db);
    expect(original).toHaveLength(2);
    expect(f.db.intents.size).toBe(2);
    await setup(f.db).controller.reconcileExpiry({ asOf });
    expect(ids(f.db)).toEqual(original);
    expect(f.db.intents.size).toBe(2);
  });
  it.each(["rejected", "unknown"])(
    "retains pending immutable intent after %s outbox acceptance and recovers one actual receipt",
    async (outcome) => {
      recipient();
      const outbox = new ObservedOutbox();
      outbox.rejectNext = outcome === "rejected";
      outbox.loseAck = outcome === "unknown";
      const f = seed(30, new NotificationDeliveryService(outbox));
      await f.controller.reconcileExpiry({ asOf });
      const intent = [...f.db.intents.values()][0]!;
      expect(intent.delivery_status).toBe("pending");
      expect(intent.outbox_delivery_id).toBeNull();
      const accepted = Object.values(outbox.state.deliveries)[0]?.receipt
        .deliveryId;
      await setup(
        f.db,
        new NotificationDeliveryService(outbox),
      ).controller.reconcileExpiry({ asOf });
      const recovered = [...f.db.intents.values()][0]!;
      expect(recovered.intent_id).toBe(intent.intent_id);
      expect(recovered.delivery_status).toBe("enqueued");
      expect(Object.values(outbox.state.deliveries)).toHaveLength(1);
      if (accepted) expect(recovered.outbox_delivery_id).toBe(accepted);
      const actual = await new NotificationDeliveryService(outbox).get(
        "default",
        recovered.outbox_delivery_id!,
      );
      expect(actual).toMatchObject({
        status: "queued",
        attempts: [],
        sentAt: null,
      });
      expect(
        await new NotificationDeliveryService(outbox).get(
          "foreign-scope",
          recovered.outbox_delivery_id!,
        ),
      ).toBeNull();
    },
  );
  it("recovers accepted-outbox-before-link failure through the original producer and same durable key/receipt", async () => {
    recipient();
    const outbox = new ObservedOutbox();
    const f = seed(30, new NotificationDeliveryService(outbox));
    f.db.rejectLinks = 2;
    await expect(f.controller.reconcileExpiry({ asOf })).rejects.toThrow(
      "SIM receipt link rejected",
    );
    const receipt = Object.values(outbox.state.deliveries)[0]!.receipt;
    expect(f.db.intents.size).toBe(1);
    expect([...f.db.intents.values()][0]!.outbox_delivery_id).toBeNull();
    await setup(
      f.db,
      new NotificationDeliveryService(outbox),
    ).controller.reconcileExpiry({ asOf });
    expect([...f.db.intents.values()][0]!.outbox_delivery_id).toBe(
      receipt.deliveryId,
    );
    expect(Object.values(outbox.state.deliveries)).toHaveLength(1);
  });
  it("retains a real late accepted outbox identity after actual driver renewal and never dispatches the superseded message", async () => {
    recipient();
    const outbox = new ObservedOutbox();
    const accepted = gate(),
      release = gate();
    outbox.accepted = accepted;
    outbox.releaseAck = release;
    const send = vi.fn(async () => ({
      provider: "SIM",
      response: "accepted",
      providerMessageId: "SIM-id",
      acceptedAt: asOf,
    }));
    const f = seed(
      30,
      new NotificationDeliveryService(outbox, { provider: "SIM", send }),
    );
    const work = f.controller.reconcileExpiry({ asOf });
    await accepted.promise;
    const old = [...f.db.events.values()][0]!;
    await f.service.updateDriverLicenses("drv-demo-001", {
      licenseExpiry: future(100),
      professionalDriverLicenseExpiry: future(100),
      taxiDriverRegistrationExpiry: future(100),
    });
    await f.service.handleDriverLicenseRenewal("drv-demo-001", {
      licenseExpiry: future(100),
    });
    release.resolve();
    await work;
    const current = await f.service.getExpiryEvent(old.event_id);
    expect(current?.status).toBe("superseded");
    expect(current?.intent?.delivery_status).toBe("superseded");
    expect(current?.intent?.outbox_delivery_id).toBe(
      Object.values(outbox.state.deliveries)[0]!.receipt.deliveryId,
    );
    expect(send).not.toHaveBeenCalled();
    expect(current?.source_expiry_at).toEqual(old.source_expiry_at);
    expect(f.db.drivers.get("drv-demo-001")!.licenseExpiry).toBe(future(100));
  });
  it("keeps provider late acceptance and original receipt history even when renewal occurs during an actual in-flight send", async () => {
    recipient();
    const outbox = new ObservedOutbox(),
      started = gate(),
      finish = gate<ProviderAcknowledgement>();
    const transport: MailTransport = {
      provider: "SIM",
      send: async () => {
        started.resolve();
        return finish.promise;
      },
    };
    const notification = new NotificationDeliveryService(outbox, transport);
    const f = seed(30, notification);
    const work = f.controller.reconcileExpiry({ asOf });
    await started.promise;
    const original = [...f.db.events.values()][0]!;
    await f.service.updateDriverLicenses("drv-demo-001", {
      licenseExpiry: future(100),
      professionalDriverLicenseExpiry: future(100),
      taxiDriverRegistrationExpiry: future(100),
    });
    await f.service.handleDriverLicenseRenewal("drv-demo-001", {
      licenseExpiry: future(100),
    });
    finish.resolve({
      provider: "SIM",
      response: "accepted-late",
      providerMessageId: "SIM-late-reference",
      acceptedAt: asOf,
    });
    await work;
    const event = await f.service.getExpiryEvent(original.event_id);
    expect(event?.status).toBe("superseded");
    expect(event?.intent?.delivery_status).toBe("superseded");
    const receipt = await notification.get(
      "default",
      event!.intent!.outbox_delivery_id!,
    );
    expect(receipt?.status).toBe("sent");
    expect(receipt?.attempts[0]?.acknowledgement?.providerMessageId).toBe(
      "SIM-late-reference",
    );
    await setup(f.db, notification).controller.reconcileExpiry({ asOf });
    expect(f.db.events.size).toBe(1);
    expect(Object.values(outbox.state.deliveries)).toHaveLength(1);
  });
  it("starts on the real module startup and continues across crossed milestones on the original periodic rail, with cleanup", async () => {
    recipient();
    vi.useFakeTimers();
    vi.setSystemTime(asOf);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_EXPIRY_RECONCILIATION_LOOP", "true");
    const f = seed(31);
    await f.service.onModuleInit();
    expect(f.db.events.size).toBe(0);
    vi.setSystemTime(future(1));
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.db.events.size).toBe(1);
    expect([...f.db.events.values()][0]!.credential_type).toBe(
      "preexpiry:driver_license:30",
    );
    await f.service.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
    const fresh = setup(f.db);
    await fresh.service.onModuleInit();
    expect(f.db.events.size).toBe(1);
    await fresh.service.onModuleDestroy();
  });
});

describe("unchanged source and source authority failures", () => {
  it("retains source/milestone identity when a legitimate same-expiry master retry changes updatedAt, then separates a new expiry revision", async () => {
    recipient();
    const f = seed(30);
    await f.controller.reconcileExpiry({ asOf });
    const original = ids(f.db);
    await f.service.updateDriverLicenses("drv-demo-001", {
      licenseExpiry: future(30),
      professionalDriverLicenseExpiry: future(100),
      taxiDriverRegistrationExpiry: future(100),
    });
    await f.service.handleDriverLicenseRenewal("drv-demo-001", {
      licenseExpiry: future(30),
    });
    await setup(f.db).controller.reconcileExpiry({ asOf });
    expect(ids(f.db)).toEqual(original);
    expect(f.db.events.get(original[0]!)!.status).toBe("pending");
    await f.service.updateDriverLicenses("drv-demo-001", {
      licenseExpiry: future(7),
    });
    await f.service.handleDriverLicenseRenewal("drv-demo-001", {
      licenseExpiry: future(7),
    });
    await setup(f.db).controller.reconcileExpiry({ asOf });
    expect(f.db.events.get(original[0]!)!.status).toBe("superseded");
    expect(f.db.events.size).toBe(3);
    expect(
      [...f.db.events.values()]
        .filter((e) => e.status !== "superseded")
        .map((e) => e.credential_type)
        .sort(),
    ).toEqual(["preexpiry:driver_license:30", "preexpiry:driver_license:7"]);
  });
  it("supersedes still-pending reminder work at actual expiry while retaining separate original expired work", async () => {
    recipient();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(asOf);
    const f = seed(7);
    await f.controller.reconcileExpiry({ asOf });
    const original = ids(f.db);
    expect(original).toHaveLength(2);
    vi.setSystemTime(future(7));
    const expired = await f.controller.reconcileExpiry({ asOf: future(7) });
    expect(expired.data.expiredEventsCreated).toBe(1);
    expect(
      original.every((id) => f.db.events.get(id)!.status === "superseded"),
    ).toBe(true);
    expect(
      [...f.db.intents.values()]
        .filter((i) => original.includes(i.event_id))
        .every((i) => i.delivery_status === "superseded"),
    ).toBe(true);
    expect(
      [...f.db.events.values()].filter(
        (e) => e.credential_type === "driver_license",
      ),
    ).toHaveLength(1);
    expect(f.db.events.size).toBe(3);
  });
  it("does not target inactive canonical drivers and rechecks each reminder under driver-before-event transaction locks", async () => {
    recipient();
    const outbox = new MemoryMailOutbox();
    const f = seed(30, new NotificationDeliveryService(outbox));
    f.db.drivers.get("drv-demo-001")!.lifecycleStatus = "suspended";
    await f.controller.reconcileExpiry({ asOf });
    expect(f.db.events.size).toBe(0);
    f.db.drivers.get("drv-demo-001")!.lifecycleStatus = "active";
    await f.controller.reconcileExpiry({ asOf });
    const event = [...f.db.events.values()][0]!;
    const eventLocks = f.db.calls.filter(
      (c) =>
        c.sql.includes("SELECT event_id") &&
        c.sql.includes("FOR UPDATE") &&
        c.values[0] === event.event_id,
    );
    expect(eventLocks.length).toBeGreaterThanOrEqual(2);
    for (const lock of eventLocks) {
      const sameTransaction = f.db.calls.filter((c) => c.tx === lock.tx);
      const driverLock = sameTransaction.find(
        (c) =>
          c.sql.includes("SELECT record FROM reg.phase1_registry_drivers") &&
          c.sql.includes("FOR UPDATE"),
      );
      expect(driverLock?.values[0]).toBe("drv-demo-001");
      expect(sameTransaction.indexOf(driverLock!)).toBeLessThan(
        sameTransaction.indexOf(lock),
      );
    }
    expect([...f.db.intents.values()][0]!.outbox_delivery_id).toBe(
      Object.values(outbox.state.deliveries)[0]!.receipt.deliveryId,
    );
  });
  it("propagates configured canonical source query failure instead of treating it as no reminders", async () => {
    recipient();
    const f = seed(30);
    const query = f.db.query.bind(f.db);
    vi.spyOn(f.db, "query").mockImplementation((sql, values) => {
      if (sql.includes("/* preexpiry-source */"))
        throw Object.assign(
          new Error("SIM reminder source table unavailable"),
          { code: "42P01" },
        );
      return query(sql, values);
    });
    await expect(f.controller.reconcileExpiry({ asOf })).rejects.toThrow(
      "SIM reminder source table unavailable",
    );
    expect(f.db.events.size).toBe(0);
    expect(f.db.intents.size).toBe(0);
  });
});

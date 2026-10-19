import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { RegulatoryRegistryController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import { MemoryMailOutbox } from "../system-remediation/sr-credential-expiry-20260913/test-helpers";
import { ExpirySqlTransport } from "./sql-transport";

const asOf = "2030-06-01T00:00:00.000Z";
function setup(
  db: ExpirySqlTransport,
  notification?: NotificationDeliveryService,
) {
  const repository = new RegulatoryRegistryRepository(db as never);
  const audit = new AuditNotificationService();
  const ops = new OpsDispatchEventsService(
    new EventEmitter() as unknown as ConstructorParameters<
      typeof OpsDispatchEventsService
    >[0],
  );
  const service = new RegulatoryRegistryService(
    ops,
    audit,
    new DriverProfileService(audit),
    repository,
    notification,
  );
  return {
    db,
    service,
    repository,
    controller: new RegulatoryRegistryController(service),
  };
}
function seeded(drivers = 5, policies = 5) {
  const db = new ExpirySqlTransport();
  const f = setup(db);
  const driver = f.service.listDrivers()[0]!;
  const policy = f.service.listPolicies()[0]!;
  for (let i = 1; i <= drivers; i++) {
    const driverId = `drv-demo-${String(i).padStart(3, "0")}`;
    db.drivers.set(driverId, {
      ...driver,
      driverId,
      licenseExpiry: "2020-01-01T00:00:00.000Z",
      professionalDriverLicenseExpiry: "2099-01-01T00:00:00.000Z",
      taxiDriverRegistrationExpiry: "2099-01-01T00:00:00.000Z",
    });
  }
  for (let i = 1; i <= policies; i++) {
    const policyId = `policy-${i}`;
    db.policies.set(policyId, {
      ...policy,
      policyId,
      policyNo: `POL-${i}`,
      status: "active",
      startAt: "2019-01-01T00:00:00.000Z",
      endAt: "2020-01-01T00:00:00.000Z",
    });
  }
  return db;
}

describe("Registry actual enabled Repository SQL/executor boundary (controlled transport, not PG)", () => {
  it("reaches101 drivers and101 policies through the unchanged default100 SQL pages and leaves response/pending limits unchanged", async () => {
    const db = seeded(101, 101);
    const first = await setup(db).controller.reconcileExpiry({ asOf });
    expect(first.data.scannedDrivers).toBe(101);
    expect(first.data.scannedPolicies).toBe(101);
    expect(first.data.expiredEventsCreated).toBe(202);
    expect(db.events.size).toBe(202);
    const scans = db.calls.filter((c) => c.sql.includes("LIMIT $2"));
    expect(scans).toHaveLength(4);
    expect(scans.every((c) => c.values[1] === 100)).toBe(true);
    expect(
      db.calls.find(
        (c) =>
          c.sql.includes("delivery_status = 'pending'") &&
          c.sql.includes("LIMIT $1"),
      )!.values,
    ).toEqual([100]);
    expect(
      db.calls.some(
        (c) =>
          c.sql.includes("LIMIT 100") &&
          c.sql.includes(
            "LEFT JOIN reg.phase1_registry_expiry_delivery_intents",
          ),
      ),
    ).toBe(true);
    const second = await setup(db).controller.reconcileExpiry({ asOf });
    expect(second.data.expiredEventsCreated).toBe(0);
    expect(db.events.size).toBe(202);
  });

  it("retains the same receipt across replay, millisecond Date readback and a later receipt-link conflict", async () => {
    const db = seeded(1, 0);
    db.drivers.get("drv-demo-001")!.licenseExpiry = "2020-01-01T00:00:00.123Z";
    const outbox = new MemoryMailOutbox();
    const f = setup(db, new NotificationDeliveryService(outbox));
    await f.controller.reconcileExpiry({ asOf, limit: 2 });
    const original = [...db.intents.values()][0]!;
    expect(original.delivery_status).toBe("enqueued");
    expect(db.events.get(original.event_id)!.status).toBe("completed");
    await expect(
      f.repository.recordExpiryDeliveryOutcome(original, {
        deliveryStatus: "enqueued",
        outboxDeliveryId: "conflicting-receipt",
      }),
    ).rejects.toThrow("registry_expiry_receipt_link_conflict");
    expect(db.intents.get(original.intent_id)).toEqual(original);
    await setup(
      db,
      new NotificationDeliveryService(outbox),
    ).controller.reconcileExpiry({ asOf });
    expect(db.intents.size).toBe(1);
    expect(Object.values(outbox.state.deliveries)).toHaveLength(1);
  });

  it("keeps page limit2, reaches both fifth sources, then a fresh replica/new source/changed fingerprint and concurrent reconcilers", async () => {
    const db = seeded();
    const f = setup(db);
    const first = await f.controller.reconcileExpiry({ asOf, limit: 2 });
    expect(first.data.scannedDrivers).toBe(5);
    expect(first.data.scannedPolicies).toBe(5);
    expect(db.events.size).toBe(10);
    const scans = db.calls.filter((c) => c.sql.includes("LIMIT $2"));
    expect(scans).toHaveLength(6);
    expect(scans.every((c) => c.values[1] === 2 && c.values[3] != null)).toBe(
      true,
    );
    expect(
      scans
        .filter((c) => c.sql.includes("SELECT d.record"))
        .map((c) => c.values[2]),
    ).toEqual([null, "drv-demo-002", "drv-demo-004"]);
    expect(
      scans
        .filter((c) => c.sql.includes("ORDER BY policy_id"))
        .map((c) => c.values[2]),
    ).toEqual([null, "policy-2", "policy-4"]);
    const restarted = setup(db);
    const replay = await restarted.controller.reconcileExpiry({
      asOf,
      limit: 2,
    });
    expect(replay.data.expiredEventsCreated).toBe(0);
    expect(db.events.size).toBe(10);
    db.drivers.set("drv-new", {
      ...db.drivers.get("drv-demo-001")!,
      driverId: "drv-new",
    });
    db.drivers.get("drv-demo-001")!.licenseExpiry = "2018-01-01T00:00:00.000Z";
    db.policies.set("policy-new", {
      ...db.policies.get("policy-1")!,
      policyId: "policy-new",
      policyNo: "POL-NEW",
    });
    db.policies.get("policy-1")!.endAt = "2018-01-01T00:00:00.000Z";
    const results = await Promise.all([
      setup(db).controller.reconcileExpiry({ asOf, limit: 2 }),
      setup(db).controller.reconcileExpiry({ asOf, limit: 2 }),
    ]);
    expect(
      results.reduce((sum, r) => sum + r.data.expiredEventsCreated, 0),
    ).toBe(4);
    expect(db.events.size).toBe(14);
    expect(
      new Set([...db.events.values()].map((e) => e.source_fingerprint)).size,
    ).toBe(14);
    const readback = await restarted.controller.getExpiryBacklog();
    expect(readback.data.some((e) => e.entity_id === "drv-new")).toBe(true);
    expect(readback.data.some((e) => e.entity_id === "policy-new")).toBe(true);
    expect(
      readback.data
        .filter((e) => e.entity_id === "drv-demo-001")
        .map((e) => e.status)
        .sort(),
    ).toEqual(["pending", "superseded"]);
    expect(
      readback.data
        .filter((e) => e.entity_id === "policy-1")
        .map((e) => e.status)
        .sort(),
    ).toEqual(["pending", "superseded"]);
  });

  it("recovers enqueue-before-link crash using the same canonical receipt and source-before-event locks", async () => {
    const db = seeded(1, 0);
    const outbox = new MemoryMailOutbox();
    const notification = new NotificationDeliveryService(outbox);
    db.rejectIntentWrites = 2; // Link and attempted error bookkeeping both fail at SQL storage.
    await expect(
      setup(db, notification).controller.reconcileExpiry({ asOf, limit: 2 }),
    ).rejects.toThrow("controlled Registry link storage failure");
    const original = [...db.intents.values()][0]!;
    expect(original.delivery_status).toBe("pending");
    expect(original.outbox_delivery_id).toBeNull();
    expect(Object.values(outbox.state.deliveries)).toHaveLength(1);
    const receiptId = Object.values(outbox.state.deliveries)[0]!.receipt
      .deliveryId;
    const restarted = setup(db, new NotificationDeliveryService(outbox));
    await restarted.controller.reconcileExpiry({ asOf, limit: 2 });
    expect(db.intents.size).toBe(1);
    expect(db.intents.get(original.intent_id)).toMatchObject({
      delivery_status: "enqueued",
      outbox_delivery_id: receiptId,
    });
    expect(db.events.get(original.event_id)!.status).toBe("completed");
    expect(Object.values(outbox.state.deliveries)).toHaveLength(1);
    const eventLocks = db.calls.filter(
      (c) => c.sql.includes("SELECT event_id") && c.sql.includes("FOR UPDATE"),
    );
    expect(eventLocks.length).toBeGreaterThan(0);
    for (const lock of eventLocks) {
      const tx = db.calls.filter((c) => c.tx === lock.tx);
      const sourceLock = tx.findIndex(
        (c) =>
          c.sql.includes("FROM reg.phase1_registry_drivers") &&
          c.sql.includes("FOR UPDATE"),
      );
      expect(sourceLock).toBeGreaterThan(-1);
      expect(sourceLock).toBeLessThan(tx.indexOf(lock));
    }
  });

  it("retains the original superseding event link when a late accepted receipt is linked after a new fingerprint", async () => {
    const db = seeded(1, 0);
    const f = setup(db);
    await f.controller.reconcileExpiry({ asOf });
    const original = [...db.intents.values()][0]!;
    const notification = new NotificationDeliveryService(
      new MemoryMailOutbox(),
    );
    const receipt = await notification.enqueue({
      tenantId: original.tenant_id,
      idempotencyKey: original.idempotency_key,
      recipientEmail: original.recipient_email,
      fromEmail: original.from_email,
      subject: original.subject,
      body: original.body,
    });
    db.drivers.get("drv-demo-001")!.licenseExpiry = "2018-01-01T00:00:00.000Z";
    await setup(db).controller.reconcileExpiry({ asOf });
    const superseded = structuredClone(db.events.get(original.event_id)!);
    expect(superseded.status).toBe("superseded");
    expect(superseded.superseded_by_event_id).toBeTruthy();
    await f.repository.recordExpiryDeliveryOutcome(original, {
      deliveryStatus: "enqueued",
      outboxDeliveryId: receipt.deliveryId,
    });
    expect(db.events.get(original.event_id)).toEqual(superseded);
    expect(db.intents.get(original.intent_id)).toMatchObject({
      delivery_status: "superseded",
      outbox_delivery_id: receipt.deliveryId,
    });
  });

  it("retains terminal real enqueue content conflict without creating or retrying another intent", async () => {
    const db = seeded(1, 0);
    const f = setup(db);
    await f.controller.reconcileExpiry({ asOf, limit: 2 });
    const intent = [...db.intents.values()][0]!;
    const outbox = new MemoryMailOutbox();
    const notification = new NotificationDeliveryService(outbox);
    await notification.enqueue({
      tenantId: intent.tenant_id,
      idempotencyKey: intent.idempotency_key,
      recipientEmail: intent.recipient_email,
      fromEmail: intent.from_email,
      subject: intent.subject,
      body: "different frozen content",
    });
    await setup(db, notification).controller.reconcileExpiry({
      asOf,
      limit: 2,
    });
    expect(db.intents.get(intent.intent_id)).toMatchObject({
      delivery_status: "failed",
      last_error: "notification_idempotency_conflict",
      outbox_delivery_id: null,
    });
    const updates = db.calls.filter((c) =>
      c.sql.includes("UPDATE reg.phase1_registry_expiry_delivery_intents"),
    ).length;
    await setup(db, notification).controller.reconcileExpiry({
      asOf,
      limit: 2,
    });
    expect(db.intents.size).toBe(1);
    expect(
      db.calls.filter((c) =>
        c.sql.includes("UPDATE reg.phase1_registry_expiry_delivery_intents"),
      ),
    ).toHaveLength(updates);
    expect(Object.values(outbox.state.deliveries)).toHaveLength(1);
  });
});

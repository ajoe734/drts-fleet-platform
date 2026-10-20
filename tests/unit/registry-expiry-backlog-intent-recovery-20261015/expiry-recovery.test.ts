import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { RegulatoryRegistryController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import {
  DeliveryTransportError,
  type MailTransport,
  type OutboxState,
  type ProviderAcknowledgement,
} from "../../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import { legacyExpiryRegistryStorage } from "../registry-driver-master-durable-ack-20261014/storage-fixture";
import { MemoryMailOutbox } from "../system-remediation/sr-credential-expiry-20260913/test-helpers";
import { AcademyService } from "../../../apps/api/src/modules/driver-academy/academy.service";
import { AcademyRepository } from "../../../apps/api/src/modules/driver-academy/academy.repository";

const asOf = "2030-06-01T00:00:00.000Z";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(
  options: {
    storage?: ReturnType<typeof legacyExpiryRegistryStorage>;
    notification?: NotificationDeliveryService;
    drivers?: number;
    policies?: number;
    academy?: AcademyService;
  } = {},
) {
  const storage = options.storage ?? legacyExpiryRegistryStorage();
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
    storage.repository,
    options.notification,
    options.academy,
  );
  const driver = service.listDrivers()[0]!;
  const policy = service.listPolicies()[0]!;
  Object.assign(service, {
    drivers: Array.from({ length: options.drivers ?? 1 }, (_, i) => ({
      ...driver,
      driverId: `drv-demo-${String(i + 1).padStart(3, "0")}`,
      licenseExpiry: "2020-01-01T00:00:00.000Z",
      professionalDriverLicenseExpiry: "2099-01-01T00:00:00.000Z",
      taxiDriverRegistrationExpiry: "2099-01-01T00:00:00.000Z",
    })),
    policies: Array.from({ length: options.policies ?? 0 }, (_, i) => ({
      ...policy,
      policyId: `policy-${i + 1}`,
      policyNo: `POL-${i + 1}`,
      status: "active",
      startAt: "2019-01-01T00:00:00.000Z",
      endAt: "2020-01-01T00:00:00.000Z",
    })),
  });
  return {
    service,
    controller: new RegulatoryRegistryController(service),
    ...storage,
  };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("original Registry bounded backlog and immutable handoff", () => {
  it("passes the unchanged default100 without a supplied limit and deduplicates concurrent noDB invocations", async () => {
    const f = fixture({ drivers: 101, policies: 101 });
    const results = await Promise.all([
      f.controller.reconcileExpiry({ asOf }),
      f.controller.reconcileExpiry({ asOf }),
    ]);
    expect(
      results.every(
        (r) => r.data.scannedDrivers === 101 && r.data.scannedPolicies === 101,
      ),
    ).toBe(true);
    expect(results.reduce((n, r) => n + r.data.expiredEventsCreated, 0)).toBe(
      202,
    );
    expect(results.reduce((n, r) => n + r.data.deliveryIntentsCreated, 0)).toBe(
      202,
    );
    const events = await f.service.getExpiryBacklog({ limit: 1000 });
    expect(events).toHaveLength(202);
    expect(new Set(events.map((e) => e.source_fingerprint)).size).toBe(202);
    expect(events.every((e) => e.intent?.delivery_status === "pending")).toBe(
      true,
    );
    expect(results[0]!.data.events).toHaveLength(100);
    const restarted = fixture({ storage: f, drivers: 101, policies: 101 });
    expect(
      (await restarted.controller.reconcileExpiry({ asOf })).data
        .expiredEventsCreated,
    ).toBe(0);
  });

  it("uses the real single Academy public algorithm at the same asOf, retaining date edges and canonical fingerprints", async () => {
    const academyRepository = new AcademyRepository();
    // Only course/attempt storage is controlled; qualification and trainingRecord run unchanged.
    vi.spyOn(academyRepository, "listCurrentCourses").mockResolvedValue([
      {
        courseId: "safety",
        courseCode: "SAFE",
        title: "Safety",
        category: "safety",
        isRequired: true,
        validityDays: 1,
        passingScore: 80,
        version: 1,
        modulesCount: 0,
        description: "Published",
        modules: [],
        questions: [],
        answerKey: {},
      },
    ]);
    vi.spyOn(academyRepository, "listAttempts").mockImplementation(
      async (filter) => [
        {
          attemptId: "passed",
          courseId: "safety",
          courseVersion: 1,
          driverId: filter?.driverId ?? "drv-demo-001",
          attemptedAt: "2030-05-31T00:00:00.000Z",
          score: 100,
          passed: true,
          answersSummary: [],
        },
      ],
    );
    const academy = new AcademyService(academyRepository);
    const evaluate = vi.spyOn(academy, "evaluateDriverQualification");
    const f = fixture({ drivers: 1, policies: 3, academy });
    const state = f.service as unknown as {
      drivers: Array<{ licenseExpiry: string }>;
      policies: Array<{ endAt: string; status: string; startAt: string }>;
    };
    state.drivers[0]!.licenseExpiry = asOf; // Driver equality remains expired.
    state.policies[0]!.endAt = asOf; // Policy equality remains unexpired.
    state.policies[1]!.status = "cancelled";
    state.policies[2]!.startAt = "2099-01-01T00:00:00.000Z";
    await f.controller.reconcileExpiry({ asOf, limit: 2 });
    expect(evaluate).toHaveBeenCalledWith("drv-demo-001", new Date(asOf));
    const actual = await academy.evaluateDriverQualification(
      "drv-demo-001",
      new Date(asOf),
    );
    expect(actual.regulatoryStatus).toBe("expired");
    expect(actual.records[0]).toMatchObject({
      isOverdue: true,
      expiresAt: asOf,
    });
    const events = await f.service.getExpiryBacklog();
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.entity_type === "driver")).toBe(true);
    for (const [credential, field] of [
      ["driver_license", "licenseExpiry"],
      ["academy_qualification", "academyTraining"],
    ]) {
      const event = events.find((e) => e.credential_type === credential)!;
      expect(event.source_expiry_at).toBe(asOf);
      expect(event.source_fingerprint).toBe(
        createHash("sha256")
          .update(
            JSON.stringify([
              "credential-expiry/v1",
              "default",
              "driver",
              "drv-demo-001",
              field,
              Date.parse(asOf),
            ]),
          )
          .digest("hex"),
      );
    }
  });

  it("leaves invalid immutable payload terminal and does not rebuild it from later configuration", async () => {
    const outbox = new MemoryMailOutbox();
    vi.stubEnv("REGULATORY_ALERT_RECIPIENT_EMAIL", "invalid-address");
    const f = fixture({
      notification: new NotificationDeliveryService(outbox),
    });
    await f.controller.reconcileExpiry({ asOf });
    const original = (await f.service.getExpiryReceipts())[0]!;
    expect(original).toMatchObject({
      delivery_status: "failed",
      last_error: "notification_invalid_address",
      outbox_delivery_id: null,
    });
    vi.stubEnv("REGULATORY_ALERT_RECIPIENT_EMAIL", "valid@example.test");
    await fixture({
      storage: f,
      notification: new NotificationDeliveryService(outbox),
    }).controller.reconcileExpiry({ asOf });
    expect(await f.service.getExpiryReceipts()).toEqual([original]);
    expect(Object.values(outbox.state.deliveries)).toHaveLength(0);
  });

  it.each(["driver", "policy"] as const)(
    "reaches every %s source through repeated fixed-asOf finite pages and a fresh service",
    async (entityType) => {
      const f = fixture({
        drivers: entityType === "driver" ? 5 : 0,
        policies: entityType === "policy" ? 5 : 0,
      });
      for (let i = 0; i < 3; i++)
        await f.controller.reconcileExpiry({
          asOf,
          scope: "default",
          limit: 2,
        });
      const restarted = fixture({
        storage: f,
        drivers: entityType === "driver" ? 5 : 0,
        policies: entityType === "policy" ? 5 : 0,
      });
      await restarted.controller.reconcileExpiry({ asOf, limit: 2 });
      const events = (
        await restarted.service.getExpiryBacklog({ limit: 100 })
      ).filter((e) => e.entity_type === entityType);
      expect(new Set(events.map((e) => e.entity_id)).size).toBe(5);
      expect(new Set(events.map((e) => e.source_fingerprint)).size).toBe(
        events.length,
      );
    },
  );

  it("recovers the same frozen intent after actual enqueue storage failure and a Registry restart", async () => {
    class UnavailableOnceOutbox extends MemoryMailOutbox {
      reject = true;
      override async transaction<T>(
        operation: (state: OutboxState) => T,
      ): Promise<T> {
        if (this.reject) {
          this.reject = false;
          throw Object.assign(new Error("controlled storage unavailable"), {
            code: "EIO",
          });
        }
        return super.transaction(operation);
      }
    }
    const outbox = new UnavailableOnceOutbox();
    vi.stubEnv("REGULATORY_ALERT_RECIPIENT_EMAIL", "original@example.test");
    const f = fixture({
      notification: new NotificationDeliveryService(outbox),
    });
    await f.controller.reconcileExpiry({ asOf, limit: 2 });
    const original = (await f.service.getExpiryReceipts())[0]!;
    expect(original.outbox_delivery_id).toBeNull();
    vi.stubEnv("REGULATORY_ALERT_RECIPIENT_EMAIL", "changed@example.test");
    const restarted = fixture({
      storage: f,
      notification: new NotificationDeliveryService(outbox),
    });
    await restarted.controller.reconcileExpiry({ asOf, limit: 2 });
    const receipts = await restarted.service.getExpiryReceipts();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      intent_id: original.intent_id,
      recipient_email: original.recipient_email,
      idempotency_key: original.idempotency_key,
      delivery_status: "enqueued",
      last_error: "controlled storage unavailable",
    });
    expect(receipts[0]!.outbox_delivery_id).toBeTruthy();
    expect(Object.values(outbox.state.deliveries)).toHaveLength(1);
    expect(
      Object.values(outbox.state.deliveries)[0]!.message.recipientEmail,
    ).toBe("original@example.test");
  });

  it("keeps a legitimate no-renewal send completed without a duplicate dispatch from a competing reconciler", async () => {
    const entered = deferred<void>();
    const finish = deferred<ProviderAcknowledgement>();
    const outbox = new MemoryMailOutbox();
    const send = vi.fn(async () => {
      entered.resolve();
      return finish.promise;
    });
    const notification = new NotificationDeliveryService(outbox, {
      provider: "controlled",
      send,
    });
    const f = fixture({ notification });
    const running = f.controller.reconcileExpiry({ asOf });
    await entered.promise;
    const other = fixture({ storage: f, notification });
    await other.controller.reconcileExpiry({ asOf });
    expect(send).toHaveBeenCalledTimes(1);
    finish.resolve({
      provider: "controlled",
      response: "accepted",
      providerMessageId: "normal-reference",
      acceptedAt: asOf,
    });
    await running;
    const event = (await f.service.getExpiryBacklog())[0]!;
    expect(event).toMatchObject({
      status: "completed",
      intent: { delivery_status: "enqueued" },
    });
    const receipt = await notification.get(
      "default",
      event.intent!.outbox_delivery_id!,
    );
    expect(receipt).toMatchObject({
      status: "sent",
      attempts: [
        {
          outcome: "sent",
          acknowledgement: { providerMessageId: "normal-reference" },
        },
      ],
    });
    expect(Object.values(outbox.state.deliveries)).toHaveLength(1);
  });

  it("does not hand an already renewed and superseded pending intent to the outbox", async () => {
    const f = fixture();
    await f.controller.reconcileExpiry({ asOf });
    const original = (await f.service.getExpiryBacklog())[0]!;
    await f.withMasterStorage(() =>
      f.service.updateDriverLicenses("drv-demo-001", {
        licenseExpiry: "2099-01-01T00:00:00.000Z",
      }),
    );
    const outbox = new MemoryMailOutbox();
    const restarted = fixture({
      storage: f,
      drivers: 0,
      notification: new NotificationDeliveryService(outbox),
    });
    await restarted.controller.reconcileExpiry({ asOf });
    expect(
      await restarted.service.getExpiryEvent(original.event_id),
    ).toMatchObject({
      status: "superseded",
      intent: { delivery_status: "superseded", outbox_delivery_id: null },
    });
    expect(Object.values(outbox.state.deliveries)).toHaveLength(0);
  });

  it.each(["accepted", "failed"] as const)(
    "keeps renewal superseded and preserves the real late %s outbox result",
    async (outcome) => {
      const entered = deferred<void>();
      const finish = deferred<ProviderAcknowledgement>();
      const outbox = new MemoryMailOutbox();
      const transport: MailTransport = {
        provider: "controlled",
        send: async () => {
          entered.resolve();
          return finish.promise;
        },
      };
      const notification = new NotificationDeliveryService(outbox, transport);
      const f = fixture({ notification });
      const running = f.controller.reconcileExpiry({ asOf, limit: 2 });
      await entered.promise;
      await f.withMasterStorage(() =>
        f.service.updateDriverLicenses("drv-demo-001", {
          licenseExpiry: "2099-01-01T00:00:00.000Z",
        }),
      );
      const before = (await f.service.getExpiryBacklog())[0]!;
      expect(before.status).toBe("superseded");
      if (outcome === "accepted")
        finish.resolve({
          provider: "controlled",
          response: "accepted",
          providerMessageId: "controlled-reference",
          acceptedAt: asOf,
        });
      else
        finish.reject(new DeliveryTransportError("controlled_failure", true));
      await running;
      const event = await f.service.getExpiryEvent(before.event_id);
      expect(event).toMatchObject({
        status: "superseded",
        intent: { delivery_status: "superseded" },
      });
      expect(event!.intent!.outbox_delivery_id).toBeTruthy();
      const receipt = await notification.get(
        "default",
        event!.intent!.outbox_delivery_id!,
      );
      expect(receipt!.attempts[0]!.outcome).toBe(
        outcome === "accepted" ? "sent" : "failed",
      );
      if (outcome === "accepted")
        expect(receipt!.attempts[0]!.acknowledgement?.providerMessageId).toBe(
          "controlled-reference",
        );
      else
        expect(receipt!.attempts[0]).toMatchObject({
          errorCode: "controlled_failure",
          retryable: true,
          acknowledgement: null,
        });
    },
  );
});

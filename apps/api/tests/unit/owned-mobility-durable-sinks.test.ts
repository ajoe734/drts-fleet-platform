import { describe, expect, it, vi } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";

import {
  OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT,
  OWNED_MOBILITY_TRIP_COMPLETED_EVENT,
} from "../../src/modules/owned-mobility/owned-mobility-events";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { generateDeterministicUuid } from "../../src/common/durable-identity";

describe("Durable Sinks Integration & Contract Gates (STAGE1-UAT-DURABLE-SINKS-20260731)", () => {
  describe("1. Deterministic UUID Generator", () => {
    it("generates stable, deterministic UUIDs for identical namespace and key", () => {
      const id1 = generateDeterministicUuid("test_namespace", "key-123");
      const id2 = generateDeterministicUuid("test_namespace", "key-123");
      const id3 = generateDeterministicUuid("test_namespace", "key-456");

      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe("2. Webhook Sink (Outbox-Stable Key & Durable Acceptance)", () => {
    it("uses outboxKey to produce deterministic deliveryId and deduplicates delivery without duplicate sends", async () => {
      const repo = {
        isEnabled: () => true,
        persistChanges: vi.fn().mockResolvedValue(undefined),
        reportPersistenceFailure: vi.fn(),
      };
      const dispatchService = {
        dispatch: vi.fn().mockResolvedValue({
          httpStatus: 200,
          attempt: 1,
          nextAttemptAt: null,
          status: "delivered",
        }),
        dispatchAttempt: vi.fn().mockResolvedValue({
          httpStatus: 200,
          attempt: 1,
          nextAttemptAt: null,
          status: "delivered",
        }),
      };

      const auditRepo = {
        isEnabled: () => true,
        append: vi.fn().mockResolvedValue(undefined),
      };
      const auditService = new AuditNotificationService(auditRepo as any);

      const tenantPartnerService = new TenantPartnerService(
        auditService as any,
        repo as any,
        dispatchService as any,
      );

      // Register an active webhook endpoint
      (tenantPartnerService as any).webhookEndpoints = [
        {
          webhookId: "wh_001",
          tenantId: "tenant_test_1",
          url: "https://example.com/webhook",
          events: ["order.completed"],
          status: "active",
          secretVersion: 1,
          secretValue: "secret_123",
          secretPreview: "sec_123",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          retryPolicy: { maxAttempts: 3 },
          secretHistory: [],
          runtimeMetadata: {
            deliveryCount: 0,
            secretRotation: {
              currentVersion: 1,
              rotatedAt: new Date().toISOString(),
              rotationCount: 0,
              history: [],
            },
          },
        },
      ];

      const res1 = await tenantPartnerService.publishWebhookEvent(
        "tenant_test_1",
        {
          eventType: "order.completed",
          data: { orderId: "order_100" },
          outboxKey: "task_100",
        },
      );

      expect(dispatchService.dispatchAttempt).toHaveBeenCalledTimes(1);

      const res2 = await tenantPartnerService.publishWebhookEvent(
        "tenant_test_1",
        {
          eventType: "order.completed",
          data: { orderId: "order_100" },
          outboxKey: "task_100",
        },
      );

      // Verify dispatchAttempt was NOT called a second time (idempotent no-op for delivered webhook)
      expect(dispatchService.dispatchAttempt).toHaveBeenCalledTimes(1);
      expect(res1[0].deliveryId).toBe(res2[0].deliveryId);
      expect(res1[0].deliveryId).toContain("wd_");
      expect(res2[0].status).toBe("delivered");
      expect(repo.persistChanges).toHaveBeenCalled();
    });

    it("executeDriverCompletionOutboxEffect passes stable outboxKey to publishWebhookEvent", async () => {
      const tenantPartnerService = {
        publishWebhookEvent: vi.fn().mockResolvedValue([
          {
            webhookId: "wh_001",
            deliveryId: "wd_123",
            attempt: 1,
            httpStatus: 200,
            nextAttemptAt: null,
            status: "delivered",
          },
        ]),
      };

      const ownedMobilityService = new OwnedMobilityService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      (ownedMobilityService as any).tenantPartnerService = tenantPartnerService;

      const outboxRecord = {
        outboxId: "outbox_id_999",
        taskId: "task_999",
        orderId: "order_999",
        effectType: "tenant_order_completed_webhook",
        requestId: "req_999",
        payload: {
          effectType: "tenant_order_completed_webhook",
          tenantId: "tenant_001",
          payload: {
            eventType: "order.completed",
            occurredAt: "2026-07-31T17:00:00Z",
            data: { orderId: "order_999" },
          },
        },
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: "2026-07-31T17:00:00Z",
        leaseToken: null,
        leasedUntil: null,
        lastError: null,
        createdAt: "2026-07-31T17:00:00Z",
        deliveredAt: null,
      };

      await (ownedMobilityService as any).executeDriverCompletionOutboxEffect(
        outboxRecord as any,
      );

      expect(tenantPartnerService.publishWebhookEvent).toHaveBeenCalledWith(
        "tenant_001",
        expect.objectContaining({
          eventType: "order.completed",
          outboxKey: "outbox_id_999",
        }),
      );
    });
  });

  describe("3. Audit & Settlement Persistence (Deterministic Identity & Awaited Sinks)", () => {
    it("persists audit log with deterministic auditId when requested", async () => {
      const auditRepo = {
        isEnabled: () => true,
        append: vi.fn().mockResolvedValue(undefined),
      };
      const auditService = new AuditNotificationService(auditRepo as any);

      const log = await auditService.recordAuditLogAsync({
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "owned-mobility",
        actionName: "complete_trip",
        resourceType: "driver_task",
        resourceId: "task_999",
        requestId: "req_999",
      });

      expect(log.auditId).toBeTruthy();
      expect(auditRepo.append).toHaveBeenCalledWith(log);
    });

    it("awaits settlement ledger persistence in handleOwnedMobilityTripCompleted", async () => {
      const auditRepo = {
        isEnabled: () => true,
        append: vi.fn().mockResolvedValue(undefined),
      };
      const auditService = new AuditNotificationService(auditRepo as any);
      const settlementRepo = {
        persistChanges: vi.fn().mockResolvedValue(undefined),
        reportPersistenceFailure: vi.fn(),
      };

      const settlementService = new BillingSettlementService(
        auditService as any,
        settlementRepo as any,
      );

      const tripEvent = {
        tenantId: "tenant_01",
        driverId: "driver_01",
        orderId: "order_01",
        serviceBucket: "business_dispatch" as const,
        businessDispatchSubtype: "enterprise_dispatch" as const,
        completedAt: new Date().toISOString(),
        grossEarning: { amountMinor: 1000, currency: "TWD" },
        sandboxFulfillmentSegments: [
          { fulfillmentSegmentId: "seg_01", orderId: "order_01" } as any,
        ],
      };

      await settlementService.handleOwnedMobilityTripCompleted(tripEvent as any);

      expect(settlementRepo.persistChanges).toHaveBeenCalledWith(
        expect.objectContaining({
          fulfillmentSegments: expect.arrayContaining([
            expect.objectContaining({ fulfillmentSegmentId: "seg_01" }),
          ]),
        }),
      );
    });

    it("fails outbox effect when settlement event listener is missing", async () => {
      const eventEmitter = new EventEmitter2();
      const ownedMobilityService = new OwnedMobilityService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      (ownedMobilityService as any).eventEmitter = eventEmitter;

      const outboxRecord = {
        outboxId: "outbox_settlement_01",
        taskId: "task_01",
        orderId: "order_01",
        effectType: "owned_mobility_trip_completed",
        requestId: "req_01",
        payload: {
          effectType: "owned_mobility_trip_completed",
          event: {
            tenantId: "tenant_01",
            driverId: "driver_01",
            orderId: "order_01",
            serviceBucket: "business_dispatch",
            businessDispatchSubtype: "enterprise_dispatch",
            completedAt: new Date().toISOString(),
          },
        },
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: new Date().toISOString(),
        leaseToken: null,
        leasedUntil: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        deliveredAt: null,
      };

      await expect(
        (ownedMobilityService as any).executeDriverCompletionOutboxEffect(
          outboxRecord as any,
        ),
      ).rejects.toThrow(
        "Owned mobility trip completion listener is missing or unavailable.",
      );
    });
  });

  describe("4. Driver & Ops Streams (Stable Event IDs & pg_notify Failures)", () => {
    it("generates stable event ID for task stream events", async () => {
      const eventEmitter = new EventEmitter2();
      const taskEventsService = new OwnedMobilityTaskEventsService(eventEmitter);

      const emittedEnvelopes: any[] = [];
      eventEmitter.on("owned-mobility.driver-task", (envelope) => {
        emittedEnvelopes.push(envelope);
      });

      const task = {
        taskId: "task_stable_1",
        driverId: "driver_1",
        orderId: "order_1",
        status: "accepted",
        updatedAt: "2026-07-31T17:00:00.000Z",
        waypoints: [],
      } as any;
      const order = { orderId: "order_1", tenantId: "tenant_1" } as any;

      await taskEventsService.publishTaskUpdated(task, order, "req_stable_1");
      await taskEventsService.publishTaskUpdated(task, order, "req_stable_1");

      expect(emittedEnvelopes.length).toBe(2);
      expect(emittedEnvelopes[0].eventId).toBe(emittedEnvelopes[1].eventId);
    });

    it("throws error when databaseService pg_notify fails", async () => {
      const eventEmitter = new EventEmitter2();
      const dbService = {
        isEnabled: () => true,
        query: vi.fn().mockRejectedValue(new Error("PG NOTIFY Connection Error")),
      };

      const taskEventsService = new OwnedMobilityTaskEventsService(
        eventEmitter,
        dbService as any,
      );

      const task = {
        taskId: "task_err_1",
        driverId: "driver_1",
        orderId: "order_1",
        status: "accepted",
        waypoints: [],
      } as any;
      const order = { orderId: "order_1", tenantId: "tenant_1" } as any;

      await expect(
        taskEventsService.publishTaskUpdated(task, order, "req_err_1"),
      ).rejects.toThrow("PG NOTIFY Connection Error");
    });
  });

  describe("5. Certificate Emission (Zero Listener Enforcement)", () => {
    it("refuses ACK and throws error when certificate event has zero listeners in OwnedMobilityService outbox effect", async () => {
      const eventEmitter = new EventEmitter2();
      const ownedMobilityService = new OwnedMobilityService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      (ownedMobilityService as any).eventEmitter = eventEmitter;

      const outboxRecord = {
        outboxId: "outbox_cert_01",
        taskId: "task_cert_01",
        orderId: "order_cert_01",
        effectType: "multi_taxi_certificate",
        requestId: "req_cert_01",
        payload: {
          effectType: "multi_taxi_certificate",
          event: {
            certificateId: "cert_01",
            orderId: "order_cert_01",
            completedAt: new Date().toISOString(),
          },
        },
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: new Date().toISOString(),
        leaseToken: null,
        leasedUntil: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        deliveredAt: null,
      };

      expect(
        eventEmitter.listenerCount(
          OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT,
        ),
      ).toBe(0);

      await expect(
        (ownedMobilityService as any).executeDriverCompletionOutboxEffect(
          outboxRecord as any,
        ),
      ).rejects.toThrow(
        "Multi-taxi certificate listener is missing or unavailable.",
      );
    });

    it("succeeds when multi-taxi certificate listener is registered", async () => {
      const eventEmitter = new EventEmitter2();
      const listenerMock = vi.fn().mockResolvedValue({ status: "acknowledged" });
      eventEmitter.on(
        OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT,
        listenerMock,
      );

      const ownedMobilityService = new OwnedMobilityService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      (ownedMobilityService as any).eventEmitter = eventEmitter;

      const outboxRecord = {
        outboxId: "outbox_cert_02",
        taskId: "task_cert_02",
        orderId: "order_cert_02",
        effectType: "multi_taxi_certificate",
        requestId: "req_cert_02",
        payload: {
          effectType: "multi_taxi_certificate",
          event: {
            certificateId: "cert_02",
            orderId: "order_cert_02",
            completedAt: new Date().toISOString(),
          },
        },
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: new Date().toISOString(),
        leaseToken: null,
        leasedUntil: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        deliveredAt: null,
      };

      await (ownedMobilityService as any).executeDriverCompletionOutboxEffect(
        outboxRecord as any,
      );

      expect(listenerMock).toHaveBeenCalledWith(
        expect.objectContaining({ certificateId: "cert_02" }),
      );
    });
  });

  describe("6. Repository Failure Propagation", () => {
    it("propagates settlement repository persistence errors", async () => {
      const auditRepo = {
        isEnabled: () => true,
        append: vi.fn().mockResolvedValue(undefined),
      };
      const auditService = new AuditNotificationService(auditRepo as any);
      const settlementRepo = {
        persistChanges: vi
          .fn()
          .mockRejectedValue(new Error("Database connection lost")),
        reportPersistenceFailure: vi.fn(),
      };

      const settlementService = new BillingSettlementService(
        auditService as any,
        settlementRepo as any,
      );

      const tripEvent = {
        tenantId: "tenant_01",
        driverId: "driver_01",
        orderId: "order_01",
        serviceBucket: "business_dispatch" as const,
        businessDispatchSubtype: "enterprise_dispatch" as const,
        completedAt: new Date().toISOString(),
        grossEarning: { amountMinor: 1000, currency: "TWD" },
        sandboxFulfillmentSegments: [
          { fulfillmentSegmentId: "seg_01", orderId: "order_01" } as any,
        ],
      };

      await expect(
        settlementService.handleOwnedMobilityTripCompleted(tripEvent as any),
      ).rejects.toThrow("Database connection lost");
    });

    it("propagates webhook repository persistence errors during publishWebhookEvent", async () => {
      const repo = {
        isEnabled: () => true,
        persistChanges: vi
          .fn()
          .mockRejectedValue(new Error("Webhook DB write error")),
        reportPersistenceFailure: vi.fn(),
      };
      const dispatchService = {
        dispatchAttempt: vi.fn().mockResolvedValue({
          httpStatus: 200,
          attempt: 1,
          nextAttemptAt: null,
          status: "delivered",
        }),
      };

      const auditRepo = {
        isEnabled: () => true,
        append: vi.fn().mockResolvedValue(undefined),
      };
      const auditService = new AuditNotificationService(auditRepo as any);

      const tenantPartnerService = new TenantPartnerService(
        auditService as any,
        repo as any,
        dispatchService as any,
      );

      (tenantPartnerService as any).webhookEndpoints = [
        {
          webhookId: "wh_001",
          tenantId: "tenant_test_1",
          url: "https://example.com/webhook",
          events: ["order.completed"],
          status: "active",
          secretVersion: 1,
          secretValue: "secret_123",
          secretPreview: "sec_123",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          retryPolicy: { maxAttempts: 3 },
          secretHistory: [],
          runtimeMetadata: {
            deliveryCount: 0,
            secretRotation: {
              currentVersion: 1,
              rotatedAt: new Date().toISOString(),
              rotationCount: 0,
              history: [],
            },
          },
        },
      ];

      await expect(
        tenantPartnerService.publishWebhookEvent("tenant_test_1", {
          eventType: "order.completed",
          data: { orderId: "order_100" },
          outboxKey: "task_err_100",
        }),
      ).rejects.toThrow("Webhook DB write error");
    });
  });
});

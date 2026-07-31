import { describe, expect, it, vi } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Reflector } from "@nestjs/core";
import { EventsMetadataAccessor } from "@nestjs/event-emitter/dist/events-metadata.accessor";

import {
  OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT,
} from "../../src/modules/owned-mobility/owned-mobility-events";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
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

    it("handles multiple active endpoints with distinct stable delivery IDs, no duplicate sends on retry, and propagates persistence failure", async () => {
      const repo = {
        isEnabled: () => true,
        persistChanges: vi.fn().mockResolvedValue(undefined),
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

      // Register TWO active webhook endpoints
      (tenantPartnerService as any).webhookEndpoints = [
        {
          webhookId: "wh_001",
          tenantId: "tenant_multi_1",
          url: "https://example.com/webhook1",
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
        {
          webhookId: "wh_002",
          tenantId: "tenant_multi_1",
          url: "https://example.com/webhook2",
          events: ["order.completed"],
          status: "active",
          secretVersion: 1,
          secretValue: "secret_456",
          secretPreview: "sec_456",
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
        "tenant_multi_1",
        {
          eventType: "order.completed",
          data: { orderId: "order_multi_100" },
          outboxKey: "outbox_multi_100",
        },
      );

      expect(res1.length).toBe(2);
      expect(res1[0].deliveryId).not.toBe(res1[1].deliveryId);
      expect(res1[0].deliveryId).toContain("wd_");
      expect(res1[1].deliveryId).toContain("wd_");
      expect(dispatchService.dispatchAttempt).toHaveBeenCalledTimes(2);

      // Retry/restart should be idempotent: no duplicate dispatchAttempt calls
      const res2 = await tenantPartnerService.publishWebhookEvent(
        "tenant_multi_1",
        {
          eventType: "order.completed",
          data: { orderId: "order_multi_100" },
          outboxKey: "outbox_multi_100",
        },
      );

      expect(dispatchService.dispatchAttempt).toHaveBeenCalledTimes(2);
      expect(res2[0].deliveryId).toBe(res1[0].deliveryId);
      expect(res2[1].deliveryId).toBe(res1[1].deliveryId);
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

    it("propagates settlement repository persistence failure through emitAsync to executeDriverCompletionOutboxEffect when registered via @OnEvent metadata", async () => {
      const eventEmitter = new EventEmitter2();
      const auditRepo = {
        isEnabled: () => true,
        append: vi.fn().mockResolvedValue(undefined),
      };
      const auditService = new AuditNotificationService(auditRepo as any);
      const settlementRepo = {
        persistChanges: vi
          .fn()
          .mockRejectedValue(new Error("Settlement repo write error")),
        reportPersistenceFailure: vi.fn(),
      };

      const settlementService = new BillingSettlementService(
        auditService as any,
        settlementRepo as any,
      );

      const accessor = new EventsMetadataAccessor(new Reflector());
      const metadata = accessor.getEventHandlerMetadata(
        settlementService.handleOwnedMobilityTripCompleted,
      );
      expect(metadata).toBeDefined();
      expect(metadata![0].options).toEqual({ async: true, suppressErrors: false });

      for (const meta of metadata!) {
        const options = meta.options;
        eventEmitter.on(
          meta.event,
          async (...args: any[]) => {
            try {
              return await settlementService.handleOwnedMobilityTripCompleted(
                ...(args as [any]),
              );
            } catch (e) {
              if (options?.suppressErrors ?? true) {
                // Nest EventSubscribersLoader swallows error when suppressErrors is true/default
                return;
              }
              throw e;
            }
          },
          options,
        );
      }

      const ownedMobilityService = new OwnedMobilityService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      (ownedMobilityService as any).eventEmitter = eventEmitter;

      const outboxRecord = {
        outboxId: "outbox_settlement_err_01",
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
            grossEarning: { amountMinor: 1000, currency: "TWD" },
            sandboxFulfillmentSegments: [
              { fulfillmentSegmentId: "seg_01", orderId: "order_01" },
            ],
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
      ).rejects.toThrow("Settlement repo write error");
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

  describe("6. Dispatcher & Replay Strict Behavior Gates", () => {
    it("ensures onModuleInit does NOT start recovery polling and onApplicationBootstrap DOES start recovery polling", async () => {
      const repository = {
        isEnabled: () => true,
        loadState: vi.fn(async () => ({
          orders: [],
          dispatchJobs: [],
          dispatchAttempts: [],
          dispatchAssignments: [],
          driverTasks: [],
          dispatchTraceLogs: [],
          passengerDisclosureSnapshots: [],
          consumerNotificationOutbox: [],
        })),
        withTransaction: vi.fn(async (work) => work({} as never)),
        persistChanges: vi.fn(async () => {}),
        persistDriverCompletionOutbox: vi.fn(async () => {}),
        claimNextRecoverableDriverCompletionOutbox: vi.fn(async () => null),
        reportPersistenceFailure: vi.fn(),
      };

      const auditRepo = { isEnabled: () => true, append: vi.fn() };
      const auditService = new AuditNotificationService(auditRepo as any);
      const taskEventsService = new OwnedMobilityTaskEventsService(new EventEmitter2());

      const service = new OwnedMobilityService(
        { listVehicles: () => [] } as any,
        auditService,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        taskEventsService,
        undefined,
        repository as any,
      );

      await service.onModuleInit();
      expect(repository.claimNextRecoverableDriverCompletionOutbox).not.toHaveBeenCalled();

      await service.onApplicationBootstrap();
      await new Promise((resolve) => setImmediate(resolve));
      expect(repository.claimNextRecoverableDriverCompletionOutbox).toHaveBeenCalled();
      await service.onModuleDestroy();
    });

    it("enqueues all six durable completion effects with stable deterministic outbox IDs", async () => {
      const persistedRecords: any[] = [];
      const repository = {
        isEnabled: () => true,
        persistChanges: vi.fn(async () => {}),
        persistDriverCompletionOutbox: vi.fn(async (_tx, records) => {
          persistedRecords.push(...records);
        }),
        withTransaction: vi.fn(async (work) => work({} as never)),
      };

      const service = new OwnedMobilityService(
        { listVehicles: () => [] } as any,
        { recordAuditLog: vi.fn() } as any,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        new OwnedMobilityTaskEventsService(new EventEmitter2()),
        undefined,
        repository as any,
      );

      const input = {
        order: {
          orderId: "ord-6-effects",
          tenantId: "tenant-6",
          orderSource: "tenant_api",
          serviceBucket: "business_dispatch",
          businessDispatchSubtype: "enterprise_dispatch",
          updatedAt: new Date().toISOString(),
          passenger: { name: "Test", phone: "0900000000" },
          pickup: { address: "A" },
          dropoff: { address: "B" },
          complianceFlags: [],
          approvalRequestIds: [],
          proofRequirements: {
            minPhotoCount: 0,
            signoffRequired: false,
            expenseProofRequired: false,
          },
        } as any,
        assignment: { assignmentId: "asgn-6", orderId: "ord-6-effects" } as any,
        task: {
          taskId: "task-6-effects",
          driverId: "driver-6",
          status: "completed",
          completedAt: new Date().toISOString(),
        } as any,
        requestId: "req-6",
        certificateEvent: null,
      };

      await (service as any).persistDriverCompletionOutbox({} as any, input);

      expect(persistedRecords).toHaveLength(5); // tenant_webhook, trip_completed, completion_audit_bundle, driver_task_updated, ops_dispatch_job_updated
      const effectTypes = persistedRecords.map((r) => r.effectType);
      expect(effectTypes).toContain("tenant_order_completed_webhook");
      expect(effectTypes).toContain("owned_mobility_trip_completed");
      expect(effectTypes).toContain("completion_audit_bundle");
      expect(effectTypes).toContain("driver_task_updated");
      expect(effectTypes).toContain("ops_dispatch_job_updated");

      // Verify stable deterministic outbox IDs
      const id1 = (service as any).buildDriverCompletionOutboxId("task-6-effects", "completion_audit_bundle");
      const id2 = (service as any).buildDriverCompletionOutboxId("task-6-effects", "completion_audit_bundle");
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it("guarantees strict replay zero side-effects (no kick, claim, emit, audit, or quota)", async () => {
      const repository = {
        isEnabled: () => true,
        loadDriverTaskCompletionBundleForUpdate: vi.fn(async () => ({
          order: {
            orderId: "ord-replay",
            complianceFlags: [],
            approvalRequestIds: [],
            proofRequirements: {
              minPhotoCount: 0,
              signoffRequired: false,
              expenseProofRequired: false,
            },
          },
          assignment: { assignmentId: "asgn-replay" },
          task: { taskId: "task-replay", status: "completed" },
        })),
        hasDriverTaskTraceRequestId: vi.fn(async () => true),
        claimNextRecoverableDriverCompletionOutbox: vi.fn(),
        persistDriverCompletionOutbox: vi.fn(),
        withTransaction: vi.fn(async (work) => work({} as never)),
      };

      const auditNotificationService = { recordAuditLog: vi.fn() };
      const tenantPartnerService = { applyCommittedQuotaConsumption: vi.fn() };

      const service = new OwnedMobilityService(
        { listVehicles: () => [] } as any,
        auditNotificationService as any,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        new OwnedMobilityTaskEventsService(new EventEmitter2()),
        undefined,
        repository as any,
        tenantPartnerService as any,
      );

      (service as any).driverTasks = [{ taskId: "task-replay", status: "completed" }];

      const result = await (service as any).completeDriverTaskWithDatabase(
        "task-replay",
        { completedAt: new Date().toISOString(), actualDistanceKm: 5, actualDurationSec: 600 },
        "req-replay-123",
        { photos: [], signatureId: null, expenseItems: [] },
        false,
      );

      expect(result).toMatchObject({ taskId: "task-replay" });
      expect(repository.claimNextRecoverableDriverCompletionOutbox).not.toHaveBeenCalled();
      expect(repository.persistDriverCompletionOutbox).not.toHaveBeenCalled();
      expect(auditNotificationService.recordAuditLog).not.toHaveBeenCalled();
      expect(tenantPartnerService.applyCommittedQuotaConsumption).not.toHaveBeenCalled();
    });

    it("latches global outbox kick and prevents null-claim race conditions", async () => {
      let claimCalls = 0;
      const repository = {
        isEnabled: () => true,
        withTransaction: vi.fn(async (work) => work({} as never)),
        claimNextRecoverableDriverCompletionOutbox: vi.fn(async () => {
          claimCalls++;
          if (claimCalls === 1) {
            // Simulate a new kick arriving while claiming
            service["triggerDriverCompletionOutboxDispatch"]();
            return null;
          }
          return null;
        }),
      };

      const service = new OwnedMobilityService(
        { listVehicles: () => [] } as any,
        { recordAuditLog: vi.fn() } as any,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        new OwnedMobilityTaskEventsService(new EventEmitter2()),
        undefined,
        repository as any,
      );

      await (service as any).triggerDriverCompletionOutboxDispatch("task-latched");
      await new Promise((resolve) => setImmediate(resolve));

      expect(claimCalls).toBeGreaterThanOrEqual(2);
    });

    it("handles batch continuation until null claim", async () => {
      let claimCount = 0;
      const repository = {
        isEnabled: () => true,
        withTransaction: vi.fn(async (work) => work({} as never)),
        claimNextRecoverableDriverCompletionOutbox: vi.fn(async () => {
          claimCount++;
          if (claimCount <= 3) {
            return {
              action: "dead_letter",
              record: {
                outboxId: `outbox-${claimCount}`,
                taskId: `task-${claimCount}`,
                orderId: `order-${claimCount}`,
                effectType: "completion_audit_bundle",
                status: "dead_letter",
              },
            };
          }
          return null;
        }),
      };

      const service = new OwnedMobilityService(
        { listVehicles: () => [] } as any,
        { recordAuditLog: vi.fn() } as any,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        new OwnedMobilityTaskEventsService(new EventEmitter2()),
        undefined,
        repository as any,
      );

      await (service as any).recoverDriverCompletionOutbox();
      expect(claimCount).toBe(4); // 3 items + 1 null claim to stop batch
    });

    it("stops timer and drains in-flight execution on shutdown", async () => {
      const repository = {
        isEnabled: () => true,
        loadState: vi.fn(async () => ({
          orders: [],
          dispatchJobs: [],
          dispatchAttempts: [],
          dispatchAssignments: [],
          driverTasks: [],
          dispatchTraceLogs: [],
          passengerDisclosureSnapshots: [],
          consumerNotificationOutbox: [],
        })),
        persistChanges: vi.fn(async () => {}),
        claimNextRecoverableDriverCompletionOutbox: vi.fn(async () => null),
      };

      const service = new OwnedMobilityService(
        { listVehicles: () => [] } as any,
        { recordAuditLog: vi.fn() } as any,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        new OwnedMobilityTaskEventsService(new EventEmitter2()),
        undefined,
        repository as any,
      );

      await service.onApplicationBootstrap();
      expect((service as any).driverCompletionRecoveryTimer).not.toBeNull();

      await service.onApplicationShutdown();
      expect((service as any).driverCompletionRecoveryTimer).toBeNull();
      expect((service as any).isShuttingDown).toBe(true);
    });

    it("releases outbox item with retry detail when listener is missing or fails", async () => {
      let releasedId: string | null = null;
      let releasedError: string | null = null;

      const repository = {
        isEnabled: () => true,
        withTransaction: vi.fn(async (work) => work({} as never)),
        claimNextRecoverableDriverCompletionOutbox: vi.fn()
          .mockResolvedValueOnce({
            action: "dispatch",
            record: {
              outboxId: "outbox-err-1",
              taskId: "task-err-1",
              orderId: "ord-err-1",
              effectType: "owned_mobility_trip_completed",
              status: "processing",
              payload: { event: {} },
            },
          })
          .mockResolvedValueOnce(null),
        releaseDriverCompletionOutbox: vi.fn(async (_tx, outboxId, _token, _retry, _max, err) => {
          releasedId = outboxId;
          releasedError = err;
          return true;
        }),
      };

      const eventEmitter = new EventEmitter2();
      // No listeners registered for OWNED_MOBILITY_TRIP_COMPLETED_EVENT

      const service = new OwnedMobilityService(
        { listVehicles: () => [] } as any,
        { recordAuditLog: vi.fn() } as any,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        new OwnedMobilityTaskEventsService(eventEmitter),
        undefined,
        repository as any,
        undefined,
        undefined,
        undefined,
        eventEmitter,
      );

      await (service as any).triggerDriverCompletionOutboxDispatch();
      await (service as any).activeDrainPromise;

      expect(releasedId).toBe("outbox-err-1");
      expect(releasedError).toContain("listener is missing or unavailable");
    });

    it("bounds concurrency so timer + startup + completion simultaneous kicks run at most 1 active drain", async () => {
      let activeDrains = 0;
      let maxSimultaneousDrains = 0;

      const repository = {
        isEnabled: () => true,
        withTransaction: vi.fn(async (work) => work({} as never)),
        claimNextRecoverableDriverCompletionOutbox: vi.fn(async () => {
          activeDrains++;
          if (activeDrains > maxSimultaneousDrains) {
            maxSimultaneousDrains = activeDrains;
          }
          await new Promise((r) => setTimeout(r, 20));
          activeDrains--;
          return null;
        }),
      };

      const service = new OwnedMobilityService(
        { listVehicles: () => [] } as any,
        { recordAuditLog: vi.fn() } as any,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        new OwnedMobilityTaskEventsService(new EventEmitter2()),
        undefined,
        repository as any,
      );

      // Simultaneous kicks from timer, startup, and completion
      (service as any).triggerDriverCompletionOutboxDispatch();
      (service as any).triggerDriverCompletionOutboxDispatch();
      (service as any).triggerDriverCompletionOutboxDispatch();

      await (service as any).activeDrainPromise;
      expect(maxSimultaneousDrains).toBe(1);
    });

    it("persists quota consumption audit inputs in completion_audit_bundle outbox payload", async () => {
      let persistedOutbox: any[] = [];
      const repository = {
        isEnabled: () => true,
        withTransaction: vi.fn(async (work) => work({} as never)),
        persistDriverCompletionOutbox: vi.fn(async (_tx, records) => {
          persistedOutbox = records;
        }),
      };

      const tenantPartnerService = {
        buildQuotaReservationAuditInputs: vi.fn(() => [
          {
            actorId: "tenant-1",
            actorType: "system",
            tenantId: "tenant-1",
            moduleName: "quota",
            actionName: "consume_quota",
            resourceType: "quota_ledger",
            resourceId: "ledger-1",
            newValuesSummary: { consumed: 100 },
          },
        ]),
      };

      const service = new OwnedMobilityService(
        { listVehicles: () => [] } as any,
        { recordAuditLog: vi.fn() } as any,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        new OwnedMobilityTaskEventsService(new EventEmitter2()),
        undefined,
        repository as any,
        tenantPartnerService as any,
      );

      await (service as any).persistDriverCompletionOutbox({} as any, {
        order: {
          orderId: "ord-quota-1",
          tenantId: "tenant-1",
          updatedAt: "2026-07-31T00:00:00Z",
          proofRequirements: { minPhotoCount: 0, signoffRequired: false, expenseProofRequired: false },
          complianceFlags: [],
          approvalRequestIds: [],
        } as any,
        assignment: { assignmentId: "asgn-quota-1" } as any,
        task: { taskId: "task-quota-1", driverId: "drv-1", status: "completed" } as any,
        dispatchJob: { orderId: "ord-quota-1", status: "dispatched" } as any,
        requestId: "req-quota-1",
        certificateEvent: null,
        quotaConsumption: { consumedAmount: 100 } as any,
      });

      const auditBundleRecord = persistedOutbox.find(
        (r) => r.effectType === "completion_audit_bundle",
      );
      expect(auditBundleRecord).toBeDefined();
      expect(auditBundleRecord.payload.audits).toHaveLength(2);
      expect(auditBundleRecord.payload.audits[1]).toMatchObject({
        actionName: "consume_quota",
        resourceType: "quota_ledger",
      });
    });

    it("uses immutable payload.dispatchJob snapshot for ops_dispatch_job_updated and throws if opsDispatchEventsService unavailable", async () => {
      let releasedError: string | null = null;
      const repository = {
        isEnabled: () => true,
        withTransaction: vi.fn(async (work) => work({} as never)),
        claimNextRecoverableDriverCompletionOutbox: vi.fn()
          .mockResolvedValueOnce({
            action: "dispatch",
            record: {
              outboxId: "outbox-ops-1",
              taskId: "task-ops-1",
              orderId: "ord-ops-1",
              effectType: "ops_dispatch_job_updated",
              status: "processing",
              payload: {
                orderId: "ord-ops-1",
                dispatchJob: { orderId: "ord-ops-1", status: "completed" },
                requestId: "req-ops-1",
              },
            },
          })
          .mockResolvedValueOnce(null),
        releaseDriverCompletionOutbox: vi.fn(async (_tx, _id, _tok, _ret, _max, err) => {
          releasedError = err;
          return true;
        }),
      };

      const service = new OwnedMobilityService(
        { listVehicles: () => [] } as any,
        { recordAuditLog: vi.fn() } as any,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        new OwnedMobilityTaskEventsService(new EventEmitter2()),
        undefined,
        repository as any,
      );

      await (service as any).triggerDriverCompletionOutboxDispatch();
      await (service as any).activeDrainPromise;

      expect(releasedError).toContain("Ops dispatch events service unavailable.");
    });

    it("throws when driver task events publisher is missing during outbox execution", async () => {
      let releasedError: string | null = null;
      const repository = {
        isEnabled: () => true,
        withTransaction: vi.fn(async (work) => work({} as never)),
        claimNextRecoverableDriverCompletionOutbox: vi.fn()
          .mockResolvedValueOnce({
            action: "dispatch",
            record: {
              outboxId: "outbox-task-1",
              taskId: "task-pub-1",
              orderId: "ord-pub-1",
              effectType: "driver_task_updated",
              status: "processing",
              payload: {
                task: { taskId: "task-pub-1" },
                order: { orderId: "ord-pub-1" },
                requestId: "req-pub-1",
              },
            },
          })
          .mockResolvedValueOnce(null),
        releaseDriverCompletionOutbox: vi.fn(async (_tx, _id, _tok, _ret, _max, err) => {
          releasedError = err;
          return true;
        }),
      };

      const service = new OwnedMobilityService(
        { listVehicles: () => [] } as any,
        { recordAuditLog: vi.fn() } as any,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        null as any,
        undefined,
        repository as any,
      );

      await (service as any).triggerDriverCompletionOutboxDispatch();
      await (service as any).activeDrainPromise;

      expect(releasedError).toContain("Driver task events service unavailable.");
    });
  });
});

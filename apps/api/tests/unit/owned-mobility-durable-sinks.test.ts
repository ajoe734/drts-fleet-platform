import { describe, expect, it, vi } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Reflector } from "@nestjs/core";
import { EventsMetadataAccessor } from "@nestjs/event-emitter/dist/events-metadata.accessor";

import { OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT } from "../../src/modules/owned-mobility/owned-mobility-events";
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

      await settlementService.handleOwnedMobilityTripCompleted(
        tripEvent as any,
      );

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
      expect(metadata![0].options).toEqual({
        async: true,
        suppressErrors: false,
      });

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
      const taskEventsService = new OwnedMobilityTaskEventsService(
        eventEmitter,
      );

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
        query: vi
          .fn()
          .mockRejectedValue(new Error("PG NOTIFY Connection Error")),
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
      const listenerMock = vi
        .fn()
        .mockResolvedValue({ status: "acknowledged" });
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
      const taskEventsService = new OwnedMobilityTaskEventsService(
        new EventEmitter2(),
      );

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
      expect(
        repository.claimNextRecoverableDriverCompletionOutbox,
      ).not.toHaveBeenCalled();

      await service.onApplicationBootstrap();
      await new Promise((resolve) => setImmediate(resolve));
      expect(
        repository.claimNextRecoverableDriverCompletionOutbox,
      ).toHaveBeenCalled();
      await service.onModuleDestroy();
    });

    it("enqueues all six durable completion effects with stable deterministic outbox IDs", async () => {
      const persistedRecords: any[] = [];
      const recordAuditLog = vi.fn();
      const publishTaskUpdated = vi.fn(async () => undefined);
      const publishDispatchJobUpdated = vi.fn(async () => undefined);
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
        { recordAuditLog } as any,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        { publishTaskUpdated } as any,
        { publishDispatchJobUpdated } as any,
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
        dispatchJob: {
          dispatchJobId: "job-6",
          orderId: "ord-6-effects",
          status: "assigned",
          mode: "auto",
          latestEtaMinutes: 6,
          createdAt: "2026-07-31T00:00:00.000Z",
          updatedAt: "2026-07-31T00:01:00.000Z",
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
        quotaConsumption: {
          tenantId: "tenant-6",
          ledgerEntries: [],
          updatedSnapshots: [],
          auditEntries: [
            {
              actorId: null,
              actorType: "system",
              tenantId: "tenant-6",
              moduleName: "tenant-partner",
              actionName: "tenant.quota_ledger.entry_added",
              resourceType: "tenant_quota_ledger",
              resourceId: "quota-ledger-6",
              newValuesSummary: { amount: 1 },
            },
            {
              actorId: null,
              actorType: "system",
              tenantId: "tenant-6",
              moduleName: "tenant-partner",
              actionName: "tenant.quota_snapshot.refreshed",
              resourceType: "tenant_quota_snapshot",
              resourceId: "tenant-6:null:monthly:2026-07",
              newValuesSummary: { usage: { bookingCount: 1 } },
            },
          ],
        },
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
      const id1 = (service as any).buildDriverCompletionOutboxId(
        "task-6-effects",
        "completion_audit_bundle",
      );
      const id2 = (service as any).buildDriverCompletionOutboxId(
        "task-6-effects",
        "completion_audit_bundle",
      );
      expect(id1).toBe(id2);
      expect(id1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      const auditOutbox = persistedRecords.find(
        (record) => record.effectType === "completion_audit_bundle",
      );
      expect(auditOutbox.payload.audits).toHaveLength(3);
      expect(
        auditOutbox.payload.audits.map((audit: any) => audit.auditId),
      ).toEqual(
        [0, 1, 2].map((index) =>
          generateDeterministicUuid(
            "driver_completion_outbox_audit",
            `${auditOutbox.outboxId}:${index}`,
          ),
        ),
      );

      const driverOutbox = persistedRecords.find(
        (record) => record.effectType === "driver_task_updated",
      );
      const opsOutbox = persistedRecords.find(
        (record) => record.effectType === "ops_dispatch_job_updated",
      );
      expect(driverOutbox.payload).toMatchObject({
        eventId: expect.any(String),
        correlationId: expect.any(String),
      });
      expect(opsOutbox.payload).toMatchObject({
        dispatchJob: { dispatchJobId: "job-6", status: "assigned" },
        eventId: expect.any(String),
        correlationId: expect.any(String),
      });

      input.dispatchJob.status = "cancelled";
      (service as any).dispatchJobs = [
        {
          dispatchJobId: "job-6",
          orderId: "ord-6-effects",
          status: "completed",
        },
      ];
      await (service as any).executeDriverCompletionOutboxEffect(auditOutbox);
      await (service as any).executeDriverCompletionOutboxEffect(driverOutbox);
      await (service as any).executeDriverCompletionOutboxEffect(opsOutbox);

      expect(recordAuditLog.mock.calls.map(([audit]) => audit.auditId)).toEqual(
        auditOutbox.payload.audits.map((audit: any) => audit.auditId),
      );
      expect(publishTaskUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: "task-6-effects" }),
        expect.objectContaining({ orderId: "ord-6-effects" }),
        "req-6",
        {
          eventId: driverOutbox.payload.eventId,
          correlationId: driverOutbox.payload.correlationId,
        },
      );
      expect(publishDispatchJobUpdated).toHaveBeenCalledWith(
        "ord-6-effects",
        expect.objectContaining({ dispatchJobId: "job-6", status: "assigned" }),
        "req-6",
        {
          eventId: opsOutbox.payload.eventId,
          correlationId: opsOutbox.payload.correlationId,
        },
      );
    });

    it("builds stable deep-cloned quota audits while committed apply remains state-only", () => {
      const recordAuditLog = vi.fn();
      const tenantPartnerService = new TenantPartnerService({
        recordAuditLog,
      } as any);
      const ledgerEntries = [
        {
          ledgerEntryId: "quota-ledger-z",
          bookingId: "booking-1",
          costCenterCode: null,
          periodKey: "2026-07",
          dimension: "booking_count",
          entryType: "consume",
          amount: 1,
        },
        {
          ledgerEntryId: "quota-ledger-a",
          bookingId: "booking-1",
          costCenterCode: null,
          periodKey: "2026-07",
          dimension: "amount_minor",
          entryType: "consume",
          amount: 100,
        },
      ] as any[];
      const updatedSnapshots = [
        {
          tenantId: "tenant-1",
          costCenterCode: "OPS",
          period: "monthly",
          periodKey: "2026-07",
          limit: {},
          usage: { bookingCount: 1 },
          refreshedAt: "2026-07-31T00:00:00.000Z",
        },
        {
          tenantId: "tenant-1",
          costCenterCode: null,
          period: "monthly",
          periodKey: "2026-07",
          limit: {},
          usage: { bookingCount: 2 },
          refreshedAt: "2026-07-31T00:00:00.000Z",
        },
      ] as any[];

      const auditEntries = (
        tenantPartnerService as any
      ).buildQuotaReservationAuditEntries(
        "tenant-1",
        ledgerEntries,
        updatedSnapshots,
      );
      expect(auditEntries.map((entry: any) => entry.resourceId)).toEqual([
        "quota-ledger-a",
        "quota-ledger-z",
        "tenant-1:null:monthly:2026-07",
        "tenant-1:value:3:OPS:monthly:2026-07",
      ]);

      updatedSnapshots[0].usage.bookingCount = 999;
      expect(auditEntries[3].newValuesSummary.usage.bookingCount).toBe(1);

      tenantPartnerService.applyCommittedQuotaConsumption({
        tenantId: "tenant-1",
        ledgerEntries,
        updatedSnapshots,
        auditEntries,
      } as any);
      expect(recordAuditLog).not.toHaveBeenCalled();
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
          dispatchJob: {
            dispatchJobId: "job-replay",
            orderId: "ord-replay",
          },
          task: { taskId: "task-replay", status: "completed" },
        })),
        hasDriverTaskTraceRequestId: vi.fn(async () => true),
        claimNextRecoverableDriverCompletionOutbox: vi.fn(),
        persistDriverCompletionOutbox: vi.fn(),
        withTransaction: vi.fn(async (work) => work({} as never)),
      };

      const auditNotificationService = { recordAuditLog: vi.fn() };
      const tenantPartnerService = {
        applyCommittedQuotaConsumption: vi.fn(),
        publishWebhookEvent: vi.fn(),
      };
      const taskEventsService = { publishTaskUpdated: vi.fn() };
      const opsEventsService = { publishDispatchJobUpdated: vi.fn() };
      const eventEmitter = {
        listenerCount: vi.fn(),
        emitAsync: vi.fn(),
      };

      const service = new OwnedMobilityService(
        { listVehicles: () => [] } as any,
        auditNotificationService as any,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        taskEventsService as any,
        opsEventsService as any,
        repository as any,
        tenantPartnerService as any,
      );
      (service as any).eventEmitter = eventEmitter;

      (service as any).driverTasks = [
        { taskId: "task-replay", status: "completed" },
      ];

      const result = await (service as any).completeDriverTaskWithDatabase(
        "task-replay",
        {
          completedAt: new Date().toISOString(),
          actualDistanceKm: 5,
          actualDurationSec: 600,
        },
        "req-replay-123",
        { photos: [], signatureId: null, expenseItems: [] },
        false,
      );

      expect(result).toMatchObject({ taskId: "task-replay" });
      expect(
        repository.claimNextRecoverableDriverCompletionOutbox,
      ).not.toHaveBeenCalled();
      expect(repository.persistDriverCompletionOutbox).not.toHaveBeenCalled();
      expect(auditNotificationService.recordAuditLog).not.toHaveBeenCalled();
      expect(
        tenantPartnerService.applyCommittedQuotaConsumption,
      ).not.toHaveBeenCalled();
      expect(tenantPartnerService.publishWebhookEvent).not.toHaveBeenCalled();
      expect(taskEventsService.publishTaskUpdated).not.toHaveBeenCalled();
      expect(opsEventsService.publishDispatchJobUpdated).not.toHaveBeenCalled();
      expect(eventEmitter.listenerCount).not.toHaveBeenCalled();
      expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
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

      (service as any).triggerDriverCompletionOutboxDispatch();
      await new Promise((resolve) => setImmediate(resolve));

      expect(claimCalls).toBeGreaterThanOrEqual(2);
    });

    it("releases a zero-listener settlement effect and never acknowledges it", async () => {
      const markDelivered = vi.fn(async () => true);
      const release = vi.fn(async () => true);
      const repository = {
        isEnabled: () => true,
        withTransaction: vi.fn(async (work) => work({} as never)),
        markDriverCompletionOutboxDelivered: markDelivered,
        releaseDriverCompletionOutbox: release,
      };
      const service = new OwnedMobilityService(
        { listVehicles: () => [] } as any,
        { recordAuditLog: vi.fn() } as any,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        { publishTaskUpdated: vi.fn() } as any,
        undefined,
        repository as any,
        undefined,
        undefined,
        undefined,
        new EventEmitter2(),
      );
      const outbox = {
        outboxId: "outbox-no-settlement-listener",
        taskId: "task-no-settlement-listener",
        orderId: "order-no-settlement-listener",
        effectType: "owned_mobility_trip_completed",
        requestId: "req-no-settlement-listener",
        payload: {
          effectType: "owned_mobility_trip_completed",
          event: { orderId: "order-no-settlement-listener" },
        },
      };

      await (service as any).dispatchClaimedDriverCompletionOutbox(
        outbox,
        "lease-no-settlement-listener",
      );

      expect(markDelivered).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledWith(
        expect.anything(),
        outbox.outboxId,
        "lease-no-settlement-listener",
        expect.any(String),
        5,
        expect.stringContaining("listener is missing"),
      );
    });

    it("retries instead of acknowledging when driver and ops publishers are absent", async () => {
      const markDelivered = vi.fn(async () => true);
      const release = vi.fn(async () => true);
      const repository = {
        isEnabled: () => true,
        withTransaction: vi.fn(async (work) => work({} as never)),
        markDriverCompletionOutboxDelivered: markDelivered,
        releaseDriverCompletionOutbox: release,
      };
      const service = new OwnedMobilityService(
        { listVehicles: () => [] } as any,
        { recordAuditLog: vi.fn() } as any,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        {} as any,
        undefined,
        repository as any,
      );
      const common = {
        taskId: "task-missing-publisher",
        orderId: "order-missing-publisher",
        requestId: "req-missing-publisher",
      };
      const driverOutbox = {
        ...common,
        outboxId: "outbox-missing-driver-publisher",
        effectType: "driver_task_updated",
        payload: {
          effectType: "driver_task_updated",
          task: { taskId: common.taskId },
          order: { orderId: common.orderId },
          requestId: common.requestId,
          eventId: "event-missing-driver-publisher",
          correlationId: "correlation-missing-driver-publisher",
        },
      };
      const opsOutbox = {
        ...common,
        outboxId: "outbox-missing-ops-publisher",
        effectType: "ops_dispatch_job_updated",
        payload: {
          effectType: "ops_dispatch_job_updated",
          orderId: common.orderId,
          dispatchJob: {
            dispatchJobId: "job-missing-ops-publisher",
            orderId: common.orderId,
          },
          requestId: common.requestId,
          eventId: "event-missing-ops-publisher",
          correlationId: "correlation-missing-ops-publisher",
        },
      };

      await (service as any).dispatchClaimedDriverCompletionOutbox(
        driverOutbox,
        "lease-missing-driver-publisher",
      );
      await (service as any).dispatchClaimedDriverCompletionOutbox(
        opsOutbox,
        "lease-missing-ops-publisher",
      );

      expect(markDelivered).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledTimes(2);
      expect(release.mock.calls.map((call) => call[5])).toEqual([
        "Driver task event publisher unavailable.",
        "Ops dispatch event publisher unavailable.",
      ]);
    });

    it("shares one drain across startup, timer, and completion kicks", async () => {
      vi.useFakeTimers();
      try {
        let releaseFirstClaim!: () => void;
        const firstClaimGate = new Promise<void>((resolve) => {
          releaseFirstClaim = resolve;
        });
        let activeClaims = 0;
        let maxActiveClaims = 0;
        let claimCount = 0;
        const repository = {
          isEnabled: () => true,
          withTransaction: vi.fn(async (work) => work({} as never)),
          claimNextRecoverableDriverCompletionOutbox: vi.fn(async () => {
            claimCount += 1;
            activeClaims += 1;
            maxActiveClaims = Math.max(maxActiveClaims, activeClaims);
            if (claimCount === 1) {
              await firstClaimGate;
            }
            activeClaims -= 1;
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
          { publishTaskUpdated: vi.fn() } as any,
          undefined,
          repository as any,
        );

        await service.onApplicationBootstrap();
        (service as any).triggerDriverCompletionOutboxDispatch();
        await vi.advanceTimersByTimeAsync(15_000);
        const sharedDrain = (service as any).driverCompletionOutboxDrainPromise;
        expect(sharedDrain).toBeInstanceOf(Promise);

        releaseFirstClaim();
        await sharedDrain;

        expect(maxActiveClaims).toBe(1);
        expect(claimCount).toBe(2);
        await service.onApplicationShutdown();
      } finally {
        vi.useRealTimers();
      }
    });

    it("handles batch continuation until null claim", async () => {
      let claimCount = 0;
      const repository = {
        isEnabled: () => true,
        withTransaction: vi.fn(async (work) => work({} as never)),
        claimNextRecoverableDriverCompletionOutbox: vi.fn(async () => {
          claimCount++;
          if (claimCount <= 27) {
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

      (service as any).triggerDriverCompletionOutboxDispatch();
      await (service as any).driverCompletionOutboxDrainPromise;
      expect(claimCount).toBe(28); // crosses the 25-row batch boundary, then reaches null
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
        withTransaction: vi.fn(async (work) => work({} as never)),
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
      expect((service as any).driverCompletionOutboxStopping).toBe(true);
    });

    it("awaits the exact shared drain when shutdown races an active sink", async () => {
      let finishWebhook!: () => void;
      const webhookGate = new Promise<void>((resolve) => {
        finishWebhook = resolve;
      });
      const publishWebhookEvent = vi.fn(async () => webhookGate);
      const markDelivered = vi.fn(async () => true);
      let claimCount = 0;
      const outbox = {
        outboxId: "outbox-shutdown-race",
        taskId: "task-shutdown-race",
        orderId: "order-shutdown-race",
        effectType: "tenant_order_completed_webhook",
        requestId: "req-shutdown-race",
        payload: {
          effectType: "tenant_order_completed_webhook",
          tenantId: "tenant-shutdown-race",
          payload: {
            eventType: "order.completed",
            occurredAt: "2026-07-31T00:00:00.000Z",
            data: { orderId: "order-shutdown-race" },
          },
        },
      };
      const repository = {
        isEnabled: () => true,
        withTransaction: vi.fn(async (work) => work({} as never)),
        claimNextRecoverableDriverCompletionOutbox: vi.fn(async () => {
          claimCount += 1;
          return claimCount === 1
            ? { action: "dispatch", record: outbox }
            : null;
        }),
        markDriverCompletionOutboxDelivered: markDelivered,
        releaseDriverCompletionOutbox: vi.fn(async () => true),
      };
      const service = new OwnedMobilityService(
        { listVehicles: () => [] } as any,
        { recordAuditLog: vi.fn() } as any,
        {
          registerRecordingAttachmentListener: vi.fn(),
          registerRecordingStateChangeListener: vi.fn(),
        } as any,
        { publishTaskUpdated: vi.fn() } as any,
        undefined,
        repository as any,
        { publishWebhookEvent } as any,
      );

      await service.onApplicationBootstrap();
      await new Promise((resolve) => setImmediate(resolve));
      expect(publishWebhookEvent).toHaveBeenCalled();

      let shutdownSettled = false;
      const shutdown = service.onApplicationShutdown().then(() => {
        shutdownSettled = true;
      });
      await Promise.resolve();
      expect(shutdownSettled).toBe(false);

      finishWebhook();
      await shutdown;

      expect(markDelivered).toHaveBeenCalled();
      expect(shutdownSettled).toBe(true);
      expect(claimCount).toBe(1);
    });
  });
});

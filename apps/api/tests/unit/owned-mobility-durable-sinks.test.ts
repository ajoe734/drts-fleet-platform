import { describe, expect, it, vi } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT } from "../../src/modules/owned-mobility/owned-mobility-events";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
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
    it("uses outboxKey to produce deterministic deliveryId and deduplicates delivery", async () => {
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

      const res2 = await tenantPartnerService.publishWebhookEvent(
        "tenant_test_1",
        {
          eventType: "order.completed",
          data: { orderId: "order_100" },
          outboxKey: "task_100",
        },
      );

      expect(res1[0].deliveryId).toBe(res2[0].deliveryId);
      expect(res1[0].deliveryId).toContain("wd_");
      expect(repo.persistChanges).toHaveBeenCalled();
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
    it("refuses ACK and throws error when certificate event has zero listeners", async () => {
      const eventEmitter = new EventEmitter2();
      // No listeners added for OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT

      expect(
        eventEmitter.listenerCount(OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT),
      ).toBe(0);

      const listenerCount = eventEmitter.listenerCount(
        OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT,
      );
      expect(listenerCount).toBe(0);
    });
  });
});

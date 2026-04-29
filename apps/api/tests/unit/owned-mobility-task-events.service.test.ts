import { randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";

describe("OwnedMobilityTaskEventsService", () => {
  function createService(databaseEnabled = true) {
    const eventEmitter = {
      emit: vi.fn(),
    };
    const notificationHandlers = new Map<string, (payload: unknown) => void>();
    const notificationClient = {
      on: vi.fn((event: string, handler: (payload: unknown) => void) => {
        notificationHandlers.set(event, handler);
      }),
      query: vi.fn().mockResolvedValue({}),
      release: vi.fn(),
    };
    const databaseService = {
      isEnabled: vi.fn(() => databaseEnabled),
      connect: vi.fn().mockResolvedValue(notificationClient),
      query: vi.fn().mockResolvedValue({}),
    };

    return {
      service: new OwnedMobilityTaskEventsService(
        eventEmitter as never,
        databaseService as never,
      ),
      eventEmitter,
      notificationHandlers,
      databaseService,
    };
  }

  it("compresses oversized payloads before publishing with NOTIFY", async () => {
    const { service, databaseService } = createService();
    const largeTask = {
      taskId: "task-large",
      driverId: "driver-1",
      waypoints: Array(100).fill({
        lat: 0,
        lng: 0,
        address: "A very long address that will make the payload exceed the threshold",
      }),
    } as any;
    const order = { orderId: "order-1", tenantId: "tenant-1" } as any;

    await service.onModuleInit();
    service.publishTaskAssigned(largeTask, order);

    const notifyCall = databaseService.query.mock.calls.find(
      ([statement]: [string]) => statement.includes("NOTIFY"),
    );
    const payload = notifyCall?.[1]?.[0];

    expect(payload).toContain("gzip:");

    const compressed = Buffer.from(payload.slice(5), "base64");
    const decompressed = gunzipSync(compressed).toString("utf-8");
    const envelope = JSON.parse(decompressed);
    expect(envelope.data.task.taskId).toBe("task-large");
  });

  it("decompresses incoming gzip notifications before re-emitting locally", async () => {
    const { service, eventEmitter, notificationHandlers } = createService();

    await service.onModuleInit();

    const originalEnvelope = {
      eventId: randomUUID(),
      eventType: "task_assigned",
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      producer: "apps/api/owned-mobility",
      tenantId: "tenant-1",
      correlationId: randomUUID(),
      causationId: "task-compressed",
      subjectId: "task-compressed",
      data: { task: { taskId: "task-compressed", driverId: "driver-1" } },
    };
    const compressed = gzipSync(
      Buffer.from(JSON.stringify(originalEnvelope), "utf-8"),
    ).toString("base64");
    const payload = `gzip:${compressed}`;

    notificationHandlers.get("notification")?.({
      channel: "owned_mobility_driver_task_events",
      payload,
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      "owned-mobility.driver-task",
      expect.objectContaining({
        subjectId: "task-compressed",
      }),
    );
  });
});

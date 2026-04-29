import { randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";

describe("OpsDispatchEventsService", () => {
  function createOrder() {
    return {
      orderId: "order-123",
      tenantId: "tenant-1",
      pickup: { lat: 25.04, lng: 121.56, address: "Pickup" },
      dropoff: { lat: 25.05, lng: 121.57, address: "Dropoff" },
      passenger: { name: "Passenger", phone: "0912345678" },
      etaSnapshot: null,
      bookedBy: null,
      onsiteContact: null,
      quotedFare: null,
      proofRequirements: {
        requirePickupPhoto: false,
        requireDropoffPhoto: false,
        requireSignature: false,
      },
      complianceFlags: [],
    } as any;
  }

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
      service: new OpsDispatchEventsService(
        eventEmitter as never,
        databaseService as never,
      ),
      eventEmitter,
      notificationClient,
      notificationHandlers,
      databaseService,
    };
  }

  it("connects to the Postgres bridge on init", async () => {
    const { service, databaseService, notificationClient } = createService();

    await service.onModuleInit();

    expect(databaseService.connect).toHaveBeenCalled();
    expect(notificationClient.query).toHaveBeenCalledWith(
      expect.stringContaining("LISTEN"),
    );
  });

  it("publishes events via Postgres NOTIFY when the database bridge is enabled", () => {
    const { service, databaseService } = createService();
    const order = createOrder();

    service.publishOrderCreated(order);

    expect(databaseService.query).toHaveBeenCalledWith(
      expect.stringContaining("pg_notify"),
      expect.arrayContaining([expect.stringContaining("order-123")]),
    );
  });

  it("compresses oversized payloads before publishing with NOTIFY", () => {
    const { service, databaseService } = createService();
    const order = {
      ...createOrder(),
      complianceFlags: Array(300).fill(
        "A large compliance marker that forces NOTIFY payload compression",
      ),
    };

    service.publishOrderCreated(order);

    const notifyCall = databaseService.query.mock.calls.find(
      ([statement]: [string]) => statement.includes("pg_notify"),
    );
    const payload = notifyCall?.[1]?.[0];

    expect(payload).toContain("gzip:");

    const compressed = Buffer.from(payload.slice(5), "base64");
    const decompressed = gunzipSync(compressed).toString("utf-8");
    const envelope = JSON.parse(decompressed);
    expect(envelope.data.order.orderId).toBe("order-123");
  });

  it("falls back to the local event emitter when the database bridge is disabled", () => {
    const { service, eventEmitter, databaseService } = createService(false);
    const order = createOrder();

    service.publishOrderCreated(order);

    expect(databaseService.query).not.toHaveBeenCalled();
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      "ops.dispatch",
      expect.objectContaining({
        subjectId: "order-123",
      }),
    );
  });

  it("re-emits external notifications locally", async () => {
    const { service, eventEmitter, notificationHandlers } = createService();

    await service.onModuleInit();

    const notificationHandler = notificationHandlers.get("notification");
    expect(notificationHandler).toBeTypeOf("function");

    notificationHandler?.({
      channel: "ops_dispatch_events",
      payload: JSON.stringify({
        eventId: randomUUID(),
        eventType: "order_created",
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        producer: "apps/api/ops-dispatch",
        tenantId: "tenant-1",
        correlationId: randomUUID(),
        causationId: "order-ext",
        subjectId: "order-ext",
        data: {
          order: {
            orderId: "order-ext",
          },
        },
      }),
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      "ops.dispatch",
      expect.objectContaining({
        subjectId: "order-ext",
      }),
    );
  });

  it("decompresses incoming gzip notifications before re-emitting locally", async () => {
    const { service, eventEmitter, notificationHandlers } = createService();

    await service.onModuleInit();

    const envelope = {
      eventId: randomUUID(),
      eventType: "order_created",
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      producer: "apps/api/ops-dispatch",
      tenantId: "tenant-1",
      correlationId: randomUUID(),
      causationId: "order-compressed",
      subjectId: "order-compressed",
      data: {
        order: {
          orderId: "order-compressed",
        },
      },
    };
    const payload = `gzip:${gzipSync(
      Buffer.from(JSON.stringify(envelope), "utf-8"),
    ).toString("base64")}`;

    notificationHandlers.get("notification")?.({
      channel: "ops_dispatch_events",
      payload,
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      "ops.dispatch",
      expect.objectContaining({
        subjectId: "order-compressed",
      }),
    );
  });
});

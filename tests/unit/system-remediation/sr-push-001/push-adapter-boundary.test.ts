import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConsumerNotificationOutboxRecord } from "@drts/contracts";

import {
  MultiTaxiService,
  PassengerPushClaimConflictError,
  PassengerPushPersistenceUnknownError,
} from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import {
  PassengerPushAdapter,
  type PassengerDeviceRecord,
  type PassengerDeviceResolver,
  type PassengerPushTransport,
} from "../../../../apps/api/src/modules/multi-taxi/passenger-push.adapter";
import {
  PASSENGER_PUSH_PORT,
  PassengerPushProviderError,
  type PassengerPushPort,
  UnavailablePassengerPushPort,
} from "../../../../apps/api/src/modules/multi-taxi/passenger-push.port";
import { MultiTaxiModule } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.module";

const FIXED_NOW = new Date("2026-09-15T00:00:00.000Z");

function outboxRecord(
  overrides?: Partial<ConsumerNotificationOutboxRecord>,
): ConsumerNotificationOutboxRecord {
  return {
    outboxId: "sr-push-001-outbox-001",
    orderId: "sr-push-001-order-001",
    passengerSubjectRef: "sr-push-001-passenger-001",
    eventType: "assignment_disclosure_ready",
    assignmentVersion: 1,
    payload: {
      snapshotId: "sr-push-001-snapshot-001",
      tenantId: "tenant-alpha",
    },
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: FIXED_NOW.toISOString(),
    createdAt: FIXED_NOW.toISOString(),
    deliveredAt: null,
    ...overrides,
  };
}

function buildService(options: {
  repository?: Record<string, unknown>;
  passengerPushPort?: PassengerPushPort;
}) {
  return new MultiTaxiService(
    {} as never,
    options.repository as never,
    undefined as never,
    undefined as never,
    undefined as never,
    options.passengerPushPort ?? new UnavailablePassengerPushPort(),
  );
}

describe("SR-PUSH-001: PassengerPushAdapter readiness and availability degradation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    delete process.env.PASSENGER_PUSH_API_KEY;
    delete process.env.PASSENGER_PUSH_AUTH_TOKEN;
    delete process.env.PASSENGER_PUSH_ENDPOINT;
    delete process.env.PASSENGER_PUSH_PROVIDER_URL;
    delete process.env.PASSENGER_PUSH_PROVIDER_NAME;
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("degrades to unavailable when no credentials or transport are provisioned", () => {
    const adapter = new PassengerPushAdapter();
    expect(adapter.isAvailable()).toBe(false);
    expect(adapter.providerName()).toBeNull();
  });

  it("fails safe by throwing if send is invoked while unconfigured", async () => {
    const adapter = new PassengerPushAdapter();
    await expect(
      adapter.send(
        {
          outboxId: "outbox-1",
          orderId: "order-1",
          passengerSubjectRef: "psg-1",
          eventType: "assignment_disclosure_ready",
          assignmentVersion: 1,
          payload: {},
        },
        {},
      ),
    ).rejects.toThrow("Passenger push provider is not provisioned");
  });

  it("becomes available when credentials are supplied via environment variables", () => {
    process.env.PASSENGER_PUSH_API_KEY = "test-api-key";
    process.env.PASSENGER_PUSH_PROVIDER_NAME = "fcm-gateway";
    const adapter = new PassengerPushAdapter();
    expect(adapter.isAvailable()).toBe(true);
    expect(adapter.providerName()).toBe("fcm-gateway");
  });

  it("becomes available when an injectable transport is supplied", () => {
    const transport: PassengerPushTransport = {
      send: vi.fn(async () => ({
        providerName: "mock-transport",
        providerMessageRef: "msg-123",
      })),
    };
    const adapter = new PassengerPushAdapter(null, transport);
    expect(adapter.isAvailable()).toBe(true);
    expect(adapter.providerName()).toBe("passenger-push-adapter");
  });
});

describe("SR-PUSH-001: Controlled receiver verification and durability delivery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("controlled receiver proves real send and preserves provider receipt in durable outcome", async () => {
    const controlledReceiverCalls: unknown[] = [];
    const transport: PassengerPushTransport = {
      send: vi.fn(async (req) => {
        controlledReceiverCalls.push(req);
        return {
          providerName: "controlled-receiver",
          providerMessageRef: "receipt-ctrl-001",
        };
      }),
    };

    const adapter = new PassengerPushAdapter(
      { providerName: "controlled-receiver" },
      transport,
    );

    const recordPushDeliveryOutcome = vi.fn(async () => ({
      recorded: true,
      replayed: false,
    }));

    const service = buildService({
      passengerPushPort: adapter,
      repository: {
        claimPushDeliveryRow: vi.fn(async () => ({
          claimed: true,
          fenceToken: 1,
        })),
        releasePushDeliveryClaim: vi.fn(async () => undefined),
        recordPushDeliveryOutcome,
        reportPersistenceFailure: vi.fn(),
      },
    });

    const outcome = await service.deliverPassengerNotification(
      outboxRecord(),
      "req-ctrl-100",
    );

    expect(outcome.status).toBe("delivered");
    expect(outcome.result).toBe("delivered");
    expect(outcome.providerName).toBe("controlled-receiver");
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(controlledReceiverCalls[0]).toMatchObject({
      providerName: "controlled-receiver",
      message: {
        outboxId: "sr-push-001-outbox-001",
        orderId: "sr-push-001-order-001",
        passengerSubjectRef: "sr-push-001-passenger-001",
      },
      context: { requestId: "req-ctrl-100" },
    });
    expect(recordPushDeliveryOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxId: "sr-push-001-outbox-001",
        fenceToken: 1,
        providerName: "controlled-receiver",
        providerAckState: "provider_acknowledged",
        providerMessageRef: "receipt-ctrl-001",
      }),
    );
  });

  it("keeps an unconfigured provider undelivered and schedules a retry with exponential delay", async () => {
    const updateConsumerNotificationOutboxDelivery = vi.fn(
      async () => undefined,
    );
    const service = buildService({
      passengerPushPort: new PassengerPushAdapter(),
      repository: {
        claimPushDeliveryRow: vi.fn(),
        updateConsumerNotificationOutboxDelivery,
        reportPersistenceFailure: vi.fn(),
      },
    });

    const outcome = await service.deliverPassengerNotification(outboxRecord());

    expect(outcome).toMatchObject({
      status: "failed",
      result: "provider_not_configured",
      attemptCount: 1,
      nextAttemptAt: "2026-09-15T00:01:00.000Z",
      deliveredAt: null,
      providerName: null,
    });
    expect(updateConsumerNotificationOutboxDelivery).toHaveBeenCalledWith(
      outcome,
    );
  });

  it("handles provider failure (e.g. 503), records failed state, releases claim, and caps retry delay at 32 minutes", async () => {
    const transport: PassengerPushTransport = {
      send: vi.fn(async () => {
        throw new PassengerPushProviderError("Provider unavailable 503", 503);
      }),
    };
    const adapter = new PassengerPushAdapter(null, transport);
    const releasePushDeliveryClaim = vi.fn(async () => undefined);
    const updateConsumerNotificationOutboxDelivery = vi.fn(
      async () => undefined,
    );

    const service = buildService({
      passengerPushPort: adapter,
      repository: {
        claimPushDeliveryRow: vi.fn(async () => ({
          claimed: true,
          fenceToken: 3,
        })),
        releasePushDeliveryClaim,
        updateConsumerNotificationOutboxDelivery,
        reportPersistenceFailure: vi.fn(),
      },
    });

    const outcome = await service.deliverPassengerNotification(
      outboxRecord({ attemptCount: 8 }),
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.result).toBe("provider_error");
    expect(outcome.attemptCount).toBe(9);
    // Exponential backoff base 60s * 2^(6-1) = 32 minutes
    expect(outcome.nextAttemptAt).toBe("2026-09-15T00:32:00.000Z");
    expect(releasePushDeliveryClaim).toHaveBeenCalledWith(
      "sr-push-001-outbox-001",
      3,
    );
    expect(updateConsumerNotificationOutboxDelivery).toHaveBeenCalledWith(
      outcome,
    );
  });

  it("must not send an already delivered outbox row again (duplicate protection)", async () => {
    const transport: PassengerPushTransport = {
      send: vi.fn(async () => ({
        providerName: "test-provider",
        providerMessageRef: "msg-duplicate-test",
      })),
    };
    const adapter = new PassengerPushAdapter(null, transport);
    const claimPushDeliveryRow = vi.fn();

    const service = buildService({
      passengerPushPort: adapter,
      repository: {
        claimPushDeliveryRow,
        reportPersistenceFailure: vi.fn(),
      },
    });

    const alreadyDelivered = outboxRecord({
      status: "delivered",
      deliveredAt: "2026-09-14T23:55:00.000Z",
      attemptCount: 1,
    });

    const outcome =
      await service.deliverPassengerNotification(alreadyDelivered);

    expect(outcome.status).toBe("delivered");
    expect(outcome.deliveredAt).toBe("2026-09-14T23:55:00.000Z");
    expect(transport.send).not.toHaveBeenCalled();
    expect(claimPushDeliveryRow).not.toHaveBeenCalled();
  });

  it("throws PassengerPushClaimConflictError on concurrent worker contention and does not send", async () => {
    const transport: PassengerPushTransport = {
      send: vi.fn(async () => ({
        providerName: "test-provider",
        providerMessageRef: "msg-test",
      })),
    };
    const adapter = new PassengerPushAdapter(null, transport);

    const service = buildService({
      passengerPushPort: adapter,
      repository: {
        claimPushDeliveryRow: vi.fn(async () => ({ claimed: false })),
        releasePushDeliveryClaim: vi.fn(),
        reportPersistenceFailure: vi.fn(),
      },
    });

    await expect(
      service.deliverPassengerNotification(outboxRecord()),
    ).rejects.toThrow(PassengerPushClaimConflictError);

    expect(transport.send).not.toHaveBeenCalled();
  });

  it("throws PassengerPushPersistenceUnknownError if database outcome record fails after ack", async () => {
    const transport: PassengerPushTransport = {
      send: vi.fn(async () => ({
        providerName: "test-provider",
        providerMessageRef: "msg-acknowledged",
      })),
    };
    const adapter = new PassengerPushAdapter(null, transport);
    const reportPersistenceFailure = vi.fn();

    const service = buildService({
      passengerPushPort: adapter,
      repository: {
        claimPushDeliveryRow: vi.fn(async () => ({
          claimed: true,
          fenceToken: 5,
        })),
        releasePushDeliveryClaim: vi.fn(),
        recordPushDeliveryOutcome: vi.fn(async () => {
          throw new Error("DB connection terminated unexpectedly");
        }),
        reportPersistenceFailure,
      },
    });

    await expect(
      service.deliverPassengerNotification(outboxRecord()),
    ).rejects.toThrow(PassengerPushPersistenceUnknownError);

    expect(reportPersistenceFailure).toHaveBeenCalledWith(
      expect.any(Error),
      "consumer notification outbox delivery",
    );
  });
});

describe("SR-PUSH-001: Pre-send passenger device lifecycle validation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects before send when the resolved device is expired", async () => {
    const transport: PassengerPushTransport = {
      send: vi.fn(),
    };
    const deviceResolver: PassengerDeviceResolver = {
      resolveDevice: vi.fn(
        async (): Promise<PassengerDeviceRecord> => ({
          deviceId: "dev-expired-1",
          passengerSubjectRef: "sr-push-001-passenger-001",
          deviceToken: "token-exp",
          status: "expired",
        }),
      ),
    };

    const adapter = new PassengerPushAdapter(null, transport, deviceResolver);
    const releasePushDeliveryClaim = vi.fn(async () => undefined);

    const service = buildService({
      passengerPushPort: adapter,
      repository: {
        claimPushDeliveryRow: vi.fn(async () => ({
          claimed: true,
          fenceToken: 1,
        })),
        releasePushDeliveryClaim,
        updateConsumerNotificationOutboxDelivery: vi.fn(async () => undefined),
        reportPersistenceFailure: vi.fn(),
      },
    });

    const outcome = await service.deliverPassengerNotification(outboxRecord());

    expect(outcome.status).toBe("failed");
    expect(outcome.result).toBe("provider_error");
    expect(transport.send).not.toHaveBeenCalled();
    expect(releasePushDeliveryClaim).toHaveBeenCalledWith(
      "sr-push-001-outbox-001",
      1,
    );
  });

  it("rejects before send when the device registration has been revoked", async () => {
    const transport: PassengerPushTransport = {
      send: vi.fn(),
    };
    const deviceResolver: PassengerDeviceResolver = {
      resolveDevice: vi.fn(
        async (): Promise<PassengerDeviceRecord> => ({
          deviceId: "dev-revoked-1",
          passengerSubjectRef: "sr-push-001-passenger-001",
          deviceToken: "token-rev",
          status: "revoked",
        }),
      ),
    };

    const adapter = new PassengerPushAdapter(null, transport, deviceResolver);
    const service = buildService({
      passengerPushPort: adapter,
      repository: {
        claimPushDeliveryRow: vi.fn(async () => ({
          claimed: true,
          fenceToken: 1,
        })),
        releasePushDeliveryClaim: vi.fn(async () => undefined),
        updateConsumerNotificationOutboxDelivery: vi.fn(async () => undefined),
        reportPersistenceFailure: vi.fn(),
      },
    });

    const outcome = await service.deliverPassengerNotification(outboxRecord());

    expect(outcome.status).toBe("failed");
    expect(outcome.result).toBe("provider_error");
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("rejects before send when the device belongs to a different tenant", async () => {
    const transport: PassengerPushTransport = {
      send: vi.fn(),
    };
    const deviceResolver: PassengerDeviceResolver = {
      resolveDevice: vi.fn(
        async (): Promise<PassengerDeviceRecord> => ({
          deviceId: "dev-tenant-beta",
          passengerSubjectRef: "sr-push-001-passenger-001",
          deviceToken: "token-beta",
          status: "active",
          tenantId: "tenant-beta",
        }),
      ),
    };

    const adapter = new PassengerPushAdapter(null, transport, deviceResolver);
    const service = buildService({
      passengerPushPort: adapter,
      repository: {
        claimPushDeliveryRow: vi.fn(async () => ({
          claimed: true,
          fenceToken: 1,
        })),
        releasePushDeliveryClaim: vi.fn(async () => undefined),
        updateConsumerNotificationOutboxDelivery: vi.fn(async () => undefined),
        reportPersistenceFailure: vi.fn(),
      },
    });

    const outcome = await service.deliverPassengerNotification(
      outboxRecord({
        payload: { tenantId: "tenant-alpha" },
      }),
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.result).toBe("provider_error");
    expect(transport.send).not.toHaveBeenCalled();
  });
});

describe("SR-PUSH-001: HTTP provider transport and NestJS module integration", () => {
  it("sends HTTP payload with headers to configured endpoint and parses receipt", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        providerMessageRef: "http-msg-ref-456",
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new PassengerPushAdapter({
      providerName: "test-gateway",
      endpointUrl: "https://push.gateway.test/v1/send",
      apiKey: "secret-key-123",
    });

    const receipt = await adapter.send(
      {
        outboxId: "outbox-http-1",
        orderId: "order-http-1",
        passengerSubjectRef: "psg-http-1",
        eventType: "assignment_disclosure_ready",
        assignmentVersion: 2,
        payload: { ride: "started" },
      },
      { requestId: "req-http-1" },
    );

    expect(receipt).toEqual({
      providerName: "test-gateway",
      providerMessageRef: "http-msg-ref-456",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://push.gateway.test/v1/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-api-key": "secret-key-123",
          "x-request-id": "req-http-1",
        }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("throws PassengerPushProviderError on non-2xx HTTP response", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({ error: "Internal Server Error" }),
      text: async () => "Internal Server Error",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new PassengerPushAdapter({
      providerName: "test-gateway",
      endpointUrl: "https://push.gateway.test/v1/send",
      apiKey: "secret-key-123",
    });

    await expect(
      adapter.send(
        {
          outboxId: "outbox-http-2",
          orderId: "order-http-2",
          passengerSubjectRef: "psg-http-2",
          eventType: "assignment_disclosure_ready",
          assignmentVersion: 1,
          payload: {},
        },
        {},
      ),
    ).rejects.toThrow(PassengerPushProviderError);

    vi.unstubAllGlobals();
  });

  it("MultiTaxiModule binds PASSENGER_PUSH_PORT to PassengerPushAdapter", () => {
    const moduleMetadata = Reflect.getMetadata(
      "providers",
      MultiTaxiModule,
    ) as Array<Record<string, unknown> | ((...args: unknown[]) => unknown)>;
    expect(moduleMetadata).toBeDefined();

    const pushPortProvider = moduleMetadata.find(
      (p) =>
        typeof p === "object" &&
        p !== null &&
        p.provide === PASSENGER_PUSH_PORT,
    );
    expect(pushPortProvider).toBeDefined();
    expect(pushPortProvider).toMatchObject({
      provide: PASSENGER_PUSH_PORT,
      useClass: PassengerPushAdapter,
    });
  });
});

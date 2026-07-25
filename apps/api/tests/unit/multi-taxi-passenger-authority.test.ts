import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ConsumerNotificationOutboxRecord,
  PassengerRideSseEventEnvelope,
} from "@drts/contracts";

import { ApiRequestError } from "../../src/common/api-envelope";
import type { MaskedCallPort } from "../../src/modules/multi-taxi/masked-call.port";
import { UnavailableMaskedCallPort } from "../../src/modules/multi-taxi/masked-call.port";
import { MultiTaxiService } from "../../src/modules/multi-taxi/multi-taxi.service";
import type { PassengerPushPort } from "../../src/modules/multi-taxi/passenger-push.port";
import { UnavailablePassengerPushPort } from "../../src/modules/multi-taxi/passenger-push.port";

const DRIVER_PHONE = "+886912345678";

type MutableOrder = {
  status: string;
  [key: string]: unknown;
};

function createHarness(options?: {
  orderStatus?: string;
  assigned?: boolean;
  assignmentVersion?: number;
  passenger?: { passengerId?: string | null; name: string; phone: string };
  repository?: Record<string, unknown>;
  maskedCallPort?: MaskedCallPort;
  passengerPushPort?: PassengerPushPort;
  auditNotificationService?: Record<string, unknown>;
}) {
  const order: MutableOrder = {
    orderId: "order-001",
    orderNo: "MTX-001",
    runtimeProfileCode: "multi_taxi_direct",
    timingMode: "on_demand",
    status: options?.orderStatus ?? "created",
    passenger: options?.passenger ?? {
      passengerId: "passenger-001",
      name: "測試乘客",
      phone: "0911222333",
    },
    pickup: { address: "台北車站" },
    dropoff: { address: "松山機場" },
    reservationWindowStart: null,
    cancelableUntil: null,
    cancelledAt: null,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  };
  const assignment = options?.assigned
    ? {
        assignmentId: "assignment-001",
        assignmentVersion: options?.assignmentVersion ?? 1,
        driver: { driverId: "driver-001" },
        eta: { minutes: 6 },
      }
    : null;
  const ownedMobilityService = {
    createMultiTaxiRide: vi.fn(() => ({ ...order })),
    getOrder: vi.fn(() => ({ ...order })),
    findPassengerAssignmentDisclosure: vi.fn(() => assignment),
    cancelOwnedOrder: vi.fn(() => ({ ...order })),
  };
  const repository = options?.repository
    ? {
        persistAuthorization: vi.fn(async () => undefined),
        persistRideAccessToken: vi.fn(async () => undefined),
        findRideAccessTokenByDigest: vi.fn(async () => null),
        findPassengerRating: vi.fn(async () => null),
        findPassengerPayment: vi.fn(async () => null),
        findElectronicReceipt: vi.fn(async () => null),
        reportPersistenceFailure: vi.fn(),
        ...options.repository,
      }
    : undefined;
  const service = new MultiTaxiService(
    ownedMobilityService as never,
    repository as never,
    undefined as never,
    options?.auditNotificationService as never,
    options?.maskedCallPort ?? new UnavailableMaskedCallPort(),
    options?.passengerPushPort ?? new UnavailablePassengerPushPort(),
  );
  const authorization = service.createAuthorization({
    operatorId: "operator-001",
    authorityCode: "TPE-MTX-001",
    businessPlanVersion: "2026.1",
    serviceAreaCodes: ["TPE"],
    activeFareVersionId: "fare-001",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: "2027-01-01T00:00:00.000Z",
  });
  service.activateAuthorization(authorization.authorizationId);
  return { service, order, ownedMobilityService };
}

async function issueAccessToken(service: MultiTaxiService, order: MutableOrder) {
  const ride = await service.createRide(
    {
      pickup: { address: "台北車站" },
      dropoff: { address: "松山機場" },
      passenger: order.passenger as never,
      requestedPickupAt: "2026-07-23T00:00:00.000Z",
      timingMode: "on_demand",
      paymentMethodTokenRef: null,
    },
    null,
  );
  return ride;
}

function outboxRecord(
  overrides?: Partial<ConsumerNotificationOutboxRecord>,
): ConsumerNotificationOutboxRecord {
  return {
    outboxId: "outbox-001",
    orderId: "order-001",
    passengerSubjectRef: "passenger-001",
    eventType: "assignment_disclosure_ready",
    assignmentVersion: 1,
    payload: { snapshotId: "snap-001" },
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: "2026-07-23T00:00:00.000Z",
    createdAt: "2026-07-23T00:00:00.000Z",
    deliveredAt: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("P5-PAX-001 passenger SSE version authority", () => {
  it("advances eventVersion strictly per emission while assignmentVersion stays flat", async () => {
    const { service, order } = createHarness({
      assigned: true,
      assignmentVersion: 1,
    });
    const ride = await issueAccessToken(service, order);

    vi.useFakeTimers();
    const envelopes: PassengerRideSseEventEnvelope[] = [];
    const subscription = service
      .streamPassengerRide(ride.passengerAccess.accessToken)
      .subscribe((event) => {
        envelopes.push(event.data as PassengerRideSseEventEnvelope);
      });

    // Each tick is a real ride-state change, so `distinctUntilChanged` lets it
    // through and the stream must hand out a higher sequence every time.
    await vi.advanceTimersByTimeAsync(0);
    order.status = "arrived_pickup";
    await vi.advanceTimersByTimeAsync(3_000);
    order.status = "on_trip";
    await vi.advanceTimersByTimeAsync(3_000);
    order.status = "completed";
    await vi.advanceTimersByTimeAsync(3_000);
    subscription.unsubscribe();

    expect(envelopes.length).toBeGreaterThanOrEqual(4);
    expect(envelopes.map((envelope) => envelope.eventVersion)).toEqual(
      envelopes.map((_, index) => index + 1),
    );
    // The old implementation used assignmentVersion as eventVersion, which is
    // constant here and therefore could not order the stream.
    expect(
      envelopes.every((envelope) => envelope.assignmentVersion === 1),
    ).toBe(true);
    expect(new Set(envelopes.map((envelope) => envelope.eventVersion)).size).toBe(
      envelopes.length,
    );
  });

  it("keeps the sequence increasing for a second subscriber so a reconnect cannot replay a lower version", async () => {
    const { service, order } = createHarness({ assigned: true });
    const ride = await issueAccessToken(service, order);

    vi.useFakeTimers();
    const first: PassengerRideSseEventEnvelope[] = [];
    const firstSubscription = service
      .streamPassengerRide(ride.passengerAccess.accessToken)
      .subscribe((event) => {
        first.push(event.data as PassengerRideSseEventEnvelope);
      });
    await vi.advanceTimersByTimeAsync(0);
    firstSubscription.unsubscribe();

    const second: PassengerRideSseEventEnvelope[] = [];
    const secondSubscription = service
      .streamPassengerRide(ride.passengerAccess.accessToken)
      .subscribe((event) => {
        second.push(event.data as PassengerRideSseEventEnvelope);
      });
    await vi.advanceTimersByTimeAsync(0);
    secondSubscription.unsubscribe();

    expect(first[0]!.eventVersion).toBe(1);
    expect(second[0]!.eventVersion).toBeGreaterThan(first[0]!.eventVersion);
  });
});

describe("P5-PAX-001 passenger token secrecy", () => {
  it("persists only a peppered digest and never the raw token", async () => {
    vi.stubEnv("PASSENGER_RIDE_TOKEN_PEPPER", "unit-test-pepper");
    const persistRideAccessToken = vi.fn(async () => undefined);
    const { service, order } = createHarness({
      repository: {
        persistRideAccessToken,
        findRideAccessTokenByDigest: vi.fn(async () => null),
        findPassengerPayment: vi.fn(async () => null),
        findElectronicReceipt: vi.fn(async () => null),
        findPassengerRating: vi.fn(async () => null),
        reportPersistenceFailure: vi.fn(),
      },
    });
    const ride = await issueAccessToken(service, order);
    const rawToken = ride.passengerAccess.accessToken;

    expect(persistRideAccessToken).toHaveBeenCalledTimes(1);
    const [persistedToken, digest] = persistRideAccessToken.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toBe(rawToken);
    expect(JSON.stringify(persistedToken)).not.toContain(rawToken);
    expect(Object.keys(persistedToken)).not.toContain("accessToken");
  });

  it("denies an expired token with the same opaque error as an unknown token", async () => {
    vi.stubEnv("PASSENGER_RIDE_TOKEN_TTL_HOURS", "1");
    const { service, order } = createHarness();
    const ride = await issueAccessToken(service, order);
    const rawToken = ride.passengerAccess.accessToken;

    await expect(service.getPassengerRide(rawToken)).resolves.toMatchObject({
      order: { orderId: "order-001" },
    });

    vi.setSystemTime(new Date(Date.parse(ride.passengerAccess.expiresAt) + 1));
    const expired = await service
      .getPassengerRide(rawToken)
      .catch((error: unknown) => error);
    const unknown = await service
      .getPassengerRide("not-a-real-token")
      .catch((error: unknown) => error);

    expect(expired).toBeInstanceOf(ApiRequestError);
    const expiredEnvelope = (expired as ApiRequestError).getResponse();
    const unknownEnvelope = (unknown as ApiRequestError).getResponse();
    expect(expiredEnvelope).toMatchObject({
      error: { code: "PASSENGER_RIDE_TOKEN_INVALID" },
    });
    // A distinguishable response would let a caller probe which tokens exist,
    // so everything except the per-request trace id must match.
    const withoutTraceId = (envelope: unknown) => {
      const { error } = envelope as { error: Record<string, unknown> };
      const { traceId: _traceId, ...rest } = error;
      return rest;
    };
    expect(withoutTraceId(expiredEnvelope)).toEqual(
      withoutTraceId(unknownEnvelope),
    );
    expect(JSON.stringify(expiredEnvelope)).not.toContain(rawToken);
  });

  it("hashes a phone-only passenger into the subject ref instead of storing the number", async () => {
    vi.stubEnv("PASSENGER_SUBJECT_PEPPER", "unit-test-pepper");
    const persistRideAccessToken = vi.fn(async () => undefined);
    const phone = "0987654321";
    const { service, order } = createHarness({
      passenger: { passengerId: null, name: "無帳號乘客", phone },
      repository: {
        persistRideAccessToken,
        findRideAccessTokenByDigest: vi.fn(async () => null),
        reportPersistenceFailure: vi.fn(),
      },
    });
    await issueAccessToken(service, order);

    const [persistedToken] = persistRideAccessToken.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(persistedToken.passengerSubjectRef).toMatch(
      /^phone_sha256:[a-f0-9]{64}$/,
    );
    expect(JSON.stringify(persistedToken)).not.toContain(phone);
  });
});

describe("P5-PAX-001 masked-call provider port", () => {
  const assignedHarness = (
    maskedCallPort?: MaskedCallPort,
    auditNotificationService?: Record<string, unknown>,
  ) =>
    createHarness({
      orderStatus: "arrived_pickup",
      assigned: true,
      ...(maskedCallPort ? { maskedCallPort } : {}),
      ...(auditNotificationService ? { auditNotificationService } : {}),
    });

  it("reports provider absence explicitly instead of simulating a masked call", async () => {
    vi.stubEnv("MULTI_TAXI_SUPPORT_TEL_URI", "");
    const { service, order } = assignedHarness();
    const ride = await issueAccessToken(service, order);

    const contact = await service.getPassengerContact(
      ride.passengerAccess.accessToken,
    );

    expect(contact).toEqual({
      mode: "unavailable",
      contactUri: null,
      expiresAt: null,
      unavailableReason: "masked_call_provider_not_configured",
    });
  });

  it("keeps the provider-absence reason when degrading to the support number", async () => {
    vi.stubEnv("MULTI_TAXI_SUPPORT_TEL_URI", "tel:+886212345678");
    const { service, order } = assignedHarness();
    const ride = await issueAccessToken(service, order);

    const contact = await service.getPassengerContact(
      ride.passengerAccess.accessToken,
    );

    expect(contact.mode).toBe("support_fallback");
    expect(contact.contactUri).toBe("tel:+886212345678");
    expect(contact.unavailableReason).toBe(
      "masked_call_provider_not_configured",
    );
  });

  it("returns the provider proxy leg and never the raw driver number", async () => {
    vi.stubEnv("MULTI_TAXI_SUPPORT_TEL_URI", "tel:+886212345678");
    const createSession = vi.fn(async () => ({
      contactUri: "tel:+886285550000,,7781",
      expiresAt: "2026-07-23T01:00:00.000Z",
      providerName: "unit-test-provider",
    }));
    const port: MaskedCallPort = {
      isAvailable: () => true,
      createSession,
    };
    const { service, order } = assignedHarness(port);
    const ride = await issueAccessToken(service, order);

    const contact = await service.getPassengerContact(
      ride.passengerAccess.accessToken,
      "req-001",
    );

    expect(contact).toEqual({
      mode: "masked_call",
      contactUri: "tel:+886285550000,,7781",
      expiresAt: "2026-07-23T01:00:00.000Z",
      unavailableReason: null,
    });
    // The port is identifier-only: the service never even receives the raw
    // driver number, so it cannot reach the passenger response.
    const [subject] = createSession.mock.calls[0] as [Record<string, unknown>];
    expect(subject).toEqual({
      orderId: "order-001",
      assignmentId: "assignment-001",
      driverId: "driver-001",
      passengerSubjectRef: "passenger-001",
    });
    expect(JSON.stringify(contact)).not.toContain(DRIVER_PHONE);
  });

  it("reports a provider failure as unavailable and audits only the failure class", async () => {
    vi.stubEnv("MULTI_TAXI_SUPPORT_TEL_URI", "");
    const recordAuditLog = vi.fn();
    const port: MaskedCallPort = {
      isAvailable: () => true,
      createSession: vi.fn(async () => {
        throw new Error(`upstream rejected leg for ${DRIVER_PHONE}`);
      }),
    };
    const { service, order } = assignedHarness(port, { recordAuditLog });
    const ride = await issueAccessToken(service, order);

    const contact = await service.getPassengerContact(
      ride.passengerAccess.accessToken,
      "req-002",
    );

    expect(contact).toEqual({
      mode: "unavailable",
      contactUri: null,
      expiresAt: null,
      unavailableReason: "masked_call_provider_error",
    });
    expect(recordAuditLog).toHaveBeenCalledTimes(1);
    const [auditInput] = recordAuditLog.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(auditInput.actionName).toBe("masked_call_session_failed");
    // The provider error message carried the driver number; the audit trail
    // records the error class only.
    expect(JSON.stringify(auditInput)).not.toContain(DRIVER_PHONE);
  });

  it("ships with the unavailable binding so an unprovisioned runtime cannot mint a session", async () => {
    const port = new UnavailableMaskedCallPort();

    expect(port.isAvailable()).toBe(false);
    await expect(port.createSession()).rejects.toThrow(/not provisioned/);
  });
});

describe("P5-PAX-001 passenger push provider port", () => {
  it("leaves the outbox row undelivered when no provider is configured", async () => {
    const updateConsumerNotificationOutboxDelivery = vi.fn(
      async () => undefined,
    );
    const { service } = createHarness({
      repository: {
        updateConsumerNotificationOutboxDelivery,
        reportPersistenceFailure: vi.fn(),
      },
    });

    const outcome = await service.deliverPassengerNotification(outboxRecord());

    expect(outcome).toMatchObject({
      outboxId: "outbox-001",
      status: "failed",
      result: "provider_not_configured",
      attemptCount: 1,
      deliveredAt: null,
      providerName: null,
    });
    expect(updateConsumerNotificationOutboxDelivery).toHaveBeenCalledWith(
      outcome,
    );
    expect(Date.parse(outcome.nextAttemptAt)).toBeGreaterThan(0);
  });

  it("records a provider error as failed rather than delivered", async () => {
    const port: PassengerPushPort = {
      isAvailable: () => true,
      providerName: () => "unit-test-push",
      send: vi.fn(async () => {
        throw new Error("provider 503");
      }),
    };
    const { service } = createHarness({
      passengerPushPort: port,
      repository: {
        updateConsumerNotificationOutboxDelivery: vi.fn(async () => undefined),
        reportPersistenceFailure: vi.fn(),
      },
    });

    const outcome = await service.deliverPassengerNotification(outboxRecord());

    expect(outcome.status).toBe("failed");
    expect(outcome.result).toBe("provider_error");
    expect(outcome.deliveredAt).toBeNull();
  });

  it("marks delivered only on a provider receipt and forwards no raw phone", async () => {
    const send = vi.fn(async () => ({
      providerName: "unit-test-push",
      providerMessageRef: "msg-001",
    }));
    const port: PassengerPushPort = {
      isAvailable: () => true,
      providerName: () => "unit-test-push",
      send,
    };
    const { service } = createHarness({
      passengerPushPort: port,
      repository: {
        updateConsumerNotificationOutboxDelivery: vi.fn(async () => undefined),
        reportPersistenceFailure: vi.fn(),
      },
    });

    const outcome = await service.deliverPassengerNotification(
      outboxRecord({
        passengerSubjectRef: "phone_sha256:".padEnd(77, "a"),
      }),
      "req-003",
    );

    expect(outcome.status).toBe("delivered");
    expect(outcome.result).toBe("delivered");
    expect(outcome.providerName).toBe("unit-test-push");
    expect(outcome.deliveredAt).not.toBeNull();
    const [message] = send.mock.calls[0] as [Record<string, unknown>];
    expect(String(message.passengerSubjectRef)).toMatch(/^phone_sha256:/);
  });

  it("still reports the attempt when the outbox write fails", async () => {
    const reportPersistenceFailure = vi.fn();
    const { service } = createHarness({
      repository: {
        updateConsumerNotificationOutboxDelivery: vi.fn(async () => {
          throw new Error("db down");
        }),
        reportPersistenceFailure,
      },
    });

    const outcome = await service.deliverPassengerNotification(outboxRecord());

    expect(outcome.result).toBe("provider_not_configured");
    expect(reportPersistenceFailure).toHaveBeenCalledTimes(1);
  });

  it("ships with the unavailable binding so an unprovisioned runtime cannot claim delivery", async () => {
    const port = new UnavailablePassengerPushPort();

    expect(port.isAvailable()).toBe(false);
    expect(port.providerName()).toBeNull();
    await expect(port.send()).rejects.toThrow(/not provisioned/);
  });
});

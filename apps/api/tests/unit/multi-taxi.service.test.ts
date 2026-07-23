import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { MultiTaxiService } from "../../src/modules/multi-taxi/multi-taxi.service";

function createService(options?: {
  orderStatus?: string;
  assignment?: Record<string, unknown> | null;
  repository?: Record<string, unknown>;
  serviceProductService?: Record<string, unknown>;
}) {
  const order = {
    orderId: "order-001",
    orderNo: "MTX-001",
    runtimeProfileCode: "multi_taxi_direct",
    timingMode: "on_demand",
    status: options?.orderStatus ?? "created",
    passenger: {
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
  const ownedMobilityService = {
    createMultiTaxiRide: vi.fn(() => ({ ...order })),
    getOrder: vi.fn(() => ({ ...order })),
    findPassengerAssignmentDisclosure: vi.fn(() => options?.assignment ?? null),
    cancelOwnedOrder: vi.fn((_orderId, command) => {
      order.status = "cancelled";
      order.cancelledAt = "2026-07-23T00:01:00.000Z";
      return { ...order, cancelReason: command.reason };
    }),
    queueCheckInMultiTaxi: vi.fn((command, authorization) => ({
      command,
      authorization,
    })),
    queueCheckOutMultiTaxi: vi.fn((command, authorization) => ({
      command,
      authorization,
    })),
  };
  return {
    service: new MultiTaxiService(
      ownedMobilityService as never,
      options?.repository as never,
      options?.serviceProductService as never,
    ),
    ownedMobilityService,
    order,
  };
}

function createAndActivateAuthorization(service: MultiTaxiService) {
  const authorization = service.createAuthorization({
    operatorId: "operator-001",
    authorityCode: "TPE-MTX-001",
    businessPlanVersion: "2026.1",
    serviceAreaCodes: ["TPE"],
    activeFareVersionId: "fare-001",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: "2027-01-01T00:00:00.000Z",
  });
  return service.activateAuthorization(authorization.authorizationId);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("MultiTaxiService operating authority", () => {
  it("denies ride intake until an approved effective authority exists", async () => {
    const { service } = createService();
    await expect(
      service.createRide(
        {
          pickup: { address: "台北車站" },
          dropoff: { address: "松山機場" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          requestedPickupAt: new Date().toISOString(),
          timingMode: "on_demand",
          paymentMethodTokenRef: null,
        },
        null,
      ),
    ).rejects.toThrowError(ApiRequestError);
  });

  it("enforces the server-side runtime service-product policy", async () => {
    const assertRuntimeProfileServiceProductActive = vi.fn(() => {
      throw new ApiRequestError(
        409,
        "MULTI_TAXI_SERVICE_PRODUCT_NOT_ALLOWED",
        "inactive",
      );
    });
    const { service } = createService({
      serviceProductService: {
        assertRuntimeProfileServiceProductActive,
      },
    });

    await expect(
      service.createRide(
        {
          pickup: { address: "台北車站" },
          dropoff: { address: "松山機場" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          requestedPickupAt: new Date().toISOString(),
          timingMode: "on_demand",
          paymentMethodTokenRef: null,
        },
        null,
      ),
    ).rejects.toMatchObject({
      response: {
        error: { code: "MULTI_TAXI_SERVICE_PRODUCT_NOT_ALLOWED" },
      },
    });
    expect(assertRuntimeProfileServiceProductActive).toHaveBeenCalledWith(
      "multi_taxi_direct",
      "taxi_reservation",
    );
  });

  it("resolves the runtime authority on the server and denies after suspension", async () => {
    const { service, ownedMobilityService } = createService();
    const authorization = createAndActivateAuthorization(service);
    const command = {
      pickup: { address: "台北車站" },
      dropoff: { address: "松山機場" },
      passenger: { name: "測試乘客", phone: "0911222333" },
      requestedPickupAt: new Date().toISOString(),
      timingMode: "on_demand" as const,
      paymentMethodTokenRef: null,
    };

    await service.createRide(command, null);
    expect(ownedMobilityService.createMultiTaxiRide).toHaveBeenCalledWith(
      command,
      expect.objectContaining({
        authorizationId: authorization.authorizationId,
        status: "approved",
      }),
      null,
      undefined,
    );

    service.suspendAuthorization(authorization.authorizationId);
    await expect(service.createRide(command, null)).rejects.toThrowError(
      ApiRequestError,
    );
  });

  it("requires active vehicle membership before virtual queue entry", () => {
    const { service, ownedMobilityService } = createService();
    const authorization = createAndActivateAuthorization(service);
    const command = {
      vehicleId: "veh-demo-001",
      siteId: "virtual-tpe",
      queueMode: "virtual_matching" as const,
    };

    expect(() => service.queueCheckIn(command)).toThrowError(ApiRequestError);

    service.addAuthorizedVehicle(authorization.authorizationId, {
      vehicleId: "veh-demo-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
    });
    service.queueCheckIn(command);
    expect(ownedMobilityService.queueCheckInMultiTaxi).toHaveBeenCalledWith(
      command,
      expect.objectContaining({
        authorizationId: authorization.authorizationId,
      }),
      undefined,
    );
  });
});

describe("MultiTaxiService passenger ride authority", () => {
  it("issues an opaque access grant and rejects unknown tokens", async () => {
    const { service } = createService();
    createAndActivateAuthorization(service);

    const result = await service.createRide(
      {
        pickup: { address: "台北車站" },
        dropoff: { address: "松山機場" },
        passenger: {
          passengerId: "passenger-001",
          name: "測試乘客",
          phone: "0911222333",
        },
        requestedPickupAt: new Date().toISOString(),
        timingMode: "on_demand",
        paymentMethodTokenRef: null,
      },
      null,
    );

    expect(result.passengerAccess.accessToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(result.passengerAccess.scopes).toContain("ride:read");
    await expect(
      service.getPassengerRide(result.passengerAccess.accessToken),
    ).resolves.toMatchObject({
      order: { orderId: "order-001", status: "created" },
      assignment: null,
      actions: { canCancel: true, canRate: false },
    });
    await expect(
      service.getPassengerRide("unknown-token"),
    ).rejects.toMatchObject({
      response: {
        error: { code: "PASSENGER_RIDE_TOKEN_INVALID" },
      },
    });
  });

  it("hashes a phone fallback before persisting the passenger subject", async () => {
    const persistRideAccessToken = vi.fn().mockResolvedValue(undefined);
    const { service, order } = createService({
      repository: {
        isEnabled: () => true,
        persistAuthorization: vi.fn().mockResolvedValue(undefined),
        persistRideAccessToken,
        reportPersistenceFailure: vi.fn(),
      },
    });
    order.passenger.passengerId = "";
    createAndActivateAuthorization(service);

    const result = await service.createRide(
      {
        pickup: { address: "台北車站" },
        dropoff: { address: "松山機場" },
        passenger: { name: "測試乘客", phone: "0911222333" },
        requestedPickupAt: new Date().toISOString(),
        timingMode: "on_demand",
        paymentMethodTokenRef: null,
      },
      null,
    );

    expect(result.passengerAccess.passengerSubjectRef).toMatch(
      /^phone_sha256:[a-f0-9]{64}$/,
    );
    expect(result.passengerAccess.passengerSubjectRef).not.toContain(
      "0911222333",
    );
    expect(persistRideAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        passengerSubjectRef: result.passengerAccess.passengerSubjectRef,
      }),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it("reads back a persisted passenger ride token after restart", async () => {
    const persistedByDigest = new Map<string, Record<string, unknown>>();
    const repository = {
      isEnabled: () => true,
      persistAuthorization: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
      persistRideAccessToken: vi.fn(
        async (token: Record<string, unknown>, digest: string) => {
          const { accessToken: _accessToken, ...persisted } = token;
          persistedByDigest.set(digest, persisted);
        },
      ),
      findRideAccessTokenByDigest: vi.fn(async (digest: string) => {
        const token = persistedByDigest.get(digest);
        return token ? { ...token } : null;
      }),
      findPassengerRating: vi.fn(async () => null),
      findPassengerPayment: vi.fn(async () => null),
      findElectronicReceipt: vi.fn(async () => null),
    };

    const first = createService({ repository });
    createAndActivateAuthorization(first.service);
    const created = await first.service.createRide(
      {
        pickup: { address: "台北車站" },
        dropoff: { address: "松山機場" },
        passenger: {
          passengerId: "passenger-001",
          name: "測試乘客",
          phone: "0911222333",
        },
        requestedPickupAt: new Date().toISOString(),
        timingMode: "on_demand",
        paymentMethodTokenRef: null,
      },
      null,
    );

    const restarted = createService({ repository });
    createAndActivateAuthorization(restarted.service);
    const readback = await restarted.service.getPassengerRide(
      created.passengerAccess.accessToken,
    );

    expect(repository.findRideAccessTokenByDigest).toHaveBeenCalledTimes(1);
    expect(readback).toMatchObject({
      order: {
        orderId: "order-001",
        status: "created",
      },
      assignment: null,
      receipt: null,
      actions: {
        canCancel: true,
        canRate: false,
        canReadReceipt: true,
      },
    });
  });

  it("fails closed in production when passenger tokens cannot be persisted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { service, ownedMobilityService } = createService();
    createAndActivateAuthorization(service);

    await expect(
      service.createRide(
        {
          pickup: { address: "台北車站" },
          dropoff: { address: "松山機場" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          requestedPickupAt: new Date().toISOString(),
          timingMode: "on_demand",
          paymentMethodTokenRef: null,
        },
        null,
        "req-production-token",
      ),
    ).rejects.toMatchObject({
      response: {
        error: { code: "PASSENGER_ACCESS_TOKEN_PERSISTENCE_FAILED" },
      },
    });
    expect(ownedMobilityService.cancelOwnedOrder).toHaveBeenCalledWith(
      "order-001",
      { reason: "passenger_access_token_persistence_failed" },
      "req-production-token",
    );
  });

  it("allows token-scoped passenger cancellation through the owned order spine", async () => {
    const { service, ownedMobilityService } = createService();
    createAndActivateAuthorization(service);
    const result = await service.createRide(
      {
        pickup: { address: "台北車站" },
        dropoff: { address: "松山機場" },
        passenger: { name: "測試乘客", phone: "0911222333" },
        requestedPickupAt: new Date().toISOString(),
        timingMode: "on_demand",
        paymentMethodTokenRef: null,
      },
      null,
    );

    await service.cancelPassengerRide(
      result.passengerAccess.accessToken,
      "plans_changed",
    );

    expect(ownedMobilityService.cancelOwnedOrder).toHaveBeenCalledWith(
      "order-001",
      { reason: "plans_changed" },
      undefined,
    );
  });

  it("accepts one idempotent rating only after trip completion", async () => {
    const assignment = {
      assignmentId: "assignment-001",
      driver: { driverId: "driver-001" },
    };
    const { service } = createService({
      orderStatus: "completed",
      assignment,
    });
    createAndActivateAuthorization(service);
    const result = await service.createRide(
      {
        pickup: { address: "台北車站" },
        dropoff: { address: "松山機場" },
        passenger: {
          passengerId: "passenger-001",
          name: "測試乘客",
          phone: "0911222333",
        },
        requestedPickupAt: new Date().toISOString(),
        timingMode: "on_demand",
        paymentMethodTokenRef: null,
      },
      null,
    );
    const token = result.passengerAccess.accessToken;

    const first = await service.submitPassengerRating(token, {
      score: 5,
      tags: ["safe", "clean"],
      comment: "Great ride",
    });
    const replay = await service.submitPassengerRating(token, {
      score: 5,
      tags: ["clean", "safe"],
      comment: "Great ride",
    });

    expect(replay.ratingId).toBe(first.ratingId);
    await expect(
      service.submitPassengerRating(token, { score: 1 }),
    ).rejects.toMatchObject({
      response: {
        error: { code: "PASSENGER_RATING_ALREADY_SUBMITTED" },
      },
    });
  });

  it("denies rating before the ride is completed", async () => {
    const { service } = createService({
      orderStatus: "assigned",
      assignment: {
        assignmentId: "assignment-001",
        driver: { driverId: "driver-001" },
      },
    });
    createAndActivateAuthorization(service);
    const result = await service.createRide(
      {
        pickup: { address: "台北車站" },
        dropoff: { address: "松山機場" },
        passenger: { name: "測試乘客", phone: "0911222333" },
        requestedPickupAt: new Date().toISOString(),
        timingMode: "on_demand",
        paymentMethodTokenRef: null,
      },
      null,
    );

    await expect(
      service.submitPassengerRating(result.passengerAccess.accessToken, {
        score: 5,
      }),
    ).rejects.toMatchObject({
      response: {
        error: { code: "PASSENGER_RATING_TRIP_NOT_COMPLETED" },
      },
    });
  });
});

describe("MultiTaxiService trip operational records", () => {
  it("lists completed multi-taxi records with 730-day retention readback", async () => {
    const assignment = {
      assignmentId: "assignment-001",
      vehicle: {
        vehicleId: "vehicle-001",
        plateNo: "BKR-2208",
      },
      routeFare: {
        encodedPolyline: "abc",
        estimatedDistanceMeters: 12400,
        estimatedDurationSeconds: 2100,
        farePolicyVersion: "fare-v2026-07",
      },
      createdAt: "2026-07-20T14:32:00.000Z",
    };
    const { service } = createService({
      orderStatus: "completed",
      assignment,
      repository: {
        findElectronicReceipt: vi.fn(async () => ({
          receiptId: "receipt-001",
          orderId: "order-001",
          receiptNo: "AB-001",
          amountMinor: 41000,
          currency: "NTD",
          issuedAt: "2026-07-20T15:07:00.000Z",
          record: {},
        })),
      },
    });
    createAndActivateAuthorization(service);

    const records = await service.listTripOperationalRecords({
      month: "2026-07",
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      orderNo: "MTX-001",
      plateNo: "BKR-2208",
      actualFareMinor: 41000,
      farePolicyVersion: "fare-v2026-07",
    });
    expect(records[0]?.retainUntil).toBe("2028-07-22T00:00:00.000Z");
  });

  it("exports masked identifiers for trip records", async () => {
    const { service } = createService({
      orderStatus: "completed",
      assignment: {
        assignmentId: "assignment-001",
        vehicle: {
          vehicleId: "vehicle-001",
          plateNo: "BKR-2208",
        },
        routeFare: {},
        createdAt: "2026-07-20T14:32:00.000Z",
      },
    });
    createAndActivateAuthorization(service);

    const exported = await service.exportTripOperationalRecords({
      month: "2026-07",
    });

    expect(exported.filename).toBe("multi-taxi-trip-records-202607.csv");
    expect(exported.rows).toEqual([
      expect.objectContaining({
        orderNoMasked: "MTX***01",
        plateNoMasked: "BK...08",
      }),
    ]);
  });
});

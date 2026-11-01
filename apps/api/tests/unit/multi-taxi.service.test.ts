import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { MultiTaxiRepository } from "../../src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../src/modules/multi-taxi/multi-taxi.service";

function createService(options?: {
  orderStatus?: string;
  assignment?: Record<string, unknown> | null;
  repository?: Record<string, unknown>;
  serviceProductService?: Record<string, unknown>;
  auditNotificationService?: Record<string, unknown>;
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
    resolvePersistedOrder: vi.fn(async () => ({ ...order })),
    listOrders: vi.fn(() => [{ ...order }]),
    resolvePassengerRideTracking: async () => null,
    resolvePersistedPassengerAssignmentDisclosure: vi.fn(
      async () => options?.assignment ?? null,
    ),
    cancelOwnedOrder: vi.fn(async (_orderId, command) => {
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
      options?.auditNotificationService as never,
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

// Existing repository boundary now also reads back the actual authorization
// payload saved by the original create/activate commands.
function authorizationStorage() {
  const saved = new Map<
    string,
    ReturnType<MultiTaxiService["createAuthorization"]>
  >();
  return {
    persistAuthorization: vi.fn(
      async (record: ReturnType<MultiTaxiService["createAuthorization"]>) => {
        saved.set(record.authorizationId, structuredClone(record));
      },
    ),
    findEffectiveAuthorizations: vi.fn(async () => [...saved.values()]),
  };
}

async function createCompletedPassengerRating() {
  const { service } = createService({
    orderStatus: "completed",
    assignment: {
      assignmentId: "assignment-001",
      driver: { driverId: "driver-001" },
    },
  });
  createAndActivateAuthorization(service);
  const ride = await service.createRide(
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
  const rating = await service.submitPassengerRating(
    ride.passengerAccess.accessToken,
    {
      score: 5,
      tags: ["safe"],
      comment: "Great ride",
    },
  );
  return {
    service,
    accessToken: ride.passengerAccess.accessToken,
    rating,
  };
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
        prepareRuntimeProfileServiceProduct: vi.fn(async () => {}),
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
        ...authorizationStorage(),
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
      ...authorizationStorage(),
      reportPersistenceFailure: vi.fn(),
      persistRideAccessToken: vi.fn(
        async (token: Record<string, unknown>, digest: string) => {
          const persisted = { ...token };
          delete persisted.accessToken;
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

  it.each([false, true])(
    "fails closed when passenger tokens cannot be persisted (cancellation failure: %s)",
    async (cancellationFails) => {
      vi.stubEnv("NODE_ENV", "production");
      const { service, ownedMobilityService } = createService();
      if (cancellationFails)
        ownedMobilityService.cancelOwnedOrder.mockRejectedValueOnce(
          new Error("compensating cancellation failed"),
        );
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
        { systemBypassCancelableCheck: true },
      );
    },
  );

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

  it("wires listAuthorizedVehicles and lifecycle capabilities on service", () => {
    const { service } = createService();
    const now = new Date().toISOString();
    const created = service.createAuthorization({
      operatorId: "op-test-001",
      authorityCode: "AUTH-TAIPEI-001",
      businessPlanVersion: "v1.0",
      serviceAreaCodes: ["TPE", "NPT"],
      activeFareVersionId: "fare_2026_v1",
      effectiveFrom: now,
    });

    expect(created.status).toBe("draft");

    // Add authorized vehicle
    const vehicle = service.addAuthorizedVehicle(created.authorizationId, {
      vehicleId: "VEH-TPE-888",
      effectiveFrom: now,
    });
    expect(vehicle.vehicleId).toBe("VEH-TPE-888");

    // Query vehicles via service
    const vehiclesList = service.listAuthorizedVehicles(
      created.authorizationId,
    );
    expect(vehiclesList).toHaveLength(1);
    expect(vehiclesList[0]?.vehicleId).toBe("VEH-TPE-888");

    // Lifecycle activate
    const activated = service.activateAuthorization(created.authorizationId);
    expect(activated.status).toBe("approved");

    // Lifecycle suspend
    const suspended = service.suspendAuthorization(created.authorizationId);
    expect(suspended.status).toBe("suspended");

    // Re-activate
    const reActivated = service.activateAuthorization(created.authorizationId);
    expect(reActivated.status).toBe("approved");
  });
});

describe("MultiTaxiService rating invalidation authority", () => {
  it("invalidates once, rebuilds the aggregate, audits the actor, and replays idempotently", async () => {
    const { service, accessToken, rating } =
      await createCompletedPassengerRating();
    const command = {
      reason: "Passenger reported that this rating was submitted in error.",
      idempotencyKey: "rating-invalidate-001",
      confirmation: {
        action: "invalidate_rating" as const,
        ratingId: rating.ratingId,
      },
    };

    const result = await service.invalidatePassengerRating(
      rating.ratingId,
      command,
      "platform-admin-001",
      "req-rating-invalidate-001",
    );
    const replay = await service.invalidatePassengerRating(
      rating.ratingId,
      command,
      "platform-admin-001",
      "req-rating-invalidate-retry",
    );
    const passengerView = await service.getPassengerRide(accessToken);

    expect(result).toMatchObject({
      rating: {
        ratingId: rating.ratingId,
        status: "invalidated",
        score: 5,
      },
      driverRatingSummary: {
        driverId: "driver-001",
        displayState: "new_driver",
        averageRating: null,
        ratingCount: 0,
        aggregateVersion: 2,
      },
      audit: {
        action: "invalidate",
        actorId: "platform-admin-001",
        previousStatus: "active",
        resultingStatus: "invalidated",
        requestId: "req-rating-invalidate-001",
      },
      replayed: false,
    });
    expect(result.rating).not.toHaveProperty("passengerSubjectRef");
    expect(replay).toEqual({ ...result, replayed: true });
    expect(passengerView.rating?.status).toBe("invalidated");
  });

  it("requires a reason and resource-bound confirmation", async () => {
    const { service, rating } = await createCompletedPassengerRating();

    await expect(
      service.invalidatePassengerRating(
        rating.ratingId,
        {
          reason: " ",
          idempotencyKey: "rating-invalidate-002",
          confirmation: {
            action: "invalidate_rating",
            ratingId: rating.ratingId,
          },
        },
        "platform-admin-001",
      ),
    ).rejects.toMatchObject({
      response: {
        error: { code: "RATING_INVALIDATION_FIELD_INVALID" },
      },
    });

    await expect(
      service.invalidatePassengerRating(
        rating.ratingId,
        {
          reason: "Confirmed invalid rating.",
          idempotencyKey: "rating-invalidate-003",
          confirmation: {
            action: "invalidate_rating",
            ratingId: "rating-other",
          },
        },
        "platform-admin-001",
      ),
    ).rejects.toMatchObject({
      response: {
        error: { code: "RATING_INVALIDATION_CONFIRMATION_INVALID" },
      },
    });
  });

  it("rejects idempotency-key payload changes and a second invalidation command", async () => {
    const { service, rating } = await createCompletedPassengerRating();
    const confirmation = {
      action: "invalidate_rating" as const,
      ratingId: rating.ratingId,
    };

    await service.invalidatePassengerRating(
      rating.ratingId,
      {
        reason: "First accepted reason.",
        idempotencyKey: "rating-invalidate-004",
        confirmation,
      },
      "platform-admin-001",
    );

    await expect(
      service.invalidatePassengerRating(
        rating.ratingId,
        {
          reason: "Changed reason.",
          idempotencyKey: "rating-invalidate-004",
          confirmation,
        },
        "platform-admin-001",
      ),
    ).rejects.toMatchObject({
      response: {
        error: { code: "RATING_INVALIDATION_IDEMPOTENCY_CONFLICT" },
      },
    });
    await expect(
      service.invalidatePassengerRating(
        rating.ratingId,
        {
          reason: "A separate invalidation must not act as restore.",
          idempotencyKey: "rating-invalidate-005",
          confirmation,
        },
        "platform-admin-001",
      ),
    ).rejects.toMatchObject({
      response: {
        error: { code: "RATING_ALREADY_INVALIDATED" },
      },
    });
  });

  it("returns not found without fabricating a rating or aggregate", async () => {
    const { service } = createService();

    await expect(
      service.invalidatePassengerRating(
        "rating-missing",
        {
          reason: "Investigated invalid rating.",
          idempotencyKey: "rating-invalidate-missing",
          confirmation: {
            action: "invalidate_rating",
            ratingId: "rating-missing",
          },
        },
        "platform-admin-001",
      ),
    ).rejects.toMatchObject({
      response: {
        error: { code: "PASSENGER_RATING_NOT_FOUND" },
      },
    });
  });
});

describe("MultiTaxiService rating governance reads", () => {
  it("serves list, masked detail, authority, and post-invalidation audit without fabricated values", async () => {
    const { service, rating } = await createCompletedPassengerRating();

    const list = await service.listPassengerRatingReviews({
      status: "active",
      score: "5",
      tag: "safe",
      driverId: "driver-001",
      tripOrOrder: "MTX-001",
      from: "2026-01-01",
      to: "2026-12-31",
    });
    const readOnlyDetail = await service.getPassengerRatingReview(
      rating.ratingId,
      false,
    );
    const authority = await service.getDriverRatingAuthority("driver-001");

    expect(list).toMatchObject({
      items: [
        {
          ratingId: rating.ratingId,
          driverId: "driver-001",
          score: 5,
          status: "active",
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 50,
        totalItems: 1,
        totalPages: 1,
      },
      refresh: { stale: false, staleAfterMs: 300_000 },
    });
    expect(list.items[0]).not.toHaveProperty("passengerSubjectRef");
    expect(list.items[0]).not.toHaveProperty("comment");
    expect(readOnlyDetail).toMatchObject({
      rating: {
        ratingId: rating.ratingId,
        status: "active",
      },
      orderNo: "MTX-001",
      driverRatingSummary: {
        displayState: "rated",
        averageRating: 5,
        ratingCount: 1,
      },
      availableActions: {
        invalidate: {
          enabled: false,
          disabledReason: "missing_multi_taxi_ratings_moderate",
        },
      },
    });
    expect(readOnlyDetail.passengerSubjectMasked).toMatch(/[*…]|\.\.\./u);
    expect(readOnlyDetail.rating).not.toHaveProperty("passengerSubjectRef");
    expect(authority.summary).toMatchObject({
      displayState: "rated",
      averageRating: 5,
      ratingCount: 1,
    });

    await service.invalidatePassengerRating(
      rating.ratingId,
      {
        reason: "Confirmed invalid rating.",
        idempotencyKey: "rating-read-after-invalidate",
        confirmation: {
          action: "invalidate_rating",
          ratingId: rating.ratingId,
        },
      },
      "platform-admin-001",
      "req-rating-read-after-invalidate",
    );
    const invalidated = await service.getPassengerRatingReview(
      rating.ratingId,
      true,
    );

    expect(invalidated).toMatchObject({
      rating: { status: "invalidated" },
      driverRatingSummary: {
        displayState: "new_driver",
        averageRating: null,
        ratingCount: 0,
      },
      moderationHistory: [
        {
          action: "invalidate",
          actorId: "platform-admin-001",
          reason: "Confirmed invalid rating.",
        },
      ],
      availableActions: {
        invalidate: {
          enabled: false,
          disabledReason: "rating_already_invalidated",
        },
      },
    });
  });

  it("rejects invalid filters instead of broadening a malformed query", async () => {
    const { service } = createService();

    await expect(
      service.listPassengerRatingReviews({
        score: "6",
        from: "2026-02-31",
      }),
    ).rejects.toMatchObject({
      response: {
        error: { code: "RATING_REVIEW_QUERY_INVALID" },
      },
    });
    await expect(
      service.listPassengerRatingReviews({
        from: "2026-07-25",
        to: "2026-07-24",
      }),
    ).rejects.toMatchObject({
      response: {
        error: { code: "RATING_REVIEW_QUERY_INVALID" },
      },
    });
  });

  it("fails closed when persisted detail or aggregate authority is absent or inconsistent", async () => {
    const repository = {
      isEnabled: () => true,
      findPassengerRatingReview: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          rating: {
            ratingId: "rating-001",
            orderId: "order-001",
            tripId: "trip-001",
            driverId: "driver-001",
            passengerSubjectRef: "passenger-sensitive-001",
            score: 5,
            tags: [],
            comment: null,
            status: "active",
            submittedAt: "2026-07-24T00:00:00.000Z",
            updatedAt: "2026-07-24T00:00:00.000Z",
          },
          orderNo: null,
          driverDisplayName: null,
          summary: null,
          moderationHistory: [],
        }),
      findDriverRatingSummary: vi.fn().mockResolvedValue({
        driverId: "driver-001",
        displayState: "rated",
        averageRating: null,
        ratingCount: 1,
        lastRatedAt: null,
        aggregateVersion: 1,
        calculatedAt: "2026-07-24T00:00:00.000Z",
      }),
    };
    const { service } = createService({ repository });

    await expect(
      service.getPassengerRatingReview("rating-missing", true),
    ).rejects.toMatchObject({
      response: {
        error: { code: "PASSENGER_RATING_NOT_FOUND" },
      },
    });
    const missingSummaryError = await service
      .getPassengerRatingReview("rating-001", true)
      .catch((error: unknown) => error as ApiRequestError);
    expect(missingSummaryError.getStatus()).toBe(503);
    expect(missingSummaryError).toMatchObject({
      response: {
        error: { code: "DRIVER_RATING_AUTHORITY_UNAVAILABLE" },
      },
    });
    const inconsistentSummaryError = await service
      .getDriverRatingAuthority("driver-001")
      .catch((error: unknown) => error as ApiRequestError);
    expect(inconsistentSummaryError.getStatus()).toBe(503);
    expect(inconsistentSummaryError).toMatchObject({
      response: {
        error: { code: "DRIVER_RATING_AUTHORITY_INCONSISTENT" },
      },
    });
  });

  it("propagates repository read failures without falling back to local state", async () => {
    const repository = {
      isEnabled: () => true,
      listPassengerRatingReviews: vi
        .fn()
        .mockRejectedValue(new Error("database unavailable")),
    };
    const { service } = createService({ repository });

    await expect(service.listPassengerRatingReviews({})).rejects.toThrow(
      "database unavailable",
    );
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
        persistAuthorization: vi.fn().mockResolvedValue(undefined),
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
      legalHold: {
        state: "unavailable",
        family: "proof_bundle",
        subjectId: "order-001",
        activeHoldCount: null,
        activeHolds: null,
      },
    });
    expect(records[0]?.retainUntil).toBe("2028-07-23T00:00:00.000Z");
  });

  it("maps proof-bundle governance by order ID and filters active holds separately from retention", async () => {
    const getEvidenceSubjectGovernance = vi.fn(() => ({
      family: "proof_bundle",
      subjectId: "order-001",
      tenantId: null,
      manifestHash: null,
      activeLegalHolds: [
        {
          holdId: "hold-001",
          caseNumber: "CASE-2026-001",
          reasonCode: "regulatory_inquiry",
          reasonNote: "Preserve the completed trip proof.",
          placedByActorId: "platform-admin-001",
          placedAt: "2026-07-24T01:00:00.000Z",
        },
      ],
      activeDeletionExceptions: [],
      deletionSuppressed: true,
    }));
    const { service } = createService({
      orderStatus: "completed",
      auditNotificationService: { getEvidenceSubjectGovernance },
      repository: {
        persistAuthorization: vi.fn().mockResolvedValue(undefined),
        findElectronicReceipt: vi.fn(async () => null),
      },
    });
    createAndActivateAuthorization(service);

    const active = await service.listTripOperationalRecords({
      legalHold: "active",
    });
    const none = await service.listTripOperationalRecords({
      legalHold: "none",
    });

    expect(getEvidenceSubjectGovernance).toHaveBeenCalledWith(
      "proof_bundle",
      "order-001",
    );
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      retainUntil: "2028-07-23T00:00:00.000Z",
      legalHold: {
        state: "active",
        activeHoldCount: 1,
        activeHolds: [
          {
            holdId: "hold-001",
            caseNumber: "CASE-2026-001",
          },
        ],
      },
    });
    expect(none).toEqual([]);
  });

  it("returns none only from an available authority and supports the none filter", async () => {
    const { service } = createService({
      orderStatus: "completed",
      auditNotificationService: {
        getEvidenceSubjectGovernance: vi.fn(() => ({
          activeLegalHolds: [],
          activeDeletionExceptions: [],
          deletionSuppressed: false,
        })),
      },
      repository: {
        persistAuthorization: vi.fn().mockResolvedValue(undefined),
        findElectronicReceipt: vi.fn(async () => null),
      },
    });
    createAndActivateAuthorization(service);

    const records = await service.listTripOperationalRecords({
      legalHold: "none",
    });

    expect(records).toHaveLength(1);
    expect(records[0]?.legalHold).toEqual({
      state: "none",
      family: "proof_bundle",
      subjectId: "order-001",
      activeHoldCount: 0,
      activeHolds: [],
    });
  });

  it("fails closed when legal-hold authority is unavailable", async () => {
    const { service } = createService({
      orderStatus: "completed",
      auditNotificationService: {
        getEvidenceSubjectGovernance: vi.fn(() => {
          throw new Error("evidence governance unavailable");
        }),
      },
      repository: {
        persistAuthorization: vi.fn().mockResolvedValue(undefined),
        findElectronicReceipt: vi.fn(async () => null),
      },
    });
    createAndActivateAuthorization(service);

    const all = await service.listTripOperationalRecords({
      legalHold: "all",
    });
    const none = await service.listTripOperationalRecords({
      legalHold: "none",
    });
    const active = await service.listTripOperationalRecords({
      legalHold: "active",
    });

    expect(all[0]?.legalHold.state).toBe("unavailable");
    expect(none).toEqual([]);
    expect(active).toEqual([]);
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
      repository: {
        persistAuthorization: vi.fn().mockResolvedValue(undefined),
        findElectronicReceipt: vi.fn(async () => null),
      },
    });
    createAndActivateAuthorization(service);

    const exported = await service.exportTripOperationalRecords({
      month: "2026-07",
    });

    expect(exported.filename).toBe("multi-taxi-trip-records-202607.csv");
    expect(exported.rows).toEqual([
      expect.objectContaining({
        recordId: "mtr-order-001",
        orderId: "order-001",
        orderNoMasked: "M***1",
        plateNo: "BKR-2208",
        plateNoMasked: "BK...08",
        routeSummary: "台北車站 → 松山機場",
        routeSource: "pickup_dropoff_summary",
        payableFareMinor: 0,
        actualFareMinor: 0,
        collectedFareMinor: null,
        paymentStatus: "unknown",
        tollMinor: null,
        tollSource: "unavailable",
      }),
    ]);
  });

  it("enforces two-calendar-year retention floor across leap years, non-leap controls, Feb 29 starts, and longer existing retainUntil", async () => {
    const repo = new MultiTaxiRepository();
    // 1. Cross-leap-year counterexample: 2026-10-25T02:00:00.000Z (+730d = 2028-10-24T02:00:00.000Z is 1 day early)
    const leapCrossing = await repo.upsertTripOperationalRecord({
      recordId: "mtr-order-leap-cross",
      orderId: "order-leap-cross",
      orderNo: "MTX-LEAP-CROSS-001",
      tripId: "task-leap-cross",
      assignmentId: "asg-leap-cross",
      vehicleId: "veh-leap-1",
      plateNo: "TPE-2028",
      reservedAt: "2026-10-25T01:30:00.000Z",
      pickupAt: "2026-10-25T01:40:00.000Z",
      dropoffAt: "2026-10-25T02:00:00.000Z",
      route: {
        encodedPolyline: null,
        pointCount: 0,
        distanceMeters: 8500,
        durationSeconds: 1200,
        source: "pickup_dropoff_summary",
        routeSummary: "台北車站 → 南港展覽館",
      },
      payableFareMinor: 28000,
      actualFareMinor: 28000,
      collectedFareMinor: 28000,
      paymentStatus: "captured",
      tollMinor: null,
      tollSource: "unavailable",
      currency: "TWD",
      farePolicyVersion: "multi-taxi-v1",
      chargingMode: "meter",
      generatedAt: "2026-10-25T02:00:00.000Z",
      retainUntil: "2028-10-24T02:00:00.000Z", // old fixed-730d value
    });
    expect(leapCrossing.retainUntil).toBe("2028-10-25T02:00:00.000Z");
    expect(leapCrossing.tollMinor).toBeNull();

    // 2. Non-leap control: 2028-03-01T02:00:00.000Z -> 2030-03-01T02:00:00.000Z
    const nonLeapControl = await repo.upsertTripOperationalRecord({
      ...leapCrossing,
      recordId: "mtr-order-non-leap",
      orderId: "order-non-leap",
      orderNo: "MTX-NON-LEAP-001",
      reservedAt: "2028-03-01T01:30:00.000Z",
      pickupAt: "2028-03-01T01:40:00.000Z",
      dropoffAt: "2028-03-01T02:00:00.000Z",
      generatedAt: "2028-03-01T02:00:00.000Z",
      retainUntil: "2030-03-01T02:00:00.000Z",
    });
    expect(nonLeapControl.retainUntil).toBe("2030-03-01T02:00:00.000Z");

    // 3. Leap-day start: 2028-02-29T02:00:00.000Z must NOT round down to 2030-02-28T02:00:00.000Z
    const feb29Start = await repo.upsertTripOperationalRecord({
      ...leapCrossing,
      recordId: "mtr-order-feb29",
      orderId: "order-feb29",
      orderNo: "MTX-FEB29-001",
      reservedAt: "2028-02-29T01:30:00.000Z",
      pickupAt: "2028-02-29T01:40:00.000Z",
      dropoffAt: "2028-02-29T02:00:00.000Z",
      generatedAt: "2028-02-29T02:00:00.000Z",
      retainUntil: "2030-02-28T02:00:00.000Z",
    });
    expect(feb29Start.retainUntil).toBe("2030-03-01T02:00:00.000Z");

    // 4. Existing longer retainUntil is never shortened on replay
    const longerInitial = await repo.upsertTripOperationalRecord({
      ...leapCrossing,
      recordId: "mtr-order-longer",
      orderId: "order-longer",
      orderNo: "MTX-LONGER-001",
      retainUntil: "2031-01-01T00:00:00.000Z",
    });
    expect(longerInitial.retainUntil).toBe("2031-01-01T00:00:00.000Z");
    const longerReplayed = await repo.upsertTripOperationalRecord({
      ...longerInitial,
      retainUntil: "2028-10-25T02:00:00.000Z",
    });
    expect(longerReplayed.retainUntil).toBe("2031-01-01T00:00:00.000Z");

    // At 2028-10-24T02:00:00.000Z (fixed 730d mark), 2026-10-25T02:00:00.000Z is NOT purgeable!
    const earlyPurgeAt730d = await repo.purgeExpiredTripOperationalRecords({
      nowIso: "2028-10-24T02:00:00.000Z",
    });
    expect(earlyPurgeAt730d.purgedRecordIds).toEqual([]);
    expect(
      await repo.findTripOperationalRecordById("mtr-order-leap-cross"),
    ).not.toBeNull();
  });

  it("reads committed R11 rows from MultiTaxiRepository, supports exact filters, and blocks purge on active hold or deletion exception", async () => {
    const repo = new MultiTaxiRepository();
    await repo.upsertTripOperationalRecord({
      recordId: "mtr-order-committed-1",
      orderId: "order-committed-1",
      orderNo: "MTX-COMMITTED-001",
      tripId: "task-committed-1",
      assignmentId: "asg-committed-1",
      vehicleId: "veh-committed-1",
      plateNo: "TPE-9988",
      reservedAt: "2024-01-10T08:00:00.000Z",
      pickupAt: "2024-01-10T08:12:00.000Z",
      dropoffAt: "2024-01-10T08:42:00.000Z",
      route: {
        encodedPolyline: null,
        pointCount: 0,
        distanceMeters: 11200,
        durationSeconds: 1800,
        source: "pickup_dropoff_summary",
        routeSummary: "信義路 → 內湖科技園區",
      },
      payableFareMinor: 38000,
      actualFareMinor: 40000,
      collectedFareMinor: 40000,
      paymentStatus: "captured",
      tollMinor: 4000,
      tollSource: "driver_proof",
      currency: "TWD",
      farePolicyVersion: "multi-taxi-v1",
      chargingMode: "meter",
      generatedAt: "2024-01-10T08:42:00.000Z",
      retainUntil: "2026-01-09T08:42:00.000Z",
    });

    const getEvidenceSubjectGovernance = vi.fn(() => ({
      family: "proof_bundle",
      subjectId: "order-committed-1",
      tenantId: null,
      manifestHash: null,
      activeLegalHolds: [],
      activeDeletionExceptions: [
        {
          exceptionId: "exc-001",
          sourceResourceId: "TICKET-R11-HOLD",
          reasonCode: "regulatory_inquiry",
          reasonNote: "Hold under deletion exception",
          requestedByActorId: "admin-1",
          requestedAt: "2025-12-01T00:00:00.000Z",
          expiresAt: "2027-01-01T00:00:00.000Z",
          status: "active",
        },
      ],
      deletionSuppressed: true,
    }));

    const service = new MultiTaxiService(
      { listOrders: () => [] } as never,
      repo,
      undefined,
      { getEvidenceSubjectGovernance } as never,
    );

    const byPlate = await service.listTripOperationalRecords({
      plateNo: "tpe-9988",
    });
    expect(byPlate).toHaveLength(1);
    expect(byPlate[0]?.recordId).toBe("mtr-order-committed-1");
    expect(byPlate[0]?.legalHold.state).toBe("active");

    const single = await service.getTripOperationalRecord(
      "mtr-order-committed-1",
    );
    expect(single?.collectedFareMinor).toBe(40000);
    expect(single?.tollMinor).toBe(4000);

    const purgeHeld = await service.purgeExpiredTripOperationalRecords(
      "2026-06-01T00:00:00.000Z",
    );
    expect(purgeHeld.purgedRecordIds).toEqual([]);
    expect(purgeHeld.skippedHeldRecordIds).toEqual(["mtr-order-committed-1"]);

    getEvidenceSubjectGovernance.mockReturnValue({
      family: "proof_bundle",
      subjectId: "order-committed-1",
      tenantId: null,
      manifestHash: null,
      activeLegalHolds: [],
      activeDeletionExceptions: [],
      deletionSuppressed: false,
    });

    const purgeReleased = await service.purgeExpiredTripOperationalRecords(
      "2026-06-01T00:00:00.000Z",
    );
    expect(purgeReleased.purgedRecordIds).toEqual(["mtr-order-committed-1"]);
    expect(
      await service.getTripOperationalRecord("mtr-order-committed-1"),
    ).toBeNull();
  });
});

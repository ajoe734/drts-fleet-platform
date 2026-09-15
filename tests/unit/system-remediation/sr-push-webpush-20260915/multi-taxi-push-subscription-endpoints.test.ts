// SR-PUSH-WEBPUSH-20260915 -- passenger push-subscription registration
// bound to the ride access token, and end-to-end proof that an absent
// subscription is never reported as `delivered`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createECDH, randomBytes } from "node:crypto";

import type { ConsumerNotificationOutboxRecord } from "@drts/contracts";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { UnavailableMaskedCallPort } from "../../../../apps/api/src/modules/multi-taxi/masked-call.port";
import { MultiTaxiService } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { PassengerPushAdapter } from "../../../../apps/api/src/modules/multi-taxi/passenger-push.adapter";
import {
  PassengerPushDeviceResolver,
  PassengerPushRepository,
} from "../../../../apps/api/src/modules/multi-taxi/passenger-push.repository";
import { WebPushTransport } from "../../../../apps/api/src/modules/multi-taxi/web-push.transport";

type MutableOrder = { status: string; [key: string]: unknown };

function vapidEnv() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const privateKeyRaw = ecdh.getPrivateKey();
  const privateKey32 = Buffer.concat([
    Buffer.alloc(Math.max(0, 32 - privateKeyRaw.length)),
    privateKeyRaw,
  ]).subarray(-32);
  return {
    PASSENGER_WEBPUSH_VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString("base64url"),
    PASSENGER_WEBPUSH_VAPID_PRIVATE_KEY: privateKey32.toString("base64url"),
    PASSENGER_WEBPUSH_VAPID_SUBJECT: "mailto:ops@example.com",
  };
}

function browserSubscription() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    endpoint: "https://push.example.com/s/passenger-1",
    keys: {
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
}

function createHarness() {
  const order: MutableOrder = {
    orderId: "order-001",
    orderNo: "MTX-001",
    runtimeProfileCode: "multi_taxi_direct",
    timingMode: "on_demand",
    status: "created",
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
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  };
  const ownedMobilityService = {
    createMultiTaxiRide: vi.fn(() => ({ ...order })),
    getOrder: vi.fn(() => ({ ...order })),
    findPassengerAssignmentDisclosure: vi.fn(() => null),
    cancelOwnedOrder: vi.fn(() => ({ ...order })),
  };
  const repository = {
    persistAuthorization: vi.fn(async () => undefined),
    persistRideAccessToken: vi.fn(async () => undefined),
    findRideAccessTokenByDigest: vi.fn(async () => null),
    findPassengerRating: vi.fn(async () => null),
    findPassengerPayment: vi.fn(async () => null),
    findElectronicReceipt: vi.fn(async () => null),
    reportPersistenceFailure: vi.fn(),
    claimPushDeliveryRow: vi.fn(async () => ({ claimed: true, fenceToken: 1 })),
    releasePushDeliveryClaim: vi.fn(async () => undefined),
    recordPushDeliveryOutcome: vi.fn(async () => ({
      recorded: true,
      replayed: false,
    })),
    updateConsumerNotificationOutboxDelivery: vi.fn(async () => undefined),
  };

  const pushSubscriptionRepository = new PassengerPushRepository();
  const deviceResolver = new PassengerPushDeviceResolver(pushSubscriptionRepository);
  const transport = new WebPushTransport();
  const pushAdapter = new PassengerPushAdapter(null, transport, deviceResolver);

  const service = new MultiTaxiService(
    ownedMobilityService as never,
    repository as never,
    undefined as never,
    undefined as never,
    new UnavailableMaskedCallPort(),
    pushAdapter,
    pushSubscriptionRepository,
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
  return { service, order, pushSubscriptionRepository };
}

async function issueAccessToken(service: MultiTaxiService, order: MutableOrder) {
  return service.createRide(
    {
      pickup: { address: "台北車站" },
      dropoff: { address: "松山機場" },
      passenger: order.passenger as never,
      requestedPickupAt: "2026-09-15T00:00:00.000Z",
      timingMode: "on_demand",
      paymentMethodTokenRef: null,
    },
    null,
  );
}

function outboxRecord(
  overrides?: Partial<ConsumerNotificationOutboxRecord>,
): ConsumerNotificationOutboxRecord {
  return {
    outboxId: "outbox-001",
    orderId: "order-001",
    passengerSubjectRef: "passenger-001",
    eventType: "driver_arrived",
    assignmentVersion: 1,
    payload: { snapshotId: "snap-001" },
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: "2026-09-15T00:00:00.000Z",
    createdAt: "2026-09-15T00:00:00.000Z",
    deliveredAt: null,
    ...overrides,
  };
}

const originalEnv = { ...process.env };

describe("SR-PUSH-WEBPUSH-20260915: registerPassengerPushSubscription / unregisterPassengerPushSubscription", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects an invalid accessToken with the same authority error as other passenger-ride endpoints", async () => {
    const { service } = createHarness();
    await expect(
      service.registerPassengerPushSubscription(
        "not-a-real-token",
        browserSubscription(),
      ),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("rejects a malformed subscription payload (missing keys, or a non-https endpoint)", async () => {
    const { service, order } = createHarness();
    const ride = await issueAccessToken(service, order);
    const token = ride.passengerAccess.accessToken;

    await expect(
      service.registerPassengerPushSubscription(token, {
        endpoint: "http://not-secure.example.com/s/1",
        keys: { p256dh: "x", auth: "y" },
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);

    await expect(
      service.registerPassengerPushSubscription(token, {
        endpoint: "https://push.example.com/s/1",
        keys: { p256dh: "", auth: "" },
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("binds the subscription to the order behind the presented ride access token", async () => {
    const { service, order, pushSubscriptionRepository } = createHarness();
    const ride = await issueAccessToken(service, order);
    const token = ride.passengerAccess.accessToken;

    const result = await service.registerPassengerPushSubscription(
      token,
      browserSubscription(),
    );

    expect(result).toEqual({ registered: true });
    expect(
      pushSubscriptionRepository.findActiveByOrderId(order.orderId as string),
    ).toMatchObject({ passengerSubjectRef: "passenger-001" });
  });

  it("unregister revokes the subscription and is idempotent", async () => {
    const { service, order, pushSubscriptionRepository } = createHarness();
    const ride = await issueAccessToken(service, order);
    const token = ride.passengerAccess.accessToken;
    await service.registerPassengerPushSubscription(token, browserSubscription());

    expect(await service.unregisterPassengerPushSubscription(token)).toEqual({
      revoked: true,
    });
    expect(
      pushSubscriptionRepository.findActiveByOrderId(order.orderId as string),
    ).toBeNull();
    expect(await service.unregisterPassengerPushSubscription(token)).toEqual({
      revoked: false,
    });
  });

  it("a subscription registered on one ride token is never resolved for a different order", async () => {
    const { service, order, pushSubscriptionRepository } = createHarness();
    const ride = await issueAccessToken(service, order);
    await service.registerPassengerPushSubscription(
      ride.passengerAccess.accessToken,
      browserSubscription(),
    );

    expect(pushSubscriptionRepository.findActiveByOrderId("some-other-order")).toBeNull();
  });
});

describe("SR-PUSH-WEBPUSH-20260915: an absent subscription is never marked delivered (end-to-end)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T00:00:00.000Z"));
    Object.assign(process.env, vapidEnv());
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("stays failed/provider_error, never delivered, when the passenger never subscribed", async () => {
    const { service, order } = createHarness();
    await issueAccessToken(service, order); // ride exists, but no push subscription registered

    const outcome = await service.deliverPassengerNotification(
      outboxRecord({ orderId: order.orderId as string, passengerSubjectRef: "passenger-001" }),
    );

    expect(outcome.status).not.toBe("delivered");
    expect(outcome.result).not.toBe("delivered");
    expect(outcome.deliveredAt).toBeNull();
  });

  it("delivers for real once the passenger has an active subscription for that order", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service, order } = createHarness();
    const ride = await issueAccessToken(service, order);
    await service.registerPassengerPushSubscription(
      ride.passengerAccess.accessToken,
      browserSubscription(),
    );

    const outcome = await service.deliverPassengerNotification(
      outboxRecord({ orderId: order.orderId as string, passengerSubjectRef: "passenger-001" }),
    );

    expect(outcome.status).toBe("delivered");
    expect(outcome.result).toBe("delivered");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops delivering once the subscription is unsubscribed", async () => {
    const { service, order } = createHarness();
    const ride = await issueAccessToken(service, order);
    await service.registerPassengerPushSubscription(
      ride.passengerAccess.accessToken,
      browserSubscription(),
    );
    await service.unregisterPassengerPushSubscription(ride.passengerAccess.accessToken);

    const outcome = await service.deliverPassengerNotification(
      outboxRecord({ orderId: order.orderId as string, passengerSubjectRef: "passenger-001" }),
    );

    expect(outcome.status).not.toBe("delivered");
    expect(outcome.deliveredAt).toBeNull();
  });
});

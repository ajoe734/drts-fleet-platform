import { describe, expect, it, vi } from "vitest";

import { MultiTaxiService } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";

const ENTRY_SLUG = "route-order-test-entry";
const DRTS_PASSENGER_ID = "passenger-drts-001";

const PARTNER_IDENTITY: BootstrapRequestIdentity = {
  authMode: "bootstrap_headers",
  actorType: "referral_passenger",
  actorId: "referral-1",
  realm: "partner",
  tenantId: null,
  partnerEntrySlug: ENTRY_SLUG,
  drtsPassengerId: DRTS_PASSENGER_ID,
  roleFamilies: ["partner"],
  roles: [],
  scopes: [],
  requestId: null,
};

const ORDER = {
  orderId: "order-route-001",
  orderNo: "MTX-ROUTE-001",
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
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
};

const RIDE_COMMAND = {
  pickup: { address: "台北車站" },
  dropoff: { address: "松山機場" },
  passenger: {
    passengerId: "passenger-001",
    name: "測試乘客",
    phone: "0911222333",
  },
  requestedPickupAt: new Date().toISOString(),
  timingMode: "on_demand" as const,
  paymentMethodTokenRef: null,
};

function createHarness(options?: {
  identityLink?: {
    partnerUserRef: string;
    drtsPassengerId: string;
    status: "active" | "revoked";
    consentScope: string;
    linkedAt: string;
  } | null;
  entry?: { tenantId: string; partnerId: string } | null;
}) {
  const ownedMobilityService = {
    createMultiTaxiRide: vi.fn(async () => ({ ...ORDER })),
  };
  const repository = {
    writeOrderPartnerNotificationRoute: vi.fn(async (route: unknown) => route),
    persistRideAccessToken: vi.fn(async () => undefined),
    persistAuthorization: vi.fn(async () => undefined),
    reportPersistenceFailure: vi.fn(),
    isEnabled: () => false,
  };
  const partnerUserIdentityLinkRepository = {
    findByDrtsPassengerId: vi.fn(async () =>
      options?.identityLink === undefined
        ? {
            entrySlug: ENTRY_SLUG,
            partnerUserRef: "partner_user_ref_1",
            drtsPassengerId: DRTS_PASSENGER_ID,
            status: "active" as const,
            consentScope: "passenger_identity_link",
            linkedAt: "2026-09-01T00:00:00.000Z",
            lastSeenAt: null,
            createdAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
          }
        : options.identityLink,
    ),
  };
  const tenantPartnerService = {
    getPartnerEntry: vi.fn(() => {
      if (options?.entry === null) {
        throw new Error("not found");
      }
      return options?.entry ?? { tenantId: "tenant-route-001", partnerId: "partner-route-001" };
    }),
  };

  const service = new MultiTaxiService(
    ownedMobilityService as never,
    repository as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    partnerUserIdentityLinkRepository as never,
    tenantPartnerService as never,
  );
  return { service, ownedMobilityService, repository, partnerUserIdentityLinkRepository, tenantPartnerService };
}

async function activate(service: MultiTaxiService) {
  const authorization = service.createAuthorization({
    operatorId: "operator-001",
    authorityCode: "TPE-MTX-ROUTE",
    businessPlanVersion: "2026.1",
    serviceAreaCodes: ["TPE"],
    activeFareVersionId: "fare-001",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: "2027-01-01T00:00:00.000Z",
  });
  service.activateAuthorization(authorization.authorizationId);
}

describe("MultiTaxiService order-route creation (SR-PARTNER-NOTIFY-ROUTE-20260917 §4)", () => {
  it("writes a route from the authenticated identity + existing identity link when a partner handoff created the ride", async () => {
    const { service, repository, partnerUserIdentityLinkRepository, tenantPartnerService } =
      createHarness();
    await activate(service);

    await service.createRide(RIDE_COMMAND, PARTNER_IDENTITY);

    expect(partnerUserIdentityLinkRepository.findByDrtsPassengerId).toHaveBeenCalledWith(
      ENTRY_SLUG,
      DRTS_PASSENGER_ID,
    );
    expect(tenantPartnerService.getPartnerEntry).toHaveBeenCalledWith(ENTRY_SLUG);
    expect(repository.writeOrderPartnerNotificationRoute).toHaveBeenCalledTimes(1);
    const [route] = repository.writeOrderPartnerNotificationRoute.mock.calls[0];
    expect(route).toMatchObject({
      orderId: ORDER.orderId,
      tenantId: "tenant-route-001",
      partnerId: "partner-route-001",
      entrySlug: ENTRY_SLUG,
      partnerUserRef: "partner_user_ref_1",
      drtsPassengerId: DRTS_PASSENGER_ID,
      rideRef: ORDER.orderId,
      notificationPolicyVersion: "partner_notification_v1",
    });
    // never trusts a caller-suppliable field for the recipient reference
    expect(route.passengerSubjectRef).not.toBe(ORDER.passenger.phone);
  });

  it("does not write a route for a direct (non-partner) booking", async () => {
    const { service, repository } = createHarness();
    await activate(service);

    await service.createRide(RIDE_COMMAND, null);

    expect(repository.writeOrderPartnerNotificationRoute).not.toHaveBeenCalled();
  });

  it("does not write a route for a call-center booking (identity is always null there)", async () => {
    const { service, repository } = createHarness();
    await activate(service);

    await service.createCallCenterRide({
      ...RIDE_COMMAND,
      callId: "call-1",
    } as never);

    expect(repository.writeOrderPartnerNotificationRoute).not.toHaveBeenCalled();
  });

  it("does not write a route when the identity link is revoked", async () => {
    const { service, repository } = createHarness({
      identityLink: {
        partnerUserRef: "partner_user_ref_1",
        drtsPassengerId: DRTS_PASSENGER_ID,
        status: "revoked",
        consentScope: "passenger_identity_link",
        linkedAt: "2026-09-01T00:00:00.000Z",
      },
    });
    await activate(service);

    await service.createRide(RIDE_COMMAND, PARTNER_IDENTITY);

    expect(repository.writeOrderPartnerNotificationRoute).not.toHaveBeenCalled();
  });

  it("does not write a route when no identity link can be resolved (never guesses a recipient)", async () => {
    const { service, repository } = createHarness({ identityLink: null });
    await activate(service);

    await service.createRide(RIDE_COMMAND, PARTNER_IDENTITY);

    expect(repository.writeOrderPartnerNotificationRoute).not.toHaveBeenCalled();
  });

  it("does not write a route (and does not fail ride creation) when the entry cannot be resolved", async () => {
    const { service, repository } = createHarness({ entry: null });
    await activate(service);

    const result = await service.createRide(RIDE_COMMAND, PARTNER_IDENTITY);

    expect(result.ride.orderId).toBe(ORDER.orderId);
    expect(repository.writeOrderPartnerNotificationRoute).not.toHaveBeenCalled();
  });

  it("ride creation still succeeds even if route persistence rejects", async () => {
    const { service, repository } = createHarness();
    repository.writeOrderPartnerNotificationRoute.mockRejectedValueOnce(
      new Error("db unavailable"),
    );
    await activate(service);

    const result = await service.createRide(RIDE_COMMAND, PARTNER_IDENTITY);
    expect(result.ride.orderId).toBe(ORDER.orderId);
  });
});

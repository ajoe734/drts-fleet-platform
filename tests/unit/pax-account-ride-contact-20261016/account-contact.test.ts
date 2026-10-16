import { afterEach, describe, expect, it, vi } from "vitest";
import { PassengerBookingController } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.controller";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import {
  UnavailableMaskedCallPort,
  type MaskedCallPort,
} from "../../../apps/api/src/modules/multi-taxi/masked-call.port";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";

function harness(
  port: MaskedCallPort = new UnavailableMaskedCallPort(),
  status = "arrived_pickup",
  assigned = true,
) {
  const owned = {
    resolvePersistedOrder: vi.fn(async () => ({
      orderId: "same-owned-order",
      runtimeProfileCode: "multi_taxi_direct",
      status,
    })),
    resolvePersistedPassengerAssignmentDisclosure: vi.fn(async () =>
      assigned
        ? {
            assignmentId: "same-assignment",
            driver: { driverId: "assigned-driver" },
          }
        : null,
    ),
  };
  const assertRideOwner = vi.fn(async () => undefined);
  const service = new MultiTaxiService(
    owned as never,
    undefined,
    undefined,
    undefined,
    port,
  );
  return {
    owned,
    assertRideOwner,
    controller: new PassengerBookingController(
      { assertRideOwner } as never,
      service,
    ),
  };
}
const identity = {
  realm: "passenger",
  drtsPassengerId: "account-passenger",
} as const;
afterEach(() => vi.unstubAllEnvs());

describe("account contact uses the existing same-order masked-call service", () => {
  it("returns a provider option through the real controller and service after the existing owner check", async () => {
    const createSession = vi.fn(async () => ({
      contactUri: "tel:0000000000",
      expiresAt: "2026-10-17T01:00:00.000Z",
      providerName: "test-external-port",
    }));
    const h = harness({ isAvailable: () => true, createSession });
    const response = await h.controller.contactRide(
      identity as never,
      "same-owned-order",
      "contact-request",
    );
    expect(h.assertRideOwner).toHaveBeenCalledWith(
      "account-passenger",
      "same-owned-order",
    );
    expect(h.assertRideOwner.mock.invocationCallOrder[0]).toBeLessThan(
      createSession.mock.invocationCallOrder[0]!,
    );
    expect(createSession).toHaveBeenCalledWith(
      {
        orderId: "same-owned-order",
        assignmentId: "same-assignment",
        driverId: "assigned-driver",
        passengerSubjectRef: "account-passenger",
      },
      { requestId: "contact-request" },
    );
    expect(response.data).toEqual({
      mode: "masked_call",
      contactUri: "tel:0000000000",
      expiresAt: "2026-10-17T01:00:00.000Z",
      unavailableReason: null,
    });
  });

  it("returns the existing unavailable state when the external port is absent", async () => {
    vi.stubEnv("MULTI_TAXI_SUPPORT_TEL_URI", "");
    const response = await harness().controller.contactRide(
      identity as never,
      "same-owned-order",
    );
    expect(response.data).toEqual({
      mode: "unavailable",
      contactUri: null,
      expiresAt: null,
      unavailableReason: "masked_call_provider_not_configured",
    });
  });

  it("retains the original configured support fallback and absence reason", async () => {
    vi.stubEnv("MULTI_TAXI_SUPPORT_TEL_URI", "tel:0000000000");
    const response = await harness().controller.contactRide(
      identity as never,
      "same-owned-order",
    );
    expect(response.data).toEqual({
      mode: "support_fallback",
      contactUri: "tel:0000000000",
      expiresAt: null,
      unavailableReason: "masked_call_provider_not_configured",
    });
  });

  it("retains the original provider-error outcome without a fabricated call", async () => {
    vi.stubEnv("MULTI_TAXI_SUPPORT_TEL_URI", "");
    const h = harness({
      isAvailable: () => true,
      createSession: vi.fn(async () => {
        throw new Error("external failure");
      }),
    });
    expect(
      (await h.controller.contactRide(identity as never, "same-owned-order"))
        .data,
    ).toEqual({
      mode: "unavailable",
      contactUri: null,
      expiresAt: null,
      unavailableReason: "masked_call_provider_error",
    });
  });

  it.each(["completed", "cancelled"])(
    "keeps the existing %s ride contact outcome",
    async (status) => {
      const createSession = vi.fn();
      const h = harness({ isAvailable: () => true, createSession }, status);
      await expect(
        h.controller.contactRide(identity as never, "same-owned-order"),
      ).rejects.toMatchObject({ code: "PASSENGER_CONTACT_NOT_AVAILABLE" });
      expect(createSession).not.toHaveBeenCalled();
    },
  );

  it("keeps the original no-assignment outcome", async () => {
    await expect(
      harness(undefined, "created", false).controller.contactRide(
        identity as never,
        "same-owned-order",
      ),
    ).rejects.toMatchObject({ code: "PASSENGER_CONTACT_NOT_AVAILABLE" });
  });

  it("preserves the existing booking-owner failure before resolving any contact", async () => {
    const h = harness();
    h.assertRideOwner.mockRejectedValue(
      new ApiRequestError(404, "RIDE_NOT_FOUND", "Ride not found"),
    );
    await expect(
      h.controller.contactRide(identity as never, "same-owned-order"),
    ).rejects.toMatchObject({ code: "RIDE_NOT_FOUND" });
    expect(h.owned.resolvePersistedOrder).not.toHaveBeenCalled();
  });
});

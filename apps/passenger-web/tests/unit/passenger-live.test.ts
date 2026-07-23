import { afterEach, describe, expect, it, vi } from "vitest";

import type { PassengerRideAuthorityView } from "@drts/contracts";

import { mapPassengerRideAuthorityToFixture } from "../../lib/passenger-live";
import { resolvePassengerDataMode } from "../../lib/passenger-fixtures";

function createAuthorityView(): PassengerRideAuthorityView {
  return {
    order: {
      orderId: "order-001",
      orderNo: "MTX-001",
      status: "created",
      timingMode: "on_demand",
      requestedPickupAt: "2026-07-23T00:00:00.000Z",
      pickup: { address: "台北車站" },
      dropoff: { address: "松山機場" },
      cancelableUntil: null,
      cancelledAt: null,
      completedAt: null,
    },
    assignment: null,
    rating: null,
    payment: null,
    receipt: null,
    actions: {
      canCancel: true,
      canRate: false,
      canContact: false,
      canReadReceipt: false,
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("passenger live authority", () => {
  it("forces live authority in production even when fixture mode is requested", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(resolvePassengerDataMode("fixture")).toBe("live");
  });

  it("does not invent assignment disclosure when authority has no assignment", () => {
    const fixture = mapPassengerRideAuthorityToFixture(
      createAuthorityView(),
      "opaque-token",
    );

    expect(fixture.assignment).toBeNull();
    expect(fixture.driver).toEqual({
      name: "尚未指派",
      vehicle: "尚未指派",
      plateNo: "尚未指派",
      color: "未提供",
      registrationMaskedDisplay: "尚未提供",
      registrationEffectiveUntil: "尚未提供",
      ratingState: "unavailable",
    });
    expect(fixture.canCancel).toBe(true);
    expect(fixture.canContact).toBe(false);
  });
});

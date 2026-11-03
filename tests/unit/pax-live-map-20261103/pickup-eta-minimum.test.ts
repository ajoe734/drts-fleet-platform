import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PassengerRideAuthorityView } from "@drts/contracts";
import {
  mapPassengerRideAuthorityToFixture,
  pickupEtaMinutes,
} from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import {
  authority,
  NOW,
  tracking,
} from "../pax-live-tracking-20261017/fixture";

function fixtureWith(
  status: PassengerRideAuthorityView["order"]["status"],
  minutes: number,
) {
  const view = Object.assign(authority(status), { tracking: tracking() });
  view.tracking.pickupEta.minutes = minutes;
  return mapPassengerRideAuthorityToFixture(view, view.order.orderId);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("passenger pickup ETA never promises 0 minutes", () => {
  it.each(["assigned", "driver_accepted", "enroute_pickup"] as const)(
    "shows at least 1 minute while the driver is still approaching (%s)",
    (status) => {
      const fixture = fixtureWith(status, 0);
      expect(fixture.etaMain).toBe("預計 1 分鐘抵達");
      expect(fixture.etaMain).not.toContain("0 分鐘");
      // The arrival clock agrees with the minute shown (calculatedAt + 1 min).
      expect(fixture.etaSub).toMatch(/約 13:25 抵達$/);
    },
  );

  it("keeps real minute values unchanged", () => {
    expect(fixtureWith("enroute_pickup", 3).etaMain).toBe("預計 3 分鐘抵達");
    expect(fixtureWith("enroute_pickup", 12).etaMain).toBe("預計 12 分鐘抵達");
  });

  it("shows no pickup ETA once the driver has arrived", () => {
    const fixture = fixtureWith("arrived_pickup", 0);
    expect(fixture.etaMain).toBeUndefined();
    expect(fixture.status).toBe("司機已抵達");
  });

  it("rounds partial or negative minutes up to a whole minute of at least 1", () => {
    expect(pickupEtaMinutes(0)).toBe(1);
    expect(pickupEtaMinutes(0.2)).toBe(1);
    expect(pickupEtaMinutes(-2)).toBe(1);
    expect(pickupEtaMinutes(2.1)).toBe(3);
    expect(pickupEtaMinutes(5)).toBe(5);
    expect(pickupEtaMinutes(Number.NaN)).toBeNull();
    expect(pickupEtaMinutes(null)).toBeNull();
    expect(pickupEtaMinutes(undefined)).toBeNull();
  });
});

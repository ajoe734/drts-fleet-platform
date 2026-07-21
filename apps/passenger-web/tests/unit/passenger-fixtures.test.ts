import { describe, expect, it } from "vitest";
import {
  getPassengerRideFixture,
  resolvePassengerDataMode,
} from "../../lib/passenger-fixtures";
import { resolvePassengerScreenId } from "../../lib/passenger-presentation";

describe("passenger fixtures", () => {
  it("fails closed when disclosure is unavailable", () => {
    const fixture = getPassengerRideFixture("P5-11", "demo-token");

    expect(fixture.assignment).toBeNull();
    expect(fixture.disclosureBlockReason).toBe("P5_RATING_STATE_UNINITIALIZED");
    expect(fixture.driver.ratingState).toBe("unavailable");
  });

  it("resolves fares route to A03 by default", () => {
    expect(resolvePassengerScreenId(undefined, "fares")).toBe("A03");
  });

  it("resolves fixture mode unless live is explicit", () => {
    expect(resolvePassengerDataMode(undefined)).toBe("fixture");
    expect(resolvePassengerDataMode("live")).toBe("live");
  });
});

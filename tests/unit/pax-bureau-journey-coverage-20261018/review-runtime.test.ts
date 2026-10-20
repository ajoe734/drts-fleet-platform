import { describe, expect, it } from "vitest";
import {
  bureauPhone,
  driverOrigin,
  roleHeaders,
} from "../../e2e/pax-bureau-acceptance/review-runtime";

describe("bureau browser role and identity contracts", () => {
  const privateServices = {
    PAX_REVIEW_SHARED_DEV_SMOKE: "true",
    PAX_REVIEW_PUBLIC_PASSENGER: "true",
    PAX_REVIEW_PASSENGER_ID_TOKEN: "passenger-audience",
    PAX_REVIEW_OPS_ID_TOKEN: "ops-audience",
    PAX_REVIEW_DRIVER_ID_TOKEN: "driver-audience",
    PAX_REVIEW_DRIVER_ORIGIN: "https://private-ops.example/",
  };

  it("omits cloud credentials on public Passenger and preserves each private role audience", () => {
    expect(roleHeaders("pax", privateServices)).toEqual({});
    expect(roleHeaders("ops", privateServices)).toEqual({
      "X-Serverless-Authorization": "Bearer ops-audience",
    });
    expect(roleHeaders("driver", privateServices)).toEqual({
      "X-Serverless-Authorization": "Bearer driver-audience",
    });
    expect(
      roleHeaders("pax", {
        ...privateServices,
        PAX_REVIEW_PUBLIC_PASSENGER: "false",
      }),
    ).toEqual({ "X-Serverless-Authorization": "Bearer passenger-audience" });
    expect(driverOrigin(privateServices)).toBe(
      "https://private-ops.example/review-driver",
    );
    expect(driverOrigin({})).toBe("http://127.0.0.1:3101");
  });

  it("rejects missing private Driver origin or audience before navigating", () => {
    expect(() => driverOrigin({ PAX_REVIEW_SHARED_DEV_SMOKE: "true" })).toThrow(
      "private Driver origin",
    );
    expect(() =>
      roleHeaders("driver", {
        ...privateServices,
        PAX_REVIEW_DRIVER_ID_TOKEN: undefined,
      }),
    ).toThrow("credential for driver");
  });

  it("requires explicit, distinct lawful rehearsal-pool identities for shared first consent", () => {
    expect(bureauPhone("consent", {})).toBe("0900000010");
    expect(() => bureauPhone("consent", privateServices)).toThrow(
      "PAX_BUREAU_PHONES",
    );
    expect(() =>
      bureauPhone("consent", {
        ...privateServices,
        PAX_BUREAU_PHONES: JSON.stringify({ consent: "0912345678" }),
      }),
    ).toThrow("Allocate");
    expect(() =>
      bureauPhone("consent", {
        ...privateServices,
        PAX_BUREAU_PHONES: JSON.stringify({
          consent: "0900000030",
          trip: "0900000030",
        }),
      }),
    ).toThrow("own allocated");
    expect(
      bureauPhone("consent", {
        ...privateServices,
        PAX_BUREAU_PHONES: JSON.stringify({
          consent: "0900000030",
          trip: "0900000031",
        }),
      }),
    ).toBe("0900000030");
  });
});

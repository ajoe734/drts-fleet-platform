import { describe, expect, it } from "vitest";
import {
  assertBusinessOrderProduct,
  type ObjectData,
} from "../../e2e/owned-referral-business-journey/protocol";

const quoteId = "original-committed-quote";
function example(): ObjectData {
  return {
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "enterprise_dispatch",
    referralPassengerLifecycle: {
      quote: {
        quoteId,
        businessDispatchSubtype: "enterprise_dispatch",
        serviceProductCode: "enterprise_dispatch",
      },
    },
  };
}

describe("existing canonical business product compatibility", () => {
  it("accepts the bucket/subtype contract when the optional precise code is absent", () => {
    expect(() => assertBusinessOrderProduct(example(), quoteId)).not.toThrow();
  });

  it("accepts null precise code without replacing the committed quote", () => {
    expect(() =>
      assertBusinessOrderProduct(
        { ...example(), serviceProductCode: null },
        quoteId,
      ),
    ).not.toThrow();
  });

  it("accepts an explicit precise code only when it agrees with the business product", () => {
    expect(() =>
      assertBusinessOrderProduct(
        { ...example(), serviceProductCode: "enterprise_dispatch" },
        quoteId,
      ),
    ).not.toThrow();
  });

  it("rejects a taxi, missing, or empty service bucket", () => {
    for (const serviceBucket of ["standard_taxi", undefined, ""]) {
      expect(() =>
        assertBusinessOrderProduct({ ...example(), serviceBucket }, quoteId),
      ).toThrow("actual business order qualification");
    }
  });

  it("rejects a wrong or missing subtype even when the explicit precise code agrees", () => {
    for (const businessDispatchSubtype of [
      "airport_transfer",
      undefined,
      null,
    ]) {
      expect(() =>
        assertBusinessOrderProduct(
          {
            ...example(),
            serviceProductCode: "enterprise_dispatch",
            businessDispatchSubtype,
          },
          quoteId,
        ),
      ).toThrow("actual business order qualification");
    }
  });

  it("never falls back from a contradictory explicit code, including falsy values", () => {
    for (const serviceProductCode of [
      "taxi_realtime",
      "airport_transfer",
      "",
      0,
      false,
      {},
    ]) {
      expect(() =>
        assertBusinessOrderProduct(
          { ...example(), serviceProductCode },
          quoteId,
        ),
      ).toThrow("actual business order qualification");
    }
  });

  it("rejects a foreign, missing, or unbound committed quote", () => {
    for (const patch of [
      { quoteId: "another-order-quote" },
      { quoteId: undefined },
    ]) {
      const order = example();
      const lifecycle = order.referralPassengerLifecycle as ObjectData;
      lifecycle.quote = { ...(lifecycle.quote as ObjectData), ...patch };
      expect(() => assertBusinessOrderProduct(order, quoteId)).toThrow();
    }
    for (const referralPassengerLifecycle of [
      undefined,
      null,
      { quote: null },
    ]) {
      expect(() =>
        assertBusinessOrderProduct(
          { ...example(), referralPassengerLifecycle },
          quoteId,
        ),
      ).toThrow();
    }
    expect(() => assertBusinessOrderProduct(example(), "")).toThrow();
  });

  it("rejects a quote whose required product or subtype contradicts the order", () => {
    for (const patch of [
      { serviceProductCode: "taxi_realtime" },
      { serviceProductCode: undefined },
      { businessDispatchSubtype: "airport_transfer" },
      { businessDispatchSubtype: undefined },
    ]) {
      const order = example();
      const lifecycle = order.referralPassengerLifecycle as ObjectData;
      lifecycle.quote = { ...(lifecycle.quote as ObjectData), ...patch };
      expect(() => assertBusinessOrderProduct(order, quoteId)).toThrow(
        "same committed business quote qualification",
      );
    }
  });

  it("does not mutate an immutable order or expose rejected values in its error", () => {
    const order = example();
    const lifecycle = order.referralPassengerLifecycle as ObjectData;
    Object.freeze(lifecycle.quote);
    Object.freeze(lifecycle);
    Object.freeze(order);
    const before = JSON.stringify(order);
    assertBusinessOrderProduct(order, quoteId);
    expect(JSON.stringify(order)).toBe(before);
    const privateMarker = "synthetic-private-value";
    let error: unknown;
    try {
      assertBusinessOrderProduct(
        { ...order, serviceProductCode: privateMarker },
        privateMarker,
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(privateMarker);
  });
});

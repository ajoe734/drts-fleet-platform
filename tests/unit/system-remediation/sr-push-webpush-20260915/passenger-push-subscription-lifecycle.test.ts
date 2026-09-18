// SR-PUSH-WEBPUSH-20260915 -- subscription storage + device resolver, and
// the subscription's lifecycle binding to the ride access token.
//
// P5-PUSH-001 shipped `PassengerDeviceResolver` as an interface with no
// implementation and nothing registering it into the module, so
// `PassengerPushAdapter` never had a device to resolve. This suite exercises
// the concrete `PassengerPushRepository` / `PassengerPushDeviceResolver`
// added to close that gap.
import { describe, expect, it } from "vitest";

import {
  PassengerPushDeviceResolver,
  PassengerPushRepository,
} from "../../../../apps/api/src/modules/multi-taxi/passenger-push.repository";

function keys() {
  return { p256dh: "p256dh-key-value", auth: "auth-secret-value" };
}

describe("SR-PUSH-WEBPUSH-20260915: PassengerPushRepository", () => {
  it("returns null for an order with no subscription", () => {
    const repository = new PassengerPushRepository();
    expect(repository.findActiveByOrderId("order-1")).toBeNull();
  });

  it("stores and returns an active subscription for its order", () => {
    const repository = new PassengerPushRepository();
    repository.upsertSubscription({
      orderId: "order-1",
      passengerSubjectRef: "passenger-1",
      endpoint: "https://push.example.com/s/abc",
      keys: keys(),
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
    });

    const found = repository.findActiveByOrderId("order-1");
    expect(found).toMatchObject({
      orderId: "order-1",
      passengerSubjectRef: "passenger-1",
      endpoint: "https://push.example.com/s/abc",
      status: "active",
    });
  });

  it("replaces rather than accumulates on re-subscribe for the same order", () => {
    const repository = new PassengerPushRepository();
    repository.upsertSubscription({
      orderId: "order-1",
      passengerSubjectRef: "passenger-1",
      endpoint: "https://push.example.com/s/old",
      keys: keys(),
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
    });
    repository.upsertSubscription({
      orderId: "order-1",
      passengerSubjectRef: "passenger-1",
      endpoint: "https://push.example.com/s/new",
      keys: keys(),
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
    });

    expect(repository.findActiveByOrderId("order-1")?.endpoint).toBe(
      "https://push.example.com/s/new",
    );
  });

  it("revokeByOrderId marks the subscription inactive and reports true once", () => {
    const repository = new PassengerPushRepository();
    repository.upsertSubscription({
      orderId: "order-1",
      passengerSubjectRef: "passenger-1",
      endpoint: "https://push.example.com/s/abc",
      keys: keys(),
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
    });

    expect(repository.revokeByOrderId("order-1")).toBe(true);
    expect(repository.findActiveByOrderId("order-1")).toBeNull();
    // Revoking an already-revoked (or never-subscribed) order is a no-op.
    expect(repository.revokeByOrderId("order-1")).toBe(false);
    expect(repository.revokeByOrderId("order-never-subscribed")).toBe(false);
  });
});

describe("SR-PUSH-WEBPUSH-20260915: PassengerPushDeviceResolver", () => {
  it("resolves null when no orderId is supplied in context", () => {
    const repository = new PassengerPushRepository();
    const resolver = new PassengerPushDeviceResolver(repository);
    expect(resolver.resolveDevice("passenger-1", {})).toBeNull();
    expect(resolver.resolveDevice("passenger-1", undefined)).toBeNull();
  });

  it("resolves null when the order has no active subscription", () => {
    const repository = new PassengerPushRepository();
    const resolver = new PassengerPushDeviceResolver(repository);
    expect(
      resolver.resolveDevice("passenger-1", { orderId: "order-1" }),
    ).toBeNull();
  });

  it("never returns another passenger's subscription for a mismatched subject ref", () => {
    const repository = new PassengerPushRepository();
    repository.upsertSubscription({
      orderId: "order-1",
      passengerSubjectRef: "passenger-1",
      endpoint: "https://push.example.com/s/abc",
      keys: keys(),
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
    });
    const resolver = new PassengerPushDeviceResolver(repository);

    expect(
      resolver.resolveDevice("passenger-DIFFERENT", { orderId: "order-1" }),
    ).toBeNull();
  });

  it("resolves the subscription's endpoint/keys as webPushSubscription, never in deviceToken", () => {
    const repository = new PassengerPushRepository();
    repository.upsertSubscription({
      orderId: "order-1",
      passengerSubjectRef: "passenger-1",
      endpoint: "https://push.example.com/s/abc",
      keys: keys(),
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
    });
    const resolver = new PassengerPushDeviceResolver(repository);

    const device = resolver.resolveDevice("passenger-1", {
      orderId: "order-1",
    });
    expect(device).toMatchObject({
      status: "active",
      webPushSubscription: {
        endpoint: "https://push.example.com/s/abc",
        keys: keys(),
      },
    });
    expect(device?.deviceToken).toBe("");
  });

  it("carries the ride access token's expiresAt so the adapter's own expiry check governs the subscription's lifecycle", () => {
    const repository = new PassengerPushRepository();
    repository.upsertSubscription({
      orderId: "order-1",
      passengerSubjectRef: "passenger-1",
      endpoint: "https://push.example.com/s/abc",
      keys: keys(),
      accessTokenExpiresAt: "2020-01-01T00:00:00.000Z", // already in the past
    });
    const resolver = new PassengerPushDeviceResolver(repository);

    const device = resolver.resolveDevice("passenger-1", {
      orderId: "order-1",
    });
    expect(device?.expiresAt).toBe("2020-01-01T00:00:00.000Z");
  });
});

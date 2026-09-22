// Retained subscription storage for API compatibility. Partner notifications
// do not resolve recipients through this repository.
import { describe, expect, it } from "vitest";

import { PassengerPushRepository } from "../../../../apps/api/src/modules/multi-taxi/passenger-push.repository";

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

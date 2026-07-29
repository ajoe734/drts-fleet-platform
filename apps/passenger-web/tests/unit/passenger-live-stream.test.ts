import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  PassengerRideAuthorityView,
  PassengerRideSseEventEnvelope,
} from "@drts/contracts";

import {
  isFreshPassengerEvent,
  subscribePassengerRideAuthority,
} from "../../lib/passenger-live";

type Listener = (event: { data: string }) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Listener[]>();
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: Listener) {
    const existing = this.listeners.get(name) ?? [];
    existing.push(listener);
    this.listeners.set(name, existing);
  }

  close() {
    this.closed = true;
  }

  emit(name: string, envelope: Record<string, unknown>) {
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data: JSON.stringify(envelope) });
    }
  }
}

function authorityView(status: string): PassengerRideAuthorityView {
  return {
    order: {
      orderId: "order-001",
      orderNo: "MTX-001",
      status: status as PassengerRideAuthorityView["order"]["status"],
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
      canCancel: false,
      canRate: false,
      canContact: false,
      canReadReceipt: false,
    },
  };
}

function envelope(
  eventVersion: number,
  status: string,
): Record<string, unknown> {
  const value: PassengerRideSseEventEnvelope = {
    eventId: `evt-${eventVersion}`,
    eventType: "trip_started",
    eventVersion,
    assignmentVersion: 1,
    orderId: "order-001",
    occurredAt: "2026-07-23T00:00:00.000Z",
    data: authorityView(status),
  };
  return value as unknown as Record<string, unknown>;
}

function subscribe() {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  const views: PassengerRideAuthorityView[] = [];
  const onError = vi.fn();
  const unsubscribe = subscribePassengerRideAuthority(
    "opaque-token",
    (view) => views.push(view),
    onError,
  );
  return {
    source: FakeEventSource.instances[0]!,
    views,
    onError,
    unsubscribe,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("passenger SSE stale-event rejection", () => {
  it("applies each envelope that advances the version", () => {
    const { source, views } = subscribe();

    source.emit("trip_started", envelope(1, "assigned"));
    source.emit("trip_started", envelope(2, "arrived_pickup"));
    source.emit("trip_started", envelope(3, "on_trip"));

    expect(views.map((view) => view.order.status)).toEqual([
      "assigned",
      "arrived_pickup",
      "on_trip",
    ]);
  });

  it("ignores an out-of-order envelope instead of rewinding ride state", () => {
    const { source, views, onError } = subscribe();

    source.emit("trip_started", envelope(3, "on_trip"));
    // Late delivery of an earlier event: it must not overwrite `on_trip`.
    source.emit("trip_started", envelope(2, "arrived_pickup"));
    source.emit("trip_started", envelope(1, "assigned"));

    expect(views).toHaveLength(1);
    expect(views[0]!.order.status).toBe("on_trip");
    // A stale event is a normal occurrence, not a stream failure.
    expect(onError).not.toHaveBeenCalled();
  });

  it("ignores a duplicate replay of the version already applied", () => {
    const { source, views } = subscribe();

    source.emit("trip_completed", envelope(4, "completed"));
    source.emit("trip_completed", envelope(4, "completed"));

    expect(views).toHaveLength(1);
  });

  it("tracks one sequence across every event name so a stale event on another channel is dropped", () => {
    const { source, views } = subscribe();

    source.emit("trip_started", envelope(5, "on_trip"));
    source.emit("driver_arrived", envelope(4, "arrived_pickup"));

    expect(views).toHaveLength(1);
    expect(views[0]!.order.status).toBe("on_trip");
  });

  it("rejects an envelope with no usable version rather than guessing it is newer", () => {
    expect(isFreshPassengerEvent({ eventVersion: 1 }, 0)).toBe(true);
    expect(isFreshPassengerEvent({ eventVersion: 1 }, 1)).toBe(false);
    expect(isFreshPassengerEvent({ eventVersion: 0 }, 0)).toBe(false);
    expect(
      isFreshPassengerEvent(
        { eventVersion: undefined as unknown as number },
        0,
      ),
    ).toBe(false);
    expect(isFreshPassengerEvent({ eventVersion: Number.NaN }, 0)).toBe(false);
    expect(
      isFreshPassengerEvent({ eventVersion: "9" as unknown as number }, 0),
    ).toBe(false);
  });

  it("reports malformed payloads through onError and keeps the applied version", () => {
    const { source, views, onError } = subscribe();

    source.emit("trip_started", envelope(2, "on_trip"));
    for (const listener of source.listeners.get("trip_started") ?? []) {
      listener({ data: "not-json" });
    }
    source.emit("trip_started", envelope(1, "assigned"));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(views).toHaveLength(1);
    expect(views[0]!.order.status).toBe("on_trip");
  });

  it("closes the stream on unsubscribe", () => {
    const { source, unsubscribe } = subscribe();

    unsubscribe();

    expect(source.closed).toBe(true);
  });
});

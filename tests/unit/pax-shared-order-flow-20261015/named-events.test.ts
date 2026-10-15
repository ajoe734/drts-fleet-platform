import { createRequire } from "node:module";
import { once } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import type { MessageEvent as NestMessageEvent } from "@nestjs/common";
import type { PassengerRideSseEventEnvelope } from "@drts/contracts";
import { subscribePassengerRideAuthority } from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import {
  NativePassengerSseParser,
  decodeNativePassengerRideEvent,
} from "../../../packages/passenger-client/src/native/ride-stream";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
} from "../pax-booking-history-20261009/production-booking-fixture";

const requireApi = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { SseStream } = requireApi("@nestjs/core/router/sse-stream");

class EventSourceTransport {
  static current: EventSourceTransport;
  listeners = new Map<string, (message: { data: string }) => void>();
  onopen?: () => void;
  onerror?: () => void;
  constructor(readonly url: string) {
    EventSourceTransport.current = this;
  }
  addEventListener(
    name: string,
    listener: (message: { data: string }) => void,
  ) {
    this.listeners.set(name, listener);
  }
  close() {}
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("first-party production cancellation emits a named Nest frame received by the real Web subscriber and Native decoder", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const f = createProductionBookingFixture();
  const created = await f.service.createRide(OWNER, f.command);
  const orderId = created.ride.order.orderId;
  await f.multi.cancelTrustedPassengerRide(orderId, OWNER);
  vi.stubGlobal("EventSource", EventSourceTransport);
  const web: PassengerRideSseEventEnvelope[] = [];
  const closeWeb = subscribePassengerRideAuthority(orderId, (event) =>
    web.push(event),
  );
  const native: PassengerRideSseEventEnvelope[] = [];
  const parser = new NativePassengerSseParser((frame) => {
    // The browser only dispatches named listeners for an explicit event field.
    EventSourceTransport.current.listeners.get(frame.event)?.({
      data: frame.data,
    });
    native.push(
      decodeNativePassengerRideEvent(JSON.parse(frame.data), orderId),
    );
  });
  const events: NestMessageEvent[] = [];
  const subscription = f.multi
    .streamTrustedPassengerEvents(orderId, OWNER)
    .subscribe((event) => events.push(event));
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toHaveLength(1);
    const stream = new SseStream();
    let bytes = "";
    stream.on("data", (chunk: Buffer) => {
      bytes += chunk.toString();
    });
    const ended = once(stream, "end");
    stream.end(events[0]);
    await ended;
    parser.push(bytes);
    expect(web.map((event) => event.eventType)).toEqual(["trip_cancelled"]);
    expect(native).toEqual(web);
    expect(bytes).toContain("event: trip_cancelled\n");
    expect(bytes).toContain("retry: 3000\n");
    expect(web[0].data.order).toMatchObject({ orderId, status: "cancelled" });
  } finally {
    subscription.unsubscribe();
    closeWeb();
  }
});

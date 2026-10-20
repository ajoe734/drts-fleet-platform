import { createRequire } from "node:module";
import { once } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import type { MessageEvent as NestMessageEvent } from "../../../apps/api/node_modules/@nestjs/common";
import type { PassengerRideSseEventEnvelope } from "@drts/contracts";
import { subscribePassengerRideAuthority } from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import {
  NativePassengerSseParser,
  NativePassengerRideStream,
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
    expect(web[0]!.data.order).toMatchObject({ orderId, status: "cancelled" });
  } finally {
    subscription.unsubscribe();
    closeWeb();
  }
});

it("Web reconnect accepts a new instance sequence and still rejects duplicates within that connection", () => {
  vi.stubGlobal("EventSource", EventSourceTransport);
  const received: number[] = [];
  const close = subscribePassengerRideAuthority("same-order", (event) =>
    received.push(event.eventVersion),
  );
  const es = EventSourceTransport.current;
  const deliver = (eventVersion: number) =>
    es.listeners.get("trip_started")!({
      data: JSON.stringify({ eventVersion, eventType: "trip_started" }),
    });
  try {
    es.onopen?.();
    deliver(41);
    deliver(40);
    es.onerror?.();
    es.onopen?.();
    deliver(1);
    deliver(1);
    deliver(2);
    expect(received).toEqual([41, 1, 2]);
  } finally {
    close();
  }
});

it("Native reconnect re-reads authority, accepts a restarted instance and fences old XHR callbacks", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const f = createProductionBookingFixture();
  const { ride } = await f.service.createRide(OWNER, f.command);
  const session = {
    generation: 1,
    tokens: { accessToken: "test", refreshToken: "test" },
  };
  const requests: ReturnType<typeof request>[] = [];
  function request() {
    return {
      readyState: 3,
      status: 200,
      responseText: "",
      onreadystatechange: null as (() => void) | null,
      onprogress: null as (() => void) | null,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
      open() {},
      setRequestHeader() {},
      send() {},
      abort() {},
      getResponseHeader: () => "text/event-stream",
    };
  }
  const getRide = vi.fn(async () => ({ ride }));
  const versions: number[] = [];
  const stream = new NativePassengerRideStream({
    baseUrl: "https://api.example.invalid",
    orderId: ride.order.orderId,
    client: { getRide } as never,
    session: { snapshot: async () => session },
    createRequest: () => {
      const xhr = request();
      requests.push(xhr);
      return xhr;
    },
    appState: { currentState: () => "active", subscribe: () => () => {} },
    onRide() {},
    onEvent: (event) => versions.push(event.eventVersion),
    onConnection() {},
    onError: (error) => {
      throw error;
    },
  });
  const deliver = async (xhr: ReturnType<typeof request>, version: number) => {
    xhr.responseText += `event: trip_started\ndata: ${JSON.stringify({
      eventId: `event-${version}`,
      eventType: "trip_started",
      eventVersion: version,
      assignmentVersion: 1,
      orderId: ride.order.orderId,
      occurredAt: new Date(NOW).toISOString(),
      data: ride,
    })}\n\n`;
    xhr.onprogress?.();
    for (let n = 0; n < 30; n++) await Promise.resolve();
  };
  try {
    await stream.start();
    await deliver(requests[0]!, 41);
    const obsolete = requests[0]!.onprogress;
    await stream.reconnect();
    expect(getRide).toHaveBeenCalledTimes(2);
    await deliver(requests[1]!, 1);
    await deliver(requests[1]!, 1);
    obsolete?.();
    await deliver(requests[1]!, 2);
    expect(versions).toEqual([41, 1, 2]);
  } finally {
    stream.stop();
  }
});

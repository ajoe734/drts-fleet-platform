/** @vitest-environment jsdom */
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MultiTaxiElectronicReceipt,
  PassengerRideAuthorityView,
  PassengerRideSseEventEnvelope,
} from "@drts/contracts";

import { PassengerRidePage } from "@/components/passenger-ride-page";

const token =
  "legacy-receipt-read-ordering-token-0000000000000000000000000000000000000000";
const orderId = "legacy-receipt-read-ordering-order";
const rideUrl = `/control-plane-proxy/passenger-rides/${token}`;
const receiptUrl = `${rideUrl}/receipt`;
const receiptNo = "RC-LEGACY-READ-ORDERING-001";

// External HTTP/SSE responses use the producer's snake_case wire shape. The
// actual legacy camelizer, event-version parser and authority mapper stay real.
function toWire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toWire);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      toWire(child),
    ]),
  );
}

type Listener = (event: Event) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Listener[]>();
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: Listener) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  emit(envelope: PassengerRideSseEventEnvelope) {
    const event = new MessageEvent<string>(envelope.eventType, {
      data: JSON.stringify(toWire(envelope)),
    });
    for (const listener of this.listeners.get(envelope.eventType) ?? []) {
      listener(event);
    }
  }

  close() {
    this.closed = true;
  }
}

function pendingAuthority(): PassengerRideAuthorityView {
  return {
    order: {
      orderId,
      orderNo: "LEGACY-READ-ORDERING-001",
      status: "completed",
      timingMode: "on_demand",
      requestedPickupAt: "2026-11-05T01:00:00.000Z",
      pickup: { address: "測試上車地點" },
      dropoff: { address: "測試下車地點" },
      cancelableUntil: null,
      cancelledAt: null,
      completedAt: "2026-11-05T01:40:00.000Z",
    },
    assignment: null,
    rating: null,
    payment: null,
    receipt: null,
    actions: {
      canCancel: false,
      canRate: false,
      canContact: false,
      canReadReceipt: true,
    },
  };
}

function legalReceipt(): MultiTaxiElectronicReceipt {
  return {
    receiptId: "legacy-read-ordering-receipt",
    orderId,
    receiptNo,
    amountMinor: 35500,
    currency: "TWD",
    issuedAt: "2026-11-05T01:45:00.000Z",
    record: {
      plateNo: "TEST-2201",
      pickupAt: "2026-11-05T01:10:00.000Z",
      dropoffAt: "2026-11-05T01:40:00.000Z",
      travelDurationSeconds: 1800,
      routeSummary: "測試上車地點至測試下車地點",
      distanceMeters: 6200,
      tollMinor: 2500,
      consumerServicePhone: "0800-090-000",
      authorityComplaintPhone: "1999",
    },
  };
}

function notReadyResponse() {
  return Response.json(
    { error: { code: "PASSENGER_RECEIPT_NOT_READY" } },
    { status: 404 },
  );
}

function availableResponse() {
  return Response.json({ data: toWire(legalReceipt()) });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type ReceiptReply = () => Response | Promise<Response>;

async function mountPendingReceipt(replies: ReceiptReply[]) {
  const initial = pendingAuthority();
  const calls: {
    url: string;
    method: string;
    cache: RequestInit["cache"];
  }[] = [];
  const settlements: ("http404" | "http200" | "transport_rejected")[] = [];
  const transport = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, cache: init?.cache });
      if (url === rideUrl && method === "GET") {
        return Response.json({ data: toWire(initial) });
      }
      if (url === receiptUrl && method === "GET") {
        const reply = replies.shift();
        if (!reply) throw new Error("Unexpected additional receipt GET");
        try {
          const response = await reply();
          settlements.push(response.status === 404 ? "http404" : "http200");
          return response;
        } catch (error) {
          settlements.push("transport_rejected");
          throw error;
        }
      }
      throw new Error(`Unexpected receipt ordering HTTP: ${method} ${url}`);
    },
  );
  vi.stubGlobal("fetch", transport);
  const mounted = render(
    React.createElement(PassengerRidePage, {
      token,
      kind: "receipt",
      searchParams: { mode: "live" },
    }),
  );
  await screen.findByText("乘車證明準備中");
  await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
  const source = FakeEventSource.instances[0]!;
  expect(source.url).toBe(`${rideUrl}/events`);
  expect(source.listeners.get("receipt_ready")).toHaveLength(1);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport).toHaveBeenCalledWith(rideUrl, { cache: "no-store" });
  return { ...mounted, initial, source, transport, calls, settlements };
}

function expectLegalCertificate() {
  expect(screen.getByText(receiptNo)).toBeTruthy();
  for (const label of [
    "乘車證明編號",
    "開立時間",
    "車號",
    "上車時間",
    "下車時間",
    "行駛時間",
    "路線",
    "行駛里程",
    "車資金額",
    "通行費",
    "客服電話",
    "主管機關申訴電話",
  ]) {
    expect(screen.getByText(label)).toBeTruthy();
  }
  expect(screen.getByText("TEST-2201")).toBeTruthy();
  expect(screen.getByText("測試上車地點至測試下車地點")).toBeTruthy();
  expect(screen.getByText("30 分鐘")).toBeTruthy();
  expect(screen.getByText("6.2 公里")).toBeTruthy();
  expect(screen.getByText("NT$ 355")).toBeTruthy();
  expect(screen.getByText("NT$ 25")).toBeTruthy();
  expect(screen.getByText("0800-090-000")).toBeTruthy();
  expect(screen.getByText("1999")).toBeTruthy();
  expect(screen.queryByText("乘車證明準備中")).toBeNull();
  expect(screen.queryByText("無法讀取完整乘車證明")).toBeNull();
}

async function emitNewReceipt(
  context: Awaited<ReturnType<typeof mountPendingReceipt>>,
) {
  const ready: PassengerRideAuthorityView = {
    ...context.initial,
    receipt: legalReceipt(),
  };
  const before = structuredClone(ready);
  const event: PassengerRideSseEventEnvelope = {
    eventId: "legacy-receipt-ready-2",
    eventType: "receipt_ready",
    eventVersion: 2,
    assignmentVersion: null,
    orderId,
    occurredAt: "2026-11-05T01:46:00.000Z",
    data: ready,
  };
  expect(ready.order.orderId).toBe(context.initial.order.orderId);
  expect(ready.receipt?.orderId).toBe(ready.order.orderId);
  await act(async () => context.source.emit(event));
  // Establish real available certificate before settling the older HTTP read.
  expectLegalCertificate();
  expect(ready).toEqual(before);
}

async function flushMicrotasks() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

async function settleHttp(
  waiting: ReturnType<typeof deferred<Response>>,
  response: Response,
) {
  // Native clone body consumption witnesses complete delivery, while the real
  // SDK consumes the original body. act flushes the resulting Card updates.
  const deliveredBody = response.clone().text();
  await act(async () => {
    waiting.resolve(response);
    await deliveredBody;
    await flushMicrotasks();
  });
  expect(response.bodyUsed).toBe(true);
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  FakeEventSource.instances = [];
});

describe("legacy receipt retry ordering through the actual Page and SSE", () => {
  it("keeps the newer legal receipt when an older not-ready HTTP read finishes after receipt_ready", async () => {
    const waiting = deferred<Response>();
    const context = await mountPendingReceipt([() => waiting.promise]);
    fireEvent.click(screen.getByRole("button", { name: "重新讀取乘車證明" }));
    await waitFor(() => expect(context.transport).toHaveBeenCalledTimes(2));
    expect(context.settlements).toEqual([]);
    await emitNewReceipt(context);

    await settleHttp(waiting, notReadyResponse());
    expect(context.settlements).toEqual(["http404"]);
    // This is after the actual stale404 body and real catch have settled, not
    // a findBy timeout or an assertion made while the old read is still held.
    expectLegalCertificate();
    expect(context.calls).toEqual([
      { url: rideUrl, method: "GET", cache: "no-store" },
      { url: receiptUrl, method: "GET", cache: "no-store" },
    ]);
    context.unmount();
    expect(context.source.closed).toBe(true);
  });

  it("keeps the newer legal receipt when an older receipt transport fails after receipt_ready", async () => {
    const waiting = deferred<Response>();
    const context = await mountPendingReceipt([() => waiting.promise]);
    fireEvent.click(screen.getByRole("button", { name: "重新讀取乘車證明" }));
    await waitFor(() => expect(context.transport).toHaveBeenCalledTimes(2));
    expect(context.settlements).toEqual([]);
    await emitNewReceipt(context);

    await act(async () => {
      waiting.reject(new TypeError("simulated receipt transport disconnect"));
      await flushMicrotasks();
    });
    expect(context.settlements).toEqual(["transport_rejected"]);
    expectLegalCertificate();
    expect(context.calls).toEqual([
      { url: rideUrl, method: "GET", cache: "no-store" },
      { url: receiptUrl, method: "GET", cache: "no-store" },
    ]);
    context.unmount();
    expect(context.source.closed).toBe(true);
  });

  it("keeps a current not-ready retry usable and then accepts its current successful receipt read", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const context = await mountPendingReceipt([
      () => first.promise,
      () => second.promise,
    ]);
    fireEvent.click(screen.getByRole("button", { name: "重新讀取乘車證明" }));
    await waitFor(() => expect(context.transport).toHaveBeenCalledTimes(2));
    await settleHttp(first, notReadyResponse());
    expect(context.settlements).toEqual(["http404"]);
    expect(screen.getByText("乘車證明準備中")).toBeTruthy();
    expect(screen.queryByText(receiptNo)).toBeNull();
    const retry = screen.getByRole("button", {
      name: "重新讀取乘車證明",
    }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);

    fireEvent.click(retry);
    await waitFor(() => expect(context.transport).toHaveBeenCalledTimes(3));
    await settleHttp(second, availableResponse());
    expect(context.settlements).toEqual(["http404", "http200"]);
    expectLegalCertificate();
    expect(context.calls).toEqual([
      { url: rideUrl, method: "GET", cache: "no-store" },
      { url: receiptUrl, method: "GET", cache: "no-store" },
      { url: receiptUrl, method: "GET", cache: "no-store" },
    ]);
    context.unmount();
    expect(context.source.closed).toBe(true);
  });
});

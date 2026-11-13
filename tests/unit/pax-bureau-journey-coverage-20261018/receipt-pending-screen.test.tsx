/** @vitest-environment jsdom */
import React from "react";
import { act } from "@testing-library/react";
import { PassengerRidePage } from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RideContent } from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import {
  fetchPassengerReceipt,
  mapPassengerRideAuthorityToFixture,
} from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import { authority } from "../pax-live-tracking-20261017/fixture";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("renders an owned unfinished receipt and retries real Card reads through not-ready, transport failure and recovery", async () => {
  const view = authority("on_trip");
  // The production owned authority permits receipt reads before production.
  view.actions.canReadReceipt = true;
  const original = structuredClone(view);
  const notReady = () =>
    Response.json(
      {
        error: {
          code: "PASSENGER_RECEIPT_NOT_READY",
          message: "The electronic receipt is not ready.",
        },
      },
      { status: 404 },
    );
  // Only HTTP transport is substituted. Actual mapper/Card/retry logic runs.
  const transport = vi
    .fn()
    .mockResolvedValueOnce(notReady())
    .mockRejectedValueOnce(new TypeError("synthetic network disconnect"))
    .mockResolvedValueOnce(notReady());
  vi.stubGlobal("fetch", transport);
  const fixture = mapPassengerRideAuthorityToFixture(
    view,
    view.order.orderId,
    "receipt",
  );
  render(
    <RideContent fixture={fixture} token={view.order.orderId} authMode="id" />,
  );
  expect(screen.getByText("乘車證明準備中")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "重新讀取乘車證明" }));
  await waitFor(() => {
    expect(transport).toHaveBeenCalledTimes(1);
    expect(
      (
        screen.getByRole("button", {
          name: "重新讀取乘車證明",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  expect(transport.mock.calls[0]![0]).toBe(
    "/api/passenger-app/rides/ETA-ORDER/receipt",
  );
  fireEvent.click(screen.getByRole("button", { name: "重新讀取乘車證明" }));
  await screen.findByText("無法讀取完整乘車證明");
  fireEvent.click(screen.getByRole("button", { name: "重試讀取" }));
  await screen.findByText("乘車證明準備中");
  expect(transport).toHaveBeenCalledTimes(3);
  expect(view).toEqual(original);
});

it("keeps the original receipt scope denial and offers no retry", () => {
  const view = authority("on_trip");
  const transport = vi.fn();
  vi.stubGlobal("fetch", transport);
  const fixture = mapPassengerRideAuthorityToFixture(
    view,
    view.order.orderId,
    "receipt",
  );
  render(
    <RideContent
      fixture={fixture}
      token={view.order.orderId}
      authMode="token"
    />,
  );
  expect(screen.getByText("無法讀取完整乘車證明")).toBeTruthy();
  expect(screen.getByText("PASSENGER_RECEIPT_SCOPE_FORBIDDEN")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /重新讀取乘車證明|重試讀取/ }),
  ).toBeNull();
  expect(transport).not.toHaveBeenCalled();
});

it("does not add a receipt certificate to the ordinary on-trip ride screen", () => {
  const view = authority("on_trip");
  view.actions.canReadReceipt = true;
  const fixture = mapPassengerRideAuthorityToFixture(
    view,
    view.order.orderId,
    "ride",
  );
  expect(fixture.screenId).toBe("P5-07");
  expect(fixture.certificate).toBeUndefined();
});

it("preserves the real client's receipt not-ready HTTP status and code", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "PASSENGER_RECEIPT_NOT_READY",
            message: "The electronic receipt is not ready.",
          },
        },
        { status: 404 },
      ),
    ),
  );
  await expect(fetchPassengerReceipt("ETA-ORDER")).rejects.toMatchObject({
    status: 404,
    code: "PASSENGER_RECEIPT_NOT_READY",
  });
});

it("keeps the newer same-order receipt authority when an older not-ready read finishes after receipt_ready", async () => {
  const initial = authority("completed");
  initial.actions = {
    canCancel: false,
    canRate: false,
    canContact: false,
    canReadReceipt: true,
  };
  initial.payment = {
    status: "captured",
    amount: { currency: "TWD", amountMinor: 30000 },
  };
  const original = structuredClone(initial);
  const available = structuredClone(initial);
  const base = `/api/passenger-app/rides/${initial.order.orderId}`;
  const htmlUrl = `${base}/receipt/artifacts/html`;
  const pdfUrl = `${base}/receipt/artifacts/pdf`;
  available.receipt = {
    receiptId: "WEB-SAME-ORDER-RECEIPT",
    orderId: initial.order.orderId,
    receiptNo: "WEB-RECEIPT-001",
    amountMinor: 30000,
    currency: "TWD",
    issuedAt: "2026-10-17T05:16:00Z",
    record: {
      tripId: "WEB-SAME-ORDER-TRIP",
      plateNo: "TEST-ETA",
      pickupAt: "2026-10-17T05:00:00Z",
      dropoffAt: "2026-10-17T05:15:00Z",
      travelDurationSeconds: 900,
      routeSummary: "Test pickup → Test dropoff",
      distanceMeters: 4000,
      tollMinor: 0,
      consumerServicePhone: "02-2944-0985",
      authorityComplaintPhone: "1999",
      certificateVersion: "1",
      certificateState: "available",
      htmlUrl,
      pdfUrl,
      generatedFrom: "owned_mobility_completion",
      e04Snapshot: {
        fleetOperatorName: "測試車隊",
        driverSurname: "測",
        driverRegistrationMasked: "TEST***01",
        paymentMethodDisplay: "測試信用卡 ••••0001",
        fareBreakdown: {
          startMinor: 10000,
          distanceMinor: 20000,
          delayMinor: 0,
          nightMinor: 0,
        },
      },
    },
  };

  class ReceiptEventSource {
    static instances: ReceiptEventSource[] = [];
    readonly listeners = new Map<string, (event: { data: string }) => void>();
    closed = false;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(readonly url: string) {
      ReceiptEventSource.instances.push(this);
    }
    addEventListener(
      name: string,
      listener: (event: { data: string }) => void,
    ) {
      this.listeners.set(name, listener);
    }
    close() {
      this.closed = true;
    }
    emit(name: string, data: unknown) {
      if (!this.closed)
        this.listeners.get(name)?.({ data: JSON.stringify(data) });
    }
  }
  vi.stubGlobal("EventSource", ReceiptEventSource);

  // This HTTP result is captured before receipt production; only its delivery
  // is held while the same completed order legitimately gains its receipt.
  const notReady = Response.json(
    {
      error: {
        code: "PASSENGER_RECEIPT_NOT_READY",
        message: "The electronic receipt is not ready.",
      },
    },
    { status: 404 },
  );
  let releaseNotReady!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseNotReady = resolve;
  });
  const calls: { url: string; method: string }[] = [];
  const transport = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url: String(url), method });
    if (String(url) === base && method === "GET") {
      return Response.json({ data: { ride: initial } });
    }
    if (String(url) === `${base}/receipt` && method === "GET") {
      await held;
      return notReady;
    }
    throw new Error(
      `Unexpected receipt regression HTTP: ${method} ${String(url)}`,
    );
  });
  vi.stubGlobal("fetch", transport);
  // The actual passengerFetch/PassengerClient path remains in live mode.
  window.localStorage.removeItem("drts.passenger.functional-demo.v1");

  const mounted = render(
    <PassengerRidePage
      token={initial.order.orderId}
      authMode="id"
      kind="receipt"
    />,
  );
  await screen.findByText("乘車證明準備中");
  await waitFor(() => expect(ReceiptEventSource.instances).toHaveLength(1));
  const source = ReceiptEventSource.instances[0]!;
  expect(source.url).toBe(`${base}/events`);
  fireEvent.click(screen.getByRole("button", { name: "重新讀取乘車證明" }));
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls).toEqual([
    { url: base, method: "GET" },
    { url: `${base}/receipt`, method: "GET" },
  ]);

  await act(async () => {
    source.emit("receipt_ready", {
      eventId: "WEB-RECEIPT-READY-2",
      eventType: "receipt_ready",
      eventVersion: 2,
      assignmentVersion: available.assignment?.assignmentVersion ?? null,
      orderId: initial.order.orderId,
      occurredAt: "2026-10-17T05:16:00Z",
      data: available,
    });
  });
  expect(screen.getByText("證明編號 WEB-••-001 · 個資已遮碼")).toBeTruthy();
  expect(screen.queryByText("WEB-RECEIPT-001")).toBeNull();
  expect(screen.queryByRole("link", { name: "下載 HTML" })).toBeNull();
  expect(
    screen.getByRole("link", { name: "下載 PDF" }).getAttribute("href"),
  ).toBe(pdfUrl);
  expect(screen.queryByText("乘車證明準備中")).toBeNull();

  await act(async () => {
    releaseNotReady();
    await held;
  });
  expect(screen.getByText("證明編號 WEB-••-001 · 個資已遮碼")).toBeTruthy();
  expect(screen.queryByText("WEB-RECEIPT-001")).toBeNull();
  expect(screen.queryByRole("link", { name: "下載 HTML" })).toBeNull();
  expect(
    screen.getByRole("link", { name: "下載 PDF" }).getAttribute("href"),
  ).toBe(pdfUrl);
  expect(screen.queryByText("乘車證明準備中")).toBeNull();
  expect(transport).toHaveBeenCalledTimes(2);
  expect(initial).toEqual(original);
  mounted.unmount();
  expect(source.closed).toBe(true);
});

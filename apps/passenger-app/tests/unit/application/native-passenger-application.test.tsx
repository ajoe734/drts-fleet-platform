import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  FetchOptions,
  FetchResponse,
  NativePassengerTokenPair,
  NativePassengerStreamRequest,
  NativePassengerBinaryRequest,
} from "@drts/passenger-client";
import type { PassengerRideAuthorityView } from "@drts/contracts";
vi.mock("react-native", () => ({
  View: "View",
  ScrollView: "ScrollView",
  Text: "Text",
  Pressable: "Pressable",
  TextInput: "TextInput",
  Modal: "Modal",
  Switch: "Switch",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: <T,>(styles: T) => styles },
}));
import { NativePassengerApplication } from "../../../components/application/native-passenger-application";
import {
  NativePassengerRuntime,
  type NativePassengerRuntimeOptions,
} from "../../../lib/native-passenger-runtime";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const rendered: any[] = [];
afterEach(async () => {
  await act(() => {
    for (const r of rendered.splice(0)) r.unmount();
  });
});
const BASE = "https://composition.example.invalid";
const NOW = Date.parse("2026-10-14T16:00:00.000Z");
const PAIR = {
  accessToken: "fixture-access-A",
  refreshToken: "fixture-refresh-A",
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function flush() {
  for (let i = 0; i < 40; ++i) await Promise.resolve();
}
function snake(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snake);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [
      key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
      snake(v),
    ]),
  );
}
function reply(status: number, data: unknown): FetchResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
function success(data: unknown) {
  return reply(200, { data: snake(data) });
}
function fault(status: number, code: string) {
  return reply(status, { error: { code } });
}
function ride(
  id = "one",
  status: PassengerRideAuthorityView["order"]["status"] = "created",
): PassengerRideAuthorityView {
  return {
    order: {
      orderId: id,
      orderNo: `DEMO-${id}`,
      status,
      timingMode: "scheduled",
      requestedPickupAt: "2099-10-11T12:00:00Z",
      pickup: { address: "示意起點" },
      dropoff: { address: "示意終點" },
      completedAt: status === "completed" ? "2026-10-14T16:20:00Z" : null,
      cancelledAt: status === "cancelled" ? "2026-10-14T16:00:00Z" : null,
      cancelableUntil: null,
    },
    assignment: null,
    rating: null,
    payment: null,
    receipt: null,
    actions: {
      canCancel: status === "created",
      canRate: false,
      canContact: false,
      canReadReceipt: false,
    },
  };
}
function withReceipt(id = "one"): PassengerRideAuthorityView {
  const view = ride(id, "completed");
  view.actions.canReadReceipt = true;
  view.receipt = {
    receiptId: "fixture-receipt",
    orderId: id,
    receiptNo: "DEMO-RECEIPT",
    amountMinor: 20000,
    currency: "TWD",
    issuedAt: "2026-10-14T16:20:00Z",
    record: {
      plateNo: "DEMO-7788",
      pickupAt: "2026-10-14T16:00:00Z",
      dropoffAt: "2026-10-14T16:20:00Z",
      travelDurationSeconds: 1200,
      routeSummary: "示意起點到終點",
      distanceMeters: 5000,
      tollMinor: 0,
      consumerServicePhone: "02-2944-0985",
      authorityComplaintPhone: "DEMO-AUTHORITY",
      e04Snapshot: {
        fleetOperatorName: "示意業者",
        driverSurname: "示意姓氏",
        driverRegistrationMasked: "DEMO***88",
        paymentMethodDisplay: "示意卡片",
        fareBreakdown: {
          startMinor: 8500,
          distanceMinor: 11500,
          delayMinor: 0,
          nightMinor: 0,
        },
      },
    },
  };
  return view;
}
class StreamRequest implements NativePassengerStreamRequest {
  readyState = 1;
  status = 0;
  responseText = "";
  url = "";
  headers: Record<string, string> = {};
  aborted = 0;
  onreadystatechange: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader() {
    return "text/event-stream";
  }
  send() {}
  abort() {
    ++this.aborted;
    this.onabort?.();
  }
  event(view: PassengerRideAuthorityView, version: number) {
    this.readyState = 3;
    this.status = 200;
    this.responseText += `data: ${JSON.stringify(snake({ eventId: `event-${version}`, eventType: "trip_cancelled", eventVersion: version, assignmentVersion: null, orderId: view.order.orderId, occurredAt: "2026-10-14T16:00:00Z", data: view }))}\n\n`;
    this.onprogress?.();
  }
}
class BinaryRequest implements NativePassengerBinaryRequest {
  status = 200;
  response: unknown = new Uint8Array([60, 104, 116, 109, 108, 62]).buffer;
  responseType = "";
  url = "";
  headers: Record<string, string> = {};
  aborted = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader(name: string) {
    return name === "Content-Type"
      ? "text/html"
      : 'attachment; filename="demo-receipt.html"';
  }
  send() {
    this.onload?.();
  }
  abort() {
    ++this.aborted;
    this.onabort?.();
  }
}
function fixture(
  handler: (
    url: string,
    options?: FetchOptions,
  ) => Promise<FetchResponse | undefined> = async () => undefined,
  storedPair: NativePassengerTokenPair | null = PAIR,
) {
  let stored = storedPair ? { ...storedPair } : null;
  const state = {
    account: {
      drtsPassengerId: "fixture-A",
      displayName: "示意甲",
      contactPhone: "+886900000000",
      contactPhoneVerified: false,
      feeAcknowledgementVersion: "fixture-fare",
      status: "active",
      createdAt: "2026-10-14T00:00:00Z",
    },
    views: [ride()],
    loginPair: PAIR,
  };
  const calls: Array<{ url: string; options: FetchOptions | undefined }> = [];
  const store = {
    read: vi.fn(async () => stored),
    write: vi.fn(async (value: NativePassengerTokenPair) => {
      stored = { ...value };
    }),
    clear: vi.fn(async () => {
      stored = null;
    }),
  };
  const fetchFn = async (
    url: string,
    options?: FetchOptions,
  ): Promise<FetchResponse> => {
    calls.push({ url, options });
    const controlled = await handler(url, options);
    if (controlled) return controlled;
    if (url.endsWith("/auth/providers"))
      return success({ providers: ["email"] });
    if (url.endsWith("/auth/otp/request"))
      return success({
        success: true,
        challenge: "fixture-challenge",
        message: "示意訊息",
      });
    if (url.endsWith("/auth/otp/verify"))
      return success({ result: "logged_in", ...state.loginPair });
    if (url.endsWith("/auth/logout")) return success({ success: true });
    if (url.endsWith("/me") && options?.method === "DELETE")
      return success({ success: true });
    if (url.endsWith("/me") && options?.method === "PATCH") {
      state.account = { ...state.account, ...JSON.parse(options.body ?? "{}") };
      return success({ account: state.account });
    }
    if (url.endsWith("/me")) return success({ account: state.account });
    if (url.endsWith("/fares"))
      return success({
        currentVersion: {
          version: "fixture-fare",
          effectiveAt: "2023-04-01T00:00:00Z",
          baseFare: 85,
          baseDistanceMeters: 1250,
          distanceRate: 5,
          distanceIncrementMeters: 200,
          delayRate: 5,
          delayIncrementSeconds: 60,
          nightSurcharge: 20,
          nightSurchargeWindowStart: "23:00",
          nightSurchargeWindowEnd: "06:00",
          additionalFees: {},
        },
      });
    if (url.endsWith("/settings"))
      return success({ minLeadTimeMinutes: 30, requireSmsVerification: false });
    if (url.endsWith("/payment-methods"))
      return success({
        methods: [
          {
            paymentMethodId: "card-A",
            last4: "1111",
            cardType: "VISA",
            expiryMonth: "12",
            expiryYear: "2099",
            isDefault: true,
          },
        ],
      });
    if (url.includes("/api/geo/search?")) {
      const pickup = url.includes("Pickup");
      return success({
        candidates: [
          {
            candidateId: pickup ? "pick" : "drop",
            provider: "fixture-geo",
            displayName: pickup ? "示意起點" : "示意終點",
            address: pickup ? "示意起點" : "示意終點",
            confidence: "exact",
            location: {
              lat: pickup ? 25.01 : 25.02,
              lng: pickup ? 121.01 : 121.02,
            },
          },
        ],
        provider: "fixture-geo",
        generatedAt: new Date(NOW).toISOString(),
      });
    }
    if (url.endsWith("/api/geo/resolve")) {
      const body = JSON.parse(options?.body ?? "{}");
      return success({
        address: {
          address: body.addressText,
          ...body.selectedPoint,
          coordinateSource: "provider_candidate",
          geocodeConfidence: "exact",
          resolvedAt: new Date(NOW).toISOString(),
        },
        provider: "fixture-geo",
        resolvedAt: new Date(NOW).toISOString(),
      });
    }
    if (url.endsWith("/quotes"))
      return success({
        serviceAreaResult: "serviceable",
        estimatedMin: 200,
        estimatedMax: 300,
        fareVersion: "fixture-fare",
        fareSnapshotId: "fixture-quote",
        expiresAt: new Date(NOW + 300000).toISOString(),
      });
    if (url.endsWith("/rides") && options?.method === "POST") {
      const created = ride("created");
      state.views = [created];
      return success({ ride: created });
    }
    if (url.includes("/rides?")) return success({ rides: state.views });
    if (url.endsWith("/receipt/downloads"))
      return success({
        receiptUrl: "/api/passenger-app/rides/one/receipt/artifacts/html",
        htmlUrl: "/api/passenger-app/rides/one/receipt/artifacts/html",
        certificateId: "fixture-receipt",
        orderId: "one",
      });
    if (url.endsWith("/cancel")) {
      state.views = [ride("one", "cancelled")];
      return success({ success: true });
    }
    if (url.endsWith("/complaints"))
      return success({ complaintId: "fixture-case" });
    if (/\/rides\/[^/]+$/.test(url)) {
      const id = url.split("/").at(-1);
      return success({
        ride: state.views.find((view) => view.order.orderId === id) ?? ride(id),
      });
    }
    throw new Error(`Unexpected fixture URL: ${url}`);
  };
  const options: NativePassengerRuntimeOptions = {
    baseUrl: BASE,
    mode: "demo",
    callbackUri: "drtspassenger://auth/callback",
    fetchFn,
    store,
    browser: { status: "unavailable" },
    paymentFields: { status: "unavailable" },
    paymentBrowser: { status: "unavailable" },
    bookingMap: { status: "unavailable" },
    newRequestId() {
      expect(this.baseUrl).toBe(BASE);
      return "fixture-request-1";
    },
    now: () => NOW,
    demoOtpHint: "123456",
  };
  return {
    state,
    calls,
    store,
    options,
    stored: () => stored,
    persist: (pair: NativePassengerTokenPair) => {
      stored = { ...pair };
    },
  };
}
async function mount(
  f: ReturnType<typeof fixture>,
  extra: Partial<NativePassengerRuntimeOptions> = {},
) {
  const runtime = new NativePassengerRuntime({ ...f.options, ...extra });
  let r: any;
  await act(async () => {
    r = create(<NativePassengerApplication runtime={runtime} />);
    await flush();
  });
  rendered.push(r);
  return { r, runtime };
}
async function press(r: any, id: string) {
  await act(async () => {
    await r.root.findByProps({ testID: id }).props.onPress();
    await flush();
  });
}
async function enter(r: any, id: string, value: string) {
  await act(() => {
    r.root.findByProps({ testID: id }).props.onChangeText(value);
  });
}
function present(r: any, id: string) {
  return r.root.findAllByProps({ testID: id }).length > 0;
}
function text(r: any, id: string) {
  return r.root.findByProps({ testID: id }).children.join("");
}
async function login(r: any) {
  await enter(r, "auth-target", "fixture@example.invalid");
  await press(r, "auth-request-otp");
  await enter(r, "auth-code", "123456");
  await press(r, "auth-verify-otp");
}

describe("Native application composition through production components/SDK and only external fixtures", () => {
  it("restores once, navigates home/history/P5/payment/account, signs out then replaces clients for the next account", async () => {
    const f = fixture();
    const { r, runtime } = await mount(f);
    const firstClient = runtime.passenger;
    expect(present(r, "booking-reservation-only")).toBe(true);
    expect(f.store.read).toHaveBeenCalledTimes(1);
    await press(r, "app-nav-history");
    await press(r, "history-open-one");
    expect(present(r, "native-p5-screen")).toBe(true);
    expect(present(r, "app-events-skipped")).toBe(true);
    await press(r, "app-nav-payment");
    expect(present(r, "payment-method-card-A")).toBe(true);
    await press(r, "app-nav-account");
    await press(r, "account-logout");
    expect(present(r, "app-login")).toBe(true);
    expect(f.stored()).toBeNull();
    const logout = f.calls.find((call) => call.url.endsWith("/auth/logout"));
    expect(JSON.parse(logout?.options?.body ?? "{}")).toEqual({
      refreshToken: PAIR.refreshToken,
    });
    f.state.account = {
      ...f.state.account,
      drtsPassengerId: "fixture-B",
      displayName: "示意乙",
    };
    f.state.loginPair = {
      accessToken: "fixture-access-B",
      refreshToken: "fixture-refresh-B",
    };
    await login(r);
    expect(text(r, "app-account-label")).toBe("示意乙");
    expect(runtime.passenger).not.toBe(firstClient);
    await press(r, "app-nav-history");
    expect(f.calls.at(-1)?.options?.headers?.Authorization).toBe(
      "Bearer fixture-access-B",
    );
    expect(present(r, "app-demo-banner")).toBe(true);
  });
  it("awaits cold-login token persistence before me/home, edits account then deletes with local cleanup and login routing", async () => {
    const f = fixture(undefined, null);
    const started = deferred();
    const release = deferred();
    f.store.write.mockImplementationOnce(async (pair) => {
      started.resolve();
      await release.promise;
      f.persist(pair);
    });
    const { r } = await mount(f);
    await enter(r, "auth-target", "fixture@example.invalid");
    await press(r, "auth-request-otp");
    await enter(r, "auth-code", "123456");
    let operation!: Promise<void>;
    await act(async () => {
      operation = r.root
        .findByProps({ testID: "auth-verify-otp" })
        .props.onPress();
      await started.promise;
    });
    expect(f.calls.some((call) => call.url.endsWith("/me"))).toBe(false);
    await act(async () => {
      release.resolve();
      await operation;
      await flush();
    });
    expect(present(r, "booking-reservation-only")).toBe(true);
    await press(r, "app-nav-account");
    await enter(r, "account-name", "更新名稱");
    await press(r, "account-save");
    expect(text(r, "app-account-label")).toBe("更新名稱");
    await press(r, "account-open-delete");
    await press(r, "account-confirm-delete");
    expect(f.stored()).toBeNull();
    expect(present(r, "app-login")).toBe(true);
    expect(text(r, "app-session-message")).toContain("帳號已刪除");
    expect(
      f.calls.filter((call) => call.options?.method === "DELETE"),
    ).toHaveLength(1);
    expect(f.calls.some((call) => call.url.endsWith("/auth/logout"))).toBe(
      false,
    );
  });
  it("routes rejected refresh to login while a normal session refresh rotates before retrying owned history", async () => {
    let history = 0;
    const f = fixture(async (url) => {
      if (url.includes("/rides?") && ++history === 1)
        return fault(401, "unauthorized");
      if (url.endsWith("/auth/refresh"))
        return success({
          accessToken: "fixture-rotated",
          refreshToken: "fixture-rotated-refresh",
        });
      return undefined;
    });
    const { r } = await mount(f);
    await press(r, "app-nav-history");
    expect(present(r, "history-row-one")).toBe(true);
    expect(f.stored()?.accessToken).toBe("fixture-rotated");
    expect(f.calls.at(-1)?.options?.headers?.Authorization).toBe(
      "Bearer fixture-rotated",
    );
    const expired = fixture(async (url) =>
      url.endsWith("/me")
        ? fault(401, "unauthorized")
        : url.endsWith("/auth/refresh")
          ? fault(400, "invalid_grant")
          : undefined,
    );
    const second = await mount(expired);
    expect(present(second.r, "app-login")).toBe(true);
    expect(expired.stored()).toBeNull();
    expect(text(second.r, "app-session-message")).toContain("登入已失效");
  });
  it("keeps a live account on a protected403 and retries original screen behavior without refresh/logout", async () => {
    const f = fixture(async (url) =>
      url.includes("/rides?") ? fault(403, "forbidden") : undefined,
    );
    const { r, runtime } = await mount(f);
    await press(r, "app-nav-history");
    expect(present(r, "history-error")).toBe(true);
    expect(runtime.getSnapshot().phase).toBe("active");
    expect(f.stored()).toEqual(PAIR);
    expect(
      f.calls.some(
        (call) =>
          call.url.endsWith("/auth/refresh") ||
          call.url.endsWith("/auth/logout"),
      ),
    ).toBe(false);
  });
  it("applies an actual incremental stream frame to terminal P5, then closes XHR/listeners on navigation", async () => {
    const f = fixture();
    const requests: StreamRequest[] = [];
    const listeners = new Set<(state: string) => void>();
    const events = {
      createRequest() {
        expect(this).toBe(events);
        const request = new StreamRequest();
        requests.push(request);
        return request;
      },
      appState: {
        currentState: () => "active",
        subscribe: (listener: (state: string) => void) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      },
    };
    const { r } = await mount(f, { events });
    await press(r, "app-nav-history");
    await press(r, "history-open-one");
    expect(requests[0]?.url).toBe(`${BASE}/api/passenger-app/rides/one/events`);
    expect(requests[0]?.headers.Authorization).toBe(
      `Bearer ${PAIR.accessToken}`,
    );
    await act(async () => {
      requests[0]!.event(ride("one", "cancelled"), 2);
      await flush();
    });
    expect(present(r, "native-cancelled-card")).toBe(true);
    expect(present(r, "native-cancel-ride")).toBe(false);
    await press(r, "app-nav-account");
    expect(requests[0]?.aborted).toBe(1);
    expect(listeners.size).toBe(0);
    await press(r, "account-logout");
    expect(present(r, "app-login")).toBe(true);
  });
  it("joins true authority/authorized download metadata and writes actual binary-port bytes before opening a local file", async () => {
    const f = fixture();
    f.state.views = [withReceipt()];
    const binary: BinaryRequest[] = [];
    const files = {
      write: vi.fn(async () => "file:///demo-receipt.html"),
      remove: vi.fn(async () => {}),
      open: vi.fn(async () => {}),
    };
    const receipts = {
      createRequest() {
        expect(this).toBe(receipts);
        const xhr = new BinaryRequest();
        binary.push(xhr);
        return xhr;
      },
      files,
    };
    const { r } = await mount(f, { receipts });
    await press(r, "app-nav-history");
    await press(r, "history-open-one");
    expect(present(r, "native-download-html")).toBe(true);
    expect(present(r, "native-download-pdf")).toBe(false);
    await press(r, "native-download-html");
    expect(binary[0]?.url).toBe(
      `${BASE}/api/passenger-app/rides/one/receipt/artifacts/html`,
    );
    expect(binary[0]?.headers.Authorization).toBe(`Bearer ${PAIR.accessToken}`);
    expect(files.write).toHaveBeenCalledWith({
      fileName: "demo-receipt.html",
      contentType: "text/html",
      bytes: new Uint8Array([60, 104, 116, 109, 108, 62]),
    });
    expect(files.open).toHaveBeenCalledExactlyOnceWith(
      "file:///demo-receipt.html",
      "text/html",
    );
  });
  it("keeps a newly selected payment screen when an older owned-detail request finishes", async () => {
    const gate = deferred();
    const f = fixture(async (url) => {
      if (url.endsWith("/rides/one")) await gate.promise;
      return undefined;
    });
    const { r } = await mount(f);
    await press(r, "app-nav-history");
    let opening!: Promise<void>;
    await act(async () => {
      opening = r.root
        .findByProps({ testID: "history-open-one" })
        .props.onPress();
      await flush();
    });
    await press(r, "app-nav-payment");
    await act(async () => {
      gate.resolve();
      await opening;
      await flush();
    });
    expect(present(r, "payment-method-card-A")).toBe(true);
    expect(present(r, "app-ride")).toBe(false);
  });
  it("does not subscribe an older receipt view after another owned ride has been opened", async () => {
    const gate = deferred();
    const f = fixture(async (url) => {
      if (url.endsWith("/rides/one/receipt/downloads")) await gate.promise;
      return undefined;
    });
    f.state.views = [withReceipt("one"), ride("two")];
    const requests: StreamRequest[] = [];
    const { r } = await mount(f, {
      events: {
        createRequest: () => {
          const request = new StreamRequest();
          requests.push(request);
          return request;
        },
        appState: { currentState: () => "active", subscribe: () => () => {} },
      },
    });
    await press(r, "app-nav-history");
    let opening!: Promise<void>;
    await act(async () => {
      opening = r.root
        .findByProps({ testID: "history-open-one" })
        .props.onPress();
      await flush();
    });
    await press(r, "app-nav-history");
    await press(r, "history-open-two");
    await act(async () => {
      gate.resolve();
      await opening;
      await flush();
    });
    expect(requests.map((xhr) => xhr.url)).toEqual([
      `${BASE}/api/passenger-app/rides/two/events`,
    ]);
  });
  it("creates through real selected-address booking SDK and opens the created P5, then submits its existing lost-item command", async () => {
    const f = fixture();
    const { r } = await mount(f);
    for (const [field, query, id] of [
      ["origin", "Pickup", "pick"],
      ["destination", "Dropoff", "drop"],
    ] as const) {
      await enter(r, `booking-${field}-query`, query);
      await press(r, `booking-${field}-search`);
      await press(r, `booking-${field}-candidate-${id}`);
    }
    await enter(r, "booking-time", "2099-10-11T12:00");
    await press(r, "booking-quote");
    await press(r, "booking-confirm-checkbox");
    await press(r, "booking-submit");
    expect(present(r, "app-ride")).toBe(true);
    const created = f.calls.filter(
      (call) => call.url.endsWith("/rides") && call.options?.method === "POST",
    );
    expect(created).toHaveLength(1);
    expect(created[0]?.options?.headers?.["x-request-id"]).toBe(
      "fixture-request-1",
    );
    expect(JSON.parse(created[0]?.options?.body ?? "{}").fareSnapshotId).toBe(
      "fixture-quote",
    );
    await press(r, "native-open-lost-item");
    await enter(r, "app-lost-item", "示意雨傘");
    await enter(r, "app-support-content", "示意申報內容");
    await act(() =>
      r.root
        .findByProps({ testID: "app-support-consent" })
        .props.onValueChange(true),
    );
    await press(r, "app-support-submit");
    const complaint = f.calls.find((call) =>
      call.url.endsWith("/rides/created/complaints"),
    );
    expect(JSON.parse(complaint?.options?.body ?? "{}")).toEqual({
      rideId: "created",
      category: "lost_item",
      lostItemDescription: "示意雨傘",
      content: "示意申報內容",
      contactConsent: true,
    });
    expect(complaint?.options?.headers?.["idempotency-key"]).toBe(
      "fixture-request-1",
    );
    expect(text(r, "app-support-success")).toContain("fixture-case");
  });
});

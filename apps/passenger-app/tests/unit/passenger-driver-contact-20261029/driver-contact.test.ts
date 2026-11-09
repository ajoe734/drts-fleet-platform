import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PassengerDispatchDisclosureSnapshot } from "@drts/contracts";
import type {
  FetchOptions,
  FetchResponse,
  NativePassengerRideAuthority,
} from "@drts/passenger-client";

// Match the Native package resolution, rather than an absent root RN package.
vi.mock("react-native", () => ({
  View: "View",
  ScrollView: "ScrollView",
  Text: "Text",
  Pressable: "Pressable",
  TextInput: "TextInput",
  Modal: "Modal",
  Switch: "Switch",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: <T>(styles: T) => styles },
}));
import { NativePassengerApplication } from "../../../components/application/native-passenger-application";
import { NativePassengerRuntime } from "../../../lib/native-passenger-runtime";

// Keep the real Native package's React/renderer pair when the original root
// Vitest runner discovers this unit. No alias or product module is replaced.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const nativeRequire = createRequire(path.join(root, "package.json"));
const React: typeof import("react") = nativeRequire("react");
// The accepted Native renderer is a JavaScript dependency; use its real
// package entry, without introducing a declaration shim for the root unit.
const { act, create } = nativeRequire("react-test-renderer");
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const rendered: Array<ReturnType<typeof create>> = [];
afterEach(async () => {
  await act(() => {
    for (const page of rendered.splice(0)) page.unmount();
  });
});
const BASE = "https://native-contact.example.invalid";
const ORDER = "ORDER";
const PROXY = "tel:+886900000101";
const SUPPORT = "tel:+886290000202";
function reply(status: number, data: unknown): FetchResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
const masked = () =>
  reply(200, {
    data: {
      mode: "masked_call",
      contact_uri: PROXY,
      expires_at: "2099-10-29T16:00:00Z",
      unavailable_reason: null,
    },
  });
function deferred() {
  let resolve!: (response: FetchResponse) => void;
  const promise = new Promise<FetchResponse>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function flush() {
  for (let i = 0; i < 30; ++i) await Promise.resolve();
}

function assignment(): PassengerDispatchDisclosureSnapshot {
  return {
    snapshotId: "SNAPSHOT",
    runtimeProfileCode: "multi_taxi_direct",
    orderId: "ORDER",
    bookingId: null,
    dispatchJobId: "JOB",
    assignmentId: "ASSIGNMENT",
    assignmentVersion: 1,
    vehicle: {
      vehicleId: "VEHICLE",
      make: "Captured make",
      model: "Captured model",
      plateNo: "TEST-001",
      modelYear: 2025,
      doorCount: 4,
      color: "Captured color",
      profileVersion: 7,
    },
    driver: {
      driverId: "DRIVER",
      displayName: "Captured driver",
      registrationMaskedDisplay: "TEST***01",
      registrationStatus: "verified_active",
      registrationEffectiveUntil: "2027-01-01T00:00:00Z",
      credentialVersion: 9,
    },
    rating: {
      displayState: "rated",
      averageRating: 4.8,
      ratingCount: 17,
      aggregateVersion: 4,
    },
    eta: {
      minutes: 5,
      calculatedAt: "2026-10-14T13:29:55Z",
      locationFreshness: "fresh",
    },
    routeFare: {
      routeSnapshotId: "ROUTE",
      quoteSnapshotId: "QUOTE",
      orderId: "ORDER",
      pickup: {
        address: "Captured pickup",
        lat: 25,
        lng: 121,
        coordinateSource: "manual_pin",
        geocodeConfidence: "manual",
        resolvedAt: "2026-10-14T12:58:00Z",
      },
      dropoff: {
        address: "Captured dropoff",
        lat: 25.1,
        lng: 121.1,
        coordinateSource: "manual_pin",
        geocodeConfidence: "manual",
        resolvedAt: "2026-10-14T12:58:00Z",
      },
      estimatedDistanceMeters: 4321,
      estimatedDurationSeconds: 789,
      encodedPolyline: null,
      chargingMode: "meter_estimate",
      estimatedFareMinor: 32100,
      payableFareMinor: 30000,
      currency: "TWD",
      farePolicyId: "POLICY",
      farePolicyVersion: "7",
      fareChangeRuleId: "RULE",
      fareChangeRuleVersion: "2",
      fareChangeRuleDisplayText: "Captured fee rule",
      passengerConfirmedAt: "2026-10-14T13:00:00Z",
      generatedAt: "2026-10-14T12:59:00Z",
    },
    createdAt: "2026-10-14T13:10:00Z",
    supersededAt: null,
  };
}

function authority(): NativePassengerRideAuthority {
  return {
    order: {
      orderId: "ORDER",
      orderNo: "ORD-CAPTURED-77",
      status: "assigned",
      timingMode: "scheduled",
      requestedPickupAt: "2026-10-14T13:00:00Z",
      pickup: { address: "Original pickup" },
      dropoff: { address: "Original dropoff" },
      cancelableUntil: null,
      cancelledAt: null,
      completedAt: null,
    },
    assignment: assignment(),
    rating: null,
    payment: null,
    receipt: null,
    actions: {
      canCancel: true,
      canRate: false,
      canContact: true,
      canReadReceipt: false,
    },
  };
}

type ContactReply = () => Promise<FetchResponse>;
async function world(responses: ContactReply[], view = authority()) {
  let currentView = view;
  const calls: Array<{ url: string; options: FetchOptions | undefined }> = [];
  const telephone = vi.fn(async () => {});
  const runtime = new NativePassengerRuntime({
    baseUrl: BASE,
    mode: "configured",
    callbackUri: "drtspassenger://auth/callback",
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/me"))
        return reply(200, {
          data: {
            account: {
              drts_passenger_id: "fixture-passenger",
              display_name: "示意乘客",
              contact_phone: "+886900000000",
              contact_phone_verified: false,
              fee_acknowledgement_version: null,
              status: "active",
              created_at: "2026-10-29T00:00:00Z",
            },
          },
        });
      if (url.endsWith("/contact")) {
        const response = responses.shift();
        if (!response) throw new Error("Unexpected contact request");
        return response();
      }
      if (url.endsWith("/rides/" + view.order.orderId))
        return reply(200, { data: { ride: currentView } });
      throw new Error("Unexpected request: " + url);
    },
    store: {
      read: async () => ({
        accessToken: "native-contact-token",
        refreshToken: "native-contact-refresh",
      }),
      write: async () => {},
      clear: async () => {},
    },
    browser: { status: "unavailable" },
    paymentFields: { status: "unavailable" },
    paymentBrowser: { status: "unavailable" },
    bookingMap: { status: "unavailable" },
    now: () => Date.parse("2026-10-29T15:00:00Z"),
    newRequestId: () => "native-contact-request",
    telephone: { open: telephone },
  });
  await runtime.start();
  await runtime.openRide(view);
  let page!: ReturnType<typeof create>;
  await act(async () => {
    page = create(React.createElement(NativePassengerApplication, { runtime }));
    await flush();
  });
  rendered.push(page);
  const buttons = (id: string) =>
    page.root.findAll(
      (n: { type: unknown; props: { testID?: string } }) =>
        typeof n.type === "string" && n.props.testID === id,
    );
  async function press(id: string) {
    const matches = buttons(id);
    expect(matches).toHaveLength(1);
    await act(async () => {
      await matches[0]!.props.onPress();
      await flush();
    });
  }
  const contactCalls = () => calls.filter((c) => c.url.endsWith("/contact"));
  const text = () => JSON.stringify(page.toJSON());
  return {
    runtime,
    page,
    buttons,
    press,
    contactCalls,
    telephone,
    text,
    replaceServerRide(next: NativePassengerRideAuthority) {
      currentView = next;
    },
  };
}

describe("Native same-order Driver contact normal UI and SDK", () => {
  it("requests the same order through real Runtime/SDK, then explicitly opens only the returned proxy", async () => {
    const w = await world([async () => masked()]);
    expect(w.runtime.getSnapshot().presentation?.fixture.actionMode).toBe(
      "driver_contact_ready",
    );
    await w.press("native-contact-driver");
    expect(w.contactCalls()).toEqual([
      {
        url: BASE + "/api/passenger-app/rides/" + ORDER + "/contact",
        options: {
          method: "POST",
          body: "{}",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer native-contact-token",
          },
        },
      },
    ]);
    expect(w.text()).toContain("安全通話已準備");
    expect(w.telephone).not.toHaveBeenCalled();
    await w.press("native-dial-driver");
    expect(w.telephone).toHaveBeenCalledExactlyOnceWith(PROXY);
    expect(w.buttons("native-contact-support")).toHaveLength(1);
  });
  it("reports the original unconfigured-provider reason and retries without implying a completed call", async () => {
    const w = await world([
      async () =>
        reply(200, {
          data: {
            mode: "unavailable",
            contact_uri: null,
            expires_at: null,
            unavailable_reason: "masked_call_provider_not_configured",
          },
        }),
      async () => masked(),
    ]);
    await w.press("native-contact-driver");
    expect(w.text()).toContain("目前無法直接聯絡司機");
    expect(w.text()).toContain("通話服務尚未提供");
    expect(w.telephone).not.toHaveBeenCalled();
    expect(w.buttons("native-dial-driver")).toHaveLength(0);
    await w.press("native-contact-driver");
    expect(w.contactCalls()).toHaveLength(2);
    expect(w.text()).toContain("安全通話已準備");
  });
  it("keeps support_fallback distinct and requires an explicit action for the returned support URI", async () => {
    const w = await world([
      async () =>
        reply(200, {
          data: {
            mode: "support_fallback",
            contact_uri: SUPPORT,
            expires_at: null,
            unavailable_reason: "masked_call_provider_error",
          },
        }),
    ]);
    await w.press("native-contact-driver");
    expect(w.text()).toContain("目前無法直接聯絡司機");
    expect(w.text()).toContain("通話服務暫時無法使用");
    expect(w.telephone).not.toHaveBeenCalled();
    expect(w.buttons("native-dial-driver")).toHaveLength(0);
    await w.press("native-driver-contact-support");
    expect(w.telephone).toHaveBeenCalledExactlyOnceWith(SUPPORT);
    expect(w.buttons("native-contact-support")).toHaveLength(1);
  });
  it("shows a real SDK failure and lets the same normal action retry without dialing on failure", async () => {
    const w = await world([
      async () =>
        reply(503, {
          error: {
            code: "SOURCE_UNAVAILABLE",
            message: "聯絡來源暫時無法使用",
          },
        }),
      async () => masked(),
    ]);
    await w.press("native-contact-driver");
    expect(w.text()).toContain("聯絡來源暫時無法使用");
    expect(w.telephone).not.toHaveBeenCalled();
    await w.press("native-contact-driver");
    expect(w.contactCalls()).toHaveLength(2);
    expect(w.text()).toContain("安全通話已準備");
  });
  it("keeps original no-contact authority on cancelled rides and leaves the existing support entry", async () => {
    const view = authority();
    view.order.status = "cancelled";
    view.actions.canContact = false;
    view.actions.canCancel = false;
    const w = await world([], view);
    expect(w.buttons("native-contact-driver")).toHaveLength(0);
    expect(w.contactCalls()).toHaveLength(0);
    expect(w.buttons("native-contact-support")).toHaveLength(1);
  });
  it("does not publish a late old-order contact result into the next order", async () => {
    const late = deferred();
    const w = await world([() => late.promise]);
    const button = w.buttons("native-contact-driver");
    expect(button).toHaveLength(1);
    let pending!: Promise<void>;
    await act(async () => {
      pending = button[0]!.props.onPress();
      await flush();
    });
    const next = authority();
    next.order.orderId = "OTHER-ORDER";
    next.order.orderNo = "OTHER-NO";
    await act(async () => {
      await w.runtime.openRide(next);
      await flush();
    });
    await act(async () => {
      late.resolve(masked());
      await pending;
      await flush();
    });
    expect(w.runtime.getSnapshot().route).toEqual({
      kind: "ride",
      orderId: "OTHER-ORDER",
    });
    expect(w.text()).not.toContain("安全通話已準備");
    expect(w.buttons("native-dial-driver")).toHaveLength(0);
    expect(w.telephone).not.toHaveBeenCalled();
  });
  it("discards a late proxy after the same-order assignment is replaced through normal GET readback", async () => {
    const late = deferred();
    const w = await world([() => late.promise, async () => masked()]);
    const button = w.buttons("native-contact-driver");
    expect(button).toHaveLength(1);
    let pending!: Promise<void>;
    await act(async () => {
      pending = button[0]!.props.onPress();
      await flush();
    });
    const next = authority();
    next.assignment!.assignmentId = "REPLACEMENT";
    next.assignment!.assignmentVersion = 2;
    next.assignment!.driver.driverId = "OTHER-DRIVER";
    w.replaceServerRide(next);
    await act(async () => {
      await w.runtime.retryRide();
      await flush();
    });
    await act(async () => {
      late.resolve(masked());
      await pending;
      await flush();
    });
    expect(w.runtime.getSnapshot().ride?.assignment?.assignmentId).toBe(
      "REPLACEMENT",
    );
    expect(w.text()).not.toContain("安全通話已準備");
    expect(w.buttons("native-dial-driver")).toHaveLength(0);
    expect(w.telephone).not.toHaveBeenCalled();
    await w.press("native-contact-driver");
    expect(w.contactCalls()).toHaveLength(2);
    await w.press("native-dial-driver");
    expect(w.telephone).toHaveBeenCalledExactlyOnceWith(PROXY);
  });
});

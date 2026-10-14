import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PassengerBookingClient,
  PassengerPaymentClient,
  type FetchOptions,
  type FetchResponse,
} from "@drts/passenger-client";
import type {
  FareQuoteResponse,
  FareVersion,
  PassengerAccount,
  PassengerBookingSettingsResponse,
  PassengerPaymentMethod,
} from "@drts/contracts";
vi.mock("react-native", () => ({
  View: "View",
  ScrollView: "ScrollView",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  Modal: "Modal",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: <T>(styles: T) => styles },
}));
import {
  NativeBookingScreen,
  type NativeBookingScreenProps,
  type NativeBookingMapAvailability,
} from "../../../components/booking/native-booking-screen";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
interface Node {
  props: Record<string, unknown>;
  children: Array<string | Node>;
  findByProps(props: Record<string, unknown>): Node;
  findAllByProps(props: Record<string, unknown>): Node[];
}
interface Rendered {
  root: Node;
  update(node: React.ReactNode): void;
  unmount(): void;
}
const mounted: Rendered[] = [];
afterEach(async () => {
  await act(() => {
    for (const r of mounted.splice(0)) r.unmount();
  });
});
const NOW = Date.parse("2026-10-14T16:00:00.123Z");
const ORIGIN = "https://api.example.invalid";
const FUTURE = "2099-10-11T12:00";
function ok(data: unknown): FetchResponse {
  return { ok: true, status: 200, json: async () => ({ data }) };
}
function fault(code: string, status = 409): FetchResponse {
  return {
    ok: false,
    status,
    json: async () => ({ error: { code, message: "captured API error" } }),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
const card = (id = "CARD-A", isDefault = true): PassengerPaymentMethod => ({
  paymentMethodId: id,
  last4: id === "CARD-A" ? "1111" : "2222",
  cardType: "VISA",
  expiryMonth: "12",
  expiryYear: "2035",
  isDefault,
});
interface State {
  account: PassengerAccount;
  fare: FareVersion;
  settings: PassengerBookingSettingsResponse;
  cards: PassengerPaymentMethod[];
  quote: FareQuoteResponse;
}
type Handler = (
  path: string,
  options: FetchOptions,
  state: State,
) => Promise<FetchResponse | undefined>;
function fixture(handler?: Handler) {
  const state: State = {
    account: {
      drtsPassengerId: "PASSENGER-CAPTURED",
      displayName: "Captured account",
      contactPhone: "0900000000",
      contactPhoneVerified: false,
      feeAcknowledgementVersion: "7",
      status: "active",
      createdAt: "2026-10-01T00:00:00Z",
    },
    fare: {
      version: "7",
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
    settings: { minLeadTimeMinutes: 30, requireSmsVerification: false },
    cards: [card()],
    quote: {
      serviceAreaResult: "serviceable",
      estimatedMin: 200,
      estimatedMax: 300,
      fareVersion: "7",
      fareSnapshotId: "QUOTE-CAPTURED",
      expiresAt: new Date(NOW + 300000).toISOString(),
    },
  };
  const clock = { value: NOW };
  const calls: Array<{ path: string; options: FetchOptions }> = [];
  const fetchFn = async (url: string, options: FetchOptions = {}) => {
    const path = url.slice(`${ORIGIN}/api/passenger-app/`.length);
    calls.push({ path, options });
    const controlled = await handler?.(path, options, state);
    if (controlled) return controlled;
    if (path === "me" && options.method === "GET")
      return ok({ account: state.account });
    if (path === "me" && options.method === "PATCH") {
      state.account = { ...state.account, ...JSON.parse(options.body ?? "{}") };
      return ok({ account: state.account });
    }
    if (path === "fares") return ok({ current_version: state.fare });
    if (path === "settings")
      return ok({
        min_lead_time_minutes: state.settings.minLeadTimeMinutes,
        require_sms_verification: state.settings.requireSmsVerification,
      });
    if (path === "payment-methods") return ok({ methods: state.cards });
    if (path.startsWith("geo/search?")) {
      const pickup = path.includes("Pickup");
      const id = pickup ? "PICK" : "DROP";
      return ok({
        candidates: [
          {
            candidate_id: id,
            provider: "captured-geo",
            display_name: pickup ? "Captured pickup" : "Captured dropoff",
            address: pickup ? "Captured pickup" : "Captured dropoff",
            confidence: "exact",
            location: {
              lat: pickup ? 25.01 : 25.02,
              lng: pickup ? 121.01 : 121.02,
            },
          },
        ],
        provider: "captured-geo",
        generated_at: new Date(clock.value).toISOString(),
      });
    }
    if (path === "geo/resolve") {
      const body = JSON.parse(options.body ?? "{}");
      return ok({
        address: {
          address: body.addressText,
          ...body.selectedPoint,
          coordinate_source: "provider_candidate",
          geocode_confidence: "exact",
          resolved_at: new Date(clock.value).toISOString(),
        },
        provider: "captured-geo",
        resolved_at: new Date(clock.value).toISOString(),
      });
    }
    if (path === "geo/reverse") {
      const body = JSON.parse(options.body ?? "{}");
      return ok({
        address: {
          address: "Captured map address",
          ...body.location,
          coordinate_source: "reverse_geocode",
          geocode_confidence: "exact",
          resolved_at: new Date(clock.value).toISOString(),
        },
        provider: "captured-geo",
        resolved_at: new Date(clock.value).toISOString(),
      });
    }
    if (path === "quotes") return ok(state.quote);
    if (path === "rides")
      return ok({
        ride: {
          order: {
            order_id: "RIDE-CREATED",
            order_no: "ORD-CAPTURED",
            status: "requested",
          },
        },
      });
    throw new Error("Unexpected fixture HTTP route");
  };
  const client = new PassengerBookingClient({ baseUrl: ORIGIN, fetchFn });
  const paymentClient = new PassengerPaymentClient({
    baseUrl: ORIGIN,
    fetchFn,
  });
  const onCreated = vi.fn(
    async (_ride: Parameters<NativeBookingScreenProps["onCreated"]>[0]) => {},
  );
  const onAccount = vi.fn(async () => {});
  const onPaymentMethods = vi.fn(async () => {});
  const onSessionUnavailable = vi.fn(async () => {});
  const onSupport = vi.fn(async () => {});
  const newRequestId = vi.fn(() => "captured-native-request-1");
  const now = () => clock.value;
  return {
    state,
    clock,
    calls,
    client,
    paymentClient,
    onCreated,
    onAccount,
    onPaymentMethods,
    onSessionUnavailable,
    onSupport,
    newRequestId,
    now,
  };
}
async function mount(
  f: ReturnType<typeof fixture>,
  overrides: Partial<NativeBookingScreenProps> = {},
) {
  const props: NativeBookingScreenProps = {
    client: f.client,
    paymentClient: f.paymentClient,
    mode: "configured",
    map: { status: "unavailable" },
    newRequestId: f.newRequestId,
    now: f.now,
    onCreated: f.onCreated,
    onAccount: f.onAccount,
    onPaymentMethods: f.onPaymentMethods,
    onSessionUnavailable: f.onSessionUnavailable,
    onSupport: f.onSupport,
    ...overrides,
  };
  let r!: Rendered;
  await act(async () => {
    r = create(
      React.createElement(NativeBookingScreen, props),
    ) as unknown as Rendered;
  });
  mounted.push(r);
  return { r, props };
}
const exists = (r: Rendered, id: string) =>
  r.root.findAllByProps({ testID: id }).length > 0;
const text = (r: Rendered, id: string) =>
  r.root.findByProps({ testID: id }).children.join("");
const button = (r: Rendered, id: string) =>
  r.root.findByProps({ testID: id }).props as {
    disabled: boolean;
    onPress(): void | Promise<void>;
  };
async function press(r: Rendered, id: string) {
  await act(async () => {
    await button(r, id).onPress();
  });
}
async function enter(r: Rendered, id: string, value: string) {
  await act(() => {
    (
      r.root.findByProps({ testID: id }).props as {
        onChangeText(text: string): void;
      }
    ).onChangeText(value);
  });
}
const calls = (f: ReturnType<typeof fixture>, path: string, verb?: string) =>
  f.calls.filter(
    (c) => c.path === path && (!verb || c.options.method === verb),
  );
async function selectAddress(r: Rendered, field: "origin" | "destination") {
  await enter(
    r,
    `booking-${field}-query`,
    field === "origin" ? "Pickup" : "Dropoff",
  );
  await press(r, `booking-${field}-search`);
  await press(
    r,
    `booking-${field}-candidate-${field === "origin" ? "PICK" : "DROP"}`,
  );
}
async function prepared(f: ReturnType<typeof fixture>) {
  const result = await mount(f);
  await selectAddress(result.r, "origin");
  await selectAddress(result.r, "destination");
  await enter(result.r, "booking-time", FUTURE);
  return result;
}
async function confirm(f: ReturnType<typeof fixture>) {
  const result = await prepared(f);
  await press(result.r, "booking-quote");
  await press(result.r, "booking-confirm-checkbox");
  return result;
}

describe("Native booking actual SDK and rendered reservation actions", () => {
  it("loads actual account/fares/settings/cards with a loading state and no invented endpoint", async () => {
    const gate = deferred<FetchResponse>();
    const f = fixture(async (path) =>
      path === "settings" ? gate.promise : undefined,
    );
    const { r } = await mount(f);
    expect(exists(r, "booking-loading")).toBe(true);
    await act(async () => {
      gate.resolve(
        ok({ min_lead_time_minutes: 30, require_sms_verification: false }),
      );
    });
    expect(exists(r, "booking-origin-query")).toBe(true);
    expect(text(r, "booking-reservation-only")).toContain("僅提供預約");
    expect(new Set(f.calls.map((c) => c.path))).toEqual(
      new Set(["me", "fares", "settings", "payment-methods"]),
    );
  });
  it("requires real settings and retries the actual load when configuration is unavailable", async () => {
    let attempts = 0;
    const f = fixture(async (path) =>
      path === "settings" && ++attempts === 1
        ? ok({ require_sms_verification: false })
        : undefined,
    );
    const { r } = await mount(f);
    expect(exists(r, "booking-error")).toBe(true);
    expect(exists(r, "booking-quote")).toBe(false);
    await press(r, "booking-reload");
    expect(exists(r, "booking-lead-policy")).toBe(true);
    expect(attempts).toBe(2);
  });
  it("acknowledges the captured current fee version through an actual PATCH before presenting booking", async () => {
    const f = fixture();
    f.state.account.feeAcknowledgementVersion = "6";
    const { r } = await mount(f);
    expect(text(r, "booking-current-fare")).toContain("起程 1250 公尺 NT$85");
    expect(exists(r, "booking-quote")).toBe(false);
    await press(r, "booking-acknowledge-fees");
    expect(
      JSON.parse(calls(f, "me", "PATCH")[0]?.options.body ?? "{}"),
    ).toEqual({ feeAcknowledgementVersion: "7" });
    expect(exists(r, "booking-quote")).toBe(true);
  });
  it("keeps fee acknowledgement unavailable when the PATCH readback does not confirm it", async () => {
    const f = fixture(async (path, options, state) =>
      path === "me" && options.method === "PATCH"
        ? ok({ account: state.account })
        : undefined,
    );
    f.state.account.feeAcknowledgementVersion = "6";
    const { r } = await mount(f);
    await press(r, "booking-acknowledge-fees");
    expect(exists(r, "booking-acknowledge-fees")).toBe(true);
    expect(exists(r, "booking-quote")).toBe(false);
    expect(exists(r, "booking-error")).toBe(true);
  });
  it("expands captured full fees with the latest cancellation supplement and shared delay/night facts", async () => {
    const f = fixture();
    const { r } = await mount(f);
    await press(r, "booking-fee-expand");
    expect(text(r, "booking-current-fare")).toContain(
      "延滯每 60 秒 NT$5；夜間 NT$20",
    );
    expect(text(r, "booking-free-cancellation")).toContain("包括指派司機後");
    await press(r, "booking-fee-expand");
    expect(exists(r, "booking-fee-rows")).toBe(false);
  });
  it("uses the actual SMS flag to require verified contact and opens the original account port", async () => {
    const f = fixture();
    f.state.settings.requireSmsVerification = true;
    const { r } = await mount(f);
    expect(text(r, "booking-phone-unavailable")).toContain("完成聯絡手機驗證");
    expect(exists(r, "booking-quote")).toBe(false);
    await press(r, "booking-account");
    expect(f.onAccount).toHaveBeenCalledTimes(1);
  });
  it("allows the captured unverified phone when the setting permits and marks it visibly", async () => {
    const f = fixture();
    const { r } = await mount(f);
    expect(text(r, "booking-unverified-phone")).toContain("尚未驗證");
    expect(exists(r, "booking-quote")).toBe(true);
    expect(text(r, "booking-map-unavailable")).toContain("仍可搜尋");
  });
  it("executes address search/resolve and quotes the actual selected coordinates and local schedule", async () => {
    const f = fixture();
    const { r } = await prepared(f);
    await press(r, "booking-quote");
    expect(f.calls.find((c) => c.path.startsWith("geo/search?"))?.path).toBe(
      "geo/search?q=Pickup&surface=passenger_entry",
    );
    expect(
      JSON.parse(calls(f, "geo/resolve")[0]?.options.body ?? "{}"),
    ).toEqual({
      candidateId: "PICK",
      addressText: "Captured pickup",
      surface: "passenger_entry",
      selectedPoint: { lat: 25.01, lng: 121.01 },
    });
    expect(JSON.parse(calls(f, "quotes")[0]?.options.body ?? "{}")).toEqual({
      originLat: 25.01,
      originLng: 121.01,
      destinationLat: 25.02,
      destinationLng: 121.02,
      scheduledAt: "2099-10-11T12:00:00.000Z",
    });
    expect(text(r, "booking-confirm-fare")).toContain("200–300");
    expect(exists(r, "booking-e19b")).toBe(true);
  });
  it("uses real reverse geocoding for a map pick, keeps zero coordinates and labels synthetic map mode", async () => {
    const f = fixture();
    let picked!: Parameters<
      Extract<NativeBookingMapAvailability, { status: "ready" }>["render"]
    >[0];
    const { r } = await mount(f, {
      mode: "demo",
      map: {
        status: "ready",
        kind: "synthetic",
        render(input) {
          picked = input;
          return React.createElement("View", { testID: "external-map-view" });
        },
      },
    });
    expect(exists(r, "booking-demo-notice")).toBe(true);
    expect(exists(r, "booking-map-demo")).toBe(true);
    await act(async () => {
      await picked.onPick("origin", { lat: 0, lng: 121 });
    });
    expect(
      JSON.parse(calls(f, "geo/reverse")[0]?.options.body ?? "{}"),
    ).toEqual({ location: { lat: 0, lng: 121 }, surface: "passenger_entry" });
    await selectAddress(r, "destination");
    await enter(r, "booking-time", FUTURE);
    await press(r, "booking-quote");
    expect(
      JSON.parse(calls(f, "quotes")[0]?.options.body ?? "{}").originLat,
    ).toBe(0);
  });
  it("preserves a search query after a real geo failure and retries the same SDK query", async () => {
    let attempts = 0;
    const f = fixture(async (path) =>
      path.startsWith("geo/search?") && ++attempts === 1
        ? fault("unavailable", 503)
        : undefined,
    );
    const { r } = await mount(f);
    await enter(r, "booking-origin-query", "Pickup");
    await press(r, "booking-origin-search");
    expect(
      r.root.findByProps({ testID: "booking-origin-query" }).props.value,
    ).toBe("Pickup");
    expect(exists(r, "booking-error")).toBe(true);
    await press(r, "booking-origin-search");
    expect(exists(r, "booking-origin-candidate-PICK")).toBe(true);
  });
  it("retains the other selected address when a resolve command fails", async () => {
    const f = fixture(async (path, options) =>
      path === "geo/resolve" &&
      JSON.parse(options.body ?? "{}").candidateId === "DROP"
        ? fault("unavailable", 503)
        : undefined,
    );
    const { r } = await mount(f);
    await selectAddress(r, "origin");
    await selectAddress(r, "destination");
    expect(text(r, "booking-origin-selected")).toBe("Captured pickup");
    expect(exists(r, "booking-destination-selected")).toBe(false);
    expect(button(r, "booking-quote").disabled).toBe(true);
  });
  it.each(["2020-01-01T00:00", "2026-10-14T16:10", "2026-02-30T12:00"])(
    "uses the real time helpers to reject invalid or short-lead %s before quotes",
    async (localTime) => {
      const f = fixture();
      const { r } = await prepared(f);
      await enter(r, "booking-time", localTime);
      await press(r, "booking-quote");
      expect(calls(f, "quotes")).toHaveLength(0);
      expect(text(r, "booking-error")).toContain("有效預約時間");
      expect(exists(r, "booking-e19b")).toBe(false);
    },
  );
  it("executes a service-area-rejected quote once without E19b or ride creation", async () => {
    const f = fixture();
    f.state.quote = { serviceAreaResult: "not_serviceable" };
    const { r } = await prepared(f);
    await press(r, "booking-quote");
    expect(calls(f, "quotes")).toHaveLength(1);
    expect(text(r, "booking-error")).toContain("不在服務範圍");
    expect(exists(r, "booking-e19b")).toBe(false);
    expect(calls(f, "rides")).toHaveLength(0);
    expect(text(r, "booking-origin-selected")).toBe("Captured pickup");
  });
  it("rejects a quote using a different captured fare version", async () => {
    const f = fixture();
    f.state.quote = {
      ...(f.state.quote as Extract<
        FareQuoteResponse,
        { serviceAreaResult: "serviceable" }
      >),
      fareVersion: "8",
    };
    const { r } = await prepared(f);
    await press(r, "booking-quote");
    expect(text(r, "booking-error")).toContain("運價版本已變更");
    expect(exists(r, "booking-e19b")).toBe(false);
  });
  it.each([
    { expiresAt: new Date(NOW - 1).toISOString() },
    { estimatedMin: 400, estimatedMax: 300 },
  ])("rejects unusable captured quote facts %j", async (changes) => {
    const f = fixture();
    f.state.quote = {
      ...(f.state.quote as Extract<
        FareQuoteResponse,
        { serviceAreaResult: "serviceable" }
      >),
      ...changes,
    };
    const { r } = await prepared(f);
    await press(r, "booking-quote");
    expect(exists(r, "booking-e19b")).toBe(false);
    expect(calls(f, "rides")).toHaveLength(0);
    expect(exists(r, "booking-error")).toBe(true);
  });
  it("renders E19b summary/fee expansion and sends the formal captured body only after explicit confirmation", async () => {
    const f = fixture();
    const { r } = await prepared(f);
    await press(r, "booking-quote");
    expect(button(r, "booking-submit").disabled).toBe(true);
    await press(r, "booking-submit");
    expect(calls(f, "rides")).toHaveLength(0);
    expect(text(r, "booking-confirm-route")).toBe(
      "Captured pickup → Captured dropoff",
    );
    expect(text(r, "booking-confirm-payment")).toContain("VISA •••• 1111");
    await press(r, "booking-confirm-fees");
    expect(r.root.findAllByProps({ testID: "booking-fee-rows" })).toHaveLength(
      1,
    );
    await press(r, "booking-confirm-checkbox");
    await press(r, "booking-submit");
    const request = calls(f, "rides")[0];
    expect(request?.options.headers?.["x-request-id"]).toBe(
      "captured-native-request-1",
    );
    expect(JSON.parse(request?.options.body ?? "{}")).toEqual({
      scheduledAt: "2099-10-11T12:00:00.000Z",
      origin: { lat: 25.01, lng: 121.01, address: "Captured pickup" },
      destination: { lat: 25.02, lng: 121.02, address: "Captured dropoff" },
      paymentMethodId: "CARD-A",
      fareSnapshotId: "QUOTE-CAPTURED",
      passengerConfirmedAt: new Date(NOW).toISOString(),
    });
    expect(f.onCreated.mock.calls[0]?.[0].order.orderId).toBe("RIDE-CREATED");
    expect(exists(r, "booking-created")).toBe(true);
  });
  it("uses the explicitly selected actual card in the immutable create command", async () => {
    const f = fixture();
    f.state.cards.push(card("CARD-B", false));
    const { r } = await confirm(f);
    await press(r, "booking-card-CARD-B");
    await press(r, "booking-submit");
    expect(
      JSON.parse(calls(f, "rides")[0]?.options.body ?? "{}").paymentMethodId,
    ).toBe("CARD-B");
  });
  it("allows a quote without cards but blocks create and opens only the injected payment-management port", async () => {
    const f = fixture();
    f.state.cards = [];
    const { r } = await confirm(f);
    expect(exists(r, "booking-payment-missing")).toBe(true);
    expect(button(r, "booking-submit").disabled).toBe(true);
    await press(r, "booking-manage-payment");
    expect(f.onPaymentMethods).toHaveBeenCalledTimes(1);
    expect(calls(f, "rides")).toHaveLength(0);
  });
  it("invalidates quote and explicit confirmation when returning to modify the draft", async () => {
    const f = fixture();
    const { r } = await confirm(f);
    await press(r, "booking-modify");
    expect(exists(r, "booking-e19b")).toBe(false);
    await enter(r, "booking-time", "2099-10-11T13:00");
    await press(r, "booking-quote");
    expect(button(r, "booking-submit").disabled).toBe(true);
    expect(text(r, "booking-confirm-time")).toContain("13:00");
  });
  it("revalidates quote expiry at the actual submit boundary before any create request", async () => {
    const f = fixture();
    const { r } = await confirm(f);
    f.clock.value += 300001;
    await press(r, "booking-submit");
    expect(calls(f, "rides")).toHaveLength(0);
    expect(text(r, "booking-error")).toContain("逾期");
    expect(exists(r, "booking-e19b")).toBe(false);
  });
  it("coalesces double submit presses while the actual create HTTP remains pending", async () => {
    const gate = deferred<FetchResponse>();
    const f = fixture(async (path) =>
      path === "rides" ? gate.promise : undefined,
    );
    const { r } = await confirm(f);
    let running!: void | Promise<void>;
    await act(async () => {
      const callback = button(r, "booking-submit").onPress;
      running = callback();
      await callback();
    });
    expect(calls(f, "rides")).toHaveLength(1);
    await act(async () => {
      gate.resolve(ok({ ride: { order: { order_id: "RIDE-ONCE" } } }));
      await running;
    });
    expect(f.onCreated).toHaveBeenCalledTimes(1);
    expect(f.newRequestId).toHaveBeenCalledTimes(1);
  });
  it("retains the identical command/key after unknown create and retries it even after quote expiry", async () => {
    let attempts = 0;
    const f = fixture(async (path) =>
      path === "rides" && ++attempts === 1
        ? fault("unavailable", 503)
        : undefined,
    );
    const { r } = await confirm(f);
    await press(r, "booking-submit");
    expect(exists(r, "booking-recovery")).toBe(true);
    expect(button(r, "booking-quote").disabled).toBe(true);
    f.clock.value += 600000;
    await enter(r, "booking-time", "2099-10-11T14:00");
    await press(r, "booking-retry-create");
    expect(calls(f, "rides")).toHaveLength(2);
    expect(calls(f, "rides")[1]?.options).toEqual(
      calls(f, "rides")[0]?.options,
    );
    expect(f.newRequestId).toHaveBeenCalledTimes(1);
    expect(exists(r, "booking-created")).toBe(true);
  });
  it("keeps unknown recovery across a later clean quote refusal until actual same-command success", async () => {
    let attempts = 0;
    const f = fixture(async (path) =>
      path === "rides"
        ? ++attempts === 1
          ? fault("unavailable", 503)
          : attempts === 2
            ? fault("fare_quote_expired", 409)
            : undefined
        : undefined,
    );
    const { r } = await confirm(f);
    await press(r, "booking-submit");
    await press(r, "booking-retry-create");
    expect(exists(r, "booking-recovery")).toBe(true);
    await press(r, "booking-retry-create");
    expect(calls(f, "rides")).toHaveLength(3);
    expect(new Set(calls(f, "rides").map((c) => c.options.body)).size).toBe(1);
    expect(f.newRequestId).toHaveBeenCalledTimes(1);
  });
  it("releases a first definite quote-expired refusal for a new quote rather than unknown recovery", async () => {
    let attempts = 0;
    const f = fixture(async (path) =>
      path === "rides" && ++attempts === 1
        ? fault("fare_quote_expired", 409)
        : undefined,
    );
    const { r } = await confirm(f);
    await press(r, "booking-submit");
    expect(exists(r, "booking-recovery")).toBe(false);
    expect(exists(r, "booking-e19b")).toBe(false);
    await press(r, "booking-quote");
    await press(r, "booking-confirm-checkbox");
    await press(r, "booking-submit");
    expect(f.newRequestId).toHaveBeenCalledTimes(2);
  });
  it("keeps unpaid create refusal visible without claiming that a selected card settles the trip", async () => {
    const f = fixture(async (path) =>
      path === "rides" ? fault("pending_payment_block") : undefined,
    );
    const { r } = await confirm(f);
    await press(r, "booking-submit");
    expect(text(r, "booking-error")).toContain("更新卡片不代表款項已結清");
    expect(exists(r, "booking-e19b")).toBe(true);
    expect(f.onCreated).not.toHaveBeenCalled();
  });
  it("keeps malformed success acknowledgement unknown and retries the same request instead of guessing an ID", async () => {
    let attempts = 0;
    const f = fixture(async (path) =>
      path === "rides" && ++attempts === 1
        ? ok({ ride: { order: {} } })
        : undefined,
    );
    const { r } = await confirm(f);
    await press(r, "booking-submit");
    expect(f.onCreated).not.toHaveBeenCalled();
    expect(exists(r, "booking-recovery")).toBe(true);
    await press(r, "booking-retry-create");
    expect(calls(f, "rides")[1]?.options).toEqual(
      calls(f, "rides")[0]?.options,
    );
    expect(f.onCreated).toHaveBeenCalledTimes(1);
  });
  it("does not repeat a committed create when the navigation callback fails", async () => {
    const f = fixture();
    f.onCreated.mockRejectedValueOnce(new Error("navigation unavailable"));
    const { r } = await confirm(f);
    await press(r, "booking-submit");
    expect(exists(r, "booking-created")).toBe(true);
    expect(text(r, "booking-error")).toContain("行程已建立");
    await press(r, "booking-open-created");
    expect(f.onCreated).toHaveBeenCalledTimes(2);
    expect(calls(f, "rides")).toHaveLength(1);
  });
  it("uses the existing identity readback to stop quoting with a changed account", async () => {
    const f = fixture();
    const { r } = await prepared(f);
    f.state.account.drtsPassengerId = "ANOTHER-CAPTURED-ACCOUNT";
    await press(r, "booking-quote");
    expect(calls(f, "quotes")).toHaveLength(0);
    expect(exists(r, "booking-reload")).toBe(true);
    expect(text(r, "booking-error")).toContain("帳號資料已變更");
  });
  it("honors an actual 401 result by clearing the draft and calling the original login-navigation port", async () => {
    const f = fixture(async (path) =>
      path === "quotes" ? fault("invalid_session", 401) : undefined,
    );
    const { r } = await prepared(f);
    await press(r, "booking-quote");
    expect(f.onSessionUnavailable).toHaveBeenCalledTimes(1);
    expect(exists(r, "booking-origin-selected")).toBe(false);
    expect(exists(r, "booking-reload")).toBe(true);
  });
});

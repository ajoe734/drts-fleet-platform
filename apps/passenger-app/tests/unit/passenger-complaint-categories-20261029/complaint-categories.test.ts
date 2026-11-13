import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreatePassengerComplaintCommand } from "@drts/contracts";
import type {
  FetchOptions,
  FetchResponse,
  NativePassengerRideAuthority,
} from "@drts/passenger-client";

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

const nativeRequire = createRequire(
  path.join(
    fileURLToPath(new URL("../../../", import.meta.url)),
    "package.json",
  ),
);
const React: typeof import("react") = nativeRequire("react");
// Use the installed Native React19.1 renderer; do not invent root declarations.
const { act, create } = nativeRequire("react-test-renderer");
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const rendered: Array<ReturnType<typeof create>> = [];
const runtimes: NativePassengerRuntime[] = [];
afterEach(async () => {
  await act(() => {
    for (const page of rendered.splice(0)) page.unmount();
  });
  for (const runtime of runtimes.splice(0)) runtime.dispose();
});

const ORDER = "bc2e6533-2d44-45e8-a953-5773b2b930fd";
const REQUEST = "native-complaint-request";
function reply(status: number, payload: unknown): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}
function ride(): NativePassengerRideAuthority {
  return {
    order: {
      orderId: ORDER,
      orderNo: "NATIVE-COMPLAINT-SIM",
      status: "completed",
      timingMode: "scheduled",
      requestedPickupAt: "2026-10-29T10:00:00Z",
      pickup: { address: "示意起點" },
      dropoff: { address: "示意終點" },
      cancelableUntil: null,
      cancelledAt: null,
      completedAt: "2026-10-29T10:20:00Z",
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
async function flush() {
  for (let i = 0; i < 30; ++i) await Promise.resolve();
}
async function press(page: ReturnType<typeof create>, id: string) {
  await act(async () => {
    await page.root.findByProps({ testID: id }).props.onPress();
    await flush();
  });
}
async function enter(
  page: ReturnType<typeof create>,
  id: string,
  value: string,
) {
  await act(() =>
    page.root.findByProps({ testID: id }).props.onChangeText(value),
  );
}
function present(page: ReturnType<typeof create>, id: string) {
  return page.root.findAllByProps({ testID: id }).length > 0;
}
async function world(entry: "service" | "lost_item", failures = 0) {
  const writes: Array<{ url: string; options: FetchOptions | undefined }> = [];
  const runtime = new NativePassengerRuntime({
    baseUrl: "https://native-complaint.example.invalid",
    mode: "configured",
    callbackUri: "drtspassenger://auth/callback",
    fetchFn: async (url, options) => {
      if (url.endsWith("/me"))
        return reply(200, {
          data: {
            account: {
              drtsPassengerId: "native-complaint-owner",
              displayName: "示意乘客",
              contactPhone: "+886900000000",
              contactPhoneVerified: true,
              feeAcknowledgementVersion: "fee-v1",
              status: "active",
              createdAt: "2026-10-29T00:00:00Z",
            },
          },
        });
      if (url.endsWith(`/rides/${ORDER}/complaints`)) {
        writes.push({ url, options });
        if (failures-- > 0)
          return reply(503, {
            error: { code: "unavailable", message: "transport SIM failure" },
          });
        return reply(200, { data: { complaintId: "SIM-CASE" } });
      }
      throw new Error("Unexpected transport URL: " + url);
    },
    store: {
      read: async () => ({
        accessToken: "native-token",
        refreshToken: "refresh",
      }),
      write: async () => {},
      clear: async () => {},
    },
    browser: { status: "unavailable" },
    paymentFields: { status: "unavailable" },
    paymentBrowser: { status: "unavailable" },
    bookingMap: { status: "unavailable" },
    newRequestId: () => REQUEST,
  });
  runtimes.push(runtime);
  await runtime.start();
  await runtime.openRide(ride());
  let page!: ReturnType<typeof create>;
  await act(async () => {
    page = create(React.createElement(NativePassengerApplication, { runtime }));
    await flush();
  });
  rendered.push(page);
  await press(
    page,
    entry === "lost_item" ? "native-open-lost-item" : "native-open-complaint",
  );
  return { page, writes };
}
function command(write: { options: FetchOptions | undefined }) {
  return JSON.parse(
    write.options?.body ?? "{}",
  ) as CreatePassengerComplaintCommand;
}

describe("mounted Native existing four complaint categories", () => {
  it.each(["service", "lost_item"] as const)(
    "preserves the original %s entry, same-order command and default consent",
    async (entry) => {
      const { page, writes } = await world(entry);
      expect(present(page, "app-lost-item")).toBe(entry === "lost_item");
      if (entry === "lost_item")
        await enter(page, "app-lost-item", " 示意雨傘 ");
      await enter(page, "app-support-content", " 示意申報內容 ");
      await press(page, "app-support-submit");
      expect(writes).toHaveLength(1);
      expect(command(writes[0]!)).toEqual({
        rideId: ORDER,
        category: entry,
        content: "示意申報內容",
        contactConsent: false,
        ...(entry === "lost_item" ? { lostItemDescription: "示意雨傘" } : {}),
      });
      expect(writes[0]?.options?.headers?.["idempotency-key"]).toBe(REQUEST);
      expect(present(page, "app-support-success")).toBe(true);
    },
  );

  it.each(["fare", "other"] as const)(
    "submits selected %s without stale lost-item data and retries the original body/key after failure",
    async (category) => {
      const { page, writes } = await world("lost_item", 1);
      await enter(page, "app-lost-item", "不得送往非遺失物分類的舊內容");
      await press(page, `app-support-category-${category}`);
      expect(present(page, "app-lost-item")).toBe(false);
      await enter(page, "app-support-content", " 示意分類申報 ");
      await act(() =>
        page.root
          .findByProps({ testID: "app-support-consent" })
          .props.onValueChange(true),
      );
      await press(page, "app-support-submit");
      expect(present(page, "app-support-error")).toBe(true);
      expect(present(page, "app-support-success")).toBe(false);
      expect(command(writes[0]!)).toEqual({
        rideId: ORDER,
        category,
        content: "示意分類申報",
        contactConsent: true,
      });
      expect(
        page.root.findByProps({ testID: `app-support-category-${category}` })
          .props.accessibilityState.selected,
      ).toBe(true);
      await press(page, "app-support-submit");
      expect(writes).toHaveLength(2);
      expect(writes[1]?.url).toBe(writes[0]?.url);
      expect(writes[1]?.options?.body).toBe(writes[0]?.options?.body);
      expect(
        writes.map((write) => write.options?.headers?.["idempotency-key"]),
      ).toEqual([REQUEST, REQUEST]);
      expect(present(page, "app-support-success")).toBe(true);
      expect(present(page, "app-support-submit")).toBe(false);
    },
  );
});

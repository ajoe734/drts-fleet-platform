import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PassengerRideAuthorityView } from "@drts/contracts";

const native = vi.hoisted(() => ({
  available: true,
  shareFailure: null as Error | null,
  sequence: [] as string[],
  writes: [] as Array<{ uri: string; bytes: Uint8Array }>,
  removed: [] as string[],
  shares: [] as Array<{
    uri: string;
    options: import("expo-sharing").SharingOptions;
  }>,
  requests: [] as Array<{ url: string; headers: Record<string, string> }>,
}));

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
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove() {} }),
  },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () =>
    JSON.stringify({
      accessToken: "native-token",
      refreshToken: "refresh-token",
    }),
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));
vi.mock("expo-web-browser", () => ({
  openAuthSessionAsync: async () => ({ type: "cancel" }),
}));
vi.mock("expo-linking", () => ({
  openURL: async () => {},
}));
// Execute the official Sharing14 public wrapper; replace only its native bridge.
vi.mock("expo-modules-core", () => ({
  uuid: { v4: () => "native-receipt-file" },
  UnavailabilityError: Error,
  requireNativeModule(name: string) {
    if (name !== "ExpoSharing") throw new Error("Unexpected native module");
    return {
      async isAvailableAsync() {
        native.sequence.push("availability");
        return native.available;
      },
      async shareAsync(
        uri: string,
        options: import("expo-sharing").SharingOptions,
      ) {
        native.sequence.push("share");
        native.shares.push({ uri, options });
        if (native.shareFailure) throw native.shareFailure;
      },
    };
  },
}));
// File creation/write/delete are device I/O ports, not reconstructed API bytes.
vi.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///native-cache" } },
  File: class {
    readonly uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
    create() {
      native.sequence.push("create");
    }
    write(bytes: Uint8Array) {
      native.sequence.push("write");
      native.writes.push({ uri: this.uri, bytes: Uint8Array.from(bytes) });
    }
    delete() {
      native.sequence.push("remove");
      native.removed.push(this.uri);
    }
  },
}));

import { createNativePassengerBootstrap } from "../../../lib/bootstrap";

const BASE = "https://native-receipt.example.invalid";
const ORDER = "a3181aa2-2b33-4bc4-a949-c246cb9e9182";
const HTML = Uint8Array.from([60, 104, 116, 109, 108, 62]);
const PDF = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 52]);
const runtimes: Array<
  ReturnType<typeof createNativePassengerBootstrap>["runtime"]
> = [];

class NativeRequest {
  readyState = 1;
  status = 0;
  responseText = "";
  response: unknown = null;
  responseType = "";
  url = "";
  headers: Record<string, string> = {};
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
  getResponseHeader(name: string) {
    const pdf = this.url.endsWith("/pdf");
    return name === "Content-Type"
      ? pdf
        ? "application/pdf"
        : "text/html; charset=utf-8"
      : `attachment; filename="owned-receipt.${pdf ? "pdf" : "html"}"`;
  }
  send() {
    native.requests.push(this);
    if (this.url.endsWith("/events")) return;
    this.status = 200;
    this.readyState = 4;
    this.response = Uint8Array.from(
      this.url.endsWith("/pdf") ? PDF : HTML,
    ).buffer;
    this.onload?.();
  }
  abort() {
    this.onabort?.();
  }
}

function ride(): PassengerRideAuthorityView {
  return {
    order: {
      orderId: ORDER,
      orderNo: "NATIVE-RECEIPT-SIM",
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
    receipt: {
      receiptId: "sim-certificate",
      orderId: ORDER,
      receiptNo: "SIM-RECEIPT",
      amountMinor: 20000,
      currency: "TWD",
      issuedAt: "2026-10-29T10:20:00Z",
      record: {
        plateNo: "SIM-001",
        pickupAt: "2026-10-29T10:00:00Z",
        dropoffAt: "2026-10-29T10:20:00Z",
        travelDurationSeconds: 1200,
        routeSummary: "示意路線",
        distanceMeters: 5000,
        tollMinor: 0,
        consumerServicePhone: "SIM-SUPPORT",
        authorityComplaintPhone: "SIM-AUTHORITY",
        e04Snapshot: {
          fleetOperatorName: "示意業者",
          driverSurname: "示意姓氏",
          driverRegistrationMasked: "SIM***01",
          paymentMethodDisplay: "付款方式示意",
          fareBreakdown: {
            startMinor: 8500,
            distanceMinor: 11500,
            delayMinor: 0,
            nightMinor: 0,
          },
        },
      },
    },
    actions: {
      canCancel: false,
      canRate: false,
      canContact: false,
      canReadReceipt: true,
    },
  };
}

beforeEach(() => {
  native.available = true;
  native.shareFailure = null;
  native.sequence.length = 0;
  native.writes.length = 0;
  native.removed.length = 0;
  native.shares.length = 0;
  native.requests.length = 0;
  vi.stubGlobal("XMLHttpRequest", NativeRequest);
  vi.stubGlobal("fetch", async (input: string) => {
    const data = input.endsWith("/me")
      ? {
          account: {
            drtsPassengerId: "native-owner",
            displayName: "示意乘客",
            contactPhone: "+886900000000",
            contactPhoneVerified: true,
            feeAcknowledgementVersion: "fee-v1",
            status: "active",
            createdAt: "2026-10-29T00:00:00Z",
          },
        }
      : input.endsWith("/receipt/downloads")
        ? {
            orderId: ORDER,
            certificateId: "sim-certificate",
            receiptUrl: `/api/passenger-app/rides/${ORDER}/receipt/artifacts/html`,
            htmlUrl: `/api/passenger-app/rides/${ORDER}/receipt/artifacts/html`,
            pdfUrl: `/api/passenger-app/rides/${ORDER}/receipt/artifacts/pdf`,
          }
        : input.endsWith(`/rides/${ORDER}`)
          ? { ride: ride() }
          : null;
    if (!data) throw new Error("Unexpected transport URL: " + input);
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
});
afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.dispose();
  vi.unstubAllGlobals();
});

function configured() {
  const result = createNativePassengerBootstrap({
    mode: "configured",
    baseUrl: BASE,
    callbackUri: "drtspassenger://auth/callback",
  });
  runtimes.push(result.runtime);
  return result.runtime;
}
async function completed() {
  const runtime = configured();
  await runtime.start();
  await runtime.openRide(ride());
  return runtime;
}

describe("normal configured Native receipt platform composition", () => {
  it("provides the existing receipt ports from the real configured bootstrap", () => {
    expect(configured().options.receipts).toBeDefined();
    expect(native.sequence).toEqual([]);
  });

  it.each([
    ["html", HTML, "text/html"],
    ["pdf", PDF, "application/pdf"],
  ] as const)(
    "downloads same-order %s bytes before the local file and official sharing wrapper",
    async (format, bytes, mimeType) => {
      const runtime = await completed();
      await runtime.downloadReceipt(format);
      const binary = native.requests.find((request) =>
        request.url.endsWith(`/receipt/artifacts/${format}`),
      );
      expect(binary?.url).toBe(
        `${BASE}/api/passenger-app/rides/${ORDER}/receipt/artifacts/${format}`,
      );
      expect(binary?.headers.Authorization).toBe("Bearer native-token");
      expect(native.writes).toEqual([
        {
          uri: `file:///native-cache/native-receipt-file-owned-receipt.${format}`,
          bytes,
        },
      ]);
      expect(native.shares).toEqual([
        {
          uri: native.writes[0]?.uri,
          options: expect.objectContaining({ mimeType }),
        },
      ]);
      expect(native.sequence).toEqual([
        "create",
        "write",
        "availability",
        "share",
      ]);
      expect(native.removed).toEqual([]);
    },
  );

  it("reports an unavailable share surface without pretending a file was opened", async () => {
    native.available = false;
    const runtime = await completed();
    await expect(runtime.downloadReceipt("pdf")).rejects.toThrow(
      "目前無法開啟檔案分享，請稍後重試。",
    );
    expect(native.shares).toEqual([]);
    expect(native.removed).toEqual([native.writes[0]?.uri]);
  });

  it("propagates native share failure and permits the existing user retry", async () => {
    native.shareFailure = new Error("native share rejected");
    const runtime = await completed();
    await expect(runtime.downloadReceipt("html")).rejects.toThrow(
      "native share rejected",
    );
    expect(native.removed).toEqual([native.writes[0]?.uri]);
    native.shareFailure = null;
    await runtime.downloadReceipt("html");
    expect(native.shares).toHaveLength(2);
    expect(native.writes).toHaveLength(2);
    expect(native.removed).toHaveLength(1);
  });

  it("keeps explicit demo mode separate from the real file/share bridge", () => {
    const result = createNativePassengerBootstrap({ mode: "demo" });
    runtimes.push(result.runtime);
    expect(result.mode).toBe("demo");
    expect(native.sequence).toEqual([]);
    expect(native.requests).toEqual([]);
  });
});

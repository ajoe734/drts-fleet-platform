// @vitest-environment jsdom
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as sdk from "../../../packages/api-client/src/index";
import * as contracts from "../../../packages/contracts/src/index";
import type {
  DriverTaskRecord,
  OwnedOrderRecord,
  UnifiedDriverTaskView,
} from "@drts/contracts";

// Mount the complete current TSX screens with actual React hooks, app helpers,
// identity/client factory, completion queue and SDK. Native views/router/sensors
// and fetch are socket-free ports. This is not a device or browser E2E test.
const root = path.resolve(process.cwd());
type Props = Record<string, any>;
function nativeView(tag: string) {
  return ({
    children,
    onPress,
    onChangeText,
    accessibilityLabel,
    disabled,
    editable,
    ph,
    value,
    ...props
  }: Props) =>
    React.createElement(
      tag,
      {
        onClick: onPress,
        onChange:
          onChangeText && editable !== false && !disabled
            ? (event: any) => onChangeText(event.target.value)
            : undefined,
        "aria-label": accessibilityLabel,
        disabled: disabled || editable === false,
        placeholder: ph,
        value,
        "data-icon": props.name,
      },
      children,
    );
}
const Box = nativeView("div");
const Text = nativeView("span");
const Pressable = nativeView("button");
const Input = nativeView("input");
const theme = new Proxy({}, { get: () => "#123456" });
const visual = ({
  children,
  title,
  subtitle,
  actions,
  bottomBar,
  footer,
  body,
  value,
  label,
  ...props
}: Props) =>
  React.createElement(
    "div",
    null,
    React.createElement("span", null, title),
    React.createElement("span", null, subtitle),
    React.createElement("span", null, label),
    React.createElement("span", null, value),
    React.createElement("span", null, body),
    children,
    actions,
    bottomBar,
    footer,
    props.onPress ? React.createElement(Pressable, props, children) : null,
  );
const Button = ({
  children,
  title,
  label,
  onPress,
  disabled,
  loading,
}: Props) =>
  React.createElement(
    Pressable,
    { onPress, disabled: disabled || loading },
    children ?? title ?? label,
  );

function task(
  taskId: string,
  status: DriverTaskRecord["status"],
  forwarded = false,
): DriverTaskRecord {
  return {
    taskId,
    orderId: `order-${taskId}`,
    dispatchJobId: `job-${taskId}`,
    assignmentId: `assignment-${taskId}`,
    driverId: "driver-001",
    vehicleId: "vehicle-001",
    sourcePlatform: forwarded ? "grab_taiwan" : null,
    routeProvided: true,
    waypoints: [],
    status,
    acceptedAt: "2026-10-29T08:00:00.000Z",
    departedAt: null,
    arrivedPickupAt: null,
    startedAt: status === "on_trip" ? "2026-10-29T08:01:00.000Z" : null,
    completedAt: status === "completed" ? "2026-10-29T08:02:00.000Z" : null,
    actualDistanceKm: null,
    actualDurationSec: null,
    fare: null,
    proof: null,
    ...(forwarded ? { forwardedStatus: "completed_synced" } : {}),
  };
}
function order(record: DriverTaskRecord): OwnedOrderRecord {
  return {
    orderId: record.orderId,
    orderNo: record.orderId,
    status: record.status,
    orderDomain: record.sourcePlatform ? "forwarded" : "owned",
    serviceBucket: "standard_taxi",
    serviceProductCode: "taxi_realtime",
    dispatchSemantics: "realtime",
    businessDispatchSubtype: null,
    pickup: { address: `pickup-${record.taskId}`, lat: 25, lng: 121 },
    dropoff: { address: `dropoff-${record.taskId}`, lat: 25.1, lng: 121.1 },
    passenger: { name: "模擬乘客", phone: "0900000000", count: 1 },
    fixedPrice: false,
    quotedFare: null,
    routeProvided: true,
    waypoints: [],
    proofRequirements: {
      minPhotoCount: 1,
      signoffRequired: true,
      expenseProofRequired: true,
    },
    createdAt: "2026-10-29T08:00:00.000Z",
    updatedAt: "2026-10-29T08:02:00.000Z",
  } as unknown as OwnedOrderRecord;
}
function view(record: DriverTaskRecord): UnifiedDriverTaskView {
  return {
    taskId: record.taskId,
    orderId: record.orderId,
    orderDomain: record.sourcePlatform ? "forwarded" : "owned",
    sourcePlatform: record.sourcePlatform ? "grab_taiwan" : "drts",
    platformDisplayName: record.sourcePlatform ? "Grab Taiwan" : "DRTS",
    externalOrderId: null,
    nativeStatus: record.forwardedStatus ?? null,
    localStatus: record.status,
    driverActionState:
      record.status === "completed" ? "completed" : "in_progress",
    allowedActions:
      record.status === "completed"
        ? []
        : ["arrived_pickup", "start", "complete"],
    routeLocked: Boolean(record.sourcePlatform),
    fareAuthority: record.sourcePlatform ? "external_platform" : "drts",
    settlementAuthority: record.sourcePlatform ? "external_platform" : "drts",
    driverPayoutAuthority: record.sourcePlatform ? "external_platform" : "drts",
    requiresManualFallback: false,
    requiresReauth: false,
    syncIssueSummary: null,
    blockingReason: null,
    pickupSummary: `pickup-${record.taskId}`,
    dropoffSummary: `dropoff-${record.taskId}`,
    deadlineAt: null,
    updatedAt: "2026-10-29T08:02:00.000Z",
    orderSummary: {
      orderId: record.orderId,
      serviceBucket: "standard_taxi",
      serviceProductCode: "taxi_realtime",
      businessDispatchSubtype: null,
      dispatchSemantics: "realtime",
      fixedPrice: false,
      quotedFare: null,
    },
  };
}

// Native camera/library, map presentation, heartbeat and fetch are controlled IO
// ports. Full TripScreen hooks/handlers, completion-proof/actual-fare helpers,
// identity factory, completion queue and shared SDK execute from current Source.
// No device, HTTP server, Controller, SQL, uploaded photo or trip completion is
// asserted outside this socket-free transport unit.
type PhotoResult = {
  canceled: boolean;
  assets: Array<{
    uri: string;
    base64: string;
    width: number;
    height: number;
    fileName: string;
  }>;
};
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function photo(label: string): PhotoResult {
  return {
    canceled: false,
    assets: [
      {
        uri: `file:///proof-${label}.jpg`,
        base64: btoa(`PROOF-${label}`),
        width: 320,
        height: 240,
        fileName: `proof-${label}.jpg`,
      },
    ],
  };
}

function createHarness(initial: DriverTaskRecord[], requestedTaskId?: string) {
  let records = structuredClone(initial);
  let routeParams: { taskId?: string } = requestedTaskId
    ? { taskId: requestedTaskId }
    : {};
  const requests: Array<{ method: string; pathname: string; body: any }> = [];
  const push = vi.fn();
  const alerts = vi.fn();
  let failList = false;
  let nextListHold: { wait: Promise<void>; started: () => void } | null = null;
  let permissionHold: ReturnType<typeof deferred<{ granted: boolean }>> | null =
    null;
  const photoResults: Array<Promise<PhotoResult>> = [];
  let completionHold: {
    taskId: string;
    wait: Promise<void>;
    started: () => void;
  } | null = null;
  let completionConflictTaskId: string | null = null;
  const permission = vi.fn(async () => {
    const held = permissionHold;
    permissionHold = null;
    return held ? held.promise : { granted: true };
  });
  const library = vi.fn(
    async () =>
      photoResults.shift() ?? Promise.resolve({ canceled: true, assets: [] }),
  );
  const stopHeartbeat = vi.fn(async () => undefined);
  const syncHeartbeat = vi.fn(async (selected: { taskId: string } | null) => ({
    status: "active",
    message: null,
    latestUpdate: {
      latitude: selected?.taskId === "task-B" ? 25.2 : 25.1,
      longitude: selected?.taskId === "task-B" ? 121.6 : 121.5,
      accuracyM: 5,
      recordedAt: new Date().toISOString(),
    },
  }));
  const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
  const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
  const fetchPort = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ method, pathname, body });
      const response = (data: unknown, status = 200) =>
        new Response(
          JSON.stringify(
            status === 200
              ? { status: "success", data }
              : {
                  status: "error",
                  error: {
                    code: "SIM_READ_FAILURE",
                    message: "SIM read failed",
                  },
                },
          ),
          { status, headers: { "Content-Type": "application/json" } },
        );
      if (pathname === "/api/driver/tasks") {
        const hold = nextListHold;
        nextListHold = null;
        if (hold) {
          hold.started();
          await hold.wait;
        }
        return failList ? response(null, 503) : response({ items: records });
      }
      if (pathname === "/api/driver/task-views")
        return response({ items: records.map(view) });
      if (pathname.includes("platform-presence"))
        return response({ items: [], driverId: "driver-001", presences: [] });
      const detail = pathname.match(/^\/api\/driver\/tasks\/([^/]+)\/order$/);
      if (detail) {
        const selected = records.find(
          (row) => row.taskId === decodeURIComponent(detail[1]!),
        );
        return selected ? response(order(selected)) : response(null, 404);
      }
      const orderDetail = pathname.match(/^\/api\/orders\/(.+)$/);
      if (orderDetail) {
        const selected = records.find(
          (row) => row.orderId === decodeURIComponent(orderDetail[1]!),
        );
        return selected ? response(order(selected)) : response(null, 404);
      }
      const action = pathname.match(
        /^\/api\/driver\/tasks\/([^/]+)\/(arrived_pickup|start|complete)$/,
      );
      if (method === "POST" && action) {
        const selected = records.find(
          (row) => row.taskId === decodeURIComponent(action[1]!),
        );
        if (!selected) return response(null, 404);
        if (
          action[2] === "complete" &&
          completionConflictTaskId === selected.taskId
        ) {
          completionConflictTaskId = null;
          // Another normal completion already won in this controlled API port.
          // Use the original terminal409 contract so the real completion queue
          // clears its record; do not hide a queued503 or mock queue methods.
          selected.status = "completed";
          return new Response(
            JSON.stringify({
              status: "error",
              error: {
                code: "TASK_ALREADY_COMPLETED",
                message: "Driver task has already been completed.",
                retryable: false,
                traceId: "SIM-completion-conflict",
              },
            }),
            {
              status: 409,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        selected.status =
          action[2] === "start"
            ? "on_trip"
            : action[2] === "complete"
              ? "completed"
              : "arrived_pickup";
        if (selected.status === "on_trip") selected.startedAt = body.startedAt;
        // Delay only the response transport after its SIM status changes. This
        // models an original completion whose ACK is late, not a SQL lock.
        if (
          action[2] === "complete" &&
          completionHold?.taskId === selected.taskId
        ) {
          const held = completionHold;
          completionHold = null;
          held.started();
          await held.wait;
        }
        return response(selected);
      }
      throw new Error(`Unspecified fetch port: ${method} ${pathname}`);
    },
  );
  vi.stubGlobal("fetch", fetchPort);
  const cache = new Map<string, { exports: any }>();
  const ports: Record<string, any> = {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/api-client": sdk,
    "@drts/contracts": contracts,
    "react-native": {
      ActivityIndicator: Box,
      Image: ({ source }: Props) =>
        React.createElement("img", {
          src: source?.uri,
          alt: "行程佐證",
        }),
      ScrollView: Box,
      Pressable,
      Text,
      View: Box,
      Alert: { alert: alerts },
      Platform: { OS: "web" },
      StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
      PanResponder: { create: () => ({ panHandlers: {} }) },
      Animated: {
        Value: class {
          setValue() {}
          stopAnimation() {}
          interpolate() {
            return 0;
          }
        },
        View: Box,
        spring: () => ({ start() {} }),
        timing: () => ({ start() {} }),
        sequence: () => ({ start() {} }),
      },
    },
    "expo-router": {
      useRouter: () => ({
        push,
        replace: vi.fn(),
        canDismiss: () => false,
        dismissAll: vi.fn(),
      }),
      useLocalSearchParams: () => routeParams,
      Redirect: Box,
    },
    "@expo/vector-icons": { Ionicons: Box },
    "expo-image-picker": {
      requestCameraPermissionsAsync: permission,
      requestMediaLibraryPermissionsAsync: permission,
      launchCameraAsync: library,
      launchImageLibraryAsync: library,
    },
    "expo-constants": {
      __esModule: true,
      default: {
        expoConfig: {
          extra: {
            apiBaseUrl: "https://driver.example.invalid",
            driverActorId: "driver-001",
          },
        },
      },
    },
    "expo-secure-store": {
      getItemAsync: async () => null,
      setItemAsync: async () => undefined,
      deleteItemAsync: async () => undefined,
    },
    "@/components/canvas-primitives": {
      Banner: visual,
      Btn: Button,
      Card: visual,
      DL: visual,
      Field: ({ label, children }: Props) =>
        React.createElement(
          "label",
          null,
          React.createElement("span", null, label),
          children,
        ),
      Input,
      KPI: visual,
      PageHeader: visual,
      Pill: visual,
      Shell: visual,
      driverCanvasTheme: theme,
    },
    "@/components/ui": { AuthorityBanner: visual, PlatformBadge: visual },
    "@/components/driver-trip-map": {
      __esModule: true,
      default: ({ driverLocation }: Props) =>
        React.createElement("div", {
          "data-testid": "driver-map-port",
          "data-location": JSON.stringify(driverLocation),
        }),
    },
    "@/components/owned-task-rejection-dialog": {
      OwnedTaskRejectionDialog: () => null,
    },
    "@/lib/driver-location-heartbeat": {
      getLatestDriverLocationUpdate: () => null,
      stopDriverLocationHeartbeat: stopHeartbeat,
      subscribeToDriverLocationUpdates: () => () => undefined,
      syncDriverLocationHeartbeat: syncHeartbeat,
    },
    "@/lib/driver-tracking-recovery": {
      subscribeTrackingDiagnostic: () => () => undefined,
      formatTrackingGapNotice: () => null,
    },
  };
  function load(filename: string): any {
    const candidates = [
      filename,
      `${filename}.ts`,
      `${filename}.tsx`,
      path.join(filename, "index.ts"),
    ];
    const resolved = candidates.find((candidate) => existsSync(candidate));
    if (!resolved) throw new Error(`Unresolved current Source ${filename}`);
    const cached = cache.get(resolved);
    if (cached) return cached.exports;
    const module = { exports: {} as any };
    cache.set(resolved, module);
    const code = ts.transpileModule(readFileSync(resolved, "utf8"), {
      fileName: resolved,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const requirePort = (specifier: string) => {
      if (specifier in ports) return ports[specifier];
      if (specifier.startsWith("@/"))
        return load(path.join(root, "apps/driver-app", specifier.slice(2)));
      if (specifier.startsWith("."))
        return load(path.resolve(path.dirname(resolved), specifier));
      throw new Error(`Unspecified module port: ${specifier}`);
    };
    new Function("require", "module", "exports", code)(
      requirePort,
      module,
      module.exports,
    );
    return module.exports;
  }
  return {
    Trip: load(path.join(root, "apps/driver-app/app/trip.tsx"))
      .default as React.ComponentType,
    requests,
    permission,
    library,
    stopHeartbeat,
    syncHeartbeat,
    clearIntervalSpy,
    latestDurationTimer: () => {
      const indexes = setIntervalSpy.mock.calls
        .map((args, index) => (args[1] === 1000 ? index : -1))
        .filter((index) => index >= 0);
      const last = indexes[indexes.length - 1];
      if (last === undefined)
        throw new Error("Normal Trip did not start its duration clock");
      return setIntervalSpy.mock.results[last]!.value;
    },
    holdPermission: () => {
      const held = deferred<{ granted: boolean }>();
      permissionHold = held;
      return held;
    },
    holdPhoto: () => {
      const held = deferred<PhotoResult>();
      photoResults.push(held.promise);
      return held;
    },
    nextPhoto: (label: string) =>
      photoResults.push(Promise.resolve(photo(label))),
    conflictNextCompletion: (taskId: string) => {
      completionConflictTaskId = taskId;
    },
    holdCompletion: (taskId: string) => {
      const held = deferred<void>();
      const entered = deferred<void>();
      completionHold = {
        taskId,
        wait: held.promise,
        started: () => entered.resolve(),
      };
      return { started: entered.promise, release: () => held.resolve() };
    },
    push,
    alerts,
    select: (taskId: string) => {
      routeParams = { taskId };
    },
    reorder: () => {
      records = [...records].reverse();
    },
    failList: () => {
      failList = true;
    },
    holdNextList: () => {
      let release!: () => void;
      let markStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      nextListHold = { wait, started: markStarted };
      return { started, release };
    },
  };
}

async function ready(taskId: string) {
  await waitFor(() =>
    expect(screen.getAllByText(taskId).length).toBeGreaterThan(0),
  );
  await waitFor(() => expect(screen.getByLabelText("實際起步費")).toBeTruthy());
  await waitFor(() =>
    expect(
      screen.getByTestId("driver-map-port").getAttribute("data-location"),
    ).toContain(taskId === "task-B" ? '"latitude":25.2' : '"latitude":25.1'),
  );
}
function fillFareAndEvidence(label: string) {
  const values = {
    實際起步費: "85",
    實際里程費: "115",
    實際延滯費: "0",
    實際夜間加成: "0",
    實際車資總額: "200",
    簽收識別: `SIGN-${label}`,
    費用類型: "parking",
    金額: "40",
    單據識別: `EXPENSE-${label}`,
  };
  for (const [name, value] of Object.entries(values)) {
    const field = screen.getByLabelText(name) as HTMLInputElement;
    expect(field.disabled, `Normal editable field ${name}`).toBe(false);
    fireEvent.change(field, { target: { value } });
  }
}
function proofUris() {
  return screen
    .queryAllByRole("img", { name: "行程佐證" })
    .map((image) => image.getAttribute("src"));
}
async function pick(h: ReturnType<typeof createHarness>, label: string) {
  h.nextPhoto(label);
  const button = screen.getByRole("button", {
    name: "從相簿選取",
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  await waitFor(() =>
    expect(proofUris()).toContain(`file:///proof-${label}.jpg`),
  );
}
function completeButton() {
  return screen.getByRole("button", { name: "完成行程" }) as HTMLButtonElement;
}
function start() {
  return createHarness(
    [task("task-A", "on_trip"), task("task-B", "on_trip")],
    "task-A",
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("Driver current trip evidence and completion async custody", () => {
  it("does not launch the old task's picker after permission resolves on a different selected trip", async () => {
    const h = start();
    const mounted = render(<h.Trip />);
    await ready("task-A");
    const held = h.holdPermission();
    fireEvent.click(screen.getByRole("button", { name: "從相簿選取" }));
    await waitFor(() => expect(h.permission).toHaveBeenCalledTimes(1));
    h.select("task-B");
    mounted.rerender(<h.Trip />);
    await ready("task-B");
    await act(async () => {
      held.resolve({ granted: true });
    });
    expect(h.library).not.toHaveBeenCalled();
    expect(proofUris()).toEqual([]);
    expect(h.requests.filter((request) => request.method === "POST")).toEqual(
      [],
    );
  });

  it("keeps B's chosen proof when A's already opened picker returns late", async () => {
    const h = start();
    const mounted = render(<h.Trip />);
    await ready("task-A");
    const held = h.holdPhoto();
    fireEvent.click(screen.getByRole("button", { name: "從相簿選取" }));
    await waitFor(() => expect(h.library).toHaveBeenCalledTimes(1));
    h.select("task-B");
    mounted.rerender(<h.Trip />);
    await ready("task-B");
    await pick(h, "B");
    await act(async () => {
      held.resolve(photo("A"));
    });
    expect(proofUris()).toEqual(["file:///proof-B.jpg"]);
    expect(screen.getByLabelText("實際起步費")).toBeTruthy();
    expect(h.requests.filter((request) => request.method === "POST")).toEqual(
      [],
    );
  });

  it("collects current B proof and explicit fare through the real helpers, completion queue and SDK body", async () => {
    const h = start();
    h.select("task-B");
    render(<h.Trip />);
    await ready("task-B");
    await pick(h, "B");
    fillFareAndEvidence("B");
    expect(completeButton().disabled).toBe(false);
    fireEvent.click(completeButton());
    await waitFor(() =>
      expect(
        h.requests.filter((request) => request.method === "POST"),
      ).toHaveLength(1),
    );
    const post = h.requests.find((request) => request.method === "POST")!;
    expect(post.pathname).toBe("/api/driver/tasks/task-B/complete");
    expect(post.body).toMatchObject({
      actualFareBreakdown: {
        startMinor: 8500,
        distanceMinor: 11500,
        delayMinor: 0,
        nightMinor: 0,
      },
      fare: { amountMinor: 20000, currency: contracts.PLATFORM_CURRENCY },
      proof: {
        photos: [btoa("PROOF-B")],
        signatureId: "SIGN-B",
        expenseItems: [
          { type: "parking", amountMinor: 4000, attachmentId: "EXPENSE-B" },
        ],
      },
    });
    expect(post.body.completedAt).toEqual(expect.any(String));
    expect(post.body.actualDistanceKm).toEqual(expect.any(Number));
    expect(post.body.actualDurationSec).toEqual(expect.any(Number));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "完成行程" })).toBeNull(),
    );
  });

  it("does not stop B tracking or its clock/map when A's complete ACK arrives late, and B can then complete normally", async () => {
    const h = start();
    const mounted = render(<h.Trip />);
    await ready("task-A");
    await pick(h, "A");
    fillFareAndEvidence("A");
    const held = h.holdCompletion("task-A");
    fireEvent.click(completeButton());
    await held.started;
    h.select("task-B");
    mounted.rerender(<h.Trip />);
    await ready("task-B");
    const stops = h.stopHeartbeat.mock.calls.length;
    const clock = h.latestDurationTimer();
    const map = screen
      .getByTestId("driver-map-port")
      .getAttribute("data-location");
    await act(async () => {
      held.release();
    });
    await waitFor(() =>
      expect(
        (screen.getByLabelText("實際起步費") as HTMLInputElement).disabled,
      ).toBe(false),
    );
    expect(h.stopHeartbeat).toHaveBeenCalledTimes(stops);
    expect(h.clearIntervalSpy.mock.calls.some(([id]) => id === clock)).toBe(
      false,
    );
    expect(
      screen.getByTestId("driver-map-port").getAttribute("data-location"),
    ).toBe(map);
    await pick(h, "B");
    fillFareAndEvidence("B");
    expect(completeButton().disabled).toBe(false);
    fireEvent.click(completeButton());
    await waitFor(() =>
      expect(
        h.requests
          .filter((request) => request.method === "POST")
          .map((request) => request.pathname),
      ).toEqual([
        "/api/driver/tasks/task-A/complete",
        "/api/driver/tasks/task-B/complete",
      ]),
    );
    expect(
      h.requests.filter((request) => request.method === "POST")[1]!.body.proof
        .photos,
    ).toEqual([btoa("PROOF-B")]);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "完成行程" })).toBeNull(),
    );
  });

  it("retains the current A successful completion stop and terminal UI cleanup behaviour", async () => {
    const h = start();
    render(<h.Trip />);
    await ready("task-A");
    await pick(h, "A");
    fillFareAndEvidence("A");
    const stops = h.stopHeartbeat.mock.calls.length;
    const clock = h.latestDurationTimer();
    fireEvent.click(completeButton());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "完成行程" })).toBeNull(),
    );
    expect(h.stopHeartbeat.mock.calls.length).toBeGreaterThan(stops);
    expect(h.clearIntervalSpy.mock.calls.some(([id]) => id === clock)).toBe(
      true,
    );
    expect(proofUris()).toEqual([]);
    expect(screen.queryByLabelText("實際起步費")).toBeNull();
    expect(h.alerts).toHaveBeenCalledWith(
      "成功",
      expect.stringContaining("完成"),
    );
    expect(
      h.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
  });

  it("ignores A's late completion side effects after its screen unmounts and a new B screen owns tracking", async () => {
    const h = start();
    const first = render(<h.Trip />);
    await ready("task-A");
    await pick(h, "A");
    fillFareAndEvidence("A");
    const held = h.holdCompletion("task-A");
    fireEvent.click(completeButton());
    await held.started;
    first.unmount();
    h.select("task-B");
    render(<h.Trip />);
    await ready("task-B");
    const stops = h.stopHeartbeat.mock.calls.length;
    const successes = h.alerts.mock.calls.filter(
      ([title]) => title === "成功",
    ).length;
    const clock = h.latestDurationTimer();
    const map = screen
      .getByTestId("driver-map-port")
      .getAttribute("data-location");
    await act(async () => {
      held.release();
    });
    expect(h.stopHeartbeat).toHaveBeenCalledTimes(stops);
    expect(
      h.alerts.mock.calls.filter(([title]) => title === "成功"),
    ).toHaveLength(successes);
    expect(h.clearIntervalSpy.mock.calls.some(([id]) => id === clock)).toBe(
      false,
    );
    expect(
      screen.getByTestId("driver-map-port").getAttribute("data-location"),
    ).toBe(map);
    expect(screen.getAllByText("task-B").length).toBeGreaterThan(0);
    expect(
      h.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
  });

  it("does not alert A's completion error on B after A's automatic refresh returns late, and B can complete normally", async () => {
    const h = start();
    const mounted = render(<h.Trip />);
    await ready("task-A");
    await pick(h, "A");
    fillFareAndEvidence("A");
    const heldRefresh = h.holdNextList();
    h.conflictNextCompletion("task-A");
    fireEvent.click(completeButton());
    // Only the original automatic refresh after the real SDK409 can enter
    // this GET. Its original queue/error/refresh logic is not replaced.
    await heldRefresh.started;
    expect(
      window.sessionStorage.getItem("drts.driver.pendingTaskCompletion"),
    ).toBeNull();
    h.select("task-B");
    mounted.rerender(<h.Trip />);
    await ready("task-B");
    const stops = h.stopHeartbeat.mock.calls.length;
    const map = screen
      .getByTestId("driver-map-port")
      .getAttribute("data-location");
    await act(async () => {
      heldRefresh.release();
    });
    await waitFor(() =>
      expect(
        (screen.getByLabelText("實際起步費") as HTMLInputElement).disabled,
      ).toBe(false),
    );
    expect(h.alerts.mock.calls.filter(([title]) => title === "錯誤")).toEqual(
      [],
    );
    expect(h.stopHeartbeat).toHaveBeenCalledTimes(stops);
    expect(
      screen.getByTestId("driver-map-port").getAttribute("data-location"),
    ).toBe(map);
    await pick(h, "B");
    fillFareAndEvidence("B");
    fireEvent.click(completeButton());
    await waitFor(() =>
      expect(
        h.requests
          .filter((request) => request.method === "POST")
          .map((request) => request.pathname),
      ).toEqual([
        "/api/driver/tasks/task-A/complete",
        "/api/driver/tasks/task-B/complete",
      ]),
    );
    expect(
      h.requests.filter((request) => request.method === "POST")[1]!.body.proof
        .photos,
    ).toEqual([btoa("PROOF-B")]);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "完成行程" })).toBeNull(),
    );
  });
});

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
import * as sdk from "../../packages/api-client/src/index";
import * as contracts from "../../packages/contracts/src/index";
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
    value,
    ...props
  }: Props) =>
    React.createElement(
      tag,
      {
        onClick: onPress,
        onChange: onChangeText
          ? (event: any) => onChangeText(event.target.value)
          : undefined,
        "aria-label": accessibilityLabel,
        disabled,
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
      minPhotoCount: 0,
      signoffRequired: false,
      expenseProofRequired: false,
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
        selected.status =
          action[2] === "start"
            ? "on_trip"
            : action[2] === "complete"
              ? "completed"
              : "arrived_pickup";
        if (selected.status === "on_trip") selected.startedAt = body.startedAt;
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
      Image: Box,
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
    "expo-image-picker": {},
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
      Field: visual,
      Input,
      KPI: visual,
      PageHeader: visual,
      Pill: visual,
      Shell: visual,
      driverCanvasTheme: theme,
    },
    "@/components/ui": { AuthorityBanner: visual, PlatformBadge: visual },
    "@/components/driver-trip-map": { __esModule: true, default: Box },
    "@/components/owned-task-rejection-dialog": {
      OwnedTaskRejectionDialog: () => null,
    },
    "@/lib/driver-location-heartbeat": {
      getLatestDriverLocationUpdate: () => null,
      stopDriverLocationHeartbeat: async () => undefined,
      subscribeToDriverLocationUpdates: () => () => undefined,
      syncDriverLocationHeartbeat: async () => ({
        status: "active",
        message: null,
        latestUpdate: null,
      }),
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
    Jobs: load(path.join(root, "apps/driver-app/app/jobs.tsx"))
      .default as React.ComponentType,
    Trip: load(path.join(root, "apps/driver-app/app/trip.tsx"))
      .default as React.ComponentType,
    requests,
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
async function expectSelectedTask(taskId: string) {
  await waitFor(() =>
    expect(screen.getAllByText(taskId).length).toBeGreaterThan(0),
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("Driver selected task custody through normal screens and SDK", () => {
  it.each(["card", "dense"])(
    "routes the %s row's taskId rather than the first task",
    async (layout) => {
      const h = createHarness([
        task("latest-active", "enroute_pickup"),
        task("selected-history", "completed"),
      ]);
      render(<h.Jobs />);
      await screen.findByText("selected-history");
      if (layout === "dense")
        fireEvent.click(screen.getByRole("button", { name: "佇列" }));
      const row = screen
        .getAllByText(/pickup-selected-history/)[0]!
        .closest("button");
      expect(row).not.toBeNull();
      fireEvent.click(row!);
      expect(h.push).toHaveBeenLastCalledWith({
        pathname: "/trip",
        params: { taskId: "selected-history" },
      });
    },
  );

  it("keeps selected task and order through arrival, boarding, completion and reordered refresh", async () => {
    const h = createHarness(
      [
        task("other-terminal", "completed"),
        task("selected-active", "enroute_pickup"),
      ],
      "selected-active",
    );
    render(<h.Trip />);
    await expectSelectedTask("selected-active");
    expect(screen.queryByText("other-terminal")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "抵達上車點" }));
    await waitFor(() =>
      expect(
        h.requests.some((request) =>
          request.pathname.endsWith("/selected-active/arrived_pickup"),
        ),
      ).toBe(true),
    );
    h.reorder();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "開始行程" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "開始行程" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "完成行程" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "完成行程" }));
    await waitFor(() =>
      expect(
        h.requests
          .filter((request) => request.method === "POST")
          .map((request) => request.pathname),
      ).toEqual([
        "/api/driver/tasks/selected-active/arrived_pickup",
        "/api/driver/tasks/selected-active/start",
        "/api/driver/tasks/selected-active/complete",
      ]),
    );
    await expectSelectedTask("selected-active");
    expect(
      h.requests
        .filter((request) => request.pathname.endsWith("/order"))
        .every(
          (request) =>
            request.pathname === "/api/driver/tasks/selected-active/order",
        ),
    ).toBe(true);
  });

  it("preserves the existing first-task entry when no taskId is supplied", async () => {
    const h = createHarness([
      task("original-first", "completed"),
      task("other-history", "completed"),
    ]);
    render(<h.Trip />);
    await expectSelectedTask("original-first");
    expect(screen.queryByText("other-history")).toBeNull();
  });

  it("does not replace a missing selected task with a different actionable task", async () => {
    const h = createHarness(
      [task("other-active", "enroute_pickup")],
      "missing-task",
    );
    render(<h.Trip />);
    await screen.findByText("找不到所選任務，請返回任務清單重新整理。");
    expect(screen.queryByText("other-active")).toBeNull();
    expect(
      h.requests.some((request) => request.pathname.endsWith("/order")),
    ).toBe(false);
    expect(h.requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("keeps a selected forwarded terminal task read-only instead of operating another owned task", async () => {
    const h = createHarness(
      [
        task("other-owned", "enroute_pickup"),
        task("forwarded-closed", "completed", true),
      ],
      "forwarded-closed",
    );
    render(<h.Trip />);
    await expectSelectedTask("forwarded-closed");
    expect(screen.queryByRole("button", { name: "抵達上車點" })).toBeNull();
    expect(screen.queryByRole("button", { name: "開始行程" })).toBeNull();
    expect(screen.queryByRole("button", { name: "完成行程" })).toBeNull();
    expect(
      h.requests.some(
        (request) => request.pathname === "/api/orders/order-forwarded-closed",
      ),
    ).toBe(true);
    expect(h.requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("loads a changed route selection and preserves canonical-list errors without fallback actions", async () => {
    const h = createHarness(
      [task("first-history", "completed"), task("second-history", "completed")],
      "first-history",
    );
    const mounted = render(<h.Trip />);
    await expectSelectedTask("first-history");
    const held = h.holdNextList();
    fireEvent.click(screen.getByRole("button", { name: "重新整理" }));
    await held.started;
    h.select("second-history");
    mounted.rerender(<h.Trip />);
    await expectSelectedTask("second-history");
    await act(async () => {
      held.release();
    });
    expect(screen.queryByText("first-history")).toBeNull();
    await expectSelectedTask("second-history");
    h.failList();
    fireEvent.click(screen.getByRole("button", { name: "重新整理" }));
    await waitFor(() =>
      expect(screen.queryByText("second-history")).toBeNull(),
    );
    expect(h.requests.some((request) => request.method === "POST")).toBe(false);
  });
});

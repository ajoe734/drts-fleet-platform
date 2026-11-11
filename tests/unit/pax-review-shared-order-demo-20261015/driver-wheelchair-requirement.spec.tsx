// @vitest-environment jsdom
import { createRequire } from "node:module";
import path from "node:path";
import type { ReactElement, ReactNode } from "react";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { PLATFORM_CURRENCY } from "@drts/contracts";
import type {
  DriverTaskRecord,
  OwnedOrderRecord,
  UnifiedDriverTaskView,
} from "@drts/contracts";
import TripScreen from "../../../apps/driver-app/app/trip";
import JobsScreen from "../../../apps/driver-app/app/jobs";
import { DriverBottomTabBar } from "../../../apps/driver-app/components/driver-bottom-tab-bar";
import { initializeDriverIdentity } from "../../../apps/driver-app/lib/api-client";

// Actual app React/renderer, Trip/Jobs, task helpers, identity factory and SDK.
// Native views/maps/sensors, Expo navigation and HTTP are simulated boundaries.
// No browser server, device, external platform or PostgreSQL delivery is claimed.
const driverRequire = createRequire(
  path.resolve(import.meta.dirname, "../../../apps/driver-app/package.json"),
);
const React: typeof import("react") = driverRequire("react");
type NativeNode = {
  type: unknown;
  props: Record<string, unknown>;
  children: Array<NativeNode | string>;
  findAll(predicate: (node: NativeNode) => boolean): NativeNode[];
};
type Mounted = { root: NativeNode; unmount(): void };
const renderer: {
  create(element: ReactElement): Mounted;
  act(callback: () => void | Promise<void>): Promise<void>;
} = driverRequire("react-test-renderer");

type Route = { pathname: string; params?: { taskId?: string } };
const ports = vi.hoisted(() => {
  vi.stubEnv("EXPO_PUBLIC_API_URL", "https://driver-replay.example.invalid");
  vi.stubEnv("EXPO_PUBLIC_DRIVER_ID", "driver-replay-sim");
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });
  return {
    selectedTaskId: "task-A",
    navigate: undefined as ((tab: "trip" | "jobs") => void) | undefined,
    push: vi.fn<(route: Route | string) => void>(),
    replace: vi.fn(),
    alerts: vi.fn(),
    heartbeatActive: false,
  };
});

// App-local package paths identify the same modules imported by real screens.
// They do not rely on undeclared root-level React Native/Expo package aliases.
vi.mock("../../../apps/driver-app/node_modules/react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Alert: { alert: ports.alerts },
  Image: "Image",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  Linking: { openURL: vi.fn(), canOpenURL: async () => true },
  Platform: {
    OS: "web",
    select: (options: { web?: unknown; default?: unknown }) =>
      options.web ?? options.default,
  },
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Animated: {
    Value: class {
      setValue() {}
      stopAnimation() {}
      interpolate() {
        return 0;
      }
    },
    View: "AnimatedView",
    spring: () => ({ start() {} }),
    timing: () => ({ start() {} }),
    sequence: () => ({ start() {} }),
  },
}));
vi.mock("../../../apps/driver-app/node_modules/@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));
vi.mock("../../../apps/driver-app/node_modules/expo-router", () => ({
  Redirect: "Redirect",
  useLocalSearchParams: () => ({ taskId: ports.selectedTaskId }),
  useRouter: () => ({
    push: ports.push,
    replace: ports.replace,
    canDismiss: () => false,
    dismissAll: vi.fn(),
  }),
}));
vi.mock("../../../apps/driver-app/node_modules/expo-image-picker", () => ({}));
vi.mock(
  "../../../apps/driver-app/node_modules/react-native-safe-area-context",
  () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  }),
);
vi.mock("../../../apps/driver-app/node_modules/react-native-maps", () => ({
  default: "MapView",
  Marker: "Marker",
  PROVIDER_GOOGLE: "google",
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        apiBaseUrl: "https://driver-replay.example.invalid",
        driverActorId: "driver-replay-sim",
      },
    },
  },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

type VisualProps = {
  children?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  label?: ReactNode;
  body?: ReactNode;
  value?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  bottomBar?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
};
function visual(props: VisualProps) {
  return React.createElement(
    "NativeVisual",
    null,
    props.title,
    props.subtitle,
    props.label,
    props.body,
    props.value,
    props.description,
    props.children,
    props.actions,
    props.footer,
    props.bottomBar,
  );
}
function button(props: VisualProps) {
  return React.createElement(
    "NativeButton",
    { onPress: props.onPress, disabled: props.disabled },
    props.children ?? props.label ?? props.title,
  );
}
vi.mock("@/components/canvas-primitives", async () => {
  const { driverCanvasTheme } = await vi.importActual<
    typeof import("../../../apps/driver-app/components/canvas-primitives")
  >("@/components/canvas-primitives");
  return {
    Banner: visual,
    Btn: button,
    Card: visual,
    DL: visual,
    Field: visual,
    Input: "Input",
    KPI: visual,
    PageHeader: visual,
    Pill: visual,
    Shell: visual,
    driverCanvasTheme,
  };
});
vi.mock("@/components/ui", () => ({
  AuthorityBanner: visual,
  PlatformBadge: visual,
}));
vi.mock("@/lib/driver-location-heartbeat", () => ({
  getLatestDriverLocationUpdate: () => null,
  stopDriverLocationHeartbeat: async () => undefined,
  subscribeToDriverLocationUpdates: () => () => undefined,
  syncDriverLocationHeartbeat: async () => ({
    status: ports.heartbeatActive ? "active" : "idle",
    message: null,
    latestUpdate: null,
  }),
}));
vi.mock("@/lib/driver-tracking-recovery", () => ({
  subscribeTrackingDiagnostic: () => () => undefined,
  formatTrackingGapNotice: () => null,
}));

const mountedScreens: Mounted[] = [];
function text(node: NativeNode | string): string {
  return typeof node === "string" ? node : node.children.map(text).join(" ");
}
function one(nodes: NativeNode[], description: string): NativeNode {
  expect(nodes, description).toHaveLength(1);
  const node = nodes[0];
  if (!node) throw new Error(`Missing ${description}`);
  return node;
}
function trip(mounted: Mounted) {
  return one(
    mounted.root.findAll((node) => node.type === "TripOutlet"),
    "persistent Trip outlet",
  );
}
async function press(node: NativeNode) {
  expect(node.props.disabled).not.toBe(true);
  const onPress = node.props.onPress;
  if (typeof onPress !== "function")
    throw new Error("Native control has no onPress");
  await renderer.act(async () => {
    onPress();
  });
}
async function waitForState(assertion: () => void) {
  await vi.waitFor(async () => {
    await renderer.act(async () => {
      await Promise.resolve();
    });
    assertion();
  });
}

function ownedTask(
  taskId: string,
  status: DriverTaskRecord["status"],
): DriverTaskRecord {
  return {
    taskId,
    orderId: `order-${taskId}`,
    dispatchJobId: `job-${taskId}`,
    assignmentId: `assignment-${taskId}`,
    driverId: "driver-replay-sim",
    vehicleId: "vehicle-sim",
    sourcePlatform: null,
    routeProvided: true,
    waypoints: [],
    status,
    acceptedAt:
      status === "pending_acceptance" ? null : "2026-11-07T06:00:00.000Z",
    departedAt:
      status === "pending_acceptance" ? null : "2026-11-07T06:01:00.000Z",
    arrivedPickupAt:
      status === "pending_acceptance" ? null : "2026-11-07T06:02:00.000Z",
    startedAt:
      status === "pending_acceptance" ? null : "2026-11-07T06:05:00.000Z",
    completedAt: null,
    actualDistanceKm: null,
    actualDurationSec: null,
    fare: null,
    proof: null,
  };
}
function taskView(record: DriverTaskRecord): UnifiedDriverTaskView {
  return {
    taskId: record.taskId,
    orderId: record.orderId,
    orderDomain: "owned",
    sourcePlatform: "drts",
    platformDisplayName: "DRTS",
    externalOrderId: null,
    nativeStatus: record.status,
    localStatus: record.status,
    driverActionState:
      record.status === "completed"
        ? "completed"
        : record.status === "pending_acceptance"
          ? "action_required"
          : "in_progress",
    allowedActions:
      record.status === "completed"
        ? []
        : record.status === "pending_acceptance"
          ? ["accept", "reject"]
          : ["depart"],
    routeLocked: false,
    fareAuthority: "drts",
    settlementAuthority: "drts",
    driverPayoutAuthority: "drts",
    requiresManualFallback: false,
    requiresReauth: false,
    syncIssueSummary: null,
    blockingReason: null,
    pickupSummary: `pickup-${record.taskId}`,
    dropoffSummary: `dropoff-${record.taskId}`,
    deadlineAt: null,
    updatedAt: "2026-11-07T06:30:00.000Z",
    orderSummary: {
      orderId: record.orderId,
      serviceBucket: "standard_taxi",
      serviceProductCode: "taxi_realtime",
      dispatchSemantics: "realtime",
      businessDispatchSubtype: null,
      fixedPrice: false,
      quotedFare: null,
    },
  };
}
function order(record: DriverTaskRecord): OwnedOrderRecord {
  return {
    orderId: record.orderId,
    orderNo: record.orderId,
    orderSource: "app",
    orderDomain: "owned",
    tenantId: null,
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    passengerDisclosure: null,
    serviceBucket: "standard_taxi",
    serviceProductCode: "taxi_realtime",
    dispatchSemantics: "realtime",
    businessDispatchSubtype: null,
    status:
      record.status === "completed"
        ? "completed"
        : record.status === "pending_acceptance"
          ? "assigned"
          : "driver_accepted",
    pickup: { address: `pickup-${record.taskId}`, lat: 25.04, lng: 121.51 },
    dropoff: { address: `dropoff-${record.taskId}`, lat: 25.05, lng: 121.52 },
    passenger: { name: "SIM passenger", phone: "0900000000" },
    bookingId: null,
    bookingType: null,
    etaSnapshot: null,
    callId: null,
    recordingId: null,
    reservationWindowStart: null,
    reservationWindowEnd: null,
    recurrenceRule: null,
    modifiableUntil: null,
    cancelableUntil: null,
    bookedBy: null,
    onsiteContact: null,
    costCenter: null,
    vehiclePreference: null,
    benefitReference: null,
    direction: null,
    flightNo: null,
    terminal: null,
    luggageCount: null,
    notes: null,
    fixedPrice: false,
    quotedFare: null,
    quotedFareSource: null,
    quotedFareRuleVersion: null,
    manualFareOverride: null,
    exceptionHold: null,
    proofRequirements: {
      minPhotoCount: 0,
      signoffRequired: false,
      expenseProofRequired: false,
    },
    approvalState: "not_required",
    approvalRequestIds: [],
    complianceFlags: [],
    cancelledAt: null,
    cancelReason: null,
    reservationHoldStatus: "none",
    reservationHoldId: null,
    reservationHoldExpiresAt: null,
    dispatchAttemptCount: 0,
    lastDispatchFailureReason: null,
    noSupplyEscalation: null,
    dispatchTimeout: null,
    createdAt: "2026-11-07T06:00:00.000Z",
    updatedAt: "2026-11-07T06:30:00.000Z",
  };
}
function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({ data, meta: { traceId: "SIM-driver-replay" } }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function createRequirementHarness(accessible: boolean) {
  const record = ownedTask("task-A", "pending_acceptance");
  if (accessible) record.serviceSelection = { accessible: true };
  const view = taskView(record);
  const owned = order(record);
  if (record.serviceSelection) {
    view.serviceSelection = record.serviceSelection;
    owned.serviceSelection = record.serviceSelection;
  }
  const paths: string[] = [];
  const unexpected: string[] = [];
  const completionRequests: {
    taskId: string;
    body: Record<string, unknown>;
  }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL
          ? String(input)
          : input.url,
      );
      const method = init?.method ?? "GET";
      paths.push(url.pathname);
      if (
        method === "GET" &&
        url.pathname === "/api/admin/flags/driver-app.tasks/enabled"
      )
        return response({ key: "driver-app.tasks", enabled: true });
      if (method === "GET" && url.pathname === "/api/driver/tasks")
        return response({ items: [record] });
      if (method === "GET" && url.pathname === "/api/driver/task-views")
        return response({ items: [view] });
      if (method === "GET" && url.pathname === "/api/platform-presence")
        return response({
          driverId: record.driverId,
          presences: [],
          availablePlatforms: [],
        });
      if (
        method === "GET" &&
        (url.pathname === `/api/driver/tasks/${record.taskId}/order` ||
          url.pathname === `/api/orders/${record.orderId}`)
      )
        return response(owned);
      if (
        method === "POST" &&
        url.pathname === `/api/driver/tasks/${record.taskId}/complete`
      ) {
        const body = JSON.parse(String(init?.body));
        completionRequests.push({ taskId: record.taskId, body });
        Object.assign(record, body, { status: "completed" });
        Object.assign(view, taskView(record));
        owned.status = "completed";
        return response(record);
      }
      unexpected.push(`${method} ${url.pathname}`);
      throw new Error(`Unexpected UC16 HTTP SIM: ${method} ${url.pathname}`);
    }),
  );
  ports.push.mockImplementation((route) => {
    if (
      typeof route === "string" ||
      route.pathname !== "/trip" ||
      route.params?.taskId !== record.taskId
    )
      throw new Error("Unexpected same-order navigation boundary");
    ports.selectedTaskId = route.params.taskId;
    ports.navigate?.("trip");
  });
  function MountedTabs() {
    const [tab, setTab] = React.useState<"trip" | "jobs">("trip");
    const [, changedRoute] = React.useReducer((value: number) => value + 1, 0);
    React.useEffect(() => {
      ports.navigate = (next) => {
        setTab(next);
        changedRoute();
      };
      return () => {
        ports.navigate = undefined;
      };
    }, []);
    return React.createElement(
      "NativeTabsBoundary",
      null,
      React.createElement(
        "TripOutlet",
        { hidden: tab !== "trip" },
        React.createElement(TripScreen),
      ),
      tab === "jobs"
        ? React.createElement(
            "JobsOutlet",
            null,
            React.createElement(JobsScreen),
          )
        : null,
      React.createElement(DriverBottomTabBar, {
        currentRouteName: tab,
        onTabPress: (key) => {
          if (key === "jobs" || key === "trip") ports.navigate?.(key);
        },
      }),
    );
  }
  return {
    record,
    view,
    owned,
    completionRequests,
    paths,
    unexpected,
    async mount() {
      await initializeDriverIdentity();
      let mounted!: Mounted;
      await renderer.act(async () => {
        mounted = renderer.create(React.createElement(MountedTabs));
      });
      mountedScreens.push(mounted);
      await waitForState(() =>
        expect(text(trip(mounted))).toContain("task-A · order-task-A"),
      );
      await waitForState(() =>
        expect(paths).toContain(`/api/driver/tasks/${record.taskId}/order`),
      );
      expect(unexpected).toEqual([]);
      return mounted;
    },
  };
}
beforeEach(() => {
  ports.selectedTaskId = "task-A";
  ports.navigate = undefined;
  ports.push.mockClear();
  ports.replace.mockClear();
  ports.alerts.mockClear();
  ports.heartbeatActive = false;
  window.sessionStorage.clear();
});
afterEach(async () => {
  for (const mounted of mountedScreens.splice(0))
    await renderer.act(async () => {
      mounted.unmount();
    });
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});
afterAll(() => {
  vi.unstubAllEnvs();
});

// Native/HTTP/navigation are explicit external SIMs. Keep actual Jobs, Trip,
// registry-independent task/view renderers, real SDK identity and HTTP calls.
it.each([true, false])(
  "Driver Jobs layouts and normal Trip retain only the same-order wheelchair requirement (%s)",
  async (accessible) => {
    const h = createRequirementHarness(accessible);
    const mounted = await h.mount();
    expect(text(trip(mounted)).includes("輪椅需求")).toBe(accessible);
    const sameTrip = one(
      mounted.root.findAll((node) => node.type === TripScreen),
      "actual persistent Trip",
    );
    await press(
      one(
        mounted.root.findAll(
          (node) =>
            node.type === "Pressable" &&
            node.props.testID === "driver-tab-jobs",
        ),
        "real Jobs tab",
      ),
    );
    function jobs() {
      return one(
        mounted.root.findAll((node) => node.type === "JobsOutlet"),
        "actual Jobs outlet",
      );
    }
    await waitForState(() => expect(text(jobs())).toContain(h.record.taskId));
    expect(text(jobs()).includes("輪椅需求")).toBe(accessible);
    await press(
      one(
        jobs().findAll(
          (node) => node.type === "NativeButton" && text(node) === "佇列",
        ),
        "actual dense-layout toggle",
      ),
    );
    expect(text(jobs()).includes("輪椅需求")).toBe(accessible);
    await press(
      one(
        jobs().findAll(
          (node) =>
            node.type === "Pressable" &&
            node.props.accessibilityRole === "button" &&
            text(node).includes(h.record.taskId),
        ),
        "same task real Jobs row",
      ),
    );
    expect(ports.push).toHaveBeenLastCalledWith({
      pathname: "/trip",
      params: { taskId: h.record.taskId },
    });
    expect(
      one(
        mounted.root.findAll((node) => node.type === TripScreen),
        "same persistent Trip",
      ),
    ).toBe(sameTrip);
    expect(text(trip(mounted))).toContain(
      `${h.record.taskId} · ${h.record.orderId}`,
    );
    expect(text(trip(mounted)).includes("輪椅需求")).toBe(accessible);
    expect(h.unexpected).toEqual([]);
    expect(ports.alerts).not.toHaveBeenCalled();
  },
);

function normalMultiTaxiCompletionHarness(fixedPrice: boolean) {
  const h = createRequirementHarness(true);
  ports.heartbeatActive = true;
  h.record.status = "on_trip";
  h.record.startedAt = new Date().toISOString();
  Object.assign(h.view, taskView(h.record), { allowedActions: ["complete"] });
  Object.assign(h.owned, {
    runtimeProfileCode: "multi_taxi_direct",
    serviceProductCode: "taxi_reservation",
    dispatchSemantics: "reservation",
    status: "on_trip",
    fixedPrice,
    quotedFare: fixedPrice
      ? { currency: PLATFORM_CURRENCY, amountMinor: 12000 }
      : null,
  });
  return h;
}
function completeControl(mounted: Mounted) {
  return one(
    trip(mounted).findAll(
      (node) => node.type === "NativeButton" && text(node) === "完成行程",
    ),
    "actual Trip complete button",
  );
}
async function enterFare(mounted: Mounted, label: string, value: string) {
  const field = one(
    trip(mounted).findAll(
      (node) => node.type === visual && node.props.label === label,
    ),
    label,
  );
  const control = one(
    field.findAll((node) => node.type === "Input"),
    `${label} actual Input`,
  );
  const change = control.props.onChangeText;
  if (typeof change !== "function") throw new Error("Fare Input unavailable");
  await renderer.act(async () => {
    change(value);
  });
}

it("normal multi-taxi metered Trip explains the required fare before completing the same wheelchair task with entered values", async () => {
  const h = normalMultiTaxiCompletionHarness(false);
  const mounted = await h.mount();
  expect(text(trip(mounted))).toContain("輪椅需求");
  await waitForState(() =>
    expect(text(trip(mounted))).toContain(
      "本行程完單需填齊四項車資與實際總額；未發生的項目請填 0。",
    ),
  );
  expect(text(trip(mounted))).not.toContain("全空可沿用原完單方式");
  expect(completeControl(mounted).props.disabled).toBe(true);
  expect(h.completionRequests).toEqual([]);
  for (const [label, value] of [
    ["實際起步費", "85"],
    ["實際里程費", "10"],
    ["實際延滯費", "0"],
    ["實際夜間加成", "0"],
    ["實際車資總額", "95"],
  ])
    await enterFare(mounted, label!, value!);
  await waitForState(() =>
    expect(completeControl(mounted).props.disabled).toBe(false),
  );
  await press(completeControl(mounted));
  await waitForState(() => expect(h.completionRequests).toHaveLength(1));
  expect(h.completionRequests[0]).toMatchObject({
    taskId: h.record.taskId,
    body: {
      actualFareBreakdown: {
        startMinor: 8500,
        distanceMinor: 1000,
        delayMinor: 0,
        nightMinor: 0,
      },
      fare: { currency: PLATFORM_CURRENCY, amountMinor: 9500 },
    },
  });
  expect(h.record.orderId).toBe(h.owned.orderId);
  await waitForState(() => expect(h.record.status).toBe("completed"));
  expect(h.unexpected).toEqual([]);
});

it("normal multi-taxi fixed-price Trip keeps its approved fare when completion fields are blank", async () => {
  const h = normalMultiTaxiCompletionHarness(true);
  const mounted = await h.mount();
  await waitForState(() =>
    expect(text(trip(mounted))).toContain("固定價行程沿用訂單核定車資"),
  );
  expect(text(trip(mounted))).not.toContain(
    "本行程完單需填齊四項車資與實際總額",
  );
  await waitForState(() =>
    expect(completeControl(mounted).props.disabled).toBe(false),
  );
  await press(completeControl(mounted));
  await waitForState(() => expect(h.completionRequests).toHaveLength(1));
  expect(h.completionRequests[0]?.taskId).toBe(h.record.taskId);
  expect(h.completionRequests[0]?.body).not.toHaveProperty("fare");
  expect(h.completionRequests[0]?.body).not.toHaveProperty(
    "actualFareBreakdown",
  );
  expect(h.owned.quotedFare).toEqual({
    currency: PLATFORM_CURRENCY,
    amountMinor: 12000,
  });
  expect(h.unexpected).toEqual([]);
});

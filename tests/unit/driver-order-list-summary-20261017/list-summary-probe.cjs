/* eslint-disable @typescript-eslint/no-require-imports -- The isolated CommonJS loader executes actual Driver TS/TSX modules with their own alias and React instance. */
/* Task-local Node loader isolates Driver's @ alias from root Tenant tests.
 * Only native/location/router/storage/network boundaries are fixtures.
 * Workspace, Jobs, Canvas, task summaries, client and SDK are real. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const root = path.resolve(__dirname, "../../..");
const app = path.join(root, "apps/driver-app");
const appRequire = Module.createRequire(path.join(app, "package.json"));
const React = appRequire("react");
const JSXRuntime = appRequire("react/jsx-runtime");
const { act, create } = appRequire("react-test-renderer");
const ts = require("typescript");
const [scenario] = process.argv.slice(2);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.env.EXPO_PUBLIC_API_URL = "https://example.invalid";
process.env.EXPO_PUBLIC_DRIVER_ID = "fixture-driver";
const store = new Map();
const pendingKey = "drts.driver.pendingTaskCompletion";
let storageFail = false;
const alerts = [];
const native = Object.fromEntries(
  [
    "View",
    "Text",
    "TextInput",
    "Pressable",
    "ScrollView",
    "KeyboardAvoidingView",
    "ActivityIndicator",
    "Image",
  ].map((name) => [name, name]),
);
native.Modal = (props) =>
  props.visible ? React.createElement("Modal", props, props.children) : null;
Object.assign(native, {
  Platform: {
    OS: scenario.startsWith("web-") ? "web" : "ios",
    select: (choices) => choices.ios ?? choices.default,
  },
  StyleSheet: {
    create: (value) => value,
    absoluteFillObject: {},
    hairlineWidth: 1,
  },
  Alert: { alert: (...args) => alerts.push(args) },
  Linking: { canOpenURL: async () => true, openURL: async () => {} },
});
const secure = {
  getItemAsync: async (key) => store.get(key) ?? null,
  setItemAsync: async (key, value) => {
    if (storageFail && key === pendingKey)
      throw new Error("fixture storage unavailable");
    assert.equal(typeof value, "string");
    store.set(key, value);
  },
  deleteItemAsync: async (key) => {
    store.delete(key);
  },
};
const tracking = {
  syncDriverLocationHeartbeat: async () => ({
    status: scenario === "tracking" ? "error" : "active",
    message: null,
    latestUpdate: null,
  }),
  stopDriverLocationHeartbeat: async () => {},
  subscribeToDriverLocationUpdates: () => () => {},
  getLatestDriverLocationUpdate: () => null,
};
const compile = (m, filename, source) =>
  m._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
for (const ext of [".ts", ".tsx"])
  Module._extensions[ext] = (m, filename) =>
    compile(m, filename, fs.readFileSync(filename, "utf8"));
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "react") return React;
  if (request === "react/jsx-runtime") return JSXRuntime;
  if (request === "react-native") return native;
  if (request === "@expo/vector-icons") return { Ionicons: "Ionicons" };
  if (request === "react-native-safe-area-context")
    return {
      useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    };
  if (request === "expo-router")
    return { Redirect: "Redirect", useRouter: () => ({ replace: () => {} }) };
  if (request === "expo-image-picker") return {};
  if (request === "expo-constants")
    return { default: { expoConfig: { extra: {} } } };
  if (request === "expo-secure-store") return secure;
  if (request === "react-native-maps")
    return {
      __esModule: true,
      default: "MapView",
      Marker: "Marker",
      PROVIDER_GOOGLE: "google",
    };
  if (request === "@/lib/driver-location-heartbeat") return tracking;
  if (request === "@/lib/driver-tracking-recovery")
    return {
      subscribeTrackingDiagnostic: () => () => {},
      formatTrackingGapNotice: () => "",
    };
  if (request.startsWith("@/")) request = path.join(app, request.slice(2));
  if (request === "@drts/contracts")
    request = path.join(root, "packages/contracts/src/index.ts");
  if (request === "@drts/api-client")
    request = path.join(root, "packages/api-client/src/index.ts");
  if (request === "@drts/ui-tokens")
    request = path.join(root, "packages/ui-tokens/src/index.ts");
  if (request === "@drts/ui-web/canvas-tokens")
    request = path.join(root, "packages/ui-web/src/canvas-tokens.ts");
  return originalLoad.call(this, request, parent, isMain);
};

const animation = () => ({
  start: (done) => done?.({ finished: true }),
  stop() {},
});
native.Animated = {
  Value: class {
    setValue() {}
    interpolate() {
      return 0;
    }
    stopAnimation() {}
    addListener() {
      return "fixture";
    }
    removeListener() {}
  },
  View: "AnimatedView",
  spring: animation,
  timing: animation,
  sequence: animation,
};
native.PanResponder = { create: () => ({ panHandlers: {} }) };
const tasks = Array.from({ length: 56 }, (_, i) => ({
  taskId: `task-${i}`,
  orderId: `order-${i}`,
  driverId: "fixture-driver",
  vehicleId: "fixture-vehicle",
  status: i === 0 ? "accepted" : "completed",
  sourcePlatform: null,
  routeProvided: false,
  waypoints: [],
}));
const orderFor = (orderId) => ({
  orderId,
  serviceBucket: "standard_taxi",
  businessDispatchSubtype: null,
  dispatchSemantics: "reservation",
  serviceProductCode: "taxi_reservation",
  fixedPrice: false,
  quotedFare: {
    currency: "TWD",
    amountMinor: orderId === "order-0" ? 12300 : 9800,
  },
});
const views = tasks.map((task, i) => ({
  taskId: task.taskId,
  orderId: task.orderId,
  orderDomain: "owned",
  sourcePlatform: "drts",
  platformDisplayName: "DRTS",
  externalOrderId: null,
  nativeStatus: null,
  localStatus: task.status,
  driverActionState: i === 0 ? "in_progress" : "completed",
  allowedActions: i === 0 ? ["depart"] : [],
  routeLocked: false,
  fareAuthority: "drts",
  settlementAuthority: "drts",
  driverPayoutAuthority: "drts",
  requiresManualFallback: false,
  requiresReauth: false,
  syncIssueSummary: null,
  blockingReason: null,
  pickupSummary: `pickup-${i}`,
  dropoffSummary: `dropoff-${i}`,
  deadlineAt: null,
  updatedAt: new Date().toISOString(),
  orderSummary: orderFor(task.orderId),
}));
let detailReads = 0;
const requests = [];
const wire = (data) =>
  Array.isArray(data)
    ? data.map(wire)
    : data && typeof data === "object"
      ? Object.fromEntries(
          Object.entries(data).map(([key, value]) => [
            key.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()),
            wire(value),
          ]),
        )
      : data;
const response = (data) =>
  new Response(JSON.stringify({ data: wire(data), meta: {} }), { status: 200 });
globalThis.fetch = async (url) => {
  assert.equal(
    new URL(url).origin,
    "https://example.invalid",
    "offline fixture only",
  );
  const p = new URL(url).pathname;
  requests.push(p);
  if (p === "/api/driver/task-views") return response(views);
  if (p === "/api/driver/tasks") return response(tasks);
  if (p === "/api/platform-presence")
    return response({
      driverId: "fixture-driver",
      presences: [],
      adapters: [],
    });
  if (p.startsWith("/api/features") || p.startsWith("/api/feature-flags"))
    return response([]);
  if (p.startsWith("/api/notifications") || p.startsWith("/api/shifts"))
    return response([]);
  if (/^\/api\/driver\/tasks\/[^/]+\/order$/.test(p)) {
    detailReads++;
    return response(
      orderFor(tasks.find((t) => p.includes("/" + t.taskId + "/"))?.orderId),
    );
  }
  if (p.startsWith("/api/orders/")) {
    detailReads++;
    return response(orderFor(p.split("/").at(-1)));
  }
  throw new Error("Unhandled original SDK fixture request " + p);
};
(async () => {
  const api = require(path.join(app, "lib/api-client.ts"));
  await api.initializeDriverIdentity();
  const page = scenario.includes("jobs") ? "jobs.tsx" : "index.tsx";
  const Screen = require(path.join(app, "app", page)).default;
  let r;
  try {
    await act(async () => {
      r = create(React.createElement(Screen));
      for (let i = 0; i < 100; i++) await Promise.resolve();
    });
    assert.ok(
      requests.includes("/api/driver/task-views"),
      "real page and SDK must read the original task view endpoint",
    );
    const text = JSON.stringify(r.toJSON());
    assert.ok(text.includes("pickup-0"), "active task route remains visible");
    assert.ok(text.includes("123"), "active fare remains visible");
    if (page === "jobs.tsx")
      assert.ok(text.includes("pickup-55"), "historical rows remain visible");
    else
      assert.ok(
        text.includes("5,390"),
        "historical fares still contribute to the existing daily summary",
      );
    assert.equal(
      detailReads,
      0,
      `one summary response already supplies all56 current/historical orders; saw ${detailReads} redundant detail GETs`,
    );
    console.log(
      JSON.stringify({
        actualPageAndSDK: true,
        page,
        tasks: views.length,
        detailReads,
      }),
    );
  } finally {
    if (r) await act(async () => r.unmount());
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

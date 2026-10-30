/* eslint-disable @typescript-eslint/no-require-imports -- The isolated CommonJS loader executes actual Driver TS/TSX modules with their own alias and React instance. */
/* Task-local Node loader isolates Driver's @ alias from root Tenant tests.
 * Only native/location/router/storage/network boundaries are fixtures.
 * Trip, Canvas Field/Input/Btn, parser, proof, workflow, replay hook, client and SDK are real. */
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
    return {
      Redirect: "Redirect",
      useRouter: () => ({ replace: () => {} }),
      useLocalSearchParams: () => ({}),
    };
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

let task = {
  taskId: "owned-task-1",
  orderId: "same-order-1",
  driverId: "fixture-driver",
  vehicleId: "fixture-vehicle",
  sourcePlatform: scenario === "forwarded" ? "fixture-platform" : null,
  status: scenario === "accepted" ? "accepted" : "pending_acceptance",
  routeProvided: false,
  waypoints: [],
};
let order = {
  orderId: task.orderId,
  pickup: { address: "fixture pickup", lat: 25.0142, lng: 121.4636 },
  dropoff: { address: "fixture dropoff", lat: 25.012, lng: 121.4654 },
  proofRequirements: {
    minPhotoCount: 0,
    signoffRequired: false,
    expenseProofRequired: false,
  },
  passenger: { name: "fixture", phone: "0000000000" },
};
const response = (data, status = 200) =>
  new Response(JSON.stringify({ data, meta: {} }), { status });
let orderReadStatus = 200;
let orderReads = 0;
globalThis.fetch = async (url) => {
  assert.equal(
    new URL(url).origin,
    "https://example.invalid",
    "no real network allowed",
  );
  const pathname = new URL(url).pathname;
  if (pathname === "/api/driver/tasks") return response([task]);
  if (pathname === "/api/driver/task-views")
    return response(
      scenario === "legacy"
        ? []
        : [
            {
              taskId: task.taskId,
              orderId: task.orderId,
              orderDomain: scenario === "forwarded" ? "forwarded" : "owned",
              sourcePlatform:
                scenario === "forwarded" ? "fixture-platform" : "drts",
              localStatus: task.status,
              driverActionState: "action_required",
              allowedActions:
                scenario === "not-allowed" ? ["accept"] : ["accept", "reject"],
              routeLocked: false,
              fareAuthority: "drts",
              settlementAuthority: "drts",
              driverPayoutAuthority: "drts",
              requiresManualFallback: false,
              requiresReauth: false,
            },
          ],
    );
  if (pathname === "/api/platform-presence") return response({ presences: [] });
  if (
    pathname.startsWith("/api/orders/") ||
    /^\/api\/driver\/tasks\/[^/]+\/order$/.test(pathname)
  ) {
    orderReads++;
    if (orderReadStatus !== 200)
      return new Response(
        JSON.stringify({
          error: {
            code: "FIXTURE_REFRESH_FAILED",
            message: "fixture order refresh unavailable",
            retryable: orderReadStatus !== 403,
          },
        }),
        { status: orderReadStatus },
      );
    return response(order);
  }
  throw new Error("unhandled fixture request " + pathname);
};
const flatten = (n) =>
  typeof n === "string" ? n : (n.children ?? []).map(flatten).join("");
const find = (r, label) =>
  r.root.findAll((n) => n.type === "Pressable" && flatten(n) === label);
const button = (r, label) => {
  const rows = find(r, label);
  assert.equal(rows.length, 1, "expected one " + label);
  return rows[0];
};
async function press(r, label) {
  const b = button(r, label);
  assert.equal(b.props.disabled, false);
  await act(async () => {
    b.props.onPress();
  });
}
async function tick() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
(async () => {
  const api = require(path.join(app, "lib/api-client.ts"));
  await api.initializeDriverIdentity();
  const Trip = require(path.join(app, "app/trip.tsx")).default;
  let r;
  const settle = async () => {
    for (let i = 0; i < 12; i++) await tick();
  };
  await act(async () => {
    r = create(React.createElement(Trip));
    await settle();
  });
  const text = () =>
    r.root
      .findAll((n) => n.type === "Text")
      .map(flatten)
      .join("\n");
  try {
    assert.ok(
      text().includes("fixture pickup"),
      "initial successful read must show pickup",
    );
    assert.ok(
      text().includes("fixture dropoff"),
      "initial successful read must show dropoff",
    );
    orderReadStatus = scenario === "503" ? 503 : scenario === "403" ? 403 : 429;
    if (scenario === "different")
      task = { ...task, taskId: "owned-task-2", orderId: "same-order-2" };
    await press(r, "重新整理");
    await act(settle);
    assert.ok(
      orderReads >= 2,
      "exercise the original SDK refresh, not an injected state",
    );
    if (["different", "403"].includes(scenario)) {
      assert.ok(
        !text().includes("fixture pickup"),
        "never reuse a previous/different unavailable order",
      );
    } else {
      assert.ok(
        text().includes("fixture pickup"),
        "a temporary same-order refresh failure must not erase pickup",
      );
      assert.ok(
        text().includes("fixture dropoff"),
        "a temporary same-order refresh failure must not erase dropoff",
      );
      assert.ok(
        text().includes("行程資料暫時無法更新"),
        "the screen must disclose its retained snapshot",
      );
    }
    if (scenario === "recover") {
      orderReadStatus = 200;
      order = {
        ...order,
        pickup: { ...order.pickup, address: "updated pickup" },
      };
      await press(r, "重新整理");
      await act(settle);
      assert.ok(
        text().includes("updated pickup"),
        "a later successful refresh must replace the snapshot",
      );
      assert.ok(
        !text().includes("行程資料暫時無法更新"),
        "success clears the temporary-refresh notice",
      );
    }
    process.stdout.write(
      JSON.stringify({
        scenario,
        actualTripAndSDK: true,
        orderReads,
        retainedSameOrderOnly: true,
      }) + "\n",
    );
  } finally {
    await act(async () => r.unmount());
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

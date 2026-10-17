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
const order = {
  orderId: task.orderId,
  pickup: { address: "fixture pickup" },
  dropoff: { address: "fixture dropoff" },
  proofRequirements: {
    minPhotoCount: 0,
    signoffRequired: false,
    expenseProofRequired: false,
  },
  passenger: { name: "fixture", phone: "0000000000" },
};
const requests = [];
let fail = scenario === "error";
let resolveReject = null;
const response = (data, status = 200) =>
  new Response(JSON.stringify({ data, meta: {} }), { status });
globalThis.fetch = async (url, init = {}) => {
  assert.equal(
    new URL(url).origin,
    "https://example.invalid",
    "no real network allowed",
  );
  const pathname = new URL(url).pathname;
  if (pathname === "/api/driver/tasks/owned-task-1/reject") {
    requests.push({
      path: pathname,
      method: init.method,
      body: JSON.parse(init.body),
    });
    if (scenario === "busy")
      await new Promise((resolve) => {
        resolveReject = resolve;
      });
    if (fail)
      return new Response(
        JSON.stringify({
          error: {
            code: "FIXTURE_UNAVAILABLE",
            message: "fixture rejection unavailable",
            retryable: true,
          },
        }),
        { status: 503 },
      );
    task = { ...task, status: "rejected" };
    return response(task, 201);
  }
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
  )
    return response(order);
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
  await act(async () => {
    r = create(React.createElement(Trip));
    await tick();
  });
  try {
    if (["forwarded", "accepted", "not-allowed"].includes(scenario)) {
      assert.equal(find(r, "婉拒任務").length, 0);
      assert.equal(requests.length, 0);
    } else {
      await press(r, "婉拒任務");
      assert.equal(
        requests.length,
        0,
        "opening a reason dialog must not reject",
      );
      if (scenario === "cancel") {
        await press(r, "保留任務");
        assert.equal(requests.length, 0);
        assert.equal(task.status, "pending_acceptance");
      } else {
        const input = r.root.findAll(
          (n) =>
            n.type === "TextInput" && n.props.placeholder === "可補充婉拒原因",
        );
        assert.equal(input.length, 1);
        await act(async () => {
          input[0].props.onChangeText(
            scenario === "no-note" ? "  " : "  車輛需先整理  ",
          );
        });
        await press(r, "確認婉拒");
        assert.equal(requests.length, 1);
        assert.deepEqual(requests[0], {
          path: "/api/driver/tasks/owned-task-1/reject",
          method: "POST",
          body:
            scenario === "no-note"
              ? { reasonCode: "driver_rejected" }
              : { reasonCode: "driver_rejected", reasonNote: "車輛需先整理" },
        });
        if (scenario === "error") {
          assert.equal(task.status, "pending_acceptance");
          assert.ok(
            r.root.findAll(
              (n) =>
                n.type === "Text" &&
                flatten(n).includes("fixture rejection unavailable"),
            ).length > 0,
          );
          fail = false;
          await press(r, "確認婉拒");
          assert.equal(requests.length, 2);
          assert.equal(task.status, "rejected");
        } else if (scenario === "busy") {
          assert.equal(button(r, "確認婉拒").props.disabled, true);
          assert.equal(button(r, "接受任務").props.disabled, true);
          await act(async () => {
            resolveReject();
            await tick();
          });
          assert.equal(task.status, "rejected");
          assert.equal(requests.length, 1);
        } else assert.equal(task.status, "rejected");
        assert.equal(
          find(r, "婉拒任務").length,
          0,
          "authority readback must remove the pending-offer action",
        );
      }
    }
    process.stdout.write(
      JSON.stringify({
        scenario,
        actualTripAndSDK: true,
        rejectionRequests: requests,
        taskStatus: task.status,
      }) + "\n",
    );
  } finally {
    await act(async () => r.unmount());
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

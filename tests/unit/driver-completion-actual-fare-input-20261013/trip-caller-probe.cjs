/* Task-local Node loader isolates Driver's @ alias from root Tenant tests.
 * Only native/location/router/storage/network boundaries are fixtures.
 * Trip, Canvas Field/Input/Btn, parser, proof, workflow, replay hook, client and SDK are real. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../../..");
const app = path.join(root, "apps/driver-app");
const appRequire = Module.createRequire(path.join(app, "package.json"));
const React = appRequire("react");
const { act, create } = appRequire("react-test-renderer");
const ts = require("typescript");
const [scenario, baseline] = process.argv.slice(2);
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
Object.assign(native, {
  Platform: { OS: "ios", select: (choices) => choices.ios ?? choices.default },
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
  if (request === "react/jsx-runtime") return appRequire(request);
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
const { driverStrings } = require(path.join(app, "lib/strings.ts"));
let task = {
  taskId: "task-1",
  orderId: "order-1",
  driverId: "fixture-driver",
  vehicleId: "fixture-vehicle",
  sourcePlatform: scenario === "forwarded" ? "fixture-platform" : null,
  status: "on_trip",
  startedAt: new Date(Date.now() - 900000).toISOString(),
  actualDistanceKm: 8.25,
  actualDurationSec: null,
  fare: { currency: "TWD", amountMinor: 99999 },
  routeProvided: false,
  waypoints: [],
};
let order = {
  orderId: "order-1",
  fixedPrice: scenario === "fixed" || scenario === "order-switch",
  quotedFare: { currency: "NTD", amountMinor: 12000 },
  pickup: { address: "fixture pickup" },
  dropoff: { address: "fixture dropoff" },
  proofRequirements: {
    minPhotoCount: scenario === "proof" ? 1 : 0,
    signoffRequired: false,
    expenseProofRequired: scenario === "capture" || scenario === "replay",
  },
  passenger: { name: "fixture", phone: "0000000000" },
};
const requests = [];
let failCompletion = scenario.includes("replay") || scenario === "server-error";
let switchOnError = failCompletion;
let deferredOrder = null;
const response = (data) =>
  new Response(JSON.stringify({ data, meta: {} }), { status: 200 });
globalThis.fetch = async (url, init) => {
  assert.equal(
    new URL(url).origin,
    "https://example.invalid",
    "no real network allowed",
  );
  const pathname = new URL(url).pathname;
  if (pathname.endsWith("/complete")) {
    requests.push({
      url,
      body: JSON.parse(init.body),
      headers: Object.fromEntries(new Headers(init.headers)),
    });
    if (switchOnError) {
      task = { ...task, taskId: "task-2", orderId: "order-2" };
      order = { ...order, orderId: "order-2" };
      switchOnError = false;
    }
    if (failCompletion)
      return new Response(
        JSON.stringify({
          error: {
            code:
              scenario === "server-error"
                ? "ACTUAL_FARE_BREAKDOWN_INVALID"
                : "FIXTURE_OFFLINE",
            message: "fixture completion rejected",
            retryable: true,
          },
        }),
        { status: 503 },
      );
    return response({ ...task, status: "completed" });
  }
  if (pathname === "/api/driver/tasks") return response([task]);
  if (pathname === "/api/driver/task-views") return response([]);
  if (pathname === "/api/platform-presence") return response({ presences: [] });
  if (pathname.startsWith("/api/orders/")) {
    if (deferredOrder) await deferredOrder;
    return response(order);
  }
  throw new Error("unhandled fixture request " + pathname);
};
const flatten = (n) =>
  typeof n === "string" ? n : (n.children ?? []).map(flatten).join("");
const text = (r) =>
  r.root
    .findAll((n) => n.type === "Text")
    .map(flatten)
    .join("\n");
const fields = (r) =>
  r.root.findAll(
    (n) =>
      n.type === "TextInput" &&
      n.props.placeholder === driverStrings.trip.actualFare.placeholder,
  );
const button = (r, label) => {
  const result = r.root.findAll(
    (n) => n.type === "Pressable" && flatten(n) === label,
  );
  assert.equal(result.length, 1, "expected one " + label);
  return result[0];
};
async function enter(r, field, value) {
  const inputs = fields(r);
  if (baseline && inputs.length === 0) return;
  const index = [
    "startMinor",
    "distanceMinor",
    "delayMinor",
    "nightMinor",
    "aggregate",
  ].indexOf(field);
  assert.ok(
    inputs[index]?.props.editable,
    "actual native input must be editable",
  );
  await act(async () => {
    inputs[index].props.onChangeText(value);
  });
}
async function fill(r) {
  const zeros = scenario.startsWith("zero");
  for (const [field, value] of Object.entries({
    startMinor: zeros ? "0" : "35",
    distanceMinor: zeros ? "0.00" : "55.50",
    delayMinor: zeros ? "0" : "10",
    nightMinor: "0",
    aggregate: zeros ? "0" : "107",
  })) {
    if (scenario === "fixed" && field === "aggregate") continue;
    await enter(r, field, value);
  }
  if (order.proofRequirements.expenseProofRequired) {
    const proofInputs = r.root.findAll(
      (n) =>
        n.type === "TextInput" &&
        n.props.placeholder !== driverStrings.trip.actualFare.placeholder,
    );
    for (const [index, value] of [
      "fixture toll",
      "7",
      "fixture attachment",
    ].entries()) {
      await act(async () => {
        proofInputs[index].props.onChangeText(value);
      });
    }
  }
}
async function press(r, label) {
  const b = button(r, label);
  assert.equal(b.props.disabled, false);
  await act(async () => {
    b.props.onPress();
  });
}
const expected = {
  startMinor: 3500,
  distanceMinor: 5550,
  delayMinor: 1000,
  nightMinor: 0,
};
function assertCapture(command) {
  assert.deepEqual(
    command.actualFareBreakdown,
    scenario.startsWith("zero")
      ? { startMinor: 0, distanceMinor: 0, delayMinor: 0, nightMinor: 0 }
      : expected,
    "actual completion command lost entered components",
  );
  if (scenario === "fixed") assert.ok(!Object.hasOwn(command, "fare"));
  else
    assert.deepEqual(command.fare, {
      currency: "TWD",
      amountMinor: scenario.startsWith("zero") ? 0 : 10700,
    });
  if (scenario === "capture" || scenario === "replay")
    assert.deepEqual(command.proof.expenseItems, [
      {
        type: "fixture toll",
        amountMinor: 700,
        attachmentId: "fixture attachment",
      },
    ]);
  assert.equal(command.actualDistanceKm, 8.25);
  assert.ok(command.actualDurationSec >= 900);
}
(async () => {
  let api = require(path.join(app, "lib/api-client.ts"));
  await api.initializeDriverIdentity();
  const filename = path.join(app, "app/trip.tsx");
  let Trip;
  if (baseline) {
    const m = new Module(filename, module);
    m.filename = filename;
    m.paths = Module._nodeModulePaths(path.dirname(filename));
    compile(
      m,
      filename,
      execFileSync(
        "git",
        ["show", baseline + ":apps/driver-app/app/trip.tsx"],
        { encoding: "utf8" },
      ),
    );
    Trip = m.exports.default;
  } else Trip = require(filename).default;
  let r;
  try {
    await act(async () => {
      r = create(React.createElement(Trip));
    });
    if (scenario === "forwarded") {
      assert.equal(fields(r).length, 0);
      assert.equal(
        r.root.findAll(
          (n) => n.type === "Pressable" && flatten(n) === "完成行程",
        ).length,
        0,
      );
    } else if (
      ["partial", "invalid", "missing-total", "overflow"].includes(scenario)
    ) {
      await fill(r);
      if (scenario === "partial") await enter(r, "nightMinor", " ");
      if (scenario === "invalid") await enter(r, "startMinor", "35.001");
      if (scenario === "missing-total") await enter(r, "aggregate", "");
      if (scenario === "overflow")
        await enter(r, "startMinor", "90071992547409.91");
      assert.equal(button(r, "完成行程").props.disabled, true);
      assert.ok(
        text(r).includes(
          driverStrings.trip.actualFare.errors[
            {
              partial: "partial",
              invalid: "invalid",
              "missing-total": "aggregate",
              overflow: "overflow",
            }[scenario]
          ],
        ),
      );
      // Invoke real footer callback directly as a bypass attempt; handler must also reject.
      const { Btn } = require(
        path.join(app, "components/canvas-primitives/index.tsx"),
      );
      const complete = r.root.findAll(
        (n) => n.type === Btn && flatten(n) === "完成行程",
      );
      await act(async () => {
        complete[0].props.onPress();
      });
      assert.equal(requests.length, 0);
      assert.ok(!store.has(pendingKey));
    } else if (scenario === "tracking" || scenario === "proof") {
      await fill(r);
      assert.equal(button(r, "完成行程").props.disabled, true);
      assert.equal(requests.length, 0);
    } else if (scenario === "reset" || scenario === "order-switch") {
      if (scenario === "reset") await fill(r);
      else {
        for (const field of [
          "startMinor",
          "distanceMinor",
          "delayMinor",
          "nightMinor",
        ])
          await enter(r, field, "1");
        assert.equal(fields(r).length, 4);
      }
      task = { ...task, taskId: "task-2", orderId: "order-2" };
      let release;
      if (scenario === "order-switch")
        deferredOrder = new Promise((resolve) => {
          release = resolve;
        });
      order = { ...order, orderId: "order-2", fixedPrice: false };
      await press(r, "重新整理");
      assert.ok(fields(r).every((n) => n.props.value === ""));
      if (scenario === "order-switch") {
        assert.equal(button(r, "完成行程").props.disabled, true);
        assert.ok(fields(r).every((n) => n.props.editable === false));
        await act(async () => {
          deferredOrder = null;
          release();
        });
        assert.equal(fields(r).length, 5);
        assert.equal(button(r, "完成行程").props.disabled, false);
      }
      assert.equal(requests.length, 0);
    } else {
      if (!scenario.startsWith("legacy")) await fill(r);
      if (scenario === "storage-failure") storageFail = true;
      await press(r, "完成行程");
      if (scenario === "storage-failure") {
        assert.equal(requests.length, 0);
        assert.ok(!store.has(pendingKey));
        assert.equal(fields(r)[0].props.value, "35");
        storageFail = false;
        await press(r, "完成行程");
        assertCapture(requests[0].body);
      } else {
        assert.equal(
          requests.length,
          1,
          "other active task must not auto-replay old task",
        );
        if (scenario.startsWith("legacy")) {
          assert.ok(!Object.hasOwn(requests[0].body, "fare"));
          assert.ok(!Object.hasOwn(requests[0].body, "actualFareBreakdown"));
        } else assertCapture(requests[0].body);
        if (scenario.includes("replay") || scenario === "server-error") {
          assert.ok(text(r).includes("fixture completion rejected"));
          const raw = store.get(pendingKey);
          const pending = JSON.parse(raw);
          assert.equal(pending.taskId, "task-1");
          assert.deepEqual(pending.command, requests[0].body);
          assert.equal(requests[0].headers["x-request-id"], pending.requestId);
          assert.equal(
            requests[0].headers["idempotency-key"],
            pending.requestId,
          );
          assert.ok(
            fields(r).every((n) => n.props.value === ""),
            "task switch clears old draft",
          );
          await act(async () => {
            r.unmount();
          });
          r = null;
          // Lose JS module state; preserve only raw SecureStore strings.
          delete require.cache[
            require.resolve(path.join(app, "lib/api-client.ts"))
          ];
          api = require(path.join(app, "lib/api-client.ts"));
          await api.initializeDriverIdentity();
          await assert.rejects(
            api.replayPendingDriverTaskCompletion(),
            /fixture completion rejected/,
          );
          assert.equal(
            store.get(pendingKey),
            raw,
            "failed replay preserves original JSON",
          );
          failCompletion = false;
          await api.replayPendingDriverTaskCompletion();
          assert.ok(!store.has(pendingKey));
          for (const request of requests) {
            assert.equal(
              new URL(request.url).pathname,
              "/api/driver/tasks/task-1/complete",
            );
            assert.deepEqual(request.body, pending.command);
            assert.equal(request.headers["x-request-id"], pending.requestId);
            assert.equal(request.headers["idempotency-key"], pending.requestId);
          }
        } else {
          assert.ok(!store.has(pendingKey));
          assert.ok(
            fields(r).every((n) => n.props.value === ""),
            "successful completion clears draft",
          );
        }
      }
    }
    console.log("PASS " + scenario);
  } finally {
    if (r)
      await act(async () => {
        r.unmount();
      });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

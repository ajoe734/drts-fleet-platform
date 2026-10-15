/* eslint-disable @typescript-eslint/no-require-imports -- The isolated CommonJS loader executes actual Driver TS/TSX modules with their own alias and React instance. */
/* Socket-free contract probe for the actual hosted caller and Driver jobs/trip.
 * Only native rendering/location/router/storage and upstream HTTP are fixtures.
 * Both screens, Canvas controls, task workflow, identity/client and SDK are real.
 * Canned HTTP is not evidence of a real assignment or acceptance. */
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
const [scenario, sourceRef] = process.argv.slice(2);
const completionCase = scenario.startsWith("completion-");
const reloadCase =
  /^(reload|empty|malformed|unreadable)-(web|native)-(jobs|trip)$/.exec(
    scenario,
  );
let route = "/jobs";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.env.EXPO_PUBLIC_API_URL = "https://example.invalid";
delete process.env.EXPO_PUBLIC_DRIVER_ID;
delete process.env.EXPO_PUBLIC_DRIVER_ACTOR_ID;
const store = new Map();
const pendingKey = "drts.driver.pendingTaskCompletion";
let storageFail = false;
let identityReads = 0;
const redirects = [];
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
  getItemAsync: async (key) => {
    if (key === "drts.driver.session") {
      identityReads++;
      if (reloadCase?.[1] === "unreadable")
        throw new Error("Fixture storage unavailable");
    }
    return store.get(key) ?? null;
  },
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
if (reloadCase?.[2] === "web") {
  globalThis.document = {};
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => {
        if (key === "drts.driver.session") {
          identityReads++;
          if (reloadCase[1] === "unreadable")
            throw new Error("Fixture storage unavailable");
        }
        return store.get(key) ?? null;
      },
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    },
  };
}
const tracking = {
  syncDriverLocationHeartbeat: async () => ({
    status: "active",
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
  Module._extensions[ext] = (m, filename) => {
    const screenRef = process.env.PAX_REVIEW_DRIVER_SCREEN_SOURCE_REF;
    const relative = path.relative(root, filename);
    const source =
      screenRef && /^apps\/driver-app\/app\/(jobs|trip)\.tsx$/.test(relative)
        ? require("node:child_process").execFileSync(
            "git",
            ["show", `${screenRef}:${relative}`],
            { cwd: root, encoding: "utf8" },
          )
        : fs.readFileSync(filename, "utf8");
    compile(m, filename, source);
  };
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
      Redirect: (props) => {
        redirects.push({ href: props.href, identityReads });
        return React.createElement("Redirect", props);
      },
      useRouter: () => ({
        replace: () => {},
        push: (value) => {
          route = value;
        },
      }),
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
native.Animated = {
  View: "AnimatedView",
  Value: class {
    stopAnimation() {}
    setValue() {}
  },
};
native.PanResponder = { create: () => ({ panHandlers: {} }) };

const orderId = "5e3d1a04-67f6-4946-a7f7-81f23ef40636";
let task = {
  taskId: "fixture-driver-task-a",
  orderId,
  driverId: "pax-review-driver-a",
  status: completionCase ? "on_trip" : "pending_acceptance",
  startedAt: completionCase
    ? new Date(Date.now() - 60_000).toISOString()
    : null,
  sourcePlatform: null,
  routeProvided: false,
  waypoints: [],
};
const order = {
  orderId,
  fixedPrice: scenario === "completion-fixed",
  pickup: { address: "新北板橋" },
  dropoff: { address: "新北市府" },
  passenger: { name: "演練乘客", phone: "0000000000" },
  quotedFare: { currency: "NTD", amountMinor: 8500 },
  proofRequirements: {
    minPhotoCount: 0,
    signoffRequired: false,
    expenseProofRequired: false,
  },
};
let replyListener = null;
let renderer;
const commands = [];
const stages = [];
const response = (data) => Response.json({ success: true, data });
globalThis.fetch = async (url, init = {}) => {
  assert.equal(new URL(url).origin, "https://example.invalid");
  const pathname = new URL(url).pathname;
  if (pathname === "/api/auth/driver/device/register")
    return response({
      access_token: "synthetic-device-token",
      refresh_token: "synthetic-refresh-token",
      driver: { driver_id: task.driverId },
      binding: {
        binding_id: "synthetic-binding",
        device_id: "synthetic-device",
      },
    });
  assert.equal(
    new Headers(init.headers).get("authorization"),
    "Bearer synthetic-device-token",
  );
  if (pathname.endsWith("/enabled")) return response({ enabled: true });
  if (pathname === "/api/driver/task-views")
    return response({
      items:
        scenario === "missing-job"
          ? []
          : [
              {
                task_id: task.taskId,
                order_id: orderId,
                source_platform: "drts",
                order_domain: "owned",
                platform_display_name: "DRTS",
                local_status: task.status,
                native_status: null,
                driver_action_state: "action_required",
                allowed_actions: ["accept", "reject"],
                requires_manual_fallback: false,
                requires_reauth: false,
                pickup_summary: "新北板橋",
                dropoff_summary: "新北市府",
                updated_at: "2026-10-15T15:00:00Z",
              },
            ],
    });
  if (pathname === "/api/driver/tasks") return response({ items: [task] });
  if (pathname === `/api/orders/${orderId}`)
    return completionCase
      ? Response.json({ error: { code: "AUTH_REALM_DENIED" } }, { status: 403 })
      : response(order);
  if (pathname === `/api/driver/tasks/${task.taskId}/order`) {
    if (scenario === "completion-unavailable")
      return Response.json(
        { error: { code: "FIXTURE_DATABASE_UNAVAILABLE" } },
        { status: 503 },
      );
    return response(
      scenario === "completion-mismatch"
        ? { ...order, orderId: "foreign-order" }
        : order,
    );
  }
  if (pathname === `/api/driver/tasks/${task.taskId}/complete`) {
    commands.push({ path: pathname, body: JSON.parse(init.body) });
    // Capture the real UI/SDK command; a fixture response is not business acceptance.
    return Response.json(
      {
        error: {
          code: "PROOF_REQUIRED",
          message: "Fixture completion refused",
        },
      },
      { status: 409 },
    );
  }
  if (pathname === "/api/platform-presence") return response({ presences: [] });
  if (pathname === `/api/driver/tasks/${task.taskId}/accept`) {
    commands.push({ path: pathname, body: JSON.parse(init.body) });
    const status = scenario === "accept-refused" ? 409 : 201;
    const result =
      status === 409
        ? Response.json(
            {
              error: {
                code: "TASK_NOT_ACCEPTABLE",
                message: "Fixture refusal",
              },
            },
            { status },
          )
        : Response.json(
            { success: true, data: { ...task, status: "accepted" } },
            { status },
          );
    assert.ok(
      replyListener,
      "The real UI must emit acceptance after installing the response listener",
    );
    replyListener({
      url: () => String(url),
      request: () => ({ method: () => init.method }),
      status: () => status,
    });
    if (status < 300) task = { ...task, status: "accepted" };
    return result;
  }
  throw new Error(`Unexpected upstream fixture route ${pathname}`);
};
const flatten = (node) =>
  typeof node === "string" ? node : (node.children ?? []).map(flatten).join("");
const textNodes = () => renderer.root.findAll((node) => node.type === "Text");
const visibleText = (value, exact) =>
  textNodes().some((node) =>
    exact ? flatten(node) === value : flatten(node).includes(value),
  );
async function open(screen) {
  await act(async () => {
    if (renderer) renderer.unmount();
    renderer = create(
      React.createElement(require(path.join(app, `app/${screen}.tsx`)).default),
    );
  });
}
const click = async (label) => {
  const node = renderer.root.findAll(
    (node) => node.type === "Pressable" && flatten(node).includes(label),
  )[0];
  assert.ok(node, `Missing real Driver control: ${label}`);
  assert.ok(!node.props.disabled, `Real Driver control is disabled: ${label}`);
  await act(async () => node.props.onPress());
  if (route === "/trip" && label === "開啟目前行程") await open("trip");
};
const page = {
  goto: async (url) => {
    assert.equal(url, "https://driver.invalid/jobs");
    if (scenario === "navigation-failed")
      throw new Error("Fixture browser navigation failed");
    await open("jobs");
  },
  getByText: (label, options) => ({
    first: () => ({
      visible: () => visibleText(label, options.exact),
      click: () => click(label),
    }),
  }),
  getByRole: (role, options) => {
    assert.equal(role, "button");
    assert.equal(options.exact, true);
    return { first: () => ({ click: () => click(options.name) }) };
  },
  waitForResponse: (predicate) => {
    return new Promise((resolve) => {
      replyListener = (reply) => {
        assert.equal(
          predicate(reply),
          true,
          "Actual SDK acceptance must match the actual hosted listener",
        );
        resolve(reply);
      };
    });
  },
};
const expectation = (value) => ({
  toHaveURL: async (pattern) => assert.match(route, pattern),
  toBeVisible: async () =>
    assert.equal(
      value.visible(),
      true,
      "Driver must display the same order UUID",
    ),
  toBeLessThan: (limit) =>
    assert.ok(value < limit, `Acceptance status=${value}`),
});
const step = async (name, operation) => {
  const stage = { name, state: "started" };
  stages.push(stage);
  try {
    const result = await operation();
    stage.state = "passed";
    return result;
  } catch (error) {
    stage.state = "failed";
    throw error;
  }
};
async function run() {
  const apiPath = path.join(app, "lib/api-client.ts");
  let api = require(apiPath);
  if (!reloadCase || reloadCase[1] === "reload")
    await api.registerDriverDevice("synthetic-registration-code");
  if (completionCase) {
    try {
      if (scenario === "completion-jobs") {
        await open("jobs");
        assert.equal(
          visibleText("85.00", false),
          true,
          "Actual Jobs card must display its assigned order's quoted fare",
        );
        console.log(
          JSON.stringify({
            scenario,
            actualScreens: true,
            actualSDK: true,
            commandCount: 0,
            upstreamHTTP: "fixture; no runtime acceptance credit",
          }),
        );
        return;
      }
      await open("trip");
      const inputs = () =>
        renderer.root.findAll((node) => node.type === "TextInput");
      if (
        ["completion-unavailable", "completion-mismatch"].includes(scenario)
      ) {
        assert.ok(inputs().length >= 4);
        assert.ok(inputs().every((node) => node.props.editable === false));
        const complete = renderer.root.findAll(
          (node) =>
            node.type === "Pressable" && flatten(node).includes("完成行程"),
        )[0];
        assert.equal(complete.props.disabled, true);
        assert.equal(commands.length, 0);
      } else {
        const values = order.fixedPrice
          ? ["85", "0", "0", "0"]
          : ["85", "0", "0", "20", "105"];
        assert.equal(inputs().length, values.length);
        for (const [index, value] of values.entries()) {
          const field = inputs()[index];
          assert.equal(
            field.props.editable,
            true,
            "Actual fare input requires the assigned order's authoritative completion details",
          );
          await act(async () => field.props.onChangeText(value));
        }
        await click("完成行程");
        assert.equal(commands.length, 1);
        const command = commands[0];
        assert.equal(command.path, `/api/driver/tasks/${task.taskId}/complete`);
        assert.deepEqual(command.body.actualFareBreakdown, {
          startMinor: 8500,
          distanceMinor: 0,
          delayMinor: 0,
          nightMinor: order.fixedPrice ? 0 : 2000,
        });
        if (order.fixedPrice)
          assert.equal(Object.hasOwn(command.body, "fare"), false);
        else
          assert.deepEqual(command.body.fare, {
            currency: "TWD",
            amountMinor: 10500,
          });
        assert.ok(Number.isFinite(Date.parse(command.body.completedAt)));
      }
      console.log(
        JSON.stringify({
          scenario,
          actualScreens: true,
          actualSDK: true,
          commandCount: commands.length,
          upstreamHTTP: "fixture; no runtime acceptance credit",
        }),
      );
    } finally {
      if (renderer) await act(async () => renderer.unmount());
    }
    return;
  }
  if (reloadCase) {
    if (reloadCase[1] === "malformed")
      store.set("drts.driver.session", "{invalid JSON");
    // A new document has the persisted real registration result but fresh
    // module state. No pre-hydrated identity is injected into either screen.
    delete require.cache[require.resolve(apiPath)];
    api = require(apiPath);
    assert.equal(api.isDriverIdentityHydrated(), false);
    assert.equal(api.isDriverIdentityProvisioned(), false);
    identityReads = 0;
    await open(reloadCase[3]);
    // The root heartbeat can complete after the initial screen commit. Its
    // successful HTTP read cannot undo a Redirect already rendered by Jobs.
    await act(async () => {
      await api.initializeDriverIdentity().catch(() => {});
    });
    const text = renderer.toJSON();
    await act(async () => renderer.unmount());
    if (reloadCase[1] === "reload") {
      assert.deepEqual(
        redirects,
        [],
        "A persisted device session must hydrate before the actual screen redirects",
      );
      assert.ok(
        JSON.stringify(text).includes(
          reloadCase[3] === "jobs" ? "開啟目前行程" : orderId,
        ),
        "The actual screen must reload its assigned task after hydration",
      );
    } else {
      assert.ok(
        redirects.length > 0,
        "An absent/invalid identity still redirects",
      );
      assert.ok(
        redirects.every(
          (entry) => entry.href === "/onboarding" && entry.identityReads > 0,
        ),
        "The actual screen must read stored identity before deciding to redirect",
      );
      assert.equal(api.isDriverIdentityProvisioned(), false);
      assert.equal(JSON.stringify(text).includes(orderId), false);
    }
    console.log(
      JSON.stringify({
        scenario,
        redirects,
        identityReads,
        actualScreens: true,
        actualSDK: true,
        upstreamHTTP: "fixture; no runtime acceptance credit",
      }),
    );
    return;
  }
  const specPath = "tests/e2e/pax-review-shared-order-demo.spec.ts";
  const source = sourceRef
    ? require("node:child_process").execFileSync(
        "git",
        ["show", `${sourceRef}:${specPath}`],
        { cwd: root, encoding: "utf8" },
      )
    : fs.readFileSync(path.join(root, specPath), "utf8");
  const file = ts.createSourceFile(
    specPath,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  let fn = file.statements.find(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "readAssignedTripAndAccept",
  );
  let callerSource;
  if (fn) callerSource = fn.getText(file);
  else {
    fn = file.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === "finish",
    );
    assert.ok(fn, "Missing actual hosted Driver caller");
    // Execute only the original assigned-trip/accept phase, unmodified, without
    // entering the unrelated completion/real-time stages in this contract probe.
    callerSource = `async function readAssignedTripAndAccept(driver, base, orderId, step) { ${fn.body.statements[0].getText(file)} }`;
  }
  const compiled = ts.transpileModule(callerSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const caller = new Function(
    "expect",
    `${compiled}; return readAssignedTripAndAccept;`,
  )(expectation);
  let failure;
  try {
    await caller(page, "https://driver.invalid", orderId, step);
  } catch (error) {
    failure = error;
  } finally {
    if (renderer) await act(async () => renderer.unmount());
  }
  const failedStage = stages.find((stage) => stage.state === "failed")?.name;
  const expectedStage = {
    "missing-job": "Driver open current trip from jobs",
    "navigation-failed": "Driver navigate to assigned jobs",
    "accept-refused": "Driver submit acceptance and receive authority response",
  }[scenario];
  if (expectedStage) {
    assert.ok(failure, "A refusal must remain a failed journey");
    assert.equal(
      failedStage,
      expectedStage,
      "A failed Driver operation must have a precise stage",
    );
  } else {
    assert.ifError(failure);
    assert.equal(
      stages.length,
      4,
      "Every actual Driver operation must leave its own progress",
    );
    assert.equal(task.status, "accepted");
  }
  assert.equal(
    commands.length,
    ["missing-job", "navigation-failed"].includes(scenario) ? 0 : 1,
  );
  if (commands.length) {
    assert.equal(commands[0].path, `/api/driver/tasks/${task.taskId}/accept`);
    assert.ok(Number.isFinite(Date.parse(commands[0].body.acceptedAt)));
    assert.deepEqual(Object.keys(commands[0].body), ["acceptedAt"]);
  }
  console.log(
    JSON.stringify({
      scenario,
      stages,
      commandCount: commands.length,
      actualScreens: true,
      actualSDK: true,
      upstreamHTTP: "fixture; no runtime acceptance credit",
    }),
  );
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

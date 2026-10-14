/* eslint-disable @typescript-eslint/no-require-imports -- Isolated loader preserves Driver aliases and its React version. */
// Real SettingsScreen, UI components, helper, identity/client, SDK and profile service.
// Fixtures replace native/router/SecureStore, fetch and the external DB query only.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "../../..");
const app = path.join(root, "apps/driver-app");
const appRequire = Module.createRequire(path.join(app, "package.json"));
const React = appRequire("react");
const runtime = appRequire("react/jsx-runtime");
const { act, create } = appRequire("react-test-renderer");
const [scenario, baselineDir] = process.argv.slice(2);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.env.EXPO_PUBLIC_API_URL = "https://example.invalid";
delete process.env.EXPO_PUBLIC_DRIVER_ID;
delete process.env.EXPO_PUBLIC_DRIVER_ACTOR_ID;
const alerts = [],
  routes = [],
  requests = [];
const router = {
  canDismiss: () => false,
  replace: (p) => routes.push(p),
  push: (p) => routes.push(p),
};
const session = {
  driverId: "fixture-driver",
  deviceId: "fixture-device",
  bindingId: "fixture-binding",
  accessToken: "fixture-access",
  refreshToken: "fixture-refresh",
  expiresAt: "2099-01-01T00:00:00Z",
};
const store = new Map(
  scenario === "unprovisioned"
    ? []
    : [["drts.driver.session", JSON.stringify(session)]],
);
const native = Object.fromEntries(
  [
    "SafeAreaView",
    "StatusBar",
    "View",
    "Text",
    "TextInput",
    "Pressable",
    "TouchableOpacity",
    "ScrollView",
    "KeyboardAvoidingView",
    "ActivityIndicator",
    "Switch",
  ].map((n) => [n, n]),
);
Object.assign(native, {
  Platform: { OS: "ios", select: (v) => v.ios ?? v.default },
  StyleSheet: { create: (v) => v, absoluteFillObject: {}, hairlineWidth: 1 },
  Alert: { alert: (...args) => alerts.push(args) },
});
const compile = (m, filename, source) =>
  m._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        experimentalDecorators: true,
      },
    }).outputText,
    filename,
  );
for (const ext of [".ts", ".tsx"])
  Module._extensions[ext] = (m, filename) => {
    const historical =
      baselineDir &&
      ["app/settings.tsx", "lib/settings-form.ts", "lib/strings.ts"].some(
        (f) => filename === path.join(app, f),
      );
    compile(
      m,
      filename,
      fs.readFileSync(
        historical ? path.join(baselineDir, path.basename(filename)) : filename,
        "utf8",
      ),
    );
  };
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "react") return React;
  if (request === "react/jsx-runtime") return runtime;
  if (request === "react-native") return native;
  if (request === "@expo/vector-icons") return { Ionicons: "Ionicons" };
  if (request === "react-native-safe-area-context")
    return {
      SafeAreaView: "SafeAreaView",
      useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    };
  if (request === "expo-router")
    return { Redirect: "Redirect", useRouter: () => router };
  if (request === "expo-constants")
    return { default: { expoConfig: { extra: {} } } };
  if (request === "expo-secure-store")
    return {
      getItemAsync: async (k) => store.get(k) ?? null,
      setItemAsync: async (k, v) => store.set(k, v),
      deleteItemAsync: async (k) => store.delete(k),
    };
  if (request.startsWith("@/")) request = path.join(app, request.slice(2));
  for (const pkg of [
    "contracts",
    "api-client",
    "ui-tokens",
    "control-plane-auth",
  ])
    if (request === "@drts/" + pkg)
      request = path.join(root, "packages", pkg, "src/index.ts");
  return originalLoad.call(this, request, parent, isMain);
};
const { DriverProfileService } = require(
  path.join(
    root,
    "apps/api/src/modules/driver-profile/driver-profile.service.ts",
  ),
);
const { AuditNotificationService } = require(
  path.join(
    root,
    "apps/api/src/modules/audit-notification/audit-notification.service.ts",
  ),
);
const { DriverProfileRepository } = require(
  path.join(
    root,
    "apps/api/src/modules/driver-profile/driver-profile.repository.ts",
  ),
);
const records = new Map();
const repository = new DriverProfileRepository({
  isEnabled: () => true,
  query: async (sql, params) => {
    if (!params) {
      assert.ok(sql.includes("FROM ops.phase1_driver_profiles"));
      return {
        rows: [...records.values()].map((json) => ({
          record: JSON.parse(json),
        })),
      };
    }
    assert.ok(sql.includes("INSERT INTO ops.phase1_driver_profiles"));
    assert.ok(sql.includes("$3::jsonb"));
    assert.equal(params.length, 3);
    const record = JSON.parse(params[2]);
    assert.equal(record.driverId, params[0]);
    assert.equal(record.updatedAt, params[1]);
    records.set(params[0], params[2]);
    return { rows: [] };
  },
});
const service = new DriverProfileService(
  new AuditNotificationService(),
  repository,
);
const response = (data) =>
  new Response(JSON.stringify({ data, meta: {} }), { status: 200 });
const rejected = (code = "FIXTURE_PROFILE_REJECTED", status = 400) =>
  new Response(
    JSON.stringify({
      error: { code, message: "fixture profile rejected", retryable: false },
    }),
    { status },
  );
let failPatch = scenario === "patch-failure" || scenario === "partial-success";
let releasePatch;
let preference = {
  driverId: "fixture-driver",
  language: "zh-TW",
  notificationsEnabled: true,
  autoAcceptEnabled: false,
  maxAcceptRadius: null,
};
globalThis.fetch = async (url, init = {}) => {
  assert.equal(new URL(url).origin, "https://example.invalid");
  const route = new URL(url).pathname;
  const method = init.method ?? "GET";
  const body = init.body ? JSON.parse(init.body) : undefined;
  const headers = Object.fromEntries(new Headers(init.headers));
  requests.push({ route, method, body, headers });
  if (route === "/api/auth/driver/device/refresh")
    return rejected("DRIVER_SESSION_EXPIRED", 401);
  assert.equal(
    headers.authorization,
    "Bearer fixture-access",
    "actual provisioned identity must be used",
  );
  if (route === "/api/driver/profile") {
    assert.ok(method === "GET" || method === "PATCH", "no create fallback");
    if (
      scenario === "expired" ||
      (scenario === "patch-expired" && method === "PATCH")
    )
      return rejected("DRIVER_SESSION_EXPIRED", 401);
    if (method === "GET") {
      if (scenario === "load-failure")
        return rejected("DRIVER_PROFILE_NOT_FOUND", 404);
      return response(service.getProfile("fixture-driver"));
    }
    if (scenario === "saving" && !releasePatch)
      await new Promise((resolve) => {
        releasePatch = resolve;
      });
    if (failPatch) return rejected();
    try {
      return response(await service.updateProfile("fixture-driver", body));
    } catch (e) {
      return new Response(JSON.stringify(e.getResponse()), {
        status: e.getStatus(),
      });
    }
  }
  if (route === "/api/driver-settings/fixture-driver") {
    if (method === "PATCH") preference = { ...preference, ...body };
    return response(preference);
  }
  if (route === "/api/platform-presence")
    return response({ presences: [], adapterStatuses: [], notes: [] });
  throw new Error("unhandled fixture request " + route);
};
const flatten = (n) =>
  typeof n === "string" ? n : (n.children ?? []).map(flatten).join("");
const text = (r) =>
  r.root
    .findAll((n) => n.type === "Text")
    .map(flatten)
    .join("\n");
const surname = (r) => {
  const fields = r.root.findAll(
    (n) =>
      n.type === "TextInput" &&
      n.props.accessibilityLabel === "姓氏（自行提供）",
  );
  assert.equal(
    fields.length,
    1,
    "actual settings must expose an explicit surname input",
  );
  return fields[0];
};
const field = (r, placeholder) =>
  r.root.findAll(
    (n) => n.type === "TextInput" && n.props.placeholder === placeholder,
  )[0];
const { ActionButton } = require(
  path.join(app, "components/ui/ActionButton.tsx"),
);
const save = (r) =>
  r.root
    .findAll(
      (n) =>
        n.type === ActionButton &&
        /^(儲存設定|目前無變更|請先修正欄位|正在儲存…)$/.test(n.props.title),
    )[0]
    .findByType("TouchableOpacity");
const patches = () =>
  requests.filter(
    (r) => r.route === "/api/driver/profile" && r.method === "PATCH",
  );
async function enter(input, value) {
  assert.equal(input.props.editable, true);
  await act(async () => input.props.onChangeText(value));
}
async function press(r) {
  assert.equal(save(r).props.disabled, false);
  await act(async () => {
    await save(r).props.onPress();
  });
}
(async () => {
  await service.createProfile("fixture-driver", {
    name: "Unrelated Display Fixture",
    ...(scenario === "preserve" || scenario === "clear"
      ? { driverSurname: "歐陽" }
      : {}),
  });
  const api = require(path.join(app, "lib/api-client.ts"));
  await api.initializeDriverIdentity();
  const Screen = require(path.join(app, "app/settings.tsx")).default;
  let r;
  const mount = async () => {
    await act(async () => {
      r = create(React.createElement(Screen));
    });
  };
  try {
    await mount();
    if (scenario === "unprovisioned") {
      assert.equal(
        r.root.findAll((n) => n.type === "Redirect")[0].props.href,
        "/onboarding",
      );
      assert.equal(requests.length, 0);
    } else if (scenario === "expired") {
      assert.ok(routes.includes("/onboarding"));
      assert.equal(api.isDriverIdentityProvisioned(), false);
      assert.equal(patches().length, 0);
    } else if (scenario === "legacy-control") {
      await enter(field(r, "driver@example.com"), "legacy@example.com");
      await press(r);
      assert.equal(patches().length, 1);
      assert.ok(!Object.hasOwn(patches()[0].body, "driverSurname"));
      assert.ok(
        !Object.hasOwn(
          await api.getDriverClient().getDriverProfile(),
          "driverSurname",
        ),
      );
    } else {
      const initial = surname(r);
      if (scenario === "load-failure") {
        assert.equal(initial.props.editable, false);
        assert.ok(text(r).includes("無法載入"));
        await enter(field(r, "例如：10"), "12");
        await press(r);
        assert.equal(patches().length, 0);
      } else if (scenario === "clear" || scenario === "invalid") {
        if (scenario === "clear") assert.equal(initial.props.value, "歐陽");
        await enter(initial, scenario === "clear" ? "" : " \t ");
        assert.equal(save(r).props.disabled, true);
        assert.ok(
          text(r).includes(
            scenario === "clear" ? "已保存的姓氏不能清空" : "姓氏不可只含空白",
          ),
        );
        await act(async () => {
          await save(r).props.onPress();
        });
        assert.equal(patches().length, 0);
        assert.equal(
          service.getProfile("fixture-driver").driverSurname,
          scenario === "clear" ? "歐陽" : undefined,
        );
      } else if (scenario === "legacy") {
        assert.equal(initial.props.value, "");
        assert.equal(save(r).props.disabled, true);
        assert.ok(text(r).includes("尚未提供"));
        await enter(field(r, "driver@example.com"), "legacy@example.com");
        await press(r);
        assert.ok(!Object.hasOwn(patches()[0].body, "driverSurname"));
      } else if (scenario === "patch-expired") {
        await enter(initial, "歐陽");
        await press(r);
        assert.equal(patches().length, 1);
        assert.equal(patches()[0].body.driverSurname, "歐陽");
        assert.ok(routes.includes("/onboarding"));
        assert.equal(api.isDriverIdentityProvisioned(), false);
        assert.equal(
          service.getProfile("fixture-driver").driverSurname,
          undefined,
        );
        assert.ok(!alerts.some((a) => a[0] === "儲存成功"));
      } else if (scenario === "existing-validation") {
        await enter(initial, "歐陽");
        await enter(field(r, "driver@example.com"), "invalid email");
        assert.equal(save(r).props.disabled, true);
        await act(async () => {
          await save(r).props.onPress();
        });
        assert.equal(patches().length, 0);
      } else if (scenario === "identity-clear") {
        await enter(initial, "歐陽");
        await act(async () => {
          await api.clearDriverProvisioning();
        });
        assert.equal(r.root.findAll((n) => n.type === "TextInput").length, 0);
        await act(async () => {
          r.update(React.createElement(Screen));
        });
        assert.equal(
          r.root.findAll((n) => n.type === "Redirect")[0].props.href,
          "/onboarding",
        );
        assert.equal(patches().length, 0);
      } else {
        const expected =
          scenario === "compound" ? "van der Fixture-Sample" : "歐陽";
        if (scenario === "preserve")
          assert.equal(initial.props.value, expected);
        else await enter(initial, ` \t${expected}\n `);
        await enter(field(r, "driver@example.com"), "edited@example.com");
        if (scenario === "partial-success")
          await enter(field(r, "例如：10"), "12");
        if (scenario === "saving") {
          let pending;
          await act(async () => {
            pending = save(r).props.onPress();
          });
          assert.equal(surname(r).props.editable, false);
          assert.equal(save(r).props.disabled, true);
          await act(async () => {
            releasePatch();
            await pending;
          });
        } else await press(r);
        assert.equal(patches().length, 1);
        assert.equal(
          patches()[0].body.driverSurname,
          expected,
          "serialized actual PATCH must carry explicit surname",
        );
        assert.equal(patches()[0].body.name, "Unrelated Display Fixture");
        if (failPatch) {
          assert.ok(text(r).includes("fixture profile rejected"));
          assert.equal(surname(r).props.value.trim(), expected);
          assert.equal(
            save(r).props.disabled,
            false,
            "failed profile stays dirty",
          );
          assert.equal(
            service.getProfile("fixture-driver").driverSurname,
            undefined,
          );
          assert.ok(!alerts.some((a) => a[0] === "儲存成功"));
          if (scenario === "partial-success") {
            assert.ok(text(r).includes("已儲存 偏好設定。無法儲存 個人資料"));
            assert.equal(
              requests.filter(
                (x) =>
                  x.method === "PATCH" && x.route.includes("driver-settings"),
              ).length,
              1,
            );
          }
          failPatch = false;
          await press(r);
          assert.equal(patches().length, 2);
          if (scenario === "partial-success")
            assert.equal(
              requests.filter(
                (x) =>
                  x.method === "PATCH" && x.route.includes("driver-settings"),
              ).length,
              1,
            );
        }
        const readback = await api.getDriverClient().getDriverProfile();
        assert.equal(readback.driverSurname, expected);
        assert.equal(readback.email, "edited@example.com");
        assert.equal(save(r).props.disabled, true);
        await act(async () => r.unmount());
        r = null;
        await mount();
        assert.equal(
          surname(r).props.value,
          expected,
          "GET must hydrate saved surname",
        );
        assert.equal(save(r).props.disabled, true);
      }
    }
    console.log("PASS " + scenario);
  } finally {
    if (releasePatch) releasePatch();
    if (r) await act(async () => r.unmount());
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

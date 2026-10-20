/* eslint-disable @typescript-eslint/no-require-imports -- Isolated loader preserves Driver aliases and its React version. */
// Real SettingsScreen (apps/driver-app/app/settings.tsx), UI components, settings-form helper,
// identity/api-client, SDK, and real DriverSettingsController/Service/Repository + DriverProfileService/Repository.
// Only native primitives, router, SecureStore, fetch transport, and external DatabaseService.query are controlled.
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

const [scenarioArg] = process.argv.slice(2);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.env.EXPO_PUBLIC_API_URL = "https://example.invalid";
delete process.env.EXPO_PUBLIC_DRIVER_ID;
delete process.env.EXPO_PUBLIC_DRIVER_ACTOR_ID;

const alerts = [];
const routes = [];
const requests = [];
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
const store = new Map([["drts.driver.session", JSON.stringify(session)]]);

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

for (const ext of [".ts", ".tsx"]) {
  Module._extensions[ext] = (m, filename) => {
    compile(m, filename, fs.readFileSync(filename, "utf8"));
  };
}

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
  ]) {
    if (request === "@drts/" + pkg) {
      request = path.join(root, "packages", pkg, "src/index.ts");
    }
  }
  return originalLoad.call(this, request, parent, isMain);
};

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
const { DriverProfileService } = require(
  path.join(
    root,
    "apps/api/src/modules/driver-profile/driver-profile.service.ts",
  ),
);
const { DriverSettingsRepository } = require(
  path.join(
    root,
    "apps/api/src/modules/driver-settings/driver-settings.repository.ts",
  ),
);
const { DriverSettingsService } = require(
  path.join(
    root,
    "apps/api/src/modules/driver-settings/driver-settings.service.ts",
  ),
);
const { DriverSettingsController } = require(
  path.join(
    root,
    "apps/api/src/modules/driver-settings/driver-settings.controller.ts",
  ),
);

const profileRecords = new Map();
const profileRepository = new DriverProfileRepository({
  isEnabled: () => true,
  query: async (sql, params) => {
    if (!params) {
      assert.ok(sql.includes("FROM ops.phase1_driver_profiles"));
      return {
        rows: [...profileRecords.values()].map((json) => ({
          record: JSON.parse(json),
        })),
      };
    }
    assert.ok(sql.includes("INSERT INTO ops.phase1_driver_profiles"));
    profileRecords.set(params[0], params[2]);
    return { rows: [] };
  },
});

const settingsRecords = new Map();
const pendingSettingsWrites = [];
let settingsWriteMode = "auto"; // "auto" | "manual" | "reject"

const settingsRepository = new DriverSettingsRepository({
  isEnabled: () => true,
  query: (sql, params) => {
    if (!params) {
      assert.ok(sql.includes("FROM ops.phase1_driver_settings"));
      return Promise.resolve({
        rows: [...settingsRecords.values()].map((json) => ({
          record: JSON.parse(json),
        })),
      });
    }
    assert.ok(sql.includes("INSERT INTO ops.phase1_driver_settings"));
    assert.ok(sql.includes("$3::jsonb"));
    assert.equal(params.length, 3);
    const parsed = JSON.parse(params[2]);
    assert.equal(parsed.driverId, params[0]);
    assert.equal(parsed.updatedAt, params[1]);

    if (settingsWriteMode === "reject") {
      return Promise.reject(new Error("canonical settings db write rejected"));
    }
    if (settingsWriteMode === "manual") {
      return new Promise((resolve, reject) => {
        pendingSettingsWrites.push({
          record: parsed,
          commit: () => {
            settingsRecords.set(params[0], params[2]);
            resolve({ rows: [] });
          },
          reject: (err) => reject(err),
        });
      });
    }
    settingsRecords.set(params[0], params[2]);
    return Promise.resolve({ rows: [] });
  },
});
settingsRepository.reportPersistenceFailure = () => {};

let auditService = new AuditNotificationService();
let profileService = new DriverProfileService(auditService, profileRepository);
let settingsService = new DriverSettingsService(
  auditService,
  settingsRepository,
);
let settingsController = new DriverSettingsController(settingsService);

const driverIdentity = {
  authMode: "bootstrap_headers",
  actorType: "driver_user",
  actorId: "fixture-driver",
  realm: "driver",
  tenantId: null,
  roleFamilies: ["driver"],
  roles: ["driver_user"],
  scopes: ["driver:read", "driver:write"],
  requestId: null,
};

const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), { status });

globalThis.fetch = async (url, init = {}) => {
  assert.equal(new URL(url).origin, "https://example.invalid");
  const route = new URL(url).pathname;
  const method = init.method ?? "GET";
  const body = init.body ? JSON.parse(init.body) : undefined;
  const headers = Object.fromEntries(new Headers(init.headers));
  requests.push({ route, method, body, headers });

  assert.equal(
    headers.authorization,
    "Bearer fixture-access",
    "actual provisioned identity must be used",
  );

  if (route === "/api/driver/profile") {
    if (method === "GET") {
      return jsonResponse({
        data: profileService.getProfile("fixture-driver"),
        meta: {},
      });
    }
    if (method === "PATCH") {
      try {
        const updated = await profileService.updateProfile(
          "fixture-driver",
          body,
        );
        return jsonResponse({ data: updated, meta: {} });
      } catch (err) {
        return jsonResponse(
          {
            error: {
              code: "PROFILE_WRITE_FAILED",
              message: err instanceof Error ? err.message : String(err),
              retryable: true,
            },
          },
          500,
        );
      }
    }
  }

  if (route === "/api/driver-settings/fixture-driver") {
    if (method === "GET") {
      const env = await settingsController.getSettings(
        "fixture-driver",
        driverIdentity,
        "req-get-settings",
      );
      return jsonResponse(env);
    }
    if (method === "PATCH") {
      try {
        const env = await settingsController.updateSettings(
          "fixture-driver",
          body,
          driverIdentity,
          "req-patch-settings",
        );
        return jsonResponse(env);
      } catch (err) {
        return jsonResponse(
          {
            error: {
              code: "SETTINGS_WRITE_FAILED",
              message: err instanceof Error ? err.message : String(err),
              retryable: true,
            },
          },
          500,
        );
      }
    }
  }

  if (route === "/api/platform-presence") {
    return jsonResponse({
      data: { presences: [], adapterStatuses: [], notes: [] },
      meta: {},
    });
  }

  throw new Error("unhandled fixture request " + route);
};

const flatten = (n) =>
  typeof n === "string" ? n : (n.children ?? []).map(flatten).join("");
const text = (r) =>
  r.root
    .findAll((n) => n.type === "Text")
    .map(flatten)
    .join("\n");
const field = (r, placeholder) =>
  r.root.findAll(
    (n) => n.type === "TextInput" && n.props.placeholder === placeholder,
  )[0];
const switches = (r) => r.root.findAll((n) => n.type === "Switch");
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

async function flushMicrotasks() {
  for (let i = 0; i < 25; i++) {
    await Promise.resolve();
  }
}

async function enter(input, value) {
  assert.equal(input.props.editable, true);
  await act(async () => input.props.onChangeText(value));
}

async function toggleSwitch(switchNode, value) {
  assert.equal(switchNode.props.disabled, false);
  await act(async () => switchNode.props.onValueChange(value));
}

async function press(r) {
  assert.equal(save(r).props.disabled, false);
  await act(async () => {
    await save(r).props.onPress();
  });
}

(async () => {
  await profileService.createProfile("fixture-driver", {
    name: "Settings Canonical Driver",
    driverSurname: "林",
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

    // 1. Delayed query keeps mounted SettingsScreen PATCH pending (no premature "儲存成功")
    if (!scenarioArg || scenarioArg === "delayed-ack") {
      alerts.length = 0;
      settingsWriteMode = "manual";
      await enter(field(r, "zh-TW"), "zh-TW");
      await enter(field(r, "例如：10"), "18");
      // First Switch is "通知" (notificationsEnabled), second is "自動接單（全平台）" (autoAcceptEnabled)
      await toggleSwitch(switches(r)[0], false);
      await toggleSwitch(switches(r)[1], true);

      let savePromise;
      await act(async () => {
        savePromise = save(r).props.onPress();
        await flushMicrotasks();
      });

      assert.equal(
        pendingSettingsWrites.length,
        1,
        "PATCH must reach DriverSettingsRepository.upsert",
      );
      assert.equal(
        alerts.some((a) => a[0] === "儲存成功"),
        false,
        "Mounted settings.tsx must NOT alert 儲存成功 while repository write is still pending",
      );
      assert.equal(
        settingsService.getSettings("fixture-driver").maxAcceptRadius,
        null,
        "Service cache must not publish uncommitted maxAcceptRadius before DB ACK",
      );
      assert.equal(
        settingsService.isNotificationEnabled("fixture-driver"),
        true,
        "Service notification filter must not trust uncommitted notificationsEnabled=false before DB ACK",
      );

      await act(async () => {
        pendingSettingsWrites[0].commit();
        await savePromise;
      });

      assert.equal(
        alerts.some((a) => a[0] === "儲存成功"),
        true,
        "Mounted settings.tsx alerts 儲存成功 after repository ACK",
      );
      assert.equal(save(r).props.disabled, true);
      assert.equal(
        settingsService.getSettings("fixture-driver").maxAcceptRadius,
        18,
      );
      assert.equal(
        settingsService.getSettings("fixture-driver").language,
        "zh-TW",
      );
      assert.equal(
        settingsService.getSettings("fixture-driver").notificationsEnabled,
        false,
      );
      assert.equal(
        settingsService.getSettings("fixture-driver").autoAcceptEnabled,
        true,
      );
    }

    // 2. Rejected preference write surfaces error in mounted settings.tsx, preserves dirty state and committed settings, then succeeds on retry
    if (!scenarioArg || scenarioArg === "reject-then-retry") {
      alerts.length = 0;
      settingsWriteMode = "reject";
      await enter(field(r, "例如：10"), "25");
      await press(r);

      assert.equal(
        alerts.some((a) => a[0] === "儲存成功"),
        false,
        "Rejected repository write must NOT alert 儲存成功",
      );
      assert.equal(
        alerts.some((a) => a[0] === "儲存失敗"),
        true,
        "Rejected repository write must alert 儲存失敗",
      );
      assert.ok(
        text(r).includes(
          "無法儲存 偏好設定（canonical settings db write rejected）",
        ),
        "Mounted settings.tsx must display failed 偏好設定 message",
      );
      assert.equal(
        save(r).props.disabled,
        false,
        "Failed preference save must keep form dirty so driver can retry",
      );
      assert.equal(
        settingsService.getSettings("fixture-driver").maxAcceptRadius,
        18,
        "Failed preference write must not overwrite committed maxAcceptRadius=18",
      );

      // Retry with working storage
      alerts.length = 0;
      settingsWriteMode = "auto";
      await press(r);

      assert.equal(
        alerts.some((a) => a[0] === "儲存成功"),
        true,
        "Retry must succeed after storage recovers",
      );
      assert.equal(save(r).props.disabled, true);
      assert.equal(
        settingsService.getSettings("fixture-driver").maxAcceptRadius,
        25,
      );
    }

    // 3. Partial save: profile succeeds while preference write rejects -> "部分儲存成功"
    if (!scenarioArg || scenarioArg === "partial-failure-and-remount") {
      alerts.length = 0;
      settingsWriteMode = "reject";
      await enter(field(r, "driver@example.com"), "partial-ok@example.com");
      await enter(field(r, "例如：10"), "30");
      await press(r);

      assert.equal(
        alerts.some((a) => a[0] === "部分儲存成功"),
        true,
        "When profile commits and settings rejects, settings.tsx must alert 部分儲存成功",
      );
      assert.ok(
        text(r).includes("已儲存 個人資料。無法儲存 偏好設定"),
        "Partial save error banner must report saved 個人資料 and failed 偏好設定",
      );
      assert.equal(
        save(r).props.disabled,
        false,
        "Preferences section remains dirty for retry",
      );
      assert.equal(
        settingsService.getSettings("fixture-driver").maxAcceptRadius,
        25,
        "Committed maxAcceptRadius remains 25 after failed partial save",
      );

      // Remount against a freshly reconstructed DriverSettingsService loaded from canonical records
      await act(async () => r.unmount());
      r = null;

      auditService = new AuditNotificationService();
      settingsService = new DriverSettingsService(
        auditService,
        settingsRepository,
      );
      await settingsService.onModuleInit();
      settingsController = new DriverSettingsController(settingsService);

      await mount();
      assert.equal(
        field(r, "例如：10").props.value,
        "25",
        "Remounted SettingsScreen must hydrate committed maxAcceptRadius=25 from reconstructed service, not rejected 30",
      );
      assert.equal(
        field(r, "zh-TW").props.value,
        "zh-TW",
        "Remounted SettingsScreen must preserve committed language=zh-TW",
      );
      assert.equal(
        switches(r)[0].props.value,
        false,
        "Remounted SettingsScreen must preserve committed notificationsEnabled=false",
      );
      assert.equal(
        switches(r)[1].props.value,
        true,
        "Remounted SettingsScreen must preserve committed autoAcceptEnabled=true",
      );
    }

    console.log("PASS settings-preferences-caller-probe");
  } finally {
    if (r) {
      await act(async () => r.unmount());
    }
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedDriverTaskView } from "@drts/contracts";

const { passthrough } = vi.hoisted(() => ({
  passthrough: (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never),
}));

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  initializeDriverIdentity: vi.fn(),
  isDriverIdentityProvisioned: vi.fn(() => true),
  getDriverAuthState: vi.fn(() => "provisioned"),
  getDriverIdentityIssue: vi.fn(() => null as string | null),
  hasDriverDevOverride: vi.fn(() => false),
  getDriverId: vi.fn(() => "drv-001"),
  registerDriverDevice: vi.fn(),
  getFeatureFlags: vi.fn(),
  getIdentityContext: vi.fn(),
  listUnifiedDriverTasks: vi.fn(),
  listDriverTasks: vi.fn(),
  getPlatformPresence: vi.fn(),
  isFeatureEnabled: vi.fn(),
  listShifts: vi.fn(),
  getActiveShift: vi.fn(),
  addAppStateListener: vi.fn(() => ({ remove: () => {} })),
}));

vi.mock("react-native", () => {
  const p = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    ActivityIndicator: "ActivityIndicator",
    AppState: {
      addEventListener: mocks.addAppStateListener,
    },
    Pressable: p("Pressable"),
    StyleSheet: { create: <T>(s: T) => s, flatten: (s: unknown) => s },
    Text: p("Text"),
    View: p("View"),
  };
});

vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: passthrough("Ionicons") }));

vi.mock("@/components/ui", () => ({
  ActionButton: passthrough("ActionButton"),
  AuthorityBanner: passthrough("AuthorityBanner"),
  AppScreen: passthrough("AppScreen"),
  ErrorBanner: passthrough("ErrorBanner"),
  FormField: passthrough("FormField"),
  PlatformBadge: passthrough("PlatformBadge"),
  StatusChip: passthrough("StatusChip"),
  // platform-status-card also pulls Tokens from this barrel at module scope.
  Tokens: new Proxy({}, { get: () => new Proxy({}, { get: () => "#000" }) }),
  tokens: new Proxy({}, { get: () => new Proxy({}, { get: () => "#000" }) }),
}));

vi.mock("@/lib/api-client", () => ({
  formatDriverError: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  sanitizeLogMessage: (value: unknown) =>
    value === null || value === undefined ? null : String(value),
  getDriverAuthState: mocks.getDriverAuthState,
  getDriverClient: () => ({
    getFeatureFlags: mocks.getFeatureFlags,
    getIdentityContext: mocks.getIdentityContext,
    listUnifiedDriverTasks: mocks.listUnifiedDriverTasks,
    listDriverTasks: mocks.listDriverTasks,
    getPlatformPresence: mocks.getPlatformPresence,
    isFeatureEnabled: mocks.isFeatureEnabled,
    listShifts: mocks.listShifts,
    getActiveShift: mocks.getActiveShift,
  }),
  getDriverId: mocks.getDriverId,
  getDriverIdentityIssue: mocks.getDriverIdentityIssue,
  hasDriverDevOverride: mocks.hasDriverDevOverride,
  initializeDriverIdentity: mocks.initializeDriverIdentity,
  isDriverIdentityProvisioned: mocks.isDriverIdentityProvisioned,
  registerDriverDevice: mocks.registerDriverDevice,
}));

import {
  clearDriverDiagnostics,
  getDriverDiagnostics,
} from "../../lib/driver-diagnostics";
import { resetDriverFeatureCache } from "../../lib/driver-feature-flags";
import {
  markDriverSessionSignedIn,
  markDriverSessionSignedOut,
  resetDriverSessionLifecycleForTests,
} from "../../lib/driver-session-lifecycle";
import OnboardingScreen from "../../app/(tabs)/index/onboarding";

async function flush() {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}

async function renderScreen() {
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(OnboardingScreen));
    await flush();
  });
  return renderer;
}

function task(overrides: Partial<UnifiedDriverTaskView> = {}) {
  return {
    taskId: "task-001",
    orderId: "order-001",
    orderDomain: "owned",
    sourcePlatform: "drts",
    platformDisplayName: "DRTS",
    externalOrderId: null,
    nativeStatus: null,
    localStatus: "assigned",
    driverActionState: "action_required",
    allowedActions: ["accept"],
    routeLocked: false,
    fareAuthority: "drts",
    settlementAuthority: "drts",
    driverPayoutAuthority: "drts",
    requiresManualFallback: false,
    requiresReauth: false,
    syncIssueSummary: null,
    blockingReason: null,
    pickupSummary: "台北車站",
    dropoffSummary: "台北 101",
    deadlineAt: null,
    updatedAt: "2026-05-08T03:00:00.000Z",
    ...overrides,
  } as UnifiedDriverTaskView;
}

function texts(renderer: any): string[] {
  return renderer.root
    .findAll((node: any) => node.type === "Text")
    .flatMap((node: any) =>
      Array.isArray(node.props.children)
        ? node.props.children
        : [node.props.children],
    )
    .filter((value: unknown) => typeof value === "string");
}

function actionButtons(renderer: any) {
  return renderer.root.findAll((node: any) => node.type === "ActionButton");
}

function actionButton(renderer: any, title: string) {
  return actionButtons(renderer).find(
    (node: any) => node.props.title === title,
  );
}

function field(renderer: any, label: string) {
  return renderer.root.find(
    (node: any) => node.type === "FormField" && node.props.label === label,
  );
}

function errorBanners(renderer: any) {
  return renderer.root
    .findAll((node: any) => node.type === "ErrorBanner")
    .map((node: any) => node.props.message);
}

function statusChips(renderer: any) {
  return renderer.root
    .findAll((node: any) => node.type === "StatusChip")
    .map((node: any) => node.props.label);
}

// Finds the Pressable whose own subtree renders the given text label.
function pressableContainingText(renderer: any, label: string) {
  return renderer.root
    .findAll((node: any) => node.type === "Pressable" && node.props.onPress)
    .find((node: any) =>
      node
        .findAll((child: any) => child.type === "Text")
        .some((child: any) => child.props.children === label),
    );
}

function pressableWithLabel(renderer: any, label: string) {
  return renderer.root.find(
    (node: any) =>
      node.type === "Pressable" && node.props.accessibilityLabel === label,
  );
}


// Requirement 2: nothing that names our architecture, APIs, spec numbers,
// programme identifiers or internal sync strategy may reach a driver's screen.
const DEVELOPER_COPY_BLOCKLIST = [
  "sitemap",
  "cockpit",
  "packet",
  "\u00a7",
  "Phase 1",
  "web console",
  "CrossAppResourceLink",
  "next-best-action",
  "EmptyReason",
  "ResourceActionDescriptor",
  "deep-link",
  "deep link",
  "allowedActions",
  "availableActions",
  "fallback",
  "API",
  "/api/",
  "\u65d7\u6a19",
  "\u964d\u7d1a",
];

// Every string that actually reaches the rendered tree: text nodes plus the
// string props (title / body / label / subtitle / placeholder / ...) that the
// mocked design-system components receive.
function renderedCopy(renderer: any): string {
  const collected: string[] = [];
  for (const node of renderer.root.findAll(() => true)) {
    const props = (node.props ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(props)) {
      if (key === "style") {
        continue;
      }
      if (typeof value === "string") {
        collected.push(value);
      } else if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === "string") {
            collected.push(entry);
          }
        }
      }
    }
  }
  return collected.join(" | ");
}

function expectNoDeveloperCopy(renderer: any) {
  const copy = renderedCopy(renderer);
  for (const term of DEVELOPER_COPY_BLOCKLIST) {
    expect(copy, `rendered developer copy: ${term}`).not.toContain(term);
  }
}

describe("OnboardingScreen", () => {
  let warnSpy: ReturnType<typeof vi.spyOn> | undefined;
  let errorSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    mocks.push.mockReset();
    mocks.initializeDriverIdentity.mockReset().mockResolvedValue(undefined);
    mocks.isDriverIdentityProvisioned.mockReset().mockReturnValue(true);
    mocks.getDriverAuthState.mockReset().mockReturnValue("provisioned");
    mocks.getDriverIdentityIssue.mockReset().mockReturnValue(null);
    mocks.hasDriverDevOverride.mockReset().mockReturnValue(false);
    mocks.getDriverId.mockReset().mockReturnValue("drv-001");
    mocks.registerDriverDevice.mockReset().mockResolvedValue(undefined);
    mocks.getFeatureFlags.mockReset().mockResolvedValue({});
    mocks.getIdentityContext.mockReset().mockResolvedValue({ ok: true });
    mocks.listUnifiedDriverTasks.mockReset().mockResolvedValue([]);
    mocks.listDriverTasks.mockReset().mockResolvedValue([]);
    mocks.getPlatformPresence.mockReset().mockResolvedValue({ presences: [] });
    mocks.isFeatureEnabled.mockReset().mockResolvedValue(false);
    mocks.listShifts.mockReset().mockResolvedValue([]);
    mocks.getActiveShift.mockReset().mockResolvedValue(null);
    mocks.addAppStateListener
      .mockReset()
      .mockImplementation(() => ({ remove: () => {} }));
    resetDriverFeatureCache();
    clearDriverDiagnostics();
    resetDriverSessionLifecycleForTests();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy?.mockRestore();
    errorSpy?.mockRestore();
    vi.useRealTimers();
  });

  describe("device identity bootstrap", () => {
    it("shows a checking state until identity initialisation settles", async () => {
      mocks.initializeDriverIdentity.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(OnboardingScreen));
      });
      expect(texts(renderer)).toContain("正在檢查裝置配置…");
    });

    it("surfaces an initialisation failure as a provisioning error", async () => {
      mocks.initializeDriverIdentity.mockRejectedValue(
        new Error("裝置金鑰讀取失敗"),
      );
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      mocks.getDriverAuthState.mockReturnValue("not_provisioned");
      const renderer = await renderScreen();

      expect(errorBanners(renderer)).toContain("裝置金鑰讀取失敗");
    });

    it("prefers a reported identity issue over the raw error", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      mocks.getDriverIdentityIssue.mockReturnValue("裝置綁定已被撤銷");
      mocks.getDriverAuthState.mockReturnValue("device_revoked");
      const renderer = await renderScreen();

      expect(errorBanners(renderer)).toContain("裝置綁定已被撤銷");
    });
  });

  describe("unprovisioned auth states", () => {
    beforeEach(() => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
    });

    it("shows the plain registration form when nothing is bound yet", async () => {
      mocks.getDriverAuthState.mockReturnValue("not_provisioned");
      const renderer = await renderScreen();

      expect(actionButton(renderer, "註冊此裝置")).toBeDefined();
      expect(
        renderer.root.findAll((n: any) => n.type === "AuthorityBanner"),
      ).toHaveLength(0);
      expect(texts(renderer)).toContain(
        "未啟用裝置無法接收派單。請使用車隊發放的代碼，避免使用個人帳號註冊。",
      );
    });

    it("switches to a rebind flow when the session expired", async () => {
      mocks.getDriverAuthState.mockReturnValue("session_expired");
      const renderer = await renderScreen();

      expect(actionButton(renderer, "重新綁定此裝置")).toBeDefined();
      const banner = renderer.root.findByType("AuthorityBanner");
      expect(banner.props.authorityLabel).toBe("連線憑證已失效");
    });

    it("promises offline proof is preserved when the device is revoked", async () => {
      mocks.getDriverAuthState.mockReturnValue("device_revoked");
      const renderer = await renderScreen();

      const banner = renderer.root.findByType("AuthorityBanner");
      expect(banner.props.tone).toBe("danger");
      expect(banner.props.description).toContain("離線完單佐證不會刪除");
      expect(texts(renderer)).toContain(
        "提示：撤銷與重新綁定不會刪除未同步的離線完單佐證。",
      );
    });

    it("explains a suspended driver account", async () => {
      mocks.getDriverAuthState.mockReturnValue("driver_suspended");
      const renderer = await renderScreen();

      const banner = renderer.root.findByType("AuthorityBanner");
      expect(banner.props.authorityLabel).toBe("帳號或證件審核未通過");
      expect(banner.props.title).toBe("帳號暫時無法存取派遣");
    });

    it("hides the development override badge outside a development build", async () => {
      mocks.getDriverAuthState.mockReturnValue("not_provisioned");
      mocks.hasDriverDevOverride.mockReturnValue(true);
      const renderer = await renderScreen();
      // `__DEV__` is undefined here, exactly as in a release bundle.
      expect(statusChips(renderer)).not.toContain("開發模式");
      expect(statusChips(renderer)).not.toContain("開發覆寫");
    });

    it("shows the development override badge only in a development build", async () => {
      const scope = globalThis as { __DEV__?: boolean };
      scope.__DEV__ = true;
      try {
        mocks.getDriverAuthState.mockReturnValue("not_provisioned");
        mocks.hasDriverDevOverride.mockReturnValue(true);
        const renderer = await renderScreen();
        expect(statusChips(renderer)).toContain("開發模式");
      } finally {
        delete scope.__DEV__;
      }
    });

    it("never calls the workspace APIs while unprovisioned", async () => {
      mocks.getDriverAuthState.mockReturnValue("not_provisioned");
      await renderScreen();
      expect(mocks.getFeatureFlags).not.toHaveBeenCalled();
      expect(mocks.listUnifiedDriverTasks).not.toHaveBeenCalled();
    });
  });

  describe("device registration", () => {
    beforeEach(() => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      mocks.getDriverAuthState.mockReturnValue("not_provisioned");
    });

    it("rejects an empty registration code without calling the API", async () => {
      const renderer = await renderScreen();

      await act(async () => {
        field(renderer, "註冊代碼").props.onChangeText("   ");
      });
      await act(async () => {
        actionButton(renderer, "註冊此裝置").props.onPress();
        await flush();
      });

      expect(mocks.registerDriverDevice).not.toHaveBeenCalled();
      expect(errorBanners(renderer)).toContain("請輸入裝置註冊碼。");
    });

    it("submits the trimmed code with the device label", async () => {
      const renderer = await renderScreen();

      await act(async () => {
        field(renderer, "註冊代碼").props.onChangeText("  ABC-123  ");
        field(renderer, "裝置名稱").props.onChangeText("Driver Pixel 01");
      });
      await act(async () => {
        actionButton(renderer, "註冊此裝置").props.onPress();
        await flush();
      });

      expect(mocks.registerDriverDevice).toHaveBeenCalledWith(
        "ABC-123",
        "Driver Pixel 01",
      );
    });

    it("keeps the registration code hidden while typing", async () => {
      const renderer = await renderScreen();
      expect(field(renderer, "註冊代碼").props.secureTextEntry).toBe(true);
      expect(field(renderer, "註冊代碼").props.autoCapitalize).toBe("none");
    });

    it("reports a rejected registration code", async () => {
      mocks.registerDriverDevice.mockRejectedValue(new Error("註冊代碼無效"));
      const renderer = await renderScreen();

      await act(async () => {
        field(renderer, "註冊代碼").props.onChangeText("BAD-CODE");
      });
      await act(async () => {
        actionButton(renderer, "註冊此裝置").props.onPress();
        await flush();
      });

      expect(errorBanners(renderer)).toContain("註冊代碼無效");
    });

    it("locks the form and shows progress while submitting", async () => {
      let release: (value: unknown) => void = () => {};
      mocks.registerDriverDevice.mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      const renderer = await renderScreen();

      await act(async () => {
        field(renderer, "註冊代碼").props.onChangeText("ABC-123");
      });
      await act(async () => {
        actionButton(renderer, "註冊此裝置").props.onPress();
      });

      expect(actionButton(renderer, "配置中…").props.loading).toBe(true);
      expect(field(renderer, "註冊代碼").props.editable).toBe(false);

      await act(async () => {
        release(undefined);
        await flush();
      });
    });
  });

  describe("restricted workspace gate", () => {
    const DEGRADE_TITLE = "目前無法連線到車隊系統";

    // Renders and lets the identity retry backoff (500ms + 1500ms) elapse.
    async function renderWithRetries() {
      vi.useFakeTimers();
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(OnboardingScreen));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      return renderer;
    }

    it("stays on the normal workspace when only the feature flags are rejected", async () => {
      // /api/admin/flags requires the system|platform realm, so a driver token
      // always gets 403 here. That must never restrict the workspace.
      mocks.getFeatureFlags.mockRejectedValue(new Error("API error 403: {}"));
      mocks.isFeatureEnabled.mockRejectedValue(new Error("API error 403: {}"));
      const renderer = await renderScreen();
      const rendered = texts(renderer);

      expect(rendered).not.toContain(DEGRADE_TITLE);
      expect(rendered).toContain("工作台");
      expect(statusChips(renderer)).not.toContain("旗標降級");
      expect(statusChips(renderer)).not.toContain("旗標正常");
    });

    it("keeps the shift entry enabled when the shift flag cannot be read", async () => {
      mocks.isFeatureEnabled.mockRejectedValue(new Error("API error 403: {}"));
      const renderer = await renderScreen();

      // Fail-open default: the shift tile is not reported as disabled.
      expect(texts(renderer)).not.toContain("未啟用");
    });

    it("retries a flaky identity check and never paints the restricted screen", async () => {
      mocks.getIdentityContext
        .mockRejectedValueOnce(new Error("Network request failed"))
        .mockRejectedValueOnce(new Error("Network request failed"))
        .mockResolvedValue({ ok: true });

      vi.useFakeTimers();
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(OnboardingScreen));
      });

      // Mid-retry the driver sees the loading state, never the restricted one.
      expect(texts(renderer)).toContain("正在初始化司機工作台…");
      expect(texts(renderer)).not.toContain(DEGRADE_TITLE);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(mocks.getIdentityContext).toHaveBeenCalledTimes(3);
      expect(texts(renderer)).not.toContain(DEGRADE_TITLE);
      expect(texts(renderer)).toContain("工作台");
    });

    it("restricts the workspace only after every identity retry fails", async () => {
      mocks.getIdentityContext.mockRejectedValue(
        new Error("Network request failed"),
      );
      const renderer = await renderWithRetries();

      expect(mocks.getIdentityContext).toHaveBeenCalledTimes(3);
      expect(texts(renderer)).toContain(DEGRADE_TITLE);
    });

    it("returns to the workspace on the next successful check", async () => {
      mocks.getIdentityContext.mockRejectedValue(
        new Error("Network request failed"),
      );
      const renderer = await renderWithRetries();
      expect(texts(renderer)).toContain(DEGRADE_TITLE);

      mocks.getIdentityContext.mockReset().mockResolvedValue({ ok: true });
      await act(async () => {
        actionButton(renderer, "重新檢查連線").props.onPress();
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(texts(renderer)).not.toContain(DEGRADE_TITLE);
      expect(texts(renderer)).toContain("工作台");
    });

    it("keeps serving the workspace when a later refresh loses the identity check", async () => {
      const renderer = await renderScreen();
      expect(texts(renderer)).toContain("工作台");

      mocks.getIdentityContext.mockRejectedValue(
        new Error("Network request failed"),
      );
      vi.useFakeTimers();
      await act(async () => {
        pressableContainingText(renderer, "重新整理").props.onPress();
        await vi.advanceTimersByTimeAsync(10_000);
      });

      // Last-known-good identity keeps the driver in the workspace.
      expect(texts(renderer)).not.toContain(DEGRADE_TITLE);
    });

    // Requirement 5: the last-known-good identity marker must not survive a
    // logout, or the next driver on this device inherits the previous
    // session's "identity already confirmed" verdict.
    it("drops the last-known-good identity marker once the driver signs out", async () => {
      const renderer = await renderScreen();
      expect(texts(renderer)).toContain("工作台");

      mocks.getIdentityContext.mockRejectedValue(
        new Error("Network request failed"),
      );

      vi.useFakeTimers();
      await act(async () => {
        markDriverSessionSignedOut();
        await vi.advanceTimersByTimeAsync(10_000);
      });
      await act(async () => {
        markDriverSessionSignedIn();
        await vi.advanceTimersByTimeAsync(10_000);
      });

      // No inherited confirmation: the failing identity check now restricts.
      expect(texts(renderer)).toContain(DEGRADE_TITLE);
    });

    it("re-runs the workspace refresh when the session changes", async () => {
      await renderScreen();
      const callsBefore = mocks.getIdentityContext.mock.calls.length;
      expect(callsBefore).toBeGreaterThan(0);

      vi.useFakeTimers();
      await act(async () => {
        markDriverSessionSignedIn();
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(mocks.getIdentityContext.mock.calls.length).toBeGreaterThan(
        callsBefore,
      );
    });

    it("shows the loading state while identity initialisation is still pending", async () => {
      mocks.initializeDriverIdentity.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(OnboardingScreen));
      });

      expect(texts(renderer)).toContain("正在檢查裝置配置…");
      expect(texts(renderer)).not.toContain(DEGRADE_TITLE);
    });

    it("re-runs the connectivity check from the restricted panel", async () => {
      mocks.getIdentityContext.mockRejectedValue(
        new Error("Network request failed"),
      );
      const renderer = await renderWithRetries();
      const before = mocks.getIdentityContext.mock.calls.length;

      await act(async () => {
        actionButton(renderer, "重新檢查連線").props.onPress();
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(mocks.getIdentityContext.mock.calls.length).toBeGreaterThan(before);
    });

    it("offers an identity re-check from the restricted panel", async () => {
      mocks.getIdentityContext.mockRejectedValue(
        new Error("Network request failed"),
      );
      const renderer = await renderWithRetries();
      const before = mocks.initializeDriverIdentity.mock.calls.length;

      await act(async () => {
        actionButton(renderer, "重新確認裝置身分").props.onPress();
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(mocks.initializeDriverIdentity.mock.calls.length).toBeGreaterThan(
        before,
      );
    });

    it("records an internal diagnostic without rendering any of it", async () => {
      mocks.getDriverAuthState.mockReturnValue("provisioned");
      mocks.getIdentityContext.mockRejectedValue(
        new Error("Network request failed"),
      );
      const renderer = await renderWithRetries();

      const records = getDriverDiagnostics().filter(
        (record) => record.kind === "workspace_degrade",
      );
      expect(records).toHaveLength(1);
      expect(records[0].reason).toContain("identity_context_unavailable");
      expect(records[0].identityState).toBe("provisioned");
      expect(records[0].requestResults.identity_context).toBe("failed");

      const rendered = texts(renderer).join(" | ");
      expect(rendered).not.toContain("identity_context_unavailable");
      expect(rendered).not.toContain("requestResults");
      expect(rendered).not.toContain("provisioned");
      expect(rendered).not.toContain("driver-app.shift");
      expect(rendered).not.toContain("/api/");
      expect(rendered).not.toContain("403");
    });

    it("logs diagnostics through console.warn, never console.error", async () => {
      mocks.getIdentityContext.mockRejectedValue(
        new Error("Network request failed"),
      );
      await renderWithRetries();

      const diagnosticWarns = (warnSpy?.mock.calls ?? []).filter(
        (call: unknown[]) =>
          typeof call[0] === "string" && call[0].includes("driver-diagnostics"),
      );
      expect(diagnosticWarns.length).toBeGreaterThan(0);

      // react-test-renderer prints its own deprecation notice; anything else on
      // console.error would become a LogBox red screen on device.
      const appErrors = (errorSpy?.mock.calls ?? []).filter(
        (call: unknown[]) =>
          !(
            typeof call[0] === "string" &&
            call[0].includes("react-test-renderer is deprecated")
          ),
      );
      expect(appErrors).toEqual([]);
    });
  });

  describe("workspace cockpit", () => {
    it("greets the driver and shows the quick links", async () => {
      const renderer = await renderScreen();
      const rendered = texts(renderer);

      expect(rendered).toContain("早安，司機");
      expect(rendered).toContain("工作台");
      for (const label of ["任務", "行程", "平台", "班次", "收入", "設定"]) {
        expect(rendered).toContain(label);
      }
    });

    it("routes every quick tile to its screen", async () => {
      const renderer = await renderScreen();
      const routes: Array<[string, string]> = [
        ["任務", "/jobs"],
        ["行程", "/trip"],
        ["平台", "/platform-presence"],
        ["班次", "/shift"],
        ["收入", "/earnings"],
        ["設定", "/settings"],
      ];

      for (const [label, route] of routes) {
        mocks.push.mockClear();
        await act(async () => {
          pressableContainingText(renderer, label).props.onPress();
        });
        expect(mocks.push).toHaveBeenCalledWith(route);
      }
    });

    it("routes the alert bell to the SOS screen", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        pressableWithLabel(renderer, "安全事件").props.onPress();
      });
      expect(mocks.push).toHaveBeenCalledWith("/sos");
    });

    it("refreshes the whole cockpit from the footer link", async () => {
      const renderer = await renderScreen();
      const before = mocks.listUnifiedDriverTasks.mock.calls.length;
      await act(async () => {
        pressableContainingText(renderer, "重新整理").props.onPress();
        await flush();
      });
      expect(mocks.listUnifiedDriverTasks.mock.calls.length).toBe(before + 1);
    });
  });

  describe("next-action hero", () => {
    it("routes back to an in-progress trip", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ taskId: "task-live", driverActionState: "in_progress" }),
      ]);
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("返回進行中的行程");
      // The internal task identifier must never reach the screen.
      expect(texts(renderer)).not.toContain("返回行程 · task-live");
      expect(texts(renderer)).toContain("DRTS · 台北車站 → 台北 101");
    });

    it("prioritises a sync issue over an action-required task", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ taskId: "task-action", driverActionState: "action_required" }),
        task({
          taskId: "task-sync",
          driverActionState: "blocked",
          syncIssueSummary: "平台回應逾時",
          requiresReauth: true,
        }),
      ]);
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("處理授權或同步異常");
      expect(texts(renderer)).toContain("平台回應逾時");
    });

    it("points at the inbox when a task is waiting on the driver", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ driverActionState: "action_required" }),
      ]);
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("優先處理待回應任務");
      expect(texts(renderer)).toContain("DRTS · task-001 等待司機操作。");
    });

    it("explains an awaiting-platform queue without prompting the driver to drive", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ driverActionState: "awaiting_platform" }),
      ]);
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("查看平台確認進度");
      expect(
        texts(renderer).some((value) => value.includes("確認前請勿自行出車")),
      ).toBe(true);
    });
  });

  describe("task API fallback", () => {
    it("falls back to the legacy task list when the unified route fails", async () => {
      mocks.listUnifiedDriverTasks.mockRejectedValue(new Error("410"));
      mocks.listDriverTasks.mockResolvedValue([
        {
          taskId: "legacy-1",
          orderId: "order-legacy",
          status: "assigned",
          updatedAt: "2026-05-08T03:00:00.000Z",
        },
      ]);
      const renderer = await renderScreen();

      expect(mocks.listDriverTasks).toHaveBeenCalled();
      expect(texts(renderer)).toContain("工作台");
    });

    it("keeps the cockpit usable when both task routes fail", async () => {
      mocks.listUnifiedDriverTasks.mockRejectedValue(new Error("410"));
      mocks.listDriverTasks.mockRejectedValue(new Error("500"));
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("工作台");
      expect(texts(renderer)).toContain("早安，司機");
    });
  });

  // Requirement 2: no developer copy in any screen state.
  describe("driver-facing copy guard", () => {
    async function renderAfterIdentityRetries() {
      vi.useFakeTimers();
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(OnboardingScreen));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      return renderer;
    }

    it("keeps the loaded workspace free of developer copy", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ taskId: "task-live", driverActionState: "in_progress" }),
        task({ taskId: "task-sync", driverActionState: "blocked" }),
      ]);
      mocks.getPlatformPresence.mockResolvedValue({
        presences: [
          {
            platformCode: "uber",
            status: "online",
            eligibility: "eligible",
            reauthRequired: true,
            updatedAt: "2026-05-08T03:00:00.000Z",
          },
        ],
      });
      const renderer = await renderScreen();

      expect(renderedCopy(renderer)).toContain("工作台");
      expectNoDeveloperCopy(renderer);
    });

    it("keeps the identity check loading state free of developer copy", async () => {
      mocks.initializeDriverIdentity.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(OnboardingScreen));
      });
      expectNoDeveloperCopy(renderer);
    });

    it("keeps every unprovisioned auth state free of developer copy", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      for (const state of [
        "not_provisioned",
        "session_expired",
        "device_revoked",
        "driver_suspended",
      ]) {
        mocks.getDriverAuthState.mockReturnValue(state);
        const renderer = await renderScreen();
        expectNoDeveloperCopy(renderer);
      }
    });

    it("never prefills the device name and keeps its hint free of product code names", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      mocks.getDriverAuthState.mockReturnValue("not_provisioned");
      const renderer = await renderScreen();

      const deviceField = field(renderer, "裝置名稱");
      expect(deviceField.props.value).toBe("");
      expect(deviceField.props.placeholder).not.toContain("Driver Pixel");
      expect(renderedCopy(renderer)).not.toContain("Driver Pixel");
    });

    it("keeps the restricted screen free of developer copy", async () => {
      mocks.getIdentityContext.mockRejectedValue(
        new Error("Network request failed"),
      );
      const renderer = await renderAfterIdentityRetries();

      expect(renderedCopy(renderer)).toContain("目前無法連線到車隊系統");
      expectNoDeveloperCopy(renderer);
    });

    it("keeps a denied feature flag out of the rendered copy", async () => {
      mocks.getFeatureFlags.mockRejectedValue(new Error("API error 403: {}"));
      mocks.isFeatureEnabled.mockRejectedValue(new Error("API error 403: {}"));
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps the legacy task path free of developer copy", async () => {
      mocks.listUnifiedDriverTasks.mockRejectedValue(new Error("410"));
      mocks.listDriverTasks.mockResolvedValue([
        {
          taskId: "legacy-1",
          orderId: "order-legacy",
          status: "assigned",
          updatedAt: "2026-05-08T03:00:00.000Z",
        },
      ]);
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps task and platform load failures free of developer copy", async () => {
      mocks.listUnifiedDriverTasks.mockRejectedValue(new Error("410"));
      mocks.listDriverTasks.mockRejectedValue(new Error("500"));
      mocks.getPlatformPresence.mockRejectedValue(new Error("presence down"));
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps the development override badge out of a release build", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      mocks.getDriverAuthState.mockReturnValue("not_provisioned");
      mocks.hasDriverDevOverride.mockReturnValue(true);
      const renderer = await renderScreen();

      expect(renderedCopy(renderer)).not.toContain("開發");
    });
  });

});

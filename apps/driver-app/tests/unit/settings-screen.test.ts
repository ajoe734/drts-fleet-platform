import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { passthrough } = vi.hoisted(() => ({
  passthrough: (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never),
}));

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  canDismiss: vi.fn(() => false),
  dismissAll: vi.fn(),
  alert: vi.fn(),
  isDriverIdentityProvisioned: vi.fn(() => true),
  getDriverId: vi.fn(() => "drv-001"),
  getProvisionedSession: vi.fn(
    (): { deviceId: string; bindingId: string } | null => ({
      deviceId: "device-abc",
      bindingId: "bnd-abc",
    }),
  ),
  recoverDriverSessionFromApiError: vi.fn(async () => false),
  revokeDriverDeviceBinding: vi.fn(async () => undefined),
  getDriverSettings: vi.fn(),
  getDriverProfile: vi.fn(),
  updateDriverSettings: vi.fn(),
  updateDriverProfile: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Alert: { alert: mocks.alert },
  Pressable: (props: Record<string, unknown>) =>
    React.createElement("Pressable", props, props.children as React.ReactNode),
  StyleSheet: { create: <T>(styles: T) => styles },
  Switch: "Switch",
  Text: (props: Record<string, unknown>) =>
    React.createElement("Text", props, props.children as React.ReactNode),
  View: (props: Record<string, unknown>) =>
    React.createElement("View", props, props.children as React.ReactNode),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    canDismiss: mocks.canDismiss,
    dismissAll: mocks.dismissAll,
  }),
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: (props: Record<string, unknown>) =>
    React.createElement("Ionicons", props),
}));

vi.mock("@/components/platform-binding", () => ({
  PlatformBinding: passthrough("PlatformBinding"),
}));
vi.mock("@/components/ui/ActionButton", () => ({
  ActionButton: passthrough("ActionButton"),
}));
vi.mock("@/components/ui/AppScreen", () => ({
  AppScreen: passthrough("AppScreen"),
}));
vi.mock("@/components/ui/BottomActionBar", () => ({
  BottomActionBar: passthrough("BottomActionBar"),
}));
vi.mock("@/components/ui/EmptyState", () => ({
  EmptyState: passthrough("EmptyState"),
}));
vi.mock("@/components/ui/ErrorBanner", () => ({
  ErrorBanner: passthrough("ErrorBanner"),
}));
vi.mock("@/components/ui/AuthorityBanner", () => ({
  AuthorityBanner: passthrough("AuthorityBanner"),
}));
vi.mock("@/components/ui/FormField", () => ({
  FormField: passthrough("FormField"),
}));
vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: passthrough("PageHeader"),
}));
vi.mock("@/components/ui/StatusChip", () => ({
  StatusChip: passthrough("StatusChip"),
}));

vi.mock("@/lib/api-client", () => {
  const driverClient = {
    getDriverSettings: mocks.getDriverSettings,
    getDriverProfile: mocks.getDriverProfile,
    updateDriverSettings: mocks.updateDriverSettings,
    updateDriverProfile: mocks.updateDriverProfile,
  };
  return {
    formatDriverError: (error: unknown, fallback: string) =>
      error instanceof Error ? error.message : fallback,
    getDriverClient: () => driverClient,
    getDriverClientOrNull: () =>
      mocks.isDriverIdentityProvisioned() ? driverClient : null,
    getDriverId: mocks.getDriverId,
    getDriverIdOrNull: () =>
      mocks.isDriverIdentityProvisioned() ? mocks.getDriverId() : null,
    getProvisionedSession: mocks.getProvisionedSession,
    isDriverIdentityProvisioned: mocks.isDriverIdentityProvisioned,
    recoverDriverSessionFromApiError: mocks.recoverDriverSessionFromApiError,
    revokeDriverDeviceBinding: mocks.revokeDriverDeviceBinding,
  };
});

import SettingsScreen from "../../app/(tabs)/settings/index";
import {
  getDriverSessionState,
  markDriverSessionSignedIn,
  markDriverSessionSignedOut,
  resetDriverSessionLifecycleForTests,
} from "../../lib/driver-session-lifecycle";

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderScreen() {
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(SettingsScreen));
    await flush();
  });
  return renderer;
}

function field(renderer: any, label: string) {
  return renderer.root.find(
    (node: any) => node.type === "FormField" && node.props.label === label,
  );
}

function actionButtons(renderer: any) {
  return renderer.root.findAll((node: any) => node.type === "ActionButton");
}

function saveButton(renderer: any) {
  return actionButtons(renderer).at(-1);
}

function errorBanners(renderer: any) {
  return renderer.root
    .findAll((node: any) => node.type === "ErrorBanner")
    .map((node: any) => node.props.message as string);
}

function switches(renderer: any) {
  return renderer.root.findAll((node: any) => node.type === "Switch");
}

async function setField(renderer: any, label: string, value: string) {
  await act(async () => {
    field(renderer, label).props.onChangeText(value);
  });
}

const SETTINGS_RECORD = {
  language: "zh-TW",
  notificationsEnabled: true,
  autoAcceptEnabled: false,
  maxAcceptRadius: 10,
};

const PROFILE_RECORD = {
  name: "陳司機",
  phone: "0912345678",
  email: "driver@example.com",
  emergencyContact: null,
};


// --- developer-copy guard ---------------------------------------------------
// Requirement 2: no screen state may show system architecture, API paths, spec
// numbers, code identifiers or internal sync strategy. The guard walks every
// rendered host node and reads back only the props that actually carry copy,
// so it sees titles/subtitles/labels handed to the mocked primitives too.
const COPY_BEARING_PROPS = new Set([
  "accessibilityHint",
  "accessibilityLabel",
  "actionTitle",
  "authorityLabel",
  "body",
  "children",
  "code",
  "description",
  "detail",
  "error",
  "eyebrow",
  "helpText",
  "hint",
  "items",
  "label",
  "message",
  "name",
  "ph",
  "placeholder",
  "subtitle",
  "text",
  "title",
  "value",
]);

function collectCopy(value: unknown, out: string[]) {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectCopy(entry, out);
    }
    return;
  }
  if (value && typeof value === "object") {
    if ((value as { $$typeof?: symbol }).$$typeof) {
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      if (COPY_BEARING_PROPS.has(key)) {
        collectCopy(nested, out);
      }
    }
  }
}

function renderedCopy(renderer: any): string {
  const out: string[] = [];
  const nodes = renderer.root.findAll(
    (node: any) => typeof node.type === "string" && node.type !== "Ionicons",
  );
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node.props ?? {})) {
      if (COPY_BEARING_PROPS.has(key)) {
        collectCopy(value, out);
      }
    }
  }
  return out.join("\n");
}

const DEVELOPER_COPY_PATTERNS: Array<[string, RegExp]> = [
  ["spec", /\bspec/i],
  ["§", /§/],
  ["Q-DRV", /q-drv/i],
  ["capability", /capabilit/i],
  ["guardrail", /guardrail/i],
  ["forwarded", /forwarded/i],
  ["sync_failed", /sync_failed/i],
  ["degraded", /degraded/i],
  ["down", /\bdown\b/i],
  ["sitemap", /sitemap/i],
  ["cockpit", /cockpit/i],
  ["packet", /packet/i],
  ["Phase 1", /phase\s*1/i],
  ["fallback", /fallback/i],
  ["API", /\bapi\b/i],
  ["/api/", /\/api\//i],
  ["EmptyReason", /emptyreason/i],
  ["ResourceActionDescriptor", /resourceaction/i],
  ["CrossAppResourceLink", /crossapp/i],
  ["next-best-action", /next-best/i],
  ["deep link", /deep[ _-]?link/i],
  ["allowedActions/availableActions", /(allowed|available)actions/i],
  ["web console", /web console/i],
  ["EXPO_PUBLIC", /expo_public/i],
  ["outbox", /outbox/i],
  ["idempotency", /idempoten/i],
  ["relay", /\brelay\b/i],
  ["requirements", /requirement/i],
  ["mirror jargon", /鏡像|生命周期|生命週期|旗標|降級|主控/],
];

function developerTermsIn(renderer: any): string[] {
  const copy = renderedCopy(renderer);
  return DEVELOPER_COPY_PATTERNS.filter(([, pattern]) =>
    pattern.test(copy),
  ).map(([term]) => term);
}

describe("SettingsScreen", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.canDismiss.mockReset().mockReturnValue(false);
    mocks.dismissAll.mockReset();
    mocks.alert.mockReset();
    mocks.isDriverIdentityProvisioned.mockReset().mockReturnValue(true);
    mocks.getDriverId.mockReset().mockReturnValue("drv-001");
    mocks.getProvisionedSession.mockReset().mockReturnValue({
      deviceId: "device-abc",
      bindingId: "bnd-abc",
    });
    mocks.recoverDriverSessionFromApiError.mockReset().mockResolvedValue(false);
    mocks.revokeDriverDeviceBinding.mockReset().mockResolvedValue(undefined);
    mocks.getDriverSettings.mockReset().mockResolvedValue(SETTINGS_RECORD);
    mocks.getDriverProfile.mockReset().mockResolvedValue(PROFILE_RECORD);
    mocks.updateDriverSettings.mockReset().mockResolvedValue(undefined);
    mocks.updateDriverProfile.mockReset().mockResolvedValue(undefined);
  });

  describe("unprovisioned gate", () => {
    it("blocks the settings form and offers a route to onboarding", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      const renderer = await renderScreen();

      const empty = renderer.root.findByType("EmptyState");
      expect(empty.props.title).toBe("尚未完成裝置綁定");
      expect(empty.props.actionTitle).toBe("前往完成裝置綁定");
      expect(
        renderer.root.findAll((n: any) => n.type === "FormField"),
      ).toHaveLength(0);

      await act(async () => {
        empty.props.onAction();
      });
      expect(mocks.push).toHaveBeenCalledWith("/onboarding");
    });

    it("never calls the API when the device is unprovisioned", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      await renderScreen();
      expect(mocks.getDriverSettings).not.toHaveBeenCalled();
      expect(mocks.getDriverProfile).not.toHaveBeenCalled();
    });
  });

  describe("loading", () => {
    it("shows a spinner until both requests settle", async () => {
      mocks.getDriverSettings.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(SettingsScreen));
      });
      expect(
        renderer.root.findAll((n: any) => n.type === "ActivityIndicator"),
      ).toHaveLength(1);
    });
  });

  describe("initial load", () => {
    it("hydrates every form field from the API records", async () => {
      const renderer = await renderScreen();

      expect(field(renderer, "姓名").props.value).toBe("陳司機");
      expect(field(renderer, "電話").props.value).toBe("0912345678");
      expect(field(renderer, "電子郵件").props.value).toBe(
        "driver@example.com",
      );
      expect(field(renderer, "介面語言").props.value).toBe("zh-TW");
      expect(field(renderer, "最大接單範圍（公里）").props.value).toBe("10");
    });

    it("requests settings for the provisioned driver id", async () => {
      await renderScreen();
      expect(mocks.getDriverSettings).toHaveBeenCalledWith("drv-001");
    });

    it("shows no error banner on a clean load", async () => {
      const renderer = await renderScreen();
      expect(errorBanners(renderer)).toEqual([]);
    });

    it("degrades gracefully when only the profile request fails", async () => {
      mocks.getDriverProfile.mockRejectedValue(new Error("profile down"));
      const renderer = await renderScreen();

      expect(errorBanners(renderer)[0]).toBe(
        "已使用可用資料。無法載入 個人資料（profile down）。",
      );
      expect(field(renderer, "介面語言").props.value).toBe("zh-TW");
      expect(field(renderer, "姓名").props.editable).toBe(false);
    });

    it("joins both section names when both requests fail", async () => {
      mocks.getDriverSettings.mockRejectedValue(new Error("s down"));
      mocks.getDriverProfile.mockRejectedValue(new Error("p down"));
      const renderer = await renderScreen();

      expect(errorBanners(renderer)[0]).toBe(
        "已使用可用資料。無法載入 偏好設定（s down）和個人資料（p down）。",
      );
    });

    it("resets to onboarding when the load error is a revoked session", async () => {
      mocks.getDriverSettings.mockRejectedValue(new Error("401"));
      mocks.recoverDriverSessionFromApiError.mockResolvedValue(true);
      mocks.canDismiss.mockReturnValue(true);

      await renderScreen();

      expect(mocks.dismissAll).toHaveBeenCalled();
      expect(mocks.replace).toHaveBeenCalledWith("/onboarding");
    });
  });

  describe("save button state machine", () => {
    it("starts disabled and labelled 目前無變更", async () => {
      const renderer = await renderScreen();
      expect(saveButton(renderer).props.title).toBe("目前無變更");
      expect(saveButton(renderer).props.disabled).toBe(true);
    });

    it("enables and relabels once a field is edited", async () => {
      const renderer = await renderScreen();
      await setField(renderer, "姓名", "林司機");

      expect(saveButton(renderer).props.title).toBe("儲存設定");
      expect(saveButton(renderer).props.disabled).toBe(false);
    });

    it("returns to 目前無變更 when the edit is reverted", async () => {
      const renderer = await renderScreen();
      await setField(renderer, "姓名", "林司機");
      await setField(renderer, "姓名", "陳司機");

      expect(saveButton(renderer).props.title).toBe("目前無變更");
      expect(saveButton(renderer).props.disabled).toBe(true);
    });

    it("blocks saving while a field fails validation", async () => {
      const renderer = await renderScreen();
      await setField(renderer, "姓名", "");

      expect(saveButton(renderer).props.title).toBe("請先修正欄位");
      expect(saveButton(renderer).props.disabled).toBe(true);
      expect(errorBanners(renderer)).toContain(
        "請先修正標示欄位後再儲存設定。",
      );
    });

    it("ignores a press while the button is disabled", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        saveButton(renderer).props.onPress();
        await flush();
      });
      expect(mocks.updateDriverSettings).not.toHaveBeenCalled();
      expect(mocks.updateDriverProfile).not.toHaveBeenCalled();
    });
  });

  describe("field validation", () => {
    it("surfaces the radius error on the field itself", async () => {
      const renderer = await renderScreen();
      await setField(renderer, "最大接單範圍（公里）", "999");

      expect(field(renderer, "最大接單範圍（公里）").props.error).toBe(
        "接單範圍不可超過 200 公里。",
      );
    });

    it("surfaces an invalid email on the field itself", async () => {
      const renderer = await renderScreen();
      await setField(renderer, "電子郵件", "nope");

      expect(field(renderer, "電子郵件").props.error).toBe(
        "電子郵件格式無效。",
      );
    });

    it("demands the full emergency contact once one part is typed", async () => {
      const renderer = await renderScreen();
      await setField(renderer, "關係", "配偶");

      expect(field(renderer, "聯絡人姓名").props.error).toBe(
        "新增緊急聯絡人時，請填寫聯絡人姓名。",
      );
      expect(field(renderer, "聯絡人電話").props.error).toBe(
        "新增緊急聯絡人時，請填寫聯絡人電話。",
      );
    });
  });

  describe("switches", () => {
    it("renders the notification and auto-accept toggles from the record", async () => {
      const renderer = await renderScreen();
      const [notifications, autoAccept] = switches(renderer);

      expect(notifications.props.value).toBe(true);
      expect(autoAccept.props.value).toBe(false);
    });

    it("marks the form dirty when the auto-accept toggle flips", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        switches(renderer)[1].props.onValueChange(true);
      });

      expect(switches(renderer)[1].props.value).toBe(true);
      expect(saveButton(renderer).props.title).toBe("儲存設定");
    });

    it("sends the flipped toggle in the save command", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        switches(renderer)[0].props.onValueChange(false);
      });
      await act(async () => {
        saveButton(renderer).props.onPress();
        await flush();
      });

      expect(mocks.updateDriverSettings).toHaveBeenCalledWith("drv-001", {
        language: "zh-TW",
        notificationsEnabled: false,
        autoAcceptEnabled: false,
        maxAcceptRadius: 10,
      });
    });
  });

  describe("saving", () => {
    it("only sends the section that actually changed", async () => {
      const renderer = await renderScreen();
      await setField(renderer, "姓名", "林司機");
      await act(async () => {
        saveButton(renderer).props.onPress();
        await flush();
      });

      expect(mocks.updateDriverProfile).toHaveBeenCalledWith({
        name: "林司機",
        phone: "0912345678",
        email: "driver@example.com",
        emergencyContact: null,
      });
      expect(mocks.updateDriverSettings).not.toHaveBeenCalled();
    });

    it("sends both sections when both changed", async () => {
      const renderer = await renderScreen();
      await setField(renderer, "姓名", "林司機");
      await setField(renderer, "最大接單範圍（公里）", "25");
      await act(async () => {
        saveButton(renderer).props.onPress();
        await flush();
      });

      expect(mocks.updateDriverSettings).toHaveBeenCalledWith("drv-001", {
        language: "zh-TW",
        notificationsEnabled: true,
        autoAcceptEnabled: false,
        maxAcceptRadius: 25,
      });
      expect(mocks.updateDriverProfile).toHaveBeenCalledTimes(1);
    });

    it("confirms success and clears the dirty state", async () => {
      const renderer = await renderScreen();
      await setField(renderer, "姓名", "林司機");
      await act(async () => {
        saveButton(renderer).props.onPress();
        await flush();
      });

      expect(mocks.alert).toHaveBeenCalledWith("儲存成功", "設定已成功儲存。");
      expect(saveButton(renderer).props.title).toBe("目前無變更");
      expect(saveButton(renderer).props.disabled).toBe(true);
    });

    it("reports a total failure without clearing the pending edit", async () => {
      mocks.updateDriverProfile.mockRejectedValue(new Error("write failed"));
      const renderer = await renderScreen();
      await setField(renderer, "姓名", "林司機");
      await act(async () => {
        saveButton(renderer).props.onPress();
        await flush();
      });

      expect(mocks.alert).toHaveBeenCalledWith(
        "儲存失敗",
        "無法儲存 個人資料（write failed）。",
      );
      expect(errorBanners(renderer)).toContain(
        "無法儲存 個人資料（write failed）。",
      );
      expect(saveButton(renderer).props.disabled).toBe(false);
    });

    it("reports a partial save and keeps only the failed section dirty", async () => {
      mocks.updateDriverProfile.mockRejectedValue(new Error("write failed"));
      const renderer = await renderScreen();
      await setField(renderer, "姓名", "林司機");
      await setField(renderer, "最大接單範圍（公里）", "25");
      await act(async () => {
        saveButton(renderer).props.onPress();
        await flush();
      });

      expect(mocks.alert).toHaveBeenCalledWith(
        "部分儲存成功",
        "已儲存 偏好設定。無法儲存 個人資料（write failed）。",
      );
      expect(saveButton(renderer).props.disabled).toBe(false);
    });

    it("resets to onboarding when a save is rejected by a revoked session", async () => {
      mocks.updateDriverProfile.mockRejectedValue(new Error("401"));
      mocks.recoverDriverSessionFromApiError.mockResolvedValue(true);
      const renderer = await renderScreen();
      await setField(renderer, "姓名", "林司機");
      await act(async () => {
        saveButton(renderer).props.onPress();
        await flush();
      });

      expect(mocks.replace).toHaveBeenCalledWith("/onboarding");
      expect(mocks.alert).not.toHaveBeenCalled();
    });

    it("clears a stale save error as soon as the driver edits again", async () => {
      mocks.updateDriverProfile.mockRejectedValue(new Error("write failed"));
      const renderer = await renderScreen();
      await setField(renderer, "姓名", "林司機");
      await act(async () => {
        saveButton(renderer).props.onPress();
        await flush();
      });
      expect(errorBanners(renderer).length).toBeGreaterThan(0);

      await setField(renderer, "姓名", "王司機");
      expect(errorBanners(renderer)).toEqual([]);
    });
  });

  describe("device actions", () => {
    it("shows the provisioned device and binding identifiers", async () => {
      const renderer = await renderScreen();
      const texts = renderer.root
        .findAll((n: any) => n.type === "Text")
        .map((n: any) => n.props.children)
        .flat();

      expect(texts).toContain("device-abc");
      expect(texts).toContain("bnd-abc");
    });

    it("says the identifiers are not available yet instead of inventing placeholder codes", async () => {
      mocks.getProvisionedSession.mockReturnValue(null);
      const renderer = await renderScreen();
      const texts = renderer.root
        .findAll((n: any) => n.type === "Text")
        .map((n: any) => n.props.children)
        .flat();

      expect(texts).toContain("尚未取得");
      expect(texts).not.toContain("device-drv-001");
      expect(texts).not.toContain("bnd-active-001");
      expect(texts).not.toContain("Unbound");
    });

    it("routes the rebind button to onboarding", async () => {
      const renderer = await renderScreen();
      const rebind = actionButtons(renderer).find(
        (node: any) => node.props.accessibilityLabel === "重新綁定裝置",
      );

      await act(async () => {
        rebind.props.onPress();
      });
      expect(mocks.push).toHaveBeenCalledWith("/onboarding");
    });

    it("asks for confirmation before revoking the device binding", async () => {
      const renderer = await renderScreen();
      const revoke = actionButtons(renderer).find(
        (node: any) => node.props.accessibilityLabel === "登出並撤銷裝置",
      );

      await act(async () => {
        revoke.props.onPress();
      });

      const [title, message, buttons] = mocks.alert.mock.calls.at(-1) as any;
      expect(title).toBe("登出裝置");
      expect(message).toContain("重新完成裝置綁定");
      expect(buttons[0]).toMatchObject({ text: "取消", style: "cancel" });
      expect(buttons[1]).toMatchObject({ text: "登出", style: "destructive" });
      expect(mocks.revokeDriverDeviceBinding).not.toHaveBeenCalled();
    });

    it("revokes the binding and returns to onboarding on confirm", async () => {
      const renderer = await renderScreen();
      const revoke = actionButtons(renderer).find(
        (node: any) => node.props.accessibilityLabel === "登出並撤銷裝置",
      );

      await act(async () => {
        revoke.props.onPress();
      });
      const buttons = (mocks.alert.mock.calls.at(-1) as any)[2];
      await act(async () => {
        await buttons[1].onPress();
        await flush();
      });

      expect(mocks.revokeDriverDeviceBinding).toHaveBeenCalledTimes(1);
      expect(mocks.replace).toHaveBeenCalledWith("/onboarding");
    });

    it("broadcasts the sign-out so other tabs tear their timers down", async () => {
      resetDriverSessionLifecycleForTests();
      markDriverSessionSignedIn();

      const renderer = await renderScreen();
      const revoke = actionButtons(renderer).find(
        (node: any) => node.props.accessibilityLabel === "登出並撤銷裝置",
      );

      await act(async () => {
        revoke.props.onPress();
      });
      const buttons = (mocks.alert.mock.calls.at(-1) as any)[2];
      await act(async () => {
        await buttons[1].onPress();
        await flush();
      });

      expect(getDriverSessionState()).toBe("signed_out");
    });

    it("still returns to onboarding when the remote revoke fails", async () => {
      resetDriverSessionLifecycleForTests();
      markDriverSessionSignedIn();
      mocks.revokeDriverDeviceBinding.mockRejectedValueOnce(
        new Error("網路連線失敗"),
      );

      const renderer = await renderScreen();
      const revoke = actionButtons(renderer).find(
        (node: any) => node.props.accessibilityLabel === "登出並撤銷裝置",
      );

      await act(async () => {
        revoke.props.onPress();
      });
      const buttons = (mocks.alert.mock.calls.at(-1) as any)[2];

      const rejections: unknown[] = [];
      const onUnhandled = (reason: unknown) => rejections.push(reason);
      process.on("unhandledRejection", onUnhandled);
      try {
        await act(async () => {
          await buttons[1].onPress();
          await flush();
        });
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }

      expect(rejections).toEqual([]);
      expect(getDriverSessionState()).toBe("signed_out");
      expect(mocks.replace).toHaveBeenCalledWith("/onboarding");
    });
  });

  describe("session lifecycle", () => {
    it("renders the binding prompt without throwing when the session is gone", async () => {
      resetDriverSessionLifecycleForTests();
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      mocks.getDriverId.mockImplementation(() => {
        throw new Error("尚未完成裝置綁定，請先完成裝置註冊。");
      });

      const renderer = await renderScreen();

      expect(
        renderer.root.findAll((n: any) => n.type === "EmptyState"),
      ).toHaveLength(1);
      expect(mocks.getDriverSettings).not.toHaveBeenCalled();
      expect(mocks.getDriverProfile).not.toHaveBeenCalled();
    });

    it("stops calling the API after the session ends while the tab stays mounted", async () => {
      resetDriverSessionLifecycleForTests();
      markDriverSessionSignedIn();
      await renderScreen();

      const before = mocks.getDriverSettings.mock.calls.length;
      expect(before).toBeGreaterThan(0);

      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      await act(async () => {
        markDriverSessionSignedOut();
        await flush();
      });

      expect(mocks.getDriverSettings.mock.calls.length).toBe(before);
    });
  });

  describe("utility rows", () => {
    it("routes 查看收益 to the earnings screen", async () => {
      const renderer = await renderScreen();
      const rows = renderer.root.findAll(
        (node: any) => node.type === "Pressable" && node.props.onPress,
      );
      // 查看收益 is the first pressable utility row, 登出 the second.
      await act(async () => {
        rows[0].props.onPress();
      });
      expect(mocks.push).toHaveBeenCalledWith("/earnings");
    });

    it("opens the logout confirmation from the danger utility row", async () => {
      const renderer = await renderScreen();
      const rows = renderer.root.findAll(
        (node: any) => node.type === "Pressable" && node.props.onPress,
      );
      await act(async () => {
        rows[1].props.onPress();
      });
      expect((mocks.alert.mock.calls.at(-1) as any)[0]).toBe("登出裝置");
    });

    it("leaves the read-only rows unpressable", async () => {
      const renderer = await renderScreen();
      const pressableRows = renderer.root.findAll(
        (node: any) => node.type === "Pressable" && node.props.onPress,
      );
      // 緊急聯絡人 and 關於本機 are informational; only 查看收益 and 登出 act.
      expect(pressableRows).toHaveLength(2);
    });
  });

  describe("identity summary", () => {
    it("derives the avatar initial from the driver name", async () => {
      const renderer = await renderScreen();
      const texts = renderer.root
        .findAll((n: any) => n.type === "Text")
        .map((n: any) => n.props.children);
      expect(texts).toContain("陳");
    });

    it("falls back to 司 when the name is blank", async () => {
      mocks.getDriverProfile.mockResolvedValue({
        ...PROFILE_RECORD,
        name: "",
      });
      const renderer = await renderScreen();
      const texts = renderer.root
        .findAll((n: any) => n.type === "Text")
        .map((n: any) => n.props.children);
      expect(texts).toContain("司");
      expect(texts).toContain("尚未填寫司機姓名");
    });

    it("summarises the emergency contact as 尚未設定 when empty", async () => {
      const renderer = await renderScreen();
      const texts = renderer.root
        .findAll((n: any) => n.type === "Text")
        .map((n: any) => n.props.children);
      expect(texts).toContain("尚未設定");
    });
  });

  describe("developer copy guard", () => {
    it("keeps the unbound-device empty state free of developer jargon", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      const renderer = await renderScreen();
      // Also proves the collector really reaches the screen's copy.
      expect(renderedCopy(renderer)).toContain("尚未完成裝置綁定");
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the loading state free of developer jargon", async () => {
      mocks.getDriverSettings.mockReturnValue(new Promise(() => {}));
      mocks.getDriverProfile.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(SettingsScreen));
      });
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the loaded settings form free of developer jargon", async () => {
      const renderer = await renderScreen();
      expect(renderedCopy(renderer)).toContain("裝置與身份綁定");
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the form free of developer jargon with no provisioning session", async () => {
      mocks.getProvisionedSession.mockReturnValue(null);
      const renderer = await renderScreen();
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps a load failure free of developer jargon", async () => {
      mocks.getDriverSettings.mockRejectedValue(new Error("連線逾時"));
      mocks.getDriverProfile.mockRejectedValue(new Error("連線逾時"));
      const renderer = await renderScreen();
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps validation feedback free of developer jargon", async () => {
      const renderer = await renderScreen();
      await setField(renderer, "姓名", "");
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("no longer renders the shared device strings that carry code identifiers", async () => {
      const renderer = await renderScreen();
      const copy = renderedCopy(renderer);

      expect(copy).not.toContain("DeviceId");
      expect(copy).not.toContain("BindingId");
      expect(copy).not.toContain("DriverId");
      expect(copy).not.toContain("Rebind");
      expect(copy).not.toContain("Revoke");
      expect(copy).not.toContain("Session");
      expect(copy).not.toContain("OfflineProofPreserved");
    });
  });
});

import { createElement, type EffectCallback, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DriverActivationScreen from "../../app/driver-activate";
import {
  routeDriverActivationLink,
  takeDriverActivationToken,
} from "../../lib/driver-activation-link";

const mocks = vi.hoisted(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  return {
    activate: vi.fn(),
    replace: vi.fn(),
    formatError: vi.fn().mockReturnValue("裝置驗證失敗。"),
    errorBanner: vi.fn(),
    actionButton: vi.fn<(title: string, onPress: () => void) => void>(),
  };
});

vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  const router = { replace: mocks.replace };
  return {
    useFocusEffect: (callback: EffectCallback) =>
      useEffect(callback, [callback]),
    useRouter: () => router,
  };
});

vi.mock("react-native", () => ({
  ActivityIndicator: "progress",
  Text: "div",
  StyleSheet: { create: <T>(styles: T) => styles },
}));

vi.mock("@/components/ui", () => ({
  tokens: { colors: {}, spacing: {}, type: {} },
  AppScreen: ({ children }: { children: ReactNode }) =>
    createElement("main", null, children),
  ErrorBanner: ({ message }: { message: string }) => {
    mocks.errorBanner(message);
    return createElement("div", { role: "alert" }, message);
  },
  ActionButton: ({
    title,
    onPress,
  }: {
    title: string;
    onPress: () => void;
  }) => {
    mocks.actionButton(title, onPress);
    return createElement("button", { onClick: onPress }, title);
  },
}));

vi.mock("@/lib/api-client", () => ({
  activateDriverDevice: mocks.activate,
  formatDriverRegistrationError: mocks.formatError,
}));

const token = "4BF6QaQ0TzT1bTnpO5xJSkzRwaBFwBf8tS5GdR2VBrw";
const link = "https://api.smarttransport.tw/driver-activate#token=" + token;

describe("Driver App activation screen", () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    vi.clearAllMocks();
    takeDriverActivationToken();
  });

  async function render() {
    await act(async () => {
      renderer = create(createElement(DriverActivationScreen));
    });
  }

  afterEach(async () => {
    await act(async () => renderer.unmount());
  });

  it("consumes the link once on cold launch and opens the workspace automatically", async () => {
    mocks.activate.mockResolvedValue("activated");
    routeDriverActivationLink(link);

    await render();

    expect(mocks.activate).toHaveBeenCalledExactlyOnceWith(token);
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/");
    expect(takeDriverActivationToken()).toBeNull();
  });

  it("handles an incoming link on the focused screen and keeps manual entry available after failure", async () => {
    mocks.activate.mockRejectedValue(new Error("rejected"));
    await render();

    await act(async () => {
      routeDriverActivationLink(link);
    });

    expect(mocks.activate).toHaveBeenCalledExactlyOnceWith(token);
    expect(mocks.errorBanner).toHaveBeenLastCalledWith("裝置驗證失敗。");
    expect(mocks.actionButton).toHaveBeenLastCalledWith(
      "手動輸入註冊碼",
      expect.any(Function),
    );
    await act(async () => mocks.actionButton.mock.lastCall?.[1]());
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/onboarding");
  });

  it("shows the existing-session status and leaves the workspace openable", async () => {
    mocks.activate.mockResolvedValue("already_signed_in");
    routeDriverActivationLink(link);

    await render();

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.actionButton).toHaveBeenLastCalledWith(
      "返回工作台",
      expect.any(Function),
    );
  });
});

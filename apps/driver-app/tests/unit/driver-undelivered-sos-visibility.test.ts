import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as any).__DEV__ = true;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

/**
 * DRIVER-APP-FOLLOWUPS-20261126: an SOS that has not reached the fleet was
 * only mentioned on the SOS screen. Logging out deletes it without a word,
 * the sign-in screen did not say it was still unsent, and home showed
 * nothing. These tests use the real stored-SOS checks in lib/api-client
 * (with an in-memory secure store) and mount the real screens.
 *
 * Storage errors never throw. Before logging out and on the sign-in screen
 * they err toward warning; home, which states a fact, then shows nothing.
 */

const SOS_KEY = "drts.driver.sos.activeCase";
const OWNER = "drv-owner-001";

const h = vi.hoisted(() => ({
  store: new Map<string, string>(),
  // Only reads of the stored SOS fail or hang; the session still loads.
  failSosReads: false,
  hangSosReads: false,
  // The latest useFocusEffect callback, to simulate home coming back into view.
  focus: null as null | (() => void),
  push: vi.fn(),
  replace: vi.fn(),
  alert: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => {
    if (key === "drts.driver.sos.activeCase") {
      if (h.failSosReads) throw new Error("keychain unavailable");
      if (h.hangSosReads) return new Promise<string | null>(() => {});
    }
    return h.store.get(key) ?? null;
  }),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    h.store.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    h.store.delete(key);
  }),
}));

vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: {} } },
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Alert: { alert: h.alert },
  Keyboard: { addListener: () => ({ remove: vi.fn() }), dismiss: vi.fn() },
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: {
    OS: "ios",
    select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
  },
  Pressable: "Pressable",
  SafeAreaView: "SafeAreaView",
  ScrollView: "ScrollView",
  StatusBar: "StatusBar",
  StyleSheet: { create: <T>(styles: T) => styles },
  Switch: "Switch",
  Text: "Text",
  TextInput: "TextInput",
  TouchableOpacity: "TouchableOpacity",
  View: "View",
}));

vi.mock("expo-router", () => ({
  Redirect: (props: { href: string }) => React.createElement("Redirect", props),
  useFocusEffect: (callback: () => void) => {
    h.focus = callback;
    React.useEffect(callback, [callback]);
  },
  useRouter: () => ({ push: h.push, replace: h.replace }),
}));

vi.mock("@/components/canvas-primitives", () => {
  const comp =
    (name: string) =>
    (props: { children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement(name, props, props.children);
  return {
    Banner: (props: Record<string, React.ReactNode>) =>
      React.createElement(
        "Banner",
        props,
        props.title,
        " ",
        props.body,
        props.actions,
      ),
    Btn: comp("Btn"),
    Card: comp("Card"),
    KPI: () => null,
    PageHeader: (props: Record<string, React.ReactNode>) =>
      React.createElement("PageHeader", null, props.title, props.actions),
    Pill: comp("Pill"),
    Shell: comp("Shell"),
    driverCanvasTheme: new Proxy({}, { get: () => "#000" }),
  };
});

vi.mock("@/components/platform-binding", () => ({
  PlatformBinding: () => null,
}));

vi.mock("../../components/platform-notice-banner", () => ({
  PlatformNoticeBanner: () => null,
}));

// The screens' server calls are faked; session and SOS storage stay real.
const fakeClient = {
  getDriverSettings: vi.fn(async () => ({})),
  getDriverProfile: vi.fn(async () => ({})),
  listUnifiedDriverTasks: vi.fn(async () => []),
  listDriverTasks: vi.fn(async () => []),
  getPlatformPresence: vi.fn(async () => ({
    driverId: OWNER,
    presences: [],
    adapterStatuses: [],
  })),
  isFeatureEnabled: vi.fn(async () => false),
  listShifts: vi.fn(async () => []),
  getList: vi.fn(async () => []),
  post: vi.fn(),
};

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api-client")>()),
  getDriverClient: () => fakeClient,
}));

import * as SecureStore from "expo-secure-store";

import {
  clearDriverProvisioning,
  getSignedInDriverSosState,
  hasUndeliveredSosAfterSessionLost,
  hasUndeliveredSosOfSignedInDriver,
  recoverDriverSessionFromApiError,
  registerDriverDevice,
} from "../../lib/api-client";
import {
  hasUndeliveredSosKeptThroughSignOut,
  markStoredDriverSosSessionLost,
} from "../../lib/driver-sos-outbox";
import WorkspaceIndex from "../../app/index";
import OnboardingScreen from "../../app/onboarding";
import SettingsScreen from "../../app/settings";

const AUTH_ERROR = new Error(
  'API error 401: {"error":{"code":"DRIVER_DEVICE_REFRESH_INVALID","message":"Session revoked."}}',
);

function storeSos(overrides: Record<string, unknown> = {}) {
  h.store.set(
    SOS_KEY,
    JSON.stringify({
      clientEventId: "client-event-1",
      originalTriggeredAt: new Date().toISOString(),
      syncState: "failed_retryable",
      receipt: null,
      falseAlarm: { dismissed: false, dismissedAt: null, note: null },
      ownerDriverId: OWNER,
      ...overrides,
    }),
  );
}

const DELIVERED = {
  syncState: "submitted",
  receipt: { incidentId: "inc-1", eventNo: "SOS-1" },
};
const DISMISSED = {
  falseAlarm: { dismissed: true, dismissedAt: null, note: null },
};
// Saved by an older app version: no owner. The SOS screen sends it under the
// current sign-in, so it counts as this driver's.
const OWNERLESS = { ownerDriverId: undefined };
// Older than 30 minutes: the SOS screen asks 「仍要送出嗎？」 before sending.
const STALE = {
  originalTriggeredAt: new Date(Date.now() - 45 * 60_000).toISOString(),
};
// Refused by the server: no automatic resend, only 重新送出.
const REFUSED = { autoResendBlocked: true };

function storedSos() {
  return JSON.parse(h.store.get(SOS_KEY)!) as Record<string, unknown>;
}

async function signIn(driverId: string) {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          accessToken: `access-${driverId}`,
          refreshToken: `refresh-${driverId}`,
          tokenType: "Bearer",
          expiresIn: 900,
          refreshExpiresIn: 2592000,
          driverId,
          deviceId: "device-test-001",
          bindingId: `binding-${driverId}`,
          issuedAt: new Date().toISOString(),
        },
        meta: { requestId: "register", timestamp: new Date().toISOString() },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  try {
    await registerDriverDevice("REG-CODE-0001");
  } finally {
    fetchMock.mockRestore();
  }
}

/** Signed out by an expired session while the stored SOS was unsent. */
async function loseSessionWithSos(overrides: Record<string, unknown> = {}) {
  await signIn(OWNER);
  storeSos(overrides);
  expect(await recoverDriverSessionFromApiError(AUTH_ERROR)).toBe(true);
}

let renderer: any = null;

function collectText(node: any): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(collectText).join("");
  return collectText(node.children ?? []);
}

function screenText() {
  return collectText(renderer.toJSON());
}

async function mount(element: React.ReactElement) {
  await act(async () => {
    renderer = create(element);
  });
  await act(async () => {
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });
}

beforeEach(async () => {
  h.store.clear();
  h.failSosReads = false;
  h.hangSosReads = false;
  h.focus = null;
  vi.clearAllMocks();
  await clearDriverProvisioning();
});

afterEach(() => {
  vi.useRealTimers();
  act(() => renderer?.unmount());
  renderer = null;
});

describe("stored SOS checks (read only)", () => {
  it("reports the signed-in driver's unsent SOS without changing it", async () => {
    await signIn(OWNER);
    storeSos();
    const before = h.store.get(SOS_KEY);

    expect(await hasUndeliveredSosOfSignedInDriver()).toBe(true);
    expect(h.store.get(SOS_KEY)).toBe(before);
  });

  it.each([
    ["saved without an owner", OWNERLESS],
    ["saved with a null owner", { ownerDriverId: null }],
    ["older than 30 minutes", STALE],
    ["refused by the server", REFUSED],
  ])("reports an unsent SOS %s", async (_label, overrides) => {
    await signIn(OWNER);
    storeSos(overrides);

    expect(await getSignedInDriverSosState()).toBe("undelivered");
    expect(await hasUndeliveredSosOfSignedInDriver()).toBe(true);
  });

  it.each([
    ["delivered", DELIVERED],
    ["marked 誤觸 or 不用了", DISMISSED],
    ["raised by another driver", { ownerDriverId: "drv-someone-else" }],
  ])("ignores an SOS that was %s", async (_label, overrides) => {
    await signIn(OWNER);
    storeSos(overrides);

    expect(await hasUndeliveredSosOfSignedInDriver()).toBe(false);
    expect(h.store.has(SOS_KEY)).toBe(true);
  });

  it("reports nothing when there is no SOS, one it cannot read, or no one signed in", async () => {
    await signIn(OWNER);
    expect(await hasUndeliveredSosOfSignedInDriver()).toBe(false);

    h.store.set(SOS_KEY, "{not json");
    expect(await hasUndeliveredSosOfSignedInDriver()).toBe(false);
    expect(h.store.get(SOS_KEY)).toBe("{not json");

    storeSos();
    h.failSosReads = true;
    await expect(getSignedInDriverSosState()).resolves.toBe("unknown");
    await expect(hasUndeliveredSosOfSignedInDriver()).resolves.toBe(false);
    h.failSosReads = false;

    await clearDriverProvisioning();
    storeSos();
    expect(await hasUndeliveredSosOfSignedInDriver()).toBe(false);
  });

  it("reports an SOS kept through an automatic sign-out on the sign-in screen", async () => {
    await loseSessionWithSos();

    expect(hasUndeliveredSosKeptThroughSignOut()).toBe(true);
    expect(await hasUndeliveredSosAfterSessionLost()).toBe(true);
  });

  it("flags the kept SOS on the device, so the warning survives an app restart", async () => {
    // The session ends while home is open: the SOS screen is not there to
    // flag the case itself.
    await loseSessionWithSos();
    expect(storedSos().sessionLostAt).toEqual(expect.any(String));
    expect(storedSos().clientEventId).toBe("client-event-1");

    // A restart: fresh modules, nothing in memory, the same device storage.
    vi.resetModules();
    const restarted = await import("../../lib/api-client");
    const restartedOutbox = await import("../../lib/driver-sos-outbox");
    expect(restartedOutbox.hasUndeliveredSosKeptThroughSignOut()).toBe(false);
    expect(restarted.isDriverIdentityProvisioned()).toBe(false);
    expect(await restarted.hasUndeliveredSosAfterSessionLost()).toBe(true);
  });

  it("flags only an unsent, unflagged SOS and never throws", async () => {
    storeSos({ sessionLostAt: "2026-11-26T01:00:00.000Z" });
    await markStoredDriverSosSessionLost("2026-11-26T02:00:00.000Z");
    expect(storedSos().sessionLostAt).toBe("2026-11-26T01:00:00.000Z");

    for (const overrides of [DELIVERED, DISMISSED]) {
      storeSos(overrides);
      const before = h.store.get(SOS_KEY);
      await markStoredDriverSosSessionLost();
      expect(h.store.get(SOS_KEY)).toBe(before);
    }

    h.store.delete(SOS_KEY);
    await markStoredDriverSosSessionLost();
    expect(h.store.has(SOS_KEY)).toBe(false);

    storeSos();
    h.failSosReads = true;
    await expect(markStoredDriverSosSessionLost()).resolves.toBeUndefined();
  });

  it("does not overwrite an SOS that was delivered while it was being flagged", async () => {
    storeSos();
    vi.mocked(SecureStore.getItemAsync).mockImplementationOnce(async () => {
      const raw = h.store.get(SOS_KEY) ?? null;
      storeSos(DELIVERED); // the send lands between the two reads
      return raw;
    });

    await markStoredDriverSosSessionLost();

    expect(storedSos().receipt).toEqual(DELIVERED.receipt);
    expect(storedSos().sessionLostAt).toBeUndefined();
  });

  it("also trusts the flag the SOS screen stored, after the app restarted", async () => {
    // An explicit logout resets the in-memory note; the stored flag remains.
    storeSos({ sessionLostAt: new Date().toISOString() });
    expect(hasUndeliveredSosKeptThroughSignOut()).toBe(false);

    expect(await hasUndeliveredSosAfterSessionLost()).toBe(true);
  });

  it.each([
    ["delivered", { ...DELIVERED, sessionLostAt: "2026-11-26T01:00:00.000Z" }],
    ["dismissed", { ...DISMISSED, sessionLostAt: "2026-11-26T01:00:00.000Z" }],
    ["not flagged as a lost session", {}],
  ])(
    "does not report a %s SOS on the sign-in screen",
    async (_label, overrides) => {
      storeSos(overrides);
      expect(await hasUndeliveredSosAfterSessionLost()).toBe(false);
    },
  );

  it("does not report a session-lost SOS while someone is signed in, or when there is none", async () => {
    expect(await hasUndeliveredSosAfterSessionLost()).toBe(false);

    await signIn(OWNER);
    storeSos({ sessionLostAt: new Date().toISOString() });
    expect(await hasUndeliveredSosAfterSessionLost()).toBe(false);
  });

  it("never throws on a storage error on the sign-in screen", async () => {
    storeSos({ sessionLostAt: new Date().toISOString() });
    h.failSosReads = true;

    // Nothing noted by a sign-out in this run: nothing to warn about.
    await expect(hasUndeliveredSosAfterSessionLost()).resolves.toBe(false);
  });

  it("errs toward warning when the sign-out could not read the stored SOS", async () => {
    await signIn(OWNER);
    storeSos();
    h.failSosReads = true;

    expect(await recoverDriverSessionFromApiError(AUTH_ERROR)).toBe(true);

    // Kept, because it could not tell, and noted as kept.
    expect(h.store.has(SOS_KEY)).toBe(true);
    expect(hasUndeliveredSosKeptThroughSignOut()).toBe(true);
    await expect(hasUndeliveredSosAfterSessionLost()).resolves.toBe(true);
  });
});

describe("settings: 登出並撤銷裝置", () => {
  function logoutButton() {
    return renderer.root.find(
      (node: any) =>
        node.props.accessibilityLabel === "登出並撤銷裝置" &&
        typeof node.props.onPress === "function",
    );
  }

  async function pressLogout() {
    await mount(React.createElement(SettingsScreen));
    await act(async () => {
      await logoutButton().props.onPress();
    });
    expect(h.alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = h.alert.mock.calls[0];
    return { title, message: String(message), buttons };
  }

  it("warns before logging out when this driver's SOS has not been sent", async () => {
    await signIn(OWNER);
    storeSos();

    const { title, message, buttons } = await pressLogout();

    expect(title).toBe("SOS 尚未送達");
    expect(message).toContain("還有一筆 SOS 沒有送到派車台");
    expect(message).toContain("登出後這筆 SOS 會被刪除");
    expect(message).toContain("有立即危險請撥 110 或 119");
    // Logging out still works and still deletes it.
    const logout = buttons.find((b: any) => b.text === "登出");
    await act(async () => {
      await logout.onPress();
    });
    expect(h.replace).toHaveBeenCalledWith("/onboarding");
    expect(h.store.has(SOS_KEY)).toBe(false);
  });

  it("also warns for an SOS saved without an owner", async () => {
    await signIn(OWNER);
    storeSos(OWNERLESS);

    const { title, message } = await pressLogout();

    expect(title).toBe("SOS 尚未送達");
    expect(message).toContain("還有一筆 SOS 沒有送到派車台");
  });

  it.each([
    ["delivered", DELIVERED],
    ["dismissed", DISMISSED],
    ["another driver's", { ownerDriverId: "drv-someone-else" }],
  ])("keeps the plain confirmation for a %s SOS", async (_label, overrides) => {
    await signIn(OWNER);
    storeSos(overrides);

    const { title, message } = await pressLogout();

    expect(title).toBe("登出裝置");
    expect(message).not.toContain("SOS");
  });

  it("keeps the plain confirmation when there is no SOS", async () => {
    await signIn(OWNER);

    const { title, message } = await pressLogout();

    expect(title).toBe("登出裝置");
    expect(message).not.toContain("SOS");
  });

  it("warns conservatively when the stored SOS cannot be read", async () => {
    await signIn(OWNER);
    storeSos();
    h.failSosReads = true;

    const { title, message } = await pressLogout();

    expect(title).toBe("登出裝置");
    expect(message).toContain("無法確認是否還有 SOS 沒有送到派車台");
    expect(message).toContain("有立即危險請撥 110 或 119");
  });

  it("waits at most 1.5 s for the stored SOS, then warns conservatively", async () => {
    await signIn(OWNER);
    storeSos();
    await mount(React.createElement(SettingsScreen));
    h.hangSosReads = true;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    let pressed!: Promise<void>;
    await act(async () => {
      pressed = logoutButton().props.onPress();
    });
    expect(h.alert).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
      await pressed;
    });

    expect(h.alert).toHaveBeenCalledTimes(1);
    expect(String(h.alert.mock.calls[0][1])).toContain(
      "無法確認是否還有 SOS 沒有送到派車台",
    );
  });
});

describe("sign-in screen", () => {
  it("shows a danger notice when the session ended before the SOS was sent", async () => {
    await loseSessionWithSos();

    await mount(React.createElement(OnboardingScreen));

    expect(screenText()).toContain(
      "SOS 尚未送達。請直接打電話聯絡派車台；有立即危險請撥 110 或 119。重新登入後，打開 SOS 頁面可以再送出。",
    );
    // No promise that it is sent by itself.
    expect(screenText()).not.toContain("就會再送出");
  });

  it.each([
    ["older than 30 minutes", STALE],
    ["refused by the server", REFUSED],
  ])(
    "keeps the notice true for an SOS %s, which is not resent by itself",
    async (_label, overrides) => {
      await loseSessionWithSos(overrides);

      await mount(React.createElement(OnboardingScreen));

      const shown = screenText();
      expect(shown).toContain("SOS 尚未送達。請直接打電話聯絡派車台");
      expect(shown).toContain("打開 SOS 頁面可以再送出");
      expect(shown).not.toContain("就會再送出");
    },
  );

  it("shows the notice after an app restart from the flag stored at sign-out", async () => {
    await loseSessionWithSos();
    // What a restart leaves: the stored case, nothing in memory.
    const kept = h.store.get(SOS_KEY)!;
    await clearDriverProvisioning(); // resets the in-memory note …
    h.store.set(SOS_KEY, kept); // … and restores the device's stored case
    expect(hasUndeliveredSosKeptThroughSignOut()).toBe(false);

    await mount(React.createElement(OnboardingScreen));

    expect(screenText()).toContain("SOS 尚未送達");
  });

  it("errs toward the notice when the stored SOS cannot be read after an automatic sign-out", async () => {
    await loseSessionWithSos();
    h.failSosReads = true;

    await mount(React.createElement(OnboardingScreen));

    expect(screenText()).toContain("SOS 尚未送達");
  });

  it.each([
    ["delivered", DELIVERED],
    ["dismissed", DISMISSED],
  ])("shows no notice for a %s SOS", async (_label, overrides) => {
    storeSos({ ...overrides, sessionLostAt: new Date().toISOString() });

    await mount(React.createElement(OnboardingScreen));

    expect(screenText()).toContain("註冊此裝置");
    expect(screenText()).not.toContain("SOS 尚未送達");
  });

  it("shows no notice without an SOS or for one not flagged as a lost session", async () => {
    await mount(React.createElement(OnboardingScreen));
    expect(screenText()).not.toContain("SOS 尚未送達");

    act(() => renderer.unmount());
    storeSos();
    await mount(React.createElement(OnboardingScreen));
    expect(screenText()).not.toContain("SOS 尚未送達");
  });
});

describe("home", () => {
  function sosCard() {
    return renderer.root
      .findAllByType("Banner" as never)
      .find((node: any) => node.props.title === "SOS 尚未送達");
  }

  it("puts a red SOS card first with a button to the SOS screen", async () => {
    await signIn(OWNER);
    storeSos();

    await mount(React.createElement(WorkspaceIndex));

    const card = sosCard();
    expect(card).toBeTruthy();
    expect(card.props.tone).toBe("danger");
    const shell = renderer.root.findByType("Shell" as never);
    expect(shell.props.children[0]).toBeTruthy();
    expect(shell.props.children[0].props.onOpen).toBeTypeOf("function");
    const open = card
      .findAllByType("Btn" as never)
      .find((node: any) => node.props.children === "打開 SOS");
    await act(async () => open.props.onPress());
    expect(h.push).toHaveBeenCalledWith("/sos");
    // Calling comes first; no promise that the SOS is sent by itself.
    expect(collectText(card.children)).toContain(
      "請直接打電話聯絡派車台；有立即危險請撥 110 或 119。打開 SOS 頁面可以再送出。",
    );
  });

  it.each([
    ["saved without an owner", OWNERLESS],
    ["older than 30 minutes", STALE],
  ])("shows the SOS card for an unsent SOS %s", async (_label, overrides) => {
    await signIn(OWNER);
    storeSos(overrides);

    await mount(React.createElement(WorkspaceIndex));

    expect(sosCard()).toBeTruthy();
  });

  it("clears the SOS card as soon as home comes back into view after delivery", async () => {
    await signIn(OWNER);
    storeSos();
    await mount(React.createElement(WorkspaceIndex));
    expect(sosCard()).toBeTruthy();

    storeSos(DELIVERED); // sent from the SOS tab
    await act(async () => {
      h.focus?.();
      for (let i = 0; i < 30; i += 1) await Promise.resolve();
    });

    expect(sosCard()).toBeUndefined();
  });

  it("also clears the SOS card on the next 15 s refresh", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    await signIn(OWNER);
    storeSos();
    await mount(React.createElement(WorkspaceIndex));
    expect(sosCard()).toBeTruthy();

    storeSos(DELIVERED);
    await act(async () => {
      vi.advanceTimersByTime(14_000);
      for (let i = 0; i < 30; i += 1) await Promise.resolve();
    });
    expect(sosCard()).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(1_000);
      for (let i = 0; i < 30; i += 1) await Promise.resolve();
    });

    expect(sosCard()).toBeUndefined();
  });

  it.each([
    ["delivered", DELIVERED],
    ["dismissed", DISMISSED],
    ["another driver's", { ownerDriverId: "drv-someone-else" }],
  ])("shows no SOS card for a %s SOS", async (_label, overrides) => {
    await signIn(OWNER);
    storeSos(overrides);

    await mount(React.createElement(WorkspaceIndex));

    expect(screenText()).toContain("工作台");
    expect(sosCard()).toBeUndefined();
  });

  it("shows no SOS card when there is none or it cannot be read", async () => {
    await signIn(OWNER);
    await mount(React.createElement(WorkspaceIndex));
    expect(screenText()).toContain("工作台");
    expect(sosCard()).toBeUndefined();

    act(() => renderer.unmount());
    storeSos();
    h.failSosReads = true;
    await mount(React.createElement(WorkspaceIndex));
    expect(sosCard()).toBeUndefined();
  });
});

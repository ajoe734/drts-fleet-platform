import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DriverOnlineGateSnapshot } from "@/lib/driver-online-gate";

const {
  getForegroundPermissionsAsync,
  getBackgroundPermissionsAsync,
  isDriverIdentityProvisioned,
  getDriverIdentityIssue,
  openSettings,
} = vi.hoisted(() => ({
  getForegroundPermissionsAsync: vi.fn(),
  getBackgroundPermissionsAsync: vi.fn(),
  isDriverIdentityProvisioned: vi.fn(),
  getDriverIdentityIssue: vi.fn(),
  openSettings: vi.fn(),
}));

vi.mock("expo-location", () => ({
  getForegroundPermissionsAsync,
  getBackgroundPermissionsAsync,
}));

vi.mock("react-native", () => ({
  Linking: {
    openSettings,
  },
}));

vi.mock("@/lib/api-client", () => ({
  isDriverIdentityProvisioned,
  getDriverIdentityIssue,
}));

async function loadGate() {
  return import("@/lib/driver-online-gate");
}

function snapshot(
  overrides: Partial<DriverOnlineGateSnapshot> = {},
): DriverOnlineGateSnapshot {
  return {
    deviceBound: true,
    identityIssueMessage: null,
    foregroundGranted: true,
    backgroundGranted: true,
    ...overrides,
  };
}

let evaluateDriverOnlineGate: Awaited<
  ReturnType<typeof loadGate>
>["evaluateDriverOnlineGate"];

beforeEach(async () => {
  vi.clearAllMocks();
  getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  getBackgroundPermissionsAsync.mockResolvedValue({ granted: true });
  isDriverIdentityProvisioned.mockReturnValue(true);
  getDriverIdentityIssue.mockReturnValue(null);
  ({ evaluateDriverOnlineGate } = await loadGate());
});

describe("evaluateDriverOnlineGate", () => {
  it("allows going online when every pre-condition is satisfied", () => {
    const result = evaluateDriverOnlineGate(snapshot());

    expect(result.canGoOnline).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.blockingReason).toBeNull();
    expect(result.checks.map((check) => check.key)).toEqual([
      "device",
      "identity",
      "foregroundLocation",
      "backgroundLocation",
    ]);
    expect(result.checks.every((check) => check.satisfied)).toBe(true);
  });

  it("blocks with LOCATION_PERMISSION_DENIED when foreground is denied", () => {
    const result = evaluateDriverOnlineGate(
      snapshot({ foregroundGranted: false, backgroundGranted: false }),
    );

    expect(result.canGoOnline).toBe(false);
    // Background is not double-flagged while foreground is still missing.
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      "LOCATION_PERMISSION_DENIED",
    ]);
    expect(result.blockingReason?.code).toBe("LOCATION_PERMISSION_DENIED");
    expect(result.blockingReason?.resolution).toBe("settings");
    expect(result.blockingReason?.check).toBe("foregroundLocation");
  });

  it("blocks online_available with BACKGROUND_LOCATION_REQUIRED per SA §6.3", () => {
    const result = evaluateDriverOnlineGate(
      snapshot({ foregroundGranted: true, backgroundGranted: false }),
    );

    expect(result.canGoOnline).toBe(false);
    expect(result.blockingReason?.code).toBe("BACKGROUND_LOCATION_REQUIRED");
    expect(result.blockingReason?.resolution).toBe("settings");
    expect(
      result.checks.find((check) => check.key === "backgroundLocation")
        ?.satisfied,
    ).toBe(false);
    expect(
      result.checks.find((check) => check.key === "foregroundLocation")
        ?.satisfied,
    ).toBe(true);
  });

  it("blocks with DEVICE_NOT_BOUND when the device is unbound and identity is clean", () => {
    const result = evaluateDriverOnlineGate(
      snapshot({ deviceBound: false, identityIssueMessage: null }),
    );

    expect(result.canGoOnline).toBe(false);
    expect(result.blockingReason?.code).toBe("DEVICE_NOT_BOUND");
    expect(result.blockingReason?.resolution).toBe("onboarding");
  });

  it("prefers IDENTITY_INVALID over DEVICE_NOT_BOUND and carries the issue message", () => {
    const result = evaluateDriverOnlineGate(
      snapshot({
        deviceBound: false,
        identityIssueMessage: "此司機帳號已被停權，暫時無法刷新裝置登入。",
      }),
    );

    expect(result.blockingReason?.code).toBe("IDENTITY_INVALID");
    expect(result.blockingReason?.description).toBe(
      "此司機帳號已被停權，暫時無法刷新裝置登入。",
    );
    expect(result.reasons.map((reason) => reason.code)).not.toContain(
      "DEVICE_NOT_BOUND",
    );
  });

  it("reports identity ahead of location when both are unmet", () => {
    const result = evaluateDriverOnlineGate(
      snapshot({
        deviceBound: false,
        identityIssueMessage: "司機證件狀態無效，請聯絡平台管理員重新啟用。",
        foregroundGranted: false,
        backgroundGranted: false,
      }),
    );

    expect(result.reasons.map((reason) => reason.code)).toEqual([
      "IDENTITY_INVALID",
      "LOCATION_PERMISSION_DENIED",
    ]);
    expect(result.blockingReason?.code).toBe("IDENTITY_INVALID");
  });
});

describe("readDriverOnlineGateSnapshot / evaluateDriverOnlineGateNow", () => {
  it("captures the live permission + identity snapshot", async () => {
    getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    getBackgroundPermissionsAsync.mockResolvedValue({ granted: false });
    isDriverIdentityProvisioned.mockReturnValue(true);
    getDriverIdentityIssue.mockReturnValue(null);

    const { readDriverOnlineGateSnapshot } = await import(
      "@/lib/driver-online-gate"
    );
    const captured = await readDriverOnlineGateSnapshot();

    expect(captured).toEqual({
      deviceBound: true,
      identityIssueMessage: null,
      foregroundGranted: true,
      backgroundGranted: false,
    });
  });

  it("treats a thrown permission lookup as not granted", async () => {
    getForegroundPermissionsAsync.mockRejectedValue(new Error("no module"));
    getBackgroundPermissionsAsync.mockRejectedValue(new Error("no module"));

    const { readDriverOnlineGateSnapshot } = await import(
      "@/lib/driver-online-gate"
    );
    const captured = await readDriverOnlineGateSnapshot();

    expect(captured.foregroundGranted).toBe(false);
    expect(captured.backgroundGranted).toBe(false);
  });

  it("evaluates the gate against the live state end-to-end", async () => {
    getBackgroundPermissionsAsync.mockResolvedValue({ granted: false });

    const { evaluateDriverOnlineGateNow } = await import(
      "@/lib/driver-online-gate"
    );
    const result = await evaluateDriverOnlineGateNow();

    expect(result.canGoOnline).toBe(false);
    expect(result.blockingReason?.code).toBe("BACKGROUND_LOCATION_REQUIRED");
  });
});

describe("openDriverPermissionSettings", () => {
  it("deep-links into the OS settings", async () => {
    openSettings.mockResolvedValue(undefined);

    const { openDriverPermissionSettings } = await import(
      "@/lib/driver-online-gate"
    );
    await openDriverPermissionSettings();

    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});

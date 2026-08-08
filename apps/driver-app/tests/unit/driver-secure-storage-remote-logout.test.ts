import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock expo-constants & expo-secure-store before importing api-client
const secureStoreMap = new Map<string, string>();

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => secureStoreMap.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStoreMap.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStoreMap.delete(key);
  }),
}));

import {
  clearDriverProvisioning,
  getDriverClient,
  getDriverIdentityAuthState,
  getDriverIdentityIssue,
  initializeDriverIdentity,
  isDriverIdentityHydrated,
  isDriverIdentityProvisioned,
  recoverDriverSessionFromApiError,
} from "../../lib/api-client";
import { DRIVER_MOBILE_AUTH_STATES } from "@drts/contracts";

describe("Driver Secure Storage & Remote Logout UX (IAM-DRV-002)", () => {
  beforeEach(async () => {
    secureStoreMap.clear();
    await clearDriverProvisioning();
  });

  it("exports and recognizes all declared mobile auth states", () => {
    expect(DRIVER_MOBILE_AUTH_STATES).toEqual([
      "not_provisioned",
      "register",
      "expired",
      "revoked",
      "suspended",
      "reuse",
      "rebind",
    ]);
  });

  it("resolves to not_provisioned when no device binding or session issue exists", () => {
    const authState = getDriverIdentityAuthState();
    expect(authState).toBe("not_provisioned");
    expect(isDriverIdentityProvisioned()).toBe(false);
  });

  it("resolves to register auth state deterministically when registration form submission is active", () => {
    const authState = getDriverIdentityAuthState(undefined, true);
    expect(authState).toBe("register");
  });

  it("handles remote revoke error and maps to deterministic revoked auth state", async () => {
    const error = new Error(
      'API error 401: {"error":{"code":"DRIVER_AUTH_REVOKED","message":"此司機帳號已退役或撤銷，請聯絡平台管理員。"}}',
    );

    const recovered = await recoverDriverSessionFromApiError(error);

    expect(recovered).toBe(true);
    expect(getDriverIdentityIssue()).toBe(
      "此司機帳號已退役或撤銷，請聯絡平台管理員。",
    );
    expect(getDriverIdentityAuthState(error)).toBe("revoked");
    expect(getDriverIdentityAuthState()).toBe("revoked");
  });

  it("handles DRIVER_DEVICE_SESSION_INVALID and DRIVER_DEVICE_REFRESH_INVALID errors and maps to revoked auth state", async () => {
    const sessionInvalidError = new Error(
      'API error 401: {"error":{"code":"DRIVER_DEVICE_SESSION_INVALID","message":"此裝置的司機綁定已失效或被撤銷，請重新輸入註冊碼綁定。"}}',
    );

    const recoveredSession = await recoverDriverSessionFromApiError(sessionInvalidError);
    expect(recoveredSession).toBe(true);
    expect(getDriverIdentityAuthState(sessionInvalidError)).toBe("revoked");
    expect(getDriverIdentityAuthState()).toBe("revoked");

    await clearDriverProvisioning();

    const refreshInvalidError = new Error(
      'API error 401: {"error":{"code":"DRIVER_DEVICE_REFRESH_INVALID","message":"此裝置的司機綁定已失效或被撤銷，請重新輸入註冊碼綁定。"}}',
    );

    const recoveredRefresh = await recoverDriverSessionFromApiError(refreshInvalidError);
    expect(recoveredRefresh).toBe(true);
    expect(getDriverIdentityAuthState(refreshInvalidError)).toBe("revoked");
    expect(getDriverIdentityAuthState()).toBe("revoked");
  });

  it("handles driver suspension error and maps to deterministic suspended auth state", async () => {
    const error = new Error(
      'API error 401: {"error":{"code":"DRIVER_AUTH_SUSPENDED","message":"此司機帳號已被停權，暫時無法刷新裝置登入。"}}',
    );

    const recovered = await recoverDriverSessionFromApiError(error);

    expect(recovered).toBe(true);
    expect(getDriverIdentityIssue()).toBe(
      "此司機帳號已被停權，暫時無法刷新裝置登入。",
    );
    expect(getDriverIdentityAuthState(error)).toBe("suspended");
    expect(getDriverIdentityAuthState()).toBe("suspended");
  });

  it("handles token reuse detection error and maps to deterministic reuse auth state", async () => {
    const error = new Error(
      'API error 401: {"error":{"code":"DRIVER_REFRESH_REUSE_DETECTED","message":"偵測到 Session 重複使用"}}',
    );

    const recovered = await recoverDriverSessionFromApiError(error);

    expect(recovered).toBe(true);
    expect(getDriverIdentityIssue()).toBe(
      "偵測到安全性例外（Session 重複使用），金鑰已自動清除，請重新登入綁定。",
    );
    expect(getDriverIdentityAuthState(error)).toBe("reuse");
    expect(getDriverIdentityAuthState()).toBe("reuse");
  });

  it("handles device rebound error and maps to deterministic rebind auth state", async () => {
    const error = new Error(
      'API error 401: {"error":{"code":"DRIVER_DEVICE_REBOUND","message":"裝置已重新綁定"}}',
    );

    const recovered = await recoverDriverSessionFromApiError(error);

    expect(recovered).toBe(true);
    expect(getDriverIdentityIssue()).toBe(
      "此裝置已被重新綁定至其他帳號，請重新輸入註冊碼。",
    );
    expect(getDriverIdentityAuthState(error)).toBe("rebind");
    expect(getDriverIdentityAuthState()).toBe("rebind");
  });

  it("handles expired session error and maps to deterministic expired auth state", async () => {
    const error = new Error(
      'API error 401: {"error":{"code":"DRIVER_SESSION_EXPIRED","message":"Session expired"}}',
    );

    const recovered = await recoverDriverSessionFromApiError(error);

    expect(recovered).toBe(true);
    expect(getDriverIdentityIssue()).toBe(
      "裝置登入 Session 已過期，請重新登入。",
    );
    expect(getDriverIdentityAuthState(error)).toBe("expired");
    expect(getDriverIdentityAuthState()).toBe("expired");
  });

  it("preserves offline unsynchronized proof when session authentication recovery clears credentials", async () => {
    // Seed secure store with session key AND offline pending task completion key
    secureStoreMap.set(
      "drts.driver.session",
      JSON.stringify({
        accessToken: "stale-access-token",
        refreshToken: "stale-refresh-token",
        deviceId: "device-001",
        bindingId: "binding-001",
      }),
    );
    secureStoreMap.set(
      "drts.driver.pendingTaskCompletion",
      JSON.stringify({
        taskId: "task-offline-999",
        requestId: "req-proof-123",
        command: {
          completedAt: "2026-08-08T22:00:00Z",
          proof: {
            photos: [
              {
                uri: "file:///local/photo.jpg",
                base64: "aW1hZ2UtZGF0YQ==",
                width: 800,
                height: 600,
                estimatedBytes: 1024,
              },
            ],
            notes: "Delivered offline during signal drop",
          },
        },
        createdAt: "2026-08-08T22:00:00Z",
        updatedAt: "2026-08-08T22:00:00Z",
      }),
    );

    const remoteRevokeError = new Error(
      'API error 401: {"error":{"code":"DRIVER_AUTH_REVOKED"}}',
    );

    // Trigger recovery due to remote revocation
    await recoverDriverSessionFromApiError(remoteRevokeError);

    // Session key MUST be deleted from SecureStore
    expect(secureStoreMap.has("drts.driver.session")).toBe(false);

    // Crucial requirement: Pending offline completion proof MUST NOT be deleted!
    expect(secureStoreMap.has("drts.driver.pendingTaskCompletion")).toBe(true);
    const pendingRaw = secureStoreMap.get("drts.driver.pendingTaskCompletion");
    expect(pendingRaw).toContain("task-offline-999");
    expect(pendingRaw).toContain("Delivered offline during signal drop");
  });

  it("preserves offline unsynchronized proof on token reuse exception recovery", async () => {
    secureStoreMap.set("drts.driver.session", "stale-session");
    secureStoreMap.set("drts.driver.pendingTaskCompletion", "proof-data-reuse");

    const reuseError = new Error(
      'API error 401: {"error":{"code":"DRIVER_REFRESH_REUSE_DETECTED"}}',
    );

    await recoverDriverSessionFromApiError(reuseError);

    expect(secureStoreMap.has("drts.driver.session")).toBe(false);
    expect(secureStoreMap.get("drts.driver.pendingTaskCompletion")).toBe("proof-data-reuse");
  });

  it("preserves offline unsynchronized proof on device rebound recovery", async () => {
    secureStoreMap.set("drts.driver.session", "stale-session");
    secureStoreMap.set("drts.driver.pendingTaskCompletion", "proof-data-rebound");

    const reboundError = new Error(
      'API error 401: {"error":{"code":"DRIVER_DEVICE_REBOUND"}}',
    );

    await recoverDriverSessionFromApiError(reboundError);

    expect(secureStoreMap.has("drts.driver.session")).toBe(false);
    expect(secureStoreMap.get("drts.driver.pendingTaskCompletion")).toBe("proof-data-rebound");
  });

  it("automatically recovers session and clears SecureStore on general Bearer API requests receiving 401 DRIVER_AUTH_REVOKED", async () => {
    secureStoreMap.set(
      "drts.driver.session",
      JSON.stringify({
        accessToken: "active-access-token",
        refreshToken: "active-refresh-token",
        deviceId: "device-test-01",
        bindingId: "binding-test-01",
        driverId: "driver-test-01",
      }),
    );

    // Mock fetch for initializeDriverIdentity (refresh session) and listDriverTasks
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/refresh")) {
        return new Response(
          JSON.stringify({
            data: {
              accessToken: "new-access-token",
              refreshToken: "new-refresh-token",
              deviceId: "device-test-01",
              bindingId: "binding-test-01",
              driverId: "driver-test-01",
              issuedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
            },
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          error: {
            code: "DRIVER_AUTH_REVOKED",
            message: "此司機帳號已退役或撤銷，請聯絡平台管理員。",
            retryable: false,
            traceId: "trace-revoked-001",
          },
        }),
        { status: 401 },
      );
    }) as typeof fetch;

    try {
      await initializeDriverIdentity();
      expect(isDriverIdentityProvisioned()).toBe(true);

      const client = getDriverClient();
      await expect(client.listDriverTasks()).rejects.toThrow("DRIVER_AUTH_REVOKED");

      // Verify that credentials in SecureStore have been completely erased
      expect(secureStoreMap.has("drts.driver.session")).toBe(false);
      expect(isDriverIdentityProvisioned()).toBe(false);
      expect(getDriverIdentityAuthState()).toBe("revoked");
      expect(getDriverIdentityIssue()).toBe("此司機帳號已退役或撤銷，請聯絡平台管理員。");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("automatically recovers session and clears SecureStore on general Bearer API requests receiving 401 DRIVER_REFRESH_REUSE_DETECTED", async () => {
    secureStoreMap.set(
      "drts.driver.session",
      JSON.stringify({
        accessToken: "active-access-token",
        refreshToken: "active-refresh-token",
        deviceId: "device-test-02",
        bindingId: "binding-test-02",
        driverId: "driver-test-02",
      }),
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/refresh")) {
        return new Response(
          JSON.stringify({
            data: {
              accessToken: "new-access-token",
              refreshToken: "new-refresh-token",
              deviceId: "device-test-02",
              bindingId: "binding-test-02",
              driverId: "driver-test-02",
              issuedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
            },
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          error: {
            code: "DRIVER_REFRESH_REUSE_DETECTED",
            message: "偵測到 Session 重複使用",
            retryable: false,
            traceId: "trace-reuse-001",
          },
        }),
        { status: 401 },
      );
    }) as typeof fetch;

    try {
      await initializeDriverIdentity();
      expect(isDriverIdentityProvisioned()).toBe(true);

      const client = getDriverClient();
      await expect(client.getDriverProfile()).rejects.toThrow(
        "DRIVER_REFRESH_REUSE_DETECTED",
      );

      expect(secureStoreMap.has("drts.driver.session")).toBe(false);
      expect(isDriverIdentityProvisioned()).toBe(false);
      expect(getDriverIdentityAuthState()).toBe("reuse");
      expect(getDriverIdentityIssue()).toBe(
        "偵測到安全性例外（Session 重複使用），金鑰已自動清除，請重新登入綁定。",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

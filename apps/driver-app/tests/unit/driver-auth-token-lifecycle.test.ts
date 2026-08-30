import { beforeEach, describe, expect, it, vi } from "vitest";
import * as SecureStore from "expo-secure-store";
import type { DriverDeviceProvisioningSession } from "@drts/contracts";

import {
  clearDriverProvisioning,
  formatDriverError,
  getDriverAuthState,
  getDriverClient,
  getDriverIdentityIssue,
  getProvisionedSession,
  initializeDriverIdentity,
  isDriverIdentityHydrated,
  isDriverIdentityProvisioned,
  recoverDriverSessionFromApiError,
  refreshDriverSessionSingleFlight,
  registerDriverDevice,
  registerProtectedCacheClearHandler,
  sanitizeLogMessage,
} from "../../lib/api-client";

// In-memory store for expo-secure-store mock
const mockStore = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

function createSampleSession(overrides?: Partial<DriverDeviceProvisioningSession>): DriverDeviceProvisioningSession {
  return {
    accessToken: "expired-access-token-001",
    refreshToken: "valid-refresh-token-001",
    tokenType: "Bearer",
    expiresIn: "900",
    refreshExpiresIn: "2592000",
    driverId: "drv-test-101",
    deviceId: "dev-test-101",
    bindingId: "bnd-test-101",
    issuedAt: new Date().toISOString(),
    identity: {
      actorType: "driver_user",
      actorId: "drv-test-101",
      tenantId: "tnt-demo-001",
      realm: "driver",
      authMode: "jwt_bearer",
      roleFamilies: ["driver"],
      roles: ["driver"],
      scopes: ["driver:read", "driver:write"],
      supportedExecutionModes: ["supervisor_managed_execution"],
    },
    ...overrides,
  };
}

describe("DRV-AUTH-001: Driver Token Lifecycle Authority & Single-Flight Refresh", () => {
  beforeEach(async () => {
    mockStore.clear();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    await clearDriverProvisioning();
  });

  describe("Single Authority for SecureStore Session Storage & Lifecycle", () => {
    it("reads, writes, refreshes, and clears stored session through api-client authority only", async () => {
      expect(isDriverIdentityProvisioned()).toBe(false);
      expect(mockStore.has("drts.driver.session")).toBe(false);

      const session = createSampleSession({
        accessToken: "initial-token",
        refreshToken: "initial-refresh",
      });
      mockStore.set("drts.driver.session", JSON.stringify(session));

      await initializeDriverIdentity();
      expect(isDriverIdentityProvisioned()).toBe(true);
      expect(getProvisionedSession()?.accessToken).toBe("initial-token");
      expect(getDriverAuthState()).toBe("provisioned");

      await clearDriverProvisioning();
      expect(isDriverIdentityProvisioned()).toBe(false);
      expect(getProvisionedSession()).toBeNull();
      expect(mockStore.has("drts.driver.session")).toBe(false);
      expect(getDriverAuthState()).toBe("not_provisioned");
    });
  });

  describe("Single-Flight Refresh & Concurrency Control", () => {
    it("drives N concurrent requests against an expired token, asserts exactly 1 refresh call and all N succeed", async () => {
      const initialSession = createSampleSession({
        accessToken: "expired-token",
        refreshToken: "rt-initial-123",
      });
      mockStore.set("drts.driver.session", JSON.stringify(initialSession));
      await initializeDriverIdentity();

      let refreshCallCount = 0;
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const headers = (init?.headers ?? {}) as Record<string, string>;
        const authHeader = headers["Authorization"] || headers["authorization"];

        if (url.includes("/api/auth/driver/device/refresh")) {
          refreshCallCount++;
          // Simulate slight network latency
          await new Promise((resolve) => setTimeout(resolve, 30));
          return new Response(
            JSON.stringify({
              data: {
                accessToken: "new-valid-token-rotated",
                refreshToken: "new-rotated-refresh-token-456",
                tokenType: "Bearer",
                expiresIn: 900,
                refreshExpiresIn: 2592000,
                driverId: "drv-test-101",
                deviceId: "dev-test-101",
                bindingId: "bnd-test-101",
                issuedAt: new Date().toISOString(),
                identity: {
                  actorId: "drv-test-101",
                  tenantId: "tnt-demo-001",
                  realm: "driver",
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        // For regular API calls (e.g. /api/driver/tasks or /api/orders)
        if (authHeader === "Bearer expired-token") {
          return new Response(
            JSON.stringify({
              error: {
                code: "UNAUTHORIZED",
                message: "Access token has expired.",
              },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        if (authHeader === "Bearer new-valid-token-rotated") {
          return new Response(
            JSON.stringify({
              data: [
                {
                  taskId: "task-001",
                  driverId: "drv-test-101",
                  status: "on_trip",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response("Not Found", { status: 404 });
      });

      const client = getDriverClient();
      const N = 10;
      const concurrentCalls = Array.from({ length: N }, (_, i) =>
        client.listDriverTasks().then((tasks) => ({ index: i, tasks })),
      );

      const results = await Promise.all(concurrentCalls);

      // Assert exactly 1 refresh call was made across all N concurrent calls
      expect(refreshCallCount).toBe(1);
      expect(results).toHaveLength(N);
      for (const result of results) {
        expect(result.tasks).toEqual([
          {
            taskId: "task-001",
            driverId: "drv-test-101",
            status: "on_trip",
          },
        ]);
      }

      // Assert session has been updated with rotated tokens
      expect(getProvisionedSession()?.accessToken).toBe("new-valid-token-rotated");
      expect(getProvisionedSession()?.refreshToken).toBe("new-rotated-refresh-token-456");

      const rawStored = mockStore.get("drts.driver.session");
      expect(rawStored).toBeTruthy();
      const stored = JSON.parse(rawStored!);
      expect(stored.refreshToken).toBe("new-rotated-refresh-token-456");
      expect(stored.accessToken).toBe("new-valid-token-rotated");

      fetchSpy.mockRestore();
    });

    it("persists rotated refresh token before any waiter resumes so no waiter reuses a consumed token", async () => {
      const initialSession = createSampleSession({
        accessToken: "expired-token",
        refreshToken: "rt-consumed-001",
      });
      mockStore.set("drts.driver.session", JSON.stringify(initialSession));
      await initializeDriverIdentity();

      let persistenceVerifiedBeforeWaiterResumed = false;

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const headers = (init?.headers ?? {}) as Record<string, string>;
        const authHeader = headers["Authorization"] || headers["authorization"];

        if (url.includes("/api/auth/driver/device/refresh")) {
          return new Response(
            JSON.stringify({
              data: {
                ...initialSession,
                accessToken: "new-access-token-999",
                refreshToken: "new-refresh-token-999",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (authHeader === "Bearer expired-token") {
          return new Response(
            JSON.stringify({
              error: { code: "UNAUTHORIZED", message: "Token expired." },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        if (authHeader === "Bearer new-access-token-999") {
          // When the waiter resumes and retries, check if the rotated refresh token is ALREADY in SecureStore
          const storedJson = mockStore.get("drts.driver.session");
          if (storedJson) {
            const parsed = JSON.parse(storedJson);
            if (parsed.refreshToken === "new-refresh-token-999") {
              persistenceVerifiedBeforeWaiterResumed = true;
            }
          }
          return new Response(
            JSON.stringify({ data: { success: true } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response("Not Found", { status: 404 });
      });

      const client = getDriverClient();
      const res = await client.get<{ success: boolean }>("/api/test");

      expect(res).toEqual({ success: true });
      expect(persistenceVerifiedBeforeWaiterResumed).toBe(true);

      fetchSpy.mockRestore();
    });
  });

  describe("Global 401/403 Outcome Policy", () => {
    it("retries 401 once after refresh; a second 401 clears the session and logs out", async () => {
      const initialSession = createSampleSession({
        accessToken: "expired-token",
        refreshToken: "valid-rt",
      });
      mockStore.set("drts.driver.session", JSON.stringify(initialSession));
      await initializeDriverIdentity();

      let refreshCount = 0;
      let regularCallCount = 0;

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/driver/device/refresh")) {
          refreshCount++;
          return new Response(
            JSON.stringify({
              data: {
                ...initialSession,
                accessToken: "token-that-is-still-rejected-by-server",
                refreshToken: "rt-new",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        // Regular endpoint always returns 401 even after refresh
        regularCallCount++;
        return new Response(
          JSON.stringify({
            error: { code: "UNAUTHORIZED", message: "Invalid credentials." },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      });

      const client = getDriverClient();
      await expect(client.get("/api/protected-resource")).rejects.toThrow("API error 401");

      // Assert 1 initial call + 1 refresh + 1 retry call = 2 regular calls, 1 refresh call
      expect(regularCallCount).toBe(2);
      expect(refreshCount).toBe(1);

      // Assert session was completely wiped on second 401 failure
      expect(isDriverIdentityProvisioned()).toBe(false);
      expect(getProvisionedSession()).toBeNull();
      expect(mockStore.has("drts.driver.session")).toBe(false);
      expect(getDriverIdentityIssue()).toBeTruthy();
      expect(getDriverAuthState()).toBe("session_expired");

      fetchSpy.mockRestore();
    });

    it("403 neither triggers refresh nor logs out and surfaces a permission message", async () => {
      const initialSession = createSampleSession({
        accessToken: "valid-token-no-permission",
        refreshToken: "valid-rt",
      });
      mockStore.set("drts.driver.session", JSON.stringify(initialSession));
      await initializeDriverIdentity();

      let refreshCount = 0;
      let requestCount = 0;

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/driver/device/refresh")) {
          refreshCount++;
          return new Response(JSON.stringify({ data: initialSession }), { status: 200 });
        }

        requestCount++;
        return new Response(
          JSON.stringify({
            error: {
              code: "DRIVER_AUTH_SUSPENDED",
              message: "Driver is suspended by admin.",
            },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      });

      const client = getDriverClient();
      let caughtError: unknown;
      try {
        await client.get("/api/driver/orders");
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeTruthy();
      // Assert NO refresh was attempted
      expect(refreshCount).toBe(0);
      // Assert request was executed once without retry loop
      expect(requestCount).toBe(1);

      // Assert session is NOT cleared and driver is NOT logged out
      expect(isDriverIdentityProvisioned()).toBe(true);
      expect(getProvisionedSession()?.accessToken).toBe("valid-token-no-permission");
      expect(mockStore.has("drts.driver.session")).toBe(true);
      expect(getDriverAuthState()).toBe("provisioned");

      // Assert formatDriverError surfaces the suspended permission message
      const formatted = formatDriverError(caughtError);
      expect(formatted).toBe("此司機帳號已被停權，暫時無法登入系統。");

      fetchSpy.mockRestore();
    });
  });

  describe("Refresh Failure Handling & Protected Cache Clearing", () => {
    it("clears stored session, in-memory session, and protected cached data in one path on refresh failure", async () => {
      const initialSession = createSampleSession({
        accessToken: "expired-token",
        refreshToken: "revoked-refresh-token",
      });
      mockStore.set("drts.driver.session", JSON.stringify(initialSession));
      await initializeDriverIdentity();

      const cacheClearSpy = vi.fn();
      const unregister = registerProtectedCacheClearHandler(cacheClearSpy);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/driver/device/refresh")) {
          return new Response(
            JSON.stringify({
              error: {
                code: "DRIVER_DEVICE_REFRESH_INVALID",
                message: "Refresh token revoked or invalid.",
              },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({
            error: { code: "UNAUTHORIZED", message: "Token expired." },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      });

      const client = getDriverClient();
      await expect(client.listDriverTasks()).rejects.toThrow();

      // Assert all three targets (stored session, in-memory session, protected cache) cleared in one path
      expect(isDriverIdentityProvisioned()).toBe(false);
      expect(getProvisionedSession()).toBeNull();
      expect(mockStore.has("drts.driver.session")).toBe(false);
      expect(cacheClearSpy).toHaveBeenCalledTimes(1);
      expect(getDriverAuthState()).toBe("session_expired");
      expect(getDriverIdentityIssue()).toContain("失效或被撤銷");

      unregister();
      fetchSpy.mockRestore();
    });
  });

  describe("Offline & App Restart Identity Restoration", () => {
    it("app restart with a valid stored session restores identity without a network round trip", async () => {
      const storedSession = createSampleSession({
        accessToken: "cached-valid-token",
        refreshToken: "cached-refresh-token",
      });
      mockStore.set("drts.driver.session", JSON.stringify(storedSession));

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      // App initializes identity on startup
      await initializeDriverIdentity();

      // Assert NO network calls were made to render / hydrate
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(isDriverIdentityHydrated()).toBe(true);
      expect(isDriverIdentityProvisioned()).toBe(true);
      expect(getProvisionedSession()?.accessToken).toBe("cached-valid-token");
      expect(getDriverAuthState()).toBe("provisioned");

      fetchSpy.mockRestore();
    });
  });

  describe("Backgrounding, Foregrounding, and Network Loss/Regain", () => {
    it("retains authenticated state during backgrounding and network loss without half-authenticated state", async () => {
      const session = createSampleSession({
        accessToken: "test-token",
        refreshToken: "test-refresh",
      });
      mockStore.set("drts.driver.session", JSON.stringify(session));
      await initializeDriverIdentity();

      // Simulate backgrounding: session remains intact
      expect(isDriverIdentityProvisioned()).toBe(true);
      expect(getDriverAuthState()).toBe("provisioned");

      // Simulate network loss: fetch fails with network error
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Network request failed"));

      const client = getDriverClient();
      await expect(client.listDriverTasks()).rejects.toThrow("Network request failed");

      // Assert network error does NOT clear session or leave half-authenticated state
      expect(isDriverIdentityProvisioned()).toBe(true);
      expect(getProvisionedSession()?.accessToken).toBe("test-token");
      expect(getDriverAuthState()).toBe("provisioned");
      expect(getDriverIdentityIssue()).toBeNull();
      expect(mockStore.has("drts.driver.session")).toBe(true);

      // Simulate network regain: next request succeeds
      fetchSpy.mockImplementation(async () => {
        return new Response(
          JSON.stringify({ data: [{ taskId: "task-1", status: "on_trip" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const tasks = await client.listDriverTasks();
      expect(tasks).toHaveLength(1);
      expect(isDriverIdentityProvisioned()).toBe(true);
      expect(getDriverAuthState()).toBe("provisioned");

      fetchSpy.mockRestore();
    });
  });

  describe("Secret Leakage Guard", () => {
    it("redacts tokens, refresh tokens, and device secrets across every error and logging path", () => {
      const rawSecret = "eyJhbGciOiJIUzI1NiJ9.driver_secret_payload.sig";
      const errorMsg = `API error 401: {"error":{"code":"UNAUTHORIZED","message":"Token ${rawSecret} and refreshToken=rt_secret_12345 is expired"}}`;

      const sanitized = sanitizeLogMessage(errorMsg);
      expect(sanitized).not.toContain("driver_secret_payload");
      expect(sanitized).not.toContain("rt_secret_12345");
      expect(sanitized).toContain("[REDACTED_JWT]");
      expect(sanitized).toContain("refreshToken=[REDACTED]");

      const formatted = formatDriverError(new Error(errorMsg));
      expect(formatted).not.toContain("driver_secret_payload");
      expect(formatted).not.toContain("rt_secret_12345");
    });
  });
});

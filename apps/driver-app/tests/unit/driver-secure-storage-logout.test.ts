import { beforeEach, describe, expect, it, vi } from "vitest";
import * as SecureStore from "expo-secure-store";

import {
  DRIVER_IDENTITY_NOT_PROVISIONED_MESSAGE,
  DriverIdentityNotProvisionedError,
  clearDriverProvisioning,
  formatDriverError,
  getDriverClient,
  getDriverClientOrNull,
  getDriverId,
  getDriverIdOrNull,
  getDriverIdentityIssue,
  getPendingDriverTaskCompletion,
  hasDriverDevOverride,
  initializeDriverIdentity,
  isDriverIdentityNotProvisionedError,
  isDriverIdentityProvisioned,
  recoverDriverSessionFromApiError,
  revokeDriverDeviceBinding,
  sanitizeLogMessage,
} from "../../lib/api-client";
import {
  getDriverSessionState,
  resetDriverSessionLifecycleForTests,
  subscribeDriverSession,
} from "../../lib/driver-session-lifecycle";

// Mock expo-secure-store in-memory store
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

describe("Driver Secure Storage & Remote Logout UX (IAM-DRV-002)", () => {
  beforeEach(async () => {
    mockStore.clear();
    vi.clearAllMocks();
    await clearDriverProvisioning();
  });

  describe("Token hygiene & log sanitization", () => {
    it("redacts Bearer tokens, JWTs, and refresh tokens from log/error strings", () => {
      const rawError =
        'API error 401: {"error":{"code":"DRIVER_DEVICE_REFRESH_INVALID","message":"Token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkcHYtMDAxIn0.sig and Bearer eyJhbGciOiJIUzI1NiJ9.test is invalid"}}';
      const sanitized = sanitizeLogMessage(rawError);

      expect(sanitized).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
      expect(sanitized).toContain("[REDACTED_JWT]");
      expect(sanitized).toContain("Bearer [REDACTED]");
    });

    it("redacts snake_case access_token, refresh_token, and registration_code in JSON and query formats", () => {
      const rawJson =
        '{"refresh_token":"rt_opaque_abc123","access_token":"at_opaque_xyz456","registration_code":"reg_789"}';
      const sanitizedJson = sanitizeLogMessage(rawJson);

      expect(sanitizedJson).not.toContain("rt_opaque_abc123");
      expect(sanitizedJson).not.toContain("at_opaque_xyz456");
      expect(sanitizedJson).not.toContain("reg_789");
      expect(sanitizedJson).toContain('"refresh_token":"[REDACTED]"');
      expect(sanitizedJson).toContain('"access_token":"[REDACTED]"');

      const rawQuery =
        "refresh_token=rt_opaque_abc123&access_token=at_opaque_xyz456";
      const sanitizedQuery = sanitizeLogMessage(rawQuery);

      expect(sanitizedQuery).not.toContain("rt_opaque_abc123");
      expect(sanitizedQuery).not.toContain("at_opaque_xyz456");
      expect(sanitizedQuery).toContain("refresh_token=[REDACTED]");
      expect(sanitizedQuery).toContain("access_token=[REDACTED]");
    });

    it("formats ApiClientError and prevents raw error string leakage to UI paths", () => {
      const rawApiError = new Error(
        'API error 400: {"error":{"code":"INVALID_REGISTRATION_CODE","message":"The code registration_code=secret_999 is invalid."}}',
      );
      const formatted = formatDriverError(rawApiError, "配置失敗");

      expect(formatted).not.toContain("API error 400");
      expect(formatted).not.toContain("secret_999");
      // 需求 2：後端英文訊息不再原樣顯示，改用呼叫端的中文 fallback；
      // 秘密遮罩本身由 sanitizeLogMessage 負責（見下一個案例）。
      expect(formatted).toBe("配置失敗");
      expect(sanitizeLogMessage(rawApiError)).toContain(
        "registration_code=[REDACTED]",
      );
    });

    it("handles null or empty message sanitization gracefully", () => {
      expect(sanitizeLogMessage(null)).toBeNull();
      expect(sanitizeLogMessage(undefined)).toBeNull();
      expect(sanitizeLogMessage("")).toBeNull();
    });

    it("sanitizes error payloads for onboarding, trip reload, and location heartbeat logging paths", () => {
      const rawApiPayload = new Error(
        'API error 401: {"error":{"code":"UNAUTHORIZED","message":"Invalid token eyJhbGciOiJIUzI1NiJ9.test with Bearer secret_token_abc"}}',
      );

      // Onboarding / trip reload error path
      const formattedDriverError = formatDriverError(rawApiPayload, "操作失敗");
      expect(formattedDriverError).not.toContain("secret_token_abc");
      expect(formattedDriverError).not.toContain("eyJhbGciOiJIUzI1NiJ9");
      expect(formattedDriverError).toBe("操作失敗");

      // Location heartbeat task & queueing error path
      const sanitizedLog = sanitizeLogMessage(rawApiPayload);
      expect(sanitizedLog).not.toContain("secret_token_abc");
      expect(sanitizedLog).not.toContain("eyJhbGciOiJIUzI1NiJ9");
      expect(sanitizedLog).toContain("Bearer [REDACTED]");

      // Location permission blocked reason path
      const rawReason = "Permission blocked with token=secret_token_123";
      const sanitizedReason = sanitizeLogMessage(rawReason);
      expect(sanitizedReason).not.toContain("secret_token_123");
      expect(sanitizedReason).toContain("token=[REDACTED]");
    });
  });

  describe("Deterministic Auth States & Recovery", () => {
    it("handles DRIVER_AUTH_SUSPENDED auth failure by clearing session and setting deterministic issue", async () => {
      const authError = new Error(
        'API error 403: {"error":{"code":"DRIVER_AUTH_SUSPENDED","message":"The driver account is suspended."}}',
      );

      const recovered = await recoverDriverSessionFromApiError(authError);
      expect(recovered).toBe(true);
      expect(getDriverIdentityIssue()).toBe(
        "此司機帳號已被停權，暫時無法登入系統。",
      );
      expect(isDriverIdentityProvisioned()).toBe(false);
    });

    it("handles DRIVER_AUTH_REVOKED auth failure by clearing session and setting deterministic issue", async () => {
      const authError = new Error(
        'API error 403: {"error":{"code":"DRIVER_AUTH_REVOKED","message":"Driver account retired."}}',
      );

      const recovered = await recoverDriverSessionFromApiError(authError);
      expect(recovered).toBe(true);
      expect(getDriverIdentityIssue()).toBe(
        "此司機帳號已退役或撤銷，請聯絡平台管理員。",
      );
      expect(isDriverIdentityProvisioned()).toBe(false);
    });

    it("handles DRIVER_CERT_INVALID auth failure by clearing session and setting deterministic issue", async () => {
      const authError = new Error(
        'API error 403: {"error":{"code":"DRIVER_CERT_INVALID","message":"Certificates expired."}}',
      );

      const recovered = await recoverDriverSessionFromApiError(authError);
      expect(recovered).toBe(true);
      expect(getDriverIdentityIssue()).toBe(
        "司機證件狀態無效，請聯絡平台管理員重新啟用。",
      );
      expect(isDriverIdentityProvisioned()).toBe(false);
    });

    it("handles DRIVER_DEVICE_REUSE_DETECTED compromised-session auth failure", async () => {
      const authError = new Error(
        'API error 401: {"error":{"code":"DRIVER_DEVICE_REUSE_DETECTED","message":"Token reuse detected."}}',
      );

      const recovered = await recoverDriverSessionFromApiError(authError);
      expect(recovered).toBe(true);
      expect(getDriverIdentityIssue()).toBe(
        "偵測到裝置憑證異常重複使用，系統已自動撤銷憑證並安全登出，請重新註冊。",
      );
      expect(isDriverIdentityProvisioned()).toBe(false);
    });

    it("treats an invalid device session as a revoked binding and directs the driver to rebind", async () => {
      const authError = new Error(
        'API error 401: {"error":{"code":"DRIVER_DEVICE_SESSION_INVALID","message":"Session revoked for device binding."}}',
      );

      const recovered = await recoverDriverSessionFromApiError(authError);

      expect(recovered).toBe(true);
      expect(getDriverIdentityIssue()).toBe(
        "此裝置的司機綁定已失效或被撤銷，請重新輸入註冊碼綁定。",
      );
      expect(isDriverIdentityProvisioned()).toBe(false);
    });

    it("does not recover unrelated failures as an auth state", async () => {
      const recovered = await recoverDriverSessionFromApiError(
        new Error(
          'API error 503: {"error":{"code":"SERVICE_UNAVAILABLE","message":"Retry later."}}',
        ),
      );

      expect(recovered).toBe(false);
      expect(getDriverIdentityIssue()).toBeNull();
    });
  });

  describe("Offline Unsynchronized Proof Preservation", () => {
    it("preserves offline pending completion proof in SecureStore across session invalidation and re-auth", async () => {
      // 1. Store pending completion item into SecureStore
      const pendingKey = "drts.driver.pendingTaskCompletion";
      const pendingPayload = {
        taskId: "task-offline-101",
        requestId: "driver-task-complete-101",
        command: {
          completedAt: new Date().toISOString(),
          odometerKm: 1250,
          meterFareAmount: 350,
          totalFareAmount: 350,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await SecureStore.setItemAsync(pendingKey, JSON.stringify(pendingPayload));

      // Verify pending completion is loadable
      const loadedBefore = await getPendingDriverTaskCompletion();
      expect(loadedBefore).not.toBeNull();
      expect(loadedBefore?.taskId).toBe("task-offline-101");

      // 2. Trigger session invalidation / remote revoke recovery
      const authError = new Error(
        'API error 401: {"error":{"code":"DRIVER_DEVICE_REFRESH_INVALID","message":"Session revoked."}}',
      );
      await recoverDriverSessionFromApiError(authError);

      // 3. Verify driver session key is cleared from SecureStore but pending completion proof is preserved!
      expect(mockStore.has("drts.driver.session")).toBe(false);
      expect(mockStore.has(pendingKey)).toBe(true);

      const loadedAfterRevoke = await getPendingDriverTaskCompletion();
      expect(loadedAfterRevoke).not.toBeNull();
      expect(loadedAfterRevoke?.taskId).toBe("task-offline-101");
      expect(loadedAfterRevoke?.requestId).toBe("driver-task-complete-101");
    });
  });

  describe("Remote Revoke & Local Logout", () => {
    it("clears credentials and local session state on explicit revoke", async () => {
      // Set up dummy session
      const dummySession = {
        accessToken: "access-token-xyz",
        refreshToken: "refresh-token-xyz",
        tokenType: "Bearer",
        expiresIn: 900,
        refreshExpiresIn: 2592000,
        driverId: "drv-test-001",
        deviceId: "device-test-001",
        bindingId: "binding-test-001",
        issuedAt: new Date().toISOString(),
      };
      await SecureStore.setItemAsync(
        "drts.driver.session",
        JSON.stringify(dummySession),
      );

      await initializeDriverIdentity();
      expect(isDriverIdentityProvisioned()).toBe(true);

      // Revoke binding
      await revokeDriverDeviceBinding();

      expect(isDriverIdentityProvisioned()).toBe(false);
      expect(mockStore.has("drts.driver.session")).toBe(false);
    });

    it("keeps the device registration id and every pending queue on logout", async () => {
      await SecureStore.setItemAsync(
        "drts.driver.deviceId",
        "device-registered-001",
      );
      await SecureStore.setItemAsync(
        "drts.driver.pendingTaskCompletion",
        JSON.stringify({
          taskId: "task-1",
          requestId: "req-1",
          command: { completedAt: new Date().toISOString() },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );
      await SecureStore.setItemAsync("drts.driver.sos.activeCase", "{}");
      await SecureStore.setItemAsync(
        "drts.driver.trackingSessionMarker",
        "{}",
      );
      await SecureStore.setItemAsync(
        "drts.driver.session",
        JSON.stringify({
          accessToken: "access-token-xyz",
          refreshToken: "refresh-token-xyz",
          tokenType: "Bearer",
          expiresIn: 900,
          refreshExpiresIn: 2592000,
          driverId: "drv-test-001",
          deviceId: "device-registered-001",
          bindingId: "binding-test-001",
          issuedAt: new Date().toISOString(),
        }),
      );

      await initializeDriverIdentity();
      await revokeDriverDeviceBinding();

      expect(mockStore.has("drts.driver.session")).toBe(false);
      expect(mockStore.get("drts.driver.deviceId")).toBe(
        "device-registered-001",
      );
      expect(mockStore.has("drts.driver.pendingTaskCompletion")).toBe(true);
      expect(mockStore.has("drts.driver.sos.activeCase")).toBe(true);
      expect(mockStore.has("drts.driver.trackingSessionMarker")).toBe(true);
    });

    it("broadcasts exactly one sign-out even when logout is repeated", async () => {
      resetDriverSessionLifecycleForTests();
      const seen: string[] = [];
      const unsubscribe = subscribeDriverSession((snapshot) => {
        seen.push(snapshot.state);
      });

      await SecureStore.setItemAsync(
        "drts.driver.session",
        JSON.stringify({
          accessToken: "access-token-xyz",
          refreshToken: "refresh-token-xyz",
          tokenType: "Bearer",
          expiresIn: 900,
          refreshExpiresIn: 2592000,
          driverId: "drv-test-001",
          deviceId: "device-test-001",
          bindingId: "binding-test-001",
          issuedAt: new Date().toISOString(),
        }),
      );
      await initializeDriverIdentity();
      expect(getDriverSessionState()).toBe("signed_in");

      await revokeDriverDeviceBinding();
      await revokeDriverDeviceBinding();
      await clearDriverProvisioning();

      expect(getDriverSessionState()).toBe("signed_out");
      expect(seen).toEqual(["signed_in", "signed_out"]);
      unsubscribe();
    });
  });

  describe("Unprovisioned identity accessors", () => {
    it("never exposes internals in the unprovisioned message", () => {
      let thrown: unknown = null;
      try {
        getDriverClient();
      } catch (error) {
        thrown = error;
      }

      const message = (thrown as Error).message;
      expect(message).toBe(DRIVER_IDENTITY_NOT_PROVISIONED_MESSAGE);
      expect(message).not.toContain("EXPO_PUBLIC");
      expect(message).not.toContain("Driver identity is not provisioned");
      expect(message).not.toContain("getDriverClient");
      expect(message).not.toContain("api-client");
      expect(message).not.toMatch(/[A-Za-z]{4,}/);
    });

    it("uses the same driver-facing message for the driver id accessor", () => {
      expect(() => getDriverId()).toThrowError(
        DRIVER_IDENTITY_NOT_PROVISIONED_MESSAGE,
      );
      expect(() => getDriverId()).toThrowError(
        DriverIdentityNotProvisionedError,
      );
    });

    it("routes the unprovisioned error through formatDriverError unchanged", () => {
      const formatted = formatDriverError(
        new DriverIdentityNotProvisionedError(),
        "操作失敗",
      );
      expect(formatted).toBe(DRIVER_IDENTITY_NOT_PROVISIONED_MESSAGE);
      expect(formatted).not.toContain("EXPO_PUBLIC");
    });

    it("identifies the typed error so callers do not string-match", () => {
      expect(
        isDriverIdentityNotProvisionedError(
          new DriverIdentityNotProvisionedError(),
        ),
      ).toBe(true);
      expect(isDriverIdentityNotProvisionedError(new Error("其他錯誤"))).toBe(
        false,
      );
    });

    it("offers non-throwing accessors for UI call sites", () => {
      expect(getDriverClientOrNull()).toBeNull();
      expect(getDriverIdOrNull()).toBeNull();
    });

    it("disables the development identity override outside a dev bundle", () => {
      // __DEV__ is undefined in a release bundle and in this test environment.
      expect(hasDriverDevOverride()).toBe(false);
    });
  });
});

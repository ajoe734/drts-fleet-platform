import { beforeEach, describe, expect, it, vi } from "vitest";
import * as SecureStore from "expo-secure-store";

import {
  clearDriverProvisioning,
  formatDriverError,
  getDriverAuthState,
  getDriverIdentityIssue,
  getPendingDriverTaskCompletion,
  getProvisionedSession,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
  recoverDriverSessionFromApiError,
  sanitizeLogMessage,
} from "../../lib/api-client";
import { driverAuthStrings } from "../../lib/strings";

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

describe("Driver Auth States & Device Flow (IAM-UI-DRV-001)", () => {
  beforeEach(async () => {
    mockStore.clear();
    vi.clearAllMocks();
    await clearDriverProvisioning();
  });

  describe("Reachable Driver Auth States", () => {
    it("returns 'not_provisioned' when identity is unprovisioned and no issue exists", () => {
      expect(isDriverIdentityProvisioned()).toBe(false);
      expect(getDriverIdentityIssue()).toBeNull();
      expect(getDriverAuthState()).toBe("not_provisioned");
    });

    it("returns 'session_expired' when session refresh token fails or is invalid", async () => {
      const authError = new Error(
        'API error 401: {"error":{"code":"DRIVER_DEVICE_REFRESH_INVALID","message":"Refresh token expired."}}',
      );

      const recovered = await recoverDriverSessionFromApiError(authError);
      expect(recovered).toBe(true);
      expect(getDriverAuthState()).toBe("session_expired");
      expect(getDriverIdentityIssue()).toContain("失效或被撤銷");
    });

    it("returns 'device_revoked' when session is revoked or token reuse is detected", async () => {
      const reuseError = new Error(
        'API error 401: {"error":{"code":"DRIVER_DEVICE_REUSE_DETECTED","message":"Token reuse detected."}}',
      );

      const recovered = await recoverDriverSessionFromApiError(reuseError);
      expect(recovered).toBe(true);
      expect(getDriverAuthState()).toBe("device_revoked");
      expect(getDriverIdentityIssue()).toContain("撤銷憑證並安全登出");

      const revokeError = new Error(
        'API error 403: {"error":{"code":"DRIVER_AUTH_REVOKED","message":"Driver account retired."}}',
      );

      await recoverDriverSessionFromApiError(revokeError);
      expect(getDriverAuthState()).toBe("device_revoked");
      expect(getDriverIdentityIssue()).toContain("退役或撤銷");
    });

    it("returns 'driver_suspended' when driver account or cert is suspended", async () => {
      const suspendedError = new Error(
        'API error 403: {"error":{"code":"DRIVER_AUTH_SUSPENDED","message":"Driver account suspended."}}',
      );

      const recovered = await recoverDriverSessionFromApiError(suspendedError);
      expect(recovered).toBe(true);
      expect(getDriverAuthState()).toBe("driver_suspended");
      expect(getDriverIdentityIssue()).toContain("已被停權");

      const certError = new Error(
        'API error 403: {"error":{"code":"DRIVER_CERT_INVALID","message":"Cert expired."}}',
      );

      await recoverDriverSessionFromApiError(certError);
      expect(getDriverAuthState()).toBe("driver_suspended");
      expect(getDriverIdentityIssue()).toContain("證件狀態無效");
    });
  });

  describe("Device Registration & Rebind Surface", () => {
    it("provisions session on device registration and exposes session details", async () => {
      // Simulate dummy provisioned session
      const dummySession = {
        accessToken: "access-token-abc",
        refreshToken: "refresh-token-xyz",
        tokenType: "Bearer" as const,
        expiresIn: "900",
        refreshExpiresIn: "2592000",
        driverId: "drv-001",
        deviceId: "device-test-123",
        bindingId: "bnd-001",
        issuedAt: new Date().toISOString(),
        identity: {
          actorId: "drv-001",
          tenantId: "tnt-demo-001",
          realm: "driver" as const,
        },
      };

      await SecureStore.setItemAsync(
        "drts.driver.session",
        JSON.stringify(dummySession),
      );

      await initializeDriverIdentity();
      expect(isDriverIdentityProvisioned()).toBe(true);
      expect(getProvisionedSession()).not.toBeNull();
      expect(getProvisionedSession()?.bindingId).toBe("bnd-001");
      expect(getDriverAuthState()).toBe("provisioned");
    });

    it("rebinds device with a new registration code", async () => {
      // Setup initial session
      const initialSession = {
        accessToken: "access-token-old",
        refreshToken: "refresh-token-old",
        tokenType: "Bearer" as const,
        expiresIn: "900",
        refreshExpiresIn: "2592000",
        driverId: "drv-001",
        deviceId: "device-test-123",
        bindingId: "bnd-old",
        issuedAt: new Date().toISOString(),
        identity: {
          actorId: "drv-001",
          tenantId: "tnt-demo-001",
          realm: "driver" as const,
        },
      };

      await SecureStore.setItemAsync(
        "drts.driver.session",
        JSON.stringify(initialSession),
      );
      await initializeDriverIdentity();

      // Simulate rebind by writing new session to storage and re-initializing
      const reboundSession = {
        ...initialSession,
        accessToken: "access-token-new",
        refreshToken: "refresh-token-new",
        bindingId: "bnd-rebound-002",
      };
      await SecureStore.setItemAsync(
        "drts.driver.session",
        JSON.stringify(reboundSession),
      );
      await initializeDriverIdentity();

      expect(isDriverIdentityProvisioned()).toBe(true);
      expect(getProvisionedSession()?.bindingId).toBe("bnd-rebound-002");
      expect(getDriverAuthState()).toBe("provisioned");
    });
  });

  describe("Offline Proof Preservation Across Revoke & Compromise", () => {
    it("keeps offline pending completions intact when session is revoked or compromised", async () => {
      const pendingPayload = {
        taskId: "task-offline-999",
        requestId: "req-offline-999",
        command: {
          completedAt: new Date().toISOString(),
          odometerKm: 1500,
          meterFareAmount: 450,
          totalFareAmount: 450,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await SecureStore.setItemAsync(
        "drts.driver.pendingTaskCompletion",
        JSON.stringify(pendingPayload),
      );

      // Verify pending completion is present
      const loadedBefore = await getPendingDriverTaskCompletion();
      expect(loadedBefore?.taskId).toBe("task-offline-999");

      // Invalidate session with reuse detection error
      const compromiseError = new Error(
        'API error 401: {"error":{"code":"DRIVER_DEVICE_REUSE_DETECTED","message":"Reuse detected."}}',
      );
      await recoverDriverSessionFromApiError(compromiseError);

      expect(isDriverIdentityProvisioned()).toBe(false);
      expect(getDriverAuthState()).toBe("device_revoked");

      // Verify offline proof was NOT discarded!
      const loadedAfter = await getPendingDriverTaskCompletion();
      expect(loadedAfter).not.toBeNull();
      expect(loadedAfter?.taskId).toBe("task-offline-999");
    });
  });

  describe("Secret Leakage Guard", () => {
    it("sanitizes JWTs, Bearer tokens, and registration codes in all state messages and formatters", () => {
      const rawErrorWithToken =
        'API error 401: {"error":{"code":"UNAUTHORIZED","message":"Access token eyJhbGciOiJIUzI1NiJ9.secret_payload with Bearer secret_123 and registration_code=code_999 is invalid"}}';

      const formatted = formatDriverError(rawErrorWithToken);
      expect(formatted).not.toContain("secret_payload");
      expect(formatted).not.toContain("secret_123");
      expect(formatted).not.toContain("code_999");

      const sanitizedLog = sanitizeLogMessage(rawErrorWithToken);
      expect(sanitizedLog).toContain("[REDACTED_JWT]");
      expect(sanitizedLog).toContain("Bearer [REDACTED]");
      expect(sanitizedLog).toContain("registration_code=[REDACTED]");
    });

    // 需求 2：後端／內部的英文技術訊息（欄位名、型別名、狀態描述）不得
    // 原封不動推上畫面，一律換成呼叫端提供的中文 fallback。
    it("replaces non-Chinese backend and internal error text with the Chinese fallback", () => {
      const apiError = new Error(
        'API error 409: {"error":{"code":"TASK_CONFLICT","message":"Task payload schema mismatch on /api/driver/tasks"}}',
      );
      expect(formatDriverError(apiError, "任務更新失敗，請重新整理。")).toBe(
        "任務更新失敗，請重新整理。",
      );

      const internalError = new Error(
        "Stored task completion record is incomplete.",
      );
      expect(formatDriverError(internalError)).toBe("操作失敗，請稍後再試。");

      // 後端若已經送中文文案，維持原文顯示。
      const localizedError = new Error(
        'API error 409: {"error":{"code":"TASK_CONFLICT","message":"此任務已被其他人接走"}}',
      );
      expect(formatDriverError(localizedError, "任務更新失敗。")).toBe(
        "此任務已被其他人接走",
      );
    });
  });

  describe("UI String Dictionary Integrity", () => {
    // Every auth state still has a distinct badge, and none of them leak the
    // internal state identifier (DeviceNotProvisioned / SessionExpired /
    // DeviceRevoked / DriverSuspended) that used to be appended to the copy.
    it("has a distinct, identifier-free badge for every declared auth state", () => {
      const badges = [
        driverAuthStrings.states.not_provisioned.badge,
        driverAuthStrings.states.session_expired.badge,
        driverAuthStrings.states.device_revoked.badge,
        driverAuthStrings.states.driver_suspended.badge,
      ];

      expect(new Set(badges).size).toBe(badges.length);
      for (const badge of badges) {
        expect(badge).not.toMatch(/[A-Za-z]/);
      }
    });
  });
});

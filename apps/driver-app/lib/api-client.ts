/**
 * Driver App API client factory and token lifecycle authority.
 *
 * Production posture prefers a backend-issued, device-bound Bearer session.
 * Development may still opt into explicit env-var bootstrap identity.
 */

import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import {
  ApiClient,
  createDriverBearerClient,
  createDriverClient,
  createPublicClient,
} from "@drts/api-client";
import type {
  DriverCompleteTaskCommand,
  DriverDeviceProvisioningSession,
  DriverTaskRecord,
  ForwardedDriverActionResponse,
} from "@drts/contracts";

type DriverExpoExtra = {
  apiBaseUrl?: string;
  driverActorId?: string;
};

const expoExtra = (Constants.expoConfig?.extra ?? {}) as DriverExpoExtra;
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  expoExtra.apiBaseUrl ??
  "https://drts-api-kdhu6wzufa-uc.a.run.app";

const DEV_DRIVER_ID: string | undefined =
  process.env.EXPO_PUBLIC_DRIVER_ID ??
  process.env.EXPO_PUBLIC_DRIVER_ACTOR_ID ??
  expoExtra.driverActorId;

const DRIVER_DEVICE_ID_KEY = "drts.driver.deviceId";
const DRIVER_SESSION_KEY = "drts.driver.session";
const DRIVER_PENDING_TASK_COMPLETION_KEY = "drts.driver.pendingTaskCompletion";

let publicClient = createPublicClient(API_URL);

let client: ApiClient | null = null;
let driverClientProxy: ApiClient | null = null;
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
let refreshPromise: Promise<DriverDeviceProvisioningSession> | null = null;
let provisionedSession: DriverDeviceProvisioningSession | null = null;
let driverIdentityIssue: string | null = null;

export type ProtectedCacheClearCallback = () => void | Promise<void>;
const protectedCacheClearHandlers = new Set<ProtectedCacheClearCallback>();

export type PendingDriverTaskCompletion = {
  taskId: string;
  requestId: string;
  command: DriverCompleteTaskCommand;
  createdAt: string;
  updatedAt: string;
};

export type DriverAuthState =
  | "not_provisioned"
  | "provisioned"
  | "session_expired"
  | "device_revoked"
  | "driver_suspended";

function createLocalId(prefix: string): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function applySession(session: DriverDeviceProvisioningSession | null) {
  provisionedSession = session;
  client = session
    ? createDriverBearerClient(API_URL, session.accessToken)
    : DEV_DRIVER_ID
      ? createDriverClient(API_URL, DEV_DRIVER_ID)
      : null;
}

function setDriverIdentityIssue(message: string | null) {
  driverIdentityIssue = message?.trim() ? message.trim() : null;
}

export function sanitizeLogMessage(message: unknown): string | null {
  if (message === null || message === undefined) {
    return null;
  }
  let str: string;
  if (typeof message === "string") {
    str = message;
  } else if (message instanceof Error) {
    str = message.message;
  } else {
    try {
      str = typeof message === "object" ? JSON.stringify(message) : String(message);
    } catch {
      str = String(message);
    }
  }

  if (!str.trim()) {
    return null;
  }

  return str
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/eyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_=]*/g, "[REDACTED_JWT]")
    .replace(
      /(["']?(?:accessToken|access_token|refreshToken|refresh_token|idToken|id_token|authToken|auth_token|deviceToken|device_token|registrationCode|registration_code|secret|clientSecret|client_secret|token)["']?\s*:\s*["'])([^"']+)(["'])/gi,
      "$1[REDACTED]$3",
    )
    .replace(
      /(["']?(?:accessToken|access_token|refreshToken|refresh_token|idToken|id_token|authToken|auth_token|deviceToken|device_token|registrationCode|registration_code|secret|clientSecret|client_secret|token)["']?\s*:\s*)([^\s,{}'"]+)/gi,
      "$1[REDACTED]",
    )
    .replace(
      /((?:accessToken|access_token|refreshToken|refresh_token|idToken|id_token|authToken|auth_token|deviceToken|device_token|registrationCode|registration_code|secret|clientSecret|client_secret|token)=)([^&\s"']+)/gi,
      "$1[REDACTED]",
    );
}

function parseApiError(error: unknown): {
  status: number | null;
  code: string | null;
  message: string | null;
} {
  let status: number | null = null;
  let code: string | null = null;
  let message: string | null = null;
  let rawBody: string | null = null;

  if (error && typeof error === "object") {
    if ("statusCode" in error && typeof (error as { statusCode: unknown }).statusCode === "number") {
      status = (error as { statusCode: number }).statusCode;
    } else if ("status" in error && typeof (error as { status: unknown }).status === "number") {
      status = (error as { status: number }).status;
    }

    if ("code" in error && typeof (error as { code: unknown }).code === "string") {
      code = (error as { code: string }).code;
    }

    if ("apiMessage" in error && typeof (error as { apiMessage: unknown }).apiMessage === "string") {
      message = (error as { apiMessage: string }).apiMessage;
    }

    if ("rawBody" in error && typeof (error as { rawBody: unknown }).rawBody === "string") {
      rawBody = (error as { rawBody: string }).rawBody;
    }
  }

  const payloadText =
    rawBody ??
    (error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "");

  const apiMatch = /^API error (\d+):\s*(.*)$/s.exec(payloadText);
  const jsonCandidate = apiMatch ? apiMatch[2] : payloadText;

  if (apiMatch && status === null) {
    status = Number.parseInt(apiMatch[1], 10);
  }

  if (jsonCandidate?.trim()) {
    try {
      const payload = JSON.parse(jsonCandidate.trim()) as {
        error?: { code?: string; message?: string };
        code?: string;
        message?: string;
      };
      if (payload.error?.code) {
        code = payload.error.code;
      } else if (payload.code) {
        code = payload.code;
      }
      if (payload.error?.message) {
        message = sanitizeLogMessage(payload.error.message);
      } else if (payload.message) {
        message = sanitizeLogMessage(payload.message);
      }
    } catch {
      // not json, keep existing code/message
    }
  }

  const rawFallback =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : typeof error === "string" && error.trim()
        ? error.trim()
        : null;
  const fallback = sanitizeLogMessage(rawFallback);

  return {
    status,
    code,
    message: message ?? fallback,
  };
}

function isUnauthorized401Error(error: unknown): boolean {
  const parsed = parseApiError(error);
  if (parsed.status === 401) {
    return true;
  }
  if (
    parsed.code === "UNAUTHORIZED" ||
    parsed.code === "JWT_INVALID" ||
    parsed.code === "DRIVER_DEVICE_REFRESH_INVALID" ||
    parsed.code === "DRIVER_DEVICE_SESSION_INVALID" ||
    parsed.code === "DRIVER_DEVICE_REUSE_DETECTED"
  ) {
    return true;
  }
  return false;
}

function isForbidden403Error(error: unknown): boolean {
  const parsed = parseApiError(error);
  if (parsed.status === 403) {
    return true;
  }
  if (
    parsed.code === "DRIVER_AUTH_SUSPENDED" ||
    parsed.code === "DRIVER_AUTH_REVOKED" ||
    parsed.code === "DRIVER_CERT_INVALID" ||
    parsed.code === "DRIVER_DEVICE_BINDING_FORBIDDEN" ||
    parsed.code === "FORBIDDEN"
  ) {
    return true;
  }
  return false;
}

function isDriverSessionAuthFailure(error: unknown): boolean {
  return isUnauthorized401Error(error);
}

function getDriverIdentityIssueMessage(error: unknown): string {
  const parsed = parseApiError(error);
  switch (parsed.code) {
    case "DRIVER_DEVICE_REUSE_DETECTED":
      return "偵測到裝置憑證異常重複使用，系統已自動撤銷憑證並安全登出，請重新註冊。";
    case "DRIVER_DEVICE_REFRESH_INVALID":
    case "DRIVER_DEVICE_SESSION_INVALID":
      return "此裝置的司機綁定已失效或被撤銷，請重新輸入註冊碼綁定。";
    case "DRIVER_AUTH_SUSPENDED":
      return "此司機帳號已被停權，暫時無法登入系統。";
    case "DRIVER_AUTH_REVOKED":
      return "此司機帳號已退役或撤銷，請聯絡平台管理員。";
    case "DRIVER_CERT_INVALID":
      return "司機證件狀態無效，請聯絡平台管理員重新啟用。";
    case "DRIVER_DEVICE_BINDING_FORBIDDEN":
      return "無權存取或變更此裝置的司機綁定，請重新登入。";
    default:
      return parsed.message && !parsed.message.startsWith("API error ")
        ? sanitizeLogMessage(parsed.message)!
        : "裝置登入已失效，請重新註冊。";
  }
}

export function formatDriverError(
  error: unknown,
  fallback = "操作失敗，請稍後再試。",
): string {
  if (error === null || error === undefined) {
    return fallback;
  }

  const parsed = parseApiError(error);
  if (parsed.code) {
    const knownMessage = getDriverIdentityIssueMessage(error);
    if (knownMessage) {
      return knownMessage;
    }
  }

  if (parsed.message) {
    const sanitized = sanitizeLogMessage(parsed.message);
    if (sanitized && !sanitized.startsWith("API error ")) {
      return sanitized;
    }
  }

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : null;

  const sanitizedRaw = sanitizeLogMessage(rawMessage);
  if (sanitizedRaw && !sanitizedRaw.startsWith("API error ")) {
    return sanitizedRaw;
  }

  return fallback;
}

function isTerminalDriverCompletionError(error: unknown): boolean {
  const parsed = parseApiError(error);
  return (
    parsed.code === "MIN_PHOTO_COUNT_NOT_MET" ||
    parsed.code === "PROOF_REQUIRED" ||
    parsed.code === "EXPENSE_PROOF_REQUIRED" ||
    parsed.code === "TASK_ALREADY_COMPLETED"
  );
}

function getReplayHeaders(requestId: string): Record<string, string> {
  return {
    "X-Request-Id": requestId,
    "Idempotency-Key": requestId,
  };
}

export function registerProtectedCacheClearHandler(
  handler: ProtectedCacheClearCallback,
): () => void {
  protectedCacheClearHandlers.add(handler);
  return () => {
    protectedCacheClearHandlers.delete(handler);
  };
}

async function clearProtectedCachedData(): Promise<void> {
  for (const handler of Array.from(protectedCacheClearHandlers)) {
    try {
      await handler();
    } catch {
      // Swallow error during cache invalidation
    }
  }
}

export function getDriverAuthState(): DriverAuthState {
  if (!isDriverIdentityProvisioned()) {
    if (!driverIdentityIssue) {
      return "not_provisioned";
    }
    if (
      driverIdentityIssue.includes("停權") ||
      driverIdentityIssue.includes("證件")
    ) {
      return "driver_suspended";
    }
    if (
      driverIdentityIssue.includes("失效") ||
      driverIdentityIssue.includes("過期")
    ) {
      return "session_expired";
    }
    if (
      driverIdentityIssue.includes("撤銷") ||
      driverIdentityIssue.includes("退役") ||
      driverIdentityIssue.includes("重複使用")
    ) {
      return "device_revoked";
    }
    return "session_expired";
  }
  return "provisioned";
}

export function getProvisionedSession(): DriverDeviceProvisioningSession | null {
  return provisionedSession;
}

export function getDriverIdentityIssue(): string | null {
  return driverIdentityIssue;
}

export async function recoverDriverSessionFromApiError(
  error: unknown,
): Promise<boolean> {
  if (!isDriverSessionAuthFailure(error)) {
    return false;
  }

  setDriverIdentityIssue(getDriverIdentityIssueMessage(error));
  await clearStoredSession();
  hydrated = true;
  return true;
}

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DRIVER_DEVICE_ID_KEY);
  if (existing?.trim()) {
    return existing;
  }

  const deviceId = createLocalId("device");
  await SecureStore.setItemAsync(DRIVER_DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export async function getDriverDeviceId(): Promise<string> {
  return getOrCreateDeviceId();
}

async function clearStoredSession() {
  provisionedSession = null;
  await SecureStore.deleteItemAsync(DRIVER_SESSION_KEY);
  applySession(null);
  await clearProtectedCachedData();
}

async function persistPendingDriverTaskCompletion(
  pending: PendingDriverTaskCompletion,
): Promise<void> {
  await SecureStore.setItemAsync(
    DRIVER_PENDING_TASK_COMPLETION_KEY,
    JSON.stringify(pending),
  );
}

async function loadPendingDriverTaskCompletion(): Promise<PendingDriverTaskCompletion | null> {
  const raw = await SecureStore.getItemAsync(
    DRIVER_PENDING_TASK_COMPLETION_KEY,
  );
  if (!raw) {
    return null;
  }

  try {
    const pending = JSON.parse(raw) as PendingDriverTaskCompletion;
    if (
      !pending.taskId?.trim() ||
      !pending.requestId?.trim() ||
      !pending.command?.completedAt
    ) {
      throw new Error("Pending driver task completion payload is incomplete.");
    }

    return pending;
  } catch {
    await SecureStore.deleteItemAsync(DRIVER_PENDING_TASK_COMPLETION_KEY);
    return null;
  }
}

async function clearPendingDriverTaskCompletion(): Promise<void> {
  await SecureStore.deleteItemAsync(DRIVER_PENDING_TASK_COMPLETION_KEY);
}

async function persistSession(session: DriverDeviceProvisioningSession) {
  provisionedSession = session;
  await SecureStore.setItemAsync(DRIVER_SESSION_KEY, JSON.stringify(session));
  applySession(session);
}

export function hasDriverDevOverride(): boolean {
  return Boolean(DEV_DRIVER_ID);
}

export function isDriverIdentityHydrated(): boolean {
  return hydrated;
}

export async function initializeDriverIdentity(): Promise<void> {
  if (hydrationPromise) {
    return hydrationPromise;
  }

  hydrationPromise = (async () => {
    if (DEV_DRIVER_ID) {
      setDriverIdentityIssue(null);
      applySession(null);
      hydrated = true;
      return;
    }

    const storedSessionJson =
      await SecureStore.getItemAsync(DRIVER_SESSION_KEY);
    if (!storedSessionJson) {
      setDriverIdentityIssue(null);
      applySession(null);
      hydrated = true;
      return;
    }

    let storedSession: DriverDeviceProvisioningSession;
    try {
      storedSession = JSON.parse(
        storedSessionJson,
      ) as DriverDeviceProvisioningSession;
    } catch {
      setDriverIdentityIssue("裝置登入資料已失效，請重新註冊。");
      await clearStoredSession();
      hydrated = true;
      return;
    }

    // Restore identity synchronously from stored session without requiring network round trip
    applySession(storedSession);
    setDriverIdentityIssue(null);
    hydrated = true;
  })().finally(() => {
    hydrationPromise = null;
  });

  return hydrationPromise;
}

export async function refreshDriverSessionSingleFlight(): Promise<DriverDeviceProvisioningSession> {
  if (refreshPromise) {
    return refreshPromise;
  }

  if (!provisionedSession) {
    throw new Error("Cannot refresh driver session: no provisioned session found.");
  }

  const sessionToRefresh = provisionedSession;

  refreshPromise = (async () => {
    try {
      const refreshedSession = await publicClient.refreshDriverDeviceSession({
        refreshToken: sessionToRefresh.refreshToken,
        deviceId: sessionToRefresh.deviceId,
      });

      // A rotated refresh token is persisted before any waiter resumes,
      // so no waiter reuses a consumed token.
      await persistSession(refreshedSession);
      setDriverIdentityIssue(null);
      return refreshedSession;
    } catch (error) {
      if (isDriverSessionAuthFailure(error)) {
        setDriverIdentityIssue(getDriverIdentityIssueMessage(error));
        await clearStoredSession();
      }
      throw error;
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export function isDriverIdentityProvisioned(): boolean {
  return Boolean(DEV_DRIVER_ID || provisionedSession?.accessToken);
}

export async function registerDriverDevice(
  registrationCode: string,
  deviceLabel?: string,
): Promise<DriverDeviceProvisioningSession> {
  const deviceId = await getOrCreateDeviceId();
  const session = await publicClient.registerDriverDevice({
    registrationCode,
    deviceId,
    deviceLabel: deviceLabel?.trim() || null,
  });
  setDriverIdentityIssue(null);
  await persistSession(session);
  hydrated = true;
  return session;
}

export async function rebindDriverDevice(
  registrationCode: string,
  deviceLabel?: string,
): Promise<DriverDeviceProvisioningSession> {
  return registerDriverDevice(registrationCode, deviceLabel);
}

export async function clearDriverProvisioning(): Promise<void> {
  setDriverIdentityIssue(null);
  await clearStoredSession();
  hydrated = true;
}

export async function revokeDriverDeviceBinding(): Promise<void> {
  if (DEV_DRIVER_ID || !provisionedSession) {
    setDriverIdentityIssue(null);
    await clearStoredSession();
    hydrated = true;
    return;
  }

  try {
    const session = provisionedSession;
    const bearerClient = createDriverBearerClient(API_URL, session.accessToken);
    await bearerClient.revokeDriverDeviceBinding({
      bindingId: session.bindingId,
      deviceId: session.deviceId,
    });
  } catch {
    // If remote revoke fails (e.g. offline or server error), local credentials
    // are still safely wiped in finally block to ensure local logout posture.
  } finally {
    setDriverIdentityIssue(null);
    await clearStoredSession();
    hydrated = true;
  }
}

export async function getPendingDriverTaskCompletion(): Promise<PendingDriverTaskCompletion | null> {
  return loadPendingDriverTaskCompletion();
}

export async function replayPendingDriverTaskCompletion(): Promise<DriverTaskRecord | null> {
  const pending = await loadPendingDriverTaskCompletion();
  if (!pending) {
    return null;
  }

  try {
    const task = await getDriverClient().completeTask(
      pending.taskId,
      pending.command,
      {
        headers: getReplayHeaders(pending.requestId),
      },
    );
    await clearPendingDriverTaskCompletion();
    return task;
  } catch (error) {
    if (await recoverDriverSessionFromApiError(error)) {
      throw error;
    }

    if (isTerminalDriverCompletionError(error)) {
      await clearPendingDriverTaskCompletion();
    }

    throw error;
  }
}

export async function acceptForwardedDriverOffer(
  taskId: string,
): Promise<ForwardedDriverActionResponse> {
  try {
    return await getDriverClient().acceptForwardedOrder(taskId);
  } catch (error) {
    await recoverDriverSessionFromApiError(error);
    throw error;
  }
}

export async function rejectForwardedDriverOffer(
  taskId: string,
  reason?: string | null,
): Promise<ForwardedDriverActionResponse> {
  const trimmedReason = reason?.trim() ? reason.trim() : null;
  try {
    return await getDriverClient().rejectForwardedOrder(taskId, {
      reason: trimmedReason,
    });
  } catch (error) {
    await recoverDriverSessionFromApiError(error);
    throw error;
  }
}

export async function submitDriverTaskCompletion(
  taskId: string,
  command: DriverCompleteTaskCommand,
): Promise<DriverTaskRecord> {
  const now = new Date().toISOString();
  await persistPendingDriverTaskCompletion({
    taskId,
    requestId: createLocalId("driver-task-complete"),
    command,
    createdAt: now,
    updatedAt: now,
  });

  const task = await replayPendingDriverTaskCompletion();
  if (!task) {
    throw new Error(
      "Pending driver task completion disappeared before replay.",
    );
  }

  return task;
}

function createDriverClientProxy(): ApiClient {
  return new Proxy({} as ApiClient, {
    get(_target, prop, _receiver) {
      if (!client) {
        throw new Error(
          "Driver identity is not provisioned. Complete device registration or " +
            "set EXPO_PUBLIC_DRIVER_ID for explicit development override.",
        );
      }

      const value = (client as any)[prop];
      if (typeof value !== "function") {
        return value;
      }

      return async function (...args: any[]) {
        // 1. Initial invocation
        try {
          if (!client) {
            throw new Error(
              "Driver identity is not provisioned. Complete device registration or " +
                "set EXPO_PUBLIC_DRIVER_ID for explicit development override.",
            );
          }
          const currentMethod = (client as any)[prop];
          return await currentMethod.apply(client, args);
        } catch (error) {
          // If 403 Forbidden: never refresh, never logout, surface permission error
          if (isForbidden403Error(error)) {
            throw error;
          }

          // If 401 Unauthorized: single-flight refresh and retry once
          if (isUnauthorized401Error(error)) {
            if (DEV_DRIVER_ID && !provisionedSession) {
              throw error;
            }

            // Trigger or join single-flight refresh
            await refreshDriverSessionSingleFlight();

            // Retry once with new token
            try {
              if (!client) {
                throw new Error(
                  "Driver identity is not provisioned. Complete device registration or " +
                    "set EXPO_PUBLIC_DRIVER_ID for explicit development override.",
                );
              }
              const retryMethod = (client as any)[prop];
              return await retryMethod.apply(client, args);
            } catch (retryError) {
              // Second 401: clear session, logout, set issue
              if (isUnauthorized401Error(retryError)) {
                setDriverIdentityIssue(getDriverIdentityIssueMessage(retryError));
                await clearStoredSession();
              }
              throw retryError;
            }
          }

          throw error;
        }
      };
    },
  });
}

export function getDriverClient(): ApiClient {
  if (!client) {
    throw new Error(
      "Driver identity is not provisioned. Complete device registration or " +
        "set EXPO_PUBLIC_DRIVER_ID for explicit development override.",
    );
  }
  if (!driverClientProxy) {
    driverClientProxy = createDriverClientProxy();
  }
  return driverClientProxy;
}

export function getDriverId(): string {
  if (DEV_DRIVER_ID) {
    return DEV_DRIVER_ID;
  }
  if (provisionedSession?.driverId) {
    return provisionedSession.driverId;
  }

  throw new Error(
    "Driver identity is not provisioned. Complete the device provisioning flow.",
  );
}

export { API_URL };


/**
 * Driver App API client factory.
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
import type { DriverDeviceProvisioningSession } from "@drts/contracts";

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

const publicClient = createPublicClient(API_URL);

let client: ApiClient | null = null;
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
let provisionedSession: DriverDeviceProvisioningSession | null = null;
let driverIdentityIssue: string | null = null;

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

function parseApiError(error: unknown): {
  status: number | null;
  code: string | null;
  message: string | null;
} {
  const fallback =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : null;
  if (!(error instanceof Error)) {
    return {
      status: null,
      code: null,
      message: fallback,
    };
  }

  const apiMatch = /^API error (\d+):\s*(.*)$/s.exec(error.message);
  if (!apiMatch) {
    return {
      status: null,
      code: null,
      message: fallback,
    };
  }

  const [, statusText, payloadText] = apiMatch;
  let code: string | null = null;
  let message: string | null = null;

  try {
    const payload = JSON.parse(payloadText) as {
      error?: { code?: string; message?: string };
    };
    code = payload.error?.code ?? null;
    message = payload.error?.message ?? null;
  } catch {
    message = payloadText.trim() || null;
  }

  return {
    status: Number.parseInt(statusText, 10),
    code,
    message: message ?? fallback,
  };
}

function isDriverSessionAuthFailure(error: unknown): boolean {
  const parsed = parseApiError(error);
  if (parsed.code) {
    return (
      parsed.code === "DRIVER_DEVICE_REFRESH_INVALID" ||
      parsed.code === "DRIVER_AUTH_SUSPENDED" ||
      parsed.code === "DRIVER_AUTH_REVOKED" ||
      parsed.code === "DRIVER_CERT_INVALID" ||
      parsed.code === "DRIVER_DEVICE_SESSION_INVALID" ||
      parsed.code === "JWT_INVALID"
    );
  }

  return parsed.status === 401 || parsed.status === 403;
}

function getDriverIdentityIssueMessage(error: unknown): string {
  const parsed = parseApiError(error);
  switch (parsed.code) {
    case "DRIVER_DEVICE_REFRESH_INVALID":
    case "DRIVER_DEVICE_SESSION_INVALID":
      return "此裝置的司機綁定已失效或被撤銷，請重新輸入註冊碼綁定。";
    case "DRIVER_AUTH_SUSPENDED":
      return "此司機帳號已被停權，暫時無法刷新裝置登入。";
    case "DRIVER_AUTH_REVOKED":
      return "此司機帳號已退役或撤銷，請聯絡平台管理員。";
    case "DRIVER_CERT_INVALID":
      return "司機證件狀態無效，請聯絡平台管理員重新啟用。";
    default:
      return parsed.message ?? "裝置登入已失效，請重新註冊。";
  }
}

export function getDriverIdentityIssue(): string | null {
  return driverIdentityIssue;
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

async function clearStoredSession() {
  provisionedSession = null;
  await SecureStore.deleteItemAsync(DRIVER_SESSION_KEY);
  applySession(null);
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

    try {
      applySession(storedSession);
      const refreshedSession = await publicClient.refreshDriverDeviceSession({
        refreshToken: storedSession.refreshToken,
        deviceId: storedSession.deviceId,
      });
      setDriverIdentityIssue(null);
      await persistSession(refreshedSession);
    } catch (error) {
      if (isDriverSessionAuthFailure(error)) {
        setDriverIdentityIssue(getDriverIdentityIssueMessage(error));
        await clearStoredSession();
      } else {
        applySession(provisionedSession);
      }
    }

    hydrated = true;
  })().finally(() => {
    hydrationPromise = null;
  });

  return hydrationPromise;
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

export async function clearDriverProvisioning(): Promise<void> {
  setDriverIdentityIssue(null);
  await clearStoredSession();
  hydrated = true;
}

export async function revokeDriverDeviceBinding(): Promise<void> {
  if (DEV_DRIVER_ID || !provisionedSession) {
    return;
  }

  try {
    const session = provisionedSession;
    const bearerClient = createDriverBearerClient(API_URL, session.accessToken);
    await bearerClient.revokeDriverDeviceBinding({
      bindingId: session.bindingId,
      deviceId: session.deviceId,
    });
  } finally {
    setDriverIdentityIssue(null);
    await clearStoredSession();
    hydrated = true;
  }
}

export function getDriverClient(): ApiClient {
  if (!client) {
    throw new Error(
      "Driver identity is not provisioned. Complete device registration or " +
        "set EXPO_PUBLIC_DRIVER_ID for explicit development override.",
    );
  }
  return client;
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

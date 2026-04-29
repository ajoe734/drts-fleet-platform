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
  if (hydrated) {
    return;
  }
  if (hydrationPromise) {
    return hydrationPromise;
  }

  hydrationPromise = (async () => {
    if (DEV_DRIVER_ID) {
      applySession(null);
      hydrated = true;
      return;
    }

    const storedSessionJson =
      await SecureStore.getItemAsync(DRIVER_SESSION_KEY);
    if (!storedSessionJson) {
      applySession(null);
      hydrated = true;
      return;
    }

    try {
      const storedSession = JSON.parse(
        storedSessionJson,
      ) as DriverDeviceProvisioningSession;
      const refreshedSession = await publicClient.refreshDriverDeviceSession({
        refreshToken: storedSession.refreshToken,
        deviceId: storedSession.deviceId,
      });
      await persistSession(refreshedSession);
    } catch {
      await clearStoredSession();
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
  await persistSession(session);
  hydrated = true;
  return session;
}

export async function clearDriverProvisioning(): Promise<void> {
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

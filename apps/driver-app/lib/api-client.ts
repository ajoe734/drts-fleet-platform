/**
 * Driver App API client factory.
 *
 * Uses the shared @drts/api-client with driver realm auth headers.
 * In React Native, fetch is available natively.
 *
 * Driver identity must be explicitly provisioned. There is no silent demo
 * fallback. Provide identity via:
 *   - EXPO_PUBLIC_DRIVER_ID env var (local dev / internal builds)
 *   - EXPO_PUBLIC_DRIVER_ACTOR_ID env var (legacy alias)
 *   - expo config extra.driverActorId (dev-only app.json override)
 *
 * Production path: replace DRIVER_ID with a device-bound auth token from the
 * backend identity handoff flow (see runbook §Production Identity Handoff).
 *
 * If no identity is configured, isDriverIdentityProvisioned() returns false
 * and the app surfaces a provisioning screen instead of binding a demo actor.
 */

import Constants from "expo-constants";
import { createDriverClient, ApiClient } from "@drts/api-client";

type DriverExpoExtra = {
  apiBaseUrl?: string;
  driverActorId?: string;
};

const expoExtra = (Constants.expoConfig?.extra ?? {}) as DriverExpoExtra;
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  expoExtra.apiBaseUrl ??
  "https://drts-api-kdhu6wzufa-uc.a.run.app";

// Driver identity must be provisioned explicitly — no silent demo fallback.
const DRIVER_ID: string | undefined =
  process.env.EXPO_PUBLIC_DRIVER_ID ??
  process.env.EXPO_PUBLIC_DRIVER_ACTOR_ID ??
  expoExtra.driverActorId;

/** Returns true only when a driver identity is explicitly configured. */
export function isDriverIdentityProvisioned(): boolean {
  return Boolean(DRIVER_ID);
}

let _client: ApiClient | null = null;

export function getDriverClient(): ApiClient {
  if (!_client) {
    if (!DRIVER_ID) {
      throw new Error(
        "Driver identity is not provisioned. Set EXPO_PUBLIC_DRIVER_ID or " +
          "complete the device provisioning flow before using the API client.",
      );
    }
    _client = createDriverClient(API_URL, DRIVER_ID);
  }
  return _client;
}

export function getDriverId(): string {
  if (!DRIVER_ID) {
    throw new Error(
      "Driver identity is not provisioned. Set EXPO_PUBLIC_DRIVER_ID or " +
        "complete the device provisioning flow.",
    );
  }
  return DRIVER_ID;
}

export { API_URL };

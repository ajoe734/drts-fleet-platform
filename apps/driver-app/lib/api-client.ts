/**
 * Driver App API client factory.
 *
 * Uses the shared @drts/api-client with driver realm auth headers.
 * In React Native, fetch is available natively.
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
const DRIVER_ID =
  process.env.EXPO_PUBLIC_DRIVER_ID ??
  process.env.EXPO_PUBLIC_DRIVER_ACTOR_ID ??
  expoExtra.driverActorId ??
  "driver-demo-001";

let _client: ApiClient | null = null;

export function getDriverClient(): ApiClient {
  if (!_client) {
    _client = createDriverClient(API_URL, DRIVER_ID);
  }
  return _client;
}

export function getDriverId(): string {
  return DRIVER_ID;
}

export { API_URL };

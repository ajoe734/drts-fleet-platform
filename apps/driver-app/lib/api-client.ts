/**
 * Driver App API client factory.
 *
 * Uses the shared @drts/api-client with driver realm auth headers.
 * In React Native, fetch is available natively.
 */

import { createDriverClient, ApiClient } from "@drts/api-client";

// In Expo, we can use expo-constants for runtime config; default to localhost for dev.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
const DEMO_DRIVER_ID = "driver-demo-001";

let _client: ApiClient | null = null;

export function getDriverClient(): ApiClient {
  if (!_client) {
    _client = createDriverClient(API_URL, DEMO_DRIVER_ID);
  }
  return _client;
}

export { API_URL };

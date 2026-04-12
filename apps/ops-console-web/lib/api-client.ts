/**
 * Ops Console API client factory.
 */

import { createOpsClient, ApiClient } from "@drts/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const DEMO_ACTOR_ID = "demo-ops-user";

let _client: ApiClient | null = null;

export function getOpsClient(): ApiClient {
  if (!_client) {
    _client = createOpsClient(API_URL, DEMO_ACTOR_ID);
  }
  return _client;
}

export { API_URL };

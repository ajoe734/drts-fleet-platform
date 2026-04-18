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

export function createOpsDispatchEventSource(): EventSource {
  const url = new URL("/api/ops/dispatch-events", API_URL);
  url.searchParams.set("actorType", "ops_user");
  url.searchParams.set("actorId", DEMO_ACTOR_ID);
  url.searchParams.set("realm", "ops");
  return new EventSource(url.toString());
}

export { API_URL };

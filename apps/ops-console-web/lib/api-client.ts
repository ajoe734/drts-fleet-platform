/**
 * Ops Console API client factory.
 */

import { createOpsClient, ApiClient } from "@drts/api-client";
import { getRuntimeApiBaseUrl } from "./runtime-config";

const DEMO_ACTOR_ID = "demo-ops-user";

const clientCache = new Map<string, ApiClient>();

export function getOpsClient(): ApiClient {
  const apiUrl = getRuntimeApiBaseUrl();
  const cachedClient = clientCache.get(apiUrl);
  if (cachedClient) {
    return cachedClient;
  }

  const client = createOpsClient(apiUrl, DEMO_ACTOR_ID);
  clientCache.set(apiUrl, client);
  return client;
}

export function createOpsDispatchEventSource(): EventSource {
  const url = new URL("/api/ops/dispatch-events", getRuntimeApiBaseUrl());
  url.searchParams.set("actorType", "ops_user");
  url.searchParams.set("actorId", DEMO_ACTOR_ID);
  url.searchParams.set("realm", "ops");
  return new EventSource(url.toString());
}

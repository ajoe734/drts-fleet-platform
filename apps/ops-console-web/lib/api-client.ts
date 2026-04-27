/**
 * Ops Console API client factory.
 */

import { ApiClient } from "@drts/api-client";
import { getRuntimeApiBaseUrl } from "./runtime-config";

const DEMO_ACTOR_ID = "demo-ops-user";

const clientCache = new Map<string, ApiClient>();

function rewriteControlPlaneProxyPath(baseUrl: string, path: string): string {
  if (!baseUrl.startsWith("/control-plane-proxy")) {
    return path;
  }

  return path.replace(/^\/api(?=\/|$)/, "") || "/";
}

function createOpsBootstrapClient(apiUrl: string): ApiClient {
  return new ApiClient({
    baseUrl: apiUrl,
    defaultHeaders: {
      "x-actor-type": "ops_user",
      "x-actor-id": DEMO_ACTOR_ID,
      "x-realm": "ops",
    },
    pathTransform: (path) => rewriteControlPlaneProxyPath(apiUrl, path),
  });
}

export function getOpsClient(): ApiClient {
  const apiUrl = getRuntimeApiBaseUrl();
  const cachedClient = clientCache.get(apiUrl);
  if (cachedClient) {
    return cachedClient;
  }

  const client = apiUrl.startsWith("/control-plane-proxy")
    ? new ApiClient({
        baseUrl: apiUrl,
        pathTransform: (path) => rewriteControlPlaneProxyPath(apiUrl, path),
      })
    : createOpsBootstrapClient(apiUrl);
  clientCache.set(apiUrl, client);
  return client;
}

export function createOpsDispatchEventSource(): EventSource {
  const apiUrl = getRuntimeApiBaseUrl();
  const requestPath = rewriteControlPlaneProxyPath(
    apiUrl,
    "/api/ops/dispatch-events",
  );
  const url = apiUrl.startsWith("/control-plane-proxy")
    ? new URL(
        `${apiUrl.replace(/\/$/, "")}${requestPath}`,
        window.location.origin,
      )
    : new URL(
        requestPath,
        apiUrl.startsWith("http") ? apiUrl : window.location.origin,
      );
  if (!apiUrl.startsWith("/control-plane-proxy")) {
    url.searchParams.set("actorType", "ops_user");
    url.searchParams.set("actorId", DEMO_ACTOR_ID);
    url.searchParams.set("realm", "ops");
  }
  return new EventSource(url.toString());
}

/**
 * ROC Console API client factory.
 *
 * Mirrors the Ops Console client: in the browser, requests default to the
 * `/control-plane-proxy` Next route (which mints upstream control-plane auth);
 * server-side / direct calls carry the ROC realm + actor headers so the API
 * resolves the `roc` control-plane realm.
 */

import { ApiClient } from "@drts/api-client";
import { getRuntimeApiBaseUrl } from "./runtime-config";

const DEMO_ACTOR_ID = "demo-roc-duty";

const clientCache = new Map<string, ApiClient>();

function rewriteControlPlaneProxyPath(baseUrl: string, path: string): string {
  if (!baseUrl.startsWith("/control-plane-proxy")) {
    return path;
  }

  return path.replace(/^\/api(?=\/|$)/, "") || "/";
}

function createRocBootstrapClient(apiUrl: string): ApiClient {
  return new ApiClient({
    baseUrl: apiUrl,
    defaultHeaders: {
      "x-actor-type": "ops_user",
      "x-actor-id": DEMO_ACTOR_ID,
      "x-realm": "roc",
    },
    pathTransform: (path) => rewriteControlPlaneProxyPath(apiUrl, path),
  });
}

export function getRocClient(): ApiClient {
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
    : createRocBootstrapClient(apiUrl);
  clientCache.set(apiUrl, client);
  return client;
}

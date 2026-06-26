/**
 * ROC Console API client factory.
 *
 * Mirrors the Ops Console client: in the browser, requests default to the
 * `/control-plane-proxy` Next route (which mints upstream control-plane auth);
 * server-side / direct calls carry bootstrap actor headers.
 *
 * Realm note: the merged ROC backend (P2-ROC-001) guards `@Controller("roc")`
 * with `@RequireRealms("system", "ops")` and `auth.policy` maps the `roc/*`
 * routes to `baseAllowedRealms("ops")`. There is intentionally NO separate
 * `roc` auth realm — decision packet §C2 rejects a new console/auth realm and
 * §10.3 keeps the existing controller prefix/authority. ROC duty staff therefore
 * authenticate as an `ops_user` in the `ops` realm; the ROC-specific actor id
 * keeps audit attribution distinct from the generic Ops Console operator.
 */

import { ApiClient } from "@drts/api-client";
import { getRuntimeApiBaseUrl } from "./runtime-config";

const ROC_DUTY_ACTOR_ID = "roc-duty-operator";

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
      "x-actor-id": ROC_DUTY_ACTOR_ID,
      "x-realm": "ops",
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

import { ApiClient, createPlatformAdminClient } from "@drts/api-client";
import { PLATFORM_ADMIN_BOOTSTRAP_ACTOR_ID } from "./platform-admin-identity";
import { getRuntimePlatformAdminActorId } from "./runtime-config";

const clientCache = new Map<string, ApiClient>();

function rewriteControlPlaneProxyPath(baseUrl: string, path: string): string {
  if (!baseUrl.startsWith("/control-plane-proxy")) {
    return path;
  }

  return path.replace(/^\/api(?=\/|$)/, "") || "/";
}

function resolveClientCacheKey(apiBaseUrl: string, actorId: string): string {
  if (apiBaseUrl.startsWith("/control-plane-proxy")) {
    return apiBaseUrl;
  }

  return `${apiBaseUrl}::${actorId}`;
}

export function getPlatformAdminClient(
  apiBaseUrl: string,
  actorId = getRuntimePlatformAdminActorId(),
): ApiClient {
  const resolvedActorId = actorId || PLATFORM_ADMIN_BOOTSTRAP_ACTOR_ID;
  const cacheKey = resolveClientCacheKey(apiBaseUrl, resolvedActorId);
  const cachedClient = clientCache.get(cacheKey);
  if (cachedClient) {
    return cachedClient;
  }

  const client = apiBaseUrl.startsWith("/control-plane-proxy")
    ? new ApiClient({
        baseUrl: apiBaseUrl,
        pathTransform: (path) => rewriteControlPlaneProxyPath(apiBaseUrl, path),
      })
    : createPlatformAdminClient(apiBaseUrl, resolvedActorId, {
        pathTransform: (path) => rewriteControlPlaneProxyPath(apiBaseUrl, path),
      });
  clientCache.set(cacheKey, client);
  return client;
}

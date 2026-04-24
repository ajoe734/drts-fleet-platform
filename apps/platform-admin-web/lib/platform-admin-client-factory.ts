import { ApiClient, createPlatformAdminClient } from "@drts/api-client";

const ACTOR_ID = "platform-admin-web-bootstrap";
const clientCache = new Map<string, ApiClient>();

function rewriteControlPlaneProxyPath(baseUrl: string, path: string): string {
  if (!baseUrl.startsWith("/control-plane-proxy")) {
    return path;
  }

  return path.replace(/^\/api(?=\/|$)/, "") || "/";
}

export function getPlatformAdminClient(apiBaseUrl: string): ApiClient {
  const cachedClient = clientCache.get(apiBaseUrl);
  if (cachedClient) {
    return cachedClient;
  }

  const client = createPlatformAdminClient(apiBaseUrl, ACTOR_ID, {
    pathTransform: (path) => rewriteControlPlaneProxyPath(apiBaseUrl, path),
  });
  clientCache.set(apiBaseUrl, client);
  return client;
}

import { ApiClient, createTenantClient } from "@drts/api-client";
import { getServerApiBaseUrl } from "./runtime-config";

const API_URL = getServerApiBaseUrl();
const DEFAULT_TENANT_ID = "tenant-demo-001";
const DEMO_ACTOR_ID = "demo-tenant-user";

function resolveTenantId() {
  return (
    process.env.DRTS_TENANT_CONSOLE_TENANT_ID?.trim() ||
    process.env.DRTS_TENANT_ID?.trim() ||
    DEFAULT_TENANT_ID
  );
}

const DEMO_TENANT_ID = resolveTenantId();

let client: ApiClient | null = null;

export function getTenantClient(): ApiClient {
  if (!client) {
    client = createTenantClient(API_URL, DEMO_TENANT_ID, DEMO_ACTOR_ID);
  }

  return client;
}

export { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID };

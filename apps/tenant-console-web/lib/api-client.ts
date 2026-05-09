import { ApiClient, createTenantClient } from "@drts/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const DEMO_TENANT_ID = "tenant-demo-001";
const DEMO_ACTOR_ID = "demo-tenant-user";

let client: ApiClient | null = null;

export function getTenantClient(): ApiClient {
  if (!client) {
    client = createTenantClient(API_URL, DEMO_TENANT_ID, DEMO_ACTOR_ID);
  }

  return client;
}

export { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID };

import { ApiClient, createTenantClient } from "@drts/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const TENANT_CONSOLE_URL =
  process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "http://localhost:3004";
const OPS_CONSOLE_URL =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";
const PLATFORM_ADMIN_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002";
const DEMO_TENANT_ID = "tenant-demo-001";
const DEMO_ACTOR_ID = "demo-tenant-user";

let client: ApiClient | null = null;

export function getTenantClient(): ApiClient {
  if (!client) {
    client = createTenantClient(API_URL, DEMO_TENANT_ID, DEMO_ACTOR_ID);
  }

  return client;
}

export {
  API_URL,
  DEMO_ACTOR_ID,
  DEMO_TENANT_ID,
  OPS_CONSOLE_URL,
  PLATFORM_ADMIN_URL,
  TENANT_CONSOLE_URL,
};

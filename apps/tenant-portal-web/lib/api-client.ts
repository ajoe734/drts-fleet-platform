/**
 * Tenant Portal API client factory.
 *
 * Reads NEXT_PUBLIC_API_URL from environment (defaults to http://localhost:3001).
 * Uses Bootstrap Auth headers with tenant realm.
 */

import { createTenantClient, ApiClient } from "@drts/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const DEMO_TENANT_ID = "tenant-demo";
const DEMO_ACTOR_ID = "demo-tenant-user";

let _client: ApiClient | null = null;

export function getTenantClient(): ApiClient {
  if (!_client) {
    _client = createTenantClient(API_URL, DEMO_TENANT_ID, DEMO_ACTOR_ID);
  }
  return _client;
}

export { API_URL };

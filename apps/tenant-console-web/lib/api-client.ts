import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiClient, createTenantBearerClient } from "@drts/api-client";
import { getServerApiBaseUrl } from "./runtime-config";
import {
  TENANT_SESSION_COOKIE_NAME,
  TENANT_LOGIN_PATH,
} from "./auth/constants";

export const API_URL = getServerApiBaseUrl();
const DEFAULT_TENANT_ID = "10000000-0000-0000-0000-000000000201";

export interface TenantSessionContext {
  accessToken: string;
}

export async function getTenantSession(): Promise<TenantSessionContext | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(TENANT_SESSION_COOKIE_NAME)?.value?.trim();
    if (!token) {
      return null;
    }
    return { accessToken: token };
  } catch {
    return null;
  }
}

export function createTenantBearerClientFromToken(
  accessToken: string,
): ApiClient {
  const tenantId =
    process.env.DRTS_TENANT_CONSOLE_TENANT_ID?.trim() || DEFAULT_TENANT_ID;
  return createTenantBearerClient(API_URL, accessToken, tenantId);
}

export async function getTenantClient(): Promise<ApiClient> {
  const session = await getTenantSession();
  if (!session) {
    redirect(TENANT_LOGIN_PATH);
  }
  return createTenantBearerClientFromToken(session.accessToken);
}

export async function getTenantClientForRouteHandler(): Promise<ApiClient | null> {
  const session = await getTenantSession();
  if (!session) {
    return null;
  }
  return createTenantBearerClientFromToken(session.accessToken);
}

export { createBrowserApiClient } from "./browser-api-client";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiClient, createTenantBearerClient } from "@drts/api-client";
import { getServerApiBaseUrl } from "./runtime-config";
import {
  TENANT_SESSION_COOKIE_NAME,
  TENANT_LOGIN_PATH,
} from "./auth/constants";
import {
  type VerifiedTenantSession,
  verifyTenantSession,
} from "./auth/verified-tenant-session.server";

export const API_URL = getServerApiBaseUrl();

export async function getTenantSession(): Promise<VerifiedTenantSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(TENANT_SESSION_COOKIE_NAME)?.value?.trim();
    if (!token) {
      return null;
    }
    return (await verifyTenantSession(token, API_URL)).session;
  } catch {
    return null;
  }
}

export function createTenantBearerClientFromSession(
  session: VerifiedTenantSession,
): ApiClient {
  return createTenantBearerClient(
    API_URL,
    session.accessToken,
    session.tenantId,
  );
}

export async function getTenantClient(): Promise<ApiClient> {
  const session = await getTenantSession();
  if (!session) {
    redirect(TENANT_LOGIN_PATH);
  }
  return createTenantBearerClientFromSession(session);
}

export async function getTenantClientForRouteHandler(): Promise<ApiClient | null> {
  const session = await getTenantSession();
  if (!session) {
    return null;
  }
  return createTenantBearerClientFromSession(session);
}

export { createBrowserApiClient } from "./browser-api-client";

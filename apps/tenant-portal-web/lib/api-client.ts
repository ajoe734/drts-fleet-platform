import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type {
  CreateTenantBootstrapSessionCommand,
  TenantBootstrapSession,
} from "@drts/contracts";
import {
  type ApiClient,
  createPublicClient,
  createTenantBearerClient,
} from "@drts/api-client";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
export const TENANT_PORTAL_LOGIN_PATH = "/login";

const TENANT_PORTAL_SESSION_COOKIE = "tenant-portal-session";

type TenantPortalSessionCookie = {
  accessToken: string;
  tenantId: string;
  email: string;
  fullName: string;
  roleCode: string;
};

function encodeSessionCookie(session: TenantPortalSessionCookie) {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

function decodeSessionCookie(value: string): TenantPortalSessionCookie | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<TenantPortalSessionCookie>;

    if (
      !parsed.accessToken ||
      !parsed.tenantId ||
      !parsed.email ||
      !parsed.fullName ||
      !parsed.roleCode
    ) {
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      tenantId: parsed.tenantId,
      email: parsed.email,
      fullName: parsed.fullName,
      roleCode: parsed.roleCode,
    };
  } catch {
    return null;
  }
}

function buildTenantClient(session: TenantPortalSessionCookie): ApiClient {
  return createTenantBearerClient(
    API_URL,
    session.accessToken,
    session.tenantId,
  );
}

export async function getTenantPortalSession(): Promise<TenantPortalSessionCookie | null> {
  const cookieStore = await cookies();
  const encoded = cookieStore.get(TENANT_PORTAL_SESSION_COOKIE)?.value;
  if (!encoded) {
    return null;
  }

  return decodeSessionCookie(encoded);
}

export async function getTenantClient(): Promise<ApiClient> {
  const session = await getTenantPortalSession();
  if (!session) {
    redirect(TENANT_PORTAL_LOGIN_PATH);
  }

  return buildTenantClient(session);
}

export async function getTenantClientForRouteHandler(): Promise<ApiClient | null> {
  const session = await getTenantPortalSession();
  return session ? buildTenantClient(session) : null;
}

export async function createTenantPortalSession(
  command: CreateTenantBootstrapSessionCommand,
): Promise<TenantBootstrapSession> {
  const client = createPublicClient(API_URL);
  const session = await client.createTenantBootstrapSession(command);
  const cookieStore = await cookies();

  cookieStore.set(
    TENANT_PORTAL_SESSION_COOKIE,
    encodeSessionCookie({
      accessToken: session.accessToken,
      tenantId: session.profile.tenantId,
      email: session.profile.email,
      fullName: session.profile.fullName,
      roleCode: session.profile.roleCode,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 8 * 60 * 60,
    },
  );

  return session;
}

export async function clearTenantPortalSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(TENANT_PORTAL_SESSION_COOKIE);
}

import "server-only";

import { cookies } from "next/headers";
import { TENANT_SESSION_COOKIE_NAME } from "@drts/tenant-auth/constants";
import {
  resolveTenantApiUrl,
  tenantAuthFetch,
} from "@drts/tenant-auth/api-fetch";
import { verifyTenantSession } from "@drts/tenant-auth/verified-tenant-session.server";
import { bankUserDisplayRole, normalizeBankUserKeys } from "./users-data";

export class BankUserApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super("Bank user request failed.");
  }
}

export function bankUserError(
  status: number,
  code: string,
  message: string,
): never {
  throw new BankUserApiError(status, { error: { code, message } });
}

export type BankUserIdentity = {
  accessToken: string;
  tenantId: string;
  userId: string;
  roleCodes: string[];
  scopes: string[];
  displayRole: ReturnType<typeof bankUserDisplayRole>;
};

export async function getBankUserIdentity(
  accessToken?: string,
): Promise<BankUserIdentity> {
  const token =
    accessToken ?? (await cookies()).get(TENANT_SESSION_COOKIE_NAME)?.value;
  if (!token)
    bankUserError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Sign in with your tenant account.",
    );
  const verified = await verifyTenantSession(token, resolveTenantApiUrl());
  if (!verified.session) {
    if (!verified.response.ok)
      throw new BankUserApiError(verified.response.status, verified.body);
    bankUserError(
      401,
      "AUTHENTICATION_REQUIRED",
      "An active tenant session is required.",
    );
  }
  const payload = normalizeBankUserKeys(verified.body) as {
    data?: {
      identity?: { actorId?: unknown; roles?: unknown; scopes?: unknown };
    };
  };
  const identity = payload?.data?.identity;
  if (
    typeof identity?.actorId !== "string" ||
    !identity.actorId.trim() ||
    !Array.isArray(identity.roles) ||
    !identity.roles.every((role): role is string => typeof role === "string") ||
    !Array.isArray(identity.scopes) ||
    !identity.scopes.every(
      (scope): scope is string => typeof scope === "string",
    )
  ) {
    bankUserError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Invalid tenant identity response.",
    );
  }
  return {
    accessToken: token,
    tenantId: verified.session.tenantId,
    userId: identity.actorId,
    roleCodes: identity.roles,
    scopes: identity.scopes,
    displayRole: bankUserDisplayRole(identity.roles[0] ?? ""),
  };
}

export function canManageBankUsers(identity: BankUserIdentity): boolean {
  return identity.scopes.includes("tenant:write");
}

export async function bankUserApi<T>(
  identity: BankUserIdentity,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await tenantAuthFetch(`${resolveTenantApiUrl()}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${identity.accessToken}`,
      "x-tenant-id": identity.tenantId,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const envelope = await response.json().catch(() => null);
  if (!response.ok) throw new BankUserApiError(response.status, envelope);
  if (!envelope || !("data" in envelope))
    bankUserError(
      502,
      "BANK_USERS_INVALID_RESPONSE",
      "Invalid user API response.",
    );
  return normalizeBankUserKeys(envelope.data) as T;
}

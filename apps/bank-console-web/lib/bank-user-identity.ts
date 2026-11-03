import "server-only";

import { cookies } from "next/headers";
import { TENANT_SESSION_COOKIE_NAME } from "@drts/tenant-auth/constants";
import {
  resolveTenantApiUrl,
  tenantAuthFetch,
} from "@drts/tenant-auth/api-fetch";
import { verifyTenantSession } from "@drts/tenant-auth/verified-tenant-session.server";
import { BANK_DEMO_TENANTS } from "./demo-tenants";
import { verifySessionRole } from "./session";
import { bankUserDisplayRole, normalizeBankUserKeys } from "./users-data";

export const BANK_CANONICAL_TENANT_ROLES = [
  "tenant_admin",
  "tenant_ops_admin",
  "tenant_finance_admin",
  "tenant_viewer",
] as const;

export type BankCanonicalTenantRole =
  (typeof BANK_CANONICAL_TENANT_ROLES)[number];

export function isBankCanonicalTenantRole(
  role: unknown,
): role is BankCanonicalTenantRole {
  return (
    typeof role === "string" &&
    (BANK_CANONICAL_TENANT_ROLES as readonly string[]).includes(role)
  );
}

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
  displayRoles?: Array<ReturnType<typeof bankUserDisplayRole>>;
};

export function classifyBankDisplayRoles(roleCodes: readonly unknown[]): {
  displayRole: ReturnType<typeof bankUserDisplayRole>;
  displayRoles: Array<ReturnType<typeof bankUserDisplayRole>>;
} {
  if (
    !Array.isArray(roleCodes) ||
    roleCodes.length === 0 ||
    !roleCodes.every(isBankCanonicalTenantRole)
  ) {
    bankUserError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Invalid tenant identity response.",
    );
  }
  const displayRoles = Array.from(
    new Set(roleCodes.map((role) => bankUserDisplayRole(role))),
  );
  return {
    displayRole: displayRoles[0]!,
    displayRoles,
  };
}

export function projectBankSessionReadback(
  upstreamBody: unknown,
  options?: {
    signedRoleCookie?: string | undefined;
    signedSessionCookie?: string | undefined;
    signedOutCookie?: string | undefined;
  },
): Record<string, unknown> {
  if (options?.signedOutCookie === "1") {
    bankUserError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Bank console session is signed out.",
    );
  }
  if (
    !upstreamBody ||
    typeof upstreamBody !== "object" ||
    Array.isArray(upstreamBody)
  ) {
    bankUserError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Invalid tenant identity response.",
    );
  }
  const root = upstreamBody as Record<string, unknown>;
  const data = root.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    bankUserError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Invalid tenant identity response.",
    );
  }
  const dataRecord = data as Record<string, unknown>;
  if ("active" in dataRecord && dataRecord.active !== true) {
    bankUserError(
      401,
      "AUTHENTICATION_REQUIRED",
      "An active tenant session is required.",
    );
  }
  const rawIdentity = dataRecord.identity;
  if (
    !rawIdentity ||
    typeof rawIdentity !== "object" ||
    Array.isArray(rawIdentity)
  ) {
    bankUserError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Invalid tenant identity response.",
    );
  }
  const identityRecord = rawIdentity as Record<string, unknown>;
  const actorId = identityRecord.actor_id ?? identityRecord.actorId;
  const tenantId = identityRecord.tenant_id ?? identityRecord.tenantId;
  const realm = identityRecord.realm;
  const actorType = identityRecord.actor_type ?? identityRecord.actorType;
  const roles = identityRecord.roles;
  const scopes = identityRecord.scopes;

  if (
    typeof actorId !== "string" ||
    !actorId.trim() ||
    typeof tenantId !== "string" ||
    !tenantId.trim() ||
    (realm !== undefined && realm !== "tenant") ||
    (actorType !== undefined && actorType !== "tenant_admin") ||
    !Array.isArray(roles) ||
    (scopes !== undefined &&
      (!Array.isArray(scopes) ||
        !scopes.every((scope): scope is string => typeof scope === "string")))
  ) {
    bankUserError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Invalid tenant identity response.",
    );
  }

  const { displayRole, displayRoles } = classifyBankDisplayRoles(roles);
  let effectiveDisplayRole = displayRole;

  const hasRoleCookie = Boolean(options?.signedRoleCookie);
  const hasSessionCookie = Boolean(options?.signedSessionCookie);
  // A tenant-auth session without a Bank UI session remains a valid tenant
  // session, but must not claim a selected Bank UI role. Partial cookies fail.
  if (!hasRoleCookie && !hasSessionCookie) return root;
  if (hasRoleCookie !== hasSessionCookie) {
    bankUserError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Incomplete bank console session.",
    );
  }
  if (hasRoleCookie && hasSessionCookie) {
    const verifiedRoleCookie = hasRoleCookie
      ? verifySessionRole(options?.signedRoleCookie)
      : null;
    const verifiedSessionCookie = hasSessionCookie
      ? verifySessionRole(options?.signedSessionCookie)
      : null;
    if (
      (hasRoleCookie && !verifiedRoleCookie) ||
      (hasSessionCookie && !verifiedSessionCookie)
    ) {
      bankUserError(
        401,
        "AUTHENTICATION_REQUIRED",
        "Invalid bank console session cookie signature.",
      );
    }
    if (
      verifiedRoleCookie &&
      verifiedSessionCookie &&
      (verifiedRoleCookie.role !== verifiedSessionCookie.role ||
        verifiedRoleCookie.bankCode !== verifiedSessionCookie.bankCode)
    ) {
      bankUserError(
        401,
        "AUTHENTICATION_REQUIRED",
        "Mismatched bank console session cookies.",
      );
    }
    const verifiedCookie = (verifiedSessionCookie ?? verifiedRoleCookie)!;
    if (!displayRoles.includes(verifiedCookie.role)) {
      bankUserError(
        403,
        "ROLE_MISMATCH",
        "Bank console cookie role does not match canonical tenant role claims.",
      );
    }
    const expectedDemoTenant = Object.values(BANK_DEMO_TENANTS).find(
      (tenant) => tenant.tenantId === tenantId,
    );
    if (!expectedDemoTenant) {
      // The Bank cookie carries a demo branding code, not a canonical tenant
      // binding. Preserve the verified tenant's own session response without
      // claiming a selected Bank role for an unmapped real tenant. The GUX
      // reader may classify a unique UI role from canonical tenant claims.
      return root;
    }
    if (verifiedCookie.bankCode !== expectedDemoTenant.code) {
      bankUserError(
        403,
        "TENANT_MISMATCH",
        "Bank console cookie bank does not match canonical tenant identity.",
      );
    }
    effectiveDisplayRole = verifiedCookie.role;
  }

  return {
    ...root,
    data: {
      ...dataRecord,
      identity: {
        ...identityRecord,
        actor_id: actorId,
        tenant_id: tenantId,
        roles: [...(roles as string[])],
        display_role: effectiveDisplayRole,
        display_roles: displayRoles,
      },
    },
  };
}

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
  const { displayRole, displayRoles } = classifyBankDisplayRoles(
    identity.roles,
  );
  return {
    accessToken: token,
    tenantId: verified.session.tenantId,
    userId: identity.actorId,
    roleCodes: identity.roles as string[],
    scopes: identity.scopes,
    displayRole,
    displayRoles,
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

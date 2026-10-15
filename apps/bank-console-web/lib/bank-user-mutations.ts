import "server-only";

import type {
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";
import {
  bankUserApi,
  bankUserError,
  canManageBankUsers,
  type BankUserIdentity,
} from "./bank-user-identity";
import { bankUserRow, type BankUserDirectory } from "./users-data";

function items<T>(data: T[] | { items: T[] }): T[] {
  const result = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(result))
    bankUserError(
      502,
      "BANK_USERS_INVALID_RESPONSE",
      "Invalid user directory response.",
    );
  return result;
}

export async function loadBankUserDirectory(
  identity: BankUserIdentity,
): Promise<BankUserDirectory> {
  if (!identity.scopes.includes("tenant:read"))
    bankUserError(
      403,
      "AUTH_SCOPE_DENIED",
      "Tenant read permission is required.",
    );
  const [userData, roleData] = await Promise.all([
    bankUserApi<TenantUserRoleRecord[] | { items: TenantUserRoleRecord[] }>(
      identity,
      "/api/tenant/users",
    ),
    bankUserApi<
      TenantRoleCatalogRecord[] | { items: TenantRoleCatalogRecord[] }
    >(identity, "/api/tenant/roles"),
  ]);
  const users = items(userData);
  // Fail the entire read rather than leaking even one unrelated tenant row.
  if (users.some((user) => user.tenantId !== identity.tenantId))
    bankUserError(
      403,
      "CROSS_TENANT_SESSION_FORBIDDEN",
      "User directory is outside the current tenant.",
    );
  if (
    users.some(
      (user) =>
        !user.userId ||
        !user.roleCode ||
        !["active", "invited", "suspended"].includes(user.status),
    )
  )
    bankUserError(
      502,
      "BANK_USERS_INVALID_RESPONSE",
      "Invalid canonical user record.",
    );
  return {
    tenantId: identity.tenantId,
    users: users.map(bankUserRow),
    roles: items(roleData).filter((role) => role.assignable === true),
    canManageUsers: canManageBankUsers(identity),
  };
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    bankUserError(400, "VALIDATION_ERROR", "Required user fields are missing.");
  return value.trim();
}

export async function mutateBankUser(
  identity: BankUserIdentity,
  input: unknown,
): Promise<BankUserDirectory> {
  if (!canManageBankUsers(identity))
    bankUserError(
      403,
      "AUTH_SCOPE_DENIED",
      "Tenant write permission is required.",
    );
  if (!input || typeof input !== "object" || Array.isArray(input))
    bankUserError(400, "VALIDATION_ERROR", "Invalid user command.");
  const command = input as Record<string, unknown>;
  const before = await loadBankUserDirectory(identity);
  let path = "/api/tenant/users";
  let payload: {
    roleCode: string;
    status?: "active" | "suspended";
    email?: string;
    displayName?: string;
  };
  if (command.action === "invite") {
    payload = {
      email: text(command.email),
      displayName: text(command.displayName),
      roleCode: text(command.roleCode),
    };
  } else if (command.action === "role" || command.action === "status") {
    const userId = text(command.userId);
    const target = before.users.find((user) => user.userId === userId);
    if (!target)
      bankUserError(
        404,
        "TENANT_USER_NOT_FOUND",
        "User was not found in the current tenant.",
      );
    path += `/${encodeURIComponent(userId)}/role`;
    if (command.action === "status") {
      if (command.status !== "active" && command.status !== "suspended")
        bankUserError(
          400,
          "VALIDATION_ERROR",
          "Status must be active or suspended.",
        );
      if (target.status === "invited")
        bankUserError(
          409,
          "TENANT_INVITATION_NOT_ACCEPTED",
          "The invitation must be accepted before changing account status.",
        );
      payload = { roleCode: target.roleCode, status: command.status };
    } else {
      payload = { roleCode: text(command.roleCode) };
    }
  } else {
    bankUserError(400, "VALIDATION_ERROR", "Unknown user command.");
  }
  if (!before.roles.some((role) => role.roleCode === payload.roleCode))
    bankUserError(
      400,
      "TENANT_ROLE_UNSUPPORTED",
      "Select an assignable canonical tenant role.",
    );
  const changed = await bankUserApi<TenantUserRoleRecord>(
    identity,
    path,
    payload,
  );
  if (changed.tenantId !== identity.tenantId || !changed.userId)
    bankUserError(
      502,
      "BANK_USERS_INVALID_RESPONSE",
      "Invalid command response.",
    );
  // No optimistic success: re-read the authoritative, role-scoped directory.
  const after = await loadBankUserDirectory(identity);
  const row = after.users.find((user) => user.userId === changed.userId);
  if (
    !row ||
    row.roleCode !== changed.roleCode ||
    row.status !== changed.status
  )
    bankUserError(
      502,
      "BANK_USERS_READBACK_FAILED",
      "The command was submitted, but its updated state could not be confirmed. Reload before retrying.",
    );
  return after;
}

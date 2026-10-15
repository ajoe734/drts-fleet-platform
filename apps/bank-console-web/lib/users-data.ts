import type {
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";
import type { BankConsoleRole } from "./session";

export type BankUserRow = {
  userId: string;
  tenantId: string;
  roleCode: string;
  name: string;
  email: string;
  role: BankConsoleRole;
  status: TenantUserRoleRecord["status"];
  lastActivity: string;
};

// Forward-only presentation. Unknown roles never look like administrators.
export function bankUserDisplayRole(roleCode: string): BankConsoleRole {
  if (roleCode === "tenant_admin") return "bank_program_admin";
  if (roleCode === "tenant_finance_admin") return "bank_finance";
  return "bank_ops_viewer";
}

export function normalizeBankUserKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeBankUserKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key.replace(/_([a-z])/g, (_match, letter: string) =>
          letter.toUpperCase(),
        ),
        normalizeBankUserKeys(nested),
      ]),
    );
  }
  return value;
}

export function bankUserRow(user: TenantUserRoleRecord): BankUserRow {
  return {
    userId: user.userId,
    tenantId: user.tenantId,
    roleCode: user.roleCode,
    name: user.displayName,
    email: user.email,
    role: bankUserDisplayRole(user.roleCode),
    status: user.status,
    lastActivity: user.updatedAt,
  };
}

export type BankUserDirectory = {
  users: BankUserRow[];
  roles: TenantRoleCatalogRecord[];
  canManageUsers: boolean;
  tenantId: string;
};

export type BankUserMutation =
  | { action: "invite"; email: string; displayName: string; roleCode: string }
  | { action: "role"; userId: string; roleCode: string }
  | { action: "status"; userId: string; status: "active" | "suspended" };

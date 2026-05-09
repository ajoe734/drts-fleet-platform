import type { IdentityContext } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

export const FORMAL_TENANT_ROLE_FRAMING = [
  {
    key: "tenant_admin",
    label: "Tenant admin",
    authorityRoles: ["tenant_admin"],
    summary:
      "Owns tenant-wide administration across users, booking policy, billing, reports, and integration governance.",
  },
  {
    key: "operator",
    label: "Operator",
    authorityRoles: ["tenant_ops_admin"],
    summary:
      "Runs booking, passenger, address, and day-to-day operational workflows.",
  },
  {
    key: "finance_analyst",
    label: "Finance / analyst",
    authorityRoles: ["tenant_finance_admin"],
    summary:
      "Reviews invoice, reporting, and audit follow-up authority for the tenant.",
  },
  {
    key: "integration_manager",
    label: "Integration manager",
    authorityRoles: ["tenant_admin"],
    summary:
      "Prototype framing for API key, webhook, and integration-governance ownership. Current backend authority is carried by tenant admin until a distinct role code exists.",
  },
  {
    key: "viewer",
    label: "Viewer",
    authorityRoles: ["tenant_viewer"],
    summary:
      "Read-only access to tenant-visible surfaces without mutation authority.",
  },
] as const;

export type FormalTenantRoleKey =
  (typeof FORMAL_TENANT_ROLE_FRAMING)[number]["key"];

export type TenantRoleSnapshot = {
  identity: IdentityContext | null;
  roles: string[];
  scopes: string[];
  activeFormalRoles: FormalTenantRoleKey[];
  activeFormalLabels: string[];
  roleCatalogBackedLabels: string[];
  canManageUsers: boolean;
  canManageIntegrations: boolean;
  canReviewFinance: boolean;
  identityError: string | null;
};

export async function getTenantRoleSnapshot(): Promise<TenantRoleSnapshot> {
  const client = getTenantClient();

  try {
    const identity = (await client.getIdentityContext()) as IdentityContext;
    const roles = identity.roles ?? [];
    const activeFormalRoles = FORMAL_TENANT_ROLE_FRAMING.filter((role) =>
      role.authorityRoles.some((authorityRole) =>
        roles.includes(authorityRole),
      ),
    ).map((role) => role.key);

    return {
      identity,
      roles,
      scopes: identity.scopes ?? [],
      activeFormalRoles,
      activeFormalLabels: FORMAL_TENANT_ROLE_FRAMING.filter((role) =>
        activeFormalRoles.includes(role.key),
      ).map((role) => role.label),
      roleCatalogBackedLabels: roles.map(formatAuthorityRoleCode),
      canManageUsers: roles.includes("tenant_admin"),
      canManageIntegrations: roles.includes("tenant_admin"),
      canReviewFinance:
        roles.includes("tenant_admin") ||
        roles.includes("tenant_finance_admin"),
      identityError: null,
    };
  } catch (error) {
    return {
      identity: null,
      roles: [],
      scopes: [],
      activeFormalRoles: [],
      activeFormalLabels: [],
      roleCatalogBackedLabels: [],
      canManageUsers: false,
      canManageIntegrations: false,
      canReviewFinance: false,
      identityError: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export function formatAuthorityRoleCode(roleCode: string): string {
  switch (roleCode) {
    case "tenant_admin":
      return "Tenant Admin";
    case "tenant_ops_admin":
      return "Tenant Ops Admin";
    case "tenant_finance_admin":
      return "Tenant Finance Admin";
    case "tenant_viewer":
      return "Tenant Viewer";
    default:
      return roleCode;
  }
}

export function describeRoleSnapshot(snapshot: TenantRoleSnapshot): string {
  if (snapshot.activeFormalLabels.length > 0) {
    return snapshot.activeFormalLabels.join(" / ");
  }

  if (snapshot.roleCatalogBackedLabels.length > 0) {
    return snapshot.roleCatalogBackedLabels.join(" / ");
  }

  return "Role context unavailable";
}

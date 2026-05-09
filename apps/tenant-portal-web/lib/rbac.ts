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
      "Current backend authority still carries API key issuance under tenant admin until a dedicated integration role code ships.",
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

export type TenantPortalCapabilities = {
  canReadTenant: boolean;
  canWriteTenant: boolean;
  canReadBilling: boolean;
  canWriteBilling: boolean;
  canReadReports: boolean;
  canWriteReports: boolean;
  canReadAudit: boolean;
  canReadWebhooks: boolean;
  canWriteWebhooks: boolean;
  canReadSla: boolean;
  canWriteSla: boolean;
  canReadNotifications: boolean;
  canWriteNotifications: boolean;
  canManageUsers: boolean;
  canViewUsers: boolean;
  canViewApiKeys: boolean;
  canManageApiKeys: boolean;
};

export type TenantRoleSnapshot = {
  identity: IdentityContext | null;
  roles: string[];
  scopes: string[];
  activeFormalRoles: FormalTenantRoleKey[];
  activeFormalLabels: string[];
  roleCatalogBackedLabels: string[];
  capabilities: TenantPortalCapabilities;
  canManageUsers: boolean;
  canManageIntegrations: boolean;
  canReviewFinance: boolean;
  identityError: string | null;
};

const EMPTY_CAPABILITIES: TenantPortalCapabilities = {
  canReadTenant: false,
  canWriteTenant: false,
  canReadBilling: false,
  canWriteBilling: false,
  canReadReports: false,
  canWriteReports: false,
  canReadAudit: false,
  canReadWebhooks: false,
  canWriteWebhooks: false,
  canReadSla: false,
  canWriteSla: false,
  canReadNotifications: false,
  canWriteNotifications: false,
  canManageUsers: false,
  canViewUsers: false,
  canViewApiKeys: false,
  canManageApiKeys: false,
};

function buildCapabilities(
  roles: string[],
  scopes: string[],
): TenantPortalCapabilities {
  const hasRole = (roleCode: string) => roles.includes(roleCode);
  const hasScope = (scope: string) => scopes.includes(scope);

  const canManageUsers = hasRole("tenant_admin");
  const canViewApiKeys = hasRole("tenant_admin");
  const canManageApiKeys = hasRole("tenant_admin");

  return {
    canReadTenant: hasScope("tenant:read"),
    canWriteTenant: hasScope("tenant:write"),
    canReadBilling: hasScope("tenant:billing:read"),
    canWriteBilling: hasScope("tenant:billing:write"),
    canReadReports: hasScope("reports:read"),
    canWriteReports: hasScope("reports:write"),
    canReadAudit: hasScope("audit:read"),
    canReadWebhooks: hasScope("tenant:webhooks:read"),
    canWriteWebhooks: hasScope("tenant:webhooks:write"),
    canReadSla: hasScope("tenant:sla:read"),
    canWriteSla: hasScope("tenant:sla:write"),
    canReadNotifications: hasScope("tenant:read"),
    canWriteNotifications: hasScope("tenant:write"),
    canManageUsers,
    canViewUsers: canManageUsers,
    canViewApiKeys,
    canManageApiKeys,
  };
}

function buildRoleSnapshot(identity: IdentityContext): TenantRoleSnapshot {
  const roles = identity.roles ?? [];
  const scopes = identity.scopes ?? [];
  const activeFormalRoles = FORMAL_TENANT_ROLE_FRAMING.filter((role) =>
    role.authorityRoles.some((authorityRole) => roles.includes(authorityRole)),
  ).map((role) => role.key);
  const capabilities = buildCapabilities(roles, scopes);

  return {
    identity,
    roles,
    scopes,
    activeFormalRoles,
    activeFormalLabels: FORMAL_TENANT_ROLE_FRAMING.filter((role) =>
      activeFormalRoles.includes(role.key),
    ).map((role) => role.label),
    roleCatalogBackedLabels: roles.map(formatAuthorityRoleCode),
    capabilities,
    canManageUsers: capabilities.canManageUsers,
    canManageIntegrations:
      capabilities.canManageApiKeys || capabilities.canWriteWebhooks,
    canReviewFinance:
      capabilities.canReadBilling || capabilities.canWriteBilling,
    identityError: null,
  };
}

export async function getTenantRoleSnapshot(): Promise<TenantRoleSnapshot> {
  const client = await getTenantClient();

  try {
    const identity = (await client.getIdentityContext()) as IdentityContext;
    return buildRoleSnapshot(identity);
  } catch (error) {
    return {
      identity: null,
      roles: [],
      scopes: [],
      activeFormalRoles: [],
      activeFormalLabels: [],
      roleCatalogBackedLabels: [],
      capabilities: EMPTY_CAPABILITIES,
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

export function requireCapability(
  allowed: boolean,
  message: string,
): asserts allowed {
  if (!allowed) {
    throw new Error(message);
  }
}

export type TenantPortalNavItem = {
  href: string;
  label: string;
};

export function getTenantPortalNavItems(
  snapshot: TenantRoleSnapshot,
): TenantPortalNavItem[] {
  const { capabilities } = snapshot;
  const items: TenantPortalNavItem[] = [{ href: "/", label: "Home" }];

  if (capabilities.canReadTenant) {
    items.push({ href: "/booking-list", label: "Bookings" });
    items.push({ href: "/passengers", label: "Passengers" });
    items.push({ href: "/addresses", label: "Addresses" });
    items.push({ href: "/notifications", label: "Notifications" });
    items.push({ href: "/settings", label: "Settings" });
  }

  if (capabilities.canWriteTenant) {
    items.push({ href: "/bookings/new", label: "New Booking" });
  }

  if (capabilities.canReadBilling) {
    items.push({ href: "/billing", label: "Billing" });
  }

  if (capabilities.canReadReports) {
    items.push({ href: "/reports", label: "Reports" });
  }

  if (capabilities.canReadWebhooks) {
    items.push({ href: "/webhooks", label: "Webhooks" });
  }

  if (capabilities.canViewApiKeys) {
    items.push({ href: "/api-keys", label: "API Keys" });
  }

  if (capabilities.canViewUsers) {
    items.push({ href: "/users", label: "Users" });
  }

  if (capabilities.canReadAudit) {
    items.push({ href: "/audit", label: "Audit" });
  }

  return items;
}

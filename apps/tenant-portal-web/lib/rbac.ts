import type { IdentityContext } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { type Locale, t } from "@/lib/translations";

// Display label and summary for each role come from translations.ts keys
// `role.<key>.label` / `role.<key>.summary`; consumers translate by `key`.
export const FORMAL_TENANT_ROLE_FRAMING = [
  {
    key: "tenant_admin",
    authorityRoles: ["tenant_admin"],
  },
  {
    key: "operator",
    authorityRoles: ["tenant_ops_admin"],
  },
  {
    key: "finance_analyst",
    authorityRoles: ["tenant_finance_admin"],
  },
  {
    key: "integration_manager",
    authorityRoles: ["tenant_admin"],
  },
  {
    key: "viewer",
    authorityRoles: ["tenant_viewer"],
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
      capabilities: EMPTY_CAPABILITIES,
      canManageUsers: false,
      canManageIntegrations: false,
      canReviewFinance: false,
      identityError: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

const KNOWN_AUTHORITY_ROLE_CODES = new Set([
  "tenant_admin",
  "tenant_ops_admin",
  "tenant_finance_admin",
  "tenant_viewer",
]);

export function formatAuthorityRoleCode(
  roleCode: string,
  locale: Locale = "zh",
): string {
  if (KNOWN_AUTHORITY_ROLE_CODES.has(roleCode)) {
    return t(`role.code.${roleCode}`, locale);
  }
  return roleCode;
}

export function roleCatalogLabels(
  snapshot: TenantRoleSnapshot,
  locale: Locale = "zh",
): string[] {
  return snapshot.roles.map((roleCode) =>
    formatAuthorityRoleCode(roleCode, locale),
  );
}

export function describeRoleSnapshot(
  snapshot: TenantRoleSnapshot,
  locale: Locale = "zh",
): string {
  if (snapshot.activeFormalRoles.length > 0) {
    return snapshot.activeFormalRoles
      .map((roleKey) => t(`role.${roleKey}.label`, locale))
      .join(" / ");
  }

  const catalogLabels = roleCatalogLabels(snapshot, locale);
  if (catalogLabels.length > 0) {
    return catalogLabels.join(" / ");
  }

  return t("role.unavailable", locale);
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
  locale: Locale = "zh",
): TenantPortalNavItem[] {
  const { capabilities } = snapshot;
  const items: TenantPortalNavItem[] = [
    { href: "/", label: t("nav.home", locale) },
  ];

  if (capabilities.canReadTenant) {
    items.push({ href: "/booking-list", label: t("nav.bookings", locale) });
    items.push({ href: "/passengers", label: t("nav.passengers", locale) });
    items.push({ href: "/addresses", label: t("nav.addresses", locale) });
    items.push({
      href: "/notifications",
      label: t("nav.notifications", locale),
    });
    items.push({ href: "/settings", label: t("nav.settings", locale) });
  }

  if (capabilities.canWriteTenant) {
    items.push({ href: "/bookings/new", label: t("nav.newBooking", locale) });
  }

  if (capabilities.canReadBilling) {
    items.push({ href: "/billing", label: t("nav.billing", locale) });
  }

  if (capabilities.canReadReports) {
    items.push({ href: "/reports", label: t("nav.reports", locale) });
  }

  if (capabilities.canReadWebhooks) {
    items.push({ href: "/webhooks", label: t("nav.webhooks", locale) });
  }

  if (capabilities.canViewApiKeys) {
    items.push({ href: "/api-keys", label: t("nav.apiKeys", locale) });
  }

  if (capabilities.canViewUsers) {
    items.push({ href: "/users", label: t("nav.users", locale) });
  }

  if (capabilities.canReadAudit) {
    items.push({ href: "/audit", label: t("nav.audit", locale) });
  }

  return items;
}

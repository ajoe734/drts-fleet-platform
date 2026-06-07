import type { IdentityContext } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

export const FORMAL_TENANT_ROLE_FRAMING = [
  {
    key: "tenant_admin",
    label: "租戶管理員",
    authorityRoles: ["tenant_admin"],
    summary: "負責整個租戶的人員、訂單政策、計費、報表與整合治理管理。",
  },
  {
    key: "operator",
    label: "營運人員",
    authorityRoles: ["tenant_ops_admin"],
    summary: "負責訂單、乘客、地址與日常營運流程。",
  },
  {
    key: "finance_analyst",
    label: "財務／分析",
    authorityRoles: ["tenant_finance_admin"],
    summary: "負責租戶的發票、報表與稽核追蹤相關權限。",
  },
  {
    key: "integration_manager",
    label: "整合管理員",
    authorityRoles: ["tenant_admin"],
    summary:
      "在後端正式提供獨立整合角色前，整合金鑰簽發仍暫時歸在租戶管理員權限下。",
  },
  {
    key: "viewer",
    label: "檢視者",
    authorityRoles: ["tenant_viewer"],
    summary: "只能唯讀檢視租戶可見頁面，不具修改權限。",
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
      identityError: error instanceof Error ? error.message : "未知錯誤",
    };
  }
}

export function formatAuthorityRoleCode(roleCode: string): string {
  switch (roleCode) {
    case "tenant_admin":
      return "租戶管理員";
    case "tenant_ops_admin":
      return "租戶營運管理員";
    case "tenant_finance_admin":
      return "租戶財務管理員";
    case "tenant_viewer":
      return "租戶檢視者";
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

  return "目前無法取得角色脈絡";
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
  const items: TenantPortalNavItem[] = [{ href: "/", label: "首頁" }];

  if (capabilities.canReadTenant) {
    items.push({ href: "/booking-list", label: "訂單" });
    items.push({ href: "/passengers", label: "乘客" });
    items.push({ href: "/addresses", label: "地址" });
    items.push({ href: "/notifications", label: "通知" });
    items.push({ href: "/settings", label: "設定" });
  }

  if (capabilities.canWriteTenant) {
    items.push({ href: "/bookings/new", label: "新增訂單" });
  }

  if (capabilities.canReadBilling) {
    items.push({ href: "/billing", label: "計費" });
  }

  if (capabilities.canReadReports) {
    items.push({ href: "/reports", label: "報表" });
  }

  if (capabilities.canReadWebhooks) {
    items.push({ href: "/webhooks", label: "回呼" });
  }

  if (capabilities.canViewApiKeys) {
    items.push({ href: "/api-keys", label: "整合金鑰" });
  }

  if (capabilities.canViewUsers) {
    items.push({ href: "/users", label: "使用者" });
  }

  if (capabilities.canReadAudit) {
    items.push({ href: "/audit", label: "稽核" });
  }

  return items;
}

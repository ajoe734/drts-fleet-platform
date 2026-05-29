import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
  TenantUserRoleStatus,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const REFRESH_TIER: RefreshTier = "slow";
const REFRESH_CADENCE_MS = 30_000;
const OPS_CONSOLE_URL =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";
const PLATFORM_ADMIN_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3004";

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.65fr) minmax(320px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const headerActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const nameStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const namePrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  lineHeight: 1.3,
};

const mutedMetaStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const pillWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const filterWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const filterLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  color: th.textMuted,
  background: th.surfaceLo,
  fontSize: 12,
  textDecoration: "none",
};

const activeFilterLinkStyle: CSSProperties = {
  ...filterLinkStyle,
  color: th.accent,
  borderColor: th.accentBorder,
  background: th.accentBg,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const emptyTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  fontSize: 14,
  marginBottom: 6,
};

const emptyBodyStyle: CSSProperties = {
  maxWidth: 440,
  margin: "0 auto",
  lineHeight: 1.55,
};

const sideStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const sectionLabelStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  marginBottom: 8,
};

const roleListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const roleListItemStyle: CSSProperties = {
  paddingBottom: 10,
  borderBottom: `1px solid ${th.border}`,
};

const roleTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  lineHeight: 1.3,
};

const deepLinkListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const deepLinkStyle: CSSProperties = {
  display: "block",
  padding: "9px 10px",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  color: th.text,
  textDecoration: "none",
};

const actionLinkStyle: CSSProperties = {
  color: th.accent,
  textDecoration: "none",
  fontWeight: 500,
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

const numberFormatter = new Intl.NumberFormat("en");

type SearchParams = Record<string, string | string[] | undefined>;

type UserStatusFilter = "all" | TenantUserRoleStatus;

type RowActionIntent =
  | "invite_user"
  | "update_role"
  | "suspend"
  | "resend_invitation";

type UserRow = Record<string, unknown> & {
  userId: string;
  displayName: string;
  email: string;
  roleCode: string;
  roleLabel: string;
  status: TenantUserRoleStatus;
  invitedAt: string;
  updatedAt: string;
  lastLogin: string;
  actionNodes: ReactNode;
  userMeta: ReactNode;
};

type Filters = {
  role: string;
  status: UserStatusFilter;
  emptyReason: EmptyReason | "none";
  intent: RowActionIntent | null;
  userId: string | null;
};

type UsersPageData = {
  users: TenantUserRoleRecord[];
  roles: TenantRoleCatalogRecord[];
  errors: string[];
  refresh: UiRefreshMetadata;
};

type BannerTone = "info" | "success" | "warn" | "danger" | "accent";

function formatUpdated(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

const ROLE_CANVAS_LABEL: Record<string, string> = {
  tenant_admin: "tenant_admin",
  tenant_ops_admin: "operator",
  tenant_finance_admin: "approver",
  tenant_viewer: "viewer",
};

const ROLE_SORT_ORDER: Record<string, number> = {
  tenant_admin: 0,
  tenant_ops_admin: 1,
  tenant_finance_admin: 2,
  tenant_viewer: 3,
};

function getRoleLabel(roleCode: string) {
  return ROLE_CANVAS_LABEL[roleCode] ?? roleCode;
}

function getRoleDisplayName(
  roleCode: string,
  roles: TenantRoleCatalogRecord[],
) {
  return (
    roles.find((role) => role.roleCode === roleCode)?.displayName ??
    getRoleLabel(roleCode)
  );
}

function getRoleTone(roleCode: string): CanvasTone {
  return roleCode === "tenant_admin" ? "accent" : "info";
}

function getRoleCatalogTone(role: TenantRoleCatalogRecord): CanvasTone {
  if (role.roleCode === "tenant_admin") {
    return "accent";
  }
  return role.assignable ? "info" : "neutral";
}

function getStateTone(status: TenantUserRoleStatus): CanvasTone {
  if (status === "active") return "success";
  if (status === "invited") return "accent";
  return "warn";
}

function getStateLabel(status: TenantUserRoleStatus) {
  if (status === "active") return "active";
  if (status === "invited") return "invited";
  return "suspended";
}

function getRefreshTone(
  freshness: UiRefreshMetadata["dataFreshness"],
): Exclude<CanvasTone, "neutral"> {
  if (freshness === "fresh") return "success";
  if (freshness === "stale") return "warn";
  if (freshness === "degraded") return "danger";
  return "info";
}

function compareUsers(a: TenantUserRoleRecord, b: TenantUserRoleRecord) {
  if (a.status !== b.status) {
    const rank = { active: 0, invited: 1, suspended: 2 } as const;
    return rank[a.status] - rank[b.status];
  }
  return a.displayName.localeCompare(b.displayName, "zh-Hant");
}

function compareRoles(a: TenantRoleCatalogRecord, b: TenantRoleCatalogRecord) {
  if (a.assignable !== b.assignable) {
    return a.assignable ? -1 : 1;
  }

  const leftOrder = ROLE_SORT_ORDER[a.roleCode] ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = ROLE_SORT_ORDER[b.roleCode] ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return a.roleCode.localeCompare(b.roleCode, "en");
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function normalizeParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseEmptyReason(value: string | undefined): EmptyReason | "none" {
  const reasons = new Set<EmptyReason>([
    "no_data",
    "not_provisioned",
    "fetch_failed",
    "permission_denied",
    "external_unavailable",
    "filtered_empty",
  ]);
  if (value && reasons.has(value as EmptyReason)) {
    return value as EmptyReason;
  }
  return "none";
}

function parseIntent(value: string | undefined): RowActionIntent | null {
  const intents = new Set<RowActionIntent>([
    "invite_user",
    "update_role",
    "suspend",
    "resend_invitation",
  ]);
  return value && intents.has(value as RowActionIntent)
    ? (value as RowActionIntent)
    : null;
}

function parseStatusFilter(value: string | undefined): UserStatusFilter {
  if (value === "active" || value === "invited" || value === "suspended") {
    return value;
  }
  return "all";
}

function parseFilters(params: SearchParams): Filters {
  return {
    role: normalizeParam(params.role) ?? "all",
    status: parseStatusFilter(normalizeParam(params.status)),
    emptyReason: parseEmptyReason(normalizeParam(params.emptyReason)),
    intent: parseIntent(normalizeParam(params.intent)),
    userId: normalizeParam(params.userId) ?? null,
  };
}

function buildUsersHref(filters: Filters, patch: Partial<Filters>) {
  const next: Filters = { ...filters, ...patch };
  const search = new URLSearchParams();

  if (next.role !== "all") {
    search.set("role", next.role);
  }
  if (next.status !== "all") {
    search.set("status", next.status);
  }
  if (next.emptyReason !== "none") {
    search.set("emptyReason", next.emptyReason);
  }
  if (next.intent) {
    search.set("intent", next.intent);
  }
  if (next.userId) {
    search.set("userId", next.userId);
  }

  const query = search.toString();
  return query.length > 0 ? `/users?${query}` : "/users";
}

function buildActionLink(
  filters: Filters,
  action: ResourceActionDescriptor,
  userId?: string,
) {
  return buildUsersHref(filters, {
    intent: action.action as RowActionIntent,
    userId: userId ?? null,
  });
}

function stripTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  const base =
    link.targetApp === "ops-console"
      ? OPS_CONSOLE_URL
      : link.targetApp === "platform-admin"
        ? PLATFORM_ADMIN_URL
        : "";
  return `${stripTrailingSlash(base)}${link.route}`;
}

function getRefreshMetadata(at: Date): UiRefreshMetadata {
  return {
    generatedAt: at.toISOString(),
    staleAfterMs: REFRESH_CADENCE_MS,
    dataFreshness: "fresh",
    source: "live",
  };
}

async function loadUsersData(now: Date): Promise<UsersPageData> {
  const client = getTenantClient();
  const [usersResult, rolesResult] = await Promise.allSettled([
    client.listTenantUsers() as Promise<TenantUserRoleRecord[]>,
    client.listTenantRoles() as Promise<TenantRoleCatalogRecord[]>,
  ]);

  const errors: string[] = [];
  const users =
    usersResult.status === "fulfilled"
      ? [...usersResult.value].sort(compareUsers)
      : [];
  const roles =
    rolesResult.status === "fulfilled"
      ? [...rolesResult.value].sort(compareRoles)
      : [];

  if (usersResult.status === "rejected") {
    errors.push(`成員清單: ${toErrorMessage(usersResult.reason)}`);
  }
  if (rolesResult.status === "rejected") {
    errors.push(`角色目錄: ${toErrorMessage(rolesResult.reason)}`);
  }

  return {
    users,
    roles,
    errors,
    refresh: getRefreshMetadata(now),
  };
}

function getPageAvailableActions(
  hasAssignableRoles: boolean,
): ResourceActionDescriptor[] {
  return [
    hasAssignableRoles
      ? {
          action: "invite_user",
          enabled: true,
          riskLevel: "medium",
        }
      : {
          action: "invite_user",
          enabled: false,
          disabledReasonCode: "role_catalog_unavailable",
          riskLevel: "medium",
        },
  ];
}

function getUserAvailableActions(
  user: TenantUserRoleRecord,
): ResourceActionDescriptor[] {
  return [
    user.status !== "suspended"
      ? {
          action: "update_role",
          enabled: true,
          riskLevel: "medium",
        }
      : {
          action: "update_role",
          enabled: false,
          disabledReasonCode: "suspended_user_requires_restore",
          riskLevel: "medium",
        },
    user.status === "active"
      ? {
          action: "suspend",
          enabled: true,
          requiresReason: true,
          riskLevel: "high",
        }
      : {
          action: "suspend",
          enabled: false,
          disabledReasonCode: "user_not_active",
          requiresReason: true,
          riskLevel: "high",
        },
    user.status === "invited"
      ? {
          action: "resend_invitation",
          enabled: true,
          riskLevel: "medium",
        }
      : {
          action: "resend_invitation",
          enabled: false,
          disabledReasonCode: "invitation_not_pending",
          riskLevel: "medium",
        },
  ];
}

function getRoleOptions(
  users: TenantUserRoleRecord[],
  roles: TenantRoleCatalogRecord[],
) {
  const roleCodes = new Set<string>();
  roles.forEach((role) => roleCodes.add(role.roleCode));
  users.forEach((user) => roleCodes.add(user.roleCode));
  return [...roleCodes].sort((left, right) => {
    const leftOrder = ROLE_SORT_ORDER[left] ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = ROLE_SORT_ORDER[right] ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.localeCompare(right, "en");
  });
}

function matchesFilters(user: TenantUserRoleRecord, filters: Filters) {
  if (filters.role !== "all" && user.roleCode !== filters.role) {
    return false;
  }
  if (filters.status !== "all" && user.status !== filters.status) {
    return false;
  }
  return true;
}

function getEmptyState(
  filters: Filters,
  users: TenantUserRoleRecord[],
  errors: string[],
  pageActions: ResourceActionDescriptor[],
): EmptyStateEnvelope | null {
  if (filters.emptyReason !== "none") {
    return buildEmptyStateFromReason(filters.emptyReason, pageActions);
  }
  if (errors.length > 0 && users.length === 0) {
    return buildEmptyStateFromReason("fetch_failed", pageActions);
  }
  if (users.length === 0) {
    return buildEmptyStateFromReason("no_data", pageActions);
  }
  return null;
}

function buildEmptyStateFromReason(
  reason: EmptyReason,
  pageActions: ResourceActionDescriptor[],
): EmptyStateEnvelope {
  const inviteAction = pageActions.find(
    (action) => action.action === "invite_user",
  );
  switch (reason) {
    case "not_provisioned":
      return {
        reason,
        messageCode: "tenant_users.not_provisioned",
        ...(inviteAction ? { nextAction: inviteAction } : {}),
      };
    case "fetch_failed":
      return {
        reason,
        messageCode: "tenant_users.fetch_failed",
      };
    case "permission_denied":
      return {
        reason,
        messageCode: "tenant_users.permission_denied",
      };
    case "external_unavailable":
      return {
        reason,
        messageCode: "tenant_users.external_unavailable",
      };
    case "filtered_empty":
      return {
        reason,
        messageCode: "tenant_users.filtered_empty",
      };
    case "no_data":
    default:
      return {
        reason,
        messageCode: "tenant_users.no_data",
        ...(inviteAction ? { nextAction: inviteAction } : {}),
      };
  }
}

function renderEmptyState(
  emptyState: EmptyStateEnvelope,
  filters: Filters,
  pageActions: ResourceActionDescriptor[],
) {
  const inviteAction = pageActions.find(
    (action) => action.action === "invite_user",
  );
  const toneByReason: Record<EmptyReason, BannerTone> = {
    no_data: "info",
    not_provisioned: "info",
    fetch_failed: "danger",
    permission_denied: "warn",
    external_unavailable: "warn",
    driver_not_eligible: "warn",
    filtered_empty: "accent",
  };
  const content: Record<
    EmptyReason,
    { title: string; body: string; cta?: ReactNode }
  > = {
    no_data: {
      title: "目前沒有其他租戶成員",
      body: "Roster 仍只剩 tenant admin 自己。依 spec，這是獨立 empty state，不和未開通或權限問題混用。",
      cta:
        inviteAction?.enabled === true ? (
          <Link
            href={buildActionLink(filters, inviteAction)}
            style={actionLinkStyle}
          >
            以 Invite user 指令補首位成員
          </Link>
        ) : null,
    },
    not_provisioned: {
      title: "租戶身分治理尚未完成開通",
      body: "此租戶尚未發佈可指派角色或邀請流程，畫面必須明確顯示 not_provisioned，而不是假裝空資料。",
      cta: inviteAction ? (
        <span style={mutedMetaStyle}>
          nextAction: {inviteAction.action}
          {inviteAction.enabled ? "" : " (disabled)"}
        </span>
      ) : null,
    },
    fetch_failed: {
      title: "無法取得使用者清單",
      body: "讀取 `/api/tenant/users` 或角色 catalog 失敗。請用 refresh affordance 重新抓取，而不是沿用過期名單。",
    },
    permission_denied: {
      title: "只有 tenant admin 可操作此畫面",
      body: "Packet §5.7 要求 `/users` 為 tc_admin only。若 actor 權限不足，必須顯示 permission_denied，而不是渲染空表。",
    },
    external_unavailable: {
      title: "外部身分服務暫時不可用",
      body: "邀請與重送邀請依賴外部 email / IdP 流程；當外部服務降級，頁面需保留 roster 但阻擋相關 write CTA。",
    },
    driver_not_eligible: {
      title: "此 empty reason 不適用於 Tenant users",
      body: "driver_not_eligible 屬於 driver-app 專用狀態。Tenant users 畫面保留此枚舉分支，只為了和共用 ui-runtime contract 對齊。",
    },
    filtered_empty: {
      title: "目前篩選條件沒有命中任何成員",
      body: "這是 filtered_empty，不代表真的沒有使用者。可重設 role/status 篩選回到完整 roster。",
      cta: (
        <Link href="/users" style={actionLinkStyle}>
          清除所有篩選
        </Link>
      ),
    },
  };

  const resolved = content[emptyState.reason];
  return (
    <CanvasCard
      theme={th}
      title="Empty reason"
      subtitle={emptyState.reason}
      style={{ minHeight: 280 }}
    >
      <CanvasBanner
        theme={th}
        tone={toneByReason[emptyState.reason]}
        icon="warn"
        title={resolved.title}
        body={resolved.body}
      />
      <div style={emptyStateStyle}>
        <div style={emptyTitleStyle}>{resolved.title}</div>
        <div style={emptyBodyStyle}>{resolved.body}</div>
        {resolved.cta ? (
          <div style={{ marginTop: 14 }}>{resolved.cta}</div>
        ) : null}
      </div>
    </CanvasCard>
  );
}

function buildCrossAppLinks(
  user: TenantUserRoleRecord,
): CrossAppResourceLink[] {
  const resourceQuery = `resourceType=tenant_user&resourceId=${encodeURIComponent(user.userId)}`;
  return [
    {
      targetApp: "ops-console",
      route: `/audit?tenantId=${encodeURIComponent(user.tenantId)}&${resourceQuery}`,
      resourceType: "tenant_user",
      resourceId: user.userId,
      openMode: "new_tab",
      label: "Open ops audit context",
    },
    {
      targetApp: "platform-admin",
      route: `/audit?tenantId=${encodeURIComponent(user.tenantId)}&${resourceQuery}`,
      resourceType: "tenant_user",
      resourceId: user.userId,
      openMode: "new_tab",
      label: "Open platform-admin tenant context",
    },
  ];
}

function renderActionPills(
  filters: Filters,
  user: TenantUserRoleRecord,
  actions: ResourceActionDescriptor[],
) {
  return (
    <div style={actionRowStyle}>
      {actions.map((action) =>
        action.enabled ? (
          <Link
            key={action.action}
            href={buildActionLink(filters, action, user.userId)}
            style={actionLinkStyle}
          >
            {action.action}
          </Link>
        ) : (
          <span key={action.action} style={mutedMetaStyle}>
            {action.action} ({action.disabledReasonCode ?? "disabled"})
          </span>
        ),
      )}
    </div>
  );
}

function buildUserRows(
  users: TenantUserRoleRecord[],
  roles: TenantRoleCatalogRecord[],
  filters: Filters,
): UserRow[] {
  return users.map((user) => {
    const actions = getUserAvailableActions(user);
    return {
      userId: user.userId,
      displayName: user.displayName,
      email: user.email,
      roleCode: user.roleCode,
      roleLabel: getRoleDisplayName(user.roleCode, roles),
      status: user.status,
      invitedAt: formatUpdated(user.invitedAt),
      updatedAt: formatUpdated(user.updatedAt),
      lastLogin: "—",
      userMeta: (
        <div style={nameStackStyle}>
          <span style={namePrimaryStyle}>{user.displayName}</span>
          <span style={mutedMetaStyle}>{user.userId}</span>
        </div>
      ),
      actionNodes: renderActionPills(filters, user, actions),
    };
  });
}

function getIntentTitle(intent: RowActionIntent) {
  switch (intent) {
    case "invite_user":
      return "Invite user";
    case "update_role":
      return "Update role";
    case "suspend":
      return "Suspend";
    case "resend_invitation":
      return "Resend invitation";
  }
}

function getIntentDescriptor(
  filters: Filters,
  users: TenantUserRoleRecord[],
  pageActions: ResourceActionDescriptor[],
) {
  const selectedUser =
    users.find((user) => user.userId === filters.userId) ?? null;
  if (!filters.intent) return null;

  if (filters.intent === "invite_user") {
    return {
      descriptor:
        pageActions.find((action) => action.action === filters.intent) ?? null,
      user: null,
    };
  }

  if (!selectedUser) {
    return null;
  }

  return {
    descriptor:
      getUserAvailableActions(selectedUser).find(
        (action) => action.action === filters.intent,
      ) ?? null,
    user: selectedUser,
  };
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const now = new Date();
  const filters = parseFilters(await searchParams);
  const { users, roles, errors, refresh } = await loadUsersData(now);
  const pageActions = getPageAvailableActions(
    roles.some((role) => role.assignable),
  );

  const filteredUsers = users.filter((user) => matchesFilters(user, filters));
  const emptyState =
    filters.status !== "all" || filters.role !== "all"
      ? filteredUsers.length === 0
        ? buildEmptyStateFromReason("filtered_empty", pageActions)
        : null
      : getEmptyState(filters, users, errors, pageActions);

  const visibleUsers =
    emptyState?.reason === "filtered_empty" ? [] : filteredUsers;
  const rows = buildUserRows(visibleUsers, roles, filters);
  const sortedRoles = [...roles].sort(compareRoles);
  const assignableRoles = sortedRoles.filter((role) => role.assignable);
  const activeUsers = users.filter((user) => user.status === "active").length;
  const invitedUsers = users.filter((user) => user.status === "invited").length;
  const suspendedUsers = users.filter(
    (user) => user.status === "suspended",
  ).length;
  const adminUsers = users.filter(
    (user) => user.roleCode === "tenant_admin",
  ).length;
  const roleOptions = getRoleOptions(users, roles);
  const selectedIntent = getIntentDescriptor(filters, users, pageActions);
  const selectedCrossAppLinks =
    selectedIntent?.user !== null && selectedIntent?.user !== undefined
      ? buildCrossAppLinks(selectedIntent.user)
      : [];

  const columns: CanvasTableColumn<UserRow>[] = [
    {
      h: "NAME",
      k: "displayName",
      w: 200,
      r: (row) => row.userMeta,
    },
    {
      h: "EMAIL",
      k: "email",
      mono: true,
      w: 220,
    },
    {
      h: "ROLE",
      w: 170,
      r: (row) => (
        <div style={nameStackStyle}>
          <CanvasPill theme={th} tone={getRoleTone(row.roleCode)}>
            {row.roleLabel}
          </CanvasPill>
          <span style={mutedMetaStyle}>{row.roleCode}</span>
        </div>
      ),
    },
    {
      h: "STATE",
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={getStateTone(row.status)} dot>
          {getStateLabel(row.status)}
        </CanvasPill>
      ),
    },
    {
      h: "INVITED",
      k: "invitedAt",
      w: 140,
      mono: true,
    },
    {
      h: "LAST LOGIN",
      k: "lastLogin",
      w: 120,
      mono: true,
    },
    {
      h: "UPDATED",
      k: "updatedAt",
      w: 140,
      mono: true,
    },
    {
      h: "ACTIONS",
      k: "actionNodes",
      w: 240,
      r: (row) => row.actionNodes,
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="人員與角色"
        subtitle="tc_admin only · invite state · role catalog · cross-actor audit"
        actions={
          <div style={headerActionsStyle}>
            <Link
              href={buildUsersHref(filters, {})}
              style={{ textDecoration: "none" }}
            >
              <CanvasBtn theme={th} icon="refresh" size="sm">
                重新整理
              </CanvasBtn>
            </Link>
            {pageActions[0]?.enabled ? (
              <Link
                href={buildActionLink(filters, pageActions[0])}
                style={{ textDecoration: "none" }}
              >
                <CanvasBtn theme={th} variant="primary" icon="plus" size="sm">
                  邀請成員
                </CanvasBtn>
              </Link>
            ) : (
              <CanvasBtn
                theme={th}
                variant="primary"
                icon="plus"
                size="sm"
                disabled
              >
                邀請成員
              </CanvasBtn>
            )}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分使用者資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        <CanvasBanner
          theme={th}
          tone={getRefreshTone(refresh.dataFreshness)}
          icon="refresh"
          title="Refresh tier 已綁定 T5 Tenant slow"
          body={`tier=${REFRESH_TIER} · cadence=${REFRESH_CADENCE_MS / 1000}s · generatedAt=${formatUpdated(refresh.generatedAt)} · source=${refresh.source}`}
        />

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="Users"
            value={formatCount(users.length)}
            sub="tenant roster"
          />
          <CanvasKPI
            theme={th}
            label="Active"
            value={formatCount(activeUsers)}
            sub={`${formatCount(invitedUsers)} invited`}
          />
          <CanvasKPI
            theme={th}
            label="Suspended"
            value={formatCount(suspendedUsers)}
            sub="separate filter state"
          />
          <CanvasKPI
            theme={th}
            label="Roles"
            value={formatCount(assignableRoles.length)}
            sub={`${formatCount(adminUsers)} tenant_admin`}
          />
        </div>

        <div style={contentGridStyle}>
          <CanvasCard
            theme={th}
            title="Tenant user roster"
            subtitle="Must-show fields, filter state, and per-row availableActions stay on one surface."
            actions={
              <Link
                href="/audit?resourceType=tenant_user"
                style={actionLinkStyle}
              >
                查看租戶稽核
              </Link>
            }
          >
            <div style={sectionLabelStyle}>Filters</div>
            <div style={filterWrapStyle}>
              <Link
                href={buildUsersHref(filters, {
                  status: "all",
                  intent: null,
                  userId: null,
                })}
                style={
                  filters.status === "all"
                    ? activeFilterLinkStyle
                    : filterLinkStyle
                }
              >
                Status · all
              </Link>
              {(["active", "invited", "suspended"] as const).map((status) => (
                <Link
                  key={status}
                  href={buildUsersHref(filters, {
                    status,
                    intent: null,
                    userId: null,
                  })}
                  style={
                    filters.status === status
                      ? activeFilterLinkStyle
                      : filterLinkStyle
                  }
                >
                  Status · {status}
                </Link>
              ))}
            </div>

            <div style={{ height: 10 }} />

            <div style={filterWrapStyle}>
              <Link
                href={buildUsersHref(filters, {
                  role: "all",
                  intent: null,
                  userId: null,
                })}
                style={
                  filters.role === "all"
                    ? activeFilterLinkStyle
                    : filterLinkStyle
                }
              >
                Role · all
              </Link>
              {roleOptions.map((roleCode) => (
                <Link
                  key={roleCode}
                  href={buildUsersHref(filters, {
                    role: roleCode,
                    intent: null,
                    userId: null,
                  })}
                  style={
                    filters.role === roleCode
                      ? activeFilterLinkStyle
                      : filterLinkStyle
                  }
                >
                  Role · {getRoleLabel(roleCode)}
                </Link>
              ))}
            </div>

            <div style={{ height: 12 }} />

            {emptyState ? (
              renderEmptyState(emptyState, filters, pageActions)
            ) : rows.length > 0 ? (
              <CanvasTable<UserRow> theme={th} columns={columns} rows={rows} />
            ) : (
              <div style={emptyStateStyle}>目前沒有可顯示的租戶成員。</div>
            )}
          </CanvasCard>

          <div style={sideStackStyle}>
            <CanvasCard
              theme={th}
              title="Action contract"
              subtitle="availableActions, risk level, and confirmation posture"
            >
              <CanvasDL
                theme={th}
                cols={1}
                items={[
                  {
                    k: "Page action",
                    v: pageActions[0]?.action ?? "—",
                    mono: true,
                  },
                  {
                    k: "Invite risk",
                    v: pageActions[0]?.riskLevel ?? "—",
                    mono: true,
                  },
                  {
                    k: "Refresh tier",
                    v: REFRESH_TIER,
                    mono: true,
                  },
                  {
                    k: "Last snapshot",
                    v: formatUpdated(refresh.generatedAt),
                    mono: true,
                  },
                ]}
              />

              {selectedIntent?.descriptor ? (
                <>
                  <div style={{ height: 14 }} />
                  <CanvasBanner
                    theme={th}
                    tone={
                      selectedIntent.descriptor.riskLevel === "high"
                        ? "warn"
                        : "info"
                    }
                    icon="warn"
                    title={getIntentTitle(
                      selectedIntent.descriptor.action as RowActionIntent,
                    )}
                    body={
                      selectedIntent.user
                        ? `${selectedIntent.user.displayName} · ${selectedIntent.user.email}`
                        : "Invite user command"
                    }
                  />
                  <div style={{ height: 12 }} />
                  <CanvasDL
                    theme={th}
                    cols={1}
                    items={[
                      {
                        k: "action",
                        v: selectedIntent.descriptor.action,
                        mono: true,
                      },
                      {
                        k: "riskLevel",
                        v: selectedIntent.descriptor.riskLevel,
                        mono: true,
                      },
                      {
                        k: "requiresReason",
                        v: selectedIntent.descriptor.requiresReason
                          ? "true"
                          : "false",
                        mono: true,
                      },
                      {
                        k: "disabledReasonCode",
                        v: selectedIntent.descriptor.disabledReasonCode ?? "—",
                        mono: true,
                      },
                    ]}
                  />
                  <div style={{ marginTop: 12 }}>
                    <Link
                      href={buildUsersHref(filters, {
                        intent: null,
                        userId: null,
                      })}
                      style={actionLinkStyle}
                    >
                      關閉 action 檢視
                    </Link>
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 14, ...mutedMetaStyle }}>
                  點任一列 action，可檢查該 `availableActions[]` 的 risk 與
                  disabled reason。
                </div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Role catalog"
              subtitle="display name and description stay backend-owned"
            >
              <div style={pillWrapStyle}>
                {assignableRoles.map((role) => (
                  <CanvasPill
                    key={role.roleCode}
                    theme={th}
                    tone={getRoleCatalogTone(role)}
                  >
                    {role.displayName}
                  </CanvasPill>
                ))}
              </div>

              <div style={{ height: 14 }} />

              {sortedRoles.length > 0 ? (
                <div style={roleListStyle}>
                  {sortedRoles.map((role, index) => (
                    <div
                      key={role.roleCode}
                      style={
                        index === sortedRoles.length - 1
                          ? undefined
                          : roleListItemStyle
                      }
                    >
                      <div style={roleTitleStyle}>{role.displayName}</div>
                      <div style={mutedMetaStyle}>{role.roleCode}</div>
                      <div style={{ ...mutedMetaStyle, marginTop: 4 }}>
                        {role.description}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyStateStyle}>角色目錄資料目前不可用。</div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Cross-app deep links"
              subtitle="Audit follow-up opens in new tab per Q-X03"
            >
              {selectedCrossAppLinks.length > 0 ? (
                <div style={deepLinkListStyle}>
                  {selectedCrossAppLinks.map((link) => (
                    <a
                      key={`${link.targetApp}:${link.resourceId}`}
                      href={buildCrossAppHref(link)}
                      target="_blank"
                      rel="noreferrer"
                      style={deepLinkStyle}
                    >
                      <div style={roleTitleStyle}>{link.label}</div>
                      <div style={mutedMetaStyle}>
                        {link.targetApp} · {link.route}
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div style={emptyStateStyle}>
                  先選擇某個 user action，再檢查 ops-console / platform-admin 的
                  cross-app audit deep links。
                </div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="EmptyReason preview"
              subtitle="Six packet-mandated states"
            >
              <div style={filterWrapStyle}>
                <Link
                  href="/users"
                  style={
                    filters.emptyReason === "none"
                      ? activeFilterLinkStyle
                      : filterLinkStyle
                  }
                >
                  Live data
                </Link>
                {(
                  [
                    "no_data",
                    "not_provisioned",
                    "fetch_failed",
                    "permission_denied",
                    "external_unavailable",
                    "filtered_empty",
                  ] as const
                ).map((reason) => (
                  <Link
                    key={reason}
                    href={buildUsersHref(filters, {
                      emptyReason: reason,
                      intent: null,
                      userId: null,
                    })}
                    style={
                      filters.emptyReason === reason
                        ? activeFilterLinkStyle
                        : filterLinkStyle
                    }
                  >
                    {reason}
                  </Link>
                ))}
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}

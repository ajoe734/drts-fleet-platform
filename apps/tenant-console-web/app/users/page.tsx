import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts/ui-runtime";
import type {
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const TENANT_REFRESH_TIER: RefreshTier = "slow";
const TENANT_REFRESH_CADENCE_MS = 30_000;
const OPS_CONSOLE_URL =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";
const PLATFORM_ADMIN_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002";

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const controlCardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(300px, 0.95fr)",
  gap: 16,
};

const controlStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const pillRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const supportingGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};

const cardStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const linkStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const emptyStateStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: 12,
  padding: "36px 16px",
  borderRadius: 12,
  border: `1px dashed ${th.border}`,
  background: th.surfaceLo,
};

const userPrimaryStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const userTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  lineHeight: 1.25,
};

const userMetaStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  fontFamily: th.monoFamily,
};

const rowActionStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
};

const rowActionMetaStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const accessMetaStyle: CSSProperties = {
  display: "grid",
  gap: 2,
  fontSize: 11.5,
  color: th.textMuted,
};

const authorityMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  color: th.textDim,
  fontFamily: th.monoFamily,
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

const roleListMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
};

const roleListTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  lineHeight: 1.3,
};

const roleListDescriptionStyle: CSSProperties = {
  marginTop: 4,
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const linkCardStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  textDecoration: "none",
};

const linkTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  fontSize: 12,
};

const linkMetaStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const numberFormatter = new Intl.NumberFormat("en");

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

const refreshDateFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "medium",
});

type SearchParams = Record<string, string | string[] | undefined>;

type RoleFilter = "all" | string;
type StatusFilter = "all" | TenantUserRoleRecord["status"];

type LoadFailure = {
  source: "users" | "roles";
  message: string;
  reason: EmptyReason;
};

type UserRow = TenantUserRoleRecord & {
  availableActions: ResourceActionDescriptor[];
  lastLoginAt: string | null;
  roleDisplayName: string;
  actionAuthority: "embedded" | "fallback";
};

type UsersPageData = {
  users: RuntimeTenantUserRecord[];
  roles: TenantRoleCatalogRecord[];
  failures: LoadFailure[];
};

type EmptyStateConfig = {
  title: string;
  body: string;
  tone: CanvasTone;
  icon: ReactNode;
  nextAction?: ResourceActionDescriptor;
};

type RuntimeTenantUserRecord = TenantUserRoleRecord & {
  availableActions?: ResourceActionDescriptor[];
  lastLoginAt?: string | null;
};

const ROLE_CANVAS_LABEL: Record<string, string> = {
  tc_admin: "tenant_admin",
  tc_operator: "operator",
  tc_finance: "finance",
  tc_integration_mgr: "integration_mgr",
  tc_viewer: "viewer",
  tenant_admin: "tenant_admin",
  tenant_ops_admin: "operator",
  tenant_finance_admin: "finance",
  tenant_integration_mgr: "integration_mgr",
  tenant_viewer: "viewer",
};

const ROLE_SORT_ORDER: Record<string, number> = {
  tc_admin: 0,
  tc_operator: 1,
  tc_finance: 2,
  tc_integration_mgr: 3,
  tc_viewer: 4,
  tenant_admin: 0,
  tenant_ops_admin: 1,
  tenant_finance_admin: 2,
  tenant_integration_mgr: 3,
  tenant_viewer: 4,
};

const STATUS_SORT_ORDER: Record<TenantUserRoleRecord["status"], number> = {
  active: 0,
  invited: 1,
  suspended: 2,
};

function formatUpdated(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function formatRefreshAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return refreshDateFormatter.format(parsed);
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function getRoleLabel(roleCode: string) {
  return ROLE_CANVAS_LABEL[roleCode] ?? roleCode;
}

function getRoleTone(roleCode: string): CanvasTone {
  return roleCode === "tenant_admin" ? "accent" : "info";
}

function getRoleCatalogTone(role: TenantRoleCatalogRecord): CanvasTone {
  if (role.roleCode === "tenant_admin") return "accent";
  return role.assignable ? "info" : "neutral";
}

function getStateTone(status: TenantUserRoleRecord["status"]): CanvasTone {
  if (status === "active") return "success";
  if (status === "invited") return "warn";
  return "neutral";
}

function getStateLabel(status: TenantUserRoleRecord["status"]) {
  if (status === "active") return "active";
  if (status === "invited") return "pending_invite";
  return "suspended";
}

function compareUsers(a: TenantUserRoleRecord, b: TenantUserRoleRecord) {
  if (a.status !== b.status) {
    const leftOrder = STATUS_SORT_ORDER[a.status] ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = STATUS_SORT_ORDER[b.status] ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  }
  return a.displayName.localeCompare(b.displayName, "zh-Hant");
}

function compareRoles(a: TenantRoleCatalogRecord, b: TenantRoleCatalogRecord) {
  if (a.assignable !== b.assignable) return a.assignable ? -1 : 1;

  const leftOrder = ROLE_SORT_ORDER[a.roleCode] ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = ROLE_SORT_ORDER[b.roleCode] ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;

  return a.roleCode.localeCompare(b.roleCode, "en");
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function classifyFailureReason(message: string): EmptyReason {
  if (/permission|forbidden|unauthorized|401|403/i.test(message)) {
    return "permission_denied";
  }
  if (
    /external|upstream|dependency|gateway|timeout|temporar|unavailable|refused/i.test(
      message,
    )
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function deriveRefreshMetadata(failures: LoadFailure[]): UiRefreshMetadata {
  return {
    generatedAt: new Date().toISOString(),
    staleAfterMs: TENANT_REFRESH_CADENCE_MS,
    dataFreshness: failures.length > 0 ? "degraded" : "fresh",
    source: "live",
  };
}

function parseFilterValue(
  value: string | string[] | undefined,
  fallback: string,
) {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function normalizeRoleFilter(
  value: string | string[] | undefined,
  roles: TenantRoleCatalogRecord[],
): RoleFilter {
  const normalized = parseFilterValue(value, "all");
  if (normalized === "all") return "all";
  return roles.some((role) => role.roleCode === normalized)
    ? normalized
    : "all";
}

function normalizeStatusFilter(
  value: string | string[] | undefined,
): StatusFilter {
  const normalized = parseFilterValue(value, "all");
  if (
    normalized === "active" ||
    normalized === "invited" ||
    normalized === "suspended"
  ) {
    return normalized;
  }
  return "all";
}

function normalizeEmptyReason(
  value: string | string[] | undefined,
): EmptyReason | null {
  const normalized = parseFilterValue(value, "");
  if (
    normalized === "no_data" ||
    normalized === "not_provisioned" ||
    normalized === "fetch_failed" ||
    normalized === "permission_denied" ||
    normalized === "external_unavailable" ||
    normalized === "filtered_empty"
  ) {
    return normalized;
  }
  return null;
}

function buildQueryString(
  base: SearchParams,
  updates: Record<string, string | null | undefined>,
) {
  const next = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(base)) {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value) next.set(key, value);
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!value || value === "all") {
      next.delete(key);
      continue;
    }
    next.set(key, value);
  }

  const query = next.toString();
  return query.length > 0 ? `/users?${query}` : "/users";
}

function buildActionDescriptor(
  action: string,
  enabled: boolean,
  riskLevel: ResourceActionDescriptor["riskLevel"],
  disabledReasonCode?: string,
  requiresReason?: boolean,
): ResourceActionDescriptor {
  return {
    action,
    enabled,
    riskLevel,
    ...(disabledReasonCode ? { disabledReasonCode } : {}),
    ...(requiresReason ? { requiresReason: true } : {}),
  };
}

function getPageInviteAction(
  assignableRoles: TenantRoleCatalogRecord[],
): ResourceActionDescriptor {
  return buildActionDescriptor(
    "invite",
    assignableRoles.length > 0,
    "medium",
    assignableRoles.length > 0 ? undefined : "role_catalog_unavailable",
  );
}

function getRefreshAction(): ResourceActionDescriptor {
  return buildActionDescriptor("refresh", true, "low");
}

function buildFallbackUserActions(
  user: TenantUserRoleRecord,
): ResourceActionDescriptor[] {
  const updateRole = buildActionDescriptor(
    "role",
    user.status === "active",
    "medium",
    user.status === "active" ? undefined : "not_active",
  );
  const suspend = buildActionDescriptor(
    "suspend",
    user.status === "active",
    "high",
    user.status === "suspended" ? "already_suspended" : "not_active",
    true,
  );
  const resendInvite = buildActionDescriptor(
    "resend_invitation",
    user.status === "invited",
    "medium",
    user.status === "active" ? "already_active" : "not_pending_invite",
  );

  return [updateRole, suspend, resendInvite];
}

function resolveUserAvailableActions(user: RuntimeTenantUserRecord) {
  if ("availableActions" in user && Array.isArray(user.availableActions)) {
    return {
      availableActions: user.availableActions,
      actionAuthority: "embedded" as const,
    };
  }

  return {
    availableActions: buildFallbackUserActions(user),
    actionAuthority: "fallback" as const,
  };
}

function getAction(
  availableActions: ResourceActionDescriptor[],
  action: string,
) {
  return availableActions.find((entry) => entry.action === action);
}

function buildUserRows(
  users: RuntimeTenantUserRecord[],
  roles: TenantRoleCatalogRecord[],
): UserRow[] {
  const roleLookup = new Map(roles.map((role) => [role.roleCode, role]));

  return users.map((user) => {
    const actionResolution = resolveUserAvailableActions(user);

    return {
      ...user,
      availableActions: actionResolution.availableActions,
      actionAuthority: actionResolution.actionAuthority,
      lastLoginAt:
        "lastLoginAt" in user
          ? (user.lastLoginAt ?? null)
          : user.status === "active"
            ? user.updatedAt
            : null,
      roleDisplayName:
        roleLookup.get(user.roleCode)?.displayName ??
        getRoleLabel(user.roleCode),
    };
  });
}

function deriveEmptyReason(
  allUsers: TenantUserRoleRecord[],
  visibleUsers: TenantUserRoleRecord[],
  roles: TenantRoleCatalogRecord[],
  failures: LoadFailure[],
  forcedReason: EmptyReason | null,
): EmptyReason | null {
  if (forcedReason) return forcedReason;

  if (failures.some((failure) => failure.reason === "permission_denied")) {
    return "permission_denied";
  }
  if (failures.some((failure) => failure.reason === "external_unavailable")) {
    return "external_unavailable";
  }
  if (failures.length > 0) return "fetch_failed";
  if (visibleUsers.length > 0) return null;
  if (allUsers.length > 0) return "filtered_empty";
  if (roles.length === 0) return "not_provisioned";
  return "no_data";
}

function getEmptyStateConfig(
  reason: EmptyReason,
  nextAction: ResourceActionDescriptor | undefined,
): EmptyStateConfig {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "尚未開通使用者管理",
        body: "租戶角色目錄尚未準備完成，無法建立或指派使用者。請先完成 tenant access provisioning。",
        tone: "info",
        icon: "info",
        nextAction,
      };
    case "fetch_failed":
      return {
        title: "使用者資料讀取失敗",
        body: "後端快照沒有成功回來。請重新整理，若持續失敗再進 audit 或支援流程。",
        tone: "danger",
        icon: "warn",
        nextAction: getRefreshAction(),
      };
    case "permission_denied":
      return {
        title: "目前身分無法檢視 /users",
        body: "此頁是 tc_admin only。若這是異常授權狀態，請檢查跨 app audit 與 platform-admin role assignment。",
        tone: "warn",
        icon: "warn",
      };
    case "external_unavailable":
      return {
        title: "外部身份依賴暫時不可用",
        body: "租戶使用者清單可讀性受外部 identity / session 依賴影響。可先到 audit 查看近期 role 變更。",
        tone: "warn",
        icon: "warn",
        nextAction: getRefreshAction(),
      };
    case "filtered_empty":
      return {
        title: "篩選結果為空",
        body: "目前 role / status 篩選沒有命中任何成員。放寬條件後會回到完整 roster。",
        tone: "neutral",
        icon: "warn",
      };
    case "no_data":
    default:
      return {
        title: "租戶尚未有其他成員",
        body: "目前只剩 tenant admin 或整個 roster 尚未建立。從 invite flow 加入第一位 operator / finance / viewer。",
        tone: "neutral",
        icon: "info",
        nextAction,
      };
  }
}

function getCrossAppLinks(tenantId: string): CrossAppResourceLink[] {
  return [
    {
      targetApp: "platform-admin",
      route: `/audit?tenantId=${encodeURIComponent(tenantId)}&resourceType=tenant_user_role`,
      resourceType: "tenant_user_role",
      resourceId: tenantId,
      openMode: "new_tab",
      label: "Platform Admin audit",
    },
    {
      targetApp: "ops-console",
      route: `/audit?tenantId=${encodeURIComponent(tenantId)}&resourceType=tenant_user_role`,
      resourceType: "tenant_user_role",
      resourceId: tenantId,
      openMode: "new_tab",
      label: "Ops Console audit",
    },
  ];
}

function resolveCrossAppHref(link: CrossAppResourceLink) {
  const origin =
    link.targetApp === "platform-admin" ? PLATFORM_ADMIN_URL : OPS_CONSOLE_URL;
  return `${origin}${link.route}`;
}

async function loadUsersData(): Promise<UsersPageData> {
  const client = getTenantClient();
  const [usersResult, rolesResult] = await Promise.allSettled([
    client.listTenantUsers() as Promise<RuntimeTenantUserRecord[]>,
    client.listTenantRoles() as Promise<TenantRoleCatalogRecord[]>,
  ]);

  const failures: LoadFailure[] = [];
  const users =
    usersResult.status === "fulfilled"
      ? [...usersResult.value].sort(compareUsers)
      : [];
  const roles =
    rolesResult.status === "fulfilled"
      ? [...rolesResult.value].sort(compareRoles)
      : [];

  if (usersResult.status === "rejected") {
    const message = toErrorMessage(usersResult.reason);
    failures.push({
      source: "users",
      message,
      reason: classifyFailureReason(message),
    });
  }
  if (rolesResult.status === "rejected") {
    const message = toErrorMessage(rolesResult.reason);
    failures.push({
      source: "roles",
      message,
      reason: classifyFailureReason(message),
    });
  }

  return { users, roles, failures };
}

function ActionDescriptorButton({
  descriptor,
  label,
  icon,
  size = "sm",
}: {
  descriptor: ResourceActionDescriptor | undefined;
  label: string;
  icon?: "plus" | "refresh" | "warn" | "ext";
  size?: "xs" | "sm" | "md";
}) {
  if (!descriptor) return null;
  const danger = descriptor.riskLevel === "high";
  const variant = descriptor.riskLevel === "medium" ? "primary" : "secondary";
  const title = !descriptor.enabled
    ? (descriptor.disabledReasonCode ?? descriptor.action)
    : descriptor.requiresReason
      ? `${descriptor.action} · requires_reason`
      : descriptor.action;

  return (
    <span title={title}>
      <CanvasBtn
        theme={th}
        size={size}
        variant={danger ? "secondary" : variant}
        danger={danger}
        disabled={!descriptor.enabled}
        icon={icon}
      >
        {label}
      </CanvasBtn>
    </span>
  );
}

function FilterPillLink({
  href,
  active,
  label,
  tone,
}: {
  href: string;
  active: boolean;
  label: string;
  tone: CanvasTone;
}) {
  return (
    <a href={href} style={{ textDecoration: "none" }}>
      <CanvasPill theme={th} tone={active ? tone : "neutral"}>
        {label}
      </CanvasPill>
    </a>
  );
}

function EmptyStateBlock({
  reason,
  config,
}: {
  reason: EmptyReason;
  config: EmptyStateConfig;
}) {
  return (
    <div style={emptyStateStyle}>
      <CanvasPill theme={th} tone={config.tone}>
        {reason}
      </CanvasPill>
      <div style={{ color: th.text, fontWeight: 600 }}>{config.title}</div>
      <div
        style={{
          maxWidth: 420,
          color: th.textMuted,
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        {config.body}
      </div>
      {config.nextAction ? (
        <ActionDescriptorButton
          descriptor={config.nextAction}
          label={
            config.nextAction.action === "refresh" ? "重新整理" : "邀請成員"
          }
          icon={config.nextAction.action === "refresh" ? "refresh" : "plus"}
        />
      ) : null}
    </div>
  );
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const { users, roles, failures } = await loadUsersData();
  const refreshMetadata = deriveRefreshMetadata(failures);
  const tenantId = users[0]?.tenantId ?? DEMO_TENANT_ID;
  const assignableRoles = roles.filter((role) => role.assignable);
  const pageInviteAction = getPageInviteAction(assignableRoles);
  const roleFilter = normalizeRoleFilter(resolvedSearchParams.role, roles);
  const statusFilter = normalizeStatusFilter(resolvedSearchParams.status);
  const forcedEmptyReason = normalizeEmptyReason(
    resolvedSearchParams.emptyReason,
  );

  const filteredUsers = users.filter((user) => {
    if (roleFilter !== "all" && user.roleCode !== roleFilter) return false;
    if (statusFilter !== "all" && user.status !== statusFilter) return false;
    return true;
  });

  const userRows = buildUserRows(filteredUsers, roles);
  const emptyReason = deriveEmptyReason(
    users,
    filteredUsers,
    roles,
    failures,
    forcedEmptyReason,
  );
  const emptyConfig = emptyReason
    ? getEmptyStateConfig(emptyReason, pageInviteAction)
    : null;

  const activeUsers = users.filter((user) => user.status === "active").length;
  const invitedUsers = users.filter((user) => user.status === "invited").length;
  const suspendedUsers = users.filter(
    (user) => user.status === "suspended",
  ).length;
  const latestUpdated = users.reduce<string | null>((latest, user) => {
    if (!latest) return user.updatedAt;
    return new Date(user.updatedAt) > new Date(latest)
      ? user.updatedAt
      : latest;
  }, null);
  const fallbackActionUsers = userRows.filter(
    (row) => row.actionAuthority === "fallback",
  ).length;

  const crossAppLinks = getCrossAppLinks(tenantId);
  const refreshHref = buildQueryString(resolvedSearchParams, {
    refreshedAt: Date.now().toString(),
    emptyReason: null,
  });
  const allRoleHref = buildQueryString(resolvedSearchParams, {
    role: null,
    emptyReason: null,
  });
  const allStatusHref = buildQueryString(resolvedSearchParams, {
    status: null,
    emptyReason: null,
  });

  const columns: CanvasTableColumn<UserRow>[] = [
    {
      h: "NAME",
      k: "displayName",
      w: 200,
      r: (row) => (
        <div style={userPrimaryStyle}>
          <span style={userTitleStyle}>{row.displayName}</span>
          <span style={userMetaStyle}>{row.userId}</span>
        </div>
      ),
    },
    {
      h: "EMAIL",
      k: "email",
      mono: true,
      w: 220,
    },
    {
      h: "ROLE",
      k: "roleCode",
      w: 180,
      r: (row) => (
        <div style={userPrimaryStyle}>
          <CanvasPill theme={th} tone={getRoleTone(row.roleCode)}>
            {getRoleLabel(row.roleCode)}
          </CanvasPill>
          <span style={userMetaStyle}>{row.roleDisplayName}</span>
        </div>
      ),
    },
    {
      h: "STATE",
      w: 130,
      r: (row) => (
        <CanvasPill theme={th} tone={getStateTone(row.status)} dot>
          {getStateLabel(row.status)}
        </CanvasPill>
      ),
    },
    {
      h: "ACCESS",
      w: 180,
      r: (row) => (
        <div style={accessMetaStyle}>
          <span>invited {formatUpdated(row.invitedAt)}</span>
          <span>last login {formatUpdated(row.lastLoginAt)}</span>
        </div>
      ),
    },
    {
      h: "UPDATED",
      w: 150,
      mono: true,
      r: (row) => formatUpdated(row.updatedAt),
    },
    {
      h: "ACTIONS",
      w: 240,
      r: (row) => {
        const updateRole = getAction(row.availableActions, "role");
        const suspend = getAction(row.availableActions, "suspend");
        const resendInvitation = getAction(
          row.availableActions,
          "resend_invitation",
        );

        return (
          <div style={rowActionMetaStyle}>
            <div style={rowActionStyle}>
              <ActionDescriptorButton
                descriptor={updateRole}
                label="更新角色"
                size="xs"
              />
              <ActionDescriptorButton
                descriptor={suspend}
                label="停用"
                size="xs"
              />
              <ActionDescriptorButton
                descriptor={resendInvitation}
                label="重送邀請"
                size="xs"
              />
            </div>
            <span style={userMetaStyle}>
              availableActions[{row.actionAuthority}]:
              {row.availableActions.map((action: ResourceActionDescriptor) =>
                action.enabled ? ` ${action.action}` : ` ${action.action}[off]`,
              )}
            </span>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="使用者"
        subtitle="只有 tc_admin 可操作 · tenant_admin / operator / finance / integration_mgr / viewer"
        actions={
          <>
            <a href={refreshHref} style={{ textDecoration: "none" }}>
              <CanvasBtn
                theme={th}
                variant="secondary"
                icon="refresh"
                size="sm"
              >
                重新整理
              </CanvasBtn>
            </a>
            <ActionDescriptorButton
              descriptor={pageInviteAction}
              label="邀請"
              icon="plus"
            />
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone={refreshMetadata.dataFreshness === "degraded" ? "warn" : "info"}
          icon="refresh"
          title={`Refresh tier T5 · 30s cadence · ${TENANT_REFRESH_TIER}`}
          body={`目前顯示的是 ${formatRefreshAt(refreshMetadata.generatedAt)} 產生的 snapshot · dataFreshness=${refreshMetadata.dataFreshness} · source=${refreshMetadata.source}`}
        />

        {fallbackActionUsers > 0 ? (
          <CanvasBanner
            theme={th}
            tone="info"
            icon="info"
            title="availableActions authority fallback active"
            body={`${formatCount(fallbackActionUsers)} 筆 roster row 尚未從後端收到 embedded availableActions；目前先用 legacy status-based fallback render disabled/enabled CTA，待 UI-BE-005 contract 補齊後可自動切回 backend authority。`}
          />
        ) : null}

        {failures.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="頁面處於 degraded state"
            body={failures
              .map(
                (failure) =>
                  `${failure.source}: ${failure.reason} · ${failure.message}`,
              )
              .join(" · ")}
          />
        ) : null}

        <div style={controlCardStyle}>
          <CanvasCard theme={th} title="篩選" subtitle="role + status">
            <div style={controlStackStyle}>
              <CanvasField
                theme={th}
                label="Role"
                hint="依 packet §5.7，必須可按角色檢視。"
              >
                <div style={pillRowStyle}>
                  <FilterPillLink
                    href={allRoleHref}
                    active={roleFilter === "all"}
                    label="all roles"
                    tone="accent"
                  />
                  {roles.map((role) => (
                    <FilterPillLink
                      key={role.roleCode}
                      href={buildQueryString(resolvedSearchParams, {
                        role: role.roleCode,
                        emptyReason: null,
                      })}
                      active={roleFilter === role.roleCode}
                      label={getRoleLabel(role.roleCode)}
                      tone={getRoleCatalogTone(role)}
                    />
                  ))}
                </div>
              </CanvasField>
              <CanvasField
                theme={th}
                label="Status"
                hint="active / invited / suspended 都必須分開辨識。"
              >
                <div style={pillRowStyle}>
                  <FilterPillLink
                    href={allStatusHref}
                    active={statusFilter === "all"}
                    label="all states"
                    tone="accent"
                  />
                  <FilterPillLink
                    href={buildQueryString(resolvedSearchParams, {
                      status: "active",
                      emptyReason: null,
                    })}
                    active={statusFilter === "active"}
                    label="active"
                    tone="success"
                  />
                  <FilterPillLink
                    href={buildQueryString(resolvedSearchParams, {
                      status: "invited",
                      emptyReason: null,
                    })}
                    active={statusFilter === "invited"}
                    label="pending_invite"
                    tone="warn"
                  />
                  <FilterPillLink
                    href={buildQueryString(resolvedSearchParams, {
                      status: "suspended",
                      emptyReason: null,
                    })}
                    active={statusFilter === "suspended"}
                    label="suspended"
                    tone="neutral"
                  />
                </div>
              </CanvasField>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Roster 摘要"
            subtitle="must-show data / authority / refresh"
          >
            <div style={controlStackStyle}>
              <div style={pillRowStyle}>
                <CanvasPill theme={th} tone="accent">
                  {formatCount(users.length)} users
                </CanvasPill>
                <CanvasPill theme={th} tone="success">
                  {formatCount(activeUsers)} active
                </CanvasPill>
                <CanvasPill theme={th} tone="warn">
                  {formatCount(invitedUsers)} pending_invite
                </CanvasPill>
                <CanvasPill theme={th} tone="neutral">
                  {formatCount(suspendedUsers)} suspended
                </CanvasPill>
              </div>

              <CanvasDL
                theme={th}
                cols={1}
                items={[
                  {
                    k: "Latest roster update",
                    v: latestUpdated ? formatUpdated(latestUpdated) : "—",
                    mono: true,
                  },
                  {
                    k: "Assignable roles",
                    v: `${formatCount(assignableRoles.length)} / ${formatCount(roles.length)}`,
                    mono: true,
                  },
                  {
                    k: "Tenant audit",
                    v: "/audit?resourceType=tenant_user_role",
                    mono: true,
                  },
                ]}
              />
            </div>
          </CanvasCard>
        </div>

        <CanvasCard theme={th} padding={0}>
          {emptyReason && emptyConfig ? (
            <EmptyStateBlock reason={emptyReason} config={emptyConfig} />
          ) : (
            <CanvasTable<UserRow>
              theme={th}
              columns={columns}
              rows={userRows}
            />
          )}
        </CanvasCard>

        <div style={supportingGridStyle}>
          <CanvasCard
            theme={th}
            title="角色目錄"
            subtitle="role catalog remains backend-owned"
          >
            {roles.length > 0 ? (
              <div style={roleListStyle}>
                {roles.map((role, index) => (
                  <div
                    key={role.roleCode}
                    style={
                      index === roles.length - 1 ? undefined : roleListItemStyle
                    }
                  >
                    <div style={roleListMetaStyle}>
                      <span style={roleListTitleStyle}>{role.displayName}</span>
                      <CanvasPill theme={th} tone={getRoleCatalogTone(role)}>
                        {role.roleCode}
                      </CanvasPill>
                    </div>
                    <div style={roleListDescriptionStyle}>
                      {role.description}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyStateBlock
                reason="not_provisioned"
                config={getEmptyStateConfig(
                  "not_provisioned",
                  pageInviteAction,
                )}
              />
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Cross-app audit"
            subtitle="ops / platform actions affecting tenant access open in new tab"
          >
            <div style={cardStackStyle}>
              <div style={authorityMetaStyle}>
                <span>cross-app deep links</span>
                <CanvasPill theme={th} tone="info">
                  new_tab
                </CanvasPill>
              </div>
              <div style={linkStackStyle}>
                <a
                  href="/audit?resourceType=tenant_user_role"
                  style={linkCardStyle}
                >
                  <span style={linkTitleStyle}>Tenant Console audit</span>
                  <span style={linkMetaStyle}>
                    same-tab filtered view for tenant-owned user actions
                  </span>
                </a>
                {crossAppLinks.map((link) => (
                  <a
                    key={`${link.targetApp}:${link.route}`}
                    href={resolveCrossAppHref(link)}
                    target={link.openMode === "new_tab" ? "_blank" : undefined}
                    rel={
                      link.openMode === "new_tab"
                        ? "noreferrer noopener"
                        : undefined
                    }
                    style={linkCardStyle}
                  >
                    <span style={linkTitleStyle}>{link.label}</span>
                    <span style={linkMetaStyle}>
                      {link.targetApp} · {link.route}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}

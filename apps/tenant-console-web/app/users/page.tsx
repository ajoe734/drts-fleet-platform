import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  IdentityContext,
  RefreshTier,
  ResourceActionDescriptor,
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
  UiRefreshMetadata,
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
const REFRESH_TIER_CADENCE_MS: Record<RefreshTier, number | null> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: null,
};
const TENANT_REFRESH_CADENCE_MS =
  REFRESH_TIER_CADENCE_MS[TENANT_REFRESH_TIER] ?? 30_000;
const CROSS_APP_BASE_URLS = {
  "ops-console":
    process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003",
  "platform-admin":
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002",
  "tenant-console":
    process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "http://localhost:3004",
} as const;

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const stripGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const stripCardStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: "12px 14px",
  borderRadius: 12,
  border: `1px solid ${th.border}`,
  background: th.surface,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.3fr) minmax(300px, 0.9fr)",
  gap: 16,
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 12,
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

const metricValueStyle: CSSProperties = {
  color: th.text,
  fontWeight: 700,
  fontSize: 18,
  lineHeight: 1.1,
};

const metricLabelStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.4,
};

const stripLabelStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 10.5,
  lineHeight: 1.3,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  fontFamily: th.monoFamily,
};

const stripValueStyle: CSSProperties = {
  color: th.text,
  fontSize: 12.5,
  fontWeight: 600,
  lineHeight: 1.35,
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

const hintCopyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const numberFormatter = new Intl.NumberFormat("en");

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

type SearchParams = Record<string, string | string[] | undefined>;

type RoleFilter = "all" | string;
type StatusFilter = "all" | TenantUserRoleRecord["status"];

type LoadFailure = {
  source: "users" | "roles";
  message: string;
  reason: EmptyReason;
};

type UserRow = Record<string, unknown> &
  TenantUserRoleRecord & {
    availableActions: ResourceActionDescriptor[];
    lastLoginAt: string | null;
    roleDisplayName: string;
  };

type UsersPageData = {
  identity: IdentityContext | null;
  identityError: string | null;
  users: RuntimeTenantUserRecord[];
  roles: TenantRoleCatalogRecord[];
  failures: LoadFailure[];
  availableActions: ResourceActionDescriptor[];
  emptyState: EmptyStateEnvelope | null;
  refreshMetadata: UiRefreshMetadata | null;
  crossAppLinks: CrossAppResourceLink[];
};

type EmptyStateConfig = {
  title: string;
  body: string;
  tone: CanvasTone;
  icon: ReactNode;
  nextAction?: ResourceActionDescriptor | undefined;
  actionHref?: string;
  actionLabel?: string;
  actionIcon?: "plus" | "refresh" | "warn" | "ext";
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

  return users.map((user) => ({
    ...user,
    availableActions: Array.isArray(user.availableActions)
      ? user.availableActions
      : [],
    lastLoginAt: "lastLoginAt" in user ? (user.lastLoginAt ?? null) : null,
    roleDisplayName:
      roleLookup.get(user.roleCode)?.displayName ?? getRoleLabel(user.roleCode),
  }));
}

function getEmptyStateConfig(
  reason: EmptyReason,
  nextAction: ResourceActionDescriptor | undefined,
  refreshHref: string | null,
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
        ...(refreshHref
          ? {
              actionHref: refreshHref,
              actionLabel: "重新整理",
              actionIcon: "refresh" as const,
            }
          : {}),
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
        ...(refreshHref
          ? {
              actionHref: refreshHref,
              actionLabel: "重新整理",
              actionIcon: "refresh" as const,
            }
          : {}),
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

function resolveCrossAppHref(link: CrossAppResourceLink) {
  if (/^https?:\/\//.test(link.route)) return link.route;
  const appBaseUrl = CROSS_APP_BASE_URLS[link.targetApp];
  return new URL(link.route, appBaseUrl).toString();
}

async function loadUsersData(): Promise<UsersPageData> {
  const client = getTenantClient();
  const [identityResult, usersResult, rolesResult] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.listTenantUsers(),
    client.listTenantRoles() as Promise<TenantRoleCatalogRecord[]>,
  ]);

  const failures: LoadFailure[] = [];
  const users =
    usersResult.status === "fulfilled"
      ? [...usersResult.value.items].sort(compareUsers)
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

  return {
    identity:
      identityResult.status === "fulfilled" ? identityResult.value : null,
    identityError:
      identityResult.status === "rejected"
        ? toErrorMessage(identityResult.reason)
        : null,
    users,
    roles,
    failures,
    availableActions:
      usersResult.status === "fulfilled" &&
      Array.isArray(usersResult.value.availableActions)
        ? usersResult.value.availableActions
        : [],
    emptyState:
      usersResult.status === "fulfilled"
        ? (usersResult.value.emptyState ?? null)
        : null,
    refreshMetadata:
      usersResult.status === "fulfilled"
        ? (usersResult.value.refreshMetadata ?? null)
        : null,
    crossAppLinks:
      usersResult.status === "fulfilled" &&
      Array.isArray(usersResult.value.crossAppLinks)
        ? usersResult.value.crossAppLinks
        : [],
  };
}

function getActionLabel(action: string) {
  switch (action) {
    case "invite":
      return "邀請";
    case "role":
      return "更新角色";
    case "suspend":
      return "停用";
    case "resend_invitation":
      return "重送邀請";
    case "refresh":
      return "重新整理";
    default:
      return action;
  }
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

function EmptyStateActionLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: "plus" | "refresh" | "warn" | "ext" | undefined;
}) {
  return (
    <a href={href} style={{ textDecoration: "none" }}>
      <CanvasBtn theme={th} size="sm" variant="secondary" icon={icon}>
        {label}
      </CanvasBtn>
    </a>
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
          label={getActionLabel(config.nextAction.action)}
          icon={config.nextAction.action === "refresh" ? "refresh" : "plus"}
        />
      ) : config.actionHref && config.actionLabel ? (
        <EmptyStateActionLink
          href={config.actionHref}
          label={config.actionLabel}
          icon={config.actionIcon}
        />
      ) : null}
    </div>
  );
}

function getActorChip(identity: IdentityContext | null, tenantId: string) {
  if (!identity) return `tenant / production / ${tenantId}`;
  return `${identity.realm} / production / ${identity.tenantId ?? tenantId}`;
}

function getActorSummary(identity: IdentityContext | null) {
  if (!identity) return "identity unavailable";
  return `${identity.actorId ?? identity.actorType} · ${identity.authMode} · roles=${identity.roles.join(", ") || "none"}`;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const {
    identity,
    identityError,
    users,
    roles,
    failures,
    availableActions,
    emptyState,
    refreshMetadata: backendRefreshMetadata,
    crossAppLinks: backendCrossAppLinks,
  } = await loadUsersData();
  const refreshHref = backendRefreshMetadata
    ? buildQueryString(resolvedSearchParams, {
        refreshedAt: Date.now().toString(),
      })
    : null;
  const tenantId = identity?.tenantId ?? users[0]?.tenantId ?? DEMO_TENANT_ID;
  const assignableRoles = roles.filter((role) => role.assignable);
  const pageInviteAction = getAction(availableActions, "invite");
  const roleFilter = normalizeRoleFilter(resolvedSearchParams.role, roles);
  const statusFilter = normalizeStatusFilter(resolvedSearchParams.status);

  const filteredUsers = users.filter((user) => {
    if (roleFilter !== "all" && user.roleCode !== roleFilter) return false;
    if (statusFilter !== "all" && user.status !== statusFilter) return false;
    return true;
  });

  const userRows = buildUserRows(filteredUsers, roles);
  const emptyReason =
    filteredUsers.length === 0 && users.length > 0
      ? ("filtered_empty" as const)
      : (emptyState?.reason ?? null);
  const emptyConfig = emptyReason
    ? getEmptyStateConfig(emptyReason, emptyState?.nextAction, refreshHref)
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
  const crossAppLinks = backendCrossAppLinks;
  const allRoleHref = buildQueryString(resolvedSearchParams, {
    role: null,
  });
  const allStatusHref = buildQueryString(resolvedSearchParams, {
    status: null,
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
      h: "INVITED",
      w: 140,
      mono: true,
      r: (row) => formatUpdated(row.invitedAt),
    },
    {
      h: "LAST LOGIN",
      w: 150,
      mono: true,
      r: (row) => formatUpdated(row.lastLoginAt),
    },
    {
      h: "ACTIONS",
      w: 250,
      r: (row) => {
        const updateRole = getAction(row.availableActions, "role");
        const suspend = getAction(row.availableActions, "suspend");
        const resendInvitation = getAction(
          row.availableActions,
          "resend_invitation",
        );
        const extraActions = row.availableActions.filter(
          (action) =>
            action.action !== "role" &&
            action.action !== "suspend" &&
            action.action !== "resend_invitation",
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
              {extraActions.map((action) => (
                <ActionDescriptorButton
                  key={action.action}
                  descriptor={action}
                  label={getActionLabel(action.action)}
                  size="xs"
                />
              ))}
            </div>
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
            {refreshHref ? (
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
            ) : null}
            <ActionDescriptorButton
              descriptor={pageInviteAction}
              label="邀請"
              icon="plus"
            />
          </>
        }
      />

      <div style={pageBodyStyle}>
        {backendRefreshMetadata ? (
          <CanvasBanner
            theme={th}
            tone={
              backendRefreshMetadata.dataFreshness === "degraded"
                ? "warn"
                : "info"
            }
            icon="refresh"
            title={`Refresh tier T5 · ${TENANT_REFRESH_CADENCE_MS / 1000}s cadence · ${TENANT_REFRESH_TIER}`}
            body={`目前顯示的是 ${backendRefreshMetadata.generatedAt} 產生的 snapshot · dataFreshness=${backendRefreshMetadata.dataFreshness} · source=${backendRefreshMetadata.source}`}
          />
        ) : (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={`Refresh tier T5 · ${TENANT_REFRESH_CADENCE_MS / 1000}s cadence · ${TENANT_REFRESH_TIER}`}
            body="後端尚未提供 UiRefreshMetadata；此頁只顯示 spec tier 與手動重新整理入口，不再本地推導 freshness 狀態。"
          />
        )}

        {identityError ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="身份上下文讀取失敗"
            body={`IdentityContext 無法讀取，因此頁面改以 tenant users snapshot 推導 tenant 範圍。${identityError}`}
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

        <div style={stripGridStyle}>
          <div style={stripCardStyle}>
            <div style={stripLabelStyle}>Identity Chip</div>
            <div style={stripValueStyle}>
              {getActorChip(identity, tenantId)}
            </div>
            <div style={hintCopyStyle}>{getActorSummary(identity)}</div>
          </div>

          <div style={stripCardStyle}>
            <div style={stripLabelStyle}>Roster Snapshot</div>
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
            <div style={hintCopyStyle}>
              latest roster update{" "}
              {latestUpdated ? formatUpdated(latestUpdated) : "—"}
            </div>
          </div>

          <div style={stripCardStyle}>
            <div style={stripLabelStyle}>Cross-App Exits</div>
            <div style={stripValueStyle}>Audit drill-outs stay explicit</div>
            <div style={hintCopyStyle}>
              Tenant audit same-tab；ops/platform deep links new-tab per packet
              §3.10。
            </div>
          </div>
        </div>

        <div style={summaryGridStyle}>
          <CanvasCard theme={th} title="篩選" subtitle="role + status">
            <div style={stackStyle}>
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
                    })}
                    active={statusFilter === "active"}
                    label="active"
                    tone="success"
                  />
                  <FilterPillLink
                    href={buildQueryString(resolvedSearchParams, {
                      status: "invited",
                    })}
                    active={statusFilter === "invited"}
                    label="pending_invite"
                    tone="warn"
                  />
                  <FilterPillLink
                    href={buildQueryString(resolvedSearchParams, {
                      status: "suspended",
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
            title="Authority / Refresh"
            subtitle="spec-required context without leaving the users surface"
          >
            <div style={stackStyle}>
              <div style={stripGridStyle}>
                <div>
                  <div style={metricValueStyle}>
                    {formatCount(filteredUsers.length)}
                  </div>
                  <div style={metricLabelStyle}>
                    visible roster rows after role/status filter
                  </div>
                </div>
                <div>
                  <div style={metricValueStyle}>
                    {formatCount(assignableRoles.length)} /{" "}
                    {formatCount(roles.length)}
                  </div>
                  <div style={metricLabelStyle}>
                    assignable roles from role catalog
                  </div>
                </div>
              </div>

              <CanvasDL
                theme={th}
                cols={1}
                items={[
                  {
                    k: "Primary persona",
                    v: "tc_admin only",
                    mono: true,
                  },
                  {
                    k: "Refresh tier",
                    v: `T5 / ${TENANT_REFRESH_TIER} / ${TENANT_REFRESH_CADENCE_MS / 1000}s`,
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

        <CanvasCard
          theme={th}
          title="Tenant roster"
          subtitle="user id · display name · email · role · status · invited at · last login"
          padding={0}
        >
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
              <div style={hintCopyStyle}>
                角色目錄目前沒有資料。此區等待後端 role catalog 契約補齊，
                不再本地推導 empty reason。
              </div>
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

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
import { getTenantClient } from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { type Locale, t } from "@/lib/translations";

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
  "fleet-partner-portal":
    process.env.NEXT_PUBLIC_FLEET_PARTNER_PORTAL_URL ?? "http://localhost:3007",
  "bank-console":
    process.env.NEXT_PUBLIC_BANK_CONSOLE_URL ?? "http://localhost:3009",
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
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 0.85fr)",
  gap: 16,
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const metricGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 10,
};

const metricCardStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
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

const routeCodeStyle: CSSProperties = {
  color: th.text,
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.35,
  fontFamily: th.monoFamily,
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

const compactMetaStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 11,
  lineHeight: 1.45,
  fontFamily: th.monoFamily,
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

type SearchParams = Record<string, string | string[] | undefined>;

type RoleFilter = "all" | string;
type StatusFilter = "all" | TenantUserRoleRecord["status"];

type LoadFailure = {
  source: "users" | "roles";
  message: string;
  reason: EmptyReason;
};

interface UserRow extends RuntimeTenantUserRecord {
  [key: string]: unknown;
  availableActions: ResourceActionDescriptor[];
  roleDisplayName: string;
}

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

type TenantUsersResponse =
  | TenantUserRoleRecord[]
  | {
      items: TenantUserRoleRecord[];
      availableActions?: ResourceActionDescriptor[];
      emptyState?: EmptyStateEnvelope | null;
      refreshMetadata?: UiRefreshMetadata | null;
      crossAppLinks?: CrossAppResourceLink[];
    };

const ROLE_CANVAS_LABEL: Record<string, string> = {
  tc_admin: "tenant_admin",
  tc_operator: "operator",
  tc_finance: "finance",
  tc_viewer: "viewer",
  tenant_admin: "tenant_admin",
  tenant_ops_admin: "operator",
  tenant_finance_admin: "finance",
  tenant_viewer: "viewer",
};

const ROLE_SORT_ORDER: Record<string, number> = {
  tc_admin: 0,
  tc_operator: 1,
  tc_finance: 2,
  tc_viewer: 3,
  tenant_admin: 0,
  tenant_ops_admin: 1,
  tenant_finance_admin: 2,
  tenant_viewer: 3,
};

const STATUS_SORT_ORDER: Record<TenantUserRoleRecord["status"], number> = {
  active: 0,
  invited: 1,
  suspended: 2,
};

function getIntlLocale(locale: Locale) {
  return locale === "zh" ? "zh-Hant" : "en-US";
}

function formatUpdated(value: string | null | undefined, locale: Locale) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatDurationMs(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) return "—";
  if (value < 1_000) return `${value}ms`;
  if (value % 1_000 === 0) return `${value / 1_000}s`;
  return `${(value / 1_000).toFixed(1)}s`;
}

function formatCount(value: number, locale: Locale) {
  return new Intl.NumberFormat(getIntlLocale(locale)).format(value);
}

function getRoleLabel(roleCode: string, locale: Locale) {
  switch (ROLE_CANVAS_LABEL[roleCode] ?? roleCode) {
    case "tenant_admin":
      return t("users.role.tenantAdmin", locale);
    case "operator":
      return t("users.role.operator", locale);
    case "finance":
      return t("users.role.finance", locale);
    case "viewer":
      return t("users.role.viewer", locale);
    default:
      return roleCode;
  }
}

function isTenantAdminRole(roleCode: string) {
  return roleCode === "tc_admin" || roleCode === "tenant_admin";
}

function getRoleTone(roleCode: string): CanvasTone {
  return isTenantAdminRole(roleCode) ? "accent" : "info";
}

function getRoleCatalogTone(role: TenantRoleCatalogRecord): CanvasTone {
  if (isTenantAdminRole(role.roleCode)) return "accent";
  return role.assignable ? "info" : "neutral";
}

function getStateTone(status: TenantUserRoleRecord["status"]): CanvasTone {
  if (status === "active") return "success";
  if (status === "invited") return "warn";
  return "neutral";
}

function getStateLabel(status: TenantUserRoleRecord["status"], locale: Locale) {
  if (status === "active") return t("users.status.active", locale);
  if (status === "invited") return t("users.status.pendingInvite", locale);
  return t("users.status.suspended", locale);
}

function getRefreshTone(
  metadata: UiRefreshMetadata | null,
): "info" | "success" | "warn" | "accent" {
  if (!metadata) return "info";
  if (metadata.dataFreshness === "degraded") return "warn";
  if (metadata.dataFreshness === "stale") return "accent";
  if (metadata.dataFreshness === "fresh") return "success";
  return "info";
}

function getRefreshFreshnessLabel(
  freshness: UiRefreshMetadata["dataFreshness"],
  locale: Locale,
) {
  switch (freshness) {
    case "fresh":
      return t("users.refresh.freshness.fresh", locale);
    case "stale":
      return t("users.refresh.freshness.stale", locale);
    case "degraded":
      return t("users.refresh.freshness.degraded", locale);
    default:
      return t("users.refresh.freshness.unknown", locale);
  }
}

function getRefreshSummary(metadata: UiRefreshMetadata | null, locale: Locale) {
  if (!metadata) return t("users.refresh.summaryMissing", locale);
  return t("users.refresh.summary", locale, {
    freshness: getRefreshFreshnessLabel(metadata.dataFreshness, locale),
    source: metadata.source,
    staleAfter: formatDurationMs(metadata.staleAfterMs),
  });
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

function toErrorMessage(error: unknown, locale: Locale) {
  return error instanceof Error ? error.message : t("users.error.unknown", locale);
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

function buildUserRows(
  users: RuntimeTenantUserRecord[],
  roles: TenantRoleCatalogRecord[],
  locale: Locale,
): UserRow[] {
  const roleLookup = new Map(roles.map((role) => [role.roleCode, role]));

  return users.map((user) => ({
    ...user,
    availableActions: Array.isArray(user.availableActions)
      ? user.availableActions
      : [],
    roleDisplayName:
      roleLookup.get(user.roleCode)?.displayName ??
      getRoleLabel(user.roleCode, locale),
  }));
}

function pickAction(
  actions: ResourceActionDescriptor[],
  candidates: string[],
): ResourceActionDescriptor | undefined {
  return sortAvailableActions(actions).find((descriptor) =>
    candidates.includes(descriptor.action),
  );
}

function deriveEmptyReason({
  filteredUsersCount,
  usersCount,
  rolesCount,
  failures,
  emptyState,
  hasOnlyTenantAdminRoster,
}: {
  filteredUsersCount: number;
  usersCount: number;
  rolesCount: number;
  failures: LoadFailure[];
  emptyState: EmptyStateEnvelope | null;
  hasOnlyTenantAdminRoster: boolean;
}): EmptyReason | null {
  if (hasOnlyTenantAdminRoster) {
    return "no_data";
  }
  if (filteredUsersCount === 0 && usersCount > 0) {
    return "filtered_empty";
  }
  if (emptyState?.reason) {
    return emptyState.reason;
  }
  if (filteredUsersCount > 0) {
    return null;
  }

  const userFailure = failures.find((failure) => failure.source === "users");
  if (userFailure) {
    return userFailure.reason;
  }
  if (rolesCount === 0) {
    return "not_provisioned";
  }
  return "no_data";
}

function hasOnlyTenantAdminRoster(users: TenantUserRoleRecord[]) {
  return users.length === 1 && isTenantAdminRole(users[0]?.roleCode ?? "");
}

function getEmptyStateConfig(
  reason: EmptyReason,
  nextAction: ResourceActionDescriptor | undefined,
  refreshHref: string | null,
  locale: Locale,
): EmptyStateConfig {
  switch (reason) {
    case "not_provisioned":
      return {
        title: t("users.empty.notProvisioned.title", locale),
        body: t("users.empty.notProvisioned.body", locale),
        tone: "info",
        icon: "info",
        nextAction,
      };
    case "fetch_failed":
      return {
        title: t("users.empty.fetchFailed.title", locale),
        body: t("users.empty.fetchFailed.body", locale),
        tone: "danger",
        icon: "warn",
        ...(refreshHref
          ? {
              actionHref: refreshHref,
              actionLabel: t("users.empty.refreshAction", locale),
              actionIcon: "refresh" as const,
            }
          : {}),
      };
    case "permission_denied":
      return {
        title: t("users.empty.permissionDenied.title", locale),
        body: t("users.empty.permissionDenied.body", locale),
        tone: "warn",
        icon: "warn",
      };
    case "external_unavailable":
      return {
        title: t("users.empty.externalUnavailable.title", locale),
        body: t("users.empty.externalUnavailable.body", locale),
        tone: "warn",
        icon: "warn",
        ...(refreshHref
          ? {
              actionHref: refreshHref,
              actionLabel: t("users.empty.refreshAction", locale),
              actionIcon: "refresh" as const,
            }
          : {}),
      };
    case "filtered_empty":
      return {
        title: t("users.empty.filteredEmpty.title", locale),
        body: t("users.empty.filteredEmpty.body", locale),
        tone: "neutral",
        icon: "warn",
      };
    case "no_data":
    default:
      return {
        title: t("users.empty.noData.title", locale),
        body: t("users.empty.noData.body", locale),
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

async function loadUsersData(locale: Locale): Promise<UsersPageData> {
  const client = await getTenantClient();
  const [identityResult, usersResult, rolesResult] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.listTenantUsers(),
    client.listTenantRoles() as Promise<TenantRoleCatalogRecord[]>,
  ]);

  const failures: LoadFailure[] = [];
  const userPayload: TenantUsersResponse | null =
    usersResult.status === "fulfilled" ? usersResult.value : null;
  const userItems =
    userPayload === null
      ? []
      : Array.isArray(userPayload)
        ? userPayload
        : userPayload.items;
  const users = [...userItems].sort(compareUsers);
  const roles =
    rolesResult.status === "fulfilled"
      ? [...rolesResult.value].sort(compareRoles)
      : [];

  if (usersResult.status === "rejected") {
    const message = toErrorMessage(usersResult.reason, locale);
    failures.push({
      source: "users",
      message,
      reason: classifyFailureReason(message),
    });
  }
  if (rolesResult.status === "rejected") {
    const message = toErrorMessage(rolesResult.reason, locale);
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
        ? toErrorMessage(identityResult.reason, locale)
        : null,
    users,
    roles,
    failures,
    availableActions:
      userPayload !== null &&
      !Array.isArray(userPayload) &&
      Array.isArray(userPayload.availableActions)
        ? userPayload.availableActions
        : [],
    emptyState:
      userPayload !== null && !Array.isArray(userPayload)
        ? (userPayload.emptyState ?? null)
        : null,
    refreshMetadata:
      userPayload !== null && !Array.isArray(userPayload)
        ? (userPayload.refreshMetadata ?? null)
        : null,
    crossAppLinks:
      userPayload !== null &&
      !Array.isArray(userPayload) &&
      Array.isArray(userPayload.crossAppLinks)
        ? userPayload.crossAppLinks
        : [],
  };
}

function getActionLabel(action: string, locale: Locale) {
  switch (action) {
    case "invite":
    case "create_user":
    case "create_tenant_user":
      return t("users.action.invite", locale);
    case "resend_invitation":
    case "resend_invite":
      return t("users.action.resendInvite", locale);
    case "update_role":
    case "role":
    case "update_tenant_role":
      return t("users.action.updateRole", locale);
    case "suspend":
      return t("users.action.suspend", locale);
    case "refresh":
      return t("users.action.refresh", locale);
    default:
      return t("users.action.unknown", locale, {
        action,
      });
  }
}

function getActionTitle(
  descriptor: ResourceActionDescriptor,
  locale: Locale,
) {
  const actionLabel = getActionLabel(descriptor.action, locale);
  if (!descriptor.enabled) {
    return descriptor.disabledReasonCode ?? actionLabel;
  }
  if (descriptor.requiresReason) {
    return t("users.action.requiresReasonTitle", locale, {
      action: actionLabel,
    });
  }
  return actionLabel;
}

function getActionIcon(action: string) {
  switch (action) {
    case "invite":
    case "create_user":
    case "create_tenant_user":
      return "plus";
    case "resend_invitation":
    case "resend_invite":
    case "refresh":
      return "refresh";
    case "suspend":
      return "warn";
    default:
      return undefined;
  }
}

function getActionSortOrder(action: string) {
  switch (action) {
    case "invite":
    case "create_user":
    case "create_tenant_user":
      return 0;
    case "resend_invitation":
    case "resend_invite":
      return 1;
    case "update_role":
    case "role":
    case "update_tenant_role":
      return 2;
    case "suspend":
      return 3;
    case "refresh":
      return 4;
    default:
      return 100;
  }
}

function sortAvailableActions(actions: ResourceActionDescriptor[]) {
  return [...actions].sort((left, right) => {
    const orderDelta =
      getActionSortOrder(left.action) - getActionSortOrder(right.action);
    if (orderDelta !== 0) return orderDelta;
    return left.action.localeCompare(right.action, "en");
  });
}

function ActionDescriptorButton({
  descriptor,
  label,
  icon,
  href,
  size = "sm",
  locale,
}: {
  descriptor: ResourceActionDescriptor | undefined;
  label: string;
  icon?: "plus" | "refresh" | "warn" | "ext" | undefined;
  href?: string | undefined;
  size?: "xs" | "sm" | "md";
  locale: Locale;
}) {
  if (!descriptor) return null;
  const danger = descriptor.riskLevel === "high";
  const variant = descriptor.riskLevel === "medium" ? "primary" : "secondary";
  const title = getActionTitle(descriptor, locale);

  const button = (
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

  if (href && descriptor.enabled) {
    return (
      <a href={href} style={{ textDecoration: "none" }}>
        {button}
      </a>
    );
  }

  return button;
}

function ActionDescriptorList({
  actions,
  size = "sm",
  excludeActions = [],
  resolveHref,
  locale,
}: {
  actions: ResourceActionDescriptor[];
  size?: "xs" | "sm" | "md";
  excludeActions?: string[];
  resolveHref?: (descriptor: ResourceActionDescriptor) => string | undefined;
  locale: Locale;
}) {
  const visibleActions = sortAvailableActions(actions).filter(
    (descriptor) => !excludeActions.includes(descriptor.action),
  );
  if (visibleActions.length === 0) return null;

  return (
    <>
      {visibleActions.map((descriptor) => (
        <ActionDescriptorButton
          key={descriptor.action}
          descriptor={descriptor}
          label={getActionLabel(descriptor.action, locale)}
          size={size}
          href={resolveHref?.(descriptor)}
          locale={locale}
          {...(getActionIcon(descriptor.action)
            ? { icon: getActionIcon(descriptor.action) }
            : {})}
        />
      ))}
    </>
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
  locale,
}: {
  reason: EmptyReason;
  config: EmptyStateConfig;
  locale: Locale;
}) {
  return (
    <div style={emptyStateStyle}>
      <CanvasPill theme={th} tone={config.tone}>
        {getFailureReasonLabel(reason, locale)}
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
          label={getActionLabel(config.nextAction.action, locale)}
          icon={config.nextAction.action === "refresh" ? "refresh" : "plus"}
          locale={locale}
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

function getActorChip(
  identity: IdentityContext | null,
  tenantId: string,
  locale: Locale,
) {
  return t("users.identity.actorChip", locale, {
    actor: identity?.actorId ?? identity?.actorType ?? t("users.identity.unknownActor", locale),
    realm: identity?.realm ?? t("users.identity.realmTenant", locale),
    tenantId: identity?.tenantId ?? tenantId,
  });
}

function getActorSummary(identity: IdentityContext | null, locale: Locale) {
  if (!identity) return t("users.identity.summaryUnavailable", locale);
  return t("users.identity.summary", locale, {
    actor: identity.actorId ?? identity.actorType,
    authMode: identity.authMode,
    roles: identity.roles.join(", ") || t("users.value.none", locale),
  });
}

function getFailureSourceLabel(source: LoadFailure["source"], locale: Locale) {
  return t(
    source === "users" ? "users.failure.source.users" : "users.failure.source.roles",
    locale,
  );
}

function getFailureReasonLabel(reason: EmptyReason, locale: Locale) {
  switch (reason) {
    case "not_provisioned":
      return t("users.failure.reason.notProvisioned", locale);
    case "permission_denied":
      return t("users.failure.reason.permissionDenied", locale);
    case "external_unavailable":
      return t("users.failure.reason.externalUnavailable", locale);
    case "filtered_empty":
      return t("users.failure.reason.filteredEmpty", locale);
    case "no_data":
      return t("users.failure.reason.noData", locale);
    case "fetch_failed":
    default:
      return t("users.failure.reason.fetchFailed", locale);
  }
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const locale = await getServerLocale();
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
  } = await loadUsersData(locale);
  const refreshHref = buildQueryString(resolvedSearchParams, {
    refreshedAt: Date.now().toString(),
  });
  const tenantId = identity?.tenantId ?? users[0]?.tenantId ?? "";
  const assignableRoles = roles.filter((role) => role.assignable);
  const roleFilter = normalizeRoleFilter(resolvedSearchParams.role, roles);
  const statusFilter = normalizeStatusFilter(resolvedSearchParams.status);
  const selfOnlyAdminRoster = hasOnlyTenantAdminRoster(users);
  const inviteAction = pickAction(availableActions, [
    "invite",
    "create_user",
    "create_tenant_user",
  ]);
  const refreshAction = pickAction(availableActions, ["refresh"]);
  const rowRoleActionNames = ["update_role", "role", "update_tenant_role"];
  const rowSuspendActionNames = ["suspend"];
  const rowResendActionNames = ["resend_invitation", "resend_invite"];

  const filteredUsers = users.filter((user) => {
    if (roleFilter !== "all" && user.roleCode !== roleFilter) return false;
    if (statusFilter !== "all" && user.status !== statusFilter) return false;
    return true;
  });

  const userRows = buildUserRows(filteredUsers, roles, locale);
  const emptyReason = deriveEmptyReason({
    filteredUsersCount: filteredUsers.length,
    usersCount: users.length,
    rolesCount: roles.length,
    failures,
    emptyState,
    hasOnlyTenantAdminRoster: selfOnlyAdminRoster,
  });
  const emptyConfig = emptyReason
    ? getEmptyStateConfig(
        emptyReason,
        emptyState?.nextAction ??
          (emptyReason === "fetch_failed" ||
          emptyReason === "external_unavailable"
            ? refreshAction
            : inviteAction),
        refreshHref,
        locale,
      )
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
      h: t("users.table.name", locale),
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
      h: t("users.table.email", locale),
      k: "email",
      mono: true,
      w: 220,
    },
    {
      h: t("users.table.role", locale),
      k: "roleCode",
      w: 180,
      r: (row) => (
        <div style={userPrimaryStyle}>
          <CanvasPill theme={th} tone={getRoleTone(row.roleCode)}>
            {getRoleLabel(row.roleCode, locale)}
          </CanvasPill>
          <span style={userMetaStyle}>{row.roleDisplayName}</span>
        </div>
      ),
    },
    {
      h: t("users.table.status", locale),
      w: 130,
      r: (row) => (
        <CanvasPill theme={th} tone={getStateTone(row.status)} dot>
          {getStateLabel(row.status, locale)}
        </CanvasPill>
      ),
    },
    {
      h: t("users.table.invitedAt", locale),
      w: 150,
      mono: true,
      r: (row) => formatUpdated(row.invitedAt, locale),
    },
    {
      h: t("users.table.lastLogin", locale),
      w: 150,
      mono: true,
      r: (row) => formatUpdated(row.lastLoginAt, locale),
    },
    {
      h: t("users.table.updated", locale),
      w: 150,
      mono: true,
      r: (row) => formatUpdated(row.updatedAt, locale),
    },
    {
      h: t("users.table.actions", locale),
      w: 260,
      r: (row) => (
        <div style={rowActionMetaStyle}>
          <div style={rowActionStyle}>
            <ActionDescriptorList
              actions={row.availableActions}
              size="xs"
              excludeActions={["refresh"]}
              locale={locale}
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={t("users.header.title", locale)}
        subtitle={t("users.header.subtitle", locale)}
        actions={
          <>
            <ActionDescriptorList
              actions={availableActions}
              resolveHref={(descriptor) =>
                descriptor.action === "refresh" ? refreshHref : undefined
              }
              locale={locale}
            />
          </>
        }
      />

      <div style={pageBodyStyle}>
        {backendRefreshMetadata ? (
          <CanvasBanner
            theme={th}
            tone={getRefreshTone(backendRefreshMetadata)}
            icon="refresh"
            title={t("users.banner.snapshot.title", locale, {
              value: formatUpdated(backendRefreshMetadata.generatedAt, locale),
            })}
            body={t("users.banner.snapshot.body", locale, {
              tier: TENANT_REFRESH_TIER,
              seconds: TENANT_REFRESH_CADENCE_MS / 1000,
              summary: getRefreshSummary(backendRefreshMetadata, locale),
            })}
          />
        ) : null}

        {identityError ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("users.banner.identityFailed.title", locale)}
            body={t("users.banner.identityFailed.body", locale, {
              message: identityError,
            })}
          />
        ) : null}

        {failures.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("users.banner.degraded.title", locale)}
            body={failures
              .map(
                (failure) =>
                  `${getFailureSourceLabel(failure.source, locale)}: ${getFailureReasonLabel(failure.reason, locale)} · ${failure.message}`,
              )
              .join(" · ")}
          />
        ) : null}

        <div style={stripGridStyle}>
          <div style={stripCardStyle}>
            <div style={stripLabelStyle}>{t("users.strip.entry.label", locale)}</div>
            <div style={routeCodeStyle}>/users</div>
            <div style={stripValueStyle}>{t("users.strip.entry.value", locale)}</div>
            <div style={hintCopyStyle}>{t("users.strip.entry.body", locale)}</div>
          </div>

          <div style={stripCardStyle}>
            <div style={stripLabelStyle}>{t("users.strip.identity.label", locale)}</div>
            <div style={stripValueStyle}>
              {getActorChip(identity, tenantId, locale)}
            </div>
            <div style={hintCopyStyle}>{getActorSummary(identity, locale)}</div>
          </div>

          <div style={stripCardStyle}>
            <div style={stripLabelStyle}>{t("users.strip.roster.label", locale)}</div>
            <div style={pillRowStyle}>
              <CanvasPill theme={th} tone="accent">
                {t("users.count.users", locale, {
                  count: formatCount(users.length, locale),
                })}
              </CanvasPill>
              <CanvasPill theme={th} tone="success">
                {t("users.count.active", locale, {
                  count: formatCount(activeUsers, locale),
                })}
              </CanvasPill>
              <CanvasPill theme={th} tone="warn">
                {t("users.count.pendingInvite", locale, {
                  count: formatCount(invitedUsers, locale),
                })}
              </CanvasPill>
              <CanvasPill theme={th} tone="neutral">
                {t("users.count.suspended", locale, {
                  count: formatCount(suspendedUsers, locale),
                })}
              </CanvasPill>
            </div>
            <div style={hintCopyStyle}>
              {t("users.strip.roster.latestUpdate", locale, {
                value: latestUpdated ? formatUpdated(latestUpdated, locale) : "—",
              })}
            </div>
          </div>

          <div style={stripCardStyle}>
            <div style={stripLabelStyle}>{t("users.strip.audit.label", locale)}</div>
            <div style={stripValueStyle}>{t("users.strip.audit.value", locale)}</div>
            <div style={hintCopyStyle}>{t("users.strip.audit.body", locale)}</div>
          </div>
        </div>

        <div style={summaryGridStyle}>
          <CanvasCard
            theme={th}
            title={t("users.filters.title", locale)}
            subtitle={t("users.filters.subtitle", locale)}
          >
            <div style={stackStyle}>
              <CanvasField
                theme={th}
                label={t("users.filters.role.label", locale)}
                hint={t("users.filters.role.hint", locale)}
              >
                <div style={pillRowStyle}>
                  <FilterPillLink
                    href={allRoleHref}
                    active={roleFilter === "all"}
                    label={t("users.filters.role.all", locale)}
                    tone="accent"
                  />
                  {roles.map((role) => (
                    <FilterPillLink
                      key={role.roleCode}
                      href={buildQueryString(resolvedSearchParams, {
                        role: role.roleCode,
                      })}
                      active={roleFilter === role.roleCode}
                      label={getRoleLabel(role.roleCode, locale)}
                      tone={getRoleCatalogTone(role)}
                    />
                  ))}
                </div>
              </CanvasField>

              <CanvasField
                theme={th}
                label={t("users.filters.status.label", locale)}
                hint={t("users.filters.status.hint", locale)}
              >
                <div style={pillRowStyle}>
                  <FilterPillLink
                    href={allStatusHref}
                    active={statusFilter === "all"}
                    label={t("users.filters.status.all", locale)}
                    tone="accent"
                  />
                  <FilterPillLink
                    href={buildQueryString(resolvedSearchParams, {
                      status: "active",
                    })}
                    active={statusFilter === "active"}
                    label={t("users.status.active", locale)}
                    tone="success"
                  />
                  <FilterPillLink
                    href={buildQueryString(resolvedSearchParams, {
                      status: "invited",
                    })}
                    active={statusFilter === "invited"}
                    label={t("users.status.pendingInvite", locale)}
                    tone="warn"
                  />
                  <FilterPillLink
                    href={buildQueryString(resolvedSearchParams, {
                      status: "suspended",
                    })}
                    active={statusFilter === "suspended"}
                    label={t("users.status.suspended", locale)}
                    tone="neutral"
                  />
                </div>
              </CanvasField>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={t("users.metrics.title", locale)}
            subtitle={t("users.metrics.subtitle", locale)}
          >
            <div style={stackStyle}>
              <div style={metricGridStyle}>
                <div style={metricCardStyle}>
                  <div style={metricValueStyle}>
                    {formatCount(emptyReason ? 0 : filteredUsers.length, locale)}
                  </div>
                  <div style={metricLabelStyle}>{t("users.metrics.visibleRows", locale)}</div>
                </div>
                <div style={metricCardStyle}>
                  <div style={metricValueStyle}>
                    {formatCount(assignableRoles.length, locale)} /{" "}
                    {formatCount(roles.length, locale)}
                  </div>
                  <div style={metricLabelStyle}>
                    {t("users.metrics.assignableRoles", locale)}
                  </div>
                </div>
              </div>

              <CanvasDL
                theme={th}
                cols={1}
                items={[
                  {
                    k: t("users.meta.primaryPersona", locale),
                    v: t("users.meta.primaryPersonaValue", locale),
                    mono: true,
                  },
                  {
                    k: t("users.meta.entryExit", locale),
                    v: t("users.meta.entryExitValue", locale),
                    mono: true,
                  },
                  {
                    k: t("users.meta.mustSupportActions", locale),
                    v:
                      sortAvailableActions(availableActions)
                        .map((descriptor) => descriptor.action)
                        .join(" / ") || t("users.value.runtimeUnavailable", locale),
                    mono: true,
                  },
                  {
                    k: t("users.meta.refreshTier", locale),
                    v: `T5 / ${TENANT_REFRESH_TIER} / ${TENANT_REFRESH_CADENCE_MS / 1000}s`,
                    mono: true,
                  },
                  {
                    k: t("users.meta.snapshotGenerated", locale),
                    v: backendRefreshMetadata
                      ? formatUpdated(backendRefreshMetadata.generatedAt, locale)
                      : t("users.value.runtimeUnavailable", locale),
                    mono: true,
                  },
                  {
                    k: t("users.meta.freshnessSource", locale),
                    v: backendRefreshMetadata
                      ? `${getRefreshFreshnessLabel(backendRefreshMetadata.dataFreshness, locale)} / ${backendRefreshMetadata.source}`
                      : t("users.value.runtimeUnavailable", locale),
                    mono: true,
                  },
                  {
                    k: t("users.meta.staleAfter", locale),
                    v: backendRefreshMetadata
                      ? formatDurationMs(backendRefreshMetadata.staleAfterMs)
                      : t("users.value.runtimeUnavailable", locale),
                    mono: true,
                  },
                  {
                    k: t("users.meta.tenantAudit", locale),
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
          title={t("users.tableCard.title", locale)}
          subtitle={t("users.tableCard.subtitle", locale)}
          padding={0}
        >
          {emptyReason && emptyConfig ? (
            <EmptyStateBlock
              reason={emptyReason}
              config={emptyConfig}
              locale={locale}
            />
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
            title={t("users.roles.title", locale)}
            subtitle={t("users.roles.subtitle", locale)}
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
                    <div style={compactMetaStyle}>
                      {role.assignable
                        ? t("users.roles.assignable", locale)
                        : t("users.roles.systemManaged", locale)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={hintCopyStyle}>{t("users.roles.empty", locale)}</div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={t("users.crossApp.title", locale)}
            subtitle={t("users.crossApp.subtitle", locale)}
          >
            <div style={cardStackStyle}>
              <div style={authorityMetaStyle}>
                <span>{t("users.crossApp.linksLabel", locale)}</span>
                <CanvasPill theme={th} tone="info">
                  {t("users.crossApp.newTab", locale)}
                </CanvasPill>
              </div>
              <div style={linkStackStyle}>
                <a
                  href="/audit?resourceType=tenant_user_role"
                  style={linkCardStyle}
                >
                  <span style={linkTitleStyle}>
                    {t("users.crossApp.auditTitle", locale)}
                  </span>
                  <span style={linkMetaStyle}>{t("users.crossApp.auditBody", locale)}</span>
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
                    <span style={linkTitleStyle}>
                      {link.label}{" "}
                      <span style={compactMetaStyle}>[{link.openMode}]</span>
                    </span>
                    <span style={linkMetaStyle}>
                      {link.targetApp} · {link.route} · {link.resourceType}:
                      {link.resourceId}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={t("users.contract.title", locale)}
            subtitle={t("users.contract.subtitle", locale)}
          >
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                {
                  k: t("users.contract.inviteUser", locale),
                  v: inviteAction
                    ? inviteAction.enabled
                      ? t("users.contract.runtimePrimary", locale)
                      : t("users.contract.disabled", locale, {
                          reason: inviteAction.disabledReasonCode ?? "runtime",
                        })
                    : t("users.contract.notReturned", locale),
                },
                {
                  k: t("users.contract.updateRole", locale),
                  v: userRows.some((row) =>
                    row.availableActions.some((action) =>
                      rowRoleActionNames.includes(action.action),
                    ),
                  )
                    ? t("users.contract.rowLevel", locale)
                    : t("users.contract.notReturned", locale),
                },
                {
                  k: t("users.contract.suspend", locale),
                  v: userRows.some((row) =>
                    row.availableActions.some((action) =>
                      rowSuspendActionNames.includes(action.action),
                    ),
                  )
                    ? t("users.contract.highRisk", locale)
                    : t("users.contract.notReturned", locale),
                },
                {
                  k: t("users.contract.resendInvitation", locale),
                  v: userRows.some((row) =>
                    row.availableActions.some((action) =>
                      rowResendActionNames.includes(action.action),
                    ),
                  )
                    ? t("users.contract.invitedRows", locale)
                    : t("users.contract.notReturned", locale),
                },
              ]}
            />
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}

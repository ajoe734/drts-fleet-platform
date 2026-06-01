"use client";

import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type {
  CrossAppResourceLink,
  EmptyReason,
  PlatformAdminUserRecord,
  PlatformAdminUserStatus,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasIcon,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type UserFilter = "all" | PlatformAdminUserStatus;
type PlatformAdminUserRoleCode =
  | "pa_super_admin"
  | "pa_tenant_mgr"
  | "pa_partner_mgr"
  | "pa_fleet_gov"
  | "pa_finance_gov"
  | "pa_ops_risk_gov";
type PlatformAdminUserRuntimeRecord = Omit<
  PlatformAdminUserRecord,
  "roleCode"
> & {
  roleCode: PlatformAdminUserRoleCode;
  availableActions: ResourceActionDescriptor[];
  resourceLinks?: CrossAppResourceLink[];
};
type PlatformAdminUsersRuntimeView = {
  items: PlatformAdminUserRuntimeRecord[];
  availableActions: ResourceActionDescriptor[];
  refresh: {
    generatedAt: string;
    staleAfterMs: number;
    dataFreshness: string;
    source: string;
  };
  health: {
    status: string;
    degradedServices: Array<{
      service: string;
      impact: string;
      severity: "warning" | "critical";
    }>;
    lastCheckedAt: string;
  };
  emptyState?: {
    reason: EmptyReason;
    messageCode: string;
    nextAction?: ResourceActionDescriptor;
  };
};
type PlatformAdminUserMutationRuntimeResult = {
  user: PlatformAdminUserRuntimeRecord;
  receipt: {
    message: string;
  };
};
type UserTableRow = PlatformAdminUserRuntimeRecord;
type ActionMode = "role" | "suspend" | "reactivate";
type UsersEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;
type ActionDraft = {
  userId: string;
  mode: ActionMode;
  descriptor: ResourceActionDescriptor;
  roleCode: PlatformAdminUserRoleCode;
  reason: string;
};

const PLATFORM_USER_ROLE_CODES: PlatformAdminUserRoleCode[] = [
  "pa_super_admin",
  "pa_tenant_mgr",
  "pa_partner_mgr",
  "pa_fleet_gov",
  "pa_finance_gov",
  "pa_ops_risk_gov",
];

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageStackStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const pillsRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const pillButtonStyle = {
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "pointer",
} satisfies CSSProperties;

const workspaceGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
} satisfies CSSProperties;

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0 14px",
} satisfies CSSProperties;

const utilityRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 16,
} satisfies CSSProperties;

const utilityMetaStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const inlineActionsStyle = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
} satisfies CSSProperties;

const selectedUserButtonStyle = (active: boolean): CSSProperties => ({
  border: "none",
  background: "transparent",
  padding: 0,
  textAlign: "left",
  cursor: "pointer",
  width: "100%",
  color: "inherit",
  opacity: active ? 1 : 0.92,
});

const userCellStyle = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  minWidth: 0,
} satisfies CSSProperties;

const userAvatarStyle = {
  width: 28,
  height: 28,
  borderRadius: 14,
  background: theme.accentBg,
  border: `1px solid ${theme.accentBorder}`,
  color: theme.accent,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
} satisfies CSSProperties;

const userPrimaryStyle = {
  color: theme.text,
  fontWeight: 600,
} satisfies CSSProperties;

const userSecondaryStyle = {
  fontSize: 11,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
} satisfies CSSProperties;

const inputBaseStyle = (mono = false): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: mono ? theme.monoFamily : theme.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
});

const selectBaseStyle = inputBaseStyle(true);

const submitButtonStyle = (disabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 14px",
  minHeight: 34,
  fontSize: 13,
  fontWeight: 600,
  background: theme.accent,
  color: "#fff",
  border: `1px solid ${theme.accent}`,
  borderRadius: 7,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  fontFamily: theme.fontFamily,
});

const linkListStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} satisfies CSSProperties;

const deepLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 999,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  color: theme.textMuted,
  textDecoration: "none",
  padding: "5px 9px",
  fontSize: 11.5,
} satisfies CSSProperties;

const railStackStyle = {
  display: "grid",
  gap: 16,
  alignContent: "start",
} satisfies CSSProperties;

const emptyStateStackStyle = {
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGov: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGov: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGov: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformLayer: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGov: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleetGov: "車隊與法遵",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGov: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          platformLayer: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", icon: "home", label: labels.home },
    {
      key: "health",
      href: "/health",
      icon: "health",
      label: labels.health,
      badge: "2",
      badgeTone: "warn",
    },
    { divider: labels.tenantGov },
    { key: "tenants", href: "/tenants", icon: "tenants", label: labels.tenants },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: labels.partners,
    },
    { key: "users", href: "/users", icon: "users", label: labels.users },
    { divider: labels.fleetGov },
    { key: "fleet", href: "/fleet", icon: "fleet", label: labels.fleet },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: labels.switchboard,
    },
    { divider: labels.pricingGov },
    { key: "pricing", href: "/pricing", icon: "pricing", label: labels.pricing },
    {
      key: "payments",
      href: "/payments",
      icon: "payments",
      label: labels.payments,
      badge: "3",
      badgeTone: "danger",
    },
    { divider: labels.platformLayer },
    {
      key: "notices",
      href: "/notices",
      icon: "notices",
      label: labels.notices,
    },
    { key: "audit", href: "/audit", icon: "audit", label: labels.audit },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags",
      label: labels.flags,
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "adapters",
      label: labels.adapters,
    },
  ];
}

function statusTone(status: PlatformAdminUserStatus): CanvasTone {
  switch (status) {
    case "active":
      return "success";
    case "suspended":
      return "danger";
    case "invited":
    default:
      return "warn";
  }
}

function actionTone(action: ResourceActionDescriptor): "primary" | "secondary" {
  return action.riskLevel === "medium" ? "secondary" : "primary";
}

function getActionLabel(locale: string, action: ResourceActionDescriptor) {
  const labels =
    locale === "en"
      ? {
          create_platform_admin_user: "Invite user",
          update_role: "Update role",
          suspend_user: "Suspend",
          reactivate_user: "Reactivate",
        }
      : {
          create_platform_admin_user: "邀請人員",
          update_role: "更新角色",
          suspend_user: "停用",
          reactivate_user: "恢復",
        };
  return labels[action.action as keyof typeof labels] ?? action.action;
}

function getDisabledReasonLabel(locale: string, reasonCode?: string) {
  if (!reasonCode) {
    return undefined;
  }

  const labels =
    locale === "en"
      ? {
          role_locked_last_super_admin:
            "The final super admin cannot be edited in the demo backend.",
        }
      : {
          role_locked_last_super_admin:
            "示範後端禁止修改最後一位 super admin。",
        };

  return labels[reasonCode as keyof typeof labels] ?? reasonCode;
}

function normalizeEmptyReason(reason: EmptyReason): UsersEmptyReason {
  if (reason === "driver_not_eligible") {
    return "fetch_failed";
  }
  return reason;
}

function getEmptyCopy(
  locale: string,
  reason: UsersEmptyReason,
  hasNextAction: boolean,
): { title: string; body: string; tone: Exclude<CanvasTone, "neutral"> } {
  const zh: Record<
    UsersEmptyReason,
    { title: string; body: string; tone: Exclude<CanvasTone, "neutral"> }
  > = {
    no_data: {
      title: "目前沒有平台人員紀錄",
      body: hasNextAction
        ? "先建立第一位平台人員，之後再由 availableActions 驅動後續治理動作。"
        : "目前沒有平台人員資料。",
      tone: "info" as const,
    },
    not_provisioned: {
      title: "平台人員模組尚未佈建",
      body: "這個環境尚未完成 identity governance 初始化，需先完成佈建。",
      tone: "warn" as const,
    },
    fetch_failed: {
      title: "載入平台人員失敗",
      body: "資料抓取失敗。請重新整理，或先檢查控制平面與 API 狀態。",
      tone: "danger" as const,
    },
    permission_denied: {
      title: "目前帳號沒有讀取權限",
      body: "此頁資料已被後端以 permission_denied 回覆，請改由具權限角色登入。",
      tone: "danger" as const,
    },
    external_unavailable: {
      title: "外部身分服務暫時不可用",
      body: "目前無法取得平台使用者目錄，請稍後重試。",
      tone: "warn" as const,
    },
    filtered_empty: {
      title: "目前篩選條件下沒有結果",
      body: "資料存在，但目前 tab 沒有符合的使用者。請切換狀態檢視。",
      tone: "info" as const,
    },
  };
  const en: Record<
    UsersEmptyReason,
    { title: string; body: string; tone: Exclude<CanvasTone, "neutral"> }
  > = {
    no_data: {
      title: "No platform users yet",
      body: hasNextAction
        ? "Create the first platform user and let availableActions drive the next governance step."
        : "There are no platform user records yet.",
      tone: "info" as const,
    },
    not_provisioned: {
      title: "User governance is not provisioned",
      body: "Identity governance has not been provisioned for this environment yet.",
      tone: "warn" as const,
    },
    fetch_failed: {
      title: "Unable to load platform users",
      body: "The fetch failed. Refresh, then inspect control-plane and API health if it persists.",
      tone: "danger" as const,
    },
    permission_denied: {
      title: "Permission denied",
      body: "The backend returned permission_denied for this actor. Use an authorized platform role.",
      tone: "danger" as const,
    },
    external_unavailable: {
      title: "External identity service unavailable",
      body: "Platform user directory data is temporarily unavailable.",
      tone: "warn" as const,
    },
    filtered_empty: {
      title: "No users match this filter",
      body: "Data exists, but the current status tab has no matching users.",
      tone: "info" as const,
    },
  };

  return (locale === "en" ? en : zh)[reason];
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  const baseByTargetApp: Record<
    CrossAppResourceLink["targetApp"],
    string | undefined
  > = {
    "ops-console": process.env.NEXT_PUBLIC_OPS_CONSOLE_URL,
    "tenant-console": process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL,
    "platform-admin": process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL,
  };

  const base = baseByTargetApp[link.targetApp];
  if (!base) {
    return link.route;
  }

  return `${base.replace(/\/$/, "")}${link.route}`;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "PA";
  }
  if (parts.length === 1) {
    return (parts[0] ?? "PA").slice(0, 2).toUpperCase();
  }
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function createActionDraft(
  user: PlatformAdminUserRuntimeRecord,
  descriptor: ResourceActionDescriptor,
  mode: ActionMode,
): ActionDraft {
  return {
    userId: user.userId,
    mode,
    descriptor,
    roleCode: user.roleCode,
    reason: "",
  };
}

export default function UsersPage() {
  const client = usePlatformAdminClient();
  const { locale, t } = useTranslation();
  const [view, setView] = useState<PlatformAdminUsersRuntimeView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<UserFilter>("all");
  const [showFilters, setShowFilters] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createRoleCode, setCreateRoleCode] =
    useState<PlatformAdminUserRoleCode>("pa_tenant_mgr");
  const [creating, setCreating] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null);
  const [mutatingUserId, setMutatingUserId] = useState<string | null>(null);
  const [receiptMessage, setReceiptMessage] = useState<string | null>(null);

  const copy = useMemo(
    () =>
      locale === "en"
        ? {
            title: "Platform users",
            subtitle: "Six internal roles. RBAC gatekeeping stays backend-authored.",
            breadcrumbRoot: "Tenant Governance",
            searchPlaceholder: "Search users, email, role, audit...",
            filterAction: "Filters",
            hideFilters: "Hide filters",
            refresh: "Refresh",
            refreshing: "Refreshing...",
            tableTitle: "Platform users",
            tableSubtitle:
              "Required fields: user id, display name, email, role, status, updated time.",
            summaryTitle: "Governance context",
            summarySubtitle:
              "Refresh posture, degraded services, and cross-app links for the selected user.",
            inviteTitle: "Invite platform user",
            inviteSubtitle:
              "Create the internal user record first, then let invitation and role governance flow from the platform layer.",
            actionTitle: "Pending governance action",
            actionSubtitle:
              "Role changes, suspensions, and reactivation must respect the server-returned action descriptor.",
            errorTitle: "Unable to load platform users",
            attentionTitle: "Suspended or pending invitations need review",
            attentionBody: (count: number) =>
              `${count} record(s) are invited or suspended and should stay visible.`,
            refreshMeta: "Refresh tier T4 · 30s cadence",
            healthHealthy: "Data source healthy",
            healthDegraded: "Degraded services",
            actionLinks: "Cross-app links",
            selectedUserTitle: "Selected user",
            noSelectedUser: "Select a row to inspect role context and deep links.",
            noLinks: "No cross-app links are exposed for this role.",
            statusFilterAll: "All",
            createSubmit: "Send invite",
            saveRole: "Apply role update",
            saveSuspend: "Suspend user",
            saveReactivate: "Reactivate user",
            reasonLabel: "Reason",
            roleLabel: "Role",
            nameLabel: "Display name",
            emailLabel: "Email",
            updatedLabel: "Updated",
            userIdLabel: "User ID",
            selectedLabel: "Selected action",
            freshnessLabel: "Freshness",
            generatedLabel: "Generated",
            refreshTierLabel: "Refresh tier",
            sourceLabel: "Source",
            filterTitle: "Status filters",
            filterSubtitle:
              "Pending invitation and suspended rows stay visible in the same list.",
            tableEmpty: "No user rows available.",
            createSuccess: "Invite created.",
          }
        : {
            title: "平台人員",
            subtitle: "6 個角色，RBAC 守門與可執行動作都以後端為準。",
            breadcrumbRoot: "租戶治理",
            searchPlaceholder: "搜尋使用者、email、角色、audit...",
            filterAction: "篩選",
            hideFilters: "收合篩選",
            refresh: "重新整理",
            refreshing: "重新整理中...",
            tableTitle: "平台人員",
            tableSubtitle:
              "必備欄位：user id、display name、email、role code、status、updated time。",
            summaryTitle: "治理上下文",
            summarySubtitle:
              "集中顯示 refresh posture、degraded services 與所選人員的 cross-app deep links。",
            inviteTitle: "邀請平台人員",
            inviteSubtitle:
              "先建立平台內部使用者主檔，再由平台層治理邀請、角色與停復權。",
            actionTitle: "待執行治理動作",
            actionSubtitle:
              "角色調整、停用與恢復都必須遵守後端 action descriptor 的限制。",
            errorTitle: "無法載入平台人員",
            attentionTitle: "有待追蹤的邀請或停用狀態",
            attentionBody: (count: number) =>
              `共有 ${count} 筆 invited 或 suspended 紀錄，需持續可見。`,
            refreshMeta: "Refresh tier T4 · 30 秒輪詢",
            healthHealthy: "資料來源正常",
            healthDegraded: "降級服務",
            actionLinks: "跨系統 deep links",
            selectedUserTitle: "目前選取的人員",
            noSelectedUser: "請先選取一列，以查看角色上下文與 deep links。",
            noLinks: "此角色目前沒有可用的跨 app deep links。",
            statusFilterAll: "全部",
            createSubmit: "送出邀請",
            saveRole: "套用角色變更",
            saveSuspend: "停用使用者",
            saveReactivate: "恢復使用者",
            reasonLabel: "原因",
            roleLabel: "角色",
            nameLabel: "顯示名稱",
            emailLabel: "Email",
            updatedLabel: "更新時間",
            userIdLabel: "User ID",
            selectedLabel: "目前動作",
            freshnessLabel: "資料新鮮度",
            generatedLabel: "產生時間",
            refreshTierLabel: "Refresh tier",
            sourceLabel: "資料來源",
            filterTitle: "狀態篩選",
            filterSubtitle: "invited 與 suspended 必須留在同一份名單中持續可見。",
            tableEmpty: "目前沒有可顯示的使用者列。",
            createSuccess: "已建立邀請。",
          },
    [locale],
  );

  const loadView = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextView =
        await client.get<PlatformAdminUsersRuntimeView>("/api/platform-admin/users");
      setView(nextView);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setView((current: PlatformAdminUsersRuntimeView | null) => current);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadView();
  }, [loadView]);

  useEffect(() => {
    if (!view?.refresh.staleAfterMs) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadView();
    }, view.refresh.staleAfterMs);

    return () => window.clearTimeout(timer);
  }, [loadView, view?.refresh.generatedAt, view?.refresh.staleAfterMs]);

  const users = view?.items ?? [];
  const listAction = view?.availableActions.find(
    (action: ResourceActionDescriptor) =>
      action.action === "create_platform_admin_user",
  );

  const counts = useMemo(
    () => ({
      all: users.length,
      active: users.filter((user: PlatformAdminUserRuntimeRecord) => user.status === "active").length,
      invited: users.filter((user: PlatformAdminUserRuntimeRecord) => user.status === "invited").length,
      suspended: users.filter((user: PlatformAdminUserRuntimeRecord) => user.status === "suspended").length,
      attention: users.filter((user: PlatformAdminUserRuntimeRecord) => user.status !== "active").length,
    }),
    [users],
  );

  const visibleUsers = useMemo(() => {
    if (filter === "all") {
      return users;
    }
    return users.filter((user: PlatformAdminUserRuntimeRecord) => user.status === filter);
  }, [filter, users]);

  const selectedUser = useMemo(
    () =>
      users.find(
        (user: PlatformAdminUserRuntimeRecord) => user.userId === selectedUserId,
      ) ?? null,
    [selectedUserId, users],
  );

  useEffect(() => {
    if (
      selectedUserId &&
      users.some(
        (user: PlatformAdminUserRuntimeRecord) => user.userId === selectedUserId,
      )
    ) {
      return;
    }
    setSelectedUserId(visibleUsers[0]?.userId ?? users[0]?.userId ?? null);
  }, [selectedUserId, users, visibleUsers]);

  const effectiveEmptyReason: UsersEmptyReason | null = useMemo(() => {
    if (loading) {
      return null;
    }
    if (error && users.length === 0) {
      return "fetch_failed";
    }
    if (view?.emptyState?.reason && users.length === 0) {
      return normalizeEmptyReason(view.emptyState.reason);
    }
    if (users.length > 0 && visibleUsers.length === 0) {
      return "filtered_empty";
    }
    return null;
  }, [error, loading, users.length, view?.emptyState?.reason, visibleUsers.length]);

  const filterPills = useMemo(
    () => [
      { value: "all" as const, label: copy.statusFilterAll, count: counts.all, tone: "neutral" as const },
      { value: "active" as const, label: formatPlatformCodeLabel(locale, "active"), count: counts.active, tone: "success" as const },
      { value: "invited" as const, label: formatPlatformCodeLabel(locale, "invited"), count: counts.invited, tone: "warn" as const },
      { value: "suspended" as const, label: formatPlatformCodeLabel(locale, "suspended"), count: counts.suspended, tone: "danger" as const },
    ],
    [copy.statusFilterAll, counts.active, counts.all, counts.invited, counts.suspended, locale],
  );

  const navItems = useMemo(() => buildPlatformNav(locale), [locale]);

  const handleCreate = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setCreating(true);
      setError(null);
      setReceiptMessage(null);
      try {
        const result =
          await client.post<PlatformAdminUserMutationRuntimeResult>(
            "/api/platform-admin/users",
            {
              body: {
                email: createEmail.trim(),
                displayName: createDisplayName.trim(),
                roleCode: createRoleCode,
              },
            },
          );
        setReceiptMessage(result.receipt.message || copy.createSuccess);
        setCreateEmail("");
        setCreateDisplayName("");
        setCreateRoleCode("pa_tenant_mgr");
        setShowCreate(false);
        await loadView();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setCreating(false);
      }
    },
    [
      client,
      copy.createSuccess,
      createDisplayName,
      createEmail,
      createRoleCode,
      loadView,
    ],
  );

  const handleRowAction = useCallback(
    (user: PlatformAdminUserRuntimeRecord, action: ResourceActionDescriptor) => {
      if (!action.enabled) {
        return;
      }
      setSelectedUserId(user.userId);
      setReceiptMessage(null);
      if (action.action === "update_role") {
        setActionDraft(createActionDraft(user, action, "role"));
        return;
      }
      if (action.action === "suspend_user") {
        setActionDraft(createActionDraft(user, action, "suspend"));
        return;
      }
      if (action.action === "reactivate_user") {
        setActionDraft(createActionDraft(user, action, "reactivate"));
      }
    },
    [],
  );

  const handleActionSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!actionDraft || !selectedUser) {
        return;
      }

      const nextStatus: PlatformAdminUserStatus | undefined =
        actionDraft.mode === "suspend"
          ? "suspended"
          : actionDraft.mode === "reactivate"
            ? "active"
            : undefined;

      setMutatingUserId(selectedUser.userId);
      setError(null);
      setReceiptMessage(null);
      try {
        const result =
          await client.post<PlatformAdminUserMutationRuntimeResult>(
            `/api/platform-admin/users/${encodeURIComponent(selectedUser.userId)}/role`,
            {
              body: {
                roleCode: actionDraft.roleCode,
                status: nextStatus,
                reason: actionDraft.reason.trim() || undefined,
              },
            },
          );
        setReceiptMessage(result.receipt.message);
        setActionDraft(null);
        await loadView();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setMutatingUserId(null);
      }
    },
    [actionDraft, client, loadView, selectedUser],
  );

  const columns = useMemo<CanvasTableColumn<UserTableRow>[]>(
    () => [
      {
        h: locale === "en" ? "Name" : "姓名",
        w: 220,
        r: (row: UserTableRow) => (
          <button
            type="button"
            style={selectedUserButtonStyle(selectedUserId === row.userId)}
            onClick={() => setSelectedUserId(row.userId)}
          >
            <div style={userCellStyle}>
              <span style={userAvatarStyle}>{getInitials(row.displayName)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={userPrimaryStyle}>{row.displayName}</div>
                <div style={userSecondaryStyle}>{row.userId}</div>
              </div>
            </div>
          </button>
        ),
      },
      {
        h: "Email",
        k: "email",
        w: 250,
        mono: true,
      },
      {
        h: locale === "en" ? "Role" : "角色",
        w: 190,
        mono: true,
        r: (row: UserTableRow) => (
          <CanvasPill theme={theme} tone="accent">
            {formatPlatformCodeLabel(locale, row.roleCode)}
          </CanvasPill>
        ),
      },
      {
        h: locale === "en" ? "Status" : "狀態",
        w: 120,
        r: (row: UserTableRow) => (
          <CanvasPill theme={theme} tone={statusTone(row.status)} dot>
            {formatPlatformCodeLabel(locale, row.status)}
          </CanvasPill>
        ),
      },
      {
        h: copy.updatedLabel,
        w: 170,
        mono: true,
        r: (row: UserTableRow) => formatDateTime(row.updatedAt),
      },
      {
        h: locale === "en" ? "Actions" : "動作",
        w: 250,
        r: (row: UserTableRow) => (
          <div style={inlineActionsStyle}>
            {row.availableActions.map((action: ResourceActionDescriptor) => (
              <CanvasBtn
                key={`${row.userId}-${action.action}`}
                theme={theme}
                size="xs"
                variant={actionTone(action)}
                danger={action.riskLevel === "high" && action.action === "suspend_user"}
                disabled={!action.enabled || mutatingUserId === row.userId}
                onClick={() => handleRowAction(row, action)}
              >
                {getActionLabel(locale, action)}
              </CanvasBtn>
            ))}
          </div>
        ),
      },
    ],
    [copy.updatedLabel, handleRowAction, locale, mutatingUserId, selectedUserId],
  );

  const emptyCopy = effectiveEmptyReason
    ? getEmptyCopy(
        locale,
        effectiveEmptyReason,
        Boolean(view?.emptyState?.nextAction?.enabled),
      )
    : null;

  const selectedActionLabel = actionDraft
    ? getActionLabel(locale, actionDraft.descriptor)
    : "—";

  const actionSubmitLabel =
    actionDraft?.mode === "role"
      ? copy.saveRole
      : actionDraft?.mode === "suspend"
        ? copy.saveSuspend
        : copy.saveReactivate;

  const actionRequiresReason = Boolean(actionDraft?.descriptor.requiresReason);
  const actionDisabledReason = actionDraft
    ? getDisabledReasonLabel(locale, actionDraft.descriptor.disabledReasonCode)
    : undefined;
  const refreshCadenceLabel = view?.refresh.staleAfterMs
    ? `${Math.round(view.refresh.staleAfterMs / 1000)}s`
    : "—";

  if (loading && !view) {
    return (
      <div
        style={{
          padding: 24,
          color: theme.textMuted,
          fontFamily: theme.fontFamily,
        }}
      >
        {copy.refreshing}
      </div>
    );
  }

  return (
    <CanvasShell
      theme={theme}
      nav={navItems}
      active="users"
      currentPath="/users"
      breadcrumb={[copy.breadcrumbRoot, copy.title]}
      searchPlaceholder={copy.searchPlaceholder}
      avatarLabel="PA"
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        sticky={false}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              icon="filter"
              onClick={() => setShowFilters((current) => !current)}
            >
              {showFilters ? copy.hideFilters : copy.filterAction}
            </CanvasBtn>
            <CanvasBtn theme={theme} icon="refresh" onClick={() => void loadView()}>
              {copy.refresh}
            </CanvasBtn>
            {listAction ? (
              <CanvasBtn
                theme={theme}
                variant="primary"
                icon="plus"
                disabled={!listAction.enabled}
                onClick={() => setShowCreate((current) => !current)}
              >
                {showCreate ? t("common.cancel") : getActionLabel(locale, listAction)}
              </CanvasBtn>
            ) : null}
          </>
        }
      />

      <div style={pageStackStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={copy.errorTitle}
            body={error}
          />
        ) : null}

        {receiptMessage ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            title={locale === "en" ? "Action receipt" : "動作回執"}
            body={receiptMessage}
          />
        ) : null}

        {counts.attention > 0 ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            title={copy.attentionTitle}
            body={copy.attentionBody(counts.attention)}
          />
        ) : null}

        <div style={workspaceGridStyle}>
          <CanvasCard
            theme={theme}
            title={copy.tableTitle}
            subtitle={copy.tableSubtitle}
          >
            <div style={utilityRowStyle}>
              {showFilters ? (
                <div>
                  <div style={{ marginBottom: 8, color: theme.textMuted, fontSize: 12 }}>
                    {copy.filterTitle}
                  </div>
                  <div style={pillsRowStyle}>
                    {filterPills.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        style={pillButtonStyle}
                        onClick={() => setFilter(item.value)}
                      >
                        <CanvasPill
                          theme={theme}
                          tone={filter === item.value ? "accent" : item.tone}
                          dot={item.value !== "all"}
                        >
                          {item.label} · {item.count}
                        </CanvasPill>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ color: theme.textMuted, fontSize: 12 }}>
                  {copy.filterSubtitle}
                </div>
              )}

              <div style={utilityMetaStyle}>
                <CanvasPill theme={theme} tone="neutral">
                  {copy.refreshTierLabel} T4
                </CanvasPill>
                <CanvasPill
                  theme={theme}
                  tone={view?.refresh?.dataFreshness === "fresh" ? "success" : "warn"}
                  dot
                >
                  {copy.freshnessLabel} · {view?.refresh?.dataFreshness ?? "—"}
                </CanvasPill>
                <CanvasPill theme={theme} tone="neutral">
                  {refreshCadenceLabel}
                </CanvasPill>
              </div>
            </div>

            {emptyCopy ? (
              <div style={emptyStateStackStyle}>
                <CanvasBanner
                  theme={theme}
                  tone={emptyCopy.tone}
                  title={emptyCopy.title}
                  body={emptyCopy.body}
                  actions={
                    view?.emptyState?.nextAction?.enabled ? (
                      <CanvasBtn
                        theme={theme}
                        variant="primary"
                        icon="plus"
                        onClick={() => setShowCreate(true)}
                      >
                        {getActionLabel(locale, view.emptyState.nextAction)}
                      </CanvasBtn>
                    ) : effectiveEmptyReason === "fetch_failed" ? (
                      <CanvasBtn theme={theme} icon="refresh" onClick={() => void loadView()}>
                        {copy.refresh}
                      </CanvasBtn>
                    ) : null
                  }
                />
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    { label: copy.refreshTierLabel, value: "T4", mono: true },
                    { label: copy.freshnessLabel, value: view?.refresh?.dataFreshness ?? "—", mono: true },
                    { label: copy.sourceLabel, value: view?.refresh?.source ?? "—", mono: true },
                    {
                      label: copy.generatedLabel,
                      value: view?.refresh?.generatedAt
                        ? formatDateTime(view.refresh.generatedAt)
                        : "—",
                      mono: true,
                    },
                  ]}
                />
              </div>
            ) : (
              <CanvasTable<UserTableRow>
                theme={theme}
                columns={columns}
                rows={visibleUsers}
              />
            )}
            {!emptyCopy && visibleUsers.length === 0 ? (
              <div style={{ padding: 16, color: theme.textMuted }}>{copy.tableEmpty}</div>
            ) : null}
          </CanvasCard>

          <div style={railStackStyle}>
            <CanvasCard
              theme={theme}
              title={copy.summaryTitle}
              subtitle={copy.summarySubtitle}
            >
              <CanvasDL
                theme={theme}
                cols={1}
                items={[
                  { label: copy.refreshTierLabel, value: "T4", mono: true },
                  { label: copy.freshnessLabel, value: view?.refresh?.dataFreshness ?? "—", mono: true },
                  { label: locale === "en" ? "Refresh" : "更新節奏", value: refreshCadenceLabel, mono: true },
                  {
                    label: copy.generatedLabel,
                    value: view?.refresh?.generatedAt
                      ? formatDateTime(view.refresh.generatedAt)
                      : "—",
                    mono: true,
                  },
                  { label: copy.sourceLabel, value: view?.refresh?.source ?? "—", mono: true },
                  {
                    label: copy.healthHealthy,
                    value:
                      view?.health?.status === "healthy"
                        ? copy.healthHealthy
                        : copy.healthDegraded,
                  },
                ]}
              />

              {view?.health?.degradedServices.length ? (
                <div style={{ marginTop: 16 }}>
                  <div style={{ marginBottom: 8, color: theme.textMuted, fontSize: 12 }}>
                    {copy.healthDegraded}
                  </div>
                  <div style={linkListStyle}>
                    {view.health.degradedServices.map((service) => (
                      <CanvasPill key={service.service} theme={theme} tone="warn">
                        {service.service}
                      </CanvasPill>
                    ))}
                  </div>
                </div>
              ) : null}
            </CanvasCard>

            {showCreate && listAction ? (
              <CanvasCard
                theme={theme}
                title={copy.inviteTitle}
                subtitle={copy.inviteSubtitle}
              >
                <form onSubmit={handleCreate}>
                  <div style={formGridStyle}>
                    <CanvasField theme={theme} label={copy.nameLabel} required>
                      <input
                        value={createDisplayName}
                        onChange={(event) => setCreateDisplayName(event.target.value)}
                        style={inputBaseStyle()}
                      />
                    </CanvasField>
                    <CanvasField theme={theme} label={copy.emailLabel} required>
                      <input
                        type="email"
                        value={createEmail}
                        onChange={(event) => setCreateEmail(event.target.value)}
                        style={inputBaseStyle(true)}
                      />
                    </CanvasField>
                    <CanvasField theme={theme} label={copy.roleLabel} required>
                      <select
                        value={createRoleCode}
                        onChange={(event) =>
                          setCreateRoleCode(event.target.value as PlatformAdminUserRoleCode)
                        }
                        style={selectBaseStyle}
                      >
                        {PLATFORM_USER_ROLE_CODES.map((roleCode: PlatformAdminUserRoleCode) => (
                          <option key={roleCode} value={roleCode}>
                            {formatPlatformCodeLabel(locale, roleCode)}
                          </option>
                        ))}
                      </select>
                    </CanvasField>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                    <button
                      type="submit"
                      style={submitButtonStyle(
                        creating ||
                          !createDisplayName.trim() ||
                          !createEmail.trim() ||
                          !listAction.enabled,
                      )}
                      disabled={
                        creating ||
                        !createDisplayName.trim() ||
                        !createEmail.trim() ||
                        !listAction.enabled
                      }
                    >
                      {copy.createSubmit}
                    </button>
                  </div>
                </form>
              </CanvasCard>
            ) : null}

            {actionDraft && selectedUser ? (
              <CanvasCard
                theme={theme}
                title={copy.actionTitle}
                subtitle={copy.actionSubtitle}
              >
                <form onSubmit={handleActionSubmit}>
                  <div style={formGridStyle}>
                    <CanvasField theme={theme} label={copy.selectedLabel}>
                      <input value={selectedActionLabel} disabled style={inputBaseStyle()} />
                    </CanvasField>
                    <CanvasField theme={theme} label={copy.userIdLabel}>
                      <input value={selectedUser.userId} disabled style={inputBaseStyle(true)} />
                    </CanvasField>
                    <CanvasField theme={theme} label={copy.roleLabel}>
                      <select
                        value={actionDraft.roleCode}
                        disabled={actionDraft.mode !== "role"}
                        onChange={(event) =>
                          setActionDraft((current: ActionDraft | null) =>
                            current
                              ? {
                                  ...current,
                                  roleCode: event.target.value as PlatformAdminUserRoleCode,
                                }
                              : current,
                          )
                        }
                        style={selectBaseStyle}
                      >
                        {PLATFORM_USER_ROLE_CODES.map((roleCode: PlatformAdminUserRoleCode) => (
                          <option key={roleCode} value={roleCode}>
                            {formatPlatformCodeLabel(locale, roleCode)}
                          </option>
                        ))}
                      </select>
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={copy.reasonLabel}
                      required={actionRequiresReason}
                    >
                      <input
                        value={actionDraft.reason}
                        onChange={(event) =>
                          setActionDraft((current: ActionDraft | null) =>
                            current
                              ? {
                                  ...current,
                                  reason: event.target.value,
                                }
                              : current,
                          )
                        }
                        style={inputBaseStyle()}
                      />
                    </CanvasField>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      marginTop: 16,
                    }}
                  >
                    <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                      {actionDisabledReason ?? ""}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <CanvasBtn
                        theme={theme}
                        onClick={() => setActionDraft(null)}
                      >
                        {t("common.cancel")}
                      </CanvasBtn>
                      <button
                        type="submit"
                        style={submitButtonStyle(
                          mutatingUserId === selectedUser.userId ||
                            (actionRequiresReason && !actionDraft.reason.trim()),
                        )}
                        disabled={
                          mutatingUserId === selectedUser.userId ||
                          (actionRequiresReason && !actionDraft.reason.trim())
                        }
                      >
                        {actionSubmitLabel}
                      </button>
                    </div>
                  </div>
                </form>
              </CanvasCard>
            ) : null}

            <CanvasCard
              theme={theme}
              title={copy.selectedUserTitle}
              subtitle={
                locale === "en"
                  ? "Per-row availableActions and deep links stay tied to the selected user."
                  : "每列的 availableActions 與 deep links 都以目前選取的人員為準。"
              }
            >
              {selectedUser ? (
                <>
                  <CanvasDL
                    theme={theme}
                    cols={1}
                    items={[
                      { label: copy.nameLabel, value: selectedUser.displayName },
                      { label: copy.userIdLabel, value: selectedUser.userId, mono: true },
                      { label: copy.roleLabel, value: formatPlatformCodeLabel(locale, selectedUser.roleCode) },
                      { label: locale === "en" ? "Status" : "狀態", value: formatPlatformCodeLabel(locale, selectedUser.status) },
                      { label: copy.updatedLabel, value: formatDateTime(selectedUser.updatedAt), mono: true },
                    ]}
                  />

                  {selectedUser.resourceLinks?.length ? (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ marginBottom: 8, color: theme.textMuted, fontSize: 12 }}>
                        {copy.actionLinks}
                      </div>
                      <div style={linkListStyle}>
                        {selectedUser.resourceLinks.map((link: CrossAppResourceLink) => (
                          <Link
                            key={`${link.targetApp}-${link.resourceId}`}
                            href={buildCrossAppHref(link)}
                            target={link.openMode === "new_tab" ? "_blank" : undefined}
                            rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
                            style={deepLinkStyle}
                          >
                            <CanvasIcon name="ext" size={12} />
                            <span>{link.label}</span>
                            <CanvasPill theme={theme} tone="neutral">
                              {link.targetApp}
                            </CanvasPill>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 16, color: theme.textMuted, fontSize: 12 }}>
                      {copy.noLinks}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: theme.textMuted, fontSize: 12 }}>
                  {copy.noSelectedUser}
                </div>
              )}
            </CanvasCard>
          </div>
        </div>
      </div>
    </CanvasShell>
  );
}

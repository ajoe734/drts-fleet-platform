"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useSearchParams } from "next/navigation";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
import type {
  PlatformAdminUserRecord,
  PlatformAdminUserRole,
  PlatformAdminUserStatus,
} from "@drts/contracts";
import type {
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts/ui-runtime";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
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

type UsersApiPayload = {
  items?: PlatformAdminUserRecord[];
  emptyState?: EmptyStateEnvelope;
  refresh?: Partial<UiRefreshMetadata>;
  availableActions?: ResourceActionDescriptor[];
};

type UserRow = PlatformAdminUserRecord &
  Record<string, unknown> & {
    availableActions: ResourceActionDescriptor[];
    auditLink: CrossAppResourceLink;
  };

type PendingAction =
  | {
      kind: "create";
      descriptor: ResourceActionDescriptor;
    }
  | {
      kind: "update_role" | "suspend" | "reactivate";
      descriptor: ResourceActionDescriptor;
      user: UserRow;
    };

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const REFRESH_TIER: RefreshTier = "medium_slow";
const REFRESH_TIER_LABEL = "T4";
const REFRESH_STALE_AFTER_MS = 30_000;
const EMPTY_REASON_OPTIONS: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];
const ROLE_CODES: PlatformAdminUserRole[] = [
  "superadmin",
  "admin",
  "operator",
  "viewer",
];

const APP_ORIGINS: Record<CrossAppResourceLink["targetApp"], string> = {
  "platform-admin": "",
  "ops-console": process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN ?? "",
  "tenant-console": process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN ?? "",
};

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageStackStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const toolbarStyle = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
} satisfies CSSProperties;

const pillRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  justifyContent: "flex-end",
} satisfies CSSProperties;

const inlineMetaStyle = {
  fontSize: 11.5,
  color: theme.textMuted,
  lineHeight: 1.45,
} satisfies CSSProperties;

const inputStyle = {
  width: "100%",
  minHeight: 34,
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  padding: "0 10px",
  fontFamily: theme.fontFamily,
  fontSize: 12.5,
  boxSizing: "border-box",
} satisfies CSSProperties;

const modalBackdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.34)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 40,
} satisfies CSSProperties;

const modalCardStyle = {
  width: "min(560px, 100%)",
  maxHeight: "min(84vh, 780px)",
  overflow: "auto",
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  boxShadow: "0 24px 64px rgba(15, 23, 42, 0.22)",
} satisfies CSSProperties;

const cardBodyStackStyle = {
  display: "grid",
  gap: 14,
} satisfies CSSProperties;

const monoMetaStyle = {
  fontSize: 11,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
} satisfies CSSProperties;

function buildPlatformNav(locale: Locale): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGov: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform users",
          fleetGov: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGov: "Platform & Commerce",
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
          pricingGov: "平台與商務",
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
    { key: "notices", href: "/notices", icon: "notices", label: labels.notices },
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

function actionLabel(
  locale: Locale,
  action: string,
  fallback?: string,
): string {
  const labels: Record<string, { en: string; zh: string }> = {
    refresh: { en: "Refresh", zh: "重新整理" },
    create_staff_user: { en: "Invite user", zh: "邀請人員" },
    create: { en: "Invite user", zh: "邀請人員" },
    invite: { en: "Invite user", zh: "邀請人員" },
    update_role: { en: "Update role", zh: "更新角色" },
    update: { en: "Update role", zh: "更新角色" },
    suspend: { en: "Suspend", zh: "停用" },
    reactivate: { en: "Reactivate", zh: "重新啟用" },
    view_audit: { en: "View audit", zh: "查看稽核" },
  };
  const value = labels[action];
  if (value) {
    return locale === "en" ? value.en : value.zh;
  }
  return fallback ?? action;
}

function classifyErrorReason(message: string): EmptyReason {
  const lowered = message.toLowerCase();
  if (lowered.includes("403") || lowered.includes("permission")) {
    return "permission_denied";
  }
  if (lowered.includes("503") || lowered.includes("unavailable")) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function buildFallbackRefresh(
  refresh?: Partial<UiRefreshMetadata>,
): UiRefreshMetadata {
  const generatedAt = refresh?.generatedAt ?? new Date().toISOString();
  const staleAfterMs = refresh?.staleAfterMs ?? REFRESH_STALE_AFTER_MS;
  const ageMs = Math.max(0, Date.now() - Date.parse(generatedAt));
  const dataFreshness =
    refresh?.dataFreshness ??
    (Number.isFinite(ageMs) && ageMs > staleAfterMs ? "stale" : "fresh");

  return {
    generatedAt,
    staleAfterMs,
    dataFreshness,
    source: refresh?.source ?? "live",
  };
}

function buildAuditLink(user: PlatformAdminUserRecord): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: `/audit?resourceType=platform_admin_user&resourceId=${encodeURIComponent(
      user.userId,
    )}`,
    resourceType: "platform_admin_user",
    resourceId: user.userId,
    openMode: "new_tab",
    label: "Audit trail",
  };
}

function defaultRowActions(
  user: PlatformAdminUserRecord,
): ResourceActionDescriptor[] {
  return [
    {
      action: "update_role",
      enabled: true,
      riskLevel: "medium",
    },
    {
      action: user.status === "suspended" ? "reactivate" : "suspend",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "view_audit",
      enabled: true,
      riskLevel: "low",
    },
  ];
}

function defaultPageActions(): ResourceActionDescriptor[] {
  return [
    { action: "refresh", enabled: true, riskLevel: "low" },
    { action: "create_staff_user", enabled: true, riskLevel: "medium" },
  ];
}

function emptyReasonCopy(
  reason: EmptyReason,
  locale: Locale,
): { title: string; body: string; tone: CanvasTone } {
  const zh: Record<EmptyReason, { title: string; body: string; tone: CanvasTone }> =
    {
      no_data: {
        title: "目前沒有平台人員資料",
        body: "尚未建立任何平台使用者主檔。若權限允許，可直接邀請第一位內部治理人員。",
        tone: "neutral",
      },
      not_provisioned: {
        title: "人員治理尚未啟用",
        body: "此環境尚未 provision 平台使用者目錄，需先完成 bootstrap 或基礎設定。",
        tone: "info",
      },
      fetch_failed: {
        title: "載入失敗",
        body: "控制平面未回傳可信快照。請稍後重整並確認 API 與 admin runtime 健康狀態。",
        tone: "danger",
      },
      permission_denied: {
        title: "沒有檢視權限",
        body: "目前身分未被授權讀取平台內部使用者清單。若需要存取，請由 pa_super_admin 調整。",
        tone: "warn",
      },
      external_unavailable: {
        title: "外部依賴暫時不可用",
        body: "上游 identity 或 directory 依賴目前不可用，因此此頁無法建立可信快照。",
        tone: "warn",
      },
      filtered_empty: {
        title: "目前篩選條件沒有結果",
        body: "請放寬搜尋字詞或切換狀態篩選；原始資料可能仍然存在。",
        tone: "neutral",
      },
    };

  const en: Record<EmptyReason, { title: string; body: string; tone: CanvasTone }> =
    {
      no_data: {
        title: "No platform users yet",
        body: "No internal staff records exist in this environment. Invite the first governed user if your scope allows it.",
        tone: "neutral",
      },
      not_provisioned: {
        title: "User governance is not provisioned",
        body: "This environment has not provisioned the staff directory yet. Complete bootstrap before managing platform identities.",
        tone: "info",
      },
      fetch_failed: {
        title: "Unable to load the roster",
        body: "The control plane did not return a trusted snapshot. Refresh after the admin runtime recovers.",
        tone: "danger",
      },
      permission_denied: {
        title: "Access denied",
        body: "The current identity cannot read the internal platform user roster. Request pa_super_admin scope if needed.",
        tone: "warn",
      },
      external_unavailable: {
        title: "External dependency unavailable",
        body: "An upstream identity or directory dependency is unavailable, so this screen cannot present a trusted roster.",
        tone: "warn",
      },
      filtered_empty: {
        title: "No results for this filter",
        body: "Broaden the search or switch the status filter. The underlying roster may still contain records.",
        tone: "neutral",
      },
    };

  return locale === "en" ? en[reason] : zh[reason];
}

function statusTone(status: PlatformAdminUserStatus): CanvasTone {
  if (status === "active") return "success";
  if (status === "invited") return "warn";
  return "danger";
}

function roleTone(role: PlatformAdminUserRole): CanvasTone {
  if (role === "superadmin" || role === "admin") return "accent";
  if (role === "operator") return "info";
  return "neutral";
}

function actionTone(action: ResourceActionDescriptor): {
  variant: "primary" | "secondary" | "ghost";
  danger: boolean;
} {
  if (action.riskLevel === "high") {
    return { variant: "secondary", danger: true };
  }
  if (action.riskLevel === "medium") {
    return { variant: "primary", danger: false };
  }
  return { variant: "secondary", danger: false };
}

function resolveLinkHref(link: CrossAppResourceLink): string {
  const origin = APP_ORIGINS[link.targetApp];
  return origin ? `${origin}${link.route}` : link.route;
}

function openCrossAppLink(link: CrossAppResourceLink) {
  const href = resolveLinkHref(link);
  if (link.openMode === "new_tab") {
    window.open(href, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.assign(href);
}

function userInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function UsersActionButton({
  locale,
  descriptor,
  onClick,
}: {
  locale: Locale;
  descriptor: ResourceActionDescriptor;
  onClick?: () => void;
}) {
  const tone = actionTone(descriptor);

  return (
    <CanvasBtn
      theme={theme}
      size="xs"
      variant={tone.variant}
      danger={tone.danger}
      disabled={!descriptor.enabled}
      onClick={onClick}
      style={!descriptor.enabled ? { opacity: 0.48 } : undefined}
    >
      {actionLabel(locale, descriptor.action)}
    </CanvasBtn>
  );
}

function EmptyStatePanel({
  locale,
  reason,
  nextAction,
  onNextAction,
}: {
  locale: Locale;
  reason: EmptyReason;
  nextAction?: ResourceActionDescriptor;
  onNextAction?: () => void;
}) {
  const copy = emptyReasonCopy(reason, locale);

  return (
    <CanvasCard
      theme={theme}
      title={copy.title}
      subtitle={reason}
      style={{
        background:
          copy.tone === "danger"
            ? theme.dangerBg
            : copy.tone === "warn"
              ? theme.warnBg
              : copy.tone === "info"
                ? theme.infoBg
                : theme.surface,
      }}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ ...inlineMetaStyle, fontSize: 12.5 }}>{copy.body}</div>
        {nextAction ? (
          <div>
            <UsersActionButton
              locale={locale}
              descriptor={nextAction}
              onClick={onNextAction}
            />
          </div>
        ) : null}
      </div>
    </CanvasCard>
  );
}

function ActionModal({
  locale,
  pendingAction,
  formEmail,
  formDisplayName,
  formRoleCode,
  reason,
  creating,
  mutatingUserId,
  onClose,
  onEmailChange,
  onDisplayNameChange,
  onRoleChange,
  onReasonChange,
  onConfirm,
}: {
  locale: Locale;
  pendingAction: PendingAction;
  formEmail: string;
  formDisplayName: string;
  formRoleCode: PlatformAdminUserRole;
  reason: string;
  creating: boolean;
  mutatingUserId: string | null;
  onClose: () => void;
  onEmailChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onRoleChange: (value: PlatformAdminUserRole) => void;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
}) {
  const descriptor = pendingAction.descriptor;
  const isHighRisk = descriptor.riskLevel === "high";
  const disabled =
    pendingAction.kind === "create"
      ? creating || !formEmail.trim() || !formDisplayName.trim()
      : pendingAction.kind === "update_role"
        ? mutatingUserId === pendingAction.user.userId
        : mutatingUserId === pendingAction.user.userId || !reason.trim();

  const title =
    pendingAction.kind === "create"
      ? locale === "en"
        ? "Invite platform user"
        : "邀請平台人員"
      : pendingAction.kind === "update_role"
        ? locale === "en"
          ? "Update role"
          : "更新角色"
        : pendingAction.kind === "suspend"
          ? locale === "en"
            ? "Suspend platform user"
            : "停用平台人員"
          : locale === "en"
            ? "Reactivate platform user"
            : "重新啟用平台人員";

  const subtitle =
    pendingAction.kind === "create"
      ? locale === "en"
        ? "Medium-risk governance action. RBAC authority remains backend-driven."
        : "中風險治理操作；RBAC 真值仍由後端 authority 決定。"
      : pendingAction.kind === "update_role"
        ? locale === "en"
          ? "Role changes are audit-logged and affect future control-plane scope."
          : "角色變更會寫入稽核，並影響後續控制平面權限範圍。"
        : locale === "en"
          ? "High-risk action requires a recorded reason."
          : "高風險操作需填寫原因並落入稽核紀錄。";

  return (
    <div style={modalBackdropStyle}>
      <div style={modalCardStyle}>
        <CanvasCard
          theme={theme}
          title={title}
          subtitle={subtitle}
          actions={
            <CanvasBtn theme={theme} variant="ghost" onClick={onClose}>
              {locale === "en" ? "Close" : "關閉"}
            </CanvasBtn>
          }
        >
          <div style={cardBodyStackStyle}>
            {pendingAction.kind === "create" ? (
              <>
                <CanvasField theme={theme} label={locale === "en" ? "Email" : "電子郵件"}>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(event) => onEmailChange(event.target.value)}
                    placeholder="staff@drts.io"
                    style={inputStyle}
                  />
                </CanvasField>
                <CanvasField
                  theme={theme}
                  label={locale === "en" ? "Display name" : "顯示名稱"}
                >
                  <input
                    type="text"
                    value={formDisplayName}
                    onChange={(event) => onDisplayNameChange(event.target.value)}
                    placeholder={locale === "en" ? "Yi-Chun Lin" : "林宜君"}
                    style={inputStyle}
                  />
                </CanvasField>
                <CanvasField
                  theme={theme}
                  label={locale === "en" ? "Initial role" : "初始角色"}
                >
                  <select
                    value={formRoleCode}
                    onChange={(event) =>
                      onRoleChange(event.target.value as PlatformAdminUserRole)
                    }
                    style={{ ...inputStyle, paddingRight: 28 }}
                  >
                    {ROLE_CODES.map((roleCode) => (
                      <option key={roleCode} value={roleCode}>
                        {formatPlatformCodeLabel(locale, roleCode)}
                      </option>
                    ))}
                  </select>
                </CanvasField>
              </>
            ) : (
              <>
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: locale === "en" ? "User" : "使用者",
                      v: pendingAction.user.displayName,
                    },
                    {
                      k: "EMAIL",
                      v: pendingAction.user.email,
                      mono: true,
                    },
                    {
                      k: locale === "en" ? "Current role" : "目前角色",
                      v: formatPlatformCodeLabel(
                        locale,
                        pendingAction.user.roleCode,
                      ),
                    },
                    {
                      k: locale === "en" ? "Current status" : "目前狀態",
                      v: formatPlatformCodeLabel(locale, pendingAction.user.status),
                    },
                  ]}
                />
                {pendingAction.kind === "update_role" ? (
                  <CanvasField
                    theme={theme}
                    label={locale === "en" ? "Target role" : "目標角色"}
                  >
                    <select
                      value={formRoleCode}
                      onChange={(event) =>
                        onRoleChange(event.target.value as PlatformAdminUserRole)
                      }
                      style={{ ...inputStyle, paddingRight: 28 }}
                    >
                      {ROLE_CODES.map((roleCode) => (
                        <option key={roleCode} value={roleCode}>
                          {formatPlatformCodeLabel(locale, roleCode)}
                        </option>
                      ))}
                    </select>
                  </CanvasField>
                ) : null}
                {isHighRisk ? (
                  <CanvasField
                    theme={theme}
                    label={locale === "en" ? "Reason" : "原因"}
                    hint={
                      locale === "en"
                        ? "Required for audit evidence on high-risk actions."
                        : "高風險操作需填寫原因，作為稽核證據。"
                    }
                  >
                    <textarea
                      value={reason}
                      onChange={(event) => onReasonChange(event.target.value)}
                      style={{
                        width: "100%",
                        minHeight: 96,
                        resize: "vertical",
                        borderRadius: 10,
                        border: `1px solid ${
                          reason.trim() ? theme.border : theme.danger
                        }`,
                        background: theme.bgRaised,
                        color: theme.text,
                        padding: 10,
                        fontFamily: theme.fontFamily,
                        fontSize: 12.5,
                        boxSizing: "border-box",
                      }}
                      placeholder={
                        locale === "en"
                          ? "Explain why this access change is required."
                          : "說明這次權限／狀態調整的治理原因。"
                      }
                    />
                  </CanvasField>
                ) : null}
              </>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <CanvasBtn theme={theme} variant="secondary" onClick={onClose}>
                {locale === "en" ? "Cancel" : "取消"}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                danger={descriptor.riskLevel === "high"}
                disabled={disabled}
                onClick={onConfirm}
              >
                {pendingAction.kind === "create"
                  ? locale === "en"
                    ? "Send invite"
                    : "送出邀請"
                  : actionLabel(locale, descriptor.action)}
              </CanvasBtn>
            </div>
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { locale } = useTranslation();
  const searchParams = useSearchParams();
  const client = usePlatformAdminClient();

  const nav = useMemo(() => buildPlatformNav(locale), [locale]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pageActions, setPageActions] = useState<ResourceActionDescriptor[]>(
    defaultPageActions(),
  );
  const [refreshMeta, setRefreshMeta] = useState<UiRefreshMetadata>(
    buildFallbackRefresh(),
  );
  const [serverEmptyState, setServerEmptyState] =
    useState<EmptyStateEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<UserFilter>("all");
  const [search, setSearch] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [formEmail, setFormEmail] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formRoleCode, setFormRoleCode] =
    useState<PlatformAdminUserRole>("operator");
  const [reason, setReason] = useState("");
  const [creating, setCreating] = useState(false);
  const [mutatingUserId, setMutatingUserId] = useState<string | null>(null);

  const emptyReasonOverride = useMemo(() => {
    const value = searchParams.get("emptyReason");
    return EMPTY_REASON_OPTIONS.includes(value as EmptyReason)
      ? (value as EmptyReason)
      : null;
  }, [searchParams]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = await client.get<UsersApiPayload>("/api/platform-admin/users");
      const items = payload.items ?? [];
      setUsers(
        items.map((user) => {
          const record = user as PlatformAdminUserRecord & {
            availableActions?: ResourceActionDescriptor[];
          };
          return {
            ...user,
            availableActions:
              record.availableActions && record.availableActions.length > 0
                ? record.availableActions
                : defaultRowActions(user),
            auditLink: buildAuditLink(user),
          };
        }),
      );
      setPageActions(
        payload.availableActions && payload.availableActions.length > 0
          ? payload.availableActions
          : defaultPageActions(),
      );
      setServerEmptyState(payload.emptyState ?? null);
      setRefreshMeta(buildFallbackRefresh(payload.refresh));
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
      setUsers([]);
      setServerEmptyState({
        reason: classifyErrorReason(message),
        messageCode: "platform_users_fetch_failed",
      });
      setRefreshMeta(
        buildFallbackRefresh({
          dataFreshness: "degraded",
          source: "live",
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadUsers();
    }, REFRESH_STALE_AFTER_MS);
    return () => window.clearInterval(timer);
  }, [loadUsers]);

  const visibleUsers = useMemo(() => {
    const loweredSearch = search.trim().toLowerCase();

    return users.filter((user) => {
      if (filter !== "all" && user.status !== filter) {
        return false;
      }
      if (!loweredSearch) {
        return true;
      }
      return [user.displayName, user.email, user.userId, user.roleCode].some(
        (value) => value.toLowerCase().includes(loweredSearch),
      );
    });
  }, [filter, search, users]);

  const counts = useMemo(
    () => ({
      all: users.length,
      active: users.filter((user) => user.status === "active").length,
      invited: users.filter((user) => user.status === "invited").length,
      suspended: users.filter((user) => user.status === "suspended").length,
    }),
    [users],
  );

  const effectiveEmptyState = useMemo(() => {
    if (emptyReasonOverride) {
      return {
        reason: emptyReasonOverride,
        messageCode: `forced_${emptyReasonOverride}`,
      } satisfies EmptyStateEnvelope;
    }
    if (visibleUsers.length > 0) {
      return null;
    }
    if (serverEmptyState) {
      return serverEmptyState;
    }
    if (filter !== "all" || search.trim()) {
      return {
        reason: "filtered_empty",
        messageCode: "platform_users_filtered_empty",
      } satisfies EmptyStateEnvelope;
    }
    return {
      reason: "no_data",
      messageCode: "platform_users_no_data",
    } satisfies EmptyStateEnvelope;
  }, [emptyReasonOverride, filter, search, serverEmptyState, visibleUsers]);

  const primaryCreateAction =
    pageActions.find((action) =>
      ["create_staff_user", "create", "invite"].includes(action.action),
    ) ?? defaultPageActions()[1];

  const refreshAction =
    pageActions.find((action) => action.action === "refresh") ??
    defaultPageActions()[0];

  const deepLinks = useMemo<CrossAppResourceLink[]>(
    () => [
      {
        targetApp: "platform-admin",
        route: "/audit?resourceType=platform_admin_user",
        resourceType: "platform_admin_user",
        resourceId: "all",
        openMode: "new_tab",
        label: locale === "en" ? "Audit trail" : "使用者稽核",
      },
      {
        targetApp: "ops-console",
        route: "/dispatch",
        resourceType: "dispatch_board",
        resourceId: "ops",
        openMode: "new_tab",
        label: locale === "en" ? "Ops dispatch board" : "Ops 調度看板",
      },
      {
        targetApp: "ops-console",
        route: "/revenue",
        resourceType: "reconciliation_issue",
        resourceId: "mirror",
        openMode: "new_tab",
        label: locale === "en" ? "Revenue mirror" : "Revenue 鏡像",
      },
    ],
    [locale],
  );

  const openCreateModal = useCallback(() => {
    setFormEmail("");
    setFormDisplayName("");
    setFormRoleCode("operator");
    setReason("");
    setPendingAction({ kind: "create", descriptor: primaryCreateAction });
  }, [primaryCreateAction]);

  const openRowAction = useCallback((user: UserRow, action: ResourceActionDescriptor) => {
    setFormRoleCode(user.roleCode);
    setReason("");
    if (action.action === "view_audit") {
      openCrossAppLink(user.auditLink);
      return;
    }
    if (action.action === "update_role" || action.action === "update") {
      setPendingAction({ kind: "update_role", descriptor: action, user });
      return;
    }
    setPendingAction({
      kind: action.action === "reactivate" ? "reactivate" : "suspend",
      descriptor: action,
      user,
    });
  }, []);

  const closeModal = useCallback(() => {
    setPendingAction(null);
    setReason("");
  }, []);

  const submitPendingAction = useCallback(async () => {
    if (!pendingAction) return;

    if (pendingAction.kind === "create") {
      setCreating(true);
      try {
        setError(null);
        await client.createPlatformAdminUser({
          email: formEmail.trim(),
          displayName: formDisplayName.trim(),
          roleCode: formRoleCode,
        });
        closeModal();
        await loadUsers();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : String(caughtError),
        );
      } finally {
        setCreating(false);
      }
      return;
    }

    const { user } = pendingAction;
    setMutatingUserId(user.userId);

    try {
      setError(null);
      if (pendingAction.kind === "update_role") {
        await client.updatePlatformAdminUserRole(user.userId, {
          roleCode: formRoleCode,
          status: user.status,
        });
      } else {
        await client.updatePlatformAdminUserRole(user.userId, {
          roleCode: user.roleCode,
          status: pendingAction.kind === "suspend" ? "suspended" : "active",
        });
      }
      closeModal();
      await loadUsers();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : String(caughtError),
      );
    } finally {
      setMutatingUserId(null);
    }
  }, [
    client,
    closeModal,
    formDisplayName,
    formEmail,
    formRoleCode,
    loadUsers,
    pendingAction,
  ]);

  const tableColumns = useMemo<CanvasTableColumn<UserRow>[]>(
    () => [
      {
        h: locale === "en" ? "Name" : "NAME",
        w: 220,
        r: (row) => (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                background: theme.accentBg,
                color: theme.accent,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {userInitials(row.displayName)}
            </span>
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ fontWeight: 500 }}>{row.displayName}</span>
              <span style={monoMetaStyle}>{row.userId}</span>
            </div>
          </div>
        ),
      },
      {
        h: "EMAIL",
        w: 240,
        mono: true,
        r: (row) => row.email,
      },
      {
        h: locale === "en" ? "Role" : "ROLE",
        w: 180,
        r: (row) => (
          <CanvasPill theme={theme} tone={roleTone(row.roleCode)}>
            {formatPlatformCodeLabel(locale, row.roleCode)}
          </CanvasPill>
        ),
      },
      {
        h: locale === "en" ? "Status" : "STATUS",
        w: 120,
        r: (row) => (
          <CanvasPill theme={theme} tone={statusTone(row.status)} dot>
            {formatPlatformCodeLabel(locale, row.status)}
          </CanvasPill>
        ),
      },
      {
        h: locale === "en" ? "Updated" : "更新",
        w: 150,
        mono: true,
        r: (row) => formatDateTime(row.updatedAt),
      },
      {
        h: "ACTIONS",
        w: 260,
        align: "right",
        r: (row) => (
          <div style={actionRowStyle}>
            {row.availableActions.length === 0 ? (
              <CanvasPill theme={theme} tone="neutral">
                {locale === "en" ? "Read only" : "唯讀"}
              </CanvasPill>
            ) : (
              row.availableActions.map((action) => (
                <UsersActionButton
                  key={`${row.userId}-${action.action}`}
                  locale={locale}
                  descriptor={action}
                  onClick={() => openRowAction(row, action)}
                />
              ))
            )}
          </div>
        ),
      },
    ],
    [locale, openRowAction],
  );

  return (
    <>
      <CanvasShell
        theme={theme}
        nav={nav}
        currentPath="/users"
        env="production"
        breadcrumb={[locale === "en" ? "Platform users" : "平台人員"]}
        style={shellStyle}
      >
        <CanvasPageHeader
          theme={theme}
          title={locale === "en" ? "Platform users" : "平台人員"}
          subtitle={
            locale === "en"
              ? "Internal identity governance. Visual aligned to the canvas; action authority remains backend-driven."
              : "平台內部身分治理。視覺對齊 canvas，操作權限仍由後端 authority 決定。"
          }
          actions={
            <>
              <CanvasPill theme={theme} tone="neutral">
                {REFRESH_TIER_LABEL} · 30s
              </CanvasPill>
              <UsersActionButton
                locale={locale}
                descriptor={refreshAction}
                onClick={() => void loadUsers()}
              />
              <UsersActionButton
                locale={locale}
                descriptor={primaryCreateAction}
                onClick={openCreateModal}
              />
            </>
          }
        />

        <div style={pageStackStyle}>
          <CanvasBanner
            theme={theme}
            tone={
              refreshMeta.dataFreshness === "fresh"
                ? "info"
                : refreshMeta.dataFreshness === "degraded"
                  ? "warn"
                  : "danger"
            }
            title={
              locale === "en"
                ? `Refresh tier ${REFRESH_TIER_LABEL} · ${refreshMeta.dataFreshness}`
                : `Refresh tier ${REFRESH_TIER_LABEL} · ${refreshMeta.dataFreshness}`
            }
            body={
              locale === "en"
                ? `Generated ${formatDateTime(refreshMeta.generatedAt)} from ${refreshMeta.source}. This screen follows the T4 medium-slow cadence from the packet.`
                : `資料於 ${formatDateTime(refreshMeta.generatedAt)} 由 ${refreshMeta.source} 來源產生。此頁依 packet 指定的 T4 medium-slow cadence 輪詢。`
            }
            actions={
              <div style={pillRowStyle}>
                {deepLinks.map((link) => (
                  <CanvasBtn
                    key={`${link.targetApp}-${link.route}`}
                    theme={theme}
                    variant="secondary"
                    size="xs"
                    onClick={() => openCrossAppLink(link)}
                  >
                    {link.label}
                  </CanvasBtn>
                ))}
              </div>
            }
          />

          <CanvasCard
            theme={theme}
            title={locale === "en" ? "Platform users" : "平台人員"}
            subtitle={
              locale === "en"
                ? "Spec §5.7: must-show id, display name, email, role, status, updated time. CTAs render from availableActions."
                : "對應 spec §5.7：必顯 id、display name、email、role、status、updated time，CTA 由 availableActions 驅動。"
            }
          >
            <div style={cardBodyStackStyle}>
              <div style={toolbarStyle}>
                <div style={pillRowStyle}>
                  {[
                    ["all", locale === "en" ? "All" : "全部", counts.all],
                    ["active", locale === "en" ? "Active" : "啟用", counts.active],
                    ["invited", locale === "en" ? "Invited" : "邀請中", counts.invited],
                    [
                      "suspended",
                      locale === "en" ? "Suspended" : "停用",
                      counts.suspended,
                    ],
                  ].map(([value, label, count]) => {
                    const selected = filter === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFilter(value as UserFilter)}
                        style={{
                          border: `1px solid ${
                            selected ? theme.accent : theme.border
                          }`,
                          background: selected ? theme.accentBg : theme.surface,
                          color: selected ? theme.accent : theme.text,
                          borderRadius: 999,
                          minHeight: 30,
                          padding: "0 12px",
                          fontFamily: theme.fontFamily,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {label} · {count}
                      </button>
                    );
                  })}
                </div>

                <div style={{ width: "min(280px, 100%)" }}>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={
                      locale === "en"
                        ? "Search name, email, id, role"
                        : "搜尋姓名、email、id、role"
                    }
                    style={inputStyle}
                  />
                </div>
              </div>

              {loading ? (
                <CanvasBanner
                  theme={theme}
                  tone="info"
                  title={locale === "en" ? "Loading users" : "載入平台人員中"}
                  body={
                    locale === "en"
                      ? "Fetching the latest roster snapshot from the control plane."
                      : "正在從控制平面取得最新的人員快照。"
                  }
                />
              ) : effectiveEmptyState ? (
                <EmptyStatePanel
                  locale={locale}
                  reason={effectiveEmptyState.reason}
                  nextAction={
                    effectiveEmptyState.nextAction ??
                    (effectiveEmptyState.reason === "no_data" ||
                    effectiveEmptyState.reason === "not_provisioned"
                      ? primaryCreateAction
                      : effectiveEmptyState.reason === "fetch_failed" ||
                          effectiveEmptyState.reason === "external_unavailable"
                        ? refreshAction
                        : undefined)
                  }
                  onNextAction={() => {
                    if (
                      effectiveEmptyState.reason === "no_data" ||
                      effectiveEmptyState.reason === "not_provisioned"
                    ) {
                      openCreateModal();
                      return;
                    }
                    void loadUsers();
                  }}
                />
              ) : (
                <CanvasTable theme={theme} columns={tableColumns} rows={visibleUsers} />
              )}

              {error ? <div style={inlineMetaStyle}>{error}</div> : null}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={locale === "en" ? "Screen notes" : "畫面備註"}
            subtitle={
              locale === "en"
                ? "Packet behavior anchors kept explicit for review."
                : "保留 packet 行為錨點，方便 review。"
            }
          >
            <div style={cardBodyStackStyle}>
              <CanvasDL
                theme={theme}
                cols={2}
                items={[
                  {
                    k: locale === "en" ? "Spec ref" : "Spec ref",
                    v: "§5.7",
                    mono: true,
                  },
                  {
                    k: locale === "en" ? "Primary persona" : "主要 persona",
                    v: "pa_super_admin",
                    mono: true,
                  },
                  {
                    k: locale === "en" ? "Refresh tier" : "Refresh tier",
                    v: `${REFRESH_TIER_LABEL} · ${REFRESH_TIER}`,
                    mono: true,
                  },
                  {
                    k: "EmptyReason",
                    v: EMPTY_REASON_OPTIONS.join(" · "),
                    mono: true,
                  },
                  {
                    k: locale === "en" ? "State variants" : "狀態變體",
                    v:
                      locale === "en"
                        ? "empty · pending invitation · suspended"
                        : "empty · pending invitation · suspended",
                  },
                  {
                    k: locale === "en" ? "Deep links" : "Deep links",
                    v:
                      locale === "en"
                        ? "audit / ops dispatch / revenue mirror"
                        : "audit / ops dispatch / revenue mirror",
                  },
                ]}
              />
              <div style={pillRowStyle}>
                {EMPTY_REASON_OPTIONS.map((reasonOption) => (
                  <CanvasPill
                    key={reasonOption}
                    theme={theme}
                    tone={effectiveEmptyState?.reason === reasonOption ? "accent" : "neutral"}
                  >
                    {reasonOption}
                  </CanvasPill>
                ))}
              </div>
            </div>
          </CanvasCard>
        </div>
      </CanvasShell>

      {pendingAction ? (
        <ActionModal
          locale={locale}
          pendingAction={pendingAction}
          formEmail={formEmail}
          formDisplayName={formDisplayName}
          formRoleCode={formRoleCode}
          reason={reason}
          creating={creating}
          mutatingUserId={mutatingUserId}
          onClose={closeModal}
          onEmailChange={setFormEmail}
          onDisplayNameChange={setFormDisplayName}
          onRoleChange={setFormRoleCode}
          onReasonChange={setReason}
          onConfirm={() => void submitPendingAction()}
        />
      ) : null}
    </>
  );
}

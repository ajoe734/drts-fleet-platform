"use client";

import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
import type {
  ActionRiskLevel,
  CrossAppResourceLink,
  EmptyReason,
  PlatformAdminUserRecord,
  PlatformAdminUserRole,
  PlatformAdminUserStatus,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
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

// ── Theme / static layout ────────────────────────────────────────────────────
// Visual follows `docs/05-ui/drts-design-canvas/Platform Admin.html` (PA_Users
// artboard); behaviour follows packet §5.7 + binding operating context §3.
const th = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

type CanvasIconName = React.ComponentProps<typeof CanvasIcon>["name"];

// The host layout (`AdminNav`) owns the real sidebar; the embedded CanvasShell
// collapses its own sidebar column to 0 and only contributes the canvas header
// chrome + content surface — same composition as the sibling `/tenants` page.
const shellStyle: CSSProperties = {
  height: "calc(100vh - 64px)",
  minHeight: "calc(100vh - 64px)",
  borderRadius: 24,
  overflow: "hidden",
  border: `1px solid ${th.border}`,
  boxShadow: "0 24px 60px rgba(2, 6, 23, 0.28)",
  gridTemplateColumns: "0 minmax(0, 1fr)",
  gridTemplateRows: "46px minmax(0, 1fr)",
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const filterButtonStyle: CSSProperties = {
  border: 0,
  padding: 0,
  background: "transparent",
  cursor: "pointer",
};

const headerActionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-end",
};

const refreshMetaStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  color: th.textDim,
  fontFamily: th.monoFamily,
};

const avatarStyle: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 11,
  background: th.accentBg,
  color: th.accent,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 10,
  fontWeight: 700,
  flexShrink: 0,
  textTransform: "uppercase",
};

const userCellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};

const userNameStyle: CSSProperties = { fontWeight: 600, color: th.text };

const userIdStyle: CSSProperties = {
  fontSize: 11,
  color: th.textDim,
  fontFamily: th.monoFamily,
};

const rowActionsStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const readOnlyHintStyle: CSSProperties = {
  fontSize: 11,
  color: th.textDim,
  fontStyle: "italic",
};

const loadingStateStyle: CSSProperties = {
  padding: 28,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const emptyStateStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  padding: "40px 28px",
  textAlign: "center",
};

const emptyTitleStyle: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 600,
  color: th.text,
};

const emptyBodyStyle: CSSProperties = {
  fontSize: 12,
  color: th.textMuted,
  maxWidth: 360,
  lineHeight: 1.5,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

const monoInputStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: th.monoFamily,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 76,
  resize: "vertical",
};

// ── Modal / toast styling ────────────────────────────────────────────────────
const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.55)",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 60,
};

const modalCardStyle: CSSProperties = {
  width: "min(460px, 94vw)",
  background: th.surface,
  border: `1px solid ${th.border}`,
  borderRadius: 12,
  boxShadow: "0 24px 64px rgba(2, 6, 23, 0.5)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  maxHeight: "calc(100vh - 96px)",
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "14px 16px",
  borderBottom: `1px solid ${th.border}`,
};

const modalBodyStyle: CSSProperties = {
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  overflow: "auto",
};

const modalFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "12px 16px",
  borderTop: `1px solid ${th.border}`,
};

const closeButtonStyle: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: "transparent",
  color: th.textMuted,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
};

const toastWrapStyle: CSSProperties = {
  position: "fixed",
  right: 24,
  bottom: 24,
  zIndex: 70,
  width: "min(380px, calc(100vw - 48px))",
  background: th.surface,
  border: `1px solid ${th.successBorder}`,
  borderRadius: 10,
  boxShadow: "0 18px 48px rgba(2, 6, 23, 0.45)",
  padding: 14,
  display: "flex",
  gap: 10,
};

const auditLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  marginTop: 6,
  fontSize: 11.5,
  fontWeight: 600,
  color: th.accent,
  textDecoration: "none",
};

function toneBg(tone: CanvasTone): string {
  switch (tone) {
    case "success":
      return th.successBg;
    case "warn":
      return th.warnBg;
    case "danger":
      return th.dangerBg;
    case "info":
      return th.infoBg;
    case "accent":
      return th.accentBg;
    default:
      return th.neutralBg;
  }
}

function toneFg(tone: CanvasTone): string {
  switch (tone) {
    case "success":
      return th.success;
    case "warn":
      return th.warn;
    case "danger":
      return th.danger;
    case "info":
      return th.info;
    case "accent":
      return th.accent;
    default:
      return th.textMuted;
  }
}

function emptyIconWrapStyle(tone: CanvasTone): CSSProperties {
  return {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: toneBg(tone),
    color: toneFg(tone),
  };
}

// ── Refresh tier (§3.2) ──────────────────────────────────────────────────────
// `/users` is tier T4 (medium-slow → 30s). The cadence comes from the shared
// RefreshTier map, never a magic number (per `UiRefreshMetadata` contract note).
const REFRESH_TIER: RefreshTier = "medium_slow";

const REFRESH_CADENCE_MS: Record<RefreshTier, number | null> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: null,
};

const REFRESH_CADENCE = REFRESH_CADENCE_MS[REFRESH_TIER] ?? 30_000;

// ── Domain enums / row shape ─────────────────────────────────────────────────
const ROLE_CODES: PlatformAdminUserRole[] = [
  "superadmin",
  "admin",
  "operator",
  "viewer",
];

type UserFilter = "all" | PlatformAdminUserStatus;

// The backend list endpoint emits bare `PlatformAdminUserRecord`s today; per the
// `@drts/contracts` ui-runtime note, `availableActions` lands on a record in the
// same PR that rebuilds its consuming UI. We widen the row with the OPTIONAL
// field so the page consumes a backend-provided descriptor list the moment it
// appears, and otherwise derives one locally. This stays envelope-ready without
// asserting a shape the backend does not yet emit.
type UserRow = PlatformAdminUserRecord & {
  availableActions?: ResourceActionDescriptor[];
} & Record<string, unknown>;

function roleTone(roleCode: PlatformAdminUserRole): CanvasTone {
  if (roleCode === "superadmin" || roleCode === "admin") {
    return "info";
  }
  if (roleCode === "operator") {
    return "accent";
  }
  return "neutral";
}

function statusTone(status: PlatformAdminUserStatus): CanvasTone {
  if (status === "active") {
    return "success";
  }
  if (status === "invited") {
    return "warn";
  }
  return "danger";
}

// Authority boundaries (§3.5): CTA visibility is descriptor-driven, never
// hard-coded by role. Risk levels follow §3.4 — update role is medium, the
// suspend/reactivate toggle is high (reason required). superadmin is shown a
// disabled "suspend" affordance with a reason code rather than hiding it.
function buildUserActions(
  user: PlatformAdminUserRecord,
): ResourceActionDescriptor[] {
  const actions: ResourceActionDescriptor[] = [
    { action: "update_role", enabled: true, riskLevel: "medium" },
  ];

  if (user.status === "suspended") {
    actions.push({
      action: "reactivate",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    });
  } else if (user.roleCode === "superadmin") {
    actions.push({
      action: "suspend",
      enabled: false,
      disabledReasonCode: "protected_superadmin",
      requiresReason: true,
      riskLevel: "high",
    });
  } else {
    actions.push({
      action: "suspend",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    });
  }

  return actions;
}

function resolveUserActions(user: UserRow): ResourceActionDescriptor[] {
  return user.availableActions ?? buildUserActions(user);
}

// Cross-app navigation (§3.10): action receipts deep-link to the owning app's
// audit view filtered to the touched resource. Platform-admin owns `/audit`, so
// this is an in-app (`same_tab`) link, modelled with the shared contract type.
function buildAuditLink(
  resourceId: string,
  label: string,
): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: `/audit?resourceType=platform_user&resourceId=${encodeURIComponent(resourceId)}`,
    resourceType: "platform_user",
    resourceId,
    openMode: "same_tab",
    label,
  };
}

// ── Pending-action model for the risk-classified confirmation modal (§3.4) ────
type PendingAction =
  | { kind: "create"; riskLevel: ActionRiskLevel }
  | {
      kind: "update_role";
      riskLevel: ActionRiskLevel;
      user: PlatformAdminUserRecord;
    }
  | {
      kind: "suspend" | "reactivate";
      riskLevel: ActionRiskLevel;
      requiresReason: boolean;
      user: PlatformAdminUserRecord;
    };

interface ToastState {
  message: string;
  auditLink: CrossAppResourceLink;
}

interface EmptyDef {
  tone: CanvasTone;
  icon: CanvasIconName;
  title: string;
  body: string;
  action: string | null;
}

function buildCopy(locale: Locale) {
  if (locale === "en") {
    return {
      breadcrumb: ["Tenant Governance", "Platform Staff"] as ReactNode[],
      title: "Platform staff",
      subtitle:
        "Internal platform users and roles · RBAC gating is enforced by the backend.",
      searchPlaceholder: "Search tenants, staff, adapters…",
      refresh: "Refresh",
      invite: "Invite staff",
      freshness: {
        fresh: "live",
        stale: "stale",
        degraded: "degraded",
        unknown: "—",
      },
      updatedPrefix: "synced",
      filtersAria: "Filter platform staff by status",
      filters: {
        all: "All",
        active: "active",
        invited: "invited",
        suspended: "suspended",
      },
      cols: {
        name: "NAME",
        email: "EMAIL",
        role: "ROLE",
        status: "STATUS",
        updated: "UPDATED",
        actions: "ACTIONS",
      },
      readOnly: "read-only",
      loading: "Loading platform staff…",
      errorTitle: "Unable to load platform users",
      disabledReason: {
        protected_superadmin: "Superadmin accounts cannot be suspended.",
        unknown: "This action is unavailable for your role.",
      } as Record<string, string>,
      actionLabels: {
        update_role: "Update role",
        suspend: "Suspend",
        reactivate: "Reactivate",
      } as Record<string, string>,
      riskLabel: {
        low: "low risk",
        medium: "medium risk",
        high: "high risk · reason required",
      } as Record<ActionRiskLevel, string>,
      modal: {
        createTitle: "Invite platform staff",
        createSubtitle:
          "Create the internal user record and assign the initial role before the user enters any tenant or ops workflow.",
        updateTitle: "Update staff role",
        updateSubtitle: "Reassign the platform role for this internal user.",
        suspendTitle: "Suspend staff user",
        suspendSubtitle:
          "Suspended users immediately lose platform access. A reason is recorded on the audit trail.",
        reactivateTitle: "Reactivate staff user",
        reactivateSubtitle:
          "Restore platform access for this internal user. A reason is recorded on the audit trail.",
        email: "Email",
        displayName: "Display name",
        role: "Role",
        currentRole: "Current role",
        reason: "Reason",
        reasonPlaceholder: "Why is this change being made?",
        cancel: "Cancel",
        confirmCreate: "Send invite",
        confirmUpdate: "Update role",
        confirmSuspend: "Suspend user",
        confirmReactivate: "Reactivate user",
        working: "Working…",
      },
      toast: {
        created: "Staff user invited.",
        updated: "Staff role updated.",
        suspended: "Staff user suspended.",
        reactivated: "Staff user reactivated.",
        viewAudit: "View audit trail",
      },
      empty: {
        no_data: {
          tone: "neutral",
          icon: "users",
          title: "No platform staff yet",
          body: "Invite the first internal user to start governing platform roles.",
          action: "Invite staff",
        },
        not_provisioned: {
          tone: "info",
          icon: "flags",
          title: "Staff directory not provisioned",
          body: "This platform realm has no user directory provisioned yet. Re-check once provisioning completes.",
          action: "Re-check",
        },
        fetch_failed: {
          tone: "danger",
          icon: "warn",
          title: "Could not load platform staff",
          body: "The request to the platform-admin API failed. Retry the load.",
          action: "Retry",
        },
        permission_denied: {
          tone: "warn",
          icon: "audit",
          title: "Insufficient permissions",
          body: "Viewing platform staff requires the pa_super_admin role.",
          action: null,
        },
        external_unavailable: {
          tone: "warn",
          icon: "ext",
          title: "Upstream temporarily unavailable",
          body: "An upstream identity dependency is unavailable. Retry shortly.",
          action: "Retry",
        },
        filtered_empty: {
          tone: "neutral",
          icon: "filter",
          title: "No staff match this filter",
          body: "No platform users match the selected status filter.",
          action: "Clear filter",
        },
      } satisfies Record<Exclude<EmptyReason, "driver_not_eligible">, EmptyDef>,
    };
  }

  return {
    breadcrumb: ["租戶治理", "平台人員"] as ReactNode[],
    title: "平台人員",
    subtitle: "平台內部使用者與角色 · RBAC 守門以後端為準。",
    searchPlaceholder: "搜尋租戶、平台人員、介接…",
    refresh: "重新整理",
    invite: "邀請平台人員",
    freshness: {
      fresh: "即時",
      stale: "已過期",
      degraded: "降級",
      unknown: "—",
    },
    updatedPrefix: "同步於",
    filtersAria: "依狀態篩選平台人員",
    filters: {
      all: "全部",
      active: "active",
      invited: "invited",
      suspended: "suspended",
    },
    cols: {
      name: "NAME",
      email: "EMAIL",
      role: "ROLE",
      status: "STATUS",
      updated: "更新",
      actions: "動作",
    },
    readOnly: "唯讀",
    loading: "載入平台人員中…",
    errorTitle: "無法載入平台人員資料",
    disabledReason: {
      protected_superadmin: "Superadmin 帳號無法被停用。",
      unknown: "此動作不適用於你目前的角色。",
    } as Record<string, string>,
    actionLabels: {
      update_role: "更新角色",
      suspend: "停用",
      reactivate: "啟用",
    } as Record<string, string>,
    riskLabel: {
      low: "低風險",
      medium: "中風險",
      high: "高風險 · 需填理由",
    } as Record<ActionRiskLevel, string>,
    modal: {
      createTitle: "邀請平台人員",
      createSubtitle:
        "先建立內部使用者主檔與初始角色，再讓該使用者進入 tenant 或 ops workflow。",
      updateTitle: "更新人員角色",
      updateSubtitle: "重新指派此內部使用者的平台角色。",
      suspendTitle: "停用平台人員",
      suspendSubtitle:
        "停用後該使用者會立即失去平台存取權，理由會記錄到稽核軌跡。",
      reactivateTitle: "重新啟用平台人員",
      reactivateSubtitle:
        "恢復此內部使用者的平台存取權，理由會記錄到稽核軌跡。",
      email: "電子郵件",
      displayName: "顯示名稱",
      role: "角色",
      currentRole: "目前角色",
      reason: "理由",
      reasonPlaceholder: "為什麼要做這個變更？",
      cancel: "取消",
      confirmCreate: "送出邀請",
      confirmUpdate: "更新角色",
      confirmSuspend: "停用使用者",
      confirmReactivate: "啟用使用者",
      working: "處理中…",
    },
    toast: {
      created: "已邀請平台人員。",
      updated: "已更新人員角色。",
      suspended: "已停用平台人員。",
      reactivated: "已重新啟用平台人員。",
      viewAudit: "查看稽核軌跡",
    },
    empty: {
      no_data: {
        tone: "neutral",
        icon: "users",
        title: "尚無平台人員",
        body: "邀請第一位內部使用者，開始治理平台角色。",
        action: "邀請平台人員",
      },
      not_provisioned: {
        tone: "info",
        icon: "flags",
        title: "人員目錄尚未佈建",
        body: "此平台 realm 尚未佈建使用者目錄，佈建完成後再重新檢查。",
        action: "重新檢查",
      },
      fetch_failed: {
        tone: "danger",
        icon: "warn",
        title: "無法載入平台人員",
        body: "向 platform-admin API 的請求失敗，請重試。",
        action: "重試",
      },
      permission_denied: {
        tone: "warn",
        icon: "audit",
        title: "權限不足",
        body: "檢視平台人員需要 pa_super_admin 角色。",
        action: null,
      },
      external_unavailable: {
        tone: "warn",
        icon: "ext",
        title: "上游暫時無法使用",
        body: "上游身分依賴暫時無法使用，請稍後重試。",
        action: "重試",
      },
      filtered_empty: {
        tone: "neutral",
        icon: "filter",
        title: "此篩選沒有符合的人員",
        body: "沒有平台人員符合目前選取的狀態篩選。",
        action: "清除篩選",
      },
    } satisfies Record<Exclude<EmptyReason, "driver_not_eligible">, EmptyDef>,
  };
}

type UsersCopy = ReturnType<typeof buildCopy>;

export default function UsersPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();

  const copy = useMemo(() => buildCopy(locale), [locale]);

  const [users, setUsers] = useState<PlatformAdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<UserFilter>("all");
  const [refreshMeta, setRefreshMeta] = useState<UiRefreshMetadata | null>(
    null,
  );
  const [nowTs, setNowTs] = useState(0);

  // Confirmation modal + write state.
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formRoleCode, setFormRoleCode] =
    useState<PlatformAdminUserRole>("operator");
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);

  const navItems = useMemo<CanvasShellNavItem[]>(
    () => [
      { divider: locale === "en" ? "Workspace" : "工作面" },
      {
        key: "home",
        href: "/",
        icon: "home",
        label: locale === "en" ? "Home" : "工作首頁",
      },
      {
        key: "health",
        href: "/health",
        icon: "health",
        label: locale === "en" ? "Platform Health" : "平台健康",
      },
      { divider: locale === "en" ? "Tenant Governance" : "租戶治理" },
      {
        key: "tenants",
        href: "/tenants",
        icon: "tenants",
        label: locale === "en" ? "Tenants" : "租戶",
      },
      {
        key: "partners",
        href: "/partners",
        icon: "partners",
        label: locale === "en" ? "Partner Entry" : "合作夥伴 entry",
      },
      {
        key: "users",
        href: "/users",
        icon: "users",
        label: locale === "en" ? "Platform Staff" : "平台人員",
      },
      { divider: locale === "en" ? "People & Fleet" : "人員與車隊" },
      {
        key: "fleet",
        href: "/fleet",
        icon: "fleet",
        label: locale === "en" ? "Fleet & Compliance" : "車隊與合規",
      },
      {
        key: "switchboard",
        href: "/switchboard",
        icon: "switchboard",
        label: locale === "en" ? "Public Info & Placards" : "法定資訊與牌貼",
      },
      { divider: locale === "en" ? "Platform & Commerce" : "平台與商務" },
      {
        key: "pricing",
        href: "/pricing",
        icon: "pricing",
        label: locale === "en" ? "Pricing" : "計價",
      },
      {
        key: "payments",
        href: "/payments",
        icon: "payments",
        label: locale === "en" ? "Settlement" : "結算治理",
      },
      { divider: locale === "en" ? "Platform Ops & Risk" : "平台維運" },
      {
        key: "notices",
        href: "/notices",
        icon: "notices",
        label: locale === "en" ? "Notices & Maintenance" : "公告與維護",
      },
      {
        key: "audit",
        href: "/audit",
        icon: "audit",
        label: locale === "en" ? "Audit & Evidence" : "稽核與證據",
      },
      {
        key: "flags",
        href: "/feature-flags",
        icon: "flags",
        label: locale === "en" ? "Feature Flags" : "功能旗標",
      },
      {
        key: "adapters",
        href: "/adapter-registry",
        icon: "adapters",
        label: locale === "en" ? "Adapter Registry" : "介接登錄",
      },
    ],
    [locale],
  );

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listPlatformAdminUsers();
      setUsers(result ?? []);
      // Synthesize the freshness envelope client-side: the list endpoint does
      // not yet attach `UiRefreshMetadata`, so we stamp the snapshot at fetch
      // time and drive the stale affordance from the T4 cadence (§3.2).
      setRefreshMeta({
        generatedAt: new Date().toISOString(),
        staleAfterMs: REFRESH_CADENCE,
        dataFreshness: "fresh",
        source: "live",
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
      setRefreshMeta((current) =>
        current
          ? { ...current, dataFreshness: "degraded", source: "cache" }
          : null,
      );
    } finally {
      setLoading(false);
    }
  }, [client, t]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // Tier T4 polling (§3.2): auto-refresh on the medium-slow cadence.
  useEffect(() => {
    if (REFRESH_CADENCE_MS[REFRESH_TIER] === null) {
      return;
    }
    const interval = setInterval(() => {
      void loadUsers();
    }, REFRESH_CADENCE);
    return () => clearInterval(interval);
  }, [loadUsers]);

  // Lightweight ticker so the stale pill can flip between auto-refreshes.
  useEffect(() => {
    setNowTs(Date.now());
    const ticker = setInterval(() => setNowTs(Date.now()), 5_000);
    return () => clearInterval(ticker);
  }, []);

  const counts = useMemo(
    () => ({
      all: users.length,
      active: users.filter((user) => user.status === "active").length,
      invited: users.filter((user) => user.status === "invited").length,
      suspended: users.filter((user) => user.status === "suspended").length,
    }),
    [users],
  );

  const visibleUsers = useMemo<UserRow[]>(() => {
    const filtered =
      filter === "all" ? users : users.filter((user) => user.status === filter);
    return [...filtered].sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    ) as UserRow[];
  }, [filter, users]);

  // Empty / not-ready state derivation (§3.6) — six distinct EmptyReason
  // treatments. The list endpoint does not return an EmptyStateEnvelope, so we
  // derive the reason from the signals we actually have (error class, filter).
  const emptyReason = useMemo<
    Exclude<EmptyReason, "driver_not_eligible">
  >(() => {
    if (error) {
      const message = error.toLowerCase();
      if (/(403|forbidden|permission|unauthor|scope)/.test(message)) {
        return "permission_denied";
      }
      if (/(provision|not configured|no realm|directory)/.test(message)) {
        return "not_provisioned";
      }
      if (
        /(unavailable|upstream|gateway|timeout|network|connect|502|503|504)/.test(
          message,
        )
      ) {
        return "external_unavailable";
      }
      return "fetch_failed";
    }
    if (users.length > 0 && visibleUsers.length === 0) {
      return "filtered_empty";
    }
    return "no_data";
  }, [error, users.length, visibleUsers.length]);

  const freshness = useMemo(() => {
    if (!refreshMeta) {
      return { tone: "neutral" as CanvasTone, label: copy.freshness.unknown };
    }
    if (refreshMeta.dataFreshness === "degraded") {
      return { tone: "danger" as CanvasTone, label: copy.freshness.degraded };
    }
    const ageMs = nowTs - new Date(refreshMeta.generatedAt).getTime();
    const stale = nowTs > 0 && ageMs > refreshMeta.staleAfterMs;
    return stale
      ? { tone: "warn" as CanvasTone, label: copy.freshness.stale }
      : { tone: "success" as CanvasTone, label: copy.freshness.fresh };
  }, [copy.freshness, nowTs, refreshMeta]);

  // ── Action plumbing ──────────────────────────────────────────────────────
  const closeModal = useCallback(() => {
    setPending(null);
    setReason("");
    setError(null);
  }, []);

  const openCreate = useCallback(() => {
    setFormEmail("");
    setFormDisplayName("");
    setFormRoleCode("operator");
    setReason("");
    setError(null);
    setPending({ kind: "create", riskLevel: "medium" });
  }, []);

  const startUserAction = useCallback(
    (user: PlatformAdminUserRecord, descriptor: ResourceActionDescriptor) => {
      if (!descriptor.enabled) {
        return;
      }
      setError(null);
      setReason("");
      if (descriptor.action === "update_role") {
        setFormRoleCode(user.roleCode);
        setPending({ kind: "update_role", riskLevel: "medium", user });
        return;
      }
      if (
        descriptor.action === "suspend" ||
        descriptor.action === "reactivate"
      ) {
        setPending({
          kind: descriptor.action,
          riskLevel: descriptor.riskLevel,
          requiresReason: descriptor.requiresReason ?? true,
          user,
        });
      }
    },
    [],
  );

  const confirmPending = useCallback(async () => {
    if (!pending) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (pending.kind === "create") {
        const created = await client.createPlatformAdminUser({
          email: formEmail.trim(),
          displayName: formDisplayName.trim(),
          roleCode: formRoleCode,
        });
        setToast({
          message: copy.toast.created,
          auditLink: buildAuditLink(created.userId, copy.toast.viewAudit),
        });
      } else if (pending.kind === "update_role") {
        const updated = await client.updatePlatformAdminUserRole(
          pending.user.userId,
          { roleCode: formRoleCode, status: pending.user.status },
        );
        setToast({
          message: copy.toast.updated,
          auditLink: buildAuditLink(updated.userId, copy.toast.viewAudit),
        });
      } else {
        const nextStatus: PlatformAdminUserStatus =
          pending.kind === "suspend" ? "suspended" : "active";
        const updated = await client.updatePlatformAdminUserRole(
          pending.user.userId,
          { roleCode: pending.user.roleCode, status: nextStatus },
        );
        setToast({
          message:
            pending.kind === "suspend"
              ? copy.toast.suspended
              : copy.toast.reactivated,
          auditLink: buildAuditLink(updated.userId, copy.toast.viewAudit),
        });
      }
      closeModal();
      await loadUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setSubmitting(false);
    }
  }, [
    client,
    closeModal,
    copy.toast,
    formDisplayName,
    formEmail,
    formRoleCode,
    loadUsers,
    pending,
    t,
  ]);

  // Auto-dismiss the toast receipt.
  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => setToast(null), 8_000);
    return () => clearTimeout(timer);
  }, [toast]);

  const emptyNextAction = useCallback(
    (reasonKind: Exclude<EmptyReason, "driver_not_eligible">) => {
      if (reasonKind === "no_data") {
        openCreate();
      } else if (reasonKind === "filtered_empty") {
        setFilter("all");
      } else {
        void loadUsers();
      }
    },
    [loadUsers, openCreate],
  );

  const columns = useMemo<CanvasTableColumn<UserRow>[]>(
    () => [
      {
        h: copy.cols.name,
        w: 220,
        r: (user) => (
          <div style={userCellStyle}>
            <span style={avatarStyle}>{user.displayName.slice(0, 2)}</span>
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
              }}
            >
              <span style={userNameStyle}>{user.displayName}</span>
              <span style={userIdStyle}>{user.userId}</span>
            </span>
          </div>
        ),
      },
      { h: copy.cols.email, k: "email", w: 230, mono: true },
      {
        h: copy.cols.role,
        w: 150,
        r: (user) => (
          <CanvasPill theme={th} tone={roleTone(user.roleCode)} dot>
            <span title={user.roleCode}>
              {formatPlatformCodeLabel(locale, user.roleCode)}
            </span>
          </CanvasPill>
        ),
      },
      {
        h: copy.cols.status,
        w: 120,
        r: (user) => (
          <CanvasPill theme={th} tone={statusTone(user.status)} dot>
            {formatPlatformCodeLabel(locale, user.status)}
          </CanvasPill>
        ),
      },
      {
        h: copy.cols.updated,
        w: 160,
        mono: true,
        r: (user) => formatDateTime(user.updatedAt),
      },
      {
        h: copy.cols.actions,
        w: 220,
        r: (user) => {
          const actions = resolveUserActions(user);
          if (actions.length === 0) {
            return <span style={readOnlyHintStyle}>{copy.readOnly}</span>;
          }
          return (
            <div style={rowActionsStyle}>
              {actions.map((descriptor) => {
                const label =
                  copy.actionLabels[descriptor.action] ?? descriptor.action;
                const title = descriptor.enabled
                  ? copy.riskLabel[descriptor.riskLevel]
                  : (copy.disabledReason[
                      descriptor.disabledReasonCode ?? "unknown"
                    ] ?? copy.disabledReason.unknown);
                return (
                  <span key={descriptor.action} title={title}>
                    <CanvasBtn
                      theme={th}
                      size="xs"
                      variant={
                        descriptor.action === "suspend" ? "ghost" : "secondary"
                      }
                      danger={
                        descriptor.action === "suspend" && descriptor.enabled
                      }
                      disabled={!descriptor.enabled || submitting}
                      onClick={() => startUserAction(user, descriptor)}
                    >
                      {label}
                    </CanvasBtn>
                  </span>
                );
              })}
            </div>
          );
        },
      },
    ],
    [
      copy.actionLabels,
      copy.cols,
      copy.disabledReason,
      copy.readOnly,
      copy.riskLabel,
      locale,
      startUserAction,
      submitting,
    ],
  );

  const filterOptions: {
    value: UserFilter;
    label: string;
    count: number;
    tone: CanvasTone;
  }[] = [
    {
      value: "all",
      label: copy.filters.all,
      count: counts.all,
      tone: "neutral",
    },
    {
      value: "active",
      label: copy.filters.active,
      count: counts.active,
      tone: "success",
    },
    {
      value: "invited",
      label: copy.filters.invited,
      count: counts.invited,
      tone: "warn",
    },
    {
      value: "suspended",
      label: copy.filters.suspended,
      count: counts.suspended,
      tone: "danger",
    },
  ];

  const emptyDef = copy.empty[emptyReason];

  return (
    <CanvasShell
      theme={th}
      nav={navItems}
      active="users"
      currentPath="/users"
      breadcrumb={copy.breadcrumb}
      brandLabel="DRTS Fleet"
      brandSubLabel="Platform Admin"
      brandMark="PA"
      avatarLabel="PA"
      searchPlaceholder={copy.searchPlaceholder}
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={th}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <div style={headerActionsStyle}>
            {refreshMeta ? (
              <span
                style={refreshMetaStyle}
                title={`T4 · ${REFRESH_CADENCE / 1000}s`}
              >
                <CanvasPill theme={th} tone={freshness.tone} dot>
                  {freshness.label}
                </CanvasPill>
                {copy.updatedPrefix} {formatDateTime(refreshMeta.generatedAt)}
              </span>
            ) : null}
            <CanvasBtn
              theme={th}
              variant="secondary"
              icon="reports"
              disabled={loading}
              onClick={() => void loadUsers()}
            >
              {copy.refresh}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="plus"
              onClick={openCreate}
            >
              {copy.invite}
            </CanvasBtn>
          </div>
        }
      />

      <div style={pageBodyStyle}>
        <div style={filterRowStyle} aria-label={copy.filtersAria} role="group">
          {filterOptions.map((option) => {
            const active = filter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                style={filterButtonStyle}
                onClick={() => setFilter(option.value)}
                aria-pressed={active}
              >
                <CanvasPill
                  theme={th}
                  tone={active ? "accent" : option.tone}
                  dot
                >
                  {option.label} {option.count}
                </CanvasPill>
              </button>
            );
          })}
        </div>

        {error && visibleUsers.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={copy.errorTitle}
            body={error}
            actions={
              <CanvasBtn
                theme={th}
                variant="secondary"
                onClick={() => void loadUsers()}
              >
                {copy.refresh}
              </CanvasBtn>
            }
          />
        ) : null}

        <CanvasCard theme={th} padding={0}>
          {loading && users.length === 0 ? (
            <div style={loadingStateStyle}>{copy.loading}</div>
          ) : visibleUsers.length > 0 ? (
            <CanvasTable<UserRow>
              theme={th}
              columns={columns}
              rows={visibleUsers}
            />
          ) : (
            <div style={emptyStateStyle}>
              <span style={emptyIconWrapStyle(emptyDef.tone)}>
                <CanvasIcon name={emptyDef.icon} size={22} />
              </span>
              <span style={emptyTitleStyle}>{emptyDef.title}</span>
              <span style={emptyBodyStyle}>{emptyDef.body}</span>
              {emptyDef.action ? (
                <CanvasBtn
                  theme={th}
                  variant={emptyReason === "no_data" ? "primary" : "secondary"}
                  icon={emptyReason === "no_data" ? "plus" : "reports"}
                  onClick={() => emptyNextAction(emptyReason)}
                >
                  {emptyDef.action}
                </CanvasBtn>
              ) : null}
            </div>
          )}
        </CanvasCard>
      </div>

      {pending ? (
        <ConfirmModal
          pending={pending}
          copy={copy}
          locale={locale}
          error={error}
          submitting={submitting}
          formEmail={formEmail}
          formDisplayName={formDisplayName}
          formRoleCode={formRoleCode}
          reason={reason}
          onEmail={setFormEmail}
          onDisplayName={setFormDisplayName}
          onRoleCode={setFormRoleCode}
          onReason={setReason}
          onClose={closeModal}
          onConfirm={() => void confirmPending()}
        />
      ) : null}

      {toast ? (
        <div style={toastWrapStyle} role="status">
          <span style={{ color: th.success, marginTop: 1, flexShrink: 0 }}>
            <CanvasIcon name="check" size={16} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: th.text }}>
              {toast.message}
            </div>
            <Link
              href={toast.auditLink.route}
              style={auditLinkStyle}
              target={
                toast.auditLink.openMode === "new_tab" ? "_blank" : undefined
              }
            >
              {toast.auditLink.label}
              <CanvasIcon name="chevR" size={12} />
            </Link>
          </div>
          <button
            type="button"
            style={closeButtonStyle}
            aria-label={copy.modal.cancel}
            onClick={() => setToast(null)}
          >
            <CanvasIcon name="x" size={13} />
          </button>
        </div>
      ) : null}
    </CanvasShell>
  );
}

// ── Risk-classified confirmation modal (§3.4) ────────────────────────────────
function ConfirmModal(props: {
  pending: PendingAction;
  copy: UsersCopy;
  locale: Locale;
  error: string | null;
  submitting: boolean;
  formEmail: string;
  formDisplayName: string;
  formRoleCode: PlatformAdminUserRole;
  reason: string;
  onEmail: (value: string) => void;
  onDisplayName: (value: string) => void;
  onRoleCode: (value: PlatformAdminUserRole) => void;
  onReason: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const {
    pending,
    copy,
    locale,
    error,
    submitting,
    formEmail,
    formDisplayName,
    formRoleCode,
    reason,
    onEmail,
    onDisplayName,
    onRoleCode,
    onReason,
    onClose,
    onConfirm,
  } = props;

  const titles: Record<
    PendingAction["kind"],
    { title: string; subtitle: string; confirm: string }
  > = {
    create: {
      title: copy.modal.createTitle,
      subtitle: copy.modal.createSubtitle,
      confirm: copy.modal.confirmCreate,
    },
    update_role: {
      title: copy.modal.updateTitle,
      subtitle: copy.modal.updateSubtitle,
      confirm: copy.modal.confirmUpdate,
    },
    suspend: {
      title: copy.modal.suspendTitle,
      subtitle: copy.modal.suspendSubtitle,
      confirm: copy.modal.confirmSuspend,
    },
    reactivate: {
      title: copy.modal.reactivateTitle,
      subtitle: copy.modal.reactivateSubtitle,
      confirm: copy.modal.confirmReactivate,
    },
  };

  const meta = titles[pending.kind];
  const riskTone: CanvasTone =
    pending.riskLevel === "high"
      ? "danger"
      : pending.riskLevel === "medium"
        ? "warn"
        : "neutral";

  const reasonMissing =
    (pending.kind === "suspend" || pending.kind === "reactivate") &&
    pending.requiresReason &&
    reason.trim().length === 0;
  const createMissing =
    pending.kind === "create" &&
    (formEmail.trim().length === 0 || formDisplayName.trim().length === 0);
  const confirmDisabled = submitting || reasonMissing || createMissing;

  return (
    <div
      style={overlayStyle}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div style={modalCardStyle} role="dialog" aria-modal="true">
        <div style={modalHeaderStyle}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: th.text }}>
                {meta.title}
              </span>
              <CanvasPill theme={th} tone={riskTone} dot>
                {copy.riskLabel[pending.riskLevel]}
              </CanvasPill>
            </div>
            <div
              style={{ fontSize: 12, color: th.textMuted, lineHeight: 1.45 }}
            >
              {meta.subtitle}
            </div>
          </div>
          <button
            type="button"
            style={closeButtonStyle}
            aria-label={copy.modal.cancel}
            disabled={submitting}
            onClick={onClose}
          >
            <CanvasIcon name="x" size={13} />
          </button>
        </div>

        <div style={modalBodyStyle}>
          {pending.kind === "create" ? (
            <>
              <CanvasField theme={th} label={copy.modal.email} required>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(event) => onEmail(event.target.value)}
                  placeholder="staff@platform.drts"
                  style={monoInputStyle}
                />
              </CanvasField>
              <CanvasField theme={th} label={copy.modal.displayName} required>
                <input
                  type="text"
                  value={formDisplayName}
                  onChange={(event) => onDisplayName(event.target.value)}
                  style={inputStyle}
                />
              </CanvasField>
              <CanvasField theme={th} label={copy.modal.role}>
                <select
                  value={formRoleCode}
                  onChange={(event) =>
                    onRoleCode(event.target.value as PlatformAdminUserRole)
                  }
                  style={inputStyle}
                >
                  {ROLE_CODES.map((roleCode) => (
                    <option key={roleCode} value={roleCode}>
                      {formatPlatformCodeLabel(locale, roleCode)}
                    </option>
                  ))}
                </select>
              </CanvasField>
            </>
          ) : null}

          {pending.kind === "update_role" ? (
            <>
              <CanvasField theme={th} label={copy.modal.currentRole}>
                <div style={{ fontSize: 12.5, color: th.textMuted }}>
                  {formatPlatformCodeLabel(locale, pending.user.roleCode)} ·{" "}
                  {pending.user.displayName}
                </div>
              </CanvasField>
              <CanvasField theme={th} label={copy.modal.role}>
                <select
                  value={formRoleCode}
                  onChange={(event) =>
                    onRoleCode(event.target.value as PlatformAdminUserRole)
                  }
                  style={inputStyle}
                >
                  {ROLE_CODES.map((roleCode) => (
                    <option key={roleCode} value={roleCode}>
                      {formatPlatformCodeLabel(locale, roleCode)}
                    </option>
                  ))}
                </select>
              </CanvasField>
            </>
          ) : null}

          {pending.kind === "suspend" || pending.kind === "reactivate" ? (
            <CanvasField theme={th} label={copy.modal.reason} required>
              <textarea
                value={reason}
                onChange={(event) => onReason(event.target.value)}
                placeholder={copy.modal.reasonPlaceholder}
                style={textareaStyle}
              />
            </CanvasField>
          ) : null}

          {error ? (
            <CanvasBanner theme={th} tone="danger" icon="warn" body={error} />
          ) : null}
        </div>

        <div style={modalFooterStyle}>
          <CanvasBtn
            theme={th}
            variant="secondary"
            disabled={submitting}
            onClick={onClose}
          >
            {copy.modal.cancel}
          </CanvasBtn>
          <CanvasBtn
            theme={th}
            variant="primary"
            danger={pending.kind === "suspend"}
            icon="check"
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {submitting ? copy.modal.working : meta.confirm}
          </CanvasBtn>
        </div>
      </div>
    </div>
  );
}

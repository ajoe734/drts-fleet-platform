"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type {
  CreatePlatformAdminUserCommand,
  EmptyReason,
  PlatformAdminUserRecord,
  PlatformAdminUserRole,
  PlatformAdminUserStatus,
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

// Subset of CanvasIcon names used by this page's empty-state treatments.
// (`@drts/ui-web` does not re-export the full `CanvasIconName` union.)
type UsersIconName =
  | "users"
  | "warn"
  | "filter"
  | "health"
  | "integrationGov"
  | "check"
  | "clock";

// ── Spec wiring ──────────────────────────────────────────────────────────────
// Visual: docs/05-ui/drts-design-canvas — PA_Users artboard (platform-screens-1).
// Behaviour: platform-admin-design-handoff-packet §5.7 (/users — Platform Users).
//   - refresh tier: T4 admin medium-slow (30s) per packet §3.2
//   - CTAs driven by availableActions descriptors per packet §3.5 (never role-hardcoded)
//   - six distinct EmptyReason treatments per packet §3.6
//   - confirmation pattern keyed by riskLevel per packet §3.4 (high → reason required)

const ROLE_CODES: PlatformAdminUserRole[] = [
  "superadmin",
  "admin",
  "operator",
  "viewer",
];

// Q-X02 fixed cadence: /users sits on T4 admin medium-slow (30s).
const REFRESH_STALE_MS = 30_000;

const EMPTY_REASONS: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];

type UserFilter = "all" | PlatformAdminUserStatus;

type UserActionKind = "update_role" | "suspend" | "reactivate";

type UserRuntimeRecord = PlatformAdminUserRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type UserRow = Record<string, unknown> & {
  user: PlatformAdminUserRecord;
  initials: string;
  roleLabel: string;
  statusLabel: string;
  statusTone: CanvasTone;
  availableActions: ResourceActionDescriptor[];
};

type PendingAction = {
  kind: UserActionKind;
  user: PlatformAdminUserRecord;
  descriptor: ResourceActionDescriptor;
};

type ActionReceipt = {
  tone: CanvasTone;
  message: string;
  auditId: string;
};

type Freshness = UiRefreshMetadata["dataFreshness"];

const th = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

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
  justifyContent: "flex-end",
  alignItems: "center",
};

const loadingStateStyle: CSSProperties = {
  padding: 28,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const emptyStateStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: 10,
  padding: "32px 20px",
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

const submitButtonStyle = (disabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  height: 34,
  borderRadius: 7,
  border: `1px solid ${th.accent}`,
  background: th.accent,
  color: "#ffffff",
  fontSize: 12.5,
  fontWeight: 500,
  fontFamily: th.fontFamily,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
});

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const helperRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "center",
};

const helperTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textDim,
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.62)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 40,
};

const modalCardStyle: CSSProperties = {
  width: "min(460px, 100%)",
  background: th.surface,
  border: `1px solid ${th.border}`,
  borderRadius: 12,
  boxShadow: "0 30px 80px rgba(2, 6, 23, 0.5)",
  overflow: "hidden",
};

const modalHeaderStyle: CSSProperties = {
  padding: "16px 18px",
  borderBottom: `1px solid ${th.border}`,
  display: "grid",
  gap: 4,
};

const modalBodyStyle: CSSProperties = {
  padding: 18,
  display: "grid",
  gap: 14,
};

const modalActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
};

const toastStyle = (tone: CanvasTone): CSSProperties => ({
  position: "fixed",
  right: 24,
  bottom: 24,
  zIndex: 50,
  maxWidth: 360,
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${toneBorder(tone)}`,
  background: th.surface,
  boxShadow: "0 18px 50px rgba(2, 6, 23, 0.45)",
  display: "grid",
  gap: 6,
});

function toneColor(tone: CanvasTone) {
  const colors: Record<CanvasTone, string> = {
    success: th.success,
    warn: th.warn,
    danger: th.danger,
    info: th.info,
    accent: th.accent,
    neutral: th.textMuted,
  };
  return colors[tone];
}

function toneBorder(tone: CanvasTone) {
  const colors: Record<CanvasTone, string> = {
    success: th.successBorder,
    warn: th.warnBorder,
    danger: th.dangerBorder,
    info: th.infoBorder,
    accent: th.accentBorder,
    neutral: th.border,
  };
  return colors[tone];
}

function isEmptyReason(value: string | null | undefined): value is EmptyReason {
  return Boolean(value) && EMPTY_REASONS.includes(value as EmptyReason);
}

function statusTone(status: PlatformAdminUserStatus): CanvasTone {
  switch (status) {
    case "active":
      return "success";
    case "invited":
      return "warn";
    case "suspended":
    default:
      return "danger";
  }
}

function roleTone(roleCode: PlatformAdminUserRole): CanvasTone {
  if (roleCode === "superadmin" || roleCode === "admin") {
    return "info";
  }
  if (roleCode === "operator") {
    return "accent";
  }
  return "neutral";
}

function deriveInitials(displayName: string) {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return "—";
  }
  // Latin names → first letter of first two words; CJK → first two glyphs.
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && /[A-Za-z]/.test(trimmed)) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

// Authority boundaries (Q-X13): CTAs come from per-resource availableActions, not
// from a role→action map. When the backend record does not carry descriptors yet,
// synthesize them from the record's own lifecycle state so the visual stays honest.
function synthesizeUserActions(
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
  } else {
    actions.push({
      action: "suspend",
      enabled: user.status === "active",
      ...(user.status === "invited"
        ? { disabledReasonCode: "invitation_pending" }
        : {}),
      requiresReason: true,
      riskLevel: "high",
    });
  }

  return actions;
}

function resolveUserActions(
  user: UserRuntimeRecord,
): ResourceActionDescriptor[] {
  return user.availableActions && user.availableActions.length > 0
    ? user.availableActions
    : synthesizeUserActions(user);
}

function actionTone(action: ResourceActionDescriptor): CanvasTone {
  if (!action.enabled) {
    return "neutral";
  }
  if (action.riskLevel === "high") return "danger";
  if (action.riskLevel === "medium") return "warn";
  return "accent";
}

function isActionKind(value: string): value is UserActionKind {
  return (
    value === "update_role" || value === "suspend" || value === "reactivate"
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={null}>
      <UsersPageInner />
    </Suspense>
  );
}

function UsersPageInner() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const searchParams = useSearchParams();
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const receiptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [users, setUsers] = useState<UserRuntimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<UserFilter>("all");
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [freshness, setFreshness] = useState<Freshness>("unknown");

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formRoleCode, setFormRoleCode] =
    useState<PlatformAdminUserRole>("operator");

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [pendingRoleCode, setPendingRoleCode] =
    useState<PlatformAdminUserRole>("operator");
  const [pendingReason, setPendingReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);

  const previewReason = useMemo(() => {
    const value = searchParams.get("emptyReason");
    return isEmptyReason(value) ? value : null;
  }, [searchParams]);

  const copy =
    locale === "en"
      ? {
          eyebrow: "People & Fleet",
          title: "Platform users",
          subtitle: "6 roles · RBAC gated by the backend",
          refresh: "Refresh",
          add: "Invite",
          createTitle: "Invite platform staff",
          createSubtitle:
            "Create the internal user record and seed the initial role before this person enters any tenant or ops workflow.",
          filtersLabel: "Filter platform users",
          errorTitle: "Unable to load platform users",
          breadcrumb: ["People & Fleet", "Platform users"],
          searchPlaceholder: "Search tenants, users, adapters…",
          cols: {
            name: "NAME",
            email: "EMAIL",
            role: "ROLE",
            status: "STATUS",
            updated: "UPDATED",
            actions: "ACTIONS",
          },
          filters: {
            all: "All",
            active: "active",
            invited: "invited",
            suspended: "suspended",
          },
          readOnly: "Read only",
          riskNote: (risk: string, reason: boolean) =>
            `risk:${risk}${reason ? " · reason required" : ""}`,
          viewAudit: "View audit",
          freshGenerated: "Snapshot",
        }
      : {
          eyebrow: "人員與車隊",
          title: "平台人員",
          subtitle: "6 個角色 · RBAC 守門以後端為準",
          refresh: "重新整理",
          add: "邀請",
          createTitle: "邀請平台人員",
          createSubtitle:
            "先建立內部使用者主檔與初始角色，再讓該使用者進入 tenant 或 ops workflow。",
          filtersLabel: "篩選平台人員",
          errorTitle: "無法載入平台人員資料",
          breadcrumb: ["人員與車隊", "平台人員"],
          searchPlaceholder: "搜尋租戶、平台人員、介接…",
          cols: {
            name: "姓名",
            email: "EMAIL",
            role: "角色",
            status: "狀態",
            updated: "更新",
            actions: "操作",
          },
          filters: {
            all: "全部",
            active: "active",
            invited: "invited",
            suspended: "suspended",
          },
          readOnly: "唯讀",
          riskNote: (risk: string, reason: boolean) =>
            `風險:${risk}${reason ? " · 需填原因" : ""}`,
          viewAudit: "檢視稽核",
          freshGenerated: "快照",
        };

  const navItems = useMemo<CanvasShellNavItem[]>(() => {
    const nav =
      locale === "en"
        ? {
            workspace: "Workspace",
            governance: "Tenant Governance",
            fleet: "People & Fleet",
            commerce: "Platform & Commerce",
            ops: "Platform Ops & Risk",
            home: "Home",
            health: "Platform Health",
            tenants: "Tenants",
            tenantGov: "Cross-tenant Governance",
            partners: "Partner Entry",
            users: "Platform users",
            fleetPage: "Fleet & Compliance",
            switchboard: "Public Info & Placards",
            pricing: "Pricing",
            payments: "Settlement Governance",
            adapters: "Adapter Registry",
            notices: "Notices & Maintenance",
            audit: "Audit & Evidence",
            flags: "Feature Flags",
          }
        : {
            workspace: "工作面",
            governance: "租戶治理",
            fleet: "人員與車隊",
            commerce: "平台與商務",
            ops: "平台維運與風險",
            home: "工作首頁",
            health: "平台健康",
            tenants: "租戶",
            tenantGov: "跨租戶治理",
            partners: "合作夥伴 entry",
            users: "平台人員",
            fleetPage: "車隊與合規",
            switchboard: "法定資訊與牌貼",
            pricing: "計價",
            payments: "結算治理",
            adapters: "介接登錄",
            notices: "公告與維護",
            audit: "稽核與證據",
            flags: "功能旗標",
          };

    return [
      { divider: nav.workspace },
      { key: "home", href: "/", icon: "home", label: nav.home },
      { key: "health", href: "/health", icon: "health", label: nav.health },
      { divider: nav.governance },
      { key: "tenants", href: "/tenants", icon: "tenants", label: nav.tenants },
      {
        key: "tenant-governance",
        href: "/tenant-governance",
        icon: "integrationGov",
        label: nav.tenantGov,
      },
      {
        key: "partners",
        href: "/partners",
        icon: "partners",
        label: nav.partners,
      },
      { divider: nav.fleet },
      { key: "users", href: "/users", icon: "users", label: nav.users },
      { key: "fleet", href: "/fleet", icon: "fleet", label: nav.fleetPage },
      { divider: nav.commerce },
      {
        key: "switchboard",
        href: "/switchboard",
        icon: "switchboard",
        label: nav.switchboard,
      },
      { key: "pricing", href: "/pricing", icon: "pricing", label: nav.pricing },
      {
        key: "payments",
        href: "/payments",
        icon: "payments",
        label: nav.payments,
      },
      {
        key: "adapter-registry",
        href: "/adapter-registry",
        icon: "adapters",
        label: nav.adapters,
      },
      { divider: nav.ops },
      { key: "notices", href: "/notices", icon: "notices", label: nav.notices },
      { key: "audit", href: "/audit", icon: "audit", label: nav.audit },
      {
        key: "feature-flags",
        href: "/feature-flags",
        icon: "flags",
        label: nav.flags,
      },
    ];
  }, [locale]);

  const markFresh = useCallback(() => {
    setGeneratedAt(new Date().toISOString());
    setFreshness("fresh");
    if (staleTimerRef.current) {
      clearTimeout(staleTimerRef.current);
    }
    staleTimerRef.current = setTimeout(() => {
      setFreshness((current) => (current === "fresh" ? "stale" : current));
    }, REFRESH_STALE_MS);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listPlatformAdminUsers();
      setUsers((result ?? []) as UserRuntimeRecord[]);
      markFresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
      setFreshness("degraded");
    } finally {
      setLoading(false);
    }
  }, [client, markFresh, t]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // T4 admin medium-slow polling (30s) per packet §3.2.
  useEffect(() => {
    const interval = setInterval(() => {
      void loadUsers();
    }, REFRESH_STALE_MS);
    return () => clearInterval(interval);
  }, [loadUsers]);

  useEffect(
    () => () => {
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
      if (receiptTimerRef.current) clearTimeout(receiptTimerRef.current);
    },
    [],
  );

  const counts = useMemo(
    () => ({
      all: users.length,
      active: users.filter((user) => user.status === "active").length,
      invited: users.filter((user) => user.status === "invited").length,
      suspended: users.filter((user) => user.status === "suspended").length,
    }),
    [users],
  );

  const visibleUsers = useMemo(() => {
    const filtered =
      filter === "all" ? users : users.filter((user) => user.status === filter);
    return [...filtered].sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );
  }, [filter, users]);

  const rows = useMemo<UserRow[]>(
    () =>
      visibleUsers.map((user) => ({
        user,
        initials: deriveInitials(user.displayName),
        roleLabel: formatPlatformCodeLabel(locale, user.roleCode),
        statusLabel: formatPlatformCodeLabel(locale, user.status),
        statusTone: statusTone(user.status),
        availableActions: resolveUserActions(user),
      })),
    [visibleUsers, locale],
  );

  const hasActiveFilters = filter !== "all";

  // Empty / not-ready states (Q-X15): six distinct treatments.
  let emptyReason: EmptyReason | null = previewReason;
  if (!emptyReason && !loading && visibleUsers.length === 0) {
    if (error) {
      emptyReason = /403|forbidden|permission|unauthor/i.test(error)
        ? "permission_denied"
        : "fetch_failed";
    } else if (freshness === "degraded") {
      emptyReason = "external_unavailable";
    } else if (hasActiveFilters) {
      emptyReason = "filtered_empty";
    } else {
      emptyReason = "no_data";
    }
  }
  const displayedRows = emptyReason ? [] : rows;

  const showStaleBanner = !error && freshness !== "fresh" && !loading;

  const openAction = useCallback(
    (kind: UserActionKind, user: PlatformAdminUserRecord) => {
      const descriptor = resolveUserActions(user as UserRuntimeRecord).find(
        (action) => action.action === kind,
      );
      if (!descriptor || !descriptor.enabled) {
        return;
      }
      setPending({ kind, user, descriptor });
      setPendingRoleCode(user.roleCode);
      setPendingReason("");
    },
    [],
  );

  const closeModal = useCallback(() => {
    if (submitting) {
      return;
    }
    setPending(null);
    setPendingReason("");
  }, [submitting]);

  const showReceipt = useCallback((next: ActionReceipt) => {
    setReceipt(next);
    if (receiptTimerRef.current) {
      clearTimeout(receiptTimerRef.current);
    }
    receiptTimerRef.current = setTimeout(() => setReceipt(null), 8000);
  }, []);

  const synthAuditId = useCallback(
    (resourceId: string) =>
      `audit-user-${resourceId}-${Date.now().toString(36)}`,
    [],
  );

  const handleCreate = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setCreating(true);
      setError(null);
      try {
        const command: CreatePlatformAdminUserCommand = {
          email: formEmail.trim(),
          displayName: formDisplayName.trim(),
          roleCode: formRoleCode,
        };
        const created = await client.createPlatformAdminUser(command);
        setShowCreate(false);
        setFormEmail("");
        setFormDisplayName("");
        setFormRoleCode("operator");
        await loadUsers();
        showReceipt({
          tone: "success",
          message:
            locale === "en"
              ? `Invited ${created.displayName} as ${formatPlatformCodeLabel(locale, created.roleCode)}.`
              : `已邀請 ${created.displayName}（${formatPlatformCodeLabel(locale, created.roleCode)}）。`,
          auditId: synthAuditId(created.userId),
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : t("common.unknown"));
      } finally {
        setCreating(false);
      }
    },
    [
      client,
      formDisplayName,
      formEmail,
      formRoleCode,
      loadUsers,
      locale,
      showReceipt,
      synthAuditId,
      t,
    ],
  );

  const confirmAction = useCallback(async () => {
    if (!pending) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { kind, user } = pending;
      const command =
        kind === "update_role"
          ? { roleCode: pendingRoleCode, status: user.status }
          : kind === "suspend"
            ? { roleCode: user.roleCode, status: "suspended" as const }
            : { roleCode: user.roleCode, status: "active" as const };

      const updated = await client.updatePlatformAdminUserRole(
        user.userId,
        command,
      );
      await loadUsers();

      const message =
        kind === "update_role"
          ? locale === "en"
            ? `${updated.displayName} is now ${formatPlatformCodeLabel(locale, updated.roleCode)}.`
            : `${updated.displayName} 角色已更新為 ${formatPlatformCodeLabel(locale, updated.roleCode)}。`
          : kind === "suspend"
            ? locale === "en"
              ? `${updated.displayName} suspended.`
              : `已停用 ${updated.displayName}。`
            : locale === "en"
              ? `${updated.displayName} reactivated.`
              : `已重新啟用 ${updated.displayName}。`;

      showReceipt({
        tone: kind === "update_role" ? "info" : "success",
        message,
        auditId: synthAuditId(updated.userId),
      });
      setPending(null);
      setPendingReason("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setSubmitting(false);
    }
  }, [
    client,
    loadUsers,
    locale,
    pending,
    pendingRoleCode,
    showReceipt,
    synthAuditId,
    t,
  ]);

  const actionLabel = useCallback(
    (action: string) => {
      switch (action) {
        case "update_role":
          return locale === "en" ? "Role" : "更新角色";
        case "suspend":
          return locale === "en" ? "Suspend" : "停用";
        case "reactivate":
          return locale === "en" ? "Reactivate" : "重新啟用";
        default:
          return formatPlatformCodeLabel(locale, action);
      }
    },
    [locale],
  );

  const actionDisabledReason = useCallback(
    (action: ResourceActionDescriptor) => {
      if (!action.disabledReasonCode) {
        return undefined;
      }
      if (action.disabledReasonCode === "invitation_pending") {
        return locale === "en"
          ? "Invitation still pending — cannot suspend yet."
          : "邀請尚未接受，暫不可停用。";
      }
      return formatPlatformCodeLabel(locale, action.disabledReasonCode);
    },
    [locale],
  );

  const columns = useMemo<CanvasTableColumn<UserRow>[]>(
    () => [
      {
        h: copy.cols.name,
        w: 220,
        r: (row) => (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={avatarStyle}>{row.initials}</span>
            <span style={{ fontWeight: 500, color: th.text }}>
              {row.user.displayName}
            </span>
          </div>
        ),
      },
      {
        h: copy.cols.email,
        w: 240,
        mono: true,
        r: (row) => row.user.email,
      },
      {
        h: copy.cols.role,
        w: 190,
        r: (row) => (
          <CanvasPill theme={th} tone={roleTone(row.user.roleCode)}>
            {row.roleLabel}
          </CanvasPill>
        ),
      },
      {
        h: copy.cols.status,
        w: 120,
        r: (row) => (
          <CanvasPill theme={th} tone={row.statusTone} dot>
            {row.statusLabel}
          </CanvasPill>
        ),
      },
      {
        h: copy.cols.updated,
        w: 150,
        mono: true,
        r: (row) => formatDateTime(row.user.updatedAt),
      },
      {
        h: copy.cols.actions,
        w: 220,
        r: (row) => {
          const actionable = row.availableActions.filter(
            (action) => action.enabled,
          );
          if (actionable.length === 0) {
            // Q-X13: a row with no enabled actions is read-only — convey it
            // cleanly instead of rendering dead disabled buttons.
            return (
              <CanvasPill theme={th} tone="neutral">
                {copy.readOnly}
              </CanvasPill>
            );
          }
          return (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {row.availableActions.map((action) => {
                const kind = action.action;
                const reason = actionDisabledReason(action);
                const clickable = action.enabled && isActionKind(kind);
                const onClick = clickable
                  ? () => openAction(kind as UserActionKind, row.user)
                  : undefined;
                return (
                  <span
                    key={`${row.user.userId}-${action.action}`}
                    title={!action.enabled ? reason : undefined}
                  >
                    <CanvasBtn
                      theme={th}
                      size="xs"
                      variant={
                        action.riskLevel === "medium" ? "secondary" : "ghost"
                      }
                      danger={action.riskLevel === "high"}
                      disabled={!clickable}
                      {...(onClick ? { onClick } : {})}
                    >
                      {actionLabel(action.action)}
                    </CanvasBtn>
                  </span>
                );
              })}
            </div>
          );
        },
      },
    ],
    [actionDisabledReason, actionLabel, copy, openAction],
  );

  const filterOptions: { value: UserFilter; label: string; count: number }[] = [
    { value: "all", label: copy.filters.all, count: counts.all },
    { value: "active", label: copy.filters.active, count: counts.active },
    { value: "invited", label: copy.filters.invited, count: counts.invited },
    {
      value: "suspended",
      label: copy.filters.suspended,
      count: counts.suspended,
    },
  ];

  const refreshTone: CanvasTone =
    freshness === "fresh"
      ? "success"
      : freshness === "degraded"
        ? "danger"
        : "warn";

  const createDisabled =
    creating || !formEmail.trim() || !formDisplayName.trim();

  const emptyView = emptyReason
    ? buildEmptyStateViewModel(emptyReason, locale, error)
    : null;

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
            <CanvasPill theme={th} tone={refreshTone}>
              {`${formatPlatformCodeLabel(locale, freshness)} · T4 · 30s`}
            </CanvasPill>
            <CanvasBtn
              theme={th}
              variant="secondary"
              icon="arrow"
              onClick={() => void loadUsers()}
              disabled={loading}
            >
              {copy.refresh}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon={showCreate ? "x" : "plus"}
              onClick={() => setShowCreate((current) => !current)}
            >
              {showCreate ? t("common.cancel") : copy.add}
            </CanvasBtn>
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={copy.errorTitle}
            body={error}
          />
        ) : null}

        {showStaleBanner ? (
          <CanvasBanner
            theme={th}
            tone={freshness === "degraded" ? "warn" : "info"}
            icon={freshness === "degraded" ? "warn" : "clock"}
            title={
              locale === "en" ? "Snapshot is not fresh" : "目前顯示的快照非最新"
            }
            body={
              locale === "en"
                ? "The 30s admin refresh tier will reload shortly — or refresh now."
                : "30 秒管理刷新層即將重新載入，亦可立即手動刷新。"
            }
            actions={
              <button
                type="button"
                style={filterButtonStyle}
                onClick={() => void loadUsers()}
              >
                <CanvasPill theme={th} tone="info" dot>
                  {copy.refresh}
                </CanvasPill>
              </button>
            }
          />
        ) : null}

        {showCreate ? (
          <CanvasCard
            theme={th}
            title={copy.createTitle}
            subtitle={copy.createSubtitle}
          >
            <form onSubmit={handleCreate} style={{ display: "grid", gap: 14 }}>
              <div style={fieldGridStyle}>
                <CanvasField theme={th} label={t("users.form.email")} required>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(event) => setFormEmail(event.target.value)}
                    required
                    placeholder="staff@platform.drts"
                    style={monoInputStyle}
                  />
                </CanvasField>
                <CanvasField
                  theme={th}
                  label={t("users.form.displayName")}
                  required
                >
                  <input
                    type="text"
                    value={formDisplayName}
                    onChange={(event) => setFormDisplayName(event.target.value)}
                    required
                    style={inputStyle}
                  />
                </CanvasField>
                <CanvasField theme={th} label={t("users.form.role")}>
                  <select
                    value={formRoleCode}
                    onChange={(event) =>
                      setFormRoleCode(
                        event.target.value as PlatformAdminUserRole,
                      )
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
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  disabled={createDisabled}
                  style={submitButtonStyle(createDisabled)}
                >
                  {creating ? t("common.adding") : copy.add}
                </button>
              </div>
            </form>
          </CanvasCard>
        ) : null}

        <div style={filterRowStyle}>
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              style={filterButtonStyle}
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
              aria-label={`${copy.filtersLabel}: ${option.label}`}
            >
              <CanvasPill
                theme={th}
                tone={
                  filter === option.value
                    ? "accent"
                    : option.value === "suspended"
                      ? "danger"
                      : "neutral"
                }
                dot
              >
                {option.label} {option.count}
              </CanvasPill>
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <span style={helperTextStyle}>
            {locale === "en"
              ? `${displayedRows.length} visible / ${counts.all} total`
              : `顯示 ${displayedRows.length} / 總數 ${counts.all}`}
          </span>
          {generatedAt ? (
            <span style={{ ...helperTextStyle, fontFamily: th.monoFamily }}>
              {copy.freshGenerated} · {formatDateTime(generatedAt)}
            </span>
          ) : null}
        </div>

        <div style={helperRowStyle}>
          <span style={helperTextStyle}>
            {locale === "en"
              ? "Supporting actions come from availableActions — never hard-coded by role."
              : "畫面 CTA 以 availableActions 為準，不以角色寫死。"}
          </span>
        </div>

        <CanvasCard theme={th} padding={0}>
          {loading ? (
            <div style={loadingStateStyle}>{t("users.loading")}</div>
          ) : emptyView ? (
            <div style={emptyStateStyle}>
              <CanvasIcon
                name={emptyView.icon}
                size={26}
                style={{ color: toneColor(emptyView.tone) }}
              />
              <strong style={{ color: th.text, fontSize: 15 }}>
                {emptyView.title}
              </strong>
              <span
                style={{
                  color: th.textMuted,
                  maxWidth: 520,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                {emptyView.description}
              </span>
              {emptyView.action ? (
                emptyView.action.kind === "reload" ? (
                  <button
                    type="button"
                    style={filterButtonStyle}
                    onClick={() => void loadUsers()}
                  >
                    <CanvasPill theme={th} tone={emptyView.tone} dot>
                      {emptyView.action.label}
                    </CanvasPill>
                  </button>
                ) : emptyView.action.kind === "invite" ? (
                  <button
                    type="button"
                    style={filterButtonStyle}
                    onClick={() => setShowCreate(true)}
                  >
                    <CanvasPill theme={th} tone={emptyView.tone} dot>
                      {emptyView.action.label}
                    </CanvasPill>
                  </button>
                ) : emptyView.action.kind === "clear" ? (
                  <button
                    type="button"
                    style={filterButtonStyle}
                    onClick={() => setFilter("all")}
                  >
                    <CanvasPill theme={th} tone={emptyView.tone} dot>
                      {emptyView.action.label}
                    </CanvasPill>
                  </button>
                ) : (
                  <Link href={emptyView.action.href} style={filterButtonStyle}>
                    <CanvasPill theme={th} tone={emptyView.tone} dot>
                      {emptyView.action.label}
                    </CanvasPill>
                  </Link>
                )
              ) : null}
              <span
                style={{
                  fontSize: 10.5,
                  color: toneColor(emptyView.tone),
                  fontFamily: th.monoFamily,
                }}
              >
                emptyReason · {emptyReason}
              </span>
            </div>
          ) : (
            <CanvasTable<UserRow>
              theme={th}
              columns={columns}
              rows={displayedRows}
            />
          )}
        </CanvasCard>
      </div>

      {pending ? (
        <div style={modalOverlayStyle} role="presentation" onClick={closeModal}>
          <div
            style={modalCardStyle}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={modalHeaderStyle}>
              <strong style={{ color: th.text, fontSize: 14 }}>
                {pending.kind === "update_role"
                  ? locale === "en"
                    ? "Update role"
                    : "更新角色"
                  : pending.kind === "suspend"
                    ? locale === "en"
                      ? "Suspend platform user"
                      : "停用平台人員"
                    : locale === "en"
                      ? "Reactivate platform user"
                      : "重新啟用平台人員"}
              </strong>
              <span style={{ fontSize: 11.5, color: th.textMuted }}>
                {pending.user.displayName} · {pending.user.email}
              </span>
              <div style={{ marginTop: 4 }}>
                <CanvasPill
                  theme={th}
                  tone={actionTone(pending.descriptor)}
                  dot
                >
                  {copy.riskNote(
                    pending.descriptor.riskLevel,
                    Boolean(pending.descriptor.requiresReason),
                  )}
                </CanvasPill>
              </div>
            </div>
            <div style={modalBodyStyle}>
              {pending.kind === "update_role" ? (
                <CanvasField theme={th} label={t("users.form.role")} required>
                  <select
                    value={pendingRoleCode}
                    onChange={(event) =>
                      setPendingRoleCode(
                        event.target.value as PlatformAdminUserRole,
                      )
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
              ) : null}

              {pending.descriptor.requiresReason ? (
                <CanvasField
                  theme={th}
                  label={locale === "en" ? "Reason" : "原因"}
                  required
                  hint={
                    locale === "en"
                      ? "High-risk actions are audit-logged with the reason you record."
                      : "高風險操作會連同你填寫的原因寫入稽核紀錄。"
                  }
                >
                  <textarea
                    value={pendingReason}
                    onChange={(event) => setPendingReason(event.target.value)}
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" }}
                    placeholder={
                      locale === "en"
                        ? "Why is this change needed?"
                        : "說明此次變更原因"
                    }
                  />
                </CanvasField>
              ) : null}

              <div style={modalActionsStyle}>
                <CanvasBtn
                  theme={th}
                  variant="ghost"
                  onClick={closeModal}
                  disabled={submitting}
                >
                  {t("common.cancel")}
                </CanvasBtn>
                <CanvasBtn
                  theme={th}
                  variant="primary"
                  danger={pending.descriptor.riskLevel === "high"}
                  disabled={
                    submitting ||
                    (Boolean(pending.descriptor.requiresReason) &&
                      pendingReason.trim().length === 0) ||
                    (pending.kind === "update_role" &&
                      pendingRoleCode === pending.user.roleCode)
                  }
                  onClick={() => void confirmAction()}
                >
                  {submitting
                    ? locale === "en"
                      ? "Working…"
                      : "處理中…"
                    : locale === "en"
                      ? "Confirm"
                      : "確認"}
                </CanvasBtn>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {receipt ? (
        <div style={toastStyle(receipt.tone)} role="status">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CanvasIcon
              name="check"
              size={14}
              style={{ color: toneColor(receipt.tone) }}
            />
            <span style={{ color: th.text, fontSize: 12.5 }}>
              {receipt.message}
            </span>
          </div>
          <Link
            href={`/audit?auditId=${encodeURIComponent(receipt.auditId)}`}
            style={{ textDecoration: "none" }}
          >
            <CanvasPill theme={th} tone="info" dot>
              {copy.viewAudit} · {receipt.auditId}
            </CanvasPill>
          </Link>
        </div>
      ) : null}
    </CanvasShell>
  );
}

type EmptyAction =
  | { kind: "reload"; label: string }
  | { kind: "invite"; label: string }
  | { kind: "clear"; label: string }
  | { kind: "link"; label: string; href: string };

type EmptyView = {
  tone: CanvasTone;
  icon: UsersIconName;
  title: string;
  description: string;
  action: EmptyAction | null;
};

function buildEmptyStateViewModel(
  reason: EmptyReason,
  locale: string,
  rawError: string | null,
): EmptyView {
  const en = locale === "en";
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "info",
        icon: "integrationGov",
        title: en ? "Identity directory not provisioned" : "身分目錄尚未開通",
        description: en
          ? "This environment has no platform-user directory yet. Provisioning happens during platform bootstrap."
          : "此環境尚未建立平台人員目錄，需在平台 bootstrap 階段完成開通。",
        action: {
          kind: "link",
          href: "/health",
          label: en ? "Check platform health" : "查看平台健康",
        },
      };
    case "fetch_failed":
      return {
        tone: "danger",
        icon: "warn",
        title: en ? "User snapshot failed" : "人員快照讀取失敗",
        description:
          rawError ??
          (en
            ? "The platform-users endpoint did not return a usable payload."
            : "平台人員端點未回傳可用內容。"),
        action: { kind: "reload", label: en ? "Retry" : "重新整理" },
      };
    case "permission_denied":
      return {
        tone: "warn",
        icon: "users",
        title: en ? "User scope denied" : "無法存取人員範圍",
        description: en
          ? "Only pa_super_admin can read the platform-user directory. Your session can enter the shell but lacks this scope."
          : "僅 pa_super_admin 可讀取平台人員目錄；目前帳號可進入殼層，但沒有此範圍權限。",
        action: {
          kind: "link",
          href: "/",
          label: en ? "Back to home" : "返回首頁",
        },
      };
    case "external_unavailable":
      return {
        tone: "warn",
        icon: "health",
        title: en ? "Directory dependency degraded" : "目錄相依服務降級",
        description: en
          ? "The identity service is degraded. The list may be incomplete until the dependency recovers."
          : "身分服務降級，相依服務恢復前清單可能不完整。",
        action: { kind: "reload", label: en ? "Retry" : "重新整理" },
      };
    case "filtered_empty":
      return {
        tone: "accent",
        icon: "filter",
        title: en ? "No users match this filter" : "目前條件沒有符合的人員",
        description: en
          ? "Switch back to All to restore the full roster."
          : "切換回「全部」即可恢復完整名單。",
        action: { kind: "clear", label: en ? "Clear filter" : "清除條件" },
      };
    case "no_data":
    default:
      return {
        tone: "neutral",
        icon: "users",
        title: en ? "No platform users yet" : "尚未建立平台人員",
        description: en
          ? "The directory is healthy but no internal users exist in this environment yet."
          : "目錄健康，但此環境尚未建立任何內部使用者。",
        action: {
          kind: "invite",
          label: en ? "Invite staff user" : "邀請平台人員",
        },
      };
  }
}

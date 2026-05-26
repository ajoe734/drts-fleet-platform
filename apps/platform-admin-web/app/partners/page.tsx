"use client";

import Link from "next/link";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  EMPTY_ENTRY_FORM,
  EntryForm,
  buildPartnerReadinessItems,
  toPartnerCreateCommand,
  type EntryFormState,
} from "@/components/partner-governance-shared";
import type {
  ActionableResourceRuntimeFields,
  EmptyReason,
  EmptyStateEnvelope,
  PartnerChannelEntryRecord,
  RefreshTier,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
} from "@drts/ui-web";

type PartnerFilter = "all" | "active" | "inactive" | "revoked" | "attention";
type PartnerRow = PartnerChannelEntryRecord & ActionableResourceRuntimeFields;
type PartnerTableRow = PartnerRow & Record<string, unknown>;
type PartnerMutationKind = "create" | "activate" | "deactivate" | "revoke";

interface PendingPartnerAction {
  kind: PartnerMutationKind;
  descriptor: ResourceActionDescriptor;
  entrySlug?: string;
  displayName?: string;
  command?: ReturnType<typeof toPartnerCreateCommand>;
}

interface PartnerActionReceiptState {
  tone: "success" | "warn";
  title: string;
  body: string;
  href?: string;
  hrefLabel?: string;
}

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageStackStyle = {
  display: "grid",
  gap: 24,
  padding: 24,
} satisfies CSSProperties;

const headerActionsStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const railStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
} satisfies CSSProperties;

const summaryCardStyle = {
  border: `1px solid ${theme.neutralBorder}`,
  borderRadius: 18,
  background: theme.bgRaised,
  padding: 14,
  display: "grid",
  gap: 8,
} satisfies CSSProperties;

const filtersGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "1.6fr repeat(3, minmax(140px, 1fr))",
} satisfies CSSProperties;

const inputStyle = (mono = false): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: mono ? theme.monoFamily : theme.fontFamily,
  fontSize: 12.5,
  padding: "10px 11px",
});

const toolbarClusterStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies CSSProperties;

const entryCellStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
} satisfies CSSProperties;

const entryAvatarStyle = (accent: string): CSSProperties => ({
  width: 30,
  height: 30,
  borderRadius: 8,
  background: accent,
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
});

const monoTextStyle = {
  color: theme.textDim,
  fontSize: 11.5,
  fontFamily: theme.monoFamily,
} satisfies CSSProperties;

const primaryLinkStyle = {
  color: theme.text,
  textDecoration: "none",
  fontWeight: 600,
} satisfies CSSProperties;

const secondaryLinkStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
  textDecoration: "none",
} satisfies CSSProperties;

const chipButtonStyle = (disabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 999,
  border: `1px solid ${disabled ? theme.neutralBorder : theme.border}`,
  background: disabled ? theme.surfaceLo : theme.bgRaised,
  color: disabled ? theme.textDim : theme.text,
  fontSize: 11.5,
  fontWeight: 600,
  textDecoration: "none",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.72 : 1,
});

const attentionBoardStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
} satisfies CSSProperties;

const modalScrimStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.62)",
  display: "grid",
  placeItems: "center",
  padding: 24,
  zIndex: 40,
} satisfies CSSProperties;

const modalCardStyle = {
  width: "min(680px, 100%)",
  borderRadius: 24,
  border: `1px solid ${theme.border}`,
  background: theme.bg,
  boxShadow: "0 28px 90px rgba(15, 23, 42, 0.34)",
  padding: 22,
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const textareaStyle = {
  ...inputStyle(),
  minHeight: 108,
  resize: "vertical",
} satisfies CSSProperties;

function emptyStateStyle(reason: EmptyReason): CSSProperties {
  const palette =
    reason === "fetch_failed"
      ? {
          border: `1px solid ${theme.dangerBorder}`,
          background: theme.dangerBg,
        }
      : reason === "not_provisioned" || reason === "external_unavailable"
        ? {
            border: `1px solid ${theme.warnBorder}`,
            background: theme.warnBg,
          }
        : reason === "permission_denied"
          ? {
              border: `1px solid ${theme.neutralBorder}`,
              background: theme.bgRaised,
            }
          : {
              border: `1px dashed ${theme.border}`,
              background: theme.surfaceLo,
            };

  return {
    ...palette,
    borderRadius: 18,
    padding: 20,
    display: "grid",
    gap: 10,
    justifyItems: "start",
  };
}

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
    {
      key: "tenants",
      href: "/tenants",
      icon: "tenants",
      label: labels.tenants,
    },
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
    {
      key: "pricing",
      href: "/pricing",
      icon: "pricing",
      label: labels.pricing,
    },
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

function actionMatches(
  descriptor: ResourceActionDescriptor,
  needles: string[],
) {
  const action = descriptor.action.toLowerCase();
  return needles.some((needle) => action.includes(needle));
}

function findAction(
  actions: readonly ResourceActionDescriptor[] | undefined,
  needles: string[],
) {
  return actions?.find((descriptor) => actionMatches(descriptor, needles));
}

function statusTone(
  status: PartnerChannelEntryRecord["status"],
): "success" | "warn" | "danger" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "inactive":
      return "warn";
    case "revoked":
      return "danger";
    default:
      return "neutral";
  }
}

function emptyTone(reason: EmptyReason): "danger" | "warn" | "neutral" {
  switch (reason) {
    case "fetch_failed":
      return "danger";
    case "not_provisioned":
    case "external_unavailable":
      return "warn";
    default:
      return "neutral";
  }
}

function partnerNeedsAttention(entry: PartnerChannelEntryRecord) {
  return (
    entry.status !== "active" ||
    buildPartnerReadinessItems(entry, (key: string) => key).some(
      (item) => !item.ready,
    )
  );
}

function readinessSummary(
  entry: PartnerChannelEntryRecord,
  t: (key: string) => string,
) {
  const items = buildPartnerReadinessItems(entry, t);
  const gaps = items.filter((item) => !item.ready);
  return {
    gaps,
    tone: gaps.length === 0 ? ("success" as const) : ("warn" as const),
    label: gaps.length === 0 ? "ready" : `${gaps.length} gaps`,
  };
}

function refreshIntervalMs(refreshTier: RefreshTier | null) {
  switch (refreshTier) {
    case "medium_slow":
    case "slow":
      return 30_000;
    case "manual":
      return null;
    default:
      return null;
  }
}

function formatRefreshTierLabel(refreshTier: RefreshTier) {
  switch (refreshTier) {
    case "medium_slow":
      return "T4 / medium_slow";
    case "manual":
      return "T6 / manual";
    default:
      return refreshTier;
  }
}

function detectMutationKind(
  descriptor: ResourceActionDescriptor,
): PartnerMutationKind | null {
  const action = descriptor.action.toLowerCase();
  if (action.includes("deactivate")) {
    return "deactivate";
  }
  if (action.includes("activate")) {
    return "activate";
  }
  if (action.includes("revoke")) {
    return "revoke";
  }
  if (action.includes("create") || action.includes("new")) {
    return "create";
  }
  return null;
}

function humanizeActionLabel(action: string) {
  return action
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

export default function PartnersPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [entries, setEntries] = useState<PartnerRow[]>([]);
  const [listActions, setListActions] = useState<ResourceActionDescriptor[]>(
    [],
  );
  const [emptyState, setEmptyState] = useState<EmptyStateEnvelope | null>(null);
  const [refreshTier, setRefreshTier] = useState<RefreshTier>("medium_slow");
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingRowAction, setPendingRowAction] = useState<string | null>(null);
  const [pendingAction, setPendingAction] =
    useState<PendingPartnerAction | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionReceipt, setActionReceipt] =
    useState<PartnerActionReceiptState | null>(null);
  const [filter, setFilter] = useState<PartnerFilter>("all");
  const [search, setSearch] = useState("");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [createForm, setCreateForm] =
    useState<EntryFormState>(EMPTY_ENTRY_FORM);
  const deferredSearch = useDeferredValue(search);

  const copy =
    locale === "en"
      ? {
          title: "Partner entry",
          subtitle:
            "Bank, hotel, and enterprise partner entry points with auth mode, eligibility, routing, and readiness.",
          breadcrumbRoot: "Partner Governance",
          refreshTierLabel: "Refresh tier",
          refreshedAtLabel: "Last refreshed",
          searchLabel: "Search",
          tenantLabel: "Tenant",
          typeLabel: "Type",
          statusLabel: "Status",
          searchPlaceholder: "Search entry slug, tenant, program, bank code…",
          refresh: "Refresh",
          create: "Create entry",
          createTitle: "Create partner entry",
          createSubtitle:
            "Provision routing, auth mode, eligibility mode, and brand metadata before activation.",
          attentionTitle: "Attention board",
          attentionEmpty: "Visible rows are active and readiness-complete.",
          rosterTitle: "Entry roster",
          rosterSubtitle:
            "Partner roster for tenant mapping, dispatch subtype, auth posture, and cross-app inspection.",
          rosterSummary:
            "List CTAs are driven by availableActions. Rows without actions stay explicitly read-only.",
          openDetail: "Open detail",
          clearFilters: "Clear filters",
          readOnly: "Read-only",
          noActionReason: "No state-changing actions returned for this row",
          confirmTitle: "Confirm partner action",
          confirmReasonLabel: "Audit reason",
          confirmReasonPlaceholder:
            "Explain the governance reason for this state change.",
          confirmImpact: "Impact",
          confirmActionsLabel: "Action contract",
          confirmCancel: "Cancel",
          confirmProceed: "Confirm and continue",
          viewAudit: "View audit",
          auditPending:
            "Audit trail recorded on the backend. Open audit for the full event.",
          receiptTitle: "Partner action recorded",
          receiptFallback:
            "The partner entry changed and the roster has been refreshed.",
          riskCopy: {
            low: "Direct action with immediate receipt.",
            medium: "Confirmation required before the write is sent.",
            high: "High-risk action. Confirmation is required and a non-empty reason must be captured.",
          },
          metrics: {
            active: "Active entries",
            attention: "Needs attention",
            revoked: "Revoked entries",
          },
          filterLabels: {
            all: "All",
            active: "Active",
            inactive: "Inactive",
            attention: "Attention",
            revoked: "Revoked",
          },
          emptyStates: {
            no_data: {
              title: "No partner entries yet",
              body: "Create the first entry when partner governance is ready to onboard a tenant-program route.",
            },
            not_provisioned: {
              title: "Partner governance is not provisioned",
              body: "The backend says this surface exists, but partner governance has not been provisioned for this environment yet.",
            },
            fetch_failed: {
              title: "Unable to load partner entries",
              body: "The page could not refresh the partner roster. Retry or inspect the upstream dependency.",
            },
            permission_denied: {
              title: "You can’t view this roster",
              body: "The response explicitly denied access. CTA visibility must remain driven by backend permissions.",
            },
            external_unavailable: {
              title: "Partner registry is temporarily unavailable",
              body: "An external dependency is down or degraded. Cross-app inspection may still be available from existing links.",
            },
            filtered_empty: {
              title: "No rows match the current filters",
              body: "Clear search and filters to recover the wider roster.",
            },
            driver_not_eligible: {
              title: "Unexpected empty reason for platform admin",
              body: "This driver-specific state should not appear on the platform-admin partners route.",
            },
          } satisfies Record<EmptyReason, { title: string; body: string }>,
        }
      : {
          title: "合作夥伴 entry",
          subtitle:
            "集中管理銀行、旅宿與企業 partner 的 auth mode、eligibility、routing 與 readiness。",
          breadcrumbRoot: "合作夥伴治理",
          refreshTierLabel: "刷新層級",
          refreshedAtLabel: "最近刷新",
          searchLabel: "搜尋",
          tenantLabel: "租戶",
          typeLabel: "類型",
          statusLabel: "狀態",
          searchPlaceholder: "搜尋 entry slug、tenant、program、bank code…",
          refresh: "重新整理",
          create: "建立 entry",
          createTitle: "建立 partner entry",
          createSubtitle:
            "在 activation 前先補齊 routing、auth mode、eligibility mode 與品牌 metadata。",
          attentionTitle: "Attention board",
          attentionEmpty: "目前可見 rows 皆為 active 且 readiness 完整。",
          rosterTitle: "Entry roster",
          rosterSubtitle:
            "tenant 對應、dispatch subtype、auth posture 與跨 app 檢視都集中在這裡。",
          rosterSummary:
            "清單級 CTA 由 availableActions 決定；row 若沒有 action，畫面會明確呈現唯讀。",
          openDetail: "查看詳情",
          clearFilters: "清除篩選",
          readOnly: "唯讀",
          noActionReason: "此 row 沒有任何可變更狀態的後端動作",
          confirmTitle: "確認 partner 動作",
          confirmReasonLabel: "稽核原因",
          confirmReasonPlaceholder: "說明這次治理變更的原因。",
          confirmImpact: "影響",
          confirmActionsLabel: "動作契約",
          confirmCancel: "取消",
          confirmProceed: "確認並執行",
          viewAudit: "查看 audit",
          auditPending: "後端已記錄稽核事件；可前往 audit 查看完整紀錄。",
          receiptTitle: "Partner 動作已記錄",
          receiptFallback: "partner entry 已變更，且 roster 已重新整理。",
          riskCopy: {
            low: "直接執行，完成後立即提供 receipt。",
            medium: "送出前必須先確認。",
            high: "高風險動作，必須確認且需填寫非空原因。",
          },
          metrics: {
            active: "啟用 entry",
            attention: "待補 readiness",
            revoked: "已撤銷 entry",
          },
          filterLabels: {
            all: "全部",
            active: "啟用",
            inactive: "停用",
            attention: "待處理",
            revoked: "撤銷",
          },
          emptyStates: {
            no_data: {
              title: "目前沒有 partner entries",
              body: "當治理流程準備好 onboarding tenant-program route 後，可從這裡建立第一筆 entry。",
            },
            not_provisioned: {
              title: "Partner governance 尚未佈建",
              body: "後端表示此畫面存在，但此環境的 partner governance 還沒完成佈建。",
            },
            fetch_failed: {
              title: "無法載入 partner entries",
              body: "頁面刷新 roster 失敗，請重試或檢查上游依賴狀態。",
            },
            permission_denied: {
              title: "你沒有檢視此 roster 的權限",
              body: "回應明確拒絕存取；CTA 能見度仍必須完全以後端權限回傳為準。",
            },
            external_unavailable: {
              title: "Partner registry 暫時不可用",
              body: "外部依賴目前降級或中斷，但既有 cross-app 連結仍可能可供調查。",
            },
            filtered_empty: {
              title: "目前篩選條件沒有任何結果",
              body: "清除搜尋與篩選即可回到完整 roster。",
            },
            driver_not_eligible: {
              title: "這是 platform admin 不應出現的 empty reason",
              body: "此狀態屬於 driver-app 專用；若出現代表 contract 或後端有偏差。",
            },
          } satisfies Record<EmptyReason, { title: string; body: string }>,
        };

  const navItems = useMemo(() => buildPlatformNav(locale), [locale]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listPlatformPartnerEntries();
      setEntries(result.items ?? []);
      setListActions(result.availableActions ?? []);
      setEmptyState(result.emptyState ?? null);
      setRefreshTier(result.refreshTier ?? "medium_slow");
      setRefreshedAt(result.refreshedAt ?? new Date().toISOString());
    } catch (cause: unknown) {
      setEntries([]);
      setListActions([]);
      setEmptyState({
        reason: "fetch_failed",
        messageCode: "partners.list.fetch_failed",
      });
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    const intervalMs = refreshIntervalMs(refreshTier);
    if (intervalMs === null) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      void loadEntries();
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [loadEntries, refreshTier]);

  const counts = useMemo(
    () => ({
      all: entries.length,
      active: entries.filter((entry) => entry.status === "active").length,
      inactive: entries.filter((entry) => entry.status === "inactive").length,
      revoked: entries.filter((entry) => entry.status === "revoked").length,
      attention: entries.filter(partnerNeedsAttention).length,
    }),
    [entries],
  );

  const tenantOptions = useMemo(
    () => ["all", ...new Set(entries.map((entry) => entry.tenantId))],
    [entries],
  );

  const typeOptions = useMemo(
    () => [
      "all",
      ...new Set(entries.map((entry) => entry.partnerType || "unknown")),
    ],
    [entries],
  );

  const visibleEntries = useMemo(() => {
    const searchText = deferredSearch.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter === "attention" && !partnerNeedsAttention(entry)) {
        return false;
      }
      if (
        filter !== "all" &&
        filter !== "attention" &&
        entry.status !== filter
      ) {
        return false;
      }
      if (tenantFilter !== "all" && entry.tenantId !== tenantFilter) {
        return false;
      }
      if (
        typeFilter !== "all" &&
        (entry.partnerType || "unknown") !== typeFilter
      ) {
        return false;
      }
      if (!searchText) {
        return true;
      }
      return [
        entry.entrySlug,
        entry.displayName,
        entry.tenantId,
        entry.partnerCode,
        entry.partnerType,
        entry.programId,
        entry.programCode,
        entry.bankCode,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(searchText));
    });
  }, [deferredSearch, entries, filter, tenantFilter, typeFilter]);

  const effectiveEmptyState = useMemo(() => {
    if (loading) {
      return null;
    }
    if (visibleEntries.length > 0) {
      return null;
    }
    if (entries.length > 0) {
      return {
        reason: "filtered_empty" as const,
        messageCode: "partners.list.filtered_empty",
      };
    }
    return (
      emptyState ?? {
        reason: "no_data" as const,
        messageCode: "partners.list.no_data",
      }
    );
  }, [emptyState, entries.length, loading, visibleEntries.length]);

  const attentionEntries = useMemo(
    () => visibleEntries.filter(partnerNeedsAttention).slice(0, 4),
    [visibleEntries],
  );

  const refreshAction = findAction(listActions, ["refresh", "reload"]);
  const createAction = findAction(listActions, ["create", "new"]);

  const createDisabled =
    creating ||
    createAction?.enabled === false ||
    !createForm.partnerCode.trim() ||
    !createForm.programId.trim() ||
    !createForm.entrySlug.trim() ||
    !createForm.displayName.trim();

  const executeAction = useCallback(
    async (action: PendingPartnerAction, reason: string) => {
      const pendingKey = action.entrySlug
        ? `${action.entrySlug}:${action.descriptor.action}`
        : null;
      if (pendingKey) {
        setPendingRowAction(pendingKey);
      }
      setCreating(action.kind === "create");
      setError(null);
      setActionReceipt(null);

      try {
        let result: PartnerChannelEntryRecord | null = null;

        if (action.kind === "create" && action.command) {
          result = await client.createPlatformPartnerEntry(action.command);
          setCreateForm(EMPTY_ENTRY_FORM);
          setShowCreate(false);
        } else if (action.kind === "activate" && action.entrySlug) {
          result = await client.activatePlatformPartnerEntry(action.entrySlug);
        } else if (action.kind === "deactivate" && action.entrySlug) {
          result = await client.deactivatePlatformPartnerEntry(
            action.entrySlug,
          );
        } else if (action.kind === "revoke" && action.entrySlug) {
          result = await client.revokePlatformPartnerEntry(action.entrySlug);
        }

        await loadEntries();

        const requestId = result?.auditMetadata.requestId?.trim() || null;
        const subject =
          action.displayName || result?.displayName || action.entrySlug;
        const reasonSuffix = reason.trim()
          ? locale === "en"
            ? ` Reason: ${reason.trim()}`
            : ` 原因：${reason.trim()}`
          : "";

        setActionReceipt({
          tone: action.descriptor.riskLevel === "high" ? "warn" : "success",
          title: copy.receiptTitle,
          body:
            requestId !== null
              ? `${humanizeActionLabel(action.descriptor.action)} • ${subject ?? "partner entry"} • request ${requestId}.${reasonSuffix}`
              : `${humanizeActionLabel(action.descriptor.action)} • ${subject ?? "partner entry"}. ${copy.receiptFallback}${reasonSuffix}`,
          href: "/audit",
          hrefLabel: copy.viewAudit,
        });
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setPendingRowAction(null);
        setCreating(false);
        setPendingAction(null);
        setActionReason("");
      }
    },
    [
      client,
      copy.receiptFallback,
      copy.receiptTitle,
      copy.viewAudit,
      loadEntries,
      locale,
    ],
  );

  const stageRowAction = useCallback(
    (entry: PartnerRow, descriptor: ResourceActionDescriptor) => {
      if (!descriptor.enabled) {
        return;
      }

      const kind = detectMutationKind(descriptor);
      if (!kind) {
        return;
      }

      setPendingAction({
        kind,
        descriptor,
        entrySlug: entry.entrySlug,
        displayName: entry.displayName,
      });
      setActionReason("");
    },
    [],
  );

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createDisabled || !createAction) {
      return;
    }

    setPendingAction({
      kind: "create",
      descriptor: createAction,
      displayName: createForm.displayName.trim(),
      command: toPartnerCreateCommand(createForm),
    });
    setActionReason("");
  };

  const clearFilters = () => {
    setFilter("all");
    setSearch("");
    setTenantFilter("all");
    setTypeFilter("all");
  };

  return (
    <CanvasShell
      theme={theme}
      nav={navItems}
      active="partners"
      currentPath="/partners"
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
          <div style={headerActionsStyle}>
            {refreshAction ? (
              <CanvasBtn
                theme={theme}
                variant="secondary"
                icon="refresh"
                disabled={!refreshAction.enabled}
                onClick={() => void loadEntries()}
              >
                {copy.refresh}
              </CanvasBtn>
            ) : null}
            {createAction ? (
              <CanvasBtn
                theme={theme}
                variant={showCreate ? "secondary" : "primary"}
                icon={showCreate ? "x" : "plus"}
                disabled={!createAction.enabled}
                onClick={() => setShowCreate((current) => !current)}
              >
                {copy.create}
              </CanvasBtn>
            ) : null}
          </div>
        }
      />

      <div style={pageStackStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={copy.emptyStates.fetch_failed.title}
            body={error}
          />
        ) : null}

        {actionReceipt ? (
          <CanvasBanner
            theme={theme}
            tone={actionReceipt.tone}
            title={actionReceipt.title}
            body={actionReceipt.body}
            actions={
              actionReceipt.href ? (
                <Link href={actionReceipt.href} style={secondaryLinkStyle}>
                  {actionReceipt.hrefLabel}
                </Link>
              ) : undefined
            }
          />
        ) : null}

        <div style={railStyle}>
          <CanvasKPI
            theme={theme}
            label={copy.metrics.active}
            value={counts.active}
            sub={`${counts.all} total`}
          />
          <CanvasKPI
            theme={theme}
            label={copy.metrics.attention}
            value={counts.attention}
            delta={counts.attention > 0 ? `${counts.attention}` : undefined}
            deltaTone={counts.attention > 0 ? "down" : "neutral"}
            sub={
              locale === "en"
                ? "Inactive or missing readiness coverage"
                : "inactive 或 readiness 缺口"
            }
          />
          <CanvasKPI
            theme={theme}
            label={copy.metrics.revoked}
            value={counts.revoked}
            sub={
              locale === "en"
                ? "Retained for audit lineage"
                : "保留供 audit lineage 追溯"
            }
          />
          <div style={summaryCardStyle}>
            <div style={toolbarClusterStyle}>
              <CanvasPill theme={theme} tone="neutral">
                {copy.refreshTierLabel}: {formatRefreshTierLabel(refreshTier)}
              </CanvasPill>
              <CanvasPill theme={theme} tone="neutral">
                {copy.refreshedAtLabel}:{" "}
                {refreshedAt ? formatDateTime(refreshedAt) : "—"}
              </CanvasPill>
            </div>
            <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
              {locale === "en"
                ? "T4 pages poll every 30s; T6 stays manual."
                : "T4 頁面每 30 秒輪詢；T6 維持手動刷新。"}
            </span>
          </div>
        </div>

        <CanvasCard
          theme={theme}
          title={copy.attentionTitle}
          subtitle={
            locale === "en"
              ? "Risk-first strip for inactive and incomplete rows."
              : "優先呈現 inactive 與 readiness 不完整的 rows。"
          }
        >
          {attentionEntries.length > 0 ? (
            <div style={attentionBoardStyle}>
              {attentionEntries.map((entry) => {
                const readiness = readinessSummary(entry, t);
                return (
                  <div key={entry.entrySlug} style={summaryCardStyle}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div style={entryCellStyle}>
                        <span
                          style={entryAvatarStyle(
                            entry.themeAccent?.trim() || theme.accent,
                          )}
                        >
                          {entry.partnerCode.slice(0, 2).toUpperCase() || "PE"}
                        </span>
                        <div style={{ display: "grid", gap: 2 }}>
                          <Link
                            href={`/partners/${entry.entrySlug}`}
                            style={primaryLinkStyle}
                          >
                            {entry.displayName}
                          </Link>
                          <span style={monoTextStyle}>/{entry.entrySlug}</span>
                        </div>
                      </div>
                      <CanvasPill
                        theme={theme}
                        tone={statusTone(entry.status)}
                        dot
                      >
                        {entry.status}
                      </CanvasPill>
                    </div>
                    <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
                      {entry.tenantId} · {entry.programId}
                    </span>
                    <div style={toolbarClusterStyle}>
                      <CanvasPill
                        theme={theme}
                        tone={readiness.tone}
                        dot={readiness.gaps.length > 0}
                      >
                        {readiness.label}
                      </CanvasPill>
                      <CanvasPill theme={theme} tone="neutral">
                        {formatPlatformCodeLabel(locale, entry.authMode)}
                      </CanvasPill>
                    </div>
                    {readiness.gaps.length > 0 ? (
                      <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                        {readiness.gaps
                          .slice(0, 2)
                          .map((gap) => gap.label)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={summaryCardStyle}>{copy.attentionEmpty}</div>
          )}
        </CanvasCard>

        {showCreate ? (
          <CanvasCard
            theme={theme}
            title={copy.createTitle}
            subtitle={copy.createSubtitle}
          >
            <form onSubmit={handleCreate} style={{ display: "grid", gap: 14 }}>
              <EntryForm form={createForm} setForm={setCreateForm} t={t} />
              <div style={toolbarClusterStyle}>
                <button
                  type="submit"
                  disabled={createDisabled}
                  title={createAction?.disabledReasonCode}
                  style={chipButtonStyle(createDisabled)}
                >
                  {creating ? t("common.creating") : copy.create}
                </button>
              </div>
            </form>
          </CanvasCard>
        ) : null}

        <CanvasCard
          theme={theme}
          title={copy.rosterTitle}
          subtitle={copy.rosterSubtitle}
          actions={
            effectiveEmptyState?.reason === "filtered_empty" ? (
              <CanvasBtn
                theme={theme}
                variant="secondary"
                onClick={clearFilters}
              >
                {copy.clearFilters}
              </CanvasBtn>
            ) : undefined
          }
        >
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
              {copy.rosterSummary}
            </div>

            <div style={filtersGridStyle}>
              <label>
                <div
                  style={{
                    marginBottom: 6,
                    fontSize: 11,
                    color: theme.textMuted,
                  }}
                >
                  {copy.searchLabel}
                </div>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                  style={inputStyle()}
                />
              </label>
              <label>
                <div
                  style={{
                    marginBottom: 6,
                    fontSize: 11,
                    color: theme.textMuted,
                  }}
                >
                  {copy.tenantLabel}
                </div>
                <select
                  value={tenantFilter}
                  onChange={(event) => setTenantFilter(event.target.value)}
                  style={inputStyle(true)}
                >
                  {tenantOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <div
                  style={{
                    marginBottom: 6,
                    fontSize: 11,
                    color: theme.textMuted,
                  }}
                >
                  {copy.typeLabel}
                </div>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  style={inputStyle(true)}
                >
                  {typeOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <div
                  style={{
                    marginBottom: 6,
                    fontSize: 11,
                    color: theme.textMuted,
                  }}
                >
                  {copy.statusLabel}
                </div>
                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value as PartnerFilter)
                  }
                  style={inputStyle(true)}
                >
                  <option value="all">{copy.filterLabels.all}</option>
                  <option value="active">{copy.filterLabels.active}</option>
                  <option value="inactive">{copy.filterLabels.inactive}</option>
                  <option value="attention">
                    {copy.filterLabels.attention}
                  </option>
                  <option value="revoked">{copy.filterLabels.revoked}</option>
                </select>
              </label>
            </div>

            <div style={toolbarClusterStyle}>
              {(
                [
                  ["all", copy.filterLabels.all, counts.all, "neutral"],
                  [
                    "active",
                    copy.filterLabels.active,
                    counts.active,
                    "success",
                  ],
                  [
                    "inactive",
                    copy.filterLabels.inactive,
                    counts.inactive,
                    "warn",
                  ],
                  [
                    "attention",
                    copy.filterLabels.attention,
                    counts.attention,
                    "warn",
                  ],
                  [
                    "revoked",
                    copy.filterLabels.revoked,
                    counts.revoked,
                    "danger",
                  ],
                ] as const
              ).map(([value, label, count, tone]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  style={{ background: "transparent", border: 0, padding: 0 }}
                >
                  <CanvasPill
                    theme={theme}
                    tone={filter === value ? "accent" : tone}
                    dot={value !== "all"}
                  >
                    {label} {count}
                  </CanvasPill>
                </button>
              ))}
            </div>

            {loading ? (
              <div style={summaryCardStyle}>{t("partners.loading")}</div>
            ) : effectiveEmptyState ? (
              <div style={emptyStateStyle(effectiveEmptyState.reason)}>
                <CanvasPill
                  theme={theme}
                  tone={emptyTone(effectiveEmptyState.reason)}
                >
                  {effectiveEmptyState.reason}
                </CanvasPill>
                <strong>
                  {
                    copy.emptyStates[effectiveEmptyState.reason as EmptyReason]
                      .title
                  }
                </strong>
                <span style={{ color: theme.textMuted, maxWidth: 720 }}>
                  {
                    copy.emptyStates[effectiveEmptyState.reason as EmptyReason]
                      .body
                  }
                </span>
                <span style={{ color: theme.textDim, fontSize: 12 }}>
                  {error || effectiveEmptyState.messageCode}
                </span>
                <div style={toolbarClusterStyle}>
                  {effectiveEmptyState.reason === "filtered_empty" ? (
                    <CanvasBtn
                      theme={theme}
                      variant="secondary"
                      onClick={clearFilters}
                    >
                      {copy.clearFilters}
                    </CanvasBtn>
                  ) : null}
                  {refreshAction?.enabled ? (
                    <CanvasBtn
                      theme={theme}
                      variant="secondary"
                      onClick={() => void loadEntries()}
                    >
                      {copy.refresh}
                    </CanvasBtn>
                  ) : null}
                  {effectiveEmptyState.nextAction ? (
                    <button
                      type="button"
                      disabled={!effectiveEmptyState.nextAction.enabled}
                      title={effectiveEmptyState.nextAction.disabledReasonCode}
                      style={chipButtonStyle(
                        !effectiveEmptyState.nextAction.enabled,
                      )}
                      onClick={() => {
                        if (
                          effectiveEmptyState.nextAction?.enabled &&
                          actionMatches(effectiveEmptyState.nextAction, [
                            "create",
                            "new",
                          ])
                        ) {
                          setShowCreate(true);
                        }
                      }}
                    >
                      {effectiveEmptyState.nextAction.action}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <CanvasTable<PartnerTableRow>
                theme={theme}
                rows={visibleEntries as PartnerTableRow[]}
                columns={[
                  {
                    h: "ENTRY",
                    w: 230,
                    r: (entry) => (
                      <div style={entryCellStyle}>
                        <span
                          style={entryAvatarStyle(
                            entry.themeAccent?.trim() || theme.accent,
                          )}
                        >
                          {entry.partnerCode.slice(0, 2).toUpperCase() || "PE"}
                        </span>
                        <div style={{ display: "grid", gap: 2 }}>
                          <Link
                            href={`/partners/${entry.entrySlug}`}
                            style={primaryLinkStyle}
                          >
                            {entry.displayName}
                          </Link>
                          <span style={monoTextStyle}>/{entry.entrySlug}</span>
                          <span
                            style={{ color: theme.textMuted, fontSize: 12 }}
                          >
                            {entry.tenantId} · {entry.partnerCode} ·{" "}
                            {entry.partnerType}
                          </span>
                        </div>
                      </div>
                    ),
                  },
                  {
                    h: "PROGRAM",
                    w: 170,
                    r: (entry) => (
                      <div style={{ display: "grid", gap: 2 }}>
                        <span style={{ fontWeight: 600 }}>
                          {entry.programId}
                        </span>
                        <span style={monoTextStyle}>
                          {entry.programCode || "—"}
                        </span>
                        <span style={{ color: theme.textMuted, fontSize: 12 }}>
                          {entry.bankCode || "—"}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: "SUBTYPE",
                    w: 170,
                    r: (entry) => (
                      <span style={monoTextStyle}>
                        {formatPlatformCodeLabel(
                          locale,
                          entry.businessDispatchSubtype,
                        )}
                      </span>
                    ),
                  },
                  {
                    h: "AUTH",
                    w: 120,
                    r: (entry) => (
                      <span style={monoTextStyle}>
                        {formatPlatformCodeLabel(locale, entry.authMode)}
                      </span>
                    ),
                  },
                  {
                    h: "ELIGIBILITY",
                    w: 140,
                    r: (entry) => (
                      <span style={monoTextStyle}>
                        {formatPlatformCodeLabel(locale, entry.eligibilityMode)}
                      </span>
                    ),
                  },
                  {
                    h: "STATUS",
                    w: 110,
                    r: (entry) => (
                      <CanvasPill
                        theme={theme}
                        tone={statusTone(entry.status)}
                        dot
                      >
                        {entry.status}
                      </CanvasPill>
                    ),
                  },
                  {
                    h: "READINESS",
                    w: 200,
                    r: (entry) => {
                      const readiness = readinessSummary(entry, t);
                      return (
                        <div style={{ display: "grid", gap: 6 }}>
                          <CanvasPill
                            theme={theme}
                            tone={readiness.tone}
                            dot={readiness.gaps.length > 0}
                          >
                            {readiness.label}
                          </CanvasPill>
                          <span
                            style={{ color: theme.textMuted, fontSize: 11.5 }}
                          >
                            {entry.entryHost || "—"}
                            {entry.entryPath || ""}
                          </span>
                        </div>
                      );
                    },
                  },
                  {
                    h: "ACTIONS / LINKS",
                    w: 260,
                    r: (entry) => {
                      const rowActions = entry.availableActions ?? [];
                      const links = entry.resourceLinks ?? [];
                      return (
                        <div style={{ display: "grid", gap: 8 }}>
                          <div style={toolbarClusterStyle}>
                            {rowActions.length > 0 ? (
                              rowActions.map(
                                (action: ResourceActionDescriptor) => (
                                  <button
                                    key={action.action}
                                    type="button"
                                    disabled={
                                      !action.enabled ||
                                      pendingRowAction ===
                                        `${entry.entrySlug}:${action.action}`
                                    }
                                    title={
                                      action.disabledReasonCode ||
                                      `${action.riskLevel}${action.requiresReason ? " · reason" : ""}`
                                    }
                                    style={chipButtonStyle(
                                      !action.enabled ||
                                        pendingRowAction ===
                                          `${entry.entrySlug}:${action.action}`,
                                    )}
                                    onClick={() =>
                                      stageRowAction(entry, action)
                                    }
                                  >
                                    {pendingRowAction ===
                                    `${entry.entrySlug}:${action.action}`
                                      ? t("common.saving")
                                      : action.action}
                                  </button>
                                ),
                              )
                            ) : (
                              <span
                                style={chipButtonStyle(true)}
                                title={copy.noActionReason}
                              >
                                {copy.readOnly}
                              </span>
                            )}
                          </div>
                          <div style={toolbarClusterStyle}>
                            <Link
                              href={`/partners/${entry.entrySlug}`}
                              style={secondaryLinkStyle}
                            >
                              {copy.openDetail}
                            </Link>
                            {links.map((link) => (
                              <a
                                key={`${link.targetApp}:${link.resourceType}:${link.resourceId}`}
                                href={link.route}
                                target={
                                  link.openMode === "new_tab"
                                    ? "_blank"
                                    : undefined
                                }
                                rel={
                                  link.openMode === "new_tab"
                                    ? "noreferrer noopener"
                                    : undefined
                                }
                                style={secondaryLinkStyle}
                              >
                                {link.label}{" "}
                                {link.openMode === "new_tab" ? "↗" : ""}
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    },
                  },
                  {
                    h: "UPDATED",
                    w: 140,
                    r: (entry) => (
                      <span style={{ color: theme.textMuted, fontSize: 12 }}>
                        {formatDateTime(entry.updatedAt)}
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </div>
        </CanvasCard>
      </div>

      {pendingAction ? (
        <div style={modalScrimStyle}>
          <div style={modalCardStyle}>
            <div style={{ display: "grid", gap: 6 }}>
              <CanvasPill
                theme={theme}
                tone={
                  pendingAction.descriptor.riskLevel === "high"
                    ? "danger"
                    : pendingAction.descriptor.riskLevel === "medium"
                      ? "warn"
                      : "accent"
                }
              >
                {pendingAction.descriptor.riskLevel}
              </CanvasPill>
              <strong style={{ fontSize: 20 }}>{copy.confirmTitle}</strong>
              <span style={{ color: theme.textMuted, fontSize: 13 }}>
                {humanizeActionLabel(pendingAction.descriptor.action)} ·{" "}
                {pendingAction.displayName ||
                  pendingAction.entrySlug ||
                  copy.title}
              </span>
            </div>

            <CanvasBanner
              theme={theme}
              tone={
                pendingAction.descriptor.riskLevel === "high"
                  ? "danger"
                  : "warn"
              }
              title={copy.confirmImpact}
              body={copy.riskCopy[pendingAction.descriptor.riskLevel]}
            />

            <div style={{ display: "grid", gap: 8 }}>
              <strong style={{ fontSize: 13 }}>
                {copy.confirmActionsLabel}
              </strong>
              <div style={toolbarClusterStyle}>
                <CanvasPill theme={theme} tone="neutral">
                  {pendingAction.descriptor.action}
                </CanvasPill>
                <CanvasPill theme={theme} tone="neutral">
                  {pendingAction.descriptor.riskLevel}
                </CanvasPill>
                <CanvasPill
                  theme={theme}
                  tone={
                    pendingAction.descriptor.requiresReason ? "warn" : "neutral"
                  }
                >
                  {pendingAction.descriptor.requiresReason
                    ? "reason required"
                    : "reason optional"}
                </CanvasPill>
              </div>
              <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
                {copy.auditPending}
              </span>
            </div>

            {pendingAction.descriptor.requiresReason ||
            pendingAction.descriptor.riskLevel === "high" ? (
              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 12, color: theme.textMuted }}>
                  {copy.confirmReasonLabel}
                </span>
                <textarea
                  value={actionReason}
                  onChange={(event) => setActionReason(event.target.value)}
                  placeholder={copy.confirmReasonPlaceholder}
                  style={textareaStyle}
                />
              </label>
            ) : null}

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}
            >
              <CanvasBtn
                theme={theme}
                variant="secondary"
                onClick={() => {
                  setPendingAction(null);
                  setActionReason("");
                }}
                disabled={creating || pendingRowAction !== null}
              >
                {copy.confirmCancel}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                disabled={
                  creating ||
                  pendingRowAction !== null ||
                  ((pendingAction.descriptor.requiresReason ||
                    pendingAction.descriptor.riskLevel === "high") &&
                    !actionReason.trim())
                }
                onClick={() => void executeAction(pendingAction, actionReason)}
              >
                {copy.confirmProceed}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}
    </CanvasShell>
  );
}

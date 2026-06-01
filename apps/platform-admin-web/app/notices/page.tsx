"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
import type {
  ActionReceipt,
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  PlatformMaintenanceModeRecord,
  PlatformNoticeRecord,
  PlatformNoticeSeverity,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTheme,
} from "@drts/ui-web";

const REFRESH_INTERVAL_MS = 30_000;
const TAB_PARAM_VALUES = ["notices", "maint", "history"] as const;
const NOTICE_FORM_SEVERITIES: PlatformNoticeSeverity[] = [
  "info",
  "warning",
  "critical",
  "maintenance",
];
const EMPTY_REASON_PARAM_VALUES = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

type NoticeTab = (typeof TAB_PARAM_VALUES)[number];
type Audience = "all" | "tenants" | "ops" | "drivers";
type NoticeFilter = "all" | "active" | "scheduled" | "resolved";
type HistoryFilter = "all" | "delivered" | "delivering" | "pending";
type SupportedEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;
type NoticeActionIntent =
  | "create_notice"
  | "resolve_notice"
  | "view_broadcast_history"
  | "set_maintenance_mode"
  | "clear_maintenance_mode"
  | "unknown";

type NoticeRecord = PlatformNoticeRecord & {
  availableActions?: ResourceActionDescriptor[];
  crossAppLinks?: CrossAppResourceLink[];
};

type MaintenanceRecord = PlatformMaintenanceModeRecord & {
  availableActions?: ResourceActionDescriptor[];
  crossAppLinks?: CrossAppResourceLink[];
  affectedServices?: string[];
};

type NoticesResponse =
  | NoticeRecord[]
  | {
      items?: NoticeRecord[];
      emptyState?: EmptyStateEnvelope;
    };

type MaintenanceResponse =
  | MaintenanceRecord
  | {
      item?: MaintenanceRecord;
      emptyState?: EmptyStateEnvelope;
    };

type NoticeTableRow = NoticeRecord & Record<string, unknown>;

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

const kpiGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
} satisfies CSSProperties;

const splitGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
} satisfies CSSProperties;

const inputStyle = (th: CanvasTheme, mono = false): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontFamily: mono ? th.monoFamily : th.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
});

const linkButtonStyle = (th: CanvasTheme, disabled = false): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  minHeight: 28,
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 500,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
});

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGroup: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGroup: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGroup: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformGroup: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGroup: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleetGroup: "車隊與法遵",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGroup: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          platformGroup: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", icon: "home", label: labels.home },
    { key: "health", href: "/health", icon: "health", label: labels.health },
    { divider: labels.tenantGroup },
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
    { divider: labels.fleetGroup },
    { key: "fleet", href: "/fleet", icon: "fleet", label: labels.fleet },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: labels.switchboard,
    },
    { divider: labels.pricingGroup },
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
    },
    { divider: labels.platformGroup },
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
      matchPaths: ["/feature-flags"],
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "adapters",
      label: labels.adapters,
    },
  ];
}

function getCopy(locale: string) {
  return locale === "zh"
    ? {
        title: "公告與維護",
        subtitle:
          "critical / maintenance severity 會跨 app 推送 banner 到 ops、tenant、driver；Maintenance Mode 與 Broadcast History 共用同一路由。",
        refreshTier: "Refresh tier T4",
        refreshDetail: "每 30 秒自動刷新，保留手動刷新。",
        lastRefresh: "最後刷新",
        currentPolicy: "目前策略",
        routeMapTitle: "Route map",
        routeMapBody:
          "單一路由 `/notices` 透過三個 tabs 承載公告、維護模式與廣播歷史。",
        downstreamTitle: "Cross-app exits",
        downstreamBody:
          "critical / maintenance 會把 banner 推到 ops、tenant、driver 體驗；deep link 依 contract 開新分頁。",
        tabs: {
          notices: "Notices",
          maint: "Maintenance Mode",
          history: "Broadcast History",
        },
        createNotice: "建立公告",
        closeComposer: "收起編輯器",
        refresh: "刷新",
        noticeSummary: "公告概況",
        activeNoticeCount: "進行中公告",
        scheduledNoticeCount: "待發布公告",
        inflightBroadcastCount: "傳播中 broadcast",
        noticesTableTitle: "Notices",
        noticesTableHint:
          "title、body、severity、audience、status、updated time 依 spec 呈現。",
        historyTableTitle: "Broadcast history",
        historyTableHint: "唯讀顯示跨 app 投遞結果與 deep links。",
        maintenanceTitle: "Maintenance mode",
        maintenanceHint:
          "啟用後會暫停 dispatch、partner ingress 與 webhook delivery；請先發佈 maintenance severity notice。",
        maintenancePreviewTitle: "當前 maintenance notice 預覽",
        maintenancePreviewBody:
          "下游 app 會收到相同標題、原因與受影響服務摘要的 cross-app banner。",
        permissionsTitle: "Authority",
        permissionsBody:
          "行為按鈕與風險標示由 availableActions 驅動，不在前端硬編角色矩陣。",
        titleField: "標題",
        bodyField: "內容",
        severityField: "嚴重程度",
        audienceField: "對象",
        reasonField: "原因 / 稽核備註",
        scheduleStartField: "預定起始",
        scheduleEndField: "預定結束",
        publish: "發布公告",
        publishing: "發布中...",
        saveMaintenance: "保存維護設定",
        savingMaintenance: "保存中...",
        statusFilter: "狀態篩選",
        historyFilter: "投遞狀態",
        currentState: "目前狀態",
        currentReason: "目前原因",
        lastEnabledAt: "上次啟用",
        actionReasonField: "這次操作原因",
        updatedAt: "更新時間",
        createdAt: "建立時間",
        createdBy: "建立者",
        updatedBy: "更新者",
        changeReason: "變更原因",
        scheduledWindow: "Scheduled Window",
        affectedServices: "受影響服務",
        affectedApps: "Cross-app deep links",
        noticeId: "NOTICE",
        noticeTitle: "標題",
        noticeBody: "內容",
        severity: "SEV",
        audience: "對象",
        status: "STATUS",
        updated: "更新",
        delivery: "DELIVERY",
        targets: "TARGETS",
        broadcastAt: "BROADCAST AT",
        links: "LINKS",
        actions: "ACTIONS",
        resolve: "Resolve",
        enabled: "Enabled",
        disabled: "Disabled",
        activeBanner: "MAINTENANCE ACTIVE",
        maintenanceOn: "維護模式開啟",
        maintenanceOff: "維護模式關閉",
        setAction: "Set maintenance mode",
        clearAction: "Clear maintenance mode",
        noWindow: "未設定時間窗",
        noLinks: "無 deep link",
        noReason: "無原因",
        reasonRequired: "critical / maintenance 公告需填原因。",
        maintenanceRequiredReason: "設定或清除 maintenance mode 必須填原因。",
        loading: "載入中",
        actionUnavailable: "目前不可執行",
        newTab: "新分頁",
        deliveryPending: "等待傳播",
        deliveryPropagating: "傳播中",
        deliveryDone: "已完成傳播",
        createPanelTitle: "新公告與 cross-app banner",
        createPanelHint:
          "critical / maintenance 屬高風險操作，必須填原因，並會向下游 app 推送 banner。",
        noticeEmptyHint: "可加上 `?emptyReason=` 驗證六種空狀態。",
        allFilter: "全部",
        noDataFallback: "尚無資料",
        readOnly: "唯讀",
        readOnlyHint: "你可查看這筆資料，但目前沒有可執行動作。",
        readOnlyHistory: "此分頁唯讀，僅顯示跨 app 投遞結果。",
        openLink: "開啟",
        audienceLabel: {
          all: "全部",
          tenants: "租戶",
          ops: "營運",
          drivers: "司機",
        },
        empty: {
          no_data: ["目前沒有公告", "尚無 notices 或 broadcast history。"],
          not_provisioned: [
            "資料尚未配置",
            "後端尚未提供這個 tab 所需資料，可依 next action 補齊。",
          ],
          fetch_failed: ["讀取失敗", "自動刷新無法取得最新資料，請手動重試。"],
          permission_denied: [
            "權限不足",
            "你可讀到路由，但沒有查看這份資源的權限。",
          ],
          external_unavailable: [
            "外部依賴不可用",
            "下游 app 或 cross-app 依賴暫時不可用。",
          ],
          filtered_empty: ["篩選後無結果", "目前篩選條件下沒有符合資料。"],
        },
      }
    : {
        title: "Notices & Maintenance",
        subtitle:
          "Critical and maintenance severity notices push cross-app banners to ops, tenant, and driver experiences. Maintenance Mode and Broadcast History share this route.",
        refreshTier: "Refresh tier T4",
        refreshDetail:
          "Auto refresh every 30s with manual refresh kept visible.",
        lastRefresh: "Last refresh",
        currentPolicy: "Current policy",
        routeMapTitle: "Route map",
        routeMapBody:
          "A single `/notices` route hosts notices, maintenance mode, and broadcast history via tabs.",
        downstreamTitle: "Cross-app exits",
        downstreamBody:
          "Critical and maintenance notices push banners to ops, tenant, and driver experiences. Contract deep links open in a new tab.",
        tabs: {
          notices: "Notices",
          maint: "Maintenance Mode",
          history: "Broadcast History",
        },
        createNotice: "Create notice",
        closeComposer: "Close composer",
        refresh: "Refresh",
        noticeSummary: "Notice summary",
        activeNoticeCount: "Active notices",
        scheduledNoticeCount: "Scheduled notices",
        inflightBroadcastCount: "Broadcasts in flight",
        noticesTableTitle: "Notices",
        noticesTableHint:
          "List title, body, severity, audience, status, and updated time per spec.",
        historyTableTitle: "Broadcast history",
        historyTableHint:
          "Read-only cross-app delivery results with deep-link follow-through.",
        maintenanceTitle: "Maintenance mode",
        maintenanceHint:
          "When enabled, dispatch, partner ingress, and webhook delivery pause. Publish a maintenance severity notice first.",
        maintenancePreviewTitle: "Current maintenance notice preview",
        maintenancePreviewBody:
          "Downstream apps receive the same title, reason, and affected-service summary in the banner.",
        permissionsTitle: "Authority",
        permissionsBody:
          "Action buttons and risk labels are driven by availableActions, not a hard-coded role matrix.",
        titleField: "Title",
        bodyField: "Body",
        severityField: "Severity",
        audienceField: "Audience",
        reasonField: "Reason / audit note",
        scheduleStartField: "Scheduled start",
        scheduleEndField: "Scheduled end",
        publish: "Publish notice",
        publishing: "Publishing...",
        saveMaintenance: "Save maintenance settings",
        savingMaintenance: "Saving...",
        statusFilter: "Status filter",
        historyFilter: "Delivery filter",
        currentState: "Current state",
        currentReason: "Current reason",
        lastEnabledAt: "Last enabled",
        actionReasonField: "Action reason",
        updatedAt: "Updated",
        createdAt: "Created",
        createdBy: "Created by",
        updatedBy: "Updated by",
        changeReason: "Change reason",
        scheduledWindow: "Scheduled window",
        affectedServices: "Affected services",
        affectedApps: "Cross-app deep links",
        noticeId: "NOTICE",
        noticeTitle: "Title",
        noticeBody: "Body",
        severity: "SEV",
        audience: "AUDIENCE",
        status: "STATUS",
        updated: "UPDATED",
        delivery: "DELIVERY",
        targets: "TARGETS",
        broadcastAt: "BROADCAST AT",
        links: "LINKS",
        actions: "ACTIONS",
        resolve: "Resolve",
        enabled: "Enabled",
        disabled: "Disabled",
        activeBanner: "MAINTENANCE ACTIVE",
        maintenanceOn: "Maintenance mode ON",
        maintenanceOff: "Maintenance mode OFF",
        setAction: "Set maintenance mode",
        clearAction: "Clear maintenance mode",
        noWindow: "No scheduled window",
        noLinks: "No deep links",
        noReason: "No reason",
        reasonRequired: "Critical and maintenance notices require a reason.",
        maintenanceRequiredReason:
          "Setting or clearing maintenance mode requires a reason.",
        loading: "Loading",
        actionUnavailable: "Unavailable right now",
        newTab: "New tab",
        deliveryPending: "Pending broadcast",
        deliveryPropagating: "Broadcast propagating",
        deliveryDone: "Broadcast delivered",
        createPanelTitle: "New notice and cross-app banner",
        createPanelHint:
          "Critical and maintenance notices are high-risk, require a reason, and push banners downstream.",
        noticeEmptyHint: "Use `?emptyReason=` to verify all six empty states.",
        allFilter: "All",
        noDataFallback: "No data",
        readOnly: "Read-only",
        readOnlyHint:
          "You can inspect this record, but no actions are available.",
        readOnlyHistory:
          "This tab is read-only and only shows cross-app delivery results.",
        openLink: "Open",
        audienceLabel: {
          all: "All",
          tenants: "Tenants",
          ops: "Ops",
          drivers: "Drivers",
        },
        empty: {
          no_data: [
            "No notices yet",
            "There are no notices or broadcast records yet.",
          ],
          not_provisioned: [
            "Not provisioned",
            "The backend has not provisioned data for this tab yet. Use the next action if available.",
          ],
          fetch_failed: [
            "Refresh failed",
            "Auto refresh could not retrieve the latest data. Retry manually.",
          ],
          permission_denied: [
            "Permission denied",
            "You can reach the route, but your role cannot read this resource.",
          ],
          external_unavailable: [
            "External dependency unavailable",
            "A downstream app or cross-app dependency is currently unavailable.",
          ],
          filtered_empty: [
            "Nothing matches the filters",
            "Your current filters do not match any records.",
          ],
        },
      };
}

function normalizeNoticesResponse(raw: NoticesResponse) {
  if (Array.isArray(raw)) {
    return { items: raw, emptyState: undefined };
  }
  return {
    items: raw?.items ?? [],
    emptyState: raw?.emptyState,
  };
}

function normalizeMaintenanceResponse(raw: MaintenanceResponse) {
  if (raw && "enabled" in raw) {
    return { item: raw as MaintenanceRecord, emptyState: undefined };
  }
  return {
    item: raw?.item ?? null,
    emptyState: raw?.emptyState,
  };
}

function getRequestedTab(value: string | null): NoticeTab | null {
  if (!value) {
    return null;
  }
  return TAB_PARAM_VALUES.includes(value as NoticeTab)
    ? (value as NoticeTab)
    : null;
}

function getRequestedEmptyReason(
  value: string | null,
): SupportedEmptyReason | null {
  if (!value) {
    return null;
  }
  return EMPTY_REASON_PARAM_VALUES.includes(value as SupportedEmptyReason)
    ? (value as SupportedEmptyReason)
    : null;
}

function normalizeSupportedEmptyReason(
  reason: EmptyReason | null | undefined,
  fallback: SupportedEmptyReason,
): SupportedEmptyReason {
  if (!reason || reason === "driver_not_eligible") {
    return fallback;
  }
  return reason;
}

function normalizeNoticeActions(
  notice: NoticeRecord,
): ResourceActionDescriptor[] {
  return notice.availableActions ?? [];
}

function normalizeMaintenanceActions(
  maintenance: MaintenanceRecord | null,
): ResourceActionDescriptor[] {
  return maintenance?.availableActions ?? [];
}

function getMaintenanceAction(
  maintenance: MaintenanceRecord | null,
  enabled: boolean,
): ResourceActionDescriptor | null {
  const actions = normalizeMaintenanceActions(maintenance);
  return (
    actions.find((action) => {
      const intent = getNoticeActionIntent(action.action);
      return enabled
        ? intent === "clear_maintenance_mode"
        : intent === "set_maintenance_mode";
    }) ??
    actions[0] ??
    null
  );
}

function getNoticeActionIntent(action: string): NoticeActionIntent {
  const normalizedAction = action.toLowerCase();
  if (normalizedAction === "create" || normalizedAction.includes("create")) {
    return "create_notice";
  }
  if (
    normalizedAction.includes("broadcast_history") ||
    normalizedAction.includes("view_broadcast") ||
    normalizedAction.includes("history")
  ) {
    return "view_broadcast_history";
  }
  if (normalizedAction.includes("clear_maintenance")) {
    return "clear_maintenance_mode";
  }
  if (
    normalizedAction.includes("set_maintenance") ||
    normalizedAction.includes("enable_maintenance")
  ) {
    return "set_maintenance_mode";
  }
  if (normalizedAction.includes("resolve")) {
    return "resolve_notice";
  }
  return "unknown";
}

function getStatusTone(status: string) {
  if (status === "active" || status === "delivered" || status === "enabled") {
    return "admin-badge--success";
  }
  if (status === "scheduled" || status === "delivering") {
    return "admin-badge--warning";
  }
  if (status === "pending") {
    return "admin-badge--info";
  }
  return "admin-badge--neutral";
}

function getRiskTone(riskLevel: ResourceActionDescriptor["riskLevel"]) {
  if (riskLevel === "high") {
    return "admin-badge--danger";
  }
  if (riskLevel === "medium") {
    return "admin-badge--warning";
  }
  return "admin-badge--info";
}

function formatWindow(
  start?: string | null,
  end?: string | null,
  fallback?: string,
) {
  if (!start && !end) {
    return fallback ?? "—";
  }
  return `${start ? formatDateTime(start) : "—"} -> ${end ? formatDateTime(end) : "—"}`;
}

function normalizeOrigin(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }
  try {
    return new URL(trimmed).origin;
  } catch {
    return "";
  }
}

function inferCrossAppOrigin(targetApp: CrossAppResourceLink["targetApp"]) {
  if (typeof window === "undefined") {
    return "";
  }

  const current = new URL(window.location.origin);
  if (targetApp === "platform-admin") {
    return current.origin;
  }

  if (current.hostname === "localhost") {
    const portMap: Record<CrossAppResourceLink["targetApp"], string> = {
      "driver-app": "8081",
      "platform-admin": "3002",
      "ops-console": "3003",
      "tenant-console": "3004",
    };
    current.port = portMap[targetApp];
    return current.origin;
  }

  if (current.hostname.includes("platform-admin")) {
    const hostMap: Record<CrossAppResourceLink["targetApp"], string> = {
      "driver-app": "driver",
      "platform-admin": "platform-admin",
      "ops-console": "ops-console",
      "tenant-console": "tenant-console",
    };
    current.hostname = current.hostname.replace(
      "platform-admin",
      hostMap[targetApp],
    );
    return current.origin;
  }

  return "";
}

function getCrossAppHref(link: CrossAppResourceLink): string {
  const baseMap: Record<CrossAppResourceLink["targetApp"], string | undefined> =
    {
      "driver-app":
        process.env.NEXT_PUBLIC_DRIVER_APP_ORIGIN ??
        process.env.NEXT_PUBLIC_DRIVER_APP_URL,
      "ops-console":
        process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN ??
        process.env.NEXT_PUBLIC_OPS_CONSOLE_URL,
      "platform-admin":
        process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN ??
        process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL,
      "tenant-console":
        process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN ??
        process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL,
    };
  const base =
    normalizeOrigin(baseMap[link.targetApp]) ||
    inferCrossAppOrigin(link.targetApp);
  if (!base) {
    return "";
  }
  return `${base.replace(/\/$/, "")}${link.route.startsWith("/") ? "" : "/"}${link.route}`;
}

function isNoticeReasonRequired(severity: PlatformNoticeSeverity) {
  return severity === "critical" || severity === "maintenance";
}

function canSubmitNoticeForm(input: {
  title: string;
  body: string;
  severity: PlatformNoticeSeverity;
  reason: string;
}) {
  if (!input.title.trim() || !input.body.trim()) {
    return false;
  }
  if (isNoticeReasonRequired(input.severity) && !input.reason.trim()) {
    return false;
  }
  return true;
}

function getActionLabel(
  locale: string,
  action: ResourceActionDescriptor["action"],
) {
  const labels: Record<string, { en: string; zh: string }> = {
    create: { en: "Create notice", zh: "建立公告" },
    resolve_notice: { en: "Resolve notice", zh: "結束公告" },
    resolve: { en: "Resolve notice", zh: "結束公告" },
    view_broadcast_history: {
      en: "View broadcast history",
      zh: "查看廣播歷史",
    },
    set_maintenance: { en: "Set maintenance mode", zh: "啟用維護模式" },
    set_maintenance_mode: { en: "Set maintenance mode", zh: "啟用維護模式" },
    clear_maintenance_mode: {
      en: "Clear maintenance mode",
      zh: "解除維護模式",
    },
  };
  const direct = labels[action]?.[locale === "zh" ? "zh" : "en"];
  if (direct) {
    return direct;
  }

  const intentLabels: Record<
    NoticeActionIntent,
    { en: string; zh: string } | undefined
  > = {
    create_notice: { en: "Create notice", zh: "建立公告" },
    resolve_notice: { en: "Resolve notice", zh: "結束公告" },
    view_broadcast_history: {
      en: "View broadcast history",
      zh: "查看廣播歷史",
    },
    set_maintenance_mode: {
      en: "Set maintenance mode",
      zh: "啟用維護模式",
    },
    clear_maintenance_mode: {
      en: "Clear maintenance mode",
      zh: "解除維護模式",
    },
    unknown: undefined,
  };

  return (
    intentLabels[getNoticeActionIntent(action)]?.[
      locale === "zh" ? "zh" : "en"
    ] ?? action
  );
}

function getDeliveryLabel(
  copy: ReturnType<typeof getCopy>,
  state: "pending" | "delivering" | "delivered" | undefined,
) {
  if (state === "delivered") {
    return copy.deliveryDone;
  }
  if (state === "delivering") {
    return copy.deliveryPropagating;
  }
  if (state === "pending") {
    return copy.deliveryPending;
  }
  return "—";
}

function collectCrossAppLinks(
  ...sources: (CrossAppResourceLink[] | undefined)[]
) {
  const deduped = new Map<string, CrossAppResourceLink>();
  sources.flat().forEach((link) => {
    if (!link) {
      return;
    }
    deduped.set(
      `${link.targetApp}:${link.resourceType}:${link.resourceId}:${link.route}`,
      link,
    );
  });
  return Array.from(deduped.values());
}

function collectUniqueActions(
  ...sources: (ResourceActionDescriptor[] | undefined)[]
) {
  const deduped = new Map<string, ResourceActionDescriptor>();
  sources.flat().forEach((action) => {
    if (!action) {
      return;
    }
    const key = getNoticeActionIntent(action.action);
    if (!deduped.has(key)) {
      deduped.set(key, action);
    }
  });
  return Array.from(deduped.values());
}

function toNoticeTableRows(rows: NoticeRecord[]): NoticeTableRow[] {
  return rows.map((row) => ({ ...row }));
}

function findActionByIntent(
  actions: ResourceActionDescriptor[],
  intent: NoticeActionIntent,
) {
  return (
    actions.find((action) => getNoticeActionIntent(action.action) === intent) ??
    null
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <CanvasKPI theme={theme} label={label} value={value} sub={tone} hint="T4" />
  );
}

function ActionMeta({
  locale,
  action,
  label,
}: {
  locale: Locale;
  action: ResourceActionDescriptor;
  label?: string;
}) {
  const tone =
    getRiskTone(action.riskLevel) === "admin-badge--danger"
      ? "danger"
      : getRiskTone(action.riskLevel) === "admin-badge--warning"
        ? "warn"
        : "info";

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <CanvasPill theme={theme} tone={tone}>
        {label ?? getActionLabel(locale, action.action)}
      </CanvasPill>
      <CanvasPill theme={theme} tone="neutral">
        {formatPlatformCodeLabel(locale, action.riskLevel)}
      </CanvasPill>
      {action.requiresReason ? (
        <CanvasPill theme={theme} tone="neutral">
          {locale === "zh" ? "需填原因" : "Reason required"}
        </CanvasPill>
      ) : null}
      {!action.enabled && action.disabledReasonCode ? (
        <CanvasPill theme={theme} tone="neutral">
          {formatPlatformCodeLabel(locale, action.disabledReasonCode)}
        </CanvasPill>
      ) : null}
    </div>
  );
}

function EmptyStateCard({
  locale,
  reason,
  messageCode,
  nextAction,
  onNextAction,
}: {
  locale: Locale;
  reason: SupportedEmptyReason;
  messageCode?: string | undefined;
  nextAction?: ResourceActionDescriptor | undefined;
  onNextAction?: (() => void) | null | undefined;
}) {
  const copy = getCopy(locale);
  const emptyMap = copy.empty as unknown as Record<
    SupportedEmptyReason,
    [string, string]
  >;
  const fallbackEntry = emptyMap.no_data ?? [copy.noDataFallback, ""];
  const [title, body] = emptyMap[reason] ?? fallbackEntry;
  const styleMap: Record<
    SupportedEmptyReason,
    { accent: string; glow: string; glyph: string }
  > = {
    no_data: { accent: "#0f766e", glow: "rgba(15,118,110,0.12)", glyph: "00" },
    not_provisioned: {
      accent: "#4338ca",
      glow: "rgba(67,56,202,0.12)",
      glyph: "01",
    },
    fetch_failed: {
      accent: "#b91c1c",
      glow: "rgba(185,28,28,0.12)",
      glyph: "02",
    },
    permission_denied: {
      accent: "#9a3412",
      glow: "rgba(154,52,18,0.12)",
      glyph: "03",
    },
    external_unavailable: {
      accent: "#334155",
      glow: "rgba(51,65,85,0.12)",
      glyph: "04",
    },
    filtered_empty: {
      accent: "#0369a1",
      glow: "rgba(3,105,161,0.12)",
      glyph: "05",
    },
  };
  const style = styleMap[reason] ?? {
    accent: "#0f766e",
    glow: "rgba(15,118,110,0.12)",
    glyph: "00",
  };

  return (
    <CanvasCard
      theme={theme}
      style={{
        padding: 0,
        overflow: "hidden",
        borderColor: style.glow,
        background: `linear-gradient(140deg, ${style.glow}, rgba(255,255,255,0.97) 42%)`,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "120px minmax(0, 1fr)",
          gap: 20,
          alignItems: "center",
          padding: 28,
        }}
      >
        <div
          style={{
            width: 92,
            height: 92,
            borderRadius: 28,
            display: "grid",
            placeItems: "center",
            background: style.glow,
            color: style.accent,
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "0.08em",
          }}
        >
          {style.glyph}
        </div>
        <div>
          <div style={{ marginBottom: 12 }}>
            <CanvasPill theme={theme} tone="accent">
              {reason}
            </CanvasPill>
          </div>
          <h3 style={{ margin: "0 0 8px", fontSize: 22 }}>{title}</h3>
          <p style={{ margin: "0 0 10px", color: "#475569", lineHeight: 1.7 }}>
            {body}
          </p>
          {messageCode ? (
            <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: 13 }}>
              {messageCode}
            </p>
          ) : null}
          {nextAction ? (
            <div style={{ display: "grid", gap: 10 }}>
              <ActionMeta locale={locale} action={nextAction} />
              {onNextAction && nextAction.enabled ? (
                <button
                  type="button"
                  style={linkButtonStyle(theme)}
                  onClick={onNextAction}
                >
                  {getActionLabel(locale, nextAction.action)}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </CanvasCard>
  );
}

export default function NoticesPage() {
  const client = usePlatformAdminClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locale } = useTranslation();
  const copy = getCopy(locale);
  const navItems = useMemo(() => buildPlatformNav(locale), [locale]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NoticeTab>("notices");
  const [noticeFilter, setNoticeFilter] = useState<NoticeFilter>("all");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  const [notices, setNotices] = useState<NoticeRecord[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord | null>(
    null,
  );
  const [noticesEmptyState, setNoticesEmptyState] =
    useState<EmptyStateEnvelope | null>(null);
  const [maintenanceEmptyState, setMaintenanceEmptyState] =
    useState<EmptyStateEnvelope | null>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formSeverity, setFormSeverity] =
    useState<PlatformNoticeSeverity>("info");
  const [formAudience, setFormAudience] = useState<Audience>("all");
  const [formReason, setFormReason] = useState("");
  const [formScheduledAt, setFormScheduledAt] = useState("");
  const [maintEnabled, setMaintEnabled] = useState(false);
  const [maintActionReason, setMaintActionReason] = useState("");
  const [maintScheduledStart, setMaintScheduledStart] = useState("");
  const [maintScheduledEnd, setMaintScheduledEnd] = useState("");
  const maintenanceDraftDirtyRef = useRef(false);

  const requestedEmptyReason = getRequestedEmptyReason(
    searchParams.get("emptyReason"),
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [noticeRaw, maintenanceRaw] = await Promise.all([
        client.listPlatformNotices() as Promise<NoticesResponse>,
        client.getMaintenanceMode() as Promise<MaintenanceResponse>,
      ]);
      const noticeData = normalizeNoticesResponse(noticeRaw);
      const maintenanceData = normalizeMaintenanceResponse(maintenanceRaw);

      setNotices(noticeData.items);
      setNoticesEmptyState(noticeData.emptyState ?? null);
      setMaintenance(maintenanceData.item);
      setMaintenanceEmptyState(maintenanceData.emptyState ?? null);
      if (!maintenanceDraftDirtyRef.current) {
        setMaintEnabled(Boolean(maintenanceData.item?.enabled));
        setMaintActionReason("");
        setMaintScheduledStart(maintenanceData.item?.scheduledStart ?? "");
        setMaintScheduledEnd(maintenanceData.item?.scheduledEnd ?? "");
      }
      setLastRefreshAt(new Date().toISOString());
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      );
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const nextTab = getRequestedTab(searchParams.get("tab"));
    if (nextTab && nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, searchParams]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadData();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const activeNotices = notices.filter((notice) =>
    noticeFilter === "all" ? true : notice.status === noticeFilter,
  );
  const historyRows = notices.filter(
    (notice) => notice.deliverySummary || notice.severity !== "info",
  );
  const filteredHistoryRows = historyRows.filter((notice) => {
    const state = notice.deliverySummary?.state ?? "pending";
    return historyFilter === "all" ? true : state === historyFilter;
  });
  const activeNoticeCount = notices.filter(
    (notice) => notice.status === "active",
  ).length;
  const scheduledNoticeCount = notices.filter(
    (notice) => notice.status === "scheduled",
  ).length;
  const inflightBroadcastCount = notices.filter((notice) => {
    const state = notice.deliverySummary?.state;
    return state === "pending" || state === "delivering";
  }).length;
  const maintenanceAction = getMaintenanceAction(maintenance, maintEnabled);
  const noticeLinks = collectCrossAppLinks(
    ...notices.map((notice) => notice.crossAppLinks),
  );
  const historyLinks = collectCrossAppLinks(
    ...historyRows.map((notice) => notice.crossAppLinks),
  );
  const noticesTabActions = collectUniqueActions(
    ...notices.map((notice) => notice.availableActions),
    noticesEmptyState?.nextAction ? [noticesEmptyState.nextAction] : undefined,
  );
  const historyTabActions = collectUniqueActions(
    ...historyRows.map((notice) => notice.availableActions),
    noticesEmptyState?.nextAction ? [noticesEmptyState.nextAction] : undefined,
  );
  const createNoticeAction = findActionByIntent(
    noticesTabActions,
    "create_notice",
  );
  const currentTabActions =
    activeTab === "notices"
      ? noticesTabActions
      : activeTab === "maint"
        ? maintenanceAction
          ? [maintenanceAction]
          : []
        : historyTabActions;

  const updateTab = useCallback(
    (nextTab: NoticeTab) => {
      setActiveTab(nextTab);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", nextTab);
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const handleEmptyStateAction = useCallback(
    (action: ResourceActionDescriptor | undefined) => {
      if (!action?.enabled) {
        return;
      }
      switch (getNoticeActionIntent(action.action)) {
        case "create_notice":
          setShowCreate(true);
          updateTab("notices");
          return;
        case "view_broadcast_history":
          updateTab("history");
          return;
        case "set_maintenance_mode":
        case "clear_maintenance_mode":
          updateTab("maint");
          return;
        default:
          return;
      }
    },
    [updateTab],
  );

  async function handleCreateNotice(event: React.FormEvent) {
    event.preventDefault();
    if (isNoticeReasonRequired(formSeverity) && !formReason.trim()) {
      setError(copy.reasonRequired);
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await client.createPlatformNotice({
        title: formTitle.trim(),
        body: formBody.trim(),
        severity: formSeverity,
        targetAudience: formAudience,
        scheduledAt: formScheduledAt || null,
        reason: formReason.trim() || null,
      });
      setFormTitle("");
      setFormBody("");
      setFormSeverity("info");
      setFormAudience("all");
      setFormReason("");
      setFormScheduledAt("");
      setShowCreate(false);
      await loadData();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleResolveNotice(noticeId: string) {
    setError(null);
    try {
      await client.resolvePlatformNotice(noticeId);
      await loadData();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      );
    }
  }

  async function handleSaveMaintenance() {
    if (maintenanceAction?.requiresReason && !maintActionReason.trim()) {
      setError(copy.maintenanceRequiredReason);
      return;
    }

    setSavingMaintenance(true);
    setError(null);
    try {
      const receipt: ActionReceipt = await client.setMaintenanceMode({
        enabled: maintEnabled,
        reason: maintActionReason.trim() || null,
        scheduledStart: maintScheduledStart || null,
        scheduledEnd: maintScheduledEnd || null,
      });
      if (receipt.resourceType !== "platform_maintenance_mode") {
        throw new Error("Unexpected maintenance action receipt resourceType.");
      }
      maintenanceDraftDirtyRef.current = false;
      await loadData();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      );
    } finally {
      setSavingMaintenance(false);
    }
  }

  function getTabBadge(tab: NoticeTab) {
    if (tab === "notices") {
      return String(notices.length);
    }
    if (tab === "maint") {
      return maintenance?.enabled ? copy.enabled : copy.disabled;
    }
    return String(historyRows.length);
  }

  function renderLinkSet(links?: CrossAppResourceLink[]) {
    if (!links?.length) {
      return <span style={{ color: theme.textMuted }}>{copy.noLinks}</span>;
    }
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {links.map((link) => {
          const href = getCrossAppHref(link);
          if (!href) {
            return (
              <span
                key={`${link.targetApp}-${link.route}`}
                style={linkButtonStyle(theme, true)}
                title={copy.actionUnavailable}
              >
                {copy.openLink} {link.label}
                {link.openMode === "new_tab" ? ` · ${copy.newTab}` : ""}
              </span>
            );
          }

          return (
            <a
              key={`${link.targetApp}-${link.route}`}
              href={href}
              target={link.openMode === "new_tab" ? "_blank" : "_self"}
              rel="noreferrer"
              style={linkButtonStyle(theme)}
            >
              {copy.openLink} {link.label}
              {link.openMode === "new_tab" ? ` · ${copy.newTab}` : ""}
            </a>
          );
        })}
      </div>
    );
  }

  function renderEmptyState(
    reason: SupportedEmptyReason,
    emptyState?: EmptyStateEnvelope | null,
  ) {
    return (
      <EmptyStateCard
        locale={locale}
        reason={reason}
        messageCode={emptyState?.messageCode}
        nextAction={emptyState?.nextAction}
        onNextAction={
          emptyState?.nextAction
            ? () => handleEmptyStateAction(emptyState.nextAction)
            : null
        }
      />
    );
  }

  function renderNoticeActions(notice: NoticeRecord) {
    const actions = normalizeNoticeActions(notice);
    if (!actions.length) {
      return (
        <div style={{ display: "grid", gap: 6 }}>
          <span className="admin-badge admin-badge--neutral">
            {copy.readOnly}
          </span>
          <span style={{ color: "#64748b", fontSize: 13 }}>
            {copy.readOnlyHint}
          </span>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {actions.map((action) => {
          const intent = getNoticeActionIntent(action.action);
          if (intent === "resolve_notice" && action.enabled) {
            return (
              <CanvasBtn
                key={action.action}
                theme={theme}
                disabled={!action.enabled}
                onClick={() => void handleResolveNotice(notice.noticeId)}
              >
                {getActionLabel(locale, action.action)}
              </CanvasBtn>
            );
          }
          if (intent === "view_broadcast_history" && action.enabled) {
            return (
              <CanvasBtn
                key={action.action}
                theme={theme}
                onClick={() => updateTab("history")}
              >
                {getActionLabel(locale, action.action)}
              </CanvasBtn>
            );
          }
          return (
            <ActionMeta key={action.action} locale={locale} action={action} />
          );
        })}
      </div>
    );
  }

  function renderNoticesTab() {
    const noticeColumns: CanvasTableColumn<NoticeTableRow>[] = [
      { h: copy.noticeId, k: "noticeId", mono: true, w: 130 },
      {
        h: copy.noticeTitle,
        w: 250,
        r: (notice) => (
          <div style={{ display: "grid", gap: 4, whiteSpace: "normal" }}>
            <div style={{ fontWeight: 700 }}>{notice.title}</div>
            {notice.changeReason ? (
              <div style={{ color: theme.textMuted, fontSize: 11.5 }}>
                {copy.changeReason}: {notice.changeReason}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        h: copy.noticeBody,
        w: 280,
        r: (notice) => (
          <div style={{ display: "grid", gap: 6, whiteSpace: "normal" }}>
            <div style={clampedBodyStyle}>{notice.body}</div>
            <div style={{ color: theme.textMuted, fontSize: 11.5 }}>
              {copy.createdAt}: {formatDateTime(notice.createdAt)}
            </div>
          </div>
        ),
      },
      {
        h: copy.severity,
        w: 120,
        r: (notice) => (
          <CanvasPill
            theme={theme}
            tone={
              notice.severity === "critical" ||
              notice.severity === "maintenance"
                ? "danger"
                : notice.severity === "warning"
                  ? "warn"
                  : "info"
            }
          >
            {formatPlatformCodeLabel(locale, notice.severity)}
          </CanvasPill>
        ),
      },
      {
        h: copy.audience,
        w: 120,
        r: (notice) => (
          <CanvasPill theme={theme} tone="neutral">
            {copy.audienceLabel[notice.targetAudience as Audience]}
          </CanvasPill>
        ),
      },
      {
        h: copy.status,
        w: 140,
        r: (notice) => (
          <div style={{ display: "grid", gap: 6 }}>
            <CanvasPill theme={theme} tone="neutral">
              {formatPlatformCodeLabel(locale, notice.status)}
            </CanvasPill>
            {notice.deliverySummary?.state ? (
              <CanvasPill theme={theme} tone="info">
                {getDeliveryLabel(copy, notice.deliverySummary.state)}
              </CanvasPill>
            ) : null}
          </div>
        ),
      },
      {
        h: copy.updated,
        w: 170,
        r: (notice) => formatDateTime(notice.updatedAt),
      },
      {
        h: copy.links,
        w: 220,
        r: (notice) => renderLinkSet(notice.crossAppLinks),
      },
      { h: copy.actions, w: 220, r: (notice) => renderNoticeActions(notice) },
    ];

    if (requestedEmptyReason) {
      return renderEmptyState(requestedEmptyReason);
    }
    if (error) {
      return renderEmptyState("fetch_failed");
    }
    if (activeNotices.length === 0) {
      const fallback = notices.length === 0 ? "no_data" : "filtered_empty";
      return renderEmptyState(
        normalizeSupportedEmptyReason(noticesEmptyState?.reason, fallback),
        noticesEmptyState,
      );
    }

    return (
      <CanvasCard
        theme={theme}
        title={copy.noticesTableTitle}
        subtitle={copy.noticesTableHint}
        style={{ overflowX: "auto" }}
      >
        <div
          style={{
            ...splitGridStyle,
            gridTemplateColumns: "minmax(0, 220px) minmax(0, 1fr)",
          }}
        >
          <CanvasField theme={theme} label={copy.statusFilter}>
            <select
              value={noticeFilter}
              onChange={(event) =>
                setNoticeFilter(event.target.value as NoticeFilter)
              }
              style={inputStyle(theme)}
            >
              <option value="all">{copy.allFilter}</option>
              <option value="active">active</option>
              <option value="scheduled">scheduled</option>
              <option value="resolved">resolved</option>
            </select>
          </CanvasField>
          <div />
        </div>
        <CanvasTable
          theme={theme}
          columns={noticeColumns}
          rows={toNoticeTableRows(activeNotices)}
        />
      </CanvasCard>
    );
  }

  function renderMaintenanceTab() {
    if (requestedEmptyReason) {
      return renderEmptyState(requestedEmptyReason);
    }
    if (error) {
      return renderEmptyState("fetch_failed");
    }
    if (!maintenance) {
      return renderEmptyState(
        normalizeSupportedEmptyReason(
          maintenanceEmptyState?.reason,
          "external_unavailable",
        ),
        maintenanceEmptyState,
      );
    }

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(300px, 1fr)",
          gap: 16,
        }}
      >
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <div style={sectionHeaderStyle}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {copy.maintenanceTitle}
              </div>
              <p style={sectionHintStyle}>{copy.maintenanceHint}</p>
            </div>
            <span
              className={`admin-badge ${getStatusTone(
                maintenance.enabled ? "enabled" : "disabled",
              )}`}
            >
              {maintenance.enabled ? copy.enabled : copy.disabled}
            </span>
          </div>

          <div
            style={{
              padding: 14,
              border: "1px solid rgba(15,23,42,0.08)",
              borderRadius: 12,
              background: "rgba(248,250,252,0.92)",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                marginBottom: 8,
              }}
            >
              <span style={{ fontWeight: 700 }}>
                {locale === "zh"
                  ? "全平台維護模式"
                  : "Platform-wide maintenance mode"}
              </span>
              <label className="admin-switch">
                <input
                  type="checkbox"
                  checked={maintEnabled}
                  disabled={!maintenanceAction?.enabled}
                  onChange={(event) => {
                    setMaintEnabled(event.target.checked);
                    maintenanceDraftDirtyRef.current = true;
                  }}
                />
                <span className="admin-switch-slider" />
              </label>
            </div>
            <div style={{ color: "#64748b", lineHeight: 1.6 }}>
              {copy.maintenanceHint}
            </div>
          </div>

          <div style={maintenanceGridStyle}>
            <label style={fieldGroupStyle}>
              <span style={fieldLabelStyle}>{copy.reasonField}</span>
              <input
                value={maintenance?.reason ?? ""}
                disabled
                style={{
                  ...fieldStyle,
                  color: "#475569",
                  background: "rgba(241,245,249,0.9)",
                }}
                placeholder={copy.noReason}
              />
            </label>
            <label style={fieldGroupStyle}>
              <span style={fieldLabelStyle}>{copy.actionReasonField}</span>
              <input
                value={maintActionReason}
                disabled={!maintenanceAction?.enabled}
                onChange={(event) => {
                  setMaintActionReason(event.target.value);
                  maintenanceDraftDirtyRef.current = true;
                }}
                style={fieldStyle}
                placeholder={copy.actionReasonField}
              />
            </label>
            <label style={fieldGroupStyle}>
              <span style={fieldLabelStyle}>{copy.scheduleStartField}</span>
              <input
                value={maintScheduledStart}
                disabled={!maintenanceAction?.enabled}
                onChange={(event) => {
                  setMaintScheduledStart(event.target.value);
                  maintenanceDraftDirtyRef.current = true;
                }}
                style={fieldStyle}
                placeholder="2026-05-27T02:00:00Z"
              />
            </label>
            <label style={fieldGroupStyle}>
              <span style={fieldLabelStyle}>{copy.scheduleEndField}</span>
              <input
                value={maintScheduledEnd}
                disabled={!maintenanceAction?.enabled}
                onChange={(event) => {
                  setMaintScheduledEnd(event.target.value);
                  maintenanceDraftDirtyRef.current = true;
                }}
                style={fieldStyle}
                placeholder="2026-05-27T04:00:00Z"
              />
            </label>
            <div style={fieldGroupStyle}>
              <span style={fieldLabelStyle}>{copy.affectedServices}</span>
              <div style={fieldBoxStyle}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(maintenance.affectedServices ?? []).length ? (
                    (maintenance.affectedServices ?? []).map(
                      (service: string) => (
                        <span
                          key={service}
                          className="admin-badge admin-badge--neutral"
                          style={{ textTransform: "none" }}
                        >
                          {service}
                        </span>
                      ),
                    )
                  ) : (
                    <span style={{ color: "#64748b" }}>—</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={maintenanceMetaRowStyle}>
            <div style={fieldBoxStyle}>
              <div style={metaLabelStyle}>{copy.currentState}</div>
              <div style={{ marginTop: 6, fontWeight: 700 }}>
                {maintenance.enabled ? copy.maintenanceOn : copy.maintenanceOff}
              </div>
            </div>
            <div style={fieldBoxStyle}>
              <div style={metaLabelStyle}>{copy.currentReason}</div>
              <div style={{ marginTop: 6 }}>
                {maintenance.reason || copy.noReason}
              </div>
            </div>
            <div style={fieldBoxStyle}>
              <div style={metaLabelStyle}>{copy.scheduledWindow}</div>
              <div style={{ marginTop: 6 }}>
                {formatWindow(
                  maintenance.scheduledStart,
                  maintenance.scheduledEnd,
                  copy.noWindow,
                )}
              </div>
            </div>
            <div style={fieldBoxStyle}>
              <div style={metaLabelStyle}>{copy.updatedAt}</div>
              <div style={{ marginTop: 6 }}>
                {formatDateTime(maintenance.updatedAt)}
              </div>
            </div>
            <div style={fieldBoxStyle}>
              <div style={metaLabelStyle}>{copy.updatedBy}</div>
              <div style={{ marginTop: 6 }}>{maintenance.updatedBy || "—"}</div>
            </div>
            <div style={fieldBoxStyle}>
              <div style={metaLabelStyle}>{copy.lastEnabledAt}</div>
              <div style={{ marginTop: 6 }}>
                {maintenance.lastEnabledAt
                  ? formatDateTime(maintenance.lastEnabledAt)
                  : "—"}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>{copy.permissionsTitle}</div>
              <div style={{ color: "#64748b", maxWidth: 520 }}>
                {copy.permissionsBody}
              </div>
              {maintenanceAction ? (
                <ActionMeta
                  locale={locale}
                  action={maintenanceAction}
                  label={
                    maintenanceAction.action === "clear_maintenance_mode"
                      ? copy.clearAction
                      : copy.setAction
                  }
                />
              ) : null}
            </div>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={savingMaintenance || !maintenanceAction?.enabled}
              title={maintenanceAction?.disabledReasonCode ?? undefined}
              onClick={() => void handleSaveMaintenance()}
            >
              {savingMaintenance
                ? copy.savingMaintenance
                : maintenanceAction?.action === "clear_maintenance_mode"
                  ? copy.clearAction
                  : copy.saveMaintenance}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div className="admin-card" style={{ marginBottom: 0 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 18 }}>
              {copy.maintenancePreviewTitle}
            </h3>
            <div
              style={{
                borderRadius: 18,
                padding: 20,
                background:
                  "linear-gradient(155deg, rgba(127,29,29,0.98), rgba(239,68,68,0.84))",
                color: "#fff",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.16)",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  marginBottom: 12,
                }}
              >
                {copy.activeBanner}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
                {maintActionReason || maintenance.reason || copy.maintenanceOn}
              </div>
              <p
                style={{
                  margin: "0 0 12px",
                  color: "rgba(255,255,255,0.86)",
                  lineHeight: 1.7,
                }}
              >
                {copy.maintenancePreviewBody}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {maintScheduledStart || maintScheduledEnd ? (
                  <span
                    className="admin-badge"
                    style={{
                      background: "rgba(255,255,255,0.16)",
                      color: "#fff",
                    }}
                  >
                    {formatWindow(
                      maintScheduledStart,
                      maintScheduledEnd,
                      copy.noWindow,
                    )}
                  </span>
                ) : null}
                {(maintenance.affectedServices ?? []).map((service: string) => (
                  <span
                    key={service}
                    className="admin-badge"
                    style={{
                      background: "rgba(255,255,255,0.16)",
                      color: "#fff",
                      textTransform: "none",
                    }}
                  >
                    {service}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="admin-card" style={{ marginBottom: 0 }}>
            <div style={{ marginBottom: 10, fontWeight: 700 }}>
              {copy.affectedApps}
            </div>
            {renderLinkSet(maintenance.crossAppLinks)}
          </div>
        </div>
      </div>
    );
  }

  function renderHistoryTab() {
    const historyColumns: CanvasTableColumn<NoticeTableRow>[] = [
      { h: copy.noticeId, k: "noticeId", mono: true, w: 130 },
      {
        h: copy.noticeTitle,
        w: 280,
        r: (notice) => (
          <div style={{ display: "grid", gap: 4, whiteSpace: "normal" }}>
            <div style={{ fontWeight: 700 }}>{notice.title}</div>
            <div style={{ color: theme.textMuted, fontSize: 11.5 }}>
              {notice.body}
            </div>
          </div>
        ),
      },
      {
        h: copy.severity,
        w: 120,
        r: (notice) => (
          <CanvasPill
            theme={theme}
            tone={
              notice.severity === "critical" ||
              notice.severity === "maintenance"
                ? "danger"
                : notice.severity === "warning"
                  ? "warn"
                  : "info"
            }
          >
            {formatPlatformCodeLabel(locale, notice.severity)}
          </CanvasPill>
        ),
      },
      {
        h: copy.targets,
        w: 220,
        r: (notice) => (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(notice.deliverySummary?.targets ?? []).map((target: string) => (
              <CanvasPill key={target} theme={theme} tone="neutral">
                {target}
              </CanvasPill>
            ))}
          </div>
        ),
      },
      {
        h: copy.delivery,
        w: 160,
        r: (notice) => (
          <div style={{ display: "grid", gap: 6 }}>
            <CanvasPill theme={theme} tone="info">
              {getDeliveryLabel(copy, notice.deliverySummary?.state)}
            </CanvasPill>
            <span style={{ color: theme.textMuted }}>
              {notice.deliverySummary?.deliveredCount ?? 0} /{" "}
              {notice.deliverySummary?.totalCount ?? 0}
            </span>
          </div>
        ),
      },
      {
        h: copy.broadcastAt,
        w: 170,
        r: (notice) =>
          formatDateTime(
            notice.deliverySummary?.broadcastAt ?? notice.updatedAt,
          ),
      },
      {
        h: copy.links,
        w: 220,
        r: (notice) => renderLinkSet(notice.crossAppLinks),
      },
    ];

    if (requestedEmptyReason) {
      return renderEmptyState(requestedEmptyReason);
    }
    if (error) {
      return renderEmptyState("fetch_failed");
    }
    if (filteredHistoryRows.length === 0) {
      const fallback =
        historyRows.length === 0 ? "not_provisioned" : "filtered_empty";
      return renderEmptyState(
        normalizeSupportedEmptyReason(
          historyRows.length === 0
            ? noticesEmptyState?.reason
            : "filtered_empty",
          fallback,
        ),
        noticesEmptyState,
      );
    }

    return (
      <CanvasCard
        theme={theme}
        title={copy.historyTableTitle}
        subtitle={copy.historyTableHint}
        style={{ overflowX: "auto" }}
      >
        <p style={{ ...sectionHintStyle, marginTop: 0, marginBottom: 12 }}>
          {copy.readOnlyHistory}
        </p>
        <div
          style={{
            ...splitGridStyle,
            gridTemplateColumns: "minmax(0, 220px) minmax(0, 1fr)",
          }}
        >
          <CanvasField theme={theme} label={copy.historyFilter}>
            <select
              value={historyFilter}
              onChange={(event) =>
                setHistoryFilter(event.target.value as HistoryFilter)
              }
              style={inputStyle(theme)}
            >
              <option value="all">{copy.allFilter}</option>
              <option value="delivered">delivered</option>
              <option value="delivering">delivering</option>
              <option value="pending">pending</option>
            </select>
          </CanvasField>
          <div />
        </div>
        <CanvasTable
          theme={theme}
          columns={historyColumns}
          rows={toNoticeTableRows(filteredHistoryRows)}
        />
      </CanvasCard>
    );
  }

  if (loading && notices.length === 0 && !maintenance) {
    return <div className="admin-empty">{copy.loading}...</div>;
  }

  return (
    <CanvasShell
      theme={theme}
      nav={navItems}
      active="notices"
      currentPath="/notices"
      breadcrumb={[locale === "zh" ? "平台層" : "Platform Layer", copy.title]}
      searchPlaceholder={
        locale === "zh"
          ? "搜尋公告、租戶、route…"
          : "Search notices, tenants, routes…"
      }
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
            {activeTab === "notices" && createNoticeAction ? (
              <CanvasBtn
                theme={theme}
                variant={showCreate ? "secondary" : "primary"}
                icon={showCreate ? "x" : "plus"}
                disabled={!createNoticeAction.enabled}
                onClick={() => setShowCreate((current) => !current)}
              >
                {showCreate ? copy.closeComposer : copy.createNotice}
              </CanvasBtn>
            ) : null}
            {activeTab === "maint" && maintenanceAction ? (
              <CanvasBtn
                theme={theme}
                variant="primary"
                danger={maintenanceAction.action === "clear_maintenance_mode"}
                disabled={savingMaintenance || !maintenanceAction.enabled}
                onClick={() => void handleSaveMaintenance()}
              >
                {savingMaintenance
                  ? copy.savingMaintenance
                  : maintenanceAction.action === "clear_maintenance_mode"
                    ? copy.clearAction
                    : copy.saveMaintenance}
              </CanvasBtn>
            ) : null}
            <CanvasBtn
              theme={theme}
              icon="refresh"
              onClick={() => void loadData()}
            >
              {copy.refresh}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageStackStyle}>
        <div style={kpiGridStyle}>
          <MetricCard
            label={copy.activeNoticeCount}
            value={activeNoticeCount}
            tone={locale === "zh" ? "進行中" : "Active"}
          />
          <MetricCard
            label={copy.scheduledNoticeCount}
            value={scheduledNoticeCount}
            tone={locale === "zh" ? "待發布" : "Scheduled"}
          />
          <MetricCard
            label={copy.inflightBroadcastCount}
            value={inflightBroadcastCount}
            tone={locale === "zh" ? "傳播中" : "In flight"}
          />
        </div>

        <div style={splitGridStyle}>
          <CanvasCard
            theme={theme}
            title={copy.routeMapTitle}
            subtitle={copy.routeMapBody}
          >
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {TAB_PARAM_VALUES.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => updateTab(tab)}
                  style={{
                    border: `1px solid ${activeTab === tab ? theme.accentBorder : theme.border}`,
                    background:
                      activeTab === tab ? theme.accentBg : theme.surface,
                    color: activeTab === tab ? theme.accent : theme.text,
                    borderRadius: 8,
                    padding: "10px 12px",
                    cursor: "pointer",
                    textAlign: "left",
                    minWidth: 180,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: theme.textMuted,
                      marginBottom: 6,
                    }}
                  >
                    /notices
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{copy.tabs[tab]}</div>
                    <CanvasPill theme={theme} tone="neutral">
                      {getTabBadge(tab)}
                    </CanvasPill>
                  </div>
                  <div
                    style={{
                      color: theme.textMuted,
                      fontSize: 11.5,
                      marginTop: 6,
                    }}
                  >
                    {tab === "notices"
                      ? copy.noticesTableHint
                      : tab === "maint"
                        ? copy.maintenanceHint
                        : copy.historyTableHint}
                  </div>
                </button>
              ))}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={copy.downstreamTitle}
            subtitle={copy.downstreamBody}
          >
            <CanvasDL
              theme={theme}
              cols={1}
              items={[
                { label: copy.refreshTier, value: copy.refreshDetail },
                {
                  label: copy.lastRefresh,
                  value: lastRefreshAt ? formatDateTime(lastRefreshAt) : "—",
                  mono: true,
                },
                {
                  label: copy.currentPolicy,
                  value: maintenance?.enabled
                    ? copy.maintenanceOn
                    : copy.maintenanceOff,
                },
              ]}
            />
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <div>
                <div style={metaLabelStyle}>{copy.noticeSummary}</div>
                <div style={{ marginTop: 8 }}>{renderLinkSet(noticeLinks)}</div>
              </div>
              <div>
                <div style={metaLabelStyle}>{copy.historyTableTitle}</div>
                <div style={{ marginTop: 8 }}>
                  {renderLinkSet(historyLinks)}
                </div>
              </div>
            </div>
          </CanvasCard>
        </div>

        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={locale === "zh" ? "讀取失敗" : "Load failed"}
            body={error}
          />
        ) : null}

        {maintenance?.enabled ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={copy.activeBanner}
            body={`${maintenance.reason || copy.maintenanceOn} · ${formatWindow(
              maintenance.scheduledStart,
              maintenance.scheduledEnd,
              copy.noWindow,
            )}`}
          />
        ) : null}

        <CanvasCard theme={theme} padding={14}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                gap: 8,
                flexWrap: "wrap",
                background: theme.surfaceLo,
                borderRadius: 999,
                padding: 6,
              }}
            >
              {TAB_PARAM_VALUES.map((tab) => (
                <CanvasBtn
                  key={tab}
                  theme={theme}
                  variant={activeTab === tab ? "primary" : "ghost"}
                  onClick={() => updateTab(tab)}
                >
                  {copy.tabs[tab]} ({getTabBadge(tab)})
                </CanvasBtn>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <CanvasPill theme={theme} tone="neutral">
                {copy.refreshTier}
              </CanvasPill>
              <CanvasPill theme={theme} tone="neutral">
                {copy.lastRefresh}:{" "}
                {lastRefreshAt ? formatDateTime(lastRefreshAt) : "—"}
              </CanvasPill>
            </div>
          </div>
        </CanvasCard>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {currentTabActions.length > 0 ? (
            currentTabActions.map((action) => (
              <ActionMeta
                key={`${activeTab}-${action.action}`}
                locale={locale}
                action={action}
                {...(activeTab === "maint"
                  ? {
                      label:
                        action.action === "clear_maintenance_mode"
                          ? copy.clearAction
                          : copy.setAction,
                    }
                  : {})}
              />
            ))
          ) : (
            <span className="admin-badge admin-badge--neutral">
              {copy.readOnly}
            </span>
          )}
        </div>

        {activeTab === "notices" && showCreate && createNoticeAction ? (
          <div
            className="admin-card"
            style={{
              marginBottom: 0,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.1fr) minmax(280px, 0.9fr)",
              gap: 18,
              background:
                "linear-gradient(180deg, rgba(15,118,110,0.08), rgba(255,255,255,0.96) 48%)",
            }}
          >
            <form onSubmit={handleCreateNotice}>
              <h3 style={{ margin: "0 0 10px", fontSize: 22 }}>
                {copy.createPanelTitle}
              </h3>
              <p
                style={{
                  margin: "0 0 18px",
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                {copy.createPanelHint}
              </p>
              <div style={formGridStyle}>
                <label style={fieldGroupStyle}>
                  <span style={fieldLabelStyle}>{copy.titleField}</span>
                  <input
                    value={formTitle}
                    onChange={(event) => setFormTitle(event.target.value)}
                    style={fieldStyle}
                    placeholder={copy.titleField}
                    required
                  />
                </label>
                <label style={fieldGroupStyle}>
                  <span style={fieldLabelStyle}>{copy.audienceField}</span>
                  <select
                    value={formAudience}
                    onChange={(event) =>
                      setFormAudience(event.target.value as Audience)
                    }
                    style={fieldStyle}
                  >
                    <option value="all">{copy.audienceLabel.all}</option>
                    <option value="tenants">
                      {copy.audienceLabel.tenants}
                    </option>
                    <option value="ops">{copy.audienceLabel.ops}</option>
                    <option value="drivers">
                      {copy.audienceLabel.drivers}
                    </option>
                  </select>
                </label>
                <label style={{ ...fieldGroupStyle, gridColumn: "1 / -1" }}>
                  <span style={fieldLabelStyle}>{copy.bodyField}</span>
                  <textarea
                    value={formBody}
                    onChange={(event) => setFormBody(event.target.value)}
                    style={{
                      ...fieldStyle,
                      minHeight: 120,
                      resize: "vertical",
                    }}
                    placeholder={copy.bodyField}
                    required
                  />
                </label>
                <label style={fieldGroupStyle}>
                  <span style={fieldLabelStyle}>{copy.severityField}</span>
                  <select
                    value={formSeverity}
                    onChange={(event) =>
                      setFormSeverity(
                        event.target.value as PlatformNoticeSeverity,
                      )
                    }
                    style={fieldStyle}
                  >
                    {NOTICE_FORM_SEVERITIES.map((severity) => (
                      <option key={severity} value={severity}>
                        {formatPlatformCodeLabel(locale, severity)}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={fieldGroupStyle}>
                  <span style={fieldLabelStyle}>{copy.scheduleStartField}</span>
                  <input
                    value={formScheduledAt}
                    onChange={(event) => setFormScheduledAt(event.target.value)}
                    style={fieldStyle}
                    placeholder="2026-05-27T02:00:00Z"
                  />
                </label>
                <label style={{ ...fieldGroupStyle, gridColumn: "1 / -1" }}>
                  <span style={fieldLabelStyle}>{copy.reasonField}</span>
                  <input
                    value={formReason}
                    onChange={(event) => setFormReason(event.target.value)}
                    style={fieldStyle}
                    placeholder={copy.reasonField}
                    required={isNoticeReasonRequired(formSeverity)}
                  />
                </label>
              </div>
              <button
                type="submit"
                className="admin-btn admin-btn--primary"
                disabled={
                  creating ||
                  !canSubmitNoticeForm({
                    title: formTitle,
                    body: formBody,
                    severity: formSeverity,
                    reason: formReason,
                  })
                }
              >
                {creating ? copy.publishing : copy.publish}
              </button>
            </form>

            <div
              style={{
                borderRadius: 22,
                padding: 22,
                background:
                  formSeverity === "critical" || formSeverity === "maintenance"
                    ? "linear-gradient(155deg, rgba(127,29,29,0.98), rgba(239,68,68,0.84))"
                    : "linear-gradient(155deg, rgba(15,23,42,0.96), rgba(51,65,85,0.86))",
                color: "#fff",
              }}
            >
              <span
                className="admin-badge"
                style={{ background: "rgba(255,255,255,0.16)", color: "#fff" }}
              >
                {formatPlatformCodeLabel(locale, formSeverity)}
              </span>
              <div
                style={{ fontSize: 26, fontWeight: 800, margin: "14px 0 8px" }}
              >
                {formTitle || copy.createNotice}
              </div>
              <p style={{ color: "rgba(255,255,255,0.86)", lineHeight: 1.7 }}>
                {formBody || copy.maintenancePreviewBody}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 12,
                }}
              >
                {isNoticeReasonRequired(formSeverity) ? (
                  <span
                    className="admin-badge"
                    style={{
                      background: "rgba(255,255,255,0.16)",
                      color: "#fff",
                    }}
                  >
                    {copy.reasonRequired}
                  </span>
                ) : null}
                <span
                  className="admin-badge"
                  style={{
                    background: "rgba(255,255,255,0.16)",
                    color: "#fff",
                  }}
                >
                  {copy.audienceField}: {copy.audienceLabel[formAudience]}
                </span>
                {formScheduledAt ? (
                  <span
                    className="admin-badge"
                    style={{
                      background: "rgba(255,255,255,0.16)",
                      color: "#fff",
                    }}
                  >
                    {copy.scheduleStartField}: {formScheduledAt}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "notices" ? renderNoticesTab() : null}
        {activeTab === "maint" ? renderMaintenanceTab() : null}
        {activeTab === "history" ? renderHistoryTab() : null}
      </div>
    </CanvasShell>
  );
}

const fieldGroupStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#475569",
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 12,
  padding: "11px 12px",
  fontSize: 14,
  background: "rgba(255,255,255,0.92)",
  color: "#0f172a",
};

const fieldBoxStyle: React.CSSProperties = {
  minHeight: 48,
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 12,
  padding: "10px 12px",
  background: "rgba(255,255,255,0.92)",
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
  marginBottom: 18,
};

const metaLabelStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#64748b",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 16,
};

const sectionHintStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#64748b",
};

const clampedBodyStyle: React.CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  lineHeight: 1.6,
};

const maintenanceGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
  marginBottom: 16,
};

const maintenanceMetaRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
  marginBottom: 16,
};

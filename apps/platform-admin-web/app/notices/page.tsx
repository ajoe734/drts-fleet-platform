"use client";

import React, { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
import type {
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  PlatformMaintenanceModeRecord,
  PlatformNoticeRecord,
  PlatformNoticeSeverity,
  ResourceActionDescriptor,
} from "@drts/contracts";

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

function getSeverityTone(severity: PlatformNoticeSeverity) {
  if (severity === "critical" || severity === "maintenance") {
    return "admin-badge--danger";
  }
  if (severity === "warning") {
    return "admin-badge--warning";
  }
  return "admin-badge--info";
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

function getCrossAppHref(link: CrossAppResourceLink): string {
  const baseMap: Record<CrossAppResourceLink["targetApp"], string> = {
    "ops-console": process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "",
    "platform-admin": process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "",
    "tenant-console": process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "",
  };
  const base = baseMap[link.targetApp];
  if (!base) {
    return link.route;
  }
  return `${base.replace(/\/$/, "")}${link.route.startsWith("/") ? "" : "/"}${link.route}`;
}

function getActionLabel(
  locale: string,
  action: ResourceActionDescriptor["action"],
) {
  const labels: Record<string, { en: string; zh: string }> = {
    resolve_notice: { en: "Resolve notice", zh: "結束公告" },
    view_broadcast_history: {
      en: "View broadcast history",
      zh: "查看廣播歷史",
    },
    set_maintenance_mode: { en: "Set maintenance mode", zh: "啟用維護模式" },
    clear_maintenance_mode: {
      en: "Clear maintenance mode",
      zh: "解除維護模式",
    },
  };
  return labels[action]?.[locale === "zh" ? "zh" : "en"] ?? action;
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
    <div
      className="admin-card"
      style={{
        marginBottom: 0,
        background: `linear-gradient(180deg, ${tone}, rgba(255,255,255,0.96))`,
        borderColor: "rgba(15, 23, 42, 0.07)",
      }}
    >
      <div style={metaLabelStyle}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, marginTop: 8 }}>{value}</div>
    </div>
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
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <span className={`admin-badge ${getRiskTone(action.riskLevel)}`}>
        {label ?? getActionLabel(locale, action.action)}
      </span>
      <span className="admin-badge admin-badge--neutral">
        {formatPlatformCodeLabel(locale, action.riskLevel)}
      </span>
      {action.requiresReason ? (
        <span className="admin-badge admin-badge--neutral">
          {locale === "zh" ? "需填原因" : "Reason required"}
        </span>
      ) : null}
      {!action.enabled && action.disabledReasonCode ? (
        <span className="admin-badge admin-badge--neutral">
          {formatPlatformCodeLabel(locale, action.disabledReasonCode)}
        </span>
      ) : null}
    </div>
  );
}

function EmptyStateCard({
  locale,
  reason,
  messageCode,
  nextAction,
}: {
  locale: Locale;
  reason: SupportedEmptyReason;
  messageCode?: string;
  nextAction?: ResourceActionDescriptor;
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
  const style = styleMap[reason] ?? styleMap.no_data;

  return (
    <div
      className="admin-card"
      style={{
        marginBottom: 0,
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
          <div
            style={{
              display: "inline-flex",
              padding: "5px 10px",
              borderRadius: 999,
              background: style.glow,
              color: style.accent,
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            {reason}
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
            <ActionMeta locale={locale} action={nextAction} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function NoticesPage() {
  const client = usePlatformAdminClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locale } = useTranslation();
  const copy = getCopy(locale);

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
  const [maintReason, setMaintReason] = useState("");
  const [maintScheduledStart, setMaintScheduledStart] = useState("");
  const [maintScheduledEnd, setMaintScheduledEnd] = useState("");

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
      setMaintEnabled(Boolean(maintenanceData.item?.enabled));
      setMaintReason(maintenanceData.item?.reason ?? "");
      setMaintScheduledStart(maintenanceData.item?.scheduledStart ?? "");
      setMaintScheduledEnd(maintenanceData.item?.scheduledEnd ?? "");
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
  const maintenanceAction = normalizeMaintenanceActions(maintenance)[0];

  const updateTab = useCallback(
    (nextTab: NoticeTab) => {
      setActiveTab(nextTab);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", nextTab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  async function handleCreateNotice(event: React.FormEvent) {
    event.preventDefault();
    if (
      (formSeverity === "critical" || formSeverity === "maintenance") &&
      !formReason.trim()
    ) {
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
    if (maintenanceAction?.requiresReason && !maintReason.trim()) {
      setError(copy.maintenanceRequiredReason);
      return;
    }

    setSavingMaintenance(true);
    setError(null);
    try {
      await client.setMaintenanceMode({
        enabled: maintEnabled,
        reason: maintReason.trim() || null,
        scheduledStart: maintScheduledStart || null,
        scheduledEnd: maintScheduledEnd || null,
      });
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

  function renderLinkSet(links?: CrossAppResourceLink[]) {
    if (!links?.length) {
      return <span style={{ color: "#64748b" }}>{copy.noLinks}</span>;
    }
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {links.map((link) => (
          <a
            key={`${link.targetApp}-${link.route}`}
            href={getCrossAppHref(link)}
            target={link.openMode === "new_tab" ? "_blank" : "_self"}
            rel="noreferrer"
            className="admin-btn admin-btn--secondary admin-btn--sm"
            style={{ textDecoration: "none" }}
          >
            {copy.openLink} {link.label}
            {link.openMode === "new_tab" ? ` · ${copy.newTab}` : ""}
          </a>
        ))}
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
      />
    );
  }

  function renderNoticeActions(notice: NoticeRecord) {
    const actions = normalizeNoticeActions(notice);
    if (!actions.length) {
      return <span style={{ color: "#64748b" }}>{copy.noDataFallback}</span>;
    }

    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {actions.map((action) => {
          if (action.action === "resolve_notice") {
            return (
              <button
                key={action.action}
                type="button"
                className="admin-btn admin-btn--secondary admin-btn--sm"
                disabled={!action.enabled}
                title={action.disabledReasonCode ?? copy.actionUnavailable}
                onClick={() => void handleResolveNotice(notice.noticeId)}
              >
                {copy.resolve}
              </button>
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
      <div
        className="admin-card"
        style={{ marginBottom: 0, overflowX: "auto" }}
      >
        <div style={sectionHeaderStyle}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {copy.noticesTableTitle}
            </div>
            <p style={sectionHintStyle}>{copy.noticesTableHint}</p>
          </div>
          <label style={{ ...fieldGroupStyle, minWidth: 180 }}>
            <span style={fieldLabelStyle}>{copy.statusFilter}</span>
            <select
              value={noticeFilter}
              onChange={(event) =>
                setNoticeFilter(event.target.value as NoticeFilter)
              }
              style={fieldStyle}
            >
              <option value="all">{copy.allFilter}</option>
              <option value="active">active</option>
              <option value="scheduled">scheduled</option>
              <option value="resolved">resolved</option>
            </select>
          </label>
        </div>
        <table className="admin-table" style={{ minWidth: 1180 }}>
          <thead>
            <tr>
              <th>{copy.noticeId}</th>
              <th>{copy.noticeTitle}</th>
              <th>{copy.noticeBody}</th>
              <th>{copy.severity}</th>
              <th>{copy.audience}</th>
              <th>{copy.status}</th>
              <th>{copy.updated}</th>
              <th>{copy.links}</th>
              <th>{copy.actions}</th>
            </tr>
          </thead>
          <tbody>
            {activeNotices.map((notice) => (
              <tr key={notice.noticeId}>
                <td style={monoTextStyle}>{notice.noticeId}</td>
                <td>
                  <div style={{ fontWeight: 700 }}>{notice.title}</div>
                  {notice.changeReason ? (
                    <div style={{ color: "#64748b", marginTop: 4 }}>
                      {copy.changeReason}: {notice.changeReason}
                    </div>
                  ) : null}
                </td>
                <td style={{ maxWidth: 280 }}>
                  <div style={clampedBodyStyle}>{notice.body}</div>
                  <div style={{ color: "#64748b", marginTop: 6 }}>
                    {copy.createdAt}: {formatDateTime(notice.createdAt)}
                  </div>
                </td>
                <td>
                  <span
                    className={`admin-badge ${getSeverityTone(notice.severity)}`}
                  >
                    {formatPlatformCodeLabel(locale, notice.severity)}
                  </span>
                </td>
                <td>
                  <span className="admin-badge admin-badge--neutral">
                    {copy.audienceLabel[notice.targetAudience as Audience]}
                  </span>
                </td>
                <td>
                  <div style={{ display: "grid", gap: 6 }}>
                    <span
                      className={`admin-badge ${getStatusTone(notice.status)}`}
                    >
                      {formatPlatformCodeLabel(locale, notice.status)}
                    </span>
                    {notice.deliverySummary?.state ? (
                      <span
                        className={`admin-badge ${getStatusTone(notice.deliverySummary.state)}`}
                      >
                        {getDeliveryLabel(copy, notice.deliverySummary.state)}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td style={monoTextStyle}>
                  {formatDateTime(notice.updatedAt)}
                </td>
                <td>{renderLinkSet(notice.crossAppLinks)}</td>
                <td>{renderNoticeActions(notice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
                  onChange={(event) => setMaintEnabled(event.target.checked)}
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
                value={maintReason}
                onChange={(event) => setMaintReason(event.target.value)}
                style={fieldStyle}
                placeholder={copy.reasonField}
              />
            </label>
            <label style={fieldGroupStyle}>
              <span style={fieldLabelStyle}>{copy.scheduleStartField}</span>
              <input
                value={maintScheduledStart}
                onChange={(event) => setMaintScheduledStart(event.target.value)}
                style={fieldStyle}
                placeholder="2026-05-27T02:00:00Z"
              />
            </label>
            <label style={fieldGroupStyle}>
              <span style={fieldLabelStyle}>{copy.scheduleEndField}</span>
              <input
                value={maintScheduledEnd}
                onChange={(event) => setMaintScheduledEnd(event.target.value)}
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
                {maintReason || maintenance.reason || copy.maintenanceOn}
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
      <div
        className="admin-card"
        style={{ marginBottom: 0, overflowX: "auto" }}
      >
        <div style={sectionHeaderStyle}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {copy.historyTableTitle}
            </div>
            <p style={sectionHintStyle}>{copy.historyTableHint}</p>
          </div>
          <label style={{ ...fieldGroupStyle, minWidth: 180 }}>
            <span style={fieldLabelStyle}>{copy.historyFilter}</span>
            <select
              value={historyFilter}
              onChange={(event) =>
                setHistoryFilter(event.target.value as HistoryFilter)
              }
              style={fieldStyle}
            >
              <option value="all">{copy.allFilter}</option>
              <option value="delivered">delivered</option>
              <option value="delivering">delivering</option>
              <option value="pending">pending</option>
            </select>
          </label>
        </div>
        <table className="admin-table" style={{ minWidth: 1120 }}>
          <thead>
            <tr>
              <th>{copy.noticeId}</th>
              <th>{copy.noticeTitle}</th>
              <th>{copy.severity}</th>
              <th>{copy.targets}</th>
              <th>{copy.delivery}</th>
              <th>{copy.broadcastAt}</th>
              <th>{copy.links}</th>
            </tr>
          </thead>
          <tbody>
            {filteredHistoryRows.map((notice) => (
              <tr key={`${notice.noticeId}-history`}>
                <td style={monoTextStyle}>{notice.noticeId}</td>
                <td>
                  <div style={{ fontWeight: 700 }}>{notice.title}</div>
                  <div style={{ color: "#64748b", marginTop: 4 }}>
                    {notice.body}
                  </div>
                </td>
                <td>
                  <span
                    className={`admin-badge ${getSeverityTone(notice.severity)}`}
                  >
                    {formatPlatformCodeLabel(locale, notice.severity)}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(notice.deliverySummary?.targets ?? []).map(
                      (target: string) => (
                        <span
                          key={target}
                          className="admin-badge admin-badge--neutral"
                          style={{ textTransform: "none" }}
                        >
                          {target}
                        </span>
                      ),
                    )}
                  </div>
                </td>
                <td>
                  <div style={{ display: "grid", gap: 6 }}>
                    <span
                      className={`admin-badge ${getStatusTone(
                        notice.deliverySummary?.state ?? "pending",
                      )}`}
                    >
                      {getDeliveryLabel(copy, notice.deliverySummary?.state)}
                    </span>
                    <span style={{ color: "#64748b" }}>
                      {notice.deliverySummary?.deliveredCount ?? 0} /{" "}
                      {notice.deliverySummary?.totalCount ?? 0}
                    </span>
                  </div>
                </td>
                <td style={monoTextStyle}>
                  {formatDateTime(
                    notice.deliverySummary?.broadcastAt ?? notice.updatedAt,
                  )}
                </td>
                <td>{renderLinkSet(notice.crossAppLinks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (loading && notices.length === 0 && !maintenance) {
    return <div className="admin-empty">{copy.loading}...</div>;
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div
        className="admin-card"
        style={{
          marginBottom: 0,
          padding: 0,
          overflow: "hidden",
          borderColor: "rgba(79,70,229,0.16)",
          background:
            "linear-gradient(140deg, rgba(15,23,42,0.98), rgba(30,41,59,0.95) 46%, rgba(99,102,241,0.86))",
          color: "#fff",
        }}
      >
        <div style={{ padding: 28 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div className="admin-page-header" style={{ marginBottom: 0 }}>
              <h1 style={{ color: "#fff" }}>{copy.title}</h1>
              <p style={{ color: "rgba(255,255,255,0.78)", maxWidth: 780 }}>
                {copy.subtitle}
              </p>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <span
                className="admin-badge"
                style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
              >
                {copy.refreshTier}
              </span>
              <span
                className="admin-badge"
                style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
              >
                {copy.lastRefresh}:{" "}
                {lastRefreshAt ? formatDateTime(lastRefreshAt) : "—"}
              </span>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.6fr) minmax(260px, 0.9fr)",
              gap: 16,
              alignItems: "end",
              marginTop: 22,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 14,
              }}
            >
              <MetricCard
                label={copy.activeNoticeCount}
                value={activeNoticeCount}
                tone="rgba(15,118,110,0.12)"
              />
              <MetricCard
                label={copy.scheduledNoticeCount}
                value={scheduledNoticeCount}
                tone="rgba(245,158,11,0.12)"
              />
              <MetricCard
                label={copy.inflightBroadcastCount}
                value={inflightBroadcastCount}
                tone="rgba(30,64,175,0.12)"
              />
            </div>
            <div
              style={{
                borderRadius: 18,
                padding: 18,
                background: "rgba(255,255,255,0.08)",
                backdropFilter: "blur(10px)",
              }}
            >
              <div
                style={{ fontSize: 12, letterSpacing: "0.08em", opacity: 0.72 }}
              >
                {copy.currentPolicy}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>
                {maintenance?.enabled
                  ? copy.maintenanceOn
                  : copy.maintenanceOff}
              </div>
              <div style={{ marginTop: 8, color: "rgba(255,255,255,0.78)" }}>
                {copy.refreshDetail}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div
          className="admin-card"
          style={{
            marginBottom: 0,
            borderColor: "rgba(239,68,68,0.28)",
            background: "rgba(254,242,242,0.96)",
          }}
        >
          <p style={{ margin: 0, color: "#991b1b" }}>{error}</p>
        </div>
      ) : null}

      {maintenance?.enabled ? (
        <div
          className="admin-card"
          style={{
            marginBottom: 0,
            borderColor: "rgba(127,29,29,0.14)",
            background:
              "linear-gradient(135deg, rgba(127,29,29,0.96), rgba(220,38,38,0.84))",
            color: "#fff",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                className="admin-badge"
                style={{ background: "rgba(255,255,255,0.16)", color: "#fff" }}
              >
                {copy.activeBanner}
              </span>
              <span>{maintenance.reason || copy.maintenanceOn}</span>
            </div>
            <span style={{ color: "rgba(255,255,255,0.82)" }}>
              {formatWindow(
                maintenance.scheduledStart,
                maintenance.scheduledEnd,
                copy.noWindow,
              )}
            </span>
          </div>
        </div>
      ) : null}

      <div
        className="admin-card"
        style={{
          marginBottom: 0,
          padding: 14,
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
            background: "rgba(15,23,42,0.04)",
            borderRadius: 999,
            padding: 6,
          }}
        >
          {TAB_PARAM_VALUES.map((tab) => (
            <button
              key={tab}
              type="button"
              className="admin-btn"
              onClick={() => updateTab(tab)}
              style={{
                background:
                  activeTab === tab
                    ? "linear-gradient(135deg, #0f172a, #334155)"
                    : "transparent",
                color: activeTab === tab ? "#fff" : "#0f172a",
                borderRadius: 999,
                padding: "9px 16px",
              }}
            >
              {copy.tabs[tab]}
              {tab === "notices" ? ` (${notices.length})` : ""}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {activeTab === "notices" ? (
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={() => setShowCreate((current) => !current)}
            >
              {showCreate ? copy.closeComposer : copy.createNotice}
            </button>
          ) : null}
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={() => void loadData()}
          >
            {copy.refresh}
          </button>
        </div>
      </div>

      {activeTab === "notices" && showCreate ? (
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
              style={{ margin: "0 0 18px", color: "#64748b", lineHeight: 1.6 }}
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
                  <option value="tenants">{copy.audienceLabel.tenants}</option>
                  <option value="ops">{copy.audienceLabel.ops}</option>
                  <option value="drivers">{copy.audienceLabel.drivers}</option>
                </select>
              </label>
              <label style={{ ...fieldGroupStyle, gridColumn: "1 / -1" }}>
                <span style={fieldLabelStyle}>{copy.bodyField}</span>
                <textarea
                  value={formBody}
                  onChange={(event) => setFormBody(event.target.value)}
                  style={{ ...fieldStyle, minHeight: 120, resize: "vertical" }}
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
                />
              </label>
            </div>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={creating || !formTitle.trim() || !formBody.trim()}
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
              <span
                className="admin-badge"
                style={{ background: "rgba(255,255,255,0.16)", color: "#fff" }}
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

const monoTextStyle: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", "SFMono-Regular", monospace',
  fontSize: 12,
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

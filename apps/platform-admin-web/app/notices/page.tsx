"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
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
type SupportedEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

const EMPTY_REASON_PARAM_VALUES: SupportedEmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];
const NOTICE_FORM_SEVERITIES: PlatformNoticeSeverity[] = [
  "info",
  "warning",
  "critical",
  "maintenance",
];

type NoticeTab = "notices" | "maint" | "history";
type Audience = "all" | "tenants" | "ops" | "drivers";
type HistoryFilter = "all" | "delivered" | "delivering" | "pending";
type NoticeFilter = "all" | "active" | "scheduled" | "resolved";

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
          "高風險公告會跨 app 廣播到 ops / tenant / driver；Maintenance Mode 與 Broadcast History 共用同一路由。",
        refreshTier: "Refresh tier T4",
        refreshDetail: "每 30 秒自動刷新，保留手動刷新。",
        lastRefresh: "最後刷新",
        tabs: {
          notices: "Notices",
          maint: "Maintenance Mode",
          history: "Broadcast History",
        },
        createNotice: "建立公告",
        closeComposer: "收起編輯器",
        createPanelTitle: "新公告與 cross-app banner",
        createPanelHint:
          "critical / maintenance 屬高風險操作，需填原因，並會向下游 app 發送 banner。",
        titleField: "標題",
        bodyField: "內容",
        severityField: "嚴重程度",
        audienceField: "對象",
        reasonField: "原因 / 稽核備註",
        scheduleStartField: "預定起始",
        scheduleEndField: "預定結束",
        publish: "發布公告",
        publishing: "發布中...",
        noticesCardTitle: "公告清單",
        statusFilter: "狀態篩選",
        maintenanceTitle: "維護模式狀態",
        maintenanceHint:
          "啟用後會停止 dispatch、partner ingress 與 webhook delivery；應先建立 maintenance severity 公告。",
        maintenancePreviewTitle: "跨 app banner 預覽",
        maintenancePreviewBody:
          "下游體驗會看到相同的標題、原因與受影響服務摘要。",
        historyTitle: "Broadcast history",
        historyFilter: "投遞狀態",
        targets: "目標對象",
        delivery: "投遞結果",
        links: "Cross-app deep links",
        openLink: "開啟",
        refresh: "刷新",
        saveMaintenance: "保存維護設定",
        savingMaintenance: "保存中...",
        resolve: "Resolve",
        affectedServices: "受影響服務",
        currentState: "目前狀態",
        updatedAt: "更新時間",
        createdAt: "建立時間",
        updatedBy: "更新者",
        createdBy: "建立者",
        changeReason: "變更原因",
        reasonRequired: "critical / maintenance 公告需填原因。",
        maintenanceRequiredReason: "設定或清除 maintenance mode 必須填原因。",
        enabled: "Enabled",
        disabled: "Disabled",
        activeBanner: "MAINTENANCE ACTIVE",
        maintenanceOn: "維護模式開啟",
        maintenanceOff: "維護模式關閉",
        scheduledWindow: "Scheduled Window",
        noWindow: "未設定時間窗",
        noticeSummary: "公告概況",
        activeNoticeCount: "進行中公告",
        scheduledNoticeCount: "待發布公告",
        inflightBroadcastCount: "傳播中 broadcast",
        currentPolicy: "目前策略",
        affectedApps: "影響 app",
        permissionsTitle: "Authority",
        permissionsBody:
          "按鈕與風險級別由 availableActions 驅動，不寫死角色矩陣。",
        historyEmpty: "尚無可顯示的廣播紀錄。",
        noticeEmptyHint: "可加上 `?emptyReason=` 驗證六種空狀態。",
        audiencesLabel: "受眾",
        statusLabel: "狀態",
        riskLabel: "風險",
        noLinks: "無 deep link",
        loading: "載入中",
        newTab: "新分頁",
        actionUnavailable: "目前不可執行",
        clearAction: "Clear maintenance mode",
        setAction: "Set maintenance mode",
        deliveryPending: "等待傳播",
        deliveryPropagating: "傳播中",
        deliveryDone: "已完成傳播",
        audience: {
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
          "High-risk notices broadcast cross-app banners to ops, tenant, and driver experiences; Maintenance Mode and Broadcast History share the same route.",
        refreshTier: "Refresh tier T4",
        refreshDetail:
          "Auto refresh every 30s with manual refresh kept visible.",
        lastRefresh: "Last refresh",
        tabs: {
          notices: "Notices",
          maint: "Maintenance Mode",
          history: "Broadcast History",
        },
        createNotice: "Create notice",
        closeComposer: "Close composer",
        createPanelTitle: "New notice and cross-app banner",
        createPanelHint:
          "Critical and maintenance notices are high-risk, require a reason, and push banners downstream.",
        titleField: "Title",
        bodyField: "Body",
        severityField: "Severity",
        audienceField: "Audience",
        reasonField: "Reason / audit note",
        scheduleStartField: "Scheduled start",
        scheduleEndField: "Scheduled end",
        publish: "Publish notice",
        publishing: "Publishing...",
        noticesCardTitle: "Notice queue",
        statusFilter: "Status filter",
        maintenanceTitle: "Maintenance mode state",
        maintenanceHint:
          "When enabled, dispatch, partner ingress, and webhook delivery pause. Publish a maintenance severity notice first.",
        maintenancePreviewTitle: "Cross-app banner preview",
        maintenancePreviewBody:
          "Downstream experiences will see the same title, reason, and affected-service summary.",
        historyTitle: "Broadcast history",
        historyFilter: "Delivery filter",
        targets: "Targets",
        delivery: "Delivery",
        links: "Cross-app deep links",
        openLink: "Open",
        refresh: "Refresh",
        saveMaintenance: "Save maintenance settings",
        savingMaintenance: "Saving...",
        resolve: "Resolve",
        affectedServices: "Affected services",
        currentState: "Current state",
        updatedAt: "Updated",
        createdAt: "Created",
        updatedBy: "Updated by",
        createdBy: "Created by",
        changeReason: "Change reason",
        reasonRequired: "Critical and maintenance notices require a reason.",
        maintenanceRequiredReason:
          "Setting or clearing maintenance mode requires a reason.",
        enabled: "Enabled",
        disabled: "Disabled",
        activeBanner: "MAINTENANCE ACTIVE",
        maintenanceOn: "Maintenance mode ON",
        maintenanceOff: "Maintenance mode OFF",
        scheduledWindow: "Scheduled Window",
        noWindow: "No scheduled window",
        noticeSummary: "Notice summary",
        activeNoticeCount: "Active notices",
        scheduledNoticeCount: "Scheduled notices",
        inflightBroadcastCount: "Broadcasts in flight",
        currentPolicy: "Current policy",
        affectedApps: "Affected apps",
        permissionsTitle: "Authority",
        permissionsBody:
          "Buttons and risk levels are driven by availableActions, not hard-coded role matrices.",
        historyEmpty: "No broadcast history to show yet.",
        noticeEmptyHint: "Use `?emptyReason=` to verify all six empty states.",
        audiencesLabel: "Audience",
        statusLabel: "Status",
        riskLabel: "Risk",
        noLinks: "No deep links",
        loading: "Loading",
        newTab: "New tab",
        actionUnavailable: "Unavailable right now",
        clearAction: "Clear maintenance mode",
        setAction: "Set maintenance mode",
        deliveryPending: "Pending broadcast",
        deliveryPropagating: "Broadcast propagating",
        deliveryDone: "Broadcast delivered",
        audience: {
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

function normalizeNoticesResponse(raw: NoticesResponse): {
  items: NoticeRecord[];
  emptyState?: EmptyStateEnvelope;
} {
  if (Array.isArray(raw)) {
    return { items: raw };
  }
  return {
    items: raw?.items ?? [],
    emptyState: raw?.emptyState,
  };
}

function normalizeMaintenanceResponse(raw: MaintenanceResponse): {
  item: MaintenanceRecord | null;
  emptyState?: EmptyStateEnvelope;
} {
  if (raw && "enabled" in raw) {
    return { item: raw as MaintenanceRecord };
  }
  return {
    item: raw?.item ?? null,
    emptyState: raw?.emptyState,
  };
}

function normalizeNoticeActions(
  notice: NoticeRecord,
): ResourceActionDescriptor[] {
  if (notice.availableActions?.length) {
    return notice.availableActions;
  }
  return notice.status === "resolved"
    ? [
        {
          action: "view_broadcast_history",
          enabled: true,
          riskLevel: "low",
        },
      ]
    : [
        {
          action: "resolve_notice",
          enabled: true,
          riskLevel: "medium",
        },
        {
          action: "view_broadcast_history",
          enabled: true,
          riskLevel: "low",
        },
      ];
}

function normalizeMaintenanceActions(
  maintenance: MaintenanceRecord | null,
): ResourceActionDescriptor[] {
  if (maintenance?.availableActions?.length) {
    return maintenance.availableActions;
  }
  return [
    {
      action: maintenance?.enabled
        ? "clear_maintenance_mode"
        : "set_maintenance_mode",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    },
  ];
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
  if (status === "critical" || status === "maintenance") {
    return "admin-badge--danger";
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

function getAudienceLabel(
  audienceMap: ReturnType<typeof getCopy>["audience"],
  audience: Audience,
) {
  return audienceMap[audience];
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

function renderActionBadge(action: ResourceActionDescriptor, label: string) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <span className={`admin-badge ${getRiskTone(action.riskLevel)}`}>
        {label}
      </span>
      <span className="admin-badge admin-badge--neutral">
        {action.riskLevel}
      </span>
      {action.requiresReason ? (
        <span className="admin-badge admin-badge--neutral">
          reason required
        </span>
      ) : null}
      {!action.enabled && action.disabledReasonCode ? (
        <span className="admin-badge admin-badge--neutral">
          {action.disabledReasonCode}
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
  locale: string;
  reason: SupportedEmptyReason;
  messageCode?: string;
  nextAction?: ResourceActionDescriptor;
}) {
  const copy = getCopy(locale);
  const emptyMap = copy.empty as unknown as Record<
    SupportedEmptyReason,
    [string, string]
  >;
  const emptyEntry = emptyMap[reason] ?? emptyMap.no_data ?? ["", ""];
  const title = emptyEntry[0];
  const body = emptyEntry[1];
  const styleMap: Record<
    SupportedEmptyReason,
    {
      accent: string;
      glow: string;
      glyph: string;
    }
  > = {
    no_data: { accent: "#0f766e", glow: "rgba(15,118,110,0.15)", glyph: "00" },
    not_provisioned: {
      accent: "#4338ca",
      glow: "rgba(67,56,202,0.14)",
      glyph: "01",
    },
    fetch_failed: {
      accent: "#b91c1c",
      glow: "rgba(185,28,28,0.15)",
      glyph: "02",
    },
    permission_denied: {
      accent: "#7c2d12",
      glow: "rgba(124,45,18,0.15)",
      glyph: "03",
    },
    external_unavailable: {
      accent: "#334155",
      glow: "rgba(51,65,85,0.15)",
      glyph: "04",
    },
    filtered_empty: {
      accent: "#0369a1",
      glow: "rgba(3,105,161,0.15)",
      glyph: "05",
    },
  };
  const style = styleMap[reason]!;

  return (
    <div
      className="admin-card"
      style={{
        padding: 0,
        overflow: "hidden",
        borderColor: style.glow,
        background: `linear-gradient(140deg, ${style.glow}, rgba(255,255,255,0.96) 36%)`,
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
            <div>{renderActionBadge(nextAction, nextAction.action)}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function NoticesPage() {
  const client = usePlatformAdminClient();
  const searchParams = useSearchParams();
  const { locale } = useTranslation();
  const copy = getCopy(locale);
  const [notices, setNotices] = useState<NoticeRecord[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NoticeTab>("notices");
  const [noticeFilter, setNoticeFilter] = useState<NoticeFilter>("all");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);
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
    const timer = window.setInterval(() => {
      void loadData();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadData]);

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
    const action = normalizeMaintenanceActions(maintenance)[0];
    if (action?.requiresReason && !maintReason.trim()) {
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

  const requestedEmptyReason = getRequestedEmptyReason(
    searchParams.get("emptyReason"),
  );
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
  const maintenanceActions = normalizeMaintenanceActions(maintenance);
  const maintenanceAction = maintenanceActions[0];
  const maintenanceLinks = maintenance?.crossAppLinks ?? [];

  function renderNoticeLinks(links?: CrossAppResourceLink[]) {
    if (!links?.length) {
      return <span style={{ color: "#64748b" }}>{copy.noLinks}</span>;
    }
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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

  function renderSummaryCards() {
    const cards = [
      {
        label: copy.activeNoticeCount,
        value: activeNoticeCount,
        tone: "rgba(15,118,110,0.12)",
      },
      {
        label: copy.scheduledNoticeCount,
        value: scheduledNoticeCount,
        tone: "rgba(245,158,11,0.12)",
      },
      {
        label: copy.inflightBroadcastCount,
        value: inflightBroadcastCount,
        tone: "rgba(30,64,175,0.12)",
      },
    ];

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            className="admin-card"
            style={{
              marginBottom: 0,
              background: `linear-gradient(180deg, ${card.tone}, rgba(255,255,255,0.96))`,
              borderColor: "rgba(15, 23, 42, 0.06)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                letterSpacing: "0.06em",
                color: "#64748b",
              }}
            >
              {card.label}
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, marginTop: 8 }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderNoticeRow(notice: NoticeRecord) {
    const actions = normalizeNoticeActions(notice);
    const deliveryState = notice.deliverySummary?.state;

    return (
      <article
        key={notice.noticeId}
        className="admin-card"
        style={{
          marginBottom: 0,
          padding: 24,
          borderColor: "rgba(15, 23, 42, 0.08)",
          background:
            notice.severity === "maintenance"
              ? "linear-gradient(180deg, rgba(127,29,29,0.10), rgba(255,255,255,0.96) 44%)"
              : notice.severity === "critical"
                ? "linear-gradient(180deg, rgba(239,68,68,0.10), rgba(255,255,255,0.96) 44%)"
                : "rgba(255,255,255,0.94)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) minmax(300px, 0.9fr)",
            gap: 22,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              <span
                className={`admin-badge ${getSeverityTone(notice.severity)}`}
              >
                {formatPlatformCodeLabel(locale, notice.severity)}
              </span>
              <span className={`admin-badge ${getStatusTone(notice.status)}`}>
                {formatPlatformCodeLabel(locale, notice.status)}
              </span>
              <span className="admin-badge admin-badge--neutral">
                {copy.audiencesLabel}:{" "}
                {getAudienceLabel(
                  copy.audience,
                  notice.targetAudience as Audience,
                )}
              </span>
              {deliveryState ? (
                <span className={`admin-badge ${getStatusTone(deliveryState)}`}>
                  {deliveryState}
                </span>
              ) : null}
            </div>
            <h3 style={{ margin: "0 0 10px", fontSize: 22 }}>{notice.title}</h3>
            <p
              style={{ margin: "0 0 14px", color: "#334155", lineHeight: 1.7 }}
            >
              {notice.body}
            </p>
            <div style={metaGridStyle}>
              <div>
                <div style={metaLabelStyle}>{copy.createdAt}</div>
                <div style={monoTextStyle}>
                  {formatDateTime(notice.createdAt)}
                </div>
              </div>
              <div>
                <div style={metaLabelStyle}>{copy.updatedAt}</div>
                <div style={monoTextStyle}>
                  {formatDateTime(notice.updatedAt)}
                </div>
              </div>
              <div>
                <div style={metaLabelStyle}>{copy.createdBy}</div>
                <div>{notice.createdBy || "—"}</div>
              </div>
              <div>
                <div style={metaLabelStyle}>{copy.changeReason}</div>
                <div>{notice.changeReason || "—"}</div>
              </div>
            </div>
          </div>

          <div
            style={{
              borderRadius: 18,
              padding: 18,
              border: "1px solid rgba(15, 23, 42, 0.08)",
              background: "rgba(248,250,252,0.92)",
            }}
          >
            <div style={{ marginBottom: 14 }}>
              <div style={metaLabelStyle}>{copy.delivery}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>
                {notice.deliverySummary
                  ? `${notice.deliverySummary.deliveredCount} / ${notice.deliverySummary.totalCount}`
                  : "—"}
              </div>
              <div style={{ color: "#64748b", marginTop: 4 }}>
                {notice.deliverySummary?.state === "delivered"
                  ? copy.deliveryDone
                  : notice.deliverySummary?.state === "delivering"
                    ? copy.deliveryPropagating
                    : notice.deliverySummary?.state === "pending"
                      ? copy.deliveryPending
                      : "—"}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={metaLabelStyle}>{copy.targets}</div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 8,
                }}
              >
                {(notice.deliverySummary?.targets ?? []).length ? (
                  (notice.deliverySummary?.targets ?? []).map(
                    (target: string) => (
                      <span
                        key={target}
                        className="admin-badge admin-badge--neutral"
                        style={{ textTransform: "none" }}
                      >
                        {target}
                      </span>
                    ),
                  )
                ) : (
                  <span style={{ color: "#64748b" }}>—</span>
                )}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={metaLabelStyle}>{copy.links}</div>
              <div style={{ marginTop: 8 }}>
                {renderNoticeLinks(notice.crossAppLinks)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {actions.map((action) => {
                if (action.action !== "resolve_notice") {
                  return renderActionBadge(action, action.action);
                }
                return (
                  <button
                    key={action.action}
                    type="button"
                    className="admin-btn admin-btn--secondary"
                    disabled={!action.enabled}
                    title={action.disabledReasonCode ?? copy.actionUnavailable}
                    onClick={() => void handleResolveNotice(notice.noticeId)}
                  >
                    {copy.resolve}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </article>
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
      const reason = normalizeSupportedEmptyReason(
        noticesEmptyState?.reason,
        notices.length === 0 ? "no_data" : "filtered_empty",
      );
      return renderEmptyState(reason, noticesEmptyState);
    }

    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div
          className="admin-card"
          style={{
            marginBottom: 0,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            background:
              "linear-gradient(180deg, rgba(15,118,110,0.06), rgba(255,255,255,0.96))",
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {copy.noticesCardTitle}
            </div>
            <p style={{ margin: "6px 0 0", color: "#64748b" }}>
              {copy.noticeEmptyHint}
            </p>
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
              <option value="all">all</option>
              <option value="active">active</option>
              <option value="scheduled">scheduled</option>
              <option value="resolved">resolved</option>
            </select>
          </label>
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          {activeNotices.map(renderNoticeRow)}
        </div>
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
          gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, 0.95fr)",
          gap: 16,
        }}
      >
        <div style={{ display: "grid", gap: 16 }}>
          <div
            className="admin-card"
            style={{
              marginBottom: 0,
              background: maintenance.enabled
                ? "linear-gradient(160deg, rgba(127,29,29,0.96), rgba(239,68,68,0.86))"
                : "linear-gradient(160deg, rgba(15,23,42,0.96), rgba(51,65,85,0.86))",
              color: "#fff",
              borderColor: "transparent",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    padding: "5px 10px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.16)",
                    marginBottom: 12,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {maintenance.enabled ? copy.activeBanner : copy.currentPolicy}
                </div>
                <h3 style={{ margin: "0 0 8px", fontSize: 24 }}>
                  {maintenance.enabled
                    ? copy.maintenanceOn
                    : copy.maintenanceOff}
                </h3>
                <p
                  style={{
                    margin: 0,
                    maxWidth: 540,
                    color: "rgba(255,255,255,0.88)",
                  }}
                >
                  {copy.maintenanceHint}
                </p>
              </div>
              <label className="admin-switch">
                <input
                  type="checkbox"
                  checked={maintEnabled}
                  onChange={(event) => setMaintEnabled(event.target.checked)}
                />
                <span className="admin-switch-slider" />
              </label>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 14,
                marginTop: 18,
              }}
            >
              <div>
                <div style={darkMetaLabelStyle}>{copy.currentState}</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>
                  {maintenance.enabled ? copy.enabled : copy.disabled}
                </div>
              </div>
              <div>
                <div style={darkMetaLabelStyle}>{copy.scheduledWindow}</div>
                <div style={{ marginTop: 6 }}>
                  {formatWindow(
                    maintenance.scheduledStart,
                    maintenance.scheduledEnd,
                    copy.noWindow,
                  )}
                </div>
              </div>
              <div>
                <div style={darkMetaLabelStyle}>{copy.updatedAt}</div>
                <div style={{ marginTop: 6 }}>
                  {formatDateTime(maintenance.updatedAt)}
                </div>
              </div>
              <div>
                <div style={darkMetaLabelStyle}>{copy.updatedBy}</div>
                <div style={{ marginTop: 6 }}>
                  {maintenance.updatedBy || "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="admin-card" style={{ marginBottom: 0 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 14,
              }}
            >
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
              </label>
              <label style={fieldGroupStyle}>
                <span style={fieldLabelStyle}>{copy.scheduleStartField}</span>
                <input
                  value={maintScheduledStart}
                  onChange={(event) =>
                    setMaintScheduledStart(event.target.value)
                  }
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
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
                marginTop: 18,
              }}
            >
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>{copy.permissionsTitle}</div>
                <div style={{ color: "#64748b", maxWidth: 520 }}>
                  {copy.permissionsBody}
                </div>
                {maintenanceAction
                  ? renderActionBadge(
                      maintenanceAction,
                      maintenanceAction.action === "clear_maintenance_mode"
                        ? copy.clearAction
                        : copy.setAction,
                    )
                  : null}
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
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div className="admin-card" style={{ marginBottom: 0 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 18 }}>
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
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
                {maintReason || maintenance.reason || copy.maintenanceOn}
              </div>
              <p
                style={{ margin: "0 0 14px", color: "rgba(255,255,255,0.88)" }}
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
            {renderNoticeLinks(maintenanceLinks)}
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
      const reason = normalizeSupportedEmptyReason(
        historyRows.length === 0 ? noticesEmptyState?.reason : "filtered_empty",
        historyRows.length === 0 ? "not_provisioned" : "filtered_empty",
      );
      return renderEmptyState(reason, noticesEmptyState);
    }

    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div
          className="admin-card"
          style={{
            marginBottom: 0,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {copy.historyTitle}
            </div>
            <p style={{ margin: "6px 0 0", color: "#64748b" }}>
              {copy.historyEmpty}
            </p>
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
              <option value="all">all</option>
              <option value="delivered">delivered</option>
              <option value="delivering">delivering</option>
              <option value="pending">pending</option>
            </select>
          </label>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {filteredHistoryRows.map((notice) => (
            <div
              key={`${notice.noticeId}-history`}
              className="admin-card"
              style={{ marginBottom: 0, display: "grid", gap: 16 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <span
                      className={`admin-badge ${getSeverityTone(notice.severity)}`}
                    >
                      {formatPlatformCodeLabel(locale, notice.severity)}
                    </span>
                    <span
                      className={`admin-badge ${getStatusTone(
                        notice.deliverySummary?.state ?? "pending",
                      )}`}
                    >
                      {notice.deliverySummary?.state ?? "pending"}
                    </span>
                  </div>
                  <h3 style={{ margin: "0 0 6px", fontSize: 20 }}>
                    {notice.title}
                  </h3>
                  <div style={{ color: "#64748b" }}>{notice.noticeId}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={metaLabelStyle}>{copy.updatedAt}</div>
                  <div style={monoTextStyle}>
                    {formatDateTime(
                      notice.deliverySummary?.broadcastAt ?? notice.updatedAt,
                    )}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                <div style={historyMetricCardStyle}>
                  <div style={metaLabelStyle}>{copy.delivery}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>
                    {notice.deliverySummary?.deliveredCount ?? 0} /{" "}
                    {notice.deliverySummary?.totalCount ?? 0}
                  </div>
                </div>
                <div style={historyMetricCardStyle}>
                  <div style={metaLabelStyle}>{copy.targets}</div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 8,
                    }}
                  >
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
                </div>
                <div style={historyMetricCardStyle}>
                  <div style={metaLabelStyle}>{copy.links}</div>
                  <div style={{ marginTop: 8 }}>
                    {renderNoticeLinks(notice.crossAppLinks)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
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
            {renderSummaryCards()}
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
              "linear-gradient(135deg, rgba(127,29,29,0.96), rgba(239,68,68,0.88))",
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
          {(["notices", "maint", "history"] as NoticeTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className="admin-btn"
              onClick={() => setActiveTab(tab)}
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
                  <option value="all">{copy.audience.all}</option>
                  <option value="tenants">{copy.audience.tenants}</option>
                  <option value="ops">{copy.audience.ops}</option>
                  <option value="drivers">{copy.audience.drivers}</option>
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
                {copy.audienceField}:{" "}
                {getAudienceLabel(copy.audience, formAudience)}
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
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 12,
  padding: "11px 12px",
  fontSize: 14,
  background: "rgba(255,255,255,0.92)",
  color: "#0f172a",
};

const fieldBoxStyle: React.CSSProperties = {
  minHeight: 48,
  border: "1px solid rgba(148, 163, 184, 0.35)",
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

const metaGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const metaLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#64748b",
};

const darkMetaLabelStyle: React.CSSProperties = {
  ...metaLabelStyle,
  color: "rgba(255,255,255,0.6)",
};

const monoTextStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const historyMetricCardStyle: React.CSSProperties = {
  borderRadius: 16,
  padding: 16,
  background: "rgba(248,250,252,0.92)",
  border: "1px solid rgba(15,23,42,0.06)",
};

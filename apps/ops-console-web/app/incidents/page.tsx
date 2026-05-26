"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { CSSProperties, ReactElement } from "react";
import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useTransition,
} from "react";
import type {
  CreateIncidentCommand,
  CreateIncidentFromDispatchExceptionCommand,
  EmptyReason,
  EmptyStateEnvelope,
  IncidentCategory,
  IncidentEscalationTarget,
  IncidentRecord,
  IncidentSeverity,
  IncidentStatus,
  ResourceActionDescriptor,
  RefreshTier,
  UiActionableResource,
  UiRefreshMetadata,
  UiRuntimeListEnvelope,
} from "@drts/contracts";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_ESCALATION_TARGETS,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasIcon,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const REFRESH_TIER: RefreshTier = "medium";
const REFRESH_INTERVAL_MS = 15_000;
const ACTION_CREATE_INCIDENT = "create_incident";
const ACTION_CREATE_FROM_DISPATCH_EXCEPTION =
  "create_incident_from_dispatch_exception";
const ACTION_REFRESH_INCIDENTS = "refresh_incidents";
const ACTION_OPEN_FEATURE_FLAGS = "open_feature_flags";
const ACTION_OPEN_DASHBOARD = "open_dashboard";
const ACTION_OPEN_INCIDENT_DETAIL = "open_incident_detail";
const ACTION_ADD_SERVICE_RECOVERY = "add_service_recovery";
const ACTION_OPEN_DISPATCH_DETAIL = "open_dispatch_detail";
const ACTION_OPEN_DRIVER_DETAIL = "open_driver_detail";
const ACTION_OPEN_VEHICLE_DETAIL = "open_vehicle_detail";
const ACTION_OPEN_COMPLAINT_DETAIL = "open_complaint_detail";

const STATUSES: IncidentStatus[] = [...INCIDENT_STATUSES];
const SEVERITIES: IncidentSeverity[] = [...INCIDENT_SEVERITIES];
const CATEGORIES: IncidentCategory[] = [...INCIDENT_CATEGORIES];
const ESCALATION_TARGETS: IncidentEscalationTarget[] = [
  ...INCIDENT_ESCALATION_TARGETS,
];

type IncidentFormInitialValues = {
  title?: string;
  description?: string;
  category?: IncidentCategory;
  severity?: IncidentSeverity;
  complaintCaseNo?: string;
  relatedOrderId?: string;
  relatedVehicleId?: string;
  relatedDriverId?: string;
  reportedBy?: string;
  occurredAt?: string;
  location?: string;
  dispatchExceptionOrderId?: string;
  exceptionReasonCode?: string;
  exceptionNote?: string;
};

type IncidentRecordRuntime = IncidentRecord & UiActionableResource;

type IncidentTableRow = Record<string, unknown> & {
  incidentId: string;
  incidentCell: ReactElement;
  categoryCell: ReactElement;
  severityCell: ReactElement;
  statusCell: ReactElement;
  coordinationCell: ReactElement;
  linksCell: ReactElement;
  actionsCell: ReactElement;
  reportedBy: string;
  occurredCell: ReactElement;
  ageCell: ReactElement;
  _selected?: boolean;
};

type IncidentCreateMode = "manual" | "dispatch_exception";

type IncidentDraftCommand =
  | CreateIncidentCommand
  | CreateIncidentFromDispatchExceptionCommand;

function formatDateTime(value: string | null | undefined, locale: "en" | "zh") {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatIncidentAge(
  value: string | null | undefined,
  locale: "en" | "zh",
) {
  if (!value) {
    return locale === "en" ? "Time not recorded" : "尚未記錄時間";
  }

  const deltaMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / (1000 * 60)),
  );
  if (deltaMinutes < 60) {
    return locale === "en"
      ? `${deltaMinutes} min ago`
      : `${deltaMinutes} 分鐘前`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return locale === "en" ? `${deltaHours} hr ago` : `${deltaHours} 小時前`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  return locale === "en" ? `${deltaDays} d ago` : `${deltaDays} 天前`;
}

function compareIncidentPriority(
  a: IncidentRecordRuntime,
  b: IncidentRecordRuntime,
) {
  const severityWeight =
    incidentSeverityWeight(b.severity) - incidentSeverityWeight(a.severity);
  if (severityWeight !== 0) {
    return severityWeight;
  }

  return (
    new Date(b.occurredAt ?? b.createdAt).getTime() -
    new Date(a.occurredAt ?? a.createdAt).getTime()
  );
}

function incidentSeverityWeight(severity: IncidentSeverity) {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function getSeverityTone(severity: IncidentSeverity): CanvasTone {
  if (severity === "critical" || severity === "high") {
    return "danger";
  }
  if (severity === "medium") {
    return "warn";
  }
  return "info";
}

function getStatusTone(status: IncidentStatus): CanvasTone {
  if (status === "resolved" || status === "closed") {
    return "success";
  }
  if (status === "investigating") {
    return "danger";
  }
  return "warn";
}

function buildDefaultRefresh(): UiRefreshMetadata {
  return {
    generatedAt: new Date().toISOString(),
    staleAfterMs: REFRESH_INTERVAL_MS,
    dataFreshness: "fresh",
    source: "live",
  };
}

function getRefreshIntervalMs(tier: RefreshTier) {
  switch (tier) {
    case "urgent":
      return 5_000;
    case "fast":
      return 3_000;
    case "dispatch":
      return 5_000;
    case "medium":
      return 15_000;
    case "medium_slow":
    case "slow":
      return 30_000;
    case "manual":
      return null;
    default:
      return REFRESH_INTERVAL_MS;
  }
}

function buildDefaultPageActions(): ResourceActionDescriptor[] {
  return [
    {
      action: ACTION_CREATE_INCIDENT,
      enabled: true,
      riskLevel: "medium",
    },
    {
      action: ACTION_REFRESH_INCIDENTS,
      enabled: true,
      riskLevel: "low",
    },
  ];
}

function buildIncidentListRequestPath(params: {
  complaintCaseNo?: string;
  dispatchExceptionOrderId?: string;
  exceptionReasonCode?: string;
}) {
  const search = new URLSearchParams();
  if (params.complaintCaseNo?.trim()) {
    search.set("complaintCaseNo", params.complaintCaseNo.trim());
  }
  if (params.dispatchExceptionOrderId?.trim()) {
    search.set(
      "dispatchExceptionOrderId",
      params.dispatchExceptionOrderId.trim(),
    );
  }
  if (params.exceptionReasonCode?.trim()) {
    search.set("exceptionReasonCode", params.exceptionReasonCode.trim());
  }

  const query = search.toString();
  return query ? `/api/incidents?${query}` : "/api/incidents";
}

function classifyErrorReason(message: string): EmptyReason {
  if (message.includes("403") || message.includes("401")) {
    return "permission_denied";
  }
  if (
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.toLowerCase().includes("timeout")
  ) {
    return "external_unavailable";
  }
  if (message.includes("404") || message.toLowerCase().includes("provision")) {
    return "not_provisioned";
  }
  return "fetch_failed";
}

function buildFallbackEmptyState(reason: EmptyReason): EmptyStateEnvelope {
  return {
    reason,
    messageCode: `incidents.${reason}`,
  };
}

function getActionDescriptor(
  actions: ResourceActionDescriptor[],
  names: string[],
): ResourceActionDescriptor | null {
  for (const name of names) {
    const match = actions.find((action) => action.action === name);
    if (match) {
      return match;
    }
  }

  return null;
}

function isCreateActionName(action: string) {
  return [
    ACTION_CREATE_INCIDENT,
    ACTION_CREATE_FROM_DISPATCH_EXCEPTION,
    "create",
    "createIncident",
    "createIncidentFromDispatchException",
  ].includes(action);
}

function isRefreshActionName(action: string) {
  return (
    action === ACTION_REFRESH_INCIDENTS ||
    action === "refresh" ||
    action === "reload"
  );
}

function getCreateModeForAction(action: string): IncidentCreateMode {
  return action === ACTION_CREATE_FROM_DISPATCH_EXCEPTION ||
    action === "createIncidentFromDispatchException"
    ? "dispatch_exception"
    : "manual";
}

function isRouteActionName(action: string) {
  return (
    action === ACTION_OPEN_FEATURE_FLAGS || action === ACTION_OPEN_DASHBOARD
  );
}

function getActionLabel(
  action: ResourceActionDescriptor | null | undefined,
  locale: "en" | "zh",
) {
  switch (action?.action) {
    case ACTION_ADD_SERVICE_RECOVERY:
      return locale === "en" ? "Add recovery" : "新增 recovery";
    case ACTION_OPEN_INCIDENT_DETAIL:
      return locale === "en" ? "Open incident" : "開啟事件";
    case ACTION_CREATE_FROM_DISPATCH_EXCEPTION:
      return locale === "en"
        ? "Create from dispatch exception"
        : "從派遣異常建立";
    case ACTION_CREATE_INCIDENT:
      return locale === "en" ? "Create incident" : "建立事故";
    case ACTION_OPEN_FEATURE_FLAGS:
      return locale === "en" ? "Open feature flags" : "前往功能旗標";
    case ACTION_OPEN_DASHBOARD:
      return locale === "en" ? "Open dashboard" : "前往儀表板";
    case ACTION_OPEN_DISPATCH_DETAIL:
      return locale === "en" ? "Open dispatch" : "前往派遣";
    case ACTION_OPEN_DRIVER_DETAIL:
      return locale === "en" ? "Open driver" : "前往司機";
    case ACTION_OPEN_VEHICLE_DETAIL:
      return locale === "en" ? "Open vehicle" : "前往車輛";
    case ACTION_OPEN_COMPLAINT_DETAIL:
      return locale === "en" ? "Open complaint" : "前往客訴";
    case ACTION_REFRESH_INCIDENTS:
    case "refresh":
    case "reload":
      return locale === "en" ? "Refresh" : "重新整理";
    default:
      return locale === "en"
        ? action?.action.replace(/_/g, " ") || "Open"
        : action?.action.replace(/_/g, " ") || "開啟";
  }
}

function getActionTitle(
  action: ResourceActionDescriptor | null | undefined,
  locale: "en" | "zh",
) {
  if (!action) {
    return undefined;
  }

  const parts: string[] = [];
  if (!action.enabled && action.disabledReasonCode) {
    parts.push(action.disabledReasonCode);
  }
  if (action.requiresReason) {
    parts.push(locale === "en" ? "reason required" : "需填寫原因");
  }
  if (action.riskLevel) {
    parts.push(
      locale === "en"
        ? `${action.riskLevel} risk`
        : `${action.riskLevel === "high" ? "高" : action.riskLevel === "medium" ? "中" : "低"}風險`,
    );
  }

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function getActionVariant(action: ResourceActionDescriptor | null | undefined) {
  if (action?.riskLevel === "medium") {
    return "primary" as const;
  }
  return "secondary" as const;
}

function isDangerAction(action: ResourceActionDescriptor | null | undefined) {
  return action?.riskLevel === "high";
}

function getActionIconName(
  action: ResourceActionDescriptor | null | undefined,
) {
  switch (action?.action) {
    case ACTION_CREATE_INCIDENT:
    case ACTION_CREATE_FROM_DISPATCH_EXCEPTION:
    case ACTION_ADD_SERVICE_RECOVERY:
      return "plus";
    case ACTION_REFRESH_INCIDENTS:
    case "refresh":
    case "reload":
      return "more";
    case ACTION_OPEN_DASHBOARD:
      return "dashboard";
    case ACTION_OPEN_FEATURE_FLAGS:
      return "flags";
    case ACTION_OPEN_DISPATCH_DETAIL:
      return "dispatch";
    case ACTION_OPEN_DRIVER_DETAIL:
      return "users";
    case ACTION_OPEN_VEHICLE_DETAIL:
      return "vehicles";
    case ACTION_OPEN_COMPLAINT_DETAIL:
      return "complaints";
    case ACTION_OPEN_INCIDENT_DETAIL:
    default:
      return "arrow";
  }
}

function getRefreshTone(
  refresh: UiRefreshMetadata,
): "info" | "warn" | "danger" {
  if (refresh.dataFreshness === "degraded") {
    return "danger";
  }
  if (
    refresh.dataFreshness === "stale" ||
    refresh.dataFreshness === "unknown"
  ) {
    return "warn";
  }
  return "info";
}

function formatRefreshTier(tier: RefreshTier, locale: "en" | "zh") {
  const labels: Record<RefreshTier, string> = {
    urgent: locale === "en" ? "T0 urgent" : "T0 緊急",
    fast: locale === "en" ? "T1 fast" : "T1 快速",
    dispatch: locale === "en" ? "T2 dispatch" : "T2 派遣",
    medium: locale === "en" ? "T3 medium" : "T3 中頻",
    medium_slow: locale === "en" ? "T4 medium-slow" : "T4 中低頻",
    slow: locale === "en" ? "T5 slow" : "T5 低頻",
    manual: locale === "en" ? "T6 manual" : "T6 手動",
  };

  return labels[tier];
}

function formatRefreshBadge(
  refresh: UiRefreshMetadata,
  refreshTier: RefreshTier,
  locale: "en" | "zh",
) {
  const freshness =
    refresh.dataFreshness === "fresh"
      ? locale === "en"
        ? "fresh"
        : "新鮮"
      : refresh.dataFreshness === "stale"
        ? locale === "en"
          ? "stale"
          : "資料偏舊"
        : refresh.dataFreshness === "degraded"
          ? locale === "en"
            ? "degraded"
            : "降級"
          : locale === "en"
            ? "unknown"
            : "未知";

  return `${formatRefreshTier(refreshTier, locale)} · ${freshness}`;
}

function formatRefreshHint(
  refresh: UiRefreshMetadata,
  refreshTier: RefreshTier,
  locale: "en" | "zh",
) {
  const staleAfterSec = Math.round(refresh.staleAfterMs / 1000);
  return locale === "en"
    ? `${formatRefreshTier(refreshTier, locale)} · source ${refresh.source} · stale after ${staleAfterSec}s`
    : `${formatRefreshTier(refreshTier, locale)} · 來源 ${refresh.source} · ${staleAfterSec} 秒後視為舊資料`;
}

function isPriorityIncident(record: IncidentRecordRuntime) {
  const open = record.status === "open" || record.status === "investigating";
  if (!open) {
    return false;
  }

  if (record.severity === "critical" || record.severity === "high") {
    return true;
  }

  const haystack = `${record.title} ${record.description}`.toLowerCase();
  return haystack.includes("sos");
}

function hasLinkedEntities(record: IncidentRecordRuntime) {
  return Boolean(
    record.relatedOrderId ||
    record.relatedVehicleId ||
    record.relatedDriverId ||
    record.relatedComplaintCaseNo,
  );
}

function getPrimaryIncidentHref(record: IncidentRecordRuntime) {
  return `/incidents/${encodeURIComponent(record.incidentId)}`;
}

function getActionHref(
  action: ResourceActionDescriptor,
  record?: IncidentRecordRuntime,
): string | null {
  switch (action.action) {
    case ACTION_OPEN_INCIDENT_DETAIL:
      return record ? getPrimaryIncidentHref(record) : null;
    case ACTION_ADD_SERVICE_RECOVERY:
      return record
        ? `${getPrimaryIncidentHref(record)}#service-recovery`
        : null;
    case ACTION_OPEN_DASHBOARD:
      return "/dashboard";
    case ACTION_OPEN_FEATURE_FLAGS:
      return "/feature-flags";
    case ACTION_OPEN_DISPATCH_DETAIL:
      return record?.relatedOrderId
        ? `/dispatch/${encodeURIComponent(record.relatedOrderId)}`
        : null;
    case ACTION_OPEN_DRIVER_DETAIL:
      return record?.relatedDriverId
        ? `/drivers/${encodeURIComponent(record.relatedDriverId)}`
        : null;
    case ACTION_OPEN_VEHICLE_DETAIL:
      return record?.relatedVehicleId
        ? `/vehicles/${encodeURIComponent(record.relatedVehicleId)}`
        : null;
    case ACTION_OPEN_COMPLAINT_DETAIL:
      return record?.relatedComplaintCaseNo
        ? `/complaints/${encodeURIComponent(record.relatedComplaintCaseNo)}`
        : null;
    default:
      return null;
  }
}

function renderActionButton(
  action: ResourceActionDescriptor,
  locale: "en" | "zh",
  onAction: (
    action: ResourceActionDescriptor,
    record?: IncidentRecordRuntime,
  ) => void,
  record?: IncidentRecordRuntime,
) {
  const href = getActionHref(action, record);
  const button = (
    <Btn
      theme={theme}
      variant={getActionVariant(action)}
      danger={isDangerAction(action)}
      icon={getActionIconName(action)}
      disabled={action.enabled === false}
      {...(href || action.enabled === false
        ? {}
        : { onClick: () => onAction(action, record) })}
    >
      {getActionLabel(action, locale)}
    </Btn>
  );

  return (
    <span
      key={`${record?.incidentId ?? "page"}:${action.action}`}
      title={getActionTitle(action, locale)}
    >
      {href && action.enabled !== false ? (
        <Link href={href} style={{ textDecoration: "none" }}>
          {button}
        </Link>
      ) : (
        button
      )}
    </span>
  );
}

function renderSeverityBadge(severity: IncidentSeverity, locale: "en" | "zh") {
  return (
    <Pill theme={theme} tone={getSeverityTone(severity)} dot>
      {formatOpsCodeLabel(locale, severity)}
    </Pill>
  );
}

function renderStatusBadge(status: IncidentStatus, locale: "en" | "zh") {
  return (
    <Pill theme={theme} tone={getStatusTone(status)} dot>
      {formatOpsCodeLabel(locale, status)}
    </Pill>
  );
}

function renderEmptyState(
  emptyState: EmptyStateEnvelope,
  locale: "en" | "zh",
  refreshAction: ResourceActionDescriptor | null,
  createAction: ResourceActionDescriptor | null,
  onAction: (action: ResourceActionDescriptor) => void,
  onResetFilters: () => void,
) {
  const copy = getEmptyStateCopy(emptyState.reason, locale);
  const tone = copy.tone;
  const nextAction = emptyState.nextAction;
  const primaryAction =
    nextAction ??
    (emptyState.reason === "no_data" ? createAction : null) ??
    (emptyState.reason === "fetch_failed" ||
    emptyState.reason === "external_unavailable"
      ? refreshAction
      : null);
  const secondaryAction =
    nextAction && isRefreshActionName(nextAction.action)
      ? null
      : emptyState.reason === "fetch_failed" ||
          emptyState.reason === "external_unavailable"
        ? refreshAction
        : null;

  return (
    <Card
      theme={theme}
      title={copy.title}
      subtitle={copy.body}
      actions={
        <>
          {emptyState.reason === "filtered_empty" ? (
            <Btn
              theme={theme}
              variant="secondary"
              icon="filter"
              onClick={onResetFilters}
            >
              {locale === "en" ? "Clear filters" : "清除篩選"}
            </Btn>
          ) : null}
          {primaryAction ? (
            <span title={getActionTitle(primaryAction, locale)}>
              <Btn
                theme={theme}
                variant={getActionVariant(primaryAction)}
                danger={isDangerAction(primaryAction)}
                icon={
                  isCreateActionName(primaryAction.action) ? "plus" : "arrow"
                }
                disabled={primaryAction.enabled === false}
                onClick={() => onAction(primaryAction)}
              >
                {getActionLabel(primaryAction, locale)}
              </Btn>
            </span>
          ) : null}
          {secondaryAction &&
          primaryAction?.action !== secondaryAction.action ? (
            <span title={getActionTitle(secondaryAction, locale)}>
              <Btn
                theme={theme}
                variant={getActionVariant(secondaryAction)}
                danger={isDangerAction(secondaryAction)}
                icon="more"
                disabled={secondaryAction.enabled === false}
                onClick={() => onAction(secondaryAction)}
              >
                {getActionLabel(secondaryAction, locale)}
              </Btn>
            </span>
          ) : null}
        </>
      }
      padding={20}
      style={{
        borderColor: tone === "danger" ? theme.dangerBorder : theme.border,
        background: tone === "danger" ? theme.dangerBg : theme.surface,
      }}
    >
      <div
        style={{
          display: "grid",
          placeItems: "center",
          gap: 12,
          minHeight: 240,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: 20,
            display: "grid",
            placeItems: "center",
            background:
              tone === "danger" ? "rgba(220, 38, 38, 0.16)" : theme.surfaceLo,
            border: `1px solid ${tone === "danger" ? theme.dangerBorder : theme.border}`,
          }}
        >
          <CanvasIcon name={copy.icon} size={28} />
        </div>
        <div style={{ maxWidth: 520 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>
            {copy.title}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 12.5,
              color: theme.textMuted,
              lineHeight: 1.6,
            }}
          >
            {copy.body}
          </div>
        </div>
      </div>
    </Card>
  );
}

function getEmptyStateCopy(reason: EmptyReason, locale: "en" | "zh") {
  switch (reason) {
    case "no_data":
      return {
        icon: "incidents" as const,
        tone: "info" as const,
        title: locale === "en" ? "No incidents yet" : "目前沒有事故",
        body:
          locale === "en"
            ? "No incident records have been created in this workspace. Use the manual create action when Ops needs to start a case."
            : "目前這個工作區尚未建立任何事故紀錄。當營運團隊需要主動開案時，可使用手動建立動作。",
      };
    case "not_provisioned":
      return {
        icon: "flags" as const,
        tone: "warn" as const,
        title:
          locale === "en"
            ? "Incident service is not provisioned"
            : "事故服務尚未完成配置",
        body:
          locale === "en"
            ? "The incident module is available in navigation, but the backing read model or upstream provisioning is not ready for this tenant."
            : "側邊導覽已顯示事故模組，但底層讀模型或上游配置尚未對這個 tenant 就緒。",
      };
    case "fetch_failed":
      return {
        icon: "warn" as const,
        tone: "danger" as const,
        title:
          locale === "en" ? "Unable to load incidents" : "無法載入事故列表",
        body:
          locale === "en"
            ? "The last fetch failed before a valid snapshot arrived. Retry now or inspect adapter / API health before assuming there are no incidents."
            : "最新請求在取得有效快照前失敗。請先重試，或檢查 adapter / API health，再判定目前沒有事故。",
      };
    case "permission_denied":
      return {
        icon: "users" as const,
        tone: "danger" as const,
        title:
          locale === "en"
            ? "You do not have incident access"
            : "你目前沒有事故模組權限",
        body:
          locale === "en"
            ? "The backend explicitly denied this list request. This is different from an empty queue and should remain visually distinct."
            : "後端明確拒絕了此列表請求。這和空佇列不同，必須以獨立狀態呈現。",
      };
    case "external_unavailable":
      return {
        icon: "adapters" as const,
        tone: "danger" as const,
        title:
          locale === "en"
            ? "Upstream incident dependency is unavailable"
            : "事故上游依賴目前不可用",
        body:
          locale === "en"
            ? "A dependent service is unavailable. Keep the manual refresh affordance visible and avoid misrepresenting this as no data."
            : "相依服務目前不可用。請保留手動重新整理入口，不要把這個狀態誤呈現成沒有資料。",
      };
    case "filtered_empty":
      return {
        icon: "filter" as const,
        tone: "info" as const,
        title:
          locale === "en"
            ? "No incidents match the current filters"
            : "目前篩選條件沒有符合的事故",
        body:
          locale === "en"
            ? "Try a different status, severity, category, or keyword. The underlying dataset still exists."
            : "請調整狀態、嚴重度、分類或關鍵字。底層資料仍然存在，只是目前條件下沒有命中。",
      };
    default:
      return {
        icon: "incidents" as const,
        tone: "info" as const,
        title: locale === "en" ? "No incidents" : "沒有事故",
        body: locale === "en" ? "No data available." : "目前沒有可顯示的資料。",
      };
  }
}

export default function IncidentsPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<IncidentRecordRuntime[]>([]);
  const [pageActions, setPageActions] = useState<ResourceActionDescriptor[]>(
    buildDefaultPageActions(),
  );
  const [refresh, setRefresh] = useState<UiRefreshMetadata>(
    buildDefaultRefresh(),
  );
  const [refreshTier, setRefreshTier] = useState<RefreshTier>(REFRESH_TIER);
  const [emptyState, setEmptyState] = useState<EmptyStateEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<IncidentCreateMode>("manual");
  const [activeCreateAction, setActiveCreateAction] =
    useState<ResourceActionDescriptor | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "all">(
    "all",
  );
  const [severityFilter, setSeverityFilter] = useState<
    IncidentSeverity | "all"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<
    IncidentCategory | "all"
  >("all");

  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const createFromQuery = searchParams.get("create") === "1";
  const complaintCaseNoFromQuery =
    searchParams.get("complaintCaseNo")?.trim() ?? "";
  const dispatchExceptionOrderId =
    searchParams.get("dispatchExceptionOrderId")?.trim() ?? "";
  const exceptionReasonCode =
    searchParams.get("exceptionReasonCode")?.trim() ?? "";

  const createDefaults: IncidentFormInitialValues = {
    title: searchParams.get("title") ?? "",
    description: searchParams.get("description") ?? "",
    category: CATEGORIES.includes(
      searchParams.get("category") as IncidentCategory,
    )
      ? (searchParams.get("category") as IncidentCategory)
      : "operational",
    severity: SEVERITIES.includes(
      searchParams.get("severity") as IncidentSeverity,
    )
      ? (searchParams.get("severity") as IncidentSeverity)
      : "medium",
    complaintCaseNo: complaintCaseNoFromQuery,
    relatedOrderId:
      searchParams.get("relatedOrderId") ?? dispatchExceptionOrderId,
    relatedVehicleId: searchParams.get("relatedVehicleId") ?? "",
    relatedDriverId: searchParams.get("relatedDriverId") ?? "",
    reportedBy: searchParams.get("reportedBy") ?? "ops-user-001",
    occurredAt: searchParams.get("occurredAt") ?? "",
    location: searchParams.get("location") ?? "",
    dispatchExceptionOrderId,
    exceptionReasonCode,
    exceptionNote: searchParams.get("exceptionNote") ?? "",
  };
  const incidentListRequestPath = buildIncidentListRequestPath({
    complaintCaseNo: complaintCaseNoFromQuery,
    dispatchExceptionOrderId,
    exceptionReasonCode,
  });

  const loadRecords = useEffectEvent(async (manual: boolean) => {
    if (manual) {
      setLoading(true);
    }

    try {
      const client = getOpsClient();
      const payload = await client.get<
        UiRuntimeListEnvelope<IncidentRecordRuntime>
      >(incidentListRequestPath);
      const normalizedItems = Array.isArray(payload)
        ? (payload as unknown as IncidentRecordRuntime[])
        : (payload.items ?? []);
      const normalizedEnvelope = Array.isArray(payload) ? null : payload;

      setRecords([...normalizedItems].sort(compareIncidentPriority));
      setPageActions(
        normalizedEnvelope?.availableActions ?? buildDefaultPageActions(),
      );
      setRefresh(
        normalizedEnvelope?.refreshMetadata ??
          normalizedEnvelope?.refresh ??
          buildDefaultRefresh(),
      );
      setRefreshTier(normalizedEnvelope?.refreshTier ?? REFRESH_TIER);
      setEmptyState(
        normalizedItems.length === 0
          ? (normalizedEnvelope?.emptyState ??
              buildFallbackEmptyState("no_data"))
          : null,
      );
      setError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : t("common.unknown");
      setError(message);
      setRefresh({
        ...buildDefaultRefresh(),
        dataFreshness: "degraded",
        source: "cache",
      });
      setRefreshTier(REFRESH_TIER);
      if (records.length === 0) {
        setEmptyState(buildFallbackEmptyState(classifyErrorReason(message)));
      }
    } finally {
      setLoading(false);
    }
  });

  const filteredRecords = useMemo(() => {
    return records
      .filter((record) => {
        if (statusFilter !== "all" && record.status !== statusFilter) {
          return false;
        }
        if (severityFilter !== "all" && record.severity !== severityFilter) {
          return false;
        }
        if (categoryFilter !== "all" && record.category !== categoryFilter) {
          return false;
        }
        if (!deferredQuery) {
          return true;
        }
        const haystack = [
          record.incidentId,
          record.title,
          record.description,
          record.category,
          record.severity,
          record.status,
          record.relatedOrderId ?? "",
          record.relatedVehicleId ?? "",
          record.relatedDriverId ?? "",
          record.relatedComplaintCaseNo ?? "",
          record.reportedBy,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(deferredQuery);
      })
      .sort(compareIncidentPriority);
  }, [records, statusFilter, severityFilter, categoryFilter, deferredQuery]);

  const priorityQueue = useMemo(
    () =>
      records
        .filter((record) => isPriorityIncident(record))
        .sort(compareIncidentPriority),
    [records],
  );

  const openCount = records.filter(
    (record) => record.status === "open" || record.status === "investigating",
  ).length;
  const majorCount = records.filter(
    (record) => record.severity === "critical" || record.severity === "high",
  ).length;
  const resolved30dCount = records.filter((record) => {
    if (record.status !== "resolved" && record.status !== "closed") {
      return false;
    }
    return (
      Date.now() - new Date(record.updatedAt).getTime() <=
      30 * 24 * 60 * 60 * 1000
    );
  }).length;
  const linkedCount = records.filter((record) =>
    hasLinkedEntities(record),
  ).length;
  const recoveryPendingCount = records.filter(
    (record) =>
      (record.status === "open" || record.status === "investigating") &&
      record.serviceRecoveryActions.length === 0,
  ).length;
  const activeCritical = records.find(
    (record) =>
      record.severity === "critical" &&
      (record.status === "open" || record.status === "investigating"),
  );

  const createActions = pageActions.filter((action) =>
    isCreateActionName(action.action),
  );
  const nonCreatePageActions = pageActions.filter(
    (action) => !isCreateActionName(action.action),
  );
  const createAction = getActionDescriptor(createActions, [
    ...(dispatchExceptionOrderId
      ? [ACTION_CREATE_FROM_DISPATCH_EXCEPTION, ACTION_CREATE_INCIDENT]
      : [ACTION_CREATE_INCIDENT, ACTION_CREATE_FROM_DISPATCH_EXCEPTION]),
    "create",
    "createIncident",
    "createIncidentFromDispatchException",
  ]);
  const refreshAction = getActionDescriptor(pageActions, [
    ACTION_REFRESH_INCIDENTS,
    "refresh",
    "reload",
  ]);
  const refreshLabel = formatRefreshBadge(refresh, refreshTier, locale);
  const headerActions = (
    <>
      <Pill theme={theme} tone={getRefreshTone(refresh)}>
        {refreshLabel}
      </Pill>
      {nonCreatePageActions.map((action) =>
        renderActionButton(action, locale, (nextAction, nextRecord) =>
          handleAction(nextAction, nextRecord),
        ),
      )}
      {createActions.map((action) =>
        renderActionButton(action, locale, (nextAction, nextRecord) =>
          handleAction(nextAction, nextRecord),
        ),
      )}
    </>
  );
  const refreshIntervalMs = getRefreshIntervalMs(refreshTier);
  const filteredEmpty = filteredRecords.length === 0 && records.length > 0;
  const effectiveEmptyState = filteredEmpty
    ? buildFallbackEmptyState("filtered_empty")
    : emptyState;

  useEffect(() => {
    if (dispatchExceptionOrderId) {
      setCreateMode("dispatch_exception");
      setActiveCreateAction(
        getActionDescriptor(pageActions, [
          ACTION_CREATE_FROM_DISPATCH_EXCEPTION,
          "createIncidentFromDispatchException",
        ]),
      );
    }
  }, [dispatchExceptionOrderId, pageActions]);

  useEffect(() => {
    void loadRecords(false);
  }, [loadRecords]);

  useEffect(() => {
    if (!createFromQuery || !createAction || createAction.enabled === false) {
      return;
    }

    setCreateMode(getCreateModeForAction(createAction.action));
    setActiveCreateAction(createAction);
    setShowCreate(true);
  }, [createAction, createFromQuery]);

  useEffect(() => {
    if (refreshIntervalMs === null) {
      return;
    }

    const handle = window.setInterval(() => {
      void loadRecords(false);
    }, refreshIntervalMs);

    return () => window.clearInterval(handle);
  }, [loadRecords, refreshIntervalMs]);

  const resetFilters = useEffectEvent(() => {
    setQuery("");
    setStatusFilter("all");
    setSeverityFilter("all");
    setCategoryFilter("all");
  });

  const handleAction = useEffectEvent(
    (action: ResourceActionDescriptor, record?: IncidentRecordRuntime) => {
      switch (action.action) {
        case ACTION_CREATE_INCIDENT:
        case ACTION_CREATE_FROM_DISPATCH_EXCEPTION:
        case "create":
        case "createIncident":
        case "createIncidentFromDispatchException":
          setCreateMode(getCreateModeForAction(action.action));
          setActiveCreateAction(action);
          setShowCreate(true);
          return;
        case ACTION_REFRESH_INCIDENTS:
        case "refresh":
        case "reload":
          void loadRecords(true);
          return;
        case ACTION_OPEN_FEATURE_FLAGS:
        case ACTION_OPEN_DASHBOARD:
        case ACTION_OPEN_INCIDENT_DETAIL:
        case ACTION_ADD_SERVICE_RECOVERY:
        case ACTION_OPEN_DISPATCH_DETAIL:
        case ACTION_OPEN_DRIVER_DETAIL:
        case ACTION_OPEN_VEHICLE_DETAIL:
        case ACTION_OPEN_COMPLAINT_DETAIL: {
          const href = getActionHref(action, record);
          if (href) {
            router.push(href);
          }
          return;
        }
        default:
          if (isRouteActionName(action.action)) {
            router.push("/dashboard");
          }
      }
    },
  );

  const tableRows: IncidentTableRow[] = filteredRecords.map((record) => {
    const rowActions = record.availableActions ?? [];

    return {
      incidentId: record.incidentId,
      incidentCell: (
        <div style={{ display: "grid", gap: 3, minWidth: 220 }}>
          <Link
            href={`/incidents/${encodeURIComponent(record.incidentId)}`}
            style={{
              color: theme.accent,
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 12.5,
            }}
          >
            {record.incidentId}
          </Link>
          <div style={{ color: theme.text, fontWeight: 600 }}>
            {record.title}
          </div>
          <div
            style={{
              color: theme.textMuted,
              fontSize: 11.5,
              lineHeight: 1.5,
              whiteSpace: "normal",
            }}
          >
            {record.description}
          </div>
        </div>
      ),
      categoryCell: (
        <span style={{ fontFamily: theme.monoFamily }}>
          {formatOpsCodeLabel(locale, record.category)}
        </span>
      ),
      severityCell: renderSeverityBadge(record.severity, locale),
      statusCell: renderStatusBadge(record.status, locale),
      coordinationCell: (
        <div style={{ display: "grid", gap: 4, minWidth: 200 }}>
          <span style={{ color: theme.text }}>
            {record.assignedTo
              ? locale === "en"
                ? `owner · ${record.assignedTo}`
                : `負責人 · ${record.assignedTo}`
              : locale === "en"
                ? "owner · unassigned"
                : "負責人 · 未指派"}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {locale === "en"
              ? `recovery · ${record.serviceRecoveryActions.length} actions`
              : `recovery · ${record.serviceRecoveryActions.length} 筆`}
          </span>
          {record.escalationTarget ? (
            <Pill theme={theme} tone="warn">
              {locale === "en"
                ? `target · ${formatOpsCodeLabel(locale, record.escalationTarget)}`
                : `目標 · ${formatOpsCodeLabel(locale, record.escalationTarget)}`}
            </Pill>
          ) : null}
        </div>
      ),
      linksCell: (
        <div style={{ display: "grid", gap: 4, minWidth: 220 }}>
          {record.relatedOrderId ? (
            <Link
              href={`/dispatch/${encodeURIComponent(record.relatedOrderId)}`}
              style={{ color: theme.text, textDecoration: "none" }}
            >
              order · {record.relatedOrderId}
            </Link>
          ) : null}
          {record.relatedVehicleId ? (
            <Link
              href={`/vehicles/${encodeURIComponent(record.relatedVehicleId)}`}
              style={{ color: theme.text, textDecoration: "none" }}
            >
              vehicle · {record.relatedVehicleId}
            </Link>
          ) : null}
          {record.relatedDriverId ? (
            <Link
              href={`/drivers/${encodeURIComponent(record.relatedDriverId)}`}
              style={{ color: theme.text, textDecoration: "none" }}
            >
              driver · {record.relatedDriverId}
            </Link>
          ) : null}
          {record.relatedComplaintCaseNo ? (
            <Link
              href={`/complaints/${encodeURIComponent(record.relatedComplaintCaseNo)}`}
              style={{ color: theme.text, textDecoration: "none" }}
            >
              complaint · {record.relatedComplaintCaseNo}
            </Link>
          ) : null}
          {!hasLinkedEntities(record) ? (
            <span style={{ color: theme.textDim }}>
              {locale === "en" ? "No linked entities" : "沒有已連結實體"}
            </span>
          ) : null}
        </div>
      ),
      actionsCell: (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            minWidth: 220,
          }}
        >
          {rowActions.map((action) =>
            renderActionButton(action, locale, handleAction, record),
          )}
          {rowActions.length === 0 ? (
            <span style={{ color: theme.textDim, fontSize: 11.5 }}>
              {locale === "en" ? "Read only" : "唯讀"}
            </span>
          ) : null}
        </div>
      ),
      reportedBy: record.reportedBy,
      occurredCell: (
        <div style={{ display: "grid", gap: 3 }}>
          <span style={{ fontFamily: theme.monoFamily }}>
            {formatDateTime(record.occurredAt ?? record.createdAt, locale)}
          </span>
          {record.sourceDispatchExceptionOrderId ? (
            <Pill theme={theme} tone="warn">
              {locale === "en" ? "dispatch exception" : "派遣異常"}
            </Pill>
          ) : null}
        </div>
      ),
      ageCell: (
        <span style={{ color: theme.textMuted }}>
          {formatIncidentAge(record.occurredAt ?? record.createdAt, locale)}
        </span>
      ),
      _selected: record.severity === "critical",
    };
  });

  const tableColumns: CanvasTableColumn<IncidentTableRow>[] = [
    { h: "INCIDENT", k: "incidentCell", w: 310, r: (row) => row.incidentCell },
    { h: "CAT", k: "categoryCell", w: 120, r: (row) => row.categoryCell },
    { h: "SEV", k: "severityCell", w: 100, r: (row) => row.severityCell },
    { h: "STATUS", k: "statusCell", w: 110, r: (row) => row.statusCell },
    {
      h: "COORDINATION",
      k: "coordinationCell",
      w: 210,
      r: (row) => row.coordinationCell,
    },
    { h: "RELATED", k: "linksCell", w: 250, r: (row) => row.linksCell },
    { h: "ACTIONS", k: "actionsCell", w: 260, r: (row) => row.actionsCell },
    { h: "REPORTED BY", k: "reportedBy", w: 120, mono: true },
    { h: "OCCURRED", k: "occurredCell", w: 145, r: (row) => row.occurredCell },
    { h: "AGE", k: "ageCell", w: 90, r: (row) => row.ageCell },
  ];
  const hasAllClearState =
    !loading &&
    !effectiveEmptyState &&
    priorityQueue.length === 0 &&
    records.length > 0;

  return (
    <div
      style={{
        background: theme.bg,
        color: theme.text,
        minHeight: "100%",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <PageHeader
        theme={theme}
        title={locale === "en" ? "Incidents" : "事故中心"}
        subtitle={
          locale === "en"
            ? "safety · collision · property · service recovery — driver SOS / dispatch exception always remain ops-owned"
            : "safety · collision · property · service recovery — driver SOS / dispatch exception 永遠維持 ops-owned"
        }
        tabs={[
          locale === "en" ? "Active" : "進行中",
          locale === "en" ? "Resolved" : "已受控",
          locale === "en" ? "Closed" : "已結案",
        ]}
        activeTab={
          statusFilter === "resolved"
            ? locale === "en"
              ? "Resolved"
              : "已受控"
            : statusFilter === "closed"
              ? locale === "en"
                ? "Closed"
                : "已結案"
              : locale === "en"
                ? "Active"
                : "進行中"
        }
        actions={headerActions}
      />

      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {activeCritical ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={`${activeCritical.incidentId} · ${activeCritical.title}`}
            body={
              locale === "en"
                ? `${formatOpsCodeLabel(locale, activeCritical.severity)} · ${formatOpsCodeLabel(
                    locale,
                    activeCritical.status,
                  )} · ${activeCritical.description}`
                : `${formatOpsCodeLabel(locale, activeCritical.severity)} · ${formatOpsCodeLabel(
                    locale,
                    activeCritical.status,
                  )} · ${activeCritical.description}`
            }
            actions={
              <Link
                href={`/incidents/${encodeURIComponent(activeCritical.incidentId)}`}
                style={{ textDecoration: "none" }}
              >
                <Btn theme={theme} variant="primary" icon="arrow">
                  {locale === "en" ? "Open incident" : "前往事件"}
                </Btn>
              </Link>
            }
          />
        ) : null}

        {error ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="warn"
            title={
              locale === "en"
                ? "Latest refresh returned an error"
                : "最新刷新回傳錯誤"
            }
            body={error}
          />
        ) : null}

        {refresh.dataFreshness !== "fresh" ? (
          <Banner
            theme={theme}
            tone={getRefreshTone(refresh)}
            icon={refresh.dataFreshness === "degraded" ? "warn" : "info"}
            title={
              locale === "en"
                ? "Live snapshot is not fully fresh"
                : "目前快照不是最新狀態"
            }
            body={formatRefreshHint(refresh, refreshTier, locale)}
            actions={
              refreshAction ? (
                <span title={getActionTitle(refreshAction, locale)}>
                  <Btn
                    theme={theme}
                    variant={getActionVariant(refreshAction)}
                    danger={isDangerAction(refreshAction)}
                    icon="more"
                    disabled={refreshAction.enabled === false}
                    onClick={() => handleAction(refreshAction)}
                  >
                    {locale === "en" ? "Refresh now" : "立即刷新"}
                  </Btn>
                </span>
              ) : undefined
            }
          />
        ) : null}

        {(complaintCaseNoFromQuery || dispatchExceptionOrderId) &&
        showCreate ? (
          <Banner
            theme={theme}
            tone="info"
            icon="ext"
            title={
              dispatchExceptionOrderId
                ? locale === "en"
                  ? "Dispatch exception handoff"
                  : "派遣異常移交"
                : locale === "en"
                  ? "Complaint escalation handoff"
                  : "客訴升級移交"
            }
            body={
              dispatchExceptionOrderId
                ? locale === "en"
                  ? `This create flow was entered from dispatch exception order ${dispatchExceptionOrderId}.`
                  : `這個建立流程是從派遣異常訂單 ${dispatchExceptionOrderId} 進入。`
                : locale === "en"
                  ? `This create flow was entered from complaint case ${complaintCaseNoFromQuery}.`
                  : `這個建立流程是從客訴案號 ${complaintCaseNoFromQuery} 進入。`
            }
          />
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {[
            {
              title: locale === "en" ? "Pending major" : "待處理重大事故",
              value: priorityQueue.length,
              subtitle:
                locale === "en" ? "major + SOS queue" : "重大事故 + SOS 佇列",
            },
            {
              title: locale === "en" ? "Recovery missing" : "尚未記錄 recovery",
              value: recoveryPendingCount,
              subtitle:
                locale === "en"
                  ? "open / investigating without recovery"
                  : "open / investigating 但尚無 recovery",
            },
            {
              title: locale === "en" ? "Linked entities" : "已連結實體",
              value: linkedCount,
              subtitle:
                locale === "en"
                  ? "order / vehicle / driver / complaint"
                  : "order / vehicle / driver / complaint",
            },
          ].map((item) => (
            <KPI
              key={item.title}
              theme={theme}
              label={item.title}
              value={item.value}
              sub={item.subtitle}
              hint={locale === "en" ? "workspace strip" : "workspace strip"}
            />
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {[
            {
              title: locale === "en" ? "Active" : "進行中",
              value: openCount,
              subtitle:
                locale === "en"
                  ? "open + investigating"
                  : "open + investigating",
            },
            {
              title: locale === "en" ? "Major" : "重大事故",
              value: majorCount,
              subtitle:
                locale === "en"
                  ? "critical + high severity"
                  : "critical + high severity",
            },
            {
              title: locale === "en" ? "Resolved 30d" : "30 天內受控",
              value: resolved30dCount,
              subtitle:
                locale === "en"
                  ? "resolved / closed within 30 days"
                  : "30 天內 resolved / closed",
            },
          ].map((item) => (
            <KPI
              key={item.title}
              theme={theme}
              label={item.title}
              value={item.value}
              sub={item.subtitle}
              hint={locale === "en" ? "kpi strip" : "kpi strip"}
            />
          ))}
        </div>

        <Card
          theme={theme}
          title={locale === "en" ? "Incident lanes" : "事故分流"}
          subtitle={
            locale === "en"
              ? "Canvas-style quick lanes for active, resolved, and closed work. These buttons drive the list filter below."
              : "以 canvas 版型呈現的快捷分流，直接驅動下方列表篩選。"
          }
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            {[
              {
                key: "active" as const,
                label: locale === "en" ? "Active lane" : "進行中",
                count: openCount,
                selected:
                  statusFilter !== "resolved" && statusFilter !== "closed",
                onClick: () => setStatusFilter("all"),
                tone: "danger" as const,
              },
              {
                key: "resolved" as const,
                label: locale === "en" ? "Resolved lane" : "已受控",
                count: records.filter((record) => record.status === "resolved")
                  .length,
                selected: statusFilter === "resolved",
                onClick: () => setStatusFilter("resolved"),
                tone: "success" as const,
              },
              {
                key: "closed" as const,
                label: locale === "en" ? "Closed lane" : "已結案",
                count: records.filter((record) => record.status === "closed")
                  .length,
                selected: statusFilter === "closed",
                onClick: () => setStatusFilter("closed"),
                tone: "neutral" as const,
              },
            ].map((lane) => (
              <button
                key={lane.key}
                type="button"
                onClick={lane.onClick}
                style={{
                  borderRadius: 12,
                  border: `1px solid ${lane.selected ? theme.accentBorder : theme.border}`,
                  background: lane.selected ? theme.accentBg : theme.surface,
                  color: theme.text,
                  padding: "14px 16px",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <Pill theme={theme} tone={lane.tone} dot>
                    {lane.label}
                  </Pill>
                  <span
                    style={{
                      fontFamily: theme.monoFamily,
                      fontSize: 20,
                      fontWeight: 700,
                    }}
                  >
                    {lane.count}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 10,
                    color: theme.textMuted,
                    fontSize: 11.5,
                    lineHeight: 1.6,
                  }}
                >
                  {lane.key === "active"
                    ? locale === "en"
                      ? "Open + investigating incidents stay here for coordination."
                      : "Open 與 investigating 事故維持在此分流持續協調。"
                    : lane.key === "resolved"
                      ? locale === "en"
                        ? "Recovery completed, waiting for formal closure or follow-up."
                        : "Recovery 已完成，等待正式結案或後續追蹤。"
                      : locale === "en"
                        ? "Closed incidents remain searchable and linked for audit."
                        : "已結案事故仍保留搜尋與 audit 關聯。"}
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card
          theme={theme}
          title="Governance guardrail · 三條鐵律"
          subtitle={
            locale === "en"
              ? "Ops policy text from the packet. Frontend may visualize it, but must not rewrite it."
              : "來自 packet 的 ops policy 文字。前端可以視覺化，但不能改寫其含義。"
          }
        >
          <ol
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 12.5,
              lineHeight: 1.8,
            }}
          >
            <li>
              {locale === "en"
                ? "Driver SOS + dispatch-exception incidents remain ops-owned even after order / complaint linkage."
                : "Driver SOS + dispatch-exception incidents 即使後續連結到 order / complaint，仍維持 ops-owned。"}
            </li>
            <li>
              {locale === "en"
                ? "Service recovery action is not the same thing as a timeline update or a formal resolution note."
                : "Service recovery action 不等於 timeline update，也不等於正式 resolution note。"}
            </li>
            <li>
              {locale === "en"
                ? "Escalation target does not silently transfer ownership; acknowledgment is required."
                : "Escalation target 不代表默默轉移 owner；必須有 acknowledgment。"}
            </li>
          </ol>
        </Card>

        <Card
          theme={theme}
          title={locale === "en" ? "Priority queue" : "Priority queue"}
          subtitle={
            locale === "en"
              ? "Major severity + SOS signals, separated from the full list."
              : "重大嚴重度 + SOS 訊號，獨立於完整列表之外。"
          }
        >
          {hasAllClearState ? (
            <Banner
              theme={theme}
              tone="success"
              icon="check"
              title={
                locale === "en"
                  ? "No major incidents are active"
                  : "目前沒有重大事故進行中"
              }
              body={
                locale === "en"
                  ? "All active incidents are below the major / SOS threshold. Continue monitoring the full list for owner and recovery gaps."
                  : "目前所有進行中事故都低於重大 / SOS 門檻，請持續從完整列表追蹤 owner 與 recovery 缺口。"
              }
            />
          ) : null}
          {priorityQueue.length === 0 ? (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: 10,
                background: theme.successBg,
                border: `1px solid ${theme.successBorder}`,
                color: theme.success,
                fontSize: 12.5,
              }}
            >
              {locale === "en"
                ? "No major or SOS incidents right now. Operations status is calm."
                : "目前沒有重大事故或 SOS 事件，現況正常。"}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {priorityQueue.slice(0, 6).map((record) => (
                <div
                  key={record.incidentId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${theme.dangerBorder}`,
                    background: theme.surface,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <Link
                        href={`/incidents/${encodeURIComponent(record.incidentId)}`}
                        style={{
                          color: theme.accent,
                          textDecoration: "none",
                          fontWeight: 700,
                        }}
                      >
                        {record.incidentId}
                      </Link>
                      {renderSeverityBadge(record.severity, locale)}
                      {renderStatusBadge(record.status, locale)}
                    </div>
                    <div style={{ marginTop: 4, fontWeight: 600 }}>
                      {record.title}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        color: theme.textMuted,
                        fontSize: 11.5,
                      }}
                    >
                      {record.description}
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                      }}
                    >
                      {record.relatedOrderId ? (
                        <Pill theme={theme} tone="info">
                          {locale === "en" ? "dispatch linked" : "已連結派遣"}
                        </Pill>
                      ) : null}
                      {record.serviceRecoveryActions.length === 0 ? (
                        <Pill theme={theme} tone="warn">
                          {locale === "en"
                            ? "recovery missing"
                            : "尚未記錄 recovery"}
                        </Pill>
                      ) : null}
                      {!record.assignedTo ? (
                        <Pill theme={theme} tone="danger">
                          {locale === "en" ? "owner missing" : "尚未指派"}
                        </Pill>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                    <span
                      style={{
                        fontFamily: theme.monoFamily,
                        color: theme.textMuted,
                      }}
                    >
                      {formatIncidentAge(
                        record.occurredAt ?? record.createdAt,
                        locale,
                      )}
                    </span>
                    <Link
                      href={`/incidents/${encodeURIComponent(record.incidentId)}`}
                      style={{ textDecoration: "none" }}
                    >
                      <Btn theme={theme} variant="secondary" icon="arrow">
                        {locale === "en" ? "Open" : "開啟"}
                      </Btn>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          theme={theme}
          title={locale === "en" ? "Full list" : "完整列表"}
          subtitle={
            locale === "en"
              ? `${formatRefreshTier(refreshTier, locale)} · source ${refresh.source} · last snapshot ${formatDateTime(refresh.generatedAt, locale)} UTC`
              : `${formatRefreshTier(refreshTier, locale)} · 來源 ${refresh.source} · 最近快照 ${formatDateTime(refresh.generatedAt, locale)} UTC`
          }
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1.4fr repeat(3, minmax(0, 0.85fr)) auto auto auto",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                locale === "en"
                  ? "Search incident, order, driver, complaint"
                  : "搜尋 incident、order、driver、complaint"
              }
              style={inputStyle}
            />
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as IncidentStatus | "all")
              }
              style={inputStyle}
            >
              <option value="all">
                {locale === "en" ? "All status" : "全部狀態"}
              </option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatOpsCodeLabel(locale, status)}
                </option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={(event) =>
                setSeverityFilter(
                  event.target.value as IncidentSeverity | "all",
                )
              }
              style={inputStyle}
            >
              <option value="all">
                {locale === "en" ? "All severity" : "全部嚴重度"}
              </option>
              {SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {formatOpsCodeLabel(locale, severity)}
                </option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(
                  event.target.value as IncidentCategory | "all",
                )
              }
              style={inputStyle}
            >
              <option value="all">
                {locale === "en" ? "All category" : "全部分類"}
              </option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {formatOpsCodeLabel(locale, category)}
                </option>
              ))}
            </select>
            <Btn
              theme={theme}
              variant="ghost"
              onClick={() => {
                resetFilters();
              }}
            >
              {locale === "en" ? "Reset" : "重設"}
            </Btn>
          </div>

          {showCreate ? (
            <div style={{ marginBottom: 16 }}>
              <IncidentForm
                createMode={createMode}
                actionDescriptor={activeCreateAction}
                initialValues={createDefaults}
                onCancel={() => setShowCreate(false)}
                onSubmit={async (command) => {
                  try {
                    const client = getOpsClient();
                    if (
                      createMode === "dispatch_exception" &&
                      "orderId" in command &&
                      typeof command.orderId === "string" &&
                      command.orderId.trim()
                    ) {
                      await client.createIncidentFromDispatchException(
                        command as CreateIncidentFromDispatchExceptionCommand,
                      );
                    } else {
                      const created = await client.createIncident(
                        command as CreateIncidentCommand,
                      );
                      if (complaintCaseNoFromQuery) {
                        await client.linkIncidentToComplaint(
                          created.incidentId,
                          complaintCaseNoFromQuery,
                        );
                      }
                    }
                    setShowCreate(false);
                    await loadRecords(true);
                  } catch (submitError) {
                    setError(
                      submitError instanceof Error
                        ? submitError.message
                        : t("common.unknown"),
                    );
                  }
                }}
              />
            </div>
          ) : null}

          {loading ? (
            <div style={loadingStyle}>
              {locale === "en" ? "Loading incidents..." : "載入事故列表中..."}
            </div>
          ) : effectiveEmptyState ? (
            renderEmptyState(
              effectiveEmptyState,
              locale,
              refreshAction,
              createAction,
              handleAction,
              resetFilters,
            )
          ) : (
            <Table theme={theme} columns={tableColumns} rows={tableRows} />
          )}
        </Card>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 34,
  padding: "7px 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.text,
  fontSize: 12.5,
};

const loadingStyle: CSSProperties = {
  minHeight: 220,
  display: "grid",
  placeItems: "center",
  borderRadius: 10,
  background: theme.surfaceLo,
  color: theme.textMuted,
  fontSize: 12.5,
};

function IncidentForm({
  createMode,
  actionDescriptor,
  initialValues,
  onCancel,
  onSubmit,
}: {
  createMode: IncidentCreateMode;
  actionDescriptor?: ResourceActionDescriptor | null;
  initialValues?: IncidentFormInitialValues;
  onCancel: () => void;
  onSubmit: (command: IncidentDraftCommand) => Promise<void>;
}) {
  const { t, locale } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [pendingCommand, setPendingCommand] =
    useState<IncidentDraftCommand | null>(null);
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [description, setDescription] = useState(
    initialValues?.description ?? "",
  );
  const [category, setCategory] = useState<IncidentCategory>(
    initialValues?.category ?? "operational",
  );
  const [severity, setSeverity] = useState<IncidentSeverity>(
    initialValues?.severity ?? "medium",
  );
  const [relatedOrderId, setRelatedOrderId] = useState(
    initialValues?.relatedOrderId ?? "",
  );
  const [relatedVehicleId, setRelatedVehicleId] = useState(
    initialValues?.relatedVehicleId ?? "",
  );
  const [relatedDriverId, setRelatedDriverId] = useState(
    initialValues?.relatedDriverId ?? "",
  );
  const [reportedBy, setReportedBy] = useState(
    initialValues?.reportedBy ?? "ops-user-001",
  );
  const [occurredAt, setOccurredAt] = useState(initialValues?.occurredAt ?? "");
  const [location, setLocation] = useState(initialValues?.location ?? "");
  const [escalationTarget, setEscalationTarget] = useState<
    IncidentEscalationTarget | ""
  >("");
  const [exceptionReasonCode, setExceptionReasonCode] = useState(
    initialValues?.exceptionReasonCode ?? "",
  );
  const [exceptionNote, setExceptionNote] = useState(
    initialValues?.exceptionNote ?? "",
  );

  const dispatchExceptionOrderId =
    initialValues?.dispatchExceptionOrderId?.trim() ?? "";
  const isDispatchExceptionCreate =
    createMode === "dispatch_exception" && dispatchExceptionOrderId.length > 0;
  const requiresConfirmation =
    actionDescriptor?.riskLevel === "medium" ||
    actionDescriptor?.riskLevel === "high";

  function submitCommand(command: IncidentDraftCommand) {
    startTransition(() => {
      void onSubmit(command).then(() => {
        setPendingCommand(null);
      });
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const command: IncidentDraftCommand = isDispatchExceptionCreate
      ? {
          orderId: dispatchExceptionOrderId,
          exceptionReasonCode:
            exceptionReasonCode.trim() || "dispatch_exception",
          ...(exceptionNote.trim()
            ? { exceptionNote: exceptionNote.trim() }
            : {}),
          severity,
          ...(escalationTarget ? { escalationTarget } : {}),
          reportedBy: reportedBy.trim() || "ops-user-001",
        }
      : {
          title: title.trim(),
          description: description.trim(),
          category,
          severity,
          reportedBy: reportedBy.trim() || "ops-user-001",
          ...(relatedOrderId.trim()
            ? { relatedOrderId: relatedOrderId.trim() }
            : {}),
          ...(relatedVehicleId.trim()
            ? { relatedVehicleId: relatedVehicleId.trim() }
            : {}),
          ...(relatedDriverId.trim()
            ? { relatedDriverId: relatedDriverId.trim() }
            : {}),
          ...(occurredAt
            ? { occurredAt: new Date(occurredAt).toISOString() }
            : {}),
          ...(location.trim() ? { location: location.trim() } : {}),
        };

    if (requiresConfirmation) {
      setPendingCommand(command);
      return;
    }

    submitCommand(command);
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        background: theme.surface,
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>
            {isDispatchExceptionCreate
              ? locale === "en"
                ? "Create incident from dispatch exception"
                : "從派遣異常建立事故"
              : locale === "en"
                ? "Create incident"
                : "建立事故"}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: theme.textMuted }}>
            {isDispatchExceptionCreate
              ? locale === "en"
                ? `Source order ${dispatchExceptionOrderId}`
                : `來源訂單 ${dispatchExceptionOrderId}`
              : locale === "en"
                ? "Manual incident create"
                : "手動建立 incident"}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        {!isDispatchExceptionCreate ? (
          <>
            <label style={labelStyle}>
              {t("incidents.form.title")}
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("incidents.form.reportedBy")}
              <input
                value={reportedBy}
                onChange={(event) => setReportedBy(event.target.value)}
                required
                style={inputStyle}
              />
            </label>
            <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
              {t("incidents.form.description")}
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>
            <label style={labelStyle}>
              {t("incidents.form.category")}
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as IncidentCategory)
                }
                style={inputStyle}
              >
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {formatOpsCodeLabel(locale, item)}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label style={labelStyle}>
              {locale === "en" ? "Reported by" : "通報者"}
              <input
                value={reportedBy}
                onChange={(event) => setReportedBy(event.target.value)}
                required
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {locale === "en" ? "Dispatch reason code" : "派遣異常原因碼"}
              <input
                value={exceptionReasonCode}
                onChange={(event) => setExceptionReasonCode(event.target.value)}
                required
                style={inputStyle}
              />
            </label>
            <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
              {locale === "en" ? "Exception note" : "異常備註"}
              <textarea
                value={exceptionNote}
                onChange={(event) => setExceptionNote(event.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>
          </>
        )}

        <label style={labelStyle}>
          {t("incidents.form.severity")}
          <select
            value={severity}
            onChange={(event) =>
              setSeverity(event.target.value as IncidentSeverity)
            }
            style={inputStyle}
          >
            {SEVERITIES.map((item) => (
              <option key={item} value={item}>
                {formatOpsCodeLabel(locale, item)}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          {t("incidents.form.escalation")}
          <select
            value={escalationTarget}
            onChange={(event) =>
              setEscalationTarget(
                event.target.value as IncidentEscalationTarget | "",
              )
            }
            style={inputStyle}
          >
            <option value="">{t("incidents.form.escalationNone")}</option>
            {ESCALATION_TARGETS.map((item) => (
              <option key={item} value={item}>
                {t(`incidents.escalationBadge.${item}` as any)}
              </option>
            ))}
          </select>
        </label>

        {!isDispatchExceptionCreate ? (
          <>
            <label style={labelStyle}>
              {t("incidents.form.relatedOrder")}
              <input
                value={relatedOrderId}
                onChange={(event) => setRelatedOrderId(event.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("incidents.form.relatedVehicle")}
              <input
                value={relatedVehicleId}
                onChange={(event) => setRelatedVehicleId(event.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("incidents.form.relatedDriver")}
              <input
                value={relatedDriverId}
                onChange={(event) => setRelatedDriverId(event.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("incidents.form.occurredAt")}
              <input
                type="datetime-local"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
              {t("incidents.form.location")}
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                style={inputStyle}
              />
            </label>
          </>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Btn
          theme={theme}
          variant="primary"
          type="submit"
          icon="plus"
          disabled={pending || actionDescriptor?.enabled === false}
        >
          {isDispatchExceptionCreate
            ? locale === "en"
              ? "Create from exception"
              : "從異常建立"
            : locale === "en"
              ? "Create incident"
              : "建立事故"}
        </Btn>
        <Btn theme={theme} variant="secondary" type="button" onClick={onCancel}>
          {t("common.cancel")}
        </Btn>
      </div>

      {pendingCommand ? (
        <div style={confirmOverlayStyle}>
          <div style={confirmDialogStyle}>
            <div style={{ display: "grid", gap: 10 }}>
              <Pill
                theme={theme}
                tone={
                  actionDescriptor?.riskLevel === "high" ? "danger" : "warn"
                }
              >
                {locale === "en"
                  ? `${actionDescriptor?.riskLevel ?? "medium"} risk action`
                  : `${actionDescriptor?.riskLevel === "high" ? "高" : "中"}風險動作`}
              </Pill>
              <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>
                {isDispatchExceptionCreate
                  ? locale === "en"
                    ? "Confirm incident creation from dispatch exception"
                    : "確認從派遣異常建立事故"
                  : locale === "en"
                    ? "Confirm incident creation"
                    : "確認建立事故"}
              </div>
              <div
                style={{
                  color: theme.textMuted,
                  fontSize: 12.5,
                  lineHeight: 1.7,
                }}
              >
                {isDispatchExceptionCreate
                  ? locale === "en"
                    ? `Order ${dispatchExceptionOrderId} will create an ops-owned incident with severity ${formatOpsCodeLabel(locale, severity)}. Review the exception reason before continuing.`
                    : `訂單 ${dispatchExceptionOrderId} 將建立一筆維持 ops-owned 的事故，嚴重度為 ${formatOpsCodeLabel(locale, severity)}。送出前請再次確認異常原因。`
                  : locale === "en"
                    ? `Incident “${title.trim()}” will be created with ${formatOpsCodeLabel(locale, category)} / ${formatOpsCodeLabel(locale, severity)}.`
                    : `事故「${title.trim()}」將以 ${formatOpsCodeLabel(locale, category)} / ${formatOpsCodeLabel(locale, severity)} 建立。`}
              </div>
              {isDispatchExceptionCreate ? (
                <div style={confirmSummaryStyle}>
                  <div>
                    <strong>{locale === "en" ? "Reason" : "原因"}</strong>
                    <div>
                      {exceptionReasonCode.trim() || "dispatch_exception"}
                    </div>
                  </div>
                  {exceptionNote.trim() ? (
                    <div>
                      <strong>{locale === "en" ? "Note" : "備註"}</strong>
                      <div>{exceptionNote.trim()}</div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div style={confirmSummaryStyle}>
                  <div>
                    <strong>
                      {locale === "en" ? "Reported by" : "通報者"}
                    </strong>
                    <div>{reportedBy.trim() || "ops-user-001"}</div>
                  </div>
                  {relatedOrderId.trim() ? (
                    <div>
                      <strong>{locale === "en" ? "Order" : "訂單"}</strong>
                      <div>{relatedOrderId.trim()}</div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <Btn
                theme={theme}
                variant="primary"
                icon="check"
                disabled={pending}
                onClick={() => submitCommand(pendingCommand)}
              >
                {isDispatchExceptionCreate
                  ? locale === "en"
                    ? "Confirm create"
                    : "確認建立"
                  : locale === "en"
                    ? "Confirm incident"
                    : "確認事故"}
              </Btn>
              <Btn
                theme={theme}
                variant="secondary"
                disabled={pending}
                onClick={() => setPendingCommand(null)}
              >
                {locale === "en" ? "Back" : "返回"}
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  color: theme.textMuted,
};

const confirmOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(4, 8, 20, 0.72)",
  display: "grid",
  placeItems: "center",
  padding: 24,
  zIndex: 60,
};

const confirmDialogStyle: CSSProperties = {
  width: "min(560px, 100%)",
  borderRadius: 16,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)",
  padding: 20,
};

const confirmSummaryStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  padding: 12,
  fontSize: 12.5,
  color: theme.text,
};

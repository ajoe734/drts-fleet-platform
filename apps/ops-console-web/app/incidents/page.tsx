"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import {
  type CSSProperties,
  useDeferredValue,
  useEffect,
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
  RecordServiceRecoveryActionCommand,
  ResourceActionDescriptor,
  UiCollectionEnvelope,
  UiRefreshMetadata,
  UpdateIncidentCommand,
} from "@drts/contracts";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_ESCALATION_TARGETS,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
} from "@drts/contracts";
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
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel } from "@/lib/localized-labels";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const STATUSES: IncidentStatus[] = [...INCIDENT_STATUSES];
const SEVERITIES: IncidentSeverity[] = [...INCIDENT_SEVERITIES];
const CATEGORIES: IncidentCategory[] = [...INCIDENT_CATEGORIES];
const ESCALATION_TARGETS: IncidentEscalationTarget[] = [
  ...INCIDENT_ESCALATION_TARGETS,
];
const SERVICE_RECOVERY_TYPES = [
  "passenger_recontact",
  "fare_adjustment",
  "redispatch_ordered",
  "voucher_issued",
  "apology_sent",
  "driver_reassigned",
  "other",
] as const;
const FEED_EMPTY_REASON_VALUES: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
];

const DEFAULT_REFRESH_METADATA: UiRefreshMetadata = {
  generatedAt: new Date(0).toISOString(),
  staleAfterMs: 15_000,
  dataFreshness: "unknown",
  source: "live",
};

const pageBodyStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const workspaceStripStyle = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "minmax(0, 1.3fr) minmax(260px, 0.8fr)",
  alignItems: "start",
};

const kpiGridStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
};

const splitGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.55fr) minmax(320px, 0.95fr)",
  alignItems: "start",
};

const sideStackStyle = {
  display: "grid",
  gap: 16,
  alignContent: "start",
};

const chipRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap" as const,
  justifyContent: "flex-end",
};

const chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceHi,
  color: theme.textMuted,
  fontSize: 11.5,
  fontWeight: 600,
};

const filterGridStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "minmax(240px, 1.5fr) repeat(3, minmax(0, 0.7fr))",
  alignItems: "end",
};

const fieldLabelStyle = {
  display: "grid",
  gap: 6,
  color: theme.text,
  fontSize: 12,
  fontWeight: 600,
};

const inputBaseStyle = {
  width: "100%",
  background: theme.surface,
  color: theme.text,
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
} satisfies CSSProperties;

const linkStackStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 4,
  whiteSpace: "normal" as const,
};

const helperTextStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.5,
};

const actionClusterStyle = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap" as const,
  alignItems: "center",
};

type IncidentTab = "active" | "resolved" | "closed";

type IncidentTableRow = Record<string, unknown> &
  IncidentRecord & {
    _selected?: boolean;
  };

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
};

type LocaleCode = "en" | "zh";

type IncidentRow = Record<string, unknown> & {
  incidentCell: ReactNode;
  severityCell: ReactNode;
  statusCell: ReactNode;
  linksCell: ReactNode;
  reportedCell: ReactNode;
  recoveryCell: ReactNode;
  actionsCell: ReactNode;
  _selected?: boolean;
};

function formatDateTime(
  locale: LocaleCode,
  value: string | null | undefined,
  includeYear = false,
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    ...(includeYear ? { year: "numeric" as const } : {}),
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

function formatTableDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Date(value).toISOString().slice(0, 16).replace("T", " ");
}

function formatIncidentAge(
  locale: LocaleCode,
  value: string | null | undefined,
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
  return locale === "en" ? `${deltaHours} hr ago` : `${deltaHours} 小時前`;
}

function isActiveIncident(status: IncidentStatus) {
  return status === "open" || status === "investigating";
}

function isMajorIncident(record: IncidentRecord) {
  return record.severity === "critical" || record.severity === "high";
}

function isSosIncident(record: IncidentRecord) {
  const needle = `${record.title} ${record.description}`.toLowerCase();
  return (
    record.category === "safety" ||
    record.category === "driver_injury" ||
    record.category === "passenger_injury" ||
    needle.includes("sos")
  );
}

function hasLinkedEntity(record: IncidentRecord) {
  return Boolean(
    record.relatedOrderId ||
    record.relatedVehicleId ||
    record.relatedDriverId ||
    record.relatedComplaintCaseNo,
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

function compareIncidentPriority(a: IncidentRecord, b: IncidentRecord) {
  const activeDelta =
    Number(isActiveIncident(b.status)) - Number(isActiveIncident(a.status));
  if (activeDelta !== 0) {
    return activeDelta;
  }

  const priorityDelta =
    Number(isMajorIncident(b) || isSosIncident(b)) -
    Number(isMajorIncident(a) || isSosIncident(a));
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const severityDelta =
    incidentSeverityWeight(b.severity) - incidentSeverityWeight(a.severity);
  if (severityDelta !== 0) {
    return severityDelta;
  }

  return (
    new Date(b.occurredAt ?? b.createdAt).getTime() -
    new Date(a.occurredAt ?? a.createdAt).getTime()
  );
}

function getSeverityTone(severity: IncidentSeverity): CanvasTone {
  if (severity === "critical") {
    return "danger";
  }
  if (severity === "high") {
    return "warn";
  }
  if (severity === "medium") {
    return "accent";
  }
  return "info";
}

function getStatusTone(status: IncidentStatus): CanvasTone {
  if (status === "resolved" || status === "closed") {
    return "success";
  }
  if (status === "investigating") {
    return "warn";
  }
  return "info";
}

function getFreshnessTone(
  freshness: UiRefreshMetadata["dataFreshness"],
): Exclude<CanvasTone, "neutral"> {
  switch (freshness) {
    case "degraded":
      return "danger";
    case "stale":
      return "warn";
    case "fresh":
      return "success";
    case "unknown":
    default:
      return "info";
  }
}

function resolveCurrentFreshness(
  metadata: UiRefreshMetadata,
  hasError: boolean,
): UiRefreshMetadata["dataFreshness"] {
  if (
    hasError &&
    metadata.generatedAt !== DEFAULT_REFRESH_METADATA.generatedAt
  ) {
    return "stale";
  }

  if (metadata.dataFreshness === "degraded") {
    return "degraded";
  }

  if (metadata.generatedAt === DEFAULT_REFRESH_METADATA.generatedAt) {
    return "unknown";
  }

  const generatedAt = new Date(metadata.generatedAt).getTime();
  if (!Number.isFinite(generatedAt)) {
    return "unknown";
  }

  return Date.now() - generatedAt > metadata.staleAfterMs
    ? "stale"
    : metadata.dataFreshness;
}

function getActionLabel(action: string, locale: LocaleCode) {
  if (locale === "en") {
    switch (action) {
      case "create_incident":
        return "Create incident";
      case "create_incident_from_dispatch_exception":
        return "Dispatch exception handoff";
      case "refresh_incidents":
        return "Refresh";
      case "open_incident_detail":
        return "Open detail";
      case "add_service_recovery":
        return "Log recovery";
      case "open_feature_flags":
        return "Open feature flags";
      case "open_dashboard":
        return "Open dashboard";
      case "clear_filters":
        return "Clear filters";
      default:
        return action;
    }
  }

  switch (action) {
    case "create_incident":
      return "新增事故";
    case "create_incident_from_dispatch_exception":
      return "派遣異常轉事故";
    case "refresh_incidents":
      return "重新整理";
    case "open_incident_detail":
      return "開啟詳情";
    case "add_service_recovery":
      return "記錄恢復";
    case "open_feature_flags":
      return "查看旗標";
    case "open_dashboard":
      return "回到儀表板";
    case "clear_filters":
      return "清除篩選";
    default:
      return action;
  }
}

function getDisabledReasonLabel(code: string | undefined, locale: LocaleCode) {
  if (!code) {
    return undefined;
  }

  if (code === "dispatch_context_required") {
    return locale === "en"
      ? "Open this workspace from a dispatch exception to enable direct handoff."
      : "需從派遣異常情境進入此頁，才能直接執行轉事故。";
  }

  return code;
}

function getEmptyStatePresentation(
  reason: EmptyReason | "filtered_empty",
  locale: LocaleCode,
) {
  if (locale === "en") {
    switch (reason) {
      case "not_provisioned":
        return {
          icon: "flags" as const,
          tone: "warn" as const,
          title: "Incident center is not provisioned",
          body: "This tenant or realm has not enabled the incidents workflow yet.",
        };
      case "fetch_failed":
        return {
          icon: "warn" as const,
          tone: "danger" as const,
          title: "Incident feed could not be loaded",
          body: "The latest request failed. Retry or fall back to the dashboard while the dependency recovers.",
        };
      case "permission_denied":
        return {
          icon: "audit" as const,
          tone: "warn" as const,
          title: "You do not have incident scope",
          body: "This role can view the app shell but cannot open the incident workspace data set.",
        };
      case "external_unavailable":
        return {
          icon: "adapters" as const,
          tone: "danger" as const,
          title: "Linked ops dependency is unavailable",
          body: "An upstream adapter or mirrored source is down. The workspace is waiting for recovery.",
        };
      case "filtered_empty":
        return {
          icon: "filter" as const,
          tone: "info" as const,
          title: "Filters narrowed the list to zero",
          body: "Broaden status, severity, category, or search to bring incidents back into view.",
        };
      case "no_data":
      default:
        return {
          icon: "incidents" as const,
          tone: "success" as const,
          title: "No incidents in scope",
          body: "There are currently no incidents in the live workspace snapshot.",
        };
    }
  }

  switch (reason) {
    case "not_provisioned":
      return {
        icon: "flags" as const,
        tone: "warn" as const,
        title: "事故流程尚未啟用",
        body: "此租戶或 realm 還沒有開啟 incidents workflow。",
      };
    case "fetch_failed":
      return {
        icon: "warn" as const,
        tone: "danger" as const,
        title: "事故清單載入失敗",
        body: "最新請求失敗，請重試或先回到 dashboard 追蹤依賴恢復。",
      };
    case "permission_denied":
      return {
        icon: "audit" as const,
        tone: "warn" as const,
        title: "目前角色沒有事故權限",
        body: "可看到 app shell，但無法讀取事故 workspace 資料。",
      };
    case "external_unavailable":
      return {
        icon: "adapters" as const,
        tone: "danger" as const,
        title: "上游依賴目前不可用",
        body: "某個 adapter 或鏡像來源異常，incident workspace 正等待恢復。",
      };
    case "filtered_empty":
      return {
        icon: "filter" as const,
        tone: "info" as const,
        title: "篩選後沒有結果",
        body: "請放寬狀態、嚴重程度、類別或搜尋條件。",
      };
    case "no_data":
    default:
      return {
        icon: "incidents" as const,
        tone: "success" as const,
        title: "目前沒有事故",
        body: "現在的即時快照中沒有任何事故資料。",
      };
  }
}

function resolveRequestedEmptyReason(
  value: string | null,
): EmptyReason | undefined {
  if (!value) {
    return undefined;
  }

  return FEED_EMPTY_REASON_VALUES.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : undefined;
}

function buildActionLinkStyle(
  variant: "primary" | "secondary" | "ghost" = "secondary",
  disabled = false,
): CSSProperties {
  if (variant === "primary") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 28,
      padding: "5px 10px",
      borderRadius: 7,
      background: theme.accent,
      color: "#ffffff",
      border: `1px solid ${theme.accent}`,
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1,
      textDecoration: "none",
      opacity: disabled ? 0.55 : 1,
      pointerEvents: disabled ? "none" : "auto",
    };
  }

  if (variant === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 28,
      padding: "5px 10px",
      borderRadius: 7,
      background: "transparent",
      color: theme.textMuted,
      border: "1px solid transparent",
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1,
      textDecoration: "none",
      opacity: disabled ? 0.55 : 1,
      pointerEvents: disabled ? "none" : "auto",
    };
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 28,
    padding: "5px 10px",
    borderRadius: 7,
    background: theme.surface,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
    opacity: disabled ? 0.55 : 1,
    pointerEvents: disabled ? "none" : "auto",
  };
}

function buildActionButtonStyle(
  variant: "primary" | "secondary" = "secondary",
  disabled = false,
): CSSProperties {
  const linkStyle = buildActionLinkStyle(variant, disabled);
  return {
    ...linkStyle,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: theme.fontFamily,
  };
}

function buildFallbackFeedActions(
  dispatchExceptionOrderId: string,
  dispatchExceptionReasonCode: string,
): ResourceActionDescriptor[] {
  const enabled = Boolean(
    dispatchExceptionOrderId.trim() && dispatchExceptionReasonCode.trim(),
  );

  return [
    {
      action: "create_incident",
      enabled: true,
      riskLevel: "medium",
    },
    {
      action: "create_incident_from_dispatch_exception",
      enabled,
      ...(!enabled ? { disabledReasonCode: "dispatch_context_required" } : {}),
      riskLevel: "medium",
    },
    {
      action: "refresh_incidents",
      enabled: true,
      riskLevel: "low",
    },
  ];
}

export default function IncidentsPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [feed, setFeed] = useState<UiCollectionEnvelope<IncidentRecord> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<IncidentTab>("active");
  const [severityFilter, setSeverityFilter] = useState<
    IncidentSeverity | "all"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<
    IncidentCategory | "all"
  >("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recoveryIncidentId, setRecoveryIncidentId] = useState<string | null>(
    null,
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(
    null,
  );
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const createFromQuery = searchParams.get("create") === "1";
  const incidentIdFromQuery = searchParams.get("incidentId");
  const complaintCaseNoFromQuery =
    searchParams.get("complaintCaseNo")?.trim() ?? "";
  const requestedEmptyReason = resolveRequestedEmptyReason(
    searchParams.get("emptyReason"),
  );
  const dispatchExceptionOrderId =
    searchParams.get("dispatchExceptionOrderId")?.trim() ??
    searchParams.get("sourceDispatchExceptionOrderId")?.trim() ??
    "";
  const dispatchExceptionReasonCode =
    searchParams.get("exceptionReasonCode")?.trim() ?? "";
  const dispatchExceptionNote =
    searchParams.get("exceptionNote")?.trim() ??
    searchParams.get("description")?.trim() ??
    "";
  const dispatchExceptionSeverity = SEVERITIES.includes(
    searchParams.get("severity") as IncidentSeverity,
  )
    ? (searchParams.get("severity") as IncidentSeverity)
    : "medium";
  const dispatchExceptionEscalationTarget = ESCALATION_TARGETS.includes(
    searchParams.get("escalationTarget") as IncidentEscalationTarget,
  )
    ? (searchParams.get("escalationTarget") as IncidentEscalationTarget)
    : undefined;

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
      searchParams.get("relatedOrderId") ??
      searchParams.get("sourceOrderId") ??
      "",
    relatedVehicleId: searchParams.get("relatedVehicleId") ?? "",
    relatedDriverId: searchParams.get("relatedDriverId") ?? "",
    reportedBy: searchParams.get("reportedBy") ?? "ops-user-001",
    location: searchParams.get("location") ?? "",
  };

  async function loadFeed(options?: { silent?: boolean }) {
    const shouldShowLoading = !options?.silent || !feed;
    if (shouldShowLoading) {
      setLoading(true);
    }

    try {
      const requestOptions: {
        emptyReason?: string;
        dispatchExceptionOrderId?: string;
        exceptionReasonCode?: string;
      } = {};
      if (requestedEmptyReason) {
        requestOptions.emptyReason = requestedEmptyReason;
      }
      if (dispatchExceptionOrderId) {
        requestOptions.dispatchExceptionOrderId = dispatchExceptionOrderId;
      }
      if (dispatchExceptionReasonCode) {
        requestOptions.exceptionReasonCode = dispatchExceptionReasonCode;
      }
      const nextFeed =
        await getOpsClient().getIncidentCenterFeed(requestOptions);
      setFeed(nextFeed);
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : t("common.unknown"),
      );
    } finally {
      if (shouldShowLoading) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadFeed();
  }, [
    requestedEmptyReason,
    dispatchExceptionOrderId,
    dispatchExceptionReasonCode,
  ]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadFeed({ silent: true });
    }, 15_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    requestedEmptyReason,
    dispatchExceptionOrderId,
    dispatchExceptionReasonCode,
  ]);

  useEffect(() => {
    if (!createFromQuery) {
      return;
    }

    setShowCreate(true);
    setEditingId(null);
  }, [createFromQuery]);

  useEffect(() => {
    if (!incidentIdFromQuery) {
      return;
    }

    setRecoveryIncidentId(incidentIdFromQuery);
  }, [incidentIdFromQuery]);

  const records = feed?.items ?? [];
  const selectedRecoveryIncident =
    records.find(
      (record: IncidentRecord) => record.incidentId === recoveryIncidentId,
    ) ?? null;

  const filteredRecords = useMemo(
    () =>
      [...records]
        .filter((record: IncidentRecord) => {
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
            record.reportedBy,
            record.relatedOrderId ?? "",
            record.relatedVehicleId ?? "",
            record.relatedDriverId ?? "",
            record.relatedComplaintCaseNo ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(deferredQuery);
        })
        .sort(compareIncidentPriority),
    [records, statusFilter, severityFilter, categoryFilter, deferredQuery],
  );

  const priorityQueue = useMemo(
    () =>
      [...records]
        .filter(
          (record: IncidentRecord) =>
            isMajorIncident(record) || isSosIncident(record),
        )
        .sort(compareIncidentPriority),
    [records],
  );

  const pendingMajorCount = records.filter(
    (record: IncidentRecord) =>
      isMajorIncident(record) && isActiveIncident(record.status),
  ).length;
  const unrecordedRecoveryCount = records.filter(
    (record: IncidentRecord) =>
      isActiveIncident(record.status) &&
      record.serviceRecoveryActions.length === 0,
  ).length;
  const linkedEntityCount = records.filter((record: IncidentRecord) =>
    hasLinkedEntity(record),
  ).length;
  const activeCount = records.filter((record: IncidentRecord) =>
    isActiveIncident(record.status),
  ).length;
  const majorCount = records.filter((record: IncidentRecord) =>
    isMajorIncident(record),
  ).length;
  const resolvedLast30DaysCount = records.filter((record: IncidentRecord) => {
    if (record.status !== "resolved" && record.status !== "closed") {
      return false;
    }
    return (
      Date.now() - new Date(record.updatedAt).getTime() <=
      30 * 24 * 60 * 60 * 1000
    );
  }).length;

  const refreshMetadata = feed?.refreshMetadata ?? DEFAULT_REFRESH_METADATA;
  const currentFreshness = resolveCurrentFreshness(
    refreshMetadata,
    Boolean(error),
  );
  const pageActions =
    feed?.availableActions ??
    buildFallbackFeedActions(
      dispatchExceptionOrderId,
      dispatchExceptionReasonCode,
    );

  const emptyState = useMemo<EmptyStateEnvelope | null>(() => {
    if (error && records.length === 0) {
      return {
        reason: "fetch_failed",
        messageCode: "incidents.empty.fetch_failed",
        nextAction: {
          action: "refresh_incidents",
          enabled: true,
          riskLevel: "low",
        },
      };
    }

    if (filteredRecords.length === 0) {
      if (records.length > 0) {
        return {
          reason: "filtered_empty",
          messageCode: "incidents.empty.filtered_empty",
          nextAction: {
            action: "clear_filters",
            enabled: true,
            riskLevel: "low",
          },
        };
      }

      return (
        feed?.emptyState ?? {
          reason: "no_data",
          messageCode: "incidents.empty.no_data",
          nextAction: {
            action: "create_incident",
            enabled: true,
            riskLevel: "medium",
          },
        }
      );
    }

    return null;
  }, [error, records.length, filteredRecords.length, feed?.emptyState]);

  async function handlePageAction(action: ResourceActionDescriptor) {
    if (!action.enabled) {
      return;
    }

    if (action.action === "create_incident") {
      setShowCreate(true);
      setEditingId(null);
      return;
    }

    if (action.action === "clear_filters") {
      setQuery("");
      setStatusFilter("all");
      setSeverityFilter("all");
      setCategoryFilter("all");
      return;
    }

    if (action.action === "open_feature_flags") {
      router.push("/feature-flags");
      return;
    }

    if (action.action === "open_dashboard") {
      router.push("/dashboard");
      return;
    }

    if (action.action === "refresh_incidents") {
      setBusyAction(action.action);
      try {
        await loadFeed();
      } finally {
        setBusyAction(null);
      }
      return;
    }

    if (action.action === "create_incident_from_dispatch_exception") {
      if (!dispatchExceptionOrderId || !dispatchExceptionReasonCode) {
        return;
      }

      setBusyAction(action.action);
      try {
        const command: CreateIncidentFromDispatchExceptionCommand = {
          orderId: dispatchExceptionOrderId,
          exceptionReasonCode: dispatchExceptionReasonCode,
          severity: dispatchExceptionSeverity,
          reportedBy: createDefaults.reportedBy?.trim() || "ops-user-001",
          ...(dispatchExceptionNote
            ? { exceptionNote: dispatchExceptionNote }
            : {}),
          ...(dispatchExceptionEscalationTarget
            ? { escalationTarget: dispatchExceptionEscalationTarget }
            : {}),
        };
        const created =
          await getOpsClient().createIncidentFromDispatchException(command);
        setLastActionMessage(
          locale === "en"
            ? `Dispatch exception moved into incident ${created.incidentId}.`
            : `派遣異常已轉為事故 ${created.incidentId}。`,
        );
        router.push(`/incidents/${encodeURIComponent(created.incidentId)}`);
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : t("common.unknown"),
        );
      } finally {
        setBusyAction(null);
      }
    }
  }

  async function handleIncidentSubmit(
    command: CreateIncidentCommand | UpdateIncidentCommand,
  ) {
    try {
      const client = getOpsClient();
      if (editingId) {
        await client.updateIncident(
          editingId,
          command as UpdateIncidentCommand,
        );
        setLastActionMessage(
          locale === "en"
            ? `Incident ${editingId} updated.`
            : `事故 ${editingId} 已更新。`,
        );
        setEditingId(null);
        setShowCreate(false);
        await loadFeed();
        return;
      }

      const created = await client.createIncident(
        command as CreateIncidentCommand,
      );
      if (complaintCaseNoFromQuery) {
        await client.linkIncidentToComplaint(
          created.incidentId,
          complaintCaseNoFromQuery,
        );
      }
      setLastActionMessage(
        locale === "en"
          ? `Incident ${created.incidentId} created.`
          : `已建立事故 ${created.incidentId}。`,
      );
      setShowCreate(false);
      setEditingId(null);
      router.push(`/incidents/${encodeURIComponent(created.incidentId)}`);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : t("common.unknown"),
      );
    }
  }

  async function handleRecoverySubmit(
    command: RecordServiceRecoveryActionCommand,
  ) {
    if (!recoveryIncidentId) {
      return;
    }

    try {
      setBusyAction(`recovery:${recoveryIncidentId}`);
      await getOpsClient().recordServiceRecoveryAction(
        recoveryIncidentId,
        command,
      );
      setLastActionMessage(
        locale === "en"
          ? `Recovery action recorded for ${recoveryIncidentId}.`
          : `已為 ${recoveryIncidentId} 記錄恢復行動。`,
      );
      setRecoveryIncidentId(null);
      await loadFeed();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : t("common.unknown"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  function renderActionButton(
    action: ResourceActionDescriptor,
    options?: {
      variant?: "primary" | "secondary" | "ghost";
      size?: "xs" | "sm" | "md";
      busyKey?: string;
      onClick?: () => void;
    },
  ) {
    const title = getDisabledReasonLabel(action.disabledReasonCode, locale);

    return (
      <span key={action.action} title={title}>
        <Btn
          theme={theme}
          variant={options?.variant ?? "secondary"}
          size={options?.size ?? "sm"}
          disabled={!action.enabled || busyAction === options?.busyKey}
          onClick={() => {
            options?.onClick?.();
          }}
        >
          {getActionLabel(action.action, locale)}
        </Btn>
      </span>
    );
  }

  function renderHeaderAction(action: ResourceActionDescriptor) {
    if (action.action === "refresh_incidents") {
      return renderActionButton(action, {
        size: "sm",
        busyKey: action.action,
        onClick: () => {
          void handlePageAction(action);
        },
      });
    }

    return renderActionButton(action, {
      variant:
        action.action === "create_incident" ||
        action.action === "create_incident_from_dispatch_exception"
          ? "primary"
          : "secondary",
      size: "sm",
      busyKey: action.action,
      onClick: () => {
        void handlePageAction(action);
      },
    });
  }

  function renderRecordActions(record: IncidentRecord) {
    const actions = record.availableActions ?? [];
    return (
      <div style={actionClusterStyle}>
        {actions.map((action: ResourceActionDescriptor) => {
          if (action.action === "open_incident_detail") {
            return (
              <Link
                key={action.action}
                href={`/incidents/${encodeURIComponent(record.incidentId)}`}
                style={buildActionLinkStyle("secondary", !action.enabled)}
                title={getDisabledReasonLabel(
                  action.disabledReasonCode,
                  locale,
                )}
              >
                <CanvasIcon name="arrow" size={12} />
                <span>{getActionLabel(action.action, locale)}</span>
              </Link>
            );
          }

          if (action.action === "add_service_recovery") {
            return renderActionButton(action, {
              variant: "primary",
              busyKey: `recovery:${record.incidentId}`,
              onClick: () => {
                setRecoveryIncidentId(record.incidentId);
              },
            });
          }

          return renderActionButton(action, {
            onClick: () => {
              void handlePageAction(action);
            },
          });
        })}
      </div>
    );
  }

  const incidentRows: IncidentRow[] = filteredRecords.map(
    (record: IncidentRecord) => ({
      incidentCell: (
        <div style={linkStackStyle}>
          <Link
            href={`/incidents/${encodeURIComponent(record.incidentId)}`}
            style={{
              color: theme.text,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {record.title}
          </Link>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: theme.monoFamily,
                fontSize: 11.5,
                color: theme.textMuted,
              }}
            >
              {record.incidentId}
            </span>
            <Pill theme={theme} tone="neutral">
              {formatOpsCodeLabel(locale, record.category)}
            </Pill>
          </div>
          <span style={helperTextStyle}>
            {record.assignedTo
              ? locale === "en"
                ? `Assigned to ${record.assignedTo}`
                : `目前由 ${record.assignedTo} 處理`
              : locale === "en"
                ? "Owner pending acknowledgement"
                : "尚待 owner 確認"}
          </span>
        </div>
      ),
      severityCell: (
        <Pill theme={theme} tone={getSeverityTone(record.severity)} dot>
          {formatOpsCodeLabel(locale, record.severity)}
        </Pill>
      ),
      statusCell: (
        <div style={linkStackStyle}>
          <Pill theme={theme} tone={getStatusTone(record.status)} dot>
            {formatOpsCodeLabel(locale, record.status)}
          </Pill>
          <span style={helperTextStyle}>
            {record.escalationTarget
              ? t(
                  `incidents.escalationBadge.${record.escalationTarget}` as never,
                )
              : locale === "en"
                ? "No escalation target"
                : "尚未設定升級對象"}
          </span>
        </div>
      ),
      linksCell: (
        <div style={linkStackStyle}>
          {record.relatedOrderId ? (
            <Link
              href={`/dispatch/${encodeURIComponent(record.relatedOrderId)}`}
              style={buildActionLinkStyle("ghost")}
            >
              <CanvasIcon name="dispatch" size={12} />
              <span>{record.relatedOrderId}</span>
            </Link>
          ) : null}
          {record.relatedVehicleId ? (
            <Link href="/vehicles" style={buildActionLinkStyle("ghost")}>
              <CanvasIcon name="vehicles" size={12} />
              <span>{record.relatedVehicleId}</span>
            </Link>
          ) : null}
          {record.relatedDriverId ? (
            <Link
              href={`/drivers/${encodeURIComponent(record.relatedDriverId)}`}
              style={buildActionLinkStyle("ghost")}
            >
              <CanvasIcon name="users" size={12} />
              <span>{record.relatedDriverId}</span>
            </Link>
          ) : null}
          {record.relatedComplaintCaseNo ? (
            <Link
              href={`/complaints?caseNo=${encodeURIComponent(
                record.relatedComplaintCaseNo,
              )}`}
              style={buildActionLinkStyle("ghost")}
            >
              <CanvasIcon name="complaints" size={12} />
              <span>{record.relatedComplaintCaseNo}</span>
            </Link>
          ) : null}
          {!hasLinkedEntity(record) ? (
            <span style={helperTextStyle}>
              {locale === "en" ? "No linked entities" : "尚未連結實體"}
            </span>
          ) : null}
        </div>
      ),
      reportedCell: (
        <div style={linkStackStyle}>
          <span>{record.reportedBy}</span>
          <span style={helperTextStyle}>
            {formatDateTime(locale, record.occurredAt ?? record.createdAt)}
          </span>
          <span style={helperTextStyle}>
            {formatIncidentAge(locale, record.occurredAt ?? record.createdAt)}
          </span>
        </div>
      ),
      recoveryCell: (
        <div style={linkStackStyle}>
          <span
            style={{
              fontFamily: theme.monoFamily,
              color: theme.text,
              fontSize: 11.5,
            }}
          >
            {record.serviceRecoveryActions.length}
          </span>
          <span style={helperTextStyle}>
            {record.serviceRecoveryActions.length > 0
              ? locale === "en"
                ? "recovery actions logged"
                : "已記錄恢復行動"
              : locale === "en"
                ? "recovery not recorded"
                : "尚未記錄恢復"}
          </span>
          {record.sourceDispatchExceptionOrderId ? (
            <Pill theme={theme} tone="warn">
              {t("incidents.dispatchException")}
            </Pill>
          ) : null}
        </div>
      ),
      actionsCell: renderRecordActions(record),
      _selected: record.incidentId === recoveryIncidentId,
    }),
  );

  const incidentColumns: CanvasTableColumn<IncidentRow>[] = [
    { h: locale === "en" ? "INCIDENT" : "事故", k: "incidentCell", w: 240 },
    {
      h: locale === "en" ? "SEVERITY" : "嚴重程度",
      k: "severityCell",
      w: 118,
    },
    { h: locale === "en" ? "STATUS" : "狀態", k: "statusCell", w: 180 },
    { h: locale === "en" ? "LINKS" : "關聯", k: "linksCell", w: 220 },
    { h: locale === "en" ? "REPORTED" : "回報", k: "reportedCell", w: 178 },
    { h: locale === "en" ? "RECOVERY" : "恢復", k: "recoveryCell", w: 160 },
    { h: locale === "en" ? "ACTIONS" : "操作", k: "actionsCell", w: 220 },
  ];

  return (
    <Shell
      theme={theme}
      nav={nav}
      active="incidents"
      currentPath="/incidents"
      breadcrumb={[locale === "en" ? "Incidents" : "事故"]}
      brandLabel="DRTS Fleet"
      brandSubLabel={locale === "en" ? "Operations Console" : "營運控制台"}
      brandMark="OC"
      searchPlaceholder={t("incidents.search")}
      avatarLabel="OC"
      style={{ minHeight: "100vh" }}
    >
      <PageHeader
        theme={theme}
        title={t("incidents.title")}
        subtitle={t("incidents.subtitle")}
        actions={
          <div style={actionClusterStyle}>
            {pageActions.map((action: ResourceActionDescriptor) =>
              renderHeaderAction(action),
            )}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {lastActionMessage ? (
          <Banner
            theme={theme}
            tone="success"
            icon="ok"
            title={locale === "en" ? "Action captured" : "操作已記錄"}
            body={lastActionMessage}
          />
        ) : null}

        {priorityQueue.some(
          (record: IncidentRecord) =>
            record.severity === "critical" && isActiveIncident(record.status),
        ) ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={
              locale === "en"
                ? "Critical coordination is active"
                : "重大事故協調進行中"
            }
            body={
              locale === "en"
                ? `${priorityQueue.length} major or SOS incidents are in the focused queue.`
                : `目前有 ${priorityQueue.length} 筆重大或 SOS 事故在優先佇列中。`
            }
          />
        ) : null}

        {currentFreshness !== "fresh" ? (
          <Banner
            theme={theme}
            tone={getFreshnessTone(currentFreshness)}
            icon={currentFreshness === "degraded" ? "warn" : "clock"}
            title={
              currentFreshness === "stale"
                ? locale === "en"
                  ? "Snapshot is stale"
                  : "資料快照已過期"
                : currentFreshness === "degraded"
                  ? locale === "en"
                    ? "Live dependency is degraded"
                    : "即時依賴狀態降級"
                  : locale === "en"
                    ? "Freshness is unknown"
                    : "資料新鮮度未知"
            }
            body={
              locale === "en"
                ? `Generated ${formatDateTime(locale, refreshMetadata.generatedAt, true)} UTC · stale after ${Math.round(refreshMetadata.staleAfterMs / 1000)}s`
                : `資料產生於 ${formatDateTime(locale, refreshMetadata.generatedAt, true)} UTC · ${Math.round(refreshMetadata.staleAfterMs / 1000)} 秒後視為過期`
            }
            actions={renderHeaderAction({
              action: "refresh_incidents",
              enabled: true,
              riskLevel: "low",
            })}
          />
        ) : null}

        {error && records.length > 0 ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="warn"
            title={locale === "en" ? "Latest poll failed" : "最新輪詢失敗"}
            body={
              locale === "en"
                ? `${error}. Showing the last successful snapshot.`
                : `${error}。畫面目前顯示上一次成功快照。`
            }
          />
        ) : null}

        <Card theme={theme}>
          <div style={workspaceStripStyle}>
            <div style={{ display: "grid", gap: 8 }}>
              <div
                style={{
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: theme.textMuted,
                }}
              >
                {locale === "en" ? "Incident workspace" : "Incident workspace"}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: -0.4,
                }}
              >
                {locale === "en"
                  ? "See what is happening, prioritize major cases, and keep recovery actions moving."
                  : "看清現況、排定重大事故優先序，並確保 recovery action 持續前進。"}
              </div>
              <div style={helperTextStyle}>
                {locale === "en"
                  ? "Driver SOS and dispatch-exception incidents stay ops-owned even after order or complaint linkage."
                  : "Driver SOS 與 dispatch-exception incident 即使已連到訂單或客訴，仍維持 ops 持有。"}
              </div>
            </div>
            <div style={chipRowStyle}>
              <span style={chipStyle}>
                <CanvasIcon name="warn" size={12} />
                {locale === "en"
                  ? `${pendingMajorCount} pending major`
                  : `${pendingMajorCount} 筆待處理重大事故`}
              </span>
              <span style={chipStyle}>
                <CanvasIcon name="copy" size={12} />
                {locale === "en"
                  ? `${unrecordedRecoveryCount} without recovery`
                  : `${unrecordedRecoveryCount} 筆未記錄恢復`}
              </span>
              <span style={chipStyle}>
                <CanvasIcon name="ext" size={12} />
                {locale === "en"
                  ? `${linkedEntityCount} linked entities`
                  : `${linkedEntityCount} 筆已連結實體`}
              </span>
            </div>
          </div>
        </Card>

        {selectedRecoveryIncident ? (
          <ServiceRecoveryQuickActionCard
            record={selectedRecoveryIncident}
            locale={locale}
            busy={
              busyAction === `recovery:${selectedRecoveryIncident.incidentId}`
            }
            onCancel={() => setRecoveryIncidentId(null)}
            onSubmit={handleRecoverySubmit}
          />
        ) : null}

        {showCreate || editingId ? (
          <IncidentEditorCard
            key={editingId ?? `create:${searchParams.toString()}`}
            locale={locale}
            editingRecord={
              editingId
                ? records.find(
                    (record: IncidentRecord) => record.incidentId === editingId,
                  )
                : undefined
            }
            {...(!editingId ? { initialValues: createDefaults } : {})}
            onCancel={() => {
              setShowCreate(false);
              setEditingId(null);
            }}
            onSubmit={handleIncidentSubmit}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={locale === "en" ? "Active" : "活躍"}
            value={activeCount}
            sub={
              locale === "en" ? "Open + investigating" : "open + investigating"
            }
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Major" : "重大"}
            value={majorCount}
            delta={
              pendingMajorCount > 0
                ? locale === "en"
                  ? `${pendingMajorCount} still active`
                  : `${pendingMajorCount} 筆仍在處理中`
                : undefined
            }
            deltaTone={pendingMajorCount > 0 ? "down" : "neutral"}
            sub={
              locale === "en"
                ? "High + critical severity"
                : "high + critical 嚴重程度"
            }
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Resolved 30d" : "30 天內已解決"}
            value={resolvedLast30DaysCount}
            sub={
              locale === "en"
                ? "Resolved or closed in the last 30 days"
                : "近 30 天 resolved / closed"
            }
          />
        </div>

        <div style={splitGridStyle}>
          <Card
            theme={theme}
            title={locale === "en" ? "Incident backlog" : "事故積壓"}
            subtitle={
              locale === "en"
                ? `${filteredRecords.length} visible of ${records.length}`
                : `${filteredRecords.length} / ${records.length} 筆顯示中`
            }
          >
            <div style={{ display: "grid", gap: 12 }}>
              <div style={filterGridStyle}>
                <label style={fieldLabelStyle}>
                  {locale === "en" ? "Search" : "搜尋"}
                  <input
                    style={inputBaseStyle}
                    type="search"
                    placeholder={t("incidents.search")}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <label style={fieldLabelStyle}>
                  {locale === "en" ? "Status" : "狀態"}
                  <select
                    style={inputBaseStyle}
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(
                        event.target.value as IncidentStatus | "all",
                      )
                    }
                  >
                    <option value="all">{t("incidents.allStatuses")}</option>
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {formatOpsCodeLabel(locale, status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={fieldLabelStyle}>
                  {locale === "en" ? "Severity" : "嚴重程度"}
                  <select
                    style={inputBaseStyle}
                    value={severityFilter}
                    onChange={(event) =>
                      setSeverityFilter(
                        event.target.value as IncidentSeverity | "all",
                      )
                    }
                  >
                    <option value="all">{t("incidents.allSeverities")}</option>
                    {SEVERITIES.map((severity) => (
                      <option key={severity} value={severity}>
                        {formatOpsCodeLabel(locale, severity)}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={fieldLabelStyle}>
                  {locale === "en" ? "Category" : "類別"}
                  <select
                    style={inputBaseStyle}
                    value={categoryFilter}
                    onChange={(event) =>
                      setCategoryFilter(
                        event.target.value as IncidentCategory | "all",
                      )
                    }
                  >
                    <option value="all">{t("incidents.allCategories")}</option>
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {formatOpsCodeLabel(locale, category)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {loading && !feed ? (
                <Banner
                  theme={theme}
                  tone="info"
                  icon="clock"
                  title={locale === "en" ? "Loading incidents" : "載入事故中"}
                  body={
                    locale === "en"
                      ? "Building the live incident snapshot."
                      : "正在建立 incident 即時快照。"
                  }
                />
              ) : emptyState ? (
                <EmptyStateCard
                  locale={locale}
                  emptyState={emptyState}
                  onAction={handlePageAction}
                />
              ) : (
                <Table
                  theme={theme}
                  columns={incidentColumns}
                  rows={incidentRows}
                />
              )}
            </div>
          </Card>

          <div style={sideStackStyle}>
            <Card
              theme={theme}
              title={locale === "en" ? "Live surface" : "即時狀態"}
              subtitle={locale === "en" ? "T3 · 15s polling" : "T3 · 15 秒輪詢"}
            >
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Pill
                    theme={theme}
                    tone={getFreshnessTone(currentFreshness)}
                    dot
                  >
                    {currentFreshness}
                  </Pill>
                  <Pill theme={theme} tone="neutral">
                    {refreshMetadata.source}
                  </Pill>
                </div>
                <div style={helperTextStyle}>
                  {locale === "en" ? "Generated" : "產生時間"}:{" "}
                  {formatDateTime(locale, refreshMetadata.generatedAt, true)}{" "}
                  UTC
                </div>
                <div style={helperTextStyle}>
                  {locale === "en" ? "Stale after" : "過期閾值"}:{" "}
                  {Math.round(refreshMetadata.staleAfterMs / 1000)}
                  {locale === "en" ? " seconds" : " 秒"}
                </div>
              </div>
            </Card>

            <Card
              theme={theme}
              title={
                locale === "en" ? "Governance guardrails" : "治理與 guardrails"
              }
            >
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 16,
                  display: "grid",
                  gap: 8,
                  color: theme.text,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                }}
              >
                <li>
                  {locale === "en"
                    ? "Driver SOS and dispatch-exception incidents remain ops-owned even when linked orders or complaints exist."
                    : "Driver SOS 與 dispatch-exception incident 即使已連到訂單或客訴，仍由 ops 持有。"}
                </li>
                <li>
                  {locale === "en"
                    ? "Service recovery action documents passenger remediation; it does not replace timeline updates or formal resolution notes."
                    : "Service recovery action 只用來記錄乘客補救，不能取代 timeline 更新或正式 resolution note。"}
                </li>
                <li>
                  {locale === "en"
                    ? "Escalation target signals who must acknowledge the case; it is not a silent owner transfer."
                    : "Escalation target 代表誰必須 acknowledge 此案，不等於可默默轉移 owner。"}
                </li>
              </ul>
            </Card>

            <Card
              theme={theme}
              title={locale === "en" ? "Priority queue" : "優先佇列"}
              subtitle={
                locale === "en" ? "Major + SOS only" : "僅顯示重大 + SOS 事故"
              }
            >
              {priorityQueue.length > 0 ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {priorityQueue.map((record: IncidentRecord) => (
                    <article
                      key={record.incidentId}
                      style={{
                        display: "grid",
                        gap: 8,
                        padding: 12,
                        borderRadius: 10,
                        border: `1px solid ${theme.border}`,
                        background: theme.surfaceLo,
                      }}
                    >
                      <div style={{ display: "grid", gap: 5 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                          }}
                        >
                          <Link
                            href={`/incidents/${encodeURIComponent(record.incidentId)}`}
                            style={{
                              color: theme.text,
                              fontWeight: 700,
                              textDecoration: "none",
                            }}
                          >
                            {record.title}
                          </Link>
                          <Pill
                            theme={theme}
                            tone={getSeverityTone(record.severity)}
                            dot
                          >
                            {formatOpsCodeLabel(locale, record.severity)}
                          </Pill>
                        </div>
                        <div style={helperTextStyle}>
                          {record.incidentId} ·{" "}
                          {formatOpsCodeLabel(locale, record.category)}
                        </div>
                        <div style={helperTextStyle}>{record.description}</div>
                      </div>
                      <div style={actionClusterStyle}>
                        <Pill
                          theme={theme}
                          tone={getStatusTone(record.status)}
                          dot
                        >
                          {formatOpsCodeLabel(locale, record.status)}
                        </Pill>
                        <span style={helperTextStyle}>
                          {formatIncidentAge(
                            locale,
                            record.occurredAt ?? record.createdAt,
                          )}
                        </span>
                      </div>
                      <div style={actionClusterStyle}>
                        {renderRecordActions(record)}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Banner
                  theme={theme}
                  tone="success"
                  icon="ok"
                  title={
                    locale === "en"
                      ? "All clear on major incidents"
                      : "目前沒有重大事故"
                  }
                  body={
                    locale === "en"
                      ? "No major or SOS incidents are currently in the focused queue."
                      : "目前優先佇列中沒有重大或 SOS 事故。"
                  }
                />
              )}
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function EmptyStateCard({
  locale,
  emptyState,
  onAction,
}: {
  locale: LocaleCode;
  emptyState: EmptyStateEnvelope;
  onAction: (action: ResourceActionDescriptor) => Promise<void>;
}) {
  const presentation = getEmptyStatePresentation(emptyState.reason, locale);

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        minHeight: 220,
        alignContent: "center",
        justifyItems: "start",
        border: `1px dashed ${theme.border}`,
        borderRadius: 10,
        background: theme.surfaceLo,
        padding: 18,
      }}
    >
      <Pill theme={theme} tone={presentation.tone} dot>
        {emptyState.reason}
      </Pill>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: theme.text,
        }}
      >
        <CanvasIcon name={presentation.icon} size={18} />
        <strong>{presentation.title}</strong>
      </div>
      <div style={{ ...helperTextStyle, maxWidth: 560 }}>
        {presentation.body}
      </div>
      {emptyState.nextAction ? (
        <Btn
          theme={theme}
          variant="primary"
          disabled={!emptyState.nextAction.enabled}
          onClick={() => {
            void onAction(emptyState.nextAction!);
          }}
        >
          {getActionLabel(emptyState.nextAction.action, locale)}
        </Btn>
      ) : null}
    </div>
  );
}

function ServiceRecoveryQuickActionCard({
  record,
  locale,
  busy,
  onSubmit,
  onCancel,
}: {
  record: IncidentRecord;
  locale: LocaleCode;
  busy: boolean;
  onSubmit: (command: RecordServiceRecoveryActionCommand) => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [actionType, setActionType] = useState<string>("passenger_recontact");
  const [note, setNote] = useState("");
  const [actor, setActor] = useState("ops-user-001");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      void onSubmit({
        actionType:
          actionType as RecordServiceRecoveryActionCommand["actionType"],
        note: note.trim(),
        actor: actor.trim() || "ops-user-001",
      });
    });
  }

  return (
    <Card
      theme={theme}
      title={
        locale === "en"
          ? `Service recovery · ${record.incidentId}`
          : `服務恢復 · ${record.incidentId}`
      }
      subtitle={record.title}
      actions={
        <Link
          href={`/incidents/${encodeURIComponent(record.incidentId)}`}
          style={buildActionLinkStyle("ghost")}
        >
          <CanvasIcon name="arrow" size={12} />
          <span>{locale === "en" ? "Open full detail" : "開啟完整詳情"}</span>
        </Link>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <div style={{ ...helperTextStyle, maxWidth: 720 }}>
          {locale === "en"
            ? "Use this quick action when the list view is enough. Full coordination still lives in the incident detail route."
            : "這是 list 頁的 quick action；完整協調仍在 incident detail route。"}
        </div>
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          }}
        >
          <label style={fieldLabelStyle}>
            {locale === "en" ? "Action type" : "行動類型"}
            <select
              style={inputBaseStyle}
              value={actionType}
              onChange={(event) => setActionType(event.target.value)}
            >
              {SERVICE_RECOVERY_TYPES.map((value) => (
                <option key={value} value={value}>
                  {locale === "en"
                    ? value
                    : value === "passenger_recontact"
                      ? "重新聯繫乘客"
                      : value === "fare_adjustment"
                        ? "費用調整"
                        : value === "redispatch_ordered"
                          ? "重新派遣"
                          : value === "voucher_issued"
                            ? "發放優惠券"
                            : value === "apology_sent"
                              ? "致歉通知"
                              : value === "driver_reassigned"
                                ? "更換司機"
                                : "其他"}
                </option>
              ))}
            </select>
          </label>
          <label style={fieldLabelStyle}>
            {locale === "en" ? "Actor" : "執行人"}
            <input
              style={inputBaseStyle}
              value={actor}
              onChange={(event) => setActor(event.target.value)}
              required
            />
          </label>
          <label style={{ ...fieldLabelStyle, gridColumn: "1 / -1" }}>
            {locale === "en" ? "Note" : "備註"}
            <textarea
              style={{ ...inputBaseStyle, minHeight: 100, resize: "vertical" }}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              required
            />
          </label>
        </div>
        <div style={actionClusterStyle}>
          <button
            type="submit"
            style={buildActionButtonStyle("primary", pending || busy)}
            disabled={pending || busy}
          >
            {locale === "en" ? "Record action" : "記錄行動"}
          </button>
          <button
            type="button"
            style={buildActionButtonStyle("secondary", pending || busy)}
            onClick={onCancel}
            disabled={pending || busy}
          >
            {locale === "en" ? "Cancel" : "取消"}
          </button>
        </div>
      </form>
    </Card>
  );
}

function IncidentEditorCard({
  locale,
  editingRecord,
  initialValues,
  onCancel,
  onSubmit,
}: {
  locale: LocaleCode;
  editingRecord: IncidentRecord | undefined;
  initialValues?: IncidentFormInitialValues;
  onCancel: () => void;
  onSubmit: (
    command: CreateIncidentCommand | UpdateIncidentCommand,
  ) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(
    editingRecord?.title ?? initialValues?.title ?? "",
  );
  const [description, setDescription] = useState(
    editingRecord?.description ?? initialValues?.description ?? "",
  );
  const [category, setCategory] = useState<IncidentCategory>(
    editingRecord?.category ?? initialValues?.category ?? "operational",
  );
  const [severity, setSeverity] = useState<IncidentSeverity>(
    editingRecord?.severity ?? initialValues?.severity ?? "medium",
  );
  const [relatedOrderId, setRelatedOrderId] = useState(
    editingRecord?.relatedOrderId ?? initialValues?.relatedOrderId ?? "",
  );
  const [relatedVehicleId, setRelatedVehicleId] = useState(
    editingRecord?.relatedVehicleId ?? initialValues?.relatedVehicleId ?? "",
  );
  const [relatedDriverId, setRelatedDriverId] = useState(
    editingRecord?.relatedDriverId ?? initialValues?.relatedDriverId ?? "",
  );
  const [reportedBy, setReportedBy] = useState(
    editingRecord?.reportedBy ?? initialValues?.reportedBy ?? "ops-user-001",
  );
  const [occurredAt, setOccurredAt] = useState(
    editingRecord?.occurredAt
      ? new Date(editingRecord.occurredAt).toISOString().slice(0, 16)
      : (initialValues?.occurredAt ?? ""),
  );
  const [location, setLocation] = useState(
    editingRecord?.location ?? initialValues?.location ?? "",
  );
  const [status, setStatus] = useState<IncidentStatus>(
    editingRecord?.status ?? "open",
  );
  const [assignedTo, setAssignedTo] = useState(editingRecord?.assignedTo ?? "");
  const [resolutionNote, setResolutionNote] = useState(
    editingRecord?.resolutionNote ?? "",
  );
  const [escalationTarget, setEscalationTarget] = useState<
    IncidentEscalationTarget | ""
  >(editingRecord?.escalationTarget ?? "");

  const isEditing = Boolean(editingRecord);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      if (isEditing) {
        const command: UpdateIncidentCommand = {
          status,
          severity,
          ...(assignedTo.trim() ? { assignedTo: assignedTo.trim() } : {}),
          ...(resolutionNote.trim()
            ? { resolutionNote: resolutionNote.trim() }
            : {}),
          escalationTarget: escalationTarget || null,
        };
        void onSubmit(command);
        return;
      }

      const command: CreateIncidentCommand = {
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
      void onSubmit(command);
    });
  }

  return (
    <Card
      theme={theme}
      title={
        isEditing
          ? locale === "en"
            ? "Update incident"
            : "更新事故"
          : locale === "en"
            ? "Create incident"
            : "新增事故"
      }
    >
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        {!isEditing ? (
          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            }}
          >
            <label style={fieldLabelStyle}>
              {t("incidents.form.title")}
              <input
                style={inputBaseStyle}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>
            <label style={fieldLabelStyle}>
              {t("incidents.form.reportedBy")}
              <input
                style={inputBaseStyle}
                value={reportedBy}
                onChange={(event) => setReportedBy(event.target.value)}
                required
              />
            </label>
            <label style={fieldLabelStyle}>
              {t("incidents.form.category")}
              <select
                style={inputBaseStyle}
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as IncidentCategory)
                }
              >
                {CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {formatOpsCodeLabel(locale, value)}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldLabelStyle}>
              {t("incidents.form.severity")}
              <select
                style={inputBaseStyle}
                value={severity}
                onChange={(event) =>
                  setSeverity(event.target.value as IncidentSeverity)
                }
              >
                {SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {formatOpsCodeLabel(locale, value)}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldLabelStyle}>
              {t("incidents.form.relatedOrder")}
              <input
                style={inputBaseStyle}
                value={relatedOrderId}
                onChange={(event) => setRelatedOrderId(event.target.value)}
              />
            </label>
            <label style={fieldLabelStyle}>
              {t("incidents.form.relatedVehicle")}
              <input
                style={inputBaseStyle}
                value={relatedVehicleId}
                onChange={(event) => setRelatedVehicleId(event.target.value)}
              />
            </label>
            <label style={fieldLabelStyle}>
              {t("incidents.form.relatedDriver")}
              <input
                style={inputBaseStyle}
                value={relatedDriverId}
                onChange={(event) => setRelatedDriverId(event.target.value)}
              />
            </label>
            <label style={fieldLabelStyle}>
              {t("incidents.form.occurredAt")}
              <input
                style={inputBaseStyle}
                type="datetime-local"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            </label>
            <label style={{ ...fieldLabelStyle, gridColumn: "1 / -1" }}>
              {t("incidents.form.location")}
              <input
                style={inputBaseStyle}
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </label>
            <label style={{ ...fieldLabelStyle, gridColumn: "1 / -1" }}>
              {t("incidents.form.description")}
              <textarea
                style={{
                  ...inputBaseStyle,
                  minHeight: 116,
                  resize: "vertical",
                }}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
              />
            </label>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            }}
          >
            <label style={fieldLabelStyle}>
              {t("incidents.form.status")}
              <select
                style={inputBaseStyle}
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as IncidentStatus)
                }
              >
                {STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {formatOpsCodeLabel(locale, value)}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldLabelStyle}>
              {t("incidents.form.severity")}
              <select
                style={inputBaseStyle}
                value={severity}
                onChange={(event) =>
                  setSeverity(event.target.value as IncidentSeverity)
                }
              >
                {SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {formatOpsCodeLabel(locale, value)}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldLabelStyle}>
              {t("incidents.form.assignedTo")}
              <input
                style={inputBaseStyle}
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.target.value)}
              />
            </label>
            <label style={fieldLabelStyle}>
              {t("incidents.form.escalationTarget")}
              <select
                style={inputBaseStyle}
                value={escalationTarget}
                onChange={(event) =>
                  setEscalationTarget(
                    event.target.value as IncidentEscalationTarget | "",
                  )
                }
              >
                <option value="">{t("incidents.form.escalationNone")}</option>
                {ESCALATION_TARGETS.map((value) => (
                  <option key={value} value={value}>
                    {t(`incidents.escalationBadge.${value}` as never)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ ...fieldLabelStyle, gridColumn: "1 / -1" }}>
              {t("incidents.form.resolutionNote")}
              <textarea
                style={{
                  ...inputBaseStyle,
                  minHeight: 116,
                  resize: "vertical",
                }}
                value={resolutionNote}
                onChange={(event) => setResolutionNote(event.target.value)}
              />
            </label>
          </div>
        )}
        <div style={actionClusterStyle}>
          <button
            type="submit"
            style={buildActionButtonStyle("primary", pending)}
            disabled={pending}
          >
            {pending
              ? t("incidents.form.saving")
              : isEditing
                ? t("incidents.form.saveChanges")
                : t("incidents.form.createRecord")}
          </button>
          <button
            type="button"
            style={buildActionButtonStyle("secondary", pending)}
            onClick={onCancel}
            disabled={pending}
          >
            {locale === "en" ? "Cancel" : "取消"}
          </button>
        </div>
      </form>
    </Card>
  );
}

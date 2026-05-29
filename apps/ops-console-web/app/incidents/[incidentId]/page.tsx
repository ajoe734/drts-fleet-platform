import Link from "next/link";
import type { ReactNode } from "react";
import type {
  AuditLogRecord,
  DriverMatchingSuppression,
  DriverRegistryRecord,
  EmptyReason,
  IncidentRecord,
  IncidentRuntimeRecord,
  IncidentTimelineEntry,
  OwnedOrderRecord,
  RefreshTier,
  ResourceActionDescriptor,
  ServiceRecoveryActionRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasIcon,
  Timeline,
  buildCanvasTheme,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import type { ManagementTone, TimelineItem } from "@drts/ui-web";
import { IncidentRefreshTier } from "./refresh-tier";
import { IncidentDetailActionPanel } from "./incident-detail-action-panel";

type IncidentDetailPageProps = {
  params: Promise<{
    incidentId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type IncidentDetailSearchParams = Record<string, string | string[] | undefined>;

type EmptyStateConfig = {
  tone: CanvasTone;
  icon: Parameters<typeof CanvasIcon>[0]["name"];
  title: Record<Locale, string>;
  body: Record<Locale, string>;
};

type ActionStyleVariant = "primary" | "secondary" | "ghost";

type SectionLoadResult<T> = {
  data: T;
  error: Error | null;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const INCIDENT_REFRESH_TIER: RefreshTier = "medium";

const EMPTY_STATE_CONFIG: Record<
  Exclude<EmptyReason, "driver_not_eligible">,
  EmptyStateConfig
> = {
  no_data: {
    tone: "info",
    icon: "reports",
    title: { en: "No records yet", zh: "目前沒有資料" },
    body: {
      en: "This section is valid but empty. Data will appear once the incident flow produces records.",
      zh: "這個區塊目前是合法空白；等事故流程產生資料後會顯示在這裡。",
    },
  },
  not_provisioned: {
    tone: "warn",
    icon: "flags",
    title: { en: "Feature not provisioned", zh: "功能尚未開通" },
    body: {
      en: "The backing capability is not enabled for this tenant or environment yet.",
      zh: "這個租戶或環境尚未開通對應能力。",
    },
  },
  fetch_failed: {
    tone: "danger",
    icon: "warn",
    title: { en: "Fetch failed", zh: "資料讀取失敗" },
    body: {
      en: "The request failed before the page could build a trustworthy section state.",
      zh: "請求失敗，頁面無法建立可信的區塊狀態。",
    },
  },
  permission_denied: {
    tone: "warn",
    icon: "audit",
    title: { en: "Permission denied", zh: "沒有檢視權限" },
    body: {
      en: "Your scope can view the incident shell but not this related dataset.",
      zh: "你可以看到事故頁框架，但沒有此關聯資料的讀取權限。",
    },
  },
  external_unavailable: {
    tone: "danger",
    icon: "ext",
    title: { en: "External dependency unavailable", zh: "外部依賴暫時不可用" },
    body: {
      en: "This section depends on another service. The incident stays visible while the dependency is degraded.",
      zh: "這個區塊依賴其他服務；事故仍可檢視，但外部依賴目前降級。",
    },
  },
  filtered_empty: {
    tone: "accent",
    icon: "search",
    title: {
      en: "No results under current filters",
      zh: "目前篩選條件沒有結果",
    },
    body: {
      en: "The source has data, but the active filter view excludes it.",
      zh: "來源有資料，但目前篩選視圖把它排除了。",
    },
  },
};

async function resolveOrFallback<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

async function resolveSection<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<SectionLoadResult<T>> {
  try {
    return {
      data: await loader(),
      error: null,
    };
  } catch (error) {
    return {
      data: fallback,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatShortDateTime(locale: Locale, value: string | null | undefined) {
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

function formatIncidentAge(locale: Locale, value: string | null | undefined) {
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

function actionLinkStyle(
  theme: CanvasTheme,
  variant: ActionStyleVariant = "secondary",
  disabled = false,
) {
  const base =
    variant === "primary"
      ? {
          background: theme.accent,
          color: "#ffffff",
          border: `1px solid ${theme.accent}`,
        }
      : variant === "ghost"
        ? {
            background: "transparent",
            color: theme.textMuted,
            border: "1px solid transparent",
          }
        : {
            background: theme.surface,
            color: theme.text,
            border: `1px solid ${theme.border}`,
          };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    minHeight: "28px",
    padding: "5px 10px",
    borderRadius: "7px",
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
    opacity: disabled ? 0.48 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    ...base,
  } as const;
}

function ActionAffordance({
  href,
  disabled,
  title,
  style,
  children,
}: {
  href: string;
  disabled: boolean;
  title: string | undefined;
  style: ReturnType<typeof actionLinkStyle>;
  children: ReactNode;
}) {
  if (disabled) {
    return (
      <span title={title} aria-disabled="true" style={style}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} title={title} style={style}>
      {children}
    </Link>
  );
}

function LinkedAction({
  href,
  locale,
  variant = "secondary",
  crossApp = false,
  children,
}: {
  href: string;
  locale: Locale;
  variant?: ActionStyleVariant;
  crossApp?: boolean;
  children: ReactNode;
}) {
  const title = crossApp
    ? locale === "en"
      ? "Opens in a new tab"
      : "於新分頁開啟"
    : undefined;

  if (crossApp) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        style={actionLinkStyle(theme, variant)}
        title={title}
      >
        <CanvasIcon name="ext" size={12} />
        <span>{children}</span>
      </a>
    );
  }

  return (
    <Link href={href} style={actionLinkStyle(theme, variant)} title={title}>
      {children}
    </Link>
  );
}

function getStatusTone(status: IncidentRecord["status"]): CanvasTone {
  if (status === "resolved" || status === "closed") {
    return "success";
  }
  if (status === "open" || status === "investigating") {
    return "warn";
  }
  return "info";
}

function getSeverityTone(severity: IncidentRecord["severity"]): CanvasTone {
  if (severity === "critical" || severity === "high") {
    return "danger";
  }
  if (severity === "medium") {
    return "warn";
  }
  return "info";
}

function getTimelineTone(action: string): ManagementTone {
  if (action === "incident_closed" || action === "incident_resolved") {
    return "success";
  }
  if (
    action === "severity_escalated" ||
    action === "dispatch_exception_handoff" ||
    action === "incident_hold"
  ) {
    return "danger";
  }
  if (action === "escalation_target_set" || action === "complaint_linked") {
    return "warning";
  }
  if (action === "service_recovery_action") {
    return "info";
  }
  return "accent";
}

function getTenantLabel(order: OwnedOrderRecord | null) {
  if (!order) {
    return null;
  }

  return (
    order.tenantId ??
    order.partnerEntrySlug ??
    order.partnerId ??
    order.orderSource
  );
}

function inferSuppression(
  incident: IncidentRuntimeRecord,
  driver: DriverRegistryRecord | null,
): DriverMatchingSuppression | null {
  if (incident.driverMatchingSuppression) {
    return incident.driverMatchingSuppression;
  }

  if (
    driver?.eligibilityBlockedReasons.includes("work_state_incident_hold") &&
    incident.relatedDriverId
  ) {
    return {
      active: true,
      reasonCode: "incident",
      sourceIncidentId: incident.incidentId,
      expiresAt: incident.updatedAt,
      liftedAt: null,
    };
  }

  return null;
}

function inferEmptyReason(
  error: Error | null,
  fallbackReason: Exclude<EmptyReason, "driver_not_eligible"> = "no_data",
): Exclude<EmptyReason, "driver_not_eligible"> {
  if (!error) {
    return fallbackReason;
  }

  const message = error.message.toLowerCase();
  if (message.includes("403")) {
    return "permission_denied";
  }
  if (message.includes("404")) {
    return "no_data";
  }
  if (message.includes("501")) {
    return "not_provisioned";
  }
  if (
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  ) {
    return "external_unavailable";
  }

  return "fetch_failed";
}

function getActionCopy(action: string, locale: Locale) {
  const normalized = action.toLowerCase();
  if (normalized.includes("update")) {
    return locale === "en" ? "Update incident" : "更新事故";
  }
  if (normalized.includes("resolve")) {
    return locale === "en" ? "Resolve" : "標記已處理";
  }
  if (normalized.includes("close")) {
    return locale === "en" ? "Close" : "關閉事故";
  }
  if (normalized.includes("recovery")) {
    return locale === "en" ? "Add recovery" : "新增補救";
  }
  if (normalized.includes("ack")) {
    return locale === "en" ? "Acknowledge escalation" : "確認升級";
  }
  if (normalized.includes("lift")) {
    return locale === "en" ? "Lift suppression" : "解除抑制";
  }
  return formatOpsCodeLabel(locale, action);
}

function buildIncidentDetailLink(incidentId: string, intent?: string) {
  const base = `/incidents/${encodeURIComponent(incidentId)}`;
  return intent ? `${base}?intent=${encodeURIComponent(intent)}` : base;
}

function buildComplaintDetailLink(caseNo: string) {
  return `/complaints/${encodeURIComponent(caseNo)}`;
}

function buildVehicleRegistryLink(vehicleId: string) {
  return `/vehicles?vehicleId=${encodeURIComponent(vehicleId)}`;
}

function getActionIntent(action: string) {
  const normalized = action.toLowerCase();
  if (normalized.includes("update")) {
    return "update";
  }
  if (normalized.includes("resolve")) {
    return "resolve";
  }
  if (normalized.includes("close")) {
    return "close";
  }
  if (normalized.includes("recovery")) {
    return "service_recovery";
  }
  if (normalized.includes("ack")) {
    return "acknowledge";
  }
  if (normalized.includes("lift")) {
    return "lift_suppression";
  }
  return normalized;
}

function getActionIcon(action: string) {
  const normalized = action.toLowerCase();
  if (normalized.includes("close")) {
    return "audit";
  }
  if (normalized.includes("resolve")) {
    return "check";
  }
  if (normalized.includes("recovery")) {
    return "plus";
  }
  if (normalized.includes("lift")) {
    return "clock";
  }
  if (normalized.includes("ack")) {
    return "warn";
  }
  if (normalized.includes("update")) {
    return "copy";
  }
  return "ext";
}

function buildActionTitle(
  action: ResourceActionDescriptor,
  locale: Locale,
  isInPlace: boolean,
) {
  const details = [
    action.enabled
      ? null
      : locale === "en"
        ? `Disabled: ${formatOpsCodeLabel(locale, action.disabledReasonCode ?? "unavailable")}`
        : `停用：${formatOpsCodeLabel(locale, action.disabledReasonCode ?? "unavailable")}`,
    action.riskLevel === "high"
      ? locale === "en"
        ? "High-risk confirmation"
        : "高風險確認"
      : action.riskLevel === "medium"
        ? locale === "en"
          ? "Medium-risk confirmation"
          : "中風險確認"
        : locale === "en"
          ? "Low-risk action"
          : "低風險動作",
    action.requiresReason
      ? locale === "en"
        ? "Reason required"
        : "必填原因"
      : null,
    isInPlace
      ? locale === "en"
        ? "Stays in this incident workspace"
        : "停留在此事故工作區"
      : null,
  ].filter(Boolean);

  return details.join(" · ");
}

function actionTarget(
  incident: IncidentRuntimeRecord,
  action: ResourceActionDescriptor,
) {
  const normalized = action.action.toLowerCase();
  if (
    normalized.includes("recovery") ||
    normalized.includes("update") ||
    normalized.includes("resolve") ||
    normalized.includes("close") ||
    normalized.includes("ack") ||
    normalized.includes("escalation")
  ) {
    return buildIncidentDetailLink(
      incident.incidentId,
      getActionIntent(action.action),
    );
  }
  if (normalized.includes("lift") && incident.relatedDriverId) {
    return `/drivers/${encodeURIComponent(incident.relatedDriverId)}?incidentId=${encodeURIComponent(incident.incidentId)}&intent=lift_suppression`;
  }
  return buildIncidentDetailLink(
    incident.incidentId,
    getActionIntent(action.action),
  );
}

function EmptyStateBlock({
  reason,
  locale,
  nextAction,
}: {
  reason: Exclude<EmptyReason, "driver_not_eligible">;
  locale: Locale;
  nextAction?: ReactNode;
}) {
  const config = EMPTY_STATE_CONFIG[reason]!;
  return (
    <div
      style={{
        border: `1px dashed ${theme.border}`,
        borderRadius: 12,
        padding: 16,
        display: "grid",
        gap: 10,
        background: theme.surfaceLo,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              config.tone === "danger"
                ? theme.dangerBg
                : config.tone === "warn"
                  ? theme.warnBg
                  : config.tone === "accent"
                    ? theme.accentBg
                    : theme.infoBg,
          }}
        >
          <CanvasIcon name={config.icon} size={14} />
        </span>
        <div style={{ display: "grid", gap: 2 }}>
          <strong style={{ fontSize: 13 }}>{config.title[locale]}</strong>
          <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
            {config.body[locale]}
          </span>
        </div>
      </div>
      {nextAction}
    </div>
  );
}

function buildAuditLink(auditId: string) {
  const route = `/audit?auditId=${encodeURIComponent(auditId)}`;
  const platformAdminBaseUrl =
    process.env.PLATFORM_ADMIN_BASE_URL ??
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_BASE_URL;

  if (!platformAdminBaseUrl) {
    return route;
  }

  return new URL(route, platformAdminBaseUrl).toString();
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function IncidentDetailPage({
  params,
  searchParams,
}: IncidentDetailPageProps) {
  const [{ incidentId }, locale, client, resolvedSearchParams] =
    await Promise.all([
      params,
      getServerLocale(),
      getServerOpsClient(),
      searchParams ?? Promise.resolve({} as IncidentDetailSearchParams),
    ]);

  const incident = await resolveOrFallback(
    () => client.getIncident(incidentId) as Promise<IncidentRuntimeRecord>,
    null as IncidentRuntimeRecord | null,
  );

  if (!incident) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader
          theme={theme}
          title={locale === "en" ? "Incident not found" : "找不到事故"}
          subtitle={incidentId}
          actions={
            <Link href="/incidents" style={actionLinkStyle(theme)}>
              <CanvasIcon name="arrow" size={12} />
              <span>
                {locale === "en" ? "Back to Incident Center" : "返回事故中心"}
              </span>
            </Link>
          }
        />
        <Banner
          theme={theme}
          tone="danger"
          icon="warn"
          title={
            locale === "en"
              ? "No incident matched this route"
              : "此路由沒有對應事故"
          }
          body={
            locale === "en"
              ? "The incident could be deleted, unavailable in this environment, or the deep link is stale."
              : "這筆事故可能已不存在、目前環境不可用，或這個 deep link 已過期。"
          }
        />
      </div>
    );
  }

  const [
    timelineResult,
    recoveryResult,
    relatedOrder,
    auditLogsResult,
    driverRegistryResult,
  ] = await Promise.all([
    resolveSection(
      () => client.getIncidentTimeline(incidentId),
      [] as IncidentTimelineEntry[],
    ),
    resolveSection(
      () => client.getServiceRecoveryActions(incidentId),
      incident.serviceRecoveryActions ?? ([] as ServiceRecoveryActionRecord[]),
    ),
    incident.relatedOrderId
      ? resolveOrFallback(
          () => client.getOrder(incident.relatedOrderId as string),
          null as OwnedOrderRecord | null,
        )
      : Promise.resolve(null as OwnedOrderRecord | null),
    resolveSection(() => client.listAuditLogs(), [] as AuditLogRecord[]),
    incident.relatedDriverId
      ? resolveSection(() => client.listDrivers(), [] as DriverRegistryRecord[])
      : Promise.resolve({
          data: [] as DriverRegistryRecord[],
          error: null,
        }),
  ]);

  const relatedDriver =
    driverRegistryResult.data.find(
      (driver: DriverRegistryRecord) =>
        driver.driverId === incident.relatedDriverId,
    ) ?? null;
  const tenantLabel = getTenantLabel(relatedOrder);
  const suppression = inferSuppression(incident, relatedDriver);
  const refreshMetadata = incident.refreshMetadata ?? null;
  const availableActions = incident.availableActions ?? [];
  const serviceRecoveryAction =
    availableActions.find((action: ResourceActionDescriptor) =>
      action.action.toLowerCase().includes("recovery"),
    ) ?? null;
  const incidentAuditLogs = [...auditLogsResult.data]
    .filter(
      (entry) =>
        entry.resourceType === "incident" &&
        entry.resourceId === incident.incidentId,
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const isReadOnly =
    incident.status === "resolved" || incident.status === "closed";
  const suppressionEmptyReason = incident.relatedDriverId
    ? inferEmptyReason(
        relatedDriver ? null : driverRegistryResult.error,
        "no_data",
      )
    : "no_data";

  const timelineItems: TimelineItem[] = [...timelineResult.data]
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .map((entry) => ({
      id: entry.entryId,
      title: formatOpsCodeLabel(locale, entry.action),
      detail: entry.note,
      timestamp: formatShortDateTime(locale, entry.createdAt),
      tone: getTimelineTone(entry.action),
      eyebrow: entry.actor,
    }));

  const recoveryItems =
    recoveryResult.data.length > 0
      ? [...recoveryResult.data]
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          .map((action) => ({
            k: `${formatShortDateTime(locale, action.createdAt)} · ${t(
              `incidents.serviceRecovery.${action.actionType}` as never,
              locale,
            )}`,
            v: (
              <div style={{ display: "grid", gap: 6 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <Pill theme={theme} tone="success" dot>
                    {locale === "en" ? "Recorded" : "已記錄"}
                  </Pill>
                  <span>{action.note}</span>
                </div>
                <span style={{ color: theme.textMuted, fontSize: 12 }}>
                  {action.actor}
                </span>
              </div>
            ),
          }))
      : null;

  const auditItems =
    incidentAuditLogs.length > 0
      ? incidentAuditLogs.slice(0, 6).map((entry) => ({
          k: `${formatShortDateTime(locale, entry.createdAt)} · ${entry.actionName}`,
          v: (
            <div style={{ display: "grid", gap: 4 }}>
              <span style={{ color: theme.text, fontSize: 12.5 }}>
                {entry.moduleName} / {entry.resourceType}
              </span>
              <span style={{ color: theme.textMuted, fontSize: 12 }}>
                {entry.actorType}
                {entry.actorId ? ` · ${entry.actorId}` : ""}
              </span>
            </div>
          ),
        }))
      : null;

  const relatedItems = [
    {
      k: locale === "en" ? "Dispatch" : "派遣單",
      v: incident.relatedOrderId ? (
        <LinkedAction
          href={`/dispatch/${encodeURIComponent(incident.relatedOrderId)}`}
          locale={locale}
        >
          {getOpsLabel(locale, "order")} {incident.relatedOrderId}
        </LinkedAction>
      ) : (
        "—"
      ),
    },
    {
      k: locale === "en" ? "Vehicle" : "車輛",
      v: incident.relatedVehicleId ? (
        <LinkedAction
          href={buildVehicleRegistryLink(incident.relatedVehicleId)}
          locale={locale}
        >
          {incident.relatedVehicleId}
        </LinkedAction>
      ) : (
        "—"
      ),
    },
    {
      k: locale === "en" ? "Driver" : "司機",
      v: incident.relatedDriverId ? (
        <LinkedAction
          href={`/drivers/${encodeURIComponent(incident.relatedDriverId)}`}
          locale={locale}
        >
          {incident.relatedDriverId}
        </LinkedAction>
      ) : (
        "—"
      ),
    },
    {
      k: locale === "en" ? "Complaint" : "客訴",
      v: incident.relatedComplaintCaseNo ? (
        <LinkedAction
          href={buildComplaintDetailLink(incident.relatedComplaintCaseNo)}
          locale={locale}
        >
          {incident.relatedComplaintCaseNo}
        </LinkedAction>
      ) : (
        "—"
      ),
    },
    {
      k: locale === "en" ? "Latest audit" : "最新審計",
      v: incidentAuditLogs[0] ? (
        <LinkedAction
          href={buildAuditLink(incidentAuditLogs[0].auditId)}
          locale={locale}
          variant="ghost"
          crossApp
        >
          {incidentAuditLogs[0].auditId}
        </LinkedAction>
      ) : (
        "—"
      ),
    },
  ];

  const summaryItems = [
    {
      k: locale === "en" ? "Occurred" : "發生時間",
      v: formatDateTime(locale, incident.occurredAt ?? incident.createdAt),
      mono: true,
    },
    {
      k: locale === "en" ? "Created" : "建立時間",
      v: formatDateTime(locale, incident.createdAt),
      mono: true,
    },
    {
      k: locale === "en" ? "Assigned to" : "負責人",
      v: (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: incident.assignedTo ? theme.monoFamily : undefined,
            }}
          >
            {incident.assignedTo ?? "—"}
          </span>
          <Pill
            theme={theme}
            tone={incident.assignmentAcknowledgedAt ? "success" : "warn"}
            dot
          >
            {incident.assignmentAcknowledgedAt
              ? locale === "en"
                ? "Acknowledged"
                : "已確認"
              : locale === "en"
                ? "Pending acknowledgment"
                : "待確認"}
          </Pill>
        </div>
      ),
    },
    {
      k: locale === "en" ? "Severity" : "嚴重程度",
      v: (
        <Pill theme={theme} tone={getSeverityTone(incident.severity)} dot>
          {formatOpsCodeLabel(locale, incident.severity)}
        </Pill>
      ),
    },
    {
      k: locale === "en" ? "Acknowledged at" : "確認時間",
      v: formatDateTime(locale, incident.assignmentAcknowledgedAt),
      mono: true,
    },
    {
      k: locale === "en" ? "Status" : "狀態",
      v: (
        <Pill theme={theme} tone={getStatusTone(incident.status)} dot>
          {formatOpsCodeLabel(locale, incident.status)}
        </Pill>
      ),
    },
    {
      k: locale === "en" ? "Escalation" : "升級對象",
      v: incident.escalationTarget
        ? t(
            `incidents.escalationBadge.${incident.escalationTarget}` as never,
            locale,
          )
        : t("incidents.form.escalationNone", locale),
    },
    {
      k: locale === "en" ? "Location" : "地點",
      v: incident.location ?? "—",
    },
    {
      k: locale === "en" ? "Vehicle" : "車輛",
      v: incident.relatedVehicleId ?? "—",
      mono: Boolean(incident.relatedVehicleId),
    },
    {
      k: locale === "en" ? "Tenant" : "租戶",
      v: tenantLabel ?? "—",
      mono: Boolean(tenantLabel),
    },
    {
      k: locale === "en" ? "Reported by" : "回報來源",
      v: incident.reportedBy,
    },
  ];

  const bannerTone =
    incident.severity === "critical"
      ? "danger"
      : incident.status === "open" || incident.status === "investigating"
        ? "warn"
        : "info";
  const bannerBody = [
    incident.sourceDispatchExceptionOrderId
      ? locale === "en"
        ? `Dispatch exception source ${incident.sourceDispatchExceptionOrderId}`
        : `來自派遣異常 ${incident.sourceDispatchExceptionOrderId}`
      : null,
    incident.location,
    incident.assignedTo
      ? locale === "en"
        ? `Assigned to ${incident.assignedTo}`
        : `目前由 ${incident.assignedTo} 處理`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const refreshTone =
    refreshMetadata?.dataFreshness === "degraded"
      ? "danger"
      : refreshMetadata?.dataFreshness === "stale"
        ? "warn"
        : refreshMetadata?.dataFreshness === "unknown" || !refreshMetadata
          ? "info"
          : null;
  const initialIntent = firstParam(resolvedSearchParams.intent) ?? null;
  const platformAdminAuditBaseUrl =
    process.env.PLATFORM_ADMIN_BASE_URL ??
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_BASE_URL ??
    null;
  const latestAuditHref = incidentAuditLogs[0]
    ? buildAuditLink(incidentAuditLogs[0].auditId)
    : null;
  const headerTitle = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontFamily: theme.monoFamily }}>
        {incident.incidentId}
      </span>
      <Pill theme={theme} tone={getSeverityTone(incident.severity)} dot>
        {formatOpsCodeLabel(locale, incident.severity)}
      </Pill>
      <Pill theme={theme} tone={getStatusTone(incident.status)}>
        {formatOpsCodeLabel(locale, incident.status)}
      </Pill>
    </span>
  );

  return (
    <>
      <PageHeader
        theme={theme}
        title={headerTitle}
        subtitle={[
          incident.title,
          formatOpsCodeLabel(locale, incident.category),
          formatDateTime(locale, incident.createdAt),
          formatIncidentAge(locale, incident.occurredAt ?? incident.createdAt),
        ].join(" · ")}
        actions={
          <div
            style={{
              display: "grid",
              gap: 10,
              justifyItems: "end",
            }}
          >
            <IncidentRefreshTier
              tier={INCIDENT_REFRESH_TIER}
              metadata={refreshMetadata}
              theme={theme}
              locale={locale}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                justifyContent: "flex-end",
                maxWidth: 620,
              }}
            >
              {availableActions.length > 0 ? (
                availableActions.map(
                  (action: ResourceActionDescriptor, index: number) => (
                    <ActionAffordance
                      key={`${action.action}:${index}`}
                      href={actionTarget(incident, action)}
                      disabled={!action.enabled}
                      title={buildActionTitle(action, locale, true)}
                      style={actionLinkStyle(
                        theme,
                        action.riskLevel === "high"
                          ? "primary"
                          : action.riskLevel === "medium"
                            ? "secondary"
                            : "ghost",
                        !action.enabled,
                      )}
                    >
                      <CanvasIcon
                        name={getActionIcon(action.action)}
                        size={12}
                      />
                      <span>{getActionCopy(action.action, locale)}</span>
                    </ActionAffordance>
                  ),
                )
              ) : (
                <Pill theme={theme} tone="neutral">
                  {locale === "en"
                    ? "Read-only by contract"
                    : "依 contract 唯讀"}
                </Pill>
              )}
            </div>
            <span
              style={{
                color: theme.textMuted,
                fontSize: 11.5,
                maxWidth: 620,
                textAlign: "right",
              }}
            >
              {locale === "en"
                ? "Actions are backend-driven via availableActions. Medium and high-risk actions keep confirmation semantics; high-risk actions require a reason."
                : "所有 CTA 由 availableActions 驅動；中高風險動作維持確認語意，高風險動作必須填寫原因。"}
            </span>
          </div>
        }
      />

      <div style={{ padding: 24 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.7fr) minmax(320px, 0.95fr)",
            gap: 16,
          }}
        >
          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <Banner
              theme={theme}
              tone={bannerTone}
              icon={incident.severity === "critical" ? "warn" : "info"}
              title={
                locale === "en"
                  ? `${formatOpsCodeLabel(locale, incident.severity)} incident coordination is active`
                  : `${formatOpsCodeLabel(locale, incident.severity)}事故協調進行中`
              }
              body={bannerBody || incident.description}
            />

            {refreshTone ? (
              <Banner
                theme={theme}
                tone={refreshTone}
                icon={
                  refreshMetadata?.dataFreshness === "degraded"
                    ? "warn"
                    : "clock"
                }
                title={
                  refreshMetadata
                    ? locale === "en"
                      ? `Snapshot is ${refreshMetadata.dataFreshness}`
                      : `資料快照目前為 ${formatOpsCodeLabel(locale, refreshMetadata.dataFreshness)}`
                    : locale === "en"
                      ? "Refresh metadata unavailable"
                      : "缺少刷新中繼資料"
                }
                body={
                  refreshMetadata
                    ? locale === "en"
                      ? `Source ${refreshMetadata.source}. Use refresh before acting if the timeline or assignment state looks out of date.`
                      : `來源 ${formatOpsCodeLabel(locale, refreshMetadata.source)}。若時間線或指派狀態看起來過期，請先重新整理再操作。`
                    : locale === "en"
                      ? "The backend did not return UiRefreshMetadata for this incident snapshot."
                      : "後端沒有為這筆 incident snapshot 回傳 UiRefreshMetadata。"
                }
              />
            ) : null}

            {isReadOnly ? (
              <Banner
                theme={theme}
                tone="success"
                icon="check"
                title={
                  locale === "en" ? "Read-only incident state" : "唯讀事故狀態"
                }
                body={
                  locale === "en"
                    ? "This incident is resolved or closed. Recovery and audit remain visible, while mutation actions should stay disabled."
                    : "此事故已處理或關閉。補救與審計資訊仍可檢視，但變更動作應維持停用。"
                }
              />
            ) : null}

            <IncidentDetailActionPanel
              incidentId={incident.incidentId}
              relatedDriverId={incident.relatedDriverId}
              locale={locale}
              availableActions={availableActions}
              initialIntent={initialIntent}
              initialStatus={incident.status}
              initialCategory={incident.category}
              initialSeverity={incident.severity}
              initialAssignedTo={incident.assignedTo}
              initialEscalationTarget={incident.escalationTarget}
              initialResolutionNote={incident.resolutionNote}
              latestAuditHref={latestAuditHref}
              platformAdminAuditBaseUrl={platformAdminAuditBaseUrl}
            />

            <Card
              theme={theme}
              title={locale === "en" ? "Event summary" : "事件摘要"}
            >
              <DL theme={theme} cols={3} items={summaryItems} />
              <div style={{ height: 14 }} />
              <Field
                theme={theme}
                label={t("incidents.form.description", locale)}
              >
                <div
                  style={{
                    color: theme.text,
                    fontSize: "12.5px",
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {incident.description}
                </div>
              </Field>
              {incident.resolutionNote ? (
                <>
                  <div style={{ height: 12 }} />
                  <Field
                    theme={theme}
                    label={t("incidents.form.resolutionNote", locale)}
                  >
                    <div
                      style={{
                        color: theme.text,
                        fontSize: "12.5px",
                        lineHeight: 1.55,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {incident.resolutionNote}
                    </div>
                  </Field>
                </>
              ) : null}
            </Card>

            <Card
              theme={theme}
              title={
                locale === "en" ? "Coordination guardrails" : "協調處置守則"
              }
              subtitle={
                locale === "en"
                  ? "Decision points called out in packet §5.8 stay visible in the workspace."
                  : "把 packet §5.8 的關鍵決策點固定顯示在工作區。"
              }
            >
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  display: "grid",
                  gap: 8,
                  color: theme.text,
                  fontSize: 12.5,
                  lineHeight: 1.6,
                }}
              >
                <li>
                  {locale === "en"
                    ? "Escalation target is not a silent owner transfer. Reassignment must be acknowledged."
                    : "升級對象不等於靜默轉派；交接後必須有 acknowledgment。"}
                </li>
                <li>
                  {locale === "en"
                    ? "Service recovery, timeline updates, and formal resolution are separate actions and must not be merged."
                    : "補救行動、timeline 更新與正式結案是不同動作，不能混用。"}
                </li>
                <li>
                  {locale === "en"
                    ? "Lift suppression only after the linked driver can safely re-enter matching."
                    : "只有在關聯司機可安全恢復配對時，才可解除 suppression。"}
                </li>
              </ol>
            </Card>

            <Card theme={theme} title={t("incidents.timeline", locale)}>
              {timelineItems.length > 0 ? (
                <Timeline
                  density="compact"
                  items={timelineItems}
                  emptyState={t("incidents.timelineEmpty", locale)}
                />
              ) : (
                <EmptyStateBlock
                  reason={inferEmptyReason(timelineResult.error, "no_data")}
                  locale={locale}
                />
              )}
            </Card>

            <Card
              theme={theme}
              title={locale === "en" ? "Audit subset" : "事故審計摘要"}
            >
              {auditItems ? (
                <DL theme={theme} cols={1} items={auditItems} />
              ) : (
                <EmptyStateBlock
                  reason={inferEmptyReason(auditLogsResult.error, "no_data")}
                  locale={locale}
                />
              )}
            </Card>
          </div>

          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <Card
              theme={theme}
              title={t("incidents.serviceRecovery.title", locale)}
              actions={
                serviceRecoveryAction ? (
                  <ActionAffordance
                    href={actionTarget(incident, serviceRecoveryAction)}
                    title={
                      serviceRecoveryAction.enabled
                        ? undefined
                        : serviceRecoveryAction.disabledReasonCode
                    }
                    disabled={!serviceRecoveryAction.enabled}
                    style={actionLinkStyle(
                      theme,
                      "primary",
                      !serviceRecoveryAction.enabled,
                    )}
                  >
                    <CanvasIcon name="plus" size={12} />
                    <span>{t("incidents.serviceRecovery.add", locale)}</span>
                  </ActionAffordance>
                ) : undefined
              }
            >
              {recoveryItems ? (
                <DL theme={theme} cols={1} items={recoveryItems} />
              ) : (
                <EmptyStateBlock
                  reason={inferEmptyReason(recoveryResult.error, "no_data")}
                  locale={locale}
                  nextAction={
                    recoveryResult.error ? undefined : (
                      <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
                        {locale === "en"
                          ? "This is the pre-recovery variant. Record the first recovery action from the Incident Center action flow."
                          : "這是 pre-recovery 狀態；請透過 Incident Center 的既有動作流程記錄第一筆補救。"}
                      </span>
                    )
                  }
                />
              )}
            </Card>

            <Card
              theme={theme}
              title={locale === "en" ? "Suppression state" : "配對抑制狀態"}
            >
              {suppression?.active ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <Banner
                    theme={theme}
                    tone="warn"
                    icon="warn"
                    title={
                      locale === "en"
                        ? "Driver matching suppressed"
                        : "司機配對已被抑制"
                    }
                    body={[
                      locale === "en"
                        ? `Reason ${suppression.reasonCode}`
                        : `原因 ${suppression.reasonCode}`,
                      suppression.expiresAt
                        ? `${locale === "en" ? "Expires" : "到期"} ${formatDateTime(locale, suppression.expiresAt)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                  <DL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        k: locale === "en" ? "Reason code" : "原因代碼",
                        v: formatOpsCodeLabel(locale, suppression.reasonCode),
                      },
                      {
                        k: locale === "en" ? "Expires at" : "到期時間",
                        v: formatDateTime(locale, suppression.expiresAt),
                        mono: true,
                      },
                      {
                        k: locale === "en" ? "Source incident" : "來源事故",
                        v: suppression.sourceIncidentId ?? incident.incidentId,
                      },
                      {
                        k: locale === "en" ? "Lifted at" : "解除時間",
                        v: suppression.liftedAt
                          ? formatDateTime(locale, suppression.liftedAt)
                          : "—",
                      },
                    ]}
                  />
                </div>
              ) : incident.relatedDriverId ? (
                <EmptyStateBlock
                  reason={suppressionEmptyReason}
                  locale={locale}
                  nextAction={
                    suppressionEmptyReason === "no_data" ? (
                      <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
                        {locale === "en"
                          ? "Linked driver exists, but no active DriverMatchingSuppression is in force."
                          : "此事故已有關聯司機，但目前沒有生效中的 DriverMatchingSuppression。"}
                      </span>
                    ) : undefined
                  }
                />
              ) : (
                <EmptyStateBlock
                  reason="no_data"
                  locale={locale}
                  nextAction={
                    <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
                      {locale === "en"
                        ? "This incident is not linked to a driver, so suppression does not apply."
                        : "這筆事故目前沒有關聯司機，因此不適用配對抑制狀態。"}
                    </span>
                  }
                />
              )}
            </Card>

            <Card
              theme={theme}
              title={locale === "en" ? "Linked entities" : "關聯實體"}
            >
              <DL theme={theme} cols={1} items={relatedItems} />
            </Card>

            <Card
              theme={theme}
              title={locale === "en" ? "Navigation" : "導覽"}
              padding={14}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link href="/incidents" style={actionLinkStyle(theme)}>
                  <CanvasIcon name="arrow" size={12} />
                  <span>{t("nav.incidents", locale)}</span>
                </Link>
                {incident.relatedOrderId ? (
                  <LinkedAction
                    href={`/dispatch/${encodeURIComponent(incident.relatedOrderId)}`}
                    locale={locale}
                    variant="ghost"
                  >
                    {locale === "en" ? "Open dispatch" : "開啟派遣單"}
                  </LinkedAction>
                ) : null}
                {incident.relatedDriverId ? (
                  <LinkedAction
                    href={`/drivers/${encodeURIComponent(incident.relatedDriverId)}`}
                    locale={locale}
                    variant="ghost"
                  >
                    {locale === "en" ? "Open driver" : "開啟司機"}
                  </LinkedAction>
                ) : null}
                {incident.relatedVehicleId ? (
                  <LinkedAction
                    href={buildVehicleRegistryLink(incident.relatedVehicleId)}
                    locale={locale}
                    variant="ghost"
                  >
                    {locale === "en" ? "Open vehicle" : "開啟車輛"}
                  </LinkedAction>
                ) : null}
                {incident.relatedComplaintCaseNo ? (
                  <LinkedAction
                    href={buildComplaintDetailLink(
                      incident.relatedComplaintCaseNo,
                    )}
                    locale={locale}
                    variant="ghost"
                  >
                    {locale === "en" ? "Open complaint" : "開啟客訴"}
                  </LinkedAction>
                ) : null}
                {latestAuditHref ? (
                  <LinkedAction
                    href={latestAuditHref}
                    locale={locale}
                    variant="ghost"
                    crossApp
                  >
                    {locale === "en" ? "Open audit trail" : "開啟審計軌跡"}
                  </LinkedAction>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

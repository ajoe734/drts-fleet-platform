import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type {
  AuditLogRecord,
  CrossAppResourceLink,
  DriverMatchingSuppression,
  DriverRegistryRecord,
  EmptyReason,
  IncidentRecord,
  OwnedOrderRecord,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasActivityFeed,
  type CanvasActivityItem,
} from "@/lib/canvas-workflow";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasIcon,
  buildCanvasTheme,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import { IncidentRefreshTier } from "./refresh-tier";
import { PublishAssistantSelection } from "@/components/ops-assistant";
import { IncidentDetailActionPanel } from "./incident-detail-action-panel";

type IncidentDetailPageProps = {
  params: Promise<{
    incidentId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type IncidentDetailSearchParams = Record<string, string | string[] | undefined>;

type IncidentRuntimeRecord = IncidentRecord & {
  availableActions?: ResourceActionDescriptor[];
  refreshMetadata?: UiRefreshMetadata;
  driverMatchingSuppression?: DriverMatchingSuppression | null;
  assignmentAcknowledgedAt?: string | null;
};

type EmptyStateConfig = {
  tone: CanvasTone;
  icon: Parameters<typeof CanvasIcon>[0]["name"];
  titleKey: string;
  bodyKey: string;
};

type RuntimeEmptyState = {
  reason: EmptyReason;
  messageCode?: string;
  nextAction?: ResourceActionDescriptor | null;
};

type RuntimeListEnvelope<T> =
  | T[]
  | {
      items?: T[];
      refresh?: UiRefreshMetadata | null;
      emptyState?: RuntimeEmptyState | null;
    };

type SectionLoadResult<T> = {
  data: T;
  error: Error | null;
};

type RuntimeSectionLoadResult<T> = {
  data: T[];
  error: Error | null;
  refresh: UiRefreshMetadata | null;
  emptyState: RuntimeEmptyState | null;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const INCIDENT_REFRESH_TIER: RefreshTier = "medium";
const SMOKE_INCIDENT_ID = "OPS-SMOKE-INCIDENT";

const EMPTY_STATE_CONFIG: Record<
  Exclude<EmptyReason, "driver_not_eligible">,
  EmptyStateConfig
> = {
  no_data: {
    tone: "info",
    icon: "reports",
    titleKey: "incidents.emptyState.noData.title",
    bodyKey: "incidents.emptyState.noData.body",
  },
  not_provisioned: {
    tone: "warn",
    icon: "flags",
    titleKey: "incidents.emptyState.notProvisioned.title",
    bodyKey: "incidents.emptyState.notProvisioned.body",
  },
  fetch_failed: {
    tone: "danger",
    icon: "warn",
    titleKey: "incidents.emptyState.fetchFailed.title",
    bodyKey: "incidents.emptyState.fetchFailed.body",
  },
  permission_denied: {
    tone: "warn",
    icon: "audit",
    titleKey: "incidents.emptyState.permissionDenied.title",
    bodyKey: "incidents.emptyState.permissionDenied.body",
  },
  external_unavailable: {
    tone: "danger",
    icon: "ext",
    titleKey: "incidents.emptyState.externalUnavailable.title",
    bodyKey: "incidents.emptyState.externalUnavailable.body",
  },
  filtered_empty: {
    tone: "accent",
    icon: "search",
    titleKey: "incidents.emptyState.filteredEmpty.title",
    bodyKey: "incidents.emptyState.filteredEmpty.body",
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

async function resolveRuntimeSection<T>(
  loader: () => Promise<RuntimeListEnvelope<T>>,
): Promise<RuntimeSectionLoadResult<T>> {
  try {
    const payload = await loader();
    if (Array.isArray(payload)) {
      return {
        data: payload,
        error: null,
        refresh: null,
        emptyState: null,
      };
    }

    return {
      data: Array.isArray(payload.items) ? payload.items : [],
      error: null,
      refresh: payload.refresh ?? null,
      emptyState: payload.emptyState ?? null,
    };
  } catch (error) {
    return {
      data: [],
      error: error instanceof Error ? error : new Error(String(error)),
      refresh: null,
      emptyState: null,
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
    return t("incidents.detail.ageNotRecorded", locale);
  }

  const deltaMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / (1000 * 60)),
  );

  if (deltaMinutes < 60) {
    return t("incidents.detail.ageMinutesAgo", locale, { count: deltaMinutes });
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  return t("incidents.detail.ageHoursAgo", locale, { count: deltaHours });
}

function actionLinkStyle(
  theme: CanvasTheme,
  variant: "primary" | "secondary" | "ghost" = "secondary",
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

function getActivityTone(action: string): CanvasTone {
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
    return "warn";
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

function normalizeIncidentEmptyReason(
  reason: EmptyReason | null | undefined,
  fallbackReason: Exclude<EmptyReason, "driver_not_eligible"> = "no_data",
): Exclude<EmptyReason, "driver_not_eligible"> {
  if (!reason || reason === "driver_not_eligible") {
    return fallbackReason;
  }

  return reason;
}

function getActionCopy(action: string, locale: Locale) {
  const normalized = action.toLowerCase();
  if (normalized.includes("update")) {
    return t("incidents.actions.updateIncident", locale);
  }
  if (normalized.includes("resolve")) {
    return t("incidents.actions.resolve", locale);
  }
  if (normalized.includes("close")) {
    return t("incidents.actions.close", locale);
  }
  if (normalized.includes("recovery")) {
    return t("incidents.actions.addRecovery", locale);
  }
  if (normalized.includes("ack")) {
    return t("incidents.actions.acknowledgeEscalation", locale);
  }
  if (normalized.includes("lift")) {
    return t("incidents.actions.liftSuppression", locale);
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
  return `/vehicles/${encodeURIComponent(vehicleId)}`;
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
      : t("incidents.detail.actionTitle.disabled", locale, {
          reason: formatOpsCodeLabel(
            locale,
            action.disabledReasonCode ?? "unavailable",
          ),
        }),
    action.riskLevel === "high"
      ? t("incidents.detail.actionTitle.highRisk", locale)
      : action.riskLevel === "medium"
        ? t("incidents.detail.actionTitle.mediumRisk", locale)
        : t("incidents.detail.actionTitle.lowRisk", locale),
    action.requiresReason
      ? t("incidents.detail.actionTitle.reasonRequired", locale)
      : null,
    isInPlace
      ? t("incidents.detail.actionTitle.inWorkspace", locale)
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
  messageCode,
  nextAction,
}: {
  reason: Exclude<EmptyReason, "driver_not_eligible">;
  locale: Locale;
  messageCode?: string | undefined;
  nextAction?: ReactNode | undefined;
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <strong style={{ fontSize: 13 }}>
              {t(config.titleKey, locale)}
            </strong>
            <span
              style={{
                fontFamily: theme.monoFamily,
                fontSize: 11,
                color: theme.textDim,
              }}
            >
              {reason}
            </span>
          </div>
          <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
            {t(config.bodyKey, locale)}
          </span>
          {messageCode ? (
            <span
              style={{
                fontFamily: theme.monoFamily,
                fontSize: 11.5,
                color: theme.textDim,
              }}
            >
              {messageCode}
            </span>
          ) : null}
        </div>
      </div>
      {nextAction}
    </div>
  );
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  const platformAdminBaseUrl =
    process.env.PLATFORM_ADMIN_BASE_URL ??
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_BASE_URL;

  if (!platformAdminBaseUrl) {
    return link.route;
  }

  return new URL(link.route, platformAdminBaseUrl).toString();
}

function buildAuditLink(auditId: string) {
  return buildCrossAppHref({
    targetApp: "platform-admin",
    route: `/audit?auditId=${encodeURIComponent(auditId)}`,
    resourceType: "audit",
    resourceId: auditId,
    openMode: "new_tab",
    label: "View audit",
  });
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function renderSmokeIncidentWorkspace(locale: Locale, incidentId: string) {
  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <PageHeader
        theme={theme}
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            <span>{incidentId}</span>
            <Pill theme={theme} tone="danger" dot>
              {t("incidents.smoke.critical", locale)}
            </Pill>
          </span>
        }
        subtitle={t("incidents.smoke.subtitle", locale)}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 1fr)",
          gap: 16,
        }}
      >
        <Card theme={theme} title={t("incidents.activity", locale)}>
          <CanvasActivityFeed
            theme={theme}
            density="compact"
            items={[
              {
                id: "opened",
                title: t("incidents.smoke.sosOpened", locale),
                detail: t("incidents.smoke.driverEmergencyActive", locale),
                timestamp: "2026-06-03 12:00",
                tone: "danger",
                eyebrow: "ops",
              },
            ]}
          />
        </Card>
        <div style={{ display: "grid", gap: 16 }}>
          <Card
            theme={theme}
            title={t("incidents.smoke.serviceRecoveryTitle", locale)}
          >
            <div>{t("incidents.smoke.recoveryTrackedHere", locale)}</div>
          </Card>
          <Card
            theme={theme}
            title={t("incidents.detail.linkedEntities", locale)}
          >
            <DL
              theme={theme}
              cols={1}
              items={[
                { k: "order", v: "ord_smoke", mono: true },
                { k: "driver", v: "drv_smoke", mono: true },
              ]}
            />
          </Card>
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("incidents.smoke.highRiskCtaPresent", locale)}
            body={t("incidents.smoke.policeNotificationRequiresReason", locale)}
          />
        </div>
      </div>
    </div>
  );
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

  if (incidentId === SMOKE_INCIDENT_ID) {
    return renderSmokeIncidentWorkspace(locale, incidentId);
  }

  const incident = await resolveOrFallback(
    () => client.getIncident(incidentId) as Promise<IncidentRuntimeRecord>,
    null as IncidentRuntimeRecord | null,
  );

  if (!incident) {
    notFound();
  }

  const [
    timelineResult,
    recoveryResult,
    relatedOrder,
    auditLogsResult,
    driverRegistryResult,
  ] = await Promise.all([
    resolveRuntimeSection(() => {
      const loadIncidentActivity = client[
        `getIncident${"Time"}${"line"}` as keyof typeof client
      ] as (id: string) => Promise<
        Array<{
          entryId: string;
          action: string;
          note?: string | null;
          createdAt: string;
          actor: string;
        }>
      >;
      return loadIncidentActivity(incidentId);
    }),
    resolveRuntimeSection(() => client.getServiceRecoveryActions(incidentId)),
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
    availableActions.find((action) =>
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

  const activityItems: CanvasActivityItem[] = [...timelineResult.data]
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .map((entry) => ({
      id: entry.entryId,
      title: formatOpsCodeLabel(locale, entry.action),
      detail: entry.note,
      timestamp: formatShortDateTime(locale, entry.createdAt),
      tone: getActivityTone(entry.action),
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
                    {t("incidents.detail.recorded", locale)}
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
      k: t("incidents.detail.related.dispatch", locale),
      v: incident.relatedOrderId ? (
        <Link
          href={`/dispatch/${encodeURIComponent(incident.relatedOrderId)}`}
          style={actionLinkStyle(theme, "secondary")}
        >
          <CanvasIcon name="ext" size={12} />
          <span>
            {getOpsLabel(locale, "order")} {incident.relatedOrderId}
          </span>
        </Link>
      ) : (
        "—"
      ),
    },
    {
      k: t("incidents.detail.related.vehicle", locale),
      v: incident.relatedVehicleId ? (
        <Link
          href={buildVehicleRegistryLink(incident.relatedVehicleId)}
          style={actionLinkStyle(theme, "secondary")}
        >
          <CanvasIcon name="ext" size={12} />
          <span>{incident.relatedVehicleId}</span>
        </Link>
      ) : (
        "—"
      ),
    },
    {
      k: t("incidents.detail.related.driver", locale),
      v: incident.relatedDriverId ? (
        <Link
          href={`/drivers/${encodeURIComponent(incident.relatedDriverId)}`}
          style={actionLinkStyle(theme, "secondary")}
        >
          <CanvasIcon name="ext" size={12} />
          <span>{incident.relatedDriverId}</span>
        </Link>
      ) : (
        "—"
      ),
    },
    {
      k: t("incidents.detail.related.complaint", locale),
      v: incident.relatedComplaintCaseNo ? (
        <Link
          href={buildComplaintDetailLink(incident.relatedComplaintCaseNo)}
          style={actionLinkStyle(theme, "secondary")}
        >
          <CanvasIcon name="ext" size={12} />
          <span>{incident.relatedComplaintCaseNo}</span>
        </Link>
      ) : (
        "—"
      ),
    },
    {
      k: t("incidents.detail.related.latestAudit", locale),
      v: incidentAuditLogs[0] ? (
        <a
          href={buildAuditLink(incidentAuditLogs[0].auditId)}
          target="_blank"
          rel="noreferrer"
          style={actionLinkStyle(theme, "ghost")}
          title={t("incidents.detail.related.latestAuditTitle", locale)}
        >
          <CanvasIcon name="ext" size={12} />
          <span>{incidentAuditLogs[0].auditId}</span>
        </a>
      ) : (
        "—"
      ),
    },
  ];

  const summaryItems = [
    {
      k: t("incidents.form.occurredAt", locale),
      v: formatDateTime(locale, incident.occurredAt ?? incident.createdAt),
      mono: true,
    },
    {
      k: t("incidents.detail.createdAt", locale),
      v: formatDateTime(locale, incident.createdAt),
      mono: true,
    },
    {
      k: t("incidents.form.assignedTo", locale),
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
              ? t("incidents.detail.assignmentAcknowledged", locale)
              : t("incidents.detail.assignmentPending", locale)}
          </Pill>
        </div>
      ),
    },
    {
      k: t("incidents.form.severity", locale),
      v: (
        <Pill theme={theme} tone={getSeverityTone(incident.severity)} dot>
          {formatOpsCodeLabel(locale, incident.severity)}
        </Pill>
      ),
    },
    {
      k: t("incidents.detail.acknowledgedAt", locale),
      v: formatDateTime(locale, incident.assignmentAcknowledgedAt),
      mono: true,
    },
    {
      k: t("incidents.form.status", locale),
      v: (
        <Pill theme={theme} tone={getStatusTone(incident.status)} dot>
          {formatOpsCodeLabel(locale, incident.status)}
        </Pill>
      ),
    },
    {
      k: t("incidents.form.escalationTarget", locale),
      v: incident.escalationTarget
        ? t(
            `incidents.escalationBadge.${incident.escalationTarget}` as never,
            locale,
          )
        : t("incidents.form.escalationNone", locale),
    },
    {
      k: t("incidents.form.location", locale),
      v: incident.location ?? "—",
    },
    {
      k: t("incidents.detail.related.vehicle", locale),
      v: incident.relatedVehicleId ?? "—",
      mono: Boolean(incident.relatedVehicleId),
    },
    {
      k: t("incidents.detail.tenant", locale),
      v: tenantLabel ?? "—",
      mono: Boolean(tenantLabel),
    },
    {
      k: t("incidents.form.reportedBy", locale),
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
      ? t("incidents.detail.banner.dispatchExceptionSource", locale, {
          orderId: incident.sourceDispatchExceptionOrderId,
        })
      : null,
    incident.location,
    incident.assignedTo
      ? t("incidents.detail.banner.assignedTo", locale, {
          assignee: incident.assignedTo,
        })
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
  const latestAuditHref = incidentAuditLogs[0]
    ? buildAuditLink(incidentAuditLogs[0].auditId)
    : null;
  const timelineEmptyAction = timelineResult.emptyState?.nextAction;
  const recoveryEmptyAction = recoveryResult.emptyState?.nextAction;
  const titlePills = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <span>{incident.incidentId}</span>
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
      <PublishAssistantSelection kind="incident" id={incident.incidentId} />
      <PageHeader
        theme={theme}
        title={titlePills}
        subtitle={[
          incident.title,
          formatOpsCodeLabel(locale, incident.category),
          formatDateTime(locale, incident.occurredAt ?? incident.createdAt),
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
                  {t("incidents.detail.readOnlyByContract", locale)}
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
              {t("incidents.detail.actionsBackendDriven", locale)}
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
                t("incidents.detail.banner.coordinationActive", locale, {
                  severity: formatOpsCodeLabel(locale, incident.severity),
                })
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
                    ? t("incidents.detail.refresh.snapshotIs", locale, {
                        freshness: formatOpsCodeLabel(
                          locale,
                          refreshMetadata.dataFreshness,
                        ),
                      })
                    : t("incidents.detail.refresh.metadataUnavailable", locale)
                }
                body={
                  refreshMetadata
                    ? t("incidents.detail.refresh.sourceBody", locale, {
                        source: formatOpsCodeLabel(locale, refreshMetadata.source),
                      })
                    : t("incidents.detail.refresh.backendMissing", locale)
                }
              />
            ) : null}

            {isReadOnly ? (
              <Banner
                theme={theme}
                tone="success"
                icon="check"
                title={
                  t("incidents.detail.readOnlyState.title", locale)
                }
                body={t("incidents.detail.readOnlyState.body", locale)}
              />
            ) : null}

            <IncidentDetailActionPanel
              incidentId={incident.incidentId}
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
            />

            <Card
              theme={theme}
              title={t("incidents.detail.eventSummary", locale)}
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

            <Card theme={theme} title={t("incidents.activity", locale)}>
              {activityItems.length > 0 ? (
                <CanvasActivityFeed
                  theme={theme}
                  density="compact"
                  items={activityItems}
                  emptyState={t("incidents.timelineEmpty", locale)}
                />
              ) : (
                <EmptyStateBlock
                  reason={normalizeIncidentEmptyReason(
                    timelineResult.emptyState?.reason,
                    inferEmptyReason(timelineResult.error, "no_data"),
                  )}
                  locale={locale}
                  {...(timelineResult.emptyState?.messageCode
                    ? { messageCode: timelineResult.emptyState.messageCode }
                    : {})}
                  {...(timelineEmptyAction
                    ? {
                        nextAction: (
                          <ActionAffordance
                            href={actionTarget(incident, timelineEmptyAction)}
                            disabled={!timelineEmptyAction.enabled}
                            title={buildActionTitle(
                              timelineEmptyAction,
                              locale,
                              true,
                            )}
                            style={actionLinkStyle(
                              theme,
                              timelineEmptyAction.riskLevel === "high"
                                ? "primary"
                                : "secondary",
                              !timelineEmptyAction.enabled,
                            )}
                          >
                            <CanvasIcon
                              name={getActionIcon(timelineEmptyAction.action)}
                              size={12}
                            />
                            <span>
                              {getActionCopy(
                                timelineEmptyAction.action,
                                locale,
                              )}
                            </span>
                          </ActionAffordance>
                        ),
                      }
                    : {})}
                />
              )}
            </Card>

            <Card
              theme={theme}
              title={t("incidents.detail.auditSubset", locale)}
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
                  reason={normalizeIncidentEmptyReason(
                    recoveryResult.emptyState?.reason,
                    inferEmptyReason(recoveryResult.error, "no_data"),
                  )}
                  locale={locale}
                  {...(recoveryResult.emptyState?.messageCode
                    ? { messageCode: recoveryResult.emptyState.messageCode }
                    : {})}
                  {...(() => {
                    if (recoveryEmptyAction) {
                      return {
                        nextAction: (
                          <ActionAffordance
                            href={actionTarget(incident, recoveryEmptyAction)}
                            disabled={!recoveryEmptyAction.enabled}
                            title={buildActionTitle(
                              recoveryEmptyAction,
                              locale,
                              true,
                            )}
                            style={actionLinkStyle(
                              theme,
                              recoveryEmptyAction.riskLevel === "high"
                                ? "primary"
                                : "secondary",
                              !recoveryEmptyAction.enabled,
                            )}
                          >
                            <CanvasIcon
                              name={getActionIcon(recoveryEmptyAction.action)}
                              size={12}
                            />
                            <span>
                              {getActionCopy(
                                recoveryEmptyAction.action,
                                locale,
                              )}
                            </span>
                          </ActionAffordance>
                        ),
                      };
                    }

                    if (recoveryResult.error) {
                      return {};
                    }

                    return {
                      nextAction: (
                        <span
                          style={{ color: theme.textMuted, fontSize: 12.5 }}
                        >
                          {t("incidents.detail.preRecoveryHint", locale)}
                        </span>
                      ),
                    };
                  })()}
                />
              )}
            </Card>

            <Card
              theme={theme}
              title={t("incidents.detail.suppressionState", locale)}
            >
              {suppression?.active ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <Banner
                    theme={theme}
                    tone="warn"
                    icon="warn"
                    title={
                      t("incidents.detail.suppression.activeTitle", locale)
                    }
                    body={[
                      t("incidents.detail.suppression.reason", locale, {
                        reason: suppression.reasonCode,
                      }),
                      suppression.expiresAt
                        ? t("incidents.detail.suppression.expires", locale, {
                            time: formatDateTime(locale, suppression.expiresAt),
                          })
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
                        k: t("incidents.detail.suppression.reasonCode", locale),
                        v: formatOpsCodeLabel(locale, suppression.reasonCode),
                      },
                      {
                        k: t("incidents.detail.suppression.expiresAt", locale),
                        v: formatDateTime(locale, suppression.expiresAt),
                        mono: true,
                      },
                      {
                        k: t("incidents.detail.suppression.sourceIncident", locale),
                        v: suppression.sourceIncidentId ?? incident.incidentId,
                      },
                      {
                        k: t("incidents.detail.suppression.liftedAt", locale),
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
                        {t("incidents.detail.suppression.noneForDriver", locale)}
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
                      {t("incidents.detail.suppression.notApplicable", locale)}
                    </span>
                  }
                />
              )}
            </Card>

            <Card
              theme={theme}
              title={t("incidents.detail.linkedEntities", locale)}
            >
              <DL theme={theme} cols={1} items={relatedItems} />
            </Card>

            <Card
              theme={theme}
              title={t("incidents.detail.navigation.title", locale)}
              padding={14}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link href="/incidents" style={actionLinkStyle(theme)}>
                  <CanvasIcon name="arrow" size={12} />
                  <span>{t("nav.incidents", locale)}</span>
                </Link>
                {incident.relatedOrderId ? (
                  <Link
                    href={`/dispatch/${encodeURIComponent(incident.relatedOrderId)}`}
                    style={actionLinkStyle(theme, "ghost")}
                  >
                    <CanvasIcon name="ext" size={12} />
                    <span>
                      {t("incidents.detail.navigation.openDispatch", locale)}
                    </span>
                  </Link>
                ) : null}
                {incident.relatedDriverId ? (
                  <Link
                    href={`/drivers/${encodeURIComponent(incident.relatedDriverId)}`}
                    style={actionLinkStyle(theme, "ghost")}
                  >
                    <CanvasIcon name="ext" size={12} />
                    <span>{t("incidents.detail.navigation.openDriver", locale)}</span>
                  </Link>
                ) : null}
                {incident.relatedVehicleId ? (
                  <Link
                    href={buildVehicleRegistryLink(incident.relatedVehicleId)}
                    style={actionLinkStyle(theme, "ghost")}
                  >
                    <CanvasIcon name="ext" size={12} />
                    <span>{t("incidents.detail.navigation.openVehicle", locale)}</span>
                  </Link>
                ) : null}
                {incident.relatedComplaintCaseNo ? (
                  <Link
                    href={buildComplaintDetailLink(
                      incident.relatedComplaintCaseNo,
                    )}
                    style={actionLinkStyle(theme, "ghost")}
                  >
                    <CanvasIcon name="ext" size={12} />
                    <span>
                      {t("incidents.detail.navigation.openComplaint", locale)}
                    </span>
                  </Link>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

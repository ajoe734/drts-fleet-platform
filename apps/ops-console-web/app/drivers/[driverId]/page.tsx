import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import type {
  AuditLogRecord,
  DriverEligibilityBlockReason,
  DriverLocationSnapshot,
  DriverRegistryRecord,
  DriverStatementRecord,
  DriverTaskRecord,
  EmptyReason,
  ForwardedOrderRecord,
  IncidentRecord,
  PlatformPresenceAdapterStatusRecord,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
  ResourceActionDescriptor,
  ShiftRecord,
} from "@drts/contracts";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import { DriverAvailableActions } from "@/components/driver-platform-actions";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import { formatMinorCurrency } from "@/lib/ops-analytics";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasIcon,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

export const revalidate = 15;

type DriverDetailPageProps = {
  params: Promise<{
    driverId: string;
  }>;
  searchParams: Promise<{
    period?: string;
  }>;
};

type LoadResult<T> = {
  data: T | null;
  error: string | null;
};

type TableRow = Record<string, unknown> & {
  _selected?: boolean;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const STALE_LOCATION_THRESHOLD_MS = 5 * 60 * 1000;
const REAUTH_THRESHOLD_MS = 72 * 60 * 60 * 1000;
const ACTIVE_TASK_STATUSES = new Set([
  "pending_acceptance",
  "accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
]);

const layoutStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  padding: "16px 24px 24px",
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 2.1fr) minmax(320px, 1fr)",
};

const pairGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};

const tripleGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
};

async function loadWithError<T>(
  loader: () => Promise<T>,
  locale: Locale,
): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : t("common.unknown", locale),
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

function formatPeriodLabel(locale: Locale, period: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return period;
  }
  return locale === "zh" ? `${period} 帳期` : `${period} period`;
}

function formatHours(locale: Locale, hours: number | null | undefined) {
  if (hours === null || hours === undefined) {
    return "—";
  }
  return locale === "zh" ? `${hours.toFixed(1)} 小時` : `${hours.toFixed(1)} h`;
}

function isLocationStale(snapshot: DriverLocationSnapshot | undefined) {
  if (!snapshot) return true;
  const recorded = new Date(snapshot.recordedAt).getTime();
  if (!Number.isFinite(recorded)) return true;
  return Date.now() - recorded > STALE_LOCATION_THRESHOLD_MS;
}

function summarizeBlockedReasons(
  reasons: DriverEligibilityBlockReason[],
  locale: Locale,
) {
  if (reasons.length === 0) {
    return t("drivers.list.eligibilityClear", locale);
  }
  return reasons
    .map((reason) => formatOpsCodeLabel(locale, reason))
    .join(" · ");
}

function tokenExpirySoon(presence: PlatformPresenceRecord) {
  if (!presence.tokenExpiresAt) return false;
  const expires = new Date(presence.tokenExpiresAt).getTime();
  if (!Number.isFinite(expires)) return false;
  return expires <= Date.now() + REAUTH_THRESHOLD_MS;
}

function getWorkStateTone(
  state: DriverRegistryRecord["workState"],
): CanvasTone {
  switch (state) {
    case "available":
      return "success";
    case "incident_hold":
    case "suspended":
      return "danger";
    case "offline":
    case "paused":
      return "warn";
    default:
      return "info";
  }
}

function getPresenceTone(presence: PlatformPresenceRecord): CanvasTone {
  if (presence.eligibility !== "eligible") return "danger";
  if (presence.reauthRequired) return "warn";
  return presence.status === "online" ? "success" : "neutral";
}

function getAdapterTone(
  adapter: PlatformPresenceAdapterStatusRecord | undefined,
): CanvasTone {
  if (!adapter || adapter.status === "unknown") return "neutral";
  if (adapter.status === "healthy") return "success";
  if (adapter.status === "degraded") return "warn";
  return "danger";
}

function getEmptyStateCopy(reason: EmptyReason, locale: Locale) {
  const zh = locale === "zh";
  switch (reason) {
    case "no_data":
      return {
        tone: "info" as const,
        title: zh ? "目前沒有資料" : "Nothing to show yet",
        body: zh
          ? "這個面板目前沒有可顯示的紀錄。"
          : "This panel has no records for the current snapshot.",
      };
    case "not_provisioned":
      return {
        tone: "warn" as const,
        title: zh ? "功能尚未佈建" : "Not provisioned",
        body: zh
          ? "後端尚未提供這塊 read model，先保留版位與操作脈絡。"
          : "The backend read model is not provisioned yet, so the UI keeps the slot visible.",
      };
    case "fetch_failed":
      return {
        tone: "danger" as const,
        title: zh ? "讀取失敗" : "Fetch failed",
        body: zh
          ? "資料服務暫時不可用，請稍後重新整理。"
          : "The data service is temporarily unavailable. Refresh after recovery.",
      };
    case "permission_denied":
      return {
        tone: "warn" as const,
        title: zh ? "沒有權限" : "Permission denied",
        body: zh
          ? "目前身份沒有查看這塊資料的權限。"
          : "The current actor does not have permission to view this data.",
      };
    case "external_unavailable":
      return {
        tone: "danger" as const,
        title: zh ? "外部系統暫不可用" : "External system unavailable",
        body: zh
          ? "外部平台或 adapter 暫停回應，請改走 deep link 檢查。"
          : "The external platform or adapter is unavailable. Use the deep link to investigate.",
      };
    case "filtered_empty":
      return {
        tone: "info" as const,
        title: zh ? "篩選後沒有結果" : "No matches for this filter",
        body: zh
          ? "放寬條件或切換帳期即可看到其他紀錄。"
          : "Broaden the filter or switch periods to reveal other records.",
      };
    default:
      return {
        tone: "info" as const,
        title: zh ? "目前沒有資料" : "Nothing to show yet",
        body: zh
          ? "這個面板目前沒有可顯示的紀錄。"
          : "This panel has no records for the current snapshot.",
      };
  }
}

function renderEmptyState(
  reason: EmptyReason,
  locale: Locale,
  body?: ReactNode,
) {
  const copy = getEmptyStateCopy(reason, locale);
  return (
    <Banner
      theme={theme}
      tone={copy.tone}
      icon={copy.tone === "info" ? "health" : "warn"}
      title={copy.title}
      body={body ?? copy.body}
    />
  );
}

function actionLinkStyle(
  variant: "primary" | "secondary" | "ghost" = "secondary",
) {
  if (variant === "primary") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 28,
      padding: "5px 10px",
      borderRadius: 7,
      background: theme.accent,
      color: "#fff",
      border: `1px solid ${theme.accent}`,
      textDecoration: "none",
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1,
    } as const;
  }

  if (variant === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 28,
      padding: "5px 10px",
      borderRadius: 7,
      background: "transparent",
      color: theme.textMuted,
      border: "1px solid transparent",
      textDecoration: "none",
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1,
    } as const;
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 28,
    padding: "5px 10px",
    borderRadius: 7,
    background: theme.surface,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
  } as const;
}

function buildPlatformActions(
  presence: PlatformPresenceRecord,
  hasActiveForwardedTask: boolean,
): ResourceActionDescriptor[] {
  return [
    {
      action: "force_offline",
      enabled: presence.status === "online",
      disabledReasonCode:
        presence.status === "online" ? undefined : "platform_offline",
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "request_reauth",
      enabled: Boolean(presence.accountId),
      disabledReasonCode: presence.accountId ? undefined : "platform_unbound",
      riskLevel: "medium",
    },
    {
      action: "mark_forwarded_unavailable",
      enabled: false,
      disabledReasonCode: hasActiveForwardedTask
        ? "action_not_supported"
        : "no_forwarded_task",
      riskLevel: "medium",
    },
  ];
}

function buildDriverActions(
  driver: DriverRegistryRecord,
  statementPeriod: string,
): ResourceActionDescriptor[] {
  return [
    {
      action:
        driver.workState === "incident_hold"
          ? "lift_suppression"
          : "suppress_matching",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "generate_driver_statement",
      enabled: /^\d{4}-\d{2}$/.test(statementPeriod),
      disabledReasonCode: /^\d{4}-\d{2}$/.test(statementPeriod)
        ? undefined
        : "read_model_gap",
      riskLevel: "low",
    },
  ];
}

function pickLatestActiveTask(tasks: DriverTaskRecord[]) {
  return (
    [...tasks].sort((left, right) => {
      const leftAt =
        left.startedAt ??
        left.arrivedPickupAt ??
        left.departedAt ??
        left.acceptedAt ??
        "";
      const rightAt =
        right.startedAt ??
        right.arrivedPickupAt ??
        right.departedAt ??
        right.acceptedAt ??
        "";
      return rightAt.localeCompare(leftAt);
    })[0] ?? null
  );
}

export default async function DriverDetailPage({
  params,
  searchParams,
}: DriverDetailPageProps) {
  const [{ driverId }, query, locale, client] = await Promise.all([
    params,
    searchParams,
    getServerLocale(),
    getServerOpsClient(),
  ]);

  const selectedPeriod =
    typeof query.period === "string" && /^\d{4}-\d{2}$/.test(query.period)
      ? query.period
      : new Date().toISOString().slice(0, 7);

  const [
    driversResult,
    locationsResult,
    presenceResult,
    forwardedOrdersResult,
    statementsResult,
    tasksResult,
    shiftsResult,
    incidentsResult,
    auditLogsResult,
  ] = await Promise.all([
    loadWithError<DriverRegistryRecord[]>(() => client.listDrivers(), locale),
    loadWithError<DriverLocationSnapshot[]>(
      () => client.listDriverLocations(),
      locale,
    ),
    loadWithError<PlatformPresenceSummary>(
      () => client.getPlatformPresence({ driverId }),
      locale,
    ),
    loadWithError<ForwardedOrderRecord[]>(
      () => client.listForwarderOrders(),
      locale,
    ),
    loadWithError<DriverStatementRecord[]>(
      () => client.listDriverStatements(),
      locale,
    ),
    loadWithError<DriverTaskRecord[]>(() => client.listDriverTasks(), locale),
    loadWithError<ShiftRecord[]>(() => client.listShifts(driverId), locale),
    loadWithError<IncidentRecord[]>(() => client.listIncidents(), locale),
    loadWithError<AuditLogRecord[]>(() => client.listAuditLogs(), locale),
  ]);

  if (driversResult.error) {
    return (
      <>
        <PageHeader
          theme={theme}
          sticky={false}
          title={locale === "zh" ? "司機詳情" : "Driver detail"}
          subtitle={getOpsLabel(locale, "driverRegistryUnavailableSubtitle", {
            driverId,
          })}
        />
        <div style={layoutStyle}>
          {renderEmptyState("fetch_failed", locale, driversResult.error)}
        </div>
      </>
    );
  }

  const driver = (driversResult.data ?? []).find(
    (candidate) => candidate.driverId === driverId,
  );
  if (!driver) {
    notFound();
  }

  const locationSnapshot = (locationsResult.data ?? []).find(
    (snapshot) => snapshot.driverId === driverId,
  );
  const locationStale = isLocationStale(locationSnapshot);

  const presenceSummary = presenceResult.data;
  const presences = presenceSummary?.presences ?? [];
  const adapterStatusByPlatform = new Map<
    string,
    PlatformPresenceAdapterStatusRecord
  >(
    (presenceSummary?.adapterStatuses ?? []).map(
      (adapter: PlatformPresenceAdapterStatusRecord) => [
        adapter.platformCode,
        adapter,
      ],
    ),
  );

  const driverForwardedOrders = (forwardedOrdersResult.data ?? []).filter(
    (order) =>
      order.acceptedDriverId === driverId ||
      order.candidateDriverIds.includes(driverId),
  );
  const relayFailures = driverForwardedOrders.filter(
    (order) =>
      order.lastSyncError !== null || order.manualFallback.required === true,
  );
  const activeForwardedTasks = driverForwardedOrders.filter(
    (order) =>
      order.acceptedDriverId === driverId &&
      [
        "received",
        "broadcasted",
        "accept_pending",
        "confirmed_by_platform",
      ].includes(order.status),
  );
  const activeForwardedOrder = activeForwardedTasks[0] ?? null;

  const driverTasks = (tasksResult.data ?? []).filter(
    (task) => task.driverId === driverId,
  );
  const activeDriverTasks = driverTasks.filter((task) =>
    ACTIVE_TASK_STATUSES.has(task.status),
  );
  const latestActiveTask = pickLatestActiveTask(activeDriverTasks);

  const statements = (statementsResult.data ?? [])
    .filter((statement) => statement.driverId === driverId)
    .sort((left, right) => right.periodMonth.localeCompare(left.periodMonth));
  const statementPeriods = Array.from(
    new Set(statements.map((statement) => statement.periodMonth)),
  ).slice(0, 6);
  const filteredStatements = statements.filter(
    (statement) => statement.periodMonth === selectedPeriod,
  );

  const shifts = [...(shiftsResult.data ?? [])].sort((left, right) =>
    right.clockedInAt.localeCompare(left.clockedInAt),
  );

  const incidents = [...(incidentsResult.data ?? [])]
    .filter((incident) => incident.relatedDriverId === driverId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 6);

  const driverAuditLogs = [...(auditLogsResult.data ?? [])]
    .filter(
      (entry) =>
        entry.resourceId === driverId ||
        entry.newValuesSummary?.driverId === driverId ||
        entry.oldValuesSummary?.driverId === driverId,
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 6);

  const activeSosIncident =
    incidents.find(
      (incident) =>
        incident.severity === "critical" &&
        (incident.status === "open" || incident.status === "investigating"),
    ) ?? null;

  const hasReadModelGap =
    driver.workState === "incident_hold" &&
    !presenceSummary?.notes?.length &&
    driverAuditLogs.length === 0;

  const platformRows: TableRow[] = presences.map((presence) => {
    const adapter = adapterStatusByPlatform.get(presence.platformCode);
    const platformName =
      PLATFORM_CODE_REGISTRY[presence.platformCode]?.displayName ??
      presence.platformCode;
    return {
      platform: (
        <div style={{ display: "grid", gap: 4 }}>
          <strong>{platformName}</strong>
          <a
            href={`/platform-admin/adapter-registry?platform=${encodeURIComponent(
              presence.platformCode,
            )}`}
            target="_blank"
            rel="noreferrer"
            style={actionLinkStyle("ghost")}
          >
            <CanvasIcon name="ext" size={12} />
            {locale === "zh" ? "查看 adapter" : "Inspect adapter"}
          </a>
        </div>
      ),
      binding: presence.accountId ? (
        <div style={{ display: "grid", gap: 3 }}>
          <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
            {presence.accountId}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {locale === "zh" ? "更新於" : "Updated"}{" "}
            {formatShortDateTime(locale, presence.updatedAt)}
          </span>
        </div>
      ) : (
        <Pill theme={theme} tone="warn">
          {locale === "zh" ? "未綁定" : "Unbound"}
        </Pill>
      ),
      presence: (
        <div style={{ display: "grid", gap: 4 }}>
          <Pill theme={theme} tone={getPresenceTone(presence)} dot>
            {formatOpsCodeLabel(locale, presence.status)}
          </Pill>
          {presence.reauthRequired ? (
            <Pill theme={theme} tone="warn">
              {locale === "zh" ? "需重新驗證" : "Re-auth required"}
            </Pill>
          ) : null}
        </div>
      ),
      eligibility: (
        <Pill
          theme={theme}
          tone={
            presence.eligibility === "eligible"
              ? "success"
              : presence.eligibility === "pending"
                ? "warn"
                : "danger"
          }
          dot={presence.eligibility !== "eligible"}
        >
          {formatOpsCodeLabel(locale, presence.eligibility)}
        </Pill>
      ),
      token: presence.tokenExpiresAt ? (
        <div style={{ display: "grid", gap: 4 }}>
          <span>{formatDateTime(locale, presence.tokenExpiresAt)}</span>
          {tokenExpirySoon(presence) ? (
            <span style={{ color: theme.warn }}>
              {locale === "zh" ? "72 小時內到期" : "Expires within 72h"}
            </span>
          ) : null}
        </div>
      ) : (
        "—"
      ),
      adapter: (
        <div style={{ display: "grid", gap: 4 }}>
          <Pill theme={theme} tone={getAdapterTone(adapter)} dot>
            {formatOpsCodeLabel(locale, adapter?.status ?? "unknown")}
          </Pill>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {adapter?.blockingReason ??
              adapter?.lastSyncAt ??
              (locale === "zh" ? "未回報" : "Not reported")}
          </span>
        </div>
      ),
      actions: (
        <DriverAvailableActions
          driverId={driver.driverId}
          workState={driver.workState}
          platformCode={presence.platformCode}
          platformStatus={presence.status}
          statementPeriod={selectedPeriod}
          compact
          actions={buildPlatformActions(
            presence,
            activeForwardedTasks.some(
              (task) => task.platformCode === presence.platformCode,
            ),
          )}
        />
      ),
    };
  });

  const taskRows: TableRow[] = activeDriverTasks.map((task) => ({
    source: task.sourcePlatform ?? "drts",
    job: (
      <div style={{ display: "grid", gap: 3 }}>
        <Link
          href={`/dispatch/${encodeURIComponent(task.orderId)}`}
          style={{
            color: theme.accent,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {task.orderId}
        </Link>
        <span style={{ color: theme.textMuted, fontSize: 11 }}>
          {task.dispatchJobId}
        </span>
      </div>
    ),
    status: (
      <Pill
        theme={theme}
        tone={task.forwardedStatus ? "info" : "success"}
        dot={task.status !== "completed"}
      >
        {formatOpsCodeLabel(locale, task.status)}
      </Pill>
    ),
    vehicle: task.vehicleId,
    times: (
      <div style={{ display: "grid", gap: 2 }}>
        <span>{formatShortDateTime(locale, task.acceptedAt)}</span>
        <span style={{ color: theme.textMuted, fontSize: 11 }}>
          {task.startedAt
            ? locale === "zh"
              ? `上車 ${formatShortDateTime(locale, task.startedAt)}`
              : `Start ${formatShortDateTime(locale, task.startedAt)}`
            : locale === "zh"
              ? "尚未開始"
              : "Not started"}
        </span>
      </div>
    ),
    fare: task.fare ? formatMinorCurrency(task.fare.amountMinor) : "—",
  }));

  const relayRows: TableRow[] = relayFailures.slice(0, 6).map((order) => ({
    platform:
      PLATFORM_CODE_REGISTRY[order.platformCode]?.displayName ??
      order.platformCode,
    mirror: order.mirrorOrderId,
    error: order.lastSyncError ? (
      <div style={{ display: "grid", gap: 3 }}>
        <strong>{order.lastSyncError.code}</strong>
        <span style={{ color: theme.textMuted, fontSize: 11 }}>
          {order.lastSyncError.message}
        </span>
      </div>
    ) : (
      "—"
    ),
    fallback: order.manualFallback.required
      ? (order.manualFallback.reason ??
        (locale === "zh" ? "人工回補" : "Manual fallback"))
      : "—",
    failedAt: formatShortDateTime(
      locale,
      order.lastSyncError?.failedAt ??
        order.manualFallback.requestedAt ??
        order.updatedAt,
    ),
  }));

  const statementRows: TableRow[] = filteredStatements.map((statement) => ({
    receipt: (
      <div style={{ display: "grid", gap: 3 }}>
        <strong>{statement.receiptNo}</strong>
        <span style={{ color: theme.textMuted, fontSize: 11 }}>
          {statement.statementId}
        </span>
      </div>
    ),
    status: (
      <Pill
        theme={theme}
        tone={statement.payoutStatus === "paid" ? "success" : "warn"}
      >
        {formatOpsCodeLabel(locale, statement.payoutStatus)}
      </Pill>
    ),
    gross: formatMinorCurrency(statement.grossEarning.amountMinor),
    fee: formatMinorCurrency(statement.serviceFee.amountMinor),
    net: formatMinorCurrency(statement.netAmount.amountMinor),
    updatedAt: formatShortDateTime(locale, statement.updatedAt),
  }));

  const shiftRows: TableRow[] = shifts.slice(0, 6).map((shift) => ({
    shiftId: (
      <div style={{ display: "grid", gap: 3 }}>
        <strong>{shift.shiftId}</strong>
        <span style={{ color: theme.textMuted, fontSize: 11 }}>
          {shift.vehicleId ?? "—"}
        </span>
      </div>
    ),
    status: (
      <Pill
        theme={theme}
        tone={
          shift.status === "active"
            ? "success"
            : shift.status === "abandoned"
              ? "danger"
              : "info"
        }
      >
        {formatOpsCodeLabel(locale, shift.status)}
      </Pill>
    ),
    started: formatShortDateTime(locale, shift.clockedInAt),
    ended: formatShortDateTime(locale, shift.clockedOutAt),
    hours: formatHours(locale, shift.totalHours),
    notes: shift.notes ?? "—",
  }));

  const incidentRows: TableRow[] = incidents.map((incident) => ({
    incident: (
      <div style={{ display: "grid", gap: 3 }}>
        <Link
          href={`/incidents/${encodeURIComponent(incident.incidentId)}`}
          style={{
            color: theme.accent,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {incident.title}
        </Link>
        <span style={{ color: theme.textMuted, fontSize: 11 }}>
          {incident.incidentId}
        </span>
      </div>
    ),
    severity: (
      <Pill
        theme={theme}
        tone={
          incident.severity === "critical" || incident.severity === "high"
            ? "danger"
            : incident.severity === "medium"
              ? "warn"
              : "info"
        }
        dot={incident.severity !== "low"}
      >
        {formatOpsCodeLabel(locale, incident.severity)}
      </Pill>
    ),
    status: (
      <Pill
        theme={theme}
        tone={
          incident.status === "resolved" || incident.status === "closed"
            ? "success"
            : incident.status === "open" || incident.status === "investigating"
              ? "warn"
              : "info"
        }
      >
        {formatOpsCodeLabel(locale, incident.status)}
      </Pill>
    ),
    order: incident.relatedOrderId ? (
      <Link
        href={`/dispatch/${encodeURIComponent(incident.relatedOrderId)}`}
        style={{ color: theme.accent, textDecoration: "none" }}
      >
        {incident.relatedOrderId}
      </Link>
    ) : (
      "—"
    ),
    updatedAt: formatShortDateTime(locale, incident.updatedAt),
  }));

  const auditRows: TableRow[] = driverAuditLogs.map((entry) => ({
    when: formatShortDateTime(locale, entry.createdAt),
    action: (
      <div style={{ display: "grid", gap: 3 }}>
        <strong>{entry.actionName}</strong>
        <span style={{ color: theme.textMuted, fontSize: 11 }}>
          {entry.moduleName}
        </span>
      </div>
    ),
    actor: entry.actorId ?? "system",
    requestId: (
      <a
        href={`/platform-admin/audit?auditId=${encodeURIComponent(entry.auditId)}`}
        target="_blank"
        rel="noreferrer"
        style={actionLinkStyle("ghost")}
      >
        <CanvasIcon name="audit" size={12} />
        {entry.requestId}
      </a>
    ),
  }));

  const platformColumns: CanvasTableColumn<TableRow>[] = [
    { h: locale === "zh" ? "PLATFORM" : "PLATFORM", k: "platform", w: 180 },
    { h: locale === "zh" ? "BINDING" : "BINDING", k: "binding", w: 160 },
    { h: locale === "zh" ? "PRESENCE" : "PRESENCE", k: "presence", w: 160 },
    {
      h: locale === "zh" ? "ELIGIBILITY" : "ELIGIBILITY",
      k: "eligibility",
      w: 150,
    },
    { h: locale === "zh" ? "TOKEN" : "TOKEN", k: "token", w: 180 },
    { h: locale === "zh" ? "ADAPTER" : "ADAPTER", k: "adapter", w: 180 },
    { h: locale === "zh" ? "ACTIONS" : "ACTIONS", k: "actions", w: 220 },
  ];

  const taskColumns: CanvasTableColumn<TableRow>[] = [
    {
      h: locale === "zh" ? "SOURCE" : "SOURCE",
      k: "source",
      w: 92,
      mono: true,
    },
    { h: locale === "zh" ? "WORK ITEM" : "WORK ITEM", k: "job", w: 180 },
    { h: locale === "zh" ? "STATUS" : "STATUS", k: "status", w: 140 },
    {
      h: locale === "zh" ? "VEHICLE" : "VEHICLE",
      k: "vehicle",
      w: 100,
      mono: true,
    },
    { h: locale === "zh" ? "TIMELINE" : "TIMELINE", k: "times", w: 180 },
    {
      h: locale === "zh" ? "FARE" : "FARE",
      k: "fare",
      w: 100,
      mono: true,
      align: "right",
    },
  ];

  const relayColumns: CanvasTableColumn<TableRow>[] = [
    { h: locale === "zh" ? "PLATFORM" : "PLATFORM", k: "platform", w: 120 },
    {
      h: locale === "zh" ? "MIRROR" : "MIRROR",
      k: "mirror",
      w: 150,
      mono: true,
    },
    { h: locale === "zh" ? "SYNC" : "SYNC", k: "error", w: 220 },
    { h: locale === "zh" ? "FALLBACK" : "FALLBACK", k: "fallback", w: 160 },
    {
      h: locale === "zh" ? "FAILED AT" : "FAILED AT",
      k: "failedAt",
      w: 120,
      mono: true,
    },
  ];

  const statementColumns: CanvasTableColumn<TableRow>[] = [
    { h: locale === "zh" ? "RECEIPT" : "RECEIPT", k: "receipt", w: 180 },
    { h: locale === "zh" ? "STATUS" : "STATUS", k: "status", w: 120 },
    {
      h: locale === "zh" ? "GROSS" : "GROSS",
      k: "gross",
      w: 110,
      mono: true,
      align: "right",
    },
    {
      h: locale === "zh" ? "FEE" : "FEE",
      k: "fee",
      w: 110,
      mono: true,
      align: "right",
    },
    {
      h: locale === "zh" ? "NET" : "NET",
      k: "net",
      w: 110,
      mono: true,
      align: "right",
    },
    {
      h: locale === "zh" ? "UPDATED" : "UPDATED",
      k: "updatedAt",
      w: 120,
      mono: true,
    },
  ];

  const shiftColumns: CanvasTableColumn<TableRow>[] = [
    { h: locale === "zh" ? "SHIFT" : "SHIFT", k: "shiftId", w: 180 },
    { h: locale === "zh" ? "STATUS" : "STATUS", k: "status", w: 110 },
    {
      h: locale === "zh" ? "CLOCK IN" : "CLOCK IN",
      k: "started",
      w: 120,
      mono: true,
    },
    {
      h: locale === "zh" ? "CLOCK OUT" : "CLOCK OUT",
      k: "ended",
      w: 120,
      mono: true,
    },
    {
      h: locale === "zh" ? "HOURS" : "HOURS",
      k: "hours",
      w: 90,
      mono: true,
      align: "right",
    },
    { h: locale === "zh" ? "NOTES" : "NOTES", k: "notes", w: 220 },
  ];

  const incidentColumns: CanvasTableColumn<TableRow>[] = [
    { h: locale === "zh" ? "INCIDENT" : "INCIDENT", k: "incident", w: 230 },
    { h: locale === "zh" ? "SEVERITY" : "SEVERITY", k: "severity", w: 110 },
    { h: locale === "zh" ? "STATUS" : "STATUS", k: "status", w: 110 },
    { h: locale === "zh" ? "ORDER" : "ORDER", k: "order", w: 150, mono: true },
    {
      h: locale === "zh" ? "UPDATED" : "UPDATED",
      k: "updatedAt",
      w: 120,
      mono: true,
    },
  ];

  const auditColumns: CanvasTableColumn<TableRow>[] = [
    { h: locale === "zh" ? "WHEN" : "WHEN", k: "when", w: 110, mono: true },
    { h: locale === "zh" ? "ACTION" : "ACTION", k: "action", w: 240 },
    { h: locale === "zh" ? "ACTOR" : "ACTOR", k: "actor", w: 120, mono: true },
    { h: locale === "zh" ? "AUDIT" : "AUDIT", k: "requestId", w: 180 },
  ];

  const subtitle =
    locale === "zh"
      ? `${driver.name} · ${driver.driverId} · T3 / 15s`
      : `${driver.name} · ${driver.driverId} · T3 / 15s`;

  return (
    <>
      <PageHeader
        theme={theme}
        sticky={false}
        title={
          locale === "zh"
            ? "司機詳情 / 收益 / 平台綁定"
            : "Driver Detail / Earnings / Platform Binding"
        }
        subtitle={subtitle}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill theme={theme} tone="info">
              {locale === "zh" ? "Refresh tier T3" : "Refresh tier T3"}
            </Pill>
            <Pill theme={theme} tone={getWorkStateTone(driver.workState)} dot>
              {formatOpsCodeLabel(locale, driver.workState)}
            </Pill>
            <Link href="/drivers" style={actionLinkStyle()}>
              {locale === "zh" ? "返回司機列表" : "Back to drivers"}
            </Link>
          </div>
        }
      />

      <div style={layoutStyle}>
        {activeSosIncident ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={locale === "zh" ? "SOS active" : "SOS active"}
            body={
              locale === "zh"
                ? `司機目前關聯重大事故 ${activeSosIncident.incidentId}，請即時協調 dispatch 與 incident lane。`
                : `Driver is linked to critical incident ${activeSosIncident.incidentId}. Coordinate dispatch and incident response immediately.`
            }
            actions={
              <Link
                href={`/incidents/${encodeURIComponent(activeSosIncident.incidentId)}`}
                style={actionLinkStyle("primary")}
              >
                <CanvasIcon name="ext" size={12} />
                {locale === "zh" ? "打開事故詳情" : "Open incident"}
              </Link>
            }
          />
        ) : null}

        {driver.workState === "incident_hold" ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="warn"
            title={
              locale === "zh"
                ? "Matching suppression active"
                : "Matching suppression active"
            }
            body={
              hasReadModelGap
                ? locale === "zh"
                  ? "目前只有 workState 顯示為 incident_hold；suppression reason / TTL / linked incident 尚未由 read model 帶出。"
                  : "The current read model only exposes incident_hold via workState; suppression reason, TTL, and linked incident are not yet exposed."
                : locale === "zh"
                  ? "此司機目前處於媒合抑制狀態，請在解除前確認 incident / compliance 上下文。"
                  : "This driver is currently suppressed from matching. Confirm incident/compliance context before lifting."
            }
          />
        ) : null}

        {presenceResult.error ||
        locationsResult.error ||
        forwardedOrdersResult.error ? (
          <Card
            theme={theme}
            title={locale === "zh" ? "Degraded services" : "Degraded services"}
            subtitle={
              locale === "zh"
                ? "部分資料服務降級"
                : "Some backing services are degraded"
            }
          >
            <div style={{ display: "grid", gap: 8 }}>
              {presenceResult.error
                ? renderEmptyState("fetch_failed", locale, presenceResult.error)
                : null}
              {locationsResult.error
                ? renderEmptyState(
                    "fetch_failed",
                    locale,
                    locationsResult.error,
                  )
                : null}
              {forwardedOrdersResult.error
                ? renderEmptyState(
                    "fetch_failed",
                    locale,
                    forwardedOrdersResult.error,
                  )
                : null}
            </div>
          </Card>
        ) : null}

        <section style={heroGridStyle}>
          <Card
            theme={theme}
            title={locale === "zh" ? "Driver identity" : "Driver identity"}
            subtitle={
              locale === "zh"
                ? "Header + must-show context"
                : "Header + must-show context"
            }
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>
                    {driver.name}
                  </div>
                  <div
                    style={{
                      color: theme.textMuted,
                      fontFamily: theme.monoFamily,
                      fontSize: 12,
                    }}
                  >
                    {driver.driverId}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Pill
                    theme={theme}
                    tone={getWorkStateTone(driver.workState)}
                    dot
                  >
                    {formatOpsCodeLabel(locale, driver.workState)}
                  </Pill>
                  <Pill
                    theme={theme}
                    tone={driver.dispatchEligible ? "success" : "danger"}
                  >
                    {driver.dispatchEligible
                      ? locale === "zh"
                        ? "可派遣"
                        : "Dispatch eligible"
                      : locale === "zh"
                        ? "派遣阻塞"
                        : "Dispatch blocked"}
                  </Pill>
                  <Pill
                    theme={theme}
                    tone={driver.licensesValid ? "success" : "warn"}
                  >
                    {driver.licensesValid
                      ? locale === "zh"
                        ? "證照有效"
                        : "Licenses valid"
                      : locale === "zh"
                        ? "證照待審"
                        : "License review"}
                  </Pill>
                </div>
              </div>

              <DL
                theme={theme}
                cols={2}
                items={[
                  { k: locale === "zh" ? "姓名" : "Name", v: driver.name },
                  {
                    k: locale === "zh" ? "電話" : "Phone",
                    v:
                      locale === "zh"
                        ? "目前 contract 未提供"
                        : "Not exposed by the current contract",
                  },
                  {
                    k: locale === "zh" ? "主狀態" : "Status",
                    v: formatOpsCodeLabel(locale, driver.lifecycleStatus),
                  },
                  {
                    k: locale === "zh" ? "班次 / 工作" : "Shift / work",
                    v: formatOpsCodeLabel(locale, driver.workState),
                  },
                  {
                    k: locale === "zh" ? "阻塞原因" : "Blocked reasons",
                    v: summarizeBlockedReasons(
                      driver.eligibilityBlockedReasons,
                      locale,
                    ),
                  },
                  {
                    k: locale === "zh" ? "定位訊號" : "Location signal",
                    v: locationsResult.error
                      ? locale === "zh"
                        ? "定位服務降級"
                        : "Location service degraded"
                      : !locationSnapshot
                        ? locale === "zh"
                          ? "沒有樣本"
                          : "No sample"
                        : locationStale
                          ? locale === "zh"
                            ? "訊號過期"
                            : "Stale"
                          : locale === "zh"
                            ? "即時"
                            : "Live",
                  },
                ]}
              />
            </div>
          </Card>

          <Card
            theme={theme}
            title={locale === "zh" ? "Available actions" : "Available actions"}
            subtitle={
              locale === "zh"
                ? "由 availableActions 驅動"
                : "Driven by availableActions"
            }
          >
            <div style={{ display: "grid", gap: 12 }}>
              <DriverAvailableActions
                driverId={driver.driverId}
                workState={driver.workState}
                statementPeriod={selectedPeriod}
                actions={buildDriverActions(driver, selectedPeriod)}
              />
              <div
                style={{
                  display: "grid",
                  gap: 6,
                  color: theme.textMuted,
                  fontSize: 11.5,
                }}
              >
                <div>
                  {locale === "zh"
                    ? "高風險動作會要求理由；目前 API 尚未承載 reason / TTL，因此頁面會保留確認，但以現有 endpoint 寫回。"
                    : "High-risk actions require a reason. Current APIs do not yet persist reason / TTL, so the UI preserves confirmation while writing through the existing endpoint."}
                </div>
                <div>
                  {locale === "zh"
                    ? "Mutation audit 會透過新分頁 deep link 到 platform-admin。"
                    : "Mutation audit opens through a new-tab deep link into platform-admin."}
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          }}
        >
          <KPI
            theme={theme}
            label={locale === "zh" ? "平台綁定" : "Platforms bound"}
            value={String(presences.length)}
            sub={
              locale === "zh"
                ? `${presences.filter((presence: PlatformPresenceRecord) => presence.status === "online").length} online`
                : `${presences.filter((presence: PlatformPresenceRecord) => presence.status === "online").length} online`
            }
          />
          <KPI
            theme={theme}
            label={locale === "zh" ? "需重新驗證" : "Re-auth required"}
            value={String(
              presences.filter(
                (presence: PlatformPresenceRecord) => presence.reauthRequired,
              ).length,
            )}
            delta={
              presences.some((presence: PlatformPresenceRecord) =>
                tokenExpirySoon(presence),
              )
                ? locale === "zh"
                  ? "72h"
                  : "72h"
                : undefined
            }
            deltaTone="down"
            sub={
              locale === "zh" ? "Token / 帳號注意" : "Token / account attention"
            }
          />
          <KPI
            theme={theme}
            label={locale === "zh" ? "進行中任務" : "Active tasks"}
            value={String(activeDriverTasks.length)}
            sub={
              latestActiveTask
                ? locale === "zh"
                  ? `${latestActiveTask.orderId} · ${formatOpsCodeLabel(locale, latestActiveTask.status)}`
                  : `${latestActiveTask.orderId} · ${formatOpsCodeLabel(locale, latestActiveTask.status)}`
                : locale === "zh"
                  ? "目前無 active task"
                  : "No active task"
            }
          />
          <KPI
            theme={theme}
            label={locale === "zh" ? "Relay failures" : "Relay failures"}
            value={String(relayFailures.length)}
            sub={
              relayFailures[0]
                ? formatShortDateTime(
                    locale,
                    relayFailures[0].lastSyncError?.failedAt ??
                      relayFailures[0].updatedAt,
                  )
                : locale === "zh"
                  ? "沒有近期錯誤"
                  : "No recent failures"
            }
          />
          <KPI
            theme={theme}
            label={locale === "zh" ? "最近帳單" : "Latest statement"}
            value={statements[0] ? statements[0].periodMonth : "—"}
            sub={
              statements[0]
                ? formatMinorCurrency(statements[0].netAmount.amountMinor)
                : locale === "zh"
                  ? "尚未產生帳單"
                  : "No statement yet"
            }
          />
        </section>

        <section style={pairGridStyle}>
          <Card
            theme={theme}
            title={locale === "zh" ? "Platform binding" : "Platform binding"}
            subtitle={
              locale === "zh"
                ? "per platform status / adapter / actions"
                : "Per-platform status / adapter / actions"
            }
          >
            {presenceResult.error ? (
              renderEmptyState("fetch_failed", locale, presenceResult.error)
            ) : presences.length === 0 ? (
              renderEmptyState(
                adapterStatusByPlatform.size > 0
                  ? "external_unavailable"
                  : "no_data",
                locale,
              )
            ) : (
              <Table
                theme={theme}
                columns={platformColumns}
                rows={platformRows}
              />
            )}
          </Card>

          <Card
            theme={theme}
            title={
              locale === "zh" ? "Active work + relay" : "Active work + relay"
            }
            subtitle={
              locale === "zh"
                ? "owned / forwarded context"
                : "Owned / forwarded context"
            }
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gap: 10 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: theme.textMuted,
                  }}
                >
                  {locale === "zh" ? "ACTIVE TASK PANEL" : "ACTIVE TASK PANEL"}
                </div>
                {taskRows.length > 0 ? (
                  <Table theme={theme} columns={taskColumns} rows={taskRows} />
                ) : (
                  renderEmptyState("no_data", locale)
                )}
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: theme.textMuted,
                  }}
                >
                  {locale === "zh"
                    ? "RECENT FAILED RELAY ATTEMPTS"
                    : "RECENT FAILED RELAY ATTEMPTS"}
                </div>
                {relayRows.length > 0 ? (
                  <Table
                    theme={theme}
                    columns={relayColumns}
                    rows={relayRows}
                  />
                ) : (
                  renderEmptyState(
                    forwardedOrdersResult.error ? "fetch_failed" : "no_data",
                    locale,
                    forwardedOrdersResult.error ?? undefined,
                  )
                )}
              </div>

              {activeForwardedOrder ? (
                <div
                  style={{
                    borderTop: `1px solid ${theme.border}`,
                    paddingTop: 12,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: theme.textMuted,
                    }}
                  >
                    {locale === "zh"
                      ? "FORWARDED ACTIVE ORDER"
                      : "FORWARDED ACTIVE ORDER"}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <strong>
                      {PLATFORM_CODE_REGISTRY[activeForwardedOrder.platformCode]
                        ?.displayName ?? activeForwardedOrder.platformCode}
                    </strong>
                    <Pill theme={theme} tone="info" dot>
                      {formatOpsCodeLabel(locale, activeForwardedOrder.status)}
                    </Pill>
                    <span style={{ color: theme.textMuted }}>
                      {activeForwardedOrder.externalOrderId}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </section>

        <section style={tripleGridStyle}>
          <Card
            theme={theme}
            title={locale === "zh" ? "Operational notes" : "Operational notes"}
            subtitle={
              locale === "zh"
                ? "manual override / backend notes"
                : "Manual override / backend notes"
            }
          >
            <div style={{ display: "grid", gap: 10 }}>
              {presenceSummary?.notes?.length ? (
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  {presenceSummary.notes.map((note: string) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : (
                renderEmptyState("not_provisioned", locale)
              )}
            </div>
          </Card>

          <Card
            theme={theme}
            title={
              locale === "zh" ? "Shift / attendance" : "Shift / attendance"
            }
            subtitle={
              locale === "zh" ? "recent shift entries" : "Recent shift entries"
            }
          >
            {shiftsResult.error ? (
              renderEmptyState("fetch_failed", locale, shiftsResult.error)
            ) : shiftRows.length === 0 ? (
              renderEmptyState("no_data", locale)
            ) : (
              <Table theme={theme} columns={shiftColumns} rows={shiftRows} />
            )}
          </Card>

          <Card
            theme={theme}
            title={locale === "zh" ? "Recent incidents" : "Recent incidents"}
            subtitle={
              locale === "zh"
                ? "linked driver incidents"
                : "Linked driver incidents"
            }
          >
            {incidentsResult.error ? (
              renderEmptyState("fetch_failed", locale, incidentsResult.error)
            ) : incidentRows.length === 0 ? (
              renderEmptyState("no_data", locale)
            ) : (
              <Table
                theme={theme}
                columns={incidentColumns}
                rows={incidentRows}
              />
            )}
          </Card>
        </section>

        <section style={pairGridStyle}>
          <Card
            theme={theme}
            title={locale === "zh" ? "Earnings" : "Earnings"}
            subtitle={
              locale === "zh"
                ? "statement list + period filter"
                : "Statement list + period filter"
            }
            actions={
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {statementPeriods.map((period) => (
                  <Link
                    key={period}
                    href={`/drivers/${encodeURIComponent(driver.driverId)}?period=${encodeURIComponent(period)}`}
                    style={actionLinkStyle(
                      period === selectedPeriod ? "primary" : "secondary",
                    )}
                  >
                    {formatPeriodLabel(locale, period)}
                  </Link>
                ))}
              </div>
            }
          >
            {statementsResult.error ? (
              renderEmptyState("fetch_failed", locale, statementsResult.error)
            ) : statements.length === 0 ? (
              renderEmptyState("no_data", locale)
            ) : filteredStatements.length === 0 ? (
              renderEmptyState("filtered_empty", locale)
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <Table
                  theme={theme}
                  columns={statementColumns}
                  rows={statementRows}
                />
                <div style={{ color: theme.textMuted, fontSize: 11.5 }}>
                  {locale === "zh"
                    ? `目前檢視 ${selectedPeriod}；generate statement 會以同一帳期送出。`
                    : `Viewing ${selectedPeriod}; generate statement submits against the same period.`}
                </div>
              </div>
            )}
          </Card>

          <Card
            theme={theme}
            title={
              locale === "zh"
                ? "Audit / override trail"
                : "Audit / override trail"
            }
            subtitle={
              locale === "zh"
                ? "latest driver-related audit events"
                : "Latest driver-related audit events"
            }
          >
            {auditLogsResult.error ? (
              renderEmptyState(
                "permission_denied",
                locale,
                auditLogsResult.error,
              )
            ) : auditRows.length === 0 ? (
              renderEmptyState("not_provisioned", locale)
            ) : (
              <Table theme={theme} columns={auditColumns} rows={auditRows} />
            )}
          </Card>
        </section>
      </div>
    </>
  );
}

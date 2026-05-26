import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import type {
  AuditLogRecord,
  DriverEligibilityBlockReason,
  DriverLocationSnapshot,
  DriverMatchingSuppression,
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
import { RefreshOnInterval } from "@/components/refresh-on-interval";
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
    tab?: string;
  }>;
};

type LoadResult<T> = {
  data: T | null;
  error: string | null;
};

type TableRow = Record<string, unknown> & {
  _selected?: boolean;
};

type DriverDetailRuntimeRecord = DriverRegistryRecord & {
  availableActions?: ResourceActionDescriptor[];
  matchingSuppression?: DriverMatchingSuppression | null;
  phone?: string | null;
};

type PlatformPresenceRuntimeRecord = PlatformPresenceRecord & {
  availableActions?: ResourceActionDescriptor[];
  lastReauthAt?: string | null;
  bindingStatus?: string | null;
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
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  alignItems: "start",
};

const pairGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  alignItems: "start",
};

const tripleGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  alignItems: "start",
};

const pageSectionNavStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

type PageFreshness = "fresh" | "stale" | "degraded";

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

function getFreshnessTone(
  freshness: PageFreshness,
): "success" | "warn" | "danger" {
  switch (freshness) {
    case "fresh":
      return "success";
    case "stale":
      return "warn";
    default:
      return "danger";
  }
}

function getFreshnessCopy(
  freshness: PageFreshness,
  locale: Locale,
  generatedAt: string | null,
) {
  const at = formatShortDateTime(locale, generatedAt);
  const zh = locale === "zh";

  switch (freshness) {
    case "fresh":
      return {
        title: zh ? "資料目前為 fresh" : "Data is currently fresh",
        body: zh
          ? `Driver detail 採 T3 / 15s 更新。最後彙整於 ${at}。`
          : `Driver detail runs on the T3 / 15s tier. Snapshot assembled at ${at}.`,
      };
    case "stale":
      return {
        title: zh ? "資料可能已過期" : "Data may be stale",
        body: zh
          ? `至少一個關鍵訊號超過新鮮度門檻；最後彙整於 ${at}，請先重新整理再做決策。`
          : `At least one critical signal crossed the freshness threshold. Snapshot assembled at ${at}; refresh before acting.`,
      };
    default:
      return {
        title: zh ? "資料面降級" : "Data surface degraded",
        body: zh
          ? `至少一個 page-critical dependency 目前不可用；最後彙整於 ${at}。請改用 deep link 或稍後重試。`
          : `At least one page-critical dependency is unavailable. Snapshot assembled at ${at}. Use the deep links or retry later.`,
      };
  }
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
  actions?: ReactNode,
) {
  const copy = getEmptyStateCopy(reason, locale);
  const icon =
    reason === "no_data"
      ? "health"
      : reason === "not_provisioned"
        ? "clock"
        : reason === "permission_denied"
          ? "audit"
          : reason === "external_unavailable"
            ? "ext"
            : "warn";
  const reasonLabel =
    locale === "zh" ? `EmptyReason · ${reason}` : `EmptyReason · ${reason}`;
  return (
    <Banner
      theme={theme}
      tone={copy.tone}
      icon={icon}
      title={copy.title}
      body={
        <div style={{ display: "grid", gap: 8 }}>
          <div>{body ?? copy.body}</div>
          {actions ? <div>{actions}</div> : null}
          <div
            style={{
              fontFamily: theme.monoFamily,
              fontSize: 11,
              color: theme.textMuted,
            }}
          >
            {reasonLabel}
          </div>
        </div>
      }
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

function buildCrossAppHref(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseOrigin =
    process.env.DRTS_PLATFORM_ADMIN_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN?.trim() ||
    process.env.PROD_PLATFORM_ADMIN_ORIGIN?.trim() ||
    "";

  if (!baseOrigin) {
    return normalizedPath;
  }

  return `${baseOrigin.replace(/\/$/, "")}${normalizedPath}`;
}

function buildDriverDetailHref(
  driverId: string,
  options: {
    period?: string;
    tab?: string;
  },
) {
  const params = new URLSearchParams();
  if (options.period) {
    params.set("period", options.period);
  }
  if (options.tab) {
    params.set("tab", options.tab);
  }

  const query = params.toString();
  return `/drivers/${encodeURIComponent(driverId)}${query ? `?${query}` : ""}`;
}

function readQueryTab(tab: string | string[] | undefined) {
  return typeof tab === "string" ? tab : undefined;
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

function hasAvailableActionsField(resource: unknown) {
  return Boolean(
    resource &&
    typeof resource === "object" &&
    Object.prototype.hasOwnProperty.call(resource, "availableActions"),
  );
}

function readAvailableActions(resource: unknown): ResourceActionDescriptor[] {
  if (!hasAvailableActionsField(resource)) {
    return [];
  }

  const actions = (resource as { availableActions?: unknown }).availableActions;
  return Array.isArray(actions)
    ? actions.filter(
        (action): action is ResourceActionDescriptor =>
          Boolean(action) &&
          typeof action === "object" &&
          typeof (action as { action?: unknown }).action === "string" &&
          typeof (action as { enabled?: unknown }).enabled === "boolean" &&
          typeof (action as { riskLevel?: unknown }).riskLevel === "string",
      )
    : [];
}

function readMatchingSuppression(
  resource: unknown,
): DriverMatchingSuppression | null | undefined {
  if (
    !resource ||
    typeof resource !== "object" ||
    !Object.prototype.hasOwnProperty.call(resource, "matchingSuppression")
  ) {
    return undefined;
  }

  const suppression = (resource as { matchingSuppression?: unknown })
    .matchingSuppression;
  if (!suppression) {
    return null;
  }

  if (
    typeof suppression === "object" &&
    typeof (suppression as { active?: unknown }).active === "boolean" &&
    typeof (suppression as { reasonCode?: unknown }).reasonCode === "string" &&
    typeof (suppression as { expiresAt?: unknown }).expiresAt === "string"
  ) {
    return suppression as DriverMatchingSuppression;
  }

  return null;
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

  const driver = (
    (driversResult.data ?? []) as DriverDetailRuntimeRecord[]
  ).find((candidate) => candidate.driverId === driverId);
  if (!driver) {
    notFound();
  }

  const locationSnapshot = (locationsResult.data ?? []).find(
    (snapshot) => snapshot.driverId === driverId,
  );
  const locationStale = isLocationStale(locationSnapshot);

  const presenceSummary = presenceResult.data;
  const presences = (presenceSummary?.presences ??
    []) as PlatformPresenceRuntimeRecord[];
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
  const suppressionState = readMatchingSuppression(driver);
  const suppression = suppressionState?.active ? suppressionState : null;
  const suppressionStateExposed = suppressionState !== undefined;
  const inferredSosSuppressionExpiry =
    activeSosIncident && !suppression
      ? new Date(
          new Date(activeSosIncident.updatedAt).getTime() + 24 * 60 * 60 * 1000,
        ).toISOString()
      : null;

  const hasReadModelGap =
    driver.workState === "incident_hold" &&
    !presenceSummary?.notes?.length &&
    driverAuditLogs.length === 0;
  const derivedGeneratedAt =
    [
      driver.updatedAt,
      locationSnapshot?.recordedAt,
      presences[0]?.updatedAt,
      latestActiveTask?.acceptedAt,
      statements[0]?.updatedAt,
      incidents[0]?.updatedAt,
    ].find(Boolean) ?? null;
  const pageFreshness: PageFreshness =
    presenceResult.error || locationsResult.error || forwardedOrdersResult.error
      ? "degraded"
      : locationStale
        ? "stale"
        : "fresh";
  const freshnessCopy = getFreshnessCopy(
    pageFreshness,
    locale,
    derivedGeneratedAt,
  );
  const primaryVehicleId =
    latestActiveTask?.vehicleId ?? shifts[0]?.vehicleId ?? "—";
  const shiftSubtitle =
    shifts[0]?.shiftId ??
    (locale === "zh" ? "近期無 shift" : "No recent shift");
  const serviceBucketSummary = driver.supportedServiceBuckets.length
    ? driver.supportedServiceBuckets
        .map((bucket) => formatOpsCodeLabel(locale, bucket))
        .join(" · ")
    : "—";
  const deviceBindingSummary = driver.deviceBindings.length
    ? driver.deviceBindings
        .map((binding) =>
          binding.deviceLabel
            ? `${binding.deviceLabel} (${formatOpsCodeLabel(locale, binding.status)})`
            : `${binding.deviceId} (${formatOpsCodeLabel(locale, binding.status)})`,
        )
        .join(" · ")
    : locale === "zh"
      ? "沒有 active device binding"
      : "No active device binding";
  const phoneSummary = driver.phone
    ? driver.phone
    : locale === "zh"
      ? "電話未下發至 ops contract"
      : "Phone not exposed in ops contract";
  const headerSubtitle =
    locale === "zh"
      ? `${phoneSummary} · ${primaryVehicleId} · 班次 ${shiftSubtitle}`
      : `${phoneSummary} · ${primaryVehicleId} · shift ${shiftSubtitle}`;
  const headerTabs = [
    locale === "zh" ? "Overview" : "Overview",
    locale === "zh" ? "Platform bindings" : "Platform bindings",
    locale === "zh" ? "Active tasks" : "Active tasks",
    locale === "zh" ? "Earnings" : "Earnings",
    locale === "zh" ? "Shifts" : "Shifts",
    locale === "zh" ? "Incidents" : "Incidents",
  ];
  const queryTab = readQueryTab(query.tab);
  const refreshHref = buildDriverDetailHref(driver.driverId, {
    period: selectedPeriod,
    ...(queryTab ? { tab: queryTab } : {}),
  });
  const platformAdminAdapterHref = buildCrossAppHref(
    `/adapter-registry?platform=${encodeURIComponent(
      activeForwardedOrder?.platformCode ?? presences[0]?.platformCode ?? "",
    )}`,
  );
  const platformAdminAuditHref = buildCrossAppHref("/audit");

  const platformRows: TableRow[] = presences.map(
    (presence: PlatformPresenceRuntimeRecord) => {
      const adapter = adapterStatusByPlatform.get(presence.platformCode);
      const platformName =
        PLATFORM_CODE_REGISTRY[presence.platformCode]?.displayName ??
        presence.platformCode;
      return {
        platform: (
          <div style={{ display: "grid", gap: 4 }}>
            <strong>{platformName}</strong>
            <a
              href={buildCrossAppHref(
                `/adapter-registry?platform=${encodeURIComponent(
                  presence.platformCode,
                )}`,
              )}
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
              {locale === "zh"
                ? `最後重驗 ${formatShortDateTime(locale, (presence as PlatformPresenceRuntimeRecord).lastReauthAt ?? presence.updatedAt)}`
                : `Last re-auth ${formatShortDateTime(locale, (presence as PlatformPresenceRuntimeRecord).lastReauthAt ?? presence.updatedAt)}`}
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
              {formatOpsCodeLabel(
                locale,
                (presence as PlatformPresenceRuntimeRecord).bindingStatus ??
                  (presence.reauthRequired
                    ? "reauth_required"
                    : presence.status),
              )}
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
        actions: hasAvailableActionsField(presence) ? (
          <DriverAvailableActions
            driverId={driver.driverId}
            workState={driver.workState}
            platformCode={presence.platformCode}
            platformStatus={presence.status}
            statementPeriod={selectedPeriod}
            compact
            actions={readAvailableActions(presence)}
          />
        ) : (
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {locale === "zh" ? "read-only" : "Read-only"}
          </span>
        ),
      };
    },
  );

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
        href={buildCrossAppHref(
          `/audit?auditId=${encodeURIComponent(entry.auditId)}`,
        )}
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
  const driverActionDescriptors = readAvailableActions(driver);

  return (
    <>
      <RefreshOnInterval intervalMs={15_000} />

      <PageHeader
        theme={theme}
        sticky={false}
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            {driver.name}
            <span
              style={{
                fontFamily: theme.monoFamily,
                fontSize: 12,
                color: theme.textMuted,
                fontWeight: 500,
              }}
            >
              {driver.driverId}
            </span>
          </span>
        }
        subtitle={headerSubtitle}
        tabs={headerTabs}
        activeTab={headerTabs[0]}
        actions={
          <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill
                theme={theme}
                tone={getFreshnessTone(pageFreshness)}
                dot={pageFreshness !== "fresh"}
              >
                {pageFreshness}
              </Pill>
              <Pill
                theme={theme}
                tone={activeSosIncident ? "danger" : "info"}
                dot={Boolean(activeSosIncident)}
              >
                {activeSosIncident
                  ? locale === "zh"
                    ? "SOS active"
                    : "SOS active"
                  : locale === "zh"
                    ? "T3 / 15s"
                    : "T3 / 15s"}
              </Pill>
            </div>
            <DriverAvailableActions
              driverId={driver.driverId}
              workState={driver.workState}
              statementPeriod={selectedPeriod}
              actions={driverActionDescriptors}
              compact
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href={refreshHref} style={actionLinkStyle()}>
                <CanvasIcon name="clock" size={12} />
                {locale === "zh" ? "重新整理" : "Refresh"}
              </Link>
              <Link href="/drivers" style={actionLinkStyle("ghost")}>
                {locale === "zh" ? "返回列表" : "Back to drivers"}
              </Link>
            </div>
          </div>
        }
      />

      <div style={layoutStyle}>
        <nav style={pageSectionNavStyle} aria-label="driver detail sections">
          <a href="#overview" style={actionLinkStyle()}>
            Overview
          </a>
          <a href="#platform-binding" style={actionLinkStyle()}>
            Platform bindings
          </a>
          <a href="#activity" style={actionLinkStyle()}>
            Active tasks
          </a>
          <a href="#earnings" style={actionLinkStyle()}>
            Earnings
          </a>
        </nav>

        <Banner
          theme={theme}
          tone={getFreshnessTone(pageFreshness)}
          icon={pageFreshness === "degraded" ? "warn" : "health"}
          title={freshnessCopy.title}
          body={freshnessCopy.body}
          actions={
            <Link href={refreshHref} style={actionLinkStyle("primary")}>
              <CanvasIcon name="clock" size={12} />
              {locale === "zh" ? "立即刷新" : "Refresh now"}
            </Link>
          }
        />

        {activeSosIncident ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={
              locale === "zh"
                ? "此司機目前處於 SOS in_response · matching suppression active"
                : "This driver is currently in SOS in_response · matching suppression active"
            }
            body={
              locale === "zh"
                ? suppression?.expiresAt || inferredSosSuppressionExpiry
                  ? `${activeSosIncident.incidentId} · 24h TTL（至 ${formatDateTime(locale, suppression?.expiresAt ?? inferredSosSuppressionExpiry)}）· ops_manager 可延長。此頁所有 dispatch 影響動作已停用。`
                  : `${activeSosIncident.incidentId} · suppression 已啟用，但目前 contract 尚未回傳 TTL；請改從 incident / audit deep link 驗證。此頁所有 dispatch 影響動作已停用。`
                : suppression?.expiresAt || inferredSosSuppressionExpiry
                  ? `${activeSosIncident.incidentId} · 24h TTL (until ${formatDateTime(locale, suppression?.expiresAt ?? inferredSosSuppressionExpiry)}) · ops_manager may extend it. Dispatch-impacting actions on this page are paused.`
                  : `${activeSosIncident.incidentId} · suppression is active, but the current contract does not expose TTL yet. Verify through the incident or audit deep links. Dispatch-impacting actions on this page are paused.`
            }
            actions={
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link
                  href={`/incidents/${encodeURIComponent(activeSosIncident.incidentId)}`}
                  style={actionLinkStyle("primary")}
                >
                  <CanvasIcon name="ext" size={12} />
                  {locale === "zh" ? "前往事故詳情" : "Open incident"}
                </Link>
                <a
                  href={platformAdminAuditHref}
                  target="_blank"
                  rel="noreferrer"
                  style={actionLinkStyle()}
                >
                  <CanvasIcon name="audit" size={12} />
                  {locale === "zh" ? "在新分頁看 audit" : "Open audit in admin"}
                </a>
              </div>
            }
          />
        ) : driver.workState === "incident_hold" && !suppressionStateExposed ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="warn"
            title={
              locale === "zh"
                ? "suppression read model 尚未佈建"
                : "Suppression read model not provisioned"
            }
            body={
              locale === "zh"
                ? "目前 contract 尚未提供 DriverMatchingSuppression；請改從 incident / audit deep link 驗證實際 reason、TTL 與 source incident。"
                : "The current contract does not expose DriverMatchingSuppression. Verify the active reason, TTL, and source incident through the incident or audit deep links."
            }
          />
        ) : null}

        {suppression && !activeSosIncident ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="warn"
            title={
              locale === "zh"
                ? "matching suppression active"
                : "Matching suppression active"
            }
            body={
              <DL
                theme={theme}
                cols={3}
                items={[
                  {
                    k: locale === "zh" ? "Reason" : "Reason",
                    v: hasReadModelGap
                      ? locale === "zh"
                        ? "contract 未提供"
                        : "Not exposed by the current contract"
                      : locale === "zh"
                        ? "事故 / 合規檢查中"
                        : "Incident / compliance hold",
                  },
                  {
                    k: locale === "zh" ? "TTL" : "TTL",
                    v: hasReadModelGap
                      ? locale === "zh"
                        ? "未提供 expiresAt；需回 source incident 確認"
                        : "expiresAt not exposed; verify in the source incident"
                      : formatDateTime(locale, suppression.expiresAt),
                  },
                  {
                    k: locale === "zh" ? "Linked incident" : "Linked incident",
                    v: suppression.sourceIncidentId ? (
                      <Link
                        href={`/incidents/${encodeURIComponent(suppression.sourceIncidentId)}`}
                        style={{ color: theme.accent, textDecoration: "none" }}
                      >
                        {suppression.sourceIncidentId}
                      </Link>
                    ) : hasReadModelGap ? (
                      locale === "zh" ? (
                        "read model 未提供"
                      ) : (
                        "Read model not provisioned"
                      )
                    ) : (
                      "—"
                    ),
                  },
                ]}
              />
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

        <section id="overview" style={heroGridStyle}>
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
                    v: phoneSummary,
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
                    k: locale === "zh" ? "服務桶" : "Service buckets",
                    v: serviceBucketSummary,
                  },
                  {
                    k: locale === "zh" ? "裝置綁定" : "Device bindings",
                    v: deviceBindingSummary,
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
            {hasAvailableActionsField(driver) ? (
              <div style={{ display: "grid", gap: 12 }}>
                <DriverAvailableActions
                  driverId={driver.driverId}
                  workState={driver.workState}
                  statementPeriod={selectedPeriod}
                  actions={driverActionDescriptors}
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
                      ? "所有 CTA 與 disabled reason 直接讀取 backend `availableActions`。"
                      : "Every CTA and disabled reason is read directly from backend `availableActions`."}
                  </div>
                  <a
                    href={platformAdminAuditHref}
                    target="_blank"
                    rel="noreferrer"
                    style={actionLinkStyle("ghost")}
                  >
                    <CanvasIcon name="ext" size={12} />
                    {locale === "zh"
                      ? "前往 Platform Admin /audit"
                      : "Open Platform Admin /audit"}
                  </a>
                </div>
              </div>
            ) : (
              renderEmptyState("not_provisioned", locale)
            )}
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
                ? `${presences.filter((presence: PlatformPresenceRuntimeRecord) => presence.status === "online").length} online`
                : `${presences.filter((presence: PlatformPresenceRuntimeRecord) => presence.status === "online").length} online`
            }
          />
          <KPI
            theme={theme}
            label={locale === "zh" ? "需重新驗證" : "Re-auth required"}
            value={String(
              presences.filter(
                (presence: PlatformPresenceRuntimeRecord) =>
                  presence.reauthRequired,
              ).length,
            )}
            delta={
              presences.some((presence: PlatformPresenceRuntimeRecord) =>
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

        <section id="platform-binding" style={pairGridStyle}>
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
              renderEmptyState(
                "fetch_failed",
                locale,
                presenceResult.error,
                <Link href={refreshHref} style={actionLinkStyle("primary")}>
                  <CanvasIcon name="clock" size={12} />
                  {locale === "zh"
                    ? "重新整理平台資料"
                    : "Refresh platform data"}
                </Link>,
              )
            ) : presences.length === 0 ? (
              renderEmptyState(
                adapterStatusByPlatform.size > 0
                  ? "external_unavailable"
                  : "no_data",
                locale,
                undefined,
                adapterStatusByPlatform.size > 0 ? (
                  <a
                    href={platformAdminAdapterHref}
                    target="_blank"
                    rel="noreferrer"
                    style={actionLinkStyle("primary")}
                  >
                    <CanvasIcon name="ext" size={12} />
                    {locale === "zh"
                      ? "在新分頁檢查 adapter"
                      : "Inspect adapter in admin"}
                  </a>
                ) : undefined,
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
                    forwardedOrdersResult.error ? (
                      <Link
                        href={refreshHref}
                        style={actionLinkStyle("primary")}
                      >
                        <CanvasIcon name="clock" size={12} />
                        {locale === "zh"
                          ? "重新整理 relay 狀態"
                          : "Refresh relay status"}
                      </Link>
                    ) : undefined,
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
                    <a
                      href={platformAdminAdapterHref}
                      target="_blank"
                      rel="noreferrer"
                      style={actionLinkStyle("ghost")}
                    >
                      <CanvasIcon name="ext" size={12} />
                      {locale === "zh" ? "檢查 adapter" : "Inspect adapter"}
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </section>

        <section id="activity" style={tripleGridStyle}>
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

        <section id="earnings" style={pairGridStyle}>
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
              renderEmptyState(
                "fetch_failed",
                locale,
                statementsResult.error,
                <Link href={refreshHref} style={actionLinkStyle("primary")}>
                  <CanvasIcon name="clock" size={12} />
                  {locale === "zh"
                    ? "重新整理帳單資料"
                    : "Refresh earnings data"}
                </Link>,
              )
            ) : statements.length === 0 ? (
              renderEmptyState("no_data", locale)
            ) : filteredStatements.length === 0 ? (
              renderEmptyState(
                "filtered_empty",
                locale,
                undefined,
                statements[0] ? (
                  <Link
                    href={buildDriverDetailHref(driver.driverId, {
                      period: statements[0].periodMonth,
                      ...(queryTab ? { tab: queryTab } : {}),
                    })}
                    style={actionLinkStyle("primary")}
                  >
                    <CanvasIcon name="clock" size={12} />
                    {locale === "zh"
                      ? `切回 ${formatPeriodLabel(locale, statements[0].periodMonth)}`
                      : `Switch to ${formatPeriodLabel(locale, statements[0].periodMonth)}`}
                  </Link>
                ) : undefined,
              )
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

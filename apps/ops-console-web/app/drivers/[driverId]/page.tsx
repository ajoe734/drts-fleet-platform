import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import type {
  AttendanceRecord,
  CrossAppResourceLink,
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
  RefreshTier,
  ResourceActionDescriptor,
  ShiftRecord,
  UiRefreshMetadata,
} from "@drts/contracts";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatMinorCurrency } from "@/lib/ops-analytics";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import {
  CanvasActivityFeed,
  CanvasEmptyPanel,
  type CanvasActivityItem,
} from "@/lib/canvas-workflow";

type DriverDetailPageProps = {
  params: Promise<{
    driverId: string;
  }>;
};

type LoadResult<T> = {
  data: T;
  error: string | null;
};

// availableActions / refresh are runtime envelope augmentations that the
// backend may attach to a record; the canonical registry type does not yet
// carry them, so we read them defensively and fall back to domain-derived
// descriptors (packet §3.5 / §3.2 — same convention as the vehicle detail).
type RuntimeActionRecord<T> = T & {
  availableActions?: ResourceActionDescriptor[];
  refresh?: UiRefreshMetadata | null;
};

// `matchingSuppression` is a committed IncidentRecord field (driver-spec §6.3)
// that the published @drts/contracts dist may not yet expose; read it through
// this augmentation so the page compiles against either build of the dist.
type SuppressionAwareIncident = IncidentRecord & {
  matchingSuppression?: DriverMatchingSuppression | null;
};

function readSuppression(
  incident: IncidentRecord,
): DriverMatchingSuppression | null {
  return (incident as SuppressionAwareIncident).matchingSuppression ?? null;
}

type DriverActionIcon =
  | "arrow"
  | "ext"
  | "warn"
  | "check"
  | "x"
  | "filter"
  | "car"
  | "phone"
  | "clock"
  | "users";

type DriverAction = {
  descriptor: ResourceActionDescriptor;
  label: string;
  icon?: DriverActionIcon;
  href?: string;
  openInNewTab?: boolean;
  variant?: "primary" | "secondary" | "ghost";
};

type PresenceRow = Record<string, unknown> & {
  presence: PlatformPresenceRecord;
  adapter: PlatformPresenceAdapterStatusRecord | undefined;
};

type TaskRow = Record<string, unknown> & {
  taskId: string;
  domain: "owned" | "forwarded";
  status: string;
  statusTone: CanvasTone;
  reference: string;
  detail: string;
  href: string | undefined;
};

type RelayRow = Record<string, unknown> & {
  order: ForwardedOrderRecord;
};

type StatementRow = Record<string, unknown> & {
  statement: DriverStatementRecord;
};

type ShiftRow = Record<string, unknown> & {
  shift: ShiftRecord;
  attendance: AttendanceRecord | undefined;
};

type IncidentRow = Record<string, unknown> & {
  incident: IncidentRecord;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const REFRESH_TIER: RefreshTier = "medium";
const REFRESH_STALE_AFTER_MS = 15_000;
const STALE_LOCATION_THRESHOLD_MS = 5 * 60 * 1000;
const REAUTH_THRESHOLD_MS = 72 * 60 * 60 * 1000;

const ACTIVE_DRIVER_TASK_STATUSES = new Set<DriverTaskRecord["status"]>([
  "pending_acceptance",
  "accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
]);

const ACTIVE_FORWARDED_STATUSES = new Set<ForwardedOrderRecord["status"]>([
  "received",
  "broadcasted",
  "accept_pending",
  "confirmed_by_platform",
]);

const pageBodyStyle: CSSProperties = {
  padding: "24px",
  display: "grid",
  gap: "16px",
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
  gap: "16px",
};

const columnStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
  alignContent: "start",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
};

const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function normalizeOrigin(value: string | null | undefined) {
  return value ? value.replace(/\/+$/, "") : null;
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
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
    .format(parsed)
    .replace(",", "");
}

function formatList(locale: Locale, values: readonly string[]) {
  if (values.length === 0) {
    return "—";
  }
  return values
    .map((value) => formatOpsCodeLabel(locale, value))
    .join(locale === "zh" ? "、" : ", ");
}

async function loadWithError<T>(
  loader: () => Promise<T>,
  fallback: T,
  locale: Locale,
): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return {
      data: fallback,
      error:
        error instanceof Error
          ? error.message
          : copy(locale, "Unknown error", "未知錯誤"),
    };
  }
}

// ── Empty-state classification (Q-X15, all 6 ops EmptyReason states) ──

function classifyErrorReason(error: string): EmptyReason {
  const lower = error.toLowerCase();
  if (
    lower.includes("permission") ||
    lower.includes("forbidden") ||
    lower.includes("403") ||
    lower.includes("401")
  ) {
    return "permission_denied";
  }
  if (
    lower.includes("external") ||
    lower.includes("unavailable") ||
    lower.includes("timeout") ||
    lower.includes("gateway") ||
    lower.includes("adapter")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function emptyTone(reason: EmptyReason): CanvasTone {
  if (reason === "fetch_failed") return "danger";
  if (
    reason === "permission_denied" ||
    reason === "external_unavailable" ||
    reason === "not_provisioned"
  ) {
    return "warn";
  }
  return "neutral";
}

function emptyIcon(reason: EmptyReason): DriverActionIcon {
  if (reason === "no_data") return "check";
  if (reason === "not_provisioned") return "warn";
  if (reason === "fetch_failed") return "x";
  if (reason === "permission_denied") return "warn";
  if (reason === "external_unavailable") return "warn";
  return "filter";
}

function emptyTitle(locale: Locale, reason: EmptyReason) {
  switch (reason) {
    case "no_data":
      return copy(locale, "No records yet", "目前沒有資料");
    case "not_provisioned":
      return copy(locale, "Not provisioned", "尚未 provision");
    case "fetch_failed":
      return copy(locale, "Snapshot unavailable", "快照暫不可用");
    case "permission_denied":
      return copy(locale, "Permission required", "權限不足");
    case "external_unavailable":
      return copy(
        locale,
        "External dependency unavailable",
        "外部相依暫不可用",
      );
    case "filtered_empty":
      return copy(locale, "No matches after filtering", "套用篩選後沒有結果");
    default:
      return copy(locale, "No records yet", "目前沒有資料");
  }
}

function defaultEmptyDescription(locale: Locale, reason: EmptyReason) {
  switch (reason) {
    case "no_data":
      return copy(
        locale,
        "This section is healthy, but there is nothing to show for this driver.",
        "這個區塊健康可用，但目前這位司機沒有對應資料。",
      );
    case "not_provisioned":
      return copy(
        locale,
        "The required upstream record has not been provisioned for this driver yet.",
        "這位司機所需的上游資料尚未 provision。",
      );
    case "fetch_failed":
      return copy(
        locale,
        "The service responded with an error before a usable snapshot could be rendered.",
        "服務在回傳可用快照前發生錯誤。",
      );
    case "permission_denied":
      return copy(
        locale,
        "Your authority can open this page, but this subsection needs a higher-scope read grant.",
        "你可以進入此頁，但此子區塊需要更高權限才能讀取。",
      );
    case "external_unavailable":
      return copy(
        locale,
        "This section depends on an external or degraded upstream system that is temporarily unavailable.",
        "此區塊依賴的外部或降級上游系統目前暫不可用。",
      );
    case "filtered_empty":
      return copy(
        locale,
        "The upstream dataset exists, but the current filter left no matching rows.",
        "上游資料存在，但目前篩選條件沒有留下任何符合的列。",
      );
    default:
      return copy(
        locale,
        "No records are currently available.",
        "目前沒有可顯示的資料。",
      );
  }
}

function renderEmptyState(
  locale: Locale,
  reason: EmptyReason,
  messageOverride?: string,
  action?: DriverAction,
) {
  return (
    <CanvasEmptyPanel
      theme={theme}
      title={
        <span
          style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}
        >
          <span>{emptyTitle(locale, reason)}</span>
          <span
            style={{ ...monoStyle, fontSize: "11px", color: theme.textDim }}
          >
            {reason}
          </span>
        </span>
      }
      description={messageOverride ?? defaultEmptyDescription(locale, reason)}
      tone={emptyTone(reason)}
      density="compact"
      icon={<CanvasIcon name={emptyIcon(reason)} size={22} />}
      actions={action ? <div>{renderDriverAction(action)}</div> : undefined}
    />
  );
}

// ── availableActions CTA rendering (Q-X13 / Q-X09) ──

// exactOptionalPropertyTypes is on: only attach disabledReasonCode /
// requiresReason when they are actually present (never an explicit undefined).
function makeDescriptor(
  action: string,
  enabled: boolean,
  riskLevel: ResourceActionDescriptor["riskLevel"],
  disabledReasonCode?: string,
  requiresReason?: boolean,
): ResourceActionDescriptor {
  return {
    action,
    enabled,
    riskLevel,
    ...(disabledReasonCode ? { disabledReasonCode } : {}),
    ...(requiresReason ? { requiresReason: true } : {}),
  };
}

function actionStyle(
  descriptor: ResourceActionDescriptor,
  variant: "primary" | "secondary" | "ghost",
  disabled: boolean,
): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 10px",
    height: "28px",
    borderRadius: "7px",
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    fontFamily: theme.fontFamily,
  };

  if (descriptor.riskLevel === "high") {
    return {
      ...base,
      border: `1px solid ${theme.danger}`,
      background: theme.danger,
      color: "#fff",
    };
  }
  if (variant === "primary") {
    return {
      ...base,
      border: `1px solid ${theme.accent}`,
      background: theme.accent,
      color: "#fff",
    };
  }
  if (variant === "ghost") {
    return {
      ...base,
      border: "1px solid transparent",
      background: "transparent",
      color: theme.textMuted,
    };
  }
  return {
    ...base,
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    color: theme.text,
  };
}

function actionTitle(locale: Locale, action: DriverAction) {
  const { descriptor } = action;
  if (!descriptor.enabled) {
    return descriptor.disabledReasonCode
      ? formatOpsCodeLabel(locale, descriptor.disabledReasonCode)
      : descriptor.action;
  }
  if (descriptor.requiresReason) {
    return copy(
      locale,
      `${action.label} · requires reason (${descriptor.riskLevel})`,
      `${action.label} · 需填寫理由（${descriptor.riskLevel}）`,
    );
  }
  return action.label;
}

function renderDriverAction(action: DriverAction, locale: Locale = "en") {
  const disabled = !action.descriptor.enabled;
  const style = actionStyle(
    action.descriptor,
    action.variant ?? "secondary",
    disabled,
  );
  const title = actionTitle(locale, action);
  const content = (
    <>
      {action.icon ? <CanvasIcon name={action.icon} size={13} /> : null}
      <span>{action.label}</span>
      {action.descriptor.requiresReason && !disabled ? (
        <span aria-hidden style={{ fontSize: "11px", opacity: 0.85 }}>
          ✎
        </span>
      ) : null}
    </>
  );

  if (!disabled && action.href) {
    if (action.openInNewTab) {
      return (
        <a
          key={action.descriptor.action}
          href={action.href}
          target="_blank"
          rel="noreferrer"
          title={title}
          style={style}
        >
          {content}
        </a>
      );
    }
    return (
      <Link
        key={action.descriptor.action}
        href={action.href}
        prefetch={false}
        title={title}
        style={style}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      key={action.descriptor.action}
      type="button"
      disabled={disabled}
      title={title}
      style={style}
    >
      {content}
    </button>
  );
}

// ── Cross-app deep links (Q-X03) ──

function resolvePlatformAdminOrigin(requestHeaders: Headers) {
  const explicit = normalizeOrigin(
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN ??
      process.env.PLATFORM_ADMIN_ORIGIN ??
      process.env.DEV_PLATFORM_ADMIN_ORIGIN ??
      process.env.STAGING_PLATFORM_ADMIN_ORIGIN ??
      process.env.PROD_PLATFORM_ADMIN_ORIGIN,
  );
  if (explicit) {
    return explicit;
  }

  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) {
    return null;
  }

  const proto =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");

  try {
    const origin = new URL(`${proto}://${host}`);
    if (origin.hostname === "localhost" && origin.port === "3003") {
      origin.port = "3002";
      return origin.origin;
    }
    if (origin.hostname.startsWith("ops.")) {
      origin.hostname = origin.hostname.slice(4);
      return origin.origin;
    }
  } catch {
    return null;
  }

  return null;
}

function buildCrossAppHref(origin: string, link: CrossAppResourceLink) {
  const route = link.route.startsWith("/") ? link.route : `/${link.route}`;
  return `${origin}${route}`;
}

// ── Refresh metadata (Q-X02 — T3 medium tier) ──

function buildFallbackRefreshMetadata(hasErrors: boolean): UiRefreshMetadata {
  return {
    generatedAt: "",
    staleAfterMs: REFRESH_STALE_AFTER_MS,
    dataFreshness: hasErrors ? "degraded" : "unknown",
    source: "static",
  };
}

function pickRefreshMetadata(
  ...candidates: Array<UiRefreshMetadata | null | undefined>
): UiRefreshMetadata | null {
  return candidates.find((candidate) => candidate != null) ?? null;
}

function buildRefreshBannerBody(
  locale: Locale,
  metadata: UiRefreshMetadata,
  degradedSections: string[],
) {
  const freshnessLabel = formatOpsCodeLabel(locale, metadata.dataFreshness);
  const sectionSummary =
    degradedSections.length > 0
      ? copy(
          locale,
          `Degraded sections: ${degradedSections.join(", ")}`,
          `降級區塊：${degradedSections.join("、")}`,
        )
      : copy(
          locale,
          "All driver detail surfaces loaded.",
          "司機詳情區塊已完整載入。",
        );
  const snapshotSummary = metadata.generatedAt
    ? copy(
        locale,
        `Generated ${formatDateTime(locale, metadata.generatedAt)}`,
        `生成時間 ${formatDateTime(locale, metadata.generatedAt)}`,
      )
    : copy(
        locale,
        "Backend refresh metadata unavailable; showing the latest server-rendered snapshot.",
        "後端尚未提供 refresh metadata；目前顯示最新一次 server-rendered 快照。",
      );

  return [
    copy(
      locale,
      `T3 cadence · ${metadata.source} snapshot · ${freshnessLabel}`,
      `T3 節奏 · ${metadata.source} 快照 · ${freshnessLabel}`,
    ),
    snapshotSummary,
    sectionSummary,
  ].join(" · ");
}

// ── Tone helpers ──

function presenceTone(presence: PlatformPresenceRecord): CanvasTone {
  if (presence.eligibility !== "eligible") return "danger";
  if (presence.reauthRequired) return "warn";
  if (presence.status === "online") return "success";
  return "neutral";
}

function eligibilityTone(presence: PlatformPresenceRecord): CanvasTone {
  if (presence.eligibility === "eligible") return "success";
  if (presence.eligibility === "pending") return "warn";
  return "danger";
}

function adapterTone(
  adapter: PlatformPresenceAdapterStatusRecord | undefined,
): CanvasTone {
  if (!adapter || adapter.status === "unknown") return "neutral";
  if (adapter.status === "healthy") return "success";
  if (adapter.status === "degraded") return "warn";
  return "danger";
}

function workStateTone(
  workState: DriverRegistryRecord["workState"],
): CanvasTone {
  switch (workState) {
    case "available":
      return "success";
    case "enroute":
    case "arrived":
    case "on_trip":
    case "reserved":
      return "accent";
    case "paused":
      return "warn";
    case "incident_hold":
    case "suspended":
      return "danger";
    default:
      return "neutral";
  }
}

function taskStatusTone(status: DriverTaskRecord["status"]): CanvasTone {
  switch (status) {
    case "pending_acceptance":
    case "proof_pending":
      return "warn";
    case "enroute_pickup":
    case "arrived_pickup":
    case "on_trip":
    case "accepted":
      return "accent";
    case "completed":
      return "success";
    case "rejected":
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

function forwardedStatusTone(
  status: ForwardedOrderRecord["status"],
): CanvasTone {
  if (ACTIVE_FORWARDED_STATUSES.has(status)) return "accent";
  return "neutral";
}

function shiftTone(status: ShiftRecord["status"]): CanvasTone {
  if (status === "active") return "success";
  if (status === "abandoned") return "danger";
  return "neutral";
}

function attendanceTone(status: AttendanceRecord["status"]): CanvasTone {
  if (status === "present") return "success";
  if (status === "partial") return "warn";
  return "danger";
}

function incidentSeverityTone(
  severity: IncidentRecord["severity"],
): CanvasTone {
  if (severity === "critical" || severity === "high") return "danger";
  if (severity === "medium") return "warn";
  return "neutral";
}

function platformDisplayName(
  platformCode: PlatformPresenceRecord["platformCode"],
) {
  return PLATFORM_CODE_REGISTRY[platformCode]?.displayName ?? platformCode;
}

function isLocationStale(
  snapshot: DriverLocationSnapshot | undefined,
): boolean {
  if (!snapshot) return true;
  const recorded = new Date(snapshot.recordedAt).getTime();
  if (!Number.isFinite(recorded)) return true;
  return Date.now() - recorded > STALE_LOCATION_THRESHOLD_MS;
}

function tokenExpirySoon(presence: PlatformPresenceRecord): boolean {
  if (!presence.tokenExpiresAt) return false;
  const expires = new Date(presence.tokenExpiresAt).getTime();
  if (!Number.isFinite(expires)) return false;
  return expires <= Date.now() + REAUTH_THRESHOLD_MS;
}

export default async function DriverDetailPage({
  params,
}: DriverDetailPageProps) {
  const { driverId } = await params;
  const requestHeaders = await headers();
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);
  const platformAdminOrigin = resolvePlatformAdminOrigin(requestHeaders);

  const [
    driversResult,
    locationsResult,
    presenceResult,
    forwardedResult,
    statementsResult,
    tasksResult,
    incidentsResult,
    shiftsResult,
    attendanceResult,
  ] = await Promise.all([
    loadWithError<DriverRegistryRecord[]>(
      () => client.listDrivers(),
      [],
      locale,
    ),
    loadWithError<DriverLocationSnapshot[]>(
      () => client.listDriverLocations(),
      [],
      locale,
    ),
    loadWithError<PlatformPresenceSummary | null>(
      () => client.getPlatformPresence({ driverId }),
      null,
      locale,
    ),
    loadWithError<ForwardedOrderRecord[]>(
      () => client.listForwarderOrders(),
      [],
      locale,
    ),
    loadWithError<DriverStatementRecord[]>(
      () => client.listDriverStatements(),
      [],
      locale,
    ),
    loadWithError<DriverTaskRecord[]>(
      () => client.listDriverTasks(),
      [],
      locale,
    ),
    loadWithError<IncidentRecord[]>(() => client.listIncidents(), [], locale),
    loadWithError<ShiftRecord[]>(() => client.listShifts(driverId), [], locale),
    loadWithError<AttendanceRecord[]>(
      () => client.listAttendance(driverId),
      [],
      locale,
    ),
  ]);

  // Registry is the page-critical dependency. A hard error → fetch_failed
  // class empty state; a clean miss → 404.
  if (driversResult.error) {
    const reason = classifyErrorReason(driversResult.error);
    const backAction: DriverAction = {
      descriptor: { action: "open_registry", enabled: true, riskLevel: "low" },
      label: copy(locale, "Back to driver registry", "回到司機名冊"),
      href: "/drivers",
      icon: "arrow",
    };
    return (
      <>
        <PageHeader
          theme={theme}
          title={copy(locale, "Driver detail", "司機詳情")}
          subtitle={`${driverId} · ${copy(
            locale,
            "registry fetch failed",
            "名冊載入失敗",
          )}`}
          actions={renderDriverAction(backAction, locale)}
        />
        <div style={pageBodyStyle}>
          {renderEmptyState(locale, reason, driversResult.error, backAction)}
        </div>
      </>
    );
  }

  const driver = driversResult.data.find(
    (candidate) => candidate.driverId === driverId,
  );
  if (!driver) {
    notFound();
  }

  const driverActions = driver as RuntimeActionRecord<DriverRegistryRecord>;
  const presenceSummary = presenceResult.data;
  const presences = presenceSummary?.presences ?? [];
  const adapterByPlatform = new Map(
    (presenceSummary?.adapterStatuses ?? []).map((adapter) => [
      adapter.platformCode,
      adapter,
    ]),
  );

  const locationSnapshot = locationsResult.data.find(
    (snapshot) => snapshot.driverId === driverId,
  );
  const locationStale = isLocationStale(locationSnapshot);

  const driverForwardedOrders = forwardedResult.data.filter(
    (order) =>
      order.acceptedDriverId === driverId ||
      order.candidateDriverIds.includes(driverId),
  );
  const relayFailures = driverForwardedOrders.filter(
    (order) => order.lastSyncError !== null || order.manualFallback.required,
  );
  const activeForwardedOrder = driverForwardedOrders.find(
    (order) =>
      order.acceptedDriverId === driverId &&
      ACTIVE_FORWARDED_STATUSES.has(order.status),
  );

  const driverStatements = statementsResult.data
    .filter((statement) => statement.driverId === driverId)
    .sort((left, right) => right.periodMonth.localeCompare(left.periodMonth));
  const latestStatement = driverStatements[0] ?? null;

  const activeOwnedTasks = tasksResult.data
    .filter(
      (task) =>
        task.driverId === driverId &&
        ACTIVE_DRIVER_TASK_STATUSES.has(task.status),
    )
    .sort((left, right) =>
      (right.acceptedAt ?? "").localeCompare(left.acceptedAt ?? ""),
    );

  const driverIncidents = incidentsResult.data
    .filter((incident) => incident.relatedDriverId === driverId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const openDriverIncidents = driverIncidents.filter(
    (incident) =>
      incident.status === "open" || incident.status === "investigating",
  );
  const sosIncident =
    openDriverIncidents.find((incident) => incident.severity === "critical") ??
    null;
  const sosActive = Boolean(sosIncident);
  const suppressionIncident =
    driverIncidents.find((incident) => readSuppression(incident)?.active) ??
    null;
  const activeSuppression: DriverMatchingSuppression | null =
    suppressionIncident ? readSuppression(suppressionIncident) : null;
  const suppressionIncidentId =
    activeSuppression?.sourceIncidentId ??
    suppressionIncident?.incidentId ??
    null;
  const sosIncidentHref = sosIncident
    ? `/incidents/${encodeURIComponent(sosIncident.incidentId)}`
    : undefined;
  const suppressionIncidentHref = suppressionIncidentId
    ? `/incidents/${encodeURIComponent(suppressionIncidentId)}`
    : undefined;

  const driverShifts = [...shiftsResult.data].sort((left, right) =>
    right.clockedInAt.localeCompare(left.clockedInAt),
  );
  const attendanceByShift = new Map(
    attendanceResult.data.map((entry) => [entry.shiftId, entry]),
  );

  const onlinePlatforms = presences.filter(
    (presence) => presence.status === "online",
  );
  const reauthPlatforms = presences.filter(
    (presence) => presence.reauthRequired,
  );
  const ineligiblePlatforms = presences.filter(
    (presence) => presence.eligibility !== "eligible",
  );
  const degradedAdapters = (presenceSummary?.adapterStatuses ?? []).filter(
    (adapter) => adapter.status === "degraded" || adapter.status === "down",
  );

  // Refresh + degraded surfaces (the page-level T3 banner).
  const degradedSections = [
    presenceResult.error ? copy(locale, "platform bindings", "平台綁定") : null,
    forwardedResult.error ? copy(locale, "relay", "轉派") : null,
    statementsResult.error ? copy(locale, "earnings", "收入") : null,
    tasksResult.error ? copy(locale, "active tasks", "進行中任務") : null,
    incidentsResult.error ? copy(locale, "incidents", "事故") : null,
    shiftsResult.error || attendanceResult.error
      ? copy(locale, "shifts", "班次")
      : null,
    locationsResult.error ? copy(locale, "location", "位置") : null,
  ].filter((entry): entry is string => Boolean(entry));

  const refreshMetadata =
    pickRefreshMetadata(driverActions.refresh) ??
    buildFallbackRefreshMetadata(degradedSections.length > 0);

  // ── availableActions descriptors (driver level) ──
  const backendActions = driverActions.availableActions ?? [];
  const descriptorFor = (
    action: string,
    fallback: ResourceActionDescriptor,
  ): ResourceActionDescriptor =>
    backendActions.find((entry) => entry.action === action) ?? fallback;

  const forceOfflineDescriptor = descriptorFor(
    "force_offline",
    makeDescriptor(
      "force_offline",
      !sosActive && onlinePlatforms.length > 0,
      "high",
      sosActive
        ? "sos_in_response"
        : onlinePlatforms.length === 0
          ? "no_online_platform"
          : undefined,
      true,
    ),
  );
  const requestReauthDescriptor = descriptorFor(
    "request_reauth",
    makeDescriptor(
      "request_reauth",
      presences.length > 0,
      "medium",
      presences.length === 0 ? "no_binding" : undefined,
    ),
  );
  const suppressDescriptor = descriptorFor(
    "suppress_matching",
    makeDescriptor(
      "suppress_matching",
      !activeSuppression,
      "high",
      activeSuppression ? "already_active" : undefined,
      true,
    ),
  );
  const liftSuppressionDescriptor = descriptorFor(
    "lift_suppression",
    makeDescriptor(
      "lift_suppression",
      Boolean(activeSuppression),
      "high",
      activeSuppression ? undefined : "no_active_suppression",
      true,
    ),
  );
  const markUnavailableDescriptor = descriptorFor(
    "mark_unavailable_forwarded",
    makeDescriptor(
      "mark_unavailable_forwarded",
      presences.length > 0 || driverForwardedOrders.length > 0,
      "medium",
      presences.length === 0 && driverForwardedOrders.length === 0
        ? "no_forwarded_binding"
        : undefined,
    ),
  );
  const generateStatementDescriptor = descriptorFor(
    "generate_statement",
    makeDescriptor("generate_statement", true, "low"),
  );

  const headerActions: DriverAction[] = [
    {
      descriptor: forceOfflineDescriptor,
      label: copy(locale, "Force offline (per platform)", "強制下線（單平台）"),
      icon: "warn",
      href: "#platform-bindings",
      variant: "primary",
    },
    {
      descriptor: requestReauthDescriptor,
      label: copy(locale, "Request re-auth", "請司機 re-auth"),
      icon: "arrow",
      href: "#platform-bindings",
    },
    activeSuppression
      ? {
          descriptor: liftSuppressionDescriptor,
          label: copy(locale, "Lift suppression", "解除 suppression"),
          icon: "check",
          ...(suppressionIncidentHref ? { href: suppressionIncidentHref } : {}),
        }
      : {
          descriptor: suppressDescriptor,
          label: copy(locale, "Suppress matching", "suppress matching"),
          icon: "x",
          ...(sosIncidentHref ? { href: sosIncidentHref } : {}),
        },
  ];

  const refreshAction: DriverAction = {
    descriptor: { action: "refresh", enabled: true, riskLevel: "low" },
    label: copy(locale, "Refresh", "重新整理"),
    icon: "arrow",
    href: `/drivers/${encodeURIComponent(driverId)}`,
  };

  const adapterRegistryLink: CrossAppResourceLink = {
    targetApp: "platform-admin",
    route: "/adapter-registry",
    resourceType: "driver",
    resourceId: driverId,
    openMode: "new_tab",
    label: copy(locale, "Adapter registry", "Adapter registry"),
  };
  const adapterRegistryHref = platformAdminOrigin
    ? buildCrossAppHref(platformAdminOrigin, adapterRegistryLink)
    : undefined;
  const adapterRegistryAction: DriverAction = {
    descriptor: makeDescriptor(
      "open_adapter_registry",
      Boolean(adapterRegistryHref),
      "low",
      adapterRegistryHref ? undefined : "platform_admin_origin_unresolved",
    ),
    label: copy(locale, "Adapter registry ↗", "Adapter registry ↗"),
    icon: "ext",
    ...(adapterRegistryHref ? { href: adapterRegistryHref } : {}),
    openInNewTab: true,
    variant: "ghost",
  };

  // ── Row models ──
  const presenceRows: PresenceRow[] = presences.map((presence) => ({
    presence,
    adapter: adapterByPlatform.get(presence.platformCode),
  }));

  const taskRows: TaskRow[] = [
    ...activeOwnedTasks.map<TaskRow>((task) => ({
      taskId: task.taskId,
      domain: "owned",
      status: task.status,
      statusTone: taskStatusTone(task.status),
      reference: task.orderId,
      detail: formatOpsCodeLabel(locale, task.status),
      href: `/dispatch/${encodeURIComponent(task.orderId)}`,
    })),
    ...(activeForwardedOrder
      ? [
          {
            taskId: activeForwardedOrder.mirrorOrderId,
            domain: "forwarded" as const,
            status: activeForwardedOrder.status,
            statusTone: forwardedStatusTone(activeForwardedOrder.status),
            reference: activeForwardedOrder.externalOrderId,
            detail: platformDisplayName(activeForwardedOrder.platformCode),
            href: `/dispatch/${encodeURIComponent(
              activeForwardedOrder.mirrorOrderId,
            )}`,
          } satisfies TaskRow,
        ]
      : []),
  ];

  const relayRows: RelayRow[] = relayFailures.map((order) => ({ order }));
  const statementRows: StatementRow[] = driverStatements
    .slice(0, 6)
    .map((statement) => ({ statement }));
  const shiftRows: ShiftRow[] = driverShifts.slice(0, 6).map((shift) => ({
    shift,
    attendance: attendanceByShift.get(shift.shiftId),
  }));
  const incidentRows: IncidentRow[] = driverIncidents
    .slice(0, 6)
    .map((incident) => ({ incident }));

  // ── Manual override / suppression timeline ──
  const activityItems: CanvasActivityItem[] = [];
  if (activeSuppression) {
    activityItems.push({
      id: "suppression",
      tone: "warn",
      eyebrow: copy(locale, "Matching suppression", "派遣抑制"),
      title: formatOpsCodeLabel(locale, activeSuppression.reasonCode),
      timestamp: copy(
        locale,
        `TTL until ${formatDateTime(locale, activeSuppression.expiresAt)}`,
        `TTL 至 ${formatDateTime(locale, activeSuppression.expiresAt)}`,
      ),
      detail: copy(
        locale,
        "Driver is held out of matching; ops_manager can extend the TTL.",
        "司機已被排除於派遣媒合之外；ops_manager 可延長 TTL。",
      ),
      ...(suppressionIncidentHref
        ? {
            actions: (
              <Link
                href={suppressionIncidentHref}
                prefetch={false}
                style={{ color: theme.accent, fontSize: "12px" }}
              >
                {copy(locale, "Open source incident", "前往來源事故")}
              </Link>
            ),
          }
        : {}),
    });
  }
  for (const incident of openDriverIncidents.slice(0, 5)) {
    activityItems.push({
      id: incident.incidentId,
      tone:
        incident.severity === "critical" || incident.severity === "high"
          ? "danger"
          : "warn",
      eyebrow: `${formatOpsCodeLabel(
        locale,
        incident.category,
      )} · ${formatOpsCodeLabel(locale, incident.severity)}`,
      title: incident.title,
      timestamp: formatDateTime(
        locale,
        incident.occurredAt ?? incident.createdAt,
      ),
      detail: incident.description,
      actions: (
        <Link
          href={`/incidents/${encodeURIComponent(incident.incidentId)}`}
          prefetch={false}
          style={{ color: theme.accent, fontSize: "12px" }}
        >
          {copy(locale, "Open incident", "前往事故")}
        </Link>
      ),
    });
  }

  const subtitleParts = [
    driverId,
    `${copy(locale, "work state", "工作狀態")}: ${formatOpsCodeLabel(
      locale,
      driver.workState,
    )}`,
    formatList(locale, driver.supportedServiceBuckets),
    `${driver.deviceBindings.length} ${copy(
      locale,
      "device binding(s)",
      "裝置綁定",
    )}`,
  ];

  const tabs: ReactNode[] = [
    <span key="overview">{copy(locale, "Overview", "總覽")}</span>,
    <span key="platforms">
      {copy(locale, "Platform bindings", "平台綁定")}
    </span>,
    <span key="tasks">{copy(locale, "Active tasks", "進行中任務")}</span>,
    <span key="earnings">{copy(locale, "Earnings", "收入")}</span>,
    <span key="shifts">{copy(locale, "Shifts", "班次")}</span>,
    <span
      key="incidents"
      style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
    >
      {copy(locale, "Incidents", "事故")}
      {openDriverIncidents.length > 0 ? (
        <Pill theme={theme} tone="danger">
          {openDriverIncidents.length}
        </Pill>
      ) : null}
    </span>,
  ];

  const presenceColumns: CanvasTableColumn<PresenceRow>[] = [
    {
      h: copy(locale, "Platform", "平台"),
      w: 160,
      r: (row) => (
        <strong>{platformDisplayName(row.presence.platformCode)}</strong>
      ),
    },
    {
      h: copy(locale, "Account", "帳號"),
      w: 180,
      mono: true,
      r: (row) =>
        row.presence.accountId ? (
          row.presence.accountId
        ) : (
          <Pill theme={theme} tone="warn">
            {copy(locale, "unbound", "未綁定")}
          </Pill>
        ),
    },
    {
      h: copy(locale, "Presence", "在線"),
      w: 150,
      r: (row) => (
        <span style={{ display: "inline-flex", gap: "6px", flexWrap: "wrap" }}>
          <Pill theme={theme} tone={presenceTone(row.presence)} dot>
            {formatOpsCodeLabel(locale, row.presence.status)}
          </Pill>
          {row.presence.reauthRequired ? (
            <Pill theme={theme} tone="warn">
              {copy(locale, "re-auth", "需 re-auth")}
            </Pill>
          ) : null}
        </span>
      ),
    },
    {
      h: copy(locale, "Eligibility", "資格"),
      w: 120,
      r: (row) => (
        <Pill theme={theme} tone={eligibilityTone(row.presence)}>
          {formatOpsCodeLabel(locale, row.presence.eligibility)}
        </Pill>
      ),
    },
    {
      h: copy(locale, "Token", "Token"),
      w: 170,
      mono: true,
      r: (row) =>
        row.presence.tokenExpiresAt ? (
          <span
            style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}
          >
            {formatDateTime(locale, row.presence.tokenExpiresAt)}
            {tokenExpirySoon(row.presence) ? (
              <Pill theme={theme} tone="warn">
                {copy(locale, "expiring", "即將到期")}
              </Pill>
            ) : null}
          </span>
        ) : (
          "—"
        ),
    },
    {
      h: copy(locale, "Adapter", "Adapter"),
      w: 140,
      r: (row) => (
        <Pill theme={theme} tone={adapterTone(row.adapter)}>
          {formatOpsCodeLabel(locale, row.adapter?.status ?? "unknown")}
        </Pill>
      ),
    },
  ];

  const taskColumns: CanvasTableColumn<TaskRow>[] = [
    {
      h: copy(locale, "Reference", "編號"),
      w: 150,
      mono: true,
      r: (row) =>
        row.href ? (
          <Link
            href={row.href}
            prefetch={false}
            style={{ color: theme.accent }}
          >
            {row.reference}
          </Link>
        ) : (
          row.reference
        ),
    },
    {
      h: copy(locale, "Domain", "領域"),
      w: 110,
      r: (row) => (
        <Pill theme={theme} tone={row.domain === "owned" ? "accent" : "info"}>
          {row.domain}
        </Pill>
      ),
    },
    {
      h: copy(locale, "Status", "狀態"),
      w: 150,
      r: (row) => (
        <Pill theme={theme} tone={row.statusTone} dot>
          {formatOpsCodeLabel(locale, row.status)}
        </Pill>
      ),
    },
    {
      h: copy(locale, "Detail", "細節"),
      r: (row) => row.detail,
    },
  ];

  const relayColumns: CanvasTableColumn<RelayRow>[] = [
    {
      h: copy(locale, "Platform", "平台"),
      w: 140,
      r: (row) => platformDisplayName(row.order.platformCode),
    },
    {
      h: copy(locale, "Mirror", "Mirror"),
      w: 150,
      mono: true,
      r: (row) => row.order.mirrorOrderId,
    },
    {
      h: copy(locale, "Error", "錯誤"),
      r: (row) =>
        row.order.lastSyncError ? (
          <span>
            <strong>{row.order.lastSyncError.code}</strong>
            <span style={{ color: theme.textMuted, display: "block" }}>
              {row.order.lastSyncError.message}
            </span>
          </span>
        ) : (
          "—"
        ),
    },
    {
      h: copy(locale, "Fallback", "人工轉派"),
      w: 150,
      r: (row) =>
        row.order.manualFallback.required ? (
          <Pill theme={theme} tone="warn">
            {row.order.manualFallback.reason ??
              copy(locale, "manual fallback", "人工轉派")}
          </Pill>
        ) : (
          "—"
        ),
    },
  ];

  const statementColumns: CanvasTableColumn<StatementRow>[] = [
    {
      h: copy(locale, "Period", "週期"),
      w: 110,
      mono: true,
      r: (row) => row.statement.periodMonth,
    },
    {
      h: copy(locale, "Payout", "撥款"),
      w: 110,
      r: (row) => (
        <Pill
          theme={theme}
          tone={row.statement.payoutStatus === "paid" ? "success" : "warn"}
          dot
        >
          {formatOpsCodeLabel(locale, row.statement.payoutStatus)}
        </Pill>
      ),
    },
    {
      h: copy(locale, "Net", "淨額"),
      w: 130,
      mono: true,
      align: "right",
      r: (row) =>
        formatMinorCurrency(
          row.statement.netAmount.amountMinor,
          row.statement.netAmount.currency,
        ),
    },
    {
      h: copy(locale, "Receipt", "對帳單號"),
      mono: true,
      r: (row) => row.statement.receiptNo,
    },
  ];

  const shiftColumns: CanvasTableColumn<ShiftRow>[] = [
    {
      h: copy(locale, "Shift", "班次"),
      w: 150,
      mono: true,
      r: (row) => row.shift.shiftId,
    },
    {
      h: copy(locale, "Status", "狀態"),
      w: 120,
      r: (row) => (
        <Pill theme={theme} tone={shiftTone(row.shift.status)} dot>
          {formatOpsCodeLabel(locale, row.shift.status)}
        </Pill>
      ),
    },
    {
      h: copy(locale, "Clock-in", "上班"),
      w: 150,
      mono: true,
      r: (row) => formatDateTime(locale, row.shift.clockedInAt),
    },
    {
      h: copy(locale, "Attendance", "出勤"),
      r: (row) =>
        row.attendance ? (
          <Pill theme={theme} tone={attendanceTone(row.attendance.status)}>
            {formatOpsCodeLabel(locale, row.attendance.status)}
          </Pill>
        ) : (
          "—"
        ),
    },
  ];

  const incidentColumns: CanvasTableColumn<IncidentRow>[] = [
    {
      h: copy(locale, "Incident", "事故"),
      w: 150,
      mono: true,
      r: (row) => (
        <Link
          href={`/incidents/${encodeURIComponent(row.incident.incidentId)}`}
          prefetch={false}
          style={{ color: theme.accent }}
        >
          {row.incident.incidentId}
        </Link>
      ),
    },
    {
      h: copy(locale, "Severity", "嚴重度"),
      w: 110,
      r: (row) => (
        <Pill
          theme={theme}
          tone={incidentSeverityTone(row.incident.severity)}
          dot
        >
          {formatOpsCodeLabel(locale, row.incident.severity)}
        </Pill>
      ),
    },
    {
      h: copy(locale, "Status", "狀態"),
      w: 120,
      r: (row) => (
        <Pill theme={theme} tone="neutral">
          {formatOpsCodeLabel(locale, row.incident.status)}
        </Pill>
      ),
    },
    {
      h: copy(locale, "Title", "標題"),
      r: (row) => row.incident.title,
    },
  ];

  return (
    <>
      <PageHeader
        theme={theme}
        title={
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <span>{driver.name}</span>
            <span
              style={{
                ...monoStyle,
                fontSize: "12px",
                color: theme.textMuted,
                fontWeight: 500,
              }}
            >
              {driver.driverId}
            </span>
            <Pill theme={theme} tone={workStateTone(driver.workState)} dot>
              {formatOpsCodeLabel(locale, driver.workState)}
            </Pill>
            <Pill
              theme={theme}
              tone={driver.dispatchEligible ? "success" : "danger"}
            >
              {driver.dispatchEligible
                ? copy(locale, "dispatchable", "可派遣")
                : copy(locale, "not_dispatchable", "不可派遣")}
            </Pill>
            {sosActive ? (
              <Pill theme={theme} tone="danger" dot>
                SOS
              </Pill>
            ) : null}
            {activeSuppression ? (
              <Pill theme={theme} tone="warn">
                {copy(locale, "matching suppressed", "派遣抑制中")}
              </Pill>
            ) : null}
          </span>
        }
        subtitle={subtitleParts.join(" · ")}
        tabs={tabs}
        activeTab={tabs[0]}
        actions={
          <div style={actionRowStyle}>
            {headerActions.map((action) => renderDriverAction(action, locale))}
            {renderDriverAction(refreshAction, locale)}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        <Banner
          theme={theme}
          tone={
            degradedSections.length > 0 ||
            refreshMetadata.dataFreshness !== "fresh"
              ? "warn"
              : "info"
          }
          icon={degradedSections.length > 0 ? "warn" : "clock"}
          title={copy(
            locale,
            `Refresh tier T3 · ${REFRESH_TIER} (15s) · urgent events push`,
            `刷新層級 T3 · ${REFRESH_TIER}（15 秒）· 緊急事件即時推播`,
          )}
          body={buildRefreshBannerBody(
            locale,
            refreshMetadata,
            degradedSections,
          )}
          actions={renderDriverAction(refreshAction, locale)}
        />

        {sosActive && sosIncident ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy(
              locale,
              "Driver has an active SOS in response — dispatch actions are disabled",
              "此司機目前處於 SOS in_response — dispatch action 已停用",
            )}
            body={`${sosIncident.incidentId} · ${formatOpsCodeLabel(
              locale,
              sosIncident.severity,
            )} · ${sosIncident.title}`}
            actions={
              sosIncidentHref
                ? renderDriverAction(
                    {
                      descriptor: {
                        action: "open_sos_incident",
                        enabled: true,
                        riskLevel: "low",
                      },
                      label: copy(
                        locale,
                        `Open ${sosIncident.incidentId}`,
                        `前往 ${sosIncident.incidentId}`,
                      ),
                      icon: "ext",
                      href: sosIncidentHref,
                      variant: "primary",
                    },
                    locale,
                  )
                : undefined
            }
          />
        ) : null}

        {activeSuppression ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="warn"
            title={copy(
              locale,
              "Matching suppression is active for this driver",
              "此司機目前處於派遣抑制狀態",
            )}
            body={`${formatOpsCodeLabel(
              locale,
              activeSuppression.reasonCode,
            )} · ${copy(
              locale,
              `TTL until ${formatDateTime(locale, activeSuppression.expiresAt)}`,
              `TTL 至 ${formatDateTime(locale, activeSuppression.expiresAt)}`,
            )}`}
            actions={
              suppressionIncidentHref
                ? renderDriverAction(
                    {
                      descriptor: {
                        action: "open_suppression_incident",
                        enabled: true,
                        riskLevel: "low",
                      },
                      label: copy(locale, "Related incident", "相關事故"),
                      icon: "ext",
                      href: suppressionIncidentHref,
                    },
                    locale,
                  )
                : undefined
            }
          />
        ) : null}

        {presenceResult.error ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy(
              locale,
              "Platform presence is degraded",
              "平台在線狀態降級",
            )}
            body={presenceResult.error}
          />
        ) : null}

        <div style={detailGridStyle}>
          <div style={columnStyle}>
            <div id="platform-bindings">
              <Card
                theme={theme}
                title={copy(
                  locale,
                  `Platform binding · ${presences.length} platform(s)`,
                  `平台綁定 · ${presences.length} 個平台`,
                )}
                subtitle={copy(
                  locale,
                  `${onlinePlatforms.length} online · ${reauthPlatforms.length} re-auth · ${ineligiblePlatforms.length} ineligible`,
                  `${onlinePlatforms.length} 在線 · ${reauthPlatforms.length} 需 re-auth · ${ineligiblePlatforms.length} 不符資格`,
                )}
                actions={
                  degradedAdapters.length > 0
                    ? renderDriverAction(adapterRegistryAction, locale)
                    : undefined
                }
                padding={presenceRows.length > 0 ? 0 : 16}
              >
                {presenceResult.error ? (
                  renderEmptyState(
                    locale,
                    classifyErrorReason(presenceResult.error),
                    presenceResult.error,
                  )
                ) : presenceRows.length > 0 ? (
                  <Table
                    theme={theme}
                    columns={presenceColumns}
                    rows={presenceRows}
                  />
                ) : (
                  renderEmptyState(
                    locale,
                    "no_data",
                    copy(
                      locale,
                      "This driver has no platform bindings yet.",
                      "這位司機目前沒有任何平台綁定。",
                    ),
                  )
                )}
              </Card>
            </div>

            <div id="active-tasks">
              <Card
                theme={theme}
                title={copy(
                  locale,
                  `Active tasks · ${taskRows.length}`,
                  `進行中任務 · ${taskRows.length}`,
                )}
                actions={renderDriverAction(
                  {
                    descriptor: markUnavailableDescriptor,
                    label: copy(
                      locale,
                      "Mark unavailable (forwarded)",
                      "標記 forwarded 不可用",
                    ),
                    icon: "x",
                  },
                  locale,
                )}
                padding={taskRows.length > 0 ? 0 : 16}
              >
                {tasksResult.error ? (
                  renderEmptyState(
                    locale,
                    classifyErrorReason(tasksResult.error),
                    tasksResult.error,
                  )
                ) : taskRows.length > 0 ? (
                  <Table theme={theme} columns={taskColumns} rows={taskRows} />
                ) : (
                  renderEmptyState(
                    locale,
                    "no_data",
                    copy(
                      locale,
                      "No owned or forwarded tasks are currently in flight.",
                      "目前沒有進行中的自有或轉派任務。",
                    ),
                  )
                )}
              </Card>
            </div>

            <Card
              theme={theme}
              title={copy(
                locale,
                `Earnings · ${driverStatements.length} statement(s)`,
                `收入 · ${driverStatements.length} 張對帳單`,
              )}
              subtitle={
                latestStatement
                  ? copy(
                      locale,
                      `Latest ${latestStatement.periodMonth} · ${formatMinorCurrency(
                        latestStatement.netAmount.amountMinor,
                        latestStatement.netAmount.currency,
                      )} net`,
                      `最新 ${latestStatement.periodMonth} · 淨額 ${formatMinorCurrency(
                        latestStatement.netAmount.amountMinor,
                        latestStatement.netAmount.currency,
                      )}`,
                    )
                  : undefined
              }
              actions={renderDriverAction(
                {
                  descriptor: generateStatementDescriptor,
                  label: copy(locale, "Generate statement", "產生對帳單"),
                  icon: "arrow",
                  href: `/reports`,
                },
                locale,
              )}
              padding={statementRows.length > 0 ? 0 : 16}
            >
              {statementsResult.error ? (
                renderEmptyState(
                  locale,
                  classifyErrorReason(statementsResult.error),
                  statementsResult.error,
                )
              ) : statementRows.length > 0 ? (
                <Table
                  theme={theme}
                  columns={statementColumns}
                  rows={statementRows}
                />
              ) : (
                renderEmptyState(
                  locale,
                  "no_data",
                  copy(
                    locale,
                    "No earnings statements have been generated for this driver.",
                    "這位司機尚未產生任何對帳單。",
                  ),
                )
              )}
            </Card>
          </div>

          <div style={columnStyle}>
            <div id="manual-override">
              <Card
                theme={theme}
                title={copy(
                  locale,
                  "Manual override & suppression log",
                  "人工介入與抑制紀錄",
                )}
              >
                <CanvasActivityFeed
                  theme={theme}
                  density="compact"
                  items={activityItems}
                  emptyState={renderEmptyState(
                    locale,
                    "no_data",
                    copy(
                      locale,
                      "No manual overrides or active suppression for this driver.",
                      "這位司機目前沒有人工介入或派遣抑制紀錄。",
                    ),
                  )}
                />
              </Card>
            </div>

            <Card
              theme={theme}
              title={copy(
                locale,
                `Failed relay attempts · ${relayFailures.length} (recent)`,
                `轉派失敗 · ${relayFailures.length}（近期）`,
              )}
              padding={relayRows.length > 0 ? 0 : 16}
            >
              {forwardedResult.error ? (
                renderEmptyState(
                  locale,
                  classifyErrorReason(forwardedResult.error),
                  forwardedResult.error,
                )
              ) : relayRows.length > 0 ? (
                <Table theme={theme} columns={relayColumns} rows={relayRows} />
              ) : (
                renderEmptyState(
                  locale,
                  "no_data",
                  copy(
                    locale,
                    "No forwarded relay failures in the current window.",
                    "目前時段內沒有轉派失敗。",
                  ),
                )
              )}
            </Card>

            <Card
              theme={theme}
              title={copy(
                locale,
                `Shifts & attendance · ${driverShifts.length}`,
                `班次與出勤 · ${driverShifts.length}`,
              )}
              padding={shiftRows.length > 0 ? 0 : 16}
            >
              {shiftsResult.error || attendanceResult.error ? (
                renderEmptyState(
                  locale,
                  classifyErrorReason(
                    shiftsResult.error ?? attendanceResult.error ?? "",
                  ),
                  shiftsResult.error ?? attendanceResult.error ?? undefined,
                )
              ) : shiftRows.length > 0 ? (
                <Table theme={theme} columns={shiftColumns} rows={shiftRows} />
              ) : (
                renderEmptyState(
                  locale,
                  "no_data",
                  copy(
                    locale,
                    "No recent shift or attendance entries for this driver.",
                    "這位司機沒有近期班次或出勤紀錄。",
                  ),
                )
              )}
            </Card>

            <Card
              theme={theme}
              title={copy(
                locale,
                `Recent incidents · ${driverIncidents.length}`,
                `近期事故 · ${driverIncidents.length}`,
              )}
              padding={incidentRows.length > 0 ? 0 : 16}
            >
              {incidentsResult.error ? (
                renderEmptyState(
                  locale,
                  classifyErrorReason(incidentsResult.error),
                  incidentsResult.error,
                )
              ) : incidentRows.length > 0 ? (
                <Table
                  theme={theme}
                  columns={incidentColumns}
                  rows={incidentRows}
                />
              ) : (
                renderEmptyState(
                  locale,
                  "no_data",
                  copy(
                    locale,
                    "No incidents are linked to this driver.",
                    "目前沒有與這位司機相關的事故。",
                  ),
                )
              )}
            </Card>

            <Card
              theme={theme}
              title={copy(locale, "Location & status", "位置與狀態")}
            >
              <div
                style={{
                  display: "grid",
                  gap: "8px",
                  fontSize: "12.5px",
                  color: theme.text,
                }}
              >
                <div
                  style={{ display: "flex", gap: "8px", alignItems: "center" }}
                >
                  <CanvasIcon name="pin" size={14} />
                  <span>
                    {locationsResult.error
                      ? copy(locale, "Location unknown", "位置未知")
                      : !locationSnapshot
                        ? copy(locale, "No location sample", "無位置樣本")
                        : locationStale
                          ? copy(locale, "Location stale", "位置過舊")
                          : copy(locale, "Location live", "位置即時")}
                  </span>
                  {locationSnapshot ? (
                    <Pill
                      theme={theme}
                      tone={locationStale ? "warn" : "success"}
                      dot
                    >
                      {formatDateTime(locale, locationSnapshot.recordedAt)}
                    </Pill>
                  ) : null}
                </div>
                {driver.eligibilityBlockedReasons.length > 0 ? (
                  <div style={{ color: theme.textMuted }}>
                    <strong>
                      {copy(locale, "Eligibility blocked", "資格阻擋")}:
                    </strong>{" "}
                    {formatList(locale, driver.eligibilityBlockedReasons)}
                  </div>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {renderDriverAction(
                    {
                      descriptor: {
                        action: "open_registry",
                        enabled: true,
                        riskLevel: "low",
                      },
                      label: copy(locale, "Back to drivers", "回到司機名冊"),
                      icon: "arrow",
                      href: "/drivers",
                      variant: "ghost",
                    },
                    locale,
                  )}
                  {renderDriverAction(
                    {
                      descriptor: {
                        action: "open_dispatch",
                        enabled: true,
                        riskLevel: "low",
                      },
                      label: copy(locale, "Open dispatch", "前往派遣"),
                      icon: "ext",
                      href: "/dispatch",
                      variant: "ghost",
                    },
                    locale,
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

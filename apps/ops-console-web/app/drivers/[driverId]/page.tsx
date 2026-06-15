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
import { t, type Locale } from "@/lib/translations";
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

function detailT(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
) {
  return t(`drivers.detailPage.${key}`, locale, params);
}

function driverActionT(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
) {
  return t(`drivers.actions.${key}`, locale, params);
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
  return new Intl.DateTimeFormat(t("common.dateTimeLocale", locale), {
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
    .join(t("common.listSeparator", locale));
}

function taskDomainLabel(locale: Locale, domain: TaskRow["domain"]) {
  return detailT(locale, `domain.${domain}`);
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
          : t("common.unknown", locale),
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
      return detailT(locale, "empty.noDataTitle");
    case "not_provisioned":
      return detailT(locale, "empty.notProvisionedTitle");
    case "fetch_failed":
      return detailT(locale, "empty.snapshotUnavailableTitle");
    case "permission_denied":
      return detailT(locale, "empty.permissionRequiredTitle");
    case "external_unavailable":
      return detailT(locale, "empty.externalUnavailableTitle");
    case "filtered_empty":
      return detailT(locale, "empty.filteredEmptyTitle");
    default:
      return detailT(locale, "empty.noDataTitle");
  }
}

function defaultEmptyDescription(locale: Locale, reason: EmptyReason) {
  switch (reason) {
    case "no_data":
      return detailT(locale, "empty.noDataDescription");
    case "not_provisioned":
      return detailT(locale, "empty.notProvisionedDescription");
    case "fetch_failed":
      return detailT(locale, "empty.snapshotUnavailableDescription");
    case "permission_denied":
      return detailT(locale, "empty.permissionRequiredDescription");
    case "external_unavailable":
      return detailT(locale, "empty.externalUnavailableDescription");
    case "filtered_empty":
      return detailT(locale, "empty.filteredEmptyDescription");
    default:
      return detailT(locale, "empty.defaultDescription");
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
    return detailT(locale, "actionRequiresReason", {
      label: action.label,
      riskLevel: descriptor.riskLevel,
    });
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
      ? detailT(locale, "refresh.degradedSections", {
          sections: degradedSections.join(t("common.listSeparator", locale)),
        })
      : detailT(locale, "refresh.allSectionsLoaded");
  const snapshotSummary = metadata.generatedAt
    ? detailT(locale, "refresh.generatedAt", {
        value: formatDateTime(locale, metadata.generatedAt),
      })
    : detailT(locale, "refresh.metadataUnavailable");

  return [
    detailT(locale, "refresh.summary", {
      source: metadata.source,
      freshness: freshnessLabel,
    }),
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
      label: detailT(locale, "registryBack"),
      href: "/drivers",
      icon: "arrow",
    };
    return (
      <>
        <PageHeader
          theme={theme}
          title={detailT(locale, "title")}
          subtitle={`${driverId} · ${detailT(locale, "registryFetchFailed")}`}
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
    presenceResult.error ? detailT(locale, "section.platformBindings") : null,
    forwardedResult.error ? detailT(locale, "section.relay") : null,
    statementsResult.error ? detailT(locale, "section.earnings") : null,
    tasksResult.error ? detailT(locale, "section.activeTasks") : null,
    incidentsResult.error ? detailT(locale, "section.incidents") : null,
    shiftsResult.error || attendanceResult.error
      ? detailT(locale, "section.shifts")
      : null,
    locationsResult.error ? detailT(locale, "section.location") : null,
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
      label: driverActionT(locale, "takePlatformOffline"),
      icon: "warn",
      href: "#platform-bindings",
      variant: "primary",
    },
    {
      descriptor: requestReauthDescriptor,
      label: driverActionT(locale, "requestReauth"),
      icon: "arrow",
      href: "#platform-bindings",
    },
    activeSuppression
      ? {
          descriptor: liftSuppressionDescriptor,
          label: driverActionT(locale, "liftSuppression"),
          icon: "check",
          ...(suppressionIncidentHref ? { href: suppressionIncidentHref } : {}),
        }
      : {
          descriptor: suppressDescriptor,
          label: driverActionT(locale, "suppressMatching"),
          icon: "x",
          ...(sosIncidentHref ? { href: sosIncidentHref } : {}),
        },
  ];

  const refreshAction: DriverAction = {
    descriptor: { action: "refresh", enabled: true, riskLevel: "low" },
    label: t("common.refresh", locale),
    icon: "arrow",
    href: `/drivers/${encodeURIComponent(driverId)}`,
  };

  const adapterRegistryLink: CrossAppResourceLink = {
    targetApp: "platform-admin",
    route: "/adapter-registry",
    resourceType: "driver",
    resourceId: driverId,
    openMode: "new_tab",
    label: detailT(locale, "action.adapterRegistry"),
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
    label: detailT(locale, "action.adapterRegistryExternal"),
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
      eyebrow: detailT(locale, "activity.matchingSuppression"),
      title: formatOpsCodeLabel(locale, activeSuppression.reasonCode),
      timestamp: detailT(locale, "ttlUntil", {
        value: formatDateTime(locale, activeSuppression.expiresAt),
      }),
      detail: detailT(locale, "activity.suppressionDetail"),
      ...(suppressionIncidentHref
        ? {
            actions: (
              <Link
                href={suppressionIncidentHref}
                prefetch={false}
                style={{ color: theme.accent, fontSize: "12px" }}
              >
                {detailT(locale, "action.openSourceIncident")}
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
          {detailT(locale, "action.openIncident")}
        </Link>
      ),
    });
  }

  const subtitleParts = [
    driverId,
    `${detailT(locale, "workStateLabel")}: ${formatOpsCodeLabel(
      locale,
      driver.workState,
    )}`,
    formatList(locale, driver.supportedServiceBuckets),
    `${driver.deviceBindings.length} ${detailT(locale, "deviceBindings")}`,
  ];

  const tabs: ReactNode[] = [
    <span key="overview">{detailT(locale, "tab.overview")}</span>,
    <span key="platforms">
      {detailT(locale, "tab.platformBindings")}
    </span>,
    <span key="tasks">{detailT(locale, "tab.activeTasks")}</span>,
    <span key="earnings">{detailT(locale, "tab.earnings")}</span>,
    <span key="shifts">{detailT(locale, "tab.shifts")}</span>,
    <span
      key="incidents"
      style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
    >
      {detailT(locale, "tab.incidents")}
      {openDriverIncidents.length > 0 ? (
        <Pill theme={theme} tone="danger">
          {openDriverIncidents.length}
        </Pill>
      ) : null}
    </span>,
  ];

  const presenceColumns: CanvasTableColumn<PresenceRow>[] = [
    {
      h: detailT(locale, "col.platform"),
      w: 160,
      r: (row) => (
        <strong>{platformDisplayName(row.presence.platformCode)}</strong>
      ),
    },
    {
      h: detailT(locale, "col.account"),
      w: 180,
      mono: true,
      r: (row) =>
        row.presence.accountId ? (
          row.presence.accountId
        ) : (
          <Pill theme={theme} tone="warn">
            {detailT(locale, "platform.unbound")}
          </Pill>
        ),
    },
    {
      h: detailT(locale, "col.presence"),
      w: 150,
      r: (row) => (
        <span style={{ display: "inline-flex", gap: "6px", flexWrap: "wrap" }}>
          <Pill theme={theme} tone={presenceTone(row.presence)} dot>
            {formatOpsCodeLabel(locale, row.presence.status)}
          </Pill>
          {row.presence.reauthRequired ? (
            <Pill theme={theme} tone="warn">
              {detailT(locale, "platform.reauth")}
            </Pill>
          ) : null}
        </span>
      ),
    },
    {
      h: detailT(locale, "col.eligibility"),
      w: 120,
      r: (row) => (
        <Pill theme={theme} tone={eligibilityTone(row.presence)}>
          {formatOpsCodeLabel(locale, row.presence.eligibility)}
        </Pill>
      ),
    },
    {
      h: detailT(locale, "col.token"),
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
                {detailT(locale, "platform.expiring")}
              </Pill>
            ) : null}
          </span>
        ) : (
          "—"
        ),
    },
    {
      h: detailT(locale, "col.adapter"),
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
      h: detailT(locale, "col.reference"),
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
      h: detailT(locale, "col.domain"),
      w: 110,
      r: (row) => (
        <Pill theme={theme} tone={row.domain === "owned" ? "accent" : "info"}>
          {taskDomainLabel(locale, row.domain)}
        </Pill>
      ),
    },
    {
      h: detailT(locale, "col.status"),
      w: 150,
      r: (row) => (
        <Pill theme={theme} tone={row.statusTone} dot>
          {formatOpsCodeLabel(locale, row.status)}
        </Pill>
      ),
    },
    {
      h: detailT(locale, "col.detail"),
      r: (row) => row.detail,
    },
  ];

  const relayColumns: CanvasTableColumn<RelayRow>[] = [
    {
      h: detailT(locale, "col.platform"),
      w: 140,
      r: (row) => platformDisplayName(row.order.platformCode),
    },
    {
      h: detailT(locale, "col.mirror"),
      w: 150,
      mono: true,
      r: (row) => row.order.mirrorOrderId,
    },
    {
      h: detailT(locale, "col.error"),
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
      h: detailT(locale, "col.fallback"),
      w: 150,
      r: (row) =>
        row.order.manualFallback.required ? (
          <Pill theme={theme} tone="warn">
            {row.order.manualFallback.reason ??
              detailT(locale, "relay.manualFallback")}
          </Pill>
        ) : (
          "—"
        ),
    },
  ];

  const statementColumns: CanvasTableColumn<StatementRow>[] = [
    {
      h: detailT(locale, "col.period"),
      w: 110,
      mono: true,
      r: (row) => row.statement.periodMonth,
    },
    {
      h: detailT(locale, "col.payout"),
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
      h: detailT(locale, "col.net"),
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
      h: detailT(locale, "col.receipt"),
      mono: true,
      r: (row) => row.statement.receiptNo,
    },
  ];

  const shiftColumns: CanvasTableColumn<ShiftRow>[] = [
    {
      h: detailT(locale, "col.shift"),
      w: 150,
      mono: true,
      r: (row) => row.shift.shiftId,
    },
    {
      h: detailT(locale, "col.status"),
      w: 120,
      r: (row) => (
        <Pill theme={theme} tone={shiftTone(row.shift.status)} dot>
          {formatOpsCodeLabel(locale, row.shift.status)}
        </Pill>
      ),
    },
    {
      h: detailT(locale, "col.clockIn"),
      w: 150,
      mono: true,
      r: (row) => formatDateTime(locale, row.shift.clockedInAt),
    },
    {
      h: detailT(locale, "col.attendance"),
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
      h: detailT(locale, "col.incident"),
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
      h: detailT(locale, "col.severity"),
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
      h: detailT(locale, "col.status"),
      w: 120,
      r: (row) => (
        <Pill theme={theme} tone="neutral">
          {formatOpsCodeLabel(locale, row.incident.status)}
        </Pill>
      ),
    },
    {
      h: detailT(locale, "col.title"),
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
            <span
              style={{
                ...monoStyle,
                fontSize: "16px",
                color: theme.text,
                fontWeight: 700,
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
                ? detailT(locale, "dispatchable")
                : detailT(locale, "notDispatchable")}
            </Pill>
            {sosActive ? (
              <Pill theme={theme} tone="danger" dot>
                SOS
              </Pill>
            ) : null}
            {activeSuppression ? (
              <Pill theme={theme} tone="warn">
                {detailT(locale, "matchingSuppressed")}
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
          title={detailT(locale, "banner.refreshTier", { tier: REFRESH_TIER })}
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
            title={detailT(locale, "banner.sosActive")}
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
                      label: detailT(locale, "banner.openIncidentById", {
                        incidentId: sosIncident.incidentId,
                      }),
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
            title={detailT(locale, "banner.suppressionActive")}
            body={`${formatOpsCodeLabel(
              locale,
              activeSuppression.reasonCode,
            )} · ${detailT(locale, "ttlUntil", {
              value: formatDateTime(locale, activeSuppression.expiresAt),
            })}`}
            actions={
              suppressionIncidentHref
                ? renderDriverAction(
                    {
                      descriptor: {
                        action: "open_suppression_incident",
                        enabled: true,
                        riskLevel: "low",
                      },
                      label: detailT(locale, "action.relatedIncident"),
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
            title={detailT(locale, "banner.platformPresenceDegraded")}
            body={presenceResult.error}
          />
        ) : null}

        <div style={detailGridStyle}>
          <div style={columnStyle}>
            <div id="platform-bindings">
              <Card
                theme={theme}
                title={detailT(locale, "card.platformBindingTitle", {
                  count: presences.length,
                })}
                subtitle={detailT(locale, "card.platformBindingSubtitle", {
                  online: onlinePlatforms.length,
                  reauth: reauthPlatforms.length,
                  ineligible: ineligiblePlatforms.length,
                })}
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
                    detailT(locale, "card.noPlatformBindings"),
                  )
                )}
              </Card>
            </div>

            <div id="active-tasks">
              <Card
                theme={theme}
                title={detailT(locale, "card.activeTasksTitle", {
                  count: taskRows.length,
                })}
                actions={renderDriverAction(
                  {
                    descriptor: markUnavailableDescriptor,
                    label: detailT(locale, "action.markUnavailableForwarded"),
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
                    detailT(locale, "card.noActiveTasks"),
                  )
                )}
              </Card>
            </div>

            <Card
              theme={theme}
              title={detailT(locale, "card.earningsTitle", {
                count: driverStatements.length,
              })}
              subtitle={
                latestStatement
                  ? detailT(locale, "card.latestStatement", {
                      periodMonth: latestStatement.periodMonth,
                      amount: formatMinorCurrency(
                        latestStatement.netAmount.amountMinor,
                        latestStatement.netAmount.currency,
                      ),
                    })
                  : undefined
              }
              actions={renderDriverAction(
                {
                  descriptor: generateStatementDescriptor,
                  label: detailT(locale, "action.generateStatement"),
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
                  detailT(locale, "card.noStatements"),
                )
              )}
            </Card>
          </div>

          <div style={columnStyle}>
            <div id="manual-override">
              <Card
                theme={theme}
                title={detailT(locale, "card.manualOverrideTitle")}
              >
                <CanvasActivityFeed
                  theme={theme}
                  density="compact"
                  items={activityItems}
                  emptyState={renderEmptyState(
                    locale,
                    "no_data",
                    detailT(locale, "card.noManualOverride"),
                  )}
                />
              </Card>
            </div>

            <Card
              theme={theme}
              title={detailT(locale, "card.failedRelayTitle", {
                count: relayFailures.length,
              })}
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
                  detailT(locale, "card.noRelayFailures"),
                )
              )}
            </Card>

            <Card
              theme={theme}
              title={detailT(locale, "card.shiftsTitle", {
                count: driverShifts.length,
              })}
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
                  detailT(locale, "card.noShifts"),
                )
              )}
            </Card>

            <Card
              theme={theme}
              title={detailT(locale, "card.incidentsTitle", {
                count: driverIncidents.length,
              })}
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
                  detailT(locale, "card.noIncidents"),
                )
              )}
            </Card>

            <Card
              theme={theme}
              title={detailT(locale, "card.locationStatusTitle")}
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
                      ? detailT(locale, "location.unknown")
                      : !locationSnapshot
                        ? detailT(locale, "location.noSample")
                        : locationStale
                          ? detailT(locale, "location.stale")
                          : detailT(locale, "location.live")}
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
                      {detailT(locale, "eligibilityBlocked")}:
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
                      label: detailT(locale, "action.backToDrivers"),
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
                      label: detailT(locale, "action.openDispatch"),
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

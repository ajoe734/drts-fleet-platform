import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  AdapterHealthRecord,
  DispatchCandidate,
  DispatchJobRecord,
  DriverTaskRecord,
  DriverRegistryRecord,
  EmptyReason,
  EmptyStateEnvelope,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
  IdentityContext,
  OwnedOrderRecord,
  PartnerEligibilityReviewQueueItem,
  ResourceActionDescriptor,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "@drts/contracts";
import { DispatchAutoRefresh } from "@/components/dispatch-auto-refresh";
import { GoogleMapBaseLayer } from "@/components/google-map-base-layer";
import { PublishAssistantScope } from "@/components/ops-assistant";
import { getServerOpsClient } from "@/lib/api-client.server";
import { CanvasEmptyPanel } from "@/lib/canvas-workflow";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { formatCompactNumber } from "@/lib/ops-analytics";
import { getServerLocale } from "@/lib/server-locale";
import {
  resolveQueueSemantics,
  isForbiddenStatutoryOverrideAction,
} from "@/lib/queue-semantics";
import type { Locale } from "@/lib/translations";
import { t } from "@/lib/translations";
import {
  buildOpsMapBoardModel,
  buildOpsMapTileViewport,
  getDefaultOpsMapZoom,
  normalizeOpsMapBounds,
  projectOpsMapPointToViewport,
  resolveOpsMapTileUrlTemplate,
  shiftOpsMapCenter,
  type OpsMapBoardModel,
  type OpsMapPointKind,
  type OpsMapProviderStatus,
  type OpsMapRouteSegment,
  type OpsMapTileViewport,
} from "./ops-map-board";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

type DispatchPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type CanvasTone = "accent" | "danger" | "info" | "neutral" | "success" | "warn";
type DispatchBoard =
  | "ready"
  | "assigned"
  | "exception"
  | "no_supply"
  | "governance"
  | "forwarded";
type OwnedProductFilter = "all" | string;
type TimingFilter = "all" | "reservation" | "realtime";
type LicenseFilter = "all" | "license_issue" | "license_clear";
type FleetFilter = "all" | string;
type ApprovalFilter = "all" | string;
type EligibilityFilter = "all" | string;
type ForwardedFacetFilter =
  | "all"
  | "attention"
  | "sync_failed"
  | "manual_fallback"
  | "terminal";

type ListEnvelope<T> = {
  items: T[];
  emptyState?: EmptyStateEnvelope | null;
  refresh?: UiRefreshMetadata | null;
  refreshMetadata?: UiRefreshMetadata | null;
  health?: UiHealthEnvelope | null;
  uiHealth?: UiHealthEnvelope | null;
};

type ListLoadResult<T> = {
  items: T[];
  emptyState?: EmptyStateEnvelope | null;
  refresh: UiRefreshMetadata;
  health?: UiHealthEnvelope | null;
  failed: boolean;
  errorStatus?: number | undefined;
};

type RuntimeOwnedOrder = OwnedOrderRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type RuntimeForwardedOrder = ForwardedOrderRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type RuntimeDispatchJob = DispatchJobRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type HealthPayload = {
  status?: "healthy" | "degraded" | "down";
  service?: string;
  timestamp?: string;
  mode?: string;
  execution_mode?: string;
};

type BoardRecord = RuntimeOwnedOrder | RuntimeForwardedOrder;

type BoardActionContext = {
  action: string;
  href: string;
  label: string;
  riskLevel: ResourceActionDescriptor["riskLevel"];
  disabled: boolean;
  disabledReason?: string | undefined;
  external?: boolean;
};

type TableRow = Record<string, unknown> & { _selected?: boolean };

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const pageStackStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 14,
};

const boardNavStyle = {
  padding: "14px 24px 0",
  borderBottom: `1px solid ${theme.border}`,
  background: theme.surface,
  display: "flex",
  gap: 6,
  flexWrap: "wrap" as const,
};

const boardNavLinkStyle = {
  textDecoration: "none",
  color: "inherit",
};

const boardNavItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "7px 11px 8px",
  borderBottom: "2px solid transparent",
  marginBottom: -1,
  fontSize: 12.5,
};

const boardContentStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 14,
};

const filterRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
};

const actionGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 10,
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const summaryCellStyle = {
  padding: "12px 14px",
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  display: "grid",
  gap: 4,
};

const selectedTrayStyle = {
  display: "grid",
  gap: 12,
  padding: "16px 18px 18px",
  borderTop: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
};

const selectedMetaStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const selectedMetaCellStyle = {
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  display: "grid",
  gap: 4,
};

const spatialBoardStyle: CSSProperties = {
  padding: 16,
  borderRadius: 16,
  border: `1px solid ${theme.border}`,
  background: `linear-gradient(180deg, ${theme.infoBg} 0%, ${theme.surfaceLo} 100%)`,
  display: "grid",
  gap: 12,
};

const spatialBoardHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 0.9fr)",
  gap: 12,
  alignItems: "start",
};

const spatialBoardStatsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
};

const spatialStatCardStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: theme.surfaceHi,
  border: `1px solid ${theme.border}`,
  display: "grid",
  gap: 3,
};

const spatialBoardNoteStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  gap: 8,
  color: theme.textMuted,
  fontSize: 12,
};

const spatialOverlayStripStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 12,
  borderRadius: 14,
  background: theme.surfaceHi,
  border: `1px solid ${theme.border}`,
};

const spatialOverlayGroupStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  color: theme.text,
  fontSize: 12,
};

const spatialOverlayLabelStyle: CSSProperties = {
  color: theme.textDim,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const spatialOverlayChipStyle: CSSProperties = {
  borderRadius: 999,
  padding: "3px 8px",
  background: theme.infoBg,
  color: theme.info,
  border: `1px solid ${theme.infoBorder}`,
  fontWeight: 700,
};

const spatialMapShellStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(240px, 0.75fr)",
  gap: 12,
  alignItems: "start",
};

const spatialMapStyle: CSSProperties = {
  position: "relative",
  height: 360,
  overflow: "hidden",
  borderRadius: 16,
  border: `1px solid ${theme.infoBorder}`,
  background: `linear-gradient(135deg, ${theme.infoBg} 0%, ${theme.surfaceHi} 52%, ${theme.surfaceLo} 100%)`,
};

const spatialTileStyle: CSSProperties = {
  position: "absolute",
  width: "35.56%",
  height: "71.12%",
  objectFit: "cover",
};

const spatialMapFallbackStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  color: theme.textMuted,
  fontSize: 12,
  padding: 18,
  textAlign: "center",
  background: `linear-gradient(135deg, ${theme.surfaceHi}, ${theme.infoBg})`,
};

const spatialRouteOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
};

const spatialLegendStyle: CSSProperties = {
  padding: 14,
  borderRadius: 16,
  background: theme.surfaceHi,
  border: `1px solid ${theme.border}`,
  display: "grid",
  gap: 10,
};

const spatialMapControlsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
};

const spatialMapControlStyle: CSSProperties = {
  textDecoration: "none",
  color: "inherit",
};

const spatialPointBaseStyle: CSSProperties = {
  position: "absolute",
  zIndex: 3,
  transform: "translate(-50%, -50%)",
  width: 32,
  height: 32,
  borderRadius: 999,
  border: `2px solid ${theme.surfaceHi}`,
  color: theme.invert,
  fontSize: 12,
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: theme.shadowSm,
};

const DRIVER_TASK_PRIORITY: Record<string, number> = {
  on_trip: 0,
  proof_pending: 1,
  arrived_pickup: 2,
  enroute_pickup: 3,
  accepted: 4,
  pending_acceptance: 5,
  completed: 6,
  cancelled: 7,
  rejected: 8,
};

const ACTIVE_TRIP_STATUSES = new Set<OwnedOrderRecord["status"]>([
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
]);

const BOARD_PRIORITY: Record<DispatchBoard, number> = {
  governance: 0,
  no_supply: 1,
  exception: 2,
  ready: 3,
  assigned: 4,
  forwarded: 5,
};

const FORWARDED_STATUS_PRIORITY: Record<
  ForwardedOrderRecord["status"],
  number
> = {
  sync_failed: 0,
  accept_pending: 1,
  broadcasted: 2,
  received: 3,
  confirmed_by_platform: 4,
  completed_synced: 5,
  lost_race: 6,
  cancelled_by_platform: 7,
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function finiteNumberParam(value: string | string[] | undefined) {
  const raw = firstParam(value);
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseApiErrorStatus(error: unknown): number | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const match = error.message.match(/API error (\d+)/);
  return match ? Number(match[1]) : undefined;
}

function defaultRefresh(generatedAt: string): UiRefreshMetadata {
  return {
    generatedAt,
    staleAfterMs: 5000,
    dataFreshness: "unknown",
    source: "live",
  };
}

async function loadListRuntime<T>(
  client: Awaited<ReturnType<typeof getServerOpsClient>>,
  path: string,
): Promise<ListLoadResult<T>> {
  const generatedAt = new Date().toISOString();
  try {
    const payload = await client.get<T[] | ListEnvelope<T>>(path);
    if (Array.isArray(payload)) {
      return {
        items: payload,
        refresh: defaultRefresh(generatedAt),
        failed: false,
      };
    }

    return {
      items: Array.isArray(payload.items) ? payload.items : [],
      emptyState: payload.emptyState ?? null,
      refresh:
        payload.refresh ??
        payload.refreshMetadata ??
        defaultRefresh(generatedAt),
      health: payload.uiHealth ?? payload.health ?? null,
      failed: false,
    };
  } catch (error) {
    const status = parseApiErrorStatus(error);
    return {
      items: [],
      emptyState: {
        reason: status === 403 ? "permission_denied" : "fetch_failed",
        messageCode:
          status === 403
            ? "dispatch.permission_denied"
            : "dispatch.fetch_failed",
      },
      refresh: defaultRefresh(generatedAt),
      failed: true,
      ...(status !== undefined ? { errorStatus: status } : {}),
    };
  }
}

async function loadHealthPayload(): Promise<UiHealthEnvelope | null> {
  const apiBaseUrl = process.env.DRTS_API_URL ?? "http://localhost:3001";
  try {
    const response = await fetch(new URL("/api/health", apiBaseUrl), {
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as HealthPayload;
    return {
      status: payload.status ?? "healthy",
      degradedServices:
        payload.status && payload.status !== "healthy" && payload.service
          ? [
              {
                service: payload.service,
                impact:
                  payload.mode ??
                  payload.execution_mode ??
                  "dispatch surface degraded",
                severity: payload.status === "down" ? "critical" : "warning",
              },
            ]
          : [],
      lastCheckedAt: payload.timestamp ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function resolveBoard(value: string | undefined): DispatchBoard {
  switch (value) {
    case "assigned":
    case "exception_hold":
    case "exception":
    case "no_eligible_supply":
    case "no_supply":
    case "override_pending":
    case "governance":
    case "forwarded":
      if (value === "exception_hold") return "exception";
      if (value === "no_eligible_supply") return "no_supply";
      if (value === "override_pending") return "governance";
      return value;
    default:
      return "ready";
  }
}

function buildDispatchHref({
  board,
  product,
  timing,
  license,
  fleet,
  approval,
  eligibility,
  facet,
  workItemId,
  mapZoom,
  mapLat,
  mapLng,
  mapServiceArea,
  mapPolicyCode,
}: {
  board: DispatchBoard;
  product?: string | undefined;
  timing?: string | undefined;
  license?: string | undefined;
  fleet?: string | undefined;
  approval?: string | undefined;
  eligibility?: string | undefined;
  facet?: string | undefined;
  workItemId?: string | undefined;
  mapZoom?: number | string | undefined;
  mapLat?: number | string | undefined;
  mapLng?: number | string | undefined;
  mapServiceArea?: string | undefined;
  mapPolicyCode?: string | undefined;
}) {
  const params = new URLSearchParams();
  if (board !== "ready") {
    params.set("board", board);
  }
  if (product && product !== "all") {
    params.set("product", product);
  }
  if (timing && timing !== "all") {
    params.set("timing", timing);
  }
  if (license && license !== "all") {
    params.set("license", license);
  }
  if (fleet && fleet !== "all") {
    params.set("fleet", fleet);
  }
  if (approval && approval !== "all") {
    params.set("approval", approval);
  }
  if (eligibility && eligibility !== "all") {
    params.set("eligibility", eligibility);
  }
  if (facet && facet !== "all") {
    params.set("facet", facet);
  }
  if (workItemId) {
    params.set("workItemId", workItemId);
  }
  if (mapZoom !== undefined) {
    params.set("mapZoom", String(mapZoom));
  }
  if (mapLat !== undefined) {
    params.set("mapLat", String(mapLat));
  }
  if (mapLng !== undefined) {
    params.set("mapLng", String(mapLng));
  }
  if (mapServiceArea && mapServiceArea !== "all") {
    params.set("mapServiceArea", mapServiceArea);
  }
  if (mapPolicyCode && mapPolicyCode !== "all") {
    params.set("mapPolicyCode", mapPolicyCode);
  }
  const query = params.toString();
  return query ? `/dispatch?${query}` : "/dispatch";
}

function buildDispatchDetailHref({
  dispatchId,
  board,
  product,
  timing,
  license,
  fleet,
  approval,
  eligibility,
  facet,
  action,
}: {
  dispatchId: string;
  board?: DispatchBoard;
  product?: string | undefined;
  timing?: string | undefined;
  license?: string | undefined;
  fleet?: string | undefined;
  approval?: string | undefined;
  eligibility?: string | undefined;
  facet?: string | undefined;
  action?: string | undefined;
}) {
  const params = new URLSearchParams();
  if (board && board !== "ready") {
    params.set("board", board);
  }
  if (product && product !== "all") {
    params.set("product", product);
  }
  if (timing && timing !== "all") {
    params.set("timing", timing);
  }
  if (license && license !== "all") {
    params.set("license", license);
  }
  if (fleet && fleet !== "all") {
    params.set("fleet", fleet);
  }
  if (approval && approval !== "all") {
    params.set("approval", approval);
  }
  if (eligibility && eligibility !== "all") {
    params.set("eligibility", eligibility);
  }
  if (facet && facet !== "all") {
    params.set("facet", facet);
  }
  if (action) {
    params.set("action", action);
  }
  const query = params.toString();
  const base = `/dispatch/${encodeURIComponent(dispatchId)}`;
  return query ? `${base}?${query}` : base;
}

function getBoardMeta(board: DispatchBoard, locale: Locale) {
  switch (board) {
    case "ready":
      return {
        label: t("dispatch.board.ready.label", locale),
        description: t("dispatch.board.ready.description", locale),
      };
    case "assigned":
      return {
        label: t("dispatch.board.assigned.label", locale),
        description: t("dispatch.board.assigned.description", locale),
      };
    case "exception":
      return {
        label: t("dispatch.board.exception.label", locale),
        description: t("dispatch.board.exception.description", locale),
      };
    case "no_supply":
      return {
        label: t("dispatch.board.noSupply.label", locale),
        description: t("dispatch.board.noSupply.description", locale),
      };
    case "governance":
      return {
        label: t("dispatch.board.governance.label", locale),
        description: t("dispatch.board.governance.description", locale),
      };
    case "forwarded":
      return {
        label: t("dispatch.board.forwarded.label", locale),
        description: t("dispatch.board.forwarded.description", locale),
      };
  }
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
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

function formatDurationSince(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  const diffMs = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diffMs)) {
    return "—";
  }
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (totalMinutes < 60) {
    return t("dispatch.duration.minutes", locale, { count: totalMinutes });
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return t("dispatch.duration.hoursMinutes", locale, { hours, minutes });
}

function formatWindow(order: OwnedOrderRecord, locale: Locale) {
  if (!order.reservationWindowStart || !order.reservationWindowEnd) {
    return t("dispatch.filters.timing.realtime", locale);
  }
  return `${formatDateTime(locale, order.reservationWindowStart)} → ${formatDateTime(locale, order.reservationWindowEnd)}`;
}

function formatDispatchCode(
  locale: Locale,
  value: string | null | undefined,
  fallback = "—",
) {
  return value ? formatOpsCodeLabel(locale, value) : fallback;
}

function formatRefreshSummary(refresh: UiRefreshMetadata, locale: Locale) {
  return `${formatDispatchCode(locale, refresh.dataFreshness)} · ${formatDateTime(
    locale,
    refresh.generatedAt,
  )} · ${formatDispatchCode(locale, refresh.source)}`;
}

function getAddressLabel(
  address: OwnedOrderRecord["pickup"] | OwnedOrderRecord["dropoff"],
) {
  return address.addressName ?? address.address;
}

function getTenantLabel(order: OwnedOrderRecord) {
  return (
    order.tenantId ??
    order.partnerEntrySlug ??
    order.partnerId ??
    order.orderSource
  );
}

function pickCurrentTask(tasks: DriverTaskRecord[]) {
  return (
    [...tasks].sort((left, right) => {
      const leftRank = DRIVER_TASK_PRIORITY[left.status] ?? 99;
      const rightRank = DRIVER_TASK_PRIORITY[right.status] ?? 99;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftTimestamp =
        left.completedAt ??
        left.startedAt ??
        left.arrivedPickupAt ??
        left.departedAt ??
        left.acceptedAt ??
        "";
      const rightTimestamp =
        right.completedAt ??
        right.startedAt ??
        right.arrivedPickupAt ??
        right.departedAt ??
        right.acceptedAt ??
        "";
      return rightTimestamp.localeCompare(leftTimestamp);
    })[0] ?? null
  );
}

function getNestedValue(
  record: Record<string, unknown>,
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }
    return current[segment];
  }, record);
}

function readSummaryText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (!isRecord(value)) {
    return null;
  }

  for (const candidate of [
    value.addressName,
    value.address,
    value.label,
    value.name,
    value.summary,
    value.title,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function readForwardedValue(
  order: ForwardedOrderRecord,
  keys: string[],
): string | null {
  const sources = [order.authoritativeSnapshot, order.payload];
  for (const source of sources) {
    if (!isRecord(source)) {
      continue;
    }
    for (const key of keys) {
      const direct = key.includes(".")
        ? getNestedValue(source, key)
        : source[key];
      const text = readSummaryText(direct);
      if (text) {
        return text;
      }
    }
  }
  return null;
}

function formatForwardedWindow(order: ForwardedOrderRecord, locale: Locale) {
  const start = readForwardedValue(order, [
    "reservationWindowStart",
    "scheduledPickupAt",
    "pickupAt",
    "windowStart",
  ]);
  const end = readForwardedValue(order, [
    "reservationWindowEnd",
    "scheduledDropoffAt",
    "windowEnd",
  ]);

  if (start && !Number.isNaN(Date.parse(start))) {
    if (end && !Number.isNaN(Date.parse(end))) {
      return `${formatDateTime(locale, start)} → ${formatDateTime(locale, end)}`;
    }
    return formatDateTime(locale, start);
  }

  return t("dispatch.filters.timing.realtime", locale);
}

function getServiceProductValue(order: OwnedOrderRecord) {
  return order.businessDispatchSubtype ?? order.serviceBucket;
}

function getFleetValue(order: OwnedOrderRecord) {
  return (
    order.partnerEntrySlug ??
    order.partnerId ??
    order.partnerProgramId ??
    order.tenantId ??
    "direct_ops"
  );
}

function getFleetLabel(order: OwnedOrderRecord, locale: Locale) {
  const fleetValue = getFleetValue(order);
  return fleetValue === "direct_ops"
    ? t("dispatch.filters.fleet.direct", locale)
    : formatDispatchCode(locale, fleetValue);
}

function getTimingValue(order: OwnedOrderRecord): TimingFilter {
  return order.dispatchSemantics === "reservation" ? "reservation" : "realtime";
}

function getEligibilityGate(order: OwnedOrderRecord) {
  return (order.complianceGates ?? []).find(
    (gate) => gate.gateType === "eligibility",
  );
}

function getEligibilityReasonValue(order: OwnedOrderRecord) {
  const gate = getEligibilityGate(order);
  if (!gate || gate.state === "clear") {
    return "clear";
  }
  if (order.queueEntryReason === "dispatch_manual_review_required") {
    return "manual_review";
  }
  if (gate.evidenceState === "missing") {
    return "eligibility_verification_missing";
  }
  if (gate.state === "review_required") {
    return "manual_review";
  }
  return order.lastDispatchFailureReason ?? gate.gateType;
}

function getEligibilityReasonLabel(order: OwnedOrderRecord, locale: Locale) {
  const value = getEligibilityReasonValue(order);
  return value === "clear"
    ? t("dispatch.filters.eligibility.clear", locale)
    : formatDispatchCode(locale, value);
}

function getApprovalLabel(value: string, locale: Locale) {
  return formatDispatchCode(locale, value);
}

function getVisibleStateCode(
  order: OwnedOrderRecord,
  job?: DispatchJobRecord,
  locale: Locale = "zh",
) {
  const queueSemantics = resolveQueueSemantics(order, locale);
  if (queueSemantics.isStatutoryRefusal) {
    return "statutory_refusal";
  }
  if (order.exceptionHold?.overrideRequest && !order.exceptionHold.resolution) {
    return "override_pending";
  }
  if (order.status === "no_supply" || order.status === "delayed_queue") {
    return "no_supply";
  }
  if (order.status === "exception_hold") {
    return "exception_hold";
  }
  if (job?.status === "assigned" || ACTIVE_TRIP_STATUSES.has(order.status)) {
    return "assigned";
  }
  if (job?.status === "matching") {
    return "broadcasting";
  }
  return "queued";
}

function getOwnedBoard(
  order: OwnedOrderRecord,
  job?: DispatchJobRecord,
  locale: Locale = "zh",
): DispatchBoard {
  const state = getVisibleStateCode(order, job, locale);
  if (state === "statutory_refusal") return "governance";
  if (state === "override_pending") return "governance";
  if (state === "no_supply") return "no_supply";
  if (state === "exception_hold") return "exception";
  if (state === "assigned") return "assigned";
  return "ready";
}

function getStateTone(stateCode: string): CanvasTone {
  if (stateCode === "statutory_refusal" || stateCode === "no_supply") {
    return "danger";
  }
  if (stateCode === "assigned" || stateCode === "completed") {
    return "success";
  }
  if (stateCode === "exception_hold" || stateCode === "override_pending") {
    return "warn";
  }
  if (stateCode === "broadcasting" || stateCode === "queued") {
    return "info";
  }
  return "neutral";
}

function getOwnedGateSummary(
  order: OwnedOrderRecord,
  locale: Locale = "zh",
): {
  label: string;
  tone: CanvasTone;
} {
  const queueSemantics = resolveQueueSemantics(order, locale);
  if (queueSemantics.isStatutoryRefusal) {
    return { label: "statutory_refusal", tone: "danger" };
  }
  if (order.exceptionHold?.overrideRequest && !order.exceptionHold.resolution) {
    return { label: "override_pending", tone: "warn" };
  }
  const activeGate = (order.complianceGates ?? []).find(
    (gate: NonNullable<OwnedOrderRecord["complianceGates"]>[number]) =>
      gate.blocking || gate.state !== "clear",
  );
  if (activeGate) {
    return {
      label: activeGate.title || activeGate.gateType,
      tone: activeGate.blocking ? "warn" : "info",
    };
  }
  if (order.noSupplyEscalation && !order.noSupplyEscalation.resolvedAt) {
    return {
      label: order.noSupplyEscalation.escalationAction,
      tone: "warn",
    };
  }
  if (order.dispatchTimeout) {
    return {
      label: order.dispatchTimeout.timeoutReasonCode,
      tone: "warn",
    };
  }
  return { label: "clear", tone: "success" };
}

function needsForwardedAttention(order: ForwardedOrderRecord) {
  return (
    order.status === "accept_pending" ||
    order.status === "sync_failed" ||
    order.manualFallback.required ||
    order.reconciliationJob?.status === "queued"
  );
}

function isForwardedTerminal(order: ForwardedOrderRecord) {
  return (
    order.status === "confirmed_by_platform" ||
    order.status === "completed_synced" ||
    order.status === "lost_race" ||
    order.status === "cancelled_by_platform"
  );
}

function getForwardedStateTone(
  status: ForwardedOrderRecord["status"],
): CanvasTone {
  switch (status) {
    case "sync_failed":
      return "danger";
    case "accept_pending":
      return "warn";
    case "broadcasted":
    case "received":
      return "info";
    case "confirmed_by_platform":
    case "completed_synced":
      return "success";
    default:
      return "neutral";
  }
}

function getAdapterTone(status: AdapterHealthRecord["status"]): CanvasTone {
  switch (status) {
    case "down":
      return "danger";
    case "degraded":
      return "warn";
    default:
      return "success";
  }
}

function getMismatchSummary(
  order: ForwardedOrderRecord,
  issue: ForwarderReconciliationIssue | undefined,
  locale: Locale,
) {
  const mismatchCount =
    issue?.reconciliationJob.mismatchCount ??
    order.reconciliationJob?.mismatchCount ??
    0;
  if (mismatchCount > 0) {
    return {
      label: t("dispatch.mismatch.count", locale, { count: mismatchCount }),
      tone: "warn" as CanvasTone,
    };
  }
  if (order.manualFallback.required) {
    return {
      label: formatDispatchCode(
        locale,
        order.manualFallback.reason ?? "manual_fallback",
      ),
      tone: "warn" as CanvasTone,
    };
  }
  if (order.lastSyncError) {
    return {
      label: formatDispatchCode(locale, order.lastSyncError.code),
      tone: "danger" as CanvasTone,
    };
  }
  if (order.reconciliationJob?.status === "queued") {
    return {
      label: formatDispatchCode(locale, "reconciliation"),
      tone: "info" as CanvasTone,
    };
  }
  return {
    label: formatDispatchCode(locale, "clear"),
    tone: "success" as CanvasTone,
  };
}

function resolveActionLabel(action: string, locale: Locale) {
  switch (action) {
    case "assign":
    case "assign_dispatch":
    case "dispatch_order":
      return t("dispatch.action.assignCandidate", locale);
    case "release":
    case "release_driver":
    case "reassign_dispatch":
      return t("dispatch.action.releaseReassignDriver", locale);
    case "redispatch":
    case "redispatch_order":
    case "redispatch_with_reason":
      return t("dispatch.action.redispatch", locale);
    case "cancel":
    case "cancel_owned_order":
      return t("dispatch.action.cancelOrder", locale);
    case "manual_fare_override":
    case "fare_override":
    case "request_fare_override":
      return t("dispatch.action.requestFareOverride", locale);
    case "resolve_hold":
    case "resolve_exception_hold":
      return t("dispatch.action.resolveHold", locale);
    case "request_exception_override":
      return t("dispatch.action.requestOverride", locale);
    case "approve_exception_override":
      return t("dispatch.action.approveOverride", locale);
    case "reject_exception_override":
      return t("dispatch.action.rejectOverride", locale);
    case "escalate_incident":
    case "createIncidentFromDispatchException":
      return t("dispatch.action.escalateIncident", locale);
    case "extend_search":
      return t("dispatch.action.extendSearch", locale);
    case "cancel_no_supply":
      return t("dispatch.action.cancelNoSupplyOrder", locale);
    case "resolve_no_supply":
      return t("dispatch.action.resolveNoSupply", locale);
    case "jump_approval_request":
      return t("dispatch.action.openApprovalRequest", locale);
    case "trigger_reconciliation":
    case "complete_forwarder_reconciliation":
      return t("dispatch.action.completeReconciliation", locale);
    case "engage_manual_fallback":
      return t("dispatch.action.engageManualFallback", locale);
    case "force_refresh":
    case "sync_forwarded_order_status":
    case "mark_forwarder_sync_failed":
      return t("dispatch.action.forceRefresh", locale);
    case "inspect_adapter":
      return t("dispatch.action.inspectAdapter", locale);
    default:
      return action ? action.replace(/_/g, " ") : "—";
  }
}

function actionTone(
  riskLevel: ResourceActionDescriptor["riskLevel"],
  disabled: boolean,
): CanvasTone {
  if (disabled) return "neutral";
  switch (riskLevel) {
    case "high":
      return "danger";
    case "medium":
      return "warn";
    default:
      return "info";
  }
}

function normalizeActions(record: BoardRecord): ResourceActionDescriptor[] {
  return Array.isArray(record.availableActions) ? record.availableActions : [];
}

function buildPlatformAdminHref(path: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ??
    process.env.PLATFORM_ADMIN_WEB_URL ??
    "/platform-admin";
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function buildActionHref(
  board: DispatchBoard,
  record: BoardRecord,
  action: ResourceActionDescriptor,
  selectedProduct: OwnedProductFilter,
  selectedTiming: TimingFilter,
  selectedLicense: LicenseFilter,
  selectedFleet: FleetFilter,
  selectedApproval: ApprovalFilter,
  selectedEligibility: EligibilityFilter,
  selectedFacet: ForwardedFacetFilter,
) {
  if ("mirrorOrderId" in record) {
    switch (action.action) {
      case "inspect_adapter":
        return buildPlatformAdminHref(
          `/adapter-registry?platformCode=${encodeURIComponent(record.platformCode)}`,
        );
      default: {
        return buildDispatchDetailHref({
          dispatchId: record.mirrorOrderId,
          board,
          product: selectedProduct,
          timing: selectedTiming,
          license: selectedLicense,
          fleet: selectedFleet,
          approval: selectedApproval,
          eligibility: selectedEligibility,
          facet: selectedFacet,
          action: action.action,
        });
      }
    }
  }

  if (action.action === "jump_approval_request") {
    const approvalRequestId = record.approvalRequestIds?.[0];
    return approvalRequestId
      ? `/approval-requests?approvalRequestId=${encodeURIComponent(approvalRequestId)}`
      : "/approval-requests";
  }

  if (
    action.action === "createIncidentFromDispatchException" ||
    action.action === "escalate_incident"
  ) {
    return `/incidents?sourceOrderId=${encodeURIComponent(record.orderId)}`;
  }

  return buildDispatchDetailHref({
    dispatchId: record.orderId,
    board,
    product: selectedProduct,
    timing: selectedTiming,
    license: selectedLicense,
    fleet: selectedFleet,
    approval: selectedApproval,
    eligibility: selectedEligibility,
    action: action.action,
  });
}

function buildEmptyStateActionContext(
  board: DispatchBoard,
  action: ResourceActionDescriptor,
  locale: Locale,
  selectedProduct: OwnedProductFilter,
  selectedTiming: TimingFilter,
  selectedLicense: LicenseFilter,
  selectedFleet: FleetFilter,
  selectedApproval: ApprovalFilter,
  selectedEligibility: EligibilityFilter,
  selectedFacet: ForwardedFacetFilter,
): BoardActionContext {
  let href = buildDispatchHref({
    board,
    product: selectedProduct,
    timing: selectedTiming,
    license: selectedLicense,
    fleet: selectedFleet,
    approval: selectedApproval,
    eligibility: selectedEligibility,
    facet: selectedFacet,
  });
  let external = false;

  switch (action.action) {
    case "jump_approval_request":
      href = "/approval-requests";
      break;
    case "createIncidentFromDispatchException":
    case "escalate_incident":
      href = "/incidents";
      break;
    case "inspect_adapter":
      href = buildPlatformAdminHref("/adapter-registry");
      external = true;
      break;
    default:
      break;
  }

  return {
    action: action.action,
    href,
    label: resolveActionLabel(action.action, locale),
    riskLevel: action.riskLevel,
    disabled: !action.enabled,
    disabledReason: action.disabledReasonCode,
    external,
  };
}

function buildActionContexts(
  board: DispatchBoard,
  record: BoardRecord,
  locale: Locale,
  selectedProduct: OwnedProductFilter,
  selectedTiming: TimingFilter,
  selectedLicense: LicenseFilter,
  selectedFleet: FleetFilter,
  selectedApproval: ApprovalFilter,
  selectedEligibility: EligibilityFilter,
  selectedFacet: ForwardedFacetFilter,
): BoardActionContext[] {
  const semantics = resolveQueueSemantics(record, locale);
  return normalizeActions(record)
    .filter((action) => {
      if (semantics.isStatutoryRefusal) {
        if (isForbiddenStatutoryOverrideAction(action.action)) {
          return false;
        }
      }
      return true;
    })
    .map((action) => {
      const href = buildActionHref(
        board,
        record,
        action,
        selectedProduct,
        selectedTiming,
        selectedLicense,
        selectedFleet,
        selectedApproval,
        selectedEligibility,
        selectedFacet,
      );
      const external =
        action.action === "inspect_adapter" ||
        href.startsWith("http://") ||
        href.startsWith("https://");

      return {
        action: action.action,
        href,
        label: resolveActionLabel(action.action, locale),
        riskLevel: action.riskLevel,
        disabled: !action.enabled,
        disabledReason: action.disabledReasonCode,
        external,
      };
    });
}

function deriveBoardEmptyState({
  board,
  explicit,
  failed,
  baseCount,
  visibleCount,
  filtered,
  identity,
  adapterHealth,
}: {
  board: DispatchBoard;
  explicit?: EmptyStateEnvelope | null | undefined;
  failed: boolean;
  baseCount: number;
  visibleCount: number;
  filtered: boolean;
  identity: IdentityContext | null;
  adapterHealth: AdapterHealthRecord[];
}): EmptyStateEnvelope | null {
  if (visibleCount > 0) {
    return null;
  }
  if (explicit) {
    return explicit;
  }
  if (failed) {
    return { reason: "fetch_failed", messageCode: "dispatch.fetch_failed" };
  }
  if (
    board === "governance" &&
    identity &&
    Array.isArray(identity.roles) &&
    !identity.roles.includes("ops_dispatcher") &&
    !identity.roles.includes("ops_manager")
  ) {
    return {
      reason: "permission_denied",
      messageCode: "dispatch.permission_denied",
    };
  }
  if (filtered && baseCount > 0) {
    return { reason: "filtered_empty", messageCode: "dispatch.filtered_empty" };
  }
  if (board === "forwarded" && adapterHealth.length === 0 && baseCount === 0) {
    return {
      reason: "not_provisioned",
      messageCode: "dispatch.forwarded.not_provisioned",
    };
  }
  if (
    board === "forwarded" &&
    adapterHealth.length > 0 &&
    adapterHealth.every((item) => item.status === "down")
  ) {
    return {
      reason: "external_unavailable",
      messageCode: "dispatch.forwarded.external_unavailable",
    };
  }
  return { reason: "no_data", messageCode: "dispatch.no_data" };
}

function renderEmptyState(
  board: DispatchBoard,
  emptyState: EmptyStateEnvelope,
  locale: Locale,
  selectedProduct: OwnedProductFilter,
  selectedTiming: TimingFilter,
  selectedLicense: LicenseFilter,
  selectedFleet: FleetFilter,
  selectedApproval: ApprovalFilter,
  selectedEligibility: EligibilityFilter,
  selectedFacet: ForwardedFacetFilter,
) {
  const mapping: Record<
    EmptyReason,
    { title: string; description: string; tone: CanvasTone; icon: string }
  > = {
    no_data: {
      title: t("dispatch.empty.noData.title", locale),
      description: t("dispatch.empty.noData.description", locale),
      tone: "neutral",
      icon: "○",
    },
    not_provisioned: {
      title: t("dispatch.empty.notProvisioned.title", locale),
      description: t("dispatch.empty.notProvisioned.description", locale),
      tone: "info",
      icon: "◇",
    },
    fetch_failed: {
      title: t("dispatch.empty.fetchFailed.title", locale),
      description: t("dispatch.empty.fetchFailed.description", locale),
      tone: "danger",
      icon: "!",
    },
    permission_denied: {
      title: t("dispatch.empty.permissionDenied.title", locale),
      description: t("dispatch.empty.permissionDenied.description", locale),
      tone: "warn",
      icon: "⛔",
    },
    external_unavailable: {
      title: t("dispatch.empty.externalUnavailable.title", locale),
      description: t("dispatch.empty.externalUnavailable.description", locale),
      tone: "warn",
      icon: "↗",
    },
    driver_not_eligible: {
      title: t("dispatch.empty.driverNotEligible.title", locale),
      description: t("dispatch.empty.driverNotEligible.description", locale),
      tone: "info",
      icon: "△",
    },
    filtered_empty: {
      title: t("dispatch.empty.filteredEmpty.title", locale),
      description: t("dispatch.empty.filteredEmpty.description", locale),
      tone: "accent",
      icon: "⌕",
    },
  };

  const contentKey = (
    emptyState.reason in mapping ? emptyState.reason : "no_data"
  ) as keyof typeof mapping;
  const content: (typeof mapping)[keyof typeof mapping] = mapping[contentKey]!;
  const tone =
    content.tone === "danger"
      ? "danger"
      : content.tone === "warn"
        ? "warn"
        : content.tone;
  const nextAction = emptyState.nextAction
    ? buildEmptyStateActionContext(
        board,
        emptyState.nextAction,
        locale,
        selectedProduct,
        selectedTiming,
        selectedLicense,
        selectedFleet,
        selectedApproval,
        selectedEligibility,
        selectedFacet,
      )
    : null;
  return (
    <CanvasEmptyPanel
      theme={theme}
      tone={tone}
      density="compact"
      title={content.title}
      description={`${content.description} ${
        board === "forwarded" && emptyState.reason === "external_unavailable"
          ? t("dispatch.empty.externalUnavailableSuffix", locale)
          : ""
      }`.trim()}
      icon={<span style={{ fontSize: 22 }}>{content.icon}</span>}
      actions={
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {nextAction ? renderActionButton(nextAction, locale) : null}
          <Link
            href={buildDispatchHref({
              board,
              product: selectedProduct,
              timing: selectedTiming,
              license: selectedLicense,
              fleet: selectedFleet,
              approval: selectedApproval,
              eligibility: selectedEligibility,
              facet: selectedFacet,
            })}
            style={{ textDecoration: "none" }}
          >
            <Btn theme={theme} variant="secondary" icon="arrow">
              {t("dispatch.empty.resetBoard", locale)}
            </Btn>
          </Link>
        </div>
      }
    />
  );
}

function pickPrimaryAction(
  actions: BoardActionContext[],
  candidates: string[],
): BoardActionContext | null {
  for (const candidate of candidates) {
    const matched = actions.find((action) => action.action === candidate);
    if (matched && !matched.disabled) {
      return matched;
    }
  }
  return actions.find((action) => !action.disabled) ?? null;
}

function renderActionButton(
  action: BoardActionContext | null,
  locale: Locale,
  fallbackLabel?: string,
) {
  if (!action) {
    return fallbackLabel ? (
      <Btn theme={theme} variant="secondary">
        {fallbackLabel}
      </Btn>
    ) : null;
  }

  if (action.disabled) {
    return (
      <Btn theme={theme} variant="secondary">
        {action.label ??
          fallbackLabel ??
          t("dispatch.action.unavailable", locale)}
      </Btn>
    );
  }

  return (
    <Link
      href={action.href}
      target={action.external ? "_blank" : undefined}
      rel={action.external ? "noreferrer" : undefined}
      style={{ textDecoration: "none" }}
    >
      <Btn
        theme={theme}
        variant={action.riskLevel === "high" ? "primary" : "secondary"}
        icon={action.external ? "ext" : "arrow"}
      >
        {action.label ?? t("dispatch.action.open", locale)}
      </Btn>
    </Link>
  );
}

function getOpsMapStatusStyle(status: OpsMapProviderStatus): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "5px 10px",
    border: "1px solid currentColor",
    fontSize: 11,
    fontWeight: 700,
  };

  switch (status) {
    case "ready":
      return { ...base, color: theme.success, background: theme.successBg };
    case "degraded_projection":
      return { ...base, color: theme.warn, background: theme.warnBg };
    case "no_spatial_data":
      return { ...base, color: theme.neutral, background: theme.neutralBg };
  }
}

function getOpsMapPointVisual(kind: OpsMapPointKind): {
  background: string;
  label: string;
} {
  switch (kind) {
    case "pickup":
      return { background: theme.info, label: "P" };
    case "dropoff":
      return { background: theme.success, label: "D" };
    case "candidate":
      return { background: theme.warn, label: "C" };
  }
}

function renderOpsMapRouteLine(
  route: OpsMapRouteSegment,
  viewport: OpsMapTileViewport,
) {
  const pickup = projectOpsMapPointToViewport(
    {
      key: `${route.key}:pickup`,
      kind: "pickup",
      label: route.label,
      lat: route.pickup.lat,
      lng: route.pickup.lng,
    },
    viewport,
  );
  const dropoff = projectOpsMapPointToViewport(
    {
      key: `${route.key}:dropoff`,
      kind: "dropoff",
      label: route.label,
      lat: route.dropoff.lat,
      lng: route.dropoff.lng,
    },
    viewport,
  );

  if (!pickup.visible && !dropoff.visible) {
    return null;
  }

  return (
    <line
      key={route.key}
      className="spatial-route-line"
      data-ops-map-job-id={route.jobId ?? ""}
      data-ops-map-order-id={route.orderId}
      data-ops-map-route-line={route.key}
      x1={pickup.leftPct}
      x2={dropoff.leftPct}
      y1={pickup.topPct}
      y2={dropoff.topPct}
      stroke={theme.info}
      strokeDasharray="8 7"
      strokeLinecap="round"
      strokeWidth="3"
      vectorEffect="non-scaling-stroke"
    />
  );
}

function renderSpatialOverlayGroup(label: string, values: string[]): ReactNode {
  if (values.length === 0) {
    return null;
  }

  return (
    <div style={spatialOverlayGroupStyle}>
      <span style={spatialOverlayLabelStyle}>{label}</span>
      {values.map((value) => (
        <span key={value} style={spatialOverlayChipStyle}>
          {value}
        </span>
      ))}
    </div>
  );
}

function getOrderStopPolicyCodes(order: OwnedOrderRecord) {
  return (
    order.spatialAudit?.serviceAreaEvaluation?.stops.flatMap(
      (stop) => stop.policyCodes,
    ) ?? []
  );
}

function orderMatchesMapFilters(
  order: OwnedOrderRecord,
  serviceArea: string,
  policyCode: string,
) {
  const serviceAreaMatches =
    serviceArea === "all" ||
    (order.spatialAudit?.serviceAreaCodes ?? []).includes(serviceArea);
  const policyMatches =
    policyCode === "all" || getOrderStopPolicyCodes(order).includes(policyCode);

  return serviceAreaMatches && policyMatches;
}

function renderDispatchSpatialBoard({
  model,
  viewport,
  locale,
  tileUrlTemplateConfigured,
  serviceAreaOptions,
  policyCodeOptions,
  selectedServiceArea,
  selectedPolicyCode,
  buildMapHref,
  resetMapViewHref,
}: {
  model: OpsMapBoardModel;
  viewport: OpsMapTileViewport | null;
  locale: Locale;
  tileUrlTemplateConfigured: boolean;
  serviceAreaOptions: string[];
  policyCodeOptions: string[];
  selectedServiceArea: string;
  selectedPolicyCode: string;
  buildMapHref: (
    overrides: Partial<{
      mapZoom: number;
      mapLat: number;
      mapLng: number;
      mapServiceArea: string;
      mapPolicyCode: string;
    }>,
  ) => string;
  resetMapViewHref: string;
}) {
  const overlayCount =
    model.overlays.serviceAreaCodes.length +
    model.overlays.policyCodes.length +
    model.overlays.reasonCodes.length +
    model.overlays.geometryVersionRefs.length;
  const hasOverlays = overlayCount > 0;
  const axisBadgeStyle: CSSProperties = {
    position: "absolute",
    zIndex: 4,
    left: 12,
    padding: "5px 8px",
    borderRadius: 999,
    background: theme.surfaceHi,
    color: theme.text,
    fontSize: 11,
    border: `1px solid ${theme.border}`,
  };
  const panTargets = viewport
    ? {
        north: shiftOpsMapCenter(viewport, "north"),
        south: shiftOpsMapCenter(viewport, "south"),
        west: shiftOpsMapCenter(viewport, "west"),
        east: shiftOpsMapCenter(viewport, "east"),
      }
    : null;

  return (
    <section
      className="spatial-board"
      style={spatialBoardStyle}
      data-ops-map-fallback-reason={model.fallbackReason}
      data-ops-map-policy-codes={model.overlays.policyCodes.join("|")}
      data-ops-map-provider-status={model.providerStatus}
      data-ops-map-route-count={model.routeSegments.length}
      data-ops-map-service-areas={model.overlays.serviceAreaCodes.join("|")}
    >
      <div style={spatialBoardHeaderStyle}>
        <div style={{ display: "grid", gap: 4 }}>
          <strong style={{ color: theme.text, fontSize: 16 }}>
            {t("dispatch.workflow.map.title", locale)}
          </strong>
          <span style={{ color: theme.textMuted, fontSize: 12 }}>
            {t("dispatch.workflow.map.subtitle", locale)}
          </span>
        </div>
        <div style={spatialBoardStatsStyle}>
          {[
            [
              model.ordersWithPickupCoordinates,
              t("dispatch.workflow.map.ordersWithCoords", locale),
            ],
            [
              model.candidateSupplyPoints,
              t("dispatch.workflow.map.supplyPoints", locale),
            ],
            [
              model.staleCandidatePoints,
              t("dispatch.workflow.map.staleSupply", locale),
            ],
            [
              model.noLocationCandidateCount,
              t("dispatch.workflow.map.noLocationSupply", locale),
            ],
          ].map(([value, label]) => (
            <div key={label} style={spatialStatCardStyle}>
              <strong style={{ color: theme.text, fontSize: 18 }}>
                {value}
              </strong>
              <span style={{ color: theme.textMuted, fontSize: 11 }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={spatialBoardNoteStyle}>
        <span>{t("dispatch.workflow.map.projectionNote", locale)}</span>
        <span
          className={`spatial-map-status spatial-map-status-${model.providerStatus}`}
          style={getOpsMapStatusStyle(model.providerStatus)}
        >
          {t(`dispatch.workflow.map.status.${model.providerStatus}`, locale)}
        </span>
      </div>

      {hasOverlays ? (
        <div
          style={spatialOverlayStripStyle}
          data-ops-map-overlay-count={overlayCount}
        >
          {renderSpatialOverlayGroup(
            t("dispatch.workflow.map.overlay.serviceAreas", locale),
            model.overlays.serviceAreaCodes,
          )}
          {renderSpatialOverlayGroup(
            t("dispatch.workflow.map.overlay.stopPolicies", locale),
            model.overlays.policyCodes,
          )}
          {renderSpatialOverlayGroup(
            t("dispatch.workflow.map.overlay.reasonCodes", locale),
            model.overlays.reasonCodes,
          )}
          {renderSpatialOverlayGroup(
            t("dispatch.workflow.map.overlay.geometryRefs", locale),
            model.overlays.geometryVersionRefs,
          )}
        </div>
      ) : null}

      <div
        style={filterRowStyle}
        data-ops-map-service-area-filter={selectedServiceArea}
        data-ops-map-policy-filter={selectedPolicyCode}
      >
        {["all", ...serviceAreaOptions].map((serviceArea) => (
          <Link
            key={`service-area:${serviceArea}`}
            href={buildMapHref({ mapServiceArea: serviceArea })}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <Pill
              theme={theme}
              tone={selectedServiceArea === serviceArea ? "accent" : "neutral"}
              dot={serviceArea !== "all"}
            >
              {serviceArea === "all"
                ? t("dispatch.workflow.map.overlay.serviceAreas", locale)
                : serviceArea}
            </Pill>
          </Link>
        ))}
        {["all", ...policyCodeOptions].map((policyCode) => (
          <Link
            key={`policy:${policyCode}`}
            href={buildMapHref({ mapPolicyCode: policyCode })}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <Pill
              theme={theme}
              tone={selectedPolicyCode === policyCode ? "accent" : "neutral"}
              dot={policyCode !== "all"}
            >
              {policyCode === "all"
                ? t("dispatch.workflow.map.overlay.stopPolicies", locale)
                : policyCode}
            </Pill>
          </Link>
        ))}
      </div>

      {viewport ? (
        <div style={spatialMapShellStyle}>
          <div
            style={spatialMapStyle}
            data-ops-map-center-lat={viewport.centerLat.toFixed(6)}
            data-ops-map-center-lng={viewport.centerLng.toFixed(6)}
            data-ops-map-render-mode={
              viewport.tiles.length > 0 ? "tile" : "tile_fallback"
            }
            data-ops-map-tile-template={
              tileUrlTemplateConfigured ? "configured" : "missing"
            }
            data-ops-map-zoom={viewport.zoom}
          >
            {viewport.tiles.length > 0 ? (
              viewport.tiles.map((tile) => (
                <img
                  key={tile.key}
                  alt=""
                  aria-hidden="true"
                  src={tile.src}
                  style={{
                    ...spatialTileStyle,
                    left: `${(tile.leftPx / viewport.width) * 100}%`,
                    top: `${(tile.topPx / viewport.height) * 100}%`,
                  }}
                />
              ))
            ) : (
              <div style={spatialMapFallbackStyle}>
                {t("dispatch.workflow.map.tileFallback", locale)}
              </div>
            )}
            <GoogleMapBaseLayer
              ariaLabel={t("dispatch.workflow.map.title", locale)}
              center={{
                lat: viewport.centerLat,
                lng: viewport.centerLng,
              }}
              zoom={viewport.zoom}
            />
            {model.routeSegments.length > 0 ? (
              <svg
                aria-hidden="true"
                data-ops-map-route-layer="true"
                focusable="false"
                style={spatialRouteOverlayStyle}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {model.routeSegments.map((route) =>
                  renderOpsMapRouteLine(route, viewport),
                )}
              </svg>
            ) : null}
            {model.points.map((point) => {
              const visual = getOpsMapPointVisual(point.kind);
              const coords = projectOpsMapPointToViewport(point, viewport);
              const stale =
                point.freshness === "stale" ||
                point.freshness === "low_accuracy";
              if (!coords.visible) {
                return null;
              }

              return (
                <span
                  key={point.key}
                  className={`spatial-point spatial-point-${point.kind}${
                    stale ? " spatial-point-stale" : ""
                  }`}
                  data-ops-map-freshness={point.freshness ?? "governed"}
                  data-ops-map-job-id={point.jobId ?? ""}
                  data-ops-map-order-id={point.orderId ?? ""}
                  data-ops-map-point-kind={point.kind}
                  style={{
                    ...spatialPointBaseStyle,
                    left: `${coords.leftPct}%`,
                    top: `${coords.topPct}%`,
                    background: visual.background,
                    opacity: stale ? 0.72 : 1,
                  }}
                  title={`${point.label} · ${point.subtitle ?? ""}`}
                >
                  {visual.label}
                </span>
              );
            })}
            <div style={{ ...axisBadgeStyle, top: 12 }}>
              {t("dispatch.workflow.map.viewport", locale, {
                zoom: viewport.zoom,
                lat: viewport.centerLat.toFixed(4),
                lng: viewport.centerLng.toFixed(4),
              })}
            </div>
            <div
              style={{
                ...axisBadgeStyle,
                bottom: 12,
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              {panTargets ? (
                <>
                  <Link
                    href={buildMapHref({
                      mapLat: panTargets.north.lat,
                      mapLng: panTargets.north.lng,
                      mapZoom: viewport.zoom,
                    })}
                    style={spatialMapControlStyle}
                  >
                    {t("dispatch.workflow.map.panNorth", locale)}
                  </Link>
                  <Link
                    href={buildMapHref({
                      mapLat: panTargets.south.lat,
                      mapLng: panTargets.south.lng,
                      mapZoom: viewport.zoom,
                    })}
                    style={spatialMapControlStyle}
                  >
                    {t("dispatch.workflow.map.panSouth", locale)}
                  </Link>
                  <Link
                    href={buildMapHref({
                      mapLat: panTargets.west.lat,
                      mapLng: panTargets.west.lng,
                      mapZoom: viewport.zoom,
                    })}
                    style={spatialMapControlStyle}
                  >
                    {t("dispatch.workflow.map.panWest", locale)}
                  </Link>
                  <Link
                    href={buildMapHref({
                      mapLat: panTargets.east.lat,
                      mapLng: panTargets.east.lng,
                      mapZoom: viewport.zoom,
                    })}
                    style={spatialMapControlStyle}
                  >
                    {t("dispatch.workflow.map.panEast", locale)}
                  </Link>
                </>
              ) : null}
            </div>
          </div>

          <div style={spatialLegendStyle}>
            <div style={spatialMapControlsStyle}>
              <Link
                href={buildMapHref({
                  mapLat: viewport.centerLat,
                  mapLng: viewport.centerLng,
                  mapZoom: viewport.zoom + 1,
                })}
                style={spatialMapControlStyle}
              >
                <Pill theme={theme} tone="accent">
                  {t("dispatch.workflow.map.zoomIn", locale)}
                </Pill>
              </Link>
              <Link
                href={buildMapHref({
                  mapLat: viewport.centerLat,
                  mapLng: viewport.centerLng,
                  mapZoom: viewport.zoom - 1,
                })}
                style={spatialMapControlStyle}
              >
                <Pill theme={theme} tone="neutral">
                  {t("dispatch.workflow.map.zoomOut", locale)}
                </Pill>
              </Link>
              <Link href={resetMapViewHref} style={spatialMapControlStyle}>
                <Pill theme={theme} tone="neutral">
                  {t("dispatch.workflow.map.resetView", locale)}
                </Pill>
              </Link>
            </div>
            <strong style={{ color: theme.text }}>
              {t("dispatch.workflow.map.legend", locale)}
            </strong>
            {model.routeSegments.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: theme.text,
                  fontSize: 12,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    width: 28,
                    borderTop: `3px dashed ${theme.info}`,
                  }}
                />
                {t("dispatch.workflow.map.legend.route", locale)}
              </div>
            ) : null}
            {(["pickup", "dropoff", "candidate"] as OpsMapPointKind[]).map(
              (kind) => {
                const visual = getOpsMapPointVisual(kind);
                return (
                  <div
                    key={kind}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      color: theme.text,
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: visual.background,
                        display: "inline-block",
                      }}
                    />
                    <span>
                      {t(`dispatch.workflow.map.legend.${kind}`, locale)}
                    </span>
                  </div>
                );
              },
            )}
            <div style={{ color: theme.textMuted, fontSize: 12 }}>
              {t("dispatch.workflow.map.legend.stale", locale)}
            </div>
            <div style={{ color: theme.textMuted, fontSize: 12 }}>
              {t("dispatch.workflow.map.legend.noLocation", locale)}
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: 14,
            borderRadius: 14,
            background: theme.surfaceHi,
            border: `1px dashed ${theme.infoBorder}`,
            display: "grid",
            gap: 4,
            color: theme.text,
          }}
        >
          <strong>{t("dispatch.workflow.map.emptyTitle", locale)}</strong>
          <span style={{ fontSize: 12 }}>
            {t("dispatch.workflow.map.emptyBody", locale)}
          </span>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          color: theme.textMuted,
          fontSize: 12,
        }}
      >
        <span>
          {t("dispatch.workflow.map.missingCoords", locale, {
            count: model.ordersMissingPickupCoordinates,
          })}
        </span>
        <span>{t("dispatch.workflow.map.autoLoadHint", locale)}</span>
      </div>
    </section>
  );
}

function renderBoardSignalBanner({
  board,
  locale,
  selectedRecord,
  selectedActions,
  degradedAdapters,
  boardCount,
  visibleCount,
}: {
  board: DispatchBoard;
  locale: Locale;
  selectedRecord: BoardRecord | null;
  selectedActions: BoardActionContext[];
  degradedAdapters: AdapterHealthRecord[];
  boardCount: number;
  visibleCount: number;
}) {
  if (board === "forwarded" && degradedAdapters.length > 0) {
    const inspectAdapter =
      pickPrimaryAction(selectedActions, ["inspect_adapter"]) ??
      ({
        action: "inspect_adapter",
        href: buildPlatformAdminHref("/adapter-registry"),
        label: t("dispatch.action.inspectAdapter", locale),
        riskLevel: "low",
        disabled: false,
        external: true,
      } satisfies BoardActionContext);
    return (
      <Banner
        theme={theme}
        tone="warn"
        icon="warn"
        title={t("dispatch.banner.forwardedDegraded.title", locale, {
          platform: formatDispatchCode(
            locale,
            degradedAdapters[0]?.platformCode,
            "Adapter",
          ),
        })}
        body={t("dispatch.banner.forwardedDegraded.body", locale, {
          visible: visibleCount,
          total: boardCount,
        })}
        actions={renderActionButton(inspectAdapter, locale)}
      />
    );
  }

  if (!selectedRecord) {
    return null;
  }

  if ("mirrorOrderId" in selectedRecord) {
    const primary =
      pickPrimaryAction(selectedActions, [
        "complete_forwarder_reconciliation",
        "engage_manual_fallback",
        "inspect_adapter",
        "sync_forwarded_order_status",
      ]) ?? null;
    if (!primary) {
      return null;
    }
    return (
      <Banner
        theme={theme}
        tone={selectedRecord.status === "sync_failed" ? "danger" : "warn"}
        icon="warn"
        title={`${selectedRecord.mirrorOrderId} · ${formatDispatchCode(locale, selectedRecord.platformCode)}`}
        body={t("dispatch.banner.forwardedSelected.body", locale, {
          status: formatDispatchCode(locale, selectedRecord.status),
          externalOrderId: selectedRecord.externalOrderId,
        })}
        actions={renderActionButton(primary, locale)}
      />
    );
  }

  const title = `${selectedRecord.orderNo} · ${getTenantLabel(selectedRecord)}`;
  const selectedSem = resolveQueueSemantics(selectedRecord, locale);
  if (selectedSem.isStatutoryRefusal) {
    return (
      <Banner
        theme={theme}
        tone="danger"
        icon="warn"
        title={t("dispatch.denial.statutoryRefusalTitle", locale)}
        body={`${selectedSem.refusalCopy} (${t("dispatch.denial.noOverrideAllowed", locale)})`}
      />
    );
  }

  if (board === "governance") {
    return (
      <Banner
        theme={theme}
        tone="warn"
        icon="warn"
        title={t("dispatch.banner.governance.title", locale)}
        body={t("dispatch.banner.governance.body", locale, { title })}
        actions={renderActionButton(
          pickPrimaryAction(selectedActions, ["jump_approval_request"]),
          locale,
        )}
      />
    );
  }

  if (board === "exception") {
    const holdReason = formatDispatchCode(
      locale,
      selectedRecord.exceptionHold?.reasonCode,
      t("dispatch.banner.exception.unknownReason", locale),
    );
    return (
      <Banner
        theme={theme}
        tone="warn"
        icon="warn"
        title={t("dispatch.banner.exception.title", locale)}
        body={t("dispatch.banner.exception.body", locale, {
          title,
          reason: holdReason,
        })}
        actions={renderActionButton(
          pickPrimaryAction(selectedActions, [
            "resolve_exception_hold",
            "resolve_hold",
            "createIncidentFromDispatchException",
            "escalate_incident",
          ]),
          locale,
        )}
      />
    );
  }

  if (board === "no_supply") {
    return (
      <Banner
        theme={theme}
        tone="danger"
        icon="warn"
        title={t("dispatch.banner.noSupply.title", locale)}
        body={t("dispatch.banner.noSupply.body", locale, {
          title,
          count: selectedRecord.dispatchAttemptCount,
          reason: formatDispatchCode(
            locale,
            selectedRecord.lastDispatchFailureReason ?? "unknown",
          ),
        })}
        actions={renderActionButton(
          pickPrimaryAction(selectedActions, [
            "extend_search",
            "resolve_no_supply",
            "createIncidentFromDispatchException",
            "escalate_incident",
          ]),
          locale,
        )}
      />
    );
  }

  const primary = pickPrimaryAction(selectedActions, [
    "assign",
    "assign_dispatch",
    "dispatch_order",
    "release_driver",
    "release",
    "redispatch",
    "cancel_owned_order",
    "cancel",
  ]);
  if (!primary) {
    return null;
  }

  return (
    <Banner
      theme={theme}
      tone={board === "assigned" ? "info" : "warn"}
      icon="warn"
      title={title}
      body={t(
        board === "assigned"
          ? "dispatch.banner.selected.assigned"
          : "dispatch.banner.selected.ready",
        locale,
      )}
      actions={renderActionButton(primary, locale)}
    />
  );
}

function renderActionList(actions: BoardActionContext[], locale: Locale) {
  if (actions.length === 0) {
    return (
      <CanvasEmptyPanel
        theme={theme}
        density="compact"
        title={t("dispatch.actions.emptyTitle", locale)}
        description={t("dispatch.actions.emptyBody", locale)}
      />
    );
  }

  return (
    <div style={actionGridStyle}>
      {actions.map((action) => {
        const content = (
          <div
            style={{
              minHeight: 94,
              padding: 12,
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
              background: theme.surfaceLo,
              display: "grid",
              gap: 8,
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
              <strong style={{ fontSize: 13 }}>{action.label}</strong>
              <Pill
                theme={theme}
                tone={actionTone(action.riskLevel, action.disabled)}
                dot={!action.disabled}
              >
                {formatDispatchCode(locale, action.riskLevel)}
              </Pill>
            </div>
            <div
              style={{ color: theme.textDim, fontSize: 12, lineHeight: 1.45 }}
            >
              {action.disabled
                ? formatDispatchCode(
                    locale,
                    action.disabledReason ?? "disabled",
                  )
                : t("dispatch.actions.availableActionsCta", locale)}
            </div>
          </div>
        );

        if (action.disabled) {
          return <div key={`${action.href}-${action.label}`}>{content}</div>;
        }

        return (
          <Link
            key={`${action.href}-${action.label}`}
            href={action.href}
            target={action.external ? "_blank" : undefined}
            rel={action.external ? "noreferrer" : undefined}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}

function renderInlineActionPills(
  actions: BoardActionContext[],
  locale: Locale,
) {
  if (actions.length === 0) {
    return (
      <span style={{ color: theme.textDim, fontSize: 11 }}>
        {t("dispatch.actions.none", locale)}
      </span>
    );
  }

  const visible = actions.slice(0, 3);
  const overflowCount = actions.length - visible.length;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {visible.map((action) => {
        const pill = (
          <Pill
            theme={theme}
            tone={actionTone(action.riskLevel, action.disabled)}
            dot={!action.disabled}
          >
            {action.label}
          </Pill>
        );

        if (action.disabled) {
          return <span key={`${action.href}-${action.label}`}>{pill}</span>;
        }

        return (
          <Link
            key={`${action.href}-${action.label}`}
            href={action.href}
            target={action.external ? "_blank" : undefined}
            rel={action.external ? "noreferrer" : undefined}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            {pill}
          </Link>
        );
      })}
      {overflowCount > 0 ? (
        <Pill theme={theme} tone="neutral">
          +{overflowCount}
        </Pill>
      ) : null}
    </div>
  );
}

function freshnessBanner(refresh: UiRefreshMetadata, locale: Locale) {
  if (refresh.dataFreshness === "fresh") {
    return null;
  }
  const tone = refresh.dataFreshness === "degraded" ? "warn" : "info";
  const title =
    refresh.dataFreshness === "stale"
      ? t("dispatch.freshness.stale", locale)
      : t("dispatch.freshness.degraded", locale);
  return (
    <Banner
      theme={theme}
      tone={tone}
      icon="warn"
      title={title}
      body={t("dispatch.freshness.body", locale, {
        generatedAt: formatDateTime(locale, refresh.generatedAt),
        source: formatDispatchCode(locale, refresh.source),
      })}
    />
  );
}

function healthBanner(health: UiHealthEnvelope | null, locale: Locale) {
  if (!health || health.status === "healthy") {
    return null;
  }
  const firstService = health.degradedServices[0];
  return (
    <Banner
      theme={theme}
      tone={health.status === "down" ? "danger" : "warn"}
      icon="warn"
      title={
        health.status === "down"
          ? t("dispatch.health.down", locale)
          : t("dispatch.health.degraded", locale)
      }
      body={
        firstService
          ? `${formatDispatchCode(locale, firstService.service)} · ${formatDispatchCode(locale, firstService.impact)}`
          : formatDateTime(locale, health.lastCheckedAt)
      }
    />
  );
}

export default async function DispatchPage({
  searchParams,
}: DispatchPageProps) {
  const [client, locale, resolvedSearchParams] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
    (searchParams ??
      Promise.resolve(
        {} as Record<string, string | string[] | undefined>,
      )) as Promise<Record<string, string | string[] | undefined>>,
  ]);

  const board = resolveBoard(firstParam(resolvedSearchParams.board));
  const selectedProduct =
    firstParam(resolvedSearchParams.product) ??
    firstParam(resolvedSearchParams.service) ??
    "all";
  const selectedTiming = (firstParam(resolvedSearchParams.timing) ??
    "all") as TimingFilter;
  const selectedLicense = (firstParam(resolvedSearchParams.license) ??
    "all") as LicenseFilter;
  const selectedFleet = firstParam(resolvedSearchParams.fleet) ?? "all";
  const selectedApproval = firstParam(resolvedSearchParams.approval) ?? "all";
  const selectedEligibility =
    firstParam(resolvedSearchParams.eligibility) ?? "all";
  const selectedFacet = (firstParam(resolvedSearchParams.facet) ??
    "all") as ForwardedFacetFilter;
  const focusWorkItemId = firstParam(resolvedSearchParams.workItemId) ?? "";
  const selectedMapServiceArea =
    firstParam(resolvedSearchParams.mapServiceArea) ?? "all";
  const selectedMapPolicyCode =
    firstParam(resolvedSearchParams.mapPolicyCode) ?? "all";
  const requestedMapLat = finiteNumberParam(resolvedSearchParams.mapLat);
  const requestedMapLng = finiteNumberParam(resolvedSearchParams.mapLng);
  const requestedMapZoom = finiteNumberParam(resolvedSearchParams.mapZoom);
  const mapTileUrlTemplate = resolveOpsMapTileUrlTemplate(process.env);

  const [
    ownedOrdersResult,
    dispatchJobsResult,
    driverTasksResult,
    driversResult,
    forwardedOrdersResult,
    adapterHealthResult,
    reconciliationIssuesResult,
    reviewQueueResult,
    identityResult,
    pageHealth,
  ] = await Promise.all([
    loadListRuntime<RuntimeOwnedOrder>(client, "/api/orders"),
    loadListRuntime<RuntimeDispatchJob>(client, "/api/dispatch/tasks"),
    loadListRuntime<DriverTaskRecord>(client, "/api/driver/tasks"),
    loadListRuntime<DriverRegistryRecord>(client, "/api/drivers"),
    loadListRuntime<RuntimeForwardedOrder>(client, "/api/forwarder/orders"),
    loadListRuntime<AdapterHealthRecord>(
      client,
      "/api/forwarder/adapters/health",
    ),
    loadListRuntime<ForwarderReconciliationIssue>(
      client,
      "/api/forwarder/reconciliation-issues",
    ),
    loadListRuntime<PartnerEligibilityReviewQueueItem>(
      client,
      "/api/ops/partner/eligibility/reviews",
    ),
    client
      .get<IdentityContext>("/api/identity/context")
      .catch(() => null as IdentityContext | null),
    loadHealthPayload(),
  ]);

  const ownedOrders = ownedOrdersResult.items;
  const dispatchJobs = dispatchJobsResult.items;
  const driverTasks = driverTasksResult.items;
  const drivers = driversResult.items;
  const forwardedOrders = forwardedOrdersResult.items;
  const adapterHealth = adapterHealthResult.items;
  const reconciliationIssues = reconciliationIssuesResult.items;
  const reviewQueue = reviewQueueResult.items;

  const jobByOrderId = new Map<string, RuntimeDispatchJob>(
    dispatchJobs.map((job: RuntimeDispatchJob) => [job.orderId, job] as const),
  );
  const tasksByOrderId = new Map<string, DriverTaskRecord[]>();
  const driverById = new Map<string, DriverRegistryRecord>(
    drivers.map(
      (driver: DriverRegistryRecord) => [driver.driverId, driver] as const,
    ),
  );
  for (const task of driverTasks) {
    const existing = tasksByOrderId.get(task.orderId);
    if (existing) {
      existing.push(task);
    } else {
      tasksByOrderId.set(task.orderId, [task]);
    }
  }

  const sortedOwnedOrders = [...ownedOrders].sort((left, right) => {
    const leftBoard = getOwnedBoard(left, jobByOrderId.get(left.orderId));
    const rightBoard = getOwnedBoard(right, jobByOrderId.get(right.orderId));
    const leftPriority = BOARD_PRIORITY[leftBoard];
    const rightPriority = BOARD_PRIORITY[rightBoard];
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });

  const boardCounts = {
    ready: sortedOwnedOrders.filter(
      (order) =>
        getOwnedBoard(order, jobByOrderId.get(order.orderId)) === "ready",
    ).length,
    assigned: sortedOwnedOrders.filter(
      (order) =>
        getOwnedBoard(order, jobByOrderId.get(order.orderId)) === "assigned",
    ).length,
    exception: sortedOwnedOrders.filter(
      (order) =>
        getOwnedBoard(order, jobByOrderId.get(order.orderId)) === "exception",
    ).length,
    no_supply: sortedOwnedOrders.filter(
      (order) =>
        getOwnedBoard(order, jobByOrderId.get(order.orderId)) === "no_supply",
    ).length,
    governance: sortedOwnedOrders.filter(
      (order) =>
        getOwnedBoard(order, jobByOrderId.get(order.orderId)) === "governance",
    ).length,
    forwarded: forwardedOrders.length,
  };

  const preLicenseOwnedByBoard = sortedOwnedOrders.filter((order) => {
    const orderBoard = getOwnedBoard(order, jobByOrderId.get(order.orderId));
    if (orderBoard !== board) {
      return false;
    }
    if (board !== "forwarded" && selectedProduct !== "all") {
      if (getServiceProductValue(order) !== selectedProduct) {
        return false;
      }
    }
    if (selectedTiming !== "all" && getTimingValue(order) !== selectedTiming) {
      return false;
    }
    if (selectedFleet !== "all" && getFleetValue(order) !== selectedFleet) {
      return false;
    }
    if (
      selectedApproval !== "all" &&
      order.approvalState !== selectedApproval
    ) {
      return false;
    }
    if (
      selectedEligibility !== "all" &&
      getEligibilityReasonValue(order) !== selectedEligibility
    ) {
      return false;
    }
    return true;
  });

  const sortedForwardedOrders = [...forwardedOrders].sort((left, right) => {
    const leftPriority = FORWARDED_STATUS_PRIORITY[left.status] ?? 99;
    const rightPriority = FORWARDED_STATUS_PRIORITY[right.status] ?? 99;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });

  const forwardedBaseCount = sortedForwardedOrders.length;
  const visibleForwardedOrders = sortedForwardedOrders.filter((order) => {
    switch (selectedFacet) {
      case "attention":
        return needsForwardedAttention(order);
      case "sync_failed":
        return order.status === "sync_failed";
      case "manual_fallback":
        return order.manualFallback.required;
      case "terminal":
        return isForwardedTerminal(order);
      default:
        return true;
    }
  });

  const serviceBuckets = Array.from(
    new Set(sortedOwnedOrders.map((order) => getServiceProductValue(order))),
  ).sort();
  const fleetBuckets = Array.from(
    new Set(sortedOwnedOrders.map((order) => getFleetValue(order))),
  ).sort();
  const approvalStates = Array.from(
    new Set(sortedOwnedOrders.map((order) => order.approvalState)),
  ).sort();
  const eligibilityReasons = Array.from(
    new Set(
      sortedOwnedOrders
        .map((order) => getEligibilityReasonValue(order))
        .filter((value) => value !== "clear"),
    ),
  ).sort();

  const visibleOwnedRecords: RuntimeOwnedOrder[] =
    board === "forwarded" ? [] : preLicenseOwnedByBoard;
  const visibleDispatchJobIds = Array.from(
    new Set(
      visibleOwnedRecords
        .map(
          (order: RuntimeOwnedOrder) =>
            jobByOrderId.get(order.orderId)?.dispatchJobId,
        )
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const candidatesByJobId = new Map<string, DispatchCandidate[]>(
    await Promise.all(
      visibleDispatchJobIds.map(async (dispatchJobId) => {
        const result = await loadListRuntime<DispatchCandidate>(
          client,
          `/api/dispatch/tasks/${dispatchJobId}/candidates`,
        );
        return [dispatchJobId, result.items] as const;
      }),
    ),
  );

  function hasLicenseIssue(order: RuntimeOwnedOrder) {
    const currentTask = pickCurrentTask(
      tasksByOrderId.get(order.orderId) ?? [],
    );
    const taskDriver = currentTask
      ? driverById.get(currentTask.driverId)
      : null;
    if (
      taskDriver &&
      (!taskDriver.licensesValid ||
        taskDriver.eligibilityBlockedReasons.includes("licenses_invalid"))
    ) {
      return true;
    }

    const job = jobByOrderId.get(order.orderId);
    const candidates = job
      ? (candidatesByJobId.get(job.dispatchJobId) ?? [])
      : [];
    if (candidates.length > 0) {
      return candidates.some((candidate) => {
        const driver = driverById.get(candidate.driverId);
        return Boolean(
          driver &&
          (!driver.licensesValid ||
            driver.eligibilityBlockedReasons.includes("licenses_invalid")),
        );
      });
    }

    return order.lastDispatchFailureReason?.includes("license") ?? false;
  }

  const visibleOwnedByBoard =
    selectedLicense === "all"
      ? preLicenseOwnedByBoard
      : preLicenseOwnedByBoard.filter((order) =>
          selectedLicense === "license_issue"
            ? hasLicenseIssue(order)
            : !hasLicenseIssue(order),
        );

  const issueByMirrorId = new Map<string, ForwarderReconciliationIssue>(
    reconciliationIssues.map((issue: ForwarderReconciliationIssue) => [
      issue.mirrorOrderId,
      issue,
    ]),
  );
  const adapterByPlatform = new Map<string, AdapterHealthRecord>(
    adapterHealth.map((record: AdapterHealthRecord) => [
      record.platformCode,
      record,
    ]),
  );
  const degradedAdapters = adapterHealth.filter(
    (record: AdapterHealthRecord) => record.status !== "healthy",
  );
  const ownedManualReviewOrders = sortedOwnedOrders.filter(
    (order) => order.queueFamily === "manual_review_queue",
  );
  const eligibleSupplyCount = visibleOwnedByBoard.reduce((count, order) => {
    const job = jobByOrderId.get(order.orderId);
    const candidates = job
      ? (candidatesByJobId.get(job.dispatchJobId) ?? [])
      : [];
    return (
      count +
      candidates.filter((candidate) => {
        const driver = driverById.get(candidate.driverId);
        return driver?.dispatchEligible ?? false;
      }).length
    );
  }, 0);
  const noSupplyReasonCounts = visibleOwnedByBoard.reduce<
    Record<string, number>
  >((acc, order) => {
    if (getOwnedBoard(order, jobByOrderId.get(order.orderId)) !== "no_supply") {
      return acc;
    }
    const key =
      order.lastDispatchFailureReason ??
      order.dispatchTimeout?.timeoutReasonCode ??
      "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const topNoSupplyReason =
    Object.entries(noSupplyReasonCounts).sort(
      (left, right) => right[1] - left[1],
    )[0] ?? null;
  const approvalBlockedCount = sortedOwnedOrders.filter(
    (order) =>
      order.approvalState === "blocked" || order.approvalState === "pending",
  ).length;
  const quotaBlockedCount = sortedOwnedOrders.filter(
    (order) =>
      order.complianceFlags?.some((flag) => flag.includes("quota")) ?? false,
  ).length;
  const mapBoardJobRecord = Object.fromEntries(
    visibleOwnedByBoard.map((order) => [
      order.orderId,
      jobByOrderId.get(order.orderId),
    ]),
  );
  const mapBoardCandidateRecord = Object.fromEntries(candidatesByJobId);
  const opsMapOverlaySource =
    board === "forwarded"
      ? null
      : buildOpsMapBoardModel({
          orders: visibleOwnedByBoard,
          orderJobMap: mapBoardJobRecord,
          candidatesByJobId: mapBoardCandidateRecord,
          visibleLimit: Math.min(visibleOwnedByBoard.length, 10),
        });
  const mapFilteredOwnedRecords = visibleOwnedByBoard.filter((order) =>
    orderMatchesMapFilters(
      order,
      selectedMapServiceArea,
      selectedMapPolicyCode,
    ),
  );
  const opsMapBoard =
    board === "forwarded"
      ? null
      : buildOpsMapBoardModel({
          orders: mapFilteredOwnedRecords,
          orderJobMap: mapBoardJobRecord,
          candidatesByJobId: mapBoardCandidateRecord,
          visibleLimit: Math.min(mapFilteredOwnedRecords.length, 10),
        });
  const opsMapBounds = opsMapBoard
    ? normalizeOpsMapBounds(opsMapBoard.points)
    : null;
  const opsMapViewport =
    opsMapBoard && opsMapBounds
      ? buildOpsMapTileViewport({
          bounds: opsMapBounds,
          centerLat: requestedMapLat,
          centerLng: requestedMapLng,
          zoom:
            requestedMapZoom ??
            getDefaultOpsMapZoom(opsMapBounds, 720, 360, 256),
          tileUrlTemplate: mapTileUrlTemplate,
        })
      : null;
  const buildOpsMapHref = (
    overrides: Partial<{
      mapZoom: number;
      mapLat: number;
      mapLng: number;
      mapServiceArea: string;
      mapPolicyCode: string;
    }>,
  ) =>
    buildDispatchHref({
      board,
      product: selectedProduct,
      timing: selectedTiming,
      license: selectedLicense,
      fleet: selectedFleet,
      approval: selectedApproval,
      eligibility: selectedEligibility,
      facet: selectedFacet,
      mapZoom: overrides.mapZoom ?? opsMapViewport?.zoom,
      mapLat: overrides.mapLat ?? opsMapViewport?.centerLat,
      mapLng: overrides.mapLng ?? opsMapViewport?.centerLng,
      mapServiceArea: overrides.mapServiceArea ?? selectedMapServiceArea,
      mapPolicyCode: overrides.mapPolicyCode ?? selectedMapPolicyCode,
    });
  const resetOpsMapViewHref = buildDispatchHref({
    board,
    product: selectedProduct,
    timing: selectedTiming,
    license: selectedLicense,
    fleet: selectedFleet,
    approval: selectedApproval,
    eligibility: selectedEligibility,
    facet: selectedFacet,
    mapServiceArea: selectedMapServiceArea,
    mapPolicyCode: selectedMapPolicyCode,
  });

  const currentRefresh =
    board === "forwarded"
      ? forwardedOrdersResult.refresh
      : ownedOrdersResult.refresh;
  const currentHealth =
    pageHealth ??
    ownedOrdersResult.health ??
    forwardedOrdersResult.health ??
    adapterHealthResult.health ??
    null;

  const boardEmptyState =
    board === "forwarded"
      ? deriveBoardEmptyState({
          board,
          explicit: forwardedOrdersResult.emptyState,
          failed: forwardedOrdersResult.failed,
          baseCount: forwardedBaseCount,
          visibleCount: visibleForwardedOrders.length,
          filtered: selectedFacet !== "all",
          identity: identityResult,
          adapterHealth,
        })
      : deriveBoardEmptyState({
          board,
          explicit: ownedOrdersResult.emptyState,
          failed: ownedOrdersResult.failed || dispatchJobsResult.failed,
          baseCount: boardCounts[board],
          visibleCount: visibleOwnedByBoard.length,
          filtered:
            selectedProduct !== "all" ||
            selectedTiming !== "all" ||
            selectedLicense !== "all" ||
            selectedFleet !== "all" ||
            selectedApproval !== "all" ||
            selectedEligibility !== "all",
          identity: identityResult,
          adapterHealth,
        });

  const boardMeta = getBoardMeta(board, locale);
  const selectedRecord: BoardRecord | null =
    board === "forwarded"
      ? (visibleForwardedOrders.find(
          (item) => item.mirrorOrderId === focusWorkItemId,
        ) ??
        visibleForwardedOrders[0] ??
        null)
      : (visibleOwnedByBoard.find((item) => item.orderId === focusWorkItemId) ??
        visibleOwnedByBoard[0] ??
        null);

  const selectedActions = selectedRecord
    ? buildActionContexts(
        board,
        selectedRecord,
        locale,
        selectedProduct,
        selectedTiming,
        selectedLicense,
        selectedFleet,
        selectedApproval,
        selectedEligibility,
        selectedFacet,
      )
    : [];

  let boardRows: TableRow[] = [];
  let boardColumns: CanvasTableColumn<TableRow>[] = [];

  if (board === "forwarded") {
    boardRows = visibleForwardedOrders.map((order) => {
      const issue = issueByMirrorId.get(order.mirrorOrderId);
      const adapter = adapterByPlatform.get(order.platformCode);
      const mismatch = getMismatchSummary(order, issue, locale);
      return {
        actions: renderInlineActionPills(
          buildActionContexts(
            board,
            order,
            locale,
            selectedProduct,
            selectedTiming,
            selectedLicense,
            selectedFleet,
            selectedApproval,
            selectedEligibility,
            selectedFacet,
          ),
          locale,
        ),
        mirror: (
          <div style={{ display: "grid", gap: 2 }}>
            <Link
              href={buildDispatchDetailHref({
                dispatchId: order.mirrorOrderId,
                board,
                facet: selectedFacet,
              })}
              style={{
                color: theme.accent,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {order.mirrorOrderId}
            </Link>
          </div>
        ),
        source: formatOpsCodeLabel(locale, order.platformCode),
        externalOrderId: order.externalOrderId,
        route: (
          <div style={{ display: "grid", gap: 1, whiteSpace: "normal" }}>
            <span>
              {readForwardedValue(order, [
                "pickupSummary",
                "pickupAddress",
                "pickup.addressName",
                "pickup.address",
                "pickup",
              ]) ?? "—"}
            </span>
            <span style={{ color: theme.textDim, fontSize: 11 }}>
              ↓{" "}
              {readForwardedValue(order, [
                "dropoffSummary",
                "dropoffAddress",
                "dropoff.addressName",
                "dropoff.address",
                "dropoff",
              ]) ?? "—"}
            </span>
          </div>
        ),
        window: formatForwardedWindow(order, locale),
        status: (
          <Pill theme={theme} tone={getForwardedStateTone(order.status)} dot>
            {formatDispatchCode(locale, order.status)}
          </Pill>
        ),
        adapter: (
          <Pill
            theme={theme}
            tone={adapter ? getAdapterTone(adapter.status) : "neutral"}
            dot={Boolean(adapter && adapter.status !== "healthy")}
          >
            {adapter
              ? `${formatDispatchCode(locale, order.platformCode)} · ${formatDispatchCode(locale, adapter.status)}`
              : formatDispatchCode(locale, order.platformCode)}
          </Pill>
        ),
        mismatch: (
          <Pill
            theme={theme}
            tone={mismatch.tone}
            dot={mismatch.tone !== "success"}
          >
            {mismatch.label}
          </Pill>
        ),
        _selected: selectedRecord === order,
      };
    });

    boardColumns = [
      {
        h: t("dispatch.table.forwarded.mirror", locale),
        k: "mirror",
        w: 170,
        mono: true,
      },
      { h: t("dispatch.table.forwarded.source", locale), k: "source", w: 140 },
      {
        h: t("dispatch.table.forwarded.externalOrder", locale),
        k: "externalOrderId",
        w: 170,
        mono: true,
      },
      { h: t("dispatch.table.ready.route", locale), k: "route", w: 360 },
      {
        h: t("dispatch.table.forwarded.window", locale),
        k: "window",
        w: 132,
        mono: true,
      },
      { h: t("dispatch.table.forwarded.status", locale), k: "status", w: 160 },
      {
        h: t("dispatch.table.forwarded.adapter", locale),
        k: "adapter",
        w: 170,
      },
      {
        h: t("dispatch.table.forwarded.mismatch", locale),
        k: "mismatch",
        w: 190,
      },
      { h: t("dispatch.table.shared.actions", locale), k: "actions", w: 260 },
    ];
  } else if (board === "assigned") {
    boardRows = visibleOwnedByBoard.map((order) => {
      const task = pickCurrentTask(tasksByOrderId.get(order.orderId) ?? []);
      const job = jobByOrderId.get(order.orderId);
      const gate = getOwnedGateSummary(order);
      return {
        actions: renderInlineActionPills(
          buildActionContexts(
            board,
            order,
            locale,
            selectedProduct,
            selectedTiming,
            selectedLicense,
            selectedFleet,
            selectedApproval,
            selectedEligibility,
            selectedFacet,
          ),
          locale,
        ),
        order: (
          <div style={{ display: "grid", gap: 2 }}>
            <Link
              href={`/dispatch/${encodeURIComponent(order.orderId)}`}
              style={{
                color: theme.accent,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {order.orderNo}
            </Link>
            <span style={{ color: theme.textDim, fontSize: 11 }}>
              {order.orderId}
            </span>
          </div>
        ),
        tenant: getTenantLabel(order),
        driver: (
          <div style={{ display: "grid", gap: 1 }}>
            <span>{task?.driverId ?? "—"}</span>
            <span style={{ color: theme.textDim, fontSize: 11 }}>
              {task?.vehicleId ?? "—"}
            </span>
          </div>
        ),
        taskState: (
          <Pill
            theme={theme}
            tone={task?.status === "on_trip" ? "success" : "info"}
            dot={Boolean(task)}
          >
            {formatDispatchCode(locale, task?.status ?? "assigned")}
          </Pill>
        ),
        eta:
          job && job.latestEtaMinutes !== null
            ? `${job.latestEtaMinutes}m`
            : "—",
        gate: (
          <Pill theme={theme} tone={gate.tone} dot={gate.tone !== "success"}>
            {formatDispatchCode(locale, gate.label)}
          </Pill>
        ),
        _selected: selectedRecord === order,
      };
    });

    boardColumns = [
      {
        h: t("dispatch.table.shared.order", locale),
        k: "order",
        w: 150,
        mono: true,
      },
      {
        h: t("dispatch.table.shared.tenant", locale),
        k: "tenant",
        w: 160,
        mono: true,
      },
      {
        h: t("dispatch.table.assigned.driverVehicle", locale),
        k: "driver",
        w: 170,
        mono: true,
      },
      {
        h: t("dispatch.table.assigned.taskState", locale),
        k: "taskState",
        w: 150,
      },
      {
        h: t("dispatch.table.shared.eta", locale),
        k: "eta",
        w: 90,
        mono: true,
      },
      { h: t("dispatch.table.assigned.gate", locale), k: "gate", w: 180 },
      { h: t("dispatch.table.shared.actions", locale), k: "actions", w: 260 },
    ];
  } else if (board === "exception") {
    boardRows = visibleOwnedByBoard.map((order) => ({
      actions: renderInlineActionPills(
        buildActionContexts(
          board,
          order,
          locale,
          selectedProduct,
          selectedTiming,
          selectedLicense,
          selectedFleet,
          selectedApproval,
          selectedEligibility,
          selectedFacet,
        ),
        locale,
      ),
      order: (
        <div style={{ display: "grid", gap: 2 }}>
          <Link
            href={`/dispatch/${encodeURIComponent(order.orderId)}`}
            style={{
              color: theme.accent,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {order.orderNo}
          </Link>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {order.orderId}
          </span>
        </div>
      ),
      tenant: getTenantLabel(order),
      reason: formatDispatchCode(locale, order.exceptionHold?.reasonCode),
      owner:
        order.exceptionHold?.overrideRequest?.requestedBy.actorId ??
        order.exceptionHold?.resolution?.actorId ??
        "ops",
      age: formatDurationSince(
        locale,
        order.exceptionHold?.raisedAt ?? order.updatedAt,
      ),
      related:
        order.approvalRequestIds[0] ?? order.recordingId ?? order.callId ?? "—",
      _selected: selectedRecord === order,
    }));

    boardColumns = [
      {
        h: t("dispatch.table.shared.order", locale),
        k: "order",
        w: 150,
        mono: true,
      },
      {
        h: t("dispatch.table.shared.tenant", locale),
        k: "tenant",
        w: 160,
        mono: true,
      },
      {
        h: t("dispatch.table.exception.holdReason", locale),
        k: "reason",
        w: 180,
        mono: true,
      },
      {
        h: t("dispatch.table.exception.holdOwner", locale),
        k: "owner",
        w: 150,
        mono: true,
      },
      {
        h: t("dispatch.table.exception.age", locale),
        k: "age",
        w: 120,
        mono: true,
      },
      {
        h: t("dispatch.table.exception.related", locale),
        k: "related",
        w: 160,
        mono: true,
      },
      { h: t("dispatch.table.shared.actions", locale), k: "actions", w: 260 },
    ];
  } else if (board === "no_supply") {
    boardRows = visibleOwnedByBoard.map((order) => {
      const job = jobByOrderId.get(order.orderId);
      const candidates = job
        ? (candidatesByJobId.get(job.dispatchJobId) ?? [])
        : [];
      return {
        actions: renderInlineActionPills(
          buildActionContexts(
            board,
            order,
            locale,
            selectedProduct,
            selectedTiming,
            selectedLicense,
            selectedFleet,
            selectedApproval,
            selectedEligibility,
            selectedFacet,
          ),
          locale,
        ),
        order: (
          <div style={{ display: "grid", gap: 2 }}>
            <Link
              href={`/dispatch/${encodeURIComponent(order.orderId)}`}
              style={{
                color: theme.accent,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {order.orderNo}
            </Link>
            <span style={{ color: theme.textDim, fontSize: 11 }}>
              {order.orderId}
            </span>
          </div>
        ),
        tenant: getTenantLabel(order),
        attempts: String(
          Math.max(order.dispatchAttemptCount, candidates.length),
        ),
        reason: formatDispatchCode(
          locale,
          order.lastDispatchFailureReason ??
            order.dispatchTimeout?.timeoutReasonCode,
        ),
        age: formatDurationSince(
          locale,
          order.noSupplyEscalation?.escalatedAt ?? order.updatedAt,
        ),
        _selected: selectedRecord === order,
      };
    });

    boardColumns = [
      {
        h: t("dispatch.table.shared.order", locale),
        k: "order",
        w: 150,
        mono: true,
      },
      {
        h: t("dispatch.table.shared.tenant", locale),
        k: "tenant",
        w: 160,
        mono: true,
      },
      {
        h: t("dispatch.table.noSupply.attempts", locale),
        k: "attempts",
        w: 120,
        mono: true,
        align: "right",
      },
      {
        h: t("dispatch.table.noSupply.reasonCode", locale),
        k: "reason",
        w: 180,
        mono: true,
      },
      {
        h: t("dispatch.table.noSupply.timeInState", locale),
        k: "age",
        w: 140,
        mono: true,
      },
      { h: t("dispatch.table.shared.actions", locale), k: "actions", w: 260 },
    ];
  } else if (board === "governance") {
    boardRows = visibleOwnedByBoard.map((order) => {
      const request = order.exceptionHold?.overrideRequest;
      const sem = resolveQueueSemantics(order, locale);
      const approvalHref = order.approvalRequestIds[0]
        ? `/approval-requests?approvalRequestId=${encodeURIComponent(order.approvalRequestIds[0])}`
        : "/approval-requests";
      return {
        actions: renderInlineActionPills(
          buildActionContexts(
            board,
            order,
            locale,
            selectedProduct,
            selectedTiming,
            selectedLicense,
            selectedFleet,
            selectedApproval,
            selectedEligibility,
            selectedFacet,
          ),
          locale,
        ),
        order: (
          <div style={{ display: "grid", gap: 2 }}>
            <Link
              href={`/dispatch/${encodeURIComponent(order.orderId)}`}
              style={{
                color: theme.accent,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {order.orderNo}
            </Link>
            <span style={{ color: theme.textDim, fontSize: 11 }}>
              {order.orderId}
            </span>
          </div>
        ),
        tenant: getTenantLabel(order),
        overrideType: sem.isStatutoryRefusal
          ? t("dispatch.denial.statutoryRefusalTitle", locale)
          : formatDispatchCode(locale, request?.overrideType),
        requester: request?.requestedBy.actorId ?? "—",
        age: formatDurationSince(
          locale,
          request?.requestedAt ?? order.updatedAt,
        ),
        approval: sem.isStatutoryRefusal ? (
          <span style={{ color: theme.textDim, fontSize: 12 }}>
            {t("dispatch.denial.noOverrideAllowed", locale)}
          </span>
        ) : (
          <Link
            href={approvalHref}
            style={{ color: theme.accent, textDecoration: "none" }}
          >
            {order.approvalRequestIds[0] ??
              t("dispatch.action.openApprovalRequest", locale)}
          </Link>
        ),
        _selected: selectedRecord === order,
      };
    });

    boardColumns = [
      {
        h: t("dispatch.table.shared.order", locale),
        k: "order",
        w: 150,
        mono: true,
      },
      {
        h: t("dispatch.table.shared.tenant", locale),
        k: "tenant",
        w: 160,
        mono: true,
      },
      {
        h: t("dispatch.table.governance.override", locale),
        k: "overrideType",
        w: 150,
        mono: true,
      },
      {
        h: t("dispatch.table.governance.requester", locale),
        k: "requester",
        w: 150,
        mono: true,
      },
      {
        h: t("dispatch.table.governance.age", locale),
        k: "age",
        w: 120,
        mono: true,
      },
      {
        h: t("dispatch.table.governance.approval", locale),
        k: "approval",
        w: 180,
        mono: true,
      },
      { h: t("dispatch.table.shared.actions", locale), k: "actions", w: 260 },
    ];
  } else {
    boardRows = visibleOwnedByBoard.map((order) => {
      const job = jobByOrderId.get(order.orderId);
      const state = getVisibleStateCode(order, job, locale);
      const gate = getOwnedGateSummary(order, locale);
      const candidates = job
        ? (candidatesByJobId.get(job.dispatchJobId) ?? [])
        : [];
      const queueSemantics = resolveQueueSemantics(order, locale);
      return {
        actions: renderInlineActionPills(
          buildActionContexts(
            board,
            order,
            locale,
            selectedProduct,
            selectedTiming,
            selectedLicense,
            selectedFleet,
            selectedApproval,
            selectedEligibility,
            selectedFacet,
          ),
          locale,
        ),
        order: (
          <div style={{ display: "grid", gap: 2 }}>
            <Link
              href={`/dispatch/${encodeURIComponent(order.orderId)}`}
              style={{
                color: theme.accent,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {order.orderNo}
            </Link>
            <span style={{ color: theme.textDim, fontSize: 11 }}>
              {order.orderId}
            </span>
          </div>
        ),
        tenant: getTenantLabel(order),
        route: (
          <div style={{ display: "grid", gap: 1, whiteSpace: "normal" }}>
            <span>{getAddressLabel(order.pickup)}</span>
            <span style={{ color: theme.textDim, fontSize: 11 }}>
              ↓ {getAddressLabel(order.dropoff)}
            </span>
          </div>
        ),
        window: formatWindow(order, locale),
        service: queueSemantics.isMultiTaxi
          ? queueSemantics.serviceTypeText
          : formatDispatchCode(locale, getServiceProductValue(order)),
        queueModeCell: (
          <div style={{ display: "grid", gap: 2 }}>
            <Pill
              theme={theme}
              tone={
                queueSemantics.isStatutoryRefusal
                  ? "danger"
                  : queueSemantics.queueMode === "virtual_matching"
                    ? "accent"
                    : "info"
              }
              dot
            >
              {queueSemantics.queueModeText}
            </Pill>
            {queueSemantics.isMultiTaxi &&
            !queueSemantics.isStatutoryRefusal ? (
              <span style={{ fontSize: 10.5, color: theme.textMuted }}>
                {queueSemantics.matchingModeText}
              </span>
            ) : null}
            {queueSemantics.isStatutoryRefusal ? (
              <span
                style={{
                  fontSize: 10.5,
                  color: theme.danger,
                  fontWeight: 700,
                }}
              >
                {queueSemantics.refusalCopy}
              </span>
            ) : null}
          </div>
        ),
        eta:
          (job?.latestEtaMinutes ?? order.etaSnapshot?.etaMinutes) !== null &&
          (job?.latestEtaMinutes ?? order.etaSnapshot?.etaMinutes) !== undefined
            ? `${job?.latestEtaMinutes ?? order.etaSnapshot?.etaMinutes}m`
            : "—",
        candidates: String(candidates.length),
        eligibility: getEligibilityReasonLabel(order, locale),
        gate: (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Pill theme={theme} tone={getStateTone(state)} dot>
              {formatDispatchCode(locale, state)}
            </Pill>
            <Pill theme={theme} tone={gate.tone} dot={gate.tone !== "success"}>
              {formatDispatchCode(locale, gate.label)}
            </Pill>
          </div>
        ),
        _selected: selectedRecord === order,
      };
    });

    boardColumns = [
      {
        h: t("dispatch.table.shared.order", locale),
        k: "order",
        w: 150,
        mono: true,
      },
      {
        h: t("dispatch.table.shared.tenant", locale),
        k: "tenant",
        w: 150,
        mono: true,
      },
      { h: t("dispatch.table.ready.route", locale), k: "route", w: 340 },
      {
        h: t("dispatch.table.ready.window", locale),
        k: "window",
        w: 132,
        mono: true,
      },
      {
        h: t("dispatch.table.ready.service", locale),
        k: "service",
        w: 130,
        mono: true,
      },
      {
        h: t("dispatch.table.ready.queueMode", locale),
        k: "queueModeCell",
        w: 170,
      },
      {
        h: t("dispatch.table.shared.eta", locale),
        k: "eta",
        w: 80,
        mono: true,
      },
      {
        h: t("dispatch.table.ready.candidates", locale),
        k: "candidates",
        w: 70,
        mono: true,
        align: "right",
      },
      {
        h: t("dispatch.table.ready.eligibility", locale),
        k: "eligibility",
        w: 180,
        mono: true,
      },
      { h: t("dispatch.table.assigned.gate", locale), k: "gate", w: 210 },
      { h: t("dispatch.table.shared.actions", locale), k: "actions", w: 260 },
    ];
  }

  return (
    <>
      <PublishAssistantScope
        board={board}
        visibleFilters={{
          product: selectedProduct,
          timing: selectedTiming,
          license: selectedLicense,
          fleet: selectedFleet,
          approval: selectedApproval,
          eligibility: selectedEligibility,
          facet: selectedFacet,
          ...(focusWorkItemId ? { workItemId: focusWorkItemId } : {}),
        }}
      />
      <DispatchAutoRefresh
        intervalMs={Math.max(currentRefresh.staleAfterMs || 5000, 5000)}
      />
      <PageHeader
        theme={theme}
        title={t("dispatch.title", locale)}
        subtitle={t("dispatch.page.subtitle", locale)}
        actions={
          <>
            <Pill theme={theme} tone="accent">
              {t("dispatch.page.refreshTierPill", locale)}
            </Pill>
            <Pill theme={theme} tone="neutral">
              {boardMeta.label}
            </Pill>
            <Link
              href={buildDispatchHref(
                focusWorkItemId
                  ? {
                      board,
                      product: selectedProduct,
                      timing: selectedTiming,
                      license: selectedLicense,
                      fleet: selectedFleet,
                      approval: selectedApproval,
                      eligibility: selectedEligibility,
                      facet: selectedFacet,
                      workItemId: focusWorkItemId,
                    }
                  : {
                      board,
                      product: selectedProduct,
                      timing: selectedTiming,
                      license: selectedLicense,
                      fleet: selectedFleet,
                      approval: selectedApproval,
                      eligibility: selectedEligibility,
                      facet: selectedFacet,
                    },
              )}
              style={{ textDecoration: "none" }}
            >
              <Btn theme={theme} variant="secondary" icon="arrow">
                {t("common.refresh", locale)}
              </Btn>
            </Link>
          </>
        }
      />

      <div style={pageStackStyle}>
        {healthBanner(currentHealth, locale)}
        {freshnessBanner(currentRefresh, locale)}

        <div style={boardNavStyle}>
          {(
            [
              "ready",
              "assigned",
              "exception",
              "no_supply",
              "governance",
              "forwarded",
            ] as DispatchBoard[]
          ).map((item) => {
            const meta = getBoardMeta(item, locale);
            const active = item === board;
            return (
              <Link
                key={item}
                href={buildDispatchHref({ board: item })}
                style={boardNavLinkStyle}
              >
                <div
                  style={{
                    ...boardNavItemStyle,
                    borderBottomColor: active ? theme.accent : "transparent",
                    color: active ? theme.text : theme.textMuted,
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  <Pill
                    theme={theme}
                    tone={active ? "accent" : "neutral"}
                    dot={active}
                  >
                    {formatCompactNumber(boardCounts[item])}
                  </Pill>
                  <span>{meta.label}</span>
                </div>
              </Link>
            );
          })}
          <Link
            href="/dispatch/queue"
            style={{ ...boardNavLinkStyle, marginLeft: "auto" }}
            data-screen-link="MTX-QUEUE-UI-01"
          >
            <div
              style={{
                ...boardNavItemStyle,
                color: theme.accent,
                fontWeight: 650,
              }}
            >
              <Pill theme={theme} tone="info" dot>
                MTX
              </Pill>
              <span>{t("dispatch.queue.action.openOperations", locale)}</span>
            </div>
          </Link>
        </div>

        <div style={boardContentStyle}>
          {renderBoardSignalBanner({
            board,
            locale,
            selectedRecord,
            selectedActions,
            degradedAdapters,
            boardCount:
              board === "forwarded" ? forwardedBaseCount : boardCounts[board],
            visibleCount:
              board === "forwarded"
                ? visibleForwardedOrders.length
                : visibleOwnedByBoard.length,
          })}

          <Card
            theme={theme}
            title={boardMeta.label}
            subtitle={boardMeta.description}
            padding={0}
          >
            <div
              style={{ padding: "16px 18px 14px", display: "grid", gap: 12 }}
            >
              {board !== "forwarded" ? (
                <>
                  <div style={summaryGridStyle}>
                    <div style={summaryCellStyle}>
                      <span style={{ color: theme.textDim, fontSize: 11 }}>
                        {t("dispatch.panels.eligibleSupply", locale)}
                      </span>
                      <strong>{eligibleSupplyCount}</strong>
                      <span style={{ color: theme.textMuted, fontSize: 11 }}>
                        {t("dispatch.panels.eligibleSupplyHint", locale)}
                      </span>
                    </div>
                    <div style={summaryCellStyle}>
                      <span style={{ color: theme.textDim, fontSize: 11 }}>
                        {t("dispatch.panels.noSupplyReason", locale)}
                      </span>
                      <strong>
                        {topNoSupplyReason
                          ? formatDispatchCode(locale, topNoSupplyReason[0])
                          : "—"}
                      </strong>
                      <span style={{ color: theme.textMuted, fontSize: 11 }}>
                        {topNoSupplyReason
                          ? t("dispatch.panels.noSupplyReasonCount", locale, {
                              count: topNoSupplyReason[1],
                            })
                          : t("dispatch.panels.noSupplyReasonEmpty", locale)}
                      </span>
                    </div>
                    <div style={summaryCellStyle}>
                      <span style={{ color: theme.textDim, fontSize: 11 }}>
                        {t("dispatch.panels.approvalBlocked", locale)}
                      </span>
                      <strong>{approvalBlockedCount}</strong>
                      <span style={{ color: theme.textMuted, fontSize: 11 }}>
                        {t("dispatch.panels.approvalBlockedHint", locale)}
                      </span>
                    </div>
                    <div style={summaryCellStyle}>
                      <span style={{ color: theme.textDim, fontSize: 11 }}>
                        {t("dispatch.panels.quotaBlocked", locale)}
                      </span>
                      <strong>{quotaBlockedCount}</strong>
                      <span style={{ color: theme.textMuted, fontSize: 11 }}>
                        {t("dispatch.panels.quotaBlockedHint", locale)}
                      </span>
                    </div>
                  </div>

                  <div style={summaryCellStyle}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <strong>{t("dispatch.reviewQueue.title", locale)}</strong>
                      <Pill theme={theme} tone="warn" dot>
                        {ownedManualReviewOrders.length + reviewQueue.length}
                      </Pill>
                    </div>
                    <span style={{ color: theme.textMuted, fontSize: 11 }}>
                      {t("dispatch.reviewQueue.subtitle", locale)}
                    </span>
                    <div style={{ display: "grid", gap: 6 }}>
                      {ownedManualReviewOrders.slice(0, 3).map((order) => (
                        <div
                          key={order.orderId}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                            fontSize: 12,
                          }}
                        >
                          <span>{`${order.orderNo} · ${getFleetLabel(order, locale)}`}</span>
                          <span style={{ color: theme.textDim }}>
                            {formatDispatchCode(
                              locale,
                              order.queueEntryReason ?? "manual_review_queue",
                            )}
                          </span>
                        </div>
                      ))}
                      {reviewQueue.slice(0, 3).map((item) => (
                        <div
                          key={item.eligibilityVerificationId}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                            fontSize: 12,
                          }}
                        >
                          <span>{item.partnerEntrySlug}</span>
                          <span style={{ color: theme.textDim }}>
                            {formatDispatchCode(
                              locale,
                              item.verificationStatus,
                            )}
                          </span>
                        </div>
                      ))}
                      {ownedManualReviewOrders.length === 0 &&
                      reviewQueue.length === 0 ? (
                        <span style={{ color: theme.textMuted, fontSize: 12 }}>
                          {t("dispatch.reviewQueue.empty", locale)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}

              <div style={filterRowStyle}>
                {board === "forwarded"
                  ? (
                      [
                        [
                          "all",
                          `${t("common.all", locale)} ${forwardedBaseCount}`,
                        ],
                        [
                          "attention",
                          `${t("dispatch.workflow.filterAttention", locale)} ${sortedForwardedOrders.filter(needsForwardedAttention).length}`,
                        ],
                        [
                          "sync_failed",
                          `${formatDispatchCode(locale, "sync_failed")} ${sortedForwardedOrders.filter((item) => item.status === "sync_failed").length}`,
                        ],
                        [
                          "manual_fallback",
                          `${formatDispatchCode(locale, "manual_fallback")} ${sortedForwardedOrders.filter((item) => item.manualFallback.required).length}`,
                        ],
                        [
                          "terminal",
                          `${t("dispatch.forwarded.filter.terminal", locale)} ${sortedForwardedOrders.filter(isForwardedTerminal).length}`,
                        ],
                      ] as const
                    ).map(([facetKey, label]) => (
                      <Link
                        key={facetKey}
                        href={buildDispatchHref({
                          board,
                          facet: facetKey,
                        })}
                        style={{ textDecoration: "none" }}
                      >
                        <Pill
                          theme={theme}
                          tone={
                            selectedFacet === facetKey ? "accent" : "neutral"
                          }
                          dot={facetKey !== "all"}
                        >
                          {label}
                        </Pill>
                      </Link>
                    ))
                  : [
                      ["all", t("dispatch.filters.products.all", locale)],
                      ...serviceBuckets.map((item) => [
                        item,
                        formatDispatchCode(locale, item),
                      ]),
                    ].map(([productKey, label]) => (
                      <Link
                        key={productKey}
                        href={buildDispatchHref({
                          board,
                          product: productKey,
                          timing: selectedTiming,
                          license: selectedLicense,
                          fleet: selectedFleet,
                          approval: selectedApproval,
                          eligibility: selectedEligibility,
                        })}
                        style={{ textDecoration: "none" }}
                      >
                        <Pill
                          theme={theme}
                          tone={
                            selectedProduct === productKey
                              ? "accent"
                              : "neutral"
                          }
                          dot={productKey !== "all"}
                        >
                          {label}
                        </Pill>
                      </Link>
                    ))}
              </div>

              {board !== "forwarded" ? (
                <>
                  <div style={filterRowStyle}>
                    {(
                      [
                        ["all", t("dispatch.filters.timing.all", locale)],
                        [
                          "reservation",
                          t("dispatch.filters.timing.reservation", locale),
                        ],
                        [
                          "realtime",
                          t("dispatch.filters.timing.realtime", locale),
                        ],
                      ] as const
                    ).map(([timingKey, label]) => (
                      <Link
                        key={timingKey}
                        href={buildDispatchHref({
                          board,
                          product: selectedProduct,
                          timing: timingKey,
                          license: selectedLicense,
                          fleet: selectedFleet,
                          approval: selectedApproval,
                          eligibility: selectedEligibility,
                        })}
                        style={{ textDecoration: "none" }}
                      >
                        <Pill
                          theme={theme}
                          tone={
                            selectedTiming === timingKey ? "accent" : "neutral"
                          }
                          dot={timingKey !== "all"}
                        >
                          {label}
                        </Pill>
                      </Link>
                    ))}
                  </div>
                  <div style={filterRowStyle}>
                    {(
                      [
                        ["all", t("dispatch.filters.license.all", locale)],
                        [
                          "license_issue",
                          t("dispatch.filters.license.issue", locale),
                        ],
                        [
                          "license_clear",
                          t("dispatch.filters.license.clear", locale),
                        ],
                      ] as const
                    ).map(([licenseKey, label]) => (
                      <Link
                        key={licenseKey}
                        href={buildDispatchHref({
                          board,
                          product: selectedProduct,
                          timing: selectedTiming,
                          license: licenseKey,
                          fleet: selectedFleet,
                          approval: selectedApproval,
                          eligibility: selectedEligibility,
                        })}
                        style={{ textDecoration: "none" }}
                      >
                        <Pill
                          theme={theme}
                          tone={
                            selectedLicense === licenseKey
                              ? "accent"
                              : "neutral"
                          }
                          dot={licenseKey !== "all"}
                        >
                          {label}
                        </Pill>
                      </Link>
                    ))}
                  </div>
                  <div style={filterRowStyle}>
                    {[
                      ["all", t("dispatch.filters.fleet.all", locale)],
                      ...fleetBuckets.map((item) => [
                        item,
                        item === "direct_ops"
                          ? t("dispatch.filters.fleet.direct", locale)
                          : formatDispatchCode(locale, item),
                      ]),
                    ].map(([fleetKey, label]) => (
                      <Link
                        key={fleetKey}
                        href={buildDispatchHref({
                          board,
                          product: selectedProduct,
                          timing: selectedTiming,
                          license: selectedLicense,
                          fleet: fleetKey,
                          approval: selectedApproval,
                          eligibility: selectedEligibility,
                        })}
                        style={{ textDecoration: "none" }}
                      >
                        <Pill
                          theme={theme}
                          tone={
                            selectedFleet === fleetKey ? "accent" : "neutral"
                          }
                          dot={fleetKey !== "all"}
                        >
                          {label}
                        </Pill>
                      </Link>
                    ))}
                  </div>
                  <div style={filterRowStyle}>
                    {[
                      ["all", t("dispatch.filters.approval.all", locale)],
                      ...approvalStates.map((item) => [
                        item,
                        getApprovalLabel(item, locale),
                      ]),
                    ].map(([approvalKey, label]) => (
                      <Link
                        key={approvalKey}
                        href={buildDispatchHref({
                          board,
                          product: selectedProduct,
                          timing: selectedTiming,
                          license: selectedLicense,
                          fleet: selectedFleet,
                          approval: approvalKey,
                          eligibility: selectedEligibility,
                        })}
                        style={{ textDecoration: "none" }}
                      >
                        <Pill
                          theme={theme}
                          tone={
                            selectedApproval === approvalKey
                              ? "accent"
                              : "neutral"
                          }
                          dot={approvalKey !== "all"}
                        >
                          {label}
                        </Pill>
                      </Link>
                    ))}
                  </div>
                  <div style={filterRowStyle}>
                    {[
                      ["all", t("dispatch.filters.eligibility.all", locale)],
                      ...eligibilityReasons.map((item) => [
                        item,
                        formatDispatchCode(locale, item),
                      ]),
                    ].map(([eligibilityKey, label]) => (
                      <Link
                        key={eligibilityKey}
                        href={buildDispatchHref({
                          board,
                          product: selectedProduct,
                          timing: selectedTiming,
                          license: selectedLicense,
                          fleet: selectedFleet,
                          approval: selectedApproval,
                          eligibility: eligibilityKey,
                        })}
                        style={{ textDecoration: "none" }}
                      >
                        <Pill
                          theme={theme}
                          tone={
                            selectedEligibility === eligibilityKey
                              ? "accent"
                              : "neutral"
                          }
                          dot={eligibilityKey !== "all"}
                        >
                          {label}
                        </Pill>
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  gap: 8,
                  fontSize: 12,
                  color: theme.textMuted,
                }}
              >
                <span>
                  {board === "forwarded"
                    ? `${t("dispatch.filters.showing", locale)} ${visibleForwardedOrders.length} / ${forwardedBaseCount}`
                    : `${t("dispatch.filters.showing", locale)} ${visibleOwnedByBoard.length} / ${boardCounts[board]}`}
                </span>
                <span>{formatRefreshSummary(currentRefresh, locale)}</span>
              </div>

              {opsMapBoard
                ? renderDispatchSpatialBoard({
                    model: opsMapBoard,
                    viewport: opsMapViewport,
                    locale,
                    tileUrlTemplateConfigured: Boolean(
                      mapTileUrlTemplate.trim(),
                    ),
                    serviceAreaOptions:
                      opsMapOverlaySource?.overlays.serviceAreaCodes ?? [],
                    policyCodeOptions:
                      opsMapOverlaySource?.overlays.policyCodes ?? [],
                    selectedServiceArea: selectedMapServiceArea,
                    selectedPolicyCode: selectedMapPolicyCode,
                    buildMapHref: buildOpsMapHref,
                    resetMapViewHref: resetOpsMapViewHref,
                  })
                : null}
            </div>

            {boardEmptyState ? (
              <div style={{ padding: 24 }}>
                {renderEmptyState(
                  board,
                  boardEmptyState,
                  locale,
                  selectedProduct,
                  selectedTiming,
                  selectedLicense,
                  selectedFleet,
                  selectedApproval,
                  selectedEligibility,
                  selectedFacet,
                )}
              </div>
            ) : (
              <>
                <Table theme={theme} columns={boardColumns} rows={boardRows} />
                <div style={selectedTrayStyle}>
                  {selectedRecord ? (
                    <>
                      <div style={selectedMetaStyle}>
                        <div style={selectedMetaCellStyle}>
                          <span style={{ fontSize: 11, color: theme.textDim }}>
                            {t("dispatch.selected.focused", locale)}
                          </span>
                          <strong
                            style={{
                              fontFamily: theme.monoFamily,
                              fontSize: 12,
                            }}
                          >
                            {"mirrorOrderId" in selectedRecord
                              ? `${selectedRecord.mirrorOrderId} · ${selectedRecord.externalOrderId}`
                              : `${selectedRecord.orderNo} · ${selectedRecord.orderId}`}
                          </strong>
                        </div>
                        {"mirrorOrderId" in selectedRecord ? null : (
                          <div style={selectedMetaCellStyle}>
                            <span
                              style={{ fontSize: 11, color: theme.textDim }}
                            >
                              {t("dispatch.selected.attribution", locale)}
                            </span>
                            <strong>
                              {`${getFleetLabel(selectedRecord, locale)} · ${formatDispatchCode(locale, getServiceProductValue(selectedRecord))}`}
                            </strong>
                            <span
                              style={{ color: theme.textMuted, fontSize: 11 }}
                            >
                              {`${getTenantLabel(selectedRecord)} · ${getApprovalLabel(selectedRecord.approvalState, locale)} · ${getEligibilityReasonLabel(selectedRecord, locale)}`}
                            </span>
                          </div>
                        )}
                        {"mirrorOrderId" in selectedRecord
                          ? null
                          : (() => {
                              const sem = resolveQueueSemantics(
                                selectedRecord,
                                locale,
                              );
                              return (
                                <div style={selectedMetaCellStyle}>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color: theme.textDim,
                                    }}
                                  >
                                    {t("dispatch.queue.overviewTitle", locale)}
                                  </span>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 8,
                                      alignItems: "center",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <Pill
                                      theme={theme}
                                      tone={
                                        sem.isStatutoryRefusal
                                          ? "danger"
                                          : "accent"
                                      }
                                      dot
                                    >
                                      {sem.queueModeText}
                                    </Pill>
                                    <span
                                      style={{
                                        fontSize: 11,
                                        color: theme.textMuted,
                                      }}
                                    >
                                      {`${sem.serviceTypeText} · ${sem.matchingModeText} · ${sem.siteDisplay}`}
                                    </span>
                                  </div>
                                  {sem.isStatutoryRefusal ? (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        color: theme.danger,
                                        fontWeight: 700,
                                        marginTop: 2,
                                      }}
                                    >
                                      {sem.refusalCopy} (
                                      {t(
                                        "dispatch.denial.noOverrideAllowed",
                                        locale,
                                      )}
                                      )
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })()}
                        <div style={selectedMetaCellStyle}>
                          <span style={{ fontSize: 11, color: theme.textDim }}>
                            {t("dispatch.selected.links", locale)}
                          </span>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 6,
                            }}
                          >
                            {board === "governance" ? (
                              <Link
                                href="/approval-requests"
                                style={{
                                  textDecoration: "none",
                                  color: "inherit",
                                }}
                              >
                                <Pill theme={theme} tone="warn" dot>
                                  /approval-requests
                                </Pill>
                              </Link>
                            ) : null}
                            {board === "exception" || board === "no_supply" ? (
                              <Link
                                href={`/incidents?sourceOrderId=${encodeURIComponent(
                                  "mirrorOrderId" in selectedRecord
                                    ? selectedRecord.mirrorOrderId
                                    : selectedRecord.orderId,
                                )}`}
                                style={{
                                  textDecoration: "none",
                                  color: "inherit",
                                }}
                              >
                                <Pill theme={theme} tone="warn" dot>
                                  /incidents
                                </Pill>
                              </Link>
                            ) : null}
                            {board === "forwarded" ? (
                              <Link
                                href={buildPlatformAdminHref(
                                  "/adapter-registry",
                                )}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  textDecoration: "none",
                                  color: "inherit",
                                }}
                              >
                                <Pill theme={theme} tone="warn" dot>
                                  {t("dispatch.page.platformAdminPill", locale)}
                                </Pill>
                              </Link>
                            ) : null}
                            <Link
                              href={buildPlatformAdminHref("/audit")}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                textDecoration: "none",
                                color: "inherit",
                              }}
                            >
                              <Pill theme={theme} tone="neutral">
                                /audit ↗
                              </Pill>
                            </Link>
                          </div>
                        </div>
                      </div>
                      {renderActionList(selectedActions, locale)}
                    </>
                  ) : (
                    <CanvasEmptyPanel
                      theme={theme}
                      density="compact"
                      title={t("dispatch.selected.emptyTitle", locale)}
                      description={t("dispatch.selected.emptyBody", locale)}
                    />
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

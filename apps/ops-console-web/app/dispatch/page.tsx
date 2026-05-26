import Link from "next/link";
import type {
  AdapterHealthRecord,
  DispatchCandidate,
  DispatchJobRecord,
  DriverTaskRecord,
  EmptyReason,
  EmptyStateEnvelope,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
  IdentityContext,
  OwnedOrderRecord,
  ResourceActionDescriptor,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "@drts/contracts";
import { DispatchAutoRefresh } from "@/components/dispatch-auto-refresh";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { formatCompactNumber } from "@/lib/ops-analytics";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
import { t } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  WorkflowEmptyState,
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
type OwnedServiceFilter = "all" | string;
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
  service,
  facet,
  workItemId,
}: {
  board: DispatchBoard;
  service?: string | undefined;
  facet?: string | undefined;
  workItemId?: string | undefined;
}) {
  const params = new URLSearchParams();
  if (board !== "ready") {
    params.set("board", board);
  }
  if (service && service !== "all") {
    params.set("service", service);
  }
  if (facet && facet !== "all") {
    params.set("facet", facet);
  }
  if (workItemId) {
    params.set("workItemId", workItemId);
  }
  const query = params.toString();
  return query ? `/dispatch?${query}` : "/dispatch";
}

function getBoardMeta(board: DispatchBoard, locale: Locale) {
  const zh = locale === "zh";
  switch (board) {
    case "ready":
      return {
        label: zh ? "Ready queue" : "Ready queue",
        description: zh
          ? "待派送與廣播中的自營訂單。"
          : "Owned orders waiting for assignment or active matching.",
      };
    case "assigned":
      return {
        label: zh ? "Assigned" : "Assigned",
        description: zh
          ? "已指派司機、進行中的工作項目。"
          : "Driver-assigned and in-trip work items.",
      };
    case "exception":
      return {
        label: zh ? "Exception hold" : "Exception hold",
        description: zh
          ? "例外保留，需要先清除 gate 才能回到 queue。"
          : "Held work items that must clear an exception before requeue.",
      };
    case "no_supply":
      return {
        label: zh ? "No eligible supply" : "No eligible supply",
        description: zh
          ? "無合格供給，需要人工延展或升級。"
          : "Orders with no eligible supply and active intervention.",
      };
    case "governance":
      return {
        label: zh ? "Governance blocked" : "Governance blocked",
        description: zh
          ? "等待 override / approval request 的治理阻塞。"
          : "Override requests blocked on governance approvals.",
      };
    case "forwarded":
      return {
        label: zh ? "Forwarded mirror" : "Forwarded mirror",
        description: zh
          ? "外部平台鏡像、adapter 與 reconciliation 觀察。"
          : "Forwarded order mirrors with adapter and reconciliation context.",
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
    return locale === "zh" ? `${totalMinutes} 分` : `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return locale === "zh"
    ? `${hours} 小時 ${minutes} 分`
    : `${hours}h ${minutes}m`;
}

function formatWindow(order: OwnedOrderRecord, locale: Locale) {
  if (!order.reservationWindowStart || !order.reservationWindowEnd) {
    return locale === "zh" ? "即時" : "realtime";
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

  return locale === "zh" ? "即時" : "realtime";
}

function getVisibleStateCode(order: OwnedOrderRecord, job?: DispatchJobRecord) {
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
): DispatchBoard {
  const state = getVisibleStateCode(order, job);
  if (state === "override_pending") return "governance";
  if (state === "no_supply") return "no_supply";
  if (state === "exception_hold") return "exception";
  if (state === "assigned") return "assigned";
  return "ready";
}

function getStateTone(stateCode: string): CanvasTone {
  if (stateCode === "assigned" || stateCode === "completed") {
    return "success";
  }
  if (stateCode === "no_supply") {
    return "danger";
  }
  if (stateCode === "exception_hold" || stateCode === "override_pending") {
    return "warn";
  }
  if (stateCode === "broadcasting" || stateCode === "queued") {
    return "info";
  }
  return "neutral";
}

function getOwnedGateSummary(order: OwnedOrderRecord): {
  label: string;
  tone: CanvasTone;
} {
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
      label:
        locale === "zh"
          ? `${mismatchCount} 筆不一致`
          : `${mismatchCount} mismatch`,
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
  const zh = locale === "zh";
  switch (action) {
    case "assign":
    case "assign_dispatch":
    case "dispatch_order":
      return zh ? "指派候選司機" : "Assign candidate";
    case "release":
    case "release_driver":
    case "reassign_dispatch":
      return zh ? "釋放 / 改派司機" : "Release / reassign driver";
    case "redispatch":
    case "redispatch_order":
    case "redispatch_with_reason":
      return zh ? "重新派送" : "Redispatch";
    case "cancel":
    case "cancel_owned_order":
      return zh ? "取消訂單" : "Cancel order";
    case "manual_fare_override":
    case "fare_override":
    case "request_fare_override":
      return zh ? "申請車資覆寫" : "Request fare override";
    case "resolve_hold":
    case "resolve_exception_hold":
      return zh ? "解除保留" : "Resolve hold";
    case "request_exception_override":
      return zh ? "申請例外覆核" : "Request override";
    case "approve_exception_override":
      return zh ? "核准 override" : "Approve override";
    case "reject_exception_override":
      return zh ? "拒絕 override" : "Reject override";
    case "escalate_incident":
    case "createIncidentFromDispatchException":
      return zh ? "升級為事件" : "Escalate to incident";
    case "extend_search":
      return zh ? "延展搜尋" : "Extend search";
    case "cancel_no_supply":
      return zh ? "取消 no-supply 訂單" : "Cancel no-supply order";
    case "resolve_no_supply":
      return zh ? "人工處理 no-supply" : "Resolve no-supply";
    case "jump_approval_request":
      return zh ? "前往 approval request" : "Open approval request";
    case "trigger_reconciliation":
    case "complete_forwarder_reconciliation":
      return zh ? "觸發 reconciliation" : "Trigger reconciliation";
    case "engage_manual_fallback":
      return zh ? "啟動 manual fallback" : "Engage manual fallback";
    case "force_refresh":
    case "sync_forwarded_order_status":
    case "mark_forwarder_sync_failed":
      return zh ? "強制刷新" : "Force refresh";
    case "inspect_adapter":
      return zh ? "查看 adapter ↗" : "Inspect adapter ↗";
    default:
      return action.replace(/_/g, " ");
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
  selectedService: OwnedServiceFilter,
  selectedFacet: ForwardedFacetFilter,
) {
  if ("mirrorOrderId" in record) {
    switch (action.action) {
      case "inspect_adapter":
        return buildPlatformAdminHref(
          `/adapter-registry?platformCode=${encodeURIComponent(record.platformCode)}`,
        );
      case "force_refresh":
      case "sync_forwarded_order_status":
        return buildDispatchHref({
          board,
          facet: selectedFacet,
          workItemId: record.mirrorOrderId,
        });
      default:
        return `/dispatch/${encodeURIComponent(record.mirrorOrderId)}?board=${board}&intent=${encodeURIComponent(action.action)}`;
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

  return `/dispatch/${encodeURIComponent(record.orderId)}?board=${board}${
    selectedService !== "all"
      ? `&service=${encodeURIComponent(selectedService)}`
      : ""
  }&intent=${encodeURIComponent(action.action)}`;
}

function buildActionContexts(
  board: DispatchBoard,
  record: BoardRecord,
  locale: Locale,
  selectedService: OwnedServiceFilter,
  selectedFacet: ForwardedFacetFilter,
): BoardActionContext[] {
  return normalizeActions(record).map((action) => {
    const href = buildActionHref(
      board,
      record,
      action,
      selectedService,
      selectedFacet,
    );
    const external =
      action.action === "inspect_adapter" ||
      href.startsWith("http://") ||
      href.startsWith("https://");

    return {
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
) {
  const zh = locale === "zh";
  const mapping: Record<
    EmptyReason,
    { title: string; description: string; tone: CanvasTone; icon: string }
  > = {
    no_data: {
      title: zh ? "目前沒有工作項目" : "No work items yet",
      description: zh
        ? "這個 board 目前沒有資料，等待新的 dispatch 狀態流入。"
        : "This board is currently empty and waiting for new dispatch activity.",
      tone: "neutral",
      icon: "○",
    },
    not_provisioned: {
      title: zh ? "尚未完成佈建" : "Not provisioned",
      description: zh
        ? "此 board 需要先完成 adapter / integration 設定後才會有資料。"
        : "This board requires provisioning before it can return live data.",
      tone: "info",
      icon: "◇",
    },
    fetch_failed: {
      title: zh ? "讀取失敗" : "Failed to load",
      description: zh
        ? "資料請求失敗。請使用 refresh，或查看 degraded banner。"
        : "The data request failed. Refresh the board or inspect degraded services.",
      tone: "danger",
      icon: "!",
    },
    permission_denied: {
      title: zh ? "沒有權限" : "Permission denied",
      description: zh
        ? "目前角色沒有此 board 所需的權限。"
        : "The current role does not have access to this board.",
      tone: "warn",
      icon: "⛔",
    },
    external_unavailable: {
      title: zh ? "外部系統不可用" : "External platform unavailable",
      description: zh
        ? "外部 adapter / callback 無法提供資料，請改走 manual fallback。"
        : "External adapter data is unavailable. Use fallback paths while recovery is in progress.",
      tone: "warn",
      icon: "↗",
    },
    driver_not_eligible: {
      title: zh ? "目前不可派送" : "Not eligible right now",
      description: zh
        ? "此狀態通常不適用於 ops console，但後端回傳了 driver eligibility 限制。"
        : "This reason is usually driver-specific, but the backend reported an eligibility restriction.",
      tone: "info",
      icon: "△",
    },
    filtered_empty: {
      title: zh ? "篩選後無結果" : "No matches for current filters",
      description: zh
        ? "這個 board 有資料，但目前的 service / facet 篩選沒有命中。"
        : "The board has data, but nothing matches the current filters.",
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
        ? "warning"
        : content.tone;
  return (
    <WorkflowEmptyState
      tone={tone}
      density="compact"
      title={content.title}
      description={`${content.description} ${
        board === "forwarded" && emptyState.reason === "external_unavailable"
          ? zh
            ? "請改查 adapter health 與 reconciliation queue。"
            : "Check adapter health and the reconciliation queue."
          : ""
      }`.trim()}
      icon={<span style={{ fontSize: 22 }}>{content.icon}</span>}
      actions={
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {emptyState.nextAction ? (
            <Link
              href={`${buildDispatchHref({ board })}${
                buildDispatchHref({ board }).includes("?") ? "&" : "?"
              }intent=${encodeURIComponent(emptyState.nextAction.action)}`}
              style={{ textDecoration: "none" }}
            >
              <Btn theme={theme} variant="primary" icon="arrow">
                {resolveActionLabel(emptyState.nextAction.action, locale)}
              </Btn>
            </Link>
          ) : null}
          <Link
            href={buildDispatchHref({ board })}
            style={{ textDecoration: "none" }}
          >
            <Btn theme={theme} variant="secondary" icon="arrow">
              {zh ? "重設 board" : "Reset board"}
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
    const matched = actions.find((action) =>
      action.href.includes(`intent=${encodeURIComponent(candidate)}`),
    );
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
        {action.label ?? (locale === "zh" ? "前往處理" : "Open")}
      </Btn>
    </Link>
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
  const zh = locale === "zh";

  if (board === "forwarded" && degradedAdapters.length > 0) {
    const inspectAdapter =
      pickPrimaryAction(selectedActions, ["inspect_adapter"]) ??
      ({
        href: buildPlatformAdminHref("/adapter-registry"),
        label: zh ? "查看 adapter ↗" : "Inspect adapter ↗",
        riskLevel: "low",
        disabled: false,
        external: true,
      } satisfies BoardActionContext);
    return (
      <Banner
        theme={theme}
        tone="warn"
        icon="warn"
        title={
          zh
            ? `${formatDispatchCode(locale, degradedAdapters[0]?.platformCode, "Adapter")} 降級 · Forwarded mirror 受影響`
            : `${formatDispatchCode(locale, degradedAdapters[0]?.platformCode, "Adapter")} degraded · forwarded mirror impacted`
        }
        body={
          zh
            ? `目前可見 ${visibleCount} / ${boardCount} 筆鏡像單；優先走 reconciliation / manual fallback。`
            : `Showing ${visibleCount} / ${boardCount} mirror rows. Prioritize reconciliation and manual fallback.`
        }
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
        body={
          zh
            ? `狀態 ${formatDispatchCode(locale, selectedRecord.status)}；外部單號 ${selectedRecord.externalOrderId}。`
            : `Status ${formatDispatchCode(locale, selectedRecord.status)}; external order ${selectedRecord.externalOrderId}.`
        }
        actions={renderActionButton(primary, locale)}
      />
    );
  }

  const title = `${selectedRecord.orderNo} · ${getTenantLabel(selectedRecord)}`;
  if (board === "governance") {
    return (
      <Banner
        theme={theme}
        tone="warn"
        icon="warn"
        title={
          zh
            ? "需平台審批 · /approval-requests"
            : "Governance hold · /approval-requests"
        }
        body={
          zh
            ? `${title} 正等待 override / approval request。`
            : `${title} is blocked on an override / approval request.`
        }
        actions={renderActionButton(
          pickPrimaryAction(selectedActions, ["jump_approval_request"]),
          locale,
        )}
      />
    );
  }

  if (board === "exception") {
    return (
      <Banner
        theme={theme}
        tone="warn"
        icon="warn"
        title={zh ? "例外保留需先清除" : "Exception hold must be cleared"}
        body={
          zh
            ? `${title} · hold 原因 ${selectedRecord.exceptionHold?.reasonCode ?? "unknown"}`
            : `${title} · hold reason ${selectedRecord.exceptionHold?.reasonCode ?? "unknown"}`
        }
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
        title={
          zh
            ? "No eligible supply 需要人工介入"
            : "No eligible supply needs intervention"
        }
        body={
          zh
            ? `${title} · 已嘗試 ${selectedRecord.dispatchAttemptCount} 次，最後原因 ${formatDispatchCode(locale, selectedRecord.lastDispatchFailureReason ?? "unknown")}。`
            : `${title} · ${selectedRecord.dispatchAttemptCount} attempts, last reason ${formatDispatchCode(locale, selectedRecord.lastDispatchFailureReason ?? "unknown")}.`
        }
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
      body={
        zh
          ? board === "assigned"
            ? "目前為已指派 / 行程進行中工作項目。"
            : "目前為 ready queue 焦點工作項目。"
          : board === "assigned"
            ? "Current driver-assigned / in-trip work item."
            : "Current ready-queue focus item."
      }
      actions={renderActionButton(primary, locale)}
    />
  );
}

function renderActionList(actions: BoardActionContext[], locale: Locale) {
  if (actions.length === 0) {
    return (
      <WorkflowEmptyState
        density="compact"
        title={locale === "zh" ? "目前沒有可用動作" : "No available actions"}
        description={
          locale === "zh"
            ? "這個 work item 目前是 read-only，或後端尚未提供 `availableActions`。"
            : "This work item is read-only, or the backend has not emitted `availableActions` yet."
        }
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
                : locale === "zh"
                  ? "由 availableActions 驅動的可執行 CTA。"
                  : "CTA emitted from availableActions."}
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
        {locale === "zh" ? "無動作" : "No actions"}
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
  const zh = locale === "zh";
  const tone = refresh.dataFreshness === "degraded" ? "warn" : "info";
  const title =
    refresh.dataFreshness === "stale"
      ? zh
        ? "資料已過期"
        : "Dispatch snapshot is stale"
      : zh
        ? "資料新鮮度未知"
        : "Dispatch freshness is degraded";
  return (
    <Banner
      theme={theme}
      tone={tone}
      icon="warn"
      title={title}
      body={
        zh
          ? `generatedAt ${formatDateTime(locale, refresh.generatedAt)} · source ${formatDispatchCode(locale, refresh.source)}`
          : `generatedAt ${formatDateTime(locale, refresh.generatedAt)} · source ${formatDispatchCode(locale, refresh.source)}`
      }
    />
  );
}

function healthBanner(health: UiHealthEnvelope | null, locale: Locale) {
  if (!health || health.status === "healthy") {
    return null;
  }
  const zh = locale === "zh";
  const firstService = health.degradedServices[0];
  return (
    <Banner
      theme={theme}
      tone={health.status === "down" ? "danger" : "warn"}
      icon="warn"
      title={
        health.status === "down"
          ? zh
            ? "Dispatch 依賴服務中斷"
            : "Dispatch dependency is down"
          : zh
            ? "Dispatch 依賴服務降級"
            : "Dispatch dependency is degraded"
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
  const selectedService = firstParam(resolvedSearchParams.service) ?? "all";
  const selectedFacet = (firstParam(resolvedSearchParams.facet) ??
    "all") as ForwardedFacetFilter;
  const focusWorkItemId = firstParam(resolvedSearchParams.workItemId) ?? "";

  const [
    ownedOrdersResult,
    dispatchJobsResult,
    driverTasksResult,
    forwardedOrdersResult,
    adapterHealthResult,
    reconciliationIssuesResult,
    identityResult,
    pageHealth,
  ] = await Promise.all([
    loadListRuntime<RuntimeOwnedOrder>(client, "/api/orders"),
    loadListRuntime<RuntimeDispatchJob>(client, "/api/dispatch/tasks"),
    loadListRuntime<DriverTaskRecord>(client, "/api/driver/tasks"),
    loadListRuntime<RuntimeForwardedOrder>(client, "/api/forwarder/orders"),
    loadListRuntime<AdapterHealthRecord>(
      client,
      "/api/forwarder/adapters/health",
    ),
    loadListRuntime<ForwarderReconciliationIssue>(
      client,
      "/api/forwarder/reconciliation-issues",
    ),
    client
      .get<IdentityContext>("/api/identity/context")
      .catch(() => null as IdentityContext | null),
    loadHealthPayload(),
  ]);

  const ownedOrders = ownedOrdersResult.items;
  const dispatchJobs = dispatchJobsResult.items;
  const driverTasks = driverTasksResult.items;
  const forwardedOrders = forwardedOrdersResult.items;
  const adapterHealth = adapterHealthResult.items;
  const reconciliationIssues = reconciliationIssuesResult.items;

  const jobByOrderId = new Map<string, RuntimeDispatchJob>(
    dispatchJobs.map((job: RuntimeDispatchJob) => [job.orderId, job] as const),
  );
  const tasksByOrderId = new Map<string, DriverTaskRecord[]>();
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

  const visibleOwnedByBoard = sortedOwnedOrders.filter((order) => {
    const orderBoard = getOwnedBoard(order, jobByOrderId.get(order.orderId));
    if (orderBoard !== board) {
      return false;
    }
    if (board !== "forwarded" && selectedService !== "all") {
      return order.serviceBucket === selectedService;
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
    new Set(sortedOwnedOrders.map((order) => order.serviceBucket)),
  ).sort();

  const visibleOwnedRecords: RuntimeOwnedOrder[] =
    board === "forwarded" ? [] : visibleOwnedByBoard;
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
          filtered: selectedService !== "all",
          identity: identityResult,
          adapterHealth,
        });

  const boardMeta = getBoardMeta(board, locale);
  const zh = locale === "zh";

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
        selectedService,
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
            selectedService,
            selectedFacet,
          ),
          locale,
        ),
        mirror: (
          <div style={{ display: "grid", gap: 2 }}>
            <Link
              href={`/dispatch/${encodeURIComponent(order.mirrorOrderId)}`}
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
      { h: "MIRROR", k: "mirror", w: 170, mono: true },
      { h: "SOURCE", k: "source", w: 140 },
      { h: "EXTERNAL ORDER", k: "externalOrderId", w: 170, mono: true },
      { h: "PICKUP → DROP", k: "route", w: 360 },
      { h: "WINDOW", k: "window", w: 132, mono: true },
      { h: "STATUS", k: "status", w: 160 },
      { h: "ADAPTER", k: "adapter", w: 170 },
      { h: "MISMATCH", k: "mismatch", w: 190 },
      { h: "ACTIONS", k: "actions", w: 260 },
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
            selectedService,
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
      { h: "ORDER", k: "order", w: 150, mono: true },
      { h: "TENANT", k: "tenant", w: 160, mono: true },
      { h: "DRIVER / VEHICLE", k: "driver", w: 170, mono: true },
      { h: "TASK STATE", k: "taskState", w: 150 },
      { h: "ETA", k: "eta", w: 90, mono: true },
      { h: "GATE", k: "gate", w: 180 },
      { h: "ACTIONS", k: "actions", w: 260 },
    ];
  } else if (board === "exception") {
    boardRows = visibleOwnedByBoard.map((order) => ({
      actions: renderInlineActionPills(
        buildActionContexts(
          board,
          order,
          locale,
          selectedService,
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
      reason: order.exceptionHold?.reasonCode ?? "—",
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
      { h: "ORDER", k: "order", w: 150, mono: true },
      { h: "TENANT", k: "tenant", w: 160, mono: true },
      { h: "HOLD REASON", k: "reason", w: 180, mono: true },
      { h: "HOLD OWNER", k: "owner", w: 150, mono: true },
      { h: "AGE", k: "age", w: 120, mono: true },
      { h: "RELATED", k: "related", w: 160, mono: true },
      { h: "ACTIONS", k: "actions", w: 260 },
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
            selectedService,
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
      { h: "ORDER", k: "order", w: 150, mono: true },
      { h: "TENANT", k: "tenant", w: 160, mono: true },
      { h: "ATTEMPTS", k: "attempts", w: 120, mono: true, align: "right" },
      { h: "REASON CODE", k: "reason", w: 180, mono: true },
      { h: "TIME IN STATE", k: "age", w: 140, mono: true },
      { h: "ACTIONS", k: "actions", w: 260 },
    ];
  } else if (board === "governance") {
    boardRows = visibleOwnedByBoard.map((order) => {
      const request = order.exceptionHold?.overrideRequest;
      const approvalHref = order.approvalRequestIds[0]
        ? `/approval-requests?approvalRequestId=${encodeURIComponent(order.approvalRequestIds[0])}`
        : "/approval-requests";
      return {
        actions: renderInlineActionPills(
          buildActionContexts(
            board,
            order,
            locale,
            selectedService,
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
        overrideType: formatDispatchCode(locale, request?.overrideType),
        requester: request?.requestedBy.actorId ?? "—",
        age: formatDurationSince(
          locale,
          request?.requestedAt ?? order.updatedAt,
        ),
        approval: (
          <Link
            href={approvalHref}
            style={{ color: theme.accent, textDecoration: "none" }}
          >
            {order.approvalRequestIds[0] ??
              (zh ? "前往 approval" : "Open approval")}
          </Link>
        ),
        _selected: selectedRecord === order,
      };
    });

    boardColumns = [
      { h: "ORDER", k: "order", w: 150, mono: true },
      { h: "TENANT", k: "tenant", w: 160, mono: true },
      { h: "OVERRIDE", k: "overrideType", w: 150, mono: true },
      { h: "REQUESTER", k: "requester", w: 150, mono: true },
      { h: "AGE", k: "age", w: 120, mono: true },
      { h: "APPROVAL", k: "approval", w: 180, mono: true },
      { h: "ACTIONS", k: "actions", w: 260 },
    ];
  } else {
    boardRows = visibleOwnedByBoard.map((order) => {
      const job = jobByOrderId.get(order.orderId);
      const state = getVisibleStateCode(order, job);
      const gate = getOwnedGateSummary(order);
      const candidates = job
        ? (candidatesByJobId.get(job.dispatchJobId) ?? [])
        : [];
      return {
        actions: renderInlineActionPills(
          buildActionContexts(
            board,
            order,
            locale,
            selectedService,
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
        service: formatDispatchCode(locale, order.serviceBucket),
        eta:
          (job?.latestEtaMinutes ?? order.etaSnapshot?.etaMinutes) !== null &&
          (job?.latestEtaMinutes ?? order.etaSnapshot?.etaMinutes) !== undefined
            ? `${job?.latestEtaMinutes ?? order.etaSnapshot?.etaMinutes}m`
            : "—",
        candidates: String(candidates.length),
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
      { h: "ORDER", k: "order", w: 150, mono: true },
      { h: "TENANT", k: "tenant", w: 150, mono: true },
      { h: "PICKUP → DROP", k: "route", w: 340 },
      { h: "WINDOW", k: "window", w: 132, mono: true },
      { h: "SERVICE", k: "service", w: 130, mono: true },
      { h: "ETA", k: "eta", w: 80, mono: true },
      { h: "CAND", k: "candidates", w: 70, mono: true, align: "right" },
      { h: "GATE", k: "gate", w: 210 },
      { h: "ACTIONS", k: "actions", w: 260 },
    ];
  }

  return (
    <>
      <DispatchAutoRefresh
        intervalMs={Math.max(currentRefresh.staleAfterMs || 5000, 5000)}
      />
      <PageHeader
        theme={theme}
        title={t("dispatch.title", locale)}
        subtitle={
          zh
            ? "即時派車工作流 · 6 個子看板 · queue / candidates / ETA / override"
            : "Live dispatch workflow · 6 sub-boards · queue / candidates / ETA / override"
        }
        actions={
          <>
            <Pill theme={theme} tone="accent">
              T2 dispatch / 5s
            </Pill>
            <Pill theme={theme} tone="neutral">
              {boardMeta.label}
            </Pill>
            <Link
              href={buildDispatchHref(
                focusWorkItemId
                  ? {
                      board,
                      service: selectedService,
                      facet: selectedFacet,
                      workItemId: focusWorkItemId,
                    }
                  : {
                      board,
                      service: selectedService,
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
              <div style={filterRowStyle}>
                {board === "forwarded"
                  ? (
                      [
                        ["all", `${zh ? "全部" : "All"} ${forwardedBaseCount}`],
                        [
                          "attention",
                          `${zh ? "需注意" : "Attention"} ${sortedForwardedOrders.filter(needsForwardedAttention).length}`,
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
                          `${zh ? "終態" : "Terminal"} ${sortedForwardedOrders.filter(isForwardedTerminal).length}`,
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
                      ["all", zh ? "全部服務" : "All services"],
                      ...serviceBuckets.map((item) => [
                        item,
                        formatDispatchCode(locale, item),
                      ]),
                    ].map(([serviceKey, label]) => (
                      <Link
                        key={serviceKey}
                        href={buildDispatchHref({
                          board,
                          service: serviceKey,
                        })}
                        style={{ textDecoration: "none" }}
                      >
                        <Pill
                          theme={theme}
                          tone={
                            selectedService === serviceKey
                              ? "accent"
                              : "neutral"
                          }
                          dot={serviceKey !== "all"}
                        >
                          {label}
                        </Pill>
                      </Link>
                    ))}
              </div>

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
                    ? `${zh ? "顯示" : "Showing"} ${visibleForwardedOrders.length} / ${forwardedBaseCount}`
                    : `${zh ? "顯示" : "Showing"} ${visibleOwnedByBoard.length} / ${boardCounts[board]}`}
                </span>
                <span>{formatRefreshSummary(currentRefresh, locale)}</span>
              </div>
            </div>

            {boardEmptyState ? (
              <div style={{ padding: 24 }}>
                {renderEmptyState(board, boardEmptyState, locale)}
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
                            {zh ? "焦點 work item" : "Focused work item"}
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
                        <div style={selectedMetaCellStyle}>
                          <span style={{ fontSize: 11, color: theme.textDim }}>
                            {zh ? "跨 app deep links" : "Cross-app deep links"}
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
                                  platform-admin ↗
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
                    <WorkflowEmptyState
                      density="compact"
                      title={zh ? "沒有焦點 work item" : "No focused work item"}
                      description={
                        zh
                          ? "目前 board 沒有可選擇的列。"
                          : "There is no selected row on the current board."
                      }
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

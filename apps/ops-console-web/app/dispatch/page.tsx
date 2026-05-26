import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  AdapterHealthRecord,
  DispatchCandidate,
  DispatchJobRecord,
  DriverTaskRecord,
  EmptyReason,
  EmptyStateEnvelope,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
  OwnedOrderRecord,
  ResourceActionDescriptor,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { formatCompactNumber } from "@/lib/ops-analytics";
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

type DispatchPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type BoardId =
  | "ready"
  | "assigned"
  | "exception"
  | "no_supply"
  | "governance"
  | "forwarded";

type BoardMeta = {
  id: BoardId;
  zh: string;
  en: string;
  tone: CanvasTone;
};

type UiReadModelList<T> = {
  items: T[];
  refresh: UiRefreshMetadata;
  emptyState?: EmptyStateEnvelope;
};

type UiListLoad<T> = {
  status: "ok" | "error";
  items: T[];
  refresh: UiRefreshMetadata;
  health: UiHealthEnvelope;
  emptyState?: EmptyStateEnvelope;
  errorMessage?: string;
};

type AuxListLoad<T> = {
  items: T[];
  errorMessage?: string;
};

type FocusTarget = {
  orderId?: string;
  bookingId?: string;
};

type DispatchActionContext = {
  board: BoardId;
  order?: OwnedOrderRecord;
  forwarded?: ForwardedOrderRecord;
  adapterHealth?: AdapterHealthRecord | null;
};

type TableRow = Record<string, unknown> & {
  _selected?: boolean;
};

type BoardFilterOption = {
  key: string;
  count: number;
  href: string;
  label: string;
  tone: CanvasTone;
};

type OwnedWorkItem = {
  order: OwnedOrderRecord;
  job: DispatchJobRecord | null;
  task: DriverTaskRecord | null;
  board: Exclude<BoardId, "forwarded">;
  visibleState: string;
};

type ForwardedWorkItem = {
  order: ForwardedOrderRecord;
  adapterHealth: AdapterHealthRecord | null;
  issue: ForwarderReconciliationIssue | null;
};

const BOARD_META: readonly BoardMeta[] = [
  { id: "ready", zh: "待派遣", en: "Ready queue", tone: "accent" },
  { id: "assigned", zh: "已指派", en: "Assigned", tone: "success" },
  { id: "exception", zh: "例外保留", en: "Exception hold", tone: "warn" },
  {
    id: "no_supply",
    zh: "無可用司機",
    en: "No eligible supply",
    tone: "danger",
  },
  { id: "governance", zh: "需審批", en: "Governance blocked", tone: "warn" },
  { id: "forwarded", zh: "外部鏡像", en: "Forwarded mirror", tone: "info" },
] as const;

const OWNED_ACTIVE_DRIVER_TASK_STATES = [
  "pending_acceptance",
  "accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
] as const;

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

const BOARD_ORDER: Record<BoardId, number> = {
  governance: 0,
  no_supply: 1,
  exception: 2,
  ready: 3,
  assigned: 4,
  forwarded: 5,
};

const BOARD_SUBTITLES: Record<BoardId, { zh: string; en: string }> = {
  ready: {
    zh: "owned queue 基礎流：queued / broadcasting / assigned 前置階段",
    en: "owned queue base flow: queued / broadcasting / pre-assignment",
  },
  assigned: {
    zh: "driver-assigned / on-trip / proof 流程",
    en: "driver-assigned / on-trip / proof workflow",
  },
  exception: {
    zh: "清除 hold 前不可回到派遣隊列",
    en: "must clear the hold before re-queueing",
  },
  no_supply: {
    zh: "需要 supply intervention 或人工處理",
    en: "requires supply intervention or manual resolution",
  },
  governance: {
    zh: "需透過 approval queue 才能恢復派遣",
    en: "approval queue action required before dispatch resumes",
  },
  forwarded: {
    zh: "鏡像只做 triage；真正 mutation 仍在 platform-admin",
    en: "triage mirror only; mutation authority remains in platform-admin",
  },
};

const ACTION_LABELS: Record<
  string,
  {
    zh: string;
    en: string;
    icon?: "ext" | "warn" | "check" | "arrow" | "clock";
  }
> = {
  assign: { zh: "指派", en: "assign", icon: "check" },
  redispatch: { zh: "改派", en: "redispatch", icon: "arrow" },
  fare_override: { zh: "改價審批", en: "fare override", icon: "warn" },
  release: { zh: "放開司機", en: "release", icon: "arrow" },
  cancel: { zh: "取消", en: "cancel", icon: "warn" },
  resolve_hold: { zh: "解除保留", en: "resolve hold", icon: "check" },
  escalate: { zh: "升級事故", en: "escalate", icon: "warn" },
  extend: { zh: "擴大搜尋", en: "extend search", icon: "arrow" },
  manual: { zh: "人工處理", en: "manual resolve", icon: "clock" },
  review_approval: { zh: "前往審批", en: "review approval", icon: "ext" },
  reconcile: { zh: "啟動對帳", en: "reconcile", icon: "clock" },
  manual_fallback: { zh: "人工 fallback", en: "manual fallback", icon: "warn" },
  force_refresh: { zh: "強制同步", en: "force refresh", icon: "arrow" },
  inspect_adapter: { zh: "查看 adapter", en: "inspect adapter", icon: "ext" },
};

const DISABLED_REASON_LABELS: Record<string, { zh: string; en: string }> = {
  approval_pending: { zh: "等待審批中", en: "approval pending" },
  terminal_status: { zh: "終態不可操作", en: "terminal state" },
  already_queued: { zh: "已排入處理", en: "already queued" },
  manual_fallback_active: {
    zh: "manual fallback 已啟用",
    en: "manual fallback already active",
  },
  order_not_cancelable: { zh: "目前不可取消", en: "order is not cancelable" },
  on_trip: { zh: "行程已開始", en: "trip already started" },
  trip_started: { zh: "行程已開始", en: "trip already started" },
  exception_hold: { zh: "先解除 hold", en: "resolve hold first" },
};

const UNKNOWN_REFRESH: UiRefreshMetadata = {
  generatedAt: new Date(0).toISOString(),
  staleAfterMs: 0,
  dataFreshness: "unknown",
  source: "live",
};

const HEALTHY_HEALTH: UiHealthEnvelope = {
  status: "healthy",
  degradedServices: [],
  lastCheckedAt: new Date(0).toISOString(),
};

const REFRESH_TIER_LABEL = "T2 · 5s";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const pageStackStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const boardNavStyle: CSSProperties = {
  padding: "14px 24px 0",
  borderBottom: `1px solid ${theme.border}`,
  background: theme.bg,
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const emptyCardStyle: CSSProperties = {
  padding: 22,
  display: "grid",
  gridTemplateColumns: "48px minmax(0, 1fr)",
  gap: 14,
  alignItems: "flex-start",
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isBoardId(value: string | undefined): value is BoardId {
  return BOARD_META.some((meta) => meta.id === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

  const candidates = [
    value.addressName,
    value.address,
    value.label,
    value.name,
    value.summary,
    value.title,
  ];
  for (const candidate of candidates) {
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

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getCrossAppOrigin(
  target: "ops-console" | "platform-admin" | "tenant-console",
) {
  switch (target) {
    case "platform-admin":
      return (
        process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN ||
        process.env.PLATFORM_ADMIN_ORIGIN ||
        process.env.STAGING_PLATFORM_ADMIN_ORIGIN ||
        process.env.DEV_PLATFORM_ADMIN_ORIGIN ||
        "http://localhost:3102"
      );
    case "tenant-console":
      return (
        process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN ||
        process.env.TENANT_CONSOLE_ORIGIN ||
        process.env.STAGING_TENANT_CONSOLE_ORIGIN ||
        process.env.DEV_TENANT_CONSOLE_ORIGIN ||
        "http://localhost:3101"
      );
    case "ops-console":
    default:
      return (
        process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN ||
        process.env.OPS_CONSOLE_ORIGIN ||
        process.env.STAGING_OPS_CONSOLE_ORIGIN ||
        process.env.DEV_OPS_CONSOLE_ORIGIN ||
        "http://localhost:3103"
      );
  }
}

function buildCrossAppHref(
  target: "ops-console" | "platform-admin" | "tenant-console",
  route: string,
) {
  const normalizedOrigin = stripTrailingSlash(getCrossAppOrigin(target));
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `${normalizedOrigin}${normalizedRoute}`;
}

function buildPlatformAdminAdapterHref(platformCode?: string | null) {
  const params = new URLSearchParams();
  if (platformCode) {
    params.set("platformCode", platformCode);
  }
  const query = params.toString();
  return buildCrossAppHref(
    "platform-admin",
    `/adapter-registry${query ? `?${query}` : ""}`,
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return String(error);
}

function inferEmptyReason(error: unknown): EmptyReason {
  const message = getErrorMessage(error);
  if (message.includes("403")) {
    return "permission_denied";
  }
  if (message.includes("404")) {
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

async function loadUiList<T>(
  client: Awaited<ReturnType<typeof getServerOpsClient>>,
  path: string,
  fallbackMessageCode: string,
): Promise<UiListLoad<T>> {
  try {
    const response = await client.unwrap<UiReadModelList<T>>("GET", path);
    return {
      status: "ok",
      items: response.data.items ?? [],
      refresh: response.data.refresh ?? UNKNOWN_REFRESH,
      health: response.health ?? HEALTHY_HEALTH,
      ...(response.data.emptyState
        ? { emptyState: response.data.emptyState }
        : {}),
    };
  } catch (error) {
    return {
      status: "error",
      items: [],
      refresh: UNKNOWN_REFRESH,
      health: HEALTHY_HEALTH,
      emptyState: {
        reason: inferEmptyReason(error),
        messageCode: fallbackMessageCode,
      },
      errorMessage: getErrorMessage(error),
    };
  }
}

async function loadAuxList<T>(
  loader: () => Promise<T[]>,
): Promise<AuxListLoad<T>> {
  try {
    return { items: await loader() };
  } catch (error) {
    return {
      items: [],
      errorMessage: getErrorMessage(error),
    };
  }
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
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
    .format(parsed)
    .replace(",", "");
}

function formatWindow(order: OwnedOrderRecord, locale: Locale) {
  if (!order.reservationWindowStart || !order.reservationWindowEnd) {
    return locale === "zh" ? "即時" : "realtime";
  }

  return `${formatDateTime(locale, order.reservationWindowStart)} → ${formatDateTime(locale, order.reservationWindowEnd)}`;
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

function formatAge(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    return "—";
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - millis) / 60000));
  if (diffMinutes < 1) {
    return locale === "zh" ? "剛剛" : "now";
  }
  if (diffMinutes < 60) {
    return locale === "zh" ? `${diffMinutes} 分` : `${diffMinutes} min`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return locale === "zh" ? `${diffHours} 小時` : `${diffHours} hr`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return locale === "zh" ? `${diffDays} 天` : `${diffDays} d`;
}

function formatEtaLabel(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) {
    return "—";
  }

  return `${minutes}m`;
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

function isOwnedActiveDriverTaskState(
  status: DriverTaskRecord["status"],
): status is (typeof OWNED_ACTIVE_DRIVER_TASK_STATES)[number] {
  return OWNED_ACTIVE_DRIVER_TASK_STATES.includes(
    status as (typeof OWNED_ACTIVE_DRIVER_TASK_STATES)[number],
  );
}

function hasGovernanceAction(order: OwnedOrderRecord) {
  return (
    order.availableActions?.some(
      (action: ResourceActionDescriptor) => action.action === "review_approval",
    ) ||
    (order.approvalRequestIds.length > 0 &&
      ["pending", "blocked", "rejected"].includes(order.approvalState))
  );
}

function getVisibleOwnedState(
  order: OwnedOrderRecord,
  job: DispatchJobRecord | null,
  task: DriverTaskRecord | null,
) {
  if (hasGovernanceAction(order)) {
    return "override_pending";
  }

  if (order.status === "no_supply" || order.status === "delayed_queue") {
    return "no_supply";
  }

  if (order.status === "exception_hold") {
    return "exception_hold";
  }

  if (task && isOwnedActiveDriverTaskState(task.status)) {
    return task.status;
  }

  if (job?.status === "assigned") {
    return "assigned";
  }

  if (job?.status === "matching") {
    return "broadcasting";
  }

  if (
    job?.status === "queued" ||
    job?.status === "reserved" ||
    job?.status === "redispatch_required"
  ) {
    return "queued";
  }

  if (
    order.status === "ready_for_dispatch" ||
    order.status === "preassigned" ||
    order.status === "recording_pending" ||
    order.status === "redispatch_required" ||
    order.status === "created"
  ) {
    return "queued";
  }

  return order.status;
}

function resolveOwnedBoard(order: OwnedOrderRecord, visibleState: string) {
  if (visibleState === "override_pending") {
    return "governance";
  }

  if (visibleState === "exception_hold") {
    return "exception";
  }

  if (visibleState === "no_supply") {
    return "no_supply";
  }

  if (
    visibleState === "assigned" ||
    OWNED_ACTIVE_DRIVER_TASK_STATES.includes(
      visibleState as (typeof OWNED_ACTIVE_DRIVER_TASK_STATES)[number],
    )
  ) {
    return "assigned";
  }

  return "ready";
}

function getOwnedGateSummary(order: OwnedOrderRecord): {
  label: string;
  tone: CanvasTone;
} {
  if (hasGovernanceAction(order)) {
    return { label: "approval_pending", tone: "warn" };
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

  return { label: "ok", tone: "success" };
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

function getAdapterTone(status: AdapterHealthRecord["status"]): CanvasTone {
  switch (status) {
    case "down":
      return "danger";
    case "degraded":
      return "warn";
    case "healthy":
    default:
      return "success";
  }
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
    case "lost_race":
    case "cancelled_by_platform":
    default:
      return "neutral";
  }
}

function getMismatchSummary(
  order: ForwardedOrderRecord,
  issue: ForwarderReconciliationIssue | null,
) {
  const mismatchCount =
    issue?.reconciliationJob.mismatchCount ??
    order.reconciliationJob?.mismatchCount ??
    0;

  if (mismatchCount > 0) {
    return { label: `${mismatchCount} mismatch`, tone: "warn" as const };
  }

  if (order.manualFallback.required) {
    return {
      label: order.manualFallback.reason ?? "manual_fallback",
      tone: "warn" as const,
    };
  }

  if (order.lastSyncError) {
    return { label: order.lastSyncError.code, tone: "danger" as const };
  }

  if (order.reconciliationJob?.status === "queued") {
    return { label: "reconciliation", tone: "info" as const };
  }

  return { label: "ok", tone: "success" as const };
}

function compareOwnedItems(left: OwnedWorkItem, right: OwnedWorkItem) {
  const boardDiff = BOARD_ORDER[left.board] - BOARD_ORDER[right.board];
  if (boardDiff !== 0) {
    return boardDiff;
  }
  return right.order.updatedAt.localeCompare(left.order.updatedAt);
}

function compareForwardedItems(
  left: ForwardedWorkItem,
  right: ForwardedWorkItem,
) {
  const leftPriority = needsForwardedAttention(left.order)
    ? 0
    : isForwardedTerminal(left.order)
      ? 2
      : 1;
  const rightPriority = needsForwardedAttention(right.order)
    ? 0
    : isForwardedTerminal(right.order)
      ? 2
      : 1;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }
  return right.order.updatedAt.localeCompare(left.order.updatedAt);
}

function resolveBoardMeta(board: BoardId) {
  const found = BOARD_META.find((meta) => meta.id === board);
  return found ?? BOARD_META[0]!;
}

function boardFilterTone(active: boolean, tone: CanvasTone): CanvasTone {
  return active ? tone : "neutral";
}

function getActionLabel(descriptor: ResourceActionDescriptor, locale: Locale) {
  const copy = ACTION_LABELS[descriptor.action];
  if (copy) {
    return locale === "zh" ? copy.zh : copy.en;
  }
  return descriptor.action.replace(/_/g, " ");
}

function getActionDisabledReason(
  descriptor: ResourceActionDescriptor,
  locale: Locale,
) {
  if (!descriptor.disabledReasonCode) {
    return null;
  }

  const copy = DISABLED_REASON_LABELS[descriptor.disabledReasonCode];
  if (copy) {
    return locale === "zh" ? copy.zh : copy.en;
  }
  return descriptor.disabledReasonCode;
}

function getActionHref(
  descriptor: ResourceActionDescriptor,
  context: DispatchActionContext,
): {
  href: string;
  external?: boolean;
} {
  if (descriptor.action === "review_approval") {
    const requestId =
      context.order?.approvalRequestIds[0] ??
      context.order?.exceptionHold?.overrideRequest?.overrideRequestId;
    const params = new URLSearchParams();
    if (requestId) {
      params.set("approvalRequestId", requestId);
    }
    const query = params.toString();
    return { href: `/approval-requests${query ? `?${query}` : ""}` };
  }

  if (descriptor.action === "inspect_adapter") {
    return {
      href: buildPlatformAdminAdapterHref(
        context.forwarded?.platformCode ?? context.adapterHealth?.platformCode,
      ),
      external: true,
    };
  }

  if (context.order) {
    return {
      href: `/dispatch/${encodeURIComponent(context.order.orderId)}`,
    };
  }

  if (!context.forwarded) {
    return { href: "/dispatch" };
  }

  return {
    href: `/dispatch/${encodeURIComponent(context.forwarded.mirrorOrderId)}`,
  };
}

function actionLinkStyle(
  descriptor: ResourceActionDescriptor,
  disabled: boolean,
): CSSProperties {
  const highRisk = descriptor.riskLevel === "high";
  const mediumRisk = descriptor.riskLevel === "medium";

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 8px",
    borderRadius: 8,
    border: `1px solid ${
      disabled
        ? theme.border
        : highRisk
          ? theme.danger
          : mediumRisk
            ? theme.borderStrong
            : theme.border
    }`,
    background: disabled
      ? theme.surfaceLo
      : highRisk
        ? "rgba(239, 68, 68, 0.12)"
        : mediumRisk
          ? theme.surface
          : theme.surfaceLo,
    color: disabled ? theme.textMuted : highRisk ? theme.danger : theme.text,
    textDecoration: "none",
    fontSize: 11.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    opacity: disabled ? 0.7 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function renderActionLinks(
  descriptors: ResourceActionDescriptor[] | undefined,
  context: DispatchActionContext,
  locale: Locale,
) {
  if (!descriptors || descriptors.length === 0) {
    return (
      <span style={{ color: theme.textMuted }}>
        {locale === "zh" ? "唯讀" : "read-only"}
      </span>
    );
  }

  const visible = descriptors.slice(0, 3);
  const extraCount = descriptors.length - visible.length;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: 280 }}>
      {visible.map((descriptor) => {
        const label = getActionLabel(descriptor, locale);
        const href = getActionHref(descriptor, context);
        const disabledReason = getActionDisabledReason(descriptor, locale);
        const copy = ACTION_LABELS[descriptor.action];
        const content = (
          <>
            {copy?.icon ? (
              <CanvasIcon name={copy.icon} size={12} stroke={1.8} />
            ) : null}
            <span>{label}</span>
            {href.external ? <CanvasIcon name="ext" size={11} /> : null}
          </>
        );

        if (!descriptor.enabled) {
          return (
            <span
              key={descriptor.action}
              style={actionLinkStyle(descriptor, true)}
              title={disabledReason ?? undefined}
            >
              {content}
            </span>
          );
        }

        if (href.external) {
          return (
            <a
              key={descriptor.action}
              href={href.href}
              target="_blank"
              rel="noreferrer"
              style={actionLinkStyle(descriptor, false)}
              title={
                descriptor.requiresReason
                  ? locale === "zh"
                    ? "高風險動作會在後續頁面要求理由"
                    : "reason required on next screen"
                  : undefined
              }
            >
              {content}
            </a>
          );
        }

        return (
          <Link
            key={descriptor.action}
            href={href.href}
            style={actionLinkStyle(descriptor, false)}
            title={
              descriptor.requiresReason
                ? locale === "zh"
                  ? "高風險動作會在工作區要求理由"
                  : "reason required in workspace"
                : undefined
            }
          >
            {content}
          </Link>
        );
      })}
      {extraCount > 0 ? (
        <Pill theme={theme} tone="neutral">
          +{extraCount}
        </Pill>
      ) : null}
    </div>
  );
}

function buildDispatchHref(board: BoardId, filter: string, focus: FocusTarget) {
  const params = new URLSearchParams();
  params.set("board", board);
  if (filter && filter !== "all") {
    params.set("filter", filter);
  }
  if (focus.orderId) {
    params.set("orderId", focus.orderId);
  }
  if (focus.bookingId) {
    params.set("bookingId", focus.bookingId);
  }
  const query = params.toString();
  return query ? `/dispatch?${query}` : "/dispatch";
}

function buildBoardFilters(
  board: BoardId,
  activeFilter: string,
  ownedItems: OwnedWorkItem[],
  forwardedItems: ForwardedWorkItem[],
  focus: FocusTarget,
  locale: Locale,
): BoardFilterOption[] {
  if (board === "ready") {
    const readyItems = ownedItems.filter((item) => item.board === "ready");
    const counts = {
      all: readyItems.length,
      queued: readyItems.filter((item) => item.visibleState === "queued")
        .length,
      broadcasting: readyItems.filter(
        (item) => item.visibleState === "broadcasting",
      ).length,
    };
    return [
      {
        key: "all",
        count: counts.all,
        href: buildDispatchHref(board, "all", focus),
        label: locale === "zh" ? `全部 ${counts.all}` : `all ${counts.all}`,
        tone: boardFilterTone(activeFilter === "all", "accent"),
      },
      {
        key: "queued",
        count: counts.queued,
        href: buildDispatchHref(board, "queued", focus),
        label: `queued ${counts.queued}`,
        tone: boardFilterTone(activeFilter === "queued", "info"),
      },
      {
        key: "broadcasting",
        count: counts.broadcasting,
        href: buildDispatchHref(board, "broadcasting", focus),
        label: `broadcasting ${counts.broadcasting}`,
        tone: boardFilterTone(activeFilter === "broadcasting", "info"),
      },
    ];
  }

  if (board === "assigned") {
    const assignedItems = ownedItems.filter(
      (item) => item.board === "assigned",
    );
    const counts = {
      all: assignedItems.length,
      pending_acceptance: assignedItems.filter(
        (item) => item.visibleState === "pending_acceptance",
      ).length,
      accepted: assignedItems.filter((item) => item.visibleState === "accepted")
        .length,
      on_trip: assignedItems.filter((item) => item.visibleState === "on_trip")
        .length,
      proof_pending: assignedItems.filter(
        (item) => item.visibleState === "proof_pending",
      ).length,
    };
    return [
      {
        key: "all",
        count: counts.all,
        href: buildDispatchHref(board, "all", focus),
        label: locale === "zh" ? `全部 ${counts.all}` : `all ${counts.all}`,
        tone: boardFilterTone(activeFilter === "all", "success"),
      },
      {
        key: "pending_acceptance",
        count: counts.pending_acceptance,
        href: buildDispatchHref(board, "pending_acceptance", focus),
        label: `pending_acceptance ${counts.pending_acceptance}`,
        tone: boardFilterTone(activeFilter === "pending_acceptance", "warn"),
      },
      {
        key: "accepted",
        count: counts.accepted,
        href: buildDispatchHref(board, "accepted", focus),
        label: `accepted ${counts.accepted}`,
        tone: boardFilterTone(activeFilter === "accepted", "info"),
      },
      {
        key: "on_trip",
        count: counts.on_trip,
        href: buildDispatchHref(board, "on_trip", focus),
        label: `on_trip ${counts.on_trip}`,
        tone: boardFilterTone(activeFilter === "on_trip", "success"),
      },
      {
        key: "proof_pending",
        count: counts.proof_pending,
        href: buildDispatchHref(board, "proof_pending", focus),
        label: `proof_pending ${counts.proof_pending}`,
        tone: boardFilterTone(activeFilter === "proof_pending", "warn"),
      },
    ];
  }

  if (board === "forwarded") {
    const counts = {
      all: forwardedItems.length,
      attention: forwardedItems.filter((item) =>
        needsForwardedAttention(item.order),
      ).length,
      broadcasted: forwardedItems.filter(
        (item) => item.order.status === "broadcasted",
      ).length,
      accept_pending: forwardedItems.filter(
        (item) => item.order.status === "accept_pending",
      ).length,
      sync_failed: forwardedItems.filter(
        (item) => item.order.status === "sync_failed",
      ).length,
      manual_fallback: forwardedItems.filter(
        (item) => item.order.manualFallback.required,
      ).length,
      terminal: forwardedItems.filter((item) => isForwardedTerminal(item.order))
        .length,
    };
    return [
      {
        key: "all",
        count: counts.all,
        href: buildDispatchHref(board, "all", focus),
        label: locale === "zh" ? `全部 ${counts.all}` : `all ${counts.all}`,
        tone: boardFilterTone(activeFilter === "all", "info"),
      },
      {
        key: "attention",
        count: counts.attention,
        href: buildDispatchHref(board, "attention", focus),
        label: `attention ${counts.attention}`,
        tone: boardFilterTone(activeFilter === "attention", "warn"),
      },
      {
        key: "broadcasted",
        count: counts.broadcasted,
        href: buildDispatchHref(board, "broadcasted", focus),
        label: `broadcasted ${counts.broadcasted}`,
        tone: boardFilterTone(activeFilter === "broadcasted", "info"),
      },
      {
        key: "accept_pending",
        count: counts.accept_pending,
        href: buildDispatchHref(board, "accept_pending", focus),
        label: `accept_pending ${counts.accept_pending}`,
        tone: boardFilterTone(activeFilter === "accept_pending", "warn"),
      },
      {
        key: "sync_failed",
        count: counts.sync_failed,
        href: buildDispatchHref(board, "sync_failed", focus),
        label: `sync_failed ${counts.sync_failed}`,
        tone: boardFilterTone(activeFilter === "sync_failed", "danger"),
      },
      {
        key: "manual_fallback",
        count: counts.manual_fallback,
        href: buildDispatchHref(board, "manual_fallback", focus),
        label: `manual_fallback ${counts.manual_fallback}`,
        tone: boardFilterTone(activeFilter === "manual_fallback", "warn"),
      },
      {
        key: "terminal",
        count: counts.terminal,
        href: buildDispatchHref(board, "terminal", focus),
        label: `terminal ${counts.terminal}`,
        tone: boardFilterTone(activeFilter === "terminal", "neutral"),
      },
    ];
  }

  return [
    {
      key: "all",
      count:
        board === "governance"
          ? ownedItems.filter((item) => item.board === board).length
          : board === "exception"
            ? ownedItems.filter((item) => item.board === board).length
            : ownedItems.filter((item) => item.board === board).length,
      href: buildDispatchHref(board, "all", focus),
      label: locale === "zh" ? "全部" : "all",
      tone: resolveBoardMeta(board).tone,
    },
  ];
}

function applyOwnedFilter(
  items: OwnedWorkItem[],
  board: BoardId,
  filter: string,
) {
  const boardItems = items.filter((item) => item.board === board);

  if (filter === "all") {
    return boardItems;
  }

  if (board === "ready") {
    return boardItems.filter((item) => item.visibleState === filter);
  }

  if (board === "assigned") {
    return boardItems.filter((item) => item.visibleState === filter);
  }

  return boardItems;
}

function applyForwardedFilter(items: ForwardedWorkItem[], filter: string) {
  switch (filter) {
    case "attention":
      return items.filter((item) => needsForwardedAttention(item.order));
    case "broadcasted":
      return items.filter((item) => item.order.status === "broadcasted");
    case "accept_pending":
      return items.filter((item) => item.order.status === "accept_pending");
    case "sync_failed":
      return items.filter((item) => item.order.status === "sync_failed");
    case "manual_fallback":
      return items.filter((item) => item.order.manualFallback.required);
    case "terminal":
      return items.filter((item) => isForwardedTerminal(item.order));
    case "all":
    default:
      return items;
  }
}

function getRefreshTone(
  refresh: UiRefreshMetadata["dataFreshness"],
): CanvasTone {
  switch (refresh) {
    case "stale":
      return "warn";
    case "degraded":
      return "danger";
    case "unknown":
      return "neutral";
    case "fresh":
    default:
      return "success";
  }
}

function mergeHealth(...envelopes: UiHealthEnvelope[]) {
  const degradedServices = envelopes.flatMap(
    (envelope) => envelope.degradedServices,
  );
  const status = envelopes.some((envelope) => envelope.status === "down")
    ? "down"
    : envelopes.some((envelope) => envelope.status === "degraded")
      ? "degraded"
      : "healthy";

  const lastCheckedAt = envelopes
    .map((envelope) => envelope.lastCheckedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    status,
    degradedServices,
    lastCheckedAt: lastCheckedAt ?? HEALTHY_HEALTH.lastCheckedAt,
  } satisfies UiHealthEnvelope;
}

function buildSelectedState(
  explicitBoard: BoardId | null,
  legacyState: string | undefined,
  focus: FocusTarget,
  ownedItems: OwnedWorkItem[],
  forwardedItems: ForwardedWorkItem[],
) {
  if (explicitBoard) {
    return {
      board: explicitBoard,
      filter: legacyState ?? "all",
    };
  }

  const focusOwned = ownedItems.find(
    (item) =>
      (focus.orderId &&
        [item.order.orderId, item.order.orderNo].includes(focus.orderId)) ||
      (focus.bookingId && item.order.bookingId === focus.bookingId),
  );
  if (focusOwned) {
    return {
      board: focusOwned.board,
      filter: "all",
    };
  }

  const focusForwarded = forwardedItems.find(
    (item) =>
      focus.orderId &&
      [item.order.mirrorOrderId, item.order.externalOrderId].includes(
        focus.orderId,
      ),
  );
  if (focusForwarded) {
    return {
      board: "forwarded" as const,
      filter: "all",
    };
  }

  if (legacyState === "broadcasting" || legacyState === "queued") {
    return { board: "ready" as const, filter: legacyState };
  }
  if (
    legacyState === "assigned" ||
    legacyState === "pending_acceptance" ||
    legacyState === "accepted" ||
    legacyState === "on_trip" ||
    legacyState === "proof_pending"
  ) {
    return { board: "assigned" as const, filter: legacyState };
  }
  if (legacyState === "exception_hold") {
    return { board: "exception" as const, filter: "all" };
  }
  if (legacyState === "no_supply") {
    return { board: "no_supply" as const, filter: "all" };
  }
  if (legacyState === "override_pending") {
    return { board: "governance" as const, filter: "all" };
  }
  if (
    legacyState === "attention" ||
    legacyState === "accept_pending" ||
    legacyState === "sync_failed" ||
    legacyState === "manual_fallback" ||
    legacyState === "terminal" ||
    legacyState === "broadcasted"
  ) {
    return { board: "forwarded" as const, filter: legacyState };
  }

  return {
    board: "ready" as const,
    filter: "all",
  };
}

function renderBoardNav(
  activeBoard: BoardId,
  counts: Record<BoardId, number>,
  focus: FocusTarget,
  activeFilter: string,
) {
  return (
    <div style={boardNavStyle}>
      {BOARD_META.map((meta) => {
        const active = meta.id === activeBoard;
        const href = buildDispatchHref(
          meta.id,
          meta.id === activeBoard ? activeFilter : "all",
          focus,
        );
        return (
          <Link
            key={meta.id}
            href={href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 11px 8px",
              borderBottom: `2px solid ${active ? theme.accent : "transparent"}`,
              marginBottom: -1,
              color: active ? theme.text : theme.textMuted,
              textDecoration: "none",
              fontWeight: active ? 600 : 500,
              fontSize: 12.5,
            }}
          >
            <Pill theme={theme} tone={meta.tone} dot={active}>
              {formatCompactNumber(counts[meta.id])}
            </Pill>
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                lineHeight: 1.15,
              }}
            >
              <span>{meta.zh}</span>
              <span
                style={{
                  fontSize: 11,
                  color: active ? theme.textMuted : theme.textDim,
                }}
              >
                {meta.en}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function renderHeaderActionLink({
  href,
  label,
  icon,
  external,
}: {
  href: string;
  label: string;
  icon?: "arrow" | "ext" | "x";
  external?: boolean;
}) {
  const content = (
    <>
      {icon ? <CanvasIcon name={icon} size={13} /> : null}
      <span>{label}</span>
      {external ? <CanvasIcon name="ext" size={11} /> : null}
    </>
  );

  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    background: theme.surfaceLo,
    color: theme.text,
    textDecoration: "none",
    fontSize: 12.5,
    fontWeight: 600,
  };

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" style={style}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} style={style}>
      {content}
    </Link>
  );
}

function renderRefreshBanner(refresh: UiRefreshMetadata, locale: Locale) {
  if (
    refresh.dataFreshness === "fresh" ||
    refresh.dataFreshness === "unknown"
  ) {
    return null;
  }

  return (
    <Banner
      theme={theme}
      tone={refresh.dataFreshness === "degraded" ? "danger" : "warn"}
      icon="clock"
      title={
        locale === "zh"
          ? "資料快照已過期，請以最新讀取為準"
          : "Snapshot is stale; verify against the latest refresh"
      }
      body={
        locale === "zh"
          ? `來源 ${refresh.source}，生成於 ${formatDateTime(locale, refresh.generatedAt)} UTC。`
          : `Source ${refresh.source}; generated at ${formatDateTime(locale, refresh.generatedAt)} UTC.`
      }
    />
  );
}

function renderHealthBanner(health: UiHealthEnvelope, locale: Locale) {
  if (health.status === "healthy") {
    return null;
  }

  const impacted = health.degradedServices
    .slice(0, 3)
    .map(
      (service: NonNullable<UiHealthEnvelope["degradedServices"]>[number]) =>
        `${service.service}: ${service.impact}`,
    )
    .join(" · ");

  return (
    <Banner
      theme={theme}
      tone={health.status === "down" ? "danger" : "warn"}
      icon="warn"
      title={
        locale === "zh"
          ? "依賴服務降級，部份指派資訊可能延遲"
          : "Dependent services are degraded; some dispatch data may lag"
      }
      body={
        impacted ||
        (locale === "zh"
          ? "請留意跨系統資料與實際操作結果是否一致。"
          : "Watch for divergence between mirrored data and actual operations.")
      }
    />
  );
}

function renderAuxiliaryWarnings(
  locale: Locale,
  ...warnings: Array<string | undefined>
) {
  const visible = warnings.filter((warning): warning is string =>
    Boolean(warning),
  );
  if (visible.length === 0) {
    return null;
  }

  return (
    <Banner
      theme={theme}
      tone="warn"
      icon="warn"
      title={
        locale === "zh"
          ? "補充資料載入失敗，部份欄位改以降級資料顯示"
          : "Supplemental data failed to load; some fields are downgraded"
      }
      body={visible.join(" · ")}
    />
  );
}

function renderBoardBanner(
  board: BoardId,
  locale: Locale,
  items: OwnedWorkItem[] | ForwardedWorkItem[],
) {
  if (board === "forwarded") {
    const forwardedItems = items as ForwardedWorkItem[];
    const degraded = forwardedItems.filter(
      (item) => item.adapterHealth && item.adapterHealth.status !== "healthy",
    );
    if (degraded.length === 0) {
      return null;
    }

    if (degraded.length === 1) {
      const first = degraded[0]!;
      return (
        <Banner
          theme={theme}
          tone={first.adapterHealth?.status === "down" ? "danger" : "warn"}
          icon="warn"
          title={`${formatOpsCodeLabel(locale, first.order.platformCode)} adapter ${first.adapterHealth?.status ?? "degraded"}`}
          body={
            first.adapterHealth?.lastError ??
            (locale === "zh"
              ? "forwarded mirror 仍可讀，但真正 mutation 需要轉到 platform-admin。"
              : "the mirror remains readable, but mutation stays in platform-admin.")
          }
          actions={renderHeaderActionLink({
            href: buildPlatformAdminAdapterHref(first.order.platformCode),
            label: locale === "zh" ? "查看 adapter" : "Inspect adapter",
            icon: "ext",
            external: true,
          })}
        />
      );
    }

    return (
      <Banner
        theme={theme}
        tone="warn"
        icon="warn"
        title={
          locale === "zh"
            ? `${degraded.length} 個 adapter 降級`
            : `${degraded.length} adapters are degraded`
        }
        body={degraded
          .slice(0, 3)
          .map((item) => formatOpsCodeLabel(locale, item.order.platformCode))
          .join(" · ")}
        actions={renderHeaderActionLink({
          href: buildPlatformAdminAdapterHref(),
          label: locale === "zh" ? "前往 registry" : "Open registry",
          icon: "ext",
          external: true,
        })}
      />
    );
  }

  if (board === "no_supply" && items.length > 0) {
    return (
      <Banner
        theme={theme}
        tone="danger"
        icon="warn"
        title={
          locale === "zh"
            ? "無可用司機項目需要人工介入"
            : "No-supply items require manual intervention"
        }
        body={
          locale === "zh"
            ? "先判斷要擴大搜尋範圍、改派 service bucket，還是直接人工處理。"
            : "Decide between extending search radius, changing service bucket, or manual rescue."
        }
      />
    );
  }

  if (board === "governance" && items.length > 0) {
    return (
      <Banner
        theme={theme}
        tone="warn"
        icon="warn"
        title={
          locale === "zh"
            ? "需審批項目已阻塞派遣"
            : "Governance-blocked items are waiting on approval"
        }
        body={
          locale === "zh"
            ? "請從 approval queue 處理相關請求，再回到 dispatch 續作。"
            : "Work the approval queue first, then return to dispatch."
        }
        actions={renderHeaderActionLink({
          href: "/approval-requests",
          label: locale === "zh" ? "開啟審批佇列" : "Open approval queue",
          icon: "arrow",
        })}
      />
    );
  }

  return null;
}

function renderEmptyState(
  reason: EmptyReason,
  board: BoardId,
  locale: Locale,
  focus: FocusTarget,
  nextAction?: ResourceActionDescriptor,
) {
  const clearFilterHref = buildDispatchHref(board, "all", focus);
  const adapterHref = buildPlatformAdminAdapterHref();
  const actionCopy = (() => {
    switch (reason) {
      case "not_provisioned":
        return {
          tone: "warn" as const,
          icon: "warn" as const,
          title:
            locale === "zh"
              ? "此看板尚未完成 provisioning"
              : "This board is not provisioned yet",
          body:
            locale === "zh"
              ? "功能已定義，但上游設定或權限還沒開通。"
              : "The workflow exists, but upstream configuration or authority is not enabled yet.",
          href: "/feature-flags",
          label: locale === "zh" ? "查看旗標" : "View flags",
        };
      case "fetch_failed":
        return {
          tone: "danger" as const,
          icon: "x" as const,
          title:
            locale === "zh" ? "資料讀取失敗" : "Failed to load dispatch data",
          body:
            locale === "zh"
              ? "請先重整；若持續失敗，改以 detail 或 audit 驗證。"
              : "Retry the snapshot first; if it keeps failing, verify through detail or audit.",
          href: buildDispatchHref(board, "all", focus),
          label: t("common.refresh", locale),
        };
      case "permission_denied":
        return {
          tone: "warn" as const,
          icon: "warn" as const,
          title:
            locale === "zh"
              ? "目前身份無法查看此看板"
              : "Current identity cannot view this board",
          body:
            locale === "zh"
              ? "這不是空資料，而是 scope / role 不足。"
              : "This is not empty data; the current scope or role is insufficient.",
          href: "/approval-requests",
          label: locale === "zh" ? "切換工作區" : "Open another workspace",
        };
      case "external_unavailable":
        return {
          tone: "danger" as const,
          icon: "ext" as const,
          title:
            locale === "zh"
              ? "外部依賴暫時不可用"
              : "External dependency is unavailable",
          body:
            locale === "zh"
              ? "鏡像或 adapter 狀態異常，請到 owner app 檢查。"
              : "Mirror or adapter state is unavailable; inspect the owner app.",
          href: adapterHref,
          label:
            locale === "zh"
              ? "查看 adapter registry"
              : "Inspect adapter registry",
          external: true,
        };
      case "filtered_empty":
        return {
          tone: "info" as const,
          icon: "search" as const,
          title:
            locale === "zh"
              ? "目前篩選條件沒有結果"
              : "Current filters return no results",
          body:
            locale === "zh"
              ? "放寬 board 內 filter，或回到全部項目再做下一步。"
              : "Relax the board filter or return to all items before the next action.",
          href: clearFilterHref,
          label: locale === "zh" ? "清除篩選" : "Clear filters",
        };
      case "no_data":
      default:
        return {
          tone: "success" as const,
          icon: "check" as const,
          title:
            locale === "zh"
              ? "目前沒有待處理項目"
              : "No work items in this board right now",
          body:
            locale === "zh"
              ? "這是合法的空狀態，不代表載入失敗。"
              : "This is a legitimate empty board, not a loading failure.",
          href: "/dashboard",
          label: locale === "zh" ? "回到 dashboard" : "Back to dashboard",
        };
    }
  })();

  const nextHref =
    nextAction?.action === "inspect_adapter" ? adapterHref : actionCopy.href;
  const nextLabel = nextAction
    ? getActionLabel(nextAction, locale)
    : actionCopy.label;
  const nextExternal =
    nextAction?.action === "inspect_adapter" ? true : actionCopy.external;

  return (
    <div style={emptyCardStyle}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          background:
            actionCopy.tone === "danger"
              ? "rgba(239, 68, 68, 0.14)"
              : actionCopy.tone === "warn"
                ? "rgba(245, 158, 11, 0.14)"
                : actionCopy.tone === "info"
                  ? "rgba(56, 189, 248, 0.14)"
                  : "rgba(16, 185, 129, 0.14)",
          color:
            actionCopy.tone === "danger"
              ? theme.danger
              : actionCopy.tone === "warn"
                ? theme.warn
                : actionCopy.tone === "info"
                  ? theme.info
                  : theme.success,
        }}
      >
        <CanvasIcon name={actionCopy.icon} size={20} />
      </div>
      <div
        style={{
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          <strong style={{ fontSize: 14, color: theme.text }}>
            {actionCopy.title}
          </strong>
          <Pill theme={theme} tone={actionCopy.tone}>
            {reason}
          </Pill>
        </div>
        <div
          style={{ color: theme.textMuted, fontSize: 12.5, lineHeight: 1.5 }}
        >
          {actionCopy.body}
        </div>
        <div>
          {renderHeaderActionLink({
            href: nextHref,
            label: nextLabel,
            ...(nextExternal
              ? { external: true, icon: "ext" }
              : { icon: "arrow" }),
          })}
        </div>
      </div>
    </div>
  );
}

function renderSnapshotStrip(refresh: UiRefreshMetadata, locale: Locale) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <Pill theme={theme} tone="info">
        {REFRESH_TIER_LABEL}
      </Pill>
      <Pill theme={theme} tone={getRefreshTone(refresh.dataFreshness)}>
        {refresh.dataFreshness}
      </Pill>
      <span style={{ fontSize: 12, color: theme.textMuted }}>
        {locale === "zh" ? "snapshot" : "snapshot"}{" "}
        {formatDateTime(locale, refresh.generatedAt)} UTC
      </span>
    </div>
  );
}

function getBoardCountRecord(
  ownedItems: OwnedWorkItem[],
  forwardedItems: ForwardedWorkItem[],
) {
  return {
    ready: ownedItems.filter((item) => item.board === "ready").length,
    assigned: ownedItems.filter((item) => item.board === "assigned").length,
    exception: ownedItems.filter((item) => item.board === "exception").length,
    no_supply: ownedItems.filter((item) => item.board === "no_supply").length,
    governance: ownedItems.filter((item) => item.board === "governance").length,
    forwarded: forwardedItems.length,
  } satisfies Record<BoardId, number>;
}

function buildReadyBoardRows(
  items: OwnedWorkItem[],
  locale: Locale,
  focus: FocusTarget,
  candidateCountsByJobId: Map<string, number>,
) {
  const rows: TableRow[] = items.map((item) => {
    const gate = getOwnedGateSummary(item.order);
    const candidateCount = item.job
      ? (candidateCountsByJobId.get(item.job.dispatchJobId) ??
        item.order.dispatchAttemptCount)
      : item.order.dispatchAttemptCount;

    return {
      orderCell: (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Link
            href={`/dispatch/${encodeURIComponent(item.order.orderId)}`}
            style={{
              color: theme.accent,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {item.order.orderNo}
          </Link>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {item.order.orderId}
          </span>
        </div>
      ),
      tenant: getTenantLabel(item.order),
      routeCell: (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            whiteSpace: "normal",
          }}
        >
          <span>{getAddressLabel(item.order.pickup)}</span>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            ↓ {getAddressLabel(item.order.dropoff)}
          </span>
        </div>
      ),
      window: formatWindow(item.order, locale),
      service: formatOpsCodeLabel(locale, item.order.serviceBucket),
      eta: formatEtaLabel(
        item.job?.latestEtaMinutes ?? item.order.etaSnapshot?.etaMinutes,
      ),
      candidates: String(candidateCount),
      gateCell: (
        <Pill theme={theme} tone={gate.tone} dot={gate.tone !== "success"}>
          {gate.label}
        </Pill>
      ),
      actions: renderActionLinks(
        item.order.availableActions,
        { board: "ready", order: item.order },
        locale,
      ),
      _selected:
        focus.orderId === item.order.orderId ||
        focus.bookingId === item.order.bookingId,
    };
  });

  const columns: CanvasTableColumn<TableRow>[] = [
    { h: "ORDER", k: "orderCell", w: 130, mono: true },
    { h: "TENANT", k: "tenant", w: 148, mono: true },
    { h: "PICKUP → DROP", k: "routeCell", w: 350 },
    { h: "WIN", k: "window", w: 132, mono: true },
    { h: "SERVICE", k: "service", w: 132, mono: true },
    { h: "ETA", k: "eta", w: 84, mono: true },
    { h: "CAND", k: "candidates", w: 72, mono: true, align: "right" },
    { h: "GATE", k: "gateCell", w: 170 },
    { h: "ACTIONS", k: "actions", w: 280 },
  ];

  return { rows, columns };
}

function buildAssignedBoardRows(
  items: OwnedWorkItem[],
  locale: Locale,
  focus: FocusTarget,
) {
  const rows: TableRow[] = items.map((item) => {
    const gate = getOwnedGateSummary(item.order);
    const taskTone = item.visibleState === "proof_pending" ? "warn" : "success";

    return {
      orderCell: (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Link
            href={`/dispatch/${encodeURIComponent(item.order.orderId)}`}
            style={{
              color: theme.accent,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {item.order.orderNo}
          </Link>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {item.order.orderId}
          </span>
        </div>
      ),
      tenant: getTenantLabel(item.order),
      driverCell: (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span>{item.task?.driverId ?? "—"}</span>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {item.task?.vehicleId ?? "—"}
          </span>
        </div>
      ),
      taskCell: (
        <Pill theme={theme} tone={taskTone} dot>
          {item.visibleState}
        </Pill>
      ),
      eta: formatEtaLabel(
        item.job?.latestEtaMinutes ?? item.order.etaSnapshot?.etaMinutes,
      ),
      gateCell: (
        <Pill theme={theme} tone={gate.tone} dot={gate.tone !== "success"}>
          {gate.label}
        </Pill>
      ),
      actions: renderActionLinks(
        item.order.availableActions,
        { board: "assigned", order: item.order },
        locale,
      ),
      _selected:
        focus.orderId === item.order.orderId ||
        focus.bookingId === item.order.bookingId,
    };
  });

  const columns: CanvasTableColumn<TableRow>[] = [
    { h: "ORDER", k: "orderCell", w: 130, mono: true },
    { h: "TENANT", k: "tenant", w: 148, mono: true },
    { h: "DRIVER / VEHICLE", k: "driverCell", w: 150, mono: true },
    { h: "DRIVER TASK", k: "taskCell", w: 170 },
    { h: "ETA", k: "eta", w: 84, mono: true },
    { h: "GATE", k: "gateCell", w: 170 },
    { h: "ACTIONS", k: "actions", w: 320 },
  ];

  return { rows, columns };
}

function buildExceptionBoardRows(
  items: OwnedWorkItem[],
  locale: Locale,
  focus: FocusTarget,
) {
  const rows: TableRow[] = items.map((item) => {
    const hold = item.order.exceptionHold;
    const holdOwner =
      hold?.overrideRequest?.requestedBy.actorId ??
      item.order.complianceGates?.find(
        (gate: NonNullable<OwnedOrderRecord["complianceGates"]>[number]) =>
          gate.blocking,
      )?.reviewerLabel ??
      "—";
    const relatedHref = hold?.reasonCode.includes("incident")
      ? `/incidents?orderId=${encodeURIComponent(item.order.orderId)}`
      : `/complaints?orderId=${encodeURIComponent(item.order.orderId)}`;

    return {
      orderCell: (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Link
            href={`/dispatch/${encodeURIComponent(item.order.orderId)}`}
            style={{
              color: theme.accent,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {item.order.orderNo}
          </Link>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {item.order.orderId}
          </span>
        </div>
      ),
      tenant: getTenantLabel(item.order),
      holdCell: (
        <Pill theme={theme} tone="warn" dot>
          {hold?.reasonCode ?? "exception_hold"}
        </Pill>
      ),
      owner: holdOwner,
      age: formatAge(locale, hold?.raisedAt ?? item.order.updatedAt),
      related: (
        <Link
          href={relatedHref}
          style={{ color: theme.accent, textDecoration: "none" }}
        >
          {locale === "zh" ? "相關案件" : "related case"} →
        </Link>
      ),
      actions: renderActionLinks(
        item.order.availableActions,
        { board: "exception", order: item.order },
        locale,
      ),
      _selected:
        focus.orderId === item.order.orderId ||
        focus.bookingId === item.order.bookingId,
    };
  });

  const columns: CanvasTableColumn<TableRow>[] = [
    { h: "ORDER", k: "orderCell", w: 130, mono: true },
    { h: "TENANT", k: "tenant", w: 148, mono: true },
    { h: "HOLD REASON", k: "holdCell", w: 180 },
    { h: "HOLD OWNER", k: "owner", w: 140 },
    { h: "AGE", k: "age", w: 84, mono: true },
    { h: "RELATED", k: "related", w: 140 },
    { h: "ACTIONS", k: "actions", w: 320 },
  ];

  return { rows, columns };
}

function buildNoSupplyBoardRows(
  items: OwnedWorkItem[],
  locale: Locale,
  focus: FocusTarget,
) {
  const rows: TableRow[] = items.map((item) => {
    const escalation = item.order.noSupplyEscalation;
    const reasonCode =
      item.order.lastDispatchFailureReason ??
      item.order.dispatchTimeout?.timeoutReasonCode ??
      escalation?.escalationAction ??
      "no_supply";

    return {
      orderCell: (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Link
            href={`/dispatch/${encodeURIComponent(item.order.orderId)}`}
            style={{
              color: theme.accent,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {item.order.orderNo}
          </Link>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {item.order.orderId}
          </span>
        </div>
      ),
      tenant: getTenantLabel(item.order),
      attempts: String(
        escalation?.attemptCount ??
          Math.max(1, item.order.dispatchAttemptCount),
      ),
      reasonCell: (
        <Pill theme={theme} tone="danger" dot>
          {reasonCode}
        </Pill>
      ),
      age: formatAge(locale, escalation?.escalatedAt ?? item.order.updatedAt),
      actions: renderActionLinks(
        item.order.availableActions,
        { board: "no_supply", order: item.order },
        locale,
      ),
      _selected:
        focus.orderId === item.order.orderId ||
        focus.bookingId === item.order.bookingId,
    };
  });

  const columns: CanvasTableColumn<TableRow>[] = [
    { h: "ORDER", k: "orderCell", w: 130, mono: true },
    { h: "TENANT", k: "tenant", w: 148, mono: true },
    { h: "ATTEMPTS", k: "attempts", w: 92, mono: true, align: "right" },
    { h: "REASON CODE", k: "reasonCell", w: 180 },
    { h: "AGE", k: "age", w: 84, mono: true },
    { h: "ACTIONS", k: "actions", w: 320 },
  ];

  return { rows, columns };
}

function buildGovernanceBoardRows(
  items: OwnedWorkItem[],
  locale: Locale,
  focus: FocusTarget,
) {
  const rows: TableRow[] = items.map((item) => {
    const requestId =
      item.order.approvalRequestIds[0] ??
      item.order.exceptionHold?.overrideRequest?.overrideRequestId ??
      null;
    const overrideType =
      item.order.exceptionHold?.overrideRequest?.overrideType ??
      (item.order.manualFareOverride ? "fare_override" : "approval_required");
    const requester =
      item.order.exceptionHold?.overrideRequest?.requestedBy.actorId ??
      item.order.manualFareOverride?.actorId ??
      item.order.bookedBy?.name ??
      "—";
    const age =
      item.order.exceptionHold?.overrideRequest?.requestedAt ??
      item.order.updatedAt;
    const approvalHref = requestId
      ? `/approval-requests?approvalRequestId=${encodeURIComponent(requestId)}`
      : "/approval-requests";

    return {
      orderCell: (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Link
            href={`/dispatch/${encodeURIComponent(item.order.orderId)}`}
            style={{
              color: theme.accent,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {item.order.orderNo}
          </Link>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {item.order.orderId}
          </span>
        </div>
      ),
      tenant: getTenantLabel(item.order),
      overrideCell: (
        <Pill theme={theme} tone="warn" dot>
          {overrideType}
        </Pill>
      ),
      requester,
      age: formatAge(locale, age),
      linkCell: (
        <Link
          href={approvalHref}
          style={{ color: theme.accent, textDecoration: "none" }}
        >
          {requestId ?? (locale === "zh" ? "審批佇列" : "approval queue")} →
        </Link>
      ),
      actions: renderActionLinks(
        item.order.availableActions,
        { board: "governance", order: item.order },
        locale,
      ),
      _selected:
        focus.orderId === item.order.orderId ||
        focus.bookingId === item.order.bookingId,
    };
  });

  const columns: CanvasTableColumn<TableRow>[] = [
    { h: "ORDER", k: "orderCell", w: 130, mono: true },
    { h: "TENANT", k: "tenant", w: 148, mono: true },
    { h: "OVERRIDE TYPE", k: "overrideCell", w: 170 },
    { h: "REQUESTER", k: "requester", w: 150 },
    { h: "AGE", k: "age", w: 84, mono: true },
    { h: "LINK", k: "linkCell", w: 180 },
    { h: "ACTIONS", k: "actions", w: 240 },
  ];

  return { rows, columns };
}

function buildForwardedBoardRows(
  items: ForwardedWorkItem[],
  locale: Locale,
  focus: FocusTarget,
) {
  const rows: TableRow[] = items.map((item) => {
    const mismatch = getMismatchSummary(item.order, item.issue);

    return {
      mirrorCell: (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Link
            href={`/dispatch/${encodeURIComponent(item.order.mirrorOrderId)}`}
            style={{
              color: theme.accent,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {item.order.mirrorOrderId}
          </Link>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {item.order.externalOrderId}
          </span>
        </div>
      ),
      source: formatOpsCodeLabel(locale, item.order.platformCode),
      externalOrderId: item.order.externalOrderId,
      routeCell: (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            whiteSpace: "normal",
          }}
        >
          <span>
            {readForwardedValue(item.order, [
              "pickupSummary",
              "pickupAddress",
              "pickup.addressName",
              "pickup.address",
              "pickup",
            ]) ?? "—"}
          </span>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            ↓{" "}
            {readForwardedValue(item.order, [
              "dropoffSummary",
              "dropoffAddress",
              "dropoff.addressName",
              "dropoff.address",
              "dropoff",
            ]) ?? "—"}
          </span>
        </div>
      ),
      window: formatForwardedWindow(item.order, locale),
      stateCell: (
        <Pill theme={theme} tone={getForwardedStateTone(item.order.status)} dot>
          {item.order.status}
        </Pill>
      ),
      adapterCell: item.adapterHealth ? (
        <Pill theme={theme} tone={getAdapterTone(item.adapterHealth.status)}>
          {item.order.platformCode} · {item.adapterHealth.status}
        </Pill>
      ) : (
        <Pill theme={theme} tone="neutral">
          {item.order.platformCode}
        </Pill>
      ),
      mismatchCell: (
        <Pill
          theme={theme}
          tone={mismatch.tone}
          dot={mismatch.tone !== "success"}
        >
          {mismatch.label}
        </Pill>
      ),
      actions: renderActionLinks(
        item.order.availableActions,
        {
          board: "forwarded",
          forwarded: item.order,
          ...(item.adapterHealth ? { adapterHealth: item.adapterHealth } : {}),
        },
        locale,
      ),
      _selected:
        focus.orderId === item.order.mirrorOrderId ||
        focus.orderId === item.order.externalOrderId,
    };
  });

  const columns: CanvasTableColumn<TableRow>[] = [
    { h: "MIRROR ID", k: "mirrorCell", w: 138, mono: true },
    { h: "SOURCE", k: "source", w: 146 },
    { h: "EXTERNAL", k: "externalOrderId", w: 154, mono: true },
    { h: "PICKUP → DROP", k: "routeCell", w: 330 },
    { h: "WIN", k: "window", w: 132, mono: true },
    { h: "STATUS", k: "stateCell", w: 156 },
    { h: "ADAPTER", k: "adapterCell", w: 154 },
    { h: "MISMATCH", k: "mismatchCell", w: 162 },
    { h: "ACTIONS", k: "actions", w: 280 },
  ];

  return { rows, columns };
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

  const boardParam = firstParam(resolvedSearchParams.board);
  const filterParam = firstParam(resolvedSearchParams.filter);
  const legacyView = firstParam(resolvedSearchParams.view);
  const legacyState = firstParam(resolvedSearchParams.state);
  const focusOrderId = firstParam(resolvedSearchParams.orderId);
  const focusBookingId = firstParam(resolvedSearchParams.bookingId);
  const focus: FocusTarget = {
    ...(focusOrderId ? { orderId: focusOrderId } : {}),
    ...(focusBookingId ? { bookingId: focusBookingId } : {}),
  };

  const explicitBoard = isBoardId(boardParam)
    ? boardParam
    : legacyView === "forwarded"
      ? "forwarded"
      : null;

  const [
    ownedLoad,
    forwardedLoad,
    dispatchJobsLoad,
    driverTasksLoad,
    adapterHealthLoad,
    reconciliationIssuesLoad,
  ] = await Promise.all([
    loadUiList<OwnedOrderRecord>(
      client,
      "/api/orders",
      "dispatch.owned.empty.fetch_failed",
    ),
    loadUiList<ForwardedOrderRecord>(
      client,
      "/api/forwarder/orders",
      "dispatch.forwarded.empty.fetch_failed",
    ),
    loadAuxList<DispatchJobRecord>(() => client.listDispatchJobs()),
    loadAuxList<DriverTaskRecord>(() => client.listDriverTasks()),
    loadAuxList<AdapterHealthRecord>(async () => {
      const response = await client.get<{ items: AdapterHealthRecord[] }>(
        "/api/forwarder/adapters/health",
      );
      return response.items ?? [];
    }),
    loadAuxList<ForwarderReconciliationIssue>(() =>
      client.listForwarderReconciliationIssues(),
    ),
  ]);

  const jobByOrderId = new Map(
    dispatchJobsLoad.items.map((job) => [job.orderId, job]),
  );
  const tasksByOrderId = new Map<string, DriverTaskRecord[]>();
  for (const task of driverTasksLoad.items) {
    const existing = tasksByOrderId.get(task.orderId);
    if (existing) {
      existing.push(task);
    } else {
      tasksByOrderId.set(task.orderId, [task]);
    }
  }

  const adapterByPlatform = new Map(
    adapterHealthLoad.items.map((adapter) => [adapter.platformCode, adapter]),
  );
  const issueByMirrorId = new Map(
    reconciliationIssuesLoad.items.map((issue) => [issue.mirrorOrderId, issue]),
  );

  const ownedItems = ownedLoad.items
    .map((order) => {
      const job = jobByOrderId.get(order.orderId) ?? null;
      const task = pickCurrentTask(tasksByOrderId.get(order.orderId) ?? []);
      const visibleState = getVisibleOwnedState(order, job, task);
      return {
        order,
        job,
        task,
        visibleState,
        board: resolveOwnedBoard(order, visibleState),
      } satisfies OwnedWorkItem;
    })
    .sort(compareOwnedItems);

  const forwardedItems = forwardedLoad.items
    .map((order) => ({
      order,
      adapterHealth: adapterByPlatform.get(order.platformCode) ?? null,
      issue: issueByMirrorId.get(order.mirrorOrderId) ?? null,
    }))
    .sort(compareForwardedItems);

  const selected = buildSelectedState(
    explicitBoard,
    filterParam ?? legacyState,
    focus,
    ownedItems,
    forwardedItems,
  );
  const activeBoard = selected.board;
  const activeFilter = selected.filter || "all";

  const boardCounts = getBoardCountRecord(ownedItems, forwardedItems);
  const filters = buildBoardFilters(
    activeBoard,
    activeFilter,
    ownedItems,
    forwardedItems,
    focus,
    locale,
  );

  const activeRefresh =
    activeBoard === "forwarded" ? forwardedLoad.refresh : ownedLoad.refresh;
  const activeHealth =
    activeBoard === "forwarded"
      ? mergeHealth(forwardedLoad.health)
      : mergeHealth(ownedLoad.health);

  const ownedVisibleItems =
    activeBoard === "forwarded"
      ? []
      : applyOwnedFilter(ownedItems, activeBoard, activeFilter);
  const forwardedVisibleItems =
    activeBoard === "forwarded"
      ? applyForwardedFilter(forwardedItems, activeFilter)
      : [];

  const candidateCountsByJobId = new Map<string, number>();
  if (activeBoard === "ready") {
    const visibleJobIds = Array.from(
      new Set(
        ownedVisibleItems
          .map((item) => item.job?.dispatchJobId)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const candidateCounts = await Promise.all(
      visibleJobIds.map(async (dispatchJobId) => {
        const result = await loadAuxList<DispatchCandidate>(() =>
          client.listDispatchCandidates(dispatchJobId),
        );
        return [dispatchJobId, result.items.length] as const;
      }),
    );
    for (const [dispatchJobId, count] of candidateCounts) {
      candidateCountsByJobId.set(dispatchJobId, count);
    }
  }

  const activeMeta = resolveBoardMeta(activeBoard);
  const boardSubtitle = BOARD_SUBTITLES[activeBoard];

  let boardTitle = locale === "zh" ? activeMeta.zh : activeMeta.en;
  if (locale === "zh") {
    boardTitle = `${activeMeta.zh} · ${formatCompactNumber(boardCounts[activeBoard])} 筆`;
  } else {
    boardTitle = `${activeMeta.en} · ${formatCompactNumber(boardCounts[activeBoard])} items`;
  }

  let rows: TableRow[] = [];
  let columns: CanvasTableColumn<TableRow>[] = [];
  let emptyReason: EmptyReason =
    (activeBoard === "forwarded"
      ? forwardedLoad.emptyState?.reason
      : ownedLoad.emptyState?.reason) ?? "no_data";
  let nextAction: ResourceActionDescriptor | undefined;

  if (activeBoard === "ready") {
    const built = buildReadyBoardRows(
      ownedVisibleItems,
      locale,
      focus,
      candidateCountsByJobId,
    );
    rows = built.rows;
    columns = built.columns;
    if (
      ownedVisibleItems.length === 0 &&
      boardCounts.ready > 0 &&
      activeFilter !== "all"
    ) {
      emptyReason = "filtered_empty";
    }
  } else if (activeBoard === "assigned") {
    const built = buildAssignedBoardRows(ownedVisibleItems, locale, focus);
    rows = built.rows;
    columns = built.columns;
    if (
      ownedVisibleItems.length === 0 &&
      boardCounts.assigned > 0 &&
      activeFilter !== "all"
    ) {
      emptyReason = "filtered_empty";
    }
  } else if (activeBoard === "exception") {
    const built = buildExceptionBoardRows(ownedVisibleItems, locale, focus);
    rows = built.rows;
    columns = built.columns;
  } else if (activeBoard === "no_supply") {
    const built = buildNoSupplyBoardRows(ownedVisibleItems, locale, focus);
    rows = built.rows;
    columns = built.columns;
  } else if (activeBoard === "governance") {
    const built = buildGovernanceBoardRows(ownedVisibleItems, locale, focus);
    rows = built.rows;
    columns = built.columns;
  } else {
    const built = buildForwardedBoardRows(forwardedVisibleItems, locale, focus);
    rows = built.rows;
    columns = built.columns;
    if (
      forwardedVisibleItems.length === 0 &&
      boardCounts.forwarded > 0 &&
      activeFilter !== "all"
    ) {
      emptyReason = "filtered_empty";
    }
  }

  if (rows.length === 0) {
    nextAction =
      activeBoard === "forwarded"
        ? forwardedLoad.emptyState?.nextAction
        : ownedLoad.emptyState?.nextAction;
  }

  const refreshHref = buildDispatchHref(activeBoard, activeFilter, focus);
  const clearFilterHref = buildDispatchHref(activeBoard, "all", focus);

  return (
    <>
      <PageHeader
        theme={theme}
        title={locale === "zh" ? "派車調度" : "Dispatch"}
        subtitle={
          locale === "zh"
            ? "即時派遣工作流 · 6 個子看板 · availableActions / EmptyReason / refresh tier"
            : "Live dispatch workflow · 6 peer boards · availableActions / EmptyReason / refresh tier"
        }
        actions={
          <>
            {activeFilter !== "all"
              ? renderHeaderActionLink({
                  href: clearFilterHref,
                  label: locale === "zh" ? "清除篩選" : "Clear filter",
                  icon: "x",
                })
              : null}
            {activeBoard === "forwarded"
              ? renderHeaderActionLink({
                  href: buildPlatformAdminAdapterHref(),
                  label:
                    locale === "zh" ? "Adapter registry" : "Adapter registry",
                  icon: "ext",
                  external: true,
                })
              : activeBoard === "governance"
                ? renderHeaderActionLink({
                    href: "/approval-requests",
                    label: locale === "zh" ? "審批佇列" : "Approval queue",
                    icon: "arrow",
                  })
                : null}
            {renderHeaderActionLink({
              href: refreshHref,
              label: t("common.refresh", locale),
              icon: "arrow",
            })}
          </>
        }
      />

      {renderBoardNav(activeBoard, boardCounts, focus, activeFilter)}

      <div style={pageStackStyle}>
        {renderSnapshotStrip(activeRefresh, locale)}
        {renderHealthBanner(activeHealth, locale)}
        {renderRefreshBanner(activeRefresh, locale)}
        {renderAuxiliaryWarnings(
          locale,
          dispatchJobsLoad.errorMessage,
          driverTasksLoad.errorMessage,
          adapterHealthLoad.errorMessage,
          reconciliationIssuesLoad.errorMessage,
        )}
        {renderBoardBanner(
          activeBoard,
          locale,
          activeBoard === "forwarded"
            ? forwardedVisibleItems
            : ownedVisibleItems,
        )}

        {filters.length > 1 ? (
          <div style={filterRowStyle}>
            {filters.map((filter) => (
              <Link
                key={filter.key}
                href={filter.href}
                style={{ textDecoration: "none" }}
              >
                <Pill
                  theme={theme}
                  tone={filter.tone}
                  dot={filter.key !== "all"}
                >
                  {filter.label}
                </Pill>
              </Link>
            ))}
          </div>
        ) : null}

        <Card
          theme={theme}
          title={boardTitle}
          subtitle={locale === "zh" ? boardSubtitle.zh : boardSubtitle.en}
          {...(rows.length > 0 ? { padding: 0 } : {})}
        >
          {rows.length > 0 ? (
            <Table theme={theme} columns={columns} rows={rows} />
          ) : (
            renderEmptyState(
              emptyReason,
              activeBoard,
              locale,
              focus,
              nextAction,
            )
          )}
        </Card>
      </div>
    </>
  );
}

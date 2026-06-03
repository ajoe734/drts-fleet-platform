import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import type {
  AdapterHealthRecord,
  CrossAppResourceLink,
  DispatchCandidate,
  DispatchJobRecord,
  DispatchTraceLogRecord,
  DriverRegistryRecord,
  DriverTaskRecord,
  EmptyReason,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
  OwnedOrderRecord,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { formatMinorCurrency } from "@/lib/ops-analytics";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import { getCandidateLocationState } from "../location-state";

type DispatchDetailPageProps = {
  params: Promise<{
    dispatchId: string;
  }>;
};

type CandidateRow = Record<string, unknown> & {
  candidate: DispatchCandidate;
  driver: DriverRegistryRecord | null;
  rankCell: ReactNode;
  driverCell: ReactNode;
  vehicle: string;
  etaCell: ReactNode;
  gateLabel: string;
  gateTone: "success" | "warn" | "danger";
  gateCell: ReactNode;
  score: string;
  _selected?: boolean;
};

type ActivityEntry = {
  id: string;
  title: string;
  body: string;
  at: string;
  tone: "accent" | "info" | "warn" | "danger";
  actor?: string | null;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

// Refresh tier T2 (Dispatch): 5s cadence per packet §3.2 / §5.3.
const REFRESH_TIER_LABEL = "T2 · 5s";
const REFRESH_STALE_AFTER_MS = 5_000;

const WORKFLOW_STEPS = [
  "建立",
  "queued",
  "broadcasting",
  "assigned",
  "on_trip",
  "completed",
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

type LoadResult<T> = {
  data: T;
  failed: boolean;
};

async function load<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), failed: false };
  } catch {
    return { data: fallback, failed: true };
  }
}

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

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
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

function formatLongDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return copy(locale, "unknown", "未知");
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

  if (order.status === "dispatch_timeout") {
    return "dispatch_timeout";
  }

  if (job?.status === "assigned") {
    return "assigned";
  }

  if (job?.status === "matching") {
    return "broadcasting";
  }

  if (
    job?.status === "queued" ||
    job?.status === "redispatch_required" ||
    job?.status === "reserved"
  ) {
    return "queued";
  }

  if (
    order.status === "ready_for_dispatch" ||
    order.status === "preassigned" ||
    order.status === "recording_pending"
  ) {
    return "queued";
  }

  return order.status;
}

const OWNED_TERMINAL_STATUSES = new Set([
  "completed",
  "cancelled",
  "closed",
  "settled",
]);

function isOwnedTerminal(
  order: OwnedOrderRecord,
  task: DriverTaskRecord | null,
) {
  return OWNED_TERMINAL_STATUSES.has(order.status) || task?.completedAt != null;
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
    case "lost_race":
    case "cancelled_by_platform":
    default:
      return "neutral";
  }
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

function getCandidateGate(
  locale: Locale,
  candidate: DispatchCandidate,
  order: OwnedOrderRecord,
  driver: DriverRegistryRecord | null,
) {
  const locationState = getCandidateLocationState(candidate);

  if (driver && !driver.licensesValid) {
    return {
      label: "license_invalid",
      tone: "danger" as const,
    };
  }

  if (driver && !driver.dispatchEligible) {
    return {
      label:
        driver.eligibilityBlockedReasons[0] !== undefined
          ? formatOpsCodeLabel(locale, driver.eligibilityBlockedReasons[0])
          : locale === "zh"
            ? "人工覆核"
            : "manual review",
      tone: "warn" as const,
    };
  }

  if (!candidate.serviceBuckets.includes(order.serviceBucket)) {
    return {
      label: "service bucket gap",
      tone: "warn" as const,
    };
  }

  if (locationState === "no_location") {
    return {
      label: "no location",
      tone: "warn" as const,
    };
  }

  if (locationState === "stale") {
    return {
      label: "location stale",
      tone: "warn" as const,
    };
  }

  return {
    label: "ok",
    tone: "success" as const,
  };
}

function getCandidateScore(
  candidate: DispatchCandidate,
  order: OwnedOrderRecord,
  driver: DriverRegistryRecord | null,
) {
  const locationState = getCandidateLocationState(candidate);
  let score = 0.98 - Math.min(candidate.etaMinutes, 24) * 0.015;

  if (candidate.serviceBuckets.includes(order.serviceBucket)) {
    score += 0.03;
  } else {
    score -= 0.08;
  }

  if (driver?.dispatchEligible) {
    score += 0.02;
  }

  if (driver && !driver.licensesValid) {
    score -= 0.18;
  }

  if (locationState === "stale") {
    score -= 0.06;
  }

  if (locationState === "no_location") {
    score -= 0.12;
  }

  return Math.max(0.51, Math.min(0.99, score)).toFixed(2);
}

function getWorkflowStepIndex(
  order: OwnedOrderRecord,
  job: DispatchJobRecord | undefined,
  task: DriverTaskRecord | null,
) {
  if (task?.completedAt || order.status === "completed") {
    return 5;
  }

  if (
    task?.startedAt ||
    order.status === "on_trip" ||
    order.status === "proof_pending"
  ) {
    return 4;
  }

  if (
    task?.acceptedAt ||
    task?.departedAt ||
    task?.arrivedPickupAt ||
    order.status === "assigned" ||
    order.status === "driver_accepted" ||
    order.status === "enroute_pickup" ||
    order.status === "arrived_pickup"
  ) {
    return 3;
  }

  if (job?.status === "matching") {
    return 2;
  }

  if (
    job ||
    order.status === "ready_for_dispatch" ||
    order.status === "preassigned" ||
    order.status === "recording_pending"
  ) {
    return 1;
  }

  return 0;
}

function getForwardedStepIndex(order: ForwardedOrderRecord) {
  switch (order.status) {
    case "completed_synced":
      return 5;
    case "confirmed_by_platform":
      return 3;
    case "broadcasted":
    case "accept_pending":
    case "sync_failed":
      return 2;
    case "received":
      return 1;
    case "lost_race":
    case "cancelled_by_platform":
    default:
      return 1;
  }
}

function getActivityTone(value: string) {
  const normalized = value.toLowerCase();

  if (
    normalized.includes("failed") ||
    normalized.includes("reject") ||
    normalized.includes("expired") ||
    normalized.includes("blocked")
  ) {
    return "danger" as const;
  }

  if (
    normalized.includes("override") ||
    normalized.includes("timeout") ||
    normalized.includes("warn") ||
    normalized.includes("hold") ||
    normalized.includes("no_supply") ||
    normalized.includes("no-supply") ||
    normalized.includes("fallback")
  ) {
    return "warn" as const;
  }

  if (
    normalized.includes("assigned") ||
    normalized.includes("accepted") ||
    normalized.includes("confirmed")
  ) {
    return "info" as const;
  }

  return "accent" as const;
}

function readTraceActor(details: Record<string, unknown> | undefined) {
  if (!details) {
    return null;
  }

  const candidateKeys = ["actorId", "actor", "source", "requestedBy"];
  for (const key of candidateKeys) {
    const value = details[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function buildFallbackActivity(
  locale: Locale,
  order: OwnedOrderRecord,
  job: DispatchJobRecord | undefined,
  task: DriverTaskRecord | null,
) {
  const entries: ActivityEntry[] = [
    {
      id: `${order.orderId}:created`,
      title: locale === "zh" ? "進入 queue" : "Entered queue",
      body:
        locale === "zh"
          ? `${formatOpsCodeLabel(locale, getTenantLabel(order))} 透過 ${formatOpsCodeLabel(
              locale,
              order.orderSource,
            )} 建立訂單。`
          : `${getTenantLabel(order)} created this owned order via ${order.orderSource}.`,
      at: order.createdAt,
      tone: "accent",
      actor: order.orderSource,
    },
  ];

  if (order.quotedFare) {
    entries.push({
      id: `${order.orderId}:fare`,
      title: locale === "zh" ? "計價" : "Pricing",
      body:
        locale === "zh"
          ? `套用 ${order.quotedFareRuleVersion ?? "manual"}：${formatMinorCurrency(
              order.quotedFare.amountMinor,
              order.quotedFare.currency,
            )}。`
          : `${order.quotedFareRuleVersion ?? "manual"} quoted ${formatMinorCurrency(
              order.quotedFare.amountMinor,
              order.quotedFare.currency,
            )}.`,
      at: order.updatedAt,
      tone: "accent",
      actor: "pricing.engine",
    });
  }

  if (job) {
    entries.push({
      id: `${job.dispatchJobId}:job`,
      title: locale === "zh" ? "派遣評估" : "Dispatch evaluation",
      body:
        locale === "zh"
          ? `job ${job.dispatchJobId} 目前為 ${formatOpsCodeLabel(locale, job.status)}。`
          : `Job ${job.dispatchJobId} is ${job.status}.`,
      at: job.updatedAt,
      tone: getActivityTone(job.status),
      actor: "dispatch.scorer",
    });
  }

  if (order.noSupplyEscalation) {
    entries.push({
      id: `${order.orderId}:no-supply`,
      title: locale === "zh" ? "No-supply escalation" : "No-supply escalation",
      body:
        locale === "zh"
          ? `第 ${order.noSupplyEscalation.attemptCount} 次嘗試後，執行 ${formatOpsCodeLabel(
              locale,
              order.noSupplyEscalation.escalationAction,
            )}。`
          : `Attempt ${order.noSupplyEscalation.attemptCount} escalated via ${order.noSupplyEscalation.escalationAction}.`,
      at: order.noSupplyEscalation.escalatedAt,
      tone: "warn",
      actor: "dispatch.recovery",
    });
  }

  if (order.exceptionHold) {
    entries.push({
      id: `${order.orderId}:hold`,
      title: locale === "zh" ? "人工覆核觸發" : "Exception hold raised",
      body:
        locale === "zh"
          ? `原因：${formatOpsCodeLabel(locale, order.exceptionHold.reasonCode)}。`
          : `Reason: ${order.exceptionHold.reasonCode}.`,
      at: order.exceptionHold.raisedAt,
      tone: "danger",
      actor: "compliance",
    });
  }

  if (order.exceptionHold?.overrideRequest) {
    entries.push({
      id: order.exceptionHold.overrideRequest.overrideRequestId,
      title: locale === "zh" ? "Override request" : "Override request",
      body:
        locale === "zh"
          ? `${formatOpsCodeLabel(
              locale,
              order.exceptionHold.overrideRequest.status,
            )}，申請人 ${order.exceptionHold.overrideRequest.requestedBy.actorId}。`
          : `${order.exceptionHold.overrideRequest.status} by ${order.exceptionHold.overrideRequest.requestedBy.actorId}.`,
      at: order.exceptionHold.overrideRequest.requestedAt,
      tone: "warn",
      actor: order.exceptionHold.overrideRequest.requestedBy.actorId,
    });
  }

  if (order.exceptionHold?.resolution) {
    entries.push({
      id: `${order.orderId}:resolution`,
      title: locale === "zh" ? "覆核完成" : "Exception resolved",
      body:
        locale === "zh"
          ? `${order.exceptionHold.resolution.actorId} 記錄 ${formatOpsCodeLabel(
              locale,
              order.exceptionHold.resolution.resolution,
            )}。`
          : `${order.exceptionHold.resolution.actorId} recorded ${order.exceptionHold.resolution.resolution}.`,
      at: order.exceptionHold.resolution.resolvedAt,
      tone: "info",
      actor: order.exceptionHold.resolution.actorId,
    });
  }

  if (order.manualFareOverride) {
    entries.push({
      id: `${order.orderId}:fare-override`,
      title: locale === "zh" ? "人工車資覆寫" : "Manual fare override",
      body:
        locale === "zh"
          ? `${order.manualFareOverride.actorId} 套用人工車資，原因：${order.manualFareOverride.reason}。`
          : `${order.manualFareOverride.actorId} applied a fare override.`,
      at: order.manualFareOverride.overriddenAt,
      tone: "warn",
      actor: order.manualFareOverride.actorId,
    });
  }

  if (task?.acceptedAt) {
    entries.push({
      id: `${task.taskId}:accepted`,
      title: locale === "zh" ? "司機已接單" : "Driver accepted",
      body:
        locale === "zh"
          ? `${task.driverId} 已接受 ${task.vehicleId} 的任務。`
          : `${task.driverId} accepted ${task.vehicleId}.`,
      at: task.acceptedAt,
      tone: "info",
      actor: task.driverId,
    });
  }

  if (task?.departedAt) {
    entries.push({
      id: `${task.taskId}:departed`,
      title: locale === "zh" ? "前往接送點" : "Departed to pickup",
      body:
        locale === "zh"
          ? `${task.vehicleId} 已開始前往接送點。`
          : `${task.vehicleId} departed toward pickup.`,
      at: task.departedAt,
      tone: "info",
      actor: task.driverId,
    });
  }

  if (task?.arrivedPickupAt) {
    entries.push({
      id: `${task.taskId}:arrived`,
      title: locale === "zh" ? "到達接送點" : "Arrived at pickup",
      body:
        locale === "zh"
          ? `${task.vehicleId} 已到達接送點。`
          : `${task.vehicleId} arrived at pickup.`,
      at: task.arrivedPickupAt,
      tone: "info",
      actor: task.driverId,
    });
  }

  if (task?.startedAt) {
    entries.push({
      id: `${task.taskId}:started`,
      title: locale === "zh" ? "開始行程" : "Trip started",
      body:
        locale === "zh"
          ? `${task.driverId} 已開始載客。`
          : `${task.driverId} started the trip.`,
      at: task.startedAt,
      tone: "accent",
      actor: task.driverId,
    });
  }

  if (task?.completedAt) {
    entries.push({
      id: `${task.taskId}:completed`,
      title: locale === "zh" ? "完成任務" : "Task completed",
      body:
        locale === "zh"
          ? `${task.vehicleId} 已完成任務。`
          : `${task.vehicleId} completed the task.`,
      at: task.completedAt,
      tone: "accent",
      actor: task.driverId,
    });
  }

  return entries.sort(
    (left, right) => new Date(right.at).getTime() - new Date(left.at).getTime(),
  );
}

function buildActivityEntries(
  locale: Locale,
  trace: DispatchTraceLogRecord[],
  order: OwnedOrderRecord,
  job: DispatchJobRecord | undefined,
  task: DriverTaskRecord | null,
) {
  if (trace.length === 0) {
    return buildFallbackActivity(locale, order, job, task);
  }

  return [...trace]
    .map(
      (entry): ActivityEntry => ({
        id: entry.traceId,
        title: formatOpsCodeLabel(locale, entry.eventType),
        body: entry.message,
        at: entry.createdAt,
        tone: getActivityTone(entry.eventType),
        actor: readTraceActor(entry.details),
      }),
    )
    .sort(
      (left, right) =>
        new Date(right.at).getTime() - new Date(left.at).getTime(),
    );
}

function buildForwardedActivity(
  locale: Locale,
  order: ForwardedOrderRecord,
): ActivityEntry[] {
  const entries: ActivityEntry[] = [
    {
      id: `${order.mirrorOrderId}:received`,
      title: copy(locale, "Mirror received", "鏡像建立"),
      body: copy(
        locale,
        `Forwarded mirror ${order.mirrorOrderId} created for ${order.platformCode} order ${order.externalOrderId}.`,
        `為 ${formatOpsCodeLabel(locale, order.platformCode)} 訂單 ${order.externalOrderId} 建立 forwarded 鏡像 ${order.mirrorOrderId}。`,
      ),
      at: order.createdAt,
      tone: "accent",
      actor: order.platformCode,
    },
    {
      id: `${order.mirrorOrderId}:status`,
      title: copy(locale, "Status sync", "狀態同步"),
      body: copy(
        locale,
        `Local mirror status is ${formatOpsCodeLabel(locale, order.status)}; last native status ${order.lastNativeStatus ?? "unknown"}.`,
        `本地鏡像狀態為 ${formatOpsCodeLabel(locale, order.status)}；最後外部狀態 ${order.lastNativeStatus ?? "未知"}。`,
      ),
      at: order.updatedAt,
      tone: getActivityTone(order.status),
      actor: "forwarder.sync",
    },
  ];

  if (order.lastSyncError) {
    entries.push({
      id: `${order.mirrorOrderId}:sync-error`,
      title: copy(locale, "Sync failure", "同步失敗"),
      body: `${formatOpsCodeLabel(locale, order.lastSyncError.code)} · ${order.lastSyncError.message}`,
      at: order.lastSyncError.failedAt,
      tone: "danger",
      actor: "forwarder.adapter",
    });
  }

  if (order.manualFallback.required) {
    entries.push({
      id: `${order.mirrorOrderId}:fallback`,
      title: copy(locale, "Manual fallback engaged", "啟動人工 fallback"),
      body:
        order.manualFallback.reason ??
        copy(locale, "Manual fallback required.", "需要人工 fallback。"),
      at: order.manualFallback.requestedAt ?? order.updatedAt,
      tone: "warn",
      actor: order.manualFallback.requestedBy ?? "ops",
    });
  }

  if (order.reconciliationJob) {
    entries.push({
      id: order.reconciliationJob.reconciliationJobId,
      title: copy(locale, "Reconciliation", "對帳"),
      body: copy(
        locale,
        `Reconciliation ${order.reconciliationJob.status} · ${order.reconciliationJob.mismatchCount} mismatch · reason ${order.reconciliationJob.reason}.`,
        `對帳 ${formatOpsCodeLabel(locale, order.reconciliationJob.status)} · ${order.reconciliationJob.mismatchCount} 筆不符 · 原因 ${formatOpsCodeLabel(locale, order.reconciliationJob.reason)}。`,
      ),
      at:
        order.reconciliationJob.completedAt ??
        order.reconciliationJob.createdAt,
      tone: order.reconciliationJob.status === "completed" ? "info" : "warn",
      actor: "reconciliation.engine",
    });
  }

  return entries.sort(
    (left, right) => new Date(right.at).getTime() - new Date(left.at).getTime(),
  );
}

function buildOverrideSummary(locale: Locale, order: OwnedOrderRecord) {
  const request = order.exceptionHold?.overrideRequest;
  if (request) {
    const decisionActor =
      request.approval?.actorId ??
      request.rejection?.actorId ??
      request.requestedBy.actorId;
    const decisionStatus =
      request.approval !== undefined
        ? "approved"
        : request.rejection !== undefined
          ? "rejected"
          : request.expiredAt
            ? "expired"
            : request.status;

    return {
      type: formatOpsCodeLabel(locale, request.overrideType),
      status: formatOpsCodeLabel(locale, decisionStatus),
      actor: decisionActor,
      note: formatOpsCodeLabel(locale, order.exceptionHold?.reasonCode ?? null),
      nextAction:
        order.exceptionHold?.overrideAllowed === true
          ? locale === "zh"
            ? "可由 reviewer 放行"
            : "reviewer can release"
          : locale === "zh"
            ? "需維持人工覆核"
            : "keep in manual review",
    };
  }

  if (order.manualFareOverride) {
    return {
      type: locale === "zh" ? "fare override" : "fare override",
      status: locale === "zh" ? "已套用" : "applied",
      actor: order.manualFareOverride.actorId,
      note: order.manualFareOverride.reason,
      nextAction:
        locale === "zh" ? "確認後回到一般派遣" : "return to normal dispatch",
    };
  }

  return {
    type: locale === "zh" ? "—" : "—",
    status: locale === "zh" ? "未申請" : "not requested",
    actor: "—",
    note:
      order.noSupplyEscalation !== null
        ? formatOpsCodeLabel(locale, order.noSupplyEscalation.escalationAction)
        : order.dispatchTimeout !== null
          ? formatOpsCodeLabel(locale, order.dispatchTimeout.escalationAction)
          : locale === "zh"
            ? "目前沒有手動 override"
            : "no manual override",
    nextAction:
      locale === "zh" ? "可直接指派或重派候選" : "candidate can be assigned",
  };
}

function renderSequenceRail(
  locale: Locale,
  currentIndex: number,
  timestampByStep: (string | null)[],
) {
  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(96px, 1fr))",
          gap: "8px",
          minWidth: "640px",
        }}
      >
        {WORKFLOW_STEPS.map((step, index) => {
          const complete = index < currentIndex;
          const current = index === currentIndex;
          const idle = index > currentIndex;
          const borderColor = current
            ? theme.accent
            : complete
              ? theme.info
              : theme.border;
          const background = current
            ? theme.accentBg
            : complete
              ? theme.infoBg
              : theme.surfaceLo;

          return (
            <div
              key={step}
              style={{
                display: "grid",
                gap: "8px",
                padding: "10px",
                borderRadius: "8px",
                border: `1px solid ${borderColor}`,
                background,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "999px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: current || complete ? theme.invert : theme.textMuted,
                  background: current
                    ? theme.accent
                    : complete
                      ? theme.info
                      : theme.surface,
                  border: `1px solid ${current || complete ? "transparent" : theme.border}`,
                }}
              >
                {index + 1}
              </div>
              <div style={{ display: "grid", gap: "3px", minWidth: 0 }}>
                <strong
                  style={{
                    fontSize: "12px",
                    color: idle ? theme.textMuted : theme.text,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {step}
                </strong>
                <span
                  style={{
                    fontSize: "10.5px",
                    color: theme.textDim,
                  }}
                >
                  {timestampByStep[index]
                    ? formatDateTime(locale, timestampByStep[index])
                    : idle
                      ? locale === "zh"
                        ? "waiting"
                        : "waiting"
                      : locale === "zh"
                        ? "active"
                        : "active"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderActivityFeed(locale: Locale, entries: ActivityEntry[]) {
  if (entries.length === 0) {
    return (
      <div style={{ color: theme.textMuted, fontSize: "12.5px" }}>
        {locale === "zh"
          ? "目前沒有 dispatch activity。"
          : "No dispatch activity yet."}
      </div>
    );
  }

  const toneStyles = {
    accent: {
      dot: theme.accent,
      rail: theme.accentBorder,
      bg: theme.accentBg,
    },
    info: {
      dot: theme.info,
      rail: theme.infoBorder,
      bg: theme.infoBg,
    },
    warn: {
      dot: theme.warn,
      rail: theme.warnBorder,
      bg: theme.warnBg,
    },
    danger: {
      dot: theme.danger,
      rail: theme.dangerBorder,
      bg: theme.dangerBg,
    },
  } as const;

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {entries.map((entry, index) => {
        const tone = toneStyles[entry.tone];
        return (
          <div
            key={entry.id}
            style={{
              display: "grid",
              gridTemplateColumns: "18px minmax(0, 1fr)",
              gap: "12px",
              alignItems: "start",
            }}
          >
            <div
              style={{
                display: "grid",
                justifyItems: "center",
                gap: "6px",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "999px",
                  background: tone.dot,
                  boxShadow: `0 0 0 4px ${tone.bg}`,
                  display: "inline-flex",
                }}
              />
              {index < entries.length - 1 ? (
                <span
                  aria-hidden="true"
                  style={{
                    width: "2px",
                    minHeight: "34px",
                    background: tone.rail,
                  }}
                />
              ) : null}
            </div>
            <div
              style={{
                display: "grid",
                gap: "4px",
                paddingBottom: index < entries.length - 1 ? "14px" : 0,
                borderBottom:
                  index < entries.length - 1
                    ? `1px solid ${theme.border}`
                    : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div style={{ display: "grid", gap: "4px", minWidth: 0 }}>
                  <strong style={{ fontSize: "13px", color: theme.text }}>
                    {entry.title}
                  </strong>
                  {entry.actor ? (
                    <span
                      style={{
                        fontSize: "10.5px",
                        color: theme.textDim,
                        fontFamily: theme.monoFamily,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {entry.actor}
                    </span>
                  ) : null}
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    color: theme.textMuted,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatDateTime(locale, entry.at)}
                </span>
              </div>
              <div
                style={{
                  fontSize: "12.5px",
                  color: theme.textMuted,
                  lineHeight: 1.5,
                }}
              >
                {entry.body}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── availableActions → CTA (§3.5 authority boundaries, §3.4 confirmation) ──

type ActionVisual = {
  icon: Parameters<typeof Btn>[0]["icon"];
  label: string;
  variant: "primary" | "secondary";
  danger: boolean;
};

function actionVisual(
  action: ResourceActionDescriptor,
  locale: Locale,
): ActionVisual {
  const danger = action.riskLevel === "high";
  const variant: "primary" | "secondary" =
    action.riskLevel === "medium" ? "primary" : "secondary";

  switch (action.action) {
    case "contact_passenger":
      return {
        icon: "phone",
        label: copy(locale, "Contact rider", "聯絡乘客"),
        variant: "secondary",
        danger: false,
      };
    case "assign_candidate":
      return {
        icon: "check",
        label: copy(locale, "Assign #1", "指派候選 #1"),
        variant: "primary",
        danger: false,
      };
    case "release_driver":
      return {
        icon: "switchboard",
        label: copy(locale, "Release driver", "釋放司機"),
        variant,
        danger,
      };
    case "cancel_order":
      return {
        icon: "x",
        label: copy(locale, "Cancel order", "取消訂單"),
        variant,
        danger,
      };
    case "fare_override":
      return {
        icon: "warn",
        label: copy(locale, "Fare override", "車資覆寫"),
        variant,
        danger: true,
      };
    case "redispatch":
      return {
        icon: "dispatch",
        label: copy(locale, "Redispatch", "重新派遣"),
        variant,
        danger,
      };
    case "resolve_no_supply":
      return {
        icon: "health",
        label: copy(locale, "Resolve no-supply", "處理無供給"),
        variant,
        danger,
      };
    case "escalate_incident":
      return {
        icon: "incidents",
        label: copy(locale, "Escalate to incident", "升級事故"),
        variant,
        danger: true,
      };
    case "complete_reconciliation":
      return {
        icon: "check",
        label: copy(locale, "Complete reconciliation", "完成對帳"),
        variant: "primary",
        danger: false,
      };
    case "engage_manual_fallback":
      return {
        icon: "switchboard",
        label: copy(locale, "Manual fallback", "人工 fallback"),
        variant,
        danger,
      };
    case "force_refresh":
      return {
        icon: "clock",
        label: copy(locale, "Force refresh", "強制刷新"),
        variant: "secondary",
        danger: false,
      };
    case "broadcast_eligible":
      return {
        icon: "dispatch",
        label: copy(locale, "Broadcast", "廣播候選"),
        variant,
        danger,
      };
    case "report_sync_failure":
      return {
        icon: "warn",
        label: copy(locale, "Report sync failure", "回報同步失敗"),
        variant,
        danger: true,
      };
    default:
      return {
        icon: "more",
        label: formatOpsCodeLabel(locale, action.action),
        variant,
        danger,
      };
  }
}

function actionHint(action: ResourceActionDescriptor, locale: Locale) {
  if (!action.enabled) {
    return action.disabledReasonCode
      ? formatOpsCodeLabel(locale, action.disabledReasonCode)
      : copy(locale, "unavailable", "目前不可用");
  }

  const risk = copy(
    locale,
    `risk:${action.riskLevel}`,
    `風險:${action.riskLevel}`,
  );
  return action.requiresReason
    ? `${risk} · ${copy(locale, "reason required", "需填原因")}`
    : risk;
}

function renderHeaderActions(
  actions: ResourceActionDescriptor[],
  locale: Locale,
) {
  if (actions.length === 0) {
    return (
      <Pill theme={theme} tone="neutral">
        {copy(locale, "read-only · terminal", "唯讀 · 終態")}
      </Pill>
    );
  }

  return (
    <>
      {actions.map((action) => {
        const visual = actionVisual(action, locale);
        return (
          <span
            key={action.action}
            title={actionHint(action, locale)}
            style={{ display: "inline-flex" }}
          >
            <Btn
              theme={theme}
              variant={visual.variant}
              danger={visual.danger}
              disabled={!action.enabled}
              icon={visual.icon}
            >
              {visual.label}
            </Btn>
          </span>
        );
      })}
    </>
  );
}

function synthesizeOwnedActions(
  order: OwnedOrderRecord,
  job: DispatchJobRecord | undefined,
  task: DriverTaskRecord | null,
  candidateCount: number,
): ResourceActionDescriptor[] {
  if (isOwnedTerminal(order, task)) {
    // Terminal state — read-only, no dead CTAs (§5.3 state variants).
    return [];
  }

  const hasActiveDriver =
    task != null &&
    (task.acceptedAt != null || task.startedAt != null) &&
    task.completedAt == null;
  const blockedByHold = Boolean(
    order.exceptionHold && !order.exceptionHold.resolution,
  );

  const actions: ResourceActionDescriptor[] = [
    { action: "contact_passenger", enabled: true, riskLevel: "low" },
  ];

  actions.push({
    action: "assign_candidate",
    enabled: candidateCount > 0 && !hasActiveDriver && !blockedByHold,
    ...(candidateCount === 0
      ? { disabledReasonCode: "no_eligible_candidate" }
      : hasActiveDriver
        ? { disabledReasonCode: "driver_already_assigned" }
        : blockedByHold
          ? { disabledReasonCode: "exception_hold_active" }
          : {}),
    riskLevel: "medium",
  });

  if (hasActiveDriver) {
    actions.push({
      action: "release_driver",
      enabled: true,
      riskLevel: "medium",
    });
  }

  if (order.noSupplyEscalation && !order.noSupplyEscalation.resolvedAt) {
    actions.push({
      action: "resolve_no_supply",
      enabled: true,
      riskLevel: "medium",
    });
  }

  if (job && job.status !== "assigned") {
    actions.push({ action: "redispatch", enabled: true, riskLevel: "medium" });
  }

  actions.push({
    action: "fare_override",
    enabled: true,
    requiresReason: true,
    riskLevel: "high",
  });

  actions.push({
    action: "escalate_incident",
    enabled: true,
    requiresReason: true,
    riskLevel: "high",
  });

  return actions;
}

function synthesizeForwardedActions(
  order: ForwardedOrderRecord,
  adapterDegraded: boolean,
): ResourceActionDescriptor[] {
  if (isForwardedTerminal(order)) {
    return [{ action: "force_refresh", enabled: true, riskLevel: "low" }];
  }

  const actions: ResourceActionDescriptor[] = [
    { action: "force_refresh", enabled: true, riskLevel: "low" },
  ];

  actions.push({
    action: "complete_reconciliation",
    enabled: order.reconciliationJob?.status === "queued",
    ...(order.reconciliationJob?.status === "queued"
      ? {}
      : { disabledReasonCode: "no_open_reconciliation" }),
    riskLevel: "medium",
  });

  actions.push({
    action: "engage_manual_fallback",
    enabled: order.status === "sync_failed" || order.manualFallback.required,
    ...(order.status === "sync_failed" || order.manualFallback.required
      ? {}
      : { disabledReasonCode: "sync_healthy" }),
    riskLevel: "medium",
  });

  actions.push({
    action: "broadcast_eligible",
    enabled:
      !adapterDegraded &&
      (order.status === "received" || order.status === "broadcasted"),
    ...(adapterDegraded
      ? { disabledReasonCode: "adapter_degraded" }
      : order.status === "received" || order.status === "broadcasted"
        ? {}
        : { disabledReasonCode: "broadcast_window_closed" }),
    riskLevel: "medium",
  });

  actions.push({
    action: "report_sync_failure",
    enabled: order.lastSyncError != null || order.status === "sync_failed",
    ...(order.lastSyncError != null || order.status === "sync_failed"
      ? {}
      : { disabledReasonCode: "no_sync_error" }),
    requiresReason: true,
    riskLevel: "high",
  });

  return actions;
}

// ── Empty / not-ready states (§3.6) — six distinct EmptyReason treatments ──

const CANDIDATE_EMPTY_REASON_CODES: Record<EmptyReason, string> = {
  no_data: "dispatch_no_candidate",
  not_provisioned: "dispatch_job_not_started",
  fetch_failed: "candidate_fetch_failed",
  permission_denied: "candidate_scope_denied",
  external_unavailable: "supply_source_degraded",
  filtered_empty: "candidate_filtered_empty",
  driver_not_eligible: "candidate_not_eligible",
};

type EmptyStateView = {
  tone: CanvasTone;
  icon: Parameters<typeof CanvasIcon>[0]["name"];
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  actionNewTab: boolean;
};

function resolveCandidateEmptyReason(input: {
  candidatesFailed: boolean;
  hasJob: boolean;
  noSupply: boolean;
  permissionDenied: boolean;
}): EmptyReason {
  if (input.permissionDenied) {
    return "permission_denied";
  }
  if (input.candidatesFailed) {
    return "fetch_failed";
  }
  if (!input.hasJob) {
    return "not_provisioned";
  }
  if (input.noSupply) {
    return "external_unavailable";
  }
  return "no_data";
}

function buildCandidateEmptyState(
  reason: EmptyReason,
  locale: Locale,
  orderId: string,
): EmptyStateView {
  const platformAdminFleet = `${resolveAppOrigin("platform-admin")}/fleet`;
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "info",
        icon: "dispatch",
        title: copy(locale, "Dispatch job not started", "派遣工作尚未啟動"),
        description: copy(
          locale,
          "No dispatch job exists for this order yet. Candidate scoring begins once it enters matching.",
          "此訂單尚未建立派遣工作，進入 matching 後才會開始評分候選。",
        ),
        actionLabel: copy(locale, "Open dispatch board", "回派車看板"),
        actionHref: "/dispatch?board=ready",
        actionNewTab: false,
      };
    case "fetch_failed":
      return {
        tone: "danger",
        icon: "warn",
        title: copy(locale, "Candidate snapshot failed", "候選快照讀取失敗"),
        description: copy(
          locale,
          "The candidate endpoint did not return a usable payload. Retry the snapshot.",
          "候選端點未回傳可用內容，請重新整理快照。",
        ),
        actionLabel: copy(locale, "Retry", "重新整理"),
        actionHref: `/dispatch/${encodeURIComponent(orderId)}`,
        actionNewTab: false,
      };
    case "permission_denied":
      return {
        tone: "warn",
        icon: "users",
        title: copy(locale, "Candidate scope denied", "無候選讀取權限"),
        description: copy(
          locale,
          "This actor can open the workspace but lacks supply read scope for candidate scoring.",
          "目前帳號可進入工作區，但缺少候選評分的供給讀取權限。",
        ),
        actionLabel: copy(locale, "Open ops dashboard", "返回儀表板"),
        actionHref: "/dashboard",
        actionNewTab: false,
      };
    case "external_unavailable":
      return {
        tone: "warn",
        icon: "health",
        title: copy(locale, "No eligible supply", "目前無可用供給"),
        description: copy(
          locale,
          "Supply is exhausted or the no-supply lane is active. Hand off via the no-supply / governance lane.",
          "供給耗盡或 no-supply 流程啟動中，請改由 no-supply / 治理流程接手。",
        ),
        actionLabel: copy(locale, "No-supply board", "無供給看板"),
        actionHref: "/dispatch?board=no_supply",
        actionNewTab: false,
      };
    case "filtered_empty":
      return {
        tone: "accent",
        icon: "filter",
        title: copy(
          locale,
          "No candidates match the gate filter",
          "目前篩選沒有候選",
        ),
        description: copy(
          locale,
          "Every scored candidate is filtered out by the current gate slice. Widen the gate view.",
          "目前 gate 篩選把所有評分候選都排除了，請放寬 gate 檢視。",
        ),
        actionLabel: copy(locale, "Clear gate filter", "清除 gate 篩選"),
        actionHref: `/dispatch/${encodeURIComponent(orderId)}`,
        actionNewTab: false,
      };
    case "driver_not_eligible":
      return {
        tone: "warn",
        icon: "users",
        title: copy(
          locale,
          "Candidates blocked by eligibility",
          "候選因資格被擋",
        ),
        description: copy(
          locale,
          "All nearby drivers failed an eligibility or license gate. Resolve compliance before assignment.",
          "附近司機皆未通過資格或證照 gate，指派前請先處理法遵。",
        ),
        actionLabel: copy(locale, "Open fleet governance", "開啟車隊治理"),
        actionHref: platformAdminFleet,
        actionNewTab: true,
      };
    case "no_data":
    default:
      return {
        tone: "neutral",
        icon: "dispatch",
        title: copy(locale, "No candidates yet", "目前沒有候選"),
        description: copy(
          locale,
          "Matching is healthy but no candidate has surfaced for this work item yet.",
          "matching 正常，但此工作項目目前還沒有評分出候選。",
        ),
        actionLabel: copy(locale, "Back to dispatch board", "回派車看板"),
        actionHref: "/dispatch?board=ready",
        actionNewTab: false,
      };
  }
}

function renderCandidateEmptyState(
  reason: EmptyReason,
  locale: Locale,
  orderId: string,
) {
  const view = buildCandidateEmptyState(reason, locale, orderId);
  return (
    <div
      style={{
        display: "grid",
        justifyItems: "center",
        textAlign: "center",
        gap: 10,
        padding: "26px 20px",
      }}
    >
      <CanvasIcon
        name={view.icon}
        size={24}
        style={{ color: toneColor(view.tone) }}
      />
      <strong style={{ color: theme.text, fontSize: 14 }}>{view.title}</strong>
      <span
        style={{
          color: theme.textMuted,
          maxWidth: 460,
          fontSize: 12.5,
          lineHeight: 1.5,
        }}
      >
        {view.description}
      </span>
      <Link
        href={view.actionHref}
        target={view.actionNewTab ? "_blank" : undefined}
        rel={view.actionNewTab ? "noreferrer" : undefined}
        style={linkButtonStyle(view.tone)}
      >
        {view.actionLabel}
        {view.actionNewTab ? <CanvasIcon name="ext" size={11} /> : null}
      </Link>
      <span style={tinyMetaStyle(view.tone)}>
        {copy(locale, "emptyReason", "空狀態")} ·{" "}
        {CANDIDATE_EMPTY_REASON_CODES[reason]}
      </span>
    </div>
  );
}

// ── Cross-app navigation (§3.10) ──

function resolveAppOrigin(targetApp: CrossAppResourceLink["targetApp"]) {
  const envCandidates =
    targetApp === "platform-admin"
      ? [
          process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN,
          process.env.PLATFORM_ADMIN_ORIGIN,
          process.env.DEV_PLATFORM_ADMIN_ORIGIN,
          process.env.STAGING_PLATFORM_ADMIN_ORIGIN,
          process.env.PROD_PLATFORM_ADMIN_ORIGIN,
        ]
      : targetApp === "tenant-console"
        ? [
            process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN,
            process.env.TENANT_CONSOLE_ORIGIN,
          ]
        : [
            process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN,
            process.env.OPS_CONSOLE_ORIGIN,
            process.env.DEV_OPS_CONSOLE_ORIGIN,
            process.env.STAGING_OPS_CONSOLE_ORIGIN,
            process.env.PROD_OPS_CONSOLE_ORIGIN,
          ];
  const resolved = envCandidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );

  if (resolved) {
    return resolved.replace(/\/$/, "");
  }

  if (targetApp === "platform-admin") return "http://localhost:3002";
  if (targetApp === "tenant-console") return "http://localhost:3004";
  return "http://localhost:3003";
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  if (link.route.startsWith("http://") || link.route.startsWith("https://")) {
    return link.route;
  }

  return `${resolveAppOrigin(link.targetApp)}${link.route.startsWith("/") ? link.route : `/${link.route}`}`;
}

function renderCrossAppLink(link: CrossAppResourceLink) {
  return (
    <Link
      key={`${link.resourceType}:${link.resourceId}`}
      href={buildCrossAppHref(link)}
      target={link.openMode === "new_tab" ? "_blank" : undefined}
      rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
      style={linkButtonStyle("info")}
    >
      {link.label}
      {link.openMode === "new_tab" ? <CanvasIcon name="ext" size={11} /> : null}
    </Link>
  );
}

// ── Refresh affordance (§3.2 — T2 dispatch tier) ──

function synthesizeRefreshMetadata(
  generatedAt: string,
  freshness: UiRefreshMetadata["dataFreshness"],
): UiRefreshMetadata {
  return {
    generatedAt,
    staleAfterMs: REFRESH_STALE_AFTER_MS,
    dataFreshness: freshness,
    source: "live",
  };
}

function refreshBody(refresh: UiRefreshMetadata, locale: Locale) {
  return copy(
    locale,
    `Snapshot ${formatLongDateTime(locale, refresh.generatedAt)} UTC from ${refresh.source}.`,
    `快照於 ${formatLongDateTime(locale, refresh.generatedAt)} UTC 產生，來源 ${formatOpsCodeLabel(locale, refresh.source)}。`,
  );
}

function renderRefreshRow(
  refresh: UiRefreshMetadata,
  locale: Locale,
  extra?: string,
) {
  const freshnessLabel = copy(
    locale,
    refresh.dataFreshness.toUpperCase(),
    formatOpsCodeLabel(locale, refresh.dataFreshness),
  );
  return (
    <div style={helperRowStyle}>
      <Pill
        theme={theme}
        tone={refresh.dataFreshness === "fresh" ? "success" : "warn"}
        dot
      >
        {freshnessLabel} · {REFRESH_TIER_LABEL}
      </Pill>
      <span style={{ ...helperTextStyle, ...monoTextStyle }}>
        {copy(locale, "generated", "生成時間")} ·{" "}
        {formatLongDateTime(locale, refresh.generatedAt)} UTC
      </span>
      <span style={helperTextStyle}>
        {copy(
          locale,
          "CTAs come from availableActions",
          "畫面 CTA 以 availableActions 為準",
        )}
      </span>
      {extra ? <span style={helperTextStyle}>{extra}</span> : null}
    </div>
  );
}

// ── shared style helpers ──

const helperRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
  padding: "12px 24px 0",
};

const helperTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.textDim,
};

const monoTextStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

function linkButtonStyle(
  tone: CanvasTone = "neutral",
  disabled = false,
): CSSProperties {
  const palette: Record<CanvasTone, { bg: string; fg: string; bd: string }> = {
    success: {
      bg: theme.successBg,
      fg: theme.success,
      bd: theme.successBorder,
    },
    warn: { bg: theme.warnBg, fg: theme.warn, bd: theme.warnBorder },
    danger: { bg: theme.dangerBg, fg: theme.danger, bd: theme.dangerBorder },
    info: { bg: theme.infoBg, fg: theme.info, bd: theme.infoBorder },
    accent: { bg: theme.accentBg, fg: theme.accent, bd: theme.accentBorder },
    neutral: { bg: theme.surfaceLo, fg: theme.textMuted, bd: theme.border },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 26,
    padding: "4px 9px",
    borderRadius: 7,
    border: `1px solid ${palette[tone].bd}`,
    background: palette[tone].bg,
    color: palette[tone].fg,
    textDecoration: "none",
    fontSize: 11.5,
    fontWeight: 600,
    opacity: disabled ? 0.48 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    pointerEvents: disabled ? "none" : "auto",
  };
}

function tinyMetaStyle(tone: CanvasTone = "neutral"): CSSProperties {
  return {
    fontSize: 10.5,
    color: toneColor(tone),
    letterSpacing: 0.2,
  };
}

function toneColor(tone: CanvasTone) {
  const colors: Record<CanvasTone, string> = {
    success: theme.success,
    warn: theme.warn,
    danger: theme.danger,
    info: theme.info,
    accent: theme.accent,
    neutral: theme.textMuted,
  };

  return colors[tone];
}

// ── page ──

export default async function DispatchDetailPage({
  params,
}: DispatchDetailPageProps) {
  const { dispatchId } = await params;
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);
  const generatedAt = new Date().toISOString();

  const ordersResult = await load(
    () => client.listOrders(),
    [] as OwnedOrderRecord[],
  );

  const matchedOrder =
    ordersResult.data.find(
      (candidate) =>
        candidate.orderId === dispatchId || candidate.orderNo === dispatchId,
    ) ??
    (await resolveOrFallback(
      () => client.getOrder(dispatchId),
      null as OwnedOrderRecord | null,
    ));

  if (matchedOrder) {
    return renderOwnedWorkspace({
      order: matchedOrder,
      locale,
      generatedAt,
      ordersFailed: ordersResult.failed,
      client,
    });
  }

  // Not an owned order — try the forwarded mirror domain (one route, domain flag).
  const forwardedResult = await load(
    () => client.listForwarderOrders(),
    [] as ForwardedOrderRecord[],
  );
  const forwardedOrder = forwardedResult.data.find(
    (record) =>
      record.mirrorOrderId === dispatchId ||
      record.externalOrderId === dispatchId,
  );

  if (!forwardedOrder) {
    notFound();
  }

  const [adapterHealthResponse, reconciliationIssues] = await Promise.all([
    resolveOrFallback(
      () =>
        client.get<{ items: AdapterHealthRecord[] }>(
          "/api/forwarder/adapters/health",
        ),
      { items: [] as AdapterHealthRecord[] },
    ),
    resolveOrFallback(
      () => client.listForwarderReconciliationIssues(),
      [] as ForwarderReconciliationIssue[],
    ),
  ]);

  const adapterHealth =
    (adapterHealthResponse.items ?? []).find(
      (record) => record.platformCode === forwardedOrder.platformCode,
    ) ?? null;
  const reconciliationIssue =
    reconciliationIssues.find(
      (issue) => issue.mirrorOrderId === forwardedOrder.mirrorOrderId,
    ) ?? null;

  return renderForwardedWorkspace({
    order: forwardedOrder,
    locale,
    generatedAt,
    adapterHealth,
    reconciliationIssue,
  });
}

async function renderOwnedWorkspace({
  order,
  locale,
  generatedAt,
  ordersFailed,
  client,
}: {
  order: OwnedOrderRecord;
  locale: Locale;
  generatedAt: string;
  ordersFailed: boolean;
  client: Awaited<ReturnType<typeof getServerOpsClient>>;
}) {
  const [dispatchJobsResult, driverTasksResult, driversResult] =
    await Promise.all([
      load(() => client.listDispatchJobs(), [] as DispatchJobRecord[]),
      load(() => client.listDriverTasks(), [] as DriverTaskRecord[]),
      load(() => client.listDrivers(), [] as DriverRegistryRecord[]),
    ]);

  const dispatchJob = dispatchJobsResult.data.find(
    (job) => job.orderId === order.orderId,
  );
  const orderTasks = driverTasksResult.data.filter(
    (task) => task.orderId === order.orderId,
  );
  const currentTask = pickCurrentTask(orderTasks);
  const driverById = new Map(
    driversResult.data.map((driver) => [driver.driverId, driver]),
  );

  const candidatesResult = dispatchJob
    ? await load(
        () => client.listDispatchCandidates(dispatchJob.dispatchJobId),
        [] as DispatchCandidate[],
      )
    : { data: [] as DispatchCandidate[], failed: false };
  const dispatchTrace = await resolveOrFallback(
    () => client.getOrderDispatchTrace(order.orderId),
    [] as DispatchTraceLogRecord[],
  );

  const sortedCandidates = [...candidatesResult.data].sort(
    (left, right) => left.etaMinutes - right.etaMinutes,
  );
  const candidateRows: CandidateRow[] = sortedCandidates.map(
    (candidate, index) => {
      const driver = driverById.get(candidate.driverId) ?? null;
      const gate = getCandidateGate(locale, candidate, order, driver);

      return {
        candidate,
        driver,
        rankCell: (
          <span
            style={{
              color: theme.accent,
              fontWeight: 700,
              fontFamily: theme.monoFamily,
            }}
          >
            #{index + 1}
          </span>
        ),
        driverCell: (
          <Link
            href={`/drivers/${encodeURIComponent(candidate.driverId)}`}
            style={{
              display: "grid",
              gap: "2px",
              color: theme.text,
              textDecoration: "none",
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {driver?.name ?? candidate.driverId}
            </span>
            <span
              style={{
                fontSize: "11px",
                color: theme.textDim,
                fontFamily: theme.monoFamily,
              }}
            >
              {candidate.driverId}
            </span>
          </Link>
        ),
        vehicle: candidate.vehicleId,
        etaCell: (
          <Pill theme={theme} tone={index === 0 ? "success" : "info"}>
            {candidate.etaMinutes}m
          </Pill>
        ),
        gateLabel: gate.label,
        gateTone: gate.tone,
        gateCell: (
          <Pill theme={theme} tone={gate.tone} dot>
            {gate.label}
          </Pill>
        ),
        score: getCandidateScore(candidate, order, driver),
        _selected: index === 0,
      };
    },
  );
  const currentState = getVisibleStateCode(order, dispatchJob);
  const licenseClearCount = candidateRows.filter(
    (row) => row.driver?.licensesValid !== false,
  ).length;
  const eligibleCandidateCount = candidateRows.filter(
    (row) => row.driver?.dispatchEligible,
  ).length;
  const liveCandidateCount = sortedCandidates.filter(
    (candidate) => getCandidateLocationState(candidate) === "live",
  ).length;
  const activityEntries = buildActivityEntries(
    locale,
    dispatchTrace,
    order,
    dispatchJob,
    currentTask,
  );
  const overrideSummary = buildOverrideSummary(locale, order);

  const noSupply =
    order.status === "no_supply" ||
    order.status === "delayed_queue" ||
    (order.noSupplyEscalation != null &&
      order.noSupplyEscalation.resolvedAt == null);
  const candidateEmptyReason = resolveCandidateEmptyReason({
    candidatesFailed: candidatesResult.failed,
    hasJob: dispatchJob != null,
    noSupply,
    permissionDenied: false,
  });

  const loadFailed =
    ordersFailed ||
    dispatchJobsResult.failed ||
    driverTasksResult.failed ||
    candidatesResult.failed;
  const refresh = synthesizeRefreshMetadata(
    generatedAt,
    loadFailed ? "degraded" : "fresh",
  );

  const availableActions = synthesizeOwnedActions(
    order,
    dispatchJob,
    currentTask,
    candidateRows.length,
  );
  const terminal = isOwnedTerminal(order, currentTask);

  const candidateColumns: CanvasTableColumn<CandidateRow>[] = [
    { h: "RANK", k: "rankCell", w: 52 },
    { h: "DRIVER", k: "driverCell", w: 180 },
    { h: "VEHICLE", k: "vehicle", w: 132, mono: true },
    { h: "ETA", k: "etaCell", w: 84 },
    { h: "GATE", k: "gateCell", w: 164 },
    { h: "SCORE", k: "score", w: 68, mono: true },
  ];

  const stepperTimestamps: (string | null)[] = [
    order.createdAt,
    order.createdAt,
    dispatchJob?.status === "matching" ? dispatchJob.updatedAt : null,
    currentTask?.acceptedAt ?? dispatchJob?.updatedAt ?? null,
    currentTask?.startedAt ?? null,
    currentTask?.completedAt ?? null,
  ];

  return (
    <>
      <PageHeader
        theme={theme}
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            <span>{`${order.orderNo} · ${getTenantLabel(order)}`}</span>
            <Pill theme={theme} tone="accent">
              OWNED
            </Pill>
          </span>
        }
        subtitle={`${getAddressLabel(order.pickup)}  →  ${getAddressLabel(order.dropoff)}  ·  ${formatWindow(order, locale)}`}
        actions={renderHeaderActions(availableActions, locale)}
      />

      {renderRefreshRow(
        refresh,
        locale,
        `${candidateRows.length} ${copy(locale, "candidates", "候選")}`,
      )}

      <div style={{ padding: "12px 24px 0", display: "grid", gap: 12 }}>
        {loadFailed ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="warn"
            title={copy(
              locale,
              "Some dispatch data is degraded",
              "部分派遣資料降級",
            )}
            body={refreshBody(refresh, locale)}
          />
        ) : null}
        {terminal ? (
          <Banner
            theme={theme}
            tone="info"
            icon="check"
            title={copy(
              locale,
              "Work item is in a terminal state — read-only",
              "工作項目已進入終態 · 唯讀",
            )}
            body={copy(
              locale,
              "No dispatch CTAs are offered; review the timeline and compliance record below.",
              "不提供派遣 CTA；可檢視下方時間軸與法遵紀錄。",
            )}
          />
        ) : null}
      </div>

      <div
        style={{
          padding: "12px 24px 24px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
          gap: "16px",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: "16px", minWidth: 0 }}>
          <Card
            theme={theme}
            title={`${copy(locale, "Candidates · ranked", "候選 driver · ranked")} (${candidateRows.length})`}
            {...(candidateRows.length > 0 ? { padding: 0 } : {})}
          >
            {candidateRows.length > 0 ? (
              <Table
                theme={theme}
                columns={candidateColumns}
                rows={candidateRows}
              />
            ) : (
              renderCandidateEmptyState(
                candidateEmptyReason,
                locale,
                order.orderId,
              )
            )}
          </Card>

          <Card
            theme={theme}
            title={copy(locale, "Compliance gates", "Compliance gates")}
          >
            <DL
              theme={theme}
              cols={2}
              items={[
                {
                  k: "license valid",
                  v: `${licenseClearCount}/${candidateRows.length || 0} ${
                    locale === "zh" ? "候選通過" : "candidates clear"
                  }`,
                  mono: true,
                },
                {
                  k: "service bucket",
                  v: `${formatOpsCodeLabel(locale, order.serviceBucket)} · ${
                    candidateRows.length > 0 &&
                    candidateRows.every((row) =>
                      row.candidate.serviceBuckets.includes(
                        order.serviceBucket,
                      ),
                    )
                      ? "ok"
                      : "review"
                  }`,
                  mono: true,
                },
                {
                  k: "dispatch state",
                  v: `${formatOpsCodeLabel(locale, currentState)} · ${dispatchJob?.dispatchJobId ?? "—"}`,
                  mono: true,
                },
                {
                  k: "device binding",
                  v: `${liveCandidateCount}/${candidateRows.length || 0} live · ${eligibleCandidateCount}/${candidateRows.length || 0} eligible`,
                  mono: true,
                },
                {
                  k: "fare quoted",
                  v: order.quotedFare
                    ? `${formatMinorCurrency(
                        order.quotedFare.amountMinor,
                        order.quotedFare.currency,
                      )} · ${order.quotedFareRuleVersion ?? "manual"}`
                    : "—",
                  mono: true,
                },
                {
                  k: "override allowed",
                  v: order.exceptionHold
                    ? `${overrideSummary.status} · ${overrideSummary.nextAction}`
                    : locale === "zh"
                      ? "not needed"
                      : "not needed",
                  mono: true,
                },
              ]}
            />
          </Card>
        </div>

        <div style={{ display: "grid", gap: "16px", minWidth: 0 }}>
          <Card theme={theme} title={copy(locale, "Delivery sequence", "訂單狀態")}>
            {renderSequenceRail(
              locale,
              getWorkflowStepIndex(order, dispatchJob, currentTask),
              stepperTimestamps,
            )}
          </Card>

          <Card
            theme={theme}
            title={copy(locale, "Recent activity", "活動")}
          >
            {renderActivityFeed(locale, activityEntries)}
          </Card>
        </div>
      </div>
    </>
  );
}

function renderForwardedWorkspace({
  order,
  locale,
  generatedAt,
  adapterHealth,
  reconciliationIssue,
}: {
  order: ForwardedOrderRecord;
  locale: Locale;
  generatedAt: string;
  adapterHealth: AdapterHealthRecord | null;
  reconciliationIssue: ForwarderReconciliationIssue | null;
}) {
  const adapterDegraded =
    adapterHealth != null && adapterHealth.status !== "healthy";
  const refresh = synthesizeRefreshMetadata(
    generatedAt,
    order.status === "sync_failed" || adapterDegraded ? "degraded" : "fresh",
  );
  const availableActions = synthesizeForwardedActions(order, adapterDegraded);

  const pickup =
    readForwardedValue(order, [
      "pickupSummary",
      "pickupAddress",
      "pickup.addressName",
      "pickup.address",
      "pickup",
    ]) ?? "—";
  const dropoff =
    readForwardedValue(order, [
      "dropoffSummary",
      "dropoffAddress",
      "dropoff.addressName",
      "dropoff.address",
      "dropoff",
    ]) ?? "—";
  const waypointCount = (() => {
    for (const source of [order.authoritativeSnapshot, order.payload]) {
      if (isRecord(source) && Array.isArray(source.waypoints)) {
        return source.waypoints.length;
      }
    }
    return 0;
  })();

  const mismatchCount =
    reconciliationIssue?.reconciliationJob.mismatchCount ??
    order.reconciliationJob?.mismatchCount ??
    0;
  const stateTone = getForwardedStateTone(order.status);
  const activityEntries = buildForwardedActivity(locale, order);
  const terminal = isForwardedTerminal(order);

  const adapterLink: CrossAppResourceLink = {
    targetApp: "platform-admin",
    route: `/adapter-registry?platformCode=${encodeURIComponent(order.platformCode)}`,
    resourceType: "adapter",
    resourceId: order.platformCode,
    openMode: "new_tab",
    label: copy(locale, "Inspect adapter", "檢視 adapter"),
  };
  const reconciliationLink: CrossAppResourceLink | null = reconciliationIssue
    ? {
        targetApp: "platform-admin",
        route: `/payments/reconciliation/${encodeURIComponent(reconciliationIssue.reconciliationJob.reconciliationJobId)}`,
        resourceType: "reconciliation",
        resourceId: reconciliationIssue.reconciliationJob.reconciliationJobId,
        openMode: "new_tab",
        label: copy(locale, "Open reconciliation", "開啟對帳"),
      }
    : null;

  const candidateDriverRows = order.candidateDriverIds.map(
    (driverId, index) => ({
      driverId,
      rankCell: (
        <span
          style={{
            color: theme.accent,
            fontWeight: 700,
            fontFamily: theme.monoFamily,
          }}
        >
          #{index + 1}
        </span>
      ),
      driverCell: (
        <Link
          href={`/drivers/${encodeURIComponent(driverId)}`}
          style={{
            color: theme.text,
            textDecoration: "none",
            fontFamily: theme.monoFamily,
            fontWeight: 600,
          }}
        >
          {driverId}
        </Link>
      ),
      stateCell:
        order.acceptedDriverId === driverId ? (
          <Pill theme={theme} tone="success" dot>
            {copy(locale, "accepted", "已接受")}
          </Pill>
        ) : (
          <Pill theme={theme} tone="info">
            {copy(locale, "broadcast", "廣播中")}
          </Pill>
        ),
    }),
  );

  const candidateDriverColumns: CanvasTableColumn<
    (typeof candidateDriverRows)[number]
  >[] = [
    { h: "#", k: "rankCell", w: 44 },
    { h: copy(locale, "DRIVER", "司機"), k: "driverCell", w: 200 },
    { h: copy(locale, "PLATFORM STATE", "平台狀態"), k: "stateCell", w: 160 },
  ];

  return (
    <>
      <PageHeader
        theme={theme}
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            <span>{order.mirrorOrderId}</span>
            <Pill theme={theme} tone="info">
              FORWARDED
            </Pill>
            <Pill theme={theme} tone={stateTone} dot>
              {formatOpsCodeLabel(locale, order.status)}
            </Pill>
          </span>
        }
        subtitle={`${formatOpsCodeLabel(locale, order.platformCode)} · ${order.externalOrderId}  ·  ${pickup}  →  ${dropoff}  ·  ${formatForwardedWindow(order, locale)}`}
        actions={renderHeaderActions(availableActions, locale)}
      />

      {renderRefreshRow(
        refresh,
        locale,
        adapterHealth
          ? `${copy(locale, "adapter", "轉接器")} ${formatOpsCodeLabel(locale, adapterHealth.status)}`
          : undefined,
      )}

      <div style={{ padding: "12px 24px 0", display: "grid", gap: 12 }}>
        <Banner
          theme={theme}
          tone="info"
          icon="adapters"
          title={copy(
            locale,
            "Forwarded mirror — do not treat as owned",
            "此訂單為 forwarded mirror · 不可假裝為 owned",
          )}
          body={copy(
            locale,
            "No owned assignment exists. Every mutation must flow through a reconciliation issue to the platform finance owner; locally we only sync external state.",
            "本地沒有 owned 指派。所有 mutation 必須透過 reconciliation issue 走平台 finance owner，本地僅同步外部狀態。",
          )}
          actions={
            <>
              {renderCrossAppLink(adapterLink)}
              {reconciliationLink
                ? renderCrossAppLink(reconciliationLink)
                : null}
            </>
          }
        />
        {adapterDegraded ? (
          <Banner
            theme={theme}
            tone={adapterHealth?.status === "down" ? "danger" : "warn"}
            icon="health"
            title={copy(
              locale,
              "Adapter dependency is degraded",
              "轉接器相依降級",
            )}
            body={copy(
              locale,
              `${order.platformCode} adapter is ${adapterHealth?.status ?? "degraded"}${adapterHealth?.lastError ? ` · ${adapterHealth.lastError}` : ""}. Broadcast and live sync may be unavailable.`,
              `${order.platformCode} 轉接器為 ${adapterHealth?.status ?? "degraded"}${adapterHealth?.lastError ? ` · ${adapterHealth.lastError}` : ""}；廣播與即時同步可能不可用。`,
            )}
          />
        ) : null}
        {terminal ? (
          <Banner
            theme={theme}
            tone="info"
            icon="check"
            title={copy(
              locale,
              "Mirror reached a terminal state — read-only",
              "鏡像已進入終態 · 唯讀",
            )}
            body={copy(
              locale,
              "Only force refresh is offered; reconciliation and finance settle at the owner platform.",
              "僅提供強制刷新；對帳與金流於來源平台結算。",
            )}
          />
        ) : null}
      </div>

      <div
        style={{
          padding: "12px 24px 24px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
          gap: "16px",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: "16px", minWidth: 0 }}>
          <Card
            theme={theme}
            title={`${copy(locale, "Broadcast candidates", "廣播候選")} (${candidateDriverRows.length})`}
            {...(candidateDriverRows.length > 0 ? { padding: 0 } : {})}
          >
            {candidateDriverRows.length > 0 ? (
              <Table
                theme={theme}
                columns={candidateDriverColumns}
                rows={candidateDriverRows}
              />
            ) : (
              renderCandidateEmptyState(
                adapterDegraded ? "external_unavailable" : "no_data",
                locale,
                order.mirrorOrderId,
              )
            )}
          </Card>

          <Card
            theme={theme}
            title={copy(
              locale,
              "Authority chain · finance",
              "Compliance gates · authority chain",
            )}
          >
            <DL
              theme={theme}
              cols={2}
              items={[
                {
                  k: "domain",
                  v: `forwarded · ${order.dispatchSemantics}`,
                  mono: true,
                },
                {
                  k: "source platform",
                  v: `${formatOpsCodeLabel(locale, order.platformCode)} · ${order.externalOrderId}`,
                  mono: true,
                },
                {
                  k: "route locked",
                  v: `${copy(locale, "yes", "是")} · ${waypointCount} ${copy(locale, "waypoints", "途經點")}`,
                  mono: true,
                },
                {
                  k: "fare authority",
                  v: formatOpsCodeLabel(
                    locale,
                    order.financeContext.fareAuthority,
                  ),
                  mono: true,
                },
                {
                  k: "settlement",
                  v: `${formatOpsCodeLabel(locale, order.financeContext.settlementAuthority)} · ${formatOpsCodeLabel(locale, order.financeContext.localLedgerMode)}`,
                  mono: true,
                },
                {
                  k: "sync state",
                  v: order.lastSyncError
                    ? `${formatOpsCodeLabel(locale, order.lastSyncError.code)}`
                    : `${order.lastNativeStatus ?? formatOpsCodeLabel(locale, order.status)}`,
                  mono: true,
                },
                {
                  k: "last callback",
                  v: formatDateTime(
                    locale,
                    order.lastSyncError?.failedAt ?? order.updatedAt,
                  ),
                  mono: true,
                },
                {
                  k: "reconciliation",
                  v: order.reconciliationJob
                    ? `${formatOpsCodeLabel(locale, order.reconciliationJob.status)} · ${mismatchCount} mismatch`
                    : order.manualFallback.required
                      ? copy(locale, "manual fallback", "人工 fallback")
                      : "—",
                  mono: true,
                },
              ]}
            />
          </Card>
        </div>

        <div style={{ display: "grid", gap: "16px", minWidth: 0 }}>
          <Card theme={theme} title={copy(locale, "Delivery sequence", "訂單狀態")}>
            {renderSequenceRail(locale, getForwardedStepIndex(order), [
              order.createdAt,
              order.createdAt,
              order.status === "broadcasted" ||
              order.status === "accept_pending" ||
              order.status === "sync_failed"
                ? order.updatedAt
                : null,
              order.status === "confirmed_by_platform" ? order.updatedAt : null,
              null,
              order.status === "completed_synced" ? order.updatedAt : null,
            ])}
          </Card>

          <Card
            theme={theme}
            title={copy(locale, "Recent activity", "活動")}
          >
            {renderActivityFeed(locale, activityEntries)}
          </Card>
        </div>
      </div>
    </>
  );
}

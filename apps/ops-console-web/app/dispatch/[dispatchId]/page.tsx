import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type {
  AdapterHealthRecord,
  DispatchCandidate,
  DispatchJobRecord,
  DispatchTraceLogRecord,
  DriverRegistryRecord,
  DriverTaskRecord,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
  OwnedOrderRecord,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { formatMinorCurrency } from "@/lib/ops-analytics";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
import {
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { getCandidateLocationState } from "../location-state";

type DispatchDetailPageProps = {
  params: Promise<{
    dispatchId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

type TimelineEntry = {
  id: string;
  title: string;
  body: string;
  at: string;
  tone: "accent" | "info" | "warn" | "danger";
  actor?: string | null;
};

type DetailActionContext = {
  action: string;
  href: string;
  label: string;
  riskLevel: ResourceActionDescriptor["riskLevel"];
  disabled: boolean;
  external?: boolean;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

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

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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

function buildDispatchListHref({
  board,
  service,
  facet,
}: {
  board?: string | undefined;
  service?: string | undefined;
  facet?: string | undefined;
}) {
  const params = new URLSearchParams();
  if (board && board !== "ready") {
    params.set("board", board);
  }
  if (service && service !== "all") {
    params.set("service", service);
  }
  if (facet && facet !== "all") {
    params.set("facet", facet);
  }
  const query = params.toString();
  return query ? `/dispatch?${query}` : "/dispatch";
}

function resolveActionLabel(action: string, locale: Locale) {
  const zh = locale === "zh";
  switch (action) {
    case "assign":
      return zh ? "指派候選" : "Assign candidate";
    case "release_driver":
      return zh ? "釋放司機" : "Release driver";
    case "redispatch":
      return zh ? "重新派送" : "Redispatch";
    case "cancel_order":
      return zh ? "取消訂單" : "Cancel order";
    case "request_fare_override":
    case "fare_override_request":
      return zh ? "申請 fare override" : "Request fare override";
    case "resolve_exception_hold":
      return zh ? "解除 hold" : "Resolve hold";
    case "resolve_no_supply":
    case "resolve_manually":
      return zh ? "人工處理" : "Resolve manually";
    case "escalate_incident":
    case "createIncidentFromDispatchException":
      return zh ? "升級 incident" : "Escalate incident";
    case "extend_search":
      return zh ? "延長搜尋" : "Extend search";
    case "jump_approval_request":
      return zh ? "查看核准單" : "Open approval request";
    case "trigger_reconciliation":
    case "complete_forwarder_reconciliation":
      return zh ? "觸發 reconciliation" : "Trigger reconciliation";
    case "engage_manual_fallback":
      return zh ? "啟動 manual fallback" : "Engage manual fallback";
    case "force_refresh":
    case "sync_forwarded_order_status":
    case "mark_forwarder_sync_failed":
      return zh ? "強制刷新" : "Force refresh";
    case "broadcast_to_eligible_drivers":
      return zh ? "廣播給合格司機" : "Broadcast to eligible drivers";
    case "report_sync_failure":
      return zh ? "回報 sync failure" : "Report sync failure";
    case "inspect_adapter":
      return zh ? "查看 adapter ↗" : "Inspect adapter ↗";
    default:
      return action.replace(/_/g, " ");
  }
}

function buildActionHref(
  dispatchId: string,
  board: string | undefined,
  service: string | undefined,
  facet: string | undefined,
  platformCode: string | undefined,
  action: ResourceActionDescriptor,
) {
  switch (action.action) {
    case "inspect_adapter":
      return {
        href: buildPlatformAdminHref(
          `/adapter-registry?platformCode=${encodeURIComponent(platformCode ?? "")}`,
        ),
        external: true,
      };
    case "jump_approval_request":
      return { href: "/approval-requests", external: false };
    case "createIncidentFromDispatchException":
    case "escalate_incident":
      return {
        href: `/incidents?sourceOrderId=${encodeURIComponent(dispatchId)}`,
        external: false,
      };
    default: {
      const params = new URLSearchParams();
      if (board && board !== "ready") {
        params.set("board", board);
      }
      if (service && service !== "all") {
        params.set("service", service);
      }
      if (facet && facet !== "all") {
        params.set("facet", facet);
      }
      params.set("action", action.action);
      return {
        href: `/dispatch/${encodeURIComponent(dispatchId)}?${params.toString()}`,
        external: false,
      };
    }
  }
}

function normalizeDetailActions(
  dispatchId: string,
  board: string | undefined,
  service: string | undefined,
  facet: string | undefined,
  platformCode: string | undefined,
  actions: ResourceActionDescriptor[] | undefined,
  locale: Locale,
): DetailActionContext[] {
  return Array.isArray(actions)
    ? actions.map((action) => {
        const { href, external } = buildActionHref(
          dispatchId,
          board,
          service,
          facet,
          platformCode,
          action,
        );
        return {
          action: action.action,
          href,
          label: resolveActionLabel(action.action, locale),
          riskLevel: action.riskLevel,
          disabled: !action.enabled,
          external,
        };
      })
    : [];
}

function pickActionFocus(
  requestedAction: string | undefined,
  actions: DetailActionContext[],
) {
  if (requestedAction) {
    return actions.find((action) => action.action === requestedAction) ?? null;
  }
  return actions.find((action) => !action.disabled) ?? null;
}

function readSnapshotValue(
  record: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (key in record && record[key] != null) {
      return record[key];
    }
  }
  return null;
}

function formatSnapshotText(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "—";
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

function formatWindow(order: OwnedOrderRecord, locale: Locale) {
  if (!order.reservationWindowStart || !order.reservationWindowEnd) {
    return locale === "zh" ? "即時" : "realtime";
  }

  return `${formatDateTime(locale, order.reservationWindowStart)} → ${formatDateTime(locale, order.reservationWindowEnd)}`;
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
      label: locale === "zh" ? "license_invalid" : "license_invalid",
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
      label: locale === "zh" ? "service bucket gap" : "service bucket gap",
      tone: "warn" as const,
    };
  }

  if (locationState === "no_location") {
    return {
      label: locale === "zh" ? "no location" : "no location",
      tone: "warn" as const,
    };
  }

  if (locationState === "stale") {
    return {
      label: locale === "zh" ? "location stale" : "location stale",
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

function getTimelineTone(value: string) {
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
    normalized.includes("no-supply")
  ) {
    return "warn" as const;
  }

  if (normalized.includes("assigned") || normalized.includes("accepted")) {
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

function buildFallbackTimeline(
  locale: Locale,
  order: OwnedOrderRecord,
  job: DispatchJobRecord | undefined,
  task: DriverTaskRecord | null,
) {
  const entries: TimelineEntry[] = [
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
      tone: getTimelineTone(job.status),
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

function buildTimelineEntries(
  locale: Locale,
  trace: DispatchTraceLogRecord[],
  order: OwnedOrderRecord,
  job: DispatchJobRecord | undefined,
  task: DriverTaskRecord | null,
) {
  if (trace.length === 0) {
    return buildFallbackTimeline(locale, order, job, task);
  }

  return [...trace]
    .map(
      (entry): TimelineEntry => ({
        id: entry.traceId,
        title: formatOpsCodeLabel(locale, entry.eventType),
        body: entry.message,
        at: entry.createdAt,
        tone: getTimelineTone(entry.eventType),
        actor: readTraceActor(entry.details),
      }),
    )
    .sort(
      (left, right) =>
        new Date(right.at).getTime() - new Date(left.at).getTime(),
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
        ? locale === "zh"
          ? "approved"
          : "approved"
        : request.rejection !== undefined
          ? locale === "zh"
            ? "rejected"
            : "rejected"
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

function renderWorkflowSteps(
  locale: Locale,
  order: OwnedOrderRecord,
  job: DispatchJobRecord | undefined,
  task: DriverTaskRecord | null,
) {
  const currentIndex = getWorkflowStepIndex(order, job, task);
  const timestampByStep = [
    order.createdAt,
    order.createdAt,
    job?.status === "matching" ? job.updatedAt : null,
    task?.acceptedAt ?? job?.updatedAt ?? null,
    task?.startedAt ?? null,
    task?.completedAt ?? null,
  ];

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

function renderTimeline(locale: Locale, entries: TimelineEntry[]) {
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

export default async function DispatchDetailPage({
  params,
  searchParams,
}: DispatchDetailPageProps) {
  const { dispatchId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const board = firstParam(resolvedSearchParams.board);
  const service = firstParam(resolvedSearchParams.service);
  const facet = firstParam(resolvedSearchParams.facet);
  const requestedAction = firstParam(resolvedSearchParams.action);
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);

  const [
    orders,
    dispatchJobs,
    driverTasks,
    drivers,
    forwardedOrders,
    adapterHealth,
    reconciliationIssues,
  ] = await Promise.all([
    resolveOrFallback(() => client.listOrders(), [] as OwnedOrderRecord[]),
    resolveOrFallback(
      () => client.listDispatchJobs(),
      [] as DispatchJobRecord[],
    ),
    resolveOrFallback(() => client.listDriverTasks(), [] as DriverTaskRecord[]),
    resolveOrFallback(() => client.listDrivers(), [] as DriverRegistryRecord[]),
    resolveOrFallback(
      () => client.listForwarderOrders(),
      [] as ForwardedOrderRecord[],
    ),
    resolveOrFallback<AdapterHealthRecord[]>(
      () =>
        client.getForwarderAdaptersHealth() as Promise<AdapterHealthRecord[]>,
      [] as AdapterHealthRecord[],
    ),
    resolveOrFallback(
      () => client.listForwarderReconciliationIssues(),
      [] as ForwarderReconciliationIssue[],
    ),
  ]);

  const matchedOrder =
    orders.find(
      (candidate) =>
        candidate.orderId === dispatchId || candidate.orderNo === dispatchId,
    ) ??
    (await resolveOrFallback(
      () => client.getOrder(dispatchId),
      null as OwnedOrderRecord | null,
    ));

  const matchedForwarded =
    forwardedOrders.find(
      (candidate) =>
        candidate.mirrorOrderId === dispatchId ||
        candidate.externalOrderId === dispatchId,
    ) ?? null;

  if (!matchedOrder && !matchedForwarded) {
    notFound();
  }

  if (!matchedOrder && matchedForwarded) {
    const routeSnapshot: Record<string, unknown> =
      typeof matchedForwarded.payload === "object" &&
      matchedForwarded.payload !== null
        ? matchedForwarded.payload
        : {};
    const authoritativeSnapshot: Record<string, unknown> =
      typeof matchedForwarded.authoritativeSnapshot === "object" &&
      matchedForwarded.authoritativeSnapshot !== null
        ? matchedForwarded.authoritativeSnapshot
        : {};
    const linkedIssue =
      reconciliationIssues.find(
        (issue) => issue.mirrorOrderId === matchedForwarded.mirrorOrderId,
      ) ?? null;
    const adapter: AdapterHealthRecord | null =
      adapterHealth.find(
        (item) => item.platformCode === matchedForwarded.platformCode,
      ) ?? null;
    const detailActions = normalizeDetailActions(
      matchedForwarded.mirrorOrderId,
      board,
      service,
      facet,
      matchedForwarded.platformCode,
      (
        matchedForwarded as ForwardedOrderRecord & {
          availableActions?: ResourceActionDescriptor[];
        }
      ).availableActions,
      locale,
    );
    const focusedAction = pickActionFocus(requestedAction, detailActions);
    const waypoints = readSnapshotValue(authoritativeSnapshot, [
      "waypoints",
      "routeWaypoints",
    ]);
    const routeLocked = readSnapshotValue(authoritativeSnapshot, [
      "routeLocked",
      "isRouteLocked",
    ]);
    const lastCallback = readSnapshotValue(authoritativeSnapshot, [
      "lastCallbackAt",
      "lastWebhookReceivedAt",
    ]);
    const pickup = readSnapshotValue(routeSnapshot, [
      "pickupAddress",
      "pickup",
      "pickupLabel",
    ]);
    const dropoff = readSnapshotValue(routeSnapshot, [
      "dropoffAddress",
      "dropoff",
      "dropoffLabel",
    ]);

    return (
      <>
        <PageHeader
          theme={theme}
          title={`${matchedForwarded.mirrorOrderId} · ${formatOpsCodeLabel(locale, matchedForwarded.platformCode)}`}
          subtitle={`${matchedForwarded.externalOrderId} · ${formatOpsCodeLabel(locale, matchedForwarded.status)} · ${formatDateTime(locale, matchedForwarded.updatedAt)}`}
          actions={
            <>
              <Link
                href={buildDispatchListHref({ board, service, facet })}
                style={{ textDecoration: "none" }}
              >
                <Btn theme={theme} icon="arrow">
                  {locale === "zh" ? "返回 Dispatch" : "Back to Dispatch"}
                </Btn>
              </Link>
              {focusedAction ? (
                <Link
                  href={focusedAction.href}
                  target={focusedAction.external ? "_blank" : undefined}
                  rel={focusedAction.external ? "noreferrer" : undefined}
                  style={{ textDecoration: "none" }}
                >
                  <Btn
                    theme={theme}
                    variant={
                      focusedAction.riskLevel === "high"
                        ? "primary"
                        : "secondary"
                    }
                    icon={focusedAction.external ? "ext" : "check"}
                  >
                    {focusedAction.label}
                  </Btn>
                </Link>
              ) : null}
            </>
          }
        />

        <div
          style={{
            padding: "24px",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.95fr)",
            gap: "16px",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: "16px", minWidth: 0 }}>
            {focusedAction ? (
              <Card theme={theme} title="Action focus">
                <DL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: locale === "zh" ? "目前處理動作" : "Current action",
                      v: focusedAction.label,
                    },
                    {
                      k: locale === "zh" ? "工作區出口" : "Workspace exit",
                      v:
                        locale === "zh"
                          ? "此鏡像單已進入 per-work-item workspace，可從右側卡片繼續處理 adapter / reconciliation。"
                          : "This mirror is now in the per-work-item workspace; continue from the adapter and reconciliation panels.",
                    },
                  ]}
                />
              </Card>
            ) : null}

            <Card theme={theme} title="Forwarded summary">
              <DL
                theme={theme}
                cols={2}
                items={[
                  { k: "domain", v: "forwarded", mono: true },
                  {
                    k: "status",
                    v: formatOpsCodeLabel(locale, matchedForwarded.status),
                    mono: true,
                  },
                  {
                    k: "source platform",
                    v: formatOpsCodeLabel(
                      locale,
                      matchedForwarded.platformCode,
                    ),
                  },
                  {
                    k: "external order",
                    v: matchedForwarded.externalOrderId,
                    mono: true,
                  },
                  {
                    k: "pickup",
                    v: formatSnapshotText(pickup),
                  },
                  {
                    k: "drop",
                    v: formatSnapshotText(dropoff),
                  },
                  {
                    k: "route locked",
                    v:
                      typeof routeLocked === "boolean"
                        ? routeLocked
                          ? "yes"
                          : "no"
                        : "—",
                    mono: true,
                  },
                  {
                    k: "waypoints",
                    v: Array.isArray(waypoints) ? `${waypoints.length}` : "—",
                    mono: true,
                  },
                  {
                    k: "accepted driver",
                    v: matchedForwarded.acceptedDriverId ?? "—",
                    mono: true,
                  },
                  {
                    k: "candidate count",
                    v: `${matchedForwarded.candidateDriverIds.length}`,
                    mono: true,
                  },
                ]}
              />
            </Card>

            <Card theme={theme} title="Sync and reconciliation">
              <DL
                theme={theme}
                cols={2}
                items={[
                  {
                    k: "last native status",
                    v: matchedForwarded.lastNativeStatus ?? "—",
                    mono: true,
                  },
                  {
                    k: "last callback",
                    v:
                      typeof lastCallback === "string"
                        ? formatDateTime(locale, lastCallback)
                        : adapter?.lastWebhookReceivedAt
                          ? formatDateTime(
                              locale,
                              adapter.lastWebhookReceivedAt,
                            )
                          : "—",
                  },
                  {
                    k: "manual fallback",
                    v: matchedForwarded.manualFallback.required
                      ? matchedForwarded.manualFallback.reason
                      : locale === "zh"
                        ? "未要求"
                        : "not required",
                  },
                  {
                    k: "reconciliation",
                    v: matchedForwarded.reconciliationJob
                      ? `${matchedForwarded.reconciliationJob.status} · ${matchedForwarded.reconciliationJob.reason}`
                      : "—",
                  },
                  {
                    k: "mismatch summary",
                    v: linkedIssue?.lastSyncError?.message ?? "—",
                  },
                  {
                    k: "no-owned-assignment",
                    v:
                      matchedForwarded.acceptedDriverId === null
                        ? "asserted"
                        : "review",
                    mono: true,
                  },
                ]}
              />
            </Card>
          </div>

          <div style={{ display: "grid", gap: "16px" }}>
            <Card theme={theme} title="Available actions">
              {detailActions.length > 0 ? (
                <div style={{ display: "grid", gap: "8px" }}>
                  {detailActions.map((action) =>
                    action.disabled ? (
                      <Btn
                        key={action.action}
                        theme={theme}
                        variant="secondary"
                      >
                        {action.label}
                      </Btn>
                    ) : (
                      <Link
                        key={action.action}
                        href={action.href}
                        target={action.external ? "_blank" : undefined}
                        rel={action.external ? "noreferrer" : undefined}
                        style={{ textDecoration: "none" }}
                      >
                        <Btn
                          theme={theme}
                          variant={
                            action.riskLevel === "high"
                              ? "primary"
                              : "secondary"
                          }
                          icon={action.external ? "ext" : "arrow"}
                        >
                          {action.label}
                        </Btn>
                      </Link>
                    ),
                  )}
                </div>
              ) : (
                <div style={{ color: theme.textMuted, fontSize: "12.5px" }}>
                  {locale === "zh"
                    ? "目前沒有可執行動作。"
                    : "No available actions."}
                </div>
              )}
            </Card>

            <Card theme={theme} title="Adapter health">
              <DL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: "adapter",
                    v: adapter
                      ? `${formatOpsCodeLabel(locale, adapter.platformCode)} · ${adapter.status}`
                      : "—",
                  },
                  {
                    k: "auth / webhook",
                    v: adapter
                      ? `${adapter.authStatus} / ${adapter.webhookStatus}`
                      : "—",
                    mono: true,
                  },
                  {
                    k: "last error",
                    v:
                      adapter?.lastError ??
                      matchedForwarded.lastSyncError?.message ??
                      "—",
                  },
                ]}
              />
            </Card>
          </div>
        </div>
      </>
    );
  }

  if (!matchedOrder) {
    notFound();
  }

  const order = matchedOrder;
  const dispatchJob = dispatchJobs.find((job) => job.orderId === order.orderId);
  const orderTasks = driverTasks.filter(
    (task) => task.orderId === order.orderId,
  );
  const currentTask = pickCurrentTask(orderTasks);
  const driverById = new Map(
    drivers.map((driver) => [driver.driverId, driver]),
  );
  const [candidates, dispatchTrace] = await Promise.all([
    dispatchJob
      ? resolveOrFallback(
          () => client.listDispatchCandidates(dispatchJob.dispatchJobId),
          [] as DispatchCandidate[],
        )
      : Promise.resolve([] as DispatchCandidate[]),
    resolveOrFallback(
      () => client.getOrderDispatchTrace(order.orderId),
      [] as DispatchTraceLogRecord[],
    ),
  ]);

  const sortedCandidates = [...candidates].sort(
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
  const timelineEntries = buildTimelineEntries(
    locale,
    dispatchTrace,
    order,
    dispatchJob,
    currentTask,
  );
  const overrideSummary = buildOverrideSummary(locale, order);

  const candidateColumns: CanvasTableColumn<CandidateRow>[] = [
    {
      h: "RANK",
      k: "rankCell",
      w: 52,
    },
    {
      h: "DRIVER",
      k: "driverCell",
      w: 180,
    },
    {
      h: "VEHICLE",
      k: "vehicle",
      w: 132,
      mono: true,
    },
    {
      h: "ETA",
      k: "etaCell",
      w: 84,
    },
    {
      h: "GATE",
      k: "gateCell",
      w: 164,
    },
    {
      h: "SCORE",
      k: "score",
      w: 68,
      mono: true,
    },
  ];

  return (
    <>
      <PageHeader
        theme={theme}
        title={`${order.orderNo} · ${getTenantLabel(order)}`}
        subtitle={`${getAddressLabel(order.pickup)}  →  ${getAddressLabel(order.dropoff)}  ·  ${formatWindow(order, locale)}`}
        actions={
          <>
            <Link
              href={buildDispatchListHref({ board, service, facet })}
              style={{ textDecoration: "none" }}
            >
              <Btn theme={theme} icon="arrow">
                {locale === "zh" ? "返回 Dispatch" : "Back to Dispatch"}
              </Btn>
            </Link>
            <Btn theme={theme} icon="phone">
              聯絡乘客
            </Btn>
            <Btn theme={theme} icon="warn">
              request override
            </Btn>
            <Btn
              theme={theme}
              variant="primary"
              icon="check"
              disabled={candidateRows.length === 0}
            >
              指派候選 #1
            </Btn>
          </>
        }
      />

      <div
        style={{
          padding: "24px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
          gap: "16px",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: "16px", minWidth: 0 }}>
          {requestedAction ? (
            <Card theme={theme} title="Action focus">
              <DL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: locale === "zh" ? "目前處理動作" : "Current action",
                    v: resolveActionLabel(requestedAction, locale),
                  },
                  {
                    k: locale === "zh" ? "工作區提示" : "Workspace cue",
                    v:
                      locale === "zh"
                        ? "你已從 board CTA 進入此工作項目，可在此完成指派、重派或 escalation 決策。"
                        : "You entered this work item from a board CTA; complete the assignment, redispatch, or escalation decision here.",
                  },
                ]}
              />
            </Card>
          ) : null}

          <Card
            theme={theme}
            title={`候選 driver (${candidateRows.length})`}
            padding={0}
          >
            {candidateRows.length > 0 ? (
              <Table
                theme={theme}
                columns={candidateColumns}
                rows={candidateRows}
              />
            ) : (
              <div
                style={{
                  padding: "16px",
                  color: theme.textMuted,
                  fontSize: "12.5px",
                }}
              >
                {locale === "zh"
                  ? "目前沒有候選供給，請改由 no-supply / governance lane 處理。"
                  : "No candidates yet. Handle through no-supply or governance lane."}
              </div>
            )}
          </Card>

          <Card theme={theme} title="Compliance gates">
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
          <Card theme={theme} title="訂單狀態">
            {renderWorkflowSteps(locale, order, dispatchJob, currentTask)}
          </Card>

          <Card theme={theme} title="活動">
            {renderTimeline(locale, timelineEntries)}
          </Card>
        </div>
      </div>
    </>
  );
}

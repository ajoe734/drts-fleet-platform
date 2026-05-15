import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  DispatchCandidate,
  DispatchJobRecord,
  DispatchTraceLogRecord,
  DriverRegistryRecord,
  DriverTaskRecord,
  OwnedOrderRecord,
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
  CanvasField as Field,
  CanvasInput as Input,
  CanvasKPI as KPI,
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
};

type CandidateRow = Record<string, unknown> & {
  candidate: DispatchCandidate;
  driver: DriverRegistryRecord | null;
  gateLabel: string;
  gateTone: "success" | "warn" | "danger";
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

function actionLinkStyle(
  variant: "primary" | "secondary" | "ghost" = "secondary",
) {
  if (variant === "primary") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      height: "28px",
      padding: "5px 10px",
      borderRadius: "7px",
      background: theme.accent,
      color: "#ffffff",
      border: `1px solid ${theme.accent}`,
      fontSize: "12px",
      fontWeight: 500,
      lineHeight: 1,
      textDecoration: "none",
    } as const;
  }

  if (variant === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      height: "28px",
      padding: "5px 10px",
      borderRadius: "7px",
      background: "transparent",
      color: theme.textMuted,
      border: "1px solid transparent",
      fontSize: "12px",
      fontWeight: 500,
      lineHeight: 1,
      textDecoration: "none",
    } as const;
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    height: "28px",
    padding: "5px 10px",
    borderRadius: "7px",
    background: theme.surface,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
  } as const;
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

function getStateTone(stateCode: string) {
  if (stateCode === "assigned" || stateCode === "completed") {
    return "success" as const;
  }

  if (stateCode === "no_supply") {
    return "danger" as const;
  }

  if (
    stateCode === "dispatch_timeout" ||
    stateCode === "exception_hold" ||
    stateCode === "override_pending"
  ) {
    return "warn" as const;
  }

  if (stateCode === "broadcasting" || stateCode === "queued") {
    return "info" as const;
  }

  return "neutral" as const;
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
        gap: "8px",
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
}: DispatchDetailPageProps) {
  const { dispatchId } = await params;
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);

  const [orders, dispatchJobs, driverTasks, drivers] = await Promise.all([
    resolveOrFallback(() => client.listOrders(), [] as OwnedOrderRecord[]),
    resolveOrFallback(
      () => client.listDispatchJobs(),
      [] as DispatchJobRecord[],
    ),
    resolveOrFallback(() => client.listDriverTasks(), [] as DriverTaskRecord[]),
    resolveOrFallback(() => client.listDrivers(), [] as DriverRegistryRecord[]),
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
        gateLabel: gate.label,
        gateTone: gate.tone,
        score: getCandidateScore(candidate, order, driver),
        _selected: index === 0,
      };
    },
  );
  const currentState = getVisibleStateCode(order, dispatchJob);
  const currentStateTone = getStateTone(currentState);
  const activeGate =
    order.complianceGates?.find((gate) => gate.state !== "clear") ?? null;
  const liveCandidateCount = sortedCandidates.filter(
    (candidate) => getCandidateLocationState(candidate) === "live",
  ).length;
  const bestEta =
    sortedCandidates[0]?.etaMinutes ?? dispatchJob?.latestEtaMinutes ?? null;
  const timelineEntries = buildTimelineEntries(
    locale,
    dispatchTrace,
    order,
    dispatchJob,
    currentTask,
  );
  const overrideSummary = buildOverrideSummary(locale, order);
  const bannerTone =
    order.exceptionHold && !order.exceptionHold.resolution
      ? ("warn" as const)
      : candidateRows.length === 0
        ? ("danger" as const)
        : activeGate
          ? ("warn" as const)
          : ("info" as const);
  const bannerTitle =
    order.exceptionHold && !order.exceptionHold.resolution
      ? locale === "zh"
        ? "人工覆核待處理"
        : "Manual override review pending"
      : candidateRows.length === 0
        ? locale === "zh"
          ? "目前沒有可指派候選"
          : "No candidates available"
        : activeGate
          ? locale === "zh"
            ? "供給與合規需要人工判讀"
            : "Candidate supply needs manual review"
          : locale === "zh"
            ? "最佳候選已就緒"
            : "Best candidate ready";
  const bannerBody =
    order.exceptionHold && !order.exceptionHold.resolution
      ? locale === "zh"
        ? `${formatOpsCodeLabel(locale, order.exceptionHold.reasonCode)}，目前由 ${overrideSummary.actor} 等待 decision。`
        : `${order.exceptionHold.reasonCode} is waiting on ${overrideSummary.actor}.`
      : candidateRows.length === 0
        ? locale === "zh"
          ? "目前這筆單尚未取得候選供給，請檢查 service bucket、位置回報與 delayed queue。"
          : "Check service bucket, location freshness, and delayed queue recovery."
        : activeGate
          ? locale === "zh"
            ? `主要 gate：${formatOpsCodeLabel(locale, activeGate.gateType)}。目前 ${liveCandidateCount}/${candidateRows.length} 位候選具即時位置。`
            : `Primary gate: ${activeGate.gateType}. ${liveCandidateCount}/${candidateRows.length} candidates have live location.`
          : locale === "zh"
            ? `候選 ${candidateRows.length} 名，最佳 ETA ${bestEta ?? "—"}m，可直接進行人工確認後指派。`
            : `${candidateRows.length} candidates ready with best ETA ${bestEta ?? "—"}m.`;

  const candidateColumns: CanvasTableColumn<CandidateRow>[] = [
    {
      h: "RANK",
      w: 52,
      r: (_, index) => (
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
    },
    {
      h: "DRIVER",
      w: 180,
      r: (row) => (
        <Link
          href={`/drivers/${encodeURIComponent(row.candidate.driverId)}`}
          style={{
            display: "grid",
            gap: "2px",
            color: theme.text,
            textDecoration: "none",
          }}
        >
          <span style={{ fontWeight: 600 }}>
            {row.driver?.name ?? row.candidate.driverId}
          </span>
          <span
            style={{
              fontSize: "11px",
              color: theme.textDim,
              fontFamily: theme.monoFamily,
            }}
          >
            {row.candidate.driverId}
          </span>
        </Link>
      ),
    },
    {
      h: "VEHICLE",
      w: 132,
      mono: true,
      r: (row) => row.candidate.vehicleId,
    },
    {
      h: "ETA",
      w: 84,
      r: (row) => (
        <Pill theme={theme} tone={row._selected ? "success" : "info"}>
          {row.candidate.etaMinutes}m
        </Pill>
      ),
    },
    {
      h: "GATE",
      w: 164,
      r: (row) => (
        <Pill theme={theme} tone={row.gateTone} dot>
          {row.gateLabel}
        </Pill>
      ),
    },
    {
      h: "SCORE",
      w: 68,
      mono: true,
      r: (row) => row.score,
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

      <div style={{ padding: "24px", display: "grid", gap: "16px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "10px",
          }}
        >
          <KPI
            theme={theme}
            label="候選數"
            value={candidateRows.length}
            delta={`${liveCandidateCount} live`}
            deltaTone={liveCandidateCount > 0 ? "up" : "down"}
          />
          <KPI
            theme={theme}
            label="最佳 ETA"
            value={bestEta !== null ? `${bestEta}m` : "—"}
            delta={
              dispatchJob
                ? formatOpsCodeLabel(locale, dispatchJob.status)
                : "queued"
            }
            deltaTone={bestEta !== null && bestEta <= 10 ? "up" : "neutral"}
          />
          <KPI
            theme={theme}
            label="訂單狀態"
            value={formatOpsCodeLabel(locale, currentState)}
            delta={currentTask ? currentTask.vehicleId : "未指派"}
            deltaTone={currentStateTone === "danger" ? "down" : "neutral"}
          />
          <KPI
            theme={theme}
            label="活動數"
            value={timelineEntries.length}
            sub={
              timelineEntries[0]
                ? formatDateTime(locale, timelineEntries[0].at)
                : "—"
            }
            hint={dispatchJob?.dispatchJobId ?? order.orderId}
          />
        </div>

        <Banner
          theme={theme}
          tone={bannerTone}
          icon="warn"
          title={bannerTitle}
          body={bannerBody}
          actions={
            <Link
              href={`/dispatch?view=owned&orderId=${encodeURIComponent(order.orderId)}`}
              style={actionLinkStyle("secondary")}
            >
              返回 dispatch board
            </Link>
          }
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
            gap: "16px",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: "16px", minWidth: 0 }}>
            <Card
              theme={theme}
              title={`候選 driver (${candidateRows.length})`}
              subtitle="availability-first evaluation"
              actions={
                dispatchJob ? (
                  <Pill theme={theme} tone="accent" dot>
                    {dispatchJob.dispatchJobId}
                  </Pill>
                ) : undefined
              }
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

            <Card
              theme={theme}
              title="Compliance gates"
              subtitle="dispatch / pricing / queue governance"
            >
              <DL
                theme={theme}
                cols={2}
                items={[
                  {
                    k: "license valid",
                    v: `${candidateRows.filter((row) => row.driver?.licensesValid !== false).length}/${candidateRows.length || 0} ${
                      locale === "zh" ? "候選通過" : "clear"
                    }`,
                    mono: true,
                  },
                  {
                    k: "service bucket",
                    v: `${formatOpsCodeLabel(locale, order.serviceBucket)} · ${
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
                    k: "device / location",
                    v: `${liveCandidateCount}/${candidateRows.length || 0} live · ${
                      candidateRows.filter(
                        (row) => row.driver?.dispatchEligible,
                      ).length
                    }/${candidateRows.length || 0} eligible`,
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
                      ? order.exceptionHold.overrideAllowed
                        ? locale === "zh"
                          ? "reviewer allowed"
                          : "reviewer allowed"
                        : locale === "zh"
                          ? "reviewer required"
                          : "reviewer required"
                      : locale === "zh"
                        ? "not needed"
                        : "not needed",
                    mono: true,
                  },
                ]}
              />
            </Card>

            <Card
              theme={theme}
              title="Manual overrides"
              subtitle="exception hold / fare override / redispatch note"
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "12px",
                }}
              >
                <Field theme={theme} label="override type">
                  <Input theme={theme} value={overrideSummary.type} />
                </Field>
                <Field theme={theme} label="decision">
                  <Input theme={theme} value={overrideSummary.status} />
                </Field>
                <Field theme={theme} label="actor">
                  <Input theme={theme} value={overrideSummary.actor} mono />
                </Field>
                <Field theme={theme} label="next action">
                  <Input theme={theme} value={overrideSummary.nextAction} />
                </Field>
                <Field theme={theme} label="reason / note">
                  <Input theme={theme} value={overrideSummary.note} />
                </Field>
                <Field theme={theme} label="linked task">
                  <Input
                    theme={theme}
                    value={
                      currentTask
                        ? `${currentTask.taskId} · ${currentTask.vehicleId}`
                        : "—"
                    }
                    mono
                  />
                </Field>
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "2px" }}>
                <Btn theme={theme}>request override</Btn>
                <Btn theme={theme} variant="ghost">
                  release back to queue
                </Btn>
              </div>
            </Card>
          </div>

          <div style={{ display: "grid", gap: "16px", minWidth: 0 }}>
            <Card
              theme={theme}
              title="訂單狀態"
              subtitle={`${formatOpsCodeLabel(locale, currentState)} · ${formatWindow(
                order,
                locale,
              )}`}
            >
              {renderWorkflowSteps(locale, order, dispatchJob, currentTask)}
              <div style={{ height: "14px" }} />
              <DL
                theme={theme}
                cols={2}
                items={[
                  {
                    k: "ORDER",
                    v: order.orderId,
                    mono: true,
                  },
                  {
                    k: "STATE",
                    v: (
                      <Pill theme={theme} tone={currentStateTone} dot>
                        {currentState}
                      </Pill>
                    ),
                  },
                  {
                    k: "TASK",
                    v: currentTask
                      ? `${currentTask.vehicleId} · ${currentTask.driverId}`
                      : "—",
                    mono: true,
                  },
                  {
                    k: "QUEUE",
                    v: order.queueFamily
                      ? formatOpsCodeLabel(locale, order.queueFamily)
                      : "—",
                    mono: true,
                  },
                  {
                    k: "PASSENGER",
                    v: order.passenger.name,
                  },
                  {
                    k: "CONTACT",
                    v: order.passenger.phone,
                    mono: true,
                  },
                ]}
              />
            </Card>

            <Card
              theme={theme}
              title="活動"
              subtitle={`${timelineEntries.length} dispatch events`}
              actions={
                <Link
                  href={`/dispatch?view=owned&orderId=${encodeURIComponent(order.orderId)}`}
                  style={actionLinkStyle("ghost")}
                >
                  board context
                </Link>
              }
            >
              {renderTimeline(locale, timelineEntries)}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

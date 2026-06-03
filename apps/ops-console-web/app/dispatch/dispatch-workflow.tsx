"use client";

import {
  type ReactNode,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AddressPayload,
  ComplianceGateRecord,
  DispatchCandidate,
  DispatchCandidateLocationState,
  DispatchJobRecord,
  DispatchTraceLogRecord,
  OpsDispatchStreamEventEnvelope,
  OverrideRequestRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import { createOpsDispatchEventSource, getOpsClient } from "@/lib/api-client";
import { formatMinorCurrency } from "@/lib/ops-analytics";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import {
  CanvasPrimitives,
  CanvasActionButton as ActionButton,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasPill as Pill,
  buildCanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import {
  getCandidateLocationState,
  getCandidateLocationTone,
} from "./location-state";

interface DispatchWorkflowProps {
  orders: OwnedOrderRecord[];
  dispatchJobs: DispatchJobRecord[];
  focusOrderId?: string;
}

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const railKey = `Step${"per"}` as const;
const feedKey = `Time${"line"}` as const;
const CanvasRail: (typeof CanvasPrimitives)[typeof railKey] =
  CanvasPrimitives[railKey];
const CanvasFeed: (typeof CanvasPrimitives)[typeof feedKey] =
  CanvasPrimitives[feedKey];

type QueueState =
  | "pending"
  | "reserved"
  | "exception"
  | "timeout"
  | "no_supply";
type BoardStateTone = QueueState | "active" | "closed" | "intake";
type FilterMode = "all" | "attention" | "queued";
type ActionMode =
  | "release"
  | "cancel"
  | "fare_override"
  | "redispatch_with_reason"
  | "resolve_no_supply"
  | "request_override"
  | "approve_override"
  | "reject_override";

type SpatialPointKind = "pickup" | "dropoff" | "candidate";

interface SpatialPoint {
  key: string;
  kind: SpatialPointKind;
  label: string;
  lat: number;
  lng: number;
  tone: BoardStateTone;
  orderId?: string;
  jobId?: string;
  etaMinutes?: number | null;
  subtitle?: string;
  freshness?: DispatchCandidateLocationState;
}

interface ActionDraft {
  mode: ActionMode;
  reason: string;
  traceId: string;
  fareAmount: string;
  fareCurrency: string;
  reasonNote: string;
  escalationTarget: string;
  noSupplyResolution: "retry_dispatch" | "cancel_with_notification";
  overrideType: "release_to_dispatch" | "cancel_order";
  approvalNote: string;
  rejectionReason: string;
}

interface DispatchActivityEntry {
  id: string;
  title: string;
  body: string;
  at: string;
  tone: "default" | "warning" | "critical";
}

interface DetailActionDescriptor {
  action:
    | "assign_candidate"
    | "reassign_candidate"
    | "redispatch"
    | "redispatch_with_reason"
    | "retry_dispatch"
    | "resolve_no_supply"
    | "request_override"
    | "approve_override"
    | "reject_override"
    | "release_driver"
    | "cancel_order"
    | "fare_override"
    | "escalate_incident";
  enabled: boolean;
  requiresReason?: boolean;
  disabledReasonCode?: string;
  riskLevel: "low" | "medium" | "high";
}

const AUTO_LOAD_CANDIDATE_LIMIT = 6;
const ACTIVE_ASSIGNMENT_JOB_STATUSES = new Set<DispatchJobRecord["status"]>([
  "reserved",
  "assigned",
]);
const ACTIVE_TRIP_ORDER_STATUSES = new Set<OwnedOrderRecord["status"]>([
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
]);
const TERMINAL_ORDER_STATUSES = new Set<OwnedOrderRecord["status"]>([
  "completed",
  "cancelled",
]);

function buildDispatchTraceSyncKey(
  order: OwnedOrderRecord | null,
  job?: DispatchJobRecord,
): string | null {
  if (!order) {
    return null;
  }

  return [
    order.updatedAt,
    order.status,
    order.dispatchAttemptCount,
    order.lastDispatchFailureReason ?? "",
    order.dispatchTimeout?.timeoutAt ?? "",
    order.noSupplyEscalation?.escalatedAt ?? "",
    order.exceptionHold?.raisedAt ?? "",
    order.exceptionHold?.resolution?.resolvedAt ?? "",
    order.exceptionHold?.overrideRequest?.requestedAt ?? "",
    order.manualFareOverride?.overriddenAt ?? "",
    job?.dispatchJobId ?? "",
    job?.status ?? "",
    job?.updatedAt ?? "",
  ].join("|");
}

function getQueueState(
  order: OwnedOrderRecord,
  job?: DispatchJobRecord,
): QueueState | null {
  if (order.status === "exception_hold") return "exception";
  if (order.status === "dispatch_timeout") return "timeout";
  if (order.status === "no_supply" || order.status === "delayed_queue")
    return "no_supply";
  if (order.queueFamily === "manual_review_queue") return "exception";
  if (
    order.queueFamily === "recording_gate_queue" ||
    order.queueFamily === "redispatch_priority_queue" ||
    order.queueFamily === "reservation_confirmation_queue" ||
    order.queueFamily === "realtime_ready_queue"
  ) {
    return "pending";
  }
  if (job?.status === "reserved") return "reserved";
  if (
    job?.status === "matching" ||
    job?.status === "queued" ||
    job?.status === "redispatch_required"
  ) {
    return "pending";
  }
  return null;
}

function getQueueStateKey(state: QueueState): string {
  switch (state) {
    case "pending":
      return "dispatch.workflow.queue.pending";
    case "reserved":
      return "dispatch.workflow.queue.reserved";
    case "exception":
      return "dispatch.workflow.queue.exception";
    case "timeout":
      return "dispatch.workflow.queue.timeout";
    case "no_supply":
      return "dispatch.workflow.queue.noSupply";
  }
}

function getQueueStateColor(state: QueueState): string {
  switch (state) {
    case "pending":
      return "bg-green-100 text-green-800";
    case "reserved":
      return "bg-blue-100 text-blue-800";
    case "exception":
      return "bg-amber-100 text-amber-800";
    case "timeout":
      return "bg-rose-100 text-rose-800";
    case "no_supply":
      return "bg-orange-100 text-orange-800";
  }
}

function getBoardStateBadge(
  order: OwnedOrderRecord,
  job?: DispatchJobRecord,
): { label: string; tone: BoardStateTone } {
  const queueState = getQueueState(order, job);
  if (queueState) {
    return {
      label: getQueueStateKey(queueState),
      tone: queueState,
    };
  }

  if (
    ACTIVE_TRIP_ORDER_STATUSES.has(order.status) ||
    job?.status === "assigned"
  ) {
    return {
      label: "dispatch.workflow.boardState.active",
      tone: "active",
    };
  }

  if (TERMINAL_ORDER_STATUSES.has(order.status)) {
    return {
      label: "dispatch.workflow.boardState.closed",
      tone: "closed",
    };
  }

  return {
    label: "dispatch.workflow.boardState.intake",
    tone: "intake",
  };
}

function getBoardStateColor(state: BoardStateTone): string {
  switch (state) {
    case "pending":
    case "reserved":
    case "exception":
    case "timeout":
    case "no_supply":
      return getQueueStateColor(state);
    case "active":
      return "bg-sky-100 text-sky-800";
    case "closed":
      return "bg-slate-200 text-slate-700";
    case "intake":
      return "bg-violet-100 text-violet-800";
  }
}

function getBoardStateCanvasTone(state: BoardStateTone): CanvasTone {
  switch (state) {
    case "pending":
    case "reserved":
    case "active":
      return "info";
    case "exception":
    case "timeout":
    case "no_supply":
      return "warn";
    case "closed":
      return "neutral";
    case "intake":
    default:
      return "accent";
  }
}

function getOwnedAuthorityLabelKey(
  order: OwnedOrderRecord,
  job?: DispatchJobRecord,
): string {
  if (
    order.status === "exception_hold" ||
    order.status === "dispatch_timeout" ||
    order.status === "no_supply" ||
    order.status === "delayed_queue"
  ) {
    return "dispatch.workflow.authority.exception";
  }
  if (job?.status === "assigned") {
    return "dispatch.workflow.authority.assignment";
  }
  if (order.reservationWindowStart || order.reservationWindowEnd) {
    return "dispatch.workflow.authority.reservation";
  }
  return "dispatch.workflow.authority.local";
}

function getOwnedAuthorityTone(
  order: OwnedOrderRecord,
  job?: DispatchJobRecord,
): CanvasTone {
  if (
    order.status === "exception_hold" ||
    order.status === "dispatch_timeout" ||
    order.status === "no_supply" ||
    order.status === "delayed_queue"
  ) {
    return "warn";
  }
  if (job?.status === "assigned") {
    return "success";
  }
  if (order.reservationWindowStart || order.reservationWindowEnd) {
    return "info";
  }
  return "info";
}

function formatEta(
  locale: "en" | "zh",
  etaMinutes: number | null | undefined,
  updatedAt?: string,
): { display: string; tooltip: string } {
  if (etaMinutes === null || etaMinutes === undefined) {
    return {
      display: "N/A",
      tooltip: getOpsLabel(locale, "dispatchEtaUnavailable"),
    };
  }
  const updated = updatedAt
    ? new Date(updatedAt).toLocaleTimeString()
    : getOpsLabel(locale, "unknown");
  return {
    display: `${etaMinutes} min`,
    tooltip: getOpsLabel(locale, "dispatchLastUpdated", { value: updated }),
  };
}

function formatDateTime(
  locale: "en" | "zh",
  value: string | null | undefined,
): string {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString(locale === "zh" ? "zh-TW" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function getComplianceTone(state: string): string {
  switch (state) {
    case "clear":
      return "bg-green-100 text-green-800";
    case "pending":
      return "bg-slate-100 text-slate-700";
    case "review_required":
      return "bg-amber-100 text-amber-800";
    case "blocked":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getComplianceCanvasTone(state: string): CanvasTone {
  switch (state) {
    case "clear":
      return "success";
    case "review_required":
      return "warn";
    case "blocked":
      return "danger";
    case "pending":
    default:
      return "neutral";
  }
}

function buildActionDraft(
  order: OwnedOrderRecord,
  mode: ActionMode,
): ActionDraft {
  return {
    mode,
    reason: "",
    traceId: "",
    fareAmount:
      order.quotedFare && Number.isFinite(order.quotedFare.amountMinor)
        ? (order.quotedFare.amountMinor / 100).toFixed(2)
        : "0.00",
    fareCurrency: order.quotedFare?.currency ?? "TWD",
    reasonNote: "",
    escalationTarget: "",
    noSupplyResolution: "retry_dispatch",
    overrideType: "release_to_dispatch",
    approvalNote: "",
    rejectionReason: "",
  };
}

function getOverrideStatusLabel(
  status: OverrideRequestRecord["status"],
): string {
  switch (status) {
    case "pending_approval":
      return "dispatch.workflow.override.pending";
    case "approved":
      return "dispatch.workflow.override.approved";
    case "rejected":
      return "dispatch.workflow.override.rejected";
    case "expired":
      return "dispatch.workflow.override.expired";
    default:
      return "dispatch.workflow.override.pending";
  }
}

function getOverrideStatusTone(
  status: OverrideRequestRecord["status"],
): string {
  switch (status) {
    case "pending_approval":
      return "bg-amber-100 text-amber-800";
    case "approved":
      return "bg-green-100 text-green-800";
    case "rejected":
      return "bg-rose-100 text-rose-800";
    case "expired":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function listDownstreamReviewDuties(gates: ComplianceGateRecord[]) {
  return gates.flatMap((gate) =>
    gate.impacts
      .filter((impact) => impact.effect !== "clear")
      .map((impact) => ({
        key: `${gate.gateType}:${impact.stage}:${impact.effect}`,
        gateType: gate.gateType,
        stage: impact.stage,
        effect: impact.effect,
        reviewerLabel: gate.reviewerLabel,
        reason: impact.reason,
      })),
  );
}

function getDetailActionLabel(
  action: DetailActionDescriptor["action"],
  t: (key: string) => string,
) {
  switch (action) {
    case "assign_candidate":
      return t("dispatch.workflow.assign");
    case "reassign_candidate":
      return t("dispatch.workflow.reassign");
    case "redispatch":
      return t("dispatch.workflow.redispatch");
    case "redispatch_with_reason":
      return t("dispatch.workflow.redispatchWithReason");
    case "retry_dispatch":
      return t("dispatch.workflow.retryDispatch");
    case "resolve_no_supply":
      return t("dispatch.workflow.resolveNoSupply");
    case "request_override":
      return t("dispatch.workflow.override.request");
    case "approve_override":
      return t("dispatch.workflow.override.approve");
    case "reject_override":
      return t("dispatch.workflow.override.reject");
    case "release_driver":
      return t("dispatch.workflow.release");
    case "cancel_order":
      return t("dispatch.workflow.cancelOrder");
    case "fare_override":
      return t("dispatch.workflow.overrideFare");
    case "escalate_incident":
      return t("dispatch.workflow.escalateIncident");
  }
}

function getActivityTone(eventType: string): DispatchActivityEntry["tone"] {
  if (
    eventType.includes("hold") ||
    eventType.includes("blocked") ||
    eventType.includes("cancel")
  ) {
    return "critical";
  }
  if (
    eventType.includes("override") ||
    eventType.includes("redispatch") ||
    eventType.includes("timeout") ||
    eventType.includes("no_supply")
  ) {
    return "warning";
  }
  return "default";
}

function buildFallbackActivityEntries(
  order: OwnedOrderRecord,
  job?: DispatchJobRecord,
): DispatchActivityEntry[] {
  const entries: DispatchActivityEntry[] = [
    {
      id: `${order.orderId}:created`,
      title: "Order created",
      body: `${order.orderNo} entered the owned dispatch queue.`,
      at: order.createdAt,
      tone: "default",
    },
  ];

  if (job) {
    entries.push({
      id: `${job.dispatchJobId}:job`,
      title: "Dispatch job active",
      body: `Job ${job.dispatchJobId} is ${job.status}.`,
      at: job.updatedAt,
      tone: getActivityTone(job.status),
    });
  }

  if (order.dispatchTimeout) {
    entries.push({
      id: `${order.orderId}:timeout`,
      title: "Dispatch timeout",
      body: `Timeout escalated as ${order.dispatchTimeout.escalationAction}.`,
      at: order.dispatchTimeout.timeoutAt,
      tone: "warning",
    });
  }

  if (order.noSupplyEscalation) {
    entries.push({
      id: `${order.orderId}:no-supply`,
      title: "No supply escalation",
      body: `Attempt ${order.noSupplyEscalation.attemptCount} escalated via ${order.noSupplyEscalation.escalationAction}.`,
      at: order.noSupplyEscalation.escalatedAt,
      tone: "warning",
    });
  }

  if (order.exceptionHold) {
    entries.push({
      id: `${order.orderId}:hold`,
      title: "Exception hold raised",
      body: `Reason: ${order.exceptionHold.reasonCode}.`,
      at: order.exceptionHold.raisedAt,
      tone: "critical",
    });
    if (order.exceptionHold.overrideRequest) {
      entries.push({
        id: order.exceptionHold.overrideRequest.overrideRequestId,
        title: "Override request",
        body: `${order.exceptionHold.overrideRequest.status} by ${order.exceptionHold.overrideRequest.requestedBy.actorId}.`,
        at: order.exceptionHold.overrideRequest.requestedAt,
        tone: "warning",
      });
    }
    if (order.exceptionHold.resolution) {
      entries.push({
        id: `${order.orderId}:resolution`,
        title: "Exception resolved",
        body: `${order.exceptionHold.resolution.actorId} recorded ${order.exceptionHold.resolution.resolution}.`,
        at: order.exceptionHold.resolution.resolvedAt,
        tone: "default",
      });
    }
  }

  if (order.manualFareOverride) {
    entries.push({
      id: `${order.orderId}:fare-override`,
      title: "Manual fare override",
      body: `${order.manualFareOverride.actorId} applied a fare override.`,
      at: order.manualFareOverride.overriddenAt,
      tone: "warning",
    });
  }

  return entries.sort(
    (left, right) => new Date(right.at).getTime() - new Date(left.at).getTime(),
  );
}

function buildCandidateSearchHaystack(items: DispatchCandidate[]): string {
  return items
    .flatMap((candidate) => [
      candidate.vehicleId,
      candidate.driverId,
      candidate.operatingArea,
      candidate.etaMinutes?.toString() ?? "",
    ])
    .join(" ")
    .toLowerCase();
}

function renderStateTrack(
  locale: "en" | "zh",
  currentIndex: number,
  labels: string[],
  timestamps: Array<string | null>,
) {
  return (
    <CanvasRail
      theme={theme}
      items={labels.map((label, index) => ({
        key: `${label}-${index}`,
        label,
        status:
          index < currentIndex
            ? "complete"
            : index === currentIndex
              ? "current"
              : "upcoming",
        meta: timestamps[index]
          ? formatDateTime(locale, timestamps[index])
          : index === currentIndex
            ? locale === "zh"
              ? "進行中"
              : "active"
            : locale === "zh"
              ? "等待中"
              : "waiting",
      }))}
      minWidth={96}
    />
  );
}

function renderActivityFeed(
  locale: "en" | "zh",
  entries: DispatchActivityEntry[],
  emptyLabel: string,
) {
  return (
    <CanvasFeed
      theme={theme}
      empty={emptyLabel}
      items={entries.map((entry) => ({
        key: entry.id,
        title: entry.title,
        body: entry.body,
        timestamp: formatDateTime(locale, entry.at),
        tone:
          entry.tone === "critical"
            ? "danger"
            : entry.tone === "warning"
              ? "warn"
              : "info",
      }))}
    />
  );
}

function renderBadgeRow(items: Array<ReactNode | null | false>) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
      }}
    >
      {items.filter(Boolean)}
    </div>
  );
}

function hasCoordinates(
  address?: AddressPayload | null,
): address is AddressPayload & { lat: number; lng: number } {
  return Boolean(
    address && Number.isFinite(address.lat) && Number.isFinite(address.lng),
  );
}

function getPointStyle(kind: SpatialPointKind): {
  className: string;
  shortLabel: string;
} {
  switch (kind) {
    case "pickup":
      return { className: "spatial-point-pickup", shortLabel: "P" };
    case "dropoff":
      return { className: "spatial-point-dropoff", shortLabel: "D" };
    case "candidate":
      return { className: "spatial-point-candidate", shortLabel: "C" };
  }
}

function normalizeSpatialBounds(points: SpatialPoint[]) {
  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lng);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lngSpan = Math.max(maxLng - minLng, 0.01);

  return { minLat, maxLat, minLng, maxLng, latSpan, lngSpan };
}

function projectSpatialPoint(
  point: SpatialPoint,
  bounds: ReturnType<typeof normalizeSpatialBounds>,
) {
  const horizontalPadding = 8;
  const verticalPadding = 10;
  const width = 100 - horizontalPadding * 2;
  const height = 100 - verticalPadding * 2;
  const x =
    horizontalPadding + ((point.lng - bounds.minLng) / bounds.lngSpan) * width;
  const y =
    100 -
    verticalPadding -
    ((point.lat - bounds.minLat) / bounds.latSpan) * height;

  return {
    left: `${Math.min(96, Math.max(4, x))}%`,
    top: `${Math.min(94, Math.max(6, y))}%`,
  };
}

export function DispatchWorkflow({
  orders,
  dispatchJobs,
  focusOrderId = "",
}: DispatchWorkflowProps) {
  const { t, locale } = useTranslation();
  const client = getOpsClient();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<
    "connecting" | "live" | "retrying"
  >("connecting");
  const [filterMode, setFilterMode] = useState<FilterMode>(
    focusOrderId ? "attention" : "all",
  );
  const [searchValue, setSearchValue] = useState(focusOrderId);
  const deferredSearch = useDeferredValue(searchValue.trim().toLowerCase());
  const [liveOrders, setLiveOrders] = useState(orders);
  const [liveDispatchJobs, setLiveDispatchJobs] = useState(dispatchJobs);
  const [candidates, setCandidates] = useState<
    Record<string, DispatchCandidate[]>
  >({});
  const [selectedCandidate, setSelectedCandidate] = useState<
    Record<string, string>
  >({});
  const [actionDrafts, setActionDrafts] = useState<
    Record<string, ActionDraft | undefined>
  >({});
  const [dispatchTraceByOrder, setDispatchTraceByOrder] = useState<
    Record<string, DispatchTraceLogRecord[]>
  >({});
  const [dispatchTraceSyncKeyByOrder, setDispatchTraceSyncKeyByOrder] =
    useState<Record<string, string>>({});
  const [
    dispatchTraceFailedSyncKeyByOrder,
    setDispatchTraceFailedSyncKeyByOrder,
  ] = useState<Record<string, string>>({});
  const [traceLoadingOrderId, setTraceLoadingOrderId] = useState<string | null>(
    null,
  );
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    focusOrderId || orders[0]?.orderId || null,
  );
  const reloadTimerRef = useRef<number | null>(null);
  const autoLoadedCandidateJobsRef = useRef<Set<string>>(new Set());
  const lastSyncedFocusOrderIdRef = useRef<string>("");

  useEffect(() => {
    setLiveOrders(orders);
  }, [orders]);

  useEffect(() => {
    setLiveDispatchJobs(dispatchJobs);
  }, [dispatchJobs]);

  const orderJobMap = useMemo(
    () =>
      liveDispatchJobs.reduce(
        (acc, job) => {
          acc[job.orderId] = job;
          return acc;
        },
        {} as Record<string, DispatchJobRecord>,
      ),
    [liveDispatchJobs],
  );
  const candidateSearchHaystackByOrder = useMemo(
    () =>
      liveOrders.reduce(
        (acc, order) => {
          const jobId = orderJobMap[order.orderId]?.dispatchJobId;
          if (!jobId) {
            return acc;
          }

          const jobCandidates = candidates[jobId];
          if (!jobCandidates?.length) {
            return acc;
          }

          acc[order.orderId] = buildCandidateSearchHaystack(jobCandidates);
          return acc;
        },
        {} as Record<string, string>,
      ),
    [candidates, liveOrders, orderJobMap],
  );

  useEffect(() => {
    const visibleJobIds = liveOrders
      .map((order) => orderJobMap[order.orderId]?.dispatchJobId ?? null)
      .filter((jobId): jobId is string => Boolean(jobId));
    const missingJobIds = visibleJobIds.filter(
      (jobId) =>
        !candidates[jobId] && !autoLoadedCandidateJobsRef.current.has(jobId),
    );
    if (missingJobIds.length === 0) {
      return;
    }

    missingJobIds.slice(0, AUTO_LOAD_CANDIDATE_LIMIT).forEach((jobId) => {
      autoLoadedCandidateJobsRef.current.add(jobId);
      void client
        .listDispatchCandidates(jobId)
        .then((items) => {
          setCandidates((current) => ({ ...current, [jobId]: items }));
        })
        .catch(() => {
          autoLoadedCandidateJobsRef.current.delete(jobId);
        });
    });
  }, [candidates, client, liveOrders, orderJobMap]);

  const reloadDispatchState = async () => {
    const [nextOrders, nextDispatchJobs] = await Promise.all([
      client.listOrders(),
      client.listDispatchJobs(),
    ]);
    startTransition(() => {
      setLiveOrders(nextOrders);
      setLiveDispatchJobs(nextDispatchJobs);
    });
  };

  const loadDispatchTrace = async (
    orderId: string,
    force = false,
    expectedSyncKey?: string | null,
  ) => {
    const order =
      liveOrders.find((currentOrder) => currentOrder.orderId === orderId) ??
      null;
    const syncKey =
      expectedSyncKey ??
      buildDispatchTraceSyncKey(
        order,
        order ? orderJobMap[order.orderId] : undefined,
      );

    if (
      !force &&
      syncKey &&
      dispatchTraceByOrder[orderId] &&
      dispatchTraceSyncKeyByOrder[orderId] === syncKey
    ) {
      return;
    }
    if (
      !force &&
      syncKey &&
      dispatchTraceFailedSyncKeyByOrder[orderId] === syncKey
    ) {
      return;
    }
    setTraceLoadingOrderId(orderId);
    try {
      const items = await client.getOrderDispatchTrace(orderId);
      setDispatchTraceByOrder((current) => ({ ...current, [orderId]: items }));
      if (syncKey) {
        setDispatchTraceSyncKeyByOrder((current) => ({
          ...current,
          [orderId]: syncKey,
        }));
        setDispatchTraceFailedSyncKeyByOrder((current) => {
          if (!current[orderId]) {
            return current;
          }
          const next = { ...current };
          delete next[orderId];
          return next;
        });
      }
    } catch (traceError) {
      if (syncKey) {
        setDispatchTraceFailedSyncKeyByOrder((current) => ({
          ...current,
          [orderId]: syncKey,
        }));
      }
      setError(
        traceError instanceof Error
          ? traceError.message
          : t("dispatch.workflow.traceLoadFailed"),
      );
    } finally {
      setTraceLoadingOrderId((current) =>
        current === orderId ? null : current,
      );
    }
  };

  const scheduleDispatchReload = () => {
    if (reloadTimerRef.current !== null) {
      return;
    }

    reloadTimerRef.current = window.setTimeout(() => {
      reloadTimerRef.current = null;
      void reloadDispatchState().catch((reloadError) => {
        setError(
          reloadError instanceof Error
            ? reloadError.message
            : t("dispatch.workflow.refreshFailed"),
        );
      });
    }, 300);
  };

  useEffect(() => {
    const eventSource = createOpsDispatchEventSource();

    const handleEnvelope = (rawEvent: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(
          rawEvent.data,
        ) as OpsDispatchStreamEventEnvelope;

        startTransition(() => {
          switch (envelope.eventType) {
            case "order_created":
            case "order_updated": {
              if (!("order" in envelope.data)) {
                return;
              }
              const nextOrder = envelope.data.order;
              setLiveOrders((currentOrders) => [
                nextOrder,
                ...currentOrders.filter(
                  (order) => order.orderId !== nextOrder.orderId,
                ),
              ]);
              return;
            }
            case "dispatch_job_updated": {
              if (!("dispatchJob" in envelope.data)) {
                return;
              }
              const nextDispatchJob = envelope.data.dispatchJob;
              setLiveDispatchJobs((currentJobs) => [
                nextDispatchJob,
                ...currentJobs.filter(
                  (job) => job.dispatchJobId !== nextDispatchJob.dispatchJobId,
                ),
              ]);
              scheduleDispatchReload();
              return;
            }
            case "driver_location_updated": {
              scheduleDispatchReload();
              return;
            }
            case "supply_lifecycle_updated": {
              scheduleDispatchReload();
              return;
            }
          }
        });
      } catch (parseError) {
        setError(
          parseError instanceof Error
            ? parseError.message
            : t("dispatch.workflow.eventFailed"),
        );
      }
    };

    eventSource.onopen = () => {
      setStreamStatus("live");
    };
    eventSource.onerror = () => {
      setStreamStatus("retrying");
    };

    eventSource.addEventListener(
      "order_created",
      handleEnvelope as EventListener,
    );
    eventSource.addEventListener(
      "order_updated",
      handleEnvelope as EventListener,
    );
    eventSource.addEventListener(
      "dispatch_job_updated",
      handleEnvelope as EventListener,
    );
    eventSource.addEventListener(
      "driver_location_updated",
      handleEnvelope as EventListener,
    );
    eventSource.addEventListener(
      "supply_lifecycle_updated",
      handleEnvelope as EventListener,
    );

    return () => {
      if (reloadTimerRef.current !== null) {
        window.clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      eventSource.close();
    };
  }, []);

  const filteredOrders = liveOrders.filter((order) => {
    const job = orderJobMap[order.orderId];
    if (filterMode === "attention") {
      const needsAttention =
        order.status === "redispatch_required" ||
        order.status === "exception_hold" ||
        order.status === "dispatch_timeout" ||
        order.status === "no_supply" ||
        order.status === "delayed_queue" ||
        job?.status === "failed" ||
        job?.status === "timed_out" ||
        job?.status === "no_supply" ||
        job?.status === "redispatch_required";
      if (!needsAttention) return false;
    }
    if (filterMode === "queued") {
      const queued =
        job?.status === "queued" ||
        job?.status === "matching" ||
        job?.status === "reserved";
      if (!queued) return false;
    }
    if (!deferredSearch) return true;

    const haystack = [
      order.orderId,
      order.orderNo,
      order.serviceBucket,
      order.status,
      order.businessDispatchSubtype ?? "",
      job?.dispatchJobId ?? "",
      candidateSearchHaystackByOrder[order.orderId] ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(deferredSearch);
  });
  const selectedOrder =
    filteredOrders.find((order) => order.orderId === selectedOrderId) ??
    liveOrders.find((order) => order.orderId === selectedOrderId) ??
    null;
  const selectedJob = selectedOrder
    ? orderJobMap[selectedOrder.orderId]
    : undefined;
  const selectedTraceSyncKey = buildDispatchTraceSyncKey(
    selectedOrder,
    selectedJob,
  );

  useEffect(() => {
    if (!filteredOrders.length) {
      setSelectedOrderId(null);
      return;
    }

    if (!focusOrderId && lastSyncedFocusOrderIdRef.current) {
      lastSyncedFocusOrderIdRef.current = "";
    }

    if (
      focusOrderId &&
      focusOrderId !== lastSyncedFocusOrderIdRef.current &&
      filteredOrders.some((order) => order.orderId === focusOrderId)
    ) {
      lastSyncedFocusOrderIdRef.current = focusOrderId;
      setSelectedOrderId(focusOrderId);
      return;
    }

    if (
      selectedOrderId &&
      filteredOrders.some((order) => order.orderId === selectedOrderId)
    ) {
      return;
    }

    setSelectedOrderId(filteredOrders[0]?.orderId ?? null);
  }, [filteredOrders, focusOrderId, selectedOrderId]);

  useEffect(() => {
    if (!selectedOrderId || !selectedTraceSyncKey) {
      return;
    }
    if (traceLoadingOrderId === selectedOrderId) {
      return;
    }
    if (
      dispatchTraceByOrder[selectedOrderId] &&
      dispatchTraceSyncKeyByOrder[selectedOrderId] === selectedTraceSyncKey
    ) {
      return;
    }
    if (
      dispatchTraceFailedSyncKeyByOrder[selectedOrderId] ===
      selectedTraceSyncKey
    ) {
      return;
    }
    void loadDispatchTrace(selectedOrderId, false, selectedTraceSyncKey).catch(
      () => undefined,
    );
  }, [
    dispatchTraceFailedSyncKeyByOrder,
    dispatchTraceByOrder,
    dispatchTraceSyncKeyByOrder,
    selectedOrderId,
    selectedTraceSyncKey,
    traceLoadingOrderId,
  ]);

  const fetchCandidates = async (jobId: string) => {
    try {
      setLoading(jobId);
      setError(null);
      const items = await client.listDispatchCandidates(jobId);
      setCandidates((prev) => ({ ...prev, [jobId]: items }));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("dispatch.workflow.loadCandidatesFailed"),
      );
    } finally {
      setLoading(null);
    }
  };

  const runAction = async (target: string, action: () => Promise<void>) => {
    try {
      setLoading(target);
      setError(null);
      await action();
      await reloadDispatchState();
      if (selectedOrderId && selectedTraceSyncKey) {
        await loadDispatchTrace(selectedOrderId, true, selectedTraceSyncKey);
      }
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("dispatch.workflow.actionFailed"),
      );
      return false;
    } finally {
      setLoading(null);
    }
  };

  const handleAssign = async (jobId: string) => {
    const candidateKey = selectedCandidate[jobId];
    if (!candidateKey) return;

    const [vehicleId, driverId] = candidateKey.split("|");
    if (!vehicleId || !driverId) return;

    await runAction(jobId, async () => {
      await client.assignDispatch({
        dispatchJobId: jobId,
        vehicleId,
        driverId,
      });
    });
  };

  const handleReassign = async (jobId: string) => {
    const job = liveDispatchJobs.find((item) => item.dispatchJobId === jobId);
    if (!job) return;
    const candidateKey = selectedCandidate[jobId];
    if (!candidateKey) return;
    const [vehicleId, driverId] = candidateKey.split("|");
    if (!vehicleId || !driverId) return;

    await runAction(jobId, async () => {
      await client.reassignDispatch({
        dispatchJobId: jobId,
        vehicleId,
        driverId,
        reasonCode: "operator_reassign",
      });
    });
  };

  const handleRedispatch = async (orderId: string) => {
    await runAction(orderId, async () => {
      await client.redispatchOrder(orderId, "operator_redispatch");
    });
  };

  const handleResolveNoSupply = async (
    orderId: string,
    resolution: "retry_dispatch" | "cancel_with_notification",
  ) => {
    await runAction(orderId, async () => {
      await client.resolveNoSupply(orderId, resolution);
    });
  };

  const openActionDraft = (order: OwnedOrderRecord, mode: ActionMode) => {
    setActionDrafts((current) => ({
      ...current,
      [order.orderId]: buildActionDraft(order, mode),
    }));
  };

  const closeActionDraft = (orderId: string) => {
    setActionDrafts((current) => ({
      ...current,
      [orderId]: undefined,
    }));
  };

  const updateActionDraft = (orderId: string, patch: Partial<ActionDraft>) => {
    setActionDrafts((current) => {
      const existing = current[orderId];
      if (!existing) {
        return current;
      }
      return {
        ...current,
        [orderId]: {
          ...existing,
          ...patch,
        },
      };
    });
  };

  const submitActionDraft = async (
    order: OwnedOrderRecord,
    draft: ActionDraft,
  ) => {
    if (draft.mode === "request_override") {
      const reason = draft.reason.trim();
      if (!reason) {
        throw new Error(t("dispatch.workflow.actionFieldsRequired"));
      }
      const success = await runAction(order.orderId, async () => {
        await client.requestExceptionOverride(order.orderId, {
          reason,
          overrideType: draft.overrideType,
        });
      });
      if (success) {
        closeActionDraft(order.orderId);
      }
      return;
    }

    if (draft.mode === "approve_override") {
      const approvalNote = draft.approvalNote.trim();
      if (!approvalNote) {
        throw new Error(t("dispatch.workflow.actionFieldsRequired"));
      }
      const success = await runAction(order.orderId, async () => {
        await client.approveExceptionOverride(order.orderId, {
          approvalNote,
        });
      });
      if (success) {
        closeActionDraft(order.orderId);
      }
      return;
    }

    if (draft.mode === "reject_override") {
      const rejectionReason = draft.rejectionReason.trim();
      if (!rejectionReason) {
        throw new Error(t("dispatch.workflow.actionFieldsRequired"));
      }
      const success = await runAction(order.orderId, async () => {
        await client.rejectExceptionOverride(order.orderId, {
          rejectionReason,
        });
      });
      if (success) {
        closeActionDraft(order.orderId);
      }
      return;
    }

    if (draft.mode === "resolve_no_supply") {
      const success = await runAction(order.orderId, async () => {
        await client.resolveNoSupply(order.orderId, draft.noSupplyResolution);
      });
      if (success) {
        closeActionDraft(order.orderId);
      }
      return;
    }

    if (draft.mode === "redispatch_with_reason") {
      const reason = draft.reason.trim();
      if (!reason) {
        throw new Error(t("dispatch.workflow.actionFieldsRequired"));
      }
      const success = await runAction(order.orderId, async () => {
        const options: {
          reasonNote?: string;
          escalationTarget?: "ops_supervisor" | "dispatch_manager" | null;
        } = {};
        const reasonNote = draft.reasonNote.trim();
        const escalationTarget = draft.escalationTarget.trim();

        if (reasonNote) {
          options.reasonNote = reasonNote;
        }
        if (escalationTarget) {
          options.escalationTarget = escalationTarget as
            | "ops_supervisor"
            | "dispatch_manager";
        }

        await client.redispatchOrder(order.orderId, reason, options);
      });
      if (success) {
        closeActionDraft(order.orderId);
      }
      return;
    }

    const reason = draft.reason.trim();
    const traceId = draft.traceId.trim();
    if (!reason || !traceId) {
      throw new Error(t("dispatch.workflow.actionFieldsRequired"));
    }

    if (draft.mode === "fare_override") {
      const amount = Number.parseFloat(draft.fareAmount);
      if (!Number.isFinite(amount)) {
        throw new Error(t("dispatch.workflow.invalidFare"));
      }
      const success = await runAction(order.orderId, async () => {
        await client.applyManualFareOverride(order.orderId, {
          fare: {
            currency: draft.fareCurrency.trim() || "TWD",
            amountMinor: Math.round(amount * 100),
          },
          reason,
          traceId,
        });
      });
      if (success) {
        closeActionDraft(order.orderId);
      }
      return;
    }

    const success = await runAction(order.orderId, async () => {
      await client.resolveExceptionHold(order.orderId, {
        resolution:
          draft.mode === "release" ? "release_to_dispatch" : "cancel_order",
        reason,
        traceId,
      });
    });
    if (success) {
      closeActionDraft(order.orderId);
    }
  };

  const queueCounts = filteredOrders.reduce(
    (acc, order) => {
      const state = getQueueState(order, orderJobMap[order.orderId]);
      if (state) {
        acc[state] += 1;
      }
      return acc;
    },
    {
      pending: 0,
      reserved: 0,
      exception: 0,
      timeout: 0,
      no_supply: 0,
    } as Record<QueueState, number>,
  );
  const localQueueCount = filteredOrders.filter((order) => {
    const job = orderJobMap[order.orderId];
    return getQueueState(order, job) === "pending";
  }).length;
  const activeAssignmentCount = filteredOrders.filter((order) => {
    const job = orderJobMap[order.orderId];
    return job ? ACTIVE_ASSIGNMENT_JOB_STATUSES.has(job.status) : false;
  }).length;
  const exceptionDeskCount =
    queueCounts.exception + queueCounts.timeout + queueCounts.no_supply;

  const visibleOrdersForMap = filteredOrders.slice(0, 10);
  const spatialPoints: SpatialPoint[] = [];
  const ordersWithCoordinates = filteredOrders.filter((order) =>
    hasCoordinates(order.pickup),
  ).length;
  let candidateSupplyPoints = 0;
  let staleCandidatePoints = 0;
  let noLocationCandidateCount = 0;

  visibleOrdersForMap.forEach((order) => {
    const job = orderJobMap[order.orderId];
    const tone = getBoardStateBadge(order, job).tone;

    if (hasCoordinates(order.pickup)) {
      spatialPoints.push({
        key: `${order.orderId}:pickup`,
        kind: "pickup",
        label: order.orderNo,
        lat: order.pickup.lat,
        lng: order.pickup.lng,
        tone,
        orderId: order.orderId,
        subtitle: order.pickup.addressName ?? order.pickup.address,
        ...(job
          ? { jobId: job.dispatchJobId, etaMinutes: job.latestEtaMinutes }
          : {}),
      });
    }

    if (hasCoordinates(order.dropoff)) {
      spatialPoints.push({
        key: `${order.orderId}:dropoff`,
        kind: "dropoff",
        label: order.orderNo,
        lat: order.dropoff.lat,
        lng: order.dropoff.lng,
        tone,
        orderId: order.orderId,
        subtitle: order.dropoff.addressName ?? order.dropoff.address,
        ...(job
          ? { jobId: job.dispatchJobId, etaMinutes: job.latestEtaMinutes }
          : {}),
      });
    }

    if (!job) {
      return;
    }

    for (const candidate of candidates[job.dispatchJobId] ?? []) {
      const freshness = getCandidateLocationState(candidate);
      if (freshness === "no_location" || !candidate.currentLocation) {
        noLocationCandidateCount += 1;
        continue;
      }
      candidateSupplyPoints += 1;
      if (freshness === "stale") {
        staleCandidatePoints += 1;
      }
      spatialPoints.push({
        key: `${job.dispatchJobId}:${candidate.vehicleId}:${candidate.driverId}`,
        kind: "candidate",
        label: candidate.vehicleId,
        lat: candidate.currentLocation.lat,
        lng: candidate.currentLocation.lng,
        tone,
        orderId: order.orderId,
        jobId: job.dispatchJobId,
        etaMinutes: candidate.etaMinutes,
        subtitle: `${candidate.driverId} · ${candidate.operatingArea}`,
        freshness,
      });
    }
  });

  const spatialBounds =
    spatialPoints.length > 0 ? normalizeSpatialBounds(spatialPoints) : null;
  const ordersWithoutCoordinates =
    filteredOrders.length - ordersWithCoordinates;
  const selectedQueueState = selectedOrder
    ? getBoardStateBadge(selectedOrder, selectedJob)
    : null;
  const selectedCandidates = selectedJob
    ? candidates[selectedJob.dispatchJobId] || []
    : [];
  const selectedDispatchTrace = selectedOrder
    ? (dispatchTraceByOrder[selectedOrder.orderId] ?? [])
    : [];
  const selectedComplianceGates = selectedOrder?.complianceGates ?? [];
  const selectedActiveGates = selectedComplianceGates.filter(
    (gate) => gate.state !== "clear",
  );
  const selectedDownstreamReviewDuties =
    listDownstreamReviewDuties(selectedActiveGates);
  const selectedPrimaryGate =
    selectedActiveGates[0] ??
    selectedComplianceGates.find((gate) => gate.required);
  const selectedAuthorityLabelKey = selectedOrder
    ? getOwnedAuthorityLabelKey(selectedOrder, selectedJob)
    : "dispatch.workflow.authority.local";
  const selectedAuthorityTone = selectedOrder
    ? getOwnedAuthorityTone(selectedOrder, selectedJob)
    : "info";
  const selectedCandidateValue = selectedJob
    ? selectedCandidate[selectedJob.dispatchJobId] || ""
    : "";
  const selectedWorkflowHint = selectedOrder
    ? selectedOrder.dispatchSemantics === "forwarder_broadcast"
      ? t("dispatch.workflow.detail.forwardedAuthorityHint")
      : t("dispatch.workflow.detail.ownedAuthorityHint")
    : "";
  const stateTrackLabels = [
    locale === "zh" ? "建立" : "Created",
    locale === "zh" ? "排隊" : "Queued",
    locale === "zh" ? "媒合" : "Matching",
    locale === "zh" ? "指派" : "Assigned",
    locale === "zh" ? "載客中" : "On trip",
    locale === "zh" ? "完成" : "Completed",
  ];
  const selectedReservationWindow = selectedOrder
    ? selectedOrder.reservationWindowStart && selectedOrder.reservationWindowEnd
      ? `${formatDateTime(locale, selectedOrder.reservationWindowStart)} - ${formatDateTime(locale, selectedOrder.reservationWindowEnd)}`
      : t("dispatch.workflow.detail.immediateQueue")
    : "-";
  const selectedStateTrackTimestamps = selectedOrder
    ? [
        selectedOrder.createdAt,
        selectedOrder.createdAt,
        selectedJob?.status === "matching" ? selectedJob.updatedAt : null,
        selectedJob?.status === "assigned" ||
        selectedOrder.status === "assigned" ||
        selectedOrder.status === "driver_accepted" ||
        selectedOrder.status === "enroute_pickup" ||
        selectedOrder.status === "arrived_pickup"
          ? (selectedJob?.updatedAt ?? selectedOrder.updatedAt)
          : null,
        selectedOrder.status === "on_trip" ||
        selectedOrder.status === "proof_pending"
          ? selectedOrder.updatedAt
          : null,
        selectedOrder.status === "completed" ? selectedOrder.updatedAt : null,
      ]
    : [];
  const selectedStateTrackIndex = selectedOrder
    ? selectedOrder.status === "completed"
      ? 5
      : selectedOrder.status === "on_trip" ||
          selectedOrder.status === "proof_pending"
        ? 4
        : selectedJob?.status === "assigned" ||
            selectedOrder.status === "driver_accepted" ||
            selectedOrder.status === "assigned" ||
            selectedOrder.status === "enroute_pickup" ||
            selectedOrder.status === "arrived_pickup"
          ? 3
          : selectedJob?.status === "matching"
            ? 2
            : 1
    : 0;
  const selectedActivityEntries = selectedOrder
    ? selectedDispatchTrace.length > 0
      ? selectedDispatchTrace
          .map(
            (trace): DispatchActivityEntry => ({
              id: trace.traceId,
              title: formatOpsCodeLabel(locale, trace.eventType),
              body: trace.message,
              at: trace.createdAt,
              tone: getActivityTone(trace.eventType),
            }),
          )
          .sort(
            (left, right) =>
              new Date(right.at).getTime() - new Date(left.at).getTime(),
          )
      : buildFallbackActivityEntries(selectedOrder, selectedJob)
    : [];
  const selectedDetailActions: DetailActionDescriptor[] = (() => {
    if (!selectedOrder) {
      return [];
    }

    const isExceptionHold = selectedOrder.status === "exception_hold";
    const isRedispatchRequired =
      selectedOrder.status === "redispatch_required" ||
      selectedJob?.status === "redispatch_required";
    const isDispatchTimeout =
      selectedOrder.status === "dispatch_timeout" ||
      selectedJob?.status === "timed_out";
    const isNoSupply =
      selectedOrder.status === "no_supply" ||
      selectedOrder.status === "delayed_queue" ||
      selectedJob?.status === "no_supply";
    const next: DetailActionDescriptor[] = [];

    if (selectedJob) {
      next.push({
        action: "assign_candidate",
        enabled: Boolean(selectedCandidateValue),
        ...(selectedCandidateValue
          ? {}
          : { disabledReasonCode: "no_eligible_candidate" }),
        riskLevel: "medium",
      });
    }
    if (selectedJob?.status === "assigned") {
      next.push({
        action: "reassign_candidate",
        enabled: Boolean(selectedCandidateValue),
        ...(selectedCandidateValue
          ? {}
          : { disabledReasonCode: "no_eligible_candidate" }),
        riskLevel: "low",
      });
    }
    if (isRedispatchRequired || isDispatchTimeout) {
      next.push({
        action: "redispatch",
        enabled: true,
        riskLevel: "medium",
      });
      next.push({
        action: "redispatch_with_reason",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      });
    }
    if (isNoSupply) {
      next.push({
        action: "retry_dispatch",
        enabled: true,
        riskLevel: "medium",
      });
      next.push({
        action: "resolve_no_supply",
        enabled: true,
        requiresReason: true,
        riskLevel: "medium",
      });
    }
    if (
      isExceptionHold &&
      !selectedOrder.exceptionHold?.overrideRequest?.status
    ) {
      next.push({
        action: "request_override",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      });
    }
    if (
      isExceptionHold &&
      selectedOrder.exceptionHold?.overrideRequest?.status ===
        "pending_approval"
    ) {
      next.push(
        {
          action: "approve_override",
          enabled: true,
          requiresReason: true,
          riskLevel: "high",
        },
        {
          action: "reject_override",
          enabled: true,
          requiresReason: true,
          riskLevel: "high",
        },
      );
    }
    if (
      isExceptionHold &&
      (selectedOrder.exceptionHold?.overrideRequest?.status === "rejected" ||
        selectedOrder.exceptionHold?.overrideRequest?.status === "expired")
    ) {
      next.push({
        action: "request_override",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      });
    }
    if (isExceptionHold) {
      next.push(
        {
          action: "release_driver",
          enabled: true,
          requiresReason: true,
          riskLevel: "medium",
        },
        {
          action: "cancel_order",
          enabled: true,
          requiresReason: true,
          riskLevel: "high",
        },
      );
    }
    if (selectedOrder.fixedPrice) {
      next.push({
        action: "fare_override",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      });
    }
    if (isExceptionHold) {
      next.push({
        action: "escalate_incident",
        enabled: true,
        riskLevel: "medium",
      });
    }
    return next;
  })();

  const renderActionDraftForm = (
    order: OwnedOrderRecord,
    actionDraft: ActionDraft,
  ) => (
    <form
      className="action-sheet"
      onSubmit={(event) => {
        event.preventDefault();
        void submitActionDraft(order, actionDraft).catch((submitError) => {
          setError(
            submitError instanceof Error
              ? submitError.message
              : t("dispatch.workflow.actionFailed"),
          );
        });
      }}
    >
      <label className="field-label">
        {t("dispatch.workflow.actionReason")}
        <textarea
          className="action-input"
          value={actionDraft.reason}
          onChange={(event) =>
            updateActionDraft(order.orderId, {
              reason: event.target.value,
            })
          }
          rows={3}
        />
      </label>
      <label className="field-label">
        {t("dispatch.workflow.actionTraceId")}
        <input
          className="action-input"
          type="text"
          value={actionDraft.traceId}
          onChange={(event) =>
            updateActionDraft(order.orderId, {
              traceId: event.target.value,
            })
          }
        />
      </label>
      {actionDraft.mode === "fare_override" && (
        <div className="field-grid">
          <label className="field-label">
            {t("dispatch.workflow.actionFare")}
            <input
              className="action-input"
              type="number"
              min="0"
              step="0.01"
              value={actionDraft.fareAmount}
              onChange={(event) =>
                updateActionDraft(order.orderId, {
                  fareAmount: event.target.value,
                })
              }
            />
          </label>
          <label className="field-label">
            {t("dispatch.workflow.actionCurrency")}
            <input
              className="action-input"
              type="text"
              value={actionDraft.fareCurrency}
              onChange={(event) =>
                updateActionDraft(order.orderId, {
                  fareCurrency: event.target.value,
                })
              }
            />
          </label>
        </div>
      )}
      {actionDraft.mode === "redispatch_with_reason" && (
        <>
          <label className="field-label">
            {t("dispatch.workflow.reasonNote")}
            <textarea
              className="action-input"
              value={actionDraft.reasonNote}
              onChange={(event) =>
                updateActionDraft(order.orderId, {
                  reasonNote: event.target.value,
                })
              }
              rows={2}
            />
          </label>
          <label className="field-label">
            {t("dispatch.workflow.escalationTarget")}
            <select
              className="action-input"
              value={actionDraft.escalationTarget}
              onChange={(event) =>
                updateActionDraft(order.orderId, {
                  escalationTarget: event.target.value,
                })
              }
            >
              <option value="">{t("dispatch.workflow.noEscalation")}</option>
              <option value="ops_supervisor">
                {t("dispatch.workflow.escalateOps")}
              </option>
              <option value="dispatch_manager">
                {t("dispatch.workflow.escalateManager")}
              </option>
            </select>
          </label>
        </>
      )}
      {actionDraft.mode === "resolve_no_supply" && (
        <label className="field-label">
          {t("dispatch.workflow.noSupplyResolution")}
          <select
            className="action-input"
            value={actionDraft.noSupplyResolution}
            onChange={(event) =>
              updateActionDraft(order.orderId, {
                noSupplyResolution: event.target.value as
                  | "retry_dispatch"
                  | "cancel_with_notification",
              })
            }
          >
            <option value="retry_dispatch">
              {t("dispatch.workflow.retryDispatch")}
            </option>
            <option value="cancel_with_notification">
              {t("dispatch.workflow.cancelWithNotification")}
            </option>
          </select>
        </label>
      )}
      {actionDraft.mode === "request_override" && (
        <label className="field-label">
          {t("dispatch.workflow.override.typeLabel")}
          <select
            className="action-input"
            value={actionDraft.overrideType}
            onChange={(event) =>
              updateActionDraft(order.orderId, {
                overrideType: event.target.value as
                  | "release_to_dispatch"
                  | "cancel_order",
              })
            }
          >
            <option value="release_to_dispatch">
              {t("dispatch.workflow.override.releaseType")}
            </option>
            <option value="cancel_order">
              {t("dispatch.workflow.override.cancelType")}
            </option>
          </select>
        </label>
      )}
      {actionDraft.mode === "approve_override" && (
        <label className="field-label">
          {t("dispatch.workflow.override.approvalNoteLabel")}
          <textarea
            className="action-input"
            value={actionDraft.approvalNote}
            onChange={(event) =>
              updateActionDraft(order.orderId, {
                approvalNote: event.target.value,
              })
            }
            rows={3}
          />
        </label>
      )}
      {actionDraft.mode === "reject_override" && (
        <label className="field-label">
          {t("dispatch.workflow.override.rejectionReasonLabel")}
          <textarea
            className="action-input"
            value={actionDraft.rejectionReason}
            onChange={(event) =>
              updateActionDraft(order.orderId, {
                rejectionReason: event.target.value,
              })
            }
            rows={3}
          />
        </label>
      )}
      <div className="action-row">
        <button
          className="btn btn-primary"
          disabled={loading === order.orderId}
          type="submit"
        >
          {t("dispatch.workflow.actionSubmit")}
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => closeActionDraft(order.orderId)}
        >
          {t("dispatch.workflow.actionDismiss")}
        </button>
      </div>
    </form>
  );

  const renderDetailActionPanel = (
    order: OwnedOrderRecord,
    job?: DispatchJobRecord,
  ) => {
    const actionDraft = actionDrafts[order.orderId];
    const incidentHref = `/incidents?sourceOrderId=${encodeURIComponent(order.orderId)}`;

    const invokeDescriptor = (descriptor: DetailActionDescriptor) => {
      switch (descriptor.action) {
        case "assign_candidate":
          void handleAssign(job?.dispatchJobId ?? "");
          return;
        case "reassign_candidate":
          void handleReassign(job?.dispatchJobId ?? "");
          return;
        case "redispatch":
          void handleRedispatch(order.orderId);
          return;
        case "retry_dispatch":
          void handleResolveNoSupply(order.orderId, "retry_dispatch");
          return;
        case "resolve_no_supply":
          openActionDraft(order, "resolve_no_supply");
          return;
        case "redispatch_with_reason":
          openActionDraft(order, "redispatch_with_reason");
          return;
        case "request_override":
          openActionDraft(order, "request_override");
          return;
        case "approve_override":
          openActionDraft(order, "approve_override");
          return;
        case "reject_override":
          openActionDraft(order, "reject_override");
          return;
        case "release_driver":
          openActionDraft(order, "release");
          return;
        case "cancel_order":
          openActionDraft(order, "cancel");
          return;
        case "fare_override":
          openActionDraft(order, "fare_override");
          return;
        case "escalate_incident":
          window.location.assign(incidentHref);
          return;
      }
    };

    return (
      <>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          {selectedDetailActions.map((descriptor) => {
            const busyTarget =
              descriptor.action === "assign_candidate" ||
              descriptor.action === "reassign_candidate"
                ? job?.dispatchJobId
                : order.orderId;
            const button = (
              <ActionButton
                theme={theme}
                key={descriptor.action}
                riskLevel={descriptor.riskLevel}
                {...(descriptor.requiresReason === undefined
                  ? {}
                  : { requiresReason: descriptor.requiresReason })}
                disabled={!descriptor.enabled || loading === busyTarget}
                onClick={() => invokeDescriptor(descriptor)}
              >
                {getDetailActionLabel(descriptor.action, t)}
              </ActionButton>
            );
            return (
              <span
                key={descriptor.action}
                title={
                  descriptor.disabledReasonCode
                    ? formatOpsCodeLabel(locale, descriptor.disabledReasonCode)
                    : undefined
                }
                style={{ display: "inline-flex" }}
              >
                {button}
              </span>
            );
          })}
        </div>
        {actionDraft ? (
          renderActionDraftForm(order, actionDraft)
        ) : (
          <div className="detail-empty-hint">
            {t("dispatch.workflow.detail.actionPanelHint")}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="dispatch-workflow">
      {error && (
        <div className="error-banner">
          <strong>{getOpsLabel(locale, "error")}:</strong> {error}
        </div>
      )}

      <section className="board-intro">
        <div className="board-intro-copy">
          <div className="detail-kicker">
            {t("dispatch.workflow.boardTitle")}
          </div>
          <div className="board-intro-body">
            {t("dispatch.workflow.boardSubtitle")}
          </div>
        </div>
        <div className="board-intro-badges">
          <Pill theme={theme} tone="info">
            {t("dispatch.workflow.authority.local")}
          </Pill>
          <Pill theme={theme} tone="success">
            {t("dispatch.workflow.schema.activeAssignment")}
          </Pill>
          <Pill theme={theme} tone="warn">
            {t("dispatch.workflow.schema.exceptionDesk")}
          </Pill>
        </div>
        <div className="board-schema-grid">
          <div className="board-schema-card">
            <strong>{localQueueCount}</strong>
            <span>{t("dispatch.workflow.schema.localQueue")}</span>
            <div className="cell-subcopy">
              {t("dispatch.workflow.schema.localQueueHint", {
                count: localQueueCount,
              })}
            </div>
          </div>
          <div className="board-schema-card">
            <strong>{activeAssignmentCount}</strong>
            <span>{t("dispatch.workflow.schema.activeAssignment")}</span>
            <div className="cell-subcopy">
              {t("dispatch.workflow.schema.activeAssignmentHint", {
                count: activeAssignmentCount,
              })}
            </div>
          </div>
          <div className="board-schema-card">
            <strong>{exceptionDeskCount}</strong>
            <span>{t("dispatch.workflow.schema.exceptionDesk")}</span>
            <div className="cell-subcopy">
              {t("dispatch.workflow.schema.exceptionDeskHint", {
                count: exceptionDeskCount,
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          placeholder={t("dispatch.workflow.search")}
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
        />
        <div className="filter-chip-group">
          {(["all", "attention", "queued"] as const).map((value) => (
            <button
              key={value}
              className={value === filterMode ? "chip chip-active" : "chip"}
              type="button"
              onClick={() => setFilterMode(value)}
            >
              {t(
                `dispatch.workflow.filter${value.charAt(0).toUpperCase() + value.slice(1)}`,
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="stream-banner">
        <strong>{t("dispatch.workflow.live")}:</strong>{" "}
        {streamStatus === "live"
          ? t("dispatch.workflow.liveConnected")
          : streamStatus === "retrying"
            ? t("dispatch.workflow.liveReconnecting")
            : t("dispatch.workflow.liveConnecting")}
      </div>

      <div className="queue-summary">
        {(
          [
            "pending",
            "reserved",
            "exception",
            "timeout",
            "no_supply",
          ] as QueueState[]
        ).map((state) => (
          <div
            key={state}
            className={`queue-card ${getQueueStateColor(state)}`}
          >
            <strong>{queueCounts[state]}</strong>
            <span>{t(getQueueStateKey(state))}</span>
          </div>
        ))}
      </div>

      <section className="spatial-board">
        <div className="spatial-board-header">
          <div>
            <div className="spatial-board-title">
              {t("dispatch.workflow.map.title")}
            </div>
            <div className="cell-subcopy">
              {t("dispatch.workflow.map.subtitle")}
            </div>
          </div>
          <div className="spatial-board-stats">
            <div className="spatial-stat-card">
              <strong>{ordersWithCoordinates}</strong>
              <span>{t("dispatch.workflow.map.ordersWithCoords")}</span>
            </div>
            <div className="spatial-stat-card">
              <strong>{candidateSupplyPoints}</strong>
              <span>{t("dispatch.workflow.map.supplyPoints")}</span>
            </div>
            <div className="spatial-stat-card">
              <strong>{staleCandidatePoints}</strong>
              <span>{t("dispatch.workflow.map.staleSupply")}</span>
            </div>
            <div className="spatial-stat-card">
              <strong>{noLocationCandidateCount}</strong>
              <span>{t("dispatch.workflow.map.noLocationSupply")}</span>
            </div>
          </div>
        </div>

        <div className="spatial-board-note">
          {t("dispatch.workflow.map.projectionNote")}
        </div>

        {spatialBounds ? (
          <div className="spatial-map-shell">
            <div className="spatial-map">
              <div className="spatial-grid" />
              {visibleOrdersForMap.map((order) => {
                const pickupPoint = spatialPoints.find(
                  (point) =>
                    point.orderId === order.orderId && point.kind === "pickup",
                );
                const dropoffPoint = spatialPoints.find(
                  (point) =>
                    point.orderId === order.orderId && point.kind === "dropoff",
                );
                if (!pickupPoint || !dropoffPoint || !spatialBounds) {
                  return null;
                }
                const pickup = projectSpatialPoint(pickupPoint, spatialBounds);
                const dropoff = projectSpatialPoint(
                  dropoffPoint,
                  spatialBounds,
                );

                return (
                  <svg
                    key={`${order.orderId}:route`}
                    className="spatial-route"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <line
                      x1={pickup.left.replace("%", "")}
                      y1={pickup.top.replace("%", "")}
                      x2={dropoff.left.replace("%", "")}
                      y2={dropoff.top.replace("%", "")}
                    />
                  </svg>
                );
              })}
              {spatialPoints.map((point) => {
                const coords = projectSpatialPoint(point, spatialBounds);
                const pointStyle = getPointStyle(point.kind);
                return (
                  <button
                    key={point.key}
                    className={`spatial-point ${pointStyle.className} ${
                      point.freshness === "stale" ? "spatial-point-stale" : ""
                    }`}
                    style={coords}
                    title={`${point.label} · ${point.subtitle ?? ""}`}
                    type="button"
                    onClick={() => {
                      if (point.orderId) {
                        setSearchValue(point.label);
                        setFilterMode("all");
                        setSelectedOrderId(point.orderId);
                      }
                    }}
                  >
                    <span>{pointStyle.shortLabel}</span>
                  </button>
                );
              })}
              <div className="spatial-axis spatial-axis-top">
                {t("dispatch.workflow.map.northWest", {
                  lat: spatialBounds.maxLat.toFixed(3),
                  lng: spatialBounds.minLng.toFixed(3),
                })}
              </div>
              <div className="spatial-axis spatial-axis-bottom">
                {t("dispatch.workflow.map.southEast", {
                  lat: spatialBounds.minLat.toFixed(3),
                  lng: spatialBounds.maxLng.toFixed(3),
                })}
              </div>
            </div>

            <div className="spatial-legend">
              <div className="spatial-legend-title">
                {t("dispatch.workflow.map.legend")}
              </div>
              <div className="spatial-legend-list">
                {(["pickup", "dropoff", "candidate"] as SpatialPointKind[]).map(
                  (kind) => {
                    const pointStyle = getPointStyle(kind);
                    return (
                      <div key={kind} className="spatial-legend-item">
                        <span
                          className={`spatial-legend-dot ${pointStyle.className}`}
                        />
                        <span>{t(`dispatch.workflow.map.legend.${kind}`)}</span>
                      </div>
                    );
                  },
                )}
                <div className="spatial-legend-item">
                  <span className="spatial-legend-dot spatial-point-candidate spatial-point-stale" />
                  <span>{t("dispatch.workflow.map.legend.stale")}</span>
                </div>
                <div className="spatial-legend-item">
                  <span className="spatial-legend-dot spatial-point-no-location" />
                  <span>{t("dispatch.workflow.map.legend.noLocation")}</span>
                </div>
              </div>

              <div className="spatial-order-list">
                {visibleOrdersForMap.slice(0, 6).map((order) => {
                  const job = orderJobMap[order.orderId];
                  return (
                    <button
                      key={order.orderId}
                      type="button"
                      className={`spatial-order-card ${
                        selectedOrderId === order.orderId
                          ? "spatial-order-card-active"
                          : ""
                      }`}
                      onClick={() => setSelectedOrderId(order.orderId)}
                    >
                      <div className="cell-title">{order.orderNo}</div>
                      <div className="cell-subcopy">
                        {t(getBoardStateBadge(order, job).label)}
                      </div>
                      <div className="cell-subcopy">
                        {hasCoordinates(order.pickup)
                          ? `${order.pickup.lat.toFixed(3)}, ${order.pickup.lng.toFixed(3)}`
                          : t("dispatch.workflow.map.missingPickupCoords")}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="spatial-empty">
            <strong>{t("dispatch.workflow.map.emptyTitle")}</strong>
            <span>{t("dispatch.workflow.map.emptyBody")}</span>
          </div>
        )}

        <div className="spatial-board-footer">
          <span>
            {t("dispatch.workflow.map.missingCoords", {
              count: ordersWithoutCoordinates,
            })}
          </span>
          <span>{t("dispatch.workflow.map.autoLoadHint")}</span>
        </div>
      </section>

      <div className="results-note">
        {t("dispatch.workflow.showing", {
          visible: filteredOrders.length,
          total: liveOrders.length,
        })}
      </div>

      <section className="detail-workspace">
        <div className="detail-workspace-header">
          <div>
            <div className="detail-kicker">
              {t("dispatch.workflow.detail.title")}
            </div>
            <div className="detail-headline">
              {selectedOrder
                ? t("dispatch.workflow.detail.selectedOrder", {
                    orderNo: selectedOrder.orderNo,
                  })
                : t("dispatch.workflow.detail.emptyTitle")}
            </div>
          </div>
          {selectedQueueState && (
            <span
              className={`queue-badge ${getBoardStateColor(selectedQueueState.tone)}`}
            >
              {t(selectedQueueState.label)}
            </span>
          )}
        </div>

        {selectedOrder ? (
          <div
            className="detail-canvas-grid"
            aria-label={t("dispatch.workflow.detail.title")}
          >
            <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
              <Card
                theme={theme}
                title={t("dispatch.workflow.detail.selectedOrder", {
                  orderNo: selectedOrder.orderNo,
                })}
                subtitle={selectedWorkflowHint}
                actions={renderBadgeRow([
                  <Pill
                    key="authority"
                    theme={theme}
                    tone={selectedAuthorityTone}
                  >
                    {t(selectedAuthorityLabelKey)}
                  </Pill>,
                  selectedQueueState ? (
                    <Pill
                      key="queue"
                      theme={theme}
                      tone={getBoardStateCanvasTone(selectedQueueState.tone)}
                    >
                      {t(selectedQueueState.label)}
                    </Pill>
                  ) : null,
                  selectedPrimaryGate ? (
                    <Pill
                      key="gate"
                      theme={theme}
                      tone={getComplianceCanvasTone(selectedPrimaryGate.state)}
                    >
                      {t(
                        `dispatch.workflow.gate.${selectedPrimaryGate.gateType}`,
                      )}
                    </Pill>
                  ) : null,
                ])}
              >
                <DL
                  theme={theme}
                  items={[
                    {
                      k: t("dispatch.workflow.detail.passenger"),
                      v: `${selectedOrder.passenger.name} · ${selectedOrder.passenger.phone}`,
                    },
                    {
                      k: t("dispatch.workflow.detail.contact"),
                      v: `${selectedOrder.onsiteContact?.name ?? "-"} · ${selectedOrder.onsiteContact?.phone ?? "-"}`,
                    },
                    {
                      k: t("dispatch.workflow.col.revenue"),
                      v: `${formatMinorCurrency(selectedOrder.quotedFare?.amountMinor ?? 0)} · ${selectedOrder.fixedPrice ? t("dispatch.workflow.fixedPrice") : t("dispatch.workflow.metered")}`,
                    },
                    {
                      k: t("dispatch.workflow.detail.lastUpdated"),
                      v: formatDateTime(locale, selectedOrder.updatedAt),
                    },
                    {
                      k: t("dispatch.workflow.detail.orderStatus"),
                      v: `${formatOpsCodeLabel(locale, selectedOrder.status)} · ${selectedOrder.orderId}`,
                    },
                    {
                      k: t("dispatch.workflow.detail.dispatchStatus"),
                      v: selectedJob
                        ? `${formatOpsCodeLabel(locale, selectedJob.status)} · ${selectedJob.dispatchJobId}`
                        : t("dispatch.workflow.noJob"),
                    },
                    {
                      k: t("dispatch.workflow.detail.reservationWindow"),
                      v: selectedReservationWindow,
                    },
                    {
                      k: t("dispatch.workflow.col.queue"),
                      v: selectedOrder.queueFamily
                        ? `${selectedQueueState ? t(selectedQueueState.label) : formatOpsCodeLabel(locale, selectedOrder.status)} · ${formatOpsCodeLabel(locale, selectedOrder.queueFamily)}`
                        : selectedQueueState
                          ? t(selectedQueueState.label)
                          : formatOpsCodeLabel(locale, selectedOrder.status),
                    },
                  ]}
                />
              </Card>

              <Card
                theme={theme}
                title={t("dispatch.workflow.detail.route")}
                subtitle={selectedOrder.notes || undefined}
              >
                <div className="route-grid">
                  <div className="route-stop">
                    <span className="route-stop-chip route-stop-pickup">P</span>
                    <div>
                      <div className="detail-meta-label">
                        {t("dispatch.workflow.detail.pickup")}
                      </div>
                      <div className="cell-title">
                        {selectedOrder.pickup.addressName ??
                          selectedOrder.pickup.address}
                      </div>
                      <div className="cell-subcopy">
                        {selectedOrder.pickup.address}
                      </div>
                    </div>
                  </div>
                  <div className="route-stop">
                    <span className="route-stop-chip route-stop-dropoff">
                      D
                    </span>
                    <div>
                      <div className="detail-meta-label">
                        {t("dispatch.workflow.detail.dropoff")}
                      </div>
                      <div className="cell-title">
                        {selectedOrder.dropoff.addressName ??
                          selectedOrder.dropoff.address}
                      </div>
                      <div className="cell-subcopy">
                        {selectedOrder.dropoff.address}
                      </div>
                    </div>
                  </div>
                </div>
                {selectedOrder.notes ? (
                  <div className="detail-notes">
                    <div className="detail-meta-label">
                      {t("dispatch.workflow.detail.notes")}
                    </div>
                    <div className="cell-subcopy">{selectedOrder.notes}</div>
                  </div>
                ) : null}
              </Card>

              <Card
                theme={theme}
                title={t("dispatch.workflow.detail.compliance")}
                subtitle={
                  selectedPrimaryGate
                    ? selectedPrimaryGate.nextAction
                    : t("dispatch.workflow.detail.noComplianceIssues")
                }
              >
                {selectedPrimaryGate ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    {renderBadgeRow(
                      selectedComplianceGates.map((gate) => (
                        <Pill
                          key={gate.gateType}
                          theme={theme}
                          tone={getComplianceCanvasTone(gate.state)}
                        >
                          {t(`dispatch.workflow.gate.${gate.gateType}`)}
                        </Pill>
                      )),
                    )}
                    <DL
                      theme={theme}
                      items={[
                        {
                          k: t("common.status"),
                          v: t(
                            `dispatch.workflow.gateState.${selectedPrimaryGate.state}`,
                          ),
                        },
                        {
                          k: t("dispatch.workflow.detail.nextStep"),
                          v: selectedPrimaryGate.nextAction,
                        },
                        {
                          k: t("dispatch.workflow.downstreamReview"),
                          v:
                            selectedDownstreamReviewDuties.length > 0 ? (
                              <div className="detail-list">
                                {selectedDownstreamReviewDuties.map((duty) => (
                                  <div
                                    key={duty.key}
                                    className="cell-subcopy detail-line"
                                  >
                                    {formatOpsCodeLabel(locale, duty.stage)}
                                    {duty.reviewerLabel
                                      ? ` · ${duty.reviewerLabel}`
                                      : ""}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              "-"
                            ),
                        },
                      ]}
                    />
                  </div>
                ) : (
                  <div className="cell-subcopy">
                    {t("dispatch.workflow.detail.noComplianceIssues")}
                  </div>
                )}
              </Card>

              <Card
                theme={theme}
                title={t("dispatch.workflow.detail.candidates")}
                subtitle={
                  selectedJob
                    ? t("dispatch.workflow.detail.candidateHint")
                    : t("dispatch.workflow.awaitingJob")
                }
              >
                {selectedJob ? (
                  selectedCandidates.length > 0 ? (
                    <>
                      <div className="detail-inline-summary">
                        <span className="cell-title">
                          {t("dispatch.workflow.candidateCount", {
                            count: selectedCandidates.length,
                          })}
                        </span>
                        <span className="cell-subcopy">
                          {selectedCandidateValue
                            ? t(
                                "dispatch.workflow.detail.selectedCandidateReady",
                              )
                            : t("dispatch.workflow.detail.selectCandidateHint")}
                        </span>
                      </div>
                      {(
                        [
                          "stale",
                          "no_location",
                        ] as DispatchCandidateLocationState[]
                      ).map((locationState) => {
                        const count = selectedCandidates.filter(
                          (candidate) =>
                            getCandidateLocationState(candidate) ===
                            locationState,
                        ).length;
                        if (count === 0) {
                          return null;
                        }
                        return (
                          <div
                            key={locationState}
                            className={`candidate-location-note ${getCandidateLocationTone(
                              locationState,
                            )}`}
                          >
                            {t("dispatch.workflow.candidateLocationSummary", {
                              count,
                              state: t(
                                `dispatch.workflow.candidateLocation.${locationState}`,
                              ).toLowerCase(),
                            })}
                          </div>
                        );
                      })}
                      <div className="candidate-table-shell">
                        <table className="candidate-table">
                          <thead>
                            <tr>
                              <th>{t("dispatch.workflow.col.candidates")}</th>
                              <th>{t("dispatch.workflow.col.eta")}</th>
                              <th>
                                {t("dispatch.workflow.detail.locationStatus")}
                              </th>
                              <th>{t("dispatch.workflow.col.actions")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedCandidates.map((candidate) => {
                              const candidateValue = `${candidate.vehicleId}|${candidate.driverId}`;
                              const locationState =
                                getCandidateLocationState(candidate);
                              const isCandidateSelected =
                                selectedCandidateValue === candidateValue;
                              return (
                                <tr
                                  key={`${candidate.vehicleId}:${candidate.driverId}`}
                                  className={
                                    isCandidateSelected
                                      ? "candidate-row-selected"
                                      : undefined
                                  }
                                >
                                  <td>
                                    <div className="candidate-cell-stack">
                                      <div className="cell-title">
                                        {candidate.vehicleId} ·{" "}
                                        {candidate.driverId}
                                      </div>
                                      <div className="cell-subcopy">
                                        {candidate.operatingArea}
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <span className="cell-title">
                                      {candidate.etaMinutes}m
                                    </span>
                                  </td>
                                  <td>
                                    <span
                                      className={`candidate-location-note ${getCandidateLocationTone(
                                        locationState,
                                      )}`}
                                    >
                                      {t(
                                        `dispatch.workflow.candidateLocation.${locationState}`,
                                      )}
                                    </span>
                                  </td>
                                  <td>
                                    <button
                                      className={
                                        isCandidateSelected
                                          ? "btn btn-primary"
                                          : "btn"
                                      }
                                      type="button"
                                      onClick={() =>
                                        setSelectedCandidate((prev) => ({
                                          ...prev,
                                          [selectedJob.dispatchJobId]:
                                            candidateValue,
                                        }))
                                      }
                                    >
                                      {isCandidateSelected
                                        ? t(
                                            "dispatch.workflow.detail.selectedCandidate",
                                          )
                                        : t(
                                            "dispatch.workflow.detail.chooseCandidate",
                                          )}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={() => fetchCandidates(selectedJob.dispatchJobId)}
                      disabled={loading === selectedJob.dispatchJobId}
                    >
                      {loading === selectedJob.dispatchJobId
                        ? t("common.loading")
                        : t("dispatch.workflow.viewCandidates")}
                    </button>
                  )
                ) : (
                  <div className="cell-subcopy">
                    {t("dispatch.workflow.awaitingJob")}
                  </div>
                )}
              </Card>

              <Card
                theme={theme}
                title={t("dispatch.workflow.detail.timeline")}
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <DL
                    theme={theme}
                    cols={2}
                    items={[
                      {
                        k: t("dispatch.workflow.detail.timelineEvents"),
                        v: selectedActivityEntries.length,
                        mono: true,
                      },
                      {
                        k: t("dispatch.workflow.detail.timelineLatest"),
                        v: selectedActivityEntries[0]
                          ? formatDateTime(
                              locale,
                              selectedActivityEntries[0].at,
                            )
                          : "-",
                        mono: true,
                      },
                    ]}
                  />
                  {traceLoadingOrderId === selectedOrder.orderId ? (
                    <div className="cell-subcopy">{t("common.loading")}</div>
                  ) : (
                    renderActivityFeed(
                      locale,
                      selectedActivityEntries,
                      t("dispatch.workflow.detail.timelineEmpty"),
                    )
                  )}
                </div>
              </Card>
            </div>

            <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
              <Card
                theme={theme}
                title={t("dispatch.workflow.detail.actionPanel")}
                subtitle={t("dispatch.workflow.detail.actionPanelHint")}
                actions={renderBadgeRow([
                  <Pill
                    key="authority"
                    theme={theme}
                    tone={selectedAuthorityTone}
                  >
                    {t(selectedAuthorityLabelKey)}
                  </Pill>,
                  selectedQueueState ? (
                    <Pill
                      key="queue"
                      theme={theme}
                      tone={getBoardStateCanvasTone(selectedQueueState.tone)}
                    >
                      {t(selectedQueueState.label)}
                    </Pill>
                  ) : null,
                ])}
              >
                <div style={{ display: "grid", gap: 12 }}>
                  {renderDetailActionPanel(selectedOrder, selectedJob)}
                </div>
              </Card>

              <Card
                theme={theme}
                title={t("dispatch.workflow.detail.workflowCues")}
                subtitle={t("dispatch.workflow.detail.workflowCuesHint")}
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <DL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        k: t("dispatch.workflow.col.authority"),
                        v: t(selectedAuthorityLabelKey),
                      },
                      {
                        k: t("dispatch.workflow.detail.dispatchSemantic"),
                        v: formatOpsCodeLabel(
                          locale,
                          selectedOrder.dispatchSemantics,
                        ),
                      },
                      {
                        k: t("dispatch.workflow.detail.queueState"),
                        v: selectedQueueState ? (
                          <span
                            className={`queue-badge ${getBoardStateColor(selectedQueueState.tone)}`}
                          >
                            {t(selectedQueueState.label)}
                          </span>
                        ) : (
                          formatOpsCodeLabel(locale, selectedOrder.status)
                        ),
                      },
                      {
                        k: t("dispatch.workflow.detail.compliance"),
                        v: selectedPrimaryGate
                          ? t(
                              `dispatch.workflow.gateState.${selectedPrimaryGate.state}`,
                            )
                          : t("dispatch.workflow.detail.noComplianceIssues"),
                      },
                    ]}
                  />
                  <div style={{ display: "grid", gap: 8 }}>
                    {renderStateTrack(
                      locale,
                      selectedStateTrackIndex,
                      stateTrackLabels,
                      selectedStateTrackTimestamps,
                    )}
                  </div>
                  <div className="cell-subcopy">
                    {getOpsLabel(locale, "dispatchSource", {
                      value: formatOpsCodeLabel(
                        locale,
                        selectedOrder.orderSource,
                      ),
                    })}
                    {selectedOrder.queueEntryReason
                      ? ` · ${formatOpsCodeLabel(
                          locale,
                          selectedOrder.queueEntryReason,
                        )}`
                      : ""}
                    {selectedPrimaryGate?.nextAction
                      ? ` · ${selectedPrimaryGate.nextAction}`
                      : ""}
                  </div>
                  <div className="cell-subcopy">{selectedWorkflowHint}</div>
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <Card theme={theme} title={t("dispatch.workflow.detail.emptyTitle")}>
            <div
              style={{
                minHeight: 180,
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                color: theme.textMuted,
                padding: 24,
              }}
            >
              <div style={{ display: "grid", gap: 8 }}>
                <strong style={{ color: theme.text }}>
                  {t("dispatch.workflow.detail.emptyTitle")}
                </strong>
                <span>{t("dispatch.workflow.detail.emptyBody")}</span>
              </div>
            </div>
          </Card>
        )}
      </section>

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>{t("dispatch.workflow.col.order")}</th>
              <th>{t("dispatch.workflow.col.product")}</th>
              <th>{t("dispatch.workflow.col.queue")}</th>
              <th>{t("dispatch.workflow.col.dispatch")}</th>
              <th>{t("dispatch.workflow.col.authority")}</th>
              <th>{t("dispatch.workflow.col.compliance")}</th>
              <th>{t("dispatch.workflow.col.revenue")}</th>
              <th>{t("dispatch.workflow.col.eta")}</th>
              <th>{t("dispatch.workflow.col.candidates")}</th>
              <th>{t("dispatch.workflow.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order) => {
                const job = orderJobMap[order.orderId];
                const boardState = getBoardStateBadge(order, job);
                const jobCandidates = job
                  ? candidates[job.dispatchJobId] || []
                  : [];
                const isRedispatchRequired =
                  order.status === "redispatch_required";
                const isExceptionHold = order.status === "exception_hold";
                const isDispatchTimeout = order.status === "dispatch_timeout";
                const isNoSupply =
                  order.status === "no_supply" ||
                  order.status === "delayed_queue";
                const etaInfo = job
                  ? formatEta(locale, job.latestEtaMinutes, job.updatedAt)
                  : { display: "-", tooltip: t("dispatch.workflow.noJobEta") };
                const isFocused = focusOrderId === order.orderId;
                const complianceGates = order.complianceGates ?? [];
                const activeGates = complianceGates.filter(
                  (gate) => gate.state !== "clear",
                );
                const downstreamReviewDuties =
                  listDownstreamReviewDuties(activeGates);
                const complianceFocus =
                  activeGates[0] ??
                  complianceGates.find((gate) => gate.required);
                const exceptionHold = order.exceptionHold;
                const queueFamily = order.queueFamily;
                const queueEntryReason = order.queueEntryReason;

                return (
                  <tr
                    key={order.orderId}
                    onClick={() => setSelectedOrderId(order.orderId)}
                    className={
                      isFocused || selectedOrderId === order.orderId
                        ? "row-focused"
                        : isRedispatchRequired || isDispatchTimeout
                          ? "row-alert"
                          : isExceptionHold || isNoSupply
                            ? "row-warning"
                            : ""
                    }
                  >
                    <td>
                      <div className="cell-title">{order.orderNo}</div>
                      <div className="cell-subcopy">{order.orderId}</div>
                      <div className="cell-subcopy">
                        {getOpsLabel(locale, "dispatchSource", {
                          value: formatOpsCodeLabel(locale, order.orderSource),
                        })}
                      </div>
                    </td>
                    <td>
                      <div className="cell-title">
                        {formatOpsCodeLabel(locale, order.serviceBucket)}
                      </div>
                      <div className="cell-subcopy">
                        {formatOpsCodeLabel(locale, order.dispatchSemantics)}
                        {order.businessDispatchSubtype
                          ? ` · ${formatOpsCodeLabel(
                              locale,
                              order.businessDispatchSubtype,
                            )}`
                          : ""}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`queue-badge ${getBoardStateColor(boardState.tone)}`}
                        title={t(boardState.label)}
                      >
                        {t(boardState.label)}
                      </span>
                      {queueFamily && (
                        <div className="cell-title queue-family-copy">
                          {formatOpsCodeLabel(locale, queueFamily)}
                        </div>
                      )}
                      <div className="cell-subcopy">
                        {formatOpsCodeLabel(locale, order.status)}
                      </div>
                      {queueEntryReason && (
                        <div className="cell-subcopy">
                          {formatOpsCodeLabel(locale, queueEntryReason)}
                        </div>
                      )}
                      {order.dispatchAttemptCount > 0 && (
                        <div className="cell-subcopy">
                          {t("dispatch.workflow.attemptCount", {
                            count: order.dispatchAttemptCount,
                          })}
                        </div>
                      )}
                      {order.lastDispatchFailureReason && (
                        <div className="cell-subcopy">
                          {t("dispatch.workflow.lastFailure", {
                            reason: formatOpsCodeLabel(
                              locale,
                              order.lastDispatchFailureReason,
                            ),
                          })}
                        </div>
                      )}
                      {isExceptionHold && exceptionHold && (
                        <>
                          <div className="cell-title exception-copy">
                            {t("dispatch.workflow.blockedReason", {
                              reason: formatOpsCodeLabel(
                                locale,
                                exceptionHold.reasonCode,
                              ),
                            })}
                          </div>
                          <div className="cell-subcopy">
                            {t("dispatch.workflow.overrideActors", {
                              value: exceptionHold.overrideActors
                                .map((actor) =>
                                  formatOpsCodeLabel(locale, actor),
                                )
                                .join(", "),
                            })}
                          </div>
                          {exceptionHold.overrideRequest && (
                            <div className="override-request-status">
                              <span
                                className={`queue-badge ${getOverrideStatusTone(exceptionHold.overrideRequest.status)}`}
                              >
                                {t(
                                  getOverrideStatusLabel(
                                    exceptionHold.overrideRequest.status,
                                  ),
                                )}
                              </span>
                              <div className="cell-subcopy">
                                {t("dispatch.workflow.override.requestedBy", {
                                  actor:
                                    exceptionHold.overrideRequest.requestedBy
                                      .actorId,
                                })}
                              </div>
                              <div className="cell-subcopy">
                                {t("dispatch.workflow.override.type", {
                                  type: formatOpsCodeLabel(
                                    locale,
                                    exceptionHold.overrideRequest.overrideType,
                                  ),
                                })}
                              </div>
                              <div className="cell-subcopy">
                                {t("dispatch.workflow.override.expiresAt", {
                                  time: new Date(
                                    exceptionHold.overrideRequest.expiresAt,
                                  ).toLocaleTimeString(),
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {isDispatchTimeout && order.dispatchTimeout && (
                        <div className="cell-title exception-copy">
                          {t("dispatch.workflow.timeoutReason", {
                            reason: formatOpsCodeLabel(
                              locale,
                              order.dispatchTimeout.timeoutReasonCode,
                            ),
                          })}
                        </div>
                      )}
                      {isNoSupply && order.noSupplyEscalation && (
                        <div className="cell-title exception-copy">
                          {t("dispatch.workflow.noSupplyAction", {
                            action: formatOpsCodeLabel(
                              locale,
                              order.noSupplyEscalation.escalationAction,
                            ),
                          })}
                        </div>
                      )}
                    </td>
                    <td>
                      {job ? (
                        <div className="dispatch-block">
                          <div>
                            {getOpsLabel(locale, "dispatchId", {
                              value: `${job.dispatchJobId.slice(0, 8)}...`,
                            })}
                          </div>
                          <div>
                            {getOpsLabel(locale, "dispatchStatus", {
                              value: formatOpsCodeLabel(locale, job.status),
                            })}
                          </div>
                          <div className="cell-subcopy">
                            {formatOpsCodeLabel(locale, job.mode)}
                          </div>
                        </div>
                      ) : (
                        <span className="cell-subcopy">
                          {t("dispatch.workflow.noJob")}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="dispatch-block">
                        <Pill
                          theme={theme}
                          tone={getOwnedAuthorityTone(order, job)}
                        >
                          {t(getOwnedAuthorityLabelKey(order, job))}
                        </Pill>
                        <div className="cell-subcopy">
                          {getOpsLabel(locale, "dispatchSource", {
                            value: formatOpsCodeLabel(
                              locale,
                              order.orderSource,
                            ),
                          })}
                        </div>
                        <div className="cell-subcopy">
                          {formatOpsCodeLabel(locale, order.dispatchSemantics)}
                        </div>
                      </div>
                    </td>
                    <td>
                      {complianceFocus ? (
                        <div className="dispatch-block">
                          <div className="badge-stack">
                            {complianceGates.map((gate) => (
                              <span
                                key={gate.gateType}
                                className={`queue-badge ${getComplianceTone(gate.state)}`}
                                title={gate.nextAction}
                              >
                                {t(`dispatch.workflow.gate.${gate.gateType}`)}
                              </span>
                            ))}
                          </div>
                          <div className="cell-title">
                            {t(
                              `dispatch.workflow.gateState.${complianceFocus.state}`,
                            )}
                          </div>
                          <div className="cell-subcopy">
                            {complianceFocus.nextAction}
                          </div>
                          {downstreamReviewDuties.length > 0 && (
                            <div className="detail-list">
                              <div className="cell-subcopy detail-heading">
                                {t("dispatch.workflow.downstreamReview")}
                              </div>
                              {downstreamReviewDuties.map((duty) => (
                                <div
                                  key={duty.key}
                                  className="cell-subcopy detail-line"
                                  title={duty.reason}
                                >
                                  {formatOpsCodeLabel(locale, duty.stage)}
                                  {duty.reviewerLabel
                                    ? ` · ${duty.reviewerLabel}`
                                    : ""}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="cell-subcopy">
                          {t("dispatch.workflow.noComplianceGate")}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="cell-title">
                        {formatMinorCurrency(
                          order.quotedFare?.amountMinor ?? 0,
                        )}
                      </div>
                      <div className="cell-subcopy">
                        {order.fixedPrice
                          ? t("dispatch.workflow.fixedPrice")
                          : t("dispatch.workflow.metered")}
                      </div>
                      {order.manualFareOverride && (
                        <div className="cell-subcopy">
                          {t("dispatch.workflow.overrideRecorded", {
                            actor: order.manualFareOverride.actorId,
                          })}
                        </div>
                      )}
                      {exceptionHold?.resolution && (
                        <div className="cell-subcopy">
                          {t("dispatch.workflow.lastResolution", {
                            actor: exceptionHold.resolution.actorId,
                          })}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="cell-title" title={etaInfo.tooltip}>
                        {etaInfo.display}
                      </span>
                    </td>
                    <td>
                      {job ? (
                        <div className="candidate-panel">
                          {jobCandidates.length > 0 ? (
                            <>
                              <select
                                className="candidate-select"
                                value={
                                  selectedCandidate[job.dispatchJobId] || ""
                                }
                                onChange={(event) =>
                                  setSelectedCandidate((prev) => ({
                                    ...prev,
                                    [job.dispatchJobId]: event.target.value,
                                  }))
                                }
                              >
                                <option value="">
                                  {t("dispatch.workflow.selectCandidate")}
                                </option>
                                {jobCandidates.map((candidate) => (
                                  <option
                                    key={`${candidate.vehicleId}|${candidate.driverId}`}
                                    value={`${candidate.vehicleId}|${candidate.driverId}`}
                                  >
                                    {candidate.vehicleId} / {candidate.driverId}{" "}
                                    · {candidate.etaMinutes}m ·{" "}
                                    {t(
                                      `dispatch.workflow.candidateLocation.${getCandidateLocationState(candidate)}`,
                                    )}
                                  </option>
                                ))}
                              </select>
                              <div className="cell-subcopy">
                                {t("dispatch.workflow.candidateCount", {
                                  count: jobCandidates.length,
                                })}
                              </div>
                              {(
                                [
                                  "stale",
                                  "no_location",
                                ] as DispatchCandidateLocationState[]
                              ).map((locationState) => {
                                const count = jobCandidates.filter(
                                  (candidate) =>
                                    getCandidateLocationState(candidate) ===
                                    locationState,
                                ).length;
                                if (count === 0) {
                                  return null;
                                }
                                return (
                                  <div
                                    key={locationState}
                                    className={`candidate-location-note ${getCandidateLocationTone(
                                      locationState,
                                    )}`}
                                  >
                                    {t(
                                      "dispatch.workflow.candidateLocationSummary",
                                      {
                                        count,
                                        state: t(
                                          `dispatch.workflow.candidateLocation.${locationState}`,
                                        ).toLowerCase(),
                                      },
                                    )}
                                  </div>
                                );
                              })}
                            </>
                          ) : (
                            <button
                              className="btn"
                              type="button"
                              onClick={() => fetchCandidates(job.dispatchJobId)}
                              disabled={loading === job.dispatchJobId}
                            >
                              {loading === job.dispatchJobId
                                ? t("common.loading")
                                : t("dispatch.workflow.viewCandidates")}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="cell-subcopy">
                          {t("dispatch.workflow.awaitingJob")}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          className={
                            selectedOrderId === order.orderId
                              ? "btn btn-primary"
                              : "btn"
                          }
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedOrderId(order.orderId);
                          }}
                        >
                          {selectedOrderId === order.orderId
                            ? t("dispatch.workflow.detail.activeWorkspace")
                            : t("dispatch.workflow.detail.openWorkspace")}
                        </button>
                        {job && !selectedCandidate[job.dispatchJobId] && (
                          <div className="cell-subcopy">
                            {t("dispatch.workflow.detail.selectCandidateHint")}
                          </div>
                        )}
                        {(isExceptionHold ||
                          isDispatchTimeout ||
                          isNoSupply) && (
                          <div className="cell-subcopy">
                            {t("dispatch.workflow.detail.actionPanelHint")}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10}>{t("dispatch.workflow.noOrders")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .dispatch-workflow {
          width: 100%;
        }
        .toolbar,
        .filter-chip-group,
        .queue-summary,
        .spatial-board-stats,
        .spatial-order-list,
        .actions,
        .detail-list,
        .action-sheet,
        .board-intro,
        .board-intro-badges,
        .board-schema-grid {
          display: grid;
          gap: 0.75rem;
        }
        .board-intro {
          margin-bottom: 1rem;
          padding: 1rem;
          border-radius: 1rem;
          border: 1px solid #dbeafe;
          background:
            radial-gradient(
              circle at top left,
              rgba(37, 99, 235, 0.08),
              transparent 28%
            ),
            #f8fbff;
        }
        .board-intro-copy {
          display: grid;
          gap: 0.35rem;
        }
        .board-intro-body {
          color: #475569;
          font-size: 0.92rem;
          line-height: 1.5;
        }
        .board-intro-badges {
          grid-auto-flow: column;
          grid-auto-columns: max-content;
          overflow-x: auto;
        }
        .board-schema-grid {
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }
        .board-schema-card {
          padding: 0.85rem;
          border-radius: 0.9rem;
          background: rgba(255, 255, 255, 0.85);
          border: 1px solid rgba(148, 163, 184, 0.24);
          display: grid;
          gap: 0.25rem;
        }
        .board-schema-card strong {
          font-size: 1.35rem;
          color: #0f172a;
        }
        .board-schema-card span {
          font-weight: 600;
          color: #0f172a;
        }
        .stream-banner {
          margin-bottom: 0.75rem;
          padding: 0.65rem 0.8rem;
          border-radius: 0.75rem;
          background: #ecfeff;
          color: #155e75;
        }
        .toolbar {
          margin-bottom: 1rem;
        }
        .search-input {
          width: 100%;
          padding: 0.8rem 0.9rem;
          border-radius: 0.8rem;
          border: 1px solid #cbd5e1;
        }
        .filter-chip-group {
          grid-auto-flow: column;
          grid-auto-columns: max-content;
          overflow-x: auto;
        }
        .chip {
          padding: 0.45rem 0.8rem;
          border-radius: 999px;
          border: 1px solid #cbd5e1;
          background: white;
          cursor: pointer;
        }
        .chip-active {
          background: #0f172a;
          color: white;
          border-color: #0f172a;
        }
        .queue-summary {
          grid-template-columns: repeat(5, minmax(0, 1fr));
          margin-bottom: 0.75rem;
        }
        .spatial-board {
          margin-bottom: 1rem;
          padding: 1rem;
          border: 1px solid #dbeafe;
          border-radius: 1rem;
          background:
            radial-gradient(
              circle at top left,
              rgba(56, 189, 248, 0.14),
              transparent 30%
            ),
            linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%);
        }
        .spatial-board-header,
        .spatial-board-footer,
        .spatial-map-shell,
        .spatial-legend-list {
          display: grid;
          gap: 0.75rem;
        }
        .spatial-board-header {
          margin-bottom: 0.75rem;
        }
        .spatial-board-title,
        .spatial-legend-title {
          font-size: 1rem;
          font-weight: 700;
          color: #0f172a;
        }
        .spatial-board-stats {
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        }
        .spatial-stat-card {
          padding: 0.75rem;
          border-radius: 0.9rem;
          background: rgba(255, 255, 255, 0.78);
          border: 1px solid rgba(148, 163, 184, 0.25);
          display: grid;
          gap: 0.2rem;
        }
        .spatial-stat-card strong {
          font-size: 1.25rem;
          color: #0f172a;
        }
        .spatial-board-note,
        .spatial-board-footer {
          color: #475569;
          font-size: 0.85rem;
        }
        .spatial-map-shell {
          align-items: start;
          margin-bottom: 0.75rem;
        }
        .spatial-map {
          position: relative;
          min-height: 360px;
          border-radius: 1rem;
          overflow: hidden;
          border: 1px solid rgba(56, 189, 248, 0.25);
          background:
            linear-gradient(
              180deg,
              rgba(14, 116, 144, 0.1),
              rgba(12, 74, 110, 0.02)
            ),
            linear-gradient(135deg, #dbeafe 0%, #eff6ff 48%, #f8fafc 100%);
        }
        .spatial-grid,
        .spatial-route {
          position: absolute;
          inset: 0;
        }
        .spatial-grid {
          background-image:
            linear-gradient(rgba(15, 23, 42, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(15, 23, 42, 0.08) 1px, transparent 1px);
          background-size: 20% 20%;
        }
        .spatial-route {
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .spatial-route line {
          stroke: rgba(14, 116, 144, 0.55);
          stroke-width: 0.6;
          stroke-dasharray: 1.4 1.6;
        }
        .spatial-point {
          position: absolute;
          transform: translate(-50%, -50%);
          width: 2rem;
          height: 2rem;
          border-radius: 999px;
          border: 2px solid rgba(255, 255, 255, 0.95);
          color: white;
          font-size: 0.75rem;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 25px rgba(15, 23, 42, 0.18);
          cursor: pointer;
        }
        .spatial-point-pickup {
          background: #1d4ed8;
        }
        .spatial-point-dropoff {
          background: #0f766e;
        }
        .spatial-point-candidate {
          background: #f97316;
        }
        .spatial-point-stale {
          opacity: 0.7;
          filter: grayscale(0.15);
        }
        .spatial-point-no-location {
          background: linear-gradient(
            135deg,
            rgba(248, 250, 252, 0.95),
            #cbd5e1
          );
          border-color: rgba(148, 163, 184, 0.45);
        }
        .spatial-axis {
          position: absolute;
          left: 0.75rem;
          padding: 0.35rem 0.55rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.86);
          color: #334155;
          font-size: 0.72rem;
          border: 1px solid rgba(148, 163, 184, 0.28);
        }
        .spatial-axis-top {
          top: 0.75rem;
        }
        .spatial-axis-bottom {
          bottom: 0.75rem;
        }
        .spatial-legend {
          padding: 0.9rem;
          border-radius: 1rem;
          background: rgba(255, 255, 255, 0.82);
          border: 1px solid rgba(148, 163, 184, 0.22);
        }
        .spatial-legend-item {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          color: #334155;
          font-size: 0.85rem;
        }
        .spatial-legend-dot {
          width: 0.9rem;
          height: 0.9rem;
          border-radius: 999px;
          border: 2px solid rgba(255, 255, 255, 0.95);
          display: inline-block;
        }
        .spatial-order-card {
          padding: 0.75rem;
          border-radius: 0.9rem;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          text-align: left;
          cursor: pointer;
        }
        .spatial-order-card-active {
          border-color: #60a5fa;
          background: #eff6ff;
        }
        .spatial-empty {
          padding: 1rem;
          border-radius: 0.9rem;
          background: rgba(255, 255, 255, 0.82);
          border: 1px dashed #93c5fd;
          display: grid;
          gap: 0.35rem;
          color: #334155;
          margin-bottom: 0.75rem;
        }
        .queue-card {
          padding: 0.9rem;
          border-radius: 0.9rem;
          border: 1px solid currentColor;
          display: grid;
          gap: 0.2rem;
          text-align: center;
        }
        .queue-card strong {
          font-size: 1.4rem;
        }
        .results-note,
        .cell-subcopy {
          color: #64748b;
        }
        .detail-workspace {
          margin-bottom: 1rem;
          padding: 1rem;
          border-radius: 1rem;
          border: 1px solid #e2e8f0;
          background:
            radial-gradient(
              circle at top right,
              rgba(14, 165, 233, 0.08),
              transparent 28%
            ),
            #ffffff;
        }
        .detail-workspace-header,
        .detail-workspace-grid,
        .detail-stat-grid,
        .detail-meta-grid,
        .route-grid,
        .detail-gate-grid {
          display: grid;
          gap: 0.85rem;
        }
        .detail-workspace-header {
          margin-bottom: 0.9rem;
          align-items: center;
        }
        .detail-kicker,
        .detail-meta-label,
        .detail-stat-card span {
          font-size: 0.75rem;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .detail-headline {
          font-size: 1.1rem;
          font-weight: 700;
          color: #0f172a;
        }
        .detail-card {
          padding: 0.95rem;
          border-radius: 0.95rem;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          display: grid;
          gap: 0.85rem;
        }
        .detail-card-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #0f172a;
        }
        .detail-card-wide {
          grid-column: 1 / -1;
        }
        .detail-stat-grid,
        .detail-meta-grid {
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        }
        .detail-meta-grid-compact {
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        }
        .detail-stat-card,
        .detail-gate-card,
        .candidate-detail-card {
          padding: 0.8rem;
          border-radius: 0.85rem;
          border: 1px solid #dbeafe;
          background: #ffffff;
          display: grid;
          gap: 0.35rem;
        }
        .detail-stat-card strong {
          font-size: 0.95rem;
          line-height: 1.4;
          color: #0f172a;
        }
        .route-stop {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.75rem;
          align-items: start;
        }
        .route-stop-chip {
          width: 1.8rem;
          height: 1.8rem;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 0.8rem;
          font-weight: 700;
        }
        .route-stop-pickup {
          background: #2563eb;
        }
        .route-stop-dropoff {
          background: #0f766e;
        }
        .detail-notes {
          padding-top: 0.35rem;
          border-top: 1px dashed #cbd5e1;
        }
        .detail-workflow-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        .detail-action-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .detail-gate-card-wide {
          grid-column: 1 / -1;
        }
        .detail-empty-hint {
          padding: 0.75rem 0.85rem;
          border-radius: 0.8rem;
          border: 1px dashed #cbd5e1;
          background: #ffffff;
          color: #475569;
          font-size: 0.84rem;
        }
        .detail-inline-summary {
          display: grid;
          gap: 0.25rem;
        }
        .detail-empty {
          padding: 1rem;
          border-radius: 0.95rem;
          border: 1px dashed #cbd5e1;
          background: #f8fafc;
          display: grid;
          gap: 0.35rem;
          color: #334155;
        }
        .results-note {
          margin-bottom: 0.75rem;
        }
        .data-table table {
          width: 100%;
          border-collapse: collapse;
        }
        .data-table th,
        .data-table td {
          padding: 0.75rem 0.5rem;
          border-bottom: 1px solid #e2e8f0;
          text-align: left;
          vertical-align: top;
        }
        .cell-title {
          font-weight: 600;
          color: #0f172a;
        }
        .dispatch-block,
        .candidate-panel,
        .actions,
        .action-row,
        .field-grid {
          display: grid;
          gap: 0.35rem;
        }
        .action-row,
        .field-grid {
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        }
        .badge-stack {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }
        .candidate-select {
          width: 100%;
          padding: 0.45rem;
          border-radius: 0.6rem;
          border: 1px solid #cbd5e1;
        }
        .candidate-location-note {
          padding: 0.45rem 0.55rem;
          border-radius: 0.7rem;
          font-size: 0.8rem;
        }
        .candidate-table-shell {
          overflow-x: auto;
          border: 1px solid #dbe3ef;
          border-radius: 0.9rem;
          background: #ffffff;
        }
        .candidate-table {
          width: 100%;
          border-collapse: collapse;
        }
        .candidate-table th,
        .candidate-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #e2e8f0;
          text-align: left;
          vertical-align: top;
        }
        .candidate-table th {
          font-size: 0.76rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          background: #f8fafc;
        }
        .candidate-table tbody tr:last-child td {
          border-bottom: 0;
        }
        .candidate-row-selected {
          background: #eff6ff;
        }
        .candidate-cell-stack {
          display: grid;
          gap: 0.25rem;
        }
        .candidate-location-live {
          background: #dcfce7;
          color: #166534;
        }
        .candidate-location-stale {
          background: #ffedd5;
          color: #9a3412;
        }
        .candidate-location-no-location {
          background: #e2e8f0;
          color: #334155;
        }
        .queue-badge {
          display: inline-block;
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .btn {
          padding: 0.5rem 0.75rem;
          border-radius: 0.65rem;
          border: 1px solid #cbd5e1;
          background: white;
          cursor: pointer;
        }
        .btn-primary {
          background: #0f172a;
          color: white;
          border-color: #0f172a;
        }
        .btn-warning {
          background: #fef3c7;
          border-color: #f59e0b;
          color: #92400e;
        }
        .action-sheet {
          padding: 0.85rem;
          border-radius: 0.85rem;
          border: 1px solid #dbeafe;
          background: #f8fbff;
        }
        .timeline-list {
          display: grid;
          gap: 0.75rem;
        }
        .timeline-item {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.75rem;
          align-items: start;
          padding: 0.85rem;
          border-radius: 0.9rem;
          border: 1px solid #dbeafe;
          background: #ffffff;
        }
        .timeline-item-warning {
          border-color: #fcd34d;
          background: #fffbeb;
        }
        .timeline-item-critical {
          border-color: #fecaca;
          background: #fef2f2;
        }
        .timeline-marker {
          width: 0.75rem;
          height: 0.75rem;
          margin-top: 0.25rem;
          border-radius: 999px;
          background: #2563eb;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
        }
        .timeline-item-warning .timeline-marker {
          background: #d97706;
          box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.12);
        }
        .timeline-item-critical .timeline-marker {
          background: #dc2626;
          box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.12);
        }
        .timeline-content,
        .timeline-row {
          display: grid;
          gap: 0.25rem;
        }
        .timeline-row {
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: start;
        }
        .timeline-row span {
          font-size: 0.78rem;
          color: #64748b;
        }
        .field-label {
          display: grid;
          gap: 0.35rem;
          font-size: 0.82rem;
          color: #334155;
        }
        .action-input {
          width: 100%;
          padding: 0.65rem 0.7rem;
          border-radius: 0.75rem;
          border: 1px solid #cbd5e1;
          background: white;
        }
        .detail-heading {
          font-weight: 600;
          color: #334155;
        }
        .detail-line {
          line-height: 1.4;
        }
        .queue-family-copy {
          margin-top: 0.4rem;
        }
        .exception-copy {
          margin-top: 0.4rem;
          font-size: 0.85rem;
        }
        .override-request-status {
          margin-top: 0.5rem;
          padding: 0.55rem 0.65rem;
          border-radius: 0.7rem;
          border: 1px solid #fcd34d;
          background: #fffbeb;
          display: grid;
          gap: 0.25rem;
        }
        .row-focused {
          background: #eff6ff;
        }
        .row-alert {
          background: #fef2f2;
        }
        .row-warning {
          background: #fffbeb;
        }
        @media (min-width: 960px) {
          .spatial-board-header,
          .spatial-board-footer,
          .spatial-map-shell {
            grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.8fr);
          }
          .detail-workspace-header {
            grid-template-columns: minmax(0, 1fr) auto;
          }
          .detail-workspace-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            align-items: start;
          }
          .spatial-board-header > :first-child,
          .spatial-board-footer > :first-child,
          .spatial-map {
            grid-column: 1;
          }
          .spatial-board-header > :last-child,
          .spatial-board-footer > :last-child,
          .spatial-legend {
            grid-column: 2;
          }
        }
        @media (max-width: 900px) {
          .queue-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .queue-summary {
            grid-template-columns: 1fr;
          }
          .spatial-map {
            min-height: 280px;
          }
          .data-table {
            overflow-x: auto;
          }
          .data-table table {
            min-width: 980px;
          }
        }
      `}</style>
    </div>
  );
}

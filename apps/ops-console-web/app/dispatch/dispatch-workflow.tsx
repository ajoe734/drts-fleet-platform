"use client";

import Link from "next/link";
import {
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
  OpsDispatchStreamEventEnvelope,
  OwnedOrderRecord,
} from "@drts/contracts";
import { createOpsDispatchEventSource, getOpsClient } from "@/lib/api-client";
import { formatMinorCurrency } from "@/lib/ops-analytics";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import {
  getCandidateLocationState,
  getCandidateLocationTone,
} from "./location-state";

interface DispatchWorkflowProps {
  orders: OwnedOrderRecord[];
  dispatchJobs: DispatchJobRecord[];
  focusOrderId?: string;
}

type QueueState =
  | "pending"
  | "reserved"
  | "exception"
  | "timeout"
  | "no_supply";
type FilterMode = "all" | "attention" | "queued";
type ActionMode =
  | "release"
  | "cancel"
  | "fare_override"
  | "redispatch_with_reason"
  | "resolve_no_supply";

type SpatialPointKind = "pickup" | "dropoff" | "candidate";

interface SpatialPoint {
  key: string;
  kind: SpatialPointKind;
  label: string;
  lat: number;
  lng: number;
  tone: QueueState;
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
}

const AUTO_LOAD_CANDIDATE_LIMIT = 6;

function getQueueState(
  order: OwnedOrderRecord,
  job?: DispatchJobRecord,
): QueueState {
  if (order.status === "exception_hold") return "exception";
  if (order.status === "dispatch_timeout") return "timeout";
  if (order.status === "no_supply" || order.status === "delayed_queue")
    return "no_supply";
  if (job?.status === "reserved") return "reserved";
  return "pending";
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
  };
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
  const reloadTimerRef = useRef<number | null>(null);
  const autoLoadedCandidateJobsRef = useRef<Set<string>>(new Set());

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
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(deferredSearch);
  });

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
      acc[state] += 1;
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
    const tone = getQueueState(order, job);

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

  return (
    <div className="dispatch-workflow">
      {error && (
        <div className="error-banner">
          <strong>{getOpsLabel(locale, "error")}:</strong> {error}
        </div>
      )}

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
                    <div key={order.orderId} className="spatial-order-card">
                      <div className="cell-title">{order.orderNo}</div>
                      <div className="cell-subcopy">
                        {t(getQueueStateKey(getQueueState(order, job)))}
                      </div>
                      <div className="cell-subcopy">
                        {hasCoordinates(order.pickup)
                          ? `${order.pickup.lat.toFixed(3)}, ${order.pickup.lng.toFixed(3)}`
                          : t("dispatch.workflow.map.missingPickupCoords")}
                      </div>
                    </div>
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

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>{t("dispatch.workflow.col.order")}</th>
              <th>{t("dispatch.workflow.col.product")}</th>
              <th>{t("dispatch.workflow.col.queue")}</th>
              <th>{t("dispatch.workflow.col.dispatch")}</th>
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
                const queueState = getQueueState(order, job);
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
                const actionDraft = actionDrafts[order.orderId];
                const exceptionHold = order.exceptionHold;
                const queueFamily = order.queueFamily;
                const queueEntryReason = order.queueEntryReason;
                const incidentHref = `/incidents?create=1&relatedOrderId=${encodeURIComponent(order.orderId)}&title=${encodeURIComponent(
                  `${order.orderNo} exception hold escalation`,
                )}&description=${encodeURIComponent(
                  exceptionHold
                    ? `Order ${order.orderNo} entered exception hold for ${exceptionHold.reasonCode}. Review dispatch trace, rider communication, and downstream compliance duties before release.`
                    : `Review dispatch exception handling for order ${order.orderNo}.`,
                )}&category=operational&severity=high`;

                return (
                  <tr
                    key={order.orderId}
                    className={
                      isFocused
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
                        className={`queue-badge ${getQueueStateColor(queueState)}`}
                        title={t(getQueueStateKey(queueState))}
                      >
                        {t(getQueueStateKey(queueState))}
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
                        {job && (
                          <button
                            className="btn btn-primary"
                            disabled={
                              !selectedCandidate[job.dispatchJobId] ||
                              loading === job.dispatchJobId
                            }
                            type="button"
                            onClick={() => handleAssign(job.dispatchJobId)}
                          >
                            {t("dispatch.workflow.assign")}
                          </button>
                        )}
                        {job && job.status === "assigned" && (
                          <button
                            className="btn"
                            disabled={
                              !selectedCandidate[job.dispatchJobId] ||
                              loading === job.dispatchJobId
                            }
                            type="button"
                            onClick={() => handleReassign(job.dispatchJobId)}
                          >
                            {t("dispatch.workflow.reassign")}
                          </button>
                        )}
                        {(isRedispatchRequired || isDispatchTimeout) && (
                          <button
                            className="btn btn-warning"
                            disabled={loading === order.orderId}
                            type="button"
                            onClick={() => handleRedispatch(order.orderId)}
                          >
                            {t("dispatch.workflow.redispatch")}
                          </button>
                        )}
                        {(isRedispatchRequired || isDispatchTimeout) && (
                          <button
                            className="btn"
                            disabled={loading === order.orderId}
                            type="button"
                            onClick={() =>
                              openActionDraft(order, "redispatch_with_reason")
                            }
                          >
                            {t("dispatch.workflow.redispatchWithReason")}
                          </button>
                        )}
                        {isNoSupply && (
                          <button
                            className="btn btn-primary"
                            disabled={loading === order.orderId}
                            type="button"
                            onClick={() =>
                              handleResolveNoSupply(
                                order.orderId,
                                "retry_dispatch",
                              )
                            }
                          >
                            {t("dispatch.workflow.retryDispatch")}
                          </button>
                        )}
                        {isNoSupply && (
                          <button
                            className="btn"
                            disabled={loading === order.orderId}
                            type="button"
                            onClick={() =>
                              openActionDraft(order, "resolve_no_supply")
                            }
                          >
                            {t("dispatch.workflow.resolveNoSupply")}
                          </button>
                        )}
                        {isExceptionHold && (
                          <button
                            className="btn"
                            disabled={loading === order.orderId}
                            type="button"
                            onClick={() => openActionDraft(order, "release")}
                          >
                            {t("dispatch.workflow.release")}
                          </button>
                        )}
                        {isExceptionHold && (
                          <button
                            className="btn"
                            disabled={loading === order.orderId}
                            type="button"
                            onClick={() => openActionDraft(order, "cancel")}
                          >
                            {t("dispatch.workflow.cancelOrder")}
                          </button>
                        )}
                        {order.fixedPrice && (
                          <button
                            className="btn"
                            disabled={loading === order.orderId}
                            type="button"
                            onClick={() =>
                              openActionDraft(order, "fare_override")
                            }
                          >
                            {t("dispatch.workflow.overrideFare")}
                          </button>
                        )}
                        {isExceptionHold && (
                          <Link className="btn" href={incidentHref}>
                            {t("dispatch.workflow.escalateIncident")}
                          </Link>
                        )}
                        {actionDraft && (
                          <form
                            className="action-sheet"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void submitActionDraft(order, actionDraft).catch(
                                (submitError) => {
                                  setError(
                                    submitError instanceof Error
                                      ? submitError.message
                                      : t("dispatch.workflow.actionFailed"),
                                  );
                                },
                              );
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
                                    <option value="">
                                      {t("dispatch.workflow.noEscalation")}
                                    </option>
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
                                    {t(
                                      "dispatch.workflow.cancelWithNotification",
                                    )}
                                  </option>
                                </select>
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
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={9}>{t("dispatch.workflow.noOrders")}</td>
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
        .action-sheet {
          display: grid;
          gap: 0.75rem;
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

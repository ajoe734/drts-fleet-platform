"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  DispatchCandidate,
  DispatchJobRecord,
  OpsDispatchStreamEventEnvelope,
  OwnedOrderRecord,
} from "@drts/contracts";
import { createOpsDispatchEventSource, getOpsClient } from "@/lib/api-client";
import { formatMinorCurrency } from "@/lib/ops-analytics";
import { useTranslation } from "@/lib/i18n";

interface DispatchWorkflowProps {
  orders: OwnedOrderRecord[];
  dispatchJobs: DispatchJobRecord[];
  focusOrderId?: string;
}

type QueueState = "pending" | "reserved" | "exception";
type FilterMode = "all" | "attention" | "queued";

function getQueueState(
  order: OwnedOrderRecord,
  job?: DispatchJobRecord,
): QueueState {
  if (order.status === "exception_hold") return "exception";
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
  }
}

function localizedQueueValue(locale: string, value: string | undefined) {
  if (locale !== "zh" || !value) return value ?? "—";
  switch (value) {
    case "standard_taxi":
      return "一般計程車";
    case "business_dispatch":
      return "商務派車";
    case "credit_card_airport_transfer":
      return "信用卡機場接送";
    case "broadcast":
      return "廣播派單";
    case "reserved":
      return "預約保留";
    case "manual":
      return "人工派遣";
    case "automatic":
      return "自動派遣";
    case "hybrid":
      return "混合模式";
    case "assigned":
      return "已指派";
    case "pending":
      return "待處理";
    case "queued":
      return "排隊中";
    case "redispatch_required":
      return "需重派";
    case "exception_hold":
      return "異常暫停";
    case "enterprise_dispatch":
      return "企業派車";
    default:
      return value.replace(/_/g, " ");
  }
}

function formatEta(
  locale: string,
  etaMinutes: number | null | undefined,
  updatedAt?: string,
): { display: string; tooltip: string } {
  if (etaMinutes === null || etaMinutes === undefined) {
    return {
      display: locale === "zh" ? "無資料" : "N/A",
      tooltip: locale === "zh" ? "尚無 ETA 資料" : "ETA not available",
    };
  }
  const updated = updatedAt
    ? new Date(updatedAt).toLocaleTimeString()
    : locale === "zh"
      ? "未知"
      : "unknown";
  return {
    display: locale === "zh" ? `${etaMinutes} 分鐘` : `${etaMinutes} min`,
    tooltip:
      locale === "zh" ? `最後更新：${updated}` : `Last updated: ${updated}`,
  };
}

export function DispatchWorkflow({
  orders,
  dispatchJobs,
  focusOrderId = "",
}: DispatchWorkflowProps) {
  const { locale, t } = useTranslation();
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
  const reloadTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setLiveOrders(orders);
  }, [orders]);

  useEffect(() => {
    setLiveDispatchJobs(dispatchJobs);
  }, [dispatchJobs]);

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
            case "order_created": {
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
      "dispatch_job_updated",
      handleEnvelope as EventListener,
    );
    eventSource.addEventListener(
      "driver_location_updated",
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

  const orderJobMap = liveDispatchJobs.reduce(
    (acc, job) => {
      acc[job.orderId] = job;
      return acc;
    },
    {} as Record<string, DispatchJobRecord>,
  );

  const filteredOrders = liveOrders.filter((order) => {
    const job = orderJobMap[order.orderId];
    if (filterMode === "attention") {
      const needsAttention =
        order.status === "redispatch_required" ||
        order.status === "exception_hold" ||
        job?.status === "failed" ||
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
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("dispatch.workflow.actionFailed"),
      );
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

    await runAction(jobId, async () => {
      await client.redispatchOrder(job.orderId);
    });
  };

  const handleRedispatch = async (orderId: string) => {
    await runAction(orderId, async () => {
      await client.redispatchOrder(orderId);
    });
  };

  const queueCounts = filteredOrders.reduce(
    (acc, order) => {
      const state = getQueueState(order, orderJobMap[order.orderId]);
      acc[state] += 1;
      return acc;
    },
    { pending: 0, reserved: 0, exception: 0 } as Record<QueueState, number>,
  );

  return (
    <div className="dispatch-workflow">
      {error && (
        <div className="error-banner">
          <strong>{t("common.error")}:</strong> {error}
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
        {(["pending", "reserved", "exception"] as QueueState[]).map((state) => (
          <div
            key={state}
            className={`queue-card ${getQueueStateColor(state)}`}
          >
            <strong>{queueCounts[state]}</strong>
            <span>{t(getQueueStateKey(state))}</span>
          </div>
        ))}
      </div>

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
                const etaInfo = job
                  ? formatEta(locale, job.latestEtaMinutes, job.updatedAt)
                  : { display: "-", tooltip: t("dispatch.workflow.noJobEta") };
                const isFocused = focusOrderId === order.orderId;

                return (
                  <tr
                    key={order.orderId}
                    className={
                      isFocused
                        ? "row-focused"
                        : isRedispatchRequired
                          ? "row-alert"
                          : isExceptionHold
                            ? "row-warning"
                            : ""
                    }
                  >
                    <td>
                      <div className="cell-title">{order.orderNo}</div>
                      <div className="cell-subcopy">{order.orderId}</div>
                      <div className="cell-subcopy">
                        source: {order.orderSource}
                      </div>
                    </td>
                    <td>
                      <div className="cell-title">
                        {localizedQueueValue(locale, order.serviceBucket)}
                      </div>
                      <div className="cell-subcopy">
                        {localizedQueueValue(locale, order.dispatchSemantics)}
                        {order.businessDispatchSubtype
                          ? ` · ${localizedQueueValue(locale, order.businessDispatchSubtype)}`
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
                      <div className="cell-subcopy">
                        {localizedQueueValue(locale, order.status)}
                      </div>
                    </td>
                    <td>
                      {job ? (
                        <div className="dispatch-block">
                          <div>ID: {job.dispatchJobId.slice(0, 8)}...</div>
                          <div>
                            {t("common.status")}:{" "}
                            {localizedQueueValue(locale, job.status)}
                          </div>
                          <div className="cell-subcopy">
                            {localizedQueueValue(locale, job.mode)}
                          </div>
                        </div>
                      ) : (
                        <span className="cell-subcopy">
                          {t("dispatch.workflow.noJob")}
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
                                    · {candidate.etaMinutes}m
                                  </option>
                                ))}
                              </select>
                              <div className="cell-subcopy">
                                {t("dispatch.workflow.candidateCount", {
                                  count: jobCandidates.length,
                                })}
                              </div>
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
                            disabled={loading === job.dispatchJobId}
                            type="button"
                            onClick={() => handleReassign(job.dispatchJobId)}
                          >
                            {t("dispatch.workflow.reassign")}
                          </button>
                        )}
                        {(isRedispatchRequired || isExceptionHold) && (
                          <button
                            className="btn btn-warning"
                            disabled={loading === order.orderId}
                            type="button"
                            onClick={() => handleRedispatch(order.orderId)}
                          >
                            {t("dispatch.workflow.redispatch")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8}>{t("dispatch.workflow.noOrders")}</td>
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
        .actions {
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
          grid-template-columns: repeat(3, minmax(0, 1fr));
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
        .actions {
          display: grid;
          gap: 0.35rem;
        }
        .candidate-select {
          width: 100%;
          padding: 0.45rem;
          border-radius: 0.6rem;
          border: 1px solid #cbd5e1;
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
        .row-focused {
          background: #eff6ff;
        }
        .row-alert {
          background: #fef2f2;
        }
        .row-warning {
          background: #fffbeb;
        }
      `}</style>
    </div>
  );
}

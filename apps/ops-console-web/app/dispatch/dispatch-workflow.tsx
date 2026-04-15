"use client";

import { useDeferredValue, useState } from "react";
import type {
  DispatchCandidate,
  DispatchJobRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import { useRouter } from "next/navigation";
import { getOpsClient } from "@/lib/api-client";
import { formatMinorCurrency } from "@/lib/ops-analytics";

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

function getQueueStateLabel(state: QueueState): string {
  switch (state) {
    case "pending":
      return "Pending";
    case "reserved":
      return "Reserved";
    case "exception":
      return "Exception Hold";
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

function formatEta(
  etaMinutes: number | null | undefined,
  updatedAt?: string,
): { display: string; tooltip: string } {
  if (etaMinutes === null || etaMinutes === undefined) {
    return { display: "N/A", tooltip: "ETA not available" };
  }
  const updated = updatedAt
    ? new Date(updatedAt).toLocaleTimeString()
    : "unknown";
  return {
    display: `${etaMinutes} min`,
    tooltip: `Last updated: ${updated}`,
  };
}

export function DispatchWorkflow({
  orders,
  dispatchJobs,
  focusOrderId = "",
}: DispatchWorkflowProps) {
  const router = useRouter();
  const client = getOpsClient();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>(
    focusOrderId ? "attention" : "all",
  );
  const [searchValue, setSearchValue] = useState(focusOrderId);
  const deferredSearch = useDeferredValue(searchValue.trim().toLowerCase());
  const [candidates, setCandidates] = useState<
    Record<string, DispatchCandidate[]>
  >({});
  const [selectedCandidate, setSelectedCandidate] = useState<
    Record<string, string>
  >({});

  const orderJobMap = dispatchJobs.reduce(
    (acc, job) => {
      acc[job.orderId] = job;
      return acc;
    },
    {} as Record<string, DispatchJobRecord>,
  );

  const filteredOrders = orders.filter((order) => {
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
      setError(e instanceof Error ? e.message : "Failed to fetch candidates");
    } finally {
      setLoading(null);
    }
  };

  const runAction = async (target: string, action: () => Promise<void>) => {
    try {
      setLoading(target);
      setError(null);
      await action();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dispatch action failed");
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
    const job = dispatchJobs.find((item) => item.dispatchJobId === jobId);
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
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Search by order, dispatch job, product, or status"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
        />
        <div className="filter-chip-group">
          {(
            [
              ["all", "All"],
              ["attention", "Needs attention"],
              ["queued", "Queued only"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={value === filterMode ? "chip chip-active" : "chip"}
              type="button"
              onClick={() => setFilterMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="queue-summary">
        {(["pending", "reserved", "exception"] as QueueState[]).map((state) => (
          <div
            key={state}
            className={`queue-card ${getQueueStateColor(state)}`}
          >
            <strong>{queueCounts[state]}</strong>
            <span>{getQueueStateLabel(state)}</span>
          </div>
        ))}
      </div>

      <div className="results-note">
        Showing {filteredOrders.length} order(s) from {orders.length} total.
      </div>

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Product</th>
              <th>Queue</th>
              <th>Dispatch</th>
              <th>Revenue</th>
              <th>ETA</th>
              <th>Candidates</th>
              <th>Actions</th>
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
                  ? formatEta(job.latestEtaMinutes, job.updatedAt)
                  : { display: "-", tooltip: "No job" };
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
                        {order.serviceBucket.replace(/_/g, " ")}
                      </div>
                      <div className="cell-subcopy">
                        {order.dispatchSemantics}
                        {order.businessDispatchSubtype
                          ? ` · ${order.businessDispatchSubtype.replace(/_/g, " ")}`
                          : ""}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`queue-badge ${getQueueStateColor(queueState)}`}
                        title={getQueueStateLabel(queueState)}
                      >
                        {getQueueStateLabel(queueState)}
                      </span>
                      <div className="cell-subcopy">{order.status}</div>
                    </td>
                    <td>
                      {job ? (
                        <div className="dispatch-block">
                          <div>ID: {job.dispatchJobId.slice(0, 8)}...</div>
                          <div>Status: {job.status}</div>
                          <div className="cell-subcopy">{job.mode}</div>
                        </div>
                      ) : (
                        <span className="cell-subcopy">No dispatch job</span>
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
                          ? "Fixed-price booking"
                          : "Metered / TBD"}
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
                                <option value="">Select candidate</option>
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
                                {jobCandidates.length} candidate(s)
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
                                ? "Loading..."
                                : "View candidates"}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="cell-subcopy">
                          Awaiting dispatch job
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
                            Assign
                          </button>
                        )}
                        {job && job.status === "assigned" && (
                          <button
                            className="btn"
                            disabled={loading === job.dispatchJobId}
                            type="button"
                            onClick={() => handleReassign(job.dispatchJobId)}
                          >
                            Reassign
                          </button>
                        )}
                        {(isRedispatchRequired || isExceptionHold) && (
                          <button
                            className="btn btn-warning"
                            disabled={loading === order.orderId}
                            type="button"
                            onClick={() => handleRedispatch(order.orderId)}
                          >
                            Redispatch
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8}>
                  No orders match the current dispatch search and filter mode.
                </td>
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

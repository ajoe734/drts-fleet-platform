"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  OwnedOrderRecord,
  DispatchJobRecord,
  DispatchCandidate,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";

interface DispatchWorkflowProps {
  orders: OwnedOrderRecord[];
  dispatchJobs: DispatchJobRecord[];
}

type QueueState = "pending" | "reserved" | "exception";

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
      return "bg-red-100 text-red-800";
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
}: DispatchWorkflowProps) {
  const router = useRouter();
  const client = getOpsClient();
  const [loading, setLoading] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<
    Record<string, DispatchCandidate[]>
  >({});
  const [selectedCandidate, setSelectedCandidate] = useState<
    Record<string, string>
  >({});

  const fetchCandidates = async (jobId: string) => {
    try {
      setLoading(jobId);
      const items = await client.listDispatchCandidates(jobId);
      setCandidates((prev) => ({ ...prev, [jobId]: items }));
    } catch (e) {
      console.error("Failed to fetch candidates", e);
    } finally {
      setLoading(null);
    }
  };

  const handleAssign = async (jobId: string) => {
    const candidateKey = selectedCandidate[jobId];
    if (!candidateKey) return;

    const parts = candidateKey.split("|");
    const vehicleId = parts[0]!;
    const driverId = parts[1]!;

    try {
      setLoading(jobId);
      await client.assignDispatch({
        dispatchJobId: jobId,
        vehicleId,
        driverId,
      });
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Assignment failed");
    } finally {
      setLoading(null);
    }
  };

  const handleReassign = async (jobId: string) => {
    const job = dispatchJobs.find((j) => j.dispatchJobId === jobId);
    if (!job) return;

    try {
      setLoading(jobId);
      await client.redispatchOrder(job.orderId);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Reassign failed");
    } finally {
      setLoading(null);
    }
  };

  const handleRelease = async (orderId: string) => {
    if (!confirm(`Release order ${orderId} from queue?`)) return;
    try {
      setLoading(orderId);
      await client.redispatchOrder(orderId);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Release failed");
    } finally {
      setLoading(null);
    }
  };

  const handleRedispatch = async (orderId: string) => {
    try {
      setLoading(orderId);
      await client.redispatchOrder(orderId);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Redispatch failed");
    } finally {
      setLoading(null);
    }
  };

  // Map orders to their dispatch jobs
  const orderJobMap = dispatchJobs.reduce(
    (acc, job) => {
      acc[job.orderId] = job;
      return acc;
    },
    {} as Record<string, DispatchJobRecord>,
  );

  // Queue summary counts
  const queueCounts = orders.reduce(
    (acc, order) => {
      const job = orderJobMap[order.orderId];
      const state = getQueueState(order, job);
      acc[state]++;
      return acc;
    },
    { pending: 0, reserved: 0, exception: 0 } as Record<QueueState, number>,
  );

  return (
    <div className="dispatch-workflow">
      {/* Queue Summary Panel */}
      <div className="queue-summary mb-6 grid grid-cols-3 gap-4">
        {(["pending", "reserved", "exception"] as QueueState[]).map((state) => (
          <div
            key={state}
            className={`queue-card p-4 rounded-lg ${getQueueStateColor(state)}`}
          >
            <div className="text-2xl font-bold">{queueCounts[state]}</div>
            <div className="text-sm">{getQueueStateLabel(state)}</div>
          </div>
        ))}
      </div>

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Order No</th>
              <th>Queue State</th>
              <th>Order Status</th>
              <th>Hold Status</th>
              <th>Dispatch Job</th>
              <th>ETA</th>
              <th>Candidate Selection</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
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

              return (
                <tr
                  key={order.orderId}
                  className={
                    isRedispatchRequired
                      ? "bg-red-50"
                      : isExceptionHold
                        ? "bg-yellow-50"
                        : ""
                  }
                >
                  <td>
                    <div className="font-bold">{order.orderNo}</div>
                    <div className="text-xs text-gray-500">
                      {order.serviceBucket}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`queue-badge px-2 py-1 rounded text-xs ${getQueueStateColor(queueState)}`}
                      title={getQueueStateLabel(queueState)}
                    >
                      {getQueueStateLabel(queueState)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${order.status}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>
                    {order.reservationHoldStatus !== "none" && (
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                        {order.reservationHoldStatus}
                      </span>
                    )}
                  </td>
                  <td>
                    {job ? (
                      <div className="text-xs">
                        <div>ID: {job.dispatchJobId.slice(0, 8)}...</div>
                        <div>Status: {job.status}</div>
                        <div className="text-gray-400">{job.mode}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400">No Job</span>
                    )}
                  </td>
                  <td>
                    <span className="font-mono" title={etaInfo.tooltip}>
                      {etaInfo.display}
                    </span>
                  </td>
                  <td>
                    {job && (
                      <div className="flex flex-col gap-2">
                        {jobCandidates.length > 0 ? (
                          <>
                            <select
                              className="text-sm p-1 border rounded"
                              value={selectedCandidate[job.dispatchJobId] || ""}
                              onChange={(e) =>
                                setSelectedCandidate((prev) => ({
                                  ...prev,
                                  [job.dispatchJobId]: e.target.value,
                                }))
                              }
                            >
                              <option value="">Select Candidate</option>
                              {jobCandidates.map((c) => (
                                <option
                                  key={`${c.vehicleId}|${c.driverId}`}
                                  value={`${c.vehicleId}|${c.driverId}`}
                                >
                                  {c.vehicleId} ({c.driverId}) - {c.etaMinutes}m
                                </option>
                              ))}
                            </select>
                            <div className="text-xs text-gray-500">
                              {jobCandidates.length} candidate(s) available
                            </div>
                          </>
                        ) : (
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => fetchCandidates(job.dispatchJobId)}
                            disabled={loading === job.dispatchJobId}
                          >
                            {loading === job.dispatchJobId
                              ? "Loading..."
                              : "View Candidates"}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-2">
                        {job && (
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={
                              !selectedCandidate[job.dispatchJobId] ||
                              loading === job.dispatchJobId
                            }
                            onClick={() => handleAssign(job.dispatchJobId)}
                          >
                            Assign
                          </button>
                        )}
                        {job && job.status === "assigned" && (
                          <button
                            className="btn btn-sm btn-secondary"
                            disabled={loading === job.dispatchJobId}
                            onClick={() => handleReassign(job.dispatchJobId)}
                          >
                            Reassign
                          </button>
                        )}
                      </div>
                      {(isRedispatchRequired || isExceptionHold) && (
                        <div className="flex gap-2">
                          <button
                            className="btn btn-sm btn-warning"
                            disabled={loading === order.orderId}
                            onClick={() => handleRedispatch(order.orderId)}
                          >
                            Redispatch
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={loading === order.orderId}
                            onClick={() => handleRelease(order.orderId)}
                          >
                            Release
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .dispatch-workflow {
          width: 100%;
        }
        .queue-summary {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
        }
        .queue-card {
          text-align: center;
          border: 1px solid currentColor;
        }
        .data-table table {
          width: 100%;
          border-collapse: collapse;
        }
        .data-table th,
        .data-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #eee;
          text-align: left;
        }
        .badge {
          font-size: 0.75rem;
          padding: 0.25rem 0.5rem;
          border-radius: 9999px;
        }
        .badge-ready_for_dispatch {
          background: #dcfce7;
          color: #166534;
        }
        .badge-assigned {
          background: #e0f2fe;
          color: #075985;
        }
        .badge-redispatch_required {
          background: #fee2e2;
          color: #991b1b;
        }
        .badge-exception_hold {
          background: #fef9c3;
          color: #854d0e;
        }
        .queue-badge {
          display: inline-block;
          font-weight: 500;
        }
        .btn {
          padding: 0.5rem 1rem;
          border-radius: 0.25rem;
          font-size: 0.875rem;
          cursor: pointer;
          border: 1px solid #ccc;
        }
        .btn-sm {
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
        }
        .btn-primary {
          background: #2563eb;
          color: white;
          border-color: #2563eb;
        }
        .btn-primary:disabled {
          background: #93c5fd;
          border-color: #93c5fd;
          cursor: not-allowed;
        }
        .btn-secondary {
          background: #6b7280;
          color: white;
          border-color: #6b7280;
        }
        .btn-secondary:disabled {
          background: #d1d5db;
          border-color: #d1d5db;
          cursor: not-allowed;
        }
        .btn-warning {
          background: #d97706;
          color: white;
          border-color: #d97706;
        }
        .btn-danger {
          background: #dc2626;
          color: white;
          border-color: #dc2626;
        }
        .btn-outline {
          background: transparent;
        }
      `}</style>
    </div>
  );
}

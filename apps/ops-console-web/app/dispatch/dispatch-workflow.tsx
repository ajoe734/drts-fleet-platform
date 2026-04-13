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

  return (
    <div className="dispatch-workflow">
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Order No</th>
              <th>Status</th>
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
              const jobCandidates = job
                ? candidates[job.dispatchJobId] || []
                : [];
              const isRedispatchRequired =
                order.status === "redispatch_required";
              const isExceptionHold = order.status === "exception_hold";

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
                        ID: {job.dispatchJobId.slice(0, 8)}...
                        <br />
                        Status: {job.status}
                      </div>
                    ) : (
                      <span className="text-gray-400">No Job</span>
                    )}
                  </td>
                  <td>
                    {job?.latestEtaMinutes !== null &&
                    job?.latestEtaMinutes !== undefined ? (
                      <span className="font-mono">
                        {job.latestEtaMinutes} min
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td>
                    {job && (
                      <div className="flex flex-col gap-2">
                        {jobCandidates.length > 0 ? (
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
                      {(isRedispatchRequired || isExceptionHold) && (
                        <button
                          className="btn btn-sm btn-warning"
                          disabled={loading === order.orderId}
                          onClick={() => handleRedispatch(order.orderId)}
                        >
                          Redispatch
                        </button>
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
        .btn-warning {
          background: #d97706;
          color: white;
          border-color: #d97706;
        }
        .btn-outline {
          background: transparent;
        }
      `}</style>
    </div>
  );
}

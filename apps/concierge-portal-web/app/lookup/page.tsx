"use client";

import { useEffect, useState } from "react";
import type {
  CallSessionRecord,
  DispatchTraceLogRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import { SessionGuard } from "@/components/session-guard";
import { createConciergeClient } from "@/lib/api-client";
import { useConciergePortal } from "@/lib/portal-state";

type LookupRecord = {
  order: OwnedOrderRecord;
  trace: DispatchTraceLogRecord[];
  callSession: CallSessionRecord | null;
};

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function LookupCard({ record }: { record: LookupRecord }) {
  return (
    <article className="detail-card">
      <header>
        <div>
          <span className="section-kicker">Order lookup</span>
          <h3>{record.order.orderNo}</h3>
        </div>
        <span
          className={`chip${
            record.order.status === "recording_pending"
              ? " chip-warning"
              : " chip-success"
          }`}
        >
          {record.order.status}
        </span>
      </header>
      <div className="kv-grid">
        <div className="kv-item">
          <strong>Passenger</strong>
          <p>{record.order.passenger.name}</p>
        </div>
        <div className="kv-item">
          <strong>Pickup</strong>
          <p>{record.order.pickup.address}</p>
        </div>
        <div className="kv-item">
          <strong>Drop-off</strong>
          <p>{record.order.dropoff.address}</p>
        </div>
        <div className="kv-item">
          <strong>Recording state</strong>
          <p>
            {record.callSession?.recordingState ?? "No linked call session"}
          </p>
        </div>
      </div>
      <ul className="trace-list">
        {record.trace.map((entry) => (
          <li key={entry.traceId}>
            <strong>{entry.eventType}</strong>
            <p>{entry.message}</p>
            <p>{formatDateTime(entry.createdAt)}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function LookupPage() {
  const { session } = useConciergePortal();
  const [records, setRecords] = useState<LookupRecord[]>([]);
  const [manualOrderId, setManualOrderId] = useState("");
  const [manualRecord, setManualRecord] = useState<LookupRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || session.recentOrderIds.length === 0) {
      setRecords([]);
      return;
    }

    let cancelled = false;
    const client = createConciergeClient(session.operatorId, session.mode);
    setLoading(true);

    void (async () => {
      try {
        const nextRecords = await Promise.all(
          session.recentOrderIds.map(async (orderId) => {
            const order = await client.getOrder(orderId);
            const trace = await client.getOrderDispatchTrace(orderId);
            const callSession = order.callId
              ? await client.getCallSession(order.callId).catch(() => null)
              : null;
            return {
              order,
              trace,
              callSession,
            } satisfies LookupRecord;
          }),
        );

        if (!cancelled) {
          setRecords(nextRecords);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Failed to load recent assisted-entry orders.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <div className="page-shell">
      <SessionGuard requireDesk>
        <section className="hero-card">
          <span className="section-kicker">Lookup</span>
          <h1>Read back order state, dispatch trace, and recording posture.</h1>
          <p>
            The portal keeps lookup route-level and explicit. Recent assisted
            orders are stored locally in the browser session, while the actual
            order and call-session truth comes from existing backend APIs.
          </p>
        </section>

        {error ? <section className="error-copy">{error}</section> : null}

        <section className="panel-card">
          <span className="section-kicker">Manual lookup</span>
          <h2>
            Fetch a specific order id if it is not in the recent desk list.
          </h2>
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!session || manualOrderId.trim().length === 0) {
                return;
              }

              setLoading(true);
              setError(null);
              try {
                const client = createConciergeClient(
                  session.operatorId,
                  session.mode,
                );
                const order = await client.getOrder(manualOrderId.trim());
                const trace = await client.getOrderDispatchTrace(
                  manualOrderId.trim(),
                );
                const callSession = order.callId
                  ? await client.getCallSession(order.callId).catch(() => null)
                  : null;

                setManualRecord({
                  order,
                  trace,
                  callSession,
                });
              } catch (nextError) {
                setError(
                  nextError instanceof Error
                    ? nextError.message
                    : "Manual order lookup failed.",
                );
              } finally {
                setLoading(false);
              }
            }}
          >
            <div className="field-stack">
              <label htmlFor="manual-order-id">Order id</label>
              <input
                id="manual-order-id"
                onChange={(event) => setManualOrderId(event.target.value)}
                placeholder="Paste an order id"
                value={manualOrderId}
              />
            </div>
            <div className="inline-actions">
              <button
                className="primary-button"
                disabled={loading}
                type="submit"
              >
                Lookup order
              </button>
            </div>
          </form>
        </section>

        {manualRecord ? <LookupCard record={manualRecord} /> : null}

        <section className="panel-card">
          <span className="section-kicker">Recent assisted-entry orders</span>
          <h2>Desk-local recall</h2>
          {loading ? <p>Loading recent order state.</p> : null}
          {!loading && records.length === 0 ? (
            <p className="empty-state">
              No recent assisted-entry orders are stored in this browser session
              yet. Create a booking first or use manual lookup.
            </p>
          ) : null}
          <div className="list-stack">
            {records.map((record) => (
              <LookupCard key={record.order.orderId} record={record} />
            ))}
          </div>
        </section>
      </SessionGuard>
    </div>
  );
}

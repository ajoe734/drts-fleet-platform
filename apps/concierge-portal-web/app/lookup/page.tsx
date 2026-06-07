"use client";

import { useEffect, useState } from "react";
import type {
  CallSessionRecord,
  DispatchTraceLogRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import { SessionGuard } from "@/components/session-guard";
import { createConciergeClient } from "@/lib/api-client";
import {
  formatOrderStatus,
  formatRecordingState,
  formatTraceEventLabel,
  formatTraceMessage,
} from "@/lib/display-labels";
import { useConciergePortal } from "@/lib/portal-state";

type LookupRecord = {
  order: OwnedOrderRecord;
  trace: DispatchTraceLogRecord[];
  callSession: CallSessionRecord | null;
};

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-TW") : "未設定";
}

function LookupCard({ record }: { record: LookupRecord }) {
  return (
    <article className="detail-card">
      <header>
        <div>
          <span className="section-kicker">訂單查詢</span>
          <h3>{record.order.orderNo}</h3>
        </div>
        <span
          className={`chip${
            record.order.status === "recording_pending"
              ? " chip-warning"
              : " chip-success"
          }`}
        >
          {formatOrderStatus(record.order.status)}
        </span>
      </header>
      <div className="kv-grid">
        <div className="kv-item">
          <strong>乘客</strong>
          <p>{record.order.passenger.name}</p>
        </div>
        <div className="kv-item">
          <strong>上車地點</strong>
          <p>{record.order.pickup.address}</p>
        </div>
        <div className="kv-item">
          <strong>下車地點</strong>
          <p>{record.order.dropoff.address}</p>
        </div>
        <div className="kv-item">
          <strong>錄音狀態</strong>
          <p>
            {record.callSession
              ? formatRecordingState(record.callSession.recordingState)
              : "尚未連結通話"}
          </p>
        </div>
      </div>
      <ul className="trace-list">
        {record.trace.map((entry) => (
          <li key={entry.traceId}>
            <strong>{formatTraceEventLabel(entry.eventType)}</strong>
            <p>{formatTraceMessage(entry.eventType, entry.message)}</p>
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
      } catch {
        if (!cancelled) {
          setError("載入近期代訂訂單失敗，請稍後再試。");
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
          <span className="section-kicker">查詢</span>
          <h1>查看訂單狀態、派遣軌跡與錄音狀態。</h1>
          <p>
            近期代訂訂單會保存在本機工作階段中；實際訂單與通話狀態仍以後端 API
            回傳為準。
          </p>
        </section>

        {error ? <section className="error-copy">{error}</section> : null}

        <section className="panel-card">
          <span className="section-kicker">手動查詢</span>
          <h2>若近期清單沒有該訂單，可輸入訂單編號查詢。</h2>
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
              } catch {
                setError("手動查詢訂單失敗，請確認編號後再試。");
              } finally {
                setLoading(false);
              }
            }}
          >
            <div className="field-stack">
              <label htmlFor="manual-order-id">訂單編號</label>
              <input
                id="manual-order-id"
                onChange={(event) => setManualOrderId(event.target.value)}
                placeholder="貼上訂單編號"
                value={manualOrderId}
              />
            </div>
            <div className="inline-actions">
              <button
                className="primary-button"
                disabled={loading}
                type="submit"
              >
                查詢訂單
              </button>
            </div>
          </form>
        </section>

        {manualRecord ? <LookupCard record={manualRecord} /> : null}

        <section className="panel-card">
          <span className="section-kicker">近期代訂訂單</span>
          <h2>本機櫃台紀錄</h2>
          {loading ? <p>正在載入近期訂單狀態。</p> : null}
          {!loading && records.length === 0 ? (
            <p className="empty-state">
              此瀏覽器工作階段尚未儲存近期代訂訂單。請先建立代訂，或使用手動查詢。
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

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
  formatDateTime,
  formatOrderStatus,
  formatRecordingState,
  formatTraceEventType,
} from "@/lib/formatters";
import { useTranslation } from "@/lib/i18n";
import { useConciergePortal } from "@/lib/portal-state";

type LookupRecord = {
  order: OwnedOrderRecord;
  trace: DispatchTraceLogRecord[];
  callSession: CallSessionRecord | null;
};

function LookupCard({
  record,
  t,
  locale,
}: {
  record: LookupRecord;
  t: ReturnType<typeof useTranslation>["t"];
  locale: ReturnType<typeof useTranslation>["locale"];
}) {
  return (
    <article className="detail-card">
      <header>
        <div>
          <span className="section-kicker">{t("lookup.card.eyebrow")}</span>
          <h3>{record.order.orderNo}</h3>
        </div>
        <span
          className={`chip${
            record.order.status === "recording_pending"
              ? " chip-warning"
              : " chip-success"
          }`}
        >
          {formatOrderStatus(record.order.status, t)}
        </span>
      </header>
      <div className="kv-grid">
        <div className="kv-item">
          <strong>{t("lookup.kv.passenger")}</strong>
          <p>{record.order.passenger.name}</p>
        </div>
        <div className="kv-item">
          <strong>{t("lookup.kv.pickup")}</strong>
          <p>{record.order.pickup.address}</p>
        </div>
        <div className="kv-item">
          <strong>{t("lookup.kv.dropoff")}</strong>
          <p>{record.order.dropoff.address}</p>
        </div>
        <div className="kv-item">
          <strong>{t("lookup.kv.recording")}</strong>
          <p>
            {record.callSession
              ? formatRecordingState(record.callSession.recordingState, t)
              : t("common.noLinkedCallSession")}
          </p>
        </div>
      </div>
      <ul className="trace-list">
        {record.trace.map((entry) => (
          <li key={entry.traceId}>
            <strong>{formatTraceEventType(entry.eventType, t)}</strong>
            <p>{entry.message}</p>
            <p>{formatDateTime(entry.createdAt, locale, t)}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function LookupPage() {
  const { session } = useConciergePortal();
  const { locale, t } = useTranslation();
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
              : t("lookup.error.recent"),
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
  }, [session, t]);

  return (
    <div className="page-shell">
      <SessionGuard requireDesk>
        <section className="hero-card">
          <span className="section-kicker">{t("lookup.eyebrow")}</span>
          <h1>{t("lookup.title")}</h1>
          <p>{t("lookup.body")}</p>
        </section>

        {error ? <section className="error-copy">{error}</section> : null}

        <section className="panel-card">
          <span className="section-kicker">{t("lookup.manual.eyebrow")}</span>
          <h2>{t("lookup.manual.title")}</h2>
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
                    : t("lookup.error.manual"),
                );
              } finally {
                setLoading(false);
              }
            }}
          >
            <div className="field-stack">
              <label htmlFor="manual-order-id">
                {t("lookup.manual.field")}
              </label>
              <input
                id="manual-order-id"
                onChange={(event) => setManualOrderId(event.target.value)}
                placeholder={t("lookup.manual.placeholder")}
                value={manualOrderId}
              />
            </div>
            <div className="inline-actions">
              <button
                className="primary-button"
                disabled={loading}
                type="submit"
              >
                {t("lookup.manual.submit")}
              </button>
            </div>
          </form>
        </section>

        {manualRecord ? (
          <LookupCard locale={locale} record={manualRecord} t={t} />
        ) : null}

        <section className="panel-card">
          <span className="section-kicker">{t("lookup.recent.eyebrow")}</span>
          <h2>{t("lookup.recent.title")}</h2>
          {loading ? <p>{t("lookup.recent.loading")}</p> : null}
          {!loading && records.length === 0 ? (
            <p className="empty-state">{t("common.noRecentOrders")}</p>
          ) : null}
          <div className="list-stack">
            {records.map((record) => (
              <LookupCard
                key={record.order.orderId}
                locale={locale}
                record={record}
                t={t}
              />
            ))}
          </div>
        </section>
      </SessionGuard>
    </div>
  );
}

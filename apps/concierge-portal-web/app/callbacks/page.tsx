"use client";

import { useEffect, useState } from "react";
import type { CallSessionRecord } from "@drts/contracts";
import { SessionGuard } from "@/components/session-guard";
import { createConciergeClient } from "@/lib/api-client";
import {
  formatCallStatus,
  formatCallbackStatus,
  formatDateTime,
  formatRecordingState,
} from "@/lib/formatters";
import { useTranslation } from "@/lib/i18n";
import { useConciergePortal } from "@/lib/portal-state";

export default function CallbacksPage() {
  const { session, recordCallbackTask } = useConciergePortal();
  const { locale, t } = useTranslation();
  const [sessions, setSessions] = useState<CallSessionRecord[]>([]);
  const [selectedCallId, setSelectedCallId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [completeNote, setCompleteNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reloadSessions() {
    if (!session || session.recentCallIds.length === 0) {
      setSessions([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const client = createConciergeClient(session.operatorId, session.mode);
      const items = await Promise.all(
        session.recentCallIds.map((callId) => client.getCallSession(callId)),
      );
      setSessions(items);
      setSelectedCallId((current) => current || items[0]?.callId || "");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : t("callbacks.error.load"),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) {
      setSessions([]);
      setSelectedCallId("");
      return;
    }

    let cancelled = false;
    const client = createConciergeClient(session.operatorId, session.mode);

    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const items =
          session.recentCallIds.length === 0
            ? []
            : await Promise.all(
                session.recentCallIds.map((callId) =>
                  client.getCallSession(callId),
                ),
              );
        if (!cancelled) {
          setSessions(items);
          setSelectedCallId((current) => current || items[0]?.callId || "");
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : t("callbacks.error.load"),
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
          <span className="section-kicker">{t("callbacks.eyebrow")}</span>
          <h1>{t("callbacks.title")}</h1>
          <p>{t("callbacks.body")}</p>
        </section>

        {error ? <section className="error-copy">{error}</section> : null}

        <section className="panel-card">
          <span className="section-kicker">
            {t("callbacks.create.eyebrow")}
          </span>
          <h2>{t("callbacks.create.title")}</h2>
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!session || selectedCallId.trim().length === 0 || !dueAt) {
                return;
              }

              setLoading(true);
              setError(null);
              try {
                const client = createConciergeClient(
                  session.operatorId,
                  session.mode,
                );
                const created = await client.createCallbackTask(
                  selectedCallId,
                  {
                    dueAt: new Date(dueAt).toISOString(),
                    note: note.trim() || null,
                  },
                );
                recordCallbackTask(created.callbackTaskId);
                setNote("");
                await reloadSessions();
              } catch (nextError) {
                setError(
                  nextError instanceof Error
                    ? nextError.message
                    : t("callbacks.error.create"),
                );
              } finally {
                setLoading(false);
              }
            }}
          >
            <div className="field-stack">
              <label htmlFor="call-id">{t("callbacks.field.session")}</label>
              <select
                id="call-id"
                onChange={(event) => setSelectedCallId(event.target.value)}
                value={selectedCallId}
              >
                <option value="">
                  {t("callbacks.field.sessionPlaceholder")}
                </option>
                {sessions.map((callSession) => (
                  <option key={callSession.callId} value={callSession.callId}>
                    {t("callbacks.optionLabel", {
                      callId: callSession.callId,
                      status: formatCallStatus(callSession.status, t),
                      order: callSession.linkedOrderId ?? t("common.noneYet"),
                    })}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-stack">
              <label htmlFor="callback-due">{t("callbacks.field.due")}</label>
              <input
                id="callback-due"
                onChange={(event) => setDueAt(event.target.value)}
                type="datetime-local"
                value={dueAt}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="callback-note">{t("callbacks.field.note")}</label>
              <textarea
                id="callback-note"
                onChange={(event) => setNote(event.target.value)}
                value={note}
              />
            </div>
            <div className="inline-actions">
              <button
                className="primary-button"
                disabled={loading}
                type="submit"
              >
                {t("callbacks.submit")}
              </button>
            </div>
          </form>
        </section>

        <section className="panel-card">
          <span className="section-kicker">
            {t("callbacks.recent.eyebrow")}
          </span>
          <h2>{t("callbacks.recent.title")}</h2>
          {loading ? <p>{t("callbacks.loading")}</p> : null}
          {!loading && sessions.length === 0 ? (
            <p className="empty-state">{t("common.noRecentCallSessions")}</p>
          ) : null}
          <div className="list-stack">
            {sessions.map((callSession) => (
              <article className="detail-card" key={callSession.callId}>
                <header>
                  <div>
                    <span className="section-kicker">
                      {t("callbacks.card.eyebrow")}
                    </span>
                    <h3>{callSession.callId}</h3>
                  </div>
                  <span
                    className={`chip${
                      callSession.callbackTask?.status === "completed"
                        ? " chip-success"
                        : callSession.callbackTask
                          ? " chip-warning"
                          : ""
                    }`}
                  >
                    {formatCallbackStatus(callSession.callbackTask?.status, t)}
                  </span>
                </header>
                <div className="kv-grid">
                  <div className="kv-item">
                    <strong>{t("callbacks.kv.order")}</strong>
                    <p>{callSession.linkedOrderId ?? t("common.noneYet")}</p>
                  </div>
                  <div className="kv-item">
                    <strong>{t("callbacks.kv.recording")}</strong>
                    <p>{formatRecordingState(callSession.recordingState, t)}</p>
                  </div>
                  <div className="kv-item">
                    <strong>{t("callbacks.kv.due")}</strong>
                    <p>
                      {formatDateTime(
                        callSession.callbackTask?.dueAt,
                        locale,
                        t,
                      )}
                    </p>
                  </div>
                  <div className="kv-item">
                    <strong>{t("callbacks.kv.note")}</strong>
                    <p>
                      {callSession.callbackTask?.note ?? t("common.noNote")}
                    </p>
                  </div>
                </div>
                {callSession.callbackTask?.status !== "completed" ? (
                  <form
                    className="form-grid"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (!session || !callSession.callbackTask) {
                        return;
                      }

                      setLoading(true);
                      setError(null);
                      try {
                        const client = createConciergeClient(
                          session.operatorId,
                          session.mode,
                        );
                        await client.completeCallbackTask(
                          callSession.callbackTask.callbackTaskId,
                          {
                            note: completeNote.trim() || null,
                          },
                        );
                        setCompleteNote("");
                        await reloadSessions();
                      } catch (nextError) {
                        setError(
                          nextError instanceof Error
                            ? nextError.message
                            : t("callbacks.error.complete"),
                        );
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    <div className="field-stack">
                      <label htmlFor={`complete-note-${callSession.callId}`}>
                        {t("callbacks.complete.label")}
                      </label>
                      <textarea
                        id={`complete-note-${callSession.callId}`}
                        onChange={(event) =>
                          setCompleteNote(event.target.value)
                        }
                        value={completeNote}
                      />
                    </div>
                    <div className="inline-actions">
                      <button
                        className="secondary-button"
                        disabled={loading}
                        type="submit"
                      >
                        {t("callbacks.complete.submit")}
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </SessionGuard>
    </div>
  );
}

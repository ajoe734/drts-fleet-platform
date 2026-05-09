"use client";

import { useEffect, useState } from "react";
import type { CallSessionRecord } from "@drts/contracts";
import { SessionGuard } from "@/components/session-guard";
import { createConciergeClient } from "@/lib/api-client";
import { useConciergePortal } from "@/lib/portal-state";

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

export default function CallbacksPage() {
  const { session, recordCallbackTask } = useConciergePortal();
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
          : "Failed to load callback sessions.",
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
              : "Failed to load callback sessions.",
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
          <span className="section-kicker">Callbacks</span>
          <h1>Schedule and close follow-up work from recent desk sessions.</h1>
          <p>
            The concierge surface stops short of complaint-case management, but
            it still materializes callback creation and callback completion for
            desk-owned sessions.
          </p>
        </section>

        {error ? <section className="error-copy">{error}</section> : null}

        <section className="panel-card">
          <span className="section-kicker">Create callback</span>
          <h2>Attach follow-up to the active or recent desk session.</h2>
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
                    : "Failed to create the callback task.",
                );
              } finally {
                setLoading(false);
              }
            }}
          >
            <div className="field-stack">
              <label htmlFor="call-id">Desk session</label>
              <select
                id="call-id"
                onChange={(event) => setSelectedCallId(event.target.value)}
                value={selectedCallId}
              >
                <option value="">Select a recent call session</option>
                {sessions.map((callSession) => (
                  <option key={callSession.callId} value={callSession.callId}>
                    {callSession.callId} · {callSession.status} ·{" "}
                    {callSession.linkedOrderId ?? "No order yet"}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-stack">
              <label htmlFor="callback-due">Due time</label>
              <input
                id="callback-due"
                onChange={(event) => setDueAt(event.target.value)}
                type="datetime-local"
                value={dueAt}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="callback-note">Callback note</label>
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
                Create callback task
              </button>
            </div>
          </form>
        </section>

        <section className="panel-card">
          <span className="section-kicker">Recent session follow-up</span>
          <h2>Desk callback state</h2>
          {loading ? <p>Loading callback state.</p> : null}
          {!loading && sessions.length === 0 ? (
            <p className="empty-state">
              No desk sessions are stored in this browser session yet.
            </p>
          ) : null}
          <div className="list-stack">
            {sessions.map((callSession) => (
              <article className="detail-card" key={callSession.callId}>
                <header>
                  <div>
                    <span className="section-kicker">Call session</span>
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
                    {callSession.callbackTask?.status ?? "No callback"}
                  </span>
                </header>
                <div className="kv-grid">
                  <div className="kv-item">
                    <strong>Linked order</strong>
                    <p>{callSession.linkedOrderId ?? "None yet"}</p>
                  </div>
                  <div className="kv-item">
                    <strong>Recording</strong>
                    <p>{callSession.recordingState}</p>
                  </div>
                  <div className="kv-item">
                    <strong>Callback due</strong>
                    <p>{formatDateTime(callSession.callbackTask?.dueAt)}</p>
                  </div>
                  <div className="kv-item">
                    <strong>Callback note</strong>
                    <p>{callSession.callbackTask?.note ?? "No note"}</p>
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
                            : "Failed to complete the callback task.",
                        );
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    <div className="field-stack">
                      <label htmlFor={`complete-note-${callSession.callId}`}>
                        Completion note
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
                        Mark callback completed
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

"use client";

import { useEffect, useState } from "react";
import type { CallSessionRecord } from "@drts/contracts";
import { SessionGuard } from "@/components/session-guard";
import { createConciergeClient } from "@/lib/api-client";
import {
  formatCallbackTaskStatus,
  formatCallSessionStatus,
  formatRecordingState,
} from "@/lib/display-labels";
import { useConciergePortal } from "@/lib/portal-state";

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-TW") : "未設定";
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
    } catch {
      setError("載入回覆通話失敗，請稍後再試。");
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
      } catch {
        if (!cancelled) {
          setError("載入回覆通話失敗，請稍後再試。");
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
          <span className="section-kicker">回覆任務</span>
          <h1>針對近期櫃台通話安排或完成後續回覆。</h1>
          <p>
            此入口不處理完整申訴案件管理，但可為櫃台擁有的通話建立回覆任務並標記完成。
          </p>
        </section>

        {error ? <section className="error-copy">{error}</section> : null}

        <section className="panel-card">
          <span className="section-kicker">建立回覆</span>
          <h2>將後續回覆綁定到進行中或近期櫃台通話。</h2>
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
              } catch {
                setError("建立回覆任務失敗，請稍後再試。");
              } finally {
                setLoading(false);
              }
            }}
          >
            <div className="field-stack">
              <label htmlFor="call-id">櫃台通話</label>
              <select
                id="call-id"
                onChange={(event) => setSelectedCallId(event.target.value)}
                value={selectedCallId}
              >
                <option value="">選擇近期通話</option>
                {sessions.map((callSession) => (
                  <option key={callSession.callId} value={callSession.callId}>
                    {callSession.callId} ·{" "}
                    {formatCallSessionStatus(callSession.status)} ·{" "}
                    {callSession.linkedOrderId ?? "尚未連結訂單"}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-stack">
              <label htmlFor="callback-due">回覆期限</label>
              <input
                id="callback-due"
                onChange={(event) => setDueAt(event.target.value)}
                type="datetime-local"
                value={dueAt}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="callback-note">回覆備註</label>
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
                建立回覆任務
              </button>
            </div>
          </form>
        </section>

        <section className="panel-card">
          <span className="section-kicker">近期通話後續</span>
          <h2>櫃台回覆狀態</h2>
          {loading ? <p>正在載入回覆狀態。</p> : null}
          {!loading && sessions.length === 0 ? (
            <p className="empty-state">此瀏覽器工作階段尚未儲存櫃台通話。</p>
          ) : null}
          <div className="list-stack">
            {sessions.map((callSession) => (
              <article className="detail-card" key={callSession.callId}>
                <header>
                  <div>
                    <span className="section-kicker">通話</span>
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
                    {formatCallbackTaskStatus(callSession.callbackTask?.status)}
                  </span>
                </header>
                <div className="kv-grid">
                  <div className="kv-item">
                    <strong>連結訂單</strong>
                    <p>{callSession.linkedOrderId ?? "尚未連結"}</p>
                  </div>
                  <div className="kv-item">
                    <strong>錄音</strong>
                    <p>{formatRecordingState(callSession.recordingState)}</p>
                  </div>
                  <div className="kv-item">
                    <strong>回覆期限</strong>
                    <p>{formatDateTime(callSession.callbackTask?.dueAt)}</p>
                  </div>
                  <div className="kv-item">
                    <strong>回覆備註</strong>
                    <p>{callSession.callbackTask?.note ?? "無備註"}</p>
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
                      } catch {
                        setError("完成回覆任務失敗，請稍後再試。");
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    <div className="field-stack">
                      <label htmlFor={`complete-note-${callSession.callId}`}>
                        完成備註
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
                        標記回覆已完成
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  CallSessionRecord,
  CallbackTaskRecord,
  DispatchTraceLogRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import { SessionGuard } from "@/components/session-guard";
import { createConciergeClient } from "@/lib/api-client";
import {
  formatCallSessionStatus,
  formatComplianceFlags,
  formatOrderStatus,
  formatRecordingState,
  formatTraceEventLabel,
  formatTraceMessage,
} from "@/lib/display-labels";
import {
  evaluateDeskEligibility,
  formatDeskHealth,
  formatQueuePolicy,
  formatRecordingAvailability,
  formatRequestedProduct,
  type RequestedServiceProduct,
  resolveDeskAccess,
} from "@/lib/desk-catalog";
import { useConciergePortal, useSelectedDesk } from "@/lib/portal-state";

type SubmissionSummary = {
  order: OwnedOrderRecord;
  trace: DispatchTraceLogRecord[];
  callbackTask: CallbackTaskRecord | null;
};

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-TW") : "未設定";
}

export default function ConciergeBookingCreatePage() {
  const router = useRouter();
  const {
    session,
    recordCall,
    clearActiveCall,
    recordOrder,
    recordCallbackTask,
  } = useConciergePortal();
  const desk = useSelectedDesk();
  const [passengerName, setPassengerName] = useState("陳旅客");
  const [passengerPhone, setPassengerPhone] = useState("0911222333");
  const [pickupAddress, setPickupAddress] = useState(
    desk?.location ?? "台北市信義區市府路 1 號 1F",
  );
  const [dropoffAddress, setDropoffAddress] =
    useState("台北市大安區仁愛路 4 段 12 號");
  const [requestedProduct, setRequestedProduct] =
    useState<RequestedServiceProduct>("standard_taxi");
  const [quotedEtaMinutes, setQuotedEtaMinutes] = useState("12");
  const [callbackDueAt, setCallbackDueAt] = useState("");
  const [callbackNote, setCallbackNote] = useState("");
  const [notes, setNotes] = useState("客服代訂入口建立的櫃台代訂。");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSession, setCurrentSession] =
    useState<CallSessionRecord | null>(null);
  const [submission, setSubmission] = useState<SubmissionSummary | null>(null);

  useEffect(() => {
    if (!session?.activeCallId) {
      setCurrentSession(null);
      return;
    }

    let cancelled = false;
    const client = createConciergeClient(session.operatorId, session.mode);

    void (async () => {
      try {
        const nextSession = await client.getCallSession(session.activeCallId!);
        if (!cancelled) {
          setCurrentSession(nextSession);
        }
      } catch {
        if (!cancelled) {
          setError("載入進行中櫃台通話失敗，請稍後再試。");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.activeCallId, session?.mode, session?.operatorId]);

  useEffect(() => {
    if (desk?.location) {
      setPickupAddress((current) =>
        current.trim().length === 0 ? desk.location : current,
      );
    }
  }, [desk?.location]);

  const activeDeskSession =
    currentSession && currentSession.status === "active"
      ? currentSession
      : null;

  return (
    <div className="page-shell">
      <SessionGuard requireDesk>
        <section className="hero-card">
          <span className="section-kicker">建立代訂</span>
          <h1>先開啟櫃台通話，再建立代訂並回讀派遣軌跡。</h1>
          <p>
            此頁使用客服訂單流程建立代訂。站點資格、權限拒絕、櫃台降級與錄音不可用都會導向明確頁面，而不是無聲失敗。
          </p>
        </section>

        {error ? <section className="error-copy">{error}</section> : null}

        <section className="detail-grid">
          <article className="panel-card">
            <span className="section-kicker">櫃台狀態</span>
            <h2>{desk?.deskName}</h2>
            <p>
              {desk?.siteName} · {desk?.zoneLabel} ·{" "}
              {desk ? formatQueuePolicy(desk.queuePolicy) : "佇列未設定"}
            </p>
            <div className="badge-row">
              <span
                className={`chip${
                  desk?.health === "healthy" ? " chip-success" : " chip-warning"
                }`}
              >
                {desk ? formatDeskHealth(desk.health) : "狀態未設定"}
              </span>
              <span className="chip">
                {desk
                  ? formatRecordingAvailability(desk.recordingAvailability)
                  : "錄音狀態未設定"}
              </span>
            </div>
            <div className="inline-actions">
              <button
                className="primary-button"
                disabled={busyKey === "open-session"}
                onClick={async () => {
                  if (!session || !desk) {
                    return;
                  }

                  setBusyKey("open-session");
                  setError(null);
                  try {
                    const client = createConciergeClient(
                      session.operatorId,
                      session.mode,
                    );
                    const opened = await client.openCallSession({
                      callType: "booking",
                      callerPhone: desk.phone,
                      agentId: session.operatorId,
                      agentIdentityAnnounced: true,
                    });
                    recordCall(opened.callId);
                    setCurrentSession(opened);
                  } catch {
                    setError("開啟櫃台通話失敗，請稍後再試。");
                  } finally {
                    setBusyKey(null);
                  }
                }}
                type="button"
              >
                {activeDeskSession ? "櫃台通話進行中" : "開啟櫃台通話"}
              </button>
              {activeDeskSession ? (
                <button
                  className="secondary-button"
                  disabled={busyKey === "close-session"}
                  onClick={async () => {
                    if (!session) {
                      return;
                    }

                    setBusyKey("close-session");
                    setError(null);
                    try {
                      const client = createConciergeClient(
                        session.operatorId,
                        session.mode,
                      );
                      const closed = await client.closeCallSession(
                        activeDeskSession.callId,
                      );
                      clearActiveCall();
                      setCurrentSession(closed);
                    } catch {
                      setError("關閉櫃台通話失敗，請稍後再試。");
                    } finally {
                      setBusyKey(null);
                    }
                  }}
                  type="button"
                >
                  關閉櫃台通話
                </button>
              ) : null}
            </div>
            {currentSession ? (
              <div className="kv-grid">
                <div className="kv-item">
                  <strong>通話編號</strong>
                  <p>{currentSession.callId}</p>
                </div>
                <div className="kv-item">
                  <strong>狀態</strong>
                  <p>{formatCallSessionStatus(currentSession.status)}</p>
                </div>
                <div className="kv-item">
                  <strong>錄音</strong>
                  <p>{formatRecordingState(currentSession.recordingState)}</p>
                </div>
                <div className="kv-item">
                  <strong>最近預估抵達</strong>
                  <p>
                    {currentSession.lastEtaQuotedMinutes
                      ? `${currentSession.lastEtaQuotedMinutes} 分鐘`
                      : "尚未回報"}
                  </p>
                </div>
              </div>
            ) : null}
          </article>

          <article className="panel-card">
            <span className="section-kicker">保護規則</span>
            <h2>送出前會先檢查所有例外路徑。</h2>
            <p>
              未授權角色會導向拒絕頁；服務類型或區域不符會導向資格不符；降級櫃台會阻擋建立並轉為唯讀備援；錄音回補會明確轉交營運端。
            </p>
            <div className="inline-actions">
              <Link className="secondary-link" href="/denied">
                拒絕頁
              </Link>
              <Link className="secondary-link" href="/ineligible">
                資格不符頁
              </Link>
              <Link className="secondary-link" href="/recording-unavailable">
                錄音限制
              </Link>
            </div>
          </article>
        </section>

        <section className="panel-card">
          <span className="section-kicker">建立訂單</span>
          <h2>透過客服櫃台送出代訂需求。</h2>
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!session || !desk) {
                return;
              }

              const access = resolveDeskAccess(desk, session.mode);
              if (!access.allowed) {
                router.push(`/denied?desk=${desk.deskId}&mode=${session.mode}`);
                return;
              }

              if (desk.health === "degraded") {
                router.push(`/degraded?desk=${desk.deskId}`);
                return;
              }

              const eligibility = evaluateDeskEligibility(
                desk,
                requestedProduct,
                pickupAddress,
                dropoffAddress,
              );
              if (eligibility.state === "ineligible") {
                router.push(
                  `/ineligible?desk=${desk.deskId}&reason=${eligibility.reasonCode}`,
                );
                return;
              }

              setBusyKey("submit-order");
              setError(null);
              setSubmission(null);

              try {
                const client = createConciergeClient(
                  session.operatorId,
                  session.mode,
                );
                const workingSession =
                  activeDeskSession ??
                  (await client.openCallSession({
                    callType: "booking",
                    callerPhone: desk.phone,
                    agentId: session.operatorId,
                    agentIdentityAnnounced: true,
                  }));

                if (!activeDeskSession) {
                  recordCall(workingSession.callId);
                }

                const accepted = await client.createCallCenterOrder({
                  callId: workingSession.callId,
                  agentId: session.operatorId,
                  pickup: {
                    address: pickupAddress,
                  },
                  dropoff: {
                    address: dropoffAddress,
                  },
                  passenger: {
                    name: passengerName,
                    phone: passengerPhone,
                  },
                  notes,
                });

                recordOrder(accepted.orderId);

                const etaMinutes = Number.parseInt(quotedEtaMinutes, 10);
                if (Number.isFinite(etaMinutes) && etaMinutes > 0) {
                  await client.quoteCallEta(workingSession.callId, {
                    etaMinutes,
                  });
                }

                let callbackTask: CallbackTaskRecord | null = null;
                if (callbackDueAt.trim().length > 0) {
                  callbackTask = await client.createCallbackTask(
                    workingSession.callId,
                    {
                      dueAt: new Date(callbackDueAt).toISOString(),
                      note: callbackNote.trim() || null,
                    },
                  );
                  recordCallbackTask(callbackTask.callbackTaskId);
                }

                const [order, trace, refreshedSession] = await Promise.all([
                  client.getOrder(accepted.orderId),
                  client.getOrderDispatchTrace(accepted.orderId),
                  client.getCallSession(workingSession.callId),
                ]);

                setCurrentSession(refreshedSession);
                setSubmission({
                  order,
                  trace,
                  callbackTask,
                });
              } catch {
                setError("建立代訂失敗，請稍後再試。");
              } finally {
                setBusyKey(null);
              }
            }}
          >
            <div className="field-stack">
              <label htmlFor="passenger-name">乘客姓名</label>
              <input
                id="passenger-name"
                onChange={(event) => setPassengerName(event.target.value)}
                required
                value={passengerName}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="passenger-phone">乘客電話</label>
              <input
                id="passenger-phone"
                onChange={(event) => setPassengerPhone(event.target.value)}
                required
                value={passengerPhone}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="requested-product">服務類型</label>
              <select
                id="requested-product"
                onChange={(event) =>
                  setRequestedProduct(
                    event.target.value as RequestedServiceProduct,
                  )
                }
                value={requestedProduct}
              >
                <option value="standard_taxi">
                  {formatRequestedProduct("standard_taxi")}
                </option>
                <option value="airport_assist">
                  {formatRequestedProduct("airport_assist")}
                </option>
                <option value="medical_discharge">
                  {formatRequestedProduct("medical_discharge")}
                </option>
              </select>
              <p className="form-help">
                送出前會先確認此櫃台是否授權該服務類型。
              </p>
            </div>
            <div className="field-stack">
              <label htmlFor="quoted-eta">回報預估抵達分鐘數</label>
              <input
                id="quoted-eta"
                min="1"
                onChange={(event) => setQuotedEtaMinutes(event.target.value)}
                type="number"
                value={quotedEtaMinutes}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="pickup-address">上車地址</label>
              <textarea
                id="pickup-address"
                onChange={(event) => setPickupAddress(event.target.value)}
                required
                value={pickupAddress}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="dropoff-address">下車地址</label>
              <textarea
                id="dropoff-address"
                onChange={(event) => setDropoffAddress(event.target.value)}
                required
                value={dropoffAddress}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="callback-due-at">可選回覆期限</label>
              <input
                id="callback-due-at"
                onChange={(event) => setCallbackDueAt(event.target.value)}
                type="datetime-local"
                value={callbackDueAt}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="callback-note">回覆備註</label>
              <textarea
                id="callback-note"
                onChange={(event) => setCallbackNote(event.target.value)}
                value={callbackNote}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="booking-notes">櫃台備註</label>
              <textarea
                id="booking-notes"
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </div>

            <div className="inline-actions">
              <button
                className="primary-button"
                disabled={busyKey === "submit-order"}
                type="submit"
              >
                送出代訂
              </button>
            </div>
          </form>
        </section>

        {submission ? (
          <section className="detail-grid">
            <article className="detail-card">
              <header>
                <div>
                  <span className="section-kicker">送出成功</span>
                  <h3>{submission.order.orderNo}</h3>
                </div>
                <span
                  className={`chip${
                    submission.order.status === "recording_pending"
                      ? " chip-warning"
                      : " chip-success"
                  }`}
                >
                  {formatOrderStatus(submission.order.status)}
                </span>
              </header>
              <div className="kv-grid">
                <div className="kv-item">
                  <strong>訂單編號</strong>
                  <p>{submission.order.orderId}</p>
                </div>
                <div className="kv-item">
                  <strong>通話編號</strong>
                  <p>{submission.order.callId ?? "尚未連結"}</p>
                </div>
                <div className="kv-item">
                  <strong>預估抵達快照</strong>
                  <p>
                    {submission.order.etaSnapshot
                      ? `${submission.order.etaSnapshot.etaMinutes} 分鐘`
                      : "尚不可用"}
                  </p>
                </div>
                <div className="kv-item">
                  <strong>錄音合規狀態</strong>
                  <p>
                    {formatComplianceFlags(submission.order.complianceFlags)}
                  </p>
                </div>
              </div>
              {submission.callbackTask ? (
                <p>
                  回覆任務 {submission.callbackTask.callbackTaskId} 需於{" "}
                  {formatDateTime(submission.callbackTask.dueAt)} 前處理。
                </p>
              ) : null}
              <div className="inline-actions">
                <Link className="secondary-link" href="/lookup">
                  開啟訂單查詢
                </Link>
                <Link className="secondary-link" href="/callbacks">
                  開啟回覆任務
                </Link>
                {desk?.recordingAvailability === "ops_callback_only" ? (
                  <Link
                    className="secondary-link"
                    href="/recording-unavailable"
                  >
                    查看錄音限制
                  </Link>
                ) : null}
              </div>
            </article>

            <article className="detail-card">
              <header>
                <div>
                  <span className="section-kicker">派遣軌跡</span>
                  <h3>訂單生命週期紀錄</h3>
                </div>
              </header>
              <ul className="trace-list">
                {submission.trace.map((entry) => (
                  <li key={entry.traceId}>
                    <strong>{formatTraceEventLabel(entry.eventType)}</strong>
                    <p>{formatTraceMessage(entry.eventType, entry.message)}</p>
                    <p>{formatDateTime(entry.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        ) : null}
      </SessionGuard>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@drts/ui-web";
import type {
  AttachCallRecordingCommand,
  CallbackTaskRecord,
  CallRecordingState,
  CallSessionRecord,
  ComplaintCategory,
  CreateCallCenterOrderCommand,
  DispatchTraceLogRecord,
  OpenCallSessionCommand,
  OwnedOrderRecord,
  TransferCallToComplaintCommand,
} from "@drts/contracts";
import { CALL_TYPES, COMPLAINT_CATEGORIES } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatOpsCodeLabel,
  formatOpsCodeList,
  getOpsLabel,
} from "@/lib/localized-labels";

const CALL_TYPE_OPTIONS = [...CALL_TYPES];
const COMPLAINT_CATEGORY_OPTIONS: ComplaintCategory[] = [
  ...COMPLAINT_CATEGORIES,
];

type RecordingFormState = AttachCallRecordingCommand & {
  agentId: string;
};

const INITIAL_INTAKE_FORM: OpenCallSessionCommand = {
  callType: "booking",
  callerPhone: "",
  agentId: "AGENT-OPS-001",
  agentIdentityAnnounced: true,
};

const INITIAL_ORDER_FORM = {
  passengerName: "",
  passengerPhone: "",
  pickupAddress: "",
  dropoffAddress: "",
  notes: "",
};

const INITIAL_RECORDING_FORM: RecordingFormState = {
  recordingId: "",
  providerRecordingRef: "",
  recordingUrl: "",
  agentId: "AGENT-OPS-001",
};

const INITIAL_COMPLAINT_TRANSFER_FORM: TransferCallToComplaintCommand = {
  category: "fare_dispute",
  severity: "normal",
  description: "",
};

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "-";
}

function toIsoString(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function getRecordingStateTone(recordingState: CallRecordingState) {
  switch (recordingState) {
    case "ready":
      return "state-chip state-ready";
    case "missing":
      return "state-chip state-missing";
    case "pending":
    default:
      return "state-chip state-pending";
  }
}

function getOverrideStatusTone(status: string) {
  switch (status) {
    case "approved":
      return "queue-badge badge-positive";
    case "rejected":
      return "queue-badge badge-danger";
    case "expired":
      return "queue-badge badge-warning";
    case "pending_approval":
    default:
      return "queue-badge badge-warning";
  }
}

function compareCallSessionPriority(
  a: CallSessionRecord,
  b: CallSessionRecord,
) {
  if (a.status !== b.status) {
    return a.status === "active" ? -1 : 1;
  }

  const aHasCallback = a.callbackTask?.status === "pending";
  const bHasCallback = b.callbackTask?.status === "pending";
  if (aHasCallback !== bHasCallback) {
    return aHasCallback ? -1 : 1;
  }

  if (a.recordingState !== b.recordingState) {
    const priority: Record<CallRecordingState, number> = {
      missing: 3,
      pending: 2,
      ready: 1,
    };
    return priority[b.recordingState] - priority[a.recordingState];
  }

  return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
}

function getCallbackTone(callback: CallbackTaskRecord) {
  if (callback.status === "completed") {
    return "queue-badge badge-positive";
  }
  if (new Date(callback.dueAt).getTime() < Date.now()) {
    return "queue-badge badge-danger";
  }
  return "queue-badge badge-warning";
}

function formatRelativeDeadline(value: string, locale: "en" | "zh") {
  const deltaMinutes = Math.round(
    (new Date(value).getTime() - Date.now()) / (1000 * 60),
  );

  if (deltaMinutes >= 0) {
    return locale === "en"
      ? `Due in ${deltaMinutes} min`
      : `${deltaMinutes} 分鐘後到期`;
  }

  return locale === "en"
    ? `Overdue by ${Math.abs(deltaMinutes)} min`
    : `已逾期 ${Math.abs(deltaMinutes)} 分鐘`;
}

function getCallbackSummary(callback: CallbackTaskRecord, locale: "en" | "zh") {
  const parts = [
    callback.agentId ?? (locale === "en" ? "Unassigned" : "未指派"),
    callback.note ?? (locale === "en" ? "No note" : "無備註"),
  ];

  return parts.join(" · ");
}

export default function CallcenterPage() {
  const { t, locale } = useTranslation();
  const resolveErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : t("common.unknown");
  const [sessions, setSessions] = useState<CallSessionRecord[]>([]);
  const [callbacks, setCallbacks] = useState<CallbackTaskRecord[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OwnedOrderRecord | null>(
    null,
  );
  const [dispatchTrace, setDispatchTrace] = useState<DispatchTraceLogRecord[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showIntake, setShowIntake] = useState(false);
  const [intakeForm, setIntakeForm] = useState(INITIAL_INTAKE_FORM);
  const [orderForm, setOrderForm] = useState(INITIAL_ORDER_FORM);
  const [existingOrderId, setExistingOrderId] = useState("");
  const [quotedEtaMinutes, setQuotedEtaMinutes] = useState("12");
  const [recordingForm, setRecordingForm] = useState<RecordingFormState>(
    INITIAL_RECORDING_FORM,
  );
  const [callbackDueAt, setCallbackDueAt] = useState("");
  const [callbackNote, setCallbackNote] = useState("");
  const [callbackCompleteNote, setCallbackCompleteNote] = useState("");
  const [transferForm, setTransferForm] = useState(
    INITIAL_COMPLAINT_TRANSFER_FORM,
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const selectedSession = useMemo(
    () => sessions.find((session) => session.callId === selectedCallId) ?? null,
    [selectedCallId, sessions],
  );

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const linkedOrderId = selectedSession?.linkedOrderId;
    if (!linkedOrderId) {
      setSelectedOrder(null);
      setDispatchTrace([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const client = getOpsClient();
        const [order, trace] = await Promise.all([
          client.getOrder(linkedOrderId),
          client.getOrderDispatchTrace(linkedOrderId),
        ]);
        if (cancelled) {
          return;
        }
        setSelectedOrder(order as OwnedOrderRecord);
        setDispatchTrace(trace);
      } catch (nextError) {
        if (!cancelled) {
          setError(resolveErrorMessage(nextError));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSession?.linkedOrderId]);

  async function loadData(preferredCallId?: string) {
    setLoading(true);
    try {
      const client = getOpsClient();
      const [nextSessions, nextCallbacks] = await Promise.all([
        client.listCallSessions(),
        client.listCallbackTasks(),
      ]);
      setSessions(nextSessions);
      setCallbacks(nextCallbacks);
      const focusCallId =
        preferredCallId ??
        (nextSessions.some((session) => session.callId === selectedCallId)
          ? selectedCallId
          : (nextSessions[0]?.callId ?? null));
      setSelectedCallId(focusCallId);
      setError(null);
    } catch (nextError) {
      setError(resolveErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    try {
      await action();
      setError(null);
    } catch (nextError) {
      setError(resolveErrorMessage(nextError));
    } finally {
      setBusyKey(null);
    }
  }

  const filteredSessions = sessions.filter((session) => {
    if (!deferredQuery) {
      return true;
    }
    const haystack = [
      session.callId,
      session.callType,
      session.callerPhone,
      session.agentId ?? "",
      session.linkedOrderId ?? "",
      session.linkedCaseNo ?? "",
      session.status,
      session.flags.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(deferredQuery);
  });

  const openSessions = sessions.filter(
    (session) => session.status === "active",
  ).length;
  const bookingLinked = sessions.filter(
    (session) => session.linkedOrderId,
  ).length;
  const recordingPending = sessions.filter((session) =>
    session.flags.includes("recording_pending"),
  ).length;
  const hotlineTransfers = sessions.filter(
    (session) => session.linkedCaseNo,
  ).length;
  const sortedSessions = [...filteredSessions].sort(compareCallSessionPriority);
  const callbackQueue = [...callbacks].sort(
    (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
  );
  const pendingCallbacks = callbackQueue.filter(
    (callback) => callback.status === "pending",
  );
  const overdueCallbacks = pendingCallbacks.filter(
    (callback) => new Date(callback.dueAt).getTime() < Date.now(),
  ).length;
  const selectedCallback = selectedSession?.callbackTask ?? null;
  const selectedCallbackIsPending = selectedCallback?.status === "pending";
  const selectedCallbackIsOverdue =
    selectedCallbackIsPending &&
    new Date(selectedCallback.dueAt).getTime() < Date.now();
  const selectedSessionHasOrder = Boolean(selectedSession?.linkedOrderId);
  const selectedSessionHasComplaint = Boolean(selectedSession?.linkedCaseNo);
  const selectedSessionNeedsRecordingGate =
    selectedSession?.recordingState === "pending" ||
    selectedSession?.recordingState === "missing";
  const bookingLaneLocked =
    !selectedSession || selectedSessionHasOrder || selectedSessionHasComplaint;
  const bookingLaneNote = !selectedSession
    ? locale === "en"
      ? "Select a live session before creating or linking a booking."
      : "請先選擇一筆進線，再建立或連結 booking。"
    : selectedSessionHasOrder
      ? locale === "en"
        ? `Booking lane locked. ${selectedSession.linkedOrderId} is already linked to this session.`
        : `Booking 流程已鎖定，這筆 session 已連結 ${selectedSession.linkedOrderId}。`
      : selectedSessionHasComplaint
        ? locale === "en"
          ? `Complaint handoff is already active under ${selectedSession.linkedCaseNo}. Avoid creating a second booking from the same call.`
          : `客訴 handoff 已進入 ${selectedSession.linkedCaseNo}，請勿從同一通電話再建立第二筆 booking。`
        : locale === "en"
          ? "Create one new phone booking or link one existing order, then continue dispatch or callback work from the same session."
          : "建立一筆新的電話訂單，或連結一筆既有訂單，之後再從同一個 session 繼續 dispatch / callback。";
  const callbackLaneStatus = !selectedSession
    ? locale === "en"
      ? "No session selected"
      : "尚未選擇 session"
    : !selectedCallback
      ? locale === "en"
        ? "No callback task yet"
        : "尚無 callback 任務"
      : selectedCallback.status === "completed"
        ? locale === "en"
          ? "Callback completed"
          : "Callback 已完成"
        : selectedCallbackIsOverdue
          ? locale === "en"
            ? "Callback overdue"
            : "Callback 已逾期"
          : locale === "en"
            ? "Callback queued"
            : "Callback 已排程";
  const complaintLaneStatus = !selectedSession
    ? locale === "en"
      ? "No session selected"
      : "尚未選擇 session"
    : selectedSessionHasComplaint
      ? locale === "en"
        ? `Complaint ${selectedSession.linkedCaseNo} linked`
        : `已連結客訴 ${selectedSession.linkedCaseNo}`
      : locale === "en"
        ? "Ready for complaint handoff if passenger remediation is required"
        : "如需乘客補救，可從此處轉交客訴";
  const workspaceStages = [
    {
      title: locale === "en" ? "Booking lane" : "Booking 流程",
      state: bookingLaneLocked
        ? locale === "en"
          ? "locked"
          : "已鎖定"
        : locale === "en"
          ? "ready"
          : "可執行",
      tone: bookingLaneLocked ? "stage-card stage-locked" : "stage-card",
      note: bookingLaneNote,
    },
    {
      title: locale === "en" ? "Callback lane" : "Callback 流程",
      state: callbackLaneStatus,
      tone:
        selectedCallbackIsPending && selectedCallbackIsOverdue
          ? "stage-card stage-danger"
          : "stage-card",
      note: !selectedSession
        ? locale === "en"
          ? "Callback tasks stay visible from the same workspace while recording evidence is pending."
          : "錄音證據待補期間，callback 任務必須持續留在同一個 workspace。"
        : selectedCallback
          ? `${formatDateTime(selectedCallback.dueAt)} · ${getCallbackSummary(
              selectedCallback,
              locale,
            )}`
          : locale === "en"
            ? "Queue a callback here when the passenger needs follow-up outside the active call."
            : "若乘客需要稍後跟進，可直接從這裡建立 callback。",
    },
    {
      title: locale === "en" ? "Complaint lane" : "客訴流程",
      state: complaintLaneStatus,
      tone:
        selectedSessionHasComplaint ||
        selectedSession?.recordingState === "missing"
          ? "stage-card stage-warning"
          : "stage-card",
      note: selectedSessionHasComplaint
        ? locale === "en"
          ? "Complaint escalation stays separate from booking creation and remains traceable from this call session."
          : "客訴升級與 booking 建立必須分流，但仍需保留這筆 call session 的追蹤。"
        : locale === "en"
          ? "Use complaint handoff when the outcome becomes remediation instead of transport fulfillment."
          : "當處理結果轉為補救而非履約時，請走 complaint handoff。",
    },
  ];
  const workspaceHeadline = selectedSession
    ? locale === "en"
      ? `${selectedSession.callId} is active in the session workspace.`
      : `${selectedSession.callId} 已進入 session workspace。`
    : locale === "en"
      ? "Pick a live session to continue booking, callback, or complaint handoff."
      : "選擇一筆進線，接續 booking、callback 或 complaint handoff。";
  const sessionGuardrails = [
    t("callcenter.integrationAssumption.screenPop"),
    t("callcenter.integrationAssumption.recording"),
    t("callcenter.integrationAssumption.storage"),
    locale === "en"
      ? "Complaint handoff stays separate from phone-order creation and should only occur when the case context is captured."
      : "客訴 handoff 與電話訂車必須分流，只有在案件脈絡已記錄後才應升級。",
  ];

  return (
    <>
      <PageHeader
        title={t("callcenter.title")}
        subtitle={t("callcenter.subtitle")}
      />
      <div>
        {error && (
          <div className="error-banner">
            <strong>{getOpsLabel(locale, "error")}:</strong> {error}
          </div>
        )}

        <section className="workspace-hero">
          <div>
            <p className="eyebrow">
              {locale === "en" ? "Session workspace" : "Session Workspace"}
            </p>
            <h3>
              {selectedSession
                ? `${selectedSession.callId} · ${formatOpsCodeLabel(
                    locale,
                    selectedSession.callType,
                  )}`
                : t("callcenter.sessionDetail")}
            </h3>
            <p>{workspaceHeadline}</p>
          </div>
          <div className="hero-chip-row">
            <span className="hero-chip hero-chip-critical">
              {locale === "en"
                ? `${overdueCallbacks} overdue callback(s)`
                : `${overdueCallbacks} 筆 callback 已逾期`}
            </span>
            <span className="hero-chip">
              {locale === "en"
                ? `${pendingCallbacks.length} pending callback(s)`
                : `${pendingCallbacks.length} 筆 callback 待回應`}
            </span>
            <span className="hero-chip">
              {locale === "en"
                ? `${recordingPending} recording gate item(s)`
                : `${recordingPending} 筆錄音門檻待補`}
            </span>
          </div>
        </section>

        <section className="summary-grid">
          {[
            {
              label: t("callcenter.openSessions"),
              value: openSessions,
              note: t("callcenter.openSessionsSub"),
            },
            {
              label: t("callcenter.linkedOrders"),
              value: bookingLinked,
              note: t("callcenter.linkedOrdersSub"),
            },
            {
              label: t("callcenter.recordingPending"),
              value: recordingPending,
              note: t("callcenter.recordingPendingSub"),
            },
            {
              label: t("callcenter.hotlineTransfers"),
              value: hotlineTransfers,
              note: t("callcenter.hotlineTransfersSub"),
            },
          ].map((card) => (
            <div key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </div>
          ))}
        </section>

        <section className="workspace-stage-grid">
          {workspaceStages.map((stage) => (
            <article key={stage.title} className={stage.tone}>
              <span className="stage-eyebrow">{stage.title}</span>
              <strong>{stage.state}</strong>
              <p>{stage.note}</p>
            </article>
          ))}
        </section>

        <div className="toolbar">
          <input
            className="search-input"
            type="search"
            placeholder={t("callcenter.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowIntake((current) => !current)}
          >
            {showIntake
              ? t("callcenter.hideIntake")
              : t("callcenter.openIntake")}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => void loadData(selectedCallId ?? undefined)}
          >
            {t("common.refresh")}
          </button>
        </div>

        <section className="assumption-panel">
          <strong>
            {locale === "en"
              ? "Authority and integration guardrails"
              : "權限與整合 guardrails"}
          </strong>
          <ul className="assumption-list">
            {sessionGuardrails.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        {showIntake && (
          <section className="panel">
            <div className="panel-head">
              <h3>{t("callcenter.newIntake")}</h3>
              <p>{t("callcenter.intakeNote")}</p>
            </div>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void runAction("open-intake", async () => {
                  const created =
                    await getOpsClient().openCallSession(intakeForm);
                  setShowIntake(false);
                  setIntakeForm(INITIAL_INTAKE_FORM);
                  setOrderForm((current) => ({
                    ...current,
                    passengerPhone: created.callerPhone,
                  }));
                  setRecordingForm((current) => ({
                    ...current,
                    agentId:
                      created.agentId ??
                      INITIAL_INTAKE_FORM.agentId ??
                      "AGENT-OPS-001",
                  }));
                  await loadData(created.callId);
                });
              }}
            >
              <label>
                {t("callcenter.form.callType")}
                <select
                  value={intakeForm.callType}
                  onChange={(event) =>
                    setIntakeForm((current) => ({
                      ...current,
                      callType: event.target
                        .value as OpenCallSessionCommand["callType"],
                    }))
                  }
                >
                  {CALL_TYPE_OPTIONS.map((callType) => (
                    <option key={callType} value={callType}>
                      {formatOpsCodeLabel(locale, callType)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("callcenter.form.callerPhone")}
                <input
                  type="text"
                  value={intakeForm.callerPhone}
                  onChange={(event) =>
                    setIntakeForm((current) => ({
                      ...current,
                      callerPhone: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                {t("callcenter.form.agentId")}
                <input
                  type="text"
                  value={intakeForm.agentId ?? ""}
                  onChange={(event) =>
                    setIntakeForm((current) => ({
                      ...current,
                      agentId: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(intakeForm.agentIdentityAnnounced)}
                  onChange={(event) =>
                    setIntakeForm((current) => ({
                      ...current,
                      agentIdentityAnnounced: event.target.checked,
                    }))
                  }
                />
                {t("callcenter.form.announced")}
              </label>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busyKey === "open-intake"}
              >
                {busyKey === "open-intake"
                  ? t("callcenter.form.opening")
                  : t("callcenter.form.openSession")}
              </button>
            </form>
          </section>
        )}

        {loading ? (
          <p>{t("callcenter.loading")}</p>
        ) : (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-head">
                <h3>{t("callcenter.sessions")}</h3>
                <p>
                  {t("callcenter.results", { count: filteredSessions.length })}
                </p>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("callcenter.col.call")}</th>
                      <th>{t("callcenter.col.type")}</th>
                      <th>{t("callcenter.col.caller")}</th>
                      <th>{t("callcenter.col.agent")}</th>
                      <th>{t("callcenter.col.status")}</th>
                      <th>{t("callcenter.col.recordingState")}</th>
                      <th>{t("callcenter.col.order")}</th>
                      <th>{t("callcenter.col.complaint")}</th>
                      <th>{t("callcenter.col.started")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSessions.map((session) => (
                      <tr
                        key={session.callId}
                        className={
                          session.callId === selectedCallId
                            ? "selected-row"
                            : ""
                        }
                        onClick={() => setSelectedCallId(session.callId)}
                      >
                        <td>{session.callId}</td>
                        <td>{formatOpsCodeLabel(locale, session.callType)}</td>
                        <td>{session.callerPhone}</td>
                        <td>{session.agentId ?? "-"}</td>
                        <td>{formatOpsCodeLabel(locale, session.status)}</td>
                        <td>
                          <span
                            className={getRecordingStateTone(
                              session.recordingState,
                            )}
                          >
                            {t(
                              `callcenter.recordingState.${session.recordingState}`,
                            )}
                          </span>
                        </td>
                        <td>{session.linkedOrderId ?? "-"}</td>
                        <td>{session.linkedCaseNo ?? "-"}</td>
                        <td>{formatDateTime(session.startedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h3>{t("callcenter.sessionDetail")}</h3>
                <p>
                  {selectedSession
                    ? `${selectedSession.callId} / ${formatOpsCodeLabel(
                        locale,
                        selectedSession.callType,
                      )}`
                    : t("callcenter.selectSession")}
                </p>
              </div>

              {selectedSession ? (
                <div className="details-stack">
                  <section className="detail-card">
                    <div className="detail-grid">
                      <div>
                        <span className="label">
                          {locale === "en" ? "Caller / agent" : "來電者 / 客服"}
                        </span>
                        <strong>{selectedSession.callerPhone}</strong>
                        <small>{selectedSession.agentId ?? "-"}</small>
                      </div>
                      <div>
                        <span className="label">
                          {t("callcenter.detail.identityAnnounced")}
                        </span>
                        <strong>
                          {selectedSession.agentIdentityAnnounced
                            ? t("common.yes")
                            : t("common.no")}
                        </strong>
                        <small>
                          {formatDateTime(
                            selectedSession.agentIdentityAnnouncedAt,
                          )}
                        </small>
                      </div>
                      <div>
                        <span className="label">
                          {t("callcenter.detail.recording")}
                        </span>
                        <span
                          className={getRecordingStateTone(
                            selectedSession.recordingState,
                          )}
                        >
                          {t(
                            `callcenter.recordingState.${selectedSession.recordingState}`,
                          )}
                        </span>
                        <strong>
                          {selectedSession.recordingId ??
                            (selectedSession.recordingState === "missing"
                              ? t("callcenter.detail.recordingMissing")
                              : t("callcenter.detail.recordingPending"))}
                        </strong>
                        <small>
                          {selectedSession.providerRecordingRef ?? "-"}
                        </small>
                      </div>
                      <div>
                        <span className="label">
                          {t("callcenter.detail.lastEtaReply")}
                        </span>
                        <strong>
                          {selectedSession.lastEtaQuotedMinutes
                            ? t("callcenter.detail.etaMin", {
                                value: selectedSession.lastEtaQuotedMinutes,
                              })
                            : t("callcenter.detail.etaNotSent")}
                        </strong>
                        <small>
                          {formatDateTime(selectedSession.lastEtaQuotedAt)}
                        </small>
                      </div>
                      <div>
                        <span className="label">
                          {t("callcenter.detail.flags")}
                        </span>
                        <strong>
                          {selectedSession.flags.length
                            ? formatOpsCodeList(locale, selectedSession.flags)
                            : "-"}
                        </strong>
                        <small>{formatDateTime(selectedSession.endedAt)}</small>
                      </div>
                      <div>
                        <span className="label">
                          {locale === "en"
                            ? "Order / complaint linkage"
                            : "訂單 / 客訴連結"}
                        </span>
                        <strong>
                          {selectedSession.linkedOrderId ??
                            selectedSession.linkedCaseNo ??
                            "-"}
                        </strong>
                        <small>
                          {selectedSession.linkedOrderId &&
                          selectedSession.linkedCaseNo
                            ? locale === "en"
                              ? `${selectedSession.linkedOrderId} + ${selectedSession.linkedCaseNo}`
                              : `${selectedSession.linkedOrderId} + ${selectedSession.linkedCaseNo}`
                            : selectedSession.linkedOrderId
                              ? locale === "en"
                                ? "Order linked"
                                : "已連結訂單"
                              : selectedSession.linkedCaseNo
                                ? locale === "en"
                                  ? "Complaint linked"
                                  : "已連結客訴"
                                : locale === "en"
                                  ? "No downstream record linked yet"
                                  : "尚未連結下游紀錄"}
                        </small>
                      </div>
                    </div>
                    <div className="action-row">
                      {!selectedSession.agentIdentityAnnounced && (
                        <button
                          className="btn"
                          type="button"
                          disabled={busyKey === "announce-identity"}
                          onClick={() =>
                            void runAction("announce-identity", async () => {
                              await getOpsClient().announceCallAgentIdentity(
                                selectedSession.callId,
                                {
                                  agentId:
                                    selectedSession.agentId ??
                                    intakeForm.agentId ??
                                    "AGENT-OPS-001",
                                },
                              );
                              await loadData(selectedSession.callId);
                            })
                          }
                        >
                          {t("callcenter.markIdentityAnnounced")}
                        </button>
                      )}
                      {selectedSession.status !== "closed" && (
                        <button
                          className="btn"
                          type="button"
                          disabled={busyKey === "close-session"}
                          onClick={() =>
                            void runAction("close-session", async () => {
                              await getOpsClient().closeCallSession(
                                selectedSession.callId,
                              );
                              await loadData(selectedSession.callId);
                            })
                          }
                        >
                          {t("callcenter.closeSession")}
                        </button>
                      )}
                    </div>
                  </section>

                  <section className="detail-card">
                    <div className="detail-subgrid">
                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runAction("attach-recording", async () => {
                            await getOpsClient().attachRecordingCallback(
                              selectedSession.callId,
                              {
                                ...recordingForm,
                                agentId:
                                  recordingForm.agentId ??
                                  selectedSession.agentId ??
                                  intakeForm.agentId,
                              },
                            );
                            setRecordingForm(INITIAL_RECORDING_FORM);
                            await loadData(selectedSession.callId);
                          });
                        }}
                      >
                        <h4>{t("callcenter.attachRecordingForm")}</h4>
                        <input
                          type="text"
                          placeholder={t("callcenter.recordingIdPlaceholder")}
                          required
                          value={recordingForm.recordingId}
                          onChange={(event) =>
                            setRecordingForm((current) => ({
                              ...current,
                              recordingId: event.target.value,
                            }))
                          }
                        />
                        <input
                          type="text"
                          placeholder={t("callcenter.providerRefPlaceholder")}
                          value={recordingForm.providerRecordingRef ?? ""}
                          onChange={(event) =>
                            setRecordingForm((current) => ({
                              ...current,
                              providerRecordingRef: event.target.value,
                            }))
                          }
                        />
                        <input
                          type="url"
                          placeholder={t("callcenter.recordingUrlPlaceholder")}
                          value={recordingForm.recordingUrl ?? ""}
                          onChange={(event) =>
                            setRecordingForm((current) => ({
                              ...current,
                              recordingUrl: event.target.value,
                            }))
                          }
                        />
                        <button
                          className="btn"
                          type="submit"
                          disabled={busyKey === "attach-recording"}
                        >
                          {t("callcenter.attachRecording")}
                        </button>
                      </form>

                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runAction("quote-eta", async () => {
                            await getOpsClient().quoteCallEta(
                              selectedSession.callId,
                              {
                                etaMinutes: Number(quotedEtaMinutes),
                              },
                            );
                            await loadData(selectedSession.callId);
                          });
                        }}
                      >
                        <h4>{t("callcenter.replyEta")}</h4>
                        <input
                          type="number"
                          min={1}
                          required
                          value={quotedEtaMinutes}
                          onChange={(event) =>
                            setQuotedEtaMinutes(event.target.value)
                          }
                        />
                        <button
                          className="btn"
                          type="submit"
                          disabled={busyKey === "quote-eta"}
                        >
                          {t("callcenter.saveEtaReply")}
                        </button>
                      </form>

                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runAction("create-callback", async () => {
                            await getOpsClient().createCallbackTask(
                              selectedSession.callId,
                              {
                                dueAt: toIsoString(callbackDueAt),
                                note: callbackNote,
                              },
                            );
                            setCallbackDueAt("");
                            setCallbackNote("");
                            await loadData(selectedSession.callId);
                          });
                        }}
                      >
                        <h4>{t("callcenter.callbackQueueForm")}</h4>
                        <input
                          type="datetime-local"
                          required
                          value={callbackDueAt}
                          onChange={(event) =>
                            setCallbackDueAt(event.target.value)
                          }
                        />
                        <textarea
                          rows={2}
                          placeholder={t("callcenter.callbackNotePlaceholder")}
                          value={callbackNote}
                          onChange={(event) =>
                            setCallbackNote(event.target.value)
                          }
                        />
                        <div className="action-row">
                          <button
                            className="btn"
                            type="submit"
                            disabled={busyKey === "create-callback"}
                          >
                            {t("callcenter.saveCallback")}
                          </button>
                          {selectedSession.callbackTask?.status ===
                            "pending" && (
                            <>
                              <input
                                type="text"
                                placeholder={t(
                                  "callcenter.completionNotePlaceholder",
                                )}
                                value={callbackCompleteNote}
                                onChange={(event) =>
                                  setCallbackCompleteNote(event.target.value)
                                }
                              />
                              <button
                                className="btn"
                                type="button"
                                disabled={busyKey === "complete-callback"}
                                onClick={() =>
                                  void runAction(
                                    "complete-callback",
                                    async () => {
                                      await getOpsClient().completeCallbackTask(
                                        selectedSession.callbackTask!
                                          .callbackTaskId,
                                        {
                                          note: callbackCompleteNote,
                                        },
                                      );
                                      setCallbackCompleteNote("");
                                      await loadData(selectedSession.callId);
                                    },
                                  )
                                }
                              >
                                {t("callcenter.completeCallback")}
                              </button>
                            </>
                          )}
                        </div>
                      </form>
                    </div>
                  </section>

                  <section className="detail-card">
                    <div className="detail-subgrid">
                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const command: CreateCallCenterOrderCommand = {
                            callId: selectedSession.callId,
                            agentId:
                              selectedSession.agentId ??
                              intakeForm.agentId ??
                              "AGENT-OPS-001",
                            recordingId: selectedSession.recordingId,
                            pickup: { address: orderForm.pickupAddress },
                            dropoff: { address: orderForm.dropoffAddress },
                            passenger: {
                              name: orderForm.passengerName,
                              phone:
                                orderForm.passengerPhone ||
                                selectedSession.callerPhone,
                            },
                            ...(orderForm.notes.trim()
                              ? { notes: orderForm.notes.trim() }
                              : {}),
                          };
                          void runAction("create-phone-order", async () => {
                            await getOpsClient().createCallCenterOrder(command);
                            setOrderForm(INITIAL_ORDER_FORM);
                            await loadData(selectedSession.callId);
                          });
                        }}
                      >
                        <h4>{t("callcenter.createPhoneBooking")}</h4>
                        <p className="panel-note">{bookingLaneNote}</p>
                        <input
                          type="text"
                          placeholder={t("callcenter.passengerNamePlaceholder")}
                          required
                          value={orderForm.passengerName}
                          onChange={(event) =>
                            setOrderForm((current) => ({
                              ...current,
                              passengerName: event.target.value,
                            }))
                          }
                        />
                        <input
                          type="text"
                          placeholder={t(
                            "callcenter.passengerPhonePlaceholder",
                          )}
                          value={orderForm.passengerPhone}
                          onChange={(event) =>
                            setOrderForm((current) => ({
                              ...current,
                              passengerPhone: event.target.value,
                            }))
                          }
                        />
                        <input
                          type="text"
                          placeholder={t("callcenter.pickupAddressPlaceholder")}
                          required
                          value={orderForm.pickupAddress}
                          onChange={(event) =>
                            setOrderForm((current) => ({
                              ...current,
                              pickupAddress: event.target.value,
                            }))
                          }
                        />
                        <input
                          type="text"
                          placeholder={t(
                            "callcenter.dropoffAddressPlaceholder",
                          )}
                          required
                          value={orderForm.dropoffAddress}
                          onChange={(event) =>
                            setOrderForm((current) => ({
                              ...current,
                              dropoffAddress: event.target.value,
                            }))
                          }
                        />
                        <textarea
                          rows={2}
                          placeholder={t("callcenter.opsNotePlaceholder")}
                          value={orderForm.notes}
                          onChange={(event) =>
                            setOrderForm((current) => ({
                              ...current,
                              notes: event.target.value,
                            }))
                          }
                        />
                        <button
                          className="btn"
                          type="submit"
                          disabled={
                            busyKey === "create-phone-order" ||
                            bookingLaneLocked
                          }
                        >
                          {t("callcenter.createOrderFromCall")}
                        </button>
                      </form>

                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runAction("link-order", async () => {
                            await getOpsClient().linkCallOrder(
                              selectedSession.callId,
                              {
                                orderId: existingOrderId,
                              },
                            );
                            setExistingOrderId("");
                            await loadData(selectedSession.callId);
                          });
                        }}
                      >
                        <h4>{t("callcenter.bindExistingOrder")}</h4>
                        <p className="panel-note">
                          {selectedSessionHasOrder
                            ? locale === "en"
                              ? "Use dispatch for the linked order instead of re-binding this call."
                              : "這筆通話已綁定訂單，請改到 dispatch workspace 處理。"
                            : selectedSessionHasComplaint
                              ? locale === "en"
                                ? "Complaint handoff is already active for this session."
                                : "這筆 session 已進入客訴 handoff。"
                              : locale === "en"
                                ? "Use this only when the passenger already has an order ID."
                                : "僅在乘客已持有既有訂單編號時使用。"}
                        </p>
                        <input
                          type="text"
                          placeholder={t(
                            "callcenter.existingOrderIdPlaceholder",
                          )}
                          required
                          value={existingOrderId}
                          onChange={(event) =>
                            setExistingOrderId(event.target.value)
                          }
                        />
                        <button
                          className="btn"
                          type="submit"
                          disabled={
                            busyKey === "link-order" || bookingLaneLocked
                          }
                        >
                          {t("callcenter.linkOrderToCall")}
                        </button>
                      </form>

                      <form
                        className="stack-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runAction("transfer-complaint", async () => {
                            await getOpsClient().transferCallToComplaint(
                              selectedSession.callId,
                              {
                                ...transferForm,
                                ...(selectedSession.linkedOrderId ||
                                transferForm.relatedOrderId
                                  ? {
                                      relatedOrderId:
                                        selectedSession.linkedOrderId ??
                                        transferForm.relatedOrderId ??
                                        null,
                                    }
                                  : {}),
                              },
                            );
                            setTransferForm(INITIAL_COMPLAINT_TRANSFER_FORM);
                            await loadData(selectedSession.callId);
                          });
                        }}
                      >
                        <h4>{t("callcenter.transferComplaintForm")}</h4>
                        <p className="panel-note">
                          {selectedSessionHasComplaint
                            ? locale === "en"
                              ? `Complaint ${selectedSession.linkedCaseNo} is already linked to this call.`
                              : `這筆通話已連結客訴 ${selectedSession.linkedCaseNo}。`
                            : selectedSessionNeedsRecordingGate
                              ? locale === "en"
                                ? "Keep the recording evidence gap explicit while escalating to complaint."
                                : "升級客訴時，仍需明確保留錄音證據缺口。"
                              : locale === "en"
                                ? "Use complaint handoff when follow-up becomes remediation instead of dispatch fulfillment."
                                : "若處理結果改為補救而非履約，請從這裡交給客訴。"}
                        </p>
                        <select
                          value={transferForm.category}
                          onChange={(event) =>
                            setTransferForm((current) => ({
                              ...current,
                              category: event.target.value as ComplaintCategory,
                            }))
                          }
                        >
                          {COMPLAINT_CATEGORY_OPTIONS.map((category) => (
                            <option key={category} value={category}>
                              {formatOpsCodeLabel(locale, category)}
                            </option>
                          ))}
                        </select>
                        <select
                          value={transferForm.severity}
                          onChange={(event) =>
                            setTransferForm((current) => ({
                              ...current,
                              severity: event.target
                                .value as TransferCallToComplaintCommand["severity"],
                            }))
                          }
                        >
                          <option value="normal">
                            {formatOpsCodeLabel(locale, "normal")}
                          </option>
                          <option value="high">
                            {formatOpsCodeLabel(locale, "high")}
                          </option>
                        </select>
                        <textarea
                          rows={3}
                          placeholder={t(
                            "callcenter.complaintDescriptionPlaceholder",
                          )}
                          required
                          value={transferForm.description}
                          onChange={(event) =>
                            setTransferForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                        <button
                          className="btn"
                          type="submit"
                          disabled={
                            busyKey === "transfer-complaint" ||
                            selectedSessionHasComplaint
                          }
                        >
                          {t("callcenter.createComplaintCase")}
                        </button>
                        {selectedSession.linkedCaseNo && (
                          <Link
                            className="btn"
                            href={`/complaints/${encodeURIComponent(
                              selectedSession.linkedCaseNo,
                            )}`}
                          >
                            {locale === "en"
                              ? "Open linked complaint"
                              : "開啟已連結客訴"}
                          </Link>
                        )}
                      </form>
                    </div>
                  </section>

                  <section className="detail-card">
                    <h4>{t("callcenter.linkedOrderTrace")}</h4>
                    {selectedOrder ? (
                      <div className="stack">
                        <div className="detail-grid">
                          <div>
                            <span className="label">
                              {t("callcenter.detail.order")}
                            </span>
                            <strong>{selectedOrder.orderNo}</strong>
                            <small>{selectedOrder.orderId}</small>
                          </div>
                          <div>
                            <span className="label">
                              {t("callcenter.detail.status")}
                            </span>
                            <strong>
                              {formatOpsCodeLabel(locale, selectedOrder.status)}
                            </strong>
                            <small>
                              ETA{" "}
                              {selectedOrder.etaSnapshot
                                ? t("callcenter.detail.etaMin", {
                                    value: selectedOrder.etaSnapshot.etaMinutes,
                                  })
                                : t("callcenter.detail.etaPending")}
                            </small>
                          </div>
                          <div>
                            <span className="label">
                              {t("callcenter.detail.pickup")}
                            </span>
                            <strong>{selectedOrder.pickup.address}</strong>
                            <small>{selectedOrder.dropoff.address}</small>
                          </div>
                          <div>
                            <span className="label">
                              {t("callcenter.detail.compliance")}
                            </span>
                            <strong>
                              {formatOpsCodeList(
                                locale,
                                selectedOrder.complianceFlags,
                              )}
                            </strong>
                            <small>{selectedOrder.recordingId ?? "-"}</small>
                          </div>
                        </div>
                        {selectedOrder.exceptionHold && (
                          <div className="detail-card nested-detail-card">
                            <div className="panel-head">
                              <div>
                                <h4>{t("callcenter.detail.exceptionHold")}</h4>
                                <p className="panel-note">
                                  {t("callcenter.detail.exceptionReason", {
                                    reason: formatOpsCodeLabel(
                                      locale,
                                      selectedOrder.exceptionHold.reasonCode,
                                    ),
                                  })}
                                </p>
                              </div>
                              {selectedOrder.exceptionHold.overrideRequest && (
                                <span
                                  className={getOverrideStatusTone(
                                    selectedOrder.exceptionHold.overrideRequest
                                      .status,
                                  )}
                                >
                                  {formatOpsCodeLabel(
                                    locale,
                                    selectedOrder.exceptionHold.overrideRequest
                                      .status,
                                  )}
                                </span>
                              )}
                            </div>
                            <div className="detail-grid">
                              <div>
                                <span className="label">
                                  {t("callcenter.detail.overrideActors")}
                                </span>
                                <strong>
                                  {selectedOrder.exceptionHold.overrideActors
                                    .map((actor) =>
                                      formatOpsCodeLabel(locale, actor),
                                    )
                                    .join(", ") || "-"}
                                </strong>
                                <small>
                                  {t("callcenter.detail.exceptionRaisedAt", {
                                    value: formatDateTime(
                                      selectedOrder.exceptionHold.raisedAt,
                                    ),
                                  })}
                                </small>
                              </div>
                              <div>
                                <span className="label">
                                  {t("callcenter.detail.overrideType")}
                                </span>
                                <strong>
                                  {selectedOrder.exceptionHold.overrideRequest
                                    ? formatOpsCodeLabel(
                                        locale,
                                        selectedOrder.exceptionHold
                                          .overrideRequest.overrideType,
                                      )
                                    : "-"}
                                </strong>
                                <small>
                                  {selectedOrder.exceptionHold.overrideRequest
                                    ? t(
                                        "callcenter.detail.overrideRequestedBy",
                                        {
                                          actor:
                                            selectedOrder.exceptionHold
                                              .overrideRequest.requestedBy
                                              .actorId,
                                        },
                                      )
                                    : t(
                                        "callcenter.detail.noOverrideRequested",
                                      )}
                                </small>
                              </div>
                              <div>
                                <span className="label">
                                  {t("callcenter.detail.overrideDecision")}
                                </span>
                                <strong>
                                  {selectedOrder.exceptionHold.overrideRequest
                                    ?.approval
                                    ? t("callcenter.detail.overrideApproved")
                                    : selectedOrder.exceptionHold
                                          .overrideRequest?.rejection
                                      ? t("callcenter.detail.overrideRejected")
                                      : selectedOrder.exceptionHold
                                            .overrideRequest?.expiredAt
                                        ? t("callcenter.detail.overrideExpired")
                                        : "-"}
                                </strong>
                                <small>
                                  {selectedOrder.exceptionHold.overrideRequest
                                    ?.approval
                                    ? t(
                                        "callcenter.detail.overrideApprovedBy",
                                        {
                                          actor:
                                            selectedOrder.exceptionHold
                                              .overrideRequest.approval.actorId,
                                        },
                                      )
                                    : selectedOrder.exceptionHold
                                          .overrideRequest?.rejection
                                      ? t(
                                          "callcenter.detail.overrideRejectedBy",
                                          {
                                            actor:
                                              selectedOrder.exceptionHold
                                                .overrideRequest.rejection
                                                .actorId,
                                          },
                                        )
                                      : selectedOrder.exceptionHold
                                            .overrideRequest?.expiredAt
                                        ? t(
                                            "callcenter.detail.overrideExpiredAt",
                                            {
                                              value: formatDateTime(
                                                selectedOrder.exceptionHold
                                                  .overrideRequest.expiredAt,
                                              ),
                                            },
                                          )
                                        : t(
                                            "callcenter.detail.overrideAwaitingApproval",
                                          )}
                                </small>
                              </div>
                              <div>
                                <span className="label">
                                  {t("callcenter.detail.lastResolution")}
                                </span>
                                <strong>
                                  {selectedOrder.exceptionHold.resolution
                                    ? formatOpsCodeLabel(
                                        locale,
                                        selectedOrder.exceptionHold.resolution
                                          .resolution,
                                      )
                                    : "-"}
                                </strong>
                                <small>
                                  {selectedOrder.exceptionHold.resolution
                                    ? t(
                                        "callcenter.detail.resolutionActorReason",
                                        {
                                          actor:
                                            selectedOrder.exceptionHold
                                              .resolution.actorId,
                                          reason:
                                            selectedOrder.exceptionHold
                                              .resolution.reason,
                                        },
                                      )
                                    : t(
                                        "callcenter.detail.noResolutionRecorded",
                                      )}
                                </small>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="toolbar">
                          <Link
                            className="btn"
                            href={`/dispatch?orderId=${encodeURIComponent(selectedOrder.orderId)}`}
                          >
                            {t("callcenter.openInDispatch")}
                          </Link>
                        </div>
                        <div className="trace-list">
                          {dispatchTrace.length > 0 ? (
                            dispatchTrace.map((trace) => (
                              <div key={trace.traceId} className="trace-item">
                                <strong>
                                  {formatOpsCodeLabel(locale, trace.eventType)}
                                </strong>
                                <span>{trace.message}</span>
                                <small>{formatDateTime(trace.createdAt)}</small>
                              </div>
                            ))
                          ) : (
                            <p className="empty-state">
                              {t("callcenter.noDispatchTrace")}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="empty-state">
                        {t("callcenter.linkOrderFirst")}
                      </p>
                    )}
                  </section>
                </div>
              ) : (
                <p className="empty-state">{t("callcenter.noSession")}</p>
              )}
            </section>
          </div>
        )}

        <section className="panel">
          <div className="panel-head">
            <h3>{t("callcenter.callbacks")}</h3>
            <p>{t("callcenter.callbackCount", { count: callbacks.length })}</p>
          </div>
          {callbacks.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("callcenter.col.callbackId")}</th>
                    <th>{t("callcenter.col.call")}</th>
                    <th>{t("callcenter.col.status")}</th>
                    <th>{t("callcenter.col.due")}</th>
                    <th>{t("callcenter.col.order")}</th>
                    <th>{t("callcenter.col.case")}</th>
                  </tr>
                </thead>
                <tbody>
                  {callbackQueue.map((callback) => (
                    <tr
                      key={callback.callbackTaskId}
                      className={
                        callback.callId === selectedCallId ? "selected-row" : ""
                      }
                      onClick={() => setSelectedCallId(callback.callId)}
                    >
                      <td>{callback.callbackTaskId}</td>
                      <td>{callback.callId}</td>
                      <td>
                        <span className={getCallbackTone(callback)}>
                          {formatOpsCodeLabel(locale, callback.status)}
                        </span>
                        <div className="cell-subcopy">
                          {getCallbackSummary(callback, locale)}
                        </div>
                      </td>
                      <td>
                        <div>{formatDateTime(callback.dueAt)}</div>
                        <div className="cell-subcopy">
                          {formatRelativeDeadline(callback.dueAt, locale)}
                        </div>
                      </td>
                      <td>{callback.linkedOrderId ?? "-"}</td>
                      <td>
                        {callback.linkedCaseNo ? (
                          <Link
                            className="inline-link"
                            href={`/complaints/${encodeURIComponent(
                              callback.linkedCaseNo,
                            )}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {callback.linkedCaseNo}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{t("callcenter.emptyCallbacks")}</p>
          )}
        </section>

        <Link className="route-link" href="/">
          <strong>{t("callcenter.backToHome")}</strong>{" "}
          {t("callcenter.backToHomeSub")}
        </Link>

        <style jsx>{`
          .summary-grid,
          .workspace-stage-grid,
          .content-grid,
          .detail-subgrid,
          .detail-grid,
          .form-grid {
            display: grid;
            gap: 0.9rem;
          }
          .summary-grid {
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            margin-bottom: 1rem;
          }
          .workspace-stage-grid {
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            margin-bottom: 1rem;
          }
          .summary-card,
          .panel,
          .detail-card,
          .stage-card {
            border: 1px solid #dbe4f0;
            border-radius: 1rem;
            background: #fff;
          }
          .summary-card {
            padding: 0.95rem 1rem;
          }
          .summary-card strong {
            display: block;
            font-size: 1.35rem;
            margin: 0.2rem 0;
          }
          .stage-card {
            padding: 1rem;
            background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
          }
          .stage-card strong {
            display: block;
            margin: 0.3rem 0 0.35rem;
            font-size: 1rem;
          }
          .stage-card p {
            margin: 0;
            color: #475569;
            font-size: 0.92rem;
          }
          .stage-locked {
            border-color: #f59e0b;
            background: linear-gradient(180deg, #fff7ed 0%, #ffffff 100%);
          }
          .stage-warning {
            border-color: #fbbf24;
          }
          .stage-danger {
            border-color: #f87171;
            background: linear-gradient(180deg, #fef2f2 0%, #ffffff 100%);
          }
          .stage-eyebrow {
            color: #64748b;
            font-size: 0.78rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          .toolbar,
          .action-row {
            display: flex;
            gap: 0.75rem;
            flex-wrap: wrap;
            align-items: center;
          }
          .toolbar {
            margin-bottom: 1rem;
          }
          .state-chip {
            display: inline-flex;
            align-items: center;
            width: fit-content;
            margin-bottom: 0.35rem;
            padding: 0.18rem 0.55rem;
            border-radius: 999px;
            font-size: 0.78rem;
            font-weight: 600;
          }
          .state-ready {
            background: #dcfce7;
            color: #166534;
          }
          .state-pending {
            background: #fef3c7;
            color: #92400e;
          }
          .state-missing {
            background: #fee2e2;
            color: #b91c1c;
          }
          .queue-badge {
            display: inline-flex;
            align-items: center;
            width: fit-content;
            padding: 0.18rem 0.55rem;
            border-radius: 999px;
            font-size: 0.78rem;
            font-weight: 600;
          }
          .badge-positive {
            background: #dcfce7;
            color: #166534;
          }
          .badge-warning {
            background: #fef3c7;
            color: #92400e;
          }
          .badge-danger {
            background: #fee2e2;
            color: #b91c1c;
          }
          .assumption-panel {
            border: 1px solid #cbd5e1;
            border-radius: 1rem;
            background: #f8fafc;
            padding: 0.95rem 1rem;
            margin-bottom: 1rem;
          }
          .assumption-list {
            margin: 0.55rem 0 0;
            padding-left: 1.15rem;
            color: #334155;
            display: grid;
            gap: 0.4rem;
          }
          .search-input,
          input,
          select,
          textarea {
            width: 100%;
            border: 1px solid #cbd5e1;
            border-radius: 0.85rem;
            padding: 0.7rem 0.8rem;
            font: inherit;
            background: #fff;
          }
          .btn {
            border: 1px solid #cbd5e1;
            border-radius: 999px;
            padding: 0.65rem 1rem;
            background: #fff;
            cursor: pointer;
          }
          .btn-primary {
            border-color: #0f766e;
            background: #0f766e;
            color: #fff;
          }
          .content-grid {
            grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
            margin-top: 1rem;
            margin-bottom: 1rem;
          }
          .panel,
          .detail-card {
            padding: 1rem;
          }
          .panel-head {
            display: flex;
            justify-content: space-between;
            gap: 0.75rem;
            align-items: baseline;
            margin-bottom: 0.8rem;
          }
          .panel-note {
            margin: 0.2rem 0 0;
            color: #64748b;
            font-size: 0.92rem;
          }
          .cell-subcopy {
            color: #64748b;
            font-size: 0.82rem;
            margin-top: 0.2rem;
          }
          .inline-link {
            color: #0f766e;
            text-decoration: none;
            font-weight: 600;
          }
          .table-wrap {
            overflow-x: auto;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th,
          td {
            text-align: left;
            padding: 0.75rem 0.65rem;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
          }
          tbody tr {
            cursor: pointer;
          }
          .selected-row {
            background: #ecfeff;
          }
          .details-stack,
          .trace-list,
          .stack,
          .stack-form {
            display: grid;
            gap: 0.8rem;
          }
          .detail-grid {
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          }
          .detail-subgrid {
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          }
          .nested-detail-card {
            margin-top: 0.25rem;
            border-style: dashed;
            background: #fffbeb;
          }
          .label {
            display: block;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #64748b;
            margin-bottom: 0.25rem;
          }
          .trace-item {
            border-left: 3px solid #0f766e;
            padding-left: 0.75rem;
          }
          .checkbox {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          .checkbox input {
            width: auto;
          }
          .empty-state {
            color: #64748b;
          }
          @media (max-width: 960px) {
            .content-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    </>
  );
}

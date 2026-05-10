"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  CalloutBanner,
  DataFilterBar,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  type ManagementTone,
} from "@drts/ui-web";
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

type CallcenterTab = "sessions" | "callbacks" | "recordings";
type CallbackFilter = "all" | "pending" | "overdue" | "completed";
type RecordingFilter = "all" | "ready" | "pending" | "missing";

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

function getRecordingStateTone(
  recordingState: CallRecordingState,
): ManagementTone {
  switch (recordingState) {
    case "ready":
      return "success";
    case "missing":
      return "danger";
    case "pending":
    default:
      return "warning";
  }
}

function getOverrideStatusTone(status: string): ManagementTone {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "expired":
      return "warning";
    case "pending_approval":
    default:
      return "warning";
  }
}

function getSessionStatusTone(
  status: CallSessionRecord["status"],
): ManagementTone {
  switch (status) {
    case "active":
      return "success";
    case "closed":
      return "neutral";
    default:
      return "info";
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

function getCallbackTone(callback: CallbackTaskRecord): ManagementTone {
  if (callback.status === "completed") {
    return "success";
  }
  if (new Date(callback.dueAt).getTime() < Date.now()) {
    return "danger";
  }
  return "warning";
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

const surfacePanelStyle: CSSProperties = {
  border: "1px solid #dbe2ea",
  borderRadius: "14px",
  background: "#f8fafc",
  padding: "14px 16px",
  display: "grid",
  gap: "10px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  padding: "8px 12px",
  fontSize: "13px",
  background: "#ffffff",
  color: "#0f172a",
};

const buttonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  padding: "8px 14px",
  borderRadius: "999px",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: "12.5px",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  border: "1px solid #0f766e",
  background: "#0f766e",
  color: "#ffffff",
};

const dangerButtonStyle: CSSProperties = {
  ...buttonStyle,
  border: "1px solid #b91c1c",
  background: "#b91c1c",
  color: "#ffffff",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "12.5px",
};

const tableHeadCellStyle: CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontSize: "10.5px",
  color: "#64748b",
  background: "#f8fafc",
};

const tableBodyCellStyle: CSSProperties = {
  padding: "12px",
  color: "#0f172a",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
};

const monoStyle: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
  fontSize: "12px",
  fontWeight: 600,
  color: "#475569",
};

const formStackStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
};

function StageCard({
  title,
  state,
  tone,
  note,
}: {
  title: string;
  state: ReactNode;
  tone: ManagementTone;
  note: ReactNode;
}) {
  const accent =
    tone === "danger"
      ? "#fecaca"
      : tone === "warning"
        ? "#fcd34d"
        : tone === "success"
          ? "#bbf7d0"
          : "#dbe2ea";

  return (
    <article
      style={{
        border: `1px solid ${accent}`,
        borderRadius: "14px",
        background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
        padding: "14px 16px",
        display: "grid",
        gap: "8px",
      }}
    >
      <span
        style={{
          fontSize: "11px",
          fontWeight: 700,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {title}
      </span>
      <strong style={{ color: "#0f172a", fontSize: "14px" }}>{state}</strong>
      <span style={{ color: "#475569", fontSize: "12.5px", lineHeight: 1.5 }}>
        {note}
      </span>
    </article>
  );
}

export default function CallcenterPage() {
  const { t, locale } = useTranslation();
  const resolveErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : t("common.unknown");
  const [activeTab, setActiveTab] = useState<CallcenterTab>("sessions");
  const [callbackFilter, setCallbackFilter] = useState<CallbackFilter>("all");
  const [recordingFilter, setRecordingFilter] =
    useState<RecordingFilter>("all");
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
  const recordingMissing = sessions.filter(
    (session) => session.recordingState === "missing",
  ).length;
  const recordingReady = sessions.filter(
    (session) => session.recordingState === "ready",
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
  );
  const completedCallbacks = callbackQueue.filter(
    (callback) => callback.status === "completed",
  );
  const callbackFilteredRows = callbackQueue.filter((callback) => {
    if (callbackFilter === "all") {
      return true;
    }
    if (callbackFilter === "pending") {
      return callback.status === "pending";
    }
    if (callbackFilter === "completed") {
      return callback.status === "completed";
    }
    return (
      callback.status === "pending" &&
      new Date(callback.dueAt).getTime() < Date.now()
    );
  });
  const recordingFilteredSessions = sortedSessions.filter((session) => {
    if (recordingFilter === "all") {
      return true;
    }
    return session.recordingState === recordingFilter;
  });
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

  const tabFilters: { value: CallcenterTab; label: string; count: number }[] = [
    {
      value: "sessions",
      label: locale === "en" ? "Sessions" : "Sessions",
      count: openSessions,
    },
    {
      value: "callbacks",
      label: locale === "en" ? "Callback queue" : "Callback queue",
      count: pendingCallbacks.length,
    },
    {
      value: "recordings",
      label: locale === "en" ? "Recordings" : "Recordings",
      count: recordingPending + recordingMissing,
    },
  ];

  const callbackFilterOptions: {
    value: CallbackFilter;
    label: string;
    count: number;
    tone?: ManagementTone;
  }[] = [
    {
      value: "all",
      label: locale === "en" ? "All" : "全部",
      count: callbackQueue.length,
    },
    {
      value: "pending",
      label: locale === "en" ? "Pending" : "待回應",
      count: pendingCallbacks.length,
      tone: "warning",
    },
    {
      value: "overdue",
      label: locale === "en" ? "Overdue" : "已逾期",
      count: overdueCallbacks.length,
      tone: "danger",
    },
    {
      value: "completed",
      label: locale === "en" ? "Completed" : "已完成",
      count: completedCallbacks.length,
      tone: "success",
    },
  ];

  const recordingFilterOptions: {
    value: RecordingFilter;
    label: string;
    count: number;
    tone?: ManagementTone;
  }[] = [
    {
      value: "all",
      label: locale === "en" ? "All" : "全部",
      count: sortedSessions.length,
    },
    {
      value: "ready",
      label: locale === "en" ? "Ready" : "已就緒",
      count: recordingReady,
      tone: "success",
    },
    {
      value: "pending",
      label: locale === "en" ? "Pending" : "待補",
      count: recordingPending,
      tone: "warning",
    },
    {
      value: "missing",
      label: locale === "en" ? "Missing" : "缺失",
      count: recordingMissing,
      tone: "danger",
    },
  ];

  const sessionGuardrails = [
    t("callcenter.integrationAssumption.screenPop"),
    t("callcenter.integrationAssumption.recording"),
    t("callcenter.integrationAssumption.storage"),
    locale === "en"
      ? "Complaint handoff stays separate from phone-order creation and should only occur when the case context is captured."
      : "客訴 handoff 與電話訂車必須分流，只有在案件脈絡已記錄後才應升級。",
  ];

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <PageHeader
        eyebrow={locale === "en" ? "Callcenter" : "客服中心"}
        title={t("callcenter.title")}
        subtitle={t("callcenter.subtitle")}
        meta={[
          {
            label: locale === "en" ? "Open sessions" : "進行中",
            value: openSessions,
            tone: openSessions > 0 ? "success" : "neutral",
          },
          {
            label: locale === "en" ? "Pending callbacks" : "Callback 待回應",
            value: pendingCallbacks.length,
            tone:
              overdueCallbacks.length > 0
                ? "danger"
                : pendingCallbacks.length > 0
                  ? "warning"
                  : "neutral",
          },
          {
            label: locale === "en" ? "Recording gate" : "錄音門檻",
            value: recordingPending + recordingMissing,
            tone: recordingMissing > 0 ? "danger" : "warning",
          },
        ]}
        actions={
          <>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => setShowIntake((current) => !current)}
            >
              {showIntake
                ? t("callcenter.hideIntake")
                : t("callcenter.openIntake")}
            </button>
            <button
              type="button"
              style={primaryButtonStyle}
              onClick={() => void loadData(selectedCallId ?? undefined)}
            >
              {t("common.refresh")}
            </button>
          </>
        }
      />

      <DataFilterBar
        value={activeTab}
        filters={tabFilters.map((tab) => ({
          value: tab.value,
          label: tab.label,
          count: tab.count,
        }))}
        onChange={setActiveTab}
        ariaLabel={locale === "en" ? "Callcenter sections" : "客服分頁"}
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={getOpsLabel(locale, "error")}
          description={error}
        />
      ) : null}

      <KpiRow minWidth="180px">
        <KpiCard
          label={t("callcenter.openSessions")}
          value={openSessions}
          detail={t("callcenter.openSessionsSub")}
          tone={openSessions > 0 ? "ops" : "neutral"}
        />
        <KpiCard
          label={t("callcenter.linkedOrders")}
          value={bookingLinked}
          detail={t("callcenter.linkedOrdersSub")}
          tone="info"
        />
        <KpiCard
          label={t("callcenter.recordingPending")}
          value={recordingPending + recordingMissing}
          detail={t("callcenter.recordingPendingSub")}
          tone={recordingMissing > 0 ? "danger" : "warning"}
        />
        <KpiCard
          label={t("callcenter.hotlineTransfers")}
          value={hotlineTransfers}
          detail={t("callcenter.hotlineTransfersSub")}
          tone={hotlineTransfers > 0 ? "warning" : "neutral"}
        />
      </KpiRow>

      {showIntake ? (
        <DataViewCard
          title={t("callcenter.newIntake")}
          subtitle={t("callcenter.intakeNote")}
          tone="ops"
        >
          <form
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
              alignItems: "end",
            }}
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
            <label style={labelStyle}>
              {t("callcenter.form.callType")}
              <select
                style={inputStyle}
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
            <label style={labelStyle}>
              {t("callcenter.form.callerPhone")}
              <input
                style={inputStyle}
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
            <label style={labelStyle}>
              {t("callcenter.form.agentId")}
              <input
                style={inputStyle}
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
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "12.5px",
                color: "#475569",
              }}
            >
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
              style={primaryButtonStyle}
              type="submit"
              disabled={busyKey === "open-intake"}
            >
              {busyKey === "open-intake"
                ? t("callcenter.form.opening")
                : t("callcenter.form.openSession")}
            </button>
          </form>
        </DataViewCard>
      ) : null}

      {activeTab === "sessions" ? (
        <SessionsTab
          locale={locale}
          loading={loading}
          query={query}
          setQuery={setQuery}
          searchPlaceholder={t("callcenter.search")}
          sortedSessions={sortedSessions}
          filteredSessionsCount={filteredSessions.length}
          selectedCallId={selectedCallId}
          setSelectedCallId={setSelectedCallId}
          selectedSession={selectedSession}
          selectedOrder={selectedOrder}
          dispatchTrace={dispatchTrace}
          loadingLabel={t("callcenter.loading")}
          resultsLabel={t("callcenter.results", {
            count: filteredSessions.length,
          })}
          sessionsTitle={t("callcenter.sessions")}
          sessionDetailTitle={t("callcenter.sessionDetail")}
          selectSessionLabel={t("callcenter.selectSession")}
          noSessionLabel={t("callcenter.noSession")}
          intakeForm={intakeForm}
          recordingForm={recordingForm}
          setRecordingForm={setRecordingForm}
          quotedEtaMinutes={quotedEtaMinutes}
          setQuotedEtaMinutes={setQuotedEtaMinutes}
          orderForm={orderForm}
          setOrderForm={setOrderForm}
          existingOrderId={existingOrderId}
          setExistingOrderId={setExistingOrderId}
          callbackDueAt={callbackDueAt}
          setCallbackDueAt={setCallbackDueAt}
          callbackNote={callbackNote}
          setCallbackNote={setCallbackNote}
          callbackCompleteNote={callbackCompleteNote}
          setCallbackCompleteNote={setCallbackCompleteNote}
          transferForm={transferForm}
          setTransferForm={setTransferForm}
          busyKey={busyKey}
          runAction={runAction}
          loadData={loadData}
          translateLabel={t}
          bookingLaneNote={bookingLaneNote}
          bookingLaneLocked={bookingLaneLocked}
          selectedSessionHasOrder={selectedSessionHasOrder}
          selectedSessionHasComplaint={selectedSessionHasComplaint}
          selectedSessionNeedsRecordingGate={
            selectedSessionNeedsRecordingGate ?? false
          }
        />
      ) : null}

      {activeTab === "callbacks" ? (
        <DataViewCard
          title={t("callcenter.callbacks")}
          subtitle={t("callcenter.callbackCount", { count: callbacks.length })}
          tone="warning"
          filters={
            <DataFilterBar
              value={callbackFilter}
              filters={callbackFilterOptions}
              onChange={setCallbackFilter}
              ariaLabel={
                locale === "en"
                  ? "Callback queue filters"
                  : "Callback queue 篩選"
              }
            />
          }
        >
          {callbackFilteredRows.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeadCellStyle}>
                      {t("callcenter.col.callbackId")}
                    </th>
                    <th style={tableHeadCellStyle}>
                      {t("callcenter.col.call")}
                    </th>
                    <th style={tableHeadCellStyle}>
                      {t("callcenter.col.status")}
                    </th>
                    <th style={tableHeadCellStyle}>
                      {t("callcenter.col.due")}
                    </th>
                    <th style={tableHeadCellStyle}>
                      {t("callcenter.col.order")}
                    </th>
                    <th style={tableHeadCellStyle}>
                      {t("callcenter.col.case")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {callbackFilteredRows.map((callback) => (
                    <tr
                      key={callback.callbackTaskId}
                      onClick={() => {
                        setSelectedCallId(callback.callId);
                        setActiveTab("sessions");
                      }}
                      style={{
                        cursor: "pointer",
                        background:
                          callback.callId === selectedCallId
                            ? "#ecfeff"
                            : "transparent",
                      }}
                    >
                      <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                        {callback.callbackTaskId}
                      </td>
                      <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                        {callback.callId}
                      </td>
                      <td style={tableBodyCellStyle}>
                        <StatusChip
                          label={formatOpsCodeLabel(locale, callback.status)}
                          tone={getCallbackTone(callback)}
                        />
                        <div
                          style={{
                            color: "#64748b",
                            fontSize: "11.5px",
                            marginTop: "4px",
                          }}
                        >
                          {getCallbackSummary(callback, locale)}
                        </div>
                      </td>
                      <td style={tableBodyCellStyle}>
                        <div>{formatDateTime(callback.dueAt)}</div>
                        <div style={{ color: "#64748b", fontSize: "11.5px" }}>
                          {formatRelativeDeadline(callback.dueAt, locale)}
                        </div>
                      </td>
                      <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                        {callback.linkedOrderId ?? "-"}
                      </td>
                      <td style={tableBodyCellStyle}>
                        {callback.linkedCaseNo ? (
                          <Link
                            href={`/complaints?caseNo=${encodeURIComponent(
                              callback.linkedCaseNo,
                            )}`}
                            onClick={(event) => event.stopPropagation()}
                            style={{
                              color: "#0f766e",
                              textDecoration: "none",
                              fontWeight: 600,
                            }}
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
            <div
              style={{
                padding: "18px 20px",
                borderRadius: "14px",
                border: "1px dashed #cbd5e1",
                background: "#f8fafc",
                color: "#64748b",
                fontSize: "13px",
              }}
            >
              {t("callcenter.emptyCallbacks")}
            </div>
          )}
        </DataViewCard>
      ) : null}

      {activeTab === "recordings" ? (
        <RecordingsTab
          locale={locale}
          sessions={recordingFilteredSessions}
          recordingFilter={recordingFilter}
          setRecordingFilter={setRecordingFilter}
          recordingFilterOptions={recordingFilterOptions}
          selectedCallId={selectedCallId}
          setSelectedCallId={setSelectedCallId}
          setActiveTab={setActiveTab}
          translateLabel={t}
          recordingForm={recordingForm}
          setRecordingForm={setRecordingForm}
          busyKey={busyKey}
          runAction={runAction}
          loadData={loadData}
          intakeAgentId={intakeForm.agentId}
          selectedSession={selectedSession}
        />
      ) : null}

      <DataViewCard
        title={locale === "en" ? "Workspace stages" : "Session workspace 狀態"}
        subtitle={
          locale === "en"
            ? "Booking, callback, and complaint lanes share the same call session — keep recording evidence visible while every lane progresses."
            : "Booking、callback、客訴必須在同一通電話的 workspace 內推進，錄音證據缺口需保留可見。"
        }
        tone="ops"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
          }}
        >
          <StageCard
            title={locale === "en" ? "Booking lane" : "Booking 流程"}
            tone={bookingLaneLocked ? "warning" : "info"}
            state={
              bookingLaneLocked
                ? locale === "en"
                  ? "Locked"
                  : "已鎖定"
                : locale === "en"
                  ? "Ready"
                  : "可執行"
            }
            note={bookingLaneNote}
          />
          <StageCard
            title={locale === "en" ? "Callback lane" : "Callback 流程"}
            tone={
              selectedCallbackIsOverdue
                ? "danger"
                : selectedCallbackIsPending
                  ? "warning"
                  : "neutral"
            }
            state={callbackLaneStatus}
            note={
              !selectedSession
                ? locale === "en"
                  ? "Callback tasks stay visible from the same workspace while recording evidence is pending."
                  : "錄音證據待補期間，callback 任務必須持續留在同一個 workspace。"
                : selectedCallback
                  ? `${formatDateTime(selectedCallback.dueAt)} · ${getCallbackSummary(selectedCallback, locale)}`
                  : locale === "en"
                    ? "Queue a callback here when the passenger needs follow-up outside the active call."
                    : "若乘客需要稍後跟進，可直接從這裡建立 callback。"
            }
          />
          <StageCard
            title={locale === "en" ? "Complaint lane" : "客訴流程"}
            tone={
              selectedSessionHasComplaint ||
              selectedSession?.recordingState === "missing"
                ? "warning"
                : "neutral"
            }
            state={complaintLaneStatus}
            note={
              selectedSessionHasComplaint
                ? locale === "en"
                  ? "Complaint escalation stays separate from booking creation and remains traceable from this call session."
                  : "客訴升級與 booking 建立必須分流，但仍需保留這筆 call session 的追蹤。"
                : locale === "en"
                  ? "Use complaint handoff when the outcome becomes remediation instead of transport fulfillment."
                  : "當處理結果轉為補救而非履約時，請走 complaint handoff。"
            }
          />
        </div>
        <div
          style={{
            color: "#475569",
            fontSize: "12.5px",
            display: "grid",
            gap: "6px",
          }}
        >
          <strong style={{ color: "#0f172a" }}>
            {locale === "en"
              ? "Authority and integration guardrails"
              : "權限與整合 guardrails"}
          </strong>
          <ul
            style={{
              margin: 0,
              paddingLeft: "16px",
              display: "grid",
              gap: "4px",
            }}
          >
            {sessionGuardrails.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </DataViewCard>

      <Link
        href="/"
        style={{
          color: "#0f766e",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        <strong>{t("callcenter.backToHome")}</strong>{" "}
        <span style={{ color: "#475569", fontWeight: 400 }}>
          {t("callcenter.backToHomeSub")}
        </span>
      </Link>
    </div>
  );
}

type Translator = ReturnType<typeof useTranslation>["t"];

function SessionsTab({
  locale,
  loading,
  query,
  setQuery,
  searchPlaceholder,
  sortedSessions,
  filteredSessionsCount,
  selectedCallId,
  setSelectedCallId,
  selectedSession,
  selectedOrder,
  dispatchTrace,
  loadingLabel,
  resultsLabel,
  sessionsTitle,
  sessionDetailTitle,
  selectSessionLabel,
  noSessionLabel,
  intakeForm,
  recordingForm,
  setRecordingForm,
  quotedEtaMinutes,
  setQuotedEtaMinutes,
  orderForm,
  setOrderForm,
  existingOrderId,
  setExistingOrderId,
  callbackDueAt,
  setCallbackDueAt,
  callbackNote,
  setCallbackNote,
  callbackCompleteNote,
  setCallbackCompleteNote,
  transferForm,
  setTransferForm,
  busyKey,
  runAction,
  loadData,
  translateLabel,
  bookingLaneNote,
  bookingLaneLocked,
  selectedSessionHasOrder,
  selectedSessionHasComplaint,
  selectedSessionNeedsRecordingGate,
}: {
  locale: "en" | "zh";
  loading: boolean;
  query: string;
  setQuery: (value: string) => void;
  searchPlaceholder: string;
  sortedSessions: CallSessionRecord[];
  filteredSessionsCount: number;
  selectedCallId: string | null;
  setSelectedCallId: (value: string | null) => void;
  selectedSession: CallSessionRecord | null;
  selectedOrder: OwnedOrderRecord | null;
  dispatchTrace: DispatchTraceLogRecord[];
  loadingLabel: string;
  resultsLabel: string;
  sessionsTitle: string;
  sessionDetailTitle: string;
  selectSessionLabel: string;
  noSessionLabel: string;
  intakeForm: OpenCallSessionCommand;
  recordingForm: RecordingFormState;
  setRecordingForm: (
    updater: (current: RecordingFormState) => RecordingFormState,
  ) => void;
  quotedEtaMinutes: string;
  setQuotedEtaMinutes: (value: string) => void;
  orderForm: typeof INITIAL_ORDER_FORM;
  setOrderForm: (
    updater: (current: typeof INITIAL_ORDER_FORM) => typeof INITIAL_ORDER_FORM,
  ) => void;
  existingOrderId: string;
  setExistingOrderId: (value: string) => void;
  callbackDueAt: string;
  setCallbackDueAt: (value: string) => void;
  callbackNote: string;
  setCallbackNote: (value: string) => void;
  callbackCompleteNote: string;
  setCallbackCompleteNote: (value: string) => void;
  transferForm: TransferCallToComplaintCommand;
  setTransferForm: (
    updater: (
      current: TransferCallToComplaintCommand,
    ) => TransferCallToComplaintCommand,
  ) => void;
  busyKey: string | null;
  runAction: (key: string, action: () => Promise<void>) => Promise<void>;
  loadData: (preferredCallId?: string) => Promise<void>;
  translateLabel: Translator;
  bookingLaneNote: string;
  bookingLaneLocked: boolean;
  selectedSessionHasOrder: boolean;
  selectedSessionHasComplaint: boolean;
  selectedSessionNeedsRecordingGate: boolean;
}) {
  const t = translateLabel;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 1.4fr)",
        gap: "16px",
        alignItems: "start",
      }}
    >
      <DataViewCard
        title={sessionsTitle}
        subtitle={resultsLabel}
        tone="ops"
        filters={
          <input
            type="search"
            style={inputStyle}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        }
      >
        {loading ? (
          <p style={{ color: "#64748b" }}>{loadingLabel}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeadCellStyle}>{t("callcenter.col.call")}</th>
                  <th style={tableHeadCellStyle}>{t("callcenter.col.type")}</th>
                  <th style={tableHeadCellStyle}>
                    {t("callcenter.col.caller")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("callcenter.col.agent")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("callcenter.col.status")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("callcenter.col.recordingState")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("callcenter.col.order")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("callcenter.col.complaint")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("callcenter.col.started")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSessions.map((session) => (
                  <tr
                    key={session.callId}
                    onClick={() => setSelectedCallId(session.callId)}
                    style={{
                      cursor: "pointer",
                      background:
                        session.callId === selectedCallId
                          ? "#ecfeff"
                          : "transparent",
                    }}
                  >
                    <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                      {session.callId}
                    </td>
                    <td style={tableBodyCellStyle}>
                      {formatOpsCodeLabel(locale, session.callType)}
                    </td>
                    <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                      {session.callerPhone}
                    </td>
                    <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                      {session.agentId ?? "-"}
                    </td>
                    <td style={tableBodyCellStyle}>
                      <StatusChip
                        label={formatOpsCodeLabel(locale, session.status)}
                        tone={getSessionStatusTone(session.status)}
                      />
                    </td>
                    <td style={tableBodyCellStyle}>
                      <StatusChip
                        label={t(
                          `callcenter.recordingState.${session.recordingState}`,
                        )}
                        tone={getRecordingStateTone(session.recordingState)}
                      />
                    </td>
                    <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                      {session.linkedOrderId ?? "-"}
                    </td>
                    <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                      {session.linkedCaseNo ?? "-"}
                    </td>
                    <td style={tableBodyCellStyle}>
                      {formatDateTime(session.startedAt)}
                    </td>
                  </tr>
                ))}
                {filteredSessionsCount === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      style={{
                        ...tableBodyCellStyle,
                        textAlign: "center",
                        color: "#64748b",
                      }}
                    >
                      {t("callcenter.empty")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </DataViewCard>

      <DataViewCard
        title={sessionDetailTitle}
        subtitle={
          selectedSession
            ? `${selectedSession.callId} · ${formatOpsCodeLabel(
                locale,
                selectedSession.callType,
              )}`
            : selectSessionLabel
        }
        tone="ops"
        actions={
          selectedSession ? (
            <>
              {!selectedSession.agentIdentityAnnounced ? (
                <button
                  type="button"
                  style={buttonStyle}
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
              ) : null}
              {selectedSession.status !== "closed" ? (
                <button
                  type="button"
                  style={dangerButtonStyle}
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
              ) : null}
            </>
          ) : null
        }
      >
        {selectedSession ? (
          <div style={{ display: "grid", gap: "14px" }}>
            <div style={surfacePanelStyle}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "12px",
                }}
              >
                <DetailEntry
                  label={locale === "en" ? "Caller / agent" : "來電者 / 客服"}
                  primary={selectedSession.callerPhone}
                  secondary={selectedSession.agentId ?? "-"}
                />
                <DetailEntry
                  label={t("callcenter.detail.identityAnnounced")}
                  primary={
                    selectedSession.agentIdentityAnnounced
                      ? t("common.yes")
                      : t("common.no")
                  }
                  secondary={formatDateTime(
                    selectedSession.agentIdentityAnnouncedAt,
                  )}
                />
                <DetailEntry
                  label={t("callcenter.detail.recording")}
                  primary={
                    <StatusChip
                      label={t(
                        `callcenter.recordingState.${selectedSession.recordingState}`,
                      )}
                      tone={getRecordingStateTone(
                        selectedSession.recordingState,
                      )}
                    />
                  }
                  secondary={
                    selectedSession.recordingId ??
                    (selectedSession.recordingState === "missing"
                      ? t("callcenter.detail.recordingMissing")
                      : t("callcenter.detail.recordingPending"))
                  }
                  tertiary={selectedSession.providerRecordingRef ?? "-"}
                />
                <DetailEntry
                  label={t("callcenter.detail.lastEtaReply")}
                  primary={
                    selectedSession.lastEtaQuotedMinutes
                      ? t("callcenter.detail.etaMin", {
                          value: selectedSession.lastEtaQuotedMinutes,
                        })
                      : t("callcenter.detail.etaNotSent")
                  }
                  secondary={formatDateTime(selectedSession.lastEtaQuotedAt)}
                />
                <DetailEntry
                  label={t("callcenter.detail.flags")}
                  primary={
                    selectedSession.flags.length
                      ? formatOpsCodeList(locale, selectedSession.flags)
                      : "-"
                  }
                  secondary={formatDateTime(selectedSession.endedAt)}
                />
                <DetailEntry
                  label={
                    locale === "en"
                      ? "Order / complaint linkage"
                      : "訂單 / 客訴連結"
                  }
                  primary={
                    selectedSession.linkedOrderId ??
                    selectedSession.linkedCaseNo ??
                    "-"
                  }
                  secondary={
                    selectedSession.linkedOrderId &&
                    selectedSession.linkedCaseNo
                      ? `${selectedSession.linkedOrderId} + ${selectedSession.linkedCaseNo}`
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
                            : "尚未連結下游紀錄"
                  }
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
              }}
            >
              <form
                style={{ ...surfacePanelStyle, ...formStackStyle }}
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
                    setRecordingForm(() => INITIAL_RECORDING_FORM);
                    await loadData(selectedSession.callId);
                  });
                }}
              >
                <strong style={{ color: "#0f172a", fontSize: "13px" }}>
                  {t("callcenter.attachRecordingForm")}
                </strong>
                <input
                  style={inputStyle}
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
                  style={inputStyle}
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
                  style={inputStyle}
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
                  style={buttonStyle}
                  type="submit"
                  disabled={busyKey === "attach-recording"}
                >
                  {t("callcenter.attachRecording")}
                </button>
              </form>

              <form
                style={{ ...surfacePanelStyle, ...formStackStyle }}
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction("quote-eta", async () => {
                    await getOpsClient().quoteCallEta(selectedSession.callId, {
                      etaMinutes: Number(quotedEtaMinutes),
                    });
                    await loadData(selectedSession.callId);
                  });
                }}
              >
                <strong style={{ color: "#0f172a", fontSize: "13px" }}>
                  {t("callcenter.replyEta")}
                </strong>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  required
                  value={quotedEtaMinutes}
                  onChange={(event) => setQuotedEtaMinutes(event.target.value)}
                />
                <button
                  style={buttonStyle}
                  type="submit"
                  disabled={busyKey === "quote-eta"}
                >
                  {t("callcenter.saveEtaReply")}
                </button>
              </form>

              <form
                style={{ ...surfacePanelStyle, ...formStackStyle }}
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
                <strong style={{ color: "#0f172a", fontSize: "13px" }}>
                  {t("callcenter.callbackQueueForm")}
                </strong>
                <input
                  style={inputStyle}
                  type="datetime-local"
                  required
                  value={callbackDueAt}
                  onChange={(event) => setCallbackDueAt(event.target.value)}
                />
                <textarea
                  style={{ ...inputStyle, minHeight: "60px" }}
                  rows={2}
                  placeholder={t("callcenter.callbackNotePlaceholder")}
                  value={callbackNote}
                  onChange={(event) => setCallbackNote(event.target.value)}
                />
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    style={buttonStyle}
                    type="submit"
                    disabled={busyKey === "create-callback"}
                  >
                    {t("callcenter.saveCallback")}
                  </button>
                  {selectedSession.callbackTask?.status === "pending" ? (
                    <>
                      <input
                        style={inputStyle}
                        type="text"
                        placeholder={t("callcenter.completionNotePlaceholder")}
                        value={callbackCompleteNote}
                        onChange={(event) =>
                          setCallbackCompleteNote(event.target.value)
                        }
                      />
                      <button
                        style={buttonStyle}
                        type="button"
                        disabled={busyKey === "complete-callback"}
                        onClick={() =>
                          void runAction("complete-callback", async () => {
                            await getOpsClient().completeCallbackTask(
                              selectedSession.callbackTask!.callbackTaskId,
                              {
                                note: callbackCompleteNote,
                              },
                            );
                            setCallbackCompleteNote("");
                            await loadData(selectedSession.callId);
                          })
                        }
                      >
                        {t("callcenter.completeCallback")}
                      </button>
                    </>
                  ) : null}
                </div>
              </form>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "12px",
              }}
            >
              <form
                style={{ ...surfacePanelStyle, ...formStackStyle }}
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
                        orderForm.passengerPhone || selectedSession.callerPhone,
                    },
                    ...(orderForm.notes.trim()
                      ? { notes: orderForm.notes.trim() }
                      : {}),
                  };
                  void runAction("create-phone-order", async () => {
                    await getOpsClient().createCallCenterOrder(command);
                    setOrderForm(() => INITIAL_ORDER_FORM);
                    await loadData(selectedSession.callId);
                  });
                }}
              >
                <strong style={{ color: "#0f172a", fontSize: "13px" }}>
                  {t("callcenter.createPhoneBooking")}
                </strong>
                <span
                  style={{
                    color: "#64748b",
                    fontSize: "12px",
                    lineHeight: 1.5,
                  }}
                >
                  {bookingLaneNote}
                </span>
                <input
                  style={inputStyle}
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
                  style={inputStyle}
                  type="text"
                  placeholder={t("callcenter.passengerPhonePlaceholder")}
                  value={orderForm.passengerPhone}
                  onChange={(event) =>
                    setOrderForm((current) => ({
                      ...current,
                      passengerPhone: event.target.value,
                    }))
                  }
                />
                <input
                  style={inputStyle}
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
                  style={inputStyle}
                  type="text"
                  placeholder={t("callcenter.dropoffAddressPlaceholder")}
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
                  style={{ ...inputStyle, minHeight: "60px" }}
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
                  style={primaryButtonStyle}
                  type="submit"
                  disabled={
                    busyKey === "create-phone-order" || bookingLaneLocked
                  }
                >
                  {t("callcenter.createOrderFromCall")}
                </button>
              </form>

              <form
                style={{ ...surfacePanelStyle, ...formStackStyle }}
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction("link-order", async () => {
                    await getOpsClient().linkCallOrder(selectedSession.callId, {
                      orderId: existingOrderId,
                    });
                    setExistingOrderId("");
                    await loadData(selectedSession.callId);
                  });
                }}
              >
                <strong style={{ color: "#0f172a", fontSize: "13px" }}>
                  {t("callcenter.bindExistingOrder")}
                </strong>
                <span
                  style={{
                    color: "#64748b",
                    fontSize: "12px",
                    lineHeight: 1.5,
                  }}
                >
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
                </span>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder={t("callcenter.existingOrderIdPlaceholder")}
                  required
                  value={existingOrderId}
                  onChange={(event) => setExistingOrderId(event.target.value)}
                />
                <button
                  style={buttonStyle}
                  type="submit"
                  disabled={busyKey === "link-order" || bookingLaneLocked}
                >
                  {t("callcenter.linkOrderToCall")}
                </button>
              </form>

              <form
                style={{ ...surfacePanelStyle, ...formStackStyle }}
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
                    setTransferForm(() => INITIAL_COMPLAINT_TRANSFER_FORM);
                    await loadData(selectedSession.callId);
                  });
                }}
              >
                <strong style={{ color: "#0f172a", fontSize: "13px" }}>
                  {t("callcenter.transferComplaintForm")}
                </strong>
                <span
                  style={{
                    color: "#64748b",
                    fontSize: "12px",
                    lineHeight: 1.5,
                  }}
                >
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
                </span>
                <select
                  style={inputStyle}
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
                  style={inputStyle}
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
                  style={{ ...inputStyle, minHeight: "72px" }}
                  rows={3}
                  placeholder={t("callcenter.complaintDescriptionPlaceholder")}
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
                  style={buttonStyle}
                  type="submit"
                  disabled={
                    busyKey === "transfer-complaint" ||
                    selectedSessionHasComplaint
                  }
                >
                  {t("callcenter.createComplaintCase")}
                </button>
                {selectedSession.linkedCaseNo ? (
                  <Link
                    href={`/complaints?caseNo=${encodeURIComponent(
                      selectedSession.linkedCaseNo,
                    )}`}
                    style={{ ...buttonStyle, textDecoration: "none" }}
                  >
                    {locale === "en"
                      ? "Open linked complaint"
                      : "開啟已連結客訴"}
                  </Link>
                ) : null}
              </form>
            </div>

            <div style={surfacePanelStyle}>
              <strong style={{ color: "#0f172a", fontSize: "13px" }}>
                {t("callcenter.linkedOrderTrace")}
              </strong>
              {selectedOrder ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <DetailEntry
                      label={t("callcenter.detail.order")}
                      primary={selectedOrder.orderNo}
                      secondary={selectedOrder.orderId}
                    />
                    <DetailEntry
                      label={t("callcenter.detail.status")}
                      primary={formatOpsCodeLabel(locale, selectedOrder.status)}
                      secondary={
                        <>
                          ETA{" "}
                          {selectedOrder.etaSnapshot
                            ? t("callcenter.detail.etaMin", {
                                value: selectedOrder.etaSnapshot.etaMinutes,
                              })
                            : t("callcenter.detail.etaPending")}
                        </>
                      }
                    />
                    <DetailEntry
                      label={t("callcenter.detail.pickup")}
                      primary={selectedOrder.pickup.address}
                      secondary={selectedOrder.dropoff.address}
                    />
                    <DetailEntry
                      label={t("callcenter.detail.compliance")}
                      primary={formatOpsCodeList(
                        locale,
                        selectedOrder.complianceFlags,
                      )}
                      secondary={selectedOrder.recordingId ?? "-"}
                    />
                  </div>
                  {selectedOrder.exceptionHold ? (
                    <div
                      style={{
                        ...surfacePanelStyle,
                        borderStyle: "dashed",
                        background: "#fffbeb",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          alignItems: "flex-start",
                        }}
                      >
                        <div>
                          <strong
                            style={{ color: "#0f172a", fontSize: "13px" }}
                          >
                            {t("callcenter.detail.exceptionHold")}
                          </strong>
                          <div
                            style={{
                              color: "#64748b",
                              fontSize: "12px",
                              marginTop: "4px",
                            }}
                          >
                            {t("callcenter.detail.exceptionReason", {
                              reason: formatOpsCodeLabel(
                                locale,
                                selectedOrder.exceptionHold.reasonCode,
                              ),
                            })}
                          </div>
                        </div>
                        {selectedOrder.exceptionHold.overrideRequest ? (
                          <StatusChip
                            label={formatOpsCodeLabel(
                              locale,
                              selectedOrder.exceptionHold.overrideRequest
                                .status,
                            )}
                            tone={getOverrideStatusTone(
                              selectedOrder.exceptionHold.overrideRequest
                                .status,
                            )}
                          />
                        ) : null}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(150px, 1fr))",
                          gap: "12px",
                        }}
                      >
                        <DetailEntry
                          label={t("callcenter.detail.overrideActors")}
                          primary={
                            selectedOrder.exceptionHold.overrideActors
                              .map((actor) => formatOpsCodeLabel(locale, actor))
                              .join(", ") || "-"
                          }
                          secondary={t("callcenter.detail.exceptionRaisedAt", {
                            value: formatDateTime(
                              selectedOrder.exceptionHold.raisedAt,
                            ),
                          })}
                        />
                        <DetailEntry
                          label={t("callcenter.detail.overrideType")}
                          primary={
                            selectedOrder.exceptionHold.overrideRequest
                              ? formatOpsCodeLabel(
                                  locale,
                                  selectedOrder.exceptionHold.overrideRequest
                                    .overrideType,
                                )
                              : "-"
                          }
                          secondary={
                            selectedOrder.exceptionHold.overrideRequest
                              ? t("callcenter.detail.overrideRequestedBy", {
                                  actor:
                                    selectedOrder.exceptionHold.overrideRequest
                                      .requestedBy.actorId,
                                })
                              : t("callcenter.detail.noOverrideRequested")
                          }
                        />
                        <DetailEntry
                          label={t("callcenter.detail.overrideDecision")}
                          primary={
                            selectedOrder.exceptionHold.overrideRequest
                              ?.approval
                              ? t("callcenter.detail.overrideApproved")
                              : selectedOrder.exceptionHold.overrideRequest
                                    ?.rejection
                                ? t("callcenter.detail.overrideRejected")
                                : selectedOrder.exceptionHold.overrideRequest
                                      ?.expiredAt
                                  ? t("callcenter.detail.overrideExpired")
                                  : "-"
                          }
                          secondary={
                            selectedOrder.exceptionHold.overrideRequest
                              ?.approval
                              ? t("callcenter.detail.overrideApprovedBy", {
                                  actor:
                                    selectedOrder.exceptionHold.overrideRequest
                                      .approval.actorId,
                                })
                              : selectedOrder.exceptionHold.overrideRequest
                                    ?.rejection
                                ? t("callcenter.detail.overrideRejectedBy", {
                                    actor:
                                      selectedOrder.exceptionHold
                                        .overrideRequest.rejection.actorId,
                                  })
                                : selectedOrder.exceptionHold.overrideRequest
                                      ?.expiredAt
                                  ? t("callcenter.detail.overrideExpiredAt", {
                                      value: formatDateTime(
                                        selectedOrder.exceptionHold
                                          .overrideRequest.expiredAt,
                                      ),
                                    })
                                  : t(
                                      "callcenter.detail.overrideAwaitingApproval",
                                    )
                          }
                        />
                        <DetailEntry
                          label={t("callcenter.detail.lastResolution")}
                          primary={
                            selectedOrder.exceptionHold.resolution
                              ? formatOpsCodeLabel(
                                  locale,
                                  selectedOrder.exceptionHold.resolution
                                    .resolution,
                                )
                              : "-"
                          }
                          secondary={
                            selectedOrder.exceptionHold.resolution
                              ? t("callcenter.detail.resolutionActorReason", {
                                  actor:
                                    selectedOrder.exceptionHold.resolution
                                      .actorId,
                                  reason:
                                    selectedOrder.exceptionHold.resolution
                                      .reason,
                                })
                              : t("callcenter.detail.noResolutionRecorded")
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                  <Link
                    href={`/dispatch?orderId=${encodeURIComponent(
                      selectedOrder.orderId,
                    )}`}
                    style={{ ...buttonStyle, textDecoration: "none" }}
                  >
                    {t("callcenter.openInDispatch")}
                  </Link>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {dispatchTrace.length > 0 ? (
                      dispatchTrace.map((trace) => (
                        <div
                          key={trace.traceId}
                          style={{
                            borderLeft: "3px solid #0f766e",
                            paddingLeft: "12px",
                            display: "grid",
                            gap: "2px",
                          }}
                        >
                          <strong
                            style={{ color: "#0f172a", fontSize: "13px" }}
                          >
                            {formatOpsCodeLabel(locale, trace.eventType)}
                          </strong>
                          <span
                            style={{ color: "#475569", fontSize: "12.5px" }}
                          >
                            {trace.message}
                          </span>
                          <small
                            style={{ color: "#94a3b8", fontSize: "11.5px" }}
                          >
                            {formatDateTime(trace.createdAt)}
                          </small>
                        </div>
                      ))
                    ) : (
                      <span style={{ color: "#64748b", fontSize: "12.5px" }}>
                        {t("callcenter.noDispatchTrace")}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <span style={{ color: "#64748b", fontSize: "12.5px" }}>
                  {t("callcenter.linkOrderFirst")}
                </span>
              )}
            </div>
          </div>
        ) : (
          <span style={{ color: "#64748b", fontSize: "13px" }}>
            {noSessionLabel}
          </span>
        )}
      </DataViewCard>
    </div>
  );
}

function DetailEntry({
  label,
  primary,
  secondary,
  tertiary,
}: {
  label: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  tertiary?: ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <span
        style={{
          fontSize: "11px",
          fontWeight: 700,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
      <strong style={{ color: "#0f172a", fontSize: "13px" }}>{primary}</strong>
      {secondary ? (
        <span style={{ color: "#475569", fontSize: "12px" }}>{secondary}</span>
      ) : null}
      {tertiary ? (
        <span style={{ color: "#94a3b8", fontSize: "11.5px" }}>{tertiary}</span>
      ) : null}
    </div>
  );
}

function RecordingsTab({
  locale,
  sessions,
  recordingFilter,
  setRecordingFilter,
  recordingFilterOptions,
  selectedCallId,
  setSelectedCallId,
  setActiveTab,
  translateLabel,
  recordingForm,
  setRecordingForm,
  busyKey,
  runAction,
  loadData,
  intakeAgentId,
  selectedSession,
}: {
  locale: "en" | "zh";
  sessions: CallSessionRecord[];
  recordingFilter: RecordingFilter;
  setRecordingFilter: (value: RecordingFilter) => void;
  recordingFilterOptions: {
    value: RecordingFilter;
    label: string;
    count: number;
    tone?: ManagementTone;
  }[];
  selectedCallId: string | null;
  setSelectedCallId: (value: string | null) => void;
  setActiveTab: (value: CallcenterTab) => void;
  translateLabel: Translator;
  recordingForm: RecordingFormState;
  setRecordingForm: (
    updater: (current: RecordingFormState) => RecordingFormState,
  ) => void;
  busyKey: string | null;
  runAction: (key: string, action: () => Promise<void>) => Promise<void>;
  loadData: (preferredCallId?: string) => Promise<void>;
  intakeAgentId: string | undefined;
  selectedSession: CallSessionRecord | null;
}) {
  const t = translateLabel;
  const recordingTarget =
    selectedSession ??
    sessions.find((session) => session.recordingState !== "ready") ??
    sessions[0] ??
    null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
        gap: "16px",
        alignItems: "start",
      }}
    >
      <DataViewCard
        title={locale === "en" ? "Recording evidence" : "錄音證據"}
        subtitle={
          locale === "en"
            ? "Each call session must surface its recording state until the binary is callbacked into the workspace."
            : "每筆 session 必須持續顯示錄音狀態，直到 CTI callback 將錄音帶入 workspace。"
        }
        tone="warning"
        filters={
          <DataFilterBar
            value={recordingFilter}
            filters={recordingFilterOptions}
            onChange={setRecordingFilter}
            ariaLabel={
              locale === "en" ? "Recording state filters" : "錄音狀態篩選"
            }
          />
        }
      >
        {sessions.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeadCellStyle}>{t("callcenter.col.call")}</th>
                  <th style={tableHeadCellStyle}>
                    {t("callcenter.col.recordingState")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {locale === "en" ? "Recording ID" : "Recording ID"}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {locale === "en" ? "Provider ref" : "Provider ref"}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("callcenter.col.agent")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("callcenter.col.started")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr
                    key={session.callId}
                    onClick={() => {
                      setSelectedCallId(session.callId);
                    }}
                    style={{
                      cursor: "pointer",
                      background:
                        session.callId === selectedCallId
                          ? "#ecfeff"
                          : "transparent",
                    }}
                  >
                    <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                      {session.callId}
                    </td>
                    <td style={tableBodyCellStyle}>
                      <StatusChip
                        label={t(
                          `callcenter.recordingState.${session.recordingState}`,
                        )}
                        tone={getRecordingStateTone(session.recordingState)}
                      />
                    </td>
                    <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                      {session.recordingId ?? "-"}
                    </td>
                    <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                      {session.providerRecordingRef ?? "-"}
                    </td>
                    <td style={{ ...tableBodyCellStyle, ...monoStyle }}>
                      {session.agentId ?? "-"}
                    </td>
                    <td style={tableBodyCellStyle}>
                      {formatDateTime(session.startedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <span style={{ color: "#64748b", fontSize: "12.5px" }}>
            {t("callcenter.empty")}
          </span>
        )}
      </DataViewCard>

      <DataViewCard
        title={t("callcenter.attachRecordingForm")}
        subtitle={
          recordingTarget
            ? `${recordingTarget.callId} · ${formatOpsCodeLabel(
                locale,
                recordingTarget.callType,
              )}`
            : t("callcenter.selectSession")
        }
        tone="ops"
        actions={
          recordingTarget ? (
            <button
              type="button"
              style={buttonStyle}
              onClick={() => {
                setSelectedCallId(recordingTarget.callId);
                setActiveTab("sessions");
              }}
            >
              {locale === "en" ? "Open session" : "開啟 session"}
            </button>
          ) : null
        }
      >
        {recordingTarget ? (
          <form
            style={{ display: "grid", gap: "10px" }}
            onSubmit={(event) => {
              event.preventDefault();
              void runAction("attach-recording", async () => {
                await getOpsClient().attachRecordingCallback(
                  recordingTarget.callId,
                  {
                    ...recordingForm,
                    agentId:
                      recordingForm.agentId ??
                      recordingTarget.agentId ??
                      intakeAgentId,
                  },
                );
                setRecordingForm(() => INITIAL_RECORDING_FORM);
                await loadData(recordingTarget.callId);
              });
            }}
          >
            <input
              style={inputStyle}
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
              style={inputStyle}
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
              style={inputStyle}
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
              style={primaryButtonStyle}
              type="submit"
              disabled={busyKey === "attach-recording"}
            >
              {t("callcenter.attachRecording")}
            </button>
          </form>
        ) : (
          <span style={{ color: "#64748b", fontSize: "12.5px" }}>
            {t("callcenter.noSession")}
          </span>
        )}
      </DataViewCard>
    </div>
  );
}

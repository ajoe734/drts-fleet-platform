"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import {
  CALL_TYPES,
  COMPLAINT_CATEGORIES,
  PHASE1_SERVICE_BUCKETS,
  type AttachCallRecordingCommand,
  type CallbackTaskRecord,
  type CallRecordingState,
  type CallSessionRecord,
  type ComplaintCategory,
  type CreateCallCenterOrderCommand,
  type DispatchTraceLogRecord,
  type OpenCallSessionCommand,
  type OwnedOrderRecord,
  type Phase1ServiceBucket,
  type TransferCallToComplaintCommand,
} from "@drts/contracts";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatOpsCodeLabel,
  formatOpsCodeList,
  getOpsLabel,
} from "@/lib/localized-labels";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const CALL_TYPE_OPTIONS = [...CALL_TYPES];
const COMPLAINT_CATEGORY_OPTIONS: ComplaintCategory[] = [
  ...COMPLAINT_CATEGORIES,
];
const SERVICE_BUCKET_OPTIONS: Phase1ServiceBucket[] = [
  ...PHASE1_SERVICE_BUCKETS,
];

type RecordingFormState = AttachCallRecordingCommand & {
  agentId: string;
};

type CallcenterTab = "sessions" | "callbacks" | "recordings";

type OrderFormState = {
  passengerName: string;
  passengerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  reservationWindowStart: string;
  reservationWindowEnd: string;
  serviceBucket: Phase1ServiceBucket;
  quotedFare: string;
  quotedFareRuleVersion: string;
  notes: string;
};

type SessionRow = Record<string, unknown> & {
  session: CallSessionRecord;
  _selected?: boolean;
};

type CallbackRow = Record<string, unknown> & {
  callback: CallbackTaskRecord;
  _selected?: boolean;
};

type RecordingRow = Record<string, unknown> & {
  session: CallSessionRecord;
  _selected?: boolean;
};

const INITIAL_INTAKE_FORM: OpenCallSessionCommand = {
  callType: "booking",
  callerPhone: "",
  agentId: "AGENT-OPS-001",
  agentIdentityAnnounced: true,
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

function formatDateTime(
  value: string | null | undefined,
  locale: "en" | "zh",
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatDuration(
  startedAt: string,
  endedAt: string | null | undefined,
  locale: "en" | "zh",
) {
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt ?? Date.now()).getTime();
  const totalMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return locale === "en"
      ? `${hours}h ${minutes}m`
      : `${hours} 小時 ${minutes} 分`;
  }

  return locale === "en" ? `${minutes}m` : `${minutes} 分`;
}

function toIsoString(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function toDateTimeLocalValue(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function buildInitialOrderForm(
  session?: CallSessionRecord | null,
): OrderFormState {
  const base = new Date(session?.startedAt ?? Date.now());
  const windowStart = new Date(base.getTime() + 90 * 60 * 1000);
  const windowEnd = new Date(base.getTime() + 120 * 60 * 1000);

  return {
    passengerName: "",
    passengerPhone: session?.callerPhone ?? "",
    pickupAddress: "",
    dropoffAddress: "",
    reservationWindowStart: toDateTimeLocalValue(windowStart),
    reservationWindowEnd: toDateTimeLocalValue(windowEnd),
    serviceBucket: "standard_taxi",
    quotedFare: "",
    quotedFareRuleVersion: "pr_v24",
    notes: "",
  };
}

function getRecordingTone(recordingState: CallRecordingState) {
  if (recordingState === "ready") {
    return "success" as const;
  }
  if (recordingState === "missing") {
    return "danger" as const;
  }
  return "warn" as const;
}

function getSessionTone(status: CallSessionRecord["status"]) {
  if (status === "active") {
    return "success" as const;
  }
  if (status === "closed") {
    return "neutral" as const;
  }
  return "info" as const;
}

function getCallbackTone(callback: CallbackTaskRecord) {
  if (callback.status === "completed") {
    return "success" as const;
  }
  if (new Date(callback.dueAt).getTime() < Date.now()) {
    return "danger" as const;
  }
  return "warn" as const;
}

function getOverrideTone(status: string) {
  if (status === "approved") {
    return "success" as const;
  }
  if (status === "rejected" || status === "expired") {
    return "danger" as const;
  }
  return "warn" as const;
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

function actionLinkStyle(
  variant: "primary" | "secondary" | "ghost" = "secondary",
) {
  if (variant === "primary") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      minHeight: "28px",
      padding: "5px 10px",
      borderRadius: "7px",
      background: theme.accent,
      color: "#ffffff",
      border: `1px solid ${theme.accent}`,
      fontSize: "12px",
      fontWeight: 500,
      lineHeight: 1,
      textDecoration: "none",
    } as const;
  }

  if (variant === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      minHeight: "28px",
      padding: "5px 10px",
      borderRadius: "7px",
      background: "transparent",
      color: theme.textMuted,
      border: "1px solid transparent",
      fontSize: "12px",
      fontWeight: 500,
      lineHeight: 1,
      textDecoration: "none",
    } as const;
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    minHeight: "28px",
    padding: "5px 10px",
    borderRadius: "7px",
    background: theme.surface,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
  } as const;
}

const controlBaseStyle: CSSProperties = {
  width: "100%",
  borderRadius: "7px",
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  padding: "8px 10px",
  fontSize: "12.5px",
  fontFamily: theme.fontFamily,
  boxSizing: "border-box",
};

function TextInput({
  mono = false,
  style,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  mono?: boolean;
}) {
  return (
    <input
      {...props}
      style={{
        ...controlBaseStyle,
        ...(mono ? { fontFamily: theme.monoFamily } : {}),
        ...style,
      }}
    />
  );
}

function SelectInput({
  style,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        ...controlBaseStyle,
        appearance: "none",
        WebkitAppearance: "none",
        MozAppearance: "none",
        ...style,
      }}
    />
  );
}

function TextAreaInput({
  style,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        ...controlBaseStyle,
        resize: "vertical",
        minHeight: "88px",
        lineHeight: 1.45,
        ...style,
      }}
    />
  );
}

export default function CallcenterPage() {
  const { t, locale } = useTranslation();
  const unknownMessage = t("common.unknown");
  const [activeTab, setActiveTab] = useState<CallcenterTab>("sessions");
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
  const [orderForm, setOrderForm] = useState<OrderFormState>(
    buildInitialOrderForm(null),
  );
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
    setOrderForm(buildInitialOrderForm(selectedSession));
    setQuotedEtaMinutes(
      selectedSession?.lastEtaQuotedMinutes
        ? String(selectedSession.lastEtaQuotedMinutes)
        : "12",
    );
    setRecordingForm((current) => ({
      ...INITIAL_RECORDING_FORM,
      agentId:
        selectedSession?.agentId ??
        current.agentId ??
        INITIAL_INTAKE_FORM.agentId ??
        "AGENT-OPS-001",
    }));
  }, [selectedSession?.callId]);

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
          setError(nextError instanceof Error ? nextError.message : unknownMessage);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSession?.linkedOrderId, unknownMessage]);

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
      setError(nextError instanceof Error ? nextError.message : unknownMessage);
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
      setError(nextError instanceof Error ? nextError.message : unknownMessage);
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
  const linkedOrders = sessions.filter((session) => session.linkedOrderId).length;
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
  const recordingQueue = [...filteredSessions].sort(compareCallSessionPriority);
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
          ? "Create one new phone booking or link one existing order from the same session workspace."
          : "從同一個 session workspace 建立一筆新的電話訂單，或連結一筆既有訂單。";

  const pageTabs = [
    {
      key: "sessions" as const,
      label:
        locale === "en"
          ? `Sessions (${sortedSessions.length})`
          : `Sessions（${sortedSessions.length}）`,
    },
    {
      key: "callbacks" as const,
      label:
        locale === "en"
          ? `Callback queue (${callbackQueue.length})`
          : `Callback queue（${callbackQueue.length}）`,
    },
    {
      key: "recordings" as const,
      label:
        locale === "en"
          ? `Recordings (${recordingQueue.length})`
          : `Recordings（${recordingQueue.length}）`,
    },
  ];

  const headerTabs = pageTabs.map((tab) => ({
    key: tab.key,
    node: (
      <button
        key={tab.key}
        type="button"
        onClick={() => setActiveTab(tab.key)}
        style={{
          border: 0,
          background: "transparent",
          color: "inherit",
          font: "inherit",
          padding: 0,
          cursor: "pointer",
        }}
      >
        {tab.label}
      </button>
    ),
  }));

  const sessionRows: SessionRow[] = sortedSessions.map((session) => ({
    session,
    _selected: session.callId === selectedCallId,
  }));
  const callbackRows: CallbackRow[] = callbackQueue.map((callback) => ({
    callback,
    _selected: callback.callId === selectedCallId,
  }));
  const recordingRows: RecordingRow[] = recordingQueue.map((session) => ({
    session,
    _selected: session.callId === selectedCallId,
  }));

  const sessionColumns: CanvasTableColumn<SessionRow>[] = [
    {
      h: "ID",
      w: 90,
      mono: true,
      r: (row) => (
        <button
          type="button"
          onClick={() => setSelectedCallId(row.session.callId)}
          style={{
            border: 0,
            background: "transparent",
            color: theme.accent,
            fontFamily: theme.monoFamily,
            fontWeight: 600,
            padding: 0,
            cursor: "pointer",
          }}
        >
          {row.session.callId}
        </button>
      ),
    },
    { h: "CALLER", w: 128, mono: true, r: (row) => row.session.callerPhone },
    {
      h: "TYPE",
      w: 122,
      mono: true,
      r: (row) => formatOpsCodeLabel(locale, row.session.callType),
    },
    {
      h: "STATE",
      w: 112,
      r: (row) => (
        <Pill theme={theme} tone={getSessionTone(row.session.status)} dot>
          {formatOpsCodeLabel(locale, row.session.status)}
        </Pill>
      ),
    },
    {
      h: "DUR",
      w: 96,
      mono: true,
      r: (row) =>
        formatDuration(row.session.startedAt, row.session.endedAt, locale),
    },
    {
      h: "AGENT",
      w: 112,
      mono: true,
      r: (row) => row.session.agentId ?? "—",
    },
  ];

  const callbackColumns: CanvasTableColumn<CallbackRow>[] = [
    {
      h: "CALLBACK",
      w: 118,
      mono: true,
      r: (row) => (
        <button
          type="button"
          onClick={() => setSelectedCallId(row.callback.callId)}
          style={{
            border: 0,
            background: "transparent",
            color: theme.accent,
            fontFamily: theme.monoFamily,
            fontWeight: 600,
            padding: 0,
            cursor: "pointer",
          }}
        >
          {row.callback.callbackTaskId}
        </button>
      ),
    },
    {
      h: "CALL",
      w: 100,
      mono: true,
      r: (row) => row.callback.callId,
    },
    {
      h: "STATE",
      w: 140,
      r: (row) => (
        <div style={{ display: "grid", gap: "4px" }}>
          <Pill theme={theme} tone={getCallbackTone(row.callback)} dot>
            {formatOpsCodeLabel(locale, row.callback.status)}
          </Pill>
          <span style={{ color: theme.textDim, fontSize: 11.5 }}>
            {getCallbackSummary(row.callback, locale)}
          </span>
        </div>
      ),
    },
    {
      h: "DUE",
      w: 156,
      mono: true,
      r: (row) => (
        <div style={{ display: "grid", gap: "3px" }}>
          <span>{formatDateTime(row.callback.dueAt, locale)}</span>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {formatRelativeDeadline(row.callback.dueAt, locale)}
          </span>
        </div>
      ),
    },
    {
      h: "ORDER",
      w: 110,
      mono: true,
      r: (row) => row.callback.linkedOrderId ?? "—",
    },
    {
      h: "CASE",
      w: 120,
      mono: true,
      r: (row) => row.callback.linkedCaseNo ?? "—",
    },
  ];

  const recordingColumns: CanvasTableColumn<RecordingRow>[] = [
    {
      h: "CALL",
      w: 98,
      mono: true,
      r: (row) => (
        <button
          type="button"
          onClick={() => setSelectedCallId(row.session.callId)}
          style={{
            border: 0,
            background: "transparent",
            color: theme.accent,
            fontFamily: theme.monoFamily,
            fontWeight: 600,
            padding: 0,
            cursor: "pointer",
          }}
        >
          {row.session.callId}
        </button>
      ),
    },
    {
      h: "STATE",
      w: 128,
      r: (row) => (
        <Pill theme={theme} tone={getRecordingTone(row.session.recordingState)} dot>
          {t(`callcenter.recordingState.${row.session.recordingState}`)}
        </Pill>
      ),
    },
    {
      h: "CALLER",
      w: 128,
      mono: true,
      r: (row) => row.session.callerPhone,
    },
    {
      h: "RECORDING",
      w: 156,
      mono: true,
      r: (row) => row.session.recordingId ?? "—",
    },
    {
      h: "ORDER",
      w: 110,
      mono: true,
      r: (row) => row.session.linkedOrderId ?? "—",
    },
    {
      h: "OPENED",
      w: 146,
      mono: true,
      r: (row) => formatDateTime(row.session.startedAt, locale),
    },
  ];

  return (
    <div
      style={{
        margin: "-24px",
        minHeight: "calc(100vh - 48px)",
        background: theme.bg,
        color: theme.text,
      }}
    >
      <PageHeader
        theme={theme}
        title={t("callcenter.title")}
        subtitle={t("callcenter.subtitle")}
        tabs={headerTabs.map((tab) => tab.node)}
        activeTab={headerTabs.find((tab) => tab.key === activeTab)?.node}
        actions={
          <>
            <Btn
              theme={theme}
              onClick={() => {
                setActiveTab("sessions");
                setShowIntake((current) => !current);
              }}
            >
              {showIntake
                ? t("callcenter.hideIntake")
                : t("callcenter.openIntake")}
            </Btn>
            <Btn
              theme={theme}
              variant="primary"
              onClick={() => {
                setActiveTab("sessions");
                if (!selectedCallId && sortedSessions[0]) {
                  setSelectedCallId(sortedSessions[0].callId);
                }
              }}
            >
              {t("callcenter.createPhoneBooking")}
            </Btn>
          </>
        }
      />

      <div
        style={{
          padding: "24px",
          display: "grid",
          gap: "16px",
        }}
      >
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            title={`${getOpsLabel(locale, "error")}: ${error}`}
            body={
              locale === "en"
                ? "The workspace stays interactive, but the latest API action did not complete."
                : "workspace 仍可繼續操作，但剛才的 API 動作沒有成功完成。"
            }
          />
        ) : null}

        <Banner
          theme={theme}
          tone="info"
          title={t("callcenter.integrationAssumptionsTitle")}
          body={[
            t("callcenter.integrationAssumption.screenPop"),
            t("callcenter.integrationAssumption.recording"),
            t("callcenter.integrationAssumption.storage"),
          ].join(" · ")}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
          }}
        >
          <KPI
            theme={theme}
            label={t("callcenter.openSessions")}
            value={String(openSessions)}
            sub={t("callcenter.openSessionsSub")}
          />
          <KPI
            theme={theme}
            label={t("callcenter.callbackTasks")}
            value={String(pendingCallbacks.length)}
            sub={t("callcenter.callbackTasksSub")}
            delta={
              selectedCallbackIsOverdue
                ? locale === "en"
                  ? "selected overdue"
                  : "目前選取逾期"
                : undefined
            }
            deltaTone={selectedCallbackIsOverdue ? "down" : "neutral"}
          />
          <KPI
            theme={theme}
            label={t("callcenter.recordingPending")}
            value={String(recordingPending)}
            sub={t("callcenter.recordingPendingSub")}
          />
          <KPI
            theme={theme}
            label={t("callcenter.hotlineTransfers")}
            value={String(hotlineTransfers)}
            sub={t("callcenter.hotlineTransfersSub")}
            hint={
              locale === "en"
                ? `${linkedOrders} linked order(s)`
                : `${linkedOrders} 筆已連結訂單`
            }
          />
        </div>

        {showIntake ? (
          <Card
            theme={theme}
            title={t("callcenter.newIntake")}
            subtitle={t("callcenter.intakeNote")}
            actions={
              <Btn
                theme={theme}
                onClick={() => setShowIntake(false)}
                disabled={busyKey === "open-intake"}
              >
                {locale === "en" ? "Collapse" : "收合"}
              </Btn>
            }
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void runAction("open-intake", async () => {
                  const created = await getOpsClient().openCallSession(intakeForm);
                  setShowIntake(false);
                  setIntakeForm(INITIAL_INTAKE_FORM);
                  await loadData(created.callId);
                });
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                <Field theme={theme} label={t("callcenter.form.callType")}>
                  <SelectInput
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
                  </SelectInput>
                </Field>
                <Field theme={theme} label={t("callcenter.form.callerPhone")}>
                  <TextInput
                    type="text"
                    value={intakeForm.callerPhone}
                    onChange={(event) =>
                      setIntakeForm((current) => ({
                        ...current,
                        callerPhone: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field theme={theme} label={t("callcenter.form.agentId")}>
                  <TextInput
                    type="text"
                    value={intakeForm.agentId ?? ""}
                    onChange={(event) =>
                      setIntakeForm((current) => ({
                        ...current,
                        agentId: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field
                  theme={theme}
                  label={t("callcenter.form.announced")}
                  hint={
                    locale === "en"
                      ? "When enabled, the new session starts with identity already announced."
                      : "開啟後，新的 session 會直接視為已完成身分宣讀。"
                  }
                >
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      color: theme.text,
                      fontSize: "12.5px",
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
                    <span>
                      {intakeForm.agentIdentityAnnounced
                        ? t("common.yes")
                        : t("common.no")}
                    </span>
                  </label>
                </Field>
              </div>
              <div
                style={{
                  marginTop: "4px",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <Btn
                  theme={theme}
                  variant="primary"
                  disabled={busyKey === "open-intake"}
                  onClick={() =>
                    void runAction("open-intake", async () => {
                      const created = await getOpsClient().openCallSession(
                        intakeForm,
                      );
                      setShowIntake(false);
                      setIntakeForm(INITIAL_INTAKE_FORM);
                      await loadData(created.callId);
                    })
                  }
                >
                  {busyKey === "open-intake"
                    ? t("callcenter.form.opening")
                    : t("callcenter.form.openSession")}
                </Btn>
              </div>
            </form>
          </Card>
        ) : null}

        {loading ? (
          <Card theme={theme} title={t("callcenter.title")}>
            <div style={{ color: theme.textMuted }}>{t("callcenter.loading")}</div>
          </Card>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                gap: "16px",
                alignItems: "start",
              }}
            >
              <Card
                theme={theme}
                title={locale === "en" ? "Ongoing sessions" : "進行中 sessions"}
                subtitle={t("callcenter.results", {
                  count: sortedSessions.length,
                })}
                actions={
                  <Btn
                    theme={theme}
                    onClick={() => void loadData(selectedCallId ?? undefined)}
                  >
                    {t("common.refresh")}
                  </Btn>
                }
              >
                <div style={{ display: "grid", gap: "12px" }}>
                  <TextInput
                    type="search"
                    placeholder={t("callcenter.search")}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {sessionRows.length > 0 ? (
                    <Table
                      theme={theme}
                      dense
                      columns={sessionColumns}
                      rows={sessionRows}
                    />
                  ) : (
                    <div style={{ color: theme.textMuted }}>
                      {t("callcenter.empty")}
                    </div>
                  )}
                </div>
              </Card>

              <Card
                theme={theme}
                title={
                  selectedSession
                    ? `${selectedSession.callId} · ${formatOpsCodeLabel(
                        locale,
                        selectedSession.callType,
                      )}`
                    : t("callcenter.sessionDetail")
                }
                subtitle={
                  selectedSession
                    ? locale === "en"
                      ? "Phone order intake, callback handoff, and recording follow-up stay in one session detail card."
                      : "電話訂單受理、callback handoff、錄音跟進都留在同一張 session detail card。"
                    : t("callcenter.selectSession")
                }
                actions={
                  selectedSession ? (
                    <Pill
                      theme={theme}
                      tone={getSessionTone(selectedSession.status)}
                      dot
                    >
                      {formatOpsCodeLabel(locale, selectedSession.status)}
                    </Pill>
                  ) : null
                }
              >
                {selectedSession ? (
                  <div style={{ display: "grid", gap: "16px" }}>
                    {(bookingLaneLocked || selectedSessionNeedsRecordingGate) && (
                      <Banner
                        theme={theme}
                        tone={
                          selectedSessionHasComplaint
                            ? "danger"
                            : selectedSessionNeedsRecordingGate
                              ? "warn"
                              : "info"
                        }
                        title={bookingLaneNote}
                        body={
                          selectedSessionNeedsRecordingGate
                            ? locale === "en"
                              ? "Recording evidence is still open for this session."
                              : "這筆 session 仍有錄音證據待補。"
                            : locale === "en"
                              ? "Keep one downstream record per session."
                              : "每筆 session 只保留一條下游處理路徑。"
                        }
                      />
                    )}

                    <DL
                      theme={theme}
                      cols={2}
                      items={[
                        {
                          k: locale === "en" ? "CALLER" : "來電者",
                          v: selectedSession.callerPhone,
                          mono: true,
                        },
                        {
                          k: locale === "en" ? "AGENT" : "客服",
                          v: selectedSession.agentId ?? "—",
                          mono: true,
                        },
                        {
                          k: locale === "en" ? "OPENED" : "開啟時間",
                          v: formatDateTime(selectedSession.startedAt, locale),
                          mono: true,
                        },
                        {
                          k: t("callcenter.detail.identityAnnounced"),
                          v: selectedSession.agentIdentityAnnounced
                            ? t("common.yes")
                            : t("common.no"),
                        },
                        {
                          k: t("callcenter.detail.recording"),
                          v: (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "8px",
                              }}
                            >
                              <Pill
                                theme={theme}
                                tone={getRecordingTone(selectedSession.recordingState)}
                                dot
                              >
                                {t(
                                  `callcenter.recordingState.${selectedSession.recordingState}`,
                                )}
                              </Pill>
                              <span
                                style={{
                                  color: theme.textMuted,
                                  fontSize: "11.5px",
                                  fontFamily: theme.monoFamily,
                                }}
                              >
                                {selectedSession.recordingId ?? "—"}
                              </span>
                            </span>
                          ),
                        },
                        {
                          k: t("callcenter.detail.lastEtaReply"),
                          v: selectedSession.lastEtaQuotedMinutes
                            ? t("callcenter.detail.etaMin", {
                                value: selectedSession.lastEtaQuotedMinutes,
                              })
                            : t("callcenter.detail.etaNotSent"),
                        },
                      ]}
                    />

                    <form
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
                          setOrderForm(buildInitialOrderForm(selectedSession));
                          await loadData(selectedSession.callId);
                        });
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(220px, 1fr))",
                          gap: "12px",
                        }}
                      >
                        <Field
                          theme={theme}
                          label={locale === "en" ? "pickup" : "上車地點"}
                          required
                        >
                          <TextInput
                            type="text"
                            placeholder={t("callcenter.pickupAddressPlaceholder")}
                            value={orderForm.pickupAddress}
                            onChange={(event) =>
                              setOrderForm((current) => ({
                                ...current,
                                pickupAddress: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Field
                          theme={theme}
                          label={locale === "en" ? "drop" : "下車地點"}
                          required
                        >
                          <TextInput
                            type="text"
                            placeholder={t("callcenter.dropoffAddressPlaceholder")}
                            value={orderForm.dropoffAddress}
                            onChange={(event) =>
                              setOrderForm((current) => ({
                                ...current,
                                dropoffAddress: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Field
                          theme={theme}
                          label={
                            locale === "en"
                              ? "reservation window start"
                              : "預約時窗開始"
                          }
                        >
                          <TextInput
                            type="datetime-local"
                            mono
                            value={orderForm.reservationWindowStart}
                            onChange={(event) =>
                              setOrderForm((current) => ({
                                ...current,
                                reservationWindowStart: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Field
                          theme={theme}
                          label={
                            locale === "en"
                              ? "reservation window end"
                              : "預約時窗結束"
                          }
                        >
                          <TextInput
                            type="datetime-local"
                            mono
                            value={orderForm.reservationWindowEnd}
                            onChange={(event) =>
                              setOrderForm((current) => ({
                                ...current,
                                reservationWindowEnd: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Field
                          theme={theme}
                          label={locale === "en" ? "passenger" : "乘客"}
                          required
                        >
                          <TextInput
                            type="text"
                            placeholder={t("callcenter.passengerNamePlaceholder")}
                            value={orderForm.passengerName}
                            onChange={(event) =>
                              setOrderForm((current) => ({
                                ...current,
                                passengerName: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Field
                          theme={theme}
                          label={locale === "en" ? "phone" : "乘客電話"}
                        >
                          <TextInput
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
                        </Field>
                        <Field
                          theme={theme}
                          label={
                            locale === "en" ? "service bucket" : "服務 bucket"
                          }
                          hint={
                            locale === "en"
                              ? "Current API keeps phone orders on the existing realtime contract."
                              : "目前 API 仍維持既有 realtime phone-order contract。"
                          }
                        >
                          <SelectInput
                            value={orderForm.serviceBucket}
                            onChange={(event) =>
                              setOrderForm((current) => ({
                                ...current,
                                serviceBucket: event.target
                                  .value as Phase1ServiceBucket,
                              }))
                            }
                          >
                            {SERVICE_BUCKET_OPTIONS.map((serviceBucket) => (
                              <option key={serviceBucket} value={serviceBucket}>
                                {formatOpsCodeLabel(locale, serviceBucket)}
                              </option>
                            ))}
                          </SelectInput>
                        </Field>
                        <Field
                          theme={theme}
                          label={locale === "en" ? "quoted fare" : "報價"}
                          hint={
                            orderForm.quotedFareRuleVersion
                              ? orderForm.quotedFareRuleVersion
                              : locale === "en"
                                ? "local planning field"
                                : "本地規劃欄位"
                          }
                        >
                          <TextInput
                            type="text"
                            mono
                            placeholder={locale === "en" ? "NT$ 1,580" : "NT$ 1,580"}
                            value={orderForm.quotedFare}
                            onChange={(event) =>
                              setOrderForm((current) => ({
                                ...current,
                                quotedFare: event.target.value,
                              }))
                            }
                          />
                        </Field>
                      </div>

                      <div style={{ marginTop: "2px" }}>
                        <Field theme={theme} label={locale === "en" ? "ops note" : "營運備註"}>
                          <TextAreaInput
                            rows={3}
                            placeholder={t("callcenter.opsNotePlaceholder")}
                            value={orderForm.notes}
                            onChange={(event) =>
                              setOrderForm((current) => ({
                                ...current,
                                notes: event.target.value,
                              }))
                            }
                          />
                        </Field>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          flexWrap: "wrap",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div
                          style={{
                            color: theme.textDim,
                            fontSize: "11.5px",
                            lineHeight: 1.4,
                            maxWidth: "640px",
                          }}
                        >
                          {locale === "en"
                            ? "Pickup, drop, passenger, recording, and ops notes follow the existing API contract. Reservation window, service bucket, and quoted fare stay as workspace planning fields in this handoff."
                            : "pickup、drop、passenger、recording、ops note 仍走既有 API contract；reservation window、service bucket、quoted fare 先保留為這次 handoff 的 workspace 規劃欄位。"}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            flexWrap: "wrap",
                            justifyContent: "flex-end",
                          }}
                        >
                          <Btn
                            theme={theme}
                            onClick={() =>
                              setOrderForm(buildInitialOrderForm(selectedSession))
                            }
                          >
                            {locale === "en" ? "Cancel" : "取消"}
                          </Btn>
                          <Btn
                            theme={theme}
                            onClick={() => setActiveTab("callbacks")}
                          >
                            {locale === "en"
                              ? "Open callback queue"
                              : "開啟 callback queue"}
                          </Btn>
                          <Btn
                            theme={theme}
                            variant="primary"
                            disabled={
                              busyKey === "create-phone-order" || bookingLaneLocked
                            }
                            onClick={() =>
                              void runAction("create-phone-order", async () => {
                                await getOpsClient().createCallCenterOrder({
                                  callId: selectedSession.callId,
                                  agentId:
                                    selectedSession.agentId ??
                                    intakeForm.agentId ??
                                    "AGENT-OPS-001",
                                  recordingId: selectedSession.recordingId,
                                  pickup: { address: orderForm.pickupAddress },
                                  dropoff: {
                                    address: orderForm.dropoffAddress,
                                  },
                                  passenger: {
                                    name: orderForm.passengerName,
                                    phone:
                                      orderForm.passengerPhone ||
                                      selectedSession.callerPhone,
                                  },
                                  ...(orderForm.notes.trim()
                                    ? { notes: orderForm.notes.trim() }
                                    : {}),
                                });
                                setOrderForm(buildInitialOrderForm(selectedSession));
                                await loadData(selectedSession.callId);
                              })
                            }
                          >
                            {t("callcenter.createOrderFromCall")}
                          </Btn>
                        </div>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div style={{ color: theme.textMuted }}>{t("callcenter.noSession")}</div>
                )}
              </Card>
            </div>

            {activeTab === "sessions" ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: "16px",
                  alignItems: "start",
                }}
              >
                <Card
                  theme={theme}
                  title={t("callcenter.bindExistingOrder")}
                  subtitle={
                    locale === "en"
                      ? "Use only when the passenger already has a known order ID."
                      : "僅在乘客已持有既有訂單編號時使用。"
                  }
                >
                  {selectedSession ? (
                    <form
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
                      <Field
                        theme={theme}
                        label={t("callcenter.existingOrderIdPlaceholder")}
                        hint={bookingLaneNote}
                      >
                        <TextInput
                          type="text"
                          placeholder={t("callcenter.existingOrderIdPlaceholder")}
                          value={existingOrderId}
                          onChange={(event) => setExistingOrderId(event.target.value)}
                        />
                      </Field>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                        }}
                      >
                        <Btn
                          theme={theme}
                          disabled={busyKey === "link-order" || bookingLaneLocked}
                          onClick={() =>
                            void runAction("link-order", async () => {
                              await getOpsClient().linkCallOrder(
                                selectedSession.callId,
                                {
                                  orderId: existingOrderId,
                                },
                              );
                              setExistingOrderId("");
                              await loadData(selectedSession.callId);
                            })
                          }
                        >
                          {t("callcenter.linkOrderToCall")}
                        </Btn>
                      </div>
                    </form>
                  ) : (
                    <div style={{ color: theme.textMuted }}>{t("callcenter.noSession")}</div>
                  )}
                </Card>

                <Card
                  theme={theme}
                  title={t("callcenter.transferComplaintForm")}
                  subtitle={
                    locale === "en"
                      ? "Escalate this call into complaint handling when the outcome becomes remediation."
                      : "當處理結果轉為補救時，從這裡把通話升級為客訴。"
                  }
                >
                  {selectedSession ? (
                    <form
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
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: "12px",
                        }}
                      >
                        <Field theme={theme} label={locale === "en" ? "category" : "類別"}>
                          <SelectInput
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
                          </SelectInput>
                        </Field>
                        <Field theme={theme} label={locale === "en" ? "severity" : "嚴重度"}>
                          <SelectInput
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
                          </SelectInput>
                        </Field>
                      </div>
                      <Field
                        theme={theme}
                        label={locale === "en" ? "complaint context" : "客訴說明"}
                      >
                        <TextAreaInput
                          rows={3}
                          placeholder={t("callcenter.complaintDescriptionPlaceholder")}
                          value={transferForm.description}
                          onChange={(event) =>
                            setTransferForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          flexWrap: "wrap",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ color: theme.textDim, fontSize: "11.5px" }}>
                          {selectedSession.linkedCaseNo
                            ? locale === "en"
                              ? `Linked complaint: ${selectedSession.linkedCaseNo}`
                              : `已連結客訴：${selectedSession.linkedCaseNo}`
                            : bookingLaneNote}
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {selectedSession.linkedCaseNo ? (
                            <Link
                              style={actionLinkStyle("secondary")}
                              href={`/complaints?caseNo=${encodeURIComponent(
                                selectedSession.linkedCaseNo,
                              )}`}
                            >
                              {locale === "en"
                                ? "Open linked complaint"
                                : "開啟已連結客訴"}
                            </Link>
                          ) : null}
                          <Btn
                            theme={theme}
                            disabled={
                              busyKey === "transfer-complaint" ||
                              selectedSessionHasComplaint
                            }
                            onClick={() =>
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
                                setTransferForm(
                                  INITIAL_COMPLAINT_TRANSFER_FORM,
                                );
                                await loadData(selectedSession.callId);
                              })
                            }
                          >
                            {t("callcenter.createComplaintCase")}
                          </Btn>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <div style={{ color: theme.textMuted }}>{t("callcenter.noSession")}</div>
                  )}
                </Card>

                <Card
                  theme={theme}
                  title={t("callcenter.linkedOrderTrace")}
                  subtitle={
                    selectedOrder
                      ? locale === "en"
                        ? `${selectedOrder.orderNo} · ${formatOpsCodeLabel(
                            locale,
                            selectedOrder.status,
                          )}`
                        : `${selectedOrder.orderNo} · ${formatOpsCodeLabel(
                            locale,
                            selectedOrder.status,
                          )}`
                      : t("callcenter.linkOrderFirst")
                  }
                  actions={
                    selectedOrder ? (
                      <Link
                        style={actionLinkStyle("secondary")}
                        href={`/dispatch?orderId=${encodeURIComponent(
                          selectedOrder.orderId,
                        )}`}
                      >
                        {t("callcenter.openInDispatch")}
                      </Link>
                    ) : null
                  }
                >
                  {selectedOrder ? (
                    <div style={{ display: "grid", gap: "14px" }}>
                      <DL
                        theme={theme}
                        cols={2}
                        items={[
                          {
                            k: t("callcenter.detail.order"),
                            v: selectedOrder.orderNo,
                            mono: true,
                          },
                          {
                            k: t("callcenter.detail.status"),
                            v: formatOpsCodeLabel(locale, selectedOrder.status),
                          },
                          {
                            k: t("callcenter.detail.pickup"),
                            v: selectedOrder.pickup.address,
                          },
                          {
                            k: t("callcenter.detail.compliance"),
                            v:
                              selectedOrder.complianceFlags.length > 0
                                ? formatOpsCodeList(
                                    locale,
                                    selectedOrder.complianceFlags,
                                  )
                                : "—",
                          },
                        ]}
                      />

                      {selectedOrder.exceptionHold ? (
                        <Banner
                          theme={theme}
                          tone="warn"
                          title={t("callcenter.detail.exceptionHold")}
                          body={t("callcenter.detail.exceptionReason", {
                            reason: formatOpsCodeLabel(
                              locale,
                              selectedOrder.exceptionHold.reasonCode,
                            ),
                          })}
                          actions={
                            selectedOrder.exceptionHold.overrideRequest ? (
                              <Pill
                                theme={theme}
                                tone={getOverrideTone(
                                  selectedOrder.exceptionHold.overrideRequest.status,
                                )}
                                dot
                              >
                                {formatOpsCodeLabel(
                                  locale,
                                  selectedOrder.exceptionHold.overrideRequest.status,
                                )}
                              </Pill>
                            ) : null
                          }
                        />
                      ) : null}

                      {dispatchTrace.length > 0 ? (
                        <div
                          style={{
                            display: "grid",
                            gap: "8px",
                          }}
                        >
                          {dispatchTrace.map((trace) => (
                            <div
                              key={trace.traceId}
                              style={{
                                borderLeft: `3px solid ${theme.accent}`,
                                paddingLeft: "10px",
                                display: "grid",
                                gap: "2px",
                              }}
                            >
                              <strong
                                style={{
                                  fontSize: "12px",
                                  color: theme.text,
                                }}
                              >
                                {formatOpsCodeLabel(locale, trace.eventType)}
                              </strong>
                              <span
                                style={{
                                  color: theme.textMuted,
                                  fontSize: "11.5px",
                                }}
                              >
                                {trace.message}
                              </span>
                              <span
                                style={{
                                  color: theme.textDim,
                                  fontSize: "11px",
                                  fontFamily: theme.monoFamily,
                                }}
                              >
                                {formatDateTime(trace.createdAt, locale)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: theme.textMuted }}>
                          {t("callcenter.noDispatchTrace")}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: theme.textMuted }}>
                      {t("callcenter.linkOrderFirst")}
                    </div>
                  )}
                </Card>
              </div>
            ) : null}

            {activeTab === "callbacks" ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: "16px",
                  alignItems: "start",
                }}
              >
                <Card
                  theme={theme}
                  title={t("callcenter.callbacks")}
                  subtitle={t("callcenter.callbackCount", {
                    count: callbackQueue.length,
                  })}
                >
                  {callbackRows.length > 0 ? (
                    <Table
                      theme={theme}
                      dense
                      columns={callbackColumns}
                      rows={callbackRows}
                    />
                  ) : (
                    <div style={{ color: theme.textMuted }}>
                      {t("callcenter.emptyCallbacks")}
                    </div>
                  )}
                </Card>

                <Card
                  theme={theme}
                  title={t("callcenter.callbackQueueForm")}
                  subtitle={
                    selectedSession
                      ? `${selectedSession.callId} · ${selectedSession.callerPhone}`
                      : t("callcenter.selectSession")
                  }
                  actions={
                    selectedCallback ? (
                      <Pill
                        theme={theme}
                        tone={getCallbackTone(selectedCallback)}
                        dot
                      >
                        {formatOpsCodeLabel(locale, selectedCallback.status)}
                      </Pill>
                    ) : null
                  }
                >
                  {selectedSession ? (
                    <form
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
                      <Field theme={theme} label={locale === "en" ? "due at" : "回電時間"}>
                        <TextInput
                          type="datetime-local"
                          mono
                          value={callbackDueAt}
                          onChange={(event) => setCallbackDueAt(event.target.value)}
                        />
                      </Field>
                      <Field
                        theme={theme}
                        label={locale === "en" ? "note" : "備註"}
                        hint={
                          selectedCallback
                            ? getCallbackSummary(selectedCallback, locale)
                            : locale === "en"
                              ? "Queue a callback when the passenger needs follow-up outside the active call."
                              : "當乘客需要在通話外再跟進時，在這裡排入 callback。"
                        }
                      >
                        <TextAreaInput
                          rows={3}
                          placeholder={t("callcenter.callbackNotePlaceholder")}
                          value={callbackNote}
                          onChange={(event) => setCallbackNote(event.target.value)}
                        />
                      </Field>
                      {selectedCallback?.status === "pending" ? (
                        <Field
                          theme={theme}
                          label={
                            locale === "en" ? "completion note" : "完成備註"
                          }
                          hint={formatRelativeDeadline(selectedCallback.dueAt, locale)}
                        >
                          <TextInput
                            type="text"
                            value={callbackCompleteNote}
                            placeholder={t("callcenter.completionNotePlaceholder")}
                            onChange={(event) =>
                              setCallbackCompleteNote(event.target.value)
                            }
                          />
                        </Field>
                      ) : null}
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        {selectedCallback?.status === "pending" ? (
                          <Btn
                            theme={theme}
                            onClick={() =>
                              void runAction("complete-callback", async () => {
                                await getOpsClient().completeCallbackTask(
                                  selectedCallback.callbackTaskId,
                                  {
                                    note: callbackCompleteNote,
                                  },
                                );
                                setCallbackCompleteNote("");
                                await loadData(selectedSession.callId);
                              })
                            }
                            disabled={busyKey === "complete-callback"}
                          >
                            {t("callcenter.completeCallback")}
                          </Btn>
                        ) : null}
                        <Btn
                          theme={theme}
                          variant="primary"
                          disabled={busyKey === "create-callback"}
                          onClick={() =>
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
                            })
                          }
                        >
                          {t("callcenter.saveCallback")}
                        </Btn>
                      </div>
                    </form>
                  ) : (
                    <div style={{ color: theme.textMuted }}>{t("callcenter.noSession")}</div>
                  )}
                </Card>
              </div>
            ) : null}

            {activeTab === "recordings" ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: "16px",
                  alignItems: "start",
                }}
              >
                <Card
                  theme={theme}
                  title={locale === "en" ? "Recording queue" : "錄音佇列"}
                  subtitle={
                    locale === "en"
                      ? "Pending and missing recording evidence stays visible from the same workspace."
                      : "待補與缺漏錄音證據會持續留在同一個 workspace。"
                  }
                >
                  {recordingRows.length > 0 ? (
                    <Table
                      theme={theme}
                      dense
                      columns={recordingColumns}
                      rows={recordingRows}
                    />
                  ) : (
                    <div style={{ color: theme.textMuted }}>
                      {t("callcenter.empty")}
                    </div>
                  )}
                </Card>

                <Card
                  theme={theme}
                  title={t("callcenter.attachRecordingForm")}
                  subtitle={
                    selectedSession
                      ? `${selectedSession.callId} · ${t(
                          `callcenter.recordingState.${selectedSession.recordingState}`,
                        )}`
                      : t("callcenter.selectSession")
                  }
                  actions={
                    selectedSession ? (
                      <Pill
                        theme={theme}
                        tone={getRecordingTone(selectedSession.recordingState)}
                        dot
                      >
                        {t(
                          `callcenter.recordingState.${selectedSession.recordingState}`,
                        )}
                      </Pill>
                    ) : null
                  }
                >
                  {selectedSession ? (
                    <div style={{ display: "grid", gap: "16px" }}>
                      {!selectedSession.agentIdentityAnnounced ? (
                        <Banner
                          theme={theme}
                          tone="warn"
                          title={t("callcenter.markIdentityAnnounced")}
                          body={
                            locale === "en"
                              ? "Mark the disclosure step before finishing the session if it was completed verbally."
                              : "若已口頭完成身分宣讀，請先在這裡補記錄。"
                          }
                          actions={
                            <Btn
                              theme={theme}
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
                              disabled={busyKey === "announce-identity"}
                            >
                              {t("callcenter.markIdentityAnnounced")}
                            </Btn>
                          }
                        />
                      ) : null}

                      <form
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
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: "12px",
                          }}
                        >
                          <Field
                            theme={theme}
                            label={t("callcenter.recordingIdPlaceholder")}
                            required
                          >
                            <TextInput
                              type="text"
                              value={recordingForm.recordingId}
                              placeholder={t("callcenter.recordingIdPlaceholder")}
                              onChange={(event) =>
                                setRecordingForm((current) => ({
                                  ...current,
                                  recordingId: event.target.value,
                                }))
                              }
                            />
                          </Field>
                          <Field
                            theme={theme}
                            label={t("callcenter.providerRefPlaceholder")}
                          >
                            <TextInput
                              type="text"
                              value={recordingForm.providerRecordingRef ?? ""}
                              placeholder={t("callcenter.providerRefPlaceholder")}
                              onChange={(event) =>
                                setRecordingForm((current) => ({
                                  ...current,
                                  providerRecordingRef: event.target.value,
                                }))
                              }
                            />
                          </Field>
                          <Field
                            theme={theme}
                            label={t("callcenter.recordingUrlPlaceholder")}
                          >
                            <TextInput
                              type="url"
                              value={recordingForm.recordingUrl ?? ""}
                              placeholder={t("callcenter.recordingUrlPlaceholder")}
                              onChange={(event) =>
                                setRecordingForm((current) => ({
                                  ...current,
                                  recordingUrl: event.target.value,
                                }))
                              }
                            />
                          </Field>
                          <Field theme={theme} label={t("callcenter.replyEta")}>
                            <TextInput
                              type="number"
                              min={1}
                              mono
                              value={quotedEtaMinutes}
                              onChange={(event) =>
                                setQuotedEtaMinutes(event.target.value)
                              }
                            />
                          </Field>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            flexWrap: "wrap",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginTop: "6px",
                          }}
                        >
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <Btn
                              theme={theme}
                              onClick={() =>
                                void runAction("quote-eta", async () => {
                                  await getOpsClient().quoteCallEta(
                                    selectedSession.callId,
                                    {
                                      etaMinutes: Number(quotedEtaMinutes),
                                    },
                                  );
                                  await loadData(selectedSession.callId);
                                })
                              }
                              disabled={busyKey === "quote-eta"}
                            >
                              {t("callcenter.saveEtaReply")}
                            </Btn>
                            <Btn
                              theme={theme}
                              onClick={() =>
                                void runAction("close-session", async () => {
                                  await getOpsClient().closeCallSession(
                                    selectedSession.callId,
                                  );
                                  await loadData(selectedSession.callId);
                                })
                              }
                              disabled={
                                busyKey === "close-session" ||
                                selectedSession.status === "closed"
                              }
                            >
                              {t("callcenter.closeSession")}
                            </Btn>
                          </div>
                          <Btn
                            theme={theme}
                            variant="primary"
                            disabled={busyKey === "attach-recording"}
                            onClick={() =>
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
                              })
                            }
                          >
                            {t("callcenter.attachRecording")}
                          </Btn>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <div style={{ color: theme.textMuted }}>{t("callcenter.noSession")}</div>
                  )}
                </Card>
              </div>
            ) : null}
          </>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            paddingTop: "4px",
          }}
        >
          <div style={{ color: theme.textDim, fontSize: "11.5px" }}>
            {locale === "en"
              ? "Canvas handoff aligned to OC_Callcenter while preserving the current ops-console API wiring."
              : "這版 canvas handoff 已對齊 OC_Callcenter，同時保留目前 ops-console 的 API wiring。"}
          </div>
          <Link style={actionLinkStyle("ghost")} href="/">
            {t("callcenter.backToHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

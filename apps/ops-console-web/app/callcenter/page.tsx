"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CanvasActionButton,
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasEmptyState,
  CanvasField,
  CanvasInput,
  CanvasKPI,
  CanvasPageHeader as PageHeader,
  CanvasPill,
  CanvasSelect,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import type {
  AttachCallRecordingCommand,
  CallbackTaskRecord,
  CallRecordingState,
  CallSessionRecord,
  ComplaintCategory,
  CreateCallCenterOrderCommand,
  CrossAppResourceLink,
  DispatchTraceLogRecord,
  EmptyReason,
  OpenCallSessionCommand,
  OwnedOrderRecord,
  RefreshTier,
  ResourceActionDescriptor,
  TransferCallToComplaintCommand,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "@drts/contracts";
import { CALL_TYPES, COMPLAINT_CATEGORIES } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel, formatOpsCodeList } from "@/lib/localized-labels";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const CALL_TYPE_OPTIONS = [...CALL_TYPES];
const COMPLAINT_CATEGORY_OPTIONS: ComplaintCategory[] = [
  ...COMPLAINT_CATEGORIES,
];

type Locale = "en" | "zh";

type RecordingFormState = AttachCallRecordingCommand & {
  agentId: string;
};

type SessionResource = CallSessionRecord & {
  availableActions: ResourceActionDescriptor[];
  deepLinks: CrossAppResourceLink[];
};

type RuntimeSessionRecord = CallSessionRecord & {
  availableActions?: ResourceActionDescriptor[];
  deepLinks?: CrossAppResourceLink[];
};

type RuntimeCallbackRecord = CallbackTaskRecord & {
  availableActions?: ResourceActionDescriptor[];
  deepLinks?: CrossAppResourceLink[];
};

type CallcenterListEnvelope<T> = {
  items: T[];
  refresh?: UiRefreshMetadata;
  emptyState?: {
    reason: EmptyReason;
    messageCode: string;
    nextAction?: ResourceActionDescriptor;
  };
  health?: UiHealthEnvelope;
};

type QueueView = "sessions" | "callback" | "recording";

type OutcomeNotice = {
  tone: "success" | "warning";
  message: string;
  href?: string;
  label?: string;
  external?: boolean;
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

const CALLCENTER_REFRESH_TIER: RefreshTier = "dispatch";
const CALLCENTER_REFRESH_INTERVAL_MS = 5000;

const FALLBACK_REFRESH_METADATA: UiRefreshMetadata = {
  generatedAt: new Date(0).toISOString(),
  staleAfterMs: CALLCENTER_REFRESH_INTERVAL_MS,
  dataFreshness: "unknown",
  source: "live",
};

const pageBodyStyle: CSSProperties = {
  minHeight: "100%",
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  background: theme.bg,
  color: theme.text,
};

const intakeGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const workspaceGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(260px, 0.95fr) minmax(360px, 1.3fr) minmax(260px, 0.95fr)",
  gap: 16,
  alignItems: "start",
};

const columnStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  minWidth: 0,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const dualFormGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
};

const actionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

const nativeInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 34,
  padding: "7px 10px",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
};

const nativeTextAreaStyle: CSSProperties = {
  ...nativeInputStyle,
  minHeight: 92,
  resize: "vertical",
};

const subtleTextStyle: CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.45,
  color: theme.textMuted,
};

const linkPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 999,
  border: `1px solid ${theme.accentBorder}`,
  background: theme.accentBg,
  color: theme.accent,
  textDecoration: "none",
  fontSize: 11.5,
  fontWeight: 600,
};

const queueButtonStyle: CSSProperties = {
  width: "100%",
  padding: 0,
  border: 0,
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
};

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
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

function toIsoString(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function getEmptyStateCopy(
  locale: Locale,
  reason: EmptyReason,
): { title: string; body: string; accent: string } {
  switch (reason) {
    case "not_provisioned":
      return locale === "en"
        ? {
            title: "Workspace not provisioned",
            body: "Call-center scope or telephony bootstrap is missing for this operator.",
            accent: "Provisioning",
          }
        : {
            title: "Workspace 尚未 provision",
            body: "這位操作員缺少 call-center scope 或 telephony bootstrap。",
            accent: "Provisioning",
          };
    case "fetch_failed":
      return locale === "en"
        ? {
            title: "Fetch failed",
            body: "The workspace could not refresh from the backend. Review the error banner and retry.",
            accent: "Fetch failed",
          }
        : {
            title: "資料抓取失敗",
            body: "Workspace 無法從後端刷新。請檢查錯誤訊息後再重試。",
            accent: "Fetch failed",
          };
    case "permission_denied":
      return locale === "en"
        ? {
            title: "Permission denied",
            body: "This operator can see the route chrome but does not have the required call-center action scope.",
            accent: "Permission",
          }
        : {
            title: "權限不足",
            body: "目前操作員可看到路由頁面，但沒有執行 call-center 動作所需的 scope。",
            accent: "Permission",
          };
    case "external_unavailable":
      return locale === "en"
        ? {
            title: "External telephony unavailable",
            body: "CTI or recording linkage is degraded. Continue triage with queue context, then retry when the dependency recovers.",
            accent: "External",
          }
        : {
            title: "外部 telephony 不可用",
            body: "CTI 或錄音連結目前降級。請先依 queue 資訊分流，待依賴恢復後再重試。",
            accent: "External",
          };
    case "filtered_empty":
      return locale === "en"
        ? {
            title: "Nothing matches the current filter",
            body: "Clear the search term to return to the full session, callback, and history queues.",
            accent: "Filtered",
          }
        : {
            title: "目前篩選沒有結果",
            body: "清除搜尋條件後，可回到完整的 session、callback 與歷史列表。",
            accent: "Filtered",
          };
    case "no_data":
    default:
      return locale === "en"
        ? {
            title: "No active session",
            body: "The workspace is idle. Open a new call session or keep watch on waiting callbacks and recording gaps.",
            accent: "Idle",
          }
        : {
            title: "目前沒有 active session",
            body: "Workspace 處於 idle 狀態。可開新 session，或持續留意 callback 與錄音待補佇列。",
            accent: "Idle",
          };
  }
}

function getDisabledReasonLabel(locale: Locale, code?: string) {
  switch (code) {
    case "active_session_exists":
      return locale === "en"
        ? "Close the current active session first."
        : "請先結束目前的 active session。";
    case "identity_already_announced":
      return locale === "en"
        ? "Identity already announced."
        : "已標記身分告知。";
    case "session_closed":
      return locale === "en"
        ? "Closed sessions are read-only."
        : "已關閉 session 為唯讀。";
    case "linked_order_exists":
      return locale === "en"
        ? "This session already has a linked order."
        : "這筆 session 已綁定訂單。";
    case "complaint_exists":
      return locale === "en"
        ? "This session is already linked to a complaint."
        : "這筆 session 已連結客訴。";
    case "callback_missing":
      return locale === "en"
        ? "There is no pending callback to complete."
        : "目前沒有待完成的 callback。";
    case "compliance_scope_required":
      return locale === "en"
        ? "Compliance scope is required for manual recording attach."
        : "手動補掛錄音需要 compliance scope。";
    default:
      return locale === "en" ? "Action not available." : "此動作目前不可用。";
  }
}

function getActionLabel(locale: Locale, action: string) {
  const labels: Record<string, { en: string; zh: string }> = {
    open_call_session: { en: "Open call session", zh: "開新 call session" },
    announce_identity: { en: "Announce identity", zh: "標記已告知身分" },
    close_session: { en: "Close session", zh: "關閉 session" },
    quote_eta: { en: "Quote ETA", zh: "回覆 ETA" },
    create_callback: { en: "Create callback", zh: "建立 callback" },
    complete_callback: { en: "Complete callback", zh: "完成 callback" },
    create_phone_booking: { en: "Create phone booking", zh: "建立電話訂車" },
    link_existing_order: { en: "Link existing order", zh: "連結既有訂單" },
    transfer_to_complaint: { en: "Transfer to complaint", zh: "轉交客訴" },
    attach_recording: { en: "Manual attach recording", zh: "手動補掛錄音" },
  };

  const label = labels[action];
  return label ? label[locale] : action;
}

function getRiskLabel(
  locale: Locale,
  risk: ResourceActionDescriptor["riskLevel"],
) {
  if (risk === "high") {
    return locale === "en" ? "High" : "高風險";
  }
  if (risk === "medium") {
    return locale === "en" ? "Medium" : "中風險";
  }
  return locale === "en" ? "Low" : "低風險";
}

function getActionDescriptor(
  actions: ResourceActionDescriptor[],
  action: string,
) {
  return actions.find((item) => item.action === action);
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
    return (
      (priority[b.recordingState] ?? 0) - (priority[a.recordingState] ?? 0)
    );
  }

  return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
}

function classifyEmptyReason(
  errorMessage: string | null,
  filtered: boolean,
  totalSessions: number,
  totalCallbacks: number,
): EmptyReason {
  if (errorMessage) {
    const normalized = errorMessage.toLowerCase();
    if (
      normalized.includes("permission") ||
      normalized.includes("forbidden") ||
      normalized.includes("unauthorized")
    ) {
      return "permission_denied";
    }
    if (
      normalized.includes("provision") ||
      normalized.includes("scope") ||
      normalized.includes("bootstrap")
    ) {
      return "not_provisioned";
    }
    if (
      normalized.includes("cti") ||
      normalized.includes("telephony") ||
      normalized.includes("recording provider") ||
      normalized.includes("external")
    ) {
      return "external_unavailable";
    }
    return "fetch_failed";
  }

  if (filtered) {
    return "filtered_empty";
  }

  if (totalSessions === 0 && totalCallbacks === 0) {
    return "no_data";
  }

  return "no_data";
}

function buildFallbackRefreshMetadata(
  freshness: UiRefreshMetadata["dataFreshness"] = "fresh",
): UiRefreshMetadata {
  return {
    generatedAt: new Date().toISOString(),
    staleAfterMs: CALLCENTER_REFRESH_INTERVAL_MS,
    dataFreshness: freshness,
    source: "live",
  };
}

function buildFallbackHealth(errorMessage: string | null): UiHealthEnvelope {
  if (!errorMessage) {
    return {
      status: "healthy",
      degradedServices: [],
      lastCheckedAt: new Date().toISOString(),
    };
  }

  const normalized = errorMessage.toLowerCase();
  const service =
    normalized.includes("telephony") || normalized.includes("cti")
      ? "telephony"
      : normalized.includes("recording")
        ? "recording"
        : "ops-api";

  return {
    status: "degraded",
    degradedServices: [
      {
        service,
        impact: errorMessage,
        severity:
          normalized.includes("down") || normalized.includes("unavailable")
            ? "critical"
            : "warning",
      },
    ],
    lastCheckedAt: new Date().toISOString(),
  };
}

function buildWorkspaceAction(
  hasActiveSession: boolean,
): ResourceActionDescriptor {
  const disabledReasonCode = hasActiveSession
    ? "active_session_exists"
    : undefined;

  return {
    action: "open_call_session",
    enabled: !hasActiveSession,
    riskLevel: "low",
    ...(disabledReasonCode ? { disabledReasonCode } : {}),
  };
}

function buildSessionActions(
  session: CallSessionRecord,
): ResourceActionDescriptor[] {
  const isClosed = session.status === "closed";
  const hasLinkedOrder = Boolean(session.linkedOrderId);
  const hasComplaint = Boolean(session.linkedCaseNo);
  const hasPendingCallback = session.callbackTask?.status === "pending";

  const createDescriptor = (
    action: string,
    enabled: boolean,
    riskLevel: ResourceActionDescriptor["riskLevel"],
    disabledReasonCode?: string,
    requiresReason = false,
  ): ResourceActionDescriptor => ({
    action,
    enabled,
    riskLevel,
    ...(disabledReasonCode ? { disabledReasonCode } : {}),
    ...(requiresReason ? { requiresReason: true } : {}),
  });

  return [
    createDescriptor(
      "announce_identity",
      !isClosed && !session.agentIdentityAnnounced,
      "low",
      isClosed
        ? "session_closed"
        : session.agentIdentityAnnounced
          ? "identity_already_announced"
          : undefined,
    ),
    createDescriptor(
      "close_session",
      !isClosed,
      "low",
      isClosed ? "session_closed" : undefined,
    ),
    createDescriptor(
      "quote_eta",
      !isClosed,
      "low",
      isClosed ? "session_closed" : undefined,
    ),
    createDescriptor(
      "create_callback",
      !isClosed,
      "low",
      isClosed ? "session_closed" : undefined,
    ),
    createDescriptor(
      "complete_callback",
      !isClosed && hasPendingCallback,
      "low",
      isClosed
        ? "session_closed"
        : hasPendingCallback
          ? undefined
          : "callback_missing",
    ),
    createDescriptor(
      "create_phone_booking",
      !isClosed && !hasLinkedOrder && !hasComplaint,
      "medium",
      isClosed
        ? "session_closed"
        : hasLinkedOrder
          ? "linked_order_exists"
          : hasComplaint
            ? "complaint_exists"
            : undefined,
    ),
    createDescriptor(
      "link_existing_order",
      !isClosed && !hasLinkedOrder && !hasComplaint,
      "low",
      isClosed
        ? "session_closed"
        : hasLinkedOrder
          ? "linked_order_exists"
          : hasComplaint
            ? "complaint_exists"
            : undefined,
    ),
    createDescriptor(
      "transfer_to_complaint",
      !isClosed && !hasComplaint,
      "medium",
      isClosed
        ? "session_closed"
        : hasComplaint
          ? "complaint_exists"
          : undefined,
    ),
    createDescriptor(
      "attach_recording",
      !isClosed,
      "high",
      isClosed ? "session_closed" : undefined,
      true,
    ),
  ];
}

function buildSessionLinks(session: CallSessionRecord): CrossAppResourceLink[] {
  const links: CrossAppResourceLink[] = [];

  if (session.linkedOrderId) {
    links.push({
      targetApp: "ops-console",
      route: `/dispatch/${encodeURIComponent(session.linkedOrderId)}`,
      resourceType: "order",
      resourceId: session.linkedOrderId,
      openMode: "same_tab",
      label: "Dispatch workspace",
    });
  }

  if (session.linkedCaseNo) {
    links.push({
      targetApp: "ops-console",
      route: `/complaints/${encodeURIComponent(session.linkedCaseNo)}`,
      resourceType: "complaint_case",
      resourceId: session.linkedCaseNo,
      openMode: "same_tab",
      label: "Complaint detail",
    });
  }

  return links;
}

function buildSessionResource(session: RuntimeSessionRecord): SessionResource {
  return {
    ...session,
    // Honor a server-sent explicit array (including an empty []) so a row the
    // server marks read-only stays read-only per packet §3.5 / Q-X13. Only fall
    // back to client-built actions/links when the server omitted them entirely.
    availableActions: Array.isArray(session.availableActions)
      ? session.availableActions
      : buildSessionActions(session),
    deepLinks: Array.isArray(session.deepLinks)
      ? session.deepLinks
      : buildSessionLinks(session),
  };
}

function isRefreshStale(refresh: UiRefreshMetadata) {
  const generatedAt = new Date(refresh.generatedAt).getTime();
  if (Number.isNaN(generatedAt)) {
    return refresh.dataFreshness !== "fresh";
  }

  return (
    refresh.dataFreshness !== "fresh" ||
    Date.now() - generatedAt > refresh.staleAfterMs
  );
}

function formatRelativeDeadline(value: string, locale: Locale) {
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

function getCallbackSummary(callback: CallbackTaskRecord, locale: Locale) {
  const parts = [
    callback.agentId ?? (locale === "en" ? "Unassigned" : "未指派"),
    callback.note ?? (locale === "en" ? "No note" : "無備註"),
  ];

  return parts.join(" · ");
}

function describeAction(
  locale: Locale,
  descriptor: ResourceActionDescriptor,
  onCancelled?: () => void,
) {
  if (typeof window === "undefined") {
    return { proceed: true, reason: "" };
  }

  if (descriptor.riskLevel !== "low") {
    const confirmed = window.confirm(
      locale === "en"
        ? `Confirm ${getActionLabel(locale, descriptor.action)}?`
        : `確認執行「${getActionLabel(locale, descriptor.action)}」？`,
    );
    if (!confirmed) {
      onCancelled?.();
      return { proceed: false, reason: "" };
    }
  }

  if (descriptor.requiresReason) {
    const reason = window.prompt(
      locale === "en"
        ? "Enter an operator note for this high-risk action."
        : "請輸入這個高風險動作的操作備註。",
      "",
    );
    if (!reason?.trim()) {
      onCancelled?.();
      return { proceed: false, reason: "" };
    }
    return { proceed: true, reason: reason.trim() };
  }

  return { proceed: true, reason: "" };
}

function renderActionMeta(
  locale: Locale,
  descriptor: ResourceActionDescriptor,
) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <span style={subtleTextStyle}>
        {getRiskLabel(locale, descriptor.riskLevel)}
      </span>
      {descriptor.disabledReasonCode && !descriptor.enabled ? (
        <span style={subtleTextStyle}>
          {getDisabledReasonLabel(locale, descriptor.disabledReasonCode)}
        </span>
      ) : null}
      {descriptor.requiresReason ? (
        <span style={subtleTextStyle}>
          {locale === "en" ? "Reason required" : "需要理由"}
        </span>
      ) : null}
    </div>
  );
}

function getActionHelper(
  locale: Locale,
  descriptor?: ResourceActionDescriptor,
): ReactNode {
  return descriptor ? renderActionMeta(locale, descriptor) : undefined;
}

function getPillToneForRecordingState(
  recordingState: CallRecordingState,
): CanvasTone {
  switch (recordingState) {
    case "ready":
      return "success";
    case "missing":
      return "danger";
    case "pending":
    default:
      return "warn";
  }
}

function getToneForHealthStatus(
  status: UiHealthEnvelope["status"],
): CanvasTone {
  return status === "healthy" ? "success" : "warn";
}

function getToneForEmptyReason(reason: EmptyReason): CanvasTone {
  switch (reason) {
    case "fetch_failed":
    case "permission_denied":
      return "danger";
    case "external_unavailable":
    case "not_provisioned":
      return "warn";
    case "filtered_empty":
      return "info";
    case "no_data":
    default:
      return "neutral";
  }
}

export default function CallcenterPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const currentLocale = locale as Locale;
  const resolveErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : t("common.unknown");

  const [sessions, setSessions] = useState<RuntimeSessionRecord[]>([]);
  const [callbacks, setCallbacks] = useState<RuntimeCallbackRecord[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OwnedOrderRecord | null>(
    null,
  );
  const [dispatchTrace, setDispatchTrace] = useState<DispatchTraceLogRecord[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [outcomeNotice, setOutcomeNotice] = useState<OutcomeNotice | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [queueView, setQueueView] = useState<QueueView>("sessions");
  const [showIntake, setShowIntake] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [sessionRefresh, setSessionRefresh] = useState<UiRefreshMetadata>(
    FALLBACK_REFRESH_METADATA,
  );
  const [callbackRefresh, setCallbackRefresh] = useState<UiRefreshMetadata>(
    FALLBACK_REFRESH_METADATA,
  );
  const [sessionEmptyReason, setSessionEmptyReason] =
    useState<EmptyReason | null>(null);
  const [callbackEmptyReason, setCallbackEmptyReason] =
    useState<EmptyReason | null>(null);
  const [, setSessionEmptyNextAction] =
    useState<ResourceActionDescriptor | null>(null);
  const [, setCallbackEmptyNextAction] =
    useState<ResourceActionDescriptor | null>(null);
  const [health, setHealth] = useState<UiHealthEnvelope>(
    buildFallbackHealth(null),
  );
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

  const sessionResources = useMemo(
    () =>
      [...sessions]
        .sort(compareCallSessionPriority)
        .map((session) => buildSessionResource(session)),
    [sessions],
  );

  const filteredSessions = useMemo(() => {
    if (!deferredQuery) {
      return sessionResources;
    }

    return sessionResources.filter((session) => {
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
  }, [deferredQuery, sessionResources]);

  const selectedSession =
    sessionResources.find((session) => session.callId === selectedCallId) ??
    null;

  const activeSessions = filteredSessions.filter(
    (session) => session.status === "active",
  );
  const waitingSessions = activeSessions.filter(
    (session) => session.callId !== selectedSession?.callId,
  );
  const sessionHistory = filteredSessions
    .filter((session) => session.status === "closed")
    .sort(
      (left, right) =>
        new Date(right.endedAt ?? right.startedAt).getTime() -
        new Date(left.endedAt ?? left.startedAt).getTime(),
    );
  const recordingQueue = filteredSessions.filter(
    (session) => session.recordingState !== "ready",
  );
  const callbackQueue = [...callbacks].sort(
    (left, right) =>
      new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime(),
  );
  const filteredCallbackQueue = callbackQueue.filter((callback) => {
    if (!deferredQuery) {
      return true;
    }

    const haystack = [
      callback.callbackTaskId,
      callback.callId,
      callback.agentId ?? "",
      callback.note ?? "",
      callback.status,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(deferredQuery);
  });
  const pendingCallbacks = filteredCallbackQueue.filter(
    (callback) => callback.status === "pending",
  );
  const hasFilteredEmpty =
    deferredQuery.length > 0 &&
    filteredSessions.length === 0 &&
    filteredCallbackQueue.length === 0;
  const emptyReason = classifyEmptyReason(
    error,
    hasFilteredEmpty,
    sessions.length,
    callbacks.length,
  );
  const effectiveEmptyReason =
    emptyReason === "no_data"
      ? (sessionEmptyReason ?? callbackEmptyReason ?? emptyReason)
      : emptyReason;
  const emptyCopy = getEmptyStateCopy(currentLocale, effectiveEmptyReason);
  const workspaceAction = buildWorkspaceAction(
    sessions.some((session) => session.status === "active"),
  );
  const activeRefresh =
    queueView === "callback" ? callbackRefresh : sessionRefresh;
  const workspaceStale = isRefreshStale(activeRefresh);
  const tabs = [
    {
      id: "sessions" as const,
      label: currentLocale === "en" ? "Sessions" : "當前 session",
      badge: activeSessions.length,
    },
    {
      id: "callback" as const,
      label: currentLocale === "en" ? "Callback queue" : "Callback 佇列",
      badge: pendingCallbacks.length,
    },
    {
      id: "recording" as const,
      label: currentLocale === "en" ? "Recordings" : "錄音待補",
      badge: recordingQueue.length,
    },
  ];

  const openSessionsCount = sessions.filter(
    (session) => session.status === "active",
  ).length;
  const recordingGapCount = sessions.filter(
    (session) => session.recordingState !== "ready",
  ).length;
  const complaintTransferCount = sessions.filter(
    (session) => session.linkedCaseNo,
  ).length;

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadData(selectedCallId ?? undefined, true);
    }, CALLCENTER_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [selectedCallId]);

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

  async function loadData(preferredCallId?: string, silent = false) {
    if (!silent) {
      setLoading(true);
    }

    try {
      const client = getOpsClient();
      const [nextSessionsEnvelope, nextCallbacksEnvelope] = await Promise.all([
        client.get<CallcenterListEnvelope<RuntimeSessionRecord>>(
          "/api/callcenter/sessions",
        ),
        client.get<CallcenterListEnvelope<RuntimeCallbackRecord>>(
          "/api/callcenter/callbacks",
        ),
      ]);

      const nextSessions = nextSessionsEnvelope.items ?? [];
      const nextCallbacks = nextCallbacksEnvelope.items ?? [];
      const nextHealth =
        nextSessionsEnvelope.health ??
        nextCallbacksEnvelope.health ??
        buildFallbackHealth(null);

      setSessions(nextSessions);
      setCallbacks(nextCallbacks);
      setSessionRefresh(
        nextSessionsEnvelope.refresh ?? buildFallbackRefreshMetadata("fresh"),
      );
      setCallbackRefresh(
        nextCallbacksEnvelope.refresh ?? buildFallbackRefreshMetadata("fresh"),
      );
      setSessionEmptyReason(nextSessionsEnvelope.emptyState?.reason ?? null);
      setCallbackEmptyReason(nextCallbacksEnvelope.emptyState?.reason ?? null);
      setSessionEmptyNextAction(
        nextSessionsEnvelope.emptyState?.nextAction ?? null,
      );
      setCallbackEmptyNextAction(
        nextCallbacksEnvelope.emptyState?.nextAction ?? null,
      );
      setHealth(nextHealth);
      setLastRefreshAt(new Date().toISOString());
      setError(null);

      const sorted = [...nextSessions].sort(compareCallSessionPriority);
      const fallbackSelection =
        sorted.find((session) => session.callId === preferredCallId)?.callId ??
        sorted.find((session) => session.callId === selectedCallId)?.callId ??
        sorted.find((session) => session.status === "active")?.callId ??
        sorted[0]?.callId ??
        null;
      setSelectedCallId(fallbackSelection);
    } catch (nextError) {
      const message = resolveErrorMessage(nextError);
      setError(message);
      setSessionRefresh(buildFallbackRefreshMetadata("degraded"));
      setCallbackRefresh(buildFallbackRefreshMetadata("degraded"));
      setHealth(buildFallbackHealth(message));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function runGuardedAction(
    key: string,
    descriptor: ResourceActionDescriptor | undefined,
    action: (reason: string) => Promise<void>,
  ) {
    if (!descriptor?.enabled) {
      return;
    }

    const guard = describeAction(currentLocale, descriptor);
    if (!guard.proceed) {
      return;
    }

    setBusyKey(key);
    try {
      await action(guard.reason);
      setError(null);
    } catch (nextError) {
      setError(resolveErrorMessage(nextError));
    } finally {
      setBusyKey(null);
    }
  }

  const announceAction = selectedSession
    ? getActionDescriptor(selectedSession.availableActions, "announce_identity")
    : undefined;
  const closeAction = selectedSession
    ? getActionDescriptor(selectedSession.availableActions, "close_session")
    : undefined;
  const quoteEtaAction = selectedSession
    ? getActionDescriptor(selectedSession.availableActions, "quote_eta")
    : undefined;
  const callbackAction = selectedSession
    ? getActionDescriptor(selectedSession.availableActions, "create_callback")
    : undefined;
  const completeCallbackAction = selectedSession
    ? getActionDescriptor(selectedSession.availableActions, "complete_callback")
    : undefined;
  const createBookingAction = selectedSession
    ? getActionDescriptor(
        selectedSession.availableActions,
        "create_phone_booking",
      )
    : undefined;
  const linkOrderAction = selectedSession
    ? getActionDescriptor(
        selectedSession.availableActions,
        "link_existing_order",
      )
    : undefined;
  const transferComplaintAction = selectedSession
    ? getActionDescriptor(
        selectedSession.availableActions,
        "transfer_to_complaint",
      )
    : undefined;
  const attachRecordingAction = selectedSession
    ? getActionDescriptor(selectedSession.availableActions, "attach_recording")
    : undefined;
  const activeTabIndex = tabs.findIndex((tab) => tab.id === queueView);
  const headerTabs = tabs.map((tab) => (
    <button
      key={tab.id}
      type="button"
      onClick={() => setQueueView(tab.id)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        border: 0,
        background: "transparent",
        color: "inherit",
        padding: 0,
        cursor: "pointer",
      }}
    >
      <span>{tab.label}</span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 22,
          minHeight: 22,
          padding: "0 7px",
          borderRadius: 999,
          background: theme.surfaceLo,
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {tab.badge}
      </span>
    </button>
  ));

  const waitingColumns: CanvasTableColumn<SessionResource>[] = [
    {
      h: currentLocale === "en" ? "Call" : "通話",
      r: (session) => (
        <button
          type="button"
          style={queueButtonStyle}
          onClick={() => setSelectedCallId(session.callId)}
        >
          <div style={{ fontWeight: 600 }}>{session.callId}</div>
          <div style={subtleTextStyle}>
            {formatOpsCodeLabel(currentLocale, session.callType)} ·{" "}
            {session.callerPhone}
          </div>
        </button>
      ),
    },
    {
      h: currentLocale === "en" ? "Started" : "開始時間",
      r: (session) => formatDateTime(currentLocale, session.startedAt),
    },
  ];

  const callbackColumns: CanvasTableColumn<RuntimeCallbackRecord>[] = [
    {
      h: currentLocale === "en" ? "Task" : "任務",
      r: (callback) => (
        <button
          type="button"
          style={queueButtonStyle}
          onClick={() => setSelectedCallId(callback.callId)}
        >
          <div style={{ fontWeight: 600 }}>{callback.callbackTaskId}</div>
          <div style={subtleTextStyle}>
            {getCallbackSummary(callback, currentLocale)}
          </div>
        </button>
      ),
    },
    {
      h: currentLocale === "en" ? "Due" : "到期",
      r: (callback) => formatRelativeDeadline(callback.dueAt, currentLocale),
    },
  ];

  const recordingColumns: CanvasTableColumn<SessionResource>[] = [
    {
      h: currentLocale === "en" ? "Session" : "Session",
      r: (session) => (
        <button
          type="button"
          style={queueButtonStyle}
          onClick={() => setSelectedCallId(session.callId)}
        >
          <div style={{ fontWeight: 600 }}>{session.callId}</div>
          <div style={subtleTextStyle}>{session.callerPhone}</div>
        </button>
      ),
    },
    {
      h: currentLocale === "en" ? "Recording" : "錄音",
      r: (session) => (
        <CanvasPill
          theme={theme}
          tone={getPillToneForRecordingState(session.recordingState)}
        >
          {formatOpsCodeLabel(currentLocale, session.recordingState)}
        </CanvasPill>
      ),
    },
  ];

  const historyColumns: CanvasTableColumn<SessionResource>[] = [
    {
      h: currentLocale === "en" ? "Session" : "Session",
      r: (session) => (
        <button
          type="button"
          style={queueButtonStyle}
          onClick={() => setSelectedCallId(session.callId)}
        >
          <div style={{ fontWeight: 600 }}>{session.callId}</div>
          <div style={subtleTextStyle}>
            {formatOpsCodeLabel(currentLocale, session.callType)} ·{" "}
            {session.callerPhone}
          </div>
        </button>
      ),
    },
    {
      h: currentLocale === "en" ? "Closed" : "結束",
      r: (session) => formatDateTime(currentLocale, session.endedAt),
    },
  ];

  const traceColumns: CanvasTableColumn<DispatchTraceLogRecord>[] = [
    {
      h: currentLocale === "en" ? "Event" : "事件",
      r: (entry) => (
        <div>
          <div style={{ fontWeight: 600 }}>
            {formatOpsCodeLabel(currentLocale, entry.eventType)}
          </div>
          <div style={subtleTextStyle}>{entry.message}</div>
        </div>
      ),
    },
    {
      h: currentLocale === "en" ? "At" : "時間",
      r: (entry) => formatDateTime(currentLocale, entry.createdAt),
    },
  ];

  return (
    <>
      <PageHeader
        theme={theme}
        title={t("callcenter.title")}
        subtitle={
          currentLocale === "en"
            ? "One active session per agent. Waiting, callback, recording, and history queues stay visible in the same workspace."
            : "每位 agent 同時間僅一個 active session，等待 / callback / 錄音 / 歷史佇列維持在同一個 workspace。"
        }
        tabs={headerTabs}
        activeTab={headerTabs[activeTabIndex] ?? headerTabs[0]}
        actions={[
          <CanvasBtn
            key="open-session"
            onClick={() => setShowIntake((current) => !current)}
            disabled={!workspaceAction.enabled}
            variant="primary"
          >
            {showIntake
              ? t("callcenter.hideIntake")
              : getActionLabel(currentLocale, "open_call_session")}
          </CanvasBtn>,
          <CanvasBtn
            key="close-session"
            disabled={!closeAction?.enabled || busyKey === "close-header"}
            onClick={() =>
              selectedSession &&
              void runGuardedAction("close-header", closeAction, async () => {
                await getOpsClient().closeCallSession(selectedSession.callId);
                setOutcomeNotice({
                  tone: "success",
                  message:
                    currentLocale === "en"
                      ? `Session ${selectedSession.callId} closed.`
                      : `已關閉 session ${selectedSession.callId}。`,
                });
                await loadData(selectedSession.callId);
              })
            }
          >
            {currentLocale === "en" ? "Close current" : "結束目前"}
          </CanvasBtn>,
        ]}
        sticky={false}
      />

      <div style={pageBodyStyle}>
        <CanvasCard
          theme={theme}
          title={
            selectedSession
              ? `${selectedSession.callId} · ${formatOpsCodeLabel(currentLocale, selectedSession.callType)}`
              : currentLocale === "en"
                ? "Idle workspace"
                : "Idle workspace"
          }
          subtitle={
            currentLocale === "en"
              ? `Refresh tier ${CALLCENTER_REFRESH_TIER} · one active session per agent`
              : `Refresh tier ${CALLCENTER_REFRESH_TIER} · 每位 agent 僅一個 active session`
          }
          actions={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <CanvasPill
                theme={theme}
                tone={workspaceStale ? "warn" : "success"}
              >
                {workspaceStale
                  ? currentLocale === "en"
                    ? "Stale"
                    : "已過期"
                  : currentLocale === "en"
                    ? "Fresh"
                    : "最新"}
              </CanvasPill>
              <CanvasPill
                theme={theme}
                tone={getToneForHealthStatus(health.status)}
              >
                {health.status === "healthy"
                  ? currentLocale === "en"
                    ? "Healthy"
                    : "健康"
                  : currentLocale === "en"
                    ? "Degraded"
                    : "降級中"}
              </CanvasPill>
            </div>
          }
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <CanvasKPI
              theme={theme}
              label={
                currentLocale === "en" ? "Open sessions" : "Active session"
              }
              value={String(openSessionsCount)}
            />
            <CanvasKPI
              theme={theme}
              label={
                currentLocale === "en" ? "Pending callbacks" : "待回覆 callback"
              }
              value={String(pendingCallbacks.length)}
            />
            <CanvasKPI
              theme={theme}
              label={currentLocale === "en" ? "Recording gaps" : "錄音待補"}
              value={String(recordingGapCount)}
            />
            <CanvasKPI
              theme={theme}
              label={
                currentLocale === "en" ? "Complaint transfers" : "客訴轉案"
              }
              value={String(complaintTransferCount)}
            />
          </div>
          <div style={formGridStyle}>
            <CanvasField theme={theme} label={t("callcenter.search")}>
              <input
                type="search"
                value={query}
                placeholder={t("callcenter.search")}
                onChange={(event) => setQuery(event.target.value)}
                style={nativeInputStyle}
              />
            </CanvasField>
            <CanvasField
              theme={theme}
              label={currentLocale === "en" ? "Last refresh" : "最近刷新"}
            >
              <CanvasInput
                theme={theme}
                value={
                  lastRefreshAt
                    ? formatDateTime(currentLocale, lastRefreshAt)
                    : "—"
                }
              />
            </CanvasField>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CanvasBtn
              theme={theme}
              onClick={() => {
                void loadData(selectedCallId ?? undefined);
              }}
            >
              {currentLocale === "en" ? "Refresh now" : "立即刷新"}
            </CanvasBtn>
            <CanvasPill theme={theme} tone="neutral">
              {health.degradedServices.length > 0
                ? health.degradedServices
                    .map(
                      (service: UiHealthEnvelope["degradedServices"][number]) =>
                        service.service,
                    )
                    .join(" · ")
                : currentLocale === "en"
                  ? "No degraded dependencies"
                  : "目前沒有降級依賴"}
            </CanvasPill>
          </div>
        </CanvasCard>

        {outcomeNotice ? (
          <CanvasBanner
            theme={theme}
            tone={outcomeNotice.tone === "success" ? "success" : "warn"}
            icon={outcomeNotice.tone === "success" ? "ok" : "warn"}
            title={outcomeNotice.message}
            body={
              outcomeNotice.href && outcomeNotice.label ? (
                outcomeNotice.external ? (
                  <a
                    href={outcomeNotice.href}
                    target="_blank"
                    rel="noreferrer"
                    style={linkPillStyle}
                  >
                    {outcomeNotice.label}
                  </a>
                ) : (
                  <Link href={outcomeNotice.href} style={linkPillStyle}>
                    {outcomeNotice.label}
                  </Link>
                )
              ) : undefined
            }
          />
        ) : null}

        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={currentLocale === "en" ? "Error" : "錯誤"}
            body={error}
          />
        ) : null}

        {showIntake ? (
          <CanvasCard
            theme={theme}
            title={t("callcenter.newIntake")}
            subtitle={t("callcenter.intakeNote")}
            actions={
              <CanvasPill
                theme={theme}
                tone={workspaceAction.enabled ? "success" : "warn"}
              >
                {workspaceAction.enabled
                  ? currentLocale === "en"
                    ? "Ready"
                    : "可建立"
                  : currentLocale === "en"
                    ? "Blocked by active session"
                    : "受 active session 限制"}
              </CanvasPill>
            }
          >
            <form
              style={intakeGridStyle}
              onSubmit={(event) => {
                event.preventDefault();
                void runGuardedAction(
                  "open-intake",
                  workspaceAction,
                  async () => {
                    const created =
                      await getOpsClient().openCallSession(intakeForm);
                    setShowIntake(false);
                    setIntakeForm(INITIAL_INTAKE_FORM);
                    setSelectedCallId(created.callId);
                    setOutcomeNotice({
                      tone: "success",
                      message:
                        currentLocale === "en"
                          ? `Session ${created.callId} opened.`
                          : `已開啟 session ${created.callId}。`,
                    });
                    await loadData(created.callId);
                  },
                );
              }}
            >
              <CanvasField
                theme={theme}
                label={t("callcenter.form.callType")}
                required
              >
                <>
                  <CanvasSelect
                    theme={theme}
                    value={formatOpsCodeLabel(
                      currentLocale,
                      intakeForm.callType,
                    )}
                  />
                  <select
                    value={intakeForm.callType}
                    onChange={(event) =>
                      setIntakeForm((current: OpenCallSessionCommand) => ({
                        ...current,
                        callType: event.target
                          .value as OpenCallSessionCommand["callType"],
                      }))
                    }
                    style={{ ...nativeInputStyle, marginTop: 6 }}
                  >
                    {CALL_TYPE_OPTIONS.map((callType) => (
                      <option key={callType} value={callType}>
                        {formatOpsCodeLabel(currentLocale, callType)}
                      </option>
                    ))}
                  </select>
                </>
              </CanvasField>
              <CanvasField
                theme={theme}
                label={t("callcenter.form.callerPhone")}
                required
              >
                <input
                  type="text"
                  required
                  value={intakeForm.callerPhone}
                  onChange={(event) =>
                    setIntakeForm((current: OpenCallSessionCommand) => ({
                      ...current,
                      callerPhone: event.target.value,
                    }))
                  }
                  style={nativeInputStyle}
                />
              </CanvasField>
              <CanvasField
                theme={theme}
                label={t("callcenter.form.agentId")}
                required
              >
                <input
                  type="text"
                  required
                  value={intakeForm.agentId ?? ""}
                  onChange={(event) =>
                    setIntakeForm((current: OpenCallSessionCommand) => ({
                      ...current,
                      agentId: event.target.value,
                    }))
                  }
                  style={nativeInputStyle}
                />
              </CanvasField>
              <CanvasField theme={theme} label={t("callcenter.form.announced")}>
                <label
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <input
                    type="checkbox"
                    checked={intakeForm.agentIdentityAnnounced}
                    onChange={(event) =>
                      setIntakeForm((current: OpenCallSessionCommand) => ({
                        ...current,
                        agentIdentityAnnounced: event.target.checked,
                      }))
                    }
                  />
                  <span style={subtleTextStyle}>
                    {t("callcenter.form.announced")}
                  </span>
                </label>
              </CanvasField>
              <div style={{ display: "flex", alignItems: "end" }}>
                <CanvasActionButton
                  theme={theme}
                  disabled={!workspaceAction.enabled}
                  helper={getActionHelper(currentLocale, workspaceAction)}
                  busy={busyKey === "open-intake"}
                  label={
                    busyKey === "open-intake"
                      ? t("callcenter.form.opening")
                      : t("callcenter.form.openSession")
                  }
                  variant="primary"
                  type="submit"
                />
              </div>
            </form>
          </CanvasCard>
        ) : null}

        <div style={workspaceGridStyle}>
          <div style={columnStackStyle}>
            <CanvasCard
              theme={theme}
              title={currentLocale === "en" ? "Waiting list" : "等待佇列"}
              subtitle={
                queueView === "sessions"
                  ? currentLocale === "en"
                    ? "Other active calls in the same workspace"
                    : "同一 workspace 內其他 active 通話"
                  : queueView === "callback"
                    ? currentLocale === "en"
                      ? "Use the tabs to pivot queue attention"
                      : "用上方 tabs 切換 queue 焦點"
                    : currentLocale === "en"
                      ? "Recording issues remain visible beside the session"
                      : "錄音缺口需與 session 並列可見"
              }
              actions={
                <CanvasPill theme={theme}>{waitingSessions.length}</CanvasPill>
              }
              padding={0}
            >
              {waitingSessions.length > 0 ? (
                <CanvasTable
                  theme={theme}
                  columns={waitingColumns}
                  rows={waitingSessions}
                />
              ) : (
                <div style={{ padding: 16 }}>
                  <CanvasEmptyState
                    theme={theme}
                    tone="neutral"
                    title={
                      currentLocale === "en"
                        ? "No waiting calls"
                        : "目前沒有等待通話"
                    }
                    body={
                      currentLocale === "en"
                        ? "One-active-session enforcement is holding; no additional live calls are waiting."
                        : "一個 agent 一個 active session 規則已生效，沒有額外等待中的 live call。"
                    }
                  />
                </div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={
                currentLocale === "en" ? "Workspace status" : "Workspace 狀態"
              }
              subtitle={
                currentLocale === "en"
                  ? "Contract-driven affordances stay visible even when disabled."
                  : "由 contract 驅動的 affordance 即使 disabled 也會保留。"
              }
            >
              {selectedSession ? (
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      label:
                        currentLocale === "en"
                          ? "availableActions"
                          : "availableActions",
                      value: String(selectedSession.availableActions.length),
                    },
                    {
                      label:
                        currentLocale === "en" ? "Deep links" : "Deep links",
                      value: String(selectedSession.deepLinks.length),
                    },
                    {
                      label: currentLocale === "en" ? "Health" : "健康度",
                      value: health.status,
                    },
                    {
                      label:
                        currentLocale === "en"
                          ? "Refresh tier"
                          : "Refresh tier",
                      value: CALLCENTER_REFRESH_TIER,
                    },
                  ]}
                />
              ) : (
                <CanvasEmptyState
                  theme={theme}
                  tone={getToneForEmptyReason(effectiveEmptyReason)}
                  title={emptyCopy.title}
                  body={emptyCopy.body}
                />
              )}
            </CanvasCard>
          </div>

          <div style={columnStackStyle}>
            <CanvasCard
              theme={theme}
              title={
                selectedSession
                  ? selectedSession.callId
                  : currentLocale === "en"
                    ? "Active session"
                    : "Active session"
              }
              subtitle={
                currentLocale === "en"
                  ? "Must-show session facts stay in CanvasField / CanvasInput / CanvasSelect blocks."
                  : "必顯示欄位以 CanvasField / CanvasInput / CanvasSelect 呈現。"
              }
              actions={
                selectedSession ? (
                  <CanvasPill
                    theme={theme}
                    tone={getPillToneForRecordingState(
                      selectedSession.recordingState,
                    )}
                  >
                    {formatOpsCodeLabel(
                      currentLocale,
                      selectedSession.recordingState,
                    )}
                  </CanvasPill>
                ) : undefined
              }
            >
              {loading ? (
                <CanvasEmptyState
                  theme={theme}
                  tone="info"
                  title={
                    currentLocale === "en"
                      ? "Loading workspace"
                      : "載入 workspace"
                  }
                  body={
                    currentLocale === "en"
                      ? "Refreshing sessions, callbacks, and recording state."
                      : "正在刷新 sessions、callbacks 與錄音狀態。"
                  }
                />
              ) : selectedSession ? (
                <>
                  <div style={formGridStyle}>
                    <CanvasField
                      theme={theme}
                      label={currentLocale === "en" ? "Call type" : "通話類型"}
                    >
                      <CanvasSelect
                        theme={theme}
                        value={formatOpsCodeLabel(
                          currentLocale,
                          selectedSession.callType,
                        )}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={
                        currentLocale === "en" ? "Caller phone" : "來電號碼"
                      }
                    >
                      <CanvasInput
                        theme={theme}
                        value={selectedSession.callerPhone}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={currentLocale === "en" ? "Agent" : "客服人員"}
                    >
                      <CanvasInput
                        theme={theme}
                        value={selectedSession.agentId ?? "—"}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={
                        currentLocale === "en" ? "Linked records" : "已連結紀錄"
                      }
                    >
                      <CanvasInput
                        theme={theme}
                        value={
                          selectedSession.linkedOrderId ??
                          selectedSession.linkedCaseNo ??
                          "—"
                        }
                      />
                    </CanvasField>
                  </div>
                  <CanvasDL
                    theme={theme}
                    items={[
                      {
                        label: currentLocale === "en" ? "Started" : "開始時間",
                        value: formatDateTime(
                          currentLocale,
                          selectedSession.startedAt,
                        ),
                      },
                      {
                        label:
                          currentLocale === "en"
                            ? "Agent identity"
                            : "身分告知",
                        value: selectedSession.agentIdentityAnnounced
                          ? currentLocale === "en"
                            ? `Announced at ${formatDateTime(currentLocale, selectedSession.agentIdentityAnnouncedAt)}`
                            : `${formatDateTime(currentLocale, selectedSession.agentIdentityAnnouncedAt)} 已告知`
                          : currentLocale === "en"
                            ? "Not announced"
                            : "尚未告知",
                      },
                      {
                        label: currentLocale === "en" ? "Flags" : "旗標",
                        value:
                          selectedSession.flags.length > 0
                            ? formatOpsCodeList(
                                currentLocale,
                                selectedSession.flags,
                              )
                            : "—",
                      },
                      {
                        label: currentLocale === "en" ? "Last ETA" : "最近 ETA",
                        value: selectedSession.lastEtaQuotedMinutes
                          ? `${selectedSession.lastEtaQuotedMinutes} min`
                          : "—",
                      },
                    ]}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {selectedSession.deepLinks.length > 0 ? (
                      selectedSession.deepLinks.map(
                        (link: CrossAppResourceLink) =>
                          link.openMode === "new_tab" ? (
                            <a
                              key={`${link.targetApp}-${link.resourceId}-${link.route}`}
                              href={link.route}
                              target="_blank"
                              rel="noreferrer"
                              style={linkPillStyle}
                            >
                              {link.label}
                            </a>
                          ) : (
                            <Link
                              key={`${link.targetApp}-${link.resourceId}-${link.route}`}
                              href={link.route}
                              style={linkPillStyle}
                            >
                              {link.label}
                            </Link>
                          ),
                      )
                    ) : (
                      <span style={subtleTextStyle}>
                        {currentLocale === "en"
                          ? "No linked resources"
                          : "尚無 linked resource"}
                      </span>
                    )}
                  </div>
                  <div style={actionGridStyle}>
                    <CanvasActionButton
                      theme={theme}
                      disabled={!announceAction?.enabled}
                      helper={getActionHelper(currentLocale, announceAction)}
                      busy={busyKey === "announce"}
                      label={getActionLabel(currentLocale, "announce_identity")}
                      onClick={() =>
                        selectedSession &&
                        void runGuardedAction(
                          "announce",
                          announceAction,
                          async () => {
                            await getOpsClient().announceCallAgentIdentity(
                              selectedSession.callId,
                              {
                                agentId:
                                  selectedSession.agentId ??
                                  intakeForm.agentId ??
                                  "AGENT-OPS-001",
                              },
                            );
                            setOutcomeNotice({
                              tone: "success",
                              message:
                                currentLocale === "en"
                                  ? `Identity announced for ${selectedSession.callId}.`
                                  : `已為 ${selectedSession.callId} 標記身分告知。`,
                            });
                            await loadData(selectedSession.callId);
                          },
                        )
                      }
                    />
                    <CanvasActionButton
                      theme={theme}
                      disabled={!closeAction?.enabled}
                      helper={getActionHelper(currentLocale, closeAction)}
                      busy={busyKey === "close"}
                      label={getActionLabel(currentLocale, "close_session")}
                      danger
                      onClick={() =>
                        selectedSession &&
                        void runGuardedAction(
                          "close",
                          closeAction,
                          async () => {
                            await getOpsClient().closeCallSession(
                              selectedSession.callId,
                            );
                            setOutcomeNotice({
                              tone: "success",
                              message:
                                currentLocale === "en"
                                  ? `Session ${selectedSession.callId} closed.`
                                  : `已關閉 session ${selectedSession.callId}。`,
                            });
                            await loadData(selectedSession.callId);
                          },
                        )
                      }
                    />
                    <CanvasActionButton
                      theme={theme}
                      disabled={!quoteEtaAction?.enabled}
                      helper={getActionHelper(currentLocale, quoteEtaAction)}
                      busy={busyKey === "quote-eta"}
                      label={getActionLabel(currentLocale, "quote_eta")}
                      onClick={() =>
                        document
                          .getElementById("callcenter-session-actions")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          })
                      }
                    />
                    <CanvasActionButton
                      theme={theme}
                      disabled={!attachRecordingAction?.enabled}
                      helper={getActionHelper(
                        currentLocale,
                        attachRecordingAction,
                      )}
                      busy={busyKey === "attach-recording"}
                      label={getActionLabel(currentLocale, "attach_recording")}
                      onClick={() =>
                        document
                          .getElementById("callcenter-session-actions")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          })
                      }
                    />
                  </div>
                </>
              ) : (
                <CanvasEmptyState
                  theme={theme}
                  tone={getToneForEmptyReason(effectiveEmptyReason)}
                  title={emptyCopy.title}
                  body={emptyCopy.body}
                  action={
                    effectiveEmptyReason === "filtered_empty" ? (
                      <CanvasBtn theme={theme} onClick={() => setQuery("")}>
                        {currentLocale === "en" ? "Clear search" : "清除搜尋"}
                      </CanvasBtn>
                    ) : (
                      <CanvasBtn
                        theme={theme}
                        variant="primary"
                        disabled={!workspaceAction.enabled}
                        onClick={() => setShowIntake(true)}
                      >
                        {getActionLabel(currentLocale, "open_call_session")}
                      </CanvasBtn>
                    )
                  }
                />
              )}
            </CanvasCard>

            <div id="callcenter-session-actions">
              <CanvasCard
                theme={theme}
                title={
                  currentLocale === "en" ? "Session actions" : "Session 動作"
                }
                subtitle={
                  currentLocale === "en"
                    ? "Operate ETA, recording, booking, callback, and complaint transfer from the same column."
                    : "在同一欄內完成 ETA、錄音、建單、callback 與客訴轉案。"
                }
              >
                <div style={dualFormGridStyle}>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!selectedSession) {
                        return;
                      }
                      void runGuardedAction(
                        "quote-eta",
                        quoteEtaAction,
                        async () => {
                          await getOpsClient().quoteCallEta(
                            selectedSession.callId,
                            {
                              etaMinutes: Number(quotedEtaMinutes),
                            },
                          );
                          setOutcomeNotice({
                            tone: "success",
                            message:
                              currentLocale === "en"
                                ? `ETA ${quotedEtaMinutes} min saved.`
                                : `已儲存 ETA ${quotedEtaMinutes} 分鐘。`,
                          });
                          await loadData(selectedSession.callId);
                        },
                      );
                    }}
                  >
                    <CanvasField
                      theme={theme}
                      label={
                        currentLocale === "en" ? "ETA minutes" : "ETA 分鐘"
                      }
                    >
                      <input
                        type="number"
                        min={1}
                        value={quotedEtaMinutes}
                        onChange={(event) =>
                          setQuotedEtaMinutes(event.target.value)
                        }
                        style={nativeInputStyle}
                      />
                    </CanvasField>
                    <CanvasActionButton
                      theme={theme}
                      disabled={!quoteEtaAction?.enabled}
                      helper={getActionHelper(currentLocale, quoteEtaAction)}
                      busy={busyKey === "quote-eta"}
                      label={getActionLabel(currentLocale, "quote_eta")}
                      type="submit"
                    />
                  </form>

                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!selectedSession) {
                        return;
                      }
                      void runGuardedAction(
                        "attach-recording",
                        attachRecordingAction,
                        async (reason) => {
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
                          setOutcomeNotice({
                            tone: "warning",
                            message:
                              currentLocale === "en"
                                ? `Recording attached with operator note: ${reason}`
                                : `已補掛錄音，操作備註：${reason}`,
                          });
                          await loadData(selectedSession.callId);
                        },
                      );
                    }}
                  >
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.recordingIdPlaceholder")}
                      required
                    >
                      <input
                        type="text"
                        required
                        value={recordingForm.recordingId}
                        onChange={(event) =>
                          setRecordingForm((current: RecordingFormState) => ({
                            ...current,
                            recordingId: event.target.value,
                          }))
                        }
                        style={nativeInputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.providerRefPlaceholder")}
                    >
                      <input
                        type="text"
                        value={recordingForm.providerRecordingRef ?? ""}
                        onChange={(event) =>
                          setRecordingForm((current: RecordingFormState) => ({
                            ...current,
                            providerRecordingRef: event.target.value,
                          }))
                        }
                        style={nativeInputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.recordingUrlPlaceholder")}
                    >
                      <input
                        type="url"
                        value={recordingForm.recordingUrl ?? ""}
                        onChange={(event) =>
                          setRecordingForm((current: RecordingFormState) => ({
                            ...current,
                            recordingUrl: event.target.value,
                          }))
                        }
                        style={nativeInputStyle}
                      />
                    </CanvasField>
                    <CanvasActionButton
                      theme={theme}
                      disabled={!attachRecordingAction?.enabled}
                      helper={getActionHelper(
                        currentLocale,
                        attachRecordingAction,
                      )}
                      busy={busyKey === "attach-recording"}
                      label={getActionLabel(currentLocale, "attach_recording")}
                      type="submit"
                    />
                  </form>
                </div>
              </CanvasCard>
            </div>

            <CanvasCard
              theme={theme}
              title={
                currentLocale === "en" ? "Resolution desk" : "Resolution desk"
              }
              subtitle={
                currentLocale === "en"
                  ? "Transfer-to-complaint redirects immediately after the contract result returns."
                  : "transfer-to-complaint 在 contract 回傳後會立即跳轉。"
              }
            >
              <div style={dualFormGridStyle}>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!selectedSession) {
                      return;
                    }
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
                    void runGuardedAction(
                      "create-booking",
                      createBookingAction,
                      async () => {
                        const created =
                          await getOpsClient().createCallCenterOrder(command);
                        setOrderForm(INITIAL_ORDER_FORM);
                        setOutcomeNotice({
                          tone: "success",
                          message:
                            currentLocale === "en"
                              ? `Phone booking created from ${selectedSession.callId}.`
                              : `已從 ${selectedSession.callId} 建立電話訂單。`,
                          href: `/dispatch/${encodeURIComponent(created.orderId)}`,
                          label:
                            currentLocale === "en"
                              ? "Open dispatch workspace"
                              : "前往 dispatch workspace",
                        });
                        await loadData(selectedSession.callId);
                      },
                    );
                  }}
                >
                  <div style={formGridStyle}>
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.passengerNamePlaceholder")}
                      required
                    >
                      <input
                        type="text"
                        required
                        value={orderForm.passengerName}
                        onChange={(event) =>
                          setOrderForm((current) => ({
                            ...current,
                            passengerName: event.target.value,
                          }))
                        }
                        style={nativeInputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.passengerPhonePlaceholder")}
                    >
                      <input
                        type="text"
                        value={orderForm.passengerPhone}
                        onChange={(event) =>
                          setOrderForm((current) => ({
                            ...current,
                            passengerPhone: event.target.value,
                          }))
                        }
                        style={nativeInputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.pickupAddressPlaceholder")}
                      required
                    >
                      <input
                        type="text"
                        required
                        value={orderForm.pickupAddress}
                        onChange={(event) =>
                          setOrderForm((current) => ({
                            ...current,
                            pickupAddress: event.target.value,
                          }))
                        }
                        style={nativeInputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.dropoffAddressPlaceholder")}
                      required
                    >
                      <input
                        type="text"
                        required
                        value={orderForm.dropoffAddress}
                        onChange={(event) =>
                          setOrderForm((current) => ({
                            ...current,
                            dropoffAddress: event.target.value,
                          }))
                        }
                        style={nativeInputStyle}
                      />
                    </CanvasField>
                  </div>
                  <CanvasField
                    theme={theme}
                    label={t("callcenter.opsNotePlaceholder")}
                  >
                    <textarea
                      rows={3}
                      value={orderForm.notes}
                      onChange={(event) =>
                        setOrderForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      style={nativeTextAreaStyle}
                    />
                  </CanvasField>
                  <CanvasActionButton
                    theme={theme}
                    disabled={!createBookingAction?.enabled}
                    helper={getActionHelper(currentLocale, createBookingAction)}
                    busy={busyKey === "create-booking"}
                    label={getActionLabel(
                      currentLocale,
                      "create_phone_booking",
                    )}
                    variant="primary"
                    type="submit"
                  />
                </form>

                <div
                  style={{ display: "flex", flexDirection: "column", gap: 14 }}
                >
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!selectedSession) {
                        return;
                      }
                      void runGuardedAction(
                        "link-order",
                        linkOrderAction,
                        async () => {
                          await getOpsClient().linkCallOrder(
                            selectedSession.callId,
                            {
                              orderId: existingOrderId,
                            },
                          );
                          setExistingOrderId("");
                          setOutcomeNotice({
                            tone: "success",
                            message:
                              currentLocale === "en"
                                ? `Order ${existingOrderId} linked to ${selectedSession.callId}.`
                                : `已將訂單 ${existingOrderId} 綁定到 ${selectedSession.callId}。`,
                            href: `/dispatch/${encodeURIComponent(existingOrderId)}`,
                            label:
                              currentLocale === "en"
                                ? "Open linked dispatch"
                                : "開啟已綁定 dispatch",
                          });
                          await loadData(selectedSession.callId);
                        },
                      );
                    }}
                  >
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.existingOrderIdPlaceholder")}
                      required
                    >
                      <input
                        type="text"
                        required
                        value={existingOrderId}
                        onChange={(event) =>
                          setExistingOrderId(event.target.value)
                        }
                        style={nativeInputStyle}
                      />
                    </CanvasField>
                    <CanvasActionButton
                      theme={theme}
                      disabled={!linkOrderAction?.enabled}
                      helper={getActionHelper(currentLocale, linkOrderAction)}
                      busy={busyKey === "link-order"}
                      label={getActionLabel(
                        currentLocale,
                        "link_existing_order",
                      )}
                      type="submit"
                    />
                  </form>

                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!selectedSession) {
                        return;
                      }
                      void runGuardedAction(
                        "create-callback",
                        callbackAction,
                        async () => {
                          await getOpsClient().createCallbackTask(
                            selectedSession.callId,
                            {
                              dueAt: toIsoString(callbackDueAt),
                              note: callbackNote,
                            },
                          );
                          setCallbackDueAt("");
                          setCallbackNote("");
                          setOutcomeNotice({
                            tone: "success",
                            message:
                              currentLocale === "en"
                                ? `Callback queued for ${selectedSession.callId}.`
                                : `已為 ${selectedSession.callId} 建立 callback。`,
                          });
                          await loadData(selectedSession.callId);
                        },
                      );
                    }}
                  >
                    <CanvasField
                      theme={theme}
                      label={
                        currentLocale === "en"
                          ? "Callback due at"
                          : "Callback 到期時間"
                      }
                      required
                    >
                      <input
                        type="datetime-local"
                        required
                        value={callbackDueAt}
                        onChange={(event) =>
                          setCallbackDueAt(event.target.value)
                        }
                        style={nativeInputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.callbackNotePlaceholder")}
                    >
                      <textarea
                        rows={3}
                        value={callbackNote}
                        onChange={(event) =>
                          setCallbackNote(event.target.value)
                        }
                        style={nativeTextAreaStyle}
                      />
                    </CanvasField>
                    <CanvasActionButton
                      theme={theme}
                      disabled={!callbackAction?.enabled}
                      helper={getActionHelper(currentLocale, callbackAction)}
                      busy={busyKey === "create-callback"}
                      label={getActionLabel(currentLocale, "create_callback")}
                      type="submit"
                    />
                  </form>

                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!selectedSession?.callbackTask) {
                        return;
                      }
                      void runGuardedAction(
                        "complete-callback",
                        completeCallbackAction,
                        async () => {
                          await getOpsClient().completeCallbackTask(
                            selectedSession.callbackTask!.callbackTaskId,
                            { note: callbackCompleteNote },
                          );
                          setCallbackCompleteNote("");
                          setOutcomeNotice({
                            tone: "success",
                            message:
                              currentLocale === "en"
                                ? `Callback ${selectedSession.callbackTask!.callbackTaskId} completed.`
                                : `已完成 callback ${selectedSession.callbackTask!.callbackTaskId}。`,
                          });
                          await loadData(selectedSession.callId);
                        },
                      );
                    }}
                  >
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.completionNotePlaceholder")}
                    >
                      <input
                        type="text"
                        value={callbackCompleteNote}
                        onChange={(event) =>
                          setCallbackCompleteNote(event.target.value)
                        }
                        style={nativeInputStyle}
                      />
                    </CanvasField>
                    <CanvasActionButton
                      theme={theme}
                      disabled={!completeCallbackAction?.enabled}
                      helper={getActionHelper(
                        currentLocale,
                        completeCallbackAction,
                      )}
                      busy={busyKey === "complete-callback"}
                      label={getActionLabel(currentLocale, "complete_callback")}
                      type="submit"
                    />
                  </form>

                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!selectedSession) {
                        return;
                      }
                      void runGuardedAction(
                        "transfer-complaint",
                        transferComplaintAction,
                        async () => {
                          const result =
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
                          setOutcomeNotice({
                            tone: "success",
                            message:
                              currentLocale === "en"
                                ? `Complaint ${result.complaintCase.caseNo} created from ${selectedSession.callId}.`
                                : `已從 ${selectedSession.callId} 建立客訴 ${result.complaintCase.caseNo}。`,
                            href: `/complaints?caseNo=${encodeURIComponent(result.complaintCase.caseNo)}`,
                            label:
                              currentLocale === "en"
                                ? "Open complaint queue"
                                : "開啟客訴佇列",
                          });
                          await loadData(selectedSession.callId);
                          router.push(
                            `/complaints?caseNo=${encodeURIComponent(result.complaintCase.caseNo)}`,
                          );
                        },
                      );
                    }}
                  >
                    <CanvasField
                      theme={theme}
                      label={currentLocale === "en" ? "Category" : "類別"}
                      required
                    >
                      <>
                        <CanvasSelect
                          theme={theme}
                          value={formatOpsCodeLabel(
                            currentLocale,
                            transferForm.category,
                          )}
                        />
                        <select
                          value={transferForm.category}
                          onChange={(event) =>
                            setTransferForm(
                              (current: TransferCallToComplaintCommand) => ({
                                ...current,
                                category: event.target
                                  .value as ComplaintCategory,
                              }),
                            )
                          }
                          style={{ ...nativeInputStyle, marginTop: 6 }}
                        >
                          {COMPLAINT_CATEGORY_OPTIONS.map((category) => (
                            <option key={category} value={category}>
                              {formatOpsCodeLabel(currentLocale, category)}
                            </option>
                          ))}
                        </select>
                      </>
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={currentLocale === "en" ? "Severity" : "嚴重程度"}
                      required
                    >
                      <>
                        <CanvasSelect
                          theme={theme}
                          value={formatOpsCodeLabel(
                            currentLocale,
                            transferForm.severity,
                          )}
                        />
                        <select
                          value={transferForm.severity}
                          onChange={(event) =>
                            setTransferForm(
                              (current: TransferCallToComplaintCommand) => ({
                                ...current,
                                severity: event.target
                                  .value as TransferCallToComplaintCommand["severity"],
                              }),
                            )
                          }
                          style={{ ...nativeInputStyle, marginTop: 6 }}
                        >
                          <option value="normal">
                            {formatOpsCodeLabel(currentLocale, "normal")}
                          </option>
                          <option value="high">
                            {formatOpsCodeLabel(currentLocale, "high")}
                          </option>
                        </select>
                      </>
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.complaintDescriptionPlaceholder")}
                      required
                    >
                      <textarea
                        rows={4}
                        required
                        value={transferForm.description}
                        onChange={(event) =>
                          setTransferForm(
                            (current: TransferCallToComplaintCommand) => ({
                              ...current,
                              description: event.target.value,
                            }),
                          )
                        }
                        style={nativeTextAreaStyle}
                      />
                    </CanvasField>
                    <CanvasActionButton
                      theme={theme}
                      disabled={!transferComplaintAction?.enabled}
                      helper={getActionHelper(
                        currentLocale,
                        transferComplaintAction,
                      )}
                      busy={busyKey === "transfer-complaint"}
                      label={getActionLabel(
                        currentLocale,
                        "transfer_to_complaint",
                      )}
                      variant="primary"
                      type="submit"
                    />
                  </form>
                </div>
              </div>
            </CanvasCard>
          </div>

          <div style={columnStackStyle}>
            <CanvasCard
              theme={theme}
              title={
                currentLocale === "en" ? "Callback queue" : "Callback 佇列"
              }
              subtitle={
                currentLocale === "en"
                  ? "Across all sessions"
                  : "跨所有 session"
              }
              actions={
                <CanvasPill theme={theme}>{pendingCallbacks.length}</CanvasPill>
              }
              padding={0}
            >
              {filteredCallbackQueue.length > 0 ? (
                <CanvasTable
                  theme={theme}
                  columns={callbackColumns}
                  rows={filteredCallbackQueue}
                />
              ) : (
                <div style={{ padding: 16 }}>
                  <CanvasEmptyState
                    theme={theme}
                    tone="neutral"
                    title={
                      currentLocale === "en" ? "No callbacks" : "沒有 callback"
                    }
                    body={
                      currentLocale === "en"
                        ? "No callbacks match the current scope."
                        : "目前 scope 內沒有 callback。"
                    }
                  />
                </div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={currentLocale === "en" ? "Recording queue" : "錄音佇列"}
              subtitle={
                currentLocale === "en"
                  ? "Awaiting auto-link or manual attach"
                  : "等待自動連結或手動補掛"
              }
              actions={
                <CanvasPill theme={theme} tone="warn">
                  {recordingQueue.length}
                </CanvasPill>
              }
              padding={0}
            >
              {recordingQueue.length > 0 ? (
                <CanvasTable
                  theme={theme}
                  columns={recordingColumns}
                  rows={recordingQueue}
                />
              ) : (
                <div style={{ padding: 16 }}>
                  <CanvasEmptyState
                    theme={theme}
                    tone="success"
                    title={
                      currentLocale === "en"
                        ? "No recording gaps"
                        : "沒有錄音缺口"
                    }
                    body={
                      currentLocale === "en"
                        ? "Every visible session already has recording evidence."
                        : "目前可見 session 都已具備錄音證據。"
                    }
                  />
                </div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={
                currentLocale === "en" ? "Dispatch trace" : "Dispatch trace"
              }
              subtitle={
                currentLocale === "en"
                  ? "Linked order and downstream visibility"
                  : "已連結訂單與下游可視性"
              }
            >
              {selectedOrder ? (
                <>
                  <CanvasDL
                    theme={theme}
                    items={[
                      {
                        label: currentLocale === "en" ? "Order" : "訂單",
                        value: `${selectedOrder.orderNo} · ${selectedOrder.orderId}`,
                      },
                      {
                        label: currentLocale === "en" ? "Status" : "狀態",
                        value: formatOpsCodeLabel(
                          currentLocale,
                          selectedOrder.status,
                        ),
                      },
                      {
                        label: currentLocale === "en" ? "Route" : "路線",
                        value: `${selectedOrder.pickup.address} → ${selectedOrder.dropoff.address}`,
                      },
                      {
                        label: currentLocale === "en" ? "Compliance" : "合規",
                        value:
                          selectedOrder.complianceFlags.length > 0
                            ? formatOpsCodeList(
                                currentLocale,
                                selectedOrder.complianceFlags,
                              )
                            : "—",
                      },
                    ]}
                  />
                  <div style={{ marginTop: 12, marginBottom: 12 }}>
                    <Link
                      href={`/dispatch/${encodeURIComponent(selectedOrder.orderId)}`}
                      style={linkPillStyle}
                    >
                      {currentLocale === "en"
                        ? "Open dispatch detail"
                        : "開啟 dispatch 明細"}
                    </Link>
                  </div>
                  {dispatchTrace.length > 0 ? (
                    <CanvasTable
                      theme={theme}
                      columns={traceColumns}
                      rows={dispatchTrace}
                    />
                  ) : (
                    <CanvasEmptyState
                      theme={theme}
                      tone="neutral"
                      title={
                        currentLocale === "en"
                          ? "No trace entries"
                          : "尚無 trace 紀錄"
                      }
                      body={
                        currentLocale === "en"
                          ? "The linked order exists, but no dispatch trace rows have been recorded yet."
                          : "訂單已連結，但尚未產生 dispatch trace 紀錄。"
                      }
                    />
                  )}
                </>
              ) : (
                <CanvasEmptyState
                  theme={theme}
                  tone="neutral"
                  title={
                    currentLocale === "en" ? "No linked order" : "尚未連結訂單"
                  }
                  body={
                    currentLocale === "en"
                      ? "Select or link an order to load dispatch trace."
                      : "請先選取或連結訂單，才能載入 dispatch trace。"
                  }
                />
              )}
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={
                currentLocale === "en" ? "Session history" : "Session 歷史"
              }
              subtitle={
                currentLocale === "en"
                  ? "Closed calls remain selectable for context."
                  : "已關閉通話仍可點選回看上下文。"
              }
              actions={
                <CanvasPill theme={theme}>{sessionHistory.length}</CanvasPill>
              }
              padding={0}
            >
              {sessionHistory.length > 0 ? (
                <CanvasTable
                  theme={theme}
                  columns={historyColumns}
                  rows={sessionHistory}
                />
              ) : (
                <div style={{ padding: 16 }}>
                  <CanvasEmptyState
                    theme={theme}
                    tone="neutral"
                    title={
                      currentLocale === "en" ? "No history yet" : "尚無歷史"
                    }
                    body={
                      currentLocale === "en"
                        ? "Closed sessions will appear here after resolution."
                        : "結束的 session 會在此處顯示。"
                    }
                  />
                </div>
              )}
            </CanvasCard>
          </div>
        </div>
      </div>
    </>
  );
}

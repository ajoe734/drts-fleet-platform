"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { CanvasPageHeader as PageHeader, buildCanvasTheme } from "@drts/ui-web";
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

function getRecordingStateTone(recordingState: CallRecordingState) {
  switch (recordingState) {
    case "ready":
      return "state-pill state-positive";
    case "missing":
      return "state-pill state-danger";
    case "pending":
    default:
      return "state-pill state-warning";
  }
}

function getEmptyReasonTone(reason: EmptyReason) {
  switch (reason) {
    case "not_provisioned":
      return "empty-state empty-warn";
    case "fetch_failed":
      return "empty-state empty-danger";
    case "permission_denied":
      return "empty-state empty-danger";
    case "external_unavailable":
      return "empty-state empty-warn";
    case "filtered_empty":
      return "empty-state empty-info";
    case "no_data":
    default:
      return "empty-state";
  }
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

function getFreshnessTone(refresh: UiRefreshMetadata) {
  if (refresh.dataFreshness === "degraded") {
    return "freshness-pill freshness-degraded";
  }
  if (isRefreshStale(refresh)) {
    return "freshness-pill freshness-stale";
  }
  return "freshness-pill freshness-fresh";
}

function renderResourceLink(link: CrossAppResourceLink, className: string) {
  if (link.openMode === "new_tab") {
    return (
      <a
        key={`${link.targetApp}-${link.resourceId}-${link.route}`}
        href={link.route}
        target="_blank"
        rel="noreferrer"
        className={className}
      >
        {link.label}
      </a>
    );
  }

  return (
    <Link
      key={`${link.targetApp}-${link.resourceId}-${link.route}`}
      href={link.route}
      className={className}
    >
      {link.label}
    </Link>
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
    <div className="action-meta">
      <span className="action-risk">
        {getRiskLabel(locale, descriptor.riskLevel)}
      </span>
      {descriptor.disabledReasonCode && !descriptor.enabled ? (
        <span className="action-note">
          {getDisabledReasonLabel(locale, descriptor.disabledReasonCode)}
        </span>
      ) : null}
      {descriptor.requiresReason ? (
        <span className="action-note">
          {locale === "en" ? "Reason required" : "需要理由"}
        </span>
      ) : null}
    </div>
  );
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
  const [sessionEmptyNextAction, setSessionEmptyNextAction] =
    useState<ResourceActionDescriptor | null>(null);
  const [callbackEmptyNextAction, setCallbackEmptyNextAction] =
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
  // The server-supplied empty-state CTA follows the same source as the reason:
  // session envelope first, then callback. Only honored when the client itself
  // classified no_data (i.e. a clean fetch with empty items) so an error-derived
  // reason can never resurrect a stale server action.
  const effectiveEmptyNextAction =
    emptyReason === "no_data"
      ? sessionEmptyReason
        ? sessionEmptyNextAction
        : callbackEmptyReason
          ? callbackEmptyNextAction
          : null
      : null;
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
      className="header-tab-btn"
      onClick={() => setQueueView(tab.id)}
    >
      <span>{tab.label}</span>
      <span className="header-tab-badge">{tab.badge}</span>
    </button>
  ));

  const activeQueueCard =
    queueView === "callback"
      ? {
          kicker: currentLocale === "en" ? "Callback queue" : "Callback 佇列",
          title: currentLocale === "en" ? "Pending follow-up" : "待追蹤回覆",
          count: pendingCallbacks.length,
          body:
            filteredCallbackQueue.length > 0 ? (
              filteredCallbackQueue.map((callback) => (
                <button
                  key={callback.callbackTaskId}
                  type="button"
                  className="queue-item"
                  onClick={() => setSelectedCallId(callback.callId)}
                >
                  <div>
                    <strong>{callback.callbackTaskId}</strong>
                    <p>{getCallbackSummary(callback, currentLocale)}</p>
                  </div>
                  <span>
                    {formatRelativeDeadline(callback.dueAt, currentLocale)}
                  </span>
                </button>
              ))
            ) : (
              <div className="subtle-empty">
                {currentLocale === "en"
                  ? "No callbacks match the current scope."
                  : "目前 scope 內沒有 callback。"}
              </div>
            ),
        }
      : queueView === "recording"
        ? {
            kicker: currentLocale === "en" ? "Recording queue" : "錄音佇列",
            title:
              currentLocale === "en"
                ? "Awaiting auto-link or manual attach"
                : "等待自動連結或手動補掛",
            count: recordingQueue.length,
            body:
              recordingQueue.length > 0 ? (
                recordingQueue.map((session) => (
                  <button
                    key={session.callId}
                    type="button"
                    className="queue-item"
                    onClick={() => setSelectedCallId(session.callId)}
                  >
                    <div>
                      <strong>{session.callId}</strong>
                      <p>{session.callerPhone}</p>
                    </div>
                    <span
                      className={getRecordingStateTone(session.recordingState)}
                    >
                      {formatOpsCodeLabel(
                        currentLocale,
                        session.recordingState,
                      )}
                    </span>
                  </button>
                ))
              ) : (
                <div className="subtle-empty">
                  {currentLocale === "en"
                    ? "No recording gaps right now."
                    : "目前沒有錄音缺口。"}
                </div>
              ),
          }
        : {
            kicker: currentLocale === "en" ? "Waiting queue" : "等待佇列",
            title:
              currentLocale === "en" ? "Other live calls" : "其他進行中的通話",
            count: waitingSessions.length,
            body:
              waitingSessions.length > 0 ? (
                waitingSessions.map((session) => (
                  <button
                    key={session.callId}
                    type="button"
                    className="queue-item"
                    onClick={() => setSelectedCallId(session.callId)}
                  >
                    <div>
                      <strong>{session.callId}</strong>
                      <p>
                        {formatOpsCodeLabel(currentLocale, session.callType)} ·{" "}
                        {session.callerPhone}
                      </p>
                    </div>
                    <span>
                      {formatDateTime(currentLocale, session.startedAt)}
                    </span>
                  </button>
                ))
              ) : (
                <div className="subtle-empty">
                  {currentLocale === "en"
                    ? "No extra waiting calls."
                    : "目前沒有其他等待中的通話。"}
                </div>
              ),
          };

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
          <button
            key="open-session"
            className="header-action header-action-primary"
            type="button"
            onClick={() => setShowIntake((current) => !current)}
            disabled={!workspaceAction.enabled}
            title={
              workspaceAction.enabled
                ? undefined
                : getDisabledReasonLabel(
                    currentLocale,
                    workspaceAction.disabledReasonCode,
                  )
            }
          >
            {showIntake
              ? t("callcenter.hideIntake")
              : getActionLabel(currentLocale, "open_call_session")}
          </button>,
          <button
            key="close-session"
            className="header-action"
            type="button"
            disabled={!closeAction?.enabled || busyKey === "close-header"}
            title={
              closeAction?.enabled
                ? undefined
                : getDisabledReasonLabel(
                    currentLocale,
                    closeAction?.disabledReasonCode,
                  )
            }
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
          </button>,
        ]}
        sticky={false}
      />

      <div className="callcenter-shell">
        <section className="hero-card hero-card-compact">
          <div className="hero-copy">
            <span className="hero-eyebrow">
              {currentLocale === "en"
                ? `Refresh tier ${CALLCENTER_REFRESH_TIER} · 5s auto refresh`
                : `Refresh tier ${CALLCENTER_REFRESH_TIER} · 每 5 秒自動刷新`}
            </span>
            <h2>
              {selectedSession
                ? `${selectedSession.callId} · ${formatOpsCodeLabel(currentLocale, selectedSession.callType)}`
                : currentLocale === "en"
                  ? "Idle workspace"
                  : "Idle workspace"}
            </h2>
            <p>
              {selectedSession
                ? currentLocale === "en"
                  ? "Handle booking, callback, complaint handoff, and recording evidence without leaving the canvas."
                  : "在同一個 canvas 內完成建單、callback、客訴轉案與錄音證據補齊。"
                : emptyCopy.body}
            </p>
          </div>
          <div className="hero-controls">
            <div className="hero-metrics">
              <div className="hero-chip hero-chip-accent">
                <span>
                  {currentLocale === "en" ? "Open sessions" : "Active session"}
                </span>
                <strong>{openSessionsCount}</strong>
              </div>
              <div className="hero-chip">
                <span>
                  {currentLocale === "en"
                    ? "Pending callbacks"
                    : "待回覆 callback"}
                </span>
                <strong>{pendingCallbacks.length}</strong>
              </div>
              <div className="hero-chip hero-chip-warning">
                <span>
                  {currentLocale === "en" ? "Recording gaps" : "錄音待補"}
                </span>
                <strong>{recordingGapCount}</strong>
              </div>
              <div className="hero-chip">
                <span>
                  {currentLocale === "en" ? "Complaint transfers" : "客訴轉案"}
                </span>
                <strong>{complaintTransferCount}</strong>
              </div>
            </div>
            <div className="toolbar">
              <input
                className="search-input"
                type="search"
                value={query}
                placeholder={t("callcenter.search")}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button
                className="toolbar-btn"
                type="button"
                onClick={() => {
                  void loadData(selectedCallId ?? undefined);
                }}
              >
                {currentLocale === "en" ? "Refresh now" : "立即刷新"}
              </button>
            </div>
            <div className="toolbar-meta">
              <span className="tier-chip">T2</span>
              <span className={getFreshnessTone(activeRefresh)}>
                {workspaceStale
                  ? currentLocale === "en"
                    ? "Stale"
                    : "已過期"
                  : currentLocale === "en"
                    ? "Fresh"
                    : "最新"}
              </span>
              <span className="status-chip">
                {health.status === "healthy"
                  ? currentLocale === "en"
                    ? "Healthy"
                    : "健康"
                  : currentLocale === "en"
                    ? "Degraded"
                    : "降級中"}
              </span>
              <span className="toolbar-hint">
                {currentLocale === "en" ? "Last refresh" : "最近刷新"}:{" "}
                {lastRefreshAt
                  ? formatDateTime(currentLocale, lastRefreshAt)
                  : "—"}
              </span>
            </div>
          </div>
        </section>

        {outcomeNotice ? (
          <div
            className={
              outcomeNotice.tone === "success"
                ? "notice-banner"
                : "notice-banner notice-warning"
            }
          >
            <span>{outcomeNotice.message}</span>
            {outcomeNotice.href && outcomeNotice.label ? (
              outcomeNotice.external ? (
                <a
                  href={outcomeNotice.href}
                  target="_blank"
                  rel="noreferrer"
                  className="notice-link"
                >
                  {outcomeNotice.label}
                </a>
              ) : (
                <Link href={outcomeNotice.href} className="notice-link">
                  {outcomeNotice.label}
                </Link>
              )
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="error-banner">
            <strong>{currentLocale === "en" ? "Error" : "錯誤"}</strong>
            <span>{error}</span>
          </div>
        ) : null}

        {showIntake ? (
          <section className="canvas-card">
            <div className="card-head">
              <div>
                <span className="section-kicker">
                  {currentLocale === "en" ? "Entry" : "入口"}
                </span>
                <h3>{t("callcenter.newIntake")}</h3>
                <p>{t("callcenter.intakeNote")}</p>
              </div>
            </div>
            <form
              className="grid-form"
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
              <label>
                <span>{t("callcenter.form.callType")}</span>
                <select
                  value={intakeForm.callType}
                  onChange={(event) =>
                    setIntakeForm((current: OpenCallSessionCommand) => ({
                      ...current,
                      callType: event.target
                        .value as OpenCallSessionCommand["callType"],
                    }))
                  }
                >
                  {CALL_TYPE_OPTIONS.map((callType) => (
                    <option key={callType} value={callType}>
                      {formatOpsCodeLabel(currentLocale, callType)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("callcenter.form.callerPhone")}</span>
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
                />
              </label>
              <label>
                <span>{t("callcenter.form.agentId")}</span>
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
                />
              </label>
              <label className="check-field">
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
                <span>{t("callcenter.form.announced")}</span>
              </label>
              <div className="form-actions">
                <button
                  className="toolbar-btn toolbar-btn-primary"
                  type="submit"
                  disabled={
                    busyKey === "open-intake" || !workspaceAction.enabled
                  }
                >
                  {busyKey === "open-intake"
                    ? t("callcenter.form.opening")
                    : t("callcenter.form.openSession")}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <div className="workspace-grid">
          <aside className="workspace-left-rail">
            <article className="canvas-card rail-card">
              <div className="card-head">
                <div>
                  <span className="section-kicker">
                    {activeQueueCard.kicker}
                  </span>
                  <h3>{activeQueueCard.title}</h3>
                </div>
                <span className="count-pill">{activeQueueCard.count}</span>
              </div>
              <div className="queue-list">{activeQueueCard.body}</div>
            </article>

            {!selectedSession ? (
              <article
                className={`canvas-card ${getEmptyReasonTone(effectiveEmptyReason)}`}
              >
                <span className="empty-accent">{emptyCopy.accent}</span>
                <h4>{emptyCopy.title}</h4>
                <p>{emptyCopy.body}</p>
                {effectiveEmptyReason === "filtered_empty" ? (
                  <button
                    className="toolbar-btn"
                    type="button"
                    onClick={() => setQuery("")}
                  >
                    {currentLocale === "en" ? "Clear search" : "清除搜尋"}
                  </button>
                ) : effectiveEmptyNextAction ? (
                  <button
                    className="toolbar-btn toolbar-btn-primary"
                    type="button"
                    onClick={() => {
                      if (
                        effectiveEmptyNextAction.action === "open_call_session"
                      ) {
                        setShowIntake(true);
                      }
                    }}
                    disabled={!effectiveEmptyNextAction.enabled}
                    title={
                      !effectiveEmptyNextAction.enabled
                        ? getDisabledReasonLabel(
                            currentLocale,
                            effectiveEmptyNextAction.disabledReasonCode,
                          )
                        : undefined
                    }
                  >
                    {getActionLabel(
                      currentLocale,
                      effectiveEmptyNextAction.action,
                    )}
                  </button>
                ) : effectiveEmptyReason === "no_data" ? (
                  <button
                    className="toolbar-btn toolbar-btn-primary"
                    type="button"
                    onClick={() => setShowIntake(true)}
                    disabled={!workspaceAction.enabled}
                    title={
                      !workspaceAction.enabled
                        ? getDisabledReasonLabel(
                            currentLocale,
                            workspaceAction.disabledReasonCode,
                          )
                        : undefined
                    }
                  >
                    {getActionLabel(currentLocale, "open_call_session")}
                  </button>
                ) : null}
              </article>
            ) : (
              <article className="canvas-card rail-card">
                <div className="card-head">
                  <div>
                    <span className="section-kicker">
                      {currentLocale === "en"
                        ? "Workspace signals"
                        : "Workspace 訊號"}
                    </span>
                    <h3>
                      {currentLocale === "en"
                        ? "Health and contracts"
                        : "健康度與契約"}
                    </h3>
                  </div>
                </div>
                <div className="queue-list">
                  <div className="signal-card">
                    <span>
                      {currentLocale === "en"
                        ? "availableActions"
                        : "availableActions"}
                    </span>
                    <strong>{selectedSession.availableActions.length}</strong>
                    <small>
                      {currentLocale === "en"
                        ? "Affordances stay visible even when disabled."
                        : "即使 disabled 也保留 affordance。"}
                    </small>
                  </div>
                  <div className="signal-card">
                    <span>
                      {currentLocale === "en" ? "Deep links" : "Deep links"}
                    </span>
                    <strong>{selectedSession.deepLinks.length}</strong>
                    <small>
                      {currentLocale === "en"
                        ? "Dispatch and complaint routes are contract-driven."
                        : "Dispatch 與 complaint 連結由 contract 決定。"}
                    </small>
                  </div>
                  <div className="signal-card">
                    <span>{currentLocale === "en" ? "Health" : "健康度"}</span>
                    <strong>{health.status}</strong>
                    <small>
                      {health.degradedServices.length > 0
                        ? health.degradedServices
                            .map((service) => service.service)
                            .join(" · ")
                        : currentLocale === "en"
                          ? "No degraded dependencies."
                          : "目前沒有降級依賴。"}
                    </small>
                  </div>
                </div>
              </article>
            )}
          </aside>

          <section className="workspace-main">
            <article className="canvas-card spotlight-card">
              <div className="card-head">
                <div>
                  <span className="section-kicker">
                    {currentLocale === "en"
                      ? "Active session panel"
                      : "Active session panel"}
                  </span>
                  <h3>
                    {selectedSession
                      ? selectedSession.callId
                      : currentLocale === "en"
                        ? "Idle workspace"
                        : "Idle workspace"}
                  </h3>
                  <p>
                    {currentLocale === "en"
                      ? "Must-show: call type, caller phone, agent identity, linked order, recording state, and dispatch trace."
                      : "必顯示：call type、caller phone、agent identity、linked order、recording state 與 dispatch trace。"}
                  </p>
                </div>
                {selectedSession ? (
                  <span
                    className={getRecordingStateTone(
                      selectedSession.recordingState,
                    )}
                  >
                    {formatOpsCodeLabel(
                      currentLocale,
                      selectedSession.recordingState,
                    )}
                  </span>
                ) : null}
              </div>

              {loading ? (
                <div className="loading-state">
                  {currentLocale === "en"
                    ? "Loading call center workspace..."
                    : "正在載入 call center workspace..."}
                </div>
              ) : selectedSession ? (
                <>
                  <div className="spotlight-grid">
                    <div className="spotlight-cell">
                      <span>{currentLocale === "en" ? "Call" : "通話"}</span>
                      <strong>
                        {formatOpsCodeLabel(
                          currentLocale,
                          selectedSession.callType,
                        )}
                      </strong>
                      <small>{selectedSession.callId}</small>
                    </div>
                    <div className="spotlight-cell">
                      <span>
                        {currentLocale === "en" ? "Caller" : "來電者"}
                      </span>
                      <strong>{selectedSession.callerPhone}</strong>
                      <small>
                        {formatDateTime(
                          currentLocale,
                          selectedSession.startedAt,
                        )}
                      </small>
                    </div>
                    <div className="spotlight-cell">
                      <span>
                        {currentLocale === "en" ? "Agent" : "客服人員"}
                      </span>
                      <strong>{selectedSession.agentId ?? "—"}</strong>
                      <small>
                        {selectedSession.agentIdentityAnnounced
                          ? currentLocale === "en"
                            ? `Announced at ${formatDateTime(currentLocale, selectedSession.agentIdentityAnnouncedAt)}`
                            : `${formatDateTime(currentLocale, selectedSession.agentIdentityAnnouncedAt)} 已告知身分`
                          : currentLocale === "en"
                            ? "Identity not announced"
                            : "尚未告知身分"}
                      </small>
                    </div>
                    <div className="spotlight-cell">
                      <span>
                        {currentLocale === "en"
                          ? "Linked records"
                          : "已連結紀錄"}
                      </span>
                      <strong>
                        {selectedSession.linkedOrderId ??
                          selectedSession.linkedCaseNo ??
                          "—"}
                      </strong>
                      <small>
                        {selectedSession.linkedOrderId &&
                        selectedSession.linkedCaseNo
                          ? `${selectedSession.linkedOrderId} + ${selectedSession.linkedCaseNo}`
                          : selectedSession.linkedOrderId
                            ? currentLocale === "en"
                              ? "Order linked"
                              : "已綁定訂單"
                            : selectedSession.linkedCaseNo
                              ? currentLocale === "en"
                                ? "Complaint linked"
                                : "已連結客訴"
                              : currentLocale === "en"
                                ? "No downstream link yet"
                                : "尚未連結下游紀錄"}
                      </small>
                    </div>
                    <div className="spotlight-cell">
                      <span>{currentLocale === "en" ? "Flags" : "旗標"}</span>
                      <strong>
                        {selectedSession.flags.length > 0
                          ? formatOpsCodeList(
                              currentLocale,
                              selectedSession.flags,
                            )
                          : "—"}
                      </strong>
                      <small>
                        {selectedSession.lastEtaQuotedMinutes
                          ? currentLocale === "en"
                            ? `Last ETA ${selectedSession.lastEtaQuotedMinutes} min`
                            : `最近 ETA ${selectedSession.lastEtaQuotedMinutes} 分鐘`
                          : currentLocale === "en"
                            ? "No ETA quoted yet"
                            : "尚未回覆 ETA"}
                      </small>
                    </div>
                    <div className="spotlight-cell">
                      <span>
                        {currentLocale === "en" ? "Deep links" : "Deep links"}
                      </span>
                      <div className="deep-link-list">
                        {selectedSession.deepLinks.length > 0 ? (
                          selectedSession.deepLinks.map(
                            (link: CrossAppResourceLink) =>
                              renderResourceLink(link, "deep-link-pill"),
                          )
                        ) : (
                          <span className="deep-link-empty">
                            {currentLocale === "en"
                              ? "No linked resources"
                              : "尚無 linked resource"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="action-strip">
                    {selectedSession.availableActions.map(
                      (descriptor: ResourceActionDescriptor) => (
                        <div
                          key={descriptor.action}
                          className="action-chip-card"
                        >
                          <strong>
                            {getActionLabel(currentLocale, descriptor.action)}
                          </strong>
                          {renderActionMeta(currentLocale, descriptor)}
                        </div>
                      ),
                    )}
                  </div>
                </>
              ) : (
                <div className={getEmptyReasonTone(emptyReason)}>
                  <span className="empty-accent">{emptyCopy.accent}</span>
                  <h4>{emptyCopy.title}</h4>
                  <p>{emptyCopy.body}</p>
                  {emptyReason === "filtered_empty" ? (
                    <button
                      className="toolbar-btn"
                      type="button"
                      onClick={() => setQuery("")}
                    >
                      {currentLocale === "en" ? "Clear search" : "清除搜尋"}
                    </button>
                  ) : (
                    <button
                      className="toolbar-btn toolbar-btn-primary"
                      type="button"
                      onClick={() => setShowIntake(true)}
                      disabled={!workspaceAction.enabled}
                    >
                      {getActionLabel(currentLocale, "open_call_session")}
                    </button>
                  )}
                </div>
              )}
            </article>

            <article className="canvas-card">
              <div className="card-head">
                <div>
                  <span className="section-kicker">
                    {currentLocale === "en"
                      ? "Session actions"
                      : "Session 動作"}
                  </span>
                  <h3>
                    {currentLocale === "en"
                      ? "Greeting to resolution"
                      : "從 greeting 到 resolution"}
                  </h3>
                  <p>
                    {currentLocale === "en"
                      ? "Affordances stay visible even when disabled; enabled state comes from availableActions."
                      : "即使 disabled 也保留 affordance；enabled 狀態由 availableActions 決定。"}
                  </p>
                </div>
              </div>

              <div className="action-panels">
                <section className="mini-panel">
                  <h4>
                    {currentLocale === "en"
                      ? "Session controls"
                      : "Session 控制"}
                  </h4>
                  <div className="mini-actions">
                    <button
                      className="toolbar-btn"
                      type="button"
                      disabled={
                        !announceAction?.enabled || busyKey === "announce"
                      }
                      title={
                        announceAction?.enabled
                          ? undefined
                          : getDisabledReasonLabel(
                              currentLocale,
                              announceAction?.disabledReasonCode,
                            )
                      }
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
                    >
                      {getActionLabel(currentLocale, "announce_identity")}
                    </button>
                    <button
                      className="toolbar-btn"
                      type="button"
                      disabled={!closeAction?.enabled || busyKey === "close"}
                      title={
                        closeAction?.enabled
                          ? undefined
                          : getDisabledReasonLabel(
                              currentLocale,
                              closeAction?.disabledReasonCode,
                            )
                      }
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
                    >
                      {getActionLabel(currentLocale, "close_session")}
                    </button>
                  </div>
                  {announceAction
                    ? renderActionMeta(currentLocale, announceAction)
                    : null}
                  {closeAction
                    ? renderActionMeta(currentLocale, closeAction)
                    : null}
                </section>

                <section className="mini-panel">
                  <h4>{currentLocale === "en" ? "Quote ETA" : "回覆 ETA"}</h4>
                  <form
                    className="stack-form"
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
                    <input
                      type="number"
                      min={1}
                      value={quotedEtaMinutes}
                      onChange={(event) =>
                        setQuotedEtaMinutes(event.target.value)
                      }
                    />
                    <button
                      className="toolbar-btn"
                      type="submit"
                      disabled={
                        !quoteEtaAction?.enabled || busyKey === "quote-eta"
                      }
                    >
                      {getActionLabel(currentLocale, "quote_eta")}
                    </button>
                  </form>
                  {quoteEtaAction
                    ? renderActionMeta(currentLocale, quoteEtaAction)
                    : null}
                </section>

                <section className="mini-panel">
                  <h4>
                    {currentLocale === "en" ? "Recording evidence" : "錄音證據"}
                  </h4>
                  <form
                    className="stack-form"
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
                    <input
                      type="text"
                      placeholder={t("callcenter.recordingIdPlaceholder")}
                      required
                      value={recordingForm.recordingId}
                      onChange={(event) =>
                        setRecordingForm((current: RecordingFormState) => ({
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
                        setRecordingForm((current: RecordingFormState) => ({
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
                        setRecordingForm((current: RecordingFormState) => ({
                          ...current,
                          recordingUrl: event.target.value,
                        }))
                      }
                    />
                    <button
                      className="toolbar-btn"
                      type="submit"
                      disabled={
                        !attachRecordingAction?.enabled ||
                        busyKey === "attach-recording"
                      }
                    >
                      {getActionLabel(currentLocale, "attach_recording")}
                    </button>
                  </form>
                  {attachRecordingAction
                    ? renderActionMeta(currentLocale, attachRecordingAction)
                    : null}
                </section>
              </div>
            </article>

            <article className="canvas-card">
              <div className="card-head">
                <div>
                  <span className="section-kicker">
                    {currentLocale === "en"
                      ? "Resolution desk"
                      : "Resolution desk"}
                  </span>
                  <h3>
                    {currentLocale === "en"
                      ? "Booking, callback, and complaint handoff"
                      : "建單、callback 與客訴轉案"}
                  </h3>
                  <p>
                    {currentLocale === "en"
                      ? "Primary decision points: new booking vs existing order, and callback vs complaint remediation."
                      : "主要決策點：新建訂單或既有訂單，以及 callback 或客訴補救。"}
                  </p>
                </div>
              </div>

              <div className="action-panels action-panels-wide">
                <section className="mini-panel">
                  <h4>
                    {getActionLabel(currentLocale, "create_phone_booking")}
                  </h4>
                  <form
                    className="stack-form"
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
                    <input
                      type="text"
                      required
                      placeholder={t("callcenter.passengerNamePlaceholder")}
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
                      type="text"
                      required
                      placeholder={t("callcenter.pickupAddressPlaceholder")}
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
                      required
                      placeholder={t("callcenter.dropoffAddressPlaceholder")}
                      value={orderForm.dropoffAddress}
                      onChange={(event) =>
                        setOrderForm((current) => ({
                          ...current,
                          dropoffAddress: event.target.value,
                        }))
                      }
                    />
                    <textarea
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
                    <button
                      className="toolbar-btn toolbar-btn-primary"
                      type="submit"
                      disabled={
                        !createBookingAction?.enabled ||
                        busyKey === "create-booking"
                      }
                    >
                      {getActionLabel(currentLocale, "create_phone_booking")}
                    </button>
                  </form>
                  {createBookingAction
                    ? renderActionMeta(currentLocale, createBookingAction)
                    : null}
                </section>

                <section className="mini-panel">
                  <h4>
                    {getActionLabel(currentLocale, "link_existing_order")}
                  </h4>
                  <form
                    className="stack-form"
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
                    <input
                      type="text"
                      required
                      placeholder={t("callcenter.existingOrderIdPlaceholder")}
                      value={existingOrderId}
                      onChange={(event) =>
                        setExistingOrderId(event.target.value)
                      }
                    />
                    <button
                      className="toolbar-btn"
                      type="submit"
                      disabled={
                        !linkOrderAction?.enabled || busyKey === "link-order"
                      }
                    >
                      {getActionLabel(currentLocale, "link_existing_order")}
                    </button>
                  </form>
                  {linkOrderAction
                    ? renderActionMeta(currentLocale, linkOrderAction)
                    : null}
                </section>

                <section className="mini-panel">
                  <h4>{getActionLabel(currentLocale, "create_callback")}</h4>
                  <form
                    className="stack-form"
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
                    <input
                      type="datetime-local"
                      required
                      value={callbackDueAt}
                      onChange={(event) => setCallbackDueAt(event.target.value)}
                    />
                    <textarea
                      rows={3}
                      placeholder={t("callcenter.callbackNotePlaceholder")}
                      value={callbackNote}
                      onChange={(event) => setCallbackNote(event.target.value)}
                    />
                    <button
                      className="toolbar-btn"
                      type="submit"
                      disabled={
                        !callbackAction?.enabled ||
                        busyKey === "create-callback"
                      }
                    >
                      {getActionLabel(currentLocale, "create_callback")}
                    </button>
                  </form>
                  <form
                    className="stack-form inline-complete"
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
                            {
                              note: callbackCompleteNote,
                            },
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
                    <input
                      type="text"
                      placeholder={t("callcenter.completionNotePlaceholder")}
                      value={callbackCompleteNote}
                      onChange={(event) =>
                        setCallbackCompleteNote(event.target.value)
                      }
                    />
                    <button
                      className="toolbar-btn"
                      type="submit"
                      disabled={
                        !completeCallbackAction?.enabled ||
                        busyKey === "complete-callback"
                      }
                    >
                      {getActionLabel(currentLocale, "complete_callback")}
                    </button>
                  </form>
                  {callbackAction
                    ? renderActionMeta(currentLocale, callbackAction)
                    : null}
                  {completeCallbackAction
                    ? renderActionMeta(currentLocale, completeCallbackAction)
                    : null}
                </section>

                <section className="mini-panel">
                  <h4>
                    {getActionLabel(currentLocale, "transfer_to_complaint")}
                  </h4>
                  <form
                    className="stack-form"
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
                    <select
                      value={transferForm.category}
                      onChange={(event) =>
                        setTransferForm(
                          (current: TransferCallToComplaintCommand) => ({
                            ...current,
                            category: event.target.value as ComplaintCategory,
                          }),
                        )
                      }
                    >
                      {COMPLAINT_CATEGORY_OPTIONS.map((category) => (
                        <option key={category} value={category}>
                          {formatOpsCodeLabel(currentLocale, category)}
                        </option>
                      ))}
                    </select>
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
                    >
                      <option value="normal">
                        {formatOpsCodeLabel(currentLocale, "normal")}
                      </option>
                      <option value="high">
                        {formatOpsCodeLabel(currentLocale, "high")}
                      </option>
                    </select>
                    <textarea
                      rows={4}
                      required
                      placeholder={t(
                        "callcenter.complaintDescriptionPlaceholder",
                      )}
                      value={transferForm.description}
                      onChange={(event) =>
                        setTransferForm(
                          (current: TransferCallToComplaintCommand) => ({
                            ...current,
                            description: event.target.value,
                          }),
                        )
                      }
                    />
                    <button
                      className="toolbar-btn"
                      type="submit"
                      disabled={
                        !transferComplaintAction?.enabled ||
                        busyKey === "transfer-complaint"
                      }
                    >
                      {getActionLabel(currentLocale, "transfer_to_complaint")}
                    </button>
                  </form>
                  {transferComplaintAction
                    ? renderActionMeta(currentLocale, transferComplaintAction)
                    : null}
                </section>
              </div>
            </article>

            <article className="canvas-card">
              <div className="card-head">
                <div>
                  <span className="section-kicker">
                    {currentLocale === "en"
                      ? "Dispatch trace"
                      : "Dispatch trace"}
                  </span>
                  <h3>
                    {currentLocale === "en"
                      ? "Linked order and downstream visibility"
                      : "已連結訂單與下游可視性"}
                  </h3>
                  <p>
                    {currentLocale === "en"
                      ? "Deep links and trace stay in the same workspace while the operator resolves the call."
                      : "當操作員處理通話時，deep link 與 trace 要保留在同一個 workspace。"}
                  </p>
                </div>
              </div>

              {selectedOrder ? (
                <div className="trace-stack">
                  <div className="spotlight-grid">
                    <div className="spotlight-cell">
                      <span>{currentLocale === "en" ? "Order" : "訂單"}</span>
                      <strong>{selectedOrder.orderNo}</strong>
                      <small>{selectedOrder.orderId}</small>
                    </div>
                    <div className="spotlight-cell">
                      <span>{currentLocale === "en" ? "Status" : "狀態"}</span>
                      <strong>
                        {formatOpsCodeLabel(
                          currentLocale,
                          selectedOrder.status,
                        )}
                      </strong>
                      <small>
                        {selectedOrder.etaSnapshot
                          ? currentLocale === "en"
                            ? `${selectedOrder.etaSnapshot.etaMinutes} min ETA`
                            : `${selectedOrder.etaSnapshot.etaMinutes} 分鐘 ETA`
                          : currentLocale === "en"
                            ? "ETA pending"
                            : "ETA 尚未回傳"}
                      </small>
                    </div>
                    <div className="spotlight-cell">
                      <span>{currentLocale === "en" ? "Route" : "路線"}</span>
                      <strong>{selectedOrder.pickup.address}</strong>
                      <small>{selectedOrder.dropoff.address}</small>
                    </div>
                    <div className="spotlight-cell">
                      <span>
                        {currentLocale === "en" ? "Compliance" : "合規"}
                      </span>
                      <strong>
                        {selectedOrder.complianceFlags.length > 0
                          ? formatOpsCodeList(
                              currentLocale,
                              selectedOrder.complianceFlags,
                            )
                          : "—"}
                      </strong>
                      <small>{selectedOrder.recordingId ?? "—"}</small>
                    </div>
                  </div>

                  <div className="trace-links">
                    <Link
                      className="deep-link-pill"
                      href={`/dispatch/${encodeURIComponent(selectedOrder.orderId)}`}
                    >
                      {currentLocale === "en"
                        ? "Open dispatch detail"
                        : "開啟 dispatch 明細"}
                    </Link>
                  </div>

                  <div className="timeline-list">
                    {dispatchTrace.length > 0 ? (
                      dispatchTrace.map((entry) => (
                        <article key={entry.traceId} className="timeline-item">
                          <div>
                            <strong>
                              {formatOpsCodeLabel(
                                currentLocale,
                                entry.eventType,
                              )}
                            </strong>
                            <p>{entry.message}</p>
                          </div>
                          <span>
                            {formatDateTime(currentLocale, entry.createdAt)}
                          </span>
                        </article>
                      ))
                    ) : (
                      <div className="subtle-empty">
                        {currentLocale === "en"
                          ? "No dispatch trace entries yet."
                          : "尚無 dispatch trace 紀錄。"}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="subtle-empty">
                  {currentLocale === "en"
                    ? "Select or link an order to load dispatch trace."
                    : "請先選取或連結訂單，才能載入 dispatch trace。"}
                </div>
              )}
            </article>
          </section>

          <aside className="workspace-rail">
            <article className="canvas-card rail-card">
              <div className="card-head">
                <div>
                  <span className="section-kicker">
                    {currentLocale === "en"
                      ? "Callback queue"
                      : "Callback 佇列"}
                  </span>
                  <h3>
                    {currentLocale === "en"
                      ? "Across all sessions"
                      : "跨所有 session"}
                  </h3>
                </div>
                <span className="count-pill">{pendingCallbacks.length}</span>
              </div>
              <div className="queue-list">
                {filteredCallbackQueue.length > 0 ? (
                  filteredCallbackQueue.map((callback) => (
                    <button
                      key={callback.callbackTaskId}
                      type="button"
                      className="queue-item"
                      onClick={() => setSelectedCallId(callback.callId)}
                    >
                      <div>
                        <strong>{callback.callbackTaskId}</strong>
                        <p>{getCallbackSummary(callback, currentLocale)}</p>
                      </div>
                      <span>
                        {formatRelativeDeadline(callback.dueAt, currentLocale)}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="subtle-empty">
                    {currentLocale === "en"
                      ? "No callbacks match the current scope."
                      : "目前 scope 內沒有 callback。"}
                  </div>
                )}
              </div>
            </article>

            <article className="canvas-card rail-card">
              <div className="card-head">
                <div>
                  <span className="section-kicker">
                    {currentLocale === "en" ? "Recording queue" : "錄音佇列"}
                  </span>
                  <h3>
                    {currentLocale === "en"
                      ? "Awaiting auto-link or manual attach"
                      : "等待自動連結或手動補掛"}
                  </h3>
                </div>
                <span className="count-pill">{recordingQueue.length}</span>
              </div>
              <div className="queue-list">
                {recordingQueue.length > 0 ? (
                  recordingQueue.map((session) => (
                    <button
                      key={session.callId}
                      type="button"
                      className="queue-item"
                      onClick={() => setSelectedCallId(session.callId)}
                    >
                      <div>
                        <strong>{session.callId}</strong>
                        <p>{session.callerPhone}</p>
                      </div>
                      <span
                        className={getRecordingStateTone(
                          session.recordingState,
                        )}
                      >
                        {formatOpsCodeLabel(
                          currentLocale,
                          session.recordingState,
                        )}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="subtle-empty">
                    {currentLocale === "en"
                      ? "No recording gaps right now."
                      : "目前沒有錄音缺口。"}
                  </div>
                )}
              </div>
            </article>

            <article className="canvas-card rail-card">
              <div className="card-head">
                <div>
                  <span className="section-kicker">
                    {currentLocale === "en"
                      ? "Session history"
                      : "Session 歷史"}
                  </span>
                  <h3>
                    {currentLocale === "en" ? "Closed calls" : "已結束通話"}
                  </h3>
                </div>
                <span className="count-pill">{sessionHistory.length}</span>
              </div>
              <div className="queue-list">
                {sessionHistory.length > 0 ? (
                  sessionHistory.map((session) => (
                    <button
                      key={session.callId}
                      type="button"
                      className="queue-item"
                      onClick={() => setSelectedCallId(session.callId)}
                    >
                      <div>
                        <strong>{session.callId}</strong>
                        <p>
                          {formatOpsCodeLabel(currentLocale, session.callType)}{" "}
                          · {session.callerPhone}
                        </p>
                      </div>
                      <span>
                        {formatDateTime(currentLocale, session.endedAt)}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="subtle-empty">
                    {currentLocale === "en"
                      ? "No closed sessions yet."
                      : "目前尚無已關閉 session。"}
                  </div>
                )}
              </div>
            </article>
          </aside>
        </div>
      </div>

      <style>{`
        .callcenter-shell {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding-bottom: 28px;
          color: ${theme.text};
        }

        .hero-card,
        .canvas-card,
        .summary-card {
          border: 1px solid ${theme.border};
          border-radius: 24px;
          background:
            linear-gradient(160deg, rgba(255, 255, 255, 0.03), transparent 40%),
            ${theme.surface};
          box-shadow: 0 24px 64px rgba(6, 11, 20, 0.28);
        }

        .hero-card {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.8fr);
          gap: 20px;
          padding: 28px;
          background:
            radial-gradient(circle at top left, rgba(255, 122, 89, 0.22), transparent 36%),
            linear-gradient(160deg, rgba(255, 255, 255, 0.03), transparent 42%),
            ${theme.surface};
        }

        .hero-copy h2 {
          margin: 8px 0 12px;
          font-size: 32px;
          line-height: 1.05;
        }

        .hero-copy p {
          margin: 0;
          max-width: 68ch;
          color: ${theme.textMuted};
        }

        .hero-eyebrow,
        .section-kicker {
          display: inline-flex;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255, 122, 89, 0.14);
          color: ${theme.accent};
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .header-action {
          min-height: 40px;
          padding: 0 16px;
          border-radius: 999px;
          border: 1px solid ${theme.border};
          background: ${theme.surfaceLo};
          color: ${theme.text};
          font-weight: 600;
          cursor: pointer;
        }

        .header-action-primary {
          background: ${theme.accent};
          border-color: ${theme.accent};
          color: #0d1015;
        }

        .header-action:disabled,
        .header-tab-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .header-tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 0;
          border: 0;
          background: transparent;
          color: inherit;
          font: inherit;
          cursor: pointer;
        }

        .header-tab-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 22px;
          min-height: 22px;
          padding: 0 7px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          font-size: 11px;
          font-weight: 700;
        }

        .hero-metrics,
        .summary-grid,
        .action-strip,
        .mini-actions,
        .trace-links,
        .deep-link-list {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .hero-metrics {
          align-content: start;
          justify-content: flex-end;
        }

        .hero-controls {
          display: flex;
          flex-direction: column;
          gap: 12px;
          align-items: stretch;
        }

        .hero-chip,
        .summary-card,
        .action-chip-card {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 140px;
          padding: 14px 16px;
          border-radius: 18px;
          background: ${theme.surfaceLo};
          border: 1px solid ${theme.border};
        }

        .hero-chip strong,
        .summary-card strong {
          font-size: 24px;
        }

        .hero-chip span,
        .summary-card span,
        .spotlight-cell span {
          color: ${theme.textMuted};
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .hero-chip-accent {
          background: ${theme.accentBg};
          border-color: ${theme.accentBorder};
        }

        .hero-chip-warning {
          background: rgba(255, 184, 77, 0.12);
          border-color: rgba(255, 184, 77, 0.28);
        }

        .notice-banner,
        .error-banner {
          display: flex;
          gap: 12px;
          align-items: center;
          padding: 14px 16px;
          border-radius: 18px;
          border: 1px solid ${theme.info};
          background: ${theme.infoBg};
        }

        .notice-warning {
          border-color: rgba(255, 184, 77, 0.42);
          background: rgba(255, 184, 77, 0.12);
        }

        .error-banner {
          border-color: rgba(255, 91, 91, 0.42);
          background: rgba(255, 91, 91, 0.12);
        }

        .notice-link {
          color: ${theme.accent};
          font-weight: 600;
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .summary-card small,
        .spotlight-cell small,
        .action-note,
        .card-head p,
        .subtle-empty,
        .empty-state p,
        .queue-item p,
        .timeline-item p,
        .action-chip-card {
          color: ${theme.textMuted};
        }

        .toolbar {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }

        .search-input,
        .grid-form input,
        .grid-form select,
        .stack-form input,
        .stack-form select,
        .stack-form textarea {
          width: 100%;
          min-height: 44px;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid ${theme.border};
          background: ${theme.surfaceLo};
          color: ${theme.text};
        }

        .search-input {
          flex: 1 1 280px;
        }

        .toolbar-btn {
          min-height: 44px;
          padding: 0 16px;
          border-radius: 14px;
          border: 1px solid ${theme.border};
          background: ${theme.surfaceLo};
          color: ${theme.text};
          cursor: pointer;
        }

        .toolbar-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .toolbar-btn-primary {
          background: ${theme.accent};
          border-color: ${theme.accent};
          color: #0d1015;
          font-weight: 700;
        }

        .toolbar-meta {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-left: auto;
          flex-wrap: wrap;
        }

        .toolbar-hint {
          color: ${theme.textMuted};
          font-size: 12px;
        }

        .tier-chip,
        .count-pill,
        .state-pill,
        .status-chip,
        .freshness-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 28px;
          padding: 0 10px;
          border-radius: 999px;
          border: 1px solid ${theme.border};
          background: ${theme.surfaceLo};
          font-size: 12px;
          font-weight: 700;
        }

        .freshness-fresh {
          border-color: rgba(55, 211, 153, 0.34);
          color: #83f1c2;
        }

        .freshness-stale,
        .freshness-degraded {
          border-color: rgba(255, 184, 77, 0.28);
          color: #ffd08a;
        }

        .status-chip {
          border-color: rgba(104, 179, 255, 0.28);
          color: #92c9ff;
        }

        .state-positive {
          background: rgba(55, 211, 153, 0.14);
          border-color: rgba(55, 211, 153, 0.34);
          color: #83f1c2;
        }

        .state-warning {
          background: rgba(255, 184, 77, 0.12);
          border-color: rgba(255, 184, 77, 0.28);
          color: #ffd08a;
        }

        .state-danger {
          background: rgba(255, 91, 91, 0.12);
          border-color: rgba(255, 91, 91, 0.34);
          color: #ff9c9c;
        }

        .action-meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }

        .action-risk,
        .action-note {
          font-size: 12px;
        }

        .canvas-card {
          padding: 22px;
        }

        .card-head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 18px;
        }

        .card-head h3,
        .mini-panel h4,
        .empty-state h4 {
          margin: 8px 0 10px;
        }

        .workspace-grid {
          display: grid;
          grid-template-columns: minmax(260px, 320px) minmax(0, 1.3fr) minmax(260px, 0.82fr);
          gap: 18px;
        }

        .workspace-left-rail,
        .workspace-main,
        .workspace-rail,
        .trace-stack,
        .queue-list,
        .stack-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .spotlight-grid,
        .action-panels {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .action-panels-wide {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .spotlight-cell,
        .mini-panel,
        .queue-item,
        .signal-card,
        .timeline-item,
        .loading-state,
        .empty-state {
          border-radius: 18px;
          border: 1px solid ${theme.border};
          background: ${theme.surfaceLo};
        }

        .spotlight-cell,
        .mini-panel,
        .signal-card,
        .loading-state,
        .empty-state {
          padding: 16px;
        }

        .signal-card span {
          color: ${theme.textMuted};
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .signal-card strong {
          display: block;
          margin-top: 6px;
        }

        .signal-card small {
          display: block;
          margin-top: 6px;
          color: ${theme.textMuted};
        }

        .spotlight-cell strong,
        .queue-item strong,
        .timeline-item strong {
          display: block;
          margin-top: 6px;
        }

        .deep-link-pill {
          display: inline-flex;
          align-items: center;
          min-height: 34px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid ${theme.accentBorder};
          background: ${theme.accentBg};
          color: ${theme.accent};
          text-decoration: none;
        }

        .deep-link-empty {
          color: ${theme.textMuted};
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          gap: 12px;
          align-items: flex-start;
        }

        .empty-accent {
          display: inline-flex;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .empty-info {
          border-color: rgba(104, 179, 255, 0.28);
          background: rgba(104, 179, 255, 0.08);
        }

        .empty-warn {
          border-color: rgba(255, 184, 77, 0.28);
          background: rgba(255, 184, 77, 0.08);
        }

        .empty-danger {
          border-color: rgba(255, 91, 91, 0.28);
          background: rgba(255, 91, 91, 0.08);
        }

        .grid-form {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .grid-form label,
        .check-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
          color: ${theme.textMuted};
        }

        .check-field {
          flex-direction: row;
          align-items: center;
          gap: 10px;
          padding-top: 30px;
        }

        .form-actions {
          display: flex;
          align-items: end;
        }

        .mini-panel h4 {
          font-size: 16px;
        }

        .queue-item,
        .timeline-item {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px;
          color: ${theme.text};
          text-align: left;
        }

        button.queue-item {
          cursor: pointer;
        }

        .inline-complete {
          border-top: 1px dashed ${theme.border};
          padding-top: 12px;
        }

        @media (max-width: 1180px) {
          .hero-card,
          .workspace-grid,
          .spotlight-grid,
          .action-panels,
          .summary-grid,
          .grid-form {
            grid-template-columns: 1fr;
          }

          .toolbar-meta {
            width: 100%;
            margin-left: 0;
          }
        }
      `}</style>
    </>
  );
}

import type {
  CallSessionRecord,
  CallbackTaskRecord,
  ResourceActionDescriptor,
} from "@drts/contracts";

export type AiCallControlOwner =
  | "ai"
  | "human_queue"
  | "human_operator"
  | "bridging";

export type AiCallProcessingStep =
  | "greeting"
  | "collecting_slots"
  | "confirming"
  | "booking"
  | "dispatched"
  | "exception"
  | "handed_off"
  | "completed";

export type AiCallExceptionCategory =
  | "location_unresolved"
  | "customer_requested"
  | "service_unsupported"
  | "urgent_safety"
  | "provider_timeout"
  | "capacity_exceeded"
  | "command_pending_reconciliation"
  | "recording_checkpoint_failed"
  | "other";

export type NextResponsibleParty =
  | "human_operator"
  | "supervisor"
  | "driver_liaison"
  | "system_reaper"
  | "callcenter_queue";

export interface UnknownOperationProof {
  commandId: string;
  actionKey: string;
  receiptStatus: "unknown" | "pending_reconciliation" | "timeout";
  description: string;
  detectedAt: string;
  canRetry: false; // Forbidden to blindly retry when outcome is unknown (SD §7.2)
}

export interface ConfirmedVoiceData {
  callerUtterance?: string;
  addressCandidates?: string[];
  confirmedPickup?: string;
  confirmedDropoff?: string;
  bookerName?: string;
  bookerPhone?: string;
  passengerName?: string;
  passengerPhone?: string;
  driverContactRole?: "booker" | "passenger";
  callbackRecipientRole?: "booker" | "passenger";
  draftVersion?: number;
  lastUnresolvedQuestion?: string;
}

export type VoiceDispatchState =
  | "matching"
  | "offered"
  | "accepted"
  | "arrived"
  | "retrying"
  | "manual_intervention"
  | "terminal";

export interface VoiceDispatchPresentation {
  rawState: VoiceDispatchState;
  displayText: string;
  isDispatched: boolean; // Acceptance: matching is NOT dispatched!
  driverName?: string | null;
  licensePlate?: string | null;
  etaMinutes?: number | null;
}

export type VoiceTtsState = "generating" | "generated" | "playing" | "played";

export interface VoiceTtsPresentation {
  rawState: VoiceTtsState;
  displayText: string;
  isPlayed: boolean; // Acceptance: generated TTS is NOT played!
}

export interface AiCallSessionMetadata {
  voiceSessionId: string;
  brandId?: string | null;
  controlOwner: AiCallControlOwner;
  step: AiCallProcessingStep;
  language: string;
  providerVersion?: string;
  routeProfileVersion?: number;
  latencies?: {
    asrMs?: number;
    llmMs?: number;
    ttsMs?: number;
    endToEndMs?: number;
  };
  confirmedData?: ConfirmedVoiceData;
  hasException: boolean;
  exceptionDetails?: {
    category: AiCallExceptionCategory;
    reason: string;
    nextResponsibleParty: NextResponsibleParty;
    unknownOperation?: UnknownOperationProof | null;
  };
  dispatchState?: VoiceDispatchState;
  ttsState?: VoiceTtsState;
  requiresApprovalGate: false; // Acceptance: 正常 AI 通話可觀察且不存在必按批准才能建單的 UI/後端 gate
}

export type ExtendedCallSessionRecord = CallSessionRecord & {
  brandId?: string | null;
  aiMetadata?: AiCallSessionMetadata | null;
  recordingAuthorized?: boolean;
};

export type ExtendedCallbackTaskRecord = CallbackTaskRecord & {
  brandId?: string | null;
  contactRole?: "booker" | "passenger";
  contactName?: string | null;
  consentRef?: string | null;
  attemptCount?: number;
  lastOutcome?: string | null;
  assignedOperatorId?: string | null;
};

/**
 * SD §7.6 / SA §8: Dispatch state presentation truth.
 * Acceptance requirement: 不把 matching 當已派.
 * Only driver acceptance / vehicle arrival constitutes an active dispatched trip.
 */
export function deriveDispatchPresentation(
  rawState: VoiceDispatchState | string | undefined,
  meta?: {
    driverName?: string | null;
    licensePlate?: string | null;
    etaMinutes?: number | null;
  },
): VoiceDispatchPresentation {
  switch (rawState) {
    case "matching":
      return {
        rawState: "matching",
        displayText: "媒合選車中 (Matching)",
        isDispatched: false, // CRITICAL: matching is NOT dispatched!
        driverName: null,
        licensePlate: null,
        etaMinutes: null,
      };
    case "offered":
      return {
        rawState: "offered",
        displayText: "已送出邀約 (Offered)",
        isDispatched: false, // Waiting for driver response
        ...meta,
      };
    case "accepted":
      return {
        rawState: "accepted",
        displayText: "司機已接單 / 已派車 (Dispatched)",
        isDispatched: true, // Driver accepted -> successfully dispatched
        ...meta,
      };
    case "arrived":
      return {
        rawState: "arrived",
        displayText: "車輛已抵達 (Arrived)",
        isDispatched: true,
        ...meta,
      };
    case "retrying":
      return {
        rawState: "retrying",
        displayText: "重新尋車中 (Retrying)",
        isDispatched: false,
        ...meta,
      };
    case "manual_intervention":
      return {
        rawState: "manual_intervention",
        displayText: "需要人工排程 (Manual Intervention)",
        isDispatched: false,
        ...meta,
      };
    case "terminal":
      return {
        rawState: "terminal",
        displayText: "派遣終態 (Terminal)",
        isDispatched: false,
        ...meta,
      };
    default:
      return {
        rawState: "matching",
        displayText: "未派遣 (Not Dispatched)",
        isDispatched: false,
        ...meta,
      };
  }
}

/**
 * SD §13 / SA §8: Audio / TTS presentation truth.
 * Acceptance requirement: 不把 generated TTS 當已播.
 * Only confirmed playback ack represents played audio.
 */
export function deriveTtsPresentation(
  rawState: VoiceTtsState | string | undefined,
): VoiceTtsPresentation {
  switch (rawState) {
    case "generating":
      return {
        rawState: "generating",
        displayText: "語音合成中 (Generating)",
        isPlayed: false,
      };
    case "generated":
      return {
        rawState: "generated",
        displayText: "語音已生成 · 尚未播放 (Generated)",
        isPlayed: false, // CRITICAL: generated TTS is NOT played!
      };
    case "playing":
      return {
        rawState: "playing",
        displayText: "播放中 (Playing)",
        isPlayed: false,
      };
    case "played":
      return {
        rawState: "played",
        displayText: "語音已播放 (Played)",
        isPlayed: true,
      };
    default:
      return {
        rawState: "generating",
        displayText: "待合成 (Pending)",
        isPlayed: false,
      };
  }
}

/**
 * Multi-tenant brand isolation.
 * Acceptance requirement: 未授權品牌不呈現.
 */
export function filterSessionsByBrandAuthorization<
  T extends { brandId?: string | null },
>(sessions: T[], authorizedBrandIds?: readonly string[] | null): T[] {
  if (!authorizedBrandIds || authorizedBrandIds.length === 0) {
    return sessions;
  }
  return sessions.filter((session) => {
    if (!session.brandId) {
      return true; // Sessions with no brand scope are system-wide
    }
    return authorizedBrandIds.includes(session.brandId);
  });
}

/**
 * Recording governance and permission masking (UV-AC-028).
 * Acceptance requirement: 未授權錄音資料不呈現.
 */
export function applyRecordingAuthorization<T extends CallSessionRecord>(
  session: T,
  isRecordingAuthorized: boolean,
): T {
  if (isRecordingAuthorized) {
    return session;
  }
  return {
    ...session,
    recordingId: null,
    providerRecordingRef: null,
    recordingUrl: null,
    recordingState: "missing",
    flags: session.flags
      .filter((flag) => flag !== "recording_bound")
      .concat("recording_unauthorized"),
  };
}

/**
 * SD §12.5 / SA §8.2 / UV-AC-040: Consented callback action rules.
 * Acceptance requirement: closed call 仍可 claim/contact/close callback.
 * A call session status of "closed" must NOT disable callback operations.
 */
export function buildCallbackActionsForRecord(
  callback: CallbackTaskRecord | null | undefined,
  isCallClosed: boolean,
): ResourceActionDescriptor[] {
  if (!callback) {
    return [
      {
        action: "claim_callback",
        enabled: false,
        riskLevel: "low",
        disabledReasonCode: "callback_missing",
      },
      {
        action: "contact_callback",
        enabled: false,
        riskLevel: "low",
        disabledReasonCode: "callback_missing",
      },
      {
        action: "complete_callback",
        enabled: false,
        riskLevel: "low",
        disabledReasonCode: "callback_missing",
      },
      {
        action: "cancel_callback",
        enabled: false,
        riskLevel: "medium",
        requiresReason: true,
        disabledReasonCode: "callback_missing",
      },
    ];
  }
  function createDescriptor(
    action: string,
    enabled: boolean,
    riskLevel: ResourceActionDescriptor["riskLevel"],
    disabledReasonCode?: string,
    requiresReason?: boolean,
  ): ResourceActionDescriptor {
    return {
      action,
      enabled,
      riskLevel,
      ...(disabledReasonCode ? { disabledReasonCode } : {}),
      ...(requiresReason ? { requiresReason: true } : {}),
    };
  }

  const statusStr = callback.status as string;
  const isTerminal =
    statusStr === "completed" ||
    statusStr === "cancelled" ||
    statusStr === "unreachable";
  const isPending = statusStr === "pending";
  const isClaimedOrInProgress =
    statusStr === "claimed" || statusStr === "in_progress";

  return [
    createDescriptor(
      "claim_callback",
      !isTerminal && isPending,
      "low",
      isTerminal
        ? "callback_terminal"
        : !isPending
          ? "callback_already_claimed"
          : undefined,
    ),
    createDescriptor(
      "contact_callback",
      !isTerminal,
      "low",
      isTerminal ? "callback_terminal" : undefined,
    ),
    createDescriptor(
      "complete_callback",
      !isTerminal && (isPending || isClaimedOrInProgress),
      "low",
      isTerminal ? "callback_terminal" : undefined,
    ),
    createDescriptor(
      "cancel_callback",
      !isTerminal,
      "medium",
      isTerminal ? "callback_terminal" : undefined,
      true,
    ),
  ];
}

/**
 * Builds AI session actions including atomic human takeover.
 */
export function buildAiSessionActions(
  session: CallSessionRecord,
  aiMeta?: AiCallSessionMetadata | null,
): ResourceActionDescriptor[] {
  const isClosed = session.status === "closed";
  const controlOwner = aiMeta?.controlOwner ?? "ai";
  const canTakeover =
    !isClosed && (controlOwner === "ai" || controlOwner === "human_queue");
  const disabledReasonCode = isClosed
    ? "session_closed"
    : !canTakeover
      ? "already_controlled_by_human"
      : undefined;

  return [
    {
      action: "takeover_ai_session",
      enabled: canTakeover,
      riskLevel: "medium",
      ...(disabledReasonCode ? { disabledReasonCode } : {}),
    },
  ];
}

/**
 * Checks whether an AI session is normal (autonomous, no exception).
 * Acceptance requirement: 正常 AI 通話可觀察且不存在必按批准才能建單的 UI/後端 gate.
 */
export function isNormalAiCallSession(
  session: ExtendedCallSessionRecord,
): boolean {
  const isAi =
    (session.callType as string) === "ai_booking" ||
    Boolean(session.aiMetadata) ||
    session.flags.includes("ai_session");
  const hasException =
    Boolean(session.aiMetadata?.hasException) ||
    session.flags.includes("exception") ||
    session.flags.includes("ai_exception");
  return isAi && !hasException;
}

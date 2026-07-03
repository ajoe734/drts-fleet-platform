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
  ActionButton,
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
import {
  AddressMapPicker,
  type AddressMapPickerChange,
  type AddressMapPickerLabels,
  type AddressMapPickerProvider,
} from "@drts/ui-web/client";
import type {
  AddressPayload,
  AttachCallRecordingCommand,
  CallbackTaskRecord,
  CallRecordingState,
  CallSessionRecord,
  ComplaintCategory,
  CrossAppResourceLink,
  DispatchTraceLogRecord,
  EmptyReason,
  OpenCallSessionCommand,
  OwnedOrderRecord,
  RefreshTier,
  ResourceActionDescriptor,
  ServiceAreaEvaluationResult,
  TransferCallToComplaintCommand,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "@drts/contracts";
import { CALL_TYPES, COMPLAINT_CATEGORIES } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel, formatOpsCodeList } from "@/lib/localized-labels";
import {
  CALLCENTER_MAP_SERVICE_PRODUCT_TYPE,
  buildCallcenterMapOrderCommand,
  getCallcenterMapBookingGate,
  hasCallcenterAddressCoordinates,
  type CallcenterMapBookingBlockReason,
  type CallcenterMapBookingGate,
  type CallcenterServiceabilityPreviewStatus,
} from "./map-booking";

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

type MapPickerProviderState = AddressMapPickerChange["providerState"];

const INITIAL_INTAKE_FORM: OpenCallSessionCommand = {
  callType: "booking",
  callerPhone: "",
  agentId: "AGENT-OPS-001",
  agentIdentityAnnounced: true,
};

const INITIAL_ORDER_FORM = {
  passengerName: "",
  passengerPhone: "",
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

const mapBookingSectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  padding: 14,
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
};

const mapBookingPickerStackStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 14,
};

const mapBookingHeadingStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const INITIAL_ADDRESS_PROVIDER_STATE: MapPickerProviderState = {
  available: true,
  degraded: false,
  reasonCode: "available",
};

function getCallcenterMapBookingSectionCopy(
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  return {
    title: t("callcenter.mapBooking.section.title"),
    description: t("callcenter.mapBooking.section.description"),
    pickupTitle: t("callcenter.mapBooking.section.pickupTitle"),
    dropoffTitle: t("callcenter.mapBooking.section.dropoffTitle"),
  };
}

function getCallcenterMapPickerLabels(
  t: (key: string, params?: Record<string, string | number>) => string,
): Partial<AddressMapPickerLabels> {
  return {
    searchLabel: t("callcenter.mapBooking.picker.searchLabel"),
    searchPlaceholder: t("callcenter.mapBooking.picker.searchPlaceholder"),
    searchButton: t("callcenter.mapBooking.picker.searchButton"),
    searching: t("callcenter.mapBooking.picker.searching"),
    candidatesTitle: t("callcenter.mapBooking.picker.candidatesTitle"),
    noMatchTitle: t("callcenter.mapBooking.picker.noMatchTitle"),
    noMatchBody: t("callcenter.mapBooking.picker.noMatchBody"),
    manualToggle: t("callcenter.mapBooking.picker.manualToggle"),
    manualTitle: t("callcenter.mapBooking.picker.manualTitle"),
    manualLatLabel: t("callcenter.mapBooking.picker.manualLatLabel"),
    manualLngLabel: t("callcenter.mapBooking.picker.manualLngLabel"),
    manualReasonLabel: t("callcenter.mapBooking.picker.manualReasonLabel"),
    manualReasonPlaceholder: t(
      "callcenter.mapBooking.picker.manualReasonPlaceholder",
    ),
    manualApply: t("callcenter.mapBooking.picker.manualApply"),
    manualInvalid: t("callcenter.mapBooking.picker.manualInvalid"),
    providerOutageTitle: t("callcenter.mapBooking.picker.providerOutageTitle"),
    providerOutageBody: t("callcenter.mapBooking.picker.providerOutageBody"),
    degradedNote: t("callcenter.mapBooking.picker.degradedNote"),
    confidenceLabel: t("callcenter.mapBooking.picker.confidenceLabel"),
    provenanceLabel: t("callcenter.mapBooking.picker.provenanceLabel"),
    coordinatesLabel: t("callcenter.mapBooking.picker.coordinatesLabel"),
    mapEmpty: t("callcenter.mapBooking.picker.mapEmpty"),
    mapHint: t("callcenter.mapBooking.picker.mapHint"),
    pinAdjustHint: t("callcenter.mapBooking.picker.pinAdjustHint"),
    clearSelection: t("callcenter.mapBooking.picker.clearSelection"),
    serviceableTitle: t("callcenter.mapBooking.picker.serviceableTitle"),
    manualReviewTitle: t("callcenter.mapBooking.picker.manualReviewTitle"),
    notServiceableTitle: t("callcenter.mapBooking.picker.notServiceableTitle"),
    serviceabilityPending: t(
      "callcenter.mapBooking.picker.serviceabilityPending",
    ),
  };
}

type MapBookingBannerState = {
  code: CallcenterMapBookingBlockReason | "serviceable" | "manual_review";
  tone: Exclude<CanvasTone, "neutral">;
  icon: "ok" | "warn" | "clock";
  title: string;
  body: string;
  submitHelper?: string;
};

function getMapBookingBannerState(
  t: (key: string, params?: Record<string, string | number>) => string,
  gate: CallcenterMapBookingGate,
  serviceability: ServiceAreaEvaluationResult | null,
  previewStatus: CallcenterServiceabilityPreviewStatus,
): MapBookingBannerState {
  const reasonBody =
    serviceability?.reasonMessages?.filter(Boolean).join(" ") ?? "";

  if (!gate.canSubmit) {
    switch (gate.reason) {
      case "pickup_coordinates_required":
        return {
          code: gate.reason,
          tone: "warn",
          icon: "warn",
          title: t("callcenter.mapBooking.banner.pickupCoordinatesTitle"),
          body: t("callcenter.mapBooking.banner.pickupCoordinatesBody"),
          submitHelper: t(
            "callcenter.mapBooking.banner.pickupCoordinatesTitle",
          ),
        };
      case "dropoff_coordinates_required":
        return {
          code: gate.reason,
          tone: "warn",
          icon: "warn",
          title: t("callcenter.mapBooking.banner.dropoffCoordinatesTitle"),
          body: t("callcenter.mapBooking.banner.dropoffCoordinatesBody"),
          submitHelper: t(
            "callcenter.mapBooking.banner.dropoffCoordinatesTitle",
          ),
        };
      case "pickup_provenance_required":
        return {
          code: gate.reason,
          tone: "warn",
          icon: "warn",
          title: t("callcenter.mapBooking.banner.pickupProvenanceTitle"),
          body: t("callcenter.mapBooking.banner.pickupProvenanceBody"),
          submitHelper: t("callcenter.mapBooking.banner.pickupProvenanceTitle"),
        };
      case "dropoff_provenance_required":
        return {
          code: gate.reason,
          tone: "warn",
          icon: "warn",
          title: t("callcenter.mapBooking.banner.dropoffProvenanceTitle"),
          body: t("callcenter.mapBooking.banner.dropoffProvenanceBody"),
          submitHelper: t(
            "callcenter.mapBooking.banner.dropoffProvenanceTitle",
          ),
        };
      case "serviceability_preview_unavailable":
        return {
          code: gate.reason,
          tone: "danger",
          icon: "warn",
          title: t("callcenter.mapBooking.banner.previewUnavailableTitle"),
          body: t("callcenter.mapBooking.banner.previewUnavailableBody"),
          submitHelper: t(
            "callcenter.mapBooking.banner.previewUnavailableTitle",
          ),
        };
      case "serviceability_blocked":
        return {
          code: gate.reason,
          tone: "danger",
          icon: "warn",
          title: t("callcenter.mapBooking.banner.blockedTitle"),
          body: reasonBody || t("callcenter.mapBooking.banner.blockedBody"),
          submitHelper: t("callcenter.mapBooking.banner.blockedTitle"),
        };
      case "serviceability_preview_required":
      default:
        return {
          code: gate.reason,
          tone: previewStatus === "evaluating" ? "info" : "warn",
          icon: previewStatus === "evaluating" ? "clock" : "warn",
          title: t("callcenter.mapBooking.banner.previewPendingTitle"),
          body: t("callcenter.mapBooking.banner.previewPendingBody"),
          submitHelper: t("callcenter.mapBooking.banner.previewPendingTitle"),
        };
    }
  }

  if (gate.decision === "manual_review") {
    return {
      code: gate.decision,
      tone: "warn",
      icon: "warn",
      title: t("callcenter.mapBooking.banner.manualReviewTitle"),
      body: reasonBody || t("callcenter.mapBooking.banner.manualReviewBody"),
      submitHelper: t("callcenter.mapBooking.banner.manualReviewHelper"),
    };
  }

  return {
    code: gate.decision,
    tone: "success",
    icon: "ok",
    title: t("callcenter.mapBooking.banner.serviceableTitle"),
    body: reasonBody || t("callcenter.mapBooking.banner.serviceableBody"),
  };
}

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
  t: (key: string, params?: Record<string, string | number>) => string,
  reason: EmptyReason,
): { title: string; body: string; accent: string } {
  switch (reason) {
    case "not_provisioned":
      return {
        title: t("callcenter.emptyState.notProvisioned.title"),
        body: t("callcenter.emptyState.notProvisioned.body"),
        accent: t("callcenter.emptyState.notProvisioned.accent"),
      };
    case "fetch_failed":
      return {
        title: t("callcenter.emptyState.fetchFailed.title"),
        body: t("callcenter.emptyState.fetchFailed.body"),
        accent: t("callcenter.emptyState.fetchFailed.accent"),
      };
    case "permission_denied":
      return {
        title: t("callcenter.emptyState.permissionDenied.title"),
        body: t("callcenter.emptyState.permissionDenied.body"),
        accent: t("callcenter.emptyState.permissionDenied.accent"),
      };
    case "external_unavailable":
      return {
        title: t("callcenter.emptyState.externalUnavailable.title"),
        body: t("callcenter.emptyState.externalUnavailable.body"),
        accent: t("callcenter.emptyState.externalUnavailable.accent"),
      };
    case "filtered_empty":
      return {
        title: t("callcenter.emptyState.filteredEmpty.title"),
        body: t("callcenter.emptyState.filteredEmpty.body"),
        accent: t("callcenter.emptyState.filteredEmpty.accent"),
      };
    case "no_data":
    default:
      return {
        title: t("callcenter.emptyState.noData.title"),
        body: t("callcenter.emptyState.noData.body"),
        accent: t("callcenter.emptyState.noData.accent"),
      };
  }
}

function getDisabledReasonLabel(
  t: (key: string, params?: Record<string, string | number>) => string,
  code?: string,
) {
  switch (code) {
    case "active_session_exists":
      return t("callcenter.disabled.activeSessionExists");
    case "identity_already_announced":
      return t("callcenter.disabled.identityAlreadyAnnounced");
    case "session_closed":
      return t("callcenter.disabled.sessionClosed");
    case "linked_order_exists":
      return t("callcenter.disabled.linkedOrderExists");
    case "complaint_exists":
      return t("callcenter.disabled.complaintExists");
    case "callback_missing":
      return t("callcenter.disabled.callbackMissing");
    case "compliance_scope_required":
      return t("callcenter.disabled.complianceScopeRequired");
    default:
      return t("callcenter.disabled.actionUnavailable");
  }
}

function getActionLabel(
  t: (key: string, params?: Record<string, string | number>) => string,
  action: string,
) {
  const labelKeyByAction: Record<string, string> = {
    open_call_session: "callcenter.action.openCallSession",
    announce_identity: "callcenter.action.announceIdentity",
    close_session: "callcenter.action.closeSession",
    quote_eta: "callcenter.action.quoteEta",
    create_callback: "callcenter.action.createCallback",
    complete_callback: "callcenter.action.completeCallback",
    create_phone_booking: "callcenter.action.createPhoneBooking",
    link_existing_order: "callcenter.action.linkExistingOrder",
    transfer_to_complaint: "callcenter.action.transferToComplaint",
    attach_recording: "callcenter.action.attachRecording",
  };

  const key = labelKeyByAction[action];
  return key ? t(key) : action;
}

function getRiskLabel(
  t: (key: string, params?: Record<string, string | number>) => string,
  risk: ResourceActionDescriptor["riskLevel"],
) {
  if (risk === "high") {
    return t("callcenter.risk.high");
  }
  if (risk === "medium") {
    return t("callcenter.risk.medium");
  }
  return t("callcenter.risk.low");
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

function buildSessionLinks(
  session: CallSessionRecord,
  t: (key: string, params?: Record<string, string | number>) => string,
): CrossAppResourceLink[] {
  const links: CrossAppResourceLink[] = [];

  if (session.linkedOrderId) {
    links.push({
      targetApp: "ops-console",
      route: `/dispatch/${encodeURIComponent(session.linkedOrderId)}`,
      resourceType: "order",
      resourceId: session.linkedOrderId,
      openMode: "same_tab",
      label: t("callcenter.link.dispatchWorkspace"),
    });
  }

  if (session.linkedCaseNo) {
    links.push({
      targetApp: "ops-console",
      route: `/complaints/${encodeURIComponent(session.linkedCaseNo)}`,
      resourceType: "complaint_case",
      resourceId: session.linkedCaseNo,
      openMode: "same_tab",
      label: t("callcenter.link.complaintDetail"),
    });
  }

  return links;
}

function buildSessionResource(
  session: RuntimeSessionRecord,
  t: (key: string, params?: Record<string, string | number>) => string,
): SessionResource {
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
      : buildSessionLinks(session, t),
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

function formatRelativeDeadline(
  value: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const deltaMinutes = Math.round(
    (new Date(value).getTime() - Date.now()) / (1000 * 60),
  );

  if (deltaMinutes >= 0) {
    return t("callcenter.deadline.dueIn", { value: deltaMinutes });
  }

  return t("callcenter.deadline.overdueBy", {
    value: Math.abs(deltaMinutes),
  });
}

function getCallbackSummary(
  callback: CallbackTaskRecord,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const parts = [
    callback.agentId ?? t("callcenter.callback.unassigned"),
    callback.note ?? t("callcenter.callback.noNote"),
  ];

  return parts.join(" · ");
}

function describeAction(
  t: (key: string, params?: Record<string, string | number>) => string,
  descriptor: ResourceActionDescriptor,
  onCancelled?: () => void,
) {
  if (typeof window === "undefined") {
    return { proceed: true, reason: "" };
  }

  if (descriptor.riskLevel !== "low") {
    const confirmed = window.confirm(
      t("callcenter.confirm.action", {
        action: getActionLabel(t, descriptor.action),
      }),
    );
    if (!confirmed) {
      onCancelled?.();
      return { proceed: false, reason: "" };
    }
  }

  if (descriptor.requiresReason) {
    const reason = window.prompt(t("callcenter.prompt.operatorNote"), "");
    if (!reason?.trim()) {
      onCancelled?.();
      return { proceed: false, reason: "" };
    }
    return { proceed: true, reason: reason.trim() };
  }

  return { proceed: true, reason: "" };
}

function renderActionMeta(
  t: (key: string, params?: Record<string, string | number>) => string,
  descriptor: ResourceActionDescriptor,
) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <span style={subtleTextStyle}>
        {getRiskLabel(t, descriptor.riskLevel)}
      </span>
      {descriptor.disabledReasonCode && !descriptor.enabled ? (
        <span style={subtleTextStyle}>
          {getDisabledReasonLabel(t, descriptor.disabledReasonCode)}
        </span>
      ) : null}
      {descriptor.requiresReason ? (
        <span style={subtleTextStyle}>
          {t("callcenter.action.reasonRequired")}
        </span>
      ) : null}
    </div>
  );
}

function getActionHelper(
  t: (key: string, params?: Record<string, string | number>) => string,
  descriptor?: ResourceActionDescriptor,
): ReactNode {
  return descriptor ? renderActionMeta(t, descriptor) : undefined;
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
  const mapBookingSectionCopy = getCallcenterMapBookingSectionCopy(t);
  const callcenterMapPickerLabels = getCallcenterMapPickerLabels(t);
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
  const [pickupAddress, setPickupAddress] = useState<AddressPayload | null>(
    null,
  );
  const [dropoffAddress, setDropoffAddress] = useState<AddressPayload | null>(
    null,
  );
  const [pickupProviderState, setPickupProviderState] =
    useState<MapPickerProviderState>(INITIAL_ADDRESS_PROVIDER_STATE);
  const [dropoffProviderState, setDropoffProviderState] =
    useState<MapPickerProviderState>(INITIAL_ADDRESS_PROVIDER_STATE);
  const [serviceabilityPreview, setServiceabilityPreview] =
    useState<ServiceAreaEvaluationResult | null>(null);
  const [serviceabilityPreviewStatus, setServiceabilityPreviewStatus] =
    useState<CallcenterServiceabilityPreviewStatus>("idle");
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
  const mapBookingProvider = useMemo<AddressMapPickerProvider>(
    () => ({
      async search(query) {
        return getOpsClient().searchGeo(query);
      },
      async getHealth() {
        return getOpsClient().getGeoProviderHealth();
      },
    }),
    [],
  );
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const sessionResources = useMemo(
    () =>
      [...sessions]
        .sort(compareCallSessionPriority)
        .map((session) => buildSessionResource(session, t)),
    [sessions, t],
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
  const callcenterActorId =
    selectedSession?.agentId ?? intakeForm.agentId ?? "AGENT-OPS-001";
  const mapBookingGate = useMemo(
    () =>
      getCallcenterMapBookingGate({
        pickup: pickupAddress,
        dropoff: dropoffAddress,
        serviceability: serviceabilityPreview,
        previewStatus: serviceabilityPreviewStatus,
      }),
    [
      dropoffAddress,
      pickupAddress,
      serviceabilityPreview,
      serviceabilityPreviewStatus,
    ],
  );
  const mapBookingBanner = useMemo(
    () =>
      getMapBookingBannerState(
        t,
        mapBookingGate,
        serviceabilityPreview,
        serviceabilityPreviewStatus,
      ),
    [mapBookingGate, serviceabilityPreview, serviceabilityPreviewStatus, t],
  );
  const mapBookingGateCode = mapBookingBanner.code;

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
  const emptyCopy = getEmptyStateCopy(t, effectiveEmptyReason);
  const workspaceAction = buildWorkspaceAction(
    sessions.some((session) => session.status === "active"),
  );
  const activeRefresh =
    queueView === "callback" ? callbackRefresh : sessionRefresh;
  const workspaceStale = isRefreshStale(activeRefresh);
  const tabs = [
    {
      id: "sessions" as const,
      label: t("callcenter.tab.sessions"),
      badge: activeSessions.length,
    },
    {
      id: "callback" as const,
      label: t("callcenter.tab.callbackQueue"),
      badge: pendingCallbacks.length,
    },
    {
      id: "recording" as const,
      label: t("callcenter.tab.recordings"),
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
    setOrderForm(INITIAL_ORDER_FORM);
    setPickupAddress(null);
    setDropoffAddress(null);
    setPickupProviderState(INITIAL_ADDRESS_PROVIDER_STATE);
    setDropoffProviderState(INITIAL_ADDRESS_PROVIDER_STATE);
    setServiceabilityPreview(null);
    setServiceabilityPreviewStatus("idle");
  }, [selectedSession?.callId]);

  useEffect(() => {
    if (
      !hasCallcenterAddressCoordinates(pickupAddress) ||
      !hasCallcenterAddressCoordinates(dropoffAddress)
    ) {
      setServiceabilityPreview(null);
      setServiceabilityPreviewStatus("idle");
      return;
    }

    const command = {
      serviceProductType: CALLCENTER_MAP_SERVICE_PRODUCT_TYPE,
      pickup: { lat: pickupAddress.lat, lng: pickupAddress.lng },
      dropoff: { lat: dropoffAddress.lat, lng: dropoffAddress.lng },
      requestedAt: new Date().toISOString(),
    };

    let cancelled = false;
    setServiceabilityPreviewStatus("evaluating");

    void getOpsClient()
      .evaluateServiceArea(command)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setServiceabilityPreview(result);
        setServiceabilityPreviewStatus("ready");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setServiceabilityPreview(null);
        setServiceabilityPreviewStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [
    dropoffAddress?.lat,
    dropoffAddress?.lng,
    pickupAddress?.lat,
    pickupAddress?.lng,
  ]);

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

    const guard = describeAction(t, descriptor);
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
  const createBookingDisabled =
    !createBookingAction?.enabled || !mapBookingGate.canSubmit;
  const createBookingHelper = !createBookingAction?.enabled
    ? getActionHelper(t, createBookingAction)
    : mapBookingBanner.submitHelper;
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
      h: t("callcenter.col.call"),
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
      h: t("callcenter.col.started"),
      r: (session) => formatDateTime(currentLocale, session.startedAt),
    },
  ];

  const callbackColumns: CanvasTableColumn<RuntimeCallbackRecord>[] = [
    {
      h: t("callcenter.col.task"),
      r: (callback) => (
        <button
          type="button"
          style={queueButtonStyle}
          onClick={() => setSelectedCallId(callback.callId)}
        >
          <div style={{ fontWeight: 600 }}>{callback.callbackTaskId}</div>
          <div style={subtleTextStyle}>{getCallbackSummary(callback, t)}</div>
        </button>
      ),
    },
    {
      h: t("callcenter.col.due"),
      r: (callback) => formatRelativeDeadline(callback.dueAt, t),
    },
  ];

  const recordingColumns: CanvasTableColumn<SessionResource>[] = [
    {
      h: t("callcenter.col.session"),
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
      h: t("callcenter.col.recording"),
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
      h: t("callcenter.col.session"),
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
      h: t("callcenter.col.closed"),
      r: (session) => formatDateTime(currentLocale, session.endedAt),
    },
  ];

  const traceColumns: CanvasTableColumn<DispatchTraceLogRecord>[] = [
    {
      h: t("callcenter.col.event"),
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
      h: t("callcenter.col.at"),
      r: (entry) => formatDateTime(currentLocale, entry.createdAt),
    },
  ];

  return (
    <>
      <PageHeader
        theme={theme}
        title={t("callcenter.title")}
        subtitle={t("callcenter.pageSubtitle")}
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
              : getActionLabel(t, "open_call_session")}
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
                  message: t("callcenter.notice.sessionClosed", {
                    callId: selectedSession.callId,
                  }),
                });
                await loadData(selectedSession.callId);
              })
            }
          >
            {t("callcenter.action.closeCurrent")}
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
              : t("callcenter.workspace.idle")
          }
          subtitle={t("callcenter.workspace.subtitle", {
            tier: CALLCENTER_REFRESH_TIER,
          })}
          actions={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <CanvasPill
                theme={theme}
                tone={workspaceStale ? "warn" : "success"}
              >
                {workspaceStale
                  ? t("callcenter.workspace.stale")
                  : t("callcenter.workspace.fresh")}
              </CanvasPill>
              <CanvasPill
                theme={theme}
                tone={getToneForHealthStatus(health.status)}
              >
                {health.status === "healthy"
                  ? t("callcenter.workspace.healthy")
                  : t("callcenter.workspace.degraded")}
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
              label={t("callcenter.kpi.openSessions")}
              value={String(openSessionsCount)}
            />
            <CanvasKPI
              theme={theme}
              label={t("callcenter.kpi.pendingCallbacks")}
              value={String(pendingCallbacks.length)}
            />
            <CanvasKPI
              theme={theme}
              label={t("callcenter.kpi.recordingGaps")}
              value={String(recordingGapCount)}
            />
            <CanvasKPI
              theme={theme}
              label={t("callcenter.kpi.complaintTransfers")}
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
            <CanvasField theme={theme} label={t("callcenter.lastRefresh")}>
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
              {t("callcenter.refreshNow")}
            </CanvasBtn>
            <CanvasPill theme={theme} tone="neutral">
              {health.degradedServices.length > 0
                ? health.degradedServices
                    .map(
                      (service: UiHealthEnvelope["degradedServices"][number]) =>
                        service.service,
                    )
                    .join(" · ")
                : t("callcenter.noDegradedDependencies")}
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
            title={t("common.error")}
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
                  ? t("callcenter.intake.ready")
                  : t("callcenter.intake.blockedByActiveSession")}
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
                      message: t("callcenter.notice.sessionOpened", {
                        callId: created.callId,
                      }),
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
                <ActionButton
                  theme={theme}
                  disabled={!workspaceAction.enabled}
                  helper={getActionHelper(t, workspaceAction)}
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
              title={t("callcenter.waitingList.title")}
              subtitle={
                queueView === "sessions"
                  ? t("callcenter.waitingList.subtitle.sessions")
                  : queueView === "callback"
                    ? t("callcenter.waitingList.subtitle.callback")
                    : t("callcenter.waitingList.subtitle.recording")
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
                    title={t("callcenter.waitingList.empty.title")}
                    body={t("callcenter.waitingList.empty.body")}
                  />
                </div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={t("callcenter.workspaceStatus.title")}
              subtitle={t("callcenter.workspaceStatus.subtitle")}
            >
              {selectedSession ? (
                <CanvasDL
                  theme={theme}
                  items={[
                    {
                      label: t("callcenter.workspaceStatus.availableActions"),
                      value: String(selectedSession.availableActions.length),
                    },
                    {
                      label: t("callcenter.workspaceStatus.deepLinks"),
                      value: String(selectedSession.deepLinks.length),
                    },
                    {
                      label: t("callcenter.workspaceStatus.health"),
                      value: health.status,
                    },
                    {
                      label: t("callcenter.workspaceStatus.refreshTier"),
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
                  : t("callcenter.activeSession.title")
              }
              subtitle={t("callcenter.activeSession.subtitle")}
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
                  title={t("callcenter.loadingWorkspace.title")}
                  body={t("callcenter.loadingWorkspace.body")}
                />
              ) : selectedSession ? (
                <>
                  <div style={formGridStyle}>
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.field.callType")}
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
                      label={t("callcenter.field.callerPhone")}
                    >
                      <CanvasInput
                        theme={theme}
                        value={selectedSession.callerPhone}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.field.agent")}
                    >
                      <CanvasInput
                        theme={theme}
                        value={selectedSession.agentId ?? "—"}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.field.linkedRecords")}
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
                        label: t("callcenter.field.started"),
                        value: formatDateTime(
                          currentLocale,
                          selectedSession.startedAt,
                        ),
                      },
                      {
                        label: t("callcenter.field.agentIdentity"),
                        value: selectedSession.agentIdentityAnnounced
                          ? t("callcenter.field.agentIdentityAnnouncedAt", {
                              value: formatDateTime(
                                currentLocale,
                                selectedSession.agentIdentityAnnouncedAt,
                              ),
                            })
                          : t("callcenter.field.agentIdentityNotAnnounced"),
                      },
                      {
                        label: t("callcenter.field.flags"),
                        value:
                          selectedSession.flags.length > 0
                            ? formatOpsCodeList(
                                currentLocale,
                                selectedSession.flags,
                              )
                            : "—",
                      },
                      {
                        label: t("callcenter.field.lastEta"),
                        value: selectedSession.lastEtaQuotedMinutes
                          ? t("callcenter.field.lastEtaMinutes", {
                              value: selectedSession.lastEtaQuotedMinutes,
                            })
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
                        {t("callcenter.link.none")}
                      </span>
                    )}
                  </div>
                  <div style={actionGridStyle}>
                    <ActionButton
                      theme={theme}
                      disabled={!announceAction?.enabled}
                      helper={getActionHelper(t, announceAction)}
                      busy={busyKey === "announce"}
                      label={getActionLabel(t, "announce_identity")}
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
                              message: t(
                                "callcenter.notice.identityAnnounced",
                                {
                                  callId: selectedSession.callId,
                                },
                              ),
                            });
                            await loadData(selectedSession.callId);
                          },
                        )
                      }
                    />
                    <ActionButton
                      theme={theme}
                      disabled={!closeAction?.enabled}
                      helper={getActionHelper(t, closeAction)}
                      busy={busyKey === "close"}
                      label={getActionLabel(t, "close_session")}
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
                              message: t("callcenter.notice.sessionClosed", {
                                callId: selectedSession.callId,
                              }),
                            });
                            await loadData(selectedSession.callId);
                          },
                        )
                      }
                    />
                    <ActionButton
                      theme={theme}
                      disabled={!quoteEtaAction?.enabled}
                      helper={getActionHelper(t, quoteEtaAction)}
                      busy={busyKey === "quote-eta"}
                      label={getActionLabel(t, "quote_eta")}
                      onClick={() =>
                        document
                          .getElementById("callcenter-session-actions")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          })
                      }
                    />
                    <ActionButton
                      theme={theme}
                      disabled={!attachRecordingAction?.enabled}
                      helper={getActionHelper(t, attachRecordingAction)}
                      busy={busyKey === "attach-recording"}
                      label={getActionLabel(t, "attach_recording")}
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
                        {t("callcenter.clearSearch")}
                      </CanvasBtn>
                    ) : (
                      <CanvasBtn
                        theme={theme}
                        variant="primary"
                        disabled={!workspaceAction.enabled}
                        onClick={() => setShowIntake(true)}
                      >
                        {getActionLabel(t, "open_call_session")}
                      </CanvasBtn>
                    )
                  }
                />
              )}
            </CanvasCard>

            <div id="callcenter-session-actions">
              <CanvasCard
                theme={theme}
                title={t("callcenter.sessionActions.title")}
                subtitle={t("callcenter.sessionActions.subtitle")}
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
                            message: t("callcenter.notice.etaSaved", {
                              value: quotedEtaMinutes,
                            }),
                          });
                          await loadData(selectedSession.callId);
                        },
                      );
                    }}
                  >
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.field.etaMinutes")}
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
                    <ActionButton
                      theme={theme}
                      disabled={!quoteEtaAction?.enabled}
                      helper={getActionHelper(t, quoteEtaAction)}
                      busy={busyKey === "quote-eta"}
                      label={getActionLabel(t, "quote_eta")}
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
                            message: t("callcenter.notice.recordingAttached", {
                              reason,
                            }),
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
                    <ActionButton
                      theme={theme}
                      disabled={!attachRecordingAction?.enabled}
                      helper={getActionHelper(t, attachRecordingAction)}
                      busy={busyKey === "attach-recording"}
                      label={getActionLabel(t, "attach_recording")}
                      type="submit"
                    />
                  </form>
                </div>
              </CanvasCard>
            </div>

            <CanvasCard
              theme={theme}
              title={t("callcenter.resolutionDesk.title")}
              subtitle={t("callcenter.resolutionDesk.subtitle")}
            >
              <div style={dualFormGridStyle}>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (
                      !selectedSession ||
                      !mapBookingGate.canSubmit ||
                      !hasCallcenterAddressCoordinates(pickupAddress) ||
                      !hasCallcenterAddressCoordinates(dropoffAddress)
                    ) {
                      return;
                    }
                    const command = buildCallcenterMapOrderCommand({
                      callId: selectedSession.callId,
                      agentId: callcenterActorId,
                      recordingId: selectedSession.recordingId,
                      pickup: pickupAddress,
                      dropoff: dropoffAddress,
                      passengerName: orderForm.passengerName,
                      passengerPhone: orderForm.passengerPhone,
                      fallbackPassengerPhone: selectedSession.callerPhone,
                      notes: orderForm.notes,
                    });
                    void runGuardedAction(
                      "create-booking",
                      createBookingAction,
                      async () => {
                        const created =
                          await getOpsClient().createCallCenterOrder(command);
                        setOrderForm(INITIAL_ORDER_FORM);
                        setPickupAddress(null);
                        setDropoffAddress(null);
                        setPickupProviderState(INITIAL_ADDRESS_PROVIDER_STATE);
                        setDropoffProviderState(INITIAL_ADDRESS_PROVIDER_STATE);
                        setServiceabilityPreview(null);
                        setServiceabilityPreviewStatus("idle");
                        setOutcomeNotice({
                          tone: "success",
                          message: t("callcenter.notice.phoneBookingCreated", {
                            callId: selectedSession.callId,
                          }),
                          href: `/dispatch/${encodeURIComponent(created.orderId)}`,
                          label: t("callcenter.link.openDispatchWorkspace"),
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
                  </div>
                  <div
                    data-address-map-pair-picker="callcenter-phone-booking-map"
                    data-service-product-type={
                      CALLCENTER_MAP_SERVICE_PRODUCT_TYPE
                    }
                    data-can-evaluate-service-area="true"
                    style={mapBookingSectionStyle}
                  >
                    <div style={mapBookingHeadingStyle}>
                      <strong style={{ fontSize: 12.5 }}>
                        {mapBookingSectionCopy.title}
                      </strong>
                      <span style={subtleTextStyle}>
                        {mapBookingSectionCopy.description}
                      </span>
                    </div>
                    <div style={mapBookingPickerStackStyle}>
                      <div
                        data-address-map-picker="callcenter-pickup-map"
                        data-provider-status={pickupProviderState.reasonCode}
                      >
                        <AddressMapPicker
                          id="callcenter-pickup-map"
                          provider={mapBookingProvider}
                          surface="callcenter"
                          theme={theme}
                          locale={currentLocale === "zh" ? "zh-TW" : "en-US"}
                          labels={callcenterMapPickerLabels}
                          value={pickupAddress}
                          onChange={(change: AddressMapPickerChange) => {
                            setPickupAddress(change.address);
                            setPickupProviderState(change.providerState);
                          }}
                          actorId={callcenterActorId}
                          title={mapBookingSectionCopy.pickupTitle}
                        />
                      </div>
                      <div
                        data-address-map-picker="callcenter-dropoff-map"
                        data-provider-status={dropoffProviderState.reasonCode}
                      >
                        <AddressMapPicker
                          id="callcenter-dropoff-map"
                          provider={mapBookingProvider}
                          surface="callcenter"
                          theme={theme}
                          locale={currentLocale === "zh" ? "zh-TW" : "en-US"}
                          labels={callcenterMapPickerLabels}
                          value={dropoffAddress}
                          onChange={(change: AddressMapPickerChange) => {
                            setDropoffAddress(change.address);
                            setDropoffProviderState(change.providerState);
                          }}
                          actorId={callcenterActorId}
                          title={mapBookingSectionCopy.dropoffTitle}
                        />
                      </div>
                    </div>
                    <div data-callcenter-map-booking-gate={mapBookingGateCode}>
                      <CanvasBanner
                        theme={theme}
                        tone={mapBookingBanner.tone}
                        icon={mapBookingBanner.icon}
                        title={mapBookingBanner.title}
                        body={mapBookingBanner.body}
                      />
                    </div>
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
                  <ActionButton
                    theme={theme}
                    disabled={createBookingDisabled}
                    helper={createBookingHelper}
                    busy={busyKey === "create-booking"}
                    label={getActionLabel(t, "create_phone_booking")}
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
                            message: t("callcenter.notice.orderLinked", {
                              orderId: existingOrderId,
                              callId: selectedSession.callId,
                            }),
                            href: `/dispatch/${encodeURIComponent(existingOrderId)}`,
                            label: t("callcenter.link.openLinkedDispatch"),
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
                    <ActionButton
                      theme={theme}
                      disabled={!linkOrderAction?.enabled}
                      helper={getActionHelper(t, linkOrderAction)}
                      busy={busyKey === "link-order"}
                      label={getActionLabel(t, "link_existing_order")}
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
                            message: t("callcenter.notice.callbackQueued", {
                              callId: selectedSession.callId,
                            }),
                          });
                          await loadData(selectedSession.callId);
                        },
                      );
                    }}
                  >
                    <CanvasField
                      theme={theme}
                      label={t("callcenter.field.callbackDueAt")}
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
                    <ActionButton
                      theme={theme}
                      disabled={!callbackAction?.enabled}
                      helper={getActionHelper(t, callbackAction)}
                      busy={busyKey === "create-callback"}
                      label={getActionLabel(t, "create_callback")}
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
                            message: t("callcenter.notice.callbackCompleted", {
                              callbackId:
                                selectedSession.callbackTask!.callbackTaskId,
                            }),
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
                    <ActionButton
                      theme={theme}
                      disabled={!completeCallbackAction?.enabled}
                      helper={getActionHelper(t, completeCallbackAction)}
                      busy={busyKey === "complete-callback"}
                      label={getActionLabel(t, "complete_callback")}
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
                            message: t("callcenter.notice.complaintCreated", {
                              caseNo: result.complaintCase.caseNo,
                              callId: selectedSession.callId,
                            }),
                            href: `/complaints?caseNo=${encodeURIComponent(result.complaintCase.caseNo)}`,
                            label: t("callcenter.link.openComplaintQueue"),
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
                      label={t("callcenter.field.category")}
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
                      label={t("callcenter.field.severity")}
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
                    <ActionButton
                      theme={theme}
                      disabled={!transferComplaintAction?.enabled}
                      helper={getActionHelper(t, transferComplaintAction)}
                      busy={busyKey === "transfer-complaint"}
                      label={getActionLabel(t, "transfer_to_complaint")}
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
              title={t("callcenter.callbackQueue.title")}
              subtitle={t("callcenter.callbackQueue.subtitle")}
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
                    title={t("callcenter.callbackQueue.empty.title")}
                    body={t("callcenter.callbackQueue.empty.body")}
                  />
                </div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={t("callcenter.recordingQueue.title")}
              subtitle={t("callcenter.recordingQueue.subtitle")}
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
                    title={t("callcenter.recordingQueue.empty.title")}
                    body={t("callcenter.recordingQueue.empty.body")}
                  />
                </div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={t("callcenter.dispatchTrace.title")}
              subtitle={t("callcenter.dispatchTrace.subtitle")}
            >
              {selectedOrder ? (
                <>
                  <CanvasDL
                    theme={theme}
                    items={[
                      {
                        label: t("callcenter.dispatchTrace.field.order"),
                        value: `${selectedOrder.orderNo} · ${selectedOrder.orderId}`,
                      },
                      {
                        label: t("callcenter.dispatchTrace.field.status"),
                        value: formatOpsCodeLabel(
                          currentLocale,
                          selectedOrder.status,
                        ),
                      },
                      {
                        label: t("callcenter.dispatchTrace.field.route"),
                        value: `${selectedOrder.pickup.address} → ${selectedOrder.dropoff.address}`,
                      },
                      {
                        label: t("callcenter.dispatchTrace.field.compliance"),
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
                      {t("callcenter.link.openDispatchDetail")}
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
                      title={t("callcenter.dispatchTrace.empty.title")}
                      body={t("callcenter.dispatchTrace.empty.body")}
                    />
                  )}
                </>
              ) : (
                <CanvasEmptyState
                  theme={theme}
                  tone="neutral"
                  title={t("callcenter.dispatchTrace.noLinkedOrder.title")}
                  body={t("callcenter.dispatchTrace.noLinkedOrder.body")}
                />
              )}
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={t("callcenter.sessionHistory.title")}
              subtitle={t("callcenter.sessionHistory.subtitle")}
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
                    title={t("callcenter.sessionHistory.empty.title")}
                    body={t("callcenter.sessionHistory.empty.body")}
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

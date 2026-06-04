"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  Bot,
  LoaderCircle,
  MessageSquare,
  Minimize2,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { getPlatformAdminClient } from "@/lib/platform-admin-client-factory";
import {
  getRuntimeApiBaseUrl,
  isPlatformAdminAssistantEnabled,
} from "@/lib/runtime-config";
import { useTranslation } from "@/lib/i18n";
import { platformAdminAssistantSuggestedPrompts } from "@/lib/translations";
import { AssistantMessageList } from "./AssistantMessageList";
import {
  buildRouteContext,
  usePlatformAdminAssistantRouteContext,
} from "./route-context";
import type {
  AssistantActionPlan,
  AssistantFormSummary,
  AssistantMessageRecord,
  AssistantPageActionSummary,
  AssistantReceipt,
  AssistantRouteContext,
  AssistantStepStatus,
  AssistantTableSummary,
  AssistantEntityRef,
} from "./assistant-types";

const PANEL_WIDTH = 430;
const PANEL_HEIGHT = 620;
const MOBILE_BREAKPOINT = 768;
const DESKTOP_MARGIN = 24;
const MOBILE_MARGIN = 12;
const STORAGE_KEY = "drts-platform-admin-assistant-position-v1";

type Position = {
  x: number;
  y: number;
};

type AssistantApiSession = {
  sessionId: string;
  title: string;
};

type AssistantApiCitation = {
  title: string;
  section?: string;
  href?: string;
};

type AssistantApiPlanStep = {
  stepId: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
};

type AssistantApiActionPlan = {
  planId: string;
  title: string;
  summary: string;
  steps: AssistantApiPlanStep[];
};

type AssistantApiMessageResponse = {
  answer: string;
  citations: AssistantApiCitation[];
  suggestedPrompts: string[];
  actionPlan: AssistantApiActionPlan | null;
  governedAction: AssistantApiGovernedAction | null;
};

type AssistantApiActionDescriptor = {
  action: string;
  enabled: boolean;
  disabledReasonCode?: string;
  requiresReason?: boolean;
  riskLevel: "low" | "medium" | "high";
};

type AssistantApiGovernedAction = {
  toolName: string;
  payload: Record<string, unknown>;
  descriptor: AssistantApiActionDescriptor;
  confirmationRequired: boolean;
  title: string;
  message: string;
  resourceLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonHint?: string;
  disabledReason?: string | null;
};

type AssistantApiActionExecutionResponse = {
  receipt: {
    actionId: string;
    auditId: string;
    resourceType: string;
    resourceId: string;
    status: AssistantReceipt["status"];
    message: string;
  };
  assistantAuditId: string;
};

function nextMessageId(prefix = "paas-ui") {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampPosition(position: Position): Position {
  if (typeof window === "undefined") {
    return position;
  }

  const maxX = Math.max(
    DESKTOP_MARGIN,
    window.innerWidth - PANEL_WIDTH - DESKTOP_MARGIN,
  );
  const maxY = Math.max(
    DESKTOP_MARGIN,
    window.innerHeight - PANEL_HEIGHT - DESKTOP_MARGIN,
  );

  return {
    x: Math.min(Math.max(position.x, DESKTOP_MARGIN), maxX),
    y: Math.min(Math.max(position.y, DESKTOP_MARGIN), maxY),
  };
}

function getDefaultDesktopPosition(): Position {
  if (typeof window === "undefined") {
    return { x: DESKTOP_MARGIN, y: DESKTOP_MARGIN };
  }

  return clampPosition({
    x: window.innerWidth - PANEL_WIDTH - DESKTOP_MARGIN,
    y: window.innerHeight - PANEL_HEIGHT - DESKTOP_MARGIN,
  });
}

function readStoredPosition(): Position | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Position>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
      return null;
    }
    return clampPosition({ x: parsed.x, y: parsed.y });
  } catch {
    return null;
  }
}

function persistPosition(position: Position) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
}

function normalizeStepStatus(status: string): AssistantStepStatus {
  if (
    status === "pending" ||
    status === "in_progress" ||
    status === "completed" ||
    status === "blocked"
  ) {
    return status;
  }

  return "pending";
}

function mapActionPlan(
  plan: AssistantApiActionPlan | null,
): AssistantActionPlan | null {
  if (!plan) {
    return null;
  }

  return {
    title: plan.title,
    summary: plan.summary,
    riskLevel: "low",
    steps: plan.steps.map((step) => ({
      id: step.stepId,
      title: step.title,
      status: normalizeStepStatus(step.status),
    })),
  };
}

function formatCitation(citation: AssistantApiCitation) {
  return [citation.title, citation.section].filter(Boolean).join(" ");
}

function formatAssistantContent(
  response: AssistantApiMessageResponse,
  copy: {
    sourcesHeading: string;
    suggestedHeading: string;
  },
) {
  const citations = response.citations.map(formatCitation);
  const suggestedPrompts = response.suggestedPrompts.slice(0, 3);
  const sections = [response.answer.trim()];

  if (citations.length > 0) {
    sections.push(
      `${copy.sourcesHeading}\n${citations.map((item) => `- ${item}`).join("\n")}`,
    );
  }

  if (suggestedPrompts.length > 0) {
    sections.push(
      `${copy.suggestedHeading}\n${suggestedPrompts
        .map((item) => `- ${item}`)
        .join("\n")}`,
    );
  }

  return sections.join("\n\n");
}

function mapReceipt(
  response: AssistantApiActionExecutionResponse,
  receiptTitle: string,
): AssistantReceipt {
  return {
    title: receiptTitle,
    message: response.receipt.message,
    actionId: response.receipt.actionId,
    requestId: response.receipt.actionId,
    auditId: response.receipt.auditId,
    resourceType: response.receipt.resourceType,
    resourceId: response.receipt.resourceId,
    resourceLabel: [response.receipt.resourceType, response.receipt.resourceId]
      .filter(Boolean)
      .join(" · "),
    status: response.receipt.status,
  };
}

function buildContextPrompt(
  message: string,
  routeContext: AssistantRouteContext,
  pageContext: {
    visibleTables?: AssistantTableSummary[];
    selectedRecords?: AssistantEntityRef[];
    availableActions?: AssistantPageActionSummary[];
    forms?: AssistantFormSummary[];
  },
  locale: "zh" | "en",
  copy: {
    routeHeading: string;
    pageHeading: string;
    questionHeading: string;
    none: string;
    emptyList: string;
    empty: string;
    required: string;
    dirty: string;
    yes: string;
    no: string;
  },
) {
  const routeTitle = routeContext.title[locale];
  const warnings =
    routeContext.warnings.length > 0
      ? routeContext.warnings
          .map((warning) => `${warning.code}: ${warning.message[locale]}`)
          .join("; ")
      : copy.none;
  const entityRefs =
    routeContext.visibleEntityRefs.length > 0
      ? routeContext.visibleEntityRefs
          .map((entity) => `${entity.kind}:${entity.id}`)
          .join(", ")
      : copy.none;
  const visibleTables =
    pageContext.visibleTables && pageContext.visibleTables.length > 0
      ? pageContext.visibleTables
          .map((table) => {
            const selectedRows =
              table.selectedRowIds && table.selectedRowIds.length > 0
                ? ` selected=${table.selectedRowIds.join(", ")}`
                : "";
            const actions =
              table.availableActions && table.availableActions.length > 0
                ? ` actions=${table.availableActions
                    .map((action) => action.actionId)
                    .join(", ")}`
                : "";
            return `- ${table.tableId} (${table.title}): rows=${table.visibleRowCount}; visible=${table.visibleRowIds.join(", ") || copy.none}${selectedRows}${actions}`;
          })
          .join("\n")
      : copy.emptyList;
  const selectedRecords =
    pageContext.selectedRecords && pageContext.selectedRecords.length > 0
      ? pageContext.selectedRecords
          .map((record) => `${record.kind}:${record.id}`)
          .join(", ")
      : copy.none;
  const availableActions =
    pageContext.availableActions && pageContext.availableActions.length > 0
      ? pageContext.availableActions
          .map(
            (action) =>
              `${action.actionId}${action.riskLevel ? `(${action.riskLevel})` : ""}${action.disabled ? "[disabled]" : ""}`,
          )
          .join(", ")
      : copy.none;
  const forms =
    pageContext.forms && pageContext.forms.length > 0
      ? pageContext.forms
          .map((form) => {
            const fields =
              form.fields.length > 0
                ? form.fields
                    .map((field) => {
                      const parts = [
                        field.fieldId,
                        field.valueSummary === null ||
                        typeof field.valueSummary === "undefined"
                          ? copy.empty
                          : JSON.stringify(field.valueSummary),
                      ];
                      if (field.required) {
                        parts.push(copy.required);
                      }
                      if (field.dirty) {
                        parts.push(copy.dirty);
                      }
                      return parts.join("=");
                    })
                    .join("; ")
                : copy.none;
            const validationErrors =
              form.validationErrors.length > 0
                ? form.validationErrors
                    .map((error) =>
                      error.fieldId
                        ? `${error.fieldId}:${error.code}:${error.message}`
                        : `${error.code}:${error.message}`,
                    )
                    .join("; ")
                : copy.none;
            const actions =
              form.availableActions && form.availableActions.length > 0
                ? form.availableActions
                    .map((action) => action.actionId)
                    .join(", ")
                : copy.none;
            return `- ${form.formId} (${form.title}): dirty=${form.dirty ? copy.yes : copy.no}; fields=${fields}; validationErrors=${validationErrors}; actions=${actions}`;
          })
          .join("\n")
      : copy.emptyList;

  return [
    copy.routeHeading,
    `Path: ${routeContext.pathname}`,
    `Page: ${routeTitle}`,
    `Active tab: ${routeContext.activeTab ?? copy.none}`,
    `Refresh tier: ${routeContext.refreshTier}`,
    `Visible entities: ${entityRefs}`,
    `Warnings: ${warnings}`,
    "",
    copy.pageHeading,
    `Visible tables:\n${visibleTables}`,
    `Selected records: ${selectedRecords}`,
    `Available actions: ${availableActions}`,
    `Forms:\n${forms}`,
    "",
    copy.questionHeading,
    message,
  ].join("\n");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function PlatformAssistantOverlay() {
  const enabled = isPlatformAdminAssistantEnabled();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const { locale, t } = useTranslation();
  const { pageBridge } = usePlatformAdminAssistantRouteContext();
  const titleId = useId();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [position, setPosition] = useState<Position>({
    x: DESKTOP_MARGIN,
    y: DESKTOP_MARGIN,
  });
  const [session, setSession] = useState<AssistantApiSession | null>(null);
  const [messages, setMessages] = useState<AssistantMessageRecord[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const defaultSuggestedPrompts =
    platformAdminAssistantSuggestedPrompts[locale];
  const copy = {
    sourcesHeading: t("assistantOverlay.sourcesHeading"),
    suggestedHeading: t("assistantOverlay.suggestedHeading"),
    receiptTitle: t("assistantOverlay.receiptTitle"),
    routeHeading: t("assistantOverlay.context.routeHeading"),
    pageHeading: t("assistantOverlay.context.pageHeading"),
    questionHeading: t("assistantOverlay.context.questionHeading"),
    none: t("assistantOverlay.context.none"),
    emptyList: t("assistantOverlay.context.emptyList"),
    empty: t("assistantOverlay.context.empty"),
    required: t("assistantOverlay.context.required"),
    dirty: t("assistantOverlay.context.dirty"),
    yes: t("assistantOverlay.context.yes"),
    no: t("assistantOverlay.context.no"),
    launcher: t("assistantOverlay.launcher"),
    badge: t("assistantOverlay.badge"),
    label: t("assistantOverlay.label"),
    subtitle: t("assistantOverlay.subtitle"),
    heading: t("assistantOverlay.heading"),
    status: t("assistantOverlay.status"),
    inputLabel: t("assistantOverlay.inputLabel"),
    inputPlaceholder: t("assistantOverlay.inputPlaceholder"),
    send: t("assistantOverlay.send"),
    sending: t("assistantOverlay.sending"),
    newSession: t("assistantOverlay.newSession"),
    minimize: t("assistantOverlay.minimize"),
    close: t("assistantOverlay.close"),
    reset: t("assistantOverlay.reset"),
    emptyTitle: t("assistantOverlay.emptyTitle"),
    emptyBody: t("assistantOverlay.emptyBody"),
    thinking: t("assistantOverlay.thinking"),
    sessionTitle: t("assistantOverlay.sessionTitle"),
    requestFailedTitle: t("assistantOverlay.requestFailedTitle"),
    requestFailedBody: t("assistantOverlay.requestFailedBody"),
    requestFailedHint: t("assistantOverlay.requestFailedHint"),
    actionFailedTitle: t("assistantOverlay.actionFailedTitle"),
    actionFailedHint: t("assistantOverlay.actionFailedHint"),
    suggestedPromptsAria: t("assistantOverlay.suggestedPromptsAria"),
    footnote: t("assistantOverlay.footnote"),
  };
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([
    ...defaultSuggestedPrompts,
  ]);
  const dragRef = useRef<{
    pointerId: number;
    startPointerX: number;
    startPointerY: number;
    startX: number;
    startY: number;
  } | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const syncViewportMode = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      const nextPosition = mobile
        ? readStoredPosition() || getDefaultDesktopPosition()
        : clampPosition(readStoredPosition() || getDefaultDesktopPosition());
      setPosition(nextPosition);
    };

    syncViewportMode();
    setIsMounted(true);
    window.addEventListener("resize", syncViewportMode);
    return () => window.removeEventListener("resize", syncViewportMode);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isMounted || isMobile) {
      return;
    }

    const clamped = clampPosition(position);
    if (clamped.x !== position.x || clamped.y !== position.y) {
      setPosition(clamped);
      return;
    }

    persistPosition(clamped);
  }, [enabled, isMounted, isMobile, position]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [isOpen, messages]);

  useEffect(() => {
    if (messages.length === 0) {
      setSuggestedPrompts([...defaultSuggestedPrompts]);
    }
  }, [defaultSuggestedPrompts, messages.length]);

  if (!enabled || !isMounted) {
    return null;
  }

  const panelStyle: CSSProperties = isMobile
    ? {
        position: "fixed",
        left: MOBILE_MARGIN,
        right: MOBILE_MARGIN,
        bottom: MOBILE_MARGIN,
        maxHeight: "min(78vh, 640px)",
        width: "auto",
        borderRadius: 20,
      }
    : {
        position: "fixed",
        left: position.x,
        top: position.y,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        borderRadius: 20,
      };

  function client() {
    return getPlatformAdminClient(getRuntimeApiBaseUrl());
  }

  async function ensureSession() {
    if (session) {
      return session;
    }

    const created = await client().post<AssistantApiSession>(
      "/api/platform-admin/assistant/sessions",
      {
        body: { title: copy.sessionTitle },
      },
    );
    setSession(created);
    return created;
  }

  async function submitPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || isSending) {
      return;
    }

    const userMessage: AssistantMessageRecord = {
      id: nextMessageId("paas-user"),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
      state: "idle",
    };
    const thinkingId = nextMessageId("paas-thinking");
    const thinkingMessage: AssistantMessageRecord = {
      id: thinkingId,
      role: "assistant",
      content: copy.thinking,
      createdAt: new Date().toISOString(),
      state: "thinking",
    };

    setDraft("");
    setIsSending(true);
    setMessages((current) => [...current, userMessage, thinkingMessage]);

    try {
      const activeSession = await ensureSession();
      const pageContext = pageBridge?.contextSnapshot;
      const routeContext = buildRouteContext(
        pathname,
        searchParams?.toString() ?? "",
        pageContext,
      );
      const response = await client().post<AssistantApiMessageResponse>(
        `/api/platform-admin/assistant/sessions/${encodeURIComponent(
          activeSession.sessionId,
        )}/messages`,
        {
          body: {
            message: buildContextPrompt(
              trimmed,
              routeContext,
              pageContext ?? {},
              locale,
              copy,
            ),
          },
        },
      );
      const plan = mapActionPlan(response.actionPlan);
      const governedAction = response.governedAction;
      const assistantMessage: AssistantMessageRecord = {
        id: nextMessageId("paas-assistant"),
        role: "assistant",
        content: formatAssistantContent(response, copy),
        createdAt: new Date().toISOString(),
        state: governedAction
          ? "awaiting_confirmation"
          : plan
            ? "planning"
            : "idle",
        plan,
        pendingAction: governedAction
          ? {
              toolName: governedAction.toolName,
              payload: governedAction.payload,
            }
          : null,
        confirmation: governedAction
          ? {
              title: governedAction.title,
              message: governedAction.message,
              riskLevel: governedAction.descriptor.riskLevel,
              resourceLabel: governedAction.resourceLabel ?? null,
              ...(governedAction.confirmLabel !== undefined
                ? { confirmLabel: governedAction.confirmLabel }
                : {}),
              ...(governedAction.cancelLabel !== undefined
                ? { cancelLabel: governedAction.cancelLabel }
                : {}),
              ...(governedAction.reasonLabel !== undefined
                ? { reasonLabel: governedAction.reasonLabel }
                : {}),
              ...(governedAction.reasonPlaceholder !== undefined
                ? { reasonPlaceholder: governedAction.reasonPlaceholder }
                : {}),
              reasonHint: governedAction.reasonHint ?? null,
              requiresReason:
                governedAction.descriptor.requiresReason ??
                governedAction.descriptor.riskLevel === "high",
              disabled: !governedAction.descriptor.enabled,
              disabledReason: governedAction.disabledReason ?? null,
            }
          : null,
      };

      setSuggestedPrompts(
        response.suggestedPrompts.length > 0
          ? response.suggestedPrompts.slice(0, 3)
          : [...defaultSuggestedPrompts],
      );
      setMessages((current) =>
        current.map((message) =>
          message.id === thinkingId ? assistantMessage : message,
        ),
      );
    } catch (error) {
      const failedMessage: AssistantMessageRecord = {
        id: nextMessageId("paas-error"),
        role: "assistant",
        content: copy.requestFailedBody,
        createdAt: new Date().toISOString(),
        state: "error",
        error: {
          title: copy.requestFailedTitle,
          message: errorMessage(error),
          hint: copy.requestFailedHint,
        },
      };
      setMessages((current) =>
        current.map((message) =>
          message.id === thinkingId ? failedMessage : message,
        ),
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitPrompt(draft);
  }

  async function handleConfirmAction(messageId: string, reason: string) {
    const message = messages.find((entry) => entry.id === messageId);
    if (!message?.pendingAction || !session) {
      return;
    }

    setIsConfirming(true);
    setMessages((current) =>
      current.map((entry) =>
        entry.id === messageId
          ? {
              ...entry,
              state: "executing",
              error: null,
            }
          : entry,
      ),
    );

    try {
      const response = await client().post<AssistantApiActionExecutionResponse>(
        `/api/platform-admin/assistant/sessions/${encodeURIComponent(
          session.sessionId,
        )}/actions/execute`,
        {
          body: {
            toolName: message.pendingAction.toolName,
            payload: message.pendingAction.payload,
            reason,
          },
        },
      );

      setMessages((current) =>
        current.map((entry) =>
          entry.id === messageId
            ? {
                ...entry,
                state: "receipt",
                confirmation: null,
                pendingAction: null,
                receipt: mapReceipt(response, copy.receiptTitle),
              }
            : entry,
        ),
      );
    } catch (error) {
      setMessages((current) =>
        current.map((entry) =>
          entry.id === messageId
            ? {
                ...entry,
                state: "error",
                error: {
                  title: copy.actionFailedTitle,
                  message: errorMessage(error),
                  hint: copy.actionFailedHint,
                },
              }
            : entry,
        ),
      );
    } finally {
      setIsConfirming(false);
    }
  }

  function handleCancelConfirmation(messageId: string) {
    setMessages((current) =>
      current.map((entry) =>
        entry.id === messageId
          ? {
              ...entry,
              state: "idle",
              confirmation: null,
              pendingAction: null,
            }
          : entry,
      ),
    );
  }

  function handleResetPosition() {
    const nextPosition = getDefaultDesktopPosition();
    setPosition(nextPosition);
    persistPosition(nextPosition);
  }

  function handleNewSession() {
    setSession(null);
    setMessages([]);
    setDraft("");
    setIsConfirming(false);
    setSuggestedPrompts([...defaultSuggestedPrompts]);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (isMobile) {
      return;
    }

    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button, textarea, input, a")
    ) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: position.x,
      startY: position.y,
    };

    const dragTarget = event.currentTarget;
    dragTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragRef.current.startPointerX;
    const deltaY = event.clientY - dragRef.current.startPointerY;
    setPosition(
      clampPosition({
        x: dragRef.current.startX + deltaX,
        y: dragRef.current.startY + deltaY,
      }),
    );
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <>
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={copy.launcher}
          data-testid="platform-assistant-launcher"
          style={launcherStyle}
        >
          <div style={launcherIconWrapStyle}>
            <Sparkles size={18} />
          </div>
          <div style={launcherTextWrapStyle}>
            <span style={launcherLabelStyle}>{copy.label}</span>
            <span style={launcherSubLabelStyle}>{copy.subtitle}</span>
          </div>
        </button>
      ) : null}
      {isOpen ? (
        <section
          aria-labelledby={titleId}
          data-testid="platform-assistant-panel"
          style={{ ...panelBaseStyle, ...panelStyle }}
        >
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            data-testid="platform-assistant-drag-handle"
            style={{
              ...panelHeaderStyle,
              cursor: isMobile ? "default" : "grab",
              touchAction: isMobile ? "auto" : "none",
            }}
          >
            <div style={headingWrapStyle}>
              <div style={assistantMarkStyle}>
                <MessageSquare size={16} />
              </div>
              <div>
                <div id={titleId} style={panelTitleStyle}>
                  {copy.heading}
                </div>
                <div style={panelStatusStyle}>
                  <span style={panelBadgeStyle}>{copy.badge}</span>
                  <span>{copy.status}</span>
                </div>
              </div>
            </div>
            <div style={headerActionsStyle}>
              <button
                type="button"
                onClick={handleNewSession}
                aria-label={copy.newSession}
                title={copy.newSession}
                style={iconButtonStyle}
              >
                <Plus size={15} />
              </button>
              {!isMobile ? (
                <button
                  type="button"
                  onClick={handleResetPosition}
                  aria-label={copy.reset}
                  title={copy.reset}
                  style={iconButtonStyle}
                >
                  <RotateCcw size={15} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label={copy.minimize}
                title={copy.minimize}
                style={iconButtonStyle}
              >
                <Minimize2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label={copy.close}
                title={copy.close}
                style={iconButtonStyle}
              >
                <X size={15} />
              </button>
            </div>
          </div>
          <div style={panelBodyStyle}>
            <AssistantMessageList
              messages={messages}
              isConfirming={isConfirming}
              onConfirmAction={(messageId, reason) =>
                handleConfirmAction(messageId, reason)
              }
              onCancelConfirmation={handleCancelConfirmation}
              emptyTitle={copy.emptyTitle}
              emptyBody={copy.emptyBody}
            />
            <div ref={messagesEndRef} />
          </div>
          <div style={promptRailStyle} aria-label={copy.suggestedPromptsAria}>
            {suggestedPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void submitPrompt(prompt)}
                disabled={isSending}
                style={promptChipStyle}
              >
                {prompt}
              </button>
            ))}
          </div>
          <form onSubmit={handleSubmit} style={composerStyle}>
            <textarea
              aria-label={copy.inputLabel}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void submitPrompt(draft);
                }
              }}
              placeholder={copy.inputPlaceholder}
              rows={3}
              disabled={isSending}
              style={composerTextAreaStyle}
            />
            <button
              type="submit"
              data-testid="platform-assistant-send"
              disabled={isSending || draft.trim().length === 0}
              style={{
                ...sendButtonStyle,
                opacity: isSending || draft.trim().length === 0 ? 0.55 : 1,
              }}
            >
              {isSending ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Send size={15} />
              )}
              {isSending ? copy.sending : copy.send}
            </button>
          </form>
          <div style={panelFootnoteStyle}>
            <Bot size={13} />
            <span>{copy.footnote}</span>
          </div>
        </section>
      ) : null}
    </>
  );
}

const launcherStyle: CSSProperties = {
  position: "fixed",
  right: 24,
  bottom: 24,
  zIndex: 60,
  display: "flex",
  alignItems: "center",
  gap: 12,
  minHeight: 60,
  padding: "12px 16px 12px 12px",
  borderRadius: 999,
  border: "1px solid rgba(148, 163, 184, 0.32)",
  background:
    "linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(79, 70, 229, 0.92))",
  color: "#FFFFFF",
  boxShadow: "0 20px 50px rgba(15, 23, 42, 0.28)",
  cursor: "pointer",
};

const launcherIconWrapStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 36,
  height: 36,
  borderRadius: 18,
  background: "rgba(255, 255, 255, 0.16)",
};

const launcherTextWrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
};

const launcherLabelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.1,
};

const launcherSubLabelStyle: CSSProperties = {
  fontSize: 11,
  opacity: 0.8,
  lineHeight: 1.1,
};

const panelBaseStyle: CSSProperties = {
  zIndex: 70,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: "rgba(255, 255, 255, 0.98)",
  border: "1px solid rgba(203, 213, 225, 0.9)",
  boxShadow: "0 24px 70px rgba(15, 23, 42, 0.22)",
  backdropFilter: "blur(18px)",
};

const panelHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  padding: "16px 16px 12px",
  borderBottom: "1px solid rgba(226, 232, 240, 0.9)",
  background:
    "linear-gradient(180deg, rgba(238, 242, 255, 0.92), rgba(255, 255, 255, 0.98))",
};

const headingWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  minWidth: 0,
};

const assistantMarkStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 34,
  height: 34,
  borderRadius: 12,
  color: "#FFFFFF",
  background: "linear-gradient(135deg, #4F46E5, #0F172A)",
  flexShrink: 0,
};

const panelTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#0F172A",
  lineHeight: 1.2,
};

const panelStatusStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 6,
  fontSize: 11,
  color: "#475569",
  lineHeight: 1.4,
};

const panelBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 999,
  background: "#E0E7FF",
  color: "#4338CA",
  fontWeight: 800,
};

const headerActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexShrink: 0,
};

const iconButtonStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 32,
  height: 32,
  borderRadius: 10,
  border: "1px solid rgba(203, 213, 225, 0.82)",
  background: "rgba(255, 255, 255, 0.72)",
  color: "#0F172A",
  cursor: "pointer",
};

const panelBodyStyle: CSSProperties = {
  flex: 1,
  overflow: "auto",
  padding: 16,
  background:
    "linear-gradient(180deg, rgba(248, 250, 252, 0.55), rgba(255, 255, 255, 0.98))",
};

const promptRailStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  padding: "10px 14px",
  borderTop: "1px solid rgba(226, 232, 240, 0.92)",
  background: "rgba(248, 250, 252, 0.92)",
};

const promptChipStyle: CSSProperties = {
  flex: "0 0 auto",
  maxWidth: 260,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  border: "1px solid rgba(199, 210, 254, 0.98)",
  borderRadius: 999,
  background: "#EEF2FF",
  color: "#3730A3",
  padding: "8px 11px",
  fontSize: 11.5,
  fontWeight: 700,
  cursor: "pointer",
};

const composerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 10,
  alignItems: "end",
  padding: 14,
  borderTop: "1px solid rgba(226, 232, 240, 0.92)",
  background: "#FFFFFF",
};

const composerTextAreaStyle: CSSProperties = {
  width: "100%",
  resize: "none",
  borderRadius: 14,
  border: "1px solid rgba(203, 213, 225, 0.95)",
  padding: "10px 12px",
  color: "#0F172A",
  background: "#FFFFFF",
  fontSize: 13,
  lineHeight: 1.45,
  fontFamily:
    '"Inter", "Noto Sans TC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  boxSizing: "border-box",
};

const sendButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minWidth: 92,
  minHeight: 42,
  borderRadius: 14,
  border: "1px solid #4F46E5",
  background: "#4F46E5",
  color: "#FFFFFF",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const panelFootnoteStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 14px 12px",
  color: "#64748B",
  background: "#FFFFFF",
  fontSize: 11.5,
  lineHeight: 1.35,
};

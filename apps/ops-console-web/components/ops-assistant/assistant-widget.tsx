"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionIntent, ResourceActionDescriptor } from "@drts/contracts";
import { buildCanvasTheme, CanvasIcon } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import {
  useOpsAssistantActionBridge,
  useOpsAssistantContext,
} from "./assistant-context-provider";
import {
  buildAssistantActions,
  resolveAssistantActionHref,
  type AssistantAction,
} from "./assistant-actions";
import { buildTier0HelpResult, buildTier1ScopedResult } from "./help-search";
import type { AssistantActionReceipt } from "./context-envelope";

type DockSide = "free" | "left" | "right";

type WidgetState = {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  closed: boolean;
  docked: DockSide;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type StreamState = {
  activeIndex: number;
  visibleChars: number;
};

type ConversationEntry = {
  id: string;
  author: "assistant" | "operator" | "system";
  tone: "neutral" | "accent" | "success" | "danger";
  message: string;
  meta?: string;
  auditHref?: string | null;
};

const STORAGE_KEY = "ops-console.assistant-widget.v1";
const WIDGET_MIN_WIDTH = 320;
const WIDGET_MIN_HEIGHT = 240;
const WIDGET_MAX_WIDTH = 560;
const WIDGET_MAX_HEIGHT = 720;
const HEADER_HEIGHT = 48;
const MINIMIZED_HEIGHT = 64;
const EDGE_GAP = 20;
const MOVE_STEP = 24;
const RESIZE_STEP = 24;
const STREAM_TICK_MS = 42;
const STREAM_PAUSE_MS = 1500;
const FORCE_DEGRADED_KEY = "ops-console.assistant.force-degraded";
const FORCE_DISABLED_KEY = "ops-console.assistant.force-disabled";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

function copy(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function contextLabel(locale: "en" | "zh", key: string): string {
  const labels: Record<string, { en: string; zh: string }> = {
    "/revenue": { en: "Revenue", zh: "收益" },
    revenue: { en: "Revenue", zh: "收益" },
    "/drivers": { en: "Drivers", zh: "司機" },
    drivers: { en: "Drivers", zh: "司機" },
    "/vehicles": { en: "Vehicles", zh: "車輛" },
    vehicles: { en: "Vehicles", zh: "車輛" },
    "/contracts": { en: "Contracts", zh: "合約" },
    contracts: { en: "Contracts", zh: "合約" },
    all: { en: "All", zh: "全部" },
    available: { en: "Available", zh: "可派遣" },
    on_trip: { en: "On trip", zh: "行程中" },
    offline: { en: "Offline", zh: "離線" },
    license_warn: { en: "License warning", zh: "駕照警示" },
    suppression: { en: "Suppression", zh: "停派" },
    dispatchable: { en: "Dispatchable", zh: "可派遣" },
    offboarding: { en: "Offboarding", zh: "退場中" },
    expiring: { en: "Expiring soon", zh: "即將到期" },
    partner: { en: "Partner", zh: "合作夥伴" },
    insight: { en: "Insight", zh: "洞察" },
    channel: { en: "Channel mix", zh: "通道組成" },
    matrix: { en: "Settlement matrix", zh: "結算矩陣" },
    mismatch: { en: "Mismatch review", zh: "差異複核" },
    today: { en: "Today", zh: "今日" },
    yesterday: { en: "Yesterday", zh: "昨日" },
    "7d": { en: "Last 7 days", zh: "近 7 天" },
    "30d": { en: "Last 30 days", zh: "近 30 天" },
    yes: { en: "Yes", zh: "是" },
    no: { en: "No", zh: "否" },
    q: { en: "Search", zh: "搜尋" },
    period: { en: "Period", zh: "期別" },
    serviceBucket: { en: "Service", zh: "服務" },
    vehicleId: { en: "Vehicle", zh: "車輛" },
    shift: { en: "Shift", zh: "班次" },
    platform: { en: "Platform", zh: "平台" },
    eligibility: { en: "Eligibility", zh: "派遣資格" },
    status: { en: "Status", zh: "狀態" },
    type: { en: "Type", zh: "類型" },
    overdue: { en: "Maintenance overdue", zh: "保修逾期" },
  };

  const label = labels[key];
  if (label) {
    return label[locale];
  }

  return formatOpsCodeLabel(locale, key);
}

function formatContextRoute(locale: "en" | "zh", route?: string): string {
  if (!route) {
    return "—";
  }

  const pathname = route.split("?")[0] || route;
  return contextLabel(locale, pathname);
}

function formatContextValue(
  locale: "en" | "zh",
  value: string | string[] | undefined,
): string {
  if (value === undefined) {
    return "—";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => formatContextValue(locale, entry)).join("、");
  }
  if (!value) {
    return "—";
  }
  return contextLabel(locale, value);
}

function formatVisibleFilters(
  locale: "en" | "zh",
  filters?: Record<string, string | string[]>,
): string {
  if (!filters || Object.keys(filters).length === 0) {
    return "—";
  }

  return Object.entries(filters)
    .map(
      ([key, value]) =>
        `${contextLabel(locale, key)}：${formatContextValue(locale, value)}`,
    )
    .join("；");
}

function getStreamMessages(locale: "en" | "zh") {
  return [
    copy(
      locale,
      "Assistant shell online. Monitoring dispatch exceptions, handoff notes, and queue pressure.",
      "助理浮動面板已上線，正持續監看派遣異常、移交備註與佇列壓力。",
    ),
    copy(
      locale,
      "Mock stream active. Replace this source with the real assistant transport when the API contract lands.",
      "模擬串流運作中。待助理介面契約落地後，請改接真實的助理傳輸來源。",
    ),
    copy(
      locale,
      "Widget state persists locally so operators keep position, dock choice, and density across route changes.",
      "元件狀態會保存在本機，方便操作員跨頁維持位置、停靠方式與密度設定。",
    ),
  ];
}

function getViewportRect() {
  if (typeof window === "undefined") {
    return { width: 1280, height: 720 };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function buildDefaultState(viewport = getViewportRect()): WidgetState {
  const width = 420;
  const height = 360;
  return {
    width,
    height,
    x: Math.max(EDGE_GAP, viewport.width - width - EDGE_GAP),
    y: Math.max(72, viewport.height - height - EDGE_GAP),
    minimized: false,
    closed: false,
    docked: "right",
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampRect(rect: Rect, viewport = getViewportRect()): Rect {
  const width = clamp(
    rect.width,
    WIDGET_MIN_WIDTH,
    Math.min(WIDGET_MAX_WIDTH, viewport.width - EDGE_GAP * 2),
  );
  const height = clamp(
    rect.height,
    WIDGET_MIN_HEIGHT,
    Math.min(WIDGET_MAX_HEIGHT, viewport.height - EDGE_GAP * 2),
  );
  const maxX = Math.max(EDGE_GAP, viewport.width - width - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, viewport.height - height - EDGE_GAP);

  return {
    x: clamp(rect.x, EDGE_GAP, maxX),
    y: clamp(rect.y, EDGE_GAP, maxY),
    width,
    height,
  };
}

function resolveDockedPosition(
  docked: DockSide,
  rect: Rect,
  viewport = getViewportRect(),
): Rect {
  const next = clampRect(rect, viewport);
  if (docked === "left") {
    return { ...next, x: EDGE_GAP };
  }
  if (docked === "right") {
    return {
      ...next,
      x: Math.max(EDGE_GAP, viewport.width - next.width - EDGE_GAP),
    };
  }
  return next;
}

function readStoredState(): WidgetState | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<WidgetState>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return null;
    }
    return {
      x: parsed.x,
      y: parsed.y,
      width: parsed.width,
      height: parsed.height,
      minimized: parsed.minimized ?? false,
      closed: parsed.closed ?? false,
      docked:
        parsed.docked === "left" || parsed.docked === "right"
          ? parsed.docked
          : "free",
    };
  } catch {
    return null;
  }
}

function writeStoredState(state: WidgetState) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isAssistantEnabled() {
  if (process.env.NEXT_PUBLIC_OPS_ASSISTANT_ENABLED === "false") {
    return false;
  }
  if (typeof window === "undefined") {
    return true;
  }
  return window.localStorage.getItem(FORCE_DISABLED_KEY) !== "true";
}

function isForcedDegraded() {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_OPS_ASSISTANT_DEGRADED === "true";
  }
  return (
    process.env.NEXT_PUBLIC_OPS_ASSISTANT_DEGRADED === "true" ||
    window.localStorage.getItem(FORCE_DEGRADED_KEY) === "true"
  );
}

function ActionButton({
  label,
  icon,
  pressed,
  onClick,
}: {
  label: string;
  icon: "minus" | "pin" | "chevR" | "arrow" | "x";
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        border: `1px solid ${pressed ? theme.accentBorder : theme.border}`,
        background: pressed ? theme.accentBg : theme.surfaceLo,
        color: pressed ? theme.accentHi : theme.textMuted,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        cursor: "pointer",
      }}
    >
      <CanvasIcon
        name={icon === "minus" ? "more" : icon}
        size={14}
        style={{ transform: icon === "minus" ? "rotate(90deg)" : undefined }}
      />
    </button>
  );
}

export function OpsAssistantWidget() {
  if (!isAssistantEnabled()) {
    return null;
  }

  const router = useRouter();
  const context = useOpsAssistantContext();
  const actionBridge = useOpsAssistantActionBridge();
  const locale = context?.locale ?? "en";
  const titleId = useId();
  const instructionsId = useId();
  const liveRegionId = useId();
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    rect: Rect;
  } | null>(null);
  const resizeStateRef = useRef<{
    startX: number;
    startY: number;
    rect: Rect;
  } | null>(null);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [widget, setWidget] = useState<WidgetState>(() => buildDefaultState());
  const [stream, setStream] = useState<StreamState>({
    activeIndex: 0,
    visibleChars: 0,
  });
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [pendingIntent, setPendingIntent] = useState<ActionIntent | null>(null);
  const [isProposing, setIsProposing] = useState(false);
  const [isExecutingIntent, setIsExecutingIntent] = useState(false);
  const [draft, setDraft] = useState("");
  const actions = useMemo(() => buildAssistantActions(context), [context]);
  const streamMessages = useMemo(() => getStreamMessages(locale), [locale]);

  const activeMessage = streamMessages[stream.activeIndex] ?? "";

  const appendConversation = useEffectEvent((entry: ConversationEntry) => {
    setConversation((current) => [...current.slice(-9), entry]);
  });

  useEffect(() => {
    const node = document.createElement("div");
    node.setAttribute("data-ops-assistant-root", "true");
    document.body.appendChild(node);
    setPortalNode(node);

    const stored = readStoredState();
    const nextState = stored ?? buildDefaultState();
    const dockedRect = resolveDockedPosition(nextState.docked, nextState);
    setWidget({
      ...nextState,
      ...dockedRect,
    });

    return () => {
      document.body.removeChild(node);
    };
  }, []);

  useEffect(() => {
    if (!portalNode) {
      return;
    }
    writeStoredState(widget);
  }, [portalNode, widget]);

  useEffect(() => {
    const handleResize = () => {
      setWidget((current) => {
        const nextRect = resolveDockedPosition(current.docked, current);
        if (
          nextRect.x === current.x &&
          nextRect.y === current.y &&
          nextRect.width === current.width &&
          nextRect.height === current.height
        ) {
          return current;
        }
        return { ...current, ...nextRect };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => {
        setStream((current) => {
          const message = streamMessages[current.activeIndex] ?? "";
          if (current.visibleChars < message.length) {
            return {
              ...current,
              visibleChars: current.visibleChars + 1,
            };
          }
          return {
            activeIndex: (current.activeIndex + 1) % streamMessages.length,
            visibleChars: 0,
          };
        });
      },
      stream.visibleChars < activeMessage.length
        ? STREAM_TICK_MS
        : STREAM_PAUSE_MS,
    );

    return () => window.clearTimeout(timeout);
  }, [activeMessage.length, stream, streamMessages]);

  const clearPointerInteraction = useEffectEvent(() => {
    dragStateRef.current = null;
    resizeStateRef.current = null;
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  });

  const handlePointerMove = useEffectEvent((event: PointerEvent) => {
    if (dragStateRef.current) {
      const { startX, startY, rect } = dragStateRef.current;
      const nextRect = resolveDockedPosition("free", {
        ...rect,
        x: rect.x + (event.clientX - startX),
        y: rect.y + (event.clientY - startY),
      });
      setWidget((current) => ({
        ...current,
        ...nextRect,
        docked: "free",
        closed: false,
      }));
      return;
    }

    if (resizeStateRef.current) {
      const { startX, startY, rect } = resizeStateRef.current;
      const viewport = getViewportRect();
      const nextRect = resolveDockedPosition(
        widget.docked,
        {
          ...rect,
          width: rect.width + (event.clientX - startX),
          height: rect.height + (event.clientY - startY),
        },
        viewport,
      );

      setWidget((current) => ({
        ...current,
        width: nextRect.width,
        height: nextRect.height,
        ...(current.docked === "free"
          ? {
              x: clamp(
                current.x,
                EDGE_GAP,
                viewport.width - nextRect.width - EDGE_GAP,
              ),
            }
          : { x: nextRect.x }),
        y: clamp(
          current.y,
          EDGE_GAP,
          viewport.height - nextRect.height - EDGE_GAP,
        ),
      }));
    }
  });

  const handlePointerUp = useEffectEvent(() => {
    clearPointerInteraction();
  });

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const setDock = (docked: DockSide) => {
    setWidget((current) => {
      const nextRect = resolveDockedPosition(docked, current);
      return {
        ...current,
        ...nextRect,
        docked,
        closed: false,
      };
    });
  };

  const moveBy = (dx: number, dy: number) => {
    setWidget((current) => {
      const nextRect = resolveDockedPosition(
        current.docked === "free" ? "free" : current.docked,
        {
          ...current,
          x: current.x + dx,
          y: current.y + dy,
        },
      );
      return {
        ...current,
        ...nextRect,
        docked: current.docked === "free" ? "free" : current.docked,
      };
    });
  };

  const resizeBy = (dw: number, dh: number) => {
    setWidget((current) => {
      const nextRect = resolveDockedPosition(current.docked, {
        ...current,
        width: current.width + dw,
        height: current.height + dh,
      });
      return {
        ...current,
        ...nextRect,
      };
    });
  };

  const onDragPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      rect: {
        x: widget.x,
        y: widget.y,
        width: widget.width,
        height: widget.height,
      },
    };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    resizeStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      rect: {
        x: widget.x,
        y: widget.y,
        width: widget.width,
        height: widget.height,
      },
    };
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
  };

  const onHeaderKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        moveBy(-MOVE_STEP, 0);
        break;
      case "ArrowRight":
        event.preventDefault();
        moveBy(MOVE_STEP, 0);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveBy(0, -MOVE_STEP);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveBy(0, MOVE_STEP);
        break;
      case "Home":
        event.preventDefault();
        setDock("left");
        break;
      case "End":
        event.preventDefault();
        setDock("right");
        break;
      case "Escape":
        event.preventDefault();
        setWidget((current) => ({ ...current, closed: true }));
        break;
      default:
        break;
    }
  };

  const onResizeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        resizeBy(-RESIZE_STEP, 0);
        break;
      case "ArrowRight":
        event.preventDefault();
        resizeBy(RESIZE_STEP, 0);
        break;
      case "ArrowUp":
        event.preventDefault();
        resizeBy(0, -RESIZE_STEP);
        break;
      case "ArrowDown":
        event.preventDefault();
        resizeBy(0, RESIZE_STEP);
        break;
      default:
        break;
    }
  };

  const handleAction = (action: AssistantAction) => {
    const href = resolveAssistantActionHref(action);
    if (action.kind === "cross_app") {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(href);
  };

  const describeIntent = (intent: ActionIntent) =>
    `${formatOpsCodeLabel(locale, intent.resourceKind)} ${intent.resourceId} · ${formatOpsCodeLabel(locale, intent.action)}`;

  const buildAlternatives = (descriptors: ResourceActionDescriptor[]) => {
    const alternatives = descriptors
      .filter((descriptor) => descriptor.enabled)
      .map((descriptor) => formatOpsCodeLabel(locale, descriptor.action))
      .slice(0, 3);
    return alternatives.length > 0
      ? copy(
          locale,
          `Available: ${alternatives.join(", ")}`,
          `可用動作：${alternatives.join("、")}`,
        )
      : copy(locale, "No enabled alternatives.", "目前沒有可用動作。");
  };

  const handleSubmitPrompt = () => {
    const query = draft.trim();
    if (!query) {
      return;
    }

    appendConversation({
      id: `${Date.now()}-operator-query`,
      author: "operator",
      tone: "neutral",
      message: query,
    });

    const scoped = buildTier1ScopedResult(context, actionBridge);
    const lowerQuery = query.toLowerCase();
    const wantsScopedAnswer =
      /scope|selected|current|available|action|actions|can i|what can/i.test(
        lowerQuery,
      );

    if (wantsScopedAnswer && scoped) {
      appendConversation({
        id: `${Date.now()}-scoped-answer`,
        author: "assistant",
        tone: "accent",
        message: scoped.message,
        meta: scoped.meta,
      });
      setDraft("");
      return;
    }

    const help = buildTier0HelpResult(query, locale);
    appendConversation({
      id: `${Date.now()}-tier0-answer`,
      author: "assistant",
      tone: isForcedDegraded() ? "neutral" : "accent",
      message: isForcedDegraded()
        ? copy(
            locale,
            `LLM degraded. Showing curated help-search fallback.\n\n${help.message}`,
            `LLM 已降級，改顯示整理過的說明搜尋備援。\n\n${help.message}`,
          )
        : help.message,
      meta: help.meta,
    });
    setDraft("");
  };

  async function handleProposeAction(action: ResourceActionDescriptor) {
    if (!actionBridge || isProposing) {
      return;
    }

    setIsProposing(true);
    try {
      const intent = await getOpsClient().post<ActionIntent>(
        "/api/assistant/tools/propose-action",
        {
          body: {
            resourceKind: actionBridge.resourceKind,
            resourceId: actionBridge.resourceId,
            action: action.action,
          },
        },
      );
      setPendingIntent(intent);
      appendConversation({
        id: `${Date.now()}-${intent.action}`,
        author: "assistant",
        tone: "accent",
        message: copy(
          locale,
          `Proposed ${intent.action} for ${intent.resourceKind} ${intent.resourceId}.`,
          `已為 ${formatOpsCodeLabel(locale, intent.resourceKind)} ${intent.resourceId} 提出「${formatOpsCodeLabel(locale, intent.action)}」動作。`,
        ),
        meta: describeIntent(intent),
      });
    } catch (error) {
      appendConversation({
        id: `${Date.now()}-propose-error`,
        author: "system",
        tone: "danger",
        message:
          error instanceof Error
            ? error.message
            : copy(
                locale,
                "Assistant action proposal failed.",
                "助理動作提案失敗。",
              ),
      });
    } finally {
      setIsProposing(false);
    }
  }

  async function handleExecuteIntent() {
    if (!actionBridge || !pendingIntent || isExecutingIntent) {
      return;
    }

    const descriptor = actionBridge.resolveDescriptor(pendingIntent);
    if (!descriptor) {
      appendConversation({
        id: `${Date.now()}-unavailable`,
        author: "assistant",
        tone: "danger",
        message: copy(
          locale,
          `Unavailable action: ${pendingIntent.action}.`,
          `動作目前不可用：${formatOpsCodeLabel(locale, pendingIntent.action)}。`,
        ),
        meta: buildAlternatives(actionBridge.availableActions),
      });
      setPendingIntent(null);
      return;
    }

    if (!descriptor.enabled) {
      appendConversation({
        id: `${Date.now()}-disabled`,
        author: "assistant",
        tone: "danger",
        message: copy(
          locale,
          `Action blocked: ${descriptor.action}.`,
          `動作已被阻擋：${formatOpsCodeLabel(locale, descriptor.action)}。`,
        ),
        meta: descriptor.disabledReasonCode
          ? `${formatOpsCodeLabel(locale, descriptor.disabledReasonCode)} · ${buildAlternatives(actionBridge.availableActions)}`
          : buildAlternatives(actionBridge.availableActions),
      });
      setPendingIntent(null);
      return;
    }

    setIsExecutingIntent(true);
    appendConversation({
      id: `${Date.now()}-execute`,
      author: "operator",
      tone: "neutral",
      message:
        descriptor.riskLevel === "low"
          ? copy(
              locale,
              `Executing ${descriptor.action}.`,
              `正在執行 ${formatOpsCodeLabel(locale, descriptor.action)}。`,
            )
          : copy(
              locale,
              `Opening ${descriptor.riskLevel}-risk confirmation for ${descriptor.action}.`,
              `正在開啟 ${formatOpsCodeLabel(locale, descriptor.riskLevel)} 風險確認流程：${formatOpsCodeLabel(locale, descriptor.action)}。`,
            ),
      ...(descriptor.requiresReason || descriptor.riskLevel === "high"
        ? {
            meta: copy(
              locale,
              "Reason may be required by the existing page confirmation UI.",
              "既有頁面確認流程可能要求填寫原因。",
            ),
          }
        : {}),
    });

    try {
      const receipt = await actionBridge.invoke(pendingIntent, descriptor);
      appendReceipt(receipt, descriptor.action);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : copy(locale, "Assistant action failed.", "助理動作執行失敗。");
      appendConversation({
        id: `${Date.now()}-execute-error`,
        author: "system",
        tone: message === "ASSISTANT_ACTION_CANCELLED" ? "neutral" : "danger",
        message:
          message === "ASSISTANT_ACTION_CANCELLED"
            ? copy(locale, "Action cancelled.", "動作已取消。")
            : message,
      });
    } finally {
      setPendingIntent(null);
      setIsExecutingIntent(false);
    }
  }

  const appendReceipt = useEffectEvent(
    (receipt: AssistantActionReceipt, action: string) => {
      appendConversation({
        id: `${Date.now()}-${receipt.actionId}`,
        author: "assistant",
        tone: "success",
        message:
          receipt.message ||
          copy(
            locale,
            `${action} completed.`,
            `${formatOpsCodeLabel(locale, action)} 已完成。`,
          ),
        meta: copy(
          locale,
          `actionId ${receipt.actionId} · auditId ${receipt.auditId}`,
          `動作編號 ${receipt.actionId} · 稽核編號 ${receipt.auditId}`,
        ),
        auditHref:
          receipt.auditHref ??
          `/audit?auditId=${encodeURIComponent(receipt.auditId)}`,
      });
    },
  );

  if (!portalNode) {
    return null;
  }

  const shellStyle: CSSProperties = {
    position: "fixed",
    left: widget.x,
    top: widget.y,
    width: widget.width,
    height: widget.minimized ? MINIMIZED_HEIGHT : widget.height,
    zIndex: 5000,
    borderRadius: 18,
    background: theme.bgRaised,
    border: `1px solid ${theme.borderStrong}`,
    boxShadow: theme.shadow,
    color: theme.text,
    overflow: "hidden",
    display: widget.closed ? "none" : "grid",
    gridTemplateRows: `${HEADER_HEIGHT}px 1fr`,
    pointerEvents: "auto",
  };

  return createPortal(
    <>
      {widget.closed ? (
        <button
          type="button"
          data-testid="ops-assistant-launcher"
          aria-label={copy(locale, "Open operations assistant", "開啟營運助理")}
          onClick={() =>
            setWidget((current) => ({ ...current, closed: false }))
          }
          style={{
            position: "fixed",
            right: EDGE_GAP,
            bottom: EDGE_GAP,
            zIndex: 5000,
            height: 48,
            padding: "0 16px",
            borderRadius: 999,
            border: `1px solid ${theme.accentBorder}`,
            background: theme.surface,
            color: theme.text,
            boxShadow: theme.shadow,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
          }}
        >
          <CanvasIcon name="callcenter" size={16} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {copy(locale, "Assistant", "助理")}
          </span>
        </button>
      ) : null}

      <section
        data-testid="ops-assistant-panel"
        role="region"
        aria-labelledby={titleId}
        aria-describedby={instructionsId}
        aria-live="off"
        style={shellStyle}
      >
        <div
          data-testid="ops-assistant-drag-handle"
          tabIndex={0}
          onPointerDown={onDragPointerDown}
          onKeyDown={onHeaderKeyDown}
          aria-label={copy(
            locale,
            "Assistant widget header. Use arrow keys to move, Home or End to dock, Escape to close.",
            "助理元件標頭。可用方向鍵移動，Home 或 End 停靠，Escape 關閉。",
          )}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 10px 0 14px",
            background: `linear-gradient(135deg, ${theme.surface}, ${theme.surfaceHi})`,
            borderBottom: `1px solid ${theme.border}`,
            cursor: "grab",
            outline: "none",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: theme.accentHi,
              boxShadow: `0 0 0 4px ${theme.accentBg}`,
            }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              id={titleId}
              style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.15 }}
            >
              {copy(locale, "Operations Assistant", "營運助理")}
            </div>
            <div
              style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.15 }}
            >
              {copy(
                locale,
                "Floating shell · mock stream · persistent layout",
                "浮動面板 · 模擬串流 · 版面持久保存",
              )}
            </div>
          </div>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ActionButton
              label={
                widget.minimized
                  ? copy(locale, "Expand assistant", "展開助理")
                  : copy(locale, "Minimize assistant", "縮小助理")
              }
              icon="minus"
              pressed={widget.minimized}
              onClick={() =>
                setWidget((current) => ({
                  ...current,
                  minimized: !current.minimized,
                  closed: false,
                }))
              }
            />
            <ActionButton
              label={copy(
                locale,
                "Dock assistant to left edge",
                "將助理停靠在左側",
              )}
              icon="pin"
              pressed={widget.docked === "left"}
              onClick={() =>
                setDock(widget.docked === "left" ? "free" : "left")
              }
            />
            <ActionButton
              label={copy(
                locale,
                "Dock assistant to right edge",
                "將助理停靠在右側",
              )}
              icon="arrow"
              pressed={widget.docked === "right"}
              onClick={() =>
                setDock(widget.docked === "right" ? "free" : "right")
              }
            />
            <ActionButton
              label={copy(locale, "Close assistant", "關閉助理")}
              icon="x"
              onClick={() =>
                setWidget((current) => ({ ...current, closed: true }))
              }
            />
          </div>
        </div>

        {!widget.minimized ? (
          <div
            style={{
              minHeight: 0,
              display: "grid",
              gridTemplateRows: "1fr auto",
              background: `linear-gradient(180deg, ${theme.bgRaised} 0%, ${theme.surfaceLo} 100%)`,
            }}
          >
            <div
              style={{
                padding: 14,
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 11, color: theme.textDim }}>
                    {copy(locale, "Session", "工作階段")}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: theme.success,
                      background: theme.successBg,
                      border: `1px solid ${theme.successBorder}`,
                      borderRadius: 999,
                      padding: "2px 8px",
                    }}
                  >
                    {copy(locale, "online", "上線")}
                  </span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <MessageBubble
                    tone="neutral"
                    author={copy(locale, "System", "系統")}
                    locale={locale}
                    message={copy(
                      locale,
                      "Queue scan complete. No active blocking incidents in the shell frame.",
                      "佇列掃描完成，目前此面板範圍內沒有阻塞中的事故。",
                    )}
                  />
                  <MessageBubble
                    tone="accent"
                    author={copy(locale, "Assistant", "助理")}
                    locale={locale}
                    message={activeMessage.slice(0, stream.visibleChars)}
                    liveRegionId={liveRegionId}
                  />
                </div>
              </div>

              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 11, color: theme.textDim }}>
                  {copy(locale, "Action bridge", "動作橋接")}
                </div>
                {actionBridge ? (
                  <>
                    <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                      {`${formatOpsCodeLabel(locale, actionBridge.resourceKind)} ${actionBridge.resourceId}`}
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {actionBridge.availableActions.map((action) => (
                        <button
                          key={`assistant-action:${action.action}`}
                          type="button"
                          data-testid={`ops-assistant-action-${action.action}`}
                          disabled={isProposing || isExecutingIntent}
                          onClick={() => void handleProposeAction(action)}
                          style={actionButtonStyle}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              alignItems: "center",
                            }}
                          >
                            <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                              {formatOpsCodeLabel(locale, action.action)}
                            </span>
                            <span
                              style={{
                                fontSize: 10.5,
                                color: theme.textDim,
                              }}
                            >
                              {formatOpsCodeLabel(
                                context?.locale ?? "en",
                                action.riskLevel,
                              )}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              color: theme.textMuted,
                              textAlign: "left",
                              lineHeight: 1.45,
                            }}
                          >
                            {action.enabled
                              ? action.requiresReason
                                ? copy(
                                    locale,
                                    "Existing confirmation flow requires a reason.",
                                    "既有確認流程要求填寫原因。",
                                  )
                                : copy(
                                    locale,
                                    "Resolve via availableActions, then reuse the existing page action flow.",
                                    "請先依可用操作清單判斷，再沿用既有頁面動作流程。",
                                  )
                              : copy(
                                  locale,
                                  `Disabled: ${action.disabledReasonCode ?? "unavailable"}`,
                                  `已停用：${formatOpsCodeLabel(locale, action.disabledReasonCode ?? "unavailable")}`,
                                )}
                          </span>
                        </button>
                      ))}
                    </div>
                    {pendingIntent ? (
                      <div
                        style={{
                          borderRadius: 10,
                          border: `1px solid ${theme.accentBorder}`,
                          background: theme.accentBg,
                          padding: 10,
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 12.5, color: theme.text }}>
                          {copy(
                            locale,
                            `Pending intent · ${formatOpsCodeLabel(locale, pendingIntent.action)}`,
                            `待處理意圖 · ${formatOpsCodeLabel(locale, pendingIntent.action)}`,
                          )}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: theme.textMuted,
                            lineHeight: 1.45,
                          }}
                        >
                          {describeIntent(pendingIntent)}
                        </span>
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          <button
                            type="button"
                            data-testid="ops-assistant-open-confirmation"
                            disabled={isExecutingIntent}
                            onClick={() => void handleExecuteIntent()}
                            style={primaryAssistButtonStyle}
                          >
                            {isExecutingIntent
                              ? copy(locale, "Working...", "處理中...")
                              : copy(locale, "Open confirmation", "開啟確認")}
                          </button>
                          <button
                            type="button"
                            disabled={isExecutingIntent}
                            onClick={() => setPendingIntent(null)}
                            style={secondaryAssistButtonStyle}
                          >
                            {copy(locale, "Dismiss", "關閉")}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${theme.border}`,
                      padding: "10px 12px",
                      background: theme.surfaceLo,
                      fontSize: 12,
                      color: theme.textMuted,
                      lineHeight: 1.45,
                    }}
                  >
                    {copy(
                      locale,
                      "Focus a supported detail view to let the assistant resolve action intent against that resource's available actions.",
                      "請先切到支援的明細頁，讓助理能依該資源的可用操作清單解析動作意圖。",
                    )}
                  </div>
                )}
              </div>

              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 11, color: theme.textDim }}>
                  {copy(locale, "Assistant actions", "助理動作")}
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <label
                    htmlFor="ops-assistant-composer"
                    style={{ fontSize: 11, color: theme.textDim }}
                  >
                    {copy(locale, "Ask assistant", "詢問助理")}
                  </label>
                  <textarea
                    id="ops-assistant-composer"
                    data-testid="ops-assistant-composer"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={copy(
                      locale,
                      "Ask about refresh tiers, current scope, or available actions",
                      "可詢問刷新層級、目前範圍或可用動作",
                    )}
                    rows={3}
                    style={{
                      width: "100%",
                      resize: "vertical",
                      borderRadius: 10,
                      border: `1px solid ${theme.border}`,
                      background: theme.surfaceLo,
                      color: theme.text,
                      padding: "10px 12px",
                      font: "inherit",
                      lineHeight: 1.45,
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      data-testid="ops-assistant-send"
                      onClick={handleSubmitPrompt}
                      style={primaryAssistButtonStyle}
                    >
                      {copy(locale, "Ask", "送出")}
                    </button>
                  </div>
                  {actions.length > 0 ? (
                    actions.map((action) => (
                      <button
                        key={`${action.kind}:${resolveAssistantActionHref(action)}`}
                        type="button"
                        onClick={() => handleAction(action)}
                        style={actionButtonStyle}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                            {action.label}
                          </span>
                          <CanvasIcon
                            name={action.kind === "cross_app" ? "ext" : "arrow"}
                            size={13}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            color: theme.textMuted,
                            lineHeight: 1.45,
                            textAlign: "left",
                          }}
                        >
                          {action.description}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div
                      style={{
                        borderRadius: 10,
                        border: `1px solid ${theme.border}`,
                        padding: "10px 12px",
                        background: theme.surfaceLo,
                        fontSize: 12,
                        color: theme.textMuted,
                        lineHeight: 1.45,
                      }}
                    >
                      {copy(
                        locale,
                        "Open a board or detail page to let the assistant emit route-aware actions and deep links.",
                        "先開啟一個看板或明細頁，助理才會產生對應路由的動作與深連結。",
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 11, color: theme.textDim }}>
                  {copy(locale, "Conversation", "對話紀錄")}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {conversation.length > 0 ? (
                    conversation.map((entry) => (
                      <MessageBubble
                        key={entry.id}
                        tone={entry.tone}
                        author={
                          entry.author === "assistant"
                            ? copy(locale, "Assistant", "助理")
                            : entry.author === "operator"
                              ? copy(locale, "Operator", "操作員")
                              : copy(locale, "System", "系統")
                        }
                        message={entry.message}
                        locale={locale}
                        {...(entry.meta ? { meta: entry.meta } : {})}
                        {...(entry.auditHref !== undefined
                          ? { auditHref: entry.auditHref }
                          : {})}
                      />
                    ))
                  ) : (
                    <div
                      style={{
                        borderRadius: 10,
                        border: `1px solid ${theme.border}`,
                        padding: "10px 12px",
                        background: theme.surfaceLo,
                        fontSize: 12,
                        color: theme.textMuted,
                        lineHeight: 1.45,
                      }}
                    >
                      {copy(
                        locale,
                        "Proposed actions, disabled refusals, and action receipts will be written back here.",
                        "提出的動作、停用回覆與動作收據都會回寫在這裡。",
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 11, color: theme.textDim }}>
                  {copy(locale, "Context envelope", "內容封包")}
                </div>
                <dl
                  style={{
                    margin: 0,
                    display: "grid",
                    gridTemplateColumns: "max-content 1fr",
                    gap: "6px 10px",
                    fontSize: 11.5,
                  }}
                >
                  <dt style={{ color: theme.textDim }}>
                    {copy(locale, "Route", "路由")}
                  </dt>
                  <dd style={contextValueStyle}>
                    {formatContextRoute(locale, context?.route)}
                  </dd>
                  <dt style={{ color: theme.textDim }}>
                    {copy(locale, "Board", "看板")}
                  </dt>
                  <dd style={contextValueStyle}>
                    {formatContextValue(locale, context?.board)}
                  </dd>
                  <dt style={{ color: theme.textDim }}>
                    {copy(locale, "Tab", "分頁")}
                  </dt>
                  <dd style={contextValueStyle}>
                    {formatContextValue(locale, context?.activeTab)}
                  </dd>
                  <dt style={{ color: theme.textDim }}>
                    {copy(locale, "Selection", "目前選取")}
                  </dt>
                  <dd style={contextValueStyle}>
                    {context?.selectedEntity
                      ? `${formatOpsCodeLabel(locale, context.selectedEntity.kind)} ${context.selectedEntity.id}`
                      : "—"}
                  </dd>
                  <dt style={{ color: theme.textDim }}>
                    {copy(locale, "Filters", "篩選條件")}
                  </dt>
                  <dd style={contextValueStyle}>
                    {formatVisibleFilters(locale, context?.visibleFilters)}
                  </dd>
                </dl>
              </div>
            </div>

            <div
              style={{
                borderTop: `1px solid ${theme.border}`,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                background: theme.surface,
              }}
            >
              <div
                id={instructionsId}
                style={{ fontSize: 11, color: theme.textMuted, minWidth: 0 }}
              >
                {copy(
                  locale,
                  "Header arrows move. Resize handle arrows resize. Layout persists in local storage.",
                  "標頭可用方向鍵移動；右下角調整尺寸。版面會保存在本機儲存空間。",
                )}
              </div>
              <button
                type="button"
                data-testid="ops-assistant-resize-handle"
                aria-label={copy(
                  locale,
                  "Resize assistant widget",
                  "調整助理元件大小",
                )}
                onPointerDown={onResizePointerDown}
                onKeyDown={onResizeKeyDown}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: theme.surfaceLo,
                  color: theme.textMuted,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "nwse-resize",
                  padding: 0,
                }}
              >
                <CanvasIcon
                  name="chevR"
                  size={13}
                  style={{ transform: "rotate(45deg)" }}
                />
              </button>
            </div>
          </div>
        ) : (
          <div
            id={instructionsId}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 14px",
              fontSize: 12,
              color: theme.textMuted,
              background: theme.surface,
            }}
          >
            <span>
              {copy(
                locale,
                "Minimized. Expand to resume the live mock stream.",
                "已縮小，展開後可繼續查看模擬即時串流。",
              )}
            </span>
            <button
              type="button"
              data-testid="ops-assistant-restore"
              aria-label={copy(
                locale,
                "Restore assistant widget",
                "還原助理元件",
              )}
              onClick={() =>
                setWidget((current) => ({ ...current, minimized: false }))
              }
              style={restoreButtonStyle}
            >
              {copy(locale, "Restore", "還原")}
            </button>
          </div>
        )}
      </section>
    </>,
    portalNode,
  );
}

function MessageBubble({
  author,
  message,
  tone,
  locale,
  meta,
  auditHref,
  liveRegionId,
}: {
  author: string;
  message: string;
  tone: "neutral" | "accent" | "success" | "danger";
  locale: "en" | "zh";
  meta?: string;
  auditHref?: string | null;
  liveRegionId?: string;
}) {
  const bubbleTheme =
    tone === "accent"
      ? {
          background: theme.accentBg,
          border: theme.accentBorder,
          text: theme.accentHi,
        }
      : tone === "success"
        ? {
            background: theme.successBg,
            border: theme.successBorder,
            text: theme.success,
          }
        : tone === "danger"
          ? {
              background: theme.dangerBg,
              border: theme.dangerBorder,
              text: theme.danger,
            }
          : {
              background: theme.surfaceLo,
              border: theme.border,
              text: theme.textDim,
            };
  return (
    <div
      style={{
        borderRadius: 12,
        padding: "10px 12px",
        background: bubbleTheme.background,
        border: `1px solid ${bubbleTheme.border}`,
        display: "grid",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: bubbleTheme.text,
          marginBottom: 4,
        }}
      >
        {author}
      </div>
      <div
        {...(liveRegionId
          ? {
              id: liveRegionId,
              "aria-live": "polite" as const,
              "aria-atomic": true,
            }
          : {})}
        style={{ fontSize: 12.5, lineHeight: 1.45, color: theme.text }}
      >
        {message || " "}
      </div>
      {meta ? (
        <div
          style={{
            fontSize: 10.5,
            color: theme.textMuted,
            fontFamily: theme.monoFamily,
          }}
        >
          {meta}
        </div>
      ) : null}
      {auditHref ? (
        <a
          href={auditHref}
          target="_blank"
          rel="noreferrer"
          style={{
            color: theme.accentHi,
            fontSize: 11,
            textDecoration: "none",
          }}
        >
          {copy(locale, "View audit", "檢視稽核")}
        </a>
      ) : null}
    </div>
  );
}

const restoreButtonStyle: CSSProperties = {
  borderRadius: 999,
  border: `1px solid ${theme.accentBorder}`,
  background: theme.accentBg,
  color: theme.accentHi,
  fontSize: 11,
  fontWeight: 700,
  padding: "6px 10px",
  cursor: "pointer",
};

const actionButtonStyle: CSSProperties = {
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  padding: "10px 12px",
  background: theme.surfaceLo,
  color: theme.text,
  display: "grid",
  gap: 6,
  textAlign: "left",
  cursor: "pointer",
};

const primaryAssistButtonStyle: CSSProperties = {
  height: 30,
  padding: "0 12px",
  borderRadius: 8,
  border: `1px solid ${theme.accentBorder}`,
  background: theme.accentBg,
  color: theme.text,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryAssistButtonStyle: CSSProperties = {
  ...primaryAssistButtonStyle,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  fontWeight: 600,
};

const contextValueStyle: CSSProperties = {
  margin: 0,
  color: theme.text,
  fontFamily: theme.monoFamily,
  wordBreak: "break-word",
};

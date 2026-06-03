"use client";

import { MessageSquare, Minimize2, RotateCcw, Sparkles, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { isPlatformAdminAssistantEnabled } from "@/lib/runtime-config";
import { useTranslation } from "@/lib/i18n";

const PANEL_WIDTH = 368;
const PANEL_HEIGHT = 520;
const MOBILE_BREAKPOINT = 768;
const DESKTOP_MARGIN = 24;
const MOBILE_MARGIN = 12;
const STORAGE_KEY = "drts-platform-admin-assistant-position-v1";

type Position = {
  x: number;
  y: number;
};

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

export function PlatformAssistantOverlay() {
  const enabled = isPlatformAdminAssistantEnabled();
  const { locale } = useTranslation();
  const titleId = useId();
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [position, setPosition] = useState<Position>({
    x: DESKTOP_MARGIN,
    y: DESKTOP_MARGIN,
  });
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

  if (!enabled || !isMounted) {
    return null;
  }

  const copy =
    locale === "zh"
      ? {
          launcher: "開啟平台助理",
          badge: "Beta",
          label: "平台助理",
          subtitle: "治理操作輔助",
          heading: "Platform Admin Assistant",
          status: "僅提供 shell-level 入口；後續再接 LLM 工作流。",
          bodyTitle: "本次 wave 交付",
          bullets: [
            "浮動 launcher 與面板由 feature flag 控制。",
            "桌面版支援拖曳、位置記憶與視窗邊界限制。",
            "手機版改為底部抽屜，不覆寫既有 route body。",
          ],
          minimize: "最小化",
          close: "關閉",
          reset: "重設位置",
        }
      : {
          launcher: "Open platform assistant",
          badge: "Beta",
          label: "Assistant",
          subtitle: "governance copilot",
          heading: "Platform Admin Assistant",
          status:
            "Shell entry only for this wave; LLM workflow wiring follows later.",
          bodyTitle: "Delivered in this wave",
          bullets: [
            "Floating launcher and panel are feature-flagged.",
            "Desktop supports drag, persistence, and viewport clamping.",
            "Mobile switches to a bottom sheet without changing route bodies.",
          ],
          minimize: "Minimize",
          close: "Close",
          reset: "Reset position",
        };

  const panelStyle: CSSProperties = isMobile
    ? {
        position: "fixed",
        left: MOBILE_MARGIN,
        right: MOBILE_MARGIN,
        bottom: MOBILE_MARGIN,
        maxHeight: "min(70vh, 560px)",
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

  function handleResetPosition() {
    const nextPosition = getDefaultDesktopPosition();
    setPosition(nextPosition);
    persistPosition(nextPosition);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (isMobile) {
      return;
    }

    const target = event.target;
    if (target instanceof Element && target.closest("button")) {
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
            <div style={heroCardStyle}>
              <span style={heroEyebrowStyle}>{copy.bodyTitle}</span>
              <ul style={bulletListStyle}>
                {copy.bullets.map((bullet) => (
                  <li key={bullet} style={bulletItemStyle}>
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
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
  border: "1px solid rgba(203, 213, 225, 0.9)",
  background: "#FFFFFF",
  color: "#334155",
  cursor: "pointer",
};

const panelBodyStyle: CSSProperties = {
  flex: 1,
  overflow: "auto",
  padding: 16,
  background:
    "radial-gradient(circle at top right, rgba(199, 210, 254, 0.48), transparent 36%), #F8FAFC",
};

const heroCardStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 16,
  borderRadius: 18,
  border: "1px solid rgba(199, 210, 254, 0.8)",
  background: "#FFFFFF",
};

const heroEyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: "#4F46E5",
};

const bulletListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  display: "grid",
  gap: 10,
  color: "#0F172A",
  fontSize: 13,
  lineHeight: 1.5,
};

const bulletItemStyle: CSSProperties = {
  paddingLeft: 2,
};

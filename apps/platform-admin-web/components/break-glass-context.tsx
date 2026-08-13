"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { BreakGlassGrantRecord } from "@drts/contracts";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { createPlatformAdminIamClient } from "@/lib/platform-admin-iam-client";
import {
  buildCanvasTheme,
  CANVAS_DARK_NAVY_PALETTE,
  CANVAS_SURFACE_ACCENTS,
} from "@drts/ui-web";

const ALERT_OPS_ACCENT = CANVAS_SURFACE_ACCENTS.ops;
const ALERT_DANGER = CANVAS_DARK_NAVY_PALETTE.danger;
const ALERT_DANGER_BG = CANVAS_DARK_NAVY_PALETTE.dangerBg;
const ALERT_TEXT = CANVAS_DARK_NAVY_PALETTE.text;

const STORAGE_KEY = "drts_platform_break_glass_session";

export interface BreakGlassState {
  grant: BreakGlassGrantRecord | null;
  accessToken: string | null;
  expiresAt: string | null;
  sessionBanner: string | null;
}

export interface BreakGlassContextValue extends BreakGlassState {
  isBreakGlassActive: boolean;
  secondsRemaining: number;
  activateSession: (
    grant: BreakGlassGrantRecord,
    accessToken: string,
    expiresAt: string,
  ) => void;
  exitSession: (reason?: string) => Promise<void>;
}

const BreakGlassContext = createContext<BreakGlassContextValue>({
  grant: null,
  accessToken: null,
  expiresAt: null,
  sessionBanner: null,
  isBreakGlassActive: false,
  secondsRemaining: 0,
  activateSession: () => {},
  exitSession: async () => {},
});

export function BreakGlassProvider({ children }: { children: ReactNode }) {
  const rawClient = usePlatformAdminClient();
  const iamClient = useMemo(
    () => createPlatformAdminIamClient(rawClient),
    [rawClient],
  );

  const [state, setState] = useState<BreakGlassState>(() => {
    if (typeof window === "undefined") {
      return { grant: null, accessToken: null, expiresAt: null, sessionBanner: null };
    }
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as BreakGlassState;
        if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() > Date.now()) {
          return parsed;
        }
      }
    } catch {
      // Ignore parse errors
    }
    return { grant: null, accessToken: null, expiresAt: null, sessionBanner: null };
  });

  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    if (!state.expiresAt) return 0;
    return Math.max(0, Math.floor((new Date(state.expiresAt).getTime() - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!state.expiresAt || !state.grant) {
      setSecondsRemaining(0);
      return;
    }

    const calculate = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(state.expiresAt!).getTime() - Date.now()) / 1000),
      );
      setSecondsRemaining(remaining);
      if (remaining === 0) {
        // Auto expire locally when countdown reaches 0
        sessionStorage.removeItem(STORAGE_KEY);
        setState({ grant: null, accessToken: null, expiresAt: null, sessionBanner: null });
      }
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [state.expiresAt, state.grant]);

  const activateSession = useCallback(
    (grant: BreakGlassGrantRecord, accessToken: string, expiresAt: string) => {
      const nextState: BreakGlassState = {
        grant,
        accessToken,
        expiresAt,
        sessionBanner: "BREAK_GLASS_ACTIVE",
      };
      setState(nextState);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      } catch {
        // Ignore storage errors
      }
    },
    [],
  );

  const exitSession = useCallback(
    async (reason = "user_manual_exit") => {
      if (state.grant?.grantId) {
        try {
          await iamClient.closeBreakGlass(state.grant.grantId, {
            mutation: {
              reasonCode: reason,
              expectedVersion: state.grant.version ?? 1,
            },
          });
        } catch {
          // Proceed with local revocation even if API fails
        }
      }
      sessionStorage.removeItem(STORAGE_KEY);
      setState({ grant: null, accessToken: null, expiresAt: null, sessionBanner: null });
    },
    [iamClient, state.grant],
  );

  const isBreakGlassActive = Boolean(
    state.grant &&
      state.expiresAt &&
      secondsRemaining > 0 &&
      state.sessionBanner === "BREAK_GLASS_ACTIVE",
  );

  const value = useMemo<BreakGlassContextValue>(
    () => ({
      ...state,
      isBreakGlassActive,
      secondsRemaining,
      activateSession,
      exitSession,
    }),
    [state, isBreakGlassActive, secondsRemaining, activateSession, exitSession],
  );

  return (
    <BreakGlassContext.Provider value={value}>
      {children}
    </BreakGlassContext.Provider>
  );
}

export function useBreakGlass() {
  return useContext(BreakGlassContext);
}

export function BreakGlassBanner() {
  const { isBreakGlassActive, grant, secondsRemaining, exitSession } =
    useBreakGlass();
  const [exiting, setExiting] = useState(false);

  if (!isBreakGlassActive || !grant) {
    return null;
  }

  const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timerDisplay = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const handleExit = async () => {
    setExiting(true);
    try {
      await exitSession("operator_exit_cta");
    } finally {
      setExiting(false);
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        background: ALERT_DANGER_BG,
        color: ALERT_TEXT,
        borderBottom: `2px solid ${ALERT_DANGER}`,
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 12.5,
        fontWeight: 600,
        fontFamily: theme.fontFamily,
        zIndex: 100,
        boxShadow: `0 4px 12px ${ALERT_DANGER_BG}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 14 }}>🚨</span>
        <span style={{ fontWeight: 700, letterSpacing: 0.3 }}>
          BREAK-GLASS EMERGENCY ACCESS ACTIVE
        </span>
        <span
          style={{
            background: "rgba(0, 0, 0, 0.3)",
            padding: "2px 8px",
            borderRadius: 4,
            fontFamily: theme.monoFamily,
            fontSize: 11.5,
            color: ALERT_OPS_ACCENT.dark,
          }}
        >
          {grant.grantId}
        </span>
        <span style={{ color: ALERT_OPS_ACCENT.dark, opacity: 0.85 }}>|</span>
        <span>Reason: {grant.reasonCode}</span>
        {grant.grantedScopes?.length > 0 ? (
          <span
            style={{
              fontSize: 11,
              fontFamily: theme.monoFamily,
              color: ALERT_OPS_ACCENT.darkHi,
              opacity: 0.9,
            }}
          >
            [{grant.grantedScopes.join(", ")}]
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(220, 38, 38, 0.4)",
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid rgba(248, 113, 113, 0.4)",
          }}
        >
          <span style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.85 }}>
            Expires in:
          </span>
          <span
            style={{
              fontFamily: theme.monoFamily,
              fontSize: 13,
              fontWeight: 800,
              color: "#FFFFFF",
              letterSpacing: 1,
            }}
          >
            {timerDisplay}
          </span>
        </div>

        <button
          type="button"
          disabled={exiting}
          onClick={() => void handleExit()}
          style={{
            background: ALERT_OPS_ACCENT.light,
            color: "#FFFFFF",
            border: `1px solid ${ALERT_DANGER}`,
            borderRadius: 6,
            padding: "5px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: exiting ? "not-allowed" : "pointer",
            opacity: exiting ? 0.6 : 1,
            fontFamily: theme.fontFamily,
          }}
        >
          {exiting ? "Exiting…" : "Exit Emergency Access"}
        </button>
      </div>
    </div>
  );
}

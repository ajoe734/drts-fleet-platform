"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ConciergeOperatorMode } from "@/lib/desk-catalog";
import { getDeskById } from "@/lib/desk-catalog";

const STORAGE_KEY = "drts.concierge.portal.session.v1";

export type ConciergePortalSessionState = {
  operatorName: string;
  operatorId: string;
  mode: ConciergeOperatorMode;
  deskId: string | null;
  activeCallId: string | null;
  recentCallIds: string[];
  recentOrderIds: string[];
  recentCallbackTaskIds: string[];
  signedInAt: string;
};

type SignInInput = {
  operatorName: string;
  operatorId: string;
  mode: ConciergeOperatorMode;
};

type ConciergePortalContextValue = {
  ready: boolean;
  session: ConciergePortalSessionState | null;
  deskId: string | null;
  signIn: (input: SignInInput) => void;
  selectDesk: (deskId: string) => void;
  recordCall: (callId: string) => void;
  clearActiveCall: () => void;
  recordOrder: (orderId: string) => void;
  recordCallbackTask: (callbackTaskId: string) => void;
  signOut: () => void;
};

const ConciergePortalContext =
  createContext<ConciergePortalContextValue | null>(null);

function prependUnique(items: string[], value: string) {
  return [value, ...items.filter((item) => item !== value)].slice(0, 8);
}

function parseStoredState(raw: string | null) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ConciergePortalSessionState>;
    if (
      !parsed.operatorName ||
      !parsed.operatorId ||
      !parsed.mode ||
      !parsed.signedInAt
    ) {
      return null;
    }
    return {
      operatorName: parsed.operatorName,
      operatorId: parsed.operatorId,
      mode: parsed.mode,
      deskId: parsed.deskId ?? null,
      activeCallId: parsed.activeCallId ?? null,
      recentCallIds: Array.isArray(parsed.recentCallIds)
        ? parsed.recentCallIds.filter(Boolean)
        : [],
      recentOrderIds: Array.isArray(parsed.recentOrderIds)
        ? parsed.recentOrderIds.filter(Boolean)
        : [],
      recentCallbackTaskIds: Array.isArray(parsed.recentCallbackTaskIds)
        ? parsed.recentCallbackTaskIds.filter(Boolean)
        : [],
      signedInAt: parsed.signedInAt,
    } satisfies ConciergePortalSessionState;
  } catch {
    return null;
  }
}

export function ConciergePortalProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<ConciergePortalSessionState | null>(
    null,
  );

  useEffect(() => {
    setSession(parseStoredState(window.localStorage.getItem(STORAGE_KEY)));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      return;
    }

    window.localStorage.removeItem(STORAGE_KEY);
  }, [ready, session]);

  const value: ConciergePortalContextValue = {
    ready,
    session,
    deskId: session?.deskId ?? null,
    signIn(input) {
      setSession({
        operatorName: input.operatorName.trim(),
        operatorId: input.operatorId.trim(),
        mode: input.mode,
        deskId: null,
        activeCallId: null,
        recentCallIds: [],
        recentOrderIds: [],
        recentCallbackTaskIds: [],
        signedInAt: new Date().toISOString(),
      });
    },
    selectDesk(deskId) {
      setSession((current) =>
        current
          ? {
              ...current,
              deskId,
            }
          : current,
      );
    },
    recordCall(callId) {
      setSession((current) =>
        current
          ? {
              ...current,
              activeCallId: callId,
              recentCallIds: prependUnique(current.recentCallIds, callId),
            }
          : current,
      );
    },
    clearActiveCall() {
      setSession((current) =>
        current
          ? {
              ...current,
              activeCallId: null,
            }
          : current,
      );
    },
    recordOrder(orderId) {
      setSession((current) =>
        current
          ? {
              ...current,
              recentOrderIds: prependUnique(current.recentOrderIds, orderId),
            }
          : current,
      );
    },
    recordCallbackTask(callbackTaskId) {
      setSession((current) =>
        current
          ? {
              ...current,
              recentCallbackTaskIds: prependUnique(
                current.recentCallbackTaskIds,
                callbackTaskId,
              ),
            }
          : current,
      );
    },
    signOut() {
      setSession(null);
    },
  };

  return (
    <ConciergePortalContext.Provider value={value}>
      {children}
    </ConciergePortalContext.Provider>
  );
}

export function useConciergePortal() {
  const context = useContext(ConciergePortalContext);
  if (!context) {
    throw new Error("useConciergePortal must be used inside the provider.");
  }
  return context;
}

export function useSelectedDesk() {
  const { deskId } = useConciergePortal();
  return getDeskById(deskId);
}

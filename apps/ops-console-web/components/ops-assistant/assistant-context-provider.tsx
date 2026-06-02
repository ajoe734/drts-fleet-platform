"use client";

/**
 * Ops Assistant — Context Envelope provider (design handoff §5 / §6.1).
 *
 * Exposes the §5 `OpsAssistantContext` envelope from:
 *   - route        → `usePathname()`
 *   - locale       → the shared i18n context
 *   - identity     → server-resolved, passed in as a prop (one per session)
 *   - health       → seeded from the server, updatable by the shell/pages
 *   - selection    → published by pages via `setAssistantSelection({kind,id})`
 *   - board / tab / visibleFilters → published by pages via `setAssistantScope`
 *
 * Two contexts are exposed so that the high-churn envelope (re-derived on every
 * route/selection change) does not re-render selection *publishers* — pages that
 * only call the stable setters never subscribe to the envelope itself.
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { UiHealthEnvelope } from "@drts/contracts";
import { useTranslation } from "@/lib/i18n";
import type {
  AssistantScope,
  AssistantSelection,
  OpsAssistantContext,
  OpsAssistantIdentity,
} from "./context-envelope";

/** Stable setters pages use to publish selection/scope/health. */
export interface OpsAssistantContextActions {
  setAssistantSelection: (selection: AssistantSelection) => void;
  clearAssistantSelection: () => void;
  /** Shallow-merges into the current scope (board / activeTab / visibleFilters). */
  setAssistantScope: (scope: AssistantScope) => void;
  clearAssistantScope: () => void;
  setAssistantHealth: (health: UiHealthEnvelope) => void;
}

const NOOP_ACTIONS: OpsAssistantContextActions = {
  setAssistantSelection: () => {},
  clearAssistantSelection: () => {},
  setAssistantScope: () => {},
  clearAssistantScope: () => {},
  setAssistantHealth: () => {},
};

const ActionsContext = createContext<OpsAssistantContextActions>(NOOP_ACTIONS);
const EnvelopeContext = createContext<OpsAssistantContext | null>(null);

export interface OpsAssistantContextProviderProps {
  /** Operator identity + environment, resolved on the server once per session. */
  identity: OpsAssistantIdentity;
  /** Shell-level health snapshot, seeded on the server to avoid hydration drift. */
  initialHealth: UiHealthEnvelope;
  children: ReactNode;
}

export function OpsAssistantContextProvider({
  identity,
  initialHealth,
  children,
}: OpsAssistantContextProviderProps) {
  const pathname = usePathname() ?? "";
  const { locale } = useTranslation();

  const [selection, setSelection] = useState<AssistantSelection | null>(null);
  const [scope, setScope] = useState<AssistantScope>({});
  const [health, setHealth] = useState<UiHealthEnvelope>(initialHealth);

  const actions = useMemo<OpsAssistantContextActions>(
    () => ({
      setAssistantSelection: (next) => setSelection(next),
      clearAssistantSelection: () => setSelection(null),
      setAssistantScope: (next) => setScope((prev) => ({ ...prev, ...next })),
      clearAssistantScope: () => setScope({}),
      setAssistantHealth: (next) => setHealth(next),
    }),
    [],
  );

  const envelope = useMemo<OpsAssistantContext>(
    () => ({
      route: pathname,
      ...(scope.board ? { board: scope.board } : {}),
      ...(scope.activeTab ? { activeTab: scope.activeTab } : {}),
      ...(selection ? { selectedEntity: selection } : {}),
      ...(scope.visibleFilters ? { visibleFilters: scope.visibleFilters } : {}),
      identity,
      health,
      locale,
    }),
    [pathname, scope, selection, identity, health, locale],
  );

  return (
    <ActionsContext.Provider value={actions}>
      <EnvelopeContext.Provider value={envelope}>
        {children}
      </EnvelopeContext.Provider>
    </ActionsContext.Provider>
  );
}

/**
 * Read the live Context Envelope. Returns `null` outside a provider (e.g. in an
 * isolated render or test) so consumers can degrade rather than crash.
 */
export function useOpsAssistantContext(): OpsAssistantContext | null {
  return useContext(EnvelopeContext);
}

/**
 * Stable setters for publishing selection / scope / health. Safe to call
 * outside a provider (no-ops), so pages can wire publishing unconditionally.
 */
export function useOpsAssistantContextActions(): OpsAssistantContextActions {
  return useContext(ActionsContext);
}

/**
 * Convenience hook for the most common case: a page publishing the row/detail
 * in focus. Pair with `useEffect` to publish on focus/mount and clear on
 * unmount, or use the declarative `<PublishAssistantSelection>` component.
 */
export function useAssistantSelection(): Pick<
  OpsAssistantContextActions,
  "setAssistantSelection" | "clearAssistantSelection"
> {
  const { setAssistantSelection, clearAssistantSelection } =
    useContext(ActionsContext);
  return { setAssistantSelection, clearAssistantSelection };
}

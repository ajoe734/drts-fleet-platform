"use client";

/**
 * Declarative selection/scope publishers (design handoff §6.1).
 *
 * Server-rendered detail and board pages cannot call hooks directly. They embed
 * these tiny client components to publish the §5 envelope's selection/scope on
 * mount and clear it on unmount — the same way the incident detail page embeds
 * `IncidentRefreshTier`. Interactive client components (e.g. the dispatch
 * workflow) should instead call `useAssistantSelection()` directly so selection
 * tracks row focus as it changes.
 */

import { useEffect } from "react";
import type { AssistantEntityKind, AssistantScope } from "./context-envelope";
import { useOpsAssistantContextActions } from "./assistant-context-provider";

export interface PublishAssistantSelectionProps {
  kind: AssistantEntityKind;
  id: string;
}

/**
 * Publishes `{kind, id}` as the focused entity for as long as it is mounted,
 * making "this {kind}" deixis resolvable. Clears on unmount or when the
 * kind/id changes.
 */
export function PublishAssistantSelection({
  kind,
  id,
}: PublishAssistantSelectionProps) {
  const { setAssistantSelection, clearAssistantSelection } =
    useOpsAssistantContextActions();

  useEffect(() => {
    if (!id) {
      return;
    }
    setAssistantSelection({ kind, id });
    return () => clearAssistantSelection();
  }, [kind, id, setAssistantSelection, clearAssistantSelection]);

  return null;
}

export interface PublishAssistantScopeProps {
  board?: string;
  activeTab?: string;
  visibleFilters?: Record<string, string | string[]>;
}

/**
 * Publishes board / activeTab / visibleFilters scope while mounted. Useful for
 * server-rendered board pages whose active board is fixed by the route or
 * search params. Clears the published keys on unmount.
 */
export function PublishAssistantScope({
  board,
  activeTab,
  visibleFilters,
}: PublishAssistantScopeProps) {
  const { setAssistantScope, clearAssistantScope } =
    useOpsAssistantContextActions();

  // Serialize for a stable effect dependency without re-running on identity
  // changes of an equivalent filters object.
  const filtersKey = visibleFilters
    ? JSON.stringify(visibleFilters)
    : undefined;

  useEffect(() => {
    const scope: AssistantScope = {};
    if (board) {
      scope.board = board;
    }
    if (activeTab) {
      scope.activeTab = activeTab;
    }
    if (visibleFilters) {
      scope.visibleFilters = visibleFilters;
    }
    setAssistantScope(scope);
    return () => clearAssistantScope();
    // visibleFilters is intentionally read through filtersKey to avoid
    // re-running on object-identity churn of an equivalent filters object.
  }, [board, activeTab, filtersKey, setAssistantScope, clearAssistantScope]);

  return null;
}

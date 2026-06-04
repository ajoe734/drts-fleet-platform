"use client";

import type { ResourceActionDescriptor } from "@drts/contracts";
import type {
  AssistantActionBridge,
  OpsAssistantContext,
} from "./context-envelope";

export type AssistantHelpResult = {
  message: string;
  meta: string;
};

type HelpDoc = {
  title: string;
  citation: string;
  keywords: string[];
  answer: string;
};

const HELP_DOCS: HelpDoc[] = [
  {
    title: "Dashboard refresh tier",
    citation: "apps/ops-console-web/app/dashboard/page.tsx:1645",
    keywords: ["dashboard", "refresh", "tier", "stale", "cadence"],
    answer:
      "The dashboard is a T3 surface with refresh-tier and stale-data affordances surfaced in the shell summary.",
  },
  {
    title: "Complaint action bridge",
    citation: "apps/ops-console-web/app/complaints/page.tsx:1122",
    keywords: ["complaint", "case", "action", "scope", "available"],
    answer:
      "Complaint assistant actions are scoped to the selected case and reuse the page's existing action descriptors instead of inventing new writes.",
  },
  {
    title: "Incident confirmation flow",
    citation:
      "apps/ops-console-web/app/incidents/[incidentId]/incident-detail-action-panel.tsx:257",
    keywords: ["incident", "confirm", "risk", "audit", "reason"],
    answer:
      "Incident actions remain confirmation-gated: the assistant resolves to the page action flow, which keeps risk and reason requirements intact.",
  },
];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function scoreDoc(query: string, doc: HelpDoc) {
  const normalized = normalize(query);
  return doc.keywords.reduce(
    (score, keyword) => score + (normalized.includes(keyword) ? 1 : 0),
    0,
  );
}

function summarizeActions(descriptors: ResourceActionDescriptor[]) {
  return descriptors
    .map((descriptor) => {
      const risk = descriptor.requiresReason
        ? `${descriptor.riskLevel} / reason`
        : descriptor.riskLevel;
      const enabled = descriptor.enabled
        ? "enabled"
        : `disabled:${descriptor.disabledReasonCode ?? "unavailable"}`;
      return `${descriptor.action} (${risk}, ${enabled})`;
    })
    .join(", ");
}

export function buildTier0HelpResult(query: string): AssistantHelpResult {
  const ranked = [...HELP_DOCS]
    .map((doc) => ({ doc, score: scoreDoc(query, doc) }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0]?.doc ?? HELP_DOCS[0]!;
  return {
    message: best.answer,
    meta: `Citation: ${best.citation}`,
  };
}

export function buildTier1ScopedResult(
  context: OpsAssistantContext | null,
  actionBridge: AssistantActionBridge | null,
): AssistantHelpResult | null {
  if (!context?.selectedEntity && !actionBridge) {
    return null;
  }

  const scope =
    context?.selectedEntity ??
    (actionBridge
      ? {
          kind: actionBridge.resourceKind,
          id: actionBridge.resourceId,
        }
      : null);

  if (!scope) {
    return null;
  }

  const actionSummary =
    actionBridge && actionBridge.availableActions.length > 0
      ? summarizeActions(actionBridge.availableActions)
      : "No registered page actions for this scope.";

  return {
    message: `Scoped to ${scope.kind}:${scope.id}. The assistant is constrained to this visible resource and can only reuse the page's registered actions.`,
    meta: `Scope: ${scope.kind}:${scope.id} | availableActions: ${actionSummary}`,
  };
}

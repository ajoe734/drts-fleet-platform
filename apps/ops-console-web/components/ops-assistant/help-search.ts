"use client";

import type { ResourceActionDescriptor } from "@drts/contracts";
import { t, type Locale } from "@/lib/translations";
import type {
  AssistantActionBridge,
  OpsAssistantContext,
} from "./context-envelope";

export type AssistantHelpResult = {
  message: string;
  meta: string;
};

type HelpDoc = {
  citation: string;
  keywords: string[];
  answerKey: string;
};

const HELP_DOCS: HelpDoc[] = [
  {
    citation: "apps/ops-console-web/app/dashboard/page.tsx:1645",
    keywords: ["dashboard", "refresh", "tier", "stale", "cadence"],
    answerKey: "assistant.help.dashboard.answer",
  },
  {
    citation: "apps/ops-console-web/app/complaints/page.tsx:1122",
    keywords: ["complaint", "case", "action", "scope", "available"],
    answerKey: "assistant.help.complaint.answer",
  },
  {
    citation:
      "apps/ops-console-web/app/incidents/[incidentId]/incident-detail-action-panel.tsx:257",
    keywords: ["incident", "confirm", "risk", "audit", "reason"],
    answerKey: "assistant.help.incident.answer",
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

function summarizeActions(
  descriptors: ResourceActionDescriptor[],
  locale: Locale,
) {
  return descriptors
    .map((descriptor) => {
      const risk = descriptor.requiresReason
        ? t("assistant.help.actionRiskReason", locale, {
            riskLevel: descriptor.riskLevel,
          })
        : descriptor.riskLevel;
      const enabled = descriptor.enabled
        ? t("common.enabled", locale)
        : t("assistant.help.actionDisabled", locale, {
            status: t("common.disabled", locale),
            reason:
              descriptor.disabledReasonCode ?? t("common.unknown", locale),
          });
      return t("assistant.help.actionSummary", locale, {
        action: descriptor.action,
        risk,
        enabledState: enabled,
      });
    })
    .join(", ");
}

export function buildTier0HelpResult(
  query: string,
  locale: Locale,
): AssistantHelpResult {
  const ranked = [...HELP_DOCS]
    .map((doc) => ({ doc, score: scoreDoc(query, doc) }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0]?.doc ?? HELP_DOCS[0]!;
  return {
    message: t(best.answerKey, locale),
    meta: t("assistant.help.citation", locale, { citation: best.citation }),
  };
}

export function buildTier1ScopedResult(
  context: OpsAssistantContext | null,
  actionBridge: AssistantActionBridge | null,
): AssistantHelpResult | null {
  if (!context?.selectedEntity && !actionBridge) {
    return null;
  }

  const locale = context?.locale ?? "en";

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
      ? summarizeActions(actionBridge.availableActions, locale)
      : t("assistant.scope.noActions", locale);

  return {
    message: t("assistant.scope.message", locale, {
      kind: scope.kind,
      id: scope.id,
    }),
    meta: t("assistant.scope.meta", locale, {
      kind: scope.kind,
      id: scope.id,
      actions: actionSummary,
    }),
  };
}

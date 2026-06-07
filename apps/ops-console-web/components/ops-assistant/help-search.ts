"use client";

import type { ResourceActionDescriptor } from "@drts/contracts";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
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
  answer: Record<Locale, string>;
};

const HELP_DOCS: HelpDoc[] = [
  {
    title: "Dashboard refresh tier",
    citation: "apps/ops-console-web/app/dashboard/page.tsx:1645",
    keywords: ["dashboard", "refresh", "tier", "stale", "cadence"],
    answer: {
      en: "The dashboard is a T3 surface with refresh-tier and stale-data affordances surfaced in the shell summary.",
      zh: "儀表板屬於 T3 畫面，刷新層級與資料過舊提示會顯示在外框摘要中。",
    },
  },
  {
    title: "Complaint action bridge",
    citation: "apps/ops-console-web/app/complaints/page.tsx:1122",
    keywords: ["complaint", "case", "action", "scope", "available"],
    answer: {
      en: "Complaint assistant actions are scoped to the selected case and reuse the page's existing action descriptors instead of inventing new writes.",
      zh: "客訴助理動作會限定在目前選取案件，並沿用頁面既有動作描述，不會自行新增寫入操作。",
    },
  },
  {
    title: "Incident confirmation flow",
    citation:
      "apps/ops-console-web/app/incidents/[incidentId]/incident-detail-action-panel.tsx:257",
    keywords: ["incident", "confirm", "risk", "audit", "reason"],
    answer: {
      en: "Incident actions remain confirmation-gated: the assistant resolves to the page action flow, which keeps risk and reason requirements intact.",
      zh: "事故動作仍會經過確認流程；助理只會導回頁面既有動作流程，因此風險與原因要求都會保留。",
    },
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

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function summarizeActions(
  locale: Locale,
  descriptors: ResourceActionDescriptor[],
) {
  return descriptors
    .map((descriptor) => {
      const risk = descriptor.requiresReason
        ? copy(
            locale,
            `${formatOpsCodeLabel(locale, descriptor.riskLevel)} risk, reason required`,
            `${formatOpsCodeLabel(locale, descriptor.riskLevel)}風險，需要原因`,
          )
        : copy(
            locale,
            `${formatOpsCodeLabel(locale, descriptor.riskLevel)} risk`,
            `${formatOpsCodeLabel(locale, descriptor.riskLevel)}風險`,
          );
      const enabled = descriptor.enabled
        ? copy(locale, "enabled", "已啟用")
        : copy(
            locale,
            `disabled: ${formatOpsCodeLabel(locale, descriptor.disabledReasonCode ?? "unavailable")}`,
            `已停用：${formatOpsCodeLabel(locale, descriptor.disabledReasonCode ?? "unavailable")}`,
          );
      return `${formatOpsCodeLabel(locale, descriptor.action)} (${risk}, ${enabled})`;
    })
    .join(locale === "zh" ? "、" : ", ");
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
    message: best.answer[locale],
    meta: copy(locale, `Citation: ${best.citation}`, `引用：${best.citation}`),
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

  const locale = context?.locale ?? "en";
  const actionSummary =
    actionBridge && actionBridge.availableActions.length > 0
      ? summarizeActions(locale, actionBridge.availableActions)
      : copy(
          locale,
          "No registered page actions for this scope.",
          "此範圍目前沒有已註冊的頁面動作。",
        );
  const scopeLabel = formatOpsCodeLabel(locale, scope.kind);

  return {
    message: copy(
      locale,
      `Scoped to ${scopeLabel} ${scope.id}. The assistant is constrained to this visible resource and can only reuse the page's registered actions.`,
      `目前範圍為${scopeLabel} ${scope.id}。助理只能針對畫面上選取的資源，沿用此頁已註冊的動作。`,
    ),
    meta: copy(
      locale,
      `Scope: ${scopeLabel} ${scope.id} | Available actions: ${actionSummary}`,
      `範圍：${scopeLabel} ${scope.id}；可用動作：${actionSummary}`,
    ),
  };
}

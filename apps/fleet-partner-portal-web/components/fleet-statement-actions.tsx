"use client";

import { useEffect, useState } from "react";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import type { FleetStatement } from "@/lib/fleet-portal-fixtures";
import {
  buildStatementArtifactContent,
  buildStatementDecisionRequestContent,
  buildStatementStorageKey,
  parseStatementDecisionMap,
  type StatementDecision,
} from "@/lib/fleet-portal-statement-actions";
import { useTranslation } from "@/lib/i18n";
import { FleetActionButton } from "./fleet-action-button";

const STATEMENT_DECISION_EVENT = "fleet-statement-decision";

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatTimestamp(iso: string): string {
  return iso.replace("T", " ").replace(/\.\d+Z$/, "Z");
}

function getDecisionLabel(
  decision: StatementDecision["decision"],
  t: (key: string, params?: Record<string, string>) => string,
) {
  return decision === "confirmed"
    ? t("statements.request.confirmed")
    : t("statements.request.disputed");
}

export function StatementDecisionNote({
  fleetPartnerId,
  statementId,
}: {
  fleetPartnerId: string;
  statementId: string;
}) {
  const theme = buildFleetTheme();
  const { t } = useTranslation();
  const [note, setNote] = useState<StatementDecision | null>(null);

  useEffect(() => {
    const syncFromStorage = () => {
      const stored = parseStatementDecisionMap(
        window.localStorage.getItem(buildStatementStorageKey(fleetPartnerId)),
      );
      setNote(stored[statementId] ?? null);
    };
    syncFromStorage();
    window.addEventListener(STATEMENT_DECISION_EVENT, syncFromStorage);
    return () =>
      window.removeEventListener(STATEMENT_DECISION_EVENT, syncFromStorage);
  }, [fleetPartnerId, statementId]);

  if (!note) {
    return null;
  }

  return (
    <div style={{ fontSize: 11, color: theme.textDim, marginTop: 4 }}>
      {t("statements.request.persistedNote", {
        action: getDecisionLabel(note.decision, t),
        at: formatTimestamp(note.requestedAt),
      })}
    </div>
  );
}

export function FleetStatementActions({
  fleetPartnerId,
  statement,
  size = "xs",
}: {
  fleetPartnerId: string;
  statement: FleetStatement;
  size?: "xs" | "sm" | "md";
}) {
  const { locale, t } = useTranslation();
  const [decisions, setDecisions] = useState<Record<string, StatementDecision>>(
    {},
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    setDecisions(
      parseStatementDecisionMap(
        window.localStorage.getItem(buildStatementStorageKey(fleetPartnerId)),
      ),
    );
  }, [fleetPartnerId]);

  const persistedDecision = decisions[statement.id];

  const writeDecision = (decision: StatementDecision) => {
    const next = {
      ...decisions,
      [statement.id]: decision,
    };
    window.localStorage.setItem(
      buildStatementStorageKey(fleetPartnerId),
      JSON.stringify(next),
    );
    window.dispatchEvent(new CustomEvent(STATEMENT_DECISION_EVENT));
    setDecisions(next);
  };

  const downloadArtifact = () => {
    setPendingAction("download");
    try {
      triggerDownload(
        `${statement.id}-artifact.txt`,
        buildStatementArtifactContent({
          fleetPartnerId,
          statement,
          downloadedAt: new Date().toISOString(),
        }),
      );
    } finally {
      setPendingAction(null);
    }
  };

  const submitDecision = (decision: StatementDecision["decision"]) => {
    const reasonPromptKey =
      decision === "confirmed"
        ? "statements.request.confirmPrompt"
        : "statements.request.disputePrompt";
    const reason = window.prompt(t(reasonPromptKey));
    if (reason === null) {
      return;
    }
    const trimmedReason = reason.trim();
    if (decision === "confirmed" && trimmedReason.length === 0) {
      window.alert(t("statements.request.confirmReasonRequired"));
      return;
    }
    const nextDecision: StatementDecision = {
      decision,
      requestedAt: new Date().toISOString(),
      ...(trimmedReason ? { reason: trimmedReason } : {}),
    };
    setPendingAction(decision);
    try {
      writeDecision(nextDecision);
      triggerDownload(
        `${statement.id}-${decision}-request.txt`,
        buildStatementDecisionRequestContent({
          fleetPartnerId,
          statement,
          decision: nextDecision,
        }),
      );
    } finally {
      setPendingAction(null);
    }
  };

  const confirmDisabledReason =
    statement.status === "paid"
      ? t("actions.reason.statementPaid")
      : persistedDecision?.decision === "confirmed"
        ? t("actions.reason.statementAlreadyConfirmed")
        : persistedDecision?.decision === "disputed"
          ? t("actions.reason.statementDisputeOpen")
          : undefined;

  const disputeDisabledReason =
    statement.status === "paid"
      ? t("actions.reason.statementPaid")
      : persistedDecision?.decision === "confirmed"
        ? t("actions.reason.statementAlreadyConfirmed")
        : persistedDecision?.decision === "disputed"
          ? t("actions.reason.statementDisputeOpen")
          : undefined;

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      <FleetActionButton
        descriptor={{ action: "download", enabled: true, riskLevel: "low" }}
        label={t("actions.download")}
        {...(locale === "zh" ? { en: "download" } : {})}
        size={size}
        pending={pendingAction === "download"}
        onClick={downloadArtifact}
      />
      <FleetActionButton
        descriptor={{
          action: "dispute",
          enabled: !disputeDisabledReason,
          ...(disputeDisabledReason
            ? { disabledReasonCode: disputeDisabledReason }
            : {}),
          riskLevel: "medium",
        }}
        label={t("revenue.dispute")}
        {...(locale === "zh" ? { en: "dispute" } : {})}
        size={size}
        pending={pendingAction === "disputed"}
        onClick={() => submitDecision("disputed")}
      />
      <FleetActionButton
        descriptor={{
          action: "confirm",
          enabled: !confirmDisabledReason,
          ...(confirmDisabledReason
            ? { disabledReasonCode: confirmDisabledReason }
            : {}),
          riskLevel: "high",
          requiresReason: true,
        }}
        label={t("actions.confirm")}
        {...(locale === "zh" ? { en: "confirm" } : {})}
        size={size}
        pending={pendingAction === "confirmed"}
        onClick={() => submitDecision("confirmed")}
      />
    </div>
  );
}

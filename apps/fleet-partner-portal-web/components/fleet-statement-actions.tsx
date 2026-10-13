"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import type {
  FleetStatement,
  FleetStatementDecision,
} from "@/lib/fleet-portal-fixtures";
import { mapStatementDecision } from "@/lib/fleet-portal-statement-actions";
import { submitStatementDecision } from "@/app/statements/actions";
import { useTranslation } from "@/lib/i18n";
import { FleetActionButton } from "./fleet-action-button";

function formatTimestamp(iso: string): string {
  return iso.replace("T", " ").replace(/\.\d+Z$/, "Z");
}

export function StatementDecisionNote({
  statement,
}: {
  statement: FleetStatementDecision;
}) {
  const theme = buildFleetTheme();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const status = statement.decisionStatus;
  if (status !== "confirmed" && status !== "disputed") return null;
  const at =
    status === "confirmed" ? statement.confirmedAt : statement.disputedAt;
  const by =
    status === "confirmed" ? statement.confirmedBy : statement.disputedBy;
  const note =
    status === "confirmed" ? statement.confirmNote : statement.disputeReason;
  const query = searchParams.toString();
  return (
    <div style={{ fontSize: 11, color: theme.textDim, marginTop: 4 }}>
      <div>
        {t(`statements.request.${status}`)}
        {at ? ` · ${formatTimestamp(at)}` : ""}
        {by ? ` · ${by}` : ""}
      </div>
      {note ? <div style={{ whiteSpace: "pre-wrap" }}>{note}</div> : null}
      {statement.disputeCaseId ? (
        <Link
          href={`/cases/${encodeURIComponent(statement.disputeCaseId)}${query ? `?${query}` : ""}`}
          style={{ color: theme.accent }}
        >
          {t("statements.request.openCase", { id: statement.disputeCaseId })}
        </Link>
      ) : null}
    </div>
  );
}

export function FleetStatementActions({
  fleetPartnerId,
  statement,
  available = true,
  size = "xs",
}: {
  fleetPartnerId: string;
  statement: FleetStatement;
  available?: boolean;
  size?: "xs" | "sm" | "md";
}) {
  const theme = buildFleetTheme();
  const { locale, t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [saved, setSaved] = useState<{
    fleetPartnerId: string;
    statementId: string;
    decision: FleetStatementDecision;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retryText = useRef({ confirmed: "", disputed: "" });
  const submitting = useRef(false);
  const savedDecision =
    saved?.fleetPartnerId === fleetPartnerId &&
    saved.statementId === statement.id
      ? saved.decision
      : null;
  const currentDecision = savedDecision ?? statement;
  const disabledReason = !available
    ? t("statements.request.unavailable")
    : statement.status === "paid"
      ? t("actions.reason.statementPaid")
      : currentDecision.decisionStatus === "confirmed"
        ? t("actions.reason.statementAlreadyConfirmed")
        : currentDecision.decisionStatus === "disputed"
          ? t("actions.reason.statementDisputeOpen")
          : undefined;

  const downloadArtifact = () => {
    const query = new URLSearchParams(searchParams.toString());
    query.set("statementId", statement.id);
    const anchor = document.createElement("a");
    anchor.href = `/statements/export?${query.toString()}`;
    anchor.download = `${statement.id}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const submitDecision = async (decision: "confirmed" | "disputed") => {
    if (submitting.current || disabledReason) return;
    const text = window.prompt(
      t(
        decision === "confirmed"
          ? "statements.request.confirmPrompt"
          : "statements.request.disputePrompt",
      ),
      retryText.current[decision],
    );
    if (text === null) return;
    retryText.current[decision] = text;
    if (decision === "disputed" && !text.trim()) {
      setError(t("statements.request.disputeReasonRequired"));
      return;
    }
    submitting.current = true;
    setPendingAction(decision);
    setError(null);
    try {
      const result = await submitStatementDecision(
        statement.id,
        decision,
        text,
      );
      if (!result.ok) {
        setError(t("statements.request.failed", { detail: result.error }));
        return;
      }
      setSaved({
        fleetPartnerId,
        statementId: statement.id,
        decision: mapStatementDecision(result.statement),
      });
      router.refresh();
    } catch (error) {
      setError(
        t("statements.request.failed", {
          detail:
            error instanceof Error
              ? error.message
              : t("statements.request.retry"),
        }),
      );
    } finally {
      submitting.current = false;
      setPendingAction(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <FleetActionButton
          descriptor={{
            action: "download",
            enabled: available,
            riskLevel: "low",
            ...(!available
              ? { disabledReasonCode: t("statements.request.unavailable") }
              : {}),
          }}
          label={t("actions.download")}
          {...(locale === "zh" ? { en: "download" } : {})}
          size={size}
          onClick={downloadArtifact}
        />
        <FleetActionButton
          descriptor={{
            action: "dispute",
            enabled: !disabledReason,
            ...(disabledReason ? { disabledReasonCode: disabledReason } : {}),
            riskLevel: "medium",
            requiresReason: true,
          }}
          label={t("revenue.dispute")}
          {...(locale === "zh" ? { en: "dispute" } : {})}
          size={size}
          pending={pendingAction !== null}
          onClick={() => void submitDecision("disputed")}
        />
        <FleetActionButton
          descriptor={{
            action: "confirm",
            enabled: !disabledReason,
            ...(disabledReason ? { disabledReasonCode: disabledReason } : {}),
            riskLevel: "high",
          }}
          label={t("actions.confirm")}
          {...(locale === "zh" ? { en: "confirm" } : {})}
          size={size}
          pending={pendingAction !== null}
          onClick={() => void submitDecision("confirmed")}
        />
      </div>
      {error ? (
        <div
          role="alert"
          style={{ fontSize: 12, marginTop: 4, color: theme.danger }}
        >
          {error}
        </div>
      ) : null}
      {savedDecision &&
      savedDecision.decisionStatus !== statement.decisionStatus ? (
        <StatementDecisionNote statement={savedDecision} />
      ) : null}
    </div>
  );
}

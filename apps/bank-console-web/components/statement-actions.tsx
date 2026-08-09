"use client";

import { useState } from "react";
import type { BankStatement } from "@/lib/bank-dev-read-models";
import {
  buildStatementArtifactContent,
  buildStatementArtifactFilename,
  buildTripArtifactContent,
  buildTripArtifactFilename,
  buildTripCsvContent,
  buildTripCsvFilename,
} from "@/lib/statement-artifacts";

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ActionButton({
  label,
  disabledLabel,
  disabled,
  variant = "ghost",
  onDownload,
}: {
  label: string;
  disabledLabel: string;
  disabled: boolean;
  variant?: "ghost" | "primary";
  onDownload: () => { filename: string; content: string };
}) {
  const [pending, setPending] = useState(false);

  return (
    <button
      className={`table-action-button is-${variant}`}
      disabled={disabled || pending}
      onClick={() => {
        setPending(true);
        try {
          const { filename, content } = onDownload();
          triggerDownload(filename, content);
        } finally {
          setPending(false);
        }
      }}
      type="button"
    >
      {disabled ? disabledLabel : label}
    </button>
  );
}

export function StatementArtifactDownloadButton({
  tenantIssuerCode,
  statement,
  label,
  disabledLabel,
  disabled,
  variant = "ghost",
}: {
  tenantIssuerCode: string;
  statement: BankStatement;
  label: string;
  disabledLabel: string;
  disabled: boolean;
  variant?: "ghost" | "primary";
}) {
  return (
    <ActionButton
      disabled={disabled}
      disabledLabel={disabledLabel}
      label={label}
      onDownload={() => ({
        filename: buildStatementArtifactFilename(statement),
        content: buildStatementArtifactContent({
          tenantIssuerCode,
          statement,
          downloadedAt: new Date().toISOString(),
        }),
      })}
      variant={variant}
    />
  );
}

export function StatementCsvExportButton({
  statement,
  label,
  disabledLabel,
  disabled,
  variant = "primary",
}: {
  statement: BankStatement;
  label: string;
  disabledLabel: string;
  disabled: boolean;
  variant?: "ghost" | "primary";
}) {
  return (
    <ActionButton
      disabled={disabled}
      disabledLabel={disabledLabel}
      label={label}
      onDownload={() => ({
        filename: buildTripCsvFilename(statement),
        content: buildTripCsvContent({
          statement,
          downloadedAt: new Date().toISOString(),
        }),
      })}
      variant={variant}
    />
  );
}

export function TripArtifactDownloadButton({
  statement,
  trip,
  label,
  disabledLabel,
  disabled,
}: {
  statement: Pick<BankStatement, "statementNo" | "period">;
  trip: BankStatement["trips"][number];
  label: string;
  disabledLabel: string;
  disabled: boolean;
}) {
  return (
    <ActionButton
      disabled={disabled}
      disabledLabel={disabledLabel}
      label={label}
      onDownload={() => ({
        filename: buildTripArtifactFilename(trip.tripId),
        content: buildTripArtifactContent({
          statement,
          trip,
          downloadedAt: new Date().toISOString(),
        }),
      })}
      variant="ghost"
    />
  );
}

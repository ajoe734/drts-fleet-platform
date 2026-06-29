import type { SubmitSafetyOperatorTakeoverReportCommand } from "@drts/contracts";

export interface SafetyOperatorTakeoverTimeCorrection {
  editedAt: string;
  previousOccurredAt: string;
  nextOccurredAt: string;
}

export interface SafetyOperatorTakeoverDraftAudit {
  originalSystemOccurredAt: string;
  correctedOccurredAt: string;
  corrections: SafetyOperatorTakeoverTimeCorrection[];
}

export interface SafetyOperatorQueuedTakeoverReport {
  command: SubmitSafetyOperatorTakeoverReportCommand;
  draftAudit: SafetyOperatorTakeoverDraftAudit;
}

export function createSafetyOperatorTakeoverDraftAudit(
  originalSystemOccurredAt = new Date().toISOString(),
): SafetyOperatorTakeoverDraftAudit {
  return {
    originalSystemOccurredAt,
    correctedOccurredAt: originalSystemOccurredAt,
    corrections: [],
  };
}

export function applySafetyOperatorTakeoverCorrection(
  draftAudit: SafetyOperatorTakeoverDraftAudit,
  nextOccurredAt: string,
  editedAt = new Date().toISOString(),
): SafetyOperatorTakeoverDraftAudit {
  const trimmedOccurredAt = nextOccurredAt.trim();
  if (!trimmedOccurredAt) {
    throw new Error("接管發生時間不得為空。");
  }

  if (trimmedOccurredAt === draftAudit.correctedOccurredAt) {
    return draftAudit;
  }

  return {
    ...draftAudit,
    correctedOccurredAt: trimmedOccurredAt,
    corrections: [
      ...draftAudit.corrections,
      {
        editedAt,
        previousOccurredAt: draftAudit.correctedOccurredAt,
        nextOccurredAt: trimmedOccurredAt,
      },
    ],
  };
}

export function buildSafetyOperatorQueuedTakeoverReport(
  command: SubmitSafetyOperatorTakeoverReportCommand,
  draftAudit: SafetyOperatorTakeoverDraftAudit,
): SafetyOperatorQueuedTakeoverReport {
  return {
    command,
    draftAudit,
  };
}

export function parseSafetyOperatorQueuedTakeoverReport(
  payload: unknown,
): SafetyOperatorQueuedTakeoverReport {
  if (
    payload != null &&
    typeof payload === "object" &&
    "command" in payload &&
    "draftAudit" in payload
  ) {
    const queued = payload as Partial<SafetyOperatorQueuedTakeoverReport>;
    if (
      queued.command?.clientGeneratedReportId &&
      queued.draftAudit?.originalSystemOccurredAt &&
      queued.draftAudit?.correctedOccurredAt &&
      Array.isArray(queued.draftAudit.corrections)
    ) {
      return queued as SafetyOperatorQueuedTakeoverReport;
    }
  }

  const command = payload as SubmitSafetyOperatorTakeoverReportCommand;
  return {
    command,
    draftAudit: createSafetyOperatorTakeoverDraftAudit(command.occurredAt),
  };
}

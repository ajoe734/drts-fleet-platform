import type { CreateSafetyOperatorTripCloseoutCommand } from "@drts/contracts";

import type { SafetyOperatorQueueEntry } from "@/lib/safety-operator-offline-queue";

export interface SafetyOperatorQueuedShiftHandover {
  command: CreateSafetyOperatorTripCloseoutCommand;
  pendingTakeoverClientGeneratedIds: string[];
}

interface TakeoverReceiptLike {
  reportId?: string;
}

export function buildSafetyOperatorQueuedShiftHandover(
  command: CreateSafetyOperatorTripCloseoutCommand,
  pendingTakeoverClientGeneratedIds: string[],
): SafetyOperatorQueuedShiftHandover {
  return {
    command,
    pendingTakeoverClientGeneratedIds: [
      ...new Set(
        pendingTakeoverClientGeneratedIds
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ],
  };
}

export function parseSafetyOperatorQueuedShiftHandover(
  payload: unknown,
): SafetyOperatorQueuedShiftHandover {
  if (
    payload != null &&
    typeof payload === "object" &&
    "command" in payload &&
    "pendingTakeoverClientGeneratedIds" in payload
  ) {
    const queued = payload as Partial<SafetyOperatorQueuedShiftHandover>;
    if (
      queued.command &&
      Array.isArray(queued.pendingTakeoverClientGeneratedIds)
    ) {
      return {
        command: queued.command,
        pendingTakeoverClientGeneratedIds:
          queued.pendingTakeoverClientGeneratedIds,
      };
    }
  }

  return {
    command: payload as CreateSafetyOperatorTripCloseoutCommand,
    pendingTakeoverClientGeneratedIds: [],
  };
}

export function resolveSafetyOperatorShiftHandoverCommand(
  queuedHandover: SafetyOperatorQueuedShiftHandover,
  queueEntries: SafetyOperatorQueueEntry[],
): {
  command: CreateSafetyOperatorTripCloseoutCommand;
  unresolvedPendingTakeoverIds: string[];
} {
  const takeoverEntries = new Map(
    queueEntries
      .filter((entry) => entry.kind === "takeover_report")
      .map((entry) => [entry.clientGeneratedId, entry] as const),
  );
  const resolvedTakeoverReportIds = new Set(
    queuedHandover.command.takeoverReportIds,
  );
  const unresolvedPendingTakeoverIds: string[] = [];

  for (const clientGeneratedId of queuedHandover.pendingTakeoverClientGeneratedIds) {
    const entry = takeoverEntries.get(clientGeneratedId);
    const reportId = (entry?.receipt as TakeoverReceiptLike | null)?.reportId;
    if (typeof reportId === "string" && reportId.trim()) {
      resolvedTakeoverReportIds.add(reportId.trim());
      continue;
    }
    unresolvedPendingTakeoverIds.push(clientGeneratedId);
  }

  return {
    command: {
      ...queuedHandover.command,
      takeoverReportIds: [...resolvedTakeoverReportIds],
    },
    unresolvedPendingTakeoverIds,
  };
}

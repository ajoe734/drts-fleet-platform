export type PendingCompletionReplayCandidate = {
  taskId: string;
  requestId: string;
};

export function claimPendingCompletionReplayRequest(params: {
  activeTaskId: string | null;
  pending: PendingCompletionReplayCandidate | null;
  inFlightRequestId: string | null;
}): string | null {
  const { activeTaskId, pending, inFlightRequestId } = params;

  if (
    !activeTaskId ||
    !pending ||
    pending.taskId !== activeTaskId ||
    inFlightRequestId === pending.requestId
  ) {
    return null;
  }

  return pending.requestId;
}

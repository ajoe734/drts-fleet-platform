import { useEffect, useRef } from "react";
import type { DriverTaskRecord } from "@drts/contracts";

import type { PendingCompletionReplayCandidate } from "@/lib/pending-completion-replay";
import { claimPendingCompletionReplayRequest } from "@/lib/pending-completion-replay";

type UsePendingCompletionReplayParams = {
  activeTaskId: string | null;
  submittingAction: string | null;
  setSubmittingAction: (action: string | null) => void;
  getPendingCompletion: () => Promise<PendingCompletionReplayCandidate | null>;
  replayPendingCompletion: () => Promise<DriverTaskRecord | null>;
  getIdentityIssue: () => string | null;
  onReplayCompleted: (task: DriverTaskRecord) => Promise<void> | void;
  onIdentityFailure: () => Promise<void> | void;
  onReplayError: (error: unknown) => void;
};

export function usePendingCompletionReplay(
  params: UsePendingCompletionReplayParams,
) {
  const {
    activeTaskId,
    submittingAction,
    setSubmittingAction,
    getPendingCompletion,
    replayPendingCompletion,
    getIdentityIssue,
    onReplayCompleted,
    onIdentityFailure,
    onReplayError,
  } = params;

  const mountedRef = useRef(true);
  const currentTaskIdRef = useRef<string | null>(activeTaskId);
  const inFlightRequestIdRef = useRef<string | null>(null);
  const latestParamsRef = useRef({
    setSubmittingAction,
    getPendingCompletion,
    replayPendingCompletion,
    getIdentityIssue,
    onReplayCompleted,
    onIdentityFailure,
    onReplayError,
  });

  currentTaskIdRef.current = activeTaskId;
  latestParamsRef.current = {
    setSubmittingAction,
    getPendingCompletion,
    replayPendingCompletion,
    getIdentityIssue,
    onReplayCompleted,
    onIdentityFailure,
    onReplayError,
  };

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!activeTaskId || submittingAction) {
      return;
    }

    const replayTaskId = activeTaskId;

    const replayPendingCompletionForTask = async () => {
      let claimedRequestId: string | null = null;
      const latestParams = latestParamsRef.current;

      try {
        const pending = await latestParams.getPendingCompletion();
        claimedRequestId = claimPendingCompletionReplayRequest({
          activeTaskId: replayTaskId,
          pending,
          inFlightRequestId: inFlightRequestIdRef.current,
        });
        if (!claimedRequestId) {
          return;
        }

        inFlightRequestIdRef.current = claimedRequestId;
        latestParams.setSubmittingAction("complete");

        const replayedTask = await latestParams.replayPendingCompletion();
        if (
          !mountedRef.current ||
          currentTaskIdRef.current !== replayTaskId ||
          !replayedTask
        ) {
          return;
        }

        await latestParams.onReplayCompleted(replayedTask);
      } catch (error) {
        if (!mountedRef.current || currentTaskIdRef.current !== replayTaskId) {
          return;
        }

        if (latestParams.getIdentityIssue()) {
          await latestParams.onIdentityFailure();
          return;
        }

        latestParams.onReplayError(error);
      } finally {
        if (
          claimedRequestId &&
          inFlightRequestIdRef.current === claimedRequestId
        ) {
          inFlightRequestIdRef.current = null;
        }

        if (mountedRef.current && currentTaskIdRef.current === replayTaskId) {
          latestParamsRef.current.setSubmittingAction(null);
        }
      }
    };

    void replayPendingCompletionForTask();
  }, [activeTaskId, submittingAction]);
}

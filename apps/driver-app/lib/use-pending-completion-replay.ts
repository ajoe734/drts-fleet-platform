import { useEffect, useRef, useState } from "react";
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

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 60_000];

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
  const submittingActionRef = useRef<string | null>(submittingAction);
  const inFlightRequestIdRef = useRef<string | null>(null);
  const retryRef = useRef<{
    requestId: string;
    failures: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const [retryTick, setRetryTick] = useState(0);
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
  submittingActionRef.current = submittingAction;
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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryRef.current?.timer) clearTimeout(retryRef.current.timer);
      retryRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!activeTaskId || submittingAction) {
      return;
    }

    const replayTaskId = activeTaskId;

    const scheduleRetry = (requestId: string) => {
      const previous = retryRef.current;
      if (previous?.timer) clearTimeout(previous.timer);
      const failures =
        previous?.requestId === requestId ? previous.failures + 1 : 1;
      const delay =
        RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length) - 1];
      const timer = setTimeout(() => {
        if (retryRef.current?.timer === timer) retryRef.current.timer = null;
        if (mountedRef.current) setRetryTick((tick) => tick + 1);
      }, delay);
      retryRef.current = { requestId, failures, timer };
    };

    const replayPendingCompletionForTask = async () => {
      let claimedRequestId: string | null = null;
      const latestParams = latestParamsRef.current;

      try {
        const pending = await latestParams.getPendingCompletion();
        // An action the driver started during the read owns whatever is stored
        // now, and a task opened during the read runs its own replay.
        if (
          !mountedRef.current ||
          submittingActionRef.current ||
          currentTaskIdRef.current !== replayTaskId
        ) {
          return;
        }

        // A failed request waits for its retry timer instead of being resent
        // as soon as the submitting state clears.
        if (
          retryRef.current?.timer &&
          retryRef.current.requestId === pending?.requestId
        ) {
          return;
        }

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
        if (retryRef.current?.timer) clearTimeout(retryRef.current.timer);
        retryRef.current = null;
        if (
          !mountedRef.current ||
          currentTaskIdRef.current !== replayTaskId ||
          !replayedTask
        ) {
          return;
        }

        await latestParams.onReplayCompleted(replayedTask);
      } catch (error) {
        if (claimedRequestId && mountedRef.current) {
          scheduleRetry(claimedRequestId);
        }
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

        // Only the replay that set the submitting state may clear it, and it
        // must clear it even if the driver has since opened another task.
        if (claimedRequestId && mountedRef.current) {
          latestParamsRef.current.setSubmittingAction(null);
        }
      }
    };

    void replayPendingCompletionForTask();
  }, [activeTaskId, submittingAction, retryTick]);
}

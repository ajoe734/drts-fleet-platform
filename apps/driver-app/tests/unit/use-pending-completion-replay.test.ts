import React, { useEffect, useState } from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { DriverTaskRecord } from "@drts/contracts";

import { usePendingCompletionReplay } from "../../lib/use-pending-completion-replay";

type HarnessProps = {
  activeTaskId: string | null;
  getPendingCompletion: () => Promise<{
    taskId: string;
    requestId: string;
  } | null>;
  replayPendingCompletion: () => Promise<DriverTaskRecord | null>;
  getIdentityIssue: () => string | null;
  onReplayCompleted: (task: DriverTaskRecord) => Promise<void> | void;
  onIdentityFailure: () => Promise<void> | void;
  onReplayError: (error: unknown) => void;
  onSubmittingActionChange: (action: string | null) => void;
};

function createDeferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return {
    promise,
    resolve,
    reject,
  };
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

function HookHarness(props: HarnessProps) {
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);

  useEffect(() => {
    props.onSubmittingActionChange(submittingAction);
  }, [props, submittingAction]);

  usePendingCompletionReplay({
    activeTaskId: props.activeTaskId,
    submittingAction,
    setSubmittingAction,
    getPendingCompletion: props.getPendingCompletion,
    replayPendingCompletion: props.replayPendingCompletion,
    getIdentityIssue: props.getIdentityIssue,
    onReplayCompleted: props.onReplayCompleted,
    onIdentityFailure: props.onIdentityFailure,
    onReplayError: props.onReplayError,
  });

  return null;
}

describe("usePendingCompletionReplay", () => {
  it("reaches the success path even after submittingAction rerenders the hook", async () => {
    const replayDeferred = createDeferredPromise<DriverTaskRecord | null>();
    const submittingActions: Array<string | null> = [];
    const onReplayCompleted = vi.fn(async () => {});
    const onIdentityFailure = vi.fn(async () => {});
    const onReplayError = vi.fn();

    await act(async () => {
      create(
        React.createElement(HookHarness, {
          activeTaskId: "task-001",
          getPendingCompletion: vi
            .fn()
            .mockResolvedValueOnce({
              taskId: "task-001",
              requestId: "request-001",
            })
            .mockResolvedValue(null),
          replayPendingCompletion: vi.fn(() => replayDeferred.promise),
          getIdentityIssue: vi.fn(() => null),
          onReplayCompleted,
          onIdentityFailure,
          onReplayError,
          onSubmittingActionChange: (action) => {
            submittingActions.push(action);
          },
        }),
      );
      await flushEffects();
    });

    expect(submittingActions).toContain("complete");
    expect(onReplayCompleted).not.toHaveBeenCalled();

    await act(async () => {
      replayDeferred.resolve({
        taskId: "task-001",
        status: "completed",
      } as DriverTaskRecord);
      await replayDeferred.promise;
      await flushEffects();
    });

    expect(onReplayCompleted).toHaveBeenCalledTimes(1);
    expect(onReplayCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-001",
        status: "completed",
      }),
    );
    expect(onIdentityFailure).not.toHaveBeenCalled();
    expect(onReplayError).not.toHaveBeenCalled();
    expect(submittingActions.slice(-2)).toEqual(["complete", null]);
  });

  it("routes auth failures to onboarding instead of surfacing a generic replay error", async () => {
    let identityIssue: string | null = null;
    const replayDeferred = createDeferredPromise<DriverTaskRecord | null>();
    const submittingActions: Array<string | null> = [];
    const onReplayCompleted = vi.fn(async () => {});
    const onIdentityFailure = vi.fn(async () => {});
    const onReplayError = vi.fn();

    await act(async () => {
      create(
        React.createElement(HookHarness, {
          activeTaskId: "task-001",
          getPendingCompletion: vi
            .fn()
            .mockResolvedValueOnce({
              taskId: "task-001",
              requestId: "request-001",
            })
            .mockResolvedValue(null),
          replayPendingCompletion: vi.fn(async () => {
            identityIssue = "session invalid";
            return replayDeferred.promise;
          }),
          getIdentityIssue: vi.fn(() => identityIssue),
          onReplayCompleted,
          onIdentityFailure,
          onReplayError,
          onSubmittingActionChange: (action) => {
            submittingActions.push(action);
          },
        }),
      );
      await flushEffects();
    });

    await act(async () => {
      replayDeferred.reject(new Error("API error 401: session invalid"));
      try {
        await replayDeferred.promise;
      } catch {
        // The hook handles replay failures internally.
      }
      await flushEffects();
    });

    expect(onIdentityFailure).toHaveBeenCalledTimes(1);
    expect(onReplayCompleted).not.toHaveBeenCalled();
    expect(onReplayError).not.toHaveBeenCalled();
    expect(submittingActions).toContain("complete");
    expect(submittingActions.slice(-1)).toEqual([null]);
  });

  it("can retry the same pending request after a transient replay error settles", async () => {
    const firstReplay = createDeferredPromise<DriverTaskRecord | null>();
    const secondReplay = createDeferredPromise<DriverTaskRecord | null>();
    const replayPendingCompletion = vi
      .fn<() => Promise<DriverTaskRecord | null>>()
      .mockImplementationOnce(() => firstReplay.promise)
      .mockImplementationOnce(() => secondReplay.promise);
    const getPendingCompletion = vi
      .fn<() => Promise<{ taskId: string; requestId: string } | null>>()
      .mockResolvedValueOnce({
        taskId: "task-001",
        requestId: "request-001",
      })
      .mockResolvedValueOnce({
        taskId: "task-001",
        requestId: "request-001",
      })
      .mockResolvedValue(null);
    const onReplayCompleted = vi.fn(async () => {});
    const onIdentityFailure = vi.fn(async () => {});
    const onReplayError = vi.fn();

    await act(async () => {
      create(
        React.createElement(HookHarness, {
          activeTaskId: "task-001",
          getPendingCompletion,
          replayPendingCompletion,
          getIdentityIssue: vi.fn(() => null),
          onReplayCompleted,
          onIdentityFailure,
          onReplayError,
          onSubmittingActionChange: () => {},
        }),
      );
      await flushEffects();
    });

    await act(async () => {
      firstReplay.reject(new Error("network timeout"));
      try {
        await firstReplay.promise;
      } catch {
        // The hook handles replay failures internally.
      }
      await flushEffects();
    });

    expect(onReplayError).toHaveBeenCalledTimes(1);
    expect(replayPendingCompletion).toHaveBeenCalledTimes(2);

    await act(async () => {
      secondReplay.resolve({
        taskId: "task-001",
        status: "completed",
      } as DriverTaskRecord);
      await secondReplay.promise;
      await flushEffects();
    });

    expect(onReplayCompleted).toHaveBeenCalledTimes(1);
    expect(onIdentityFailure).not.toHaveBeenCalled();
  });
});

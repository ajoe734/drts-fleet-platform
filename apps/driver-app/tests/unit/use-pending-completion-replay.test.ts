import React, { useEffect, useState } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  exposeSetSubmittingAction?: (
    setSubmittingAction: (action: string | null) => void,
  ) => void;
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

  useEffect(() => {
    props.exposeSetSubmittingAction?.(setSubmittingAction);
  }, [props]);

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
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("retries a failed request after a growing delay instead of resending at once", async () => {
    vi.useFakeTimers();
    const firstReplay = createDeferredPromise<DriverTaskRecord | null>();
    const secondReplay = createDeferredPromise<DriverTaskRecord | null>();
    const replayPendingCompletion = vi
      .fn<() => Promise<DriverTaskRecord | null>>()
      .mockImplementationOnce(() => firstReplay.promise)
      .mockImplementationOnce(() => secondReplay.promise);
    const getPendingCompletion = vi
      .fn<() => Promise<{ taskId: string; requestId: string } | null>>()
      .mockResolvedValue({
        taskId: "task-001",
        requestId: "request-001",
      });
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
    expect(replayPendingCompletion).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_900);
    });
    expect(replayPendingCompletion).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(replayPendingCompletion).toHaveBeenCalledTimes(2);

    getPendingCompletion.mockResolvedValue(null);
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

  it("leaves a completion the driver submits during the read to that submit", async () => {
    const pendingRead = createDeferredPromise<{
      taskId: string;
      requestId: string;
    } | null>();
    const replayPendingCompletion = vi.fn(async () => null);
    const submittingActions: Array<string | null> = [];
    let setSubmittingAction!: (action: string | null) => void;

    await act(async () => {
      create(
        React.createElement(HookHarness, {
          activeTaskId: "task-001",
          getPendingCompletion: vi
            .fn()
            .mockImplementationOnce(() => pendingRead.promise)
            .mockResolvedValue(null),
          replayPendingCompletion,
          getIdentityIssue: vi.fn(() => null),
          onReplayCompleted: vi.fn(),
          onIdentityFailure: vi.fn(),
          onReplayError: vi.fn(),
          onSubmittingActionChange: (action) => {
            submittingActions.push(action);
          },
          exposeSetSubmittingAction: (setter) => {
            setSubmittingAction = setter;
          },
        }),
      );
      await flushEffects();
    });

    await act(async () => {
      setSubmittingAction("complete");
      await flushEffects();
    });
    await act(async () => {
      pendingRead.resolve({ taskId: "task-001", requestId: "request-001" });
      await pendingRead.promise;
      await flushEffects();
    });

    expect(replayPendingCompletion).not.toHaveBeenCalled();
    expect(submittingActions.slice(-1)).toEqual(["complete"]);
  });

  it("does not clear an action in progress when there is nothing to replay", async () => {
    const pendingRead = createDeferredPromise<null>();
    const submittingActions: Array<string | null> = [];
    let setSubmittingAction!: (action: string | null) => void;

    await act(async () => {
      create(
        React.createElement(HookHarness, {
          activeTaskId: "task-001",
          getPendingCompletion: vi.fn(() => pendingRead.promise),
          replayPendingCompletion: vi.fn(async () => null),
          getIdentityIssue: vi.fn(() => null),
          onReplayCompleted: vi.fn(),
          onIdentityFailure: vi.fn(),
          onReplayError: vi.fn(),
          onSubmittingActionChange: (action) => {
            submittingActions.push(action);
          },
          exposeSetSubmittingAction: (setter) => {
            setSubmittingAction = setter;
          },
        }),
      );
      await flushEffects();
    });

    await act(async () => {
      setSubmittingAction("start");
      await flushEffects();
    });
    await act(async () => {
      pendingRead.resolve(null);
      await pendingRead.promise;
      await flushEffects();
    });

    expect(submittingActions.slice(-1)).toEqual(["start"]);
  });

  it("bounds resends while the server keeps failing", async () => {
    vi.useFakeTimers();
    const replayPendingCompletion = vi.fn(async () => {
      throw new Error("network timeout");
    });

    await act(async () => {
      create(
        React.createElement(HookHarness, {
          activeTaskId: "task-001",
          getPendingCompletion: vi.fn(async () => ({
            taskId: "task-001",
            requestId: "request-001",
          })),
          replayPendingCompletion,
          getIdentityIssue: vi.fn(() => null),
          onReplayCompleted: vi.fn(),
          onIdentityFailure: vi.fn(),
          onReplayError: vi.fn(),
          onSubmittingActionChange: () => {},
        }),
      );
      await flushEffects();
    });
    for (let second = 0; second < 82; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }

    // 0 s, 2 s, 7 s, 22 s, 82 s.
    expect(replayPendingCompletion.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(replayPendingCompletion.mock.calls.length).toBeLessThanOrEqual(5);
  });

  function createSwitchableHarness(
    overrides: Partial<HarnessProps>,
    submittingActions: Array<string | null>,
  ) {
    const props: HarnessProps = {
      activeTaskId: "task-001",
      getPendingCompletion: vi.fn(async () => null),
      replayPendingCompletion: vi.fn(async () => null),
      getIdentityIssue: vi.fn(() => null),
      onReplayCompleted: vi.fn(),
      onIdentityFailure: vi.fn(),
      onReplayError: vi.fn(),
      onSubmittingActionChange: (action) => {
        submittingActions.push(action);
      },
      ...overrides,
    };
    let renderer!: ReturnType<typeof create>;
    return {
      mount: () =>
        act(async () => {
          renderer = create(React.createElement(HookHarness, props));
          await flushEffects();
        }),
      show: (activeTaskId: string | null) =>
        act(async () => {
          renderer.update(
            React.createElement(HookHarness, { ...props, activeTaskId }),
          );
          await flushEffects();
        }),
    };
  }

  it("does not send the previous task's completion when another task opens during the read", async () => {
    const pendingRead = createDeferredPromise<{
      taskId: string;
      requestId: string;
    } | null>();
    const replayPendingCompletion = vi.fn(async () => null);
    const submittingActions: Array<string | null> = [];
    const harness = createSwitchableHarness(
      {
        getPendingCompletion: vi
          .fn()
          .mockImplementationOnce(() => pendingRead.promise)
          .mockResolvedValue({ taskId: "task-001", requestId: "request-001" }),
        replayPendingCompletion,
      },
      submittingActions,
    );
    await harness.mount();
    await harness.show("task-002");
    await act(async () => {
      pendingRead.resolve({ taskId: "task-001", requestId: "request-001" });
      await pendingRead.promise;
      await flushEffects();
    });

    expect(replayPendingCompletion).not.toHaveBeenCalled();
    expect(submittingActions.slice(-1)).toEqual([null]);
  });

  it.each([
    ["another task opens", "task-002"],
    ["the task is cleared by a session failure", null],
  ])("releases the screen when %s during the send", async (_name, nextTask) => {
    const replay = createDeferredPromise<DriverTaskRecord | null>();
    const submittingActions: Array<string | null> = [];
    const harness = createSwitchableHarness(
      {
        getPendingCompletion: vi
          .fn()
          .mockResolvedValue({ taskId: "task-001", requestId: "request-001" }),
        replayPendingCompletion: vi.fn(() => replay.promise),
      },
      submittingActions,
    );
    await harness.mount();
    expect(submittingActions.slice(-1)).toEqual(["complete"]);
    await harness.show(nextTask);
    await act(async () => {
      replay.resolve({
        taskId: "task-001",
        status: "completed",
      } as DriverTaskRecord);
      await replay.promise;
      await flushEffects();
    });

    expect(submittingActions.slice(-1)).toEqual([null]);
  });
});

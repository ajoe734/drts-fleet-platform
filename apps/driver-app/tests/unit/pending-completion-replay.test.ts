import { describe, expect, it } from "vitest";

import { claimPendingCompletionReplayRequest } from "../../lib/pending-completion-replay";

describe("claimPendingCompletionReplayRequest", () => {
  it("claims a matching pending completion when no replay is already in flight", () => {
    expect(
      claimPendingCompletionReplayRequest({
        activeTaskId: "task-001",
        pending: {
          taskId: "task-001",
          requestId: "request-001",
        },
        inFlightRequestId: null,
      }),
    ).toBe("request-001");
  });

  it("suppresses concurrent duplicate replays for the same request id", () => {
    expect(
      claimPendingCompletionReplayRequest({
        activeTaskId: "task-001",
        pending: {
          taskId: "task-001",
          requestId: "request-001",
        },
        inFlightRequestId: "request-001",
      }),
    ).toBeNull();
  });

  it("allows retrying the same pending request after the prior attempt has settled", () => {
    const firstAttempt = claimPendingCompletionReplayRequest({
      activeTaskId: "task-001",
      pending: {
        taskId: "task-001",
        requestId: "request-001",
      },
      inFlightRequestId: null,
    });

    expect(firstAttempt).toBe("request-001");

    const retryAttempt = claimPendingCompletionReplayRequest({
      activeTaskId: "task-001",
      pending: {
        taskId: "task-001",
        requestId: "request-001",
      },
      inFlightRequestId: null,
    });

    expect(retryAttempt).toBe("request-001");
  });

  it("ignores pending completions for another task", () => {
    expect(
      claimPendingCompletionReplayRequest({
        activeTaskId: "task-001",
        pending: {
          taskId: "task-002",
          requestId: "request-001",
        },
        inFlightRequestId: null,
      }),
    ).toBeNull();
  });
});

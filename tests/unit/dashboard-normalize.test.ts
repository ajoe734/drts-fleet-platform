import { describe, expect, it } from "vitest";

import {
  deriveAgentState,
  normalizeWorkerRecords,
  taskDisplayStatus,
} from "../../docs-site/normalize.js";

describe("dashboard worker normalization", () => {
  it("does not let coordination-only workers override a blocked lane", () => {
    const status = {
      agents: [
        {
          name: "Codex",
          status: "idle",
          current_task_ids: [],
          next: "idle",
          last_update: null,
        },
      ],
      tasks: [
        {
          id: "TEN-UI-RD-013",
          owner: "Codex",
          reviewer: "Codex2",
          status: "blocked",
          next: "Waiting for backend contract",
          last_update: "2026-05-17T16:00:00Z",
        },
      ],
    };
    const orchState = {
      workers: {
        "run-chair": {
          agent_id: "codex",
          provider: "codex",
          task_id: null,
          status: "running",
          last_event_at: "2026-05-17T16:05:00Z",
          request_snapshot: {
            metadata: {
              mode: "coordination",
            },
          },
        },
      },
    };

    const agent = deriveAgentState(status, orchState)[0];

    expect(agent.status).toBe("blocked");
    expect(agent.current_task_ids).toEqual(["TEN-UI-RD-013"]);
    expect(agent.live_running_count).toBe(0);
  });

  it("treats owner finalize workers as finalize instead of generic working", () => {
    const status = {
      agents: [
        {
          name: "Codex2",
          status: "idle",
          current_task_ids: [],
          next: "idle",
          last_update: null,
        },
      ],
      tasks: [
        {
          id: "DRV-UI-RD-009-SIDECAR-REVIEW",
          owner: "Codex2",
          reviewer: "Claude",
          status: "review_approved",
          next: "Finalize the approved sidecar packet",
          last_update: "2026-05-17T16:27:23Z",
        },
      ],
    };
    const orchState = {
      workers: {
        "run-finalize": {
          agent_id: "codex2",
          provider: "codex2",
          task_id: "DRV-UI-RD-009-SIDECAR-REVIEW",
          status: "running",
          last_event_at: "2026-05-17T16:30:24Z",
          request_snapshot: {
            metadata: {
              mode: "execution",
            },
          },
        },
      },
    };

    const agent = deriveAgentState(status, orchState)[0];

    expect(agent.status).toBe("finalize");
    expect(agent.current_task_ids).toEqual(["DRV-UI-RD-009-SIDECAR-REVIEW"]);
    expect(agent.live_running_count).toBe(1);
  });

  it("prioritizes incoming review work over unrelated in-progress ownership", () => {
    const status = {
      agents: [
        {
          name: "Claude2",
          status: "idle",
          current_task_ids: [],
          next: "idle",
          last_update: null,
        },
      ],
      tasks: [
        {
          id: "PBK-UI-003",
          owner: "Claude2",
          reviewer: "Codex",
          status: "in_progress",
          next: "Continue implementation",
          last_update: "2026-05-17T16:10:00Z",
        },
        {
          id: "DRV-UI-RD-009",
          owner: "Claude",
          reviewer: "Claude2",
          status: "review",
          next: "Review and approve or reopen",
          last_update: "2026-05-17T16:24:22Z",
        },
      ],
    };

    const agent = deriveAgentState(status, { workers: {} })[0];

    expect(agent.status).toBe("reviewing");
    expect(agent.current_task_ids).toEqual(["DRV-UI-RD-009"]);
  });

  it("demotes stale reviewer workers once the task has moved to review_approved", () => {
    const status = {
      tasks: [
        {
          id: "DRV-UI-RD-009-SIDECAR-REVIEW",
          owner: "Codex2",
          reviewer: "Claude",
          status: "review_approved",
          next: "Finalize the approved sidecar packet",
          last_update: "2026-05-17T16:27:23Z",
        },
      ],
    };
    const orchState = {
      workers: {
        "run-reviewer": {
          agent_id: "claude",
          provider: "claude",
          task_id: "DRV-UI-RD-009-SIDECAR-REVIEW",
          status: "running",
          last_event_at: "2026-05-17T16:28:00Z",
          request_snapshot: {
            metadata: {
              mode: "execution",
            },
          },
        },
      },
    };

    const worker = normalizeWorkerRecords(orchState, status)[0];

    expect(worker.bucket).toBe("completed");
    expect(worker.lane_relevant).toBe(false);
    expect(worker.assignment_phase).toBeNull();
  });

  it("keeps review-approved tasks in finalize while still surfacing active backlog pickup", () => {
    const liveWorker = [{ bucket: "running" }];
    const pendingWorker = [{ bucket: "pending" }];

    expect(
      taskDisplayStatus(
        {
          status: "review_approved",
        },
        liveWorker,
      ),
    ).toBe("review_approved");
    expect(
      taskDisplayStatus(
        {
          status: "backlog",
        },
        pendingWorker,
      ),
    ).toBe("in_progress");
  });
});

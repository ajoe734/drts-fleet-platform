import { createHmac } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PlatformAdminAssistantOrchestratorBridgeService } from "../../src/modules/platform-admin-assistant/platform-admin-assistant.orchestrator-bridge";
import type {
  PlatformAdminAssistantControlPlaneIdentity,
  PlatformAdminAssistantDispatchPacketPayload,
  PlatformAdminAssistantSignedDispatchPacket,
} from "../../src/modules/platform-admin-assistant/platform-admin-assistant.types";

const DISPATCH_SECRET = "dispatch-secret";
const DISPATCH_KEY_ID = "dispatch-key";

function platformActor(): PlatformAdminAssistantControlPlaneIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "platform_admin",
    actorId: "pa-admin-001",
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: ["superadmin"],
    scopes: ["foundation:read", "foundation:write"],
    requestId: "req-bridge-001",
  };
}

function createRoot() {
  const root = mkdtempSync(join(tmpdir(), "pa-assistant-bridge-"));
  mkdirSync(join(root, ".orchestrator", "task-briefs"), { recursive: true });
  writeFileSync(
    join(root, ".orchestrator", "config.json"),
    JSON.stringify({
      paths: {
        status_file: "ai-status.json",
        state_file: ".orchestrator/state.json",
        event_queue: ".orchestrator/event-queue.jsonl",
      },
      branch_strategy: {
        worker_tree_guard: {
          enabled: false,
        },
      },
    }),
    "utf-8",
  );
  writeFileSync(
    join(root, "ai-status.json"),
    JSON.stringify({
      tasks: [
        {
          id: "PA-AI-DEV-001",
          status: "done",
        },
        {
          id: "PA-AI-ORCH-001",
          status: "backlog",
          owner: "Codex2",
          reviewer: "Claude",
          depends_on: ["PA-AI-DEV-001"],
          artifacts: ["apps/api/src/modules/platform-admin-assistant/"],
          next: "Assignment created",
          last_update: "2026-06-03T12:55:30Z",
        },
      ],
    }),
    "utf-8",
  );
  writeFileSync(
    join(root, ".orchestrator", "state.json"),
    JSON.stringify({
      supervisor: {
        lifecycle: "running",
        started_at: "2026-06-03T12:00:00Z",
        last_heartbeat_at: "2026-06-03T12:30:00Z",
      },
      queue: {
        events: {
          "evt-pa-ai-orch-001-owned_ready_dispatch": {
            status: "queued",
          },
        },
      },
      workers: {
        "run-001": {
          task_id: "PA-AI-ORCH-001",
          agent_id: "Codex2",
          status: "running",
          queue_event_id: "evt-pa-ai-orch-001-owned_ready_dispatch",
          last_event_at: "2026-06-03T12:31:00Z",
        },
      },
    }),
    "utf-8",
  );
  writeFileSync(
    join(root, ".orchestrator", "event-queue.jsonl"),
    `${JSON.stringify({
      event_id: "evt-pa-ai-orch-001-owned_ready_dispatch",
      task_id: "PA-AI-ORCH-001",
      target_agent: "Codex2",
      reason: "owned_ready_dispatch",
    })}\n`,
    "utf-8",
  );
  return root;
}

function signPacket(
  payload: PlatformAdminAssistantDispatchPacketPayload,
): PlatformAdminAssistantSignedDispatchPacket {
  const stable = stableJson(payload);
  return {
    payload,
    signature: {
      algorithm: "hmac-sha256",
      keyId: DISPATCH_KEY_ID,
      signedAt: payload.createdAt,
      value: createHmac("sha256", DISPATCH_SECRET).update(stable).digest("hex"),
    },
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function packetPayload(
  overrides: Partial<PlatformAdminAssistantDispatchPacketPayload> = {},
): PlatformAdminAssistantDispatchPacketPayload {
  return {
    schema: "assistant_dispatch_packet.v1",
    source: "platform-admin-assistant",
    assistantSessionId: "paas-session-001",
    actorId: "pa-admin-001",
    taskId: "PA-AI-ORCH-001",
    title: "Platform Admin assistant orchestrator bridge",
    summary: "Bridge the assistant to the supervisor queue.",
    owner: "Codex2",
    reviewer: "Claude",
    baseBranch: "dev",
    planningRef:
      "docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md",
    dependencies: ["PA-AI-DEV-001"],
    artifacts: ["apps/api/src/modules/platform-admin-assistant/"],
    acceptance: ["pnpm --filter @drts/api test -- platform-admin-assistant"],
    risk: "medium",
    createdAt: "2026-06-03T12:55:30Z",
    humanConfirmedAt: "2026-06-03T12:55:31Z",
    ...overrides,
  };
}

describe("PlatformAdminAssistantOrchestratorBridgeService", () => {
  it("rejects malformed packet signatures", () => {
    const service = new PlatformAdminAssistantOrchestratorBridgeService({
      statusRoot: createRoot(),
      dispatchSecret: DISPATCH_SECRET,
      dispatchKeyId: DISPATCH_KEY_ID,
    });

    expect(() =>
      service.submitDispatchPacket(platformActor(), {
        dryRun: true,
        packet: {
          ...signPacket(packetPayload()),
          signature: {
            algorithm: "hmac-sha256",
            keyId: DISPATCH_KEY_ID,
            signedAt: "2026-06-03T12:55:30Z",
            value: "invalid",
          },
        },
      }),
    ).toThrow(/signature/i);
  });

  it("rejects unsafe artifact paths", () => {
    const service = new PlatformAdminAssistantOrchestratorBridgeService({
      statusRoot: createRoot(),
      dispatchSecret: DISPATCH_SECRET,
      dispatchKeyId: DISPATCH_KEY_ID,
    });
    const payload = packetPayload({
      artifacts: ["../outside.txt"],
    });

    expect(() =>
      service.submitDispatchPacket(platformActor(), {
        dryRun: true,
        packet: signPacket(payload),
      }),
    ).toThrow(/inside the repository root/i);
  });

  it("builds a dry-run queue preview without mutating the queue", () => {
    const root = createRoot();
    const service = new PlatformAdminAssistantOrchestratorBridgeService({
      statusRoot: root,
      dispatchSecret: DISPATCH_SECRET,
      dispatchKeyId: DISPATCH_KEY_ID,
    });

    const result = service.submitDispatchPacket(platformActor(), {
      dryRun: true,
      packet: signPacket(packetPayload()),
    });

    expect(result).toMatchObject({
      accepted: true,
      dryRun: true,
      taskId: "PA-AI-ORCH-001",
      baseBranch: "dev",
      track: "frontend",
      queued: false,
      treeGuard: {
        blocked: false,
      },
      queueEvent: expect.objectContaining({
        task_id: "PA-AI-ORCH-001",
        target_agent: "Codex2",
        reason: "owned_ready_dispatch",
      }),
    });
  });

  it("reads task, supervisor, queue, and worker status back for the assistant", () => {
    const service = new PlatformAdminAssistantOrchestratorBridgeService({
      statusRoot: createRoot(),
      dispatchSecret: DISPATCH_SECRET,
      dispatchKeyId: DISPATCH_KEY_ID,
    });

    expect(service.getTaskStatus("PA-AI-ORCH-001")).toEqual({
      task: {
        id: "PA-AI-ORCH-001",
        status: "backlog",
        owner: "Codex2",
        reviewer: "Claude",
        title: "Assignment created",
        next: "Assignment created",
        artifacts: ["apps/api/src/modules/platform-admin-assistant/"],
        dependsOn: ["PA-AI-DEV-001"],
        lastUpdate: "2026-06-03T12:55:30Z",
      },
      supervisor: {
        lifecycle: "running",
        startedAt: "2026-06-03T12:00:00Z",
        lastHeartbeatAt: "2026-06-03T12:30:00Z",
      },
      queue: {
        events: [
          {
            eventId: "evt-pa-ai-orch-001-owned_ready_dispatch",
            reason: "owned_ready_dispatch",
            targetAgent: "Codex2",
            status: "queued",
          },
        ],
        workers: [
          {
            runId: "run-001",
            agentId: "Codex2",
            status: "running",
            queueEventId: "evt-pa-ai-orch-001-owned_ready_dispatch",
            lastEventAt: "2026-06-03T12:31:00Z",
            lastErrorSummary: null,
          },
        ],
      },
      integration: null,
    });
  });
});

import { describe, expect, it, vi } from "vitest";

import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { PlatformAdminAssistantController } from "../../src/modules/platform-admin-assistant/platform-admin-assistant.controller";

function platformIdentity(): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "platform_admin",
    actorId: "pa-admin-001",
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: ["superadmin"],
    scopes: ["foundation:read", "foundation:write"],
    requestId: "req-controller-identity-001",
  };
}

describe("PlatformAdminAssistantController", () => {
  it("returns the required answer/citations/suggested prompts/action plan shape for message calls", async () => {
    const platformAdminAssistantService = {
      createMessage: vi.fn(async () => ({
        answer:
          "Use the current platform admin identity and inspect the rollout gates.",
        citations: [
          {
            title: "Platform Admin product routes",
            section: "§7.3 Current route map",
          },
        ],
        suggestedPrompts: [
          "Summarize the rollout blockers.",
          "Draft a tenant-safe follow-up.",
        ],
        actionPlan: {
          planId: "plan-001",
          title: "Rollout review plan",
          summary: "Inspect current state before taking action.",
          steps: [
            {
              stepId: "review-gates",
              title: "Review rollout gates",
              status: "in_progress",
            },
          ],
        },
      })),
    };
    const controller = new PlatformAdminAssistantController(
      platformAdminAssistantService as never,
    );

    const response = await controller.createMessage(
      "session-001",
      platformIdentity(),
      { message: "What should I check before approving rollout?" },
      "req-assistant-msg-001",
    );

    expect(platformAdminAssistantService.createMessage).toHaveBeenCalledWith(
      "session-001",
      expect.objectContaining({
        actorId: "pa-admin-001",
      }),
      { message: "What should I check before approving rollout?" },
    );
    expect(response).toEqual({
      data: {
        answer:
          "Use the current platform admin identity and inspect the rollout gates.",
        citations: [
          {
            title: "Platform Admin product routes",
            section: "§7.3 Current route map",
          },
        ],
        suggestedPrompts: [
          "Summarize the rollout blockers.",
          "Draft a tenant-safe follow-up.",
        ],
        actionPlan: {
          planId: "plan-001",
          title: "Rollout review plan",
          summary: "Inspect current state before taking action.",
          steps: [
            {
              stepId: "review-gates",
              title: "Review rollout gates",
              status: "in_progress",
            },
          ],
        },
      },
      meta: {
        requestId: "req-assistant-msg-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("wraps action execute responses with ActionReceipt and assistantAuditId", () => {
    const platformAdminAssistantService = {
      executeAction: vi.fn(() => ({
        receipt: {
          actionId: "req-assistant-action-001",
          auditId: "audit-domain-001",
          resourceType: "platform_notice",
          resourceId: "notice_001",
          status: "completed",
          message: "Platform notice created.",
        },
        assistantAuditId: "audit-assistant-001",
      })),
    };
    const controller = new PlatformAdminAssistantController(
      platformAdminAssistantService as never,
    );

    const response = controller.executeAction(
      "session-001",
      platformIdentity(),
      {
        toolName: "action.create_platform_notice",
        payload: {
          title: "Dispatch notice",
          body: "Planned maintenance",
          severity: "warning",
          targetAudience: "all",
        },
      },
      "req-assistant-action-001",
    );

    expect(platformAdminAssistantService.executeAction).toHaveBeenCalledWith(
      "session-001",
      expect.objectContaining({ actorId: "pa-admin-001" }),
      expect.objectContaining({
        toolName: "action.create_platform_notice",
      }),
      "req-assistant-action-001",
    );
    expect(response).toEqual({
      data: {
        receipt: {
          actionId: "req-assistant-action-001",
          auditId: "audit-domain-001",
          resourceType: "platform_notice",
          resourceId: "notice_001",
          status: "completed",
          message: "Platform notice created.",
        },
        assistantAuditId: "audit-assistant-001",
      },
      meta: {
        requestId: "req-assistant-action-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("wraps dispatch packet submissions and runtime status reads in the standard envelope", () => {
    const platformAdminAssistantService = {
      submitDispatchPacket: vi.fn(() => ({
        accepted: true,
        dryRun: true,
        taskId: "PA-AI-ORCH-001",
        taskBriefPath: ".orchestrator/task-briefs/PA-AI-ORCH-001.md",
        baseBranch: "dev",
        track: "frontend",
        treeGuard: {
          blocked: false,
          dirtyPaths: [],
          matchedGlobs: [],
        },
        queued: false,
        queueEvent: null,
        warnings: [],
      })),
      getTaskRuntimeStatus: vi.fn(() => ({
        task: {
          id: "PA-AI-ORCH-001",
          status: "backlog",
          owner: "Codex2",
          reviewer: "Claude",
          title: "Bridge",
          next: "Assignment created",
          artifacts: [],
          dependsOn: [],
          lastUpdate: "2026-06-03T12:55:30Z",
        },
        supervisor: {
          lifecycle: "running",
          startedAt: null,
          lastHeartbeatAt: null,
        },
        queue: {
          events: [],
          workers: [],
        },
        integration: null,
      })),
    };
    const controller = new PlatformAdminAssistantController(
      platformAdminAssistantService as never,
    );

    const dispatchResponse = controller.submitDispatchPacket(
      "session-001",
      platformIdentity(),
      {
        dryRun: true,
        packet: {
          payload: {
            schema: "assistant_dispatch_packet.v1",
            source: "platform-admin-assistant",
            assistantSessionId: "session-001",
            actorId: "pa-admin-001",
            taskId: "PA-AI-ORCH-001",
            title: "Bridge",
            summary: "Bridge",
            owner: "Codex2",
            reviewer: "Claude",
            dependencies: [],
            artifacts: [],
            acceptance: [],
            risk: "medium",
            createdAt: "2026-06-03T12:55:30Z",
            humanConfirmedAt: "2026-06-03T12:55:31Z",
          },
          signature: {
            algorithm: "hmac-sha256",
            keyId: "dispatch-key",
            signedAt: "2026-06-03T12:55:31Z",
            value: "signature",
          },
        },
      },
      "req-dispatch-001",
    );

    const statusResponse = controller.getTaskRuntimeStatus(
      "session-001",
      "PA-AI-ORCH-001",
      platformIdentity(),
      "req-status-001",
    );

    expect(dispatchResponse).toEqual({
      data: expect.objectContaining({
        accepted: true,
        taskId: "PA-AI-ORCH-001",
      }),
      meta: {
        requestId: "req-dispatch-001",
        timestamp: expect.any(String),
      },
    });
    expect(statusResponse).toEqual({
      data: expect.objectContaining({
        task: expect.objectContaining({
          id: "PA-AI-ORCH-001",
        }),
      }),
      meta: {
        requestId: "req-status-001",
        timestamp: expect.any(String),
      },
    });
  });
});

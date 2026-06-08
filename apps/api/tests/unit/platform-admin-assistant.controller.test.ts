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
  it("wraps message responses with answer/citations/prompts/action plan", async () => {
    const service = {
      createMessage: vi.fn(async () => ({
        answer: "Use the current platform admin identity.",
        citations: [
          {
            title: "Platform Admin product routes",
            section: "§7.3 Current route map",
          },
        ],
        suggestedPrompts: ["Summarize the rollout blockers."],
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
        governedAction: {
          toolName: "action.create_platform_notice",
          payload: {
            title: "Assistant drafted notice",
            body: "Review before execution.",
            severity: "warning",
            targetAudience: "all",
          },
          descriptor: {
            action: "create_platform_notice",
            enabled: true,
            riskLevel: "medium",
            requiresReason: false,
          },
          confirmationRequired: true,
          title: "Confirm platform notice creation",
          message: "This will publish a warning notice for all.",
        },
      })),
    };
    const controller = new PlatformAdminAssistantController(service as never);

    const response = await controller.createMessage(
      "session-001",
      platformIdentity(),
      { message: "What should I check before approving rollout?" },
      "req-assistant-msg-001",
    );

    expect(service.createMessage).toHaveBeenCalledWith(
      "session-001",
      expect.objectContaining({ actorId: "pa-admin-001" }),
      { message: "What should I check before approving rollout?" },
    );
    expect(response.meta.requestId).toBe("req-assistant-msg-001");
    expect(response.data.answer).toContain("current platform admin identity");
    expect(response.data.governedAction).toMatchObject({
      toolName: "action.create_platform_notice",
      confirmationRequired: true,
      descriptor: {
        action: "create_platform_notice",
        enabled: true,
        riskLevel: "medium",
      },
    });
  });

  it("wraps read-tool execution responses", async () => {
    const service = {
      executeReadTool: vi.fn(async () => ({
        toolName: "data.list_payment_records",
        family: "data",
        outputType: "record_set",
        items: [{ recordId: "pay-001" }],
      })),
    };
    const controller = new PlatformAdminAssistantController(service as never);

    const response = await controller.executeReadTool(
      "session-001",
      platformIdentity(),
      { toolName: "data.list_payment_records", input: { limit: 1 } },
      "req-tool-001",
    );

    expect(service.executeReadTool).toHaveBeenCalledWith(
      "session-001",
      expect.objectContaining({ actorId: "pa-admin-001" }),
      { toolName: "data.list_payment_records", input: { limit: 1 } },
    );
    expect(response.data.items).toHaveLength(1);
  });

  it("wraps dispatch packet submission and task status readback", () => {
    const service = {
      submitDispatchPacket: vi.fn(() => ({
        accepted: true,
        mode: "dry_run",
        supervisorStatus: "queued",
      })),
      getTaskRuntimeStatus: vi.fn(() => ({
        taskId: "PA-AI-E2E-001",
        status: "dry_run",
      })),
    };
    const controller = new PlatformAdminAssistantController(service as never);

    const dispatchResponse = controller.submitDispatchPacket(
      "session-001",
      platformIdentity(),
      {
        packet: {
          packetId: "pkt-001",
          payload: {
            assistantSessionId: "session-001",
          },
        },
      } as never,
      "req-dispatch-001",
    );
    const statusResponse = controller.getTaskRuntimeStatus(
      "session-001",
      "PA-AI-E2E-001",
      platformIdentity(),
      "req-status-001",
    );

    expect(service.submitDispatchPacket).toHaveBeenCalled();
    expect(service.getTaskRuntimeStatus).toHaveBeenCalledWith(
      "session-001",
      expect.objectContaining({ actorId: "pa-admin-001" }),
      "PA-AI-E2E-001",
    );
    expect(dispatchResponse.data.accepted).toBe(true);
    expect(statusResponse.data.status).toBe("dry_run");
  });
});

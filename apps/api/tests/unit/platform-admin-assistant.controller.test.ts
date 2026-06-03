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
});

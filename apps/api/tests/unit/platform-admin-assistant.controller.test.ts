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

  it("wraps development artifact generation responses with archived file metadata", async () => {
    const platformAdminAssistantService = {
      generateDevelopmentArtifacts: vi.fn(async () => ({
        artifactBundleId: "paas_dev_bundle_001",
        sessionId: "session-001",
        requestTitle: "Archive assistant planning artifacts",
        summary: "Generate SA, SD, and task briefs.",
        createdAt: "2026-06-03T15:00:00.000Z",
        actorId: "pa-admin-001",
        planningRef:
          "docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md",
        files: [
          {
            kind: "system_analysis",
            title: "Archive assistant planning artifacts system analysis",
            path: "docs/02-architecture/platform-admin-assistant-system-analysis-20260603-archive-assistant-planning-artifacts.md",
          },
        ],
        citations: [
          {
            title: "Platform Admin agentic assistant architecture plan",
            section: "§6.6 Development Collaboration Tool Bus",
          },
        ],
        tasks: [
          {
            taskId: "PA-AI-DEV-101",
            title: "Archive dev collaboration artifacts",
            summary: "Write task briefs to approved paths.",
            owner: "Codex",
            reviewer: "Claude",
          },
        ],
      })),
    };
    const controller = new PlatformAdminAssistantController(
      platformAdminAssistantService as never,
    );

    const response = await controller.generateDevelopmentArtifacts(
      "session-001",
      platformIdentity(),
      {
        requestTitle: "Archive assistant planning artifacts",
        requestedChange: "Generate SA, SD, and task briefs.",
        tasks: [
          {
            taskId: "PA-AI-DEV-101",
            title: "Archive dev collaboration artifacts",
            summary: "Write task briefs to approved paths.",
            owner: "Codex",
            reviewer: "Claude",
          },
        ],
      },
      "req-dev-artifacts-001",
    );

    expect(
      platformAdminAssistantService.generateDevelopmentArtifacts,
    ).toHaveBeenCalledWith(
      "session-001",
      expect.objectContaining({ actorId: "pa-admin-001" }),
      expect.objectContaining({
        requestTitle: "Archive assistant planning artifacts",
      }),
    );
    expect(response).toEqual({
      data: expect.objectContaining({
        artifactBundleId: "paas_dev_bundle_001",
        files: [
          expect.objectContaining({
            kind: "system_analysis",
          }),
        ],
      }),
      meta: {
        requestId: "req-dev-artifacts-001",
        timestamp: expect.any(String),
      },
    });
  });
});

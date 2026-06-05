import { Injectable } from "@nestjs/common";

import type {
  PlatformAdminAssistantProvider,
  PlatformAdminAssistantProviderRequest,
  PlatformAdminAssistantProviderResponse,
} from "./platform-admin-assistant.types";

@Injectable()
export class MockPlatformAdminAssistantProvider implements PlatformAdminAssistantProvider {
  readonly kind = "mock" as const;

  async generate(
    request: PlatformAdminAssistantProviderRequest,
  ): Promise<PlatformAdminAssistantProviderResponse> {
    const normalizedMessage = request.message.trim();
    const summary =
      normalizedMessage.length > 96
        ? `${normalizedMessage.slice(0, 93)}...`
        : normalizedMessage;

    return {
      answer: `Mock assistant response for ${request.session.actor.actorId}: ${summary}`,
      citations: [
        {
          title: "Platform Admin product routes",
          section: "§7.3 Current route map",
          href: "docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md",
        },
        {
          title: "Platform Admin shell questions",
          section: "§7.3 Shell",
          href: "docs/05-ui/platform-admin-design-handoff-packet-20260525.md",
        },
      ],
      suggestedPrompts: [
        "Summarize the risks before changing rollout gates.",
        "Draft a platform-admin action checklist for this issue.",
        "Which existing module owns the underlying data?",
      ],
      actionPlan: {
        planId: `${request.session.sessionId}-plan-${request.history.filter((entry) => entry.role === "assistant").length + 1}`,
        title: "Mock action plan",
        summary:
          "Validate the request, inspect current platform state, then prepare operator follow-up.",
        steps: [
          {
            stepId: "validate-context",
            title: "Validate current platform-admin context",
            status: "completed",
          },
          {
            stepId: "inspect-state",
            title: "Inspect the impacted session and governance state",
            status: "in_progress",
          },
          {
            stepId: "prepare-followup",
            title: "Prepare an operator-safe follow-up action",
            status: "pending",
          },
        ],
      },
    };
  }
}

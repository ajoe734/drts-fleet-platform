import { Injectable } from "@nestjs/common";

import { LlmGatewayService } from "../../common/llm-gateway";
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

@Injectable()
export class LlmGatewayPlatformAdminAssistantProvider implements PlatformAdminAssistantProvider {
  constructor(private readonly llmGatewayService: LlmGatewayService) {}

  get kind() {
    return this.llmGatewayService.getConfig().provider;
  }

  async generate(
    request: PlatformAdminAssistantProviderRequest,
  ): Promise<PlatformAdminAssistantProviderResponse> {
    if (this.llmGatewayService.isMockProvider()) {
      return new MockPlatformAdminAssistantProvider().generate(request);
    }

    const completion = await this.llmGatewayService.completeChat({
      messages: this.buildMessages(request),
      maxTokens: 900,
      temperature: 0.2,
    });

    return this.parseStructuredResponse(request, completion.text);
  }

  private buildMessages(request: PlatformAdminAssistantProviderRequest) {
    const history = request.history
      .slice(-8)
      .map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`)
      .join("\n");

    return [
      {
        role: "system" as const,
        content: [
          "You are the DRTS Platform Admin assistant.",
          "Respond with strict JSON and no markdown fences.",
          "Return keys: answer, citations, suggestedPrompts, actionPlan.",
          "Citations must be an array of objects with title and optional section and href.",
          "Suggested prompts must be a short array of follow-up questions.",
          "actionPlan may be null.",
          "Do not claim to execute actions. Explain and cite only.",
        ].join(" "),
      },
      {
        role: "user" as const,
        content: JSON.stringify({
          actorId: request.session.actor.actorId,
          sessionId: request.session.sessionId,
          message: request.message,
          history,
          allowedCitationHints: this.defaultCitations(),
        }),
      },
    ];
  }

  private parseStructuredResponse(
    request: PlatformAdminAssistantProviderRequest,
    text: string,
  ): PlatformAdminAssistantProviderResponse {
    const parsed = this.tryParseJson(text);
    if (!parsed || typeof parsed.answer !== "string") {
      return this.buildFallbackStructuredResponse(request, text);
    }

    const citations = Array.isArray(parsed.citations)
      ? parsed.citations
          .filter(
            (
              entry,
            ): entry is {
              title: string;
              section?: string;
              href?: string;
            } =>
              Boolean(
                entry &&
                typeof entry === "object" &&
                typeof (entry as { title?: unknown }).title === "string",
              ),
          )
          .slice(0, 4)
      : [];
    const suggestedPrompts = Array.isArray(parsed.suggestedPrompts)
      ? parsed.suggestedPrompts
          .filter((entry): entry is string => typeof entry === "string")
          .slice(0, 3)
      : [];

    return {
      answer: parsed.answer.trim(),
      citations: citations.length > 0 ? citations : this.defaultCitations(),
      suggestedPrompts:
        suggestedPrompts.length > 0
          ? suggestedPrompts
          : this.defaultSuggestedPrompts(),
      actionPlan: this.normalizeActionPlan(parsed.actionPlan),
    };
  }

  private buildFallbackStructuredResponse(
    request: PlatformAdminAssistantProviderRequest,
    text: string,
  ): PlatformAdminAssistantProviderResponse {
    const summary =
      text.trim() ||
      `Live ${this.kind} provider returned an empty answer for ${request.session.actor.actorId}.`;
    return {
      answer: summary,
      citations: this.defaultCitations(),
      suggestedPrompts: this.defaultSuggestedPrompts(),
      actionPlan: null,
    };
  }

  private normalizeActionPlan(
    actionPlan: unknown,
  ): PlatformAdminAssistantProviderResponse["actionPlan"] {
    if (!actionPlan || typeof actionPlan !== "object") {
      return null;
    }

    const plan = actionPlan as Record<string, unknown>;
    if (
      typeof plan.planId !== "string" ||
      typeof plan.title !== "string" ||
      typeof plan.summary !== "string" ||
      !Array.isArray(plan.steps)
    ) {
      return null;
    }

    const steps = plan.steps
      .filter(
        (
          step,
        ): step is {
          stepId: string;
          title: string;
          status: "pending" | "in_progress" | "completed";
        } =>
          Boolean(
            step &&
            typeof step === "object" &&
            typeof (step as { stepId?: unknown }).stepId === "string" &&
            typeof (step as { title?: unknown }).title === "string" &&
            ((step as { status?: unknown }).status === "pending" ||
              (step as { status?: unknown }).status === "in_progress" ||
              (step as { status?: unknown }).status === "completed"),
          ),
      )
      .slice(0, 6);

    return {
      planId: plan.planId,
      title: plan.title,
      summary: plan.summary,
      steps,
    };
  }

  private tryParseJson(text: string): Record<string, unknown> | null {
    const trimmed = text.trim();
    const normalized =
      trimmed.startsWith("```") && trimmed.endsWith("```")
        ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
        : trimmed;

    try {
      const parsed = JSON.parse(normalized) as unknown;
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private defaultCitations() {
    return [
      {
        title: "Platform Admin assistant runtime plan",
        section: "§4 Mock Provider Policy",
        href: "docs/05-ui/platform-admin-llm-assistant-design-development-plan-20260602.md",
      },
      {
        title: "Platform Admin agentic assistant architecture plan",
        section: "§10 Acceptance Matrix",
        href: "docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md",
      },
    ];
  }

  private defaultSuggestedPrompts() {
    return [
      "Summarize the current risk before changing rollout gates.",
      "List the Platform Admin routes relevant to this issue.",
      "Draft a safe manual follow-up for the current operator.",
    ];
  }
}

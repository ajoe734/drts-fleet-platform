import { Injectable } from "@nestjs/common";

import { LlmGatewayService } from "../../common/llm-gateway";
import { OpenClawRuntimeService } from "../../common/openclaw-runtime";
import { getApprovedSource } from "./knowledge";
import type {
  PlatformAdminAssistantActionCommand,
  PlatformAdminAssistantProvider,
  PlatformAdminAssistantCitation,
  PlatformAdminAssistantProviderRequest,
  PlatformAdminAssistantProviderResponse,
} from "./platform-admin-assistant.types";

function toAssistantCitations(
  request: PlatformAdminAssistantProviderRequest,
): PlatformAdminAssistantCitation[] {
  const citations =
    request.retrieval.kind === "grounded"
      ? request.retrieval.citations
      : request.retrieval.suggestedSources;

  return citations.map((citation) => {
    const result: PlatformAdminAssistantCitation = {
      title:
        getApprovedSource(citation.sourcePath)?.label ?? citation.sourcePath,
      href: citation.sourcePath,
    };
    if (citation.section !== null) {
      result.section = citation.section;
    }
    return result;
  });
}

function summarizeChunkText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 220
    ? `${normalized.slice(0, 217).trimEnd()}...`
    : normalized;
}

function formatHistory(request: PlatformAdminAssistantProviderRequest) {
  return request.history
    .slice(-8)
    .map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`)
    .join("\n");
}

function extractGovernedAction(
  message: string,
): PlatformAdminAssistantActionCommand | null {
  const normalized = message.toLowerCase();

  if (normalized.includes("maintenance mode") || message.includes("維護模式")) {
    const enable =
      normalized.includes("enable") ||
      normalized.includes("turn on") ||
      normalized.includes("start maintenance") ||
      message.includes("開啟") ||
      message.includes("啟用");
    const disable =
      normalized.includes("disable") ||
      normalized.includes("turn off") ||
      normalized.includes("end maintenance") ||
      message.includes("關閉") ||
      message.includes("停用");

    return {
      toolName: "action.set_maintenance_mode",
      payload: {
        enabled: enable || !disable,
      },
    };
  }

  if (
    normalized.includes("notice") ||
    normalized.includes("announcement") ||
    message.includes("公告")
  ) {
    return {
      toolName: "action.create_platform_notice",
      payload: {
        title: "Platform assistant drafted notice",
        body: "Please review the assisted notice draft before execution.",
        severity: normalized.includes("critical") ? "critical" : "warning",
        targetAudience: message.includes("司機")
          ? "drivers"
          : normalized.includes("ops")
            ? "ops"
            : "all",
      },
    };
  }

  return null;
}

abstract class StructuredPlatformAdminAssistantProviderBase implements PlatformAdminAssistantProvider {
  abstract readonly kind: PlatformAdminAssistantProvider["kind"];
  abstract generate(
    request: PlatformAdminAssistantProviderRequest,
  ): Promise<PlatformAdminAssistantProviderResponse>;

  protected parseStructuredResponse(
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
      citations:
        citations.length > 0 ? citations : toAssistantCitations(request),
      suggestedPrompts:
        suggestedPrompts.length > 0
          ? suggestedPrompts
          : this.defaultSuggestedPrompts(),
      actionPlan: this.normalizeActionPlan(parsed.actionPlan),
      governedAction: null,
    };
  }

  protected buildFallbackStructuredResponse(
    request: PlatformAdminAssistantProviderRequest,
    text: string,
  ): PlatformAdminAssistantProviderResponse {
    const summary =
      text.trim() ||
      `Live ${this.kind} provider returned an empty answer for ${request.session.actor.actorId}.`;
    return {
      answer: summary,
      citations: toAssistantCitations(request),
      suggestedPrompts: this.defaultSuggestedPrompts(),
      actionPlan: null,
      governedAction: null,
    };
  }

  protected normalizeActionPlan(
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

  protected tryParseJson(text: string): Record<string, unknown> | null {
    const trimmed = text.trim();
    const normalized =
      trimmed.startsWith("```") && trimmed.endsWith("```")
        ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
        : trimmed;

    for (const candidate of [
      normalized,
      this.extractJsonSlice(normalized),
    ].filter((value): value is string => Boolean(value))) {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        if (parsed && typeof parsed === "object") {
          return parsed as Record<string, unknown>;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  protected defaultSuggestedPrompts() {
    return [
      "Summarize the current risk before changing rollout gates.",
      "List the Platform Admin routes relevant to this issue.",
      "Draft a safe manual follow-up for the current operator.",
    ];
  }

  private extractJsonSlice(text: string) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return null;
    }
    return text.slice(start, end + 1);
  }
}

@Injectable()
export class MockPlatformAdminAssistantProvider implements PlatformAdminAssistantProvider {
  readonly kind = "mock" as const;

  async generate(
    request: PlatformAdminAssistantProviderRequest,
  ): Promise<PlatformAdminAssistantProviderResponse> {
    const citations = toAssistantCitations(request);

    if (request.retrieval.kind === "uncertain") {
      return {
        answer: request.retrieval.message,
        citations,
        suggestedPrompts: [
          "Rephrase the question using Platform Admin route or module names.",
          "Ask for the relevant runbook or state-machine section.",
          "Request the closest approved documents for manual review.",
        ],
        actionPlan: null,
        governedAction: null,
      };
    }

    const primaryHit = request.retrieval.hits[0];
    const normalizedMessage = request.message.trim();
    const governedAction = extractGovernedAction(normalizedMessage);
    const summary =
      normalizedMessage.length > 96
        ? `${normalizedMessage.slice(0, 93)}...`
        : normalizedMessage;
    const excerpt = primaryHit
      ? summarizeChunkText(primaryHit.chunk.text)
      : summary;

    return {
      answer:
        `Grounded answer for ${request.session.actor.actorId}: ${excerpt}` +
        (primaryHit?.chunk.section
          ? ` (source section: ${primaryHit.chunk.section})`
          : ""),
      citations,
      suggestedPrompts: [
        "Summarize the risks before changing rollout gates from the cited docs.",
        "Draft an operator checklist from the cited runbook or contract.",
        "Which approved source should I inspect next for implementation detail?",
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
      governedAction,
    };
  }
}

@Injectable()
export class LlmGatewayPlatformAdminAssistantProvider extends StructuredPlatformAdminAssistantProviderBase {
  constructor(
    private readonly llmGatewayService: LlmGatewayService,
    private readonly openClawRuntimeService: OpenClawRuntimeService,
  ) {
    super();
  }

  get kind() {
    return this.llmGatewayService.getConfig().provider;
  }

  async generate(
    request: PlatformAdminAssistantProviderRequest,
  ): Promise<PlatformAdminAssistantProviderResponse> {
    if (this.llmGatewayService.isMockProvider()) {
      return new MockPlatformAdminAssistantProvider().generate(request);
    }

    if (this.llmGatewayService.isOpenClawProvider()) {
      const result = await this.openClawRuntimeService.runAgentTurn({
        sessionKey: request.session.sessionId,
        message: this.buildOpenClawPrompt(request),
        model: this.llmGatewayService.getConfig().chatModel,
      });
      return this.parseStructuredResponse(request, result.text);
    }

    const completion = await this.llmGatewayService.completeChat({
      messages: this.buildMessages(request),
      maxTokens: 900,
      temperature: 0.2,
    });

    return this.parseStructuredResponse(request, completion.text);
  }

  private buildMessages(request: PlatformAdminAssistantProviderRequest) {
    const citations = toAssistantCitations(request);
    const retrievalContext =
      request.retrieval.kind === "grounded"
        ? request.retrieval.untrustedContext.slice(0, 4).map((block) => ({
            sourcePath: block.sourcePath,
            section: block.section,
            text: summarizeChunkText(block.text),
            hasInjectionRisk: block.hasInjectionRisk,
          }))
        : [];

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
          "Use only the provided approved-source retrieval context.",
          "Do not claim to execute actions. Explain and cite only.",
          "If the retrieval result is uncertain, say you are not confident and point to the approved sources.",
        ].join(" "),
      },
      {
        role: "user" as const,
        content: JSON.stringify({
          actorId: request.session.actor.actorId,
          sessionId: request.session.sessionId,
          message: request.message,
          history: formatHistory(request),
          retrievalKind: request.retrieval.kind,
          retrievalContext,
          allowedCitationHints: citations,
        }),
      },
    ];
  }

  private buildOpenClawPrompt(request: PlatformAdminAssistantProviderRequest) {
    const citations = toAssistantCitations(request);
    const retrievalContext =
      request.retrieval.kind === "grounded"
        ? request.retrieval.untrustedContext.slice(0, 4).map((block) => ({
            sourcePath: block.sourcePath,
            section: block.section,
            text: summarizeChunkText(block.text),
            hasInjectionRisk: block.hasInjectionRisk,
          }))
        : [];

    return [
      "You are answering a DRTS Platform Admin assistant turn through the OpenClaw embedded runtime.",
      "Return a single strict JSON object and no markdown fences.",
      'Required top-level keys: "answer", "citations", "suggestedPrompts", "actionPlan".',
      "Use only the approved-source retrieval context included below.",
      "Do not claim to execute actions, inspect the filesystem, or call tools unless that fact is explicitly present in the payload.",
      "",
      JSON.stringify(
        {
          actorId: request.session.actor.actorId,
          sessionId: request.session.sessionId,
          message: request.message,
          history: formatHistory(request),
          retrievalKind: request.retrieval.kind,
          retrievalContext,
          allowedCitationHints: citations,
          responseContract: {
            answer: "string",
            citations: [
              {
                title: "string",
                section: "optional string",
                href: "optional string",
              },
            ],
            suggestedPrompts: ["string", "string", "string"],
            actionPlan: {
              planId: "string",
              title: "string",
              summary: "string",
              steps: [
                {
                  stepId: "string",
                  title: "string",
                  status: "pending | in_progress | completed",
                },
              ],
            },
          },
        },
        null,
        2,
      ),
    ].join("\n");
  }
}

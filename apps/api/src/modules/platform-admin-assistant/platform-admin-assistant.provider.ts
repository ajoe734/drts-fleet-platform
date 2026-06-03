import { Injectable } from "@nestjs/common";

import { getApprovedSource } from "./knowledge";
import type {
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
      };
    }

    const primaryHit = request.retrieval.hits[0];
    const normalizedMessage = request.message.trim();
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
    };
  }
}

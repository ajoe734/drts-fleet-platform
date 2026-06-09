import { describe, expect, it, vi } from "vitest";

import { LlmGatewayPlatformAdminAssistantProvider } from "../../src/modules/platform-admin-assistant/platform-admin-assistant.provider";
import type { PlatformAdminAssistantProviderRequest } from "../../src/modules/platform-admin-assistant/platform-admin-assistant.types";

const PLAN_PATH =
  "docs/05-ui/platform-admin-llm-assistant-design-development-plan-20260602.md";

function buildRequest(): PlatformAdminAssistantProviderRequest {
  return {
    session: {
      sessionId: "paas-session-001",
      title: "Runtime probe",
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
      provider: "openclaw",
      actor: {
        authMode: "bootstrap_headers",
        actorType: "platform_admin",
        actorId: "pa-admin-001",
        realm: "platform",
        tenantId: null,
        roleFamilies: ["platform"],
        roles: ["superadmin"],
        scopes: ["foundation:read", "foundation:write"],
        requestId: "req-openclaw-provider-001",
      },
      latestAnswerPreview: null,
    },
    message: "What should I check before approving rollout?",
    history: [],
    retrieval: {
      kind: "grounded",
      hits: [
        {
          score: 1,
          sourcePath: PLAN_PATH,
          chunk: {
            chunkId: "chunk-001",
            sourcePath: PLAN_PATH,
            title: "Platform Admin LLM Assistant Plan",
            section: "7.2 Citations",
            text: "Every grounded answer must include citations with the source path and section.",
          },
        },
      ],
      citations: [
        {
          sourcePath: PLAN_PATH,
          section: "7.2 Citations",
        },
      ],
      untrustedContext: [
        {
          sourcePath: PLAN_PATH,
          section: "7.2 Citations",
          text: "Every grounded answer must include citations with the source path and section.",
          hasInjectionRisk: false,
        },
      ],
    } as never,
  };
}

describe("LlmGatewayPlatformAdminAssistantProvider", () => {
  it("routes platform-admin chat through openclaw when configured", async () => {
    const llmGatewayService = {
      getConfig: () => ({
        provider: "openclaw",
        chatModel: "openai/gpt-5.5",
      }),
      isMockProvider: () => false,
      isOpenClawProvider: () => true,
      completeChat: vi.fn(),
    };
    const openClawRuntimeService = {
      runAgentTurn: vi.fn(async () => ({
        text: [
          "OpenClaw reply:",
          '{"answer":"Check rollout gates first.","citations":[{"title":"Platform Admin LLM Assistant Plan","section":"7.2 Citations","href":"docs/05-ui/platform-admin-llm-assistant-design-development-plan-20260602.md"}],"suggestedPrompts":["List the current rollout blockers."],"actionPlan":null}',
        ].join("\n"),
        raw: {},
        meta: { transport: "embedded" },
      })),
    };

    const provider = new LlmGatewayPlatformAdminAssistantProvider(
      llmGatewayService as never,
      openClawRuntimeService as never,
    );

    const response = await provider.generate(buildRequest());

    expect(openClawRuntimeService.runAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "paas-session-001",
        model: "openai/gpt-5.5",
      }),
    );
    expect(response.answer).toBe("Check rollout gates first.");
    expect(response.citations).toEqual([
      expect.objectContaining({
        href: PLAN_PATH,
        section: "7.2 Citations",
      }),
    ]);
    expect(response.suggestedPrompts).toEqual([
      "List the current rollout blockers.",
    ]);
  });
});

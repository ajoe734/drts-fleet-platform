import { describe, expect, it } from "vitest";

import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AssistantGuardrailService } from "../../apps/api/src/modules/assistant/assistant.guardrail.service";
import { AssistantLlmGatewayService } from "../../apps/api/src/modules/assistant/assistant-llm-gateway.service";
import { AssistantService } from "../../apps/api/src/modules/assistant/assistant.service";

function makeIdentity(
  overrides: Partial<BootstrapRequestIdentity> = {},
): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "ops_user",
    actorId: "ops-a",
    principalId: "ops-a",
    realm: "ops",
    tenantId: null,
    roleFamilies: ["ops"],
    roles: ["ops_user"],
    scopes: ["assistant:write"],
    requestId: "req-assistant-001",
    ...overrides,
  } as BootstrapRequestIdentity;
}

function makeService() {
  return new AssistantService(
    new AssistantGuardrailService(),
    new AssistantLlmGatewayService(),
  );
}

describe("AssistantService conversation ownership", () => {
  it("denies a same-realm, same-tenant actor who did not create the conversation", async () => {
    const service = makeService();
    const owner = makeIdentity({ actorId: "ops-a", principalId: "ops-a" });
    const otherActor = makeIdentity({ actorId: "ops-b", principalId: "ops-b" });

    const { conversation } = service.createConversation({}, owner);

    await expect(
      service.streamConversationMessage(
        conversation.conversationId,
        { content: "read ops-a history" },
        otherActor,
        { emit: () => {} },
      ),
    ).rejects.toMatchObject({
      code: "ASSISTANT_CONVERSATION_NOT_FOUND",
    } satisfies Partial<ApiRequestError>);
  });

  it("allows the creating actor to continue their own conversation", async () => {
    const service = makeService();
    const owner = makeIdentity({ actorId: "ops-a", principalId: "ops-a" });

    const { conversation } = service.createConversation({}, owner);

    await expect(
      service.streamConversationMessage(
        conversation.conversationId,
        { content: "hello" },
        owner,
        { emit: () => {} },
      ),
    ).resolves.toMatchObject({
      conversation: { conversationId: conversation.conversationId },
    });
  });
});

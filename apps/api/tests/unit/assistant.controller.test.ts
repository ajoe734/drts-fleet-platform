import { describe, expect, it, vi } from "vitest";

import { ASSISTANT_SYSTEM_PROMPT } from "../../src/modules/assistant/assistant.instructions";
import { AssistantController } from "../../src/modules/assistant/assistant.controller";
import { AssistantService } from "../../src/modules/assistant/assistant.service";

describe("AssistantController", () => {
  it("wraps runtime definition in the shared API success envelope", () => {
    const service = new AssistantService();
    const runtimeSpy = vi.spyOn(service, "getRuntimeDefinition");
    const controller = new AssistantController(service);

    const response = controller.getRuntimeDefinition("req-assist-runtime-001");

    expect(runtimeSpy).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      data: {
        systemPrompt: ASSISTANT_SYSTEM_PROMPT,
        tools: [
          expect.objectContaining({
            name: "proposeAction",
          }),
        ],
      },
      meta: {
        requestId: "req-assist-runtime-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("wraps generic runtime tool invocation in the shared API success envelope", () => {
    const service = new AssistantService();
    const invokeSpy = vi.spyOn(service, "invokeTool");
    const controller = new AssistantController(service);
    const input = {
      resourceKind: "incident",
      resourceId: "inc-001",
      action: "resolve",
    };

    const response = controller.invokeTool(
      "proposeAction",
      input,
      "req-assist-tool-001",
    );

    expect(invokeSpy).toHaveBeenCalledWith("proposeAction", input);
    expect(response).toEqual({
      data: {
        type: "action_intent",
        tool: "proposeAction",
        resourceKind: "incident",
        resourceId: "inc-001",
        action: "resolve",
        args: {},
        confirmationRequired: true,
        mutates: false,
      },
      meta: {
        requestId: "req-assist-tool-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("wraps proposeAction in the shared API success envelope", () => {
    const service = new AssistantService();
    const invokeSpy = vi.spyOn(service, "invokeTool");
    const controller = new AssistantController(service);
    const input = {
      resourceKind: "driver",
      resourceId: "drv-001",
      action: "suppress",
      args: {
        reason: "manual follow-up required",
      },
    };

    const response = controller.proposeAction(input, "req-assist-001");

    expect(invokeSpy).toHaveBeenCalledWith("proposeAction", input);
    expect(response).toEqual({
      data: {
        type: "action_intent",
        tool: "proposeAction",
        resourceKind: "driver",
        resourceId: "drv-001",
        action: "suppress",
        args: {
          reason: "manual follow-up required",
        },
        confirmationRequired: true,
        mutates: false,
      },
      meta: {
        requestId: "req-assist-001",
        timestamp: expect.any(String),
      },
    });
  });
});

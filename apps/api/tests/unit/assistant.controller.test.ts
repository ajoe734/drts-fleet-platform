import { describe, expect, it, vi } from "vitest";

import { AssistantController } from "../../src/modules/assistant/assistant.controller";
import { AssistantService } from "../../src/modules/assistant/assistant.service";

describe("AssistantController", () => {
  it("wraps proposeAction in the shared API success envelope", () => {
    const service = new AssistantService();
    const proposeSpy = vi.spyOn(service, "proposeAction");
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

    expect(proposeSpy).toHaveBeenCalledWith(input);
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

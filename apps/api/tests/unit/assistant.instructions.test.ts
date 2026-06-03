import { describe, expect, it } from "vitest";

import {
  ASSISTANT_RUNTIME_DEFINITION,
  ASSISTANT_PROPOSE_ACTION_TOOL,
  ASSISTANT_SYSTEM_PROMPT,
} from "../../src/modules/assistant/assistant.instructions";

describe("assistant system prompt", () => {
  it("constrains state changes to proposeAction plus human confirmation", () => {
    expect(ASSISTANT_PROPOSE_ACTION_TOOL).toBe("proposeAction");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain(
      "call proposeAction as the only allowed path",
    );
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("does not execute the change");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("explicit human confirmation");
  });

  it("publishes a runtime definition that wires the prompt and proposeAction schema together", () => {
    expect(ASSISTANT_RUNTIME_DEFINITION.systemPrompt).toBe(
      ASSISTANT_SYSTEM_PROMPT,
    );
    expect(ASSISTANT_RUNTIME_DEFINITION.tools).toEqual([
      expect.objectContaining({
        name: ASSISTANT_PROPOSE_ACTION_TOOL,
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["resourceKind", "resourceId", "action"],
          properties: expect.objectContaining({
            resourceKind: expect.objectContaining({
              type: "string",
              minLength: 1,
            }),
            resourceId: expect.objectContaining({
              type: "string",
              minLength: 1,
            }),
            action: expect.objectContaining({
              type: "string",
              minLength: 1,
            }),
            args: expect.objectContaining({
              type: "object",
              additionalProperties: true,
            }),
          }),
        },
      }),
    ]);
  });
});

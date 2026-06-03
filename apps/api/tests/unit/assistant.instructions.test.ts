import { describe, expect, it } from "vitest";

import {
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
});

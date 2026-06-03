import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AssistantService } from "../../src/modules/assistant/assistant.service";

describe("AssistantService", () => {
  it("returns a non-mutating ActionIntent and clones args", () => {
    const service = new AssistantService();
    const input = {
      resourceKind: "incident",
      resourceId: "inc-001",
      action: "resolve",
      args: {
        note: "Resolved after operator review",
        nested: {
          severity: "high",
        },
      },
    } as const;

    const intent = service.proposeAction(input);
    (intent.args.nested as { severity: string }).severity = "low";

    expect(intent).toEqual({
      type: "action_intent",
      tool: "proposeAction",
      resourceKind: "incident",
      resourceId: "inc-001",
      action: "resolve",
      args: {
        note: "Resolved after operator review",
        nested: {
          severity: "low",
        },
      },
      confirmationRequired: true,
      mutates: false,
    });
    expect(input.args.nested.severity).toBe("high");
  });

  it("rejects blank resource metadata", () => {
    const service = new AssistantService();

    expect(() =>
      service.proposeAction({
        resourceKind: "incident",
        resourceId: " ",
        action: "resolve",
      }),
    ).toThrowError(ApiRequestError);
  });

  it("rejects non-object args payloads", () => {
    const service = new AssistantService();

    expect(() =>
      service.proposeAction({
        resourceKind: "incident",
        resourceId: "inc-001",
        action: "resolve",
        args: ["bad"] as unknown as Record<string, unknown>,
      }),
    ).toThrowError(ApiRequestError);
  });
});

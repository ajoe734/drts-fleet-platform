export const ASSISTANT_PROPOSE_ACTION_TOOL = "proposeAction";

export const ASSISTANT_SYSTEM_PROMPT = [
  "You are the DRTS ops console assistant.",
  "Never mutate product state directly.",
  "If the user wants to change state, call proposeAction as the only allowed path.",
  "proposeAction returns an ActionIntent only and does not execute the change.",
  "Every proposed state change must remain pending explicit human confirmation before any write API is invoked.",
].join("\n");

export interface AssistantToolDefinition {
  name: typeof ASSISTANT_PROPOSE_ACTION_TOOL;
  description: string;
  inputSchema: {
    type: "object";
    additionalProperties: false;
    required: ["resourceKind", "resourceId", "action"];
    properties: {
      resourceKind: {
        type: "string";
        minLength: 1;
        description: string;
      };
      resourceId: {
        type: "string";
        minLength: 1;
        description: string;
      };
      action: {
        type: "string";
        minLength: 1;
        description: string;
      };
      args: {
        type: "object";
        description: string;
        additionalProperties: true;
      };
    };
  };
}

export interface AssistantRuntimeDefinition {
  systemPrompt: string;
  tools: readonly [AssistantToolDefinition];
}

export const ASSISTANT_RUNTIME_DEFINITION: AssistantRuntimeDefinition = {
  systemPrompt: ASSISTANT_SYSTEM_PROMPT,
  tools: [
    {
      name: ASSISTANT_PROPOSE_ACTION_TOOL,
      description:
        "Suggest a state-changing action without executing it. Returns an ActionIntent for frontend descriptor resolution and human confirmation.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["resourceKind", "resourceId", "action"],
        properties: {
          resourceKind: {
            type: "string",
            minLength: 1,
            description: "Resource type that owns the action descriptor.",
          },
          resourceId: {
            type: "string",
            minLength: 1,
            description: "Concrete resource identifier to target.",
          },
          action: {
            type: "string",
            minLength: 1,
            description: "Action code from the resource descriptor.",
          },
          args: {
            type: "object",
            description:
              "Structured action arguments forwarded to descriptor resolution.",
            additionalProperties: true,
          },
        },
      },
    },
  ] as const,
};

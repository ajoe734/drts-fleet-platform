import type { BootstrapRequestIdentity } from "../../../common/auth";

export const ASSISTANT_READ_TOOL_NAMES = [
  "list_dispatch_jobs",
  "get_order",
  "get_complaint_case",
  "get_complaint_timeline",
  "get_complaint_export_view",
] as const;

export type AssistantReadToolName = (typeof ASSISTANT_READ_TOOL_NAMES)[number];

export interface AssistantReadToolDefinition {
  name: AssistantReadToolName;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: boolean;
  };
}

export interface AssistantReadToolExecutionRequest {
  toolName: AssistantReadToolName;
  input?: Record<string, unknown>;
  identity: BootstrapRequestIdentity | null;
}

export interface AssistantReadToolExecutionResult {
  toolName: AssistantReadToolName;
  output: unknown;
}

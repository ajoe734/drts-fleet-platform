import type { PlatformAdminAssistantToolFamily } from "./platform-admin-assistant.policy";
import { redactAssistantToolOutput } from "./platform-admin-assistant.policy";

export interface PlatformAdminAssistantToolDefinition {
  id: string;
  family: PlatformAdminAssistantToolFamily;
  description: string;
  requiredScopes: string[];
  outputType: string;
}

export const PLATFORM_ADMIN_ASSISTANT_TOOL_REGISTRY: readonly PlatformAdminAssistantToolDefinition[] =
  [
    {
      id: "route.list_platform_admin_routes",
      family: "route",
      description: "List platform-admin routes exposed to the current actor.",
      requiredScopes: ["foundation:read"],
      outputType: "route_list",
    },
    {
      id: "data.list_tenants",
      family: "data",
      description: "Read tenant governance summary data within the caller scope.",
      requiredScopes: ["tenant:read"],
      outputType: "tenant_summary_list",
    },
    {
      id: "docs.get_authority_note",
      family: "docs",
      description: "Read approved authority documents for platform-admin operations.",
      requiredScopes: ["foundation:read"],
      outputType: "document_excerpt",
    },
    {
      id: "action.create_notice",
      family: "action",
      description: "Create a platform notice as the current platform actor.",
      requiredScopes: ["notifications:write"],
      outputType: "notice_mutation_result",
    },
    {
      id: "audit.list_logs",
      family: "audit",
      description: "List audit logs visible to the current actor.",
      requiredScopes: ["audit:read"],
      outputType: "audit_log_list",
    },
  ] as const;

export function getPlatformAdminAssistantToolDefinition(toolId: string) {
  return (
    PLATFORM_ADMIN_ASSISTANT_TOOL_REGISTRY.find((tool) => tool.id === toolId) ??
    null
  );
}

export function serializePlatformAdminAssistantToolOutput(
  toolId: string,
  content: unknown,
) {
  const definition = getPlatformAdminAssistantToolDefinition(toolId);
  const outputType = definition?.outputType ?? "unknown_tool_output";

  return redactAssistantToolOutput(outputType, content);
}

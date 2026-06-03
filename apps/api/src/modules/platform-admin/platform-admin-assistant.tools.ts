export const PLATFORM_ADMIN_ASSISTANT_TOOL_FAMILIES = [
  "route",
  "data",
  "docs",
  "action",
  "audit",
] as const;

export type PlatformAdminAssistantToolFamily =
  (typeof PLATFORM_ADMIN_ASSISTANT_TOOL_FAMILIES)[number];

export const PLATFORM_ADMIN_ASSISTANT_TOOL_ACCESS_MODES = [
  "read",
  "write",
  "audit",
] as const;

export type PlatformAdminAssistantToolAccessMode =
  (typeof PLATFORM_ADMIN_ASSISTANT_TOOL_ACCESS_MODES)[number];

export const PLATFORM_ADMIN_ASSISTANT_OUTPUT_KINDS = [
  "route_snapshot",
  "record_set",
  "document_excerpt",
  "action_receipt",
  "audit_entry_set",
] as const;

export type PlatformAdminAssistantOutputKind =
  (typeof PLATFORM_ADMIN_ASSISTANT_OUTPUT_KINDS)[number];

export interface PlatformAdminAssistantToolDescriptor {
  name: string;
  family: PlatformAdminAssistantToolFamily;
  description: string;
  accessMode: PlatformAdminAssistantToolAccessMode;
  callerScoped: true;
  outputKind: PlatformAdminAssistantOutputKind;
}

const PLATFORM_ADMIN_ASSISTANT_FAMILY_POLICY: Record<
  PlatformAdminAssistantToolFamily,
  {
    namePrefix: `${PlatformAdminAssistantToolFamily}.`;
    accessMode: PlatformAdminAssistantToolAccessMode;
    outputKind: PlatformAdminAssistantOutputKind;
  }
> = {
  route: {
    namePrefix: "route.",
    accessMode: "read",
    outputKind: "route_snapshot",
  },
  data: {
    namePrefix: "data.",
    accessMode: "read",
    outputKind: "record_set",
  },
  docs: {
    namePrefix: "docs.",
    accessMode: "read",
    outputKind: "document_excerpt",
  },
  action: {
    namePrefix: "action.",
    accessMode: "write",
    outputKind: "action_receipt",
  },
  audit: {
    namePrefix: "audit.",
    accessMode: "audit",
    outputKind: "audit_entry_set",
  },
};

const PLATFORM_ADMIN_ASSISTANT_TOOL_REGISTRY: readonly PlatformAdminAssistantToolDescriptor[] =
  [
    {
      name: "route.list_navigation_nodes",
      family: "route",
      description:
        "List platform admin routes and navigation nodes the current actor may access.",
      accessMode: "read",
      callerScoped: true,
      outputKind: "route_snapshot",
    },
    {
      name: "route.get_route_details",
      family: "route",
      description:
        "Inspect a single platform admin route contract within the current actor scope.",
      accessMode: "read",
      callerScoped: true,
      outputKind: "route_snapshot",
    },
    {
      name: "data.list_tenant_summaries",
      family: "data",
      description:
        "Read tenant summary records visible to the current actor without widening permissions.",
      accessMode: "read",
      callerScoped: true,
      outputKind: "record_set",
    },
    {
      name: "data.get_tenant_governance_summary",
      family: "data",
      description:
        "Read governance state for a tenant already visible to the current actor.",
      accessMode: "read",
      callerScoped: true,
      outputKind: "record_set",
    },
    {
      name: "docs.search_platform_admin_policy",
      family: "docs",
      description:
        "Search approved platform admin documentation excerpts for policy-aware answers.",
      accessMode: "read",
      callerScoped: true,
      outputKind: "document_excerpt",
    },
    {
      name: "docs.get_platform_admin_plan_excerpt",
      family: "docs",
      description:
        "Retrieve a cited excerpt from approved platform admin planning documents.",
      accessMode: "read",
      callerScoped: true,
      outputKind: "document_excerpt",
    },
    {
      name: "action.create_platform_notice",
      family: "action",
      description:
        "Create a platform notice under the current actor identity and existing scope.",
      accessMode: "write",
      callerScoped: true,
      outputKind: "action_receipt",
    },
    {
      name: "action.set_maintenance_mode",
      family: "action",
      description:
        "Toggle platform maintenance mode under the current actor identity.",
      accessMode: "write",
      callerScoped: true,
      outputKind: "action_receipt",
    },
    {
      name: "audit.list_actor_audit_entries",
      family: "audit",
      description:
        "Read recent audit events already visible to the current actor.",
      accessMode: "audit",
      callerScoped: true,
      outputKind: "audit_entry_set",
    },
    {
      name: "audit.get_action_receipt_audit_entry",
      family: "audit",
      description:
        "Read the audit evidence for a previously issued action receipt without privilege escalation.",
      accessMode: "audit",
      callerScoped: true,
      outputKind: "audit_entry_set",
    },
  ] as const;

const PLATFORM_ADMIN_ASSISTANT_TOOL_MAP = new Map(
  PLATFORM_ADMIN_ASSISTANT_TOOL_REGISTRY.map((tool) => [tool.name, tool]),
);

for (const tool of PLATFORM_ADMIN_ASSISTANT_TOOL_REGISTRY) {
  const familyPolicy = PLATFORM_ADMIN_ASSISTANT_FAMILY_POLICY[tool.family];

  if (!tool.callerScoped) {
    throw new Error(
      `Platform Admin assistant tool "${tool.name}" must remain caller scoped.`,
    );
  }
  if (!tool.name.startsWith(familyPolicy.namePrefix)) {
    throw new Error(
      `Platform Admin assistant tool "${tool.name}" must use the "${familyPolicy.namePrefix}" prefix.`,
    );
  }
  if (tool.accessMode !== familyPolicy.accessMode) {
    throw new Error(
      `Platform Admin assistant tool "${tool.name}" must use access mode "${familyPolicy.accessMode}".`,
    );
  }
  if (tool.outputKind !== familyPolicy.outputKind) {
    throw new Error(
      `Platform Admin assistant tool "${tool.name}" must emit "${familyPolicy.outputKind}" outputs.`,
    );
  }
}

export function listPlatformAdminAssistantTools(): PlatformAdminAssistantToolDescriptor[] {
  return PLATFORM_ADMIN_ASSISTANT_TOOL_REGISTRY.map((tool) => ({ ...tool }));
}

export function getPlatformAdminAssistantTool(
  toolName: string,
): PlatformAdminAssistantToolDescriptor | null {
  const tool = PLATFORM_ADMIN_ASSISTANT_TOOL_MAP.get(toolName);
  return tool ? { ...tool } : null;
}

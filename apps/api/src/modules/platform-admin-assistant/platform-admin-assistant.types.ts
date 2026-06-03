export type PlatformAdminAssistantProviderKind = "mock";

export const PLATFORM_ADMIN_ASSISTANT_PROVIDER =
  "PLATFORM_ADMIN_ASSISTANT_PROVIDER";

export interface PlatformAdminAssistantControlPlaneIdentity {
  authMode: "bootstrap_headers" | "jwt_bearer";
  actorType: "platform_admin";
  actorId: string;
  realm: "platform";
  tenantId: null;
  roleFamilies: ["platform"];
  roles: string[];
  scopes: string[];
  requestId: string | null;
}

export interface CreatePlatformAdminAssistantSessionCommand {
  title?: string;
}

export interface CreatePlatformAdminAssistantMessageCommand {
  message: string;
}

export interface PlatformAdminAssistantCitation {
  title: string;
  section?: string;
  href?: string;
}

export interface PlatformAdminAssistantPlanStep {
  stepId: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
}

export interface PlatformAdminAssistantActionPlan {
  planId: string;
  title: string;
  summary: string;
  steps: PlatformAdminAssistantPlanStep[];
}

export interface PlatformAdminAssistantProviderResponse {
  answer: string;
  citations: PlatformAdminAssistantCitation[];
  suggestedPrompts: string[];
  actionPlan: PlatformAdminAssistantActionPlan | null;
}

export interface PlatformAdminAssistantMessageRecord extends PlatformAdminAssistantProviderResponse {
  messageId: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface PlatformAdminAssistantSessionRecord {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  provider: PlatformAdminAssistantProviderKind;
  actor: PlatformAdminAssistantControlPlaneIdentity;
  latestAnswerPreview: string | null;
}

export interface PlatformAdminAssistantPlanRecord extends PlatformAdminAssistantActionPlan {
  sessionId: string;
  createdAt: string;
}

export interface PlatformAdminAssistantProviderRequest {
  session: PlatformAdminAssistantSessionRecord;
  message: string;
  history: PlatformAdminAssistantMessageRecord[];
}

export interface PlatformAdminAssistantProvider {
  readonly kind: PlatformAdminAssistantProviderKind;
  generate(
    request: PlatformAdminAssistantProviderRequest,
  ): Promise<PlatformAdminAssistantProviderResponse>;
}

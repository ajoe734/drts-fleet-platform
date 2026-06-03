import type {
  ActionReceipt,
  CreatePlatformNoticeCommand,
  ResourceActionDescriptor,
  SetPlatformMaintenanceModeCommand,
} from "@drts/contracts";

export type PlatformAdminAssistantProviderKind = "mock";

export type PlatformAdminAssistantDispatchRisk =
  | "low"
  | "medium"
  | "high"
  | "external";

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

export type PlatformAdminAssistantActionToolName =
  | "action.create_platform_notice"
  | "action.set_maintenance_mode";

interface PlatformAdminAssistantActionPayloadMap {
  "action.create_platform_notice": CreatePlatformNoticeCommand;
  "action.set_maintenance_mode": SetPlatformMaintenanceModeCommand;
}

export type PlatformAdminAssistantActionCommand<
  TToolName extends PlatformAdminAssistantActionToolName =
    PlatformAdminAssistantActionToolName,
> = {
  toolName: TToolName;
  payload: PlatformAdminAssistantActionPayloadMap[TToolName];
};

export interface ExecutePlatformAdminAssistantActionCommand extends PlatformAdminAssistantActionCommand {
  reason?: string | null;
}

export interface PlatformAdminAssistantActionPreview {
  toolName: PlatformAdminAssistantActionToolName;
  descriptor: ResourceActionDescriptor;
  confirmationRequired: boolean;
}

export interface PlatformAdminAssistantActionExecutionResult {
  receipt: ActionReceipt;
  assistantAuditId: string;
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

export interface PlatformAdminAssistantDispatchPacketPayload {
  schema: "assistant_dispatch_packet.v1";
  source: "platform-admin-assistant";
  assistantSessionId: string;
  actorId: string;
  taskId: string;
  title: string;
  summary: string;
  owner: string;
  reviewer: string;
  baseBranch?: string | null;
  planningRef?: string | null;
  dependencies: string[];
  artifacts: string[];
  acceptance: string[];
  risk: PlatformAdminAssistantDispatchRisk;
  createdAt: string;
  humanConfirmedAt: string;
}

export interface PlatformAdminAssistantDispatchPacketSignature {
  algorithm: "hmac-sha256";
  keyId: string;
  signedAt: string;
  value: string;
}

export interface PlatformAdminAssistantSignedDispatchPacket {
  payload: PlatformAdminAssistantDispatchPacketPayload;
  signature: PlatformAdminAssistantDispatchPacketSignature;
}

export interface PlatformAdminAssistantSubmitDispatchPacketCommand {
  packet: PlatformAdminAssistantSignedDispatchPacket;
  dryRun?: boolean;
}

export interface PlatformAdminAssistantDispatchTaskStatus {
  blocked: boolean;
  dirtyPaths: string[];
  matchedGlobs: string[];
}

export interface PlatformAdminAssistantSubmitDispatchPacketResult {
  accepted: boolean;
  dryRun: boolean;
  taskId: string;
  taskBriefPath: string;
  baseBranch: string;
  track: string;
  treeGuard: PlatformAdminAssistantDispatchTaskStatus;
  queued: boolean;
  queueEvent: Record<string, unknown> | null;
  warnings: string[];
}

export interface PlatformAdminAssistantTaskRuntimeStatus {
  task: {
    id: string;
    status: string;
    owner: string;
    reviewer: string;
    title: string;
    next: string | null;
    artifacts: string[];
    dependsOn: string[];
    lastUpdate: string | null;
  };
  supervisor: {
    lifecycle: string;
    startedAt: string | null;
    lastHeartbeatAt: string | null;
  };
  queue: {
    events: Array<{
      eventId: string;
      reason: string;
      targetAgent: string;
      status: string;
    }>;
    workers: Array<{
      runId: string;
      agentId: string;
      status: string;
      queueEventId: string;
      lastEventAt: string | null;
      lastErrorSummary: string | null;
    }>;
  };
  integration: {
    integrationStatus: string;
    prUrl: string | null;
    ciStatus: string | null;
    ciRunUrl: string | null;
    devDeployRunUrl: string | null;
    devDeploySha: string | null;
    mergedRef: string | null;
  } | null;
}

import { randomUUID } from "node:crypto";

import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { toActionReceipt } from "../../common/action-receipt";
import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { PlatformAdminService } from "../platform-admin/platform-admin.service";
import type { RetrievalResult } from "./knowledge";
import {
  getApprovedSource,
  PlatformAdminAssistantKnowledgeService,
} from "./knowledge";
import { resolvePlatformAdminAssistantAction } from "./platform-admin-assistant.actions";
import { createPlatformAdminAssistantDevelopmentArtifacts } from "./platform-admin-assistant.development";
import { PLATFORM_ADMIN_ASSISTANT_PROVIDER } from "./platform-admin-assistant.types";
import type {
  CreatePlatformAdminAssistantMessageCommand,
  PlatformAdminAssistantDevelopmentArtifactCommand,
  PlatformAdminAssistantDevelopmentArtifactRecord,
  ExecutePlatformAdminAssistantActionCommand,
  PlatformAdminAssistantActionCommand,
  PlatformAdminAssistantActionExecutionResult,
  PlatformAdminAssistantActionPreview,
  CreatePlatformAdminAssistantSessionCommand,
  PlatformAdminAssistantControlPlaneIdentity,
  PlatformAdminAssistantMessageRecord,
  PlatformAdminAssistantPlanRecord,
  PlatformAdminAssistantProvider,
  PlatformAdminAssistantProviderResponse,
  PlatformAdminAssistantSessionRecord,
} from "./platform-admin-assistant.types";

@Injectable()
export class PlatformAdminAssistantService {
  private readonly sessions = new Map<
    string,
    PlatformAdminAssistantSessionRecord
  >();

  private readonly messages = new Map<
    string,
    PlatformAdminAssistantMessageRecord[]
  >();

  private readonly plans = new Map<
    string,
    PlatformAdminAssistantPlanRecord[]
  >();

  private readonly developmentArtifacts = new Map<
    string,
    PlatformAdminAssistantDevelopmentArtifactRecord[]
  >();

  constructor(
    @Inject(PLATFORM_ADMIN_ASSISTANT_PROVIDER)
    private readonly assistantProvider: PlatformAdminAssistantProvider,
    private readonly platformAdminService: PlatformAdminService,
    private readonly auditNotificationService: AuditNotificationService,
    private readonly knowledgeService: PlatformAdminAssistantKnowledgeService,
  ) {}

  listSessions(identity: BootstrapRequestIdentity | null) {
    const actor = this.requirePlatformAdminIdentity(identity);

    return [...this.sessions.values()]
      .filter((session) => session.actor.actorId === actor.actorId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((session) => ({
        ...session,
        actor: this.cloneActor(session.actor),
      }));
  }

  createSession(
    identity: BootstrapRequestIdentity | null,
    command: CreatePlatformAdminAssistantSessionCommand = {},
  ) {
    const actor = this.requirePlatformAdminIdentity(identity);
    const now = new Date().toISOString();
    const sessionId = `paas_${randomUUID()}`;
    const session: PlatformAdminAssistantSessionRecord = {
      sessionId,
      title: command.title?.trim() || "New Platform Admin Assistant Session",
      createdAt: now,
      updatedAt: now,
      provider: this.assistantProvider.kind,
      actor,
      latestAnswerPreview: null,
    };

    this.sessions.set(sessionId, session);
    this.messages.set(sessionId, []);
    this.plans.set(sessionId, []);

    return { ...session, actor: this.cloneActor(session.actor) };
  }

  listMessages(sessionId: string, identity: BootstrapRequestIdentity | null) {
    this.requireOwnedSession(sessionId, identity);

    return (this.messages.get(sessionId) ?? []).map((message) =>
      this.cloneMessage(message),
    );
  }

  listPlans(sessionId: string, identity: BootstrapRequestIdentity | null) {
    this.requireOwnedSession(sessionId, identity);

    return (this.plans.get(sessionId) ?? []).map((plan) => ({
      ...plan,
      steps: plan.steps.map((step) => ({ ...step })),
    }));
  }

  listDevelopmentArtifacts(
    sessionId: string,
    identity: BootstrapRequestIdentity | null,
  ) {
    this.requireOwnedSession(sessionId, identity);

    return (this.developmentArtifacts.get(sessionId) ?? []).map((artifact) =>
      this.cloneDevelopmentArtifact(artifact),
    );
  }

  async createMessage(
    sessionId: string,
    identity: BootstrapRequestIdentity | null,
    command: CreatePlatformAdminAssistantMessageCommand,
  ): Promise<PlatformAdminAssistantProviderResponse> {
    const session = this.requireOwnedSession(sessionId, identity);
    const trimmedMessage = command.message?.trim();

    if (!trimmedMessage) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_MESSAGE_REQUIRED",
        "Assistant message content is required.",
      );
    }

    const sessionMessages = this.messages.get(sessionId) ?? [];
    const userMessage: PlatformAdminAssistantMessageRecord = {
      messageId: `paas_msg_${randomUUID()}`,
      sessionId,
      role: "user",
      content: trimmedMessage,
      answer: "",
      citations: [],
      suggestedPrompts: [],
      actionPlan: null,
      createdAt: new Date().toISOString(),
    };
    sessionMessages.push(userMessage);

    const providerResponse = await this.generateProviderResponse(
      session,
      trimmedMessage,
      sessionMessages,
    );

    const assistantMessage: PlatformAdminAssistantMessageRecord = {
      messageId: `paas_msg_${randomUUID()}`,
      sessionId,
      role: "assistant",
      content: providerResponse.answer,
      answer: providerResponse.answer,
      citations: providerResponse.citations.map((citation) => ({
        ...citation,
      })),
      suggestedPrompts: [...providerResponse.suggestedPrompts],
      actionPlan: providerResponse.actionPlan
        ? {
            ...providerResponse.actionPlan,
            steps: providerResponse.actionPlan.steps.map((step) => ({
              ...step,
            })),
          }
        : null,
      createdAt: new Date().toISOString(),
    };
    sessionMessages.push(assistantMessage);
    this.messages.set(sessionId, sessionMessages);

    if (assistantMessage.actionPlan) {
      const planRecord: PlatformAdminAssistantPlanRecord = {
        ...assistantMessage.actionPlan,
        sessionId,
        createdAt: assistantMessage.createdAt,
        steps: assistantMessage.actionPlan.steps.map((step) => ({ ...step })),
      };
      this.plans.set(sessionId, [
        ...(this.plans.get(sessionId) ?? []),
        planRecord,
      ]);
    }

    const nextTitle =
      session.title === "New Platform Admin Assistant Session"
        ? this.deriveSessionTitle(trimmedMessage)
        : session.title;
    this.sessions.set(sessionId, {
      ...session,
      title: nextTitle,
      updatedAt: assistantMessage.createdAt,
      latestAnswerPreview: assistantMessage.answer.slice(0, 160),
    });

    return {
      answer: assistantMessage.answer,
      citations: assistantMessage.citations.map((citation) => ({
        ...citation,
      })),
      suggestedPrompts: [...assistantMessage.suggestedPrompts],
      actionPlan: assistantMessage.actionPlan
        ? {
            ...assistantMessage.actionPlan,
            steps: assistantMessage.actionPlan.steps.map((step) => ({
              ...step,
            })),
          }
        : null,
    };
  }

  async generateDevelopmentArtifacts(
    sessionId: string,
    identity: BootstrapRequestIdentity | null,
    command: PlatformAdminAssistantDevelopmentArtifactCommand,
  ): Promise<PlatformAdminAssistantDevelopmentArtifactRecord> {
    const session = this.requireOwnedSession(sessionId, identity);

    if (!command.requestTitle?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_DEV_REQUEST_TITLE_REQUIRED",
        "Development artifact generation requires a request title.",
      );
    }

    if (!command.requestedChange?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_DEV_REQUEST_CHANGE_REQUIRED",
        "Development artifact generation requires a requested change description.",
      );
    }

    if (!command.tasks?.length) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_DEV_TASKS_REQUIRED",
        "Development artifact generation requires at least one task brief definition.",
      );
    }

    const artifactRecord =
      await createPlatformAdminAssistantDevelopmentArtifacts({
        actorId: session.actor.actorId,
        sessionId,
        command,
      });

    this.developmentArtifacts.set(sessionId, [
      ...(this.developmentArtifacts.get(sessionId) ?? []),
      artifactRecord,
    ]);

    this.sessions.set(sessionId, {
      ...session,
      updatedAt: artifactRecord.createdAt,
      latestAnswerPreview: `Archived ${artifactRecord.files.length} development artifacts for ${artifactRecord.requestTitle}`.slice(
        0,
        160,
      ),
    });

    return this.cloneDevelopmentArtifact(artifactRecord);
  }

  previewAction(
    sessionId: string,
    identity: BootstrapRequestIdentity | null,
    command: PlatformAdminAssistantActionCommand,
  ): PlatformAdminAssistantActionPreview {
    this.requireOwnedSession(sessionId, identity);
    const resolvedAction = this.requireResolvedAction(command);

    return {
      toolName: resolvedAction.toolName,
      descriptor: { ...resolvedAction.descriptor },
      confirmationRequired: resolvedAction.descriptor.riskLevel !== "low",
    };
  }

  executeAction(
    sessionId: string,
    identity: BootstrapRequestIdentity | null,
    command: ExecutePlatformAdminAssistantActionCommand,
    requestId?: string,
  ): PlatformAdminAssistantActionExecutionResult {
    const actor = this.requirePlatformAdminIdentity(identity);
    this.requireOwnedSession(sessionId, identity);
    const resolvedAction = this.requireResolvedAction(command);

    if (!resolvedAction.descriptor.enabled) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ASSISTANT_ACTION_DISABLED",
        "Assistant action is currently disabled by its ResourceActionDescriptor.",
        {
          toolName: resolvedAction.toolName,
          disabledReasonCode:
            resolvedAction.descriptor.disabledReasonCode ?? null,
        },
      );
    }

    const normalizedReason = command.reason?.trim() ?? "";
    if (resolvedAction.descriptor.riskLevel === "high" && !normalizedReason) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_ACTION_REASON_REQUIRED",
        "High-risk assistant actions require a non-empty reason before execution.",
        {
          toolName: resolvedAction.toolName,
        },
      );
    }

    const domainResult = resolvedAction.execute(
      this.platformAdminService,
      requestId,
    );
    const receipt = toActionReceipt({
      auditLog: domainResult.auditLog,
      message: resolvedAction.successMessage,
    });
    const assistantAudit = this.auditNotificationService.recordAuditLog({
      actorId: actor.actorId,
      actorType: actor.actorType,
      tenantId: actor.tenantId,
      moduleName: "platform-admin-assistant",
      actionName: "execute_descriptor_backed_action",
      resourceType: receipt.resourceType,
      resourceId: receipt.resourceId,
      newValuesSummary: {
        assistantSessionId: sessionId,
        toolName: resolvedAction.toolName,
        riskLevel: resolvedAction.descriptor.riskLevel,
        requiresReason: resolvedAction.descriptor.requiresReason ?? false,
        reason: normalizedReason || null,
        domainAuditId: receipt.auditId,
      },
      ...(requestId ? { requestId } : {}),
    });

    return {
      receipt,
      assistantAuditId: assistantAudit.auditId,
    };
  }

  private requireOwnedSession(
    sessionId: string,
    identity: BootstrapRequestIdentity | null,
  ) {
    const actor = this.requirePlatformAdminIdentity(identity);
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "ASSISTANT_SESSION_NOT_FOUND",
        "Platform Admin assistant session was not found.",
        { sessionId },
      );
    }

    if (session.actor.actorId !== actor.actorId) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "ASSISTANT_SESSION_FORBIDDEN",
        "Platform Admin assistant sessions are scoped to the current human control-plane identity.",
        { sessionId, actorId: actor.actorId },
      );
    }

    return session;
  }

  private requirePlatformAdminIdentity(
    identity: BootstrapRequestIdentity | null,
  ): PlatformAdminAssistantControlPlaneIdentity {
    if (!identity || !identity.actorId) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "ASSISTANT_AUTH_REQUIRED",
        "Platform Admin assistant requires an authenticated platform control-plane identity.",
      );
    }

    if (
      identity.actorType !== "platform_admin" ||
      identity.realm !== "platform" ||
      !identity.roleFamilies.includes("platform")
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "ASSISTANT_PLATFORM_IDENTITY_REQUIRED",
        "Platform Admin assistant only supports the current authenticated platform admin identity.",
        {
          actorType: identity.actorType,
          realm: identity.realm,
        },
      );
    }

    return {
      authMode: identity.authMode,
      actorType: "platform_admin",
      actorId: identity.actorId,
      realm: "platform",
      tenantId: null,
      roleFamilies: ["platform"],
      roles: [...identity.roles],
      scopes: [...identity.scopes],
      requestId: identity.requestId,
    };
  }

  private requireResolvedAction(command: PlatformAdminAssistantActionCommand) {
    const resolvedAction = resolvePlatformAdminAssistantAction(
      this.platformAdminService,
      command,
    );

    if (!resolvedAction) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "ASSISTANT_ACTION_DESCRIPTOR_NOT_FOUND",
        "Assistant action descriptor could not be resolved from the registered tool set.",
        {
          toolName: command.toolName,
        },
      );
    }

    return resolvedAction;
  }

  private async generateProviderResponse(
    session: PlatformAdminAssistantSessionRecord,
    message: string,
    history: PlatformAdminAssistantMessageRecord[],
  ): Promise<PlatformAdminAssistantProviderResponse> {
    const retrieval = this.knowledgeService.answer({ question: message });

    try {
      return await this.assistantProvider.generate({
        session,
        message,
        history: history.map((entry) => this.cloneMessage(entry)),
        retrieval,
      });
    } catch (error) {
      return this.buildDegradedProviderResponse(error, retrieval);
    }
  }

  private buildDegradedProviderResponse(
    error: unknown,
    retrieval: RetrievalResult,
  ): PlatformAdminAssistantProviderResponse {
    const reason = this.classifyProviderFailure(error);
    const citations =
      retrieval.kind === "grounded"
        ? retrieval.citations
        : retrieval.suggestedSources;

    return {
      answer:
        reason === "missing_key"
          ? "Assistant provider is in degraded mode because no runtime provider key is configured. I can still point you to approved Platform Admin docs and safe follow-up paths."
          : reason === "quota"
            ? "Assistant provider is temporarily degraded because the provider quota or rate budget is exhausted. I can still route you to approved docs and manual follow-up guidance."
            : "Assistant provider is temporarily unavailable. I can still help with approved docs search and safe manual follow-up guidance.",
      citations: citations.map((citation) => {
        const result = {
          title:
            getApprovedSource(citation.sourcePath)?.label ??
            citation.sourcePath,
          href: citation.sourcePath,
        };
        return citation.section === null
          ? result
          : { ...result, section: citation.section };
      }),
      suggestedPrompts: [
        "Search approved Platform Admin policy for this workflow.",
        "List the relevant control-plane routes for this task.",
        "Explain the safest manual follow-up while the provider is degraded.",
      ],
      actionPlan: null,
    };
  }

  private cloneDevelopmentArtifact(
    artifact: PlatformAdminAssistantDevelopmentArtifactRecord,
  ): PlatformAdminAssistantDevelopmentArtifactRecord {
    return {
      ...artifact,
      files: artifact.files.map((file) => ({ ...file })),
      citations: artifact.citations.map((citation) => ({ ...citation })),
      tasks: artifact.tasks.map((task) => ({
        ...task,
        dependsOn: [...(task.dependsOn ?? [])],
        artifacts: [...(task.artifacts ?? [])],
        acceptance: [...(task.acceptance ?? [])],
        guardrails: [...(task.guardrails ?? [])],
        verification: [...(task.verification ?? [])],
      })),
    };
  }

  private classifyProviderFailure(
    error: unknown,
  ): "missing_key" | "quota" | "down" {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code.toLowerCase()
        : "";
    const message =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message.toLowerCase()
        : "";

    if (
      code.includes("missing") ||
      code.includes("no_api_key") ||
      code.includes("key_missing") ||
      message.includes("api key") ||
      message.includes("credential not configured") ||
      message.includes("missing key")
    ) {
      return "missing_key";
    }

    if (
      code.includes("quota") ||
      code.includes("rate_limit") ||
      code.includes("budget") ||
      message.includes("quota") ||
      message.includes("rate limit") ||
      message.includes("budget")
    ) {
      return "quota";
    }

    return "down";
  }

  private deriveSessionTitle(message: string) {
    return message.length > 48 ? `${message.slice(0, 45)}...` : message;
  }

  private cloneActor(actor: PlatformAdminAssistantControlPlaneIdentity) {
    return {
      ...actor,
      roleFamilies: ["platform"] as ["platform"],
      roles: [...actor.roles],
      scopes: [...actor.scopes],
    };
  }

  private cloneMessage(message: PlatformAdminAssistantMessageRecord) {
    return {
      ...message,
      citations: message.citations.map((citation) => ({ ...citation })),
      suggestedPrompts: [...message.suggestedPrompts],
      actionPlan: message.actionPlan
        ? {
            ...message.actionPlan,
            steps: message.actionPlan.steps.map((step) => ({ ...step })),
          }
        : null,
    };
  }
}

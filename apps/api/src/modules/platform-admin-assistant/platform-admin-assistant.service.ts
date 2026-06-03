import { randomUUID } from "node:crypto";

import { HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";

import { toActionReceipt } from "../../common/action-receipt";
import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { LlmGatewayService } from "../../common/llm-gateway";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import type { PlatformAdminAssistantToolResult } from "../platform-admin/platform-admin-assistant.policy";
import { authorizePlatformAdminAssistantToolCall } from "../platform-admin/platform-admin-assistant.policy";
import { PlatformAdminService } from "../platform-admin/platform-admin.service";
import { detectInjectionSignals } from "./knowledge/prompt-injection";
import { PlatformAdminAssistantAuditRecorder } from "./platform-admin-assistant.audit";
import {
  findResidualSecrets,
  redactText,
} from "./platform-admin-assistant.redaction";
import type { RetrievalResult } from "./knowledge";
import {
  getApprovedSource,
  PlatformAdminAssistantKnowledgeService,
} from "./knowledge";
import { resolvePlatformAdminAssistantAction } from "./platform-admin-assistant.actions";
import { createPlatformAdminAssistantDevelopmentArtifacts } from "./platform-admin-assistant.development";
import { PlatformAdminAssistantReadToolService } from "./platform-admin-assistant-read-tools.service";
import { PLATFORM_ADMIN_ASSISTANT_PROVIDER } from "./platform-admin-assistant.types";
import type {
  CreatePlatformAdminAssistantMessageCommand,
  ExecutePlatformAdminAssistantReadToolCommand,
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
    private readonly platformAdminAssistantReadToolService: PlatformAdminAssistantReadToolService,
    private readonly platformAdminService: PlatformAdminService,
    private readonly auditNotificationService: AuditNotificationService,
    private readonly knowledgeService: PlatformAdminAssistantKnowledgeService,
    @Optional()
    private readonly llmGatewayService: LlmGatewayService = new LlmGatewayService(),
    @Optional()
    private readonly assistantAuditRecorder: PlatformAdminAssistantAuditRecorder = new PlatformAdminAssistantAuditRecorder(),
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
    const redactedUserMessage = redactText(trimmedMessage);
    const userMessage: PlatformAdminAssistantMessageRecord = {
      messageId: `paas_msg_${randomUUID()}`,
      sessionId,
      role: "user",
      content: redactedUserMessage.text,
      answer: "",
      citations: [],
      suggestedPrompts: [],
      actionPlan: null,
      createdAt: new Date().toISOString(),
    };
    sessionMessages.push(userMessage);

    this.assertSafeTranscriptRecord(userMessage);
    this.assistantAuditRecorder.recordMessage({
      actorId: session.actor.actorId,
      sessionId,
      route: this.assistantSessionRoute(sessionId),
      redactionApplied: redactedUserMessage.redacted,
      metadata: {
        role: "user",
        provider: session.provider,
        requestId: session.actor.requestId,
        content: userMessage.content,
      },
    });

    const reservation = this.llmGatewayService.reserveRequest({
      actorKey: session.actor.actorId,
      requestText: this.buildProviderUsageText(sessionMessages),
    });

    const providerResponse = await this.generateProviderResponse(
      session,
      trimmedMessage,
      sessionMessages,
    );
    this.llmGatewayService.completeRequest({
      reservation,
      responseText: providerResponse.answer,
    });

    const safeProviderResponse =
      this.sanitizeProviderResponse(providerResponse);

    const assistantMessage: PlatformAdminAssistantMessageRecord = {
      messageId: `paas_msg_${randomUUID()}`,
      sessionId,
      role: "assistant",
      content: safeProviderResponse.answer,
      answer: safeProviderResponse.answer,
      citations: safeProviderResponse.citations.map((citation) => ({
        ...citation,
      })),
      suggestedPrompts: [...safeProviderResponse.suggestedPrompts],
      actionPlan: safeProviderResponse.actionPlan
        ? {
            ...safeProviderResponse.actionPlan,
            steps: safeProviderResponse.actionPlan.steps.map((step) => ({
              ...step,
            })),
          }
        : null,
      createdAt: new Date().toISOString(),
    };
    sessionMessages.push(assistantMessage);
    this.assertSafeTranscriptRecord(assistantMessage);
    this.messages.set(sessionId, sessionMessages);

    this.assistantAuditRecorder.recordMessage({
      actorId: session.actor.actorId,
      sessionId,
      route: this.assistantSessionRoute(sessionId),
      metadata: {
        role: "assistant",
        requestId: session.actor.requestId,
        content: assistantMessage.answer,
        suggestions: assistantMessage.suggestedPrompts,
        citations: assistantMessage.citations,
      },
    });

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
      this.assertSafeTranscriptRecord(planRecord);
      this.assistantAuditRecorder.recordPlanCreated({
        actorId: session.actor.actorId,
        sessionId,
        route: this.assistantSessionRoute(sessionId),
        actionId: assistantMessage.actionPlan.planId,
        metadata: {
          title: assistantMessage.actionPlan.title,
          summary: assistantMessage.actionPlan.summary,
          stepCount: assistantMessage.actionPlan.steps.length,
        },
      });
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
    this.authorizeActionTool(command, identity);
    const resolvedAction = this.requireResolvedAction(command);

    return {
      toolName: resolvedAction.toolName,
      descriptor: { ...resolvedAction.descriptor },
      confirmationRequired: resolvedAction.descriptor.riskLevel !== "low",
    };
  }

  async executeReadTool(
    sessionId: string,
    identity: BootstrapRequestIdentity | null,
    command: ExecutePlatformAdminAssistantReadToolCommand,
  ): Promise<PlatformAdminAssistantToolResult> {
    this.requireOwnedSession(sessionId, identity);

    return this.platformAdminAssistantReadToolService.execute(
      identity,
      command,
    );
  }

  executeAction(
    sessionId: string,
    identity: BootstrapRequestIdentity | null,
    command: ExecutePlatformAdminAssistantActionCommand,
    requestId?: string,
  ): PlatformAdminAssistantActionExecutionResult {
    const actor = this.requirePlatformAdminIdentity(identity);
    this.requireOwnedSession(sessionId, identity);
    this.authorizeActionTool(command, identity);
    const resolvedAction = this.requireResolvedAction(command);

    if (!resolvedAction.descriptor.enabled) {
      this.assistantAuditRecorder.recordActionBlocked({
        actorId: actor.actorId,
        sessionId,
        route: this.assistantActionRoute(sessionId, resolvedAction.toolName),
        actionId: resolvedAction.toolName,
        metadata: {
          reasonCode: "descriptor_disabled",
          disabledReasonCode:
            resolvedAction.descriptor.disabledReasonCode ?? null,
        },
      });
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
      this.assistantAuditRecorder.recordActionBlocked({
        actorId: actor.actorId,
        sessionId,
        route: this.assistantActionRoute(sessionId, resolvedAction.toolName),
        actionId: resolvedAction.toolName,
        metadata: {
          reasonCode: "reason_required",
        },
      });
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ASSISTANT_ACTION_REASON_REQUIRED",
        "High-risk assistant actions require a non-empty reason before execution.",
        {
          toolName: resolvedAction.toolName,
        },
      );
    }

    this.assistantAuditRecorder.recordActionConfirmed({
      actorId: actor.actorId,
      sessionId,
      route: this.assistantActionRoute(sessionId, resolvedAction.toolName),
      actionId: resolvedAction.toolName,
      metadata: {
        riskLevel: resolvedAction.descriptor.riskLevel,
        reason: normalizedReason || null,
      },
    });

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

    this.assistantAuditRecorder.recordActionExecuted({
      actorId: actor.actorId,
      sessionId,
      route: this.assistantActionRoute(sessionId, resolvedAction.toolName),
      actionId: resolvedAction.toolName,
      resourceType: receipt.resourceType,
      resourceId: receipt.resourceId,
      domainAuditId: receipt.auditId,
      metadata: {
        assistantAuditId: assistantAudit.auditId,
        riskLevel: resolvedAction.descriptor.riskLevel,
        reason: normalizedReason || null,
        receipt,
      },
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
        message: redactText(message).text,
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

  private sanitizeProviderResponse(
    response: PlatformAdminAssistantProviderResponse,
  ): PlatformAdminAssistantProviderResponse {
    const redactedAnswer = redactText(response.answer);
    const injectionScan = detectInjectionSignals(redactedAnswer.text);
    const safeAnswer = injectionScan.hasInjectionRisk
      ? "Assistant response withheld because provider output contained prompt-injection-like content."
      : redactedAnswer.text;

    return {
      answer: safeAnswer,
      citations: response.citations.map((citation) => ({
        title: redactText(citation.title).text,
        ...(citation.section
          ? { section: redactText(citation.section).text }
          : {}),
        ...(citation.href ? { href: citation.href } : {}),
      })),
      suggestedPrompts: response.suggestedPrompts.map(
        (prompt) => redactText(prompt).text,
      ),
      actionPlan: response.actionPlan
        ? {
            ...response.actionPlan,
            title: redactText(response.actionPlan.title).text,
            summary: redactText(response.actionPlan.summary).text,
            steps: response.actionPlan.steps.map((step) => ({
              ...step,
              title: redactText(step.title).text,
            })),
          }
        : null,
    };
  }

  private authorizeActionTool(
    command: PlatformAdminAssistantActionCommand,
    identity: BootstrapRequestIdentity | null,
  ): void {
    const decision = authorizePlatformAdminAssistantToolCall(
      {
        toolName: command.toolName,
      },
      identity,
    );

    if (!decision.allowed) {
      throw new ApiRequestError(
        decision.reasonCode === "missing_identity"
          ? HttpStatus.UNAUTHORIZED
          : HttpStatus.FORBIDDEN,
        "ASSISTANT_TOOL_POLICY_REJECTED",
        decision.reason,
        {
          toolName: command.toolName,
          reasonCode: decision.reasonCode,
        },
      );
    }
  }

  private assistantSessionRoute(sessionId: string): string {
    return `/platform-admin/assistant/sessions/${sessionId}`;
  }

  private assistantActionRoute(sessionId: string, toolName: string): string {
    return `${this.assistantSessionRoute(sessionId)}/actions/${toolName}`;
  }

  private buildProviderUsageText(
    history: PlatformAdminAssistantMessageRecord[],
  ): string {
    return history.map((entry) => `${entry.role}:${entry.content}`).join("\n");
  }

  private assertSafeTranscriptRecord(record: unknown): void {
    const residualSecrets = findResidualSecrets(record).filter(
      (path) => !path.endsWith(".href") && !path.endsWith(".sourcePath"),
    );
    if (residualSecrets.length > 0) {
      throw new Error(
        `Assistant transcript redaction failed for: ${residualSecrets.join(", ")}`,
      );
    }
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

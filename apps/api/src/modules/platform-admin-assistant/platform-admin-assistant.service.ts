import { randomUUID } from "node:crypto";

import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { PLATFORM_ADMIN_ASSISTANT_PROVIDER } from "./platform-admin-assistant.types";
import type {
  CreatePlatformAdminAssistantMessageCommand,
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

  constructor(
    @Inject(PLATFORM_ADMIN_ASSISTANT_PROVIDER)
    private readonly assistantProvider: PlatformAdminAssistantProvider,
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

    const providerResponse = await this.assistantProvider.generate({
      session,
      message: trimmedMessage,
      history: sessionMessages.map((message) => this.cloneMessage(message)),
    });

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

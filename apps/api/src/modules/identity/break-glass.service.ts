import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import type {
  BreakGlassGrantRecord,
  CloseBreakGlassGrantCommand,
  CreateBreakGlassRequestCommand,
  IamBreakGlassActivationCommand,
  IamMutationMetadata,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { SecurityEventsService } from "../security-events/security-events.service";
import { IdentityRepository } from "./identity.repository";

export const BREAK_GLASS_MAX_TTL_MINUTES = 60;
export const BREAK_GLASS_ALLOWED_SCOPES = [
  "identity:read",
  "identity:roles:read",
  "identity:sessions:read",
  "identity:sessions:revoke",
  "security:audit:read",
] as const;

function actorId(identity: BootstrapRequestIdentity) {
  return identity.principalId ?? identity.actorId;
}

function uniqueScopes(scopes: readonly string[]) {
  return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))];
}

@Injectable()
export class BreakGlassService {
  private readonly grants = new Map<string, BreakGlassGrantRecord>();

  constructor(
    // Kept as an explicit dependency so activation is composed with the durable
    // session authority, rather than a standalone bearer-token shortcut.
    @Optional() private readonly identityRepository?: IdentityRepository,
    @Optional() private readonly securityEventsService?: SecurityEventsService,
  ) {}

  async request(
    identity: BootstrapRequestIdentity,
    command: CreateBreakGlassRequestCommand,
  ) {
    const requesterId = actorId(identity);
    const scopes = uniqueScopes(command.requestedScopes);
    this.assertRequester(requesterId);
    if (!requesterId)
      throw new ApiRequestError(
        401,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Authenticated principal is required.",
      );
    this.assertMutation(command.mutation);
    this.assertScopes(scopes);
    if (!command.reasonText.trim() || !command.proofReference.trim()) {
      throw new ApiRequestError(
        400,
        "IAM_REASON_REQUIRED",
        "Break-glass requires a reason and phishing-resistant or vault proof reference.",
      );
    }
    const now = new Date().toISOString();
    const grant: BreakGlassGrantRecord = {
      grantId: `bg_${randomUUID()}`,
      requesterId,
      approverId: null,
      requestedScopes: scopes,
      grantedScopes: [],
      reasonCode: command.reasonCode.trim(),
      reasonText: command.reasonText.trim(),
      proofReference: command.proofReference.trim(),
      status: "requested",
      requestedAt: now,
      approvedAt: null,
      activatedAt: null,
      expiresAt: null,
      closedAt: null,
      closedById: null,
      closeReason: null,
      sessionId: null,
      postUseReviewRequired: false,
      postUseReviewedAt: null,
      version: 1,
    };
    this.grants.set(grant.grantId, grant);
    this.event(identity, grant, "break_glass.requested", "success");
    return { ...grant };
  }

  async approve(
    identity: BootstrapRequestIdentity,
    grantId: string,
    mutation: IamMutationMetadata,
  ) {
    const grant = this.get(grantId);
    const approverId = actorId(identity);
    this.assertRequester(approverId);
    if (!approverId)
      throw new ApiRequestError(
        401,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Authenticated principal is required.",
      );
    this.assertMutation(mutation);
    if (grant.requesterId === approverId)
      throw new ApiRequestError(
        403,
        "AUTH_APPROVAL_REQUIRED",
        "Requester cannot approve their own break-glass request.",
      );
    if (grant.status !== "requested")
      throw new ApiRequestError(
        409,
        "IAM_CONCURRENCY_CONFLICT",
        "Break-glass request is no longer awaiting approval.",
      );
    grant.approverId = approverId;
    grant.approvedAt = new Date().toISOString();
    grant.status = "approved";
    grant.version += 1;
    this.event(identity, grant, "break_glass.approved", "success");
    return { ...grant };
  }

  async activate(
    identity: BootstrapRequestIdentity,
    command: IamBreakGlassActivationCommand,
  ) {
    const grant = this.get(command.requestId);
    const requesterId = actorId(identity);
    this.assertRequester(requesterId);
    if (!requesterId)
      throw new ApiRequestError(
        401,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Authenticated principal is required.",
      );
    this.assertMutation(command.mutation);
    if (grant.requesterId !== requesterId || grant.status !== "approved")
      throw new ApiRequestError(
        403,
        "AUTH_APPROVAL_REQUIRED",
        "Only the approved requester may activate this break-glass request.",
      );
    if (
      !Number.isInteger(command.requestedDurationMinutes) ||
      command.requestedDurationMinutes < 1 ||
      command.requestedDurationMinutes > BREAK_GLASS_MAX_TTL_MINUTES
    )
      throw new ApiRequestError(
        400,
        "IAM_BREAK_GLASS_TTL_INVALID",
        "Break-glass duration must be between 1 and 60 minutes.",
      );
    const requestedScopes = uniqueScopes(command.requestedScope);
    this.assertScopes(requestedScopes);
    if (
      !requestedScopes.every((scope) => grant.requestedScopes.includes(scope))
    )
      throw new ApiRequestError(
        403,
        "AUTHZ_SCOPE_DENIED",
        "Activated scope cannot exceed the approved break-glass request.",
      );
    const now = new Date();
    grant.grantedScopes = requestedScopes;
    grant.activatedAt = now.toISOString();
    grant.expiresAt = new Date(
      now.getTime() + command.requestedDurationMinutes * 60_000,
    ).toISOString();
    grant.status = "active";
    grant.postUseReviewRequired = true;
    grant.version += 1;
    this.event(identity, grant, "break_glass.activated", "success");
    return { ...grant };
  }

  async bindSession(grantId: string, sessionId: string) {
    const grant = this.get(grantId);
    if (grant.status !== "active" || !grant.expiresAt)
      throw new ApiRequestError(
        409,
        "IAM_CONCURRENCY_CONFLICT",
        "Break-glass grant is not active.",
      );
    grant.sessionId = sessionId;
    grant.version += 1;
    return { ...grant };
  }

  async close(
    identity: BootstrapRequestIdentity,
    grantId: string,
    command: CloseBreakGlassGrantCommand,
  ) {
    const grant = this.get(grantId);
    const closerId = actorId(identity);
    this.assertRequester(closerId);
    if (!closerId)
      throw new ApiRequestError(
        401,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Authenticated principal is required.",
      );
    this.assertMutation(command.mutation);
    if (grant.status !== "active")
      throw new ApiRequestError(
        409,
        "IAM_CONCURRENCY_CONFLICT",
        "Only active break-glass grants can be closed.",
      );
    grant.status = "closed";
    grant.closedAt = new Date().toISOString();
    grant.closedById = closerId;
    grant.closeReason = command.mutation.reasonCode;
    grant.version += 1;
    if (grant.sessionId)
      await this.identityRepository?.revokeSession(
        grant.sessionId,
        "BREAK_GLASS_CLOSED",
        closerId,
      );
    this.event(identity, grant, "break_glass.closed", "revoked");
    return { ...grant };
  }

  async expireDue(now = new Date()) {
    const expired: BreakGlassGrantRecord[] = [];
    for (const grant of this.grants.values()) {
      if (
        grant.status === "active" &&
        grant.expiresAt &&
        Date.parse(grant.expiresAt) <= now.getTime()
      ) {
        grant.status = "expired";
        grant.closedAt = now.toISOString();
        grant.closeReason = "BREAK_GLASS_TTL_EXPIRED";
        grant.version += 1;
        if (grant.sessionId)
          await this.identityRepository?.revokeSession(
            grant.sessionId,
            "BREAK_GLASS_TTL_EXPIRED",
          );
        this.event(
          {
            actorId: null,
            principalId: null,
            actorType: "system",
            realm: "system",
            tenantId: null,
            roleFamilies: [],
            roles: [],
            scopes: [],
            authMode: "jwt_bearer",
            requestId: null,
          },
          grant,
          "break_glass.expired",
          "expired",
        );
        expired.push({ ...grant });
      }
    }
    return expired;
  }

  get(grantId: string) {
    const grant = this.grants.get(grantId);
    if (!grant)
      throw new ApiRequestError(
        404,
        "IAM_BREAK_GLASS_NOT_FOUND",
        "Break-glass request was not found.",
      );
    return grant;
  }

  private assertRequester(id: string | null) {
    if (!id)
      throw new ApiRequestError(
        401,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Authenticated principal is required.",
      );
  }
  private assertMutation(mutation: IamMutationMetadata) {
    if (!mutation?.reasonCode?.trim())
      throw new ApiRequestError(
        400,
        "IAM_REASON_REQUIRED",
        "reasonCode is required.",
      );
    if (!mutation.stepUpReference?.trim())
      throw new ApiRequestError(
        403,
        "IAM_STEP_UP_REQUIRED",
        "Fresh phishing-resistant step-up proof is required.",
      );
  }
  private assertScopes(scopes: string[]) {
    if (
      !scopes.length ||
      !scopes.every((scope) =>
        BREAK_GLASS_ALLOWED_SCOPES.includes(scope as never),
      )
    )
      throw new ApiRequestError(
        403,
        "AUTHZ_SCOPE_DENIED",
        "Break-glass scope is not permitted by policy.",
      );
  }
  private event(
    identity: BootstrapRequestIdentity,
    grant: BreakGlassGrantRecord,
    eventType: string,
    outcome: "success" | "expired" | "revoked",
  ) {
    this.securityEventsService?.recordEvent({
      actorId: actorId(identity),
      actorType: identity.actorType,
      subjectId: grant.requesterId,
      realm: identity.realm,
      tenantId: null,
      partnerId: null,
      eventType,
      eventFamily: "break_glass",
      outcome,
      severity: "critical",
      targetType: "break_glass_grant",
      targetId: grant.grantId,
      sessionId: grant.sessionId,
      tokenId: null,
      authMethods: identity.amr ?? [],
      sourceIp: null,
      userAgent: null,
      requestId: identity.requestId,
      traceId: null,
      reasonCode: grant.reasonCode,
      approvalId: grant.approverId,
      beforeSummary: null,
      afterSummary: { status: grant.status, scopes: grant.grantedScopes },
      maskedContext: { grantId: grant.grantId },
    });
  }
}

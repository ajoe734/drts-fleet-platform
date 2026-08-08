import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Optional } from "@nestjs/common";

import type {
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityRoleBindingRecord,
  CreatePrivilegedRoleRequestCommand,
  IdentityContext,
  ListPrivilegedRoleRequestsQuery,
  PrivilegedRoleRequestDecisionCommand,
  PrivilegedRoleRequestRecord,
  PrivilegedRoleRequestRemovalCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { CreateSecurityEventInput } from "../../common/audit/security-event-sanitizer";
import { IdentityRepository } from "./identity.repository";
import { SecurityEventsService } from "../security-events/security-events.service";

const PRIVILEGED_ROLES_BY_REALM = {
  platform: new Set(["superadmin", "platform_admin"]),
  ops: new Set(["operator", "ops_user"]),
  tenant: new Set([
    "tenant_admin",
    "tenant_ops_admin",
    "tenant_finance_admin",
  ]),
} as const;

const LAST_ADMIN_ROLES_BY_REALM = {
  platform: new Set(["superadmin", "platform_admin"]),
  ops: new Set(["operator", "ops_user"]),
  tenant: new Set(["tenant_admin"]),
} as const;

const STEP_UP_MAX_AGE_MS = 15 * 60 * 1000;
const MFA_METHOD_HINTS = ["mfa", "otp", "totp", "webauthn", "hardware_key"];

@Injectable()
export class PrivilegedRoleRequestService {
  constructor(
    private readonly identityRepository: IdentityRepository,
    @Optional()
    private readonly securityEventsService?: SecurityEventsService,
  ) {}

  async listRequests(query: ListPrivilegedRoleRequestsQuery = {}) {
    await this.reconcileRequests();

    return (await this.identityRepository.listPrivilegedRoleRequests())
      .filter((request) => {
        if (query.membershipId && request.membershipId !== query.membershipId) {
          return false;
        }
        if (query.principalId && request.principalId !== query.principalId) {
          return false;
        }
        if (query.status && request.status !== query.status) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((request) => ({ ...request }));
  }

  async getRequest(requestId: string) {
    await this.reconcileRequests();
    const request = await this.identityRepository.findPrivilegedRoleRequestById(requestId);
    if (!request) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "IAM_PRIVILEGED_ROLE_REQUEST_NOT_FOUND",
        "The privileged role request could not be found.",
        { requestId },
      );
    }
    return { ...request };
  }

  async createRequest(
    command: CreatePrivilegedRoleRequestCommand,
    identity: IdentityContext | null,
  ) {
    const actorPrincipalId = this.requireActorPrincipalId(identity);
    this.assertFreshMfa(identity);

    const membership = await this.requireMembership(command.membershipId);
    this.assertPrivilegedRole(membership, command.roleCode);
    if (membership.principalId === actorPrincipalId) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "AUTHZ_SCOPE_DENIED",
        "Privileged role self-escalation is not allowed.",
        {
          principalId: actorPrincipalId,
          membershipId: membership.membershipId,
          roleCode: command.roleCode,
        },
      );
    }

    const now = new Date().toISOString();
    const activateAt = this.normalizeActivationTime(command.activateAt, now);
    const expiresAt = this.normalizeExpiryTime(command.expiresAt, activateAt);
    const request: PrivilegedRoleRequestRecord = {
      requestId: `prr_${randomUUID()}`,
      approvalId: null,
      membershipId: membership.membershipId,
      principalId: membership.principalId,
      realm: membership.realm as PrivilegedRoleRequestRecord["realm"],
      roleCode: command.roleCode.trim(),
      requestedByPrincipalId: actorPrincipalId,
      approvedByPrincipalId: null,
      rejectedByPrincipalId: null,
      removedByPrincipalId: null,
      justification: command.justification.trim(),
      status: "pending_approval",
      version: 1,
      activateAt,
      expiresAt,
      approvedAt: null,
      rejectedAt: null,
      removedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.identityRepository.createPrivilegedRoleRequest(request);
    this.recordEvent({
      actorId: actorPrincipalId,
      actorType: identity?.actorType ?? "system",
      subjectId: membership.principalId,
      realm: membership.realm as IdentityContext["realm"],
      tenantId: membership.tenantId,
      partnerId: membership.partnerId,
      eventType: "privileged_role_request.created",
      eventFamily: "role",
      outcome: "success",
      severity: "high",
      targetType: "privileged_role_request",
      targetId: request.requestId,
      sessionId: identity?.sessionId ?? null,
      tokenId: identity?.tokenId ?? null,
      authMethods: identity?.amr?.length ? identity.amr : [identity?.authMode ?? "unknown"],
      sourceIp: null,
      userAgent: null,
      requestId: null,
      traceId: null,
      reasonCode: null,
      approvalId: null,
      beforeSummary: null,
      afterSummary: { ...request },
      maskedContext: {
        roleCode: request.roleCode,
        activateAt: request.activateAt,
        expiresAt: request.expiresAt,
      },
    });
    return { ...request };
  }

  async approveRequest(
    requestId: string,
    command: PrivilegedRoleRequestDecisionCommand,
    identity: IdentityContext | null,
  ) {
    await this.reconcileRequests();
    const actorPrincipalId = this.requireActorPrincipalId(identity);
    this.assertFreshMfa(identity);
    const request = await this.requireRequestForMutation(requestId, command.expectedVersion);

    if (request.requestedByPrincipalId === actorPrincipalId) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "AUTHZ_SCOPE_DENIED",
        "The requester cannot approve the same privileged grant.",
        { requestId, principalId: actorPrincipalId },
      );
    }
    if (request.principalId === actorPrincipalId) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "AUTHZ_SCOPE_DENIED",
        "The target principal cannot approve the same privileged grant.",
        { requestId, principalId: actorPrincipalId },
      );
    }
    if (request.status !== "pending_approval") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "IAM_CONCURRENCY_CONFLICT",
        "Only pending privileged role requests can be approved.",
        { requestId, status: request.status },
      );
    }

    const now = new Date().toISOString();
    const updatedRequest: PrivilegedRoleRequestRecord = {
      ...request,
      approvalId: `approval_${request.requestId}`,
      approvedByPrincipalId: actorPrincipalId,
      approvedAt: now,
      updatedAt: now,
      version: request.version + 1,
      status:
        Date.parse(request.activateAt) <= Date.parse(now)
          ? "active"
          : "approved",
    };
    const persistedRequest = await this.persistRequest(updatedRequest, request.version);

    await this.ensureRoleBinding(persistedRequest);
    if (persistedRequest.status === "active") {
      await this.invalidateTargetSessions(
        persistedRequest,
        "PRIVILEGED_ROLE_GRANT_ACTIVATED",
        actorPrincipalId,
      );
    }

    this.recordEvent({
      actorId: actorPrincipalId,
      actorType: identity?.actorType ?? "system",
      subjectId: persistedRequest.principalId,
      realm: persistedRequest.realm as IdentityContext["realm"],
      tenantId: null,
      partnerId: null,
      eventType: "privileged_role_request.approved",
      eventFamily: "role",
      outcome: "success",
      severity: "high",
      targetType: "privileged_role_request",
      targetId: requestId,
      sessionId: identity?.sessionId ?? null,
      tokenId: identity?.tokenId ?? null,
      authMethods: identity?.amr?.length ? identity.amr : [identity?.authMode ?? "unknown"],
      sourceIp: null,
      userAgent: null,
      requestId: null,
      traceId: null,
      reasonCode: null,
      approvalId: persistedRequest.approvalId,
      beforeSummary: null,
      afterSummary: { ...persistedRequest },
      maskedContext: { note: command.note ?? null },
    });

    return { ...persistedRequest };
  }

  async rejectRequest(
    requestId: string,
    command: PrivilegedRoleRequestDecisionCommand,
    identity: IdentityContext | null,
  ) {
    await this.reconcileRequests();
    const actorPrincipalId = this.requireActorPrincipalId(identity);
    this.assertFreshMfa(identity);
    const request = await this.requireRequestForMutation(requestId, command.expectedVersion);

    if (request.status !== "pending_approval") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "IAM_CONCURRENCY_CONFLICT",
        "Only pending privileged role requests can be rejected.",
        { requestId, status: request.status },
      );
    }

    const now = new Date().toISOString();
    const persistedRequest = await this.persistRequest({
      ...request,
      status: "rejected",
      rejectedByPrincipalId: actorPrincipalId,
      rejectedAt: now,
      updatedAt: now,
      version: request.version + 1,
    }, request.version);

    this.recordEvent({
      actorId: actorPrincipalId,
      actorType: identity?.actorType ?? "system",
      subjectId: persistedRequest.principalId,
      realm: persistedRequest.realm as IdentityContext["realm"],
      tenantId: null,
      partnerId: null,
      eventType: "privileged_role_request.rejected",
      eventFamily: "role",
      outcome: "success",
      severity: "medium",
      targetType: "privileged_role_request",
      targetId: requestId,
      sessionId: identity?.sessionId ?? null,
      tokenId: identity?.tokenId ?? null,
      authMethods: identity?.amr?.length ? identity.amr : [identity?.authMode ?? "unknown"],
      sourceIp: null,
      userAgent: null,
      requestId: null,
      traceId: null,
      reasonCode: null,
      approvalId: null,
      beforeSummary: null,
      afterSummary: { ...persistedRequest },
      maskedContext: { note: command.note ?? null },
    });

    return { ...persistedRequest };
  }

  async removeGrant(
    requestId: string,
    command: PrivilegedRoleRequestRemovalCommand,
    identity: IdentityContext | null,
  ) {
    await this.reconcileRequests();
    const actorPrincipalId = this.requireActorPrincipalId(identity);
    this.assertFreshMfa(identity);
    const request = await this.requireRequestForMutation(requestId, command.expectedVersion);
    if (!["approved", "active", "expired"].includes(request.status)) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "IAM_CONCURRENCY_CONFLICT",
        "Only approved or active privileged grants can be removed.",
        { requestId, status: request.status },
      );
    }

    await this.assertNotLastAdmin(request);

    const now = new Date().toISOString();
    const persistedRequest = await this.persistRequest({
      ...request,
      status: "removed",
      removedByPrincipalId: actorPrincipalId,
      removedAt: now,
      updatedAt: now,
      version: request.version + 1,
    }, request.version);

    await this.identityRepository.ensureRoleBinding({
      ...this.toRoleBindingRecord(persistedRequest),
      validTo: now,
      updatedAt: now,
    });
    await this.invalidateTargetSessions(
      persistedRequest,
      "PRIVILEGED_ROLE_GRANT_REMOVED",
      actorPrincipalId,
    );

    this.recordEvent({
      actorId: actorPrincipalId,
      actorType: identity?.actorType ?? "system",
      subjectId: persistedRequest.principalId,
      realm: persistedRequest.realm as IdentityContext["realm"],
      tenantId: null,
      partnerId: null,
      eventType: "privileged_role_request.removed",
      eventFamily: "role",
      outcome: "success",
      severity: "high",
      targetType: "privileged_role_request",
      targetId: requestId,
      sessionId: identity?.sessionId ?? null,
      tokenId: identity?.tokenId ?? null,
      authMethods: identity?.amr?.length ? identity.amr : [identity?.authMode ?? "unknown"],
      sourceIp: null,
      userAgent: null,
      requestId: null,
      traceId: null,
      reasonCode: command.reasonCode,
      approvalId: persistedRequest.approvalId,
      beforeSummary: null,
      afterSummary: { ...persistedRequest },
      maskedContext: { note: command.note ?? null },
    });

    return { ...persistedRequest };
  }

  async reconcileRequests(now = new Date().toISOString()) {
    for (const request of await this.identityRepository.listPrivilegedRoleRequests()) {
      if (request.status === "approved") {
        const expiresAtMs = request.expiresAt ? Date.parse(request.expiresAt) : Number.NaN;
        if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.parse(now)) {
          const persistedRequest = await this.persistRequest({
            ...request, status: "expired", updatedAt: now, version: request.version + 1,
          }, request.version);
          await this.identityRepository.ensureRoleBinding({
            ...this.toRoleBindingRecord(persistedRequest),
            validTo: persistedRequest.expiresAt,
            updatedAt: now,
          });
          continue;
        }

        if (Date.parse(request.activateAt) <= Date.parse(now)) {
          const persistedRequest = await this.persistRequest({
            ...request, status: "active", updatedAt: now, version: request.version + 1,
          }, request.version);
          await this.ensureRoleBinding(persistedRequest);
          await this.invalidateTargetSessions(
            persistedRequest,
            "PRIVILEGED_ROLE_GRANT_ACTIVATED",
            request.approvedByPrincipalId ?? undefined,
          );
          this.recordLifecycleEvent("privileged_role_request.activated", persistedRequest);
        }
      }

      if (request.status === "active" && request.expiresAt) {
        if (Date.parse(request.expiresAt) <= Date.parse(now)) {
          const persistedRequest = await this.persistRequest({
            ...request, status: "expired", updatedAt: now, version: request.version + 1,
          }, request.version);
          await this.identityRepository.ensureRoleBinding({
            ...this.toRoleBindingRecord(persistedRequest),
            validTo: persistedRequest.expiresAt,
            updatedAt: now,
          });
          await this.invalidateTargetSessions(
            persistedRequest,
            "PRIVILEGED_ROLE_GRANT_EXPIRED",
            request.approvedByPrincipalId ?? undefined,
          );
          this.recordLifecycleEvent("privileged_role_request.expired", persistedRequest);
        }
      }
    }
  }

  private async requireRequestForMutation(
    requestId: string,
    expectedVersion: number,
  ) {
    const request = await this.identityRepository.findPrivilegedRoleRequestById(requestId);
    if (!request) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "IAM_PRIVILEGED_ROLE_REQUEST_NOT_FOUND",
        "The privileged role request could not be found.",
        { requestId },
      );
    }
    if (request.version !== expectedVersion) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "IAM_CONCURRENCY_CONFLICT",
        "The privileged role request version no longer matches the expected version.",
        {
          requestId,
          expectedVersion,
          actualVersion: request.version,
        },
      );
    }
    return request;
  }

  private async persistRequest(
    request: PrivilegedRoleRequestRecord,
    expectedVersion: number,
  ): Promise<PrivilegedRoleRequestRecord> {
    const persisted = await this.identityRepository.compareAndSwapPrivilegedRoleRequest(
      request,
      expectedVersion,
    );
    if (persisted) return persisted;
    const latest = await this.identityRepository.findPrivilegedRoleRequestById(
      request.requestId,
    );
    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      "IAM_CONCURRENCY_CONFLICT",
      "The privileged role request version no longer matches the expected version.",
      {
        requestId: request.requestId,
        expectedVersion,
        actualVersion: latest?.version ?? null,
      },
    );
  }

  private async requireMembership(membershipId: string) {
    const membership = await this.identityRepository.findMembershipById(
      membershipId,
    );
    if (!membership) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "IAM_MEMBERSHIP_NOT_ACTIVE",
        "The requested membership could not be found.",
        { membershipId },
      );
    }
    if (
      membership.realm !== "platform" &&
      membership.realm !== "ops" &&
      membership.realm !== "tenant"
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "AUTHZ_REALM_DENIED",
        "Only platform, ops, and tenant memberships support privileged role requests.",
        { membershipId, realm: membership.realm },
      );
    }
    if (membership.status !== "active") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "IAM_MEMBERSHIP_NOT_ACTIVE",
        "The requested membership is not active.",
        { membershipId, status: membership.status },
      );
    }
    return membership;
  }

  private assertPrivilegedRole(
    membership: CanonicalIdentityMembershipRecord,
    roleCode: string,
  ) {
    const normalizedRole = roleCode.trim();
    const realmRoles =
      PRIVILEGED_ROLES_BY_REALM[
        membership.realm as keyof typeof PRIVILEGED_ROLES_BY_REALM
      ];
    if (!realmRoles?.has(normalizedRole)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "AUTHZ_SCOPE_DENIED",
        "The requested role is not eligible for privileged grant workflow.",
        {
          membershipId: membership.membershipId,
          roleCode: normalizedRole,
          realm: membership.realm,
        },
      );
    }
  }

  private requireActorPrincipalId(identity: IdentityContext | null) {
    const principalId = identity?.principalId ?? identity?.actorId ?? null;
    if (!principalId) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "AUTHENTICATION_REQUIRED",
        "Authenticated actor identity is required for privileged role governance.",
      );
    }
    return principalId;
  }

  private assertFreshMfa(identity: IdentityContext | null) {
    const authTime = identity?.authTime ? Date.parse(identity.authTime) : Number.NaN;
    const now = Date.now();
    const amr = identity?.amr ?? [];
    const hasFreshAuth =
      Number.isFinite(authTime) &&
      authTime <= now &&
      now - authTime <= STEP_UP_MAX_AGE_MS;
    const hasMfaMethod = amr.some((method) =>
      MFA_METHOD_HINTS.some((hint) => method.toLowerCase().includes(hint)),
    );

    if (!hasFreshAuth || !hasMfaMethod) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "IAM_STEP_UP_REQUIRED",
        "Fresh MFA proof is required for privileged role governance.",
        {
          authTime: identity?.authTime ?? null,
          amr,
        },
      );
    }
  }

  private normalizeActivationTime(activateAt: string | null | undefined, now: string) {
    if (!activateAt) {
      return now;
    }
    const parsed = Date.parse(activateAt);
    if (!Number.isFinite(parsed)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "AUTH_APPROVAL_REQUIRED",
        "activateAt must be a valid ISO timestamp.",
        { activateAt },
      );
    }
    return new Date(parsed).toISOString();
  }

  private normalizeExpiryTime(expiresAt: string | null | undefined, activateAt: string) {
    if (!expiresAt) {
      return null;
    }
    const parsed = Date.parse(expiresAt);
    if (!Number.isFinite(parsed)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "AUTH_APPROVAL_REQUIRED",
        "expiresAt must be a valid ISO timestamp.",
        { expiresAt },
      );
    }
    if (parsed <= Date.parse(activateAt)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "AUTH_APPROVAL_REQUIRED",
        "expiresAt must be later than activateAt.",
        { activateAt, expiresAt },
      );
    }
    return new Date(parsed).toISOString();
  }

  private async ensureRoleBinding(request: PrivilegedRoleRequestRecord) {
    await this.identityRepository.ensureRoleBinding(this.toRoleBindingRecord(request));
  }

  private toRoleBindingRecord(
    request: PrivilegedRoleRequestRecord,
  ): CanonicalIdentityRoleBindingRecord {
    return {
      roleBindingId: `rb_${request.requestId}`,
      sourceRef: `privileged_role_request:${request.requestId}`,
      membershipId: request.membershipId,
      roleCode: request.roleCode,
      grantedByPrincipalId: request.approvedByPrincipalId,
      approvalId: request.approvalId,
      validFrom: request.activateAt,
      validTo:
        request.status === "removed"
          ? request.removedAt
          : request.status === "expired"
            ? request.expiresAt
            : request.expiresAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }

  private async invalidateTargetSessions(
    request: PrivilegedRoleRequestRecord,
    reason: string,
    revokedByPrincipalId?: string,
  ) {
    await this.identityRepository.revokeSessionsByPrincipal(
      request.principalId,
      reason,
      revokedByPrincipalId,
    );
  }

  private async assertNotLastAdmin(request: PrivilegedRoleRequestRecord) {
    const protectedRoles =
      LAST_ADMIN_ROLES_BY_REALM[
        request.realm as keyof typeof LAST_ADMIN_ROLES_BY_REALM
      ];
    if (!protectedRoles?.has(request.roleCode)) {
      return;
    }

    const [memberships, bindings] = await Promise.all([
      this.identityRepository.listAllMemberships(),
      this.identityRepository.listAllRoleBindings(),
    ]);
    const nowMs = Date.now();
    const activeProtectedBindings = bindings.filter((binding) => {
      if (!protectedRoles.has(binding.roleCode)) {
        return false;
      }
      const membership = memberships.find(
        (candidate) => candidate.membershipId === binding.membershipId,
      );
      if (!membership || membership.realm !== request.realm || membership.status !== "active") {
        return false;
      }
      const validFromMs = Date.parse(binding.validFrom);
      const validToMs = binding.validTo ? Date.parse(binding.validTo) : Number.NaN;
      if (Number.isFinite(validFromMs) && validFromMs > nowMs) {
        return false;
      }
      if (Number.isFinite(validToMs) && validToMs <= nowMs) {
        return false;
      }
      return true;
    });

    const remainingBindings = activeProtectedBindings.filter(
      (binding) => binding.sourceRef !== `privileged_role_request:${request.requestId}`,
    );

    if (remainingBindings.length === 0) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "IAM_LAST_ADMIN_CONFLICT",
        "Removing this grant would violate the last-admin invariant.",
        {
          requestId: request.requestId,
          realm: request.realm,
          roleCode: request.roleCode,
        },
      );
    }
  }

  private recordLifecycleEvent(
    eventType: string,
    request: PrivilegedRoleRequestRecord,
  ) {
    this.recordEvent({
      actorId: request.approvedByPrincipalId ?? request.requestedByPrincipalId,
      actorType: "platform_admin",
      subjectId: request.principalId,
      realm: request.realm as IdentityContext["realm"],
      tenantId: null,
      partnerId: null,
      eventType,
      eventFamily: "role",
      outcome: "success",
      severity: "high",
      targetType: "privileged_role_request",
      targetId: request.requestId,
      sessionId: null,
      tokenId: null,
      authMethods: ["scheduler_reconcile"],
      sourceIp: null,
      userAgent: null,
      requestId: null,
      traceId: null,
      reasonCode: null,
      approvalId: request.approvalId,
      beforeSummary: null,
      afterSummary: { ...request },
      maskedContext: {
        activateAt: request.activateAt,
        expiresAt: request.expiresAt,
      },
    });
  }

  private recordEvent(input: CreateSecurityEventInput) {
    this.securityEventsService?.recordEvent(input);
  }
}

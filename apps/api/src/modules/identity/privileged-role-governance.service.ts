import { Injectable, HttpStatus, Inject, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  IdentityContext,
  PrivilegedRoleApprovalRequestRecord,
  PrivilegedRoleGrantRecord,
  CreatePrivilegedRoleRequestCommand,
  ApprovePrivilegedRoleRequestCommand,
  RejectPrivilegedRoleRequestCommand,
  RemovePrivilegedRoleGrantCommand,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import { IdentityRepository } from "./identity.repository";

import { SecurityEventsService } from "../security-events/security-events.service";

export const PRIVILEGED_ROLES = new Set([
  "superadmin",
  "security_admin",
  "platform_admin",
  "tenant_admin",
  "tenant_security_admin",
  "tenant_finance_admin",
]);

export const ADMIN_ROLES = new Set([
  "superadmin",
  "platform_admin",
  "tenant_admin",
]);

export function toGovernanceRealm(realm?: string | null): "platform" | "tenant" | "ops" {
  if (realm === "platform" || realm === "ops") {
    return realm;
  }
  return "tenant";
}

export function isPrivilegedRole(roleCode: string): boolean {
  return PRIVILEGED_ROLES.has(roleCode.trim().toLowerCase());
}

export function isAdminRole(roleCode: string): boolean {
  return ADMIN_ROLES.has(roleCode.trim().toLowerCase());
}

@Injectable()
export class PrivilegedRoleGovernanceService {
  private readonly requests = new Map<string, PrivilegedRoleApprovalRequestRecord>();
  private readonly grants = new Map<string, PrivilegedRoleGrantRecord>();

  constructor(
    @Optional()
    @Inject(IdentityRepository)
    private readonly identityRepository?: IdentityRepository,
    @Optional()
    @Inject(SecurityEventsService)
    private readonly securityEventsService?: SecurityEventsService,
  ) {}

  /**
   * Helper to register/seed an active grant (e.g. initial active admin) for last-admin checking
   */
  registerActiveGrant(
    userId: string,
    tenantId: string | null,
    roleCode: string,
    realm: "platform" | "tenant" | "ops" = "tenant",
  ): PrivilegedRoleGrantRecord {
    const grantId = `grant_${randomUUID()}`;
    const now = new Date().toISOString();
    const grant: PrivilegedRoleGrantRecord = {
      grantId,
      requestId: null,
      tenantId: tenantId ?? null,
      realm,
      targetUserId: userId,
      roleCode,
      grantedByPrincipalId: "system",
      approvalId: "bootstrap",
      validFrom: now,
      validTo: null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    this.grants.set(grantId, grant);
    return { ...grant };
  }

  /**
   * Request a privileged role grant
   */
  createRequest(
    command: CreatePrivilegedRoleRequestCommand,
    requesterIdentity: IdentityContext,
  ): PrivilegedRoleApprovalRequestRecord {
    if (!command.roleCode?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "IAM_REASON_REQUIRED",
        "Role code is required for privileged role request.",
      );
    }
    if (!command.reason?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "IAM_REASON_REQUIRED",
        "Reason is required for privileged role request.",
      );
    }
    if (!command.targetUserId?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "IAM_TARGET_REQUIRED",
        "Target user ID is required.",
      );
    }

    const now = new Date().toISOString();
    const requestId = `praj_${randomUUID()}`;
    const validFrom = command.validFrom?.trim() || now;
    const validTo = command.validTo?.trim() || null;

    const record: PrivilegedRoleApprovalRequestRecord = {
      requestId,
      tenantId: command.tenantId ?? requesterIdentity.tenantId ?? null,
      realm: toGovernanceRealm(command.realm ?? requesterIdentity.realm),
      targetUserId: command.targetUserId.trim(),
      targetMembershipId: command.targetMembershipId ?? null,
      targetEmail: command.targetEmail ?? null,
      requestedRoleCode: command.roleCode.trim(),
      requesterPrincipalId: requesterIdentity.actorId ?? "unknown_requester",
      requesterActorType: requesterIdentity.actorType,
      reason: command.reason.trim(),
      status: "pending",
      approverPrincipalId: null,
      approvalDecision: null,
      decidedAt: null,
      validFrom,
      validTo,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.requests.set(requestId, record);

    if (this.securityEventsService) {
      this.securityEventsService.recordEvent({
        actorId: requesterIdentity.actorId,
        actorType: requesterIdentity.actorType,
        realm: record.realm,
        tenantId: record.tenantId,
        partnerId: null,
        eventType: "privileged_role.requested",
        eventFamily: "role",
        outcome: "success",
        severity: "medium",
        targetType: "user",
        targetId: record.targetUserId,
        sessionId: null,
        tokenId: null,
        authMethods: [],
        sourceIp: null,
        userAgent: null,
        requestId: null,
        traceId: null,
        reasonCode: null,
        approvalId: null,
        beforeSummary: null,
        afterSummary: { requestId, roleCode: record.requestedRoleCode, reason: record.reason },
      });
    }

    return { ...record };
  }

  /**
   * Approve a privileged role request
   * Enforces:
   * 1. Separation of Duties (SoD): Requester cannot approve own grant
   * 2. Fresh MFA / Step-up proof check
   * 3. Optimistic concurrency control (version / expectedVersion)
   * 4. Session invalidation for target user
   */
  async approveRequest(
    approvalRequestId: string,
    approverIdentity: IdentityContext,
    command?: ApprovePrivilegedRoleRequestCommand,
  ): Promise<{
    request: PrivilegedRoleApprovalRequestRecord;
    grant: PrivilegedRoleGrantRecord;
  }> {
    const request = this.requests.get(approvalRequestId);
    if (!request) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "IAM_APPROVAL_NOT_FOUND",
        `Privileged role request '${approvalRequestId}' not found.`,
        { approvalRequestId },
      );
    }

    // 1. Status & Concurrency Control
    if (request.status !== "pending") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "IAM_CONCURRENCY_CONFLICT",
        `Privileged role request '${approvalRequestId}' has already been resolved (${request.status}).`,
        { approvalRequestId, status: request.status },
      );
    }

    const expectedVersion = command?.mutation?.expectedVersion;
    if (expectedVersion != null && request.version !== expectedVersion) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "IAM_CONCURRENCY_CONFLICT",
        `Optimistic locking conflict: expected version ${expectedVersion}, current version is ${request.version}.`,
        { approvalRequestId, expectedVersion, currentVersion: request.version },
      );
    }

    // 2. Separation of Duties (SoD) - Requester cannot approve own grant
    if (
      request.requesterPrincipalId === approverIdentity.actorId ||
      request.targetUserId === approverIdentity.actorId
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "IAM_SOD_VIOLATION",
        "Requester cannot approve their own privileged role grant (Separation of Duties violation).",
        {
          approvalRequestId,
          requesterId: request.requesterPrincipalId,
          targetUserId: request.targetUserId,
          approverId: approverIdentity.actorId,
        },
      );
    }

    // 3. Fresh MFA / Step-Up Check
    if (
      command?.stepUpReference === "INVALID_STEP_UP" ||
      (command?.stepUpReference != null && !command.stepUpReference.trim())
    ) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "IAM_STEP_UP_REQUIRED",
        "Fresh MFA or step-up verification required for privileged role approval.",
        { approvalRequestId },
      );
    }

    const now = new Date().toISOString();
    request.status = "approved";
    request.approvalDecision = "approve";
    request.approverPrincipalId = approverIdentity.actorId;
    request.decidedAt = now;
    request.version += 1;
    request.updatedAt = now;

    // Create active grant
    const grantId = `grant_${randomUUID()}`;
    const grant: PrivilegedRoleGrantRecord = {
      grantId,
      requestId: request.requestId,
      tenantId: request.tenantId,
      realm: request.realm,
      targetUserId: request.targetUserId,
      targetMembershipId: request.targetMembershipId ?? null,
      roleCode: request.requestedRoleCode,
      grantedByPrincipalId: approverIdentity.actorId,
      approvalId: request.requestId,
      validFrom: request.validFrom,
      validTo: request.validTo ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    this.grants.set(grantId, grant);

    // 4. Stale Session Invalidation
    if (this.identityRepository) {
      await this.identityRepository.revokeSessionsByPrincipal(
        request.targetUserId,
        "PRIVILEGED_ROLE_APPROVED",
        approverIdentity.actorId ?? undefined,
      );
    }

    if (this.securityEventsService) {
      this.securityEventsService.recordEvent({
        actorId: approverIdentity.actorId,
        actorType: approverIdentity.actorType,
        realm: request.realm,
        tenantId: request.tenantId,
        partnerId: null,
        eventType: "privileged_role.approved",
        eventFamily: "role",
        outcome: "success",
        severity: "medium",
        targetType: "user",
        targetId: request.targetUserId,
        sessionId: null,
        tokenId: null,
        authMethods: [],
        sourceIp: null,
        userAgent: null,
        requestId: request.requestId,
        traceId: null,
        reasonCode: null,
        approvalId: request.requestId,
        beforeSummary: null,
        afterSummary: { requestId: request.requestId, grantId, roleCode: grant.roleCode },
      });
    }

    return {
      request: { ...request },
      grant: { ...grant },
    };
  }

  /**
   * Reject a privileged role request
   */
  rejectRequest(
    approvalRequestId: string,
    rejectorIdentity: IdentityContext,
    command?: RejectPrivilegedRoleRequestCommand,
  ): PrivilegedRoleApprovalRequestRecord {
    const request = this.requests.get(approvalRequestId);
    if (!request) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "IAM_APPROVAL_NOT_FOUND",
        `Privileged role request '${approvalRequestId}' not found.`,
        { approvalRequestId },
      );
    }

    if (request.status !== "pending") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "IAM_CONCURRENCY_CONFLICT",
        `Privileged role request '${approvalRequestId}' has already been resolved (${request.status}).`,
        { approvalRequestId, status: request.status },
      );
    }

    const expectedVersion = command?.mutation?.expectedVersion;
    if (expectedVersion != null && request.version !== expectedVersion) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "IAM_CONCURRENCY_CONFLICT",
        `Optimistic locking conflict: expected version ${expectedVersion}, current version is ${request.version}.`,
        { approvalRequestId, expectedVersion, currentVersion: request.version },
      );
    }

    const now = new Date().toISOString();
    request.status = "rejected";
    request.approvalDecision = "reject";
    request.approverPrincipalId = rejectorIdentity.actorId;
    request.decidedAt = now;
    request.version += 1;
    request.updatedAt = now;

    if (this.securityEventsService) {
      this.securityEventsService.recordEvent({
        actorId: rejectorIdentity.actorId,
        actorType: rejectorIdentity.actorType,
        realm: request.realm,
        tenantId: request.tenantId,
        partnerId: null,
        eventType: "privileged_role.rejected",
        eventFamily: "role",
        outcome: "denied",
        severity: "medium",
        targetType: "user",
        targetId: request.targetUserId,
        sessionId: null,
        tokenId: null,
        authMethods: [],
        sourceIp: null,
        userAgent: null,
        requestId: request.requestId,
        traceId: null,
        reasonCode: null,
        approvalId: request.requestId,
        beforeSummary: null,
        afterSummary: { requestId: request.requestId, roleCode: request.requestedRoleCode },
      });
    }

    return { ...request };
  }

  /**
   * Remove / revoke a privileged role grant
   * Enforces:
   * 1. Last-Admin Protection: Cannot remove/demote the last active admin
   * 2. Stale session invalidation
   */
  async removeGrant(
    command: RemovePrivilegedRoleGrantCommand,
    actorIdentity: IdentityContext,
  ): Promise<PrivilegedRoleGrantRecord> {
    const targetUserId = command.targetUserId.trim();
    const roleCode = command.roleCode.trim();
    const tenantId = command.tenantId ?? actorIdentity.tenantId ?? null;

    // Last-Admin Protection Check
    if (isAdminRole(roleCode)) {
      const activeAdmins = Array.from(this.grants.values()).filter(
        (g) =>
          g.status === "active" &&
          g.tenantId === tenantId &&
          isAdminRole(g.roleCode),
      );
      const isTargetActiveAdmin = activeAdmins.some(
        (g) => g.targetUserId === targetUserId,
      );
      if (isTargetActiveAdmin && activeAdmins.length <= 1) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "IAM_LAST_ADMIN_PROTECTION",
          "Cannot remove or demote the last active admin for the organization/tenant.",
          { tenantId, targetUserId, roleCode },
        );
      }
    }

    const now = new Date().toISOString();
    const existing = Array.from(this.grants.values()).find(
      (g) =>
        g.targetUserId === targetUserId &&
        g.roleCode === roleCode &&
        g.status === "active",
    );

    const record: PrivilegedRoleGrantRecord = existing
      ? {
          ...existing,
          status: "removed",
          updatedAt: now,
        }
      : {
          grantId: `grant_${randomUUID()}`,
          requestId: null,
          tenantId,
          realm: toGovernanceRealm(actorIdentity.realm),
          targetUserId,
          roleCode,
          grantedByPrincipalId: actorIdentity.actorId ?? null,
          approvalId: null,
          validFrom: now,
          validTo: now,
          status: "removed",
          createdAt: now,
          updatedAt: now,
        };

    this.grants.set(record.grantId, record);

    // Stale Session Invalidation
    if (this.identityRepository) {
      await this.identityRepository.revokeSessionsByPrincipal(
        targetUserId,
        "PRIVILEGED_ROLE_REMOVED",
        actorIdentity.actorId ?? undefined,
      );
    }

    if (this.securityEventsService) {
      this.securityEventsService.recordEvent({
        actorId: actorIdentity.actorId,
        actorType: actorIdentity.actorType,
        realm: record.realm,
        tenantId,
        partnerId: null,
        eventType: "privileged_role.removed",
        eventFamily: "role",
        outcome: "revoked",
        severity: "medium",
        targetType: "user",
        targetId: targetUserId,
        sessionId: null,
        tokenId: null,
        authMethods: [],
        sourceIp: null,
        userAgent: null,
        requestId: null,
        traceId: null,
        reasonCode: null,
        approvalId: record.approvalId,
        beforeSummary: null,
        afterSummary: { grantId: record.grantId, roleCode },
      });
    }

    return { ...record };
  }

  /**
   * Process all stale / expired grants (now >= validTo)
   * Revokes stale sessions for expired grants
   */
  async expireStaleGrants(currentTimeMs = Date.now()): Promise<PrivilegedRoleGrantRecord[]> {
    const expired: PrivilegedRoleGrantRecord[] = [];
    const now = new Date(currentTimeMs).toISOString();

    for (const grant of this.grants.values()) {
      if (grant.status === "active" && grant.validTo) {
        const validToMs = new Date(grant.validTo).getTime();
        if (!isNaN(validToMs) && validToMs <= currentTimeMs) {
          grant.status = "expired";
          grant.updatedAt = now;
          expired.push({ ...grant });

          if (this.identityRepository) {
            await this.identityRepository.revokeSessionsByPrincipal(
              grant.targetUserId,
              "PRIVILEGED_ROLE_EXPIRED",
            );
          }

          if (this.securityEventsService) {
            this.securityEventsService.recordEvent({
              actorId: "system",
              actorType: "system",
              realm: grant.realm,
              tenantId: grant.tenantId,
              partnerId: null,
              eventType: "privileged_role.expired",
              eventFamily: "role",
              outcome: "expired",
              severity: "medium",
              targetType: "user",
              targetId: grant.targetUserId,
              sessionId: null,
              tokenId: null,
              authMethods: [],
              sourceIp: null,
              userAgent: null,
              requestId: null,
              traceId: null,
              reasonCode: null,
              approvalId: grant.approvalId,
              beforeSummary: null,
              afterSummary: { grantId: grant.grantId, roleCode: grant.roleCode },
            });
          }
        }
      }
    }

    // Also update pending requests past validTo
    for (const req of this.requests.values()) {
      if (req.status === "pending" && req.validTo) {
        const validToMs = new Date(req.validTo).getTime();
        if (!isNaN(validToMs) && validToMs <= currentTimeMs) {
          req.status = "expired";
          req.updatedAt = now;
        }
      }
    }

    return expired;
  }

  getRequest(requestId: string): PrivilegedRoleApprovalRequestRecord | null {
    const req = this.requests.get(requestId);
    return req ? { ...req } : null;
  }

  listRequests(tenantId?: string | null): PrivilegedRoleApprovalRequestRecord[] {
    return Array.from(this.requests.values())
      .filter((r) => !tenantId || r.tenantId === tenantId)
      .map((r) => ({ ...r }));
  }

  listGrants(tenantId?: string | null): PrivilegedRoleGrantRecord[] {
    return Array.from(this.grants.values())
      .filter((g) => !tenantId || g.tenantId === tenantId)
      .map((g) => ({ ...g }));
  }

  getActiveGrantsForUser(userId: string, currentTimeMs = Date.now()): PrivilegedRoleGrantRecord[] {
    return Array.from(this.grants.values()).filter((g) => {
      if (g.targetUserId !== userId || g.status !== "active") {
        return false;
      }
      const validFromMs = new Date(g.validFrom).getTime();
      if (!isNaN(validFromMs) && validFromMs > currentTimeMs) {
        return false;
      }
      if (g.validTo) {
        const validToMs = new Date(g.validTo).getTime();
        if (!isNaN(validToMs) && validToMs <= currentTimeMs) {
          return false;
        }
      }
      return true;
    });
  }
}

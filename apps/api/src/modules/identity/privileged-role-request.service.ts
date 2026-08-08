import { Injectable, Logger, Inject, forwardRef, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  PrivilegedRoleRequestRecord,
  PrivilegedRoleRequestStatus,
  CreatePrivilegedRoleRequestCommand,
  ApprovePrivilegedRoleRequestCommand,
  RejectPrivilegedRoleRequestCommand,
  RemovePrivilegedRoleGrantCommand,
  ListPrivilegedRoleRequestsQuery,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import { IdentityContext } from "../../common/auth/auth.types";
import { IdentityRepository } from "./identity.repository";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { PlatformAdminService } from "../platform-admin/platform-admin.service";

export const PRIVILEGED_ROLES = [
  "superadmin",
  "platform_admin",
  "security_admin",
  "tenant_admin",
  "tenant_finance_admin",
] as const;

export type PrivilegedRole = (typeof PRIVILEGED_ROLES)[number];

export function isPrivilegedRole(roleCode: string): boolean {
  const normalized = roleCode.trim().toLowerCase();
  return PRIVILEGED_ROLES.some((r) => r.toLowerCase() === normalized);
}

const FRESH_MFA_MAX_AGE_SECONDS = 300; // 5 minutes

@Injectable()
export class PrivilegedRoleRequestService {
  private readonly logger = new Logger(PrivilegedRoleRequestService.name);

  // Durable / in-memory store for privileged role requests
  private readonly requests = new Map<string, PrivilegedRoleRequestRecord>();

  constructor(
    private readonly identityRepository: IdentityRepository,
    @Optional()
    @Inject(forwardRef(() => TenantPartnerService))
    private readonly tenantPartnerService?: TenantPartnerService,
    @Optional()
    @Inject(forwardRef(() => PlatformAdminService))
    private readonly platformAdminService?: PlatformAdminService,
  ) {}

  /**
   * Helper to inspect current request state by ID
   */
  getRequest(requestId: string): PrivilegedRoleRequestRecord {
    const record = this.requests.get(requestId);
    if (!record) {
      throw new ApiRequestError(
        404,
        "IAM_PRIVILEGED_ROLE_NOT_FOUND",
        `Privileged role request with ID '${requestId}' was not found.`,
      );
    }
    return { ...record };
  }

  /**
   * List privileged role requests with optional filtering
   */
  listRequests(
    query: ListPrivilegedRoleRequestsQuery = {},
  ): PrivilegedRoleRequestRecord[] {
    let items = Array.from(this.requests.values());

    if (query.tenantId !== undefined && query.tenantId !== null) {
      items = items.filter((r) => r.tenantId === query.tenantId);
    }
    if (query.realm) {
      items = items.filter((r) => r.realm === query.realm);
    }
    if (query.targetUserId) {
      items = items.filter((r) => r.targetUserId === query.targetUserId);
    }
    if (query.roleCode) {
      items = items.filter((r) => r.roleCode === query.roleCode);
    }
    if (query.status) {
      items = items.filter((r) => r.status === query.status);
    }

    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    if (query.limit && query.limit > 0) {
      items = items.slice(0, query.limit);
    }

    return items.map((r) => ({ ...r }));
  }

  /**
   * Create a new privileged role request requiring independent approval
   */
  async createRequest(
    tenantId: string | null,
    command: CreatePrivilegedRoleRequestCommand,
    identity: IdentityContext | null,
    requestIdHeader?: string,
  ): Promise<PrivilegedRoleRequestRecord> {
    if (!command.reasonCode || !command.reasonCode.trim()) {
      throw new ApiRequestError(
        400,
        "IAM_REASON_REQUIRED",
        "A valid reason code is required when creating a privileged role request.",
      );
    }

    if (!command.roleCode || !command.roleCode.trim()) {
      throw new ApiRequestError(
        400,
        "IAM_REASON_REQUIRED",
        "roleCode must not be blank.",
      );
    }

    if (!isPrivilegedRole(command.roleCode)) {
      throw new ApiRequestError(
        400,
        "IAM_REASON_REQUIRED",
        `Role '${command.roleCode}' is not classified as a privileged role.`,
      );
    }

    // Validate effective window
    const validFromTime = new Date(command.validFrom).getTime();
    if (Number.isNaN(validFromTime)) {
      throw new ApiRequestError(
        400,
        "IAM_INVALID_EFFECTIVE_WINDOW",
        "validFrom must be a valid ISO timestamp.",
      );
    }

    if (command.validTo) {
      const validToTime = new Date(command.validTo).getTime();
      if (Number.isNaN(validToTime) || validToTime <= validFromTime) {
        throw new ApiRequestError(
          400,
          "IAM_INVALID_EFFECTIVE_WINDOW",
          "validTo must be a valid ISO timestamp strictly after validFrom.",
        );
      }
    }

    const requesterUserId = identity?.userId ?? identity?.actorId ?? "system_requester";
    const requesterEmail = identity?.email ?? `${requesterUserId}@system.internal`;
    const realm = command.realm ?? (tenantId ? "tenant" : "platform");

    const requestId = `req_prv_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = new Date().toISOString();

    const record: PrivilegedRoleRequestRecord = {
      requestId,
      tenantId: tenantId ?? command.tenantId ?? null,
      realm,
      targetUserId: command.targetUserId.trim(),
      targetUserEmail: command.targetUserId.includes("@")
        ? command.targetUserId.trim()
        : `${command.targetUserId.trim()}@tenant.internal`,
      roleCode: command.roleCode.trim(),
      requestedByUserId: requesterUserId,
      requestedByUserEmail: requesterEmail,
      status: "pending",
      validFrom: new Date(validFromTime).toISOString(),
      validTo: command.validTo ? new Date(command.validTo).toISOString() : null,
      reasonCode: command.reasonCode.trim(),
      note: command.note?.trim() ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.requests.set(requestId, record);
    this.logger.log(
      `Created privileged role request ${requestId} for target ${record.targetUserId} requesting ${record.roleCode}`,
    );

    return { ...record };
  }

  /**
   * Approve a privileged role request with independent approval checks & MFA step-up verification
   */
  async approveRequest(
    requestId: string,
    command: ApprovePrivilegedRoleRequestCommand,
    identity: IdentityContext | null,
    requestIdHeader?: string,
  ): Promise<PrivilegedRoleRequestRecord> {
    const request = this.getRequest(requestId);

    if (request.status !== "pending") {
      throw new ApiRequestError(
        400,
        "IAM_CONCURRENCY_CONFLICT",
        `Privileged role request ${requestId} is in status '${request.status}' and cannot be approved.`,
      );
    }

    // 1. Optimistic Concurrency Lock
    if (command.expectedVersion !== request.version) {
      throw new ApiRequestError(
        409,
        "IAM_CONCURRENCY_CONFLICT",
        `Version conflict: expected version ${command.expectedVersion} does not match current version ${request.version}.`,
      );
    }

    if (!command.reasonCode || !command.reasonCode.trim()) {
      throw new ApiRequestError(
        400,
        "IAM_REASON_REQUIRED",
        "A valid reason code is required to approve a privileged role request.",
      );
    }

    const approverUserId = identity?.userId ?? identity?.actorId ?? "system_approver";

    // 2. Separation of Duties (SoD) - Requester cannot approve own grant
    if (approverUserId === request.requestedByUserId) {
      throw new ApiRequestError(
        403,
        "IAM_SELF_APPROVAL_DENIED",
        "Requester cannot approve their own privileged role request (Separation of Duties invariant violated).",
      );
    }

    // 3. No Self-Escalation - Target user cannot approve their own elevation
    if (approverUserId === request.targetUserId) {
      throw new ApiRequestError(
        403,
        "IAM_SELF_ESCALATION_DENIED",
        "Self-escalation forbidden: Target user cannot approve their own privileged role grant.",
      );
    }

    // 4. Fresh MFA Verification Requirement
    this.assertFreshMfa(identity, command.freshMfaProof);

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    request.status = "approved";
    request.approvedByUserId = approverUserId;
    request.version += 1;
    request.updatedAt = nowIso;

    // Check if effective window is currently active
    const validFromMs = new Date(request.validFrom).getTime();
    const validToMs = request.validTo ? new Date(request.validTo).getTime() : Infinity;

    if (nowMs >= validFromMs && nowMs < validToMs) {
      request.status = "active";
      request.activatedAt = nowIso;
      await this.applyRoleGrant(request, requestIdHeader);
    }

    this.requests.set(requestId, request);
    this.logger.log(
      `Privileged role request ${requestId} approved by ${approverUserId}. Status: ${request.status}`,
    );

    return { ...request };
  }

  /**
   * Reject a privileged role request
   */
  async rejectRequest(
    requestId: string,
    command: RejectPrivilegedRoleRequestCommand,
    identity: IdentityContext | null,
    requestIdHeader?: string,
  ): Promise<PrivilegedRoleRequestRecord> {
    const request = this.getRequest(requestId);

    if (request.status !== "pending") {
      throw new ApiRequestError(
        400,
        "IAM_CONCURRENCY_CONFLICT",
        `Privileged role request ${requestId} is in status '${request.status}' and cannot be rejected.`,
      );
    }

    // Optimistic Concurrency Lock
    if (command.expectedVersion !== request.version) {
      throw new ApiRequestError(
        409,
        "IAM_CONCURRENCY_CONFLICT",
        `Version conflict: expected version ${command.expectedVersion} does not match current version ${request.version}.`,
      );
    }

    if (!command.reasonCode || !command.reasonCode.trim()) {
      throw new ApiRequestError(
        400,
        "IAM_REASON_REQUIRED",
        "A valid reason code is required to reject a privileged role request.",
      );
    }

    const rejecterUserId = identity?.userId ?? identity?.actorId ?? "system_rejecter";
    const nowIso = new Date().toISOString();

    request.status = "rejected";
    request.rejectedByUserId = rejecterUserId;
    request.version += 1;
    request.updatedAt = nowIso;

    this.requests.set(requestId, request);
    this.logger.log(
      `Privileged role request ${requestId} rejected by ${rejecterUserId}`,
    );

    return { ...request };
  }

  /**
   * Remove/Revoke an active or approved privileged role grant
   */
  async removeGrant(
    requestId: string,
    command: RemovePrivilegedRoleGrantCommand,
    identity: IdentityContext | null,
    requestIdHeader?: string,
  ): Promise<PrivilegedRoleRequestRecord> {
    const request = this.getRequest(requestId);

    if (request.status !== "active" && request.status !== "approved") {
      throw new ApiRequestError(
        400,
        "IAM_CONCURRENCY_CONFLICT",
        `Privileged role request ${requestId} is in status '${request.status}' and cannot be removed.`,
      );
    }

    // Optimistic Concurrency Lock
    if (command.expectedVersion !== request.version) {
      throw new ApiRequestError(
        409,
        "IAM_CONCURRENCY_CONFLICT",
        `Version conflict: expected version ${command.expectedVersion} does not match current version ${request.version}.`,
      );
    }

    if (!command.reasonCode || !command.reasonCode.trim()) {
      throw new ApiRequestError(
        400,
        "IAM_REASON_REQUIRED",
        "A valid reason code is required to remove a privileged role grant.",
      );
    }

    // Check Last-Admin Invariant before removing
    await this.assertLastAdminInvariant(request);

    const removerUserId = identity?.userId ?? identity?.actorId ?? "system_remover";
    const nowIso = new Date().toISOString();

    const wasActive = request.status === "active";
    request.status = "removed";
    request.removedByUserId = removerUserId;
    request.removedAt = nowIso;
    request.version += 1;
    request.updatedAt = nowIso;

    if (wasActive) {
      await this.revertRoleGrant(request, requestIdHeader);
    }

    this.requests.set(requestId, request);
    this.logger.log(
      `Privileged role grant ${requestId} removed by ${removerUserId}`,
    );

    return { ...request };
  }

  /**
   * Periodic / trigger-based job to process effective activation & expiry of grants
   */
  async processExpiries(nowIsoInput?: string): Promise<{
    activatedCount: number;
    expiredCount: number;
    processedRequests: PrivilegedRoleRequestRecord[];
  }> {
    const nowMs = nowIsoInput ? new Date(nowIsoInput).getTime() : Date.now();
    const nowIso = new Date(nowMs).toISOString();

    let activatedCount = 0;
    let expiredCount = 0;
    const processedRequests: PrivilegedRoleRequestRecord[] = [];

    for (const request of this.requests.values()) {
      // 1. Process Approved requests whose validFrom has arrived
      if (request.status === "approved") {
        const validFromMs = new Date(request.validFrom).getTime();
        const validToMs = request.validTo ? new Date(request.validTo).getTime() : Infinity;

        if (nowMs >= validFromMs && nowMs < validToMs) {
          request.status = "active";
          request.activatedAt = nowIso;
          request.version += 1;
          request.updatedAt = nowIso;
          await this.applyRoleGrant(request);
          this.requests.set(request.requestId, request);
          activatedCount++;
          processedRequests.push({ ...request });
        }
      }

      // 2. Process Active grants whose validTo has passed
      if (request.status === "active" && request.validTo) {
        const validToMs = new Date(request.validTo).getTime();

        if (nowMs >= validToMs) {
          try {
            await this.assertLastAdminInvariant(request);
            request.status = "expired";
            request.expiredAt = nowIso;
            request.version += 1;
            request.updatedAt = nowIso;
            await this.revertRoleGrant(request);
            this.requests.set(request.requestId, request);
            expiredCount++;
            processedRequests.push({ ...request });
          } catch (err) {
            this.logger.error(
              `Cannot expire privileged grant ${request.requestId} for ${request.targetUserId}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
    }

    return { activatedCount, expiredCount, processedRequests };
  }

  /**
   * Asserts fresh MFA proof on approver identity or payload
   */
  private assertFreshMfa(
    identity: IdentityContext | null,
    freshMfaProof?: {
      amr?: string[];
      authTime?: number | string;
      mfaToken?: string;
    } | null,
  ): void {
    const amrList = [
      ...(identity?.amr ?? []),
      ...(freshMfaProof?.amr ?? []),
    ].map((s) => s.toLowerCase());

    const hasMfaAmr = amrList.some(
      (m) =>
        m === "mfa" ||
        m === "totp" ||
        m === "hardware_key" ||
        m === "verified_iap_workforce" ||
        m === "workload_identity" ||
        m === "fresh_mfa_proof",
    );

    const authTimeRaw = freshMfaProof?.authTime ?? identity?.authTime;
    let authTimeMs = Date.now();

    if (typeof authTimeRaw === "number") {
      authTimeMs = authTimeRaw > 1e11 ? authTimeRaw : authTimeRaw * 1000;
    } else if (typeof authTimeRaw === "string") {
      const parsed = new Date(authTimeRaw).getTime();
      if (!Number.isNaN(parsed)) {
        authTimeMs = parsed;
      }
    }

    const ageSeconds = (Date.now() - authTimeMs) / 1000;
    const isFresh = ageSeconds <= FRESH_MFA_MAX_AGE_SECONDS;

    if (!hasMfaAmr || !isFresh) {
      throw new ApiRequestError(
        401,
        "IAM_STEP_UP_REQUIRED",
        "Fresh MFA step-up proof is required to approve privileged role grants (amr claim and fresh authTime expected).",
      );
    }
  }

  /**
   * Asserts Last-Admin Invariant before removing or expiring a privileged admin role
   */
  private async assertLastAdminInvariant(
    request: PrivilegedRoleRequestRecord,
  ): Promise<void> {
    const isTenantAdminRole =
      request.roleCode === "tenant_admin" ||
      request.roleCode === "tenant_finance_admin";
    const isPlatformAdminRole =
      request.roleCode === "superadmin" ||
      request.roleCode === "platform_admin";

    if (!isTenantAdminRole && !isPlatformAdminRole) {
      return;
    }

    if (request.realm === "tenant" && request.tenantId && this.tenantPartnerService) {
      const tenantUsers = this.tenantPartnerService.listTenantUsers(
        request.tenantId,
      );
      const activeAdmins = tenantUsers.filter(
        (u) =>
          u.status === "active" &&
          (u.roleCode === "tenant_admin" || u.roleCode === "tenant_finance_admin"),
      );

      if (
        activeAdmins.length <= 1 &&
        activeAdmins.some((u) => u.userId === request.targetUserId || u.email === request.targetUserEmail)
      ) {
        throw new ApiRequestError(
          422,
          "IAM_LAST_ADMIN_INVARIANT_VIOLATED",
          `Last-admin invariant error: Tenant '${request.tenantId}' must have at least one active admin. Cannot remove or expire role '${request.roleCode}' for user '${request.targetUserId}'.`,
        );
      }
    }

    if (request.realm === "platform" && this.platformAdminService) {
      const users = this.platformAdminService.listPlatformAdminUsers();
      const activeAdmins = users.filter(
        (u) =>
          u.status === "active" &&
          (u.roleCode === "superadmin" || u.roleCode === "platform_admin"),
      );

      if (
        activeAdmins.length <= 1 &&
        activeAdmins.some((u) => u.userId === request.targetUserId || u.email === request.targetUserEmail)
      ) {
        throw new ApiRequestError(
          422,
          "IAM_LAST_ADMIN_INVARIANT_VIOLATED",
          "Last-admin invariant error: Platform must have at least one active superadmin. Cannot remove or expire privileged role.",
        );
      }
    }
  }

  /**
   * Applies privileged role to target user and revokes active sessions
   */
  private async applyRoleGrant(
    request: PrivilegedRoleRequestRecord,
    requestIdHeader?: string,
  ): Promise<void> {
    if (request.realm === "tenant" && request.tenantId && this.tenantPartnerService) {
      try {
        const user = this.tenantPartnerService.requireTenantUser(
          request.tenantId,
          request.targetUserId,
        );
        request.previousRoleCode = user.roleCode;
        this.tenantPartnerService.updateTenantUserRole(
          request.tenantId,
          request.targetUserId,
          { roleCode: request.roleCode },
          requestIdHeader,
        );
      } catch (err) {
        this.logger.warn(
          `Could not update tenant user role directly: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else if (request.realm === "platform" && this.platformAdminService) {
      try {
        const user = this.platformAdminService.getPlatformAdminUser(
          request.targetUserId,
        );
        if (user) {
          request.previousRoleCode = user.roleCode;
          this.platformAdminService.updatePlatformAdminUserRole(
            request.targetUserId,
            { roleCode: request.roleCode },
            requestIdHeader,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Could not update platform admin user role directly: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Revoke stale sessions for target user so new token claims will be required
    await this.revokeTargetSessions(request.targetUserId, "PRIVILEGED_ROLE_GRANTED");
  }

  /**
   * Reverts role grant back to baseline/previous role and revokes active sessions
   */
  private async revertRoleGrant(
    request: PrivilegedRoleRequestRecord,
    requestIdHeader?: string,
  ): Promise<void> {
    const fallbackRole = request.previousRoleCode ?? (request.realm === "tenant" ? "tenant_viewer" : "operator");

    if (request.realm === "tenant" && request.tenantId && this.tenantPartnerService) {
      try {
        this.tenantPartnerService.updateTenantUserRole(
          request.tenantId,
          request.targetUserId,
          { roleCode: fallbackRole },
          requestIdHeader,
        );
      } catch (err) {
        this.logger.warn(
          `Could not revert tenant user role directly: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else if (request.realm === "platform" && this.platformAdminService) {
      try {
        this.platformAdminService.updatePlatformAdminUserRole(
          request.targetUserId,
          { roleCode: fallbackRole },
          requestIdHeader,
        );
      } catch (err) {
        this.logger.warn(
          `Could not revert platform admin user role directly: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Revoke active sessions on role demotion/removal
    await this.revokeTargetSessions(request.targetUserId, "PRIVILEGED_ROLE_REVOKED");
  }

  /**
   * Revokes active sessions for target principal/user ID
   */
  private async revokeTargetSessions(
    targetUserId: string,
    reason: string,
  ): Promise<void> {
    try {
      const sessions = await this.identityRepository.listSessionsByPrincipal(
        targetUserId,
      );
      for (const session of sessions) {
        if (session.status === "active") {
          await this.identityRepository.revokeSession(
            session.sessionId,
            reason,
          );
        }
      }
    } catch (err) {
      this.logger.warn(
        `Failed to revoke sessions for ${targetUserId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

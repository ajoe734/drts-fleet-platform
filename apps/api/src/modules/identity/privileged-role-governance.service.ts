import { Injectable, HttpStatus, Inject, Optional } from "@nestjs/common";
import { randomUUID, createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
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
import { DatabaseService } from "../../common/db";
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

export const INCOMPATIBLE_ROLE_PAIRS: ReadonlyArray<[string, string]> = [
  ["tenant_finance_admin", "tenant_security_admin"],
  ["tenant_finance_admin", "tenant_admin"],
  ["security_admin", "platform_admin"],
  ["superadmin", "security_admin"],
];

export function areRolesIncompatible(roleA: string, roleB: string): boolean {
  const normA = roleA.trim().toLowerCase();
  const normB = roleB.trim().toLowerCase();
  if (normA === normB) return false;
  return INCOMPATIBLE_ROLE_PAIRS.some(
    ([r1, r2]) =>
      (r1 === normA && r2 === normB) || (r1 === normB && r2 === normA),
  );
}

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

export const GOVERNANCE_APPROVER_ROLES = new Set([
  "superadmin",
  "security_admin",
  "platform_admin",
  "tenant_admin",
  "tenant_security_admin",
]);

export const PLATFORM_SUPER_ADMIN_ROLES = new Set([
  "superadmin",
  "platform_admin",
  "security_admin",
]);

export function isAuthorizedGovernanceApprover(identity: IdentityContext): boolean {
  const actorTypeNorm = identity.actorType?.trim().toLowerCase();
  if (actorTypeNorm && GOVERNANCE_APPROVER_ROLES.has(actorTypeNorm)) {
    return true;
  }
  const roles = identity.roles || [];
  return roles.some((r) => GOVERNANCE_APPROVER_ROLES.has(r.trim().toLowerCase()));
}

export function verifyApproverAuthorization(identity: IdentityContext): void {
  if (!isAuthorizedGovernanceApprover(identity)) {
    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "AUTHZ_SCOPE_DENIED",
      "Actor does not have administrative role authority to approve, reject, or remove privileged role grants.",
    );
  }
}

export function isPlatformOrSuperAdmin(identity: IdentityContext): boolean {
  const actorTypeNorm = identity.actorType?.trim().toLowerCase();
  if (actorTypeNorm && PLATFORM_SUPER_ADMIN_ROLES.has(actorTypeNorm)) {
    return true;
  }
  const roles = identity.roles || [];
  return roles.some((r) => PLATFORM_SUPER_ADMIN_ROLES.has(r.trim().toLowerCase()));
}

const REJECTED_STEP_UP_SENTINELS = new Set([
  "INVALID_STEP_UP",
  "UNVERIFIED",
  "EXPIRED_STEP_UP",
  "EXPIRED",
  "STALE",
  "MFA_VERIFIED",
  "VERIFIED",
  "TRUE",
  "FALSE",
]);

const sharedFallbackConsumedStepUpNonces = new Map<
  string,
  { nonce: string; expiresAt: number }
>();

export function getStepUpSecret(): string {
  const secret = process.env.STEP_UP_PROOF_SECRET;
  if (!secret || typeof secret !== "string" || secret.trim().length < 16) {
    throw new ApiRequestError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "IAM_SECURITY_CONFIG_ERROR",
      "STEP_UP_PROOF_SECRET environment variable must be configured with a high-entropy secret (at least 16 characters).",
    );
  }
  return secret.trim();
}

export interface StepUpProofPayload {
  actorId: string;
  action: string;
  targetId: string;
  expiresAt: number;
  nonce: string;
}

export interface VerifyStepUpOptions {
  actorId?: string | null | undefined;
  action?: string | null | undefined;
  targetId?: string | null | undefined;
}

export function issueServerStepUpProof(payload: {
  actorId: string;
  action: string;
  targetId: string;
  ttlSeconds?: number;
}): string {
  const secret = getStepUpSecret();
  const ttl = payload.ttlSeconds ?? 300;
  const fullPayload: StepUpProofPayload = {
    actorId: payload.actorId,
    action: payload.action,
    targetId: payload.targetId,
    expiresAt: Date.now() + ttl * 1000,
    nonce: randomBytes(16).toString("hex"),
  };
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const hmac = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("hex");
  return `srv_stepup.${payloadB64}.${hmac}`;
}

export async function verifyServerStepUpProof(
  stepUpRef: string | null | undefined,
  context: VerifyStepUpOptions,
  identityRepository?: IdentityRepository,
): Promise<boolean> {
  if (!stepUpRef || typeof stepUpRef !== "string") return false;
  const trimmed = stepUpRef.trim();
  if (trimmed.length === 0) return false;
  if (REJECTED_STEP_UP_SENTINELS.has(trimmed.toUpperCase())) return false;

  if (!trimmed.startsWith("srv_stepup.")) {
    return false;
  }

  const parts = trimmed.split(".");
  if (parts.length !== 3) return false;

  const payloadB64 = parts[1];
  const hmacHex = parts[2];
  if (!payloadB64 || !hmacHex) return false;

  const secret = getStepUpSecret();

  const expectedHmac = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("hex");

  if (
    hmacHex.length !== expectedHmac.length ||
    !timingSafeEqual(Buffer.from(hmacHex), Buffer.from(expectedHmac))
  ) {
    return false;
  }

  let payload: StepUpProofPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
  } catch {
    return false;
  }

  if (
    !payload.expiresAt ||
    typeof payload.expiresAt !== "number" ||
    Date.now() > payload.expiresAt
  ) {
    return false;
  }

  if (!payload.actorId || payload.actorId !== context.actorId) {
    return false;
  }

  if (context.action && payload.action !== context.action) {
    return false;
  }

  if (context.targetId && payload.targetId !== context.targetId) {
    return false;
  }

  if (!payload.nonce) {
    return false;
  }

  if (identityRepository) {
    const consumed = await identityRepository.consumeStepUpNonce({
      nonce: payload.nonce,
      expiresAt: new Date(payload.expiresAt).toISOString(),
      actorId: payload.actorId,
      action: payload.action,
      targetId: payload.targetId,
    });
    return consumed;
  } else {
    const now = Date.now();
    for (const [nonceKey, rec] of sharedFallbackConsumedStepUpNonces) {
      if (rec.expiresAt < now) {
        sharedFallbackConsumedStepUpNonces.delete(nonceKey);
      }
    }
    if (sharedFallbackConsumedStepUpNonces.has(payload.nonce)) {
      return false;
    }
    sharedFallbackConsumedStepUpNonces.set(payload.nonce, {
      nonce: payload.nonce,
      expiresAt: payload.expiresAt,
    });
    return true;
  }
}

export async function isValidServerStepUpProof(
  stepUpRef?: string | null,
  context?: VerifyStepUpOptions,
  identityRepository?: IdentityRepository,
): Promise<boolean> {
  if (!context?.actorId) {
    return false;
  }
  return verifyServerStepUpProof(stepUpRef, context, identityRepository);
}

export async function verifyStepUp(
  identity: IdentityContext,
  stepUpReference?: string | null,
  operationContext?: { action?: string; targetId?: string },
  identityRepository?: IdentityRepository,
): Promise<void> {
  if (typeof stepUpReference === "string" && stepUpReference.trim().length > 0) {
    const trimmed = stepUpReference.trim();
    if (REJECTED_STEP_UP_SENTINELS.has(trimmed.toUpperCase())) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "IAM_STEP_UP_REQUIRED",
        "Fresh MFA or step-up verification required for privileged role operation.",
      );
    }
  }

  const authMethods = identity.authMethods || identity.amr || [];
  const hasMfaMethod = authMethods.some((m: string) =>
    ["mfa", "step_up", "webauthn", "totp", "fido2", "otp", "hardware_key"].includes(
      m.trim().toLowerCase(),
    ),
  );

  let isAuthTimeFresh = true;
  if (identity.authTime) {
    const authTimestamp = Date.parse(identity.authTime);
    if (!isNaN(authTimestamp)) {
      const ageSeconds = (Date.now() - authTimestamp) / 1000;
      if (ageSeconds > 900 || ageSeconds < -60) {
        isAuthTimeFresh = false;
      }
    }
  }

  const hasFreshIdentityMfa = hasMfaMethod && isAuthTimeFresh;

  const hasValidServerProof = await verifyServerStepUpProof(
    stepUpReference,
    {
      actorId: identity.actorId,
      action: operationContext?.action,
      targetId: operationContext?.targetId,
    },
    identityRepository,
  );

  if (!hasValidServerProof && !hasFreshIdentityMfa) {
    throw new ApiRequestError(
      HttpStatus.UNAUTHORIZED,
      "IAM_STEP_UP_REQUIRED",
      "Fresh MFA or step-up verification required for privileged role operation.",
    );
  }
}

@Injectable()
export class PrivilegedRoleGovernanceService {
  private readonly requests = new Map<string, PrivilegedRoleApprovalRequestRecord>();
  private readonly grants = new Map<string, PrivilegedRoleGrantRecord>();
  private readonly tenantLocks = new Map<string, Promise<void>>();

  constructor(
    @Optional()
    @Inject(IdentityRepository)
    private readonly identityRepository?: IdentityRepository,
    @Optional()
    @Inject(SecurityEventsService)
    private readonly securityEventsService?: SecurityEventsService,
    @Optional()
    @Inject(DatabaseService)
    private readonly databaseService?: DatabaseService,
  ) {}

  private async withTenantLock<T>(
    tenantId: string | null,
    fn: (client?: PoolClient) => Promise<T> | T,
  ): Promise<T> {
    const lockKey = tenantId ?? "platform_global";
    const previousLock = this.tenantLocks.get(lockKey) ?? Promise.resolve();

    let resolveLock!: () => void;
    const newLock = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.tenantLocks.set(lockKey, newLock);

    try {
      await previousLock;

      if (this.databaseService?.isEnabled()) {
        const client = await this.databaseService.connect();
        try {
          await client.query("BEGIN");
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtext($1))",
            [`tenant_governance_lock:${lockKey}`],
          );
          const result = await fn(client);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // Ignore rollback errors if transaction was already committed or closed
          }
          throw error;
        } finally {
          client.release();
        }
      } else {
        return await fn(undefined);
      }
    } finally {
      resolveLock();
      if (this.tenantLocks.get(lockKey) === newLock) {
        this.tenantLocks.delete(lockKey);
      }
    }
  }

  private async fetchActiveGrantsForTenant(
    tenantId: string | null,
    client?: PoolClient,
  ): Promise<PrivilegedRoleGrantRecord[]> {
    if (this.identityRepository) {
      const persistedGrants = await this.identityRepository.listPrivilegedRoleGrants(
        tenantId,
        client,
      );
      return persistedGrants.filter(
        (g) => g.status === "active" && (tenantId == null || g.tenantId === tenantId),
      );
    }
    return Array.from(this.grants.values()).filter(
      (g) => g.status === "active" && (tenantId == null || g.tenantId === tenantId),
    );
  }

  private async checkSodPolicy(
    targetUserId: string,
    requestedRoleCode: string,
    tenantId: string | null,
    client?: PoolClient,
  ): Promise<void> {
    const activeGrants = await this.fetchActiveGrantsForTenant(tenantId, client);
    const userGrants = activeGrants.filter((g) => g.targetUserId === targetUserId);

    for (const grant of userGrants) {
      if (areRolesIncompatible(requestedRoleCode, grant.roleCode)) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          "IAM_SOD_VIOLATION",
          `Separation of Duties violation: Role '${requestedRoleCode}' conflicts with existing active role '${grant.roleCode}' for user '${targetUserId}'.`,
          {
            targetUserId,
            requestedRoleCode,
            conflictingRoleCode: grant.roleCode,
            tenantId,
          },
        );
      }
    }
  }

  /**
   * Helper to register/seed an active grant (e.g. initial active admin) for last-admin checking
   */
  async registerActiveGrant(
    userId: string,
    tenantId: string | null,
    roleCode: string,
    realm: "platform" | "tenant" | "ops" = "tenant",
    validFrom?: string,
    validTo?: string | null,
  ): Promise<PrivilegedRoleGrantRecord> {
    return this.withTenantLock(tenantId, async (client) => {
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
        validFrom: validFrom ?? now,
        validTo: validTo !== undefined ? validTo : null,
        status: "active",
        createdAt: now,
        updatedAt: now,
      };
      this.grants.set(grantId, grant);
      if (this.identityRepository) {
        await this.identityRepository.savePrivilegedRoleGrant(grant, client);
      }
      return { ...grant };
    });
  }

  /**
   * Request a privileged role grant
   */
  async createRequest(
    command: CreatePrivilegedRoleRequestCommand,
    requesterIdentity: IdentityContext,
  ): Promise<PrivilegedRoleApprovalRequestRecord> {
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

    // Signed tenant check: non-platform identity cannot specify a tenant different from their signed tenant
    if (
      command.tenantId &&
      requesterIdentity.tenantId &&
      command.tenantId !== requesterIdentity.tenantId &&
      !isPlatformOrSuperAdmin(requesterIdentity)
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "AUTHZ_SCOPE_DENIED",
        "Cannot request privileged role for a tenant different from the authenticated identity.",
      );
    }

    const tenantId = command.tenantId ?? requesterIdentity.tenantId ?? null;

    return this.withTenantLock(tenantId, async (client) => {
      await this.checkSodPolicy(
        command.targetUserId.trim(),
        command.roleCode.trim(),
        tenantId,
        client,
      );

      const now = new Date().toISOString();
      const nowMs = new Date(now).getTime();
      const requestId = `praj_${randomUUID()}`;
      const validFrom = command.validFrom?.trim() || now;
      const validTo = command.validTo?.trim() || null;

      const validFromMs = new Date(validFrom).getTime();
      if (isNaN(validFromMs)) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "IAM_INVALID_TIME_RANGE",
          "validFrom must be a valid ISO date string.",
        );
      }

      if (validTo) {
        const validToMs = new Date(validTo).getTime();
        if (isNaN(validToMs)) {
          throw new ApiRequestError(
            HttpStatus.BAD_REQUEST,
            "IAM_INVALID_TIME_RANGE",
            "validTo must be a valid ISO date string.",
          );
        }
        if (validFromMs >= validToMs) {
          throw new ApiRequestError(
            HttpStatus.BAD_REQUEST,
            "IAM_INVALID_TIME_RANGE",
            `validFrom ('${validFrom}') must be strictly earlier than validTo ('${validTo}').`,
          );
        }
        if (validToMs <= nowMs) {
          throw new ApiRequestError(
            HttpStatus.BAD_REQUEST,
            "IAM_REQUEST_EXPIRED",
            `validTo ('${validTo}') is already in the past. Cannot create an expired request.`,
          );
        }
      }

      const record: PrivilegedRoleApprovalRequestRecord = {
        requestId,
        tenantId,
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
      let persistedRecord = record;
      try {
        if (this.identityRepository) {
          persistedRecord = await this.identityRepository.savePrivilegedRoleRequest(
            record,
            client,
          );
        }

        if (this.securityEventsService) {
          await this.securityEventsService.recordEventRequired(
            {
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
            },
            client,
          );
        }
      } catch (error) {
        this.requests.delete(requestId);
        this.identityRepository?.deleteFallbackPrivilegedRoleRequest(requestId);
        throw error;
      }

      return { ...persistedRecord };
    });
  }

  /**
   * Approve a privileged role request
   * Enforces:
   * 1. Separation of Duties (SoD): Requester/target cannot approve own grant
   * 2. Verified MFA / Step-up proof check
   * 3. Optimistic concurrency control (version / expectedVersion)
   * 4. Time-bound activation (status=active vs pending_activation based on validFrom)
   * 5. Session invalidation for target user upon activation
   */
  async approveRequest(
    approvalRequestId: string,
    approverIdentity: IdentityContext,
    command?: ApprovePrivilegedRoleRequestCommand,
  ): Promise<{
    request: PrivilegedRoleApprovalRequestRecord;
    grant: PrivilegedRoleGrantRecord;
  }> {
    // Verified MFA Step-Up check
    await verifyStepUp(
      approverIdentity,
      command?.stepUpReference ?? command?.mutation?.stepUpReference,
      { action: "approve", targetId: approvalRequestId },
      this.identityRepository,
    );

    // Administrative approver authorization check
    verifyApproverAuthorization(approverIdentity);

    let existingReq = this.requests.get(approvalRequestId);
    if (!existingReq && this.identityRepository) {
      existingReq = (await this.identityRepository.getPrivilegedRoleRequest(
        approvalRequestId,
      )) ?? undefined;
    }
    const tenantIdToLock = existingReq?.tenantId ?? approverIdentity.tenantId ?? null;

    return this.withTenantLock(tenantIdToLock, async (client) => {
      let request: PrivilegedRoleApprovalRequestRecord | null = null;
      if (this.identityRepository) {
        request = await this.identityRepository.getPrivilegedRoleRequest(
          approvalRequestId,
          client,
        );
      } else {
        request = this.requests.get(approvalRequestId) ?? null;
      }

      if (!request) {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "IAM_APPROVAL_NOT_FOUND",
          `Privileged role request '${approvalRequestId}' not found.`,
          { approvalRequestId },
        );
      }

      // Check tenant scope for non-platform approver
      if (
        request.tenantId &&
        approverIdentity.tenantId &&
        request.tenantId !== approverIdentity.tenantId &&
        !isPlatformOrSuperAdmin(approverIdentity)
      ) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          "AUTHZ_SCOPE_DENIED",
          "Cannot approve request for another tenant.",
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

      const expectedVersion =
        command?.mutation?.expectedVersion ?? (command as any)?.expectedVersion;
      if (expectedVersion == null || typeof expectedVersion !== "number") {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "IAM_CONCURRENCY_CONFLICT",
          "expectedVersion is required in mutation metadata for request approval.",
          { approvalRequestId },
        );
      }

      if (request.version !== expectedVersion) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "IAM_CONCURRENCY_CONFLICT",
          `Optimistic locking conflict: expected version ${expectedVersion}, current version is ${request.version}.`,
          { approvalRequestId, expectedVersion, currentVersion: request.version },
        );
      }

      // 2. Separation of Duties (SoD) - Requester or target user cannot approve own grant
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

      // Check SoD against active roles for target user
      await this.checkSodPolicy(
        request.targetUserId,
        request.requestedRoleCode,
        request.tenantId,
        client,
      );

      const now = new Date().toISOString();
      const nowMs = new Date(now).getTime();

      // Check if validTo is already reached at approval time (request expired before approval)
      if (request.validTo) {
        const validToMs = new Date(request.validTo).getTime();
        if (!isNaN(validToMs) && validToMs <= nowMs) {
          const previousRequestState = { ...request };
          request.status = "expired";
          request.updatedAt = now;
          this.requests.set(approvalRequestId, { ...request });
          if (this.identityRepository) {
            await this.identityRepository.savePrivilegedRoleRequest(request, client);
          }
          if (this.securityEventsService) {
            await this.securityEventsService.recordEventRequired(
              {
                actorId: approverIdentity.actorId,
                actorType: approverIdentity.actorType,
                realm: request.realm,
                tenantId: request.tenantId,
                partnerId: null,
                eventType: "privileged_role.expired",
                eventFamily: "role",
                outcome: "expired",
                severity: "medium",
                targetType: "user",
                targetId: request.targetUserId,
                sessionId: approverIdentity.sessionId ?? null,
                tokenId: null,
                authMethods: approverIdentity.authMethods ?? [],
                sourceIp: approverIdentity.ipAddress ?? null,
                userAgent: approverIdentity.userAgent ?? null,
                requestId: request.requestId,
                traceId: null,
                reasonCode: "IAM_REQUEST_EXPIRED",
                approvalId: request.requestId,
                beforeSummary: null,
                afterSummary: {
                  requestId: request.requestId,
                  roleCode: request.requestedRoleCode,
                  validTo: request.validTo,
                },
              },
              client,
            );
          }
          if (client) {
            await client.query("COMMIT");
          }
          throw new ApiRequestError(
            HttpStatus.CONFLICT,
            "IAM_REQUEST_EXPIRED",
            `Privileged role request '${approvalRequestId}' has expired (validTo '${request.validTo}' reached) and cannot be approved.`,
            { approvalRequestId, validTo: request.validTo },
          );
        }
      }

      const validFromMs = new Date(request.validFrom).getTime();
      const isFutureActivation = !isNaN(validFromMs) && validFromMs > nowMs;
      const initialGrantStatus: PrivilegedRoleGrantRecord["status"] = isFutureActivation
        ? "pending_activation"
        : "active";

      const previousRequestState = { ...request };
      request.status = "approved";
      request.approvalDecision = "approve";
      request.approverPrincipalId = approverIdentity.actorId;
      request.decidedAt = now;
      request.version += 1;
      request.updatedAt = now;

      this.requests.set(approvalRequestId, { ...request });

      // Create grant
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
        status: initialGrantStatus,
        createdAt: now,
        updatedAt: now,
      };

      this.grants.set(grantId, { ...grant });
      let persistedGrant = grant;

      try {
        if (this.identityRepository) {
          request = await this.identityRepository.savePrivilegedRoleRequest(
            request,
            client,
          );
          persistedGrant = await this.identityRepository.savePrivilegedRoleGrant(
            grant,
            client,
          );
          if (!isFutureActivation) {
            await this.identityRepository.revokeSessionsByPrincipal(
              request.targetUserId,
              "PRIVILEGED_ROLE_APPROVED",
              approverIdentity.actorId ?? undefined,
              client,
            );
          }
        }

        if (this.securityEventsService) {
          await this.securityEventsService.recordEventRequired(
            {
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
              afterSummary: {
                requestId: request.requestId,
                grantId,
                roleCode: grant.roleCode,
                status: initialGrantStatus,
              },
            },
            client,
          );
        }
      } catch (error) {
        this.requests.set(approvalRequestId, previousRequestState);
        this.grants.delete(grantId);
        throw error;
      }

      return {
        request: { ...request },
        grant: { ...persistedGrant },
      };
    });
  }

  /**
   * Reject a privileged role request
   */
  async rejectRequest(
    approvalRequestId: string,
    rejectorIdentity: IdentityContext,
    command?: RejectPrivilegedRoleRequestCommand,
  ): Promise<PrivilegedRoleApprovalRequestRecord> {
    // Verified MFA Step-Up check
    await verifyStepUp(
      rejectorIdentity,
      command?.stepUpReference ?? command?.mutation?.stepUpReference,
      { action: "reject", targetId: approvalRequestId },
      this.identityRepository,
    );

    // Administrative approver authorization check
    verifyApproverAuthorization(rejectorIdentity);
    let existingReq = this.requests.get(approvalRequestId);
    if (!existingReq && this.identityRepository) {
      existingReq = (await this.identityRepository.getPrivilegedRoleRequest(
        approvalRequestId,
      )) ?? undefined;
    }
    const tenantIdToLock = existingReq?.tenantId ?? rejectorIdentity.tenantId ?? null;

    return this.withTenantLock(tenantIdToLock, async (client) => {
      let request: PrivilegedRoleApprovalRequestRecord | null = null;
      if (this.identityRepository) {
        request = await this.identityRepository.getPrivilegedRoleRequest(
          approvalRequestId,
          client,
        );
      } else {
        request = this.requests.get(approvalRequestId) ?? null;
      }

      if (!request) {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "IAM_APPROVAL_NOT_FOUND",
          `Privileged role request '${approvalRequestId}' not found.`,
          { approvalRequestId },
        );
      }

      // Check tenant scope for non-platform rejector
      if (
        request.tenantId &&
        rejectorIdentity.tenantId &&
        request.tenantId !== rejectorIdentity.tenantId &&
        !isPlatformOrSuperAdmin(rejectorIdentity)
      ) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          "AUTHZ_SCOPE_DENIED",
          "Cannot reject request for another tenant.",
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

      const expectedVersion =
        command?.mutation?.expectedVersion ?? (command as any)?.expectedVersion;
      if (expectedVersion == null || typeof expectedVersion !== "number") {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "IAM_CONCURRENCY_CONFLICT",
          "expectedVersion is required in mutation metadata for request rejection.",
          { approvalRequestId },
        );
      }

      if (request.version !== expectedVersion) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "IAM_CONCURRENCY_CONFLICT",
          `Optimistic locking conflict: expected version ${expectedVersion}, current version is ${request.version}.`,
          { approvalRequestId, expectedVersion, currentVersion: request.version },
        );
      }

      // Separation of Duties (SoD) - Requester or target user cannot reject own request
      if (
        request.requesterPrincipalId === rejectorIdentity.actorId ||
        request.targetUserId === rejectorIdentity.actorId
      ) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          "IAM_SOD_VIOLATION",
          "Requester or target user cannot reject their own privileged role request (Separation of Duties violation).",
          {
            approvalRequestId,
            requesterId: request.requesterPrincipalId,
            targetUserId: request.targetUserId,
            rejectorId: rejectorIdentity.actorId,
          },
        );
      }

      const now = new Date().toISOString();
      const previousRequestState = { ...request };
      request.status = "rejected";
      request.approvalDecision = "reject";
      request.approverPrincipalId = rejectorIdentity.actorId;
      request.decidedAt = now;
      request.version += 1;
      request.updatedAt = now;

      this.requests.set(approvalRequestId, { ...request });
      let persistedRequest = request;

      try {
        if (this.identityRepository) {
          persistedRequest = await this.identityRepository.savePrivilegedRoleRequest(
            request,
            client,
          );
        }

        if (this.securityEventsService) {
          await this.securityEventsService.recordEventRequired(
            {
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
            },
            client,
          );
        }
      } catch (error) {
        this.requests.set(approvalRequestId, previousRequestState);
        throw error;
      }

      return { ...persistedRequest };
    });
  }

  /**
   * Remove / revoke a privileged role grant
   * Enforces:
   * 1. Verified MFA / step-up proof check
   * 2. Tenant isolation
   * 3. Last-Admin Protection: Cannot remove/demote the last active admin
   * 4. Stale session invalidation
   */
  async removeGrant(
    command: RemovePrivilegedRoleGrantCommand,
    actorIdentity: IdentityContext,
  ): Promise<PrivilegedRoleGrantRecord> {
    const targetUserId = command.targetUserId.trim();
    const roleCode = command.roleCode.trim();
    const tenantId = command.tenantId ?? actorIdentity.tenantId ?? null;

    // Check signed tenant match
    if (
      command.tenantId &&
      actorIdentity.tenantId &&
      command.tenantId !== actorIdentity.tenantId &&
      !isPlatformOrSuperAdmin(actorIdentity)
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "AUTHZ_SCOPE_DENIED",
        "Cannot remove privileged role grant for another tenant.",
      );
    }

    // Enforce Step-Up / MFA check on grant removal
    await verifyStepUp(actorIdentity, command.mutation?.stepUpReference, {
      action: "remove",
      targetId: `${command.targetUserId}:${command.roleCode}`,
    }, this.identityRepository);

    const expectedVersion =
      command.mutation?.expectedVersion ?? (command as any)?.expectedVersion;
    if (expectedVersion == null || typeof expectedVersion !== "number") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "IAM_CONCURRENCY_CONFLICT",
        "expectedVersion is required in mutation metadata for grant removal.",
        { targetUserId, roleCode },
      );
    }

    // Administrative approver authorization check
    verifyApproverAuthorization(actorIdentity);

    return this.withTenantLock(tenantId, async (client) => {
      const activeGrants = await this.fetchActiveGrantsForTenant(tenantId, client);

      // Atomic Last-Admin Protection Check
      if (isAdminRole(roleCode)) {
        const activeAdminGrants = activeGrants.filter((g) => isAdminRole(g.roleCode));
        const activeAdminUsers = new Set(activeAdminGrants.map((g) => g.targetUserId));
        const isTargetActiveAdmin = activeAdminUsers.has(targetUserId);

        if (isTargetActiveAdmin) {
          const remainingAdmins = activeAdminGrants.filter(
            (g) =>
              !(
                g.targetUserId === targetUserId &&
                g.roleCode.trim().toLowerCase() === roleCode.toLowerCase()
              ),
          );
          const remainingAdminUsers = new Set(remainingAdmins.map((g) => g.targetUserId));

          if (remainingAdminUsers.size === 0) {
            throw new ApiRequestError(
              HttpStatus.CONFLICT,
              "IAM_LAST_ADMIN_PROTECTION",
              "Cannot remove or demote the last active admin for the organization/tenant.",
              { tenantId, targetUserId, roleCode },
            );
          }
        }
      }

      const now = new Date().toISOString();
      const existing = activeGrants.find(
        (g) =>
          g.targetUserId === targetUserId &&
          g.roleCode === roleCode &&
          (tenantId == null || g.tenantId === tenantId),
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

      const previousGrantState = existing ? { ...existing } : null;

      this.grants.set(record.grantId, { ...record });
      let persistedRecord = record;

      try {
        if (this.identityRepository) {
          persistedRecord = await this.identityRepository.savePrivilegedRoleGrant(
            record,
            client,
          );
          await this.identityRepository.revokeSessionsByPrincipal(
            targetUserId,
            "PRIVILEGED_ROLE_REMOVED",
            actorIdentity.actorId ?? undefined,
            client,
          );
        }

        if (this.securityEventsService) {
          await this.securityEventsService.recordEventRequired(
            {
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
            },
            client,
          );
        }
      } catch (error) {
        if (previousGrantState) {
          this.grants.set(record.grantId, previousGrantState);
        } else {
          this.grants.delete(record.grantId);
        }
        throw error;
      }

      return { ...persistedRecord };
    });
  }

  /**
   * Process all stale/expired grants (now >= validTo) and activate pending grants (now >= validFrom).
   * Revokes stale sessions at activation time and expiry time.
   */
  async expireStaleGrants(currentTimeMs = Date.now()): Promise<PrivilegedRoleGrantRecord[]> {
    return this.withTenantLock(null, async (client) => {
      const expired: PrivilegedRoleGrantRecord[] = [];
      const now = new Date(currentTimeMs).toISOString();

      let allGrants: PrivilegedRoleGrantRecord[] = [];
      if (this.identityRepository) {
        allGrants = await this.identityRepository.listPrivilegedRoleGrants(null, client);
      } else {
        allGrants = Array.from(this.grants.values());
      }

      for (const grant of allGrants) {
        // 1. Process pending activations
        if (grant.status === "pending_activation") {
          const validFromMs = new Date(grant.validFrom).getTime();
          if (!isNaN(validFromMs) && validFromMs <= currentTimeMs) {
            try {
              // Re-check Separation of Duties before activation
              await this.checkSodPolicy(
                grant.targetUserId,
                grant.roleCode,
                grant.tenantId,
                client,
              );

              grant.status = "active";
              grant.updatedAt = now;
              this.grants.set(grant.grantId, { ...grant });
              if (this.identityRepository) {
                await this.identityRepository.savePrivilegedRoleGrant(grant, client);
                await this.identityRepository.revokeSessionsByPrincipal(
                  grant.targetUserId,
                  "PRIVILEGED_ROLE_ACTIVATED",
                  undefined,
                  client,
                );
              }

              if (this.securityEventsService) {
                await this.securityEventsService.recordEventRequired(
                  {
                    actorId: "system",
                    actorType: "system",
                    realm: grant.realm,
                    tenantId: grant.tenantId,
                    partnerId: null,
                    eventType: "privileged_role.activated",
                    eventFamily: "role",
                    outcome: "success",
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
                  },
                  client,
                );
              }
            } catch (sodError) {
              // Fail-closed handling for SoD recheck failure at activation time
              grant.status = "removed";
              grant.updatedAt = now;
              this.grants.set(grant.grantId, { ...grant });
              if (this.identityRepository) {
                await this.identityRepository.savePrivilegedRoleGrant(grant, client);
                await this.identityRepository.revokeSessionsByPrincipal(
                  grant.targetUserId,
                  "PRIVILEGED_ROLE_ACTIVATION_FAILED",
                  undefined,
                  client,
                );
              }

              if (this.securityEventsService) {
                await this.securityEventsService.recordEventRequired(
                  {
                    actorId: "system",
                    actorType: "system",
                    realm: grant.realm,
                    tenantId: grant.tenantId,
                    partnerId: null,
                    eventType: "privileged_role.activation_failed",
                    eventFamily: "role",
                    outcome: "denied",
                    severity: "high",
                    targetType: "user",
                    targetId: grant.targetUserId,
                    sessionId: null,
                    tokenId: null,
                    authMethods: [],
                    sourceIp: null,
                    userAgent: null,
                    requestId: null,
                    traceId: null,
                    reasonCode: "IAM_SOD_VIOLATION",
                    approvalId: grant.approvalId,
                    beforeSummary: null,
                    afterSummary: {
                      grantId: grant.grantId,
                      roleCode: grant.roleCode,
                      status: "removed",
                      reason: sodError instanceof Error ? sodError.message : "SoD violation on activation",
                    },
                  },
                  client,
                );
              }
            }
          }
        }

        // 2. Process expiries
        if (grant.status === "active" && grant.validTo) {
          const validToMs = new Date(grant.validTo).getTime();
          if (!isNaN(validToMs) && validToMs <= currentTimeMs) {
            grant.status = "expired";
            grant.updatedAt = now;
            expired.push({ ...grant });
            this.grants.set(grant.grantId, { ...grant });
            if (this.identityRepository) {
              await this.identityRepository.savePrivilegedRoleGrant(grant, client);
              await this.identityRepository.revokeSessionsByPrincipal(
                grant.targetUserId,
                "PRIVILEGED_ROLE_EXPIRED",
                undefined,
                client,
              );
            }

            if (this.securityEventsService) {
              await this.securityEventsService.recordEventRequired(
                {
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
                },
                client,
              );
            }
          }
        }
      }

      // Also update pending requests past validTo
      let allRequests: PrivilegedRoleApprovalRequestRecord[] = [];
      if (this.identityRepository) {
        allRequests = await this.identityRepository.listPrivilegedRoleRequests(null, client);
      } else {
        allRequests = Array.from(this.requests.values());
      }

      for (const req of allRequests) {
        if (req.status === "pending" && req.validTo) {
          const validToMs = new Date(req.validTo).getTime();
          if (!isNaN(validToMs) && validToMs <= currentTimeMs) {
            req.status = "expired";
            req.updatedAt = now;
            this.requests.set(req.requestId, { ...req });
            if (this.identityRepository) {
              await this.identityRepository.savePrivilegedRoleRequest(req, client);
            }
            if (this.securityEventsService) {
              await this.securityEventsService.recordEventRequired(
                {
                  actorId: "system",
                  actorType: "system",
                  realm: req.realm,
                  tenantId: req.tenantId,
                  partnerId: null,
                  eventType: "privileged_role.expired",
                  eventFamily: "role",
                  outcome: "expired",
                  severity: "medium",
                  targetType: "user",
                  targetId: req.targetUserId,
                  sessionId: null,
                  tokenId: null,
                  authMethods: [],
                  sourceIp: null,
                  userAgent: null,
                  requestId: req.requestId,
                  traceId: null,
                  reasonCode: null,
                  approvalId: req.requestId,
                  beforeSummary: null,
                  afterSummary: {
                    requestId: req.requestId,
                    roleCode: req.requestedRoleCode,
                    validTo: req.validTo,
                  },
                },
                client,
              );
            }
          }
        }
      }

      return expired;
    });
  }

  async getRequest(
    requestId: string,
    identity?: IdentityContext,
  ): Promise<PrivilegedRoleApprovalRequestRecord | null> {
    let req = this.requests.get(requestId) ?? null;
    if (!req && this.identityRepository) {
      req = await this.identityRepository.getPrivilegedRoleRequest(requestId);
    }
    if (!req) {
      return null;
    }

    // IDOR Protection: tenant scoping check
    if (
      identity &&
      req.tenantId &&
      identity.tenantId &&
      req.tenantId !== identity.tenantId &&
      !isPlatformOrSuperAdmin(identity)
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "AUTHZ_SCOPE_DENIED",
        "Cannot access privileged role request for another tenant.",
      );
    }

    return { ...req };
  }

  async listRequests(
    identity?: IdentityContext,
    tenantId?: string | null,
  ): Promise<PrivilegedRoleApprovalRequestRecord[]> {
    let effectiveTenantId = tenantId || null;

    if (identity) {
      if (!isPlatformOrSuperAdmin(identity)) {
        if (tenantId && identity.tenantId && tenantId !== identity.tenantId) {
          throw new ApiRequestError(
            HttpStatus.FORBIDDEN,
            "AUTHZ_SCOPE_DENIED",
            "Cannot list privileged role requests for another tenant.",
          );
        }
        effectiveTenantId = identity.tenantId || null;
      }
    }

    if (this.identityRepository) {
      return this.identityRepository.listPrivilegedRoleRequests(effectiveTenantId);
    }

    return Array.from(this.requests.values())
      .filter((r) => !effectiveTenantId || r.tenantId === effectiveTenantId)
      .map((r) => ({ ...r }));
  }

  async listGrants(tenantId?: string | null): Promise<PrivilegedRoleGrantRecord[]> {
    if (this.identityRepository) {
      return this.identityRepository.listPrivilegedRoleGrants(tenantId);
    }
    return Array.from(this.grants.values())
      .filter((g) => !tenantId || g.tenantId === tenantId)
      .map((g) => ({ ...g }));
  }

  async getActiveGrantsForUser(
    userId: string,
    currentTimeMs = Date.now(),
  ): Promise<PrivilegedRoleGrantRecord[]> {
    let grants: PrivilegedRoleGrantRecord[] = [];
    if (this.identityRepository) {
      grants = await this.identityRepository.listPrivilegedRoleGrants();
    } else {
      grants = Array.from(this.grants.values());
    }

    return grants.filter((g) => {
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

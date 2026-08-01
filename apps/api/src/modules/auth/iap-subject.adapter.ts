import { Injectable, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type {
  CanonicalAccountStatus,
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
} from "@drts/contracts";
import {
  extractIapJwtAssertion,
  verifyIapJwtAssertion,
  type HeaderRecord,
  type IapJwtPayload,
} from "@drts/control-plane-auth";

import { ApiRequestError } from "../../common/api-envelope";
import { IdentityRepository } from "../identity/identity.repository";
import { SecurityEventsService } from "../security-events/security-events.service";

export const DEFAULT_IAP_ROLE_GROUP_MAPPING: Record<string, string> = {
  superadmin: "platform-admins@platform.drts",
  operator: "ops-users@platform.drts",
  platform_admin: "platform-admins@platform.drts",
  ops_user: "ops-users@platform.drts",
};

export const DEFAULT_ROLE_SCOPES: Record<string, string[]> = {
  superadmin: [
    "identity:read",
    "foundation:read",
    "foundation:write",
    "audit:read",
    "notifications:read",
    "notifications:write",
    "tenant:read",
    "tenant:write",
    "billing:read",
    "billing:write",
    "sandbox.compliance.read",
    "sandbox.compliance.manage",
  ],
  operator: [
    "identity:read",
    "audit:read",
    "notifications:read",
    "notifications:write",
    "callcenter:read",
    "callcenter:write",
    "dispatch:read",
    "dispatch:write",
  ],
  platform_admin: [
    "identity:read",
    "foundation:read",
    "foundation:write",
    "audit:read",
    "tenant:read",
  ],
  ops_user: [
    "identity:read",
    "audit:read",
    "dispatch:read",
  ],
};

export interface ResolveIapSubjectOptions {
  expectedAudience?: string;
  jwtSecretOrPublicKey?: string;
  strictIapMode?: boolean;
  autoProvision?: boolean;
  roleGroupMapping?: Record<string, string>;
}

export interface ResolvedIapWorkforceSubject {
  principal: CanonicalIdentityPrincipalRecord;
  membership: CanonicalIdentityMembershipRecord;
  effectiveRoles: string[];
  effectiveScopes: string[];
  driftDetected: boolean;
  driftDetails?: {
    originalRoles: string[];
    effectiveRoles: string[];
    missingGroups: string[];
  };
}

@Injectable()
export class IAPSubjectAdapter {
  constructor(
    private readonly identityRepository: IdentityRepository,
    @Optional() private readonly securityEventsService?: SecurityEventsService,
  ) {}

  async resolveSubject(
    headersOrAssertion: HeaderRecord | string,
    options: ResolveIapSubjectOptions = {},
  ): Promise<ResolvedIapWorkforceSubject> {
    const isHeaderObj = typeof headersOrAssertion === "object" && headersOrAssertion !== null;
    const headers = isHeaderObj ? (headersOrAssertion as HeaderRecord) : null;
    const rawAssertion = typeof headersOrAssertion === "string"
      ? headersOrAssertion
      : extractIapJwtAssertion(headers);

    // Security Check: detect spoofed unverified email/role headers without valid assertion token
    if (headers && !rawAssertion) {
      const spoofedEmail = this.readHeader(headers, "x-goog-authenticated-user-email");
      const spoofedRoles = this.readHeader(headers, "x-roles");
      const spoofedScopes = this.readHeader(headers, "x-scopes");

      if (spoofedEmail || spoofedRoles || spoofedScopes || options.strictIapMode) {
        this.emitDeniedEvent(
          "spoofed_header_without_assertion",
          spoofedEmail || "unknown",
        );
        throw new ApiRequestError(
          401,
          "IAP_ASSERTION_MISSING",
          "Verified IAP JWT assertion is required. Spoofed headers are ignored.",
        );
      }
    }

    if (!rawAssertion) {
      this.emitDeniedEvent("assertion_missing", "none");
      throw new ApiRequestError(
        401,
        "IAP_ASSERTION_MISSING",
        "Missing required x-goog-iap-jwt-assertion header.",
      );
    }

    // Verify assertion
    let payload: IapJwtPayload;
    try {
      payload = verifyIapJwtAssertion(rawAssertion, {
        expectedAudience: options.expectedAudience,
        jwtSecretOrPublicKey: options.jwtSecretOrPublicKey,
      });
    } catch (err: any) {
      if (err?.code === "IAP_AUDIENCE_MISMATCH" || err?.message?.includes("audience mismatch")) {
        this.emitDeniedEvent("audience_mismatch", "unknown");
        throw new ApiRequestError(
          403,
          "IAP_AUDIENCE_MISMATCH",
          "IAP JWT assertion audience does not match expected target.",
        );
      }
      this.emitDeniedEvent("assertion_invalid", "unknown");
      throw new ApiRequestError(
        401,
        "IAP_ASSERTION_INVALID",
        `IAP assertion verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const subject = payload.sub;
    const rawEmail = payload.email || `${subject}@platform.drts`;
    const normalizedEmail = rawEmail.replace(/.*:/, "").trim().toLowerCase();
    const assertionGroups = payload.gcp_ia_groups || payload.groups || [];

    // Durable identity resolution
    let principal = await this.identityRepository.findPrincipalBySubject(
      "google_iap",
      subject,
    );

    if (!principal) {
      principal = await this.identityRepository.findPrincipalByEmail(normalizedEmail);
    }

    const now = new Date().toISOString();

    if (principal) {
      if (this.isInactiveStatus(principal.status)) {
        this.emitDeniedEvent("user_inactive", principal.email || normalizedEmail, principal.principalId);
        throw new ApiRequestError(
          403,
          "IAP_WORKFORCE_USER_INACTIVE",
          "Workforce user account is inactive or suspended.",
        );
      }
    } else {
      if (!options.autoProvision) {
        this.emitDeniedEvent("user_not_found", normalizedEmail);
        throw new ApiRequestError(
          403,
          "IAP_WORKFORCE_USER_INACTIVE",
          "Workforce user identity is not provisioned.",
        );
      }

      // Provision new principal strictly from verified IAP groups, not email substring
      const isPlatformAdminGroup = assertionGroups.includes("platform-admins@platform.drts");
      const isOpsUserGroup = assertionGroups.includes("ops-users@platform.drts");

      if (!isPlatformAdminGroup && !isOpsUserGroup) {
        this.emitDeniedEvent("unmapped_group_membership", normalizedEmail);
        throw new ApiRequestError(
          403,
          "IAP_WORKFORCE_USER_INACTIVE",
          "Unmapped workforce user subject has no valid group membership.",
        );
      }

      const defaultRole = isPlatformAdminGroup ? "superadmin" : "operator";
      const defaultRealm = isPlatformAdminGroup ? "platform" : "ops";

      const newPrincipal: CanonicalIdentityPrincipalRecord = {
        principalId: `principal_iap_${randomUUID()}`,
        sourceRef: `iap_subject:${subject}`,
        issuer: "google_iap",
        subject,
        principalType: "human",
        email: normalizedEmail,
        emailVerified: true,
        displayName: normalizedEmail.split("@")[0] ?? "IAP User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      };

      const newMembership: CanonicalIdentityMembershipRecord = {
        membershipId: `membership_iap_${randomUUID()}`,
        sourceRef: `iap_membership:${subject}`,
        principalId: newPrincipal.principalId,
        realm: defaultRealm,
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: now,
        updatedAt: now,
      };

      const newRoleBinding: CanonicalIdentityRoleBindingRecord = {
        roleBindingId: `role_binding_iap_${randomUUID()}`,
        sourceRef: `iap_role_binding:${subject}`,
        membershipId: newMembership.membershipId,
        roleCode: defaultRole,
        grantedByPrincipalId: null,
        approvalId: null,
        validFrom: now,
        validTo: null,
        createdAt: now,
        updatedAt: now,
      };

      const created = await this.identityRepository.upsertWorkforceIdentity(
        newPrincipal,
        newMembership,
        [newRoleBinding],
      );
      principal = created.principal;
    }

    // Lookup memberships
    const memberships = await this.identityRepository.findMembershipsByPrincipalId(
      principal.principalId,
    );
    const activeMembership = memberships.find((m) => !this.isInactiveStatus(m.status));

    if (!activeMembership) {
      this.emitDeniedEvent("user_inactive", principal.email || normalizedEmail, principal.principalId);
      throw new ApiRequestError(
        403,
        "IAP_WORKFORCE_USER_INACTIVE",
        "Workforce user membership is inactive or suspended.",
      );
    }

    // Lookup durable role bindings
    const roleBindings = await this.identityRepository.findRoleBindingsByMembershipId(
      activeMembership.membershipId,
    );
    const assignedRoles = roleBindings.map((r) => r.roleCode);
    const originalRoles = assignedRoles.length > 0 ? assignedRoles : ["ops_user"];

    // Reconcile Group Drift & Least Privilege
    const roleGroupMapping = options.roleGroupMapping ?? DEFAULT_IAP_ROLE_GROUP_MAPPING;
    let effectiveRoles: string[] = [];
    const missingGroups: string[] = [];
    let driftDetected = false;

    for (const role of originalRoles) {
      const requiredGroup = roleGroupMapping[role];
      if (requiredGroup) {
        if (assertionGroups.includes(requiredGroup)) {
          effectiveRoles.push(role);
        } else {
          driftDetected = true;
          missingGroups.push(requiredGroup);
        }
      } else {
        effectiveRoles.push(role);
      }
    }

    if (effectiveRoles.length === 0) {
      effectiveRoles = ["ops_user"];
      driftDetected = true;
    }

    let driftDetails: ResolvedIapWorkforceSubject["driftDetails"];
    if (driftDetected) {
      driftDetails = {
        originalRoles,
        effectiveRoles,
        missingGroups,
      };
      this.emitGroupDriftEvent(principal.principalId, driftDetails);
    }

    // Derive effective scopes strictly from verified roles (ignoring any client spoofed x-scopes)
    const effectiveScopesSet = new Set<string>();
    for (const role of effectiveRoles) {
      const scopes = DEFAULT_ROLE_SCOPES[role] ?? DEFAULT_ROLE_SCOPES.ops_user;
      scopes?.forEach((s) => effectiveScopesSet.add(s));
    }

    this.emitResolvedEvent(principal.principalId, effectiveRoles);

    return {
      principal,
      membership: activeMembership,
      effectiveRoles,
      effectiveScopes: Array.from(effectiveScopesSet),
      driftDetected,
      ...(driftDetails ? { driftDetails } : {}),
    };
  }

  private isInactiveStatus(status: CanonicalAccountStatus): boolean {
    return status !== "active";
  }

  private readHeader(headers: HeaderRecord, key: string): string | null {
    if (!headers) return null;
    if (headers instanceof Headers) {
      return headers.get(key);
    }
    const val = (headers as Record<string, any>)[key] || (headers as Record<string, any>)[key.toLowerCase()];
    if (Array.isArray(val)) return val[0] ?? null;
    return typeof val === "string" ? val : null;
  }

  private emitDeniedEvent(reason: string, target: string, actorId?: string) {
    if (!this.securityEventsService) return;
    this.securityEventsService.recordEvent({
      actorId: actorId ?? "anonymous",
      actorType: "platform_admin",
      subjectId: target,
      realm: "platform",
      tenantId: null,
      partnerId: null,
      eventType: "iap_subject.denied",
      eventFamily: "auth",
      outcome: "denied",
      severity: "medium",
      targetType: "iap_workforce_subject",
      targetId: target,
      sessionId: null,
      tokenId: null,
      authMethods: ["iap"],
      sourceIp: null,
      userAgent: null,
      requestId: null,
      traceId: null,
      reasonCode: reason,
      approvalId: null,
      maskedContext: {
        summary: `IAP assertion denied: ${reason} (target: ${target})`,
        reason,
        target,
      },
    });
  }

  private emitGroupDriftEvent(actorId: string, driftDetails: NonNullable<ResolvedIapWorkforceSubject["driftDetails"]>) {
    if (!this.securityEventsService) return;
    this.securityEventsService.recordEvent({
      actorId,
      actorType: "platform_admin",
      subjectId: actorId,
      realm: "platform",
      tenantId: null,
      partnerId: null,
      eventType: "iap_group_drift.detected",
      eventFamily: "role",
      outcome: "success",
      severity: "high",
      targetType: "iap_workforce_membership",
      targetId: actorId,
      sessionId: null,
      tokenId: null,
      authMethods: ["iap"],
      sourceIp: null,
      userAgent: null,
      requestId: null,
      traceId: null,
      reasonCode: "group_drift_applied",
      approvalId: null,
      maskedContext: {
        summary: `IAP group drift detected for ${actorId}. Downgraded from [${driftDetails.originalRoles.join(",")}] to [${driftDetails.effectiveRoles.join(",")}]. Missing groups: [${driftDetails.missingGroups.join(",")}]`,
        originalRoles: driftDetails.originalRoles,
        effectiveRoles: driftDetails.effectiveRoles,
        missingGroups: driftDetails.missingGroups,
      },
    });
  }

  private emitResolvedEvent(actorId: string, roles: string[]) {
    if (!this.securityEventsService) return;
    this.securityEventsService.recordEvent({
      actorId,
      actorType: "platform_admin",
      subjectId: actorId,
      realm: "platform",
      tenantId: null,
      partnerId: null,
      eventType: "iap_subject.resolved",
      eventFamily: "auth",
      outcome: "success",
      severity: "low",
      targetType: "iap_workforce_membership",
      targetId: actorId,
      sessionId: null,
      tokenId: null,
      authMethods: ["iap"],
      sourceIp: null,
      userAgent: null,
      requestId: null,
      traceId: null,
      reasonCode: "membership_resolved",
      approvalId: null,
      maskedContext: {
        summary: `Verified IAP subject resolved to durable membership with roles: [${roles.join(",")}]`,
        roles,
      },
    });
  }
}

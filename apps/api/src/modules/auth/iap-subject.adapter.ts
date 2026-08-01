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

import { AUTH_SCOPE_PRESETS } from "../../common/auth/auth.constants";

export const DEFAULT_IAP_ROLE_GROUP_MAPPING: Record<string, string> = {
  superadmin: "platform-admins@platform.drts",
  operator: "ops-users@platform.drts",
  platform_admin: "platform-admins@platform.drts",
  ops_user: "ops-users@platform.drts",
};

export const DEFAULT_ROLE_SCOPES: Record<string, readonly string[]> = {
  superadmin: AUTH_SCOPE_PRESETS.platform_admin,
  platform_admin: AUTH_SCOPE_PRESETS.platform_admin,
  operator: AUTH_SCOPE_PRESETS.ops_user,
  ops_user: AUTH_SCOPE_PRESETS.ops_user,
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
    const assertionGroups = payload.gcp_ia_groups || payload.groups || [];
    if (options.strictIapMode && !payload.email) {
      const { actorType, realm } = this.getActorContext(undefined, undefined, assertionGroups);
      this.emitDeniedEvent("missing_email_in_strict_mode", subject, undefined, realm, actorType);
      throw new ApiRequestError(
        401,
        "IAP_ASSERTION_INVALID",
        "IAP assertion missing email claim in strict IAP mode.",
      );
    }

    const rawEmail = payload.email || `${subject}@platform.drts`;
    const normalizedEmail = rawEmail.replace(/.*:/, "").trim().toLowerCase();

    // Durable identity resolution strictly by immutable subject
    let principal = await this.identityRepository.findPrincipalBySubject(
      "google_iap",
      subject,
    );

    const now = new Date().toISOString();

    if (principal) {
      if (this.isInactiveStatus(principal.status)) {
        const { actorType, realm } = this.getActorContext(undefined, undefined, assertionGroups);
        this.emitDeniedEvent(
          "user_inactive",
          principal.email || normalizedEmail,
          principal.principalId,
          realm,
          actorType,
        );
        throw new ApiRequestError(
          403,
          "IAP_WORKFORCE_USER_INACTIVE",
          "Workforce user account is inactive or suspended.",
        );
      }
    } else {
      if (!options.autoProvision) {
        const { actorType, realm } = this.getActorContext(undefined, undefined, assertionGroups);
        this.emitDeniedEvent("user_not_found", normalizedEmail, undefined, realm, actorType);
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
        const { actorType, realm } = this.getActorContext(undefined, undefined, assertionGroups);
        this.emitDeniedEvent("unmapped_group_membership", normalizedEmail, undefined, realm, actorType);
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

    // Lookup active control-plane (platform/ops) memberships deterministically
    const memberships = await this.identityRepository.findMembershipsByPrincipalId(
      principal.principalId,
    );
    const activeControlPlaneMemberships = memberships.filter(
      (m) =>
        !this.isInactiveStatus(m.status) &&
        (m.realm === "platform" || m.realm === "ops"),
    );

    const isPlatformGroup = assertionGroups.includes("platform-admins@platform.drts");
    const isOpsGroup = assertionGroups.includes("ops-users@platform.drts");

    let activeMembership =
      (isPlatformGroup
        ? activeControlPlaneMemberships.find((m) => m.realm === "platform")
        : null) ||
      (isOpsGroup
        ? activeControlPlaneMemberships.find((m) => m.realm === "ops")
        : null) ||
      activeControlPlaneMemberships[0];

    if (!activeMembership) {
      const { actorType, realm } = this.getActorContext(undefined, undefined, assertionGroups);
      this.emitDeniedEvent(
        "user_inactive",
        principal.email || normalizedEmail,
        principal.principalId,
        realm,
        actorType,
      );
      throw new ApiRequestError(
        403,
        "IAP_WORKFORCE_USER_INACTIVE",
        "Workforce user membership is inactive or suspended.",
      );
    }

    // Lookup durable role bindings across active control-plane memberships
    const currentTimeMs = new Date(now).getTime();
    const allRoleBindings: CanonicalIdentityRoleBindingRecord[] = [];
    for (const m of activeControlPlaneMemberships) {
      const bindings = await this.identityRepository.findRoleBindingsByMembershipId(
        m.membershipId,
      );
      allRoleBindings.push(...bindings);
    }
    const activeRoleBindings = allRoleBindings.filter((b) => {
      if (b.validFrom) {
        const validFromMs = new Date(b.validFrom).getTime();
        if (!isNaN(validFromMs) && validFromMs > currentTimeMs) {
          return false;
        }
      }
      if (b.validTo) {
        const validToMs = new Date(b.validTo).getTime();
        if (!isNaN(validToMs) && validToMs <= currentTimeMs) {
          return false;
        }
      }
      return true;
    });

    const assignedRoles = Array.from(
      new Set(activeRoleBindings.map((r) => r.roleCode)),
    );
    if (assignedRoles.length === 0) {
      const { actorType, realm } = this.getActorContext(
        activeMembership?.realm,
        undefined,
        assertionGroups,
      );
      this.emitDeniedEvent(
        "user_inactive",
        principal.email || normalizedEmail,
        principal.principalId,
        realm,
        actorType,
      );
      throw new ApiRequestError(
        403,
        "IAP_WORKFORCE_USER_INACTIVE",
        "Workforce user has no active durable role bindings.",
      );
    }
    const originalRoles = assignedRoles;

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
      const { actorType, realm } = this.getActorContext(
        activeMembership?.realm,
        originalRoles,
        assertionGroups,
      );
      this.emitDeniedEvent(
        "unmapped_group_membership",
        principal.email || normalizedEmail,
        principal.principalId,
        realm,
        actorType,
      );
      throw new ApiRequestError(
        403,
        "IAP_WORKFORCE_USER_INACTIVE",
        "Workforce user has no active verified group memberships.",
      );
    }

    // Align membership realm with verified groups and effective roles
    const hasPlatformRole = effectiveRoles.some(
      (r) => r === "superadmin" || r === "platform_admin",
    );
    const expectedRealm: "platform" | "ops" =
      isPlatformGroup && hasPlatformRole ? "platform" : "ops";

    if (activeMembership.realm !== expectedRealm) {
      const matchingMembership = activeControlPlaneMemberships.find(
        (m) => m.realm === expectedRealm,
      );
      if (matchingMembership) {
        activeMembership = matchingMembership;
      }
    }

    const finalActorContext = this.getActorContext(
      activeMembership.realm,
      effectiveRoles,
      assertionGroups,
    );

    let driftDetails: ResolvedIapWorkforceSubject["driftDetails"];
    if (driftDetected) {
      driftDetails = {
        originalRoles,
        effectiveRoles,
        missingGroups,
      };
      this.emitGroupDriftEvent(
        principal.principalId,
        driftDetails,
        finalActorContext.realm,
        finalActorContext.actorType,
      );
    }

    // Derive effective scopes strictly from verified roles (ignoring any client spoofed x-scopes)
    const effectiveScopesSet = new Set<string>();
    for (const role of effectiveRoles) {
      const scopes = DEFAULT_ROLE_SCOPES[role] ?? DEFAULT_ROLE_SCOPES.ops_user;
      scopes?.forEach((s) => effectiveScopesSet.add(s));
    }

    this.emitResolvedEvent(
      principal.principalId,
      effectiveRoles,
      finalActorContext.realm,
      finalActorContext.actorType,
    );

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

  private getActorContext(
    realm?: "platform" | "ops" | string | null,
    roles?: string[],
    assertionGroups?: string[],
  ): { actorType: "platform_admin" | "ops_user"; realm: "platform" | "ops" } {
    if (realm === "ops") {
      return { actorType: "ops_user", realm: "ops" };
    }
    if (realm === "platform") {
      return { actorType: "platform_admin", realm: "platform" };
    }
    if (roles && roles.length > 0) {
      const hasPlatformRole = roles.some((r) => r === "superadmin" || r === "platform_admin");
      const hasOpsRole = roles.some((r) => r === "operator" || r === "ops_user");
      if (!hasPlatformRole && hasOpsRole) {
        return { actorType: "ops_user", realm: "ops" };
      }
      if (hasPlatformRole) {
        return { actorType: "platform_admin", realm: "platform" };
      }
    }
    if (assertionGroups && assertionGroups.length > 0) {
      const isOpsGroup = assertionGroups.includes("ops-users@platform.drts");
      const isPlatformGroup = assertionGroups.includes("platform-admins@platform.drts");
      if (isOpsGroup && !isPlatformGroup) {
        return { actorType: "ops_user", realm: "ops" };
      }
    }
    return { actorType: "platform_admin", realm: "platform" };
  }

  private emitDeniedEvent(
    reason: string,
    target: string,
    actorId?: string,
    realm: "platform" | "ops" = "platform",
    actorType: "platform_admin" | "ops_user" = "platform_admin",
  ) {
    if (!this.securityEventsService) return;
    this.securityEventsService.recordEvent({
      actorId: actorId ?? "anonymous",
      actorType,
      subjectId: target,
      realm,
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

  private emitGroupDriftEvent(
    actorId: string,
    driftDetails: NonNullable<ResolvedIapWorkforceSubject["driftDetails"]>,
    realm: "platform" | "ops",
    actorType: "platform_admin" | "ops_user",
  ) {
    if (!this.securityEventsService) return;
    this.securityEventsService.recordEvent({
      actorId,
      actorType,
      subjectId: actorId,
      realm,
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

  private emitResolvedEvent(
    actorId: string,
    roles: string[],
    realm: "platform" | "ops",
    actorType: "platform_admin" | "ops_user",
  ) {
    if (!this.securityEventsService) return;
    this.securityEventsService.recordEvent({
      actorId,
      actorType,
      subjectId: actorId,
      realm,
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

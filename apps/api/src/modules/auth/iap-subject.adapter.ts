import { Injectable, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

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
  admin: "platform-admins@platform.drts",
  viewer: "platform-admins@platform.drts",
  operator: "ops-users@platform.drts",
  platform_admin: "platform-admins@platform.drts",
  ops_user: "ops-users@platform.drts",
};

const PLATFORM_VIEWER_SCOPES = [
  "identity:read",
  "foundation:read",
  "audit:read",
  "notifications:read",
  "tenant:read",
  "tenant:webhooks:read",
  "tenant:sla:read",
  "tenant:billing:read",
  "billing:read",
  "regulatory:read",
  "incident:read",
  "maintenance:read",
  "reports:read",
  "forwarder:read",
  "sandbox.compliance.read",
  "sandbox.investigation.read",
  "sandbox.evidence.preview",
  "multi_taxi_ratings:read",
] as const;

export const DEFAULT_ROLE_SCOPES: Record<string, readonly string[]> = {
  superadmin: AUTH_SCOPE_PRESETS.platform_admin,
  admin: AUTH_SCOPE_PRESETS.platform_admin,
  viewer: PLATFORM_VIEWER_SCOPES,
  platform_admin: AUTH_SCOPE_PRESETS.platform_admin,
  operator: AUTH_SCOPE_PRESETS.ops_user,
  ops_user: AUTH_SCOPE_PRESETS.ops_user,
};

export interface ResolveIapSubjectOptions {
  expectedAudience?: string;
  expectedIssuer?: string;
  jwtSecretOrPublicKey?: string;
  strictIapMode?: boolean;
  autoProvision?: boolean;
  roleGroupMapping?: Record<string, string>;
  requestedRealm?: "platform" | "ops";
}

export interface ResolvedIapWorkforceSubject {
  principal: CanonicalIdentityPrincipalRecord;
  membership: CanonicalIdentityMembershipRecord;
  effectiveRoles: string[];
  effectiveScopes: string[];
  tokenVersion: number;
  driftDetected: boolean;
  /** Server-owned authentication evidence for the MFA / step-up policy. */
  authMethods: string[];
  assurance: "aal1" | "aal2" | "aal3";
  /** Authentication time from the verified assertion, or null when absent. */
  authTime: string | null;
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
    const isHeaderObj =
      typeof headersOrAssertion === "object" && headersOrAssertion !== null;
    const headers = isHeaderObj ? (headersOrAssertion as HeaderRecord) : null;
    const rawAssertion =
      typeof headersOrAssertion === "string"
        ? headersOrAssertion
        : extractIapJwtAssertion(headers);

    // Security Check: detect spoofed unverified email/role headers without valid assertion token
    if (headers && !rawAssertion) {
      const spoofedEmail = this.readHeader(
        headers,
        "x-goog-authenticated-user-email",
      );
      const spoofedRoles = this.readHeader(headers, "x-roles");
      const spoofedScopes = this.readHeader(headers, "x-scopes");

      if (
        spoofedEmail ||
        spoofedRoles ||
        spoofedScopes ||
        options.strictIapMode
      ) {
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
        expectedIssuer: options.expectedIssuer,
        jwtSecretOrPublicKey: options.jwtSecretOrPublicKey,
      });
    } catch (err: any) {
      if (
        err?.code === "IAP_AUDIENCE_MISMATCH" ||
        err?.message?.includes("audience mismatch")
      ) {
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
      const { actorType, realm } = this.getActorContext(
        undefined,
        undefined,
        assertionGroups,
      );
      this.emitDeniedEvent(
        "missing_email_in_strict_mode",
        subject,
        undefined,
        realm,
        actorType,
      );
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

    if (!principal) {
      const provisionedPrincipal =
        await this.findProvisionedControlPlanePrincipalByEmail(normalizedEmail);
      if (provisionedPrincipal) {
        principal = await this.identityRepository.ensurePrincipalRecord({
          ...provisionedPrincipal,
          issuer: "google_iap",
          subject,
          email: normalizedEmail,
          emailVerified: true,
          displayName:
            provisionedPrincipal.displayName ||
            normalizedEmail.split("@")[0] ||
            "IAP User",
          updatedAt: now,
        });
      }
    }

    if (principal) {
      if (this.isInactiveStatus(principal.status)) {
        const { actorType, realm } = this.getActorContext(
          undefined,
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
          "Workforce user account is inactive or suspended.",
        );
      }
    } else {
      if (!options.autoProvision) {
        const { actorType, realm } = this.getActorContext(
          undefined,
          undefined,
          assertionGroups,
        );
        this.emitDeniedEvent(
          "user_not_found",
          normalizedEmail,
          undefined,
          realm,
          actorType,
        );
        throw new ApiRequestError(
          403,
          "IAP_WORKFORCE_USER_INACTIVE",
          "Workforce user identity is not provisioned.",
        );
      }

      // Provision new principal strictly from verified IAP groups, not email substring
      const isPlatformAdminGroup = assertionGroups.includes(
        "platform-admins@platform.drts",
      );
      const isOpsUserGroup = assertionGroups.includes(
        "ops-users@platform.drts",
      );

      if (!isPlatformAdminGroup && !isOpsUserGroup) {
        const { actorType, realm } = this.getActorContext(
          undefined,
          undefined,
          assertionGroups,
        );
        this.emitDeniedEvent(
          "unmapped_group_membership",
          normalizedEmail,
          undefined,
          realm,
          actorType,
        );
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
    const memberships =
      await this.identityRepository.findMembershipsByPrincipalId(
        principal.principalId,
      );
    const activeControlPlaneMemberships = memberships.filter(
      (m) =>
        !this.isInactiveStatus(m.status) &&
        (m.realm === "platform" || m.realm === "ops"),
    );

    // Surface choice resolution: determine requested realm from options or request headers
    let requestedRealm: "platform" | "ops" | undefined = options.requestedRealm;
    if (!requestedRealm && headers && !options.strictIapMode) {
      const headerRealm = this.readHeader(headers, "x-realm")?.toLowerCase();
      if (headerRealm === "ops" || headerRealm === "platform") {
        requestedRealm = headerRealm as "platform" | "ops";
      } else {
        const headerActorType = this.readHeader(
          headers,
          "x-actor-type",
        )?.toLowerCase();
        if (headerActorType === "ops_user") {
          requestedRealm = "ops";
        } else if (headerActorType === "platform_admin") {
          requestedRealm = "platform";
        } else {
          const authHeader =
            this.readHeader(headers, "x-drts-authorization") ||
            this.readHeader(headers, "authorization");
          if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
              const token = authHeader.slice(7).trim();
              const decoded = jwt.decode(token) as {
                realm?: string;
                actorType?: string;
              } | null;
              if (
                decoded?.realm === "ops" ||
                decoded?.actorType === "ops_user"
              ) {
                requestedRealm = "ops";
              } else if (
                decoded?.realm === "platform" ||
                decoded?.actorType === "platform_admin"
              ) {
                requestedRealm = "platform";
              }
            } catch {
              // Ignore invalid Bearer header decoding during surface detection
            }
          }
        }
      }
    }

    const isPlatformGroup = assertionGroups.includes(
      "platform-admins@platform.drts",
    );
    const isOpsGroup = assertionGroups.includes("ops-users@platform.drts");

    const currentTimeMs = new Date(now).getTime();
    const roleGroupMapping =
      options.roleGroupMapping ?? DEFAULT_IAP_ROLE_GROUP_MAPPING;

    interface MembershipAnalysis {
      membership: CanonicalIdentityMembershipRecord;
      originalRoles: string[];
      effectiveRoles: string[];
      missingGroups: string[];
      tokenVersionTimestamps: string[];
      driftDetected: boolean;
    }

    const membershipAnalyses: MembershipAnalysis[] = [];
    const allMissingGroups = new Set<string>();
    let overallDriftDetected = false;

    for (const m of activeControlPlaneMemberships) {
      const bindings =
        await this.identityRepository.findRoleBindingsByMembershipId(
          m.membershipId,
        );
      const activeBindings = bindings.filter((b) => {
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

      const allAssignedRoles = Array.from(
        new Set(activeBindings.map((b) => b.roleCode)),
      );
      const assignedRoles = allAssignedRoles.filter((r) => {
        if (m.realm === "platform") {
          return (
            r === "superadmin" ||
            r === "platform_admin" ||
            r === "admin" ||
            r === "viewer" ||
            r === "security_admin"
          );
        }
        if (m.realm === "ops") {
          return r === "operator" || r === "ops_user";
        }
        return true;
      });

      const missingGroupsForM: string[] = [];
      const effectiveRolesForM: string[] = [];
      let driftForM = false;

      for (const role of assignedRoles) {
        const requiredGroup = roleGroupMapping[role];
        if (requiredGroup) {
          if (assertionGroups.includes(requiredGroup)) {
            effectiveRolesForM.push(role);
          } else {
            driftForM = true;
            overallDriftDetected = true;
            missingGroupsForM.push(requiredGroup);
            allMissingGroups.add(requiredGroup);
          }
        } else {
          effectiveRolesForM.push(role);
        }
      }

      membershipAnalyses.push({
        membership: m,
        originalRoles: assignedRoles,
        effectiveRoles: effectiveRolesForM,
        missingGroups: missingGroupsForM,
        tokenVersionTimestamps: [
          m.updatedAt,
          ...bindings.map((b) => b.updatedAt),
        ],
        driftDetected: driftForM,
      });
    }

    let selectedAnalysis: MembershipAnalysis | undefined;

    if (requestedRealm) {
      const targetAnalysis = membershipAnalyses.find(
        (a) => a.membership.realm === requestedRealm,
      );
      if (!targetAnalysis) {
        const { actorType, realm } = this.getActorContext(
          requestedRealm,
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
          "Workforce user has no active durable membership for requested realm.",
        );
      }

      if (targetAnalysis.originalRoles.length === 0) {
        const { actorType, realm } = this.getActorContext(
          targetAnalysis.membership.realm,
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

      if (targetAnalysis.effectiveRoles.length === 0) {
        const { actorType, realm } = this.getActorContext(
          targetAnalysis.membership.realm,
          targetAnalysis.originalRoles,
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

      selectedAnalysis = targetAnalysis;
    } else {
      const candidateAnalyses = [...membershipAnalyses];
      candidateAnalyses.sort((a, b) => {
        const getRealmPriority = (realm: string): number => {
          if (isPlatformGroup) {
            // When user has platform-admins group (or both platform and ops groups),
            // platform membership takes precedence over ops.
            return realm === "platform" ? 0 : realm === "ops" ? 1 : 2;
          }
          if (isOpsGroup) {
            // When user has ops-users group but not platform-admins group,
            // ops membership takes precedence over platform.
            return realm === "ops" ? 0 : realm === "platform" ? 1 : 2;
          }
          // Default order when no explicit platform/ops group signals matched:
          // platform takes precedence over ops.
          return realm === "platform" ? 0 : realm === "ops" ? 1 : 2;
        };

        const priorityDiff =
          getRealmPriority(a.membership.realm) -
          getRealmPriority(b.membership.realm);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return a.membership.membershipId.localeCompare(
          b.membership.membershipId,
        );
      });

      selectedAnalysis = candidateAnalyses.find(
        (a) => a.effectiveRoles.length > 0,
      );

      if (!selectedAnalysis) {
        const hadRolesCandidate = candidateAnalyses.find(
          (a) => a.originalRoles.length > 0,
        );
        if (hadRolesCandidate) {
          const { actorType, realm } = this.getActorContext(
            hadRolesCandidate.membership.realm,
            hadRolesCandidate.originalRoles,
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

        const fallbackCandidate = candidateAnalyses[0];
        const { actorType, realm } = this.getActorContext(
          fallbackCandidate?.membership.realm,
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
    }

    const activeMembership = selectedAnalysis.membership;
    const effectiveRoles = selectedAnalysis.effectiveRoles;
    const originalRoles = selectedAnalysis.originalRoles;
    const tokenVersion = Math.max(
      Date.parse(principal.updatedAt),
      ...selectedAnalysis.tokenVersionTimestamps.map((timestamp) =>
        Date.parse(timestamp),
      ),
    );

    const finalActorContext = this.getActorContext(
      activeMembership.realm,
      effectiveRoles,
      assertionGroups,
    );

    let driftDetails: ResolvedIapWorkforceSubject["driftDetails"];
    const missingGroupsList = requestedRealm
      ? selectedAnalysis.missingGroups
      : allMissingGroups.size > 0
        ? Array.from(allMissingGroups)
        : selectedAnalysis.missingGroups;
    const hasDrift = requestedRealm
      ? selectedAnalysis.driftDetected || missingGroupsList.length > 0
      : overallDriftDetected ||
        selectedAnalysis.driftDetected ||
        missingGroupsList.length > 0;

    if (hasDrift) {
      driftDetails = {
        originalRoles,
        effectiveRoles,
        missingGroups: missingGroupsList,
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

    const authMethods = this.resolveAssertionAmr(payload);
    const assurance = this.resolveAssertionAssurance(payload, authMethods);
    const authTime = this.resolveAssertionAuthTime(payload);

    return {
      principal,
      membership: activeMembership,
      effectiveRoles,
      effectiveScopes: Array.from(effectiveScopesSet),
      tokenVersion,
      driftDetected: hasDrift,
      authMethods,
      assurance,
      authTime,
      ...(driftDetails ? { driftDetails } : {}),
    };
  }

  private async findProvisionedControlPlanePrincipalByEmail(email: string) {
    const principals =
      await this.identityRepository.findPrincipalsByEmail(email);
    for (const principal of principals) {
      if (principal.issuer === "google_iap") {
        continue;
      }
      const memberships =
        await this.identityRepository.findMembershipsByPrincipalId(
          principal.principalId,
        );
      if (
        memberships.some(
          (membership) =>
            membership.scopeRef === "platform:control_plane" &&
            (membership.realm === "platform" || membership.realm === "ops"),
        )
      ) {
        return principal;
      }
    }
    return null;
  }

  /**
   * Authentication time for the step-up freshness window, taken only from the
   * verified assertion. When the assertion carries no `auth_time`, the result
   * is null, and the step-up policy fails closed rather than treating `iat` or
   * request time as login time.
   */
  private resolveAssertionAuthTime(payload: IapJwtPayload): string | null {
    const rawAuthTime = payload["auth_time"];
    const seconds =
      typeof rawAuthTime === "number" && Number.isFinite(rawAuthTime)
        ? rawAuthTime
        : null;

    return seconds === null ? null : new Date(seconds * 1000).toISOString();
  }

  /**
   * Extract authenticating method references (amr) strictly from the verified assertion payload.
   * Projects trusted MFA/amr methods or `verified_iap_workforce` when present in payload or when ACR indicates silver/AAL2.
   * Otherwise returns empty array to prevent fabricating false MFA claims.
   */
  private resolveAssertionAmr(payload: IapJwtPayload): string[] {
    const rawAmr = payload["amr"] ?? payload["gcp_ia_gsuite_amr"];
    if (Array.isArray(rawAmr)) {
      const filtered = rawAmr.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      );
      if (filtered.length > 0) {
        return filtered;
      }
    } else if (typeof rawAmr === "string" && rawAmr.trim().length > 0) {
      return [rawAmr.trim()];
    }

    const rawAcr = typeof payload["acr"] === "string" ? payload["acr"].trim().toLowerCase() : null;
    if (rawAcr === "aal2" || rawAcr === "aal3" || rawAcr === "urn:mace:incommon:iap:silver") {
      return ["verified_iap_workforce"];
    }

    return [];
  }

  /**
   * Extract assurance (acr) level strictly from the verified assertion payload and resolved amr.
   */
  private resolveAssertionAssurance(
    payload: IapJwtPayload,
    authMethods: string[],
  ): "aal1" | "aal2" | "aal3" {
    const rawAcr = typeof payload["acr"] === "string" ? payload["acr"].trim().toLowerCase() : null;
    if (rawAcr === "aal3" || rawAcr === "3") {
      return "aal3";
    }
    if (rawAcr === "aal2" || rawAcr === "2" || rawAcr === "urn:mace:incommon:iap:silver") {
      return "aal2";
    }
    if (rawAcr === "aal1" || rawAcr === "1" || rawAcr === "urn:mace:incommon:iap:bronze") {
      return "aal1";
    }

    const trustedMfaMethods = new Set([
      "mfa",
      "otp",
      "totp",
      "push",
      "webauthn",
      "fido2",
      "verified_iap_workforce",
    ]);
    if (authMethods.some((method) => trustedMfaMethods.has(method.toLowerCase()))) {
      return "aal2";
    }

    return "aal1";
  }

  private isInactiveStatus(status: CanonicalAccountStatus): boolean {
    return status !== "active";
  }

  private readHeader(headers: HeaderRecord, key: string): string | null {
    if (!headers) return null;
    if (headers instanceof Headers) {
      return headers.get(key);
    }
    const val =
      (headers as Record<string, any>)[key] ||
      (headers as Record<string, any>)[key.toLowerCase()];
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
      const hasPlatformRole = roles.some(
<<<<<<< HEAD
        (r) =>
          r === "superadmin" ||
          r === "platform_admin" ||
          r === "admin" ||
          r === "viewer",
=======
        (r) => r === "superadmin" || r === "platform_admin" || r === "security_admin",
>>>>>>> 0d95b522e (fix(IAM-RBAC-002): enforce activation SoD recheck with fail-closed state and project canonical claims)
      );
      const hasOpsRole = roles.some(
        (r) => r === "operator" || r === "ops_user",
      );
      if (!hasPlatformRole && hasOpsRole) {
        return { actorType: "ops_user", realm: "ops" };
      }
      if (hasPlatformRole) {
        return { actorType: "platform_admin", realm: "platform" };
      }
    }
    if (assertionGroups && assertionGroups.length > 0) {
      const isOpsGroup = assertionGroups.includes("ops-users@platform.drts");
      const isPlatformGroup = assertionGroups.includes(
        "platform-admins@platform.drts",
      );
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

import { Injectable, Optional } from "@nestjs/common";
import jwt from "jsonwebtoken";

import type {
  CanonicalAccountStatus,
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
} from "@drts/contracts";
import {
  extractIapJwtAssertion,
  resolveGoogleIapJwtVerificationKey,
  verifyIapJwtAssertion,
  type HeaderRecord,
  type IapJwtPayload,
} from "@drts/control-plane-auth";

import { ApiRequestError } from "../../common/api-envelope";
import { IdentityRepository } from "../identity/identity.repository";
import { SecurityEventsService } from "../security-events/security-events.service";

import { AUTH_SCOPE_PRESETS } from "../../common/auth/auth.constants";

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
  security_admin: AUTH_SCOPE_PRESETS.platform_admin,
  operator: AUTH_SCOPE_PRESETS.ops_user,
  ops_user: AUTH_SCOPE_PRESETS.ops_user,
};

export interface ResolveIapSubjectOptions {
  expectedAudience?: string;
  expectedIssuer?: string;
  jwtSecretOrPublicKey?: string;
  strictIapMode?: boolean;
  requestedRealm?: "platform" | "ops";
}

export interface ResolvedIapWorkforceSubject {
  principal: CanonicalIdentityPrincipalRecord;
  membership: CanonicalIdentityMembershipRecord;
  effectiveRoles: string[];
  effectiveScopes: string[];
  tokenVersion: number;
  /** Server-owned authentication evidence for the MFA / step-up policy. */
  authMethods: string[];
  assurance: "aal1" | "aal2" | "aal3";
  /** Authentication time from the verified assertion, or null when absent. */
  authTime: string | null;
}

/**
 * Resolves a verified Google IAP assertion to a durable workforce identity.
 *
 * Role authority comes exclusively from persisted `iam.identity_role_bindings`
 * rows looked up by the assertion's verified `email`, never from a `groups` /
 * `gcp_ia_groups` claim: a real Cloud IAP JWT carries no group membership
 * claim at all (see docs/02-architecture/entry-iap-workforce-20261005.md), so
 * gating roles on one meant every real login resolved to zero effective
 * roles. An email with no persisted, active platform/ops membership and role
 * binding is denied outright -- this adapter never auto-provisions a new
 * workforce identity from assertion content.
 */
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

    // Verify assertion. With no explicit jwtSecretOrPublicKey (the real
    // production path), resolve the Google-managed ES256 key for this
    // assertion's kid from Google's rotating IAP JWKS before verifying.
    let payload: IapJwtPayload;
    try {
      const verificationKey =
        options.jwtSecretOrPublicKey ??
        (await resolveGoogleIapJwtVerificationKey(rawAssertion));
      payload = verifyIapJwtAssertion(rawAssertion, {
        expectedAudience: options.expectedAudience,
        expectedIssuer: options.expectedIssuer,
        jwtSecretOrPublicKey: verificationKey,
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
    if (options.strictIapMode && !payload.email) {
      this.emitDeniedEvent(
        "missing_email_in_strict_mode",
        subject,
        undefined,
        "platform",
        "platform_admin",
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

    if (!principal) {
      // Deny-by-default: an email with no pre-existing, persisted account/
      // membership/role binding is never auto-provisioned from assertion
      // content (a real IAP token carries no group or role claim to
      // provision from in the first place).
      this.emitDeniedEvent(
        "user_not_found",
        normalizedEmail,
        undefined,
        "platform",
        "platform_admin",
      );
      throw new ApiRequestError(
        403,
        "IAP_WORKFORCE_USER_INACTIVE",
        "Workforce user identity is not provisioned.",
      );
    }

    if (this.isInactiveStatus(principal.status)) {
      const { actorType, realm } = this.getActorContext(undefined, undefined);
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

    const currentTimeMs = new Date(now).getTime();

    interface MembershipAnalysis {
      membership: CanonicalIdentityMembershipRecord;
      roles: string[];
      tokenVersionTimestamps: string[];
    }

    const membershipAnalyses: MembershipAnalysis[] = [];

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
      // Roles are scoped to the membership's realm: a role code that only
      // makes sense for the other realm (e.g. an ops-only `operator` role
      // recorded against a platform membership) never grants access there.
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

      membershipAnalyses.push({
        membership: m,
        roles: assignedRoles,
        tokenVersionTimestamps: [
          m.updatedAt,
          ...bindings.map((b) => b.updatedAt),
        ],
      });
    }

    let selectedAnalysis: MembershipAnalysis | undefined;

    if (requestedRealm) {
      const targetAnalysis = membershipAnalyses.find(
        (a) => a.membership.realm === requestedRealm,
      );
      if (!targetAnalysis) {
        const { actorType, realm } = this.getActorContext(requestedRealm);
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

      if (targetAnalysis.roles.length === 0) {
        const { actorType, realm } = this.getActorContext(
          targetAnalysis.membership.realm,
          targetAnalysis.roles,
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

      selectedAnalysis = targetAnalysis;
    } else {
      // No explicit realm requested: platform membership wins over ops when
      // the account holds both, deterministically tie-broken by membershipId.
      const candidateAnalyses = [...membershipAnalyses].sort((a, b) => {
        const priority = (realm: string) =>
          realm === "platform" ? 0 : realm === "ops" ? 1 : 2;
        const priorityDiff =
          priority(a.membership.realm) - priority(b.membership.realm);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return a.membership.membershipId.localeCompare(
          b.membership.membershipId,
        );
      });

      selectedAnalysis = candidateAnalyses.find((a) => a.roles.length > 0);

      if (!selectedAnalysis) {
        const fallbackCandidate = candidateAnalyses[0];
        const { actorType, realm } = this.getActorContext(
          fallbackCandidate?.membership.realm,
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
    const effectiveRoles = selectedAnalysis.roles;
    const tokenVersion = Math.max(
      Date.parse(principal.updatedAt),
      ...selectedAnalysis.tokenVersionTimestamps.map((timestamp) =>
        Date.parse(timestamp),
      ),
    );

    const finalActorContext = this.getActorContext(
      activeMembership.realm,
      effectiveRoles,
    );

    // Derive effective scopes strictly from verified persisted roles
    // (ignoring any client-spoofed x-scopes).
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
      authMethods,
      assurance,
      authTime,
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
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      );
      if (filtered.length > 0) {
        return filtered;
      }
    } else if (typeof rawAmr === "string" && rawAmr.trim().length > 0) {
      return [rawAmr.trim()];
    }

    const rawAcr =
      typeof payload["acr"] === "string"
        ? payload["acr"].trim().toLowerCase()
        : null;
    if (
      rawAcr === "aal2" ||
      rawAcr === "aal3" ||
      rawAcr === "urn:mace:incommon:iap:silver"
    ) {
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
    const rawAcr =
      typeof payload["acr"] === "string"
        ? payload["acr"].trim().toLowerCase()
        : null;
    if (rawAcr === "aal3" || rawAcr === "3") {
      return "aal3";
    }
    if (
      rawAcr === "aal2" ||
      rawAcr === "2" ||
      rawAcr === "urn:mace:incommon:iap:silver"
    ) {
      return "aal2";
    }
    if (
      rawAcr === "aal1" ||
      rawAcr === "1" ||
      rawAcr === "urn:mace:incommon:iap:bronze"
    ) {
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
    if (
      authMethods.some((method) => trustedMfaMethods.has(method.toLowerCase()))
    ) {
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
  ): { actorType: "platform_admin" | "ops_user"; realm: "platform" | "ops" } {
    if (realm === "ops") {
      return { actorType: "ops_user", realm: "ops" };
    }
    if (realm === "platform") {
      return { actorType: "platform_admin", realm: "platform" };
    }
    if (roles && roles.length > 0) {
      const hasPlatformRole = roles.some(
        (r) =>
          r === "superadmin" ||
          r === "platform_admin" ||
          r === "admin" ||
          r === "viewer" ||
          r === "security_admin",
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

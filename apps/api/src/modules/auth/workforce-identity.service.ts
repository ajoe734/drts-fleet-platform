import { Injectable, Optional } from "@nestjs/common";
import jwt from "jsonwebtoken";

import type {
  CanonicalAccountStatus,
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  AUTH_ROLE_FAMILY_FROM_ACTOR_TYPE,
  AUTH_SCOPE_PRESETS,
  getPlatformAdminRoleScopes,
} from "../../common/auth/auth.constants";
import type {
  AuthActorType,
  AuthBootstrapHeaders,
  BootstrapRequestIdentity,
} from "../../common/auth/auth.types";
import { SecurityEventsService } from "../security-events/security-events.service";
import {
  IdentityRepository,
  type CanonicalMembershipSnapshot,
} from "../identity/identity.repository";

const CONTROL_PLANE_REQUESTED_ACTOR_TYPE_HEADER =
  "x-drts-control-plane-actor-type" as const;
const IAP_ASSERTION_HEADER = "x-goog-iap-jwt-assertion" as const;
const IAP_EMAIL_HEADER = "x-goog-authenticated-user-email" as const;
const IAP_USER_ID_HEADER = "x-goog-authenticated-user-id" as const;
const DEFAULT_WORKFORCE_ASSERTION_ISSUER = "https://cloud.google.com/iap";
type ControlPlaneActorType = Extract<AuthActorType, "platform_admin" | "ops_user">;
type WorkforceRealm = "platform" | "ops";

type WorkforceAssertionPayload = jwt.JwtPayload & {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  active?: boolean;
  groups?: unknown;
  "google.groups"?: unknown;
};

type WorkforceGrant = {
  realm: WorkforceRealm;
  actorType: ControlPlaneActorType;
  roleCode: string;
};

type WorkforceResolutionResult = {
  identity: BootstrapRequestIdentity;
  principal: CanonicalIdentityPrincipalRecord;
  membership: CanonicalIdentityMembershipRecord;
  roleBinding: CanonicalIdentityRoleBindingRecord;
  driftDetected: boolean;
  authenticatedUserEmail: string | null;
};

const DEFAULT_GROUP_GRANTS: Readonly<Record<string, WorkforceGrant>> = {
  "drts-platform-superadmin": {
    realm: "platform",
    actorType: "platform_admin",
    roleCode: "superadmin",
  },
  "drts-platform-admin": {
    realm: "platform",
    actorType: "platform_admin",
    roleCode: "admin",
  },
  "drts-platform-operator": {
    realm: "platform",
    actorType: "platform_admin",
    roleCode: "operator",
  },
  "drts-platform-viewer": {
    realm: "platform",
    actorType: "platform_admin",
    roleCode: "viewer",
  },
  "drts-ops-user": {
    realm: "ops",
    actorType: "ops_user",
    roleCode: "ops_user",
  },
} as const;

const PLATFORM_ROLE_PRIORITY: Readonly<Record<string, number>> = {
  viewer: 0,
  operator: 1,
  admin: 2,
  superadmin: 3,
};

@Injectable()
export class WorkforceIdentityService {
  constructor(
    private readonly identityRepository: IdentityRepository,
    @Optional()
    private readonly securityEventsService?: SecurityEventsService,
  ) {}

  async resolveVerifiedWorkforceIdentity(
    headers: AuthBootstrapHeaders,
    requestId?: string | null,
  ): Promise<WorkforceResolutionResult> {
    const requestedActorType = this.readRequestedActorType(headers);
    const requestedRealm = this.resolveRealmForActorType(requestedActorType);
    const assertion = this.verifyAssertion(headers);
    const subject = this.requireVerifiedSubject(assertion, requestedActorType, requestId);
    const groups = this.extractGroups(assertion);
    const grants = this.resolveDesiredGrants(groups);
    const principalStatus = this.resolvePrincipalStatus(assertion);
    const normalizedHeaderEmail = this.normalizeEmail(
      this.readHeader(headers, IAP_EMAIL_HEADER) ??
        this.readHeader(headers, IAP_USER_ID_HEADER),
    );
    const normalizedAssertionEmail = this.normalizeEmail(assertion.email);

    if (
      normalizedHeaderEmail &&
      normalizedAssertionEmail &&
      normalizedHeaderEmail !== normalizedAssertionEmail
    ) {
      this.recordSecurityEvent({
        actorId: null,
        actorType: "system",
        subjectId: subject,
        realm: requestedRealm,
        tenantId: null,
        partnerId: null,
        eventType: "workforce_session_exchange.denied",
        outcome: "denied",
        severity: "medium",
        requestId: requestId ?? null,
        reasonCode: "spoofed_email_header",
        maskedContext: {
          assertionEmail: normalizedAssertionEmail,
          headerEmail: normalizedHeaderEmail,
        },
      });
      throw this.buildDeniedError("spoofed_email_header");
    }

    if (principalStatus !== "active") {
      this.recordSecurityEvent({
        actorId: null,
        actorType: "system",
        subjectId: subject,
        realm: requestedRealm,
        tenantId: null,
        partnerId: null,
        eventType: "workforce_session_exchange.denied",
        outcome: "denied",
        severity: "medium",
        requestId: requestId ?? null,
        reasonCode: "inactive_workforce_user",
        maskedContext: {
          subject: assertion.sub ?? null,
        },
      });
      throw this.buildDeniedError("inactive_workforce_user");
    }

    if (grants.length === 0) {
      this.recordSecurityEvent({
        actorId: null,
        actorType: "system",
        subjectId: assertion.sub ?? null,
        realm: requestedRealm,
        tenantId: null,
        partnerId: null,
        eventType: "workforce_session_exchange.denied",
        outcome: "denied",
        severity: "medium",
        requestId: requestId ?? null,
        reasonCode: "unmapped_workforce_subject",
        maskedContext: {
          groups,
        },
      });
      throw this.buildDeniedError("unmapped_workforce_subject");
    }

    const syncResult = await this.identityRepository.syncWorkforceSubject({
      issuer: this.getAssertionIssuer(),
      subject,
      email: normalizedAssertionEmail,
      emailVerified: assertion.email_verified === true,
      displayName:
        typeof assertion.name === "string" ? assertion.name.trim() || null : null,
      status: principalStatus,
      groups,
      grants,
    });

    const resolvedGrant = grants.find(
      (grant) =>
        grant.actorType === requestedActorType && grant.realm === requestedRealm,
    );
    if (!resolvedGrant) {
      this.recordSecurityEvent({
        actorId: syncResult.principal.principalId,
        actorType: "system",
        subjectId: syncResult.principal.subject,
        realm: requestedRealm,
        tenantId: null,
        partnerId: null,
        eventType: "workforce_session_exchange.denied",
        outcome: "denied",
        severity: "medium",
        requestId: requestId ?? null,
        reasonCode: "realm_membership_missing",
        maskedContext: {
          requestedActorType,
          grants: grants.map((grant) => grant.actorType),
        },
      });
      throw this.buildDeniedError("realm_membership_missing");
    }

    const membership = this.findActiveMembershipForGrant(
      syncResult.memberships,
      resolvedGrant,
    );
    if (!membership) {
      throw this.buildDeniedError("inactive_membership");
    }

    if (syncResult.driftDetected) {
      this.recordSecurityEvent({
        actorId: syncResult.principal.principalId,
        actorType: "system",
        subjectId: syncResult.principal.subject,
        realm: resolvedGrant.realm,
        tenantId: null,
        partnerId: null,
        eventType: "workforce_membership.drift_detected",
        outcome: "success",
        severity: "medium",
        requestId: requestId ?? null,
        reasonCode: "least_privilege_applied",
        afterSummary: {
          grants: grants.map((grant) => ({
            actorType: grant.actorType,
            roleCode: grant.roleCode,
          })),
        },
        maskedContext: {
          groups,
        },
      });
    }

    const identity = this.buildIdentity(
      requestedActorType,
      normalizedAssertionEmail,
      membership.membership,
      membership.roleBinding,
      requestId,
    );

    return {
      identity,
      principal: syncResult.principal,
      membership: membership.membership,
      roleBinding: membership.roleBinding,
      driftDetected: syncResult.driftDetected,
      authenticatedUserEmail: normalizedAssertionEmail,
    };
  }

  private resolveRealmForActorType(
    actorType: ControlPlaneActorType,
  ): WorkforceRealm {
    return actorType === "platform_admin" ? "platform" : "ops";
  }

  private verifyAssertion(
    headers: AuthBootstrapHeaders,
  ): WorkforceAssertionPayload {
    const token = this.readHeader(headers, IAP_ASSERTION_HEADER);
    if (!token) {
      throw this.buildDeniedError("iap_assertion_missing");
    }

    try {
      return jwt.verify(token, this.getAssertionVerifyKey(), {
        algorithms: this.getAssertionAlgorithms(),
        audience: this.getAssertionAudience(),
        issuer: this.getAssertionIssuer(),
      }) as WorkforceAssertionPayload;
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }
      throw this.buildDeniedError(
        error instanceof Error && /audience/i.test(error.message)
          ? "wrong_workforce_audience"
          : "iap_assertion_invalid",
      );
    }
  }

  private buildIdentity(
    actorType: ControlPlaneActorType,
    email: string | null,
    membership: CanonicalIdentityMembershipRecord,
    roleBinding: CanonicalIdentityRoleBindingRecord,
    requestId?: string | null,
  ): BootstrapRequestIdentity {
    return {
      authMode: "jwt_bearer",
      actorType,
      actorId: this.resolveActorId(actorType, email, roleBinding.roleCode),
      realm: actorType === "platform_admin" ? "platform" : "ops",
      tenantId: membership.tenantId,
      partnerId: membership.partnerId,
      partnerProgramId: null,
      partnerEntrySlug: null,
      roleFamilies: [...AUTH_ROLE_FAMILY_FROM_ACTOR_TYPE[actorType]],
      roles: [roleBinding.roleCode],
      scopes: this.resolveScopes(actorType, roleBinding.roleCode),
      requestId: requestId ?? null,
    };
  }

  private findActiveMembershipForGrant(
    memberships: CanonicalMembershipSnapshot[],
    grant: WorkforceGrant,
  ) {
    return memberships.find(
      (candidate) =>
        candidate.membership.realm === grant.realm &&
        candidate.membership.status === "active" &&
        candidate.roleBinding.membershipId === candidate.membership.membershipId &&
        candidate.roleBinding.roleCode === grant.roleCode &&
        candidate.roleBinding.validTo === null,
    );
  }

  private resolveScopes(
    actorType: ControlPlaneActorType,
    roleCode: string,
  ): string[] {
    if (actorType === "platform_admin") {
      const roleScopes = getPlatformAdminRoleScopes(roleCode);
      if (roleScopes) {
        return [...roleScopes];
      }
      throw this.buildDeniedError("unsupported_workforce_role_binding");
    }

    if (actorType === "ops_user" && roleCode !== "ops_user") {
      throw this.buildDeniedError("unsupported_workforce_role_binding");
    }

    return [...AUTH_SCOPE_PRESETS[actorType]];
  }

  private resolveActorId(
    actorType: ControlPlaneActorType,
    email: string | null,
    roleCode: string,
  ) {
    const normalizedEmail = email ?? "";
    if (actorType === "platform_admin") {
      if (
        normalizedEmail === "admin@platform.drts" &&
        roleCode === "superadmin"
      ) {
        return "pa-admin-001";
      }
      if (
        normalizedEmail === "ops@platform.drts" &&
        roleCode === "operator"
      ) {
        return "pa-operator-001";
      }
      return `platform-admin-${this.toActorSlug(normalizedEmail || roleCode)}`;
    }

    return `ops-user-${this.toActorSlug(normalizedEmail || roleCode)}`;
  }

  private resolveDesiredGrants(groups: string[]): WorkforceGrant[] {
    const desiredByRealm = new Map<WorkforceRealm, WorkforceGrant>();
    for (const group of groups) {
      const grant = this.getGroupGrantCatalog()[group];
      if (!grant) {
        continue;
      }
      const existing = desiredByRealm.get(grant.realm);
      if (!existing) {
        desiredByRealm.set(grant.realm, grant);
        continue;
      }

      if (
        grant.realm === "platform" &&
        this.getPlatformRolePriority(grant.roleCode) <
          this.getPlatformRolePriority(existing.roleCode)
      ) {
        desiredByRealm.set(grant.realm, grant);
      }
    }

    return [...desiredByRealm.values()];
  }

  private getPlatformRolePriority(roleCode: string) {
    return PLATFORM_ROLE_PRIORITY[roleCode] ?? Number.MAX_SAFE_INTEGER;
  }

  private requireVerifiedSubject(
    assertion: WorkforceAssertionPayload,
    requestedActorType: ControlPlaneActorType,
    requestId?: string | null,
  ) {
    const subject = assertion.sub?.trim() ?? "";
    if (subject) {
      return subject;
    }

    this.recordSecurityEvent({
      actorId: null,
      actorType: "system",
      subjectId: null,
      realm: requestedActorType === "platform_admin" ? "platform" : "ops",
      tenantId: null,
      partnerId: null,
      eventType: "workforce_session_exchange.denied",
      outcome: "denied",
      severity: "medium",
      requestId: requestId ?? null,
      reasonCode: "workforce_subject_missing",
      maskedContext: null,
    });
    throw this.buildDeniedError("workforce_subject_missing");
  }

  private getGroupGrantCatalog(): Record<string, WorkforceGrant> {
    const raw = process.env.DRTS_WORKFORCE_GROUP_ROLE_BINDINGS?.trim();
    if (!raw) {
      return { ...DEFAULT_GROUP_GRANTS };
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, WorkforceGrant>;
      return Object.entries(parsed).reduce<Record<string, WorkforceGrant>>(
        (catalog, [group, grant]) => {
          if (
            grant &&
            (grant.actorType === "platform_admin" ||
              grant.actorType === "ops_user") &&
            (grant.realm === "platform" || grant.realm === "ops") &&
            this.isSupportedWorkforceRoleBinding(grant)
          ) {
            catalog[group] = {
              realm: grant.realm,
              actorType: grant.actorType,
              roleCode: grant.roleCode.trim(),
            };
          }
          return catalog;
        },
        {},
      );
    } catch {
      return { ...DEFAULT_GROUP_GRANTS };
    }
  }

  private isSupportedWorkforceRoleBinding(grant: WorkforceGrant) {
    const roleCode = grant.roleCode.trim();
    if (!roleCode) {
      return false;
    }

    if (grant.actorType === "platform_admin") {
      return grant.realm === "platform" && getPlatformAdminRoleScopes(roleCode) !== null;
    }

    return grant.realm === "ops" && roleCode === "ops_user";
  }

  private resolvePrincipalStatus(
    assertion: WorkforceAssertionPayload,
  ): CanonicalAccountStatus {
    if (assertion.active === false) {
      return "suspended";
    }

    return "active";
  }

  private extractGroups(assertion: WorkforceAssertionPayload) {
    const rawGroups = assertion.groups ?? assertion["google.groups"];
    if (!Array.isArray(rawGroups)) {
      return [];
    }

    return rawGroups
      .flatMap((value) => (typeof value === "string" ? [value.trim()] : []))
      .filter(Boolean);
  }

  private readRequestedActorType(
    headers: AuthBootstrapHeaders,
  ): ControlPlaneActorType {
    const value = this.readHeader(headers, CONTROL_PLANE_REQUESTED_ACTOR_TYPE_HEADER);
    if (value === "platform_admin" || value === "ops_user") {
      return value;
    }

    throw this.buildDeniedError("requested_actor_type_invalid");
  }

  private getAssertionVerifyKey() {
    const publicKey = process.env.DRTS_WORKFORCE_ASSERTION_PUBLIC_KEY?.trim();
    if (publicKey) {
      return publicKey;
    }

    const secret = process.env.DRTS_WORKFORCE_ASSERTION_SECRET?.trim();
    if (secret) {
      return secret;
    }

    throw this.buildDeniedError("iap_assertion_verifier_unconfigured");
  }

  private getAssertionAlgorithms(): jwt.Algorithm[] {
    const raw = process.env.DRTS_WORKFORCE_ASSERTION_ALGORITHMS?.trim();
    if (!raw) {
      return process.env.DRTS_WORKFORCE_ASSERTION_PUBLIC_KEY?.trim()
        ? ["RS256"]
        : ["HS256"];
    }

    return raw
      .split(/[;,]/)
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean) as jwt.Algorithm[];
  }

  private getAssertionIssuer() {
    return (
      process.env.DRTS_WORKFORCE_ASSERTION_ISSUER?.trim() ||
      DEFAULT_WORKFORCE_ASSERTION_ISSUER
    );
  }

  private getAssertionAudience() {
    return (
      process.env.DRTS_WORKFORCE_ASSERTION_AUDIENCE?.trim() ||
      process.env.DRTS_API_AUTH_AUDIENCE?.trim() ||
      "drts-control-plane"
    );
  }

  private readHeader(headers: AuthBootstrapHeaders, key: string) {
    const value = headers[key];
    if (Array.isArray(value)) {
      return value[0]?.trim() || null;
    }
    return typeof value === "string" ? value.trim() || null : null;
  }

  private normalizeEmail(value: string | null | undefined) {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    const match = normalized.match(
      /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})$/i,
    );
    return (match?.[1] ?? normalized).toLowerCase();
  }

  private toActorSlug(value: string) {
    return value.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "user";
  }

  private buildDeniedError(reasonCode: string) {
    return new ApiRequestError(
      403,
      "AUTH_SESSION_EXCHANGE_DENIED",
      "The authentication proof could not be matched to an active session exchange.",
      { reasonCode },
    );
  }

  private recordSecurityEvent(input: {
    actorId: string | null;
    actorType: BootstrapRequestIdentity["actorType"];
    subjectId: string | null;
    realm: BootstrapRequestIdentity["realm"];
    tenantId: string | null;
    partnerId: string | null;
    eventType: string;
    outcome: "success" | "denied";
    severity: "low" | "medium" | "high" | "critical";
    requestId: string | null;
    reasonCode: string;
    afterSummary?: Record<string, unknown> | null;
    maskedContext?: Record<string, unknown> | null;
  }) {
    this.securityEventsService?.recordEvent({
      actorId: input.actorId,
      actorType: input.actorType,
      subjectId: input.subjectId,
      realm: input.realm,
      tenantId: input.tenantId,
      partnerId: input.partnerId,
      eventType: input.eventType,
      eventFamily: "auth",
      outcome: input.outcome,
      severity: input.severity,
      targetType: "workforce_membership",
      targetId: input.subjectId,
      sessionId: null,
      tokenId: null,
      authMethods: ["workforce_iap_assertion"],
      sourceIp: null,
      userAgent: null,
      requestId: input.requestId ?? null,
      traceId: null,
      reasonCode: input.reasonCode,
      approvalId: null,
      beforeSummary: null,
      afterSummary: input.afterSummary ?? null,
      maskedContext: input.maskedContext ?? null,
    });
  }
}

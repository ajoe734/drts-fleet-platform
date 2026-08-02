import { createHash, randomUUID } from "node:crypto";

import type {
  CanonicalAuthSessionRecord,
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  PartnerChannelEntryRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";
import { Injectable, Optional } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import type {
  JwtIdentityPayload,
  JwtSessionClaimInput,
} from "../../common/auth/jwt-auth.service";
import { IdentityRepository } from "../identity/identity.repository";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";

type JwtSessionContext = {
  principal?: CanonicalIdentityPrincipalRecord;
  membership?: CanonicalIdentityMembershipRecord;
  tenantUser?: TenantUserRoleRecord;
  partnerEntry?: PartnerChannelEntryRecord;
  sid?: string;
  authTime?: number;
  amr?: string[];
  acr?: string;
  sessionSource?:
    | "trusted_iap_assertion"
    | "bootstrap_headers"
    | "tenant_bootstrap"
    | "partner_api_key"
    | "driver_device_binding"
    | "workload_identity";
};

function sha256(parts: Array<string | number | boolean | null | undefined>) {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(String(part ?? ""));
    hash.update("|");
  }
  return hash.digest("hex");
}

function normalizeRoles(roles: readonly string[]) {
  return [...roles].sort((left, right) => left.localeCompare(right));
}

@Injectable()
export class JwtSessionClaimsService {
  constructor(
    @Optional() private readonly tenantPartnerService?: TenantPartnerService,
    @Optional() private readonly identityRepository?: IdentityRepository,
  ) {}

  buildClaims(
    identity: JwtSessionClaimInput,
    context: JwtSessionContext = {},
  ): Pick<
    JwtIdentityPayload,
    "sid" | "jti" | "tokenVersion" | "auth_time" | "amr" | "acr" | "policyVersion" | "membershipId"
  > {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const amr = context.amr?.length
      ? [...context.amr]
      : this.resolveAmr(identity, context);
    const acr = context.acr?.trim() || this.resolveAcr(identity, context);

    return {
      sid: context.sid?.trim() || randomUUID(),
      jti: randomUUID(),
      tokenVersion: this.buildTokenVersion(identity, context),
      auth_time: context.authTime ?? nowSeconds,
      amr,
      acr,
      policyVersion: this.buildPolicyVersion(identity, context),
      membershipId: context.membership?.membershipId ?? null,
    };
  }

  async assertTokenActive(payload: JwtIdentityPayload): Promise<void> {
    if (payload.actorType === "driver_user") {
      return;
    }

    switch (payload.realm) {
      case "tenant":
        this.assertTenantTokenActive(payload);
        return;
      case "partner":
        this.assertPartnerTokenActive(payload);
        return;
      case "platform":
      case "ops":
        await this.assertControlPlaneTokenActive(payload);
        return;
      case "system":
        return;
      default:
        throw this.buildRevokedError(payload, "unsupported_realm");
    }
  }

  private assertTenantTokenActive(payload: JwtIdentityPayload) {
    if (!this.tenantPartnerService || !payload.tenantId || !payload.sub) {
      return;
    }

    const user = this.tenantPartnerService.findTenantUser(payload.tenantId, payload.sub);
    if (!user || user.status !== "active") {
      throw this.buildRevokedError(payload, "tenant_membership_inactive");
    }

    const currentVersion = this.buildTenantTokenVersion(user);
    if (currentVersion !== payload.tokenVersion) {
      throw this.buildRevokedError(payload, "tenant_membership_changed");
    }
  }

  private assertPartnerTokenActive(payload: JwtIdentityPayload) {
    if (!this.tenantPartnerService || !payload.partnerEntrySlug) {
      return;
    }

    let entry: PartnerChannelEntryRecord;
    try {
      entry = this.tenantPartnerService.getPartnerEntry(payload.partnerEntrySlug);
    } catch {
      throw this.buildRevokedError(payload, "partner_entry_inactive");
    }

    const currentVersion = this.buildPartnerTokenVersion(entry, payload.sub);
    if (currentVersion !== payload.tokenVersion) {
      throw this.buildRevokedError(payload, "partner_entry_changed");
    }
  }

  private async assertControlPlaneTokenActive(payload: JwtIdentityPayload) {
    if (!this.identityRepository || !payload.sub || !payload.membershipId) {
      throw this.buildRevokedError(payload, "control_plane_session_unbound");
    }

    const session = await this.identityRepository.findAuthSessionByTokenId(
      payload.jti,
    );
    if (!session) {
      throw this.buildRevokedError(payload, "session_not_found");
    }
    if (
      session.status !== "active" ||
      session.sessionId !== payload.sid ||
      session.principalId !== payload.sub ||
      session.membershipId !== payload.membershipId ||
      session.realm !== payload.realm ||
      session.tokenVersion !== payload.tokenVersion
    ) {
      throw this.buildRevokedError(payload, "session_revoked");
    }

    const memberships = await this.identityRepository.findMembershipsByPrincipalId(
      payload.sub,
    );
    const membership = memberships.find(
      (candidate) =>
        candidate.membershipId === payload.membershipId &&
        candidate.realm === payload.realm,
    );
    if (!membership || membership.status !== "active") {
      throw this.buildRevokedError(payload, "membership_inactive");
    }

    const principal = await this.identityRepository.findPrincipalById(payload.sub);
    if (principal && principal.status !== "active") {
      throw this.buildRevokedError(payload, "principal_inactive");
    }

    const bindings = await this.identityRepository.findRoleBindingsByMembershipId(
      membership.membershipId,
    );
    const now = new Date().toISOString();
    const activeRoles = normalizeRoles(
      bindings
        .filter(
          (binding) =>
            (!binding.validFrom || binding.validFrom <= now) &&
            (!binding.validTo || binding.validTo > now),
        )
        .map((binding) => binding.roleCode),
    );
    const currentVersion = this.buildControlPlaneTokenVersion(
      principal,
      membership,
      activeRoles,
    );
    if (currentVersion !== payload.tokenVersion) {
      throw this.buildRevokedError(payload, "membership_changed");
    }
  }

  async registerAuthSession(
    identity: JwtSessionClaimInput,
    sessionClaims: Pick<
      JwtIdentityPayload,
      | "sid"
      | "jti"
      | "tokenVersion"
      | "auth_time"
      | "amr"
      | "acr"
      | "policyVersion"
      | "membershipId"
    >,
    context: JwtSessionContext = {},
  ): Promise<CanonicalAuthSessionRecord | null> {
    if (!this.identityRepository) {
      return null;
    }

    const now = new Date().toISOString();
    const record: CanonicalAuthSessionRecord = {
      sessionId: sessionClaims.sid,
      tokenId: sessionClaims.jti,
      principalId: identity.actorId ?? null,
      membershipId: sessionClaims.membershipId ?? context.membership?.membershipId ?? null,
      realm: identity.realm,
      actorType: identity.actorType,
      tokenVersion: sessionClaims.tokenVersion,
      policyVersion: sessionClaims.policyVersion,
      authTime: sessionClaims.auth_time,
      authMethods: [...sessionClaims.amr],
      assuranceLevel: sessionClaims.acr,
      status: "active",
      issuedAt: now,
      expiresAt: null,
      revokedAt: null,
      revokedReason: null,
      createdAt: now,
      updatedAt: now,
    };
    return this.identityRepository.upsertAuthSession(record);
  }

  private buildTokenVersion(
    identity: JwtSessionClaimInput,
    context: JwtSessionContext,
  ) {
    switch (identity.realm) {
      case "tenant":
        return this.buildTenantTokenVersion(context.tenantUser);
      case "partner":
        return this.buildPartnerTokenVersion(context.partnerEntry, identity.actorId);
      case "platform":
      case "ops":
        return this.buildControlPlaneTokenVersion(
          context.principal,
          context.membership,
          identity.roles,
        );
      case "driver":
        return sha256([
          context.sid,
          identity.actorId,
          identity.driverBindingId,
          identity.driverDeviceId,
        ]);
      case "system":
      default:
        return sha256([
          identity.realm,
          identity.actorType,
          identity.actorId,
          ...normalizeRoles(identity.roles),
          ...identity.scopes,
        ]);
    }
  }

  private buildPolicyVersion(
    identity: JwtSessionClaimInput,
    context: JwtSessionContext,
  ) {
    switch (identity.realm) {
      case "tenant":
        return `tenant-role:${context.tenantUser?.roleCode ?? identity.roles[0] ?? "unknown"}`;
      case "partner":
        return `partner-entry:${context.partnerEntry?.entrySlug ?? identity.partnerEntrySlug ?? "unknown"}`;
      case "platform":
      case "ops":
        return `${identity.realm}:${normalizeRoles(identity.roles).join("+") || "none"}`;
      case "driver":
        return "driver-device-session:v1";
      case "system":
      default:
        return `${identity.realm}:session:v1`;
    }
  }

  private resolveAmr(
    identity: JwtSessionClaimInput,
    context: JwtSessionContext,
  ) {
    switch (identity.realm) {
      case "tenant":
        return ["tenant_bootstrap"];
      case "partner":
        return ["partner_api_key"];
      case "platform":
      case "ops":
        if (context.sessionSource === "trusted_iap_assertion") {
          return ["iap_assertion"];
        }
        if (context.sessionSource === "bootstrap_headers") {
          return ["bootstrap_headers"];
        }
        return ["control_plane_exchange"];
      case "driver":
        return ["driver_device_binding"];
      case "system":
      default:
        return ["workload_identity"];
    }
  }

  private resolveAcr(
    identity: JwtSessionClaimInput,
    context: JwtSessionContext,
  ) {
    switch (identity.realm) {
      case "platform":
      case "ops":
        if (context.sessionSource === "trusted_iap_assertion") {
          return "aal0";
        }
        return "aal0";
      case "tenant":
      case "driver":
        return "aal1";
      case "partner":
      case "system":
      default:
        return "aal0";
    }
  }

  private buildTenantTokenVersion(user?: TenantUserRoleRecord) {
    if (!user) {
      return sha256(["tenant", "missing"]);
    }
    return sha256([
      user.tenantId,
      user.userId,
      user.roleCode,
      user.status,
      user.updatedAt,
    ]);
  }

  private buildPartnerTokenVersion(
    entry: PartnerChannelEntryRecord | undefined,
    actorId: string | null,
  ) {
    if (!entry) {
      return sha256(["partner", "missing", actorId]);
    }
    return sha256([
      entry.entrySlug,
      entry.status,
      entry.activeFlag,
      entry.updatedAt,
      actorId,
    ]);
  }

  private buildControlPlaneTokenVersion(
    principal: CanonicalIdentityPrincipalRecord | undefined,
    membership: CanonicalIdentityMembershipRecord | undefined,
    roles: readonly string[],
  ) {
    return sha256([
      principal?.principalId,
      principal?.status,
      principal?.updatedAt,
      membership?.membershipId,
      membership?.realm,
      membership?.status,
      membership?.updatedAt,
      ...normalizeRoles(roles),
    ]);
  }

  private buildRevokedError(payload: JwtIdentityPayload, reasonCode: string) {
    return new ApiRequestError(
      401,
      "JWT_SESSION_INVALIDATED",
      "Bearer token session is stale, revoked, or no longer authorized.",
      {
        actorId: payload.sub,
        realm: payload.realm,
        sid: payload.sid,
        reasonCode,
      },
    );
  }
}

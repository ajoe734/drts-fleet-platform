import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
  PartnerChannelEntryRecord,
} from "@drts/contracts";

import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { PasswordHashingService } from "../../apps/api/src/common/auth/password-hashing.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { OidcPkceService } from "../../apps/api/src/modules/auth/oidc-pkce.service";
import { PartnerUserIdentityLinkRepository } from "../../apps/api/src/modules/tenant-partner/partner-user-identity-link.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";

/**
 * FLEET-ONB-007 SA/SD §9 row "已停用（disabled）的 membership 嘗試登入（Google
 * 或密碼），兩條路徑共用同一個 account_status/membership.status 檢查":
 * neither an ordinary (post-acceptance) Google login through
 * `exchangePartnerCallbackSession` nor a password login through
 * `AuthController.passwordLogin` must grant access once the Fleet staff
 * membership's `status` is `"disabled"` -- even though the principal, the
 * (entrySlug, sub) identity link (Google branch) and the password
 * credential (password branch) all remain otherwise valid.
 *
 * Uses the offline in-memory fallback store (`new IdentityRepository()`
 * with no DatabaseService), the same convention
 * tests/unit/identity-fleet-staff-sourceref.test.ts's
 * "exchangePartnerCallbackSession recognizes records built with the new
 * sourceRef/scopeRef helpers" describe block and
 * apps/api/tests/unit/password-login.test.ts's fleet-staff fixtures already
 * establish.
 */
const PRIOR_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...PRIOR_ENV };
  vi.stubEnv("APP_ENV", "local");
  vi.stubEnv("AUTH_MODE", "local");
  vi.stubEnv("OIDC_MOCK_MODE", "true");
  vi.stubEnv("JWT_SECRET", "test_jwt_secret_key_32_characters_long_min!");
  vi.stubEnv(
    "PASSWORD_PEPPER_SECRETS_JSON",
    JSON.stringify({ v1: "fleet-disabled-membership-test-pepper-32chars!" }),
  );
  vi.stubEnv("PASSWORD_PEPPER_CURRENT_VERSION", "v1");
});

const CORRECT_PASSWORD = "correct horse battery staple";

describe("FLEET-ONB-007 SA/SD §9: a disabled Fleet staff membership blocks the Google login branch", () => {
  // Matches tests/unit/fleet-partner-human-role-authority-20261026.test.ts's
  // "fleet-demo-001" entry (tenant-partner.service.ts), already seeded as an
  // active fleet_partner entry; no fixture mutation needed.
  const ENTRY = "fleet-demo-001";
  const OIDC_CODE = "partner_fleet_disabled_membership_subject";
  const OIDC_SUB = `sub_oidc_${createHash("sha256").update(OIDC_CODE).digest("hex").slice(0, 12)}`;
  const PRINCIPAL_ID = "principal_fleet_disabled_membership_fixture_001";

  async function setup(membershipStatus: "active" | "disabled") {
    const repository = new IdentityRepository();
    const link = new PartnerUserIdentityLinkRepository();
    const tenant = new TenantPartnerService(new AuditNotificationService());
    const jwt = new JwtAuthService(repository, tenant, undefined, undefined, link);
    const oidc = new OidcPkceService(jwt, tenant, undefined, link, undefined, repository);
    // A fixed timestamp strictly in the past (matching the convention in
    // apps/api/tests/unit/identity-fleet-staff-sourceref.test.ts), not
    // "today" at authoring time: exchangePartnerCallbackSession's active-role
    // window check compares binding.validFrom against the real wall-clock
    // Date.now() at test-run time, so a same-day "now" can land in the
    // future relative to an earlier CI run and spuriously exclude the role
    // binding from activeRoles.
    const now = "2026-11-14T10:00:00.000Z";

    await link.createForInvitedPrincipal(ENTRY, OIDC_SUB, PRINCIPAL_ID, now);
    await repository.ensurePrincipalRecord({
      principalId: PRINCIPAL_ID,
      sourceRef: `jwt_principal:partner:${PRINCIPAL_ID}`,
      issuer: "google",
      subject: `google-sub-${PRINCIPAL_ID}`,
      principalType: "human",
      email: "disabled-fleet-staff@example.com",
      emailVerified: true,
      displayName: "Disabled Fleet Staff Fixture",
      status: "active",
      createdAt: now,
      updatedAt: now,
    } as CanonicalIdentityPrincipalRecord);
    const membership = await repository.ensureMembershipRecord({
      membershipId: "fleet-disabled-membership-test-membership",
      sourceRef: `fleet_member:${ENTRY}:${PRINCIPAL_ID}`,
      principalId: PRINCIPAL_ID,
      realm: "partner",
      scopeRef: `fleet:${ENTRY}`,
      tenantId: null,
      partnerId: "fleet-demo-001",
      status: membershipStatus,
      invitedByPrincipalId: "manager",
      invitationId: null,
      createdAt: now,
      updatedAt: now,
    });
    await repository.ensureRoleBindingRecord({
      roleBindingId: "fleet-disabled-membership-test-binding",
      sourceRef: `fleet_role:${ENTRY}:${PRINCIPAL_ID}`,
      membershipId: membership.membershipId,
      roleCode: "fleet_partner_ops",
      grantedByPrincipalId: "manager",
      approvalId: null,
      validFrom: now,
      validTo: null,
      createdAt: now,
      updatedAt: now,
    });

    async function login() {
      const state = oidc.generateLoginParameters("partner", { partnerId: ENTRY });
      return oidc.exchangePartnerCallbackSession(
        {
          provider: "oidc",
          code: OIDC_CODE,
          state: state.state,
          partnerId: ENTRY,
          callbackUrl: "http://localhost:3000/api/auth/callback",
        },
        { stateToken: state.stateToken },
      );
    }

    return { membership, login };
  }

  it("grants the managed Fleet role while the membership is active (control case)", async () => {
    const { login } = await setup("active");
    const granted = await login();
    expect(granted.identity.membershipId).toBeTruthy();
  });

  it("grants no managed Fleet role once the membership is disabled, even though the identity link, principal and role binding are all otherwise valid", async () => {
    const { login } = await setup("disabled");
    const denied = await login();
    // Matches the "unassigned"/no-managed-role assertion convention in
    // tests/unit/fleet-partner-human-role-authority-20261026.test.ts and
    // apps/api/tests/unit/identity-fleet-staff-sourceref.test.ts:
    // exchangePartnerCallbackSession always falls back to the legacy,
    // non-Fleet "partner_admin" label with only partner:read/partner:write
    // scopes when there is no managed role -- it never returns an empty
    // roles array. The real security gate a disabled membership trips is
    // the absence of principalId/membershipId and of the Fleet-specific
    // role/scopes, not an empty roles array.
    expect(denied.identity.membershipId).toBeUndefined();
    expect(denied.identity.roles).not.toContain("fleet_partner_ops");
    expect(denied.identity.scopes).not.toContain("fleet:read");
  });
});

describe("FLEET-ONB-007 SA/SD §9: a disabled Fleet staff membership blocks the password login branch", () => {
  function createControllerFixture() {
    const identityRepository = new IdentityRepository();
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const jwtAuthService = new JwtAuthService(
      identityRepository,
      tenantPartnerService,
    );
    const controller = new AuthController(
      jwtAuthService,
      tenantPartnerService,
      {} as never,
      // SecurityEventsService is @Optional(); recordPasswordLoginEvent calls
      // it through `?.`, so leaving it unset is safe and keeps this fixture
      // self-contained.
      undefined,
      undefined,
      undefined,
      identityRepository,
    );
    return { identityRepository, tenantPartnerService, controller };
  }

  /** Registers a minimal, active `fleet_partner` entry directly in
   * `TenantPartnerService`'s in-memory seed list, mirroring
   * apps/api/tests/unit/password-login.test.ts's `registerFleetPartnerEntry`
   * (duplicated here rather than imported, since it is a local, unexported
   * helper in that file). */
  function registerFleetPartnerEntry(
    tenant: TenantPartnerService,
    options: { entrySlug: string; fleetPartnerId: string },
  ) {
    const now = new Date().toISOString();
    const entry: PartnerChannelEntryRecord = {
      partnerId: options.fleetPartnerId,
      partnerCode: "fleet_onb_007_disabled_fixture",
      partnerType: "fleet_partner",
      programId: "program-fleet-onb-007-disabled-fixture",
      programCode: null,
      tenantId: "tenant-fleet-onb-007-disabled-fixture",
      bankCode: null,
      entrySlug: options.entrySlug,
      displayName: "Fleet Partner Disabled-Membership Fixture",
      businessDispatchSubtype: "enterprise_dispatch",
      authMode: "partner_api_key",
      eligibilityMode: "none",
      entryHost: null,
      entryPath: `/partner/${options.entrySlug}`,
      themeAccent: null,
      brandingMetadata: null,
      eligibilityContract: null,
      status: "active",
      activeFlag: true,
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
      createdAt: now,
      updatedAt: now,
      auditMetadata: {
        source: "seed_bootstrap",
        requestId: null,
        createdBy: "system:seed",
        updatedBy: "system:seed",
      },
    };
    (
      tenant as unknown as { partnerEntries: PartnerChannelEntryRecord[] }
    ).partnerEntries.push(entry);
  }

  async function createFleetPartnerPasswordUser(
    fixture: ReturnType<typeof createControllerFixture>,
    options: { entrySlug: string; fleetPartnerId: string; email: string },
  ) {
    const now = new Date().toISOString();
    const principalId = `principal_fleet_disabled_pwd_${randomUUID().replace(/-/g, "")}`;
    const repo = fixture.identityRepository as unknown as {
      upsertFallbackPrincipal: (
        record: CanonicalIdentityPrincipalRecord,
      ) => CanonicalIdentityPrincipalRecord;
      fallbackMemberships: Map<string, CanonicalIdentityMembershipRecord>;
      fallbackRoleBindings: Map<string, CanonicalIdentityRoleBindingRecord>;
    };

    repo.upsertFallbackPrincipal({
      principalId,
      sourceRef: `jwt_principal:partner:${principalId}`,
      issuer: "fleet_staff_fixture",
      subject: principalId,
      principalType: "human",
      email: options.email,
      emailVerified: true,
      displayName: "Fleet Staff Disabled-Membership Fixture",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const membershipId = `membership_fleet_disabled_pwd_${randomUUID().replace(/-/g, "")}`;
    repo.fallbackMemberships.set(membershipId, {
      membershipId,
      sourceRef: `fleet_member:${options.entrySlug}:${principalId}`,
      principalId,
      realm: "partner",
      scopeRef: `fleet:${options.entrySlug}`,
      tenantId: null,
      partnerId: options.fleetPartnerId,
      status: "disabled",
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: now,
      updatedAt: now,
    });

    const roleBindingId = `role_binding_fleet_disabled_pwd_${randomUUID().replace(/-/g, "")}`;
    repo.fallbackRoleBindings.set(roleBindingId, {
      roleBindingId,
      sourceRef: `fleet_role:${options.entrySlug}:${principalId}`,
      membershipId,
      roleCode: "fleet_partner_admin",
      grantedByPrincipalId: null,
      approvalId: null,
      validFrom: now,
      validTo: null,
      createdAt: now,
      updatedAt: now,
    });

    const hashed = await new PasswordHashingService().hash(CORRECT_PASSWORD);
    await fixture.identityRepository.setPasswordCredentialForPrincipal(
      principalId,
      {
        passwordHash: hashed.hash,
        passwordAlgo: hashed.algo,
        pepperVersion: hashed.pepperVersion,
      },
    );

    return { principalId };
  }

  it("denies a password login for a disabled Fleet staff membership the same uniform way as an unknown account", async () => {
    const fixture = createControllerFixture();
    const entrySlug = "fleet-pwd-login-disabled-membership";
    const fleetPartnerId = "fleet-partner-pwd-login-disabled-membership";
    registerFleetPartnerEntry(fixture.tenantPartnerService, {
      entrySlug,
      fleetPartnerId,
    });
    await createFleetPartnerPasswordUser(fixture, {
      entrySlug,
      fleetPartnerId,
      email: "disabled-fleet-staff-pwd@example.com",
    });

    await expect(
      fixture.controller.passwordLogin("partner", {
        email: "disabled-fleet-staff-pwd@example.com",
        password: CORRECT_PASSWORD,
        partnerId: entrySlug,
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });
});

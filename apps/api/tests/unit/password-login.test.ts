import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import { PasswordHashingService } from "../../src/common/auth/password-hashing.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import type {
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
  PartnerChannelEntryRecord,
} from "@drts/contracts";
import { AgencyDirectoryRepository } from "../../src/modules/agency-access/agency-directory.repository";
import { AuthController } from "../../src/modules/auth/auth.controller";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";
import { SecurityEventsService } from "../../src/modules/security-events/security-events.service";
import {
  TenantInvitationDeliveryService,
  type TenantInvitationDeliveryRequest,
} from "../../src/modules/tenant-partner/tenant-invitation-delivery.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

// PWD-LOGIN-005 (SA/SD §4,
// docs/02-architecture/portal-password-login-20261113/01_system_sa_sd.md):
// POST /api/auth/:realm/password-login must answer "account not found",
// "wrong password", "not-yet-invited" and "disabled" with a byte-identical
// response, enforce progressive account lockout, and never write the
// submitted plaintext into a security event.
const PRIOR_ENV = { ...process.env };

beforeAll(() => {
  process.env.APP_ENV = "local";
  process.env.AUTH_MODE = "local";
  process.env.JWT_SECRET = "test_jwt_secret_key_32_characters_long_min!";
  process.env.PASSWORD_PEPPER_SECRETS_JSON = JSON.stringify({
    v1: "password-login-test-pepper-value-32chars!",
  });
  process.env.PASSWORD_PEPPER_CURRENT_VERSION = "v1";
});

afterAll(() => {
  process.env = { ...PRIOR_ENV };
});

afterEach(() => {
  vi.restoreAllMocks();
});

const CORRECT_PASSWORD = "correct horse battery staple";
const WRONG_PASSWORD = "an entirely different password";

class CapturingInvitationDelivery extends TenantInvitationDeliveryService {
  readonly tokens = new Map<string, string>();

  override async send(request: TenantInvitationDeliveryRequest) {
    this.tokens.set(request.invitationId, request.rawToken);
    return super.send(request);
  }
}

function createFixture() {
  const identityRepository = new IdentityRepository();
  const agencyDirectoryRepository = new AgencyDirectoryRepository();
  const securityEventsService = new SecurityEventsService();
  const delivery = new CapturingInvitationDelivery();
  const tenantPartnerService = new TenantPartnerService(
    new AuditNotificationService(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    identityRepository,
    identityRepository,
    delivery,
  );
  const jwtAuthService = new JwtAuthService(
    identityRepository,
    tenantPartnerService,
    undefined,
    agencyDirectoryRepository,
  );
  const controller = new AuthController(
    jwtAuthService,
    tenantPartnerService,
    {} as never,
    securityEventsService,
    undefined,
    undefined,
    identityRepository,
    undefined,
    undefined,
    undefined,
    undefined,
    agencyDirectoryRepository,
  );
  return {
    identityRepository,
    agencyDirectoryRepository,
    securityEventsService,
    tenantPartnerService,
    delivery,
    controller,
  };
}

async function createActiveTenantPasswordUser(
  fixture: ReturnType<typeof createFixture>,
  options: {
    tenantId: string;
    email: string;
    roleCode?: string;
    password?: string;
  },
) {
  await fixture.tenantPartnerService.createTenantUser(options.tenantId, {
    email: options.email,
    displayName: "Password Login Fixture",
    roleCode: options.roleCode ?? "tenant_viewer",
  });
  const invitation = fixture.identityRepository
    .listInvitations()
    .find(
      (candidate) => candidate.email.toLowerCase() === options.email.toLowerCase(),
    )!;
  const rawToken = fixture.delivery.tokens.get(invitation.invitationId)!;
  await fixture.tenantPartnerService.acceptTenantInvitationWithPassword({
    invitationToken: rawToken,
    password: options.password ?? CORRECT_PASSWORD,
  });
  const principal = fixture.identityRepository
    .listPrincipals()
    .find(
      (candidate) => candidate.email?.toLowerCase() === options.email.toLowerCase(),
    )!;
  return { principal };
}

/** No admin "suspend a user" endpoint is wired yet (future, un-scoped
 * identity-admin work); this reaches into the same fallback-mode store the
 * repository's own accept-invitation methods already write to, purely to
 * put a fixture account into the `suspended` state this test needs. */
function forceSuspendPrincipal(
  identityRepository: IdentityRepository,
  principalId: string,
) {
  const principal = identityRepository
    .listPrincipals()
    .find((candidate) => candidate.principalId === principalId)!;
  (
    identityRepository as unknown as {
      upsertFallbackPrincipal: (
        record: CanonicalIdentityPrincipalRecord,
      ) => void;
    }
  ).upsertFallbackPrincipal({
    ...principal,
    status: "suspended",
    updatedAt: new Date().toISOString(),
  });
}

/** FLEET-ONB-002/003/004 (the invitation-issue/accept flow that will write
 * these rows in production) haven't shipped yet, so this builds the exact
 * fleet-staff shape PWD-LOGIN-005's partner password-login path reads
 * directly: a principal/membership/role-binding trio following the
 * `jwt_principal:partner:<id>` / `fleet_member:<entrySlug>:<id>` /
 * `fleet_role:<entrySlug>:<id>` sourceRef conventions `manageFleetHumanRole`
 * and `exchangePartnerCallbackSession` already use (Fleet269 §2, §3). */
async function createActiveFleetPartnerPasswordUser(
  fixture: ReturnType<typeof createFixture>,
  options: {
    entrySlug: string;
    fleetPartnerId: string;
    email: string;
    roleCode?: string;
    password?: string;
  },
) {
  const now = new Date().toISOString();
  const principalId = `principal_fleet_${randomUUID().replace(/-/g, "")}`;
  const repo = fixture.identityRepository as unknown as {
    upsertFallbackPrincipal: (
      record: CanonicalIdentityPrincipalRecord,
    ) => CanonicalIdentityPrincipalRecord;
    fallbackMemberships: Map<string, CanonicalIdentityMembershipRecord>;
    fallbackRoleBindings: Map<string, CanonicalIdentityRoleBindingRecord>;
  };

  const principal = repo.upsertFallbackPrincipal({
    principalId,
    sourceRef: `jwt_principal:partner:${principalId}`,
    issuer: "fleet_staff_fixture",
    subject: principalId,
    principalType: "human",
    email: options.email,
    emailVerified: true,
    displayName: "Fleet Staff Fixture",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  const membershipId = `membership_fleet_${randomUUID().replace(/-/g, "")}`;
  repo.fallbackMemberships.set(membershipId, {
    membershipId,
    sourceRef: `fleet_member:${options.entrySlug}:${principalId}`,
    principalId,
    realm: "partner",
    scopeRef: `fleet:${options.entrySlug}`,
    tenantId: null,
    partnerId: options.fleetPartnerId,
    status: "active",
    invitedByPrincipalId: null,
    invitationId: null,
    createdAt: now,
    updatedAt: now,
  });

  const roleBindingId = `role_binding_fleet_${randomUUID().replace(/-/g, "")}`;
  repo.fallbackRoleBindings.set(roleBindingId, {
    roleBindingId,
    sourceRef: `fleet_role:${options.entrySlug}:${principalId}`,
    membershipId,
    roleCode: options.roleCode ?? "fleet_partner_admin",
    grantedByPrincipalId: null,
    approvalId: null,
    validFrom: now,
    validTo: null,
    createdAt: now,
    updatedAt: now,
  });

  const hashed = await new PasswordHashingService().hash(
    options.password ?? CORRECT_PASSWORD,
  );
  await fixture.identityRepository.setPasswordCredentialForPrincipal(
    principalId,
    {
      passwordHash: hashed.hash,
      passwordAlgo: hashed.algo,
      pepperVersion: hashed.pepperVersion,
    },
  );

  return { principal };
}

/** Registers a minimal, active `fleet_partner` entry directly in
 * `TenantPartnerService`'s in-memory seed list (no platform-admin endpoint
 * exists to create one in a unit test), so `issuePartnerPasswordSession` can
 * resolve the entry its membership's `scopeRef` points at. */
function registerFleetPartnerEntry(
  fixture: ReturnType<typeof createFixture>,
  options: { entrySlug: string; fleetPartnerId: string },
) {
  const now = new Date().toISOString();
  const entry: PartnerChannelEntryRecord = {
    partnerId: options.fleetPartnerId,
    partnerCode: "pwd_login_fleet_fixture",
    partnerType: "fleet_partner",
    programId: "program-pwd-login-fleet-fixture",
    programCode: null,
    tenantId: "tenant-pwd-login-fleet-fixture",
    bankCode: null,
    entrySlug: options.entrySlug,
    displayName: "Fleet Partner Fixture",
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
    fixture.tenantPartnerService as unknown as {
      partnerEntries: PartnerChannelEntryRecord[];
    }
  ).partnerEntries.push(entry);
}

async function expectUniformDenial(
  promise: Promise<unknown>,
): Promise<string> {
  await expect(promise).rejects.toBeInstanceOf(ApiRequestError);
  try {
    await promise;
    throw new Error("expected the password login attempt to be denied");
  } catch (error) {
    const apiError = error as ApiRequestError;
    expect(apiError.getStatus()).toBe(401);
    const body = apiError.getResponse() as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("AUTHENTICATION_FAILED");
    return body.error.message;
  }
}

describe("POST /api/auth/:realm/password-login", () => {
  it("accepts a partner realm request and denies it the same uniform way as any other unknown account (Fleet269 §3: partner realm is supported, not routed through AUTH_REALM_INVALID)", async () => {
    const { controller } = createFixture();
    await expect(
      controller.passwordLogin("partner", {
        email: "someone@example.com",
        password: CORRECT_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("rejects a realm outside tenant/agency/partner before touching any account", async () => {
    const { controller } = createFixture();
    await expect(
      controller.passwordLogin("platform", {
        email: "someone@example.com",
        password: CORRECT_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "AUTH_REALM_INVALID" });
  });

  it("requires both email and password", async () => {
    const { controller } = createFixture();
    await expect(
      controller.passwordLogin("tenant", { password: CORRECT_PASSWORD }),
    ).rejects.toMatchObject({ code: "FIELD_REQUIRED" });
    await expect(
      controller.passwordLogin("tenant", { email: "someone@example.com" }),
    ).rejects.toMatchObject({ code: "FIELD_REQUIRED" });
  });

  it("answers account-not-found, wrong-password, not-yet-invited and disabled identically", async () => {
    const fixture = createFixture();
    const tenantId = "tenant-pwd-login-uniform";

    const unknownMessage = await expectUniformDenial(
      fixture.controller.passwordLogin("tenant", {
        email: "nobody@example.com",
        password: CORRECT_PASSWORD,
        tenantId,
      }),
    );

    // Invited but never accepted ("未受邀").
    await fixture.tenantPartnerService.createTenantUser(tenantId, {
      email: "pending@example.com",
      displayName: "Pending User",
      roleCode: "tenant_viewer",
    });
    const notYetInvitedMessage = await expectUniformDenial(
      fixture.controller.passwordLogin("tenant", {
        email: "pending@example.com",
        password: CORRECT_PASSWORD,
        tenantId,
      }),
    );
    expect(notYetInvitedMessage).toBe(unknownMessage);

    // Active account, wrong password.
    const { principal } = await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "active@example.com",
    });
    const wrongPasswordMessage = await expectUniformDenial(
      fixture.controller.passwordLogin("tenant", {
        email: "active@example.com",
        password: WRONG_PASSWORD,
        tenantId,
      }),
    );
    expect(wrongPasswordMessage).toBe(unknownMessage);

    // Disabled account, correct password.
    forceSuspendPrincipal(fixture.identityRepository, principal.principalId);
    const disabledMessage = await expectUniformDenial(
      fixture.controller.passwordLogin("tenant", {
        email: "active@example.com",
        password: CORRECT_PASSWORD,
        tenantId,
      }),
    );
    expect(disabledMessage).toBe(unknownMessage);
  });

  it("issues a session on a correct, active password login and resets the failed-attempt count", async () => {
    const fixture = createFixture();
    const tenantId = "tenant-pwd-login-success";
    const { principal } = await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "success@example.com",
    });

    // One prior failure, so recordSuccess's reset is actually exercised.
    await expectUniformDenial(
      fixture.controller.passwordLogin("tenant", {
        email: "success@example.com",
        password: WRONG_PASSWORD,
        tenantId,
      }),
    );

    const envelope = (await fixture.controller.passwordLogin("tenant", {
      email: "success@example.com",
      password: CORRECT_PASSWORD,
      tenantId,
    })) as {
      data: {
        accessToken: string;
        profile: { email: string; tenantId: string };
        identity: { realm: string; amr?: string[] };
      };
    };

    expect(envelope.data.accessToken).toBeTruthy();
    expect(envelope.data.profile.email).toBe("success@example.com");
    expect(envelope.data.profile.tenantId).toBe(tenantId);
    expect(envelope.data.identity.realm).toBe("tenant");
    expect(envelope.data.identity.amr).toEqual(["pwd"]);

    const credential =
      await fixture.identityRepository.findPasswordCredentialByPrincipalId(
        principal.principalId,
      );
    expect(credential?.failedAttempts).toBe(0);
  });

  it("locks the account after repeated failures and denies even the correct password while locked", async () => {
    const fixture = createFixture();
    const tenantId = "tenant-pwd-login-lockout";
    await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "lockout@example.com",
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expectUniformDenial(
        fixture.controller.passwordLogin("tenant", {
          email: "lockout@example.com",
          password: WRONG_PASSWORD,
          tenantId,
        }),
      );
    }

    // The 6th attempt uses the CORRECT password, but the account is locked.
    await expectUniformDenial(
      fixture.controller.passwordLogin("tenant", {
        email: "lockout@example.com",
        password: CORRECT_PASSWORD,
        tenantId,
      }),
    );
  });

  it("never writes the submitted plaintext password or email into a security event", async () => {
    const fixture = createFixture();
    const tenantId = "tenant-pwd-login-no-plaintext";
    await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "audited@example.com",
    });
    const recordEvent = vi.spyOn(fixture.securityEventsService, "recordEvent");

    await expectUniformDenial(
      fixture.controller.passwordLogin("tenant", {
        email: "audited@example.com",
        password: WRONG_PASSWORD,
        tenantId,
      }),
    );
    await fixture.controller.passwordLogin("tenant", {
      email: "audited@example.com",
      password: CORRECT_PASSWORD,
      tenantId,
    });

    expect(recordEvent).toHaveBeenCalled();
    const serialized = JSON.stringify(recordEvent.mock.calls);
    expect(serialized).not.toContain(WRONG_PASSWORD);
    expect(serialized).not.toContain(CORRECT_PASSWORD);
    expect(serialized).not.toContain("audited@example.com");
  });

  it("issues an agency password session for an active, password-capable agency user", async () => {
    const fixture = createFixture();
    const now = new Date().toISOString();
    await fixture.agencyDirectoryRepository.create({
      agencyId: "agency_pwd_login_test",
      agencyCode: "PWD-LOGIN-TEST",
      displayName: "Password Login Test Agency",
      status: "active",
      createdByPrincipalId: null,
      createdAt: now,
      updatedAt: now,
    });
    const rawToken = "agency-invite-raw-token-for-pwd-login-test";
    await fixture.identityRepository.issueAgencyInvitation({
      agencyId: "agency_pwd_login_test",
      email: "agency-user@example.com",
      roleCode: "agency_viewer",
      accessValidTo: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      tokenHash: createHash("sha256").update(rawToken).digest("hex"),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      issuerPrincipalId: null,
    });
    const accepted =
      await fixture.tenantPartnerService.acceptAgencyInvitationWithPassword({
        invitationToken: rawToken,
        password: CORRECT_PASSWORD,
      });
    expect(accepted.accepted).toBe(true);

    const envelope = (await fixture.controller.passwordLogin("agency", {
      email: "agency-user@example.com",
      password: CORRECT_PASSWORD,
    })) as {
      data: {
        accessToken: string;
        agency: { agencyId: string };
        identity: { realm: string };
      };
    };

    expect(envelope.data.accessToken).toBeTruthy();
    expect(envelope.data.agency.agencyId).toBe("agency_pwd_login_test");
    expect(envelope.data.identity.realm).toBe("agency");
  });

  it("answers an unknown agency account the same way as an unknown tenant account", async () => {
    const fixture = createFixture();
    const tenantMessage = await expectUniformDenial(
      fixture.controller.passwordLogin("tenant", {
        email: "nobody@example.com",
        password: CORRECT_PASSWORD,
      }),
    );
    const agencyMessage = await expectUniformDenial(
      fixture.controller.passwordLogin("agency", {
        email: "nobody@example.com",
        password: CORRECT_PASSWORD,
      }),
    );
    expect(agencyMessage).toBe(tenantMessage);
  });

  it("issues a partner session for a fleet-staff membership resolved directly via findMembershipsByPrincipalId, not partner_user_identity_links (Fleet269 §3)", async () => {
    const fixture = createFixture();
    const entrySlug = "fleet-pwd-login-fixture";
    const fleetPartnerId = "fleet-partner-pwd-login-fixture";
    registerFleetPartnerEntry(fixture, { entrySlug, fleetPartnerId });
    await createActiveFleetPartnerPasswordUser(fixture, {
      entrySlug,
      fleetPartnerId,
      email: "fleet-staff@example.com",
    });

    const envelope = (await fixture.controller.passwordLogin("partner", {
      email: "fleet-staff@example.com",
      password: CORRECT_PASSWORD,
      partnerId: entrySlug,
    })) as {
      data: {
        accessToken: string;
        partnerEntry: { entrySlug: string; partnerId: string };
        identity: { realm: string; roles: string[] };
      };
    };

    expect(envelope.data.accessToken).toBeTruthy();
    expect(envelope.data.partnerEntry.entrySlug).toBe(entrySlug);
    expect(envelope.data.partnerEntry.partnerId).toBe(fleetPartnerId);
    expect(envelope.data.identity.realm).toBe("partner");
    expect(envelope.data.identity.roles).toEqual(["fleet_partner_admin"]);
  });

  it("answers an unknown partner account the same way as an unknown tenant account", async () => {
    const fixture = createFixture();
    const tenantMessage = await expectUniformDenial(
      fixture.controller.passwordLogin("tenant", {
        email: "nobody@example.com",
        password: CORRECT_PASSWORD,
      }),
    );
    const partnerMessage = await expectUniformDenial(
      fixture.controller.passwordLogin("partner", {
        email: "nobody@example.com",
        password: CORRECT_PASSWORD,
      }),
    );
    expect(partnerMessage).toBe(tenantMessage);
  });

  it("denies a fleet-staff login with the wrong password the same uniform way, and locks after repeated failures", async () => {
    const fixture = createFixture();
    const entrySlug = "fleet-pwd-login-lockout";
    const fleetPartnerId = "fleet-partner-pwd-login-lockout";
    registerFleetPartnerEntry(fixture, { entrySlug, fleetPartnerId });
    const { principal } = await createActiveFleetPartnerPasswordUser(fixture, {
      entrySlug,
      fleetPartnerId,
      email: "fleet-staff-lockout@example.com",
    });

    const unknownMessage = await expectUniformDenial(
      fixture.controller.passwordLogin("partner", {
        email: "nobody@example.com",
        password: CORRECT_PASSWORD,
      }),
    );
    const wrongPasswordMessage = await expectUniformDenial(
      fixture.controller.passwordLogin("partner", {
        email: "fleet-staff-lockout@example.com",
        password: WRONG_PASSWORD,
        partnerId: entrySlug,
      }),
    );
    expect(wrongPasswordMessage).toBe(unknownMessage);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expectUniformDenial(
        fixture.controller.passwordLogin("partner", {
          email: "fleet-staff-lockout@example.com",
          password: WRONG_PASSWORD,
          partnerId: entrySlug,
        }),
      );
    }

    const lockedState =
      await fixture.identityRepository.getPasswordLoginLockoutState(
        principal.principalId,
      );
    expect(lockedState.failedAttempts).toBe(5);
    expect(lockedState.lockedUntil).toBeTruthy();

    const lockedOutMessage = await expectUniformDenial(
      fixture.controller.passwordLogin("partner", {
        email: "fleet-staff-lockout@example.com",
        password: CORRECT_PASSWORD,
        partnerId: entrySlug,
      }),
    );
    expect(lockedOutMessage).toBe(unknownMessage);
  });
});

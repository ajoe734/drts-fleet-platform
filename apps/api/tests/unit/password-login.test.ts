import { createHash, randomUUID } from "node:crypto";
import { generate } from "otplib";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../src/common/auth/auth.types";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import { PasswordHashingService } from "../../src/common/auth/password-hashing.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import type {
  CanonicalIdentityInvitationRecord,
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
  CanonicalIdentitySessionRecord,
  PartnerChannelEntryRecord,
} from "@drts/contracts";
import { AgencyDirectoryRepository } from "../../src/modules/agency-access/agency-directory.repository";
import { AuthController } from "../../src/modules/auth/auth.controller";
import { OidcPkceService } from "../../src/modules/auth/oidc-pkce.service";
import { TotpCredentialRepository } from "../../src/modules/auth/totp-credential.repository";
import { TotpController } from "../../src/modules/auth/totp.controller";
import { TotpService } from "../../src/modules/auth/totp.service";
import { FleetPartnerService } from "../../src/modules/fleet-partner/fleet-partner.service";
import {
  FLEET_INVITATION_ISSUER,
  IdentityRepository,
} from "../../src/modules/identity/identity.repository";
import { SecurityEventsService } from "../../src/modules/security-events/security-events.service";
import { PartnerUserIdentityLinkRepository } from "../../src/modules/tenant-partner/partner-user-identity-link.repository";
import {
  TenantInvitationDeliveryService,
  type TenantInvitationDeliveryRequest,
} from "../../src/modules/tenant-partner/tenant-invitation-delivery.service";
import { TenantPartnerRepository } from "../../src/modules/tenant-partner/tenant-partner.repository";
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
  process.env.OIDC_MOCK_MODE = "true";
  process.env.JWT_SECRET = "test_jwt_secret_key_32_characters_long_min!";
  process.env.PASSWORD_PEPPER_SECRETS_JSON = JSON.stringify({
    v1: "password-login-test-pepper-value-32chars!",
  });
  process.env.PASSWORD_PEPPER_CURRENT_VERSION = "v1";
  process.env.TOTP_ENCRYPTION_KEYS_JSON = JSON.stringify({
    activeKeyId: "v1",
    keys: {
      v1: Buffer.alloc(32, 0x5a).toString("base64"),
    },
  });
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
  const partnerUserIdentityLinkRepository =
    new PartnerUserIdentityLinkRepository();
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
    partnerUserIdentityLinkRepository,
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
    partnerUserIdentityLinkRepository,
    securityEventsService,
    tenantPartnerService,
    jwtAuthService,
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
      (candidate) =>
        candidate.email.toLowerCase() === options.email.toLowerCase(),
    )!;
  const rawToken = fixture.delivery.tokens.get(invitation.invitationId)!;
  await fixture.tenantPartnerService.acceptTenantInvitationWithPassword({
    invitationToken: rawToken,
    password: options.password ?? CORRECT_PASSWORD,
  });
  const principal = fixture.identityRepository
    .listPrincipals()
    .find(
      (candidate) =>
        candidate.email?.toLowerCase() === options.email.toLowerCase(),
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

/** PWD-LOGIN-SESSION-ADD-PASSWORD-20261114 (SA/SD §1): builds a tenant
 * principal/membership that is active via the *Google* invitation-accept
 * branch (`acceptTenantOidcInvitation`), so it has no password credential at
 * all -- the exact "Google-only" starting state `POST
 * /api/auth/:realm/credentials/password` exists to add a first password to. */
async function createActiveTenantGoogleOnlyUser(
  fixture: ReturnType<typeof createFixture>,
  options: { tenantId: string; email: string; roleCode?: string },
) {
  await fixture.tenantPartnerService.createTenantUser(options.tenantId, {
    email: options.email,
    displayName: "Google Only Fixture",
    roleCode: options.roleCode ?? "tenant_viewer",
  });
  const invitation = fixture.identityRepository
    .listInvitations()
    .find(
      (candidate) =>
        candidate.email.toLowerCase() === options.email.toLowerCase(),
    )!;
  const rawToken = fixture.delivery.tokens.get(invitation.invitationId)!;
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  await fixture.tenantPartnerService.acceptTenantOidcInvitation(tokenHash, {
    issuer: "https://accounts.google.com",
    subject: `google-sub-${randomUUID()}`,
    email: options.email,
    tenantId: options.tenantId,
  });
  const principal = fixture.identityRepository
    .listPrincipals()
    .find(
      (candidate) =>
        candidate.email?.toLowerCase() === options.email.toLowerCase(),
    )!;
  const memberships =
    await fixture.identityRepository.findMembershipsByPrincipalId(
      principal.principalId,
    );
  const membership = memberships.find(
    (candidate) =>
      candidate.realm === "tenant" && candidate.tenantId === options.tenantId,
  )!;
  return { principal, membership };
}

/** A minimal, directly-constructed session identity for calling
 * `AuthController.setAccountPassword` the same way the real
 * `BootstrapAuthGuard` would populate `request.identity` from a verified
 * Bearer token -- never anything the test (or an attacker) could instead
 * smuggle through the request body. */
function buildAccountSecurityIdentity(options: {
  realm: "tenant" | "agency" | "partner";
  principalId: string;
  membershipId: string;
  roles?: string[];
  amr?: string[];
  acr?: string | null;
  authTime?: string | null;
}): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType:
      options.realm === "agency"
        ? "agency_user"
        : options.realm === "partner"
          ? "partner_user"
          : "tenant_admin",
    actorId: options.principalId,
    principalId: options.principalId,
    membershipId: options.membershipId,
    subject: options.principalId,
    realm: options.realm,
    tenantId: null,
    sessionId: `session_${options.principalId}`,
    tokenId: `token_${options.principalId}`,
    tokenVersion: 1,
    authTime: options.authTime ?? new Date().toISOString(),
    amr: options.amr ?? [],
    acr: options.acr ?? "aal1",
    policyVersion: "v1",
    roleFamilies: [options.realm],
    roles: options.roles ?? [],
    scopes: [],
    requestId: null,
  };
}

async function expectUniformDenial(promise: Promise<unknown>): Promise<string> {
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
    expect(
      await fixture.jwtAuthService.verifyAccessToken(envelope.data.accessToken),
    ).toMatchObject({
      realm: "partner",
      partnerId: fleetPartnerId,
      partnerEntrySlug: entrySlug,
      roles: ["fleet_partner_admin"],
      amr: ["pwd"],
      acr: "aal1",
    });
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

// PWD-LOGIN-SESSION-ADD-PASSWORD-20261114 (SA/SD §1:34, §9:169, §12:193,
// docs/02-architecture/portal-password-login-20261113/01_system_sa_sd.md):
// the original-accepted-SA follow-up to PWD-LOGIN-005/007/008 -- a
// logged-in session adding a first password to a Google-only principal, or
// changing an existing one. `identity` (never the request body) supplies
// `principalId`/`realm`/`amr`/`authTime`; the route must not trust a
// body-asserted identity or MFA claim.
describe("POST /api/auth/:realm/credentials/password", () => {
  const NEW_PASSWORD = "a brand new sufficiently long password!";
  const ANOTHER_NEW_PASSWORD = "yet another sufficiently long password!";

  it("adds a first password credential to a Google-only tenant_viewer session, which then logs in with it", async () => {
    const fixture = createFixture();
    const tenantId = "tenant-pwd-add-google-only";
    const { principal, membership } = await createActiveTenantGoogleOnlyUser(
      fixture,
      { tenantId, email: "google-only@example.com" },
    );
    expect(
      await fixture.identityRepository.findPasswordCredentialByPrincipalId(
        principal.principalId,
      ),
    ).toBeNull();

    const identity = buildAccountSecurityIdentity({
      realm: "tenant",
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      roles: ["tenant_viewer"],
    });

    const envelope = (await fixture.controller.setAccountPassword(
      "tenant",
      identity,
      { password: NEW_PASSWORD },
      {},
    )) as { data: { action: string } };
    expect(envelope.data.action).toBe("created");

    const envelopeLogin = (await fixture.controller.passwordLogin("tenant", {
      email: "google-only@example.com",
      password: NEW_PASSWORD,
      tenantId,
    })) as { data: { accessToken: string } };
    expect(envelopeLogin.data.accessToken).toBeTruthy();
  });

  it("denies adding a first password for a tenant_admin session without a fresh, trusted MFA proof, and allows it once that proof is present", async () => {
    const fixture = createFixture();
    const tenantId = "tenant-pwd-add-mfa-required";
    const { principal, membership } = await createActiveTenantGoogleOnlyUser(
      fixture,
      {
        tenantId,
        email: "google-only-admin@example.com",
        roleCode: "tenant_admin",
      },
    );

    const staleIdentity = buildAccountSecurityIdentity({
      realm: "tenant",
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      roles: ["tenant_admin"],
      amr: ["otp"],
      authTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    await expect(
      fixture.controller.setAccountPassword(
        "tenant",
        staleIdentity,
        { password: NEW_PASSWORD },
        {},
      ),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });

    const noMfaIdentity = buildAccountSecurityIdentity({
      realm: "tenant",
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      roles: ["tenant_admin"],
      amr: [],
    });
    await expect(
      fixture.controller.setAccountPassword(
        "tenant",
        noMfaIdentity,
        { password: NEW_PASSWORD },
        {},
      ),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });

    const freshMfaIdentity = buildAccountSecurityIdentity({
      realm: "tenant",
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      roles: ["tenant_admin"],
      amr: ["otp"],
    });
    const envelope = (await fixture.controller.setAccountPassword(
      "tenant",
      freshMfaIdentity,
      { password: NEW_PASSWORD },
      {},
    )) as { data: { action: string } };
    expect(envelope.data.action).toBe("created");
  });

  it("a body-asserted amr/mfa/principalId claim never substitutes for the verified session's own evidence", async () => {
    const fixture = createFixture();
    const tenantId = "tenant-pwd-add-body-spoof";
    const { principal, membership } = await createActiveTenantGoogleOnlyUser(
      fixture,
      {
        tenantId,
        email: "google-only-spoof@example.com",
        roleCode: "tenant_admin",
      },
    );
    const staleNoMfaIdentity = buildAccountSecurityIdentity({
      realm: "tenant",
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      roles: ["tenant_admin"],
      amr: [],
      authTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    await expect(
      fixture.controller.setAccountPassword(
        "tenant",
        staleNoMfaIdentity,
        {
          password: NEW_PASSWORD,
          // Deliberately smuggling fields the real body type never
          // declares, to prove they are never read; `as never` below lets
          // this literal carry them without a type error.
          amr: ["otp"],
          mfa: true,
          principalId: "someone-elses-principal",
          email: "someone-else@example.com",
        } as never,
        {},
      ),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  });

  it("changes an existing password credential given the correct current password, and the old password stops working", async () => {
    const fixture = createFixture();
    const tenantId = "tenant-pwd-change-current-password";
    const { principal } = await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "change-with-current@example.com",
    });
    const memberships =
      await fixture.identityRepository.findMembershipsByPrincipalId(
        principal.principalId,
      );
    const membership = memberships.find(
      (candidate) =>
        candidate.realm === "tenant" && candidate.tenantId === tenantId,
    )!;
    const identity = buildAccountSecurityIdentity({
      realm: "tenant",
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      roles: ["tenant_viewer"],
      authTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    const envelope = (await fixture.controller.setAccountPassword(
      "tenant",
      identity,
      { password: NEW_PASSWORD, currentPassword: CORRECT_PASSWORD },
      {},
    )) as { data: { action: string } };
    expect(envelope.data.action).toBe("changed");

    await expectUniformDenial(
      fixture.controller.passwordLogin("tenant", {
        email: "change-with-current@example.com",
        password: CORRECT_PASSWORD,
        tenantId,
      }),
    );
    const loginEnvelope = (await fixture.controller.passwordLogin("tenant", {
      email: "change-with-current@example.com",
      password: NEW_PASSWORD,
      tenantId,
    })) as { data: { accessToken: string } };
    expect(loginEnvelope.data.accessToken).toBeTruthy();
  });

  it("denies a password change with the wrong current password, even with an otherwise-fresh session", async () => {
    const fixture = createFixture();
    const tenantId = "tenant-pwd-change-wrong-current-password";
    const { principal } = await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "wrong-current@example.com",
    });
    const memberships =
      await fixture.identityRepository.findMembershipsByPrincipalId(
        principal.principalId,
      );
    const membership = memberships.find(
      (candidate) =>
        candidate.realm === "tenant" && candidate.tenantId === tenantId,
    )!;
    const identity = buildAccountSecurityIdentity({
      realm: "tenant",
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      roles: ["tenant_viewer"],
    });

    await expect(
      fixture.controller.setAccountPassword(
        "tenant",
        identity,
        { password: NEW_PASSWORD, currentPassword: WRONG_PASSWORD },
        {},
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });

    const loginEnvelope = (await fixture.controller.passwordLogin("tenant", {
      email: "wrong-current@example.com",
      password: CORRECT_PASSWORD,
      tenantId,
    })) as { data: { accessToken: string } };
    expect(loginEnvelope.data.accessToken).toBeTruthy();
  });

  it("changes an existing password credential without a current password when the session is qualifyingly fresh, and denies it when the session is stale", async () => {
    const fixture = createFixture();
    const tenantId = "tenant-pwd-change-fresh-session";
    const { principal } = await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "fresh-session-change@example.com",
    });
    const memberships =
      await fixture.identityRepository.findMembershipsByPrincipalId(
        principal.principalId,
      );
    const membership = memberships.find(
      (candidate) =>
        candidate.realm === "tenant" && candidate.tenantId === tenantId,
    )!;

    const staleIdentity = buildAccountSecurityIdentity({
      realm: "tenant",
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      roles: ["tenant_viewer"],
      authTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    await expect(
      fixture.controller.setAccountPassword(
        "tenant",
        staleIdentity,
        { password: NEW_PASSWORD },
        {},
      ),
    ).rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });

    const freshIdentity = buildAccountSecurityIdentity({
      realm: "tenant",
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      roles: ["tenant_viewer"],
    });
    const envelope = (await fixture.controller.setAccountPassword(
      "tenant",
      freshIdentity,
      { password: ANOTHER_NEW_PASSWORD },
      {},
    )) as { data: { action: string } };
    expect(envelope.data.action).toBe("changed");
  });

  it("denies an unauthenticated (null identity) request", async () => {
    const fixture = createFixture();
    await expect(
      fixture.controller.setAccountPassword(
        "tenant",
        null,
        { password: NEW_PASSWORD },
        {},
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("denies a session whose realm does not match the :realm route segment", async () => {
    const fixture = createFixture();
    const tenantId = "tenant-pwd-wrong-realm";
    const { principal, membership } = await createActiveTenantGoogleOnlyUser(
      fixture,
      { tenantId, email: "wrong-realm@example.com" },
    );
    const identity = buildAccountSecurityIdentity({
      realm: "tenant",
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      roles: ["tenant_viewer"],
    });

    await expect(
      fixture.controller.setAccountPassword(
        "agency",
        identity,
        { password: NEW_PASSWORD },
        {},
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("denies a session for a principal that has since been disabled", async () => {
    const fixture = createFixture();
    const tenantId = "tenant-pwd-disabled-account";
    const { principal } = await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "disabled-change@example.com",
    });
    const memberships =
      await fixture.identityRepository.findMembershipsByPrincipalId(
        principal.principalId,
      );
    const membership = memberships.find(
      (candidate) =>
        candidate.realm === "tenant" && candidate.tenantId === tenantId,
    )!;
    const identity = buildAccountSecurityIdentity({
      realm: "tenant",
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      roles: ["tenant_viewer"],
    });

    forceSuspendPrincipal(fixture.identityRepository, principal.principalId);

    await expect(
      fixture.controller.setAccountPassword(
        "tenant",
        identity,
        { password: NEW_PASSWORD, currentPassword: CORRECT_PASSWORD },
        {},
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("rejects a password that fails the policy (too short for a session with no confirmed TOTP)", async () => {
    const fixture = createFixture();
    const tenantId = "tenant-pwd-policy-violation";
    const { principal, membership } = await createActiveTenantGoogleOnlyUser(
      fixture,
      { tenantId, email: "policy-violation@example.com" },
    );
    const identity = buildAccountSecurityIdentity({
      realm: "tenant",
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      roles: ["tenant_viewer"],
    });

    await expect(
      fixture.controller.setAccountPassword(
        "tenant",
        identity,
        { password: "too-short" },
        {},
      ),
    ).rejects.toMatchObject({ code: "PASSWORD_POLICY_VIOLATION" });
  });

  it("never writes the submitted new or current password into a security event", async () => {
    const fixture = createFixture();
    const tenantId = "tenant-pwd-no-plaintext";
    const { principal } = await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "no-plaintext-change@example.com",
    });
    const memberships =
      await fixture.identityRepository.findMembershipsByPrincipalId(
        principal.principalId,
      );
    const membership = memberships.find(
      (candidate) =>
        candidate.realm === "tenant" && candidate.tenantId === tenantId,
    )!;
    const identity = buildAccountSecurityIdentity({
      realm: "tenant",
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      roles: ["tenant_viewer"],
    });
    const recordEvent = vi.spyOn(fixture.securityEventsService, "recordEvent");

    await expect(
      fixture.controller.setAccountPassword(
        "tenant",
        identity,
        { password: NEW_PASSWORD, currentPassword: WRONG_PASSWORD },
        {},
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    await fixture.controller.setAccountPassword(
      "tenant",
      identity,
      { password: NEW_PASSWORD, currentPassword: CORRECT_PASSWORD },
      {},
    );

    expect(recordEvent).toHaveBeenCalled();
    const serialized = JSON.stringify(recordEvent.mock.calls);
    expect(serialized).not.toContain(NEW_PASSWORD);
    expect(serialized).not.toContain(CORRECT_PASSWORD);
    expect(serialized).not.toContain(WRONG_PASSWORD);
  });

  it("changes an existing agency password credential given the correct current password", async () => {
    const fixture = createFixture();
    const now = new Date().toISOString();
    await fixture.agencyDirectoryRepository.create({
      agencyId: "agency_pwd_credentials_change",
      agencyCode: "PWD-CRED-CHANGE",
      displayName: "Password Credentials Change Agency",
      status: "active",
      createdByPrincipalId: null,
      createdAt: now,
      updatedAt: now,
    });
    const rawToken = "agency-invite-raw-token-for-credentials-change";
    await fixture.identityRepository.issueAgencyInvitation({
      agencyId: "agency_pwd_credentials_change",
      email: "agency-change@example.com",
      roleCode: "agency_viewer",
      accessValidTo: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      tokenHash: createHash("sha256").update(rawToken).digest("hex"),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      issuerPrincipalId: null,
    });
    await fixture.tenantPartnerService.acceptAgencyInvitationWithPassword({
      invitationToken: rawToken,
      password: CORRECT_PASSWORD,
    });
    const principal = fixture.identityRepository
      .listPrincipals()
      .find(
        (candidate) =>
          candidate.email?.toLowerCase() === "agency-change@example.com",
      )!;
    const memberships =
      await fixture.identityRepository.findMembershipsByPrincipalId(
        principal.principalId,
      );
    const membership = memberships.find(
      (candidate) => candidate.realm === "agency",
    )!;
    const identity = buildAccountSecurityIdentity({
      realm: "agency",
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      roles: ["agency_viewer"],
    });

    const envelope = (await fixture.controller.setAccountPassword(
      "agency",
      identity,
      { password: NEW_PASSWORD, currentPassword: CORRECT_PASSWORD },
      {},
    )) as { data: { action: string } };
    expect(envelope.data.action).toBe("changed");

    const loginEnvelope = (await fixture.controller.passwordLogin("agency", {
      email: "agency-change@example.com",
      password: NEW_PASSWORD,
    })) as { data: { accessToken: string } };
    expect(loginEnvelope.data.accessToken).toBeTruthy();
  });

  it("changes an existing fleet partner password credential given the correct current password", async () => {
    const fixture = createFixture();
    const entrySlug = "fleet-pwd-credentials-change";
    const fleetPartnerId = "fleet-partner-pwd-credentials-change";
    registerFleetPartnerEntry(fixture, { entrySlug, fleetPartnerId });
    const { principal } = await createActiveFleetPartnerPasswordUser(fixture, {
      entrySlug,
      fleetPartnerId,
      email: "fleet-staff-change@example.com",
    });
    const memberships =
      await fixture.identityRepository.findMembershipsByPrincipalId(
        principal.principalId,
      );
    const membership = memberships.find(
      (candidate) => candidate.realm === "partner",
    )!;
    const identity = buildAccountSecurityIdentity({
      realm: "partner",
      principalId: principal.principalId,
      membershipId: membership.membershipId,
      roles: ["fleet_partner_admin"],
    });

    const envelope = (await fixture.controller.setAccountPassword(
      "partner",
      identity,
      { password: NEW_PASSWORD, currentPassword: CORRECT_PASSWORD },
      {},
    )) as { data: { action: string } };
    expect(envelope.data.action).toBe("changed");

    const loginEnvelope = (await fixture.controller.passwordLogin("partner", {
      email: "fleet-staff-change@example.com",
      password: NEW_PASSWORD,
      partnerId: entrySlug,
    })) as { data: { accessToken: string } };
    expect(loginEnvelope.data.accessToken).toBeTruthy();
    expect(
      await fixture.jwtAuthService.verifyAccessToken(
        loginEnvelope.data.accessToken,
      ),
    ).not.toBeNull();
  });
});

function createFleetDurableSessionPortMock() {
  const principals = new Map<string, CanonicalIdentityPrincipalRecord>();
  const principalsByIssuerSubject = new Map<
    string,
    CanonicalIdentityPrincipalRecord
  >();
  const memberships = new Map<string, CanonicalIdentityMembershipRecord>();
  const membershipsBySourceRef = new Map<
    string,
    CanonicalIdentityMembershipRecord
  >();
  const roleBindingsByMembership = new Map<
    string,
    CanonicalIdentityRoleBindingRecord[]
  >();
  const roleBindingsBySourceRef = new Map<
    string,
    CanonicalIdentityRoleBindingRecord
  >();
  const invitationsById = new Map<string, CanonicalIdentityInvitationRecord>();
  const invitationsByTokenHash = new Map<
    string,
    CanonicalIdentityInvitationRecord
  >();
  const sessions = new Map<string, CanonicalIdentitySessionRecord>();
  const fleetPartnersActive = new Map<string, boolean>();
  const partnerEntries = new Map<string, PartnerChannelEntryRecord>();
  const links = new Map<
    string,
    {
      entrySlug: string;
      partnerUserRef: string;
      drtsPassengerId: string;
      status: string;
      consentScope: string;
      linkedAt?: string;
      lastSeenAt?: string;
      createdAt?: string;
      updatedAt?: string;
    }
  >();
  const passwordCredentials = new Map<
    string,
    {
      principalId: string;
      passwordHash: string;
      passwordAlgo: string;
      pepperVersion: string;
      failedAttempts: number;
      lockedUntil: string | null;
      mustChangeAt: string | null;
      createdAt: string;
      updatedAt: string;
    }
  >();

  function toPersistedSessionRow(record: CanonicalIdentitySessionRecord) {
    return {
      session_id: record.sessionId,
      source_ref: record.sourceRef,
      principal_id: record.principalId,
      membership_id: record.membershipId ?? null,
      realm: record.realm,
      status: record.status,
      auth_time: record.authTime,
      auth_methods: [...record.authMethods],
      token_version: record.tokenVersion,
      idle_expires_at: record.idleExpiresAt ?? null,
      absolute_expires_at: record.absoluteExpiresAt,
      revoked_at: record.revokedAt ?? null,
      revoked_by_principal_id: record.revokedByPrincipalId ?? null,
      revoke_reason: record.revokeReason ?? null,
      device_summary: record.deviceSummary ?? {},
      risk_summary: record.riskSummary ?? {},
      created_at: record.createdAt,
      updated_at: record.updatedAt,
      record,
    };
  }

  function upsertPrincipalRow(record: CanonicalIdentityPrincipalRecord) {
    const prior = principals.get(record.principalId);
    if (prior) {
      principalsByIssuerSubject.delete(`${prior.issuer}::${prior.subject}`);
    }
    const persisted = prior
      ? {
          ...record,
          principalId: prior.principalId,
          createdAt: prior.createdAt,
        }
      : record;
    principals.set(persisted.principalId, persisted);
    principalsByIssuerSubject.set(
      `${persisted.issuer}::${persisted.subject}`,
      persisted,
    );
    return persisted;
  }

  function upsertMembershipRow(record: CanonicalIdentityMembershipRecord) {
    const prior = record.sourceRef
      ? membershipsBySourceRef.get(record.sourceRef)
      : memberships.get(record.membershipId);
    const persisted = prior
      ? {
          ...record,
          membershipId: prior.membershipId,
          createdAt: prior.createdAt,
        }
      : record;
    memberships.set(persisted.membershipId, persisted);
    if (persisted.sourceRef) {
      membershipsBySourceRef.set(persisted.sourceRef, persisted);
    }
    return persisted;
  }

  function upsertRoleBindingRow(record: CanonicalIdentityRoleBindingRecord) {
    const prior = record.sourceRef
      ? roleBindingsBySourceRef.get(record.sourceRef)
      : undefined;
    const persisted = prior
      ? {
          ...record,
          roleBindingId: prior.roleBindingId,
          createdAt: prior.createdAt,
        }
      : record;
    if (persisted.sourceRef) {
      roleBindingsBySourceRef.set(persisted.sourceRef, persisted);
    }
    const list = roleBindingsByMembership.get(persisted.membershipId) ?? [];
    const idx = list.findIndex((b) => b.sourceRef === persisted.sourceRef);
    if (idx >= 0) list[idx] = persisted;
    else list.push(persisted);
    roleBindingsByMembership.set(persisted.membershipId, list);
    return persisted;
  }

  function upsertInvitationRow(record: CanonicalIdentityInvitationRecord) {
    invitationsById.set(record.invitationId, record);
    invitationsByTokenHash.set(record.tokenHash, record);
  }

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = sql.trim();

    if (
      text.startsWith("BEGIN") ||
      text.startsWith("COMMIT") ||
      text.startsWith("ROLLBACK") ||
      text.startsWith("SAVEPOINT")
    ) {
      return { rows: [] };
    }
    if (text.includes("FROM admin.phase1_partner_channel_entries")) {
      if (text.includes("WHERE entry_slug = $1")) {
        const entry = partnerEntries.get(params[0] as string);
        return { rows: entry ? [{ record: entry }] : [] };
      }
      return {
        rows: [...partnerEntries.values()].map((record) => ({ record })),
      };
    }
    if (
      text.includes("FROM iam.identity_principals p") &&
      text.includes(
        "JOIN iam.identity_memberships m ON m.principal_id = p.principal_id",
      )
    ) {
      const [scopeRef, partnerId, emailNormalized, entrySlug] = params as [
        string,
        string,
        string,
        string,
      ];
      const rows: Array<{ principal_id: string }> = [];
      for (const m of memberships.values()) {
        if (
          m.realm !== "partner" ||
          m.scopeRef !== scopeRef ||
          m.partnerId !== partnerId
        ) {
          continue;
        }
        const p = principals.get(m.principalId);
        if (
          p &&
          p.email?.toLowerCase() === emailNormalized &&
          p.principalType === "human" &&
          p.sourceRef === `jwt_principal:partner:${p.principalId}` &&
          m.sourceRef === `fleet_member:${entrySlug}:${p.principalId}`
        ) {
          rows.push({ principal_id: p.principalId });
        }
      }
      return { rows };
    }
    if (text.startsWith("SELECT principal_id FROM iam.identity_principals")) {
      const rec = principals.get(params[0] as string);
      return { rows: rec ? [{ principal_id: rec.principalId }] : [] };
    }
    if (
      text.includes("FROM iam.identity_principals") &&
      text.includes("WHERE email_normalized = $1")
    ) {
      const emailNormalized = (params[0] as string).toLowerCase();
      return {
        rows: [...principals.values()]
          .filter((p) => p.email?.toLowerCase() === emailNormalized)
          .map((record) => ({ record })),
      };
    }
    if (
      text.includes("FROM iam.identity_principals") &&
      text.includes("WHERE issuer = $1 AND subject = $2")
    ) {
      const rec = principalsByIssuerSubject.get(`${params[0]}::${params[1]}`);
      return { rows: rec ? [{ record: rec }] : [] };
    }
    if (
      text.includes("FROM iam.identity_principals") &&
      text.includes("WHERE principal_id = $1")
    ) {
      const rec = principals.get(params[0] as string);
      return { rows: rec ? [{ record: rec }] : [] };
    }
    if (
      text.includes("FROM iam.identity_memberships") &&
      text.includes("WHERE principal_id = $1")
    ) {
      return {
        rows: [...memberships.values()]
          .filter((m) => m.principalId === params[0])
          .map((record) => ({ record })),
      };
    }
    if (
      text.includes("FROM iam.identity_memberships") &&
      text.includes("WHERE source_ref = $1")
    ) {
      const rec = membershipsBySourceRef.get(params[0] as string);
      return { rows: rec ? [{ record: rec }] : [] };
    }
    if (
      text.includes("FROM iam.identity_memberships") &&
      text.includes("WHERE membership_id = $1")
    ) {
      const rec = memberships.get(params[0] as string);
      if (!rec) return { rows: [] };
      if (
        text.includes(
          "realm = 'partner' AND scope_ref = $2 AND partner_id = $3",
        ) &&
        (rec.realm !== "partner" ||
          rec.scopeRef !== params[1] ||
          rec.partnerId !== params[2])
      ) {
        return { rows: [] };
      }
      return { rows: [{ record: rec }] };
    }
    if (
      text.includes("FROM iam.identity_role_bindings") &&
      text.includes("WHERE source_ref = $1")
    ) {
      const rec = roleBindingsBySourceRef.get(params[0] as string);
      return { rows: rec ? [{ record: rec }] : [] };
    }
    if (
      text.includes("FROM iam.identity_role_bindings") &&
      text.includes("WHERE membership_id = $1")
    ) {
      const list = roleBindingsByMembership.get(params[0] as string) ?? [];
      return { rows: list.map((record) => ({ record })) };
    }
    if (text.includes("FROM iam.privileged_role_grants")) {
      return { rows: [] };
    }
    if (
      text.includes("FROM iam.identity_invitations") &&
      text.includes("token_hash = $1")
    ) {
      const rec = invitationsByTokenHash.get(params[0] as string);
      const nowMs = Date.parse(params[1] as string);
      const valid =
        rec &&
        !rec.acceptedAt &&
        !rec.revokedAt &&
        Date.parse(rec.expiresAt) > nowMs;
      return { rows: valid ? [{ record: rec }] : [] };
    }
    if (
      text.includes("UPDATE iam.identity_invitations") &&
      text.includes("SET delivery_status = $2::text")
    ) {
      const rec = invitationsById.get(params[0] as string);
      if (!rec || rec.realm !== "partner") return { rows: [] };
      const updated: CanonicalIdentityInvitationRecord = {
        ...rec,
        deliveryStatus:
          params[1] as CanonicalIdentityInvitationRecord["deliveryStatus"],
        updatedAt: params[2] as string,
      };
      upsertInvitationRow(updated);
      return { rows: [{ record: updated }] };
    }
    if (
      text.includes("UPDATE iam.identity_invitations") &&
      text.includes("SET revoked_at = $2::timestamptz") &&
      text.includes("WHERE membership_id = $1")
    ) {
      for (const inv of invitationsById.values()) {
        if (
          inv.membershipId === params[0] &&
          !inv.acceptedAt &&
          !inv.revokedAt
        ) {
          upsertInvitationRow({
            ...inv,
            revokedAt: params[1] as string,
            updatedAt: params[1] as string,
          });
        }
      }
      return { rows: [] };
    }
    if (text.includes("SELECT active FROM admin.phase1_fleet_partners")) {
      const active = fleetPartnersActive.get(params[0] as string);
      return { rows: active === undefined ? [] : [{ active }] };
    }
    if (text.includes("INSERT INTO admin.phase1_partner_user_identity_links")) {
      const entrySlug = params[0] as string;
      const partnerUserRef = params[1] as string;
      const drtsPassengerId = params[2] as string;
      const key = `${entrySlug}::${partnerUserRef}`;
      for (const existing of links.values()) {
        if (
          existing.entrySlug === entrySlug &&
          existing.drtsPassengerId === drtsPassengerId &&
          existing.consentScope === "fleet_staff_invitation" &&
          existing.partnerUserRef !== partnerUserRef
        ) {
          return { rows: [] };
        }
      }
      const existingForKey = links.get(key);
      if (existingForKey) {
        if (
          existingForKey.entrySlug === entrySlug &&
          existingForKey.partnerUserRef === partnerUserRef &&
          existingForKey.drtsPassengerId === drtsPassengerId &&
          existingForKey.status === "active" &&
          existingForKey.consentScope === "fleet_staff_invitation"
        ) {
          return { rows: [{ record: existingForKey }] };
        }
        return { rows: [] };
      }
      const record = JSON.parse(params[4] as string) as {
        entrySlug: string;
        partnerUserRef: string;
        drtsPassengerId: string;
        status: string;
        consentScope: string;
      };
      links.set(key, record);
      return { rows: [{ record }] };
    }
    if (
      text.includes("FROM admin.phase1_partner_user_identity_links") &&
      text.includes("WHERE entry_slug = $1") &&
      text.includes("AND drts_passenger_id = $2")
    ) {
      for (const existing of links.values()) {
        if (
          existing.entrySlug === params[0] &&
          existing.drtsPassengerId === params[1]
        ) {
          return { rows: [{ record: existing }] };
        }
      }
      return { rows: [] };
    }
    if (
      text.includes("FROM admin.phase1_partner_user_identity_links") &&
      text.includes("WHERE entry_slug = $1") &&
      text.includes("AND partner_user_ref = $2")
    ) {
      const rec = links.get(`${params[0]}::${params[1]}`);
      return { rows: rec ? [{ record: rec }] : [] };
    }
    if (text.includes("UPDATE admin.phase1_partner_user_identity_links")) {
      const key = `${params[0]}::${params[1]}`;
      const existing = links.get(key);
      if (!existing) return { rows: [] };
      const updated = {
        ...existing,
        lastSeenAt: params[2] as string,
        updatedAt: params[2] as string,
      };
      links.set(key, updated);
      return { rows: [{ record: updated }] };
    }
    if (text.includes("INSERT INTO iam.identity_principals")) {
      const record = JSON.parse(
        params[11] as string,
      ) as CanonicalIdentityPrincipalRecord;
      const existing = principalsByIssuerSubject.get(
        `${record.issuer}::${record.subject}`,
      );
      if (existing && existing.principalId !== record.principalId) {
        throw Object.assign(
          new Error(
            "duplicate key value violates unique constraint iam_identity_principals_issuer_subject_key",
          ),
          { code: "23505" },
        );
      }
      const persisted = upsertPrincipalRow(record);
      return { rows: [{ record: persisted }] };
    }
    if (text.includes("INSERT INTO iam.identity_memberships")) {
      const record = JSON.parse(
        params[12] as string,
      ) as CanonicalIdentityMembershipRecord;
      const persisted = upsertMembershipRow(record);
      return { rows: [{ record: persisted }] };
    }
    if (text.includes("INSERT INTO iam.identity_role_bindings")) {
      const record = JSON.parse(
        params[10] as string,
      ) as CanonicalIdentityRoleBindingRecord;
      const persisted = upsertRoleBindingRow(record);
      return { rows: [{ record: persisted }] };
    }
    if (text.includes("INSERT INTO iam.identity_invitations")) {
      const record = JSON.parse(
        params[17] as string,
      ) as CanonicalIdentityInvitationRecord;
      upsertInvitationRow(record);
      return { rows: [{ record }] };
    }
    if (text.includes("INSERT INTO iam.identity_password_credentials")) {
      const principalId = params[0] as string;
      const now = params[4] as string;
      const prior = passwordCredentials.get(principalId);
      passwordCredentials.set(principalId, {
        principalId,
        passwordHash: params[1] as string,
        passwordAlgo: params[2] as string,
        pepperVersion: params[3] as string,
        failedAttempts: 0,
        lockedUntil: null,
        mustChangeAt: null,
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
      });
      return { rows: [] };
    }
    if (
      text.includes("SELECT principal_id, password_hash") &&
      text.includes("FROM iam.identity_password_credentials")
    ) {
      const cred = passwordCredentials.get(params[0] as string);
      if (!cred) return { rows: [] };
      return {
        rows: [
          {
            principal_id: cred.principalId,
            password_hash: cred.passwordHash,
            password_algo: cred.passwordAlgo,
            pepper_version: cred.pepperVersion,
            failed_attempts: cred.failedAttempts,
            locked_until: cred.lockedUntil,
            must_change_at: cred.mustChangeAt,
            created_at: cred.createdAt,
            updated_at: cred.updatedAt,
          },
        ],
      };
    }
    if (
      text.includes("SELECT failed_attempts, locked_until") &&
      text.includes("FROM iam.identity_password_credentials")
    ) {
      const cred = passwordCredentials.get(params[0] as string);
      if (!cred) return { rows: [] };
      return {
        rows: [
          {
            failed_attempts: cred.failedAttempts,
            locked_until: cred.lockedUntil,
          },
        ],
      };
    }
    if (
      text.includes("UPDATE iam.identity_password_credentials") &&
      text.includes("SET failed_attempts = 0, locked_until = NULL")
    ) {
      const cred = passwordCredentials.get(params[0] as string);
      if (cred) {
        passwordCredentials.set(cred.principalId, {
          ...cred,
          failedAttempts: 0,
          lockedUntil: null,
          updatedAt: params[1] as string,
        });
      }
      return { rows: [] };
    }
    if (text.includes("INSERT INTO iam.identity_sessions")) {
      const record = JSON.parse(
        params[18] as string,
      ) as CanonicalIdentitySessionRecord;
      sessions.set(record.sessionId, record);
      return { rows: [toPersistedSessionRow(record)] };
    }
    if (
      text.includes("SELECT * FROM iam.identity_sessions") &&
      text.includes("WHERE session_id = $1")
    ) {
      const rec = sessions.get(params[0] as string);
      return { rows: rec ? [toPersistedSessionRow(rec)] : [] };
    }
    if (
      text.includes("SELECT * FROM iam.identity_sessions") &&
      text.includes("WHERE principal_id = $1")
    ) {
      return {
        rows: [...sessions.values()]
          .filter((s) => s.principalId === params[0])
          .map(toPersistedSessionRow),
      };
    }
    if (
      text.includes("UPDATE iam.identity_sessions") &&
      text.includes("WHERE session_id = $1::text")
    ) {
      const existing = sessions.get(params[0] as string);
      if (!existing) return { rows: [] };
      const updated: CanonicalIdentitySessionRecord = {
        ...existing,
        status: "revoked",
        revokedAt: params[1] as string,
        revokedByPrincipalId: (params[2] as string | null) ?? null,
        revokeReason: params[3] as string,
        updatedAt: params[1] as string,
      };
      sessions.set(updated.sessionId, updated);
      return { rows: [toPersistedSessionRow(updated)] };
    }
    if (
      text.includes("UPDATE iam.identity_sessions") &&
      text.includes("WHERE principal_id = $1::text AND status = 'active'")
    ) {
      const revokedIds: Array<{ session_id: string }> = [];
      for (const session of sessions.values()) {
        if (session.principalId === params[0] && session.status === "active") {
          sessions.set(session.sessionId, {
            ...session,
            status: "revoked",
            revokedAt: params[1] as string,
            revokedByPrincipalId: (params[2] as string | null) ?? null,
            revokeReason: params[3] as string,
            updatedAt: params[1] as string,
          });
          revokedIds.push({ session_id: session.sessionId });
        }
      }
      return { rows: revokedIds };
    }
    if (text.includes("UPDATE iam.identity_refresh_families")) {
      return { rows: [] };
    }

    throw new Error(`Unmocked Fleet durable session query: ${text}`);
  });

  const databaseService = {
    isEnabled: () => true,
    connect: async () => ({ query, release: vi.fn() }),
    query,
  };

  return {
    databaseService,
    setFleetPartnerActive(fleetPartnerId: string, active: boolean) {
      fleetPartnersActive.set(fleetPartnerId, active);
    },
    seedPersistedFleetEntry(options: {
      entrySlug: string;
      fleetPartnerId: string;
      updatedAt?: string;
      status?: "active" | "inactive" | "revoked";
      activeFlag?: boolean;
    }): PartnerChannelEntryRecord {
      const now = options.updatedAt ?? new Date().toISOString();
      const entry: PartnerChannelEntryRecord = {
        partnerId: options.fleetPartnerId,
        partnerCode: `fleet_code_${options.entrySlug}`,
        partnerType: "fleet_partner",
        programId: `program-${options.entrySlug}`,
        programCode: null,
        tenantId: `tenant-${options.entrySlug}`,
        bankCode: null,
        entrySlug: options.entrySlug,
        displayName: `Fleet Entry ${options.entrySlug}`,
        businessDispatchSubtype: "enterprise_dispatch",
        authMode: "partner_api_key",
        eligibilityMode: "none",
        entryHost: null,
        entryPath: `/partner/${options.entrySlug}`,
        themeAccent: null,
        brandingMetadata: null,
        eligibilityContract: null,
        status: options.status ?? "active",
        activeFlag: options.activeFlag ?? true,
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
      partnerEntries.set(options.entrySlug, entry);
      return entry;
    },
    getPrincipal(principalId: string) {
      return principals.get(principalId) ?? null;
    },
    setPrincipalStatus(
      principalId: string,
      status: CanonicalIdentityPrincipalRecord["status"],
    ) {
      const existing = principals.get(principalId);
      if (existing) {
        upsertPrincipalRow({
          ...existing,
          status,
          updatedAt: new Date(Date.now() + 1000).toISOString(),
        });
      }
    },
    deletePasswordCredential(principalId: string) {
      passwordCredentials.delete(principalId);
    },
    setLinkStatus(entrySlug: string, partnerUserRef: string, status: string) {
      const key = `${entrySlug}::${partnerUserRef}`;
      const existing = links.get(key);
      if (existing) {
        links.set(key, { ...existing, status });
      }
    },
    getLink(entrySlug: string, partnerUserRef: string) {
      return links.get(`${entrySlug}::${partnerUserRef}`) ?? null;
    },
    getLinkCount() {
      return links.size;
    },
  };
}

describe("FLEET-PASSWORD-MEMBER-SESSION-20261123: password-invited Fleet member durable session, cold-start resolvePartnerEntries, MFA/sessions, and Google/re-invite preservation", () => {
  it("reproduces from formal invitation -> accept-with-password -> cold-start password-login, verifies durable state without a Google link, and permits continuous TOTP MFA and session operations", async () => {
    const mock = createFleetDurableSessionPortMock();
    const entrySlug = `fleet-cold-start-${randomUUID()}`;
    const fleetPartnerId = `fleet-partner-cold-${randomUUID()}`;
    mock.setFleetPartnerActive(fleetPartnerId, true);
    mock.seedPersistedFleetEntry({
      entrySlug,
      fleetPartnerId,
      updatedAt: "2026-11-23T01:00:00.000Z",
    });

    const identityRepository = new IdentityRepository(
      mock.databaseService as never,
    );
    const linkRepository = new PartnerUserIdentityLinkRepository(
      mock.databaseService as never,
    );
    const tenantPartnerRepository = new TenantPartnerRepository(
      mock.databaseService as never,
    );

    // Cold-start instance: in-memory `listPartnerEntries(entrySlug)` does not
    // hold the DB-persisted entry until `resolvePartnerEntries(entrySlug)`
    // loads `admin.phase1_partner_channel_entries` through `TenantPartnerRepository`.
    const coldTenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
      tenantPartnerRepository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      identityRepository,
      identityRepository,
    );
    expect(coldTenantPartnerService.listPartnerEntries(entrySlug)).toEqual([]);

    const deliveredInvitations: Array<{
      invitationId: string;
      rawToken: string;
      recipientEmail: string;
    }> = [];
    const fleetPartnerService = new FleetPartnerService(
      undefined as never,
      undefined as never,
      undefined as never,
      {
        isEnabled: () => true,
        findActiveFleetPartnerById: async (id: string) =>
          id === fleetPartnerId ? { fleetPartnerId: id, active: true } : null,
      } as never,
      undefined,
      identityRepository,
      coldTenantPartnerService,
      linkRepository,
      {
        isEnabled: () => true,
        recordEventRequired: vi.fn(async () => undefined),
      } as never,
      {
        send: vi.fn(
          async (req: {
            invitationId: string;
            rawToken: string;
            recipientEmail: string;
          }) => {
            deliveredInvitations.push(req);
            return {
              status: "sent" as const,
              attemptedAt: new Date().toISOString(),
            };
          },
        ),
      } as never,
    );

    const manager = {
      realm: "platform",
      actorType: "platform_admin",
      actorId: "manager-cold-start",
      principalId: "principal-manager-cold-start",
      scopes: ["foundation:write"],
      amr: [],
    } as never;

    const email = `invited-pwd-${randomUUID()}@fleet.example.org`;
    const issuedInvite = await fleetPartnerService.inviteFleetStaff(
      fleetPartnerId,
      {
        entrySlug,
        email,
        roleCode: "fleet_partner_ops",
      },
      manager,
    );
    expect(deliveredInvitations).toHaveLength(1);

    // Second cold-started TenantPartnerService instance for the login/auth
    // controller, proving `issuePartnerPasswordSession` resolves the persisted
    // entry via `resolvePartnerEntries` even when in-memory `listPartnerEntries`
    // starts empty.
    const authColdTenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
      tenantPartnerRepository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      identityRepository,
      identityRepository,
    );
    expect(authColdTenantPartnerService.listPartnerEntries(entrySlug)).toEqual(
      [],
    );

    const jwtAuthService = new JwtAuthService(
      identityRepository,
      authColdTenantPartnerService,
      undefined,
      undefined,
      linkRepository,
    );
    const totpRepository = new TotpCredentialRepository();
    const totpService = new TotpService(
      totpRepository,
      new PasswordHashingService(),
    );
    const totpController = new TotpController(totpService);
    const authController = new AuthController(
      jwtAuthService,
      authColdTenantPartnerService,
      {} as never,
      new SecurityEventsService(),
      undefined,
      undefined,
      identityRepository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      totpService,
      totpRepository,
    );

    // 1. Accept invitation with password via the formal acceptance endpoint.
    const acceptEnvelope =
      (await authController.acceptFleetStaffInvitationWithPassword({
        invitationToken: deliveredInvitations[0]!.rawToken,
        password: CORRECT_PASSWORD,
      })) as {
        data: {
          accepted: boolean;
          entrySlug: string;
          fleetPartnerId: string;
          principalId: string;
          membershipId: string;
          roleCode: string;
        };
      };
    expect(acceptEnvelope.data).toEqual({
      accepted: true,
      entrySlug,
      fleetPartnerId,
      principalId: issuedInvite.member.principalId,
      membershipId: issuedInvite.member.membershipId,
      roleCode: "fleet_partner_ops",
    });

    // No Google identity link was created or fabricated.
    expect(
      await linkRepository.findByDrtsPassengerId(
        entrySlug,
        issuedInvite.member.principalId,
      ),
    ).toBeNull();
    expect(mock.getLinkCount()).toBe(0);
    expect(mock.getPrincipal(issuedInvite.member.principalId)?.issuer).toBe(
      FLEET_INVITATION_ISSUER,
    );

    // 2. Log in with password via `POST /api/auth/partner/password-login` on the
    // cold-started TenantPartnerService instance. Also verify any browser-smuggled
    // loginMethod/amr claim in the body is ignored.
    const resolveEntriesSpy = vi.spyOn(
      authColdTenantPartnerService,
      "resolvePartnerEntries",
    );
    const loginEnvelope = (await authController.passwordLogin("partner", {
      email,
      password: CORRECT_PASSWORD,
      partnerId: entrySlug,
      ...({
        amr: ["pwd", "otp"],
        loginMethod: "google",
        mfa: true,
      } as Record<string, unknown>),
    })) as {
      data: {
        accessToken: string;
        partnerEntry: PartnerChannelEntryRecord;
        identity: {
          principalId?: string | null;
          membershipId?: string | null;
          partnerId?: string | null;
          partnerEntrySlug?: string | null;
          roles: string[];
          amr?: string[];
        };
      };
    };
    expect(resolveEntriesSpy).toHaveBeenCalledWith(entrySlug);
    expect(loginEnvelope.data.accessToken).toBeTruthy();
    expect(loginEnvelope.data.identity).toMatchObject({
      principalId: issuedInvite.member.principalId,
      membershipId: issuedInvite.member.membershipId,
      partnerId: fleetPartnerId,
      partnerEntrySlug: entrySlug,
      roles: ["fleet_partner_ops"],
      amr: ["pwd"],
    });

    // 3. Verify the token on a separate cold-started JwtAuthService +
    // TenantPartnerService instance (simulating another Cloud Run instance).
    const verifierColdTenantService = new TenantPartnerService(
      new AuditNotificationService(),
      tenantPartnerRepository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      identityRepository,
      identityRepository,
    );
    const verifierJwtService = new JwtAuthService(
      identityRepository,
      verifierColdTenantService,
      undefined,
      undefined,
      linkRepository,
    );
    const verifiedPayload = await verifierJwtService.verifyAccessToken(
      loginEnvelope.data.accessToken,
    );
    expect(verifiedPayload).not.toBeNull();
    expect(verifiedPayload).toMatchObject({
      realm: "partner",
      actorType: "partner_user",
      principalId: issuedInvite.member.principalId,
      membershipId: issuedInvite.member.membershipId,
      partnerId: fleetPartnerId,
      partnerEntrySlug: entrySlug,
      roles: ["fleet_partner_ops"],
      amr: ["pwd"],
      acr: "aal1",
    });

    // 4. Using the verified request identity, the member can read /api/auth/session,
    // list their active sessions (/api/auth/sessions), and enroll + confirm TOTP MFA.
    const verifiedIdentity = verifierJwtService.toRequestIdentity(
      verifiedPayload!,
    );
    const csrfHeaders = { "x-drts-csrf": "1" };

    expect(authController.getAuthSession(verifiedIdentity).data).toMatchObject({
      active: true,
      identity: {
        principalId: issuedInvite.member.principalId,
        membershipId: issuedInvite.member.membershipId,
        partnerId: fleetPartnerId,
        roles: ["fleet_partner_ops"],
      },
    });

    const sessionsBeforeMfa = (await authController.listSelfSessions(
      verifiedIdentity,
    )) as { data: Array<{ sessionId: string; isCurrent: boolean }> };
    expect(sessionsBeforeMfa.data).toHaveLength(1);
    expect(sessionsBeforeMfa.data[0]).toMatchObject({
      sessionId: verifiedIdentity.sessionId,
      isCurrent: true,
    });

    const enrollEnvelope = (await totpController.enroll(
      "partner",
      verifiedIdentity,
      csrfHeaders,
    )) as { data: { otpauthUri: string; secret: string } };
    expect(enrollEnvelope.data.secret).toBeTruthy();
    expect(enrollEnvelope.data.otpauthUri).toContain("otpauth://totp/");

    const nowStep = Math.floor(Date.now() / 1000 / 30);
    const confirmCode = await generate({
      secret: enrollEnvelope.data.secret,
      epoch: (nowStep - 1) * 30,
    });
    const confirmEnvelope = (await totpController.confirm(
      "partner",
      verifiedIdentity,
      { code: confirmCode },
      csrfHeaders,
    )) as { data: { recoveryCodes: string[] } };
    expect(confirmEnvelope.data.recoveryCodes).toHaveLength(10);

    // Session remains valid right after TOTP confirmation; member can log out.
    expect(
      await verifierJwtService.verifyAccessToken(
        loginEnvelope.data.accessToken,
      ),
    ).not.toBeNull();
    await authController.logout(
      verifiedIdentity,
      { reason: "self_logout" },
      { headers: csrfHeaders },
    );
    expect(
      await verifierJwtService.verifyAccessToken(
        loginEnvelope.data.accessToken,
      ),
    ).toBeNull();

    // 5. Re-login after TOTP confirmation requires the second factor, then
    // issues a durable `amr: ["pwd", "otp"]` session that can regenerate
    // recovery codes and manage sessions.
    await expectUniformDenial(
      authController.passwordLogin("partner", {
        email,
        password: CORRECT_PASSWORD,
        partnerId: entrySlug,
      }),
    );

    const loginTotpCode = await generate({
      secret: enrollEnvelope.data.secret,
      epoch: nowStep * 30,
    });
    const mfaLoginEnvelope = (await authController.passwordLogin("partner", {
      email,
      password: CORRECT_PASSWORD,
      partnerId: entrySlug,
      totpCode: loginTotpCode,
    })) as {
      data: {
        accessToken: string;
        identity: { amr?: string[] };
      };
    };
    expect(mfaLoginEnvelope.data.identity.amr).toEqual(["pwd", "otp"]);

    const verifiedMfaPayload = await verifierJwtService.verifyAccessToken(
      mfaLoginEnvelope.data.accessToken,
    );
    expect(verifiedMfaPayload).toMatchObject({
      principalId: issuedInvite.member.principalId,
      membershipId: issuedInvite.member.membershipId,
      amr: ["pwd", "otp"],
      acr: "aal1",
    });

    const mfaIdentity = verifierJwtService.toRequestIdentity(
      verifiedMfaPayload!,
    );
    const regenerated = (await totpController.regenerateRecoveryCodes(
      "partner",
      mfaIdentity,
      csrfHeaders,
    )) as { data: { recoveryCodes: string[] } };
    expect(regenerated.data.recoveryCodes).toHaveLength(10);

    // If the persisted password credential is removed, or the membership is
    // deactivated, or the principal is suspended, or the Fleet entry becomes
    // inactive, `verifyAccessToken` immediately rejects the session.
    mock.deletePasswordCredential(issuedInvite.member.principalId);
    expect(
      await verifierJwtService.verifyAccessToken(
        mfaLoginEnvelope.data.accessToken,
      ),
    ).toBeNull();

    // Restore credential, then deactivate membership via FleetPartnerService.
    const rehashed = await new PasswordHashingService().hash(CORRECT_PASSWORD);
    await identityRepository.setPasswordCredentialForPrincipal(
      issuedInvite.member.principalId,
      {
        passwordHash: rehashed.hash,
        passwordAlgo: rehashed.algo,
        pepperVersion: rehashed.pepperVersion,
      },
    );
    expect(
      await verifierJwtService.verifyAccessToken(
        mfaLoginEnvelope.data.accessToken,
      ),
    ).not.toBeNull();

    await fleetPartnerService.deactivateFleetStaffMember(
      fleetPartnerId,
      entrySlug,
      issuedInvite.member.membershipId,
      manager,
    );
    expect(
      await verifierJwtService.verifyAccessToken(
        mfaLoginEnvelope.data.accessToken,
      ),
    ).toBeNull();
  });

  it("preserves Google OIDC Fleet login binding, link disablement revocation, and #3356 same-member Google re-invitation after deactivation", async () => {
    const mock = createFleetDurableSessionPortMock();
    const entrySlug = `fleet-google-reinvite-${randomUUID()}`;
    const fleetPartnerId = `fleet-partner-google-${randomUUID()}`;
    mock.setFleetPartnerActive(fleetPartnerId, true);
    mock.seedPersistedFleetEntry({
      entrySlug,
      fleetPartnerId,
      updatedAt: "2026-11-23T01:30:00.000Z",
    });

    const identityRepository = new IdentityRepository(
      mock.databaseService as never,
    );
    const linkRepository = new PartnerUserIdentityLinkRepository(
      mock.databaseService as never,
    );
    const tenantPartnerRepository = new TenantPartnerRepository(
      mock.databaseService as never,
    );
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
      tenantPartnerRepository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      identityRepository,
      identityRepository,
    );
    await tenantPartnerService.resolvePartnerEntries(entrySlug);

    const deliveredTokens: string[] = [];
    const fleetPartnerService = new FleetPartnerService(
      undefined as never,
      undefined as never,
      undefined as never,
      {
        isEnabled: () => true,
        findActiveFleetPartnerById: async (id: string) =>
          id === fleetPartnerId ? { fleetPartnerId: id, active: true } : null,
      } as never,
      undefined,
      identityRepository,
      tenantPartnerService,
      linkRepository,
      {
        isEnabled: () => true,
        recordEventRequired: vi.fn(async () => undefined),
      } as never,
      {
        send: vi.fn(async (req: { rawToken: string }) => {
          deliveredTokens.push(req.rawToken);
          return {
            status: "sent" as const,
            attemptedAt: new Date().toISOString(),
          };
        }),
      } as never,
    );
    const jwtAuthService = new JwtAuthService(
      identityRepository,
      tenantPartnerService,
      undefined,
      undefined,
      linkRepository,
    );
    const oidcService = new OidcPkceService(
      jwtAuthService,
      tenantPartnerService,
      undefined,
      linkRepository,
      undefined,
      identityRepository,
    );

    const manager = {
      realm: "platform",
      actorType: "platform_admin",
      actorId: "manager-google-reinvite",
      principalId: "principal-manager-google-reinvite",
      scopes: ["foundation:write"],
      amr: [],
    } as never;

    // 1. Invite and accept via Google OIDC (default mock OIDC email is admin@acme.example).
    const email = "admin@acme.example";
    const oidcCode = "partner_fleet_google_reinvite_subject";
    const oidcSub = `sub_oidc_${createHash("sha256").update(oidcCode).digest("hex").slice(0, 12)}`;

    const firstInvite = await fleetPartnerService.inviteFleetStaff(
      fleetPartnerId,
      {
        entrySlug,
        email,
        roleCode: "fleet_partner_ops",
      },
      manager,
    );
    expect(deliveredTokens).toHaveLength(1);

    const inviteLoginState = oidcService.generateLoginParameters("partner", {
      partnerId: entrySlug,
      invitationToken: deliveredTokens[0]!,
    });
    const initialGoogleSession =
      await oidcService.exchangePartnerCallbackSession(
        {
          provider: "oidc",
          code: oidcCode,
          state: inviteLoginState.state,
          partnerId: entrySlug,
          callbackUrl: "http://localhost:3000/api/auth/callback",
        },
        { stateToken: inviteLoginState.stateToken },
      );
    expect(initialGoogleSession.identity).toMatchObject({
      principalId: firstInvite.member.principalId,
      membershipId: firstInvite.member.membershipId,
      partnerId: fleetPartnerId,
      partnerEntrySlug: entrySlug,
      roles: ["fleet_partner_ops"],
    });
    expect(
      await jwtAuthService.verifyAccessToken(initialGoogleSession.accessToken),
    ).not.toBeNull();

    // Disabling the Google identity link immediately invalidates the Google session.
    mock.setLinkStatus(entrySlug, oidcSub, "disabled");
    expect(
      await jwtAuthService.verifyAccessToken(initialGoogleSession.accessToken),
    ).toBeNull();
    mock.setLinkStatus(entrySlug, oidcSub, "active");
    expect(
      await jwtAuthService.verifyAccessToken(initialGoogleSession.accessToken),
    ).not.toBeNull();

    // 2. Deactivate the member and re-invite the same person (#3356).
    await fleetPartnerService.deactivateFleetStaffMember(
      fleetPartnerId,
      entrySlug,
      firstInvite.member.membershipId,
      manager,
    );
    expect(
      await jwtAuthService.verifyAccessToken(initialGoogleSession.accessToken),
    ).toBeNull();

    const reinvited = await fleetPartnerService.inviteFleetStaff(
      fleetPartnerId,
      {
        entrySlug,
        email,
        roleCode: "fleet_partner_finance",
      },
      manager,
    );
    expect(deliveredTokens).toHaveLength(2);
    expect(reinvited.member.principalId).toBe(firstInvite.member.principalId);
    expect(reinvited.member.membershipId).toBe(firstInvite.member.membershipId);

    // Direct ordinary Google login before re-verifying the fresh invitation is blocked.
    const prematureState = oidcService.generateLoginParameters("partner", {
      partnerId: entrySlug,
    });
    await expect(
      oidcService.exchangePartnerCallbackSession(
        {
          provider: "oidc",
          code: oidcCode,
          state: prematureState.state,
          partnerId: entrySlug,
          callbackUrl: "http://localhost:3000/api/auth/callback",
        },
        { stateToken: prematureState.stateToken },
      ),
    ).rejects.toMatchObject({ code: "IAM_PRINCIPAL_NOT_ACTIVE" });

    // A different Google sub with the same email is rejected without consuming the invitation.
    const wrongSubState = oidcService.generateLoginParameters("partner", {
      partnerId: entrySlug,
      invitationToken: deliveredTokens[1]!,
    });
    await expect(
      oidcService.exchangePartnerCallbackSession(
        {
          provider: "oidc",
          code: "partner_different_google_subject",
          state: wrongSubState.state,
          partnerId: entrySlug,
          callbackUrl: "http://localhost:3000/api/auth/callback",
        },
        { stateToken: wrongSubState.stateToken },
      ),
    ).rejects.toMatchObject({ code: "AUTH_SESSION_EXCHANGE_DENIED" });

    // Re-verifying with the original Google account succeeds, reuses the single
    // fleet_staff_invitation link, and issues a durable session with the new role.
    const reverifyState = oidcService.generateLoginParameters("partner", {
      partnerId: entrySlug,
      invitationToken: deliveredTokens[1]!,
    });
    const reverifiedSession = await oidcService.exchangePartnerCallbackSession(
      {
        provider: "oidc",
        code: oidcCode,
        state: reverifyState.state,
        partnerId: entrySlug,
        callbackUrl: "http://localhost:3000/api/auth/callback",
      },
      { stateToken: reverifyState.stateToken },
    );
    expect(reverifiedSession.identity).toMatchObject({
      principalId: firstInvite.member.principalId,
      membershipId: firstInvite.member.membershipId,
      partnerId: fleetPartnerId,
      partnerEntrySlug: entrySlug,
      roles: ["fleet_partner_finance"],
    });
    expect(mock.getLinkCount()).toBe(1);
    expect(
      await jwtAuthService.verifyAccessToken(reverifiedSession.accessToken),
    ).toMatchObject({
      principalId: firstInvite.member.principalId,
      membershipId: firstInvite.member.membershipId,
      roles: ["fleet_partner_finance"],
    });
  });
});

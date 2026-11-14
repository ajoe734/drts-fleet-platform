import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import type { CanonicalIdentityPrincipalRecord } from "@drts/contracts";
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
  it("rejects a partner realm request as unsupported before touching any account", async () => {
    const { controller } = createFixture();
    await expect(
      controller.passwordLogin("partner", {
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
});

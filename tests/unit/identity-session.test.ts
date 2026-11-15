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

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AgencyDirectoryRepository } from "../../apps/api/src/modules/agency-access/agency-directory.repository";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { TotpCredentialRepository } from "../../apps/api/src/modules/auth/totp-credential.repository";
import { TotpService } from "../../apps/api/src/modules/auth/totp.service";
import {
  hashIdentitySecret,
  IdentityRepository,
} from "../../apps/api/src/modules/identity/identity.repository";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";
import {
  TenantInvitationDeliveryService,
  type TenantInvitationDeliveryRequest,
} from "../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

describe("Identity session and refresh family repository (in-memory mode)", () => {
  it("creates, retrieves, and revokes sessions and associated refresh families", async () => {
    const repository = new IdentityRepository();

    const session = await repository.createSession({
      sessionId: "session_001",
      sourceRef: "session_source_001",
      principalId: "principal_001",
      membershipId: "membership_001",
      realm: "tenant",
      status: "active",
      authTime: "2026-08-01T12:00:00.000Z",
      authMethods: ["oidc_pkce"],
      tokenVersion: 1,
      idleExpiresAt: "2026-08-01T12:30:00.000Z",
      absoluteExpiresAt: "2026-08-01T20:00:00.000Z",
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: { ipPrefix: "192.168.1" },
      riskSummary: { riskLevel: "low" },
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    });

    expect(session.sessionId).toBe("session_001");

    const fetchedSession = await repository.getSession("session_001");
    expect(fetchedSession).not.toBeNull();
    expect(fetchedSession?.status).toBe("active");

    const family = await repository.createRefreshFamily({
      familyId: "family_001",
      sourceRef: "family_source_001",
      sessionId: "session_001",
      currentTokenHash: hashIdentitySecret("token_raw_1"),
      counter: 0,
      status: "active",
      expiresAt: "2026-08-31T12:00:00.000Z",
      compromisedAt: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    });

    expect(family.familyId).toBe("family_001");

    const revokedSession = await repository.revokeSession(
      "session_001",
      "USER_LOGOUT",
      "principal_001",
    );
    expect(revokedSession?.status).toBe("revoked");
    expect(revokedSession?.revokeReason).toBe("USER_LOGOUT");

    const fetchedFamily = await repository.getRefreshFamily("family_001");
    expect(fetchedFamily?.status).toBe("revoked");
  });

  // PWD-LOGIN-008 (SA/SD §8): a password(+TOTP) login calls
  // `JwtAuthService.issueSessionToken` into this same `createSession` path,
  // with `authMethods` set to `["pwd"]` or `["pwd", "otp"]` instead of an
  // OIDC provider's `amr`. The session row itself carries no login-method
  // branching, so a pwd+otp session must be created, fetched, and revoked
  // exactly like the `oidc_pkce`/`device_binding` sessions above.
  it("creates, retrieves, and revokes a password+TOTP (amr ['pwd','otp']) session identically to an OIDC-issued session", async () => {
    const repository = new IdentityRepository();

    const session = await repository.createSession({
      sessionId: "session_pwd_totp_001",
      sourceRef: "session_source_pwd_totp_001",
      principalId: "principal_pwd_totp_001",
      membershipId: "membership_pwd_totp_001",
      realm: "tenant",
      status: "active",
      authTime: "2026-11-14T12:00:00.000Z",
      authMethods: ["pwd", "otp"],
      tokenVersion: 1,
      idleExpiresAt: "2026-11-14T12:30:00.000Z",
      absoluteExpiresAt: "2026-11-14T20:00:00.000Z",
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: { ipPrefix: "10.0.0" },
      riskSummary: { riskLevel: "low" },
      createdAt: "2026-11-14T12:00:00.000Z",
      updatedAt: "2026-11-14T12:00:00.000Z",
    });

    expect(session.sessionId).toBe("session_pwd_totp_001");
    expect(session.authMethods).toEqual(["pwd", "otp"]);

    const fetchedSession = await repository.getSession("session_pwd_totp_001");
    expect(fetchedSession).not.toBeNull();
    expect(fetchedSession?.status).toBe("active");
    expect(fetchedSession?.authMethods).toEqual(["pwd", "otp"]);

    const revokedSession = await repository.revokeSession(
      "session_pwd_totp_001",
      "USER_LOGOUT",
      "principal_pwd_totp_001",
    );
    expect(revokedSession?.status).toBe("revoked");
    expect(revokedSession?.revokeReason).toBe("USER_LOGOUT");
  });

  it("consumes and rotates refresh tokens with hash-only persistence and detects token reuse", async () => {
    const repository = new IdentityRepository();

    const session = await repository.createSession({
      sessionId: "session_002",
      sourceRef: "session_source_002",
      principalId: "principal_002",
      membershipId: null,
      realm: "driver",
      status: "active",
      authTime: "2026-08-01T12:00:00.000Z",
      authMethods: ["device_binding"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {},
      riskSummary: {},
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    });

    const initialToken = "raw_refresh_token_v1";
    const initialHash = hashIdentitySecret(initialToken);

    await repository.createRefreshFamily({
      familyId: "family_002",
      sourceRef: "family_source_002",
      sessionId: session.sessionId,
      currentTokenHash: initialHash,
      counter: 0,
      status: "active",
      expiresAt: "2099-01-01T00:00:00.000Z",
      compromisedAt: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    });

    const newToken = "raw_refresh_token_v2";
    const rotateResult = await repository.consumeAndRotateRefreshToken({
      familyId: "family_002",
      oldTokenRaw: initialToken,
      newTokenRaw: newToken,
      newSessionTokenId: "jti_session_002_v2",
      newSessionTokenVersion: 2,
      newExpiresAt: "2099-01-02T00:00:00.000Z",
    });

    expect(rotateResult.success).toBe(true);
    expect(rotateResult.family?.counter).toBe(1);
    expect(rotateResult.family?.currentTokenHash).toBe(
      hashIdentitySecret(newToken),
    );
    expect(rotateResult.session?.currentTokenId).toBe("jti_session_002_v2");
    expect(rotateResult.session?.tokenVersion).toBe(2);

    // Verify token reuse attempt (re-presenting initialToken)
    const reuseResult = await repository.consumeAndRotateRefreshToken({
      oldTokenRaw: initialToken,
      newTokenRaw: "raw_refresh_token_v3",
      newSessionTokenId: "jti_session_002_v3",
      newSessionTokenVersion: 3,
      newExpiresAt: "2099-01-03T00:00:00.000Z",
    });

    expect(reuseResult.success).toBe(false);
    expect(reuseResult.reason).toBe("REUSE_DETECTED");
    expect(reuseResult.family?.status).toBe("compromised");
    expect(reuseResult.session?.status).toBe("compromised");
  });
});

// PWD-LOGIN-008 (SA/SD §7/§8): the block above proves the repository treats
// a hand-seeded `authMethods: ["pwd", "otp"]` row identically to an
// OIDC-issued one, but that is not integration proof that a real password
// login actually produces that row. These cases drive the real entry chain
// (`AuthController.passwordLogin` ->
// `resolvePasswordLoginAmr` -> `TotpService.verifyLoginCode`/
// `verifyRecoveryCode` -> `JwtAuthService.issueSessionToken` ->
// `IdentityRepository.createSession`) and read the resulting session back
// out of the same repository instance, never seeding it directly.
const PRIOR_ENV = { ...process.env };
const CORRECT_PASSWORD = "correct horse battery staple";
const TOTP_KEY_V1 = Buffer.alloc(32, "pwd-login-008-totp-key").toString(
  "base64",
);

beforeAll(() => {
  process.env.APP_ENV = "local";
  process.env.AUTH_MODE = "local";
  process.env.JWT_SECRET = "test_jwt_secret_key_32_characters_long_min!";
  process.env.PASSWORD_PEPPER_SECRETS_JSON = JSON.stringify({
    v1: "identity-session-test-pepper-value-32chars!",
  });
  process.env.PASSWORD_PEPPER_CURRENT_VERSION = "v1";
  process.env.TOTP_ENCRYPTION_KEYS_JSON = JSON.stringify({
    activeKeyId: "v1",
    keys: { v1: TOTP_KEY_V1 },
  });
});

afterAll(() => {
  process.env = { ...PRIOR_ENV };
});

afterEach(() => {
  vi.restoreAllMocks();
});

class CapturingInvitationDelivery extends TenantInvitationDeliveryService {
  readonly tokens = new Map<string, string>();

  override async send(request: TenantInvitationDeliveryRequest) {
    this.tokens.set(request.invitationId, request.rawToken);
    return super.send(request);
  }
}

function createLoginFixture() {
  const identityRepository = new IdentityRepository();
  const agencyDirectoryRepository = new AgencyDirectoryRepository();
  const securityEventsService = new SecurityEventsService();
  const totpCredentialRepository = new TotpCredentialRepository();
  const totpService = new TotpService(totpCredentialRepository);
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
    totpService,
    totpCredentialRepository,
  );
  return {
    identityRepository,
    securityEventsService,
    tenantPartnerService,
    delivery,
    totpService,
    controller,
  };
}

async function createActiveTenantPasswordUser(
  fixture: ReturnType<typeof createLoginFixture>,
  options: { tenantId: string; email: string },
) {
  await fixture.tenantPartnerService.createTenantUser(options.tenantId, {
    email: options.email,
    displayName: "Identity Session Fixture",
    roleCode: "tenant_viewer",
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
    password: CORRECT_PASSWORD,
  });
  const principal = fixture.identityRepository
    .listPrincipals()
    .find(
      (candidate) =>
        candidate.email?.toLowerCase() === options.email.toLowerCase(),
    )!;
  return { principal };
}

async function enrollAndConfirmTotp(
  totpService: TotpService,
  principalId: string,
): Promise<{ secret: string; recoveryCodes: string[] }> {
  const enrollment = await totpService.enroll(
    principalId,
    "tenant:identity-session-fixture",
  );
  const confirmCode = await generate({ secret: enrollment.secret });
  const confirmation = await totpService.confirm(principalId, confirmCode);
  return {
    secret: enrollment.secret,
    recoveryCodes: confirmation.recoveryCodes,
  };
}

/** Advances past the step `confirm()` already consumed so the next
 * generated code lands on a fresh, unused 30s step. */
async function freshLoginCode(secret: string): Promise<string> {
  const nextStepEpoch = (Math.floor(Date.now() / 30_000) + 1) * 30;
  return generate({ secret, epoch: nextStepEpoch });
}

type PasswordLoginEnvelope = {
  data: {
    accessToken: string;
    identity: { amr?: string[]; sessionId?: string };
  };
};

async function expectDenied(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(ApiRequestError);
  try {
    await promise;
    throw new Error("expected the password login attempt to be denied");
  } catch (error) {
    expect((error as ApiRequestError).getStatus()).toBe(401);
  }
}

describe("Password(+TOTP) login issues the session through the real entry chain (PWD-LOGIN-008)", () => {
  it("issues a pwd-only session when the principal has never enrolled TOTP", async () => {
    const fixture = createLoginFixture();
    const tenantId = "tenant-pwd008-no-totp";
    const { principal } = await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "no-totp@example.com",
    });

    const envelope = (await fixture.controller.passwordLogin("tenant", {
      email: "no-totp@example.com",
      password: CORRECT_PASSWORD,
      tenantId,
    })) as PasswordLoginEnvelope;

    expect(envelope.data.identity.amr).toEqual(["pwd"]);
    const sessionId = envelope.data.identity.sessionId!;
    const stored = await fixture.identityRepository.getSession(sessionId);
    expect(stored?.authMethods).toEqual(["pwd"]);
    expect(stored?.principalId).toBe(principal.principalId);

    const revoked = await fixture.identityRepository.revokeSession(
      sessionId,
      "USER_LOGOUT",
      principal.principalId,
    );
    expect(revoked?.status).toBe("revoked");
  });

  it("issues a pwd+otp session when a valid TOTP code is presented", async () => {
    const fixture = createLoginFixture();
    const tenantId = "tenant-pwd008-totp-valid";
    const { principal } = await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "totp-valid@example.com",
    });
    const { secret } = await enrollAndConfirmTotp(
      fixture.totpService,
      principal.principalId,
    );
    const totpCode = await freshLoginCode(secret);

    const envelope = (await fixture.controller.passwordLogin("tenant", {
      email: "totp-valid@example.com",
      password: CORRECT_PASSWORD,
      tenantId,
      totpCode,
    })) as PasswordLoginEnvelope;

    expect(envelope.data.identity.amr).toEqual(["pwd", "otp"]);
    const sessionId = envelope.data.identity.sessionId!;
    const stored = await fixture.identityRepository.getSession(sessionId);
    expect(stored?.authMethods).toEqual(["pwd", "otp"]);

    const verifiedEvents = await fixture.securityEventsService.listEvents(
      null,
      { eventType: "totp.verified", actorId: principal.principalId },
    );
    expect(verifiedEvents).toHaveLength(1);
    expect(verifiedEvents[0]?.outcome).toBe("success");
  });

  it("denies login when a confirmed credential exists but no TOTP/recovery code is presented", async () => {
    const fixture = createLoginFixture();
    const tenantId = "tenant-pwd008-totp-missing";
    const { principal } = await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "totp-missing@example.com",
    });
    await enrollAndConfirmTotp(fixture.totpService, principal.principalId);

    await expectDenied(
      fixture.controller.passwordLogin("tenant", {
        email: "totp-missing@example.com",
        password: CORRECT_PASSWORD,
        tenantId,
      }),
    );

    const deniedEvents = await fixture.securityEventsService.listEvents(null, {
      eventType: "totp.denied",
      actorId: principal.principalId,
    });
    expect(deniedEvents).toHaveLength(0);
  });

  it("denies login with an invalid TOTP code and records totp.denied", async () => {
    const fixture = createLoginFixture();
    const tenantId = "tenant-pwd008-totp-invalid";
    const { principal } = await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "totp-invalid@example.com",
    });
    await enrollAndConfirmTotp(fixture.totpService, principal.principalId);

    await expectDenied(
      fixture.controller.passwordLogin("tenant", {
        email: "totp-invalid@example.com",
        password: CORRECT_PASSWORD,
        tenantId,
        totpCode: "000000",
      }),
    );

    const deniedEvents = await fixture.securityEventsService.listEvents(null, {
      eventType: "totp.denied",
      actorId: principal.principalId,
    });
    expect(deniedEvents).toHaveLength(1);
    expect(deniedEvents[0]?.reasonCode).toBe("TOTP_INVALID_CODE");
  });

  it("denies login when a valid TOTP code is replayed and records totp.denied", async () => {
    const fixture = createLoginFixture();
    const tenantId = "tenant-pwd008-totp-replay";
    const { principal } = await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "totp-replay@example.com",
    });
    const { secret } = await enrollAndConfirmTotp(
      fixture.totpService,
      principal.principalId,
    );
    const totpCode = await freshLoginCode(secret);

    const firstAttempt = (await fixture.controller.passwordLogin("tenant", {
      email: "totp-replay@example.com",
      password: CORRECT_PASSWORD,
      tenantId,
      totpCode,
    })) as PasswordLoginEnvelope;
    expect(firstAttempt.data.identity.amr).toEqual(["pwd", "otp"]);

    await expectDenied(
      fixture.controller.passwordLogin("tenant", {
        email: "totp-replay@example.com",
        password: CORRECT_PASSWORD,
        tenantId,
        totpCode,
      }),
    );

    const deniedEvents = await fixture.securityEventsService.listEvents(null, {
      eventType: "totp.denied",
      actorId: principal.principalId,
    });
    expect(deniedEvents).toHaveLength(1);
    expect(deniedEvents[0]?.reasonCode).toBe("TOTP_CODE_REPLAYED");
  });

  it("issues a pwd+otp session and records totp.recovery_used when a valid recovery code is presented", async () => {
    const fixture = createLoginFixture();
    const tenantId = "tenant-pwd008-recovery-valid";
    const { principal } = await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "recovery-valid@example.com",
    });
    const { recoveryCodes } = await enrollAndConfirmTotp(
      fixture.totpService,
      principal.principalId,
    );
    const recoveryCode = recoveryCodes[0];
    if (!recoveryCode) {
      throw new Error("Expected a real recovery code from TOTP confirmation");
    }

    const envelope = (await fixture.controller.passwordLogin("tenant", {
      email: "recovery-valid@example.com",
      password: CORRECT_PASSWORD,
      tenantId,
      recoveryCode,
    })) as PasswordLoginEnvelope;

    expect(envelope.data.identity.amr).toEqual(["pwd", "otp"]);
    const sessionId = envelope.data.identity.sessionId!;
    const stored = await fixture.identityRepository.getSession(sessionId);
    expect(stored?.authMethods).toEqual(["pwd", "otp"]);

    const recoveryEvents = await fixture.securityEventsService.listEvents(
      null,
      { eventType: "totp.recovery_used", actorId: principal.principalId },
    );
    expect(recoveryEvents).toHaveLength(1);
    expect(recoveryEvents[0]?.outcome).toBe("success");
  });

  it("denies login with an invalid recovery code and records totp.denied", async () => {
    const fixture = createLoginFixture();
    const tenantId = "tenant-pwd008-recovery-invalid";
    const { principal } = await createActiveTenantPasswordUser(fixture, {
      tenantId,
      email: "recovery-invalid@example.com",
    });
    await enrollAndConfirmTotp(fixture.totpService, principal.principalId);

    await expectDenied(
      fixture.controller.passwordLogin("tenant", {
        email: "recovery-invalid@example.com",
        password: CORRECT_PASSWORD,
        tenantId,
        recoveryCode: "NOPE-NOPE-NOPE-NOPE",
      }),
    );

    const deniedEvents = await fixture.securityEventsService.listEvents(null, {
      eventType: "totp.denied",
      actorId: principal.principalId,
    });
    expect(deniedEvents).toHaveLength(1);
    expect(deniedEvents[0]?.reasonCode).toBe("TOTP_RECOVERY_CODE_INVALID");
  });
});

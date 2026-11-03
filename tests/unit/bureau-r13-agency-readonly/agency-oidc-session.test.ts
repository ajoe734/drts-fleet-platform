import { createHash, generateKeyPairSync } from "node:crypto";
import * as jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { AgencyDirectoryRepository } from "../../../apps/api/src/modules/agency-access/agency-directory.repository";
import { OidcPkceService } from "../../../apps/api/src/modules/auth/oidc-pkce.service";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { SecurityEventsService } from "../../../apps/api/src/modules/security-events/security-events.service";

// BUREAU-R13 §3: agency Google OIDC PKCE login through the formal
// OidcPkceService, IdentityRepository and JwtAuthService. Only the Google
// token/JWKS HTTP boundary is mocked (global fetch); ID tokens are real RS256.
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const issuer = "https://accounts.google.com";
const clientId = "123-agency-test.apps.googleusercontent.com";
const invitedEmail = "inspector@agency.example";
const redirectUri = "https://agency.example/api/auth/agency/callback";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

async function fixture() {
  const repo = new IdentityRepository();
  const directory = new AgencyDirectoryRepository();
  const now = new Date().toISOString();
  for (const [agencyId, agencyCode] of [
    ["agency_a", "TEST-A"],
    ["agency_b", "TEST-B"],
  ] as const) {
    await directory.create({
      agencyId,
      agencyCode,
      displayName: `Test agency ${agencyCode}`,
      status: "active",
      createdByPrincipalId: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  const invite = async (
    agencyId: string,
    rawToken: string,
    options: { email?: string; roleCode?: string; validTo?: string } = {},
  ) =>
    repo.issueAgencyInvitation({
      agencyId,
      email: options.email ?? invitedEmail,
      roleCode: options.roleCode ?? "agency_viewer",
      accessValidTo:
        options.validTo ??
        new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      tokenHash: hash(rawToken),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      issuerPrincipalId: null,
    });
  const security = new SecurityEventsService();
  const requiredEvents = vi.spyOn(security, "recordEventRequired");
  const events = vi.spyOn(security, "recordEvent");
  const signer = new JwtAuthService(repo, undefined, undefined, directory);
  const oidc = new OidcPkceService(
    signer,
    {} as never,
    security,
    undefined,
    undefined,
    repo,
    directory,
  );
  const sign = (nonce: string | undefined, claims: Record<string, unknown>) =>
    jwt.sign(
      {
        sub: "google-agency-user",
        email: invitedEmail,
        email_verified: true,
        nonce,
        ...claims,
      },
      key.privateKey,
      {
        algorithm: "RS256",
        keyid: "key",
        issuer,
        audience: clientId,
        expiresIn: "5m",
      },
    );
  const mockGoogle = (idToken: string) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/token")) return Response.json({ id_token: idToken });
        return Response.json({
          keys: [
            {
              ...key.publicKey.export({ format: "jwk" }),
              kid: "key",
              alg: "RS256",
              use: "sig",
            },
          ],
        });
      }),
    );
  async function login(
    options: {
      invitationToken?: string;
      agencyId?: string;
      claims?: Record<string, unknown>;
      stateRealm?: "agency" | "tenant";
    } = {},
  ) {
    const params = oidc.generateLoginParameters(
      options.stateRealm ?? "agency",
      {
        redirectUri,
        ...(options.invitationToken
          ? { invitationToken: options.invitationToken }
          : {}),
        ...(options.agencyId ? { agencyId: options.agencyId } : {}),
      },
    );
    const state = oidc.verifyStateToken(params.stateToken)!;
    mockGoogle(sign(state.nonce, options.claims ?? {}));
    return oidc.exchangeAgencyCallbackSession(
      {
        provider: "oidc",
        code: "google-code",
        state: params.state,
        callbackUrl: redirectUri,
      },
      { stateToken: params.stateToken },
    );
  }
  return {
    repo,
    directory,
    signer,
    oidc,
    invite,
    login,
    requiredEvents,
    events,
  };
}

describe("BUREAU-R13 agency OIDC session exchange", () => {
  beforeEach(() => {
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("OIDC_MOCK_MODE", "false");
    vi.stubEnv("OIDC_ISSUER", issuer);
    vi.stubEnv("OIDC_CLIENT_ID", clientId);
    vi.stubEnv("JWT_SECRET", "test-session-secret-32-characters-long");
    vi.stubEnv("JWT_ISSUER", "https://drts-session.example");
    vi.stubEnv("AUTH_ALLOWED_ORIGINS", "https://agency.example");
    vi.stubEnv("DRTS_DEV_MFA_WAIVED", "false");
    vi.stubEnv("AUTH_REQUIRE_ORDINARY_LOGIN_MFA", "false");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("denies an unbound Google subject even when its email was invited", async () => {
    const f = await fixture();
    await f.invite("agency_a", "ai_token_unbound");
    await expect(f.login()).rejects.toMatchObject({
      code: "AUTH_SESSION_EXCHANGE_DENIED",
    });
    expect(f.events).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "agency_oidc_session.denied",
        reasonCode: "USER_NOT_FOUND",
        realm: "agency",
      }),
    );
  });

  it("binds the invitation once, issues an agency session and then logs in by (issuer, sub)", async () => {
    const f = await fixture();
    await f.invite("agency_a", "ai_token_ok", { roleCode: "agency_exporter" });
    const session = await f.login({ invitationToken: "ai_token_ok" });

    expect(session.identity).toMatchObject({
      actorType: "agency_user",
      realm: "agency",
      agencyId: "agency_a",
      tenantId: null,
      roles: ["agency_exporter"],
    });
    expect(session.identity.scopes).toContain("agency:trip_records:export");
    expect(session.agency).toEqual({
      agencyId: "agency_a",
      displayName: "Test agency TEST-A",
    });
    const payload = await f.signer.verifyAccessToken(session.accessToken);
    expect(payload).toMatchObject({ realm: "agency", agencyId: "agency_a" });
    expect(
      f.repo.listPrincipals().find((principal) => principal.issuer === issuer)
        ?.subject,
    ).toBe("google-agency-user");

    // The proof is one-time; ordinary login then binds strictly by sub.
    await expect(
      f.login({ invitationToken: "ai_token_ok" }),
    ).rejects.toMatchObject({ code: "AUTH_SESSION_EXCHANGE_DENIED" });
    await expect(f.login()).resolves.toMatchObject({
      identity: { agencyId: "agency_a" },
    });
    // Same email, different Google subject: never logged in by email.
    await expect(
      f.login({ claims: { sub: "other-google-subject" } }),
    ).rejects.toMatchObject({ code: "AUTH_SESSION_EXCHANGE_DENIED" });
  });

  it("wrong email, unverified email and a wrong agency in state do not consume the invitation", async () => {
    const f = await fixture();
    await f.invite("agency_a", "ai_token_keep");
    await expect(
      f.login({
        invitationToken: "ai_token_keep",
        claims: { email: "someone-else@agency.example" },
      }),
    ).rejects.toBeDefined();
    await expect(
      f.login({
        invitationToken: "ai_token_keep",
        claims: { email_verified: false },
      }),
    ).rejects.toBeDefined();
    await expect(
      f.login({ invitationToken: "ai_token_keep", agencyId: "agency_b" }),
    ).rejects.toBeDefined();
    expect(
      f.repo
        .listInvitations()
        .find((invitation) => invitation.tokenHash === hash("ai_token_keep"))
        ?.acceptedAt,
    ).toBeNull();
    await expect(
      f.login({ invitationToken: "ai_token_keep" }),
    ).resolves.toMatchObject({ identity: { agencyId: "agency_a" } });
  });

  it("a tenant-realm state can never be exchanged for an agency session", async () => {
    const f = await fixture();
    await f.invite("agency_a", "ai_token_realm");
    await expect(
      f.login({ invitationToken: "ai_token_realm", stateRealm: "tenant" }),
    ).rejects.toMatchObject({ code: "AUTH_SESSION_EXCHANGE_DENIED" });
    expect(
      f.repo
        .listInvitations()
        .find((invitation) => invitation.tokenHash === hash("ai_token_realm"))
        ?.acceptedAt,
    ).toBeNull();
  });

  it("denies a revoked invitation and an invitation of a suspended agency", async () => {
    const f = await fixture();
    const issued = await f.invite("agency_a", "ai_token_revoked");
    await f.repo.revokeAgencyInvitation(
      "agency_a",
      issued!.invitation.invitationId,
    );
    await expect(
      f.login({ invitationToken: "ai_token_revoked" }),
    ).rejects.toMatchObject({ code: "AUTH_SESSION_EXCHANGE_DENIED" });

    await f.invite("agency_b", "ai_token_suspended", {
      email: "second@agency.example",
    });
    await f.directory.update("agency_b", { status: "suspended" });
    await expect(
      f.login({
        invitationToken: "ai_token_suspended",
        claims: { sub: "second-subject", email: "second@agency.example" },
      }),
    ).rejects.toMatchObject({ code: "AUTH_SESSION_EXCHANGE_DENIED" });
    expect(
      f.repo
        .listInvitations()
        .find(
          (invitation) => invitation.tokenHash === hash("ai_token_suspended"),
        )?.acceptedAt,
    ).toBeNull();
  });

  it("an (issuer, sub) bound to one agency cannot accept a second agency's invitation", async () => {
    const f = await fixture();
    await f.invite("agency_a", "ai_token_first");
    await f.login({ invitationToken: "ai_token_first" });
    await f.invite("agency_b", "ai_token_second");
    await expect(
      f.login({ invitationToken: "ai_token_second" }),
    ).rejects.toMatchObject({ code: "AUTH_SESSION_EXCHANGE_DENIED" });
    expect(
      f.repo
        .listInvitations()
        .find((invitation) => invitation.tokenHash === hash("ai_token_second"))
        ?.acceptedAt,
    ).toBeNull();
  });

  it("applies the shared ordinary-login MFA policy and records the dev waiver as a required security event", async () => {
    vi.stubEnv("AUTH_REQUIRE_ORDINARY_LOGIN_MFA", "true");
    const f = await fixture();
    await f.invite("agency_a", "ai_token_mfa");
    await expect(
      f.login({ invitationToken: "ai_token_mfa", claims: { amr: ["pwd"] } }),
    ).rejects.toMatchObject({ code: "AUTH_SESSION_EXCHANGE_DENIED" });
    expect(f.events).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "agency_oidc_session.denied",
        reasonCode: "IAM_MFA_REQUIRED",
      }),
    );

    // A trusted amr satisfies the same policy.
    await expect(f.login({ claims: { amr: ["mfa"] } })).resolves.toMatchObject({
      identity: { agencyId: "agency_a" },
    });

    vi.stubEnv("DRTS_DEV_MFA_WAIVED", "true");
    await expect(f.login({ claims: { amr: ["pwd"] } })).resolves.toMatchObject({
      identity: { agencyId: "agency_a" },
    });
    expect(f.requiredEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "agency_oidc_session.mfa_waived",
        reasonCode: "DEV_MFA_WAIVED",
        realm: "agency",
        actorType: "agency_user",
      }),
    );
  });

  it("refuses the dev MFA waiver outside development", async () => {
    const f = await fixture();
    await f.invite("agency_a", "ai_token_prod");
    vi.stubEnv("DRTS_DEV_MFA_WAIVED", "true");
    vi.stubEnv("DRTS_ENV", "production");
    vi.stubEnv("AUTH_ALLOWED_ORIGINS", "https://agency.example");
    await expect(
      f.login({ invitationToken: "ai_token_prod" }),
    ).rejects.toMatchObject({ code: "AUTH_CONFIGURATION_INVALID" });
  });
});

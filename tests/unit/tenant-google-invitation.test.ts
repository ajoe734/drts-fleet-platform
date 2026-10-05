import { createHash, generateKeyPairSync } from "node:crypto";
import * as jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import {
  TenantInvitationDeliveryService,
  type TenantInvitationDeliveryRequest,
} from "../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import { OidcPkceService } from "../../apps/api/src/modules/auth/oidc-pkce.service";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";

const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const issuer = "https://accounts.google.com";
const email = "external@example.org";
const tenantId = "tenant-google-test";
const clientId = "123-test.apps.googleusercontent.com";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
class CaptureDelivery extends TenantInvitationDeliveryService {
  token = "";
  override async send(request: TenantInvitationDeliveryRequest) {
    this.token = request.rawToken;
    return super.send(request);
  }
}

async function fixture() {
  const repo = new IdentityRepository();
  const delivery = new CaptureDelivery();
  const tenant = new TenantPartnerService(
    new AuditNotificationService(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    repo,
    repo,
    delivery,
  );
  const user = await tenant.createTenantUser(tenantId, {
    email,
    displayName: "External",
    roleCode: "tenant_viewer",
  });
  const security = new SecurityEventsService();
  const events = vi.spyOn(security, "recordEvent");
  const signer = new JwtAuthService(repo, tenant);
  const oidc = new OidcPkceService(signer, tenant, security);
  const controller = new AuthController(
    signer,
    tenant,
    {} as never,
    security,
    undefined,
    undefined,
    repo,
    oidc,
  );
  const sign = (nonce?: string, overrides = {}) =>
    jwt.sign(
      { sub: "google-user", email, email_verified: true, nonce, ...overrides },
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
  async function callback(
    invitationToken?: string,
    claims = {},
    scope = tenantId,
  ) {
    const login = oidc.generateLoginParameters("tenant", {
      redirectUri: "https://tenant.example/api/auth/tenant/callback",
      tenantId: scope,
      ...(invitationToken ? { invitationToken } : {}),
    });
    const state = oidc.verifyStateToken(login.stateToken)!;
    mockGoogle(sign(state.nonce, claims));
    return oidc.exchangeTenantCallbackSession(
      {
        provider: "oidc",
        code: "google-code",
        state: login.state,
        callbackUrl: state.redirectUri!,
      },
      { stateToken: login.stateToken },
    );
  }
  return {
    repo,
    tenant,
    delivery,
    user,
    oidc,
    controller,
    signer,
    events,
    sign,
    mockGoogle,
    callback,
  };
}

describe("Google invitation binding and shared tenant authorization", () => {
  beforeEach(() => {
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("OIDC_MOCK_MODE", "false");
    vi.stubEnv("OIDC_ISSUER", issuer);
    vi.stubEnv("OIDC_CLIENT_ID", clientId);
    vi.stubEnv("TENANT_OIDC_ISSUER", "");
    vi.stubEnv("TENANT_OIDC_AUDIENCE", "");
    vi.stubEnv("JWT_SECRET", "test-session-secret-32-characters-long");
    vi.stubEnv("JWT_ISSUER", "https://drts-session.example");
    vi.stubEnv("AUTH_ALLOWED_ORIGINS", "https://tenant.example");
    vi.stubEnv("DRTS_DEV_MFA_WAIVED", "false");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("denies an unbound sub even for the invited email, then binds once through PKCE", async () => {
    const f = await fixture();
    await expect(f.callback()).rejects.toThrow();
    const session = await f.callback(f.delivery.token);
    expect(session.profile.id).toBe(f.user.userId);
    expect(session.identity.tenantId).toBe(tenantId);
    const decoded = jwt.decode(session.accessToken) as jwt.JwtPayload;
    expect(decoded.amr).toEqual([]);
    expect(decoded.acr).toBe("");
    expect(await f.signer.verifyAccessToken(session.accessToken)).not.toBeNull();
    await f.signer.revokeCurrentSession(decoded.sid as string);
    expect(await f.signer.verifyAccessToken(session.accessToken)).toBeNull();
    expect(
      f.repo.listPrincipals().find((p) => p.issuer === issuer)?.subject,
    ).toBe("google-user");
    await expect(f.callback(f.delivery.token)).rejects.toThrow();
    await expect(f.callback()).resolves.toMatchObject({
      profile: { id: f.user.userId },
    });
    // The legacy endpoint uses exactly the same verifier and binding checks.
    f.mockGoogle(f.sign());
    await expect(
      f.controller.issueTenantOidcSession({ idToken: f.sign(), tenantId }),
    ).resolves.toMatchObject({ data: { profile: { id: f.user.userId } } });
    await expect(
      f.controller.issueTenantOidcSession({
        idToken: f.sign(undefined, { sub: "unbound-same-email" }),
        tenantId,
      }),
    ).rejects.toThrow();
  });

  it("wrong account, unverified email and wrong tenant do not consume an invitation", async () => {
    const f = await fixture();
    await expect(
      f.callback(f.delivery.token, { email: "other@example.org" }),
    ).rejects.toThrow();
    await expect(
      f.callback(f.delivery.token, { email_verified: false }),
    ).rejects.toThrow();
    await expect(
      f.callback(f.delivery.token, {}, "other-tenant"),
    ).rejects.toThrow();
    expect(
      f.repo
        .listInvitations()
        .find((i) => i.tokenHash === hash(f.delivery.token))?.acceptedAt,
    ).toBeNull();
    await expect(f.callback(f.delivery.token)).resolves.toMatchObject({
      profile: { email },
    });
    await expect(f.callback(undefined, {}, "other-tenant")).rejects.toThrow();
    await expect(
      f.tenant.findTenantUserByOidcIdentity({
        issuer: "https://other-idp.example",
        subject: "google-user",
        email,
        tenantId,
      }),
    ).resolves.toBeNull();
  });

  it("rejects legacy code-only acceptance and revoked/expired invitations", async () => {
    const f = await fixture();
    await expect(
      f.tenant.acceptTenantInvitation({ invitationToken: f.delivery.token }),
    ).rejects.toThrow();
    const invitation = f.repo
      .listInvitations()
      .find((i) => i.tokenHash === hash(f.delivery.token))!;
    await f.repo.upsertInvitationRecord({
      ...invitation,
      expiresAt: new Date(0).toISOString(),
    });
    await expect(f.callback(f.delivery.token)).rejects.toThrow();
    await f.repo.upsertInvitationRecord({
      ...invitation,
      revokedAt: new Date().toISOString(),
    });
    await expect(f.callback(f.delivery.token)).rejects.toThrow();
  });

  it("allows exactly one concurrent acceptance and never rebinds the user", async () => {
    const f = await fixture();
    const proof = { issuer, subject: "google-user", email, tenantId };
    const results = await Promise.all([
      f.repo.acceptTenantOidcInvitation(hash(f.delivery.token), proof),
      f.repo.acceptTenantOidcInvitation(hash(f.delivery.token), {
        ...proof,
        subject: "other-sub",
      }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await f.repo.findTenantUserByOidcSubject(proof)).toMatchObject({
      subjectId: "google-user",
    });
  });

  it("requires an explicit audited dev waiver for an admin without MFA", async () => {
    const f = await fixture();
    const session = await f.callback(f.delivery.token);
    const bound = await f.repo.findTenantUserByOidcSubject({
      issuer,
      subject: "google-user",
      tenantId,
    });
    await f.repo.syncLegacyTenantUserRole({
      ...bound!,
      roleCode: "tenant_admin",
    });
    await expect(f.callback()).rejects.toThrow();
    vi.stubEnv("DRTS_DEV_MFA_WAIVED", "true");
    const admin = await f.callback();
    expect((jwt.decode(admin.accessToken) as jwt.JwtPayload).amr).toEqual([]);
    expect(f.events).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "tenant_oidc_session.mfa_waived",
        reasonCode: "DEV_MFA_WAIVED",
      }),
    );
    expect(session.profile.roleCode).toBe("tenant_viewer");
  });

  it.each(["staging", "production"])(
    "rejects the dev waiver in %s",
    async (environment) => {
      const f = await fixture();
      await f.callback(f.delivery.token);
      vi.stubEnv("DRTS_ENV", environment);
      vi.stubEnv("DRTS_DEV_MFA_WAIVED", "true");
      await expect(f.callback()).rejects.toThrow();
      f.mockGoogle(f.sign());
      await expect(
        f.controller.issueTenantOidcSession({ idToken: f.sign(), tenantId }),
      ).rejects.toThrow();
    },
  );
});

import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { OidcPkceService } from "../../apps/api/src/modules/auth/oidc-pkce.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { PartnerUserIdentityLinkRepository } from "../../apps/api/src/modules/tenant-partner/partner-user-identity-link.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

describe("IAM-OP-OIDC-001 strict OIDC negative controls", () => {
  const originalEnv = { ...process.env };
  let oidcService: OidcPkceService;

  beforeEach(() => {
    process.env = { ...originalEnv };
    oidcService = new OidcPkceService(
      new JwtAuthService(),
      new TenantPartnerService(new AuditNotificationService()),
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("never falls back to synthetic exchange in a strict environment", async () => {
    process.env.DRTS_ENV = "staging";
    process.env.OIDC_MOCK_MODE = "false";
    delete process.env.OIDC_TOKEN_ENDPOINT;
    delete process.env.OIDC_ISSUER;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      (oidcService as any).performOidcCodeExchange({ code: "synthetic-code" }),
    ).rejects.toMatchObject({ code: "AUTH_SESSION_EXCHANGE_DENIED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("permits synthetic exchange only with explicit mock mode in local or test", async () => {
    process.env.DRTS_ENV = "test";
    process.env.OIDC_MOCK_MODE = "true";
    process.env.OIDC_ISSUER = "https://oidc.test.drts.internal";
    process.env.OIDC_CLIENT_ID = "drts-test-client";
    delete process.env.OIDC_TOKEN_ENDPOINT;

    await expect(
      (oidcService as any).performOidcCodeExchange({ code: "synthetic-code" }),
    ).resolves.toMatchObject({
      iss: "https://oidc.test.drts.internal",
      aud: "drts-test-client",
    });
  });

  it("does not log provider response bodies that may contain token material", async () => {
    const leakedToken = "access_token=should-never-appear";
    const errorSpy = vi.spyOn((oidcService as any).logger, "error");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(leakedToken, { status: 500 }),
    );

    await expect(
      oidcService.exchangeRealOidcTokenEndpoint(
        {
          provider: "oidc",
          code: "authorization-code",
          callbackUrl: "https://app.drts.internal/callback",
          state: "test-state",
        },
        null,
        "https://oidc.drts.internal/token",
      ),
    ).rejects.toMatchObject({ code: "AUTH_SESSION_EXCHANGE_DENIED" });

    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(leakedToken);
  });
});

describe("PWD-LOGIN-005 strict password-login negative controls", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.APP_ENV = "local";
    process.env.AUTH_MODE = "local";
    process.env.JWT_SECRET = "test_jwt_secret_key_32_characters_long_min!";
    // Deliberately no PASSWORD_PEPPER_SECRETS_JSON / _CURRENT_VERSION: the
    // negative control this suite exists for is that an unconfigured pepper
    // must fail every password-login attempt closed (503), never silently
    // skip the pepper step and compare against an unpeppered hash (SA/SD §2,
    // Stage 1.5 §15.2's "all-or-nothing" startup rule).
    delete process.env.PASSWORD_PEPPER_SECRETS_JSON;
    delete process.env.PASSWORD_PEPPER_CURRENT_VERSION;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("fails closed, not open, when no password pepper is configured", async () => {
    const identityRepository = new IdentityRepository();
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const controller = new AuthController(
      new JwtAuthService(identityRepository, tenantPartnerService),
      tenantPartnerService,
      {} as never,
      undefined,
      undefined,
      undefined,
      identityRepository,
    );

    await expect(
      controller.passwordLogin("tenant", {
        email: "anyone@example.com",
        password: "whatever-the-attacker-sends",
        tenantId: "tenant-strict-negative",
      }),
    ).rejects.toMatchObject({
      code: "PASSWORD_LOGIN_UNAVAILABLE",
    });
  });

  it("answers account-not-found the same way across tenant, agency and partner", async () => {
    const identityRepository = new IdentityRepository();
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    process.env.PASSWORD_PEPPER_SECRETS_JSON = JSON.stringify({
      v1: "iam-oidc-strict-negative-test-pepper-32ch!",
    });
    process.env.PASSWORD_PEPPER_CURRENT_VERSION = "v1";
    const controller = new AuthController(
      new JwtAuthService(identityRepository, tenantPartnerService),
      tenantPartnerService,
      {} as never,
      undefined,
      undefined,
      undefined,
      identityRepository,
    );

    const attempt = (realm: string) =>
      controller.passwordLogin(realm, {
        email: "nobody@example.com",
        password: "whatever-the-attacker-sends",
      });

    let tenantMessage: string | undefined;
    let agencyMessage: string | undefined;
    let partnerMessage: string | undefined;
    for (const [realm, assign] of [
      ["tenant", (value: string) => (tenantMessage = value)],
      ["agency", (value: string) => (agencyMessage = value)],
      ["partner", (value: string) => (partnerMessage = value)],
    ] as const) {
      try {
        await attempt(realm);
        throw new Error("expected denial");
      } catch (error) {
        const apiError = error as ApiRequestError;
        expect(apiError.getStatus()).toBe(401);
        const body = apiError.getResponse() as {
          error: { code: string; message: string };
        };
        expect(body.error.code).toBe("AUTHENTICATION_FAILED");
        assign(body.error.message);
      }
    }
    expect(agencyMessage).toBe(tenantMessage);
    expect(partnerMessage).toBe(tenantMessage);
  });
});

/**
 * FLEET-ONB-004 (fleet-staff-onboarding-20261114 SA/SD §3): end-to-end
 * through the real `AuthController` -> `OidcPkceService.exchangePartnerCallbackSession`
 * -> `issueVerifiedFleetSession` -> `IdentityRepository.acceptFleetStaffOidcInvitation`
 * chain, not just the repository method in isolation (that is covered by
 * apps/api/tests/unit/fleet-staff-invitation-accept.test.ts). A minimal fake
 * `DatabaseService` double answers only the exact query shapes this chain
 * issues against `iam.identity_*` and `admin.phase1_fleet_partners` /
 * `admin.phase1_partner_user_identity_links` -- same convention as
 * tests/unit/identity-fleet-staff-sourceref.test.ts.
 */
describe("FLEET-ONB-004 Fleet staff invitation Google-bind: strict negative controls", () => {
  const FLEET_ENTRY = "fleet-demo-001";
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("AUTH_MODE", "local");
    vi.stubEnv("OIDC_MOCK_MODE", "true");
    vi.stubEnv("JWT_SECRET", "test_jwt_secret_key_32_characters_long_min!");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function createFleetDatabaseDouble() {
    const principals = new Map<string, any>();
    const principalsByIssuerSubject = new Map<string, any>();
    const memberships = new Map<string, any>();
    const membershipsBySourceRef = new Map<string, any>();
    const roleBindingsByMembership = new Map<string, any[]>();
    const roleBindingsBySourceRef = new Map<string, any>();
    const invitationsByTokenHash = new Map<string, any>();
    const fleetPartnersActive = new Map<string, boolean>([[FLEET_ENTRY, true]]);
    const links = new Map<string, { drtsPassengerId: string }>();

    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      const text = sql.trim();
      if (
        text.startsWith("BEGIN") ||
        text.startsWith("COMMIT") ||
        text.startsWith("ROLLBACK") ||
        text.startsWith("SAVEPOINT") ||
        text.startsWith("ROLLBACK TO SAVEPOINT")
      ) {
        return { rows: [] };
      }
      if (text.startsWith("SELECT principal_id FROM iam.identity_principals")) {
        const rec = principals.get(params[0] as string);
        return { rows: rec ? [{ principal_id: rec.principalId }] : [] };
      }
      if (
        text.includes(
          "FROM iam.identity_principals WHERE issuer = $1 AND subject = $2",
        )
      ) {
        const rec = principalsByIssuerSubject.get(`${params[0]}::${params[1]}`);
        return { rows: rec ? [{ record: rec }] : [] };
      }
      if (text.includes("FROM iam.identity_principals WHERE principal_id = $1")) {
        const rec = principals.get(params[0] as string);
        return { rows: rec ? [{ record: rec }] : [] };
      }
      if (text.includes("FROM iam.identity_memberships WHERE source_ref = $1")) {
        const rec = membershipsBySourceRef.get(params[0] as string);
        return { rows: rec ? [{ record: rec }] : [] };
      }
      if (text.includes("FROM iam.identity_memberships WHERE membership_id = $1")) {
        const rec = memberships.get(params[0] as string);
        return { rows: rec ? [{ record: rec }] : [] };
      }
      if (text.includes("FROM iam.identity_role_bindings WHERE source_ref = $1")) {
        const rec = roleBindingsBySourceRef.get(params[0] as string);
        return { rows: rec ? [{ record: rec }] : [] };
      }
      if (
        text.includes("FROM iam.identity_role_bindings WHERE membership_id = $1")
      ) {
        const list = roleBindingsByMembership.get(params[0] as string) ?? [];
        return { rows: list.map((record) => ({ record })) };
      }
      if (
        text.includes("FROM iam.identity_invitations") &&
        text.includes("token_hash = $1")
      ) {
        const rec = invitationsByTokenHash.get(params[0] as string);
        const nowMs = Date.parse(params[1] as string);
        const valid =
          rec && !rec.acceptedAt && !rec.revokedAt && Date.parse(rec.expiresAt) > nowMs;
        return { rows: valid ? [{ record: rec }] : [] };
      }
      if (text.includes("SELECT active FROM admin.phase1_fleet_partners")) {
        const active = fleetPartnersActive.get(params[0] as string);
        return { rows: active === undefined ? [] : [{ active }] };
      }
      if (text.includes("INSERT INTO admin.phase1_partner_user_identity_links")) {
        const key = `${params[0]}::${params[1]}`;
        if (links.has(key)) return { rows: [] };
        const record = JSON.parse(params[4] as string);
        links.set(key, record);
        return { rows: [{ record }] };
      }
      if (text.includes("INSERT INTO iam.identity_principals")) {
        const record = JSON.parse(params[11] as string);
        principals.set(record.principalId, record);
        principalsByIssuerSubject.set(`${record.issuer}::${record.subject}`, record);
        return { rows: [{ record }] };
      }
      if (text.includes("INSERT INTO iam.identity_memberships")) {
        const record = JSON.parse(params[12] as string);
        memberships.set(record.membershipId, record);
        if (record.sourceRef) membershipsBySourceRef.set(record.sourceRef, record);
        return { rows: [{ record }] };
      }
      if (text.includes("INSERT INTO iam.identity_role_bindings")) {
        const record = JSON.parse(params[10] as string);
        if (record.sourceRef) roleBindingsBySourceRef.set(record.sourceRef, record);
        const list = roleBindingsByMembership.get(record.membershipId) ?? [];
        list.push(record);
        roleBindingsByMembership.set(record.membershipId, list);
        return { rows: [{ record }] };
      }
      if (text.includes("INSERT INTO iam.identity_invitations")) {
        const record = JSON.parse(params[17] as string);
        invitationsByTokenHash.set(record.tokenHash, record);
        return { rows: [{ record }] };
      }
      if (text.includes("INSERT INTO iam.identity_sessions")) {
        const [
          sessionId,
          sourceRef,
          principalId,
          membershipId,
          realm,
          status,
          authTime,
          authMethods,
          tokenVersion,
          idleExpiresAt,
          absoluteExpiresAt,
          revokedAt,
          revokedByPrincipalId,
          revokeReason,
          deviceSummary,
          riskSummary,
          createdAt,
          updatedAt,
          record,
        ] = params;
        return {
          rows: [
            {
              session_id: sessionId,
              source_ref: sourceRef,
              principal_id: principalId,
              membership_id: membershipId,
              realm,
              status,
              auth_time: authTime,
              auth_methods: authMethods,
              token_version: tokenVersion,
              idle_expires_at: idleExpiresAt,
              absolute_expires_at: absoluteExpiresAt,
              revoked_at: revokedAt,
              revoked_by_principal_id: revokedByPrincipalId,
              revoke_reason: revokeReason,
              device_summary: JSON.parse(deviceSummary as string),
              risk_summary: JSON.parse(riskSummary as string),
              created_at: createdAt,
              updated_at: updatedAt,
              record: JSON.parse(record as string),
            },
          ],
        };
      }
      throw new Error(`Unmocked Fleet invitation query: ${text}`);
    });

    return {
      databaseService: { isEnabled: () => true, connect: async () => ({ query, release: vi.fn() }) },
      seedLink(entrySlug: string, partnerUserRef: string, drtsPassengerId: string) {
        links.set(`${entrySlug}::${partnerUserRef}`, { drtsPassengerId });
      },
      getLink(entrySlug: string, partnerUserRef: string) {
        return links.get(`${entrySlug}::${partnerUserRef}`) ?? null;
      },
      getPrincipal(principalId: string) {
        return principals.get(principalId) ?? null;
      },
    };
  }

  async function setup() {
    const db = createFleetDatabaseDouble();
    const repository = new IdentityRepository(db.databaseService as never);
    const link = new PartnerUserIdentityLinkRepository();
    const tenant = new TenantPartnerService(new AuditNotificationService());
    const jwt = new JwtAuthService(repository, tenant, undefined, undefined, link);
    const oidc = new OidcPkceService(jwt, tenant, undefined, link, undefined, repository);

    async function issueInvitation(email = "admin@acme.example") {
      const rawToken = `fi_${randomUUID()}`;
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const issued = await repository.issueFleetStaffInvitation({
        entrySlug: FLEET_ENTRY,
        fleetPartnerId: FLEET_ENTRY,
        email,
        roleCode: "fleet_partner_ops",
        validTo: null,
        tokenHash,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        issuerPrincipalId: null,
      });
      if (!issued) throw new Error("fixture invitation was not issued");
      return { rawToken, issued };
    }

    async function attemptAccept(rawToken: string, code = "partner_fleet_bind") {
      const state = oidc.generateLoginParameters("partner", {
        invitationToken: rawToken,
        partnerId: FLEET_ENTRY,
      });
      return oidc.exchangePartnerCallbackSession(
        {
          provider: "oidc",
          code,
          state: state.state,
          partnerId: FLEET_ENTRY,
          callbackUrl: "http://localhost:3000/api/auth/callback",
        },
        { stateToken: state.stateToken },
      );
    }

    return { db, repository, issueInvitation, attemptAccept };
  }

  it("binds the invited Google subject and immediately unlocks the ordinary (non-invitation) partner login", async () => {
    const { db, issueInvitation, attemptAccept } = await setup();
    const { rawToken } = await issueInvitation();
    const code = "partner_fleet_bind";
    // performOidcCodeExchange's default synthetic-claims branch, for a code
    // containing "partner": sub = sub_oidc_<sha256(code)[0:12]>.
    const expectedSubject = `sub_oidc_${createHash("sha256").update(code).digest("hex").slice(0, 12)}`;

    const session = await attemptAccept(rawToken, code);
    expect(session.identity).toMatchObject({
      realm: "partner",
      partnerEntrySlug: FLEET_ENTRY,
      roles: ["fleet_partner_ops"],
    });
    expect(db.getLink(FLEET_ENTRY, expectedSubject)).not.toBeNull();
  });

  it("SA/SD §9: a pre-existing (entrySlug, sub) identity link rolls back the whole acceptance", async () => {
    const { db, issueInvitation, attemptAccept } = await setup();
    const { rawToken, issued } = await issueInvitation();
    // The Google subject the default synthetic claims will present (see
    // performOidcCodeExchange's "partner" default branch) already has an
    // unrelated link for this entry -- e.g. a prior referral handoff.
    const code = "partner_fleet_bind_prelinked";
    const presentedSubject = `sub_oidc_${createHash("sha256").update(code).digest("hex").slice(0, 12)}`;
    db.seedLink(FLEET_ENTRY, presentedSubject, "passenger_prior_referral_link");

    await expect(attemptAccept(rawToken, code)).rejects.toMatchObject({
      code: "AUTH_SESSION_EXCHANGE_DENIED",
    });
    expect(db.getPrincipal(issued.principal.principalId)?.status).toBe(
      "invited",
    );
    expect(db.getLink(FLEET_ENTRY, presentedSubject)).toMatchObject({
      drtsPassengerId: "passenger_prior_referral_link",
    });
  });

  it("does not bypass the strict-environment synthetic-exchange gate for the invitation branch", async () => {
    const { issueInvitation, attemptAccept } = await setup();
    const { rawToken } = await issueInvitation();
    process.env.DRTS_ENV = "staging";
    process.env.OIDC_MOCK_MODE = "false";
    delete process.env.OIDC_TOKEN_ENDPOINT;
    delete process.env.OIDC_ISSUER;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(attemptAccept(rawToken)).rejects.toMatchObject({
      code: "AUTH_SESSION_EXCHANGE_DENIED",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("PWD-LOGIN-SESSION-ADD-PASSWORD-20261114 strict credentials/password negative controls", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.APP_ENV = "local";
    process.env.AUTH_MODE = "local";
    process.env.JWT_SECRET = "test_jwt_secret_key_32_characters_long_min!";
    // Same negative control as the password-login suite above, applied to
    // the credentials/password route instead: an unconfigured pepper must
    // fail closed (503) before ever touching the identity/membership store,
    // never silently add/change a credential with an unpeppered hash.
    delete process.env.PASSWORD_PEPPER_SECRETS_JSON;
    delete process.env.PASSWORD_PEPPER_CURRENT_VERSION;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("fails closed, not open, when no password pepper is configured", async () => {
    const identityRepository = new IdentityRepository();
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const controller = new AuthController(
      new JwtAuthService(identityRepository, tenantPartnerService),
      tenantPartnerService,
      {} as never,
      undefined,
      undefined,
      undefined,
      identityRepository,
    );

    await expect(
      controller.setAccountPassword(
        "tenant",
        {
          authMode: "jwt_bearer",
          actorType: "tenant_admin",
          actorId: "principal-strict-negative",
          principalId: "principal-strict-negative",
          membershipId: "membership-strict-negative",
          realm: "tenant",
          tenantId: null,
          sessionId: "session-strict-negative",
          authTime: new Date().toISOString(),
          amr: [],
          acr: "aal1",
          roleFamilies: ["tenant"],
          roles: ["tenant_viewer"],
          scopes: [],
          requestId: null,
        },
        { password: "whatever the attacker sends as a new password" },
        {},
      ),
    ).rejects.toMatchObject({
      code: "PASSWORD_LOGIN_UNAVAILABLE",
    });
  });

  it("denies before touching any identity/membership lookup when there is no session at all", async () => {
    const identityRepository = new IdentityRepository();
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const findPrincipalById = vi.spyOn(identityRepository, "findPrincipalById");
    const controller = new AuthController(
      new JwtAuthService(identityRepository, tenantPartnerService),
      tenantPartnerService,
      {} as never,
      undefined,
      undefined,
      undefined,
      identityRepository,
    );

    await expect(
      controller.setAccountPassword(
        "tenant",
        null,
        { password: "whatever the attacker sends as a new password" },
        {},
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    expect(findPrincipalById).not.toHaveBeenCalled();
  });

  it("a body-asserted principalId/email/amr/mfa claim cannot select a different identity or fabricate trusted MFA", async () => {
    process.env.PASSWORD_PEPPER_SECRETS_JSON = JSON.stringify({
      v1: "iam-oidc-strict-negative-credpwd-pepper-32ch!",
    });
    process.env.PASSWORD_PEPPER_CURRENT_VERSION = "v1";
    const identityRepository = new IdentityRepository();
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const controller = new AuthController(
      new JwtAuthService(identityRepository, tenantPartnerService),
      tenantPartnerService,
      {} as never,
      undefined,
      undefined,
      undefined,
      identityRepository,
    );

    // A real, active principal/membership for a role this deployment
    // requires MFA for (tenant_admin), directly seeded into the repository
    // (no invitation flow needed for this control) -- but with a stale,
    // non-MFA session. The request body claims a completely different
    // principal and asserts `amr`/`mfa` directly; none of it may be read.
    const now = new Date().toISOString();
    const principalId = "principal-real-session-body-spoof";
    const membershipId = "membership-real-session-body-spoof";
    const repo = identityRepository as unknown as {
      upsertFallbackPrincipal: (
        record: CanonicalIdentityPrincipalRecord,
      ) => CanonicalIdentityPrincipalRecord;
      fallbackMemberships: Map<string, CanonicalIdentityMembershipRecord>;
    };
    repo.upsertFallbackPrincipal({
      principalId,
      sourceRef: `jwt_principal:tenant:${principalId}`,
      issuer: "https://accounts.google.com",
      subject: principalId,
      principalType: "human",
      email: "real-session-holder@example.com",
      emailVerified: true,
      displayName: "Real Session Holder",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    repo.fallbackMemberships.set(membershipId, {
      membershipId,
      sourceRef: `tenant_user_role:${principalId}:membership`,
      principalId,
      realm: "tenant",
      scopeRef: "tenant:tenant-strict-negative-body-spoof",
      tenantId: "tenant-strict-negative-body-spoof",
      partnerId: null,
      status: "active",
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      controller.setAccountPassword(
        "tenant",
        {
          authMode: "jwt_bearer",
          actorType: "tenant_admin",
          actorId: principalId,
          principalId,
          membershipId,
          realm: "tenant",
          tenantId: null,
          sessionId: "session-real-body-spoof",
          authTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          amr: [],
          acr: null,
          roleFamilies: ["tenant"],
          roles: ["tenant_admin"],
          scopes: [],
          requestId: null,
        },
        {
          password: "a sufficiently long attacker chosen password!",
          // Fields the real body type never declares; `as never` below
          // lets this literal carry them without a type error, proving
          // they are never read.
          principalId: "principal-attacker-target",
          email: "victim@example.com",
          amr: ["otp", "mfa", "webauthn"],
          mfa: true,
        } as never,
        {},
      ),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  });
});

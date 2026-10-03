import { generateKeyPairSync } from "node:crypto";
import * as jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TenantUserRoleRecord } from "@drts/contracts";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { AuthController } from "../../../../apps/api/src/modules/auth/auth.controller";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import {
  GoogleWorkloadIdentityAdapter,
  GOOGLE_WORKLOAD_IDENTITY_HEADER,
} from "../../../../apps/api/src/modules/auth/google-workload-identity.adapter";

const testRsaKey = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

// SR-AUTH-SESSION-SUPERSEDE-20261003
//
// Root cause: JwtAuthService.issueSessionToken calls
// IdentityRepository.ensurePrincipalRecord on every issuance for a workforce
// (platform/ops) principal. ensurePrincipalRecord's upsert unconditionally
// bumped `updated_at` to "now" even when nothing about the principal
// actually changed. validateDurableState folds principal/membership/role
// binding `updatedAt` into a single "durable version" fingerprint
// (computeWorkforceTokenVersion) that every session's baked-in tokenVersion
// must still match at verify time. So re-issuing a session for the same
// principal (e.g. a parallel login, or a mail-verification bootstrap flow)
// silently advanced that fingerprint and made every *other* still-active
// session for that principal fail verifyAccessToken immediately.
describe("SR-AUTH-SESSION-SUPERSEDE-20261003: re-issuing a session must not supersede other active sessions", () => {
  let identityRepo: IdentityRepository;
  let jwtAuthService: JwtAuthService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T00:00:00.000Z"));
    process.env.JWT_KEY_RING_JSON = JSON.stringify([
      {
        kid: "key-test-2026",
        status: "active",
        algorithm: "RS256",
        privateKey: testRsaKey.privateKey,
        publicKey: testRsaKey.publicKey,
      },
    ]);
    identityRepo = new IdentityRepository();
    jwtAuthService = new JwtAuthService(identityRepo);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function buildWorkforceIdentity() {
    const account = await identityRepo.ensureDefaultPlatformAccount();
    const roleBindings = await identityRepo.findRoleBindingsByMembershipId(
      account.membership.membershipId,
    );
    const identity = {
      authMode: "jwt_bearer" as const,
      actorType: "platform_admin" as const,
      actorId: account.principal.principalId,
      principalId: account.principal.principalId,
      membershipId: account.membership.membershipId,
      realm: "platform" as const,
      tenantId: null,
      roles: ["platform_admin"],
      roleFamilies: ["platform" as const],
      scopes: ["identity:read"],
    };
    return {
      identity,
      workforceVersionTimestamps: [
        account.membership.updatedAt,
        ...roleBindings.map((binding) => binding.updatedAt),
      ],
    };
  }

  it("POS-1: two sessions issued back-to-back for the same principal both stay valid when nothing about the account changed", async () => {
    const { identity, workforceVersionTimestamps } =
      await buildWorkforceIdentity();

    vi.setSystemTime(new Date("2026-10-03T00:01:00.000Z"));
    const first = await jwtAuthService.issueSessionToken(identity, {
      ensurePrincipal: true,
      workforceVersionTimestamps,
      authTime: new Date().toISOString(),
    });

    // A second session for the *same* principal is issued later (another
    // device, a parallel automation run, a mail-verification re-login).
    vi.setSystemTime(new Date("2026-10-03T00:10:00.000Z"));
    const second = await jwtAuthService.issueSessionToken(identity, {
      ensurePrincipal: true,
      workforceVersionTimestamps,
      authTime: new Date().toISOString(),
    });

    expect(first.sessionId).not.toBe(second.sessionId);

    const verifiedSecond = await jwtAuthService.verifyAccessToken(
      second.token,
    );
    expect(verifiedSecond).not.toBeNull();

    // This is the regression: issuing `second` must not have advanced the
    // durable version fingerprint out from under `first`.
    const verifiedFirst = await jwtAuthService.verifyAccessToken(first.token);
    expect(verifiedFirst).not.toBeNull();
    expect(verifiedFirst?.sid).toBe(first.sessionId);
  });

  it("NEG-1: a genuine role-binding change still invalidates previously issued sessions", async () => {
    const { identity, workforceVersionTimestamps } =
      await buildWorkforceIdentity();

    vi.setSystemTime(new Date("2026-10-03T00:01:00.000Z"));
    const issued = await jwtAuthService.issueSessionToken(identity, {
      ensurePrincipal: true,
      workforceVersionTimestamps,
      authTime: new Date().toISOString(),
    });
    expect(await jwtAuthService.verifyAccessToken(issued.token)).not.toBeNull();

    // A real change: the platform_admin role binding is revoked.
    const roleBindings = await identityRepo.findRoleBindingsByMembershipId(
      identity.membershipId!,
    );
    const binding = roleBindings[0]!;
    vi.setSystemTime(new Date("2026-10-03T00:05:00.000Z"));
    await identityRepo.ensureRoleBindingRecord({
      ...binding,
      validTo: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const verifiedAfterRevocation = await jwtAuthService.verifyAccessToken(
      issued.token,
    );
    expect(verifiedAfterRevocation).toBeNull();
  });

  it("NEG-2: a genuine principal status change still invalidates previously issued sessions", async () => {
    const { identity, workforceVersionTimestamps } =
      await buildWorkforceIdentity();

    vi.setSystemTime(new Date("2026-10-03T00:01:00.000Z"));
    const issued = await jwtAuthService.issueSessionToken(identity, {
      ensurePrincipal: true,
      workforceVersionTimestamps,
      authTime: new Date().toISOString(),
    });
    expect(await jwtAuthService.verifyAccessToken(issued.token)).not.toBeNull();

    const principal = await identityRepo.findPrincipalById(
      identity.principalId!,
    );
    vi.setSystemTime(new Date("2026-10-03T00:05:00.000Z"));
    await identityRepo.ensurePrincipalRecord({
      ...principal!,
      status: "suspended",
      updatedAt: new Date().toISOString(),
    });

    const verifiedAfterSuspension = await jwtAuthService.verifyAccessToken(
      issued.token,
    );
    expect(verifiedAfterSuspension).toBeNull();
  });

  it("NEG-3: a genuine membership suspension invalidates both of two previously issued sessions", async () => {
    const { identity, workforceVersionTimestamps } =
      await buildWorkforceIdentity();

    vi.setSystemTime(new Date("2026-10-03T00:01:00.000Z"));
    const first = await jwtAuthService.issueSessionToken(identity, {
      ensurePrincipal: true,
      workforceVersionTimestamps,
      authTime: new Date().toISOString(),
    });
    vi.setSystemTime(new Date("2026-10-03T00:02:00.000Z"));
    const second = await jwtAuthService.issueSessionToken(identity, {
      ensurePrincipal: true,
      workforceVersionTimestamps,
      authTime: new Date().toISOString(),
    });
    expect(await jwtAuthService.verifyAccessToken(first.token)).not.toBeNull();
    expect(
      await jwtAuthService.verifyAccessToken(second.token),
    ).not.toBeNull();

    const membership = await identityRepo.findMembershipsByPrincipalId(
      identity.principalId!,
    );
    vi.setSystemTime(new Date("2026-10-03T00:05:00.000Z"));
    await identityRepo.ensureMembershipRecord({
      ...membership[0]!,
      status: "suspended",
      updatedAt: new Date().toISOString(),
    });

    expect(await jwtAuthService.verifyAccessToken(first.token)).toBeNull();
    expect(await jwtAuthService.verifyAccessToken(second.token)).toBeNull();
  });
});

// R1 repair regression: the bug was not only in IdentityRepository's no-op
// detection, but in GoogleWorkloadIdentityAdapter.verifyServicePrincipal
// stamping a fresh `validFrom` (derived from the assertion's `iat`) on the
// role binding on *every* reauthentication. Since validFrom was part of the
// role-binding "did anything change" comparison, that alone kept forcing a
// "changed" result and advancing the fingerprint even after the
// IdentityRepository fix. This suite drives the real
// GoogleWorkloadIdentityAdapter and AuthController (not just
// IdentityRepository/JwtAuthService directly) with two distinct
// Google-signed assertions for the same ops principal, matching the
// reviewer's rejection repro for candidate 597985c570e6f89947e6834df1adff5a17bacc6b.
describe("SR-AUTH-SESSION-SUPERSEDE-20261003: Google workload identity reauthentication through the real controller/adapter", () => {
  const AUDIENCE = "https://api.dev.drts.internal";
  const SERVICE_ACCOUNT_EMAIL =
    "review-ops@dev-project.iam.gserviceaccount.com";
  const OPS_PRINCIPAL_ID = "review-ops";

  const googleKeyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const googleJwk = googleKeyPair.publicKey.export({ format: "jwk" }) as {
    kty: string;
    n: string;
    e: string;
  };
  const GOOGLE_KID = "google-test-key-1";

  let identityRepo: IdentityRepository;
  let jwtAuthService: JwtAuthService;
  let googleAdapter: GoogleWorkloadIdentityAdapter;
  let controller: AuthController;

  function signGoogleAssertion(iatSeconds: number): string {
    return jwt.sign(
      {
        iss: "https://accounts.google.com",
        sub: "google-subject-review-ops",
        email: SERVICE_ACCOUNT_EMAIL,
        email_verified: true,
        aud: AUDIENCE,
        iat: iatSeconds,
        exp: iatSeconds + 300,
      },
      googleKeyPair.privateKey,
      { algorithm: "RS256", keyid: GOOGLE_KID },
    );
  }

  beforeEach(() => {
    process.env.JWT_KEY_RING_JSON = JSON.stringify([
      {
        kid: "key-test-2026",
        status: "active",
        algorithm: "RS256",
        privateKey: testRsaKey.privateKey,
        publicKey: testRsaKey.publicKey,
      },
    ]);
    process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS = JSON.stringify([
      {
        serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
        principalId: OPS_PRINCIPAL_ID,
        actorId: OPS_PRINCIPAL_ID,
        displayName: "Review Ops",
        roles: ["ops_user"],
        scopes: [],
        allowedTokenAudiences: [AUDIENCE],
        routeScopes: ["* *"],
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            keys: [
              {
                kty: googleJwk.kty,
                kid: GOOGLE_KID,
                n: googleJwk.n,
                e: googleJwk.e,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    identityRepo = new IdentityRepository();
    jwtAuthService = new JwtAuthService(identityRepo);
    googleAdapter = new GoogleWorkloadIdentityAdapter(identityRepo);
    controller = new AuthController(
      jwtAuthService,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      identityRepo,
      undefined,
      googleAdapter,
      undefined,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS;
    delete process.env.JWT_KEY_RING_JSON;
  });

  it("R1: two sessions issued for the same ops principal from two distinct Google assertions both stay valid", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);

    // Distinct `x-session-id` per call: this isolates the fingerprint
    // mechanism under test (role-binding/membership/principal updatedAt via
    // workforceVersionTimestamps) from the unrelated, by-design session-slot
    // rotation that `extractBootstrapRequestIdentity` applies when no
    // session id is supplied in a non-strict environment (same actor would
    // otherwise collapse onto one `bootstrap:<actorId>` session and have its
    // `currentTokenId` rotated out from under it on every reissuance,
    // regardless of this fix). Real IAP-driven logins (the actual incident:
    // deploy-acceptance vs. mail-verification tenant-admin sessions) each
    // get their own randomly generated session id already; this header lets
    // a bootstrap-header-driven probe reach that same "independent session"
    // shape without starting a real IAP flow.
    const firstAssertion = signGoogleAssertion(nowSeconds - 60);
    const first = await controller.issueToken({
      headers: {
        [GOOGLE_WORKLOAD_IDENTITY_HEADER]: firstAssertion,
        "x-actor-type": "ops_user",
        "x-actor-id": OPS_PRINCIPAL_ID,
        "x-realm": "ops",
        "x-session-id": "session-one",
      },
      method: "POST",
      originalUrl: "/api/auth/token",
    } as never);

    const secondAssertion = signGoogleAssertion(nowSeconds - 30);
    const second = await controller.issueToken({
      headers: {
        [GOOGLE_WORKLOAD_IDENTITY_HEADER]: secondAssertion,
        "x-actor-type": "ops_user",
        "x-actor-id": OPS_PRINCIPAL_ID,
        "x-realm": "ops",
        "x-session-id": "session-two",
      },
      method: "POST",
      originalUrl: "/api/auth/token",
    } as never);

    expect(first.token).not.toBe(second.token);

    const verifiedSecond = await jwtAuthService.verifyAccessToken(
      second.token,
    );
    expect(verifiedSecond).not.toBeNull();

    // This is the exact regression the reviewer found: issuing `second`
    // through the real controller/adapter must not advance the role
    // binding's updated_at (via a fresh validFrom from the new assertion's
    // iat) out from under the still-live `first` session.
    const verifiedFirst = await jwtAuthService.verifyAccessToken(
      first.token,
    );
    expect(verifiedFirst).not.toBeNull();
  });
});

// R2 repair (second reopen): the previous fix only repaired the
// workforce-version-fingerprint sub-cause. The actually reported incident
// (mail-verification bootstrap vs. a running deploy-acceptance session for
// the same tenant admin) never sends a custom `x-session-id` header -- real
// callers are `tests/e2e/system-remediation/sr-live-mail-001/session-bootstrap.ts`
// and `.github/workflows/deploy-dev.yml`, both of which authenticate with
// Google workload identity proof plus tenant actor headers only. In that
// request shape, `extractBootstrapRequestIdentity` was synthesizing the same
// deterministic `bootstrap:<actorId>` session id on every call, so a second
// exchange for the same actor always overwrote the first exchange's
// `iam.identity_sessions` row (and its `currentTokenId`) regardless of the
// workforce-version fix above. The repair: `POST /api/auth/token` now passes
// `requireExplicitSessionId: true` to the extractor (auth.controller.ts),
// so session issuance always mints a fresh random session id unless the
// caller explicitly supplies `x-session-id` itself.
//
// `DRTS_ENV=development` + `NODE_ENV=production` reproduces deploy-dev.yml's
// actual process environment (detectAuthEnvironment prioritizes DRTS_ENV, so
// this is a non-strict/non-production auth environment that still allows
// bootstrap headers).
describe("SR-AUTH-SESSION-SUPERSEDE-20261003 R2: no x-session-id header, matching the real mail/deploy caller shape", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  describe("ops_user Google workload identity exchange", () => {
    const AUDIENCE = "https://api.dev.drts.internal";
    const SERVICE_ACCOUNT_EMAIL =
      "review-ops@dev-project.iam.gserviceaccount.com";
    const OPS_PRINCIPAL_ID = "review-ops-r2";

    const googleKeyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const googleJwk = googleKeyPair.publicKey.export({ format: "jwk" }) as {
      kty: string;
      n: string;
      e: string;
    };
    const GOOGLE_KID = "google-test-key-r2-ops";

    let identityRepo: IdentityRepository;
    let jwtAuthService: JwtAuthService;
    let controller: AuthController;

    function signGoogleAssertion(iatSeconds: number): string {
      return jwt.sign(
        {
          iss: "https://accounts.google.com",
          sub: "google-subject-review-ops-r2",
          email: SERVICE_ACCOUNT_EMAIL,
          email_verified: true,
          aud: AUDIENCE,
          iat: iatSeconds,
          exp: iatSeconds + 300,
        },
        googleKeyPair.privateKey,
        { algorithm: "RS256", keyid: GOOGLE_KID },
      );
    }

    beforeEach(() => {
      process.env = { ...ORIGINAL_ENV };
      process.env.DRTS_ENV = "development";
      process.env.NODE_ENV = "production";
      process.env.JWT_KEY_RING_JSON = JSON.stringify([
        {
          kid: "key-test-2026",
          status: "active",
          algorithm: "RS256",
          privateKey: testRsaKey.privateKey,
          publicKey: testRsaKey.publicKey,
        },
      ]);
      process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS = JSON.stringify([
        {
          serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
          principalId: OPS_PRINCIPAL_ID,
          actorId: OPS_PRINCIPAL_ID,
          displayName: "Review Ops R2",
          roles: ["ops_user"],
          scopes: [],
          allowedTokenAudiences: [AUDIENCE],
          routeScopes: ["* *"],
        },
      ]);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              keys: [
                {
                  kty: googleJwk.kty,
                  kid: GOOGLE_KID,
                  n: googleJwk.n,
                  e: googleJwk.e,
                },
              ],
            }),
            { status: 200 },
          ),
        ),
      );

      identityRepo = new IdentityRepository();
      jwtAuthService = new JwtAuthService(identityRepo);
      const googleAdapter = new GoogleWorkloadIdentityAdapter(identityRepo);
      controller = new AuthController(
        jwtAuthService,
        {} as never,
        {} as never,
        undefined,
        undefined,
        undefined,
        identityRepo,
        undefined,
        googleAdapter,
        undefined,
      );
    });

    it("R2-ops: two exchanges with no x-session-id both stay valid with distinct session ids, and explicit revoke still rejects", async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);

      const first = await controller.issueToken({
        headers: {
          [GOOGLE_WORKLOAD_IDENTITY_HEADER]: signGoogleAssertion(
            nowSeconds - 60,
          ),
          "x-actor-type": "ops_user",
          "x-actor-id": OPS_PRINCIPAL_ID,
          "x-realm": "ops",
        },
        method: "POST",
        originalUrl: "/api/auth/token",
      } as never);

      const second = await controller.issueToken({
        headers: {
          [GOOGLE_WORKLOAD_IDENTITY_HEADER]: signGoogleAssertion(
            nowSeconds - 30,
          ),
          "x-actor-type": "ops_user",
          "x-actor-id": OPS_PRINCIPAL_ID,
          "x-realm": "ops",
        },
        method: "POST",
        originalUrl: "/api/auth/token",
      } as never);

      expect(first.token).not.toBe(second.token);

      const firstPayload = jwt.decode(first.token) as { sid?: string };
      const secondPayload = jwt.decode(second.token) as { sid?: string };
      expect(firstPayload.sid).toBeTruthy();
      expect(secondPayload.sid).toBeTruthy();
      // This is the exact no-header collision the reopened review found:
      // without the fix, both sids collapse onto `bootstrap:review-ops-r2`.
      expect(firstPayload.sid).not.toBe(secondPayload.sid);

      const verifiedSecond = await jwtAuthService.verifyAccessToken(
        second.token,
      );
      expect(verifiedSecond).not.toBeNull();
      const verifiedFirst = await jwtAuthService.verifyAccessToken(
        first.token,
      );
      expect(verifiedFirst).not.toBeNull();

      // An explicit revoke of just the second session must still work, and
      // must not affect the first, still-live session.
      await identityRepo.revokeSession(secondPayload.sid!, "test_explicit_revoke");
      expect(
        await jwtAuthService.verifyAccessToken(second.token),
      ).toBeNull();
      expect(
        await jwtAuthService.verifyAccessToken(first.token),
      ).not.toBeNull();
    });
  });

  describe("tenant_admin CI tenant-actor Google workload identity exchange", () => {
    const AUDIENCE = "https://api.dev.drts.internal";
    const SERVICE_ACCOUNT_EMAIL =
      "review-ci@dev-project.iam.gserviceaccount.com";
    const CI_PRINCIPAL_ID = "review-ci-r2";
    const TENANT_ID = "10000000-0000-0000-0000-000000000201";
    const TENANT_USER_ID = "10000000-0000-0000-0000-000000000901";

    const googleKeyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const googleJwk = googleKeyPair.publicKey.export({ format: "jwk" }) as {
      kty: string;
      n: string;
      e: string;
    };
    const GOOGLE_KID = "google-test-key-r2-tenant";

    let identityRepo: IdentityRepository;
    let jwtAuthService: JwtAuthService;
    let controller: AuthController;
    let tenantUserRole: TenantUserRoleRecord;
    let tenantPartnerService: TenantPartnerService;

    function signGoogleAssertion(iatSeconds: number): string {
      return jwt.sign(
        {
          iss: "https://accounts.google.com",
          sub: "google-subject-review-ci-r2",
          email: SERVICE_ACCOUNT_EMAIL,
          email_verified: true,
          aud: AUDIENCE,
          iat: iatSeconds,
          exp: iatSeconds + 300,
        },
        googleKeyPair.privateKey,
        { algorithm: "RS256", keyid: GOOGLE_KID },
      );
    }

    beforeEach(() => {
      process.env = { ...ORIGINAL_ENV };
      process.env.DRTS_ENV = "development";
      process.env.NODE_ENV = "production";
      process.env.WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED = "true";
      process.env.JWT_KEY_RING_JSON = JSON.stringify([
        {
          kid: "key-test-2026",
          status: "active",
          algorithm: "RS256",
          privateKey: testRsaKey.privateKey,
          publicKey: testRsaKey.publicKey,
        },
      ]);
      process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS = JSON.stringify([
        {
          serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
          principalId: CI_PRINCIPAL_ID,
          actorId: CI_PRINCIPAL_ID,
          displayName: "Review CI R2",
          roles: [],
          scopes: [],
          allowedTokenAudiences: [AUDIENCE],
          routeScopes: ["* *"],
          ciTenantActorGrants: [
            {
              tenantId: TENANT_ID,
              actorType: "tenant_admin",
              actorId: TENANT_USER_ID,
            },
          ],
        },
      ]);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              keys: [
                {
                  kty: googleJwk.kty,
                  kid: GOOGLE_KID,
                  n: googleJwk.n,
                  e: googleJwk.e,
                },
              ],
            }),
            { status: 200 },
          ),
        ),
      );

      identityRepo = new IdentityRepository();
      jwtAuthService = new JwtAuthService(
        identityRepo,
        // Real JwtAuthService#validateDurableState tenant-realm branch and
        // AuthController#issueToken tenant lookup both only need
        // findTenantUser/findTenantUserBySubject/cloneUserRole; those are
        // real, unmocked TenantPartnerService methods driven off a fixed
        // `userRoles` fixture, matching the reviewer's reproduction. The full
        // class constructor needs database/webhook/audit infra this unit
        // test does not stand up, so the external (non-auth) boundary --
        // which tenant users exist -- is seeded directly rather than mocked
        // away at the method level.
        Object.create(TenantPartnerService.prototype) as TenantPartnerService,
      );
      tenantUserRole = {
        userId: TENANT_USER_ID,
        tenantId: TENANT_ID,
        email: "tenant-admin-r2@example.com",
        displayName: "Tenant Admin R2",
        roleCode: "tenant_admin",
        status: "active",
        approvalNotificationOptOut: false,
        invitedAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      };
      tenantPartnerService = jwtAuthService["tenantPartnerService"] as TenantPartnerService;
      (tenantPartnerService as unknown as { userRoles: TenantUserRoleRecord[] }).userRoles = [
        tenantUserRole,
      ];
      const googleAdapter = new GoogleWorkloadIdentityAdapter(identityRepo);
      controller = new AuthController(
        jwtAuthService,
        tenantPartnerService,
        {} as never,
        undefined,
        undefined,
        undefined,
        identityRepo,
        undefined,
        googleAdapter,
        undefined,
      );
    });

    it("R2-tenant: two exchanges with no x-session-id both stay valid with distinct session ids; a genuine role change still invalidates both", async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);

      const first = await controller.issueToken({
        headers: {
          [GOOGLE_WORKLOAD_IDENTITY_HEADER]: signGoogleAssertion(
            nowSeconds - 60,
          ),
          "x-actor-type": "tenant_admin",
          "x-actor-id": TENANT_USER_ID,
          "x-realm": "tenant",
          "x-tenant-id": TENANT_ID,
        },
        method: "POST",
        originalUrl: "/api/auth/token",
      } as never);

      const second = await controller.issueToken({
        headers: {
          [GOOGLE_WORKLOAD_IDENTITY_HEADER]: signGoogleAssertion(
            nowSeconds - 30,
          ),
          "x-actor-type": "tenant_admin",
          "x-actor-id": TENANT_USER_ID,
          "x-realm": "tenant",
          "x-tenant-id": TENANT_ID,
        },
        method: "POST",
        originalUrl: "/api/auth/token",
      } as never);

      expect(first.token).not.toBe(second.token);

      const firstPayload = jwt.decode(first.token) as { sid?: string };
      const secondPayload = jwt.decode(second.token) as { sid?: string };
      expect(firstPayload.sid).toBeTruthy();
      expect(secondPayload.sid).toBeTruthy();
      // This is the actual reported incident: a mail-verification bootstrap
      // exchange and a running deploy-acceptance exchange for the same
      // tenant admin, neither sending `x-session-id`.
      expect(firstPayload.sid).not.toBe(secondPayload.sid);

      const verifiedSecond = await jwtAuthService.verifyAccessToken(
        second.token,
      );
      expect(verifiedSecond).not.toBeNull();
      const verifiedFirst = await jwtAuthService.verifyAccessToken(
        first.token,
      );
      expect(verifiedFirst).not.toBeNull();

      // A genuine role change (the tenant admin is demoted) must still
      // invalidate every previously issued session for that tenant user.
      (tenantPartnerService as unknown as { userRoles: TenantUserRoleRecord[] }).userRoles = [
        {
          ...tenantUserRole,
          roleCode: "tenant_ops_admin",
          updatedAt: "2026-10-03T00:00:00.000Z",
        },
      ];

      expect(await jwtAuthService.verifyAccessToken(first.token)).toBeNull();
      expect(await jwtAuthService.verifyAccessToken(second.token)).toBeNull();
    });
  });
});

// R3 repair (third reopen): R1/R2 made a *sequential* reauthentication for
// an *existing* role binding safe, but left a narrower window open.
// GoogleWorkloadIdentityAdapter.verifyServicePrincipal decides a role
// binding's `validFrom` from a prior, non-atomic read
// (IdentityRepository.findRoleBindingsByMembershipId): if no binding is
// found, it treats this as a true first grant and submits its own
// `authTime` as `validFrom`. Two *concurrent* first-time authentications
// for the same previously-unseen ops principal can both read "no existing
// binding" before either writes. Both then submit a candidate `validFrom`;
// whichever `ensureRoleBindingRecord` call lands second used to overwrite
// the first call's already-persisted `validFrom`/`updatedAt`
// (IdentityRepository.upsertRoleBinding / upsertFallbackRoleBinding took
// `valid_from` unconditionally from the caller on conflict), bumping the
// workforce token version fingerprint out from under the first,
// already-issued, still-valid session.
//
// The fix makes `validFrom` set-once at the repository layer, exactly like
// `createdAt`: once a role-binding row exists, neither upsert path ever
// changes its `validFrom` again, regardless of which racing caller's read
// decided to submit a fresh candidate. This converges correctly regardless
// of write order, without needing the two callers' reads to agree.
//
// This test drives the real controller/adapter/repository and
// deterministically forces the exact interleaving above: both calls must
// reach `ensureRoleBindingRecord` (i.e. both adapters have already made
// their validFrom decision from a stale "no existing binding" read) before
// either call's actual write is allowed to proceed.
describe("SR-AUTH-SESSION-SUPERSEDE-20261003 R3: concurrent first-time authentication for a previously unseen role binding", () => {
  const AUDIENCE = "https://api.dev.drts.internal";
  const SERVICE_ACCOUNT_EMAIL =
    "review-ops-r3@dev-project.iam.gserviceaccount.com";
  const OPS_PRINCIPAL_ID = "review-ops-r3";

  const googleKeyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const googleJwk = googleKeyPair.publicKey.export({ format: "jwk" }) as {
    kty: string;
    n: string;
    e: string;
  };
  const GOOGLE_KID = "google-test-key-r3";

  const ORIGINAL_ENV = { ...process.env };

  let identityRepo: IdentityRepository;
  let jwtAuthService: JwtAuthService;
  let controller: AuthController;

  function signGoogleAssertion(iatSeconds: number): string {
    return jwt.sign(
      {
        iss: "https://accounts.google.com",
        sub: "google-subject-review-ops-r3",
        email: SERVICE_ACCOUNT_EMAIL,
        email_verified: true,
        aud: AUDIENCE,
        iat: iatSeconds,
        exp: iatSeconds + 300,
      },
      googleKeyPair.privateKey,
      { algorithm: "RS256", keyid: GOOGLE_KID },
    );
  }

  function makeDeferred<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.DRTS_ENV = "development";
    process.env.NODE_ENV = "production";
    process.env.JWT_KEY_RING_JSON = JSON.stringify([
      {
        kid: "key-test-2026",
        status: "active",
        algorithm: "RS256",
        privateKey: testRsaKey.privateKey,
        publicKey: testRsaKey.publicKey,
      },
    ]);
    process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS = JSON.stringify([
      {
        serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
        principalId: OPS_PRINCIPAL_ID,
        actorId: OPS_PRINCIPAL_ID,
        displayName: "Review Ops R3",
        roles: ["ops_user"],
        scopes: [],
        allowedTokenAudiences: [AUDIENCE],
        routeScopes: ["* *"],
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            keys: [
              {
                kty: googleJwk.kty,
                kid: GOOGLE_KID,
                n: googleJwk.n,
                e: googleJwk.e,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    identityRepo = new IdentityRepository();
    jwtAuthService = new JwtAuthService(identityRepo);
    const googleAdapter = new GoogleWorkloadIdentityAdapter(identityRepo);
    controller = new AuthController(
      jwtAuthService,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      identityRepo,
      undefined,
      googleAdapter,
      undefined,
    );
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("R3: two sessions from concurrent first-time authentications for the same new principal both stay valid", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);

    const writeStarted = [makeDeferred<void>(), makeDeferred<void>()];
    const writeGate = [makeDeferred<void>(), makeDeferred<void>()];
    let callIndex = 0;

    const originalEnsure =
      identityRepo.ensureRoleBindingRecord.bind(identityRepo);
    const ensureSpy = vi
      .spyOn(identityRepo, "ensureRoleBindingRecord")
      .mockImplementation(async (roleBinding) => {
        const index = callIndex++;
        // By this point the adapter has already made its validFrom decision
        // from its own (independent, stale) read -- pausing here, before
        // the real write, forces both concurrent callers' decisions to be
        // made from "no existing binding" before either write proceeds.
        writeStarted[index]?.resolve();
        await writeGate[index]?.promise;
        return originalEnsure(roleBinding);
      });

    const headers = (sessionSuffix: string, iatOffsetSeconds: number) => ({
      [GOOGLE_WORKLOAD_IDENTITY_HEADER]: signGoogleAssertion(
        nowSeconds + iatOffsetSeconds,
      ),
      "x-actor-type": "ops_user",
      "x-actor-id": OPS_PRINCIPAL_ID,
      "x-realm": "ops",
      "x-session-id": `r3-session-${sessionSuffix}`,
    });

    const firstPromise = controller.issueToken({
      headers: headers("a", -60),
      method: "POST",
      originalUrl: "/api/auth/token",
    } as never);
    const secondPromise = controller.issueToken({
      headers: headers("b", -30),
      method: "POST",
      originalUrl: "/api/auth/token",
    } as never);

    await writeStarted[0]!.promise;
    await writeStarted[1]!.promise;
    expect(callIndex).toBe(2);

    writeGate[0]!.resolve();
    const first = await firstPromise;

    writeGate[1]!.resolve();
    const second = await secondPromise;

    ensureSpy.mockRestore();

    expect(first.token).not.toBe(second.token);

    const verifiedSecond = await jwtAuthService.verifyAccessToken(
      second.token,
    );
    expect(verifiedSecond).not.toBeNull();

    // This is the R3 regression: completing the second, concurrent
    // first-time authentication must not retroactively overwrite the role
    // binding's validFrom/updatedAt out from under the first, already-valid
    // session.
    const verifiedFirst = await jwtAuthService.verifyAccessToken(
      first.token,
    );
    expect(verifiedFirst).not.toBeNull();
  });
});

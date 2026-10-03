import { generateKeyPairSync } from "node:crypto";
import * as jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { AuthController } from "../../../../apps/api/src/modules/auth/auth.controller";
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

import { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import {
  issueControlPlaneRequestAuth,
  stripControlPlaneAuthQueryParams,
  signTestIapJwtAssertion,
  DEFAULT_CONTROL_PLANE_JWT_AUDIENCE,
  DEFAULT_CONTROL_PLANE_JWT_ISSUER,
} from "@drts/control-plane-auth";
import type {
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityRoleBindingRecord,
  CanonicalIdentitySessionRecord,
} from "@drts/contracts";
import { deepToSnakeCase } from "../../apps/api/src/common/snake-case.interceptor";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import { StepUpProofService } from "../../apps/api/src/common/auth/step-up-proof.service";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";
import { ReferralMonthlyRatingController } from "../../apps/api/src/modules/reporting/referral-monthly-rating.controller";
import type { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";

const { Reflector } = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
)("@nestjs/core") as {
  Reflector: new () => ConstructorParameters<typeof BootstrapAuthGuard>[0];
};
type ExecutionContext = Parameters<BootstrapAuthGuard["canActivate"]>[0];

const SECRET = "dev-workforce-canonical-unit-only-signing-key";
const PRINCIPAL = "principal_platform_admin_default";
const ACTIONS = [
  ["platform:partner-entries:create", "/api/platform-admin/partner-entries"],
  [
    "platform:partner-credentials:issue",
    "/api/platform-admin/partner-entries/own/credentials/issue",
  ],
  [
    "platform:partner-credentials:revoke",
    "/api/platform-admin/partner-entries/own/credentials/key/revoke",
  ],
  [
    "platform:partner-entries:revoke",
    "/api/platform-admin/partner-entries/own/revoke",
  ],
] as const;

function context(request: object, open = false): ExecutionContext {
  return {
    getHandler: () =>
      open ? AuthController.prototype.issueToken : () => undefined,
    getClass: () => AuthController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function fixture() {
  const now = new Date(Date.now() - 10_000).toISOString();
  const principal: CanonicalIdentityPrincipalRecord = {
    principalId: PRINCIPAL,
    sourceRef: "existing:principal",
    issuer: "iap_workforce",
    subject: "existing-admin-subject",
    principalType: "human",
    email: "platform-admin@platform.drts",
    emailVerified: true,
    displayName: "Existing Admin",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  const membership: CanonicalIdentityMembershipRecord = {
    membershipId: "membership_platform_admin_default",
    sourceRef: "existing:membership",
    principalId: PRINCIPAL,
    realm: "platform",
    scopeRef: "platform:root",
    tenantId: null,
    partnerId: null,
    status: "active",
    invitedByPrincipalId: null,
    invitationId: null,
    createdAt: now,
    updatedAt: now,
  };
  const binding: CanonicalIdentityRoleBindingRecord = {
    roleBindingId: "existing-admin-binding",
    sourceRef: "existing:binding",
    membershipId: membership.membershipId,
    roleCode: "platform_admin",
    grantedByPrincipalId: null,
    approvalId: null,
    validFrom: now,
    validTo: null,
    createdAt: now,
    updatedAt: now,
  };
  const bindings = [binding];
  const sessions = new Map<string, CanonicalIdentitySessionRecord>();
  // Only canonical storage I/O is controlled. Real controller, JWT signatures,
  // durable-session issuer, guard, MFA waiver and action-bound proofs execute.
  const repository = {
    isEnabled: vi.fn(() => true),
    findPrincipalById: vi.fn(async (id: string) =>
      id === principal.principalId ? principal : null,
    ),
    findMembershipsByPrincipalId: vi.fn(async () => [membership]),
    findRoleBindingsByMembershipId: vi.fn(async () => bindings),
    ensurePrincipalRecord: vi.fn(),
    createSession: vi.fn(async (session: CanonicalIdentitySessionRecord) => {
      sessions.set(session.sessionId, structuredClone(session));
      return session;
    }),
    getSession: vi.fn(async (id: string) => sessions.get(id) ?? null),
  };
  const service = new JwtAuthService(
    repository as unknown as IdentityRepository,
  );
  const events = new SecurityEventsService();
  const controller = new AuthController(
    service,
    {} as never,
    {} as never,
    events,
    undefined,
    undefined,
    repository as unknown as IdentityRepository,
  );
  const proofs = new StepUpProofService(events);
  const guard = new BootstrapAuthGuard(
    new Reflector(),
    service,
    undefined,
    undefined,
    undefined,
    events,
    proofs,
  );
  return {
    principal,
    membership,
    binding,
    bindings,
    sessions,
    repository,
    service,
    controller,
    events,
    proofs,
    guard,
  };
}

function signedProxy(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    {
      controlPlaneProxy: true,
      sub: PRINCIPAL,
      actorType: "platform_admin",
      realm: "platform",
      tenantId: null,
      roleFamilies: ["platform"],
      roles: ["fabricated-role"],
      scopes: ["invented:scope"],
      ...overrides,
    },
    SECRET,
    {
      issuer: DEFAULT_CONTROL_PLANE_JWT_ISSUER,
      audience: DEFAULT_CONTROL_PLANE_JWT_AUDIENCE,
      expiresIn: "5m",
    },
  );
}
function exchange(
  f: ReturnType<typeof fixture>,
  token = signedProxy(),
  extra: Record<string, string> = {},
) {
  return f.controller.issueToken({
    headers: { "x-drts-authorization": `Bearer ${token}`, ...extra },
    method: "POST",
    originalUrl: "/api/auth/token",
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DRTS_ENV", "development");
  vi.stubEnv("DRTS_DEV_MFA_WAIVED", "true");
  vi.stubEnv("JWT_SECRET", SECRET);
  vi.stubEnv("JWT_ISSUER", DEFAULT_CONTROL_PLANE_JWT_ISSUER);
  vi.stubEnv("JWT_AUDIENCE", DEFAULT_CONTROL_PLANE_JWT_AUDIENCE);
  vi.stubEnv("STRICT_IAP_MODE", "false");
  vi.stubEnv("CONTROL_PLANE_IAP_ENABLED", "false");
  vi.stubEnv("DRTS_DEV_WORKFORCE_PRINCIPAL_ID", PRINCIPAL);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("explicit dev workforce canonical exchange", () => {
  it("uses only the configured server principal reference, never a caller identity selector", async () => {
    const auth = await issueControlPlaneRequestAuth({
      actorType: "platform_admin",
      jwtSecret: SECRET,
      devCanonicalPrincipalId: PRINCIPAL,
      strictIapMode: false,
      iapEnabled: false,
      headers: new Headers({
        "x-principal-id": "foreign",
        "x-actor-id": "foreign",
      }),
    });
    const f = fixture();
    const payload = f.service.verify(
      auth.headers["x-drts-authorization"]!.slice(7),
    );
    expect(payload?.sub).toBe(PRINCIPAL);
    await expect(
      issueControlPlaneRequestAuth({
        actorType: "platform_admin",
        jwtSecret: SECRET,
        devCanonicalPrincipalId: "",
        strictIapMode: false,
        iapEnabled: false,
      }),
    ).rejects.toThrow();
  });
  it("can establish an ops session only from an existing matching ops_user binding", async () => {
    const f = fixture();
    f.membership.realm = "ops";
    f.binding.roleCode = "ops_user";
    const issued = await exchange(
      f,
      signedProxy({ actorType: "ops_user", realm: "ops" }),
    );
    expect(await f.service.verifyAccessToken(issued.token)).toMatchObject({
      actorType: "ops_user",
      realm: "ops",
      roles: ["ops_user"],
    });
    expect(f.repository.ensurePrincipalRecord).not.toHaveBeenCalled();
  });

  it("uses the real open guard, verifies server proxy purpose, persists a session and satisfies all four original actions", async () => {
    const f = fixture();
    const auth = await issueControlPlaneRequestAuth({
      actorType: "platform_admin",
      jwtSecret: SECRET,
      devCanonicalPrincipalId: PRINCIPAL,
      strictIapMode: false,
      iapEnabled: false,
    });
    const request = {
      headers: auth.headers,
      method: "POST",
      originalUrl: "/api/auth/token",
    };
    expect(await f.guard.canActivate(context(request, true))).toBe(true);
    const issued = await f.controller.issueToken(request);
    expect(issued).toMatchObject({
      expiresIn: "8h",
      principalId: PRINCIPAL,
      realm: "platform",
      actorType: "platform_admin",
    });
    expect(issued.sessionId).toBeTruthy();
    const payload = await f.service.verifyAccessToken(issued.token);
    expect(payload).toMatchObject({
      sub: PRINCIPAL,
      principalId: PRINCIPAL,
      membershipId: f.membership.membershipId,
      amr: ["dev_mfa_waived"],
      acr: "aal1",
    });
    expect(payload?.sid).toBeTruthy();
    expect(f.sessions.has(payload!.sid!)).toBe(true);
    expect(f.repository.ensurePrincipalRecord).not.toHaveBeenCalled();
    const identity = f.service.toRequestIdentity(payload!);
    expect(f.controller.getAuthSession(identity).data).toMatchObject({
      active: true,
      identity: { sessionId: payload!.sid },
    });
    for (const [actionId, path] of ACTIONS) {
      const proof = f.proofs.createProof(identity, { actionId });
      expect(proof.stepUpReference).toBeTruthy();
      expect(
        await f.guard.canActivate(
          context({
            method: "POST",
            originalUrl: path,
            headers: {
              "x-drts-authorization": `Bearer ${issued.token}`,
              "x-drts-step-up-reference": proof.stepUpReference!,
            },
          }),
        ),
      ).toBe(true);
    }
    const recorded = await f.events.listEvents(null, {
      eventType: "step_up.proof_issued",
    });
    expect(recorded).toHaveLength(4);
    expect(
      recorded.every((event) => event.reasonCode === "dev_mfa_waived"),
    ).toBe(true);
  });

  it("derives scopes only from current bindings, includes expired binding timestamps and leaves canonical records unchanged", async () => {
    const f = fixture();
    const original = structuredClone(f.principal);
    f.bindings.push({
      ...f.binding,
      roleBindingId: "expired",
      roleCode: "tenant_admin",
      validTo: new Date(Date.now() - 1_000).toISOString(),
      updatedAt: new Date(Date.now() - 500).toISOString(),
    });
    const issued = await exchange(f);
    const payload = await f.service.verifyAccessToken(issued.token);
    expect(payload?.roles).toEqual(["platform_admin"]);
    expect(payload?.scopes).toContain("foundation:write");
    expect(payload?.scopes).not.toContain("invented:scope");
    expect(payload?.tokenVersion).toBe(Date.parse(f.bindings[1]!.updatedAt));
    expect(f.principal).toEqual(original);
    expect(f.repository.ensurePrincipalRecord).not.toHaveBeenCalled();
  });

  it.each(["production", "staging"])(
    "rejects dev exchange in %s",
    async (environment) => {
      vi.stubEnv("DRTS_ENV", environment);
      const f = fixture();
      await expect(exchange(f)).rejects.toThrow();
      expect(f.repository.createSession).not.toHaveBeenCalled();
    },
  );
  it.each([
    "DRTS_DEV_MFA_WAIVED",
    "STRICT_IAP_MODE",
    "CONTROL_PLANE_IAP_ENABLED",
  ])("fails closed when %s disallows this branch", async (name) => {
    vi.stubEnv(name, name === "DRTS_DEV_MFA_WAIVED" ? "false" : "true");
    const f = fixture();
    await expect(exchange(f)).rejects.toThrow();
    expect(f.repository.createSession).not.toHaveBeenCalled();
  });
  it.each([
    { controlPlaneProxy: false },
    { actorType: "platform_admin", realm: "ops" },
    { actorType: "ops_user", realm: "platform" },
    { actorType: "ops_observer", realm: "ops" },
    { tenantId: "foreign" },
    { partnerId: "foreign" },
    { principalId: "foreign" },
    { sid: "partial" },
    { jti: "partial" },
    { tokenVersion: 1 },
    { auth_time: 1 },
    { amr: ["mfa"] },
    { acr: "aal2" },
    { policyVersion: "claimed" },
  ])(
    "rejects wrong purpose/realm or session/assurance claims %j",
    async (claims) => {
      const f = fixture();
      await expect(exchange(f, signedProxy(claims))).rejects.toThrow();
      expect(f.repository.createSession).not.toHaveBeenCalled();
    },
  );
  it.each([
    "x-actor-type",
    "x-session-id",
    "x-amr",
    "x-acr",
    "x-auth-time",
    "x-tenant-id",
    "x-drts-internal-key",
    "x-drts-workload-assertion",
    "x-drts-google-id-token",
  ])("rejects mixed raw header %s", async (header) => {
    const f = fixture();
    await expect(
      exchange(f, signedProxy(), { [header]: "untrusted" }),
    ).rejects.toThrow();
    expect(f.repository.createSession).not.toHaveBeenCalled();
  });
  it("rejects forged proof even if a caller pre-populates request.identity", async () => {
    const f = fixture();
    await expect(
      f.controller.issueToken({
        headers: { "x-drts-authorization": "Bearer forged" },
        identity: { actorType: "platform_admin", realm: "platform" },
      } as never),
    ).rejects.toThrow();
    expect(f.repository.findPrincipalById).not.toHaveBeenCalled();
  });
  it.each([
    "disabled",
    "missing principal",
    "inactive principal",
    "inactive membership",
    "wrong membership",
    "missing binding",
    "expired binding",
    "future binding",
  ])("rejects unavailable canonical authority: %s", async (change) => {
    const f = fixture();
    if (change === "disabled") f.repository.isEnabled.mockReturnValue(false);
    if (change === "missing principal")
      f.repository.findPrincipalById.mockResolvedValue(null);
    if (change === "inactive principal") f.principal.status = "suspended";
    if (change === "inactive membership") f.membership.status = "suspended";
    if (change === "wrong membership") f.membership.principalId = "foreign";
    if (change === "missing binding") f.bindings.splice(0);
    if (change === "expired binding")
      f.binding.validTo = new Date(Date.now() - 1_000).toISOString();
    if (change === "future binding")
      f.binding.validFrom = new Date(Date.now() + 60_000).toISOString();
    await expect(exchange(f)).rejects.toThrow();
    expect(f.repository.createSession).not.toHaveBeenCalled();
  });
  it("does not turn an existing ops observer into ops_user", async () => {
    const f = fixture();
    f.membership.realm = "ops";
    f.binding.roleCode = "ops_observer";
    await expect(
      exchange(f, signedProxy({ actorType: "ops_user", realm: "ops" })),
    ).rejects.toThrow();
    expect(f.repository.createSession).not.toHaveBeenCalled();
  });
  it("preserves storage failure, action/session proof binding and revoked-token rejection", async () => {
    const f = fixture();
    f.repository.createSession.mockRejectedValueOnce(
      new Error("controlled storage failure"),
    );
    await expect(exchange(f)).rejects.toThrow("controlled storage failure");
    const first = await exchange(f);
    const second = await exchange(f);
    const firstPayload = await f.service.verifyAccessToken(first.token);
    const secondPayload = await f.service.verifyAccessToken(second.token);
    const proof = f.proofs.createProof(
      f.service.toRequestIdentity(firstPayload!),
      { actionId: ACTIONS[0][0] },
    );
    await expect(
      f.guard.canActivate(
        context({
          method: "POST",
          originalUrl: ACTIONS[0][1],
          headers: { "x-drts-authorization": `Bearer ${first.token}` },
        }),
      ),
    ).rejects.toThrow();
    expect(() =>
      f.proofs.assertRequestSatisfied(
        f.service.toRequestIdentity(secondPayload!),
        {
          method: "POST",
          originalUrl: ACTIONS[0][1],
          headers: { "x-drts-step-up-reference": proof.stepUpReference! },
        },
      ),
    ).toThrow();
    expect(() =>
      f.proofs.assertRequestSatisfied(
        f.service.toRequestIdentity(firstPayload!),
        {
          method: "POST",
          originalUrl: ACTIONS[1][1],
          headers: { "x-drts-step-up-reference": proof.stepUpReference! },
        },
      ),
    ).toThrow();
    f.sessions.get(firstPayload!.sid!)!.status = "revoked";
    expect(await f.service.verifyAccessToken(first.token)).toBeNull();
  });
});

it("round-trips actual Admin BFF, open guard, canonical issuer, snake-case ACK and same-session proof", async () => {
  const f = fixture();
  vi.stubEnv("DRTS_API_URL", "https://api.example.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "https://api.example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith("http://metadata.google.internal/"))
        return new Response("independent-google-invocation");
      const headers = Object.fromEntries(new Headers(init?.headers));
      expect(headers.authorization).toBe(
        "Bearer independent-google-invocation",
      );
      const pathname = new URL(String(input)).pathname;
      const request = {
        method: init?.method ?? "GET",
        originalUrl: pathname,
        headers,
        identity: undefined as
          | Parameters<AuthController["getAuthSession"]>[0]
          | undefined,
      };
      await f.guard.canActivate(
        context(request, pathname === "/api/auth/token"),
      );
      if (pathname === "/api/auth/token")
        return Response.json(
          deepToSnakeCase(await f.controller.issueToken(request)),
          { status: 201 },
        );
      if (pathname === "/api/auth/session")
        return Response.json(
          deepToSnakeCase(f.controller.getAuthSession(request.identity!)),
        );
      if (pathname === "/api/identity/step-up-proofs")
        return Response.json(
          deepToSnakeCase({
            data: f.proofs.createProof(
              request.identity!,
              JSON.parse(await new Response(init?.body).text()),
            ),
          }),
          { status: 201 },
        );
      throw new Error("Unexpected controlled route");
    }),
  );
  const route =
    await import("../../apps/platform-admin-web/app/control-plane-proxy/[...path]/route");
  const create = await route.POST(
    new NextRequest(
      "https://private.example.test/control-plane-proxy/auth/token",
      { method: "POST" },
    ),
    { params: Promise.resolve({ path: ["auth", "token"] }) },
  );
  const ack = await create.json();
  expect(ack.session_id).toBeTruthy();
  expect(ack.principal_id).toBe(PRINCIPAL);
  const session = await route.GET(
    new NextRequest(
      "https://private.example.test/control-plane-proxy/auth/session",
      { headers: { "x-drts-authorization": `Bearer ${ack.token}` } },
    ),
    { params: Promise.resolve({ path: ["auth", "session"] }) },
  );
  expect((await session.json()).data.identity.session_id).toBe(ack.session_id);
  const proof = await route.POST(
    new NextRequest(
      "https://private.example.test/control-plane-proxy/identity/step-up-proofs",
      {
        method: "POST",
        headers: {
          "x-drts-authorization": `Bearer ${ack.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ actionId: ACTIONS[0][0] }),
      },
    ),
    { params: Promise.resolve({ path: ["identity", "step-up-proofs"] }) },
  );
  expect((await proof.json()).data.step_up_reference).toBeTruthy();
});

// Actual BFF modules, controlled metadata/upstream network; never a VM server.
describe.each(["platform-admin-web", "ops-console-web"])(
  "%s dev inner bearer transport",
  (app) => {
    it("retains supplied app bearer and independent invocation proof; invalid app bearer never falls back", async () => {
      vi.stubEnv("DRTS_API_URL", "https://api.example.test");
      vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "https://api.example.test");
      const upstream = vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          if (String(input).startsWith("http://metadata.google.internal/"))
            return new Response("independent-google-invocation");
          const headers = new Headers(init?.headers);
          expect(headers.get("authorization")).toBe(
            "Bearer independent-google-invocation",
          );
          expect(headers.get("x-drts-authorization")).toBe(
            "Bearer invalid-supplied-app-session",
          );
          expect(headers.has("x-roles")).toBe(false);
          return Response.json(
            { error: { code: "JWT_INVALID" } },
            { status: 401 },
          );
        },
      );
      vi.stubGlobal("fetch", upstream);
      const route =
        app === "platform-admin-web"
          ? await import("../../apps/platform-admin-web/app/control-plane-proxy/[...path]/route")
          : await import("../../apps/ops-console-web/app/control-plane-proxy/[...path]/route");
      const response = await route.POST(
        new NextRequest(
          "https://private.example.test/control-plane-proxy/identity/step-up-proofs",
          {
            method: "POST",
            headers: {
              "x-drts-authorization": "Bearer invalid-supplied-app-session",
              "x-roles": "platform_admin",
            },
            body: "{}",
          },
        ),
        { params: Promise.resolve({ path: ["identity", "step-up-proofs"] }) },
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: { code: "JWT_INVALID" },
      });
      expect(upstream).toHaveBeenCalledTimes(2);
    });
    it("still requires original IAP assertion when IAP is enabled, even with a supplied bearer", async () => {
      vi.stubEnv("CONTROL_PLANE_IAP_ENABLED", "true");
      const network = vi.fn();
      vi.stubGlobal("fetch", network);
      const route =
        app === "platform-admin-web"
          ? await import("../../apps/platform-admin-web/app/control-plane-proxy/[...path]/route")
          : await import("../../apps/ops-console-web/app/control-plane-proxy/[...path]/route");
      const response = await route.GET(
        new NextRequest(
          "https://private.example.test/control-plane-proxy/platform-admin/partner-entries",
          { headers: { "x-drts-authorization": "Bearer supplied" } },
        ),
        {
          params: Promise.resolve({
            path: ["platform-admin", "partner-entries"],
          }),
        },
      );
      expect(response.status).toBe(401);
      expect(network).not.toHaveBeenCalled();
    });
  },
);

// Real proxy entry points; only the external API fetch is controlled. This
// reproduces the report-filter loss before changing the shared query stripper.
const REPORT_OPERATIONS = [
  ["GET", "reports/daily-dispatch-records"],
  ["GET", "reports/referral-monthly-ratings"],
  ["GET", "reports/referral-monthly-ratings/governance"],
  ["POST", "reports/referral-monthly-ratings/governance/evaluate"],
] as const;
const REPORT_APPS = [
  "platform-admin-web",
  "ops-console-web",
  "roc-console-web",
] as const;

async function reportProxy(app: (typeof REPORT_APPS)[number]) {
  if (app === "platform-admin-web")
    return import("../../apps/platform-admin-web/app/control-plane-proxy/[...path]/route");
  if (app === "ops-console-web")
    return import("../../apps/ops-console-web/app/control-plane-proxy/[...path]/route");
  return import("../../apps/roc-console-web/app/control-plane-proxy/[...path]/route");
}

it("keeps default anti-spoof stripping and rejects unsupported methods, routes and ambiguous business filters", () => {
  for (const [method, path, value] of [
    [undefined, "/api/reports/daily-dispatch-records", "tenant-a"],
    ["POST", "/api/reports/daily-dispatch-records", "tenant-a"],
    [
      "GET",
      "/api/reports/referral-monthly-ratings/governance/evaluate",
      "tenant-a",
    ],
    [
      "POST",
      "/api/reports/referral-monthly-ratings/governance/outcomes",
      "tenant-a",
    ],
    ["GET", "/api/reports/monthly-operations-summaries", "tenant-a"],
    ["GET", "/api/reports/operations-summary/preview", "tenant-a"],
    ["GET", "/api/reports/dispatchable-supply-snapshots", "tenant-a"],
    ["GET", "/api/reports/jobs", "tenant-a"],
    ["GET", "/api/regulatory/reports/jobs", "tenant-a"],
  ] as const) {
    const url = new URL(
      `https://api.example.test${path}?tenantId=${value}&actorId=forged&realm=agency&roles=admin&scopes=reports:write&authMode=jwt_bearer&email=business%40example.test`,
    );
    stripControlPlaneAuthQueryParams(url, method);
    expect(url.searchParams.has("tenantId"), `${method} ${path} ${value}`).toBe(
      false,
    );
    for (const key of ["actorId", "realm", "roles", "scopes", "authMode"])
      expect(url.searchParams.has(key)).toBe(false);
    expect(url.searchParams.get("email")).toBe("business@example.test");
  }
});

describe.each(REPORT_APPS)("%s report business query boundary", (app) => {
  it.each(REPORT_OPERATIONS)(
    "rejects supplied invalid tenantId instead of forwarding unfiltered on %s %s",
    async (method, path) => {
      vi.stubEnv("DRTS_API_URL", "https://api.example.test");
      const outbound = vi.fn(async () => Response.json({ ok: true }));
      vi.stubGlobal("fetch", outbound);
      const route = await reportProxy(app);
      for (const selector of [
        "tenantId=",
        "tenantId=%20%20",
        "tenantId=tenant-a&tenantId=tenant-b",
      ]) {
        const response = await route[method](
          new NextRequest(
            `https://private.example.test/control-plane-proxy/${path}?periodMonth=2026-10&${selector}`,
            {
              method,
              ...(method === "POST"
                ? {
                    body: '{"periodMonth":"2026-10"}',
                    headers: { "content-type": "application/json" },
                  }
                : {}),
            },
          ),
          { params: Promise.resolve({ path: path.split("/") }) },
        );
        expect(response.status).toBe(400);
        expect(outbound).not.toHaveBeenCalled();
      }
      if (method === "POST") {
        // With a single empty camel query value, the controller chooses that
        // string before the snake alias; this is not a valid body override.
        const response = await route.POST(
          new NextRequest(
            `https://private.example.test/control-plane-proxy/${path}?tenantId=`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: '{"tenant_id":"alias-tenant"}',
            },
          ),
          { params: Promise.resolve({ path: path.split("/") }) },
        );
        expect(response.status).toBe(400);
        expect(outbound).not.toHaveBeenCalled();
      }
    },
  );

  it("keeps evaluate body precedence when an invalid query selector is superseded", async () => {
    vi.stubEnv("DRTS_API_URL", "https://api.example.test");
    const evaluateGovernance = vi.fn(
      async (query: { tenantId?: string; periodMonth?: string }) => {
        expect(query.tenantId).toBe("body-tenant");
        return { records: [] };
      },
    );
    const controller = new ReferralMonthlyRatingController({
      evaluateGovernance,
    } as never);
    const body = '{"periodMonth":"2026-10","tenantId":"body-tenant"}';
    const outbound = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        expect(url.searchParams.has("tenantId")).toBe(false);
        const bytes = await new Response(init?.body).text();
        expect(bytes).toBe(body);
        await controller.evaluateGovernance(
          JSON.parse(bytes),
          Object.fromEntries(url.searchParams),
        );
        return Response.json({ ok: true });
      },
    );
    vi.stubGlobal("fetch", outbound);
    const route = await reportProxy(app);
    const path = "reports/referral-monthly-ratings/governance/evaluate";
    for (const selector of [
      "tenantId=",
      "tenantId=%20%20",
      "tenantId=tenant-a&tenantId=tenant-b",
    ]) {
      const response = await route.POST(
        new NextRequest(
          `https://private.example.test/control-plane-proxy/${path}?${selector}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          },
        ),
        { params: Promise.resolve({ path: path.split("/") }) },
      );
      expect(response.status).toBe(200);
    }
    expect(outbound).toHaveBeenCalledTimes(3);
    expect(evaluateGovernance).toHaveBeenCalledTimes(3);
    for (const [query] of evaluateGovernance.mock.calls)
      expect(query).toMatchObject({
        periodMonth: "2026-10",
        tenantId: "body-tenant",
      });
  });

  it("preserves the evaluate controller snake alias fallback only when camel is not a string", async () => {
    vi.stubEnv("DRTS_API_URL", "https://api.example.test");
    const evaluateGovernance = vi.fn(async () => ({ records: [] }));
    const controller = new ReferralMonthlyRatingController({
      evaluateGovernance,
    } as never);
    const outbound = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        const body = JSON.parse(await new Response(init?.body).text());
        expect(url.searchParams.has("tenantId")).toBe(false);
        await controller.evaluateGovernance(
          body,
          Object.fromEntries(url.searchParams),
        );
        return Response.json({ ok: true });
      },
    );
    vi.stubGlobal("fetch", outbound);
    const path = "reports/referral-monthly-ratings/governance/evaluate";
    const route = await reportProxy(app);
    const response = await route.POST(
      new NextRequest(
        `https://private.example.test/control-plane-proxy/${path}?tenantId=tenant-a&tenantId=tenant-b`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"periodMonth":"2026-10","tenant_id":"alias-tenant"}',
        },
      ),
      { params: Promise.resolve({ path: path.split("/") }) },
    );
    expect(response.status).toBe(200);
    expect(evaluateGovernance).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "alias-tenant" }),
      expect.anything(),
    );
    expect(outbound).toHaveBeenCalledTimes(1);
    // On the original repeated query the real controller also selects the
    // snake alias because the camel value is an array, not a string.
    await controller.evaluateGovernance(
      { tenant_id: "alias-tenant" } as never,
      { tenantId: ["tenant-a", "tenant-b"] as never },
    );
    expect(evaluateGovernance).toHaveBeenCalledTimes(2);
    expect(evaluateGovernance).toHaveBeenLastCalledWith(
      expect.objectContaining({ tenantId: "alias-tenant" }),
      expect.anything(),
    );
  });

  it.each(REPORT_OPERATIONS)(
    "allows an omitted optional tenantId on %s %s",
    async (method, path) => {
      vi.stubEnv("DRTS_API_URL", "https://api.example.test");
      const outbound = vi.fn(async (input: string | URL | Request) => {
        expect(new URL(String(input)).searchParams.has("tenantId")).toBe(false);
        return Response.json({ ok: true });
      });
      vi.stubGlobal("fetch", outbound);
      const route = await reportProxy(app);
      const response = await route[method](
        new NextRequest(
          `https://private.example.test/control-plane-proxy/${path}?periodMonth=2026-10`,
          {
            method,
            ...(method === "POST"
              ? {
                  body: '{"periodMonth":"2026-10"}',
                  headers: { "content-type": "application/json" },
                }
              : {}),
          },
        ),
        { params: Promise.resolve({ path: path.split("/") }) },
      );
      expect(response.status).toBe(200);
      expect(outbound).toHaveBeenCalledTimes(1);
    },
  );

  it.each(REPORT_OPERATIONS)(
    "forwards legal tenantId on %s %s without promoting query identity",
    async (method, path) => {
      vi.stubEnv("DRTS_API_URL", "https://api.example.test");
      const outbound = vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = new URL(String(input));
          expect(url.pathname).toBe(`/api/${path}`);
          expect(url.searchParams.get("tenantId")).toBe("tenant-business-a");
          expect(url.searchParams.get("periodMonth")).toBe("2026-10");
          if (path === "reports/daily-dispatch-records") {
            for (const [key, value] of Object.entries({
              serviceDateFrom: "2026-10-01",
              serviceDateTo: "2026-10-31",
              orderSource: "app",
              partnerId: "partner-a",
              serviceProductCode: "product-a",
              finalStatus: "completed",
            }))
              expect(url.searchParams.get(key)).toBe(value);
          }
          expect(url.searchParams.has("actorId")).toBe(false);
          expect(url.searchParams.has("realm")).toBe(false);
          const headers = new Headers(init?.headers);
          expect(headers.has("x-actor-id")).toBe(false);
          expect(headers.has("x-tenant-id")).toBe(false);
          expect(headers.get("x-drts-authorization")).toMatch(/^Bearer /);
          if (method === "POST")
            expect(await new Response(init?.body).text()).toBe(
              '{"tenantId":"body-wins"}',
            );
          return Response.json({ ok: true });
        },
      );
      vi.stubGlobal("fetch", outbound);
      const route = await reportProxy(app);
      const request = new NextRequest(
        `https://private.example.test/control-plane-proxy/${path}?tenantId=tenant-business-a&periodMonth=2026-10&serviceDateFrom=2026-10-01&serviceDateTo=2026-10-31&orderSource=app&partnerId=partner-a&serviceProductCode=product-a&finalStatus=completed&actorId=forged&realm=agency`,
        {
          method,
          headers: { "x-actor-id": "forged", "x-roles": "superadmin" },
          ...(method === "POST" ? { body: '{"tenantId":"body-wins"}' } : {}),
        },
      );
      const response = await route[method](request, {
        params: Promise.resolve({ path: path.split("/") }),
      });
      expect(response.status).toBe(200);
      expect(outbound).toHaveBeenCalledTimes(1);
    },
  );

  it("strips tenantId on unsupported BFF paths/methods without dropping other filters", async () => {
    vi.stubEnv("DRTS_API_URL", "https://api.example.test");
    const outbound = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.has("tenantId")).toBe(false);
      expect(url.searchParams.get("periodMonth")).toBe("2026-10");
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", outbound);
    const route = await reportProxy(app);
    for (const [method, path] of [
      ["POST", "reports/daily-dispatch-records"],
      ["GET", "reports/jobs"],
      ["GET", "reports/monthly-operations-summaries"],
      ["GET", "reports/dispatchable-supply-snapshots"],
      ["GET", "regulatory/reports/jobs"],
    ] as const) {
      const response = await route[method](
        new NextRequest(
          `https://private.example.test/control-plane-proxy/${path}?tenantId=tenant-business-a&periodMonth=2026-10`,
          { method },
        ),
        { params: Promise.resolve({ path: path.split("/") }) },
      );
      expect(response.status).toBe(200);
    }
    expect(outbound).toHaveBeenCalledTimes(5);
  });

  it("requires a verified IAP assertion in strict mode; query identity cannot replace one", async () => {
    vi.stubEnv("DRTS_ENV", "staging");
    vi.stubEnv("DRTS_API_URL", "https://api.example.test");
    vi.stubEnv("IAP_JWT_SECRET_OR_PUBLIC_KEY", SECRET);
    vi.stubEnv("IAP_EXPECTED_AUDIENCE", "unit-audience");
    const outbound = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        const token = headers.get("x-drts-authorization")?.slice(7);
        expect(token).toBeTruthy();
        const claims = jwt.verify(token!, SECRET) as jwt.JwtPayload;
        expect(claims.tenantId).toBeNull();
        expect(claims.realm).toBe(
          app === "platform-admin-web" ? "platform" : "ops",
        );
        expect(headers.has("x-actor-id")).toBe(false);
        return Response.json({ ok: true });
      },
    );
    vi.stubGlobal("fetch", outbound);
    const route = await reportProxy(app);
    const path = "reports/daily-dispatch-records";
    const target = `https://private.example.test/control-plane-proxy/${path}?tenantId=business-a&actorId=spoofed`;
    const params = { params: Promise.resolve({ path: path.split("/") }) };
    const denied = await route.GET(
      new NextRequest(target, {
        headers: { "x-goog-authenticated-user-email": "admin@platform.drts" },
      }),
      params,
    );
    expect(denied.status).toBe(401);
    expect(outbound).not.toHaveBeenCalled();
    const assertion = signTestIapJwtAssertion(
      {
        sub: "verified-workforce-subject",
        email: "admin@platform.drts",
        aud: "unit-audience",
      },
      SECRET,
    );
    const accepted = await route.GET(
      new NextRequest(target, {
        headers: { "x-goog-iap-jwt-assertion": assertion },
      }),
      params,
    );
    expect(accepted.status).toBe(200);
    expect(outbound).toHaveBeenCalledTimes(1);
  });
});

it("retains the original governance evaluate controller body-over-query precedence", async () => {
  const evaluateGovernance = vi.fn(async () => ({ records: [] }));
  const controller = new ReferralMonthlyRatingController({
    evaluateGovernance,
  } as never);
  await controller.evaluateGovernance(
    { tenantId: "body-tenant" },
    { periodMonth: "2026-10", tenantId: "query-tenant", driverId: "driver-a" },
  );
  expect(evaluateGovernance).toHaveBeenCalledWith(
    expect.objectContaining({
      periodMonth: "2026-10",
      tenantId: "body-tenant",
      driverId: "driver-a",
    }),
    expect.objectContaining({ auditEvaluation: true }),
  );
});

it.each(["platform-admin-web", "ops-console-web"] as const)(
  "%s retains the real API durable JWT validity, authorized realm/scopes and revocation for filtered requests",
  async (app) => {
    const f = fixture();
    if (app === "ops-console-web") {
      f.membership.realm = "ops";
      f.binding.roleCode = "ops_user";
    }
    const token = signedProxy(
      app === "ops-console-web" ? { actorType: "ops_user", realm: "ops" } : {},
    );
    const issued = await exchange(f, token);
    vi.stubEnv("DRTS_API_URL", "https://api.example.test");
    const outbound = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const request = {
          method: init?.method ?? "GET",
          originalUrl:
            new URL(String(input)).pathname + new URL(String(input)).search,
          headers: Object.fromEntries(new Headers(init?.headers)),
          identity: undefined as
            | ReturnType<JwtAuthService["toRequestIdentity"]>
            | undefined,
        };
        try {
          await f.guard.canActivate(context(request));
        } catch (error: unknown) {
          return Response.json(
            {
              error: {
                code: (error as { code?: string }).code ?? "JWT_INVALID",
              },
            },
            { status: 401 },
          );
        }
        expect(request.identity?.tenantId).toBeNull();
        expect(request.identity?.realm).toBe(
          app === "platform-admin-web" ? "platform" : "ops",
        );
        expect(new URL(String(input)).searchParams.get("tenantId")).toBe(
          "business-a",
        );
        return Response.json({ ok: true });
      },
    );
    vi.stubGlobal("fetch", outbound);
    const route = await reportProxy(app);
    const path = "reports/referral-monthly-ratings/governance/evaluate";
    const target = `https://private.example.test/control-plane-proxy/${path}?tenantId=business-a&scopes=reports:write`;
    const params = { params: Promise.resolve({ path: path.split("/") }) };
    const call = (bearer: string) =>
      route.POST(
        new NextRequest(target, {
          method: "POST",
          headers: { "x-drts-authorization": `Bearer ${bearer}` },
          body: "{}",
        }),
        params,
      );
    expect((await call(issued.token)).status).toBe(200);
    expect((await call("invalid-app-session")).status).toBe(401);
    const session = (await f.service.verifyAccessToken(issued.token))?.sid;
    expect(session).toBeTruthy();
    f.sessions.get(session!)!.status = "revoked";
    expect((await call(issued.token)).status).toBe(401);
    expect(outbound).toHaveBeenCalledTimes(3);
  },
);

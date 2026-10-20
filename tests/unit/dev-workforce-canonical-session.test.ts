import { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import {
  issueControlPlaneRequestAuth,
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

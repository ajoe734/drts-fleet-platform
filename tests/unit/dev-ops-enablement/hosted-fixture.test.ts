import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_SCOPE_PRESETS } from "../../../apps/api/src/common/auth/auth.constants";
import { JourneyFailure } from "../../../tests/e2e/owned-referral-business-journey/protocol";
import { ROLE_ACTION } from "../../../tools/dev-ops-enablement/core";
import {
  HOSTED_API,
  prepareHostedOpsFixture,
  validateHostedFixtureEnvironment,
  type HostedFixtureJournal,
} from "../../../tools/dev-ops-enablement/hosted-fixture";

const SECRET = "synthetic-hosted-fixture-signing-key";
const ADMIN = "principal_platform_admin_default";
const OPS = "principal_actual_existing_ops";
const MEMBER = "membership_actual_existing_ops";
const environment: NodeJS.ProcessEnv = {
  GITHUB_ACTIONS: "true",
  DRTS_HOSTED_OPS_FIXTURE_SETUP: "true",
  DRTS_ENV: "test",
  AUTH_MODE: "test",
  DRTS_API_URL: HOSTED_API,
  DRTS_DEV_MFA_WAIVED: "true",
  STRICT_IAP_MODE: "false",
  CONTROL_PLANE_IAP_ENABLED: "false",
  JWT_SECRET: SECRET,
  JWT_ISSUER: "drts-local",
  JWT_AUDIENCE: "drts-api",
};

beforeEach(() => {
  for (const [key, value] of Object.entries(environment))
    vi.stubEnv(key, value);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Synthetic HTTP port only; real package proof signing and core contracts run. */
function fixture() {
  const saved: HostedFixtureJournal[] = [];
  const calls: {
    path: string;
    method: string;
    body: unknown;
    authorization: string | null;
  }[] = [];
  const issued: { actor: string; principalId: string }[] = [];
  const state = {
    user: {
      userId: MEMBER,
      canonicalPrincipalId: OPS,
      canonicalRealm: "ops",
      email: "ops@platform.drts",
      roleCode: "operator",
      status: "invited",
    },
    activated: false,
    activationStatus: 200,
    foreignAck: false,
    foreignReadback: false,
    foreignOpsMember: false,
    foreignOpsRealm: false,
    proofAction: ROLE_ACTION as string,
    cleanupFailure: false,
    revokedReadback: "401" as "401" | "false" | "missing" | "active",
    revoked: new Set<string>(),
  };
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(HOSTED_API);
    const headers = new Headers(init?.headers);
    const body: unknown = init?.body
      ? JSON.parse(String(init.body))
      : undefined;
    const path = url.pathname;
    const method = init?.method ?? "GET";
    const authorization = headers.get("authorization");
    calls.push({ path, method, body, authorization });
    const ok = (data: unknown, status = 200) =>
      Response.json({ data }, { status });
    if (path === "/api/auth/token") {
      expect(authorization).toBeNull();
      const proof = headers.get("x-drts-authorization");
      expect(proof?.startsWith("Bearer ")).toBe(true);
      const payload = jwt.verify(proof!.slice(7), SECRET, {
        issuer: "drts-local",
        audience: "drts-api",
      });
      if (typeof payload === "string")
        throw new Error("Normal package JWT object required");
      expect(payload.controlPlaneProxy).toBe(true);
      expect(payload.sid).toBeUndefined();
      expect(payload.jti).toBeUndefined();
      const actor = payload.actorType as string;
      const principalId = payload.sub!;
      expect(principalId).toBe(actor === "platform_admin" ? ADMIN : OPS);
      issued.push({ actor, principalId });
      const role = actor === "platform_admin" ? "admin" : "ops";
      return Response.json({
        token: `synthetic-${role}-token`,
        sessionId: `synthetic-${role}-sid`,
      });
    }
    const role =
      authorization === "Bearer synthetic-admin-token" ? "admin" : "ops";
    expect(authorization).toBe(`Bearer synthetic-${role}-token`);
    if (path === "/api/auth/session") {
      if (state.revoked.has(role)) {
        if (state.revokedReadback === "401")
          return Response.json(
            { error: { code: "SESSION_REVOKED" } },
            { status: 401 },
          );
        return ok(
          state.revokedReadback === "missing"
            ? {}
            : { active: state.revokedReadback === "active" },
        );
      }
      const actor = role === "admin" ? "platform_admin" : "ops_user";
      const principalId = role === "admin" ? ADMIN : OPS;
      return ok({
        active: true,
        identity: {
          authMode: "jwt_bearer",
          actorType: actor,
          actorId: principalId,
          principalId,
          membershipId:
            role === "admin"
              ? "membership_admin"
              : state.foreignOpsMember
                ? "foreign_member"
                : MEMBER,
          realm:
            role === "admin"
              ? "platform"
              : state.foreignOpsRealm
                ? "platform"
                : "ops",
          sessionId: `synthetic-${role}-sid`,
          scopes: AUTH_SCOPE_PRESETS[actor],
        },
      });
    }
    if (path === "/api/platform-admin/users") {
      expect(role).toBe("admin");
      return ok({
        items: [
          {
            ...state.user,
            ...(state.activated ? { status: "active" } : {}),
            ...(state.activated && state.foreignReadback
              ? { canonicalPrincipalId: "foreign_principal" }
              : {}),
          },
        ],
      });
    }
    if (path === "/api/identity/step-up-proofs") {
      expect(role).toBe("admin");
      expect(body).toEqual({
        method: "POST",
        path: `/api/platform-admin/users/${MEMBER}/role`,
      });
      return ok({
        required: true,
        actionId: state.proofAction,
        stepUpReference: "synthetic-exact-proof",
      });
    }
    if (path === `/api/platform-admin/users/${MEMBER}/role`) {
      expect(role).toBe("admin");
      expect(saved.at(-1)?.activation).toBe("ack-unknown");
      expect(headers.get("x-drts-step-up-reference")).toBe(
        "synthetic-exact-proof",
      );
      expect(body).toMatchObject({ roleCode: "operator", status: "active" });
      if (state.activationStatus !== 200)
        return Response.json(
          {
            error: {
              code: "CONFLICT",
              message: "synthetic raw secret must not be saved",
            },
          },
          { status: state.activationStatus },
        );
      state.activated = true;
      return ok({
        ...state.user,
        status: "active",
        ...(state.foreignAck
          ? { canonicalPrincipalId: "foreign_principal" }
          : {}),
      });
    }
    if (path === "/api/auth/sessions/revoke") {
      expect(method).toBe("POST");
      expect(body).toEqual({ sessionId: `synthetic-${role}-sid` });
      if (state.cleanupFailure)
        return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
      state.revoked.add(role);
      return ok({
        revoked: true,
        sessionId: `synthetic-${role}-sid`,
        status: "revoked",
      });
    }
    throw new Error("Unexpected fixture route");
  });
  const persist = vi.fn(async (journal: HostedFixtureJournal) => {
    saved.push(structuredClone(journal));
  });
  return {
    state,
    saved,
    calls,
    issued,
    fetcher,
    persist,
    run: (overrides: NodeJS.ProcessEnv = {}) =>
      prepareHostedOpsFixture(
        { ...environment, ...overrides },
        { fetch: fetcher, persist },
      ),
  };
}

describe("normal isolated hosted Ops fixture", () => {
  it("uses real package proofs, normal items/activation/active readback, same member Ops session, and native own cleanup", async () => {
    const f = fixture();
    const result = await f.run({
      DRTS_DEV_WORKFORCE_PRINCIPAL_ID: "untrusted-parent-value",
    });
    expect(result).toEqual({
      canonicalPrincipalId: OPS,
      membershipId: MEMBER,
      canonicalRealm: "ops",
    });
    expect(f.issued).toEqual([
      { actor: "platform_admin", principalId: ADMIN },
      { actor: "ops_user", principalId: OPS },
    ]);
    expect(f.calls.filter((c) => c.path.endsWith("/role"))).toHaveLength(1);
    expect(f.saved.at(-1)).toMatchObject({
      completed: true,
      activation: "acknowledged",
      canonicalOpsVerified: true,
      actualCanonicalRealm: "ops",
      cleaned: ["ops", "admin"],
      cleanupErrors: [],
      failure: null,
    });
    const stored = JSON.stringify(f.saved);
    for (const secret of [
      "synthetic-admin-token",
      "synthetic-ops-token",
      "synthetic-admin-sid",
      "synthetic-ops-sid",
      "synthetic-exact-proof",
      SECRET,
    ])
      expect(stored).not.toContain(secret);
  });

  it.each([
    ["GITHUB_ACTIONS", "false"],
    ["DRTS_HOSTED_OPS_FIXTURE_SETUP", "false"],
    ["DRTS_ENV", "production"],
    ["AUTH_MODE", "jwt"],
    ["DRTS_API_URL", "http://localhost:3001"],
    ["DRTS_API_URL", "https://foreign.example.test"],
    ["DRTS_DEV_MFA_WAIVED", "false"],
    ["STRICT_IAP_MODE", "true"],
    ["CONTROL_PLANE_IAP_ENABLED", "true"],
    ["JWT_SECRET", ""],
    ["PAX_REVIEW_OPS_FIXTURE_EVIDENCE_DIR", ".artifacts/../foreign"],
  ])(
    "refuses %s=%s before requests or evidence mutation",
    async (key, value) => {
      const f = fixture();
      await expect(f.run({ [key]: value })).rejects.toThrow();
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(f.persist).not.toHaveBeenCalled();
    },
  );

  it("allows only the existing full bureau evidence directory alternative", () => {
    expect(
      validateHostedFixtureEnvironment({
        ...environment,
        PAX_REVIEW_OPS_FIXTURE_EVIDENCE_DIR: ".artifacts/pax-bureau-acceptance",
      }),
    ).toBe(".artifacts/pax-bureau-acceptance");
  });

  it.each(["tenant", "platform"])(
    "refuses existing operator realm %s before writing",
    async (realm) => {
      const f = fixture();
      f.state.user.canonicalRealm = realm;
      await expect(f.run()).rejects.toThrow();
      expect(f.calls.some((c) => c.path.endsWith("/role"))).toBe(false);
      expect(f.issued).toHaveLength(1);
      expect(f.saved.at(-1)?.cleaned).toEqual(["admin"]);
    },
  );

  it("refuses a suspended existing operator without granting a new principal", async () => {
    const f = fixture();
    f.state.user.status = "suspended";
    await expect(f.run()).rejects.toThrow();
    expect(f.calls.some((c) => c.path.endsWith("/role"))).toBe(false);
    expect(f.issued).toHaveLength(1);
  });

  it("rejects a proof for a different action before the mutation", async () => {
    const f = fixture();
    f.state.proofAction = "platform:users:create";
    await expect(f.run()).rejects.toThrow();
    expect(f.calls.some((c) => c.path.endsWith("/role"))).toBe(false);
    expect(f.saved.at(-1)?.activation).toBe("not-attempted");
  });

  it("retains unknown activation ACK and actual HTTP status without retry or raw error storage", async () => {
    const f = fixture();
    f.state.activationStatus = 503;
    await expect(f.run()).rejects.toMatchObject({
      status: 503,
      code: "CONFLICT",
    });
    expect(f.calls.filter((c) => c.path.endsWith("/role"))).toHaveLength(1);
    expect(f.saved.at(-1)).toMatchObject({
      completed: false,
      activation: "ack-unknown",
      cleaned: ["admin"],
    });
    expect(JSON.stringify(f.saved)).not.toContain("synthetic raw secret");
  });

  it("preserves a refusal HTTP status even when the response has no application error object", async () => {
    const f = fixture();
    const fetcher: typeof fetch = (input, init) =>
      new URL(String(input)).pathname.endsWith("/role")
        ? Promise.resolve(Response.json([], { status: 403 }))
        : f.fetcher(input, init);
    await expect(
      prepareHostedOpsFixture(environment, {
        fetch: fetcher,
        persist: f.persist,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.saved.at(-1)).toMatchObject({
      completed: false,
      activation: "ack-unknown",
      cleaned: ["admin"],
    });
  });

  it.each(["foreignAck", "foreignReadback"] as const)(
    "rejects %s and never exchanges an Ops identity",
    async (field) => {
      const f = fixture();
      f.state[field] = true;
      await expect(f.run()).rejects.toThrow();
      expect(f.issued).toHaveLength(1);
      expect(f.saved.at(-1)?.completed).toBe(false);
    },
  );

  it.each(["foreignOpsMember", "foreignOpsRealm"] as const)(
    "rejects %s and still revokes both acknowledged own sessions",
    async (field) => {
      const f = fixture();
      f.state[field] = true;
      await expect(f.run()).rejects.toThrow();
      expect(f.saved.at(-1)).toMatchObject({
        completed: false,
        cleaned: ["ops", "admin"],
        canonicalOpsVerified: false,
      });
    },
  );

  it("fails closed when either own native revocation fails", async () => {
    const f = fixture();
    f.state.cleanupFailure = true;
    await expect(f.run()).rejects.toBeInstanceOf(JourneyFailure);
    expect(f.saved.at(-1)).toMatchObject({
      completed: false,
      cleanupErrors: ["ops", "admin"],
    });
  });

  it.each(["missing", "active"] as const)(
    "does not count 200 %s as inactive",
    async (value) => {
      const f = fixture();
      f.state.revokedReadback = value;
      await expect(f.run()).rejects.toThrow();
      expect(f.saved.at(-1)).toMatchObject({
        completed: false,
        cleaned: [],
        cleanupErrors: ["ops", "admin"],
      });
    },
  );

  it("accepts explicit active:false readback as well as the normal 401 revocation result", async () => {
    const f = fixture();
    f.state.revokedReadback = "false";
    await expect(f.run()).resolves.toMatchObject({ canonicalPrincipalId: OPS });
    expect(f.saved.at(-1)?.completed).toBe(true);
  });
});

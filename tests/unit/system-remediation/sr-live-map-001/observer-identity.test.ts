import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "../../../../apps/api/node_modules/@nestjs/common";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AUTH_SCOPE_PRESETS } from "../../../../apps/api/src/common/auth/auth.constants";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { AuthController } from "../../../../apps/api/src/modules/auth/auth.controller";
import type { GoogleWorkloadIdentityAdapter } from "../../../../apps/api/src/modules/auth/google-workload-identity.adapter";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";

beforeEach(() => {
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("DRTS_E2E_PROVISIONING", "false");
  vi.stubEnv("JWT_SECRET", "unit-only-observer-identity-secret");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("deploys observer provisioning only in the dev API environment", () => {
  const workflow = readFileSync(".github/workflows/deploy-dev.yml", "utf8");
  const directory = mkdtempSync(join(tmpdir(), "c114-dev-env-"));
  try {
    for (const [name, delimiter, expected] of [
      ["Build API env vars", "@", "true"],
      ["Build shared web env vars", ",", undefined],
    ] as const) {
      const step = workflow
        .split(`      - name: ${name}\n`)[1]!
        .split("\n      - name: ")[0]!;
      const script = step
        .split("        run: |\n")[1]!
        .replace(/^ {10}/gm, "")
        .replace(/\$\{\{([^}]+)\}\}/g, (_, expression: string) =>
          expression.includes("origin")
            ? "https://unit.example.test"
            : "unit-value",
        );
      const output = join(directory, name);
      // Only the remote Cloud Run URL lookup is simulated; execute the real
      // workflow shell that emits the environment passed to deployment.
      execFileSync(
        "bash",
        ["-c", `gcloud() { echo https://unit.example.test; }\n${script}`],
        {
          env: {
            PATH: process.env.PATH,
            GITHUB_OUTPUT: output,
            DEV_WORKLOAD_IDENTITY_ISSUER: "unit-issuer",
            DEV_WORKLOAD_IDENTITY_AUDIENCE: "unit-audience",
            ARTIFACT_PROVIDER_ENV_SUFFIX: "",
          },
        },
      );
      const values = Object.fromEntries(
        readFileSync(output, "utf8")
          .trim()
          .replace(/^vars=/, "")
          .split(delimiter)
          .filter((part) => part.includes("="))
          .map((part) => part.split("=", 2)),
      );
      expect(values.DRTS_E2E_PROVISIONING).toBe(expected);
    }
    for (const environment of ["staging", "prod"]) {
      expect(
        readFileSync(`.github/workflows/deploy-${environment}.yml`, "utf8"),
      ).not.toContain("DRTS_E2E_PROVISIONING");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it.each([undefined, "false", "TRUE"])(
  "does not provision the observer for flag %s",
  async (flag) => {
    vi.stubEnv("DRTS_E2E_PROVISIONING", flag);
    const repository = new IdentityRepository();
    await repository.onModuleInit();
    expect(await repository.ensureLiveMapObserverAccount()).toBeNull();
    expect(await repository.findPrincipalById("live-map-observer")).toBeNull();
  },
);

it.each(["staging", "production"])(
  "does not provision a test observer in %s even with the flag set",
  async (environment) => {
    vi.stubEnv("DRTS_ENV", environment);
    vi.stubEnv("DRTS_E2E_PROVISIONING", "true");
    const repository = new IdentityRepository();
    await repository.onModuleInit();
    expect(await repository.ensureLiveMapObserverAccount()).toBeNull();
    expect(await repository.findPrincipalById("live-map-observer")).toBeNull();
  },
);

it("provisions only the read-only live map identity when dev opts in", async () => {
  vi.stubEnv("DRTS_ENV", "development");
  vi.stubEnv("DRTS_E2E_PROVISIONING", "true");
  const repository = new IdentityRepository();
  await repository.onModuleInit();
  const observer = await repository.ensureLiveMapObserverAccount();
  expect(observer?.principal).toMatchObject({
    principalId: "live-map-observer",
    status: "active",
  });
  const memberships =
    await repository.findMembershipsByPrincipalId("live-map-observer");
  expect(memberships).toHaveLength(1);
  expect(memberships[0]).toMatchObject({
    realm: "ops",
    scopeRef: "ops",
    tenantId: null,
    partnerId: null,
  });
  const bindings = await repository.findRoleBindingsByMembershipId(
    memberships[0]!.membershipId,
  );
  expect(bindings.map((binding) => binding.roleCode)).toEqual(["ops_observer"]);
  expect(AUTH_SCOPE_PRESETS.ops_observer).toEqual(["regulatory:read"]);
  expect(await repository.findPrincipalById("drv-demo-002")).toBeNull();
});

// Only the external Google proof boundary is simulated here. The controller,
// memory identity repository, signing and durable verification are production
// code. The real verifier + JWKS path is covered in supported-session-contract.
async function fixture(missing: string) {
  const repository = new IdentityRepository();
  await repository.onModuleInit();
  const now = new Date().toISOString();
  if (missing !== "principal")
    await repository.ensurePrincipalRecord({
      principalId: "verified-observer",
      sourceRef: "google_workload_identity:verified-observer",
      issuer: "https://accounts.google.com",
      subject: "unit-google-subject",
      principalType: "service",
      email: "observer@example.test",
      emailVerified: true,
      displayName: null,
      status: missing === "inactive-principal" ? "disabled" : "active",
      createdAt: now,
      updatedAt: now,
    });
  if (missing !== "membership")
    await repository.ensureMembershipRecord({
      membershipId: "verified-observer-ops",
      sourceRef: "verified-observer-ops",
      principalId: "verified-observer",
      realm: missing === "wrong-realm" ? "platform" : "ops",
      scopeRef: "ops",
      tenantId: null,
      partnerId: null,
      status: missing === "inactive-membership" ? "disabled" : "active",
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: now,
      updatedAt: now,
    });
  if (missing !== "role-binding")
    await repository.ensureRoleBindingRecord({
      roleBindingId: "verified-observer-role",
      sourceRef: "verified-observer-role",
      membershipId: "verified-observer-ops",
      roleCode: missing === "wrong-role" ? "ops_user" : "ops_observer",
      grantedByPrincipalId: null,
      approvalId: null,
      validFrom:
        missing === "future-role"
          ? new Date(Date.now() + 60_000).toISOString()
          : now,
      validTo: missing === "expired-role" ? now : null,
      createdAt: now,
      updatedAt: now,
    });
  const jwt = new JwtAuthService(repository);
  const google = {
    verifyServicePrincipal: vi.fn().mockResolvedValue({
      principalId: "verified-observer",
      actorId: "live-map-observer",
      roles: ["ops_observer"],
      scopes: ["regulatory:read"],
      audience: "unit-api",
      authTime: now,
      ciTenantActorGrants: [],
    }),
  } as unknown as GoogleWorkloadIdentityAdapter;
  const controller = new AuthController(
    jwt,
    {} as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    repository,
    undefined,
    google,
  );
  return { repository, jwt, controller };
}

const request = {
  method: "POST",
  originalUrl: "/api/auth/token",
  headers: {
    "x-drts-google-id-token": "unit-proof-never-log",
    "x-actor-type": "ops_observer",
    "x-actor-id": "live-map-observer",
    "x-realm": "ops",
  },
};

it.each([
  ["principal", "principal_not_active"],
  ["inactive-principal", "principal_not_active"],
  ["membership", "membership_not_active"],
  ["inactive-membership", "membership_not_active"],
  ["wrong-realm", "membership_not_active"],
  ["role-binding", "role_binding_not_active"],
  ["wrong-role", "role_binding_not_active"],
  ["future-role", "role_binding_not_active"],
  ["expired-role", "role_binding_not_active"],
])(
  "rejects verified proof with %s using a stable 403 without issuing a session",
  async (missing, reason) => {
    const { controller, repository, jwt } = await fixture(missing);
    const warning = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    const issue = vi.spyOn(jwt, "issueSessionToken");
    await expect(controller.issueToken(request)).rejects.toMatchObject({
      status: 403,
      code: "WORKLOAD_SESSION_IDENTITY_UNAVAILABLE",
      response: {
        error: {
          code: "WORKLOAD_SESSION_IDENTITY_UNAVAILABLE",
          details: undefined,
        },
      },
    });
    expect(issue).not.toHaveBeenCalled();
    expect(
      await repository.listSessionsByPrincipal("verified-observer"),
    ).toEqual([]);
    expect(warning).toHaveBeenCalledWith(
      `[WORKLOAD_SESSION_IDENTITY_UNAVAILABLE] reason=${reason}`,
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain(
      "unit-proof-never-log",
    );
  },
);

it("keeps an existing verified principal and issues a durably verifiable observer session", async () => {
  const { controller, repository, jwt } = await fixture("none");
  const before = await repository.findPrincipalById("verified-observer");
  const result = await controller.issueToken(request);
  expect(await repository.findPrincipalById("verified-observer")).toEqual(
    before,
  );
  expect(await jwt.verifyAccessToken(result.token)).toMatchObject({
    principalId: "verified-observer",
    sub: "live-map-observer",
    roles: ["ops_observer"],
    scopes: ["regulatory:read"],
  });
});

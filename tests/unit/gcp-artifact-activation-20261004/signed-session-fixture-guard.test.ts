import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureDriverReimbursementBatchFixture,
  issueDriverSessionFixture,
  issueOpsSessionFixture,
  verifyPublicInfoVersionFixture,
} from "../../support/signed-session-fixture";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";

function collectSourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      // Product code only -- test/fixture directories are allowed to
      // reference this fixture (that is the whole point of it).
      if (/^(tests?|__tests__)$/.test(entry)) {
        return [];
      }
      return collectSourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path)
      ? [path]
      : [];
  });
}

describe("signed-session-fixture import boundary", () => {
  it("is never imported by product code under apps/**/src, packages/**/src, or operations/**", () => {
    const root = process.cwd();
    const productDirs = [
      ...readdirSync(join(root, "apps")).map((app) => join(root, "apps", app, "src")),
      ...readdirSync(join(root, "packages")).map((pkg) =>
        join(root, "packages", pkg, "src"),
      ),
      join(root, "operations"),
    ];

    const offenders = productDirs
      .flatMap((dir) => collectSourceFiles(dir))
      .filter((file) => readFileSync(file, "utf8").includes("signed-session-fixture"));

    expect(offenders.map((file) => file.replace(`${root}/`, ""))).toEqual([]);
  });
});

describe("signed-session-fixture issuance", () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalPrivateKey = process.env.JWT_PRIVATE_KEY;

  function configureSigningEnv() {
    process.env.JWT_SECRET = "signed-session-fixture-test-secret-32chars-minimum!";
    delete process.env.JWT_PRIVATE_KEY;
  }

  function restoreSigningEnv() {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    if (originalPrivateKey === undefined) delete process.env.JWT_PRIVATE_KEY;
    else process.env.JWT_PRIVATE_KEY = originalPrivateKey;
  }

  it("mints a driver session that the real repository-backed guard check (jwt-auth.service.ts#verifyAccessToken) accepts as a usable app session", async () => {
    configureSigningEnv();
    try {
      // Same repository instance issues and verifies, mirroring
      // bootstrap-auth.guard.ts:388-405's real caller: a `JwtAuthService`
      // constructed with an `IdentityRepository`, not the repo-less verifier
      // that only proves signature/claims and skips durable-state checks.
      const repo = new IdentityRepository();
      const fixture = await issueDriverSessionFixture({ identityRepository: repo });
      expect(fixture.token).toBeTruthy();

      const service = new JwtAuthService(repo);
      const payload = await service.verifyAccessToken(fixture.token);
      expect(payload).not.toBeNull();
      expect(payload?.realm).toBe("driver");
      expect(payload?.actorType).toBe("driver_user");
      expect(payload?.scopes).toEqual(["driver:read", "driver:write"]);
      expect(payload?.sid).toBe(fixture.sessionId);
    } finally {
      restoreSigningEnv();
    }
  });

  it("rejects a driver session's token against a verifier backed by a repository that never saw the session (wrong-identity case)", async () => {
    configureSigningEnv();
    try {
      const issuingRepo = new IdentityRepository();
      const fixture = await issueDriverSessionFixture({
        identityRepository: issuingRepo,
      });

      const unrelatedRepo = new IdentityRepository();
      const payload = await new JwtAuthService(unrelatedRepo).verifyAccessToken(
        fixture.token,
      );
      expect(payload).toBeNull();
    } finally {
      restoreSigningEnv();
    }
  });

  it("rejects a driver session once it has been revoked", async () => {
    configureSigningEnv();
    try {
      const repo = new IdentityRepository();
      const fixture = await issueDriverSessionFixture({ identityRepository: repo });
      const service = new JwtAuthService(repo);

      expect(await service.verifyAccessToken(fixture.token)).not.toBeNull();

      await repo.revokeSession(fixture.sessionId, "test_revocation");

      expect(await service.verifyAccessToken(fixture.token)).toBeNull();
    } finally {
      restoreSigningEnv();
    }
  });

  it("mints an ops session with billing:write and foundation:write that the real repository-backed guard check accepts as a usable app session", async () => {
    configureSigningEnv();
    try {
      const repo = new IdentityRepository();
      const fixture = await issueOpsSessionFixture({ identityRepository: repo });
      expect(fixture.token).toBeTruthy();

      const service = new JwtAuthService(repo);
      const payload = await service.verifyAccessToken(fixture.token);
      expect(payload).not.toBeNull();
      expect(payload?.realm).toBe("platform");
      expect(payload?.actorType).toBe("platform_admin");
      expect(payload?.scopes).toContain("billing:write");
      expect(payload?.scopes).toContain("foundation:write");
      expect(payload?.sid).toBe(fixture.sessionId);
    } finally {
      restoreSigningEnv();
    }
  });

  it("rejects an ops session once it has been revoked", async () => {
    configureSigningEnv();
    try {
      const repo = new IdentityRepository();
      const fixture = await issueOpsSessionFixture({ identityRepository: repo });
      const service = new JwtAuthService(repo);

      expect(await service.verifyAccessToken(fixture.token)).not.toBeNull();

      await repo.revokeSession(fixture.sessionId, "test_revocation");

      expect(await service.verifyAccessToken(fixture.token)).toBeNull();
    } finally {
      restoreSigningEnv();
    }
  });
});

function fakeResponse(status: number, body: unknown): Response {
  return {
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("ensureDriverReimbursementBatchFixture / verifyPublicInfoVersionFixture", () => {
  const originalBaseUrl = process.env.FIXTURE_API_BASE_URL;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.FIXTURE_API_BASE_URL = "https://fixture.example.test";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalBaseUrl === undefined) delete process.env.FIXTURE_API_BASE_URL;
    else process.env.FIXTURE_API_BASE_URL = originalBaseUrl;
  });

  it("throws without a baseUrl/FIXTURE_API_BASE_URL rather than guessing one", async () => {
    delete process.env.FIXTURE_API_BASE_URL;
    await expect(
      ensureDriverReimbursementBatchFixture({ opsToken: "test-ops-token" }),
    ).rejects.toThrow(/FIXTURE_API_BASE_URL/);
  });

  it("publishes the fixture fee plan, generates statements, and returns the resulting batch id (eligible-positive)", async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse(200, { data: { feePlanId: "fee-plan-1" } }))
      .mockResolvedValueOnce(
        fakeResponse(200, { data: { items: [], reimbursementBatchIds: ["reimbursement-1"] } }),
      );

    const fixture = await ensureDriverReimbursementBatchFixture({
      opsToken: "test-ops-token",
    });

    expect(fixture).toEqual({
      batchId: "reimbursement-1",
      driverId: "drv-demo-001",
      periodMonth: "2026-03",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [publishUrl, publishInit] = fetchMock.mock.calls[0];
    expect(publishUrl).toBe("https://fixture.example.test/api/driver-fee-plans/publish");
    expect(publishInit.headers.authorization).toBe("Bearer test-ops-token");
    const [generateUrl, generateInit] = fetchMock.mock.calls[1];
    expect(generateUrl).toBe("https://fixture.example.test/api/driver-statements/generate");
    expect(generateInit.headers["idempotency-key"]).toBe(
      "fixture-driver-statements-drv-demo-001-2026-03",
    );
  });

  it("treats an already-published fixture fee plan (409 FEE_PLAN_IMMUTABLE) as success, not a failure", async () => {
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse(409, { error: { code: "FEE_PLAN_IMMUTABLE", message: "immutable" } }),
      )
      .mockResolvedValueOnce(
        fakeResponse(200, { data: { items: [], reimbursementBatchIds: ["reimbursement-1"] } }),
      );

    const fixture = await ensureDriverReimbursementBatchFixture({
      opsToken: "test-ops-token",
    });
    expect(fixture.batchId).toBe("reimbursement-1");
  });

  it("surfaces a genuine fee-plan-publish failure without attempting statement generation (unknown/ineligible case)", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(403, { error: { code: "FORBIDDEN", message: "no billing:write scope" } }),
    );

    await expect(
      ensureDriverReimbursementBatchFixture({ opsToken: "test-ops-token" }),
    ).rejects.toThrow(/Failed to publish the fixture driver fee plan/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when statement generation produces no reimbursement batch (period/driver with no eligible trip)", async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse(200, { data: { feePlanId: "fee-plan-1" } }))
      .mockResolvedValueOnce(
        fakeResponse(200, { data: { items: [], reimbursementBatchIds: [] } }),
      );

    await expect(
      ensureDriverReimbursementBatchFixture({
        opsToken: "test-ops-token",
        driverId: "drv-unknown-999",
        periodMonth: "2026-01",
      }),
    ).rejects.toThrow(/produced no reimbursement batch/);
  });

  it("verifies an existing, published, non-retired public info version (eligible-positive)", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, {
        data: {
          items: [
            { versionId: "public-info-demo-001", status: "published", effectiveTo: null },
          ],
        },
      }),
    );

    const fixture = await verifyPublicInfoVersionFixture({ token: "test-ops-token" });
    expect(fixture).toEqual({ versionId: "public-info-demo-001" });
  });

  it("rejects an unknown/never-provisioned public info version id", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(200, { data: { items: [] } }));

    await expect(
      verifyPublicInfoVersionFixture({ token: "test-ops-token", versionId: "does-not-exist" }),
    ).rejects.toThrow(/does not exist on this deployment/);
  });

  it("rejects a public info version that exists but was never published (draft)", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, {
        data: {
          items: [{ versionId: "public-info-demo-001", status: "draft", effectiveTo: null }],
        },
      }),
    );

    await expect(
      verifyPublicInfoVersionFixture({ token: "test-ops-token" }),
    ).rejects.toThrow(/is not published/);
  });

  it("rejects a public info version that has already been retired", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, {
        data: {
          items: [
            {
              versionId: "public-info-demo-001",
              status: "published",
              effectiveTo: "2020-01-01T00:00:00.000Z",
            },
          ],
        },
      }),
    );

    await expect(
      verifyPublicInfoVersionFixture({ token: "test-ops-token" }),
    ).rejects.toThrow(/is retired/);
  });
});

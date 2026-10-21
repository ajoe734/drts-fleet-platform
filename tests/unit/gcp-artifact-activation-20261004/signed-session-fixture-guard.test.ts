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
import type { DatabaseService } from "../../../apps/api/src/common/db";

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

  // The globally registered SnakeCaseInterceptor serializes every real HTTP
  // response snake_case (apps/api/src/common/snake-case.interceptor.ts);
  // these fixtures mirror that wire shape (fee_plan_id/plan_name/version_id/
  // effective_to/reimbursement_batch_ids), never the internal camelCase
  // service field names -- a camelCase mock here would hide the exact P1
  // wire-format mismatch this test file exists to catch.
  const ourActivePlan = {
    fee_plan_id: "fee-plan-1",
    plan_name: "fixture-platform-funded-reimbursement",
    version: "v1",
    status: "published",
    service_fee_bps: 0,
    reimbursement_mode: "platform_funded",
  };

  // `databaseService: undefined` (DATABASE_URL-less default) hits the real
  // `DatabaseService`'s own `isEnabled() === false` branch, so
  // `waitForFeePlanPersistence` short-circuits to `true` without issuing any
  // query -- these DB-less fakes only need to cover the `isEnabled() ===
  // true` branch that models a real deployment's persistence outcome.
  function fakeDatabaseService(rows: unknown[]): DatabaseService {
    return {
      isEnabled: () => true,
      query: async () => ({ rows }),
    } as unknown as DatabaseService;
  }

  it("publishes the fixture fee plan when none exists, confirms activation via readback, generates statements, and returns the resulting batch id (eligible-positive / first publish)", async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse(200, { data: { items: [] } }))
      .mockResolvedValueOnce(fakeResponse(201, {}))
      .mockResolvedValueOnce(fakeResponse(200, { data: { items: [ourActivePlan] } }))
      .mockResolvedValueOnce(
        fakeResponse(200, { data: { items: [], reimbursement_batch_ids: ["reimbursement-1"] } }),
      );

    const fixture = await ensureDriverReimbursementBatchFixture({
      opsToken: "test-ops-token",
      databaseService: fakeDatabaseService([{ status: "published" }]),
    });

    expect(fixture).toEqual({
      batchId: "reimbursement-1",
      driverId: "drv-demo-001",
      periodMonth: "2026-03",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [firstListUrl, firstListInit] = fetchMock.mock.calls[0]!;
    expect(firstListUrl).toBe("https://fixture.example.test/api/driver-fee-plans");
    expect(firstListInit.headers.authorization).toBe("Bearer test-ops-token");
    const [publishUrl] = fetchMock.mock.calls[1]!;
    expect(publishUrl).toBe("https://fixture.example.test/api/driver-fee-plans/publish");
    const [confirmListUrl] = fetchMock.mock.calls[2]!;
    expect(confirmListUrl).toBe("https://fixture.example.test/api/driver-fee-plans");
    const [generateUrl, generateInit] = fetchMock.mock.calls[3]!;
    expect(generateUrl).toBe("https://fixture.example.test/api/driver-statements/generate");
    expect(generateInit.headers["idempotency-key"]).toBe(
      "fixture-driver-statements-drv-demo-001-2026-03",
    );
  });

  it("reuses an already-active fixture fee plan without publishing again (repeat)", async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse(200, { data: { items: [ourActivePlan] } }))
      .mockResolvedValueOnce(
        fakeResponse(200, { data: { items: [], reimbursement_batch_ids: ["reimbursement-1"] } }),
      );

    const fixture = await ensureDriverReimbursementBatchFixture({
      opsToken: "test-ops-token",
      databaseService: fakeDatabaseService([{ status: "published" }]),
    });

    expect(fixture.batchId).toBe("reimbursement-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).not.toContain("https://fixture.example.test/api/driver-fee-plans/publish");
  });

  it("rejects reusing an already-active fixture fee plan whose content disagrees with the fixture's promised economics (shadowed content)", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, {
        data: {
          items: [
            {
              ...ourActivePlan,
              service_fee_bps: 1500,
              reimbursement_mode: "mixed",
            },
          ],
        },
      }),
    );

    await expect(
      ensureDriverReimbursementBatchFixture({
        opsToken: "test-ops-token",
        databaseService: fakeDatabaseService([{ status: "published" }]),
      }),
    ).rejects.toThrow(/does not carry the fixture's expected content/);
    // Same name/version alone must not be enough to proceed into generation.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects when a previous run's publish never persisted, even though the cache still reports our plan active (retry after failed persist)", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(200, { data: { items: [ourActivePlan] } }));

    await expect(
      ensureDriverReimbursementBatchFixture({
        opsToken: "test-ops-token",
        databaseService: fakeDatabaseService([]),
        persistenceCheckAttempts: 2,
        persistenceCheckIntervalMs: 1,
      }),
    ).rejects.toThrow(/was not found in billing\.phase1_driver_fee_plans/);
    // isActivePlanOurs skips re-publishing; the DB check must still catch it
    // before any statement generation is attempted against the never-
    // persisted plan.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects when a different, more recently published fee plan shadows the fixture plan (conflicting existing plan)", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, {
        data: {
          items: [
            { fee_plan_id: "fee-plan-2", plan_name: "someone-elses-plan", version: "v9", status: "published" },
            ourActivePlan,
          ],
        },
      }),
    );

    await expect(
      ensureDriverReimbursementBatchFixture({ opsToken: "test-ops-token" }),
    ).rejects.toThrow(/different, more recently published fee plan/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects when publishing the fixture fee plan does not take effect by the confirmation readback (cache never shows it active)", async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse(200, { data: { items: [] } }))
      .mockResolvedValueOnce(fakeResponse(201, {}))
      .mockResolvedValueOnce(fakeResponse(200, { data: { items: [] } }));

    await expect(
      ensureDriverReimbursementBatchFixture({ opsToken: "test-ops-token" }),
    ).rejects.toThrow(/did not take effect/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects when the publish's database write never persists, even though the cache readback reports the plan active (genuine persistence failure)", async () => {
    // The real service updates its in-memory cache BEFORE awaiting the
    // actual database insert (billing-settlement.service.ts:2029-2030), and
    // the controller never awaits that insert either -- so the confirmation
    // GET right after POST legitimately reports our plan active even when
    // the underlying INSERT has failed or is still in flight. A GET that
    // instead fabricates `items: []` (the old version of this test) hides
    // that decisive behavior; this models the real cache response and
    // relies on the direct-database check to catch the failure.
    fetchMock
      .mockResolvedValueOnce(fakeResponse(200, { data: { items: [] } }))
      .mockResolvedValueOnce(fakeResponse(201, {}))
      .mockResolvedValueOnce(fakeResponse(200, { data: { items: [ourActivePlan] } }));

    await expect(
      ensureDriverReimbursementBatchFixture({
        opsToken: "test-ops-token",
        databaseService: fakeDatabaseService([]),
        persistenceCheckAttempts: 2,
        persistenceCheckIntervalMs: 1,
      }),
    ).rejects.toThrow(/was not found in billing\.phase1_driver_fee_plans/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("surfaces a genuine fee-plan readback failure without attempting publish (unknown/ineligible case)", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(403, { error: { code: "FORBIDDEN", message: "no billing:read scope" } }),
    );

    await expect(
      ensureDriverReimbursementBatchFixture({ opsToken: "test-ops-token" }),
    ).rejects.toThrow(/Failed to list driver fee plans/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when statement generation produces no reimbursement batch (period/driver with no eligible trip)", async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse(200, { data: { items: [] } }))
      .mockResolvedValueOnce(fakeResponse(201, {}))
      .mockResolvedValueOnce(fakeResponse(200, { data: { items: [ourActivePlan] } }))
      .mockResolvedValueOnce(
        fakeResponse(200, { data: { items: [], reimbursement_batch_ids: [] } }),
      );

    await expect(
      ensureDriverReimbursementBatchFixture({
        opsToken: "test-ops-token",
        driverId: "drv-unknown-999",
        periodMonth: "2026-01",
        // Must be explicit: this test's intent is the no-eligible-trip path
        // past a confirmed-persisted plan, not the DB-persistence guard
        // itself. Omitting this relies on DatabaseService's env-based
        // isEnabled() defaulting to false, which is only true when
        // DATABASE_URL is unset -- false in CI's `unit` job, where a real
        // Postgres is up for other tests in this same file/run and this
        // case would otherwise hit it and fail on the unrelated
        // "not found in billing.phase1_driver_fee_plans" guard instead.
        databaseService: fakeDatabaseService([{ status: "published" }]),
      }),
    ).rejects.toThrow(/produced no reimbursement batch/);
  });

  it("verifies an existing, published, non-retired public info version (eligible-positive)", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, {
        data: {
          items: [
            { version_id: "public-info-demo-001", status: "published", effective_to: null },
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
          items: [{ version_id: "public-info-demo-001", status: "draft", effective_to: null }],
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
              version_id: "public-info-demo-001",
              status: "published",
              effective_to: "2020-01-01T00:00:00.000Z",
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

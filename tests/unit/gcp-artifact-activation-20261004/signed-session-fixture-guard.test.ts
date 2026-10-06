import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  issueDriverSessionFixture,
  issueOpsSessionFixture,
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

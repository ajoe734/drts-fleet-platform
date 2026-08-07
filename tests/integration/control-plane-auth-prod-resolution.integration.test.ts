import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

describe("control-plane-auth production resolution regression", () => {
  const rootDir = resolve(__dirname, "../../");
  const pkgPath = join(rootDir, "packages/control-plane-auth/package.json");

  beforeAll(() => {
    const distJsPath = join(
      rootDir,
      "packages/control-plane-auth/dist/index.js",
    );
    if (!existsSync(distJsPath)) {
      execSync("pnpm --filter @drts/control-plane-auth build", {
        cwd: rootDir,
        stdio: "ignore",
      });
    }
  });

  it("package.json exports resolve to built JavaScript in production", () => {
    const pkgRaw = readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgRaw);

    expect(pkg.main).toBe("./dist/index.js");
    expect(pkg.types).toBe("./dist/index.d.ts");
    expect(pkg.type).toBe("commonjs");
    expect(pkg.exports["."]).toEqual({
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
      require: "./dist/index.js",
      default: "./dist/index.js",
    });
    expect(pkg.files).toContain("dist");
  });

  it("Node require.resolve on @drts/control-plane-auth resolves to dist/index.js and not src/index.ts", () => {
    const resolvedPath = require.resolve("@drts/control-plane-auth", {
      paths: [join(rootDir, "apps/api")],
    });
    expect(resolvedPath).not.toContain("/src/");
    expect(resolvedPath).toMatch(/dist[/\\]index\.js$/);
  });

  it("verifies built package dist output exists and exports required symbols", () => {
    const distJsPath = join(
      rootDir,
      "packages/control-plane-auth/dist/index.js",
    );
    expect(existsSync(distJsPath)).toBe(true);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(distJsPath);
    expect(typeof mod.extractIapJwtAssertion).toBe("function");
    expect(typeof mod.verifyIapJwtAssertion).toBe("function");
    expect(typeof mod.issueControlPlaneRequestAuth).toBe("function");
  });

  it("verifies production docker container resolves @drts/control-plane-auth to dist/index.js and starts API without ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING", () => {
    // The image is built by the CI job (and by `beforeAll` locally), not here.
    // Building inside the test meant a cold build had to finish within the
    // vitest budget, which is why this failed with "Test timed out" on branches
    // that never touched it.
    let dockerAvailable = false;
    try {
      execSync("docker info", { stdio: "ignore" });
      dockerAvailable = true;
    } catch {
      dockerAvailable = false;
    }

    let imageExists = false;
    try {
      execSync("docker image inspect drts-api:test", { stdio: "ignore" });
      imageExists = true;
    } catch {
      imageExists = false;
    }

    // Only the job that builds the image treats a missing one as a failure.
    // Every other consumer of this suite — Smoke acceptance, a local run —
    // skips, so the check never silently degrades where it is meant to run.
    const imageRequired = process.env.DRTS_REQUIRE_API_TEST_IMAGE === "1";

    if (!dockerAvailable || (!imageExists && !imageRequired)) {
      console.warn(
        !dockerAvailable
          ? "Skipping Docker smoke test: Docker daemon not available."
          : "Skipping Docker smoke test: drts-api:test not built in this job.",
      );
      return;
    }

    expect(
      imageExists,
      "drts-api:test is missing in the job that builds it. Locally run " +
        "`docker build -t drts-api:test -f apps/api/Dockerfile .` first.",
    ).toBe(true);

    // Test 1: Require resolution inside Docker container
    const resolutionOutput = execSync(
      `docker run --rm drts-api:test node -e "console.log(require.resolve('@drts/control-plane-auth'))"`,
      { encoding: "utf-8" },
    ).trim();

    expect(resolutionOutput).toContain(
      "node_modules/@drts/control-plane-auth/dist/index.js",
    );
    expect(resolutionOutput).not.toContain("/src/");

    // Test 2: Ensure no .ts files in control-plane-auth inside runtime image
    const hasTsOutput = execSync(
      `docker run --rm drts-api:test node -e "const fs = require('fs'); const hasSrc = fs.existsSync('./node_modules/@drts/control-plane-auth/src'); console.log(hasSrc);"`,
      { encoding: "utf-8" },
    ).trim();

    expect(hasTsOutput).toBe("false");

    // Test 3: Load iap-subject.adapter.js inside container (the exact failure location in incident 30732760923)
    const loadAdapterOutput = execSync(
      `docker run --rm drts-api:test node -e "require('./dist/modules/auth/iap-subject.adapter.js'); console.log('ADAPTER_LOADED_OK');"`,
      { encoding: "utf-8" },
    ).trim();

    expect(loadAdapterOutput).toContain("ADAPTER_LOADED_OK");
    // Three `docker run` invocations against an image that already exists.
  }, 120000);
});

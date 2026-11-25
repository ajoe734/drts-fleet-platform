import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const read = (...segments: string[]) =>
  fs.readFileSync(path.join(ROOT, ...segments), "utf8");
const workflow = read(".github", "workflows", "build-driver-ios.yml");
const driverEas = JSON.parse(read("apps", "driver-app", "eas.json"));

function stepRun(name: string): string {
  const match = new RegExp(
    `- name: ${name}\\n(?:[ ]{8}[^\\n]+\\n)*?[ ]{8}run: \\|\\n((?:[ ]{10}.*\\n|[ ]*\\n)+)`,
  ).exec(workflow);
  if (!match?.[1]) throw new Error(`No step "${name}"`);
  return match[1].replace(/^ {10}/gm, "");
}

describe("driver native build", () => {
  let dir = "";
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "driver-native-build-"));
    for (const file of ["app.json", "eas.json"])
      fs.copyFileSync(
        path.join(ROOT, "apps", "driver-app", file),
        path.join(dir, file),
      );
    fs.writeFileSync(path.join(dir, "github-env"), "");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const run = (name: string, env: Record<string, string> = {}) =>
    execFileSync("bash", ["-c", stepRun(name)], {
      cwd: dir,
      stdio: "pipe",
      timeout: 10_000,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        GITHUB_ENV: path.join(dir, "github-env"),
        WORKFLOW_MODE: "build",
        BUILD_PLATFORM: "android",
        BUILD_PROFILE: "preview",
        BUILD_API_URL: "https://api.example.test",
        EXPO_TOKEN: "fixture",
        DRIVER_APP_EAS_PROJECT_ID: "fixture-project",
        SUBMIT_TO_TESTFLIGHT: "false",
        ...env,
      },
    });
  const guard = "Guard credentials, project linkage, and inputs";
  const prepare = "Prepare ephemeral EAS configuration";
  const build = "Build on EAS without publishing the build page";
  const requireKeys =
    "Require the native map keys before consuming EAS capacity";

  it("pins a Node and pnpm the repository's strict engines accept, in every profile", () => {
    const engines = JSON.parse(read("package.json")).engines;
    expect(read(".npmrc")).toContain("engine-strict=true");
    expect(engines).toEqual({ node: "22.x", pnpm: ">=10.33.0" });
    for (const [name, profile] of Object.entries<Record<string, string>>(
      driverEas.build,
    )) {
      const base = profile.extends ? driverEas.build[profile.extends] : profile;
      expect(base.node, name).toMatch(/^22\./);
      expect(base.pnpm, name).toBe("10.33.0");
    }
  });

  it("accepts Android and keeps the store submission and simulator iOS only", () => {
    run(guard);
    run(guard, { BUILD_PLATFORM: "ios", SUBMIT_TO_TESTFLIGHT: "false" });
    expect(() => run(guard, { BUILD_PLATFORM: "web" })).toThrow();
    expect(() =>
      run(guard, { BUILD_PROFILE: "development-simulator" }),
    ).toThrow();
    expect(() =>
      run(guard, { BUILD_PROFILE: "production", SUBMIT_TO_TESTFLIGHT: "true" }),
    ).toThrow();
    run(guard, {
      BUILD_PLATFORM: "ios",
      BUILD_PROFILE: "production",
      SUBMIT_TO_TESTFLIGHT: "true",
    });
  });

  it("passes the map keys to the remote builder and stops when one is missing", () => {
    run(prepare, {
      GOOGLE_MAPS_ANDROID_KEY: " android-key\n",
      GOOGLE_MAPS_IOS_KEY: "ios-key",
    });
    const built = JSON.parse(
      fs.readFileSync(path.join(dir, "eas.json"), "utf8"),
    );
    expect(built.build.preview.env).toEqual({
      EXPO_PUBLIC_API_URL: "https://api.example.test",
      DRTS_REQUIRE_LIVE_MAP: "true",
      GOOGLE_MAPS_ANDROID_KEY: "android-key",
      GOOGLE_MAPS_IOS_KEY: "ios-key",
    });
    run(requireKeys, {
      GOOGLE_MAPS_ANDROID_KEY: "a",
      GOOGLE_MAPS_IOS_KEY: "b",
    });
    expect(() =>
      run(requireKeys, {
        GOOGLE_MAPS_ANDROID_KEY: " ",
        GOOGLE_MAPS_IOS_KEY: "b",
      }),
    ).toThrow();
  });

  it("bundles the app before the build and redacts map keys", () => {
    const order = [
      "Require the native map keys before consuming EAS capacity",
      "Prepare ephemeral EAS configuration",
      "Validate resolved native build configuration",
      "Bundle the app before consuming EAS capacity",
      build,
    ].map((name) => workflow.indexOf(`- name: ${name}\n`));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const name of [
      "Validate resolved native build configuration",
      "Bundle the app before consuming EAS capacity",
    ])
      expect(stepRun(name)).toMatch(
        /2>&1 \|\n\s*sed -E 's\/AIza\[0-9A-Za-z_-\]\{20,\}/,
      );
  });

  const BUILD_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const BUILD_PAGE = `https://expo.dev/accounts/a/projects/p/builds/${BUILD_ID}`;
  const DEVICE = "00008030-001A2B3C4D5E6F70";
  const MAP_KEY = `AIza${"k".repeat(35)}`;

  function runBuild(result: unknown, exitCode = 0, artifact = "PK-app") {
    const bin = path.join(dir, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify(result));
    fs.writeFileSync(
      path.join(bin, "npx"),
      `#!/usr/bin/env bash\nprintf '%s\\n' "Build details: ${BUILD_PAGE}" "Apple Team ABCDE12345 (Example Company)" "- ${DEVICE} iPhone" "Error: ${BUILD_PAGE} key ${MAP_KEY} device ${DEVICE}" >&2\ncat "${dir}/result.json"\nexit ${exitCode}\n`,
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(bin, "curl"),
      artifact
        ? `#!/usr/bin/env bash\nwhile [[ $# -gt 0 ]]; do [[ $1 == --output ]] && printf '${artifact}' > "$2"; shift; done; true\n`
        : "#!/usr/bin/env bash\necho curl failed >&2; exit 22\n",
      { mode: 0o755 },
    );
    const outcome = spawnSync("bash", ["-c", stepRun(build)], {
      cwd: dir,
      encoding: "utf8",
      timeout: 10_000,
      env: {
        PATH: `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
        RUNNER_TEMP: dir,
        BUILD_PLATFORM: "android",
        BUILD_PROFILE: "preview",
      },
    });
    const output = `${outcome.stdout}${outcome.stderr}`;
    for (const secret of [
      BUILD_ID,
      "expo.dev",
      MAP_KEY,
      "Example Company",
      DEVICE,
    ])
      expect(output).not.toContain(secret);
    return { status: outcome.status, output };
  }
  const built = (fields: Record<string, unknown>) => [
    {
      id: BUILD_ID,
      platform: "ANDROID",
      status: "FINISHED",
      buildProfile: "preview",
      distribution: "INTERNAL",
      appVersion: "0.1.0",
      appBuildVersion: "1",
      gitCommitHash: "a".repeat(40),
      artifacts: { applicationArchiveUrl: `${BUILD_PAGE}/app.apk` },
      ...fields,
    },
  ];

  it("reports a finished build and its hash without the build id, page or key", () => {
    const { status, output } = runBuild(built({}));
    expect(status).toBe(0);
    expect(output).toContain("status=FINISHED");
    expect(output).toContain(`commit=${"a".repeat(40)}`);
    expect(output).toContain("artifact_bytes=6");
    expect(output).toMatch(/artifact_sha256=[0-9a-f]{64}/);
  });

  it("fails on an errored build, still without the page", () => {
    const errored = runBuild(
      built({
        status: "ERRORED",
        artifacts: {},
        error: {
          errorCode: "UNKNOWN_ERROR",
          message: `See ${BUILD_PAGE} or expo.dev/b/1 build ${BUILD_ID} ${MAP_KEY}`,
        },
      }),
      1,
    );
    expect(errored.status).not.toBe(0);
    expect(errored.output).toContain("status=ERRORED");
    expect(errored.output).toContain(
      "error=UNKNOWN_ERROR: See [URL] or [URL] build [ID] [REDACTED_MAP_KEY]",
    );
  });

  it("fails on a cancelled build", () => {
    const { status, output } = runBuild(
      built({ status: "CANCELED", artifacts: {} }),
    );
    expect(status).not.toBe(0);
    expect(output).toContain("status=CANCELED");
  });

  it.each(["<html>sign in</html>", ""])(
    "does not hash a sign-in page or a refused download (%j)",
    (artifact) => {
      const { status, output } = runBuild(built({}), 0, artifact);
      expect(status).toBe(0);
      expect(output).toContain("::warning::The build finished");
      expect(output).not.toContain("artifact_sha256");
    },
  );

  it("stops before EAS when the prepared profile holds no map keys", () => {
    run(prepare);
    const bin = path.join(dir, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "npx"), "#!/usr/bin/env bash\necho ran\n", {
      mode: 0o755,
    });
    const PATH = `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`;
    const validate = "Validate resolved native build configuration";
    expect(() => run(validate, { PATH })).toThrow();
    for (const file of ["app.json", "eas.json"])
      fs.copyFileSync(
        path.join(ROOT, "apps", "driver-app", file),
        path.join(dir, file),
      );
    run(prepare, { GOOGLE_MAPS_ANDROID_KEY: "a", GOOGLE_MAPS_IOS_KEY: "b" });
    expect(String(run(validate, { PATH }))).toContain("ran");
  });

  it("prints a redacted reason when EAS returns no build", () => {
    const none = runBuild([], 1);
    expect(none.status).not.toBe(0);
    expect(none.output).toContain(
      "Error: [URL] key [REDACTED_MAP_KEY] device [DEVICE]",
    );
  });

  it("fails with the CLI's own code even when it reports a finished build", () => {
    expect(runBuild(built({}), 7).status).toBe(7);
  });
});

import { execFileSync } from "node:child_process";
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

  it("bundles the app before queueing and never echoes a map key", () => {
    const bundle = workflow.indexOf("- name: Bundle the app before");
    expect(bundle).toBeGreaterThan(0);
    expect(bundle).toBeLessThan(
      workflow.indexOf("- name: Queue EAS native build"),
    );
    for (const name of [
      "Validate resolved native build configuration",
      "Bundle the app before consuming EAS capacity",
      "Queue EAS native build",
    ])
      expect(stepRun(name).trim()).toMatch(
        /\|\nsed -E 's\/AIza\[0-9A-Za-z_-\]\{20,\}\/\[REDACTED_MAP_KEY\]\/g'$|\|\n\s*sed -E 's\/AIza\[0-9A-Za-z_-\]\{20,\}\/\[REDACTED_MAP_KEY\]\/g'$/,
      );
  });
});

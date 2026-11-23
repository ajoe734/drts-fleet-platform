import { execFileSync } from "node:child_process";
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DRIVER_APP_DIR = path.join(REPO_ROOT, "apps", "driver-app");
const WORKFLOW_PATH = path.join(
  REPO_ROOT,
  ".github",
  "workflows",
  "build-driver-ios.yml",
);

const REGISTERED_PROD_ORIGIN = "https://api.smarttransport.tw";
const REGISTERED_DEV_ORIGIN = "https://drts-dev-api-r6ykdme3wa-uc.a.run.app";
const HISTORICAL_DIRECT_ORIGIN = "https://drts-api-kdhu6wzufa-uc.a.run.app";
const FIXTURE_TASK_ID = "fixture-task";
const FIXTURE_ORDER_ID = "fixture-order";
const FIXTURE_PROJECT_ID = "00000000-0000-4000-8000-000000000001";

function extractWorkflowStepRun(
  workflowText: string,
  stepName: string,
): string {
  const escaped = stepName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `- name: ${escaped}\\n(?:[ ]{8}[^\\n]+\\n)*?[ ]{8}run: \\|\\n((?:[ ]{10}.*\\n|[ ]*\\n)+)`,
  ).exec(workflowText);
  if (!match?.[1]) {
    throw new Error(`Unable to extract step "${stepName}" from workflow`);
  }
  return match[1]
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n");
}

type CaseExecutionResult = {
  eas_profile: string;
  preflight_health_url: string | null;
  profile_origin: string;
  manifest_origin: string;
  synthetic_order_request: string;
  matches_registered_origin: boolean;
};

describe("DRIVER-NATIVE-PRODUCTION-ORDER-API-20261123", () => {
  let suiteTempDir = "";
  let sharedFixtureDir = "";
  let guardScript = "";
  let verifyHealthScript = "";
  let prepareScript = "";

  beforeAll(() => {
    suiteTempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "driver-prod-order-api-test-"),
    );
    sharedFixtureDir = path.join(suiteTempDir, "fixture");
    fs.mkdirSync(sharedFixtureDir, { recursive: true });

    fs.symlinkSync(
      path.join(DRIVER_APP_DIR, "node_modules"),
      path.join(sharedFixtureDir, "node_modules"),
    );

    for (const filename of ["app.config.ts", "package.json"]) {
      fs.copyFileSync(
        path.join(DRIVER_APP_DIR, filename),
        path.join(sharedFixtureDir, filename),
      );
    }

    const projectRequire = Module.createRequire(
      path.join(DRIVER_APP_DIR, "package.json"),
    );
    const ts = projectRequire("typescript") as typeof import("typescript");
    const compilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    };

    const driverClientSource = fs.readFileSync(
      path.join(DRIVER_APP_DIR, "lib", "api-client.ts"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sharedFixtureDir, "driver-client.cjs"),
      ts.transpileModule(driverClientSource, { compilerOptions }).outputText,
    );

    const apiClientDir = path.join(sharedFixtureDir, "api-client");
    fs.mkdirSync(apiClientDir, { recursive: true });
    const srcApiClientDir = path.join(
      REPO_ROOT,
      "packages",
      "api-client",
      "src",
    );
    for (const entry of fs.readdirSync(srcApiClientDir)) {
      if (!entry.endsWith(".ts")) continue;
      const srcText = fs.readFileSync(
        path.join(srcApiClientDir, entry),
        "utf8",
      );
      const outName = entry.replace(/\.ts$/, ".js");
      fs.writeFileSync(
        path.join(apiClientDir, outName),
        ts.transpileModule(srcText, { compilerOptions }).outputText,
      );
    }

    const wfText = fs.readFileSync(WORKFLOW_PATH, "utf8");
    guardScript = extractWorkflowStepRun(
      wfText,
      "Guard credentials, project linkage, and inputs",
    );
    verifyHealthScript = extractWorkflowStepRun(
      wfText,
      "Verify API target before consuming EAS capacity",
    );
    prepareScript = extractWorkflowStepRun(
      wfText,
      "Prepare ephemeral EAS configuration",
    );
  });

  afterAll(() => {
    if (suiteTempDir && fs.existsSync(suiteTempDir)) {
      fs.rmSync(suiteTempDir, { recursive: true, force: true });
    }
  });

  function runOrderOriginCase(options: {
    profile: string;
    apiUrlOverride?: string;
    useWorkflow: boolean;
    submit: boolean;
    prodRuntimeApiOrigin?: string;
    mutateFixtureBeforeProbe?: (fixtureDir: string) => void;
  }): CaseExecutionResult {
    for (const filename of ["app.json", "eas.json"]) {
      fs.copyFileSync(
        path.join(DRIVER_APP_DIR, filename),
        path.join(sharedFixtureDir, filename),
      );
    }

    const stubBinDir = path.join(sharedFixtureDir, "stub-bin");
    fs.mkdirSync(stubBinDir, { recursive: true });
    const capturedCurlLog = path.join(
      sharedFixtureDir,
      "captured-curl-url.txt",
    );
    if (fs.existsSync(capturedCurlLog)) {
      fs.unlinkSync(capturedCurlLog);
    }
    const stubCurlPath = path.join(stubBinDir, "curl");
    fs.writeFileSync(
      stubCurlPath,
      `#!/usr/bin/env bash\nset -euo pipefail\nlast_arg="\${@: -1}"\nprintf '%s' "$last_arg" > "${capturedCurlLog}"\n`,
      { mode: 0o755 },
    );

    const githubEnv = path.join(sharedFixtureDir, "github-env");
    fs.writeFileSync(githubEnv, "");
    const env: NodeJS.ProcessEnv = {
      GITHUB_ENV: githubEnv,
      PATH: `${stubBinDir}${path.delimiter}${process.env.PATH || "/usr/bin:/bin"}`,
      HOME: sharedFixtureDir,
      CI: "1",
      EXPO_OFFLINE: "1",
      WORKFLOW_MODE: "build",
      BUILD_PROFILE: options.profile,
      EXPO_TOKEN: "fixture-token",
      DRIVER_APP_EAS_PROJECT_ID: FIXTURE_PROJECT_ID,
      BUILD_API_URL: options.apiUrlOverride ?? "",
      DEV_CONTROL_PLANE_API_ORIGIN: REGISTERED_DEV_ORIGIN,
      SUBMIT_TO_TESTFLIGHT: String(options.submit),
      ...(options.prodRuntimeApiOrigin
        ? { PROD_RUNTIME_API_ORIGIN: options.prodRuntimeApiOrigin }
        : {}),
    };

    let preflightHealthUrl: string | null = null;
    if (options.useWorkflow) {
      for (const script of [guardScript, verifyHealthScript, prepareScript]) {
        execFileSync("bash", ["-c", script], {
          cwd: sharedFixtureDir,
          env,
          stdio: "pipe",
          timeout: 10000,
        });
        for (const line of fs
          .readFileSync(githubEnv, "utf8")
          .trim()
          .split("\n")) {
          if (line.startsWith("BUILD_API_URL=")) {
            env.BUILD_API_URL = line.slice("BUILD_API_URL=".length);
          }
        }
      }
      if (fs.existsSync(capturedCurlLog)) {
        preflightHealthUrl = fs.readFileSync(capturedCurlLog, "utf8").trim();
      }
    }

    if (options.mutateFixtureBeforeProbe) {
      options.mutateFixtureBeforeProbe(sharedFixtureDir);
    }

    const runnerScript = path.join(sharedFixtureDir, "run-probe.cjs");
    fs.writeFileSync(
      runnerScript,
      `const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const fs = require("node:fs");
const { createRequire } = Module;

const root = ${JSON.stringify(REPO_ROOT)};
const fixture = process.argv[2];
const profile = process.argv[3];
const projectRequire = createRequire(path.join(root, "apps/driver-app/package.json"));
const expoRequire = createRequire(projectRequire.resolve("expo/package.json"));
const { getConfig } = expoRequire("@expo/config");

const config = JSON.parse(fs.readFileSync(path.join(fixture, "eas.json"), "utf8"));
let profileConfig = config.build[profile];
if (profileConfig.extends && config.build[profileConfig.extends]) {
  profileConfig = {
    ...config.build[profileConfig.extends],
    ...profileConfig,
    env: {
      ...(config.build[profileConfig.extends].env || {}),
      ...(profileConfig.env || {}),
    },
  };
}
const env = profileConfig.env || {};
Object.assign(process.env, env);
process.env.GOOGLE_MAPS_ANDROID_KEY = "fixture-android";
process.env.GOOGLE_MAPS_IOS_KEY = "fixture-ios";

const { exp } = getConfig(fixture, { skipPlugins: true });
const nativeRequire = Module._load;
Module._load = function (id, parent, isMain) {
  if (id === "expo-constants") return { expoConfig: exp };
  if (id === "expo-secure-store") return {
    getItemAsync: async (key) =>
      key === "drts.driver.session"
        ? JSON.stringify({ driverId: "fixture-driver", accessToken: "fixture-session" })
        : null,
  };
  if (id === "@drts/api-client") return require(path.join(fixture, "api-client/index.js"));
  return nativeRequire.call(this, id, parent, isMain);
};

let target = null;
global.fetch = async (url, options) => {
  assert.equal(options.method, "GET");
  assert.equal(new Headers(options.headers).get("Authorization"), "Bearer fixture-session");
  assert.equal(new URL(url).pathname, "/api/driver/tasks/${FIXTURE_TASK_ID}/order");
  target = String(url);
  return Response.json({ data: { id: "${FIXTURE_ORDER_ID}" } });
};

(async () => {
  const driver = require(path.join(fixture, "driver-client.cjs"));
  await driver.initializeDriverIdentity();
  const response = await driver.getDriverClient().getDriverTaskOrder("${FIXTURE_TASK_ID}");
  assert.equal(response.id, "${FIXTURE_ORDER_ID}");
  process.stdout.write(
    JSON.stringify({
      eas_profile: profile,
      profile_origin: env.EXPO_PUBLIC_API_URL ?? null,
      manifest_origin: exp.extra.apiBaseUrl,
      synthetic_order_request: target,
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
    );

    const rawOut = execFileSync(
      process.execPath,
      [runnerScript, sharedFixtureDir, options.profile],
      {
        env,
        encoding: "utf8",
        timeout: 30000,
      },
    );
    const parsed = JSON.parse(rawOut) as {
      eas_profile: string;
      profile_origin: string;
      manifest_origin: string;
      synthetic_order_request: string;
    };

    return {
      ...parsed,
      preflight_health_url: preflightHealthUrl,
      matches_registered_origin:
        new URL(parsed.synthetic_order_request).origin ===
        REGISTERED_PROD_ORIGIN,
    };
  }

  it("routes ordinary GitHub workflow production builds (including TestFlight submit) and direct EAS production builds to https://api.smarttransport.tw for getDriverTaskOrder", () => {
    const prodPrefill = runOrderOriginCase({
      profile: "production",
      useWorkflow: true,
      submit: false,
    });
    expect(prodPrefill).toEqual({
      eas_profile: "production",
      preflight_health_url: `${REGISTERED_PROD_ORIGIN}/health`,
      profile_origin: REGISTERED_PROD_ORIGIN,
      manifest_origin: REGISTERED_PROD_ORIGIN,
      synthetic_order_request: `${REGISTERED_PROD_ORIGIN}/api/driver/tasks/${FIXTURE_TASK_ID}/order`,
      matches_registered_origin: true,
    });

    const prodPrefillSubmit = runOrderOriginCase({
      profile: "production",
      useWorkflow: true,
      submit: true,
    });
    expect(prodPrefillSubmit).toEqual({
      eas_profile: "production",
      preflight_health_url: `${REGISTERED_PROD_ORIGIN}/health`,
      profile_origin: REGISTERED_PROD_ORIGIN,
      manifest_origin: REGISTERED_PROD_ORIGIN,
      synthetic_order_request: `${REGISTERED_PROD_ORIGIN}/api/driver/tasks/${FIXTURE_TASK_ID}/order`,
      matches_registered_origin: true,
    });

    const prodExplicitRegistered = runOrderOriginCase({
      profile: "production",
      apiUrlOverride: REGISTERED_PROD_ORIGIN,
      useWorkflow: true,
      submit: false,
    });
    expect(prodExplicitRegistered).toEqual({
      eas_profile: "production",
      preflight_health_url: `${REGISTERED_PROD_ORIGIN}/health`,
      profile_origin: REGISTERED_PROD_ORIGIN,
      manifest_origin: REGISTERED_PROD_ORIGIN,
      synthetic_order_request: `${REGISTERED_PROD_ORIGIN}/api/driver/tasks/${FIXTURE_TASK_ID}/order`,
      matches_registered_origin: true,
    });

    const directProduction = runOrderOriginCase({
      profile: "production",
      useWorkflow: false,
      submit: false,
    });
    expect(directProduction).toEqual({
      eas_profile: "production",
      preflight_health_url: null,
      profile_origin: REGISTERED_PROD_ORIGIN,
      manifest_origin: REGISTERED_PROD_ORIGIN,
      synthetic_order_request: `${REGISTERED_PROD_ORIGIN}/api/driver/tasks/${FIXTURE_TASK_ID}/order`,
      matches_registered_origin: true,
    });
  }, 30000);

  it("preserves explicit custom production HTTPS API URLs and preview/development build targets", () => {
    const customProdOrigin = "https://stage-driver-api.smarttransport.tw";
    const prodExplicitCustom = runOrderOriginCase({
      profile: "production",
      apiUrlOverride: `${customProdOrigin}/`,
      useWorkflow: true,
      submit: false,
    });
    expect(prodExplicitCustom).toEqual({
      eas_profile: "production",
      preflight_health_url: `${customProdOrigin}/health`,
      profile_origin: customProdOrigin,
      manifest_origin: customProdOrigin,
      synthetic_order_request: `${customProdOrigin}/api/driver/tasks/${FIXTURE_TASK_ID}/order`,
      matches_registered_origin: false,
    });

    const previewPrefill = runOrderOriginCase({
      profile: "preview",
      useWorkflow: true,
      submit: false,
    });
    expect(previewPrefill).toEqual({
      eas_profile: "preview",
      preflight_health_url: `${REGISTERED_DEV_ORIGIN}/health`,
      profile_origin: REGISTERED_DEV_ORIGIN,
      manifest_origin: REGISTERED_DEV_ORIGIN,
      synthetic_order_request: `${REGISTERED_DEV_ORIGIN}/api/driver/tasks/${FIXTURE_TASK_ID}/order`,
      matches_registered_origin: false,
    });

    const directDevelopmentSimulator = runOrderOriginCase({
      profile: "development-simulator",
      useWorkflow: false,
      submit: false,
    });
    expect(directDevelopmentSimulator).toEqual({
      eas_profile: "development-simulator",
      preflight_health_url: null,
      profile_origin: REGISTERED_DEV_ORIGIN,
      manifest_origin: REGISTERED_DEV_ORIGIN,
      synthetic_order_request: `${REGISTERED_DEV_ORIGIN}/api/driver/tasks/${FIXTURE_TASK_ID}/order`,
      matches_registered_origin: false,
    });
  }, 30000);

  it("enforces EXPO_PUBLIC_API_URL and manifest extra.apiBaseUrl precedence while preventing fallback to the historical direct Cloud Run URL", () => {
    const nativeLoad = (
      Module as unknown as {
        _load: (id: string, parent: unknown, isMain: boolean) => unknown;
      }
    )._load;
    let driverClientMod: {
      resolveDriverApiBaseUrl: (options?: {
        envApiUrl?: string;
        manifestApiBaseUrl?: string;
      }) => string;
    };
    (
      Module as unknown as {
        _load: (id: string, parent: unknown, isMain: boolean) => unknown;
      }
    )._load = function (id: string, parent: unknown, isMain: boolean) {
      if (id === "expo-constants") {
        return {
          expoConfig: { extra: { apiBaseUrl: REGISTERED_PROD_ORIGIN } },
        };
      }
      if (id === "expo-secure-store") {
        return {
          getItemAsync: async () => null,
          setItemAsync: async () => undefined,
          deleteItemAsync: async () => undefined,
        };
      }
      if (id === "@drts/api-client") {
        return nativeLoad.call(
          this,
          path.join(sharedFixtureDir, "api-client", "index.js"),
          parent,
          isMain,
        );
      }
      return nativeLoad.call(this, id, parent, isMain);
    };
    try {
      const fixtureRequire = Module.createRequire(
        path.join(sharedFixtureDir, "package.json"),
      );
      driverClientMod = fixtureRequire(
        path.join(sharedFixtureDir, "driver-client.cjs"),
      );
    } finally {
      (
        Module as unknown as {
          _load: (id: string, parent: unknown, isMain: boolean) => unknown;
        }
      )._load = nativeLoad;
    }

    const { resolveDriverApiBaseUrl } = driverClientMod;

    // Explicit env wins over manifest
    expect(
      resolveDriverApiBaseUrl({
        envApiUrl: "https://custom-env.smarttransport.tw/",
        manifestApiBaseUrl: REGISTERED_PROD_ORIGIN,
      }),
    ).toBe("https://custom-env.smarttransport.tw");

    // Empty, whitespace, or historical direct URL in env falls through to manifest
    expect(
      resolveDriverApiBaseUrl({
        envApiUrl: "   ",
        manifestApiBaseUrl: REGISTERED_PROD_ORIGIN,
      }),
    ).toBe(REGISTERED_PROD_ORIGIN);

    expect(
      resolveDriverApiBaseUrl({
        envApiUrl: HISTORICAL_DIRECT_ORIGIN,
        manifestApiBaseUrl: REGISTERED_PROD_ORIGIN,
      }),
    ).toBe(REGISTERED_PROD_ORIGIN);

    // Historical direct URL in both env and manifest falls back to registered production origin
    expect(
      resolveDriverApiBaseUrl({
        envApiUrl: `${HISTORICAL_DIRECT_ORIGIN}/`,
        manifestApiBaseUrl: HISTORICAL_DIRECT_ORIGIN,
      }),
    ).toBe(REGISTERED_PROD_ORIGIN);

    expect(
      resolveDriverApiBaseUrl({
        envApiUrl: undefined,
        manifestApiBaseUrl: undefined,
      }),
    ).toBe(REGISTERED_PROD_ORIGIN);

    // Also verify via actual getDriverTaskOrder when eas.json profile env has legacy direct URL
    const fallbackFromLegacyEnv = runOrderOriginCase({
      profile: "production",
      useWorkflow: false,
      submit: false,
      mutateFixtureBeforeProbe: (fixtureDir) => {
        const easPath = path.join(fixtureDir, "eas.json");
        const eas = JSON.parse(fs.readFileSync(easPath, "utf8"));
        eas.build.production.env.EXPO_PUBLIC_API_URL = HISTORICAL_DIRECT_ORIGIN;
        fs.writeFileSync(easPath, JSON.stringify(eas, null, 2));
      },
    });
    expect(fallbackFromLegacyEnv.manifest_origin).toBe(REGISTERED_PROD_ORIGIN);
    expect(fallbackFromLegacyEnv.synthetic_order_request).toBe(
      `${REGISTERED_PROD_ORIGIN}/api/driver/tasks/${FIXTURE_TASK_ID}/order`,
    );
    expect(fallbackFromLegacyEnv.matches_registered_origin).toBe(true);
  }, 30000);

  it("preserves live map key enforcement, location/camera permissions, deep link domains, and lookup-existing workflow mode", async () => {
    const resolveAppConfig = (
      await import("../../../apps/driver-app/app.config")
    ).default;

    const prevAndroid = process.env.GOOGLE_MAPS_ANDROID_KEY;
    const prevIos = process.env.GOOGLE_MAPS_IOS_KEY;
    const prevRequireMap = process.env.DRTS_REQUIRE_LIVE_MAP;
    const prevApiUrl = process.env.EXPO_PUBLIC_API_URL;
    const prevReviewBase = process.env.EXPO_PUBLIC_REVIEW_BASE_PATH;

    try {
      process.env.DRTS_REQUIRE_LIVE_MAP = "true";
      delete process.env.GOOGLE_MAPS_ANDROID_KEY;
      delete process.env.GOOGLE_MAPS_IOS_KEY;
      expect(() => resolveAppConfig()).toThrow(
        /GOOGLE_MAPS_ANDROID_KEY and GOOGLE_MAPS_IOS_KEY are required/,
      );

      process.env.GOOGLE_MAPS_ANDROID_KEY = "android-map-key-123";
      process.env.GOOGLE_MAPS_IOS_KEY = "ios-map-key-456";
      process.env.EXPO_PUBLIC_API_URL = HISTORICAL_DIRECT_ORIGIN;
      process.env.EXPO_PUBLIC_REVIEW_BASE_PATH = "/review-driver";

      const resolved = resolveAppConfig();
      expect(resolved.extra?.apiBaseUrl).toBe(REGISTERED_PROD_ORIGIN);
      expect(resolved.android?.config?.googleMaps?.apiKey).toBe(
        "android-map-key-123",
      );
      expect(resolved.ios?.config?.googleMapsApiKey).toBe("ios-map-key-456");
      expect(resolved.experiments?.baseUrl).toBe("/review-driver");
      expect(resolved.ios?.associatedDomains).toContain(
        "applinks:api.smarttransport.tw",
      );
      expect(resolved.android?.permissions).toEqual(
        expect.arrayContaining([
          "ACCESS_BACKGROUND_LOCATION",
          "FOREGROUND_SERVICE",
          "FOREGROUND_SERVICE_LOCATION",
        ]),
      );
    } finally {
      if (prevAndroid === undefined) delete process.env.GOOGLE_MAPS_ANDROID_KEY;
      else process.env.GOOGLE_MAPS_ANDROID_KEY = prevAndroid;
      if (prevIos === undefined) delete process.env.GOOGLE_MAPS_IOS_KEY;
      else process.env.GOOGLE_MAPS_IOS_KEY = prevIos;
      if (prevRequireMap === undefined)
        delete process.env.DRTS_REQUIRE_LIVE_MAP;
      else process.env.DRTS_REQUIRE_LIVE_MAP = prevRequireMap;
      if (prevApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
      else process.env.EXPO_PUBLIC_API_URL = prevApiUrl;
      if (prevReviewBase === undefined)
        delete process.env.EXPO_PUBLIC_REVIEW_BASE_PATH;
      else process.env.EXPO_PUBLIC_REVIEW_BASE_PATH = prevReviewBase;
    }

    const wfText = fs.readFileSync(WORKFLOW_PATH, "utf8");
    expect(wfText).toContain(
      "PROD_RUNTIME_API_ORIGIN: ${{ vars.PROD_RUNTIME_API_ORIGIN }}",
    );
    expect(wfText).toContain("- lookup-existing");
    expect(wfText).toContain(
      "run: node operations/verification/native-existing-builds/lookup.cjs guard",
    );
    expect(wfText).toContain(
      "run: node operations/verification/native-existing-builds/lookup.cjs lookup",
    );
  });
});

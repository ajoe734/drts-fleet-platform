import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  deployArgs,
  AUTH_FIELDS,
  buildPlan,
} = require("../../../operations/verification/production-release-rail/rail.cjs");
const {
  verifyPublicEntry,
} = require("../../../operations/verification/production-release-rail/public-entry.cjs");
const {
  preflight,
  validators,
  validateArtifactRuntime,
  validateRuntime,
  validateSmokeHeaders,
} = require("../../../operations/verification/production-release-rail/preflight.cjs");
const {
  imageManifest,
  deploy,
  migrate,
  assertRevision,
  assertProbe,
  verify,
} = require("../../../operations/verification/production-release-rail/run.cjs");
const { fixture, SHA, TAG, DEPLOYER } = require("./fixture.cjs");
// Hosted CI uses shallow checkouts. Preserve the exact original git blobs,
// including provenance and content hashes, rather than requiring old objects.
const history = JSON.parse(
  readFileSync(new URL("./historical-sources.json", import.meta.url), "utf8"),
);
function historicalSource(commit: string, file: string): string {
  const snapshot = history.snapshots.find(
    (item: any) => item.commit === commit && item.path === file,
  );
  if (
    !snapshot ||
    createHash("sha256").update(snapshot.source).digest("hex") !==
      snapshot.sha256
  )
    throw new Error(`Missing or corrupt historical source: ${commit}:${file}`);
  return snapshot.source;
}
const ids = [
  "api",
  "platform-admin-web",
  "ops-console-web",
  "fleet-partner-portal-web",
  "tenant-console-web",
  "bank-console-web",
  "referral-embed-web",
  "enterprise-dispatch-web",
  "channel-partner-portal-web",
  "passenger-app-web",
];
const imagesFor = (plan: any) =>
  Object.fromEntries(
    plan.builds.map((b: any) => [
      b.id,
      `${plan.registry}/${b.id}@sha256:${"a".repeat(64)}`,
    ]),
  );
function candidate() {
  const f = fixture();
  return { ...f, plan: preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud) };
}
function publicResponse(service: any, pathname: string) {
  if (pathname === "/login")
    return { status: 200, body: "<html>登入智行叫車</html>" };
  if (pathname.endsWith("auth/providers"))
    return {
      status: 200,
      body: JSON.stringify({ data: { providers: ["google"] } }),
    };
  if (pathname.startsWith("/embed/"))
    return {
      status: 200,
      body: `<html>/embed/${service.publicEntry.entrySlug} fallback_to_web</html>`,
    };
  return service.id === "referral-embed-web"
    ? {
        status: 400,
        body: JSON.stringify({
          ok: false,
          error: { message: "UNAUTHORIZED: Active referral session required" },
        }),
      }
    : {
        status: 401,
        body: JSON.stringify({
          error: {
            code: "unauthorized",
            message: "An active passenger session is required.",
          },
        }),
      };
}
describe("F-ARTIFACT-PROVIDERS actual preflight and production factories", () => {
  it("reproduces seven discarded fields on the rejected 012 candidate and selects durable adapters after repair", async () => {
    // Keep the old helper's relative production-source loader rooted in this
    // repo. Product factories are unchanged between the two candidates.
    const dir = mkdtempSync(
      path.resolve("operations/verification/old-artifact-"),
    );
    try {
      for (const file of ["rail.cjs", "preflight.cjs", "public-entry.cjs"])
        writeFileSync(
          path.join(dir, file),
          historicalSource(
            "012215320817c4cfb8ca442d5b46755e9e03cff3",
            `operations/verification/production-release-rail/${file}`,
          ),
        );
      const old = require(path.join(dir, "preflight.cjs")),
        f = fixture();
      const oldPlan = old.preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud);
      const oldEnv = oldPlan.services[0].env,
        checks = validators();
      const fields = Object.keys(f.vars).filter((key) =>
        /^PROD_(DOCUMENT_|REMITTANCE_)/.test(key),
      );
      expect(fields).toHaveLength(7);
      for (const key of fields) expect(oldEnv[key.slice(5)]).toBeUndefined();
      const oldDocument = checks.document(oldEnv),
        oldStorage = checks.proofStorage(oldEnv);
      expect(oldDocument.constructor.name).toBe(
        "UnprovisionedDocumentArtifactStore",
      );
      await expect(
        oldDocument.get("diagnostic-no-real-object"),
      ).rejects.toThrow("Durable document artifact storage is not configured");
      expect(oldStorage.availability().state).toBe("unavailable");
      expect(checks.proofScanner(oldStorage, oldEnv).constructor.name).toBe(
        "UnprovisionedRemittanceProofScannerAdapter",
      );
      const plan = preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud),
        env = plan.services[0].env;
      for (const key of fields) expect(env[key.slice(5)]).toBe(f.vars[key]);
      const adapters = validateArtifactRuntime(env);
      expect(adapters.document.constructor.name).toBe(
        "GcsDocumentArtifactStoreAdapter",
      );
      expect(adapters.storage.constructor.name).toBe(
        "GcsRemittanceProofStorageAdapter",
      );
      expect(adapters.scanner.constructor.name).toBe(
        "CloudRunRemittanceProofScannerAdapter",
      );
      const args = deployArgs(plan, plan.services[0], imagesFor(plan).api);
      for (const key of fields)
        expect(args.join(" ")).toContain(`${key.slice(5)}=${f.vars[key]}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  const combinations = ["gcs", "s3"].flatMap((document) =>
    ["gcs", "s3"].flatMap((proof) =>
      ["cloud-run-clamd", "clamd"].map((scanner) => [document, proof, scanner]),
    ),
  );
  it.each(combinations)(
    "preserves actual %s document / %s proof / %s scanner settings and pinned secret mounts",
    (document, proof, scanner) => {
      const f = fixture();
      for (const key of Object.keys(f.vars))
        if (/^PROD_(DOCUMENT_|REMITTANCE_)/.test(key)) delete f.vars[key];
      for (const [prefix, provider] of [
        ["DOCUMENT_ARTIFACT", document],
        ["REMITTANCE_PROOF", proof],
      ] as const) {
        f.vars[`PROD_${prefix}_STORAGE_PROVIDER`] = provider;
        f.vars[`PROD_${prefix}_${provider.toUpperCase()}_BUCKET`] =
          "fixture-durable-bucket";
        if (provider === "s3") {
          f.vars[`PROD_${prefix}_S3_REGION`] = "us-east-1";
          f.vars[`PROD_${prefix}_S3_ENDPOINT`] = "https://storage.drts.invalid";
          f.vars[`PROD_${prefix}_S3_FORCE_PATH_STYLE`] = "true";
          for (const key of [
            "ACCESS_KEY_ID",
            "SECRET_ACCESS_KEY",
            "SESSION_TOKEN",
          ]) {
            const name = `${prefix.toLowerCase()}-${key.toLowerCase()}`;
            f.vars[`PROD_${prefix}_S3_${key}_SECRET`] = name;
            f.values[name] = `ephemeral-only-${name}-credential`;
          }
        }
      }
      f.vars.PROD_REMITTANCE_PROOF_SCANNER_PROVIDER = scanner;
      if (scanner === "cloud-run-clamd") {
        f.vars.PROD_REMITTANCE_PROOF_SCANNER_URL =
          "https://fixture-scanner.run.app";
        f.vars.PROD_REMITTANCE_PROOF_SCANNER_TIMEOUT_MS = "20000";
      } else {
        f.vars.PROD_REMITTANCE_PROOF_CLAMD_HOST = "scanner.internal";
        f.vars.PROD_REMITTANCE_PROOF_CLAMD_PORT = "3310";
        f.vars.PROD_REMITTANCE_PROOF_CLAMD_TIMEOUT_MS = "15000";
        f.vars.PROD_REMITTANCE_PROOF_CLAMD_TLS = "true";
      }
      const plan = preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud),
        api = plan.services[0];
      const env = {
        ...api.env,
        ...Object.fromEntries(
          Object.entries(api.secrets).map(([key, ref]) => [
            key,
            f.values[String(ref).replace(/:7$/, "")],
          ]),
        ),
      };
      const adapters = validateArtifactRuntime(env);
      expect(adapters.document.constructor.name).toBe(
        document === "gcs"
          ? "GcsDocumentArtifactStoreAdapter"
          : "S3DocumentArtifactStoreAdapter",
      );
      expect(adapters.storage.providerName).toBe(`${proof}-remittance-proof`);
      expect(adapters.scanner.providerName).toBe(
        scanner === "clamd" ? "clamd-instream" : scanner,
      );
      expect(adapters.storage.availability().state).toBe("available");
      expect(adapters.scanner.availability().state).toBe("available");
      const args = deployArgs(plan, api, imagesFor(plan).api).join(" ");
      for (const [key, value] of Object.entries(f.vars).filter(([key]) =>
        /^PROD_(DOCUMENT_|REMITTANCE_)/.test(key),
      )) {
        const field = key.slice(5);
        if (field.endsWith("_SECRET")) {
          expect(args).toContain(`${field.slice(0, -7)}=${value}:7`);
          expect(JSON.stringify(plan)).not.toContain(f.values[String(value)]);
        } else expect(args).toContain(`${field}=${value}`);
      }
    },
  );
  it.each([
    "PROD_DOCUMENT_ARTIFACT_STORAGE_PROVIDER",
    "PROD_DOCUMENT_ARTIFACT_GCS_BUCKET",
    "PROD_REMITTANCE_PROOF_STORAGE_PROVIDER",
    "PROD_REMITTANCE_PROOF_GCS_BUCKET",
    "PROD_REMITTANCE_PROOF_SCANNER_PROVIDER",
    "PROD_REMITTANCE_PROOF_SCANNER_URL",
    "PROD_REMITTANCE_PROOF_SCANNER_TIMEOUT_MS",
  ])(
    "rejects missing required artifact field %s before any cloud boundary",
    (key) => {
      const f = fixture();
      delete f.vars[key];
      expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(key);
      expect(f.calls).toEqual([]);
    },
  );
  it.each([
    ["PROD_DOCUMENT_ARTIFACT_STORAGE_PROVIDER", "memory"],
    ["PROD_DOCUMENT_ARTIFACT_STORAGE_PROVIDER", "unprovisioned"],
    ["PROD_REMITTANCE_PROOF_STORAGE_PROVIDER", "memory"],
    ["PROD_REMITTANCE_PROOF_STORAGE_PROVIDER", "unprovisioned"],
    ["PROD_REMITTANCE_PROOF_SCANNER_PROVIDER", "unprovisioned"],
    ["PROD_REMITTANCE_PROOF_SCANNER_PROVIDER", "eicar-signature"],
    ["PROD_REMITTANCE_PROOF_SCANNER_URL", "https://not-cloud-run.drts.invalid"],
    ["PROD_REMITTANCE_PROOF_SCANNER_TIMEOUT_MS", "60001"],
    ["PROD_REMITTANCE_PROOF_SCANNER_TIMEOUT_MS", "NaN"],
    ["PROD_DOCUMENT_ARTIFACT_GCS_BUCKET", "invalid/bucket"],
    [
      "PROD_DOCUMENT_ARTIFACT_S3_ACCESS_KEY_ID",
      "raw-credential-must-not-be-persisted",
    ],
    ["PROD_REMITTANCE_PROOF_CLAMD_HOST", "stale-unselected-scanner"],
  ])(
    "rejects unsafe or silently discarded artifact setting %s",
    (key, value) => {
      const f = fixture();
      f.vars[key] = value;
      expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(key);
      expect(f.calls).toEqual([]);
    },
  );
  it.each(["DOCUMENT_ARTIFACT", "REMITTANCE_PROOF"])(
    "rejects partial S3 %s settings including missing managed credential pairs",
    (prefix) => {
      const f = fixture();
      delete f.vars[`PROD_${prefix}_GCS_BUCKET`];
      const settings = {
        [`PROD_${prefix}_STORAGE_PROVIDER`]: "s3",
        [`PROD_${prefix}_S3_BUCKET`]: "durable-fixture",
        [`PROD_${prefix}_S3_REGION`]: "us-east-1",
        [`PROD_${prefix}_S3_FORCE_PATH_STYLE`]: "false",
        [`PROD_${prefix}_S3_ACCESS_KEY_ID_SECRET`]: "managed-access-key",
        [`PROD_${prefix}_S3_SECRET_ACCESS_KEY_SECRET`]: "managed-secret-key",
      };
      Object.assign(f.vars, settings);
      for (const key of Object.keys(settings).filter(
        (key) => !key.endsWith("STORAGE_PROVIDER"),
      )) {
        delete f.vars[key];
        expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
          key,
        );
        expect(f.calls).toEqual([]);
        f.vars[key] = settings[key];
      }
      f.vars[`PROD_${prefix}_S3_ENDPOINT`] = "http://insecure.drts.invalid";
      expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
        `${prefix}_S3_ENDPOINT`,
      );
      expect(f.calls).toEqual([]);
    },
  );
  it.each(["HOST", "PORT", "TIMEOUT_MS", "TLS"])(
    "rejects a partial native scanner missing %s before external reads",
    (suffix) => {
      const f = fixture();
      delete f.vars.PROD_REMITTANCE_PROOF_SCANNER_URL;
      delete f.vars.PROD_REMITTANCE_PROOF_SCANNER_TIMEOUT_MS;
      Object.assign(f.vars, {
        PROD_REMITTANCE_PROOF_SCANNER_PROVIDER: "clamd",
        PROD_REMITTANCE_PROOF_CLAMD_HOST: "scanner.internal",
        PROD_REMITTANCE_PROOF_CLAMD_PORT: "3310",
        PROD_REMITTANCE_PROOF_CLAMD_TIMEOUT_MS: "15000",
        PROD_REMITTANCE_PROOF_CLAMD_TLS: "true",
      });
      const key = `PROD_REMITTANCE_PROOF_CLAMD_${suffix}`;
      delete f.vars[key];
      expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(key);
      expect(f.calls).toEqual([]);
    },
  );
  it.each(["DOCUMENT_ARTIFACT", "REMITTANCE_PROOF"])(
    "executes the real %s factory in preflight to reject invalid GCS config beyond the rail's generic bucket shape",
    (prefix) => {
      const f = fixture();
      f.vars[`PROD_${prefix}_GCS_BUCKET`] = "gcs.dot.bucket";
      expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
        `${prefix}_ storage factory`,
      );
      expect(
        f.calls.every((call: string[]) =>
          ["public-policy", "actAs", "read"].includes(call[0] ?? ""),
        ),
      ).toBe(true);
    },
  );
  it.each([
    "DOCUMENT_ARTIFACT_STORAGE_PROVIDER",
    "REMITTANCE_PROOF_STORAGE_PROVIDER",
    "REMITTANCE_PROOF_SCANNER_PROVIDER",
  ])(
    "rejects unavailable real factory after removal of %s from a generated plan",
    (key) => {
      const f = candidate();
      delete f.plan.services[0].env[key];
      const values = Object.fromEntries(
        Object.entries(f.values).map(([name, value]) => [`${name}:7`, value]),
      );
      // Default values are cryptographic fixture inputs, not mocks of validators.
      for (const ref of Object.values(f.plan.services[0].secrets))
        values[String(ref)] ??= f.cloud.readSecret(
          String(ref).replace(/:7$/, ""),
          f.plan.project,
        ).value;
      expect(() => validateRuntime(f.plan, values)).toThrow(
        "adapter unavailable",
      );
    },
  );
});
describe("F-PUBLIC-ENTRY public customer boundary", () => {
  it("reproduces the rejected candidate's staff-only requirement using its actual builder", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "old-public-entry-"));
    try {
      const file = path.join(dir, "rail.cjs");
      writeFileSync(
        file,
        historicalSource(
          "d4dcd9d4acadf6dc8bb5fdda9a36c354047596da",
          "operations/verification/production-release-rail/rail.cjs",
        ),
      );
      const old = require(file),
        f = fixture();
      expect(() => old.buildPlan(f.vars, SHA, TAG, DEPLOYER)).toThrow(
        "PROD_REFERRAL_EMBED_IAP_CLIENT_ID",
      );
      expect(() => buildPlan(f.vars, SHA, TAG, DEPLOYER)).not.toThrow();
      const plan = preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud);
      expect(plan.publicEntryPolicies).toHaveLength(2);
      expect(
        plan.services
          .filter((s: any) => s.publicEntry)
          .every((s: any) => s.transportAudience === null),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it.each([undefined, "{}", "[]", "null", "invalid"])(
    "blocks missing/partial public policy evidence %s before cloud reads",
    (raw) => {
      const f = fixture();
      f.vars.PROD_PUBLIC_ENTRY_CONFIG_JSON = raw;
      expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
        "F-PUBLIC-ENTRY deployment blocker",
      );
      expect(f.calls).toEqual([]);
    },
  );
  it.each([
    ["mode", "staff-only"],
    ["mode", "public-run"],
    ["approvalRef", ""],
    ["backendService", ""],
    ["expectedProviders", []],
    ["expectedProviders", ["fake"]],
  ])("rejects unsafe customer entry setting %s", (key, value) => {
    const f = fixture(),
      config = JSON.parse(f.vars.PROD_PUBLIC_ENTRY_CONFIG_JSON);
    config["passenger-app-web"][key] = value;
    f.vars.PROD_PUBLIC_ENTRY_CONFIG_JSON = JSON.stringify(config);
    expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
      "F-PUBLIC-ENTRY",
    );
    expect(f.calls).toEqual([]);
  });
  it.each([
    "PROD_GOOGLE_OAUTH_CLIENT_ID",
    "PROD_GOOGLE_OAUTH_CLIENT_SECRET_SECRET",
    "PROD_OAUTH_REDIRECT_ALLOWLIST",
  ])("requires actual login wiring %s before builds", (key) => {
    const f = fixture();
    delete f.vars[key];
    expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(key);
    expect(f.calls).toEqual([]);
  });
  it("rejects public policy applied to a console and public Run IAM shortcut", () => {
    const f = fixture(),
      entries = JSON.parse(f.vars.PROD_PUBLIC_ENTRY_CONFIG_JSON);
    entries["ops-console-web"] = entries["passenger-app-web"];
    f.vars.PROD_PUBLIC_ENTRY_CONFIG_JSON = JSON.stringify(entries);
    expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
      "only referral and passenger",
    );
    const other = fixture();
    other.vars.PROD_PASSENGER_APP_ALLOW_UNAUTHENTICATED = "true";
    expect(() =>
      preflight(other.vars, SHA, TAG, DEPLOYER, other.cloud),
    ).toThrow("private backend");
    expect(other.calls).toEqual([]);
  });
  it("rejects a wrong passenger callback and mismatched referral host before external reads", () => {
    const f = fixture();
    f.vars.PROD_OAUTH_REDIRECT_ALLOWLIST =
      "https://tenant-console-web.drts.invalid/auth/callback/google";
    expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
      "passenger callback",
    );
    expect(f.calls).toEqual([]);
    const other = fixture();
    other.vars.PROD_REFERRAL_EMBED_ALLOWED_HOSTS = "other.drts.invalid";
    expect(() =>
      preflight(other.vars, SHA, TAG, DEPLOYER, other.cloud),
    ).toThrow("entryHost allowlist");
    expect(other.calls).toEqual([]);
  });
  it("rejects workload/operator headers as substitutes for signed customer session fixtures", () => {
    const { plan, headers } = candidate();
    for (const id of ["passenger-app-web", "referral-embed-web"]) {
      const changed = structuredClone(headers);
      changed[id] = { "x-drts-google-id-token": "operator-only" };
      expect(() => validateSmokeHeaders(plan, JSON.stringify(changed))).toThrow(
        `${id} header`,
      );
    }
  });
  it("blocks required phone login on the actual unconfigured production SMS adapter before rollout", () => {
    const f = fixture(),
      config = JSON.parse(f.vars.PROD_PUBLIC_ENTRY_CONFIG_JSON);
    config["passenger-app-web"].expectedProviders = ["phone"];
    f.vars.PROD_PUBLIC_ENTRY_CONFIG_JSON = JSON.stringify(config);
    f.vars.PROD_PASSENGER_OTP_PEPPER_SECRET = "drts-prod-otp-pepper";
    expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
      "SMS_PORT adapter unavailable",
    );
  });
  it.each([
    "unavailable",
    "staff-only",
    "google-users-only",
    "conditional",
    "iap-off",
    "wrong-backend",
    "tagged-backend",
    "public-run",
    "wrong-agent",
    "ingress-all",
    "iam-disabled",
  ])(
    "blocks external policy %s before secrets/build/migration/deploy",
    (fault) => {
      const f = fixture();
      f.cloud.publicEntryRead = (args: string[]) => {
        if (fault === "unavailable") throw Error("external read denied");
        const value = JSON.parse(f.policyRead(args));
        if (args[0] === "iap") {
          if (fault === "staff-only")
            value.bindings[0].members = ["group:staff@drts.invalid"];
          if (fault === "google-users-only")
            value.bindings[0].members = ["allAuthenticatedUsers"];
          if (fault === "conditional")
            value.bindings[0].condition = { expression: "true" };
        }
        if (fault === "iap-off" && value.iap) value.iap.enabled = false;
        if (fault === "wrong-backend" && value.cloudRun)
          value.cloudRun.service = "drts-prod-ops-console-web";
        if (fault === "tagged-backend" && value.cloudRun)
          value.cloudRun.tag = "old-release";
        if (args[0] === "run" && args[2] === "get-iam-policy") {
          if (fault === "public-run")
            value.bindings[0].members.push("allUsers");
          if (fault === "wrong-agent")
            value.bindings[0].members = ["serviceAccount:wrong@drts.invalid"];
        }
        if (value.metadata) {
          if (fault === "ingress-all")
            value.metadata.annotations["run.googleapis.com/ingress"] = "all";
          if (fault === "iam-disabled")
            value.metadata.annotations[
              "run.googleapis.com/invoker-iam-disabled"
            ] = "true";
        }
        return JSON.stringify(value);
      };
      expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
        "F-PUBLIC-ENTRY deployment blocker",
      );
      expect(f.calls).toEqual([]);
    },
  );
  it.each(["passenger-app-web", "referral-embed-web"])(
    "probes anonymous entry and data denial for %s without employee tokens",
    async (id) => {
      const { plan } = candidate(),
        service = plan.services.find((s: any) => s.id === id),
        calls: any[] = [];
      const evidence = await verifyPublicEntry(
        service,
        async (url: string, options: any) => {
          calls.push(options);
          const value = publicResponse(service, new URL(url).pathname);
          return { status: value.status, text: async () => value.body };
        },
      );
      expect(evidence.map((r: any) => r.kind)).toContain(
        "anonymous-data-denied",
      );
      expect(evidence.map((r: any) => r.kind)).toContain(
        "invalid-session-denied",
      );
      expect(
        calls.slice(0, -1).every((o) => Object.keys(o.headers).length === 0),
      ).toBe(true);
      expect(calls.at(-1).headers.Cookie).toContain("pax_session=invalid");
      expect(
        calls.every(
          (o) =>
            o.redirect === "manual" &&
            !o.headers.Authorization &&
            !o.headers["x-drts-google-id-token"],
        ),
      ).toBe(true);
    },
  );
  it.each([
    "staff-login",
    "generic-login",
    "wrong-providers",
    "empty-providers",
    "personal-data",
    "edge-denial",
    "invalid-session-accepted",
  ])("rejects false public-entry success %s", async (fault) => {
    const { plan } = candidate(),
      service = plan.services.find((s: any) => s.id === "passenger-app-web");
    await expect(
      verifyPublicEntry(service, async (url: string, options: any) => {
        const pathname = new URL(url).pathname,
          value = publicResponse(service, pathname);
        if (fault === "staff-login" && pathname === "/login")
          value.status = 302;
        if (fault === "generic-login" && pathname === "/login")
          value.body = "<html>Google sign in</html>";
        if (
          ["wrong-providers", "empty-providers"].includes(fault) &&
          pathname.endsWith("providers")
        )
          value.body = JSON.stringify({
            data: {
              providers: fault === "empty-providers" ? [] : ["facebook"],
            },
          });
        if (fault === "personal-data" && pathname.endsWith("/me")) {
          value.status = 200;
          value.body = JSON.stringify({ data: { passengerId: "leaked" } });
        }
        if (fault === "edge-denial" && pathname.endsWith("/me")) {
          value.status = 403;
          value.body = "IAP forbidden";
        }
        if (
          fault === "invalid-session-accepted" &&
          pathname.endsWith("/me") &&
          options.headers.Cookie
        ) {
          value.status = 200;
          value.body = JSON.stringify({ data: { passengerId: "leaked" } });
        }
        return { status: value.status, text: async () => value.body };
      }),
    ).rejects.toThrow("F-PUBLIC-ENTRY");
  });
});
describe("production complete topology and strict startup rail", () => {
  it("executes the old deployment arguments and reproduces the three-service defect and strict startup failure", () => {
    const source = historicalSource(SHA, ".github/workflows/deploy-prod.yml");
    const jobs = JSON.parse(
      execFileSync(
        "python3",
        [
          "-c",
          "import json,sys,yaml; print(json.dumps(yaml.safe_load(sys.stdin.read())['jobs']))",
        ],
        { input: source, encoding: "utf8" },
      ),
    );
    const steps = jobs.deploy.steps.filter((s: any) =>
      s.name?.startsWith("Deploy —"),
    );
    const recorded: string[][] = [];
    for (const step of steps) {
      const script = step.run.replace(/\$\{\{[^}]+\}\}/g, "fixture");
      const output = execFileSync(
        "bash",
        [
          "-c",
          `gcloud() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1:]))' "$@"; }; ${script}`,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            PROJECT_ID: "fixture",
            REGION: "us-central1",
            API_SERVICE: "api",
            PLATFORM_ADMIN_SERVICE: "platform-admin-web",
            OPS_CONSOLE_SERVICE: "ops-console-web",
            SECRET_PREFIX: "fixture",
            CLOUDSQL: "fixture",
            MAP_PROVIDER_BACKEND: "mock",
          },
        },
      );
      recorded.push(JSON.parse(output.trim()));
    }
    expect(recorded.map((args) => args[2])).toEqual(ids.slice(0, 3));
    expect(recorded).toHaveLength(3);
    const apiArgs = recorded[0]!;
    const oldEnv = Object.fromEntries(
      apiArgs[apiArgs.indexOf("--set-env-vars") + 1]!.split(",").map((pair) =>
        pair.split("="),
      ),
    );
    const report = validators().auth(oldEnv);
    expect(report.valid).toBe(false);
    expect(report.issues.map((i: any) => i.control)).toEqual(
      expect.arrayContaining([
        "OIDC_CLIENT_ID",
        "COOKIE_SECRET",
        "CSRF_SECRET",
        "PASSENGER_SUBJECT_PEPPER",
      ]),
    );
  });
  it("executes the real preflight, deploy and migration builders with all ten ports and immutable source", () => {
    const { plan } = candidate();
    expect(plan.services.map((s: any) => s.id)).toEqual(ids);
    expect(plan.services.map((s: any) => s.port)).toEqual([
      3001, 3002, 3003, 3007, 3004, 3008, 3014, 3010, 3013, 3009,
    ]);
    expect(plan.builds).toHaveLength(11);
    const commands: string[][] = [];
    const cloud = (args: string[]) => {
      commands.push(args);
      return "[]";
    };
    deploy(plan, imagesFor(plan), cloud);
    const deployments = commands.filter((args) => args[1] === "deploy");
    expect(deployments).toHaveLength(10);
    for (const args of deployments) {
      expect(args).toContain("--no-allow-unauthenticated");
      expect(args[args.indexOf("--ingress") + 1]).toBe(
        "internal-and-cloud-load-balancing",
      );
      expect(args[args.indexOf("--image") + 1]).toMatch(
        /@sha256:[a-f0-9]{64}$/,
      );
      expect(args[args.indexOf("--set-env-vars") + 1]).toContain(
        `DRTS_CANDIDATE_SHA=${SHA}`,
      );
      if (args.includes("--set-secrets"))
        expect(args[args.indexOf("--set-secrets") + 1]).not.toContain(
          ":latest",
        );
    }
    const pax = plan.services.find((s: any) => s.id === "passenger-app-web");
    expect(pax.secrets).toEqual({});
    expect(pax.env.DRTS_API_AUTH_AUDIENCE).toBe(
      plan.services[0].transportAudience,
    );
    expect(pax.env).not.toHaveProperty("NEXT_PUBLIC_API_URL");
    expect(
      plan.services.find((s: any) => s.id === "referral-embed-web").secrets,
    ).toHaveProperty("REFERRAL_EMBED_SESSION_SECRET");
    expect(
      plan.services.find((s: any) => s.id === "bank-console-web").secrets,
    ).toHaveProperty("BANK_SESSION_SECRET");
    commands.length = 0;
    migrate(plan, imagesFor(plan), cloud);
    expect(commands.filter((args) => args[2] === "execute")).toHaveLength(1);
    expect(commands.find((args) => args[2] === "create")).toContain(
      "--max-retries",
    );
  });
  it.each(AUTH_FIELDS as string[])(
    "rejects missing PROD_%s before any cloud boundary",
    (field: string) => {
      const f = fixture();
      delete f.vars[`PROD_${field}`];
      expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
        `PROD_${field}`,
      );
      expect(f.calls).toEqual([]);
    },
  );
  it.each([
    ["PROD_GCP_PASSENGER_APP_SERVICE", ""],
    ["PROD_AUTH_MODE", "mock"],
    ["PROD_JWT_ALGORITHMS", "none"],
    ["PROD_OIDC_TOKEN_ENDPOINT", "http://localhost/token"],
    ["PROD_AUTH_ALLOWED_ORIGINS", "*"],
    ["PROD_OPS_CONSOLE_ALLOW_UNAUTHENTICATED", "true"],
    ["PROD_GCP_API_SERVICE", "drts-partner-booking-web"],
    ["PROD_GCP_RUNTIME_SERVICE_ACCOUNT", DEPLOYER],
    ["PROD_MAP_TILE_URL_TEMPLATE", "http://tiles/{x}/{y}/{z}"],
  ])("rejects unsafe/partial config %s before rollout", (key, value) => {
    const f = fixture();
    f.vars[key] = value;
    expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow();
    expect(f.calls).toEqual([]);
  });
  it.each([
    "jwt-secret",
    "cookie-secret",
    "csrf-secret",
    "passenger-subject-pepper",
    "passenger-ride-token-pepper",
    "workload-identity-service-principals",
    "workload-identity-google-service-principals",
  ])(
    "rejects absent/invalid secret %s through real production validation",
    (suffix) => {
      const f = fixture();
      f.values[`drts-prod-${suffix}`] = "";
      expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow();
      f.values[`drts-prod-${suffix}`] = "weak";
      expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow();
    },
  );
  it("rejects a mismatched Google runtime audience and route registry", () => {
    for (const patch of [
      {
        serviceAccountEmail: "other@drts-prod-fixture.iam.gserviceaccount.com",
      },
      { allowedTokenAudiences: ["wrong"] },
      { routeScopes: ["/api/unrelated"] },
    ]) {
      const f = fixture();
      const name = "drts-prod-workload-identity-google-service-principals";
      f.values[name] = JSON.stringify([
        { ...JSON.parse(f.values[name])[0], ...patch },
      ]);
      expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
        /WORKLOAD_IDENTITY_GOOGLE/,
      );
    }
  });
  it("rejects a string masquerading as the custom registry audience array", () => {
    const f = fixture();
    f.vars.PROD_WORKLOAD_IDENTITY_AUDIENCE = "a";
    f.values["drts-prod-workload-identity-service-principals"] = JSON.stringify(
      [
        {
          principalId: "runtime",
          subject: "runtime",
          issuer: f.vars.PROD_WORKLOAD_IDENTITY_ISSUER,
          allowedTokenAudiences: "a",
        },
      ],
    );
    expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
      "WORKLOAD_IDENTITY_SERVICE_PRINCIPALS",
    );
  });
  it.each([
    "workload-identity-service-principals",
    "bank-iap-jwt-public-key",
    "bank-artifact-signing-private-key",
    "bank-artifact-signing-public-key",
    "bank-artifact-signing-key-id",
    "bank-session-secret",
    "bff-state-secret",
    "referral-embed-session-secret",
  ])("rejects incomplete or unusable managed %s before mutation", (suffix) => {
    const f = fixture();
    f.values[`drts-prod-${suffix}`] = "";
    expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow();
    if (suffix !== "bank-artifact-signing-key-id") {
      f.values[`drts-prod-${suffix}`] = "invalid-configured-value";
      expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow();
    }
  });
  it.each([
    "PROD_DRTS_FLEET_PARTNER_ID",
    "PROD_DRTS_PARTNER_ID",
    "PROD_DRTS_TENANT_ID",
    "PROD_DRTS_PARTNER_PROGRAM_ID",
    "PROD_DRTS_PARTNER_ENTRY_SLUG",
    "PROD_DRTS_ENTERPRISE_DISPATCH_TENANT_ID",
    "PROD_DRTS_ENTERPRISE_DISPATCH_ACTOR_ID",
    "PROD_IAP_EXPECTED_AUDIENCE",
    "PROD_BANK_IAP_AUDIENCE",
  ])("rejects missing actual caller setting %s", (key) => {
    const f = fixture();
    delete f.vars[key];
    expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(key);
    expect(f.calls).toEqual([]);
  });
  it("does not confuse IAP assertion audiences or anonymous context with authenticated smoke", () => {
    const f = fixture();
    f.vars.PROD_IAP_EXPECTED_AUDIENCE = f.vars.PROD_IAP_CLIENT_ID;
    expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
      "IAP_EXPECTED_AUDIENCE",
    );
    const g = fixture();
    g.smoke.api.expect = { "data.authMode": "bootstrap_headers" };
    g.vars.PROD_RELEASE_SMOKE_CONFIG_JSON = JSON.stringify(g.smoke);
    expect(() => preflight(g.vars, SHA, TAG, DEPLOYER, g.cloud)).toThrow(
      "authenticated principal predicate",
    );
  });
  it.each([
    { PROD_PSP_PROVIDER: "fake" },
    { PROD_PAX_PAYMENT_CAPTURE_ENABLED: "true" },
    { PROD_PAX_PAYMENT_CAPTURE_ENABLED: "arbitrary" },
    { PROD_PASSENGER_OTP_TRUSTED_PROXY_HOPS: "999" },
    { PROD_REMOTE_SMTP_HOST: "mail.drts.invalid" },
    { PROD_PAX_PAYMENT_RECOVERY_NOTICE_EXPIRES_AT: "2000-01-01" },
  ])(
    "uses actual passenger startup rejection without guessing payment policy: %j",
    (patch) => {
      const f = fixture();
      Object.assign(f.vars, patch);
      expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow();
    },
  );
  it("freezes versions without persisting secret values and keeps unavailable optional providers unavailable", () => {
    const { plan, values } = candidate();
    const text = JSON.stringify(plan);
    for (const value of Object.values(values))
      expect(text).not.toContain(value);
    expect(plan.services[0].env).not.toHaveProperty("PSP_PROVIDER");
    expect(plan.services[0].env).not.toHaveProperty(
      "PAX_PAYMENT_CAPTURE_POLICY",
    );
    expect(plan.services[0].env.SESSION_STORE_TYPE).toBe("durable");
    expect(plan.services[0].secrets.DATABASE_URL).toMatch(/:7$/);
  });
  it("calls the Google map gate before emitting a plan and rejects a failing live gate", () => {
    const f = fixture();
    Object.assign(f.vars, {
      PROD_MAP_PROVIDER_BACKEND: "google",
      PROD_MAP_PROVIDER_ALLOWED_ORIGINS: f.vars.PROD_OPS_CONSOLE_ORIGIN,
      PROD_MAP_PROVIDER_MONTHLY_BUDGET_USD: "100",
      PROD_MAP_PROVIDER_BUDGET_ALERT_PCT: "50;80;95",
    });
    const plan = preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud);
    expect(f.calls.at(-1)).toEqual(["map-provider"]);
    expect(
      plan.services.find((s: any) => s.id === "ops-console-web").secrets
        .GOOGLE_MAPS_BROWSER_KEY,
    ).toMatch(/:7$/);
    f.cloud.checkMap = () => {
      throw new Error("provider gate rejected");
    };
    expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
      "provider gate rejected",
    );
  });
  it("does not turn missing IAM/secret reads into mutations", () => {
    const f = fixture();
    f.cloud.checkActAs = () => {
      throw Error("actAs denied");
    };
    expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
      "actAs denied",
    );
    expect(f.calls.every((call: any) => call[0] === "public-policy")).toBe(
      true,
    );
    const c = candidate();
    expect(() =>
      deployArgs(c.plan, c.plan.services[0], `${c.plan.registry}/api:${SHA}`),
    ).toThrow("immutable image");
    c.plan.services[0].secrets.JWT_SECRET = "drts-prod-jwt-secret:latest";
    expect(() =>
      deployArgs(c.plan, c.plan.services[0], imagesFor(c.plan).api),
    ).toThrow("pinned secret");
  });
  it("stops before deploying any web surface when the API runtime IAM binding fails", () => {
    const { plan } = candidate();
    const commands: string[][] = [];
    expect(() =>
      deploy(plan, imagesFor(plan), (args: string[]) => {
        commands.push(args);
        if (args.includes("add-iam-policy-binding"))
          throw new Error("IAM denied");
        return "";
      }),
    ).toThrow("IAM denied");
    expect(
      commands.filter((args) => args[1] === "deploy").map((args) => args[2]),
    ).toEqual([plan.services[0].name]);
  });
});

describe("exact release evidence and protected smoke", () => {
  function metadata(plan: any, service: any, image: string) {
    const status = {
      conditions: [{ type: "Ready", status: "True" }],
      latestCreatedRevisionName: "candidate-revision",
      latestReadyRevisionName: "candidate-revision",
      traffic: [{ revisionName: "candidate-revision", percent: 100 }],
    };
    const revision = {
      metadata: { name: "candidate-revision" },
      spec: {
        serviceAccountName: plan.runtime,
        containers: [
          { image, env: [{ name: "DRTS_CANDIDATE_SHA", value: SHA }] },
        ],
      },
      status: {
        conditions: [{ type: "Ready", status: "True" }],
        imageDigest: image,
      },
    };
    return { description: { status }, revision };
  }
  it("rejects old, unhealthy, mixed-traffic or different-image revisions despite a healthy process", () => {
    const { plan } = candidate(),
      service = plan.services[0],
      image = imagesFor(plan).api;
    const m = metadata(plan, service, image);
    expect(
      assertRevision(plan, service, image, m.description, m.revision).sourceSha,
    ).toBe(SHA);
    for (const mutation of [
      (x: any) => {
        x.description.status.conditions[0].status = "False";
      },
      (x: any) => {
        x.description.status.latestCreatedRevisionName = "other";
      },
      (x: any) => {
        x.description.status.traffic[0].revisionName = "old";
      },
      (x: any) => {
        x.revision.status.imageDigest = "different";
      },
      (x: any) => {
        x.revision.spec.containers[0].env[0].value = "old";
      },
    ]) {
      const changed = structuredClone(m);
      mutation(changed);
      expect(() =>
        assertRevision(
          plan,
          service,
          image,
          changed.description,
          changed.revision,
        ),
      ).toThrow();
    }
  });
  it("requires a full same-SHA digest manifest", () => {
    const { plan } = candidate();
    const dir = mkdtempSync(path.join(tmpdir(), "production-images-"));
    try {
      for (const b of plan.builds)
        writeFileSync(
          path.join(dir, `${b.id}.json`),
          JSON.stringify({
            id: b.id,
            sha: SHA,
            digest: `sha256:${"a".repeat(64)}`,
          }),
        );
      expect(Object.keys(imageManifest(plan, dir))).toHaveLength(11);
      writeFileSync(
        path.join(dir, "api.json"),
        JSON.stringify({
          id: "api",
          sha: "f".repeat(40),
          digest: `sha256:${"a".repeat(64)}`,
        }),
      );
      expect(() => imageManifest(plan, dir)).toThrow("identity");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("checks protected JSON/CSV contracts and rejects login redirects, generic 200 pages and forbidden actor headers", () => {
    const { plan, headers } = candidate();
    expect(() =>
      assertProbe(plan.services[0], { status: 200 }, "<html>Login</html>"),
    ).toThrow("JSON");
    expect(() => assertProbe(plan.services[0], { status: 302 }, "{}")).toThrow(
      "status",
    );
    expect(() =>
      assertProbe(
        plan.services[0],
        { status: 200 },
        '{"data":{"fixture":false}}',
      ),
    ).toThrow("contract");
    const bank = plan.services.find((s: any) => s.id === "bank-console-web");
    expect(() =>
      assertProbe(
        bank,
        { status: 200 },
        "Period,StatementNo,TripID,OrderNo,\n2026-10,fixture-001,trip,order",
      ),
    ).not.toThrow();
    expect(() =>
      assertProbe(
        bank,
        { status: 200 },
        "Period,StatementNo,TripID,OrderNo,\n2026-10,other,trip,order",
      ),
    ).toThrow("fixture");
    headers.api = { "x-actor-id": "fabricated" };
    expect(() => validateSmokeHeaders(plan, JSON.stringify(headers))).toThrow(
      "header",
    );
  });
  it("executes every service verification and produces one complete SHA artifact without tokens or response data", async () => {
    const { plan, headers, policyRead } = candidate(),
      images = imagesFor(plan);
    const reads: any[] = [],
      probes: any[] = [];
    let currentService = plan.services[0];
    const cloud = (args: string[]) => {
      reads.push(args);
      if (
        ["projects", "compute", "iap"].includes(args[0]!) ||
        args[2] === "get-iam-policy"
      )
        return policyRead(args);
      if (args[0] === "secrets") return JSON.stringify(headers);
      if (args[0] === "auth") return "opaque-transport-token";
      const service =
        plan.services.find((s: any) => s.name === args[3]) || plan.services[0];
      if (args[1] === "services") currentService = service;
      const m = metadata(plan, service, images[service.id]);
      return JSON.stringify(
        args[1] === "services"
          ? {
              ...m.description,
              metadata: {
                annotations: {
                  "run.googleapis.com/ingress":
                    "internal-and-cloud-load-balancing",
                },
              },
            }
          : metadata(plan, currentService, images[currentService.id]).revision,
      );
    };
    const request = async (url: string, options: any) => {
      const service = plan.services.find(
        (s: any) => new URL(url).origin === s.origin,
      );
      if (
        service.publicEntry &&
        options.headers.cookie !== headers[service.id].cookie
      ) {
        const value = publicResponse(service, new URL(url).pathname);
        return { status: value.status, text: async () => value.body };
      }
      probes.push({ id: service.id, options });
      return {
        status: 200,
        text: async () =>
          service.id === "bank-console-web"
            ? "Period,StatementNo,TripID,OrderNo,\n2026-10,fixture-001,trip,order"
            : JSON.stringify(
                service.probe.path.endsWith("identity/context")
                  ? {
                      data: {
                        principalId: "principal-fixture",
                        authMode: "jwt_bearer",
                      },
                    }
                  : { data: { fixture: true } },
              ),
      };
    };
    const evidence = await verify(plan, images, {
      cloud,
      request,
      sleep: async () => {},
    });
    expect(evidence.services.map((s: any) => s.service)).toEqual(ids);
    expect(
      probes.every(
        (p) =>
          p.options.redirect === "manual" &&
          (plan.services.find((s: any) => s.id === p.id).publicEntry
            ? !p.options.headers.Authorization
            : p.options.headers.Authorization ===
              "Bearer opaque-transport-token"),
      ),
    ).toBe(true);
    expect(reads.filter((r) => r[0] === "auth")).toHaveLength(8);
    expect(evidence.publicEntryPolicies).toHaveLength(2);
    expect(
      evidence.services
        .filter((s: any) => s.publicEntry)
        .map((s: any) => s.service),
    ).toEqual(["referral-embed-web", "passenger-app-web"]);
    expect(JSON.stringify(evidence)).not.toContain("opaque-transport-token");
    expect(JSON.stringify(evidence)).not.toContain("fixture-signed-session");
    expect(evidence.sourceSha).toBe(SHA);
  });
  it("keeps every workflow/helper checkout pinned and all mutation jobs environment protected", () => {
    const workflow = JSON.parse(
      execFileSync(
        "python3",
        [
          "-c",
          "import json,sys,yaml;print(json.dumps(yaml.safe_load(sys.stdin.read())))",
        ],
        {
          input: readFileSync(".github/workflows/deploy-prod.yml", "utf8"),
          encoding: "utf8",
        },
      ),
    );
    for (const [id, job] of Object.entries(workflow.jobs) as [string, any][]) {
      expect(job.environment).toBe("production");
      for (const step of job.steps.filter((s: any) =>
        s.uses?.startsWith("actions/checkout"),
      )) {
        expect(step.with.ref).toBe(
          id === "resolve-tag"
            ? "${{ github.sha }}"
            : id === "validate-config"
              ? "${{ needs.resolve-tag.outputs.source_sha }}"
              : "${{ needs.validate-config.outputs.source_sha }}",
        );
      }
    }
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
    expect(workflow.jobs.deploy.if).toContain(
      "needs.migrate.result == 'success'",
    );
  });
});

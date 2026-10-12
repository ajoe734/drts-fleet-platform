import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  deployArgs,
  AUTH_FIELDS,
} = require("../../../operations/verification/production-release-rail/rail.cjs");
const {
  preflight,
  validators,
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
describe("production complete topology and strict startup rail", () => {
  it("executes the old deployment arguments and reproduces the three-service defect and strict startup failure", () => {
    const source = execFileSync(
      "git",
      ["show", `${SHA}:.github/workflows/deploy-prod.yml`],
      { encoding: "utf8" },
    );
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
    expect(f.calls).toEqual([]);
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
    const { plan, headers } = candidate(),
      images = imagesFor(plan);
    const reads: any[] = [],
      probes: any[] = [];
    const cloud = (args: string[]) => {
      reads.push(args);
      if (args[0] === "secrets") return JSON.stringify(headers);
      if (args[0] === "auth") return "opaque-transport-token";
      const service =
        plan.services.find((s: any) => s.name === args[3]) || plan.services[0];
      const m = metadata(plan, service, images[service.id]);
      return JSON.stringify(
        args[1] === "services"
          ? m.description
          : metadata(
              plan,
              probes.length < ids.length
                ? plan.services[probes.length]
                : service,
              images[ids[probes.length]!],
            ).revision,
      );
    };
    const request = async (url: string, options: any) => {
      const service = plan.services.find(
        (s: any) => url === `${s.origin}${s.probe.path}`,
      );
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
          p.options.headers.Authorization === "Bearer opaque-transport-token",
      ),
    ).toBe(true);
    expect(reads.filter((r) => r[0] === "auth")).toHaveLength(10);
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
